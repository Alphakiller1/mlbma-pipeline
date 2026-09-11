#!/usr/bin/env python3
"""Publish starter splits: by batter hand and by home / road.

Reads the four split files `scrapers/scrape_sp_hand_splits.py` writes straight
from the MLB Stats API, keyed by MLB person id so they join to the probable
pitcher on the schedule without a name match:

    sp_vs_LHH.csv   sp_vs_RHH.csv   sp_home.csv   sp_away.csv

WHAT THIS REPLACED, AND WHY

It used to read `sp_metric_splits.csv`, which was wrong in two ways that both
reached the page:

  * Its `location` rows carried the pitcher's SEASON OPS, not a home or road
    OPS. Verified across all 359 starters - not one had a home figure that
    differed from his away figure, because it was the same number written
    twice. The page was publishing a season line under two split labels.
  * Its xFIP column was empty in all 5,027 rows, so the column had nothing to
    show for anybody.

Both are fixed at the source rather than papered over here: the scraper now
asks the endpoint for `h` and `a` alongside `vl` and `vr`, and computes xFIP
from the air-ball share each split reports for itself. This file only projects
what it gets.

Everything published is a rate. The panel used to print 55 strikeouts and 243
batters faced and leave the reader to divide, which is how a counting stat ends
up looking like a rate it is not.

OPS+ is computed here rather than carried: 100 x league OPS allowed / this
line's OPS allowed, so 100 is league average and higher is a better pitcher -
the same direction as every other number in the panel.
"""
from __future__ import annotations

import csv
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "data" / "public"

# published key -> source file
SPLIT_FILES = {
    "vs_lhh": "sp_vs_LHH.csv",
    "vs_rhh": "sp_vs_RHH.csv",
    "home": "sp_home.csv",
    "away": "sp_away.csv",
}

# source column -> (published key, digits)
RATES = {
    "ERA": ("era", 2),
    "WHIP": ("whip", 2),
    "FIP": ("fip", 2),
    "xFIP": ("xfip", 2),
    "HR/9": ("hr9", 2),
    "OBP": ("obp", 3),
    "SLG": ("slg", 3),
    "OPS": ("ops", 3),
    # Pitches per inning of this split: how hard it is to get through, which is
    # the number that says when an arm comes out. It replaced innings per
    # start, which described the whole outing and not the split.
    "P/IP": ("pitches_per_inning", 1),
}

# K% and BB% arrive as fractions, in the FanGraphs encoding the rest of the
# repo expects. The page prints percentage points, so they are converted once
# here rather than in every consumer.
PERCENTS = {"K%": ("k_pct", 1), "BB%": ("bb_pct", 1)}


def num(value):
    try:
        out = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return None if out != out else out


def parse_ip(text) -> float | None:
    """MLB innings notation - "6.1" is six and a third, not six and a tenth."""
    raw = str(text or "").strip()
    if not raw:
        return None
    if "." in raw:
        whole, frac = raw.split(".", 1)
        try:
            return int(whole) + int(frac[:1] or 0) / 3.0
        except ValueError:
            return None
    try:
        return float(raw)
    except ValueError:
        return None


def read_split(data_dir: Path, filename: str) -> dict[str, dict]:
    path = data_dir / filename
    if not path.is_file():
        return {}
    out: dict[str, dict] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            pid = str(row.get("MLBAMID") or "").strip()
            if pid:
                out[pid] = row
    return out


def main(argv: list[str]) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
    sources = {key: read_split(data_dir, name) for key, name in SPLIT_FILES.items()}
    if not any(sources.values()):
        print(f"  skip starter splits: no split files under {data_dir}")
        return 1
    missing = [SPLIT_FILES[k] for k, v in sources.items() if not v]
    if missing:
        print(f"  WARNING: no rows from {', '.join(missing)}")

    # League OPS allowed, for the OPS+ denominator. Taken from this run's own
    # population so the index moves with the season it describes, and taken off
    # the home and road lines because those two partition a pitcher's season
    # exactly once. The handedness pair covers it too, but weighting by which
    # hand he happened to face more would tilt the mean.
    pool = [num(row.get("OPS"))
            for key in ("home", "away")
            for row in sources.get(key, {}).values()]
    values = [v for v in pool if v]
    league_ops = statistics.mean(values) if values else None

    starters: dict[str, dict] = {}
    for key, rows in sources.items():
        for pid, row in rows.items():
            entry = starters.setdefault(pid, {
                "name": row.get("Name") or "",
                "team": row.get("Team") or "",
                "splits": {},
            })
            split: dict = {}
            for source, (name, digits) in RATES.items():
                value = num(row.get(source))
                split[name] = None if value is None else round(value, digits)
            for source, (name, digits) in PERCENTS.items():
                value = num(row.get(source))
                split[name] = None if value is None else round(value * 100, digits)

            innings = parse_ip(row.get("IP"))
            appearances = num(row.get("GS")) or num(row.get("G"))
            split["starts"] = int(appearances) if appearances else 0
            split["ip_per_start"] = (
                round(innings / appearances, 2) if innings and appearances else None
            )
            ops = split.get("ops")
            split["ops_plus"] = (
                round(100 * league_ops / ops) if ops and league_ops else None
            )
            entry["splits"][key] = split

    if not starters:
        print("  skip starter splits: no rows in any split file")
        return 1

    filled = {
        key: sum(1 for s in starters.values()
                 if (s["splits"].get(key) or {}).get("xfip") is not None)
        for key in SPLIT_FILES
    }

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {
        "schema": "chase-public-starter-splits/2",
        "sport": "mlb",
        "generated_at_utc": now,
        "league_ops_allowed": round(league_ops, 3) if league_ops else None,
        "note": "Starter lines by batter hand and by home or road, read from the "
                "MLB Stats API split endpoint and keyed by MLB person id. OPS+ is "
                "100 x league OPS allowed over this line's OPS allowed, so 100 is "
                "league average and higher is the better arm. xFIP replaces the "
                "home runs actually allowed with the league rate on this line's own "
                "air balls. ERA is published for home and road only: a batter-hand "
                "cut does not attribute earned runs.",
        "starters": starters,
    }
    dest = PUBLIC / "starter_splits.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest.relative_to(ROOT)} ({len(starters)} starters; xFIP on "
          + ", ".join(f"{k} {v}" for k, v in filled.items()) + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
