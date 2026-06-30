"""Validate-before-push — never let a bad scrape overwrite a good table.

The dashboards read exactly what the pipeline writes, so a push is a *contract*. The
dangerous pattern in this repo is "clear the live table, then write whatever the scrape
produced": if the scrape failed and produced 0 rows (or an error page parsed as junk),
that sequence destroys a healthy table and ships an empty/broken dashboard.

These helpers let every push gate the destructive write on the data's shape first. They
return a list of human-readable problems — empty list means "safe to write". Callers
reject + log instead of overwriting when problems are found. This is the SCL "never trust
input, validate before write" rule applied to the pipeline (AGENTS.md → Quality bar).

Pure functions, no network, no hard pandas dependency — unit-testable in isolation.
"""
from __future__ import annotations

from typing import Any, Iterable, Sequence

# A gviz/error fetch sometimes parses into a single junk row whose header looks like an
# HTML/error fragment. Treat these header tokens as a corruption signal.
_SUSPECT_HEADER_TOKENS = ("<!doctype", "<html", "error", "google.visualization")


def check_rows(
    name: str,
    rows: Sequence[dict] | None,
    *,
    min_rows: int = 1,
    required_keys: Iterable[str] | None = None,
) -> list[str]:
    """Validate a list-of-dict dataset (the Supabase hub_dataset / gviz shape)."""
    problems: list[str] = []
    if rows is None:
        return [f"{name}: dataset is None"]
    n = len(rows)
    if n < min_rows:
        problems.append(f"{name}: {n} row(s) < required minimum {min_rows}")
    if n == 0:
        return problems  # nothing else to check on an empty set

    first = rows[0]
    if not isinstance(first, dict):
        return [f"{name}: rows are not dict objects (got {type(first).__name__})"]

    keys = {(k or "").strip() for k in first.keys()}
    lowered = " ".join(keys).lower()
    if any(tok in lowered for tok in _SUSPECT_HEADER_TOKENS):
        problems.append(f"{name}: header looks like an error/HTML page, not data ({sorted(keys)[:4]})")

    if required_keys:
        missing = [c for c in required_keys if c not in keys]
        if missing:
            problems.append(f"{name}: missing required column(s): {missing}")

    # All-blank dataset: rows exist but every value is empty -> a failed scrape shaped
    # like a real table. Treat as corrupt.
    if not any(any(str(v).strip() for v in r.values()) for r in rows):
        problems.append(f"{name}: every cell is blank ({n} empty rows)")

    return problems


def check_dataframe(
    name: str,
    df: Any,
    *,
    min_rows: int = 1,
    required_cols: Iterable[str] | None = None,
) -> list[str]:
    """Validate a pandas DataFrame (the Google Sheets push shape) without importing pandas."""
    problems: list[str] = []
    if df is None:
        return [f"{name}: dataframe is None"]
    try:
        n = len(df)
        columns = list(df.columns)
    except Exception as exc:  # not a DataFrame-like object
        return [f"{name}: not a tabular object ({exc})"]

    if n < min_rows:
        problems.append(f"{name}: {n} row(s) < required minimum {min_rows}")
    if len(columns) == 0:
        problems.append(f"{name}: no columns")

    if required_cols:
        have = {str(c).strip() for c in columns}
        missing = [c for c in required_cols if c not in have]
        if missing:
            problems.append(f"{name}: missing required column(s): {missing}")

    return problems


def reject(name: str, problems: list[str]) -> None:
    """Standard rejection log — keeps the existing good table, refuses the bad write."""
    print(f"  REJECTED {name} — kept existing data, refused to overwrite with a bad scrape:")
    for p in problems:
        print(f"    - {p}")


def is_ok(problems: list[str]) -> bool:
    return not problems
