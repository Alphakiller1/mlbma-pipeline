#!/usr/bin/env python3
"""Rank a completed CBB season's per-game box lines against their week and
write them into the published team files' game logs.

The current season is ranked on every refresh from the ESPN boxes the export
already reads (pipeline/cbb_public/espn_boxes.py); a completed season is ranked
once here from the SportsDataverse hoopR team boxes, with overtime read from
the play-by-play, and then retained by the export. Needs pandas + pyarrow.

    python scripts/backfill_cbb_game_lines.py --season 2026 [--box path] [--pbp path]
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
from pipeline.cbb_public import game_lines  # noqa: E402

PUBLIC = ROOT / "data" / "public" / "cbb"
RAW = "https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb/{kind}/parquet/{name}_{season}.parquet"


def fetch(path: Path | None, kind: str, name: str, season: str) -> Path:
    if path:
        return path
    target = ROOT / ".cache" / f"hoopr-{kind}-{season}.parquet"
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(RAW.format(kind=kind, name=name, season=season), target)
    return target


def main() -> int:
    import pandas as pd
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--box", type=Path)
    parser.add_argument("--pbp", type=Path)
    args = parser.parse_args()
    season = str(args.season)
    team_dir = PUBLIC / season / "teams"
    division = {p.stem for p in team_dir.glob("*.json")}
    box = pd.read_parquet(fetch(args.box, "team_box", "team_box", season))
    box = box[box.season_type.isin([2, 3])]
    periods = pd.read_parquet(fetch(args.pbp, "pbp", "play_by_play", season), columns=["game_id", "period_number"])
    minutes = {int(g): 40 + 5 * max(int(p) - 2, 0) for g, p in periods.groupby("game_id").period_number.max().items()}
    sides = defaultdict(dict)
    for r in box.itertuples():
        tov = r.total_turnovers if r.total_turnovers == r.total_turnovers else r.turnovers
        sides[int(r.game_id)][str(r.team_id)] = (str(r.game_date)[:10], {
            "fgm": r.field_goals_made, "fga": r.field_goals_attempted, "tpm": r.three_point_field_goals_made,
            "tpa": r.three_point_field_goals_attempted, "ftm": r.free_throws_made, "fta": r.free_throws_attempted,
            "orb": r.offensive_rebounds, "drb": r.defensive_rebounds,
            "poss": r.field_goals_attempted - r.offensive_rebounds + tov + 0.475 * r.free_throws_attempted})
    lines = defaultdict(dict)
    for gid, teams in sides.items():
        if len(teams) != 2 or gid not in minutes:
            continue
        (a, (day, ra)), (b, (_, rb)) = teams.items()
        if any(v != v for row in (ra, rb) for v in row.values()) or not ra["fga"] or not rb["fga"]:
            continue
        for own, mine, theirs in ((a, ra, rb), (b, rb, ra)):
            if own in division:
                lines[own][str(gid)] = (day, game_lines.line(mine, theirs, minutes[gid]))
    logged = game_lines.ranked(lines)
    written = matched = total = 0
    for tid in division:
        path = team_dir / f"{tid}.json"
        team = json.loads(path.read_text(encoding="utf-8"))
        for g in team.get("games") or []:
            if g.get("points") is None:
                continue
            total += 1
            found = logged.get(tid, {}).get(str(g["id"]))
            if found:
                g.update(found)
                matched += 1
        path.write_text(json.dumps(team, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        written += 1
    if matched < 0.9 * total:
        raise SystemExit(f"Only {matched} of {total} completed games matched a box line")
    print(f"{season}: box lines for {matched} of {total} completed games across {written} teams")
    return 0


if __name__ == "__main__":
    sys.exit(main())
