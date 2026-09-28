"""The two league pools behind the deeper MLB matchup sections.

1. Every hitter against every pitch type, from Baseball Savant's arsenal
   leaderboard on the BATTER side. The Lineup Versus Pitch Mix section reads a
   hitter's line against each pitch the opposing starter throws. The club-level
   board (pitch_type_board.json) could only say how the whole roster had hit a
   slider.

   Sign convention: on the batter leaderboard a positive run value is good for
   the HITTER, the opposite of the pitcher board scrape_pitch_run_value reads.

2. Every pitcher's season line and six situational splits from the MLB Stats
   API, with the club he is on now. The bullpen section grades each active
   reliever, and the unit he belongs to, against the league's relievers and
   the thirty pens on the same split. These are the pools it grades against.

Fail-closed like the other scrapers: a fetch that errors or comes back short
leaves the previous CSV in place.

    python -m scrapers.scrape_matchup_depth
"""
from __future__ import annotations

import csv
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import CURRENT_SEASON, DATA_DIR  # noqa: E402

STATS_API = "https://statsapi.mlb.com/api/v1"
BATTER_ARSENAL_URL = (
    "https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
    "?type=batter&pitchType=&year={season}&team=&min=1&csv=true"
)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "Chrome/124.0.0.0 Safari/537.36"
}

BATTER_OUT = Path(DATA_DIR) / "batter_pitch_types.csv"
RELIEVER_OUT = Path(DATA_DIR) / "reliever_splits.csv"
GAMES_OUT = Path(DATA_DIR) / "team_game_starters.csv"

BATTER_COLUMNS = ["player_id", "player_name", "team", "pitch_type", "pitch_name",
                  "pitches", "pa", "xwoba", "whiff_percent", "hard_hit_percent",
                  "run_value_per_100"]

# `season` is the full line. h / a / vl / vr are the rows the unit table already
# carries; lc (late and close) and risp are the two situations a bullpen is
# brought in for.
SPLITS = ("season", "h", "a", "vl", "vr", "lc", "risp")
RELIEVER_COLUMNS = ["split", "player_id", "name", "team_id", "games", "games_started",
                    "saves", "holds", "outs", "bf", "ab", "h", "bb", "ibb", "hbp", "so",
                    "hr", "tb", "sf", "er"]

# Below these a pull is incomplete, not a quiet day.
MIN_BATTER_ROWS = 2000
MIN_PITCHERS_PER_SPLIT = 400


def _get(url: str, attempts: int = 3, timeout: int = 60) -> Optional[bytes]:
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"  fetch failed ({attempt}/{attempts}): {exc}")
            if attempt < attempts:
                time.sleep(2 * attempt)
    return None


def _json(url: str) -> Optional[dict]:
    raw = _get(url)
    if raw is None:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except ValueError:
        return None


def _num(value):
    text = str(value if value is not None else "").strip()
    if not text:
        return ""
    try:
        return float(text)
    except ValueError:
        return ""


def _write(path: Path, columns: list[str], rows: list[dict]) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def scrape_batter_pitch_types(season: int) -> bool:
    raw = _get(BATTER_ARSENAL_URL.format(season=season), timeout=120)
    if raw is None:
        print("  KEPT batter pitch types: Savant fetch failed")
        return False
    rows = []
    for row in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))):
        pid = str(row.get("player_id") or "").strip()
        code = str(row.get("pitch_type") or "").strip().upper()
        if not pid or not code:
            continue
        rows.append({
            "player_id": pid,
            "player_name": row.get("last_name, first_name") or "",
            "team": row.get("team_name_alt") or "",
            "pitch_type": code,
            "pitch_name": row.get("pitch_name") or code,
            "pitches": _num(row.get("pitches")),
            "pa": _num(row.get("pa")),
            "xwoba": _num(row.get("est_woba")),
            "whiff_percent": _num(row.get("whiff_percent")),
            "hard_hit_percent": _num(row.get("hard_hit_percent")),
            "run_value_per_100": _num(row.get("run_value_per_100")),
        })
    if len(rows) < MIN_BATTER_ROWS:
        print(f"  KEPT batter pitch types: only {len(rows)} rows came back")
        return False
    _write(BATTER_OUT, BATTER_COLUMNS, rows)
    print(f"  Saved {len(rows)} batter pitch-type rows -> {BATTER_OUT}")
    return True


def _current_teams(season: int) -> dict[str, int]:
    """Pitcher id -> the club he is on now. A reliever traded in July belongs to
    the pen he is pitching for in October, whatever his season line says.

    Position players are left out: a catcher's mop-up inning is on the club's
    pitching line, but the page builds a pen from the pitchers on the active
    roster, so the pool it is graded against must be built the same way."""
    payload = _json(f"{STATS_API}/sports/1/players?season={season}") or {}
    out: dict[str, int] = {}
    for person in payload.get("people") or []:
        team = (person.get("currentTeam") or {}).get("id")
        kind = (person.get("primaryPosition") or {}).get("type") or ""
        if person.get("id") and team and kind in ("Pitcher", "Two-Way Player"):
            out[str(person["id"])] = int(team)
    return out


def _split_rows(season: int, split: str) -> list[dict]:
    if split == "season":
        url = (f"{STATS_API}/stats?stats=season&group=pitching&playerPool=ALL"
               f"&season={season}&sportIds=1&gameType=R&limit=5000")
    else:
        url = (f"{STATS_API}/stats?stats=statSplits&group=pitching&sitCodes={split}"
               f"&playerPool=ALL&season={season}&sportIds=1&gameType=R&limit=5000")
    payload = _json(url) or {}
    return ((payload.get("stats") or [{}])[0] or {}).get("splits") or []


