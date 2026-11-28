"""What a trip is worth: rest, distance and the games either side of this one.

    python scripts/fit_trip_difficulty.py cfb [2021 2022 2023 2024 2025 2026]

Walk-forward, the way scripts/cfb_strength.py is fitted: rate every team on
the weeks before the one being predicted, predict that week's result from the
ratings and home field, and ask what the five scheduling features explain of
what is left. Nothing here reads a line or a forecast; the response is the
game's own result against what the ratings expected of it.

Three responses are fitted side by side, so the desk can say which side of the
ball a trip shows up on:

    margin    the game's margin against expectation
    offense   the team's own points against what its offence was expected to
              score on this opponent
    defense   the points it allowed against what its defence was expected to
              give up (a positive weight means a trip costs it points)

The five features, per team-game:

    rest       days since that team's previous game
    miles      great-circle distance from its own home venue to this one
    tz         time zones between the two
    letdown    its previous opponent's rating minus this opponent's
    lookahead  its next opponent's rating minus this opponent's

The last two are named for what people look for in them. The measurement says
the opposite: over 2021-2026 a team sandwiched between tougher games beats
expectation rather than falling short, and that holds with a control for how
its own last game went, so it is not the rating still digesting last week.
The desk must not call it a let-down.

Every figure is held out: each season is scored by weights fitted on the other
seasons (leave-one-season-out), against predicting zero.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

FEATURES = ("rest", "miles", "tz", "letdown", "lookahead")
RESPONSES = ("margin", "offense", "defense")
RIDGE = 4.0
MIN_GAMES_BEFORE = 250


def _when(value) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


# --------------------------------------------------------------------------
# Sport adapters: each returns completed games in one shape, and a place for
# every team. A sport whose schedule or venues we cannot read is skipped, not
# guessed at.
# --------------------------------------------------------------------------

def cfb_games(season: int) -> list[dict]:
    import cfb_depth
    out = []
    for g in cfb_depth.season_games(season):
        if not (g.get("completed") and g.get("homeClassification") == "fbs"
                and g.get("awayClassification") == "fbs"):
            continue
        if g.get("homePoints") is None or g.get("awayPoints") is None:
            continue
        out.append({"season": season, "week": g["week"], "start": g["startDate"],
                    "home": g["homeTeam"], "away": g["awayTeam"],
                    "home_points": float(g["homePoints"]), "away_points": float(g["awayPoints"]),
                    "neutral": bool(g.get("neutralSite"))})
    out.sort(key=lambda g: _when(g["start"]))
    return out


def cfb_places() -> dict[str, dict]:
    """Each school's home city, geocoded once (outputs/cfb_home_places.json)."""
    path = ROOT / "outputs" / "cfb_home_places.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    import cfb_depth
    from pipeline.cbb_public import venues
    seen: dict[str, dict[str, int]] = {}
    for week in range(1, 17):
        for event in cfb_depth._week_events(datetime.now().year, week):
            comp = (event.get("competitions") or [{}])[0]
            if comp.get("neutralSite"):
                continue
            address = (comp.get("venue") or {}).get("address") or {}
            city = ", ".join(x for x in (address.get("city"), address.get("state")) if x)
            host = next((c for c in comp.get("competitors") or [] if c.get("homeAway") == "home"), None)
            name = ((host or {}).get("team") or {}).get("location")
            if city and name:
                seen.setdefault(name, {})[city] = seen.setdefault(name, {}).get(city, 0) + 1
    cache = json.loads(venues.CACHE.read_text(encoding="utf-8")) if venues.CACHE.exists() else {}
    places = {}
    for school, counts in seen.items():
        key = max(counts, key=counts.get)
        hit = cache.get(key)
        if not hit:
            city, _, state = key.rpartition(", ")
            hit = venues.geocode(city, state)
        if hit:
            places[school] = {**hit, "city": key}
    path.write_text(json.dumps(places, indent=1, sort_keys=True), encoding="utf-8")
    return places


ADAPTERS = {"cfb": (cfb_games, cfb_places)}


# --------------------------------------------------------------------------
# Walk-forward ratings
# --------------------------------------------------------------------------

