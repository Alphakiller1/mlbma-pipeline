"""Predictability: how likely an offense is to produce games off its league's curve.

It is read from how the offense produces its outcome, not from how its past
games happened to land. A game's outcome (points per 100 possessions, EPA per
play) averages many scoring events. How far a game can stray from expectation
depends on how lumpy those events are (threes against twos and free throws;
explosive plays against short gains) and on how few of them a game holds (pace,
plays per game). For each offense, over every event it produced:

    spread per event = sqrt(E[x^2] - E[x]^2)
    game spread      = spread per event / sqrt(events per game)

The predictability score is the offense's percentile among its league (100 =
least volatile), with its place. Its off-curve probability is the chance a game
lands more than ``z`` league standard deviations from expectation, with the
offense's game spread read against the league-average offense's: a typical
offense lands off the curve 13.4% of the time at z = 1.5.

Why this and not game-to-game residuals, and why offenses only (audit of one
full completed season per league, 2026-11-11: NBA 2025-26, CBB 2025-26 D-I,
NFL 2025, CFB 2025 FBS):

- A unit's residual spread around expectation repeated between its odd and
  even games at r = 0.01-0.22, no better than shuffled data; it did not
  predict the second half of the season; and its off-curve rate was less
  accurate than calling every unit league average in 11 of 12 tests.
- The event spread above repeated at r = 0.86 (NBA) and 0.76 (CBB), predicted
  each offense's second-half game spread (NBA r = 0.54, NFL 0.47, CBB 0.14
  over 365 teams) and beat league average in all three.
- The same read of what defenses allow did not beat league average in any
  league, so defenses and net team margins are not scored. CFB has no
  play-level feed here to build the event spread from, so it is not scored.

Only observed events enter; nothing here forecasts a result.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    metric: str        # the per-game outcome, for the caption
    event: str         # what one scoring event is ('possession', 'play')
    scale: float       # outcome units per event (100 for per-100 rates)
    min_games: int     # fewer games than this and the offense is not scored
    z: float = 1.5     # "off the curve" threshold, in league standard deviations


NFL = League(metric="EPA per play", event="play", scale=1.0, min_games=3)
NBA = League(metric="Points per 100 possessions", event="possession", scale=100.0, min_games=3)
CBB = League(metric="Points per 100 possessions (D-I vs D-I)", event="possession", scale=100.0, min_games=2)


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def basketball_game(fgm: int, tpm: int, ftm: int, fta: int, points: int, possessions: float):
    """(events, sum, sum of squares) for one team's box score.

    Points per possession squared, summed: each two is 4, each three 9; free
    throws come in trips, so a made throw counts 1 plus the chance its partner
    also went in (2p^2 per two-shot trip).
    """
    twos = fgm - tpm
    rate = ftm / fta if fta else 0.0
    return possessions, float(points), 4.0 * twos + 9.0 * tpm + ftm * (1 + rate)


def _places(values: dict[str, float]) -> dict[str, tuple[int, int]]:
    """Lowest spread first; ties share a place."""
    ordered = sorted(values.values())
    of = len(ordered)
    return {k: (sum(1 for x in ordered if x < v - 1e-12) + 1, of) for k, v in values.items()}


def score(units: dict[str, list[tuple[float, float, float]]], league: League) -> dict[str, dict]:
    """units: per team, one ``(events, sum, sum of squares)`` row per game.

    Returns, per scored team, ``{"offense": {...}, "curve": {...}}``.
    """
    spread, games = {}, {}
    for team, rows in units.items():
        rows = [r for r in rows if r[0] and r[0] > 0]
        if len(rows) < league.min_games:
            continue
        n = sum(r[0] for r in rows)
        mean = sum(r[1] for r in rows) / n
        var = sum(r[2] for r in rows) / n - mean * mean
        if not var > 0:
            continue
        spread[team] = league.scale * math.sqrt(var / (n / len(rows)))
        games[team] = len(rows)
    if len(spread) < 10:
        return {}
    average = sum(spread.values()) / len(spread)
    places = _places(spread)
    curve = {"metric": league.metric, "event": league.event, "z": league.z,
             "league_spread": round(average, 4), "league_off_curve": round(2 * (1 - _phi(league.z)), 4),
             "units": len(spread)}
    out = {}
    for team, sd in spread.items():
        place, of = places[team]
        out[team] = {"offense": {
            "predictability": round(100 * (of - place) / (of - 1)) if of > 1 else 50,
            "place": place, "of": of,
            "off_curve": round(2 * (1 - _phi(league.z * average / sd)), 4),
            "volatility": round(sd / average, 3),
            "game_spread": round(sd, 4),
            "games": games[team],
        }, "curve": curve}
    return out
