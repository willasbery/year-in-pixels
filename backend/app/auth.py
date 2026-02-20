from __future__ import annotations

import datetime as dt
import sqlite3
from typing import Any

from fastapi import HTTPException, Request

from .db import rotate_session


def _parse_iso_datetime(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def parse_bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None

    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0] != "Bearer":
        return None

    token = parts[1].strip()
    return token or None


def require_auth(conn: sqlite3.Connection, request: Request) -> tuple[str, dict[str, Any]]:
    token = parse_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    row = conn.execute(
        """
        SELECT
            u.id,
            u.apple_sub,
            u.wallpaper_token,
            u.created_at,
            u.updated_at,
            s.created_at AS session_created_at,
            s.expires_at AS session_expires_at
        FROM sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid session token.")

    now_utc = dt.datetime.now(dt.UTC)
    expires_at = _parse_iso_datetime(row["session_expires_at"])
    if expires_at is None or expires_at <= now_utc:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        raise HTTPException(status_code=401, detail="Session expired. Sign in again.")

    user: dict[str, Any] = {
        "id": str(row["id"]),
        "appleSub": str(row["apple_sub"]),
        "wallpaperToken": str(row["wallpaper_token"]),
        "createdAt": str(row["created_at"]),
        "updatedAt": str(row["updated_at"]),
    }

    rotate_interval_seconds = int(getattr(request.app.state, "session_rotate_interval_seconds", 0) or 0)
    session_ttl_seconds = int(getattr(request.app.state, "session_ttl_seconds", 0) or 0)
    dev_bearer_token = str(getattr(request.app.state, "dev_bearer_token", "") or "")
    disable_rotation = bool(getattr(request.state, "disable_session_rotation", False))
    should_rotate = (
        not disable_rotation
        and rotate_interval_seconds > 0
        and session_ttl_seconds > 0
        and token != dev_bearer_token
    )

    if should_rotate:
        session_created_at = _parse_iso_datetime(row["session_created_at"]) or now_utc
        age_seconds = max(0, int((now_utc - session_created_at).total_seconds()))
        if age_seconds >= rotate_interval_seconds:
            rotated_token, rotated_expires_at = rotate_session(
                conn,
                old_token=token,
                user_id=user["id"],
                session_ttl_seconds=session_ttl_seconds,
            )
            request.state.refreshed_session_token = rotated_token
            request.state.refreshed_session_expires_at = rotated_expires_at
            token = rotated_token

    return token, user
