"""Shared ignore rules for Playwright console noise in local/CI smokes."""

from __future__ import annotations


def is_ignorable_console(text: str) -> bool:
    """True for expected local/CI noise that is not a dashboard boot failure.

    Local `python -m http.server` origins are not on the Supabase CORS allowlist.
    Chromium then logs a CORS policy line plus a bare `Failed to load resource:
    net::ERR_FAILED`. Rankings still boot from snapshot JSON. Do not treat that
    as a runtime-smoke failure. Real JS exceptions stay noisy.
    """
    t = text or ""
    if t.startswith("[LINEUPS]") or t.startswith("[MATCHUPS]"):
        return True
    if "429" in t or "Today_Games HTTP 429" in t:
        return True
    if "CORS policy" in t or "fonts.gstatic.com" in t:
        return True
    if "Failed to load resource" in t and (
        "429" in t
        or "ERR_FAILED" in t
        or "supabase.co" in t
        or "hub_dataset" in t
    ):
        return True
    return False
