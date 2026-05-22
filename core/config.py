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

# ── Metric Formula Weights ──────────────────────────────────────────────────

ABQ_WEIGHTS = {
    "discipline":     0.32,  # Chase% inverted
    "contact_stab":   0.32,  # Z-Con%
    "pitch_pressure": 0.24,  # SwStr% inverted
    "k_avoidance":    0.12,  # K% inverted
}

RCV_WEIGHTS = {
    "wrc_plus":   0.35,
    "barrel_pct": 0.30,
    "iso":        0.20,
    "hard_hit":   0.15,
}

OBR_WEIGHTS = {
    "obp":     0.45,
    "bb_pct":  0.25,
    "k_pct":   0.20,  # inverted
    "avg":     0.10,
}

OSI_WEIGHTS = {
    "rcv": 0.45,
    "abq": 0.35,
    "obr": 0.20,
}

# ── Scraper Settings ─────────────────────────────────────────────────────────

SEASON_START = "2025-03-01"
SEASON_END   = "2025-11-01"


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

# Delay between page loads in seconds
PAGE_DELAY   = 20
TAB_DELAY    = 10
COOLDOWN     = 45

# ── Cross-metric signal thresholds (compute_signals.py) ─────────────────────

# Signal 1 — K% vs OBR
SIGNAL_1_PITCHER_K_PCT_MAX = 20.0
SIGNAL_1_LINEUP_OBR_MIN = 65.0

# Signal 2 — BB% vs ABQ
SIGNAL_2_PITCHER_BB_PCT_HIGH = 8.5
SIGNAL_2_PITCHER_BB_PCT_LOW = 6.0
SIGNAL_2_LINEUP_ABQ_WALK_GAME_MIN = 70.0
SIGNAL_2_LINEUP_ABQ_CHESS_MIN = 72.0

# Signal 3 — HR/9 vs RCV
SIGNAL_3_PITCHER_HR9_MIN = 1.25
SIGNAL_3_LINEUP_RCV_MIN = 72.0

# Signal 4 — OSI vs Pitching Score
SIGNAL_4_OSI_PITCH_GAP_MIN = 10.0

# Signal 5 — PALS + projOSI (also gates PP-Gap convergence weight)
SIGNAL_5_OSI_PALS_GAP_MAX = 4.0
SIGNAL_5_PP_GAP_MIN = 3.0

# Signal 6 — OBR + BB%
SIGNAL_6_OBR_HIGH_MIN = 68.0
SIGNAL_6_OBR_LOW_MAX = 55.0
SIGNAL_6_BB_PITCHER_HIGH_MIN = 8.5
SIGNAL_6_BB_PITCHER_LOW_MAX = 6.0

# Signal 7 — ABQ platoon gap + handedness
SIGNAL_7_ABQ_PLATOON_GAP_MIN = 8.0

# Signal 8 — RCV archetype tiers (High / Mid / Low on RCV × OBR grid)
SIGNAL_8_RCV_HIGH = 58.0
SIGNAL_8_RCV_LOW = 42.0
SIGNAL_8_OBR_HIGH = 58.0
SIGNAL_8_OBR_LOW = 42.0

# Signal 9 — Schedule context (opponent OOR vs season HvP baseline)
SIGNAL_9_OOR_DELTA_MIN = 5.0

# Convergence
CONVERGENCE_PLAY_MIN_WEIGHT = 4
CONVERGENCE_PP_GAP_WEIGHT = 2
CONVERGENCE_DEFAULT_WEIGHT = 1
