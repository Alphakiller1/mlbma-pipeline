"""Adjusted power ranking: offense, defense and net, schedule strength, and how
much of a team's record its play supports. Shared by the CBB, NBA, NFL and CFB
desks.

Each game gives two rows, one per offense: what it produced against the defense
it met, at home, away or on a neutral floor. A ridge fit splits every row into

    league mean + offense effect + defense effect + home edge

with each team effect pulled toward the league average (the ridge penalty), so
a team that has played three games is not ranked on three games alone. The
offense rating is the league mean plus the offense effect: what it would
produce against an average defense on a neutral floor. The defense rating is
the same for what it allows. Net is offense minus defense.

What goes in, and why (validated 2026-11-11 on completed seasons, each team
rated on the games before a cut and scored on the games after it):

* Basketball (CBB 2022-2026, NBA 2022-2026; cuts at 30/50/70% of each season):
  points per 100 possessions with half of each team's three-point and
  free-throw luck taken out (``basketball_points``). Luck is makes against the
  team's own season rate, regressed to the league (750 three-point attempts,
  100 free throws): shooting is partly skill, and a game's run of makes is
  partly the shots the defense allowed, so half is the share that did not
  repeat. Against raw points: CBB r 0.5352 -> 0.5456 with RMSE 16.92 -> 16.68,
  better at all 15 cuts; NBA +0.0014, 8 of 15 (a wash, kept for one method).
  Taking all of it out, or using league-average shooting, was worse.
* Football (NFL 2021-2025 at weeks 4-12; CFB 2024-2025 at weeks 5-11): half
  the scoring margin model and half an EPA-per-play model with every fumble at
  the league's average fumble outcome, scaled to points. CFB r 0.5466 -> 0.5783,
  RMSE 17.93 -> 15.94, better at 7 of 8 cuts; NFL equal to raw margin
  (-0.0002, 12 of 25). Removing defensive and return touchdowns made both
  leagues worse (NFL -0.0125, CFB -0.0019): they repeat, so they count.

Early season: each team starts from last season's rating carried part of the
way (``season_prior``), weighed like a few games, so three results do not
decide a ranking and the season's own games take over as they come. Against
starting everyone at average: CBB (2023-2026, 0.6 carried, 4 games) at 5% of
the season r 0.458 -> 0.596, 10% 0.528 -> 0.583, 20% 0.618 -> 0.642, no worse
after; NBA (0.8 carried, 8 games) 5% 0.246 -> 0.359, 20% 0.429 -> 0.458.

Record against rating (``expected_wins``): each game played, the chance the
team wins it given both ratings and the floor; summed, that is the record its
play supports. Wins above it did not repeat in CBB (first half against second
half of a season, r = +0.09 over 1,810 team-halves; a top-fifth team's +0.116
wins per game ran +0.010 after) and mostly did not in the NBA (r = +0.30;
+0.079 ran +0.026). A first-half rating predicted second-half win% better than
first-half win% in both (CBB r 0.70 vs 0.51; NBA 0.74 vs 0.72).

Pure Python (the CBB publisher installs no numpy). The ridge is solved by
block coordinate descent, exact for this quadratic.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field


@dataclass
class Row:
    offense: str
    defense: str
    location: int      # +1 offense at home, -1 away, 0 neutral
    value: float       # what the offense produced (per 100, points, EPA per play)
    weight: float = 1.0


@dataclass
class Fit:
    mean: float
    home: float
    offense: dict[str, float] = field(default_factory=dict)
    defense: dict[str, float] = field(default_factory=dict)

    def expect(self, offense: str, defense: str, location: int) -> float:
        return self.mean + self.home * location + self.offense.get(offense, 0.0) + self.defense.get(defense, 0.0)

    def margin(self, team: str, opponent: str, location: int) -> float:
        """Expected margin in the fit's units: the team's output less the opponent's."""
        return self.expect(team, opponent, location) - self.expect(opponent, team, -location)


