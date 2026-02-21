from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..auth import require_auth
from ..cache import invalidate_wallpaper_cache
from ..db import get_conn
from ..utils import now_iso, parse_date_key

router = APIRouter()


@router.get("/moods")
def get_moods(year: int, request: Request) -> dict[str, Any]:
    if year < 2000 or year > 3000:
        raise HTTPException(status_code=400, detail="A valid ?year=YYYY query is required.")

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

    return {"moods": moods}


@router.put("/moods/{date_key}")
def put_mood(date_key: str, payload: dict[str, Any], request: Request) -> dict[str, Any]:
    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    level = payload.get("level")
    if not isinstance(level, int) or level < 1 or level > 5:
        raise HTTPException(status_code=400, detail="level must be an integer from 1 to 5.")

    note_raw = payload.get("note")
    note = note_raw.strip()[:240] if isinstance(note_raw, str) and note_raw.strip() else None

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


@router.delete("/moods/{date_key}", status_code=204)
def remove_mood(date_key: str, request: Request) -> Response:
    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    with get_conn() as conn:
        _, user = require_auth(conn, request)
        user_id = user["id"]
        timestamp = now_iso()
        conn.execute("DELETE FROM moods WHERE user_id = %s AND date_key = %s", (user_id, date_key))
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (timestamp, user_id))

    invalidate_wallpaper_cache(user_id)
    return Response(status_code=204)
