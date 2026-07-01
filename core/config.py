import json
import os
from pathlib import Path

from dotenv import load_dotenv

# ── Project paths ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CREDS_FILE = PROJECT_ROOT / "google_credentials.json"
ENV_FILE = PROJECT_ROOT / ".env"

# Load once here so every module sees the same env, regardless of which one is
# imported first (previously only fangraphs_session.py / push_supabase.py loaded it,
# so keys were invisible to steps that didn't scrape FanGraphs or push to Supabase).
load_dotenv(ENV_FILE)

CREDS_ERROR_MESSAGE = (
    "ERROR: google_credentials.json not found at {path}. "
    "Copy from your secure storage to the project root before running the pipeline."
)


def check_google_credentials() -> bool:
    """Return True if google_credentials.json exists and contains valid JSON."""
    if not CREDS_FILE.is_file():
        print(CREDS_ERROR_MESSAGE.format(path=CREDS_FILE))
        return False
    try:
        with CREDS_FILE.open(encoding="utf-8") as fh:
            json.load(fh)
    except json.JSONDecodeError as exc:
        print(
            f"ERROR: google_credentials.json at {CREDS_FILE} is not valid JSON: {exc}"
        )
        return False
    return True

SHEET_ID = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"

# Supabase — dedicated dashboard read-cache project (separate from the betting-brain
# warehouse). The publishable key is public by design (it ships in the browser) and is
# gated read-only to public.hub_dataset via RLS, so it is safe to commit. The secret key
# (pipeline writes) lives only in .env as SUPABASE_SECRET_KEY.
SUPABASE_DASHBOARD = {
    "url": "https://mvxjcfriirguhjujurhf.supabase.co",
    "publishable_key": "sb_publishable_o5EJOhmdxbUPLMHZGKpv1g_Jk8by5v2",
    "table": "hub_dataset",
    "enabled": True,
    # Tabs mirrored into hub_dataset → read from Supabase. Anything not listed (and all
    # slate tabs: Today_*) still reads from Google Sheets. Slate tabs are intentionally
    # excluded (they change intra-day and come from the live MLB API).
    "tabs": [
        "Team_Results", "vs_RHP", "vs_LHP", "Team_Profiles",
        "OOR", "Pitching_Score", "PALS",
        "SP_Profiles", "SP_Metric_Splits", "SP_Game_Log", "SP_L14",
        "Pitch_Mix_Pitcher", "Pitch_Mix_Pitcher_L14",
        "Pitch_Mix_Batter", "Pitch_Mix_Batter_L14",
        "Pitch_Mix_Team_Pitching", "Pitch_Mix_Team_Pitching_L14",
        "Pitch_Mix_Team_Batting", "Pitch_Mix_Team_Batting_L14",
        "Bullpen_Unit", "Bullpen_Individual", "Reliever_Log",
        "Player_Registry", "Batter_Profiles",
        "Batter_Splits_Overall", "Batter_Splits_RHP", "Batter_Splits_LHP",
        "Batter_Splits_Home", "Batter_Splits_Away", "Batter_Splits_vsSP",
        "Batter_Splits_vsRP", "Batter_Splits_Recent",
        "Team_L10_SP_Hand", "Team_L10_SP_Games",
        "Signals_Today", "Signals_Convergence",
    ],
}

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CURRENT_SEASON = 2026

# 2026 park factors (offense environment; 1.0 = neutral)
PARK_FACTORS = {
    "COL": 1.38,
    "BOS": 1.12,
    "CIN": 1.10,
    "TEX": 1.08,
    "PHI": 1.07,
    "NYY": 1.06,
    "CHC": 1.05,
    "MIL": 1.04,
    "ATL": 1.03,
    "HOU": 1.02,
    "LAD": 1.01,
    "NYM": 1.00,
    "STL": 1.00,
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
    "ATH": 0.90,
}

PITCHER_K_DRIFT_THRESHOLD = 4.0
PITCHER_BB_DRIFT_THRESHOLD = 2.0
PITCHER_HR_DRIFT_THRESHOLD = 0.30
PITCHER_MIN_L14_STARTS = 2
PITCHER_DEFAULT_WINDOW = "L14"

# F5 proxy weights - process metrics weighted higher since F5 is starter-driven.
# Replace with true F5 splits when pipeline provides direct F5 data.
F5_OSI_WEIGHTS = {"ABQ": 0.45, "OBR": 0.35, "RCV": 0.20}

