"""Scrape per-team game results from MLB Stats API (Final games only)."""

from __future__ import annotations

import time
from datetime import date, datetime
from typing import Dict, List, Optional

import pandas as pd
import requests

from core.config import CURRENT_SEASON, DATA_DIR, SEASON_END, SEASON_START, TEAM_MAP_BY_ID
from core.metrics_utils import parse_ip

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule"
FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
BOXSCORE_URL = "https://statsapi.mlb.com/api/v1/game/{game_pk}/boxscore"
OUTPUT_FILE = DATA_DIR / "game_results.csv"

RESULT_COLUMNS = [
    "game_pk",
    "date",
    "team",
    "opp",
    "home_away",
    "team_runs",
    "opp_runs",
    "result",
    "lead_after_5",
    "winning_pitcher_id",
    "winning_pitcher_is_starter",
    "save_pitcher_id",
    "opp_starter_id",
    "opp_starter_ip",
    "opp_starter_er",
    "opp_quality_start",
    "team_starter_id",
    "team_starter_ip",
    "team_starter_er",
    "team_quality_start",
    "blown_save",
    "opp_pitches",
    "team_innings_batted",
    "had_opener",
]


def _request_json(url: str, params: Optional[dict] = None, retries: int = 3) -> dict:
    last_exc: Optional[Exception] = None
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, headers=HEADERS, timeout=35)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # pragma: no cover - network behavior
            last_exc = exc
            time.sleep(0.5 * (2**attempt))
    raise RuntimeError(f"request failed after retries: {url} ({last_exc})")


def _season_bounds() -> tuple[str, str]:
    start = datetime.strptime(SEASON_START, "%Y-%m-%d").date()
    end_cfg = datetime.strptime(SEASON_END, "%Y-%m-%d").date()
    today = date.today()
    end = min(today, end_cfg)
    return start.isoformat(), end.isoformat()


def _team_abbr(team_id: Optional[int]) -> str:
    if not team_id:
        return ""
    return TEAM_MAP_BY_ID.get(int(team_id), "")


def _load_existing() -> pd.DataFrame:
    if not OUTPUT_FILE.exists():
        return pd.DataFrame(columns=RESULT_COLUMNS)
    try:
        df = pd.read_csv(OUTPUT_FILE)
    except Exception:
        return pd.DataFrame(columns=RESULT_COLUMNS)
    for col in RESULT_COLUMNS:
        if col not in df.columns:
            df[col] = None
    return df[RESULT_COLUMNS]


def _f5_result(feed: dict, is_home: bool) -> str:
    innings = feed.get("liveData", {}).get("linescore", {}).get("innings", [])
    home_runs = 0
    away_runs = 0
    played = 0
    for inn in innings:
        num = int(inn.get("num", 0) or 0)
        if num < 1 or num > 5:
            continue
        played += 1
        home_runs += int((inn.get("home") or {}).get("runs") or 0)
        away_runs += int((inn.get("away") or {}).get("runs") or 0)
    if played < 5:
        return ""
    team_runs = home_runs if is_home else away_runs
    opp_runs = away_runs if is_home else home_runs
    if team_runs > opp_runs:
        return "W"
    if team_runs < opp_runs:
        return "L"
    return "tie"


def _starter_from_boxscore(team_box: dict) -> tuple[Optional[int], Optional[float], Optional[int]]:
    players = team_box.get("players", {}) or {}
    starter_id = None
    starter_ip = None
    starter_er = None
    starter_order = 9999

    for pid_key, pdata in players.items():
        stat = pdata.get("stats", {}).get("pitching", {}) or {}
        gs = int(stat.get("gamesStarted") or 0)
        if gs != 1:
            continue
        pid = int(str(pid_key).replace("ID", ""))
        order = int(stat.get("battersFaced") or 9999)
        ip = parse_ip(stat.get("inningsPitched"))
        er = int(stat.get("earnedRuns") or 0)
        if starter_id is None or order < starter_order:
            starter_id = pid
            starter_order = order
            starter_ip = ip
            starter_er = er

    if starter_id is None:
        pids = team_box.get("pitchers", []) or []
        if pids:
            pid = int(pids[0])
            pdata = players.get(f"ID{pid}", {})
            stat = pdata.get("stats", {}).get("pitching", {}) or {}
            starter_id = pid
            starter_ip = parse_ip(stat.get("inningsPitched"))
            starter_er = int(stat.get("earnedRuns") or 0)

    return starter_id, starter_ip, starter_er


