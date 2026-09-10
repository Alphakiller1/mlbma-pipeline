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
PUBLIC_FAMILIES = ("scoring", "difficulty", "status")
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
}

METRIC_LABELS = {
    "osi": "OSI", "wrc": "wRC+", "woba": "wOBA", "rcv": "RCV", "abq": "ABQ",
    "obr": "OBR", "pitchScore": "Pitch Score", "pals": "SOS",
    "xwoba": "xwOBA", "xfip": "xFIP",
}

# Baseline keys a public page may know. Anything modelled or expected is out.
PUBLIC_BASELINES = {
    "osi", "abq", "rcv", "obr", "woba", "slg", "avg", "obp", "ops", "iso",
    "wrc", "hr", "barrel", "hardhit", "k", "bb", "era", "whip", "fip",
}

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
    "whiff_rate": (1, "low"),
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
                if k in PUBLIC_BASELINES}
        out = {
            "schema": "chase-public-baselines/1",
            "generated_at_utc": now,
            "data_through_utc": source.get("generated_at") or now,
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
