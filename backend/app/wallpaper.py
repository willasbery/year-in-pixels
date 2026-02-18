from __future__ import annotations

import datetime as dt
import struct
import zlib
from typing import Any

from .constants import (
    BOTTOM_INSET,
    DATE_KEY_FORMAT,
    DEFAULT_THEME,
    SIDE_INSET,
    SPACING_TO_GAP,
    TOP_INSET_CLOCK,
    WALLPAPER_HEIGHT,
    WALLPAPER_WIDTH,
)
from .utils import normalize_hex_color


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


def days_in_year(year: int) -> int:
    return 366 if dt.date(year, 12, 31).timetuple().tm_yday == 366 else 365


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

    grid_columns = 7
    grid_rows = (days_in_year(year) + jan1_offset + 6) // 7

    available_width = WALLPAPER_WIDTH - (SIDE_INSET * 2)
    available_height = WALLPAPER_HEIGHT - TOP_INSET_CLOCK - BOTTOM_INSET
    cell_by_width = (available_width - (gap * (grid_columns - 1))) // grid_columns
    cell_by_height = (available_height - (gap * (grid_rows - 1))) // grid_rows
    cell_size = max(2, min(cell_by_width, cell_by_height))

    grid_width = (cell_size * grid_columns) + (gap * (grid_columns - 1))
    grid_height = (cell_size * grid_rows) + (gap * (grid_rows - 1))

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
        col_index = weekday_js(cursor)
        row_index = (day_index + jan1_offset) // 7

        date_key = cursor.strftime(DATE_KEY_FORMAT)
        mood = moods.get(date_key) if isinstance(moods.get(date_key), dict) else None

        if mood:
            level = str(mood.get("level"))
            color = mood_colors.get(level, empty_rgb)
        elif cursor > today:
            color = future_rgb
        else:
            color = empty_rgb

        x = left + col_index * (cell_size + gap)
        y = top + row_index * (cell_size + gap)
        fill_cell(pixels, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, x, y, cell_size, cell_size, color, radius)

        day_index += 1
        cursor += one_day

    return encode_png_rgba(WALLPAPER_WIDTH, WALLPAPER_HEIGHT, pixels)
