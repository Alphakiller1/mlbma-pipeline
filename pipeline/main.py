import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from pipeline.deps import check_step_deps

ROOT = Path(__file__).resolve().parent.parent


def _resolve_python() -> Path:
    candidates = [
        Path((Path.cwd() / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT / "crawl_env" / "Scripts" / "python.exe")),
        Path((ROOT.parent / "crawl_env" / "Scripts" / "python.exe")),
        # POSIX venv layout (macOS/Linux)
        Path((Path.cwd() / "crawl_env" / "bin" / "python")),
        Path((ROOT / "crawl_env" / "bin" / "python")),
        Path((ROOT.parent / "crawl_env" / "bin" / "python")),
        Path(sys.executable),
    ]
    for c in candidates:
        if c and c.exists():
            return c
    return Path(sys.executable)


PYTHON = _resolve_python()

# Required: Savant is the minimum data source for the pipeline to proceed.
SCRIPTS_REQUIRED = [
    "scrapers.scrape_savant",
]

# Optional: failures log WARNING and execution continues (FanGraphs-free / partial runs).
SCRIPTS_OPTIONAL = [
    "scrapers.scrape_fangraphs",
    "scrapers.scrape_pitch_mix",
    "core.compute",
    "outputs.push_sheets",
    "scrapers.scrape_weather",
]


def _fmt_elapsed(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    return f"{int(seconds // 60)}m {seconds % 60:.0f}s"


def run_script(module: str, required: bool = True) -> bool:
    dep_key = module
    if not check_step_deps(dep_key, required=required):
        return not required

    print(f"\n{'='*50}")
    print(f"Running {module}...")
    print(f"{'='*50}")
    t0 = time.perf_counter()
    # Force UTF-8 stdout/stderr in child processes so a single non-ASCII print
    # (em-dash, box-drawing, check-mark) can't crash a scraper on a cp1252 console
    # (the WinError 6 / UnicodeEncodeError cascade seen in pipeline_log.txt).
    child_env = {
        **os.environ,
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
    }
    result = subprocess.run(
        [str(PYTHON), "-u", "-m", module],
        cwd=str(ROOT),
        env=child_env,
    )
    elapsed = time.perf_counter() - t0
    ok = result.returncode == 0
    status = "OK" if ok else ("ERROR" if required else "WARNING")
    print(f"  [{status}] {module} finished in {_fmt_elapsed(elapsed)}")
    if not ok:
        if required:
            print(f"ERROR: {module} failed")
        else:
            print(f"WARNING: {module} failed - continuing")
    return ok


def _run_step(label: str, dep_key: str, fn, required: bool = False) -> bool:
    if not check_step_deps(dep_key, required=required):
        return False
    print(f"\n{'='*50}")
    print(f"{label}")
    print(f"{'='*50}")
    t0 = time.perf_counter()
    try:
        fn()
        elapsed = time.perf_counter() - t0
        print(f"  [OK] {label} finished in {_fmt_elapsed(elapsed)}")
        return True
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"  [WARNING] {label} failed after {_fmt_elapsed(elapsed)}: {exc}")
        return False


def run_signals():
    """Compute cross-metric signals; non-fatal on failure."""
    if not check_step_deps("core.compute_signals"):
        return

    def _signals():
        from core.compute_signals import run as run_signals_module

        run_signals_module()

    _run_step("Running core.compute_signals", "core.compute_signals", _signals)


def run_lineups():
    """Scrape Rotowire lineups; non-fatal on failure."""

    def _lineups():
        from scrapers.scrape_lineups import run as run_lineups

        run_lineups()

    _run_step("Running scrapers.scrape_lineups", "scrapers.scrape_matchups", _lineups)


