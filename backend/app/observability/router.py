import hmac
import os
import threading
import time
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.accounts.dependencies import administrator, current_user
from app.core.config import get_settings
from app.db import models as m
from app.db.session import get_db
from app.observability import telemetry as t
from app.scheduling.snapshot import record

router = APIRouter(prefix="/admin/diagnostics", tags=["diagnostics"])
client_router = APIRouter(tags=["diagnostics"])
_client_reports = OrderedDict()
_client_lock = threading.Lock()


def database_probe(db):
    begin = time.perf_counter()
    try:
        db.execute(text("SELECT 1"))
        db.execute(
            select(
                m.GenerationRun.progress,
                m.GenerationRun.request_id,
                m.GenerationRun.actor_id,
                m.GenerationRun.started_at,
                m.GenerationRun.updated_at,
                m.GenerationRun.comparison_hash,
            ).limit(1)
        )
        db.execute(select(m.AuditEvent).limit(1))
        revision = db.get(m.DataRevision, 1)
        return {
            "ready": revision is not None,
            "schema": "0003_observability",
            "latency_ms": round((time.perf_counter() - begin) * 1000, 2),
        }
    except Exception as error:
        db.rollback()
        t.exception_event("database.readiness_failed", error)
        return {
            "ready": False,
            "latency_ms": round((time.perf_counter() - begin) * 1000, 2),
        }


@router.get("/system", dependencies=[Depends(administrator)])
def system(db: Session = Depends(get_db)):
    probe = database_probe(db)
    statuses, recent = {}, []
    if probe["ready"]:
        statuses = dict(
            db.execute(
                select(m.GenerationRun.status, func.count()).group_by(
                    m.GenerationRun.status
                )
            ).all()
        )
        recent = db.execute(
            select(
                m.GenerationRun.status,
                m.GenerationRun.created_at,
                m.GenerationRun.started_at,
                m.GenerationRun.finished_at,
            )
            .order_by(m.GenerationRun.id.desc())
            .limit(100)
        ).all()
    metrics = t.request_metrics()
    return {
        "database": probe,
        "process": {
            **t.process_stats(),
            "pid": os.getpid(),
            "uptime_seconds": metrics["uptime_seconds"],
            "scope": "single_process",
            "log_write_failures": metrics["write_failures"],
        },
        "generation": {
            "statuses": statuses,
            "recent_sample_size": len(recent),
            "recent_failures": sum(
                r.status in {"failed", "rejected", "interrupted", "stale"}
                for r in recent
            ),
        },
        "requests": {
            "total": sum(r["count"] for r in metrics["items"]),
            "server_errors": sum(
                r["count"] for r in metrics["items"] if r["status"] >= 500
            ),
        },
        "retention": {
            "event_capacity": 2000,
            "log_file_bytes": get_settings().diagnostic_log_max_bytes,
            "log_backups": get_settings().diagnostic_log_backups,
            "audit": "database",
        },
    }


@router.get("/events", dependencies=[Depends(administrator)])
def events(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    level: Literal["INFO", "WARNING", "ERROR", "DEBUG"] | None = None,
    event: str | None = Query(None, max_length=80),
    request_id: str | None = Query(None, max_length=32),
):
    return t.events(
        limit=limit, offset=offset, level=level, event=event, request_id=request_id
    )


@router.get("/requests", dependencies=[Depends(administrator)])
def requests():
    return t.request_metrics()


@router.get("/audit", dependencies=[Depends(administrator)])
def audit(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    actor_id: int | None = Query(None, ge=1),
    resource: str | None = Query(None, max_length=50),
    action: str | None = Query(None, max_length=60),
    request_id: str | None = Query(None, max_length=32),
):
    stmt = select(m.AuditEvent)
    for column, value in (
        (m.AuditEvent.actor_id, actor_id),
        (m.AuditEvent.resource, resource),
        (m.AuditEvent.action, action),
        (m.AuditEvent.request_id, request_id),
    ):
        if value is not None:
            stmt = stmt.where(column == value)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(m.AuditEvent.id.desc()).offset(offset).limit(limit))
    return {
        "items": [record(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def metrics_access(request: Request, db: Session = Depends(get_db)):
    header = request.headers.get("authorization", "")
    if header:
        settings = get_settings()
        expected = settings.metrics_token.get_secret_value()
        if settings.metrics_token_file:
            try:
                expected = settings.metrics_token_file.read_text(
                    encoding="utf-8"
                ).strip()
            except OSError:
                raise HTTPException(503, "metrics_not_configured") from None
        if not expected or not hmac.compare_digest(
            header.encode(), ("Bearer " + expected).encode()
        ):
            raise HTTPException(401, "authentication_required")
        return
    from app.accounts.dependencies import authenticated

    administrator(current_user(authenticated(request, db)))


@router.get(
    "/metrics", response_class=PlainTextResponse, dependencies=[Depends(metrics_access)]
)
def metrics(db: Session = Depends(get_db)):
    output = t.prometheus()
    probe = database_probe(db)
    output += "# HELP chronocampus_database_ready Whether the database and required schema are available.\n"
    output += f"# TYPE chronocampus_database_ready gauge\nchronocampus_database_ready {int(probe['ready'])}\n"
    if probe["ready"]:
        counts = dict(
            db.execute(
                select(m.GenerationRun.status, func.count()).group_by(
                    m.GenerationRun.status
                )
            ).all()
        )
        output += "# HELP chronocampus_generation_runs Persisted generation runs grouped by current status.\n"
        output += "# TYPE chronocampus_generation_runs gauge\n"
        for status in (
            "queued",
            "running",
            "complete",
            "partial",
            "failed",
            "rejected",
            "stale",
            "interrupted",
        ):
            output += f'chronocampus_generation_runs{{status="{status}"}} {counts.get(status, 0)}\n'
    return PlainTextResponse(output, media_type="text/plain; version=0.0.4")


class ClientFrame(BaseModel):
    source: Literal[
        "Application",
        "Planner",
        "Diagnostics",
        "DiagnosticBoundary",
        "Accounts",
        "Catalogs",
        "Schedule",
        "Feedback",
        "common",
        "api",
        "i18n",
        "bundle",
    ]
    line: int = Field(ge=0, le=1000000)
    column: int = Field(ge=0, le=1000000)


class ClientError(BaseModel):
    code: Literal[
        "render_error", "javascript_error", "unhandled_rejection", "network_error"
    ]
    page: Literal[
        "schedule",
        "planner",
        "catalogs",
        "feedback",
        "account",
        "diagnostics",
        "unknown",
    ] = "unknown"
    source_request_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    frames: list[ClientFrame] = Field(default_factory=list, max_length=12)


@client_router.post("/diagnostics/client-errors", status_code=202)
def client_error(body: ClientError, account: m.Account = Depends(current_user)):
    now = time.perf_counter()
    with _client_lock:
        window, count = _client_reports.get(account.id, (now, 0))
        if now - window > 60:
            window, count = now, 0
        if count >= 10:
            raise HTTPException(429, "too_many_attempts")
        _client_reports[account.id] = (window, count + 1)
        _client_reports.move_to_end(account.id)
        if len(_client_reports) > 1000:
            _client_reports.popitem(last=False)
    t.emit(
        "frontend.error",
        "ERROR",
        actor_id=account.id,
        error_code=body.code,
        page=body.page,
        source_request_id=body.source_request_id,
        frames=[frame.model_dump() for frame in body.frames],
    )
    return {"accepted": True}
