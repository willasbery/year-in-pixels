from __future__ import annotations

from fastapi import APIRouter

from ..schemas.system import HealthResponse, RootResponse
from ..utils import now_iso

router = APIRouter()


@router.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    return RootResponse(
        name="year-in-pixels-fastapi",
        ok=True,
        endpoints=[
            "POST /auth/apple",
            "DELETE /auth/session",
            "POST /auth/session/refresh",
            "GET /moods?year=YYYY",
            "PUT /moods/{date}",
            "DELETE /moods/{date}",
            "GET /theme",
            "PUT /theme",
            "GET /token",
            "POST /token/rotate",
            "GET /w/{token}",
            "GET /w/{token}/preview",
            "GET /health",
        ],
    )


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, timestamp=now_iso())
