"""Supplement missing current-season facts from score-matched final box scores."""
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from statistics import mean

import requests

from .. import predictability
from . import game_lines
from . import possession_data as ncaa
from . import pressure
from .data import read, write
from .espn_roster import fetch_roster

BOX_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary"
BOX_SOURCE = "ESPN final box scores"
COUNT_SOURCE = "SportsDataverse NCAA possessions matched to ESPN finals"
START_SOURCE = "ESPN starting lineups and rosters"
SIDES = ("home", "away")
BOX_CONTEXT = {"fast_break_points": "fastBreakPoints", "points_off_turnovers": "turnoverPoints"}


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
            "drb": drb, "ast": ast, "tov": tov, "pts": points, "poss": possessions,
            "starters": starters if len(starters) == 5 else {},
            "player_lines": player_lines(players.get(team, []), minutes, points),
            "box_context": {key: n for key, field in BOX_CONTEXT.items()
                            if (n := ncaa.number(v.get(field))) is not None and 0 <= n <= points},
        }
    # Backcourt pressure from the same payload's play-by-play. A game whose feed
    # is missing or too thin to show each side scoring is left out, never zeroed.
    counts = pressure.game_pressure(pressure.espn_plays(payload), tuple(str(game[s + "_id"]) for s in SIDES))
    result["pressure"] = counts if all(c["defense"]["after_score"] >= 10 for c in counts.values()) else None
    return result


def load_box(game, cache):
    file = cache / (str(game["game_id"]) + ".json")
    if file.exists():
        cached = read(file)
        if cached.get("fixture") == fixture_key(game) and "pressure" in cached and all(
            "player_lines" in row and "box_context" in row for row in cached["teams"].values()
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


def rate_rows(pairs):
    def sum_side(k, side):
        return sum(pair[side][k] for pair in pairs)

    def fraction(n, d):
        return n / d if d else None

    rate = {"games_all": len(pairs)}
    for s, name in ((0, "o"), (1, "d")):
        fgm, fga, tpm, tpa, fta, ast, tov, pts, poss = (
            sum_side(k, s) for k in ("fgm", "fga", "tpm", "tpa", "fta", "ast", "tov", "pts", "poss")
        )
        rate.update({
            f"efg_{name}_all": fraction(fgm + .5 * tpm, fga),
            f"tov_pct_{name}_all": fraction(tov, poss),
            f"ftr_{name}_all": fraction(fta, fga),
            f"tpr_{name}_all": fraction(tpa, fga),
            f"ppp_{'off' if s == 0 else 'def'}_all": fraction(pts, poss),
            f"fg2_pct_{name}_all": fraction(fgm - tpm, fga - tpa),
            f"fg3_pct_{name}_all": fraction(tpm, tpa),
            f"ast_rate_{name}_all": fraction(ast, fgm),
        })
    from .export import EXTRA_RATE_FIELDS
    rate.update({key: None for key in EXTRA_RATE_FIELDS})
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


def supplement(contexts, schedule, year, as_of, cache):
    """Box-score facts for every team, plus fills where a source has nothing.

    Pace is estimated for every team from its D-I finals, the same games the
    team rates count; the possession-tagged source misses whole games. Teams
    with no D-I rate row are measured over every final they played.
    """
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
    with ThreadPoolExecutor(max_workers=6) as pool:
        for g, box in zip(fixtures.values(), pool.map(read_game, fixtures.values())):
            if box is None:
                continue
            day, home, away, h_score, a_score = box["fixture"]
            if home in division and away in division and box.get("pressure"):
                for tid, counts in box["pressure"].items():
                    pressure.add(pressed[tid], counts)
                    pressed_days[tid].append(day)
            if home in division and away in division:
                finals.append({"id": str(g["game_id"]), "date": day, "home": home, "away": away,
                               **{f"{side}_{k}": box["teams"][tid][k] for side, tid in (("home", home), ("away", away))
                                  for k in ("pts", "poss")},
                               **{f"{side}_events": events(box["teams"][tid]) for side, tid in (("home", home), ("away", away))}})
            for side, own, opp in (("home", home, away), ("away", away, home)):
                if own not in division:
                    continue
                lines[own][str(g["game_id"])] = (day, game_lines.line(
                    {**box["teams"][own], "ftm": box["teams"][own]["pts"] - 2 * box["teams"][own]["fgm"] - box["teams"][own]["tpm"]},
                    box["teams"][opp], box["minutes"]))
                matches = [p for tid, p in exact[(day, side, own, h_score, a_score)] if tid is None or tid == opp]
                observations[own].append((day, box["minutes"], box["teams"][own], box["teams"][opp],
                                          matches[0] if len(matches) == 1 else None, opp in division))
    filled = Counter()
    lineups = {}
    logged = game_lines.ranked(lines)
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
        if not measured:
            continue
        box = {"source": BOX_SOURCE, "data_through": measured[-1][0], "games": len(measured),
               "pace": box_pace(measured)}
        filled["box pace"] += 1
        if team in fill:
            fill_context(context, box, measured, team, year, filled)
        context["official_box"] = box
        # Starter size follows whichever source recorded more opening lineups.
        starts = [(date, own["starters"]) for date, _, own, _, _ in measured if own["starters"]]
        recorded = (context["observed_tactics"]["size_summary"]["starters"].get("reported_starts") or 0) / 5
        if len(starts) > recorded:
            lineups[team] = (context, starts)
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
