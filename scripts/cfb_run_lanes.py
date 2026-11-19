"""CFB ball carriers by run lane (2026-11-19).

The official scorer names the runner and the lane on every carry in ESPN's
game summaries ("#24 C.Hawkins rush right for 6 yards"). Each school's
carriers are split by lane (left, middle, right):
- carries;
- share of the school's runs that way;
- yards per rush;
- success rate (half the distance on 1st down, 70% on 2nd, all of it on
  3rd and 4th);
- 10+ yard rate.

Each rate is ranked among FBS ball carriers with at least LANE_FLOOR carries
that way.

A run nullified by a foul ("NO PLAY") is not counted. Every final is read
once and cached. ESPN, not CFBD: the CFBD call budget is shared with the rest
of the CFB desk.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_charting
    import cfb_depth
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_charting, cfb_depth

USER_AGENT = "ChaseAnalytics/1.0"  # ESPN refuses a user agent that carries a URL
CACHE_VERSION = 1
LANES = ("left", "middle", "right")
LANE_FLOOR = 12      # carries that way before a carrier is ranked
MIN_CARRIES = 3      # carries that way before a carrier is listed in the lane
RUN = re.compile(r"#\d+\s+(?P<name>[^#(]+?)\s+rush(?:es)?\s+(?P<lane>left|middle|right)\s+for\b", re.I)


def _success(down, distance, gained) -> bool:
    if not down or distance is None:
        return False
    if down == 1:
        return gained >= 0.5 * distance
    if down == 2:
        return gained >= 0.7 * distance
    return gained >= distance


def parse_game(payload: dict) -> dict | None:
    """{"teams": {ESPN id: {name key: {"name", lane: [car, yds, success, explosive]}}}}."""
    plays = [p for d in ((payload.get("drives") or {}).get("previous") or []) for p in d.get("plays") or []]
    if not plays:
        return None
    teams: dict[str, dict] = defaultdict(dict)
    for p in plays:
        text = p.get("text") or ""
        m = RUN.search(text)
        if not m or "NO PLAY" in text.upper():
            continue
        team = str(((p.get("start") or {}).get("team") or {}).get("id") or "")
        key = cfb_charting.name_key(m.group("name"))
        if not team or not key:
            continue
        try:
            gained = int(p.get("statYardage") or 0)
        except (TypeError, ValueError):
            continue
        start = p.get("start") or {}
        lane = m.group("lane").lower()
        row = teams[team].setdefault(key, {"name": m.group("name").strip(), **{x: [0, 0, 0, 0] for x in LANES}})
        cell = row[lane]
        cell[0] += 1
        cell[1] += gained
        cell[2] += _success(start.get("down"), start.get("distance"), gained)
        cell[3] += gained >= 10
    return {"teams": dict(teams)}


def _game(event_id: str) -> dict | None:
    name = f"runlanes_{event_id}.json"
    hit = cfb_depth._cached(name)
    if hit and hit.get("version") == CACHE_VERSION:
        return hit
    try:
        req = urllib.request.Request(f"{cfb_depth.ESPN}/summary?event={event_id}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 - one game missing leaves the season one game short
        return None
    parsed = parse_game(payload)
    if parsed:
        parsed["version"] = CACHE_VERSION
        cfb_depth._store(name, parsed)
    return parsed


def build(season: int, through_week: int, wanted: dict[str, str], fbs: set[str] | None = None) -> dict[str, dict]:
    """{board abbreviation: {"lanes": {lane: team runs}, "carriers": [...]}} over every
    completed game through the week."""
    events, names = [], {}
    for week in range(1, max(1, through_week) + 1):
        for event in cfb_depth._week_events(season, week):
            if not ((event.get("status") or {}).get("type") or {}).get("completed"):
                continue
            for c in ((event.get("competitions") or [{}])[0].get("competitors") or []):
                team = c.get("team") or {}
                names[str(team.get("id") or "")] = (str(team.get("abbreviation") or "").upper(), team.get("location") or "")
            events.append(str(event.get("id")))
    with ThreadPoolExecutor(max_workers=6) as pool:
        games = [g for g in pool.map(_game, events) if g]
    totals: dict[str, dict] = defaultdict(dict)   # ESPN team id -> name key -> sums
    for g in games:
        for team, carriers in g["teams"].items():
            for key, row in carriers.items():
                into = totals[team].setdefault(key, {"name": row["name"], **{x: [0, 0, 0, 0] for x in LANES}})
                for lane in LANES:
                    into[lane] = [a + b for a, b in zip(into[lane], row[lane])]

    def is_fbs(tid: str) -> bool:
        return not fbs or cfb_depth._norm(names.get(tid, ("", ""))[1]) in fbs
    # Lane pools: every FBS carrier with LANE_FLOOR carries that way.
    pools: dict[tuple, list[float]] = defaultdict(list)
    for tid, carriers in totals.items():
        if not is_fbs(tid):
            continue
        for row in carriers.values():
            for lane in LANES:
                car, yds, succ, expl = row[lane]
                if car >= LANE_FLOOR:
                    pools[(lane, "ypc")].append(yds / car)
                    pools[(lane, "success")].append(succ / car)
                    pools[(lane, "explosive")].append(expl / car)
    out: dict[str, dict] = {}
    for tid, carriers in totals.items():
        abbr, location = names.get(tid, ("", ""))
        board = wanted.get(abbr) or wanted.get(cfb_depth._norm(location))
        if not board:
            continue
        team_runs = {lane: sum(r[lane][0] for r in carriers.values()) for lane in LANES}
        listed = []
        for key, row in sorted(carriers.items(), key=lambda kv: -sum(kv[1][x][0] for x in LANES)):
            lanes = {}
            for lane in LANES:
                car, yds, succ, expl = row[lane]
                if car < MIN_CARRIES:
                    continue
                ranked = car >= LANE_FLOOR and is_fbs(tid)

                def entry(label, value, fmt, stat):
                    return cfb_depth._entry(f"Runs {lane}: {label}", value, "high", fmt,
                                            pools[(lane, stat)] if ranked else [])
                lanes[lane] = {"carries": car, "share": round(car / team_runs[lane], 4) if team_runs[lane] else None,
                               "qualified": ranked, "ypc": entry("Yards per rush", yds / car, "num", "ypc"),
                               "success": entry("Success rate", succ / car, "pct", "success"),
                               "explosive": entry("10+ yard rate", expl / car, "pct", "explosive")}
            if lanes:
                listed.append({"key": key, "name": row["name"], "carries": sum(row[x][0] for x in LANES), "lanes": lanes})
        out[board] = {"games": sum(1 for g in games if tid in g["teams"]), "lanes": team_runs, "carriers": listed[:8]}
    print(f"  run lanes: {len(games)} of {len(events)} finals read, {len(out)} schools published")
    return out
