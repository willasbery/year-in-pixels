from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import secrets
import struct
import threading
import uuid
import zlib
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

PORT = int(os.getenv("PORT", "3000"))
DATA_PATH = Path(__file__).resolve().parent / "data.json"
DEV_BEARER_TOKEN = (os.getenv("EXPO_PUBLIC_DEV_BEARER_TOKEN") or "cheese").strip() or "cheese"
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").strip()

DATE_KEY_FORMAT = "%Y-%m-%d"
WALLPAPER_WIDTH = 1290
WALLPAPER_HEIGHT = 2796
GRID_COLUMNS = 53
GRID_ROWS = 7
SIDE_INSET = 72
TOP_INSET_CLOCK = 320
BOTTOM_INSET = 220

DEFAULT_THEME: dict[str, Any] = {
    "bg_color": "#0d1117",
    "mood_colors": {
        "1": "#ef4444",
        "2": "#f97316",
        "3": "#eab308",
        "4": "#22c55e",
        "5": "#3b82f6",
    },
    "empty_color": None,
    "shape": "rounded",
    "spacing": "medium",
    "position": "clock",
    "bg_image_url": None,
}

SPACING_TO_GAP = {
    "tight": 2,
    "medium": 4,
    "wide": 6,
}


def now_iso() -> str:
    return dt.datetime.now(dt.UTC).isoformat()


def clone_default_theme() -> dict[str, Any]:
    return {
        "bg_color": DEFAULT_THEME["bg_color"],
        "mood_colors": dict(DEFAULT_THEME["mood_colors"]),
        "empty_color": DEFAULT_THEME["empty_color"],
        "shape": DEFAULT_THEME["shape"],
        "spacing": DEFAULT_THEME["spacing"],
        "position": DEFAULT_THEME["position"],
        "bg_image_url": DEFAULT_THEME["bg_image_url"],
    }


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


def parse_bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None

    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0] != "Bearer":
        return None

    token = parts[1].strip()
    return token or None


def build_wallpaper_url(request: Request, token: str) -> str:
    if PUBLIC_BASE_URL:
        return f"{PUBLIC_BASE_URL.rstrip('/')}/w/{token}"

    scheme = request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}/w/{token}"


def blend_channel(a: int, b: int, alpha: float) -> int:
    return max(0, min(255, int(round(a * (1 - alpha) + b * alpha))))


