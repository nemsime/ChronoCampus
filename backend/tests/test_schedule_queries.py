"""Isolated read-path tests: never connect to or mutate the development SQL DB."""

from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, select, update

from app.calendar.rules import audiences_overlap
from app.core.security import token_hash
from app.db import models as m
from app.db.session import get_db
from app.scheduling import queries as q
from app.scheduling.router import assignment_view


@pytest.fixture
def schedule(database):
    db = database

    def add(model, **values):
        row = model(**values)
        db.add(row)
        db.flush()
        return row

    faculty = add(m.Faculty, name="F", code="F")
    major = add(m.Major, faculty_id=faculty.id, name="M", major_code=1, study_form="present", duration_yrs=4)
    groups = [add(m.CourseGroup, major_id=major.id, admission_year=2026, group_code=str(i), capacity=20) for i in range(2)]
    smalls = [add(m.SmallGroup, course_group_id=groups[0].id, label=str(i), capacity=10) for i in range(2)]
    labs = [add(m.LabGroup, small_group_id=smalls[0].id, label=str(i), capacity=5) for i in range(2)]
    teacher = add(m.Account, email="teacher@invalid", password_hash="unused", role="lecturer", display_name="Teacher", must_change_password=False)
    student = add(m.Account, email="student@invalid", password_hash="unused", role="student", must_change_password=False,
                  course_group_id=groups[0].id, small_group_id=smalls[0].id, lab_group_id=labs[0].id)
    outsider = add(m.Account, email="other@invalid", password_hash="unused", role="student", must_change_password=False, course_group_id=groups[1].id)
    building = add(m.Building, building_number=1)
    rooms = [add(m.Room, building_id=building.id, room_number=str(i), floor_number=1, room_on_floor=i, capacity=20, room_type="classroom") for i in range(2)]
    calendar = add(m.CalendarConfig, name="C", study_form="present", first_start=time(9), lesson_minutes=80, break_minutes=10, ordinary_slots=4)
    term = add(m.Term, name="T", academic_year="2026", starts_on=date(2026, 9, 1), ends_on=date(2026, 12, 1), calendar_id=calendar.id)
    version = add(m.ScheduleVersion, term_id=term.id, name="Published", status="published", cohort_ids=[g.id for g in groups],
                  configuration={"term": {"starts_on": "2026-08-24"}})
    for group in groups:
        add(m.PublishedGroup, term_id=term.id, course_group_id=group.id, version_id=version.id)
    workloads = []
    # Includes intentionally broad audiences with a lab but no small group:
    # the domain overlap rule ignores that lab restriction.
    audiences = [(0, None, None), (0, smalls[0].id, None), (0, smalls[1].id, None),
                 (0, smalls[0].id, labs[0].id), (0, smalls[0].id, labs[1].id),
                 (0, None, labs[1].id), (1, None, None)]
    for i, (group, small, lab) in enumerate(audiences):
        subject = add(m.Subject, name=f"Subject {i}")
        workload = add(m.Workload, term_id=term.id, course_group_id=groups[group].id, small_group_id=small,
                       lab_group_id=lab, subject_id=subject.id, teacher_id=teacher.id, lesson_type="lecture", semester_hours=2)
        workloads.append(workload)
        occurrence = add(m.Occurrence, component_id=workload.id, ordinal=0)
        add(m.Assignment, version_id=version.id, occurrence_id=occurrence.id, day=date(2026, 9, 7), slot=1,
            starts_at=time(9), ends_at=time(10, 20), room_id=rooms[group].id, pinned=i == 0, cancelled=i == 1)
    for raw, user in [("student", student), ("other", outsider), ("teacher", teacher), ("admin", db.get(m.Account, 1))]:
        add(m.UserSession, user_id=user.id, session_token=token_hash(raw), expires_at=datetime.utcnow() + timedelta(days=1))
    db.commit()
    app = FastAPI()
    app.include_router(q.router)

    def override():
        yield db
        db.rollback()

    app.dependency_overrides[get_db] = override
    client = TestClient(app)
    client.cookies.set("chronocampus_session", "student")
    return SimpleNamespace(**locals())


def page(s, **params):
    return s.client.get("/schedule/page", params={"start": "2026-09-01", "end": "2026-09-30", **params})


@pytest.mark.parametrize("small,lab", [(None, None), (0, None), (0, 0), (0, 1), (1, None)])
def test_matches_domain_rules_and_lesson_fields(schedule, small, lab):
    s = schedule
    s.student.small_group_id = s.smalls[small].id if small is not None else None
    s.student.lab_group_id = s.labs[lab].id if lab is not None else None
    s.db.commit()
    membership = {key: getattr(s.student, key) for key in ("course_group_id", "small_group_id", "lab_group_id")}
    expected = []
    for assignment, workload in s.db.execute(select(m.Assignment, m.Workload).join(m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id).join(m.Workload, m.Occurrence.component_id == m.Workload.id)):
        if audiences_overlap(membership, {key: getattr(workload, key) for key in membership}):
            expected.append(assignment_view(s.db, assignment, workload))
    response = page(s)
    assert response.status_code == 200, response.text
    assert response.json()["items"] == expected
    assert response.headers["cache-control"] == "private, no-store"


