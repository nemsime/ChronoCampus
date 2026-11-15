from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
import re

from sqlalchemy import select

from app.accounts.mail import decrypt_payload
from app.accounts import router as auth
from app.core.security import token_hash
from app.db.models import Account, ResetToken
from app.jobs.io_worker import process_once
from app.jobs.models import MailOutbox
from conftest import PASSWORD


def register(client, email="manearakelyantt319@polytechnic.am", **extra):
    auth.get_settings().university_email_domains = ["polytechnic.am", "example.invalid"]
    return client.post(
        "/api/auth/register",
        json={"email": email, "display_name": "Mane Arakelyan", **extra},
    )


def raw_token(database):
    outbox = database.scalar(select(MailOutbox).order_by(MailOutbox.id.desc()))
    return decrypt_payload(outbox, auth.get_settings())["token"]


def test_registration_verification_and_forgot_password(client, database, tmp_path):
    email = "manearakelyantt319@polytechnic.am"
    response = register(client)
    assert response.status_code == 202
    account = database.scalar(select(Account).where(Account.email == email))
    assert account.role == "student" and not account.email_verified
    assert account.course_group_id is None
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.post("/api/auth/forgot-password", json={"email": email}).status_code
        == 202
    )
    assert len(list(database.scalars(select(MailOutbox)))) == 1
    process_once(database.get_bind(), "registration-test-io")
    message = BytesParser(policy=policy.default).parsebytes(
        next(tmp_path.glob("*.eml")).read_bytes()
    )
    assert message["To"] == email
    assert "verify" in message["Subject"]
    raw = re.search(r"#verify=([A-Za-z0-9_-]+)", message.get_content())[1]
    token = database.scalar(select(ResetToken))
    assert token.token == token_hash(raw) and token.purpose == "verify"
    assert not database.get(
        Account, account.id
    ).email_verified  # opening a link cannot mutate state
    body = {"token": raw, "password": PASSWORD}
    assert client.post("/api/auth/reset-password", json=body).status_code == 400
    assert client.post("/api/auth/verify-email", json=body).status_code == 204
    assert client.post("/api/auth/verify-email", json=body).status_code == 400
    login = client.post(
        "/api/auth/login", json={"email": email.upper(), "password": PASSWORD}
    )
    assert login.status_code == 200 and login.json()["user"]["role"] == "student"
    assert (
        client.post("/api/auth/forgot-password", json={"email": email}).status_code
        == 202
    )
    reset_messages = [
        BytesParser(policy=policy.default).parsebytes(path.read_bytes())
        for path in tmp_path.glob("*.eml")
        if "token=" in path.read_text()
    ]
    reset = re.search(
        r"token=([A-Za-z0-9_-]+)",
        reset_messages[-1].get_body(preferencelist=("plain",)).get_content(),
    )[1]
    assert (
        client.post(
            "/api/auth/verify-email", json={"token": reset, "password": PASSWORD}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/reset-password",
            json={"token": reset, "password": "Different-password-2026!"},
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": email, "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": email, "password": "Different-password-2026!"},
        ).status_code
        == 200
    )


def test_existing_account_is_not_overwritten(client, database):
    original = database.get(Account, 1).password_hash
    response = register(client, "admin@example.invalid", role="admin", is_active=True)
    assert response.status_code == 202
    assert response.json() == register(client).json()
    assert database.get(Account, 1).password_hash == original
    assert database.get(Account, 1).role == "admin"
    assert len(list(database.scalars(select(MailOutbox)))) == 1


def test_resend_does_not_grant_privileges_and_old_links_are_consumed(client, database):
    assert register(client, role="admin", course_group_id=1).status_code == 202
    first = raw_token(database)
    assert register(client).status_code == 202
    second = raw_token(database)
    assert first != second
    assert (
        client.post(
            "/api/auth/verify-email", json={"token": second, "password": PASSWORD}
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/auth/verify-email", json={"token": first, "password": PASSWORD}
        ).status_code
        == 400
    )
    account = database.scalar(select(Account).where(Account.email.like("mane%")))
    assert account.role == "student" and account.course_group_id is None


def test_expired_disabled_and_short_password_verification(client, database):
    register(client)
    raw = raw_token(database)
    body = {"token": raw, "password": PASSWORD}
    assert (
        client.post(
            "/api/auth/verify-email", json={**body, "password": "short"}
        ).status_code
        == 422
    )
    token = database.scalar(select(ResetToken))
    account = database.get(Account, token.user_id)
    account.is_active = False
    database.commit()
    assert client.post("/api/auth/verify-email", json=body).status_code == 400
    account.is_active = True
    token.expires_at = datetime.utcnow() - timedelta(seconds=1)
    database.commit()
    assert client.post("/api/auth/verify-email", json=body).status_code == 400
    assert not account.email_verified


def test_registration_domain_validation_origin_throttle_and_configuration(
    client, database
):
    assert register(client, "student@gmail.com").status_code == 400
    assert register(client, "student@polytechnic.am.evil.com").status_code == 400
    assert register(client, "@polytechnic.am").status_code == 422
    assert register(client, display_name="   ").status_code == 422
    response = client.post(
        "/api/auth/register",
        headers={"origin": "https://evil.invalid"},
        json={"email": "a@polytechnic.am", "display_name": "Test"},
    )
    assert response.status_code == 403
    auth.get_settings().mail_mode = "disabled"
    assert register(client).status_code == 503
    auth.get_settings().mail_mode = "file"
    for _ in range(4):
        assert register(client).status_code == 202
    assert register(client).status_code == 429
