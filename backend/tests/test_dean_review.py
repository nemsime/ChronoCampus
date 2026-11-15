"""Review privacy, suggestion invariants and proposal checks on an isolated DB."""

from datetime import date, time, timedelta

import pytest
from conftest import HASH
from sqlalchemy import select, update
from test_workflow import campus as campus
from test_workflow import login

from app.db import models as m
from app.db.utc import utc_now
from app.scheduling import queries as q
from app.scheduling.snapshot import build_snapshot, record
from app.scheduling.validation import validate


@pytest.fixture
def review(campus):
    db = campus["db"]

    def add(model, **values):
        row = model(**values)
        db.add(row)
        db.flush()
        return row

    dean = add(m.Account, email="dean@example.invalid", display_name="Faculty dean",
               password_hash=HASH, role="dean", faculty_id=campus["faculty"].id,
               must_change_password=False)
    other_dean = add(m.Account, email="dean.other@example.invalid", display_name="Other dean",
                     password_hash=HASH, role="dean", faculty_id=campus["faculty"].id,
                     must_change_password=False)
    university_dean = add(m.Account, email="dean.all@example.invalid", display_name="University dean",
                          password_hash=HASH, role="dean", must_change_password=False)
    published = add(m.ScheduleVersion, term_id=campus["term"].id, name="Published", status="published",
                    cohort_ids=[campus["group"].id], published_at=utc_now())
    snapshot = build_snapshot(db, published, materialize=True)
    published.configuration = {"term": snapshot["term"], "calendar": snapshot["calendar"]}
    assignments = []
    workloads = {row["id"]: row for row in snapshot["workloads"]}
    for i, occurrence in enumerate(snapshot["occurrences"]):
        workload = workloads[occurrence["component_id"]]
        room = campus["labroom"] if workload["lesson_type"] == "lab" else campus["room"]
        assignments.append(add(m.Assignment, version_id=published.id, occurrence_id=occurrence["id"],
            day=date(2026, 9, 7) + timedelta(days=i), slot=1,
            starts_at=time(9, 30), ends_at=time(10, 50), room_id=room.id))
    published.report = validate(snapshot, [record(row) for row in assignments])
    assert published.report["complete"], published.report
    add(m.PublishedGroup, term_id=campus["term"].id, course_group_id=campus["group"].id,
        version_id=published.id)
    draft = add(m.ScheduleVersion, term_id=published.term_id, name="Draft", status="draft",
                cohort_ids=published.cohort_ids, configuration=published.configuration,
                report=published.report)
    for row in assignments:
        add(m.Assignment, **{**record(row), "id": None, "version_id": draft.id,
                            "day": row.day, "starts_at": row.starts_at, "ends_at": row.ends_at})
    faculty_b = add(m.Faculty, name="Outside faculty", code="OUT")
    major_b = add(m.Major, faculty_id=faculty_b.id, name="Outside major", major_code=2,
                  study_form="present", duration_yrs=4)
    group_b = add(m.CourseGroup, major_id=major_b.id, admission_year=2026,
                  group_code="OUT", capacity=20)
    workload_b = add(m.Workload, term_id=published.term_id, course_group_id=group_b.id,
        subject_id=campus["subject"].id, teacher_id=campus["teacher"].id,
        lesson_type="lecture", semester_hours=2)
    occurrence_b = add(m.Occurrence, component_id=workload_b.id, ordinal=0)
    outside = add(m.ScheduleVersion, term_id=published.term_id, name="Outside draft", status="draft",
                  cohort_ids=[group_b.id], configuration=published.configuration)
    add(m.Assignment, version_id=outside.id, occurrence_id=occurrence_b.id,
        day=date(2026, 9, 7), slot=1, starts_at=time(9, 30), ends_at=time(10, 50),
        room_id=campus["room"].id)
    db.commit()
    return {**campus, **locals()}


