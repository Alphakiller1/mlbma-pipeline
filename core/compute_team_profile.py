"""Aggregate per-team offense, rotation, bullpen, and trend summaries."""

from __future__ import annotations

import json
import os
from typing import Dict, List, Optional

import pandas as pd

from core.config import (
    DATA_DIR,
    TEAM_HOME_AWAY_OSI_GAP,
    TEAM_PLATOON_OSI_GAP,
    TEAM_TOP_BATTERS_N,
    TEAM_TOP_SP_N,
    TEAM_WINDOW_HOT_COLD_GAP,
)

PROFILE_COLUMNS = [
    "team",
    "record_placeholder",
    "osi",
    "abq",
    "rcv",
    "obr",
    "proj_osi",
    "pals",
    "oor",
    "pp_gap",
    "osi_vs_rhp",
    "osi_vs_lhp",
    "abq_vs_rhp",
    "rcv_vs_rhp",
    "obr_vs_rhp",
    "abq_vs_lhp",
    "rcv_vs_lhp",
    "obr_vs_lhp",
    "platoon_gap",
    "platoon_sensitive",
    "avg_pitching_score",
    "avg_ip_per_start",
    "team_k_pct",
    "team_bb_pct",
    "team_era",
    "top_3_sp",
    "bullpen_era",
    "bullpen_osi_allowed",
    "bullpen_high_lev_era",
    "bullpen_ir_scored_pct",
    "closer_name",
    "primary_setup",
    "top_batters",
    "home_osi",
    "away_osi",
    "home_abq",
    "home_rcv",
    "home_obr",
    "away_abq",
    "away_rcv",
    "away_obr",
    "home_wrc",
    "home_woba",
    "home_slg",
    "away_wrc",
    "away_woba",
    "away_slg",
    "home_away_osi_gap",
    "osi_ytd",
    "osi_l30",
    "osi_l14",
    "osi_l7",
    "abq_l30",
    "abq_l14",
    "abq_l7",
    "rcv_l30",
    "rcv_l14",
    "rcv_l7",
    "obr_l30",
    "obr_l14",
    "obr_l7",
    "window_direction",
]

METRIC_HISTORY_FILE = "team_metric_history.csv"
LEGACY_HISTORY_FILE = "osi_history.csv"
WINDOW_SPLIT_FILES = {
    "l30": "batter_splits_recent.csv",
    "l14": "batter_splits_l14.csv",
    "l7": "batter_splits_l7.csv",
}
METRIC_KEYS = ("osi", "abq", "rcv", "obr")
RATE_COL_MAP = {
    "wrc": "wRC+",
    "woba": "wOBA",
    "xwoba": "xwOBA",
    "slg": "SLG",
}


def _load(name: str) -> Optional[pd.DataFrame]:
    path = DATA_DIR / name
    if not path.exists():
        print(f"  WARNING: {name} not found")
        return None
    return pd.read_csv(path)


