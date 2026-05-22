"""Scrape 2026 batter split leaderboards from FanGraphs for registry batters."""

from __future__ import annotations

import os
import time
from datetime import datetime, timedelta

import pandas as pd

from core.config import (
    BATTER_MIN_PA,
    BATTER_RECENT_DAYS,
    BATTER_SPLIT_ARR,
    BATTER_STAT_GROUPS,
    CHROME_VERSION,
    CURRENT_SEASON,
    DATA_DIR,
    SEASON_END,
    SEASON_START,
)
from scrapers.fangraphs_session import get_driver, get_export_csv, login, safe_quit_driver

PAGE_DELAY = 20
COOLDOWN = 15

COLUMN_ALIASES = {
    "O-Swing%": "Chase%",
    "O-Swing": "Chase%",
    "Z-Contact%": "ZCon%",
    "O-Contact%": "OCon%",
    "Hard%": "HardHit%",
    "Hard Hit%": "HardHit%",
    "HardHit%": "HardHit%",
}

OUTPUT_STATS = [
    "PA", "AVG", "OBP", "SLG", "BB%", "K%", "wOBA", "xwOBA", "wRC+",
    "ISO", "BABIP", "Chase%", "ZCon%", "OCon%", "SwStr%", "Barrel%", "HardHit%",
]


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.rename(columns=COLUMN_ALIASES)
    if "Name" not in out.columns:
        for c in out.columns:
            if str(c).lower() == "name":
                out = out.rename(columns={c: "Name"})
                break
    return out


def _merge_stat_frames(frames: list[pd.DataFrame]) -> pd.DataFrame | None:
    merged = None
    key = "Name"
    for frame in frames:
        if frame is None or frame.empty:
            continue
        frame = _normalize_columns(frame)
        if key not in frame.columns:
            continue
        cols = [c for c in frame.columns if c == key or c not in (merged.columns if merged is not None else [])]
        chunk = frame[cols].copy()
        if merged is None:
            merged = chunk
        else:
            merged = merged.merge(chunk, on=key, how="outer", suffixes=("", "_dup"))
            merged = merged[[c for c in merged.columns if not c.endswith("_dup")]]
    return merged


def _leaderboard_url(
    split_arr: str,
    statgroup: int,
    start_date: str,
    end_date: str,
    min_pa: int,
) -> str:
    split_param = f"splitArr={split_arr}&" if split_arr else ""
    return (
        "https://www.fangraphs.com/leaders/splits-leaderboards?"
        f"{split_param}splitArrPitcher=&position=B&autoPt=false&byTeam=false"
        f"&start={start_date}&end={end_date}"
        f"&statType=player&statgroup={statgroup}"
        f"&minPAf={min_pa}&pageSize=500"
        f"&filter=PA%7Cgt%7C{min_pa}"
    )


def scrape_batter_split(
    driver,
    split_key: str,
    split_arr: str,
    start_date: str,
    end_date: str,
    min_pa: int,
) -> pd.DataFrame | None:
    print(f"  Scraping batter split {split_key} ({start_date} to {end_date})...")
    frames = []
    for sg_name, sg_num in BATTER_STAT_GROUPS.items():
        url = _leaderboard_url(split_arr, sg_num, start_date, end_date, min_pa)
        print(f"    Loading {split_key} / {sg_name}...")
        driver.get(url)
        time.sleep(PAGE_DELAY)
        df = get_export_csv(driver)
        if df is not None:
            print(f"      OK {len(df)} rows")
            frames.append(df)
        else:
            print(f"      FAIL no export for {sg_name}")
        time.sleep(COOLDOWN)

    merged = _merge_stat_frames(frames)
    if merged is None:
        return None
    merged["split_type"] = split_key
    return merged


