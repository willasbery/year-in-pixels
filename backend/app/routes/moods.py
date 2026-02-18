from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..auth import require_auth
from ..utils import now_iso, parse_date_key

router = APIRouter()


@router.get("/moods")
async def get_moods(year: int, request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    if year < 2000 or year > 3000:
        raise HTTPException(status_code=400, detail="A valid ?year=YYYY query is required.")

    moods_raw = user.get("moods") if isinstance(user.get("moods"), dict) else {}
    moods: list[dict[str, Any]] = []

    for date_key, mood in moods_raw.items():
        if not isinstance(date_key, str) or not date_key.startswith(f"{year}-"):
            continue
        if not isinstance(mood, dict):
            continue

        level = mood.get("level")
        if not isinstance(level, int) or level < 1 or level > 5:
            continue

        row: dict[str, Any] = {"date": date_key, "level": level}
        note = mood.get("note")
        if isinstance(note, str) and note.strip():
            row["note"] = note.strip()
        moods.append(row)

    moods.sort(key=lambda row: row["date"])
    return {"moods": moods}


@router.put("/moods/{date_key}")
async def put_mood(date_key: str, payload: dict[str, Any], request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    level = payload.get("level")
    if not isinstance(level, int) or level < 1 or level > 5:
        raise HTTPException(status_code=400, detail="level must be an integer from 1 to 5.")

    note_raw = payload.get("note")
    note = note_raw.strip()[:240] if isinstance(note_raw, str) and note_raw.strip() else None

    mood: dict[str, Any] = {"level": level}
    if note:
        mood["note"] = note

    store = request.app.state.store
    with store.lock:
        user.setdefault("moods", {})[date_key] = mood
        user["updatedAt"] = now_iso()
        store.save()

    response: dict[str, Any] = {"date": date_key, "level": level}
    if note:
        response["note"] = note
    return response


@router.delete("/moods/{date_key}", status_code=204)
async def remove_mood(date_key: str, request: Request) -> Response:
    _, user = require_auth(request)

    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    store = request.app.state.store
    with store.lock:
        moods = user.setdefault("moods", {})
        if isinstance(moods, dict):
            moods.pop(date_key, None)
        user["updatedAt"] = now_iso()
        store.save()

    return Response(status_code=204)
