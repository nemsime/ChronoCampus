import re
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.security import token_hash, verify_password
from app.db.models import Account, ResetToken, UserSession
from conftest import PASSWORD


def test_server_role_and_cookie_and_csrf(admin_client, database):
    assert admin_client.get("/api/auth/me").json()["user"]["role"] == "admin"
    raw = admin_client.cookies.get("chronocampus_session")
    assert database.scalar(select(UserSession)).session_token == token_hash(raw)
    del admin_client.headers["x-csrf-token"]
    assert (
        admin_client.post(
            "/api/admin/catalog/faculties", json={"name": "Faculty", "code": "F"}
        ).status_code
        == 403
    )
    assert (
        admin_client.get("/api/admin/catalog/users").json()[0].get("password_hash")
        is None
    )


def test_invalid_login_is_uniform(client):
    a = client.post(
        "/api/auth/login",
        json={"email": "admin@example.invalid", "password": "incorrect"},
    )
    b = client.post(
        "/api/auth/login",
        json={"email": "unknown@example.invalid", "password": "incorrect"},
    )
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json() == {"detail": "invalid_credentials"}


def test_temporary_password_is_restricted_until_changed(admin_client, database):
    response = admin_client.post(
        "/api/admin/catalog/users",
        json={
            "email": "teacher@example.invalid",
            "display_name": "Fictional teacher",
            "role": "lecturer",
            "password": PASSWORD,
        },
    )
    assert response.status_code == 201, response.text
    response = admin_client.post(
        "/api/auth/login",
        json={"email": "teacher@example.invalid", "password": PASSWORD},
    )
    admin_client.headers["x-csrf-token"] = response.json()["csrf_token"]
    assert (
        admin_client.get("/api/admin/catalog/users").json()["detail"]
        == "password_change_required"
    )
    changed = admin_client.post(
        "/api/auth/change-password",
        json={"current_password": PASSWORD, "password": "Different-password-2026!"},
    )
    assert changed.status_code == 204, changed.text
    assert admin_client.get("/api/auth/me").status_code == 401
    response = admin_client.post(
        "/api/auth/login",
        json={
            "email": "teacher@example.invalid",
            "password": "Different-password-2026!",
        },
    )
    assert response.json()["user"]["must_change_password"] is False
    assert admin_client.get("/api/admin/catalog/users").status_code == 403


def test_reset_only_post_changes_password_and_token_is_single_use(
    admin_client, database, tmp_path
):
    original = database.get(Account, 1).password_hash
    unknown = admin_client.post(
        "/api/auth/forgot-password", json={"email": "unknown@example.invalid"}
    )
    known = admin_client.post(
        "/api/auth/forgot-password", json={"email": "admin@example.invalid"}
    )
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    from email import policy
    from email.parser import BytesParser

    message = BytesParser(policy=policy.default).parsebytes(
        next(tmp_path.glob("*.eml")).read_bytes()
    )
    raw = re.search(r"#reset=([A-Za-z0-9_-]+)", message.get_content())[1]
    token = database.scalar(select(ResetToken))
    assert token.token == token_hash(raw) and not token.used
    assert database.get(Account, 1).password_hash == original
    assert (
        admin_client.get("/api/auth/reset-password", params={"token": raw}).status_code
        == 405
    )
    assert not token.used
    body = {"token": raw, "password": "Reset-password-2026!"}
    assert admin_client.post("/api/auth/reset-password", json=body).status_code == 204
    assert admin_client.post("/api/auth/reset-password", json=body).status_code == 400
    assert verify_password(body["password"], database.get(Account, 1).password_hash)
    assert all(session.is_revoked for session in database.scalars(select(UserSession)))


def test_expired_reset_token_and_foreign_origin(client, database):
    database.add(
        ResetToken(
            user_id=1,
            token=token_hash("x" * 32),
            expires_at=datetime.utcnow() - timedelta(seconds=1),
        )
    )
    database.commit()
    assert (
        client.post(
            "/api/auth/reset-password", json={"token": "x" * 32, "password": PASSWORD}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/login",
            headers={"Origin": "https://attacker.invalid"},
            json={"email": "admin@example.invalid", "password": PASSWORD},
        ).status_code
        == 403
    )
