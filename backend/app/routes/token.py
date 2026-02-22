from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas.token import TokenResponse
from ..services import token as token_service

router = APIRouter()


def build_wallpaper_url(request: Request, token: str) -> str:
    return token_service.build_wallpaper_url(request, token)


@router.get("/token", response_model=TokenResponse)
def get_token(request: Request) -> TokenResponse:
    return TokenResponse.model_validate(token_service.get_token(request))


@router.post("/token/rotate", response_model=TokenResponse)
def rotate_token(request: Request) -> TokenResponse:
    return TokenResponse.model_validate(token_service.rotate_token(request))
