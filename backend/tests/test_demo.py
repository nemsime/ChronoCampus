from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app import demo


def test_seed_account_rotates_existing_demo_credentials(monkeypatch):
    account = SimpleNamespace(
        id=7,
        role="student",
        password_hash="old-hash",
        must_change_password=True,
    )
    session = Mock()
    session.scalar.return_value = account
    revoked = []
    monkeypatch.setattr(demo.secrets, "token_urlsafe", lambda _: "new-password")
    monkeypatch.setattr(demo, "password_hash", lambda password: f"hash:{password}")
    monkeypatch.setattr(
        demo, "revoke_sessions", lambda db, account_id: revoked.append(account_id)
    )
    credentials = {}

    result = demo._seed_account(
        session,
        credentials,
        "student1.demo@example.invalid",
        "Demo Student",
        "student",
        course_group_id=3,
    )

    assert result is account
    assert account.password_hash == "hash:new-password"
    assert account.must_change_password is False
    assert revoked == [7]
    assert credentials == {
        "student1.demo@example.invalid": {
            "password": "new-password",
            "name": "Demo Student",
            "role": "student",
        }
    }


def test_seed_account_does_not_reset_an_unexpected_role(monkeypatch):
    account = SimpleNamespace(
        id=7,
        role="admin",
        password_hash="old-hash",
        must_change_password=True,
    )
    session = Mock()
    session.scalar.return_value = account
    monkeypatch.setattr(demo.secrets, "token_urlsafe", lambda _: "new-password")

    with pytest.raises(RuntimeError, match="unexpected role"):
        demo._seed_account(
            session,
            {},
            "student1.demo@example.invalid",
            "Demo Student",
            "student",
        )

    assert account.password_hash == "old-hash"
    assert account.must_change_password is True
    session.flush.assert_not_called()
