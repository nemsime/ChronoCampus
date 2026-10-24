import json
from datetime import UTC, datetime, timedelta
from email import policy
from email.parser import BytesParser

import pytest
from app.accounts.mail import (
    MailError,
    decrypt_payload,
    enqueue_reset,
    init_keys,
    load_keys,
    rotate_keys,
    send_reset,
)
from app.core.security import token_hash
from app.db.models import (
    Account,
    Base,
    DataRevision,
    RateLimit,
    ResetToken,
    UserSession,
)
from app.jobs.io_worker import process_once
from app.jobs.models import BackgroundJob, JobAttempt, MailOutbox, MaintenanceSchedule
from conftest import HASH
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

RAW = "secret-reset-token-that-must-not-be-logged"


@pytest.fixture
def mail_runtime(client, tmp_path, monkeypatch):
    from app.accounts.router import get_settings

    settings = get_settings()
    settings.mail_keys_file = tmp_path / "test-mail-keys.json"
    init_keys(settings.mail_keys_file)
    monkeypatch.setattr("app.jobs.io_worker.get_settings", lambda: settings)
    monkeypatch.setattr("app.jobs.queue.get_settings", lambda: settings)
    return settings


def queued(db, settings, *, raw=RAW):
    token = ResetToken(
        user_id=1,
        token=token_hash(raw),
        expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(minutes=30),
    )
    job = enqueue_reset(db, db.get(Account, 1), raw, token, settings)
    db.commit()
    return job.id


def refresh(db):
    db.rollback()
    db.expire_all()


def test_atomic_rollback(database, mail_runtime):
    def reject(*_):
        raise RuntimeError("simulated outbox write failure")

    event.listen(MailOutbox, "before_insert", reject)
    try:
        with pytest.raises(RuntimeError):
            queued(database, mail_runtime)
        database.rollback()
    finally:
        event.remove(MailOutbox, "before_insert", reject)
    for model in (ResetToken, BackgroundJob, MailOutbox):
        assert database.scalar(select(func.count()).select_from(model)) == 0


def test_known_unknown_and_missing_key_uniform(client, database, mail_runtime):
    for missing in (False, True):
        if missing:
            mail_runtime.mail_keys_file.unlink()
        responses = [
            client.post("/api/auth/forgot-password", json={"email": email})
            for email in ("admin@example.invalid", "unknown@example.invalid")
        ]
        assert (
            responses[0].status_code
            == responses[1].status_code
            == (503 if missing else 202)
        )
        assert responses[0].json() == responses[1].json()
    assert database.scalar(select(func.count()).select_from(MailOutbox)) == 1


def test_encryption_and_delivery_persist(database, mail_runtime, tmp_path):
    identifier = queued(database, mail_runtime)
    outbox = database.scalar(select(MailOutbox))
    assert RAW not in outbox.encrypted_payload
    assert "admin@example.invalid" not in outbox.encrypted_payload
    assert decrypt_payload(outbox, mail_runtime) == {
        "email": "admin@example.invalid",
        "token": RAW,
    }
    assert database.get(BackgroundJob, identifier).payload == {}
    process_once(database.get_bind(), "mail-io")
    refresh(database)
    outbox = database.scalar(select(MailOutbox))
    assert outbox.encrypted_payload is None and outbox.delivery_state == "delivered"
    assert database.get(BackgroundJob, identifier).state == "succeeded"
    message = BytesParser(policy=policy.default).parsebytes(
        next(tmp_path.glob("*.eml")).read_bytes()
    )
    assert message["Message-ID"] == outbox.message_id
    assert RAW in message.get_content()
    assert (
        database.scalar(
            select(JobAttempt).where(JobAttempt.job_id == identifier)
        ).outcome
        == "succeeded"
    )
    process_once(database.get_bind(), "restarted-io")
    assert len(list(tmp_path.glob("*.eml"))) == 1