def _had_opener(team_box: dict, starter_id: Optional[int], starter_ip: Optional[float]) -> bool:
    if not starter_id or starter_ip is None:
        return False
    if starter_ip > 2.0:
        return False
    players = team_box.get("players", {}) or {}
    others = []
    for pid in (team_box.get("pitchers", []) or []):
        if int(pid) == int(starter_id):
            continue
        stat = players.get(f"ID{pid}", {}).get("stats", {}).get("pitching", {}) or {}
        ip = parse_ip(stat.get("inningsPitched"))
        if ip is not None:
            others.append(ip)
    return bool(others and max(others) > starter_ip)


def _team_innings_batted(feed: dict, is_home: bool) -> int:
    innings = feed.get("liveData", {}).get("linescore", {}).get("innings", [])
    side = "home" if is_home else "away"
    total = 0
    for inn in innings:
        half = inn.get(side) or {}
        # Missing half-inning indicates no batting chance taken (walk-off / bottom not played).
        if "runs" in half and half.get("runs") is not None:
            total += 1
    return total


def _blown_save(team_box: dict) -> bool:
    players = team_box.get("players", {}) or {}
    for pdata in players.values():
        bs = (pdata.get("stats", {}).get("pitching", {}) or {}).get("blownSaves")
        if int(bs or 0) > 0:
            return True
    return False


def _rows_for_game(game: dict, feed: dict, boxscore: dict) -> List[dict]:
    game_pk = int(game.get("gamePk"))
    game_date = game.get("officialDate") or game.get("gameDate", "")[:10]
    teams = game.get("teams", {})
    home = teams.get("home", {}) or {}
    away = teams.get("away", {}) or {}

    home_id = ((home.get("team") or {}).get("id"))
    away_id = ((away.get("team") or {}).get("id"))
    home_abbr = _team_abbr(home_id)
    away_abbr = _team_abbr(away_id)
    home_runs = int(home.get("score") or 0)
    away_runs = int(away.get("score") or 0)

    decisions = feed.get("liveData", {}).get("decisions", {}) or {}
    winner_id = ((decisions.get("winner") or {}).get("id"))
    save_id = ((decisions.get("save") or {}).get("id"))

    box_home = (boxscore.get("teams", {}) or {}).get("home", {}) or {}
    box_away = (boxscore.get("teams", {}) or {}).get("away", {}) or {}
    home_starter_id, home_starter_ip, home_starter_er = _starter_from_boxscore(box_home)
    away_starter_id, away_starter_ip, away_starter_er = _starter_from_boxscore(box_away)

    def make_row(is_home: bool) -> dict:
        team = home_abbr if is_home else away_abbr
        opp = away_abbr if is_home else home_abbr
        team_runs = home_runs if is_home else away_runs
        opp_runs = away_runs if is_home else home_runs
        team_box = box_home if is_home else box_away
        opp_box = box_away if is_home else box_home
        team_starter_id = home_starter_id if is_home else away_starter_id
        team_starter_ip = home_starter_ip if is_home else away_starter_ip
        team_starter_er = home_starter_er if is_home else away_starter_er
        opp_starter_id = away_starter_id if is_home else home_starter_id
        opp_starter_ip = away_starter_ip if is_home else home_starter_ip
        opp_starter_er = away_starter_er if is_home else home_starter_er
        opp_pitches = int(((opp_box.get("teamStats", {}) or {}).get("pitching", {}) or {}).get("pitchesThrown") or 0)
        return {
            "game_pk": game_pk,
            "date": game_date,
            "team": team,
            "opp": opp,
            "home_away": "home" if is_home else "away",
            "team_runs": team_runs,
            "opp_runs": opp_runs,
            "result": "W" if team_runs > opp_runs else "L",
            "lead_after_5": _f5_result(feed, is_home),
            "winning_pitcher_id": winner_id,
            "winning_pitcher_is_starter": bool(winner_id and team_starter_id and int(winner_id) == int(team_starter_id)),
            "save_pitcher_id": save_id,
            "opp_starter_id": opp_starter_id,
            "opp_starter_ip": opp_starter_ip,
            "opp_starter_er": opp_starter_er,
            "opp_quality_start": bool(opp_starter_ip is not None and opp_starter_ip >= 6 and int(opp_starter_er or 0) <= 3),
            "team_starter_id": team_starter_id,
            "team_starter_ip": team_starter_ip,
            "team_starter_er": team_starter_er,
            "team_quality_start": bool(team_starter_ip is not None and team_starter_ip >= 6 and int(team_starter_er or 0) <= 3),
            "blown_save": _blown_save(team_box),
            "opp_pitches": opp_pitches,
            "team_innings_batted": _team_innings_batted(feed, is_home),
            "had_opener": _had_opener(team_box, team_starter_id, team_starter_ip),
        }

    return [make_row(True), make_row(False)]


