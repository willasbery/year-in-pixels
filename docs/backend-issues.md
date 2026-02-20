# Backend Issues

Identified by code review on 2026-02-19. Ordered by severity within each category.

---

## Critical

### #5 — Expired session DELETE always rolls back
**File:** `app/auth.py`

`require_auth` deletes expired sessions inside a `with get_conn() as conn:` block, then raises `HTTPException`. The context manager catches any exception and calls `conn.rollback()` before re-raising — so the DELETE never commits. Expired sessions accumulate indefinitely. Combined with #24 (prune only runs at startup), they are effectively never cleaned up between restarts.

### #6 — Session rotation header sent before transaction commits
**File:** `app/auth.py` ~line 96

After rotating a session token, `request.state.refreshed_session_token` is set before the `with get_conn()` block exits. The middleware in `main.py` reads this and writes it to the `X-Session-Token` response header. If any exception is raised after rotation but before commit, the DB rolls back — the new token never exists — but the header has already been sent. The client stores a token that returns 401 on every subsequent request, effectively locking them out until they sign in again.

### #1 — Raw internal errors leaked to clients
**File:** `app/routes/auth.py` line 28

```python
raise HTTPException(status_code=401, detail=str(error)) from error
```

Every `ValueError` from `verify_identity_token` — including raw Python messages like `"Expecting value: line 1 column 1 (char 0)"` and `"Incorrect padding"` — is forwarded verbatim as the API response body. All Apple identity verification errors should map to a single generic message: `"Invalid identity token."`.

---

## High

### #13 — Wallpaper render blocks the async event loop
**File:** `app/routes/wallpaper.py` line 43

```python
png_bytes = render_wallpaper_png({"theme": theme, "moods": moods})
```

`render_wallpaper_png` fills 1,290 × 2,796 = ~3.6 million pixels via nested Python for-loops, taking 3–8 seconds of CPU time. It is called directly inside an `async def` handler with no `run_in_executor`. Every cache miss stalls the entire asyncio event loop for the full render duration, blocking all other requests. Should be wrapped in `asyncio.get_event_loop().run_in_executor(None, ...)`.

### #2 — Rate limiter bypassable via `X-Forwarded-For` spoofing
**File:** `app/rate_limiter.py` ~line 65

```python
forwarded_for = request.headers.get("x-forwarded-for")
if forwarded_for:
    first = forwarded_for.split(",", 1)[0].strip()
    return first
```

`X-Forwarded-For` is a client-controlled header. Without a trusted proxy stripping or overwriting it, an attacker can send arbitrary IPs and cycle through them to bypass the auth rate limit entirely. Should either rely solely on `request.client.host` or configure Uvicorn's `--forwarded-allow-ips` to only trust the proxy's additions.

### #7 — Rate limiter leaks memory
**File:** `app/rate_limiter.py` lines 58–60

The `_requests` dict grows without bound. One entry is created per unique IP that has ever hit a rate-limited endpoint and is never removed. See also #20 (the cleanup branch intended to fix this is dead code).

### #11 — Apple JWKS fetch blocks event loop under lock
**File:** `app/apple_identity.py` ~line 167

`_get_signing_key` acquires `self._lock` and then calls `_fetch_apple_jwks`, which does a blocking `urllib.request.urlopen` (up to 3 seconds). This blocks the entire asyncio event loop on every JWKS refresh. Should be moved to a thread via `run_in_executor`, or replaced with an async HTTP client.

### #12 — JWKS response body read with no size limit
**File:** `app/apple_identity.py` ~line 171

```python
payload = response.read().decode("utf-8")
```

`response.read()` with no argument reads the full body into memory. A compromised or misbehaving JWKS endpoint could return a very large response, causing a memory spike. Should cap with `response.read(65536)` or similar.

---

## Medium

### #9 — `bool` passes mood level validation
**File:** `app/routes/moods.py` line 53

```python
if not isinstance(level, int) or level < 1 or level > 5:
```

In Python, `bool` is a subclass of `int`, so `isinstance(True, int)` is `True`. A JSON payload of `{"level": true}` passes validation and stores `1` in the database. Fix by adding `or isinstance(level, bool)` to the guard.

### #8 — `get_theme` performs writes inside GET handlers
**File:** `app/db.py` ~line 257

