"""Batter situational splits from the MLB Stats API.

Replaces the FanGraphs splits export, which sits behind a Cloudflare interstitial the
scraper cannot clear. MLB publishes the same situational cuts as official statSplits,
free and unauthenticated:

    /api/v1/people/{id}/stats?stats=statSplits&sitCodes=sp,rp,vl,vr,h,a&season=&group=hitting

One request per batter returns every code, so the whole league costs ~400 calls.

This is the source of record for four things the game log cannot produce:

  * `sp` / `rp` - vs starters and vs relievers. The game log records only the opposing
    STARTER, so a batter's work against a bullpen is invisible to it. These two feed
    Batter_Splits_vsSP / vsRP, which drive the lineup-vs-relief board.
  * `vl` / `vr` - TRUE plate-appearance platoon splits. `core.compute_batter_splits`
    can only approximate these by slicing whole games on the starter's hand, which
    silently folds in every relief appearance by the other hand.

It is also more exact than the game log on the rate stats: the payload carries
sacFlies and intentionalWalks, so wOBA uses the real denominator (AB + uBB + SF + HBP)
with unintentional walks only, and AVG / OBP / SLG / BABIP are taken straight from MLB
rather than recomputed.

wRC+ remains park-neutral and scaled to this board's own league average - see
core.compute_batter_splits for the reasoning.
"""

from __future__ import annotations

import concurrent.futures as cf
import json
import os
import time
import urllib.error
import urllib.request

import pandas as pd

from core.compute_batter_splits import (
    OUTPUT_COLUMNS,
    W_1B,
    W_2B,
    W_3B,
    W_BB,
    W_HBP,
    W_HR,
    WOBA_SCALE,
    _merge_savant,
    clear_marker_for,
)
from core.config import CURRENT_SEASON, DATA_DIR

API = ("https://statsapi.mlb.com/api/v1/people/{pid}/stats"
       "?stats=statSplits&sitCodes={codes}&season={season}&group=hitting")

# situation code -> output file. Verified against /api/v1/situationCodes.
CODE_FILES = {
    "sp": "batter_splits_vsSP.csv",
    "rp": "batter_splits_vsRP.csv",
    "vl": "batter_splits_lhp.csv",
    "vr": "batter_splits_rhp.csv",
    "h": "batter_splits_home.csv",
    "a": "batter_splits_away.csv",
}
CODES = ",".join(CODE_FILES)

WORKERS = 8
TIMEOUT = 25
RETRIES = 3


def _fetch(pid: int) -> tuple[int, dict]:
    url = API.format(pid=pid, codes=CODES, season=CURRENT_SEASON)
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=TIMEOUT) as resp:
                return pid, json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt == RETRIES - 1:
                return pid, {}
            time.sleep(1.5 * (attempt + 1))
    return pid, {}


def _rows_from_payload(pid: int, payload: dict) -> dict[str, dict]:
    """code -> raw counting line for this batter."""
    out: dict[str, dict] = {}
    for block in payload.get("stats", []) or []:
        for split in block.get("splits", []) or []:
            code = (split.get("split") or {}).get("code")
            if code in CODE_FILES:
                out[code] = split.get("stat") or {}
    return out


def _num(val, default=0.0) -> float:
    try:
        if val is None or val == "":
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _league_rpa() -> float:
    """League runs per plate appearance, from the game log.

    statSplits omits `runs` on some situational cuts (it is absent from `sp` while
    present on `h`/`a`), so scaling wRC+ off the split payload silently produced a zero
    denominator and a column of NaN. The game log always carries R and PA, and one
    league-wide constant keeps wRC+ comparable across every split table.
    """
    path = os.path.join(DATA_DIR, "batter_gamelog.csv")
    try:
        gl = pd.read_csv(path, usecols=["R", "PA"])
        rpa = float(gl["R"].sum()) / max(1.0, float(gl["PA"].sum()))
        return rpa if rpa > 0 else 0.118
    except Exception:
        return 0.118  # league-average fallback


