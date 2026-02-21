from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class MigrationScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.backend_root = Path(__file__).resolve().parents[1]
        self.script_path = self.backend_root / "scripts" / "migrate_json_to_sqlite.py"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(self.script_path), *args],
            cwd=self.backend_root,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_migrates_json_and_creates_backup(self) -> None:
        source = self.workspace / "data.json"
        target = self.workspace / "pixels.db"

        source.write_text(
            json.dumps(
                {
                    "users": {
                        "user-1": {
                            "id": "user-1",
                            "appleSub": "apple-sub-1",
                            "createdAt": "2026-01-01T00:00:00+00:00",
                            "updatedAt": "2026-01-02T00:00:00+00:00",
                            "wallpaperToken": "wallpaper-token-1",
                            "moods": {
                                "2026-02-18": {"level": 4, "note": "  hello  "},
                                "bad-date": {"level": 3},
                            },
                            "theme": {"bg_color": "112233", "shape": "square"},
                        },
                        "bad-user": "skip-me",
                    },
                    "sessions": {
                        "session-token-1": "user-1",
                        "dangling-session": "missing-user",
                    },
                }
            ),
            encoding="utf-8",
        )

        result = self.run_script(
            "--source",
            str(source),
            "--target",
            str(target),
            "--no-dev-session",
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("Migration complete", result.stdout)

        backup_path = source.with_suffix(".json.bak")
        self.assertTrue(backup_path.exists())

        with sqlite3.connect(target) as conn:
            users_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            sessions_count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
            moods_count = conn.execute("SELECT COUNT(*) FROM moods").fetchone()[0]
            themes_count = conn.execute("SELECT COUNT(*) FROM themes").fetchone()[0]

            self.assertEqual(users_count, 1)
            self.assertEqual(sessions_count, 1)
            self.assertEqual(moods_count, 1)
            self.assertEqual(themes_count, 1)

            mood_note = conn.execute("SELECT note FROM moods WHERE user_id = 'user-1'").fetchone()[0]
            self.assertEqual(mood_note, "hello")

            theme_row = conn.execute(
                "SELECT bg_color, shape FROM themes WHERE user_id = 'user-1'"
            ).fetchone()
            self.assertEqual(theme_row[0], "#112233")
            self.assertEqual(theme_row[1], "square")

    def test_requires_force_for_existing_target_database(self) -> None:
        source = self.workspace / "data.json"
        target = self.workspace / "pixels.db"

        source.write_text(
            json.dumps(
                {
                    "users": {
                        "user-1": {
                            "id": "user-1",
                            "appleSub": "apple-sub-1",
                            "createdAt": "2026-01-01T00:00:00+00:00",
                            "updatedAt": "2026-01-02T00:00:00+00:00",
                            "wallpaperToken": "wallpaper-token-1",
                        }
                    },
                    "sessions": {},
                }
            ),
            encoding="utf-8",
        )

        first = self.run_script(
            "--source",
            str(source),
            "--target",
            str(target),
            "--skip-backup",
            "--no-dev-session",
        )
        self.assertEqual(first.returncode, 0, msg=first.stderr)

        second = self.run_script(
            "--source",
            str(source),
            "--target",
            str(target),
            "--skip-backup",
            "--no-dev-session",
        )
        self.assertEqual(second.returncode, 1)
        self.assertIn("Target database already exists", second.stderr)

        third = self.run_script(
            "--source",
            str(source),
            "--target",
            str(target),
            "--skip-backup",
            "--no-dev-session",
            "--force",
        )
        self.assertEqual(third.returncode, 0, msg=third.stderr)


if __name__ == "__main__":
    unittest.main()
