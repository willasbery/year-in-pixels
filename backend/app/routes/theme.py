from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas.theme import ThemePatchRequest, ThemeResponse
from ..services import theme as theme_service

router = APIRouter()


@router.get("/theme", response_model=ThemeResponse)
async def get_theme(request: Request) -> ThemeResponse:
    return ThemeResponse.model_validate(await theme_service.get_theme(request))


@router.put("/theme", response_model=ThemeResponse)
async def put_theme(payload: ThemePatchRequest, request: Request) -> ThemeResponse:
    return ThemeResponse.model_validate(await theme_service.put_theme(payload.to_patch_payload(), request))
