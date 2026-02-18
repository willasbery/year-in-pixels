from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request


def parse_bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None

    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0] != "Bearer":
        return None

    token = parts[1].strip()
    return token or None


def require_auth(request: Request) -> tuple[str, dict[str, Any]]:
    token = parse_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    store = request.app.state.store
    with store.lock:
        user = store.get_user_by_session(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token.")
        return token, user
