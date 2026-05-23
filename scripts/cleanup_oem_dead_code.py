"""Remove dead functions and HTML from chase_analytics_mlb_oem_v7.html."""
import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = p.read_text(encoding="utf-8")

text = re.sub(r"function fetchLiveData\(\) \{.*?\n\}\n\n", "", text, count=1, flags=re.S)

dead_funcs = [
    "renderMatchups",
    "renderDailySummary",
    "renderGlanceCards",
    "renderExecSummary",
    "renderQuadrant",
    "renderMovers",
    "renderLeagueOverview",
    "renderReferenceTables",
    "renderOOR",
]


def remove_function(name: str, src: str) -> str:
    pat = rf"function {name}\([^)]*\)\s*\{{"
    m = re.search(pat, src)
    if not m:
        print("skip", name)
        return src
    start = m.start()
    i = m.end() - 1
    depth = 0
    while i < len(src):
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(src) and src[end] in "\r\n":
                    end += 1
                print("removed", name)
                return src[:start] + src[end:]
        i += 1
    return src


for fn in dead_funcs:
    text = remove_function(fn, text)

text = re.sub(r"\n// Quadrant mode toggle.*?\n\}\);\n", "\n", text, count=1, flags=re.S)
text = re.sub(
    r"\n\(function\(\) \{\n  var btn = document\.getElementById\('l7InfoBtn'\);.*?\n\}\)\(\);\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = text.replace("renderQuadrant(); renderSplitBars();", "renderSplitBars();")

text = text.replace('<motion.div class="glance-grid" id="glanceGrid"></motion.div>\n', "")
text = text.replace('<div class="glance-grid" id="glanceGrid"></div>\n', "")
text = text.replace('<motion.div id="metricBreakdownSection" style="display:none;"></motion.div>\n', "")
text = text.replace('<motion.div id="metricBreakdownSection" style="display:none;"></div>\n', "")
text = text.replace('<motion.div id="metricBreakdownSection" style="display:none;"></motion.div>', "")

for pane in ("pane-matchup", "pane-signals", "pane-strat", "pane-reference", "pane-trends"):
    text = re.sub(rf'  <div id="{pane}".*?</div>\n', "", text, count=1, flags=re.S)

text = re.sub(r'\n  <link rel="stylesheet" href="mlbma_design_system\.css">\n', "\n", text, count=1)
text = re.sub(r"\?v=2026052[0-9][a-z]", "?v=20260523", text)

p.write_text(text, encoding="utf-8")
print("done", len(text.splitlines()), "lines")
