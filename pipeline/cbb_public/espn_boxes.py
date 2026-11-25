"""Supplement missing current-season facts from score-matched final box scores."""
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from statistics import mean

import requests

from .. import power, predictability, regression
from . import game_lines
from . import possession_data as ncaa
from . import pressure
from . import halves as half_split
from . import shot_quality
from .data import classify_zone, read, write
from .espn_roster import fetch_roster

BOX_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary"
BOX_SOURCE = "ESPN final box scores"
COUNT_SOURCE = "SportsDataverse NCAA possessions matched to ESPN finals"
START_SOURCE = "ESPN starting lineups and rosters"
SIDES = ("home", "away")
CLOSE = 5  # a close game for the Regression Watch: decided by five points or fewer
BOX_CONTEXT = {"fast_break_points": "fastBreakPoints", "points_off_turnovers": "turnoverPoints"}
# Drives, floaters and pull-ups are named only by some arenas' scorer feeds
# ("driving layup", "floating jump shot", "pullup jump shot"); the others write
# "layup" and "jumper" for every shot. Measured 2026-11-19: a naming feed names
# 15-40 of them a game, a plain one 0-3. A game is read for these kinds only
# when its feed names at least KIND_TAGS_MIN between the two sides, so a team
# whose games split between feeds is measured on the games that name them
# rather than diluted by the ones that cannot.
SHOT_KINDS = (("driving", re.compile(r"\bdriving\b")), ("floater", re.compile(r"\bfloating\b")),
              ("pullup", re.compile(r"\bpull ?-?up\b")))
KIND_TAGS_MIN = 6


def fixture_key(game):
    return [game["game_date"], *(str(game[s + "_id"]) for s in SIDES),
            *(int(game[s + "_score"]) for s in SIDES)]


def player_lines(units, minutes, team_points):
    """Use complete, score-reconciled player boxes only."""
    rows = {}
    required = {"MIN", "PTS", "REB", "AST", "FG", "3PT", "FT"}
    for unit in units:
        labels = unit.get("labels") or []
        if not required.issubset(labels):
            continue
        for player in unit.get("athletes", []):
            stats = player.get("stats") or []
            if player.get("didNotPlay") or not stats:
                continue
            athlete = player.get("athlete") or {}
            pid, name = athlete.get("id"), athlete.get("displayName")
            fields = dict(zip(labels, stats))
            try:
                mins, pts, reb, ast = (int(fields[k]) for k in ("MIN", "PTS", "REB", "AST"))
                fgm, fga = map(int, fields["FG"].split("-"))
                tpm, _ = map(int, fields["3PT"].split("-"))
                ftm, fta = map(int, fields["FT"].split("-"))
            except (KeyError, ValueError):
                return []
            if (not pid or not name or str(pid) in rows or not 0 <= mins <= minutes or min(reb, ast) < 0
                    or not 0 <= tpm <= fgm <= fga or not 0 <= ftm <= fta or pts != 2 * fgm + tpm + ftm):
                return []
            rows[str(pid)] = {"athlete_id": str(pid), "Name": name, "minutes": mins,
                              "Pts": pts, "Reb": reb, "Ast": ast, "FGA": fga, "FTA": fta}
    return list(rows.values()) if sum(row["Pts"] for row in rows.values()) == team_points else []


# ESPN's summary play feed carries a coordinate and the participants on every
# shooting play. Its origin differs from the shot files': x runs across the
# floor (0-50) and y out from the baseline, while classify_zone wants Chase
# coordinates v1, centre-court feet with the hoop at (+/-41.75, 0). Validated
# against two full games: layups land 3.2 feet from the rim, dunks 2.9, tips
# 4.2, jump shots 20.0, and nothing fails to classify.
def chase_coordinates(coordinate):
    x, y = ncaa.number((coordinate or {}).get("x")), ncaa.number((coordinate or {}).get("y"))
    return (None, None) if x is None or y is None else (47 - y, x - 25)


