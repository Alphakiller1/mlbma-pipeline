"""CFB penalties by team and unit (2026-11-19), from the official scorer's
play text in ESPN's game summaries:

  "PENALTY UGA False Start (#71 E.Greene III) 5 yards from MIZ37 to MIZ42. NO PLAY"
  "... PENALTY MIZ Face Mask (#2 S.Laulea) 15 yards from UGA36 to MIZ21, 1ST DOWN"

Each accepted foul (one that moves the ball: "N yards from") is charged to
the school whose spot code it names. The code is the scorer's, not ESPN's
abbreviation (Oklahoma State is "OSU"), so each game's codes are matched to
its two schools from the field-position spots of clean plays, as
scripts/cfb_charting.py does with CFBD's text. The unit is the side of the
ball: offense when the fouling school has the ball, defense when it does not,
special teams on kicking plays. Declined and offsetting fouls cost nothing
and are not counted.

ESPN, not CFBD: the CFBD call budget is shared with the rest of the CFB desk.
Each final is read once and cached; figures are per game, ranked among FBS
schools, fewer committed and more drawn reading better.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_depth
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_depth

USER_AGENT = "ChaseAnalytics/1.0"  # ESPN refuses a user agent that carries a URL
CACHE_VERSION = 2
SEGMENT = re.compile(r"PENALTY\s+(?P<tok>[A-Z][A-Z0-9&'.-]*)\s+(?P<body>.*)", re.I | re.S)
YARDS = re.compile(r"(\d+)\s+yards?\s+from\b", re.I)
SPOT = re.compile(r"\bto the\s+(?P<tok>[A-Z][A-Za-z'.&-]*?)\s?(?P<yd>\d{1,2})\b")
KICK = re.compile(r"\b(punt|kickoff|kick attempt|field goal|onside)\b", re.I)
OFF_PRESNAP = {"false start", "delay of game", "illegal formation", "illegal shift", "illegal motion",
               "illegal snap", "illegal substitution"}
DEF_PRESNAP = {"offside", "encroachment", "neutral zone infraction", "delay of game", "illegal substitution"}
PERSONAL = {"personal foul", "face mask", "uns: unsportsmanlike conduct", "unr: unnecessary roughness",
            "roughing the passer", "targeting", "horse collar tackle", "unsportsmanlike conduct",
            "unnecessary roughness"}
COUNTS = ("pen_n", "pen_yds", "fd_given", "off_n", "off_yds", "off_presnap", "off_holding", "off_opi",
          "def_n", "def_yds", "def_presnap", "def_dpi", "def_dpi_yds", "def_coverage", "def_personal", "def_fd",
          "st_n", "st_yds")

# key: (label, better, format, value from the school's sums and its opponents')
SPEC = {
    # Team totals from the official box ("totalPenaltiesYards"); the units below from the play text.
    "penalties_pg": ("Penalties/G", "low", "num2", lambda m, o, g: m["box_n"] / g),
    "penalty_yds_pg": ("Penalty Yds/G", "low", "num", lambda m, o, g: m["box_yds"] / g),
    "drawn_pg": ("Penalties Drawn/G", "high", "num2", lambda m, o, g: o["box_n"] / g),
    "drawn_yds_pg": ("Penalty Yds Drawn/G", "high", "num", lambda m, o, g: o["box_yds"] / g),
    "net_pen_yds_pg": ("Net Penalty Yds/G", "high", "num", lambda m, o, g: (o["box_yds"] - m["box_yds"]) / g),
    "pen_fd_given_pg": ("First Downs By Penalty Given/G", "low", "num2", lambda m, o, g: m["fd_given"] / g),
    "pen_fd_gained_pg": ("First Downs By Penalty Gained/G", "high", "num2", lambda m, o, g: o["fd_given"] / g),
    "off_pen_pg": ("Offense Penalties/G", "low", "num2", lambda m, o, g: m["off_n"] / g),
    "off_pen_yds_pg": ("Offense Penalty Yds/G", "low", "num", lambda m, o, g: m["off_yds"] / g),
    "off_presnap_pg": ("Offense Pre-Snap Penalties/G", "low", "num2", lambda m, o, g: m["off_presnap"] / g),
    "off_holding_pg": ("Offensive Holding/G", "low", "num2", lambda m, o, g: m["off_holding"] / g),
    "off_opi_pg": ("Offensive Pass Interference/G", "low", "num2", lambda m, o, g: m["off_opi"] / g),
    "off_drawn_pg": ("Defensive Penalties Drawn By The Offense/G", "high", "num2", lambda m, o, g: o["def_n"] / g),
    "off_dpi_drawn_yds_pg": ("Pass Interference Yds Drawn/G", "high", "num", lambda m, o, g: o["def_dpi_yds"] / g),
    "def_pen_pg": ("Defense Penalties/G", "low", "num2", lambda m, o, g: m["def_n"] / g),
    "def_pen_yds_pg": ("Defense Penalty Yds/G", "low", "num", lambda m, o, g: m["def_yds"] / g),
    "def_presnap_pg": ("Defense Pre-Snap Penalties/G", "low", "num2", lambda m, o, g: m["def_presnap"] / g),
    "def_dpi_pg": ("Defensive Pass Interference/G", "low", "num2", lambda m, o, g: m["def_dpi"] / g),
    "def_dpi_yds_pg": ("Defensive Pass Interference Yds/G", "low", "num", lambda m, o, g: m["def_dpi_yds"] / g),
    "def_coverage_pg": ("Defensive Holding, Illegal Use Of Hands/G", "low", "num2", lambda m, o, g: m["def_coverage"] / g),
    "def_personal_pg": ("Personal Fouls By The Defense/G", "low", "num2", lambda m, o, g: m["def_personal"] / g),
    "def_pen_fd_pg": ("First Downs By Defensive Penalty/G", "low", "num2", lambda m, o, g: m["def_fd"] / g),
    "def_drawn_pg": ("Offensive Penalties Drawn By The Defense/G", "high", "num2", lambda m, o, g: o["off_n"] / g),
    "st_pen_pg": ("Special Teams Penalties/G", "low", "num2", lambda m, o, g: m["st_n"] / g),
    "st_pen_yds_pg": ("Special Teams Penalty Yds/G", "low", "num", lambda m, o, g: m["st_yds"] / g),
}


def _plays(payload: dict) -> list[dict]:
    return [p for d in ((payload.get("drives") or {}).get("previous") or []) for p in d.get("plays") or []]


def _owners(plays: list[dict]) -> dict[str, str]:
    """{scorer code: ESPN team id} for one game, voted from the end spots of
    clean plays: "to the MIZ37" with 37 yards to go means MIZ is the
    defense's side of the field."""
    votes: dict[str, Counter] = defaultdict(Counter)
    for p in plays:
        text = p.get("text") or ""
        team = str(((p.get("start") or {}).get("team") or {}).get("id") or "")
        end = (p.get("end") or {}).get("yardsToEndzone")
        if not team or end is None or re.search(r"PENALTY|fumble|intercept|NO PLAY|punt|kick", text, re.I):
            continue
        for m in SPOT.finditer(text):
            yd = int(m.group("yd"))
            if yd == 50:
                continue
            if yd == end:
                votes[m.group("tok").upper()]["opp:" + team] += 1
            elif 100 - yd == end:
                votes[m.group("tok").upper()][team] += 1
    return {tok: c.most_common(1)[0][0] for tok, c in votes.items() if c}


