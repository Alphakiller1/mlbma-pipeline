"""CFB charting from the official scorer's play-by-play (2026-11-18).

CFBD's 2026 play text is the official scorer's charting:

  "(12:54) Shotgun #5 W.Watson III pass complete deep right to #83 R.Adkins
   caught at UC38, for 24 yards to the UC38 QB hurried by #15 A.Luqman"

Every FBS game carries the formation ("Shotgun", "No Huddle-Shotgun", nothing
for under center), pass depth and direction ("short right", "deep left"), the
run direction ("rush left/middle/right"), the catch or target spot ("caught
at", "thrown to") and the scorer's pressure tag ("QB hurried by"). Measured on
weeks 3, 8 and 11 of 2026: 97% of passes and runs carry a direction, every
game tags formation, 95% of games chart hurries.

No public CFB source has coverage (man/zone, shells) or blocking-scheme tags;
these are the measured scheme facts that are public. A week is parsed into
additive sums per offense, defense and passer and cached, so a run fetches
only the weeks still moving.

Garbage time is excluded (cfbfastR/CFBD rule: 2nd quarter by more than 38,
3rd by 28, 4th by 22).
"""
from __future__ import annotations

import json
import re
import time
from collections import Counter, defaultdict

try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_depth
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_depth

_entry, _norm, cfbd = cfb_depth._entry, cfb_depth._norm, cfb_depth.cfbd

CACHE_VERSION = 2

SCRIMMAGE = {
    "Rush", "Rushing Touchdown", "Pass Reception", "Pass Incompletion", "Passing Touchdown",
    "Sack", "Interception", "Pass Interception Return", "Interception Return Touchdown",
    "Pass Interception", "Fumble Recovery (Own)", "Fumble Recovery (Opponent)", "Fumble",
    "Safety",
}
PASS_RE = re.compile(r"#\d+\s+(?P<name>[^#]+?)\s+pass\s+(?P<result>complete|incomplete|intercepted)"
                     r"(?:\s+(?P<depth>short|deep)\s+(?P<dir>left|middle|right))?", re.I)
SACK_RE = re.compile(r"#\d+\s+(?P<name>[^#]+?)\s+sacked\b", re.I)
RUSH_RE = re.compile(r"\brush(?:es)?\s+(?P<dir>left|middle|right)?\s*for\b", re.I)
SPOT_RE = re.compile(r"\b(?:caught at|thrown to)\s+(?P<tok>[A-Za-z][A-Za-z'.&-]*?)\s?(?P<yd>\d{1,2})\b")
END_RE = re.compile(r"\bto the\s+(?P<tok>[A-Za-z][A-Za-z'.&-]*?)\s?(?P<yd>\d{1,2})\b")
HURRY_RE = re.compile(r"QB hurried by", re.I)
FORMATION_RE = re.compile(r"^(?:\(\d{1,2}:\d{2}\)\s*)?(?P<pre>(?:No Huddle-)?Shotgun|No Huddle)?\s*#", re.I)
SUFFIX = {"jr", "sr", "ii", "iii", "iv", "v"}

DEPTHS = ("short", "deep")
DIRS = ("left", "middle", "right")
# Passer looks: what each dropback is counted under.
LOOKS = ("all", "short", "deep", "left", "middle", "right", "clean", "pressured",
         "shotgun", "under_center")


def name_key(name: str | None) -> str | None:
    """'W.Watson III' / 'William Watson III' -> 'w|watson'."""
    if not name:
        return None
    text = str(name).replace(".", ". ").strip()
    parts = [p for p in re.split(r"\s+", text) if p]
    parts = [p for p in parts if _norm(p) not in SUFFIX]
    if len(parts) < 2:
        return None
    first, last = _norm(parts[0])[:1], _norm(parts[-1])
    return f"{first}|{last}" if first and last else None


def _garbage(play: dict) -> bool:
    try:
        margin = abs(float(play.get("offenseScore") or 0) - float(play.get("defenseScore") or 0))
        period = int(play.get("period") or 0)
    except (TypeError, ValueError):
        return False
    return (period == 2 and margin > 38) or (period == 3 and margin > 28) or (period >= 4 and margin > 22)


def _success(play: dict, gained: float) -> bool:
    down, dist = play.get("down"), play.get("distance")
    if not down or dist is None:
        return False
    if down == 1:
        return gained >= 0.5 * dist
    if down == 2:
        return gained >= 0.7 * dist
    return gained >= dist


