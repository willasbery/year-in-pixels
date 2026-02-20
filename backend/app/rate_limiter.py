from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Deque

from fastapi import Request


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int | None


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._requests: dict[str, Deque[float]] = {}
        self._blocked_until: dict[str, float] = {}

    def check(
        self,
        *,
        key: str,
        limit: int,
        window_seconds: int,
        block_seconds: int,
    ) -> RateLimitResult:
        now = time.monotonic()
        max_requests = max(1, int(limit))
        window = max(1, int(window_seconds))
        block = max(1, int(block_seconds))

        with self._lock:
            blocked_until = self._blocked_until.get(key)
            if blocked_until and blocked_until > now:
                retry_after = max(1, int(math.ceil(blocked_until - now)))
                return RateLimitResult(allowed=False, retry_after_seconds=retry_after)

            if blocked_until and blocked_until <= now:
                self._blocked_until.pop(key, None)

            request_times = self._requests.setdefault(key, deque())
            threshold = now - window
            while request_times and request_times[0] <= threshold:
                request_times.popleft()

            if len(request_times) >= max_requests:
                retry_after = max(1, int(math.ceil(window - (now - request_times[0]))))
                blocked_until = now + block
                self._blocked_until[key] = blocked_until
                return RateLimitResult(allowed=False, retry_after_seconds=max(retry_after, block))

            request_times.append(now)
            if not request_times:
                self._requests.pop(key, None)

            return RateLimitResult(allowed=True, retry_after_seconds=None)


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first = forwarded_for.split(",", 1)[0].strip()
        if first:
            return first

    if request.client and request.client.host:
        return request.client.host

    return "unknown"
