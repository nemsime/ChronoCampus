from unittest.mock import MagicMock

import pyodbc
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.db.connection import get_connection
from app.main import app


def test_health_without_database():
    with TestClient(app) as client:
        assert client.get('/api/health').json() == {'status': 'ok'}


def test_health_starts_when_database_is_not_configured(monkeypatch):
    from fastapi import HTTPException

    def unavailable():
        raise HTTPException(503, "database_not_configured")

    monkeypatch.setattr("app.main.get_engine", unavailable)
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}


def test_groups_maps_database_columns_and_closes_cursor():
    connection = MagicMock()
    cursor = connection.cursor.return_value
    cursor.fetchall.return_value = [(1, 'ՄԹ440', 'Մաթեմատիկա', 2024, 57)]
    app.dependency_overrides[get_connection] = lambda: connection
    try:
        with TestClient(app) as client:
            response = client.get('/api/groups')
        assert response.status_code == 200
        assert response.json() == [dict(id=1, code='ՄԹ440', major_name='Մաթեմատիկա', admission_year=2024, capacity=57)]
        cursor.close.assert_called_once()
    finally:
        app.dependency_overrides.clear()


def test_missing_database_configuration():
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, sqlserver_connection_string='')
    try:
        with TestClient(app) as client:
            response = client.get('/api/groups')
        assert response.status_code == 503
        assert response.json() == {'detail': 'Database is not configured.'}
    finally:
        app.dependency_overrides.clear()


def test_database_error_is_sanitized_and_connection_closed(monkeypatch):
    connection = MagicMock()
    connection.cursor.return_value.execute.side_effect = pyodbc.Error('secret-password')
    monkeypatch.setattr(pyodbc, 'connect', lambda *args, **kwargs: connection)
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, sqlserver_connection_string='test')
    try:
        with TestClient(app) as client:
            response = client.get('/api/groups')
        assert response.status_code == 503
        assert response.json() == {'detail': 'Database is unavailable.'}
        assert 'secret-password' not in response.text
        connection.close.assert_called_once()
    finally:
        app.dependency_overrides.clear()


def test_empty_database_returns_empty_list():
    connection = MagicMock()
    connection.cursor.return_value.fetchall.return_value = []
    app.dependency_overrides[get_connection] = lambda: connection
    try:
        with TestClient(app) as client:
            assert client.get('/api/groups').json() == []
    finally:
        app.dependency_overrides.clear()
