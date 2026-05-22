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
