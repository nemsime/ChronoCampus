"""Idempotent, explicitly synthetic diploma fixtures; never run on a production database."""

from datetime import date, time
from pathlib import Path
import json
import secrets

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.security import password_hash
from app.db import models as m
from app.db.session import get_engine, lock_revision


def ensure(db, model, lookup, **values):
    row = db.scalar(select(model).filter_by(**lookup))
    if row is None:
        row = model(**lookup, **values)
        db.add(row)
        db.flush()
    return row


def seed_demo(credentials_path: Path):
    credentials = (
        json.loads(credentials_path.read_text(encoding="utf-8"))
        if credentials_path.exists()
        else {}
    )
    with Session(get_engine(), expire_on_commit=False) as db:
        database = db.scalar(text("SELECT DB_NAME()"))
        if database != "ChronoCampus_Development":
            raise RuntimeError(
                "Demo seed requires the isolated ChronoCampus_Development database"
            )
        lock_revision(db)

        def account(email, name, role, **membership):
            existing = db.scalar(select(m.Account).where(m.Account.email == email))
            if existing:
                return existing
            secret = secrets.token_urlsafe(18)
            row = m.Account(
                email=email,
                display_name=name,
                role=role,
                password_hash=password_hash(secret),
                must_change_password=False,
                is_active=True,
                **membership,
            )
            db.add(row)
            db.flush()
            credentials[email] = {"password": secret, "name": name, "role": role}
            return row

        account("admin.demo@example.invalid", "Demo Administrator", "admin")
        faculties = [
            ensure(db, m.Faculty, {"code": code}, name=name)
            for code, name in (
                ("FIA", "Faculty of Informatics and Automation"),
                ("FCS", "Faculty of Computer Science"),
            )
        ]
        specifications = [
            (900101, "Software Engineering", 0, "present"),
            (900102, "Automation and Robotics", 0, "present"),
            (900201, "Computer Science", 1, "present"),
            (900202, "Data Science", 1, "present"),
            (900101, "Software Engineering", 0, "remote"),
        ]
        majors = [
            ensure(
                db,
                m.Major,
                {"major_code": code, "study_form": form},
                name=name,
                faculty_id=faculties[faculty].id,
                duration_yrs=5 if form == "remote" else 4,
            )
            for code, name, faculty, form in specifications
        ]
        building = ensure(
            db,
            m.Building,
            {"building_number": 90},
            name="Demo teaching centre",
            address="Synthetic campus",
        )
        computer = ensure(
            db,
            m.Equipment,
            {"name": "Demo computer workstation"},
            description="Synthetic lab equipment",
        )
        projector = ensure(
            db,
            m.Equipment,
            {"name": "Demo projector"},
            description="Synthetic teaching equipment",
        )
        for number in range(1, 13):
            kind = (
                "lecture_hall" if number <= 4 else "lab" if number <= 8 else "classroom"
            )
            room = ensure(
                db,
                m.Room,
                {"room_number": f"D{number:03d}"},
                building_id=building.id,
                floor_number=1,
                room_on_floor=number,
                capacity=60 if kind == "lecture_hall" else 24,
                room_type=kind,
            )
            for equip in [computer, projector] if kind == "lab" else [projector]:
                ensure(
                    db,
                    m.RoomEquipment,
                    {"room_id": room.id, "equipment_type_id": equip.id},
                    quantity=1,
                )
        names = [
            "Arpi Melikyan",
            "Narek Avetisyan",
            "Lilit Davtyan",
            "Tigran Mkhitaryan",
            "Mariam Petrosyan",
            "Levon Sargsyan",
            "Ani Vardanyan",
            "David Harutyunyan",
            "Sona Grigoryan",
            "Aram Hakobyan",
            "Eva Martirosyan",
            "Vahan Gevorgyan",
        ]
        teachers = [
            account(f"teacher{i + 1}.demo@example.invalid", name, "lecturer")
            for i, name in enumerate(names)
        ]
        subject_names = [
            "Mathematical analysis",
            "Object-oriented programming",
            "Physics",
            "Computer architecture",
            "Software quality assurance",
            "Business fundamentals",
        ]
        subjects = [
            ensure(db, m.Subject, {"name": name, "lesson_type_id": None})
            for name in subject_names
        ]
        terms = {}
        for form, slots in (("present", 4), ("remote", 5)):
            calendar = ensure(
                db,
                m.CalendarConfig,
                {"name": f"DEMO 2026 {form}"},
                study_form=form,
                first_start=time(9, 30),
                lesson_minutes=80,
                break_minutes=10,
                break_overrides={"2": 30},
                weekdays=[0, 1, 2, 3, 4],
                ordinary_slots=slots,
                operating_end=time(19),
                academic_hours_per_lesson=2,
                academic_hour_minutes=40,
                teaching_weeks=16,
                confirmed=True,
                lecture_order="same_day",
            )
            term = ensure(
                db,
                m.Term,
                {"name": f"DEMO autumn 2026 · {form}"},
                academic_year="2026–2027",
                starts_on=date(2026, 9, 1),
                ends_on=date(2027, 1, 29),
                calendar_id=calendar.id,
                holiday_policy="exempt",
                confirmed=True,
                search_seconds=60,
            )
            ensure(
                db,
                m.TeachingPeriod,
                {
                    "term_id": term.id,
                    "course_group_id": None,
                    "starts_on": date(2026, 9, 1),
                    "ends_on": date(2026, 12, 18),
                },
            )
            ensure(
                db,
                m.Holiday,
                {"term_id": term.id, "day": date(2026, 9, 21)},
                name="Demo holiday",
            )
            terms[form] = term
        group_ids = []
        for index, major in enumerate(majors):
            group = ensure(
                db,
                m.CourseGroup,
                {"group_code": f"DEMO-{index + 1}-26"},
                major_id=major.id,
                admission_year=2026,
                capacity=40,
            )
            group_ids.append(group.id)
            smalls = []
            labs = []
            for small_index in range(2):
                small = ensure(
                    db,
                    m.SmallGroup,
                    {"course_group_id": group.id, "label": f"{small_index + 1}"},
                    capacity=20,
                )
                smalls.append(small)
                for lab_index in range(2):
                    labs.append(
                        ensure(
                            db,
                            m.LabGroup,
                            {"small_group_id": small.id, "label": f"{lab_index + 1}"},
                            capacity=10,
                        )
                    )
            account(
                f"student{index + 1}.demo@example.invalid",
                [
                    "Mane Arakelyan",
                    "Gor Sahakyan",
                    "Nune Hovhannisyan",
                    "Hayk Simonyan",
                    "Elina Karapetyan",
                ][index],
                "student",
                course_group_id=group.id,
                small_group_id=smalls[0].id,
                lab_group_id=labs[0].id,
            )
            term = terms[major.study_form]
            for subject_index, subject in enumerate(subjects):
                teacher = teachers[(index * 2 + subject_index) % len(teachers)]
                hours = 16 if major.study_form == "remote" else 32
                ensure(
                    db,
                    m.Workload,
                    {
                        "term_id": term.id,
                        "course_group_id": group.id,
                        "subject_id": subject.id,
                        "lesson_type": "lecture",
                        "small_group_id": None,
                        "lab_group_id": None,
                    },
                    teacher_id=teacher.id,
                    semester_hours=hours,
                    assessment="exam",
                    equipment_ids=[projector.id],
                    preferred_daily_max=3,
                )
                for audience in labs if subject_index % 2 else smalls:
                    is_lab = isinstance(audience, m.LabGroup)
                    ensure(
                        db,
                        m.Workload,
                        {
                            "term_id": term.id,
                            "course_group_id": group.id,
                            "subject_id": subject.id,
                            "lesson_type": "lab" if is_lab else "practical",
                            "small_group_id": audience.small_group_id
                            if is_lab
                            else audience.id,
                            "lab_group_id": audience.id if is_lab else None,
                        },
                        teacher_id=teacher.id,
                        semester_hours=8 if major.study_form == "remote" else 16,
                        assessment="exam",
                        equipment_ids=[computer.id] if is_lab else [],
                        preferred_daily_max=3,
                    )
        ensure(
            db,
            m.Availability,
            {
                "teacher_id": teachers[0].id,
                "room_id": None,
                "starts_on": date(2026, 9, 1),
                "ends_on": date(2026, 12, 18),
                "weekday": 2,
                "parity": "every",
                "from_time": time(9, 30),
                "until_time": time(11),
                "kind": "unavailable",
            },
            reason="Demo external duty",
        )
        ensure(
            db,
            m.Availability,
            {
                "teacher_id": teachers[1].id,
                "room_id": None,
                "starts_on": date(2026, 9, 1),
                "ends_on": date(2026, 12, 18),
                "weekday": None,
                "parity": "every",
                "from_time": time(11),
                "until_time": time(16),
                "kind": "preferred",
            },
            reason="Demo preference",
        )
        # Real university settings stay unconfirmed; only explicitly synthetic demo settings above are confirmed.
        for form, slots in (("present", 4), ("remote", 5)):
            ensure(
                db,
                m.CalendarConfig,
                {"name": f"University {form} · awaiting confirmation"},
                study_form=form,
                first_start=time(9, 30),
                lesson_minutes=80,
                break_minutes=10,
                break_overrides={"2": 30},
                weekdays=[0, 1, 2, 3, 4],
                ordinary_slots=slots,
                teaching_weeks=16,
                confirmed=False,
            )
        db.commit()
    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    credentials_path.write_text(
        json.dumps(credentials, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {
        "groups": group_ids,
        "terms": {key: value.id for key, value in terms.items()},
        "credentials_file": str(credentials_path),
    }
