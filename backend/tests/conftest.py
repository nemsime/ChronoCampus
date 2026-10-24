import pytest
from app.core.config import Settings
from app.core.security import password_hash
from app.db.models import Account, Base, DataRevision
from app.db.session import get_db
from app.jobs.models import QueueAdmission
from app.main import app
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

PASSWORD = "Test-password-2026!"
HASH = password_hash(PASSWORD)


@pytest.fixture(autouse=True)
def isolate_startup_database(monkeypatch):
    """Tests opt into a fixture database; never recover jobs in the developer's DB."""

    def unavailable():
        raise HTTPException(503, "test_database_not_selected")

    monkeypatch.setattr("app.main.get_engine", unavailable)


@pytest.fixture
def database():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        db.add(DataRevision(id=1, revision=0))
        db.add(QueueAdmission(id=1, name="generation"))
        db.add(
            Account(
                email="admin@example.invalid",
                password_hash=HASH,
                display_name="Test administrator",
                role="admin",
                is_active=True,
                must_change_password=False,
            )
        )
        db.commit()
        yield db
    engine.dispose()


@pytest.fixture
def client(database, monkeypatch, tmp_path):
    monkeypatch.setattr("app.main.get_engine", lambda: database.get_bind())
    settings = Settings(
        _env_file=None,
        cookie_secure=False,
        mail_mode="file",
        mail_directory=tmp_path,
        mail_keys_file=tmp_path / "mail-keys.json",
        university_email_domains=["example.invalid"],
        diagnostic_log_directory=tmp_path / "logs",
    )
    from app.accounts.mail import init_keys
    init_keys(settings.mail_keys_file)
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    monkeypatch.setattr("app.observability.router.get_settings", lambda: settings)
    monkeypatch.setattr("app.accounts.router.get_settings", lambda: settings)
    monkeypatch.setattr("app.accounts.dependencies.get_settings", lambda: settings)
    monkeypatch.setattr("app.accounts.mail.get_settings", lambda: settings)
    monkeypatch.setattr("app.jobs.io_worker.get_settings", lambda: settings)
    monkeypatch.setattr("app.jobs.queue.get_settings", lambda: settings)

    def override():
        try:
            yield database
        finally:
            database.rollback()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(client):
    response = client.post(
        "/api/auth/login", json={"email": "admin@example.invalid", "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf_token"]
    return client
