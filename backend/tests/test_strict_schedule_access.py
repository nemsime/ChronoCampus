from datetime import time

from conftest import HASH
from test_workflow import campus as campus
from test_workflow import login

from app.accounts import dependencies
from app.accounts.roster_models import StudentEnrollment
from app.db import models as m
from app.scheduling import queries


def test_strict_schedule_and_notifications_follow_confirmed_subgroup(
    client, campus, monkeypatch,
):
    db, term, course, student, own_group = (
        campus[key] for key in ("db", "term", "group", "student", "small")
    )
    add = campus["add"]
    dean = add(m.Account, email="scope-dean@example.invalid", role="dean",
               faculty_id=campus["faculty"].id, password_hash=HASH, must_change_password=False)
    other_group = add(m.SmallGroup, course_group_id=course.id, label="B", capacity=20)
    direct_lab = add(m.LabGroup, course_group_id=course.id, label="Direct lab", capacity=10)
    version = add(m.ScheduleVersion, name="Scope test", term_id=term.id, status="published",
                  cohort_ids=[course.id])
    add(m.PublishedGroup, term_id=term.id, course_group_id=course.id, version_id=version.id)
    occurrences = {}
    for index, (label, small_group_id, lab_group_id) in enumerate((
        ("cohort", None, None),
        ("own", own_group.id, None),
        ("other", other_group.id, None),
        ("direct_lab", None, direct_lab.id),
    ), 1):
        workload = add(
            m.Workload, term_id=term.id, course_group_id=course.id,
            subject_id=campus["subject"].id, teacher_id=campus["teacher"].id,
            small_group_id=small_group_id, lab_group_id=lab_group_id, semester_hours=2,
            lesson_type="lab" if lab_group_id else "practical" if small_group_id else "lecture",
        )
        occurrence = add(m.Occurrence, component_id=workload.id, ordinal=1)
        occurrences[label] = occurrence.id
        add(
            m.Assignment, version_id=version.id, occurrence_id=occurrence.id,
            day=term.starts_on, slot=index, starts_at=time(9 + index), ends_at=time(10 + index),
            room_id=campus["room"].id,
        )
    student.small_group_id = student.lab_group_id = None
    db.commit()
    login(client, student.email)

    def schedule():
        response = client.get("/api/schedule")
        assert response.status_code == 200, response.text
        return {row["occurrence_id"] for row in response.json()}

    assert schedule() == set(occurrences.values())
    settings = dependencies.get_settings()
    settings.strict_student_groups = True
    monkeypatch.setattr(queries, "get_settings", lambda: settings)
    assert schedule() == set()
    assert client.get("/api/schedule/template").json()["semesters"] == []
    assert client.put(f'/api/notes/{occurrences["cohort"]}', json={"content": "QA"}).status_code == 404

    db.add(StudentEnrollment(
        account_id=student.id, course_group_id=course.id,
        surname="Սարգսյան", given_name="Անի", confirmed=True,
    ))
    db.commit()
    assert schedule() == {occurrences["cohort"]}
    assert client.put(f'/api/notes/{occurrences["other"]}', json={"content": "QA"}).status_code == 404

    student.small_group_id = own_group.id
    db.commit()
    assert schedule() == {occurrences["cohort"], occurrences["own"]}
    response = client.post("/api/student-groups/transfers", json={
        "small_group_id": other_group.id, "reason": "Schedule conflict",
    })
    assert response.status_code == 200, response.text
    assert schedule() == {occurrences["cohort"], occurrences["own"]}

    login(client, dean.email)
    decision = client.post("/api/student-roster/transfers/decision", json={
        "ids": [response.json()["id"]], "approve": True,
    })
    assert decision.status_code == 200, decision.text
    login(client, student.email)
    assert schedule() == {occurrences["cohort"], occurrences["other"]}
