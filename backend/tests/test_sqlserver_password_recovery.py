"""Opt-in procedure tests, restricted to newly created disposable databases."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import os
import re
import secrets
from threading import Barrier

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.accounts.recovery import consume_reset, utc_now
from app.core.security import password_hash, token_hash, verify_password
from app.db.models import Account, ResetToken, UserSession
from app.db.session import get_engine


@pytest.fixture
def sql_reset_engine():
    name = os.getenv("CHRONOCAMPUS_RESET_TEST_DATABASE", "")
    if not name:
        pytest.skip(
            "Set CHRONOCAMPUS_RESET_TEST_DATABASE to an isolated migrated database"
        )
    assert re.fullmatch(r"ChronoCampus_ResetTest_(Empty|Legacy)_\d{8}_\d{6}", name)
    engine = get_engine()
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT DB_NAME()")) == name
    return engine


def account_and_token(
    engine, *, active=True, expired=False, used=False, purpose="reset"
):
    raw = secrets.token_hex(32)
    with Session(engine) as db:
        now = utc_now(db)
        account = Account(
            email=f"resettest{secrets.token_hex(8)}@polytechnic.am",
            role="student",
            password_hash=password_hash("Before-password-2026!"),
            is_active=active,
            email_verified=True,
            must_change_password=False,
        )
        db.add(account)
        db.flush()
        identifier = account.id
        db.add(
            ResetToken(
                user_id=identifier,
                token_hash=token_hash(raw),
                purpose=purpose,
                used=used,
                created_at=now,
                expires_at=now + timedelta(minutes=-1 if expired else 30),
            )
        )
        db.add(
            UserSession(
                user_id=identifier,
                session_token=token_hash(secrets.token_hex(32)),
                expires_at=now + timedelta(hours=1),
            )
        )
        db.commit()
    return identifier, raw


def test_sql_same_token_has_exactly_one_success(sql_reset_engine):
    engine = sql_reset_engine
    identifier, raw = account_and_token(engine)
    barrier = Barrier(2)

    def attempt(index):
        with Session(engine) as db:
            barrier.wait(timeout=10)
            return consume_reset(db, raw, f"After-password-{index}-2026!")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [0, 1]))
    assert sorted(results) == [False, True]
    with Session(engine) as db:
        account = db.get(Account, identifier)
        assert not verify_password("Before-password-2026!", account.password_hash)
        assert all(
            s.is_revoked
            for s in db.scalars(
                select(UserSession).where(UserSession.user_id == identifier)
            )
        )
        assert all(
            t.used
            for t in db.scalars(
                select(ResetToken).where(ResetToken.user_id == identifier)
            )
        )


@pytest.mark.parametrize("condition", ["expired", "used", "inactive", "verification"])
def test_sql_rejects_bad_links_and_preserves_password(sql_reset_engine, condition):
    engine = sql_reset_engine
    identifier, raw = account_and_token(
        engine,
        active=condition != "inactive",
        expired=condition == "expired",
        used=condition == "used",
        purpose="verify" if condition == "verification" else "reset",
    )
    with Session(engine) as db:
        assert not consume_reset(db, raw, "Rejected-password-2026!")
    with Session(engine) as db:
        assert verify_password(
            "Before-password-2026!", db.get(Account, identifier).password_hash
        )
        assert not db.scalar(
            select(UserSession).where(UserSession.user_id == identifier)
        ).is_revoked


def test_sql_request_uses_db_clock_and_silent_hourly_limit(
    sql_reset_engine, monkeypatch
):
    from app.accounts import recovery
    from app.core.config import get_settings

    engine = sql_reset_engine
    identifier, _ = account_and_token(engine, purpose="verify")
    sent = []
    monkeypatch.setattr(recovery, "sendEmail", lambda mail, **kwargs: sent.append(mail))
    with Session(engine) as db:
        email = db.get(Account, identifier).email
        for _ in range(4):
            recovery.request_reset(db, email, get_settings())
        rows = list(
            db.scalars(
                select(ResetToken).where(
                    ResetToken.user_id == identifier, ResetToken.purpose == "reset"
                )
            )
        )
        assert len(rows) == 3 and len(sent) == 3
        assert sum(not row.used for row in rows) == 1
        assert all(
            1790 < (row.expires_at - row.created_at).total_seconds() < 1810
            for row in rows
        )
