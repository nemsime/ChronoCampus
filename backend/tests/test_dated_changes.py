"""Dated changes use isolated SQLite fixtures; never the developer database."""

import importlib.util
from datetime import date
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import inspect, select
from test_dean_review import invariant
from test_dean_review import review as review
from test_workflow import campus as campus
from test_workflow import draft, login

from app.db import models as m
from app.scheduling.snapshot import record


def accounts(db):
    return [record(a) for a in db.scalars(select(m.Account).order_by(m.Account.id))]


def new_draft(client, fixture):
    login(client, "admin@example.invalid")
    return draft(client, fixture)


def path(version):
    return f"/api/admin/schedule/versions/{version['id']}"


def publish(client, version, revision):
    return client.post(path(version) + "/publish", json=dict(revision=revision))


@pytest.mark.parametrize("replacement,slot", [("2026-09-08", 2), ("2026-09-16", 1)])
def test_closure_preserves_hours_and_accepts_makeup_before_or_after(
    client, review, replacement, slot
):
    db = review["db"]
    version = new_draft(client, review)
    original = [record(a) for a in review["assignments"]]
    before_accounts = accounts(db)
    target = review["assignments"][2]
    response = client.post(
        path(version) + "/closures",
        json=dict(
            revision=version["revision"],
            starts_on=str(target.day),
            ends_on=str(target.day),
            cohort_ids=version["cohort_ids"],
            reason="Event closure",
        ),
    )
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["affected"] == 1
    assert target.occurrence_id in result["report"]["unplaced_occurrences"]
    assert not result["report"]["complete"]
    assert sum(h["remaining_hours"] for h in result["report"]["hours"]) == 2
    assert publish(client, version, result["revision"]).status_code == 409
    closed = client.put(
        path(version) + f"/assignments/{target.occurrence_id}",
        json=dict(
            revision=result["revision"],
            day=str(target.day),
            slot=2,
            room_id=target.room_id,
        ),
    )
    assert closed.status_code == 409 and "teaching_closed" in str(closed.json())
    overlap = client.post(
        path(version) + "/closures",
        json=dict(
            revision=result["revision"],
            starts_on=str(target.day),
            ends_on=str(target.day),
            cohort_ids=version["cohort_ids"],
            reason="Duplicate",
        ),
    )
    assert overlap.status_code == 409
    template = client.get(
        "/api/schedule/template", params={"version_id": version["id"]}
    )
    assert template.status_code == 200, template.text
    assert any(
        r["reason"] == "makeup_pending"
        for semester in template.json()["semesters"]
        for r in semester["exceptions"]
    )
    placed = client.put(
        path(version) + f"/assignments/{target.occurrence_id}",
        json=dict(
            revision=result["revision"],
            day=replacement,
            slot=slot,
            room_id=target.room_id,
        ),
    )
    assert placed.status_code == 200, placed.text
    assert placed.json()["report"]["complete"]
    assert publish(client, version, placed.json()["revision"]).status_code == 200
    assert [
        record(db.get(m.Assignment, a.id)) for a in review["assignments"]
    ] == original
    assert accounts(db) == before_accounts
    # Subsequent drafts must retain the closure and the original placement.
    copied = draft(client, review)
    metadata = client.get(path(copied) + "/changes").json()
    assert len(metadata["events"]) == 1 and not metadata["overrides"][0]["unresolved"]
    assert metadata["overrides"][0]["original"]["day"] == str(target.day)
    assert (
        client.post(
            path(copied) + "/generate", json={"revision": copied["revision"]}
        ).status_code
        == 409
    )


def test_lecturer_request_approval_application_and_publication(client, review):
    db = review["db"]
    target = review["assignments"][0]
    before = invariant(db)
    body = dict(
        version_id=review["published"].id,
        occurrence_id=target.occurrence_id,
        proposed_day="2026-09-14",
        proposed_slot=1,
        reason="Unavailable once",
    )
    login(client, "other@example.invalid")
    assert client.post("/api/lecturer/change-requests", json=body).status_code == 404
    login(client, "teacher@example.invalid")
    before_accounts = accounts(db)
    request = client.post("/api/lecturer/change-requests", json=body)
    assert request.status_code == 201, request.text
    identifier = request.json()["id"]
    assert client.post("/api/lecturer/change-requests", json=body).status_code == 409
    assert invariant(db) == before and accounts(db) == before_accounts
    # Lecturers cannot create closures or apply their own request.
    assert (
        client.post(
            f"/api/admin/schedule/versions/{review['draft'].id}/requested-moves/{identifier}",
            json={"revision": 1},
        ).status_code
        == 403
    )
    version = new_draft(client, review)
    before_accounts = accounts(db)
    apply = path(version) + f"/requested-moves/{identifier}"
    assert client.post(apply, json={"revision": version["revision"]}).status_code == 409
    accepted = client.put(
        f"/api/admin/suggestions/{identifier}/decision",
        json=dict(status="accepted", expected_status="open"),
    )
    assert accepted.status_code == 200, accepted.text
    applied = client.post(apply, json={"revision": version["revision"]})
    assert applied.status_code == 200, applied.text
    assert db.get(m.ScheduleSuggestion, identifier).status == "accepted"
    assert (
        db.get(m.PublishedGroup, (review["term"].id, review["group"].id)).version_id
        == review["published"].id
    )
    assert publish(client, version, applied.json()["revision"]).status_code == 200
    db.expire_all()
    suggestion = db.get(m.ScheduleSuggestion, identifier)
    assert (
        suggestion.status == "implemented"
        and suggestion.implemented_in_version_id == version["id"]
    )
    assert db.get(m.Assignment, target.id).day == date(2026, 9, 7)
    assert accounts(db) == before_accounts
    login(client, "teacher@example.invalid")
    assert (
        client.get("/api/lecturer/change-requests").json()[0]["status"] == "implemented"
    )


