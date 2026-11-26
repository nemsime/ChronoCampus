from collections import Counter, defaultdict
from datetime import date
from types import SimpleNamespace

import pytest
from conftest import HASH, PASSWORD
from sqlalchemy import func, select

from app import demo
from app.db import models as m
from app.demo_synthetic import load_fixture, populate_synthetic_demo
from app.scheduling.router import execute_run


@pytest.fixture
def fast_demo_credentials(monkeypatch):
    # Reuse the suite's valid test password so hashing 524 demo users does not
    # dominate this round trip. Sign-in still uses the emitted seed credentials.
    monkeypatch.setattr(demo, "secrets", SimpleNamespace(token_urlsafe=lambda _: PASSWORD))
    monkeypatch.setattr(demo, "password_hash", lambda _: HASH)


def test_synthetic_demo_generates_both_timetables(client, database, fast_demo_credentials):
    fixture = load_fixture()
    credentials = {}
    summary = populate_synthetic_demo(database, fixture, credentials)
    database.commit()

    assert summary["created_accounts"] == 524
    assert Counter(row["role"] for row in credentials.values()) == {
        "student": 494, "lecturer": 26, "dean": 2, "admin": 2,
    }
    assert {row["name"] for row in credentials.values()} == {
        row["display_name"] for row in fixture["users"]
    }
    assert database.scalar(select(func.count()).select_from(m.ScheduleVersion)) == 0
    assert database.scalar(select(func.count()).select_from(m.Assignment)) == 0

    first_passwords = credentials.copy()
    again = populate_synthetic_demo(database, fixture, credentials)
    database.commit()
    assert again["created_accounts"] == 0
    assert credentials == first_passwords
    assert database.scalar(select(func.count()).select_from(m.Account)) == 525

    email = next(email for email, record in credentials.items() if record["role"] == "admin")
    password = credentials[email]["password"]
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf_token"]

    cohorts = {
        group.group_code: group.id for group in database.scalars(select(m.CourseGroup))
    }
    lecturers = {
        account.display_name: account.id
        for account in database.scalars(select(m.Account).where(m.Account.role == "lecturer"))
    }
    components = list(database.scalars(select(m.Workload)))
    for course in fixture["groups"]:
        key = cohorts[course["group_code"]]
        loads = [row for row in components if row.course_group_id == key]
        pe = [row for row in loads if row.lesson_type == "pe"]
        assert len(pe) == (1 if course["year"] <= 2 else 0)
        if pe:
            assert pe[0].teacher_id is None and pe[0].semester_hours == 64
        hands_on = [row for row in loads if row.lesson_type in {"practical", "lab"}]
        assert {row.lesson_type for row in hands_on} == {"practical", "lab"}
        reference = next(
            row for row in fixture["series"]
            if row["course_group_id"] == course["id"] and row["lesson_type"] == "lab"
        )
        teacher = next(row for row in fixture["teachers"] if row["id"] == reference["teacher_id"])
        assert {row.teacher_id for row in hands_on} == {lecturers[teacher["display_name"]]}
        assert database.scalar(select(func.count()).select_from(m.Account).where(
            m.Account.course_group_id == key
        )) == course["capacity"]

    for term_id in summary["terms"].values():
        database.get(m.Term, term_id).search_seconds = 22
    database.commit()

    total_assignments = 0
    for form, cohort_count in (("present", 8), ("remote", 5)):
        group_ids = [
            cohorts[row["group_code"]] for row in fixture["groups"] if row["study_form"] == form
        ]
        assert len(group_ids) == cohort_count
        term_id = summary["terms"][form]
        response = client.post("/api/admin/schedule/versions", json={
            "name": f"Synthetic {form}",
            "term_id": term_id,
            "cohort_ids": group_ids,
        })
        assert response.status_code == 201, response.text
        version = response.json()
        response = client.post(f"/api/admin/schedule/versions/{version['id']}/generate", json={
            "revision": version["revision"],
        })
        assert response.status_code == 202, response.text
        run_id = database.scalar(select(m.GenerationRun.id).where(
            m.GenerationRun.version_id == version["id"]
        ))
        execute_run(database.get_bind(), run_id)
        database.expire_all()

        run = client.get(f"/api/admin/schedule/runs/{run_id}").json()
        assert run["status"] == "complete", (form, run["status"], run["summary"], run["result"])
        response = client.get(f"/api/admin/schedule/versions/{version['id']}")
        assert response.status_code == 200, response.text
        detail = response.json()
        assert detail["report"]["complete"], detail["report"]

        assignments = database.execute(
            select(m.Assignment, m.Workload)
            .join(m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id)
            .join(m.Workload, m.Occurrence.component_id == m.Workload.id)
            .where(m.Assignment.version_id == version["id"])
        ).all()
        assert len(assignments) == (
            sum(row.semester_hours for row in components if row.term_id == term_id) // 2
        )
        total_assignments += len(assignments)
        pe_weeks = defaultdict(list)
        hands_on_days = defaultdict(Counter)
        hands_on_slots = defaultdict(list)
        start = date.fromisoformat(fixture["term"]["starts_on"])
        for assignment, workload in assignments:
            week = (assignment.day - start).days // 7
            if workload.lesson_type == "pe":
                assert assignment.room_id is None
                pe_weeks[(workload.course_group_id, week)].append(assignment.day)
            elif workload.lesson_type in {"practical", "lab"}:
                assert assignment.room_id is not None
                for kind in ("all", workload.lesson_type):
                    hands_on_days[(workload.course_group_id, week, kind)][assignment.day.weekday()] += 1
                if not assignment.cancelled:
                    hands_on_slots[(workload.course_group_id, week)].append(
                        (assignment.day, assignment.slot)
                    )
            else:
                assert assignment.room_id is not None
        eligible = {cohorts[row["group_code"]] for row in fixture["groups"]
                    if row["study_form"] == form and row["year"] <= 2}
        assert pe_weeks.keys() == {
            (group, week) for group in eligible for week in range(16)
        }
        assert all(len(days) == len(set(days)) == 2 for days in pe_weeks.values())
        assert all(len(slots) == len(set(slots)) for slots in hands_on_slots.values())

        for counts in hands_on_days.values():
            daily_counts = [counts[day] for day in fixture["term"]["weekdays"]]
            assert max(daily_counts) - min(daily_counts) <= 1, daily_counts


    assert total_assignments == 2464


