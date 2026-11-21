"""CFB matchup depth: run game and both lines, scheme tendencies, quarterbacks,
ball carriers and game logs - all measured, every rate ranked of FBS.

Owner 2026-10-01: the CFB matchup needed actual stats where it had a
staff-derived scheme profile, QB passing stats with their splits beside the
other defense's, more rushing including offensive- and defensive-line run
stats, and game logs.

Sources
-------
* CFBD (collegefootballdata.com), four calls a run:
    /stats/season/advanced   line yards, second-level and open-field yards,
                             power success, stuff rate, havoc (front seven,
                             DB), standard/passing-down splits, pass/rush PPA
    /ppa/players/season      QB expected points added per play, by down type
    /stats/player/season     season passing and rushing lines
  The key is CFBD_API_KEY. Without it, or on a spent allowance, every CFBD
  block is simply absent and the page says so; nothing is estimated.
* ESPN (no key) for game logs: each completed game's team box score,
  cached permanently once final.

Public CFB data has no coverage-shell or pressure charting (the NFL desk's
come from NGS participation and FTN, which cover the NFL only), so QB splits
are by down type and down - the splits CFBD measures - set beside the
opposing defense's numbers on the same splits.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFBD = "https://api.collegefootballdata.com"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
CACHE = Path(os.environ.get("CFB_DEPTH_CACHE", str(ROOT / "data" / "cache" / "cfb_depth")))
AGENTS = (None, "curl/8.5.0", "Mozilla/5.0", "python-requests/2.32")

# QB pool floors: a passer enters the ranking pool with this share of the
# median attempts among FBS passers with any volume, never fewer than 40.
MIN_QB_ATTEMPTS = 40
MIN_RUSHER_CARRIES = 25


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _get(url: str, headers: dict | None = None, seen: dict | None = None) -> object:
    """JSON from ``url``; the response headers land in ``seen`` when given."""
    last: Exception | None = None
    for agent in AGENTS if "espn" in url else (None,):
        h = dict(headers or {})
        if agent:
            h["User-Agent"] = agent
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=45) as r:
                if seen is not None:
                    seen.update({k.lower(): v for k, v in r.headers.items()})
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # an edge 403 or a timeout: try the next agent
            last = exc
    raise last if last else RuntimeError(url)


# --- the CFBD allowance -----------------------------------------------------
# The free CFBD key carries 1,000 calls a month, one pool shared by this desk
# and the CFB model. It ran dry on 2026-11-20 with ten days left: 1,294
# requests in 31 days, most refetching numbers no game had changed (/games
# alone 332, now read from ESPN). So a CFBD response is kept on disk (the
# Actions cache keeps the folder between runs) and is fetched again only when
# a game has finished since it was fetched and CFBD has had LAG_HOURS to take
# the game in; with no schedule to judge by, after MAX_AGE_HOURS. A refused or
# failed call serves the last copy kept. The remaining allowance is read off
# every response, and calls stop at RESERVE so the model keeps some.
LAG_HOURS = 3
MAX_AGE_HOURS = 20
RESERVE = 40
GAME_HOURS = 4  # a final's end, counted from kickoff
ALLOWANCE = {"calls": 0, "kept": 0, "stale": 0, "remaining": None, "refused": False}
_CHANGED: dict[int, float | None] = {}   # season -> the latest final's end (epoch)
_CFBD_SEEN: dict[str, object] = {}       # one request per URL per process
_SKIPPED: set[str] = set()


def _fresh(fetched_at, changed_at, now: float | None = None) -> bool:
    """Is a copy fetched at ``fetched_at`` still current, given the latest
    final ended at ``changed_at`` (None: the schedule is unknown)?"""
    if not fetched_at:
        return False
    now = time.time() if now is None else now
    if changed_at is None:
        return now - fetched_at < MAX_AGE_HOURS * 3600
    ready = changed_at + LAG_HOURS * 3600   # when CFBD has taken the latest final in
    return fetched_at >= ready or now < ready


def changed_at(season: int, week: int | None = None) -> float | None:
    """When the season's (or a week's) latest final ended, from ESPN."""
    games = season_games(season)
    ends = [g["_ended"] for g in games if g.get("_ended") and (week is None or g.get("week") == week)]
    return max(ends) if ends else None


def cfbd(path: str, *, changed: float | None = None, store: bool = True, **params) -> list | dict | None:
    """A CFBD response: the copy kept on disk while no game has changed it,
    else one call (see the allowance note above). ``changed`` overrides when
    the data last changed (a week's latest final); ``store=False`` leaves
    keeping the response to the caller (a week of plays is kept parsed)."""
    url = f"{CFBD}{path}?{urllib.parse.urlencode(params)}"
    if url in _CFBD_SEEN:
        return _CFBD_SEEN[url]
    name = "cfbd_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:20] + ".json"
    hit = _cached(name) if store else None
    if changed is None and isinstance(params.get("year"), int) and path != "/games":
        changed = changed_at(params["year"])
    if hit and _fresh(hit.get("fetched_at"), changed):
        ALLOWANCE["kept"] += 1
        _CFBD_SEEN[url] = hit.get("value")
        return hit.get("value")

    def stale(reason: str):
        if hit:
            ALLOWANCE["stale"] += 1
            day = datetime.fromtimestamp(float(hit.get("fetched_at") or 0), timezone.utc).strftime("%Y-%m-%d %H:%M")
            print(f"  CFBD {path}: {reason}; serving the copy fetched {day} UTC")
        elif not store:
            # The caller keeps this response itself (a week's parsed plays): say so once a run.
            if path not in _SKIPPED:
                _SKIPPED.add(path)
                print(f"  CFBD {path}: {reason}; the kept {path} aggregates stand")
        else:
            print(f"  CFBD {path}: {reason}; no copy kept")
        _CFBD_SEEN[url] = hit.get("value") if hit else None
        return _CFBD_SEEN[url]

    key = os.environ.get("CFBD_API_KEY")
    if not key:
        return stale("no API key")
    remaining = ALLOWANCE["remaining"]
    if ALLOWANCE["refused"]:
        return stale("the month's allowance is spent")
    if remaining is not None and remaining <= RESERVE:
        return stale(f"held back, {remaining} calls left for the CFB model")
    seen: dict = {}
    try:
        value = _get(url, {"Authorization": f"Bearer {key}", "Accept": "application/json"}, seen)
    except Exception as exc:
        if "429" in str(exc):
            ALLOWANCE["refused"] = True  # spent: no further calls this run
        return stale(f"unavailable ({exc})")
    ALLOWANCE["calls"] += 1
    try:
        ALLOWANCE["remaining"] = int(seen.get("x-calllimit-remaining"))
    except (TypeError, ValueError):
        pass
    if store and value is not None:
        _store(name, {"fetched_at": time.time(), "path": path, "value": value})
    _CFBD_SEEN[url] = value
    return value


def allowance_line() -> str:
    a = ALLOWANCE
    left = ("0 (refused: the month's allowance is spent)" if a["refused"]
            else "unknown" if a["remaining"] is None else str(a["remaining"]))
    return (f"CFBD: {a['calls']} calls, {a['kept']} served from the kept copy, {a['stale']} older copies "
            f"served; calls left this month: {left}")


# --- ESPN in place of CFBD where ESPN carries the same numbers ---------------
def _espn(path: str) -> dict:
    return _get(f"{ESPN}{path}")


def _powerindex(season: int) -> dict[str, float]:
    """{ESPN team id: FPI}, ESPN's Football Power Index (CFBD's /ratings/fpi
    copies it). Its 138 schools are FBS exactly as CFBD classes them (checked
    2026-11-21; ESPN's FBS group lists ten placeholder teams besides)."""
    name = f"espn_fpi_{season}.json"
    hit = _cached(name)
    if hit and hit.get("fpi") and time.time() - float(hit.get("fetched_at") or 0) < MAX_AGE_HOURS * 3600:
        return hit["fpi"]
    try:
        items = _get("https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/"
                     f"{season}/powerindex?limit=300").get("items") or []
    except Exception as exc:  # noqa: BLE001
        print(f"  ESPN FPI unavailable: {exc}")
        return hit.get("fpi", {}) if hit else {}
    out = {}
    for item in items:
        team = re.search(r"/teams/(\d+)", str((item.get("team") or {}).get("$ref") or ""))
        fpi = next((p.get("value") for p in item.get("predictives") or [] if p.get("name") == "fpi"), None)
        if team and isinstance(fpi, (int, float)):
            out[team.group(1)] = fpi
    if len(out) >= 120:
        _store(name, {"fetched_at": time.time(), "fpi": out})
        return out
    return hit.get("fpi", {}) if hit else out


def fbs_ids(season: int) -> set[str]:
    """ESPN ids of the FBS schools: the FPI list."""
    return set(_powerindex(season))


_ESPN_NAMES: dict[str, str] = {}  # ESPN team id -> school, from the scoreboard


def fbs_names(season: int) -> set[str]:
    """Normalized FBS school names from ESPN (the FPI list, named from the
    scoreboard): the FBS pool when CFBD's season rows are unavailable."""
    season_games(season)
    return {_norm(_ESPN_NAMES[tid]) for tid in fbs_ids(season) if tid in _ESPN_NAMES}


_SEASON_GAMES: dict[int, list[dict]] = {}


def season_games(season: int) -> list[dict]:
    """The regular season's games in every division, in CFBD's /games shape
    (id, week, homeTeam/awayTeam, points, completed, neutralSite, startDate,
    home/awayClassification) from ESPN's scoreboard: free, and the same
    event ids. ESPN's location is CFBD's school name (checked 2026-11-21 on
    every team in weeks 10-12). A week whose games are all final is kept on
    disk. Each row also carries ``_ended``, when a final ended (kickoff +
    GAME_HOURS)."""
    if season in _SEASON_GAMES:
        return _SEASON_GAMES[season]
    fbs = fbs_ids(season)
    games: list[dict] = []
    for week in range(1, 17):
        name = f"espn_games_{season}_{week}.json"
        hit = _cached(name)
        events = hit.get("events") if hit and hit.get("final") else None
        if events is None:
            # Every division, as CFBD's /games returns it and as the power
            # ranking was validated on: FBS (80), FCS (81), Division II (57)
            # and III (58). On FBS and FCS alone the ridge reads each lower
            # division's few games at FBS and FCS hosts as home field: 2025's
            # edge 5.7 points against 4.0 on every division (2026-11-21).
            events, failed = {}, False
            for group in (80, 81, 57, 58):
                try:
                    for e in _espn(f"/scoreboard?dates={season}&seasontype=2&week={week}&groups={group}&limit=500").get("events") or []:
                        events[str(e.get("id"))] = e
                except Exception as exc:  # noqa: BLE001
                    print(f"  ESPN week {week} (group {group}) unavailable: {exc}")
                    failed = True
            events = list(events.values()) if events and not failed else (hit or {}).get("events") or list(events.values())
            done = bool(events) and not failed and all(
                ((e.get("status") or {}).get("type") or {}).get("completed") for e in events)
            if events:
                _store(name, {"final": done, "events": events})
        for e in events:
            comp = (e.get("competitions") or [{}])[0]
            sides = {c.get("homeAway"): c for c in comp.get("competitors") or []}
            if set(sides) != {"home", "away"}:
                continue
            row = {"id": int(e["id"]) if str(e["id"]).isdigit() else e["id"], "season": season,
                   "week": int((e.get("week") or {}).get("number") or week),
                   "startDate": e.get("date"), "neutralSite": bool(comp.get("neutralSite")),
                   "completed": bool(((comp.get("status") or e.get("status") or {}).get("type") or {}).get("completed"))}
            for side, c in sides.items():
                team = c.get("team") or {}
                row[side + "Team"] = team.get("location") or team.get("displayName")
                row[side + "Classification"] = "fbs" if str(team.get("id")) in fbs else "fcs"
                _ESPN_NAMES[str(team.get("id"))] = row[side + "Team"]
                try:
                    row[side + "Points"] = float(c.get("score")) if row["completed"] else None
                except (TypeError, ValueError):
                    row[side + "Points"] = None
            try:
                kickoff = datetime.fromisoformat(str(e.get("date")).replace("Z", "+00:00")).timestamp()
            except ValueError:
                kickoff = None
            row["_ended"] = kickoff + GAME_HOURS * 3600 if row["completed"] and kickoff else None
            games.append(row)
    _SEASON_GAMES[season] = games
    return games


def espn_fpi(season: int) -> dict[str, float]:
    """{normalized school: FPI} from ESPN. A school's name is its scoreboard
    location, which is CFBD's school name (checked on every team, weeks 10-12)."""
    season_games(season)
    return {_norm(_ESPN_NAMES[tid]): fpi for tid, fpi in _powerindex(season).items() if tid in _ESPN_NAMES}


def rank(pool: list[float], value: float, better: str) -> int:
    if better == "low":
        return 1 + sum(1 for other in pool if other < value - 1e-12)
    return 1 + sum(1 for other in pool if other > value + 1e-12)


def _entry(label: str, value, better: str, fmt: str, pool: list[float], *, place_outside: bool = False) -> dict | None:
    if value is None:
        return None
    v = float(value)
    out = {"label": label, "value": round(v, 4), "better": better, "format": fmt}
    if len(pool) > 1:
        place = rank(pool, v, "high" if better == "neutral" else better)
        if place <= len(pool) or place_outside:
            # A comparison from outside the sample uses its nearest endpoint.
            out.update(rank=min(place, len(pool)), of=len(pool))
    return out


def _dig(block: dict, path: str):
    for part in path.split("."):
        if not isinstance(block, dict):
            return None
        block = block.get(part)
    return block if isinstance(block, (int, float)) else None


# -- team advanced (CFBD) ------------------------------------------------------
# (key suffix, path in the offense/defense block, label, offense better,
#  defense better, format). "neutral" is a tendency, ranked by "most".
RUN_GAME = (
    ("rush_ppa", "rushingPlays.ppa", "EPA per rush", "high", "low", "ppa"),
    ("rush_success", "rushingPlays.successRate", "Rush success rate", "high", "low", "pct"),
    ("rush_explosiveness", "rushingPlays.explosiveness", "Rush explosiveness", "high", "low", "num2"),
    ("line_yards", "lineYards", "Line yards per rush", "high", "low", "num2"),
    ("second_level_yards", "secondLevelYards", "Second-level yards per rush", "high", "low", "num2"),
    ("open_field_yards", "openFieldYards", "Open-field yards per rush", "high", "low", "num2"),
    ("power_success", "powerSuccess", "Power success (short yardage)", "high", "low", "pct"),
    ("stuff_rate", "stuffRate", "Runs stuffed at or behind the line", "low", "high", "pct"),
    ("havoc_front_seven", "havoc.frontSeven", "Front-seven havoc rate", "low", "high", "pct"),
)
SCHEME = (
    ("pass_rate", "passingPlays.rate", "Pass play share", "neutral", "neutral", "pct"),
    ("passing_down_rate", "passingDowns.rate", "Share of plays on passing downs", "low", "high", "pct"),
    ("success_rate", "successRate", "Success rate", "high", "low", "pct"),
    ("standard_down_success", "standardDowns.successRate", "Standard-down success", "high", "low", "pct"),
    ("passing_down_success", "passingDowns.successRate", "Passing-down success", "high", "low", "pct"),
    ("pass_ppa", "passingPlays.ppa", "EPA per pass", "high", "low", "ppa"),
    ("pass_success", "passingPlays.successRate", "Pass success rate", "high", "low", "pct"),
    ("explosiveness", "explosiveness", "Explosiveness", "high", "low", "num2"),
    ("havoc_total", "havoc.total", "Havoc rate", "low", "high", "pct"),
    ("havoc_db", "havoc.db", "DB havoc rate", "low", "high", "pct"),
    ("points_per_opportunity", "pointsPerOpportunity", "Points per scoring opportunity", "high", "low", "num2"),
    ("field_position", "fieldPosition.averageStart", "Average starting field position", "neutral", "neutral", "num"),
)


def advanced_rows(season: int) -> list[dict]:
    """One CFBD call shared by the team tables and the QB defense splits."""
    rows = cfbd("/stats/season/advanced", year=season, excludeGarbageTime="true")
    return rows if isinstance(rows, list) else []


def team_advanced(rows: list[dict]) -> dict[str, dict]:
    """{normalized school: {"run_game": {rates}, "scheme": {rates}}}."""
    if not rows:
        return {}
    out: dict[str, dict] = {}
    for group_name, spec in (("run_game", RUN_GAME), ("scheme", SCHEME)):
        pools = {}
        for suffix, path, _l, ob, db, _f in spec:
            pools["off_" + suffix] = [v for v in (_dig(r.get("offense") or {}, path) for r in rows) if v is not None]
            pools["def_" + suffix] = [v for v in (_dig(r.get("defense") or {}, path) for r in rows) if v is not None]
        for r in rows:
            rates = {}
            for suffix, path, label, ob, db, fmt in spec:
                for side, better, prefix in (("offense", ob, "off_"), ("defense", db, "def_")):
                    value = _dig(r.get(side) or {}, path)
                    # A defense allows what it wants less of; what it wants more
                    # of (stuffs, havoc, passing downs forced) it generates.
                    if side == "offense":
                        text = label
                    elif better == "neutral":
                        text = "Opponent " + label.lower()
                    elif better == "low":
                        text = label + " allowed"
                    else:
                        text = label + " generated" if "rate" in label else label
                    entry = _entry(text, value, better, fmt, pools[prefix + suffix])
                    if entry:
                        rates[prefix + suffix] = entry
            out.setdefault(_norm(r.get("team")), {})[group_name] = {"rates": rates}
    return out


# -- players (CFBD) --------------------------------------------------------------
def _player_lines(season: int, category: str) -> dict[tuple[str, str], dict]:
    rows = cfbd("/stats/player/season", year=season, category=category)
    out: dict[tuple[str, str], dict] = {}
    for row in rows if isinstance(rows, list) else []:
        key = (_norm(row.get("team")), str(row.get("playerId") or row.get("player")))
        item = out.setdefault(key, {"player": row.get("player"), "position": row.get("position"),
                                    "team": row.get("team")})
        try:
            item[str(row.get("statType"))] = float(row.get("stat"))
        except (TypeError, ValueError):
            pass
    return out


PPA_SPLITS = (
    ("all", "All plays"), ("pass", "Dropbacks"), ("rush", "Rushes"),
    ("standardDowns", "Standard downs"), ("passingDowns", "Passing downs"),
    ("firstDown", "1st down"), ("secondDown", "2nd down"), ("thirdDown", "3rd down"),
)
# The defense's own numbers on the splits a QB is measured on.
DEF_SPLITS = {"all": "ppa", "pass": "passingPlays.ppa", "rush": "rushingPlays.ppa",
              "standardDowns": "standardDowns.ppa", "passingDowns": "passingDowns.ppa"}


def quarterbacks(season: int, fbs: set[str]) -> dict[str, list[dict]]:
    """{normalized school: [QB, ...]} most attempts first, each with a ranked
    season line and EPA-per-play splits."""
    lines = {k: v for k, v in _player_lines(season, "passing").items()
             if k[0] in fbs and v.get("ATT")}
    ppa_rows = cfbd("/ppa/players/season", year=season, position="QB",
                    excludeGarbageTime="true", threshold=1)
    ppa = {}
    for row in ppa_rows if isinstance(ppa_rows, list) else []:
        ppa[(_norm(row.get("team")), str(row.get("id")))] = row
    attempts = sorted(v["ATT"] for v in lines.values())
    floor = max(MIN_QB_ATTEMPTS, attempts[len(attempts) // 2] // 2 if attempts else 0)
    pool = {k: v for k, v in lines.items() if v["ATT"] >= floor}

    def derived(v):
        att = v.get("ATT") or 0
        return {
            "completion_pct": v.get("COMPLETIONS", 0) / att if att else None,
            "yards_per_attempt": v.get("YDS", 0) / att if att else None,
            "td_rate": v.get("TD", 0) / att if att else None,
            "int_rate": v.get("INT", 0) / att if att else None,
            "yards": v.get("YDS"), "touchdowns": v.get("TD"),
        }
    pooled = {k: derived(v) for k, v in pool.items()}
    specs = (("completion_pct", "Completion %", "high", "pct"),
             ("yards_per_attempt", "Yards per attempt", "high", "num"),
             ("td_rate", "TD rate", "high", "pct"), ("int_rate", "INT rate", "low", "pct"),
             ("yards", "Passing yards", "high", "int"), ("touchdowns", "Passing TDs", "high", "int"))
    pools = {s[0]: [d[s[0]] for d in pooled.values() if d[s[0]] is not None] for s in specs}
    ppa_pool_keys = [k for k in pool if k in ppa]
    ppa_pools = {s: [ppa[k]["averagePPA"].get(s) for k in ppa_pool_keys
                     if ppa[k].get("averagePPA", {}).get(s) is not None] for s, _ in PPA_SPLITS}

    def ppa_splits_pool(split):
        return ppa_pools[split]

    out: dict[str, list[dict]] = {}
    for key, v in lines.items():
        d = derived(v)
        ranked = key in pool
        line = {"attempts": int(v.get("ATT", 0)), "completions": int(v.get("COMPLETIONS", 0)),
                "interceptions": int(v.get("INT", 0))}
        # Every passer is placed against the qualified pool (owner rule: no
        # grey numbers); ``ranked`` records whether he is in that pool himself.
        for name, label, better, fmt in specs:
            e = _entry(label, d[name], better, fmt, pools[name], place_outside=not ranked)
            if e:
                line[name] = e
        splits = {}
        avg = (ppa.get(key) or {}).get("averagePPA") or {}
        for split, label in PPA_SPLITS:
            e = _entry(label + " EPA per play", avg.get(split), "high", "ppa", ppa_splits_pool(split),
                       place_outside=not ranked)
            if e:
                splits[split] = e
        out.setdefault(key[0], []).append({
            "player_id": key[1], "player_name": v.get("player"), "position": v.get("position"),
            "ranked": ranked, "line": line, "epa_splits": splits,
        })
    for school in out:
        out[school].sort(key=lambda q: -q["line"]["attempts"])
    return out


def defense_splits(rows: list[dict]) -> dict[str, dict]:
    """The defense's EPA allowed per play on the QB split families, ranked
    (1st = allows the least)."""
    pools = {s: [v for v in (_dig(r.get("defense") or {}, p) for r in rows) if v is not None]
             for s, p in DEF_SPLITS.items()}
    out = {}
    for r in rows:
        splits = {}
        for s, p in DEF_SPLITS.items():
            e = _entry(dict(PPA_SPLITS)[s] + " EPA allowed per play",
                       _dig(r.get("defense") or {}, p), "low", "ppa", pools[s])
            if e:
                splits[s] = e
        out[_norm(r.get("team"))] = splits
    return out


def rushers(season: int, fbs: set[str]) -> dict[str, list[dict]]:
    lines = {k: v for k, v in _player_lines(season, "rushing").items()
             if k[0] in fbs and v.get("CAR")}
    pool = {k: v for k, v in lines.items() if v["CAR"] >= MIN_RUSHER_CARRIES}
    specs = (("yards", "YDS", "Rushing yards", "high", "int"),
             ("yards_per_carry", None, "Yards per carry", "high", "num"),
             ("touchdowns", "TD", "Rushing TDs", "high", "int"),
             ("long", "LONG", "Longest run", "high", "int"))

    def value(v, name, field):
        return (v.get("YDS", 0) / v["CAR"]) if name == "yards_per_carry" else v.get(field)
    pools = {s[0]: [value(v, s[0], s[1]) for v in pool.values() if value(v, s[0], s[1]) is not None]
             for s in specs}
    out: dict[str, list[dict]] = {}
    for key, v in lines.items():
        ranked = key in pool
        row = {"player_id": key[1], "player_name": v.get("player"), "position": v.get("position"),
               "carries": int(v["CAR"]), "ranked": ranked}
        for name, field, label, better, fmt in specs:
            e = _entry(label, value(v, name, field), better, fmt, pools[name], place_outside=not ranked)
            if e:
                row[name] = e
        out.setdefault(key[0], []).append(row)
    for school in out:
        out[school].sort(key=lambda r: -r["carries"])
        out[school] = out[school][:4]
    return out


MIN_RECEIVER_CATCHES = 12
MIN_DEFENDER_TACKLES = 15
PLAYER_CACHE_HOURS = 20


def _player_lines_cached(season: int, category: str) -> dict[tuple[str, str], dict]:
    """_player_lines through a disk cache (CFBD counts every call against the
    key's allowance; these season lines move once a week). A failed call
    falls back to the last cached copy."""
    import time as _time
    name = f"players_{season}_{category}.json"
    path = CACHE / name
    if path.exists() and _time.time() - path.stat().st_mtime < PLAYER_CACHE_HOURS * 3600:
        hit = _cached(name)
        if hit:
            return {tuple(k.split("|", 1)): v for k, v in hit.items()}
    lines = _player_lines(season, category)
    if lines:
        _store(name, {f"{k[0]}|{k[1]}": v for k, v in lines.items()})
        return lines
    stale = _cached(name)
    return {tuple(k.split("|", 1)): v for k, v in stale.items()} if stale else {}


def _ranked_players(lines, pool_floor_key, floor, specs, keep, sort_key):
    """Rows of ranked entries per school, the rushers' shape."""
    pool = {k: v for k, v in lines.items() if (v.get(pool_floor_key) or 0) >= floor}

    def value(v, name, field):
        return field(v) if callable(field) else v.get(field)
    pools = {s[0]: [value(v, s[0], s[1]) for v in pool.values() if value(v, s[0], s[1]) is not None]
             for s in specs}
    out: dict[str, list[dict]] = {}
    for key, v in lines.items():
        ranked = key in pool
        row = {"player_id": key[1], "player_name": v.get("player"), "position": v.get("position"), "ranked": ranked}
        row.update(keep(v))
        for name, field, label, better, fmt in specs:
            e = _entry(label, value(v, name, field), better, fmt, pools[name], place_outside=not ranked)
            if e and not e["value"] and name in ZERO_NEUTRAL:
                # A zero shared by hundreds of players places by how many
                # share it: zero interceptions read 597th (green) and zero
                # tackles for loss 1,878th (orange). It is printed, unranked.
                e.pop("rank", None)
                e.pop("of", None)
            if e:
                row[name] = e
        out.setdefault(key[0], []).append(row)
    for school in out:
        out[school].sort(key=sort_key)
    return out


ZERO_NEUTRAL = {"touchdowns", "tfl", "sacks", "interceptions", "passes_defended", "hurries"}


def receivers(season: int, fbs: set[str]) -> dict[str, list[dict]]:
    """{normalized school: [pass catcher, ...]} most receiving yards first, each
    ranked among FBS receivers with 12+ catches (2026-11-18 audit: the CFB desk
    had no pass catchers)."""
    lines = {k: v for k, v in _player_lines_cached(season, "receiving").items()
             if k[0] in fbs and v.get("REC")}
    specs = (("receptions", "REC", "Receptions", "high", "int"),
             ("yards", "YDS", "Receiving yards", "high", "int"),
             ("yards_per_catch", lambda v: v.get("YDS", 0) / v["REC"], "Yards per catch", "high", "num"),
             ("touchdowns", "TD", "Receiving TDs", "high", "int"),
             ("long", "LONG", "Longest catch", "high", "int"))
    out = _ranked_players(lines, "REC", MIN_RECEIVER_CATCHES, specs,
                          lambda v: {"catches": int(v["REC"])},
                          lambda r: -((r.get("yards") or {}).get("value") or 0))
    return {school: rows[:5] for school, rows in out.items()}


def defenders(season: int, fbs: set[str]) -> dict[str, list[dict]]:
    """{normalized school: [defender, ...]}: the leading tacklers plus anyone
    with 3+ sacks or 2+ interceptions, each ranked among FBS defenders with
    15+ tackles."""
    lines = {k: dict(v) for k, v in _player_lines_cached(season, "defensive").items()
             if k[0] in fbs and v.get("TOT")}
    for key, v in _player_lines_cached(season, "interceptions").items():
        if key in lines:
            lines[key]["INT"] = v.get("INT")
    specs = (("tackles", "TOT", "Total tackles", "high", "int"),
             ("tfl", "TFL", "Tackles for loss", "high", "num"),
             ("sacks", "SACKS", "Sacks", "high", "num"),
             ("interceptions", lambda v: v.get("INT") or 0, "Interceptions", "high", "int"),
             ("passes_defended", "PD", "Passes defended", "high", "int"),
             # The official scorer's "QB hurried by" (2026-11-18).
             ("hurries", lambda v: v.get("QB HUR") or 0, "QB hurries", "high", "int"))
    out = _ranked_players(lines, "TOT", MIN_DEFENDER_TACKLES, specs,
                          lambda v: {"tackles_total": int(v["TOT"])},
                          lambda r: -r["tackles_total"])
    picked = {}
    for school, rows in out.items():
        lead = rows[:6]
        extra = [r for r in rows[6:] if ((r.get("sacks") or {}).get("value") or 0) >= 3
                 or ((r.get("interceptions") or {}).get("value") or 0) >= 2
                 or ((r.get("hurries") or {}).get("value") or 0) >= 6]
        picked[school] = (lead + extra)[:8]
    return picked


# -- game logs (ESPN) ------------------------------------------------------------
def _cached(name: str) -> dict | None:
    path = CACHE / name
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
    return None


def _store(name: str, payload: dict) -> None:
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        (CACHE / name).write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass


def _week_events(season: int, week: int) -> list[dict]:
    name = f"scoreboard_{season}_{week}.json"
    hit = _cached(name)
    if hit is not None:
        return hit["events"]
    query = urllib.parse.urlencode({"groups": 80, "week": week, "seasontype": 2,
                                    "dates": season, "limit": 400})
    try:
        events = _get(f"{ESPN}/scoreboard?{query}").get("events") or []
    except Exception:
        return []
    if events and all(((e.get("status") or {}).get("type") or {}).get("completed") for e in events):
        _store(name, {"events": events})
    return events


def _box(event_id: str) -> dict | None:
    name = f"box_{event_id}.json"
    hit = _cached(name)
    if hit is not None:
        return hit
    try:
        raw = _get(f"{ESPN}/summary?event={event_id}")
    except Exception:
        return None
    teams = {}
    for t in (raw.get("boxscore") or {}).get("teams") or []:
        tid = str((t.get("team") or {}).get("id") or "")
        teams[tid] = {s.get("name"): s.get("displayValue") for s in t.get("statistics") or []}
    if not teams:
        return None
    payload = {"teams": teams}
    _store(name, payload)
    return payload


def _box_players(event_id: str) -> dict | None:
    """{ESPN team id: {"passers": [[id, name, attempts], ...], "appeared": [[id, name], ...]}}
    for a completed game. ESPN athlete ids are the ids CFBD keys players by."""
    name = f"players_{event_id}.json"
    hit = _cached(name)
    if hit is not None:
        return hit
    try:
        raw = _get(f"{ESPN}/summary?event={event_id}")
    except Exception:
        return None
    teams: dict[str, dict] = {}
    for block in (raw.get("boxscore") or {}).get("players") or []:
        tid = str((block.get("team") or {}).get("id") or "")
        entry = teams.setdefault(tid, {"passers": [], "appeared": []})
        for category in block.get("statistics") or []:
            labels = category.get("labels") or []
            for row in category.get("athletes") or []:
                athlete = row.get("athlete") or {}
                pid = str(athlete.get("id") or "")
                if not pid or pid.startswith("-"):
                    continue
                if pid not in {p for p, _name in entry["appeared"]}:
                    entry["appeared"].append([pid, athlete.get("displayName") or ""])
                if category.get("name") == "passing" and "C/ATT" in labels:
                    cell = str((row.get("stats") or [""] * len(labels))[labels.index("C/ATT")])
                    made_att = re.fullmatch(r"(\d+)/(\d+)", cell)
                    entry["passers"].append([pid, athlete.get("displayName") or "",
                                             int(made_att.group(2)) if made_att else 0])
    if not teams:
        return None
    _store(name, teams)
    return teams


USAGE_STATS = ("att", "pyds", "car", "rec", "tkl")


def _box_usage(event_id: str) -> dict | None:
    """{ESPN team id: {athlete id: {"name", "att", "pyds", "car", "rec", "tkl"}}}
    for a completed game, cached beside the other box files."""
    name = f"usage_{event_id}.json"
    hit = _cached(name)
    if hit is not None:
        return hit
    try:
        raw = _get(f"{ESPN}/summary?event={event_id}")
    except Exception:
        return None
    want = {"passing": {"C/ATT": "att", "YDS": "pyds"}, "rushing": {"CAR": "car"},
            "receiving": {"REC": "rec"}, "defensive": {"TOT": "tkl"}}
    teams: dict[str, dict] = {}
    for block in (raw.get("boxscore") or {}).get("players") or []:
        tid = str((block.get("team") or {}).get("id") or "")
        people = teams.setdefault(tid, {})
        for category in block.get("statistics") or []:
            fields = want.get(category.get("name"))
            labels = category.get("labels") or []
            for row in category.get("athletes") or []:
                athlete = row.get("athlete") or {}
                pid = str(athlete.get("id") or "")
                if not pid or pid.startswith("-"):
                    continue
                entry = people.setdefault(pid, {"name": athlete.get("displayName") or ""})
                for label, key in (fields or {}).items():
                    if label in labels:
                        cell = str((row.get("stats") or [""] * len(labels))[labels.index(label)])
                        part = cell.split("/")[-1] if label == "C/ATT" else cell
                        entry[key] = _num(part) or 0.0
    if not teams:
        return None
    _store(name, teams)
    return teams


def recent_usage(season: int, through_week: int, wanted: dict[str, str], games: int = 3) -> dict[str, dict]:
    """{board abbreviation: {athlete id: {"name", "shares", "recent", "missed", "ypa"}}}
    for every player in each published school's completed games this season
    before ``through_week``.

    shares  his share of the school's attempts, carries, receptions and
            tackles over his last ``games`` appearances: his role when he
            plays (a player out since September is read on his September games).
    recent  the same over the school's last ``games`` games, appearances or
            not - the measure scripts/fit_cfb_injury_value.py priced, so a
            long absence fades from it the way it faded from the closing lines.
    missed  the school's games in a row, newest first, without a line from him.
    ypa     his yards per attempt over those appearances (20+ attempts).
    plays   his plays in the box score this season: pass attempts, carries,
            catches and tackles (no snap counts are published for college
            football; linemen are not credited in a box score).
    played  his games this season with a line.

    Box files are cached, so a week costs only its own games."""
    pending: dict[str, list[tuple[str, str]]] = {}
    for week in range(max(1, through_week) - 1, 0, -1):
        for event in _week_events(season, week):
            if not ((event.get("status") or {}).get("type") or {}).get("completed"):
                continue
            for side in (event.get("competitions") or [{}])[0].get("competitors") or []:
                team = side.get("team") or {}
                board = (wanted.get(str(team.get("abbreviation") or "").upper())
                         or wanted.get(_norm(team.get("location") or "")))
                if board:
                    pending.setdefault(board, []).append((str(event.get("id")), str(team.get("id") or "")))
    events = sorted({e for v in pending.values() for e, _ in v})
    with ThreadPoolExecutor(max_workers=6) as pool:
        boxes = dict(zip(events, pool.map(_box_usage, events)))
    out: dict[str, dict] = {}
    shared = ("att", "car", "rec", "tkl")

    def share(own: dict, team: dict) -> dict:
        return {s: round(own[s] / team[s], 4) if team[s] else 0.0 for s in shared}

    for board, items in pending.items():  # newest first
        seen: dict[str, dict] = {}
        played = [(event, (boxes.get(event) or {}).get(tid)) for event, tid in items]
        played = [mine for _, mine in played if mine]
        window = dict.fromkeys(USAGE_STATS, 0.0)  # the school over its last `games` games
        for n, mine in enumerate(played):
            totals = {s: sum(p.get(s, 0.0) for p in mine.values()) for s in USAGE_STATS}
            if n < games:
                for s in USAGE_STATS:
                    window[s] += totals[s]
            for pid, p in mine.items():
                acc = seen.setdefault(pid, {"name": p.get("name", ""), "games": 0, "missed": n,
                                            "own": dict.fromkeys(USAGE_STATS, 0.0),
                                            "team": dict.fromkeys(USAGE_STATS, 0.0),
                                            "recent": dict.fromkeys(USAGE_STATS, 0.0),
                                            "plays": 0.0, "played": 0})
                acc["plays"] += sum(p.get(s, 0.0) for s in ("att", "car", "rec", "tkl"))
                acc["played"] += 1
                if n < games:
                    for s in USAGE_STATS:
                        acc["recent"][s] += p.get(s, 0.0)
                if acc["games"] >= games:
                    continue
                acc["games"] += 1
                for s in USAGE_STATS:
                    acc["own"][s] += p.get(s, 0.0)
                    acc["team"][s] += totals[s]
        if seen:
            out[board] = {pid: {"name": acc["name"], "missed": acc["missed"],
                                "shares": share(acc["own"], acc["team"]),
                                "recent": share(acc["recent"], window),
                                "ypa": round(acc["own"]["pyds"] / acc["own"]["att"], 3)
                                if acc["own"]["att"] >= 20 else None,
                                "plays": int(round(acc["plays"])), "played": acc["played"]}
                          for pid, acc in seen.items()}
    return out


def last_game_players(season: int, through_week: int, wanted: dict[str, str]) -> dict[str, dict]:
    """{board abbreviation: {"date", "passers", "appeared"}} from each published
    school's most recent completed game before ``through_week``.

    This is who actually played, which the season passing lines cannot say:
    a QB1 lost in October still leads his school in attempts all year.
    """
    out: dict[str, dict] = {}
    pending: list[tuple[str, str, str, str]] = []  # (board, event id, team id, date)
    for week in range(max(1, through_week) - 1, 0, -1):
        for event in _week_events(season, week):
            if not ((event.get("status") or {}).get("type") or {}).get("completed"):
                continue
            for side in (event.get("competitions") or [{}])[0].get("competitors") or []:
                team = side.get("team") or {}
                board = (wanted.get(str(team.get("abbreviation") or "").upper())
                         or wanted.get(_norm(team.get("location") or "")))
                if board and board not in out:
                    out[board] = {}
                    pending.append((board, str(event.get("id")), str(team.get("id") or ""),
                                    event.get("date") or ""))
        if len(out) >= len(set(wanted.values())):
            break
    with ThreadPoolExecutor(max_workers=8) as pool:
        boxes = list(pool.map(lambda p: _box_players(p[1]), pending))
    for (board, _event, tid, date), box in zip(pending, boxes):
        mine = (box or {}).get(tid)
        if not mine:
            out.pop(board, None)
            continue
        out[board] = {"date": date,
                      "passers": sorted(mine["passers"], key=lambda p: -p[2]),
                      "appeared": mine["appeared"]}
    return out


def _num(text) -> float | None:
    try:
        return float(str(text).replace(",", ""))
    except (TypeError, ValueError):
        return None


# (field, better) for the game-log figures, each ranked among every FBS team
# that played that week, and the season row among all FBS teams.
LOG_STATS = (("points", "high"), ("opponent_points", "low"), ("total_yards", "high"),
             ("passing_yards", "high"), ("rushing_yards", "high"), ("turnovers", "low"),
             ("third_down_rate", "high"))


def _ranked(pool: list[float], value, better: str) -> dict | None:
    if value is None:
        return None
    out = {"value": round(float(value), 4)}
    if len(pool) > 1:
        place = rank(pool, float(value), better)
        if place <= len(pool):
            out.update(rank=place, of=len(pool))
    return out


def game_logs(season: int, through_week: int, wanted: dict[str, str],
              fbs: set[str] | None = None) -> dict[str, dict]:
    """{board abbreviation: {"games": [...], "season": {...}}} for the slate.

    Every FBS game is read so each figure can be ranked against the whole
    week; ``wanted`` maps ESPN abbreviation or normalized school -> board
    abbreviation for the schools that are published.
    """
    raw: dict[str, list[dict]] = {}       # ESPN team id -> games
    names: dict[str, tuple[str, str]] = {}  # ESPN team id -> (abbr, location)
    for week in range(1, max(1, through_week)):
        for event in _week_events(season, week):
            if not ((event.get("status") or {}).get("type") or {}).get("completed"):
                continue
            comp = (event.get("competitions") or [{}])[0]
            sides = comp.get("competitors") or []
            if len(sides) != 2:
                continue
            box = _box(str(event.get("id"))) or {"teams": {}}
            for me in sides:
                team = me.get("team") or {}
                tid = str(team.get("id") or "")
                opp = next(c for c in sides if c is not me)
                mine = box["teams"].get(tid) or {}
                pts, opp_pts = _num(me.get("score")), _num(opp.get("score"))
                third = str(mine.get("thirdDownEff") or "")
                made_att = re.fullmatch(r"(\d+)-(\d+)", third)
                names[tid] = (str(team.get("abbreviation") or "").upper(), team.get("location") or "")
                raw.setdefault(tid, []).append({
                    "week": week, "date": event.get("date"),
                    "opponent": (opp.get("team") or {}).get("abbreviation"),
                    "opponent_name": (opp.get("team") or {}).get("location"),
                    "home": me.get("homeAway") == "home", "neutral": bool(comp.get("neutralSite")),
                    "result": None if pts is None or opp_pts is None else
                    ("W" if pts > opp_pts else "L" if pts < opp_pts else "T"),
                    "points": pts, "opponent_points": opp_pts,
                    "total_yards": _num(mine.get("totalYards")),
                    "passing_yards": _num(mine.get("netPassingYards")),
                    "rushing_yards": _num(mine.get("rushingYards")),
                    "turnovers": _num(mine.get("turnovers")),
                    "third_down": third if made_att else None,
                    "third_down_rate": (int(made_att.group(1)) / int(made_att.group(2))
                                        if made_att and int(made_att.group(2)) else None),
                })
    # Week pools, then rank every game's figures in place. Pools are FBS
    # teams only (an FCS opponent's line is not a peer); with no FBS list
    # every team counts.
    def is_fbs(tid: str) -> bool:
        return not fbs or _norm(names[tid][1]) in fbs
    by_week: dict[int, list[dict]] = {}
    for tid, games in raw.items():
        if not is_fbs(tid):
            continue
        for g in games:
            by_week.setdefault(g["week"], []).append(g)
    for games in by_week.values():
        for field, better in LOG_STATS:
            pool = [g[field] for g in games if g.get(field) is not None]
            for g in games:
                g[field] = _ranked(pool, g.get(field), better)
    # Season averages, ranked among every FBS team with games.
    season_rows: dict[str, dict] = {}
    for tid, games in raw.items():
        row = {"games": len(games)}
        for field, _b in LOG_STATS:
            vals = [g[field]["value"] if isinstance(g[field], dict) else g[field]
                    for g in games if g.get(field) is not None]
            row[field] = sum(vals) / len(vals) if vals else None
        season_rows[tid] = row
    for field, better in LOG_STATS:
        pool = [r[field] for tid, r in season_rows.items() if r[field] is not None and is_fbs(tid)]
        for tid, row in season_rows.items():
            row[field] = _ranked(pool if is_fbs(tid) else [], row[field], better)
    out: dict[str, dict] = {}
    for tid, games in raw.items():
        abbr, location = names[tid]
        board = wanted.get(abbr) or wanted.get(_norm(location))
        if not board:
            continue
        out[board] = {"games": sorted(games, key=lambda g: (g["week"], g["date"] or "")),
                      "season": season_rows[tid]}
    return out


# -- strength of schedule (CFBD: the season's games, ESPN FPI and SP+) -----------
def schedule_strength(season: int, sp_ratings: dict[str, float]) -> dict[str, dict]:
    """{normalized school: {...}}: how hard each FBS school's schedule has been
    and will be - its FBS opponents' average SP+ rating, average ESPN FPI
    rating and combined win rate, over games played and games remaining. Each
    figure carries its value and its rank of FBS (1st = the hardest).

    ESPN's own SOS ranks are published without the number they rank, so they
    are not shown: a rank the reader cannot check against a value is not
    published on this site.

    ``sp_ratings`` maps normalized school -> SP+ overall rating.
    """
    fpi = espn_fpi(season)
    games = season_games(season)
    fbs = set(sp_ratings) | set(fpi)
    wins: dict[str, list[int]] = {}
    for g in games:
        if g.get("completed") is not True:
            continue
        home, away = _norm(g.get("homeTeam")), _norm(g.get("awayTeam"))
        hp, ap = g.get("homePoints"), g.get("awayPoints")
        if not isinstance(hp, (int, float)) or not isinstance(ap, (int, float)) or hp == ap:
            continue
        for me, won in ((home, hp > ap), (away, ap > hp)):
            wins.setdefault(me, []).append(1 if won else 0)
    win_rate = {team: sum(v) / len(v) for team, v in wins.items() if v}
    opponents: dict[str, dict[str, list[str]]] = {}
    for g in games:
        home, away = _norm(g.get("homeTeam")), _norm(g.get("awayTeam"))
        window = "played" if g.get("completed") is True else "remaining"
        for me, opp in ((home, away), (away, home)):
            if me in fbs and opp in fbs:
                opponents.setdefault(me, {}).setdefault(window, []).append(opp)
    specs = (("sp", "Opponents' average SP+", sp_ratings, "num"),
             ("fpi", "Opponents' average FPI", fpi, "num"),
             ("win_rate", "Opponents' combined win rate", win_rate, "pct"))
    out: dict[str, dict] = {}
    for window in ("played", "remaining"):
        for key, label, table, fmt in specs:
            values = {}
            for team, lists in opponents.items():
                rated = [table[o] for o in lists.get(window, []) if o in table]
                if rated:
                    values[team] = (sum(rated) / len(rated), len(rated))
            pool = [v for v, _ in values.values()]
            for team, (value, n) in values.items():
                entry = _entry(f"{label} ({window})", value, "high", fmt, pool)
                if entry:
                    entry["games"] = n
                    out.setdefault(team, {}).setdefault(window, {})[key] = entry
    return out
