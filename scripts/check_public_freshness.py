"""How far behind each sport's published evidence is (2026-11-18 audit).

    python scripts/check_public_freshness.py [--strict]

The CBB desk sat five days behind its slate while every deploy passed: its
team rates waited on a source that had stopped. This reads each published
slate and reports two ages: how old the publish is (has the job run?) and
how far its evidence trails the publish (has the source moved?). Over a
sport's limit it prints a GitHub warning and a line in the job summary.
It never fails a deploy unless --strict is given.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# (publish age, evidence lag) limits in days. Football plays weekly; its
# evidence legitimately trails the publish by up to a week.
LIMITS = {"nba": (1.5, 2.5), "cbb": (1.5, 2.5), "nfl": (3.0, 8.0), "cfb": (3.0, 8.0)}
OFFSEASON_MONTHS = {"nfl": {3, 4, 5, 6, 7}, "cfb": {2, 3, 4, 5, 6, 7}, "nba": {7, 8, 9}, "cbb": {5, 6, 7, 8, 9, 10}}


def parse(stamp: str | None) -> datetime | None:
    if not stamp:
        return None
    try:
        value = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def check(sport: str, slate: dict, now: datetime) -> list[str]:
    publish_limit, lag_limit = LIMITS[sport]
    generated = parse(slate.get("generated_at_utc"))
    through = parse(slate.get("data_through_utc"))
    problems = []
    if generated is None:
        return [f"{sport.upper()}: the slate carries no generated_at_utc"]
    age = (now - generated).total_seconds() / 86400
    if age > publish_limit:
        problems.append(f"{sport.upper()}: published {age:.1f} days ago (limit {publish_limit})")
    if through is not None:
        lag = (generated - through).total_seconds() / 86400
        if lag > lag_limit:
            problems.append(f"{sport.upper()}: evidence runs through {through.date()}, "
                            f"{lag:.1f} days behind its publish (limit {lag_limit})")
    return problems


def main(argv: list[str]) -> int:
    now = datetime.now(timezone.utc)
    problems, lines = [], []
    for sport in LIMITS:
        path = ROOT / "data" / "public" / sport / "slate.json"
        if not path.exists() or now.month in OFFSEASON_MONTHS[sport]:
            continue
        slate = json.loads(path.read_text(encoding="utf-8"))
        found = check(sport, slate, now)
        problems += found
        lines.append(f"| {sport.upper()} | {slate.get('generated_at_utc', '')[:16]} | "
                     f"{(slate.get('data_through_utc') or '')[:16]} | {'stale' if found else 'ok'} |")
    for problem in problems:
        print(f"::warning::{problem}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write("### Public evidence freshness\n\n| Sport | Published | Evidence through | |\n|---|---|---|---|\n")
            fh.write("\n".join(lines) + "\n")
    print("\n".join(lines) if lines else "no in-season sports")
    return 1 if problems and "--strict" in argv else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
