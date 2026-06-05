"""Validate MLBMA stadium background integration."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
BG_DIR = DASH / "assets" / "backgrounds"
BG_CSS = DASH / "mlbma_backgrounds.css"

PRODUCTION_PAGES = {
    "chase_analytics_mlb_oem_v7.html": {"opening-dashboard", "platform-dashboard"},
    "batter_profile.html": {"batter-profile-page"},
    "pitcher_profile.html": {"pitcher-profile-page"},
    "team_profile.html": {"team-profile-page"},
    "bullpen_report.html": {"bullpen-profile-page"},
    "team_rankings.html": {"ca-bg-outfield"},
    "matchup_compare.html": {"ca-bg-compare"},
    "index.html": {"ca-bg-outfield"},
    "glossary.html": {"ca-bg-outfield"},
    "team_card.html": {"ca-bg-catcher"},
}

EXPECTED_PNGS = [
    "stadium-outfield-night.png",
    "stadium-catcher-view.png",
    "stadium-plate-pov.png",
]

css = BG_CSS.read_text(encoding="utf-8")
issues = []

for png in EXPECTED_PNGS:
    path = BG_DIR / png
    if not path.exists():
        issues.append(f"missing asset: {png}")
    elif path.stat().st_size < 100_000:
        issues.append(f"asset too small: {png} ({path.stat().st_size} bytes)")

for ref in EXPECTED_PNGS:
    if ref not in css:
        issues.append(f"css missing reference to {ref}")

load_order_issues = []
class_issues = []
for page, required_classes in PRODUCTION_PAGES.items():
    path = DASH / page
    if not path.exists():
        issues.append(f"missing page: {page}")
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    if "mlbma_backgrounds.css" not in text:
        issues.append(f"{page}: missing mlbma_backgrounds.css link")
        continue
    bg_pos = text.rfind("mlbma_backgrounds.css")
    head_end = text.lower().find("</head>")
    if head_end == -1 or bg_pos > head_end:
        issues.append(f"{page}: mlbma_backgrounds.css not in head")
    # backgrounds should be among the last stylesheets in head
    head = text[:head_end] if head_end != -1 else text
    later_css = re.findall(r'<link[^>]+rel="stylesheet"[^>]*>', head[bg_pos:])
    if len(later_css) > 1:
        load_order_issues.append(f"{page}: stylesheet linked after mlbma_backgrounds.css")
    body_m = re.search(r"<body[^>]*class=\"([^\"]*)\"", text, re.I)
    if not body_m:
        body_m = re.search(r"<body([^>]*)>", text, re.I)
        classes = set()
        if body_m and body_m.lastindex and body_m.group(1):
            cm = re.search(r'class="([^"]*)"', body_m.group(0))
            if cm:
                classes = set(cm.group(1).split())
    else:
        classes = set(body_m.group(1).split())
    if not classes & required_classes:
        class_issues.append(f"{page}: body missing one of {sorted(required_classes)}")

report = {
    "assets_ok": len([p for p in EXPECTED_PNGS if (BG_DIR / p).exists()]),
    "issues": issues,
    "load_order_issues": load_order_issues,
    "class_issues": class_issues,
}
print(json.dumps(report, indent=2))

if issues or load_order_issues or class_issues:
    raise SystemExit(1)
