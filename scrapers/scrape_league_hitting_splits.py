"""League-wide hitting splits from the MLB Stats API, for colour-grading baselines.

The public matchup page grades two things this pipeline never had a league pool
for:

  * a batter's line against the hand he faces tonight (or his season line when
    the opposing hand is not known). It has to be graded against every batter on
    that same split: one hitter's OPS versus one hand spreads three to four times
    wider than a club's (measured 2026-09-15 - OPS sd 0.118 vs RHP and 0.149 vs
    LHP for batters, 0.035 for the thirty clubs), so a club baseline painted
    nearly every row of a lineup elite or poor;
  * a club's line at home, on the road, against each hand, and against starters
    and bullpens - graded against the thirty clubs on that same split.

Each pool is one request and carries the counting columns, so
`core.compute_baselines` can centre the scale on the league's own rate (hits
over at-bats across the league) rather than on a mean of individual lines.

Fail-closed: a fetch that errors or comes back short leaves the previous CSV in
place, because a bad pull must never overwrite a good pool.

    python -m scrapers.scrape_league_hitting_splits
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import CURRENT_SEASON, DATA_DIR  # noqa: E402

STATS_API = "https://statsapi.mlb.com/api/v1"
BATTER_OUT = Path(DATA_DIR) / "league_batter_splits.csv"
TEAM_OUT = Path(DATA_DIR) / "league_team_splits.csv"

# `vl` is versus left-handed pitching. The season line is fetched as its own split
# so a lineup whose opposing hand is unknown still grades against its own pool.
BATTER_SPLITS = ("vl", "vr", "season")
TEAM_SPLITS = ("h", "a", "vl", "vr", "sp", "rp")
COLUMNS = ["split", "id", "name", "pa", "ab", "h", "bb", "hbp", "sf", "tb",
           "avg", "obp", "slg", "ops"]

# Below these a pull is incomplete, not a quiet day. The endpoint defaults to a
# 50-row page, which is exactly the short read this guards against.
MIN_BATTERS_PER_SPLIT = 150
TEAMS = 30


def _get(url: str, attempts: int = 3, timeout: int = 45) -> Optional[dict]:
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            print(f"  [retry {attempt}/{attempts}] {url.split('?')[0]}: {exc}")
            time.sleep(2 * attempt)
    return None


def _splits(payload: Optional[dict]) -> list[dict]:
    stats = (payload or {}).get("stats") or [{}]
    return (stats[0] or {}).get("splits") or []


def _int(stat: dict, key: str) -> int:
    try:
        return int(stat.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _rate(stat: dict, key: str) -> str:
    try:
        return f"{float(str(stat.get(key) or '').strip()):.3f}"
    except ValueError:
        return ""


def _row(split: str, ident, name: str, stat: dict) -> dict:
    return {
        "split": split, "id": ident, "name": name,
        "pa": _int(stat, "plateAppearances"), "ab": _int(stat, "atBats"),
        "h": _int(stat, "hits"), "bb": _int(stat, "baseOnBalls"),
        "hbp": _int(stat, "hitByPitch"), "sf": _int(stat, "sacFlies"),
        "tb": _int(stat, "totalBases"),
        "avg": _rate(stat, "avg"), "obp": _rate(stat, "obp"),
        "slg": _rate(stat, "slg"), "ops": _rate(stat, "ops"),
    }


def batter_rows(season: int) -> Optional[list[dict]]:
    common = f"group=hitting&season={season}&sportId=1&gameType=R&playerPool=ALL&limit=5000"
    rows: list[dict] = []
    for split in BATTER_SPLITS:
        url = (f"{STATS_API}/stats?stats=season&{common}" if split == "season"
               else f"{STATS_API}/stats?stats=statSplits&sitCodes={split}&{common}")
        got = []
        for entry in _splits(_get(url)):
            player = entry.get("player") or {}
            if player.get("id"):
                got.append(_row(split, player["id"], player.get("fullName") or "",
                                entry.get("stat") or {}))
        if len(got) < MIN_BATTERS_PER_SPLIT:
            print(f"  WARNING: batter split {split} returned {len(got)} rows; keeping the previous pool")
            return None
        rows.extend(got)
    return rows


def team_rows(season: int) -> Optional[list[dict]]:
    url = (f"{STATS_API}/teams/stats?stats=statSplits&group=hitting"
           f"&sitCodes={','.join(TEAM_SPLITS)}&season={season}&sportIds=1&gameType=R&limit=1000")
    rows = []
    for entry in _splits(_get(url)):
        team = entry.get("team") or {}
        rows.append(_row((entry.get("split") or {}).get("code") or "", team.get("id"),
                         team.get("name") or "", entry.get("stat") or {}))
    for code in TEAM_SPLITS:
        count = sum(1 for r in rows if r["split"] == code)
        if count != TEAMS:
            print(f"  WARNING: team split {code} returned {count} clubs; keeping the previous pool")
            return None
    return rows


def _write(path: Path, rows: list[dict]) -> None:
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def run(season: int = CURRENT_SEASON) -> int:
    print(f"Fetching league hitting split pools for {season}...")
    batters = batter_rows(season)
    if batters:
        _write(BATTER_OUT, batters)
        print(f"  wrote {BATTER_OUT.name} ({len(batters)} batter lines)")
    teams = team_rows(season)
    if teams:
        _write(TEAM_OUT, teams)
        print(f"  wrote {TEAM_OUT.name} ({len(teams)} club lines)")
    # Never fatal: the baselines step carries the previous pool forward and says so.
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
