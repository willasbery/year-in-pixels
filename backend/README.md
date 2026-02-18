## Year in Pixels Backend (FastAPI)

### Run locally

```bash
UV_CACHE_DIR=../.uv-cache uv run python -m uvicorn main:app --host 0.0.0.0 --port 3000
```

### Optional env vars

- `EXPO_PUBLIC_DEV_BEARER_TOKEN` (default: `cheese`)
- `PUBLIC_BASE_URL` (used for absolute wallpaper URL responses)
- `PORT` (default: `3000`)

### Data persistence

Local state is stored in `backend/data.json`.