def blend_rgb(a: tuple[int, int, int], b: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return (
        blend_channel(a[0], b[0], alpha),
        blend_channel(a[1], b[1], alpha),
        blend_channel(a[2], b[2], alpha),
    )


def hex_to_rgb(hex_color: str, fallback: tuple[int, int, int] = (0, 0, 0)) -> tuple[int, int, int]:
    normalized = normalize_hex_color(hex_color, None)
    if not normalized:
        return fallback

    return (
        int(normalized[1:3], 16),
        int(normalized[3:5], 16),
        int(normalized[5:7], 16),
    )


def derive_empty_color(bg_rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    luminance = 0.2126 * bg_rgb[0] + 0.7152 * bg_rgb[1] + 0.0722 * bg_rgb[2]
    if luminance < 128:
        return blend_rgb(bg_rgb, (255, 255, 255), 0.18)

    return blend_rgb(bg_rgb, (0, 0, 0), 0.14)


def set_pixel(buffer: bytearray, width: int, x: int, y: int, color: tuple[int, int, int]) -> None:
    idx = (y * width + x) * 4
    buffer[idx] = color[0]
    buffer[idx + 1] = color[1]
    buffer[idx + 2] = color[2]
    buffer[idx + 3] = 255


def point_in_rounded_rect(local_x: int, local_y: int, w: int, h: int, radius: int) -> bool:
    if radius <= 0:
        return True

    if local_x >= radius and local_x < w - radius:
        return True

    if local_y >= radius and local_y < h - radius:
        return True

    r = radius - 0.5

    def in_corner(px: float, py: float) -> bool:
        return (px * px) + (py * py) <= (r * r)

    if local_x < radius and local_y < radius:
        return in_corner(local_x - (radius - 1), local_y - (radius - 1))

    if local_x >= w - radius and local_y < radius:
        return in_corner(local_x - (w - radius), local_y - (radius - 1))

    if local_x < radius and local_y >= h - radius:
        return in_corner(local_x - (radius - 1), local_y - (h - radius))

    return in_corner(local_x - (w - radius), local_y - (h - radius))


def fill_cell(
    buffer: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    cell_w: int,
    cell_h: int,
    color: tuple[int, int, int],
    radius: int,
) -> None:
    start_x = max(0, x)
    start_y = max(0, y)
    end_x = min(width, x + cell_w)
    end_y = min(height, y + cell_h)

    for py in range(start_y, end_y):
        local_y = py - y
        for px in range(start_x, end_x):
            local_x = px - x
            if point_in_rounded_rect(local_x, local_y, cell_w, cell_h, radius):
                set_pixel(buffer, width, px, py, color)


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    length = struct.pack(">I", len(data))
    crc = zlib.crc32(chunk_type)
    crc = zlib.crc32(data, crc) & 0xFFFFFFFF
    return length + chunk_type + data + struct.pack(">I", crc)


def encode_png_rgba(width: int, height: int, rgba: bytearray) -> bytes:
    scanlines = bytearray()
    row_stride = width * 4
    for y in range(height):
        scanlines.append(0)
        start = y * row_stride
        scanlines.extend(rgba[start : start + row_stride])

    compressed = zlib.compress(bytes(scanlines), level=6)
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    return (
        signature
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )


def weekday_js(date_obj: dt.date) -> int:
    return (date_obj.weekday() + 1) % 7


def render_wallpaper_png(user: dict[str, Any], today: dt.date | None = None) -> bytes:
    today = today or dt.date.today()
    year = today.year
    jan1 = dt.date(year, 1, 1)
    jan1_offset = weekday_js(jan1)

    theme = user["theme"]

    bg_rgb = hex_to_rgb(theme.get("bg_color", DEFAULT_THEME["bg_color"]), (13, 17, 23))

    empty_hex = normalize_hex_color(theme.get("empty_color"), None)
    empty_rgb = hex_to_rgb(empty_hex, derive_empty_color(bg_rgb)) if empty_hex else derive_empty_color(bg_rgb)
    future_rgb = blend_rgb(empty_rgb, bg_rgb, 0.5)

    mood_colors_src = theme.get("mood_colors") if isinstance(theme.get("mood_colors"), dict) else {}
    mood_colors = {
        str(level): hex_to_rgb(
            mood_colors_src.get(str(level), DEFAULT_THEME["mood_colors"][str(level)]),
            hex_to_rgb(DEFAULT_THEME["mood_colors"][str(level)]),
        )
        for level in range(1, 6)
    }

    spacing_key = theme.get("spacing", "medium")
    gap = SPACING_TO_GAP.get(spacing_key, SPACING_TO_GAP["medium"])

    available_width = WALLPAPER_WIDTH - (SIDE_INSET * 2)
    available_height = WALLPAPER_HEIGHT - TOP_INSET_CLOCK - BOTTOM_INSET
    cell_by_width = (available_width - (gap * (GRID_COLUMNS - 1))) // GRID_COLUMNS
    cell_by_height = (available_height - (gap * (GRID_ROWS - 1))) // GRID_ROWS
    cell_size = max(2, min(cell_by_width, cell_by_height))

    grid_width = (cell_size * GRID_COLUMNS) + (gap * (GRID_COLUMNS - 1))
    grid_height = (cell_size * GRID_ROWS) + (gap * (GRID_ROWS - 1))

    if theme.get("position") == "center":
        top = (WALLPAPER_HEIGHT - grid_height) // 2
    else:
        top = TOP_INSET_CLOCK

    left = (WALLPAPER_WIDTH - grid_width) // 2

    if theme.get("shape") == "square":
        radius = 0
    else:
        radius = max(1, int(cell_size * 0.24))

    pixels = bytearray(WALLPAPER_WIDTH * WALLPAPER_HEIGHT * 4)
    for y in range(WALLPAPER_HEIGHT):
        for x in range(WALLPAPER_WIDTH):
            set_pixel(pixels, WALLPAPER_WIDTH, x, y, bg_rgb)

    moods = user.get("moods") if isinstance(user.get("moods"), dict) else {}

    cursor = jan1
    day_index = 0
    one_day = dt.timedelta(days=1)
    while cursor.year == year:
        week_index = (day_index + jan1_offset) // 7
        row_index = weekday_js(cursor)

        date_key = cursor.strftime(DATE_KEY_FORMAT)
        mood = moods.get(date_key) if isinstance(moods.get(date_key), dict) else None

        if mood:
            level = str(mood.get("level"))
            color = mood_colors.get(level, empty_rgb)
        elif cursor > today:
            color = future_rgb
        else:
            color = empty_rgb

        x = left + week_index * (cell_size + gap)
        y = top + row_index * (cell_size + gap)
        fill_cell(pixels, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, x, y, cell_size, cell_size, color, radius)

        day_index += 1
        cursor += one_day

    return encode_png_rgba(WALLPAPER_WIDTH, WALLPAPER_HEIGHT, pixels)


def serialize_theme(theme: dict[str, Any]) -> dict[str, Any]:
    mood_colors = theme.get("mood_colors") if isinstance(theme.get("mood_colors"), dict) else {}
    return {
        "bg_color": theme.get("bg_color", DEFAULT_THEME["bg_color"]),
        "mood_colors": {
            "1": mood_colors.get("1", DEFAULT_THEME["mood_colors"]["1"]),
            "2": mood_colors.get("2", DEFAULT_THEME["mood_colors"]["2"]),
            "3": mood_colors.get("3", DEFAULT_THEME["mood_colors"]["3"]),
            "4": mood_colors.get("4", DEFAULT_THEME["mood_colors"]["4"]),
            "5": mood_colors.get("5", DEFAULT_THEME["mood_colors"]["5"]),
        },
        "empty_color": theme.get("empty_color"),
        "shape": theme.get("shape", "rounded"),
        "spacing": theme.get("spacing", "medium"),
        "position": theme.get("position", "clock"),
        "bg_image_url": theme.get("bg_image_url"),
    }


def apply_theme_patch(current_theme: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    next_theme = {
        **current_theme,
        "mood_colors": dict(current_theme.get("mood_colors") or DEFAULT_THEME["mood_colors"]),
    }

    bg_color = normalize_hex_color(payload.get("bg_color", payload.get("bgColor")), None)
    if bg_color:
        next_theme["bg_color"] = bg_color

    if payload.get("empty_color", payload.get("emptyColor", "__missing__")) is None:
        next_theme["empty_color"] = None
    else:
        empty_color = normalize_hex_color(payload.get("empty_color", payload.get("emptyColor")), None)
        if empty_color:
            next_theme["empty_color"] = empty_color

    shape = payload.get("shape")
    if isinstance(shape, str) and shape in {"rounded", "square"}:
        next_theme["shape"] = shape

    spacing = payload.get("spacing")
    if isinstance(spacing, str) and spacing in {"tight", "medium", "wide"}:
        next_theme["spacing"] = spacing

    position = payload.get("position")
    if isinstance(position, str) and position in {"clock", "center"}:
        next_theme["position"] = position

    missing = object()
    bg_image_raw = payload.get("bg_image_url", payload.get("bgImageUrl", missing))
    if bg_image_raw is None:
        next_theme["bg_image_url"] = None
    elif isinstance(bg_image_raw, str) and bg_image_raw != "__missing__":
        next_theme["bg_image_url"] = bg_image_raw

    mood_colors_payload = payload.get("mood_colors")
    if not isinstance(mood_colors_payload, dict):
        mood_colors_payload = payload.get("moodColors") if isinstance(payload.get("moodColors"), dict) else None

    if isinstance(mood_colors_payload, dict):
        for level in range(1, 6):
            level_key = str(level)
            normalized = normalize_hex_color(mood_colors_payload.get(level_key), None)
            if normalized:
                next_theme["mood_colors"][level_key] = normalized

    return next_theme


class StateStore:
    def __init__(self, data_path: Path):
        self.data_path = data_path
        self.lock = threading.RLock()
        self.state: dict[str, Any] = {
            "users": {},
            "sessions": {},
            "wallpaperTokens": {},
        }
        self.load()
        self.ensure_dev_session()

    def load(self) -> None:
        with self.lock:
            if not self.data_path.exists():
                self.state = {"users": {}, "sessions": {}, "wallpaperTokens": {}}
                return

            try:
                parsed = json.loads(self.data_path.read_text("utf-8"))
            except Exception:
                self.state = {"users": {}, "sessions": {}, "wallpaperTokens": {}}
                return

            users = parsed.get("users") if isinstance(parsed, dict) else {}
            sessions = parsed.get("sessions") if isinstance(parsed, dict) else {}
            tokens = parsed.get("wallpaperTokens") if isinstance(parsed, dict) else {}

            normalized_users: dict[str, Any] = {}

            if isinstance(users, dict):
                for user_id, user_raw in users.items():
                    if not isinstance(user_id, str) or not isinstance(user_raw, dict):
                        continue

                    normalized_users[user_id] = self._normalize_user(user_id, user_raw)

            normalized_sessions = {
                token: user_id
                for token, user_id in (sessions.items() if isinstance(sessions, dict) else [])
                if isinstance(token, str) and isinstance(user_id, str)
            }

            normalized_tokens = {
                token: user_id
                for token, user_id in (tokens.items() if isinstance(tokens, dict) else [])
                if isinstance(token, str) and isinstance(user_id, str)
            }

            for user in normalized_users.values():
                normalized_tokens[user["wallpaperToken"]] = user["id"]

            self.state = {
                "users": normalized_users,
                "sessions": normalized_sessions,
                "wallpaperTokens": normalized_tokens,
            }

    def _normalize_user(self, user_id: str, user_raw: dict[str, Any]) -> dict[str, Any]:
        theme_raw = user_raw.get("theme") if isinstance(user_raw.get("theme"), dict) else {}

        theme = clone_default_theme()
        theme = apply_theme_patch(theme, theme_raw)

        moods_raw = user_raw.get("moods") if isinstance(user_raw.get("moods"), dict) else {}
        moods: dict[str, Any] = {}
        for date_key, mood_raw in moods_raw.items():
            if not isinstance(date_key, str) or parse_date_key(date_key) is None:
                continue
            if not isinstance(mood_raw, dict):
                continue

            level = mood_raw.get("level")
            if not isinstance(level, int) or level < 1 or level > 5:
                continue

            note = mood_raw.get("note") if isinstance(mood_raw.get("note"), str) else None
            note = note.strip() if note else None
            mood = {"level": level}
            if note:
                mood["note"] = note
            moods[date_key] = mood

        wallpaper_token = user_raw.get("wallpaperToken")
        if not isinstance(wallpaper_token, str) or not wallpaper_token.strip():
            wallpaper_token = create_opaque_token(32)

        apple_sub = user_raw.get("appleSub")
        if not isinstance(apple_sub, str) or not apple_sub.strip():
            apple_sub = f"user_{user_id}"

        created_at = user_raw.get("createdAt")
        updated_at = user_raw.get("updatedAt")

        return {
            "id": user_id,
            "appleSub": apple_sub,
            "createdAt": created_at if isinstance(created_at, str) and created_at.strip() else now_iso(),
            "updatedAt": updated_at if isinstance(updated_at, str) and updated_at.strip() else now_iso(),
            "wallpaperToken": wallpaper_token,
            "moods": moods,
            "theme": theme,
        }

    def save(self) -> None:
        with self.lock:
            self.data_path.parent.mkdir(parents=True, exist_ok=True)
            self.data_path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")

    def ensure_dev_session(self) -> None:
        with self.lock:
            sessions = self.state["sessions"]
            users = self.state["users"]
            token_users = self.state["wallpaperTokens"]

            existing_user_id = sessions.get(DEV_BEARER_TOKEN)
            if isinstance(existing_user_id, str) and existing_user_id in users:
                return

            user = self.find_user_by_apple_sub("dev-local-user")
            if not user:
                user = self.create_user_locked("dev-local-user")

            sessions[DEV_BEARER_TOKEN] = user["id"]
            token_users[user["wallpaperToken"]] = user["id"]
            user["updatedAt"] = now_iso()
            self.save()

    def create_user_locked(self, apple_sub: str) -> dict[str, Any]:
        user_id = str(uuid.uuid4())
        token = create_opaque_token(32)
        user = {
            "id": user_id,
            "appleSub": apple_sub,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
            "wallpaperToken": token,
            "moods": {},
            "theme": clone_default_theme(),
        }
        self.state["users"][user_id] = user
        self.state["wallpaperTokens"][token] = user_id
        return user

    def find_user_by_apple_sub(self, apple_sub: str) -> dict[str, Any] | None:
        for user in self.state["users"].values():
            if user.get("appleSub") == apple_sub:
                return user
        return None

    def get_user_by_session(self, token: str) -> dict[str, Any] | None:
        user_id = self.state["sessions"].get(token)
        if not isinstance(user_id, str):
            return None
        user = self.state["users"].get(user_id)
        return user if isinstance(user, dict) else None

    def get_user_by_wallpaper_token(self, token: str) -> dict[str, Any] | None:
        user_id = self.state["wallpaperTokens"].get(token)
        if not isinstance(user_id, str):
            return None
        user = self.state["users"].get(user_id)
        return user if isinstance(user, dict) else None


store = StateStore(DATA_PATH)

app = FastAPI(title="Year in Pixels API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(status_code=exc.status_code, content={"error": message, "message": message})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, __: Exception):
    message = "Unexpected server error."
    return JSONResponse(status_code=500, content={"error": message, "message": message})


def require_auth(request: Request) -> tuple[str, dict[str, Any]]:
    token = parse_bearer_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    with store.lock:
        user = store.get_user_by_session(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid session token.")
        return token, user


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "year-in-pixels-fastapi",
        "ok": True,
        "endpoints": [
            "POST /auth/apple",
            "DELETE /auth/session",
            "GET /moods?year=YYYY",
            "PUT /moods/{date}",
            "DELETE /moods/{date}",
            "GET /theme",
            "PUT /theme",
            "GET /token",
            "POST /token/rotate",
            "GET /w/{token}",
            "GET /health",
        ],
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "timestamp": now_iso()}


@app.post("/auth/apple")
async def auth_apple(payload: dict[str, Any]) -> dict[str, Any]:
    identity_token = payload.get("identityToken", payload.get("idToken"))
    if not isinstance(identity_token, str) or not identity_token.strip():
        raise HTTPException(status_code=400, detail="identityToken is required.")

    apple_sub = f"apple_{hashlib.sha256(identity_token.encode('utf-8')).hexdigest()[:24]}"

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


@app.delete("/auth/session", status_code=204)
async def delete_session(request: Request) -> Response:
    token, user = require_auth(request)
    with store.lock:
        if token != DEV_BEARER_TOKEN:
            store.state["sessions"].pop(token, None)
            user["updatedAt"] = now_iso()
            store.save()
    return Response(status_code=204)


@app.get("/moods")
async def get_moods(request: Request, year: int) -> dict[str, Any]:
    _, user = require_auth(request)

    if year < 2000 or year > 3000:
        raise HTTPException(status_code=400, detail="A valid ?year=YYYY query is required.")

    moods_raw = user.get("moods") if isinstance(user.get("moods"), dict) else {}
    moods: list[dict[str, Any]] = []

    for date_key, mood in moods_raw.items():
        if not isinstance(date_key, str) or not date_key.startswith(f"{year}-"):
            continue
        if not isinstance(mood, dict):
            continue

        level = mood.get("level")
        if not isinstance(level, int) or level < 1 or level > 5:
            continue

        row: dict[str, Any] = {"date": date_key, "level": level}
        note = mood.get("note")
        if isinstance(note, str) and note.strip():
            row["note"] = note.strip()
        moods.append(row)

    moods.sort(key=lambda row: row["date"])
    return {"moods": moods}


@app.put("/moods/{date_key}")
async def put_mood(date_key: str, payload: dict[str, Any], request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    level = payload.get("level")
    if not isinstance(level, int) or level < 1 or level > 5:
        raise HTTPException(status_code=400, detail="level must be an integer from 1 to 5.")

    note_raw = payload.get("note")
    note = note_raw.strip()[:240] if isinstance(note_raw, str) and note_raw.strip() else None

    mood: dict[str, Any] = {"level": level}
    if note:
        mood["note"] = note

    with store.lock:
        user.setdefault("moods", {})[date_key] = mood
        user["updatedAt"] = now_iso()
        store.save()

    response: dict[str, Any] = {"date": date_key, "level": level}
    if note:
        response["note"] = note
    return response


@app.delete("/moods/{date_key}", status_code=204)
async def remove_mood(date_key: str, request: Request) -> Response:
    _, user = require_auth(request)

    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    with store.lock:
        moods = user.setdefault("moods", {})
        if isinstance(moods, dict):
            moods.pop(date_key, None)
        user["updatedAt"] = now_iso()
        store.save()

    return Response(status_code=204)


@app.get("/theme")
async def get_theme(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)
    theme = user.get("theme") if isinstance(user.get("theme"), dict) else clone_default_theme()
    return serialize_theme(theme)


@app.put("/theme")
async def put_theme(payload: dict[str, Any], request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    with store.lock:
        current_theme = user.get("theme") if isinstance(user.get("theme"), dict) else clone_default_theme()
        next_theme = apply_theme_patch(current_theme, payload if isinstance(payload, dict) else {})
        user["theme"] = next_theme
        user["updatedAt"] = now_iso()
        store.save()

    return serialize_theme(next_theme)


@app.get("/token")
async def get_token(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)
    token = user["wallpaperToken"]
    return {"token": token, "url": build_wallpaper_url(request, token)}


@app.post("/token/rotate")
async def rotate_token(request: Request) -> dict[str, Any]:
    _, user = require_auth(request)

    with store.lock:
        old_token = user["wallpaperToken"]
        store.state["wallpaperTokens"].pop(old_token, None)

        new_token = create_opaque_token(32)
        user["wallpaperToken"] = new_token
        user["updatedAt"] = now_iso()
        store.state["wallpaperTokens"][new_token] = user["id"]
        store.save()

    return {"token": new_token, "url": build_wallpaper_url(request, new_token)}


@app.get("/w/{token}")
async def wallpaper(token: str) -> Response:
    with store.lock:
        user = store.get_user_by_wallpaper_token(token)
        if not user:
            raise HTTPException(status_code=404, detail="Wallpaper token not found.")
        png_bytes = render_wallpaper_png(user)

    return Response(content=png_bytes, media_type="image/png", headers={"Cache-Control": "public, max-age=60"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
