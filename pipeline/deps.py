"""Pipeline step dependency checks (data/ CSV outputs)."""

from __future__ import annotations

from pathlib import Path

from core.config import DATA_DIR

DATA = Path(DATA_DIR)

# module_or_label -> list of required files under data/
STEP_DEPENDENCIES: dict[str, list[str]] = {
    "scrapers.scrape_fangraphs": [],
    "scrapers.scrape_pitch_mix": [],
    "outputs.push_pitch_mix": ["pitch_mix_pitcher.csv"],
    "core.compute": [
        "savant_team_leaderboard.csv",
        "vs_RHP_standard.csv",
        "vs_RHP_batted_ball.csv",
        "vs_LHP_standard.csv",
        "vs_LHP_batted_ball.csv",
    ],
    "outputs.push_sheets": [
        "metrics_vs_RHP.csv",
        "metrics_vs_LHP.csv",
    ],
    "scrapers.scrape_matchups": [],
    "scrapers.scrape_weather": [],
    "scrapers.scrape_pals": [
        "metrics_vs_RHP.csv",
        "sp_standard.csv",
    ],
    "core.compute_signals": [
        "today_matchups.csv",
        "metrics_vs_RHP.csv",
        "metrics_vs_LHP.csv",
    ],
    "scrapers.scrape_sp_gamelog": ["sp_standard.csv"],
    "core.compute_sp_splits": ["sp_gamelog.csv"],
    "outputs.push_sp_splits": ["sp_profiles.csv"],
    "scrapers.scrape_reliever_gamelog": [],
    "core.compute_bullpen_profile": ["reliever_gamelog.csv"],
    "outputs.push_bullpen": ["bullpen_unit.csv"],
    "scrapers.scrape_player_registry": [],
    "scrapers.scrape_batter_splits": ["player_registry.csv"],
    "core.compute_batter_profile": [
        "batter_splits_rhp.csv",
        "batter_splits_lhp.csv",
    ],
    "outputs.push_batter_profiles": ["batter_profiles.csv"],
    "scrapers.scrape_results": [],
    "core.compute_results": ["game_results.csv"],
    "core.compute_team_l10_sp_hand": ["game_results.csv"],
    "outputs.push_team_results": ["team_results.csv"],
    "outputs.push_team_l10_sp_hand": ["team_l10_sp_hand.csv"],
    "core.compute_team_profile": [
        "metrics_vs_RHP.csv",
        "metrics_vs_LHP.csv",
    ],
    "outputs.push_team_profiles": ["team_profiles.csv"],
}


def missing_files(required: list[str]) -> list[str]:
    return [name for name in required if not (DATA / name).exists()]


def check_step_deps(step: str, required: bool = False) -> bool:
    """
    Return True if dependencies are satisfied (or step has none).
    Print WARNING and return False when files are missing.
    """
    files = STEP_DEPENDENCIES.get(step, [])
    if not files:
        return True
    missing = missing_files(files)
    if not missing:
        return True
    level = "ERROR" if required else "WARNING"
    print(f"  {level}: Skipping {step} -- missing dependency file(s):")
    for name in missing:
        print(f"    - data/{name}")
    return False
