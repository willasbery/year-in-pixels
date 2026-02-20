# Production Checklist (Minimal)

Use this when bringing up production quickly for this app.

## 1) Configure server env

Use `backend/.env.production.example` as the source and set real values:

- `APP_ENV=production`
- `PUBLIC_BASE_URL=<your production API URL>`
- `CORS_ALLOW_ORIGINS=<your frontend origin(s)>`
- `APPLE_CLIENT_IDS=<your Apple client ID(s)>`
- `ALLOW_INSECURE_APPLE_AUTH=false`
- `DATABASE_URL=/data/pixels.db` (or your chosen path)

## 2) Configure GitHub deploy secrets

In repo settings, add:

- `DROPLET_IP`
- `DROPLET_SSH_KEY`

Deploy workflow: `.github/workflows/deploy.yml`

## 3) First deploy / update deploy

On push to `main` (backend changes), workflow deploys and runs smoke check:

- `GET http://127.0.0.1:3000/health`

Manual run is also available through Actions (`workflow_dispatch`).

## 4) Rollback command

If deployment is bad:

```bash
ssh root@<droplet-ip>
cd /opt/pixels/backend
git fetch origin
git checkout <good-commit-sha>
docker compose -f docker-compose.production.yml up -d --build
curl -fsS http://127.0.0.1:3000/health
```

## 5) Post-deploy sanity checks

- App can sign in (`POST /auth/apple` from real client flow)
- Authenticated endpoints return expected data (`/theme`, `/moods`)
- Wallpaper endpoint resolves (`/w/<token>`)
