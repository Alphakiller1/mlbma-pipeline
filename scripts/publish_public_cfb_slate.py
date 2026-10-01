#!/usr/bin/env python3
"""Build the public CFB research slate with observed team rates.

Identity comes from the CFB model board (names, logos, kickoff). Season-to-date
rates come from ESPN's published team statistics and are ranked against that
same FBS pool. Nothing here is a projection or a priced edge.
"""
from __future__ import annotations

import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "public" / "cfb" / "slate.json"
# Share of games that must carry both schools' unit profiles before the slate
# is written; below it the pull is treated as broken, not as a quiet week.
MIN_FORM_SHARE = 0.6
BOARD_URL = "https://alphakiller1.github.io/cfb-model/board.json"
STATS_URL = (
    "https://site.web.api.espn.com/apis/common/v3/sports/football/"
    "college-football/statistics/byteam?region=us&lang=en&contentorigin=espn&limit=300"
)
SCOREBOARD_URL = "https://cdn.espn.com/core/college-football/scoreboard?xhr=1&limit=300"
SP_PLUS_URL = "https://cfbupdate.com/sp-ratings"
SCHEME_WEEK_URL = (
    "https://deepmetricanalytics.com/college-football/{season}/scheme-matchups/week-{week}"
)
SCHEME_ORIGIN = "https://deepmetricanalytics.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.espn.com/college-football/scoreboard",
}

# Keys name what they hold. They once reused the CFB model's efficiency names
# (off_ppa held points per game, off_successRate third-down rate,
# off_explosiveness yards per pass, off_stuffRate yards per rush), so merging
# the model's slate would have printed PPA under "Points/G" and a stuff rate,
# where lower is better, under "Yds/Rush".
FORM_SPEC = (
    ("off_ppg", "own", "passing", "totalPointsPerGame",
     "Points per game", "high", "num"),
    ("def_ppg", "opp", "passing", "totalPointsPerGame",
     "Points allowed per game", "low", "num"),
    ("off_ypg", "own", "passing", "yardsPerGame",
     "Yards per game", "high", "num"),
    ("def_ypg", "opp", "passing", "yardsPerGame",
     "Yards allowed per game", "low", "num"),
    ("off_third_down", "own", "miscellaneous", "thirdDownConvPct",
     "Offense third-down rate", "high", "pct"),
    ("def_third_down", "opp", "miscellaneous", "thirdDownConvPct",
     "Third-down rate allowed", "low", "pct"),
    ("off_fourth", "own", "miscellaneous", "fourthDownConvPct",
     "Fourth-down rate", "high", "pct"),
    ("def_fourth", "opp", "miscellaneous", "fourthDownConvPct",
     "Fourth-down rate allowed", "low", "pct"),
    ("off_first_downs", "own", "miscellaneous", "firstDowns",
     "First downs per game", "high", "pg"),
    ("def_first_downs", "opp", "miscellaneous", "firstDowns",
     "First downs allowed per game", "low", "pg"),
    ("off_ypa", "own", "passing", "yardsPerPassAttempt",
     "Yards per pass attempt", "high", "num"),
    ("def_ypa", "opp", "passing", "yardsPerPassAttempt",
     "Yards per pass allowed", "low", "num"),
    ("off_pass_ypg", "own", "passing", "passingYardsPerGame",
     "Passing yards per game", "high", "num"),
    ("def_pass_ypg", "opp", "passing", "passingYardsPerGame",
     "Passing yards allowed per game", "low", "num"),
    ("off_comp", "own", "passing", "completionPct",
     "Completion rate", "high", "pct"),
    ("def_comp", "opp", "passing", "completionPct",
     "Completion rate allowed", "low", "pct"),
    ("off_qbr", "own", "passing", "QBRating",
     "Passer rating", "high", "num"),
    ("def_qbr", "opp", "passing", "QBRating",
     "Passer rating allowed", "low", "num"),
    ("off_pass_td", "own", "passing", "passingTouchdowns",
     "Passing TDs per game", "high", "pg"),
    ("def_pass_td", "opp", "passing", "passingTouchdowns",
     "Passing TDs allowed per game", "low", "pg"),
    ("off_int", "own", "passing", "interceptions",
     "INTs thrown per game", "low", "pg"),
    ("def_int", "opp", "passing", "interceptions",
     "INTs forced per game", "high", "pg"),
    ("off_sacks", "own", "passing", "sacks",
     "Sacks taken per game", "low", "pg"),
    ("def_sacks", "opp", "passing", "sacks",
     "Sacks per game", "high", "pg"),
    ("off_ypc", "own", "rushing", "yardsPerRushAttempt",
     "Yards per rush attempt", "high", "num"),
    ("def_ypc", "opp", "rushing", "yardsPerRushAttempt",
     "Yards per rush allowed", "low", "num"),
    ("off_rush_ypg", "own", "rushing", "rushingYardsPerGame",
     "Rushing yards per game", "high", "num"),
    ("def_rush_ypg", "opp", "rushing", "rushingYardsPerGame",
     "Rushing yards allowed per game", "low", "num"),
    ("off_rush_td", "own", "rushing", "rushingTouchdowns",
     "Rushing TDs per game", "high", "pg"),
    ("def_rush_td", "opp", "rushing", "rushingTouchdowns",
     "Rushing TDs allowed per game", "low", "pg"),
    ("off_fg", "own", "kicking", "fieldGoalPct",
     "Field-goal rate", "high", "pct"),
    ("off_punt", "own", "punting", "netAvgPuntYards",
     "Net punt average", "high", "num"),
    ("off_kr", "own", "returning", "yardsPerKickReturn",
     "Kick-return average", "high", "num"),
    ("off_pr", "own", "returning", "yardsPerPuntReturn",
     "Punt-return average", "high", "num"),
    ("off_pen", "own", "miscellaneous", "totalPenaltyYards",
     "Penalty yards per game", "low", "pg"),
)