# Batter profile system
BATTER_MIN_PA = 50
# Lower PA floor for today's lineup batters so projected lineups stay populated
BATTER_LINEUP_MIN_PA = 8
# FanGraphs splits export page size (500 truncates regulars on deep rosters)
FG_BATTER_PAGE_SIZE = 2000
# Date-window leaderboards: lower PA floor (7-day windows rarely reach 50 PA)
BATTER_WINDOW_MIN_PA = {
    "overall": 50,
    "recent": 25,
    "l14": 15,
    "l7": 8,
}
BATTER_RECENT_DAYS = 30
BATTER_TREND_RISING_MIN = 3.0
BATTER_TREND_FALLING_MAX = -3.0

# FanGraphs splits-leaderboard splitArr codes (batters)
BATTER_SPLIT_ARR = {
    "vs_RHP": "2",
    "vs_LHP": "1",
    "home": "5",
    "away": "6",
    "vs_SP": "24",
    "vs_RP": "25",
}

# Alternate splitArr codes if primary home/away export is empty
BATTER_SPLIT_ARR_FALLBACK = {
    "home": ["5", "54", "59", "52", "60", "4"],
    "away": ["6", "55", "72", "53", "61", "3"],
}

# Reliever FIP (2026 season constant)
FIP_CONSTANT = 3.10
FIP_FORMULA = "((13 x HR) + (3 x BB) - (2 x K)) / IP + FIP_constant"

BATTER_STAT_GROUPS = {
    "standard": 2,
    "advanced": 3,
    "plate_disc": 4,
    "batted_ball": 5,
}

# Reliever profile dashboard thresholds
RELIEVER_WINDOW_HOT_COLD_GAP = 8.0
RELIEVER_LEVERAGE_ERA_GAP = 1.5
RELIEVER_PLATOON_OSI_GAP = 8.0
RELIEVER_INHERITED_SCORED_PCT_WARN = 35.0
RELIEVER_HOME_AWAY_OSI_GAP = 10.0
RELIEVER_RECENT_APPS = 10

# Team profile dashboard
TEAM_PLATOON_OSI_GAP = 8.0
TEAM_HOME_AWAY_OSI_GAP = 10.0
TEAM_WINDOW_HOT_COLD_GAP = 8.0
TEAM_TOP_BATTERS_N = 5
TEAM_TOP_SP_N = 3


def park_factor_for_team(team: str) -> float:
    """Return park factor for team abbreviation; warn and use 1.0 if unknown."""
    key = str(team).strip().upper()
    pf = PARK_FACTORS.get(key)
    if pf is None:
        print(f"WARNING: Park factor not found for {key}, using 1.0")
        return 1.0
    return pf

# ── Metric formula weights (single source of truth) ───────────────────────────

ABQ_WEIGHTS = {
    "discipline": 0.30,
    "contact_quality": 0.35,
    "pitch_pressure": 0.20,
    "k_avoidance": 0.15,
}

ABQ_DISCIPLINE_WEIGHTS = {
    "bb_pct": 0.55,
    "chase_inv": 0.45,
}

ABQ_CONTACT_WEIGHTS = {
    "zcon": 0.55,
    "ocon": 0.45,
}

RCV_WEIGHTS = {
    "wrc_plus": 0.35,
    "barrel_pct": 0.32,
    "iso": 0.20,
    "hard_hit": 0.13,
}

OBR_WEIGHTS = {
    "xwoba": 0.65,
    "bb_pct": 0.35,
}

# xwOBA source blend: 0.0 = season-level Savant xwOBA only, 1.0 = handedness-split only.
# Calibration audit (scripts/calibration_audit.py) showed split xwOBA is pure noise at
# current sample sizes — it correlates -0.12 with team runs/game (and -0.38 with wOBA),
# while season xwOBA correlates +0.61. Blending in ANY split weight monotonically degrades
# the signal (OBR~runs: 0.0->+0.67, 0.5->+0.35, 1.0->+0.14). Keep at 0.0 until split
# samples mature enough for PA-based shrinkage; raise toward ~0.15 only once they do.
XWOBA_SPLIT_WEIGHT = 0.0

# Savant team abbreviations -> the FanGraphs abbreviations used across the metric files,
# so the split-xwOBA merge actually joins all 30 teams (KC/SF etc. otherwise drop out).
SAVANT_TEAM_ALIASES = {
    "KC": "KCR", "SF": "SFG", "TB": "TBR", "SD": "SDP",
    "WSH": "WSN", "CWS": "CHW", "AZ": "ARI",
}

