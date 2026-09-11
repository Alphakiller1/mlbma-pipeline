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
from datetime import datetime, timedelta, timezone
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
# A quality start: six innings or more, three earned runs or fewer. Not in the
# stats API as a field, so it is counted off the game log - which arrives in the
# same request as the splits, at no extra cost.
QS_MIN_OUTS = 18
QS_MAX_ER = 3

SPLITS = (
    ("vl", "sp_vs_LHH.csv"),
    ("vr", "sp_vs_RHH.csv"),
    ("h", "sp_home.csv"),
    ("a", "sp_away.csv"),
)
SIT_CODES = ",".join(code for code, _ in SPLITS)
OUTPUT_COLUMNS = [
    "Name", "Team", "MLBAMID", "G", "GS", "IP", "ERA", "K%", "BB%", "HR/9",
    "OBP", "SLG", "OPS", "FIP", "xFIP", "TBF", "P/IP", "WHIP", "QS%", "PitchScore",
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


def _leaderboard_starters() -> List[dict]:
    """Everyone who has started a game this season, from the season leaderboard."""
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


def _probable_starters() -> List[dict]:
    """Every probable starter on the schedule, today and tomorrow.

    The population cannot be defined by past role. Wilber Dotel came up in
    September, had made 0 starts, and was the probable starter for Pittsburgh -
    so a "has started a game" filter excluded the one pitcher whose page was
    about to be looked at, and his matchup showed his name, his season line and
    then an empty space. A pitcher making his first career start has zero games
    started right up until the moment he needs the page.

    The schedule says who is starting. That is the authoritative answer and it
    is right on the day, not a scrape behind.
    """
    out = []
    today = datetime.now(timezone.utc).date()
    for offset in (0, 1):
        day = (today + timedelta(days=offset)).isoformat()
        payload = _get(f"{STATS_API}/schedule?sportId=1&date={day}"
                       f"&hydrate=probablePitcher,team")
        if not payload:
            continue
        for block in payload.get("dates") or []:
            for game in block.get("games") or []:
                for side in ("away", "home"):
                    node = ((game.get("teams") or {}).get(side)) or {}
                    arm = node.get("probablePitcher") or {}
                    if not arm.get("id"):
                        continue
                    out.append({
                        "id": arm["id"],
                        "name": arm.get("fullName", ""),
                        "team": ((node.get("team") or {}).get("abbreviation")) or "",
                    })
    return out


def target_pitchers() -> List[dict]:
    """Every probable starter, everyone who has started, plus the profile set.

    This used to be the profile set ALONE, with the leaderboard as a fallback for
    when that file was missing. The profile set is a qualified population, so a
    pitcher called up in September and handed a start was not in it - and the
    matchup page for the game he was starting showed his name, his season line, and
    then an empty space where his splits belong. Wilber Dotel, 32.2 innings, starting
    for Pittsburgh, was the case that surfaced it.

    A union fixes it at the root and keeps fixing it: anyone who has started a game
    is in the population by definition, so the next call-up is covered on the run
    after his first start without anybody adding him to a list. The profile set stays
    in the union so the file never describes fewer pitchers than the profile pages do,
    and the leaderboard is no longer a fallback that only fires when a file is absent.
    """
    seen: Dict[int, dict] = {}
    # Probables first: they are the most current and the most needed.
    for row in _probable_starters():
        seen[row["id"]] = row
    for row in _leaderboard_starters():
        seen.setdefault(row["id"], row)

    path = Path(DATA_DIR) / "sp_profiles.csv"
    if path.exists():
        with path.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                try:
                    pid = int(float(row["pitcher_id"]))
                except (TypeError, ValueError, KeyError):
                    continue
                # The leaderboard carries the club he is on now; the profile set can
                # be a scrape or two behind on a trade, so it does not overwrite.
                seen.setdefault(pid, {
                    "id": pid,
                    "name": row.get("pitcher_name", ""),
                    "team": row.get("pitcher_team", ""),
                })

    if not seen:
        print("  ERROR: no pitcher population from either source")
    return list(seen.values())


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


def quality_starts(game_log: Iterable[dict]) -> Optional[float]:
    """Share of this arm's STARTS that went six innings on three earned runs or fewer.

    Counted off the game log because the stats API carries no such field. Relief
    appearances are excluded by their own gamesStarted line, so a starter who
    also relieves is not punished for a one-inning outing he was asked for.
    """
    starts = 0
    quality = 0
    for entry in game_log:
        stat = entry.get("stat") or {}
        if _int(stat, "gamesStarted") < 1:
            continue
        starts += 1
        if _outs(stat.get("inningsPitched")) >= QS_MIN_OUTS and _int(stat, "earnedRuns") <= QS_MAX_ER:
            quality += 1
    if not starts:
        return None
    return round(100.0 * quality / starts, 1)


# League distribution for the three inputs Pitch Score is built from. Filled on
# the first pass over the population and read on the second, so the index is
# relative to this season's starters rather than to a threshold typed in once.
def pitch_score(k_pct: float, bb_pct: float, hr9: float, pool: dict) -> Optional[float]:
    """The staff-suppression index, on one arm.

    Same construction as the team Pitch Score the rest of the desk publishes -
    0.40 strikeouts, 0.35 walks the other way round, 0.25 home runs the other way
    round - scored against the population of starters rather than of clubs, and
    stated on a 0-100 scale so it reads like the other indices beside it.
    """
    parts = [("k", k_pct, True), ("bb", bb_pct, False), ("hr", hr9, False)]
    weights = {"k": 0.40, "bb": 0.35, "hr": 0.25}
    total = 0.0
    for key, value, high_is_good in parts:
        series = pool.get(key) or []
        if value is None or len(series) < 20:
            return None
        below = sum(1 for other in series if other < value)
        pct = 100.0 * below / len(series)
        total += weights[key] * (pct if high_is_good else 100.0 - pct)
    return round(total, 1)


def _row(pitcher: dict, bucket: Dict[str, int], hr_per_air: Optional[float],
         qs: Optional[float] = None, score: Optional[float] = None) -> Optional[dict]:
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
        # Both describe the whole season, not this split - they are carried on
        # every row so a consumer reading one split does not need a second join
        # to find them.
        "QS%": "" if qs is None else qs,
        "PitchScore": "" if score is None else score,
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
    qs: Dict[int, Optional[float]] = {}
    for index, pitcher in enumerate(pitchers, 1):
        # One request carries both: the four splits and the game log the quality
        # start count is taken from.
        payload = _get(
            f"{STATS_API}/people/{pitcher['id']}/stats?stats=statSplits,gameLog"
            f"&sitCodes={SIT_CODES}&group=pitching&season={CURRENT_SEASON}&gameType=R"
        )
        if not payload or not payload.get("stats"):
            failed.append(pitcher["name"])
            continue
        blocks = {}
        for block in payload["stats"]:
            blocks[((block.get("type") or {}).get("displayName")) or ""] = block.get("splits") or []
        totals = _accumulate(blocks.get("statSplits") or [])
        qs[pitcher["id"]] = quality_starts(blocks.get("gameLog") or [])
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

    # Pitch Score is a percentile against this season's starters, so the pool
    # is built from the season lines first and every arm is then scored on it.
    pool: Dict[str, List[float]] = {"k": [], "bb": [], "hr": []}
    season: Dict[int, dict] = {}
    for code, pitcher, bucket in collected:
        if code not in {"h", "a"}:
            continue
        entry = season.setdefault(pitcher["id"], {"tbf": 0, "so": 0, "bb": 0, "hr": 0, "outs": 0})
        for key in ("tbf", "so", "bb", "hr", "outs"):
            entry[key] += bucket[key]
    rates: Dict[int, tuple] = {}
    for pid, entry in season.items():
        innings = entry["outs"] / 3.0
        if entry["tbf"] < 100 or innings <= 0:
            continue
        k = 100.0 * entry["so"] / entry["tbf"]
        bb = 100.0 * entry["bb"] / entry["tbf"]
        hr = 9.0 * entry["hr"] / innings
        rates[pid] = (k, bb, hr)
        pool["k"].append(k)
        pool["bb"].append(bb)
        pool["hr"].append(hr)

    rows: Dict[str, List[dict]] = {code: [] for code, _ in SPLITS}
    for code, pitcher, bucket in collected:
        rate = rates.get(pitcher["id"])
        score = pitch_score(rate[0], rate[1], rate[2], pool) if rate else None
        row = _row(pitcher, bucket, hr_per_air, qs.get(pitcher["id"]), score)
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
