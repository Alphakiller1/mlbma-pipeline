"""Shared normalization and data-loading helpers for metric modules."""

import os

import pandas as pd

from core.config import DATA_DIR


def parse_ip(ip_val) -> float:
    """Convert MLB innings-pitched string (e.g. 6.1) to decimal innings."""
    if ip_val is None or (isinstance(ip_val, float) and pd.isna(ip_val)):
        return 0.0
    text = str(ip_val).strip()
    if not text:
        return 0.0
    if "." in text:
        whole, frac = text.split(".", 1)
        outs = int(whole) * 3 + int(frac[:1] or 0)
    else:
        outs = int(float(text)) * 3
    return outs / 3.0


def clean_pct(series):
    if series.dtype == object:
        return series.str.replace("%", "").astype(float) / 100
    return series


def normalize(series):
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    return ((series - mn) / (mx - mn)) * 100


def normalize_pool(series: pd.Series) -> pd.Series:
    """Pool-normalize a series to 0-100 (used by batter profile metrics)."""
    if not isinstance(series, pd.Series):
        if isinstance(series, (int, float)) and not isinstance(series, bool):
            return pd.Series([50.0])
        series = pd.Series(series)
    mn, mx = series.min(), series.max()
    if pd.isna(mn) or pd.isna(mx) or mx == mn:
        return pd.Series(50.0, index=series.index)
    return normalize(series)


def invert(series):
    return 100 - normalize(series)


def load(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        print(f"  WARNING: {filename} not found")
        return None
    return pd.read_csv(path)


def load_all():
    print("Loading data...")
    data = {}
    files = [
        "vs_RHP_standard.csv",
        "vs_RHP_batted_ball.csv",
        "vs_LHP_standard.csv",
        "vs_LHP_batted_ball.csv",
        "savant_team_leaderboard.csv",
        "savant_vs_RHP.csv",
        "savant_vs_LHP.csv",
        "sp_standard.csv",
        "sp_l14.csv",
    ]
    for f in files:
        key = f.replace(".csv", "")
        df = load(f)
        if df is not None:
            data[key] = df
            print(f"  Loaded {f}: {len(df)} rows")
    return data
