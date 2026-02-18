from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit


@dataclass
class AsgiResponse:
    status_code: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> dict[str, Any]:
        return json.loads(self.body.decode("utf-8"))


async def asgi_request(
    app,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    body: bytes | None = None,
) -> AsgiResponse:
    parts = urlsplit(path)

    raw_body = body or b""
    request_headers = dict(headers or {})
    if json_body is not None:
        raw_body = json.dumps(json_body).encode("utf-8")
        request_headers.setdefault("content-type", "application/json")

    header_list = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in request_headers.items()]

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": parts.path or "/",
        "raw_path": (parts.path or "/").encode("ascii"),
        "query_string": parts.query.encode("ascii"),
        "headers": header_list,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
        "root_path": "",
    }

    sent_request = False
    response_started = False
    status_code = 500
    response_headers: dict[str, str] = {}
    response_body = bytearray()

    async def receive() -> dict[str, Any]:
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": raw_body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        nonlocal response_started, status_code, response_headers
        if message["type"] == "http.response.start":
            response_started = True
            status_code = int(message["status"])
            response_headers = {
                key.decode("latin-1").lower(): value.decode("latin-1")
                for key, value in message.get("headers", [])
            }
        elif message["type"] == "http.response.body":
            if not response_started:
                raise RuntimeError("Received body before response start")
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)

    return AsgiResponse(status_code=status_code, headers=response_headers, body=bytes(response_body))
