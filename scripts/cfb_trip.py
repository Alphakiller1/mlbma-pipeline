"""The X Factor Score: what a school's scheduling spot is worth this week.

Five facts are measured about a team's week. Two of them earn a place in the
score, because adding any of the other three makes the held-out fit worse
(scripts/fit_trip_difficulty.py, outputs/trip_difficulty_cfb.json):

    scored    Travel, as the square root of great-circle miles from its own
              home venue, and Next Opponent, that opponent's rating minus
              this one's
    measured  Rest, Zones and Previous Opponent, each shown with its value
              and marked as not in the score

The score is the sum of those two prices against the league's average week,
in points of margin, over 2021-2026 and 2,260 walk-forward games. A visitor
flying 1,000 miles is worth -2.0 points; a team whose next opponent rates ten
points better than this one is worth +0.85.

Which side of the ball it lands on is measured, not assumed. The same fit
against points scored and points allowed, each with a home-field term of its
own, splits that 2.0-point trip into 1.3 points more allowed and 0.8 fewer
scored, and the two halves add back to the margin. The defensive half is the
one that stands on its own (t +2.51 against -1.47), and the panel marks each
line with whether it does.

It is an empirical read, not a regression one: this game's own result against
a rating fitted on the weeks before it, scored out of sample. It does not say
what a club is due to give back - that is Regression Watch - and it is small,
so the panel prints its size.

The Next Opponent term is named for the schedule, not for a mood. Over these
seasons a team facing a tougher game next week beats expectation this week
rather than overlooking it, so nothing here is a look-ahead trap.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

FIT = ROOT / "outputs" / "trip_difficulty_cfb.json"
PLACES = ROOT / "outputs" / "cfb_home_places.json"
SCHEMA = "cfb-x-factor/1"
WINDOW_DAYS = 10
# key, desk label, unit. The order the panel prints them in.
ROWS = (("miles", "Travel", "miles"), ("lookahead", "Next Opponent", "rating"),
        ("rest", "Rest", "days"), ("tz", "Zones", "zones"),
        ("letdown", "Previous Opponent", "rating"))
# A |t| this far from zero is a line that stands on its own.
STANDS_ALONE = 2.0


def _load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _model_value(key: str, values: dict):
    """The feature the fit priced, from the measured week."""
    if key == "sqrt_miles":
        return None if values.get("miles") is None else math.sqrt(max(float(values["miles"]), 0.0))
    return values.get(key)


def priced(fit: dict, values: dict) -> dict:
    """{response: points} for this week, and the per-input points of the
    scored features. Only the features the fit scores carry points."""
    mean, weights = fit["league_mean"], fit["weights"]
    out = {"points": {}, "by_input": {}}
    for response in ("margin", "offense", "defense"):
        total, known = 0.0, False
        for key in fit["features"]:
            value = _model_value(key, values)
            if value is None:
                continue
            known = True
            part = weights[response][key] * (float(value) - mean[key])
            total += part
            if response == "margin":
                out["by_input"][key] = round(part, 2)
        out["points"][response] = round(total, 2) if known else None
    return out


def _entry(fit: dict, key: str, label: str, unit: str, values: dict, by_input: dict) -> dict:
    """One printed row: its value, its points when it is scored, and the
    record of why it is not when it is not."""
    model_key = "sqrt_miles" if key == "miles" else key
    scored = model_key in fit["features"]
    row = {"key": key, "label": label, "unit": unit, "value": values.get(key), "scored": scored,
           "points": by_input.get(model_key) if scored else None}
    if not scored:
        # `scored` and the held-out number say it; the panel phrases it. A
        # free-text note here would publish as a model label.
        rejected = (fit.get("not_scored") or {}).get(key) or {}
        row["held_out_r2_with_it"] = rejected.get("held_out_r2_with_it")
    return row


def build(season: int, as_of: datetime | None = None) -> dict[str, dict]:
    """{normalized school: its X Factor block} for this week's games.

    Returns {} when the fit, the places or the schedule are unavailable: the
    desk prints nothing rather than a score built on a guess.
    """
    import cfb_depth
    from fit_trip_difficulty import _ratings, _when
    from pipeline.cbb_public import venues

    fit, places = _load(FIT), _load(PLACES)
    if not fit or not places:
        return {}
    games = [g for g in cfb_depth.season_games(season)
             if g.get("homeClassification") == "fbs" and g.get("awayClassification") == "fbs"]
    if not games:
        return {}
    games.sort(key=lambda g: _when(g["startDate"]))
    played = [{"home": g["homeTeam"], "away": g["awayTeam"], "neutral": bool(g.get("neutralSite")),
               "home_points": float(g["homePoints"]), "away_points": float(g["awayPoints"])}
              for g in games if g.get("completed") and g.get("homePoints") is not None
              and g.get("awayPoints") is not None]
    if len(played) < 100:
        return {}
    teams = sorted({g["home"] for g in played} | {g["away"] for g in played})
    rating = _ratings(played, teams)[0]
    now = as_of or datetime.now(timezone.utc)

    schedule: dict[str, list] = {}
    for g in games:
        for side, other in (("homeTeam", "awayTeam"), ("awayTeam", "homeTeam")):
            schedule.setdefault(g[side], []).append((_when(g["startDate"]), g, g[other]))
    for team in schedule:
        schedule[team].sort(key=lambda x: x[0])

    out: dict[str, dict] = {}
    for g in games:
        kickoff = _when(g["startDate"])
        if g.get("completed") or not kickoff or abs((kickoff - now).days) > WINDOW_DAYS:
            continue
        for side in ("homeTeam", "awayTeam"):
            team = g[side]
            opponent = g["awayTeam" if side == "homeTeam" else "homeTeam"]
            mine = schedule.get(team) or []
            at = next((i for i, x in enumerate(mine) if x[1] is g), None)
            if at is None:
                continue
            previous = next((mine[i] for i in range(at - 1, -1, -1) if mine[i][1].get("completed")), None)
            nxt = mine[at + 1] if at + 1 < len(mine) else None
            here, home = places.get(g["homeTeam"]), places.get(team)
            values: dict = {
                "rest": round((kickoff - previous[0]).total_seconds() / 86400, 1) if previous else None,
                "miles": None, "tz": None,
                "letdown": round(rating.get(previous[2], 0.0) - rating.get(opponent, 0.0), 2) if previous else None,
                "lookahead": round(rating.get(nxt[2], 0.0) - rating.get(opponent, 0.0), 2) if nxt else None,
            }
            if here and home and not g.get("neutralSite"):
                values["miles"] = round(0.0 if side == "homeTeam" else (venues.miles(home, here) or 0.0))
                day = kickoff.date().isoformat()
                a, b = venues.utc_hours(home, day), venues.utc_hours(here, day)
                values["tz"] = round(abs(a - b), 1) if (a is not None and b is not None) else None
            prices = priced(fit, values)
            if prices["points"]["margin"] is None:
                continue
            units = {}
            for response in ("offense", "defense"):
                t = fit["fit"][response]["t_values"]
                units[response] = {
                    "points": prices["points"][response],
                    # A line stands on its own when the features it is built
                    # from do; otherwise it is a share of a measured total and
                    # is marked as one.
                    "stands_alone": any(abs(t.get(k, 0.0)) >= STANDS_ALONE for k in fit["features"]),
                    "held_out_r2": fit["fit"][response]["held_out_r2"],
                    "shuffled_p": fit["fit"][response]["shuffled_p"],
                }
            out[cfb_depth._norm(team)] = {
                "schema": SCHEMA,
                "score": prices["points"]["margin"],
                "home_game": side == "homeTeam" and not g.get("neutralSite"),
                "neutral": bool(g.get("neutralSite")),
                "inputs": [_entry(fit, key, label, unit, values, prices["by_input"])
                           for key, label, unit in ROWS],
                "units": units,
                "basis": "empirical",
                "fit": {"held_out_r2": fit["fit"]["margin"]["held_out_r2"],
                        "shuffled_p": fit["fit"]["margin"]["shuffled_p"],
                        "seasons": fit["seasons"], "games": fit["games"],
                        "response_sd": fit["fit"]["margin"]["response_sd"]},
                "method": fit["method"],
                "sequence_note": fit["sequence_note"],
            }
    return ranked(out)


def ranked(blocks: dict[str, dict]) -> dict[str, dict]:
    """Every block's place among this week's schools (1st = the best spot),
    so a score is read against the week it belongs to."""
    pool = sorted((b["score"] for b in blocks.values()), reverse=True)
    for block in blocks.values():
        block["place"] = {"rank": 1 + sum(1 for v in pool if v > block["score"] + 1e-9),
                          "of": len(pool)}
    return blocks


if __name__ == "__main__":  # pragma: no cover - a look at this week
    year = int(sys.argv[1]) if len(sys.argv) > 1 else datetime.now().year
    built = build(year)
    print(str(len(built)) + " schools")
    for name, block in sorted(built.items(), key=lambda kv: kv[1]["score"])[:4] + \
            sorted(built.items(), key=lambda kv: kv[1]["score"], reverse=True)[:4]:
        units = block["units"]
        print("  %-22s %+6.2f  rank %3d/%d   scores %+5.2f  allows %+5.2f"
              % (name, block["score"], block["place"]["rank"], block["place"]["of"],
                 units["offense"]["points"], units["defense"]["points"]))
        for part in block["inputs"]:
            points = "not scored" if part["points"] is None else format(part["points"], "+.2f")
            print("        %-18s %-8s %s" % (part["label"], part["value"], points))
