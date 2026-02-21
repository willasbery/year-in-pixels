This folder contains archived SQLite-era backend assets that are no longer part of
the active Neon/PostgreSQL runtime path.

- `deprecated/scripts/`: legacy one-off migration tooling
- `deprecated/tests/`: legacy tests that depended on SQLite file-based databases

Active backend code should not import or depend on anything in this folder.
