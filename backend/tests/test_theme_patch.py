from __future__ import annotations

import unittest

from app.constants import DEFAULT_THEME
from app.theme import apply_theme_patch, clone_default_theme, serialize_theme


class ThemePatchTests(unittest.TestCase):
    def test_bg_color_change_resets_empty_color_to_auto_when_not_provided(self) -> None:
        current = clone_default_theme()
        current["empty_color"] = "#aabbcc"

        updated = apply_theme_patch(current, {"bgColor": "112233"})

        self.assertEqual(updated["bg_color"], "#112233")
        self.assertIsNone(updated["empty_color"])

    def test_bg_color_change_keeps_explicit_empty_color(self) -> None:
        current = clone_default_theme()
        current["empty_color"] = "#aabbcc"

        updated = apply_theme_patch(current, {"bgColor": "112233", "emptyColor": "445566"})

        self.assertEqual(updated["bg_color"], "#112233")
        self.assertEqual(updated["empty_color"], "#445566")

    def test_non_background_updates_do_not_clear_existing_empty_color(self) -> None:
        current = clone_default_theme()
        current["empty_color"] = "#aabbcc"

        updated = apply_theme_patch(current, {"shape": "square"})

        self.assertEqual(updated["shape"], "square")
        self.assertEqual(updated["empty_color"], "#aabbcc")

    def test_columns_accepts_aliases(self) -> None:
        current = clone_default_theme()

        from_columns = apply_theme_patch(current, {"columns": 19})
        self.assertEqual(from_columns["columns"], 19)

        from_grid_columns = apply_theme_patch(current, {"gridColumns": 21})
        self.assertEqual(from_grid_columns["columns"], 21)

    def test_invalid_columns_payload_is_ignored(self) -> None:
        current = clone_default_theme()
        current["columns"] = 18

        updated = apply_theme_patch(current, {"columns": 50})

        self.assertEqual(updated["columns"], 18)

    def test_serialize_theme_falls_back_to_default_columns(self) -> None:
        serialized = serialize_theme({"columns": 2})

        self.assertEqual(serialized["columns"], DEFAULT_THEME["columns"])
        self.assertEqual(
            serialized["avoid_lock_screen_ui"],
            DEFAULT_THEME["avoid_lock_screen_ui"],
        )

    def test_avoid_lock_screen_ui_accepts_aliases(self) -> None:
        current = clone_default_theme()

        from_snake_case = apply_theme_patch(current, {"avoid_lock_screen_ui": True})
        self.assertTrue(from_snake_case["avoid_lock_screen_ui"])

        from_camel_case = apply_theme_patch(current, {"avoidLockScreenUi": True})
        self.assertTrue(from_camel_case["avoid_lock_screen_ui"])

    def test_invalid_avoid_lock_screen_ui_payload_is_ignored(self) -> None:
        current = clone_default_theme()
        current["avoid_lock_screen_ui"] = True

        updated = apply_theme_patch(current, {"avoidLockScreenUi": "maybe"})

        self.assertTrue(updated["avoid_lock_screen_ui"])


if __name__ == "__main__":
    unittest.main()
