"""Workspace API coverage with isolated SQL state and real authorization predicates."""

from datetime import date, datetime, time

import pytest
from sqlalchemy import event, select
from test_schedule_queries import schedule as schedule

from app.db import models as m
from app.workspace import router as workspace


@pytest.fixture
def workspace_schedule(schedule):
    schedule.app.include_router(workspace.router)
    return schedule


def overview(schedule, day="2026-09-07"):
    return schedule.client.get("/workspace/overview", params={"day": day})


def test_overview_main_route_requires_a_session(client):
    response = client.get("/api/workspace/overview", params={"day": "2026-09-07"})
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"


def test_overview_is_personal_and_never_returns_private_bodies(workspace_schedule):
    s = workspace_schedule
    occurrence = s.db.scalar(select(m.Occurrence.id)
                             .where(m.Occurrence.component_id == s.workloads[0].id))
    s.db.add_all([
        m.Note(user_id=s.student.id, occurrence_id=occurrence, content="PRIVATE-NOTE"),
        m.Note(user_id=s.outsider.id, occurrence_id=occurrence, content="OTHER-NOTE"),
        m.Feedback(user_id=s.student.id, subject="PRIVATE-SUBJECT", status="new"),
        m.Feedback(user_id=s.student.id, subject="PRIVATE-PROGRESS", status="in_progress"),
        m.Feedback(user_id=s.outsider.id, subject="OTHER-SUBJECT", status="closed"),
        m.AuditEvent(actor_id=1, action="catalog.updated", resource="rooms",
                     changes={"secret": "AUDIT-DETAILS"}),
    ])
    s.db.commit()
    response = overview(s)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    data = response.json()
    assert data["date"] == "2026-09-07"
    assert data["stats"] == {"today_lessons": 3, "week_lessons": 3,
                             "personal_notes": 1, "open_requests": 2}
    assert data["support"] == {"new": 1, "in_progress": 1, "closed": 0}
    assert data["week"] == [{"day": f"2026-09-{day:02d}", "lessons": 3 if day == 7 else 0}
                            for day in range(7, 14)]
    assert len(data["upcoming"]) == 3
    assert all(row["course_group_id"] == s.groups[0].id and not row["cancelled"]
               for row in data["upcoming"])
    assert data["versions"] == data["activity"] == []
    assert all(secret not in response.text for secret in (
        "PRIVATE-NOTE", "OTHER-NOTE", "PRIVATE-SUBJECT", "OTHER-SUBJECT", "AUDIT-DETAILS"))


@pytest.mark.parametrize("role,expected", [("teacher", 6), ("other", 1), ("admin", 6)])
def test_overview_scope_and_admin_projection(workspace_schedule, role, expected):
    s = workspace_schedule
    s.client.cookies.set("chronocampus_session", role)
    response = overview(s)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["stats"]["today_lessons"] == expected
    assert len(data["upcoming"]) == min(expected, 6)
    if role == "admin":
        assert data["stats"]["total_cohorts"] == 2
        assert data["stats"]["total_rooms"] == 2
        assert data["stats"]["active_users"] == 4
        assert data["stats"]["published_cohorts"] == 2
        assert data["stats"]["draft_versions"] == data["stats"]["active_runs"] == 0
        assert data["versions"] == [{"id": s.version.id, "name": "Published",
                                     "status": "published", "term": "T", "report_complete": False}]
    else:
        assert "active_users" not in data["stats"]
        assert data["versions"] == data["activity"] == []


def test_overview_authentication_date_validation_and_empty_week(workspace_schedule):
    s = workspace_schedule
    response = overview(s, "2026-09-13")
    assert response.status_code == 200
    assert response.json()["week"][0]["day"] == "2026-09-07"
    assert response.json()["upcoming"] == []
    assert overview(s, "2026-10-01").json()["stats"]["week_lessons"] == 0
    assert overview(s, "invalid").status_code == 422
    assert overview(s, "9999-12-31").status_code == 422
    s.student.must_change_password = True
    s.db.commit()
    assert overview(s).status_code == 403
    s.client.cookies.clear()
    assert overview(s).status_code == 401


def test_overview_counts_a_cohort_published_in_two_terms_once(workspace_schedule):
    s = workspace_schedule
    term = m.Term(name="Second term", academic_year="2026", starts_on=date(2027, 2, 1),
                  ends_on=date(2027, 6, 1), calendar_id=s.calendar.id)
    s.db.add(term)
    s.db.flush()
    version = m.ScheduleVersion(term_id=term.id, name="Second publication",
                                status="published", cohort_ids=[s.groups[0].id])
    s.db.add(version)
    s.db.flush()
    s.db.add(m.PublishedGroup(term_id=term.id, course_group_id=s.groups[0].id,
                             version_id=version.id))
    s.db.commit()
    s.client.cookies.set("chronocampus_session", "admin")
    response = overview(s)
    assert response.status_code == 200, response.text
    assert response.json()["stats"]["published_cohorts"] == 2
    assert response.json()["stats"]["total_cohorts"] == 2


def test_overview_is_bounded_and_has_constant_query_count(workspace_schedule):
    s = workspace_schedule
    s.client.cookies.set("chronocampus_session", "admin")
    calls = []

    def count_query(*args):
        calls.append(1)

    engine = s.db.get_bind()
    event.listen(engine, "before_cursor_execute", count_query)
    try:
        first = overview(s)
        before = len(calls)
        assert first.status_code == 200, first.text
        for index in range(35):
            occurrence = m.Occurrence(component_id=s.workloads[0].id, ordinal=index + 1)
            s.db.add(occurrence)
            s.db.flush()
            s.db.add(m.Assignment(version_id=s.version.id, occurrence_id=occurrence.id,
                                day=date(2026, 9, 8), slot=1, starts_at=time(9),
                                ends_at=time(10, 20), room_id=s.rooms[0].id))
            s.db.add(m.ScheduleVersion(term_id=s.term.id, name=f"Draft {index}",
                                     status="draft", cohort_ids=[s.groups[0].id],
                                     report={"complete": True}))
            s.db.add(m.AuditEvent(action="draft.created", resource="schedule",
                                 created_at=datetime(2026, 9, 7)))
        s.db.commit()
        calls.clear()
        response = overview(s)
        assert response.status_code == 200, response.text
        assert len(calls) == before <= 10
        data = response.json()
        assert data["stats"]["week_lessons"] == 41
        assert len(data["upcoming"]) == 6
        assert len(data["versions"]) == 5
        assert all(version["report_complete"] for version in data["versions"])
        assert len(data["activity"]) == 8
    finally:
        event.remove(engine, "before_cursor_execute", count_query)


def test_overview_revalidates_session_after_aggregating(workspace_schedule, monkeypatch):
    s = workspace_schedule
    original = workspace.overview_data

    def revoke_after_read(db, scope, day):
        result = original(db, scope, day)
        s.student.is_active = False
        db.commit()
        return result

    monkeypatch.setattr(workspace, "overview_data", revoke_after_read)
    response = overview(s)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"
