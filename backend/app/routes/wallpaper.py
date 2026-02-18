from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..wallpaper import render_wallpaper_png

router = APIRouter()


@router.get("/w/{token}")
async def wallpaper(token: str, request: Request) -> Response:
    store = request.app.state.store

    with store.lock:
        user = store.get_user_by_wallpaper_token(token)
        if not user:
            raise HTTPException(status_code=404, detail="Wallpaper token not found.")
        png_bytes = render_wallpaper_png(user)

    return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=60"})