def fouls(text: str) -> list[dict]:
    """Accepted fouls in one play's text, each {"tok", "kind", "yds", "first"}.
    The text is cut at every "PENALTY" so one foul's enforcement never reads
    into the next. Declined and offsetting fouls are dropped; an accepted
    foul the scorer enforced without yardage ("Offside (#55). NO PLAY")
    counts with 0 yards."""
    out = []
    for segment in re.split(r"(?=\bPENALTY\s)", text, flags=re.I)[1:]:
        m = SEGMENT.match(segment)
        if not m:
            continue
        body = m.group("body")
        if re.search(r"\b(declined|offsetting)\b", body, re.I):
            continue
        yards = YARDS.search(body)
        if not yards and "NO PLAY" not in body.upper():
            continue
        kind = re.split(r"\(|\d+\s+yards?\b|\.|,", body, maxsplit=1)[0].strip().lower()
        if not kind or len(kind) > 45:
            continue
        spot = re.search(r"yards?\s+from\s+([^,.]+)", body, re.I)
        out.append({"tok": m.group("tok"), "kind": kind, "yds": int(yards.group(1)) if yards else 0,
                    "first": "1ST DOWN" in body.upper(), "spot": re.sub(r"\s+", "", spot.group(1)) if spot else ""})
    return out