# Rates ESPN does not publish directly, derived only from the same season and
# split as FORM_SPEC.  These are the football equivalents the NFL desk uses to
# describe efficiency, pace and line play.  They are deliberately named for
# their observable inputs: no derived value is relabelled as DVOA, havoc or
# another proprietary/charted statistic.
DERIVED_SPEC = (
    ("off_points_per_play", "own", "points_per_play",
     "Points per offensive play", "high", "num"),
    ("def_points_per_play", "opp", "points_per_play",
     "Points allowed per defensive play", "low", "num"),
    ("off_yards_per_play", "own", "yards_per_play",
     "Yards per offensive play", "high", "num"),
    ("def_yards_per_play", "opp", "yards_per_play",
     "Yards allowed per defensive play", "low", "num"),
    ("off_first_down_rate", "own", "first_down_rate",
     "First downs per offensive play", "high", "pct"),
    ("def_first_down_rate", "opp", "first_down_rate",
     "First downs allowed per defensive play", "low", "pct"),
    ("off_plays_pg", "own", "plays_per_game",
     "Offensive plays per game", "neutral", "num"),
    ("def_plays_pg", "opp", "plays_per_game",
     "Defensive plays faced per game", "neutral", "num"),
    ("off_pass_rate", "own", "pass_rate",
     "Dropback share", "neutral", "pct"),
    ("def_pass_rate", "opp", "pass_rate",
     "Opponent dropback share", "neutral", "pct"),
    ("off_sack_rate", "own", "sack_rate",
     "Sacks allowed per dropback", "low", "pct"),
    ("def_sack_rate", "opp", "sack_rate",
     "Sacks generated per opponent dropback", "high", "pct"),
    ("off_sack_yards_pg", "own", "sack_yards_per_game",
     "Sack yards lost per game", "low", "num"),
    ("def_sack_yards_pg", "opp", "sack_yards_per_game",
     "Opponent sack yards lost per game", "high", "num"),
    ("off_rush_attempts_pg", "own", "rush_attempts_per_game",
     "Rushing attempts per game", "neutral", "num"),
    ("def_rush_attempts_pg", "opp", "rush_attempts_per_game",
     "Opponent rushing attempts per game", "neutral", "num"),
    ("off_rush_first_rate", "own", "rush_first_down_rate",
     "Rushing first downs per attempt", "high", "pct"),
    ("def_rush_first_rate", "opp", "rush_first_down_rate",
     "Rushing first downs allowed per attempt", "low", "pct"),
    ("off_pass_first_rate", "own", "pass_first_down_rate",
     "Passing first downs per attempt", "high", "pct"),
    ("def_pass_first_rate", "opp", "pass_first_down_rate",
     "Passing first downs allowed per attempt", "low", "pct"),
    ("off_yards_per_completion", "own", "yards_per_completion",
     "Yards per completion", "high", "num"),
    ("def_yards_per_completion", "opp", "yards_per_completion",
     "Yards allowed per completion", "low", "num"),
    ("off_pass_td_rate", "own", "pass_touchdown_rate",
     "Passing touchdowns per attempt", "high", "pct"),
    ("def_pass_td_rate", "opp", "pass_touchdown_rate",
     "Passing touchdowns allowed per attempt", "low", "pct"),
    ("off_interception_rate", "own", "interception_rate",
     "Interceptions thrown per attempt", "low", "pct"),
    ("def_interception_rate", "opp", "interception_rate",
     "Interceptions forced per opponent attempt", "high", "pct"),
    ("off_dropbacks_pg", "own", "dropbacks_per_game",
     "Dropbacks per game", "neutral", "num"),
    ("def_dropbacks_pg", "opp", "dropbacks_per_game",
     "Opponent dropbacks per game", "neutral", "num"),
    ("def_disruption_rate", "opp", "disruption_rate",
     "Sacks plus takeaways per defensive play", "high", "pct"),
)


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()
    if not raw:
        raise RuntimeError(f"empty response from {url}")
    return json.loads(raw)


