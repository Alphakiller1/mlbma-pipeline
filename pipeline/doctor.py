"""Preflight readiness report for the MLBMA pipeline.

Used by `python -m pipeline.main --check` (full readiness table + step plan)
and `python -m pipeline.main --dry-run` (step plan only). Nothing in this
module scrapes, computes, or pushes anything -- it only inspects local files
and environment variables to predict what a real run would do.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from core.config import CHROME_PATH, DATA_DIR, ENV_FILE, check_google_credentials
from pipeline.deps import STEP_DEPENDENCIES


@dataclass
class Step:
    n: str
    label: str
    dep_key: str = ""
    category: str = "none"  # none | fangraphs | sheets_push | sheets_partial | supabase
    produces: list[str] = field(default_factory=list)


# Mirrors the exact call order / grouping of pipeline.main.run() (one row per
# check_step_deps gate it evaluates), so the plan reflects what a real run does.
STEPS: list[Step] = [
    Step("1", "scrapers.scrape_savant (required)", produces=["savant_team_leaderboard.csv"]),
    Step("2", "scrapers.scrape_fangraphs", category="fangraphs",
         produces=["vs_RHP_standard.csv", "vs_RHP_batted_ball.csv",
                   "vs_LHP_standard.csv", "vs_LHP_batted_ball.csv", "sp_standard.csv"]),
    Step("3", "scrapers.scrape_pitch_mix", produces=["pitch_mix_pitcher.csv"]),
    Step("4", "core.compute", dep_key="core.compute",
         produces=["metrics_vs_RHP.csv", "metrics_vs_LHP.csv"]),
    Step("5", "outputs.push_sheets", dep_key="outputs.push_sheets", category="sheets_push"),
    Step("6", "scrapers.scrape_weather", dep_key="scrapers.scrape_weather", category="sheets_partial"),
    Step("7", "scrapers.scrape_lineups", dep_key="scrapers.scrape_matchups", category="sheets_partial"),
    Step("8", "scrapers.scrape_matchups", dep_key="scrapers.scrape_matchups", category="sheets_partial",
         produces=["today_matchups.csv"]),
    Step("9", "scrape_results + compute_results + push_team_results", dep_key="scrapers.scrape_results",
         category="sheets_partial",
         produces=["game_results.csv", "team_results.csv",
                   "team_l10_sp_hand.csv", "team_l10_sp_hand_games.csv"]),
    Step("10", "scrapers.scrape_pals", dep_key="scrapers.scrape_pals", category="sheets_partial"),
    Step("11", "core.compute_signals", dep_key="core.compute_signals", category="sheets_partial"),
    Step("12", "scrapers.scrape_sp_gamelog", dep_key="scrapers.scrape_sp_gamelog",
         produces=["sp_gamelog.csv"]),
    Step("13", "compute_sp_splits + push_sp_splits", dep_key="core.compute_sp_splits", category="sheets_partial",
         produces=["sp_profiles.csv", "sp_metric_splits.csv"]),
    Step("14", "scrapers.scrape_reliever_gamelog", dep_key="scrapers.scrape_reliever_gamelog",
         produces=["reliever_gamelog.csv"]),
    Step("15", "compute_bullpen_profile + push_bullpen", dep_key="core.compute_bullpen_profile",
         category="sheets_partial", produces=["bullpen_unit.csv", "bullpen_individual.csv"]),
    Step("16", "scrapers.scrape_player_registry", dep_key="scrapers.scrape_player_registry",
         produces=["player_registry.csv"]),
    Step("17", "scrapers.scrape_batter_splits", dep_key="scrapers.scrape_batter_splits", category="fangraphs",
         produces=["batter_splits_rhp.csv", "batter_splits_lhp.csv", "batter_splits_overall.csv"]),
    Step("18", "scrapers.scrape_batter_gamelog", dep_key="scrapers.scrape_batter_gamelog",
         produces=["batter_gamelog.csv"]),
    Step("19", "compute_batter_profile + push_batter_profiles", dep_key="core.compute_batter_profile",
         category="sheets_partial", produces=["batter_profiles.csv"]),
    Step("20", "compute_batter_prop_hitrates + push_batter_prop_hitrates",
         dep_key="core.compute_batter_prop_hitrates", category="sheets_partial",
         produces=["batter_prop_hitrates.csv"]),
    Step("21a", "compute_team_profile + push_team_profiles", dep_key="core.compute_team_profile",
         category="sheets_partial", produces=["team_profiles.csv"]),
    Step("21b", "outputs.push_pitch_mix", dep_key="outputs.push_pitch_mix", category="sheets_push"),
    Step("21c", "outputs.push_supabase (hub_dataset mirror)", category="supabase"),
]

INSTAGRAM_STEP = Step("opt", "outputs.push_instagram (Instagram auto-post)", category="sheets_push")


def fangraphs_readiness() -> tuple[bool, str]:
    email = os.getenv("FANGRAPHS_EMAIL", "").strip()
    password = os.getenv("FANGRAPHS_PASSWORD", "").strip()
    if not email or not password:
        return False, "FANGRAPHS_EMAIL/FANGRAPHS_PASSWORD not set in .env"
    if not Path(CHROME_PATH).is_file():
        return False, f"Chrome not found at {CHROME_PATH}"
    return True, ""


def supabase_readiness() -> bool:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = (
        os.getenv("SUPABASE_SECRET_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_KEY")
        or ""
    ).strip()
    return bool(url and key)


def build_plan(
    skip_fangraphs: bool,
    google_ok: bool,
    fg_ready: bool,
    fg_reason: str,
    supabase_ok: bool,
) -> list[tuple[str, str, str, str]]:
    """Return (number, label, status, reason) for each step + the Instagram bonus row.

    Simulates the run in order: a step predicted RUN is assumed to produce its
    normal output files, which then satisfy later steps' file dependencies --
    same cascade a real run would produce.
    """
    virtual_files = {p.name for p in Path(DATA_DIR).glob("*.csv")}
    rows: list[tuple[str, str, str, str]] = []

    for step in STEPS + [INSTAGRAM_STEP]:
        status, reason = "RUN", ""

        if step is INSTAGRAM_STEP and os.getenv("INSTAGRAM_AUTO_POST", "").strip().lower() not in {"1", "true", "yes"}:
            status, reason = "SKIP", "INSTAGRAM_AUTO_POST not enabled"

        if status == "RUN" and step.category == "fangraphs":
            if skip_fangraphs:
                status, reason = "SKIP", "--skip-fangraphs"
            elif not fg_ready:
                status, reason = "FAIL", fg_reason

        if status == "RUN" and step.dep_key:
            missing = [f for f in STEP_DEPENDENCIES.get(step.dep_key, []) if f not in virtual_files]
            if missing:
                extra = f" (+{len(missing) - 1} more)" if len(missing) > 1 else ""
                status, reason = "SKIP", f"missing data/{missing[0]}{extra}"

        if status == "RUN" and step.category == "sheets_push" and not google_ok:
            status, reason = "SKIP", "google_credentials.json missing/invalid"

        if status == "RUN" and step.category == "supabase" and not supabase_ok:
            status, reason = "SKIP", "SUPABASE_URL/SUPABASE_SECRET_KEY not set"

        if status == "RUN" and step.category == "sheets_partial" and not google_ok:
            reason = "Sheets push portion will skip (no google_credentials.json)"

        if status == "RUN":
            virtual_files.update(step.produces)

        rows.append((step.n, step.label, status, reason))

    return rows


def print_report(python_path: Path, skip_fangraphs: bool = False, full: bool = True) -> None:
    google_ok = check_google_credentials()
    fg_ready, fg_reason = fangraphs_readiness()
    supabase_ok = supabase_readiness()

    print("=" * 64)
    print("MLBMA Pipeline Doctor")
    print("=" * 64)

    if full:
        print("\n-- Environment --")
        print(f"  Python:              {python_path}")
        print(f"  .env present:        {'yes' if ENV_FILE.is_file() else 'NO -- copy from .env.example'}")
        print(f"  FANGRAPHS_EMAIL:     {'set' if os.getenv('FANGRAPHS_EMAIL', '').strip() else 'NOT SET'}")
        print(f"  FANGRAPHS_PASSWORD:  {'set' if os.getenv('FANGRAPHS_PASSWORD', '').strip() else 'NOT SET'}")
        print(f"  SUPABASE write key:  {'set' if supabase_ok else 'NOT SET'}")
        print(f"  google_credentials.json: {'present + valid JSON' if google_ok else 'MISSING or invalid'}")
        chrome_ok = Path(CHROME_PATH).is_file()
        print(f"  Chrome:              {'found: ' + CHROME_PATH if chrome_ok else 'NOT FOUND (' + CHROME_PATH + ')'}")

    print("\n-- Step plan (RUN / SKIP / FAIL) --")
    rows = build_plan(skip_fangraphs, google_ok, fg_ready, fg_reason, supabase_ok)
    for n, label, status, reason in rows:
        suffix = f"  -- {reason}" if reason else ""
        print(f"  [{status:4}] {n:>4}  {label}{suffix}")

    n_run = sum(1 for r in rows if r[2] == "RUN")
    n_skip = sum(1 for r in rows if r[2] == "SKIP")
    n_fail = sum(1 for r in rows if r[2] == "FAIL")
    print(f"\n  {n_run} RUN / {n_skip} SKIP / {n_fail} FAIL  ({len(rows)} steps)")
