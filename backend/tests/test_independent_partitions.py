from copy import deepcopy

import pytest
from sqlalchemy import select
from test_scheduling import sample_snapshot
from test_workflow import campus as campus
from test_workflow import detail, draft, generate, login, publish

from app.calendar.rules import audience_leaves, audience_size, audiences_overlap
from app.db import models as m
from app.scheduling.validation import validate


def audience(group=1, practical=None, lab=None):
    return dict(course_group_id=group, small_group_id=practical, lab_group_id=lab)


@pytest.mark.parametrize(
    "first,second,overlap",
    [
        (audience(), audience(lab=1), True),
        (audience(), audience(practical=1), True),
        (audience(practical=1), audience(practical=2), False),
        (audience(practical=1), audience(practical=1), True),
        (audience(lab=1), audience(lab=2), False),
        (audience(lab=1), audience(lab=1), True),
        (audience(practical=1), audience(lab=2), True),
        (audience(practical=1), audience(group=2, lab=3), False),
    ],
)
def test_partition_contract_in_validator_and_solver(first, second, overlap):
    snapshot = sample_snapshot()
    snapshot["groups"].append({"id": 2, "capacity": 10})
    snapshot["subgroups"] = [dict(id=i, capacity=10, course_group_id=1) for i in (1, 2)]
    snapshot["lab_groups"] = [
        dict(id=i, capacity=10, small_group_id=None, course_group_id=2 if i == 3 else 1)
        for i in (1, 2, 3)
    ]
    assert audiences_overlap(first, second) is overlap
    assert (
        bool(
            audience_leaves(snapshot, first).keys()
            & audience_leaves(snapshot, second).keys()
        )
        is overlap
    )
    snapshot["workloads"][0].update(first)
    snapshot["workloads"][1].update(second)
    snapshot["workloads"][1]["teacher_id"] = 2
    snapshot["teachers"].append({"id": 2, "is_active": True})
    row = dict(
        occurrence_id=1,
        day="2026-09-07",
        slot=1,
        starts_at="09:30",
        ends_at="10:50",
        room_id=1,
        cancelled=False,
    )
    issues = validate(snapshot, [row, dict(row, occurrence_id=3, room_id=2)])["issues"]
    assert any(issue["code"] == "group_conflict" for issue in issues) is overlap


def test_independent_partitions_catalog_generation_capacity_and_student_projection(
    admin_client, campus
):
    db = campus["db"]

    # Start a second cohort alongside the retained nested cohort.
    def add(path, body):
        response = admin_client.post("/api/admin/catalog/" + path, json=body)
        assert response.status_code == 201, response.text
        return response.json()

    group = add(
        "groups",
        dict(
            major_id=campus["major"].id,
            admission_year=campus["group"].admission_year,
            group_code="QA-3P5L",
            capacity=60,
        ),
    )
    practicals = [
        add("subgroups", dict(course_group_id=group["id"], label=f"P{i}", capacity=20))
        for i in range(3)
    ]
    labs = [
        add("lab-groups", dict(course_group_id=group["id"], label=f"L{i}", capacity=12))
        for i in range(5)
    ]
    assert all(lab["small_group_id"] is None for lab in labs)
    common = dict(
        term_id=campus["term"].id,
        semester_hours=2,
        subject_id=campus["subject"].id,
        course_group_id=group["id"],
        teacher_id=campus["teacher"].id,
    )
    for practical in practicals:
        add(
            "workloads",
            dict(common, lesson_type="practical", small_group_id=practical["id"]),
        )
    for lab in labs:
        add("workloads", dict(common, lesson_type="lab", lab_group_id=lab["id"]))
    # The room cannot hold the cohort, but it fits one lab exactly.
    campus["labroom"].capacity = 12
    student = campus["student"]
    student.course_group_id, student.small_group_id, student.lab_group_id = (
        group["id"],
        practicals[1]["id"],
        labs[4]["id"],
    )
    db.commit()
    scoped = {**campus, "group": db.get(m.CourseGroup, group["id"])}
    version = draft(admin_client, scoped)
    assert generate(admin_client, version, scoped)["status"] == "complete"
    draft_detail = detail(admin_client, version)
    assert draft_detail["report"]["issues"] == []
    assert len(draft_detail["assignments"]) == 8
    from app.scheduling.snapshot import build_snapshot

    snapshot = build_snapshot(db, db.get(m.ScheduleVersion, version["id"]))
    workload = next(c for c in snapshot["workloads"] if c["lab_group_id"])
    assert audience_size(snapshot, workload) == 12
    smaller = deepcopy(snapshot)
    next(r for r in smaller["rooms"] if r["id"] == campus["labroom"].id)["capacity"] = (
        11
    )
    assert any(
        issue["code"] == "room_capacity"
        for issue in validate(smaller, draft_detail["assignments"])["issues"]
    )
    publish(admin_client, draft_detail["version"])
    login(admin_client, "student@example.invalid")
    rows = admin_client.get("/api/schedule").json()
    assert len(rows) == 2
    assert {r["lab_group_id"] for r in rows} == {None, labs[4]["id"]}
    assert {r["small_group_id"] for r in rows} == {None, practicals[1]["id"]}
    assert db.scalar(
        select(m.LabGroup.small_group_id).where(m.LabGroup.id == campus["lab"].id)
    )
