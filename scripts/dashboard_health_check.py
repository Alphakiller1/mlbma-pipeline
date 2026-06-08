#!/usr/bin/env python3
"""Static health check for dashboard HTML — duplicates, broken links, version drift."""
from __future__ import annotations

import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"

PRODUCTION_PAGES = [
    "chase_analytics_mlb_oem_v7.html",
    "team_rankings.html",
    "matchup_compare.html",
    "team_profile.html",
    "pitcher_profile.html",
    "batter_profile.html",
    "bullpen_report.html",
    "glossary.html",
    "index.html",
]

LINK_RE = re.compile(r'<link[^>]+href=["\']([^"\']+)["\']', re.I)
SCRIPT_RE = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.I)
HREF_RE = re.compile(r'href=["\']([^"#?][^"\']*)["\']', re.I)


def base_name(url: str) -> str:
    return url.split("?")[0].split("/")[-1]


def scan_html(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    links = [base_name(u) for u in LINK_RE.findall(text)]
    scripts = [base_name(u) for u in SCRIPT_RE.findall(text)]
    hrefs = [h for h in HREF_RE.findall(text) if h.endswith(".html")]
    return {"links": links, "scripts": scripts, "hrefs": hrefs}


def main() -> int:
    issues: list[tuple[str, str, str]] = []  # severity, page, message

    for name in PRODUCTION_PAGES:
        path = DASH / name
        if not path.exists():
            issues.append(("CRITICAL", name, "missing production page"))
            continue
        data = scan_html(path)
        text = path.read_text(encoding="utf-8", errors="replace")

        for kind, items in (("CSS", data["links"]), ("JS", data["scripts"])):
            counts = Counter(items)
            for item, n in counts.items():
                if n > 1 and (item.endswith(".css") or item.endswith(".js")):
                    issues.append(("CRITICAL", name, f"duplicate {kind} load: {item} x{n}"))

        if "mlbma_design_system.css" not in data["links"]:
            issues.append(("HIGH", name, "missing mlbma_design_system.css"))

        for href in data["hrefs"]:
            target = DASH / Path(href).name
            if href.endswith(".html") and not target.exists():
                issues.append(("HIGH", name, f"broken link: {href}"))

        if "ca-bg-outfield" in text:
            if "mlbma_backgrounds.css" not in data["links"]:
                issues.append(("MEDIUM", name, "ca-bg-outfield without mlbma_backgrounds.css"))

    # Nav orphan pages
    nav_js = (DASH / "mlbma_ui.js").read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(r"file:\s*['\"]([^'\"]+\.html)['\"]", nav_js):
        target = DASH / m.group(1)
        if not target.exists():
            issues.append(("HIGH", "mlbma_ui.js", f"NAV target missing: {m.group(1)}"))

    # Version drift summary
    versions: dict[str, set[str]] = defaultdict(set)
    for name in PRODUCTION_PAGES:
        path = DASH / name
        if not path.exists():
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r'(mlbma_ui\.js|mlbma_assets\.js|mlbma_design_system\.css)\?v=([^"\']+)', raw):
            versions[m.group(1)].add(m.group(2))

    print("=" * 60)
    print("MLBMA Dashboard Health Check")
    print("=" * 60)

    if not issues:
        print("\nNo critical/static issues found.\n")
    else:
        by_sev = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for sev, page, msg in sorted(issues, key=lambda x: (x[0], x[1])):
            by_sev[sev] = by_sev.get(sev, 0) + 1
            print(f"[{sev}] {page}: {msg}")
        print(f"\nTotals: {by_sev}")

    print("\nVersion drift (shared assets):")
    for asset, vers in sorted(versions.items()):
        flag = " (drift)" if len(vers) > 1 else ""
        print(f"  {asset}: {', '.join(sorted(vers))}{flag}")

    critical = sum(1 for s, _, _ in issues if s == "CRITICAL")
    high = sum(1 for s, _, _ in issues if s == "HIGH")
    return 1 if critical or high else 0


if __name__ == "__main__":
    sys.exit(main())
