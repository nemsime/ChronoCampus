from datetime import timedelta
from email import policy
from email.parser import BytesParser
from unittest.mock import Mock
import re

import pytest
from sqlalchemy import select

from app.accounts import recovery
from app.accounts.mail import sendEmail
from app.core.config import Settings
from app.core.security import token_hash, verify_password
from app.db.models import Account, ResetToken
from app.jobs.models import MailOutbox
from conftest import PASSWORD


def requested(client, tmp_path):
    response = client.post(
        "/api/auth/forgot-password", json={"email": " ADMIN@EXAMPLE.INVALID "}
    )
    assert response.status_code == 202
    messages = sorted(tmp_path.glob("*.eml"), key=lambda p: p.stat().st_mtime_ns)
    message = BytesParser(policy=policy.default).parsebytes(messages[-1].read_bytes())
    token = re.search(
        r"token=([a-f0-9]{64})",
        message.get_body(preferencelist=("plain",)).get_content(),
    )[1]
    return token, message


def test_reset_hash_only_and_password_and_sessions(client, database, tmp_path):
    login = client.post(
        "/api/auth/login", json={"email": "admin@example.invalid", "password": PASSWORD}
    )
    assert login.status_code == 200
    raw, message = requested(client, tmp_path)
    row = database.scalar(select(ResetToken))
    assert (
        row.token_hash == token_hash(raw)
        and row.token_hash != raw
        and len(row.token_hash) == 64
    )
    assert database.scalar(select(MailOutbox)) is None
    assert message.get_body(preferencelist=("html",)) is not None
    assert "30 minutes" in message.get_body(preferencelist=("plain",)).get_content()
    assert (row.expires_at - row.created_at).total_seconds() == 1800
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "newPassword": "short"}
        ).status_code
        == 422
    )
    body = {"token": raw, "newPassword": "A-new-password-2026!"}
    assert client.post("/api/auth/reset-password", json=body).status_code == 204
    assert client.post("/api/auth/reset-password", json=body).status_code == 400
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.invalid", "password": PASSWORD},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.invalid", "password": body["newPassword"]},
        ).status_code
        == 200
    )
    assert verify_password(body["newPassword"], database.get(Account, 1).password_hash)


@pytest.mark.parametrize("condition", ["expired", "used", "inactive", "verification"])
def test_generic_failures(client, database, tmp_path, condition):
    raw, _ = requested(client, tmp_path)
    row = database.scalar(select(ResetToken))
    if condition == "expired":
        row.expires_at = recovery.utc_now(database) - timedelta(seconds=1)
    elif condition == "used":
        row.used = True
    elif condition == "inactive":
        database.get(Account, 1).is_active = False
    else:
        row.purpose = "verify"
    database.commit()
    response = client.post(
        "/api/auth/reset-password", json={"token": raw, "newPassword": PASSWORD}
    )
    assert response.status_code == 400 and response.json() == {
        "detail": "invalid_reset_token"
    }


def test_rate_limit_and_invalidation(client, database, tmp_path):
    raw, _ = requested(client, tmp_path)
    response = None
    for _ in range(4):
        response = client.post(
            "/api/auth/forgot-password", json={"email": "admin@example.invalid"}
        )
    assert response.status_code == 202
    rows = list(database.scalars(select(ResetToken).order_by(ResetToken.id)))
    assert len(rows) == 3 and sum(not t.used for t in rows) == 1
    assert len(list(tmp_path.glob("*.eml"))) == 3
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": raw, "newPassword": PASSWORD}
        ).status_code
        == 400
    )
    unknown = client.post(
        "/api/auth/forgot-password", json={"email": "missing@example.invalid"}
    )
    assert unknown.status_code == 202 and unknown.json() == response.json()


def test_mail_failure_never_changes_response_or_leaks_secrets(
    client, database, monkeypatch, caplog
):
    secret = "do-not-log-token-or-smtp-password"
    monkeypatch.setattr(recovery, "sendEmail", Mock(side_effect=RuntimeError(secret)))
    known = client.post(
        "/api/auth/forgot-password", json={"email": "admin@example.invalid"}
    )
    unknown = client.post(
        "/api/auth/forgot-password", json={"email": "missing@example.invalid"}
    )
    assert (
        known.status_code == unknown.status_code == 202
        and known.json() == unknown.json()
    )
    assert secret not in caplog.text and secret not in known.text
    assert "mail.reset_delivery_failed" in caplog.text
    assert database.scalar(select(MailOutbox)) is None


@pytest.mark.parametrize(
    "port,implicit,tls", [(465, True, False), (587, False, True), (1025, False, False)]
)
def test_smtp_transports_and_empty_credentials(monkeypatch, port, implicit, tls):
    settings = Settings(
        _env_file=None,
        mail_mode="smtp",
        smtp_host="mailpit",
        smtp_port=port,
        smtp_from="ChronoCampus <no-reply@chronocampus.local>",
    )
    server = Mock()
    server.__enter__ = Mock(return_value=server)
    server.__exit__ = Mock(return_value=False)
    plain, secure = Mock(return_value=server), Mock(return_value=server)
    monkeypatch.setattr("app.accounts.mail.smtplib.SMTP", plain)
    monkeypatch.setattr("app.accounts.mail.smtplib.SMTP_SSL", secure)
    sendEmail(
        {
            "to": "recipient@example.invalid",
            "subject": "Reset",
            "html": "<p>Reset password</p>",
        },
        text_body="Reset password",
        settings=settings,
    )
    assert secure.called == implicit and plain.called != implicit
    assert server.starttls.called == tls
    assert not server.login.called
    assert server.send_message.call_args.args[0].is_multipart()


def test_ip_limit_preserves_generic_response(client):
    responses = [
        client.post(
            "/api/auth/forgot-password", json={"email": "missing@example.invalid"}
        )
        for _ in range(32)
    ]
    assert all(
        response.status_code == 202 and response.json() == responses[0].json()
        for response in responses
    )


def test_maintenance_retains_rate_limit_history(client, database, tmp_path):
    from app.jobs.io_worker import process_once

    now = recovery.utc_now(database)
    for _ in range(3):
        database.add(
            ResetToken(
                user_id=1,
                token_hash=token_hash(__import__("secrets").token_hex(32)),
                purpose="reset",
                created_at=now - timedelta(minutes=31),
                expires_at=now - timedelta(minutes=1),
            )
        )
    database.commit()
    process_once(database.get_bind(), "reset-limit-test")
    database.expire_all()
    assert len(list(database.scalars(select(ResetToken)))) == 3
    response = client.post(
        "/api/auth/forgot-password", json={"email": "admin@example.invalid"}
    )
    assert response.status_code == 202 and not list(tmp_path.glob("*.eml"))
