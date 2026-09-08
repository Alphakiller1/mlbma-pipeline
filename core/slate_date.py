"""US/Eastern slate day - single source of truth for Today_* tabs and dashboard.

The "slate" is the set of games users are preparing for. It must always point
at the *next slate that still has unstarted games* so the dashboard, bet
evaluator, and sharp tools help people prep tomorrow's matchups rather than
re-litigating games that already finished.

Rollover rule (default): the slate stays on today until **every** game on
today's card has started, then it advances to the next date that has games.
This lets you prep tonight's slate right up to first pitch, then it rolls
forward on its own -- no waiting for the midnight calendar flip.

Resolution order:
1. ``MLBMA_SLATE_DATE`` env override (a hard pin for a whole process tree).
2. Status-based rollover via the MLB stats API (when ``MLBMA_SLATE_ROLLOVER``
   is enabled, the default).
3. Plain ET calendar date (used as the network-failure fallback, when
   rollover is disabled, or whenever a caller passes ``now`` explicitly).
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timedelta
from functools import lru_cache

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

_SCHEDULE_URL = (
    "https://statsapi.mlb.com/api/v1/schedule"
    "?sportId=1&date={date}"
)
_HTTP_TIMEOUT = 6.0
_MAX_LOOKAHEAD_DAYS = 7


def _eastern_now() -> datetime:
    """Current time in US/Eastern (DST-aware), with a fixed-offset fallback."""
    if ZoneInfo is not None:
        return datetime.now(ZoneInfo("America/New_York"))
    # Fallback: UTC-4 (EDT). Close enough for slate-day boundaries.
    from datetime import timezone

    return datetime.now(timezone.utc) - timedelta(hours=4)


def _calendar_iso(now=None) -> str:
    """Plain ET calendar date as YYYY-MM-DD (no network, never rolls forward)."""
    if now is None:
        now = _eastern_now()
    elif ZoneInfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo("America/New_York"))
    return now.strftime("%Y-%m-%d")


def _slate_status(date_iso: str):
    """Classify a date's MLB slate via the stats API.

    Returns one of:
      "unstarted" - at least one game has not started yet (still preppable)
      "done"      - games exist and all are live/final (nothing left to prep)
      "empty"     - the schedule has no games that day (off day)
      None        - the lookup failed (network/parse error); caller falls back
    """
    url = _SCHEDULE_URL.format(date=date_iso)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mlbma-slate/1.0"})
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    games = []
    for day in payload.get("dates", []) or []:
        games.extend(day.get("games", []) or [])

    if not games:
        return "empty"

    for game in games:
        state = (game.get("status", {}) or {}).get("abstractGameState", "")
        if state == "Preview":
            return "unstarted"
    return "done"


def _resolve_slate_iso(now=None) -> str:
    """Resolve the active slate date with forward rollover.

    Stay on today while it still has an unstarted game; otherwise scan ahead
    for the next date that has games. If the network is unavailable for
    *today's* lookup we fall back to the plain calendar date so the pipeline
    never stalls.
    """
    if now is None:
        now = _eastern_now()
    today = _calendar_iso(now)

    status = _slate_status(today)
    # None  -> lookup failed; don't guess, keep the calendar date.
    # unstarted -> today still has games to prep.
    if status in (None, "unstarted"):
        return today

    # Today is done (or an off day) -> find the next date that actually has games.
    base = datetime.strptime(today, "%Y-%m-%d")
    for offset in range(1, _MAX_LOOKAHEAD_DAYS + 1):
        candidate = (base + timedelta(days=offset)).strftime("%Y-%m-%d")
        cand_status = _slate_status(candidate)
        if cand_status in ("unstarted", "done"):
            return candidate
        # "empty" -> keep scanning; None -> network blip, take tomorrow rather
        # than spin, since today is confirmed finished.
        if cand_status is None:
            return candidate

    # Nothing found in the lookahead window (deep off-season) -> tomorrow.
    return (base + timedelta(days=1)).strftime("%Y-%m-%d")


@lru_cache(maxsize=1)
def _computed_slate_iso() -> str:
    """Memoized per-process slate resolution (one network round-trip per run)."""
    return _resolve_slate_iso()


def eastern_slate_date_iso(now=None) -> str:
    """Return the active MLB slate date as YYYY-MM-DD.

    ``MLBMA_SLATE_DATE`` pins the date for a whole process tree (highest
    priority). Otherwise, when ``MLBMA_SLATE_ROLLOVER`` is enabled (default)
    and no explicit ``now`` is supplied, the date rolls forward once every
    game on today's slate has started. Passing ``now`` explicitly always
    returns the plain calendar date for that moment (deterministic, no
    network) so tests and time-pinned callers stay reproducible.
    """
    override = os.getenv("MLBMA_SLATE_DATE", "").strip()
    if override:
        return override

    rollover = os.getenv("MLBMA_SLATE_ROLLOVER", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )
    if now is None and rollover:
        return _computed_slate_iso()

    return _calendar_iso(now)