def _num(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _team_col(df: pd.DataFrame) -> pd.Series:
    for col in ("Tm", "team", "team_abbr", "pitcher_team"):
        if col in df.columns:
            return df[col].astype(str).str.strip().str.upper()
    return pd.Series(dtype=str)


def _row_metric(row: pd.Series, col: str) -> Optional[float]:
    if col not in row.index:
        return None
    return _num(row[col])


def _pp_gap(row: pd.Series) -> Optional[float]:
    """Regression gap (projOSI - OSI). Dashboard 'process gap' is ABQ - RCV — see docs/ECOSYSTEM.md."""
    osi = _row_metric(row, "OSI")
    proj = _row_metric(row, "projOSI")
    if osi is None or proj is None:
        pg = _row_metric(row, "PP_Gap")
        if pg is not None:
            return pg
        return None
    return round(proj - osi, 1)


def offense_from_splits(
    vs_rhp: Optional[pd.DataFrame],
    vs_lhp: Optional[pd.DataFrame],
    pals: Optional[pd.DataFrame],
    oor: Optional[pd.DataFrame],
) -> pd.DataFrame:
    lookup: Dict[str, dict] = {}

    def ingest(df: Optional[pd.DataFrame], split: str):
        if df is None or df.empty:
            return
        for _, row in df.iterrows():
            tm = str(row.get("Tm", "")).strip().upper()
            if not tm or tm == "TMS":
                continue
            rec = lookup.setdefault(tm, {})
            rec[f"osi_{split}"] = _row_metric(row, "OSI")
            rec[f"abq_{split}"] = _row_metric(row, "ABQ")
            rec[f"rcv_{split}"] = _row_metric(row, "RCV")
            rec[f"obr_{split}"] = _row_metric(row, "OBR")
            if split == "rhp":
                rec["abq"] = _row_metric(row, "ABQ")
                rec["rcv"] = _row_metric(row, "RCV")
                rec["obr"] = _row_metric(row, "OBR")
                rec["proj_osi"] = _row_metric(row, "projOSI")
                rec["pp_gap"] = _pp_gap(row)

    ingest(vs_rhp, "rhp")
    ingest(vs_lhp, "lhp")

    if pals is not None and not pals.empty:
        for _, row in pals.iterrows():
            tm = str(row.get("Tm", "")).strip().upper()
            if tm:
                lookup.setdefault(tm, {})["pals"] = _row_metric(row, "PALS")

    if oor is not None and not oor.empty:
        for _, row in oor.iterrows():
            tm = str(row.get("Tm", "")).strip().upper()
            if tm:
                lookup.setdefault(tm, {})["oor"] = _row_metric(row, "OOR")

    rows = []
    for tm, rec in lookup.items():
        osi_r = rec.get("osi_rhp")
        osi_l = rec.get("osi_lhp")
        platoon_gap = None
        if osi_r is not None and osi_l is not None:
            platoon_gap = round(osi_r - osi_l, 1)
        rows.append(
            {
                "team": tm,
                "osi": osi_r or rec.get("osi_lhp"),
                "abq": rec.get("abq"),
                "rcv": rec.get("rcv"),
                "obr": rec.get("obr"),
                "proj_osi": rec.get("proj_osi"),
                "pals": rec.get("pals"),
                "oor": rec.get("oor"),
                "pp_gap": rec.get("pp_gap"),
                "osi_vs_rhp": osi_r,
                "osi_vs_lhp": osi_l,
                "abq_vs_rhp": rec.get("abq_rhp"),
                "rcv_vs_rhp": rec.get("rcv_rhp"),
                "obr_vs_rhp": rec.get("obr_rhp"),
                "abq_vs_lhp": rec.get("abq_lhp"),
                "rcv_vs_lhp": rec.get("rcv_lhp"),
                "obr_vs_lhp": rec.get("obr_lhp"),
                "platoon_gap": platoon_gap,
                "platoon_sensitive": bool(
                    platoon_gap is not None and abs(platoon_gap) >= TEAM_PLATOON_OSI_GAP
                ),
            }
        )
    return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["team"])


def _sp_pitch_scores(sp_std: Optional[pd.DataFrame]) -> Dict[str, float]:
    """Per-starter PitchScore keyed by pitcher name."""
    if sp_std is None or sp_std.empty:
        return {}
    from core.config import PITCHING_WEIGHTS
    from core.metrics_utils import clean_pct, invert, normalize

    w_k = PITCHING_WEIGHTS["k_pct"]
    w_bb = PITCHING_WEIGHTS["inv_bb_pct"]
    w_hr = PITCHING_WEIGHTS["inv_hr9"]

    df = sp_std.copy()
    name_col = "Name" if "Name" in df.columns else df.columns[0]
    if "IP" in df.columns:
        df["IP"] = pd.to_numeric(df["IP"], errors="coerce")
        df = df[df["IP"] > 0]
    if df.empty:
        return {}
    df["K%"] = clean_pct(df["K%"]) if "K%" in df.columns else 0
    df["BB%"] = clean_pct(df["BB%"]) if "BB%" in df.columns else 0
    df["HR/9"] = pd.to_numeric(df["HR/9"], errors="coerce")
    df = df.dropna(subset=["K%", "BB%", "HR/9"])
    df["PitchScore"] = (
        w_k * normalize(df["K%"])
        + w_bb * invert(df["BB%"])
        + w_hr * invert(df["HR/9"])
    )
    return df.set_index(name_col)["PitchScore"].round(1).to_dict()


