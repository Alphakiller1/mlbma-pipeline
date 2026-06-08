"""Aggregate team last-10-games offense vs same-handed opposing starters."""

from __future__ import annotations

from typing import Dict, Optional

import pandas as pd

from core.config import DATA_DIR, PITCHING_WEIGHTS, TEAM_MAP
from core.metrics_utils import invert, normalize, parse_ip

GAME_RESULTS = DATA_DIR / "game_results.csv"
REGISTRY_FILE = DATA_DIR / "player_registry.csv"
SP_PROFILES = DATA_DIR / "sp_profiles.csv"
OUTPUT_FILE = DATA_DIR / "team_l10_sp_hand.csv"
GAMES_OUTPUT_FILE = DATA_DIR / "team_l10_sp_hand_games.csv"

L10_GAMES = 10
LG_WOBA = 0.320
WOBA_WEIGHTS = {
    "bb": 0.690,
    "ibb": 0.690,
    "hbp": 0.722,
    "1b": 0.880,
    "2b": 1.242,
    "3b": 1.569,
    "hr": 2.015,
}

OUTPUT_COLUMNS = [
    "team",
    "opp_starter_hand",
    "games",
    "wins",
    "win_pct",
    "qs_against",
    "qs_against_pct",
    "wrc_plus",
    "ops",
    "woba",
    "pitch_score_against",
    "vs_sp_pa",
    "sp_k9_faced",
    "sp_bb9_faced",
    "sp_whip_faced",
    "sp_xfip_faced",
]

GAMES_OUTPUT_COLUMNS = [
    "team",
    "opp_starter_hand",
    "date",
    "opp",
    "home_away",
    "opp_starter_id",
    "opp_starter_name",
    "vs_sp_pa",
    "vs_sp_h",
    "vs_sp_ab",
    "vs_sp_bb",
    "vs_sp_hr",
    "runs_off_sp",
    "wrc_plus",
    "ops",
    "woba",
    "opp_starter_ip",
    "opp_starter_er",
    "opp_quality_start",
]


def _safe_rate(num: float, den: float, digits: int = 3):
    if den <= 0:
        return None
    return round(float(num) / float(den), digits)


def _load_name_map() -> dict[int, str]:
    if not REGISTRY_FILE.exists():
        return {}
    try:
        df = pd.read_csv(REGISTRY_FILE, usecols=["player_id", "full_name", "name"])
    except Exception:
        try:
            df = pd.read_csv(REGISTRY_FILE, usecols=["player_id", "full_name"])
        except Exception:
            return {}
    id_col = "player_id"
    name_col = "full_name" if "full_name" in df.columns else "name"
    out: dict[int, str] = {}
    for row in df.itertuples(index=False):
        if pd.isna(getattr(row, id_col)):
            continue
        nm = str(getattr(row, name_col, "") or "").strip()
        if nm:
            out[int(getattr(row, id_col))] = nm
    return out


def _load_throws_map() -> dict[int, str]:
    if not REGISTRY_FILE.exists():
        return {}
    try:
        df = pd.read_csv(REGISTRY_FILE, usecols=["player_id", "throws"])
    except Exception:
        return {}
    out: dict[int, str] = {}
    for row in df.itertuples(index=False):
        if pd.isna(row.player_id):
            continue
        hand = str(row.throws or "").strip().upper()
        if hand in ("R", "L"):
            out[int(row.player_id)] = hand
    return out


def _pct_decimal(raw) -> Optional[float]:
    val = pd.to_numeric(raw, errors="coerce")
    if pd.isna(val):
        return None
    val = float(val)
    if val <= 1.5:
        return val
    return val / 100.0


def _load_pitch_score_map() -> dict[int, float]:
    if not SP_PROFILES.exists():
        return {}
    df = pd.read_csv(SP_PROFILES)
    k = df["K_pct"].map(_pct_decimal)
    bb = df["BB_pct"].map(_pct_decimal)
    hr9 = pd.to_numeric(df["HR9"], errors="coerce")
    valid = k.notna() & bb.notna() & hr9.notna()
    if not valid.any():
        return {}
    score = (
        PITCHING_WEIGHTS["k_pct"] * normalize(k[valid])
        + PITCHING_WEIGHTS["inv_bb_pct"] * invert(bb[valid])
        + PITCHING_WEIGHTS["inv_hr9"] * invert(hr9[valid])
    ).round(1)
    out: dict[int, float] = {}
    for idx, val in score.items():
        pid = df.at[idx, "pitcher_id"]
        if pd.isna(pid):
            continue
        out[int(pid)] = float(val)
    return out


