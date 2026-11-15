from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app import demo
from app.db import models as m
from sqlalchemy import event, select

from conftest import HASH


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


def test_add_demo_deans_preserves_existing_accounts_credentials_and_timetables(database, monkeypatch, tmp_path):
    engine = database.get_bind()

    def development_name(connection, cursor, statement, parameters, context, many):
        if statement == "SELECT DB_NAME()":
            return "SELECT 'ChronoCampus_Development'", parameters
        return statement, parameters

    event.listen(engine, "before_cursor_execute", development_name, retval=True)
    monkeypatch.setattr(demo, "get_engine", lambda: engine)
    monkeypatch.setattr(demo, "password_hash", lambda _: HASH)
    credentials = tmp_path / "demo-credentials.json"
    try:
        demo.seed_demo(credentials)
        # Model an older seeded DB: academic fixtures and credentials predate deans.
        for dean in database.scalars(select(m.Account).where(m.Account.role == "dean")):
            database.delete(dean)
        database.commit()
        saved = demo.json.loads(credentials.read_text())
        for email in list(saved):
            if saved[email]["role"] == "dean":
                del saved[email]
        credentials.write_text(demo.json.dumps(saved))
        accounts_before = {a.email: a.password_hash for a in database.scalars(select(m.Account))}
        groups_before = list(database.scalars(select(m.CourseGroup.id)))
        term = database.scalar(select(m.Term).limit(1))
        version = m.ScheduleVersion(term_id=term.id, name="Preserved draft", cohort_ids=groups_before[:1])
        database.add(version)
        database.commit()
        version_id = version.id

        first = demo.seed_demo_deans(credentials)
        database.expire_all()
        revision_after_first = database.get(m.DataRevision, 1).revision
        credentials_after_first = credentials.read_text()
        dean_hashes = {a.email: a.password_hash for a in database.scalars(
            select(m.Account).where(m.Account.role == "dean"))}
        second = demo.seed_demo_deans(credentials)
        database.expire_all()
        assert database.get(m.DataRevision, 1).revision == revision_after_first
        assert first["created"] == ["dean.demo@example.invalid", "dean.faculty1.demo@example.invalid"]
        assert second["created"] == []
        assert len(second["faculty_groups"]) == 3
        current_credentials = demo.json.loads(credentials.read_text())
        assert all(current_credentials[email] == values for email, values in saved.items())
        assert all(database.scalar(select(m.Account.password_hash).where(m.Account.email == email)) == value
                   for email, value in accounts_before.items())
        assert list(database.scalars(select(m.CourseGroup.id))) == groups_before
        preserved = database.get(m.ScheduleVersion, version_id)
        assert (preserved.name, preserved.status, preserved.revision, preserved.cohort_ids) == (
            "Preserved draft", "draft", 1, groups_before[:1])
        assert credentials.read_text() == credentials_after_first
        assert all(database.scalar(select(m.Account.password_hash).where(m.Account.email == email)) == value
                   for email, value in dean_hashes.items())
        from app.review.service import account_scope, scope_groups
        university = database.scalar(select(m.Account).where(m.Account.email == first["created"][0]))
        faculty = database.scalar(select(m.Account).where(m.Account.email == first["created"][1]))
        assert scope_groups(database, account_scope(university)) is None
        assert len(scope_groups(database, account_scope(faculty))) == 3
    finally:
        event.remove(engine, "before_cursor_execute", development_name)


def test_add_demo_deans_rejects_other_databases(monkeypatch, tmp_path):
    session = Mock()
    session.scalar.return_value = "retained_database"
    manager = Mock()
    manager.__enter__ = Mock(return_value=session)
    manager.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(demo, "Session", lambda *args, **kwargs: manager)
    monkeypatch.setattr(demo, "get_engine", lambda: None)
    credentials = tmp_path / "credentials.json"
    with pytest.raises(RuntimeError, match="isolated"):
        demo.seed_demo_deans(credentials)
    session.commit.assert_not_called()
    assert not credentials.exists()