# Rebalanced 2026-06 after the xwOBA fix + validity audit (scripts/osi_reweight_sweep.py).
# Each component's validated correlation with outcomes (30 teams, this season):
#   OBR  runs +0.66 / win +0.64  -- strongest, was underweighted at 0.20
#   RCV  runs +0.46 / win +0.49  -- power/damage, core to run scoring
#   ABQ  runs +0.16 / win +0.44  -- plate discipline/process: weak for runs BY DESIGN
#                                    but a real win signal; trimmed from 0.37 so it no
#                                    longer dominates an offensive-output index.
# Net: OSI~runs 0.55->0.61, OSI~win 0.65->0.66. (Avoided the in-sample win optimum
# 0.10/0.45/0.40 which overfits ABQ against its near-zero runs signal.)
OSI_WEIGHTS = {
    "rcv": 0.35,
    "abq": 0.25,
    "obr": 0.40,
}

PROJ_OSI_REG_SCALE = 450
PROJ_OSI_REG_CLIP = 8
REG_SCALE = PROJ_OSI_REG_SCALE
REG_CLIP = PROJ_OSI_REG_CLIP

# Re-evaluated 2026-06 (scripts/pitching_validity.py). The old K/BB/HR-only score (FIP-style)
# correlated -0.72 with runs allowed/game and +0.48 with win% -- but reweighting within those
# three barely moved it (they're collinear). Folding in WHIP (baserunner/hit suppression that
# K/BB/HR ignore) lifts it to -0.78 RA / +0.56 win, robustly across weightings. We stop short
# of ERA-chasing: ERA's 0.87 is near-tautological with runs allowed, not predictive lift.
PITCHING_WEIGHTS = {
    "k_pct": 0.30,
    "inv_bb_pct": 0.20,
    "inv_hr9": 0.20,
    "inv_whip": 0.30,
}

# Combined staff pitching score (dashboard -- SP + bullpen)
SP_WEIGHT = 0.70
BULLPEN_WEIGHT = 0.30
COMBINED_PITCHING_WEIGHTS = {
    "sp": SP_WEIGHT,
    "bullpen": BULLPEN_WEIGHT,
}

OOR_WEIGHTS = {
    "hvr": 0.55,
    "hvl": 0.45,
}

PALS_WEIGHTS = {
    "ba_plus": 0.50,
    "ptf_plus": 0.50,
}

# ── Research terminal / dashboard ───────────────────────────────────────────

TIME_WINDOWS = ("YTD", "L30", "L14", "L7")
HAND_OPTIONS = ("R", "L", "both")

METRIC_CHOICES = [
    "ABQ",
    "RCV",
    "OBR",
    "OSI",
    "projOSI",
    "OOR",
    "HvP",
    "HvR",
    "HvL",
    "PALS",
    "PitchScore",
    "PP-Gap",
    "DF-Gap",
    "reg_signal",
]

SIGNAL_NAMES = [
    "K% vs OBR",
    "BB% vs ABQ",
    "HR/9 vs RCV",
    "OSI vs Pitching Score",
    "PALS + projOSI",
    "OBR + BB%",
    "ABQ platoon",
    "RCV archetype",
    "Schedule context",
]

ARCHETYPE_TIER_CUTOFFS = {
    "high_min": 72.0,
    "mid_min": 58.0,
    "mid_max": 72.0,
    "low_max": 58.0,
}

ARCHETYPE_HIGH_MIN = ARCHETYPE_TIER_CUTOFFS["high_min"]
ARCHETYPE_LOW_MAX = ARCHETYPE_TIER_CUTOFFS["low_max"]

ARCHETYPE_NAMES = {
    "High/High": {
        "label": "Elite Engine",
        "description": "Top-tier run creation with a strong on-base floor -- complete offensive profile.",
    },
    "High/Mid": {
        "label": "Power Leverage",
        "description": "Big damage output with average table-setting -- slug-first lineup shape.",
    },
    "High/Low": {
        "label": "Boom-or-Bust",
        "description": "High damage ceiling but thin on-base support -- volatile run-scoring bursts.",
    },
    "Mid/High": {
        "label": "Table Setter Plus",
        "description": "Strong on-base process with moderate power -- grind-and-advance profile.",
    },
    "Mid/Mid": {
        "label": "Balanced",
        "description": "No extreme tilt on RCV or OBR -- league-average offensive shape.",
    },
    "Mid/Low": {
        "label": "Contact Floor",
        "description": "Modest contact quality with weak on-base -- limited run-scoring paths.",
    },
    "Low/High": {
        "label": "OBP First",
        "description": "Gets on base without big damage -- small-ball and walk-heavy lean.",
    },
    "Low/Mid": {
        "label": "Glove Line",
        "description": "Below-average damage and average OB -- defensive-value lineup profile.",
    },
    "Low/Low": {
        "label": "Cold Profile",
        "description": "Weak damage and weak on-base -- lowest offensive ceiling archetype.",
    },
}

