"""Aggregate starting-pitcher split profiles from sp_gamelog.csv."""

from __future__ import annotations

from typing import List, Optional

import pandas as pd

from core.config import DATA_DIR, OPPONENT_TIER_HIGH_MIN, OPPONENT_TIER_MID_MIN
from core.compute_pitching import build_pitcher_staleness_df, park_adjust_allowed_value
from core.metrics_utils import parse_ip
from core.name_utils import normalize_player_name


def _num(v) -> Optional[float]:
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None


def _ops_from_fg_row(r) -> Optional[float]:
    """Opponent OPS against from FanGraphs SP export (or OBP + SLG)."""
    for key in ("OPS", "ops", "OPP", "Opp OPS", "OPS Against"):
        v = _num(r.get(key))
        if v is not None:
            return round(v, 3)
    obp = _num(r.get("OBP"))
    slg = _num(r.get("SLG"))
    if obp is not None and slg is not None:
        return round(obp + slg, 3)
    return None


def _pct_pts(v) -> Optional[float]:
    """FanGraphs K%/BB% arrive as a fraction (0.21) or percent; return percent points."""
    n = _num(str(v).replace("%", "").strip()) if isinstance(v, str) else _num(v)
    if n is None:
        return None
    return round(n * 100, 1) if n <= 1.5 else round(n, 1)


def _col_mean(df, col) -> Optional[float]:
    if col not in df.columns:
        return None
    v = pd.to_numeric(df[col], errors="coerce")
    return round(float(v.mean()), 1) if v.notna().any() else None


def _team_metric_map(fname: str, col: str) -> dict:
    p = DATA_DIR / fname
    if not p.exists():
        return {}
    df = pd.read_csv(p)
    if "Tm" not in df.columns or col not in df.columns:
        return {}
    return {str(t).strip().upper(): _num(v) for t, v in zip(df["Tm"], df[col])}


def enrich_faced(gamelog: pd.DataFrame) -> pd.DataFrame:
    """Attach opponent OOR / PALS / wRC+ (vs the pitcher's hand) per start from team
    metrics, so strength-of-competition can be split by home/away and handedness."""
    g = gamelog.copy()
    pals = _team_metric_map("metrics_pals.csv", "PALS")
    oor = _team_metric_map("metrics_oor.csv", "OOR")
    hvl = _team_metric_map("metrics_oor.csv", "HvL")
    hvr = _team_metric_map("metrics_oor.csv", "HvR")
    wrc_r = _team_metric_map("metrics_vs_RHP.csv", "wRC+")
    wrc_l = _team_metric_map("metrics_vs_LHP.csv", "wRC+")

    def opp(r):
        return str(r.get("opponent_team", "")).strip().upper()

    g["opponent_OOR"] = g.apply(lambda r: oor.get(opp(r)), axis=1)
    g["opponent_HvL"] = g.apply(lambda r: hvl.get(opp(r)), axis=1)
    g["opponent_HvR"] = g.apply(lambda r: hvr.get(opp(r)), axis=1)
    g["opponent_PALS"] = g.apply(lambda r: pals.get(opp(r)), axis=1)
    g["opponent_wRC"] = g.apply(
        lambda r: (wrc_r if str(r.get("pitcher_hand", "R")).upper().startswith("R") else wrc_l).get(opp(r)),
        axis=1)
    g["opponent_wRC_rhh"] = g.apply(lambda r: wrc_r.get(opp(r)), axis=1)
    g["opponent_wRC_lhh"] = g.apply(lambda r: wrc_l.get(opp(r)), axis=1)
    return g

SPLIT_DIMENSIONS = (
    ("osi_tier", "opponent_OSI_tier"),
    ("abq_tier", "opponent_ABQ_tier"),
    ("rcv_tier", "opponent_RCV_tier"),
    ("obr_tier", "opponent_OBR_tier"),
    ("hand", "pitcher_hand"),
    ("location", "home_away"),
)


def _opp_tier(value) -> str:
    """High/Mid/Low bucket for an opponent composite (same thresholds as OSI/ABQ)."""
    v = pd.to_numeric(value, errors="coerce")
    if pd.isna(v):
        return ""
    if v > OPPONENT_TIER_HIGH_MIN:
        return "High"
    if v >= OPPONENT_TIER_MID_MIN:
        return "Mid"
    return "Low"

