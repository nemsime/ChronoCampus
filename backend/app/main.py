from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.api.groups import router as groups_router
from app.core.config import get_settings
from app.accounts.router import router as accounts_router
from app.academics.router import router as academics_router
from app.scheduling.router import router as scheduling_router, recover_runs
from app.db.session import get_engine
from app.notes.router import router as notes_router
from app.feedback.router import router as feedback_router


@asynccontextmanager
async def lifespan(app):
    try:
        recover_runs(get_engine())
    except (DBAPIError, HTTPException):
        logging.getLogger(__name__).warning(
            "Database startup recovery unavailable; apply migrations before generating"
        )
    yield


app = FastAPI(title="ChronoCampus API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
)
app.include_router(groups_router, prefix="/api")
app.include_router(accounts_router, prefix="/api")
app.include_router(academics_router, prefix="/api")
app.include_router(scheduling_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(feedback_router, prefix="/api")


@app.exception_handler(IntegrityError)
def integrity_error(request: Request, error: IntegrityError):
    return JSONResponse(status_code=409, content={"detail": "data_conflict"})


@app.exception_handler(DBAPIError)
def database_error(request: Request, error: DBAPIError):
    return JSONResponse(status_code=503, content={"detail": "database_unavailable"})


@app.exception_handler(RequestValidationError)
def validation_error(request: Request, error: RequestValidationError):
    errors = [
        {key: value for key, value in item.items() if key not in {"input", "ctx"}}
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Process liveness only; /api/groups also checks database access."""
    return {"status": "ok"}
