from __future__ import annotations

from pydantic import BaseModel


class TokenResponse(BaseModel):
    token: str
    url: str
