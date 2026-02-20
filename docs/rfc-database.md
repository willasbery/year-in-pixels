# RFC: Replacing the File-Backed Store with SQLite

**Status:** Draft
**Date:** 2026-02-19

---

## Problem

The current backend persists all state in a single `data.json` file, managed by an in-process `StateStore` class with a threading lock. This works for a single developer, but has several practical problems:

- **No crash safety.** A write in the middle of a process kill corrupts the whole file.
- **Poor concurrency.** The global lock serialises every request; the full JSON file is rewritten on every mood save.
- **No history.** Overwriting a mood entry destroys the previous value.
- **Harder to inspect or repair.** You can't run ad-hoc queries or fix bad data without writing Python.
- **Doesn't survive a `rm data.json` mistake**, and there's no obvious backup story on a Droplet.

---

## Proposed Solution: SQLite via `sqlite3` (stdlib)

SQLite is the right call for this app at this scale:

- Ships with Python — zero extra dependencies.
- A single `.db` file on disk, easy to back up with `cp` or `scp`.
- ACID-compliant: writes are atomic, crashes leave the DB consistent.
- WAL mode allows concurrent reads alongside a single writer (fine for one Uvicorn process).
- You can open it with any SQLite client (`sqlite3` CLI, TablePlus, etc.) to inspect or repair data.
- On a DigitalOcean Droplet the file just lives at e.g. `/var/data/pixels.db` — back it up with a daily cron + `rclone` to an S3-compatible bucket.

**Not recommended for this project:**
- PostgreSQL — much better at scale, but requires a separate process, connection pooling, and a managed database add-on (~$15/mo extra). Overkill until you have many users.
- SQLAlchemy / an ORM — adds a dependency and abstraction layer that isn't needed here. Raw `sqlite3` with a thin wrapper is fine.

---

## Schema

Four tables replace the nested JSON structure. The existing data model maps cleanly.

```sql
-- One row per Apple Sign In identity
CREATE TABLE users (
    id            TEXT PRIMARY KEY,          -- UUID
    apple_sub     TEXT UNIQUE NOT NULL,      -- hashed Apple sub or 'dev-local-user'
    wallpaper_token TEXT UNIQUE NOT NULL,    -- opaque 256-bit token for /w/<token>
    created_at    TEXT NOT NULL,             -- ISO-8601
    updated_at    TEXT NOT NULL
);

-- Bearer tokens → user, replaces sessions dict
CREATE TABLE sessions (
    token         TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL
);

-- One row per logged day
CREATE TABLE moods (
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date_key      TEXT NOT NULL,             -- 'YYYY-MM-DD'
    level         INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
    note          TEXT,                      -- nullable, max 240 chars enforced in app
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, date_key)
);

-- Theme stored as flat columns (avoids re-parsing JSON blobs)
CREATE TABLE themes (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    shape         TEXT NOT NULL DEFAULT 'square',
    spacing       TEXT NOT NULL DEFAULT 'medium',
    colors        TEXT NOT NULL,             -- JSON array of 5 hex strings
    updated_at    TEXT NOT NULL
);
```

**Why flat columns for theme instead of a JSON blob?**
A JSON blob would be simpler to write, but it makes schema evolution harder (you can't add a column with a default, you have to parse/re-serialize). Flat columns also let SQLite enforce types. The `colors` field is the one exception — five hex strings as a JSON array is reasonable there.

---

## New File Layout

```
backend/app/
├── db.py          # connection helper, migrations, table setup
├── store.py       # REMOVED (replaced by direct db calls in routes)
└── routes/
    ├── auth.py    # uses db directly
    ├── moods.py   # uses db directly
    ├── theme.py   # uses db directly
    ├── token.py   # uses db directly
    └── wallpaper.py
```

`store.py` is deleted. Routes talk to `db.py` via a `get_db()` dependency.

---

## `db.py` Sketch

```python
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH: Path  # set from config / env var

def init_db(path: Path) -> None:
    """Run once at startup: create tables, enable WAL, set pragmas."""
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(SCHEMA_SQL)   # the CREATE TABLE IF NOT EXISTS block

@contextmanager
def get_conn():
    """Per-request connection. FastAPI dependency or plain context manager."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

Routes open a connection per request. This is slightly slower than a connection pool but safe for a single-process Uvicorn instance. If you later move to multiple workers, switch to a library like `aiosqlite` or a proper pool.

---

## Migration from `data.json`

A one-shot migration script reads the existing file and inserts into SQLite. Run this on the Droplet before switching over.

```
backend/scripts/migrate_json_to_sqlite.py
```

Steps:
1. Read `data.json`
2. Insert each user → `users`
3. Insert their sessions → `sessions`
4. Insert their moods → `moods`
5. Insert their theme → `themes`
6. Verify row counts match, print a summary
7. Keep `data.json` as `data.json.bak` — don't delete it until you're confident

---

## Deployment on DigitalOcean Droplet

**Recommended: Basic Droplet**
- $6/mo (512 MB RAM, 1 vCPU, 10 GB SSD) is more than enough for personal use
- Run the FastAPI app with `uvicorn` behind `nginx` as a reverse proxy
- Use `systemd` to keep Uvicorn alive across reboots

**Database file location**
```
/var/data/year-in-pixels/pixels.db
```

Set via env var:
```bash
# /etc/systemd/system/pixels-api.service
Environment="DATABASE_URL=/var/data/year-in-pixels/pixels.db"
```

**Backups**
Simple cron job, daily:
```bash
# /etc/cron.d/pixels-backup
0 3 * * * root sqlite3 /var/data/year-in-pixels/pixels.db ".backup /var/backups/pixels-$(date +\%Y\%m\%d).db" && find /var/backups -name 'pixels-*.db' -mtime +30 -delete
```
This uses SQLite's built-in online backup, which is safe to run while the app is live. Copy the `.db` files off-box with `rclone` to Backblaze B2 or DigitalOcean Spaces for off-site backup.

**nginx config (minimal)**
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Use `certbot` (Let's Encrypt) for the TLS certificate — free and auto-renews.

---

## What Doesn't Change

- All existing HTTP API routes and their request/response shapes stay identical
- The wallpaper token system is unchanged
- The dev bearer token still works the same way
- Auth flow with Apple Sign In is unchanged

The frontend won't need any changes.

---

## Rough Implementation Order

1. Write `db.py` (schema, `init_db`, `get_conn`)
2. Rewrite `store.py` → remove, replace route-by-route:
   - `routes/auth.py` — `find_user_by_apple_sub`, `create_user`, session insert
   - `routes/moods.py` — simple CRUD against `moods` table
   - `routes/theme.py` — upsert into `themes` table
   - `routes/token.py` — update `wallpaper_token` on `users`
   - `routes/wallpaper.py` — lookup by `wallpaper_token`
3. Write `scripts/migrate_json_to_sqlite.py`
4. Update `main.py` to call `init_db()` on startup instead of constructing `StateStore`
5. Update `pyproject.toml` — no new deps needed, `sqlite3` is stdlib
6. Test locally, run migration script, verify parity
7. Deploy to Droplet

---

## Open Questions

- **Multiple years of moods per user** — the current API already handles this correctly (`?year=YYYY` filter) and the `moods` table supports it natively.
- **Session expiry** — currently sessions never expire. Worth adding an `expires_at` column to `sessions` and a cleanup job, but not required for the migration.
- **Read replicas / scaling** — not relevant yet. If the app ever grows, migrate to Postgres at that point. The schema above maps directly to Postgres with minimal changes (swap `TEXT` PKs for `UUID`, `TEXT` timestamps for `TIMESTAMPTZ`).
