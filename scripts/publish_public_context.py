#!/usr/bin/env python3
"""Publish the public projections of the two shared context artifacts.

The public pages were reading `dashboard/team_rankings_snapshot.json` and
`dashboard/league_baselines.json` directly. The rendering code was careful -
the snapshot's `status` family, which carries projOSI and ppGap, was never
read - but care at render time is not the boundary. Both files were served
whole to every visitor, so projOSI, ppGap, xwOBA and xFIP for all thirty clubs
arrived on the reader's machine on every page load.

A field that arrives unrendered has still been published. So the public pages
now read projections written here: the private families are not filtered out
downstream, they are never written.

Run after the pipeline refreshes the snapshot:

    python scripts/publish_public_context.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "dashboard" / "team_rankings_snapshot.json"
PITCH_MIX = "pitch_mix_team_batting.csv"
BASELINES = ROOT / "dashboard" / "league_baselines.json"
PUBLIC = ROOT / "data" / "public"

# The families that hold descriptive team context.
#
# `status` is read for three of its five keys. It was excluded wholesale, which
# was wrong: it carries two forecasts - projOSI and ppGap - alongside three
# descriptive rates. xwOBA was named descriptive_public in the first version of
# the classification and should never have been swept out with them; xFIP is
# the same class of number, and PALS describes the schedule a club has already
# faced. The two forecasts are excluded by name, not the family by accident.
PUBLIC_FAMILIES = ("scoring", "difficulty", "status", "surface")
FORECAST_KEYS = ("projOSI", "ppGap")

# Which metric each family contributes, how many digits it is meaningful to,
# and which end of the distribution earns rank 1.
PUBLIC_METRICS = {
    "osi": (1, "high"), "wrc": (0, "high"), "woba": (3, "high"),
    "rcv": (1, "high"), "abq": (1, "high"), "obr": (1, "high"),
    "pitchScore": (0, "high"),
    # Strength of schedule: higher PALS means a harder run of pitching already
    # faced, so rank 1 is the toughest schedule, not the easiest.
    "pals": (1, "high"),
    "xwoba": (3, "high"),
    # xFIP is an ERA-scale rate, so low is good.
    "xfip": (2, "low"),
    # The winning family. All three are records of games already played.
    "winPct": (1, "high"),
    "f5WinPct": (1, "high"),
    "pitcherWinPct": (1, "high"),
}

METRIC_LABELS = {
    "osi": "OSI", "wrc": "wRC+", "woba": "wOBA", "rcv": "RCV", "abq": "ABQ",
    "obr": "OBR", "pitchScore": "Pitch Score", "pals": "SOS",
    "xwoba": "xwOBA", "xfip": "xFIP",
    "winPct": "Win%", "f5WinPct": "F5 Win%", "pitcherWinPct": "SP Win%",
}

# Baseline keys a public page may know. Anything modelled or expected is out -
# `projosi` is the one forecast in the source file and is never named here.
#
# A league mean and spread is not a club's number, but the list is still named
# key by key. It used to carry "k" and "bb", which exist in no baselines file
# (the keys are kpct / bbpct), and to omit xfip - so the starter splits table
# graded xFIP, K% and BB% against hand-typed first-paint numbers all season.
PUBLIC_BASELINES = {
    "osi", "abq", "rcv", "obr", "woba", "xwoba", "slg", "avg", "obp", "ops", "iso",
    "wrc", "hr", "barrel", "hardhit", "pitching",
    "era", "whip", "fip", "xfip", "hr9", "bb9", "k9", "kpct", "bbpct",
    "team_era", "team_fip", "team_whip", "team_hr9",
    "bp_era", "bp_fip", "bp_whip", "bp_hr9", "bp_kpct", "bp_bbpct", "bp_score",
    "bp_osi_allowed",
    "rp_era", "rp_fip", "rp_whip", "rp_hr9", "rp_kpct", "rp_bbpct",
    "rp_osi_allowed", "rp_abq_allowed",
    "sp_osi_allowed", "sp_abq_allowed", "sp_oor_faced", "sp_qs_pct", "sp_pitch_score",
    "sp_ops_allowed",
}
# Generated population x split families (core.compute_baselines). Every key in
# them is an observed rate on a published split, so they are admitted by family.
PUBLIC_BASELINE_FAMILIES = ("sp_vs_lhh_", "sp_vs_rhh_", "sp_home_", "sp_away_", "bat_", "tm_")


def is_public_baseline(key: str) -> bool:
    return key in PUBLIC_BASELINES or key.startswith(PUBLIC_BASELINE_FAMILIES)

# The snapshot keeps Baseball-Reference codes; the schedule keeps the club's
# own. Seven of thirty disagree, so the join is done here, once, rather than in
# every consumer.
TEAM_ALIAS = {
    "ARI": "AZ", "ARZ": "AZ", "CHW": "CWS", "KCR": "KC", "SDP": "SD",
    "SFG": "SF", "TBR": "TB", "TBD": "TB", "WSN": "WSH", "WAS": "WSH",
}


def canon(code: str) -> str:
    key = str(code or "").upper().strip()
    return TEAM_ALIAS.get(key, key)


def team_context(snapshot: dict) -> dict:
    """Descriptive team metrics with ranks recomputed from the values themselves."""
    families = snapshot.get("families") or {}
    by_team: dict[str, dict] = {}
    for family in PUBLIC_FAMILIES:
        rows = (families.get(family) or {}).get("rows") or []
        for key, (digits, better) in PUBLIC_METRICS.items():
            if key in FORECAST_KEYS:
                continue
            scored = sorted(
                ((canon(row.get("t")), float(row[key]))
                 for row in rows
                 if row.get(key) is not None and isinstance(row[key], (int, float))),
                key=lambda pair: pair[1], reverse=(better == "high"))
            for index, (team, value) in enumerate(scored):
                if not team:
                    continue
                by_team.setdefault(team, {})[key] = {
                    "label": METRIC_LABELS.get(key, key),
                    "value": round(value, digits),
                    "better": better,
                    "rank": index + 1,
                    "of": len(scored),
                }
    return by_team


# How each club has actually hit each pitch type. The legacy pitch-mix table
# read this and it is the missing half of the arsenal section: knowing a starter
# throws 36% four-seamers only means something beside how the lineup he faces
# has handled four-seamers.
#
# A caveat worth carrying in the copy rather than in a comment: pitch-type
# specific team hitting has been measured on this data and does NOT persist
# from one window to the next. It describes what happened. It is not a read on
# what will happen, which is exactly why it belongs on a factual page with its
# sample size beside it and nowhere near a projection.
PITCH_METRICS = {
    # key: (digits, better-for-the-hitting-team)
    "xwoba": (3, "high"),
    # Contact rate, not whiff rate. They are the same measurement read from
    # opposite ends - contact is 100 minus whiff - but a column of contact
    # rates reads the same direction as every other hitting number beside it,
    # where whiff rate alone was the one figure on the row a reader had to
    # invert in their head.
    "contact_rate": (1, "high"),
    "batting_avg": (3, "high"),
}


def pitch_type_board(data_dir: Path) -> dict:
    """Per club, per pitch type: how they have hit it, and where that ranks."""
    import csv

    path = Path(data_dir) / PITCH_MIX
    if not path.is_file():
        return {}
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            team = canon(row.get("team_abbr"))
            code = str(row.get("pitch_type") or "").upper()
            if not team or not code:
                continue
            try:
                pitches = int(float(row.get("pitches") or 0))
            except ValueError:
                pitches = 0
            # A club that has seen a handful of a pitch has no rate worth
            # ranking, so it is excluded from the pool rather than ranked in it.
            if pitches < 150:
                continue
            entry = {"team": team, "code": code, "pitches": pitches,
                     "name": row.get("pitch_name") or code}
            for key in PITCH_METRICS:
                try:
                    entry[key] = float(row[key])
                except (TypeError, ValueError, KeyError):
                    entry[key] = None
            # Derived from the whiff rate the source does carry, once, here -
            # rather than in each consumer, where two of them would eventually
            # disagree about whether it was a share or a percentage.
            if entry.get("contact_rate") is None:
                try:
                    entry["contact_rate"] = round(100.0 - float(row["whiff_rate"]), 1)
                except (TypeError, ValueError, KeyError):
                    entry["contact_rate"] = None
            rows.append(entry)

    board: dict = {}
    codes = {r["code"] for r in rows}
    for code in codes:
        pool = [r for r in rows if r["code"] == code]
        for key, (digits, better) in PITCH_METRICS.items():
            scored = sorted((r for r in pool if r[key] is not None),
                            key=lambda r: r[key], reverse=(better == "high"))
            for index, row in enumerate(scored):
                slot = board.setdefault(row["team"], {}).setdefault(code, {
                    "name": row["name"], "pitches": row["pitches"],
                })
                slot[key] = {
                    "value": round(row[key], digits),
                    "better": better,
                    "rank": index + 1,
                    "of": len(scored),
                }
    return board


# Rolling form from the per-game record.
#
# The legacy card carried a sparkline of OSI across YTD / L30 / L14 / L7 and it
# is the one graphic still missing. OSI cannot be rebuilt here - it is a
# plate-appearance quality index and game results do not carry the inputs - so
# this is not that line relabelled. It is the trend that IS in the data: runs
# scored per game and win rate over the same four windows, off the completed
# game record. It is named for what it measures.
FORM_WINDOWS = (("l7", 7), ("l14", 14), ("l30", 30))


def rolling_form(data_dir: Path) -> dict:
    import csv

    path = Path(data_dir) / "game_results.csv"
    if not path.is_file():
        return {}
    by_team: dict[str, list[dict]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            team = canon(row.get("team"))
            if not team or not row.get("date"):
                continue
            try:
                runs = int(float(row.get("team_runs") or 0))
                allowed = int(float(row.get("opp_runs") or 0))
            except ValueError:
                continue
            by_team.setdefault(team, []).append({
                "date": row["date"], "runs": runs, "allowed": allowed,
                "won": str(row.get("result") or "").upper().startswith("W"),
            })

    out: dict[str, dict] = {}
    for team, games in by_team.items():
        games.sort(key=lambda g: g["date"])
        windows = {}
        for name, size in FORM_WINDOWS:
            span = games[-size:]
            if not span:
                continue
            windows[name] = {
                "games": len(span),
                "runs_per_game": round(sum(g["runs"] for g in span) / len(span), 2),
                "allowed_per_game": round(sum(g["allowed"] for g in span) / len(span), 2),
                "wins": sum(1 for g in span if g["won"]),
            }
        if games:
            windows["ytd"] = {
                "games": len(games),
                "runs_per_game": round(sum(g["runs"] for g in games) / len(games), 2),
                "allowed_per_game": round(sum(g["allowed"] for g in games) / len(games), 2),
                "wins": sum(1 for g in games if g["won"]),
            }
        out[team] = {"windows": windows,
                     "through": games[-1]["date"] if games else None}

    # Rank each window's scoring against the league, so a trend line can say
    # where the club sits as well as which way it is moving.
    for name, _ in list(FORM_WINDOWS) + [("ytd", 0)]:
        pool = [(t, v["windows"][name]["runs_per_game"])
                for t, v in out.items() if name in v["windows"]]
        ordered = sorted(pool, key=lambda pair: pair[1], reverse=True)
        for index, (team, _) in enumerate(ordered):
            out[team]["windows"][name]["rank"] = index + 1
            out[team]["windows"][name]["of"] = len(ordered)
    return out


def park_factors(data_dir: Path) -> dict:
    """How a park has actually played, from the completed-game record.

    The basic form: total runs per game at the park, both clubs counted,
    against that club's total runs per game on the road. 100 is neutral, 115
    means fifteen per cent more scoring than the same clubs produced away.

    It is a description of this season at this park - the sample is stated so
    the reader can weigh it - and not a coefficient lifted from a model. A park
    with fewer than twenty games either side is left out rather than estimated.
    """
    import csv

    path = Path(data_dir) / "game_results.csv"
    if not path.is_file():
        return {}
    home: dict[str, list[int]] = {}
    away: dict[str, list[int]] = {}
    for source in (home, away):
        source.clear()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            team = canon(row.get("team"))
            if not team:
                continue
            try:
                total = int(float(row.get("team_runs") or 0)) + int(float(row.get("opp_runs") or 0))
            except ValueError:
                continue
            bucket = home if str(row.get("home_away")) == "home" else away
            slot = bucket.setdefault(team, [0, 0])
            slot[0] += total
            slot[1] += 1

    out: dict[str, dict] = {}
    for team, (runs, games) in home.items():
        road = away.get(team)
        if not road or games < 20 or road[1] < 20:
            continue
        at_home = runs / games
        on_road = road[0] / road[1]
        if on_road <= 0:
            continue
        out[team] = {
            "factor": round(100 * at_home / on_road),
            "runs_per_game_home": round(at_home, 2),
            "runs_per_game_road": round(on_road, 2),
            "home_games": games,
            "road_games": road[1],
        }

    pool = sorted(out.items(), key=lambda pair: pair[1]["factor"], reverse=True)
    for index, (team, value) in enumerate(pool):
        value["rank"] = index + 1
        value["of"] = len(pool)
    return out


def main(argv: list[str]) -> int:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    written = 0

    if SNAPSHOT.is_file():
        snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        teams = team_context(snapshot)
        if not teams:
            print("  skip team context: snapshot has no public families")
        else:
            out = {
                "schema": "chase-public-team-context/1",
                "sport": "mlb",
                "generated_at_utc": now,
                # The snapshot's own timestamp is the age of the observations;
                # it is a different fact from when this file was written, and
                # the page prints it so a stale snapshot cannot look current.
                "data_through_utc": snapshot.get("generatedAt") or now,
                "formulas": {
                    "osi": "0.43*RCV + 0.37*ABQ + 0.20*OBR",
                    "pitchScore": "0.40*K% + 0.35*inv(BB%) + 0.25*inv(HR/9)",
                    "pals": "Strength of schedule from PTF+; higher means a harder "
                            "run of pitching already faced",
                },
                "teams": teams,
            }
            source_dir = Path(argv[1]) if len(argv) > 1 else ROOT / "data"
            parks = park_factors(source_dir)
            if parks:
                out["parks"] = parks
                out["formulas"]["park_factor"] = (
                    "Total runs per game at the park, both clubs counted, against "
                    "the same club's total runs per game on the road. 100 is neutral")
            form = rolling_form(Path(argv[1]) if len(argv) > 1 else ROOT / "data")
            if form:
                out["rolling"] = form
                out["formulas"]["rolling"] = (
                    "Runs scored and allowed per game over the last 7, 14 and 30 "
                    "completed games, and season to date")
            dest = PUBLIC / "team_context.json"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
            print(f"  wrote {dest.relative_to(ROOT)} ({len(teams)} clubs)")
            written += 1
    else:
        print("  skip team context: no snapshot on disk")

    board = pitch_type_board(Path(argv[1]) if len(argv) > 1 else ROOT / "data")
    if board:
        dest = PUBLIC / "pitch_type_board.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps({
            "schema": "chase-public-pitch-type/1",
            "sport": "mlb",
            "generated_at_utc": now,
            "note": "How each club has hit each pitch type, and where that ranks "
                    "among clubs with a comparable sample. Descriptive of the "
                    "season already played; pitch-type specific team hitting has "
                    "been measured on this data and does not persist between "
                    "windows, so it is never a read on what happens next.",
            "minimum_pitches": 150,
            "teams": board,
        }, indent=2) + "\n", encoding="utf-8")
        types = {c for club in board.values() for c in club}
        print(f"  wrote {dest.relative_to(ROOT)} ({len(board)} clubs, {len(types)} pitch types)")
        written += 1
    else:
        print("  skip pitch-type board: no pitch-mix CSV on disk")

    if BASELINES.is_file():
        source = json.loads(BASELINES.read_text(encoding="utf-8"))
        kept = {k: v for k, v in (source.get("baselines") or {}).items()
                if is_public_baseline(k)}
        # The oldest context sets the file's age: a run that carried some baselines
        # forward must not stamp the whole file with today's date.
        stamps = sorted(str(v.get("as_of")) for v in kept.values()
                        if isinstance(v, dict) and v.get("as_of"))
        out = {
            "schema": "chase-public-baselines/1",
            "generated_at_utc": now,
            "data_through_utc": (stamps[0] if stamps else source.get("generated_at")) or now,
            "baselines": kept,
        }
        dest = PUBLIC / "league_baselines.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        dropped = sorted(set(source.get("baselines") or {}) - set(kept))
        print(f"  wrote {dest.relative_to(ROOT)} ({len(kept)} baselines, "
              f"dropped {', '.join(dropped) or 'nothing'})")
        written += 1
    else:
        print("  skip baselines: none on disk")

    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