def _sides(plays: list[dict]) -> dict[tuple, str]:
    """Which school each spot prefix belongs to, game by game: the end spot of
    a clean gain ("to the TEXAS43") sits either on the defense's side
    (yards-to-goal = 43) or the offense's (= 57)."""
    votes: dict[tuple, Counter] = defaultdict(Counter)
    for p in plays:
        text = p.get("playText") or ""
        if p.get("playType") not in ("Rush", "Pass Reception") or re.search(r"PENALTY|fumble|NO PLAY", text, re.I):
            continue
        m = END_RE.search(text)
        y0, gained = p.get("yardsToGoal"), p.get("yardsGained")
        if not m or y0 is None or gained is None:
            continue
        yd = int(m.group("yd"))
        if yd == 50:
            continue
        end = y0 - gained
        if yd == end:
            votes[(p.get("gameId"), m.group("tok"))][p.get("defense")] += 1
        elif 100 - yd == end:
            votes[(p.get("gameId"), m.group("tok"))][p.get("offense")] += 1
    return {k: c.most_common(1)[0][0] for k, c in votes.items() if c}


def parse_week(plays: list[dict]) -> dict:
    """Additive sums for one week: {"teams": {school: {"off": {...}, "def": {...}}},
    "passers": {"school|name_key": {look: {...}}}}."""
    owners = _sides(plays)
    teams: dict[str, dict[str, Counter]] = defaultdict(lambda: {"off": Counter(), "def": Counter()})
    passers: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    names: dict[str, str] = {}
    for p in plays:
        ptype = p.get("playType")
        text = p.get("playText") or ""
        if ptype not in SCRIMMAGE or "NO PLAY" in text.upper() or _garbage(p):
            continue
        offense, defense = p.get("offense"), p.get("defense")
        if not offense or not defense:
            continue
        gained = float(p.get("yardsGained") or 0)
        ppa = p.get("ppa")
        ppa = float(ppa) if isinstance(ppa, (int, float)) else None
        fm = FORMATION_RE.match(text)
        pre = (fm.group("pre") or "").lower() if fm else ""
        formation = "shotgun" if "shotgun" in pre else "under_center"
        no_huddle = "no huddle" in pre
        pm, sm = PASS_RE.search(text), SACK_RE.search(text)
        rm = None if (pm or sm) else RUSH_RE.search(text)
        if not (pm or sm or rm) or "kneel" in text.lower():
            continue
        kind = "pass" if pm else ("sack" if sm else "rush")
        rows = (teams[_norm(offense)]["off"], teams[_norm(defense)]["def"])
        scored = "TOUCHDOWN" in text.upper() and kind != "sack" and ptype != "Interception Return Touchdown"
        success = _success(p, gained) or scored

        def add(key: str, value: float = 1.0):
            for row in rows:
                row[key] += value

        def add_ppa(prefix: str):
            if ppa is not None:
                add(prefix + "_ppa", ppa)
                add(prefix + "_ppa_n")

        add("plays")
        add(formation + "_n")
        add_ppa(formation)
        if no_huddle:
            add("no_huddle_n")
        if kind == "rush":
            add("rush_n")
            add(formation + "_rush")
            direction = (rm.group("dir") or "").lower()
            if direction:
                add(f"run_{direction}_n")
                add(f"run_{direction}_yds", gained)
                add_ppa(f"run_{direction}")
                if success:
                    add(f"run_{direction}_succ")
            continue
        # A dropback: a pass or a sack.
        hurried = bool(HURRY_RE.search(text)) or kind == "sack"
        add("db")
        add_ppa("pressured" if hurried else "clean")
        add("pressured_n" if hurried else "clean_n")
        name = (pm or sm).group("name").strip()
        key = name_key(name)
        pkey = f"{_norm(offense)}|{key}" if key else None
        if pkey:
            names[pkey] = name
        looks = ["all", "pressured" if hurried else "clean", formation]
        if kind == "sack":
            if pkey:
                for look in looks:
                    q = passers[pkey][look]
                    q["db"] += 1
                    if ppa is not None:
                        q["ppa"] += ppa
                        q["ppa_n"] += 1
            continue
        result = pm.group("result").lower()
        complete = result == "complete"
        intercepted = result == "intercepted"
        td = complete and "TOUCHDOWN" in text.upper()
        yards = gained if complete else 0.0
        depth = (pm.group("depth") or "").lower()
        direction = (pm.group("dir") or "").lower()
        add("att")
        add("comp", complete)
        add("yds", yards)
        if depth:
            add(f"{depth}_att")
            add(f"{depth}_comp", complete)
            add(f"{depth}_yds", yards)
            add_ppa(depth)
            looks.append(depth)
        if direction:
            add(f"{direction}_att")
            add(f"{direction}_comp", complete)
            add(f"{direction}_yds", yards)
            add_ppa(direction)
            looks.append(direction)
        spot = SPOT_RE.search(text)
        y0 = p.get("yardsToGoal")
        if spot and y0 is not None:
            owner = owners.get((p.get("gameId"), spot.group("tok")))
            yd = int(spot.group("yd"))
            target = yd if owner == defense else (100 - yd if owner == offense else None)
            if target is not None:
                air = y0 - target
                if -15 <= air <= 75:
                    add("air_n")
                    add("air_sum", air)
                    if complete and not re.search(r"fumble|PENALTY", text, re.I):
                        add("cair_n")
                        add("yac_sum", yards - air)
        if pkey:
            for look in looks:
                q = passers[pkey][look]
                q["db"] += 1
                q["att"] += 1
                q["comp"] += complete
                q["yds"] += yards
                q["td"] += td
                q["int"] += intercepted
                if ppa is not None:
                    q["ppa"] += ppa
                    q["ppa_n"] += 1
    return {
        "teams": {k: {"off": dict(v["off"]), "def": dict(v["def"])} for k, v in teams.items()},
        "passers": {k: {look: dict(c) for look, c in v.items()} for k, v in passers.items()},
        "names": names,
    }


