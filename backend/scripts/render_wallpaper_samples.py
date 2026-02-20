from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.constants import DATE_KEY_FORMAT
from app.theme import clone_default_theme
from app.wallpaper import render_wallpaper_png

ITERATION_DIR_RE = re.compile(r"^iter-(\d+)$")


def parse_today(value: str | None) -> dt.date:
    if not value:
        return dt.date.today()

    return dt.datetime.strptime(value, DATE_KEY_FORMAT).date()


def detect_latest_iteration(output_dir: Path) -> int:
    latest = 0

    if not output_dir.exists():
        return latest

    for child in output_dir.iterdir():
        if not child.is_dir():
            continue

        match = ITERATION_DIR_RE.match(child.name)
        if not match:
            continue

        latest = max(latest, int(match.group(1)))

    return latest


def resolve_iteration(iteration_value: int | None, output_dir: Path) -> int:
    if iteration_value is not None:
        return max(1, iteration_value)

    return detect_latest_iteration(output_dir) + 1


def build_sample_moods(year: int, today: dt.date) -> dict[str, dict[str, int]]:
    moods: dict[str, dict[str, int]] = {}
    cursor = dt.date(year, 1, 1)
    one_day = dt.timedelta(days=1)

    while cursor <= today:
        day_of_year = cursor.timetuple().tm_yday
        if day_of_year % 7 in {0, 1}:
            cursor += one_day
            continue

        moods[cursor.strftime(DATE_KEY_FORMAT)] = {"level": ((day_of_year - 1) % 5) + 1}
        cursor += one_day

    return moods


def build_theme(overrides: dict[str, Any]) -> dict[str, Any]:
    theme = clone_default_theme()
    for key, value in overrides.items():
        if key == "mood_colors" and isinstance(value, dict):
            theme["mood_colors"] = {
                **theme.get("mood_colors", {}),
                **value,
            }
            continue

        theme[key] = value

    return theme


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render wallpaper samples for local visual inspection.")
    parser.add_argument(
        "--today",
        type=str,
        default=None,
        help="Render date in YYYY-MM-DD format (defaults to today).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BACKEND_ROOT / ".artifacts" / "wallpaper",
        help="Directory where sample PNG files will be written.",
    )
    parser.add_argument(
        "--iteration",
        type=int,
        default=None,
        help="Iteration number to write (defaults to auto-increment from existing iter-### folders).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow writing into an existing iteration folder.",
    )
    parser.add_argument(
        "--notes",
        type=str,
        default="",
        help="Optional details about what changed in this iteration.",
    )
    return parser.parse_args()


def format_iter_name(iteration: int) -> str:
    return f"iter-{iteration:03d}"


def write_iteration_metadata(
    output_dir: Path,
    iteration: int,
    iteration_dir: Path,
    today: dt.date,
    mood_count: int,
    notes: str,
    sample_records: list[dict[str, Any]],
) -> None:
    generated_at = dt.datetime.now(dt.UTC).isoformat()
    iter_name = format_iter_name(iteration)
    relative_dir = iteration_dir.relative_to(output_dir)

    manifest = {
        "iteration": iteration,
        "iteration_name": iter_name,
        "generated_at": generated_at,
        "render_date": today.isoformat(),
        "year": today.year,
        "mood_count": mood_count,
        "sample_count": len(sample_records),
        "notes": notes,
        "output_dir": str(relative_dir),
        "samples": sample_records,
    }

    manifest_path = iteration_dir / f"{iter_name}-manifest.json"
    manifest_path.write_text(f"{json.dumps(manifest, indent=2)}\n", encoding="utf-8")

    details_lines = [
        f"# Wallpaper Iteration {iteration:03d}",
        "",
        f"- Generated at: `{generated_at}`",
        f"- Render date: `{today.isoformat()}`",
        f"- Mood entries: `{mood_count}`",
        f"- Sample count: `{len(sample_records)}`",
        f"- Notes: `{notes or 'none'}`",
        "",
        "## Files",
    ]
    for sample in sample_records:
        details_lines.append(
            f"- `{sample['filename']}` | "
            f"columns={sample['theme']['columns']} "
            f"shape={sample['theme']['shape']} "
            f"spacing={sample['theme']['spacing']} "
            f"position={sample['theme']['position']}"
        )

    details_path = iteration_dir / f"{iter_name}-details.md"
    details_path.write_text("\n".join(details_lines) + "\n", encoding="utf-8")

    latest_path = output_dir / "latest.json"
    latest_payload = {
        "iteration": iteration,
        "iteration_name": iter_name,
        "generated_at": generated_at,
        "render_date": today.isoformat(),
        "path": str(relative_dir),
    }
    latest_path.write_text(f"{json.dumps(latest_payload, indent=2)}\n", encoding="utf-8")

    history_path = output_dir / "iteration-history.jsonl"
    history_entry = {
        "iteration": iteration,
        "iteration_name": iter_name,
        "generated_at": generated_at,
        "render_date": today.isoformat(),
        "notes": notes,
        "sample_count": len(sample_records),
        "path": str(relative_dir),
    }
    with history_path.open("a", encoding="utf-8") as history_file:
        history_file.write(f"{json.dumps(history_entry)}\n")


