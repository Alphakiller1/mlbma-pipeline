"""Extended icon integration checks."""
from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = ROOT / "dashboard" / "assets" / "icons"
ICONS_JS = ROOT / "dashboard" / "mlbma_icons.js"
DASH = ROOT / "dashboard"

js = ICONS_JS.read_text(encoding="utf-8")
ver_match = re.search(r"var ICON_VER = '([^']+)'", js)
icon_ver = ver_match.group(1) if ver_match else None

# 1) PNG files exist and non-trivial size
png_issues = []
for p in ICONS_DIR.glob("*.png"):
    if p.stat().st_size < 500:
        png_issues.append(f"{p.name}: too small ({p.stat().st_size} bytes)")

# 2) Cache bust consistency in HTML/JS
cache_refs = set()
for path in DASH.rglob("*"):
    if path.suffix not in {".html", ".js"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r"mlbma_icons\.js\?v=([a-z0-9]+)", text):
        cache_refs.add(m.group(1))
    for m in re.finditer(r"mlbma_icons\.js(?!\?v=)", text):
        if "mlbma_icons.js" in text and "mlbma_icons.js?v=" not in text.split("mlbma_icons.js")[1][:10]:
            pass  # handled below

unversioned = []
for path in DASH.rglob("*"):
    if path.suffix not in {".html", ".js"} or path.name == "mlbma_icons.js":
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    if re.search(r'mlbma_icons\.js"', text) or re.search(r"mlbma_icons\.js'", text):
        unversioned.append(str(path.relative_to(ROOT)))
    if re.search(r'src="mlbma_icons\.js"', text):
        unversioned.append(str(path.relative_to(ROOT)))

# 3) ICON_VER appears in generated img src
if icon_ver and icon_ver not in js:
    pass
img_ver_ok = f"?v={icon_ver}" in js

# 4) Every PROFILE_ICONS value resolves to mark or line
mark_section = js.split("var MARK_ICONS = {")[1].split("};")[0]
line_section = js.split("var LINE_ICONS = {")[1].split("};")[0]
prof_block = re.search(r"var PROFILE_ICONS = \{([\s\S]*?)\};", js)
alias_block = re.search(r"var ICON_ALIAS = \{([\s\S]*?)\};", js)

MARK_MAP = {}
for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", mark_section):
    MARK_MAP[m.group(1).lower()] = m.group(2).lower()
LINE_KEYS = set(a or b for a, b in re.findall(r"(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*L\(", line_section))
png_files = {p.stem for p in ICONS_DIR.glob("*.png")}
ICON_ALIAS = {}
PROFILE_ICONS = {}
if alias_block:
    for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", alias_block.group(1)):
        ICON_ALIAS[m.group(1).lower()] = m.group(2).lower()
if prof_block:
    for m in re.finditer(r"['\"]?([a-z0-9-]+)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", prof_block.group(1)):
        PROFILE_ICONS[m.group(1).lower()] = m.group(2).lower()


def resolve(k):
    k = k.lower()
    seen = set()
    while k in ICON_ALIAS and k not in seen:
        seen.add(k)
        k = ICON_ALIAS[k]
    if k in MARK_MAP and MARK_MAP[k] in png_files:
        return True
    if k in LINE_KEYS:
        return True
    if k in png_files:
        return True
    return False


profile_fail = [v for v in PROFILE_ICONS.values() if not resolve(v)]

# 5) data-lucide keys in HTML
lucide_keys = set()
for path in DASH.rglob("*.html"):
    text = path.read_text(encoding="utf-8", errors="ignore")
    lucide_keys.update(re.findall(r'data-lucide="([a-z0-9-]+)"', text))

lucide_fail = []
for k in sorted(lucide_keys):
    kk = k.lower()
    if kk in PROFILE_ICONS:
        kk = PROFILE_ICONS[kk]
    elif kk in ICON_ALIAS:
        kk = ICON_ALIAS[kk]
    if not resolve(kk):
        lucide_fail.append(k)

# 6) Pages using matchup_shared or MLBMAIcons should load mlbma_icons.js
needs_icons = []
for path in DASH.glob("*.html"):
    text = path.read_text(encoding="utf-8", errors="ignore")
    uses = "matchup_shared.js" in text or "MLBMAIcons" in text or "iconCircleHtml" in text
    has = "mlbma_icons.js" in text or "ensureIconScripts" in text
    if uses and not has and path.name not in {"chase_nav.html", "hero_rework_preview.html", "batter_profile_prop_hub_mockup.html"}:
        needs_icons.append(path.name)

report = {
    "icon_ver_in_js": icon_ver,
    "cache_bust_refs": sorted(cache_refs),
    "cache_bust_consistent": len(cache_refs) <= 1,
    "img_ver_token_ok": img_ver_ok,
    "png_count": len(list(ICONS_DIR.glob("*.png"))),
    "png_size_issues": png_issues,
    "unversioned_script_refs": sorted(set(unversioned)),
    "profile_icon_targets_ok": len(profile_fail) == 0,
    "profile_failures": profile_fail,
    "data_lucide_keys": len(lucide_keys),
    "data_lucide_failures": lucide_fail,
    "pages_missing_icon_script": needs_icons,
}
print(json.dumps(report, indent=2))
if (
    png_issues
    or not report["cache_bust_consistent"]
    or profile_fail
    or lucide_fail
    or unversioned
    or needs_icons
):
    raise SystemExit(1)