def _week(season: int, week: int, refresh: bool) -> dict | None:
    name = f"charting_{season}_w{week}.json"
    hit = cfb_depth._cached(name)
    # The fetch time rides inside the file: a restored Actions cache does not
    # promise file times, and a week that looked fresh forever would never
    # pick up its late games or stat corrections.
    # Current while no game in the week has finished since the fetch (CFBD
    # allowance, cfb_depth); MAX_AGE_HOURS when the schedule is unknown.
    fresh = bool(hit) and cfb_depth._fresh(hit.get("fetched_at"), cfb_depth.changed_at(season, week))
    if hit and hit.get("version") == CACHE_VERSION and (not refresh or fresh):
        return hit
    plays = cfbd("/plays", store=False, year=season, week=week, classification="fbs")
    if not isinstance(plays, list) or not plays:
        return hit if hit and hit.get("version") == CACHE_VERSION else None
    parsed = parse_week(plays)
    parsed.update(version=CACHE_VERSION, season=season, week=week, plays=len(plays), fetched_at=time.time())
    cfb_depth._store(name, parsed)
    return parsed


def season_sums(season: int, through_week: int) -> tuple[dict, dict, dict, int]:
    """Sum every week through ``through_week``. The last two weeks refresh
    (stat corrections, late games); earlier weeks come from the cache."""
    teams: dict[str, dict[str, Counter]] = defaultdict(lambda: {"off": Counter(), "def": Counter()})
    passers: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
    names: dict[str, str] = {}
    weeks = 0
    for week in range(1, max(1, through_week) + 1):
        parsed = _week(season, week, refresh=week >= through_week - 1)
        if not parsed:
            continue
        weeks += 1
        for school, sides in parsed["teams"].items():
            teams[school]["off"].update(sides["off"])
            teams[school]["def"].update(sides["def"])
        for pkey, looks in parsed["passers"].items():
            for look, c in looks.items():
                passers[pkey][look].update(c)
        names.update(parsed.get("names") or {})
    return teams, passers, names, weeks


def _q(c: Counter, num: str, den: str, floor: float = 1):
    d = c.get(den, 0)
    return c.get(num, 0) / d if d >= floor else None