def rotation_summary(
    pitch_df: Optional[pd.DataFrame],
    sp_profiles: Optional[pd.DataFrame],
    sp_std: Optional[pd.DataFrame],
) -> pd.DataFrame:
    rows = []
    if pitch_df is None or pitch_df.empty:
        return pd.DataFrame(columns=["team"])

    pitch_by_team = {}
    if pitch_df is not None and not pitch_df.empty:
        for _, row in pitch_df.iterrows():
            tm = str(row.get("Tm", "")).strip().upper()
            if tm:
                pitch_by_team[tm] = _num(row.get("PitchScore"))

    score_by_name = _sp_pitch_scores(sp_std)

    sp_by_team: Dict[str, List[dict]] = {}
    if sp_profiles is not None and not sp_profiles.empty:
        for _, row in sp_profiles.iterrows():
            tm = str(row.get("pitcher_team", "")).strip().upper()
            if not tm:
                continue
            pname = str(row.get("pitcher_name", ""))
            sp_by_team.setdefault(tm, []).append(
                {
                    "name": pname,
                    "pitch_score": score_by_name.get(pname) or _num(row.get("PitchScore")),
                    "k_pct": _num(row.get("K_pct")),
                    "bb_pct": _num(row.get("BB_pct")),
                    "era": _num(row.get("ERA")),
                    "osi_allowed": _num(row.get("OSI_allowed")),
                    "ip": _num(row.get("avg_IP")),
                    "starts": _num(row.get("starts")),
                    "stale": bool(row.get("stale", False)),
                }
            )

    teams = set(pitch_by_team.keys()) | set(sp_by_team.keys())
    for tm in sorted(teams):
        pitchers = sp_by_team.get(tm, [])
        avg_ps = pitch_by_team.get(tm)
        if avg_ps is None and pitchers:
            scores = [p["pitch_score"] for p in pitchers if p["pitch_score"] is not None]
            avg_ps = sum(scores) / len(scores) if scores else None

        total_ip = sum(p["ip"] or 0 for p in pitchers)
        total_starts = sum(p["starts"] or 0 for p in pitchers)
        avg_ip = round(total_ip / total_starts, 2) if total_starts > 0 else None

        k_vals = [p["k_pct"] for p in pitchers if p["k_pct"] is not None]
        bb_vals = [p["bb_pct"] for p in pitchers if p["bb_pct"] is not None]
        era_vals = [p["era"] for p in pitchers if p["era"] is not None]

        top = sorted(
            [p for p in pitchers if p["name"]],
            key=lambda x: x.get("pitch_score") or 0,
            reverse=True,
        )[:TEAM_TOP_SP_N]
        top_json = json.dumps(
            [{"name": p["name"], "pitch_score": p.get("pitch_score")} for p in top]
        )

        rows.append(
            {
                "team": tm,
                "avg_pitching_score": round(avg_ps, 1) if avg_ps is not None else None,
                "avg_ip_per_start": avg_ip,
                "team_k_pct": round(sum(k_vals) / len(k_vals), 1) if k_vals else None,
                "team_bb_pct": round(sum(bb_vals) / len(bb_vals), 1) if bb_vals else None,
                "team_era": round(sum(era_vals) / len(era_vals), 2) if era_vals else None,
                "top_3_sp": top_json,
            }
        )
    return pd.DataFrame(rows)


