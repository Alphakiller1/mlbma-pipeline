"""Pull active and IL rosters for all 30 MLB teams via Stats API."""

from __future__ import annotations

import time
from typing import Dict, List

import pandas as pd
import requests

from core.config import (
    CURRENT_SEASON,
    DATA_DIR,
    SHEET_ID,
    SHEET_TABS,
    TEAM_MAP,
    TEAM_MAP_BY_ID,
    check_google_credentials,
)

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
MLB_TEAMS_URL = "https://statsapi.mlb.com/api/v1/teams"
MLB_ROSTER_URL = "https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"

REGISTRY_COLUMNS = [
    "player_id",
    "full_name",
    "team",
    "team_abbr",
    "position",
    "position_type",
    "bats",
    "throws",
    "jersey_number",
    "status",
]

FIELD_POSITION_TYPES = {
    "C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH", "IF", "UT",
}


def fetch_team_ids(season: int) -> Dict[int, str]:
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
    return mapping


def classify_position_type(abbr: str, type_name: str) -> str:
    ab = (abbr or "").upper()
    tn = (type_name or "").lower()
    if ab == "SP" or "starting" in tn:
        return "SP"
    if ab == "RP" or "relief" in tn:
        return "RP"
    if ab == "P" or "pitcher" in tn:
        return "SP" if "starting" in tn else "RP"
    if ab in FIELD_POSITION_TYPES:
        return "OF" if ab in ("LF", "CF", "RF") else ab
    if "outfield" in tn:
        return "OF"
    if "catcher" in tn:
        return "C"
    if "infield" in tn:
        return "IF"
    if "designated" in tn:
        return "DH"
    return ab or "UT"


def parse_roster_entries(team_name: str, team_abbr: str, roster: list, status: str) -> List[dict]:
    rows = []
    for entry in roster:
        person = entry.get("person", {}) or {}
        pid = person.get("id")
        if not pid:
            continue
        pos = entry.get("position", {}) or {}
        abbr = pos.get("abbreviation", "") or ""
        type_name = pos.get("type", "") or pos.get("name", "") or ""
        pos_type = classify_position_type(abbr, type_name)

        bat_side = person.get("batSide", {}) or {}
        pitch_hand = person.get("pitchHand", {}) or {}
        bats = (bat_side.get("code") or "R").upper()[:1]
        if bats not in ("L", "R", "S"):
            bats = "R"
        throws = (pitch_hand.get("code") or "R").upper()[:1]
        if throws not in ("L", "R"):
            throws = "R"

        rows.append(
            {
                "player_id": int(pid),
                "full_name": person.get("fullName", "").strip(),
                "team": team_name,
                "team_abbr": team_abbr,
                "position": abbr or pos_type,
                "position_type": pos_type,
                "bats": bats,
                "throws": throws,
                "jersey_number": entry.get("jerseyNumber", ""),
                "status": status,
            }
        )
    return rows


def fetch_team_roster(team_id: int, season: int, roster_type: str) -> list:
    r = requests.get(
        MLB_ROSTER_URL.format(team_id=team_id),
        params={"rosterType": roster_type, "season": str(season)},
        headers=HEADERS,
        timeout=30,
    )
    if r.status_code != 200:
        return []
    return r.json().get("roster", [])


def build_registry(season: int) -> pd.DataFrame:
    team_ids = fetch_team_ids(season)
    print(f"  Fetching rosters for {len(team_ids)} teams...")

    id_to_name = {abbr: name for name, abbr in TEAM_MAP.items()}
    all_rows: List[dict] = []
    seen_ids: set[int] = set()

    for team_id, abbr in sorted(team_ids.items(), key=lambda x: x[1]):
        team_name = id_to_name.get(abbr, abbr)
        for roster_type, status in (("active", "active"), ("injured", "IL")):
            roster = fetch_team_roster(team_id, season, roster_type)
            for row in parse_roster_entries(team_name, abbr, roster, status):
                if row["player_id"] in seen_ids:
                    continue
                seen_ids.add(row["player_id"])
                all_rows.append(row)
            time.sleep(0.08)

    df = pd.DataFrame(all_rows)
    if df.empty:
        return pd.DataFrame(columns=REGISTRY_COLUMNS)
    return df[REGISTRY_COLUMNS].sort_values(["team_abbr", "position_type", "full_name"])


def push_to_sheets(df: pd.DataFrame) -> None:
    if df.empty:
        print("  No registry data to push")
        return
    if not check_google_credentials():
        print("  Skipping Player_Registry Google Sheets push (credentials unavailable).")
        return

    from outputs.push_sheets import get_client, push_df

    tab = SHEET_TABS["player_registry"]
    print(f"Pushing {tab} to Google Sheets...")
    try:
        client = get_client()
        sheet = client.open_by_key(SHEET_ID)
        push_df(sheet, tab, df)
    except Exception as exc:
        print(f"  WARNING: Player_Registry push failed ({exc})")


def run():
    print(f"Building player registry for {CURRENT_SEASON}...")
    df = build_registry(CURRENT_SEASON)
    out = DATA_DIR / "player_registry.csv"
    df.to_csv(out, index=False)
    print(f"  Saved {len(df)} players -> {out}")
    print(f"  Batters (non SP/RP): {len(df[~df['position_type'].isin(['SP', 'RP'])])}")
    push_to_sheets(df)
    print("Player registry complete.")


if __name__ == "__main__":
    run()
