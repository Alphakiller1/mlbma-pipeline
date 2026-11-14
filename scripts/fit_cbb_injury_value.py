"""CBB: what a missing player is worth to the closing spread (owner 2026-11-13).

    python scripts/fit_cbb_injury_value.py ../cbb-model/data 2025 2026

Same design as nba-model scripts/injury_value_fit.py: per team-game, the
regulars (>= REGULAR_MIN minutes averaged over the team's previous ten games,
at least three appearances) who log no minutes; per absent regular, role =
minutes/40 and production = a box game score that Basketball Quant's season
lines can reproduce (points, shooting, rebounds, assists - no steals, blocks
or turnovers there). The closing home spread (cbb-model data/market) against
a strength per team-season, held out on odd/even games.
"""
import json
import sys
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

ROOT = sys.argv[1] if len(sys.argv) > 1 else "../cbb-model/data"   # cbb-model data/: market lines + hoopR boxes
SEASONS = [int(a) for a in sys.argv[2:]] or [2025, 2026]
OUT = Path(__file__).resolve().parents[1] / "outputs" / "cbb_injury_value.json"
REGULAR_MIN = 12.0


def gs_lite(r):
    return (r.points + 0.4 * r.field_goals_made - 0.7 * r.field_goals_attempted
            - 0.4 * (r.free_throws_attempted - r.free_throws_made) + 0.45 * r.rebounds + 0.7 * r.assists)


def gs_full(r):
    return gs_lite(r) + r.steals + 0.7 * r.blocks - r.turnovers


rows = []
for season in SEASONS:
    lines = json.load(open(f"{ROOT}/market/espn-lines-{season}.json", encoding="utf-8"))["games"]
    box = pd.read_parquet(f"{ROOT}/hoopr/player_box_{season}.parquet")
    box = box[(box.minutes.fillna(0) > 0)].copy()
    for c in ("points", "field_goals_made", "field_goals_attempted", "free_throws_made", "free_throws_attempted",
              "rebounds", "assists", "steals", "blocks", "turnovers"):
        box[c] = box[c].fillna(0)
    box["gl"] = gs_lite(box)
    box["gf"] = gs_full(box)
    sched = pd.read_parquet(f"{ROOT}/hoopr/schedule_{season}.parquet", columns=["id", "home_id", "away_id", "neutral_site", "date"])
    sched["id"] = sched.id.astype(str)
    games = {str(g): grp for g, grp in box.groupby("game_id")}
    order = sorted(games, key=lambda g: games[g].game_date_time.iloc[0])
    played = defaultdict(dict)                   # (game, team) -> athlete -> (minutes, lite, full)
    for g, grp in games.items():
        for r in grp.itertuples():
            played[(g, str(r.team_id))][str(r.athlete_id)] = (float(r.minutes), float(r.gl), float(r.gf))
    meta = {r.id: r for r in sched.itertuples()}
    history = defaultdict(list)
    for g in order:
        teams = {str(t) for t in games[g].team_id.unique()}
        feats = {}
        for team in teams:
            prior = history[team][-10:]
            acc = defaultdict(list)
            for pg in prior:
                for pid, v in played.get((pg, team), {}).items():
                    acc[pid].append(v)
            here = played.get((g, team), {})
            missing = []
            for pid, vs in acc.items():
                mins = sum(v[0] for v in vs) / len(vs)
                if len(vs) >= 3 and mins >= REGULAR_MIN and pid not in here:
                    missing.append((mins, sum(v[1] for v in vs) / len(vs), sum(v[2] for v in vs) / len(vs)))
            feats[team] = missing
            history[team].append(g)
        m = meta.get(g)
        q = lines.get(g)
        if m is None or not q or q.get("spread_close") is None:
            continue
        h, a = str(m.home_id), str(m.away_id)
        if h not in feats or a not in feats or len(history[h]) < 4 or len(history[a]) < 4:
            continue
        rows.append({"season": season, "home": f"{season}-{h}", "away": f"{season}-{a}",
                     "neutral": bool(m.neutral_site), "y": -float(q["spread_close"]), "h": feats[h], "a": feats[a]})
print("games", len(rows), "absent regulars", sum(len(r["h"]) + len(r["a"]) for r in rows))
teams = sorted({r["home"] for r in rows} | {r["away"] for r in rows})
tix = {t: i for i, t in enumerate(teams)}
y = np.array([r["y"] for r in rows])
TERMS = {"role": lambda m, gl, gf: m / 40, "lite": lambda m, gl, gf: gl, "lite2": lambda m, gl, gf: max(gl, 0) ** 2 / 10,
         "full2": lambda m, gl, gf: max(gf, 0) ** 2 / 10}


def design(terms):
    X = np.zeros((len(rows), len(teams) + 1 + len(terms)))
    for n, r in enumerate(rows):
        X[n, tix[r["home"]]] += 1
        X[n, tix[r["away"]]] -= 1
        X[n, len(teams)] = 0 if r["neutral"] else 1
        for j, t in enumerate(terms):
            X[n, len(teams) + 1 + j] = sum(TERMS[t](*x) for x in r["h"]) - sum(TERMS[t](*x) for x in r["a"])
    return X


def solve(X, yy):
    return np.linalg.solve(X.T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ yy)


def heldout(X):
    idx = np.arange(len(rows))
    errs = []
    for k in (0, 1):
        tr, te = idx % 2 == k, idx % 2 != k
        errs.append(float(np.sqrt(np.mean((X[te] @ solve(X[tr], y[tr]) - y[te]) ** 2))))
    return float(np.mean(errs))


results = {"teams_only": heldout(design(()))}
for terms in (("role",), ("role", "lite"), ("role", "lite2"), ("lite2",), ("role", "lite", "lite2"), ("role", "full2")):
    results["+".join(terms)] = heldout(design(terms))
print(json.dumps({k: round(v, 4) for k, v in results.items()}, indent=1))
best = "role+lite2"  # monotonic: production never subtracts value
terms = tuple(best.split("+"))
X = design(terms)
b = solve(X, y)
rng = np.random.default_rng(3)
boots = np.array([solve(X[i], y[i])[len(teams) + 1:] for i in (rng.integers(0, len(rows), len(rows)) for _ in range(200))])
out = {"seasons": SEASONS, "games": len(rows), "regular_minutes": REGULAR_MIN, "terms": list(terms),
       "points": {t: round(-float(c), 4) for t, c in zip(terms, b[len(teams) + 1:])},
       "se": {t: round(float(s), 4) for t, s in zip(terms, boots.std(axis=0))},
       "home_court": round(float(b[len(teams)]), 3),
       "heldout_rmse": {k: round(v, 4) for k, v in results.items()}}
print(json.dumps(out, indent=1))
out["method"] = __doc__.strip()
OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
