"""Bounded, process-local telemetry. Never record arbitrary messages or payloads."""

import json
import logging
import os
import sys
import threading
import time
import traceback
from collections import deque
from contextvars import ContextVar
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from uuid import uuid4

request_id_var = ContextVar("request_id", default=None)
started = time.perf_counter()
_lock = threading.RLock()
_events = deque(maxlen=2000)
_requests = {}
_database = {"count": 0, "errors": 0, "seconds": 0.0, "max_seconds": 0.0}
_sequence = 0
_write_failures = 0
_dropped_events = 0
_logger = logging.getLogger("chronocampus.events")
_logger.propagate = False
_logger.addHandler(logging.NullHandler())
_APPLICATION_ROOT = Path(__file__).resolve().parents[1]
BUCKETS = (0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60)
FIELDS = {
    "run_id",
    "version_id",
    "actor_id",
    "status",
    "method",
    "route",
    "duration_ms",
    "algorithm",
    "seed",
    "stage",
    "placed",
    "total",
    "candidate_count",
    "objective",
    "error_code",
    "exception_type",
    "frames",
    "request_id",
    "source_request_id",
    "resource",
    "entity_id",
    "count",
    "page",
    "dialect",
    "elapsed_seconds",
}
ERROR_CODES = {
    "authentication_required",
    "administrator_required",
    "origin_forbidden",
    "csrf_failed",
    "password_change_required",
    "invalid_credentials",
    "too_many_attempts",
    "invalid_reference",
    "invalid_email",
    "invalid_subgroup",
    "invalid_lab_group",
    "student_group_required",
    "student_membership_only",
    "cannot_disable_self",
    "teacher_has_workload",
    "password_required",
    "cohort_identity_has_workload",
    "study_form_has_workload",
    "group_parent_immutable",
    "subgroup_capacity",
    "lecturer_required",
    "outside_term",
    "study_form_mismatch",
    "indivisible_workload",
    "workload_has_occurrences",
    "deactivate_account_instead",
    "resource_not_found",
    "version_not_found",
    "run_not_found",
    "lesson_not_found",
    "generation_already_running",
    "generation_queue_full",
    "generation_enqueue_failed",
    "schedule_conflict",
    "publication_blocked",
    "stale_revision",
    "draft_required",
    "invalid_occurrence",
    "manual_holiday_move",
    "unpin_before_cancellation",
    "holiday_not_emergency",
    "emergency_already_recorded",
    "metrics_not_configured",
    "database_not_configured",
    "migrations_required",
    "invalid_password",
    "invalid_reset_token",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class SafeFileHandler(RotatingFileHandler):
    def handleError(self, record):
        global _write_failures
        with _lock:
            _write_failures += 1


def configure(settings):
    """Idempotent configuration; file failures leave the application usable."""
    global _write_failures
    with _lock:
        for handler in _logger.handlers[:]:
            _logger.removeHandler(handler)
            handler.close()
        _logger.setLevel(logging.DEBUG if settings.diagnostic_debug else logging.INFO)
        console = logging.StreamHandler()
        console.setFormatter(logging.Formatter("%(message)s"))
        _logger.addHandler(console)
        try:
            directory = settings.diagnostic_log_directory
            directory.mkdir(parents=True, exist_ok=True)
            handler = SafeFileHandler(
                directory / "events.jsonl",
                maxBytes=settings.diagnostic_log_max_bytes,
                backupCount=settings.diagnostic_log_backups,
                encoding="utf-8",
            )
            handler.setFormatter(logging.Formatter("%(message)s"))
            _logger.addHandler(handler)
        except OSError:
            _write_failures += 1
    # Uvicorn's access log includes raw query strings (including reset tokens).
    logging.getLogger("uvicorn.access").disabled = True


def emit(event, level="INFO", **fields):
    """Call only with code-defined event names and approved scalar fields."""
    global _sequence, _dropped_events, _write_failures
    try:
        row = {k: v for k, v in fields.items() if k in FIELDS and v is not None}
        row.update(timestamp=utc_now(), event=event, level=level)
        row.setdefault("request_id", request_id_var.get())
        with _lock:
            _sequence += 1
            row["id"] = _sequence
            if len(_events) == _events.maxlen:
                _dropped_events += 1
            _events.append(row)
        _logger.log(
            getattr(logging, level, logging.INFO), json.dumps(row, ensure_ascii=True)
        )
    except Exception:
        with _lock:
            _write_failures += 1


def exception_event(event, error, **fields):
    # Exception strings, SQL statements, source lines and local variables can contain secrets.
    def source_file(filename):
        path = Path(filename)
        try:
            return "app/" + path.relative_to(_APPLICATION_ROOT).as_posix()
        except ValueError:
            return path.name

    frames = [
        {
            "file": source_file(frame.filename),
            "function": frame.name,
            "line": frame.lineno,
        }
        for frame in traceback.extract_tb(error.__traceback__)[-25:]
    ]
    emit(event, "ERROR", exception_type=type(error).__name__, frames=frames, **fields)


def events(*, limit=50, offset=0, level=None, event=None, request_id=None):
    with _lock:
        rows = [
            dict(row)
            for row in reversed(_events)
            if (not level or row["level"] == level)
            and (not event or row["event"] == event)
            and (not request_id or row.get("request_id") == request_id)
        ]
        return {
            "items": rows[offset : offset + limit],
            "total": len(rows),
            "limit": limit,
            "offset": offset,
            "capacity": _events.maxlen,
            "evicted": _dropped_events,
            "write_failures": _write_failures,
            "scope": "process",
        }


def request_finished(method, route, status, seconds):
    method = (
        method
        if method in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
        else "OTHER"
    )
    with _lock:
        key = (method, route, status)
        if key not in _requests and len(_requests) >= 512:
            key = ("OTHER", "other", status // 100 * 100)
        row = _requests.setdefault(
            key,
            {
                "method": key[0],
                "route": key[1],
                "status": key[2],
                "count": 0,
                "seconds": 0.0,
                "max_seconds": 0.0,
                "buckets": [0] * len(BUCKETS),
            },
        )
        row["count"] += 1
        row["seconds"] += seconds
        row["max_seconds"] = max(row["max_seconds"], seconds)
        for index, bound in enumerate(BUCKETS):
            row["buckets"][index] += int(seconds <= bound)


def request_metrics():
    with _lock:
        rows = [{**row, "buckets": list(row["buckets"])} for row in _requests.values()]
        return {
            "items": sorted(rows, key=lambda r: (-r["count"], r["route"])),
            "uptime_seconds": time.perf_counter() - started,
            "write_failures": _write_failures,
            "scope": "process",
        }


def database_query(seconds, failed=False):
    with _lock:
        _database["count"] += 1
        _database["errors"] += int(failed)
        _database["seconds"] += seconds
        _database["max_seconds"] = max(_database["max_seconds"], seconds)
    if seconds >= 0.5:
        emit("database.slow_query", "WARNING", duration_ms=round(seconds * 1000, 2))


def process_stats():
    times = os.times()
    result = {"cpu_seconds": times.user + times.system, "memory_rss_bytes": None}
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes

            class Memory(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("faults", wintypes.DWORD)] + [
                    (key, ctypes.c_size_t)
                    for key in (
                        "peak",
                        "working",
                        "peak_paged",
                        "paged",
                        "peak_nonpaged",
                        "nonpaged",
                        "pagefile",
                        "peak_pagefile",
                    )
                ]

            memory = Memory()
            memory.cb = ctypes.sizeof(memory)
            process = ctypes.windll.kernel32.GetCurrentProcess
            process.restype = wintypes.HANDLE
            query = ctypes.windll.psapi.GetProcessMemoryInfo
            query.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
            if query(process(), ctypes.byref(memory), memory.cb):
                result["memory_rss_bytes"] = memory.working
        except (OSError, AttributeError):
            pass
    elif sys.platform.startswith("linux"):
        try:
            result["memory_rss_bytes"] = int(
                Path("/proc/self/statm").read_text().split()[1]
            ) * os.sysconf("SC_PAGE_SIZE")
        except (OSError, ValueError, IndexError):
            pass
    with _lock:
        result["database_queries"] = dict(_database)
    return result


def prometheus():
    data = request_metrics()
    lines = [
        "# HELP chronocampus_uptime_seconds Elapsed time since this API process started.",
        "# TYPE chronocampus_uptime_seconds gauge",
        f"chronocampus_uptime_seconds {data['uptime_seconds']:.3f}",
        "# HELP chronocampus_log_write_failures_total Diagnostic log write failures in this process.",
        "# TYPE chronocampus_log_write_failures_total counter",
        f"chronocampus_log_write_failures_total {data['write_failures']}",
        "# HELP chronocampus_http_request_duration_seconds HTTP response duration by method, route template and status.",
        "# TYPE chronocampus_http_request_duration_seconds histogram",
    ]
    for row in data["items"]:
        labels = ",".join(
            f"{key}={json.dumps(str(row[key]))}"
            for key in ("method", "route", "status")
        )
        for bound, count in zip(BUCKETS, row["buckets"]):
            lines.append(
                f'chronocampus_http_request_duration_seconds_bucket{{{labels},le="{bound}"}} {count}'
            )
        lines.extend(
            [
                f'chronocampus_http_request_duration_seconds_bucket{{{labels},le="+Inf"}} {row["count"]}',
                f"chronocampus_http_request_duration_seconds_count{{{labels}}} {row['count']}",
                f"chronocampus_http_request_duration_seconds_sum{{{labels}}} {row['seconds']:.6f}",
            ]
        )
    process = process_stats()
    lines.extend(
        [
            "# HELP chronocampus_process_cpu_seconds_total User and system CPU time consumed by the API process.",
            "# TYPE chronocampus_process_cpu_seconds_total counter",
            f"chronocampus_process_cpu_seconds_total {process['cpu_seconds']}",
        ]
    )
    if process["memory_rss_bytes"] is not None:
        lines.extend(
            [
                "# HELP chronocampus_process_memory_bytes Resident memory of the API process.",
                "# TYPE chronocampus_process_memory_bytes gauge",
                f"chronocampus_process_memory_bytes {process['memory_rss_bytes']}",
            ]
        )
    for suffix, value, description in (
        (
            "total",
            process["database_queries"]["count"],
            "SQL cursor executions and connection errors observed in this process.",
        ),
        (
            "errors_total",
            process["database_queries"]["errors"],
            "SQL execution and connection errors observed in this process.",
        ),
        (
            "seconds_total",
            process["database_queries"]["seconds"],
            "Cumulative observed SQL cursor execution time.",
        ),
    ):
        lines.extend(
            [
                f"# HELP chronocampus_database_queries_{suffix} {description}",
                f"# TYPE chronocampus_database_queries_{suffix} counter",
                f"chronocampus_database_queries_{suffix} {value}",
            ]
        )
    return "\n".join(lines) + "\n"


class RequestTelemetry:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        identifier = uuid4().hex
        token = request_id_var.set(identifier)
        scope.setdefault("state", {})["request_id"] = identifier
        begin, status, sent = time.perf_counter(), 500, False

        async def observed(message):
            nonlocal status, sent
            if message["type"] == "http.response.start":
                status, sent = message["status"], True
                headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() != b"x-request-id"
                ]
                message = {
                    **message,
                    "headers": headers + [(b"x-request-id", identifier.encode())],
                }
            await send(message)

        try:
            await self.app(scope, receive, observed)
        except Exception as error:
            exception_event("request.unhandled", error)
            if not sent:
                from starlette.responses import JSONResponse

                await JSONResponse({"detail": "internal_error"}, status_code=500)(
                    scope, receive, observed
                )
            # Avoid an additional unsanitized traceback from the server error middleware.
        finally:
            elapsed = time.perf_counter() - begin
            route = getattr(scope.get("route"), "path", "unmatched")
            if (
                route != "unmatched"
                and scope["path"].startswith("/api/")
                and not route.startswith("/api/")
            ):
                route = "/api" + route
            method = (
                scope["method"]
                if scope["method"]
                in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
                else "OTHER"
            )
            request_finished(method, route, status, elapsed)
            # Diagnostic polling remains in metrics, without filling the event buffer.
            polling = (
                route.startswith("/api/admin/diagnostics")
                or route.startswith("/api/admin/schedule/runs")
                or route in {"/api/health", "/api/ready"}
            )
            debug_poll = polling and _logger.isEnabledFor(logging.DEBUG)
            if status >= 400 or elapsed >= 1 or not polling or debug_poll:
                emit(
                    "http.request",
                    "ERROR"
                    if status >= 500
                    else "WARNING"
                    if status >= 400 or elapsed >= 1
                    else "DEBUG"
                    if debug_poll
                    else "INFO",
                    method=method,
                    route=route,
                    status=status,
                    duration_ms=round(elapsed * 1000, 2),
                )
            request_id_var.reset(token)
