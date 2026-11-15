"""UTC timestamps over the existing timezone-free database schema."""

from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    """Historical naive values represent UTC, never local server time."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class UTCDateTime(TypeDecorator):
    """Store naive UTC for SQL Server/SQLite; expose aware UTC to Python."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else as_utc(value).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return None if value is None else as_utc(value)
