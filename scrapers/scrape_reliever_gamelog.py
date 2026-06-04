"""Scrape relief appearances for all 30 MLB teams from the Stats API."""

from __future__ import annotations

import re
import time
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests

from core.config import CURRENT_SEASON, DATA_DIR, TEAM_MAP, TEAM_MAP_BY_ID
from scrapers.scrape_sp_gamelog import (
    fetch_game_feed,
    load_team_metrics,
    opponent_tier,
    team_metrics_lookup,
)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MLB_TEAMS_URL = "https://statsapi.mlb.com/api/v1/teams"
MLB_ROSTER_URL = "https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"
MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/people/{player_id}/stats"

GAMELOG_COLUMNS = [
    "date",
    "pitcher_name",
    "pitcher_id",
    "pitcher_team",
    "pitcher_hand",
    "opponent_team",
    "home_away",
    "IP",
    "ER",
    "R",
    "H",
    "BB",
    "K",
    "HR",
    "pitches",
    "inherited_runners",
    "inherited_scored",
    "entry_inning",
    "leverage_situation",
    "result",
    "batters_faced",
    "game_pk",
    "batter_hand_faced",
    "opponent_OSI",
    "opponent_ABQ",
    "opponent_RCV",
    "opponent_OBR",
    "opponent_OSI_tier",
    "opponent_ABQ_tier",
]

_appearance_cache: Dict[Tuple[int, int], dict] = {}


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", str(name).lower()).strip()


