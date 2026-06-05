"""Run the MLBMA pipeline once all games on the slate are final.

Intended for a Codex automation scheduled hourly from 6 PM through 2 AM ET.
For checks after midnight, the slate date is treated as the prior ET date.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent.parent
LOG_PATH = ROOT / "pipeline_log.txt"
STATE_DIR = ROOT / "outputs" / "automation_state"
STATE_PATH = STATE_DIR / "last_after_final_run.json"
TODAY_EXPORTS = (
    ROOT / "data" / "today_games.csv",
    ROOT / "data" / "today_lineups.csv",
    ROOT / "data" / "today_matchups.csv",
)
EASTERN = ZoneInfo("America/New_York")
MLB_SCHEDULE_URL = (
    "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date}"
)


def eastern_now() -> datetime:
    return datetime.now(EASTERN)


def default_slate_date(now: datetime) -> str:
    slate = now.date() - timedelta(days=1) if now.hour < 6 else now.date()
    return slate.isoformat()


def fetch_schedule(slate_date: str) -> dict[str, Any]:
    url = MLB_SCHEDULE_URL.format(date=slate_date)
    with urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def games_for_schedule(schedule: dict[str, Any]) -> list[dict[str, Any]]:
    games: list[dict[str, Any]] = []
    for date_group in schedule.get("dates", []):
        games.extend(date_group.get("games", []))
    return games


def is_final(game: dict[str, Any]) -> bool:
    status = game.get("status", {})
    abstract = str(status.get("abstractGameState", "")).lower()
    detailed = str(status.get("detailedState", "")).lower()
    coded = str(status.get("codedGameState", "")).upper()
    return abstract == "final" or detailed in {"final", "game over"} or coded in {"F", "O"}


def matchup_label(game: dict[str, Any]) -> str:
    teams = game.get("teams", {})
    away = teams.get("away", {}).get("team", {}).get("abbreviation") or teams.get(
        "away", {}
    ).get("team", {}).get("name", "Away")
    home = teams.get("home", {}).get("team", {}).get("abbreviation") or teams.get(
        "home", {}
    ).get("team", {}).get("name", "Home")
    return f"{away} at {home}"


def non_final_games(games: list[dict[str, Any]]) -> list[str]:
    labels: list[str] = []
    for game in games:
        if is_final(game):
            continue
        status = game.get("status", {})
        labels.append(
            f"{matchup_label(game)} - "
            f"{status.get('detailedState') or status.get('abstractGameState') or 'unknown'}"
        )
    return labels


def already_ran(slate_date: str) -> bool:
    if not STATE_PATH.exists():
        return False
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False
    return state.get("slate_date") == slate_date and state.get("status") == "success"


def mark_success(slate_date: str, elapsed_seconds: float) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "slate_date": slate_date,
        "status": "success",
        "finished_at_et": eastern_now().isoformat(timespec="seconds"),
        "elapsed_seconds": round(elapsed_seconds, 1),
    }
    STATE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def resolve_python() -> Path:
    candidates = [
        Path(r"C:\Users\chase\crawl_env\Scripts\python.exe"),
        ROOT / "crawl_env" / "Scripts" / "python.exe",
        Path(sys.executable),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return Path(sys.executable)


def append_log_header(slate_date: str) -> None:
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write("\n")
        log.write("=" * 72 + "\n")
        log.write(
            f"After-last-final automation for slate {slate_date} "
            f"started {eastern_now().isoformat(timespec='seconds')}\n"
        )
        log.write("=" * 72 + "\n")


def run_pipeline(slate_date: str) -> int:
    python = resolve_python()
    append_log_header(slate_date)
    print(f"Running MLBMA pipeline with {python}")
    child_env = {**os.environ, "MLBMA_SLATE_DATE": slate_date}
    with LOG_PATH.open("a", encoding="utf-8") as log:
        process = subprocess.Popen(
            [str(python), "-m", "pipeline.main"],
            cwd=str(ROOT),
            env=child_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert process.stdout is not None
        for line in process.stdout:
            print(line, end="")
            log.write(line)
        return process.wait()


def export_matches_slate(path: Path, slate_date: str) -> tuple[bool, str]:
    if not path.exists():
        return False, "missing file"
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
    except OSError as exc:
        return False, f"read failed: {exc}"

    if not rows:
        return False, "no data rows"
    if "Slate_Date" not in reader.fieldnames:
        return False, "Slate_Date column missing"

    dates = {str(row.get("Slate_Date", "")).strip()[:10] for row in rows}
    if slate_date not in dates:
        preview = ", ".join(sorted(d for d in dates if d)[:3]) or "none"
        return False, f"Slate_Date mismatch ({preview})"
    return True, f"{len(rows)} row(s)"


def validate_today_exports(slate_date: str) -> list[str]:
    issues: list[str] = []
    for path in TODAY_EXPORTS:
        ok, detail = export_matches_slate(path, slate_date)
        if ok:
            print(f"Verified {path.name}: {detail} for {slate_date}")
        else:
            issues.append(f"{path.name}: {detail}")
    return issues


def refresh_today_exports(slate_date: str) -> int:
    python = resolve_python()
    env = {**os.environ, "MLBMA_SLATE_DATE": slate_date}
    print(f"Repairing Today_* exports for slate {slate_date}...")
    return subprocess.call(
        [str(python), "-m", "scripts.refresh_today_slate"],
        cwd=str(ROOT),
        env=env,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slate-date", help="Override slate date as YYYY-MM-DD.")
    parser.add_argument("--force", action="store_true", help="Run even if already marked done.")
    parser.add_argument("--dry-run", action="store_true", help="Check status but do not run.")
    args = parser.parse_args(argv)

    now = eastern_now()
    slate_date = args.slate_date or default_slate_date(now)
    print(f"Checking MLB slate date {slate_date} at {now.isoformat(timespec='seconds')}")

    try:
        schedule = fetch_schedule(slate_date)
    except URLError as exc:
        print(f"Could not fetch MLB schedule: {exc}")
        return 2

    games = games_for_schedule(schedule)
    if not games:
        print(f"No MLB games found for {slate_date}.")
        return 0

    pending = non_final_games(games)
    if pending:
        print(f"{len(pending)} game(s) not final yet:")
        for label in pending[:10]:
            print(f"  - {label}")
        return 0

    print(f"All {len(games)} game(s) are final for {slate_date}.")
    if already_ran(slate_date) and not args.force:
        print(f"Pipeline already completed for slate {slate_date}; skipping.")
        return 0

    if args.dry_run:
        print("Dry run requested; pipeline would run now.")
        return 0

    start = datetime.now()
    code = run_pipeline(slate_date)
    elapsed = (datetime.now() - start).total_seconds()
    if code == 0:
        issues = validate_today_exports(slate_date)
        if issues:
            print("Today_* export validation failed after pipeline:")
            for issue in issues:
                print(f"  - {issue}")
            repair_code = refresh_today_exports(slate_date)
            if repair_code != 0:
                print(f"Repair refresh failed with exit code {repair_code}.")
                return repair_code
            issues = validate_today_exports(slate_date)
            if issues:
                print("Today_* export validation still failing after repair:")
                for issue in issues:
                    print(f"  - {issue}")
                return 3
        mark_success(slate_date, elapsed)
        print(f"Pipeline completed for {slate_date} in {elapsed:.1f}s.")
    else:
        print(f"Pipeline failed for {slate_date} after {elapsed:.1f}s with exit code {code}.")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
