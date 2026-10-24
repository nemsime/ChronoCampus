from datetime import datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
)
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, true, update
from sqlalchemy.orm import Session

from app.accounts.dependencies import (
    COOKIE,
    authenticated,
    check_origin,
    public_account,
)
from app.accounts.mail import MailError, enqueue_reset, validate_configuration
from app.core.config import get_settings
from app.core.security import (
    csrf_token,
    new_token,
    password_hash,
    token_hash,
    verify_password,
)
from app.db.models import Account, RateLimit, ResetToken, UserSession
from app.db.session import get_db, lock_revision
from app.observability.audit import record_audit

router = APIRouter(prefix="/auth", tags=["accounts"])
# Equal-cost verification even when an address is unknown.
DUMMY_HASH = password_hash("unusable-placeholder")


class EmailInput(BaseModel):
    email: str = Field(min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        value = value.strip().lower()
        if value.count("@") != 1 or any(c.isspace() for c in value):
            raise ValueError("invalid_email")
        return value


class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=256)


class PasswordInput(BaseModel):
    password: str = Field(min_length=12, max_length=256)


class ChangePasswordInput(PasswordInput):
    current_password: str = Field(min_length=1, max_length=256)


class ResetInput(PasswordInput):
    token: str = Field(min_length=20, max_length=128)


def throttle(db: Session, key: str, limit=8):
    lock_revision(db, changed=False)
    key = token_hash(key)
    now = datetime.utcnow()
    entry = db.get(RateLimit, key)
    if entry and entry.started_at > now - timedelta(minutes=15):
        entry.attempts += 1
    else:
        if entry:
            entry.started_at, entry.attempts = now, 1
        else:
            entry = RateLimit(key=key, started_at=now, attempts=1)
            db.add(entry)
    db.commit()
    if entry.attempts > limit:
        raise HTTPException(429, "too_many_attempts")


def revoke_sessions(db: Session, account_id: int):
    db.execute(
        update(UserSession)
        .where(UserSession.user_id == account_id)
        .values(is_revoked=True)
    )
    db.execute(
        update(ResetToken).where(ResetToken.user_id == account_id).values(used=True)
    )


@router.post("/login")
def login(
    body: LoginInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    check_origin(request)
    throttle(db, "login-email:" + body.email)
    throttle(
        db,
        "login-ip:" + (request.client.host if request.client else "unknown"),
        limit=100,
    )
    lock_revision(db, changed=False)
    account = db.scalar(select(Account).where(Account.email == body.email))
    valid = verify_password(
        body.password, account.password_hash if account else DUMMY_HASH
    )
    if (
        not valid
        or not account
        or not account.is_active
        or account.role not in {"admin", "lecturer", "student"}
    ):
        raise HTTPException(401, "invalid_credentials")
    raw = new_token()
    settings = get_settings()
    old_token = request.cookies.get(COOKIE)
    if old_token:
        db.execute(
            update(UserSession)
            .where(UserSession.session_token == token_hash(old_token))
            .values(is_revoked=True)
        )
    db.add(
        UserSession(
            user_id=account.id,
            session_token=token_hash(raw),
            expires_at=datetime.utcnow() + timedelta(hours=settings.session_hours),
        )
    )
    account.last_login = datetime.utcnow()
    record_audit(db, account, "account.login", "users", account.id)
    db.commit()
    response.set_cookie(
        COOKIE,
        raw,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/api",
    )
    return {"user": public_account(account), "csrf_token": csrf_token(raw)}


@router.get("/me")
def me(request: Request, account: Account = Depends(authenticated)):
    return {
        "user": public_account(account),
        "csrf_token": csrf_token(request.cookies[COOKIE]),
    }


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    account: Account = Depends(authenticated),
    db: Session = Depends(get_db),
):
    db.execute(
        update(UserSession)
        .where(UserSession.session_token == token_hash(request.cookies[COOKIE]))
        .values(is_revoked=True)
    )
    record_audit(db, account, "account.logout", "users", account.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/api")


@router.post("/change-password", status_code=204)
def change_password(
    body: ChangePasswordInput,
    response: Response,
    account: Account = Depends(authenticated),
    db: Session = Depends(get_db),
):
    throttle(db, f"password:{account.id}")
    lock_revision(db, changed=False)
    db.refresh(account)
    if not verify_password(body.current_password, account.password_hash):
        raise HTTPException(400, "invalid_credentials")
    account.password_hash = password_hash(body.password)
    account.must_change_password = False
    revoke_sessions(db, account.id)
    record_audit(db, account, "account.password_changed", "users", account.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/api")


@router.post("/forgot-password", status_code=202)
def forgot_password(
    body: EmailInput,
    request: Request,
    db: Session = Depends(get_db),
):
    check_origin(request)
    throttle(db, "reset-email:" + body.email, limit=5)
    throttle(
        db,
        "reset-ip:" + (request.client.host if request.client else "unknown"),
        limit=30,
    )
    settings = get_settings()
    # Configuration errors are independent of account existence.
    try:
        validate_configuration(settings)
    except MailError:
        raise HTTPException(503, "mail_not_configured") from None
    lock_revision(db, changed=False)
    account = db.scalar(
        select(Account).where(Account.email == body.email, Account.is_active == true())
    )
    if account and body.email.split("@")[-1] in settings.university_email_domains:
        raw = new_token()
        reset_token = ResetToken(
            user_id=account.id,
            token=token_hash(raw),
            expires_at=datetime.utcnow() + timedelta(minutes=settings.reset_minutes),
        )
        enqueue_reset(db, account, raw, reset_token, settings)
        db.commit()
    return {"message": "reset_requested"}


@router.post("/reset-password", status_code=204)
def reset_password(
    body: ResetInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    check_origin(request)
    throttle(
        db,
        "reset-submit:" + (request.client.host if request.client else "unknown"),
        limit=30,
    )
    lock_revision(db, changed=False)
    token = db.scalar(
        select(ResetToken).where(ResetToken.token == token_hash(body.token))
    )
    if not token or token.used or token.expires_at <= datetime.utcnow():
        raise HTTPException(400, "invalid_reset_token")
    account = db.get(Account, token.user_id)
    if not account or not account.is_active:
        raise HTTPException(400, "invalid_reset_token")
    account.password_hash = password_hash(body.password)
    account.must_change_password = False
    revoke_sessions(db, account.id)
    record_audit(db, account, "account.password_reset", "users", account.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/api")
