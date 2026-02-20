FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install runtime deps before copying source for better layer caching.
COPY pyproject.toml ./
RUN python - <<'PY'
import subprocess
import tomllib
from pathlib import Path

deps = tomllib.loads(Path("pyproject.toml").read_text())["project"]["dependencies"]
subprocess.check_call(["pip", "install", "--no-cache-dir", *deps])
PY

COPY app ./app
COPY main.py ./main.py

RUN useradd --create-home --shell /usr/sbin/nologin --uid 1001 appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data

USER appuser

ENV APP_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/pixels.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=3)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
