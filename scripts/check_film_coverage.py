"""Verify film charting records against the public ESPN game log.

The film supplies the coverage label; the game log supplies the outcome.
Run with --live to cross-check the recorded score changes against ESPN.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import urllib.request
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SCHEMES = {
    "cbb": {"man", "zone", "unclassified"},
    "nba": {"drop", "switch", "blitz", "unclassified"},
}
ESPN_SPORTS = {"cbb": "mens-college-basketball", "nba": "nba"}


def validate_sample(sport: str, sample: dict, summary: dict | None = None) -> None:
    game_id = sample["game_id"]
    day = date.fromisoformat(sample["game_date"])
    assert re.fullmatch(r"\d+", game_id), game_id
    assert sample["season"] == day.year + (day.month >= 10), game_id
    assert sample["away"]["team_id"] != sample["home"]["team_id"], game_id
    for field, domains in {
        "film_url": {"www.youtube.com", "x.com"},
        "results_url": {"www.espn.com"},
    }.items():
        url = urlsplit(sample[field])
        assert url.scheme == "https" and url.netloc in domains and url.path, field
    assert game_id in sample["results_url"], game_id
    possessions = sample["film_possessions"]
    assert possessions, game_id
    if sport == "cbb":
        assert len(possessions) == 10, game_id
    ids = set()
    previous = None
    source_plays = {}
    if summary is not None:
        assert str(summary["header"]["id"]) == game_id, game_id
        contest = summary["header"]["competitions"][0]
        assert contest["status"]["type"]["completed"], game_id
        played = datetime.fromisoformat(contest["date"].replace("Z", "+00:00"))
        assert played.astimezone(ZoneInfo("America/New_York")).date() == day, game_id
        sides = {c["homeAway"]: c["team"] for c in contest["competitors"]}
        key = "id" if sport == "cbb" else "abbreviation"
        assert all(str(sides[k][key]) == sample[k]["team_id"] for k in ("away", "home")), game_id
        source_plays = {str(p["id"]): (i, p) for i, p in enumerate(summary["plays"])}
    for row in possessions:
        start, end = row["start_play_id"], row["end_play_id"]
        assert start != end and end not in ids, (game_id, start, end)
        assert row["side"] in {"away", "home"} and row["kind"] in SCHEMES[sport], row
        assert row["period"] == 1 and re.fullmatch(r"\d{1,2}:\d{2}(?:\.\d+)?", row["game_clock"]), row
        assert type(row["points"]) is int and 0 <= row["points"] <= 5, row
        assert type(row["film_offset_seconds"]) is int and row["film_offset_seconds"] >= 0, row
        assert "press_observed" not in row or (sport == "cbb" and row["press_observed"] is True), row
        if previous:
            assert row["film_offset_seconds"] > previous["film_offset_seconds"], row
            if sport == "cbb":
                assert start == previous["end_play_id"] and row["side"] != previous["side"], row
        if source_plays:
            first, a = source_plays[start]
            last, b = source_plays[end]
            assert first < last and b["period"]["number"] == row["period"], row
            assert b["clock"]["displayValue"] == row["game_clock"], row
            assert b[row["side"] + "Score"] - a[row["side"] + "Score"] == row["points"], row
            other = "away" if row["side"] == "home" else "home"
            assert b[other + "Score"] == a[other + "Score"], row
        ids.add(end)
        previous = row
    assert any(row["kind"] != "unclassified" or row.get("press_observed") for row in possessions), game_id


def validate_nfl(sample: dict, pbp: dict | None = None) -> None:
    game_id = sample["pbp_game_id"]
    assert re.fullmatch(r"\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}", game_id), game_id
    assert game_id == "_".join((str(sample["season"]), f"{sample['week']:02}", sample["away"]["team_id"], sample["home"]["team_id"])), game_id
    assert urlsplit(sample["film_url"]).netloc == "www.patriots.com", game_id
    assert urlsplit(sample["results_url"]).netloc == "www.espn.com" and sample["game_id"] in sample["results_url"], game_id
    seen = set()
    for play in sample["film_plays"]:
        play_id = int(play["end_play_id"])
        assert play_id not in seen, play_id
        assert play["side"] in {"away", "home"}, play
        assert re.fullmatch(r"Cover [0-6]|Match quarters \(poach\)", play["kind"]), play
        assert 1 <= play["period"] <= 5 and re.fullmatch(r"\d{1,2}:\d{2}", play["game_clock"]), play
        assert math.isfinite(play["play_epa"]) and isinstance(play["yards"], int), play
        if pbp is not None:
            row = pbp[game_id, play_id]
            assert int(row.qtr) == play["period"] and row.time.lstrip("0") == play["game_clock"], play
            assert row.game_date == sample["game_date"] and row.posteam == sample[play["side"]]["team_id"], play
            assert row.yards_gained == play["yards"] and row.qb_dropback == 1, play
            assert math.isclose(row.epa, play["play_epa"], abs_tol=0.000001), play
            expected = "Interception" if row.interception else f"{abs(play['yards'])} yd sack" if row.sack else f"{play['yards']} yd completion"
            assert row.interception or row.sack or row.complete_pass, play
            assert play["result"] == expected, play
        seen.add(play_id)
    assert seen, game_id


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Cross-check game identity and possession results with ESPN")
    parser.add_argument("--nflverse", type=Path, help="Cross-check NFL plays against a local nflverse play-by-play Parquet")
    args = parser.parse_args()
    for sport in SCHEMES:
        path = ROOT / "data" / "public" / sport / "film-coverage.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        assert data["schema_version"] == 1, path
        seen = set()
        for sample in data["film_samples"]:
            game_id = sample["game_id"]
            assert game_id not in seen, game_id
            seen.add(game_id)
            summary = None
            if args.live:
                endpoint = f"https://site.api.espn.com/apis/site/v2/sports/basketball/{ESPN_SPORTS[sport]}/summary"
                with urllib.request.urlopen(f"{endpoint}?event={game_id}", timeout=20) as response:
                    summary = json.load(response)
            validate_sample(sport, sample, summary)
            print(f"{sport.upper()} {game_id}: {len(sample['film_possessions'])} reviewed possessions")
    nfl = json.loads((ROOT / "data" / "public" / "nfl" / "film-coverage.json").read_text(encoding="utf-8"))
    assert nfl["schema_version"] == 1
    pbp = None
    if args.nflverse:
        import pandas as pd
        game_ids = [sample["pbp_game_id"] for sample in nfl["film_samples"]]
        cols = ["game_id", "play_id", "game_date", "qtr", "time", "posteam", "epa", "yards_gained", "qb_dropback", "interception", "sack", "complete_pass"]
        df = pd.read_parquet(args.nflverse, columns=cols, filters=[("game_id", "in", game_ids)])
        pbp = {(row.game_id, int(row.play_id)): row for row in df.itertuples(index=False)}
    for sample in nfl["film_samples"]:
        validate_nfl(sample, pbp)
        print(f"NFL {sample['game_id']}: {len(sample['film_plays'])} reviewed plays")


if __name__ == "__main__":
    main()
