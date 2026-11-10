"""Current-season coverage and personnel from Sharp Football Analysis.

The nflverse participation file (coverage, man/zone, personnel) is only
released after a season. Sharp Football Analysis charts these live and has
given Chase Analytics permission to use them (owner confirmation, 2026-09-27).
Three published sources:

- the Coverage Schemes table: each defense's man, zone, middle-closed and
  middle-open rates;
- the matchup data: EPA per dropback against man and against zone for every
  offense and defense, and the man rate each offense has faced;
- play-level personnel: every offensive snap's personnel grouping, joined to
  the week's opponent for the groupings each defense has faced.

Everything fails soft. A missing source leaves those fields out, and the page
then shows only what the other sources publish.
"""
from __future__ import annotations

import html
import json
import math
import re
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone

COVERAGE_URL = "https://www.sharpfootballanalysis.com/stats-nfl/nfl-coverage-schemes/"
DATA_URL = "https://rmsummerlin.github.io/SFAStatsPages/data/{name}_{season}.json"
USER_AGENT = "Mozilla/5.0 (compatible; ChaseAnalytics/1.0; +https://chase-analytics.com)"
# Every charted dropback counts: the page grades early-season figures (owner
# rule) and prints the dropbacks beside them.
MIN_EPA_DROPBACKS = 1
PERSONNEL_GROUPS = ("11", "12", "13", "21", "22")
_TEAM = {"LA": "LAR", "JAC": "JAX", "OAK": "LV", "SD": "LAC", "STL": "LAR"}


def _code(value: object) -> str:
    key = str(value or "").upper()
    return _TEAM.get(key, key)


def _get(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read()
    except Exception as exc:  # network, 404, TLS
        print(f"  WARNING: Sharp data unavailable ({url.rsplit('/', 2)[-2:]}: {exc})")
        return None


def _json(name: str, season: int) -> dict | None:
    raw = _get(DATA_URL.format(name=name, season=season))
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    return data if int(data.get("season") or 0) == season else None


def coverage_table(names: dict[str, str], season: int) -> tuple[dict[str, dict[str, float]], str | None]:
    """The published middle-of-field rates and their own report date."""
    raw = _get(COVERAGE_URL)
    if not raw:
        return {}, None
    page = raw.decode("utf-8", errors="ignore")
    date = re.search(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})T', page)
    if not date or int(date[1][:4]) not in (season, season + 1):
        return {}, None
    start = page.find('id="table_1"')
    if start < 0:
        return {}, None
    body = page[start:page.find("</table>", start)]
    heads = [html.unescape(re.sub(r"<[^>]+>", "", h)).strip().lower()
             for h in re.findall(r"<th[^>]*>(.*?)</th>", body, re.S)]
    wanted = {"middle closed rate": "single_high_rate", "middle open rate": "two_high_rate"}
    if heads[:1] != ["team"] or not all(h in heads for h in wanted):
        print("  WARNING: Sharp coverage table changed shape; skipped")
        return {}, None
    code_of = {full.lower(): code for code, full in names.items()}
    out: dict[str, dict[str, float]] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) != len(heads):
            continue
        code = code_of.get(cells[0].lower())
        if not code:
            continue
        rates = {}
        for head, key in wanted.items():
            try:
                value = float(cells[heads.index(head)]) / 100
            except ValueError:
                continue
            if 0 <= value <= 1:
                rates[key] = round(value, 4)
        if len(rates) == len(wanted):
            out[_code(code)] = rates
    return (out, date[1]) if len(out) == 32 else ({}, None)


TENDENCIES_URL = "https://www.sharpfootballanalysis.com/stats-nfl/nfl-defensive-tendencies/"


