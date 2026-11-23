"""Split the published CFB slate into small route and game payloads."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SLATE = Path("data/public/cfb/slate.json")
OUTPUT = Path("data/public/cfb/game-payloads")
ARCHIVE = ROOT / "scripts/cfb_archive_revision.txt"
ET = ZoneInfo("America/New_York")
GAME_ID = re.compile(r"[A-Za-z0-9&._-]+@[A-Za-z0-9&._-]+")
TEAM_FIELDS = ("name", "conference", "logo", "color", "record", "score", "starter")
MATCHUP_FIELDS = ("id", "sport", "season", "away", "home", "kickoff_utc", "game_state",
                  "venue", "venue_city", "neutral", "broadcast", "weather_temp", "weather_cond", "roof", "surface")
OVERVIEW_RATES = ("off_sack_rate", "off_ypc", "def_ypc")


def read_slate(revision: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected a full revision for the CFB archive")
    tree_file = f"{revision}:{SLATE.as_posix()}"
    exists = subprocess.run(["git", "cat-file", "-e", tree_file], cwd=ROOT, capture_output=True)
    if exists.returncode:
        subprocess.run(["git", "fetch", "--quiet", "--depth=1", "origin", revision], cwd=ROOT, check=True)
    return json.loads(subprocess.check_output(["git", "show", tree_file], cwd=ROOT))


def slate_date(row: dict) -> str:
    return datetime.fromisoformat(row["kickoff_utc"].replace("Z", "+00:00")).astimezone(ET).date().isoformat()


def fixture(row: dict) -> dict:
    keys = MATCHUP_FIELDS + tuple(f"{side}_{field}" for side in ("away", "home") for field in TEAM_FIELDS)
    return {**{key: row[key] for key in keys if key in row}, "slate_date": slate_date(row)}


def summary(row: dict) -> dict:
    game = fixture(row)
    for side in ("away", "home"):
        key = f"{side}_form"
        if form := row.get(key):
            game[key] = {"season": form["season"], "source": form["source"],
                         "rates": {k: form["rates"][k] for k in OVERVIEW_RATES if k in form["rates"]}}
        key = f"{side}_injuries"
        if report := row.get(key):
            players = [player for player in report["players"] if player.get("position") == "QB"]
            game[key] = {**report, "players": players}
    return game


def write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False), encoding="utf-8")


def build(site_root: Path, current: dict, archived: dict | None) -> int:
    cards = {}
    snapshots = [archived, current] if archived else [current]
    for slate in snapshots:
        meta = {key: slate[key] for key in ("season", "week", "generated_at_utc", "data_through_utc") if key in slate}
        for row in slate["games"]:
            if slate is archived and row.get("game_state") != "final":
                continue
            if not GAME_ID.fullmatch(row["id"]) or not row.get("kickoff_utc"):
                print(f"CFB game {row.get('id')!r} uses the legacy slate route until its date and ID are published.")
                continue
            identity = fixture(row)
            if "week" in meta:
                identity["week"] = meta["week"]
            cards[(identity["slate_date"], row["id"])] = identity
            stem = site_root / OUTPUT / identity["slate_date"] / row["id"]
            write(stem.with_name(stem.name + ".json"), {**meta, "games": [summary(row)]})
            write(stem.with_name(stem.name + "-evidence.json"),
                  {**meta, "games": [row], **({"power": slate["power"]} if slate.get("power") else {})})
    write(site_root / OUTPUT / "index.json", {"games": list(cards.values())})
    write(site_root / OUTPUT / "status.json", {"generated_at_utc": current["generated_at_utc"]})
    return len(cards)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-root", type=Path, default=ROOT)
    parser.add_argument("--record-previous", help="Record the last published slate when a new week replaces it.")
    args = parser.parse_args()
    current = json.loads((ROOT / SLATE).read_text(encoding="utf-8"))
    if args.record_previous:
        previous = read_slate(args.record_previous)
        if (previous["season"], previous["week"]) < (current["season"], current["week"]) and any(
            row.get("game_state") == "final" for row in previous["games"]
        ):
            ARCHIVE.write_text(args.record_previous + "\n", encoding="ascii")
        return
    archived = read_slate(ARCHIVE.read_text(encoding="ascii").strip()) if ARCHIVE.exists() else None
    print(f"Built overview and detailed payloads for {build(args.site_root, current, archived)} CFB games.")


if __name__ == "__main__":
    main()
