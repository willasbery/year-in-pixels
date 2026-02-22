from __future__ import annotations

from typing import Any

from fastapi import Request

from ..auth import require_auth
from ..config import PUBLIC_BASE_URL
from ..db import get_conn
from ..utils import create_opaque_token, now_iso


def build_wallpaper_url(request: Request, token: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL.rstrip('/')}/w/{token}"

    scheme = request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/w/{token}"


def get_token(request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        token_row = conn.execute("SELECT wallpaper_token FROM users WHERE id = %s", (user["id"],)).fetchone()
        token = str(token_row["wallpaper_token"]) if token_row is not None else user["wallpaperToken"]

    return {"token": token, "url": build_wallpaper_url(request, token)}


def rotate_token(request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        timestamp = now_iso()
        new_token: str | None = None

        for _ in range(5):
            candidate = create_opaque_token(32)
            updated = conn.execute(
                """
                UPDATE users
                SET wallpaper_token = %s, updated_at = %s
                WHERE id = %s
                  AND NOT EXISTS (
                    SELECT 1 FROM users
                    WHERE wallpaper_token = %s AND id <> %s
                  )
                """,
                (candidate, timestamp, user["id"], candidate, user["id"]),
            )
            if updated.rowcount == 1:
                new_token = candidate
                break

        if new_token is None:
            raise RuntimeError("Could not generate a unique wallpaper token.")

    return {"token": new_token, "url": build_wallpaper_url(request, new_token)}
