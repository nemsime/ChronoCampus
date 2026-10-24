from copy import deepcopy

import pytest

from app.calendar.rules import lesson_slot, parity, required_pairs, audiences_overlap
from app.scheduling.solver import generate
from app.scheduling.validation import validate


def sample_snapshot():
    return {
        "term": {
            "starts_on": "2026-09-07",
            "ends_on": "2026-09-18",
            "confirmed": True,
            "holiday_policy": "exempt",
        },
        "calendar": {
            "first_start": "09:30",
            "lesson_minutes": 80,
            "break_minutes": 10,
            "break_overrides": {"2": 30},
            "weekdays": [0, 1, 2, 3, 4],
            "ordinary_slots": 4,
            "operating_end": None,
            "academic_hours_per_lesson": 2,
            "teaching_weeks": 2,
            "confirmed": True,
        },
        "groups": [{"id": 1, "capacity": 20}],
        "subgroups": [],
        "lab_groups": [],
        "rooms": [
            {"id": 1, "capacity": 20, "room_type": "classroom", "equipment_ids": []},
            {"id": 2, "capacity": 20, "room_type": "lab", "equipment_ids": [1]},
        ],
        "teachers": [{"id": 1, "is_active": True}],
        "workloads": [
            {
                "id": 1,
                "course_group_id": 1,
                "small_group_id": None,
                "lab_group_id": None,
                "subject_id": 1,
                "teacher_id": 1,
                "lesson_type": "lecture",
                "semester_hours": 4,
                "equipment_ids": [],
                "preferred_daily_max": None,
            },
            {
                "id": 2,
                "course_group_id": 1,
                "small_group_id": None,
                "lab_group_id": None,
                "subject_id": 1,
                "teacher_id": 1,
                "lesson_type": "lab",
                "semester_hours": 4,
                "equipment_ids": [1],
                "preferred_daily_max": None,
            },
        ],
        "occurrences": [
            {"id": 1, "component_id": 1, "ordinal": 0},
            {"id": 2, "component_id": 1, "ordinal": 1},
            {"id": 3, "component_id": 2, "ordinal": 0},
            {"id": 4, "component_id": 2, "ordinal": 1},
        ],
        "availability": [],
        "holidays": [],
        "periods": [
            {
                "course_group_id": None,
                "starts_on": "2026-09-07",
                "ends_on": "2026-09-18",
            }
        ],
        "extra_permissions": [],
        "pins": [],
        "external": [],
    }


def test_dynamic_clock_and_partial_week_parity():
    config = sample_snapshot()["calendar"]
    assert lesson_slot(config, 5) == ("15:50", "17:10")
    assert lesson_slot(config, 6) == ("17:20", "18:40")
    assert parity("2026-09-02", "2026-09-04") == "numerator"
    assert parity("2026-09-02", "2026-09-07") == "denominator"
    config["operating_end"] = "18:00"
    with pytest.raises(ValueError, match="outside_operating_hours"):
        lesson_slot(config, 6)
    assert required_pairs(32, 2) == 16
    with pytest.raises(ValueError, match="indivisible"):
        required_pairs(31, 2)


@pytest.mark.parametrize("algorithm", ["cp_sat", "greedy_local"])
def test_complete_valid_generation_and_reproducibility(algorithm):
    snapshot = sample_snapshot()
    result = generate(snapshot, algorithm, seconds=3)
    assert result["report"]["complete"], result
    assert result["metrics"]["student_gaps"] == 0
    assert validate(snapshot, result["assignments"])["issues"] == []
    repeated = generate(snapshot, algorithm, seconds=3)
    assert result["assignments"] == repeated["assignments"]
    for component in (1, 2):
        ids = {
            o["id"] for o in snapshot["occurrences"] if o["component_id"] == component
        }
        assigned = [a for a in result["assignments"] if a["occurrence_id"] in ids]
        assert assigned[0]["slot"] == assigned[1]["slot"]


