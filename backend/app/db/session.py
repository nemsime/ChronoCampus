from collections.abc import Iterator
from functools import lru_cache
import time

from fastapi import HTTPException
from sqlalchemy import create_engine, update, event
from sqlalchemy.engine import URL, Engine, make_url
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
    url = database_url()
    timeout = get_settings().db_timeout_seconds
    options = {"connect_args": {"timeout": timeout}, "pool_timeout": timeout} if make_url(url).get_backend_name() == "mssql" else {}
    engine = create_engine(url, pool_pre_ping=True, hide_parameters=True, **options)
    if engine.dialect.name == "mssql":
        @event.listens_for(engine, "connect")
        def bounded_queries(connection, record):
            connection.timeout = timeout
    from app.observability.telemetry import database_query
    @event.listens_for(engine, "before_cursor_execute")
    def query_started(connection, cursor, statement, parameters, context, executemany):
        context._chrono_started = time.perf_counter()
    @event.listens_for(engine, "after_cursor_execute")
    def query_finished(connection, cursor, statement, parameters, context, executemany):
        database_query(time.perf_counter() - context._chrono_started)
    @event.listens_for(engine, "handle_error")
    def query_failed(context):
        since = getattr(context.execution_context, "_chrono_started", time.perf_counter())
        database_query(time.perf_counter() - since, failed=True)
    return engine


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