def run_matchups():
    """Rebuild Today_Matchups from the MLB schedule (authoritative slate).

    Runs independently of the Rotowire lineup scrape so the matchup sheet always
    reflects the current slate even if scrape_lineups failed. scrape_matchups has
    no step dependencies, so this never gets skipped.
    """

    def _fn():
        from scrapers import scrape_matchups

        scrape_matchups.run()

    _run_step(
        "Step 6: scrapers.scrape_matchups (authoritative matchup sheet)",
        "scrapers.scrape_matchups",
        _fn,
    )


def run_game_results():
    """Scrape + compute + push team game-results metrics; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_results import run as run_scrape_results

        run_scrape_results()
        from core.compute_results import run as run_compute_results

        run_compute_results()
        from core.compute_team_l10_sp_hand import run as run_compute_l10_sp_hand

        run_compute_l10_sp_hand()
        from outputs.push_team_results import run as run_push_team_results

        run_push_team_results()
        from outputs.push_team_l10_sp_hand import run as run_push_l10_sp_hand

        run_push_l10_sp_hand()

    _run_step(
        "Step Results: scrape_results + compute_results + push_team_results",
        "scrapers.scrape_results",
        _fn,
    )


def assert_slate_fresh(expected_date: str | None = None):
    """Hard guardrail against the silent stale-slate failure.

    The dashboard reads Today_Matchups from the Supabase hub first, so a run is only truly
    healthy if the hub slate is *today's*. A stale slate previously masqueraded as a
    successful run: analytics refreshed via Supabase while the Sheets-gated slate write
    silently skipped, leaving chase-analytics on yesterday's pitchers. Verify the hub slate
    date and fail loudly. Returns True (fresh), False (stale -> exit non-zero), or None
    (could not verify; non-fatal).

    ``expected_date`` should be the slate date captured when the run started (see ``run()``).
    A full run can take well over an hour; recomputing "today" fresh at the end falsely
    flags a perfectly good slate as stale if the run happens to cross local midnight. Callers
    that just want a standalone check (e.g. from a shell) can omit it to use the current date.
    """
    from core.slate_date import eastern_slate_date_iso

    today = expected_date or eastern_slate_date_iso()
    try:
        import json
        import urllib.request

        from outputs.push_supabase import SUPABASE_SECRET_KEY, SUPABASE_URL

        if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
            print("  [WARNING] slate guardrail skipped — Supabase env not set")
            return None
        url = (
            f"{SUPABASE_URL}/rest/v1/hub_dataset"
            "?name=eq.Today_Matchups&select=rows,updated_at"
        )
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_SECRET_KEY,
                "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        rows = (data[0].get("rows") if data else None) or []
        slate_dates = {
            str(r.get("Slate_Date", ""))[:10] for r in rows if r.get("Slate_Date")
        }
    except Exception as exc:
        print(f"  [WARNING] slate guardrail could not verify hub slate: {exc}")
        return None

    if rows and today in slate_dates:
        print(f"  [OK] slate guardrail: hub Today_Matchups is {today} ({len(rows)} games)")
        return True
    bar = "!" * 68
    print("\n" + bar)
    print(f"  STALE SLATE GUARDRAIL FAILED — expected {today}")
    print(f"  hub Today_Matchups slate date(s): {sorted(slate_dates) or 'EMPTY'} ({len(rows)} games)")
    print("  chase-analytics will show the WRONG day's matchups.")
    print("  Almost always the Google Sheets service-account write or the API schedule")
    print("  fetch failing in scrapers.scrape_matchups. Re-run: python3 -m scrapers.scrape_matchups")
    print(bar + "\n")
    return False


def run(skip_fangraphs: bool = False):
    """Run the full MLBMA pipeline (22 logical steps)."""
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    pipeline_t0 = time.perf_counter()
    from core.slate_date import eastern_slate_date_iso

    # Captured once, up front: a full run can take well over an hour (FanGraphs retries,
    # Statcast pagination), so recomputing "today" at the end would falsely flag a perfectly
    # fresh slate as stale if the run happens to cross local midnight.
    run_slate_date = eastern_slate_date_iso()
    print(
        f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} "
        f"(slate date {run_slate_date})"
    )

    for script in SCRIPTS_REQUIRED:
        if not run_script(script, required=True):
            sys.exit(1)

    for script in SCRIPTS_OPTIONAL:
        if script == "scrapers.scrape_fangraphs" and skip_fangraphs:
            print("\n  [SKIP] scrapers.scrape_fangraphs (--skip-fangraphs)")
            continue
        run_script(script, required=False)

    run_lineups()
    run_matchups()
    run_game_results()

    if check_step_deps("scrapers.scrape_pals"):
        run_script("scrapers.scrape_pals", required=False)
    else:
        print("WARNING: Skipping scrapers.scrape_pals (dependencies not met)")

    run_signals()

    run_sp_gamelog()
    run_sp_splits()
    run_reliever_gamelog()
    run_bullpen_profiles()

    run_player_registry()
    run_batter_splits(skip_fangraphs=skip_fangraphs)
    run_batter_gamelog()
    run_batter_profiles()
    run_batter_prop_hitrates()
    if run_team_profiles():
        run_model_deployment_sync()
    else:
        print("WARNING: MLB Model deployment not dispatched because hub mirror failed")
    run_instagram_autopost()

    slate_ok = assert_slate_fresh(expected_date=run_slate_date)

    total = time.perf_counter() - pipeline_t0
    print(f"\nPipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total elapsed: {_fmt_elapsed(total)}")
    print("All metrics pushed to Google Sheets")
    if slate_ok is False:
        print("EXIT 1: stale slate — see the guardrail banner above.")
        sys.exit(1)


def run_sp_gamelog():
    """Step 10: SP game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_sp_gamelog import run as run_sp_gamelog_module

        run_sp_gamelog_module()

    _run_step("Step 10: scrapers.scrape_sp_gamelog", "scrapers.scrape_sp_gamelog", _fn)