def test_no_laboratory_produces_partial_report_without_dropping_load():
    snapshot = sample_snapshot()
    snapshot["rooms"] = snapshot["rooms"][:1]
    result = generate(snapshot, seconds=2)
    assert not result["report"]["complete"]
    assert result["report"]["unplaced_occurrences"] == [3, 4]
    assert result["report"]["hours"][1]["remaining_hours"] == 4
    assert any(reason["code"] == "room_type" for reason in result["diagnostics"][3])


def test_pin_and_external_occupancy_are_preserved():
    snapshot = sample_snapshot()
    pin = {
        "occurrence_id": 1,
        "day": "2026-09-07",
        "slot": 1,
        "starts_at": "09:30",
        "ends_at": "10:50",
        "room_id": 1,
        "cancelled": False,
        "pinned": True,
    }
    snapshot["pins"] = [pin]
    result = generate(snapshot, seconds=2)
    assert result["report"]["complete"], result
    assert pin in result["assignments"]
    snapshot["external"] = [
        {
            **pin,
            "teacher_id": 1,
            "course_group_id": 9,
            "small_group_id": None,
            "lab_group_id": None,
        }
    ]
    impossible = generate(snapshot, seconds=2)
    assert impossible["status"] == "INVALID_PINS"


def test_holiday_is_cancelled_without_makeup_and_counts_separately():
    snapshot = sample_snapshot()
    snapshot["holidays"] = [{"day": f"2026-09-{day:02d}"} for day in range(7, 12)]
    result = generate(snapshot, seconds=2)
    assert result["report"]["complete"], result
    assert sum(a["cancelled"] for a in result["assignments"]) == 2
    assert all(
        h["planned_hours"] == 2 and h["cancelled_hours"] == 2
        for h in result["report"]["hours"]
    )


def test_manual_validation_catches_room_capacity_and_subgroup_overlap():
    snapshot = sample_snapshot()
    result = generate(snapshot, seconds=2)
    moved = deepcopy(result["assignments"])
    moved[1].update(
        {k: moved[0][k] for k in ("day", "slot", "starts_at", "ends_at", "room_id")}
    )
    assert "group_conflict" in {i["code"] for i in validate(snapshot, moved)["issues"]}
    assert audiences_overlap(
        {"course_group_id": 1, "small_group_id": None},
        {"course_group_id": 1, "small_group_id": 2},
    )
    assert not audiences_overlap(
        {"course_group_id": 1, "small_group_id": 1},
        {"course_group_id": 1, "small_group_id": 2},
    )


def test_extra_permission_does_not_override_room_closure():
    snapshot = sample_snapshot()
    snapshot["extra_permissions"] = [
        {
            "course_group_id": 1,
            "starts_on": "2026-09-07",
            "ends_on": "2026-09-18",
            "weekday": 0,
            "slots": [5, 6],
            "from_time": "15:50",
            "until_time": "18:40",
        }
    ]
    snapshot["availability"] = [
        {
            "teacher_id": None,
            "room_id": 2,
            "starts_on": "2026-09-07",
            "ends_on": "2026-09-07",
            "weekday": None,
            "parity": "every",
            "kind": "unavailable",
            "from_time": "15:00",
            "until_time": "19:00",
        }
    ]
    assignment = {
        "occurrence_id": 3,
        "day": "2026-09-07",
        "slot": 6,
        "starts_at": "17:20",
        "ends_at": "18:40",
        "room_id": 2,
        "cancelled": False,
    }
    assert "room_unavailable" in {
        i["code"] for i in validate(snapshot, [assignment])["issues"]
    }
    assignment["day"] = "2026-09-08"
    assert "slot_not_permitted" in {
        i["code"] for i in validate(snapshot, [assignment])["issues"]
    }


def test_missing_teaching_period_cannot_schedule_exams():
    snapshot = sample_snapshot()
    snapshot["periods"] = []
    result = generate(snapshot, seconds=1)
    assert result["assignments"] == []
    assert any(
        i["code"] == "teaching_period_required" for i in result["report"]["issues"]
    )
