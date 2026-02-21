from __future__ import annotations

from typing import Any, Iterable

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .apple_identity import AppleIdentityVerifier
from .config import (
    ALLOW_INSECURE_APPLE_AUTH,
    APPLE_CLIENT_IDS,
    APPLE_ISSUER,
    APPLE_JWKS_CACHE_TTL_SECONDS,
    APPLE_JWKS_URL,
    APP_ENV,
    AUTH_RATE_LIMIT_BLOCK_SECONDS,
    AUTH_RATE_LIMIT_MAX_REQUESTS,
    AUTH_RATE_LIMIT_WINDOW_SECONDS,
    CORS_ALLOW_ORIGINS,
    DATABASE_URL,
    DEV_BEARER_TOKEN,
    SESSION_ROTATE_INTERVAL_SECONDS,
    SESSION_TTL_SECONDS,
)
from .db import configure_db, ensure_dev_session, get_conn, init_db, prune_expired_sessions
from .rate_limiter import InMemoryRateLimiter
from .routes import router


def _dedupe_keep_order(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return tuple(deduped)


def _resolve_cors_allow_origins(*, app_env: str, configured: Iterable[str]) -> tuple[str, ...]:
    resolved = _dedupe_keep_order(configured)
    if resolved:
        return resolved
    if app_env == "local":
        return ("*",)
    return ()


def create_app(
    dev_bearer_token: str | None = None,
    database_url: str | None = None,
    app_env: str | None = None,
    cors_allow_origins: tuple[str, ...] | None = None,
    allow_insecure_apple_auth: bool | None = None,
    apple_client_ids: tuple[str, ...] | None = None,
    session_ttl_seconds: int | None = None,
    session_rotate_interval_seconds: int | None = None,
    auth_rate_limit_max_requests: int | None = None,
    auth_rate_limit_window_seconds: int | None = None,
    auth_rate_limit_block_seconds: int | None = None,
) -> FastAPI:
    app = FastAPI(title="Year in Pixels API", version="0.1.0")
    resolved_app_env = (app_env or APP_ENV).strip().lower() or "local"
    resolved_database_url = (database_url or DATABASE_URL).strip()
    if not resolved_database_url:
        raise RuntimeError("DATABASE_URL is required and must point to Neon/Postgres.")

    resolved_dev_bearer_token = (
        (dev_bearer_token or DEV_BEARER_TOKEN).strip() if resolved_app_env != "production" else ""
    )

    resolved_cors_allow_origins = _resolve_cors_allow_origins(
        app_env=resolved_app_env,
        configured=cors_allow_origins if cors_allow_origins is not None else CORS_ALLOW_ORIGINS,
    )
    if resolved_app_env != "local":
        if not resolved_cors_allow_origins:
            raise RuntimeError("CORS_ALLOW_ORIGINS is required outside local environments.")
        if "*" in resolved_cors_allow_origins:
            raise RuntimeError("CORS_ALLOW_ORIGINS may not include '*' outside local environments.")

    resolved_allow_insecure_apple_auth = (
        ALLOW_INSECURE_APPLE_AUTH if allow_insecure_apple_auth is None else allow_insecure_apple_auth
    )
    if resolved_app_env == "production":
        resolved_allow_insecure_apple_auth = False

    resolved_apple_client_ids = _dedupe_keep_order(apple_client_ids if apple_client_ids is not None else APPLE_CLIENT_IDS)
    if not resolved_allow_insecure_apple_auth and not resolved_apple_client_ids:
        raise RuntimeError("APPLE_CLIENT_IDS is required when Apple identity token verification is enabled.")

    resolved_session_ttl_seconds = max(300, int(session_ttl_seconds or SESSION_TTL_SECONDS))
    resolved_session_rotate_interval_seconds = max(
        60,
        int(session_rotate_interval_seconds or SESSION_ROTATE_INTERVAL_SECONDS),
    )
    resolved_auth_rate_limit_max_requests = max(1, int(auth_rate_limit_max_requests or AUTH_RATE_LIMIT_MAX_REQUESTS))
    resolved_auth_rate_limit_window_seconds = max(1, int(auth_rate_limit_window_seconds or AUTH_RATE_LIMIT_WINDOW_SECONDS))
    resolved_auth_rate_limit_block_seconds = max(1, int(auth_rate_limit_block_seconds or AUTH_RATE_LIMIT_BLOCK_SECONDS))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_cors_allow_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_rotated_session_headers(request: Request, call_next):
        response = await call_next(request)
        refreshed_token = getattr(request.state, "refreshed_session_token", None)
        if isinstance(refreshed_token, str) and refreshed_token:
            response.headers["X-Session-Token"] = refreshed_token
            refreshed_expires_at = getattr(request.state, "refreshed_session_expires_at", None)
            if isinstance(refreshed_expires_at, str) and refreshed_expires_at:
                response.headers["X-Session-Expires-At"] = refreshed_expires_at
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException):
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": message, "message": message},
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, __: Exception):
        message = "Unexpected server error."
        return JSONResponse(status_code=500, content={"error": message, "message": message})

    configure_db(resolved_database_url)
    init_db(resolved_database_url)
    with get_conn(resolved_database_url) as conn:
        prune_expired_sessions(conn)
        ensure_dev_session(
            conn,
            resolved_dev_bearer_token,
            session_ttl_seconds=resolved_session_ttl_seconds,
        )

    app.state.app_env = resolved_app_env
    app.state.database_url = resolved_database_url
    app.state.dev_bearer_token = resolved_dev_bearer_token
    app.state.allow_insecure_apple_auth = bool(resolved_allow_insecure_apple_auth)
    app.state.apple_client_ids = resolved_apple_client_ids
    app.state.session_ttl_seconds = resolved_session_ttl_seconds
    app.state.session_rotate_interval_seconds = resolved_session_rotate_interval_seconds
    app.state.auth_rate_limit_max_requests = resolved_auth_rate_limit_max_requests
    app.state.auth_rate_limit_window_seconds = resolved_auth_rate_limit_window_seconds
    app.state.auth_rate_limit_block_seconds = resolved_auth_rate_limit_block_seconds
    app.state.rate_limiter = InMemoryRateLimiter()
    app.state.apple_identity_verifier = (
        None
        if resolved_allow_insecure_apple_auth
        else AppleIdentityVerifier(
            jwks_url=APPLE_JWKS_URL,
            issuer=APPLE_ISSUER,
            client_ids=resolved_apple_client_ids,
            cache_ttl_seconds=APPLE_JWKS_CACHE_TTL_SECONDS,
        )
    )
    app.include_router(router)

    return app


_app_instance: FastAPI | None = None


def get_app() -> FastAPI:
    global _app_instance
    if _app_instance is None:
        _app_instance = create_app()
    return _app_instance


class _LazyASGIApp:
    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        await get_app()(scope, receive, send)

    def __getattr__(self, name: str) -> Any:
        return getattr(get_app(), name)


app = _LazyASGIApp()
