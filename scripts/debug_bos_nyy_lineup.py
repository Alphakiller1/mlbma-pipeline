#!/usr/bin/env python
"""Debug BOS vs NYY lineup key matching."""
from __future__ import annotations

import csv
import io
from collections import Counter
from datetime import datetime

import requests

try:
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
except Exception:
    today = datetime.utcnow().strftime("%Y-%m-%d")

SHEET = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"


def main() -> None:
    print("ET today:", today)

    sched = requests.get(
        f"https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}&hydrate=probablePitcher,team",
        timeout=20,
    ).json()
    mlb_keys = []
    for d in sched.get("dates", []):
        for g in d.get("games", []):
            away = g["teams"]["away"]["team"].get("abbreviation", "")
            home = g["teams"]["home"]["team"].get("abbreviation", "")
            mlb_keys.append(f"{away}@{home}")
            if away in ("BOS", "NYY") or home in ("BOS", "NYY"):
                print("MLB:", away, "@", home)
    print("MLB games today:", len(mlb_keys))

    url = (
        f"https://docs.google.com/spreadsheets/d/{SHEET}/gviz/tq?tqx=out:csv"
        f"&sheet=Today_Lineups&_p=1"
    )
    text = requests.get(url, timeout=30).text
    rows = list(csv.DictReader(io.StringIO(text)))
    print("Total lineup rows:", len(rows))

    slate_col = "Slate_Date" if rows and "Slate_Date" in rows[0] else "Slate Date"
    slate_counts = Counter((r.get(slate_col) or "")[:10] for r in rows)
    print("Slate date counts:", dict(slate_counts))

    today_rows = [r for r in rows if (r.get(slate_col) or "")[:10] == today]
    print(f"Rows for slate {today}:", len(today_rows))

    sheet_games = sorted({(r.get("Game") or "").strip() for r in today_rows if r.get("Game")})
    print(f"Sheet games for {today}:", len(sheet_games))
    print("Sample:", sheet_games[:8])

    missing = sorted(set(mlb_keys) - set(sheet_games))
    extra = sorted(set(sheet_games) - set(mlb_keys))
    print("MLB games missing from sheet:", missing)
    print("Sheet games not on MLB today:", extra[:10])

    # Check latest slate if not today
    if not today_rows:
        latest = max(slate_counts.keys()) if slate_counts else ""
        latest_games = sorted({(r.get("Game") or "").strip() for r in rows if (r.get(slate_col) or "")[:10] == latest})
        print(f"Latest slate {latest} games:", len(latest_games))
        if "BOS@NYY" in latest_games or "NYY@BOS" in latest_games:
            print("BOS/NYY found on latest slate", latest)


if __name__ == "__main__":
    main()