def _build_table(records: list[dict], lg_rpa: float) -> pd.DataFrame:
    """Counting lines -> the split schema, with a park-neutral wRC+."""
    if not records:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)
    df = pd.DataFrame(records)
    df = df[df["PA"] > 0].copy()
    if df.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    ubb = df["BB"] - df["IBB"]
    singles = df["H"] - df["2B"] - df["3B"] - df["HR"]
    # The real wOBA denominator, available here because MLB reports SF and IBB.
    denom = (df["AB"] + ubb + df["SF"] + df["HBP"]).replace(0, pd.NA)
    df["wOBA"] = (W_BB * ubb + W_HBP * df["HBP"] + W_1B * singles
                  + W_2B * df["2B"] + W_3B * df["3B"] + W_HR * df["HR"]) / denom
    df["BB%"] = df["BB"] / df["PA"]
    df["K%"] = df["SO"] / df["PA"]
    df["ISO"] = df["SLG"] - df["AVG"]

    lg_woba = float((W_BB * ubb.sum() + W_HBP * df["HBP"].sum() + W_1B * singles.sum()
                     + W_2B * df["2B"].sum() + W_3B * df["3B"].sum()
                     + W_HR * df["HR"].sum()) / max(1.0, float(denom.sum())))
    df["wRC+"] = (((df["wOBA"] - lg_woba) / WOBA_SCALE + lg_rpa) / lg_rpa) * 100.0

    for col in OUTPUT_COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA
    out = df[OUTPUT_COLUMNS + ["player_id"]].copy()
    for col in ("AVG", "OBP", "SLG", "wOBA", "ISO", "BABIP"):
        out[col] = pd.to_numeric(out[col], errors="coerce").round(3)
    for col in ("BB%", "K%"):
        out[col] = pd.to_numeric(out[col], errors="coerce").round(4)
    out["wRC+"] = pd.to_numeric(out["wRC+"], errors="coerce").round(0)
    return out.sort_values("PA", ascending=False).reset_index(drop=True)


def _batter_roster() -> pd.DataFrame:
    """Every batter with a plate appearance, with the club he last played for."""
    path = os.path.join(DATA_DIR, "batter_gamelog.csv")
    if not os.path.exists(path):
        return pd.DataFrame()
    gl = pd.read_csv(path)
    if gl.empty or "player_id" not in gl.columns:
        return pd.DataFrame()
    gl = gl.dropna(subset=["player_id", "player_name"])
    if "date" in gl.columns:
        gl = gl.sort_values("date")
    roster = gl.groupby("player_id", as_index=False).agg(
        Name=("player_name", "last"), Tm=("team", "last"))
    roster["player_id"] = pd.to_numeric(roster["player_id"], errors="coerce")
    return roster.dropna(subset=["player_id"])


def run() -> dict[str, int]:
    roster = _batter_roster()
    if roster.empty:
        print("  scrape_batter_splits_mlb: no batter roster available - skipped")
        return {}
    ids = [int(v) for v in roster["player_id"].tolist()]
    meta = {int(r.player_id): (r.Name, r.Tm) for r in roster.itertuples()}
    print(f"  scrape_batter_splits_mlb: fetching {len(ids)} batters "
          f"({CODES}) from the MLB Stats API")

    buckets: dict[str, list[dict]] = {code: [] for code in CODE_FILES}
    failures = 0
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for pid, payload in ex.map(_fetch, ids):
            if not payload:
                failures += 1
                continue
            name, team = meta.get(pid, (None, None))
            if not name:
                continue
            for code, stat in _rows_from_payload(pid, payload).items():
                buckets[code].append({
                    "player_id": pid, "Name": name, "Tm": team,
                    "PA": _num(stat.get("plateAppearances")),
                    "AB": _num(stat.get("atBats")),
                    "H": _num(stat.get("hits")),
                    "2B": _num(stat.get("doubles")),
                    "3B": _num(stat.get("triples")),
                    "HR": _num(stat.get("homeRuns")),
                    "BB": _num(stat.get("baseOnBalls")),
                    "IBB": _num(stat.get("intentionalWalks")),
                    "HBP": _num(stat.get("hitByPitch")),
                    "SF": _num(stat.get("sacFlies")),
                    "SO": _num(stat.get("strikeOuts")),
                    "R": _num(stat.get("runs")),  # absent on some codes; not used for wRC+
                    "AVG": _num(stat.get("avg"), None),
                    "OBP": _num(stat.get("obp"), None),
                    "SLG": _num(stat.get("slg"), None),
                    "BABIP": _num(stat.get("babip"), None),
                })

    savant_path = os.path.join(DATA_DIR, "batter_savant_rates.csv")
    savant = pd.read_csv(savant_path) if os.path.exists(savant_path) else None
    lg_rpa = _league_rpa()

    written: dict[str, int] = {}
    for code, filename in CODE_FILES.items():
        table = _merge_savant(_build_table(buckets[code], lg_rpa), savant)
        if table.empty:
            print(f"  scrape_batter_splits_mlb: {filename} came back empty - "
                  f"leaving the existing file alone")
            continue
        table.to_csv(os.path.join(DATA_DIR, filename), index=False)
        # A live API pull outranks the game-log derivation for these files.
        clear_marker_for(filename)
        written[filename] = len(table)
        print(f"  scrape_batter_splits_mlb: {len(table)} rows -> {filename}")

    if failures:
        print(f"  scrape_batter_splits_mlb: {failures} batter(s) failed to fetch")
    print(f"  scrape_batter_splits_mlb: done in {time.time() - t0:.0f}s")
    return written


if __name__ == "__main__":
    run()
