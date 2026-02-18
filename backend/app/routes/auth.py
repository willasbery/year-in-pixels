from __future__ import annotations

import hashlib
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..auth import require_auth
from ..utils import create_opaque_token, now_iso

router = APIRouter()


@router.post("/auth/apple")
async def auth_apple(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    identity_token = payload.get("identityToken", payload.get("idToken"))
    if not isinstance(identity_token, str) or not identity_token.strip():
        raise HTTPException(status_code=400, detail="identityToken is required.")

    apple_sub = f"apple_{hashlib.sha256(identity_token.encode('utf-8')).hexdigest()[:24]}"
    store = request.app.state.store

    with store.lock:
        user = store.find_user_by_apple_sub(apple_sub)
        if not user:
            user = store.create_user_locked(apple_sub)

        access_token = create_opaque_token(24)
        store.state["sessions"][access_token] = user["id"]
        user["updatedAt"] = now_iso()
        store.save()

        return {
            "accessToken": access_token,
            "userId": user["id"],
            "expiresAt": None,
        }


@router.delete("/auth/session", status_code=204)
async def delete_session(request: Request) -> Response:
    token, user = require_auth(request)
    store = request.app.state.store

    with store.lock:
        if token != store.dev_bearer_token:
            store.state["sessions"].pop(token, None)
            user["updatedAt"] = now_iso()
            store.save()
    return Response(status_code=204)
