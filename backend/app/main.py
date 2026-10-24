from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.academics.router import router as academics_router
from app.accounts.router import router as accounts_router
from app.api.groups import router as groups_router
from app.core.config import get_settings
from app.db.session import get_engine
from app.feedback.router import router as feedback_router
from app.notes.router import router as notes_router
from app.observability import telemetry
from app.observability.router import client_router, database_probe
from app.observability.router import router as diagnostics_router
from app.scheduling.router import router as scheduling_router
from app.scheduling.queries import router as schedule_queries_router


@asynccontextmanager
async def lifespan(app):
    telemetry.configure(get_settings())
    telemetry.emit("application.started")
    yield
    telemetry.emit("application.stopped")


app = FastAPI(title="ChronoCampus API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(telemetry.RequestTelemetry)
app.include_router(groups_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(academics_router, prefix="/api")
app.include_router(schedule_queries_router, prefix="/api")
app.include_router(scheduling_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")
app.include_router(diagnostics_router, prefix="/api")
app.include_router(client_router, prefix="/api")


@app.exception_handler(IntegrityError)
def integrity_error(request: Request, error: IntegrityError):
    telemetry.emit("database.conflict", "WARNING")
    return JSONResponse(status_code=409, content={"detail": "data_conflict"})


@app.exception_handler(DBAPIError)
def database_error(request: Request, error: DBAPIError):
    telemetry.exception_event("database.error", error)
    return JSONResponse(status_code=503, content={"detail": "database_unavailable"})


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, error: RequestValidationError):
    telemetry.emit("request.validation_failed", "WARNING", error_code="invalid_input", count=len(error.errors()))
    errors = [
        {key: value for key, value in item.items() if key not in {"input", "ctx"}}
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


@app.exception_handler(StarletteHTTPException)
async def domain_error(request: Request, error: StarletteHTTPException):
    code = error.detail.get("code") if isinstance(error.detail, dict) else error.detail
    safe_code = code if isinstance(code, str) and code in telemetry.ERROR_CODES else "http_error"
    telemetry.emit("request.rejected", "ERROR" if error.status_code >= 500 else "WARNING",
                   status=error.status_code, error_code=safe_code)
    return await http_exception_handler(request, error)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Process liveness only; /api/ready checks database and required schema."""
    return {"status": "ok"}


@app.get("/api/ready", tags=["health"])
def ready():
    try:
        with Session(get_engine()) as db:
            ok = database_probe(db)["ready"]
    except Exception as error:
        telemetry.exception_event("database.readiness_failed", error)
        ok = False
    return JSONResponse({"status": "ready" if ok else "unavailable"}, status_code=200 if ok else 503)
