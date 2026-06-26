"""Build pitch-mix datasets from Baseball Savant pitch-level Statcast data."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from io import StringIO
import pandas as pd

from core.http_retry import get_with_retry

from core.config import CURRENT_SEASON, DATA_DIR, SEASON_END, SEASON_START
from scrapers.scrape_player_registry import build_registry

STATCAST_CSV_URL = "https://baseballsavant.mlb.com/statcast_search/csv"
WINDOW_RECENT_DAYS = 14
STATCAST_ROW_CAP = 25000
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
}

RAW_COLUMNS = [
    "pitch_type",
    "pitch_name",
    "player_name",
    "batter",
    "pitcher",
    "stand",
    "p_throws",
    "home_team",
    "away_team",
    "inning_topbot",
    "description",
    "zone",
    "release_speed",
    "release_spin_rate",
    "pfx_x",
    "pfx_z",
    "estimated_woba_using_speedangle",
    "launch_speed",
    "events",
]

HIT_EVENTS = {"single", "double", "triple", "home_run"}
AB_EVENTS = HIT_EVENTS | {
    "field_out",
    "force_out",
    "grounded_into_double_play",
    "fielders_choice",
    "sac_fly",
    "sac_bunt",
    "strikeout",
    "strikeout_double_play",
    "double_play",
    "triple_play",
    "other_out",
    "field_error",
}

SWING_DESCRIPTIONS = {
    "swinging_strike",
    "swinging_strike_blocked",
    "foul",
    "foul_tip",
    "foul_bunt",
    "missed_bunt",
    "hit_into_play",
    "hit_into_play_no_out",
    "hit_into_play_score",
}

WHIFF_DESCRIPTIONS = {
    "swinging_strike",
    "swinging_strike_blocked",
    "missed_bunt",
}

CALLED_STRIKE_DESCRIPTIONS = {"called_strike"}
SAVANT_TEAM_FIX = {"AZ": "ARI", "CWS": "CHW", "KC": "KCR", "SD": "SDP", "SF": "SFG", "TB": "TBR", "WSH": "WSN", "OAK": "ATH"}


def _today_cap() -> str:
    cap = min(date.today(), datetime.strptime(SEASON_END, "%Y-%m-%d").date())
    return cap.strftime("%Y-%m-%d")


def _date_windows(start_date: str, end_date: str) -> list[tuple[str, str]]:
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    windows: list[tuple[str, str]] = []
    cur = start
    while cur <= end:
        nxt = min((cur.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1), end)
        windows.append((cur.strftime("%Y-%m-%d"), nxt.strftime("%Y-%m-%d")))
        cur = nxt + timedelta(days=1)
    return windows


def _read_registry() -> pd.DataFrame:
    path = DATA_DIR / "player_registry.csv"
    if path.exists():
        df = pd.read_csv(path)
    else:
        print("Player registry missing; building registry for pitch-mix joins...")
        df = build_registry(CURRENT_SEASON)
        df.to_csv(path, index=False)
    if df.empty:
        return pd.DataFrame(columns=["player_id", "full_name", "team_abbr", "bats", "throws"])
    return df[["player_id", "full_name", "team_abbr", "bats", "throws"]].copy()


def _fetch_window(start_date: str, end_date: str) -> pd.DataFrame:
    start_param = (datetime.strptime(start_date, "%Y-%m-%d").date() - timedelta(days=1)).strftime("%Y-%m-%d")
    end_param = (datetime.strptime(end_date, "%Y-%m-%d").date() + timedelta(days=1)).strftime("%Y-%m-%d")
    params = {
        "all": "true",
        "hfSea": f"{CURRENT_SEASON}|",
        "hfGT": "R|",
        "player_type": "pitcher",
        "group_by": "name",
        "sort_col": "pitches",
        "sort_order": "desc",
        "min_pitches": "0",
        "min_results": "0",
        "min_pas": "0",
        "game_date_gt": start_param,
        "game_date_lt": end_param,
        "type": "details",
    }
    print(f"Fetching Statcast pitch data {start_date} to {end_date}...")
    r = get_with_retry(STATCAST_CSV_URL, params=params, headers=HEADERS, timeout=180, retries=4)
    df = pd.read_csv(StringIO(r.text), usecols=lambda c: c in RAW_COLUMNS, low_memory=False)
    print(f"  Rows: {len(df)}")
    return df


def _fetch_range_recursive(start_date: str, end_date: str) -> list[pd.DataFrame]:
    df = _fetch_window(start_date, end_date)
    start = datetime.strptime(start_date, "%Y-%m-%d").date()
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    if len(df) < STATCAST_ROW_CAP or start >= end:
        if len(df) >= STATCAST_ROW_CAP and start >= end:
            print(f"  WARNING: {start_date} hit the {STATCAST_ROW_CAP} row cap on a single day.")
        return [df]

    mid = start + (end - start) // 2
    left_end = mid.strftime("%Y-%m-%d")
    right_start = (mid + timedelta(days=1)).strftime("%Y-%m-%d")
    print(f"  Hit {STATCAST_ROW_CAP} row cap; splitting {start_date} to {end_date}...")
    return _fetch_range_recursive(start_date, left_end) + _fetch_range_recursive(right_start, end_date)


def _load_raw(start_date: str, end_date: str) -> pd.DataFrame:
    parts: list[pd.DataFrame] = []
    for win_start, win_end in _date_windows(start_date, end_date):
        parts.extend(_fetch_range_recursive(win_start, win_end))
    if not parts:
        return pd.DataFrame(columns=RAW_COLUMNS)
    df = pd.concat(parts, ignore_index=True)
    if df.empty:
        return df

    df["pitch_name"] = df["pitch_name"].fillna(df["pitch_type"]).fillna("Unknown")
    df["pitch_type"] = df["pitch_type"].fillna("UNK")
    df["home_team"] = df["home_team"].astype(str).str.upper().replace(SAVANT_TEAM_FIX)
    df["away_team"] = df["away_team"].astype(str).str.upper().replace(SAVANT_TEAM_FIX)
    df["batting_team"] = df.apply(
        lambda r: r["away_team"] if str(r.get("inning_topbot", "")).lower() == "top" else r["home_team"],
        axis=1,
    )
    df["pitching_team"] = df.apply(
        lambda r: r["home_team"] if str(r.get("inning_topbot", "")).lower() == "top" else r["away_team"],
        axis=1,
    )

    for col in ("zone", "release_speed", "release_spin_rate", "pfx_x", "pfx_z", "estimated_woba_using_speedangle", "launch_speed"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    desc = df["description"].fillna("")
    df["pitches"] = 1
    df["is_swing"] = desc.isin(SWING_DESCRIPTIONS).astype(int)
    df["is_whiff"] = desc.isin(WHIFF_DESCRIPTIONS).astype(int)
    df["is_called_strike"] = desc.isin(CALLED_STRIKE_DESCRIPTIONS).astype(int)
    df["is_csw"] = ((df["is_whiff"] == 1) | (df["is_called_strike"] == 1)).astype(int)
    df["in_zone"] = df["zone"].between(1, 9, inclusive="both").fillna(False).astype(int)
    df["out_zone_swing"] = ((df["is_swing"] == 1) & (df["in_zone"] == 0)).astype(int)
    df["in_zone_swing"] = ((df["is_swing"] == 1) & (df["in_zone"] == 1)).astype(int)
    df["batted_ball"] = df["launch_speed"].notna().astype(int)
    df["xwoba_events"] = df["estimated_woba_using_speedangle"].notna().astype(int)
    df["xwoba_sum"] = df["estimated_woba_using_speedangle"].fillna(0.0)
    df["launch_speed_sum"] = df["launch_speed"].fillna(0.0)
    if "events" in df.columns:
        ev = df["events"].fillna("").astype(str).str.strip().str.lower()
        df["is_hit"] = ev.isin(HIT_EVENTS).astype(int)
        df["is_ab"] = ev.isin(AB_EVENTS).astype(int)
    else:
        df["is_hit"] = 0
        df["is_ab"] = 0
    df["release_speed_sum"] = df["release_speed"].fillna(0.0)
    df["release_speed_n"] = df["release_speed"].notna().astype(int)
    df["spin_sum"] = df["release_spin_rate"].fillna(0.0)
    df["spin_n"] = df["release_spin_rate"].notna().astype(int)
    df["pfx_x_sum"] = df["pfx_x"].fillna(0.0)
    df["pfx_x_n"] = df["pfx_x"].notna().astype(int)
    df["pfx_z_sum"] = df["pfx_z"].fillna(0.0)
    df["pfx_z_n"] = df["pfx_z"].notna().astype(int)
    return df


def _mode_team(df: pd.DataFrame, id_col: str, team_col: str, out_col: str) -> pd.DataFrame:
    team_mode = (
        df.groupby([id_col, team_col]).size().reset_index(name="n")
        .sort_values([id_col, "n", team_col], ascending=[True, False, True])
        .drop_duplicates(id_col)
        [[id_col, team_col]]
        .rename(columns={team_col: out_col})
    )
    return team_mode


def _safe_rate(num: pd.Series, den: pd.Series) -> pd.Series:
    den = den.replace(0, pd.NA)
    return (num / den).fillna(0.0)


def _finalize_mix(df: pd.DataFrame, count_col: str) -> pd.DataFrame:
    if df.empty:
        return df
    total = df.groupby(df.columns[0])[count_col].transform("sum")
    df["pitch_pct"] = _safe_rate(df[count_col], total) * 100.0
    df["whiff_rate"] = _safe_rate(df["is_whiff"], df["is_swing"]) * 100.0
    df["csw_rate"] = _safe_rate(df["is_csw"], df[count_col]) * 100.0
    df["zone_rate"] = _safe_rate(df["in_zone"], df[count_col]) * 100.0
    df["chase_rate"] = _safe_rate(df["out_zone_swing"], df[count_col] - df["in_zone"]) * 100.0
    df["in_zone_swing_rate"] = _safe_rate(df["in_zone_swing"], df["in_zone"]) * 100.0
    df["avg_release_speed"] = _safe_rate(df["release_speed_sum"], df["release_speed_n"])
    df["avg_spin_rate"] = _safe_rate(df["spin_sum"], df["spin_n"])
    df["avg_pfx_x"] = _safe_rate(df["pfx_x_sum"], df["pfx_x_n"])
    df["avg_pfx_z"] = _safe_rate(df["pfx_z_sum"], df["pfx_z_n"])
    df["avg_launch_speed"] = _safe_rate(df["launch_speed_sum"], df["batted_ball"])
    df["xwoba"] = _safe_rate(df["xwoba_sum"], df["xwoba_events"])
    if "is_hit" in df.columns and "is_ab" in df.columns:
        df["batting_avg"] = _safe_rate(df["is_hit"], df["is_ab"])
    drop_cols = [
        "release_speed_sum", "release_speed_n", "spin_sum", "spin_n",
        "pfx_x_sum", "pfx_x_n", "pfx_z_sum", "pfx_z_n",
        "launch_speed_sum", "xwoba_sum", "xwoba_events",
        "is_hit", "is_ab",
    ]
    existing = [c for c in drop_cols if c in df.columns]
    return df.drop(columns=existing)


def _aggregate_pitcher_mix(raw: pd.DataFrame, registry: pd.DataFrame) -> pd.DataFrame:
    sums = raw.groupby(["pitcher", "pitch_name", "pitch_type"], dropna=False)[[
        "pitches", "is_swing", "is_whiff", "is_called_strike", "is_csw", "in_zone",
        "out_zone_swing", "in_zone_swing", "batted_ball",
        "release_speed_sum", "release_speed_n", "spin_sum", "spin_n",
        "pfx_x_sum", "pfx_x_n", "pfx_z_sum", "pfx_z_n",
        "launch_speed_sum", "xwoba_sum", "xwoba_events",
    ]].sum().reset_index()
    meta = registry.rename(columns={"player_id": "pitcher", "throws": "hand"}).copy()
    meta = meta[["pitcher", "full_name", "team_abbr", "hand"]]
    team_mode = _mode_team(raw, "pitcher", "pitching_team", "pitching_team_mode")
    name_mode = (
        raw.groupby(["pitcher", "player_name"]).size().reset_index(name="n")
        .sort_values(["pitcher", "n", "player_name"], ascending=[True, False, True])
        .drop_duplicates("pitcher")[["pitcher", "player_name"]]
        .rename(columns={"player_name": "pitcher_name_mode"})
    )
    hand_mode = (
        raw.groupby(["pitcher", "p_throws"]).size().reset_index(name="n")
        .sort_values(["pitcher", "n", "p_throws"], ascending=[True, False, True])
        .drop_duplicates("pitcher")[["pitcher", "p_throws"]]
        .rename(columns={"p_throws": "hand_mode"})
    )
    out = (
        sums.merge(meta, on="pitcher", how="left")
        .merge(team_mode, on="pitcher", how="left")
        .merge(name_mode, on="pitcher", how="left")
        .merge(hand_mode, on="pitcher", how="left")
    )
    out["full_name"] = out["pitcher_name_mode"].fillna(out["full_name"])
    out["team_abbr"] = out["team_abbr"].fillna(out["pitching_team_mode"])
    out["hand"] = out["hand"].fillna(out["hand_mode"])
    out = out.drop(columns=["pitching_team_mode", "pitcher_name_mode", "hand_mode"])
    out = out.rename(columns={"pitcher": "player_id"})
    out = _finalize_mix(out, "pitches")
    cols = [
        "player_id", "full_name", "team_abbr", "hand", "pitch_name", "pitch_type",
        "pitches", "pitch_pct", "avg_release_speed", "avg_spin_rate", "avg_pfx_x", "avg_pfx_z",
        "whiff_rate", "csw_rate", "zone_rate", "chase_rate", "in_zone_swing_rate",
        "avg_launch_speed", "xwoba",
    ]
    return out[cols].sort_values(["team_abbr", "full_name", "pitches"], ascending=[True, True, False])


def _aggregate_batter_mix(raw: pd.DataFrame, registry: pd.DataFrame) -> pd.DataFrame:
    sums = raw.groupby(["batter", "pitch_name", "pitch_type"], dropna=False)[[
        "pitches", "is_swing", "is_whiff", "is_called_strike", "is_csw", "in_zone",
        "out_zone_swing", "in_zone_swing", "batted_ball",
        "release_speed_sum", "release_speed_n", "spin_sum", "spin_n",
        "pfx_x_sum", "pfx_x_n", "pfx_z_sum", "pfx_z_n",
        "launch_speed_sum", "xwoba_sum", "xwoba_events", "is_hit", "is_ab",
    ]].sum().reset_index()
    meta = registry.rename(columns={"player_id": "batter", "bats": "hand"}).copy()
    meta = meta[["batter", "full_name", "team_abbr", "hand"]]
    team_mode = _mode_team(raw, "batter", "batting_team", "batting_team_mode")
    hand_mode = (
        raw.groupby(["batter", "stand"]).size().reset_index(name="n")
        .sort_values(["batter", "n", "stand"], ascending=[True, False, True])
        .drop_duplicates("batter")[["batter", "stand"]]
        .rename(columns={"stand": "hand_mode"})
    )
    out = sums.merge(meta, on="batter", how="left").merge(team_mode, on="batter", how="left").merge(hand_mode, on="batter", how="left")
    out["team_abbr"] = out["team_abbr"].fillna(out["batting_team_mode"])
    out["hand"] = out["hand"].fillna(out["hand_mode"]).fillna("")
    out = out.drop(columns=["batting_team_mode", "hand_mode"])
    out = out.rename(columns={"batter": "player_id"})
    out = _finalize_mix(out, "pitches")
    cols = [
        "player_id", "full_name", "team_abbr", "hand", "pitch_name", "pitch_type",
        "pitches", "pitch_pct", "avg_release_speed", "avg_spin_rate", "avg_pfx_x", "avg_pfx_z",
        "whiff_rate", "csw_rate", "zone_rate", "chase_rate", "in_zone_swing_rate",
        "avg_launch_speed", "xwoba", "batting_avg",
    ]
    return out[cols].sort_values(["team_abbr", "full_name", "pitches"], ascending=[True, True, False])


def _aggregate_team_mix(raw: pd.DataFrame, team_col: str, out_team_col: str) -> pd.DataFrame:
    sums = raw.groupby([team_col, "pitch_name", "pitch_type"], dropna=False)[[
        "pitches", "is_swing", "is_whiff", "is_called_strike", "is_csw", "in_zone",
        "out_zone_swing", "in_zone_swing", "batted_ball",
        "release_speed_sum", "release_speed_n", "spin_sum", "spin_n",
        "pfx_x_sum", "pfx_x_n", "pfx_z_sum", "pfx_z_n",
        "launch_speed_sum", "xwoba_sum", "xwoba_events", "is_hit", "is_ab",
    ]].sum().reset_index().rename(columns={team_col: out_team_col})
    out = _finalize_mix(sums, "pitches")
    cols = [
        out_team_col, "pitch_name", "pitch_type", "pitches", "pitch_pct",
        "avg_release_speed", "avg_spin_rate", "avg_pfx_x", "avg_pfx_z",
        "whiff_rate", "csw_rate", "zone_rate", "chase_rate", "in_zone_swing_rate",
        "avg_launch_speed", "xwoba", "batting_avg",
    ]
    return out[cols].sort_values([out_team_col, "pitches"], ascending=[True, False])


def _write(df: pd.DataFrame, filename: str) -> None:
    path = DATA_DIR / filename
    df.to_csv(path, index=False)
    print(f"  Saved {len(df)} rows -> {path}")


def _run_window(start_date: str, end_date: str, suffix: str) -> None:
    registry = _read_registry()
    raw = _load_raw(start_date, end_date)
    pitcher_mix = _aggregate_pitcher_mix(raw, registry)
    batter_mix = _aggregate_batter_mix(raw, registry)
    team_pitching_mix = _aggregate_team_mix(raw, "pitching_team", "team_abbr")
    team_batting_mix = _aggregate_team_mix(raw, "batting_team", "team_abbr")
    _write(pitcher_mix, f"pitch_mix_pitcher{suffix}.csv")
    _write(batter_mix, f"pitch_mix_batter{suffix}.csv")
    _write(team_pitching_mix, f"pitch_mix_team_pitching{suffix}.csv")
    _write(team_batting_mix, f"pitch_mix_team_batting{suffix}.csv")


def run() -> None:
    print(f"Building pitch-mix datasets for {CURRENT_SEASON}...")
    today_cap = _today_cap()
    _run_window(SEASON_START, today_cap, "")
    l14_start = (datetime.strptime(today_cap, "%Y-%m-%d").date() - timedelta(days=WINDOW_RECENT_DAYS - 1)).strftime("%Y-%m-%d")
    _run_window(l14_start, today_cap, "_l14")
    print("Pitch mix scrape complete.")


if __name__ == "__main__":
    run()
