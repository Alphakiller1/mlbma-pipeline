"""A CBB team's résumé (2026-11-18 audit): the selection lens.

NET and quadrant records are what the bracket is built on from December, and
T-Rank (barttorvik.com) is the free, daily, opponent-adjusted rating. The
luck figures beside them (the Regression Watch) are built with the ESPN box
supplement, from the finals the game log reads (pipeline/regression.py).

    NET          The NCAA's own list, once it carries the current season
                 (ncaa.com; the first list comes each December). Until then
                 there is none: WarrenNolan's 2027 page carries last March's
                 final NET ("updated for games through MAR 15th"), and
                 quadrants on last season's ranks would misstate a résumé.
    Quadrants    Computed here from each final's site and the opponent's NET,
                 on the NCAA's bands; D-I opponents only.
    T-Rank       barttorvik.com team results, joined on the crosswalk's own
                 barttorvik_team_name. Its projected wins are left out: no
                 forecast reaches the public page.

Everything is evidence for the reader to weigh; nothing is ranked as a gap.
A source that cannot be read leaves its figures out.
"""
from __future__ import annotations

import html
import json
import re
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

HEADERS = {"User-Agent": "ChaseAnalytics/1.0 (+https://chase-analytics.com)"}
TORVIK = "https://barttorvik.com/{year}_team_results.json"
NCAA_NET = "https://www.ncaa.com/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings"
# The NCAA's quadrant bands: (home, neutral, away) upper NET bounds per quadrant.
QUADRANTS = ((1, 30, 50, 75), (2, 75, 100, 135), (3, 160, 200, 240))
# The NCAA's own short forms and initialisms, mapped to the normalized form
# of a name the crosswalk carries.
ALIASES = {"connecticut": "uconn", "ole miss": "mississippi", "pitt": "pittsburgh", "umass": "massachusetts",
           "unc": "north carolina", "louisiana state": "lsu", "brigham young": "byu", "southern methodist": "smu",
           "texas christian": "tcu", "central florida": "ucf", "southern california": "usc",
           "virginia commonwealth": "vcu", "texas el paso": "utep", "texas san antonio": "utsa",
           "nevada las vegas": "unlv", "alabama birmingham": "uab", "florida international": "fiu",
           "long island university": "liu", "siu edwardsville": "siue", "southern illinois edwardsville": "siue",
           "maryland baltimore county": "umbc", "tennessee martin": "ut martin", "uncg": "unc greensboro",
           "uncw": "unc wilmington", "unca": "unc asheville", "miami florida": "miami fl", "miami ohio": "miami oh",
           "uni": "northern iowa", "sfa": "stephen f austin", "utrgv": "ut rio grande valley",
           "csun": "cal state northridge", "csu northridge": "cal state northridge", "uiw": "incarnate word",
           "fdu": "fairleigh dickinson", "niu": "northern illinois", "umes": "maryland eastern shore",
           "ulm": "ul monroe", "louisiana monroe": "ul monroe", "lmu": "loyola marymount",
           "col charleston": "charleston", "college charleston": "charleston",
           "a and m corpus christi": "texas a and m corpus christi", "army west point": "army",
           "csu bakersfield": "cal state bakersfield", "mississippi valley": "mississippi valley state",
           "central connecticut state": "central connecticut",
           "saint johns": "saint johns", "saint marys": "saint marys"}
# Newspaper abbreviations the NCAA writes ("South Fla.", "Middle Tenn.").
ABBREVIATIONS = {"fla": "florida", "mich": "michigan", "tenn": "tennessee", "ill": "illinois", "ky": "kentucky",
                 "caro": "carolina", "colo": "colorado", "ark": "arkansas", "conn": "connecticut", "mo": "missouri",
                 "la": "louisiana", "ga": "georgia", "ariz": "arizona", "ala": "alabama", "ind": "indiana",
                 "wash": "washington", "val": "valley", "col": "college"}


def _get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def norm(name: str | None) -> str:
    """A school name reduced for matching across sources ("Iowa St." and
    "Iowa State", "South Fla." and "South Florida", "St. John's (NY)" and
    "St. John's")."""
    s = html.unescape(str(name or "")).lower()
    s = re.sub(r"miami\s*\((fl|florida)\)", "miami fl", s)
    s = re.sub(r"miami\s*\((oh|ohio)\)", "miami oh", s)
    s = re.sub(r"\([^)]*\)", " ", s)                      # state qualifiers: (NY), (CA), (NC)
    s = s.replace("&", " and ").replace("'", "").replace("’", "")
    words = [w for w in re.split(r"[^a-z0-9]+", s) if w]
    words = [ABBREVIATIONS.get(w, w) for w in words]
    for i in range(len(words) - 1):                         # "N.C. A&T" -> north carolina a and t
        if words[i] == "n" and words[i + 1] == "c":
            words[i:i + 2] = ["north", "carolina"]
            break
    if len(words) > 1 and words[-1] == "u":                  # "Southern U."
        words.pop()
    words = [w for w in words if w not in ("the", "university", "of")]
    if words and words[0] in ("st", "saint"):
        words[0] = "saint"
    if words and words[-1] == "st":
        words[-1] = "state"
    out = " ".join(words)
    return ALIASES.get(out, out)


