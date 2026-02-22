from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ThemePatchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    bg_color: Any | None = None
    bgColor: Any | None = None
    mood_colors: Any | None = None
    moodColors: Any | None = None
    empty_color: Any | None = None
    emptyColor: Any | None = None
    shape: Any | None = None
    spacing: Any | None = None
    position: Any | None = None
    avoid_lock_screen_ui: Any | None = None
    avoidLockScreenUi: Any | None = None
    columns: Any | None = None
    gridColumns: Any | None = None
    bg_image_url: Any | None = None
    bgImageUrl: Any | None = None

    def to_patch_payload(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class ThemeResponse(BaseModel):
    bg_color: str
    mood_colors: dict[str, str]
    empty_color: str | None
    shape: str
    spacing: str
    position: str
    avoid_lock_screen_ui: bool
    columns: int
    bg_image_url: str | None
