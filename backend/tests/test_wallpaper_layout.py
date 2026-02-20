from __future__ import annotations

import datetime as dt
import unittest

from app.constants import BOTTOM_INSET, TOP_INSET_CLOCK, WALLPAPER_HEIGHT
from app.theme import clone_default_theme
from app.wallpaper import (
    apply_dot_readability_treatment,
    clock_safe_box,
    render_wallpaper_png,
    resolve_dot_size,
    resolve_effective_gap,
    resolve_grid_top,
    resolve_protected_top,
    widget_soft_safe_box,
)


class WallpaperLayoutTests(unittest.TestCase):
    def test_effective_gap_preserves_spacing_order_and_compresses_dense_columns(self) -> None:
        self.assertEqual(resolve_effective_gap("tight", 14), 2)
        self.assertEqual(resolve_effective_gap("medium", 14), 4)
        self.assertEqual(resolve_effective_gap("wide", 14), 6)

        self.assertEqual(resolve_effective_gap("tight", 31), 1)
        self.assertEqual(resolve_effective_gap("medium", 31), 2)
        self.assertEqual(resolve_effective_gap("wide", 31), 4)

    def test_dot_size_increases_for_dense_columns(self) -> None:
        slot_size = 30
        sparse = resolve_dot_size(slot_size, "medium", 14)
        dense = resolve_dot_size(slot_size, "medium", 31)
        self.assertGreater(dense, sparse)
        self.assertLessEqual(dense, slot_size)

    def test_gap_and_dot_size_are_sensible_for_supported_column_presets(self) -> None:
        slot_size = 32
        columns = [7, 13, 14, 21]
        for count in columns:
            gap = resolve_effective_gap("medium", count)
            dot_size = resolve_dot_size(slot_size, "medium", count)
            self.assertGreaterEqual(gap, 1)
            self.assertLessEqual(gap, 4)
            self.assertGreaterEqual(dot_size, 8)
            self.assertLessEqual(dot_size, slot_size)

    def test_grid_top_reserves_clock_safe_area_for_default_position(self) -> None:
        grid_height = 1100
        protected_top = resolve_protected_top(False)
        available_height = WALLPAPER_HEIGHT - protected_top - BOTTOM_INSET
        top = resolve_grid_top("clock", grid_height, protected_top, available_height)
        self.assertGreaterEqual(top, TOP_INSET_CLOCK + 36)
        self.assertLessEqual(top + grid_height, WALLPAPER_HEIGHT - BOTTOM_INSET)

    def test_grid_top_keeps_center_position_centered(self) -> None:
        grid_height = 1000
        protected_top = resolve_protected_top(False)
        available_height = WALLPAPER_HEIGHT - protected_top - BOTTOM_INSET
        top = resolve_grid_top("center", grid_height, protected_top, available_height)
        expected = protected_top + ((available_height - grid_height) // 2)
        self.assertEqual(top, expected)

    def test_grid_top_avoids_clock_and_widget_when_toggle_enabled(self) -> None:
        grid_height = 1080
        protected_top = resolve_protected_top(True)
        self.assertGreater(protected_top, widget_soft_safe_box()[3])
        available_height = WALLPAPER_HEIGHT - protected_top - BOTTOM_INSET
        top = resolve_grid_top("clock", grid_height, protected_top, available_height)
        self.assertGreaterEqual(top, protected_top)
        self.assertLessEqual(top + grid_height, WALLPAPER_HEIGHT - BOTTOM_INSET)

    def test_clock_safe_treatment_hard_mutes_mood_dots(self) -> None:
        bg_rgb = (20, 24, 30)
        mood_rgb = (255, 70, 90)
        left, top, right, bottom = clock_safe_box()
        safe_center = ((left + right) // 2, (top + bottom) // 2)

        treated = apply_dot_readability_treatment(mood_rgb, bg_rgb, "mood", safe_center[0], safe_center[1])
        untreated = apply_dot_readability_treatment(mood_rgb, bg_rgb, "mood", right + 20, bottom + 20)

        treated_spread = max(treated) - min(treated)
        untreated_spread = max(untreated) - min(untreated)

        self.assertEqual(untreated, mood_rgb)
        self.assertLess(treated_spread, untreated_spread)
        self.assertLess(abs(treated[0] - bg_rgb[0]), abs(untreated[0] - bg_rgb[0]))

    def test_widget_soft_safe_deemphasizes_empty_and_future(self) -> None:
        bg_rgb = (15, 20, 26)
        empty_rgb = (80, 90, 105)
        future_rgb = (45, 55, 70)
        left, top, right, bottom = widget_soft_safe_box()
        safe_center = ((left + right) // 2, (top + bottom) // 2)

        empty_treated = apply_dot_readability_treatment(empty_rgb, bg_rgb, "empty", safe_center[0], safe_center[1])
        empty_untreated = apply_dot_readability_treatment(empty_rgb, bg_rgb, "empty", right + 20, bottom + 20)
        future_treated = apply_dot_readability_treatment(future_rgb, bg_rgb, "future", safe_center[0], safe_center[1])
        future_untreated = apply_dot_readability_treatment(future_rgb, bg_rgb, "future", right + 20, bottom + 20)

        self.assertEqual(empty_untreated, empty_rgb)
        self.assertEqual(future_untreated, future_rgb)
        self.assertLess(abs(empty_treated[0] - bg_rgb[0]), abs(empty_untreated[0] - bg_rgb[0]))
        self.assertLess(abs(future_treated[0] - bg_rgb[0]), abs(future_untreated[0] - bg_rgb[0]))

    def test_render_wallpaper_png_handles_supported_column_counts(self) -> None:
        today = dt.date(2026, 2, 20)
        moods = {
            "2026-01-03": {"level": 2},
            "2026-01-07": {"level": 5},
            "2026-02-14": {"level": 1},
        }

        for columns in [7, 13, 14, 21]:
            theme = clone_default_theme()
            theme["columns"] = columns
            png_bytes = render_wallpaper_png({"theme": theme, "moods": moods}, today=today)
            self.assertTrue(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"))
            self.assertGreater(len(png_bytes), 2000)


if __name__ == "__main__":
    unittest.main()
