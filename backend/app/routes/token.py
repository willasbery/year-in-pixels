from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Request

from ..auth import require_auth
from ..config import PUBLIC_BASE_URL
from ..db import get_conn
from ..utils import create_opaque_token, now_iso

router = APIRouter()


def build_wallpaper_url(request: Request, token: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL.rstrip('/')}/w/{token}"

    scheme = request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/w/{token}"


@router.get("/token")
async def get_token(request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        token_row = conn.execute("SELECT wallpaper_token FROM users WHERE id = ?", (user["id"],)).fetchone()
        token = str(token_row["wallpaper_token"]) if token_row is not None else user["wallpaperToken"]

    return {"token": token, "url": build_wallpaper_url(request, token)}


@router.post("/token/rotate")
async def rotate_token(request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        timestamp = now_iso()
        new_token: str | None = None

        for _ in range(5):
            candidate = create_opaque_token(32)
            try:
                conn.execute(
                    "UPDATE users SET wallpaper_token = ?, updated_at = ? WHERE id = ?",
                    (candidate, timestamp, user["id"]),
                )
                new_token = candidate
                break
            except sqlite3.IntegrityError:
                continue

        if new_token is None:
            raise RuntimeError("Could not generate a unique wallpaper token.")

    return {"token": new_token, "url": build_wallpaper_url(request, new_token)}
