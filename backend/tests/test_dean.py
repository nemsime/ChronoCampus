"""Dean account, authorization foundation, notes and overview regressions."""

from datetime import time
import importlib.util
from io import StringIO
from pathlib import Path
import re

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import event, func, select

from app import demo
from app.db import models as m
from app.main import app
from app.notes.router import NoteInput, save_note
from app.observability.router import database_probe
from app.observability.telemetry import ERROR_CODES
from conftest import HASH, PASSWORD
from test_workflow import campus as campus, draft, login


@pytest.fixture
def dean_account(campus):
    account = m.Account(email="dean@example.invalid", display_name="Fictional dean",
                        role="dean", password_hash=HASH, must_change_password=False,
                        faculty_id=campus["faculty"].id)
    campus["db"].add(account)
    campus["db"].commit()
    return account


@pytest.mark.parametrize("role", ["dean", "student", "teacher"])
def test_every_administrator_route_rejects_nonadministrators(client, campus, dean_account, role):
    email = dean_account.email if role == "dean" else campus[role].email
    login(client, email)
    before = {model.__name__: campus["db"].scalar(select(func.count()).select_from(model))
              for model in (m.ScheduleVersion, m.Assignment, m.PublishedGroup, m.Workload,
                            m.GenerationRun, m.ScheduleSuggestion)}
    checked = 0
    # Resolve included routers as well: newer FastAPI releases defer their
    # expansion and no longer expose every endpoint directly in app.routes.
    for route_path, operations in app.openapi()["paths"].items():
        if not route_path.startswith("/api/admin"):
            continue
        path = re.sub(r"\{[^}]+\}", "1", route_path)
        for method in operations.keys() & {"get", "post", "put", "patch", "delete"}:
            response = client.request(method, path, json={})
            assert response.status_code == 403, (method, path, response.text)
            checked += 1
    assert checked >= 25
    after = {model.__name__: campus["db"].scalar(select(func.count()).select_from(model))
             for model in (m.ScheduleVersion, m.Assignment, m.PublishedGroup, m.Workload,
                           m.GenerationRun, m.ScheduleSuggestion)}
    assert before == after
    if role == "dean":
        response = client.post("/api/diagnostics/client-errors", json={"code": "render_error"})
        assert response.status_code == 403


def test_create_dean_login_password_change_scope_and_role_cleanup(admin_client, campus):
    payload = {"email": "newdean@example.invalid", "display_name": "New dean",
               "role": "dean", "password": PASSWORD, "faculty_id": campus["faculty"].id}
    created = admin_client.post("/api/admin/catalog/users", json=payload)
    assert created.status_code == 201, created.text
    account = created.json()
    assert account["faculty_id"] == campus["faculty"].id
    assert account["must_change_password"] is True
    login(admin_client, payload["email"])
    assert admin_client.get("/api/auth/me").json()["user"]["role"] == "dean"
    assert admin_client.get("/api/dean/versions").json()["detail"] == "password_change_required"
    secret = PASSWORD + "new"
    assert admin_client.post("/api/auth/change-password", json={
        "current_password": PASSWORD, "password": secret}).status_code == 204
    response = admin_client.post("/api/auth/login", json={"email": payload["email"], "password": secret})
    assert response.status_code == 200
    admin_client.headers["x-csrf-token"] = response.json()["csrf_token"]
    assert admin_client.get("/api/dean/versions").status_code == 200
    login(admin_client, "admin@example.invalid")
    payload.pop("password")
    payload["role"] = "lecturer"
    changed = admin_client.put(f"/api/admin/catalog/users/{account['id']}", json=payload)
    assert changed.status_code == 200, changed.text
    assert changed.json()["faculty_id"] is None