def proposal(review, kind="move", **overrides):
    assignment = review["assignments"][0]
    values = {"version_id": review["draft"].id, "kind": kind,
              "title": "Private title marker", "body": "Private suggestion marker"}
    if kind != "other":
        values["occurrence_id"] = assignment.occurrence_id
    if kind == "move":
        values.update(proposed_day="2026-09-11", proposed_slot=2)
    if kind == "room":
        values["proposed_room_id"] = review["labroom"].id
    return {**values, **overrides}


def create(client, review, kind="move", **overrides):
    response = client.post("/api/dean/suggestions", json=proposal(review, kind, **overrides))
    assert response.status_code == 201, response.text
    return response.json()


def invariant(db):
    return {
        "assignments": [record(row) for row in db.scalars(select(m.Assignment).order_by(m.Assignment.id))],
        "versions": [record(row) for row in db.scalars(select(m.ScheduleVersion).order_by(m.ScheduleVersion.id))],
        "occurrences": [record(row) for row in db.scalars(select(m.Occurrence).order_by(m.Occurrence.id))],
        "published": [record(row) for row in db.scalars(select(m.PublishedGroup))],
        "disruptions": [record(row) for row in db.scalars(select(m.Disruption))],
        "revision": db.get(m.DataRevision, 1, populate_existing=True).revision,
    }


def test_version_reads_scoping_and_draft_privacy(client, review):
    login(client, "dean@example.invalid")
    response = client.get("/api/dean/versions")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert {row["id"] for row in response.json()} == {review["published"].id, review["draft"].id}
    assert {row["status"] for row in response.json()} == {"published", "draft"}
    assert not {"snapshot", "seed", "input_hash", "configuration", "report"} & response.json()[0].keys()
    assert response.json()[0]["summary"] == {
        "complete": True, "required_hours": 8, "remaining_hours": 0, "unresolved": 0
    }
    path = f"/api/dean/versions/{review['draft'].id}"
    data = client.get(path + "/schedule", params={"start": "2026-09-07", "end": "2026-09-13"})
    assert data.status_code == 200, data.text
    assert len(data.json()["items"]) == 4
    assert all(row["version_id"] == review["draft"].id for row in data.json()["items"])
    grid = client.get(path + "/facets").json()["grid"][str(review["term"].id)]
    assert grid["slots"][2] == {"slot": 3, "starts_at": "12:50", "ends_at": "14:10"}
    assert client.get(f"/api/dean/versions/{review['outside'].id}/facets").status_code == 404
    login(client, "dean.all@example.invalid")
    assert len(client.get("/api/dean/versions").json()) == 3
    login(client, "student@example.invalid")
    assert client.get("/api/dean/versions").status_code == 403
    assert client.get(path + "/schedule", params={"start": "2026-09-07", "end": "2026-09-13"}).status_code == 403
    assert {row["version_id"] for row in client.get("/api/schedule").json()} == {review["published"].id}
    login(client, "teacher@example.invalid")
    assert client.get(path + "/facets").status_code == 403


def test_version_cursors_include_version_and_draft_revision(client, review):
    login(client, "dean@example.invalid")
    path = f"/api/dean/versions/{review['draft'].id}/schedule"
    params = {"start": "2026-09-07", "end": "2026-09-13", "limit": 1}
    first = client.get(path, params=params).json()
    cursor = first["next_cursor"]
    assert cursor
    assert client.get(path, params={**params, "cursor": cursor}).status_code == 200
    assert client.get(f"/api/dean/versions/{review['published'].id}/schedule",
                      params={**params, "cursor": cursor}).json()["detail"] == "stale_cursor"
    review["db"].execute(update(m.ScheduleVersion).where(m.ScheduleVersion.id == review["draft"].id)
                         .values(revision=m.ScheduleVersion.revision + 1))
    review["db"].commit()
    assert client.get(path, params={**params, "cursor": cursor}).json()["detail"] == "stale_cursor"


