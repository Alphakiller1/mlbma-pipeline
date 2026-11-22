"""Daily practice participation from the clubs' official weekly report tables."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import urllib.request
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from outputs.nfl_injury_value import name_key

CLUBS = json.loads((Path(__file__).resolve().parents[1] / "functions/_shared/nfl_clubs.json").read_text())
NAMES = {value[0]: code for code, value in CLUBS.items()}
DAYS = {day: i for i, day in enumerate(("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"))}
STATUS = {"FP": "Full", "LP": "Limited", "DNP": "DNP"}
ET = ZoneInfo("America/New_York")


def report_url(team: str, week: int, kind: str = "REG") -> str:
    return CLUBS[team][1] + f"/team/injury-report/week/{kind}-{week}"


def parse(page: str, *, season: int, week: int, kickoff: str, source_url: str,
          kind: str = "REG", checked_at: str | None = None) -> dict[str, dict[str, dict]]:
    soup = BeautifulSoup(page, "html.parser")
    selected = soup.select_one("select option[selected]")
    if not selected or not re.search(rf"/{kind}-{week}$", selected.get("value", ""), re.I):
        raise ValueError("Official club report is for a different week")
    when = datetime.fromisoformat(kickoff.replace("Z", "+00:00")).astimezone(ET)
    checked_at = checked_at or datetime.now(timezone.utc).isoformat()
    reports = {}
    for table in soup.select("table"):
        title = table.find_previous("div", class_="nfl-o-injury-report__title")
        code = NAMES.get(title.get_text(" ", strip=True)) if title else None
        headings = [th.get_text(" ", strip=True) for th in table.select("thead th")]
        if not code or len(headings) < 6 or headings[:3] != ["Player", "Position", "Injury"]:
            continue
        days = headings[3:-1]
        if not days or any(day[:3] not in DAYS for day in days):
            continue
        report = {}
        for tr in table.select("tbody tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.select("td")]
            if len(cells) != len(headings) or not cells[0]:
                continue
            history = []
            for day, text in zip(days, cells[3:-1]):
                day = day[:3]
                gap = (when.weekday() - DAYS[day]) % 7 or 7
                date = (when.date() - timedelta(days=gap)).isoformat()
                status = STATUS.get(text.upper(), "Not listed" if text in {"(-)", "-", "—"} else "Pending")
                history.append({"day": day, "date": date, "status": status})
            known = [item for item in history if item["status"] in {"Full", "Limited", "DNP"}]
            report[name_key(cells[0])] = {
                "season": season, "week": week, "source_url": source_url, "checked_at_utc": checked_at,
                "history": history, "participated": sum(item["status"] in {"Full", "Limited"} for item in known),
                "full": sum(item["status"] == "Full" for item in known),
                "limited": sum(item["status"] == "Limited" for item in known),
                "dnp": sum(item["status"] == "DNP" for item in known), "reported": len(known),
                "last_practice": known[-1]["status"] if known else None,
                "last_practice_date": known[-1]["date"] if known else None}
        if report:
            reports[code] = report
    if not reports:
        raise ValueError("No official club practice tables found")
    return reports


def collect(fixtures: list[dict], season: int, week: int, previous: dict | None = None) -> dict:
    """Keep the last successful same-week club report when a source is down."""
    teams = dict((previous or {}).get("teams", {})) if (previous or {}).get("season") == season and (previous or {}).get("week") == week else {}
    warnings = []

    def get(game):
        errors = []
        for team in (game["home"], game["away"]):
            try:
                url = report_url(team, week)
                request = urllib.request.Request(url, headers={"User-Agent": "ChaseAnalytics/1.0 (+https://chase-analytics.com)"})
                with urllib.request.urlopen(request, timeout=18) as response:
                    page = response.read().decode("utf-8", "replace")
                rows = parse(page, season=season, week=week, kickoff=game["kickoff_utc"], source_url=url)
                expected = {game["away"], game["home"]}
                if not expected.issubset(rows):
                    raise ValueError("Club report does not match this fixture")
                return {code: rows[code] for code in expected}, []
            except Exception as exc:  # noqa: BLE001 - retain evidence on source failure
                errors.append(f"{team} practice report: {exc}")
        return {}, errors

    with ThreadPoolExecutor(max_workers=6) as pool:
        for rows, errors in pool.map(get, fixtures):
            teams.update(rows)
            warnings.extend(errors)
    return {"schema": "chase-public-nfl-practice/1", "sport": "nfl", "season": season, "week": week,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(), "teams": teams, "warnings": warnings}


def post_practice_update(update: dict, report: dict | None, kickoff: str, now: datetime | None = None) -> bool:
    history = (report or {}).get("history") or []
    if not history or not update.get("updated_at_utc"):
        return False
    try:
        final = datetime.fromisoformat(history[-1]["date"] + "T23:59:59").replace(tzinfo=ET)
        updated = datetime.fromisoformat(update["updated_at_utc"].replace("Z", "+00:00"))
        game_time = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
        if updated > min((now or datetime.now(timezone.utc)) + timedelta(minutes=1), game_time + timedelta(minutes=20)):
            return False
        if updated <= final:
            return False
        if re.search(r"injured reserve|^ir$|pup|suspend|physically unable|non.football", update["status"], re.I) and not update.get("announced_out"):
            return False
        return True
    except (ValueError, TypeError, KeyError):
        return False


def enrich(injuries: dict, updates: dict, practice: dict, fixtures: list[dict]) -> None:
    for game in fixtures:
        for team in (game["away"], game["home"]):
            reports = practice.get("teams", {}).get(team, {})
            rows = {name_key(row["name"]): row for row in injuries.get(team, [])}
            for update in updates.get(team, []):
                key = name_key(update["name"])
                if post_practice_update(update, reports.get(key) or next(iter(reports.values()), None), game["kickoff_utc"]):
                    rows[key] = {**rows.get(key, {}), **update}
            for key, row in rows.items():
                if key in reports:
                    row["practice_report"] = reports[key]
                    if not row.get("practice"):
                        row["practice"] = reports[key]["last_practice"]
                elif reports:
                    source = next(iter(reports.values()))
                    row["practice_report"] = {"listed": False, "season": source["season"], "week": source["week"],
                        "source_url": source["source_url"], "checked_at_utc": source["checked_at_utc"], "history": []}
            injuries[team] = list(rows.values())
