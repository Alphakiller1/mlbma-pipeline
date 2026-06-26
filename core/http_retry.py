"""HTTP GET with retries for transient network/DNS failures."""

from __future__ import annotations

import time
from typing import Any

import requests
from requests.exceptions import ConnectionError, RequestException, Timeout


def _is_transient(exc: BaseException) -> bool:
    msg = str(exc).lower()
    needles = (
        "getaddrinfo failed",
        "name resolution",
        "connection aborted",
        "connection reset",
        "forcibly closed",
        "max retries exceeded",
        "timed out",
        "temporary failure",
        "remotedisconnected",
    )
    return any(n in msg for n in needles)


def get_with_retry(
    url: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    timeout: float = 30,
    retries: int = 4,
    backoff: float = 2.0,
    **kwargs: Any,
) -> requests.Response:
    """GET with exponential backoff on DNS/connection/timeouts."""
    last_exc: BaseException | None = None
    for attempt in range(retries):
        try:
            r = requests.get(
                url, params=params, headers=headers, timeout=timeout, **kwargs
            )
            r.raise_for_status()
            return r
        except (ConnectionError, Timeout) as exc:
            last_exc = exc
        except RequestException as exc:
            if _is_transient(exc) and attempt < retries - 1:
                last_exc = exc
            else:
                raise
        if attempt < retries - 1:
            time.sleep(backoff * (2**attempt))
    assert last_exc is not None
    raise last_exc