def test_review_revalidates_faculty_changes_during_read(client, review, monkeypatch):
    login(client, "dean@example.invalid")
    materialize = q.materialize
    calls = 0

    def changed_scope(db, *args, **kwargs):
        nonlocal calls
        result = materialize(db, *args, **kwargs)
        calls += 1
        if calls == 1:
            db.execute(update(m.Account).where(m.Account.id == review["dean"].id)
                       .values(faculty_id=review["faculty_b"].id))
            db.commit()
        return result

    monkeypatch.setattr(q, "materialize", changed_scope)
    response = client.get(f"/api/dean/versions/{review['draft'].id}/schedule",
                          params={"start": "2026-09-07", "end": "2026-09-13"})
    assert response.status_code == 404
    assert response.json()["detail"] == "version_not_found"
    assert response.headers["cache-control"] == "private, no-store"


def test_mixed_faculty_versions_hide_foreign_lessons_and_summary(client, review):
    db = review["db"]
    draft = db.get(m.ScheduleVersion, review["draft"].id)
    draft.cohort_ids = [review["group"].id, review["group_b"].id]
    draft.report = {**draft.report, "hours": [*draft.report["hours"], {
        "component_id": review["workload_b"].id, "required_hours": 2, "remaining_hours": 2
    }], "unplaced_occurrences": [review["occurrence_b"].id], "complete": False}
    db.add(m.Assignment(version_id=draft.id, occurrence_id=review["occurrence_b"].id,
        day=date(2026, 9, 7), slot=1, starts_at=time(9, 30), ends_at=time(10, 50),
        room_id=review["room"].id))
    db.commit()
    login(client, "dean@example.invalid")
    version = next(row for row in client.get("/api/dean/versions").json() if row["id"] == draft.id)
    assert version["cohort_ids"] == [review["group"].id]
    assert version["summary"] == {"complete": True, "required_hours": 8,
                                     "remaining_hours": 0, "unresolved": 0}
    path = f"/api/dean/versions/{draft.id}"
    lessons = client.get(path + "/schedule", params={"start": "2026-09-07", "end": "2026-09-13"}).json()
    assert {row["course_group_id"] for row in lessons["items"]} == {review["group"].id}
    assert client.get(path + "/diff").json()["total"] == 0
    response = client.post("/api/dean/suggestions", json=proposal(review,
        occurrence_id=review["occurrence_b"].id))
    assert response.status_code == 403
    assert response.json()["detail"] == "outside_faculty_scope"
    login(client, "dean.all@example.invalid")
    assert client.get(path + "/diff").json()["counts"]["added"] == 1
    assert client.post("/api/dean/suggestions", json=proposal(review,
        occurrence_id=review["occurrence_b"].id)).status_code == 201


def test_diff_changes_counts_pagination_and_scope(client, review):
    db = review["db"]
    rows = list(db.scalars(select(m.Assignment).where(m.Assignment.version_id == review["draft"].id)
                           .order_by(m.Assignment.id)))
    rows[0].slot = 2
    rows[0].starts_at, rows[0].ends_at = time(11), time(12, 20)
    rows[1].room_id = review["labroom"].id
    db.delete(rows[2])
    db.commit()
    login(client, "dean@example.invalid")
    path = f"/api/dean/versions/{review['draft'].id}/diff"
    first = client.get(path, params={"limit": 2})
    assert first.status_code == 200, first.text
    assert first.json()["total"] == 3
    assert first.json()["counts"] == {"added": 0, "removed": 1, "moved": 1,
                                         "room_changed": 1, "cancelled_changed": 0}
    assert len(first.json()["items"]) == 2
    last = client.get(path, params={"limit": 2, "offset": 2}).json()
    assert len(last["items"]) == 1
    assert last["items"][0]["changes"] == ["removed"]
    assert last["items"][0]["after"] is None
    assert client.get(path, params={"base": review["outside"].id}).status_code == 404
    assert client.get(path, params={"base": "nonsense"}).status_code == 422


@pytest.mark.parametrize("kind", ["move", "room", "cancel", "other"])
def test_suggestions_create_without_schedule_writes_and_private_audit(client, review, kind):
    login(client, "dean@example.invalid")
    before = invariant(review["db"])
    created = create(client, review, kind)
    assert created["status"] == "open"
    assert created["author"] == "Faculty dean"
    assert created["base_revision"] == review["draft"].revision
    assert created["comments"] == []
    assert not created["outdated"]
    assert invariant(review["db"]) == before
    audits = list(review["db"].scalars(select(m.AuditEvent).where(m.AuditEvent.action == "suggestion.created")))
    assert len(audits) == 1
    assert "Private" not in str(audits[0].changes)
    assert "title" not in audits[0].changes and "body" not in audits[0].changes
    assert client.get("/api/dean/suggestions").json()["counts"]["open"] == 1


