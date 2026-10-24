"""Transactional admission, snapshot preparation and fenced generation application."""

import hashlib
import json
import threading
import time as monotonic_time
import uuid
from dataclasses import replace
from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models as m
from app.db.session import lock_revision
from app.jobs.models import ActiveGeneration, BackgroundJob, JobAttempt, JobRequestKey
from app.jobs.process import ReapFailure, SolverFailure, SolverStopped, run_solver
from app.jobs.queue import (
    admission_lock,
    claim_job,
    database_now,
    enqueue_job,
    finish_job,
    lock_owned,
    renew_lease,
    retry_job,
    worker_heartbeat,
)
from app.observability import telemetry
from app.observability.audit import record_audit
from app.observability.runs import Progress
from app.scheduling.snapshot import build_snapshot, comparison_hash, snapshot_hash
from app.scheduling.validation import validate

ACTIVE = ("queued", "running", "retry_wait")


class OwnershipLost(RuntimeError):
    """Force rollback of all pending domain writes when final fencing fails."""


def enqueue_generation(db, identifier, body, actor):
    admission_lock(db)
    operation = "generation"
    request_hash = hashlib.sha256(
        json.dumps(
            {
                "version_id": identifier,
                "revision": body.revision,
                "seed": body.seed,
                "algorithm": body.algorithm,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()
    # This lookup deliberately precedes version validation and queue quota checks.
    if body.idempotency_key:
        previous = db.scalar(
            select(JobRequestKey).where(
                JobRequestKey.actor_id == actor.id,
                JobRequestKey.operation == operation,
                JobRequestKey.key == body.idempotency_key,
            )
        )
        if previous:
            if previous.request_hash != request_hash:
                raise HTTPException(409, "idempotency_key_conflict")
            return db.scalar(
                select(m.GenerationRun).where(m.GenerationRun.job_id == previous.job_id)
            )
    revision = lock_revision(db, changed=False)
    version = db.get(m.ScheduleVersion, identifier, populate_existing=True)
    if not version:
        raise HTTPException(404, "version_not_found")
    if version.status != "draft":
        raise HTTPException(409, "published_version_immutable")
    if version.revision != body.revision:
        raise HTTPException(409, "stale_revision")
    if db.get(ActiveGeneration, identifier):
        raise HTTPException(409, "generation_already_running")
    count = db.scalar(
        select(func.count())
        .select_from(BackgroundJob)
        .where(BackgroundJob.kind == "generation", BackgroundJob.state.in_(ACTIVE))
    )
    if count >= get_settings().generation_queue_limit:
        raise HTTPException(429, "generation_queue_full")
    job = enqueue_job(
        db,
        "generation",
        {"enqueue_data_revision": revision},
        actor_id=actor.id,
        request_id=telemetry.request_id_var.get(),
    )
    now = database_now(db)
    run = m.GenerationRun(
        version_id=identifier,
        job_id=job.id,
        source_revision=version.revision,
        status="queued",
        seed=body.seed,
        algorithm=body.algorithm,
        snapshot={},
        input_hash="",
        actor_id=actor.id,
        request_id=job.request_id,
        updated_at=now,
        progress={"stage": "queued", "events": []},
    )
    db.add(run)
    db.flush()
    job.payload = {**job.payload, "run_id": run.id}
    db.add(ActiveGeneration(version_id=identifier, job_id=job.id))
    if body.idempotency_key:
        db.add(
            JobRequestKey(
                actor_id=actor.id,
                operation=operation,
                key=body.idempotency_key,
                request_hash=request_hash,
                job_id=job.id,
            )
        )
    record_audit(
        db,
        actor,
        "generation.requested",
        "schedule",
        identifier,
        after={"algorithm": body.algorithm, "seed": body.seed},
    )
    db.flush()
    return run


def sync_run_state(db, job):
    """Caller holds domain gate then job lock, including expired recovery paths."""
    run = db.scalar(select(m.GenerationRun).where(m.GenerationRun.job_id == job.id))
    if run is None:
        raise RuntimeError("generation_run_missing")
    run.status = job.state
    run.updated_at = database_now(db)
    run.progress = {**(run.progress or {}), "stage": run.status}
    if job.state in {"failed", "cancelled"}:
        run.finished_at = job.finished_at
        run.result = {"error": job.error_code or job.state}
        db.execute(delete(ActiveGeneration).where(ActiveGeneration.job_id == job.id))
        record_audit(
            db,
            run.actor_id,
            "generation.finished",
            "schedule",
            run.version_id,
            after={"status": job.state},
        )


def _terminal(db, claim, run, status, *, error_code=None, result=None):
    job_state = (
        "cancelled"
        if status == "cancelled"
        else ("succeeded" if status in {"complete", "partial"} else "failed")
    )
    if not finish_job(db, claim, job_state, error_code=error_code):
        raise OwnershipLost("generation_ownership_lost")
    run.status = status
    run.finished_at = run.updated_at = database_now(db)
    if result is not None:
        run.result = result
    elif error_code:
        run.result = {"error": error_code}
    run.progress = {**(run.progress or {}), "stage": status}
    db.execute(delete(ActiveGeneration).where(ActiveGeneration.job_id == claim.job_id))
    record_audit(
        db,
        run.actor_id,
        "generation.finished",
        "schedule",
        run.version_id,
        after={"status": status},
    )
    return True


def prepare(engine, claim):
    with Session(engine, expire_on_commit=False) as db:
        revision = lock_revision(db, changed=False)
        # The domain gate serializes generation cancellation/recovery. Leave the
        # job row unlocked while preparing inputs so its heartbeat can renew.
        job = db.get(BackgroundJob, claim.job_id, populate_existing=True)
        now = database_now(db)
        if (job is None or job.state != "running" or job.owner_id != claim.owner_id
                or job.lease_generation != claim.lease_generation
                or job.lease_until <= now or job.deadline_at <= now):
            return None
        run = db.get(m.GenerationRun, claim.payload["run_id"])
        version = db.get(m.ScheduleVersion, run.version_id, populate_existing=True)
        if job.cancel_requested_at:
            _terminal(db, claim, run, "cancelled")
            db.commit()
            return None
        if (
            version.status != "draft"
            or version.revision != run.source_revision
            or (run.snapshot and run.snapshot["data_revision"] != revision)
        ):
            _terminal(db, claim, run, "stale", error_code="stale_inputs")
            db.commit()
            return None
        if not run.snapshot:
            run.snapshot = build_snapshot(db, version, materialize=True)
            run.input_hash = snapshot_hash(run.snapshot)
            run.comparison_hash = comparison_hash(run.snapshot)
            run.snapshot_created_at = database_now(db)
        job = lock_owned(db, claim)
        if job is None:
            raise OwnershipLost("generation_ownership_lost")
        now = database_now(db)
        budget = (
            run.snapshot["term"]["search_seconds"] + get_settings().solver_grace_seconds
        )
        attempt = db.scalar(
            select(JobAttempt).where(
                JobAttempt.job_id == job.id,
                JobAttempt.attempt_number == claim.attempt_number,
            )
        )
        job.deadline_at = attempt.started_at + timedelta(seconds=budget)
        if job.deadline_at <= now:
            raise OwnershipLost("generation_deadline_expired")
        budget = max(0, (job.deadline_at - now).total_seconds())
        attempt.deadline_at, attempt.input_hash = job.deadline_at, run.input_hash
        run.status = "running"
        run.started_at = run.started_at or now
        run.updated_at = now
        request = {
            "protocol_version": 1,
            "snapshot": run.snapshot,
            "algorithm": run.algorithm,
            "seed": run.seed,
            "search_seconds": run.snapshot["term"]["search_seconds"],
        }
        claim = replace(claim, deadline_at=job.deadline_at)
        db.commit()
        return claim, request, budget, run.version_id, run.request_id


def assignment_model(version_id, item):
    return m.Assignment(
        version_id=version_id,
        occurrence_id=item["occurrence_id"],
        day=date.fromisoformat(item["day"]),
        slot=item["slot"],
        room_id=item["room_id"],
        starts_at=time.fromisoformat(item["starts_at"]),
        ends_at=time.fromisoformat(item["ends_at"]),
        pinned=item.get("pinned", False),
        cancelled=item.get("cancelled", False),
    )


def apply_result(engine, claim, result):
    with Session(engine) as db:
        revision = lock_revision(db, changed=False)
        job = lock_owned(db, claim)
        if job is None:
            return False
        run = db.get(m.GenerationRun, claim.payload["run_id"])
        version = db.get(m.ScheduleVersion, run.version_id, populate_existing=True)
        if job.cancel_requested_at:
            _terminal(db, claim, run, "cancelled")
        elif (
            version.status != "draft"
            or version.revision != run.source_revision
            or revision != run.snapshot["data_revision"]
        ):
            _terminal(db, claim, run, "stale", error_code="stale_inputs", result=result)
        else:
            # Independently validate the CPU result before any assignment writes.
            report = validate(run.snapshot, result["assignments"])
            result = {**result, "report": report}
            if result["status"] in {"INVALID_PINS", "MODEL_INVALID"} or any(
                issue["code"] != "configuration_unconfirmed"
                for issue in report["issues"]
            ):
                _terminal(
                    db,
                    claim,
                    run,
                    "rejected",
                    error_code="result_rejected",
                    result=result,
                )
            else:
                db.execute(
                    delete(m.Assignment).where(m.Assignment.version_id == version.id)
                )
                db.add_all(
                    assignment_model(version.id, row) for row in result["assignments"]
                )
                version.report = report
                version.configuration = {
                    "term": run.snapshot["term"],
                    "calendar": run.snapshot["calendar"],
                }
                version.revision += 1
                _terminal(
                    db,
                    claim,
                    run,
                    "complete" if report["complete"] else "partial",
                    result=result,
                )
        db.commit()
        return True


def record_failure(engine, claim, error, *, deterministic=False):
    with Session(engine) as db:
        lock_revision(db, changed=False)
        job = lock_owned(db, claim)
        if job is None:
            return
        run = db.get(m.GenerationRun, claim.payload["run_id"])
        if job.cancel_requested_at:
            _terminal(db, claim, run, "cancelled")
        elif deterministic:
            _terminal(db, claim, run, "failed", error_code="solver_failed")
        else:
            if not retry_job(db, claim, "generation_failed"):
                raise OwnershipLost("generation_ownership_lost")
            sync_run_state(db, job)
        db.commit()


def execute_claim(engine, claim, *, shutdown=None):
    preparation_done, preparation_lost = threading.Event(), threading.Event()

    def preparation_heartbeat():
        while not preparation_done.wait(get_settings().job_heartbeat_seconds):
            try:
                if (shutdown is not None and shutdown.is_set()) or not renew_lease(engine, claim):
                    preparation_lost.set()
                    return
                worker_heartbeat(engine, claim.owner_id, "coordinator", status="running", current_job_id=claim.job_id)
            except Exception:  # noqa: BLE001 - fail closed if preparation heartbeat fails
                preparation_lost.set()
                return

    preparation_thread = threading.Thread(target=preparation_heartbeat, daemon=True)
    preparation_thread.start()
    try:
        prepared = prepare(engine, claim)
    except Exception as error:  # noqa: BLE001 - worker boundary; persisted below
        telemetry.exception_event(
            "generation.failed", error, run_id=claim.payload["run_id"]
        )
        record_failure(
            engine,
            claim,
            error,
            deterministic=isinstance(error, (ValueError, KeyError)),
        )
        return
    finally:
        preparation_done.set()
        preparation_thread.join(timeout=get_settings().job_heartbeat_seconds + 1)
    if preparation_lost.is_set() or (shutdown is not None and shutdown.is_set()):
        record_failure(engine, claim, SolverStopped("preparation_interrupted"))
        return
    if prepared is None:
        return
    claim, request, budget, version_id, request_id = prepared
    renewal_started = monotonic_time.monotonic()
    if not renew_lease(engine, claim):
        record_failure(engine, claim, SolverStopped("ownership_unavailable"))
        return
    context = telemetry.request_id_var.set(request_id)

    class LeaseStop(threading.Event):
        # Local monotonic watchdog still stops the child if heartbeat SQL blocks.
        valid_until = renewal_started + get_settings().job_lease_seconds

        def is_set(self):
            return (
                super().is_set()
                or monotonic_time.monotonic() >= self.valid_until
                or (shutdown is not None and shutdown.is_set())
            )

    stop, done = LeaseStop(), threading.Event()
    heartbeat_failed = threading.Event()

    def heartbeat():
        while not done.wait(get_settings().job_heartbeat_seconds):
            try:
                if shutdown is not None and shutdown.is_set():
                    stop.set()
                    return
                renewal_started = monotonic_time.monotonic()
                if not renew_lease(engine, claim):
                    stop.set()
                    return
                stop.valid_until = renewal_started + get_settings().job_lease_seconds
                worker_heartbeat(
                    engine,
                    claim.owner_id,
                    "coordinator",
                    status="running",
                    current_job_id=claim.job_id,
                )
            except Exception:  # noqa: BLE001 - fail closed on heartbeat failure
                heartbeat_failed.set()
                stop.set()
                return

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    progress = Progress(engine, claim.payload["run_id"], version_id, claim=claim)
    try:
        progress("preparing", total=len(request["snapshot"]["occurrences"]))
        telemetry.emit(
            "generation.started", run_id=claim.payload["run_id"], version_id=version_id
        )
        settings = get_settings()
        result = run_solver(
            request,
            deadline_seconds=budget,
            stop=stop,
            progress=progress,
            memory_mb=settings.solver_memory_mb,
            input_limit=settings.solver_input_max_bytes,
            output_limit=settings.solver_output_max_bytes,
        )
        progress("saving")
        apply_result(engine, claim, result)
    except ReapFailure:
        # Leave ownership to expire; halt the coordinator rather than risk a second CPU child.
        raise
    except Exception as error:  # noqa: BLE001 - worker boundary; persisted below
        telemetry.exception_event(
            "generation.failed", error, run_id=claim.payload["run_id"]
        )
        # Never turn lease loss or a transient heartbeat DB failure into a cancellation.
        if not heartbeat_failed.is_set():
            record_failure(
                engine,
                claim,
                error,
                deterministic=isinstance(error, SolverFailure)
                and not isinstance(error, SolverStopped),
            )
    finally:
        done.set()
        thread.join(timeout=get_settings().job_heartbeat_seconds + 1)
        telemetry.request_id_var.reset(context)


def execute_run(engine, run_id):
    """Deterministic worker pump for tests/CLI; never called by the API."""
    with Session(engine) as db:
        run = db.get(m.GenerationRun, run_id)
        if run is None or run.job_id is None:
            return
        job_id = run.job_id
    claim = claim_job(engine, "generation", "test-" + uuid.uuid4().hex, job_id=job_id)
    if claim:
        execute_claim(engine, claim)


def cancel_run(db, identifier):
    lock_revision(db, changed=False)
    run = db.get(m.GenerationRun, identifier, populate_existing=True)
    if run is None:
        raise HTTPException(404, "run_not_found")
    if run.job_id is None:
        return run
    db.execute(
        update(BackgroundJob)
        .where(BackgroundJob.id == run.job_id)
        .values(updated_at=BackgroundJob.updated_at)
    )
    job = db.get(BackgroundJob, run.job_id, populate_existing=True)
    if job.state not in ACTIVE:
        return run
    job.cancel_requested_at = database_now(db)
    if job.state != "running":
        job.state = "cancelled"
        job.finished_at = job.updated_at = database_now(db)
        sync_run_state(db, job)
    db.flush()
    return run
