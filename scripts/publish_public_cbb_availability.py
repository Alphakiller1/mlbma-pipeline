"""Publish only public CBB injury designations matched to current ESPN rosters."""
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

import requests

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
from pipeline.cbb_public.espn_roster import fetch_roster  # noqa: E402

ROOT = PROJECT / "data/public/cbb"
SOURCE = "https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL"
STATUSES = {"Out", "Doubtful", "Questionable", "Probable", "Game Time Decision", "Available"}


def key(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def main():
    season = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["season"]
    teams = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))["teams"]
    aliases = defaultdict(set)
    for team_id, team in teams.items():
        identity = team["identity"]
        for name in (identity["abbr"], identity["name"], identity["short_name"]):
            aliases[key(name)].add(team_id)
    aliases["wichitastate"].update(aliases["wichitast"])

    response = requests.get(SOURCE, timeout=15)
    response.raise_for_status()
    raw = response.json()
    if not isinstance(raw, list):
        raise ValueError("Unexpected public CBB injury report")
    rosters = {}
    reports = {}
    for row in raw:
        candidates = aliases.get(key(row["team"]), set())
        if row["status"] not in STATUSES or len(candidates) != 1:
            continue
        team_id = next(iter(candidates))
        if team_id not in rosters:
            rosters[team_id] = {key(p["displayName"]): p for p in fetch_roster(team_id, season)}
        person = rosters[team_id].get(key(row["player"]))
        if person:
            reports[(team_id, person["id"])] = {
                "team_id": team_id,
                "player": person["displayName"],
                "position": (person.get("position") or {}).get("abbreviation"),
                "injury": row.get("injury") or None,
                "status": row["status"],
            }
    if raw and not reports:
        raise ValueError("No public designations matched a current roster")
    snapshot = {
        "schema": "chase-cbb-availability/1",
        "sport": "cbb",
        "season": season,
        "source": "RotoWire public CBB injury report",
        "source_url": "https://www.rotowire.com/cbasketball/injury-report.php",
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "reports": [reports[k] for k in sorted(reports)],
    }
    target = ROOT / "availability.json"
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(target)
    print(f"Published {len(reports)} roster-verified CBB designations ({len(raw)} source rows).")


if __name__ == "__main__":
    main()
