from __future__ import annotations

import os
from pathlib import Path

PORT = int(os.getenv("PORT", "3000"))
DATA_PATH = Path(__file__).resolve().parents[1] / "data.json"
DEV_BEARER_TOKEN = (os.getenv("EXPO_PUBLIC_DEV_BEARER_TOKEN") or "cheese").strip() or "cheese"
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").strip()