When a user has no theme row, `get_theme` silently inserts one. This is called from both `GET /theme` (authenticated) and `GET /w/{token}` (public, unauthenticated). A public endpoint triggering DB writes on first access is unexpected and violates GET idempotency. The default theme should be returned without being persisted, or the insert should only happen at user creation time.

### #16 — Wallpaper query fetches all years of moods
**File:** `app/routes/wallpaper.py` lines 29–32

```python
conn.execute("SELECT date_key, level, note FROM moods WHERE user_id = ?", (user_id,))
```

The renderer only draws the current year, but this query returns every mood ever logged by the user. After a few years of use, this fetches and then silently discards hundreds of irrelevant rows. Should filter by year, matching the approach in `GET /moods`.

### #15 — Sessions with NULL `expires_at` are never pruned
**File:** `app/db.py` ~line 320

```python
conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
```

SQLite evaluates `NULL <= <value>` as `NULL` (falsy), so rows with a `NULL` or malformed `expires_at` are never matched. In `auth.py`, such a session always hits the expiry branch, returning 401 — but the DELETE rolls back (#5), leaving it stuck in the DB forever. The prune query should also cover `OR expires_at IS NULL`.

### #19 — Inconsistent sentinel pattern in theme patching
**File:** `app/theme.py` lines 50–75

`empty_color` uses the string `"__missing__"` as a sentinel — a value any client could accidentally send for real, causing the field update to be silently ignored. `bg_image_url` correctly uses `object()` as an unforgeable sentinel, but then redundantly checks `!= "__missing__"` on it (a dead branch, since an `object()` is never a string). Both fields should use the `object()` pattern.

---

## Low / Cleanup

### #17 — Redundant index on `moods.user_id`
**File:** `app/db.py` line 53

```sql
CREATE INDEX IF NOT EXISTS idx_moods_user_id ON moods(user_id);
```

The `moods` table has `PRIMARY KEY (user_id, date_key)`. SQLite automatically creates a B-tree index on the composite PK with `user_id` as the leading column, so `WHERE user_id = ?` queries already use it. This explicit index is redundant — it wastes space and adds overhead to every INSERT/UPDATE/DELETE on `moods`.

### #18 — Two DB connections per wallpaper cache miss
**File:** `app/routes/wallpaper.py`

The user lookup (token → user_id) and the theme + moods fetch happen in two separate `with get_conn()` blocks. They could share a single connection, reducing overhead and ensuring the reads are consistent.

### #20 — Dead cleanup branch in rate limiter
**File:** `app/rate_limiter.py` lines 58–60

```python
request_times.append(now)
if not request_times:   # always False after append
    self._requests.pop(key, None)
```

The condition is evaluated after the append, making it unreachable. This was clearly intended to free dict entries for IPs with empty deques, but it never fires. This is the root cause of #7.

### #21 — `app = create_app()` executes at module import time
**File:** `app/main.py` line 172

Importing the module runs `init_db`, `prune_expired_sessions`, `ensure_dev_session`, and JWKS verifier construction. Any test or tool that imports the module without the right environment variables set will trigger DB file creation on disk. Tests should import only `create_app` and call it explicitly with test parameters.

### #22 — `DATA_PATH` defined but unused in main app
**File:** `app/config.py` line 63

Leftover from before the SQLite migration. Only referenced in the migration script. Should either be moved there or removed from `config.py`.

### #23 — No rate limit on `POST /token/rotate`
**File:** `app/routes/token.py`

A valid session holder can rotate their wallpaper token at full request rate. Requires a valid session so the risk is low, but it could be used to spam DB UPDATEs. A simple per-user rate limit would be sufficient.

### #24 — Session pruning only runs at startup
**File:** `app/main.py`

`prune_expired_sessions` is called once in `create_app`. On a long-running server, expired sessions accumulate between restarts. Combined with #5 (the per-request DELETE always rolls back), there is no effective cleanup path during normal operation. A periodic background task or a prune-on-auth-check approach is needed.

### #10 — `_ensure_sessions_schema` loads full sessions table on every startup
**File:** `app/db.py` ~line 82

A migration helper that backfills `expires_at` for old sessions fetches the entire sessions table into memory on every startup regardless of whether any rows need updating. Should query `WHERE expires_at IS NULL OR expires_at = ''` first, and skip the migration entirely if there are no matching rows.
