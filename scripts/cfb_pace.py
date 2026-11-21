"""CFB pace and possession (2026-11-21), from ESPN's game summaries: the
NFL desk's pace table, read the same way (outputs/nfl_advanced_context.py
_pace) on the official play-by-play every college game carries.

For each offense, and for the plays run against each defense:

* snaps per game (scrimmage plays: runs, passes, sacks and the turnovers on
  them), over the full game, each half, while leading, while trailing and in
  neutral situations (win probability 20-80%, not the last two minutes of a
  half);
* seconds per snap: the game-clock seconds between consecutive snaps of one
  drive in one quarter, a gap over a minute dropped as a stoppage (a timeout,
  an injury, a review), in the same situations;
* time of possession per game: the drives' elapsed clock, full game and by
  half.

Leading and trailing are the possession team's score before the snap, so for
a defense's plays "leading" means the offense facing it led. Win probability
is ESPN's home figure after the play before.

Ranked among FBS schools. Tempo is a style, not a verdict: an offense's
seconds per snap rank fastest first and its snaps and possession most first,
all neutral. What a defense faces is volume it allows, so its snaps and
possession faced rank fewest first (owner 2026-11-12: colour follows what
the unit wants); the tempo it faces is neutral, fastest first. Its snaps
faced while the offense leads, trails or sits in a neutral game are game
state, not defending - a good team's defense faces the most trailing snaps
because its opponents are behind - so those splits are neutral, most first.

ESPN, not CFBD: no allowance is spent. Each final is read once and cached.
"""
from __future__ import annotations

import json
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_depth
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_depth

USER_AGENT = "ChaseAnalytics/1.0"  # ESPN refuses a user agent that carries a URL
CACHE_VERSION = 1
MAX_SNAP_GAP = 60
SITUATIONS = ("", "_h1", "_h2", "_leading", "_trailing", "_neutral")
SNAPS = {"Rush", "Pass Reception", "Pass Incompletion", "Sack", "Rushing Touchdown", "Passing Touchdown",
         "Pass Interception Return", "Interception", "Interception Return Touchdown", "Pass Interception",
         "Fumble Recovery (Own)", "Fumble Recovery (Opponent)", "Fumble Return Touchdown", "Fumble",
         "Pass Completion", "Pass", "Safety"}
SITUATION_LABEL = {"": "full game", "_h1": "1st half", "_h2": "2nd half", "_leading": "leading",
                   "_trailing": "trailing", "_neutral": "neutral situations"}


def _clock(text) -> int | None:
    """'2:35' -> 155 seconds."""
    try:
        minutes, seconds = str(text).split(":")
        return int(minutes) * 60 + int(seconds)
    except (ValueError, AttributeError):
        return None


def parse_game(payload: dict) -> dict | None:
    """{"teams": {ESPN team id: counts}} for one final: snaps, clock gaps and
    their count by situation, and possession seconds by half."""
    comp = ((payload.get("header") or {}).get("competitions") or [{}])[0]
    sides = {c.get("homeAway"): str((c.get("team") or {}).get("id") or "") for c in comp.get("competitors") or []}
    if set(sides) != {"home", "away"} or not all(sides.values()):
        return None
    home, away = sides["home"], sides["away"]
    drives = ((payload.get("drives") or {}).get("previous")) or []
    if not drives:
        return None
    wp = {str(w.get("playId")): w.get("homeWinPercentage") for w in payload.get("winprobability") or []}
    counts = {home: Counter(), away: Counter()}
    scores = {home: 0, away: 0}
    last_wp = 0.5
    for drive in drives:
        offense = str((drive.get("team") or {}).get("id") or "")
        if offense in counts:
            period = (((drive.get("start") or {}).get("period")) or {}).get("number")
            elapsed = _clock((drive.get("timeElapsed") or {}).get("displayValue"))
            if elapsed is not None and period in (1, 2, 3, 4):
                counts[offense]["top"] += elapsed
                counts[offense]["top_h1" if period <= 2 else "top_h2"] += elapsed
        previous = None  # the drive's last snap: (period, clock)
        for play in drive.get("plays") or []:
            kind = ((play.get("type") or {}).get("text")) or ""
            team = str((((play.get("start") or {}).get("team")) or {}).get("id") or offense)
            period = (play.get("period") or {}).get("number")
            clock = _clock((play.get("clock") or {}).get("displayValue"))
            if kind in SNAPS and team in counts and "NO PLAY" not in str(play.get("text") or "").upper():
                other = away if team == home else home
                margin = scores[team] - scores[other]
                masks = {""}
                if period in (1, 2):
                    masks.add("_h1")
                elif period in (3, 4):
                    masks.add("_h2")
                if margin > 0:
                    masks.add("_leading")
                elif margin < 0:
                    masks.add("_trailing")
                late = period in (2, 4) and clock is not None and clock <= 120
                if period in (1, 2, 3, 4) and 0.2 <= last_wp <= 0.8 and not late:
                    masks.add("_neutral")
                gap = None
                if previous and previous[0] == period and previous[1] is not None and clock is not None:
                    gap = previous[1] - clock
                for s in masks:
                    counts[team]["snaps" + s] += 1
                    if gap is not None and 0 < gap <= MAX_SNAP_GAP:
                        counts[team]["gap" + s] += gap
                        counts[team]["gaps" + s] += 1
                previous = (period, clock)
            # The score and win probability a later snap starts from.
            for side, key in ((home, "homeScore"), (away, "awayScore")):
                if isinstance(play.get(key), (int, float)):
                    scores[side] = play[key]
            if isinstance(wp.get(str(play.get("id"))), (int, float)):
                last_wp = wp[str(play.get("id"))]
    if not counts[home]["snaps"] or not counts[away]["snaps"]:
        return None
    return {"teams": {tid: dict(c) for tid, c in counts.items()}}


