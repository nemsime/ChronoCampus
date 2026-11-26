"""Install the Armenian synthetic campus fixture in a development database."""

import json
from collections import defaultdict
from datetime import date, time
from pathlib import Path
from tempfile import NamedTemporaryFile

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import models as m
from app.db.session import get_engine, lock_revision
from app.demo import _seed_account, ensure

FIXTURE_PATH = Path(__file__).with_name("fixtures") / "synthetic-timetable.json"
FACULTIES = ("Synthetic Faculty of Engineering", "Synthetic Faculty of Information Technology")
PROGRAMS = {
    "Software Engineering": (990101, 0),
    "Systems Engineering": (990102, 0),
    "Information Technology": (990201, 1),
}


def load_fixture():
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 1 or payload.get("synthetic") is not True:
        raise RuntimeError("Expected the version 1 synthetic timetable fixture")
    return payload


def _seed_terms(db, fixture):
    calendar_spec = fixture["term"]
    academic_year = calendar_spec["academic_year_start"]
    starts_on = date.fromisoformat(calendar_spec["starts_on"])
    ends_on = date.fromisoformat(calendar_spec["ends_on"])
    pairs = fixture["pairs"]

    def minutes(value):
        hour, minute = map(int, value.split(":"))
        return 60 * hour + minute

    duration = minutes(pairs[0]["ends_at"]) - minutes(pairs[0]["starts_at"])
    breaks = {
        str(pair["slot"]): minutes(next_pair["starts_at"]) - minutes(pair["ends_at"])
        for pair, next_pair in zip(pairs, pairs[1:], strict=False)
    }
    default_break = breaks["1"]
    terms = {}
    for form, slots in calendar_spec["ordinary_slots"].items():
        title = f"Synthetic autumn {academic_year} · {form}"
        calendar = ensure(
            db, m.CalendarConfig, {"name": title},
            study_form=form,
            first_start=time.fromisoformat(pairs[0]["starts_at"]),
            lesson_minutes=duration,
            break_minutes=default_break,
            break_overrides={slot: gap for slot, gap in breaks.items() if gap != default_break},
            weekdays=calendar_spec["weekdays"],
            ordinary_slots=slots,
            teaching_weeks=calendar_spec["teaching_weeks"],
            operating_end=time.fromisoformat(pairs[slots - 1]["ends_at"]),
            academic_hours_per_lesson=calendar_spec["academic_hours_per_pair"],
            academic_hour_minutes=duration // calendar_spec["academic_hours_per_pair"],
            confirmed=True,
        )
        term = ensure(
            db, m.Term, {"name": title},
            academic_year=f"{academic_year}–{academic_year + 1}",
            starts_on=starts_on,
            ends_on=ends_on,
            calendar_id=calendar.id,
            holiday_policy=calendar_spec["holiday_policy"],
            confirmed=True,
        )
        ensure(db, m.TeachingPeriod, {
            "term_id": term.id, "course_group_id": None,
            "starts_on": starts_on, "ends_on": ends_on,
        })
        for day in calendar_spec["holidays"]:
            ensure(db, m.Holiday, {"term_id": term.id, "day": date.fromisoformat(day)},
                   name="Synthetic calendar closure")
        terms[form] = term.id
    return terms


def _ensure_capacity(db, model, lookup, *, capacity, **values):
    row = ensure(db, model, lookup, capacity=capacity, **values)
    row.capacity = max(row.capacity, capacity)
    return row


