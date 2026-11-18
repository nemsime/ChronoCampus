"""Exercise the shape of retained catalog rows at each reversible migration boundary."""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def migration(name):
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_lab_upgrade_backfills_and_legacy_downgrade_preserves_identity():
    rev = migration("0009_independent_labs")
    with (
        create_engine("sqlite://").begin() as conn,
        Operations.context(MigrationContext.configure(conn)),
    ):
        for sql in (
            "CREATE TABLE CourseGroup(id INTEGER PRIMARY KEY)",
            "CREATE TABLE SmallGroup(id INTEGER PRIMARY KEY, course_group_id INTEGER REFERENCES CourseGroup)",
            "CREATE TABLE CalendarConfig(id INTEGER PRIMARY KEY)",
            "CREATE TABLE LabGroup(id INTEGER PRIMARY KEY, small_group_id INTEGER NOT NULL REFERENCES SmallGroup(id), label TEXT, capacity INTEGER, UNIQUE(small_group_id,label))",
            "INSERT INTO CourseGroup VALUES(1),(2)",
            "INSERT INTO SmallGroup VALUES(7,1)",
            "INSERT INTO CalendarConfig VALUES(3)",
            "INSERT INTO LabGroup VALUES(9,7,'L1',12)",
        ):
            conn.execute(text(sql))
        rev.upgrade()
        assert conn.execute(
            text("SELECT id,small_group_id,course_group_id FROM LabGroup")
        ).one() == (9, 7, 1)
        assert (
            conn.scalar(text("SELECT cross_partition_overlap FROM CalendarConfig"))
            == "assume_overlap"
        )
        conn.execute(
            text(
                "INSERT INTO LabGroup(id,course_group_id,label,capacity) VALUES(11,1,'L2',9),(12,2,'L2',9)"
            )
        )
        with pytest.raises(RuntimeError, match="legacy parent"):
            rev.downgrade()
        conn.execute(text("DELETE FROM LabGroup WHERE id IN (11,12)"))
        rev.downgrade()
        assert conn.execute(text("SELECT * FROM LabGroup")).one() == (9, 7, "L1", 12)
        assert not next(
            c
            for c in inspect(conn).get_columns("LabGroup")
            if c["name"] == "small_group_id"
        )["nullable"]