@pytest.mark.parametrize("preexisting_rooms", [0, 1, 2])
def test_reference_publication_matches_fixture_on_separate_local_databases(
    database, client, fast_demo_credentials, preexisting_rooms,
):
    # Different installations may have different catalog primary keys.
    building = m.Building(building_number=1)
    database.add(building)
    database.flush()
    database.add_all(
        m.Room(
            building_id=building.id, room_number=f"LOCAL-{index}", floor_number=1,
            room_on_floor=index, capacity=10, room_type="classroom",
        )
        for index in range(1, preexisting_rooms + 1)
    )
    database.commit()
    fixture = load_fixture()
    credentials = {}
    first = populate_synthetic_demo(database, fixture, credentials, publish_reference=True)
    database.commit()
    again = populate_synthetic_demo(database, fixture, credentials, publish_reference=True)
    database.commit()

    versions = first["published_versions"]
    assert versions.keys() == {"present", "remote"}
    assert again["published_versions"] == versions
    assert again["created_accounts"] == 0
    assert database.scalar(select(func.count()).select_from(m.ScheduleVersion)) == 2
    assert database.scalar(select(func.count()).select_from(m.PublishedGroup)) == 13

    stored = database.execute(
        select(
            m.CourseGroup.group_code, m.Assignment.day, m.Assignment.slot,
            m.Room.room_number, m.Workload.lesson_type, m.Assignment.cancelled,
        ).select_from(m.Assignment)
        .join(m.Occurrence, m.Assignment.occurrence_id == m.Occurrence.id)
        .join(m.Workload, m.Occurrence.component_id == m.Workload.id)
        .join(m.CourseGroup, m.Workload.course_group_id == m.CourseGroup.id)
        .outerjoin(m.Room, m.Assignment.room_id == m.Room.id)
    ).all()
    series = {row["id"]: row for row in fixture["series"]}
    groups = {row["id"]: row["group_code"] for row in fixture["groups"]}
    rooms = {row["id"]: row["room_number"] for row in fixture["rooms"]}
    expected = []
    for lesson in fixture["lessons"]:
        recurrence = series[lesson["series_id"]]
        expected.append((
            groups[recurrence["course_group_id"]], date.fromisoformat(lesson["day"]),
            recurrence["slot"], rooms.get(recurrence["room_id"]),
            recurrence["lesson_type"], lesson["cancelled"],
        ))
    assert Counter(stored) == Counter(expected)

    email = "synthetic-admin-523@example.invalid"
    login = client.post("/api/auth/login", json={"email": email, "password": credentials[email]["password"]})
    assert login.status_code == 200, login.text
    response = client.get("/api/schedule/template")
    assert response.status_code == 200, response.text
    semesters = response.json()["semesters"]
    assert {semester["version_id"] for semester in semesters} == set(versions.values())
    notices = Counter(
        (item["group"], date.fromisoformat(item["day"]), item["slot"], item["room"], item["lesson_type"], True)
        for semester in semesters for item in semester["exceptions"]
        if item["reason"] == "holiday_cancelled" and not item.get("unresolved")
    )
    assert notices
    assert notices == Counter(row for row in expected if row[-1])
