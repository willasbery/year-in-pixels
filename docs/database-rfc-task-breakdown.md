# Database RFC Task Breakdown

Derived from `docs/rfc-database.md`.

## Phase 0: Planning and Guardrails
- [x] Confirm route/API contract must remain unchanged.
- [x] Identify all `StateStore` usages and map replacements.
- [ ] Add/expand backend tests for migration edge cases (invalid rows, missing fields, duplicates).

## Phase 1: SQLite Foundation
- [x] Add `backend/app/db.py` with:
  - Schema creation (`users`, `sessions`, `moods`, `themes`)
  - WAL + foreign key pragmas
  - Connection context manager with commit/rollback behavior
  - Theme row serialization/deserialization helpers
- [x] Add DB path config (`DATABASE_URL`) in `backend/app/config.py`.
- [x] Initialize DB during app startup and ensure dev session exists.

## Phase 2: Route Migration off `StateStore`
- [x] `routes/auth.py` migrated to SQL (`/auth/apple`, `/auth/session`).
- [x] `routes/moods.py` migrated to SQL (year query, upsert, delete).
- [x] `routes/theme.py` migrated to SQL (read + upsert theme).
- [x] `routes/token.py` migrated to SQL (read + rotate wallpaper token).
- [x] `routes/wallpaper.py` migrated to SQL (lookup by token + render payload assembly).
- [x] Remove `backend/app/store.py` after migration script and docs are finalized.

## Phase 3: Data Migration Script
- [x] Add `backend/scripts/migrate_json_to_sqlite.py`.
- [x] Import users/sessions/moods/theme with normalization.
- [x] Print row-count summary for verification.
- [x] Write backup copy (`data.json.bak`) by default.
- [ ] Add migration dry-run mode.

## Phase 4: Documentation + Ops
- [x] Update backend README for SQLite defaults and migration command.
- [ ] Document DigitalOcean path + systemd env usage in deploy docs.
- [ ] Add backup/restore runbook snippet.

## Phase 5: Verification
- [x] Run backend test suite after route migration.
- [ ] Run migration script on a copied real dataset and validate parity manually.
- [ ] Add CI coverage for migration script.
