from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..schemas.auth import AppleAuthRequest, AuthSessionResponse
from ..services import auth as auth_service

router = APIRouter()


@router.post("/auth/apple", response_model=AuthSessionResponse)
def auth_apple(payload: AppleAuthRequest, request: Request) -> AuthSessionResponse:
    auth_service.enforce_auth_rate_limit(request)

    identity_token = payload.resolved_identity_token()
    if identity_token is None:
        raise HTTPException(status_code=400, detail="identityToken is required.")

    return AuthSessionResponse.model_validate(auth_service.auth_apple(request, identity_token))


@router.delete("/auth/session", status_code=204)
def delete_session(request: Request) -> Response:
    auth_service.delete_session(request)
    return Response(status_code=204)


@router.post("/auth/session/refresh", response_model=AuthSessionResponse)
def refresh_session(request: Request) -> AuthSessionResponse:
    return AuthSessionResponse.model_validate(auth_service.refresh_session(request))