def run():
    print(f"Scraping game results for {CURRENT_SEASON}...")
    start_date, end_date = _season_bounds()
    schedule = _request_json(
        SCHEDULE_URL,
        params={"sportId": 1, "gameType": "R", "startDate": start_date, "endDate": end_date},
    )

    games = []
    for day in schedule.get("dates", []):
        for game in day.get("games", []):
            status = game.get("status", {}) or {}
            if status.get("abstractGameState") != "Final":
                continue
            if status.get("codedGameState") not in ("F", "O"):
                continue
            games.append(game)
    print(f"  Final games in range: {len(games)}")

    existing = _load_existing()
    done_keys = {
        (int(row.game_pk), str(row.team).strip().upper())
        for row in existing.itertuples(index=False)
        if pd.notna(row.game_pk) and str(row.team).strip()
    }

    new_rows: List[dict] = []
    skipped = 0
    failures = 0
    for game in games:
        game_pk = int(game.get("gamePk"))
        home_id = ((game.get("teams", {}).get("home", {}).get("team", {}) or {}).get("id"))
        away_id = ((game.get("teams", {}).get("away", {}).get("team", {}) or {}).get("id"))
        home_abbr = _team_abbr(home_id)
        away_abbr = _team_abbr(away_id)
        if not home_abbr or not away_abbr:
            continue
        if (game_pk, home_abbr) in done_keys and (game_pk, away_abbr) in done_keys:
            skipped += 1
            continue
        try:
            feed = _request_json(FEED_URL.format(game_pk=game_pk))
            box = _request_json(BOXSCORE_URL.format(game_pk=game_pk))
            new_rows.extend(_rows_for_game(game, feed, box))
        except Exception as exc:
            failures += 1
            print(f"  WARNING: game {game_pk} parse failed ({exc})")
        time.sleep(0.12)

    merged = existing
    if new_rows:
        incoming = pd.DataFrame(new_rows)
        for col in RESULT_COLUMNS:
            if col not in incoming.columns:
                incoming[col] = None
        incoming = incoming[RESULT_COLUMNS]
        merged = pd.concat([existing, incoming], ignore_index=True)
        merged["team"] = merged["team"].astype(str).str.strip().str.upper()
        merged["game_pk"] = pd.to_numeric(merged["game_pk"], errors="coerce")
        merged = merged.dropna(subset=["game_pk", "team"])
        merged["game_pk"] = merged["game_pk"].astype(int)
        merged = merged.drop_duplicates(subset=["game_pk", "team"], keep="last")
        merged = merged.sort_values(["date", "game_pk", "team"]).reset_index(drop=True)

    merged = merged[merged["team"].isin(set(TEAM_MAP_BY_ID.values()))]

    merged.to_csv(OUTPUT_FILE, index=False)
    print(f"  Upserted rows: {len(new_rows)} | skipped cached games: {skipped} | failures: {failures}")
    print(f"  Saved {len(merged)} team-game rows -> {OUTPUT_FILE}")


if __name__ == "__main__":
    run()