METRIC_SPLIT_COLUMNS = [
    "pitcher_id",
    "pitcher_name",
    "pitcher_team",
    "pitcher_hand",
    "split_dimension",
    "split_value",
    "starts",
    "avg_IP",
    "ERA",
    "K_pct",
    "BB_pct",
    "HR9",
    "avg_pitches",
    "ABQ_allowed",
    "RCV_allowed",
    "OBR_allowed",
    "OSI_allowed",
    "OOR_faced",
    "PALS_faced",
    "wRC_faced",
    "FIP",
    "xFIP",
    "OPS",
    "F5_ERA",
]

PROFILE_COLUMNS = [
    "pitcher_id",
    "pitcher_name",
    "pitcher_team",
    "pitcher_hand",
    "starts",
    "avg_IP",
    "ERA",
    "FIP",
    "xFIP",
    "K_pct",
    "BB_pct",
    "HR9",
    "avg_pitches",
    "ABQ_allowed",
    "RCV_allowed",
    "OBR_allowed",
    "OSI_allowed",
    "OOR_faced",
    "PALS_faced",
    "wRC_faced",
    "OPS",
    "F5_ERA",
    "high_osi_ERA",
    "low_osi_ERA",
    "home_ERA",
    "away_ERA",
    "stale",
    "staleness_warning",
    "data_source",
    "l14_starts",
]


def _park_adjust_gamelog(df: pd.DataFrame) -> pd.DataFrame:
    """Apply home-park adjustment to opponent allowed metrics per start."""
    out = df.copy()
    for col in ("opponent_ABQ", "opponent_RCV", "opponent_OBR", "opponent_OSI"):
        if col not in out.columns:
            continue
        out[col] = out.apply(
            lambda r: park_adjust_allowed_value(
                r[col], r.get("pitcher_team", ""), r.get("home_away", "")
            ),
            axis=1,
        )
    return out


