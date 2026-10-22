from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.groups import router as groups_router
from app.core.config import get_settings

app = FastAPI(title="ChronoCampus API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)
app.include_router(groups_router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    """Process liveness only; /api/groups also checks database access."""
    return {"status": "ok"}
