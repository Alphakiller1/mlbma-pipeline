"""Compare a Savant-derived xFIP against the last good FanGraphs export.

FanGraphs was the only xFIP source and its scrape died on 2026-07-29, so PALS has been
reading a frozen column ever since. xFIP needs a fly-ball rate, which the MLB Stats API
does not carry, but Baseball Savant's custom pitcher leaderboard does. This checks that
a rebuild from Savant fly-ball rates plus MLB counting stats tracks the FanGraphs values
closely enough to stand in for them, and picks the walk-term convention that matches.

Run: python scripts/validate_xfip_source.py
"""
from __future__ import annotations

import csv
import io
import json
import statistics
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import DATA_DIR, FIP_CONSTANT  # noqa: E402

SAVANT_URL = (
    "https://baseballsavant.mlb.com/leaderboard/custom?year=2026&type=pitcher&filter=&min=1"
    "&selections=p_formatted_ip,p_home_run,p_strikeout,p_walk,p_hit_by_pitch,flyballs_percent"
    "&chart=false&x=p_formatted_ip&y=p_formatted_ip&r=no&chartType=beeswarm"
    "&sort=1&sortDir=asc&csv=true"
)
MLB_URL = (
    "https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=2026"
    "&sportId=1&gameType=R&limit=2000&playerPool=All"
)


def savant_flyball_rates() -> dict:
    req = urllib.request.Request(SAVANT_URL, headers={"User-Agent": "Mozilla/5.0"})
    text = urllib.request.urlopen(req, timeout=120).read().decode("utf-8-sig")
    return {int(r["player_id"]): r for r in csv.DictReader(io.StringIO(text))}


def mlb_counting_stats() -> dict:
    payload = json.load(urllib.request.urlopen(MLB_URL, timeout=120))
    out: dict = {}
    for split in payload["stats"][0]["splits"]:
        stat = split["stat"]
        pid = split["player"]["id"]
        bucket = out.setdefault(pid, {
            "ab": 0, "k": 0, "hr": 0, "sf": 0, "bb": 0, "hbp": 0, "outs": 0,
            "name": split["player"]["fullName"],
        })
        raw = str(stat.get("inningsPitched") or "0")
        whole, _, frac = raw.partition(".")
        bucket["outs"] += int(whole) * 3 + int(frac[:1] or 0)
        for key, api in (("ab", "atBats"), ("k", "strikeOuts"), ("hr", "homeRuns"),
                         ("sf", "sacFlies"), ("bb", "baseOnBalls"), ("hbp", "hitByPitch")):
            bucket[key] += int(stat.get(api) or 0)
    return out


def compute(savant: dict, mlb: dict, with_hbp: bool, min_ip: float = 20.0):
    total_fb = total_hr = 0.0
    per: dict = {}
    for pid, row in savant.items():
        m = mlb.get(pid)
        if not m or m["outs"] <= 0:
            continue
        # Balls in play, the denominator Savant's flyballs_percent is a share of.
        bip = m["ab"] - m["k"] - m["hr"] + m["sf"]
        if bip <= 0:
            continue
        fly_balls = bip * float(row.get("flyballs_percent") or 0) / 100.0
        per[pid] = (fly_balls, m)
        total_fb += fly_balls
        total_hr += m["hr"]

    league_hr_per_fb = total_hr / total_fb if total_fb else 0.0
    out: dict = {}
    for pid, (fly_balls, m) in per.items():
        innings = m["outs"] / 3.0
        if innings < min_ip:
            continue
        walks = m["bb"] + (m["hbp"] if with_hbp else 0)
        out[pid] = (13 * (fly_balls * league_hr_per_fb) + 3 * walks - 2 * m["k"]) / innings + FIP_CONSTANT
    return league_hr_per_fb, out


def fangraphs_reference() -> dict:
    for candidate in (
        Path(DATA_DIR) / "_prefix_backup_20260831" / "sp_standard.csv",
        Path(DATA_DIR) / "sp_standard.csv",
    ):
        if not candidate.exists():
            continue
        ref = {}
        with candidate.open(encoding="utf-8", errors="replace") as handle:
            for row in csv.DictReader(handle):
                try:
                    ref[row["Name"]] = float(row["xFIP"])
                except (TypeError, ValueError, KeyError):
                    continue
        if ref:
            print(f"reference: {candidate.name} ({len(ref)} xFIP values)")
            return ref
    return {}


def main() -> int:
    savant = savant_flyball_rates()
    mlb = mlb_counting_stats()
    reference = fangraphs_reference()
    print(f"savant pitchers: {len(savant)}   mlb pitchers: {len(mlb)}")
    if not reference:
        print("no FanGraphs reference available")
        return 1

    best = None
    for with_hbp in (False, True):
        league, computed = compute(savant, mlb, with_hbp)
        pairs = [(v, reference[mlb[p]["name"]]) for p, v in computed.items()
                 if mlb[p]["name"] in reference]
        if len(pairs) < 30:
            continue
        a = [p[0] for p in pairs]
        b = [p[1] for p in pairs]
        mean_a, mean_b = statistics.mean(a), statistics.mean(b)
        cov = sum((x - mean_a) * (y - mean_b) for x, y in pairs) / len(pairs)
        corr = cov / (statistics.pstdev(a) * statistics.pstdev(b))
        label = "BB+HBP" if with_hbp else "BB only"
        print(f"  walk term {label:7s}: n={len(pairs)}  lgHR/FB={league:.4f}  "
              f"mean {mean_a:.2f} vs FanGraphs {mean_b:.2f} (offset {mean_a - mean_b:+.2f})  corr={corr:.3f}")
        if best is None or abs(mean_a - mean_b) < best[0]:
            best = (abs(mean_a - mean_b), label, corr)

    if best:
        print(f"\nclosest match: {best[1]} (offset {best[0]:.2f}, corr {best[2]:.3f})")
        print("NOTE: a residual offset is expected - the FanGraphs column is a 2026-07-29")
        print("snapshot while this is season-to-date, so the two cover different samples.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
