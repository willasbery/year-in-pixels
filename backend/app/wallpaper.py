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
from .theme import normalize_theme_avoid_lock_screen_ui, normalize_theme_columns
from .utils import normalize_hex_color


DotKind = str


def clamp_int(value: int, minimum: int, maximum: int) -> int:
    if minimum > maximum:
        return minimum

    return max(minimum, min(maximum, value))


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


def derive_background_gradient(bg_rgb: tuple[int, int, int]) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    luminance = 0.2126 * bg_rgb[0] + 0.7152 * bg_rgb[1] + 0.0722 * bg_rgb[2]
    if luminance < 128:
        top_rgb = blend_rgb(bg_rgb, (255, 255, 255), 0.09)
        bottom_rgb = blend_rgb(bg_rgb, (0, 0, 0), 0.16)
    else:
        top_rgb = blend_rgb(bg_rgb, (255, 255, 255), 0.05)
        bottom_rgb = blend_rgb(bg_rgb, (0, 0, 0), 0.10)

    return top_rgb, bottom_rgb


def point_in_box(x: int, y: int, box: tuple[int, int, int, int]) -> bool:
    left, top, right, bottom = box
    return x >= left and x < right and y >= top and y < bottom


def clock_safe_box() -> tuple[int, int, int, int]:
    return (
        int(WALLPAPER_WIDTH * 0.17),
        int(WALLPAPER_HEIGHT * 0.05),
        int(WALLPAPER_WIDTH * 0.83),
        TOP_INSET_CLOCK + 220,
    )


def widget_soft_safe_box() -> tuple[int, int, int, int]:
    return (
        SIDE_INSET,
        TOP_INSET_CLOCK + 170,
        WALLPAPER_WIDTH - SIDE_INSET,
        TOP_INSET_CLOCK + 620,
    )


def resolve_protected_top(avoid_lock_screen_ui: bool) -> int:
    if avoid_lock_screen_ui:
        return widget_soft_safe_box()[3] + 28

    return TOP_INSET_CLOCK


def desaturate_rgb(color: tuple[int, int, int]) -> tuple[int, int, int]:
    luminance = int(round((0.2126 * color[0]) + (0.7152 * color[1]) + (0.0722 * color[2])))
    return (luminance, luminance, luminance)


def apply_dot_readability_treatment(
    color: tuple[int, int, int],
    bg_rgb: tuple[int, int, int],
    kind: DotKind,
    center_x: int,
    center_y: int,
) -> tuple[int, int, int]:
    if kind == "mood" and point_in_box(center_x, center_y, clock_safe_box()):
        desaturated = blend_rgb(color, desaturate_rgb(color), 0.82)
        return blend_rgb(desaturated, bg_rgb, 0.52)

    if kind in {"empty", "future"} and point_in_box(center_x, center_y, widget_soft_safe_box()):
        blend_alpha = 0.34 if kind == "empty" else 0.50
        return blend_rgb(color, bg_rgb, blend_alpha)

    return color


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


def fill_background_gradient(
    buffer: bytearray,
    width: int,
    height: int,
    bg_rgb: tuple[int, int, int],
) -> None:
    top_rgb, bottom_rgb = derive_background_gradient(bg_rgb)
    row_stride = width * 4
    denominator = max(1, height - 1)

    for y in range(height):
        row_rgb = blend_rgb(top_rgb, bottom_rgb, y / denominator)
        row_start = y * row_stride
        for x in range(width):
            idx = row_start + (x * 4)
            buffer[idx] = row_rgb[0]
            buffer[idx + 1] = row_rgb[1]
            buffer[idx + 2] = row_rgb[2]
            buffer[idx + 3] = 255


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