def run_sp_splits():
    """Step 11: SP split profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_sp_splits import run as run_compute_sp_splits

        run_compute_sp_splits()
        from outputs.push_sp_splits import run as run_push_sp_splits

        run_push_sp_splits()

    _run_step(
        "Step 11: compute_sp_splits + push_sp_splits",
        "core.compute_sp_splits",
        _fn,
    )


def run_reliever_gamelog():
    """Step 12: reliever game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_reliever_gamelog import run as run_reliever_gamelog_module

        run_reliever_gamelog_module()

    _run_step("Step 12: scrapers.scrape_reliever_gamelog", "scrapers.scrape_reliever_gamelog", _fn)


def run_bullpen_profiles():
    """Step 13: bullpen profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_bullpen_profile import run as run_compute_bullpen

        run_compute_bullpen()
        from outputs.push_bullpen import run as run_push_bullpen

        run_push_bullpen()

    _run_step(
        "Step 13: compute_bullpen_profile + push_bullpen",
        "core.compute_bullpen_profile",
        _fn,
    )


def run_player_registry():
    """Step 14: MLB player registry + Sheets push; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_player_registry import run as run_registry

        run_registry()

    _run_step("Step 14: scrapers.scrape_player_registry", "scrapers.scrape_player_registry", _fn)


def run_batter_splits(skip_fangraphs: bool = False):
    """Step 15: FanGraphs batter splits; non-fatal on failure."""
    if skip_fangraphs:
        print("\n  [SKIP] scrapers.scrape_batter_splits (--skip-fangraphs)")
        return

    def _fn():
        from scrapers.scrape_batter_splits import run as run_batter_splits_module

        run_batter_splits_module()

    _run_step("Step 15: scrapers.scrape_batter_splits", "scrapers.scrape_batter_splits", _fn)


def run_batter_gamelog():
    """Step 16: batter game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_batter_gamelog import run as run_batter_gamelog_module

        run_batter_gamelog_module()

    _run_step("Step 16: scrapers.scrape_batter_gamelog", "scrapers.scrape_batter_gamelog", _fn)


def run_batter_profiles():
    """Step 17-18: batter metrics + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_batter_profile import run as run_compute_batter

        run_compute_batter()
        from outputs.push_batter_profiles import run as run_push_batter

        run_push_batter()

    _run_step(
        "Step 17-18: compute_batter_profile + push_batter_profiles",
        "core.compute_batter_profile",
        _fn,
    )


