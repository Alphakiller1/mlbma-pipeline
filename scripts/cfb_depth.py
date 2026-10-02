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

import json
import os
import re
import urllib.parse
import urllib.request
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


def _get(url: str, headers: dict | None = None) -> object:
    last: Exception | None = None
    for agent in AGENTS if "espn" in url else (None,):
        h = dict(headers or {})
        if agent:
            h["User-Agent"] = agent
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # an edge 403 or a timeout: try the next agent
            last = exc
    raise last if last else RuntimeError(url)


def cfbd(path: str, **params) -> list | dict | None:
    key = os.environ.get("CFBD_API_KEY")
    if not key:
        return None
    url = f"{CFBD}{path}?{urllib.parse.urlencode(params)}"
    try:
        return _get(url, {"Authorization": f"Bearer {key}", "Accept": "application/json"})
    except Exception as exc:
        print(f"  CFBD {path} unavailable: {exc}")
        return None


def rank(pool: list[float], value: float, better: str) -> int:
    if better == "low":
        return 1 + sum(1 for other in pool if other < value - 1e-12)
    return 1 + sum(1 for other in pool if other > value + 1e-12)


def _entry(label: str, value, better: str, fmt: str, pool: list[float]) -> dict | None:
    if value is None:
        return None
    v = float(value)
    out = {"label": label, "value": round(v, 4), "better": better, "format": fmt}
    if pool:
        out["rank"] = rank(pool, v, "high" if better == "neutral" else better)
        out["of"] = len(pool)
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
                    entry = _entry(label if side == "offense" else label + " allowed"
                                   if better != "neutral" else "Opponent " + label.lower(),
                                   value, better, fmt, pools[prefix + suffix])
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
            e = _entry(label, d[name], better, fmt, pools[name])
            if e:
                line[name] = e
        splits = {}
        avg = (ppa.get(key) or {}).get("averagePPA") or {}
        for split, label in PPA_SPLITS:
            e = _entry(label + " EPA per play", avg.get(split), "high", "ppa", ppa_splits_pool(split))
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
            e = _entry(label, value(v, name, field), better, fmt, pools[name])
            if e:
                row[name] = e
        out.setdefault(key[0], []).append(row)
    for school in out:
        out[school].sort(key=lambda r: -r["carries"])
        out[school] = out[school][:4]
    return out


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
    return {"value": round(float(value), 4), "rank": rank(pool, float(value), better), "of": len(pool)}


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
        for r in season_rows.values():
            r[field] = _ranked(pool, r[field], better)
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
    fpi_rows = cfbd("/ratings/fpi", year=season)
    fpi = {_norm(r.get("team")): r.get("fpi") for r in (fpi_rows if isinstance(fpi_rows, list) else [])
           if isinstance(r.get("fpi"), (int, float))}
    games = cfbd("/games", year=season, seasonType="regular")
    games = games if isinstance(games, list) else []
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
