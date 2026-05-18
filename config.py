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
CHROME_PATH  = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DATA_DIR     = r"C:\Users\chase\mlbma_pipeline\data"

# Delay between page loads in seconds
PAGE_DELAY   = 20
TAB_DELAY    = 10
COOLDOWN     = 45