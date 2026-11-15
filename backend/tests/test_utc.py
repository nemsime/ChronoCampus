"""Compatibility of aware application timestamps with historical UTC storage."""

from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import Column, MetaData, Table, create_engine, insert, select

from app.db.utc import UTCDateTime, utc_now


@pytest.mark.parametrize('value', [
    datetime(2026, 11, 15, 12),
    datetime(2026, 11, 15, 12, tzinfo=UTC),
    datetime(2026, 11, 15, 16, tzinfo=timezone(timedelta(hours=4))),
    None,
])
def test_timestamp_round_trip(value):
    engine = create_engine('sqlite://')
    metadata = MetaData()
    table = Table('timestamps', metadata, Column('value', UTCDateTime))
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(insert(table).values(value=value))
        restored = connection.scalar(select(table.c.value))
    assert restored == (None if value is None else datetime(2026, 11, 15, 12, tzinfo=UTC))
    if restored is not None:
        assert restored.tzinfo is UTC


def test_clock_is_aware_utc():
    assert utc_now().tzinfo is UTC