# (rate key, label, value fn over a side's sums, offense better, defense
#  better, format, floor key, floor). "neutral" is a tendency, ranked by most.
def _team_specs():
    specs = []
    for depth, floor in (("short", 30), ("deep", 12)):
        cap = depth.title()
        specs += [
            (f"{depth}_rate", f"{cap} share of passes",
             lambda c, d=depth: _q(c, f"{d}_att", "_dir_att"), "neutral", "neutral", "pct", "att", 30),
            (f"{depth}_comp", f"{cap} completion %",
             lambda c, d=depth: _q(c, f"{d}_comp", f"{d}_att"), "high", "low", "pct", f"{depth}_att", floor),
            (f"{depth}_ypa", f"{cap} yards per attempt",
             lambda c, d=depth: _q(c, f"{d}_yds", f"{d}_att"), "high", "low", "num", f"{depth}_att", floor),
            (f"{depth}_epa", f"{cap} EPA per attempt",
             lambda c, d=depth: _q(c, f"{d}_ppa", f"{d}_ppa_n"), "high", "low", "ppa", f"{depth}_att", floor),
        ]
    for direction in DIRS:
        cap = direction.title()
        specs += [
            (f"{direction}_rate", f"Share of passes thrown {direction}",
             lambda c, d=direction: _q(c, f"{d}_att", "_dir_att"), "neutral", "neutral", "pct", "att", 30),
            (f"{direction}_epa", f"Passes thrown {direction}: EPA per attempt",
             lambda c, d=direction: _q(c, f"{d}_ppa", f"{d}_ppa_n"), "high", "low", "ppa", f"{direction}_att", 15),
        ]
    specs += [
        ("adot", "Average depth of target (air yards)", lambda c: _q(c, "air_sum", "air_n"),
         "neutral", "neutral", "num", "air_n", 30),
        ("yac", "Yards after catch per completion", lambda c: _q(c, "yac_sum", "cair_n"),
         "high", "low", "num", "cair_n", 20),
        ("pressure_rate", "Pressure rate (hurries and sacks per dropback)",
         lambda c: _q(c, "pressured_n", "db"), "low", "high", "pct", "db", 40),
        ("clean_epa", "EPA per dropback, clean pocket", lambda c: _q(c, "clean_ppa", "clean_ppa_n"),
         "high", "low", "ppa", "clean_n", 30),
        ("pressured_epa", "EPA per dropback under pressure",
         lambda c: _q(c, "pressured_ppa", "pressured_ppa_n"), "high", "low", "ppa", "pressured_n", 10),
        ("shotgun_rate", "Snaps from shotgun", lambda c: _q(c, "shotgun_n", "plays"),
         "neutral", "neutral", "pct", "plays", 50),
        ("under_center_rate", "Snaps under center", lambda c: _q(c, "under_center_n", "plays"),
         "neutral", "neutral", "pct", "plays", 50),
        ("no_huddle_rate", "Snaps with no huddle", lambda c: _q(c, "no_huddle_n", "plays"),
         "neutral", "neutral", "pct", "plays", 50),
        ("shotgun_epa", "EPA per play from shotgun", lambda c: _q(c, "shotgun_ppa", "shotgun_ppa_n"),
         "high", "low", "ppa", "shotgun_n", 30),
        ("under_center_epa", "EPA per play under center",
         lambda c: _q(c, "under_center_ppa", "under_center_ppa_n"), "high", "low", "ppa", "under_center_n", 20),
        ("shotgun_run_rate", "Run share from shotgun", lambda c: _q(c, "shotgun_rush", "shotgun_n"),
         "neutral", "neutral", "pct", "shotgun_n", 30),
        ("under_center_run_rate", "Run share under center",
         lambda c: _q(c, "under_center_rush", "under_center_n"), "neutral", "neutral", "pct", "under_center_n", 20),
    ]
    for direction in DIRS:
        cap = direction.title()
        specs += [
            (f"run_{direction}_rate", f"Runs {direction}", lambda c, d=direction: _q(c, f"run_{d}_n", "_run_dir"),
             "neutral", "neutral", "pct", "rush_n", 40),
            (f"run_{direction}_ypc", f"Runs {direction}: yards per rush",
             lambda c, d=direction: _q(c, f"run_{d}_yds", f"run_{d}_n"), "high", "low", "num", f"run_{direction}_n", 15),
            (f"run_{direction}_epa", f"Runs {direction}: EPA per rush",
             lambda c, d=direction: _q(c, f"run_{d}_ppa", f"run_{d}_ppa_n"), "high", "low", "ppa",
             f"run_{direction}_n", 15),
            (f"run_{direction}_success", f"Runs {direction}: success rate",
             lambda c, d=direction: _q(c, f"run_{d}_succ", f"run_{d}_n"), "high", "low", "pct",
             f"run_{direction}_n", 15),
        ]
    return specs


