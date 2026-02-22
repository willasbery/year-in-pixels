from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class AppleAuthRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    identityToken: Any | None = None
    idToken: Any | None = None

    def resolved_identity_token(self) -> str | None:
        candidate = self.identityToken if "identityToken" in self.model_fields_set else self.idToken
        if not isinstance(candidate, str):
            return None

        stripped = candidate.strip()
        return stripped or None


class AuthSessionResponse(BaseModel):
    accessToken: str
    userId: str
    expiresAt: str | None
