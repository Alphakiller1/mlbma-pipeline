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
BASELINES = ROOT / "dashboard" / "league_baselines.json"
PUBLIC = ROOT / "data" / "public"

# The two families that hold descriptive offensive context. `status` is absent
# by construction: it carries projOSI, ppGap, pals, xwoba and xfip.
PUBLIC_FAMILIES = ("scoring", "difficulty")

# Which metric each family contributes, and how many digits it is meaningful to.
PUBLIC_METRICS = {
    "osi": 1, "wrc": 0, "woba": 3, "rcv": 1,
    "abq": 1, "obr": 1, "pitchScore": 0,
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
        for key, digits in PUBLIC_METRICS.items():
            scored = sorted(
                ((canon(row.get("t")), float(row[key]))
                 for row in rows
                 if row.get(key) is not None and isinstance(row[key], (int, float))),
                key=lambda pair: pair[1], reverse=True)
            for index, (team, value) in enumerate(scored):
                if not team:
                    continue
                by_team.setdefault(team, {})[key] = {
                    "value": round(value, digits),
                    "rank": index + 1,
                    "of": len(scored),
                }
    return by_team


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
