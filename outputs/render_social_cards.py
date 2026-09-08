"""
Daily social cards — deterministic renders of the dashboard's card routes.

Screenshots dashboard/card_*.html (which link the site's own stylesheets and
chart code) with today's pipeline data injected, at the four social sizes.
Same data in -> identical pixels out. No generative imagery anywhere.

  python -m outputs.render_social_cards            # today's slate
  python -m outputs.render_social_cards --date 2026-07-29

Output: outputs/social_cards/YYYY-MM-DD/*.png + captions.txt

Fails closed (exit 1, renders nothing) when the slate is missing, stale, or
malformed — a wrong graphic is worse than no graphic.
"""
from __future__ import annotations

import argparse
import csv
import json
import socket
import subprocess
import sys
import time
from datetime import date, datetime
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

PIPELINE = Path(__file__).resolve().parents[1]
DATA = PIPELINE / "data"
OUT_ROOT = PIPELINE / "outputs" / "social_cards"

# Feed post + story + square + X/OG. The card pages own the per-size layout
# (body.size-* classes); this script only sets viewport + CARD_SIZE.
ALL_SIZES = ["1080x1350", "1080x1080", "1080x1920", "1600x900"]
MAP_SIZES = ["1080x1350", "1600x900"]


def fail(msg: str) -> None:
    print(f"[social-cards] VALIDATION FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def read_slate(day: str) -> list[dict]:
    path = DATA / "today_matchups.csv"
    if not path.exists():
        fail(f"{path} missing")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        fail("slate is empty")
    dates = {r.get("Slate_Date", "").strip() for r in rows}
    if dates != {day}:
        fail(f"slate date(s) {sorted(dates)} != requested {day} (stale data?)")
    seen = set()
    for r in rows:
        key = (r["Away"], r["Home"], r.get("Time", ""))
        if key in seen:
            fail(f"duplicate game {key}")
        seen.add(key)
        for col in ("Away_OSI", "Home_OSI", "Away_PitchScore", "Home_PitchScore"):
            try:
                float(r[col])
            except (KeyError, ValueError):
                fail(f"{r['Away']}@{r['Home']}: bad {col}={r.get(col)!r}")
    return rows


def read_market_rows() -> list[dict]:
    path = DATA / "metrics_vs_RHP.csv"
    if not path.exists():
        fail(f"{path} missing")
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                rows.append({"t": r["Tm"], "osi": float(r["OSI"]),
                             "abq": float(r["ABQ"]), "rcv": float(r["RCV"])})
            except (KeyError, ValueError):
                continue
    if len(rows) < 28:
        fail(f"market map has {len(rows)} teams (expected 30)")
    return rows


def matchup_card_data(r: dict, date_label: str) -> dict:
    return {
        "dateLabel": date_label,
        "time": r["Time"],
        "away": r["Away"], "home": r["Home"],
        "awayOsi": r["Away_OSI"], "homeOsi": r["Home_OSI"],
        "edge": r["Lineup_Edge"],
        "awaySp": r["Away_SP"], "awaySpHand": r["Away_Hand"],
        "awaySpScore": r["Away_PitchScore"],
        "awaySpStats": {"k": r["Away_K%"], "bb": r["Away_BB%"],
                        "hr9": r["Away_HR9"], "fip": r["Away_FIP"]},
        "homeSp": r["Home_SP"], "homeSpHand": r["Home_Hand"],
        "homeSpScore": r["Home_PitchScore"],
        "homeSpStats": {"k": r["Home_K%"], "bb": r["Home_BB%"],
                        "hr9": r["Home_HR9"], "fip": r["Home_FIP"]},
    }


def edge_magnitude(r: dict) -> float:
    try:
        return abs(float(str(r.get("Lineup_Edge", "")).split()[-1]))
    except (ValueError, IndexError):
        return 0.0


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--all-sizes-per-game", action="store_true",
                    help="render every game at all four sizes (default: featured game only)")
    a = ap.parse_args()

    day = a.date
    date_label = datetime.strptime(day, "%Y-%m-%d").strftime("%B %d, %Y")
    slate = read_slate(day)
    market_rows = read_market_rows()
    slate_teams = {r["Away"] for r in slate} | {r["Home"] for r in slate}
    for r in market_rows:
        r["today"] = r["t"] in slate_teams

    out_dir = OUT_ROOT / day
    out_dir.mkdir(parents=True, exist_ok=True)
    featured = max(slate, key=edge_magnitude)

    jobs: list[tuple[str, dict, str, str]] = []  # (page, data, size, filename)
    for r in slate:
        stem = f"matchup_{r['Away']}_{r['Home']}"
        data = matchup_card_data(r, date_label)
        sizes = ALL_SIZES if (a.all_sizes_per_game or r is featured) else ["1080x1350"]
        for size in sizes:
            jobs.append(("card_matchup.html", data, size, f"{stem}_{size}.png"))
    map_data = {"dateLabel": date_label, "handLabel": "vs RHP", "rows": market_rows}
    for size in MAP_SIZES:
        jobs.append(("card_market_map.html", map_data, size, f"market_map_{size}.png"))

    port = free_port()
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
        cwd=PIPELINE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    t0 = time.time()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            for page_file, data, size, fname in jobs:
                w, h = (int(v) for v in size.split("x"))
                page = browser.new_page(viewport={"width": w, "height": h},
                                        device_scale_factor=2)
                page.add_init_script(
                    f"window.CARD_DATA = {json.dumps(data)};"
                    f"window.CARD_SIZE = {json.dumps(size)};")
                page.goto(f"http://127.0.0.1:{port}/dashboard/{page_file}",
                          wait_until="networkidle")
                page.evaluate("document.fonts.ready")
                page.wait_for_timeout(400)
                raw = out_dir / f"_raw_{fname}"
                page.screenshot(path=str(raw))
                page.close()
                Image.open(raw).resize((w, h), Image.LANCZOS).save(out_dir / fname)
                raw.unlink()
                print(f"[social-cards] {fname}")
            browser.close()
    finally:
        server.terminate()

    captions = out_dir / "captions.txt"
    with open(captions, "w", encoding="utf-8") as f:
        f.write(f"Chase Analytics — {date_label}\n\n")
        f.write(f"MARKET MAP\nAll 30 offenses vs RHP — OSI vs PP-Gap. "
                f"Full interactive map: https://chase-analytics.com/\n\n")
        for r in sorted(slate, key=edge_magnitude, reverse=True):
            tag = "  [FEATURED]" if r is featured else ""
            f.write(f"{r['Away']} @ {r['Home']} — {r['Time']}{tag}\n"
                    f"{r['Away_SP']} vs {r['Home_SP']} | "
                    f"OSI {float(r['Away_OSI']):.1f} vs {float(r['Home_OSI']):.1f} | "
                    f"{r['Lineup_Edge']} lineup edge\n"
                    f"https://chase-analytics.com/\n\n")
    n = len(jobs)
    print(f"[social-cards] {n} images + captions.txt -> {out_dir}  "
          f"({time.time()-t0:.0f}s)")


if __name__ == "__main__":
    main()
