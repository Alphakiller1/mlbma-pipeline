"""Push dashboard datasets into Supabase (public.hub_dataset) as JSONB documents.

Mirrors the dashboard's own CSV parsing exactly: each dataset is stored as an array of
row-objects keyed by the original sheet headers, all string values. The dashboard then
reads every dataset a page needs in a single Supabase request instead of N Google
Sheets gviz round-trips.

Runs alongside the existing Sheets push (dual-write) so nothing breaks during the
migration and rollback is free. Source of truth for parity is the live sheet, so we
read each tab's gviz CSV and re-parse it the same way the browser does.
"""

from __future__ import annotations

import csv
import io
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from core.config import SHEET_ID, SHEET_TABS, SUPABASE_DASHBOARD

ROOT = Path(__file__).resolve().parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass

SUPABASE_URL = os.getenv(
    "SUPABASE_URL", SUPABASE_DASHBOARD.get("url", "")
).rstrip("/")
# Write key for the hub mirror. Accept the common env names so a naming mismatch can't
# silently skip the mirror (the bug that froze hub_dataset at 2026-06-22):
#   SUPABASE_SECRET_KEY (new sb_secret_…) · SUPABASE_SERVICE_KEY · SUPABASE_KEY (service_role)
SUPABASE_SECRET_KEY = (
    os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_KEY")
    or ""
)
HUB_TABLE = "hub_dataset"

# Research tabs feed the dashboard. Slate/run tabs also feed downstream consumers such as
# the unified MLB Model, while the browser remains free to read the live Sheets copies.
#
# Today_Matchups is intentionally NOT mirrored here: scrapers.scrape_matchups pushes it to
# the hub DIRECTLY from the freshly-built slate (decoupled from the Google Sheets write).
# Re-mirroring it from gviz would re-read the sheet — which may be stale when the Sheets
# write failed — and clobber that fresh copy with yesterday's slate.
SLATE_TABS = [
    SHEET_TABS["today_lineups"],
    SHEET_TABS["last_updated"],
]
DEFAULT_TABS = list(dict.fromkeys([
    *SUPABASE_DASHBOARD.get("tabs", []),
    *SLATE_TABS,
]))


def _gviz_csv_url(tab: str) -> str:
    return (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv"
        f"&sheet={urllib.parse.quote(tab)}&_b={int(time.time() * 1000)}"
    )


def fetch_csv_rows(tab: str) -> list[dict]:
    """Fetch a sheet tab as the dashboard sees it: list of {header: string-value}."""
    url = _gviz_csv_url(tab)
    with urllib.request.urlopen(url, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for raw in reader:
        rows.append({(k or "").strip(): ("" if v is None else str(v).strip()) for k, v in raw.items()})
    return rows


def upsert_dataset(name: str, rows: list[dict]) -> None:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SECRET_KEY not set in environment")
    body = json.dumps({"name": name, "rows": rows, "updated_at": "now()"}).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{HUB_TABLE}",
        data=body,
        method="POST",
        headers={
            "apikey": SUPABASE_SECRET_KEY,
            "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status not in (200, 201, 204):
            raise RuntimeError(f"upsert {name} -> HTTP {resp.status}")


def push_datasets(tabs: list[str] | None = None) -> dict[str, int]:
    """Backfill / refresh the given tabs into hub_dataset. Returns {tab: row_count}."""
    tabs = tabs or DEFAULT_TABS
    counts: dict[str, int] = {}
    for tab in tabs:
        rows = fetch_csv_rows(tab)
        upsert_dataset(tab, rows)
        counts[tab] = len(rows)
        print(f"  Pushed hub_dataset[{tab}]: {len(rows)} rows")
    return counts


def _build_team_rankings_snapshot() -> None:
    """Regenerate static snapshot for instant Team Rankings first paint."""
    script = ROOT / "scripts" / "build_team_rankings_snapshot.py"
    if not script.exists():
        return
    try:
        subprocess.run([sys.executable, str(script)], cwd=str(ROOT), check=True)
    except Exception as exc:
        print(f"  WARNING: team rankings snapshot build failed: {exc}")


def run() -> None:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        print(
            "WARNING: Skipping Supabase mirror — set SUPABASE_URL and "
            "SUPABASE_SECRET_KEY in .env (dashboard will use Google Sheets)."
        )
        return
    print("Pushing dashboard datasets to Supabase (hub_dataset)...")
    counts = push_datasets()
    _build_team_rankings_snapshot()
    print("Done:", json.dumps(counts))


if __name__ == "__main__":
    run()
