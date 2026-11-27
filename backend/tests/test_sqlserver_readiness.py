"""Read-only readiness checks against isolated SQL Server databases."""
import json
import os
import re
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

from app.core.config import get_settings


@pytest.mark.parametrize(
    ("index", "revision", "status_code", "status"),
    [(0, "0007_dean_suggestions", 503, "unavailable"), (1, "head", 200, "ready")],
)
def test_sqlserver_readiness_by_schema(client, monkeypatch, index, revision, status_code, status):
    configured = os.getenv("CHRONOCAMPUS_READINESS_SQL_DATABASES")
    if not configured:
        pytest.skip("Set CHRONOCAMPUS_READINESS_SQL_DATABASES to isolated [0007, head] database names")
    names = json.loads(configured)
    assert len(names) == 2 and names[0] != names[1]
    name = names[index]
    assert re.fullmatch(r"ChronoCampus_[A-Za-z]*Test_[A-Za-z0-9_]+", name)
    connection = re.sub(
        r"(?i)DATABASE=[^;]+",
        "DATABASE=" + name,
        get_settings().sqlserver_connection_string.get_secret_value(),
    )
    engine = create_engine(
        URL.create("mssql+pyodbc", query={"odbc_connect": connection}), hide_parameters=True
    )
    try:
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        expected = ScriptDirectory.from_config(config).get_current_head() if revision == "head" else revision
        with engine.connect() as db:
            assert db.scalar(text("SELECT DB_NAME()")) == name
            assert db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == expected

        monkeypatch.setattr("app.main.get_engine", lambda: engine)
        response = client.get("/api/ready")
        assert response.status_code == status_code
        assert response.json() == {"status": status}
    finally:
        engine.dispose()
