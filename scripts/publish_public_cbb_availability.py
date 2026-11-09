"""Publish roster-matched designations from independent public CBB injury reports."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import sys
import unicodedata
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
import requests

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))
from pipeline.cbb_public.espn_roster import fetch_roster  # noqa: E402

ROOT = PROJECT / "data/public/cbb"
ET = ZoneInfo("America/New_York")
ROTOWIRE = "https://www.rotowire.com/cbasketball/injury-report.php"
ACTION = "https://www.actionnetwork.com/ncaab/injury-report"
COVERS = "https://www.covers.com/sport/basketball/ncaab/injuries"
STATUSES = {s.lower(): s for s in ("Out", "Doubtful", "Questionable", "Probable", "Game Time Decision",
                                    "Available", "Out for season", "Out indefinitely", "Suspended")}


def key(name):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", name).lower())


def get(url):
    response = requests.get(url, timeout=15)
    response.raise_for_status()
    return response


def rotowire(_now):
    raw = get("https://www.rotowire.com/cbasketball/tables/injury-report.php?team=ALL&pos=ALL").json()
    if not isinstance(raw, list):
        raise ValueError("Unexpected RotoWire injury report")
    return [{"team": row["team"], "player": row["player"], "injury": row.get("injury"),
             "status": row["status"], "updated": None} for row in raw]


def action(_now):
    soup = BeautifulSoup(get(ACTION).content, "html.parser")
    data = json.loads(soup.find("script", id="__NEXT_DATA__").string)
    rows = data["props"]["pageProps"]["injuries"]
    if not isinstance(rows, list):
        raise ValueError("Unexpected Action Network injury report")
    result = []
    for row in rows:
        reason = re.search(r"\bwith ([\w /-]{2,45})$", row.get("comment") or "")
        result.append({"team": row["team"]["full_name"], "player": row["player"]["full_name"],
                       "injury": reason[1].capitalize() if reason else None, "status": row["status"],
                       "updated": row["updated_at"]})
    return result


def covers(now):
    soup = BeautifulSoup(get(COVERS).content, "html.parser")
    blocks = soup.select(".covers-CoversSeasonInjuries-blockContainer")
    if not blocks:
        raise ValueError("Covers injury report layout changed")
    result = []
    for block in blocks:
        heading = block.select_one("table tr")
        if not heading or len(heading.find_all("td")) < 2:
            continue
        team = heading.find_all("td")[1].get_text(" ", strip=True)
        for row in block.select("tr:has(a.player-link)"):
            cells = row.find_all("td")
            link, designation = cells[0].select_one("a.player-link"), cells[2].find("b")
            if not designation:
                continue
            status, _, reason = designation.get_text(" ", strip=True).partition(" - ")
            stamp = re.search(r"\b([A-Za-z]{3}),\s+([A-Za-z]{3})\s+(\d{1,2})\b", cells[2].get_text(" ", strip=True))
            if not stamp:
                continue
            day = datetime.strptime(f"{stamp[2]} {stamp[3]} {now.year}", "%b %d %Y").replace(tzinfo=ET)
            if day.date() > now.date():
                day = day.replace(year=now.year - 1)
            if day.strftime("%a") != stamp[1]:
                continue
            result.append({"team": team, "player": link["href"].rstrip("/").rsplit("/", 1)[-1],
                           "injury": reason or None, "status": status, "updated": day.isoformat()})
    return result


def main():
    season = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["season"]
    teams = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))["teams"]
    aliases = defaultdict(set)
    for team_id, team in teams.items():
        identity = team["identity"]
        for name in (identity["abbr"], identity["name"], identity["short_name"]):
            aliases[key(name)].add(team_id)
    aliases["wichitastate"].update(aliases["wichitast"])

    now = datetime.now(ET)
    retrieved = now.astimezone(timezone.utc).isoformat()
    sources = (("RotoWire", ROTOWIRE, rotowire), ("Covers", COVERS, covers),
               ("Action Network", ACTION, action))
    candidates = defaultdict(list)
    received = {}
    for name, url, collect in sources:
        try:
            rows = collect(now)
        except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError, IndexError) as error:
            print(f"::warning::{name} availability skipped: {error}")
            continue
        received[name] = len(rows)
        for row in rows:
            status = STATUSES.get(str(row["status"]).lower().strip())
            clubs = aliases.get(key(row["team"]), set())
            if not status or len(clubs) != 1:
                continue
            try:
                stamp = datetime.fromisoformat(row["updated"].replace("Z", "+00:00")) if row["updated"] else None
            except ValueError:
                continue
            if stamp and (stamp.tzinfo is None or not now - timedelta(days=14) <= stamp <= now + timedelta(hours=2)):
                continue
            row.update(source=name, source_url=url, status=status, retrieved_at_utc=retrieved,
                       updated=stamp.astimezone(timezone.utc).isoformat() if stamp else None)
            candidates[next(iter(clubs))].append(row)
    if not received:
        raise ValueError("All public injury reports failed")

    def match_team(item):
        team_id, rows = item
        try:
            roster = fetch_roster(team_id, season)
        except (requests.RequestException, ValueError, KeyError) as error:
            print(f"::warning::ESPN roster {team_id} unavailable: {error}")
            return []
        by_name = defaultdict(dict)
        for player in roster:
            for name in {player["displayName"], player.get("fullName") or player["displayName"]}:
                by_name[key(name)][str(player["id"])] = player
        result = []
        for row in rows:
            matching = by_name.get(key(row["player"]), {})
            if len(matching) == 1:
                pid, player = next(iter(matching.items()))
                result.append(((team_id, pid), {**row, "player": player["displayName"], "team_id": team_id,
                                               "position": (player.get("position") or {}).get("abbreviation")}))
        return result

    reports = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for group in pool.map(match_team, candidates.items()):
            for player_id, row in group:
                previous = reports.get(player_id)
                if not previous or (row["updated"] or "") >= (previous["updated"] or ""):
                    row.pop("team")
                    reports[player_id] = row
    if any(received.values()) and not reports:
        raise ValueError("No public designations matched a current roster")
    payload = {"schema": "chase-cbb-availability/1", "sport": "cbb", "season": season,
               "sources": sorted(received), "retrieved_at_utc": retrieved,
               "reports": [reports[k] for k in sorted(reports)]}
    target = ROOT / "availability.json"
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(target)
    print(f"Matched {len(reports)} CBB designations for {len({k[0] for k in reports})} schools from {received}.")


if __name__ == "__main__":
    main()