def name_index(crosswalk: list[dict]) -> list[dict[str, set[int]]]:
    """Tiers of {normalized name: ESPN team ids}: a school's own short names
    first, then its display name without the mascot. A looser tier is read
    only when a tighter one has no single answer ("Michigan State Spartans"
    cut to two words reads "michigan", so "Michigan" must match first)."""
    tiers: list[dict[str, set[int]]] = [defaultdict(set) for _ in range(3)]
    for r in crosswalk:
        if r.get("espn_team_id") is None:
            continue
        tid = int(r["espn_team_id"])
        full = str(r.get("display_name") or "").split()
        for tier, names in enumerate((
                [r.get("barttorvik_team_name"), r.get("short_display_name"), r.get("display_name")],
                [" ".join(full[:-1])] if len(full) > 1 else [],
                [" ".join(full[:-2])] if len(full) > 2 else [])):
            for n in names:
                if n:
                    tiers[tier][norm(n)].add(tid)
    return tiers


def match(name: str, tiers: list[dict[str, set[int]]]) -> int | None:
    key = norm(name)
    for index in tiers:
        hits = index.get(key) or set()
        if len(hits) == 1:
            return next(iter(hits))
        if hits:
            return None  # ambiguous at this tier: a looser one cannot settle it
    return None


def ranked(values: dict[int, float | None], label: str, better: str, fmt: str) -> dict[int, dict]:
    pool = [v for v in values.values() if v is not None]
    out = {}
    for tid, v in values.items():
        if v is None:
            continue
        ahead = sum(1 for o in pool if (o < v if better == "low" else o > v))
        out[tid] = {"label": label, "value": round(v, 4), "better": better, "rank": ahead + 1,
                    "of": len(pool), "format": fmt}
    return out


def torvik(year: int, crosswalk: list[dict], fetch=_get) -> dict[int, dict]:
    """T-Rank's rating figures per ESPN team id."""
    by_name = {r["barttorvik_team_name"]: int(r["espn_team_id"]) for r in crosswalk
               if r.get("barttorvik_team_name") and r.get("espn_team_id") is not None and not r.get("is_alias")}
    rows = json.loads(fetch(TORVIK.format(year=year)))
    raw: dict[str, dict[int, float]] = defaultdict(dict)
    trank: dict[int, int] = {}
    for row in rows:
        tid = by_name.get(row[1])
        if tid is None or len(row) < 45:
            continue
        trank[tid] = int(row[0])
        raw["adj_off"][tid], raw["adj_def"][tid] = float(row[4]), float(row[6])
        raw["barthag"][tid], raw["wab"][tid], raw["adj_tempo"][tid] = float(row[8]), float(row[41]), float(row[44])
    spec = (("adj_off", "T-Rank Adjusted Offense", "high", "num"), ("adj_def", "T-Rank Adjusted Defense", "low", "num"),
            ("barthag", "Barthag", "high", "pct"), ("wab", "Wins Above Bubble", "high", "signed"),
            ("adj_tempo", "Adjusted Tempo", "neutral", "num"))
    out: dict[int, dict] = defaultdict(dict)
    for key, label, better, fmt in spec:
        for tid, entry in ranked(raw[key], label, "high" if better == "neutral" else better, fmt).items():
            if better == "neutral":
                entry["better"] = "neutral"
            out[tid][key] = entry
    for tid, place in trank.items():
        out[tid]["trank"] = {"label": "T-Rank", "value": place, "better": "low", "rank": place,
                             "of": len(trank), "format": "int"}
    return dict(out)


def official_net(year: int, crosswalk: list[dict], fetch=_get) -> tuple[dict[int, int], str | None]:
    """The NCAA's NET when its stamp is in the current season, else ({}, None)."""
    page = fetch(NCAA_NET)
    stamp = re.search(r"Through Games ([A-Za-z]{3})\.? (\d{1,2}) (\d{4})", page)
    if not stamp:
        return {}, None
    through = datetime.strptime(f"{stamp[1]} {stamp[2]} {stamp[3]}", "%b %d %Y").date()
    if not (through.year == year - 1 and through.month >= 11 or through.year == year and through.month <= 4):
        return {}, None  # last season's final list stays up until December
    index = name_index(crosswalk)
    ranks = {}
    for rank, school in re.findall(r"<tr>\s*<td>(\d+)</td>\s*<td>\s*([^<]+)</td>", page):
        tid = match(school.strip(), index)
        if tid is not None:
            ranks[tid] = int(rank)
    return ranks, through.isoformat()


