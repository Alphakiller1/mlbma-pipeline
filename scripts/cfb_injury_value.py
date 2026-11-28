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

Every listed player reads as one of three things (owner 2026-11-28):

priced      he has a share of the attempts, carries or receptions the fit
            priced, and carries the points above.
negligible  he is in his school's box scores and is a regular in no unit by
            the fit's own thresholds, so the closing lines it was fitted to
            never moved for him. He reads "Negligible", not a bare 0.
unpriced    a defensive regular: at or above the tackle share the fit calls a
            regular, but tackle share was measured against the closing line
            and did not help, so no price for him exists. Free college box
            scores carry no snaps and no linemen, so this is a limit of the
            evidence, not a reading of the player.

A player the box scores never name is left unrated: nothing was measured.
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
# The share at which scripts/fit_cfb_injury_value.py counts a player a regular
# in his unit, and so the share whose absence the closing lines were fitted
# against. Below every one of them, the line never moved for him.
REGULAR = {"att": 0.50, "car": 0.25, "rec": 0.15, "tkl": 0.07}
PRICED, NEGLIGIBLE, UNPRICED = "priced", "negligible", "unpriced"


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


def basis(shares: dict) -> str:
    """Which of the three readings a player in the box scores gets."""
    shares = shares or {}
    if any(shares.get(STAT[t], 0.0) > 0 for t in STAT):
        return PRICED
    if shares.get("tkl", 0.0) >= REGULAR["tkl"]:
        return UNPRICED
    return NEGLIGIBLE


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
            entry["value_basis"] = basis(row.get("shares"))
        if entry["value"] is not None:
            entry["value_recent"] = points(row.get("recent"), coef)
            found += 1
    return found


def table(usage: dict[str, dict], coef: dict[str, float] | None = None) -> list[list]:
    """Every player in his school's box scores as [name, value, value_recent,
    missed, plays, played, basis] (value None for a player with no attempts, carries
    or catches; plays his box-score plays this season, played his games with a
    line - the desk ranks plays within the roster, owner 2026-11-21).
    The desk joins a live official report's players to it (2026-11-21): a
    conference report names more players than Covers or RotoWire list, and
    each still has his value and his games missed."""
    coef = coef or coefficients()
    rows = []
    for row in usage.values():
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        rated = value(row.get("shares"), coef)
        rows.append([name, rated, points(row.get("recent"), coef) if rated is not None else None,
                     int(row.get("missed") or 0), int(row.get("plays") or 0), int(row.get("played") or 0),
                     basis(row.get("shares"))])
    return sorted(rows, key=lambda r: r[0])

