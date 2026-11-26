from collections import Counter

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from test_alignment_migrations import migration as load_migration
from test_scheduling import sample_snapshot
from test_workflow import campus as campus

from app.academics.router import save_record
from app.calendar.rules import week_index
from app.db import models as m
from app.scheduling.solver import generate
from app.scheduling.validation import validate


def pe_snapshot():
    snapshot = sample_snapshot()
    snapshot["term"]["academic_year"] = "2026–2027"
    snapshot["groups"] = [
        {"id": 1, "capacity": 20, "admission_year": 2026},
        {"id": 2, "capacity": 20, "admission_year": 2025},
    ]
    snapshot["rooms"] = []
    snapshot["teachers"] = []
    snapshot["workloads"] = [
        {
            **snapshot["workloads"][0],
            "id": group_id,
            "course_group_id": group_id,
            "teacher_id": None,
            "lesson_type": "pe",
            "semester_hours": 8,
        }
        for group_id in (1, 2)
    ]
    snapshot["occurrences"] = [
        {"id": (group_id - 1) * 4 + ordinal + 1, "component_id": group_id, "ordinal": ordinal}
        for group_id in (1, 2)
        for ordinal in range(4)
    ]
    return snapshot


@pytest.mark.parametrize("algorithm", ["cp_sat", "greedy_local"])
def test_pe_occupies_the_cohort_twice_a_week_on_separate_days_without_resources(algorithm):
    snapshot = pe_snapshot()
    snapshot["availability"] = [
        {
            "teacher_id": None, "room_id": 9, "kind": "unavailable",
            "starts_on": snapshot["term"]["starts_on"], "ends_on": snapshot["term"]["ends_on"],
            "weekday": None, "parity": "every", "from_time": "09:00", "until_time": "18:00",
        }
    ]
    result = generate(snapshot, algorithm, seconds=3)

    assert result["report"]["complete"], result
    assert {row["room_id"] for row in result["assignments"]} == {None}
    times_by_group = []
    for group_id in (1, 2):
        ids = {o["id"] for o in snapshot["occurrences"] if o["component_id"] == group_id}
        times = {(a["day"], a["slot"]) for a in result["assignments"] if a["occurrence_id"] in ids}
        assert Counter(week_index(snapshot["term"]["starts_on"], day) for day, _ in times) == {0: 2, 1: 2}
        assert len({day for day, _ in times}) == 4
        times_by_group.append(times)
    assert times_by_group[0] & times_by_group[1]


def test_pe_without_a_room_or_teacher_conflicts_only_when_audience_overlaps():
    snapshot = pe_snapshot()
    placement = {
        "day": "2026-09-07",
        "slot": 1,
        "starts_at": "09:30",
        "ends_at": "10:50",
        "room_id": None,
    }
    snapshot["external"] = [
        {**placement, "course_group_id": 3, "teacher_id": None, "small_group_id": None, "lab_group_id": None}
    ]
    assignments = [{**placement, "occurrence_id": identifier} for identifier in (1, 5)]
    assert validate(snapshot, assignments)["issues"] == []

    same_cohort = {**placement, "occurrence_id": 2}
    assert {issue["code"] for issue in validate(snapshot, [assignments[0], same_cohort])["issues"]} == {
        "group_conflict", "pe_same_day"
    }

    snapshot["external"][0]["course_group_id"] = 1
    assert {issue["code"] for issue in validate(snapshot, assignments)["issues"]} == {
        "external_group_conflict"
    }


