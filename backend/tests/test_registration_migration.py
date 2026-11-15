"""Exercise the additive migration against retained pre-registration rows."""

import importlib.util
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_registration_migration_preserves_existing_accounts_and_reset_links(tmp_path):
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic/versions/0005_email_registration.py"
    )
    spec = importlib.util.spec_from_file_location("registration_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    with engine.begin() as connection:
        connection.execute(
            text(
                'CREATE TABLE "User" (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT)'
            )
        )
        connection.execute(
            text(
                'CREATE TABLE "PasswordResetToken" (id INTEGER PRIMARY KEY, token TEXT)'
            )
        )
        connection.execute(
            text('INSERT INTO "User" VALUES (1, :email, :hash)'),
            {"email": "legacy@example.invalid", "hash": "retained-hash"},
        )
        connection.execute(
            text('INSERT INTO "PasswordResetToken" VALUES (1, :token)'),
            {"token": "retained-token-hash"},
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert connection.execute(
                text('SELECT email_verified, password_hash FROM "User"')
            ).one() == (1, "retained-hash")
            assert connection.execute(
                text('SELECT purpose, token FROM "PasswordResetToken"')
            ).one() == ("reset", "retained-token-hash")
            migration.downgrade()
            assert "email_verified" not in {
                col["name"] for col in inspect(connection).get_columns("User")
            }
            migration.upgrade()
            assert (
                connection.execute(text('SELECT email_verified FROM "User"')).scalar()
                == 1
            )
    engine.dispose()