def bullpen_summary(unit_df: pd.DataFrame, ind_df: pd.DataFrame, log_df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    if unit_df is None or unit_df.empty:
        return pd.DataFrame(columns=["team"])

    closers: Dict[str, str] = {}
    setups: Dict[str, List[str]] = {}

    if ind_df is not None and log_df is not None:
        for _, row in ind_df.iterrows():
            pid = row.get("pitcher_id")
            name = str(row.get("pitcher_name", ""))
            team = str(row.get("pitcher_team", "")).strip().upper()
            if not team:
                continue
            apps = log_df[
                (log_df["pitcher_id"].astype(str) == str(pid))
                | (log_df["pitcher_name"] == name)
            ]
            saves = (apps["result"] == "save").sum() if "result" in apps.columns else 0
            holds = (apps["result"] == "hold").sum() if "result" in apps.columns else 0
            if saves >= 2:
                closers[team] = name
            elif holds >= 3:
                setups.setdefault(team, []).append(name)

    for _, row in unit_df.iterrows():
        tm = str(row.get("team", "")).strip().upper()
        rows.append(
            {
                "team": tm,
                "bullpen_era": _num(row.get("overall_ERA")),
                "bullpen_osi_allowed": _num(row.get("overall_OSI_allowed")),
                "bullpen_high_lev_era": _num(row.get("high_leverage_ERA")),
                "bullpen_ir_scored_pct": _num(row.get("overall_inherited_runners_scored_pct")),
                "closer_name": closers.get(tm, ""),
                "primary_setup": ";".join(setups.get(tm, [])),
            }
        )
    return pd.DataFrame(rows)


def batter_aggregates(
    batter_df: Optional[pd.DataFrame],
    registry: Optional[pd.DataFrame],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if batter_df is None or batter_df.empty:
        empty = pd.DataFrame(columns=["team"])
        return empty, empty, empty

    pos_map: Dict[str, str] = {}
    if registry is not None and not registry.empty:
        for _, row in registry.iterrows():
            pos_map[str(row.get("full_name", "")).strip()] = str(row.get("position", ""))

    batters = batter_df[batter_df["split_type"] == "vs_RHP"].copy()
    if batters.empty:
        batters = batter_df.copy()

    top_rows = []
    home_away_rows = []
    trend_adj = []

    for tm, pdf in batters.groupby("team"):
        tm = str(tm).strip().upper()
        top5 = pdf.nlargest(TEAM_TOP_BATTERS_N, "OSI")[
            ["player_name", "OSI", "trend"]
        ].to_dict("records")
        for rec in top5:
            rec["position"] = pos_map.get(rec["player_name"], "")
        top_rows.append({"team": tm, "top_batters": json.dumps(top5)})

        home = batter_df[(batter_df["team"] == tm) & (batter_df["split_type"] == "home")]
        away = batter_df[(batter_df["team"] == tm) & (batter_df["split_type"] == "away")]
        h_osi = home["OSI"].mean() if not home.empty else None
        a_osi = away["OSI"].mean() if not away.empty else None
        gap = round(h_osi - a_osi, 1) if h_osi is not None and a_osi is not None else None
        home_away_rows.append(
            {
                "team": tm,
                "home_osi": round(h_osi, 1) if h_osi is not None else None,
                "away_osi": round(a_osi, 1) if a_osi is not None else None,
                "home_away_osi_gap": gap,
            }
        )

        trends = pdf["trend"].tolist() if "trend" in pdf.columns else []
        rising = trends.count("rising")
        falling = trends.count("falling")
        adj = (rising - falling) * 1.5
        trend_adj.append({"team": tm, "trend_adj": adj})

    return (
        pd.DataFrame(top_rows),
        pd.DataFrame(home_away_rows),
        pd.DataFrame(trend_adj),
    )


def _team_series(scored: pd.DataFrame) -> pd.Series:
    if "team" in scored.columns:
        return scored["team"].astype(str).str.strip().str.upper()
    if "Tm" in scored.columns:
        return scored["Tm"].astype(str).str.strip().str.upper()
    return pd.Series(dtype=str)


def team_offense_from_batter_csv(filename: str) -> Dict[str, Dict[str, float]]:
    """PA-weighted team ABQ/RCV/OBR/OSI from a dated batter split export."""
    from core.compute_batter_profile import compute_metrics_pool

    df = _load(filename)
    if df is None or df.empty:
        return {}
    scored = compute_metrics_pool(df)
    if scored.empty:
        return {}
    scored = scored.copy()
    scored["_team"] = _team_series(scored)
    out: Dict[str, Dict[str, float]] = {}
    for tm, pdf in scored.groupby("_team"):
        tm = str(tm).strip().upper()
        if not tm or tm == "NAN":
            continue
        pa = pd.to_numeric(pdf.get("PA"), errors="coerce").fillna(0)
        total_pa = float(pa.sum())
        if total_pa < 1:
            continue
        weights = pa / total_pa

        def wmean(col: str) -> Optional[float]:
            if col not in pdf.columns:
                return None
            vals = pd.to_numeric(pdf[col], errors="coerce")
            mask = vals.notna()
            if not mask.any():
                return None
            w = weights[mask]
            w = w / w.sum()
            return round(float((vals[mask] * w).sum()), 1)

        metrics = {k: wmean(k.upper()) for k in METRIC_KEYS}
        for rate_key, col in RATE_COL_MAP.items():
            val = wmean(col)
            if val is not None:
                if rate_key == "wrc":
                    metrics[rate_key] = round(val, 1)
                elif rate_key in ("woba", "xwoba", "slg"):
                    metrics[rate_key] = round(val, 3)
                else:
                    metrics[rate_key] = val
        if metrics.get("osi") is None:
            continue
        out[tm] = metrics
    return out


def location_offense_frame() -> pd.DataFrame:
    """PA-weighted home/away team offense from batter split exports."""
    home = team_offense_from_batter_csv("batter_splits_home.csv")
    away = team_offense_from_batter_csv("batter_splits_away.csv")
    teams = sorted(set(home.keys()) | set(away.keys()))
    rows = []
    for tm in teams:
        h = home.get(tm, {})
        a = away.get(tm, {})
        rec: dict = {"team": tm}
        for prefix, pack in (("home", h), ("away", a)):
            for key in (*METRIC_KEYS, *RATE_COL_MAP.keys()):
                val = pack.get(key)
                if val is not None:
                    rec[f"{prefix}_{key}"] = val
        h_osi, a_osi = h.get("osi"), a.get("osi")
        if h_osi is not None and a_osi is not None:
            rec["home_away_osi_gap"] = round(h_osi - a_osi, 1)
        rows.append(rec)
    return pd.DataFrame(rows)


def _load_metric_history() -> pd.DataFrame:
    path = DATA_DIR / METRIC_HISTORY_FILE
    legacy = DATA_DIR / LEGACY_HISTORY_FILE
    if path.exists():
        hist = pd.read_csv(path)
    elif legacy.exists():
        hist = pd.read_csv(legacy)
    else:
        hist = pd.DataFrame(columns=["date", "team", *METRIC_KEYS])
    for col in ("date", "team", *METRIC_KEYS):
        if col not in hist.columns:
            hist[col] = None
    if not hist.empty:
        hist["date"] = pd.to_datetime(hist["date"], errors="coerce")
    hist["team"] = hist["team"].astype(str).str.strip().str.upper()
    return hist


def _append_metric_history(offense_df: pd.DataFrame, today: str) -> pd.DataFrame:
    hist = _load_metric_history()
    today_rows = []
    for _, row in offense_df.iterrows():
        tm = str(row.get("team", "")).strip().upper()
        if not tm:
            continue
        rec = {"date": today, "team": tm}
        for metric in METRIC_KEYS:
            rec[metric] = _num(row.get(metric))
        if rec.get("osi") is None:
            continue
        today_rows.append(rec)
    if not today_rows:
        return hist
    today_df = pd.DataFrame(today_rows)
    today_df["date"] = pd.to_datetime(today_df["date"])
    if not hist.empty and hist["date"].notna().any():
        hist = hist[hist["date"].dt.strftime("%Y-%m-%d") != today]
    hist = pd.concat([hist, today_df], ignore_index=True)
    hist.to_csv(DATA_DIR / METRIC_HISTORY_FILE, index=False)
    return hist


def _history_window_avg(
    hist: pd.DataFrame,
    team: str,
    metric: str,
    cutoff: pd.Timestamp,
    fallback: Optional[float],
    min_obs: int = 2,
) -> Optional[float]:
    sub = hist[(hist["team"] == team) & (hist["date"] >= cutoff)][metric].dropna()
    if len(sub) >= min_obs:
        return round(float(sub.mean()), 1)
    if len(sub) == 1:
        return round(float(sub.iloc[0]), 1)
    return fallback


def _blend_metric(
    ytd: Optional[float],
    l30: Optional[float],
    l14: Optional[float],
    l7: Optional[float],
) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Fill missing L14/L7 using available window splits."""
    if l14 is None and l7 is not None and l30 is not None:
        l14 = round(0.5 * l7 + 0.5 * l30, 1)
    if l7 is None and l14 is not None and l30 is not None:
        l7 = round(0.65 * l14 + 0.35 * l30, 1)
    if l30 is None and l14 is not None:
        l30 = l14
    if l14 is None and l30 is not None:
        l14 = l30
    if l7 is None and l14 is not None:
        l7 = l14
    if l7 is None and l30 is not None:
        l7 = l30
    if l30 is None and ytd is not None:
        l30 = ytd
    if l14 is None and ytd is not None:
        l14 = ytd
    if l7 is None and ytd is not None:
        l7 = ytd
    return l30, l14, l7


def window_trend(offense_df: pd.DataFrame, trend_adj_df: pd.DataFrame) -> pd.DataFrame:
    """Rolling L30/L14/L7 team metrics from dated batter splits + daily history."""
    from datetime import datetime, timedelta

    base_cols = [
        "team", "osi_ytd", "osi_l30", "osi_l14", "osi_l7",
        "abq_l30", "abq_l14", "abq_l7",
        "rcv_l30", "rcv_l14", "rcv_l7",
        "obr_l30", "obr_l14", "obr_l7",
        "window_direction",
    ]
    if offense_df.empty:
        return pd.DataFrame(columns=base_cols)

    today = datetime.now().strftime("%Y-%m-%d")
    hist = _append_metric_history(offense_df, today)
    cutoffs = {
        "l7": pd.Timestamp(today) - timedelta(days=7),
        "l14": pd.Timestamp(today) - timedelta(days=14),
        "l30": pd.Timestamp(today) - timedelta(days=30),
    }

    split_windows = {}
    for key, fname in WINDOW_SPLIT_FILES.items():
        fpath = DATA_DIR / fname
        if not fpath.exists():
            print(f"  WARNING: {fname} missing -- {key} windows use history/YTD fallback")
        split_windows[key] = team_offense_from_batter_csv(fname)

    rows = []
    for _, off in offense_df.iterrows():
        tm = str(off.get("team", "")).strip().upper()
        if not tm:
            continue
        ytd = {m: _num(off.get(m)) for m in METRIC_KEYS}
        if ytd.get("osi") is None:
            continue

        window_vals: Dict[str, Dict[str, Optional[float]]] = {k: {} for k in ("l30", "l14", "l7")}
        for win_key in ("l30", "l14", "l7"):
            split_team = split_windows.get(win_key, {}).get(tm, {})
            for metric in METRIC_KEYS:
                val = _num(split_team.get(metric))
                if val is None:
                    val = _history_window_avg(hist, tm, metric, cutoffs[win_key], ytd.get(metric))
                window_vals[win_key][metric] = val

        osi_l30, osi_l14, osi_l7 = _blend_metric(
            ytd.get("osi"),
            window_vals["l30"].get("osi"),
            window_vals["l14"].get("osi"),
            window_vals["l7"].get("osi"),
        )
        abq_l30, abq_l14, abq_l7 = _blend_metric(
            ytd.get("abq"),
            window_vals["l30"].get("abq"),
            window_vals["l14"].get("abq"),
            window_vals["l7"].get("abq"),
        )
        rcv_l30, rcv_l14, rcv_l7 = _blend_metric(
            ytd.get("rcv"),
            window_vals["l30"].get("rcv"),
            window_vals["l14"].get("rcv"),
            window_vals["l7"].get("rcv"),
        )
        obr_l30, obr_l14, obr_l7 = _blend_metric(
            ytd.get("obr"),
            window_vals["l30"].get("obr"),
            window_vals["l14"].get("obr"),
            window_vals["l7"].get("obr"),
        )

        base_osi = ytd.get("osi")
        direction = "stable"
        if osi_l7 is not None and base_osi is not None:
            if osi_l7 - base_osi >= TEAM_WINDOW_HOT_COLD_GAP:
                direction = "rising"
            elif osi_l7 - base_osi <= -TEAM_WINDOW_HOT_COLD_GAP:
                direction = "falling"

        rows.append({
            "team": tm,
            "osi_ytd": base_osi,
            "osi_l30": osi_l30,
            "osi_l14": osi_l14,
            "osi_l7": osi_l7,
            "abq_l30": abq_l30,
            "abq_l14": abq_l14,
            "abq_l7": abq_l7,
            "rcv_l30": rcv_l30,
            "rcv_l14": rcv_l14,
            "rcv_l7": rcv_l7,
            "obr_l30": obr_l30,
            "obr_l14": obr_l14,
            "obr_l7": obr_l7,
            "window_direction": direction,
        })
    return pd.DataFrame(rows)


def _merge_team(base: pd.DataFrame, *frames: pd.DataFrame) -> pd.DataFrame:
    out = base
    for frame in frames:
        if frame is None or frame.empty:
            continue
        out = out.merge(frame, on="team", how="outer")
    return out


def run():
    print("Computing team profiles...")

    vs_rhp = _load("metrics_vs_RHP.csv")
    vs_lhp = _load("metrics_vs_LHP.csv")
    pals = _load("metrics_pals.csv")
    oor = _load("metrics_oor.csv")
    pitch = _load("metrics_pitching_score.csv")
    unit = _load("bullpen_unit.csv")
    ind = _load("bullpen_individual.csv")
    log = _load("reliever_gamelog.csv")
    sp_profiles = _load("sp_profiles.csv")
    sp_std = _load("sp_standard.csv")
    batter = _load("batter_profiles.csv")
    registry = _load("player_registry.csv")

    offense = offense_from_splits(vs_rhp, vs_lhp, pals, oor)
    rotation = rotation_summary(pitch, sp_profiles, sp_std)
    bullpen = bullpen_summary(unit, ind, log)
    top_b, ha, trend_adj = batter_aggregates(batter, registry)
    loc_offense = location_offense_frame()
    if not ha.empty:
        ha = ha.drop(
            columns=[c for c in ("home_osi", "away_osi", "home_away_osi_gap") if c in ha.columns],
            errors="ignore",
        )
    windows = window_trend(offense, trend_adj)

    all_teams: set = (
        set(offense["team"].dropna().astype(str).tolist())
        if not offense.empty and "team" in offense.columns
        else set()
    )
    for df in (rotation, bullpen, top_b, ha):
        if not df.empty and "team" in df.columns:
            all_teams |= set(df["team"].dropna().astype(str).tolist())

    if not all_teams:
        print("  No team data available -- writing empty team_profiles.csv")
        pd.DataFrame(columns=PROFILE_COLUMNS).to_csv(DATA_DIR / "team_profiles.csv", index=False)
        return

    profile = offense
    profile = _merge_team(profile, rotation, bullpen, top_b, ha, loc_offense, windows)
    profile["record_placeholder"] = "--"

    for col in PROFILE_COLUMNS:
        if col not in profile.columns:
            profile[col] = None

    profile = profile[PROFILE_COLUMNS]
    profile = profile.where(pd.notnull(profile), None).fillna("")
    out_path = DATA_DIR / "team_profiles.csv"
    profile.to_csv(out_path, index=False)
    print(f"  Saved {len(profile)} team profiles -> {out_path}")


if __name__ == "__main__":
    run()
