from __future__ import annotations

import datetime as dt

# user_id -> (render_date, png_bytes)
# The render_date lets us detect when the wallpaper is stale due to midnight
# rolling over (today's pixel shifts from "future" to "empty" colour).
_cache: dict[str, tuple[dt.date, bytes]] = {}


def get_cached_wallpaper(user_id: str) -> bytes | None:
    entry = _cache.get(user_id)
    if entry is None:
        return None
    render_date, png_bytes = entry
    if render_date != dt.date.today():
        return None
    return png_bytes


def set_cached_wallpaper(user_id: str, png_bytes: bytes) -> None:
    _cache[user_id] = (dt.date.today(), png_bytes)


def invalidate_wallpaper_cache(user_id: str) -> None:
    _cache.pop(user_id, None)