def _prep_games(df: pd.DataFrame, throws_map: dict[int, str]) -> pd.DataFrame:
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out.dropna(subset=["date"])
    out["team"] = out["team"].astype(str).str.strip().str.upper()
    out["result"] = out["result"].astype(str).str.strip().str.upper()
    out["opp_starter_id"] = pd.to_numeric(out.get("opp_starter_id"), errors="coerce")
    if "opp_starter_hand" not in out.columns:
        out["opp_starter_hand"] = ""
    out["opp_starter_hand"] = out["opp_starter_hand"].fillna("").astype(str).str.strip().str.upper()
    blank = out["opp_starter_hand"].isin(["", "NAN", "NONE"])
    if blank.any():
        out.loc[blank, "opp_starter_hand"] = out.loc[blank, "opp_starter_id"].map(
            lambda pid: throws_map.get(int(pid), "") if pd.notna(pid) else ""
        )
    out["opp_starter_hand"] = out["opp_starter_hand"].replace({"NAN": "", "NONE": ""})
    for col in (
        "vs_sp_ab", "vs_sp_h", "vs_sp_bb", "vs_sp_ibb", "vs_sp_hbp", "vs_sp_sf",
        "vs_sp_hr", "vs_sp_2b", "vs_sp_3b", "vs_sp_k",
    ):
        if col not in out.columns:
            out[col] = 0
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)
    out["opp_quality_start"] = out.get("opp_quality_start", False).fillna(False).astype(bool)
    pa = (
        out["vs_sp_ab"] + out["vs_sp_bb"] + out["vs_sp_ibb"]
        + out["vs_sp_hbp"] + out["vs_sp_sf"]
    )
    out["vs_sp_pa"] = pa
    return out


def _woba_from_totals(totals: Dict[str, float]) -> Optional[float]:
    ab = totals["ab"]
    bb = totals["bb"]
    ibb = totals["ibb"]
    hbp = totals["hbp"]
    sf = totals["sf"]
    hr = totals["hr"]
    d2 = totals["d2"]
    d3 = totals["d3"]
    h = totals["h"]
    singles = max(h - hr - d2 - d3, 0)
    num = (
        WOBA_WEIGHTS["bb"] * bb
        + WOBA_WEIGHTS["ibb"] * ibb
        + WOBA_WEIGHTS["hbp"] * hbp
        + WOBA_WEIGHTS["1b"] * singles
        + WOBA_WEIGHTS["2b"] * d2
        + WOBA_WEIGHTS["3b"] * d3
        + WOBA_WEIGHTS["hr"] * hr
    )
    denom = ab + bb + ibb + hbp + sf
    if denom <= 0:
        return None
    return round(num / denom, 3)


def _ops_from_totals(totals: Dict[str, float], woba: Optional[float]) -> Optional[float]:
    ab = totals["ab"]
    bb = totals["bb"]
    ibb = totals["ibb"]
    hbp = totals["hbp"]
    sf = totals["sf"]
    h = totals["h"]
    hr = totals["hr"]
    d2 = totals["d2"]
    d3 = totals["d3"]
    tb = singles = max(h - hr - d2 - d3, 0) + 2 * d2 + 3 * d3 + 4 * hr
    pa = ab + bb + ibb + hbp + sf
    if pa <= 0:
        return round(woba / LG_WOBA * 1.28, 3) if woba is not None else None
    obp = (h + bb + ibb + hbp) / pa if pa > 0 else None
    slg = tb / ab if ab > 0 else None
    if obp is not None and slg is not None:
        return round(obp + slg, 3)
    if woba is not None:
        return round(woba / LG_WOBA * 1.28, 3)
    return None