def test_pe_catalog_validates_year_weekly_load_and_unique_cohort_block(campus):
    term = campus["term"]
    cohort = campus["group"]
    db = campus["db"]
    actor = db.scalar(select(m.Account).where(m.Account.role == "admin"))
    subject = m.Subject(name="Ֆիզիկական դաստիարակություն")
    db.add(subject)
    db.flush()
    subject_id = subject.id
    cohort.admission_year = term.starts_on.year - 2
    db.commit()

    body = {
        "term_id": term.id,
        "course_group_id": cohort.id,
        "subject_id": subject_id,
        "lesson_type": "pe",
        "semester_hours": 8,
    }
    with pytest.raises(HTTPException) as ineligible:
        save_record("workloads", body, db, actor)
    assert ineligible.value.status_code == 422
    assert ineligible.value.detail == "pe_year_ineligible"
    db.rollback()

    cohort.admission_year = term.starts_on.year - 1
    db.commit()
    with pytest.raises(HTTPException) as wrong_hours:
        save_record("workloads", {**body, "semester_hours": 4}, db, actor)
    assert wrong_hours.value.status_code == 422
    assert wrong_hours.value.detail == "pe_weekly_hours"
    db.rollback()

    created = save_record("workloads", body, db, actor)
    assert created["teacher_id"] is None
    with pytest.raises(HTTPException) as duplicate:
        save_record("workloads", body, db, actor)
    assert duplicate.value.status_code == 422
    assert duplicate.value.detail == "pe_already_exists"


def test_pe_migration_preserves_legacy_rows_and_guards_downgrade():
    migration = load_migration("0010_physical_education")
    with (
        create_engine("sqlite://").begin() as conn,
        Operations.context(MigrationContext.configure(conn)),
    ):
        for sql in (
            "CREATE TABLE User(id INTEGER PRIMARY KEY)",
            "CREATE TABLE Room(id INTEGER PRIMARY KEY)",
            "CREATE TABLE CurriculumComponent(id INTEGER PRIMARY KEY, term_id INTEGER, course_group_id INTEGER, small_group_id INTEGER, lab_group_id INTEGER, lesson_type TEXT NOT NULL, teacher_id INTEGER NOT NULL REFERENCES User(id))",
            "CREATE TABLE LessonOccurrence(id INTEGER PRIMARY KEY, component_id INTEGER REFERENCES CurriculumComponent(id))",
            "CREATE TABLE LessonAssignment(id INTEGER PRIMARY KEY, occurrence_id INTEGER REFERENCES LessonOccurrence(id), room_id INTEGER NOT NULL REFERENCES Room(id))",
            "INSERT INTO User VALUES(7)",
            "INSERT INTO Room VALUES(8)",
            "INSERT INTO CurriculumComponent VALUES(10,1,2,NULL,NULL,'lecture',7)",
            "INSERT INTO LessonOccurrence VALUES(20,10)",
            "INSERT INTO LessonAssignment VALUES(30,20,8)",
        ):
            conn.execute(text(sql))

        migration.upgrade()
        assert conn.execute(text("SELECT * FROM CurriculumComponent")).one() == (10, 1, 2, None, None, "lecture", 7)
        assert conn.execute(text("SELECT * FROM LessonAssignment")).one() == (30, 20, 8)
        assert {key["referred_table"] for key in inspect(conn).get_foreign_keys("LessonAssignment")} == {"LessonOccurrence", "Room"}

        conn.execute(text("INSERT INTO CurriculumComponent VALUES(11,1,2,NULL,NULL,'pe',NULL)"))
        conn.execute(text("INSERT INTO LessonOccurrence VALUES(21,11)"))
        conn.execute(text("INSERT INTO LessonAssignment VALUES(31,21,NULL)"))
        for sql in (
            "INSERT INTO CurriculumComponent VALUES(12,1,2,NULL,NULL,'pe',NULL)",
            "INSERT INTO CurriculumComponent VALUES(12,1,3,NULL,NULL,'lecture',NULL)",
            "INSERT INTO CurriculumComponent VALUES(12,1,3,5,NULL,'pe',NULL)",
        ):
            with pytest.raises(IntegrityError):
                conn.execute(text(sql))
        with pytest.raises(RuntimeError, match="Remove Physical Education"):
            migration.downgrade()

        conn.execute(text("DELETE FROM LessonAssignment WHERE id = 31"))
        conn.execute(text("DELETE FROM LessonOccurrence WHERE id = 21"))
        conn.execute(text("DELETE FROM CurriculumComponent WHERE id = 11"))
        migration.downgrade()
        assert conn.execute(text("SELECT * FROM LessonAssignment")).one() == (30, 20, 8)
        assert conn.execute(text("PRAGMA foreign_key_check")).all() == []
