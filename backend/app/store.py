from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Any

from .theme import apply_theme_patch, clone_default_theme
from .utils import create_opaque_token, now_iso, parse_date_key


class StateStore:
    def __init__(self, data_path: Path, dev_bearer_token: str):
        self.data_path = data_path
        self.dev_bearer_token = dev_bearer_token
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

            existing_user_id = sessions.get(self.dev_bearer_token)
            if isinstance(existing_user_id, str) and existing_user_id in users:
                return

            user = self.find_user_by_apple_sub("dev-local-user")
            if not user:
                user = self.create_user_locked("dev-local-user")

            sessions[self.dev_bearer_token] = user["id"]
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