def player_shots(payload, teams):
    """Per player: field goals by zone, how many of his makes were assisted,
    and how many he assisted. Free throws are not field goals and are left out.

    One zone scheme throughout (Chase coordinates v1), never mixed with a
    provider's own, and a shot whose coordinate will not classify is counted
    in the attempt totals but in no zone."""
    out = {team: {} for team in teams}

    def row(team, pid):
        return out[team].setdefault(pid, {"fga": 0, "fgm": 0, "assisted": 0, "assists": 0, "zones": {}})

    for play in payload.get("plays") or []:
        team = str((play.get("team") or {}).get("id") or "")
        kind = (play.get("type") or {}).get("text") or ""
        if not play.get("shootingPlay") or team not in out or "FreeThrow" in kind:
            continue
        people = [str(((p.get("athlete") or {}).get("id") or "")) for p in (play.get("participants") or [])]
        if not people or not people[0]:
            continue
        made = bool(play.get("scoringPlay"))
        points = 3 if "three" in (play.get("text") or "").lower() else 2
        shooter = row(team, people[0])
        shooter["fga"] += 1
        shooter["fgm"] += made
        zone = classify_zone(*chase_coordinates(play.get("coordinate")), points)
        if zone:
            counts = shooter["zones"].setdefault(zone, [0, 0])
            counts[0] += 1
            counts[1] += made
        if made and len(people) > 1 and people[1]:
            shooter["assisted"] += 1
            row(team, people[1])["assists"] += 1
    return {team: rows for team, rows in out.items() if rows}


def shot_kinds(payload, teams):
    """Each side's field-goal attempts in the play-by-play and, per kind,
    [attempts, points]; None for both sides when the feed does not name the
    kinds (see SHOT_KINDS)."""
    counts = {t: {"fga": 0, **{kind: [0, 0] for kind, _ in SHOT_KINDS}} for t in teams}
    named = 0
    for play in payload.get("plays") or []:
        team = str((play.get("team") or {}).get("id") or "")
        text = (play.get("text") or "").lower()
        if not play.get("shootingPlay") or team not in counts or "free throw" in text:
            continue
        row = counts[team]
        row["fga"] += 1
        points = int(play.get("scoreValue") or 0) if play.get("scoringPlay") else 0
        hit = False
        for kind, pattern in SHOT_KINDS:
            if pattern.search(text):
                row[kind][0] += 1
                row[kind][1] += points
                hit = True
        named += hit
    tagged = named >= KIND_TAGS_MIN and all(row["fga"] for row in counts.values())
    return {t: (row if tagged else None) for t, row in counts.items()}


def kind_rates(pairs):
    """{kind}_freq/_ppa for offense (own shots) and defense (shots allowed)
    over the games whose feed names the kinds, and how many games that is.
    pairs: (own kinds, opponent kinds) per game, both named."""
    out = {"shot_kinds_games_all": len(pairs)}
    for side, pick in (("off", 0), ("def", 1)):
        rows = [pair[pick] for pair in pairs]
        fga = sum(r["fga"] for r in rows)
        for kind, _ in SHOT_KINDS:
            attempts = sum(r[kind][0] for r in rows)
            points = sum(r[kind][1] for r in rows)
            out[f"{kind}_freq_{side}_all"] = attempts / fga if fga else None
            out[f"{kind}_ppa_{side}_all"] = points / attempts if attempts else None
    return out


