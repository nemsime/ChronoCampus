"""Durable mail and bounded maintenance worker (no migrations or backups)."""

import os
import threading
import time
from contextlib import contextmanager
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import delete, exists, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.mail import MailError, decrypt_payload, send_reset
from app.core.config import get_settings
from app.core.security import token_hash
from app.core.shutdown import shutdown_event
from app.db.models import Account, RateLimit, ResetToken, UserSession
from app.db.session import get_engine, lock_revision
from app.jobs.models import BackgroundJob, MailOutbox, MaintenanceSchedule
from app.jobs.queue import (
    claim_job,
    database_now,
    enqueue_job,
    finish_job,
    lock_owned,
    recover_expired,
    renew_lease,
    retry_job,
    worker_heartbeat,
)
from app.observability.telemetry import emit

TERMINAL = ("succeeded", "failed", "cancelled")


@contextmanager
def _heartbeat(engine, claim, settings):
    stop, lost = threading.Event(), threading.Event()

    def pulse():
        while not stop.wait(settings.job_heartbeat_seconds):
            try:
                if not renew_lease(engine, claim):
                    lost.set()
                    return
                worker_heartbeat(
                    engine,
                    claim.owner_id,
                    "io",
                    status="busy",
                    current_job_id=claim.job_id,
                )
            except Exception:  # noqa: BLE001 - redact arbitrary driver failures
                # No exception message/traceback: drivers can embed credentials or SQL parameters.
                lost.set()
                emit(
                    "mail.heartbeat_failed",
                    level="ERROR",
                    error_code="heartbeat_failed",
                )
                return

    thread = threading.Thread(target=pulse, name="mail-lease", daemon=True)
    thread.start()
    try:
        yield lost
    finally:
        stop.set()
        thread.join()


def _invalid(db, outbox, payload=None):
    now = database_now(db)
    token = db.get(ResetToken, outbox.reset_token_id)
    if outbox.expires_at <= now or not token or token.expires_at <= now:
        return "mail_expired"
    account = db.get(Account, token.user_id)
    if token.used or not account or not account.is_active:
        return "mail_reset_invalid"
    if payload and (
        token.token != token_hash(payload["token"]) or account.email != payload["email"]
    ):
        return "mail_payload_invalid"
    return None


def _finish(db, claim, outbox, state, code=None):
    if finish_job(db, claim, state, error_code=code):
        if outbox is not None:
            outbox.delivery_state = (
                "delivered"
                if state == "succeeded"
                else ("expired" if code == "mail_expired" else "failed")
            )
            outbox.encrypted_payload = None
        db.commit()
        return True
    return False


def _mail(engine, claim, settings):
    try:
        # Short domain -> job transaction. No connection remains held during I/O.
        with Session(engine) as db:
            lock_revision(db, changed=False)
            if lock_owned(db, claim) is None:
                return
            outbox = db.scalar(
                select(MailOutbox).where(MailOutbox.job_id == claim.job_id)
            )
            if outbox is None:
                _finish(db, claim, None, "failed", "mail_outbox_missing")
                return
            code = _invalid(db, outbox)
            if code:
                _finish(db, claim, outbox, "failed", code)
                return
            payload = decrypt_payload(outbox, settings)
            code = _invalid(db, outbox, payload)
            if code:
                _finish(db, claim, outbox, "failed", code)
                return
            message_id = outbox.message_id
            started = time.monotonic()
            deadline = started + max(0, (outbox.expires_at - database_now(db)).total_seconds())
            db.commit()
        # Recheck ownership immediately before external side effects. Heartbeat
        # remains independent of blocking SMTP, whose socket timeout is < lease.
        with _heartbeat(engine, claim, settings) as lost:
            if not renew_lease(engine, claim) or lost.is_set():
                return
            send_reset(
                payload["email"],
                payload["token"],
                job_id=claim.job_id,
                message_id=message_id,
                settings=settings,
                deadline=deadline,
                cancelled=lost.is_set,
            )
            if lost.is_set():
                return
            with Session(engine) as db:
                outbox = db.scalar(
                    select(MailOutbox).where(MailOutbox.job_id == claim.job_id)
                )
                _finish(db, claim, outbox, "succeeded")
    except Exception as error:  # noqa: BLE001 - redact arbitrary delivery failures
        code = (
            str(error)
            if isinstance(error, MailError)
            and str(error)
            in {"mail_not_configured", "mail_key_missing", "mail_payload_invalid", "mail_expired", "mail_ownership_lost"}
            else "mail_delivery_failed"
        )
        emit("mail.delivery_failed", level="ERROR", error_code=code)
        with Session(engine) as db:
            if lock_owned(db, claim) is None:
                return
            outbox = db.scalar(
                select(MailOutbox).where(MailOutbox.job_id == claim.job_id)
            )
            if code in {"mail_payload_invalid", "mail_expired"}:
                _finish(db, claim, outbox, "failed", code)
            elif retry_job(db, claim, code):
                job = db.get(BackgroundJob, claim.job_id, populate_existing=True)
                if outbox is not None:
                    outbox.delivery_state = (
                        "retry_wait" if job.state == "retry_wait" else "failed"
                    )
                    if job.state in TERMINAL:
                        outbox.encrypted_payload = None
                db.commit()