def net_ranks(year: int, crosswalk: list[dict], fetch=_get) -> tuple[dict[int, int], dict]:
    """({ESPN id: NET}, {"source", "through", "of"}) from the NCAA's current-season
    list; empty before the season's first release or when the page cannot be read."""
    try:
        ranks, through = official_net(year, crosswalk, fetch)
    except Exception as error:  # noqa: BLE001 - a source that cannot be read is skipped
        print(f"  NET unavailable: {error}")
        return {}, {}
    if len(ranks) < 300:
        return {}, {}
    return ranks, {"source": "NCAA", "through": through, "of": max(ranks.values())}


def quadrant(net: int, site: str) -> int:
    col = {"Home": 1, "Neutral": 2, "Away": 3}[site]
    for q, *bounds in QUADRANTS:
        if net <= bounds[col - 1]:
            return q
    return 4


def finals(context: dict):
    for g in context.get("games") or []:
        if g.get("points") is not None and g.get("opponent_points") is not None:
            yield g


def quadrant_records(context: dict, net: dict[int, int]) -> dict | None:
    """{"q1": "W-L", ..., "q4": ...} over finals against NET-ranked opponents."""
    tally = {q: [0, 0] for q in (1, 2, 3, 4)}
    counted = 0
    for g in finals(context):
        opp = net.get(int(g["opponent_id"])) if str(g.get("opponent_id", "")).isdigit() else None
        if opp is None or g.get("site") not in ("Home", "Neutral", "Away"):
            continue
        q = quadrant(opp, g["site"])
        tally[q][0 if g["points"] > g["opponent_points"] else 1] += 1
        counted += 1
    if not counted:
        return None
    return {f"q{q}": f"{won}-{lost}" for q, (won, lost) in tally.items()}


PUBLISHED = Path(__file__).resolve().parents[2] / "data" / "public" / "cbb"


def previous_torvik(year: int, root: Path = PUBLISHED) -> tuple[dict[int, dict], str | None]:
    """The T-Rank figures last published for each team this season, and the
    oldest date among them (a carried figure keeps the day it was fetched)."""
    out: dict[int, dict] = {}
    dates = []
    for path in sorted((root / str(year) / "teams").glob("*.json")):
        try:
            resume = json.loads(path.read_text(encoding="utf-8")).get("resume") or {}
        except (OSError, ValueError):
            continue
        if resume.get("torvik"):
            out[int(path.stem)] = resume["torvik"]
            if resume.get("torvik_through"):
                dates.append(resume["torvik_through"])
    return out, (min(dates) if dates else None)


def attach(contexts: dict[int, dict], crosswalk: list[dict], year: int, fetch=_get) -> dict:
    """Set c["resume"] on a season's D-I contexts; returns counts."""
    counts = {"net": 0, "torvik": 0}
    net, basis = net_ranks(year, crosswalk, fetch)
    trank_through = datetime.now(timezone.utc).date().isoformat()
    try:
        trank = torvik(year, crosswalk, fetch)
    except Exception as error:  # noqa: BLE001
        # barttorvik.com answers 403 to the GitHub runner (2026-11-18) while
        # it serves a desk machine: keep each team's last published T-Rank,
        # with its own date, rather than drop the résumé.
        print(f"  T-Rank unavailable: {error}")
        trank, trank_through = previous_torvik(year)
        if trank:
            print(f"  T-Rank carried from {trank_through} for {len(trank)} teams")
    for tid, c in contexts.items():
        resume = {}
        if tid in net:
            resume["net"] = {"label": "NET", "value": net[tid], "better": "low", "rank": net[tid],
                             "of": basis.get("of") or len(net), "format": "int"}
            resume["net_source"], resume["net_through"] = basis.get("source"), basis.get("through")
            quads = quadrant_records(c, net)
            if quads:
                resume["quadrants"] = quads
            counts["net"] += 1
        if tid in trank:
            resume["torvik"] = trank[tid]
            resume["torvik_through"] = trank_through
            counts["torvik"] += 1
        if resume:
            c["resume"] = resume
    print(f"  résumé: NET ({basis.get('source', 'none')}) {counts['net']}, "
          f"T-Rank {counts['torvik']} of {len(contexts)} teams")
    return counts