def run_batter_prop_hitrates():
    """Step 19-20: rolling prop hit-rates + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_batter_prop_hitrates import run as run_compute_hitrates

        run_compute_hitrates()
        from outputs.push_batter_prop_hitrates import run as run_push_hitrates

        run_push_hitrates()

    _run_step(
        "Step 19-20: compute_batter_prop_hitrates + push_batter_prop_hitrates",
        "core.compute_batter_prop_hitrates",
        _fn,
    )


def run_team_profiles():
    """Step 21-22: team profiles + Sheets push; non-fatal on failure."""

    def _fn():
        from core.compute_team_profile import run as run_compute_team

        run_compute_team()
        from outputs.push_team_profiles import run as run_push_team

        run_push_team()

    _run_step(
        "Step 18-19: compute_team_profile + push_team_profiles",
        "core.compute_team_profile",
        _fn,
    )

    def _push_pitch_mix():
        from outputs.push_pitch_mix import run as run_push_pitch_mix

        run_push_pitch_mix()

    _run_step(
        "Step 19.5: outputs.push_pitch_mix",
        "outputs.push_pitch_mix",
        _push_pitch_mix,
    )

    # Mirror the dashboard's datasets into Supabase (public.hub_dataset) after the sheets
    # are current, so the dashboard can read them in one fast request. Non-fatal: if
    # Supabase is unreachable the dashboard transparently falls back to Google Sheets.
    def _supabase_mirror():
        from outputs.push_supabase import run as run_push_supabase

        if not run_push_supabase():
            raise RuntimeError("Supabase mirror skipped or incomplete")

    return _run_step(
        "Step 20: mirror dashboard datasets to Supabase (hub_dataset)",
        "outputs.push_supabase",
        _supabase_mirror,
    )


def run_model_deployment_sync():
    """Notify the unified MLB Model only after sheets and the hub mirror are current."""

    def _notify():
        from outputs.notify_mlb_model import run as run_notify_model

        if not run_notify_model():
            raise RuntimeError("MLB Model deployment dispatch skipped")

    _run_step(
        "Step 21: dispatch synchronized MLB Model deployment",
        "outputs.notify_mlb_model",
        _notify,
    )


def run_instagram_autopost():
    """Optional social publishing step; dry-run unless explicitly enabled."""
    if os.getenv("INSTAGRAM_AUTO_POST", "").strip().lower() not in {"1", "true", "yes"}:
        return

    def _fn():
        from outputs.push_instagram import run as run_push_instagram

        publish = os.getenv("INSTAGRAM_PUBLISH", "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        run_push_instagram(publish=publish)

    _run_step("Optional: outputs.push_instagram", "outputs.push_instagram", _fn)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline.main",
        description="Run the full MLBMA pipeline, or preflight-check readiness.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Print a readiness report (python/env/creds/Chrome + step plan) and exit without scraping.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the step execution plan (RUN/SKIP/FAIL) and exit without scraping.",
    )
    parser.add_argument(
        "--skip-fangraphs",
        action="store_true",
        help="Skip FanGraphs Selenium steps (scrape_fangraphs, scrape_batter_splits). "
        "Useful in CI where headless bot-login is unreliable.",
    )
    return parser


def main() -> None:
    args = _build_arg_parser().parse_args()

    if args.check:
        from pipeline.doctor import print_report

        print_report(PYTHON, skip_fangraphs=args.skip_fangraphs, full=True)
    elif args.dry_run:
        from pipeline.doctor import print_report

        print_report(PYTHON, skip_fangraphs=args.skip_fangraphs, full=False)
    else:
        run(skip_fangraphs=args.skip_fangraphs)


if __name__ == "__main__":
    main()
