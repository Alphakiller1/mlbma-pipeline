#!/usr/bin/env python3
"""
Dashboard diagnostic — sheet data sanity + Playwright UI click-through.
Run from repo root:
  C:\\Users\\chase\\crawl_env\\Scripts\\python.exe scripts/dashboard_diagnostic.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DASH = ROOT / "dashboard"
SHEET_ID = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"

TABS = {
    "vs_RHP": {"min_rows": 20, "key_cols": ["Team", "OSI"]},
    "vs_LHP": {"min_rows": 20, "key_cols": ["Team", "OSI"]},
    "Team_Profiles": {"min_rows": 20, "key_cols": ["team", "Team"]},
    "SP_Profiles": {"min_rows": 50, "key_cols": ["pitcher_name", "Name", "Pitch Score"]},
    "Today_Matchups": {"min_rows": 1, "key_cols": ["Away_SP", "Home_SP"]},
    "Today_Lineups": {"min_rows": 1, "key_cols": []},
    "Bullpen_Unit": {"min_rows": 20, "key_cols": ["team", "Team"]},
    "Pitching_Score": {"min_rows": 25, "key_cols": ["Tm", "PitchScore"]},
    "OOR": {"min_rows": 25, "key_cols": ["Tm", "OOR"]},
}

LOCAL_CSV_MAP = {
    "vs_RHP": DATA / "metrics_vs_RHP.csv",
    "vs_LHP": DATA / "metrics_vs_LHP.csv",
    "Team_Profiles": None,
    "SP_Profiles": None,
    "metrics_pitching_score.csv": DATA / "metrics_pitching_score.csv",
}


def fetch_tab(tab: str) -> list[dict]:
    url = (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq"
        f"?tqx=out:csv&sheet={urllib.parse.quote(tab)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "mlbma-diagnostic/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        text = resp.read().decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def pick_col(row: dict, names: list[str]) -> str:
    lower = {k.lower().strip(): k for k in row}
    for n in names:
        k = lower.get(n.lower())
        if k and str(row.get(k, "")).strip():
            return str(row[k]).strip()
    return ""


def names_match(a: str, b: str) -> bool:
    a = a.strip().lower()
    b = b.strip().lower()
    if not a or not b or a == "tbd" or b == "tbd":
        return False
    if a == b:
        return True
    la, lb = a.split()[-1], b.split()[-1]
    return len(la) > 2 and la == lb


def validate_sheets() -> list[str]:
    issues: list[str] = []
    ok: list[str] = []
    matchups = None
    sp_rows = None

    for tab, spec in TABS.items():
        try:
            rows = fetch_tab(tab)
        except Exception as exc:
            issues.append(f"[SHEET] {tab}: fetch failed — {exc}")
            continue
        n = len(rows)
        if n < spec["min_rows"]:
            issues.append(f"[SHEET] {tab}: only {n} rows (expected >= {spec['min_rows']})")
        else:
            ok.append(f"[SHEET] {tab}: {n} rows OK")
        if rows and spec["key_cols"]:
            found = any(pick_col(rows[0], [c]) for c in spec["key_cols"])
            if not found:
                issues.append(f"[SHEET] {tab}: missing expected columns among {spec['key_cols']}")
        if tab == "Today_Matchups":
            matchups = rows
        if tab == "SP_Profiles":
            sp_rows = rows

    # Cross-check: today's probables exist in SP_Profiles
    if matchups and sp_rows:
        sp_names = {pick_col(r, ["pitcher_name", "Name", "Pitcher"]).lower() for r in sp_rows}
        sp_names.discard("")
        starters = set()
        for m in matchups:
            for col in ["Away_SP", "Home_SP", "awaySP", "homeSP", "Away SP", "Home SP"]:
                v = pick_col(m, [col])
                if v and v.upper() != "TBD":
                    starters.add(v.lower())
        missing = [s for s in starters if not any(names_match(s, p) for p in sp_names)]
        if starters:
            ok.append(f"[CROSS] Today matchups: {len(starters)} probables, {len(starters) - len(missing)} in SP_Profiles")
        if missing:
            issues.append(f"[CROSS] {len(missing)} probables not in SP_Profiles: {missing[:5]}")

    # Local CSV vs sheet (team offense metrics sample)
    for sheet_tab, local_path in [("vs_RHP", DATA / "metrics_vs_RHP.csv"), ("Pitching_Score", DATA / "metrics_pitching_score.csv")]:
        if not local_path or not local_path.exists():
            continue
        try:
            sheet_rows = fetch_tab(sheet_tab if sheet_tab != "Pitching_Score" else "Pitching_Score")
            with local_path.open(encoding="utf-8-sig", newline="") as f:
                local_rows = list(csv.DictReader(f))
            if abs(len(sheet_rows) - len(local_rows)) > max(5, len(local_rows) * 0.15):
                issues.append(
                    f"[LOCAL] {local_path.name} row count {len(local_rows)} vs sheet {len(sheet_rows)} — may be stale export"
                )
            else:
                ok.append(f"[LOCAL] {local_path.name} row count ~matches sheet ({len(local_rows)} vs {len(sheet_rows)})")
        except Exception as exc:
            issues.append(f"[LOCAL] {local_path.name}: compare failed — {exc}")

    print("\n=== Google Sheet / local data validation ===")
    for line in ok:
        print("  OK  ", line)
    for line in issues:
        print("  FAIL", line)
    return issues


def run_playwright() -> list[str]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return ["[UI] Playwright not installed — skip UI diagnostic"]

    issues: list[str] = []
    ok: list[str] = []
    base = "http://127.0.0.1:8765/dashboard"

    steps = [
        ("Opening Dashboard loads matchups", f"{base}/chase_analytics_mlb_oem_v7.html", "#opening-dashboard, .matchup-card, .ca-matchup-card", None),
        ("Research Lab tab", f"{base}/chase_analytics_mlb_oem_v7.html#section-research-lab", ".ca-lab__tab, .subtab", None),
        ("Pitcher Intelligence sub-tabs", f"{base}/chase_analytics_mlb_oem_v7.html#section-research-lab", "[data-pl-intel-tab]", "pitcher"),
        ("Team Profile page", f"{base}/team_profile.html?team=NYY", "#profilePageHeader, .tp-unit-tab", None),
        ("Glossary page", f"{base}/glossary.html", "#glossaryRoot, .glossary-section", None),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(60000)

        # Main OEM page — full load
        page.goto(f"{base}/chase_analytics_mlb_oem_v7.html", wait_until="domcontentloaded")
        try:
            page.wait_for_selector(".hero-matchup-card, .matchup-card", timeout=20000)
        except Exception:
            page.wait_for_timeout(12000)

        cards = page.locator(".matchup-card, .hero-matchup-card, .ca-matchup-card")
        if cards.count() == 0:
            issues.append("[UI] Opening Dashboard: no matchup cards visible after load")
        else:
            ok.append(f"[UI] Opening Dashboard: {cards.count()} matchup elements")

        # Research Lab → Pitcher Intelligence
        page.goto(f"{base}/chase_analytics_mlb_oem_v7.html#section-research-lab", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        page.evaluate("document.body.classList.add('view-research'); document.body.classList.remove('view-opening');")
        page.wait_for_timeout(2000)

        lab_btn = page.locator('.ca-lab__tab[data-pane="pitcher"], .subtab[data-pane="pitching"]').first
        if lab_btn.count():
            lab_btn.scroll_into_view_if_needed()
            lab_btn.click(force=True)
            page.wait_for_timeout(5000)
        else:
            issues.append("[UI] Research Lab: Pitcher Intelligence tab not found")

        snap_tab = page.locator('[data-pl-intel-tab="snapshot"]')
        rank_tab = page.locator('[data-pl-intel-tab="rankings"]')
        if snap_tab.count() == 0:
            issues.append("[UI] Pitcher Intelligence: missing Snapshot/Rankings sub-tabs")
        else:
            ok.append("[UI] Pitcher Intelligence: sub-tabs present")
            rank_tab.click()
            page.wait_for_timeout(3000)
            rank_rows = page.locator(".pl-rank-row").count()
            if rank_rows == 0:
                empty = page.locator(".rl-empty").first
                msg = empty.inner_text()[:80] if empty.count() else "no rows"
                issues.append(f"[UI] Today's Starters Rankings: 0 rows — {msg}")
            else:
                ok.append(f"[UI] Today's Starters Rankings: {rank_rows} rows")
            snap_tab.click()
            page.wait_for_timeout(2000)
            if page.locator(".pl-intel-snapshot, .pl-snapshot-card").count() == 0:
                issues.append("[UI] Pitcher Snapshot: no snapshot card")
            else:
                ok.append("[UI] Pitcher Snapshot: card rendered")

        # Team Profile clicks
        page.goto(f"{base}/team_profile.html?team=NYY", wait_until="domcontentloaded")
        page.wait_for_timeout(7000)
        if page.locator("#profilePageHeader").count() == 0:
            issues.append("[UI] Team Profile: header missing")
        else:
            ok.append("[UI] Team Profile: header loaded")
        for tab_val in ["rotation", "bullpen", "lineup"]:
            btn = page.locator(f'[data-unit-tab="{tab_val}"]').first
            if btn.count():
                btn.click()
                page.wait_for_timeout(2500)
        if page.locator(".tp-section, .ca-board").count() == 0:
            issues.append("[UI] Team Profile: no sections after tab clicks")
        else:
            ok.append(f"[UI] Team Profile: {page.locator('.tp-section, .ca-board').count()} sections")

        # Redundancy: duplicate section titles on lineup tab
        page.locator('[data-unit-tab="lineup"]').first.click()
        page.wait_for_timeout(2000)
        titles = page.locator(".ca-section-title").all_inner_texts()
        dupes = [t for t in titles if titles.count(t) > 1]
        if dupes:
            issues.append(f"[UI] Team Profile redundancy: duplicate section titles — {set(dupes)}")
        else:
            ok.append("[UI] Team Profile: no duplicate section titles on Lineup tab")

        browser.close()

    print("\n=== Playwright UI click-through ===")
    for line in ok:
        print("  OK  ", line)
    for line in issues:
        print("  FAIL", line)
    return issues


def main() -> int:
    sheet_issues = validate_sheets()
    ui_issues: list[str] = []
    try:
        ui_issues = run_playwright()
    except Exception as exc:
        ui_issues = [f"[UI] Playwright run failed: {exc}"]
        print("\n=== Playwright UI click-through ===")
        print("  FAIL", ui_issues[0])

    all_issues = sheet_issues + [i for i in ui_issues if not i.startswith("[UI] Playwright not")]
    report_path = ROOT / "pipeline_log.txt"
    with report_path.open("a", encoding="utf-8") as f:
        f.write("\n--- dashboard_diagnostic ---\n")
        f.write(json.dumps({"sheet_issues": len(sheet_issues), "ui_issues": len(ui_issues)}, indent=2))
        f.write("\n")

    print(f"\n=== Summary: {len(all_issues)} issue(s) ===")
    if all_issues:
        for i in all_issues:
            print(" ", i)
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