def populate_synthetic_demo(db, fixture, credentials, *, publish_reference=False):
    """Install catalogs and workloads. The caller owns the database transaction."""
    lock_revision(db)
    faculties = [
        ensure(db, m.Faculty, {"code": f"SYN-{index + 1}"}, name=name)
        for index, name in enumerate(FACULTIES)
    ]
    groups = {}
    for row in fixture["groups"]:
        code, faculty_index = PROGRAMS[row["program"]]
        form = row["study_form"]
        major = ensure(
            db, m.Major, {"major_code": code, "study_form": form},
            name=row["program"], faculty_id=faculties[faculty_index].id,
            duration_yrs=5 if form == "remote" else 4,
        )
        groups[row["id"]] = _ensure_capacity(
            db, m.CourseGroup, {"group_code": row["group_code"]},
            major_id=major.id, admission_year=row["admission_year"], capacity=row["capacity"],
        ).id
    practicals = {
        row["id"]: _ensure_capacity(db, m.SmallGroup, {
            "course_group_id": groups[row["course_group_id"]], "label": row["label"],
        }, capacity=row["capacity"]).id
        for row in fixture["subgroups"]
    }
    labs = {
        row["id"]: _ensure_capacity(db, m.LabGroup, {
            "course_group_id": groups[row["course_group_id"]],
            "small_group_id": practicals.get(row["small_group_id"]), "label": row["label"],
        }, capacity=row["capacity"]).id
        for row in fixture["lab_groups"]
    }
    equipment = {
        row["id"]: ensure(db, m.Equipment, {"name": row["name"]}).id
        for row in fixture["equipment"]
    }
    building = ensure(db, m.Building, {"building_number": 99}, name="Synthetic campus")
    rooms = {}
    for index, row in enumerate(fixture["rooms"], start=1):
        floor, room_on_floor = divmod(index - 1, 10)
        room = _ensure_capacity(
            db, m.Room, {"room_number": row["room_number"]},
            building_id=building.id, floor_number=floor + 1, room_on_floor=room_on_floor + 1,
            capacity=row["capacity"], room_type=row["room_type"],
        )
        rooms[row["id"]] = room.id
        for fixture_id in row["equipment_ids"]:
            installed = ensure(db, m.RoomEquipment, {
                "room_id": room.id, "equipment_type_id": equipment[fixture_id],
            }, quantity=row["capacity"])
            installed.quantity = max(installed.quantity, row["capacity"])
    subjects = {
        row["id"]: ensure(db, m.Subject, {"name": row["name"], "lesson_type_id": None}).id
        for row in fixture["subjects"]
    }

    teachers = {}
    dean_faculties = iter(faculties)
    created_accounts = 0
    admin_id = None
    for row in fixture["users"]:
        role = row["role"]
        email = f"synthetic-{role}-{row['id']}@example.invalid"
        faculty = next(dean_faculties, None) if role == "dean" else None
        account = db.scalar(select(m.Account).where(m.Account.email == email))
        if account is None:
            account = _seed_account(
                db, credentials, email, row["display_name"], role,
                course_group_id=groups.get(row.get("course_group_id")),
                small_group_id=practicals.get(row.get("small_group_id")),
                lab_group_id=labs.get(row.get("lab_group_id")),
                faculty_id=faculty.id if faculty else None,
            )
            created_accounts += 1
        elif account.role != role:
            raise RuntimeError(f"Synthetic demo account {email} has an unexpected role")
        if role == "lecturer":
            teachers[row["id"]] = account.id
        elif role == "admin" and admin_id is None:
            admin_id = account.id

    terms = _seed_terms(db, fixture)
    term_by_group = {row["id"]: terms[row["study_form"]] for row in fixture["groups"]}
    hours = defaultdict(int)
    series_keys = {}
    for row in fixture["series"]:
        # Recurrences are workload inputs. The planner chooses dates, slots and rooms.
        key = (
            term_by_group[row["course_group_id"]], groups[row["course_group_id"]],
            subjects[row["subject_id"]],
            teachers[row["teacher_id"]] if row["teacher_id"] is not None else None,
            row["lesson_type"],
            practicals.get(row["small_group_id"]), labs.get(row["lab_group_id"]),
            tuple(sorted(equipment[identifier] for identifier in row["equipment_ids"])),
        )
        hours[key] += row["semester_hours"]
        series_keys[row["id"]] = key
    workload_ids = {}
    for key, count in hours.items():
        term, group, subject, teacher, kind, practical, lab, needs = key
        workload_ids[key] = ensure(
            db, m.Workload,
            {
                "term_id": term, "course_group_id": group, "subject_id": subject,
                "teacher_id": teacher, "lesson_type": kind,
                "small_group_id": practical, "lab_group_id": lab,
            },
            semester_hours=count,
            equipment_ids=list(needs),
        ).id

    published = {}
    if publish_reference:
        from app.scheduling.demo_reference import publish_demo_reference

        published = publish_demo_reference(
            db, fixture, terms=terms, groups=groups,
            workloads={series_id: workload_ids[key] for series_id, key in series_keys.items()},
            rooms=rooms, actor_id=admin_id,
        )
    return {
        "published_versions": published,
        "terms": terms,
        "cohorts": len(groups),
        "workloads": len(hours),
        "accounts": len(fixture["users"]),
        "created_accounts": created_accounts,
    }


def seed_synthetic_demo(credentials_path: Path, *, inputs_only=False):
    engine = get_engine()
    if engine.dialect.name != "mssql":
        raise RuntimeError("Synthetic demo seed requires the ChronoCampus_Development database")
    fixture = load_fixture()
    staged_path = None
    committed = False
    try:
        with Session(engine) as db:
            if db.scalar(text("SELECT DB_NAME()")) != "ChronoCampus_Development":
                raise RuntimeError("Synthetic demo seed requires the ChronoCampus_Development database")
            # Serialize reads and updates of the local credentials with other seed runs.
            lock_revision(db, changed=False)
            credentials = (
                json.loads(credentials_path.read_text(encoding="utf-8"))
                if credentials_path.exists() else {}
            )
            summary = populate_synthetic_demo(
                db, fixture, credentials, publish_reference=not inputs_only,
            )
            if summary["created_accounts"]:
                with NamedTemporaryFile(
                    dir=credentials_path.parent, prefix=".synthetic-demo-", suffix=".tmp",
                    mode="w", encoding="utf-8", delete=False,
                ) as staged:
                    staged_path = Path(staged.name)
                    json.dump(credentials, staged, ensure_ascii=False, indent=2)
                    staged.write("\n")
            db.commit()
            committed = True
            if staged_path is not None:
                try:
                    staged_path.replace(credentials_path)
                except OSError as error:
                    raise RuntimeError(f"Demo data was committed. Credentials are in {staged_path}") from error
    finally:
        if staged_path is not None and not committed:
            staged_path.unlink(missing_ok=True)
    return {**summary, "credentials_file": str(credentials_path)}
