"""Verify neon PNG icon integration (circles, loader, CSS, cache bust)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "dashboard" / "assets" / "icons"
JS = ROOT / "dashboard" / "mlbma_icons.js"
THEME = ROOT / "dashboard" / "theme.css"
DS = ROOT / "dashboard" / "mlbma_design_system.css"
DASH = ROOT / "dashboard"

NEON_MARKS = [
    "neon-diamond-field", "neon-baseball", "neon-bat", "neon-stadium",
    "neon-weather-field", "neon-vs", "neon-trend-up", "neon-trend-down",
]

MIN_PX = 512
issues: list[str] = []
js = JS.read_text(encoding="utf-8")
ver = re.search(r"ICON_VER = '([^']+)'", js)
icon_ver = ver.group(1) if ver else None

if not icon_ver:
    issues.append("ICON_VER missing in mlbma_icons.js")
if "markAssetUrl" not in js or ".png?v=" not in js:
    issues.append("iconImgHtml does not load PNG marks")
if re.search(r"iconImgHtml[\s\S]{0,400}\.svg", js):
    issues.append("iconImgHtml still references .svg for marks")

for name in NEON_MARKS:
    png = ICONS / f"{name}.png"
    if not png.exists():
        issues.append(f"missing PNG: {name}.png")
        continue
    with Image.open(png) as im:
        w, h = im.size
        if w != h:
            issues.append(f"{name}.png: not square ({w}x{h})")
        elif w < MIN_PX:
            issues.append(f"{name}.png: expected >= {MIN_PX}px, got {w}")
        if im.mode != "RGBA":
            issues.append(f"{name}.png: expected RGBA, got {im.mode}")

theme = THEME.read_text(encoding="utf-8")
if re.search(r"\.ca-neon-icon[\s\S]{0,220}filter:\s*drop-shadow", theme):
    issues.append("theme.css: .ca-neon-icon still has drop-shadow")
block = re.search(
    r"\.ca-section-head \.ca-icon \.ca-icon-img[\s\S]{0,220}",
    theme,
)
if block and "drop-shadow" in block.group(0):
    issues.append("theme.css: section icon img still has drop-shadow")

ds = DS.read_text(encoding="utf-8")
if re.search(
    r"\.ca-tool-card__icon[\s\S]{0,400}\.ca-icon-img[\s\S]{0,200}drop-shadow",
    ds,
):
    issues.append("mlbma_design_system.css: tool card icon drop-shadow remains")

stale_html = []
for html in DASH.glob("*.html"):
    text = html.read_text(encoding="utf-8", errors="ignore")
    if "mlbma_icons.js" in text and icon_ver and f"mlbma_icons.js?v={icon_ver}" not in text:
        if re.search(r"mlbma_icons\.js", text):
            stale_html.append(html.name)

if stale_html:
    issues.append(f"stale icon cache bust in: {', '.join(sorted(stale_html))}")

report = {
    "icon_ver": icon_ver,
    "png_count": len(list(ICONS.glob("neon-*.png"))),
    "issues": issues,
    "ok": not issues,
}
print(json.dumps(report, indent=2))
sys.exit(1 if issues else 0)
