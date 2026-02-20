# Recent Updates (2026-02)

This note summarizes the implementation changes made recently across frontend, backend, and CI.

## Frontend Quality Tooling

### Test runner migration
- Frontend tests now run with Vitest instead of Bun.
- Scripts:
  - `pnpm run test` -> `vitest run`
  - `pnpm run test:watch` -> `vitest`
- Config:
  - `frontend/vitest.config.ts`
  - Node test environment
  - `@` alias mapped to project root

### Lint + build scripts
- Added `pnpm run lint` (`expo lint`)
- Added `pnpm run build` (`expo export --platform web --output-dir dist`)
- Added ESLint flat config in `frontend/eslint.config.js` using `eslint-config-expo/flat`

### Added regression coverage
- `frontend/lib/__tests__/date.test.ts`
  - validates past-year and future-year `isFuture`/`isToday` behavior
- `frontend/lib/__tests__/stats.test.ts`
  - validates streak is `0` when today has no entry

## CI/CD

### New CI workflow
File: `.github/workflows/ci.yml`

Runs on:
- `push` to `main`
- all `pull_request`s
- manual trigger (`workflow_dispatch`)

Jobs:
- Frontend job:
  - install deps
  - `pnpm run lint`
  - `pnpm run typecheck`
  - `pnpm run test`
  - `pnpm run build`
  - upload `frontend/dist` artifact
- Backend job:
  - `uv sync --locked`
  - `uv run python -m unittest discover -s tests -v`
  - `uv run python -m compileall app main.py`

## Backend Environment Configuration

### New environment templates
- `backend/.env.example` (full local template with all supported keys)
- `backend/.env.staging.example`
- `backend/.env.production.example`

These include:
- runtime env + port
- CORS/public URL config
- SQLite path config (`DATABASE_URL`)
- Apple Sign In verification config
- session lifetime + rotation controls
- auth rate-limiting controls
- dev bearer token behavior notes

`backend/README.md` was also updated to reference these templates and document defaults.

## Onboarding UX Improvements

### Auto-advance after sign-in
- In `frontend/app/onboarding.tsx`, successful Apple sign-in now automatically advances from the login step to the next onboarding step.

### Progress dots pinned to bottom
- Onboarding progress dots were moved to the footer action area so they stay at the bottom, beneath the Back/Next buttons.

## Dev Testing Utility

### Force logout button (dev-only)
- Added in `frontend/app/(tabs)/settings.tsx`
- Visible only in `__DEV__`
- Behavior:
  - clears local session
  - resets store auth/data state
  - resets onboarding completion flag (best-effort)
  - routes to onboarding login (`/onboarding?step=login`)

## Local Verification Commands

From `frontend/`:
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`

From `backend/`:
- `UV_CACHE_DIR=../.uv-cache uv run python -m unittest discover -s tests -v`
- `UV_CACHE_DIR=../.uv-cache uv run python -m compileall app main.py`