def parse_box(payload, game):
    comp = payload["header"]["competitions"][0]
    if str(comp["id"]) != str(game["game_id"]) or not comp["status"]["type"]["completed"]:
        raise ValueError("ESPN fixture is missing a matching final")
    competitors = {s["homeAway"]: s for s in comp["competitors"]}
    for side in SIDES:
        row = competitors[side]
        if str(row["id"]) != str(game[side + "_id"]) or int(row["score"]) != int(game[side + "_score"]):
            raise ValueError("ESPN final teams or scores differ")
    periods = {len(c.get("linescores", [])) for c in competitors.values()}
    if len(periods) != 1 or not 2 <= next(iter(periods)) <= 10:
        raise ValueError("ESPN final period count unavailable")
    minutes = 40 + 5 * (periods.pop() - 2)

    shots = player_shots(payload, {str(game[s + "_id"]) for s in SIDES})
    boxes = {str(r["team"]["id"]): r["statistics"] for r in payload["boxscore"]["teams"]}
    players = {str(r["team"]["id"]): r["statistics"] for r in payload["boxscore"].get("players", [])}
    result = {"fixture": fixture_key(game), "minutes": minutes, "teams": {}}
    for side in SIDES:
        team = str(game[side + "_id"])
        v = {r["name"]: r["displayValue"] for r in boxes[team]}
        fgm, fga = map(int, v["fieldGoalsMade-fieldGoalsAttempted"].split("-"))
        tpm, tpa = map(int, v["threePointFieldGoalsMade-threePointFieldGoalsAttempted"].split("-"))
        ftm, fta = map(int, v["freeThrowsMade-freeThrowsAttempted"].split("-"))
        orb, drb, ast, tov = [int(v[k]) for k in ("offensiveRebounds", "defensiveRebounds", "assists", "totalTurnovers")]
        stl, blk = (int(v.get(k) or 0) for k in ("steals", "blocks"))
        points = int(competitors[side]["score"])
        if (not 0 <= tpm <= min(fgm, tpa) or not 0 <= fgm - tpm <= fga - tpa or not 0 <= ftm <= fta
                or min(orb, drb, ast, tov) < 0 or ast > fgm or 2 * fgm + tpm + ftm != points):
            raise ValueError("ESPN box totals do not reconcile")
        possessions = fga - orb + tov + .475 * fta
        if not 20 <= possessions * 40 / minutes <= 120:
            raise ValueError("ESPN box possession estimate outside range")
        starters = {}
        for unit in players.get(team, []):
            for player in unit.get("athletes", []):
                if player.get("starter") is True and not player.get("didNotPlay"):
                    athlete = player["athlete"]
                    starters[str(athlete["id"])] = ncaa.role((athlete.get("position") or {}).get("abbreviation"))
        result["teams"][team] = {
            "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "fta": fta, "orb": orb,
            "drb": drb, "ast": ast, "tov": tov, "stl": stl, "blk": blk, "pts": points, "poss": possessions,
            "starters": starters if len(starters) == 5 else {},
            "player_lines": player_lines(players.get(team, []), minutes, points),
            "player_shots": shots.get(team, {}),
            "box_context": {key: n for key, field in BOX_CONTEXT.items()
                            if (n := ncaa.number(v.get(field))) is not None and 0 <= n <= points},
        }
    # Backcourt pressure from the same payload's play-by-play. A game whose feed
    # is missing or too thin to show each side scoring is left out, never zeroed.
    counts = pressure.game_pressure(pressure.espn_plays(payload), tuple(str(game[s + "_id"]) for s in SIDES))
    result["pressure"] = counts if all(c["defense"]["after_score"] >= 10 for c in counts.values()) else None
    for team, kinds in shot_kinds(payload, list(result["teams"])).items():
        result["teams"][team]["kinds"] = kinds
    # Rim, two and three attempts from the same text, for shot quality.
    classes = shot_quality.game_classes(payload, list(result["teams"]))
    for team, row in classes.items():
        result["teams"][team]["classes"] = row if sum(a for a, _ in row.values()) else None
    # First- and second-half counts, reconciled to the line score (halves.py).
    for team, row in half_split.game_halves(payload, list(result["teams"])).items():
        result["teams"][team]["halves"] = row
    return result


def load_box(game, cache):
    file = cache / (str(game["game_id"]) + ".json")
    if file.exists():
        cached = read(file)
        if cached.get("fixture") == fixture_key(game) and "pressure" in cached and all(
            "player_lines" in row and "box_context" in row and "stl" in row and "kinds" in row and "classes" in row
            and "halves" in row and "player_shots" in row
            for row in cached["teams"].values()
        ):
            return cached
    response = requests.get(BOX_URL, params={"event": game["game_id"]}, timeout=15)
    response.raise_for_status()
    value = parse_box(response.json(), game)
    write(file, value)
    return value


def events(team):
    """(possessions, points, points squared) for the predictability read."""
    ftm = team["pts"] - 2 * team["fgm"] - team["tpm"]
    return predictability.basketball_game(team["fgm"], team["tpm"], ftm, team["fta"], team["pts"], team["poss"])


