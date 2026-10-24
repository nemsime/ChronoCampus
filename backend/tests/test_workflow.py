from datetime import date, time
import pytest
from sqlalchemy import select

from app.db import models as m
from app.scheduling.router import execute_run
from conftest import HASH, PASSWORD


@pytest.fixture
def campus(database, monkeypatch):
    db = database

    def add(model, **values):
        row = model(**values)
        db.add(row)
        db.flush()
        return row

    faculty = add(m.Faculty, name="Test faculty", code="TF")
    major = add(
        m.Major,
        name="Test major",
        major_code=1,
        faculty_id=faculty.id,
        study_form="present",
        duration_yrs=4,
    )
    group = add(
        m.CourseGroup,
        major_id=major.id,
        group_code="T1",
        admission_year=2026,
        capacity=20,
    )
    small = add(m.SmallGroup, course_group_id=group.id, label="A", capacity=20)
    lab = add(m.LabGroup, small_group_id=small.id, label="1", capacity=10)
    teacher = add(
        m.Account,
        email="teacher@example.invalid",
        display_name="Fictional teacher",
        role="lecturer",
        password_hash=HASH,
        must_change_password=False,
    )
    student = add(
        m.Account,
        email="student@example.invalid",
        display_name="Fictional student",
        role="student",
        password_hash=HASH,
        must_change_password=False,
        course_group_id=group.id,
        small_group_id=small.id,
        lab_group_id=lab.id,
    )
    outsider = add(
        m.Account,
        email="other@example.invalid",
        display_name="Other user",
        role="lecturer",
        password_hash=HASH,
        must_change_password=False,
    )
    building = add(m.Building, building_number=1, name="B", address="")
    room = add(
        m.Room,
        building_id=building.id,
        room_number="101",
        floor_number=1,
        room_on_floor=1,
        capacity=20,
        room_type="classroom",
    )
    labroom = add(
        m.Room,
        building_id=building.id,
        room_number="102",
        floor_number=1,
        room_on_floor=2,
        capacity=20,
        room_type="lab",
    )
    calendar = add(
        m.CalendarConfig,
        name="Test",
        study_form="present",
        first_start=time(9, 30),
        lesson_minutes=80,
        break_minutes=10,
        break_overrides={"2": 30},
        weekdays=[0, 1, 2, 3, 4],
        ordinary_slots=4,
        academic_hours_per_lesson=2,
        teaching_weeks=2,
        confirmed=True,
    )
    term = add(
        m.Term,
        name="Test term",
        academic_year="2026",
        starts_on=date(2026, 9, 7),
        ends_on=date(2026, 9, 18),
        calendar_id=calendar.id,
        holiday_policy="exempt",
        confirmed=True,
        search_seconds=2,
    )
    add(
        m.TeachingPeriod,
        term_id=term.id,
        starts_on=term.starts_on,
        ends_on=term.ends_on,
    )
    subject = add(m.Subject, name="QA")
    for kind in ["lecture", "lab"]:
        add(
            m.Workload,
            term_id=term.id,
            course_group_id=group.id,
            subject_id=subject.id,
            teacher_id=teacher.id,
            lesson_type=kind,
            semester_hours=4,
            equipment_ids=[],
        )
    db.commit()
    pending = []
    monkeypatch.setattr(
        "app.scheduling.router.executor.submit",
        lambda function, engine, identifier: pending.append((engine, identifier)),
    )
    return locals()


def login(client, email):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf_token"]


