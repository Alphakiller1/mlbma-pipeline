"""CFB strength indices: OSI, DSI and NSI (2026-11-18), the college versions
of the NFL indices. The index math is shared (outputs/strength_index.py).

Inputs: CFBD game PPA per play, FBS against FBS, raw and opponent-adjusted,
last season's opponent-adjusted figures, and the margin so far. Weights
(scripts/cfb_strength_weights.json) were fitted at game level on 2021-2025:
predicting each later game, NSI's mean leave-one-season-out R^2 was 0.305
against 0.243 for the margin so far and 0.203 for raw net PPA; in week 1,
0.254 against 0.092, because last season carries most of what is known.

Two CFBD calls per run (this season's game PPA and games); last season's are
cached for good.
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
    """(team-game rows, team-game margins), FBS against FBS. A finished season
    is cached for good."""
    name = f"strength_{season}.json"
    hit = cfb_depth._cached(name) if final else None
    if hit:
        return hit["rows"], hit["margins"]
    ppa = cfb_depth.cfbd("/ppa/games", year=season, seasonType="regular")
    games = cfb_depth.cfbd("/games", year=season, seasonType="regular")
    if not isinstance(ppa, list) or not isinstance(games, list):
        return None, None
    fbs = {g["homeTeam"] for g in games if g.get("homeClassification") == "fbs"} | \
          {g["awayTeam"] for g in games if g.get("awayClassification") == "fbs"}
    rows = [{"week": p["week"], "team": p["team"], "opp": p["opponent"],
             "off": p["offense"]["overall"], "def": p["defense"]["overall"]}
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
    return rows, margins


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
    rows, margins = _season(season, final=False)
    prior_rows, _ = _season(season - 1, final=True)
    if not rows or not prior_rows:
        return {}
    week = max(r["week"] for r in rows)
    raw_off, raw_def = _mean(rows, "off"), _mean(rows, "def")
    adj_off, adj_def = _adjusted(rows)
    p_off, p_def = _adjusted(prior_rows)
    m1 = _mean(margins, "m")
    # A school new to FBS has no prior: it takes the prior pool's lower quartile.
    new_off, new_def = _quantile(list(p_off.values()), 0.25), _quantile(list(p_def.values()), 0.75)
    inputs = {t: {"off": raw_off[t], "off_adj": adj_off[t], "p_off": p_off.get(t, new_off),
                  "def": raw_def[t], "def_adj": adj_def[t], "p_def": p_def.get(t, new_def), "m1": m1.get(t, 0.0)}
              for t in raw_off if t in raw_def and t in adj_off}
    if len(inputs) < 100:
        print(f"  strength: {len(inputs)} FBS schools; skipped")
        return {}
    spec = json.loads(WEIGHTS.read_text(encoding="utf-8"))
    out = {}
    for team, block in strength_index.indices(inputs, spec, week).items():
        block.update(week=week, season=season, prior_season=season - 1)
        out[cfb_depth._norm(team)] = block
    print(f"  strength: {len(out)} FBS schools through week {week}")
    return out
