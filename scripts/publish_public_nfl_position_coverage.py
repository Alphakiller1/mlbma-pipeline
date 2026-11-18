#!/usr/bin/env python3
"""Publish data/public/nfl/position_coverage.json: targets to WRs, TEs and RBs
against every coverage and pressure look, for each offense and each defense
(outputs/nfl_position_coverage.py), with Sharp's current-season yards per
target allowed by position and alignment (outputs/sharp_nfl.position_allowed).

Its own file, read by the matchup page when it opens: one copy per club
instead of one per game in the slate, which is already 7 MB.

Validate before writing: every club on both sides, offense and defense
targets that mirror each other league-wide, figures in range. A failed check
keeps the published file."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from outputs import nfl_advanced_context, nfl_position_coverage, sharp_nfl  # noqa: E402
from outputs.nfl_public_context import canon  # noqa: E402

OUT = ROOT / "data" / "public" / "nfl" / "position_coverage.json"
CLUBS = 32


def _alignment(sharp: dict) -> dict[str, dict]:
    """Sharp's figures with their place among the 32 (fewest allowed first)."""
    teams = sharp.get("teams") or {}
    out: dict[str, dict] = {}
    for key in sharp_nfl.POSITION_COLUMNS.values():
        pool = [v[key] for v in teams.values()]
        for team, values in teams.items():
            place = 1 + sum(1 for other in pool if other < values[key] - 1e-9)
            out.setdefault(team, {})[key] = {"yards_per_target": values[key],
                                             "league_rank": {"place": place, "of": len(pool)}}
    return out


def validate(clubs: dict) -> str | None:
    if len(clubs) < CLUBS:
        return f"{len(clubs)} clubs, expected {CLUBS}"
    for window in ("current", "combined"):
        for group in nfl_position_coverage.GROUPS:
            offense = sum(((c.get(window) or {}).get("offense", {}).get(group, {}).get("all") or {})
                          .get("targets", 0) for c in clubs.values())
            defense = sum(((c.get(window) or {}).get("defense", {}).get(group, {}).get("all") or {})
                          .get("targets", 0) for c in clubs.values())
            if not offense or offense != defense:
                return f"{window} {group} targets do not mirror: offense {offense}, defense {defense}"
        for team, club in clubs.items():
            for side in ("offense", "defense"):
                looks = ((club.get(window) or {}).get(side) or {}).get("WR") or {}
                if "all" not in looks:
                    return f"{team} {window} {side} has no WR targets"
                for group in (club.get(window) or {}).get(side, {}).values():
                    for look, stats in group.items():
                        if not 0 <= stats["catch_rate"] <= 1 or not -10 <= stats["yards_per_target"] <= 40:
                            return f"{team} {window} {side} {look} figures out of range"
    combined = [c["combined"] for c in clubs.values()]
    if not any("cover_3" in (c["defense"].get("WR") or {}) for c in combined):
        return "the combined window carries no coverage looks"
    return None


def main() -> int:
    now = datetime.now(timezone.utc)
    season = now.year if now.month >= 8 else now.year - 1
    current = nfl_advanced_context._joined(season, participation=True)
    prior = nfl_advanced_context._joined(season - 1, participation=True)
    # The slate's club codes (WSH, LAR), so the page finds each club by its own code.
    clubs = {canon(team): club for team, club in nfl_position_coverage.build(current, prior, season).items()}
    problem = validate(clubs) if clubs else "no play-by-play"
    if problem:
        print(f"  refusing to write {OUT.name}: {problem}; keeping the published file")
        return 1
    seasons = next(iter(clubs.values())).get("seasons") or {}
    sharp = sharp_nfl.position_allowed(season)
    alignment = {canon(team): v for team, v in (_alignment(sharp) if sharp else {}).items()}
    payload = {
        "generated_at_utc": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "season": season,
        "seasons": seasons,
        "target_floor": nfl_position_coverage.FLOOR,
        "sources": {
            "plays": "nflverse play-by-play; coverage, shells and pressure from nflverse participation "
                     "(NGS charting); blitz, box, play action and motion from FTN charting",
            "alignment": ({"source": "Sharp Football Analysis", "report_date": sharp.get("report_date"),
                           "through_week": sharp.get("through_week")} if alignment else None),
        },
        "clubs": {team: {k: v for k, v in club.items() if k != "seasons"} |
                  ({"alignment_allowed": alignment[team]} if team in alignment else {})
                  for team, club in sorted(clubs.items())},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"  wrote {OUT.relative_to(ROOT)}: {len(clubs)} clubs, windows {seasons}, "
          f"alignment {'on' if alignment else 'off'} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