@pytest.mark.parametrize("invalid", ["expired", "used", "inactive", "changed_email"])
def test_invalid_reset_never_delivered(database, mail_runtime, tmp_path, invalid):
    identifier = queued(database, mail_runtime)
    token = database.scalar(select(ResetToken))
    if invalid == "expired":
        token.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    elif invalid == "used":
        token.used = True
    elif invalid == "inactive":
        database.get(Account, 1).is_active = False
    else:
        database.get(Account, 1).email = "changed@example.invalid"
    database.commit()
    process_once(database.get_bind(), "invalid-mail")
    refresh(database)
    assert not list(tmp_path.glob("*.eml"))
    assert database.get(BackgroundJob, identifier).state == "failed"
    assert database.scalar(select(MailOutbox)).encrypted_payload is None


def test_tamper_rejected(database, mail_runtime, tmp_path):
    identifier = queued(database, mail_runtime)
    database.scalar(select(MailOutbox)).encrypted_payload = "tampered"
    database.commit()
    process_once(database.get_bind(), "tampered-mail")
    refresh(database)
    assert database.get(BackgroundJob, identifier).error_code == "mail_payload_invalid"
    assert database.get(BackgroundJob, identifier).state == "failed"
    assert database.scalar(select(MailOutbox)).encrypted_payload is None
    assert not list(tmp_path.glob("*.eml"))


def test_key_rotation_preserves_pending_and_never_overwrites(database, mail_runtime):
    identifier = queued(database, mail_runtime)
    original = load_keys(mail_runtime.mail_keys_file)
    assert init_keys(mail_runtime.mail_keys_file) == original["active"]
    new_id = rotate_keys(mail_runtime.mail_keys_file)
    rotated = load_keys(mail_runtime.mail_keys_file)
    assert new_id != original["active"]
    assert rotated["keys"][original["active"]] == original["keys"][original["active"]]
    with pytest.raises(MailError, match="mail_key_conflict"):
        rotate_keys(mail_runtime.mail_keys_file, original["active"])
    assert load_keys(mail_runtime.mail_keys_file) == rotated
    process_once(database.get_bind(), "rotated-mail")
    refresh(database)
    assert database.get(BackgroundJob, identifier).state == "succeeded"


def test_missing_old_key_retries_then_erases(database, mail_runtime, tmp_path):
    identifier = queued(database, mail_runtime)
    rotate_keys(mail_runtime.mail_keys_file)
    keys = load_keys(mail_runtime.mail_keys_file)
    keys["keys"] = {keys["active"]: keys["keys"][keys["active"]]}
    mail_runtime.mail_keys_file.write_text(json.dumps(keys), encoding="utf-8")
    for attempt in range(mail_runtime.job_max_attempts):
        process_once(database.get_bind(), f"missing-key-{attempt}")
        refresh(database)
        job = database.get(BackgroundJob, identifier)
        assert job.error_code == "mail_key_missing"
        if attempt + 1 < mail_runtime.job_max_attempts:
            assert job.state == "retry_wait"
            assert database.scalar(select(MailOutbox)).encrypted_payload is not None
            job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(
                seconds=1
            )
            database.commit()
    assert job.state == "failed"
    assert database.scalar(select(MailOutbox)).encrypted_payload is None
    assert not list(tmp_path.glob("*.eml"))


def test_retry_and_redaction(database, mail_runtime, monkeypatch):
    identifier = queued(database, mail_runtime)
    events = []
    monkeypatch.setattr(
        "app.jobs.io_worker.emit", lambda *args, **kwargs: events.append((args, kwargs))
    )

    def fail(*args, **kwargs):
        raise RuntimeError(f"SMTP password address admin@example.invalid token {RAW}")

    monkeypatch.setattr("app.jobs.io_worker.send_reset", fail)
    process_once(database.get_bind(), "failed-delivery")
    refresh(database)
    job = database.get(BackgroundJob, identifier)
    assert job.state == "retry_wait"
    assert job.error_code == "mail_delivery_failed"
    assert events == [
        (
            ("mail.delivery_failed",),
            {"level": "ERROR", "error_code": "mail_delivery_failed"},
        )
    ]
    assert RAW not in repr(events) and "admin@example.invalid" not in repr(events)
    job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database.commit()
    monkeypatch.setattr("app.jobs.io_worker.send_reset", send_reset)
    process_once(database.get_bind(), "retry-new-instance")
    refresh(database)
    assert database.get(BackgroundJob, identifier).state == "succeeded"
    assert database.get(BackgroundJob, identifier).attempt_count == 2
    assert database.scalar(select(MailOutbox)).encrypted_payload is None