TEAM_SPECS = _team_specs()


def _with_totals(c: Counter) -> Counter:
    c = Counter(c)
    c["_dir_att"] = sum(c.get(f"{d}_att", 0) for d in DIRS)
    c["_depth_att"] = sum(c.get(f"{d}_att", 0) for d in DEPTHS)
    c["_run_dir"] = sum(c.get(f"run_{d}_n", 0) for d in DIRS)
    return c


def team_rates(teams: dict, fbs: set[str]) -> dict[str, dict]:
    """{school: {"rates": {off_x, def_x}, "samples": {...}}} ranked among FBS."""
    sums = {school: {side: _with_totals(c) for side, c in sides.items()}
            for school, sides in teams.items() if school in fbs}
    out: dict[str, dict] = {}
    for key, label, fn, better_off, better_def, fmt, floor_key, floor in TEAM_SPECS:
        for side, prefix, better in (("off", "off_", better_off), ("def", "def_", better_def)):
            values = {s: fn(v[side]) for s, v in sums.items()}
            pool = [values[s] for s, v in sums.items()
                    if values[s] is not None and v[side].get(floor_key, 0) >= floor]
            for school, value in values.items():
                if value is None:
                    continue
                qualified = sums[school][side].get(floor_key, 0) >= floor
                entry = _entry(label if side == "off" else label + " allowed" if better != "neutral"
                               else label + " (opponents)", value, better, fmt, pool,
                               place_outside=not qualified)
                if entry:
                    out.setdefault(school, {"rates": {}})["rates"][prefix + key] = entry
    for school, v in sums.items():
        if school in out:
            out[school]["samples"] = {
                "off_dropbacks": int(v["off"].get("db", 0)), "def_dropbacks": int(v["def"].get("db", 0)),
                "off_rushes": int(v["off"].get("rush_n", 0)), "def_rushes": int(v["def"].get("rush_n", 0)),
            }
    return out


LOOK_LABELS = {"all": "All dropbacks", "short": "Short passes", "deep": "Deep passes",
               "left": "Passes left", "middle": "Passes middle", "right": "Passes right",
               "clean": "Clean pocket", "pressured": "Under pressure", "shotgun": "From shotgun",
               "under_center": "Under center"}
LOOK_FLOORS = {"all": 60, "short": 40, "deep": 12, "left": 20, "middle": 15, "right": 20,
               "clean": 40, "pressured": 10, "shotgun": 40, "under_center": 10}


def _look_figures(c: Counter) -> dict:
    att, n = c.get("att", 0), c.get("ppa_n", 0)
    return {
        "completion_pct": c.get("comp", 0) / att if att else None,
        "yards_per_attempt": c.get("yds", 0) / att if att else None,
        "epa_per_dropback": c.get("ppa", 0) / n if n else None,
    }


LOOK_STATS = (("completion_pct", "Completion %", "pct"), ("yards_per_attempt", "Yards per attempt", "num"),
              ("epa_per_dropback", "EPA per dropback", "ppa"))


def passer_looks(passers: dict, fbs: set[str]) -> dict[str, dict]:
    """{"school|name_key": {look: {dropbacks, attempts, completion_pct...}}},
    each figure ranked among FBS passers with the look's floor."""
    rows = {k: v for k, v in passers.items() if k.split("|", 1)[0] in fbs}
    out: dict[str, dict] = {}
    for look in LOOKS:
        floor = LOOK_FLOORS[look]
        figs = {k: _look_figures(v.get(look) or Counter()) for k, v in rows.items()}
        qualified = {k for k, v in rows.items() if (v.get(look) or {}).get("db", 0) >= floor}
        for stat, label, fmt in LOOK_STATS:
            pool = [figs[k][stat] for k in qualified if figs[k][stat] is not None]
            for k, f in figs.items():
                c = rows[k].get(look) or {}
                if not c.get("db"):
                    continue
                block = out.setdefault(k, {}).setdefault(look, {
                    "dropbacks": int(c.get("db", 0)), "attempts": int(c.get("att", 0)),
                    "touchdowns": int(c.get("td", 0)), "interceptions": int(c.get("int", 0)),
                    "qualified": k in qualified})
                e = _entry(f"{LOOK_LABELS[look]}: {label}", f[stat], "high", fmt, pool,
                           place_outside=k not in qualified)
                if e:
                    block[stat] = e
    return out


