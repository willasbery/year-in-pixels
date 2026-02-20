from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

VALID_APP_ENVS = {"local", "staging", "production"}


def _normalize_app_env(value: str | None) -> str:
    raw = (value or "local").strip().lower()
    if raw in VALID_APP_ENVS:
        return raw
    raise ValueError(f"Invalid APP_ENV {raw!r}. Expected one of: local, staging, production.")


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _parse_int(value: str | None, default: int, *, minimum: int) -> int:
    if value is None:
        return default

    try:
        parsed = int(value.strip())
    except (TypeError, ValueError):
        return default

    return parsed if parsed >= minimum else default


def _split_csv(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    parts = [entry.strip() for entry in value.split(",")]
    return tuple(entry for entry in parts if entry)


def _dedupe_keep_order(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduped.append(value)
    return tuple(deduped)


APP_ENV = _normalize_app_env(os.getenv("APP_ENV"))
IS_PRODUCTION = APP_ENV == "production"

PORT = int(os.getenv("PORT", "3000"))
DATA_PATH = Path(__file__).resolve().parents[1] / "data.json"
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if DATABASE_URL.startswith("sqlite:///"):
    DATABASE_PATH = Path(DATABASE_URL.removeprefix("sqlite:///")).expanduser()
elif DATABASE_URL:
    DATABASE_PATH = Path(DATABASE_URL).expanduser()
else:
    DATABASE_PATH = Path(__file__).resolve().parents[1] / "data.db"

DEFAULT_DEV_BEARER_TOKEN = "cheese" if APP_ENV == "local" else ""
DEV_BEARER_TOKEN = (
    (os.getenv("EXPO_PUBLIC_DEV_BEARER_TOKEN") or os.getenv("DEV_BEARER_TOKEN") or DEFAULT_DEV_BEARER_TOKEN).strip()
    if not IS_PRODUCTION
    else ""
)

ALLOW_INSECURE_APPLE_AUTH = _parse_bool(
    os.getenv("ALLOW_INSECURE_APPLE_AUTH"),
    default=APP_ENV == "local",
)
APPLE_CLIENT_IDS = _dedupe_keep_order(_split_csv(os.getenv("APPLE_CLIENT_IDS")))
APPLE_JWKS_URL = (os.getenv("APPLE_JWKS_URL") or "https://appleid.apple.com/auth/keys").strip()
APPLE_ISSUER = (os.getenv("APPLE_ISSUER") or "https://appleid.apple.com").strip()
APPLE_JWKS_CACHE_TTL_SECONDS = _parse_int(os.getenv("APPLE_JWKS_CACHE_TTL_SECONDS"), default=3600, minimum=60)

SESSION_TTL_SECONDS = _parse_int(os.getenv("SESSION_TTL_SECONDS"), default=60 * 60 * 24 * 30, minimum=300)
SESSION_ROTATE_INTERVAL_SECONDS = _parse_int(
    os.getenv("SESSION_ROTATE_INTERVAL_SECONDS"),
    default=60 * 60 * 24,
    minimum=60,
)

AUTH_RATE_LIMIT_MAX_REQUESTS = _parse_int(os.getenv("AUTH_RATE_LIMIT_MAX_REQUESTS"), default=30, minimum=1)
AUTH_RATE_LIMIT_WINDOW_SECONDS = _parse_int(os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS"), default=60, minimum=1)
AUTH_RATE_LIMIT_BLOCK_SECONDS = _parse_int(os.getenv("AUTH_RATE_LIMIT_BLOCK_SECONDS"), default=300, minimum=1)

CORS_ALLOW_ORIGINS = _dedupe_keep_order(_split_csv(os.getenv("CORS_ALLOW_ORIGINS")))
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").strip()
