#!/usr/bin/env python3
"""Measure a completed CBB season's backcourt pressure from its full ESPN
play-by-play (SportsDataverse hoopR release) and write it into the published
team files and rank baselines.

The current season is measured on every refresh from the ESPN summaries the box
fetch already reads (pipeline/cbb_public/espn_boxes.py); a completed season is
measured once here and then retained by the export. Needs pandas + pyarrow.

    python scripts/backfill_cbb_pressure.py --season 2026 [--parquet path]
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
from pipeline.cbb_public import pressure  # noqa: E402
from pipeline.cbb_public.export import distribution  # noqa: E402

PUBLIC = ROOT / "data" / "public" / "cbb"
RELEASE = "https://raw.githubusercontent.com/sportsdataverse/hoopR-mbb-data/main/mbb/pbp/parquet/play_by_play_{season}.parquet"
COLUMNS = ["game_id", "game_date", "season_type", "type_text", "period_number", "clock_display_value", "team_id",
           "scoring_play", "shooting_play", "home_team_id", "away_team_id"]


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def measure(parquet: Path, division: set[str]) -> dict[str, dict]:
    import pandas as pd
    frame = pd.read_parquet(parquet, columns=COLUMNS)
    frame = frame[frame.season_type.isin([2, 3])]
    totals: dict[str, dict] = defaultdict(dict)
    days: dict[str, list] = defaultdict(list)
    for _gid, g in frame.groupby("game_id", sort=False):
        home, away = str(int(g.home_team_id.iloc[0])), str(int(g.away_team_id.iloc[0]))
        if home not in division or away not in division:
            continue
        plays = [{"period": p, "clock": c, "type": t, "team": str(int(tm)) if tm == tm else None,
                  "scoring": bool(s), "shooting": bool(sh)}
                 for t, p, c, tm, s, sh in zip(g.type_text, g.period_number, g.clock_display_value, g.team_id,
                                               g.scoring_play, g.shooting_play)]
        counts = pressure.game_pressure(plays, (home, away))
        if not all(c["defense"]["after_score"] >= 10 for c in counts.values()):
            continue
        day = str(g.game_date.iloc[0])[:10]
        for tid, c in counts.items():
            pressure.add(totals[tid], c)
            days[tid].append(day)
    return {tid: pressure.summarise(totals[tid], len(days[tid]), max(days[tid])) for tid in days}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--parquet", type=Path)
    args = parser.parse_args()
    season = str(args.season)
    parquet = args.parquet
    if parquet is None:
        parquet = ROOT / ".cache" / f"hoopr-pbp-{season}.parquet"
        if not parquet.exists():
            parquet.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(RELEASE.format(season=season), parquet)
    team_dir = PUBLIC / season / "teams"
    division = {p.stem for p in team_dir.glob("*.json")}
    blocks = measure(parquet, division)
    if len(blocks) < 0.95 * len(division):
        raise SystemExit(f"Only {len(blocks)} of {len(division)} teams measured; nothing written")
    for tid in division:
        path = team_dir / f"{tid}.json"
        team = read_json(path)
        if blocks.get(tid):
            team["pressure"] = blocks[tid]
        else:
            team.pop("pressure", None)
        write_json(path, team)
    index, ranks = read_json(PUBLIC / "teams.json"), read_json(PUBLIC / "matchup-ranks.json")
    for key in pressure.RANKED:
        sample = distribution(pressure.rank_values(blocks.values(), key), rank_samples=True)
        ranks["grade_baselines"][season]["team"][key] = sample.pop("rank_samples")
        index["grade_baselines"][season]["team"][key] = sample
    write_json(PUBLIC / "teams.json", index)
    write_json(PUBLIC / "matchup-ranks.json", ranks)
    print(f"{season}: pressure for {len(blocks)} of {len(division)} D-I teams")
    return 0


if __name__ == "__main__":
    sys.exit(main())
