"""SQL Server queue protocol. SQLite CAS exists only for isolated unit tests."""

import os
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.jobs.models import BackgroundJob, JobAttempt, QueueAdmission, WorkerHeartbeat


@dataclass(frozen=True)
class Claim:
    job_id: int
    owner_id: str
    lease_generation: int
    attempt_number: int
    payload: dict
    deadline_at: datetime


def database_now(db):
    if db.bind.dialect.name == "mssql":
        return db.scalar(text("SELECT SYSUTCDATETIME()"))
    if db.bind.dialect.name != "sqlite":
        raise RuntimeError("unsupported_queue_database")
    return datetime.now(UTC).replace(tzinfo=None)


def admission_lock(db):
    result = db.execute(
        update(QueueAdmission)
        .where(QueueAdmission.name == "generation")
        .values(name=QueueAdmission.name)
    )
    if result.rowcount != 1:
        raise RuntimeError("queue_admission_missing")


def enqueue_job(
    db,
    kind,
    payload,
    *,
    actor_id=None,
    request_id=None,
    max_attempts=None,
    available_at=None,
):
    now = database_now(db)
    job = BackgroundJob(
        kind=kind,
        payload=payload,
        actor_id=actor_id,
        request_id=request_id,
        max_attempts=max_attempts or get_settings().job_max_attempts,
        available_at=available_at or now,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.flush()
    return job


# READCOMMITTEDLOCK is required for READPAST with READ_COMMITTED_SNAPSHOT ON.
# Do not combine ROWLOCK with READCOMMITTEDLOCK (same SQL Server hint group).
SQL_CLAIM = """
;WITH candidate AS (
 SELECT TOP (1) * FROM BackgroundJob WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
 WHERE kind=:kind AND protocol_version=1 AND state IN ('queued','retry_wait')
 AND available_at<=:now AND cancel_requested_at IS NULL AND attempt_count<max_attempts
 AND (:job_id IS NULL OR id=:job_id)
 ORDER BY priority DESC, available_at, id
)
UPDATE candidate SET state='running', owner_id=:owner,
 lease_generation=lease_generation+1, attempt_count=attempt_count+1,
 lease_until=:lease, deadline_at=:deadline, updated_at=:now,
 started_at=COALESCE(started_at,:now)
OUTPUT inserted.id;
"""


def claim_job(engine, kind, owner_id, *, job_id=None):
    with Session(engine, expire_on_commit=False) as db:
        if kind == "generation":
            admission_lock(db)
            # Even an expired owner blocks claims until the ordered recovery sweep.
            if db.scalar(
                select(BackgroundJob.id)
                .where(BackgroundJob.kind == kind, BackgroundJob.state == "running")
                .limit(1)
            ):
                return None
        now = database_now(db)
        lease = now + timedelta(seconds=get_settings().job_lease_seconds)
        deadline = now + timedelta(seconds=300)
        if engine.dialect.name == "mssql":
            identifier = db.scalar(
                text(SQL_CLAIM),
                {
                    "kind": kind,
                    "job_id": job_id,
                    "owner": owner_id,
                    "now": now,
                    "lease": lease,
                    "deadline": deadline,
                },
            )
        else:
            eligible = (
                BackgroundJob.kind == kind,
                BackgroundJob.protocol_version == 1,
                BackgroundJob.state.in_(["queued", "retry_wait"]),
                BackgroundJob.available_at <= now,
                BackgroundJob.cancel_requested_at.is_(None),
                BackgroundJob.attempt_count < BackgroundJob.max_attempts,
            )
            query = select(BackgroundJob.id).where(*eligible)
            if job_id is not None:
                query = query.where(BackgroundJob.id == job_id)
            identifier = db.scalar(
                query.order_by(
                    BackgroundJob.priority.desc(),
                    BackgroundJob.available_at,
                    BackgroundJob.id,
                ).limit(1)
            )
            if identifier is not None:
                changed = db.execute(
                    update(BackgroundJob)
                    .where(BackgroundJob.id == identifier, *eligible)
                    .values(
                        state="running",
                        owner_id=owner_id,
                        lease_until=lease,
                        deadline_at=deadline,
                        started_at=now,
                        updated_at=now,
                        lease_generation=BackgroundJob.lease_generation + 1,
                        attempt_count=BackgroundJob.attempt_count + 1,
                    )
                ).rowcount
                if not changed:
                    identifier = None
        if identifier is None:
            return None
        job = db.get(BackgroundJob, identifier, populate_existing=True)
        if kind == "mail":
            from app.jobs.models import MailOutbox
            expires = db.scalar(select(MailOutbox.expires_at).where(MailOutbox.job_id == identifier))
            if expires is not None:
                job.deadline_at = min(deadline, expires)
        deadline = job.deadline_at
        db.add(
            JobAttempt(
                job_id=job.id,
                attempt_number=job.attempt_count,
                lease_generation=job.lease_generation,
                worker_instance=owner_id,
                started_at=now,
                deadline_at=deadline,
            )
        )
        claim = Claim(
            job.id,
            owner_id,
            job.lease_generation,
            job.attempt_count,
            dict(job.payload),
            deadline,
        )
        db.commit()
        return claim


def _owned(claim, now):
    return (
        BackgroundJob.id == claim.job_id,
        BackgroundJob.state == "running",
        BackgroundJob.owner_id == claim.owner_id,
        BackgroundJob.lease_generation == claim.lease_generation,
        BackgroundJob.lease_until > now,
        BackgroundJob.deadline_at > now,
    )


def lock_owned(db, claim):
    now = database_now(db)
    if not db.execute(
        update(BackgroundJob)
        .where(*_owned(claim, now))
        .values(updated_at=BackgroundJob.updated_at)
    ).rowcount:
        return None
    job = db.get(BackgroundJob, claim.job_id, populate_existing=True)
    # A blocking UPDATE may have waited past the lease. Recheck server time only
    # after holding the row lock; a pre-wait timestamp cannot authorize a write.
    now = database_now(db)
    if job.lease_until <= now or job.deadline_at <= now:
        return None
    return job


def renew_lease(engine, claim):
    with Session(engine) as db:
        job = lock_owned(db, claim)
        if job is None or job.cancel_requested_at is not None:
            return False
        now = database_now(db)
        job.lease_until = now + timedelta(seconds=get_settings().job_lease_seconds)
        job.updated_at = now
        db.commit()
        return True


def _attempt_end(db, job, state, error_code, now):
    db.execute(
        update(JobAttempt)
        .where(
            JobAttempt.job_id == job.id, JobAttempt.attempt_number == job.attempt_count
        )
        .values(finished_at=now, outcome=state, error_code=error_code)
    )


def finish_job(db, claim, state, *, error_code=None):
    if state not in {"succeeded", "failed", "cancelled"}:
        raise ValueError("invalid_terminal_state")
    job = lock_owned(db, claim)
    if job is None:
        return False
    now = database_now(db)
    job.state, job.error_code = state, error_code
    job.finished_at = job.updated_at = now
    job.owner_id = job.lease_until = None
    _attempt_end(db, job, state, error_code, now)
    db.flush()
    return True


def retry_job(db, claim, error_code):
    job = lock_owned(db, claim)
    if job is None:
        return False
    now = database_now(db)
    state = "failed" if job.attempt_count >= job.max_attempts else "retry_wait"
    if job.cancel_requested_at:
        state = "cancelled"
    job.state, job.error_code, job.updated_at = state, error_code, now
    job.owner_id = job.lease_until = None
    job.finished_at = now if state != "retry_wait" else None
    job.available_at = now + timedelta(
        seconds=(5 if job.attempt_count == 1 else 20) + random.uniform(0, 1)
    )
    _attempt_end(db, job, state, error_code, now)
    db.flush()
    return True


def recover_expired(engine, kind):
    # Scan without write locks, then acquire domain -> conditional job for generation.
    with Session(engine) as db:
        now = database_now(db)
        ids = list(
            db.scalars(
                select(BackgroundJob.id)
                .where(
                    BackgroundJob.kind == kind,
                    BackgroundJob.state == "running",
                    (BackgroundJob.lease_until <= now)
                    | (BackgroundJob.deadline_at <= now),
                )
                .order_by(BackgroundJob.id)
                .limit(100)
            )
        )
    for identifier in ids:
        with Session(engine) as db:
            if kind == "generation":
                from app.db.session import lock_revision

                lock_revision(db, changed=False)
            now = database_now(db)
            count = db.execute(
                update(BackgroundJob)
                .where(
                    BackgroundJob.id == identifier,
                    BackgroundJob.state == "running",
                    (BackgroundJob.lease_until <= now)
                    | (BackgroundJob.deadline_at <= now),
                )
                .values(updated_at=now)
            ).rowcount
            if not count:
                continue
            job = db.get(BackgroundJob, identifier, populate_existing=True)
            state = (
                "cancelled"
                if job.cancel_requested_at
                else (
                    "failed" if job.attempt_count >= job.max_attempts else "retry_wait"
                )
            )
            job.state, job.error_code = state, "lease_expired"
            job.owner_id = job.lease_until = None
            job.available_at = now + timedelta(
                seconds=(5 if job.attempt_count == 1 else 20) + random.uniform(0, 1)
            )
            job.finished_at = now if state != "retry_wait" else None
            _attempt_end(db, job, state, "lease_expired", now)
            if kind == "generation":
                from app.jobs.generation import sync_run_state

                sync_run_state(db, job)
            db.commit()
    return len(ids)


def worker_heartbeat(engine, instance_id, role, *, status="idle", current_job_id=None):
    with Session(engine) as db:
        now = database_now(db)
        # Each instance ID has one process owner. UPDATE before INSERT keeps writes bounded.
        row = db.get(WorkerHeartbeat, instance_id)
        if row is None:
            row = WorkerHeartbeat(instance_id=instance_id, role=role, pid=os.getpid())
            db.add(row)
        row.last_seen_at, row.status, row.current_job_id = now, status, current_job_id
        db.commit()
