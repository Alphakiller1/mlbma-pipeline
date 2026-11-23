"""Use season- and team-verified ESPN rosters for missing CBB roster facts."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
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
    """Use one verified roster per height table and preserve the larger sample."""
    candidates = [(team, facts) for team, facts in teams.items()
                  if not any(row["position"] == "C" for row in facts["position_size"])]

    def fill(candidate):
        team, facts = candidate
        try:
            roster = fetch_roster(team, season)
        except (requests.RequestException, KeyError, ValueError) as error:
            print(f"  ESPN roster height unavailable for team {team}: {error}")
            return False
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
        summary = facts["size_summary"]
        existing = summary["whole_team"]["players"]
        if len(seen) < max(5, existing) or (existing and not heights.get("C")):
            return False
        summary["whole_team"] = {
            "mean_height_inches": mean(h for group in heights.values() for h in group),
            "players": len(seen),
            "source": "ESPN roster",
        }
        facts["position_size"] = [
            {"position": p, "mean_height_inches": mean(heights[p]), "players": len(heights[p])}
            for p in ("G", "F", "C") if heights[p]
        ]
        return True

    with ThreadPoolExecutor(max_workers=6) as pool:
        return [team for (team, _), filled in zip(candidates, pool.map(fill, candidates)) if filled]