def fetch_text(url: str) -> str:
    headers = dict(HEADERS)
    headers["Accept"] = "text/html,application/xhtml+xml"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()
    if not raw:
        raise RuntimeError(f"empty response from {url}")
    return raw.decode("utf-8", errors="replace")


class _SpPlusParser(HTMLParser):
    """Read the public SP+ table without depending on its presentation CSS."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[tuple[list[str], str | None]] = []
        self._active = False
        self._in_cell = False
        self._cells: list[list[str]] = []
        self._team_id: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "tr" and str(values.get("wire:key") or "").startswith("sp-rating-"):
            self._active = True
            self._cells = []
            self._team_id = None
        elif self._active and tag == "td":
            self._in_cell = True
            self._cells.append([])
        elif self._active and tag == "img" and self._team_id is None:
            hit = re.search(r"/ncaa/(?:500|500-dark)/(\d+)\.png", values.get("src") or "")
            if hit:
                self._team_id = hit.group(1)

    def handle_data(self, data: str) -> None:
        if self._active and self._in_cell and self._cells:
            self._cells[-1].append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._active and tag == "td":
            self._in_cell = False
        elif self._active and tag == "tr":
            cells = [" ".join("".join(parts).split()) for parts in self._cells]
            self.rows.append((cells, self._team_id))
            self._active = False
            self._in_cell = False


def normalize_school(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _sp_component(text: str) -> tuple[float, int | None]:
    value = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    place = re.search(r"\((\d+)\)", text)
    if not value:
        raise ValueError(f"missing SP+ value in {text!r}")
    return float(value.group()), int(place.group(1)) if place else None


def parse_sp_plus(html: str, season: int) -> dict[str, dict]:
    season_hit = re.search(r"Updated for the (\d{4}) season", html, re.IGNORECASE)
    if not season_hit or int(season_hit.group(1)) != season:
        raise RuntimeError(
            f"SP+ season mismatch: requested {season}, page says "
            f"{season_hit.group(1) if season_hit else 'unknown'}"
        )
    parser = _SpPlusParser()
    parser.feed(html)
    parsed = []
    for cells, team_id in parser.rows:
        if len(cells) < 5:
            continue
        identity = re.match(r"^(\d+)\.\s*(.+?)(?:\s+\(\d+-\d+\))?$", cells[0])
        if not identity:
            continue
        overall, offense, defense, special = (
            _sp_component(cells[1]), _sp_component(cells[2]),
            _sp_component(cells[3]), _sp_component(cells[4]),
        )
        parsed.append((identity.group(2), team_id, int(identity.group(1)),
                       overall, offense, defense, special))
    if len(parsed) < 130:
        raise RuntimeError(f"SP+ pull is incomplete: parsed {len(parsed)} FBS teams")
    size = len(parsed)
    ratings: dict[str, dict] = {}
    for school, team_id, overall_rank, overall, offense, defense, special in parsed:
        profile = {
            "source": "CFB Update SP+",
            "season": season,
            "method": "Opponent-adjusted CFB efficiency; not FTN DVOA",
            "overall": {"value": round(overall[0], 1), "rank": overall_rank, "of": size},
            "offense": {"value": round(offense[0], 1), "rank": offense[1], "of": size},
            "defense": {"value": round(defense[0], 1), "rank": defense[1], "of": size},
            "special_teams": {"value": round(special[0], 1), "rank": special[1], "of": size},
        }
        if any(profile[key]["rank"] is None for key in
               ("offense", "defense", "special_teams")):
            raise RuntimeError(f"SP+ rank missing for {school}")
        ratings["name:" + normalize_school(school)] = profile
        if team_id:
            ratings["id:" + team_id] = profile
    return ratings


def load_sp_plus(season: int) -> dict[str, dict]:
    return parse_sp_plus(fetch_text(SP_PLUS_URL), season)


def adjusted_for(team: dict | None, school: str, ratings: dict[str, dict]) -> dict | None:
    if team and team.get("id"):
        match = ratings.get("id:" + str(team["id"]))
        if match:
            return match
    return ratings.get("name:" + normalize_school(school))


def _clean_markup(value: str) -> str:
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def parse_scheme_matchup(page: str, season: int) -> dict[str, dict]:
    """Parse one public CFB scheme matchup into two clearly sourced profiles."""
    metric_hit = re.search(r"metric season\s+(\d{4})", page, re.IGNORECASE)
    generated_hit = re.search(r"generated\s+([0-9-]+ [0-9:]+Z)", page, re.IGNORECASE)
    sides: dict[str, dict] = {}
    side_pattern = re.compile(
        r'<div class="dm-side(?: [^"]*)?">.*?'
        r'<div class="name">(.*?)</div>.*?'
        r'<div class="sub">(.*?)</div>.*?'
        r'<div class="rate">\s*([0-9.]+)% pass', re.DOTALL,
    )
    for school_html, style_html, pass_rate in side_pattern.findall(page):
        school = _clean_markup(school_html)
        style = _clean_markup(style_html).split(" · ", 1)
        sides[normalize_school(school)] = {
            "school": school,
            "offense_scheme": {
                "family": style[0],
                "tendency": style[1] if len(style) > 1 else "",
                "competitive_down_pass_rate": round(float(pass_rate) / 100, 4),
            },
        }

    card_pattern = re.compile(
        r'<div class="dm-tier t2">\s*<div.*?<strong>(.*?) offence</strong>.*?'
        r'<dl class="mb-0">(.*?)</dl>\s*</div>', re.DOTALL,
    )
    for school_html, body in card_pattern.findall(page):
        school = _clean_markup(school_html)
        key = normalize_school(school)
        if key not in sides:
            continue
        fields = {
            _clean_markup(label).lower(): _clean_markup(value)
            for label, value in re.findall(
                r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', body, re.DOTALL
            )
        }
        facing = fields.get("facing", "")
        opponent, sep, defense = facing.partition(" — ")
        defense_parts = [part.strip() for part in defense.split(",", 2)] if sep else []
        if len(defense_parts) == 3:
            opp_key = normalize_school(opponent)
            if opp_key in sides:
                sides[opp_key]["defense_scheme"] = {
                    "front": defense_parts[0],
                    "coverage_leaning": defense_parts[1],
                    "pressure_profile": defense_parts[2],
                }
        sides[key]["matchup_plan"] = {
            "expected_play_caller": fields.get("expected play caller"),
            "attack_vs_man": fields.get("attack vs man"),
            "attack_vs_zone": fields.get("attack vs zone"),
            "versus_pressure": fields.get("versus pressure"),
            "primary_failure_mode": fields.get("primary failure mode"),
            "source_confidence": fields.get("confidence"),
        }

    out: dict[str, dict] = {}
    for key, profile in sides.items():
        if not profile.get("defense_scheme"):
            continue
        profile.update({
            "source": "Deep Metric Analytics",
            "season": season,
            "metric_season": int(metric_hit.group(1)) if metric_hit else None,
            "observed_at_utc": generated_hit.group(1).replace(" ", "T") if generated_hit else None,
            "method": "Staff-derived scheme expectation; actual man/zone snap rates unavailable",
        })
        out["name:" + key] = {
            field: value for field, value in profile.items() if value not in (None, "")
        }
    return out


def load_scheme_profiles(season: int, week: int) -> dict[str, dict]:
    index = fetch_text(SCHEME_WEEK_URL.format(season=season, week=week))
    paths = sorted(set(re.findall(
        rf'href="(/college-football/{season}/scheme-matchup/[^"]+-week-{week})"', index
    )))
    if len(paths) < 40:
        raise RuntimeError(f"CFB scheme index is incomplete: found {len(paths)} matchups")

    def load(path: str) -> dict[str, dict]:
        return parse_scheme_matchup(fetch_text(SCHEME_ORIGIN + path), season)

    profiles: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for parsed in pool.map(load, paths):
            profiles.update(parsed)
    if len(profiles) < 100:
        raise RuntimeError(f"CFB scheme pull is incomplete: parsed {len(profiles)} team profiles")
    return profiles


def scheme_for(school: str, profiles: dict[str, dict]) -> dict | None:
    return profiles.get("name:" + normalize_school(school))


def as_rate(value, fmt: str, games: float | None = None):
    if value is None:
        return None
    number = float(value)
    if fmt == "pct" and number > 1.5:
        number = number / 100.0
    if fmt == "pg":
        if not games or games <= 0:
            return None
        number = number / games
    return number


def _number(team: dict, split: str, category: str, field: str) -> float | None:
    value = ((team.get(split) or {}).get(category) or {}).get(field)
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def _ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator


def derived_rate(team: dict, split: str, metric: str) -> float | None:
    """Calculate transparent season-to-date rates from ESPN counting stats."""
    games = float(team.get("games") or 0)
    pass_attempts = _number(team, split, "passing", "passingAttempts")
    sacks = _number(team, split, "passing", "sacks")
    rush_attempts = _number(team, split, "rushing", "rushingAttempts")
    dropbacks = None if pass_attempts is None or sacks is None else pass_attempts + sacks
    plays = None if dropbacks is None or rush_attempts is None else dropbacks + rush_attempts

    if metric == "plays_per_game":
        return _ratio(plays, games)
    if metric == "pass_rate":
        return _ratio(dropbacks, plays)
    if metric == "sack_rate":
        return _ratio(sacks, dropbacks)
    if metric == "sack_yards_per_game":
        return _ratio(_number(team, split, "passing", "sackYardsLost"), games)
    if metric == "rush_attempts_per_game":
        return _ratio(rush_attempts, games)
    if metric == "yards_per_play":
        passing = _number(team, split, "passing", "passingYards")
        rushing = _number(team, split, "rushing", "rushingYards")
        yards = None if passing is None or rushing is None else passing + rushing
        return _ratio(yards, plays)
    if metric == "points_per_play":
        return _ratio(_number(team, split, "passing", "totalPoints"), plays)
    if metric == "first_down_rate":
        return _ratio(_number(team, split, "miscellaneous", "firstDowns"), plays)
    if metric == "rush_first_down_rate":
        return _ratio(_number(team, split, "miscellaneous", "firstDownsRushing"), rush_attempts)
    if metric == "pass_first_down_rate":
        return _ratio(_number(team, split, "miscellaneous", "firstDownsPassing"), pass_attempts)
    if metric == "yards_per_completion":
        return _ratio(
            _number(team, split, "passing", "passingYards"),
            _number(team, split, "passing", "completions"),
        )
    if metric == "pass_touchdown_rate":
        return _ratio(_number(team, split, "passing", "passingTouchdowns"), pass_attempts)
    if metric == "interception_rate":
        return _ratio(_number(team, split, "passing", "interceptions"), pass_attempts)
    if metric == "dropbacks_per_game":
        return _ratio(dropbacks, games)
    if metric == "disruption_rate":
        interceptions = _number(team, split, "passing", "interceptions")
        # ESPN stores fumble recoveries on the defending team's own/general
        # line, while sacks and interceptions live in its opponent split.
        fumbles = _number(team, "own", "general", "fumblesRecovered")
        if sacks is None or interceptions is None or fumbles is None:
            return None
        return _ratio(sacks + interceptions + fumbles, plays)
    return None


def rank(pool: list[float], value: float, better: str) -> int:
    if better == "high":
        return 1 + sum(1 for other in pool if other > value + 1e-12)
    return 1 + sum(1 for other in pool if other < value - 1e-12)


def category_map(block: dict, names: list[str]) -> dict[str, float]:
    values = block.get("values") or []
    out: dict[str, float] = {}
    for name, raw in zip(names, values):
        try:
            if raw is None or raw == "":
                continue
            out[name] = float(raw)
        except (TypeError, ValueError):
            continue
    return out


def load_espn_stats(season: int) -> dict[str, dict]:
    """Load one explicitly requested regular season and fail closed on drift."""
    payload = fetch_json(f"{STATS_URL}&season={season}&seasontype=2")
    requested = payload.get("requestedSeason") or {}
    requested_type = requested.get("type") or {}
    if int(requested.get("year") or 0) != season or int(requested_type.get("type") or 0) != 2:
        raise RuntimeError(
            "ESPN CFB statistics season mismatch: "
            f"requested {season} regular season, received {requested!r}"
        )
    names_by_cat = {
        cat["name"]: list(cat.get("names") or [])
        for cat in payload.get("categories") or []
    }
    teams: dict[str, dict] = {}
    for row in payload.get("teams") or []:
        meta = row.get("team") or {}
        own: dict[str, dict] = {}
        opp: dict[str, dict] = {}
        for block in row.get("categories") or []:
            split = "opp" if str(block.get("splitId")) == "900" else "own"
            bucket = opp if split == "opp" else own
            cat = block.get("name")
            bucket[cat] = category_map(block, names_by_cat.get(cat) or [])
        games = ((own.get("general") or {}).get("gamesPlayed"))
        entry = {
            "id": str(meta.get("id") or ""),
            "season": season,
            "abbreviation": str(meta.get("abbreviation") or "").upper(),
            "school": meta.get("nickname") or meta.get("shortDisplayName") or meta.get("displayName"),
            "display": meta.get("displayName") or "",
            "own": own,
            "opp": opp,
            "games": games,
        }
        for key in filter(None, (
            entry["abbreviation"],
            str(entry["school"] or "").lower(),
            str(meta.get("shortDisplayName") or "").lower(),
            str(meta.get("displayName") or "").lower(),
        )):
            teams.setdefault(key, entry)
    return teams


def load_espn_events() -> list[dict]:
    try:
        payload = fetch_json(SCOREBOARD_URL)
    except (RuntimeError, OSError):
        return []
    return (((payload.get("content") or {}).get("sbData") or {}).get("events")) or []


def event_index(events: list[dict]) -> dict[tuple[str, str], dict]:
    out: dict[tuple[str, str], dict] = {}
    for event in events:
        comps = event.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        sides = {}
        for competitor in comp.get("competitors") or []:
            team = competitor.get("team") or {}
            sides[competitor.get("homeAway")] = {
                "abbr": str(team.get("abbreviation") or "").upper(),
                "school": team.get("nickname") or team.get("shortDisplayName") or team.get("displayName"),
                "record": ((competitor.get("records") or [{}])[0] or {}).get("summary"),
                "score": competitor.get("score"),
            }
        away, home = sides.get("away") or {}, sides.get("home") or {}
        if not away.get("abbr") or not home.get("abbr"):
            continue
        venue = comp.get("venue") or {}
        address = venue.get("address") or {}
        city = ", ".join(part for part in (address.get("city"), address.get("state")) if part)
        broadcasts = []
        for item in comp.get("broadcasts") or []:
            broadcasts.extend(item.get("names") or [])
        state = str(((comp.get("status") or {}).get("type") or {}).get("state") or "pre").lower()
        game_state = "live" if state == "in" else ("final" if state == "post" else "scheduled")
        qbs = {}
        for leader in event.get("competitions", [{}])[0].get("leaders") or event.get("leaders") or []:
            if str(leader.get("name") or "").lower() not in {"passingyards", "passing yards", "qb"}:
                continue
            for item in leader.get("leaders") or []:
                athlete = item.get("athlete") or {}
                team = (item.get("team") or {}).get("abbreviation") or ""
                if athlete.get("displayName") and team:
                    qbs[str(team).upper()] = athlete.get("displayName")
        payload = {
            "kickoff_utc": event.get("date") or comp.get("date"),
            "venue": venue.get("fullName"),
            "venue_city": city or None,
            "roof": "Indoor" if venue.get("indoor") else "Outdoor",
            "surface": "Indoor" if venue.get("indoor") else None,
            "broadcast": ", ".join(broadcasts[:2]) or None,
            "neutral": True if comp.get("neutralSite") else None,
            "game_state": game_state,
            "away": away,
            "home": home,
            "qbs": qbs,
        }
        out[(away["abbr"], home["abbr"])] = payload
        if away.get("school") and home.get("school"):
            out[(str(away["school"]).lower(), str(home["school"]).lower())] = payload
    return out


def lookup_team(stats: dict[str, dict], abbr: str, school: str) -> dict | None:
    return (
        stats.get(str(abbr or "").upper())
        or stats.get(str(school or "").lower())
        or stats.get(re.sub(r"\s+", " ", str(school or "").lower()))
    )


def form_for(team: dict | None, pools: dict[str, list[float]], season: int) -> dict | None:
    if not team or int(team.get("season") or 0) != season:
        return None
    games = team.get("games")
    rates = {}
    for key, split, cat, field, label, better, fmt in FORM_SPEC:
        bucket = team[split].get(cat) or {}
        value = as_rate(bucket.get(field), fmt, games)
        pool = pools.get(key) or []
        if value is None or not pool:
            continue
        rates[key] = {
            "label": label,
            "value": round(value, 4),
            "better": better,
            "rank": rank(pool, value, better),
            "of": len(pool),
            "format": "num" if fmt == "pg" else fmt,
        }
    for key, split, metric, label, better, fmt in DERIVED_SPEC:
        value = derived_rate(team, split, metric)
        pool = pools.get(key) or []
        if value is None:
            continue
        entry = {
            "label": label,
            "value": round(value, 4),
            "better": better,
            "format": fmt,
        }
        # Pace and play mix are context, not performance, but the owner asked
        # for their place too (2026-10-01): a neutral rate is ranked by "most"
        # (1st = most plays per game, the highest pass rate), the same reading
        # as the NFL desk's frequency pills.
        if pool:
            entry["rank"] = rank(pool, value, "high" if better == "neutral" else better)
            entry["of"] = len(pool)
        rates[key] = entry
    if not rates:
        return None
    out = {"rates": rates, "source": "espn", "season": season}
    if games:
        out["games"] = games
    return out


def load_board_games() -> tuple[list[dict], dict]:
    board = fetch_json(BOARD_URL)
    return board.get("games") or [], board


def public_game(raw: dict, stats: dict, events: dict, pools: dict,
                adjusted: dict, schemes: dict, season: int) -> dict:
    away_meta, home_meta = raw.get("away") or {}, raw.get("home") or {}
    away_abbr = away_meta.get("abbreviation") or away_meta.get("school")
    home_abbr = home_meta.get("abbreviation") or home_meta.get("school")
    away_school = away_meta.get("school")
    home_school = home_meta.get("school")
    event = events.get((str(away_abbr).upper(), str(home_abbr).upper())) or events.get(
        (str(away_school).lower(), str(home_school).lower())
    ) or {}
    away_side = (event.get("away") or {})
    home_side = (event.get("home") or {})
    away_team = lookup_team(stats, away_abbr, away_school)
    home_team = lookup_team(stats, home_abbr, home_school)
    row = {
        "id": f"{away_abbr}@{home_abbr}",
        "sport": "cfb",
        "season": season,
        "game_state": event.get("game_state") or "scheduled",
        "kickoff_utc": event.get("kickoff_utc") or raw.get("kickoff"),
        "away": away_abbr,
        "home": home_abbr,
        "away_name": away_school,
        "home_name": home_school,
        "away_conference": away_meta.get("conference"),
        "home_conference": home_meta.get("conference"),
        "away_logo": away_meta.get("logo"),
        "home_logo": home_meta.get("logo"),
        "away_color": away_meta.get("color"),
        "home_color": home_meta.get("color"),
        "away_record": away_side.get("record"),
        "home_record": home_side.get("record"),
        "away_score": away_side.get("score"),
        "home_score": home_side.get("score"),
        "venue": event.get("venue"),
        "venue_city": event.get("venue_city"),
        "roof": event.get("roof"),
        "surface": event.get("surface"),
        "broadcast": event.get("broadcast"),
        "neutral": event.get("neutral") or (True if raw.get("neutral") else None),
        "away_starter": (event.get("qbs") or {}).get(str(away_abbr).upper()),
        "home_starter": (event.get("qbs") or {}).get(str(home_abbr).upper()),
        "away_form": form_for(away_team, pools, season),
        "home_form": form_for(home_team, pools, season),
        "away_adjusted_efficiency": adjusted_for(away_team, away_school, adjusted),
        "home_adjusted_efficiency": adjusted_for(home_team, home_school, adjusted),
        "away_scheme_profile": scheme_for(away_school, schemes),
        "home_scheme_profile": scheme_for(home_school, schemes),
        "home_travel": None if (event.get("neutral") or raw.get("neutral")) else "Home",
    }
    return {key: value for key, value in row.items() if value not in (None, "")}


def main() -> int:
    games_in, board = load_board_games()
    season = int(board.get("season") or 0)
    current_year = datetime.now(timezone.utc).year
    if season != current_year:
        raise RuntimeError(
            f"CFB board season {season or 'missing'} is not the current year {current_year}; "
            "refusing to publish a mixed-season matchup slate"
        )
    stats = load_espn_stats(season)
    unique = []
    seen = set()
    for entry in stats.values():
        ident = entry["id"]
        if ident in seen:
            continue
        seen.add(ident)
        unique.append(entry)
    pools: dict[str, list[float]] = {
        spec[0]: [] for spec in FORM_SPEC + DERIVED_SPEC
    }
    for team in unique:
        for key, split, cat, field, _label, _better, fmt in FORM_SPEC:
            value = as_rate((team[split].get(cat) or {}).get(field), fmt, team.get("games"))
            if value is not None:
                pools[key].append(value)
        for key, split, metric, _label, better, _fmt in DERIVED_SPEC:
            value = derived_rate(team, split, metric)
            if value is not None:
                pools[key].append(value)
    events = event_index(load_espn_events())
    adjusted = load_sp_plus(season)
    week = int(board.get("week") or 0)
    schemes = load_scheme_profiles(season, week)
    games = [public_game(raw, stats, events, pools, adjusted, schemes, season) for raw in games_in]
    games.sort(key=lambda row: (row.get("kickoff_utc") or "9999", row.get("id") or ""))
    stamp = datetime.now(timezone.utc).replace(microsecond=0)
    payload = {
        "schema": "chase-public-slate/1",
        "sport": "cfb",
        "season": season,
        "week": board.get("week"),
        "generated_at_utc": stamp.isoformat().replace("+00:00", "Z"),
        "data_through_utc": board.get("generated_at"),
        "games": games,
    }
    with_form = sum(1 for game in games if game.get("away_form") and game.get("home_form"))
    with_adjusted = sum(1 for game in games if game.get("away_adjusted_efficiency")
                        and game.get("home_adjusted_efficiency"))
    with_scheme = sum(1 for game in games if game.get("away_scheme_profile")
                      and game.get("home_scheme_profile"))
    # Validate before writing: an ESPN outage or a renamed stats field must
    # leave the last good slate in place rather than publish a week of blank
    # unit tables. The scheduled workflow fails loudly instead.
    if not games or with_form < MIN_FORM_SHARE * len(games):
        print(f"refusing to write {OUT}: {with_form} of {len(games)} games carry both unit "
              f"profiles (need {MIN_FORM_SHARE:.0%}); keeping the published slate")
        return 1
    if with_adjusted != len(games):
        missing = [game.get("id") for game in games
                   if not game.get("away_adjusted_efficiency")
                   or not game.get("home_adjusted_efficiency")]
        print(f"refusing to write {OUT}: SP+ profiles missing for {missing}; "
              "keeping the published slate")
        return 1
    if with_scheme < 0.9 * len(games):
        print(f"refusing to write {OUT}: only {with_scheme} of {len(games)} games carry "
              "both CFB scheme profiles; keeping the published slate")
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(games)} games, {with_form} with both unit profiles, "
          f"{with_adjusted} with both SP+ profiles, {with_scheme} with both scheme profiles)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
