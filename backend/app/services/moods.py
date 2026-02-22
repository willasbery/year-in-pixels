from __future__ import annotations

from typing import Any

from fastapi import Request

from ..auth import require_auth
from ..cache import invalidate_wallpaper_cache
from ..db import get_conn
from ..utils import now_iso


def get_moods_for_year(request: Request, year: int) -> list[dict[str, Any]]:
    moods: list[dict[str, Any]] = []
    year_start = f"{year:04d}-01-01"
    year_end = f"{year + 1:04d}-01-01"

    with get_conn() as conn:
        _, user = require_auth(conn, request)
        rows = conn.execute(
            """
            SELECT date_key, level, note
            FROM moods
            WHERE user_id = %s AND date_key >= %s AND date_key < %s
            ORDER BY date_key
            """,
            (user["id"], year_start, year_end),
        ).fetchall()

        for row in rows:
            mood_row: dict[str, Any] = {"date": str(row["date_key"]), "level": int(row["level"])}
            note = row["note"]
            if isinstance(note, str) and note.strip():
                mood_row["note"] = note.strip()
            moods.append(mood_row)

    return moods


def put_mood(request: Request, date_key: str, level: int, note: str | None) -> dict[str, Any]:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        user_id = user["id"]
        timestamp = now_iso()
        conn.execute(
            """
            INSERT INTO moods (user_id, date_key, level, note, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT(user_id, date_key) DO UPDATE SET
                level = excluded.level,
                note = excluded.note,
                updated_at = excluded.updated_at
            """,
            (user_id, date_key, level, note, timestamp),
        )
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (timestamp, user_id))

    invalidate_wallpaper_cache(user_id)
    response: dict[str, Any] = {"date": date_key, "level": level}
    if note:
        response["note"] = note
    return response


def delete_mood(request: Request, date_key: str) -> None:
    with get_conn() as conn:
        _, user = require_auth(conn, request)
        user_id = user["id"]
        timestamp = now_iso()
        conn.execute("DELETE FROM moods WHERE user_id = %s AND date_key = %s", (user_id, date_key))
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (timestamp, user_id))

    invalidate_wallpaper_cache(user_id)
