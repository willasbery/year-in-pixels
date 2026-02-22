from __future__ import annotations

from pydantic import BaseModel


class RootResponse(BaseModel):
    name: str
    ok: bool
    endpoints: list[str]


class HealthResponse(BaseModel):
    ok: bool
    timestamp: str