def sub_package_table(names: dict[str, str]) -> dict[str, float]:
    """Each defense's sub-package (nickel and dime) rate, 0-1."""
    raw = _get(TENDENCIES_URL)
    if not raw:
        return {}
    page = raw.decode("utf-8", errors="ignore")
    start = page.find('id="table_1"')
    if start < 0:
        return {}
    body = page[start:page.find("</table>", start)]
    heads = [html.unescape(re.sub(r"<[^>]+>", "", h)).strip().lower()
             for h in re.findall(r"<th[^>]*>(.*?)</th>", body, re.S)]
    if heads[:1] != ["team"] or "sub package rate" not in heads:
        print("  WARNING: Sharp defensive tendencies table changed shape; skipped")
        return {}
    col = heads.index("sub package rate")
    code_of = {full.lower(): code for code, full in names.items()}
    out: dict[str, float] = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) != len(heads) or not code_of.get(cells[0].lower()):
            continue
        try:
            value = float(cells[col]) / 100
        except ValueError:
            continue
        if 0 <= value <= 1:
            out[_code(code_of[cells[0].lower()])] = round(value, 4)
    return out if len(out) >= 30 else {}


def _unit_values(unit: dict) -> tuple[dict, dict, dict]:
    """Coverage frequencies, EPA and the corresponding dropback samples."""
    metrics = (unit or {}).get("m") or {}
    coverage, response, samples = {}, {}, {}

    def current(key):
        entry = metrics.get(key)
        # [shrunk, current season, sample, league place, prior season]
        if not isinstance(entry, list) or len(entry) < 3 or entry[1] is None:
            return None, 0
        try:
            value, sample = float(entry[1]), int(entry[2] or 0)
        except (ValueError, TypeError, OverflowError):
            return None, 0
        return (value, sample) if math.isfinite(value) and sample > 0 else (None, 0)

    man, n = current("man")
    if man is not None and 0 <= man <= 1:
        coverage["man_rate"] = round(man, 4)
        # The man rate's sample is every charted coverage snap; the zone EPA's
        # sample is the zone snaps among them, so their ratio is the zone rate.
        _, zone_n = current("zone_epa")
        if 0 < zone_n <= n:
            coverage["zone_rate"] = round(zone_n / n, 4)
    for key in ("man_epa", "zone_epa"):
        value, n = current(key)
        if value is not None and n >= MIN_EPA_DROPBACKS:
            field = "pass_epa_" + key[:-4]
            response[field] = round(value, 4)
            samples[field] = n
    return coverage, response, samples


def _personnel(season: int, schedule: list[dict]) -> tuple[dict, int | None]:
    """Personnel usage and EPA on the same charted plays, on both sides."""
    data = _json("personnel_grouping", season)
    if not data:
        return {}, None
    try:
        alphabet = data["alphabet"]
        index = {ch: i for i, ch in enumerate(alphabet)}
        columns = [[index[ch] for ch in data["cols"][key]] for key in ("t", "w", "p", "eh", "el")]
        teams = [_code(t) for t in data["teams"]]
        groups = [f"{value // 100}{(value // 10) % 10}" for value in data["pers"]]
        offset, scale = int(data["epa_offset"]), int(data["epa_scale"])
    except (KeyError, TypeError, ValueError):
        return {}, None
    if (len(set(teams)) != 32 or scale <= 0 or
            not all(len(column) == data.get("plays") and column for column in columns)):
        return {}, None
    opponent = {}
    for game in schedule:
        away, home, week = _code(game.get("away")), _code(game.get("home")), game.get("w")
        opponent[(away, week)] = home
        opponent[(home, week)] = away
    count = {phase: defaultdict(Counter) for phase in ("offense", "defense")}
    points = {phase: defaultdict(Counter) for phase in count}
    for t, w, p, hi, lo in zip(*columns):
        if t >= len(teams) or p >= len(groups):
            return {}, None
        team, group = teams[t], groups[p]
        opp = opponent.get((team, w))
        if opp not in teams:
            return {}, None
        epa = (hi * len(alphabet) + lo - offset) / scale
        for phase, club in (("offense", team), ("defense", opp)):
            count[phase][club][group] += 1
            points[phase][club][group] += epa

    result = {}
    for phase, clubs in count.items():
        result[phase] = {}
        for club, counts in clubs.items():
            total = sum(counts.values())
            result[phase][club] = {
                "personnel": {f"personnel_{g}_rate": round(counts[g] / total, 4) for g in PERSONNEL_GROUPS},
                "response": {f"epa_personnel_{g}": round(points[phase][club][g] / counts[g], 4)
                             for g in PERSONNEL_GROUPS if counts[g]},
                "response_samples": {f"epa_personnel_{g}": counts[g] for g in PERSONNEL_GROUPS if counts[g]},
            }
    return result, max(columns[1])


