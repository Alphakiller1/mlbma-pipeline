#!/usr/bin/env python3
"""Remove stray </div> left after loading overlay when Chase nav was relocated."""
import re
from pathlib import Path

DASH = Path(__file__).resolve().parents[1] / "dashboard"
PAGES = [
    "chase_analytics_mlb_oem_v7.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "batter_profile.html",
    "reliever_profile.html",
    "bullpen_report.html",
    "team_profile.html",
]

PAT = re.compile(
    r"(<span id=\"mobileLastUpdated\">--</span>\s*</div>\s*</div>\s*</div>\s*\n)\s*</div>\s*\n",
    re.MULTILINE,
)


def main() -> None:
    for name in PAGES:
        path = DASH / name
        text = path.read_text(encoding="utf-8")
        new, n = PAT.subn(r"\1", text)
        if n:
            path.write_text(new, encoding="utf-8", newline="\n")
            print(f"OK {name} ({n})")


if __name__ == "__main__":
    main()