def fetch_team_ids(season: int) -> Dict[int, str]:
    """Return active MLB team id -> abbreviation (30 teams)."""
    r = requests.get(
        MLB_TEAMS_URL,
        params={"sportId": 1, "season": str(season)},
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    mapping: Dict[int, str] = {}
    for team in r.json().get("teams", []):
        tid = team.get("id")
        if not tid:
            continue
        abbr = TEAM_MAP_BY_ID.get(tid)
        if not abbr:
            name = team.get("name", "")
            abbr = TEAM_MAP.get(name, team.get("abbreviation", "")[:3].upper())
        if abbr:
            mapping[tid] = abbr
    if len(mapping) < 30:
        mapping.update({k: v for k, v in TEAM_MAP_BY_ID.items() if k not in mapping})
    print(f"  Resolved {len(mapping)} teams")
    return mapping


def fetch_team_pitchers(team_id: int, season: int) -> List[dict]:
    r = requests.get(
        MLB_ROSTER_URL.format(team_id=team_id),
        params={"rosterType": "active", "season": str(season)},
        headers=HEADERS,
        timeout=30,
    )
    if r.status_code != 200:
        return []
    pitchers = []
    for entry in r.json().get("roster", []):
        person = entry.get("person", {})
        pos = entry.get("position", {}).get("abbreviation", "")
        if pos != "P":
            continue
        pid = person.get("id")
        if not pid:
            continue
        hand = (
            person.get("pitchHand", {}).get("code")
            or entry.get("pitchHand", {}).get("code")
            or "R"
        )
        pitchers.append(
            {
                "id": pid,
                "name": person.get("fullName", ""),
                "hand": str(hand).upper()[:1] or "R",
            }
        )
    return pitchers


def fetch_pitcher_gamelog(player_id: int, season: int) -> list:
    r = requests.get(
        MLB_STATS_URL.format(player_id=player_id),
        params={
            "stats": "gameLog",
            "group": "pitching",
            "season": str(season),
            "gameType": "R",
        },
        headers=HEADERS,
        timeout=30,
    )
    r.raise_for_status()
    stats = r.json().get("stats", [])
    if not stats:
        return []
    return stats[0].get("splits", [])


def _pitcher_side(is_home: bool) -> str:
    return "home" if is_home else "away"


def _signed_lead(home_score: int, away_score: int, pitcher_side: str) -> int:
    if pitcher_side == "home":
        return int(home_score) - int(away_score)
    return int(away_score) - int(home_score)


def classify_leverage(entry_inning: int, lead: int, inherited_runners: int) -> str:
    margin = abs(lead)
    if entry_inning >= 8 or (entry_inning >= 7 and margin <= 2):
        return "high"
    if inherited_runners >= 2 and entry_inning >= 6:
        return "high"
    if entry_inning <= 5 and margin >= 4:
        return "low"
    if entry_inning >= 7 or inherited_runners > 0 or margin <= 3:
        return "medium"
    return "low"


def classify_result(
    stat: dict,
    entry_lead: Optional[int] = None,
    exit_lead: Optional[int] = None,
) -> str:
    saves = int(stat.get("saves") or 0)
    blown = int(stat.get("blownSaves") or 0)
    holds = int(stat.get("holds") or 0)
    save_opp = int(stat.get("saveOpportunities") or 0)

    if saves:
        return "save"
    if blown:
        return "blown_save"
    if holds:
        return "hold"
    if save_opp == 0 and entry_lead is not None and entry_lead > 0:
        if exit_lead is not None and exit_lead <= 0:
            return "blown_hold"
    return "other"


def appearance_context(
    game_pk: int,
    pitcher_id: int,
    pitcher_side: str,
) -> dict:
    key = (game_pk, pitcher_id)
    if key in _appearance_cache:
        return _appearance_cache[key]

    default = {
        "entry_inning": None,
        "entry_lead": None,
        "exit_lead": None,
        "leverage_situation": "medium",
        "batter_hand_faced": "",
    }
    try:
        feed = fetch_game_feed(game_pk)
        plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
    except Exception:
        _appearance_cache[key] = default
        return default

    entry_inning = None
    entry_lead = None
    exit_lead = None
    lhb = 0
    rhb = 0
    active = False

    for play in plays:
        pit = play.get("matchup", {}).get("pitcher", {}).get("id")
        result = play.get("result", {})
        hs = result.get("homeScore")
        aw = result.get("awayScore")

        if pit == pitcher_id:
            if not active:
                active = True
                entry_inning = play.get("about", {}).get("inning")
                if hs is not None and aw is not None:
                    entry_lead = _signed_lead(hs, aw, pitcher_side)
            if hs is not None and aw is not None:
                exit_lead = _signed_lead(hs, aw, pitcher_side)
            bat = play.get("matchup", {}).get("batSide", {}).get("code")
            if bat == "L":
                lhb += 1
            elif bat == "R":
                rhb += 1
        elif active:
            break

    inherited = 0
    leverage = "medium"
    if entry_inning is not None:
        leverage = classify_leverage(int(entry_inning), entry_lead or 0, inherited)

    if lhb > rhb:
        hand_faced = "LHH"
    elif rhb > lhb:
        hand_faced = "RHH"
    else:
        hand_faced = ""

    ctx = {
        "entry_inning": entry_inning,
        "entry_lead": entry_lead,
        "exit_lead": exit_lead,
        "leverage_situation": leverage,
        "batter_hand_faced": hand_faced,
    }
    _appearance_cache[key] = ctx
    return ctx


def parse_relief_appearance(
    split: dict,
    pitcher_name: str,
    pitcher_id: int,
    pitcher_team: str,
    pitcher_hand: str,
    metrics_lookup: Dict[str, dict],
) -> Optional[dict]:
    stat = split.get("stat", {})
    if stat.get("gamesStarted", 0) == 1:
        return None
    ip_raw = stat.get("inningsPitched")
    if not ip_raw or str(ip_raw) in ("0", "0.0"):
        return None

    opp_name = split.get("opponent", {}).get("name", "")
    opponent = TEAM_MAP.get(opp_name, opp_name[:3].upper() if opp_name else "")
    is_home = bool(split.get("isHome"))
    home_away = "home" if is_home else "away"
    game_pk = split.get("game", {}).get("gamePk")

    inherited = int(stat.get("inheritedRunners") or 0)
    inherited_scored = int(stat.get("inheritedRunnersScored") or 0)

    ctx = {"entry_inning": None, "leverage_situation": "medium", "batter_hand_faced": ""}
    entry_lead = exit_lead = None
    if game_pk:
        ctx = appearance_context(game_pk, pitcher_id, _pitcher_side(is_home))
        entry_lead = ctx.get("entry_lead")
        exit_lead = ctx.get("exit_lead")
        if game_pk and ctx.get("entry_inning") is not None:
            ctx["leverage_situation"] = classify_leverage(
                int(ctx["entry_inning"]),
                entry_lead or 0,
                inherited,
            )

    opp_row = metrics_lookup.get(opponent.upper(), {})
    opp_osi = opp_row.get("OSI")
    opp_abq = opp_row.get("ABQ")
    opp_rcv = opp_row.get("RCV")
    opp_obr = opp_row.get("OBR")

    return {
        "date": split.get("date", ""),
        "pitcher_name": pitcher_name,
        "pitcher_id": pitcher_id,
        "pitcher_team": pitcher_team,
        "pitcher_hand": pitcher_hand,
        "opponent_team": opponent,
        "home_away": home_away,
        "IP": ip_raw,
        "ER": int(stat.get("earnedRuns") or 0),
        "R": int(stat.get("runs") or stat.get("earnedRuns") or 0),
        "H": int(stat.get("hits") or 0),
        "BB": int(stat.get("baseOnBalls") or 0),
        "K": int(stat.get("strikeOuts") or 0),
        "HR": int(stat.get("homeRuns") or 0),
        "pitches": int(stat.get("numberOfPitches") or 0),
        "inherited_runners": inherited,
        "inherited_scored": inherited_scored,
        "entry_inning": ctx.get("entry_inning"),
        "leverage_situation": ctx.get("leverage_situation"),
        "result": classify_result(stat, entry_lead, exit_lead),
        "batters_faced": int(stat.get("battersFaced") or 0),
        "game_pk": game_pk,
        "batter_hand_faced": ctx.get("batter_hand_faced", ""),
        "opponent_OSI": round(float(opp_osi), 1) if pd.notna(opp_osi) else None,
        "opponent_ABQ": round(float(opp_abq), 1) if pd.notna(opp_abq) else None,
        "opponent_RCV": round(float(opp_rcv), 1) if pd.notna(opp_rcv) else None,
        "opponent_OBR": round(float(opp_obr), 1) if pd.notna(opp_obr) else None,
        "opponent_OSI_tier": opponent_tier(opp_osi),
        "opponent_ABQ_tier": opponent_tier(opp_abq),
    }


def run():
    print(f"Scraping reliever game logs for {CURRENT_SEASON} (all 30 teams)...")
    metrics_r = team_metrics_lookup(load_team_metrics("R"))
    metrics_l = team_metrics_lookup(load_team_metrics("L"))
    team_ids = fetch_team_ids(CURRENT_SEASON)

    rows: List[dict] = []
    seen: set = set()

    for team_id, team_abbr in sorted(team_ids.items(), key=lambda x: x[1]):
        pitchers = fetch_team_pitchers(team_id, CURRENT_SEASON)
        print(f"  {team_abbr}: {len(pitchers)} pitchers on roster")
        for p in pitchers:
            pid = p["id"]
            if pid in seen:
                continue
            seen.add(pid)
            hand = p.get("hand", "R")
            metrics_lookup = metrics_r if hand == "R" else metrics_l
            try:
                splits = fetch_pitcher_gamelog(pid, CURRENT_SEASON)
            except Exception as exc:
                print(f"    WARNING: {p['name']}: {exc}")
                continue

            for split in splits:
                row = parse_relief_appearance(
                    split,
                    p["name"],
                    pid,
                    team_abbr,
                    hand,
                    metrics_lookup,
                )
                if row:
                    rows.append(row)
            time.sleep(0.12)

    out_path = DATA_DIR / "reliever_gamelog.csv"
    df = pd.DataFrame(rows)
    if df.empty:
        print("  No relief appearances found -- writing empty file")
        df = pd.DataFrame(columns=GAMELOG_COLUMNS)
    else:
        cols = [c for c in GAMELOG_COLUMNS if c in df.columns]
        df = df[cols]

    df.to_csv(out_path, index=False)
    print(f"  Saved {len(df)} relief appearances -> {out_path}")


if __name__ == "__main__":
    run()
