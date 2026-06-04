/**
 * MLBMA shared dashboard constants -- generated from core/config.py
 * Regenerate: python -m dashboard.generate_mlbma_config_js
 */
window.MLBMA_CONFIG = {
  SHEET_ID: "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk",
  SHEET_TABS: {
  "vs_rhp": "vs_RHP",
  "vs_lhp": "vs_LHP",
  "oor": "OOR",
  "pitching_score": "Pitching_Score",
  "pals": "PALS",
  "today_matchups": "Today_Matchups",
  "today_lineups": "Today_Lineups",
  "today_games": "Today_Games",
  "weather": "Weather",
  "last_updated": "Last_Updated",
  "sp_metric_splits": "SP_Metric_Splits",
  "sp_profiles": "SP_Profiles",
  "sp_game_log": "SP_Game_Log",
  "sp_l14": "SP_L14",
  "bullpen_unit": "Bullpen_Unit",
  "bullpen_individual": "Bullpen_Individual",
  "reliever_log": "Reliever_Log",
  "signals_today": "Signals_Today",
  "signals_convergence": "Signals_Convergence",
  "player_registry": "Player_Registry",
  "batter_profiles": "Batter_Profiles",
  "batter_splits_overall": "Batter_Splits_Overall",
  "batter_splits_rhp": "Batter_Splits_RHP",
  "batter_splits_lhp": "Batter_Splits_LHP",
  "batter_splits_home": "Batter_Splits_Home",
  "batter_splits_away": "Batter_Splits_Away",
  "batter_splits_vs_sp": "Batter_Splits_vsSP",
  "batter_splits_vs_rp": "Batter_Splits_vsRP",
  "batter_splits_recent": "Batter_Splits_Recent",
  "team_profiles": "Team_Profiles",
  "team_results": "Team_Results"
},
  DASHBOARD_PAGES: [
    { id: "main", label: "Main Dashboard", file: "chase_analytics_mlb_oem_v7.html", url: "chase_analytics_mlb_oem_v7.html", params: null },
    { id: "matchup_sheet", label: "Matchup Sheet", file: "matchup_sheet.html", url: "matchup_sheet.html", params: null },
    { id: "batter_profile", label: "Batter Profile", file: "batter_profile.html", url: "batter_profile.html", params: ["player"] },
    { id: "pitcher_profile", label: "Pitcher Profile", file: "pitcher_profile.html", url: "pitcher_profile.html", params: ["pitcher"] },
    { id: "bullpen_report", label: "Bullpen Profile", file: "bullpen_report.html", url: "bullpen_report.html", params: null },
    { id: "team_profile", label: "Team Profile", file: "team_profile.html", url: "team_profile.html", params: ["team"] },
    { id: "glossary", label: "Glossary", file: "glossary.html", url: "glossary.html", params: null }
  ],
  OSI_TIERS: [[85, "Elite"], [75, "High Level"], [65, "Dangerous"], [50, "Inconsistent"], [0, "Weak"]],
  PITCHING_TIERS: [[85, "Ace"], [70, "Solid"], [55, "Average"], [0, "Volatile"]],
  ARCHETYPE_TIER_CUTOFFS: {
  "high_min": 72.0,
  "mid_min": 58.0,
  "low_max": 58.0
},
  FIP_CONSTANT: 3.10,
  PARK_FACTORS: {
  "COL": 1.38,
  "BOS": 1.12,
  "CIN": 1.1,
  "TEX": 1.08,
  "PHI": 1.07,
  "NYY": 1.06,
  "CHC": 1.05,
  "MIL": 1.04,
  "ATL": 1.03,
  "HOU": 1.02,
  "LAD": 1.01,
  "NYM": 1.0,
  "STL": 1.0,
  "MIN": 0.99,
  "DET": 0.99,
  "TOR": 0.98,
  "BAL": 0.98,
  "ARI": 0.97,
  "SFG": 0.97,
  "SEA": 0.96,
  "CLE": 0.96,
  "PIT": 0.95,
  "WSN": 0.95,
  "KCR": 0.95,
  "MIA": 0.94,
  "TBR": 0.94,
  "LAA": 0.93,
  "SDP": 0.92,
  "CHW": 0.91,
  "ATH": 0.9
}
};

/* Legacy aliases */
window.MLBMA_SHEET_ID = MLBMA_CONFIG.SHEET_ID;
window.MLBMA_FIP_CONSTANT = MLBMA_CONFIG.FIP_CONSTANT;