def ridge(rows: list[Row], penalty: float, iterations: int = 2000, tol: float = 1e-10,
          prior: tuple[dict[str, float], dict[str, float]] | None = None) -> Fit:
    """Weighted ridge on offense and defense effects; mean and home edge unpenalized.

    Each effect is pulled toward its ``prior`` (offense, defense effects; zero,
    the league average, for a team without one) with the weight of ``penalty``
    games' worth of rows."""
    prior_off, prior_def = prior or ({}, {})
    rows = [r for r in rows if r.weight > 0 and math.isfinite(r.value)]
    if not rows:
        raise ValueError("No games to rate")
    # Weights (possessions, plays) count relative to an average row, so the
    # penalty reads in games whatever the unit.
    scale = len(rows) / sum(r.weight for r in rows)
    rows = [Row(r.offense, r.defense, r.location, r.value, r.weight * scale) for r in rows]
    total = sum(r.weight for r in rows)
    mean = sum(r.weight * r.value for r in rows) / total
    home = 0.0
    off: dict[str, float] = defaultdict(float)
    dfn: dict[str, float] = defaultdict(float)
    by_off: dict[str, list[Row]] = defaultdict(list)
    by_def: dict[str, list[Row]] = defaultdict(list)
    for r in rows:
        by_off[r.offense].append(r)
        by_def[r.defense].append(r)
    located = sum(r.weight for r in rows if r.location)
    for _ in range(iterations):
        change = 0.0
        for team, rs in by_off.items():
            v = (sum(r.weight * (r.value - mean - home * r.location - dfn[r.defense]) for r in rs)
                 + penalty * prior_off.get(team, 0.0)) / (sum(r.weight for r in rs) + penalty)
            change = max(change, abs(v - off[team]))
            off[team] = v
        for team, rs in by_def.items():
            v = (sum(r.weight * (r.value - mean - home * r.location - off[r.offense]) for r in rs)
                 + penalty * prior_def.get(team, 0.0)) / (sum(r.weight for r in rs) + penalty)
            change = max(change, abs(v - dfn[team]))
            dfn[team] = v
        m = sum(r.weight * (r.value - home * r.location - off[r.offense] - dfn[r.defense]) for r in rows) / total
        change = max(change, abs(m - mean))
        mean = m
        if located:
            h = sum(r.weight * r.location * (r.value - mean - off[r.offense] - dfn[r.defense])
                    for r in rows if r.location) / located
            change = max(change, abs(h - home))
            home = h
        if change < tol:
            break
    return Fit(mean=mean, home=home, offense=dict(off), defense=dict(dfn))


def season_prior(offense: dict[str, float], defense: dict[str, float], carry: float):
    """Last season's ratings as this season's starting point: each team's offense
    and defense against the league average, ``carry`` of the way (rosters turn
    over), for ``ridge(prior=...)``."""
    if not offense:
        return None
    mean_o = sum(offense.values()) / len(offense)
    mean_d = sum(defense.values()) / len(defense)
    return ({t: carry * (v - mean_o) for t, v in offense.items()},
            {t: carry * (v - mean_d) for t, v in defense.items()})


def blend(fits: list[tuple[Fit, float, float]], mean: float | None = None) -> Fit:
    """Combine fits as weight * scale * effect: each (fit, weight, scale to common
    units). ``mean`` anchors the level (the points model's league mean when an
    EPA-per-play model, centred near zero, is blended in)."""
    teams = set().union(*(f.offense for f, _, _ in fits))
    level = mean if mean is not None else sum(w * s * f.mean for f, w, s in fits)
    return Fit(mean=level, home=sum(w * s * f.home for f, w, s in fits),
               offense={t: sum(w * s * f.offense.get(t, 0.0) for f, w, s in fits) for t in teams},
               defense={t: sum(w * s * f.defense.get(t, 0.0) for f, w, s in fits) for t in teams})


def football(points: list[Row], plays: list[Row], played: list["Played"], points_penalty: float = 10.0,
             plays_penalty: float = 0.01) -> Fit:
    """Half a scoring-margin model and half an EPA-per-play model (fumbles at the
    league's mean outcome), the second scaled to points: plays per team-game
    times the slope of game margin on its per-play margin."""
    by_points = ridge(points, points_penalty)
    by_plays = ridge(plays, plays_penalty)
    per_game = sum(r.weight for r in plays) / len(plays)
    xs = [by_plays.margin(p.team, p.opponent, p.location) * per_game for p in played]
    ys = [p.margin for p in played]
    slope = sum(x * y for x, y in zip(xs, ys)) / sum(x * x for x in xs)
    return blend([(by_points, 0.5, 1.0), (by_plays, 0.5, per_game * slope)], mean=by_points.mean)


def phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


# --- basketball shooting luck ----------------------------------------------
THREE_PRIOR = 750.0   # attempts of league-average shooting a team's rate is regressed toward
FREE_PRIOR = 100.0
LUCK_SHARE = 0.5      # the share of a game's shooting luck that did not repeat


