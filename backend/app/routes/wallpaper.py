from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..cache import get_cached_wallpaper, set_cached_wallpaper
from ..db import get_conn, get_theme
from ..wallpaper import render_wallpaper_png

router = APIRouter()

_CACHE_HEADERS = {
    # Keep server-side in-memory caching, but prevent clients/proxies from
    # reusing stale wallpaper bytes after a theme/mood update.
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@router.get("/w/{token}")
async def wallpaper(token: str, request: Request) -> Response:
    with get_conn() as conn:
        user_row = conn.execute(
            "SELECT id, updated_at FROM users WHERE wallpaper_token = ?",
            (token,),
        ).fetchone()
        if user_row is None:
            raise HTTPException(status_code=404, detail="Wallpaper token not found.")
        user_id = str(user_row["id"])
        source_revision = str(user_row["updated_at"])

    cached = get_cached_wallpaper(user_id, source_revision)
    if cached is not None:
        return Response(content=cached, media_type="image/png", headers=_CACHE_HEADERS)

    with get_conn() as conn:
        theme = get_theme(conn, user_id)
        mood_rows = conn.execute(
            "SELECT date_key, level, note FROM moods WHERE user_id = ?",
            (user_id,),
        ).fetchall()

    moods: dict[str, dict[str, object]] = {}
    for row in mood_rows:
        date_key = str(row["date_key"])
        mood: dict[str, object] = {"level": int(row["level"])}
        note = row["note"]
        if isinstance(note, str) and note.strip():
            mood["note"] = note.strip()
        moods[date_key] = mood

    png_bytes = render_wallpaper_png({"theme": theme, "moods": moods})
    set_cached_wallpaper(user_id, source_revision, png_bytes)
    return Response(content=png_bytes, media_type="image/png", headers=_CACHE_HEADERS)