def test_restart_with_disk_database(mail_runtime, tmp_path):
    url = "sqlite:///" + (tmp_path / "durable-mail.sqlite").as_posix()
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(DataRevision(id=1, revision=0))
        db.add(
            Account(
                id=1,
                email="admin@example.invalid",
                password_hash=HASH,
                display_name="Test",
                role="admin",
                is_active=True,
            )
        )
        db.commit()
        identifier = queued(db, mail_runtime)
    engine.dispose()
    restarted = create_engine(url)
    try:
        process_once(restarted, "restarted-process")
        with Session(restarted) as db:
            assert db.get(BackgroundJob, identifier).state == "succeeded"
            assert db.scalar(select(MailOutbox)).encrypted_payload is None
    finally:
        restarted.dispose()


def test_file_replay_uses_one_stable_name(mail_runtime, tmp_path):
    for _ in range(2):
        send_reset(
            "admin@example.invalid",
            RAW,
            job_id=42,
            message_id="<reset-42@chronocampus.invalid>",
            settings=mail_runtime,
        )
    assert [path.name for path in tmp_path.glob("*.eml")] == ["reset-42.eml"]
    assert not list(tmp_path.glob("*.tmp"))


def test_maintenance_is_bounded_and_preserves_active_references(database, mail_runtime):
    queued(database, mail_runtime)
    outbox = database.scalar(select(MailOutbox))
    database.scalar(select(ResetToken)).expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database.get(BackgroundJob, outbox.job_id).available_at = datetime.now(UTC).replace(
        tzinfo=None
    ) + timedelta(hours=1)
    for number in range(620):
        database.add(
            UserSession(
                user_id=1,
                session_token=f"expired-{number}",
                expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
            )
        )
    database.add(
        RateLimit(
            key="expired-rate",
            started_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(hours=1),
            attempts=1,
        )
    )
    database.commit()
    process_once(database.get_bind(), "maintenance-io")
    refresh(database)
    assert database.scalar(select(func.count()).select_from(UserSession)) == 120
    assert database.scalar(select(MailOutbox)) is not None
    assert database.scalar(select(ResetToken)) is not None
    assert database.scalar(select(func.count()).select_from(MaintenanceSchedule)) == 1
    process_once(database.get_bind(), "maintenance-io")
    refresh(database)
    assert database.scalar(select(func.count()).select_from(UserSession)) == 120


def test_crash_after_file_write_replays_without_duplicate(
    database, mail_runtime, tmp_path, monkeypatch
):
    from app.jobs import io_worker

    identifier = queued(database, mail_runtime)
    original_finish = io_worker._finish

    class WorkerCrash(BaseException):
        pass

    def crash(*args, **kwargs):
        raise WorkerCrash()

    monkeypatch.setattr(io_worker, "_finish", crash)
    with pytest.raises(WorkerCrash):
        process_once(database.get_bind(), "crashed-io")
    refresh(database)
    job = database.get(BackgroundJob, identifier)
    assert job.state == "running"
    assert database.scalar(select(MailOutbox)).encrypted_payload is not None
    assert len(list(tmp_path.glob("*.eml"))) == 1
    monkeypatch.setattr(io_worker, "_finish", original_finish)
    job.lease_until = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database.commit()
    process_once(database.get_bind(), "recover-io")
    refresh(database)
    job = database.get(BackgroundJob, identifier)
    job.available_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
    database.commit()
    process_once(database.get_bind(), "replay-io")
    refresh(database)
    assert database.get(BackgroundJob, identifier).state == "succeeded"
    assert database.scalar(select(MailOutbox)).encrypted_payload is None
    assert len(list(tmp_path.glob("*.eml"))) == 1


def test_lost_owner_cannot_finalize_or_erase_payload(
    database, mail_runtime, monkeypatch
):
    identifier = queued(database, mail_runtime)

    def steal(*args, **kwargs):
        with Session(database.get_bind()) as db:
            job = db.get(BackgroundJob, identifier)
            job.owner_id = "new-owner"
            job.lease_generation += 1
            db.commit()

    monkeypatch.setattr("app.jobs.io_worker.send_reset", steal)
    process_once(database.get_bind(), "stale-owner")
    refresh(database)
    assert database.get(BackgroundJob, identifier).state == "running"
    assert database.get(BackgroundJob, identifier).owner_id == "new-owner"
    assert database.scalar(select(MailOutbox)).encrypted_payload is not None


