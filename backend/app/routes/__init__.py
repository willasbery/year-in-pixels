from __future__ import annotations

from fastapi import APIRouter

from . import auth, moods, system, theme, token, wallpaper

router = APIRouter()
router.include_router(system.router)
router.include_router(auth.router)
router.include_router(moods.router)
router.include_router(theme.router)
router.include_router(token.router)
router.include_router(wallpaper.router)

__all__ = ["router"]