def parse_game(payload: dict) -> dict | None:
    """{"teams": {ESPN id: sums}, "unassigned": n} for one final; None without plays."""
    plays = _plays(payload)
    comp = ((payload.get("header") or {}).get("competitions") or [{}])[0]
    ids = [str((c.get("team") or {}).get("id") or "") for c in comp.get("competitors") or []]
    if not plays or len(ids) != 2:
        return None
    votes = _owners(plays)

    def owner(tok: str, possession: str) -> str | None:
        hit = votes.get(tok.upper())
        if hit is None:
            return None
        if hit.startswith("opp:"):
            pos = hit[4:]
            return next((i for i in ids if i != pos), None)
        return hit
    sums = {i: Counter({k: 0 for k in COUNTS}) for i in ids}
    unassigned = 0
    # The scorer restates a foul across correction entries with the same
    # enforcement ("15 yards from FSU40 to FSU25" four times): count it once.
    seen: set[tuple] = set()
    for p in plays:
        text = p.get("text") or ""
        if "PENALTY" not in text.upper():
            continue
        possession = str(((p.get("start") or {}).get("team") or {}).get("id") or "")
        head = text[:text.upper().find("PENALTY")]
        kick = bool(KICK.search(head)) or bool(KICK.search((p.get("type") or {}).get("text") or ""))
        for foul in fouls(text):
            team = owner(foul["tok"], possession)
            if team not in sums or possession not in ids:
                unassigned += 1
                continue
            kind, yds, first = foul["kind"], foul["yds"], foul["first"]
            key = (team, kind, yds, foul["spot"] or (p.get("period") or {}).get("number"),
                   foul["spot"] or (p.get("clock") or {}).get("displayValue"))
            if key in seen:
                continue
            seen.add(key)
            c = sums[team]
            c["pen_n"] += 1
            c["pen_yds"] += yds
            if kick:
                c["st_n"] += 1
                c["st_yds"] += yds
            elif team == possession:
                c["off_n"] += 1
                c["off_yds"] += yds
                c["off_presnap"] += kind in OFF_PRESNAP
                c["off_holding"] += kind == "holding"
                c["off_opi"] += kind in ("pass interference", "ineligible downfield on pass")
            else:
                c["def_n"] += 1
                c["def_yds"] += yds
                c["def_presnap"] += kind in DEF_PRESNAP
                c["def_dpi"] += kind == "pass interference"
                c["def_dpi_yds"] += yds if kind == "pass interference" else 0
                c["def_coverage"] += kind in ("holding", "illegal use of hands")
                c["def_personal"] += kind in PERSONAL
                c["def_fd"] += first
                c["fd_given"] += first
    return {"teams": {i: dict(c) for i, c in sums.items()}, "unassigned": unassigned}


def _game(event_id: str) -> dict | None:
    name = f"penalties_{event_id}.json"
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
    """{board abbreviation: {figure: ranked entry, "games": n}} over every
    completed game through the week, ranked among FBS schools."""
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
        games = [(e, g) for e, g in zip(events, pool.map(_game, events)) if g]
    mine: dict[str, Counter] = defaultdict(Counter)
    theirs: dict[str, Counter] = defaultdict(Counter)
    played: Counter = Counter()
    unassigned = 0
    for event_id, g in games:
        ids = list(g["teams"])
        unassigned += g.get("unassigned", 0)
        box = (cfb_depth._box(event_id) or {}).get("teams") or {}
        totals = {}
        for tid in ids:
            m = re.fullmatch(r"(\d+)-(-?\d+)", str((box.get(tid) or {}).get("totalPenaltiesYards") or ""))
            # Without a box line the play text's own count stands in.
            totals[tid] = ({"box_n": int(m.group(1)), "box_yds": int(m.group(2))} if m else
                           {"box_n": g["teams"][tid]["pen_n"], "box_yds": g["teams"][tid]["pen_yds"]})
        for me in ids:
            other = next(i for i in ids if i != me)
            mine[me].update({**g["teams"][me], **totals[me]})
            theirs[me].update({**g["teams"][other], **totals[other]})
            played[me] += 1

    def is_fbs(tid: str) -> bool:
        return not fbs or cfb_depth._norm(names.get(tid, ("", ""))[1]) in fbs
    values = {tid: {key: spec[3](mine[tid], theirs[tid], played[tid]) for key, spec in SPEC.items()}
              for tid in played if played[tid]}
    pools = {key: [v[key] for tid, v in values.items() if is_fbs(tid)] for key in SPEC}
    out: dict[str, dict] = {}
    for tid, figures in values.items():
        abbr, location = names.get(tid, ("", ""))
        board = wanted.get(abbr) or wanted.get(cfb_depth._norm(location))
        if not board:
            continue
        block = {"games": played[tid]}
        for key, (label, better, fmt, _) in SPEC.items():
            block[key] = cfb_depth._entry(label, figures[key], better, fmt, pools[key] if is_fbs(tid) else [])
        out[board] = block
    print(f"  penalties: {len(games)} of {len(events)} finals read, {len(out)} schools published, "
          f"{unassigned} fouls without a school")
    return out