def counted_pace(year):
    """Reconcile NCAA possession and team-box totals before joining to ESPN finals."""
    counts = defaultdict(Counter)
    points = defaultdict(Counter)
    samples = {}
    invalid = set()
    for row in ncaa.iter_rows(year, "possessions"):
        game = row["contest_id"]
        samples.setdefault(game, row)
        team = row["poss_team_ncaa_team_id"]
        n = ncaa.number(row["pts"])
        if n is None or n < 0 or n != int(n):
            invalid.add(game)
            continue
        counts[game][team] += 1
        points[game][team] += int(n)
    boxes = defaultdict(dict)
    for row in ncaa.iter_rows(year, "team_box"):
        boxes[row["contest_id"]][row["team_ncaa_team_id"]] = row
    index = defaultdict(list)
    for game, row in samples.items():
        h, a = (row[s + "_ncaa_team_id"] for s in SIDES)
        if game in invalid or not h or not a or h == a or not {h, a} <= boxes[game].keys():
            continue
        if any(points[game][t] != ncaa.number(boxes[game][t]["pts"])
               or counts[game][t] != ncaa.number(boxes[game][t]["o_poss"]) for t in (h, a)):
            continue
        day = ncaa.game_date(row["game_date"]).isoformat()
        h_score, a_score = (points[game][t] for t in (h, a))
        for side, other in (("home", "away"), ("away", "home")):
            tid, opp = (ncaa.identifier(row[s + "_espn_team_id"]) for s in (side, other))
            if tid:
                index[(day, side, tid, h_score, a_score)].append((opp, (counts[game][h] + counts[game][a]) / 2))
    return index


def shooting_totals(finals):
    """Each D-I team's threes and free throws over its D-I finals."""
    totals = defaultdict(lambda: defaultdict(float))
    for g in finals:
        for side in ("home", "away"):
            for k, n in zip(("tpm", "tpa", "ftm", "fta"), g[side + "_shots"]):
                totals[g[side]][k] += n
    return totals


def rate_rows(pairs):
    """Season rates for a team Basketball Quant has not counted, from its ESPN
    boxes, on Basketball Quant's own definitions so they rank in one pool
    (checked against twelve counted teams, 2026-11-11): possessions are
    FGA - ORB + TOV + 0.44 FTA; TOV% is TOV / (FGA + 0.44 FTA + TOV); steal
    rates are per possession of the side losing the ball, block rates per two-
    point attempt, points off turnovers per opponent possession. Fast-break and
    paint points are left unfilled: ESPN's box counts them differently from
    Basketball Quant's play-by-play, so they would not rank on one scale.
    """
    def sum_side(k, side):
        return sum(pair[side].get(k) or 0 for pair in pairs)

    def fraction(n, d):
        return n / d if d else None

    def possessions(side):
        return sum_side("fga", side) - sum_side("orb", side) + sum_side("tov", side) + .44 * sum_side("fta", side)

    def turnover_points(side):
        values = [pair[side].get("box_context", {}).get("points_off_turnovers") for pair in pairs]
        return sum(values) if all(v is not None for v in values) else None

    rate = {"games_all": len(pairs)}
    poss = {0: possessions(0), 1: possessions(1)}
    for s, name in ((0, "o"), (1, "d")):
        fgm, fga, tpm, tpa, fta, ast, tov, pts = (
            sum_side(k, s) for k in ("fgm", "fga", "tpm", "tpa", "fta", "ast", "tov", "pts")
        )
        ftm = pts - 2 * fgm - tpm
        rate.update({
            f"efg_{name}_all": fraction(fgm + .5 * tpm, fga),
            f"tov_pct_{name}_all": fraction(tov, fga + .44 * fta + tov),
            f"ftr_{name}_all": fraction(fta, fga),
            f"tpr_{name}_all": fraction(tpa, fga),
            f"ppp_{'off' if s == 0 else 'def'}_all": fraction(pts, poss[s]),
            f"fg2_pct_{name}_all": fraction(fgm - tpm, fga - tpa),
            f"fg3_pct_{name}_all": fraction(tpm, tpa),
            f"ft_pct_{name}_all": fraction(ftm, fta),
            f"ast_rate_{name}_all": fraction(ast, fgm),
        })
    # Steals and blocks are logged by the defense, so the offense's rates are
    # what its opponents took from it: per own possession and own two-point try.
    twos = {side: sum_side("fga", side) - sum_side("tpa", side) for side in (0, 1)}
    rate["stl_pct_o_all"] = fraction(sum_side("stl", 1), poss[0])
    rate["stl_pct_d_all"] = fraction(sum_side("stl", 0), poss[1])
    rate["blk_pct_o_all"] = fraction(sum_side("blk", 1), twos[0])
    rate["blk_pct_d_all"] = fraction(sum_side("blk", 0), twos[1])
    own_pot, opp_pot = turnover_points(0), turnover_points(1)
    from .export import EXTRA_RATE_FIELDS
    rate.update({key: None for key in EXTRA_RATE_FIELDS if key not in rate})
    rate["pts_off_to_per_dposs_all"] = fraction(own_pot, poss[1]) if own_pot is not None else None
    rate["pts_off_to_per_dposs_d_all"] = fraction(opp_pot, poss[0]) if opp_pot is not None else None
    orb, drb = sum_side("orb", 0), sum_side("drb", 0)
    rate["orb_pct_all"] = fraction(orb, orb + sum_side("drb", 1))
    rate["drb_pct_all"] = fraction(drb, drb + sum_side("orb", 1))
    return rate


