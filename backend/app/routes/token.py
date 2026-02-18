from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from ..auth import require_auth
from ..config import PUBLIC_BASE_URL
from ..utils import create_opaque_token, now_iso

router = APIRouter()


def build_wallpaper_url(request: Request, token: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL.rstrip('/')}/w/{token}"

    scheme = request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/w/{token}"


@router.get("/token")
async def get_token(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)
    token = user["wallpaperToken"]
    return {"token": token, "url": build_wallpaper_url(request, token)}


@router.post("/token/rotate")
async def rotate_token(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)
    store = request.app.state.store

    with store.lock:
        old_token = user["wallpaperToken"]
        store.state["wallpaperTokens"].pop(old_token, None)

        new_token = create_opaque_token(32)
        user["wallpaperToken"] = new_token
        user["updatedAt"] = now_iso()
        store.state["wallpaperTokens"][new_token] = user["id"]
        store.save()

    return {"token": new_token, "url": build_wallpaper_url(request, new_token)}
