from datetime import date, time
from types import SimpleNamespace

import pytest
from conftest import HASH, PASSWORD
from sqlalchemy import select

from app.db.models import (
    Account,
    CalendarConfig,
    CourseGroup,
    Faculty,
    LabGroup,
    Major,
    SmallGroup,
    Term,
)


def test_distribution_counts_and_alphabet():
    from app.accounts.distribution import distribute_students

    students = [
        SimpleNamespace(surname=name, given_name="Алекс", patronymic=patronymic)
        for name, patronymic in [
            ("Белов", "Иванович"),
            ("Адамов", "Иванович"),
            ("Белов", None),
            ("Բաբայան", None),
            ("Ավագյան", None),
            ("Zarian", None),
            ("Adamyan", None),
            ("Белов", None),
        ]
    ]
    assert distribute_students([], 20) == []
    assert distribute_students(students[:1], 20) == [students[:1]]
    assert [len(group) for group in distribute_students(students * 10, 20)] == [20] * 4
    assert [
        len(group) for group in distribute_students(students * 8 + students[:4], 25)
    ] == [23, 23, 22]
    assert distribute_students(students, 20)[0] == [
        students[index] for index in (6, 5, 1, 2, 7, 0, 4, 3)
    ]


@pytest.fixture
def roster_context(client, database, monkeypatch):
    from app.accounts import dependencies

    settings = dependencies.get_settings().model_copy(
        update={"strict_student_groups": True, "student_subgroup_max_size": 3}
    )
    monkeypatch.setattr(dependencies, "get_settings", lambda: settings)
    faculties = [Faculty(name=f"Faculty {index}", code=f"F{index}") for index in (1, 2)]
    database.add_all(faculties)
    database.flush()
    majors = [
        Major(
            faculty_id=faculty.id,
            name="Major",
            major_code=index,
            study_form="full_time",
            duration_yrs=4,
        )
        for index, faculty in enumerate(faculties, 1)
    ]
    database.add_all(majors)
    database.flush()
    courses = [
        CourseGroup(
            major_id=major.id,
            admission_year=2026,
            group_code=f"C{index}",
            capacity=20,
        )
        for index, major in enumerate(majors, 1)
    ]
    calendar = CalendarConfig(
        name="Calendar",
        study_form="full_time",
        first_start=time(9),
        lesson_minutes=90,
        break_minutes=10,
        ordinary_slots=4,
    )
    database.add_all([*courses, calendar])
    database.flush()
    term = Term(
        name="Fall",
        academic_year="2026/2027",
        starts_on=date(2026, 9, 1),
        ends_on=date(2026, 12, 31),
        calendar_id=calendar.id,
    )
    database.add(term)
    database.add_all(
        Account(
            email=f"dean{index}@example.invalid",
            role="dean",
            faculty_id=faculty.id,
            password_hash=HASH,
            must_change_password=False,
        )
        for index, faculty in enumerate(faculties, 1)
    )
    database.commit()
    return client, term.id, [course.id for course in courses]


