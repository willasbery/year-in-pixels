from __future__ import annotations

from typing import Any

DATE_KEY_FORMAT = "%Y-%m-%d"
WALLPAPER_WIDTH = 1290
WALLPAPER_HEIGHT = 2796
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
    "avoid_lock_screen_ui": False,
    "columns": 14,
    "bg_image_url": None,
}

SPACING_TO_GAP = {
    "tight": 2,
    "medium": 4,
    "wide": 6,
}