def _game(event_id: str) -> dict | None:
    name = f"pace_{event_id}.json"
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


def figures(mine: Counter, theirs: Counter, games: int) -> dict[str, float | None]:
    """A school's pace from its own offense's counts and its opponents'."""
    out: dict[str, float | None] = {}
    for prefix, c in (("off", mine), ("def", theirs)):
        for s in SITUATIONS:
            out[f"{prefix}_ppg{s}"] = c.get("snaps" + s, 0) / games if games else None
            out[f"{prefix}_spp{s}"] = c["gap" + s] / c["gaps" + s] if c.get("gaps" + s) else None
        for s in ("", "_h1", "_h2"):
            out[f"{prefix}_top{s}"] = c.get("top" + s, 0) / games / 60 if games else None
    return out


def _spec(key: str) -> tuple[str, str, str, str]:
    """(label, better, format, rank direction) for a figure key."""
    prefix, measure = key[:3], key[4:7]
    situation = SITUATION_LABEL[key[7:]]
    if measure == "spp":
        label = ("Seconds per snap" if prefix == "off" else "Seconds per snap faced") + ", " + situation
        return label, "neutral", "num", "low"          # tempo: neutral, fastest first
    if measure == "ppg":
        label = ("Snaps per game" if prefix == "off" else "Snaps faced per game") + ", " + situation
        game_state = key[7:] in ("_leading", "_trailing", "_neutral")
        return (label, "neutral", "num", "high") if prefix == "off" or game_state else (label, "low", "num", "low")
    label = ("Time of possession per game (minutes)" if prefix == "off"
             else "Opponents' time of possession per game (minutes)") + ", " + situation
    return (label, "neutral", "clock", "high") if prefix == "off" else (label, "low", "clock", "low")


def _ranked(label: str, value, better: str, fmt: str, direction: str, pool: list[float]) -> dict | None:
    if value is None:
        return None
    out = {"label": label, "value": round(float(value), 3), "better": better, "format": fmt}
    if len(pool) > 1:
        out.update(rank=cfb_depth.rank(pool, float(value), direction), of=len(pool))
        if better == "neutral":
            # A neutral figure says which way it is placed (fastest, most).
            out["rank_word"] = "fastest" if direction == "low" else "most"
    return out


def build(season: int, through_week: int, wanted: dict[str, str], fbs: set[str] | None = None) -> dict[str, dict]:
    """{board abbreviation: {"rates": {figure: ranked entry}, "games": n}} over
    every completed game through the week, ranked among FBS schools."""
    events, names = [], {}
    for week in range(1, max(1, through_week) + 1):
        for event in cfb_depth._week_events(season, week):
            if not ((event.get("status") or {}).get("type") or {}).get("completed"):
                continue
            comp = (event.get("competitions") or [{}])[0]
            sides = comp.get("competitors") or []
            if len(sides) != 2:
                continue
            for c in sides:
                team = c.get("team") or {}
                names[str(team.get("id") or "")] = (str(team.get("abbreviation") or "").upper(), team.get("location") or "")
            events.append(str(event.get("id")))
    with ThreadPoolExecutor(max_workers=6) as pool:
        games = [g for g in pool.map(_game, events) if g]
    mine: dict[str, Counter] = defaultdict(Counter)
    theirs: dict[str, Counter] = defaultdict(Counter)
    played: Counter = Counter()
    for g in games:
        ids = list(g["teams"])
        for me in ids:
            other = next(i for i in ids if i != me)
            mine[me].update(g["teams"][me])
            theirs[me].update(g["teams"][other])
            played[me] += 1

    def is_fbs(tid: str) -> bool:
        return not fbs or cfb_depth._norm(names.get(tid, ("", ""))[1]) in fbs
    values = {tid: figures(mine[tid], theirs[tid], played[tid]) for tid in played if played[tid]}
    keys = next(iter(values.values())).keys() if values else []
    pools = {k: [v[k] for tid, v in values.items() if is_fbs(tid) and v[k] is not None] for k in keys}
    out: dict[str, dict] = {}
    for tid, figs in values.items():
        abbr, location = names.get(tid, ("", ""))
        board = wanted.get(abbr) or wanted.get(cfb_depth._norm(location))
        if not board:
            continue
        rates = {}
        for k, v in figs.items():
            label, better, fmt, direction = _spec(k)
            entry = _ranked(label, v, better, fmt, direction, pools[k] if is_fbs(tid) else [])
            if entry:
                rates[k] = entry
        out[board] = {"rates": rates, "games": played[tid]}
    print(f"  pace: {len(games)} of {len(events)} finals read, {len(out)} schools published")
    return out
