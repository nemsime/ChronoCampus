import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from test_workflow import campus as campus  # noqa: PLC0414
from test_workflow import detail, draft

from app.db import models as m
from app.jobs.generation import apply_result, execute_claim, prepare
from app.jobs.models import ActiveGeneration, BackgroundJob, JobAttempt
from app.jobs.process import SolverFailure
from app.jobs.queue import claim_job, recover_expired


def enqueue(client, version, key=None):
    body = {"revision": version["revision"]}
    if key:
        body["idempotency_key"] = key
    response = client.post(
        f"/api/admin/schedule/versions/{version['id']}/generate", json=body
    )
    assert response.status_code == 202, response.text
    return response.json()


def test_admission_replay_before_quota_and_revision(admin_client, campus):
    db = campus["db"]
    version = draft(admin_client, campus)
    key = "durable-key-00000001"
    original = enqueue(admin_client, version, key)
    assert original["snapshot_created_at"] is None and original["input_hash"] == ""
    assert db.get(m.GenerationRun, original["id"]).snapshot == {}
    for _ in range(3):
        enqueue(admin_client, draft(admin_client, campus))
    fifth = draft(admin_client, campus)
    response = admin_client.post(
        f"/api/admin/schedule/versions/{fifth['id']}/generate",
        json={"revision": fifth["revision"]},
    )
    assert response.status_code == 429
    row = db.get(m.ScheduleVersion, version["id"])
    row.revision += 1
    db.commit()
    assert enqueue(admin_client, version, key)["id"] == original["id"]
    response = admin_client.post(
        f"/api/admin/schedule/versions/{version['id']}/generate",
        json={"revision": version["revision"], "seed": 2, "idempotency_key": key},
    )
    assert (
        response.status_code == 409
        and response.json()["detail"] == "idempotency_key_conflict"
    )


def test_queued_cancel_releases_guard_and_history(admin_client, campus):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    response = admin_client.post(f"/api/admin/schedule/runs/{run['id']}/cancel")
    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert db.get(ActiveGeneration, version["id"]) is None
    assert admin_client.get(
        f"/api/admin/schedule/runs/{run['id']}/attempts"
    ).json() == {"items": []}
    assert enqueue(admin_client, version)["id"] != run["id"]


def test_running_cancel_keeps_guard_until_stopped(admin_client, campus, monkeypatch):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    claim = claim_job(db.bind, "generation", "owner")

    def cancelled_solver(*args, **kwargs):
        response = admin_client.post(f"/api/admin/schedule/runs/{run['id']}/cancel")
        assert response.json()["job"]["cancel_requested_at"]
        assert db.get(ActiveGeneration, version["id"])
        return {"assignments": [], "status": "UNKNOWN"}

    monkeypatch.setattr("app.jobs.generation.run_solver", cancelled_solver)
    execute_claim(db.bind, claim)
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "cancelled"
    assert db.get(ActiveGeneration, version["id"]) is None
    assert detail(admin_client, version)["assignments"] == []
    attempt = admin_client.get(f"/api/admin/schedule/runs/{run['id']}/attempts").json()[
        "items"
    ][0]
    assert attempt["outcome"] == "cancelled" and attempt["input_hash"]


def test_retry_snapshot_reused_and_revision_change_terminal(
    admin_client, campus, monkeypatch
):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)

    def transient(*args, **kwargs):
        raise OSError("do-not-expose-this")

    monkeypatch.setattr("app.jobs.generation.run_solver", transient)
    first = claim_job(db.bind, "generation", "owner")
    execute_claim(db.bind, first)
    db.expire_all()
    row = db.get(m.GenerationRun, run["id"])
    original_hash, snapshot_time = row.input_hash, row.snapshot_created_at
    assert row.status == "retry_wait" and db.get(ActiveGeneration, version["id"])
    job = db.get(BackgroundJob, run["job"]["id"])
    job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()
    second = claim_job(db.bind, "generation", "owner2")
    execute_claim(db.bind, second)
    db.expire_all()
    row = db.get(m.GenerationRun, run["id"])
    assert row.snapshot_created_at == snapshot_time and row.input_hash == original_hash
    job = db.get(BackgroundJob, job.id)
    job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.get(m.DataRevision, 1).revision += 1
    db.commit()
    third = claim_job(db.bind, "generation", "owner3")
    execute_claim(db.bind, third)
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "stale"
    assert db.get(ActiveGeneration, version["id"]) is None
    assert len(list(db.scalars(select(JobAttempt)))) == 3


def test_expired_cancel_recovery_and_stale_apply_rejected(admin_client, campus):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    claim = claim_job(db.bind, "generation", "owner")
    claim, _, _, _, _ = prepare(db.bind, claim)
    admin_client.post(f"/api/admin/schedule/runs/{run['id']}/cancel")
    job = db.get(BackgroundJob, claim.job_id, populate_existing=True)
    job.lease_until = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()
    recover_expired(db.bind, "generation")
    assert not apply_result(db.bind, claim, {"assignments": []})
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "cancelled"
    assert db.get(ActiveGeneration, version["id"]) is None
    assert detail(admin_client, version)["assignments"] == []


