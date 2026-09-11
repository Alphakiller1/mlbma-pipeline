#!/usr/bin/env python3
"""Publish starter splits: by batter hand and by home / away.

sp_metric_splits.csv carries a starter's line broken out several ways, keyed by
MLB person id, so it joins to the probable pitcher on the schedule without a
name match. Two of its dimensions are what the matchup page needs:

    batter_hand   LHH / RHH
    location      home / away

Everything published here is a rate. The panel used to print 55 strikeouts and
243 batters faced and leave the reader to divide, which is how a counting stat
ends up looking like a rate it is not.

OPS+ is computed here rather than carried: it is 100 x league OPS / OPS
allowed, so 100 is league average and higher is a better pitcher - the same
direction as every other number in the panel.

xFIP has a column in the source and it is empty in all 5,027 rows. Computing it
needs fly balls allowed, which no artifact in the pipeline carries, so it is
published as null and the page says it is not published rather than estimating
a number and calling it xFIP.
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
SOURCE = "sp_metric_splits.csv"

# source dimension/value -> the key the page asks for
SPLITS = {
    ("batter_hand", "LHH"): "vs_lhh",
    ("batter_hand", "RHH"): "vs_rhh",
    ("location", "home"): "home",
    ("location", "away"): "away",
}

# The two keys above, named once so the OPS guard below cannot drift from them.
LOCATION_SPLITS = {"home", "away"}

# source column -> (published key, digits)
RATES = {
    "ERA": ("era", 2), "FIP": ("fip", 2), "K_pct": ("k_pct", 1),
    "BB_pct": ("bb_pct", 1), "HR9": ("hr9", 2), "OPS": ("ops", 3),
    "avg_IP": ("ip_per_start", 2), "xFIP": ("xfip", 2),
}


def num(value):
    try:
        out = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return None if out != out else out


def main(argv: list[str]) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
    path = data_dir / SOURCE
    if not path.is_file():
        print(f"  skip starter splits: no {SOURCE} under {data_dir}")
        return 1

    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    # League OPS allowed, for the OPS+ denominator. Taken from the population
    # rather than assumed, so the index moves with the season it describes -
    # and taken one row per pitcher, because a pitcher with seven tier rows
    # would otherwise count seven times against one with two.
    # `hand` is the pitcher's own throwing hand, so that row is his whole
    # season in one line. Reading the denominator off it rather than off
    # whichever row happens to come first keeps a handedness split from being
    # mistaken for a season figure.
    season_ops: dict[str, float] = {}
    for row in rows:
        pid = str(row.get("pitcher_id") or "").strip()
        value = num(row.get("OPS"))
        if not pid or not value or row.get("split_dimension") == "batter_hand":
            continue
        if row.get("split_dimension") == "hand":
            season_ops[pid] = value
        else:
            season_ops.setdefault(pid, value)
    league_ops = statistics.mean(season_ops.values()) if season_ops else None

    starters: dict[str, dict] = {}
    for row in rows:
        key = SPLITS.get((row.get("split_dimension"), row.get("split_value")))
        if not key:
            continue
        pid = str(row.get("pitcher_id") or "").strip()
        if not pid:
            continue
        entry = starters.setdefault(pid, {
            "name": row.get("pitcher_name") or "",
            "team": row.get("pitcher_team") or "",
            "hand": row.get("pitcher_hand") or None,
            "splits": {},
        })
        split = {"starts": int(num(row.get("starts")) or 0)}
        for source, (name, digits) in RATES.items():
            value = num(row.get(source))
            split[name] = None if value is None else round(value, digits)
        # The source splits OPS by batter hand only. Every other dimension -
        # location included - repeats the pitcher's season figure in each row,
        # verified across all 359 starters: not one has a home OPS that differs
        # from his away OPS. Publishing that as a split would be publishing the
        # season number twice under two labels, so it is dropped instead.
        if key in LOCATION_SPLITS:
            split["ops"] = None
        ops = split.get("ops")
        split["ops_plus"] = (round(100 * league_ops / ops) if ops and league_ops else None)
        entry["splits"][key] = split

    if not starters:
        print("  skip starter splits: no hand or location rows found")
        return 1

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {
        "schema": "chase-public-starter-splits/1",
        "sport": "mlb",
        "generated_at_utc": now,
        "league_ops_allowed": round(league_ops, 3) if league_ops else None,
        "note": "Starter lines by batter hand and by home or away, keyed by MLB "
                "person id. OPS+ is 100 x league OPS allowed / this line's OPS "
                "allowed, so 100 is league average and higher is better. xFIP is "
                "null because the source column is empty for every one of the 5,027 "
                "source rows - a pipeline gap, not a filter here. OPS is published "
                "for the handedness splits only, because the source repeats the "
                "season figure in the home and away rows rather than splitting it.",
        "starters": starters,
    }
    dest = PUBLIC / "starter_splits.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    have_xfip = sum(1 for s in starters.values()
                    for v in s["splits"].values() if v.get("xfip") is not None)
    print(f"  wrote {dest.relative_to(ROOT)} ({len(starters)} starters, "
          f"xFIP populated on {have_xfip} splits)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
