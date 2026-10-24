from collections.abc import Iterator
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import create_engine, update
from sqlalchemy.engine import URL, Engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import DataRevision


def database_url():
    settings = get_settings()
    if settings.database_url.get_secret_value():
        return settings.database_url.get_secret_value()
    connection = settings.sqlserver_connection_string.get_secret_value()
    if not connection:
        raise HTTPException(503, "database_not_configured")
    return URL.create("mssql+pyodbc", query={"odbc_connect": connection})


@lru_cache
def get_engine() -> Engine:
    return create_engine(database_url(), pool_pre_ping=True, hide_parameters=True)


def get_db() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session


def lock_revision(db: Session, *, changed: bool = True) -> int:
    """Take a database write lock until commit; never hold it while solving."""
    db.execute(
        update(DataRevision)
        .where(DataRevision.id == 1)
        .values(revision=DataRevision.revision + int(changed))
    )
    row = db.get(DataRevision, 1, populate_existing=True)
    if row is None:
        raise HTTPException(503, "migrations_required")
    return row.revision
