from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.constants import DEFAULT_THEME
from app.db import init_db


class DbSchemaTests(unittest.TestCase):
    def test_init_db_adds_missing_theme_columns_and_avoid_lock_screen_ui_columns(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "schema.db"

            with sqlite3.connect(db_path) as conn:
                conn.executescript(
                    """
                    CREATE TABLE users (
                        id TEXT PRIMARY KEY,
                        apple_sub TEXT UNIQUE NOT NULL,
                        wallpaper_token TEXT UNIQUE NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE themes (
                        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                        bg_color TEXT NOT NULL,
                        empty_color TEXT,
                        shape TEXT NOT NULL,
                        spacing TEXT NOT NULL,
                        position TEXT NOT NULL,
                        bg_image_url TEXT,
                        mood_colors TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    INSERT INTO users (id, apple_sub, wallpaper_token, created_at, updated_at)
                    VALUES ('user-1', 'apple-sub-1', 'wallpaper-token-1', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00')
                    """
                )
                conn.execute(
                    """
                    INSERT INTO themes (
                        user_id,
                        bg_color,
                        empty_color,
                        shape,
                        spacing,
                        position,
                        bg_image_url,
                        mood_colors,
                        updated_at
                    ) VALUES ('user-1', '#0d1117', NULL, 'rounded', 'medium', 'clock', NULL, '["#ef4444","#f97316","#eab308","#22c55e","#3b82f6"]', '2026-01-01T00:00:00+00:00')
                    """
                )
                conn.commit()

            init_db(db_path)

            with sqlite3.connect(db_path) as conn:
                column_names = {str(row[1]) for row in conn.execute("PRAGMA table_info(themes)").fetchall()}
                self.assertIn("columns", column_names)
                self.assertIn("avoid_lock_screen_ui", column_names)

                stored_theme = conn.execute(
                    "SELECT columns, avoid_lock_screen_ui FROM themes WHERE user_id = 'user-1'"
                ).fetchone()
                self.assertIsNotNone(stored_theme)
                self.assertEqual(stored_theme[0], DEFAULT_THEME["columns"])
                self.assertEqual(stored_theme[1], 1 if DEFAULT_THEME["avoid_lock_screen_ui"] else 0)


if __name__ == "__main__":
    unittest.main()