@pytest.mark.parametrize("overrides", [
    {"occurrence_id": None}, {"proposed_day": None}, {"proposed_slot": None},
    {"proposed_day": "2026-10-01"}, {"proposed_slot": 144},
    {"proposed_room_id": 99999}, {"kind": "room", "proposed_room_id": 1},
    {"kind": "cancel"}, {"kind": "other"},
])
def test_invalid_move_combinations(client, review, overrides):
    login(client, "dean@example.invalid")
    response = client.post("/api/dean/suggestions", json={**proposal(review), **overrides})
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "invalid_proposal"


def test_scope_ownership_validation_and_suggestion_quota(client, review):
    login(client, "dean@example.invalid")
    assert client.post("/api/dean/suggestions", json=proposal(review, version_id=review["outside"].id)).status_code == 404
    assert client.post("/api/dean/suggestions", json=proposal(review, occurrence_id=99999)).status_code == 404
    created = create(client, review)
    login(client, "dean.other@example.invalid")
    assert client.get("/api/dean/suggestions").json()["total"] == 0
    for method, suffix, body in (("get", "", None), ("post", "/withdraw", None),
                                  ("post", "/comments", {"content": "Forbidden"})):
        response = client.request(method, f"/api/dean/suggestions/{created['id']}" + suffix, json=body)
        assert response.status_code == 404, response.text
    login(client, "dean@example.invalid")
    db = review["db"]
    db.add_all(m.ScheduleSuggestion(author_id=review["dean"].id, version_id=review["draft"].id,
        base_revision=1, kind="other", title="Quota", body="Quota", status="open") for _ in range(49))
    db.commit()
    response = client.post("/api/dean/suggestions", json=proposal(review))
    assert response.status_code == 409
    assert response.json()["detail"] == "suggestion_limit"


def test_suggestion_lifecycle_comments_concurrency_and_audit(client, review):
    login(client, "dean@example.invalid")
    before = invariant(review["db"])
    created = create(client, review)
    identifier = created["id"]
    assert client.post(f"/api/dean/suggestions/{identifier}/comments", json={"content": "Dean reply"}).status_code == 201
    login(client, "admin@example.invalid")
    assert client.post(f"/api/admin/suggestions/{identifier}/comments", json={"content": "Admin reply"}).status_code == 201
    path = f"/api/admin/suggestions/{identifier}"
    assert client.put(path + "/decision", json={"status": "rejected", "expected_status": "open"}).status_code == 422
    assert client.put(path + "/decision", json={"status": "accepted", "expected_status": "open"}).status_code == 200
    stale = client.put(path + "/decision", json={"status": "rejected", "expected_status": "open", "note": "Reason"})
    assert stale.status_code == 409
    assert stale.json()["detail"] == "suggestion_state_changed"
    assert client.post(path + "/implemented", json={"version_id": 99999, "expected_status": "accepted"}).status_code == 404
    assert client.post(path + "/implemented", json={"version_id": review["draft"].id,
                        "expected_status": "accepted"}).json()["status"] == "implemented"
    assert client.put(path + "/decision", json={"status": "accepted", "expected_status": "implemented"}).status_code == 409
    detail = client.get(path).json()
    assert [row["content"] for row in detail["comments"]] == ["Dean reply", "Admin reply"]
    assert all("email" not in row for row in detail["comments"])
    assert invariant(review["db"]) == before
    actions = set(review["db"].scalars(select(m.AuditEvent.action)))
    assert {"suggestion.created", "suggestion.decided", "suggestion.implemented"} <= actions
    assert "Private" not in str([row.changes for row in review["db"].scalars(select(m.AuditEvent))])