def shooting_rates(totals: dict[str, dict[str, float]]) -> dict[str, tuple[float, float]]:
    """{team: (expected 3P%, expected FT%)} from season makes and attempts, regressed."""
    league = defaultdict(float)
    for t in totals.values():
        for k in ("tpm", "tpa", "ftm", "fta"):
            league[k] += t.get(k, 0)
    three = league["tpm"] / league["tpa"] if league["tpa"] else 0.33
    free = league["ftm"] / league["fta"] if league["fta"] else 0.72
    out = {team: ((t.get("tpm", 0) + THREE_PRIOR * three) / (t.get("tpa", 0) + THREE_PRIOR),
                  (t.get("ftm", 0) + FREE_PRIOR * free) / (t.get("fta", 0) + FREE_PRIOR))
           for team, t in totals.items()}
    out[""] = (three, free)  # a team with no season line (a non-D-I opponent) shoots league average
    return out


def basketball_points(points: float, tpm: int, tpa: int, ftm: int, fta: int, rates: tuple[float, float]) -> float:
    """Points with half the game's three-point and free-throw luck taken out."""
    three, free = rates
    return points - LUCK_SHARE * (3 * (tpm - tpa * three) + (ftm - fta * free))


# --- the published table -----------------------------------------------------
@dataclass
class Played:
    team: str
    opponent: str
    location: int
    won: bool | None       # None for a tie
    points_scale: float    # converts the fit's margin units to points for this game (poss/100 in basketball)
    margin: float          # actual margin in points


def table(fit: Fit, played: list[Played], ranked: set[str], digits: int = 1) -> dict[str, dict]:
    """Per ranked team: offense, defense and net with places, schedule strength,
    record, the record its play supports and wins above it.

    ``ranked`` is the cohort places are taken among (D-I, FBS, the league);
    other teams are rated (they shape their opponents' numbers) but not placed.
    """
    resid = [p.margin - fit.margin(p.team, p.opponent, p.location) * p.points_scale for p in played]
    sigma = math.sqrt(sum(r * r for r in resid) / len(resid)) if resid else 0.0
    net = {t: fit.offense.get(t, 0.0) - fit.defense.get(t, 0.0) for t in set(fit.offense) | set(fit.defense)}
    games: dict[str, list[Played]] = defaultdict(list)
    for p in played:
        games[p.team].append(p)
    rows = {}
    for team in ranked:
        mine = games.get(team) or []
        if not mine or team not in fit.offense:
            continue
        wins = sum(1 for p in mine if p.won is True)
        losses = sum(1 for p in mine if p.won is False)
        expected = sum(phi(fit.margin(p.team, p.opponent, p.location) * p.points_scale / sigma) if sigma else 0.5
                       for p in mine)
        rows[team] = {
            "offense": fit.mean + fit.offense[team], "defense": fit.mean + fit.defense.get(team, 0.0),
            "net": net[team], "schedule": sum(net.get(p.opponent, 0.0) for p in mine) / len(mine),
            "schedule_offense": sum(fit.mean + fit.offense.get(p.opponent, 0.0) for p in mine) / len(mine),
            "schedule_defense": sum(fit.mean + fit.defense.get(p.opponent, 0.0) for p in mine) / len(mine),
            "wins": wins, "losses": losses, "expected_wins": expected,
            "luck": (wins - expected) / len(mine), "games": len(mine),
        }
    out = {}
    for team, r in rows.items():
        def place(key, higher=True):
            v = r[key]
            ahead = sum(1 for o in rows.values() if (o[key] > v + 1e-12 if higher else o[key] < v - 1e-12))
            return {"value": round(v, 4 if key == "luck" else digits + 1), "rank": ahead + 1, "of": len(rows)}
        out[team] = {
            "net": place("net"), "offense": place("offense"), "defense": place("defense", higher=False),
            # Schedule: the opponents' average net (first is the hardest), and
            # the offenses and defenses it met (best offenses, stingiest defenses first).
            "schedule": place("schedule"), "schedule_offense": place("schedule_offense"),
            "schedule_defense": place("schedule_defense", higher=False),
            # Wins above the record its play supports, per game, graded as
            # sustainability (owner, 2026-11-11): first is the fewest above it,
            # a record its play backs; last runs furthest ahead of its play.
            "luck": place("luck", higher=False),
            "record": {"wins": r["wins"], "losses": r["losses"], "games": r["games"]},
            "expected_record": {"wins": round(r["expected_wins"], 1),
                                "losses": round(r["games"] - r["expected_wins"], 1)},
        }
    return {"teams": out, "home_court": round(fit.home * 2, 3), "league_mean": round(fit.mean, 3),
            "margin_sd": round(sigma, 2)}
