from datetime import date, timedelta

import pytest
from conftest import HASH
from pydantic import ValidationError
from test_workflow import campus as campus
from test_workflow import detail, draft, generate, login, publish

from app.db import models as m
from app.scheduling.router import MoveInput


def test_manual_move_accepts_explicitly_absent_room():
    values = {"revision": 1, "day": "2026-09-08", "slot": 2}
    assert MoveInput(**values, room_id=None).room_id is None
    with pytest.raises(ValidationError):
        MoveInput(**values)


def add_pe(campus):
    subject = campus["add"](m.Subject, name="Physical Education")
    component = campus["add"](
        m.Workload,
        term_id=campus["term"].id,
        course_group_id=campus["group"].id,
        subject_id=subject.id,
        teacher_id=None,
        lesson_type="pe",
        semester_hours=8,
    )
    campus["db"].commit()
    return component


def test_resource_free_pe_survives_generation_moves_and_publication(admin_client, campus):
    client = admin_client
    add_pe(campus)

    version = draft(client, campus)
    run = generate(client, version, campus)
    assert run["status"] == "complete", run
    generated = detail(client, version)
    pe = [lesson for lesson in generated["assignments"] if lesson["lesson_type"] == "pe"]
    assert len(pe) == 4
    assert all(
        all(lesson[key] is None for key in ("teacher_id", "teacher", "room_id", "room"))
        for lesson in pe
    )

    target = pe[0]
    path = f"/api/admin/schedule/versions/{version['id']}"
    day = date.fromisoformat(target["day"])
    start = day - timedelta(days=day.weekday())
    occupied = {(row["day"], row["slot"]) for row in generated["assignments"]}
    pe_days = {lesson["day"] for lesson in pe}
    replacement_day, slot = next(
        (other_day, other_slot)
        for index in range(5)
        if (other_day := str(start + timedelta(days=index))) not in pe_days
        for other_slot in range(1, 5)
        if (other_day, other_slot) not in occupied
    )
    placement = dict(
        revision=generated["version"]["revision"], day=replacement_day, slot=slot, room_id=None,
    )
    wrong_room = client.put(
        path + f"/assignments/{target['occurrence_id']}",
        json=dict(placement, room_id=campus["room"].id),
    )
    assert wrong_room.status_code == 409, wrong_room.text
    replaced = client.put(path + f"/assignments/{target['occurrence_id']}", json=placement)
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["report"]["complete"]

    publish(client, dict(version, revision=replaced.json()["revision"]))
    admin_read = client.get("/api/schedule", params={"lesson_type": "pe"})
    assert admin_read.status_code == 200, admin_read.text
    assert len(admin_read.json()) == len(pe)
    login(client, "student@example.invalid")
    page = client.get(
        "/api/schedule/page",
        params={"start": "2026-09-07", "end": "2026-09-18", "lesson_type": "pe"},
    )
    assert page.status_code == 200, page.text
    lessons = page.json()["items"]
    assert {row["occurrence_id"] for row in lessons} == {row["occurrence_id"] for row in pe}
    assert all(row["room"] is row["teacher"] is None for row in lessons)
    assert next(
        row["day"] for row in lessons if row["occurrence_id"] == target["occurrence_id"]
    ) == replacement_day

    facets = client.get("/api/schedule/facets").json()["filters"]
    assert {"id": "pe", "label": "pe"} in facets["lesson_type"]
    for key in ("teacher_id", "room_id"):
        assert facets[key]
        assert all(choice["id"] is not None for choice in facets[key])

    login(client, "teacher@example.invalid")
    assert client.get("/api/schedule", params={"lesson_type": "pe"}).json() == []

    login(client, "admin@example.invalid")
    version = draft(client, campus)
    path = f"/api/admin/schedule/versions/{version['id']}"
    closed = client.post(
        path + "/closures",
        json=dict(
            revision=version["revision"],
            starts_on=replacement_day,
            ends_on=replacement_day,
            cohort_ids=version["cohort_ids"],
            reason="PE makeup test",
        ),
    )
    assert closed.status_code == 201, closed.text
    template = client.get(
        "/api/schedule/template", params={"version_id": version["id"], "lesson_type": "pe"},
    )
    assert template.status_code == 200, template.text
    pending = next(
        row
        for semester in template.json()["semesters"]
        for row in semester["exceptions"]
        if row["occurrence_id"] == target["occurrence_id"]
    )
    assert pending["reason"] == "makeup_pending"
    assert pending["teacher"] is pending["room"] is pending["original"]["room"] is None


def test_dean_can_request_a_resource_free_pe_move(admin_client, campus):
    client = admin_client
    component = add_pe(campus)
    dean = campus["add"](
        m.Account,
        email="dean@example.invalid",
        display_name="Dean",
        role="dean",
        faculty_id=campus["faculty"].id,
        password_hash=HASH,
        must_change_password=False,
    )
    campus["db"].commit()
    version = draft(client, campus)
    assignments = detail(client, version)
    occurrence = next(
        row for row in assignments["occurrences"] if row["component_id"] == component.id
    )
    moved = client.put(
        f"/api/admin/schedule/versions/{version['id']}/assignments/{occurrence['id']}",
        json={"revision": version["revision"], "day": "2026-09-07", "slot": 1, "room_id": None},
    )
    assert moved.status_code == 200, moved.text

    login(client, dean.email)
    suggestion = client.post(
        "/api/dean/suggestions",
        json=dict(
            version_id=version["id"],
            occurrence_id=occurrence["id"],
            kind="move",
            title="Move PE once",
            body="The cohort is unavailable at the original time.",
            proposed_day="2026-09-08",
            proposed_slot=2,
        ),
    )
    assert suggestion.status_code == 201, suggestion.text

    login(client, "admin@example.invalid")
    checked = client.get(
        f"/api/admin/suggestions/{suggestion.json()['id']}/check",
        params={"version_id": version["id"]},
    )
    assert checked.status_code == 200, checked.text
    assert checked.json() == {"feasible": True, "issues": []}
