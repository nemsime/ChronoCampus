from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from app.db.connection import get_connection

if TYPE_CHECKING:
    import pyodbc
from app.schemas.groups import GroupRead
from app.services.groups import list_groups

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[GroupRead])
def get_groups(connection: pyodbc.Connection = Depends(get_connection)) -> list[GroupRead]:
    return list_groups(connection)
