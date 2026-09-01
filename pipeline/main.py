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
    # Must follow scrape_fangraphs and precede core.compute: it refreshes the season
    # lines calc_pitching_score reads while inheriting the FanGraphs-only columns
    # (xFIP, batted ball) from whatever that scrape left behind.
    "scrapers.scrape_sp_season_standard",
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
    child_env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run(
        [str(PYTHON), "-m", module],
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


def run():
    """
    Pipeline order (22 logical steps):
      1 scrape_savant (required)
      2 scrape_fangraphs (optional)
      3 core.compute (optional, needs Savant + FanGraphs)
      4 push_sheets core metrics (optional)
      5 scrape_lineups (Today_Games/Today_Lineups + Today_Matchups refresh)
      6 scrape_matchups (authoritative Today_Matchups rebuild — always runs)
      7 scrape_weather (optional)
      8 scrape_pals (optional)
      9 compute_signals (optional)
     10 scrape_sp_gamelog (optional)
     10b scrape_reliever_gamelog + pitcher-handedness backfill (optional)
     11 compute_sp_l14 + scrape_sp_hand_splits + compute_sp_splits + push (optional)
     12 scrape_reliever_gamelog (optional)
     13 bullpen compute + push (optional)
     13b bullpen social chart refresh for live slate (optional)
     14 scrape_player_registry (optional)
     15 scrape_batter_splits (optional)
     16 scrape_batter_gamelog (optional)
     17-18 batter profile compute + push (optional)
     19-20 batter prop hit-rates compute + push (optional)
     21-22 team compute + push (optional)
    """
    pipeline_t0 = time.perf_counter()
    print(f"MLBMA Pipeline starting at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    for script in SCRIPTS_REQUIRED:
        if not run_script(script, required=True):
            sys.exit(1)

    for script in SCRIPTS_OPTIONAL:
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
    # Reliever log moved ahead of the SP split compute so one handedness repair can cover
    # both game logs before anything aggregates them.
    run_reliever_gamelog()
    run_pitcher_hand_backfill("pitcher game logs")
    run_sp_splits()
    run_bullpen_profiles()
    run_bullpen_social_charts()

    run_player_registry()
    run_batter_splits()
    run_batter_gamelog()
    run_pitcher_hand_backfill("batter game log")
    run_batter_splits_mlb()
    run_batter_splits_fallback()
    run_batter_profiles()
    run_batter_prop_hitrates()
    run_team_profiles()
    run_instagram_autopost()

    total = time.perf_counter() - pipeline_t0
    print(f"\nPipeline complete at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total elapsed: {_fmt_elapsed(total)}")
    print("All metrics pushed to Google Sheets")


def run_sp_gamelog():
    """Step 10: SP game logs from MLB Stats API; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_sp_gamelog import run as run_sp_gamelog_module

        run_sp_gamelog_module()

    _run_step("Step 10: scrapers.scrape_sp_gamelog", "scrapers.scrape_sp_gamelog", _fn)


def run_pitcher_hand_backfill(stage: str):
    """Resolve pitcher handedness in the freshly written logs; non-fatal on failure.

    Every scraper that stamps handedness gets some of it wrong, and each one is wrong in
    its own way: the reliever roster call returns no pitchHand unless hydrated, and the SP
    side resolves by name against player_registry.csv, which only covers active and IL
    rosters - about a quarter of the season's starters are absent, so anyone released,
    traded out or sent down keeps whatever the fallback guessed. On 2026-08-31 that shipped
    a league with no left-handers at all: 8,981 reliever_gamelog rows and all 283 bullpen
    profiles read "R".

    Patching the files by hand fixed a day and nothing more - the next nightly run wrote
    the same wrong values straight back. This makes the repair part of the run instead. The
    script is idempotent and asks the MLB people endpoint for anyone the registry cannot
    answer, so it is the one place that closes the gap for every file at once.
    """

    def _fn():
        script = ROOT / "scripts" / "backfill_pitcher_hand.py"
        if not script.exists():
            print("  WARNING: backfill_pitcher_hand.py missing -- skip")
            return
        result = subprocess.run(
            [str(PYTHON), str(script), "--apply"],
            cwd=str(ROOT),
            env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode != 0:
            raise RuntimeError(f"backfill_pitcher_hand exited {result.returncode}")

    _run_step(
        f"Pitcher handedness backfill ({stage})",
        "scrapers.scrape_sp_gamelog",
        _fn,
    )


def run_sp_splits():
    """Step 11: SP split profiles + Sheets push; non-fatal on failure.

    The L14 window and the vs-LHH/RHH platoon lines are rebuilt first. Both used to come
    from FanGraphs, whose scrape has been dead since 2026-07-29; the files simply froze
    and kept being published, so the staleness flags ran off a mid-July window and the
    platoon panel was a month behind. They are derived from the game log and the MLB
    Stats API now, and must be refreshed before the splits that consume them.
    """

    def _fn():
        from core.compute_sp_l14 import run as run_compute_sp_l14

        run_compute_sp_l14()
        from scrapers.scrape_sp_hand_splits import run as run_sp_hand_splits

        run_sp_hand_splits()
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


def run_bullpen_social_charts():
    """Step 13b: regenerate focused bullpen social crops for the live slate.

    Non-fatal. Keeps posted bullpen charts aligned with Today_Matchups instead of
    a hardcoded legacy game list.
    """

    def _fn():
        script = ROOT / "scripts" / "capture_matchup_artifacts.py"
        if not script.exists():
            print("  WARNING: capture_matchup_artifacts.py missing — skip")
            return
        # Bullpen-only keeps the daily run short; full packs remain a manual flag.
        result = subprocess.run(
            [str(PYTHON), str(script), "--shots", "bullpen"],
            cwd=str(ROOT),
            env={**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode != 0:
            raise RuntimeError(f"capture_matchup_artifacts exited {result.returncode}")

    _run_step(
        "Step 13b: refresh bullpen social charts (live slate)",
        "core.compute_bullpen_profile",
        _fn,
    )


def run_player_registry():
    """Step 14: MLB player registry + Sheets push; non-fatal on failure."""

    def _fn():
        from scrapers.scrape_player_registry import run as run_registry

        run_registry()

    _run_step("Step 14: scrapers.scrape_player_registry", "scrapers.scrape_player_registry", _fn)


def run_batter_splits():
    """Step 15: FanGraphs batter splits; non-fatal on failure."""

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


def run_batter_splits_mlb():
    """Step 16a: batter situational splits from the MLB Stats API.

    The real source for vs-starter / vs-reliever and for true plate-appearance platoon
    splits. Runs after the game log so it can use it as the batter roster, and before
    the game-log fallback, which then only has to cover the date windows.
    """

    def _fn():
        from scrapers.scrape_batter_splits_mlb import run as run_mlb_splits

        run_mlb_splits()

    _run_step(
        "Step 16a: scrapers.scrape_batter_splits_mlb",
        "scrapers.scrape_batter_splits_mlb",
        _fn,
    )


def run_batter_splits_fallback():
    """Step 16b: rebuild any split table Step 15 could not fill, from the game log.

    Runs after the game log refresh so it derives from current data, and before the
    batter profiles that consume the splits. Only touches files that are still empty,
    so a working FanGraphs export always wins.
    """

    def _fn():
        from core.compute_batter_splits import run as run_derive_splits

        run_derive_splits()

    _run_step(
        "Step 16b: core.compute_batter_splits (fallback for empty splits)",
        "core.compute_batter_splits",
        _fn,
    )


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

        run_push_supabase()

    _run_step(
        "Step 20: mirror dashboard datasets to Supabase (hub_dataset)",
        "outputs.push_supabase",
        _supabase_mirror,
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


def run_ecosystem_publish():
    """After MLBMA, export + push bet-evaluator and sharp-money-tracker (default on).

    Skipped when:
      - MLBMA_SKIP_ECOSYSTEM=1 (run_full_pipeline.py handles publish itself)
      - ECOSYSTEM_PUBLISH=0|false|no|skip
    """
    if os.getenv("MLBMA_SKIP_ECOSYSTEM", "").strip().lower() in {"1", "true", "yes"}:
        return
    if os.getenv("ECOSYSTEM_PUBLISH", "1").strip().lower() in {"0", "false", "no", "skip"}:
        print("\n  ECOSYSTEM_PUBLISH disabled — skipping bet-evaluator + sharp-money-tracker")
        return

    script = ROOT / "run_full_pipeline.py"
    if not script.exists():
        print("\n  WARNING: run_full_pipeline.py not found — skipping ecosystem publish")
        return

    fetch_odds = os.getenv("FETCH_ODDS", "").strip().lower() in {"1", "true", "yes"}
    print(f"\n{'='*50}")
    print("Ecosystem publish (bet-evaluator + sharp-money-tracker)")
    print(f"{'='*50}")

    import importlib.util

    spec = importlib.util.spec_from_file_location("run_full_pipeline", script)
    if spec is None or spec.loader is None:
        print("  WARNING: could not load run_full_pipeline.py — skipping ecosystem publish")
        return
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    publish = getattr(mod, "publish_ecosystem", None)
    if not callable(publish):
        print("  WARNING: publish_ecosystem missing — skipping ecosystem publish")
        return

    results = publish(commit=True, push=True, fetch_odds=fetch_odds, dry=False)
    failed = [k for k, v in results.items() if v in ("FAILED", "missing")]
    if failed:
        print(f"  WARNING: ecosystem publish issues: {', '.join(failed)}")
    else:
        print("  Ecosystem publish complete.")


def run_discord_autopost():
    """Optional: post the daily signals embed to Discord after the pipeline run.

    Off unless DISCORD_AUTO_POST is truthy; also requires DISCORD_WEBHOOK_URL (or the bot
    token) in .env. Non-fatal. See outputs/push_discord.py and docs/DISCORD_BOT_UPDATE_PLAN.md.
    """
    if os.getenv("DISCORD_AUTO_POST", "").strip().lower() not in {"1", "true", "yes"}:
        return

    def _fn():
        from outputs.push_discord import post_daily_signals

        post_daily_signals(send=True)

    _run_step("Optional: outputs.push_discord (daily signals)", "outputs.push_discord", _fn)


if __name__ == "__main__":
    run()
    run_ecosystem_publish()
    run_discord_autopost()
