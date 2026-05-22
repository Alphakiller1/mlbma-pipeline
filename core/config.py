import os
from pathlib import Path

# ── Project paths ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
CREDS_FILE = PROJECT_ROOT / "google_credentials.json"
ENV_FILE = PROJECT_ROOT / ".env"

SHEET_ID = "1D28pC1lqMbsCcTBP67WhJPzYHn2UdtveMEv6RsUSczk"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

CURRENT_SEASON = 2026
PARK_FACTOR_DEFAULT = 1.0

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

OSI_WEIGHTS = {
    "rcv": 0.43,
    "abq": 0.37,
    "obr": 0.20,
}

PROJ_OSI_REG_SCALE = 450
PROJ_OSI_REG_CLIP = 8

PITCHING_WEIGHTS = {
    "k_pct": 0.40,
    "inv_bb_pct": 0.35,
    "inv_hr9": 0.25,
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
        "description": "Top-tier run creation with a strong on-base floor — complete offensive profile.",
    },
    "High/Mid": {
        "label": "Power Leverage",
        "description": "Big damage output with average table-setting — slug-first lineup shape.",
    },
    "High/Low": {
        "label": "Boom-or-Bust",
        "description": "High damage ceiling but thin on-base support — volatile run-scoring bursts.",
    },
    "Mid/High": {
        "label": "Table Setter Plus",
        "description": "Strong on-base process with moderate power — grind-and-advance profile.",
    },
    "Mid/Mid": {
        "label": "Balanced",
        "description": "No extreme tilt on RCV or OBR — league-average offensive shape.",
    },
    "Mid/Low": {
        "label": "Contact Floor",
        "description": "Modest contact quality with weak on-base — limited run-scoring paths.",
    },
    "Low/High": {
        "label": "OBP First",
        "description": "Gets on base without big damage — small-ball and walk-heavy lean.",
    },
    "Low/Mid": {
        "label": "Glove Line",
        "description": "Below-average damage and average OB — defensive-value lineup profile.",
    },
    "Low/Low": {
        "label": "Cold Profile",
        "description": "Weak damage and weak on-base — lowest offensive ceiling archetype.",
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

# Opponent lineup quality tiers (Pitcher Intelligence — game logs / splits)
OPPONENT_TIER_HIGH_MIN = 65.0   # High if strictly above
OPPONENT_TIER_MID_MIN = 50.0    # Mid if 50–65 inclusive
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
    "bullpen_unit": "Bullpen_Unit",
    "bullpen_individual": "Bullpen_Individual",
    "reliever_log": "Reliever_Log",
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
    ]
    for path in candidates:
        if path.is_file():
            return str(path)
    return str(candidates[1])


CHROME_PATH = _resolve_chrome_path()

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