def _agg_block(df: pd.DataFrame) -> Optional[dict]:
    if df.empty:
        return None

    df = _park_adjust_gamelog(df)

    ip_vals = df["IP"].apply(parse_ip)
    total_ip = ip_vals.sum()
    total_er = df["ER"].sum()
    total_bf = df["batters_faced"].sum() if "batters_faced" in df.columns else 0
    if total_bf <= 0:
        total_bf = (df["K"] + df["H"] + df["BB"]).sum()

    f5_mask = df["f5_er"].notna() if "f5_er" in df.columns else pd.Series([False] * len(df))
    f5_er = df.loc[f5_mask, "f5_er"].sum() if f5_mask.any() else None
    f5_starts = int(f5_mask.sum()) if f5_mask.any() else 0

    return {
        "starts": len(df),
        "avg_IP": round(total_ip / len(df), 2) if len(df) else 0.0,
        "ERA": round(total_er / total_ip * 9, 2) if total_ip > 0 else None,
        "K_pct": round(df["K"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "BB_pct": round(df["BB"].sum() / total_bf * 100, 1) if total_bf > 0 else None,
        "HR9": round(df["HR"].sum() / total_ip * 9, 2) if total_ip > 0 else None,
        "FIP": round((13 * df["HR"].sum() + 3 * df["BB"].sum() - 2 * df["K"].sum()) / total_ip + 3.10, 2)
        if total_ip > 0 else None,
        "xFIP": None,  # not derivable from the game log; populated for Overall + vs-L/R from FanGraphs
        "OPS": None,   # opponent OPS against — only from the FanGraphs hand-split scrape
        "avg_pitches": round(df["pitches"].mean(), 1) if "pitches" in df.columns else None,
        "ABQ_allowed": round(pd.to_numeric(df["opponent_ABQ"], errors="coerce").mean(), 1),
        "RCV_allowed": round(pd.to_numeric(df["opponent_RCV"], errors="coerce").mean(), 1),
        "OBR_allowed": round(pd.to_numeric(df["opponent_OBR"], errors="coerce").mean(), 1),
        "OSI_allowed": round(pd.to_numeric(df["opponent_OSI"], errors="coerce").mean(), 1),
        "OOR_faced": _col_mean(df, "opponent_OOR"),
        "PALS_faced": _col_mean(df, "opponent_PALS"),
        "wRC_faced": _col_mean(df, "opponent_wRC"),
        "F5_ERA": round(f5_er / f5_starts / 5 * 9, 2)
        if f5_er is not None and f5_starts > 0
        else None,
    }


def _apply_season_pitching_rates(block: dict, pname: str, adv: dict) -> dict:
    """FanGraphs xFIP/FIP/OPS are season-level; attach to every split row so dashboards populate."""
    if not block:
        return block
    a = adv.get(_norm(pname), {})
    if a.get("xFIP") is not None:
        block["xFIP"] = a["xFIP"]
    if a.get("FIP") is not None and block.get("FIP") is None:
        block["FIP"] = a["FIP"]
    if a.get("OPS") is not None and block.get("OPS") is None:
        block["OPS"] = a["OPS"]
    return block


def build_metric_splits(gamelog: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []
    adv = season_advanced_lookup()

    gamelog = gamelog.copy()
    # Derive RCV/OBR tier buckets from the per-start opponent composites so the
    # profile can split by all four created offense metrics, not just OSI/ABQ.
    if "opponent_RCV" in gamelog.columns:
        gamelog["opponent_RCV_tier"] = gamelog["opponent_RCV"].map(_opp_tier)
    if "opponent_OBR" in gamelog.columns:
        gamelog["opponent_OBR_tier"] = gamelog["opponent_OBR"].map(_opp_tier)

    for (pid, pname, pteam, phand), pdf in gamelog.groupby(
        ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand"], dropna=False
    ):
        for dim_name, col in SPLIT_DIMENSIONS:
            for split_val, sdf in pdf.groupby(col, dropna=False):
                if not split_val or (isinstance(split_val, float) and pd.isna(split_val)):
                    continue
                block = _agg_block(sdf)
                if not block:
                    continue
                block = _apply_season_pitching_rates(block, pname, adv)
                rows.append(
                    {
                        "pitcher_id": pid,
                        "pitcher_name": pname,
                        "pitcher_team": pteam,
                        "pitcher_hand": phand,
                        "split_dimension": dim_name,
                        "split_value": str(split_val),
                        **block,
                    }
                )

    if not rows:
        return pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
    return pd.DataFrame(rows)[METRIC_SPLIT_COLUMNS]


def _norm(name) -> str:
    try:
        return normalize_player_name(str(name))
    except Exception:
        return str(name).strip().lower()


def season_advanced_lookup() -> dict:
    """{normalized pitcher name: {FIP, xFIP, OPS}} from the FanGraphs season export."""
    p = DATA_DIR / "sp_standard.csv"
    if not p.exists():
        return {}
    df = pd.read_csv(p)
    name_col = "Name" if "Name" in df.columns else None
    if not name_col:
        return {}
    out = {}
    for _, r in df.iterrows():
        out[_norm(r[name_col])] = {
            "FIP": _num(r.get("FIP")),
            "xFIP": _num(r.get("xFIP")),
            "OPS": _ops_from_fg_row(r),
        }
    return out


def _platoon_metric_maps(bat_side: str) -> dict:
    """Team offense vs RHP/LHP — proxy for opposing RHH/LHH lineup quality faced."""
    fname = "metrics_vs_RHP.csv" if bat_side == "RHH" else "metrics_vs_LHP.csv"
    return {
        "OSI_allowed": _team_metric_map(fname, "OSI"),
        "ABQ_allowed": _team_metric_map(fname, "ABQ"),
        "RCV_allowed": _team_metric_map(fname, "RCV"),
        "OBR_allowed": _team_metric_map(fname, "OBR"),
    }


def _avg_platoon_allowed(gamelog: pd.DataFrame, pname_key: str, bat_side: str) -> dict:
    """Season avg opponent platoon metrics across this pitcher's starts."""
    pdf = gamelog[gamelog["pitcher_name"].apply(lambda n: _norm(n) == pname_key)]
    if pdf.empty:
        return {}
    maps = _platoon_metric_maps(bat_side)
    out = {}
    for col, tmap in maps.items():
        vals = []
        for _, r in pdf.iterrows():
            tm = str(r.get("opponent_team", "")).strip().upper()
            v = tmap.get(tm)
            if v is not None:
                vals.append(float(v))
        if vals:
            out[col] = round(sum(vals) / len(vals), 1)
    return out


def _avg_platoon_competition(gamelog: pd.DataFrame, pname_key: str, bat_side: str) -> dict:
    """Season avg platoon OOR (HvL/HvR) / PALS / wRC+ faced across this pitcher's starts."""
    pdf = gamelog[gamelog["pitcher_name"].apply(lambda n: _norm(n) == pname_key)]
    if pdf.empty:
        return {}
    oor_col = "HvL" if bat_side == "LHH" else "HvR"
    oor = _team_metric_map("metrics_oor.csv", oor_col)
    pals = _team_metric_map("metrics_pals.csv", "PALS")
    wrc_fname = "metrics_vs_RHP.csv" if bat_side == "RHH" else "metrics_vs_LHP.csv"
    wrc = _team_metric_map(wrc_fname, "wRC+")
    out = {}
    for col, tmap in (
        ("OOR_faced", oor),
        ("PALS_faced", pals),
        ("wRC_faced", wrc),
    ):
        vals = []
        for _, r in pdf.iterrows():
            tm = str(r.get("opponent_team", "")).strip().upper()
            v = tmap.get(tm)
            if v is not None:
                vals.append(float(v))
        if vals:
            out[col] = round(sum(vals) / len(vals), 1)
    return out


def build_hand_splits(gamelog: pd.DataFrame) -> pd.DataFrame:
    """Pitcher vs-LHH / vs-RHH split rows from the FanGraphs hand-split exports
    (sp_vs_LHH.csv / sp_vs_RHH.csv). Skipped gracefully until those are scraped."""
    idmap = {}
    for _, g in gamelog.iterrows():
        idmap[_norm(g.get("pitcher_name", ""))] = (
            g.get("pitcher_id"), g.get("pitcher_team"), g.get("pitcher_hand"))
    rows: List[dict] = []
    for split_value, fname in (("LHH", "sp_vs_LHH.csv"), ("RHH", "sp_vs_RHH.csv")):
        p = DATA_DIR / fname
        if not p.exists():
            continue
        df = pd.read_csv(p)
        name_col = "Name" if "Name" in df.columns else None
        if not name_col:
            continue
        for _, r in df.iterrows():
            key = _norm(r[name_col])
            pid, pteam, phand = idmap.get(key, (None, r.get("Team"), None))
            g_ = _num(r.get("GS")) or _num(r.get("G"))
            ip = parse_ip(r.get("IP")) if r.get("IP") is not None else None
            platoon = _avg_platoon_allowed(gamelog, key, split_value)
            competition = _avg_platoon_competition(gamelog, key, split_value)
            rows.append({
                "pitcher_id": pid, "pitcher_name": r[name_col], "pitcher_team": pteam,
                "pitcher_hand": phand, "split_dimension": "batter_hand", "split_value": split_value,
                "starts": int(g_) if g_ else None,
                "avg_IP": round(ip / g_, 2) if ip and g_ else None,
                "ERA": _num(r.get("ERA")), "K_pct": _pct_pts(r.get("K%")),
                "BB_pct": _pct_pts(r.get("BB%")), "HR9": _num(r.get("HR/9")),
                "avg_pitches": None,
                "ABQ_allowed": platoon.get("ABQ_allowed"),
                "RCV_allowed": platoon.get("RCV_allowed"),
                "OBR_allowed": platoon.get("OBR_allowed"),
                "OSI_allowed": platoon.get("OSI_allowed"),
                "OOR_faced": competition.get("OOR_faced"),
                "PALS_faced": competition.get("PALS_faced"),
                "wRC_faced": competition.get("wRC_faced"),
                "OPS": _ops_from_fg_row(r),
                "FIP": _num(r.get("FIP")), "xFIP": _num(r.get("xFIP")), "F5_ERA": None,
            })
    if not rows:
        return pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
    return pd.DataFrame(rows)[METRIC_SPLIT_COLUMNS]


def _split_era(pdf: pd.DataFrame, col: str, value: str) -> Optional[float]:
    sub = pdf[pdf[col] == value]
    block = _agg_block(sub)
    return block["ERA"] if block else None


def build_profiles(gamelog: pd.DataFrame, splits: pd.DataFrame) -> pd.DataFrame:
    rows: List[dict] = []
    adv = season_advanced_lookup()   # season FIP/xFIP from FanGraphs (xFIP isn't in the log)
    staleness_df = build_pitcher_staleness_df()
    stale_lookup = (
        staleness_df.set_index("pitcher_name").to_dict("index")
        if not staleness_df.empty and "pitcher_name" in staleness_df.columns
        else {}
    )

    for (pid, pname, pteam, phand), pdf in gamelog.groupby(
        ["pitcher_id", "pitcher_name", "pitcher_team", "pitcher_hand"], dropna=False
    ):
        block = _agg_block(pdf)
        if not block:
            continue
        st = stale_lookup.get(str(pname), {})
        a = adv.get(_norm(pname), {})
        rows.append(
            {
                "pitcher_id": pid,
                "pitcher_name": pname,
                "pitcher_team": pteam,
                "pitcher_hand": phand,
                **block,
                "FIP": a.get("FIP") if a.get("FIP") is not None else block.get("FIP"),
                "xFIP": a.get("xFIP"),
                "OPS": a.get("OPS") if a.get("OPS") is not None else block.get("OPS"),
                "high_osi_ERA": _split_era(pdf, "opponent_OSI_tier", "High"),
                "low_osi_ERA": _split_era(pdf, "opponent_OSI_tier", "Low"),
                "home_ERA": _split_era(pdf, "home_away", "home"),
                "away_ERA": _split_era(pdf, "home_away", "away"),
                "stale": st.get("stale", False),
                "staleness_warning": st.get("staleness_warning", ""),
                "data_source": st.get("data_source", "season"),
                "l14_starts": st.get("l14_starts", 0),
            }
        )

    if not rows:
        return pd.DataFrame(columns=PROFILE_COLUMNS)
    return pd.DataFrame(rows)[PROFILE_COLUMNS]


def run():
    path = DATA_DIR / "sp_gamelog.csv"
    if not path.exists():
        print("  WARNING: sp_gamelog.csv not found -- writing empty split files")
        splits = pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
        profiles = pd.DataFrame(columns=PROFILE_COLUMNS)
        splits.to_csv(DATA_DIR / "sp_metric_splits.csv", index=False)
        profiles.to_csv(DATA_DIR / "sp_profiles.csv", index=False)
        return

    print("Computing SP split profiles...")
    gamelog = pd.read_csv(path)
    if gamelog.empty:
        print("  Empty gamelog -- writing empty split files")
        splits = pd.DataFrame(columns=METRIC_SPLIT_COLUMNS)
        profiles = pd.DataFrame(columns=PROFILE_COLUMNS)
    else:
        for col in ("ER", "R", "H", "BB", "K", "HR", "pitches", "batters_faced", "f5_er"):
            if col in gamelog.columns:
                gamelog[col] = pd.to_numeric(gamelog[col], errors="coerce")
        gamelog = enrich_faced(gamelog)   # opponent OOR / PALS / wRC+ faced per start
        gamelog.to_csv(path, index=False)
        splits = build_metric_splits(gamelog)
        hand = build_hand_splits(gamelog)
        if not hand.empty:
            splits = pd.concat([splits, hand], ignore_index=True)
            print(f"  + {len(hand)} vs-LHH/RHH hand-split rows from FanGraphs")
        profiles = build_profiles(gamelog, splits)

    splits_path = DATA_DIR / "sp_metric_splits.csv"
    profiles_path = DATA_DIR / "sp_profiles.csv"
    splits.to_csv(splits_path, index=False)
    profiles.to_csv(profiles_path, index=False)
    print(f"  Saved {len(splits)} split rows -> {splits_path}")
    print(f"  Saved {len(profiles)} pitcher profiles -> {profiles_path}")


if __name__ == "__main__":
    run()