def _schedule_maintenance(engine):
    with Session(engine) as db:
        lock_revision(db, changed=False)
        bucket = database_now(db).replace(second=0, microsecond=0)
        if (
            db.scalar(
                select(MaintenanceSchedule.id).where(
                    MaintenanceSchedule.task_kind == "auth_cleanup",
                    MaintenanceSchedule.due_bucket == bucket,
                )
            )
            is not None
        ):
            return
        try:
            db.add(MaintenanceSchedule(task_kind="auth_cleanup", due_bucket=bucket))
            enqueue_job(db, "maintenance", {"task": "auth_cleanup"})
            db.commit()
        except IntegrityError:
            db.rollback()  # A simultaneous worker already scheduled this bucket.


def _clear_terminal(db, now, limit=500):
    rows = list(
        db.execute(
            select(MailOutbox, BackgroundJob.state)
            .join(BackgroundJob)
            .where(
                BackgroundJob.state.in_(TERMINAL),
                MailOutbox.encrypted_payload.is_not(None),
            )
            .order_by(MailOutbox.id)
            .limit(limit)
        )
    )
    for row, state in rows:
        row.encrypted_payload = None
        row.delivery_state = (
            "delivered"
            if state == "succeeded"
            else ("expired" if row.expires_at <= now else "failed")
        )
    db.flush()
    return len(rows)


def _reconcile_recovered_mail(engine):
    # Queue recovery may exhaust an attempt before the mail handler can run.
    # Reconcile those terminal outcomes immediately, including after a restart.
    with Session(engine) as db:
        lock_revision(db, changed=False)
        _clear_terminal(db, database_now(db))
        db.commit()


def _maintenance(engine, claim):
    with Session(engine) as db:
        lock_revision(db, changed=False)
        if lock_owned(db, claim) is None:
            return
        now = database_now(db)
        remaining = 500 - _clear_terminal(db, now)
        # Keep active mail references and every job/attempt/audit/schedule history.
        outbox_ids = (
            list(
                db.scalars(
                    select(MailOutbox.id)
                    .join(BackgroundJob)
                    .where(
                        BackgroundJob.state.in_(TERMINAL), MailOutbox.expires_at <= now
                    )
                    .order_by(MailOutbox.id)
                    .limit(remaining)
                )
            )
            if remaining
            else []
        )
        if outbox_ids:
            db.execute(delete(MailOutbox).where(MailOutbox.id.in_(outbox_ids)))
            remaining -= len(outbox_ids)
        targets = (
            (UserSession, UserSession.id, UserSession.expires_at <= now),
            (
                RateLimit,
                RateLimit.key,
                RateLimit.started_at <= now - timedelta(minutes=15),
            ),
            (
                ResetToken,
                ResetToken.id,
                (ResetToken.expires_at <= now)
                & ~exists(
                    select(MailOutbox.id).where(
                        MailOutbox.reset_token_id == ResetToken.id
                    )
                ),
            ),
        )
        for model, primary, condition in targets:
            if not remaining:
                break
            identifiers = list(
                db.scalars(
                    select(primary).where(condition).order_by(primary).limit(remaining)
                )
            )
            if identifiers:
                db.execute(delete(model).where(primary.in_(identifiers)))
                remaining -= len(identifiers)
        if finish_job(db, claim, "succeeded"):
            db.commit()


def process_once(engine, instance_id):
    """Pump at most one mail job and one bounded cleanup job using this engine."""
    settings = get_settings()
    worker_heartbeat(engine, instance_id, "io")
    recover_expired(engine, "mail")
    recover_expired(engine, "maintenance")
    _expire_pending_mail(engine)
    _reconcile_recovered_mail(engine)
    claim = claim_job(engine, "mail", instance_id)
    if claim:
        worker_heartbeat(
            engine, instance_id, "io", status="busy", current_job_id=claim.job_id
        )
        _mail(engine, claim, settings)
    _schedule_maintenance(engine)
    maintenance = claim_job(engine, "maintenance", instance_id)
    if maintenance:
        _maintenance(engine, maintenance)
    worker_heartbeat(engine, instance_id, "io")
    return bool(claim or maintenance)


def _expire_pending_mail(engine):
    with Session(engine) as db:
        lock_revision(db, changed=False)
        now = database_now(db)
        rows = list(db.scalars(select(MailOutbox).join(BackgroundJob).where(
            MailOutbox.expires_at <= now, BackgroundJob.state.in_(["queued", "retry_wait"])
        ).order_by(MailOutbox.id).limit(500)))
        for outbox in rows:
            changed = db.execute(update(BackgroundJob).where(
                BackgroundJob.id == outbox.job_id, BackgroundJob.state.in_(["queued", "retry_wait"])
            ).values(state="failed", error_code="mail_expired", finished_at=now, updated_at=now)).rowcount
            if changed:
                outbox.encrypted_payload = None
                outbox.delivery_state = "expired"
        db.commit()


def main():
    from app.observability.telemetry import configure

    settings = get_settings()
    instance_id = settings.worker_instance_id or f"io-{os.getpid()}-{uuid4().hex[:12]}"
    configure(
        settings.model_copy(
            update={"worker_role": "io", "worker_instance_id": instance_id}
        )
    )
    stop = shutdown_event()
    engine = get_engine()
    try:
        while not stop.is_set():
            try:
                process_once(engine, instance_id)
            except Exception:  # noqa: BLE001 - keep the worker alive without secrets
                emit("io.cycle_failed", level="ERROR", error_code="worker_cycle_failed")
            stop.wait(settings.job_poll_seconds)
    finally:
        worker_heartbeat(engine, instance_id, "io", status="stopped")
        engine.dispose()


if __name__ == "__main__":
    main()
