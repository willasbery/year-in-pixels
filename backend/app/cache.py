from __future__ import annotations

import datetime as dt

# user_id -> (render_date, source_revision, png_bytes)
# render_date handles midnight rollover and source_revision tracks when theme/moods
# changed (users.updated_at) so stale per-process cache entries are rejected.
_cache: dict[str, tuple[dt.date, str, bytes]] = {}


def get_cached_wallpaper(user_id: str, source_revision: str) -> bytes | None:
    entry = _cache.get(user_id)
    if entry is None:
        return None
    render_date, cached_revision, png_bytes = entry
    if render_date != dt.date.today():
        return None
    if cached_revision != source_revision:
        return None
    return png_bytes


def set_cached_wallpaper(user_id: str, source_revision: str, png_bytes: bytes) -> None:
    _cache[user_id] = (dt.date.today(), source_revision, png_bytes)


def invalidate_wallpaper_cache(user_id: str) -> None:
    _cache.pop(user_id, None)
