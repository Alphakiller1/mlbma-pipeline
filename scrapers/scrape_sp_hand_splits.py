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

ONE COLUMN THIS ENDPOINT CANNOT ANSWER, left empty rather than guessed:
  * ERA on a batter-hand cut - `statSplits` reports no runs at all there, because an
    earned run is not attributable to the handedness of one plate appearance. FIP is
    computed from the HR/BB/K it does report and carries the run-prevention signal
    instead. Home and road DO carry ERA, and it is published.

xFIP used to be in that list. It is computed now: see `air_balls` for why the thing it
needs is not the fly-ball rate this endpoint lacks.

Home and road were not fetched here at all until 2026-09-11, which is why the splits
table downstream showed the same OPS for both - it was falling back to the pitcher's
season line and printing it twice under two labels.
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
# (sitCode, output filename). `vl` is "vs Left", i.e. versus left-handed batters;
# `h` and `a` are the pitcher's own home and road work.
#
# Home and road were not fetched at all, and the downstream splits table filled its
# location rows with the pitcher's SEASON line instead - verified across all 359
# starters, not one had a home OPS that differed from his away OPS, because it was the
# same number printed twice. The endpoint answers the cut directly, so it is asked.
SPLITS = (
    ("vl", "sp_vs_LHH.csv"),
    ("vr", "sp_vs_RHH.csv"),
    ("h", "sp_home.csv"),
    ("a", "sp_away.csv"),
)
SIT_CODES = ",".join(code for code, _ in SPLITS)
OUTPUT_COLUMNS = [
    "Name", "Team", "MLBAMID", "G", "GS", "IP", "ERA", "K%", "BB%", "HR/9",
    "OBP", "SLG", "OPS", "FIP", "xFIP", "TBF", "P/IP", "WHIP",
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
            # Batted-ball outs, for the fly-ball share xFIP needs.
            "go": 0, "ao": 0, "sac": 0,
            # Earned runs. Meaningless on a batter-hand cut, real on home and road.
            "er": 0,
            # Pitches thrown, for the per-inning workload each split represents.
            "np": 0,
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
            bucket["go"] += _int(stat, "groundOuts")
            bucket["ao"] += _int(stat, "airOuts")
            bucket["sac"] += _int(stat, "sacBunts")
            bucket["er"] += _int(stat, "earnedRuns")
            bucket["np"] += _int(stat, "numberOfPitches")
        totals[code] = bucket
    return totals


def air_balls(bucket: Dict[str, int]) -> Optional[float]:
    """How many balls this split put in the air.

    The docstring above used to say xFIP "needs a fly-ball rate this endpoint does not
    carry", and that was true of a fly-ball rate as FanGraphs defines it - FB over
    GB+FB+LD, which needs every batted ball typed. It is not true of the quantity xFIP
    actually needs, which is a denominator to normalise home runs against.

    The endpoint reports groundOuts and airOuts for every split, so the split states its
    own ground-to-air tendency. Applying that share to the split's batted balls gives
    the air-ball count. The league rate below is computed on the same definition from
    the same population, so expected home runs come out on a consistent scale - which is
    all xFIP requires. It is not FanGraphs' fly-ball denominator and does not need to be.

    Returns None when the split has no batted-ball outs to take a share from.
    """
    fielded = bucket["go"] + bucket["ao"]
    if fielded <= 0:
        return None
    # Balls put in play, home runs included: they are air balls by definition and xFIP
    # is about how many of these left the yard, not how many stayed in it.
    batted = bucket["ab"] - bucket["so"] + bucket["sf"] + bucket["sac"]
    if batted <= 0:
        return None
    return batted * (bucket["ao"] / fielded)


def league_hr_per_air(buckets: Iterable[Dict[str, int]]) -> Optional[float]:
    """League home runs per air ball, from this run's own population.

    Taken from the data being published rather than assumed, so the constant moves with
    the season it describes and cannot go stale the way a hard-coded 0.13 would.
    """
    hr = 0
    air = 0.0
    for bucket in buckets:
        balls = air_balls(bucket)
        if balls is None:
            continue
        hr += bucket["hr"]
        air += balls
    if air <= 0:
        return None
    return hr / air


def _row(pitcher: dict, bucket: Dict[str, int], hr_per_air: Optional[float]) -> Optional[dict]:
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

    # xFIP is FIP with the home runs he actually gave up replaced by the home runs a
    # league-average arm would give up on his air balls. Same formula, same constant,
    # one term swapped - which is the whole idea.
    xfip = ""
    balls = air_balls(bucket)
    if hr_per_air and balls is not None:
        expected_hr = balls * hr_per_air
        xfip = round(
            (13 * expected_hr + 3 * bucket["bb"] - 2 * bucket["so"]) / innings
            + FIP_CONSTANT,
            2,
        )

    return {
        "Name": pitcher["name"],
        "Team": pitcher["team"],
        # The MLB person id, so a consumer can join on it instead of on a name that
        # two players in the league share.
        "MLBAMID": pitcher["id"],
        # Appearances in which he faced this hand. GS is left empty because the endpoint
        # does not break games started out by batter hand; build_hand_splits reads
        # `GS or G`, so G is what becomes the split's appearance count.
        "G": bucket["g"],
        "GS": "",
        # Written back in MLB's own innings notation so parse_ip reads it unchanged.
        "IP": f"{bucket['outs'] // 3}.{bucket['outs'] % 3}",
        # Home and road attribute earned runs; a batter-hand cut does not, and comes
        # back with none, so the column stays empty there rather than reading 0.00.
        "ERA": round(9 * bucket["er"] / innings, 2) if bucket["er"] else "",
        # Fractions, matching the FanGraphs encoding the consumer's _pct_pts expects.
        "K%": round(bucket["so"] / tbf, 4),
        "BB%": round(bucket["bb"] / tbf, 4),
        "HR/9": round(9 * bucket["hr"] / innings, 2),
        "OBP": round(obp, 3) if obp is not None else "",
        "SLG": round(slg, 3) if slg is not None else "",
        "OPS": round(obp + slg, 3) if obp is not None and slg is not None else "",
        "FIP": round(fip, 2),
        "xFIP": xfip,
        "TBF": tbf,
        # Walks and hits per inning. Unlike ERA this IS attributable to a
        # batter-hand cut - a hit and a walk belong to the plate appearance
        # that produced them, where an earned run belongs to an inning - so it
        # is the run-prevention column that exists on all four splits.
        "WHIP": round((bucket["h"] + bucket["bb"]) / innings, 2) if innings else "",
        # How hard this split is to get through, per inning of it. A starter
        # who needs seventeen pitches an inning against left-handers and
        # thirteen against right-handers is telling you when he comes out.
        "P/IP": round(bucket["np"] / innings, 1) if bucket["np"] else "",
    }


def run() -> None:
    print("Scraping pitcher vs-LHH / vs-RHH / home / road splits from the MLB Stats API...")
    pitchers = target_pitchers()
    if not pitchers:
        print("  ERROR: no pitcher set to scrape -- leaving existing files untouched")
        return
    print(f"  {len(pitchers)} pitchers to look up")

    # Two passes over one fetch. Every line is collected first because the xFIP
    # denominator is a league rate taken from this population, and a rate cannot be
    # computed from a row while that row is still being written.
    collected: List[tuple] = []
    failed: List[str] = []
    for index, pitcher in enumerate(pitchers, 1):
        payload = _get(
            f"{STATS_API}/people/{pitcher['id']}/stats?stats=statSplits&sitCodes={SIT_CODES}"
            f"&group=pitching&season={CURRENT_SEASON}&gameType=R"
        )
        if not payload or not payload.get("stats"):
            failed.append(pitcher["name"])
            continue
        totals = _accumulate(payload["stats"][0].get("splits", []))
        for code, _ in SPLITS:
            bucket = totals.get(code)
            if bucket:
                collected.append((code, pitcher, bucket))
        if index % 50 == 0:
            print(f"    {index}/{len(pitchers)}")
        time.sleep(REQUEST_PAUSE_S)

    if failed:
        print(f"  WARNING: no split data for {len(failed)} pitchers (first 5: {failed[:5]})")

    # One rate for every split, so a home xFIP and a vs-LHH xFIP sit on the same scale
    # and can be read down the same column.
    hr_per_air = league_hr_per_air(
        bucket for code, _, bucket in collected if code in {"h", "a"}
    )
    print(f"  league home runs per air ball: "
          f"{round(hr_per_air, 4) if hr_per_air else 'not computable'}")

    rows: Dict[str, List[dict]] = {code: [] for code, _ in SPLITS}
    for code, pitcher, bucket in collected:
        row = _row(pitcher, bucket, hr_per_air)
        if row:
            rows[code].append(row)

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
