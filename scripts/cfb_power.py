"""CFB power ranking, noise-adjusted scores and offense predictability, from
collegefootballdata.com play-by-play (/plays, one call a week; PPA is CFBD's
expected points added per play).

Each week's plays are reduced to per-game, per-team aggregates and cached in
the CFB depth cache (data/cache/cfb_depth, kept between runs by the workflow)
once every game that week is complete, so a run fetches only the week in
progress. The season's games and scores come from CFBD /games, the call the
schedule-strength block already makes (cfb_depth.cfbd memoises it).

* Power ranking (pipeline/power.py): half a scoring-margin model, half an
  EPA-per-play model with every fumble at the league's mean fumble outcome,
  both opponent-adjusted with a home-field term; FCS opponents are rated so
  they shape their opponents' numbers, and places are taken among FBS. CFB
  2024-2025 (cuts at weeks 5-11): r 0.5466 -> 0.5783 against the raw margin,
  RMSE 17.93 -> 15.94, better at 7 of 8 cuts.
* Noise-adjusted score: field goals and extra points at the season's make rate
  for their distance, fumbles at the mean fumble outcome (the swing split
  across both scores). Return and defensive touchdowns count as scored: taking
  them out made later results harder to predict.
* Predictability (pipeline/predictability.py): each FBS offense's per-play PPA
  spread over its FBS games. 2024 and 2025: first-half spread against second-
  half game spread r = +0.23 and +0.20 over 134 and 136 offenses; off-curve
  Brier skill against league average +0.022 and +0.061. Defenses did not beat
  league average (-0.091, -0.099) and are not scored.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_depth  # noqa: E402
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_depth  # noqa: E402
from pipeline import power, predictability  # noqa: E402

SCRIMMAGE = {"Rush", "Pass Reception", "Pass Incompletion", "Sack", "Rushing Touchdown", "Passing Touchdown",
             "Pass Interception Return", "Interception", "Interception Return Touchdown", "Fumble Recovery (Own)",
             "Fumble Recovery (Opponent)", "Fumble Return Touchdown", "Pass Completion", "Safety", "Fumble"}
FUMBLE = {"Fumble Recovery (Own)", "Fumble Recovery (Opponent)", "Fumble Return Touchdown", "Fumble"}
RETURN_TD = {"Interception Return Touchdown", "Fumble Return Touchdown", "Punt Return Touchdown",
             "Kickoff Return Touchdown", "Blocked Punt Touchdown", "Blocked Field Goal Touchdown",
             "Missed Field Goal Return Touchdown"}
TOUCHDOWN = {"Passing Touchdown", "Rushing Touchdown"} | RETURN_TD
FIELD_GOAL = {"Field Goal Good", "Field Goal Missed", "Blocked Field Goal", "Blocked Field Goal Touchdown",
              "Missed Field Goal Return", "Missed Field Goal Return Touchdown"}
DISTANCE = re.compile(r"(\d+)\s*(?:yd|yds|yard|yards)\s*(?:fg|field goal)|field goal attempt from (\d+)", re.I)
CFB = predictability.League(metric="EPA per play (CFBD PPA, FBS vs FBS)", event="play", scale=1.0, min_games=3)


def fg_distance(text: str | None) -> int | None:
    m = DISTANCE.search(text or "")
    if not m:
        return None
    value = int(next(g for g in m.groups() if g))
    return value if 15 <= value <= 70 else None


def extra_point(text: str | None) -> int | None:
    """1 made, 0 missed, None for a two-point try or no kick in the text."""
    s = (text or "").lower()
    if re.search(r"two[- ]point|2[- ]?pt|conversion|pass attempt (successful|failed)|rush attempt", s):
        return None
    if re.search(r"(kick|pat|extra point)( attempt)? (failed|missed|blocked|no good)|kick\s+blocked", s):
        return 0
    if re.search(r"kick\)|kick attempt good|pat good|kick is good|extra point good", s):
        return 1
    return None


def aggregate(plays: list[dict]) -> dict:
    """{game id: {team: {...}}} for one week's plays."""
    out: dict = defaultdict(lambda: defaultdict(lambda: {"n": 0, "ppa": 0.0, "sq": 0.0, "fum_n": 0, "fum": 0.0,
                                                          "fg": [], "xp": [0, 0]}))
    for p in plays:
        kind, off, dfn = p.get("playType"), p.get("offense"), p.get("defense")
        if not off or not dfn:
            continue
        game = out[str(p.get("gameId"))]
        if kind in FIELD_GOAL:
            d = fg_distance(p.get("playText"))
            if d:
                game[off]["fg"].append([d, 1 if kind == "Field Goal Good" else 0])
        if kind in TOUCHDOWN:
            r = extra_point(p.get("playText"))
            scorer = dfn if kind in RETURN_TD else off  # CFBD lists the side that lost the ball as offense
            if r is not None:
                game[scorer]["xp"][0] += r
                game[scorer]["xp"][1] += 1
        ppa = p.get("ppa")
        if kind in SCRIMMAGE and isinstance(ppa, (int, float)):
            row = game[off]
            row["n"] += 1
            row["ppa"] += ppa
            row["sq"] += ppa * ppa
            if kind in FUMBLE:
                row["fum_n"] += 1
                row["fum"] += ppa
    return {gid: {team: dict(row) for team, row in teams.items()} for gid, teams in out.items()}


