"""Shared CSV freshness helpers for smart pipeline / sharp-money refresh."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TODAY = date.today()


def data_path(name: str) -> Path:
    return DATA / name


def file_mtime(name: str) -> datetime | None:
    path = data_path(name)
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime)


def file_fresh(name: str, min_rows: int = 1) -> bool:
    """True when CSV exists, was written today, and meets min row count."""
    path = data_path(name)
    if not path.exists():
        return False
    if datetime.fromtimestamp(path.stat().st_mtime).date() < TODAY:
        return False
    if min_rows <= 0:
        return True
    try:
        return len(pd.read_csv(path)) >= min_rows
    except Exception:
        return False


def file_stale_vs(name: str, reference: str) -> bool:
    """True when `name` is missing or older than `reference` (by mtime)."""
    ref = file_mtime(reference)
    if ref is None:
        return False
    cur = file_mtime(name)
    if cur is None:
        return True
    return cur < ref


def needs_recompute(derived: str, source: str, *, min_rows: int = 1) -> bool:
    """Recompute when source is fresh today but derived is missing/stale/empty."""
    if not file_fresh(source, min_rows=1):
        return False
    if not data_path(derived).exists():
        return True
    if file_stale_vs(derived, source):
        return True
    return not file_fresh(derived, min_rows=min_rows)


def audit(names: list[str]) -> list[tuple[str, str, int | None]]:
    """Return (filename, mtime_iso, row_count) for reporting."""
    rows: list[tuple[str, str, int | None]] = []
    for name in names:
        path = data_path(name)
        if not path.exists():
            rows.append((name, "MISSING", None))
            continue
        mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        try:
            n = len(pd.read_csv(path))
        except Exception:
            n = None
        rows.append((name, mtime, n))
    return rows


def print_audit(title: str, names: list[str]) -> None:
    print(f"\n{title}")
    for name, mtime, n in audit(names):
        rc = "?" if n is None else str(n)
        tag = "FRESH" if file_fresh(name, min_rows=1) else "STALE"
        print(f"  [{tag:5}] {name:32} {mtime:19} rows={rc}")
