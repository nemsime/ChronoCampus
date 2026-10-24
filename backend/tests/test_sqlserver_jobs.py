"""Real queue locking tests; only uniquely named isolated SQL databases are allowed."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, timedelta
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time as monotonic_time
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select, text, update
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models as m
from app.db.session import get_db, lock_revision
from app.jobs.generation import apply_result, execute_claim, prepare, enqueue_generation
from app.jobs.models import BackgroundJob, JobAttempt
from app.jobs.queue import claim_job, database_now, enqueue_job, finish_job, recover_expired, renew_lease
from app.main import app
from app.scheduling.router import GenerateInput
from conftest import HASH, PASSWORD


@pytest.fixture(params=json.loads(os.getenv("CHRONOCAMPUS_QUEUE_TEST_DATABASES", "[null]")))
def queue_engine(request):
    name = request.param
    if name is None:
        pytest.skip("Set CHRONOCAMPUS_QUEUE_TEST_DATABASES to isolated migrated RCSI OFF/ON databases")
    assert re.fullmatch(r"ChronoCampus_RuntimeTest_(OFF|ON)_\d{8}_\d{6}_[a-f0-9]{6}", name)
    connection = re.sub(r"(?i)DATABASE=[^;]+", "DATABASE=" + name,
                        get_settings().sqlserver_connection_string.get_secret_value())
    engine = create_engine(URL.create("mssql+pyodbc", query={"odbc_connect": connection}),
                           hide_parameters=True, pool_size=4, max_overflow=0)
    with engine.connect() as db:
        mode = db.scalar(text("SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name=DB_NAME()"))
        assert bool(mode) == ("_ON_" in name)
    try:
        yield engine
    finally:
        engine.dispose()


def test_single_generation_claim_and_stale_owner_fence(queue_engine):
    engine = queue_engine
    marker = uuid4().hex
    with Session(engine) as db:
        jobs = [enqueue_job(db, "generation", {"test": marker}) for _ in range(2)]
        ids = [job.id for job in jobs]
        db.commit()
    barrier = threading.Barrier(2)

    def claim(owner):
        barrier.wait(timeout=10)
        return claim_job(engine, "generation", owner)

    with ThreadPoolExecutor(max_workers=2) as pool:
        claims = list(pool.map(claim, [marker + "-a", marker + "-b"]))
    owned = [item for item in claims if item is not None]
    assert len(owned) == 1
    first = owned[0]
    assert first.job_id in ids
    with Session(engine) as db:
        # Simulate a fully committed recovery/reclaim. Old token cannot write even
        # when its original deadline/lease would otherwise still be valid.
        db.execute(update(BackgroundJob).where(BackgroundJob.id == first.job_id).values(
            owner_id=marker + "-replacement", lease_generation=BackgroundJob.lease_generation + 1))
        db.commit()
    assert not renew_lease(engine, first)
    assert not apply_result(engine, first, {"assignments": []})
    with Session(engine) as db:
        lock_revision(db, changed=False)
        assert not finish_job(db, first, "succeeded")
        db.rollback()
        assert db.get(BackgroundJob, first.job_id).state == "running"
        assert db.scalar(select(func.count()).select_from(JobAttempt).where(JobAttempt.job_id.in_(ids))) == 1
        # Test-owned raw jobs have no GenerationRun; close them without invoking
        # generation recovery. No application or retained data is touched.
        db.execute(update(BackgroundJob).where(BackgroundJob.id.in_(ids)).values(
            state="cancelled", owner_id=None, lease_until=None, finished_at=database_now(db)))
        db.commit()


def test_expired_mail_owner_cannot_finish_and_retry_is_bounded(queue_engine):
    engine = queue_engine
    with Session(engine) as db:
        identifier = enqueue_job(db, "mail", {}, max_attempts=2).id
        db.commit()
    first = claim_job(engine, "mail", "expired-owner", job_id=identifier)
    assert first
    with Session(engine) as db:
        db.execute(update(BackgroundJob).where(BackgroundJob.id == identifier)
                   .values(lease_until=database_now(db) - timedelta(seconds=1)))
        db.commit()
    assert not renew_lease(engine, first)
    with Session(engine) as db:
        assert not finish_job(db, first, "succeeded")
    recover_expired(engine, "mail")
    with Session(engine) as db:
        row = db.get(BackgroundJob, identifier)
        assert row.state == "retry_wait"
        row.available_at = database_now(db) - timedelta(seconds=1)
        db.commit()
    second = claim_job(engine, "mail", "new-owner", job_id=identifier)
    assert second and second.lease_generation > first.lease_generation
    with Session(engine) as db:
        assert not finish_job(db, first, "succeeded")
        db.execute(update(BackgroundJob).where(BackgroundJob.id == identifier)
                   .values(lease_until=database_now(db) - timedelta(seconds=1)))
        db.commit()
    recover_expired(engine, "mail")
    with Session(engine) as db:
        assert db.get(BackgroundJob, identifier).state == "failed"
        attempts = list(db.scalars(select(JobAttempt).where(JobAttempt.job_id == identifier)
                                  .order_by(JobAttempt.attempt_number)))
        assert [a.outcome for a in attempts] == ["retry_wait", "failed"]
    assert claim_job(engine, "mail", "third-owner", job_id=identifier) is None


def seed_campus(engine):
    marker = uuid4().hex[:10]
    with Session(engine) as db:
        def add(model, **values):
            row = model(**values)
            db.add(row)
            db.flush()
            return row
        admin = add(m.Account, email=f"runtime-admin-{marker}@example.invalid", display_name="Runtime QA",
                    role="admin", password_hash=HASH, must_change_password=False)
        teacher = add(m.Account, email=f"runtime-teacher-{marker}@example.invalid", role="lecturer",
                      display_name="Runtime QA", password_hash=HASH, must_change_password=False)
        faculty = add(m.Faculty, name=marker, code=marker)
        major = add(m.Major, faculty_id=faculty.id, name=marker, major_code=int(marker[:6], 16),
                    study_form="present", duration_yrs=4)
        group = add(m.CourseGroup, major_id=major.id, group_code=marker, admission_year=2026, capacity=20)
        building = add(m.Building, building_number=int(marker[:6], 16))
        add(m.Room, building_id=building.id, room_number=marker, floor_number=1, room_on_floor=1,
            capacity=20, room_type="classroom")
        calendar = add(m.CalendarConfig, name=marker, study_form="present", first_start=time(9),
            lesson_minutes=80, break_minutes=10, weekdays=[0, 1, 2, 3, 4], ordinary_slots=4,
            academic_hours_per_lesson=2, teaching_weeks=1, confirmed=True)
        term = add(m.Term, name=marker, academic_year="2026", starts_on=date(2026, 10, 19),
            ends_on=date(2026, 10, 23), calendar_id=calendar.id, holiday_policy="exempt", confirmed=True, search_seconds=1)
        add(m.TeachingPeriod, term_id=term.id, starts_on=term.starts_on, ends_on=term.ends_on)
        subject = add(m.Subject, name=marker)
        add(m.Workload, term_id=term.id, course_group_id=group.id, subject_id=subject.id,
            teacher_id=teacher.id, lesson_type="lecture", semester_hours=8, equipment_ids=[])
        result = {"email": admin.email, "group": group.id, "term": term.id}
        db.commit()
        return result


def test_sql_generation_survives_api_restart_and_publishes_bounded_reads(queue_engine, monkeypatch, tmp_path):
    engine = queue_engine
    campus = seed_campus(engine)
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
            assert client.get("/api/ready").status_code == 200
            login = client.post("/api/auth/login", json={"email": campus["email"], "password": PASSWORD})
            assert login.status_code == 200, login.text
            csrf = login.json()["csrf_token"]
            client.headers["X-CSRF-Token"] = csrf
            draft = client.post("/api/admin/schedule/versions", json={
                "name": "Runtime QA", "term_id": campus["term"], "cohort_ids": [campus["group"]]}).json()
            path = f"/api/admin/schedule/versions/{draft['id']}"
            body = {"revision": draft["revision"], "idempotency_key": uuid4().hex}
            accepted = client.post(path + "/generate", json=body)
            assert accepted.status_code == 202, accepted.text
            run = accepted.json()
            assert client.post(path + "/generate", json=body).json()["id"] == run["id"]
            claim = claim_job(engine, "generation", "sql-runtime-test", job_id=run["job"]["id"])
            assert prepare(engine, claim)
            cookies = client.cookies
        # A new API lifespan must not rewrite either the claim or the run.
        with TestClient(app) as client:
            client.cookies.update(cookies)
            client.headers["X-CSRF-Token"] = csrf
            assert client.get(f"/api/admin/schedule/runs/{run['id']}").json()["status"] == "running"
            execute_claim(engine, claim)
            completed = client.get(f"/api/admin/schedule/runs/{run['id']}").json()
            assert completed["status"] == "complete", completed
            version = client.get(path).json()
            assert len(version["assignments"]) == 4
            published = client.post(path + "/publish", json={"revision": version["version"]["revision"]})
            assert published.status_code == 200, published.text
            page = client.get("/api/schedule/page", params={"start": "2026-10-19", "end": "2026-10-23",
                "course_group_id": campus["group"], "limit": 2})
            assert page.status_code == 200, page.text
            first = page.json()
            assert len(first["items"]) == 2 and first["next_cursor"]
            second = client.get("/api/schedule/page", params={"start": "2026-10-19", "end": "2026-10-23",
                "course_group_id": campus["group"], "limit": 2, "cursor": first["next_cursor"]}).json()
            assert len(second["items"]) == 2 and second["next_cursor"] is None
            assert client.get("/api/schedule/facets").status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("boundary", ["lease_until", "deadline_at"])
def test_renewal_cannot_resurrect_ownership_after_sql_lock_wait(queue_engine, boundary):
    engine = queue_engine
    with Session(engine) as db:
        identifier = enqueue_job(db, "mail", {}).id
        db.commit()
    claim = claim_job(engine, "mail", "lock-wait-owner", job_id=identifier)
    started = threading.Event()
    owner_thread = threading.get_ident()

    def detect_attempt(conn, cursor, statement, parameters, context, executemany):
        if threading.get_ident() != owner_thread and statement.lstrip().startswith("UPDATE"):
            started.set()

    event.listen(engine, "before_cursor_execute", detect_attempt)
    try:
        with Session(engine) as blocker:
            expiry = database_now(blocker) + timedelta(seconds=1)
            blocker.execute(update(BackgroundJob).where(BackgroundJob.id == identifier).values(**{boundary: expiry}))
            blocker.commit()
            blocker.execute(update(BackgroundJob).where(BackgroundJob.id == identifier).values(updated_at=BackgroundJob.updated_at))
            with ThreadPoolExecutor(max_workers=1) as pool:
                renewal = pool.submit(renew_lease, engine, claim)
                assert started.wait(3)
                monotonic_time.sleep(1.2)
                blocker.commit()
                assert renewal.result(timeout=5) is False
        with Session(engine) as db:
            db.execute(update(BackgroundJob).where(BackgroundJob.id == identifier).values(state="failed", owner_id=None))
            db.commit()
    finally:
        event.remove(engine, "before_cursor_execute", detect_attempt)


def test_snapshot_preparation_renews_lease_without_locking_heartbeat(queue_engine, monkeypatch):
    from app.jobs import generation, queue
    engine = queue_engine
    campus = seed_campus(engine)
    settings = get_settings().model_copy(update={"job_lease_seconds": 2, "job_heartbeat_seconds": 0.25})
    monkeypatch.setattr(queue, "get_settings", lambda: settings)
    monkeypatch.setattr(generation, "get_settings", lambda: settings)
    original = generation.build_snapshot

    def slow_snapshot(*args, **kwargs):
        monotonic_time.sleep(2.5)
        return original(*args, **kwargs)

    monkeypatch.setattr(generation, "build_snapshot", slow_snapshot)
    with Session(engine) as db:
        actor = db.scalar(select(m.Account).where(m.Account.email == campus["email"]))
        version = m.ScheduleVersion(term_id=campus["term"], name="Long preparation",
                                    cohort_ids=[campus["group"]], configuration={})
        db.add(version)
        db.flush()
        run = enqueue_generation(db, version.id, GenerateInput(revision=version.revision), actor)
        job_id, run_id = run.job_id, run.id
        db.commit()
    claim = claim_job(engine, "generation", "preparation-owner", job_id=job_id)
    execute_claim(engine, claim)
    with Session(engine) as db:
        run = db.get(m.GenerationRun, run_id)
        assert run.status == "complete", run.result
        assert db.get(BackgroundJob, job_id).attempt_count == 1


@pytest.mark.skipif(os.name != "nt", reason="Windows coordinator hard-death acceptance")
def test_coordinator_hard_death_reaps_solver_and_next_process_recovers(queue_engine, tmp_path):
    from app.core.windows_processes import process_identity
    from app.jobs.coordinator import process_once
    engine = queue_engine
    campus = seed_campus(engine)
    with Session(engine) as db:
        actor = db.scalar(select(m.Account).where(m.Account.email == campus["email"]))
        version = m.ScheduleVersion(term_id=campus["term"], name="Crash recovery",
                                    cohort_ids=[campus["group"]], configuration={})
        db.add(version)
        db.flush()
        run = enqueue_generation(db, version.id, GenerateInput(revision=version.revision), actor)
        job_id, run_id = run.job_id, run.id
        db.commit()
    backend = str(Path(__file__).resolve().parents[1])
    site = str(Path(sys.prefix) / "Lib/site-packages")
    marker = tmp_path / "solver.pid"
    child = tmp_path / "slow-solver.py"
    child.write_text(
        "import os,sys,time,types\nfrom pathlib import Path\n"
        f"sys.path[:0]=[{backend!r},{site!r}]\n"
        "from app.jobs.solver_child import main\n"
        "fake=types.ModuleType('app.scheduling.solver')\n"
        "def generate(*args,**kwargs):\n"
        f" Path({str(marker)!r}).write_text(str(os.getpid()))\n"
        " time.sleep(60)\n return {}\n"
        "fake.generate=generate\nsys.modules['app.scheduling.solver']=fake\n"
        f"sys.argv=[__file__,str(os.getppid()),'2048',{site!r}]\nmain()\n"
    )
    helper = tmp_path / "coordinator.py"
    helper.write_text(
        "import sys\n"
        f"sys.path[:0]=[{backend!r},{site!r}]\n"
        "from app.jobs import generation\nfrom app.jobs.process import run_solver\n"
        "from app.jobs.coordinator import process_once\nfrom app.db.session import get_engine\n"
        "def controlled(request,**kwargs):\n"
        f" return run_solver(request,command=[sys.executable,'-I',{str(child)!r}],**kwargs)\n"
        "generation.run_solver=controlled\nprocess_once(get_engine(),'crash-test-owner')\n"
    )
    environment = {**os.environ, "SQLSERVER_CONNECTION_STRING": engine.url.query["odbc_connect"],
                   "WORKER_ROLE": "coordinator"}
    with (tmp_path / "coordinator.log").open("wb") as output:
        parent = subprocess.Popen([sys._base_executable, str(helper)], env=environment,
            stdout=output, stderr=output, creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            deadline = monotonic_time.monotonic() + 10
            while not marker.exists() and monotonic_time.monotonic() < deadline:
                assert parent.poll() is None, "coordinator exited before starting its solver"
                monotonic_time.sleep(0.05)
            assert marker.exists()
            solver_pid = int(marker.read_text())
            assert process_identity(solver_pid)
            parent.kill()
            parent.wait(timeout=5)
            deadline = monotonic_time.monotonic() + 5
            while process_identity(solver_pid) and monotonic_time.monotonic() < deadline:
                monotonic_time.sleep(0.05)
            assert process_identity(solver_pid) is None
        finally:
            if parent.poll() is None:
                parent.kill()
                parent.wait(timeout=5)
    with Session(engine) as db:
        old_hash = db.get(m.GenerationRun, run_id).input_hash
        db.execute(update(BackgroundJob).where(BackgroundJob.id == job_id)
            .values(lease_until=database_now(db) - timedelta(seconds=1)))
        db.commit()
    recover_expired(engine, "generation")
    with Session(engine) as db:
        row = db.get(BackgroundJob, job_id)
        assert row.state == "retry_wait"
        row.available_at = database_now(db) - timedelta(seconds=1)
        db.commit()
    assert process_once(engine, "restarted-coordinator")
    with Session(engine) as db:
        result = db.get(m.GenerationRun, run_id)
        assert result.status == "complete", result.result
        assert result.input_hash == old_hash
        assert db.get(BackgroundJob, job_id).attempt_count == 2