def _ratings(games: list[dict], teams: list[str]) -> tuple[dict, float, dict, dict, float]:
    """Ridge team ratings from margins, and from points scored and allowed.

    Returns (net rating, home field, offence, defence, league points)."""
    index = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    rows = len(games)
    A = np.zeros((rows, n + 1))
    margin = np.zeros(rows)
    for r, g in enumerate(games):
        A[r, index[g["home"]]] = 1
        A[r, index[g["away"]]] = -1
        A[r, n] = 0 if g["neutral"] else 1
        margin[r] = g["home_points"] - g["away_points"]
    reg = np.eye(n + 1) * RIDGE
    reg[n, n] = 0.0
    beta = np.linalg.solve(A.T @ A + reg, A.T @ margin)
    net = {t: beta[i] for t, i in index.items()}

    # Points scored: a league level, the team's own offence, the opponent's
    # defence and home field. The league level and home field are not
    # penalised; without that level the ridge pulls every unit toward zero and
    # leaves the league's scoring in the residual, where it would masquerade as
    # a travel effect (every home side travels zero miles).
    B = np.zeros((rows * 2, 2 * n + 2))
    scored = np.zeros(rows * 2)
    for r, g in enumerate(games):
        for k, (team, opponent, points, at_home) in enumerate((
                (g["home"], g["away"], g["home_points"], not g["neutral"]),
                (g["away"], g["home"], g["away_points"], False))):
            row = r * 2 + k
            B[row, index[team]] = 1
            B[row, n + index[opponent]] = 1
            B[row, 2 * n] = 1 if at_home else 0
            B[row, 2 * n + 1] = 1
            scored[row] = points
    reg2 = np.eye(2 * n + 2) * RIDGE
    reg2[2 * n, 2 * n] = reg2[2 * n + 1, 2 * n + 1] = 0.0
    gamma = np.linalg.solve(B.T @ B + reg2, B.T @ scored)
    offense = {t: gamma[i] for t, i in index.items()}
    defense = {t: gamma[n + i] for t, i in index.items()}
    return net, beta[n], offense, defense, gamma[2 * n], gamma[2 * n + 1]


def _schedule(games: list[dict]) -> dict[str, list[tuple]]:
    out: dict[str, list[tuple]] = {}
    for g in games:
        for side in ("home", "away"):
            other = "away" if side == "home" else "home"
            out.setdefault(g[side], []).append((_when(g["start"]), g, g[other], side == "home"))
    for team in out:
        out[team].sort(key=lambda x: x[0])
    return out


def rows_for(sport: str, season: int, places: dict) -> list[dict]:
    from pipeline.cbb_public import venues
    games = ADAPTERS[sport][0](season)
    if len(games) < MIN_GAMES_BEFORE:
        return []
    teams = sorted({g["home"] for g in games} | {g["away"] for g in games})
    schedule = _schedule(games)
    out = []
    for week in sorted({g["week"] for g in games}):
        before = [g for g in games if g["week"] < week]
        if len(before) < MIN_GAMES_BEFORE:
            continue
        net, hfa, offense, defense, home_points, league = _ratings(before, teams)
        for g in (x for x in games if x["week"] == week):
            sides = {}
            for side in ("home", "away"):
                team, opponent = g[side], g["away" if side == "home" else "home"]
                mine = schedule[team]
                at = next((i for i, x in enumerate(mine) if x[1] is g), None)
                if at is None or at == 0 or at + 1 >= len(mine):
                    break
                previous, nxt = mine[at - 1], mine[at + 1]
                here, home = places.get(g["home"]), places.get(team)
                if g["neutral"] or not here or not home:
                    break
                day = _when(g["start"]).date().isoformat()
                a, b = venues.utc_hours(home, day), venues.utc_hours(here, day)
                sides[side] = {
                    "rest": (_when(g["start"]) - previous[0]).total_seconds() / 86400,
                    "miles": 0.0 if side == "home" else (venues.miles(home, here) or 0.0),
                    "tz": abs(a - b) if (a is not None and b is not None) else None,
                    "letdown": net.get(previous[2], 0.0) - net.get(opponent, 0.0),
                    "lookahead": net.get(nxt[2], 0.0) - net.get(opponent, 0.0),
                }
            if len(sides) != 2 or any(v["tz"] is None for v in sides.values()):
                continue
            expect_margin = net.get(g["home"], 0.0) - net.get(g["away"], 0.0) + (0 if g["neutral"] else hfa)
            residual = {"margin": (g["home_points"] - g["away_points"]) - expect_margin}
            for side in ("home", "away"):
                team, opponent = g[side], g["away" if side == "home" else "home"]
                scored = g[side + "_points"]
                allowed = g[("away" if side == "home" else "home") + "_points"]
                at_home = side == "home" and not g["neutral"]
                expect_for = (league + offense.get(team, 0.0) + defense.get(opponent, 0.0)
                              + (home_points if at_home else 0))
                opponent_home = side == "away" and not g["neutral"]
                expect_against = (league + offense.get(opponent, 0.0) + defense.get(team, 0.0)
                                  + (home_points if opponent_home else 0))
                residual[side + "_offense"] = scored - expect_for
                residual[side + "_defense"] = allowed - expect_against
            out.append({"season": season, "week": week, "home": sides["home"], "away": sides["away"],
                        **residual})
    return out


# --------------------------------------------------------------------------
# Fit
# --------------------------------------------------------------------------

def _design(rows: list[dict], response: str):
    """Features as home-minus-away for the margin, and as one row per side for
    the unit responses: a trip is the same thing whoever takes it."""
    X, y = [], []
    for r in rows:
        if response == "margin":
            X.append([1.0] + [r["home"][k] - r["away"][k] for k in FEATURES])
            y.append(r["margin"])
        else:
            for side in ("home", "away"):
                X.append([1.0] + [r[side][k] for k in FEATURES])
                y.append(r[f"{side}_{response}"])
    return np.array(X), np.array(y)


