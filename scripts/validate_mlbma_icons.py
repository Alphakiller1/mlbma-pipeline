"""Validate MLBMA icon mappings resolve to PNG files or line SVG fallbacks."""
from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "dashboard" / "assets" / "icons"
ICONS_JS = ROOT / "dashboard" / "mlbma_icons.js"
DASH = ROOT / "dashboard"

js = ICONS_JS.read_text(encoding="utf-8")
mark_section = js.split("var MARK_ICONS = {")[1].split("};")[0]
line_section = js.split("var LINE_ICONS = {")[1].split("};")[0]
prof_block = re.search(r"var PROFILE_ICONS = \{([\s\S]*?)\};", js)
alias_block = re.search(r"var ICON_ALIAS = \{([\s\S]*?)\};", js)

neon_section = js.split("var NEON = {")[1].split("};")[0]
NEON = {}
for m in re.finditer(r"(\w+):\s*'(neon-[^']+)'", neon_section):
    NEON[m.group(1)] = m.group(2).lower()

MARK_MAP = {}
for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", mark_section):
    MARK_MAP[m.group(1).lower()] = m.group(2).lower()
for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*NEON\.(\w+)", mark_section):
    ref = NEON.get(m.group(2))
    if ref:
        MARK_MAP[m.group(1).lower()] = ref

LINE_KEYS = set(a or b for a, b in re.findall(r"(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*L\(", line_section))
png_files = {p.stem for p in ICONS_DIR.glob("*.png")}
svg_files = {p.stem for p in ICONS_DIR.glob("neon-*.svg")}
mark_assets = png_files | svg_files
mark_values = set(MARK_MAP.values())
missing_png = sorted(mark_values - mark_assets)

ICON_ALIAS = {}
if alias_block:
    for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", alias_block.group(1)):
        ICON_ALIAS[m.group(1).lower()] = m.group(2).lower()

PROFILE_ICONS = {}
if prof_block:
    for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", prof_block.group(1)):
        PROFILE_ICONS[m.group(1).lower()] = m.group(2).lower()

keys = set(PROFILE_ICONS.keys()) | set(ICON_ALIAS.keys())
patterns = [
    r"data-lucide=\"([a-z0-9-]+)\"",
    r"icon:\s*['\"]([a-z0-9_-]+)['\"]",
]
skip = {"assets/chase-icon-filled.png", "h", "insight"}
for path in DASH.rglob("*"):
    if path.suffix not in {".js", ".html"} or path.name == "mlbma_icons.js":
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for pat in patterns:
        for k in re.findall(pat, text, re.I):
            if k and not k.startswith("'"):
                keys.add(k.lower().replace("_", "-"))


def resolve(name):
    k = (name or "").lower()
    if k in PROFILE_ICONS:
        k = PROFILE_ICONS[k]
    seen = set()
    while k in ICON_ALIAS and k not in seen:
        seen.add(k)
        k = ICON_ALIAS[k]
    if k in MARK_MAP and MARK_MAP[k] in mark_assets:
        return "svg" if MARK_MAP[k] in svg_files else "png", MARK_MAP[k]
    if k in LINE_KEYS:
        return "line", k
    if k in mark_assets:
        return "svg" if k in svg_files else "png", k
    return "missing", k


unresolved = []
for key in sorted(keys):
    kind, _ = resolve(key)
    if kind == "missing":
        unresolved.append(key)

report = {
    "png_files": len(png_files),
    "missing_png_for_mark_values": missing_png,
    "keys_checked": len(keys),
    "unresolved": unresolved,
}
print(json.dumps(report, indent=2))
if missing_png or unresolved:
    raise SystemExit(1)
