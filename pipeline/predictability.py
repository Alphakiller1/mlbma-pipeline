"""Predictability: how likely a unit is to produce outcomes off its league's curve.

Every league is read the same way, on its own efficiency measure and its own
curve:

1. Each game gives one offensive outcome per team (EPA/play, yards/play or
   points per 100 possessions); the same number is the outcome the opponent's
   defense allowed.
2. A two-way additive fit, outcome = league mean + offense effect + opposing
   defense effect, sets what each game was expected to produce. The effects are
   shrunk toward zero by a few pseudo-games, so a two-game team is not fitted
   perfectly by its own noise.
3. The residual (actual minus expected) is the part of the outcome neither
   unit's level explains. Its spread is the variance a unit causes:
   - offense: the spread of its own residuals (causing variance);
   - defense: the spread of the residuals of offenses it faced (high = it lets
     games swing, low = it prevents variance);
   - team: the spread of its net residual (own offense minus the opponent's).
4. Each spread is shrunk toward the league spread by ``prior_games`` pseudo
   games, then read against the league curve: the probability that a game
   lands more than ``z`` league standard deviations from expectation. A unit
   exactly as volatile as the league lands off the curve 13.4% of the time at
   z = 1.5.
5. The predictability score is the unit's percentile among the league's units
   (100 = least volatile), with its place among them.

Only observed game outcomes enter; nothing here forecasts a result.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    metric: str            # what the per-game outcome is, for the caption
    prior_games: float     # pseudo-games shrinking each unit's spread to the league's
    effect_prior: float    # pseudo-games shrinking each unit's level when fitting expectation
    min_games: int         # fewer games than this and the unit is not scored
    z: float = 1.5         # "off the curve" threshold, in league standard deviations


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _fit(games: list[tuple[str, str, float]], effect_prior: float, rounds: int = 60):
    """games: (offense team, defense team, outcome). Returns mean, offense, defense effects."""
    mean = sum(v for _, _, v in games) / len(games)
    off: dict[str, float] = defaultdict(float)
    dfn: dict[str, float] = defaultdict(float)
    by_off: dict[str, list] = defaultdict(list)
    by_def: dict[str, list] = defaultdict(list)
    for o, d, v in games:
        by_off[o].append((d, v))
        by_def[d].append((o, v))
    for _ in range(rounds):
        moved = 0.0
        for o, rows in by_off.items():
            new = sum(v - mean - dfn[d] for d, v in rows) / (len(rows) + effect_prior)
            moved = max(moved, abs(new - off[o]))
            off[o] = new
        for d, rows in by_def.items():
            new = sum(v - mean - off[o] for o, v in rows) / (len(rows) + effect_prior)
            moved = max(moved, abs(new - dfn[d]))
            dfn[d] = new
        if moved < 1e-9:
            break
    return mean, off, dfn


def _places(values: dict[str, float]) -> dict[str, tuple[int, int]]:
    """Lowest spread first; ties share a place."""
    ordered = sorted(values.values())
    of = len(ordered)
    return {k: (sum(1 for x in ordered if x < v - 1e-12) + 1, of) for k, v in values.items()}


def score(games: list[dict], league: League, teams: set[str] | None = None) -> dict[str, dict]:
    """games: one row per game with keys ``home``, ``away``, ``home_off``, ``away_off``
    (each team's offensive outcome in that game) and optional ``date``.

    ``teams`` limits who is scored and who forms the league curve (FBS, D-I);
    games involving anyone else are left out entirely. Returns, per team,
    ``{"team", "offense", "defense"}`` blocks plus the league curve used.
    """
    pairs = []  # (offense, defense, outcome, game index)
    for i, g in enumerate(games):
        if teams is not None and (g["home"] not in teams or g["away"] not in teams):
            continue
        for side, other in (("home", "away"), ("away", "home")):
            value = g.get(side + "_off")
            if value is None or not math.isfinite(value):
                break
        else:
            pairs.append((g["home"], g["away"], g["home_off"], i))
            pairs.append((g["away"], g["home"], g["away_off"], i))
    if len(pairs) < 20:
        return {}
    mean, off, dfn = _fit([(o, d, v) for o, d, v, _ in pairs], league.effect_prior)
    resid = {(o, i): v - mean - off[o] - dfn[d] for o, d, v, i in pairs}

    offense: dict[str, list[float]] = defaultdict(list)
    defense: dict[str, list[float]] = defaultdict(list)
    net: dict[str, list[float]] = defaultdict(list)
    for o, d, _v, i in pairs:
        offense[o].append(resid[(o, i)])
        defense[d].append(resid[(o, i)])
        if (d, i) in resid:
            net[o].append(resid[(o, i)] - resid[(d, i)])

    def pooled(groups):
        values = [r for rows in groups.values() for r in rows]
        return math.sqrt(sum(r * r for r in values) / len(values)) if values else None

    unit_sigma = pooled(offense)          # offense and defense residuals are one pool
    net_sigma = pooled(net)
    curves = {"offense": unit_sigma, "defense": unit_sigma, "team": net_sigma}
    groups = {"offense": offense, "defense": defense, "team": net}

    out: dict[str, dict] = {}
    for unit, rows_by in groups.items():
        league_sigma = curves[unit]
        if not league_sigma:
            continue
        spread = {}
        for team, rows in rows_by.items():
            if len(rows) < league.min_games:
                continue
            k = league.prior_games
            spread[team] = math.sqrt((k * league_sigma ** 2 + sum(r * r for r in rows)) / (k + len(rows)))
        places = _places(spread)
        for team, sigma in spread.items():
            place, of = places[team]
            rows = rows_by[team]
            out.setdefault(team, {})[unit] = {
                "predictability": round(100 * (of - place) / (of - 1)) if of > 1 else 50,
                "place": place, "of": of,
                "off_curve": round(2 * (1 - _phi(league.z * league_sigma / sigma)), 4),
                "observed_off_curve": round(sum(abs(r) > league.z * league_sigma for r in rows) / len(rows), 4),
                "volatility": round(sigma / league_sigma, 3),
                "games": len(rows),
            }
    curve = {"metric": league.metric, "z": league.z, "prior_games": league.prior_games,
             "unit_sigma": round(unit_sigma, 4) if unit_sigma else None,
             "team_sigma": round(net_sigma, 4) if net_sigma else None,
             "league_off_curve": round(2 * (1 - _phi(league.z)), 4),
             "games": len({i for *_, i in pairs})}
    for team in out:
        out[team]["curve"] = curve
    return out


# Each league's stipulations: its outcome, how hard spreads lean on the league
# before a team has played enough, and the fewest games a score needs.
NFL = League(metric="EPA per play", prior_games=3, effect_prior=2, min_games=3)
CFB = League(metric="Yards per play (FBS vs FBS)", prior_games=3, effect_prior=2, min_games=3)
NBA = League(metric="Points per 100 possessions", prior_games=8, effect_prior=4, min_games=5)
CBB = League(metric="Points per 100 possessions (D-I vs D-I)", prior_games=4, effect_prior=3, min_games=2)
