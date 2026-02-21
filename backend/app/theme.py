from __future__ import annotations

from typing import Any

from .constants import DEFAULT_THEME
from .utils import normalize_hex_color


def normalize_theme_columns(value: Any, fallback: int) -> int:
    if isinstance(value, bool):
        return fallback

    candidate: int | None = None
    if isinstance(value, int):
        candidate = value
    elif isinstance(value, str):
        stripped = value.strip()
        if stripped:
            try:
                candidate = int(stripped)
            except ValueError:
                candidate = None

    if candidate is not None and 7 <= candidate <= 31:
        return candidate

    return fallback


def normalize_theme_avoid_lock_screen_ui(value: Any, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        if value == 0:
            return False
        if value == 1:
            return True
        return fallback

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False

    return fallback


def clone_default_theme() -> dict[str, Any]:
    return {
        "bg_color": DEFAULT_THEME["bg_color"],
        "mood_colors": dict(DEFAULT_THEME["mood_colors"]),
        "empty_color": DEFAULT_THEME["empty_color"],
        "shape": DEFAULT_THEME["shape"],
        "spacing": DEFAULT_THEME["spacing"],
        "position": DEFAULT_THEME["position"],
        "avoid_lock_screen_ui": DEFAULT_THEME["avoid_lock_screen_ui"],
        "columns": DEFAULT_THEME["columns"],
        "bg_image_url": DEFAULT_THEME["bg_image_url"],
    }


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
        "avoid_lock_screen_ui": normalize_theme_avoid_lock_screen_ui(
            theme.get("avoid_lock_screen_ui"),
            DEFAULT_THEME["avoid_lock_screen_ui"],
        ),
        "columns": normalize_theme_columns(theme.get("columns"), DEFAULT_THEME["columns"]),
        "bg_image_url": theme.get("bg_image_url"),
    }


def apply_theme_patch(current_theme: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    current_columns = normalize_theme_columns(current_theme.get("columns"), DEFAULT_THEME["columns"])
    next_theme = {
        **current_theme,
        "mood_colors": dict(current_theme.get("mood_colors") or DEFAULT_THEME["mood_colors"]),
        "avoid_lock_screen_ui": normalize_theme_avoid_lock_screen_ui(
            current_theme.get("avoid_lock_screen_ui"),
            DEFAULT_THEME["avoid_lock_screen_ui"],
        ),
        "columns": current_columns,
    }

    missing = object()
    bg_color = normalize_hex_color(payload.get("bg_color", payload.get("bgColor")), None)
    did_update_bg_color = False
    if bg_color:
        next_theme["bg_color"] = bg_color
        did_update_bg_color = True

    empty_color_source = payload.get("empty_color", payload.get("emptyColor", missing))
    if empty_color_source is missing:
        if did_update_bg_color:
            # When background changes without an explicit empty colour, fall back to
            # auto-derived dots so contrast stays aligned with the new background.
            next_theme["empty_color"] = None
    elif empty_color_source is None:
        next_theme["empty_color"] = None
    else:
        empty_color = normalize_hex_color(payload.get("empty_color", payload.get("emptyColor")), None)
        if empty_color:
            next_theme["empty_color"] = empty_color

    shape = payload.get("shape")
    if isinstance(shape, str) and shape in {"rounded", "square", "rough"}:
        next_theme["shape"] = shape

    spacing = payload.get("spacing")
    if isinstance(spacing, str) and spacing in {"tight", "medium", "wide"}:
        next_theme["spacing"] = spacing

    position = payload.get("position")
    if isinstance(position, str) and position in {"clock", "center"}:
        next_theme["position"] = position

    avoid_lock_screen_ui_source = payload.get(
        "avoid_lock_screen_ui",
        payload.get("avoidLockScreenUi", missing),
    )
    if avoid_lock_screen_ui_source is not missing:
        next_theme["avoid_lock_screen_ui"] = normalize_theme_avoid_lock_screen_ui(
            avoid_lock_screen_ui_source,
            next_theme["avoid_lock_screen_ui"],
        )

    columns_source = payload.get("columns", payload.get("gridColumns", missing))
    if columns_source is not missing:
        next_theme["columns"] = normalize_theme_columns(columns_source, current_columns)

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
