"""Opt-in real SQL Server race test; only an explicitly named isolated test DB is allowed."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, time
import os
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models as m
from app.db.session import get_db
from app.main import app
from conftest import HASH, PASSWORD


@pytest.mark.skipif(
    not os.getenv("CHRONOCAMPUS_TEST_DATABASE"),
    reason="Set CHRONOCAMPUS_TEST_DATABASE to an isolated migrated SQL Server database",
)
def test_concurrent_publications_serialize_conflicts(monkeypatch, tmp_path):
    name = os.environ["CHRONOCAMPUS_TEST_DATABASE"]
    assert re.fullmatch(r"ChronoCampus_MigrationTest_\d{8}", name), (
        "Refusing to modify a non-test database"
    )
    connection = re.sub(
        r"(?i)DATABASE=[^;]+",
        "DATABASE=" + name,
        get_settings().sqlserver_connection_string.get_secret_value(),
    )
    engine = create_engine(
        URL.create("mssql+pyodbc", query={"odbc_connect": connection}),
        hide_parameters=True,
    )
    driver_errors = []
    event.listen(
        engine,
        "handle_error",
        lambda context: driver_errors.append(str(context.original_exception)),
    )
    marker = uuid.uuid4().hex[:8]
    with Session(engine) as db:

        def add(model, **values):
            row = model(**values)
            db.add(row)
            db.flush()
            return row

        admin = add(
            m.Account,
            email=f"admin-{marker}@example.invalid",
            display_name="Race test admin",
            role="admin",
            password_hash=HASH,
            must_change_password=False,
        )
        email = admin.email
        teacher = add(
            m.Account,
            email=f"teacher-{marker}@example.invalid",
            display_name="Race test teacher",
            role="lecturer",
            password_hash=HASH,
            must_change_password=False,
        )
        faculty = add(m.Faculty, name="Race test", code=marker)
        major = add(
            m.Major,
            faculty_id=faculty.id,
            name="Race test",
            major_code=int(marker[:6], 16),
            study_form="present",
            duration_yrs=4,
        )
        building = add(
            m.Building, building_number=int(marker[:6], 16), name="Race test"
        )
        room = add(
            m.Room,
            building_id=building.id,
            room_number=marker,
            floor_number=1,
            room_on_floor=1,
            capacity=20,
            room_type="classroom",
        )
        calendar = add(
            m.CalendarConfig,
            name=marker,
            study_form="present",
            first_start=time(9, 30),
            lesson_minutes=80,
            break_minutes=10,
            break_overrides={"2": 30},
            weekdays=[0, 1, 2, 3, 4],
            ordinary_slots=4,
            academic_hours_per_lesson=2,
            teaching_weeks=1,
            confirmed=True,
        )
        term = add(
            m.Term,
            name=marker,
            academic_year="2026",
            starts_on=date(2026, 10, 19),
            ends_on=date(2026, 10, 23),
            calendar_id=calendar.id,
            holiday_policy="exempt",
            confirmed=True,
        )
        add(
            m.TeachingPeriod,
            term_id=term.id,
            starts_on=term.starts_on,
            ends_on=term.ends_on,
        )
        subject = add(m.Subject, name=marker)
        versions = []
        for index in range(2):
            group = add(
                m.CourseGroup,
                major_id=major.id,
                group_code=f"{marker}-{index}",
                admission_year=2026,
                capacity=20,
            )
            component = add(
                m.Workload,
                term_id=term.id,
                course_group_id=group.id,
                subject_id=subject.id,
                teacher_id=teacher.id,
                lesson_type="lecture",
                semester_hours=2,
                equipment_ids=[],
            )
            occurrence = add(m.Occurrence, component_id=component.id, ordinal=0)
            version = add(
                m.ScheduleVersion,
                term_id=term.id,
                name=marker,
                cohort_ids=[group.id],
                configuration={},
            )
            add(
                m.Assignment,
                version_id=version.id,
                occurrence_id=occurrence.id,
                day=term.starts_on,
                slot=1,
                starts_at=time(9, 30),
                ends_at=time(10, 50),
                room_id=room.id,
            )
            versions.append(version.id)
        db.commit()
    settings = get_settings().model_copy(update={"cookie_secure": False, "diagnostic_log_directory": tmp_path / "logs"})
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.accounts.router.get_settings", lambda: settings)
    monkeypatch.setattr("app.main.get_engine", lambda: engine)

    def sessions():
        with Session(engine, expire_on_commit=False) as db:
            yield db

    app.dependency_overrides[get_db] = sessions
    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/login", json={"email": email, "password": PASSWORD}
            )
            assert response.status_code == 200, response.text
            client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda identifier: client.post(
                            f"/api/admin/schedule/versions/{identifier}/publish",
                            json={"revision": 1},
                        ),
                        versions,
                    )
                )
            assert sorted(r.status_code for r in results) == [200, 409], (
                [r.text for r in results],
                driver_errors,
            )
            conflict = next(r for r in results if r.status_code == 409).json()
            codes = {i["code"] for i in conflict["detail"]["report"]["issues"]}
            assert {"external_room_conflict", "external_teacher_conflict"} <= codes
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
