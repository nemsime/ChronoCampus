import re
from datetime import timedelta

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
)
from pydantic import AliasChoices, BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.accounts.dependencies import (
    COOKIE,
    authenticated,
    check_origin,
    public_account,
)
from app.accounts.mail import MailError, enqueue_reset, validate_configuration
from app.accounts.recovery import GENERIC_NOTICE, consume_reset, request_reset
from app.accounts.roles import ROLES, STUDENT
from app.accounts.roster import confirm_enrollment, stage_enrollment
from app.core.config import get_settings
from app.core.security import (
    csrf_token,
    new_token,
    password_hash,
    token_hash,
    verify_password,
)
from app.db.models import Account, CourseGroup, RateLimit, ResetToken, UserSession
from app.db.session import get_db, lock_revision
from app.db.utc import utc_now
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
        if not re.fullmatch(
            r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+",
            value,
        ):
            raise ValueError("invalid_email")
        local = value.split("@", 1)[0]
        if (
            local.startswith(".")
            or local.endswith(".")
            or ".." in local
            or len(local) > 64
        ):
            raise ValueError("invalid_email")
        return value


class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=256)


class RegistrationInput(EmailInput):
    course_group_id: int | None = Field(default=None, gt=0)
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    surname: str | None = Field(default=None, max_length=100)
    given_name: str | None = Field(default=None, max_length=100)
    patronymic: str | None = Field(default=None, max_length=100)

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value):
        if value is None:
            return None
        if not value.strip():
            raise ValueError("invalid_name")
        return value.strip()

    @field_validator("surname", "given_name", "patronymic")
    @classmethod
    def normalize_roster_name(cls, value):
        return " ".join((value or "").split()) or None


class PasswordInput(BaseModel):
    password: str = Field(min_length=12, max_length=256)


class ChangePasswordInput(PasswordInput):
    current_password: str = Field(min_length=1, max_length=256)


class ResetInput(PasswordInput):
    password: str = Field(
        min_length=12,
        max_length=256,
        validation_alias=AliasChoices("newPassword", "password"),
    )
    token: str = Field(max_length=128)


def throttle(db: Session, key: str, limit=8):
    lock_revision(db, changed=False)
    key = token_hash(key)
    now = utc_now()
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
        or not account.email_verified
        or account.role not in ROLES
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
            expires_at=utc_now() + timedelta(hours=settings.session_hours),
        )
    )
    account.last_login = utc_now()
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
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    check_origin(request)
    # Rate limiting never changes the public response or discloses account state.
    try:
        throttle(
            db,
            "reset-ip:" + (request.client.host if request.client else "unknown"),
            limit=30,
        )
    except HTTPException as error:
        if error.status_code != 429:
            raise
        return {"message": GENERIC_NOTICE}
    request_reset(db, body.email, get_settings(), background=background)
    return {"message": GENERIC_NOTICE}


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
    if not consume_reset(db, body.token, body.password):
        raise HTTPException(400, "invalid_reset_token")
    response.delete_cookie(COOKIE, path="/api")


@router.get("/registration-groups")
def registration_groups(db: Session = Depends(get_db)):
    return [dict(row) for row in db.execute(
        select(CourseGroup.id, CourseGroup.group_code).order_by(CourseGroup.group_code)
    ).mappings()]


@router.get("/registration-config")
def registration_config(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"strict_student_groups": get_settings().strict_student_groups}


@router.post("/register", status_code=202)
def register(body: RegistrationInput, request: Request, db: Session = Depends(get_db)):
    check_origin(request)
    settings = get_settings()
    if settings.strict_student_groups:
        if not body.surname or not body.given_name:
            raise HTTPException(422, "student_name_required")
        if body.course_group_id is None:
            raise HTTPException(422, "invalid_course_group")
        display_name = " ".join(filter(None, (body.surname, body.given_name, body.patronymic)))
        if len(display_name) > 150:
            raise HTTPException(422, "invalid_name")
    else:
        if body.display_name is None:
            raise HTTPException(422, "invalid_name")
        display_name = body.display_name
    throttle(db, "register-email:" + body.email, limit=5)
    throttle(
        db,
        "register-ip:" + (request.client.host if request.client else "unknown"),
        limit=30,
    )
    if body.email.rsplit("@", 1)[-1] not in settings.university_email_domains:
        raise HTTPException(400, "university_email_required")
    try:
        validate_configuration(settings)
    except MailError:
        raise HTTPException(503, "mail_not_configured") from None
    lock_revision(db, changed=False)
    account = db.scalar(select(Account).where(Account.email == body.email))
    if account is None:
        if body.course_group_id is not None and db.get(CourseGroup, body.course_group_id) is None:
            raise HTTPException(422, "invalid_course_group")
        # The mailbox owner chooses the real password only AFTER opening the link.
        account = Account(
            email=body.email,
            display_name=display_name,
            password_hash=password_hash(new_token()),
            role=STUDENT,
            course_group_id=None if settings.strict_student_groups else body.course_group_id,
            email_verified=False,
            must_change_password=False,
        )
        db.add(account)
        db.flush()
        if settings.strict_student_groups:
            stage_enrollment(
                db, account, course_group_id=body.course_group_id, surname=body.surname,
                given_name=body.given_name, patronymic=body.patronymic,
            )
    if not account.email_verified and account.is_active:
        raw = new_token()
        verification = ResetToken(
            user_id=account.id,
            token=token_hash(raw),
            purpose="verify",
            expires_at=utc_now() + timedelta(minutes=settings.reset_minutes),
        )
        enqueue_reset(db, account, raw, verification, settings)
        db.commit()
    # Existing and new addresses get the same response; never overwrite a user.
    return {"message": "registration_requested"}


@router.post("/verify-email", status_code=204)
def verify_email(
    body: ResetInput,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    check_origin(request)
    throttle(
        db,
        "verify-submit:" + (request.client.host if request.client else "unknown"),
        limit=30,
    )
    lock_revision(db, changed=False)
    token = db.scalar(
        select(ResetToken).where(ResetToken.token == token_hash(body.token))
    )
    if (
        not token
        or token.purpose != "verify"
        or token.used
        or token.expires_at <= utc_now()
    ):
        raise HTTPException(400, "invalid_verification_token")
    account = db.get(Account, token.user_id)
    if not account or not account.is_active or account.email_verified:
        raise HTTPException(400, "invalid_verification_token")
    account.password_hash = password_hash(body.password)
    account.email_verified = True
    account.must_change_password = False
    if account.role == STUDENT and get_settings().strict_student_groups:
        confirm_enrollment(db, account)
    revoke_sessions(db, account.id)
    record_audit(db, account, "account.email_verified", "users", account.id)
    db.commit()
    response.delete_cookie(COOKIE, path="/api")
