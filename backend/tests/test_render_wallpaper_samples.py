from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class RenderWallpaperSamplesScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.backend_root = Path(__file__).resolve().parents[1]
        self.script_path = self.backend_root / "scripts" / "render_wallpaper_samples.py"

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

    def test_auto_iteration_folder_and_metadata_files(self) -> None:
        output_dir = self.workspace / "wallpaper"
        today = "2026-02-20"

        first = self.run_script(
            "--today",
            today,
            "--output-dir",
            str(output_dir),
            "--notes",
            "First visual pass",
        )
        self.assertEqual(first.returncode, 0, msg=first.stderr)

        iter_001 = output_dir / "iter-001"
        self.assertTrue(iter_001.exists())

        manifest_001 = iter_001 / "iter-001-manifest.json"
        details_001 = iter_001 / "iter-001-details.md"
        self.assertTrue(manifest_001.exists())
        self.assertTrue(details_001.exists())

        manifest_data = json.loads(manifest_001.read_text(encoding="utf-8"))
        self.assertEqual(manifest_data["iteration"], 1)
        self.assertEqual(manifest_data["render_date"], today)
        self.assertEqual(manifest_data["notes"], "First visual pass")
        self.assertEqual(manifest_data["sample_count"], 9)
        self.assertEqual(len(manifest_data["samples"]), 9)

        png_files = list(iter_001.glob("*.png"))
        self.assertEqual(len(png_files), 9)

        second = self.run_script(
            "--today",
            today,
            "--output-dir",
            str(output_dir),
            "--notes",
            "Second visual pass",
        )
        self.assertEqual(second.returncode, 0, msg=second.stderr)
        self.assertTrue((output_dir / "iter-002").exists())

        latest = json.loads((output_dir / "latest.json").read_text(encoding="utf-8"))
        self.assertEqual(latest["iteration"], 2)
        self.assertEqual(latest["iteration_name"], "iter-002")

        history_lines = (output_dir / "iteration-history.jsonl").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(history_lines), 2)

    def test_iteration_overwrite_flag(self) -> None:
        output_dir = self.workspace / "wallpaper"

        first = self.run_script(
            "--today",
            "2026-02-20",
            "--output-dir",
            str(output_dir),
            "--iteration",
            "5",
        )
        self.assertEqual(first.returncode, 0, msg=first.stderr)

        second = self.run_script(
            "--today",
            "2026-02-20",
            "--output-dir",
            str(output_dir),
            "--iteration",
            "5",
        )
        self.assertEqual(second.returncode, 1)
        self.assertIn("Refusing to overwrite existing iteration folder", second.stderr)

        third = self.run_script(
            "--today",
            "2026-02-20",
            "--output-dir",
            str(output_dir),
            "--iteration",
            "5",
            "--overwrite",
        )
        self.assertEqual(third.returncode, 0, msg=third.stderr)


if __name__ == "__main__":
    unittest.main()