def week_plays(season: int, week: int, season_type: str, complete: bool) -> dict | None:
    """A week's aggregates: from the cache when the whole week was final when
    stored, else fetched (one CFBD call) and cached."""
    name = f"plays_{season}_{season_type}_{week}.json"
    hit = cfb_depth._cached(name)
    if hit and hit.get("complete"):
        return hit["games"]
    plays = cfb_depth.cfbd("/plays", year=season, week=week, seasonType=season_type)
    if not isinstance(plays, list):
        return hit["games"] if hit else None
    games = aggregate(plays)
    cfb_depth._store(name, {"complete": complete, "games": games})
    return games


def season_games(season: int) -> list[dict]:
    games = cfb_depth.cfbd("/games", year=season, seasonType="regular")
    return [g for g in (games if isinstance(games, list) else [])
            if g.get("completed") is True and isinstance(g.get("homePoints"), (int, float))
            and isinstance(g.get("awayPoints"), (int, float))]


def constants(aggregates: dict) -> dict:
    fg, xp, fum_n, fum = defaultdict(lambda: [0, 0]), [0, 0], 0, 0.0
    for teams in aggregates.values():
        for row in teams.values():
            for d, made in row["fg"]:
                b = fg[min(d // 5 * 5, 60)]
                b[0] += made
                b[1] += 1
            xp[0] += row["xp"][0]
            xp[1] += row["xp"][1]
            fum_n += row["fum_n"]
            fum += row["fum"]
    return {"fg": {k: v[0] / v[1] for k, v in fg.items() if v[1] >= 20},
            "xp": xp[0] / xp[1] if xp[1] else 0.97, "fumble": fum / fum_n if fum_n else -2.4}


def fg_expect(distance: int, rates: dict) -> float:
    key = min(distance // 5 * 5, 60)
    return rates.get(key, rates[min(rates, key=lambda b: abs(b - key))]) if rates else 0.75


def build(season: int) -> dict:
    """{"teams": {norm school: power row}, "predictability": {norm school: block},
    "games": {(norm school, utc date): {adj_points, adj_opponent_points}},
    "constants": {...}} - empty when CFBD is unavailable."""
    games = season_games(season)
    if not games:
        return {}
    weeks: dict[int, list[dict]] = defaultdict(list)
    for g in games:
        weeks[int(g["week"])].append(g)
    everything = cfb_depth.cfbd("/games", year=season, seasonType="regular") or []
    pending = {int(g["week"]) for g in everything if isinstance(g, dict) and g.get("completed") is not True}
    aggregates: dict = {}
    for week in sorted(weeks):
        found = week_plays(season, week, "regular", complete=week not in pending)
        if found:
            aggregates.update(found)
    k = constants(aggregates)
    fbs = {cfb_depth._norm(g[s + "Team"]) for g in games for s in ("home", "away")
           if g.get(s + "Classification") == "fbs"}
    points, plays, played, events = [], [], [], defaultdict(list)
    adjusted: dict = {}
    for g in games:
        home, away = g["homeTeam"], g["awayTeam"]
        teams = aggregates.get(str(g["id"]), {})
        final = {home: float(g["homePoints"]), away: float(g["awayPoints"])}
        luck = {home: 0.0, away: 0.0}
        for team, opp in ((home, away), (away, home)):
            row = teams.get(team)
            if not row:
                continue
            luck[team] += sum(3 * (made - fg_expect(d, k["fg"])) for d, made in row["fg"])
            luck[team] += row["xp"][0] - k["xp"] * row["xp"][1]
            net = row["fum"] - k["fumble"] * row["fum_n"]
            luck[team] += net / 2
            luck[opp] -= net / 2
        both = home in teams and away in teams
        day = str(g.get("startDate") or "")[:10]
        for team, opp, loc in ((home, away, 1), (away, home, -1)):
            loc = 0 if g.get("neutralSite") else loc
            t, o = cfb_depth._norm(team), cfb_depth._norm(opp)
            points.append(power.Row(t, o, loc, final[team]))
            margin = final[team] - final[opp]
            played.append(power.Played(t, o, loc, margin > 0 if margin else None, 1.0, margin))
            row = teams.get(team)
            if row and row["n"]:
                adj_sum = row["ppa"] - row["fum"] + k["fumble"] * row["fum_n"]
                plays.append(power.Row(t, o, loc, adj_sum / row["n"], float(row["n"])))
                if t in fbs and o in fbs and row["n"] >= 30:
                    events[t].append((row["n"], row["ppa"], row["sq"]))
            if both:
                adjusted[(t, day)] = {"adj_points": round(final[team] - luck[team], 1),
                                      "adj_opponent_points": round(final[opp] - luck[opp], 1),
                                      "week": int(g["week"])}
    if len(plays) < 100:
        return {}
    fit = power.football(points, plays, played)
    ranked = power.table(fit, played, fbs)
    return {"teams": ranked["teams"], "home_court": ranked["home_court"], "league_mean": ranked["league_mean"],
            "predictability": predictability.score(events, CFB), "games": adjusted,
            "through_week": max(weeks), "constants": {"xp_make_rate": round(k["xp"], 4),
                                                      "fumble_mean_epa": round(k["fumble"], 4)}}
