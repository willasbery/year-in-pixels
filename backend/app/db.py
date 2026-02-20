from __future__ import annotations

import datetime as dt
import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .constants import DEFAULT_THEME
from .theme import clone_default_theme, normalize_theme_avoid_lock_screen_ui, normalize_theme_columns
from .utils import create_opaque_token, normalize_hex_color, now_iso

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    apple_sub TEXT UNIQUE NOT NULL,
    wallpaper_token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moods (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_key TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
    note TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS themes (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bg_color TEXT NOT NULL,
    empty_color TEXT,
    shape TEXT NOT NULL CHECK (shape IN ('rounded', 'square')),
    spacing TEXT NOT NULL CHECK (spacing IN ('tight', 'medium', 'wide')),
    position TEXT NOT NULL CHECK (position IN ('clock', 'center')),
    avoid_lock_screen_ui INTEGER NOT NULL DEFAULT 0 CHECK (avoid_lock_screen_ui IN (0, 1)),
    columns INTEGER NOT NULL CHECK (columns BETWEEN 7 AND 31),
    bg_image_url TEXT,
    mood_colors TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_moods_user_id ON moods(user_id);
CREATE INDEX IF NOT EXISTS idx_moods_date_key ON moods(date_key);
"""

_DB_PATH: Path | None = None


def _parse_iso_datetime(value: Any) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"

    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _iso_after_seconds(base: dt.datetime, ttl_seconds: int) -> str:
    return (base + dt.timedelta(seconds=max(1, int(ttl_seconds)))).isoformat()


def _ensure_sessions_schema(conn: sqlite3.Connection, *, default_session_ttl_seconds: int) -> None:
    columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
    if "expires_at" not in columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")

    now_utc = dt.datetime.now(dt.UTC)
    rows = conn.execute("SELECT token, created_at, expires_at FROM sessions").fetchall()
    updates: list[tuple[str, str]] = []
    for token, created_at, expires_at in rows:
        if isinstance(expires_at, str) and expires_at.strip():
            continue
        created_at_dt = _parse_iso_datetime(created_at) or now_utc
        updates.append((_iso_after_seconds(created_at_dt, default_session_ttl_seconds), str(token)))

    if updates:
        conn.executemany("UPDATE sessions SET expires_at = ? WHERE token = ?", updates)


def _ensure_themes_schema(conn: sqlite3.Connection) -> None:
    columns = {str(row[1]) for row in conn.execute("PRAGMA table_info(themes)").fetchall()}
    if "avoid_lock_screen_ui" not in columns:
        conn.execute("ALTER TABLE themes ADD COLUMN avoid_lock_screen_ui INTEGER")

    if "columns" not in columns:
        conn.execute("ALTER TABLE themes ADD COLUMN columns INTEGER")

    rows = conn.execute("SELECT user_id, columns, avoid_lock_screen_ui FROM themes").fetchall()
    updates: list[tuple[int, int, str]] = []
    for user_id, raw_columns, raw_avoid_lock_screen_ui in rows:
        normalized = normalize_theme_columns(raw_columns, DEFAULT_THEME["columns"])
        normalized_avoid = normalize_theme_avoid_lock_screen_ui(
            raw_avoid_lock_screen_ui,
            DEFAULT_THEME["avoid_lock_screen_ui"],
        )
        normalized_avoid_int = 1 if normalized_avoid else 0
        if raw_columns != normalized or raw_avoid_lock_screen_ui != normalized_avoid_int:
            updates.append((normalized, normalized_avoid_int, str(user_id)))

    if updates:
        conn.executemany(
            "UPDATE themes SET columns = ?, avoid_lock_screen_ui = ? WHERE user_id = ?",
            updates,
        )


def configure_db(path: Path) -> None:
    global _DB_PATH
    _DB_PATH = Path(path)


def get_db_path() -> Path:
    if _DB_PATH is None:
        raise RuntimeError('Database path is not configured.')
    return _DB_PATH


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=5000')
    return conn


def init_db(path: Path, *, default_session_ttl_seconds: int = 60 * 60 * 24 * 30) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(path) as conn:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=ON')
        conn.execute('PRAGMA busy_timeout=5000')
        conn.executescript(SCHEMA_SQL)
        _ensure_sessions_schema(conn, default_session_ttl_seconds=default_session_ttl_seconds)
        _ensure_themes_schema(conn)
        conn.commit()


@contextmanager
def get_conn(path: Path | None = None) -> Iterator[sqlite3.Connection]:
    resolved_path = Path(path) if path is not None else get_db_path()
    conn = _connect(resolved_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def normalize_theme_for_storage(theme: dict[str, Any]) -> dict[str, Any]:
    mood_colors_raw = theme.get('mood_colors') if isinstance(theme.get('mood_colors'), dict) else {}
    mood_colors = [
        normalize_hex_color(mood_colors_raw.get(str(level)), DEFAULT_THEME['mood_colors'][str(level)])
        for level in range(1, 6)
    ]

    bg_color = normalize_hex_color(theme.get('bg_color'), DEFAULT_THEME['bg_color'])
    empty_raw = theme.get('empty_color')
    empty_color = None if empty_raw is None else normalize_hex_color(empty_raw, None)

    shape = theme.get('shape') if theme.get('shape') in {'rounded', 'square'} else DEFAULT_THEME['shape']
    spacing = (
        theme.get('spacing')
        if theme.get('spacing') in {'tight', 'medium', 'wide'}
        else DEFAULT_THEME['spacing']
    )
    position = theme.get('position') if theme.get('position') in {'clock', 'center'} else DEFAULT_THEME['position']
    avoid_lock_screen_ui = normalize_theme_avoid_lock_screen_ui(
        theme.get('avoid_lock_screen_ui'),
        DEFAULT_THEME['avoid_lock_screen_ui'],
    )
    columns = normalize_theme_columns(theme.get('columns'), DEFAULT_THEME['columns'])

    bg_image_raw = theme.get('bg_image_url')
    bg_image_url = bg_image_raw if isinstance(bg_image_raw, str) else None

    return {
        'bg_color': bg_color,
        'empty_color': empty_color,
        'shape': shape,
        'spacing': spacing,
        'position': position,
        'avoid_lock_screen_ui': 1 if avoid_lock_screen_ui else 0,
        'columns': columns,
        'bg_image_url': bg_image_url,
        'mood_colors': json.dumps(mood_colors),
    }


def theme_from_row(row: sqlite3.Row | None) -> dict[str, Any]:
    if row is None:
        return clone_default_theme()

    parsed_colors: list[str] = []
    mood_colors_raw = row['mood_colors']
    if isinstance(mood_colors_raw, str):
        try:
            parsed = json.loads(mood_colors_raw)
            if isinstance(parsed, list):
                parsed_colors = [str(item) for item in parsed]
        except json.JSONDecodeError:
            parsed_colors = []

    mood_colors: dict[str, str] = {}
    for idx in range(5):
        level = str(idx + 1)
        source = parsed_colors[idx] if idx < len(parsed_colors) else None
        mood_colors[level] = normalize_hex_color(source, DEFAULT_THEME['mood_colors'][level])

    bg_color = normalize_hex_color(row['bg_color'], DEFAULT_THEME['bg_color'])
    empty_color = normalize_hex_color(row['empty_color'], None) if row['empty_color'] is not None else None
    shape = row['shape'] if row['shape'] in {'rounded', 'square'} else DEFAULT_THEME['shape']
    spacing = row['spacing'] if row['spacing'] in {'tight', 'medium', 'wide'} else DEFAULT_THEME['spacing']
    position = row['position'] if row['position'] in {'clock', 'center'} else DEFAULT_THEME['position']
    avoid_lock_screen_ui_raw = (
        row['avoid_lock_screen_ui']
        if 'avoid_lock_screen_ui' in row.keys()
        else DEFAULT_THEME['avoid_lock_screen_ui']
    )
    avoid_lock_screen_ui = normalize_theme_avoid_lock_screen_ui(
        avoid_lock_screen_ui_raw,
        DEFAULT_THEME['avoid_lock_screen_ui'],
    )
    columns_raw = row['columns'] if 'columns' in row.keys() else DEFAULT_THEME['columns']
    columns = normalize_theme_columns(columns_raw, DEFAULT_THEME['columns'])
    bg_image_url = row['bg_image_url'] if isinstance(row['bg_image_url'], str) else None

    return {
        'bg_color': bg_color,
        'mood_colors': mood_colors,
        'empty_color': empty_color,
        'shape': shape,
        'spacing': spacing,
        'position': position,
        'avoid_lock_screen_ui': avoid_lock_screen_ui,
        'columns': columns,
        'bg_image_url': bg_image_url,
    }


def upsert_theme(conn: sqlite3.Connection, user_id: str, theme: dict[str, Any], updated_at: str | None = None) -> None:
    timestamp = updated_at or now_iso()
    normalized = normalize_theme_for_storage(theme)

    conn.execute(
        """
        INSERT INTO themes (
            user_id,
            bg_color,
            empty_color,
            shape,
            spacing,
            position,
            avoid_lock_screen_ui,
            columns,
            bg_image_url,
            mood_colors,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            bg_color = excluded.bg_color,
            empty_color = excluded.empty_color,
            shape = excluded.shape,
            spacing = excluded.spacing,
            position = excluded.position,
            avoid_lock_screen_ui = excluded.avoid_lock_screen_ui,
            columns = excluded.columns,
            bg_image_url = excluded.bg_image_url,
            mood_colors = excluded.mood_colors,
            updated_at = excluded.updated_at
        """,
        (
            user_id,
            normalized['bg_color'],
            normalized['empty_color'],
            normalized['shape'],
            normalized['spacing'],
            normalized['position'],
            normalized['avoid_lock_screen_ui'],
            normalized['columns'],
            normalized['bg_image_url'],
            normalized['mood_colors'],
            timestamp,
        ),
    )


def get_theme(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    row = conn.execute('SELECT * FROM themes WHERE user_id = ?', (user_id,)).fetchone()
    if row is None:
        default_theme = clone_default_theme()
        upsert_theme(conn, user_id, default_theme)
        return default_theme

    return theme_from_row(row)


def create_user(conn: sqlite3.Connection, apple_sub: str) -> str:
    user_id = str(uuid.uuid4())
    timestamp = now_iso()

    for _ in range(5):
        wallpaper_token = create_opaque_token(32)
        try:
            conn.execute(
                """
                INSERT INTO users (id, apple_sub, wallpaper_token, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, apple_sub, wallpaper_token, timestamp, timestamp),
            )
            upsert_theme(conn, user_id, clone_default_theme(), updated_at=timestamp)
            return user_id
        except sqlite3.IntegrityError:
            continue

    raise RuntimeError('Unable to allocate unique wallpaper token for user.')


def create_session(conn: sqlite3.Connection, user_id: str, *, session_ttl_seconds: int) -> tuple[str, str]:
    created_at = now_iso()
    created_at_dt = _parse_iso_datetime(created_at) or dt.datetime.now(dt.UTC)
    expires_at = _iso_after_seconds(created_at_dt, session_ttl_seconds)

    for _ in range(5):
        token = create_opaque_token(24)
        try:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, user_id, created_at, expires_at),
            )
            return token, expires_at
        except sqlite3.IntegrityError:
            continue

    raise RuntimeError("Unable to allocate unique session token.")


