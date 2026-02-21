from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import DATA_PATH, DATABASE_PATH, DEV_BEARER_TOKEN, SESSION_TTL_SECONDS
from app.db import ensure_dev_session, get_conn, init_db, upsert_theme
from app.theme import apply_theme_patch, clone_default_theme
from app.utils import create_opaque_token, now_iso, parse_date_key


def is_non_empty_text(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ''


def parse_iso_datetime(value: Any) -> dt.datetime | None:
    if not is_non_empty_text(value):
        return None

    normalized = str(value).strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def expires_at_from_created(created_at: str, session_ttl_seconds: int) -> str:
    created_at_dt = parse_iso_datetime(created_at) or dt.datetime.now(dt.UTC)
    return (created_at_dt + dt.timedelta(seconds=max(1, int(session_ttl_seconds)))).isoformat()


def load_state(source_path: Path) -> dict[str, Any]:
    if not source_path.exists():
        raise FileNotFoundError(f'Source file not found: {source_path}')

    raw = source_path.read_text(encoding='utf-8')
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError('Source JSON must be an object.')

    return parsed


def migrate(source_path: Path, target_path: Path, *, force: bool, skip_backup: bool, ensure_dev: bool) -> None:
    state = load_state(source_path)

    if target_path.exists() and not force:
        raise RuntimeError(f'Target database already exists: {target_path}. Use --force to overwrite.')

    if target_path.exists() and force:
        target_path.unlink()

    init_db(target_path)

    users_raw = state.get('users') if isinstance(state.get('users'), dict) else {}
    sessions_raw = state.get('sessions') if isinstance(state.get('sessions'), dict) else {}

    inserted_users = 0
    inserted_sessions = 0
    inserted_moods = 0
    inserted_themes = 0

    user_ids: set[str] = set()

    with get_conn(target_path) as conn:
        for user_id, user_raw in users_raw.items():
            if not isinstance(user_id, str) or not isinstance(user_raw, dict):
                continue

            apple_sub = user_raw.get('appleSub')
            if not is_non_empty_text(apple_sub):
                apple_sub = f'user_{user_id}'

            wallpaper_token = user_raw.get('wallpaperToken')
            if not is_non_empty_text(wallpaper_token):
                wallpaper_token = create_opaque_token(32)

            created_at = user_raw.get('createdAt')
            if not is_non_empty_text(created_at):
                created_at = now_iso()

            updated_at = user_raw.get('updatedAt')
            if not is_non_empty_text(updated_at):
                updated_at = now_iso()

            conn.execute(
                """
                INSERT INTO users (id, apple_sub, wallpaper_token, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, apple_sub, wallpaper_token, created_at, updated_at),
            )
            user_ids.add(user_id)
            inserted_users += 1

            theme_raw = user_raw.get('theme') if isinstance(user_raw.get('theme'), dict) else {}
            base_theme = clone_default_theme()
            normalized_theme = apply_theme_patch(base_theme, theme_raw)
            upsert_theme(conn, user_id, normalized_theme, updated_at=updated_at)
            inserted_themes += 1

            moods_raw = user_raw.get('moods') if isinstance(user_raw.get('moods'), dict) else {}
            for date_key, mood_raw in moods_raw.items():
                if not isinstance(date_key, str) or parse_date_key(date_key) is None:
                    continue
                if not isinstance(mood_raw, dict):
                    continue

                level = mood_raw.get('level')
                if not isinstance(level, int) or level < 1 or level > 5:
                    continue

                note_raw = mood_raw.get('note')
                note = note_raw.strip()[:240] if isinstance(note_raw, str) and note_raw.strip() else None

                conn.execute(
                    """
                    INSERT INTO moods (user_id, date_key, level, note, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, date_key) DO UPDATE SET
                        level = excluded.level,
                        note = excluded.note,
                        updated_at = excluded.updated_at
                    """,
                    (user_id, date_key, level, note, updated_at),
                )
                inserted_moods += 1

        for token, user_id in sessions_raw.items():
            if not is_non_empty_text(token) or not isinstance(user_id, str) or user_id not in user_ids:
                continue

            created_at = now_iso()
            expires_at = expires_at_from_created(created_at, SESSION_TTL_SECONDS)
            conn.execute(
                """
                INSERT INTO sessions (token, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(token) DO UPDATE SET
                    user_id = excluded.user_id,
                    created_at = excluded.created_at,
                    expires_at = excluded.expires_at
                """,
                (token, user_id, created_at, expires_at),
            )
            inserted_sessions += 1

        if ensure_dev:
            ensure_dev_session(conn, DEV_BEARER_TOKEN, session_ttl_seconds=SESSION_TTL_SECONDS)

        users_count = int(conn.execute('SELECT COUNT(*) AS count FROM users').fetchone()['count'])
        sessions_count = int(conn.execute('SELECT COUNT(*) AS count FROM sessions').fetchone()['count'])
        moods_count = int(conn.execute('SELECT COUNT(*) AS count FROM moods').fetchone()['count'])
        themes_count = int(conn.execute('SELECT COUNT(*) AS count FROM themes').fetchone()['count'])

    if not skip_backup:
        backup_path = source_path.with_suffix(source_path.suffix + '.bak')
        shutil.copy2(source_path, backup_path)

    print('Migration complete')
    print(f'  source:   {source_path}')
    print(f'  target:   {target_path}')
    print(f'  users:    inserted={inserted_users}, db={users_count}')
    print(f'  sessions: inserted={inserted_sessions}, db={sessions_count}')
    print(f'  moods:    inserted={inserted_moods}, db={moods_count}')
    print(f'  themes:   inserted={inserted_themes}, db={themes_count}')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Migrate backend/data.json to SQLite.')
    parser.add_argument('--source', type=Path, default=DATA_PATH, help='Path to legacy JSON file')
    parser.add_argument('--target', type=Path, default=DATABASE_PATH, help='Path to SQLite database file')
    parser.add_argument('--force', action='store_true', help='Overwrite target DB if it exists')
    parser.add_argument('--skip-backup', action='store_true', help='Do not create data.json.bak')
    parser.add_argument('--no-dev-session', action='store_true', help='Do not auto-create the dev session')
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        migrate(
            args.source,
            args.target,
            force=args.force,
            skip_backup=args.skip_backup,
            ensure_dev=not args.no_dev_session,
        )
        return 0
    except Exception as error:
        print(f'Migration failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