def test_catalog_change_after_claim_rejects_result(admin_client, campus):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    claim = claim_job(db.bind, "generation", "owner")
    claim, _, _, _, _ = prepare(db.bind, claim)
    db.get(m.DataRevision, 1).revision += 1
    db.commit()
    assert apply_result(db.bind, claim, {"assignments": [], "status": "UNKNOWN"})
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "stale"
    assert db.get(ActiveGeneration, version["id"]) is None


def test_heartbeat_independent_of_blocked_solver(admin_client, campus, monkeypatch):
    db = campus["db"]
    run = enqueue(admin_client, draft(admin_client, campus))
    claim = claim_job(db.bind, "generation", "owner")
    ready = threading.Event()
    from types import SimpleNamespace

    from app.jobs import generation

    original = generation.get_settings()
    settings = SimpleNamespace(
        **{
            name: getattr(original, name)
            for name in (
                "solver_memory_mb",
                "solver_input_max_bytes",
                "solver_output_max_bytes",
                "solver_grace_seconds",
            )
        },
        job_heartbeat_seconds=0.02,
        job_lease_seconds=60,
    )
    monkeypatch.setattr(generation, "get_settings", lambda: settings)
    monkeypatch.setattr(generation, "renew_lease", lambda *args: ready.set() or True)
    monkeypatch.setattr(generation, "worker_heartbeat", lambda *args, **kwargs: None)

    def blocked(*args, **kwargs):
        ready.clear()
        assert ready.wait(2), "blocked solver starved heartbeat"
        raise SolverFailure("child_failed")

    monkeypatch.setattr(generation, "run_solver", blocked)
    execute_claim(db.bind, claim)
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "failed"


def test_final_fence_failure_rolls_back_assignments_and_version(
    admin_client, campus, monkeypatch
):
    import pytest

    from app.jobs import generation

    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    claim = claim_job(db.bind, "generation", "owner")
    claim, request, _, _, _ = prepare(db.bind, claim)
    from app.scheduling.solver import generate

    result = generate(request["snapshot"], request["algorithm"], request["seed"], 1)
    monkeypatch.setattr(generation, "finish_job", lambda *args, **kwargs: False)
    with pytest.raises(generation.OwnershipLost):
        apply_result(db.bind, claim, result)
    db.expire_all()
    assert db.get(m.ScheduleVersion, version["id"]).revision == version["revision"]
    assert detail(admin_client, version)["assignments"] == []
    assert db.get(m.GenerationRun, run["id"]).status == "running"
    assert db.get(ActiveGeneration, version["id"])


def test_retry_exhaustion_finalizes_run_attempt_and_guard(
    admin_client, campus, monkeypatch
):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)

    def transient(*args, **kwargs):
        raise OSError("transient")

    monkeypatch.setattr("app.jobs.generation.run_solver", transient)
    for index in range(3):
        claim = claim_job(db.bind, "generation", f"owner-{index}")
        assert claim
        execute_claim(db.bind, claim)
        db.expire_all()
        job = db.get(BackgroundJob, claim.job_id)
        if index < 2:
            assert job.state == "retry_wait" and db.get(ActiveGeneration, version["id"])
            job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(
                seconds=1
            )
            db.commit()
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "failed"
    assert db.get(ActiveGeneration, version["id"]) is None
    attempts = list(db.scalars(select(JobAttempt).order_by(JobAttempt.attempt_number)))
    assert [a.outcome for a in attempts] == ["retry_wait", "retry_wait", "failed"]


def test_api_restart_preserves_live_job(admin_client, campus):
    from fastapi.testclient import TestClient

    from app.main import app

    db = campus["db"]
    run = enqueue(admin_client, draft(admin_client, campus))
    claim = claim_job(db.bind, "generation", "live-owner")
    with TestClient(app) as restarted:
        assert restarted.get("/api/health").status_code == 200
    db.expire_all()
    assert db.get(BackgroundJob, claim.job_id).state == "running"
    assert db.get(m.GenerationRun, run["id"]).status == "queued"


def test_expired_exhausted_attempt_releases_guard_atomically(admin_client, campus):
    db = campus["db"]
    version = draft(admin_client, campus)
    run = enqueue(admin_client, version)
    job = db.get(BackgroundJob, run["job"]["id"])
    job.max_attempts = 1
    db.commit()
    claim = claim_job(db.bind, "generation", "crashed-owner")
    prepare(db.bind, claim)
    db.refresh(job)
    job.lease_until = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()
    recover_expired(db.bind, "generation")
    db.expire_all()
    assert db.get(m.GenerationRun, run["id"]).status == "failed"
    assert db.get(BackgroundJob, claim.job_id).state == "failed"
    assert db.get(ActiveGeneration, version["id"]) is None
    assert db.scalar(select(JobAttempt)).outcome == "failed"
    assert enqueue(admin_client, version)["id"] != run["id"]
