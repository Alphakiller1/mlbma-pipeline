"""HTTP GET with retries for transient network/DNS failures.

Speed: a module-level requests.Session gives connection pooling + HTTP keep-alive, so the
many repeated calls to the same host (Baseball Savant / FanGraphs / MLB Stats API) reuse the
TCP+TLS connection instead of re-handshaking every request. `get_many` adds bounded
concurrency for the independent per-date-window / per-player fetches that dominate runtime.
`get_with_retry` keeps its original signature, so existing scrapers benefit with no changes.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Iterable

import requests
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError, RequestException, Timeout

# Shared session: pooled keep-alive connections across all scrapers in a process.
_SESSION = requests.Session()
_ADAPTER = HTTPAdapter(pool_connections=32, pool_maxsize=32)
_SESSION.mount("https://", _ADAPTER)
_SESSION.mount("http://", _ADAPTER)


# Upstream said "not now", not "no". Savant, FanGraphs and the Stats API all return
# these under load, and a single one of them used to end the whole daily pipeline:
# `raise_for_status()` raises an HTTPError whose message matches none of the needles
# below, so it re-raised on the first attempt with no retry at all. On 2026-09-15 one
# 502 on one of sixty team-split requests aborted a 70-minute run, and the public MLB
# slate went two days stale.
_RETRY_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
_RETRY_AFTER_CAP = 30.0


def _retryable_status(exc: BaseException) -> bool:
    response = getattr(exc, "response", None)
    return response is not None and response.status_code in _RETRY_STATUS


def _retry_after(exc: BaseException) -> float | None:
    """Honour an explicit Retry-After when the server sends one (seconds form)."""
    response = getattr(exc, "response", None)
    raw = (response.headers.get("Retry-After") if response is not None else None)
    try:
        return min(float(raw), _RETRY_AFTER_CAP) if raw else None
    except (TypeError, ValueError):
        return None


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
    """GET with exponential backoff on DNS/connection/timeouts (now via a pooled Session)."""
    last_exc: BaseException | None = None
    for attempt in range(retries):
        try:
            r = _SESSION.get(
                url, params=params, headers=headers, timeout=timeout, **kwargs
            )
            r.raise_for_status()
            return r
        except (ConnectionError, Timeout) as exc:
            last_exc = exc
        except RequestException as exc:
            if (_is_transient(exc) or _retryable_status(exc)) and attempt < retries - 1:
                last_exc = exc
            else:
                raise
        if attempt < retries - 1:
            wait = _retry_after(last_exc) if last_exc is not None else None
            time.sleep(wait if wait is not None else backoff * (2**attempt))
    assert last_exc is not None
    raise last_exc


def get_many(
    items: Iterable[Any],
    fetch: Callable[[Any], Any],
    *,
    max_workers: int = 6,
) -> list[Any]:
    """Run `fetch(item)` for each item concurrently (bounded), preserving input order.

    Use for the independent fetches that currently run in a serial `for` loop — e.g. the
    Statcast date windows in scrape_pitch_mix / scrape_sp_gamelog. `max_workers` is kept
    modest to respect Savant's rate limits. Exceptions propagate (fail-fast per item).

    Example (replacing a serial date-window loop):
        frames = get_many(date_windows, lambda w: _fetch_window(*w), max_workers=6)
    """
    items = list(items)
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        return list(ex.map(fetch, items))