def resolve_effective_gap(spacing_key: str, grid_columns: int) -> int:
    gap = SPACING_TO_GAP.get(spacing_key, SPACING_TO_GAP["medium"])

    # Dense multi-column layouts need tighter gutters to preserve dot legibility.
    dense_columns = max(0, grid_columns - 20)
    gap_reduction = min(2, dense_columns // 5)

    return max(1, gap - gap_reduction)


def resolve_dot_size(slot_size: int, spacing_key: str, grid_columns: int) -> int:
    dense_ratio = max(0.0, min(1.0, (grid_columns - 14) / 17))
    base_utilization = {"tight": 0.84, "medium": 0.80, "wide": 0.74}.get(spacing_key, 0.80)
    utilization = min(0.92, base_utilization + (dense_ratio * 0.08))
    dot_size = int(round(slot_size * utilization))
    return max(8, min(slot_size, dot_size))


def resolve_grid_top(
    position: str | None,
    grid_height: int,
    protected_top: int,
    available_height: int,
) -> int:
    min_top = max(0, protected_top)
    max_top = WALLPAPER_HEIGHT - BOTTOM_INSET - grid_height
    if max_top < min_top:
        return max(0, max_top)

    if position == "center":
        centered_within_available = min_top + max(0, (available_height - grid_height) // 2)
        return clamp_int(centered_within_available, min_top, max_top)

    if protected_top > TOP_INSET_CLOCK:
        extra_vertical_room = max(0, available_height - grid_height)
        lower_bias = min(56, extra_vertical_room // 7)
        return clamp_int(min_top + lower_bias, min_top, max_top)

    top_safe = TOP_INSET_CLOCK + 36
    min_top = max(min_top, top_safe)

    # Place the grid lower than center to sit beneath clock/widgets on tall phones.
    target_visual_center_y = int(WALLPAPER_HEIGHT * 0.60)
    centered_top = target_visual_center_y - (grid_height // 2)
    extra_vertical_room = max(0, available_height - grid_height)
    lower_bias = min(72, extra_vertical_room // 5)
    return clamp_int(centered_top + lower_bias, min_top, max_top)


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
    avoid_lock_screen_ui = normalize_theme_avoid_lock_screen_ui(
        theme.get("avoid_lock_screen_ui"),
        DEFAULT_THEME["avoid_lock_screen_ui"],
    )

    # Vertical lock-screen layout: sequential days, offset by Jan 1 weekday.
    grid_columns = normalize_theme_columns(theme.get("columns"), DEFAULT_THEME["columns"])
    gap = resolve_effective_gap(spacing_key, grid_columns)
    grid_rows = (days_in_year(year) + jan1_offset + grid_columns - 1) // grid_columns

    available_width = WALLPAPER_WIDTH - (SIDE_INSET * 2)
    protected_top = resolve_protected_top(avoid_lock_screen_ui)
    available_height = WALLPAPER_HEIGHT - protected_top - BOTTOM_INSET
    slot_by_width = (available_width - (gap * (grid_columns - 1))) // grid_columns
    slot_by_height = (available_height - (gap * (grid_rows - 1))) // grid_rows
    slot_size = max(2, min(slot_by_width, slot_by_height))

    grid_width = (slot_size * grid_columns) + (gap * (grid_columns - 1))
    grid_height = (slot_size * grid_rows) + (gap * (grid_rows - 1))

    top = resolve_grid_top(theme.get("position"), grid_height, protected_top, available_height)

    left = (WALLPAPER_WIDTH - grid_width) // 2

    dot_size = resolve_dot_size(slot_size, spacing_key, grid_columns)
    dot_inset = (slot_size - dot_size) // 2

    if theme.get("shape") == "square":
        radius = 0
    else:
        radius = max(1, int(dot_size * 0.24))

    pixels = bytearray(WALLPAPER_WIDTH * WALLPAPER_HEIGHT * 4)
    fill_background_gradient(pixels, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, bg_rgb)

    moods = user.get("moods") if isinstance(user.get("moods"), dict) else {}

    cursor = jan1
    day_index = 0
    one_day = dt.timedelta(days=1)
    while cursor.year == year:
        shifted_index = day_index + jan1_offset
        col_index = shifted_index % grid_columns
        row_index = shifted_index // grid_columns

        date_key = cursor.strftime(DATE_KEY_FORMAT)
        mood = moods.get(date_key) if isinstance(moods.get(date_key), dict) else None

        kind: DotKind
        if mood:
            level = str(mood.get("level"))
            color = mood_colors.get(level, empty_rgb)
            kind = "mood"
        elif cursor > today:
            color = future_rgb
            kind = "future"
        else:
            color = empty_rgb
            kind = "empty"

        x = left + col_index * (slot_size + gap) + dot_inset
        y = top + row_index * (slot_size + gap) + dot_inset
        center_x = x + (dot_size // 2)
        center_y = y + (dot_size // 2)
        color = apply_dot_readability_treatment(color, bg_rgb, kind, center_x, center_y)
        fill_cell(pixels, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, x, y, dot_size, dot_size, color, radius)

        day_index += 1
        cursor += one_day

    return encode_png_rgba(WALLPAPER_WIDTH, WALLPAPER_HEIGHT, pixels)
