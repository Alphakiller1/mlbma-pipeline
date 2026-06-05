"""US/Eastern slate day - single source of truth for Today_* tabs and dashboard."""

from __future__ import annotations

import os
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore


def eastern_slate_date_iso(now=None) -> str:
    """Return the active MLB slate date as YYYY-MM-DD.

    ``MLBMA_SLATE_DATE`` can override the computed date for a whole process
    tree, which lets after-final runs keep Today_* sheets aligned to the slate
    that just finished even when the pipeline executes after midnight ET.
    """

    override = os.getenv("MLBMA_SLATE_DATE", "").strip()
    if override:
        return override

    if now is None:
        if ZoneInfo is not None:
            now = datetime.now(ZoneInfo("America/New_York"))
        else:
            # Fallback: UTC-4 (EDT). Close enough for slate-day boundaries.
            from datetime import timedelta, timezone

            now = datetime.now(timezone.utc) - timedelta(hours=4)
    elif ZoneInfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo("America/New_York"))

    return now.strftime("%Y-%m-%d")