def offense_coverage(season: int) -> dict[str, dict[str, dict]]:
    """Each offense's dropbacks and EPA per dropback against man and against zone.

    Sharp publishes these per offense, not per passer; the caller credits them
    to a quarterback only when he has taken nearly all of his club's dropbacks.
    """
    matchup = _json("matchup", season)
    out: dict[str, dict[str, dict]] = {}
    for code, unit in (((matchup or {}).get("latest") or {}).get("units") or {}).items():
        metrics = ((unit or {}).get("off") or {}).get("m") or {}
        looks = {}
        for look in ("man", "zone"):
            entry = metrics.get(look + "_epa")
            # [shrunk, current season, sample, league place, prior season]
            if isinstance(entry, list) and len(entry) >= 3 and entry[1] is not None and entry[2]:
                looks[look] = {"dropbacks": int(entry[2]), "epa_per_dropback": round(float(entry[1]), 4)}
                if len(entry) >= 4 and entry[3]:
                    looks[look]["offense_place"] = int(entry[3])
        if looks:
            out[_code(code)] = looks
    if out:
        out["_through_week"] = (matchup or {}).get("latest_played_week")
    return out


def current_season(season: int) -> dict[str, dict]:
    """{team: {offense: {coverage, response, personnel}, defense: {...}}}."""
    matchup = _json("matchup", season)
    if not matchup:
        return {}
    names = {code: full for code, full in (matchup.get("names") or {}).items()}
    units = (matchup.get("latest") or {}).get("units") or {}
    through_week = matchup.get("latest_played_week")
    if len(units) != 32 or not isinstance(through_week, int) or not 1 <= through_week <= 18:
        return {}
    try:
        published = datetime.fromisoformat(matchup["generated_utc"])
    except (KeyError, TypeError, ValueError):
        return {}
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    out: dict[str, dict] = defaultdict(lambda: {"offense": {}, "defense": {}})
    for code, unit in units.items():
        for phase, side in (("offense", "off"), ("defense", "def")):
            coverage, response, samples = _unit_values(unit.get(side))
            if coverage:
                out[_code(code)][phase]["coverage"] = coverage
            if response:
                out[_code(code)][phase]["response"] = response
                out[_code(code)][phase]["response_samples"] = samples
    # The site's separate middle-of-field table can lag the matchup export.
    # Keep its dates separate and preserve the matchup export's man/zone denominator.
    middle, middle_date = coverage_table(names, season)
    for code, rates in middle.items():
        out[code]["defense"].setdefault("coverage", {}).update(rates)
    for code, rate in sub_package_table(names).items():
        out[code]["defense"]["package"] = {"sub_package_rate": rate}
    personnel, personnel_week = _personnel(season, matchup.get("schedule") or [])
    for phase, by_team in personnel.items():
        for code, groups in by_team.items():
            for group, values in groups.items():
                out[code][phase].setdefault(group, {}).update(values)
    result = {team: dict(value) for team, value in out.items()}
    if result:
        result["_source"] = {
            "source": "Sharp Football Analysis",
            "through_week": through_week,
            "published_at_utc": published.astimezone(timezone.utc).isoformat(),
            "middle_report_date": middle_date,
            "personnel_through_week": personnel_week,
        }
    return result