def defense_looks(teams: dict, fbs: set[str]) -> dict[str, dict]:
    """The same looks for each defense: what it allows on them, ranked of FBS."""
    out: dict[str, dict] = {}
    sums = {s: v["def"] for s, v in teams.items() if s in fbs}

    def look_counter(c: Counter, look: str) -> Counter:
        if look == "all":
            return Counter(att=c.get("att", 0), comp=c.get("comp", 0), yds=c.get("yds", 0),
                           ppa=c.get("clean_ppa", 0) + c.get("pressured_ppa", 0),
                           ppa_n=c.get("clean_ppa_n", 0) + c.get("pressured_ppa_n", 0), db=c.get("db", 0))
        if look in ("clean", "pressured"):
            return Counter(ppa=c.get(f"{look}_ppa", 0), ppa_n=c.get(f"{look}_ppa_n", 0), db=c.get(f"{look}_n", 0))
        if look in ("shotgun", "under_center"):
            return Counter(ppa=c.get(f"{look}_ppa", 0), ppa_n=c.get(f"{look}_ppa_n", 0), db=c.get(f"{look}_n", 0))
        return Counter(att=c.get(f"{look}_att", 0), comp=c.get(f"{look}_comp", 0), yds=c.get(f"{look}_yds", 0),
                       ppa=c.get(f"{look}_ppa", 0), ppa_n=c.get(f"{look}_ppa_n", 0), db=c.get(f"{look}_att", 0))

    for look in LOOKS:
        floor = max(10, LOOK_FLOORS[look] // 2)
        counters = {s: look_counter(c, look) for s, c in sums.items()}
        figs = {s: _look_figures(c) for s, c in counters.items()}
        qualified = {s for s, c in counters.items() if c.get("db", 0) >= floor}
        for stat, label, fmt in LOOK_STATS:
            if look in ("clean", "pressured", "shotgun", "under_center") and stat != "epa_per_dropback":
                continue
            pool = [figs[s][stat] for s in qualified if figs[s][stat] is not None]
            for s, f in figs.items():
                e = _entry(f"{LOOK_LABELS[look]}: {label} allowed", f[stat], "low", fmt, pool,
                           place_outside=s not in qualified)
                if e:
                    out.setdefault(s, {}).setdefault(look, {})[stat] = e
    return out


def build(season: int, through_week: int, fbs: set[str]) -> dict:
    """Everything the desk reads, or {} when CFBD is unavailable."""
    teams, passers, names, weeks = season_sums(season, through_week)
    if not teams or not fbs:
        return {}
    rates = team_rates(teams, fbs)
    looks = passer_looks(passers, fbs)
    allowed = defense_looks(teams, fbs)
    for school, block in rates.items():
        block["through_week"] = through_week
        block["weeks"] = weeks
        if school in allowed:
            block["allowed_looks"] = allowed[school]
    print(f"  charting: {weeks} weeks, {len(rates)} FBS schools, {len(looks)} passers")
    return {"teams": rates, "passers": looks, "names": names}


def attach_qbs(qbs: dict[str, list[dict]], charting: dict) -> int:
    """Hang each passer's looks on his QB-room row (matched on first initial
    and surname within the school). Returns how many matched."""
    looks = (charting or {}).get("passers") or {}
    surnames: dict[tuple[str, str], list[str]] = defaultdict(list)
    for pkey in looks:
        school, _, key = pkey.partition("|")
        surnames[(school, key.split("|")[-1])].append(pkey)
    matched = 0
    for school, rows in (qbs or {}).items():
        for q in rows:
            key = name_key(q.get("player_name"))
            hit = looks.get(f"{school}|{key}")
            # The scorer prints the legal first initial ("G.Crowder" for Will
            # Crowder): a surname alone in the school's passers is the match.
            same = surnames.get((school, key.split("|")[-1])) if key and not hit else None
            if same and len(same) == 1:
                hit = looks[same[0]]
            if hit:
                q["looks"] = hit
                matched += 1
    return matched


if __name__ == "__main__":  # pragma: no cover - manual inspection
    import sys
    season, week = int(sys.argv[1]), int(sys.argv[2])
    rows = cfb_depth.advanced_rows(season)
    built = build(season, week, set(cfb_depth.team_advanced(rows)))
    print(json.dumps({k: built["teams"][k] for k in list(built["teams"])[:1]}, indent=1)[:3000])
