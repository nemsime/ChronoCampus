import json

from app.db import models as m
from app.observability import telemetry as t
from app.scheduling.router import execute_run, recover_runs
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_workflow import campus as campus
from test_workflow import detail, draft, generate, login


def test_unhandled_exception_is_correlated_and_secret_free():
    app = FastAPI()
    app.add_middleware(t.RequestTelemetry)

    @app.get("/broken/{identifier}")
    def broken(identifier: str):
        raise RuntimeError("password=TOP-SECRET token=TOP-SECRET")

    with TestClient(app) as client:
        response = client.get(
            "/broken/PRIVATE-PATH?token=PRIVATE-QUERY",
            headers={"X-Request-ID": "ATTACKER", "Authorization": "SECRET-AUTH"},
        )
    assert response.status_code == 500
    identifier = response.headers["x-request-id"]
    assert len(identifier) == 32 and identifier != "ATTACKER"
    rows = t.events(request_id=identifier)["items"]
    encoded = json.dumps(rows)
    assert all(
        secret not in encoded
        for secret in (
            "TOP-SECRET",
            "PRIVATE-PATH",
            "PRIVATE-QUERY",
            "SECRET-AUTH",
            "ATTACKER",
        )
    )
    error = next(row for row in rows if row["event"] == "request.unhandled")
    assert error["exception_type"] == "RuntimeError"
    assert any(frame["function"] == "broken" for frame in error["frames"])
    assert (
        next(row for row in rows if row["event"] == "http.request")["route"]
        == "/broken/{identifier}"
    )


def test_diagnostics_role_boundaries_and_limits(admin_client, campus):
    for endpoint in ("system", "events", "requests", "audit", "metrics"):
        assert admin_client.get(f"/api/admin/diagnostics/{endpoint}").status_code == 200
    assert (
        admin_client.get("/api/admin/diagnostics/events?limit=1001").status_code == 422
    )
    assert admin_client.get("/api/admin/schedule/runs?limit=51").status_code == 422
    login(admin_client, "student@example.invalid")
    for endpoint in ("system", "events", "requests", "audit", "metrics"):
        assert admin_client.get(f"/api/admin/diagnostics/{endpoint}").status_code == 403
    rejected = admin_client.get("/api/admin/schedule/runs")
    assert rejected.status_code == 403
    assert any(
        row.get("error_code") == "administrator_required"
        for row in t.events(request_id=rejected.headers["x-request-id"])["items"]
    )
    admin_client.post("/api/auth/logout")
    assert admin_client.get("/api/admin/diagnostics/events").status_code == 401


def test_audit_is_atomic_and_excludes_personal_fields(admin_client, campus):
    response = admin_client.post(
        "/api/admin/catalog/subjects", json={"name": "PRIVATE-SUBJECT"}
    )
    assert response.status_code == 201
    db = campus["db"]
    row = db.scalar(
        select(m.AuditEvent).where(
            m.AuditEvent.request_id == response.headers["x-request-id"]
        )
    )
    assert row.action == "catalog.created" and row.actor_id == 1
    assert "PRIVATE-SUBJECT" not in json.dumps(row.changes)
    before = db.scalar(select(func.count()).select_from(m.AuditEvent))
    # Referenced subjects cannot be deleted; audit entry must roll back with the write.
    response = admin_client.delete(
        f"/api/admin/catalog/subjects/{campus['subject'].id}"
    )
    assert response.status_code == 409
    assert db.scalar(select(func.count()).select_from(m.AuditEvent)) == before
    response = admin_client.put(
        f"/api/admin/catalog/groups/{campus['group'].id}",
        json={
            "major_id": campus["major"].id,
            "group_code": "T1",
            "admission_year": 2026,
            "capacity": 30,
        },
    )
    assert response.status_code == 200
    row = db.scalar(
        select(m.AuditEvent).where(
            m.AuditEvent.request_id == response.headers["x-request-id"]
        )
    )
    assert row.changes["capacity"] == {"before": 20, "after": 30}