def test_one_time_move_keeps_earliest_original_and_rejects_conflict(client, review):
    version = new_draft(client, review)
    db = review["db"]
    target = review["assignments"][0]
    body = dict(
        revision=version["revision"],
        day="2026-09-14",
        slot=1,
        room_id=target.room_id,
        reason="First move",
    )
    response = client.post(
        path(version) + f"/assignments/{target.occurrence_id}/once", json=body
    )
    assert response.status_code == 200, response.text
    body.update(
        revision=response.json()["revision"], day="2026-09-15", reason="Second move"
    )
    response = client.post(
        path(version) + f"/assignments/{target.occurrence_id}/once", json=body
    )
    assert response.status_code == 200, response.text
    override = db.scalar(
        select(m.LessonOverride).where(m.LessonOverride.version_id == version["id"])
    )
    assert override.original["day"] == "2026-09-07"
    assert (
        client.post(
            path(version) + f"/assignments/{target.occurrence_id}/once", json=body
        ).status_code
        == 409
    )
    body.update(revision=response.json()["revision"], day="2026-09-08")
    assert (
        client.post(
            path(version) + f"/assignments/{target.occurrence_id}/once", json=body
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/admin/schedule/versions/{review['published'].id}/assignments/{target.occurrence_id}/once",
            json=body,
        ).status_code
        == 409
    )


def test_schema_gate_and_additive_migration_preserve_retained_rows(client, review):
    db = review["db"]
    login(client, "admin@example.invalid")
    before = invariant(db)
    before_accounts = accounts(db)
    engine = db.get_bind()
    db.rollback()
    m.LessonOverride.__table__.drop(engine)
    m.ScheduleChangeEvent.__table__.drop(engine)
    assert client.get("/api/schedule/change-features").json() == {"enabled": False}
    assert (
        client.get(
            f"/api/admin/schedule/versions/{review['draft'].id}/changes"
        ).status_code
        == 503
    )
    filename = (
        Path(__file__).resolve().parents[1] / "alembic/versions/0008_dated_changes.py"
    )
    spec = importlib.util.spec_from_file_location("dated_migration", filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    db.rollback()
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
        assert inspect(connection).has_table("LessonOverride")
    assert invariant(db) == before and accounts(db) == before_accounts
    assert client.get("/api/schedule/change-features").json() == {"enabled": True}


def test_new_publication_makes_old_lecturer_request_stale(client, review):
    target = review["assignments"][0]
    login(client, "teacher@example.invalid")
    response = client.post(
        "/api/lecturer/change-requests",
        json=dict(
            version_id=review["published"].id,
            occurrence_id=target.occurrence_id,
            proposed_day="2026-09-14",
            proposed_slot=1,
            reason="One-time absence",
        ),
    )
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    version = new_draft(client, review)
    assert publish(client, version, version["revision"]).status_code == 200
    response = client.put(
        f"/api/admin/suggestions/{identifier}/decision",
        json=dict(status="accepted", expected_status="open"),
    )
    assert (
        response.status_code == 409 and response.json()["detail"] == "request_outdated"
    )
    login(client, "teacher@example.invalid")
    assert client.get("/api/lecturer/change-requests").json()[0]["outdated"]


def test_migration_compiles_for_sql_server_without_data_updates():
    import io

    filename = (
        Path(__file__).resolve().parents[1] / "alembic/versions/0008_dated_changes.py"
    )
    spec = importlib.util.spec_from_file_location("dated_mssql_migration", filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = io.StringIO()
    context = MigrationContext.configure(
        dialect_name="mssql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        module.upgrade()
    sql = output.getvalue().upper()
    assert "CREATE TABLE [LESSONOVERRIDE]" in sql
    assert "CREATE TABLE [SCHEDULECHANGEEVENT]" in sql
    assert (
        "UPDATE " not in sql
        and "DELETE " not in sql
        and "ALTER TABLE [USER]" not in sql
    )
