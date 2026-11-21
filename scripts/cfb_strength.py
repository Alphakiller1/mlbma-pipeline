"""CFB strength indices: OSI, DSI and NSI (2026-11-18), the college versions
of the NFL indices. The index math is shared (outputs/strength_index.py).

Inputs: CFBD game PPA per play, FBS against FBS, raw and opponent-adjusted,
last season's opponent-adjusted figures, the margin so far, and two preseason
reads (2026-11-19): the share of last season's offensive PPA that returned
(CFBD /player/returning), which scales last season's figures, and the 247
team talent composite (CFBD /talent). Weights (scripts/cfb_strength_weights.json)
were fitted at game level on 2021-2025: predicting each later game, NSI's mean
leave-one-season-out R^2 was 0.315 (0.305 without the preseason reads) against
0.243 for the margin so far and 0.203 for raw net PPA; in week 1, 0.285
(0.254) against 0.092, because last season and the roster carry most of what
is known.

Two CFBD calls per run (this season's game PPA and games); last season's, and
this season's returning production and talent, are cached for good.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:  # run beside the slate publisher (scripts/ on the path) or imported as scripts.*
    import cfb_depth  # noqa: E402
except ImportError:  # pragma: no cover - package import in tests
    from scripts import cfb_depth  # noqa: E402
from outputs import strength_index  # noqa: E402

WEIGHTS = Path(__file__).with_name("cfb_strength_weights.json")
ITERATIONS = 15


def _season(season: int, final: bool):
    """(team-game rows, team-game margins, {school: latest postgame Elo}), FBS
    against FBS. A finished season is cached for good (without Elo, which only
    the current season reads)."""
    name = f"strength_{season}.json"
    hit = cfb_depth._cached(name) if final else None
    if hit:
        return hit["rows"], hit["margins"], {}
    ppa = cfb_depth.cfbd("/ppa/games", year=season, seasonType="regular")
    games = cfb_depth.season_games(season)  # ESPN: the same games, free
    if not isinstance(ppa, list) or not games:
        return None, None, {}
    fbs = {g["homeTeam"] for g in games if g.get("homeClassification") == "fbs"} | \
          {g["awayTeam"] for g in games if g.get("awayClassification") == "fbs"}
    rows = [{"week": p["week"], "team": p["team"], "opp": p["opponent"],
             "off": p["offense"]["overall"], "def": p["defense"]["overall"],
             "off_pass": p["offense"].get("passing"), "off_rush": p["offense"].get("rushing"),
             "def_pass": p["defense"].get("passing"), "def_rush": p["defense"].get("rushing")}
            for p in ppa if p.get("team") in fbs and p.get("opponent") in fbs
            and (p.get("offense") or {}).get("overall") is not None
            and (p.get("defense") or {}).get("overall") is not None]
    margins = []
    for g in games:
        if g.get("homePoints") is None or g.get("awayPoints") is None:
            continue
        if g["homeTeam"] in fbs and g["awayTeam"] in fbs:
            d = g["homePoints"] - g["awayPoints"]
            margins += [{"team": g["homeTeam"], "m": d}, {"team": g["awayTeam"], "m": -d}]
    if final and rows:
        cfb_depth._store(name, {"rows": rows, "margins": margins})
    # CFBD's postgame Elo after each school's latest completed game.
    elo: dict[str, tuple] = {}
    for g in games:
        for side in ("home", "away"):
            value = g.get(side + "PostgameElo")
            team = g.get(side + "Team")
            if team in fbs and isinstance(value, (int, float)) and g.get("homePoints") is not None:
                key = (g.get("week") or 0, str(g.get("startDate") or ""))
                if team not in elo or key >= elo[team][0]:
                    elo[team] = (key, float(value))
    return rows, margins, {t: v for t, (_, v) in elo.items()}


def _preseason(season: int) -> tuple[dict[str, float], dict[str, float]]:
    """({school: returning share of offensive PPA}, {school: talent composite}),
    each fetched once a season and cached for good."""
    out = []
    for name, path in (("returning", "/player/returning"), ("talent", "/talent")):
        file = f"{name}_{season}.json"
        hit = cfb_depth._cached(file)
        rows = hit.get("rows") if hit else None
        if not rows:
            rows = cfb_depth.cfbd(path, year=season)
            if isinstance(rows, list) and rows:
                cfb_depth._store(file, {"rows": rows})
        out.append(rows if isinstance(rows, list) else [])
    def number(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    ret = {r["team"]: number(r.get("percentPPA")) for r in out[0] if r.get("team")}
    tal = {(r.get("team") or r.get("school")): number(r.get("talent")) for r in out[1] if r.get("team") or r.get("school")}
    return ({t: v for t, v in ret.items() if v is not None and 0 <= v <= 1},
            {t: v for t, v in tal.items() if v is not None and v > 0})


def _mean(rows, key):
    sums: dict[str, list[float]] = {}
    for r in rows:
        sums.setdefault(r["team"], []).append(r[key])
    return {t: sum(v) / len(v) for t, v in sums.items()}


def _adjusted(rows):
    league = sum(r["off"] for r in rows) / len(rows)
    oa, da = _mean(rows, "off"), _mean(rows, "def")
    for _ in range(ITERATIONS):
        o2: dict[str, list[float]] = {}
        d2: dict[str, list[float]] = {}
        for r in rows:
            o2.setdefault(r["team"], []).append(r["off"] - (da.get(r["opp"], league) - league))
            d2.setdefault(r["team"], []).append(r["def"] - (oa.get(r["opp"], league) - league))
        oa = {t: sum(v) / len(v) for t, v in o2.items()}
        da = {t: sum(v) / len(v) for t, v in d2.items()}
    return oa, da


def _quantile(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))]


def build(season: int) -> dict[str, dict]:
    """{normalized school: {"week", "osi", "dsi", "nsi", "inputs", "weights"}}."""
    rows, margins, elo = _season(season, final=False)
    prior_rows, _, _ = _season(season - 1, final=True)
    if not rows or not prior_rows:
        return {}
    week = max(r["week"] for r in rows)
    raw_off, raw_def = _mean(rows, "off"), _mean(rows, "def")
    adj_off, adj_def = _adjusted(rows)
    p_off, p_def = _adjusted(prior_rows)
    m1 = _mean(margins, "m")
    ret, tal = _preseason(season)
    split = {k: _mean([r for r in rows if r.get(k) is not None], k)
             for k in ("off_pass", "off_rush", "def_pass", "def_rush")}
    # A school new to FBS has no prior: it takes the prior pool's lower quartile.
    new_off, new_def = _quantile(list(p_off.values()), 0.25), _quantile(list(p_def.values()), 0.75)
    inputs = {t: {"off": raw_off[t], "off_adj": adj_off[t], "p_off": p_off.get(t, new_off),
                  "def": raw_def[t], "def_adj": adj_def[t], "p_def": p_def.get(t, new_def), "m1": m1.get(t, 0.0),
                  "ret": ret.get(t), "talent": tal.get(t), "elo": elo.get(t),
                  **{k: split[k].get(t) for k in split}}
              for t in raw_off if t in raw_def and t in adj_off}
    if len(inputs) < 100:
        print(f"  strength: {len(inputs)} FBS schools; skipped")
        return {}
    spec = json.loads(WEIGHTS.read_text(encoding="utf-8"))
    out = {}
    for team, block in strength_index.indices(inputs, spec, week).items():
        block.update(week=week, season=season, prior_season=season - 1)
        out[cfb_depth._norm(team)] = block
    print(f"  strength: {len(out)} FBS schools through week {week} "
          f"({sum(r['ret'] is not None for r in inputs.values())} with returning production, "
          f"{sum(r['talent'] is not None for r in inputs.values())} with talent, "
          f"{sum(r['elo'] is not None for r in inputs.values())} with Elo)")
    return out
