from __future__ import annotations

import datetime as dt
import secrets
from typing import Any

from .constants import DATE_KEY_FORMAT


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).isoformat()


def create_opaque_token(num_bytes: int = 32) -> str:
    return secrets.token_urlsafe(num_bytes)


def normalize_hex_color(value: Any, fallback: str | None) -> str | None:
    if not isinstance(value, str):
        return fallback

    trimmed = value.strip()
    if len(trimmed) == 7 and trimmed.startswith("#"):
        candidate = trimmed[1:]
    elif len(trimmed) == 6:
        candidate = trimmed
    else:
        return fallback

    if any(ch not in "0123456789abcdefABCDEF" for ch in candidate):
        return fallback

    return f"#{candidate.lower()}"


def parse_date_key(date_key: str) -> dt.date | None:
    try:
        parsed = dt.date.fromisoformat(date_key)
    except ValueError:
        return None

    if parsed.strftime(DATE_KEY_FORMAT) != date_key:
        return None

    return parsed