def starting_heights(games, roster):
    known = {str(r["id"]): r for r in roster}
    heights = defaultdict(list)
    total = Counter()
    for _, starters in games:
        for pid, position in starters.items():
            total[pid] += 1
            player = known.get(pid, {})
            height = ncaa.number(player.get("height"))
            if height is not None and 55 <= height <= 100:
                role = ncaa.role((player.get("position") or {}).get("abbreviation")) or position or "unlisted"
                heights[role].append((pid, height))

    def summary(rows):
        return {"mean_height_inches": mean(h for _, h in rows),
                "players": len({pid for pid, _ in rows}), "recorded_starts": len(rows)}

    all_heights = [r for rows in heights.values() for r in rows]
    if not all_heights:
        return None
    size = {**summary(all_heights), "reported_starts": sum(total.values()), "games": len(games),
            "source": START_SOURCE, "data_through": games[-1][0]}
    return size, [{"position": k, **summary(heights[k])} for k in ("G", "F", "C") if heights[k]]


ROTATION_WINDOW = 5


def add_box_context(context, box, games):
    """Publish alternate measured stats where possession tags or rotation lines are absent."""
    tactics = context["observed_tactics"]
    if not any(p.get("G") for p in context["players"]):
        players = {}
        sample_minutes = 0
        for _, minutes, own, _, _ in games:
            if not own["player_lines"]:
                continue
            sample_minutes += minutes
            for row in own["player_lines"]:
                count = players.setdefault(row["athlete_id"], Counter())
                count.update({k: row[k] for k in ("minutes", "Pts", "Reb", "Ast", "FGA", "FTA")})
                count.update({"G": 1})
                count["Name"] = row["Name"]
        if players:
            box["players"] = []
            for pid, row in players.items():
                attempts = row["FGA"] + .475 * row["FTA"]
                box["players"].append({"athlete_id": pid, "Name": row["Name"], "G": row["G"],
                    "Min_pct": 100 * row["minutes"] / sample_minutes,
                    **{k: row[k] / row["G"] for k in ("Pts", "Reb", "Ast")},
                    "TS": 100 * row["Pts"] / (2 * attempts) if attempts else None})
    # Recent rotation. A season minutes share misreads the player whose role
    # has just changed - a starter back from injury, a freshman promoted, a
    # senior dropped. Minutes are per team game in each window, not per game
    # played, so a player who missed games carries the lower expectation he
    # has earned. Facts only: no projection, no rating.
    played = [(date, own) for date, _, own, _, _ in games if own.get("player_lines")]
    if played:
        window = played[-ROTATION_WINDOW:]

        def totals(rows):
            minutes, appearances, names = defaultdict(float), Counter(), {}
            for _, own in rows:
                for line in own["player_lines"]:
                    minutes[line["athlete_id"]] += line["minutes"]
                    appearances[line["athlete_id"]] += 1
                    names[line["athlete_id"]] = line["Name"]
            return minutes, appearances, names

        season_minutes, season_games, names = totals(played)
        recent_minutes, recent_games, _ = totals(window)
        rotation = []
        for pid, minutes in recent_minutes.items():
            rotation.append({
                "athlete_id": pid, "Name": names.get(pid),
                "minutes_recent": minutes / len(window),
                "minutes_season": season_minutes[pid] / len(played),
                "games_recent": recent_games[pid], "games_season": season_games[pid]})
        rotation.sort(key=lambda r: -r["minutes_recent"])
        box["rotation"] = {"players": rotation, "window_games": len(window),
                           "games": len(played), "source": START_SOURCE,
                           "data_through": window[-1][0]}
    # Player shot profile: where a player shoots from, how he finishes there,
    # how much of his scoring is created for him, and how much he creates.
    # Season totals from the same play feed the team zones come from.
    profiles = {}
    for _, own in played:
        for pid, line in (own.get("player_shots") or {}).items():
            into = profiles.setdefault(pid, {"fga": 0, "fgm": 0, "assisted": 0, "assists": 0, "zones": {}})
            for field in ("fga", "fgm", "assisted", "assists"):
                into[field] += line.get(field, 0)
            for zone, (attempts, makes) in (line.get("zones") or {}).items():
                counts = into["zones"].setdefault(zone, [0, 0])
                counts[0] += attempts
                counts[1] += makes
    if profiles:
        names = {}
        for _, own in played:
            for line in own["player_lines"]:
                names[line["athlete_id"]] = line["Name"]
        rows = []
        for pid, p in profiles.items():
            zoned = sum(a for a, _ in p["zones"].values())
            rows.append({"athlete_id": pid, "Name": names.get(pid), "fga": p["fga"], "fgm": p["fgm"],
                         "assisted_share": p["assisted"] / p["fgm"] if p["fgm"] else None,
                         "assists": p["assists"],
                         "zones": [{"zone": z, "attempts": a, "made": m,
                                    "share": a / zoned if zoned else None,
                                    "fg_pct": 100 * m / a if a else None}
                                   for z, (a, m) in sorted(p["zones"].items())]})
        rows.sort(key=lambda r: -r["fga"])
        box["player_shots"] = {"players": rows, "games": len(played), "source": START_SOURCE,
                               "data_through": played[-1][0]}
    if not tactics.get("situations") or not tactics.get("restart_contexts"):
        for key in BOX_CONTEXT:
            pairs = [(own["box_context"][key], opp["box_context"][key])
                     for _, _, own, opp, _ in games if key in own["box_context"] and key in opp["box_context"]]
            if pairs:
                scored, allowed = zip(*pairs)
                box[key] = {"scored": mean(scored), "allowed": mean(allowed), "games": len(pairs)}
    if not tactics.get("personnel"):
        groups = Counter()
        for _, _, own, _, _ in games:
            starts = Counter(own["starters"].values())
            if sum(starts[k] for k in ("G", "F", "C")) == 5:
                groups[f'{starts["G"]}G-{starts["F"]}F-{starts["C"]}C'] += 1
        total = sum(groups.values())
        if total:
            box["starter_groups"] = [{"personnel": k, "games": n, "usage": n / total} for k, n in groups.most_common()]


