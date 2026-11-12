"""Publish roster-matched designations from independent public CBB injury reports."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
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
COVERS_SCHEDULE = "https://www.covers.com/sports/ncaab/matchups"
COVERS_GAME = "https://www.covers.com/sport/basketball/ncaab/matchup/"
COVERS_FIXTURE_ALIASES = {
    "appalachianstatemountaineers": "appstatemountaineers",
    "bethesdalionangels": "bethesdaflames",
    "covenantscots": "covenantfightingscots",
    "gramblingstatetigers": "gramblingtigers",
    "liusharks": "longislanduniversitysharks",
    "louisianamonroewarhawks": "ulmonroewarhawks",
    "miamiflhurricanes": "miamihurricanes",
    "pennquakers": "pennsylvaniaquakers",
    "simpsonstorm": "simpsoniastorm",
    "southernuniversityatneworleansknights": "southernneworleansknights",
    "uscupstatespartans": "southcarolinaupstatespartans",
    "washingtoncollegemdshoremen": "washingtonmarylandshoremen",
}
STATUSES = {s.lower(): s for s in ("Out", "Doubtful", "Questionable", "Probable", "Game Time Decision",
                                    "Available", "Out for season", "Out indefinitely", "Suspended")}


def key(name):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", unescape(name)).lower())


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
    script = soup.find("script", id="__NEXT_DATA__")
    if not script or not script.string:
        raise ValueError("Action Network injury payload missing from the public page")
    data = json.loads(script.string)
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


def covers_fixture(url, fixtures, now):
    soup = BeautifulSoup(get(url).content, "html.parser")
    event = None
    for tag in soup.select('script[type="application/ld+json"]'):
        try:
            row, _ = json.JSONDecoder().raw_decode((tag.string or "").lstrip())
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("@type") == "SportsEvent":
            event = row
            break
    if not event:
        return None
    kickoff = datetime.strptime(unescape(event["startDate"]), "%m/%d/%Y %H:%M:%S %z")
    if kickoff.astimezone(ET).date() != now.date():
        return None
    away, home = (key(event[side + "Team"]["name"]) for side in ("away", "home"))
    away, home = (COVERS_FIXTURE_ALIASES.get(name, name) for name in (away, home))
    matched = [game for game, a, h in fixtures if away in a and home in h]
    if len(matched) != 1:
        return None

    check = {"game_id": str(matched[0]["id"]), "source": "Covers",
             "source_url": url + "#injuries"}
    entries = []
    for side in ("away", "home"):
        sections = soup.select(f"section.{side}-team-section")
        section = next((s for s in sections if s.find(["h2", "h3", "h4"])
                        and s.find(["h2", "h3", "h4"]).get_text(" ", strip=True).endswith("Injuries")), None)
        if not section:
            continue
        rows = section.select("tbody tr")
        if len(rows) == 1 and rows[0].get_text(" ", strip=True) == "No injuries to report.":
            check[side + "_listings"] = 0
            continue
        parsed = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) != 5:
                continue
            link = cells[0].find("a", href=True)
            # The status cell repeats the date for phones; the note sits in a
            # collapsed row the expand button points at.
            for repeat in cells[2].select(".mobile-date"):
                repeat.decompose()
            status, _, reason = cells[2].get_text(" ", strip=True).partition(" - ")
            status = STATUSES.get(status.lower().strip())
            if not link or not status:
                continue
            updated = None
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%b %d, %Y", "%b %d, '%y"):
                try:
                    updated = datetime.strptime(cells[3].get_text(" ", strip=True), fmt).replace(tzinfo=ET)
                    break
                except ValueError:
                    continue
            if updated and not now - timedelta(days=14) <= updated <= now + timedelta(hours=2):
                continue
            button = cells[4].find(attrs={"aria-controls": True})
            target = section.find(id=button["aria-controls"]) if button else None
            note = target.get_text(" ", strip=True) if target else cells[4].get_text(" ", strip=True)
            if note.lower() in {"expand", "collapse"}:
                note = ""
            entries.append((str(matched[0][side]), {
                "player": link["href"].rstrip("/").rsplit("/", 1)[-1],
                "status": status, "injury": reason or None,
                "detail": " ".join(note.split()[:20]) if note else None,
                "updated": updated.astimezone(timezone.utc).isoformat() if updated else None,
                "source": "Covers", "source_url": check["source_url"],
            }))
            parsed += 1
        if parsed:
            check[side + "_listings"] = parsed
    return (check, entries) if "away_listings" in check or "home_listings" in check else None


def covers_fixtures(teams, slate, now):
    day = now.date().isoformat()

    def names(game, side):
        identity = teams.get(str(game[side]), {}).get("identity", {})
        return {key(value) for value in (game.get(side + "_name"), identity.get("name"),
                                        identity.get("short_name"), identity.get("abbr")) if value}

    fixtures = [(g, names(g, "away"), names(g, "home")) for g in slate["games"] if g["slate_date"] == day]
    if not fixtures:
        return []
    soup = BeautifulSoup(get(COVERS_SCHEDULE).content, "html.parser")
    links = {COVERS_GAME + match.group(1) for tag in soup.select("a[href]")
             if (match := re.fullmatch(r"(?:https://www\.covers\.com)?/sport/basketball/ncaab/matchup/(\d+)", tag["href"]))}

    def fetch(url):
        try:
            return covers_fixture(url, fixtures, now)
        except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError) as error:
            print(f"::warning::Covers matchup availability skipped for {url}: {error}")
            return None

    with ThreadPoolExecutor(max_workers=5) as pool:
        return [report for report in pool.map(fetch, sorted(links)[:100]) if report]


def publish_report(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(path)


def carry_unavailable_reports(reports, prior, received, teams, season, day):
    """Retain same-day verified players from unavailable feeds until a fresh report wins."""
    if prior.get("season") != season or prior.get("slate_date") != day:
        return 0
    before = len(reports)
    for row in prior.get("reports", []):
        club, player = row.get("team_id"), row.get("player_id")
        if club in teams and player and row.get("source") not in received:
            reports.setdefault((club, player), row)
    return len(reports) - before


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
    day = now.date().isoformat()
    archive = ROOT / "availability" / f"{day}.json"
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
    checks, prior = {}, {}
    if archive.is_file():
        prior = json.loads(archive.read_text(encoding="utf-8"))
        if prior.get("season") == season and prior.get("slate_date") == day:
            checks.update((row["game_id"], row) for row in prior.get("game_checks", []))
    try:
        slate = json.loads((ROOT / "slate.json").read_text(encoding="utf-8"))
        for check, rows in covers_fixtures(teams, slate, now):
            checks[check["game_id"]] = {**check, "retrieved_at_utc": retrieved}
            for team_id, row in rows:
                if team_id in teams:
                    candidates[team_id].append({**row, "retrieved_at_utc": retrieved})
    except (requests.RequestException, ValueError, TypeError, KeyError) as error:
        print(f"::warning::Covers fixture availability skipped: {error}")
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
                                               "player_id": pid,
                                               "position": (player.get("position") or {}).get("abbreviation")}))
        return result

    reports = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for group in pool.map(match_team, candidates.items()):
            for player_id, row in group:
                previous = reports.get(player_id)
                if not previous or (row["updated"] or "") >= (previous["updated"] or ""):
                    row.pop("team", None)
                    reports[player_id] = row
    carried = carry_unavailable_reports(reports, prior, received, teams, season, day)
    if carried:
        print(f"Retained {carried} previously verified same-day designations from unavailable feeds.")
    if any(received.values()) and not reports:
        raise ValueError("No public designations matched a current roster")
    payload = {"schema": "chase-cbb-availability/1", "sport": "cbb", "season": season, "slate_date": day,
               "sources": sorted(set(received) | ({"Covers"} if checks else set())), "retrieved_at_utc": retrieved,
               "reports": [reports[k] for k in sorted(reports)], "game_checks": [checks[k] for k in sorted(checks)]}
    publish_report(archive, payload)
    publish_report(ROOT / "availability.json", payload)
    print(f"Matched {len(reports)} CBB designations for {len({k[0] for k in reports})} schools from {received}.")
    print(f"Verified {len(checks)} same-day Covers fixture injury reports.")


if __name__ == "__main__":
    main()
