from datetime import date

import pytest
from sqlalchemy import select
from test_workflow import campus as campus

from app.db import models as m
from app.scheduling.demo_reference import publish_demo_reference


def publish_reference(campus):
    db = campus["db"]
    group_id = campus["group"].id
    workload_ids = list(db.scalars(select(m.Workload.id).order_by(m.Workload.id)))
    fixture = {
        "term": {"academic_year_start": 2026, "starts_on": "2026-09-07"},
        "groups": [{"id": 1, "study_form": "present"}],
        "pairs": [{"slot": 1, "starts_at": "09:30", "ends_at": "10:50"}],
        "series": [
            {"id": 3, "slot": 1, "room_id": 2},
            {"id": 2, "slot": 1, "room_id": 1},
            {"id": 1, "slot": 1, "room_id": 1},
        ],
        "lessons": [
            {"series_id": 3, "day": "2026-09-17", "cancelled": False},
            {"series_id": 2, "day": "2026-09-07", "cancelled": False},
            {"series_id": 1, "day": "2026-09-14", "cancelled": False},
            {"series_id": 3, "day": "2026-09-10", "cancelled": False},
        ],
    }
    return publish_demo_reference(
        db, fixture,
        terms={"present": campus["term"].id},
        groups={1: group_id},
        workloads={1: workload_ids[0], 2: workload_ids[0], 3: workload_ids[1]},
        rooms={1: campus["room"].id, 2: campus["labroom"].id},
        actor_id=1,
    )


def test_reference_publication_uses_fixture_placements_and_is_idempotent(campus):
    db = campus["db"]
    result = publish_reference(campus)
    assert publish_reference(campus) == result
    version = db.get(m.ScheduleVersion, result["present"])
    pointer = db.get(m.PublishedGroup, (version.term_id, campus["group"].id))
    assert pointer.version_id == version.id
    assert version.status == "published" and version.report["complete"]
    placed = db.execute(
        select(m.Workload.lesson_type, m.Occurrence.ordinal, m.Assignment.day)
        .join(m.Occurrence, m.Occurrence.component_id == m.Workload.id)
        .join(m.Assignment, m.Assignment.occurrence_id == m.Occurrence.id)
        .order_by(m.Workload.lesson_type, m.Occurrence.ordinal)
    ).all()
    assert placed == [
        ("lab", 0, date(2026, 9, 10)), ("lab", 1, date(2026, 9, 17)),
        ("lecture", 0, date(2026, 9, 14)), ("lecture", 1, date(2026, 9, 7)),
    ]


def test_reference_publication_preserves_competing_schedule(campus):
    db = campus["db"]
    term_id, group_id = campus["term"].id, campus["group"].id
    other = campus["add"](
        m.ScheduleVersion, term_id=term_id, cohort_ids=[group_id], name="Earlier",
        status="published",
    )
    campus["add"](m.PublishedGroup, term_id=term_id, course_group_id=group_id, version_id=other.id)
    with pytest.raises(RuntimeError, match="already has a published timetable"):
        publish_reference(campus)
    assert db.get(m.PublishedGroup, (term_id, group_id)).version_id == other.id
    assert list(db.scalars(select(m.ScheduleVersion.id))) == [other.id]
