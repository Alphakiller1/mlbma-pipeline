"""What a listed CFB player is worth to the spread (owner 2026-11-13).

The points come from scripts/fit_cfb_injury_value.py (outputs/cfb_injury_value.json):
2024-25 closing lines priced a missing regular per full share of his school's
pass attempts (QB), carries (runner) and receptions (receiver) over its last
three games. Each listed player carries:

value         his rating: those prices times his shares over his own last three
              appearances - what the spread gives up when he sits.
value_recent  the same prices times his shares over the school's last three
              games, the measure the fit priced. A player already out for weeks
              has no share left there: the line has carried his absence.
missed        the school's games in a row without a line from him (set for every
              matched player, defenders included).

Defenders have no measure the closing lines priced (tackle share did not
help), so a player with no attempts, carries or catches is not rated - he
reads "Not rated", never 0.
"""
from __future__ import annotations

import json
from pathlib import Path

try:  # beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_injuries  # noqa: E402
except ImportError:  # pragma: no cover
    from scripts import cfb_injuries  # noqa: E402

FIT = Path(__file__).resolve().parents[1] / "outputs" / "cfb_injury_value.json"
STAT = {"QB": "att", "RB": "car", "WR": "rec"}


def coefficients() -> dict[str, float]:
    data = json.loads(FIT.read_text(encoding="utf-8"))
    return {k: float(v) for k, v in data["points_per_share"].items() if k in STAT}


def points(shares: dict, coef: dict[str, float]) -> float:
    return round(sum(coef[t] * (shares or {}).get(STAT[t], 0.0) for t in coef), 2)


def value(shares: dict, coef: dict[str, float]) -> float | None:
    """His rating, or None when he has no attempts, carries or catches."""
    if not any((shares or {}).get(STAT[t], 0.0) > 0 for t in coef):
        return None
    return points(shares, coef)


def attach(entries: list[dict], usage: dict[str, dict], coef: dict[str, float] | None = None) -> int:
    """Set "value", "value_recent" and "missed" on each injury entry whose
    initial-and-surname key names one player in his school's box scores.
    Returns how many were valued."""
    coef = coef or coefficients()
    by_key: dict[str, list[dict]] = {}
    for row in usage.values():
        by_key.setdefault(cfb_injuries._key(row.get("name", "")), []).append(row)
    found = 0
    for entry in entries:
        hits = by_key.get(cfb_injuries._key(entry.get("player", "")), [])
        row = hits[0] if len(hits) == 1 else None
        entry["value"] = value(row["shares"], coef) if row else None
        if row:  # a defender's tackles say whether he played, though not his value
            entry["missed"] = int(row.get("missed") or 0)
        if entry["value"] is not None:
            entry["value_recent"] = points(row.get("recent"), coef)
            found += 1
    return found
