"""SQLite tests prove protocol behavior, not SQL Server race semantics."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.jobs.models import JobAttempt
from app.jobs.queue import (
    SQL_CLAIM,
    claim_job,
    enqueue_job,
    finish_job,
    lock_owned,
    recover_expired,
    renew_lease,
    retry_job,
    worker_heartbeat,
)


def test_claim_fencing_attempts_and_deadline(database):
    db = database
    job = enqueue_job(db, "mail", {"test": True})
    db.commit()
    claim = claim_job(db.bind, "mail", "one")
    assert claim.job_id == job.id and claim.attempt_number == 1
    assert claim_job(db.bind, "mail", "two") is None
    assert renew_lease(db.bind, claim)
    assert lock_owned(db, replace(claim, lease_generation=0)) is None
    assert not finish_job(db, replace(claim, owner_id="other"), "succeeded")
    db.rollback()
    assert finish_job(db, claim, "succeeded")
    db.commit()
    assert not renew_lease(db.bind, claim)
    assert not finish_job(db, claim, "failed")
    attempt = db.scalar(select(JobAttempt).where(JobAttempt.job_id == job.id))
    assert attempt.outcome == "succeeded" and attempt.finished_at


def test_retry_recovery_exhaustion_and_stale_owner(database):
    db = database
    job = enqueue_job(db, "mail", {}, max_attempts=2)
    db.commit()
    first = claim_job(db.bind, "mail", "first")
    assert retry_job(db, first, "transient")
    db.commit()
    db.refresh(job)
    assert job.state == "retry_wait" and job.finished_at is None
    job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()
    second = claim_job(db.bind, "mail", "second")
    assert second.lease_generation > first.lease_generation
    assert not finish_job(db, first, "succeeded")
    db.rollback()
    db.refresh(job)
    job.lease_until = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()
    assert not renew_lease(db.bind, second)
    recover_expired(db.bind, "mail")
    db.refresh(job)
    assert job.state == "failed" and job.error_code == "lease_expired"
    assert not finish_job(db, second, "succeeded")
    assert claim_job(db.bind, "mail", "third") is None
    assert len(list(db.scalars(select(JobAttempt)))) == 2


def test_generation_global_slot_independent_mail_and_cancel_lease(database):
    db = database
    a = enqueue_job(db, "generation", {})
    b = enqueue_job(db, "generation", {})
    mail = enqueue_job(db, "mail", {})
    db.commit()
    first = claim_job(db.bind, "generation", "one", job_id=a.id)
    assert first
    assert claim_job(db.bind, "generation", "two", job_id=b.id) is None
    assert claim_job(db.bind, "mail", "io", job_id=mail.id)
    db.refresh(a)
    a.cancel_requested_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    assert not renew_lease(db.bind, first)
    assert lock_owned(db, first)  # cancellation can still finalize with live fence
    db.rollback()
    worker_heartbeat(db.bind, "one", "coordinator", current_job_id=a.id)
    # RCSI ON requires READCOMMITTEDLOCK; ROWLOCK conflicts with that hint group.
    assert "READCOMMITTEDLOCK" in SQL_CLAIM and "READPAST" in SQL_CLAIM
    assert "OUTPUT inserted.id" in SQL_CLAIM


def test_deadline_cannot_be_extended_by_heartbeat(database):
    job = enqueue_job(database, "mail", {})
    database.commit()
    claim = claim_job(database.bind, "mail", "owner")
    database.refresh(job)
    job.deadline_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database.commit()
    assert not renew_lease(database.bind, claim)
    assert not finish_job(database, claim, "succeeded")
    database.rollback()
    recover_expired(database.bind, "mail")
    database.refresh(job)
    assert job.state == "retry_wait"


def test_lock_owned_rechecks_time_after_lock_wait(database, monkeypatch):
    from app.jobs import queue

    enqueue_job(database, "mail", {})
    database.commit()
    claim = claim_job(database.bind, "mail", "owner")
    now = datetime.now(UTC).replace(tzinfo=None)
    values = iter([now, now + timedelta(seconds=120)])
    monkeypatch.setattr(queue, "database_now", lambda db: next(values))
    assert lock_owned(database, claim) is None
    database.rollback()
