"""Run value per pitch type, per pitcher, from Baseball Savant.

The arsenal panel could say what a starter throws, how hard, and how the lineup
he faces has hit that pitch. It could not say whether the pitch is any good -
which is the first question anybody asks of an arsenal. Usage says he throws the
slider a third of the time; it does not say the slider is the reason he is
starting.

Savant's pitch-arsenal leaderboard answers it directly. `run_value` is runs
saved by that pitch over the season and `run_value_per_100` is the same figure
per hundred thrown, which is the one worth publishing: it compares a pitch a man
throws nine hundred times with one he throws two hundred times.

SIGN CONVENTION, because it is the thing to get wrong: on the PITCHER
leaderboard a positive run value is good for the pitcher - runs he prevented.
That is the opposite of the batter leaderboard, where positive is good for the
hitter. Everything written here is from the pitcher's side and the publisher
grades it that way.

    python scrapers/scrape_pitch_run_value.py
"""
from __future__ import annotations

import csv
import io
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import CURRENT_SEASON, DATA_DIR  # noqa: E402

ARSENAL_URL = (
    "https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
    "?type=pitcher&pitchType=&year={season}&team=&min={min_pitches}&csv=true"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "Chrome/124.0.0.0 Safari/537.36"
}
OUTPUT = "pitch_run_value.csv"

# Savant's `min` is plate appearances ending on the pitch, and its default of
# ten drops a starter's fourth offering: Wilber Dotel's splitter, 38 thrown but
# only 6 plate appearances, was missing from his arsenal row while the other
# three were there. A table with one pitch blank is worse than one showing a
# small sample, because the reader cannot tell which it is.
#
# Everything is fetched, and the PERCENTILE is what applies a threshold - a
# pitch under RANKABLE_PITCHES in the publisher is published with its run value
# and without a rank, so nothing is hidden and nothing thin is ranked as though
# it were not.
MIN_PITCHES = 1

COLUMNS = [
    "player_id", "player_name", "team", "pitch_type", "pitch_name",
    "pitches", "pitch_usage", "run_value", "run_value_per_100",
    "whiff_percent", "put_away", "est_woba",
]


def fetch(season: int, min_pitches: int) -> list[dict]:
    url = ARSENAL_URL.format(season=season, min_pitches=min_pitches)
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw)))


def num(value):
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        return float(text)
    except ValueError:
        return ""


def run() -> None:
    print(f"Fetching pitch-level run value for {CURRENT_SEASON} from Baseball Savant...")
    try:
        rows = fetch(CURRENT_SEASON, MIN_PITCHES)
    except Exception as exc:  # noqa: BLE001 - an outage must not take the file with it
        print(f"  ERROR: arsenal leaderboard fetch failed ({exc})")
        print("  leaving any existing file in place")
        return

    out = []
    for row in rows:
        pid = str(row.get("player_id") or "").strip()
        code = str(row.get("pitch_type") or "").strip().upper()
        if not pid or not code:
            continue
        out.append({
            "player_id": pid,
            "player_name": row.get("last_name, first_name") or "",
            "team": row.get("team_name_alt") or "",
            "pitch_type": code,
            "pitch_name": row.get("pitch_name") or code,
            "pitches": num(row.get("pitches")),
            "pitch_usage": num(row.get("pitch_usage")),
            "run_value": num(row.get("run_value")),
            "run_value_per_100": num(row.get("run_value_per_100")),
            "whiff_percent": num(row.get("whiff_percent")),
            "put_away": num(row.get("put_away")),
            "est_woba": num(row.get("est_woba")),
        })

    if not out:
        # The same contract the rest of the scrapers keep: an upstream change
        # degrades to stale data, never to an empty file that blanks the panel.
        print("  KEPT: leaderboard returned no usable rows, leaving the file in place")
        return

    path = os.path.join(DATA_DIR, OUTPUT)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(out)
    arms = len({row["player_id"] for row in out})
    print(f"  Saved {len(out)} rows for {arms} pitchers -> {path}")


if __name__ == "__main__":
    run()
