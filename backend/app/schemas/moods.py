from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class MoodPutRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    level: Any | None = None
    note: Any | None = None


class MoodItemResponse(BaseModel):
    date: str
    level: int
    note: str | None = None


class MoodListResponse(BaseModel):
    moods: list[MoodItemResponse]
