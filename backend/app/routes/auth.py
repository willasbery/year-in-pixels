from __future__ import annotations

import hashlib
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..auth import require_auth
from ..db import create_session, create_user, get_conn, rotate_session
from ..rate_limiter import get_client_ip
from ..utils import now_iso

router = APIRouter()


def _resolve_apple_subject(request: Request, identity_token: str) -> str:
    if getattr(request.app.state, "allow_insecure_apple_auth", False):
        return f"apple_dev_{hashlib.sha256(identity_token.encode('utf-8')).hexdigest()[:24]}"

    verifier = getattr(request.app.state, "apple_identity_verifier", None)
    if verifier is None:
        raise HTTPException(status_code=500, detail="Apple identity verifier is not configured.")

    try:
        claims = verifier.verify_identity_token(identity_token)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error

    return f"apple_{claims.subject}"


def _enforce_auth_rate_limit(request: Request) -> None:
    limiter = request.app.state.rate_limiter
    result = limiter.check(
        key=f"auth:apple:{get_client_ip(request)}",
        limit=request.app.state.auth_rate_limit_max_requests,
        window_seconds=request.app.state.auth_rate_limit_window_seconds,
        block_seconds=request.app.state.auth_rate_limit_block_seconds,
    )
    if result.allowed:
        return

    retry_after = result.retry_after_seconds or 1
    raise HTTPException(
        status_code=429,
        detail="Too many sign-in attempts. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


@router.post("/auth/apple")
def auth_apple(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    _enforce_auth_rate_limit(request)

    identity_token = payload.get("identityToken", payload.get("idToken"))
    if not isinstance(identity_token, str) or not identity_token.strip():
        raise HTTPException(status_code=400, detail="identityToken is required.")

    apple_sub = _resolve_apple_subject(request, identity_token.strip())

    with get_conn() as conn:
        user_row = conn.execute("SELECT id FROM users WHERE apple_sub = %s", (apple_sub,)).fetchone()
        if user_row is None:
            user_id = create_user(conn, apple_sub)
        else:
            user_id = str(user_row["id"])

        access_token, expires_at = create_session(
            conn,
            user_id,
            session_ttl_seconds=request.app.state.session_ttl_seconds,
        )
        timestamp = now_iso()
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (timestamp, user_id))

    return {
        "accessToken": access_token,
        "userId": user_id,
        "expiresAt": expires_at,
    }


@router.delete("/auth/session", status_code=204)
def delete_session(request: Request) -> Response:
    request.state.disable_session_rotation = True
    with get_conn() as conn:
        token, user = require_auth(conn, request)
        if token != request.app.state.dev_bearer_token:
            conn.execute("DELETE FROM sessions WHERE token = %s", (token,))
            conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (now_iso(), user["id"]))

    return Response(status_code=204)


@router.post("/auth/session/refresh")
def refresh_session(request: Request) -> dict[str, Any]:
    request.state.disable_session_rotation = True
    with get_conn() as conn:
        token, user = require_auth(conn, request)
        if token == request.app.state.dev_bearer_token:
            row = conn.execute("SELECT expires_at FROM sessions WHERE token = %s", (token,)).fetchone()
            expires_at = str(row["expires_at"]) if row is not None else None
            return {
                "accessToken": token,
                "userId": user["id"],
                "expiresAt": expires_at,
            }

        rotated_token, rotated_expires_at = rotate_session(
            conn,
            old_token=token,
            user_id=user["id"],
            session_ttl_seconds=request.app.state.session_ttl_seconds,
        )
        conn.execute("UPDATE users SET updated_at = %s WHERE id = %s", (now_iso(), user["id"]))
        request.state.refreshed_session_token = rotated_token
        request.state.refreshed_session_expires_at = rotated_expires_at

    return {
        "accessToken": rotated_token,
        "userId": user["id"],
        "expiresAt": rotated_expires_at,
    }
