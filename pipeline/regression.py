"""Regression Watch (2026-11-20), shared by the NBA, CBB, NFL and CFB desks.

Each desk's noise-adjusted score takes out the part of a final score that
history says does not repeat (pipeline/power.py for basketball shooting,
outputs/nfl_game_log.py and scripts/cfb_power.py for kicking and fumbles).
This block says, for each team over its season, how much of its scoring
margin that was, where it came from, and how it has done in close games:

* margin: actual scoring margin per game;
* adjusted_margin: the same games on noise-adjusted scores;
* luck: margin less adjusted margin, per game. Above zero the results ran
  ahead of the play (regression risk); below zero they ran behind it
  (progression room);
* parts: the luck by source, each with what happened, what was expected and
  how often, and its points of margin per game. The parts sum to luck;
* close: the record in games decided by ``close_within`` points or fewer, and
  its wins above .500.

Luck, its parts and close-game wins rank fewest first, the way the power
ranking grades Wins Above (owner, 2026-11-11): first is the team furthest
behind its play, last the one furthest ahead of it.

Pure Python: the CBB publisher installs no numpy.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from pipeline import power

# Part keys in the order a desk lists them.
BASKETBALL_PARTS = ("three", "free", "opp_three", "opp_free")
FOOTBALL_PARTS = ("fg", "xp", "opp_fg", "opp_xp", "fumbles", "opp_fumbles")
# What a part's actual and expected figures count: makes against attempts
# (a rate), kicks made against kicks tried, or expected points on fumbles.
KINDS = {"three": "rate", "free": "rate", "opp_three": "rate", "opp_free": "rate",
         "fg": "kicks", "xp": "kicks", "opp_fg": "kicks", "opp_xp": "kicks",
         "fumbles": "epa", "opp_fumbles": "epa"}


@dataclass
class Tally:
    games: int = 0
    margin: float = 0.0
    adjusted: float = 0.0
    close_wins: int = 0
    close_losses: int = 0
    close_games: int = 0
    # key -> [actual, expected, attempts, luck in points of margin]
    parts: dict[str, list[float]] = field(default_factory=lambda: defaultdict(lambda: [0.0, 0.0, 0.0, 0.0]))

    def game(self, margin: float, adjusted_margin: float, close_within: float) -> None:
        self.games += 1
        self.margin += margin
        self.adjusted += adjusted_margin
        if abs(margin) <= close_within:
            self.close_games += 1
            self.close_wins += margin > 0
            self.close_losses += margin < 0

    def part(self, key: str, actual: float, expected: float, attempts: float, luck: float) -> None:
        p = self.parts[key]
        p[0] += actual
        p[1] += expected
        p[2] += attempts
        p[3] += luck


def basketball_game(tally: Tally, own: dict, opp: dict, own_rates: tuple[float, float],
                    opp_rates: tuple[float, float], close_within: float) -> None:
    """One final for one side, on power.basketball_points' terms: half of each
    side's three-point and free-throw makes against its own expected rate."""
    share = power.LUCK_SHARE
    adj_own = power.basketball_points(own["pts"], own["tpm"], own["tpa"], own["ftm"], own["fta"], own_rates)
    adj_opp = power.basketball_points(opp["pts"], opp["tpm"], opp["tpa"], opp["ftm"], opp["fta"], opp_rates)
    tally.game(own["pts"] - opp["pts"], adj_own - adj_opp, close_within)
    for key, box, rates, sign in (("", own, own_rates, 1), ("opp_", opp, opp_rates, -1)):
        three, free = rates
        exp3, expf = box["tpa"] * three, box["fta"] * free
        tally.part(key + "three", box["tpm"], exp3, box["tpa"], sign * share * 3 * (box["tpm"] - exp3))
        tally.part(key + "free", box["ftm"], expf, box["fta"], sign * share * (box["ftm"] - expf))


def football_game(tally: Tally, margin: float, adjusted_margin: float, kicks: dict, close_within: float = 8) -> None:
    """One game for one side. ``kicks`` holds, for "fg", "xp", "opp_fg" and
    "opp_xp", (made, expected made, tried), and for "fumbles" and
    "opp_fumbles", (EPA on the fumbles, the league's mean outcome times the
    count, count). Kicks are worth 3 and 1; a fumble's swing is its EPA
    against the mean, all of it on the margin (half off each score)."""
    tally.game(margin, adjusted_margin, close_within)
    for key in FOOTBALL_PARTS:
        actual, expected, tried = kicks.get(key) or (0, 0.0, 0)
        worth = 3 if key.endswith("fg") else 1
        sign = -1 if key.startswith("opp_") else 1
        tally.part(key, actual, expected, tried, sign * worth * (actual - expected))


def _place(values: dict) -> dict:
    """{team: {"value", "rank", "of"}}: fewest first, ties sharing a place."""
    pool = {t: v for t, v in values.items() if v is not None}
    return {t: {"value": round(v, 2), "rank": 1 + sum(1 for o in pool.values() if o < v - 1e-9), "of": len(pool)}
            for t, v in pool.items()}


def _higher(values: dict) -> dict:
    pool = {t: v for t, v in values.items() if v is not None}
    return {t: {"value": round(v, 2), "rank": 1 + sum(1 for o in pool.values() if o > v + 1e-9), "of": len(pool)}
            for t, v in pool.items()}


def publish(tallies: dict, ranked: set, close_within: float, order: tuple[str, ...]) -> dict:
    """{team: block} for the teams in ``ranked`` with a game, places taken among them."""
    rows = {t: tallies[t] for t in ranked if t in tallies and tallies[t].games}
    margin = _higher({t: r.margin / r.games for t, r in rows.items()})
    adjusted = _higher({t: r.adjusted / r.games for t, r in rows.items()})
    luck = _place({t: (r.margin - r.adjusted) / r.games for t, r in rows.items()})
    close = _place({t: (r.close_wins - r.close_losses) / 2 if r.close_games else None for t, r in rows.items()})
    parts = {key: _place({t: r.parts[key][3] / r.games if key in r.parts else None for t, r in rows.items()})
             for key in order}
    out = {}
    for t, r in rows.items():
        out[t] = {
            "games": r.games, "close_within": close_within,
            "margin": margin[t], "adjusted_margin": adjusted[t], "luck": luck[t],
            "close": {"wins": r.close_wins, "losses": r.close_losses, **(close.get(t) or {"value": None})},
            "parts": [{"key": key, "kind": KINDS[key], "actual": round(r.parts[key][0], 2),
                       "expected": round(r.parts[key][1], 2), "attempts": round(r.parts[key][2], 2),
                       "luck": parts[key][t]}
                      for key in order if key in r.parts and t in parts[key]],
        }
    return out


def check(blocks: dict, games: dict) -> str | None:
    """Why a desk's blocks are unfit to publish, or None: every team with games
    has one, its game count matches its log, and its parts add up to its luck."""
    missing = [t for t, n in games.items() if n and t not in blocks]
    if missing:
        return f"regression watch missing for {len(missing)} teams ({', '.join(map(str, missing[:3]))})"
    for team, block in blocks.items():
        if block["games"] != games.get(team):
            return f"{team} regression watch reads {block['games']} games, its log {games.get(team)}"
        parts = sum(p["luck"]["value"] for p in block["parts"])
        if abs(parts - block["luck"]["value"]) > 0.06:
            return f"{team} luck parts sum to {parts:.2f}, its luck {block['luck']['value']:.2f}"
        if abs(block["margin"]["value"] - block["adjusted_margin"]["value"] - block["luck"]["value"]) > 0.02:
            return f"{team} margin less adjusted margin is not its luck"
    return None