def draft(client, campus):
    response = client.post(
        "/api/admin/schedule/versions",
        json={
            "name": "Candidate",
            "term_id": campus["term"].id,
            "cohort_ids": [campus["group"].id],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def generate(client, version, campus):
    response = client.post(
        f"/api/admin/schedule/versions/{version['id']}/generate",
        json={"revision": version["revision"]},
    )
    assert response.status_code == 202, response.text
    engine, identifier = campus["pending"].pop()
    execute_run(engine, identifier)
    campus["db"].expire_all()
    return client.get(f"/api/admin/schedule/runs/{identifier}").json()


def detail(client, version):
    response = client.get(f"/api/admin/schedule/versions/{version['id']}")
    assert response.status_code == 200, response.text
    return response.json()


def publish(client, version):
    response = client.post(
        f"/api/admin/schedule/versions/{version['id']}/publish",
        json={"revision": version["revision"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_generation_publication_note_survives_move_and_privacy(admin_client, campus):
    client = admin_client
    v = draft(client, campus)
    assert client.get("/api/schedule").json() == []
    assert (
        client.post(
            f"/api/admin/schedule/versions/{v['id']}/publish",
            json={"revision": v["revision"]},
        ).status_code
        == 409
    )
    assert generate(client, v, campus)["status"] == "complete"
    d = detail(client, v)
    assert d["report"]["complete"]
    publish(client, d["version"])
    login(client, "student@example.invalid")
    lessons = client.get("/api/schedule").json()
    assert len(lessons) == 4
    lesson = lessons[0]
    note = client.put(
        f"/api/notes/{lesson['occurrence_id']}", json={"content": "Prepare the lab"}
    ).json()
    assert client.get("/api/admin/catalog/users").status_code == 403
    login(client, "other@example.invalid")
    assert client.get("/api/notes").json() == []
    assert client.get("/api/schedule").json() == []
    assert client.delete(f"/api/notes/{note['id']}").status_code == 404
    login(client, "admin@example.invalid")
    second = draft(client, campus)
    # A date with no existing lessons: the old publication remains visible until commit.
    new_day = "2026-09-11"
    if any(a["day"] == new_day for a in lessons):
        new_day = "2026-09-10"
    move = client.put(
        f"/api/admin/schedule/versions/{second['id']}/assignments/{lesson['occurrence_id']}",
        json={
            "revision": second["revision"],
            "day": new_day,
            "slot": 1,
            "room_id": lesson["room_id"],
            "pinned": True,
        },
    )
    assert move.status_code == 200, move.text
    assert (
        next(
            a
            for a in client.get("/api/schedule").json()
            if a["occurrence_id"] == lesson["occurrence_id"]
        )["day"]
        == lesson["day"]
    )
    second = detail(client, second)["version"]
    publish(client, second)
    login(client, "student@example.invalid")
    moved = next(
        a
        for a in client.get("/api/schedule").json()
        if a["occurrence_id"] == lesson["occurrence_id"]
    )
    assert moved["day"] == new_day
    assert client.get("/api/notes").json()[0]["id"] == note["id"]


def test_stale_job_does_not_overwrite_draft(admin_client, campus):
    client = admin_client
    v = draft(client, campus)
    response = client.post(
        f"/api/admin/schedule/versions/{v['id']}/generate",
        json={"revision": v["revision"]},
    )
    assert response.status_code == 202
    assert (
        client.post(
            "/api/admin/catalog/subjects", json={"name": "New subject"}
        ).status_code
        == 201
    )
    execute_run(*campus["pending"].pop())
    campus["db"].expire_all()
    assert (
        client.get(f"/api/admin/schedule/runs/{response.json()['id']}").json()["status"]
        == "stale"
    )
    assert detail(client, v)["assignments"] == []


def test_emergency_requires_explicit_extra_permission(admin_client, campus):
    client = admin_client
    v = draft(client, campus)
    generate(client, v, campus)
    d = detail(client, v)
    lesson = d["assignments"][0]
    response = client.post(
        f"/api/admin/schedule/versions/{v['id']}/assignments/{lesson['occurrence_id']}/emergency",
        json={"revision": d["version"]["revision"], "reason": "Emergency"},
    )
    assert response.status_code == 200, response.text
    v = detail(client, v)["version"]
    assert generate(client, v, campus)["status"] == "partial"
    d = detail(client, v)
    assert lesson["occurrence_id"] in d["report"]["unplaced_occurrences"]
    response = client.post(
        "/api/admin/catalog/extra-permissions",
        json={
            "term_id": campus["term"].id,
            "course_group_id": campus["group"].id,
            "starts_on": lesson["day"],
            "ends_on": lesson["day"],
            "slots": [5],
            "from_time": "15:50",
            "until_time": "17:10",
            "reason": "Makeup approved",
        },
    )
    assert response.status_code == 201, response.text
    result = generate(client, d["version"], campus)
    assert result["status"] == "complete", result
    replacement = next(
        a
        for a in detail(client, v)["assignments"]
        if a["occurrence_id"] == lesson["occurrence_id"]
    )
    assert replacement["day"] == lesson["day"] and replacement["slot"] == 5


def test_feedback_private_status_and_closed_reply(admin_client, campus):
    client = admin_client
    login(client, "student@example.invalid")
    response = client.post(
        "/api/feedback", json={"subject": "Help", "content": "A question"}
    )
    assert response.status_code == 201
    identifier = response.json()["id"]
    login(client, "other@example.invalid")
    assert client.get("/api/feedback").json() == []
    assert (
        client.post(
            f"/api/feedback/{identifier}/messages", json={"content": "Private?"}
        ).status_code
        == 404
    )
    login(client, "admin@example.invalid")
    assert (
        client.put(
            f"/api/feedback/{identifier}/status", json={"status": "in_progress"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/feedback/{identifier}/messages", json={"content": "We can help"}
        ).status_code
        == 201
    )
    assert (
        client.put(
            f"/api/feedback/{identifier}/status", json={"status": "closed"}
        ).status_code
        == 200
    )
    login(client, "student@example.invalid")
    thread = client.get("/api/feedback").json()[0]
    assert thread["status"] == "closed" and len(thread["messages"]) == 2
    assert (
        client.post(
            f"/api/feedback/{identifier}/messages", json={"content": "More"}
        ).status_code
        == 409
    )


def test_lab_hierarchy_capacity_and_missing_period(admin_client, campus):
    client = admin_client
    response = client.post(
        "/api/admin/catalog/lab-groups",
        json={"small_group_id": campus["small"].id, "label": "2", "capacity": 10},
    )
    assert response.status_code == 201, response.text
    assert (
        client.post(
            "/api/admin/catalog/lab-groups",
            json={"small_group_id": campus["small"].id, "label": "3", "capacity": 1},
        ).status_code
        == 422
    )
    for row in campus["db"].scalars(select(m.TeachingPeriod)).all():
        campus["db"].delete(row)
    campus["db"].commit()
    v = draft(client, campus)
    result = generate(client, v, campus)
    assert result["status"] == "rejected"
    assert any(
        i["code"] == "teaching_period_required"
        for i in result["result"]["report"]["issues"]
    )


def test_manual_move_cannot_manufacture_holiday_credit(admin_client, campus):
    client = admin_client
    version = draft(client, campus)
    assert generate(client, version, campus)["status"] == "complete"
    current = detail(client, version)
    assignment = current["assignments"][0]
    holiday = date(2026, 9, 18)
    response = client.post(
        "/api/admin/catalog/holidays",
        json={
            "term_id": campus["term"].id,
            "day": holiday.isoformat(),
            "name": "Test holiday",
        },
    )
    assert response.status_code == 201, response.text
    response = client.put(
        f"/api/admin/schedule/versions/{version['id']}/assignments/{assignment['occurrence_id']}",
        json={
            "revision": current["version"]["revision"],
            "day": holiday.isoformat(),
            "slot": assignment["slot"],
            "room_id": assignment["room_id"],
        },
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == "manual_holiday_move"


def test_manual_repairs_allow_unrelated_conflicts_but_block_edited_conflicts(
    admin_client, campus
):
    client = admin_client
    version = draft(client, campus)
    assert generate(client, version, campus)["status"] == "complete"
    current = detail(client, version)
    original = current["assignments"]
    # Shrink both rooms, invalidating multiple lessons without changing their times.
    for room in (campus["room"], campus["labroom"]):
        room.capacity = 10
    repair_room = m.Room(
        building_id=campus["building"].id,
        room_number="103",
        floor_number=1,
        room_on_floor=3,
        capacity=20,
        room_type="classroom",
    )
    campus["db"].add(repair_room)
    campus["db"].commit()
    lectures = [a for a in original if a["lesson_type"] == "lecture"]

    def move(lesson, target):
        return client.put(
            f"/api/admin/schedule/versions/{version['id']}/assignments/{lesson['occurrence_id']}",
            json={
                "revision": detail(client, version)["version"]["revision"],
                "day": target["day"],
                "slot": target["slot"],
                "room_id": repair_room.id,
            },
        )

    response = move(lectures[0], lectures[0])
    assert response.status_code == 200, response.text
    assert not response.json()["report"]["complete"]
    assert any(i["code"] == "room_capacity" for i in response.json()["report"]["issues"])
    # The edited lesson appears second in validation order: check both conflict IDs.
    response = move(lectures[0], lectures[1])
    assert response.status_code == 409, response.text
    assert any(
        i["code"] == "teacher_conflict" for i in response.json()["detail"]["issues"]
    )
    current = detail(client, version)
    assert client.post(
        f"/api/admin/schedule/versions/{version['id']}/publish",
        json={"revision": current["version"]["revision"]},
    ).status_code == 409
    # Repair the remaining lessons individually, using the appropriate room type.
    campus["labroom"].capacity = 20
    campus["db"].commit()
    assert move(lectures[1], lectures[1]).status_code == 200
    current = detail(client, version)
    assert current["report"]["complete"]
    publish(client, current["version"])


def test_room_deletion_cleans_equipment_and_rolls_back_if_scheduled(admin_client, campus):
    client = admin_client
    equipment = m.Equipment(name="Projector", description="")
    campus["db"].add(equipment)
    campus["db"].flush()
    room = campus["room"]
    campus["db"].add(m.RoomEquipment(
        room_id=room.id, equipment_type_id=equipment.id, quantity=1
    ))
    campus["db"].commit()
    version = draft(client, campus)
    assert generate(client, version, campus)["status"] == "complete"
    response = client.delete(f"/api/admin/catalog/rooms/{room.id}")
    assert response.status_code == 409, response.text
    campus["db"].expire_all()
    assert campus["db"].scalar(select(m.AuditEvent).where(
        m.AuditEvent.request_id == response.headers["x-request-id"]
    )) is None
    assert campus["db"].get(m.RoomEquipment, (room.id, equipment.id)) is not None
    assert campus["db"].get(m.Equipment, equipment.id) is not None

    unused = m.Room(
        building_id=campus["building"].id,
        room_number="104", floor_number=1, room_on_floor=4,
        capacity=20, room_type="classroom",
    )
    campus["db"].add(unused)
    campus["db"].flush()
    unused_id, equipment_id = unused.id, equipment.id
    campus["db"].add(m.RoomEquipment(
        room_id=unused_id, equipment_type_id=equipment_id, quantity=1
    ))
    campus["db"].commit()
    response = client.delete(f"/api/admin/catalog/rooms/{unused_id}")
    assert response.status_code == 204, response.text
    campus["db"].expire_all()
    assert campus["db"].get(m.Room, unused_id) is None
    assert campus["db"].get(m.RoomEquipment, (unused_id, equipment_id)) is None
    assert campus["db"].get(m.Equipment, equipment_id) is not None
    audit = campus["db"].scalars(select(m.AuditEvent).where(
        m.AuditEvent.request_id == response.headers["x-request-id"]
    )).one()
    assert (audit.action, audit.resource, audit.entity_id) == (
        "catalog.deleted", "rooms", unused_id
    )
    assert audit.changes["equipment_ids"]["before"] == [equipment_id]