OSI_TIERS = (
    (85, "Elite"),
    (75, "High Level"),
    (65, "Dangerous"),
    (50, "Inconsistent"),
    (0, "Weak"),
)

PITCHING_TIERS = (
    (85, "Ace"),
    (70, "Solid"),
    (55, "Average"),
    (0, "Volatile"),
)

CONVERGENCE_THRESHOLD = 4
CONVERGENCE_PLAY_MIN_WEIGHT = CONVERGENCE_THRESHOLD
CONVERGENCE_PP_GAP_WEIGHT = 2
CONVERGENCE_DEFAULT_WEIGHT = 1

# Opponent lineup quality tiers (Pitcher Intelligence -- game logs / splits)
OPPONENT_TIER_HIGH_MIN = 65.0   # High if strictly above
OPPONENT_TIER_MID_MIN = 50.0    # Mid if 50-65 inclusive
OPPONENT_TIER_MID_MAX = 65.0

OPPONENT_TIER_CUTOFFS = {
    "high_min": OPPONENT_TIER_HIGH_MIN,
    "mid_min": OPPONENT_TIER_MID_MIN,
    "mid_max": OPPONENT_TIER_MID_MAX,
}

SHEET_TABS = {
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
    "pitch_mix_pitcher": "Pitch_Mix_Pitcher",
    "pitch_mix_pitcher_l14": "Pitch_Mix_Pitcher_L14",
    "pitch_mix_batter": "Pitch_Mix_Batter",
    "pitch_mix_batter_l14": "Pitch_Mix_Batter_L14",
    "pitch_mix_team_pitching": "Pitch_Mix_Team_Pitching",
    "pitch_mix_team_pitching_l14": "Pitch_Mix_Team_Pitching_L14",
    "pitch_mix_team_batting": "Pitch_Mix_Team_Batting",
    "pitch_mix_team_batting_l14": "Pitch_Mix_Team_Batting_L14",
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
    "batter_savant_rates": "Batter_Savant_Rates",
    "batter_prop_hitrates": "Batter_Prop_HitRates",
    "team_profiles": "Team_Profiles",
    "team_results": "Team_Results",
    "team_l10_sp_hand": "Team_L10_SP_Hand",
    "team_l10_sp_hand_games": "Team_L10_SP_Games",
}

TEAM_MAP = {
    "Arizona Diamondbacks": "ARI",
    "Atlanta Braves": "ATL",
    "Baltimore Orioles": "BAL",
    "Boston Red Sox": "BOS",
    "Chicago Cubs": "CHC",
    "Chicago White Sox": "CHW",
    "Cincinnati Reds": "CIN",
    "Cleveland Guardians": "CLE",
    "Colorado Rockies": "COL",
    "Detroit Tigers": "DET",
    "Houston Astros": "HOU",
    "Kansas City Royals": "KCR",
    "Los Angeles Angels": "LAA",
    "Los Angeles Dodgers": "LAD",
    "Miami Marlins": "MIA",
    "Milwaukee Brewers": "MIL",
    "Minnesota Twins": "MIN",
    "New York Mets": "NYM",
    "New York Yankees": "NYY",
    "Athletics": "ATH",
    "Philadelphia Phillies": "PHI",
    "Pittsburgh Pirates": "PIT",
    "San Diego Padres": "SDP",
    "San Francisco Giants": "SFG",
    "Seattle Mariners": "SEA",
    "St. Louis Cardinals": "STL",
    "Tampa Bay Rays": "TBR",
    "Texas Rangers": "TEX",
    "Toronto Blue Jays": "TOR",
    "Washington Nationals": "WSN",
}

