#!/usr/bin/env python3
"""Attach FTN's public Team Total DVOA profiles to the published NFL slate."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "outputs"))
sys.path.insert(0, str(ROOT / "scripts"))

from project_public_slate import assert_clean  # noqa: E402
from publish_public_slate import attach_nfl_dvoa, fetch_ftn_dvoa  # noqa: E402


def main() -> int:
    target = ROOT / "data" / "public" / "nfl" / "slate.json"
    payload = json.loads(target.read_text(encoding="utf-8"))
    games = payload.get("games") or []
    season = None
    for game in games:
        kickoff = str(game.get("kickoff_utc") or "")
        if len(kickoff) >= 4 and kickoff[:4].isdigit():
            season = int(kickoff[:4])
            break
    rankings = fetch_ftn_dvoa(season)
    attached = attach_nfl_dvoa(payload, rankings)
    expected = len(games) * 2
    if not games or attached != expected:
        raise SystemExit(f"refusing partial DVOA publish: attached {attached} of {expected}")
    assert_clean(payload)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target} with {attached} complete DVOA profiles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
