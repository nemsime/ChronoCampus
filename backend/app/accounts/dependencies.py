import hmac
from datetime import datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import false, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import csrf_token, token_hash
from app.db.models import Account, UserSession
from app.db.session import get_db

COOKIE = "chronocampus_session"


def check_origin(request: Request):
    origin = request.headers.get("origin")
    allowed = {*get_settings().cors_origins, get_settings().public_url.rstrip("/")}
    if origin and origin not in allowed:
        raise HTTPException(403, "origin_forbidden")


def authenticated(request: Request, db: Session = Depends(get_db)) -> Account:
    raw = request.cookies.get(COOKIE, "")
    if not raw:
        raise HTTPException(401, "authentication_required")
    session = db.scalar(
        select(UserSession).where(
            UserSession.session_token == token_hash(raw),
            UserSession.is_revoked == false(),
            UserSession.expires_at > datetime.utcnow(),
        )
    )
    account = db.get(Account, session.user_id) if session else None
    if (
        not account
        or not account.is_active
        or account.role not in {"admin", "lecturer", "student"}
    ):
        raise HTTPException(401, "authentication_required")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        check_origin(request)
        if not hmac.compare_digest(
            request.headers.get("x-csrf-token", "").encode(), csrf_token(raw).encode()
        ):
            raise HTTPException(403, "csrf_failed")
    return account


def current_user(account: Account = Depends(authenticated)) -> Account:
    if account.must_change_password:
        raise HTTPException(403, "password_change_required")
    return account


def administrator(account: Account = Depends(current_user)) -> Account:
    if account.role != "admin":
        raise HTTPException(403, "administrator_required")
    return account


def public_account(account: Account) -> dict:
    return {
        key: getattr(account, key)
        for key in (
            "id",
            "email",
            "display_name",
            "role",
            "is_active",
            "must_change_password",
            "course_group_id",
            "small_group_id",
            "lab_group_id",
        )
    }