def scrape_reliever_splits(season: int) -> bool:
    teams = _current_teams(season)
    if len(set(teams.values())) < 30:
        print("  KEPT reliever splits: the current-team roster pull came back short")
        return False
    rows = []
    for split in SPLITS:
        found = _split_rows(season, split)
        if len(found) < MIN_PITCHERS_PER_SPLIT:
            print(f"  KEPT reliever splits: {split} returned {len(found)} pitchers")
            return False
        for entry in found:
            pid = str((entry.get("player") or {}).get("id") or "")
            stat = entry.get("stat") or {}
            if not pid or pid not in teams:
                continue
            outs = stat.get("outs", stat.get("outsPitched"))
            rows.append({
                "split": split,
                "player_id": pid,
                "name": (entry.get("player") or {}).get("fullName") or "",
                "team_id": teams[pid],
                "games": stat.get("gamesPitched", stat.get("gamesPlayed", "")),
                "games_started": stat.get("gamesStarted", ""),
                "saves": stat.get("saves", ""),
                "holds": stat.get("holds", ""),
                "outs": outs if outs is not None else "",
                "bf": stat.get("battersFaced", ""),
                "ab": stat.get("atBats", ""),
                "h": stat.get("hits", ""),
                "bb": stat.get("baseOnBalls", ""),
                "ibb": stat.get("intentionalWalks", ""),
                "hbp": stat.get("hitBatsmen", stat.get("hitByPitch", "")),
                "so": stat.get("strikeOuts", ""),
                "hr": stat.get("homeRuns", ""),
                "tb": stat.get("totalBases", ""),
                "sf": stat.get("sacFlies", ""),
                "er": stat.get("earnedRuns", ""),
            })
    _write(RELIEVER_OUT, RELIEVER_COLUMNS, rows)
    print(f"  Saved {len(rows)} pitcher split rows -> {RELIEVER_OUT}")
    return True


GAME_COLUMNS = ["date", "game_pk", "game_type", "team_id", "opp_id", "home",
                "runs", "allowed", "won", "opp_starter_id", "opp_starter_hand"]
MIN_FINAL_GAMES = 1000


def _box_starters(game_pk: int) -> Optional[dict]:
    """The pitcher who actually started for each side, from the box score.
    The schedule's probablePitcher is the announced arm and was wrong on about
    one side in eighty when sampled; the box score's first pitcher is the start."""
    payload = _json(f"{STATS_API}/game/{game_pk}/boxscore?fields=teams,away,home,pitchers")
    teams = (payload or {}).get("teams") or {}
    out = {}
    for side in ("away", "home"):
        pitchers = (teams.get(side) or {}).get("pitchers") or []
        out[side] = pitchers[0] if pitchers else None
    return out if out.get("away") and out.get("home") else None


def scrape_team_game_starters(season: int) -> bool:
    """One row per club per completed game - regular season and postseason -
    with the hand of the pitcher who started against it. The Runs Vs Starter
    Hand section is built from this."""
    from concurrent.futures import ThreadPoolExecutor

    schedule = _json(f"{STATS_API}/schedule?sportId=1&season={season}&gameType=R,F,D,L,W"
                     "&fields=dates,date,games,gamePk,gameType,status,detailedState,teams,"
                     "away,home,team,id,score,isWinner") or {}
    finals = [(block["date"], game) for block in schedule.get("dates") or []
              for game in block.get("games") or []
              if (game.get("status") or {}).get("detailedState") == "Final"]
    if len(finals) < MIN_FINAL_GAMES:
        print(f"  KEPT team game starters: only {len(finals)} final games")
        return False
    with ThreadPoolExecutor(max_workers=16) as pool:
        starters = list(pool.map(lambda item: _box_starters(item[1]["gamePk"]), finals))
    ids = sorted({pid for pair in starters if pair for pid in pair.values()})
    hands: dict[int, str] = {}
    for i in range(0, len(ids), 150):
        chunk = ",".join(str(pid) for pid in ids[i:i + 150])
        for person in (_json(f"{STATS_API}/people?personIds={chunk}&fields=people,id,pitchHand,code")
                       or {}).get("people") or []:
            hands[person["id"]] = (person.get("pitchHand") or {}).get("code") or ""
    rows = []
    for (date, game), pair in zip(finals, starters):
        if not pair:
            continue
        teams = game.get("teams") or {}
        for side, other in (("away", "home"), ("home", "away")):
            mine, theirs = teams.get(side) or {}, teams.get(other) or {}
            opp_starter = pair[other]
            rows.append({
                "date": date, "game_pk": game["gamePk"], "game_type": game.get("gameType", ""),
                "team_id": (mine.get("team") or {}).get("id"),
                "opp_id": (theirs.get("team") or {}).get("id"),
                "home": 1 if side == "home" else 0,
                "runs": mine.get("score", ""), "allowed": theirs.get("score", ""),
                "won": 1 if mine.get("isWinner") else 0,
                "opp_starter_id": opp_starter, "opp_starter_hand": hands.get(opp_starter, ""),
            })
    if len(rows) < 2 * MIN_FINAL_GAMES:
        print(f"  KEPT team game starters: only {len(rows)} rows resolved a starter")
        return False
    _write(GAMES_OUT, GAME_COLUMNS, rows)
    print(f"  Saved {len(rows)} team-game rows -> {GAMES_OUT}")
    return True


def run(season: int = CURRENT_SEASON) -> None:
    print(f"Fetching batter pitch-type lines, reliever splits and starter hands for {season}...")
    scrape_batter_pitch_types(season)
    scrape_reliever_splits(season)
    scrape_team_game_starters(season)


if __name__ == "__main__":
    run()
