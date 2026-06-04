"""US/Eastern slate day — single source of truth for Today_* tabs and dashboard."""

from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore


def eastern_slate_date_iso(now=None):
    """Calendar date (YYYY-MM-DD) for today's MLB slate in America/New_York."""
    if now is None:
        if ZoneInfo is not None:
            now = datetime.now(ZoneInfo("America/New_York"))
        else:
            # Fallback: UTC−4 (EDT). Close enough for slate-day boundaries.
            from datetime import timedelta, timezone

            now = datetime.now(timezone.utc) - timedelta(hours=4)
    elif ZoneInfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo("America/New_York"))
    return now.strftime("%Y-%m-%d")
