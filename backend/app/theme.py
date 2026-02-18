from __future__ import annotations

from typing import Any

from .constants import DEFAULT_THEME
from .utils import normalize_hex_color


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

    empty_color_source = payload.get("empty_color", payload.get("emptyColor", "__missing__"))
    if empty_color_source is None:
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