def test_run_history_progress_correlation_and_failed_run(
    admin_client, campus, monkeypatch
):
    v = draft(admin_client, campus)
    response = admin_client.post(
        f"/api/admin/schedule/versions/{v['id']}/generate",
        json={"revision": v["revision"]},
    )
    identifier = response.json()["id"]
    request_id = response.headers["x-request-id"]
    execute_run(*campus["pending"].pop())
    campus["db"].expire_all()
    result = admin_client.get(f"/api/admin/schedule/runs/{identifier}").json()
    assert result["status"] == "complete"
    assert result["request_id"] == request_id
    stages = [event["stage"] for event in result["progress"]["events"]]
    assert stages[0] == "preparing" and stages[-1] == "saving"
    assert "validating" in stages
    assert result["summary"]["placed"] == 4
    assert (
        result["started_at"] and result["finished_at"] and result["queue_seconds"] >= 0
    )
    history = admin_client.get(
        f"/api/admin/schedule/runs?version_id={v['id']}&limit=1"
    ).json()
    assert history["total"] == 1 and len(history["items"]) == 1
    assert "snapshot" not in history["items"][0]
    assert "assignments" not in history["items"][0]["result"]

    def broken(*args, **kwargs):
        raise RuntimeError("PRIVATE-SECRET")

    monkeypatch.setattr("app.scheduling.router.generate", broken)
    result = generate(admin_client, detail(admin_client, v)["version"], campus)
    assert result["status"] == "failed" and result["progress"]["stage"] == "failed"
    assert result["summary"]["placed"] is None and result["summary"]["total"] == 4
    assert "PRIVATE-SECRET" not in json.dumps(result)
    assert any(
        row["event"] == "generation.failed"
        for row in t.events(request_id=result["request_id"])["items"]
    )


def test_interrupted_run_retains_history(admin_client, campus):
    v = draft(admin_client, campus)
    response = admin_client.post(
        f"/api/admin/schedule/versions/{v['id']}/generate",
        json={"revision": v["revision"]},
    )
    recover_runs(campus["db"].get_bind())
    campus["db"].expire_all()
    run = admin_client.get(f"/api/admin/schedule/runs/{response.json()['id']}").json()
    assert run["status"] == "interrupted" and run["progress"]["stage"] == "interrupted"
    assert run["request_id"] == response.headers["x-request-id"]


def test_logging_failure_does_not_fail_request(admin_client, monkeypatch):
    def broken(*args, **kwargs):
        raise OSError("SECRET-PATH")

    monkeypatch.setattr(t._logger, "log", broken)
    before = t.request_metrics()["write_failures"]
    response = admin_client.post(
        "/api/admin/catalog/subjects", json={"name": "Temporary"}
    )
    assert response.status_code == 201
    assert t.request_metrics()["write_failures"] > before


def test_metrics_token_is_scoped_and_histograms_valid(client, monkeypatch):
    from app.core.config import Settings

    monkeypatch.setattr(
        "app.observability.router.get_settings",
        lambda: Settings(_env_file=None, metrics_token="test-metric-secret"),
    )
    headers = {"Authorization": "Bearer test-metric-secret"}
    response = client.get("/api/admin/diagnostics/metrics", headers=headers)
    assert response.status_code == 200
    assert response.text.endswith("\n") and 'le="+Inf"' in response.text
    assert "test-metric-secret" not in response.text
    assert "chronocampus_database_ready 1" in response.text
    assert (
        client.get("/api/admin/diagnostics/audit", headers=headers).status_code == 401
    )
    assert (
        client.get(
            "/api/admin/diagnostics/metrics", headers={"Authorization": "Bearer wrong"}
        ).status_code
        == 401
    )


