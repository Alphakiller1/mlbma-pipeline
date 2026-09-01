"""Refresh `sp_standard.csv` season pitching lines from the MLB Stats API.

`sp_standard.csv` is a FanGraphs export that froze on 2026-07-29 when FanGraphs put its
leaderboards behind a Cloudflare interstitial. The pipeline kept recomputing from it, so
`metrics_pitching_score.csv` and `metrics_pals.csv` were republished every morning off a
month-old snapshot: qualified starters were short an average of 22 innings, and the team
Pitching Score board reordered by a mean of 2.5 places once refreshed - Toronto sat 12
ranks too high, Detroit 7, San Diego 7 too low.

Every input `core.compute_pitching.calc_pitching_score` needs (Tm, K%, BB%, HR/9, WHIP,
IP) is available from the MLB Stats API, so those are rebuilt outright.

xFIP IS REBUILT TOO, from a second source. It is the one column here that anything
downstream actually reads - `core.compute_pals` turns opposing-starter xFIP into the PTF+
half of PALS - and it needs a fly-ball rate the MLB Stats API does not expose. Baseball
Savant's custom pitcher leaderboard does, so fly-ball share comes from there and is
combined with the MLB counting stats using the standard formula:

    xFIP = (13*(FB * lgHR/FB) + 3*(BB+HBP) - 2*K) / IP + cFIP

`scripts/validate_xfip_source.py` checks this rebuild against the last good FanGraphs
column: correlation 0.899 with a mean offset of -0.04, and the BB+HBP walk term (the
standard definition) matches distinctly better than walks alone. The residual offset is
expected, since the FanGraphs values are a 2026-07-29 snapshot and these are
season-to-date. FB%, GB%, LD% and HR/FB are filled from the same Savant pull.

WHAT IS STILL INHERITED: the columns with no source on either API - IFFB%, GB/FB,
Pull%/Cent%/Oppo%, Soft%/Med%/Hard%, LOB%, wOBA. Nothing in the pipeline reads them
today; they are carried forward by name so the file keeps its shape, and the console
reports how many rows they came through on so the staleness is never silent.

Run before `core.compute` (or before calling calc_pitching_score directly).
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import CURRENT_SEASON, DATA_DIR, FIP_CONSTANT  # noqa: E402
from core.name_utils import normalize_player_name  # noqa: E402

STATS_API = "https://statsapi.mlb.com/api/v1"
TARGET = "sp_standard.csv"

TEAM_ABBR = {
    "Los Angeles Angels": "LAA", "Houston Astros": "HOU", "Athletics": "ATH",
    "Oakland Athletics": "ATH", "Toronto Blue Jays": "TOR", "Atlanta Braves": "ATL",
    "Milwaukee Brewers": "MIL", "St. Louis Cardinals": "STL", "Chicago Cubs": "CHC",
    "Arizona Diamondbacks": "ARI", "Los Angeles Dodgers": "LAD",
    "San Francisco Giants": "SFG", "Cleveland Guardians": "CLE",
    "Seattle Mariners": "SEA", "Miami Marlins": "MIA", "New York Mets": "NYM",
    "Washington Nationals": "WSN", "Baltimore Orioles": "BAL", "San Diego Padres": "SDP",
    "Philadelphia Phillies": "PHI", "Pittsburgh Pirates": "PIT", "Texas Rangers": "TEX",
    "Tampa Bay Rays": "TBR", "Boston Red Sox": "BOS", "Cincinnati Reds": "CIN",
    "Colorado Rockies": "COL", "Kansas City Royals": "KCR", "Detroit Tigers": "DET",
    "Minnesota Twins": "MIN", "Chicago White Sox": "CHW", "New York Yankees": "NYY",
}

# Rebuilt from the API every run.
REFRESHED_COLUMNS = [
    "Season", "Name", "Tm", "IP", "TBF", "K/9", "BB/9", "K/BB", "HR/9", "K%", "BB%",
    "K-BB%", "AVG", "WHIP", "BABIP", "FIP", "xFIP", "GB%", "FB%", "LD%", "HR/FB",
    "G", "GS", "ERA", "H", "2B", "3B", "R", "ER", "HR", "BB", "IBB", "HBP", "SO", "OBP", "SLG",
]
# Carried over from the previous file by normalized name; no source on either API.
INHERITED_COLUMNS = [
    "LOB%", "playerId", "GB/FB", "IFFB%",
    "IFH%", "BUH%", "Pull%", "Cent%", "Oppo%", "Soft%", "Med%", "Hard%", "wOBA",
]

SAVANT_URL = (
    "https://baseballsavant.mlb.com/leaderboard/custom?year={season}&type=pitcher"
    "&filter=&min=1&selections=p_formatted_ip,flyballs_percent,groundballs_percent,"
    "linedrives_percent&chart=false&x=p_formatted_ip&y=p_formatted_ip&r=no"
    "&chartType=beeswarm&sort=1&sortDir=asc&csv=true"
)


def _get(url: str, attempts: int = 3, timeout: int = 90) -> Optional[dict]:
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            if attempt == attempts - 1:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def _true_innings(ip_text) -> float:
    """MLB notation ("27.2" = twenty-seven and two thirds) to real innings."""
    text = str(ip_text or "0").strip()
    if "." not in text:
        return float(text or 0)
    whole, frac = text.split(".", 1)
    return int(whole) + int(frac[:1] or 0) / 3.0


def _int(stat: dict, key: str) -> int:
    try:
        return int(stat.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _ratio(numerator: float, denominator: float, digits: int = 4) -> str:
    return str(round(numerator / denominator, digits)) if denominator else ""


def savant_batted_ball() -> Dict[int, Dict[str, float]]:
    """Fly-ball / ground-ball / line-drive share of balls in play, by MLB player id.

    Joined on the MLB id rather than the name: this file already carries two different
    pitchers called Yunior Marte, and a name join would silently merge them.
    """
    url = SAVANT_URL.format(season=CURRENT_SEASON)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        text = urllib.request.urlopen(request, timeout=120).read().decode("utf-8-sig")
    except Exception as exc:
        print(f"  WARNING: Savant batted-ball pull failed ({str(exc)[:70]}) -- xFIP will be inherited")
        return {}

    out: Dict[int, Dict[str, float]] = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            pid = int(row["player_id"])
        except (TypeError, ValueError, KeyError):
            continue
        def pct(key):
            try:
                return float(row.get(key) or 0) / 100.0
            except (TypeError, ValueError):
                return 0.0
        out[pid] = {
            "fb": pct("flyballs_percent"),
            "gb": pct("groundballs_percent"),
            "ld": pct("linedrives_percent"),
        }
    print(f"  Savant batted-ball rates for {len(out)} pitchers")
    return out


def load_inherited() -> Dict[str, Dict[str, str]]:
    """Previous file's FanGraphs-only columns, keyed by normalized player name."""
    path = Path(DATA_DIR) / TARGET
    if not path.exists():
        return {}
    out: Dict[str, Dict[str, str]] = {}
    with path.open(encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            key = normalize_player_name(str(row.get("Name", "")))
            if key and key not in out:
                # xFIP is read too, though it is rebuilt rather than inherited: it is the
                # only column PALS consumes, so the previous value is kept available as a
                # fallback for a Savant outage.
                out[key] = {c: row.get(c, "") for c in INHERITED_COLUMNS + ["xFIP"]}
    return out


def run() -> None:
    print("Refreshing sp_standard.csv season lines from the MLB Stats API...")
    inherited = load_inherited()
    print(f"  {len(inherited)} prior rows available for the inherited columns")

    # Asked PER TEAM, not from the league leaderboard, and the distinction matters. The
    # leaderboard reports a traded pitcher once, with his whole season attributed to his
    # current club - which would hand a team innings it never threw. The per-team call
    # returns only what he threw for that club, so a player showing up under two teams is
    # exactly the "2 Tms" case the FanGraphs export produced.
    #
    # Output is one row per PLAYER, the contract the rest of the chain assumes:
    # build_profiles does set_index("pitcher_name").to_dict("index") and raises outright
    # on a duplicate. A traded pitcher's stints are summed into a single line tagged
    # "N Tms" - the marker calc_pitching_score already filters on - so he stays out of
    # team Pitching Score just as before, while the staleness comparison still sees his
    # true full-season rates.
    teams_payload = _get(f"{STATS_API}/teams?sportId=1&season={CURRENT_SEASON}")
    team_ids = [(t["id"], t.get("name", "")) for t in (teams_payload or {}).get("teams", [])]
    if len(team_ids) < 30:
        print("  ERROR: team list unavailable -- leaving the existing file alone")
        return

    splits = []
    for team_id, team_name in team_ids:
        payload = _get(
            f"{STATS_API}/stats?stats=season&group=pitching&season={CURRENT_SEASON}"
            f"&sportId=1&gameType=R&limit=1000&playerPool=All&teamId={team_id}"
        )
        if not payload or not payload.get("stats"):
            print(f"  WARNING: no pitching stats returned for {team_name}")
            continue
        splits.extend(payload["stats"][0].get("splits", []))
        time.sleep(0.05)

    if not splits:
        print("  ERROR: no team pitching stats retrieved -- leaving the existing file alone")
        return

    by_player: Dict[int, dict] = {}
    for split in splits:
        stat = split.get("stat") or {}
        team = TEAM_ABBR.get((split.get("team") or {}).get("name") or "")
        if not team:
            continue
        if _true_innings(stat.get("inningsPitched")) <= 0 or _int(stat, "battersFaced") <= 0:
            continue
        player = split.get("player") or {}
        pid = player.get("id")
        if pid is None:
            continue
        entry = by_player.setdefault(int(pid), {
            "name": player.get("fullName", ""), "teams": [], "outs": 0, "tbf": 0,
            "so": 0, "bb": 0, "hr": 0, "h": 0, "ab": 0, "sf": 0, "g": 0,
            "doubles": 0, "triples": 0, "r": 0, "er": 0, "ibb": 0, "hbp": 0, "gs": 0,
        })
        entry["teams"].append(team)
        entry["outs"] += round(_true_innings(stat.get("inningsPitched")) * 3)
        entry["tbf"] += _int(stat, "battersFaced")
        entry["so"] += _int(stat, "strikeOuts")
        entry["bb"] += _int(stat, "baseOnBalls")
        entry["hr"] += _int(stat, "homeRuns")
        entry["h"] += _int(stat, "hits")
        entry["ab"] += _int(stat, "atBats")
        entry["sf"] += _int(stat, "sacFlies")
        entry["g"] += _int(stat, "gamesPlayed")
        entry["gs"] += _int(stat, "gamesStarted")
        entry["doubles"] += _int(stat, "doubles")
        entry["triples"] += _int(stat, "triples")
        entry["r"] += _int(stat, "runs")
        entry["er"] += _int(stat, "earnedRuns")
        entry["ibb"] += _int(stat, "intentionalWalks")
        entry["hbp"] += _int(stat, "hitByPitch")

    # xFIP needs the league's home runs per fly ball, so the fly-ball counts have to be
    # totalled across everyone before any single pitcher's value can be worked out.
    batted_ball = savant_batted_ball()
    fly_balls: Dict[int, float] = {}
    league_fb = league_hr = 0.0
    for pid, entry in by_player.items():
        rates = batted_ball.get(pid)
        if not rates:
            continue
        # Balls in play, the denominator Savant's percentages are a share of.
        bip = entry["ab"] - entry["so"] - entry["hr"] + entry["sf"]
        if bip <= 0:
            continue
        count = bip * rates["fb"]
        fly_balls[pid] = count
        league_fb += count
        league_hr += entry["hr"]
    league_hr_per_fb = league_hr / league_fb if league_fb else 0.0
    if league_hr_per_fb:
        print(f"  league HR/FB = {league_hr_per_fb:.4f} over {league_fb:.0f} fly balls")

    rows: List[dict] = []
    matched = 0
    multi_team = 0
    rebuilt_xfip = 0
    for pid, entry in by_player.items():
        innings = entry["outs"] / 3.0
        batters = entry["tbf"]
        if innings <= 0 or batters <= 0:
            continue

        teams = list(dict.fromkeys(entry["teams"]))
        if len(teams) > 1:
            multi_team += 1
        team = teams[0] if len(teams) == 1 else f"{len(teams)} Tms"

        name = entry["name"]
        strikeouts = entry["so"]
        walks = entry["bb"]
        homers = entry["hr"]
        hits = entry["h"]
        at_bats = entry["ab"]
        sac_flies = entry["sf"]

        balls_in_play = at_bats - strikeouts - homers + sac_flies
        fip = (13 * homers + 3 * walks - 2 * strikeouts) / innings + FIP_CONSTANT
        on_base_denominator = at_bats + walks + entry["hbp"] + sac_flies
        total_bases = (
            hits + entry["doubles"] + 2 * entry["triples"] + 3 * homers
        )

        row = {
            "Season": CURRENT_SEASON,
            "Name": name,
            "Tm": team,
            # MLB's own innings notation, matching what the FanGraphs export wrote.
            "IP": f"{entry['outs'] // 3}.{entry['outs'] % 3}",
            "TBF": batters,
            "K/9": round(9 * strikeouts / innings, 2),
            "BB/9": round(9 * walks / innings, 2),
            "K/BB": round(strikeouts / walks, 2) if walks else "",
            "HR/9": round(9 * homers / innings, 4),
            # Fractions - clean_pct passes numeric columns straight through.
            "K%": _ratio(strikeouts, batters),
            "BB%": _ratio(walks, batters),
            "K-BB%": _ratio(strikeouts - walks, batters),
            "AVG": _ratio(hits, at_bats, 3),
            "WHIP": round((hits + walks) / innings, 3),
            "BABIP": _ratio(hits - homers, balls_in_play, 3),
            "FIP": round(fip, 3),
            # Standard xFIP, walk term including HBP. validate_xfip_source.py shows that
            # convention tracking the retired FanGraphs column at corr 0.899 / -0.04 mean.
            "xFIP": "",
            "GB%": "",
            "FB%": "",
            "LD%": "",
            "HR/FB": "",
            "G": entry["g"],
            # Carried so load_sp_pitchers can select actual starters instead of falling
            # back to "anyone who threw a pitch"; the FanGraphs export never had it.
            "GS": entry["gs"],
            "ERA": round(9 * entry["er"] / innings, 3),
            "H": hits,
            "2B": entry["doubles"],
            "3B": entry["triples"],
            "R": entry["r"],
            "ER": entry["er"],
            "HR": homers,
            "BB": walks,
            "IBB": entry["ibb"],
            "HBP": entry["hbp"],
            "SO": strikeouts,
            "OBP": _ratio(hits + walks + entry["hbp"], on_base_denominator, 3),
            "SLG": _ratio(total_bases, at_bats, 3),
        }

        rates = batted_ball.get(pid)
        count = fly_balls.get(pid)
        if rates and count is not None and league_hr_per_fb:
            row["GB%"] = round(rates["gb"], 4)
            row["FB%"] = round(rates["fb"], 4)
            row["LD%"] = round(rates["ld"], 4)
            row["HR/FB"] = round(homers / count, 4) if count else ""
            row["xFIP"] = round(
                (13 * (count * league_hr_per_fb) + 3 * (walks + entry["hbp"]) - 2 * strikeouts)
                / innings + FIP_CONSTANT,
                3,
            )
            rebuilt_xfip += 1

        prior = inherited.get(normalize_player_name(name))
        if prior:
            matched += 1
        for column in INHERITED_COLUMNS:
            row[column] = (prior or {}).get(column, "")
        # A Savant outage must not blank the only column PALS reads; fall back to the
        # previous file's value rather than publishing an empty one.
        if row["xFIP"] == "" and prior and str(prior.get("xFIP") or "").strip():
            row["xFIP"] = prior["xFIP"]
        rows.append(row)

    if not rows:
        print("  ERROR: no usable rows returned -- leaving the existing file alone")
        return

    with_xfip = sum(1 for r in rows if str(r.get("xFIP") or "").strip())
    carried_xfip = with_xfip - rebuilt_xfip
    path = os.path.join(DATA_DIR, TARGET)
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REFRESHED_COLUMNS + INHERITED_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Saved {len(rows)} rows -> {path} ({multi_team} multi-team, tagged \"N Tms\")")
    print(f"  inherited columns matched for {matched}/{len(rows)} rows")
    print(f"  xFIP: {rebuilt_xfip} rebuilt from Savant fly-ball rates, "
          f"{carried_xfip} carried from the previous file, "
          f"{len(rows) - with_xfip} empty")


if __name__ == "__main__":
    run()
