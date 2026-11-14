"""CFB: what a missing regular is worth to the closing spread (owner 2026-11-13).

    CFBD_API_KEY=... python scripts/fit_cfb_injury_value.py DATA_DIR [2024 2025]

DATA_DIR keeps what the fit reads, so a rerun fetches only what is new:
cfbd_lines.json (CFBD /lines, regular season) and boxes.jsonl (each game's
ESPN box score, per player: pass attempts and yards, carries, receptions,
tackles). Games with an FBS side only.

Per team-game, the regulars over the team's previous three games by usage
share - QB >= 50% of the pass attempts, runner >= 25% of the carries,
receiver >= 15% of the receptions, defender >= 7% of the tackles. A regular
absent from this game's box is missing. Features (home - away): each
group's missing share, and for a quarterback his share x (yards per attempt
over those games - league). The closing home spread (DraftKings, else the
first book) against a strength per team-season, held out on odd/even games;
the best held-out set is written to outputs/cfb_injury_value.json, which
scripts/cfb_injury_value.py prices listed players with.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "outputs" / "cfb_injury_value.json"
CFBD = "https://api.collegefootballdata.com/lines"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event={}"
THRESH = {"QB": ("att", 0.50), "RB": ("car", 0.25), "WR": ("rec", 0.15), "DEF": ("tkl", 0.07)}
GROUPS = list(THRESH)
METHOD = ("CFBD closing lines (DraftKings, else the first book) for {seasons} regular-season games with an "
          "FBS side, joined to ESPN box scores. Per team-game, regulars over the team's previous three games "
          "by usage share (QB >= 50% of pass attempts, runner >= 25% of carries, receiver >= 15% of "
          "receptions); a regular absent from the box is missing. Closing home spread = strength per "
          "team-season + points per share x (home missing share - away), held out on odd/even games. "
          "Tackle share as a defender's measure and a QB yards-per-attempt term did not help and are not used.")


def fetch_lines(data: Path, seasons: list[int]) -> dict:
    path = data / "cfbd_lines.json"
    lines = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    key = os.environ.get("CFBD_API_KEY")
    for season in seasons:
        if str(season) in lines:
            continue
        if not key:
            sys.exit(f"CFBD_API_KEY is not set and {path} has no {season} lines")
        url = f"{CFBD}?{urllib.parse.urlencode({'year': season, 'seasonType': 'regular'})}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            lines[str(season)] = json.loads(r.read().decode("utf-8"))
        path.write_text(json.dumps(lines), encoding="utf-8")
    return {s: lines[str(s)] for s in seasons}


def _num(text, i=0) -> float:
    try:
        return float(str(text).split("/")[i])
    except (ValueError, IndexError):
        return 0.0


def fetch_boxes(data: Path, lines: dict) -> Path:
    out = data / "boxes.jsonl"
    done = {json.loads(row)["id"] for row in out.open(encoding="utf-8")} if out.exists() else set()
    todo = [(season, g) for season, games in lines.items() for g in games
            if "fbs" in (g.get("homeClassification"), g.get("awayClassification")) and str(g["id"]) not in done]
    print("box scores to fetch:", len(todo), flush=True)
    lock = threading.Lock()
    fh = out.open("a", encoding="utf-8")

    def one(item):
        season, g = item
        try:
            with urllib.request.urlopen(SUMMARY.format(g["id"]), timeout=30) as r:
                d = json.loads(r.read())
        except Exception as exc:  # noqa: BLE001 - a missing box is a skipped game
            print("skip", g["id"], exc, flush=True)
            time.sleep(1.0)
            return
        teams = {}
        for t in (d.get("boxscore") or {}).get("players") or []:
            people = {}
            for cat in t.get("statistics") or []:
                labels = cat.get("labels") or []
                for a in cat.get("athletes") or []:
                    row = people.setdefault(a["athlete"]["id"], {"name": a["athlete"].get("displayName")})
                    st = dict(zip(labels, a.get("stats") or []))
                    if cat["name"] == "passing":
                        row["att"], row["pyds"] = _num(st.get("C/ATT"), 1), _num(st.get("YDS"))
                    elif cat["name"] == "rushing":
                        row["car"] = _num(st.get("CAR"))
                    elif cat["name"] == "receiving":
                        row["rec"] = _num(st.get("REC"))
                    elif cat["name"] == "defensive":
                        row["tkl"] = _num(st.get("TOT"))
            teams[t["team"].get("displayName") or t["team"].get("location")] = people
        line = json.dumps({"id": str(g["id"]), "season": int(season), "week": g.get("week"),
                           "home": g["homeTeam"], "away": g["awayTeam"], "teams": teams,
                           "lines": [[ln.get("provider"), ln.get("spread")] for ln in g.get("lines") or []]})
        with lock:
            fh.write(line + "\n")
            fh.flush()
        time.sleep(0.25)

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(one, todo))
    fh.close()
    return out


def _flat(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _side(display: str, home: str, away: str) -> str | None:
    """ESPN's display name ("Pittsburgh Panthers") against CFBD's ("Pittsburgh")."""
    d, h, a = _flat(display), _flat(home), _flat(away)
    at_home = bool(h) and d.startswith(h)
    away_side = bool(a) and d.startswith(a)
    if at_home != away_side:
        return "home" if at_home else "away"
    return None


def team_games(path: Path, seasons: list[int]) -> tuple[list[dict], float]:
    """One row per game with a line: the home-minus-away missing features."""
    games = [g for g in map(json.loads, path.open(encoding="utf-8")) if g["season"] in seasons]
    games.sort(key=lambda g: (g["season"], g["week"] or 0, g["id"]))
    history: dict[tuple, list] = defaultdict(list)
    rows, league_att, league_yds = [], 0.0, 0.0
    for g in games:
        sides = {}
        for display, people in g["teams"].items():
            s = _side(display, g["home"], g["away"])
            if s:
                sides[s] = people
        if len(sides) == 1:  # the other box is the remaining team
            only = next(iter(sides))
            rest = [p for p in g["teams"].values() if p is not sides[only]]
            if rest:
                sides["away" if only == "home" else "home"] = rest[0]
        if set(sides) != {"home", "away"}:
            continue
        feats = {}
        for s, school in (("home", g["home"]), ("away", g["away"])):
            prior = history[(g["season"], school)][-3:]
            row = dict.fromkeys(GROUPS + ["qbq"], 0.0)
            if len(prior) >= 2:
                team = defaultdict(float)
                mine = defaultdict(lambda: defaultdict(float))
                for gm in prior:
                    for pid, st in gm.items():
                        for stat in ("att", "car", "rec", "tkl", "pyds"):
                            team[stat] += st.get(stat, 0.0)
                            mine[pid][stat] += st.get(stat, 0.0)
                for pid, st in mine.items():
                    if pid in sides[s]:
                        continue
                    for grp, (stat, cut) in THRESH.items():
                        share = st[stat] / team[stat] if team[stat] else 0.0
                        if share >= cut:
                            row[grp] += share
                            if grp == "QB" and st["att"] >= 20:
                                row["qbq"] += share * (st["pyds"] / st["att"])
            feats[s] = row
            history[(g["season"], school)].append(sides[s])
        for st in sides["home"].values():
            league_att += st.get("att", 0.0)
            league_yds += st.get("pyds", 0.0)
        book = {p: v for p, v in g["lines"] if v is not None}
        spread = book.get("DraftKings", next(iter(book.values()), None))
        if spread is None:
            continue
        rows.append({"home": f"{g['season']}{g['home']}", "away": f"{g['season']}{g['away']}",
                     "y": -float(spread), **{k: feats["home"][k] - feats["away"][k] for k in feats["home"]}})
    league_ypa = league_yds / league_att
    for r in rows:  # centre the QB quality term on the league
        r["qbq"] -= league_ypa * r["QB"]
    return rows, league_ypa


def fit(rows: list[dict], league_ypa: float, seasons: list[int]) -> dict:
    teams = sorted({r["home"] for r in rows} | {r["away"] for r in rows})
    tix = {t: i for i, t in enumerate(teams)}
    y = np.array([r["y"] for r in rows])

    def design(cols):
        X = np.zeros((len(rows), len(teams) + 1 + len(cols)))
        for n, r in enumerate(rows):
            X[n, tix[r["home"]]] += 1
            X[n, tix[r["away"]]] -= 1
            X[n, len(teams)] = 1
            for j, c in enumerate(cols):
                X[n, len(teams) + 1 + j] = r[c]
        return X

    def solve(X, yy):
        return np.linalg.solve(X.T @ X + 1e-3 * np.eye(X.shape[1]), X.T @ yy)

    def heldout(cols):
        X, idx, errs = design(cols), np.arange(len(rows)), []
        for k in (0, 1):
            tr, te = idx % 2 == k, idx % 2 != k
            errs.append(float(np.sqrt(np.mean((X[te] @ solve(X[tr], y[tr]) - y[te]) ** 2))))
        return float(np.mean(errs))

    res = {"teams_only": heldout([])}
    for cols in (GROUPS, GROUPS + ["qbq"], ["QB", "qbq"], ["QB", "RB", "WR"]):
        res["+".join(cols)] = heldout(cols)
    best = min((k for k in res if k != "teams_only"), key=res.get).split("+")
    X = design(best)
    b = solve(X, y)
    rng = np.random.default_rng(9)
    boots = np.array([solve(X[i], y[i])[len(teams) + 1:]
                      for i in (rng.integers(0, len(rows), len(rows)) for _ in range(200))])
    return {"games": len(rows), "terms": best, "league_ypa": round(league_ypa, 4), "thresholds": THRESH,
            "points_per_share": {c: round(-float(v), 4) for c, v in zip(best, b[len(teams) + 1:])},
            "se": {c: round(float(s), 4) for c, s in zip(best, boots.std(axis=0))},
            "home_field": round(float(b[len(teams)]), 3),
            "heldout_rmse": {k: round(v, 4) for k, v in res.items()}, "seasons": seasons,
            "method": METHOD.format(seasons=f"{seasons[0]}-{str(seasons[-1])[2:]}"
                                    if len(seasons) > 1 else str(seasons[0]))}


def main() -> None:
    data = Path(sys.argv[1] if len(sys.argv) > 1 else "data/cache/cfb_injury_fit")
    seasons = [int(a) for a in sys.argv[2:]] or [2024, 2025]
    data.mkdir(parents=True, exist_ok=True)
    boxes = fetch_boxes(data, fetch_lines(data, seasons))
    rows, league_ypa = team_games(boxes, seasons)
    out = fit(rows, league_ypa, seasons)
    print(json.dumps({k: out[k] for k in ("games", "terms", "points_per_share", "se", "heldout_rmse")}, indent=1))
    OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
