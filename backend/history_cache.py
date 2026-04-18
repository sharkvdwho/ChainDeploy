"""In-process TTL cache for deployment history; optional Redis when REDIS_URL is set."""

from __future__ import annotations

import json
import logging
import time
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

_lock = Lock()
_memory: dict[str, tuple[float, str]] = {}
_redis_client: Any | None | bool = None  # None=uninit, False=skip, else Redis


def _get_redis():
    global _redis_client
    if _redis_client is False:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        from config import get_settings

        url = get_settings().redis_url
        if not url:
            _redis_client = False
            return None
        import redis as redis_lib

        _redis_client = redis_lib.Redis.from_url(url, decode_responses=True)
        return _redis_client
    except Exception as e:
        logger.warning("Redis unavailable for history cache: %s", e)
        _redis_client = False
        return None


def history_cache_get(key: str) -> Any | None:
    r = _get_redis()
    if r is not None:
        try:
            raw = r.get(key)
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.debug("redis get failed: %s", e)
    now = time.monotonic()
    with _lock:
        item = _memory.get(key)
        if not item:
            return None
        exp, payload = item
        if now > exp:
            del _memory[key]
            return None
        return json.loads(payload)


def history_cache_set(key: str, value: Any, ttl_sec: float) -> None:
    payload = json.dumps(value, default=str)
    r = _get_redis()
    if r is not None:
        try:
            r.setex(key, int(max(1, ttl_sec)), payload)
            return
        except Exception as e:
            logger.debug("redis set failed: %s", e)
    with _lock:
        _memory[key] = (time.monotonic() + ttl_sec, payload)


def history_cache_invalidate() -> None:
    r = _get_redis()
    if r is not None:
        try:
            for k in r.scan_iter("chaindeploy:history:*"):
                r.delete(k)
        except Exception as e:
            logger.debug("redis invalidate failed: %s", e)
    with _lock:
        for k in list(_memory):
            if k.startswith("chaindeploy:history:"):
                del _memory[k]