def main() -> int:
    args = parse_args()
    today = parse_today(args.today)

    output_dir = args.output_dir
    if not output_dir.is_absolute():
        output_dir = BACKEND_ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    iteration = resolve_iteration(args.iteration, output_dir)
    iter_name = format_iter_name(iteration)
    iteration_dir = output_dir / iter_name
    if iteration_dir.exists() and not args.overwrite:
        print(
            f"Refusing to overwrite existing iteration folder: {iteration_dir}. "
            "Use --overwrite to update it.",
            file=sys.stderr,
        )
        return 1
    iteration_dir.mkdir(parents=True, exist_ok=True)

    moods = build_sample_moods(today.year, today)

    sample_themes: list[tuple[str, dict[str, Any]]] = [
        ("columns-14-default", {}),
        ("columns-7-classic", {"columns": 7}),
        ("columns-13", {"columns": 13}),
        ("columns-21", {"columns": 21}),
        ("tight-columns-14", {"spacing": "tight"}),
        ("wide-columns-14", {"spacing": "wide"}),
        ("square-center-columns-14", {"shape": "square", "position": "center"}),
        ("light-bg", {"bg_color": "#edf2f8", "empty_color": None}),
        ("warm-bg", {"bg_color": "#1f1510", "empty_color": None}),
    ]

    print(f"Rendering {len(sample_themes)} samples to {iteration_dir} ({iter_name})")
    sample_records: list[dict[str, Any]] = []
    for sample_name, overrides in sample_themes:
        theme = build_theme(overrides)
        png_bytes = render_wallpaper_png({"theme": theme, "moods": moods}, today=today)
        filename = f"{iter_name}-{today.year}-{sample_name}.png"
        output_path = iteration_dir / filename
        output_path.write_bytes(png_bytes)
        print(f"  wrote {output_path}")
        sample_records.append(
            {
                "name": sample_name,
                "filename": filename,
                "overrides": overrides,
                "theme": {
                    "columns": theme.get("columns"),
                    "shape": theme.get("shape"),
                    "spacing": theme.get("spacing"),
                    "position": theme.get("position"),
                    "bg_color": theme.get("bg_color"),
                },
            }
        )

    write_iteration_metadata(
        output_dir=output_dir,
        iteration=iteration,
        iteration_dir=iteration_dir,
        today=today,
        mood_count=len(moods),
        notes=args.notes.strip(),
        sample_records=sample_records,
    )
    print(f"  wrote {iteration_dir / f'{iter_name}-manifest.json'}")
    print(f"  wrote {iteration_dir / f'{iter_name}-details.md'}")
    print(f"  updated {output_dir / 'latest.json'}")
    print(f"  appended {output_dir / 'iteration-history.jsonl'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
