"""Browser smoke test: batter profile hit-rate strips vs local CSV."""

from __future__ import annotations

import json
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import DATA_DIR

CASES = [
    {
        "label": "STAR vs RHP",
        "player": "Christian Walker",
        "player_id": 572233,
        "prop_card": "hits",
        "csv_prop": "hits",
        "default_line": 1.5,
        "platoon_label": "vs RHP",
        "in_lineup": True,
    },
    {
        "label": "PLATOON L bat",
        "player": "J.P. Crawford",
        "player_id": 641487,
        "prop_card": "hits",
        "csv_prop": "hits",
        "default_line": 1.5,
        "platoon_label": "vs RHP",
        "in_lineup": True,
    },
    {
        "label": "NOT IN LINEUP",
        "player": "Jose Ramirez",
        "player_id": 608070,
        "prop_card": "hits",
        "csv_prop": "hits",
        "default_line": 1.5,
        "platoon_label": "vs RHP",
        "in_lineup": False,
    },
]


def snap_line(available: list[float], book_line: float) -> float:
    if not available:
        return book_line
    import math

    target = max(1, math.ceil(book_line - 0.001))
    best = available[0]
    best_dist = abs(book_line - best)
    for cand in available[1:]:
        dist = abs(book_line - cand)
        if dist < best_dist:
            best = cand
            best_dist = dist
        elif dist == best_dist:
            best_target = abs(best - target)
            cand_target = abs(cand - target)
            if cand_target < best_target or (cand_target == best_target and cand < best):
                best = cand
                best_dist = dist
    return best


def expected_row(h: pd.DataFrame, pid: int, prop: str, line: float) -> pd.Series:
    sub = h[(h["player_id"] == pid) & (h["prop"] == prop) & (h["line"] == line)]
    if sub.empty:
        raise KeyError(f"missing row pid={pid} prop={prop} line={line}")
    return sub.iloc[0]


def pct(rate: float) -> int:
    return int(round(rate * 100))


def frac(rate: float, games: int) -> str:
    return f"{int(round(rate * games))}/{games}"


def serve_dashboard(port: int) -> ThreadingHTTPServer:
    dashboard = ROOT / "dashboard"

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(dashboard), **kwargs)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    thread = Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def extract_hits_strip(page) -> dict:
    card = page.locator('[data-prop="hits"]')
    card.wait_for(state="visible", timeout=45000)
    strip = card.locator(".bp-hit-strip")
    if strip.count() == 0:
        return {"visible": False}

    title = strip.locator(".bp-hit-strip__title").inner_text().strip()
    platoon = ""
    if strip.locator(".bp-hit-strip__platoon").count():
        platoon = strip.locator(".bp-hit-strip__platoon").inner_text().strip()
    streak = ""
    if strip.locator(".bp-hit-strip__streak").count():
        streak = strip.locator(".bp-hit-strip__streak").inner_text().strip()

    pills = {}
    for pill in strip.locator(".bp-hit-pill").all():
        tag = pill.locator(".bp-hit-pill__tag").inner_text().strip()
        frac_txt = pill.locator(".bp-hit-pill__frac").inner_text().strip()
        pct_txt = pill.locator(".bp-hit-pill__pct").inner_text().strip()
        pills[tag] = {"frac": frac_txt, "pct": pct_txt}

    pips = strip.locator(".bp-hit-spark__pip").count()
    clear = strip.locator(".bp-hit-spark__pip--clear").count()
    miss = strip.locator(".bp-hit-spark__pip--miss").count()
    data_line = strip.get_attribute("data-hitrate-line")

    return {
        "visible": True,
        "title": title,
        "data_line": data_line,
        "platoon": platoon,
        "streak": streak,
        "pills": pills,
        "spark": {"pips": pips, "clear": clear, "miss": miss},
    }


def main() -> None:
    from playwright.sync_api import sync_playwright

    h = pd.read_csv(DATA_DIR / "batter_prop_hitrates.csv")
    h["player_id"] = h["player_id"].astype(int)
    port = 8765
    httpd = serve_dashboard(port)
    time.sleep(0.4)

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        for case in CASES:
            pid = int(case["player_id"])
            lines = sorted(
                h[(h["player_id"] == pid) & (h["prop"] == case["csv_prop"])]["line"].astype(float).unique()
            )
            snapped = snap_line(lines, float(case["default_line"]))
            row = expected_row(h, pid, case["csv_prop"], snapped)

            url = f"http://127.0.0.1:{port}/batter_profile.html?player={case['player']}"
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(12000)
            ui = extract_hits_strip(page)

            expected = {
                "data_line": str(int(snapped) if snapped == int(snapped) else snapped),
                "title": f"hit {int(snapped) if snapped == int(snapped) else snapped}+",
                "pills": {
                    "L5": {
                        "frac": frac(row["hit_l5"], int(row["games_l5"])),
                        "pct": f"{pct(row['hit_l5'])}%",
                    },
                    "L10": {
                        "frac": frac(row["hit_l10"], int(row["games_l10"])),
                        "pct": f"{pct(row['hit_l10'])}%",
                    },
                    "L20": {
                        "frac": frac(row["hit_l20"], int(row["games_l20"])),
                        "pct": f"{pct(row['hit_l20'])}%",
                    },
                    "Season": {
                        "frac": frac(row["hit_season"], int(row["games_season"])),
                        "pct": f"{pct(row['hit_season'])}%",
                    },
                },
                "spark_clear": int(str(row["last10"]).count("1")),
                "spark_miss": int(str(row["last10"]).count("0")),
                "streak": (
                    f"{int(row['streak'])}-game streak"
                    if int(row["streak"]) > 0
                    else "No active streak"
                ),
                "platoon_pct": pct(row["hit_vs_rhp"]),
            }

            ui_pills = {
                k.upper(): v for k, v in (ui.get("pills") or {}).items()
            }
            exp_pills = {
                k.upper(): v for k, v in expected["pills"].items()
            }
            ok = (
                ui.get("visible")
                and ui.get("data_line") == expected["data_line"]
                and ui_pills == exp_pills
                and ui.get("spark", {}).get("clear") == expected["spark_clear"]
                and ui.get("spark", {}).get("miss") == expected["spark_miss"]
                and str(expected["platoon_pct"]) in re.sub(r"\s+", " ", (ui.get("platoon") or ""))
                and expected["streak"].lower() in (ui.get("streak") or "").lower()
            )

            results.append(
                {
                    "label": case["label"],
                    "player": case["player"],
                    "snapped_line": snapped,
                    "url": url,
                    "ui": ui,
                    "expected": expected,
                    "pass": ok,
                }
            )

        browser.close()

    httpd.shutdown()
    print(json.dumps(results, indent=2))
    if not all(r["pass"] for r in results):
        raise SystemExit(1)
    print("\nBrowser UI verification passed for all cases.")


if __name__ == "__main__":
    main()
