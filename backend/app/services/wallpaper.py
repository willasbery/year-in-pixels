from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from ..cache import get_cached_wallpaper, set_cached_wallpaper
from ..db import get_conn, get_theme
from ..theme import apply_theme_patch
from ..wallpaper import render_wallpaper_png


def get_user_for_wallpaper_token(conn: Any, token: str) -> tuple[str, str]:
    user_row = conn.execute(
        "SELECT id, updated_at FROM users WHERE wallpaper_token = %s",
        (token,),
    ).fetchone()
    if user_row is None:
        raise HTTPException(status_code=404, detail="Wallpaper token not found.")
    return (str(user_row["id"]), str(user_row["updated_at"]))


def get_moods_for_user(conn: Any, user_id: str) -> dict[str, dict[str, object]]:
    mood_rows = conn.execute(
        "SELECT date_key, level, note FROM moods WHERE user_id = %s",
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
    return moods


def build_preview_theme_patch(query_params: Any) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    for key in ("avoid_lock_screen_ui", "avoidLockScreenUi", "columns", "gridColumns"):
        value = query_params.get(key)
        if value is not None:
            patch[key] = value
    return patch


def get_wallpaper_png(token: str) -> bytes:
    with get_conn() as conn:
        user_id, source_revision = get_user_for_wallpaper_token(conn, token)

        cached = get_cached_wallpaper(user_id, source_revision)
        if cached is not None:
            return cached

        theme = get_theme(conn, user_id)
        moods = get_moods_for_user(conn, user_id)

    png_bytes = render_wallpaper_png({"theme": theme, "moods": moods})
    set_cached_wallpaper(user_id, source_revision, png_bytes)
    return png_bytes


def get_wallpaper_preview_png(token: str, preview_patch: dict[str, Any]) -> bytes:
    with get_conn() as conn:
        user_id, _ = get_user_for_wallpaper_token(conn, token)
        theme = get_theme(conn, user_id)
        if preview_patch:
            theme = apply_theme_patch(theme, preview_patch)
        moods = get_moods_for_user(conn, user_id)

    return render_wallpaper_png({"theme": theme, "moods": moods})