@pytest.mark.parametrize("changes,code", [
    ({"role": "lecturer", "faculty_id": 1}, "faculty_dean_only"),
    ({"course_group_id": 1}, "student_membership_only"),
    ({"faculty_id": 999999}, "invalid_reference"),
])
def test_account_scope_validation(admin_client, campus, changes, code):
    payload = {"email": "invaliddean@example.invalid", "display_name": "Dean", "role": "dean",
               "password": PASSWORD, **changes}
    if payload.get("faculty_id") == 1:
        payload["faculty_id"] = campus["faculty"].id
    if payload.get("course_group_id") == 1:
        payload["course_group_id"] = campus["group"].id
    response = admin_client.post("/api/admin/catalog/users", json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == code


def test_university_dean_and_registration_cannot_choose_role(admin_client, campus):
    created = admin_client.post("/api/admin/catalog/users", json={
        "email": "alldean@example.invalid", "display_name": "Dean", "role": "dean", "password": PASSWORD})
    assert created.status_code == 201 and created.json()["faculty_id"] is None
    result = admin_client.post("/api/auth/register", json={
        "email": "registered@example.invalid", "display_name": "Student", "role": "dean",
        "faculty_id": campus["faculty"].id})
    assert result.status_code == 202, result.text
    student = campus["db"].scalar(select(m.Account).where(m.Account.email == "registered@example.invalid"))
    assert student.role == "student" and student.faculty_id is None


def published_lesson(client, campus):
    version = draft(client, campus)
    db = campus["db"]
    occurrence = db.scalar(select(m.Occurrence).order_by(m.Occurrence.id))
    version_row = db.get(m.ScheduleVersion, version["id"])
    version_row.status = "published"
    db.add(m.Assignment(version_id=version["id"], occurrence_id=occurrence.id,
                        day=campus["term"].starts_on, slot=1, starts_at=campus["calendar"].first_start,
                        ends_at=time(10, 50), room_id=campus["room"].id))
    db.add(m.PublishedGroup(term_id=campus["term"].id, course_group_id=campus["group"].id,
                            version_id=version["id"]))
    db.commit()
    return version_row, occurrence


def test_note_authorization_is_bounded_and_dean_has_no_personal_notes(admin_client, campus, dean_account):
    _, occurrence = published_lesson(admin_client, campus)
    db = campus["db"]
    statements = []

    def track(connection, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(db.get_bind(), "before_cursor_execute", track)
    try:
        for text_value in ("first note", "updated note"):
            statements.clear()
            result = save_note(occurrence.id, NoteInput(content=text_value), campus["student"], db)
            assert result["content"] == text_value
            # One revision-lock SELECT, one bounded authorization + note SELECT.
            assert len(statements) == 2
            assert sum('FROM "LessonAssignment"' in statement for statement in statements) == 1
    finally:
        event.remove(db.get_bind(), "before_cursor_execute", track)
    login(admin_client, dean_account.email)
    assert admin_client.put(f"/api/notes/{occurrence.id}", json={"content": "forbidden"}).status_code == 404
    assert db.scalar(select(func.count()).select_from(m.Note)) == 1


def test_dean_overview_has_real_scoped_counts_and_no_admin_fields(admin_client, campus, dean_account):
    version, _ = published_lesson(admin_client, campus)
    db = campus["db"]
    candidate = m.ScheduleVersion(term_id=version.term_id, name="Draft", cohort_ids=version.cohort_ids)
    db.add(candidate)
    db.flush()
    for status in ("open", "accepted"):
        db.add(m.ScheduleSuggestion(author_id=dean_account.id, version_id=candidate.id,
                                   base_revision=1, kind="other", title="Private", body="Private", status=status))
    db.commit()
    login(admin_client, dean_account.email)
    response = admin_client.get("/api/workspace/overview", params={"day": "2026-09-07"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["stats"]["today_lessons"] == data["stats"]["week_lessons"] == 1
    assert data["stats"]["published_cohorts_in_scope"] == data["stats"]["draft_versions_in_scope"] == 1
    assert data["stats"]["my_open_suggestions"] == data["stats"]["my_accepted_suggestions"] == 1
    assert not {"versions", "activity"} & data.keys()
    assert "personal_notes" not in data["stats"]
    assert "Private" not in response.text
    login(admin_client, "admin@example.invalid")
    assert admin_client.get("/api/workspace/overview", params={"day": "2026-09-07"}).json()["stats"]["open_suggestions"] == 1


def test_probe_and_error_allowlist(database):
    assert database_probe(database)["schema"] == "0007_dean_suggestions"
    assert {"dean_required", "forbidden", "suggestion_not_found", "suggestion_closed",
            "suggestion_state_changed", "suggestion_limit", "invalid_proposal",
            "outside_faculty_scope", "faculty_required_for_scope", "faculty_dean_only"} <= ERROR_CODES


def test_migration_is_frozen_additive_sql_server_ddl():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0007_dean_suggestions.py"
    assert "app.db.models" not in path.read_text()
    spec = importlib.util.spec_from_file_location("dean_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    output = StringIO()
    context = MigrationContext.configure(dialect_name="mssql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration.upgrade()
        with pytest.raises(RuntimeError, match="retained review history"):
            migration.downgrade()
    sql = output.getvalue()
    assert "ALTER TABLE [User] ADD faculty_id" in sql
    assert "CREATE TABLE [ScheduleSuggestion]" in sql and "CREATE TABLE [SuggestionComment]" in sql
    assert "ON DELETE CASCADE" in sql and "DROP" not in sql
    assert migration.down_revision == "0006_smtp_password_reset"


def test_demo_deans_have_scopes_and_seed_remains_idempotent(database, monkeypatch, tmp_path):
    engine = database.get_bind()

    def database_name(connection, cursor, statement, parameters, context, many):
        if statement == "SELECT DB_NAME()":
            return "SELECT 'ChronoCampus_Development'", parameters
        return statement, parameters

    event.listen(engine, "before_cursor_execute", database_name, retval=True)
    monkeypatch.setattr(demo, "get_engine", lambda: engine)
    monkeypatch.setattr(demo, "password_hash", lambda _: HASH)
    try:
        credentials = tmp_path / "demo-credentials.json"
        counts = []
        for _ in range(2):
            demo.seed_demo(credentials)
            counts.append({table: database.scalar(select(func.count()).select_from(model))
                           for table, model in [("users", m.Account), ("groups", m.CourseGroup), ("workloads", m.Workload)]})
        assert counts[0] == counts[1]
        deans = list(database.scalars(select(m.Account).where(m.Account.role == "dean").order_by(m.Account.email)))
        assert len(deans) == 2
        assert {dean.email for dean in deans} == {"dean.demo@example.invalid", "dean.faculty1.demo@example.invalid"}
        assert deans[0].faculty_id is None
        first_faculty = database.scalar(select(m.Faculty.id).where(m.Faculty.code == "FIA"))
        assert deans[1].faculty_id == first_faculty
        assert all(dean.email in credentials.read_text() for dean in deans)
    finally:
        event.remove(engine, "before_cursor_execute", database_name)
