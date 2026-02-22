from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import Response

from ..services import wallpaper as wallpaper_service

router = APIRouter()

_CACHE_HEADERS = {
    # Keep server-side in-memory caching, but prevent clients/proxies from
    # reusing stale wallpaper bytes after a theme/mood update.
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@router.get("/w/{token}")
def wallpaper(token: str) -> Response:
    png_bytes = wallpaper_service.get_wallpaper_png(token)
    return Response(content=png_bytes, media_type="image/png", headers=_CACHE_HEADERS)


@router.get("/w/{token}/preview")
def wallpaper_preview(token: str, request: Request) -> Response:
    preview_patch = wallpaper_service.build_preview_theme_patch(request.query_params)
    png_bytes = wallpaper_service.get_wallpaper_preview_png(token, preview_patch)
    return Response(content=png_bytes, media_type="image/png", headers=_CACHE_HEADERS)