def filter_registry_batters(df: pd.DataFrame, registry: pd.DataFrame) -> pd.DataFrame:
    """Keep rows matching registry batters (non SP/RP) with PA >= minimum."""
    batters = registry[~registry["position_type"].isin(["SP", "RP"])].copy()
    names = set(batters["full_name"].str.strip())
    name_col = "Name" if "Name" in df.columns else df.columns[0]
    out = df[df[name_col].isin(names)].copy()
    if "PA" in out.columns:
        out["PA"] = pd.to_numeric(out["PA"], errors="coerce")
        out = out[out["PA"] >= BATTER_MIN_PA]
    out = out.merge(
        batters[["full_name", "team_abbr", "player_id", "bats", "throws"]],
        left_on=name_col,
        right_on="full_name",
        how="left",
    )
    if "team_abbr" in out.columns:
        out["Tm"] = out["team_abbr"]
    return out


def save_split(df: pd.DataFrame | None, filename: str) -> int:
    path = os.path.join(DATA_DIR, filename)
    if df is None or df.empty:
        pd.DataFrame(columns=["Name"] + OUTPUT_STATS).to_csv(path, index=False)
        print(f"  WARNING: wrote empty {filename}")
        return 0
    keep = [c for c in df.columns if c in OUTPUT_STATS or c in (
        "Name", "Tm", "Team", "player_id", "full_name", "bats", "throws", "split_type",
    )]
    df[keep].to_csv(path, index=False)
    print(f"  Saved {len(df)} rows -> {path}")
    return len(df)


def run():
    registry_path = DATA_DIR / "player_registry.csv"
    if not registry_path.exists():
        print("  WARNING: player_registry.csv not found -- run scrapers.scrape_player_registry first")
        return
    registry = pd.read_csv(registry_path)
    batter_count = len(registry[~registry["position_type"].isin(["SP", "RP"])])
    print(f"  Registry batters to cover: {batter_count}")

    recent_start = (datetime.now() - timedelta(days=BATTER_RECENT_DAYS)).strftime("%Y-%m-%d")
    recent_end = datetime.now().strftime("%Y-%m-%d")

    print(f"Batter splits scrape (Chrome version_main={CHROME_VERSION})")
    driver = get_driver()
    try:
        if not login(driver):
            print("FanGraphs login failed")
            return
        print("FanGraphs login successful.")

        outputs = {
            "batter_splits_rhp.csv": ("vs_RHP", BATTER_SPLIT_ARR["vs_RHP"], SEASON_START, SEASON_END),
            "batter_splits_lhp.csv": ("vs_LHP", BATTER_SPLIT_ARR["vs_LHP"], SEASON_START, SEASON_END),
            "batter_splits_home.csv": ("home", BATTER_SPLIT_ARR["home"], SEASON_START, SEASON_END),
            "batter_splits_away.csv": ("away", BATTER_SPLIT_ARR["away"], SEASON_START, SEASON_END),
            "batter_splits_vsSP.csv": ("vs_SP", BATTER_SPLIT_ARR["vs_SP"], SEASON_START, SEASON_END),
            "batter_splits_vsRP.csv": ("vs_RP", BATTER_SPLIT_ARR["vs_RP"], SEASON_START, SEASON_END),
        }

        for fname, (key, arr, start, end) in outputs.items():
            raw = scrape_batter_split(driver, key, arr, start, end, BATTER_MIN_PA)
            filtered = filter_registry_batters(raw, registry) if raw is not None else None
            save_split(filtered, fname)
            print("  Cooling down 30s...")
            time.sleep(30)

        # Overall + recent windows for trend comparison (used by compute_batter_profile)
        overall = scrape_batter_split(driver, "overall", "", SEASON_START, SEASON_END, BATTER_MIN_PA)
        save_split(
            filter_registry_batters(overall, registry) if overall is not None else None,
            "batter_splits_overall.csv",
        )
        time.sleep(30)

        recent = scrape_batter_split(driver, "recent", "", recent_start, recent_end, BATTER_MIN_PA)
        save_split(
            filter_registry_batters(recent, registry) if recent is not None else None,
            "batter_splits_recent.csv",
        )
    finally:
        safe_quit_driver(driver)

    print("Batter splits scrape complete.")


if __name__ == "__main__":
    run()
