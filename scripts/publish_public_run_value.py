#!/usr/bin/env python3
"""Publish run value per pitch, per pitcher, for the arsenal panel.

The panel could say what a starter throws and how often. It could not say
whether the pitch is any good, which is the first question an arsenal invites.
`run_value_per_100` answers it on a scale that compares a pitch thrown nine
hundred times with one thrown two hundred times.

Published from the PITCHER side, so a positive number is runs the pitch saved.
The percentile beside it is against every pitcher throwing that same pitch type
this season - a slider is compared with sliders, never with four-seamers, which
have a different run-value distribution entirely.
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "data" / "public"
SOURCE = "pitch_run_value.csv"

# Below this a run value is a handful of swings, so the row is published but is
# left out of the pool the percentile is taken from.
RANKABLE_PITCHES = 100


def num(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def main(argv: list[str]) -> int:
    data_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
    path = data_dir / SOURCE
    if not path.is_file():
        print(f"  skip run value: no {SOURCE} under {data_dir}")
        return 1

    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = [r for r in csv.DictReader(handle)]

    # One pool per pitch type. A +1.0 slider and a +1.0 four-seamer are not the
    # same achievement, and a single pool would say they were.
    pools: dict[str, list[float]] = {}
    for row in rows:
        rv = num(row.get("run_value_per_100"))
        pitches = num(row.get("pitches")) or 0
        code = str(row.get("pitch_type") or "").upper()
        if rv is None or not code or pitches < RANKABLE_PITCHES:
            continue
        pools.setdefault(code, []).append(rv)
    for series in pools.values():
        series.sort()

    def percentile(code: str, value: float):
        series = pools.get(code) or []
        if len(series) < 15:
            return None
        below = sum(1 for other in series if other < value)
        return round(100.0 * below / len(series), 1)

    arms: dict[str, dict] = {}
    for row in rows:
        pid = str(row.get("player_id") or "").strip()
        code = str(row.get("pitch_type") or "").upper()
        rv = num(row.get("run_value_per_100"))
        if not pid or not code or rv is None:
            continue
        entry = arms.setdefault(pid, {"name": row.get("player_name") or "", "pitches": {}})
        entry["pitches"][code] = {
            "name": row.get("pitch_name") or code,
            "run_value_per_100": round(rv, 2),
            "run_value": num(row.get("run_value")),
            "thrown": int(num(row.get("pitches")) or 0),
            "percentile": percentile(code, rv),
            "of": len(pools.get(code) or []),
        }

    if not arms:
        print("  skip run value: no usable rows")
        return 1

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out = {
        "schema": "chase-public-pitch-run-value/1",
        "sport": "mlb",
        "generated_at_utc": now,
        "note": "Run value per 100 pitches, per pitch type, from the pitcher's side: "
                "positive is runs the pitch saved. The percentile is against every "
                "pitcher throwing that same pitch type this season with at least 100 "
                "thrown, so a slider is compared with sliders. A record of pitches "
                "already thrown, not a projection.",
        "pitchers": arms,
    }
    dest = PUBLIC / "pitch_run_value.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest.relative_to(ROOT)} ({len(arms)} pitchers, "
          f"{sum(len(a['pitches']) for a in arms.values())} pitch rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