def login(client, local_part):
    response = client.post(
        "/api/auth/login",
        json={"email": f"{local_part}@example.invalid", "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf_token"]


CSV_HEADER = "group_code,surname,given_name,patronymic,email\n"


def test_import_errors_duplicates_and_dean_scope(roster_context, database):
    client, term_id, (course_id, _) = roster_context
    existing = SmallGroup(course_group_id=course_id, label="Existing", capacity=3)
    database.add(existing)
    database.commit()
    login(client, "dean1")
    result = client.post(
        "/api/student-roster/import",
        json={
            "term_id": term_id,
            "csv": CSV_HEADER
            + "missing,A,B,,\nC2,A,B,,\nC1,,B,,\nC1,A,B,,ß@example.invalid\nC1,A,B,,\nC1,A,B,,\n",
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["imported"] == 0
    assert [error["code"] for error in result.json()["errors"]] == [
        "roster_unknown_group",
        "roster_forbidden_group",
        "roster_invalid_name",
        "roster_invalid_email",
        "roster_duplicate_row",
    ]
    result = client.post(
        "/api/student-roster/import",
        json={
            "term_id": term_id,
            "csv": CSV_HEADER + "C1,Семёнов,Иван,,first@example.invalid\n"
            "C1,Семенов,иван,,second@example.invalid\nC1,Петров,Иван,,\nC1,Иванов,Иван,,\n",
        },
    )
    assert result.status_code == 200, result.text
    assert result.json() == {
        "imported": 4,
        "errors": [],
        "warnings": [
            {"line": 2, "code": "roster_duplicate_name"},
            {"line": 3, "code": "roster_duplicate_name"},
        ],
    }
    assert (
        len(
            database.scalars(
                select(SmallGroup).where(SmallGroup.course_group_id == course_id)
            ).all()
        )
        == 2
    )
    options = client.get("/api/student-roster/options").json()
    assert {group["id"] for group in options["groups"]} == {course_id}
    assert next(
        group for group in options["subgroups"] if group["id"] == existing.id
    ) == {
        "id": existing.id,
        "course_group_id": course_id,
        "label": "Existing",
        "capacity": 3,
    }


def test_enrollment_and_transfer_restore_expected_membership(roster_context, database):
    from app.accounts.roster import confirm_enrollment, stage_enrollment

    client, term_id, (course_id, _) = roster_context
    login(client, "dean1")
    result = client.post(
        "/api/student-roster/import",
        json={
            "term_id": term_id,
            "csv": CSV_HEADER + "C1,Елкин,Иван,,listed@example.invalid\n"
            "C1,Чефер,Саша,,\nC1,Семёнов,Иван,,first@example.invalid\n"
            "C1,Семенов,иван,,second@example.invalid\n",
        },
    )
    assert result.json()["imported"] == 4, result.text
    for local_part, surname in (
        ("listed", "  ёлКин "),
        ("impostor", "Елкин"),
        ("missing", "Громов"),
        ("first", "Семёнов"),
        ("no-email", "Чефер"),
    ):
        account = Account(
            email=f"{local_part}@example.invalid",
            display_name=surname,
            role="student",
            password_hash=HASH,
            must_change_password=False,
            email_verified=False,
        )
        database.add(account)
        database.flush()
        stage_enrollment(
            database,
            account,
            course_group_id=course_id,
            surname=surname,
            given_name=("Саша" if local_part == "no-email" else "Иван"),
            patronymic="Сергеевич",
        )
        assert account.course_group_id is None
        confirm_enrollment(database, account)
        assert account.course_group_id is None
        account.email_verified = True
        confirm_enrollment(database, account)
        assert account.course_group_id == (
            course_id if local_part == "listed" else None
        )
    database.commit()
    pending = client.get("/api/student-roster/requests").json()
    assert {row["email"].split("@")[0] for row in pending["enrollments"]} == {
        "impostor",
        "missing",
        "first",
        "no-email",
    }
    login(client, "listed")
    mine = client.get("/api/student-groups/me").json()
    assert mine["confirmed"] is True
    student = database.scalar(
        select(Account).where(Account.email == "listed@example.invalid")
    )
    previous = student.small_group_id
    target = next(group["id"] for group in mine["groups"] if group["id"] != previous)
    old_lab = LabGroup(small_group_id=previous, label="Old nested lab", capacity=3)
    database.add(old_lab)
    database.flush()
    student.lab_group_id = old_lab.id
    database.commit()
    req = client.post(
        "/api/student-groups/transfers",
        json={"small_group_id": target, "reason": "Need different schedule"},
    )
    assert req.status_code == 200, req.text
    request_id = req.json()["id"]
    database.refresh(student)
    assert student.small_group_id == previous
    login(client, "dean2")
    assert client.get("/api/student-roster/requests").json()["transfers"] == []
    denial = client.post(
        "/api/student-roster/transfers/decision",
        json={"ids": [request_id], "approve": True},
    )
    assert denial.status_code == 403, denial.text
    login(client, "dean1")
    approval = client.post(
        "/api/student-roster/transfers/decision",
        json={"ids": [request_id], "approve": True},
    )
    assert approval.status_code == 200, approval.text
    database.refresh(student)
    assert student.small_group_id == target
    assert student.lab_group_id is None
    manual = next(
        row
        for row in pending["enrollments"]
        if row["email"] == "no-email@example.invalid"
    )
    login(client, "dean2")
    denied = client.post(
        f"/api/student-roster/enrollments/{manual['id']}",
        json={"small_group_id": target},
    )
    assert denied.status_code == 403, denied.text
    login(client, "dean1")
    assigned = client.post(
        f"/api/student-roster/enrollments/{manual['id']}",
        json={"small_group_id": target},
    )
    assert assigned.status_code == 200, assigned.text
    assert database.get(Account, manual["id"]).small_group_id == target


def test_bulk_decision_respects_final_capacity_and_independent_lab(
    roster_context, database
):
    from app.accounts.roster import confirm_enrollment, stage_enrollment

    client, term_id, (course_id, _) = roster_context
    login(client, "admin")
    result = client.post(
        "/api/student-roster/import",
        json={
            "term_id": term_id,
            "csv": CSV_HEADER
            + "C1,A,Alex,,left@example.invalid\nC1,B,Alex,,\nC1,C,Alex,,\n"
            "C1,D,Alex,,right@example.invalid\nC1,E,Alex,,\nC1,F,Alex,,\n",
        },
    )
    assert result.json()["imported"] == 6, result.text
    lab = LabGroup(course_group_id=course_id, label="Independent lab", capacity=3)
    database.add(lab)
    database.flush()
    students = {}
    for local_part, surname in (("left", "A"), ("right", "D")):
        account = Account(
            email=f"{local_part}@example.invalid",
            role="student",
            password_hash=HASH,
            must_change_password=False,
            email_verified=True,
            lab_group_id=lab.id,
        )
        database.add(account)
        database.flush()
        stage_enrollment(
            database,
            account,
            course_group_id=course_id,
            surname=surname,
            given_name="Alex",
            patronymic=None,
        )
        confirm_enrollment(database, account)
        assert account.small_group_id is not None
        students[local_part] = account
    database.commit()
    left_group, right_group = (student.small_group_id for student in students.values())
    ids = []
    for local_part, target in (("left", right_group), ("right", left_group)):
        login(client, local_part)
        transfer = client.post(
            "/api/student-groups/transfers",
            json={"small_group_id": target, "reason": "Swap"},
        )
        assert transfer.status_code == 200, transfer.text
        ids.append(transfer.json()["id"])
    login(client, "dean1")
    one = client.post(
        "/api/student-roster/transfers/decision", json={"ids": ids[:1], "approve": True}
    )
    assert one.status_code == 409 and one.json()["detail"] == "subgroup_full"
    both = client.post(
        "/api/student-roster/transfers/decision", json={"ids": ids, "approve": True}
    )
    assert both.json() == {"updated": 2}, both.text
    for local_part, target in (("left", right_group), ("right", left_group)):
        student = students[local_part]
        database.refresh(student)
        assert student.small_group_id == target
        assert student.lab_group_id == lab.id
