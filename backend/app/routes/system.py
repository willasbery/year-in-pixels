from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..utils import now_iso

router = APIRouter()


@router.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "year-in-pixels-fastapi",
        "ok": True,
        "endpoints": [
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
    }


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "timestamp": now_iso()}
