from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from ..auth import require_auth
from ..theme import apply_theme_patch, clone_default_theme, serialize_theme
from ..utils import now_iso

router = APIRouter()


@router.get("/theme")
async def get_theme(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)
    theme = user.get("theme") if isinstance(user.get("theme"), dict) else clone_default_theme()
    return serialize_theme(theme)


@router.put("/theme")
async def put_theme(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    store = request.app.state.store
    with store.lock:
        current_theme = user.get("theme") if isinstance(user.get("theme"), dict) else clone_default_theme()
        next_theme = apply_theme_patch(current_theme, payload if isinstance(payload, dict) else {})
        user["theme"] = next_theme
        user["updatedAt"] = now_iso()
        store.save()

    return serialize_theme(next_theme)
