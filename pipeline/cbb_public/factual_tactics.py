"""Observed NCAA pace, situations, personnel and listed size; no forecasts.

This module is vendored with the factual ingestion adapter in the website.
It intentionally has no model/scipy import and emits only explicit fields.
"""

from collections import defaultdict
from datetime import datetime, time
from statistics import mean

from . import possession_data as source
from .data import read, table


def grade(rows):
    pools = defaultdict(list)
    for team in rows.values():
        for family in ("personnel", "situations"):
            for r in team[family]:
                if r["sample_qualified"]:
                    key = (
                        family,
                        r["side"],
                        r.get("basis"),
                        r.get("personnel", r.get("kind")),
                    )
                    pools[key].append(r["ppp"])
    for team in rows.values():
        for family in ("personnel", "situations"):
            for r in team[family]:
                key = (
                    family,
                    r["side"],
                    r.get("basis"),
                    r.get("personnel", r.get("kind")),
                )
                pool = pools[key]
                low = r["side"] == "defense"
                r["ppp_grade"] = None
                if r["sample_qualified"] and len(pool) >= 10:
                    rank = 1 + sum(
                        v < r["ppp"] - 1e-12 if low else v > r["ppp"] + 1e-12
                        for v in pool
                    )
                    r["ppp_grade"] = {
                        "rank": rank,
                        "of": len(pool),
                        "better": "low" if low else "high",
                    }


