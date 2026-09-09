#!/usr/bin/env python3
"""Build allowlisted public MLB/NFL slates from factual pipeline CSVs (and ESPN for NFL).

Fail closed: never write an empty slate over a known-good file; never copy model fields.
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from project_public_slate import assert_clean, project_slate  # noqa: E402

from core.config import DATA_DIR  # noqa: E402

ET = ZoneInfo("America/New_York")
PUBLIC_DIR = ROOT / "data" / "public"


def _cell(row: dict, *names: str) -> str:
    lower = {str(k).lower(): k for k in row}
    for name in names:
        key = lower.get(name.lower())
        if key is None:
            continue
        val = row.get(key)
        if val is None:
            continue
        text = str(val).strip()
        if text and text not in {"--", "nan", "None"}:
            return text
    return ""


def _parse_kickoff(slate_date: str, time_label: str) -> str | None:
    if not slate_date or not time_label or time_label.upper() == "TBD":
        return None
    cleaned = time_label.replace(" ET", "").replace("ET", "").strip()
    for fmt in ("%I:%M %p", "%H:%M"):
        try:
            clock = datetime.strptime(cleaned, fmt).time()
            local = datetime.combine(datetime.fromisoformat(slate_date).date(), clock, tzinfo=ET)
            return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return None


def _read_csv(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _lineup_state(rows: list[dict], away: str, home: str) -> tuple[str, str]:
    away_state = home_state = ""
    for row in rows:
        game = _cell(row, "Game", "matchup")
        team = _cell(row, "Team", "Tm")
        status = _cell(row, "Status", "Lineup_Status", "state")
        if not status:
            status = "Projected" if _cell(row, "Batter", "Name") else ""
        key = f"{away}@{home}"
        if game and key not in game.replace(" ", "") and f"{away} @ {home}" not in game:
            continue
        if team == away and status:
            away_state = status
        if team == home and status:
            home_state = status
    if rows and not away_state and not home_state:
        # Rotowire export present for the slate — treat as projected until confirmed tags exist.
        return "Projected", "Projected"
    return away_state, home_state


def mlb_producer(data_dir: Path) -> dict:
    matchups = _read_csv(data_dir / "today_matchups.csv")
    weather = _read_csv(data_dir / "today_weather.csv")
    lineups = _read_csv(data_dir / "today_lineups.csv")
    wx = {}
    for row in weather:
        wx[f"{_cell(row, 'away_team')}@{_cell(row, 'home_team')}"] = row
    games = []
    for row in matchups:
        away = _cell(row, "Away", "Away_Team")
        home = _cell(row, "Home", "Home_Team")
        if not away or not home:
            continue
        key = f"{away}@{home}"
        w = wx.get(key, {})
        temp = _cell(w, "temperature_f")
        cond = _cell(w, "conditions", "conditions_raw")
        conditions = " ".join(x for x in (f"{temp}F" if temp else "", cond) if x)
        away_lu, home_lu = _lineup_state(lineups, away, home)
        slate_date = _cell(row, "Slate_Date")
        time_label = _cell(row, "Time", "Game_Time")
        away_hand = _cell(row, "Away_Hand", "Away_SP_Hand")
        home_hand = _cell(row, "Home_Hand", "Home_SP_Hand")
        away_sp = _cell(row, "Away_SP")
        home_sp = _cell(row, "Home_SP")
        games.append({
            "id": f"{slate_date or 'mlb'}-{away}-{home}".lower(),
            "away": away,
            "home": home,
            "kickoff_utc": _parse_kickoff(slate_date, time_label),
            "kickoff_display": time_label or None,
            "venue": _cell(w, "stadium_name") or None,
            "conditions": conditions or None,
            "away_starter": " · ".join(x for x in (away_sp, f"{away_hand}HP" if away_hand else "") if x) or None,
            "home_starter": " · ".join(x for x in (home_sp, f"{home_hand}HP" if home_hand else "") if x) or None,
            "away_lineup_state": away_lu or None,
            "home_lineup_state": home_lu or None,
            "game_state": "scheduled",
            "freshness": "Current",
        })
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "generated_at_utc": now,
        "data_through_utc": now,
        "games": games,
    }


def nfl_producer_from_espn(payload: dict) -> dict:
    games = []
    for event in payload.get("events") or []:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        teams = {c.get("homeAway"): c for c in (comp.get("competitors") or [])}
        away = teams.get("away") or {}
        home = teams.get("home") or {}
        away_abbr = (away.get("team") or {}).get("abbreviation") or ""
        home_abbr = (home.get("team") or {}).get("abbreviation") or ""
        if not away_abbr or not home_abbr:
            continue
        status = ((comp.get("status") or {}).get("type") or {}).get("name") or "scheduled"
        state = "final" if status.lower() in {"status_final", "final"} else (
            "live" if "in" in status.lower() or status.lower() == "status_in_progress" else "scheduled"
        )
        kickoff = event.get("date") or comp.get("date")
        venue = ((comp.get("venue") or {}).get("fullName")) or None
        broadcast = None
        broadcasts = comp.get("broadcasts") or event.get("competitions", [{}])[0].get("geoBroadcasts") or []
        if broadcasts:
            broadcast = broadcasts[0].get("names", [None])[0] if isinstance(broadcasts[0], dict) else None
            if not broadcast and isinstance(broadcasts[0], dict):
                broadcast = (broadcasts[0].get("media") or {}).get("shortName")
        qbs = {}
        for side, block in (("away", away), ("home", home)):
            for athlete in (block.get("leaders") or []):
                if str(athlete.get("name") or "").lower() in {"passingleader", "passing yards"}:
                    leaders = athlete.get("leaders") or []
                    if leaders:
                        qbs[side] = (leaders[0].get("athlete") or {}).get("shortName")
        games.append({
            "id": str(event.get("id") or f"{away_abbr}@{home_abbr}"),
            "away": away_abbr,
            "home": home_abbr,
            "kickoff_utc": kickoff,
            "venue": venue,
            "broadcast": broadcast,
            "away_starter": qbs.get("away"),
            "home_starter": qbs.get("home"),
            "away_score": away.get("score"),
            "home_score": home.get("score"),
            "game_state": state,
            "freshness": "Current",
        })
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"generated_at_utc": now, "data_through_utc": now, "games": games}


def fetch_nfl_scoreboard() -> dict | None:
    import urllib.request

    url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"  WARNING: NFL scoreboard fetch failed ({exc})")
        return None


def write_if_better(sport: str, producer: dict, dest: Path) -> bool:
    if not producer.get("games"):
        print(f"  skip {sport}: empty producer; keeping {dest}")
        return False
    out = project_slate(sport, producer)
    assert_clean(out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"  wrote {dest} ({len(out['games'])} games)")
    return True


def run(data_dir: Path | None = None) -> int:
    data_dir = Path(data_dir or DATA_DIR)
    ok = False
    mlb = mlb_producer(data_dir)
    ok = write_if_better("mlb", mlb, PUBLIC_DIR / "mlb" / "slate.json") or ok
    espn = fetch_nfl_scoreboard()
    if espn:
        nfl = nfl_producer_from_espn(espn)
        ok = write_if_better("nfl", nfl, PUBLIC_DIR / "nfl" / "slate.json") or ok
    else:
        print("  skip nfl: scoreboard unreachable; keeping existing public slate")
    return 0 if (PUBLIC_DIR / "mlb" / "slate.json").is_file() else 1


if __name__ == "__main__":
    raise SystemExit(run())
