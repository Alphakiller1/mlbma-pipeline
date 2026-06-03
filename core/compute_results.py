"""Aggregate team game-results metrics (YTD/L30/L14/L7 + home/away)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, Iterable

import pandas as pd

from core.config import DATA_DIR, TEAM_MAP

INPUT_FILE = DATA_DIR / "game_results.csv"
OUTPUT_FILE = DATA_DIR / "team_results.csv"
WINDOW_DAYS = {"l30": 30, "l14": 14, "l7": 7}

BASE_METRICS = [
    "games",
    "wins",
    "losses",
    "runs_scored",
    "runs_allowed",
    "runs_per_game",
    "win_pct",
    "f5_wins",
    "f5_losses",
    "f5_ties",
    "f5_win_pct",
    "f5_push_pct",
    "sp_wins",
    "rp_wins",
    "sp_win_pct",
    "rp_win_pct",
    "qs",
    "qs_against",
    "qs_pct",
    "qs_against_pct",
    "pitch_inn",
    "saves",
    "blown_saves",
    "blown_save_pct",
]


def _safe_rate(num: float, den: float, digits: int = 3):
    if den <= 0:
        return None
    return round(float(num) / float(den), digits)


def _prep(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out.dropna(subset=["date"])
    out["team"] = out["team"].astype(str).str.strip().str.upper()
    out["home_away"] = out["home_away"].astype(str).str.strip().str.lower()
    out["result"] = out["result"].astype(str).str.strip().str.upper()
    out["lead_after_5"] = out["lead_after_5"].astype(str).str.strip()
    out["save_pitcher_id"] = pd.to_numeric(out.get("save_pitcher_id"), errors="coerce")
    out["winning_pitcher_is_starter"] = out.get("winning_pitcher_is_starter", False).fillna(False).astype(bool)
    out["team_quality_start"] = out.get("team_quality_start", False).fillna(False).astype(bool)
    out["opp_quality_start"] = out.get("opp_quality_start", False).fillna(False).astype(bool)
    out["blown_save"] = out.get("blown_save", False).fillna(False).astype(bool)
    return out


def _aggregate(df: pd.DataFrame) -> Dict[str, float]:
    games = len(df)
    wins = int((df["result"] == "W").sum())
    losses = int((df["result"] == "L").sum())
    f5_wins = int((df["lead_after_5"] == "W").sum())
    f5_losses = int((df["lead_after_5"] == "L").sum())
    f5_ties = int((df["lead_after_5"] == "tie").sum())
    f5_decisions = f5_wins + f5_losses
    sp_wins = int(((df["result"] == "W") & (df["winning_pitcher_is_starter"])).sum())
    rp_wins = int(((df["result"] == "W") & (~df["winning_pitcher_is_starter"])).sum())
    qs = int(df["team_quality_start"].sum())
    qs_against = int(df["opp_quality_start"].sum())
    # Real pitches/inning the lineup forces = opposing pitches / innings the team batted
    # (replaces the dashboard's 92/IP-per-start proxy). Higher = grindier lineup.
    if "opp_pitches" in df.columns and "team_innings_batted" in df.columns:
        opp_pitches = pd.to_numeric(df["opp_pitches"], errors="coerce").sum()
        innings_batted = pd.to_numeric(df["team_innings_batted"], errors="coerce").sum()
        pitch_inn = round(float(opp_pitches) / float(innings_batted), 2) if innings_batted > 0 else None
    else:
        pitch_inn = None
    saves = int(((df["result"] == "W") & (df["save_pitcher_id"].notna())).sum())
    blown_saves = int(df["blown_save"].sum())
    save_opps = saves + blown_saves
    runs_scored = int(df["team_runs"].sum()) if "team_runs" in df.columns else None
    runs_allowed = int(df["opp_runs"].sum()) if "opp_runs" in df.columns else None
    runs_per_game = (
        round(float(runs_scored) / float(games), 2)
        if runs_scored is not None and games > 0
        else None
    )

    return {
        "games": games,
        "wins": wins,
        "losses": losses,
        "runs_scored": runs_scored,
        "runs_allowed": runs_allowed,
        "runs_per_game": runs_per_game,
        "win_pct": _safe_rate(wins, games),
        "f5_wins": f5_wins,
        "f5_losses": f5_losses,
        "f5_ties": f5_ties,
        "f5_win_pct": _safe_rate(f5_wins, f5_decisions),
        "f5_push_pct": _safe_rate(f5_ties, games),
        "sp_wins": sp_wins,
        "rp_wins": rp_wins,
        "sp_win_pct": _safe_rate(sp_wins, games),
        "rp_win_pct": _safe_rate(rp_wins, games),
        "qs": qs,
        "qs_against": qs_against,
        "qs_pct": _safe_rate(qs, games),
        "qs_against_pct": _safe_rate(qs_against, games),
        "pitch_inn": pitch_inn,
        "saves": saves,
        "blown_saves": blown_saves,
        "blown_save_pct": _safe_rate(blown_saves, save_opps),
    }


def _apply_suffixed(dst: dict, pack: Dict[str, float], suffix: str, include_counts: Iterable[str]) -> None:
    keep_counts = set(include_counts)
    for key, val in pack.items():
        if key in keep_counts or key.endswith("_pct") or key == "pitch_inn":
            dst[f"{key}_{suffix}"] = val


def run():
    print("Computing team results metrics...")
    if not INPUT_FILE.exists():
        print("  WARNING: game_results.csv not found")
        pd.DataFrame(columns=["team"]).to_csv(OUTPUT_FILE, index=False)
        return

    raw = pd.read_csv(INPUT_FILE)
    if raw.empty:
        print("  game_results.csv is empty")
        pd.DataFrame(columns=["team"]).to_csv(OUTPUT_FILE, index=False)
        return

    df = _prep(raw)
    official_teams = set(TEAM_MAP.values())
    df = df[df["team"].isin(official_teams)]
    teams = sorted(official_teams)
    today = datetime.now().date()

    rows = []
    for team in teams:
        tdf = df[df["team"] == team]
        row = {"team": team}
        if tdf.empty:
            for metric in BASE_METRICS:
                row[metric] = None
            for win in WINDOW_DAYS:
                row[f"win_pct_{win}"] = None
                row[f"f5_win_pct_{win}"] = None
                row[f"sp_win_pct_{win}"] = None
                row[f"rp_win_pct_{win}"] = None
                row[f"qs_pct_{win}"] = None
                row[f"qs_against_pct_{win}"] = None
                row[f"pitch_inn_{win}"] = None
                row[f"blown_save_pct_{win}"] = None
            for loc in ("home", "away"):
                row[f"win_pct_{loc}"] = None
                row[f"f5_win_pct_{loc}"] = None
                row[f"sp_win_pct_{loc}"] = None
                row[f"rp_win_pct_{loc}"] = None
                row[f"qs_pct_{loc}"] = None
                row[f"qs_against_pct_{loc}"] = None
                row[f"pitch_inn_{loc}"] = None
                row[f"blown_save_pct_{loc}"] = None
            rows.append(row)
            continue

        ytd = _aggregate(tdf)
        row.update(ytd)

        for loc in ("home", "away"):
            ldf = tdf[tdf["home_away"] == loc]
            _apply_suffixed(
                row,
                _aggregate(ldf),
                loc,
                include_counts=("games", "wins", "losses", "saves", "blown_saves"),
            )

        for label, days in WINDOW_DAYS.items():
            cutoff = pd.Timestamp(today - timedelta(days=days))
            wdf = tdf[tdf["date"] >= cutoff]
            _apply_suffixed(
                row,
                _aggregate(wdf),
                label,
                include_counts=("games", "wins", "losses", "saves", "blown_saves"),
            )

        rows.append(row)

    out = pd.DataFrame(rows).sort_values("team").reset_index(drop=True)
    out = out.where(pd.notnull(out), None).fillna("")
    out.to_csv(OUTPUT_FILE, index=False)
    print(f"  Saved {len(out)} team rows -> {OUTPUT_FILE}")


if __name__ == "__main__":
    run()