def _load_xfip_map() -> dict[int, float]:
    if not SP_PROFILES.exists():
        return {}
    df = pd.read_csv(SP_PROFILES)
    out: dict[int, float] = {}
    for row in df.itertuples(index=False):
        pid = row.pitcher_id
        if pd.isna(pid):
            continue
        xfip = pd.to_numeric(getattr(row, "xFIP", None), errors="coerce")
        if pd.notna(xfip):
            out[int(pid)] = round(float(xfip), 2)
    return out


def _game_totals(g) -> Dict[str, float]:
    return {
        "ab": float(g["vs_sp_ab"]),
        "h": float(g["vs_sp_h"]),
        "bb": float(g["vs_sp_bb"]),
        "ibb": float(g["vs_sp_ibb"]),
        "hbp": float(g["vs_sp_hbp"]),
        "sf": float(g["vs_sp_sf"]),
        "hr": float(g["vs_sp_hr"]),
        "d2": float(g["vs_sp_2b"]),
        "d3": float(g["vs_sp_3b"]),
    }


def _single_game_row(team: str, hand: str, g, name_map: dict[int, str]) -> dict:
    totals = _game_totals(g)
    pa = totals["ab"] + totals["bb"] + totals["ibb"] + totals["hbp"] + totals["sf"]
    woba = _woba_from_totals(totals)
    ops = _ops_from_totals(totals, woba)
    wrc = round((woba / LG_WOBA) * 100) if woba is not None else None
    dt = g["date"]
    date_str = dt.date().isoformat() if hasattr(dt, "date") else str(dt)[:10]
    qs = g.get("opp_quality_start")
    pid = g.get("opp_starter_id")
    pid_int = int(pid) if pd.notna(pid) else None
    pname = name_map.get(pid_int, "") if pid_int else ""
    er = pd.to_numeric(g.get("opp_starter_er"), errors="coerce")
    runs_off = int(er) if pd.notna(er) else None
    return {
        "team": team,
        "opp_starter_hand": hand,
        "date": date_str,
        "opp": g.get("opp"),
        "home_away": g.get("home_away"),
        "opp_starter_id": pid_int,
        "opp_starter_name": pname,
        "vs_sp_pa": int(pa) if pa > 0 else 0,
        "vs_sp_h": int(totals["h"]),
        "vs_sp_ab": int(totals["ab"]),
        "vs_sp_bb": int(totals["bb"] + totals["ibb"]),
        "vs_sp_hr": int(totals["hr"]),
        "runs_off_sp": runs_off,
        "wrc_plus": wrc,
        "ops": ops,
        "woba": woba,
        "opp_starter_ip": g.get("opp_starter_ip"),
        "opp_starter_er": g.get("opp_starter_er"),
        "opp_quality_start": bool(qs) if pd.notna(qs) else False,
    }


def _aggregate_slice(
    gdf: pd.DataFrame,
    pitch_scores: dict[int, float],
    xfip_map: dict[int, float],
) -> dict:
    games = len(gdf)
    wins = int((gdf["result"] == "W").sum())
    qs_against = int(gdf["opp_quality_start"].sum())
    totals = {
        "ab": float(gdf["vs_sp_ab"].sum()),
        "h": float(gdf["vs_sp_h"].sum()),
        "bb": float(gdf["vs_sp_bb"].sum()),
        "ibb": float(gdf["vs_sp_ibb"].sum()),
        "hbp": float(gdf["vs_sp_hbp"].sum()),
        "sf": float(gdf["vs_sp_sf"].sum()),
        "hr": float(gdf["vs_sp_hr"].sum()),
        "d2": float(gdf["vs_sp_2b"].sum()),
        "d3": float(gdf["vs_sp_3b"].sum()),
    }
    pa = totals["ab"] + totals["bb"] + totals["ibb"] + totals["hbp"] + totals["sf"]
    woba = _woba_from_totals(totals)
    ops = _ops_from_totals(totals, woba)
    wrc = round((woba / LG_WOBA) * 100) if woba is not None else None
    ps_vals = []
    for pid in gdf["opp_starter_id"].dropna().astype(int).tolist():
        val = pitch_scores.get(pid)
        if val is not None:
            ps_vals.append(val)
    pitch_score_against = round(sum(ps_vals) / len(ps_vals), 1) if ps_vals else None
    xfip_vals = []
    for pid in gdf["opp_starter_id"].dropna().astype(int).tolist():
        val = xfip_map.get(pid)
        if val is not None:
            xfip_vals.append(val)
    sp_xfip_faced = round(sum(xfip_vals) / len(xfip_vals), 2) if xfip_vals else None

    opp_ip = gdf["opp_starter_ip"].map(parse_ip).sum()
    sp_k = float(gdf["vs_sp_k"].sum())
    sp_bb = float(gdf["vs_sp_bb"].sum() + gdf["vs_sp_ibb"].sum())
    sp_h = float(gdf["vs_sp_h"].sum())
    sp_k9_faced = round(sp_k / opp_ip * 9, 1) if opp_ip > 0 else None
    sp_bb9_faced = round(sp_bb / opp_ip * 9, 1) if opp_ip > 0 else None
    sp_whip_faced = round((sp_h + sp_bb) / opp_ip, 2) if opp_ip > 0 else None

    return {
        "games": games,
        "wins": wins,
        "win_pct": _safe_rate(wins, games, 3),
        "qs_against": qs_against,
        "qs_against_pct": _safe_rate(qs_against, games, 3),
        "wrc_plus": wrc,
        "ops": ops,
        "woba": woba,
        "pitch_score_against": pitch_score_against,
        "vs_sp_pa": int(pa) if pa > 0 else 0,
        "sp_k9_faced": sp_k9_faced,
        "sp_bb9_faced": sp_bb9_faced,
        "sp_whip_faced": sp_whip_faced,
        "sp_xfip_faced": sp_xfip_faced,
    }