def test_keyset_scope_filters_revision_bounds_and_facets(schedule):
    s = schedule
    first = page(s, limit=2).json()
    second = page(s, limit=2, cursor=first["next_cursor"]).json()
    assert len({x["id"] for x in first["items"] + second["items"]}) == 4
    assert page(s, limit=2, cursor=first["next_cursor"]).json() == second
    assert page(s, limit=2, cursor=first["next_cursor"], subject_id=1).status_code == 409
    assert page(s, end="2026-10-01").status_code == 200
    assert page(s, end="2026-10-02").status_code == 422
    assert page(s, end="2026-08-31").status_code == 422
    assert page(s, limit=501).status_code == 422
    assert s.client.get("/schedule/page").status_code == 422
    facets = s.client.get("/schedule/facets").json()
    assert len(facets["filters"]["subject_id"]) == 4
    assert facets["filters"]["room_id"] == [{"id": s.rooms[0].id, "label": "0"}]
    assert facets["filters"]["course_group_id"] == [{"id": s.groups[0].id, "label": "0"}]
    assert facets["date_bounds"] == {"start": "2026-09-07", "end": "2026-09-07"}
    s.client.cookies.set("chronocampus_session", "other")
    assert page(s, limit=2, cursor=first["next_cursor"]).status_code == 409
    assert len(page(s).json()["items"]) == 1
    assert s.client.get("/schedule/facets").json()["filters"]["room_id"] == [{"id": s.rooms[1].id, "label": "1"}]
    s.client.cookies.set("chronocampus_session", "student")
    s.db.execute(update(m.DataRevision).values(revision=m.DataRevision.revision + 1))
    s.db.commit()
    assert page(s, limit=2, cursor=first["next_cursor"]).status_code == 409


@pytest.mark.parametrize("payload", [None, [], {}, {"v": 1}, {"v": 1, "last": ["bad", "bad", 1, 2]},
                                     {"v": 1, "last": ["2026-09-07", "09:00", [], {}]},
                                     {"v": 1, "last": ["2026-09-07", "09:00", 2**64, 1]},
                                     {"v": 1, "last": ["2026-09-07", "09:00+04:00", 1, 1]}])
def test_malformed_cursors(schedule, payload):
    cursor = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    assert page(schedule, cursor=cursor).status_code == 422
    assert page(schedule, cursor="!invalid!").status_code == 422


@pytest.mark.parametrize("raw,count", [("teacher", 7), ("admin", 7)])
def test_nonstudent_roles(schedule, raw, count):
    schedule.client.cookies.set("chronocampus_session", raw)
    assert len(page(schedule).json()["items"]) == count


@pytest.mark.parametrize("endpoint", ["page", "facets"])
@pytest.mark.parametrize("change", ["revoked", "inactive", "membership", "role", "revision"])
def test_inflight_changes(schedule, monkeypatch, endpoint, change):
    s = schedule
    original = q.fresh_scope
    calls = 0

    def fresh(db, request):
        nonlocal calls
        calls += 1
        if calls == 2:
            if change == "revoked":
                db.execute(update(m.UserSession).where(m.UserSession.user_id == s.student.id).values(is_revoked=True))
            elif change == "inactive":
                db.execute(update(m.Account.__table__).where(m.Account.id == s.student.id).values(is_active=False))
            elif change == "membership":
                db.execute(update(m.Account.__table__).where(m.Account.id == s.student.id).values(course_group_id=s.groups[1].id, small_group_id=None, lab_group_id=None))
            elif change == "role":
                db.execute(update(m.Account.__table__).where(m.Account.id == s.student.id).values(role="lecturer"))
            else:
                db.execute(update(m.DataRevision).values(revision=7))
            db.commit()
        return original(db, request)

    monkeypatch.setattr(q, "fresh_scope", fresh)
    response = page(s) if endpoint == "page" else s.client.get("/schedule/facets")
    if change in {"revoked", "inactive"}:
        assert response.status_code == 401
    else:
        assert response.status_code == 200, response.text
        assert calls == 4
        if change == "revision":
            assert response.json()["revision"] == 7
        elif change == "role":
            if endpoint == "page":
                assert response.json()["items"] == []
            else:
                assert response.json()["date_bounds"]["start"] is None
        elif endpoint == "page":
            assert {r["course_group_id"] for r in response.json()["items"]} == {s.groups[1].id}
        else:
            assert response.json()["filters"]["course_group_id"] == [{"id": s.groups[1].id, "label": "1"}]


def test_repeated_changes_return_conflict(schedule, monkeypatch):
    original = q.materialize

    def changing(db, *args, **kwargs):
        result = original(db, *args, **kwargs)
        db.execute(update(m.DataRevision).values(revision=m.DataRevision.revision + 1))
        db.commit()
        return result

    monkeypatch.setattr(q, "materialize", changing)
    assert page(schedule).status_code == 409


def test_constant_query_count_and_legacy_cap(schedule):
    s = schedule
    counts = []
    statements = []

    def track(connection, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(s.db.get_bind(), "before_cursor_execute", track)
    try:
        for size in (0, 510):
            if size:
                for ordinal in range(1, size + 1):
                    occurrence = s.add(m.Occurrence, component_id=s.workloads[0].id, ordinal=ordinal)
                    s.add(m.Assignment, version_id=s.version.id, occurrence_id=occurrence.id, day=date(2026, 9, 7),
                          slot=1, starts_at=time(9), ends_at=time(10, 20), room_id=s.rooms[0].id)
                s.db.commit()
            statements.clear()
            response = page(s, limit=500)
            assert response.status_code == 200, response.text
            counts.append(len(statements))
        assert counts == [3, 3]
        assert len(response.json()["items"]) == 500
        assert response.json()["next_cursor"]
        legacy = s.client.get("/schedule")
        assert legacy.status_code == 422
        assert legacy.json()["detail"] == "pagination_required"
        assert s.client.get("/schedule", params={"start": "2026-09-08"}).json() == []
        statements.clear()
        assert s.client.get("/schedule/facets").status_code == 200
        assert len(statements) == 9
        print(f"schedule SELECT benchmark: 7/517 published rows -> {counts} statements; facets -> 9; cache absent")
    finally:
        event.remove(s.db.get_bind(), "before_cursor_execute", track)
