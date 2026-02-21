These tests are archived from the SQLite era and are not part of the supported
Neon/PostgreSQL test flow.

## Status Map

| File | Status | Active replacement |
| --- | --- | --- |
| `test_api.py` | Partially replaced | `backend/tests/test_api.py` |
| `test_api_integration.py` | Partially replaced | Portions covered by `backend/tests/test_api.py` |
| `test_db_schema.py` | Retired | None |
| `test_migration_script.py` | Retired | None |

## Notes

- Do not add new tests in this folder.
- Do not wire this folder back into CI.
- If behavior is still required, port it into `backend/tests/` against Postgres.
