from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..schemas.moods import MoodItemResponse, MoodListResponse, MoodPutRequest
from ..services import moods as moods_service
from ..utils import parse_date_key

router = APIRouter()


@router.get("/moods", response_model=MoodListResponse, response_model_exclude_none=True)
def get_moods(year: int, request: Request) -> MoodListResponse:
    if year < 2000 or year > 3000:
        raise HTTPException(status_code=400, detail="A valid ?year=YYYY query is required.")

    return MoodListResponse.model_validate({"moods": moods_service.get_moods_for_year(request, year)})


@router.put("/moods/{date_key}", response_model=MoodItemResponse, response_model_exclude_none=True)
def put_mood(date_key: str, payload: MoodPutRequest, request: Request) -> MoodItemResponse:
    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    level = payload.level
    if not isinstance(level, int) or level < 1 or level > 5:
        raise HTTPException(status_code=400, detail="level must be an integer from 1 to 5.")

    note_raw = payload.note
    note = note_raw.strip()[:240] if isinstance(note_raw, str) and note_raw.strip() else None

    return MoodItemResponse.model_validate(moods_service.put_mood(request, date_key, level, note))


@router.delete("/moods/{date_key}", status_code=204)
def remove_mood(date_key: str, request: Request) -> Response:
    if parse_date_key(date_key) is None:
        raise HTTPException(status_code=400, detail="Invalid date key. Expected YYYY-MM-DD.")

    moods_service.delete_mood(request, date_key)
    return Response(status_code=204)
