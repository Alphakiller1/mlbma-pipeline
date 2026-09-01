"""Pitcher vs-LHH / vs-RHH splits, sourced from the MLB Stats API.

Replaces the FanGraphs Selenium export that used to write `sp_vs_LHH.csv` /
`sp_vs_RHH.csv`. FanGraphs moved its leaderboards behind a Cloudflare interstitial the
scraper cannot clear, so those two files froze on 2026-07-29 while the pipeline kept
publishing them: by 2026-08-31 the live vs-LHB / vs-RHB panel on every pitcher profile
was missing five to six starts per arm and was off by as much as sixty points of OPS.

`statSplits` with sitCodes `vl` / `vr` is the authoritative same-day source for exactly
this cut, so it is asked directly. Output keeps the FanGraphs column names and the
fraction encoding for K%/BB% so `core.compute_sp_splits.build_hand_splits` and
`hand_ops_blend_lookup` consume it with no change.

ONE SEMANTIC DIFFERENCE, deliberate: FanGraphs' SP leaderboard counted a pitcher's work
*as a starter*; `vl`/`vr` covers every appearance. For a pure starter that is the same
number. For an arm whose season is mostly relief with a spot start or two the line now
describes his whole season rather than that one start - a larger and more useful sample
for a panel labelled "vs LHB", but not a starts-only split.

TWO COLUMNS THIS ENDPOINT CANNOT ANSWER, both left empty rather than guessed:
  * ERA - `statSplits` reports no runs at all for a batter-hand cut, because an earned
    run is not attributable to the handedness of one plate appearance. FIP is computed
    from the HR/BB/K it does report and carries the run-prevention signal instead. The
    pitcher-profile "Pitching Value" panel renders K% / BB% / HR9 / xFIP / OPS, so no
    displayed column is lost.
  * xFIP - needs a fly-ball rate this endpoint does not carry. The location, hand and
    tier split dimensions already ship xFIP empty, so this matches existing behaviour.
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import CURRENT_SEASON, DATA_DIR, FIP_CONSTANT  # noqa: E402

STATS_API = "https://statsapi.mlb.com/api/v1"
# (sitCode, output filename). `vl` is "vs Left", i.e. versus left-handed batters.
SPLITS = (("vl", "sp_vs_LHH.csv"), ("vr", "sp_vs_RHH.csv"))
OUTPUT_COLUMNS = [
    "Name", "Team", "G", "GS", "IP", "ERA", "K%", "BB%", "HR/9",
    "OBP", "SLG", "OPS", "FIP", "xFIP", "TBF",
]
# Below this the rate columns are noise, and publishing them would put a three-batter ERA
# on a profile page next to a full season's.
MIN_BATTERS_FACED = 20
REQUEST_PAUSE_S = 0.04


def _get(url: str, attempts: int = 3, timeout: int = 45) -> Optional[dict]:
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            if attempt == attempts - 1:
                return None
            time.sleep(1.0 + attempt)
    return None


def _outs(ip_text) -> int:
    """MLB innings-pitched ("6.1" = six and a third) to outs."""
    text = str(ip_text or "0").strip()
    if not text:
        return 0
    if "." in text:
        whole, frac = text.split(".", 1)
        return int(whole) * 3 + int(frac[:1] or 0)
    return int(float(text)) * 3


def _int(stat: dict, key: str) -> int:
    try:
        return int(stat.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def target_pitchers() -> List[dict]:
    """Every pitcher the SP profile set covers, with his id and team.

    Read from sp_profiles.csv so this file always describes the same population the
    pitcher pages render. Falls back to the season leaderboard when that file is absent
    (a first run, or a rebuild from empty).
    """
    path = Path(DATA_DIR) / "sp_profiles.csv"
    if path.exists():
        out = []
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                try:
                    pid = int(float(row["pitcher_id"]))
                except (TypeError, ValueError, KeyError):
                    continue
                out.append({
                    "id": pid,
                    "name": row.get("pitcher_name", ""),
                    "team": row.get("pitcher_team", ""),
                })
        if out:
            return out

    print("  sp_profiles.csv absent -- falling back to the season leaderboard")
    payload = _get(
        f"{STATS_API}/stats?stats=season&group=pitching&season={CURRENT_SEASON}"
        f"&sportId=1&gameType=R&limit=1500&playerPool=All"
    )
    if not payload:
        return []
    out = []
    for split in payload.get("stats", [{}])[0].get("splits", []):
        if _int(split.get("stat", {}), "gamesStarted") < 1:
            continue
        out.append({
            "id": split["player"]["id"],
            "name": split["player"].get("fullName", ""),
            "team": (split.get("team") or {}).get("abbreviation", ""),
        })
    return out


def _accumulate(splits: Iterable[dict]) -> Dict[str, Dict[str, int]]:
    """Collapse the rows for each sitCode into one season line.

    A traded pitcher comes back as one row per team for the same code PLUS a combined
    row carrying `numTeams`. Kevin Gausman returns three `vl` rows - 308 and 66 batters
    faced for his two clubs, then 374 for the season. Summing all three double-counts
    him, so when a combined row is present it wins outright and the per-team rows are
    dropped; only when there is no combined row are rows added together.
    """
    per_code: Dict[str, List[dict]] = {}
    for split in splits:
        code = (split.get("split") or {}).get("code")
        if code:
            per_code.setdefault(code, []).append(split)

    totals: Dict[str, Dict[str, int]] = {}
    for code, entries in per_code.items():
        combined = [e for e in entries if e.get("numTeams")]
        chosen = combined if combined else entries
        bucket = {
            "outs": 0, "so": 0, "bb": 0, "hr": 0, "tbf": 0,
            "h": 0, "hbp": 0, "sf": 0, "ab": 0, "tb": 0, "g": 0,
        }
        for entry in chosen:
            stat = entry.get("stat") or {}
            bucket["outs"] += _outs(stat.get("inningsPitched"))
            bucket["so"] += _int(stat, "strikeOuts")
            bucket["bb"] += _int(stat, "baseOnBalls")
            bucket["hr"] += _int(stat, "homeRuns")
            bucket["tbf"] += _int(stat, "battersFaced")
            bucket["h"] += _int(stat, "hits")
            bucket["hbp"] += _int(stat, "hitByPitch")
            bucket["sf"] += _int(stat, "sacFlies")
            bucket["ab"] += _int(stat, "atBats")
            bucket["tb"] += _int(stat, "totalBases")
            bucket["g"] += _int(stat, "gamesPlayed")
        totals[code] = bucket
    return totals


def _row(pitcher: dict, bucket: Dict[str, int]) -> Optional[dict]:
    tbf = bucket["tbf"]
    if tbf < MIN_BATTERS_FACED:
        return None
    innings = bucket["outs"] / 3.0
    if innings <= 0:
        return None

    # Standard on-base denominator. The API gives every term, so unlike the batter
    # game-log fallback this one does not have to approximate around sacrifice flies.
    on_base_denominator = bucket["ab"] + bucket["bb"] + bucket["hbp"] + bucket["sf"]
    obp = (bucket["h"] + bucket["bb"] + bucket["hbp"]) / on_base_denominator if on_base_denominator else None
    slg = bucket["tb"] / bucket["ab"] if bucket["ab"] else None

    # core.config.FIP_FORMULA - walks only, no HBP term, matching the rest of the repo.
    fip = (13 * bucket["hr"] + 3 * bucket["bb"] - 2 * bucket["so"]) / innings + FIP_CONSTANT

    return {
        "Name": pitcher["name"],
        "Team": pitcher["team"],
        # Appearances in which he faced this hand. GS is left empty because the endpoint
        # does not break games started out by batter hand; build_hand_splits reads
        # `GS or G`, so G is what becomes the split's appearance count.
        "G": bucket["g"],
        "GS": "",
        # Written back in MLB's own innings notation so parse_ip reads it unchanged.
        "IP": f"{bucket['outs'] // 3}.{bucket['outs'] % 3}",
        "ERA": "",
        # Fractions, matching the FanGraphs encoding the consumer's _pct_pts expects.
        "K%": round(bucket["so"] / tbf, 4),
        "BB%": round(bucket["bb"] / tbf, 4),
        "HR/9": round(9 * bucket["hr"] / innings, 2),
        "OBP": round(obp, 3) if obp is not None else "",
        "SLG": round(slg, 3) if slg is not None else "",
        "OPS": round(obp + slg, 3) if obp is not None and slg is not None else "",
        "FIP": round(fip, 2),
        "xFIP": "",
        "TBF": tbf,
    }


def run() -> None:
    print("Scraping pitcher vs-LHH / vs-RHH splits from the MLB Stats API...")
    pitchers = target_pitchers()
    if not pitchers:
        print("  ERROR: no pitcher set to scrape -- leaving existing files untouched")
        return
    print(f"  {len(pitchers)} pitchers to look up")

    rows: Dict[str, List[dict]] = {code: [] for code, _ in SPLITS}
    failed: List[str] = []
    for index, pitcher in enumerate(pitchers, 1):
        payload = _get(
            f"{STATS_API}/people/{pitcher['id']}/stats?stats=statSplits&sitCodes=vl,vr"
            f"&group=pitching&season={CURRENT_SEASON}&gameType=R"
        )
        if not payload or not payload.get("stats"):
            failed.append(pitcher["name"])
            continue
        totals = _accumulate(payload["stats"][0].get("splits", []))
        for code, _ in SPLITS:
            bucket = totals.get(code)
            if not bucket:
                continue
            row = _row(pitcher, bucket)
            if row:
                rows[code].append(row)
        if index % 50 == 0:
            print(f"    {index}/{len(pitchers)}")
        time.sleep(REQUEST_PAUSE_S)

    if failed:
        print(f"  WARNING: no split data for {len(failed)} pitchers (first 5: {failed[:5]})")

    for code, filename in SPLITS:
        path = os.path.join(DATA_DIR, filename)
        out = rows[code]
        if not out:
            # Same contract as the batter splits: an upstream outage degrades to stale
            # data, never to an empty file that would blank the panel downstream.
            held = 0
            if os.path.exists(path):
                with open(path, encoding="utf-8") as handle:
                    held = max(sum(1 for _ in handle) - 1, 0)
            print(f"  KEPT {filename}: lookup returned nothing, leaving {held} rows in place")
            continue
        with open(path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
            writer.writeheader()
            writer.writerows(out)
        print(f"  Saved {len(out)} rows -> {path}")


if __name__ == "__main__":
    run()
