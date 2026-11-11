"""Per-game box lines for the CBB game log, each ranked against its week.

A line is one team's rebounding, shooting, shot mix and pace in one final,
from that game's box score (both teams' rows). Every figure is ranked among
all D-I teams' games in the same Monday-to-Sunday week (Eastern dates), higher
first, so a cell reads where that night sat among the week's games.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

STATS = ("orb_pct", "drb_pct", "efg_pct", "fg3_pct", "fg2_pct", "ft_pct", "pace", "fg3a_share", "fg2a_share")


def _share(n, d):
    return n / d if d else None


def line(own: dict, opp: dict, minutes: float) -> dict:
    """own/opp: {fgm, fga, tpm, tpa, ftm, fta, orb, drb, poss}."""
    return {
        "orb_pct": _share(own["orb"], own["orb"] + opp["drb"]),
        "drb_pct": _share(own["drb"], own["drb"] + opp["orb"]),
        "efg_pct": _share(own["fgm"] + 0.5 * own["tpm"], own["fga"]),
        "fg3_pct": _share(own["tpm"], own["tpa"]),
        "fg2_pct": _share(own["fgm"] - own["tpm"], own["fga"] - own["tpa"]),
        "ft_pct": _share(own["ftm"], own["fta"]),
        "pace": (own["poss"] + opp["poss"]) / 2 * 40 / minutes if minutes else None,
        "fg3a_share": _share(own["tpa"], own["fga"]),
        "fg2a_share": _share(own["fga"] - own["tpa"], own["fga"]),
    }


def week_of(day: str) -> str:
    d = date.fromisoformat(day[:10])
    return (d - timedelta(days=d.weekday())).isoformat()


def ranked(lines: dict[str, dict[str, tuple[str, dict]]]) -> dict[str, dict[str, dict]]:
    """lines: {team: {game id: (date, line)}} -> {team: {game id: {"week", "box"}}}."""
    pools: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for games in lines.values():
        for day, row in games.values():
            for key, value in row.items():
                if value is not None:
                    pools[week_of(day)][key].append(value)
    out: dict[str, dict[str, dict]] = {}
    for team, games in lines.items():
        for gid, (day, row) in games.items():
            week = week_of(day)
            box = {}
            for key in STATS:
                value = row.get(key)
                if value is None:
                    continue
                pool = pools[week][key]
                box[key] = {"value": round(value, 4), "rank": 1 + sum(1 for x in pool if x > value + 1e-12),
                            "of": len(pool)}
            out.setdefault(team, {})[gid] = {"week": week, "box": box}
    return out
