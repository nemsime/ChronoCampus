from collections.abc import Iterator

import pyodbc
from fastapi import Depends, HTTPException

from app.core.config import Settings, get_settings


def get_connection(settings: Settings = Depends(get_settings)) -> Iterator[pyodbc.Connection]:
    connection_string = settings.sqlserver_connection_string.get_secret_value()
    if not connection_string:
        raise HTTPException(status_code=503, detail="Database is not configured.")
    connection = None
    try:
        connection = pyodbc.connect(
            connection_string, timeout=settings.db_timeout_seconds, readonly=True,
        )
        connection.timeout = settings.db_timeout_seconds
        yield connection
    except pyodbc.Error:
        # Driver messages may include credentials, server names, or SQL text.
        raise HTTPException(status_code=503, detail="Database is unavailable.") from None
    finally:
        if connection is not None:
            connection.close()