def _seasons_of(rows: list[dict], response: str) -> np.ndarray:
    each = [r["season"] for r in rows]
    return np.array(each if response == "margin" else [s for s in each for _ in (0, 1)])


def _permutation(X, y, seasons, real: float, draws: int = 400, seed: int = 20261128) -> float:
    """How often a shuffled response scores as well held out: the share is the
    p-value for the whole fit, which a small R^2 needs before it is believed."""
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(draws):
        shuffled = rng.permutation(y)
        each = []
        for season in sorted(set(seasons.tolist())):
            train, test = seasons != season, seasons == season
            b, *_ = np.linalg.lstsq(X[train], shuffled[train], rcond=None)
            null = float(shuffled[train].mean())
            ss_res = float(((shuffled[test] - X[test] @ b) ** 2).sum())
            ss_tot = float(((shuffled[test] - null) ** 2).sum())
            each.append(1 - ss_res / ss_tot)
        hits += float(np.mean(each)) >= real
    return round(hits / draws, 4)


def _t_values(X, y, beta) -> dict:
    resid = y - X @ beta
    dof = len(y) - X.shape[1]
    sigma2 = float(resid @ resid) / dof
    se = np.sqrt(np.diag(sigma2 * np.linalg.inv(X.T @ X)))
    return {name: round(float(b / s), 2) if s else 0.0
            for name, b, s in zip(("intercept",) + FEATURES, beta, se)}


def fit(rows: list[dict]) -> dict:
    out = {"weights": {}, "fit": {}}
    for response in RESPONSES:
        X, y = _design(rows, response)
        seasons = _seasons_of(rows, response)
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        scores = {}
        for season in sorted(set(seasons.tolist())):
            train, test = seasons != season, seasons == season
            if not test.any() or not train.any():
                continue
            b, *_ = np.linalg.lstsq(X[train], y[train], rcond=None)
            prediction = X[test] @ b
            # The null is an intercept fitted on the same training seasons, not
            # zero: these residuals carry a bias, and scoring against zero
            # would credit the features with removing it.
            null = float(y[train].mean())
            ss_res = float(((y[test] - prediction) ** 2).sum())
            ss_tot = float(((y[test] - null) ** 2).sum())
            scores[int(season)] = round(1 - ss_res / ss_tot, 4)
        out["weights"][response] = {"intercept": round(float(beta[0]), 4),
                                    **{k: round(float(v), 6) for k, v in zip(FEATURES, beta[1:])}}
        held_out = float(np.mean(list(scores.values())))
        out["fit"][response] = {"held_out_r2": round(held_out, 4),
                                "by_season": scores, "rows": int(len(y)),
                                "response_sd": round(float(y.std()), 2),
                                "null": "an intercept fitted on the training seasons",
                                "t_values": _t_values(X, y, beta),
                                "shuffled_p": _permutation(X, y, seasons, held_out)}
    return out


def main(argv: list[str]) -> int:
    sport = (argv[0] if argv else "cfb").lower()
    if sport not in ADAPTERS:
        print(f"no adapter for {sport}; have {sorted(ADAPTERS)}")
        return 2
    seasons = [int(x) for x in argv[1:]] or list(range(2021, datetime.now().year + 1))
    places = ADAPTERS[sport][1]()
    print(f"{sport}: {len(places)} teams placed")
    rows: list[dict] = []
    for season in seasons:
        got = rows_for(sport, season, places)
        print(f"  {season}: {len(got)} rated games")
        rows += got
    if not rows:
        print("no rated games; nothing written")
        return 1
    report = fit(rows)
    means = {k: round(float(np.mean([r[side][k] for r in rows for side in ("home", "away")])), 4)
             for k in FEATURES}
    payload = {"sport": sport, "seasons": seasons, "games": len(rows), "features": list(FEATURES),
               "league_mean": means, **report,
               "method": (
                   "Walk-forward over %s: teams rated on the weeks before each one, then the game's own "
                   "result against that expectation regressed on rest days, great-circle miles, time zones "
                   "crossed, and the rating gap from the previous and next opponent to this one. Margin is "
                   "fitted on the home-minus-away difference; points scored and allowed are fitted per side. "
                   "Each season is scored by weights fitted on the other seasons." % (
                       ", ".join(str(s) for s in seasons))),
               "sequence_note": (
                   "Over these seasons a team between two tougher games beats expectation rather than "
                   "falling short, with or without a control for how its own last game went. The measure "
                   "is a schedule spot, not a let-down.")}
    out = ROOT / "outputs" / f"trip_difficulty_{sport}.json"
    out.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT)}")
    for response in RESPONSES:
        f = report["fit"][response]
        print(f"  {response:8} held-out R2 {f['held_out_r2']:+.4f}  "
              f"(sd {f['response_sd']}, n={f['rows']})  by season "
              + " ".join(f"{v:+.3f}" for v in f["by_season"].values()))
        print("           " + "  ".join(f"{k} {report['weights'][response][k]:+.4f}" for k in FEATURES))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