def rotate_session(
    conn: sqlite3.Connection,
    *,
    old_token: str,
    user_id: str,
    session_ttl_seconds: int,
) -> tuple[str, str]:
    new_token, expires_at = create_session(conn, user_id, session_ttl_seconds=session_ttl_seconds)
    conn.execute("DELETE FROM sessions WHERE token = ?", (old_token,))
    return new_token, expires_at


def prune_expired_sessions(conn: sqlite3.Connection) -> None:
    now = now_iso()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))


def ensure_dev_session(conn: sqlite3.Connection, dev_bearer_token: str, *, session_ttl_seconds: int) -> None:
    if not dev_bearer_token:
        return

    existing_session = conn.execute(
        'SELECT user_id FROM sessions WHERE token = ?',
        (dev_bearer_token,),
    ).fetchone()
    if existing_session is not None:
        user_exists = conn.execute('SELECT 1 FROM users WHERE id = ?', (existing_session['user_id'],)).fetchone()
        if user_exists is not None:
            created_at = now_iso()
            created_at_dt = _parse_iso_datetime(created_at) or dt.datetime.now(dt.UTC)
            expires_at = _iso_after_seconds(created_at_dt, session_ttl_seconds)
            conn.execute(
                "UPDATE sessions SET created_at = ?, expires_at = ? WHERE token = ?",
                (created_at, expires_at, dev_bearer_token),
            )
            return

    timestamp = now_iso()
    timestamp_dt = _parse_iso_datetime(timestamp) or dt.datetime.now(dt.UTC)
    expires_at = _iso_after_seconds(timestamp_dt, session_ttl_seconds)
    user_row = conn.execute('SELECT id FROM users WHERE apple_sub = ?', ('dev-local-user',)).fetchone()

    if user_row is None:
        user_id = create_user(conn, 'dev-local-user')
    else:
        user_id = str(user_row['id'])

    conn.execute(
        """
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
            user_id = excluded.user_id,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        """,
        (dev_bearer_token, user_id, timestamp, expires_at),
    )

    conn.execute('UPDATE users SET updated_at = ? WHERE id = ?', (timestamp, user_id))
