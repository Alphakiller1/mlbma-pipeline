"""Derive batter split leaderboards from the local game log.

Fallback for `scrapers/scrape_batter_splits.py`. FanGraphs moved its splits
leaderboards behind a Cloudflare interstitial that the scraper cannot clear, so every
split export came back empty and the eight Batter_Splits_* tabs went header-only,
blanking the site's lineup-vs-pitcher, lineup-vs-relief and Recent Form panels.

`batter_gamelog.csv` already holds one row per batter per game with the counting stats
and the context needed to slice them, so the rate stats those panels display can be
rebuilt in-house with no external dependency.

WHAT IS EXACT vs APPROXIMATE
----------------------------
Exact from the log: PA, AB, AVG, SLG, ISO, BB%, K%.

Approximate, and deliberately so:
  * OBP / wOBA / BABIP - the log carries no sacrifice flies, so SF is absent from the
    denominators. OBP and wOBA read a hair high; BABIP a hair low. The error is on the
    order of a point or two and is uniform across players.
  * wOBA uses the standard linear weights below, and its BB term includes intentional
    walks because the log does not separate them.
  * wRC+ is park-neutral and is scaled against the league average of *this* dataset
    over the same window, not FanGraphs' league constants. It answers "how does this
    bat compare to the rest of this board", which is what the lineup tables use it for.
  * vs_RHP / vs_LHP are sliced on the OPPOSING STARTER's hand, so they are full-game
    lines from games started by a righty or a lefty - NOT true plate-appearance platoon
    splits. Relief appearances by the other hand are inside these numbers. The product
    already thinks in starter-hand terms (the matchup card's "VS LHP" lineup edge, and
    team_l10_sp_hand), so the slice is consistent with the rest of the dashboard, but
    it is not identical to a FanGraphs platoon split.

Not derivable here, left empty: xwOBA and Launch Angle come from Savant (merged when
available), and wRC+ aside, the plate-discipline and batted-ball rates (Chase%, ZCon%,
OCon%, SwStr%, Barrel%, HardHit%) have no source in the game log.

vsSP / vsRP are NOT produced: the log records only the opposing starter, so there is no
way to separate a batter's work against starters from his work against relief.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

import pandas as pd

from core.config import BATTER_RECENT_DAYS, DATA_DIR

# Output schema, matching what the FanGraphs scraper wrote so the sheet push and every
# dashboard consumer see an unchanged set of columns.
#
# `Tm` is REQUIRED, not decoration. matchup_lineup_compare.js keys every batter as
# normName(Name) + '|' + teamKey(Tm) and drops any row where either is missing, so a
# team-less table indexes to nothing and the whole lineup panel renders em dashes.
# The header on an empty split CSV is misleading here - save_split() writes just
# ["Name"] + OUTPUT_STATS when it has no data, while a populated export also carried Tm.
OUTPUT_COLUMNS = [
    "Name", "Tm", "PA", "AB", "AVG", "OBP", "SLG", "BB%", "K%", "wOBA", "xwOBA", "wRC+",
    "ISO", "BABIP", "Chase%", "ZCon%", "OCon%", "SwStr%", "Barrel%", "HardHit%",
    "Launch Angle",
]

# Standard linear weights. wOBA is only meaningful relative to the league average that
# shares its weights, and wRC+ below is computed against exactly that average, so the
# pair stays internally consistent even if these drift from the official season values.
W_BB, W_HBP, W_1B, W_2B, W_3B, W_HR = 0.690, 0.722, 0.888, 1.271, 1.616, 2.101
WOBA_SCALE = 1.25

# split key -> (output filename, row filter)
SPLIT_FILTERS = {
    "rhp": ("batter_splits_rhp.csv", lambda d: d["opp_starter_hand"].str.upper().eq("R")),
    "lhp": ("batter_splits_lhp.csv", lambda d: d["opp_starter_hand"].str.upper().eq("L")),
    "home": ("batter_splits_home.csv", lambda d: d["home_away"].str.lower().eq("home")),
    "away": ("batter_splits_away.csv", lambda d: d["home_away"].str.lower().eq("away")),
}
# window key -> (output filename, lookback days or None for the whole season)
WINDOW_FILES = {
    "overall": ("batter_splits_overall.csv", None),
    "recent": ("batter_splits_recent.csv", BATTER_RECENT_DAYS),
    "l14": ("batter_splits_l14.csv", 14),
    "l7": ("batter_splits_l7.csv", 7),
}


def _aggregate(rows: pd.DataFrame, min_pa: int) -> pd.DataFrame:
    """Collapse per-game rows into one rate line per batter."""
    if rows.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    counting = ["PA", "AB", "H", "1B", "2B", "3B", "HR", "TB", "R", "BB", "SO", "HBP"]
    have = [c for c in counting if c in rows.columns]
    grouped = rows.groupby("player_name", as_index=False)[have].sum(numeric_only=True)
    # Team comes from the batter's most recent game in the slice, so a mid-season trade
    # indexes him under the club he actually plays for today.
    meta_cols = [c for c in ("player_id", "team") if c in rows.columns]
    if meta_cols:
        latest = rows.sort_values("date") if "date" in rows.columns else rows
        meta = latest.groupby("player_name", as_index=False)[meta_cols].last()
        grouped = grouped.merge(meta, on="player_name", how="left")
    if "team" in grouped.columns:
        grouped = grouped.rename(columns={"team": "Tm"})
    grouped = grouped[grouped["PA"] >= max(1, min_pa)].copy()
    if grouped.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    pa = grouped["PA"].replace(0, pd.NA)
    ab = grouped["AB"].replace(0, pd.NA)
    # No sacrifice flies in the log; see the module docstring.
    ob_denom = (grouped["AB"] + grouped["BB"] + grouped["HBP"]).replace(0, pd.NA)

    grouped["AVG"] = grouped["H"] / ab
    grouped["OBP"] = (grouped["H"] + grouped["BB"] + grouped["HBP"]) / ob_denom
    grouped["SLG"] = grouped["TB"] / ab
    grouped["ISO"] = grouped["SLG"] - grouped["AVG"]
    grouped["BB%"] = grouped["BB"] / pa
    grouped["K%"] = grouped["SO"] / pa
    bip = (grouped["AB"] - grouped["SO"] - grouped["HR"]).replace(0, pd.NA)
    grouped["BABIP"] = (grouped["H"] - grouped["HR"]) / bip
    grouped["wOBA"] = (
        W_BB * grouped["BB"] + W_HBP * grouped["HBP"] + W_1B * grouped["1B"]
        + W_2B * grouped["2B"] + W_3B * grouped["3B"] + W_HR * grouped["HR"]
    ) / ob_denom

    # Park-neutral wRC+ against this board's own league average (see docstring).
    tot_pa = float(grouped["PA"].sum())
    lg_woba = float(
        (W_BB * grouped["BB"].sum() + W_HBP * grouped["HBP"].sum()
         + W_1B * grouped["1B"].sum() + W_2B * grouped["2B"].sum()
         + W_3B * grouped["3B"].sum() + W_HR * grouped["HR"].sum())
        / max(1.0, float(ob_denom.sum()))
    )
    lg_rpa = float(grouped["R"].sum()) / max(1.0, tot_pa) if "R" in grouped else 0.0
    if lg_rpa > 0:
        wraa_pa = (grouped["wOBA"] - lg_woba) / WOBA_SCALE
        grouped["wRC+"] = ((wraa_pa + lg_rpa) / lg_rpa) * 100.0
    else:
        grouped["wRC+"] = pd.NA

    grouped = grouped.rename(columns={"player_name": "Name"})
    for col in OUTPUT_COLUMNS:
        if col not in grouped.columns:
            grouped[col] = pd.NA
    out = grouped[OUTPUT_COLUMNS + (["player_id"] if "player_id" in grouped else [])].copy()
    for col in ("AVG", "OBP", "SLG", "wOBA", "ISO", "BABIP"):
        out[col] = pd.to_numeric(out[col], errors="coerce").round(3)
    for col in ("BB%", "K%"):
        out[col] = pd.to_numeric(out[col], errors="coerce").round(4)
    out["wRC+"] = pd.to_numeric(out["wRC+"], errors="coerce").round(0)
    return out.sort_values("PA", ascending=False).reset_index(drop=True)


def _merge_savant(df: pd.DataFrame, savant: pd.DataFrame | None) -> pd.DataFrame:
    """Attach season-level xwOBA / Launch Angle from Savant.

    Joined on player_id, never on name: Savant writes "Grichuk Randal" where the game
    log has "Randal Grichuk", so a name join matches zero of 359 rows while the id join
    matches 388.
    """
    if df.empty or savant is None or savant.empty:
        return df[OUTPUT_COLUMNS]
    if "player_id" not in savant.columns or "player_id" not in df.columns:
        return df[OUTPUT_COLUMNS]
    keep = [c for c in ("player_id", "xwOBA", "Launch Angle") if c in savant.columns]
    src = savant[keep].drop_duplicates("player_id")
    left = df.copy()
    left["player_id"] = pd.to_numeric(left["player_id"], errors="coerce")
    src = src.copy()
    src["player_id"] = pd.to_numeric(src["player_id"], errors="coerce")
    merged = left.merge(src, on="player_id", how="left", suffixes=("", "_sv"))
    for col in ("xwOBA", "Launch Angle"):
        if f"{col}_sv" in merged.columns:
            merged[col] = merged[f"{col}_sv"]
    return merged[OUTPUT_COLUMNS]


def _is_empty_csv(path: str) -> bool:
    if not os.path.exists(path):
        return True
    try:
        return len(pd.read_csv(path)) == 0
    except Exception:
        return True


# Which split files this module last wrote. Without it the fallback would only ever fill
# a file that is *empty*, so the first successful derivation would make every file
# non-empty and every later run would skip them - the tables would freeze at today's
# numbers for as long as FanGraphs stays blocked. A file listed here is ours to refresh;
# a file absent from it came from a real export and is left alone.
MARKER = os.path.join(DATA_DIR, ".batter_splits_derived.json")


def _read_marker() -> set[str]:
    try:
        with open(MARKER, encoding="utf-8") as fh:
            return set(json.load(fh).get("derived", []))
    except Exception:
        return set()


def _write_marker(names: set[str]) -> None:
    try:
        with open(MARKER, "w", encoding="utf-8") as fh:
            json.dump({"derived": sorted(names),
                       "updated": datetime.now().isoformat(timespec="seconds")}, fh,
                      indent=2)
    except Exception as exc:
        print(f"  compute_batter_splits: could not write {MARKER} ({exc})")


def clear_marker_for(filename: str) -> None:
    """Drop a file from the derived set - call when a real export overwrites it."""
    current = _read_marker()
    if filename in current:
        current.discard(filename)
        _write_marker(current)


def build(gamelog: pd.DataFrame, savant: pd.DataFrame | None = None,
          as_of: datetime | None = None) -> dict[str, pd.DataFrame]:
    """All eight derived split tables, keyed by output filename."""
    gl = gamelog.copy()
    gl["date"] = pd.to_datetime(gl["date"], errors="coerce").dt.normalize()
    gl = gl.dropna(subset=["date", "player_name"])
    for col in ("opp_starter_hand", "home_away"):
        if col in gl.columns:
            gl[col] = gl[col].astype(str)

    # Anchor the windows to the newest game in the log, not to the wall clock. The log
    # can lag the calendar by days when a scrape stalls, and a clock-anchored L7 then
    # selects a range with no games in it and silently produces an empty table. Anchored
    # to the data, "last 7 days" always means the 7 most recent days that have games.
    anchor = gl["date"].max()
    if as_of is not None:
        anchor = min(anchor, pd.Timestamp(as_of).normalize())
    lag = (pd.Timestamp(datetime.now()).normalize() - anchor).days
    if lag > 1:
        print(f"  compute_batter_splits: game log ends {anchor.date()} ({lag} days "
              f"behind today) - windows anchored to that date")

    # Every batter with a single plate appearance is kept. The PA floors in
    # BATTER_WINDOW_MIN_PA exist to keep the FanGraphs *export* small, and that scraper
    # still had to run a separate minPA=1 "lineup gap fill" pass afterwards so today's
    # starters would not be missing from the tables. Deriving locally costs nothing per
    # row, so coverage is free: applying the 50-PA floor here left only 2 of 9 Dodgers
    # starters in the vs-LHP table and the lineup panel rendered as em dashes.
    tables: dict[str, pd.DataFrame] = {}
    for key, (filename, days) in WINDOW_FILES.items():
        rows = gl if days is None else gl[gl["date"] >= (anchor - timedelta(days=days - 1))]
        tables[filename] = _merge_savant(_aggregate(rows, 1), savant)
    # Hand and venue splits are season-long, matching what the scraper produced.
    for key, (filename, predicate) in SPLIT_FILTERS.items():
        tables[filename] = _merge_savant(_aggregate(gl[predicate(gl)], 1), savant)
    return tables


def run(force: bool = False) -> dict[str, int]:
    """Fill empty split CSVs from the game log.

    Only writes a file that is missing or empty unless `force` is set: a real FanGraphs
    export is richer than this derivation (true platoon splits, plate discipline, batted
    ball) and must never be silently replaced by it.
    """
    gl_path = os.path.join(DATA_DIR, "batter_gamelog.csv")
    if not os.path.exists(gl_path):
        print("  compute_batter_splits: batter_gamelog.csv missing - nothing to derive")
        return {}
    gamelog = pd.read_csv(gl_path)
    if gamelog.empty:
        print("  compute_batter_splits: batter_gamelog.csv is empty - nothing to derive")
        return {}

    savant_path = os.path.join(DATA_DIR, "batter_savant_rates.csv")
    savant = pd.read_csv(savant_path) if os.path.exists(savant_path) else None

    tables = build(gamelog, savant)
    previously_derived = _read_marker()
    written: dict[str, int] = {}
    for filename, df in tables.items():
        path = os.path.join(DATA_DIR, filename)
        ours = filename in previously_derived
        if not force and not ours and not _is_empty_csv(path):
            print(f"  compute_batter_splits: {filename} has a real export - left alone")
            continue
        if df.empty:
            print(f"  compute_batter_splits: {filename} derived empty - not written")
            continue
        df.to_csv(path, index=False)
        written[filename] = len(df)
        print(f"  compute_batter_splits: derived {len(df)} rows -> {filename}"
              + (" (refreshed)" if ours else ""))
    if written:
        _write_marker(previously_derived | set(written))
    if written:
        print(f"  compute_batter_splits: filled {len(written)} split file(s) from the "
              f"game log (FanGraphs export unavailable)")
    return written


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true",
                    help="overwrite split CSVs even when they already hold rows")
    run(force=ap.parse_args().force)
