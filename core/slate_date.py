"""US/Eastern slate day - single source of truth for Today_* tabs and dashboard."""

from __future__ import annotations

import os
from datetime import datetime, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

ET = ZoneInfo("America/New_York") if ZoneInfo is not None else None
EVENING_ROLLOVER_HOUR = 17  # 5 PM ET — pregame board rolls to next slate


def eastern_slate_date_iso(now=None) -> str:
    """Return the active MLB slate date as YYYY-MM-DD.

    ``MLBMA_SLATE_DATE`` can override the computed date for a whole process
    tree, which lets after-final runs keep Today_* sheets aligned to the slate
    that just finished even when the pipeline executes after midnight ET.

    After 5 PM Eastern, the active slate is tomorrow's games (pregame board).
    """

    override = os.getenv("MLBMA_SLATE_DATE", "").strip()
    if override:
        return override

    if now is None:
        if ET is not None:
            now = datetime.now(ET)
        else:
            # Fallback: UTC-4 (EDT). Close enough for slate-day boundaries.
            from datetime import timezone

            now = datetime.now(timezone.utc) - timedelta(hours=4)
    elif ET is not None and now.tzinfo is None:
        now = now.replace(tzinfo=ET)
    elif ET is not None:
        now = now.astimezone(ET)

    today = now.date()
    if now.hour >= EVENING_ROLLOVER_HOUR:
        return (today + timedelta(days=1)).isoformat()
    return today.isoformat()