def test_independent_heartbeat_during_blocked_delivery(
    mail_runtime, tmp_path, monkeypatch
):
    import threading

    from app.jobs import io_worker

    engine = create_engine(
        "sqlite:///" + (tmp_path / "heartbeat.sqlite").as_posix(),
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(DataRevision(id=1, revision=0))
        db.add(
            Account(
                id=1,
                email="admin@example.invalid",
                password_hash=HASH,
                display_name="Test",
                role="admin",
                is_active=True,
            )
        )
        db.commit()
        identifier = queued(db, mail_runtime)
    mail_runtime.job_heartbeat_seconds = 1
    renewed = threading.Event()
    original_renew = io_worker.renew_lease

    def renew(bound_engine, claim):
        result = original_renew(bound_engine, claim)
        if threading.current_thread().name == "mail-lease":
            renewed.set()
        return result

    def blocked(*args, **kwargs):
        assert renewed.wait(4), "lease was not renewed while delivery blocked"

    monkeypatch.setattr(io_worker, "renew_lease", renew)
    monkeypatch.setattr(io_worker, "send_reset", blocked)
    try:
        process_once(engine, "heartbeat-io")
        with Session(engine) as db:
            assert db.get(BackgroundJob, identifier).state == "succeeded"
    finally:
        engine.dispose()


def test_exhausted_crash_recovery_erases_ciphertext_immediately(database, mail_runtime):
    from app.jobs.queue import claim_job

    # Use the current maintenance bucket before the crash, so reconciliation
    # cannot rely on another scheduled cleanup job being available.
    process_once(database.get_bind(), "idle-io")
    identifier = queued(database, mail_runtime)
    job = database.get(BackgroundJob, identifier)
    job.max_attempts = 1
    database.commit()
    claim = claim_job(database.get_bind(), "mail", "dead-owner")
    assert claim.job_id == identifier
    refresh(database)
    database.get(BackgroundJob, identifier).lease_until = datetime.now(UTC).replace(
        tzinfo=None
    ) - timedelta(seconds=1)
    database.commit()
    process_once(database.get_bind(), "recovered-io")
    refresh(database)
    assert database.get(BackgroundJob, identifier).state == "failed"
    assert database.scalar(select(MailOutbox)).encrypted_payload is None
    assert (
        database.scalar(
            select(JobAttempt).where(JobAttempt.job_id == identifier)
        ).error_code
        == "lease_expired"
    )


def test_missing_key_validation_does_not_query_accounts(client, database, mail_runtime):
    mail_runtime.mail_keys_file.unlink()

    def no_account_lookup(connection, cursor, statement, *args):
        if statement.lstrip().upper().startswith("SELECT") and '"User"' in statement:
            raise AssertionError("account lookup preceded key validation")

    engine = database.get_bind()
    event.listen(engine, "before_cursor_execute", no_account_lookup)
    try:
        for email in ("admin@example.invalid", "unknown@example.invalid"):
            response = client.post("/api/auth/forgot-password", json={"email": email})
            assert response.status_code == 503
            assert response.json() == {"detail": "mail_not_configured"}
    finally:
        event.remove(engine, "before_cursor_execute", no_account_lookup)


def test_malformed_existing_key_is_never_replaced(mail_runtime):
    mail_runtime.mail_keys_file.write_text("invalid key file", encoding="utf-8")
    with pytest.raises(MailError, match="mail_not_configured"):
        init_keys(mail_runtime.mail_keys_file)
    assert mail_runtime.mail_keys_file.read_text(encoding="utf-8") == "invalid key file"


def test_smtp_timeout_and_message_identity(mail_runtime, monkeypatch):
    mail_runtime.mail_mode = "smtp"
    mail_runtime.smtp_host = "smtp.example.invalid"
    observed = []

    class SMTP:
        def __init__(self, host, port, *, timeout):
            assert timeout < mail_runtime.job_lease_seconds
            observed.append((host, port, timeout))
            self.sock = self

        def settimeout(self, timeout):
            assert 0 < timeout < mail_runtime.job_lease_seconds

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self, *, context):
            assert context.check_hostname

        def send_message(self, message):
            observed.append(message["Message-ID"])

    monkeypatch.setattr("app.accounts.mail.smtplib.SMTP", SMTP)
    for _ in range(2):
        send_reset(
            "admin@example.invalid",
            RAW,
            job_id=9,
            message_id="<reset-9@chronocampus.invalid>",
            settings=mail_runtime,
        )
    assert observed[1] == observed[3] == "<reset-9@chronocampus.invalid>"


