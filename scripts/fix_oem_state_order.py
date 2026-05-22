#!/usr/bin/env python3
"""Move OEM helpers after STATE and add stateReady guards."""
from pathlib import Path

OEM = Path(__file__).resolve().parents[1] / "dashboard" / "chase_analytics_mlb_oem_v7.html"
lines = OEM.read_text(encoding="utf-8").splitlines(keepends=True)

start = None
for i, line in enumerate(lines):
    if "OEM MODE TABS" in line and i > 0 and "=====" in lines[i - 1]:
        start = i - 1
        break
if start is None:
    raise SystemExit("OEM block start not found")

end = None
for i in range(start, len(lines)):
    if lines[i].strip() == "});":
        chunk = "".join(lines[max(start, i - 12) : i + 1])
        if "oem-mode-tab" in chunk and "DOMContentLoaded" in chunk:
            end = i
            break
if end is None:
    raise SystemExit("OEM block end not found")

block = lines[start : end + 1]
new_lines = lines[:start] + lines[end + 1 :]

state_end = None
for i, line in enumerate(new_lines):
    if line.strip() == "};" and i > 0 and "oemMode" in new_lines[i - 1]:
        state_end = i + 1
        break
if state_end is None:
    raise SystemExit("STATE end not found")

insert_text = "".join(block)
insert_text = insert_text.replace(
    "   (oemMode default lives on STATE below)\n", ""
)
insert_text = insert_text.replace(
    "function setOemMode(mode) {\n  STATE.oemMode = mode;",
    "function stateReady() {\n  return typeof STATE !== 'undefined' && STATE;\n}\n\n"
    "function setOemMode(mode) {\n  if (!stateReady()) return;\n  mode = mode || STATE.oemMode || 'daily';\n  STATE.oemMode = mode;",
)
insert_text = insert_text.replace(
    "  urlEncodeState();",
    "  if (typeof urlEncodeState === 'function') urlEncodeState();",
)
insert_text = insert_text.replace(
    "  if (mode === 'daily') renderDailySummary();",
    "  if (mode === 'daily' && typeof renderDailySummary === 'function') renderDailySummary();",
)

dom_block = (
    "document.addEventListener('DOMContentLoaded', function() {\n"
    "  document.querySelectorAll('.oem-mode-tab').forEach(function(btn) {\n"
    "    btn.addEventListener('click', function() {\n"
    "      setOemMode(btn.getAttribute('data-oem-mode'));\n"
    "    });\n"
    "  });\n"
    "});\n"
)
bind_block = (
    "function bindOemModeTabs() {\n"
    "  document.querySelectorAll('.oem-mode-tab').forEach(function(btn) {\n"
    "    if (btn.dataset.oemBound) return;\n"
    "    btn.dataset.oemBound = '1';\n"
    "    btn.addEventListener('click', function() {\n"
    "      setOemMode(btn.getAttribute('data-oem-mode'));\n"
    "    });\n"
    "  });\n"
    "}\n"
)
insert_text = insert_text.replace(dom_block, bind_block)

text = "".join(new_lines[:state_end]) + insert_text + "".join(new_lines[state_end:])

text = text.replace(
    "    if(STATE.oemMode && STATE.oemMode !== 'daily') p.set('mode', STATE.oemMode);",
    "    if(stateReady() && STATE.oemMode && STATE.oemMode !== 'daily') p.set('mode', STATE.oemMode);",
    1,
)
text = text.replace(
    "    if(p.get('mode')) STATE.oemMode = p.get('mode');",
    "    if(p.get('mode') && stateReady()) STATE.oemMode = p.get('mode');",
    1,
)
text = text.replace(
    "function init(){\n  fetchLiveData();\n  urlDecodeState();\n  if (STATE.oemMode && STATE.oemMode !== 'daily') setOemMode(STATE.oemMode);",
    "function init(){\n  fetchLiveData();\n  urlDecodeState();\n  bindOemModeTabs();\n  if (stateReady() && STATE.oemMode && STATE.oemMode !== 'daily') setOemMode(STATE.oemMode);",
    1,
)

OEM.write_text(text, encoding="utf-8", newline="\n")
print(f"OK moved OEM block from lines {start + 1}-{end + 1} to after STATE (line {state_end + 1})")
