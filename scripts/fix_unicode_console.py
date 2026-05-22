"""Replace Unicode dashes/quotes in Python print paths for Windows console."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"crawl_env", "__pycache__", ".git"}

REPLACEMENTS = [
    ("\u2014", "--"),  # em dash
    ("\u2013", "-"),   # en dash
    ("\u2018", "'"),
    ("\u2019", "'"),
    ("\u201c", '"'),
    ("\u201d", '"'),
]


def should_process(path: Path) -> bool:
    if path.suffix != ".py":
        return False
    parts = path.parts
    return not any(p in SKIP for p in parts)


def fix_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = []
    for path in ROOT.rglob("*.py"):
        if should_process(path):
            if fix_file(path):
                changed.append(path.relative_to(ROOT))
    print(f"Updated {len(changed)} files")
    for p in changed[:40]:
        print(f"  {p}")
    if len(changed) > 40:
        print(f"  ... and {len(changed) - 40} more")


if __name__ == "__main__":
    main()
