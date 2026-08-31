"""Backfill pitcher_hand in existing SP data from the player registry.

`sp_standard.csv` (a FanGraphs export) carries no handedness column, so
`scrape_sp_gamelog.load_sp_pitchers` stamped "R" on every arm. That constant propagated into
`sp_profiles.csv` and `sp_game_log.csv` and made every platoon-aware calculation downstream
read a fixed value. The scraper now resolves handedness from the registry, but the already
written files still hold the constant, and regenerating the game log means re-walking the
MLB API for every pitcher. This repairs them in place instead.

Dry run by default; pass --apply to write.
"""
from __future__ import annotations

import argparse
import collections
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core.config import DATA_DIR  # noqa: E402
from core.name_utils import normalize_player_name  # noqa: E402

# Files that carry a starter handedness column, plus the columns used to resolve it.
# `sp_gamelog.csv` (no underscore) is the pipeline's own artifact, written by
# scrapers.scrape_sp_gamelog and read by core.compute_sp_splits. `sp_game_log.csv` is the
# name the MODEL repo uses for the same data after the Sheets sync materialises it. Both
# appear in mlbma_pipeline/data, and only the first is live — the second is a stale sync
# leftover, which is why it sat frozen at 2026-07-30 while the pipeline kept running.
# (file, name column or None, id column, hand column). Tables that only carry the starter's
# id resolve by id alone -- game_results and batter_gamelog record the OPPOSING starter, and
# their hand column is what every batter-vs-hand split downstream reads.
TARGETS = (
    ("sp_profiles.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    ("sp_gamelog.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    ("sp_game_log.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    ("sp_metric_splits.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    # The bullpen chain carried the same constant. reliever_gamelog is the source
    # compute_bullpen_profile groups on, so repairing it is what actually reaches the
    # site; bullpen_individual is listed too so an already written profile is corrected
    # even when the compute step is not re-run.
    ("reliever_gamelog.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    ("bullpen_individual.csv", "pitcher_name", "pitcher_id", "pitcher_hand"),
    ("game_results.csv", None, "opp_starter_id", "opp_starter_hand"),
    ("batter_gamelog.csv", None, "opp_starter_id", "opp_starter_hand"),
)
MLB_PEOPLE_URL = "https://statsapi.mlb.com/api/v1/people"


def registry_throws(data_dir: Path) -> tuple[dict[str, str], dict[int, str]]:
    """(by normalized name, by MLB player id) -> 'L'/'R'."""
    registry = pd.read_csv(
        data_dir / "player_registry.csv", usecols=["player_id", "full_name", "throws"]
    )
    by_name: dict[str, str] = {}
    by_id: dict[int, str] = {}
    for row in registry.itertuples():
        hand = str(getattr(row, "throws", "") or "").strip().upper()[:1]
        if hand not in ("L", "R"):
            continue
        by_name[normalize_player_name(str(row.full_name))] = hand
        try:
            by_id[int(row.player_id)] = hand
        except (TypeError, ValueError):
            pass
    return by_name, by_id


def fetch_hands(player_ids: list[int]) -> dict[int, str]:
    """Look up handedness straight from the MLB people endpoint, in batches.

    The registry only covers current active and IL rosters, so anyone released, traded out
    of the league or sent down mid-season is absent — about a quarter of the season's
    starters. Those are exactly the rows a name join cannot rescue, so ask the source.
    """
    import json
    import urllib.request

    found: dict[int, str] = {}
    for start in range(0, len(player_ids), 100):
        batch = [str(i) for i in player_ids[start:start + 100]]
        url = f"{MLB_PEOPLE_URL}?personIds={','.join(batch)}"
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                people = json.loads(response.read().decode()).get("people", [])
        except Exception as exc:  # network/parse — fall back to whatever we already have
            print(f"    people lookup failed for batch {start//100}: {str(exc)[:80]}")
            continue
        for person in people:
            hand = str((person.get("pitchHand") or {}).get("code") or "").upper()[:1]
            if hand in ("L", "R"):
                found[int(person["id"])] = hand
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--data-dir", default=None)
    args = parser.parse_args()

    data_dir = Path(args.data_dir) if args.data_dir else DATA_DIR
    by_name, by_id = registry_throws(data_dir)
    print(f"registry entries with handedness: {len(by_name)} by name, {len(by_id)} by id")

    # One API sweep for every id the registry cannot answer, shared across all files.
    missing: set[int] = set()
    for filename, name_column, id_column, hand_column in TARGETS:
        path = data_dir / filename
        if not path.exists():
            continue
        frame = pd.read_csv(path)
        if id_column not in frame.columns:
            continue
        names = frame[name_column] if name_column and name_column in frame.columns else [None] * len(frame)
        for value, name in zip(frame[id_column], names):
            try:
                pitcher_id = int(value)
            except (TypeError, ValueError):
                continue
            if pitcher_id in by_id:
                continue
            if normalize_player_name(str(name)) in by_name:
                continue
            missing.add(pitcher_id)
    if missing:
        print(f"looking up {len(missing)} pitchers the registry does not carry...")
        fetched = fetch_hands(sorted(missing))
        print(f"  resolved {len(fetched)} from the MLB people endpoint")
        by_id.update(fetched)

    def resolve(pitcher_id, name):
        try:
            hand = by_id.get(int(pitcher_id))
        except (TypeError, ValueError):
            hand = None
        return hand or by_name.get(normalize_player_name(str(name)))

    for filename, name_column, id_column, hand_column in TARGETS:
        path = data_dir / filename
        if not path.exists():
            print(f"  skip {filename} (missing)")
            continue
        frame = pd.read_csv(path)
        has_name = bool(name_column) and name_column in frame.columns
        if id_column not in frame.columns and not has_name:
            print(f"  skip {filename} (no {id_column} or {name_column} column)")
            continue
        before = collections.Counter(frame.get(hand_column, pd.Series(dtype=str)).astype(str))
        ids = frame[id_column] if id_column in frame.columns else [None] * len(frame)
        names = frame[name_column] if has_name else [None] * len(frame)
        resolved = pd.Series(
            [resolve(pid, name) for pid, name in zip(ids, names)],
            index=frame.index,
        )
        unmatched = int(resolved.isna().sum())
        # Keep whatever the file already had where handedness is still unknown.
        frame[hand_column] = resolved.fillna(
            frame[hand_column] if hand_column in frame.columns else "R"
        )
        after = collections.Counter(frame[hand_column].astype(str))
        print(
            f"  {filename:24} rows={len(frame):5d}  before={dict(before)}  "
            f"after={dict(after)}  unresolved={unmatched}"
        )
        if args.apply:
            frame.to_csv(path, index=False)

    print("\nwrote files" if args.apply else "\nDRY RUN - nothing written; pass --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
