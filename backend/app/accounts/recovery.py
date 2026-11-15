"""Hash-only password recovery with database time and atomic token consumption."""

import secrets
from datetime import datetime, timedelta
from html import escape
from urllib.parse import urlencode

from sqlalchemy import false, func, select, text, true, update
from sqlalchemy.orm import Session

from app.accounts.mail import sendEmail
from app.core.security import password_hash, token_hash
from app.db.models import Account, ResetToken, UserSession
from app.db.session import lock_revision
from app.db.utc import as_utc
from app.observability.telemetry import emit

GENERIC_NOTICE = "If that email is registered, we sent a reset link"


def utc_now(db):
    # SQL Server and SQLite both read their own clocks; no host clock for reset logic.
    if db.get_bind().dialect.name == "mssql":
        return as_utc(db.scalar(select(func.sysutcdatetime())))
    value = db.scalar(select(func.current_timestamp()))
    return as_utc(datetime.fromisoformat(value) if isinstance(value, str) else value)


def request_reset(db: Session, email: str, settings, *, background=None):
    lock_revision(db, changed=False)
    now = utc_now(db)
    account = db.scalar(
        select(Account).where(
            Account.email == email,
            Account.is_active == true(),
            Account.email_verified == true(),
        )
    )
    # Generate a cryptographically independent value even for unknown addresses.
    raw = secrets.token_hex(32)
    if not account:
        db.rollback()
        return
    recent = db.scalar(
        select(func.count())
        .select_from(ResetToken)
        .where(
            ResetToken.user_id == account.id,
            ResetToken.purpose == "reset",
            ResetToken.created_at > now - timedelta(hours=1),
        )
    )
    if recent >= 3:
        db.rollback()
        return
    db.execute(
        update(ResetToken)
        .where(
            ResetToken.user_id == account.id,
            ResetToken.purpose == "reset",
            ResetToken.used == false(),
        )
        .values(used=True)
    )
    # Only hashes are persisted; raw reset tokens never enter the durable outbox.
    expiry = (
        text("DATEADD(MINUTE, 30, SYSUTCDATETIME())")
        if db.get_bind().dialect.name == "mssql"
        else now + timedelta(minutes=30)
    )
    db.add(
        ResetToken(
            user_id=account.id,
            token_hash=token_hash(raw),
            purpose="reset",
            created_at=now,
            expires_at=expiry,
        )
    )
    recipient = account.email
    db.commit()
    link = (
        settings.public_url.rstrip("/") + "/reset-password?" + urlencode({"token": raw})
    )
    body = (
        "Choose a new ChronoCampus password using this link. It expires in 30 minutes. "
        "If you did not request a reset, ignore this email.\n\n" + link
    )
    html = (
        "<p>Choose a new ChronoCampus password. This link expires in 30 minutes.</p>"
        f'<p><a href="{escape(link, quote=True)}">Reset your password</a></p>'
        "<p>If you did not request a reset, ignore this email.</p>"
    )
    if background is not None:
        background.add_task(_send_reset_notice, recipient, html, body, settings)
    else:
        _send_reset_notice(recipient, html, body, settings)


def _send_reset_notice(recipient, html, body, settings):
    try:
        sendEmail(
            {
                "to": recipient,
                "subject": "ChronoCampus — reset your password",
                "html": html,
            },
            text_body=body,
            settings=settings,
        )
    except Exception:
        # Provider/driver exceptions can contain credentials or message bodies.
        emit(
            "mail.reset_delivery_failed",
            level="ERROR",
            error_code="mail_delivery_failed",
        )


def consume_reset(db: Session, raw: str, password: str):
    digest, encoded_password = token_hash(raw), password_hash(password)
    if db.get_bind().dialect.name == "mssql":
        success = db.execute(
            text(
                "EXEC dbo.usp_ResetPassword @token_hash=:token_hash, @new_password_hash=:password_hash"
            ),
            {"token_hash": digest, "password_hash": encoded_password},
        ).scalar()
        if success:
            db.commit()
        else:
            db.rollback()
        return bool(success)
    # SQLite test/development adapter; SQL Server always uses the stored procedure.
    lock_revision(db, changed=False)
    now = utc_now(db)
    uid = db.scalar(
        update(ResetToken)
        .where(
            ResetToken.token_hash == digest,
            ResetToken.purpose == "reset",
            ResetToken.used == false(),
            ResetToken.expires_at > now,
        )
        .values(used=True)
        .returning(ResetToken.user_id)
    )
    if uid is None:
        db.rollback()
        return False
    changed = db.execute(
        update(Account)
        .where(
            Account.id == uid,
            Account.is_active == true(),
            Account.email_verified == true(),
        )
        .values(password_hash=encoded_password, must_change_password=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        return False
    db.execute(update(ResetToken).where(ResetToken.user_id == uid).values(used=True))
    db.execute(
        update(UserSession).where(UserSession.user_id == uid).values(is_revoked=True)
    )
    db.commit()
    return True
