from __future__ import annotations

import asyncio
from typing import Any

from fastapi import Request

from ..auth import require_auth
from ..cache import invalidate_wallpaper_cache
from ..db import get_conn, get_theme as get_theme_for_user, upsert_theme
from ..theme import apply_theme_patch, serialize_theme
from ..utils import now_iso


def get_theme_sync(request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        theme = get_theme_for_user(conn, user["id"])
    return serialize_theme(theme)


def put_theme_sync(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        user_id = user["id"]
        current_theme = get_theme_for_user(conn, user_id)
        next_theme = apply_theme_patch(current_theme, payload if isinstance(payload, dict) else {})
        timestamp = now_iso()
        upsert_theme(conn, user_id, next_theme, updated_at=timestamp)
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (timestamp, user_id))

    invalidate_wallpaper_cache(user_id)
    return serialize_theme(next_theme)


async def get_theme(request: Request) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: get_theme_sync(request))


async def put_theme(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    loop = asyncio.get_running_loop()
    safe_payload = payload if isinstance(payload, dict) else {}
    return await loop.run_in_executor(None, lambda: put_theme_sync(safe_payload, request))