def run():
    print("Computing team L10 vs same-handed SP metrics...")
    if not GAME_RESULTS.exists():
        print("  WARNING: game_results.csv not found")
        pd.DataFrame(columns=OUTPUT_COLUMNS).to_csv(OUTPUT_FILE, index=False)
        pd.DataFrame(columns=GAMES_OUTPUT_COLUMNS).to_csv(GAMES_OUTPUT_FILE, index=False)
        return

    raw = pd.read_csv(GAME_RESULTS)
    if raw.empty:
        pd.DataFrame(columns=OUTPUT_COLUMNS).to_csv(OUTPUT_FILE, index=False)
        pd.DataFrame(columns=GAMES_OUTPUT_COLUMNS).to_csv(GAMES_OUTPUT_FILE, index=False)
        return

    throws_map = _load_throws_map()
    name_map = _load_name_map()
    pitch_scores = _load_pitch_score_map()
    xfip_map = _load_xfip_map()
    df = _prep_games(raw, throws_map)
    official = set(TEAM_MAP.values())
    df = df[df["team"].isin(official)]
    df = df[df["opp_starter_hand"].isin(["R", "L"])]

    rows = []
    game_rows = []
    for team in sorted(official):
        tdf = df[df["team"] == team].sort_values(["date", "game_pk"], ascending=[False, False])
        for hand in ("R", "L"):
            hand_df = tdf[tdf["opp_starter_hand"] == hand]
            hand_df = hand_df[hand_df["vs_sp_pa"] > 0]
            slice_df = hand_df.head(L10_GAMES)
            if slice_df.empty:
                rows.append({"team": team, "opp_starter_hand": hand})
                continue
            pack = _aggregate_slice(slice_df, pitch_scores, xfip_map)
            rows.append({"team": team, "opp_starter_hand": hand, **pack})
            for _, g in slice_df.iterrows():
                game_rows.append(_single_game_row(team, hand, g, name_map))

    out = pd.DataFrame(rows, columns=OUTPUT_COLUMNS)
    out = out.where(pd.notnull(out), None).fillna("")
    out.to_csv(OUTPUT_FILE, index=False)
    populated = out[out["games"].astype(str).str.strip() != ""]
    print(f"  Saved {len(out)} rows ({len(populated)} with L10 samples) -> {OUTPUT_FILE}")

    games_out = pd.DataFrame(game_rows, columns=GAMES_OUTPUT_COLUMNS)
    games_out = games_out.where(pd.notnull(games_out), None).fillna("")
    games_out.to_csv(GAMES_OUTPUT_FILE, index=False)
    print(f"  Saved {len(games_out)} game rows -> {GAMES_OUTPUT_FILE}")


if __name__ == "__main__":
    run()
