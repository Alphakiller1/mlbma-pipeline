"""Wire mlbma_config.js into all dashboard HTML files."""
from __future__ import annotations

import re
from pathlib import Path

DASH_DIR = Path(__file__).resolve().parent.parent / "dashboard"

FILES = [
    "chase_analytics_mlb_oem_v7.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "bullpen_report.html",
    "batter_profile.html",
    "reliever_profile.html",
    "team_profile.html",
    "player_search.html",
]

SHEET_ID_RE = re.compile(
    r"var SHEET_ID = '1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk';"
)

TAB_MAP = {
    "Today_Matchups": "TABS.today_matchups",
    "Today_Lineups": "TABS.today_lineups",
    "Today_Games": "TABS.today_games",
    "Weather": "TABS.weather",
    "OOR": "TABS.oor",
    "PALS": "TABS.pals",
    "Pitching_Score": "TABS.pitching_score",
    "Bullpen_Unit": "TABS.bullpen_unit",
    "Bullpen_Individual": "TABS.bullpen_individual",
    "Reliever_Log": "TABS.reliever_log",
    "Player_Registry": "TABS.player_registry",
    "Batter_Profiles": "TABS.batter_profiles",
    "SP_Profiles": "TABS.sp_profiles",
    "SP_Metric_Splits": "TABS.sp_metric_splits",
    "SP_Game_Log": "TABS.sp_game_log",
    "Team_Profiles": "TABS.team_profiles",
    "vs_RHP": "TABS.vs_rhp",
    "vs_LHP": "TABS.vs_lhp",
    "Batter_Splits_Overall": "TABS.batter_splits_overall",
    "Batter_Splits_RHP": "TABS.batter_splits_rhp",
    "Batter_Splits_LHP": "TABS.batter_splits_lhp",
    "Batter_Splits_Home": "TABS.batter_splits_home",
    "Batter_Splits_Away": "TABS.batter_splits_away",
    "Batter_Splits_vsSP": "TABS.batter_splits_vs_sp",
    "Batter_Splits_vsRP": "TABS.batter_splits_vs_rp",
    "Batter_Splits_Recent": "TABS.batter_splits_recent",
}

SCRIPT_TAG = '<script src="mlbma_config.js"></script>\n'


def wire(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "mlbma_config.js" not in text:
        text = text.replace("<script>\n", SCRIPT_TAG + "<script>\n", 1)

    text = SHEET_ID_RE.sub(
        "var TABS = MLBMA_CONFIG.SHEET_TABS;\nvar SHEET_ID = MLBMA_CONFIG.SHEET_ID;",
        text,
        count=1,
    )

    for literal, expr in TAB_MAP.items():
        text = text.replace(f"fetchSheetTab('{literal}')", f"fetchSheetTab({expr})")
        text = text.replace(f"sheetCsvUrl('{literal}')", f"sheetCsvUrl({expr})")

    # reliever FIP
    text = text.replace(
        "var FIP_CONSTANT = (typeof window !== 'undefined' && window.MLBMA_FIP_CONSTANT) || 3.10;",
        "var FIP_CONSTANT = MLBMA_CONFIG.FIP_CONSTANT;",
    )

    # bullpen header meta hardcoded id
    text = text.replace(
        '<span id="headerMeta">1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk</span>',
        '<span id="headerMeta"></span>',
    )

    if path.name == "batter_profile.html":
        old_opt = """var OPTIONAL_RAW_TABS = [
  ['Batter_Splits_Overall', 'overall'],
  ['Batter_Splits_RHP', 'vs_RHP'],
  ['Batter_Splits_LHP', 'vs_LHP'],
  ['Batter_Splits_Home', 'home'],
  ['Batter_Splits_Away', 'away'],
  ['Batter_Splits_vsSP', 'vs_SP'],
  ['Batter_Splits_vsRP', 'vs_RP']
];"""
        new_opt = """var OPTIONAL_RAW_TABS = [
  [TABS.batter_splits_overall, 'overall'],
  [TABS.batter_splits_rhp, 'vs_RHP'],
  [TABS.batter_splits_lhp, 'vs_LHP'],
  [TABS.batter_splits_home, 'home'],
  [TABS.batter_splits_away, 'away'],
  [TABS.batter_splits_vs_sp, 'vs_SP'],
  [TABS.batter_splits_vs_rp, 'vs_RP'],
  [TABS.batter_splits_recent, 'recent']
];"""
        text = text.replace(old_opt, new_opt)

    if path.name == "bullpen_report.html":
        insert = (
            "\n(function(){ var el = document.getElementById('headerMeta'); "
            "if (el) el.textContent = SHEET_ID; })();"
        )
        if insert not in text:
            text = text.replace(
                "var SHEET_ID = MLBMA_CONFIG.SHEET_ID;",
                "var SHEET_ID = MLBMA_CONFIG.SHEET_ID;" + insert,
                1,
            )

    path.write_text(text, encoding="utf-8")
    print(f"Wired {path.name}")


def main() -> None:
    for name in FILES:
        wire(DASH_DIR / name)


if __name__ == "__main__":
    main()
