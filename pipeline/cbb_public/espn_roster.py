"""Use season- and team-verified ESPN rosters for missing CBB roster facts."""
from collections import defaultdict
from statistics import mean

import requests

from .possession_data import number, role

ROSTER = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{}/roster"


def fetch_roster(team_id, season):
    response = requests.get(ROSTER.format(team_id), params={"season": season}, timeout=15)
    response.raise_for_status()
    value = response.json()
    if value["season"]["year"] != season or str(value["team"]["id"]) != str(team_id):
        raise ValueError("Unexpected ESPN roster identity")
    return value["athletes"]


def fill_missing_heights(teams, season):
    filled = []
    for team, facts in teams.items():
        summary = facts["size_summary"]
        if summary["whole_team"]["players"]:
            continue
        try:
            roster = fetch_roster(team, season)
        except (requests.RequestException, KeyError, ValueError) as error:
            print(f"  ESPN roster height unavailable for team {team}: {error}")
            continue
        heights = defaultdict(list)
        seen = set()
        for player in roster:
            pid = player.get("id")
            height = number(player.get("height"))
            if not pid or pid in seen or height is None or not 55 <= height <= 100:
                continue
            seen.add(pid)
            position = role((player.get("position") or {}).get("abbreviation")) or "unlisted"
            heights[position].append(height)
        if len(seen) < 5:
            continue
        summary["whole_team"] = {
            "mean_height_inches": mean(h for group in heights.values() for h in group),
            "players": len(seen),
            "source": "ESPN roster",
        }
        facts["position_size"] = [
            {"position": p, "mean_height_inches": mean(heights[p]), "players": len(heights[p])}
            for p in ("G", "F", "C") if heights[p]
        ]
        filled.append(team)
    return filled