def test_frontend_report_is_bounded_and_payload_free(admin_client):
    response = admin_client.post(
        "/api/diagnostics/client-errors",
        json={
            "code": "render_error",
            "page": "planner",
            "message": "PRIVATE-FORM",
            "frames": [
                {
                    "source": "Planner",
                    "line": 12,
                    "column": 4,
                    "message": "PRIVATE-FRAME",
                }
            ],
        },
    )
    assert response.status_code == 202
    rows = t.events(request_id=response.headers["x-request-id"])["items"]
    assert any(row["event"] == "frontend.error" for row in rows)
    assert "PRIVATE-FORM" not in json.dumps(rows)
    assert "PRIVATE-FRAME" not in json.dumps(rows)
    assert next(row for row in rows if row["event"] == "frontend.error")["frames"] == [
        {"source": "Planner", "line": 12, "column": 4}
    ]
    assert (
        admin_client.post(
            "/api/diagnostics/client-errors", json={"code": "ARBITRARY-SECRET"}
        ).status_code
        == 422
    )
    assert (
        admin_client.post(
            "/api/diagnostics/client-errors",
            json={
                "code": "render_error",
                "frames": [{"source": "PRIVATE-FILENAME", "line": 1, "column": 1}],
            },
        ).status_code
        == 422
    )


def test_readiness_checks_schema_not_only_connection(admin_client, campus):
    assert admin_client.get("/api/ready").status_code == 200
    campus["db"].execute(m.AuditEvent.__table__.delete())
    campus["db"].commit()
    m.AuditEvent.__table__.drop(campus["db"].get_bind())
    assert admin_client.get("/api/health").json() == {"status": "ok"}
    response = admin_client.get("/api/ready")
    assert response.status_code == 503 and response.json() == {"status": "unavailable"}


def test_progress_storage_failure_preserves_solver_result(
    admin_client, campus, monkeypatch
):
    def unavailable(*args, **kwargs):
        raise OSError("PRIVATE-CONNECTION")

    monkeypatch.setattr("app.observability.runs.Session", unavailable)
    result = generate(admin_client, draft(admin_client, campus), campus)
    assert result["status"] == "complete" and result["summary"]["placed"] == 4
    rows = t.events(request_id=result["request_id"])["items"]
    assert sum(row["event"] == "generation.progress_unavailable" for row in rows) == 1
    assert "PRIVATE-CONNECTION" not in json.dumps(rows)


def test_comparison_hash_distinguishes_rules_from_bookkeeping():
    from copy import deepcopy

    from app.scheduling.snapshot import comparison_hash, snapshot_hash

    original = {
        "data_revision": 1,
        "term": {"search_seconds": 10},
        "pins": [{"id": 3, "version_id": 1, "occurrence_id": 2, "day": "2026-09-07"}],
    }
    copied = deepcopy(original)
    copied["data_revision"] = 2
    copied["pins"][0].update(id=8, version_id=2)
    assert snapshot_hash(original) != snapshot_hash(copied)
    assert comparison_hash(original) == comparison_hash(copied)
    copied["pins"][0]["day"] = "2026-09-08"
    assert comparison_hash(original) != comparison_hash(copied)


def test_file_rotation_is_bounded_and_valid_json(tmp_path):
    from app.core.config import Settings

    settings = Settings(
        _env_file=None,
        diagnostic_log_directory=tmp_path,
        diagnostic_log_max_bytes=100000,
        diagnostic_log_backups=2,
    )
    t.configure(settings)
    for _ in range(800):
        t.emit(
            "test.rotation",
            frames=[{"file": "test.py", "function": "bounded", "line": 1}] * 25,
            password="PRIVATE-PASSWORD",
            body="PRIVATE-BODY",
        )
    files = list(tmp_path.glob("events.jsonl*"))
    assert len(files) == 3
    for path in files:
        content = path.read_text(encoding="utf-8")
        assert len(content.encode("utf-8")) < 100000
        assert "PRIVATE-PASSWORD" not in content and "PRIVATE-BODY" not in content
        assert all(
            json.loads(line)["event"] == "test.rotation"
            for line in content.splitlines()
        )


def test_database_query_instrumentation_counts_failures(monkeypatch):
    import pytest
    from app.db import session
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError

    session.get_engine.cache_clear()
    monkeypatch.setattr(session, "database_url", lambda: "sqlite://")
    engine = session.get_engine()
    before = t.process_stats()["database_queries"]
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            with pytest.raises(DBAPIError):
                connection.execute(text("SELECT * FROM missing_table"))
        after = t.process_stats()["database_queries"]
        assert after["count"] >= before["count"] + 2
        assert after["errors"] == before["errors"] + 1
    finally:
        engine.dispose()
        session.get_engine.cache_clear()
