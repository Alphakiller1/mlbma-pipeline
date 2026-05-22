"""Generate canonical dashboard navigation HTML from DASHBOARD_PAGES in core.config."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from core.config import DASHBOARD_PAGES

OUT = Path(__file__).resolve().parent / "nav_snippet.html"

# Order for nav display (matches standard dashboard header)
NAV_ORDER = [
    "main",
    "player_search",
    "matchup_sheet",
    "batter_profile",
    "pitcher_profile",
    "reliever_profile",
    "bullpen_report",
    "team_profile",
]


def main() -> None:
    lines = [
        "<!-- Canonical MLBMA dashboard nav (from core.config DASHBOARD_PAGES) -->",
        '<nav class="nav-links mlbma-nav">',
    ]
    for key in NAV_ORDER:
        meta = DASHBOARD_PAGES[key]
        lines.append(
            f'  <a class="nav-link" href="{meta["url"]}">{meta["label"]}</a>'
        )
    lines.append("</nav>")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    print("Verify this snippet matches nav blocks in all 8 dashboard HTML files.")


if __name__ == "__main__":
    main()
