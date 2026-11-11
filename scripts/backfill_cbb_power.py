#!/usr/bin/env python3
"""Power-rank a completed CBB season and write each final's noise-adjusted
score into the published team files (pipeline/power.py).

The current season is rated on every refresh from the ESPN boxes the export
already reads (pipeline/cbb_public/export.py adjusted_ranking); a completed
season is rated once here from the SportsDataverse hoopR team boxes, with
neutral sites from its schedule, and then retained by the export.
Needs pandas + pyarrow.

    python scripts/backfill_cbb_power.py --season 2026 [--box path] [--schedule path]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from pipeline import power  # noqa: E402
from pipeline.cbb_public.espn_boxes import shooting_totals  # noqa: E402
from pipeline.cbb_public.export import adjusted_ranking  # noqa: E402

PUBLIC = ROOT / "data" / "public" / "cbb"
RAW = {"team_box": "https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb/team_box/parquet/team_box_{season}.parquet",
       "schedule": "https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb/schedules/parquet/mbb_schedule_{season}.parquet"}


def fetch(path: Path | None, kind: str, season: str) -> Path:
    if path:
        return path
    target = ROOT / ".cache" / f"hoopr-{kind}-{season}.parquet"
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(RAW[kind].format(season=season), target)
    return target


def main() -> int:
    import pandas as pd
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--box", type=Path)
    parser.add_argument("--schedule", type=Path)
    args = parser.parse_args()
    season = str(args.season)
    team_dir = PUBLIC / season / "teams"
    contexts = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in team_dir.glob("*.json")}
    box = pd.read_parquet(fetch(args.box, "team_box", season))
    box = box[box.season_type.isin([2, 3])]
    sched = pd.read_parquet(fetch(args.schedule, "schedule", season), columns=["game_id", "neutral_site"])
    neutral = {int(g): bool(n) for g, n in zip(sched.game_id, sched.neutral_site)}
    sides = defaultdict(dict)
    for r in box.itertuples():
        tov = r.total_turnovers if r.total_turnovers == r.total_turnovers else r.turnovers
        row = {"pts": r.team_score, "fgm": r.field_goals_made, "fga": r.field_goals_attempted,
               "tpm": r.three_point_field_goals_made, "tpa": r.three_point_field_goals_attempted,
               "ftm": r.free_throws_made, "fta": r.free_throws_attempted, "orb": r.offensive_rebounds, "tov": tov}
        if any(v != v for v in row.values()) or 2 * row["fgm"] + row["tpm"] + row["ftm"] != row["pts"]:
            continue
        row["poss"] = row["fga"] - row["orb"] + row["tov"] + 0.475 * row["fta"]
        sides[int(r.game_id)][str(r.team_id)] = (r.team_home_away, str(r.game_date)[:10], row)
    finals, every = [], []
    for gid, teams in sides.items():
        if len(teams) != 2:
            continue
        by = {ha: (tid, day, row) for tid, (ha, day, row) in teams.items()}
        if set(by) != {"home", "away"}:
            continue
        (home, day, h), (away, _, a) = by["home"], by["away"]
        every.append((str(gid), home, away, h, a))
        if home in contexts and away in contexts and h["poss"] >= 50 and a["poss"] >= 50:
            finals.append({"id": str(gid), "date": day, "home": home, "away": away, "neutral": neutral.get(gid, False),
                           "home_pts": h["pts"], "away_pts": a["pts"], "home_poss": h["poss"], "away_poss": a["poss"],
                           "home_shots": [h[k] for k in ("tpm", "tpa", "ftm", "fta")],
                           "away_shots": [a[k] for k in ("tpm", "tpa", "ftm", "fta")]})
    adjusted_ranking(contexts, finals)
    rates = power.shooting_rates(shooting_totals(finals))
    adj = {}
    for gid, home, away, h, a in every:
        for own, opp, mine, theirs in ((home, away, h, a), (away, home, a, h)):
            adj[(own, gid)] = (power.basketball_points(mine["pts"], mine["tpm"], mine["tpa"], mine["ftm"], mine["fta"],
                                                       rates.get(own) or rates[""]),
                               power.basketball_points(theirs["pts"], theirs["tpm"], theirs["tpa"], theirs["ftm"],
                                                       theirs["fta"], rates.get(opp) or rates[""]))
    matched = total = rated = 0
    for tid, team in contexts.items():
        rated += bool(team.get("adjusted"))
        for g in team.get("games") or []:
            if g.get("points") is None:
                continue
            total += 1
            hit = adj.get((tid, str(g["id"])))
            if hit:
                g["adj_points"], g["adj_opponent_points"] = round(hit[0], 1), round(hit[1], 1)
                matched += 1
        (team_dir / f"{tid}.json").write_text(json.dumps(team, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if matched < 0.9 * total or rated < 0.95 * len(contexts):
        raise SystemExit(f"Only {matched} of {total} finals adjusted, {rated} of {len(contexts)} teams rated")
    print(f"{season}: {rated} teams power-ranked from {len(finals)} D-I finals; {matched} of {total} finals noise-adjusted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