TEAM_MAP_BY_ID = {
    133: "ATH",
    134: "PIT",
    135: "SDP",
    136: "SEA",
    137: "SFG",
    138: "STL",
    139: "TBR",
    140: "TEX",
    141: "TOR",
    142: "MIN",
    143: "PHI",
    144: "ATL",
    145: "CHW",
    146: "MIA",
    147: "NYY",
    158: "MIL",
    108: "LAA",
    109: "ARI",
    110: "BAL",
    111: "BOS",
    112: "CHC",
    113: "CIN",
    114: "CLE",
    115: "COL",
    116: "DET",
    117: "HOU",
    118: "KCR",
    119: "LAD",
    120: "WSN",
    121: "NYM",
}

CLI_DEFAULTS = {
    "window": "YTD",
    "hand": "both",
    "verbose": 1,
    "convergence_threshold": CONVERGENCE_THRESHOLD,
}

# ── Scraper settings ─────────────────────────────────────────────────────────

SEASON_START = f"{CURRENT_SEASON}-03-01"
SEASON_END = f"{CURRENT_SEASON}-11-01"


def _resolve_chrome_path() -> str:
    env_path = os.getenv("CHROME_PATH")
    if env_path and Path(env_path).is_file():
        return env_path
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        # macOS
        Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        Path.home() / "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        # Linux
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/google-chrome-stable"),
        Path("/usr/bin/chromium-browser"),
        Path("/usr/bin/chromium"),
        Path("/snap/bin/chromium"),
    ]
    for path in candidates:
        if path.is_file():
            return str(path)
    return str(candidates[1])


CHROME_PATH = _resolve_chrome_path()
CHROME_VERSION = 149  # Chrome major version for undetected-chromedriver version_main

PAGE_DELAY = 20
TAB_DELAY = 10
COOLDOWN = 45

# ── Cross-metric signal thresholds (compute_signals.py) ─────────────────────

SIGNAL_1_PITCHER_K_PCT_MAX = 20.0
SIGNAL_1_LINEUP_OBR_MIN = 65.0

SIGNAL_2_PITCHER_BB_PCT_HIGH = 8.5
SIGNAL_2_PITCHER_BB_PCT_LOW = 6.0
SIGNAL_2_LINEUP_ABQ_WALK_GAME_MIN = 70.0
SIGNAL_2_LINEUP_ABQ_CHESS_MIN = 72.0

SIGNAL_3_PITCHER_HR9_MIN = 1.25
SIGNAL_3_LINEUP_RCV_MIN = 72.0

SIGNAL_4_OSI_PITCH_GAP_MIN = 10.0

SIGNAL_5_OSI_PALS_GAP_MAX = 4.0
SIGNAL_5_PP_GAP_MIN = 3.0

SIGNAL_6_OBR_HIGH_MIN = 68.0
SIGNAL_6_OBR_LOW_MAX = 55.0
SIGNAL_6_BB_PITCHER_HIGH_MIN = 8.5
SIGNAL_6_BB_PITCHER_LOW_MAX = 6.0

SIGNAL_7_ABQ_PLATOON_GAP_MIN = 8.0

SIGNAL_8_RCV_HIGH = ARCHETYPE_HIGH_MIN
SIGNAL_8_RCV_LOW = ARCHETYPE_LOW_MAX
SIGNAL_8_OBR_HIGH = ARCHETYPE_HIGH_MIN
SIGNAL_8_OBR_LOW = ARCHETYPE_LOW_MAX

SIGNAL_9_OOR_DELTA_MIN = 5.0

# Dashboard pages -- canonical nav labels and URL patterns
DASHBOARD_PAGES = {
    "main": {
        "file": "chase_analytics_mlb_oem_v7.html",
        "label": "Main Dashboard",
        "url": "chase_analytics_mlb_oem_v7.html",
        "params": None,
    },
    "matchup_sheet": {
        "file": "matchup_sheet.html",
        "label": "Matchup Sheet",
        "url": "matchup_sheet.html",
        "params": None,
    },
    "batter_profile": {
        "file": "batter_profile.html",
        "label": "Batter Profile",
        "url": "batter_profile.html",
        "params": ("player",),
    },
    "pitcher_profile": {
        "file": "pitcher_profile.html",
        "label": "Pitcher Profile",
        "url": "pitcher_profile.html",
        "params": ("pitcher",),
    },
    "bullpen_report": {
        "file": "bullpen_report.html",
        "label": "Bullpen Profile",
        "url": "bullpen_report.html",
        "params": None,
    },
    "team_profile": {
        "file": "team_profile.html",
        "label": "Team Profile",
        "url": "team_profile.html",
        "params": ("team",),
    },
    "glossary": {
        "file": "glossary.html",
        "label": "Glossary",
        "url": "glossary.html",
        "params": None,
    },
}
