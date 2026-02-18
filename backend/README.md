## Year in Pixels Backend (FastAPI)

### Directory layout

- `main.py`: thin runtime entrypoint (`uvicorn main:app`)
- `app/main.py`: app factory + middleware + exception handlers
- `app/routes/`: split route handlers by domain (`auth`, `moods`, `theme`, `token`, `wallpaper`, `system`)
- `app/api.py`: compatibility router export
- `app/store.py`: file-backed state store
- `app/theme.py`: theme validation/patching/serialization
- `app/wallpaper.py`: PNG wallpaper renderer
- `app/auth.py`: bearer token parsing + auth guard
- `tests/`: backend tests (ASGI route coverage)

### Run locally

```bash
UV_CACHE_DIR=../.uv-cache uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

### Run tests

```bash
UV_CACHE_DIR=../.uv-cache uv run python -m unittest discover -s tests -v
```

### Optional env vars

- `EXPO_PUBLIC_DEV_BEARER_TOKEN` (default: `cheese`)
- `PUBLIC_BASE_URL` (used for absolute wallpaper URL responses)
- `PORT` (default: `3000`)

### Data persistence

Local state is stored in `backend/data.json`.
