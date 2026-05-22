"""Shared normalization and data-loading helpers for metric modules."""

import os

import pandas as pd

from core.config import DATA_DIR


def clean_pct(series):
    if series.dtype == object:
        return series.str.replace("%", "").astype(float) / 100
    return series


def normalize(series):
    mn, mx = series.min(), series.max()
    if mx == mn:
        return pd.Series([50.0] * len(series), index=series.index)
    return ((series - mn) / (mx - mn)) * 100


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
    ]
    for f in files:
        key = f.replace(".csv", "")
        df = load(f)
        if df is not None:
            data[key] = df
            print(f"  Loaded {f}: {len(df)} rows")
    return data
