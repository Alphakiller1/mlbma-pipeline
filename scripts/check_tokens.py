#!/usr/bin/env python3
"""Token-source guard — "tokens are the law" (design contract §5, UI checklist §1).

This is the Python, no-bundler equivalent of SCL's stylelint gate. The rule it
enforces is the one the design contract cares about most and the one we just spent
a consolidation pass establishing:

    mlbma_design_system.css is the SINGLE source of every global design token.
    No other dashboard CSS file may redefine a token it already owns.

A duplicate `:root` definition in a second file is how the token layer rots — two
files drift to different values and the UI quietly diverges. This guard fails CI
the moment that happens again.

It also prints (non-fatally) a count of hard-coded hex colors living in CSS rule
bodies outside the token files, so the trend toward "consume tokens, don't hard-code"
stays visible without blocking the mature codebase on its existing hexes.

Usage:
    python scripts/check_tokens.py            # from repo root
Exit code 1 on any hard violation, 0 otherwise.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DASHBOARD = Path(__file__).resolve().parent.parent / "dashboard"
CANONICAL = "mlbma_design_system.css"

COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
# Flat `selector { declarations }` blocks. Token blocks never nest braces, so a
# non-greedy body match is correct and avoids pulling in unrelated rules.
BLOCK_RE = re.compile(r"([^{}]*)\{([^{}]*)\}", re.DOTALL)
TOKEN_DEF_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def root_tokens(css: str) -> set[str]:
    """Custom properties defined in a global `:root` block (single token source)."""
    css = COMMENT_RE.sub("", css)
    names: set[str] = set()
    for selector, body in BLOCK_RE.findall(css):
        if ":root" in selector:
            names.update(TOKEN_DEF_RE.findall(body))
    return names


def hex_in_rule_bodies(css: str) -> int:
    css = COMMENT_RE.sub("", css)
    count = 0
    for selector, body in BLOCK_RE.findall(css):
        if ":root" in selector:
            continue  # token definitions are *allowed* to hold raw hex
        count += len(HEX_RE.findall(body))
    return count


def main() -> int:
    if not DASHBOARD.is_dir():
        print(f"ERROR: {DASHBOARD} not found", file=sys.stderr)
        return 1

    canonical_path = DASHBOARD / CANONICAL
    if not canonical_path.is_file():
        print(f"ERROR: canonical token file {CANONICAL} not found", file=sys.stderr)
        return 1

    canonical = root_tokens(canonical_path.read_text(encoding="utf-8"))
    print(f"Canonical token source {CANONICAL}: {len(canonical)} :root tokens")

    violations: list[str] = []
    hex_total = 0
    for css_path in sorted(DASHBOARD.glob("*.css")):
        css = css_path.read_text(encoding="utf-8")
        hex_total += hex_in_rule_bodies(css)
        if css_path.name == CANONICAL:
            continue
        redefined = sorted(root_tokens(css) & canonical)
        if redefined:
            violations.append(
                f"  {css_path.name} redefines {len(redefined)} canonical token(s): "
                + ", ".join(redefined)
            )

    print(f"Hard-coded hex colors in CSS rule bodies (informational): {hex_total}")

    if violations:
        print("\nTOKEN-SOURCE VIOLATIONS (a token must live in only ONE file):")
        print("\n".join(violations))
        print(
            f"\nFAIL: move these definitions into {CANONICAL} and consume them via var(). "
            "See design/MLBMA_CURSOR_DESIGN_CONTRACT.md §5 and docs/MLBMA_UI_QUALITY_CHECKLIST.md §1."
        )
        return 1

    print("\nOK: every global token has a single source. ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