def test_withdraw_reject_and_closed_comment_rules(client, review):
    login(client, "dean@example.invalid")
    withdrawn = create(client, review)
    path = f"/api/dean/suggestions/{withdrawn['id']}"
    assert client.post(path + "/withdraw").json()["status"] == "withdrawn"
    assert client.post(path + "/withdraw").status_code == 409
    assert client.post(path + "/comments", json={"content": "No"}).json()["detail"] == "suggestion_closed"
    rejected = create(client, review)
    accepted = create(client, review)
    login(client, "admin@example.invalid")
    for row in (rejected, accepted):
        path = f"/api/admin/suggestions/{row['id']}"
        if row is accepted:
            assert client.put(path + "/decision", json={"status": "accepted", "expected_status": "open"}).status_code == 200
        assert client.put(path + "/decision", json={"status": "rejected",
            "expected_status": "accepted" if row is accepted else "open", "note": "Private reason"}).status_code == 200
        assert client.post(path + "/comments", json={"content": "Allowed"}).status_code == 201
    assert client.post(f"/api/admin/suggestions/{withdrawn['id']}/comments", json={"content": "No"}).status_code == 409


def test_check_reuses_move_validation_and_never_writes(client, review):
    login(client, "dean@example.invalid")
    suggestion = create(client, review)
    login(client, "admin@example.invalid")
    before = invariant(review["db"])
    path = f"/api/admin/suggestions/{suggestion['id']}/check"
    result = client.get(path, params={"version_id": review["draft"].id})
    assert result.status_code == 200, result.text
    assert result.json() == {"feasible": True, "issues": []}
    assert invariant(review["db"]) == before
    assert client.get(path, params={"version_id": review["published"].id}).json()["detail"] == "draft_required"
    # Put another lesson at the proposed time; checker and mutation report identical conflicts.
    row = review["db"].scalar(select(m.Assignment).where(
        m.Assignment.version_id == review["draft"].id,
        m.Assignment.occurrence_id != suggestion["occurrence_id"]))
    row.day, row.slot, row.starts_at, row.ends_at = date(2026, 9, 11), 2, time(11), time(12, 20)
    review["db"].commit()
    before = invariant(review["db"])
    checked = client.get(path, params={"version_id": review["draft"].id}).json()
    assert not checked["feasible"]
    assert {"teacher_conflict", "group_conflict"} <= {issue["code"] for issue in checked["issues"]}
    moved = client.put(f"/api/admin/schedule/versions/{review['draft'].id}/assignments/{suggestion['occurrence_id']}",
        json={"revision": review["draft"].revision, "day": "2026-09-11", "slot": 2,
              "room_id": review["assignments"][0].room_id})
    assert moved.status_code == 409
    assert moved.json()["detail"]["issues"] == checked["issues"]
    assert invariant(review["db"]) == before


def test_outdated_only_after_anchored_lesson_changes(client, review):
    login(client, "dean@example.invalid")
    suggestion = create(client, review)
    path = f"/api/dean/suggestions/{suggestion['id']}"
    db = review["db"]
    draft = db.get(m.ScheduleVersion, review["draft"].id)
    draft.revision += 1
    db.commit()
    assert not client.get(path).json()["outdated"]
    assignment = db.scalar(select(m.Assignment).where(m.Assignment.version_id == draft.id,
        m.Assignment.occurrence_id == suggestion["occurrence_id"]))
    assignment.room_id = review["labroom"].id
    db.commit()
    assert client.get(path).json()["outdated"]


def test_suggestion_csrf_origin_and_no_student_access(client, review):
    login(client, "dean@example.invalid")
    csrf = client.headers.pop("x-csrf-token")
    assert client.post("/api/dean/suggestions", json=proposal(review)).json()["detail"] == "csrf_failed"
    client.headers["x-csrf-token"] = csrf
    assert client.post("/api/dean/suggestions", headers={"Origin": "https://outside.invalid"},
                        json=proposal(review)).json()["detail"] == "origin_forbidden"
    login(client, "student@example.invalid")
    assert client.post("/api/dean/suggestions", json=proposal(review)).status_code == 403
    login(client, "teacher@example.invalid")
    assert client.get("/api/dean/suggestions").status_code == 403
