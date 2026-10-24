"""Encrypted transactional reset mail. Keys belong on disk, never in SQL or logs."""

import json
import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from pathlib import Path
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class MailError(Exception):
    """Only fixed error codes may cross the mail boundary."""


def load_keys(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        active, keys = data["active"], data["keys"]
        if not isinstance(active, str) or not active or not isinstance(keys, dict):
            raise ValueError
        for key_id, key in keys.items():
            if not isinstance(key_id, str) or not key_id or len(key_id) > 64:
                raise ValueError
            Fernet(key.encode("ascii"))
        if active not in keys:
            raise ValueError
        return data
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise MailError("mail_not_configured") from None


def _write_keys(path, data, *, replace=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            # Atomic no-replace publication preserves a competing initializer's key.
            os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def init_keys(path):
    """Idempotent initialization; never overwrite an existing key file."""
    if Path(path).exists():
        return load_keys(path)["active"]
    key_id = uuid4().hex
    try:
        _write_keys(
            path,
            {"active": key_id, "keys": {key_id: Fernet.generate_key().decode("ascii")}},
        )
    except FileExistsError:
        pass
    return load_keys(path)["active"]


def rotate_keys(path, key_id=None):
    """Add a fresh active key, retaining every old decryption key."""
    path = Path(path)
    lock = path.with_name(path.name + ".lock")
    descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        data = load_keys(path)
        key_id = key_id or uuid4().hex
        if (
            not isinstance(key_id, str)
            or not key_id
            or len(key_id) > 64
            or key_id in data["keys"]
        ):
            raise MailError("mail_key_conflict")
        data["keys"][key_id] = Fernet.generate_key().decode("ascii")
        data["active"] = key_id
        _write_keys(path, data, replace=True)
        return key_id
    finally:
        os.close(descriptor)
        lock.unlink(missing_ok=True)


def validate_configuration(settings):
    if (
        settings.mail_mode not in {"file", "smtp"}
        or not settings.university_email_domains
        or (settings.mail_mode == "smtp" and not settings.smtp_host)
    ):
        raise MailError("mail_not_configured")
    return load_keys(settings.mail_keys_file)


def enqueue_reset(db, account, raw_token, reset_token, settings):
    from app.jobs.models import MailOutbox
    from app.jobs.queue import enqueue_job

    keys = validate_configuration(settings)
    key_id = keys["active"]
    encrypted = (
        Fernet(keys["keys"][key_id].encode("ascii"))
        .encrypt(
            json.dumps({"email": account.email, "token": raw_token}).encode("utf-8")
        )
        .decode("ascii")
    )
    db.add(reset_token)
    db.flush()
    job = enqueue_job(db, "mail", {}, max_attempts=settings.job_max_attempts)
    job.deadline_at = reset_token.expires_at
    outbox = MailOutbox(
        job_id=job.id,
        reset_token_id=reset_token.id,
        encrypted_payload=encrypted,
        key_id=key_id,
        expires_at=reset_token.expires_at,
        delivery_state="pending",
        message_id=f"<reset-{job.id}@chronocampus.invalid>",
    )
    db.add(outbox)
    db.flush()
    return job


def decrypt_payload(outbox, settings):
    keys = load_keys(settings.mail_keys_file)
    try:
        payload = json.loads(
            Fernet(keys["keys"][outbox.key_id].encode("ascii")).decrypt(
                outbox.encrypted_payload.encode("ascii")
            )
        )
        if not isinstance(payload["email"], str) or not isinstance(
            payload["token"], str
        ):
            raise TypeError
        return payload
    except KeyError:
        raise MailError("mail_key_missing") from None
    except (InvalidToken, ValueError, TypeError, AttributeError):
        raise MailError("mail_payload_invalid") from None


def send_reset(email: str, token: str, *, job_id, message_id, settings=None,
               deadline=None, cancelled=lambda: False) -> None:
    settings = settings or get_settings()

    def remaining():
        budget = float("inf") if deadline is None else deadline - time.monotonic()
        if cancelled():
            raise MailError("mail_ownership_lost")
        if budget <= 0:
            raise MailError("mail_expired")
        return min(10.0, settings.job_lease_seconds / 3, budget)

    remaining()
    message = EmailMessage()
    message["Subject"] = "ChronoCampus — password reset"
    message["From"] = settings.smtp_from or "chronocampus@example.invalid"
    message["To"] = email
    message["Message-ID"] = message_id
    # SMTP acceptance followed by a worker crash may duplicate this one-use link.
    link = settings.public_url.rstrip("/") + "/#reset=" + token
    message.set_content(
        "Open this link to choose a new password. Opening it does not change your password.\n"
        "Откройте ссылку и задайте новый пароль. Сам переход пароль не меняет.\n"
        "Բացեք հղումը և ընտրեք նոր գաղտնաբառ։ Միայն բացելը գաղտնաբառը չի փոխում։\n\n"
        + link
        + f"\n\nExpires in: {settings.reset_minutes} min."
    )
    if settings.mail_mode == "file":
        directory = Path(settings.mail_directory)
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / f"reset-{int(job_id)}.eml"
        temporary = directory / f".reset-{int(job_id)}-{uuid4().hex}.tmp"
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(message.as_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            try:
                remaining()
                os.link(temporary, destination)
            except FileExistsError:
                pass
        finally:
            temporary.unlink(missing_ok=True)
    elif settings.mail_mode == "smtp":
        timeout = remaining()
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=timeout
        ) as client:
            client.starttls(context=ssl.create_default_context())
            client.sock.settimeout(remaining())
            if settings.smtp_username:
                client.login(
                    settings.smtp_username, settings.smtp_password.get_secret_value()
                )
            client.sock.settimeout(remaining())
            client.send_message(message)
    else:
        raise MailError("mail_not_configured")
