from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import DATA_PATH, DEV_BEARER_TOKEN
from .routes import router
from .store import StateStore


def create_app(data_path: Path | None = None, dev_bearer_token: str | None = None) -> FastAPI:
    app = FastAPI(title="Year in Pixels API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException):
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(status_code=exc.status_code, content={"error": message, "message": message})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, __: Exception):
        message = "Unexpected server error."
        return JSONResponse(status_code=500, content={"error": message, "message": message})

    app.state.store = StateStore(data_path or DATA_PATH, dev_bearer_token or DEV_BEARER_TOKEN)
    app.include_router(router)

    return app


app = create_app()