def test_main_honors_local_shutdown(mail_runtime, monkeypatch):
    import threading

    from app.jobs import io_worker

    stopped = threading.Event()
    stopped.set()
    observed = []

    class Engine:
        def dispose(self):
            observed.append("disposed")

    monkeypatch.setattr(io_worker, "get_engine", Engine)
    monkeypatch.setattr(io_worker, "shutdown_event", lambda: stopped)
    monkeypatch.setattr(
        io_worker,
        "worker_heartbeat",
        lambda *args, **kwargs: observed.append(kwargs["status"]),
    )
    monkeypatch.setattr(
        "app.observability.telemetry.configure",
        lambda settings: observed.append(settings.worker_role),
    )
    io_worker.main()
    assert observed == ["io", "stopped", "disposed"]


def test_mail_expires_during_smtp_setup(mail_runtime, monkeypatch):
    from app.accounts import mail
    clock = [100.0]
    monkeypatch.setattr(mail.time, "monotonic", lambda: clock[0])
    mail_runtime.mail_mode, mail_runtime.smtp_host = "smtp", "smtp.invalid"
    submitted = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            self.sock = self
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def starttls(self, **kwargs):
            clock[0] = 102.0
        def settimeout(self, timeout):
            pass
        def send_message(self, message):
            submitted.append(message)

    monkeypatch.setattr(mail.smtplib, "SMTP", SMTP)
    with pytest.raises(MailError, match="mail_expired"):
        send_reset("admin@example.invalid", RAW, job_id=1, message_id="<1@invalid>",
                   settings=mail_runtime, deadline=101.0)
    assert submitted == []


def test_mail_expires_before_atomic_file_publication(mail_runtime, monkeypatch, tmp_path):
    from app.accounts import mail
    clock = [100.0]
    monkeypatch.setattr(mail.time, "monotonic", lambda: clock[0])
    original = mail.os.fsync
    def delayed_sync(descriptor):
        original(descriptor)
        clock[0] = 102.0
    monkeypatch.setattr(mail.os, "fsync", delayed_sync)
    with pytest.raises(MailError, match="mail_expired"):
        send_reset("admin@example.invalid", RAW, job_id=1, message_id="<1@invalid>",
                   settings=mail_runtime, deadline=101.0)
    assert not list(tmp_path.glob("*.eml"))
    assert not list(tmp_path.glob("*.tmp"))


def test_mail_claim_preserves_token_expiry(database, mail_runtime):
    from app.jobs.queue import claim_job, database_now
    identifier = queued(database, mail_runtime)
    outbox = database.scalar(select(MailOutbox))
    outbox.expires_at = database_now(database) + timedelta(seconds=20)
    expiry = outbox.expires_at
    database.commit()
    claim = claim_job(database.bind, "mail", "expiry-owner", job_id=identifier)
    assert claim.deadline_at == expiry


def test_expired_queued_mail_never_waits_for_backoff(database, mail_runtime, tmp_path):
    from app.jobs.queue import database_now
    identifier = queued(database, mail_runtime)
    database.scalar(select(MailOutbox)).expires_at = database_now(database) - timedelta(seconds=1)
    database.get(BackgroundJob, identifier).available_at = database_now(database) + timedelta(hours=1)
    database.commit()
    process_once(database.bind, "expiry-sweep")
    refresh(database)
    job = database.get(BackgroundJob, identifier)
    assert job.state == "failed" and job.error_code == "mail_expired" and job.attempt_count == 0
    assert not list(tmp_path.glob("*.eml"))
