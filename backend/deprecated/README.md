This folder contains archived SQLite-era backend assets that are no longer part of
the active Neon/PostgreSQL runtime path.

## Rules

- Active backend code and CI must not import or execute anything in this folder.
- Assets here are historical references only.
- New backend tests must be added under `backend/tests/`, not here.

## Deprecated Test Status (Retired vs Replaced)

| Deprecated file | Status | Replacement in active suite |
| --- | --- | --- |
| `deprecated/tests/test_api.py` | Partially replaced | `backend/tests/test_api.py` (Postgres API contract coverage) |
| `deprecated/tests/test_api_integration.py` | Partially replaced | Some flows now covered in `backend/tests/test_api.py`; remaining legacy-only scenarios are not yet ported |
| `deprecated/tests/test_db_schema.py` | Retired | No direct replacement yet (SQLite migration behavior is out of scope for Neon runtime) |
| `deprecated/tests/test_migration_script.py` | Retired | No replacement (legacy SQLite migration script is archived/unsupported) |

## Deprecated Script Status

| Deprecated file | Status | Replacement |
| --- | --- | --- |
| `deprecated/scripts/migrate_json_to_sqlite.py` | Retired | None (script intentionally archived and exits with a deprecation error) |
