# RFC: Docker Deployment on DigitalOcean Droplet

**Status:** Draft
**Date:** 2026-02-19

---

> Note: this is a design RFC and includes optional/alternative deployment shapes.
> For the current operational path in this repo, use:
> - `backend/README.md`
> - `docs/production-checklist.md`

## Overview

The backend is deployed as a single Docker container on a DigitalOcean Droplet, fronted by a Caddy container that handles TLS automatically. That's the entire stack — no load balancer, no managed database, no orchestration platform.

```
Internet → Caddy (443/80) → FastAPI app (3000, localhost only)
                                   ↕
                            SQLite volume (/data/pixels.db)
```

---

## Why this stack

**Caddy instead of nginx + certbot**
Caddy auto-provisions and renews Let's Encrypt certificates with a one-line config. nginx is fine but requires certbot as a separate process, a cron job, and more config. For a single-domain personal app, Caddy is strictly simpler.

**Named Docker volume for SQLite**
The DB file lives in a Docker named volume, not a host bind mount. Named volumes survive container rebuilds and are easier to back up via `docker exec`. When you eventually run the JSON → SQLite migration (per the database RFC), the script writes into this same volume.

**Single Droplet, no Docker Swarm / Kubernetes**
This app has one user (you). A $6/mo Basic Droplet (1 vCPU, 512 MB RAM) is massively over-provisioned for this workload. No orchestration needed.

---

## File layout

```
backend/
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
├── .env.example          ← commit this
├── .env                  ← do NOT commit (gitignored)
└── app/
    └── ...
```

---

## Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install deps first so this layer is cached between code changes
COPY pyproject.toml .
RUN pip install --no-cache-dir fastapi>=0.129.0 uvicorn>=0.41.0

# Copy application code
COPY app/ ./app/

# Run as non-root
RUN useradd -r -u 1001 appuser \
    && mkdir -p /data \
    && chown -R appuser /data
USER appuser

EXPOSE 3000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000"]
```

Notes:
- `python:3.11-slim` matches the `.python-version` in the repo. Final image is ~200 MB (Python base ~130 MB + deps).
- Deps are installed from `pyproject.toml` before copying app code, so `docker build` reuses that layer on every code-only change — fast rebuilds.
- `/data` is where the SQLite file will live (mounted as a volume).
- The app runs as `appuser` (uid 1001), not root.

---

## docker-compose.yml

```yaml
services:
  api:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - data:/data
    # Only bind to localhost — Caddy proxies in, nothing else touches port 3000
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')"]
      interval: 30s
      timeout: 5s
      retries: 3

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"   # HTTP/3
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api

volumes:
  data:          # SQLite database
  caddy_data:    # TLS certificates (persisted across Caddy restarts)
  caddy_config:  # Caddy config cache
```

---

## Caddyfile

```
api.yourdomain.com {
    reverse_proxy api:3000
}
```

That's it. Caddy resolves `api` via Docker's internal DNS, handles TLS certificate provisioning on first request, and auto-renews. If you want to add compression:

```
api.yourdomain.com {
    encode gzip
    reverse_proxy api:3000
}
```

---

## .env.example

```bash
# Copy to .env and fill in real values. Never commit .env.
PORT=3000
PUBLIC_BASE_URL=https://api.yourdomain.com
DATABASE_URL=/data/pixels.db

# A long random string — used as the dev bypass bearer token locally
# On production you can set this to something unguessable or remove the route
EXPO_PUBLIC_DEV_BEARER_TOKEN=change-me-in-production
```

---

## Droplet Setup (one-time)

**1. Create the Droplet**
- Ubuntu 24.04 LTS, Basic plan ($6/mo or $12/mo for 1 GB RAM)
- Add your SSH key at creation time
- Enable the DigitalOcean Droplet firewall: allow inbound 22 (SSH), 80 (HTTP), 443 (HTTPS), block everything else

**2. Install Docker**
```bash
ssh root@your-droplet-ip

curl -fsSL https://get.docker.com | sh
# Docker Compose is now bundled as `docker compose` (v2)
```

**3. Point your domain**
Add an A record: `api.yourdomain.com → <droplet-ip>`
Wait for DNS to propagate before starting Caddy (it needs to reach Let's Encrypt).

**4. Deploy for the first time**
```bash
# On the Droplet
git clone https://github.com/you/year-in-pixels-app /opt/pixels
cd /opt/pixels/backend

cp .env.example .env
# Edit .env with real values
nano .env

docker compose up -d --build
```

Caddy will automatically obtain a TLS cert on the first request to `api.yourdomain.com`.

---

## Deploying Updates

SSH in and rebuild:

```bash
ssh root@your-droplet-ip
cd /opt/pixels/backend
git pull
docker compose up -d --build
```

The `api` container restarts with the new image. The SQLite volume is untouched. Caddy stays running throughout (it's a separate container).

Zero-downtime deploys aren't needed for a personal app, but if you want them: `docker compose up -d --build --no-deps api` will build and restart only the `api` service without touching Caddy.

---

## Backups

Add a cron job on the Droplet to back up the SQLite file daily. The `sqlite3 .backup` command is safe to run while the app is live (it uses SQLite's online backup API).

```bash
# /etc/cron.d/pixels-backup
0 3 * * * root docker exec pixels-api-1 sqlite3 /data/pixels.db ".backup /data/pixels-$(date +\%Y\%m\%d).db" \
  && find /opt/pixels-backups -name 'pixels-*.db' -mtime +30 -delete
```

For off-site backup, install `rclone` on the Droplet and sync to Backblaze B2 or DigitalOcean Spaces (a few cents/month for this data size).

---

## Optional: GitHub Actions CI/CD

If you want push-to-deploy instead of SSH-ing in manually:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
    paths: [backend/**]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DROPLET_IP }}
          username: root
          key: ${{ secrets.DROPLET_SSH_KEY }}
          script: |
            cd /opt/pixels/backend
            git pull
            docker compose up -d --build
```

Store `DROPLET_IP` and `DROPLET_SSH_KEY` as GitHub Actions secrets. The deploy only triggers when files under `backend/` change.

---

## What this doesn't cover

- **Multiple users at scale** — when you have many users, move to a managed Postgres (DigitalOcean's managed DB starts at ~$15/mo) and run multiple app replicas behind a load balancer. The SQLite schema in the database RFC maps directly to Postgres with minimal changes.
- **Log aggregation** — `docker compose logs -f api` is fine for now. If you want persistence, add a `logging` driver or ship logs to a service.
- **Secrets management** — `.env` on the Droplet is fine for personal use. For team use, consider DigitalOcean's App Platform or GitHub Actions secrets with a deploy pipeline that writes `.env` at deploy time.