def season(year, cohort, cutoff, raw=None):
    games, forms, situations, quality = raw or source.normalize(year, cohort)
    eligible = [r for r in games if datetime.fromisoformat(r["available_at"]) < cutoff]
    allowed = {r["game_id"] for r in eligible}
    team_games = defaultdict(list)
    for row in eligible:
        team_games[row["team"]].append(row)
    # Exact source team IDs, never display-name guesses.
    cross = {
        source.identifier(r["team_ncaa_team_id"]): source.identifier(
            r["team_espn_team_id"]
        )
        for r in source.iter_rows(year, "team_box")
    }
    heights = defaultdict(lambda: defaultdict(list))
    starts = defaultdict(lambda: defaultdict(list))
    reported_starts = defaultdict(float)
    seen = set()
    for r in source.iter_rows(year, "team_rosters"):
        team = cross.get(source.identifier(r["team_id"]))
        position = source.role(r["position"])
        key = (team, r["player_id"] or source.normal(r["player"]))
        if team not in cohort or not position or key in seen:
            continue
        seen.add(key)
        height = source.number(r["ht_inches"])
        gs, gp = source.number(r.get("gs")), source.number(r.get("gp"))
        gs = (
            gs
            if gs is not None and gp is not None and 0 <= gs <= gp and int(gs) == gs
            else 0
        )
        reported_starts[team] += gs
        if height is not None and 55 <= height <= 100:
            heights[team][position].append(height)
            if gs:
                starts[team][position].append((height, gs))
    acc = defaultdict(
        lambda: defaultdict(lambda: {"possessions": 0, "points": 0, "games": set()})
    )
    for r in forms:
        if r["game_id"] not in allowed:
            continue
        for team, side, own, other in (
            (r["team"], "offense", r["own_personnel"], r["opponent_personnel"]),
            (r["opponent"], "defense", r["opponent_personnel"], r["own_personnel"]),
        ):
            for basis, label in (("own", own), ("opponent", other)):
                v = acc[team][(side, basis, label)]
                v["possessions"] += r["possessions"]
                v["points"] += r["points"]
                v["games"].add(r["game_id"])
    peers = {(r["game_id"], r["team"]): r["opponent"] for r in eligible}
    sit = defaultdict(
        lambda: defaultdict(lambda: {"possessions": 0, "points": 0, "games": set()})
    )
    for r in situations:
        if r["game_id"] not in allowed:
            continue
        for team, side in (
            (r["team"], "offense"),
            (peers[(r["game_id"], r["team"])], "defense"),
        ):
            for kind in ("transition", "half_court"):
                v = sit[team][(side, kind)]
                n = r[kind + "_possessions"]
                v["possessions"] += n
                v["points"] += r[kind + "_points"]
                if n:
                    v["games"].add(r["game_id"])
    receipts = [
        read(source.DATA / str(year) / (family + ".receipt.json"))
        for family in source.FAMILIES
    ]
    output = {}
    for team in sorted(cohort):
        rows = sorted(team_games[team], key=lambda r: r["date"])
        paces = [r["possessions"] * 40 / r["duration_minutes"] for r in rows]
        records = []
        situational = []
        totals = defaultdict(float)
        for (side, basis, _), v in acc[team].items():
            totals[(side, basis)] += v["possessions"]
        for (side, basis, label), v in sorted(acc[team].items()):
            records.append(
                {
                    "side": side,
                    "basis": basis,
                    "personnel": label,
                    "possessions": v["possessions"],
                    "points": v["points"],
                    "games": len(v["games"]),
                    "usage": v["possessions"] / totals[(side, basis)],
                    "ppp": v["points"] / v["possessions"],
                    "sample_qualified": v["possessions"] >= 100
                    and len(v["games"]) >= 5,
                }
            )
        for (side, kind), v in sorted(sit[team].items()):
            den = sum(x["possessions"] for (s, _), x in sit[team].items() if s == side)
            situational.append(
                {
                    "side": side,
                    "kind": kind,
                    "possessions": v["possessions"],
                    "points": v["points"],
                    "games": len(v["games"]),
                    "usage": v["possessions"] / den if den else None,
                    "ppp": v["points"] / v["possessions"] if v["possessions"] else None,
                    "sample_qualified": v["possessions"] >= 100
                    and len(v["games"]) >= 5,
                }
            )
        output[team] = {
            "schema": "cbb-observed-tactics/1",
            "season": year,
            "games": len(rows),
            "data_through": max((r["date"][:10] for r in rows), default=None),
            "source": "SportsDataverse NCAA",
            "source_url": "https://github.com/sportsdataverse/ncaa-mbb-hoops-data",
            "retrieved_at_utc": max(r["retrieved_at_utc"] for r in receipts),
            "pace": {
                "observed_per40": mean(paces) if paces else None,
                "recent5_per40": mean(paces[-5:]) if paces else None,
                "games": len(paces),
                "regulation_minutes": 40,
                "sample_qualified": len(paces) >= 5,
            },
            "personnel": records,
            "situations": situational,
            "position_size": [
                {
                    "position": p,
                    "mean_height_inches": mean(values),
                    "players": len(values),
                }
                for p, values in sorted(heights[team].items())
                if values
            ],
            "starter_position_size": [
                {
                    "position": p,
                    "mean_height_inches": sum(h * n for h, n in values)
                    / sum(n for _, n in values),
                    "players": len(values),
                    "recorded_starts": sum(n for _, n in values),
                }
                for p, values in sorted(starts[team].items())
                if values
            ],
            "size_summary": {
                "whole_team": {
                    "mean_height_inches": mean(
                        [h for v in heights[team].values() for h in v]
                    )
                    if heights[team]
                    else None,
                    "players": sum(len(v) for v in heights[team].values()),
                },
                "starters": {
                    "mean_height_inches": sum(
                        h * n for v in starts[team].values() for h, n in v
                    )
                    / sum(n for v in starts[team].values() for _, n in v)
                    if starts[team]
                    else None,
                    "players": sum(len(v) for v in starts[team].values()),
                    "recorded_starts": sum(
                        n for v in starts[team].values() for _, n in v
                    ),
                    "reported_starts": reported_starts[team],
                },
                "basis": "Whole team: unweighted reported heights. Starters: height weighted by recorded season starts, among players with a reported height.",
            },
            "definitions": "Pace: box-source possessions normalized for recorded OT. Personnel: listed G/F/C of five on-court players. Size: unweighted reported roster heights; hybrids C then G then F.",
            "not_measured": [
                "Geometric sets",
                "Man/zone coverage",
                "Drop/switch/blitz coverage",
                "Player weights",
            ],
            "coverage_samples": {
                "valid_source_games": quality["valid_games"],
                "score_reconciliation_exclusions": quality["excluded"].get(
                    "score_reconciliation_games", 0
                ),
            },
        }
    grade(output)
    return output


def build(snapshot, as_of, normalized=None):
    cutoff = datetime.combine(source.game_date(as_of), time(), tzinfo=source.ET)
    result = {}
    for year in (2026, 2027):
        cohort = {str(r["team_id"]) for r in table(snapshot, "mbb_team_seasons", year)}
        part = normalized.get(year) if normalized else None
        raw = (
            (
                part["team_games"],
                part["formations"],
                part["situations"],
                part["quality"],
            )
            if part
            else None
        )
        result[year] = season(year, cohort, cutoff, raw)
    return result
