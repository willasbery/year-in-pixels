## Year in Pixels Backend (FastAPI)

### Directory layout

- `main.py`: thin runtime entrypoint (`uvicorn main:app`)
- `app/main.py`: app factory + middleware + exception handlers
- `app/routes/`: split route handlers by domain (`auth`, `moods`, `theme`, `token`, `wallpaper`, `system`)
- `app/api.py`: compatibility router export
- `app/db.py`: SQLite schema + connection helpers
- `app/theme.py`: theme validation/patching/serialization
- `app/wallpaper.py`: PNG wallpaper renderer
- `app/auth.py`: bearer token parsing + auth guard
- `tests/`: backend tests (ASGI route coverage)

### Run locally

```bash
UV_CACHE_DIR=../.uv-cache uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

### Environment variables

Comprehensive template:

- `backend/.env.example` (all supported keys + defaults)
- `backend/.env.staging.example` and `backend/.env.production.example` (deployment-focused presets)

- `APP_ENV` (`local`, `staging`, `production`; default: `local`)
- `PORT` (default: `3000`)
- `PUBLIC_BASE_URL` (used for absolute wallpaper URL responses)
- `CORS_ALLOW_ORIGINS` (comma-separated origin allowlist; required outside `local`)
- `APPLE_CLIENT_IDS` (comma-separated allowed Apple audience/client IDs; required outside local unless insecure auth is enabled)
- `ALLOW_INSECURE_APPLE_AUTH` (default: `true` in `local`, `false` otherwise; always forced to `false` in `production`)
- `APPLE_JWKS_URL` (default: `https://appleid.apple.com/auth/keys`)
- `APPLE_ISSUER` (default: `https://appleid.apple.com`)
- `APPLE_JWKS_CACHE_TTL_SECONDS` (default: `3600`)
- `SESSION_TTL_SECONDS` (default: `2592000` / 30 days)
- `SESSION_ROTATE_INTERVAL_SECONDS` (default: `86400` / 1 day)
- `AUTH_RATE_LIMIT_MAX_REQUESTS` (default: `30`)
- `AUTH_RATE_LIMIT_WINDOW_SECONDS` (default: `60`)
- `AUTH_RATE_LIMIT_BLOCK_SECONDS` (default: `300`)
- `DATABASE_URL` (SQLite path, default: `backend/data.db`)
- `DEV_BEARER_TOKEN` or `EXPO_PUBLIC_DEV_BEARER_TOKEN`
  - default in `local`: `cheese`
  - default in `staging`: empty (set explicitly only if you want a staging bypass token)
  - in `production`: always disabled

### Auth/session behavior

- Session tokens expire (`SESSION_TTL_SECONDS`).
- The API may rotate session tokens on authenticated requests.
- When rotation happens, responses include:
  - `X-Session-Token`
  - `X-Session-Expires-At`
- Native/web app clients in this repo already apply rotated tokens automatically.
- External clients should persist replacement tokens when those headers are present.
- Explicit refresh endpoint is available: `POST /auth/session/refresh`.

### Production preflight checklist

- `APP_ENV=production`
- `ALLOW_INSECURE_APPLE_AUTH=false`
- `APPLE_CLIENT_IDS` is set to real app bundle/service IDs
- `CORS_ALLOW_ORIGINS` is set (no wildcard)
- `PUBLIC_BASE_URL` points at the production API origin
- `DEV_BEARER_TOKEN` / `EXPO_PUBLIC_DEV_BEARER_TOKEN` is empty (ignored in production anyway)

### Containerize backend

Build image:

```bash
cd backend
docker build -t year-in-pixels-api .
```

Run staging:

```bash
cd backend
cp .env.staging.example .env.staging
docker compose -f docker-compose.staging.yml up -d --build
```

Run production:

```bash
cd backend
cp .env.production.example .env.production
docker compose -f docker-compose.production.yml up -d --build
```

Stop an environment:

```bash
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.production.yml down
```

### Simple GitHub deploy

Workflow: `.github/workflows/deploy.yml`

- Trigger: push to `main` (backend changes) or manual dispatch.
- Action:
  - SSH into droplet
  - `git pull --ff-only`
  - `docker compose -f docker-compose.production.yml up -d --build`
  - smoke check `GET /health`

Required GitHub Actions secrets:

- `DROPLET_IP`
- `DROPLET_SSH_KEY`

### Manual rollback

If latest deploy is bad, redeploy a previous commit:

```bash
ssh root@<droplet-ip>
cd /opt/pixels/backend
git fetch origin
git checkout <good-commit-sha>
docker compose -f docker-compose.production.yml up -d --build
curl -fsS http://127.0.0.1:3000/health
```

### Data persistence

Local state is stored in SQLite at `backend/data.db` by default.

Containerized state is persisted in Docker named volumes:

- staging: `pixels_staging_data`
- production: `pixels_production_data`

To migrate an existing JSON store:

```bash
UV_CACHE_DIR=../.uv-cache uv run python scripts/migrate_json_to_sqlite.py
```

### Run tests

```bash
UV_CACHE_DIR=../.uv-cache uv run python -m unittest discover -s tests -v
```