def box_pace(games):
    """Possessions per 40 from final boxes, averaged over both teams, overtime normalized."""
    values = [(own["poss"] + opp["poss"]) * 20 / minutes for _, minutes, own, opp, _ in games]
    return {"estimated_per40": mean(values), "recent5_estimated_per40": mean(values[-5:]),
            "games": len(values), "data_through": games[-1][0]}


def supplement(contexts, schedule, year, as_of, cache, *, season_through=None, refresh_rates=False, rate_days=None):
    """Box-score facts for every team, plus fills where a source has nothing.

    Pace is estimated for every team from its D-I finals, the same games the
    team rates count; the possession-tagged source misses whole games. Teams
    with no D-I rate row are measured over all their finals in the window.
    Game-log figures can use verified finals through the current slate date.

    refresh_rates: Basketball Quant's team rates have fallen behind the finals
    (export.BOX_RATE_LAG_DAYS), so every team also gets box-score rates over
    its D-I finals through season_through, on the same definitions
    (rate_rows), for the export to lay over the stale row. rate_days, when
    given, limits a team's box rates and pace to the days its shot chart
    counts, so the two sections describe one sample.
    """
    season_through = season_through or as_of
    division = {str(team) for team in contexts}
    fill = {str(team): c for team, c in contexts.items() if not c["rates"].get("games_all")
            or not c["observed_tactics"]["pace"]["games"]
            or not c["observed_tactics"]["size_summary"]["starters"]["players"]
            or not all(c["observed_tactics"].get(k) for k in ("situations", "restart_contexts", "personnel"))
            or not any(p.get("G") for p in c["players"])}
    everything = {team for team, c in fill.items() if not c["rates"].get("games_all")}
    fixtures = {g["game_id"]: g for g in schedule if g["game_date"] <= as_of
                and g.get("status_type_completed") and g.get("status_type_name") == "STATUS_FINAL"
                and all(g.get(s + "_score") is not None for s in SIDES)
                # Every final a D-I team played: its game log reads them all. Rates
                # still count D-I opponents only (measured below), unless a team
                # has no D-I rate row at all.
                and any(str(g[s + "_id"]) in division for s in SIDES)}
    observations = defaultdict(list)
    exact = counted_pace(year)

    def read_game(g):
        try:
            return load_box(g, cache)
        except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as error:
            print(f"ESPN final {g['game_id']} skipped: {error}")
            return None

    finals = []  # one row per D-I game: what each side scored and its possessions
    pressed = defaultdict(dict)  # backcourt pressure over D-I games
    pressed_days = defaultdict(list)
    lines = defaultdict(dict)  # team -> game id -> (date, box line), every final
    scored = []  # (game id, home, away, both boxes) for every final, for the noise-adjusted score
    with ThreadPoolExecutor(max_workers=6) as pool:
        for g, box in zip(fixtures.values(), pool.map(read_game, fixtures.values())):
            if box is None:
                continue
            day, home, away, h_score, a_score = box["fixture"]
            season_game = day <= season_through
            season_division_game = season_game and home in division and away in division
            if season_division_game and box.get("pressure"):
                for tid, counts in box["pressure"].items():
                    pressure.add(pressed[tid], counts)
                    pressed_days[tid].append(day)
            for tid in (home, away):
                row = box["teams"][tid]
                row["ftm"] = row["pts"] - 2 * row["fgm"] - row["tpm"]
            scored.append((str(g["game_id"]), home, away, box["teams"]))
            if season_division_game:
                finals.append({"id": str(g["game_id"]), "date": day, "home": home, "away": away,
                               "neutral": bool(g.get("neutral_site")),
                               **{f"{side}_shots": [box["teams"][tid][k] for k in ("tpm", "tpa", "ftm", "fta")]
                                  for side, tid in (("home", home), ("away", away))},
                               **{f"{side}_{k}": box["teams"][tid][k] for side, tid in (("home", home), ("away", away))
                                  for k in ("pts", "poss")},
                               **{f"{side}_events": events(box["teams"][tid]) for side, tid in (("home", home), ("away", away))}})
            for side, own, opp in (("home", home, away), ("away", away, home)):
                if own not in division:
                    continue
                lines[own][str(g["game_id"])] = (day, game_lines.line(box["teams"][own], box["teams"][opp], box["minutes"]))
                if not season_game:
                    continue
                matches = [p for tid, p in exact[(day, side, own, h_score, a_score)] if tid is None or tid == opp]
                observations[own].append((day, box["minutes"], box["teams"][own], box["teams"][opp],
                                          matches[0] if len(matches) == 1 else None, opp in division))
    filled = Counter()
    lineups = {}
    quality = {}  # team -> eFG and xeFG so far, both directions (shot_quality.py)
    logged = game_lines.ranked(lines)
    # Each final's noise-adjusted score (pipeline/power.py): half of each side's
    # three-point and free-throw luck against its own D-I season rate taken
    # out; a non-D-I opponent shoots against the league rate.
    rates = power.shooting_rates(shooting_totals(finals))
    luck = defaultdict(regression.Tally)
    for gid, home, away, teams in scored:
        adj = {tid: power.basketball_points(t["pts"], t["tpm"], t["tpa"], t["ftm"], t["fta"],
                                            rates.get(tid) or rates[""]) for tid, t in teams.items()}
        for own, opp in ((home, away), (away, home)):
            if own in logged and gid in logged[own]:
                logged[own][gid]["adj_points"] = round(adj[own], 1)
                logged[own][gid]["adj_opponent_points"] = round(adj[opp], 1)
                # The Regression Watch reads the same finals as the log.
                regression.basketball_game(luck[own], teams[own], teams[opp], rates.get(own) or rates[""],
                                           rates.get(opp) or rates[""], CLOSE)
    by_id = {str(t): c for t, c in contexts.items()}
    for team, block in regression.publish(luck, division, CLOSE, regression.BASKETBALL_PARTS).items():
        by_id[team]["regression"] = block
        filled["regression"] += 1
    for team, context in ((str(t), c) for t, c in contexts.items()):
        for g in context.get("games") or []:
            found = logged.get(team, {}).get(str(g["id"]))
            if found:
                g.update(found)
                filled["game lines"] += 1
    for team, context in ((str(t), c) for t, c in contexts.items()):
        days = pressed_days.get(team)
        context["pressure"] = pressure.summarise(pressed[team], len(days), max(days)) if days else None
        if context["pressure"] is None:
            context.pop("pressure")
        else:
            filled["pressure"] += 1
    for team, context in ((str(t), c) for t, c in contexts.items()):
        rows = sorted(observations[team], key=lambda row: row[0])
        measured = [row[:5] for row in rows if team in everything or row[5]]
        if refresh_rates and rate_days is not None and team not in everything and rate_days.get(team):
            measured = [row for row in measured if row[0] in rate_days[team]]
        if not measured:
            continue
        box = {"source": BOX_SOURCE, "data_through": measured[-1][0], "games": len(measured),
               "pace": box_pace(measured)}
        filled["box pace"] += 1
        if team in fill:
            fill_context(context, box, measured, team, year, filled)
        if refresh_rates and "rates" not in box:
            box["rates"] = rate_rows([(own, opp) for _, _, own, opp, _ in measured])
            filled["refreshed rates"] += 1
        # Drives, floaters and pull-ups over the same games, where the feed names them.
        named = [(own["kinds"], opp["kinds"]) for _, _, own, opp, _ in measured if own.get("kinds") and opp.get("kinds")]
        context["rates"].update(kind_rates(named))
        filled["shot kinds"] += bool(named)
        # Half by half over the same games, where the play-by-play reconciles.
        halved = [(own["halves"], opp["halves"]) for _, _, own, opp, _ in measured
                  if own.get("halves") and opp.get("halves")]
        context["rates"].update(half_split.rates(halved) if halved else {k: None for k in half_split.KEYS})
        filled["halves"] += bool(halved)
        classed = [(own, opp) for _, _, own, opp, _ in measured if own.get("classes") and opp.get("classes")]
        if classed:
            def efg(rows):
                fga = sum(r["fga"] for r in rows)
                return (sum(r["fgm"] for r in rows) + 0.5 * sum(r["tpm"] for r in rows)) / fga if fga else None
            quality[team] = {"games": len(classed),
                             "o_efg": efg([own for own, _ in classed]), "d_efg": efg([opp for _, opp in classed]),
                             "o_xefg": shot_quality.xefg([own["classes"] for own, _ in classed]),
                             "d_xefg": shot_quality.xefg([opp["classes"] for _, opp in classed])}
        context["official_box"] = box
        # Starter size follows whichever source recorded more opening lineups.
        starts = [(date, own["starters"]) for date, _, own, _, _ in measured if own["starters"]]
        recorded = (context["observed_tactics"]["size_summary"]["starters"].get("reported_starts") or 0) / 5
        if len(starts) > recorded:
            lineups[team] = (context, starts)
    # Shot quality needs the pool's averages, so it is set once every team is read.
    blended = shot_quality.predicted(quality)
    for team, context in ((str(t), c) for t, c in contexts.items()):
        q = quality.get(team)
        context["rates"].update({"xefg_o_all": q and q["o_xefg"], "xefg_d_all": q and q["d_xefg"],
                                 "pefg_o_all": (blended.get(team) or {}).get("pefg_o_all"),
                                 "pefg_d_all": (blended.get(team) or {}).get("pefg_d_all")})
        filled["shot quality"] += bool(blended.get(team))
    with ThreadPoolExecutor(max_workers=6) as pool:
        rosters = dict(zip(lineups, pool.map(lambda team: read_roster(team, year), lineups)))
    for team, (context, starts) in lineups.items():
        found = starting_heights(starts, rosters[team]) if rosters[team] else None
        if found:
            tactics = context["observed_tactics"]
            tactics["size_summary"]["starters"], tactics["starter_position_size"] = found
            filled["starter size"] += 1
    print(f"Matched ESPN finals filled CBB evidence {dict(filled)}.")
    return finals


def read_roster(team, year):
    try:
        return fetch_roster(team, year)
    except (requests.RequestException, ValueError, KeyError) as error:
        print(f"ESPN starters for team {team} skipped: {error}")
        return None


def fill_context(context, box, games, team, year, filled):
    tactics = context["observed_tactics"]
    if not context["rates"].get("games_all"):
        box["rates"] = rate_rows([(own, opp) for _, _, own, opp, _ in games])
        filled["rates"] += 1
    if not tactics["pace"]["games"]:
        counted = [(date, poss * 40 / minutes) for date, minutes, _, _, poss in games if poss is not None]
        if counted:
            values = [pace for _, pace in counted]
            tactics["pace"] = {"observed_per40": mean(values), "recent5_per40": mean(values[-5:]),
                               "games": len(values), "regulation_minutes": 40, "sample_qualified": len(values) >= 5,
                               "source": COUNT_SOURCE, "data_through": counted[-1][0]}
            filled["counted pace"] += 1
    add_box_context(context, box, games)
