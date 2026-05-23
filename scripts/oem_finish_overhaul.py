"""Finish structural overhaul patches on OEM dashboard HTML."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = path.read_text(encoding="utf-8")

text = re.sub(
    r'\n<div class="main-research-only" id="mainResearchControls">.*?</motion></div><!-- /mainResearchControls -->\n',
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r'\n<div class="main-research-only" id="mainResearchControls">.*?</div><!-- /mainResearchControls -->\n',
    "\n",
    text,
    count=1,
    flags=re.S,
)

prev_text = subprocess.check_output(
    ["git", "show", "HEAD:dashboard/chase_analytics_mlb_oem_v7.html"],
    cwd=ROOT,
    text=True,
    encoding="utf-8",
    errors="replace",
)
rank_match = re.search(
    r"<!-- Rankings table -->(.*?)\n\n<!-- Strategic Signal Cards",
    prev_text,
    re.S,
)
if not rank_match:
    raise SystemExit("Could not extract rankings table from HEAD commit")
rankings = rank_match.group(1).strip()
rankings = rankings.replace("Offensive status by team", "Split &amp; window research table")
rankings = re.sub(
    r'<div class="section-eyebrow">Rankings</div>',
    '<div class="section-eyebrow">Full Metric Table</div>',
    rankings,
)
rankings = re.sub(
    r"Sorted by.*?click headers to sort",
    "Use split/time toggles above · click headers to sort",
    rankings,
    flags=re.S,
)

controls = """<motion></motion><div class="research-lab-controls" id="mainResearchControls">
<div class="watchlist-bar" id="watchlistBar">
  <span class="wl-label">Pin Watchlist</span>
  <div id="watchlistPills" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
  <button class="icon-btn" style="margin-left:auto;font-size:11px;width:auto;padding:4px 10px;" onclick="clearWatchlist()">Clear</button>
</div>
<div class="control-bar research-controls">
  <div class="control-group">
    <span class="control-label">Split</span>
    <div class="toggle-group" id="splitToggle">
      <button class="toggle-btn active" data-split="b">Both</button>
      <button class="toggle-btn" data-split="r">vs RHP</button>
      <button class="toggle-btn" data-split="l">vs LHP</button>
    </div>
  </div>
  <div class="control-group">
    <span class="control-label">Timeframe</span>
    <motion></motion><motion></motion><div class="toggle-group" id="timeToggle">
      <button class="toggle-btn active" data-time="YTD">YTD</button>
      <button class="toggle-btn" data-time="L30">L30</button>
      <button class="toggle-btn" data-time="L14">L14</button>
      <button class="toggle-btn warn" data-time="L7" id="l7ToggleBtn">L7</button>
    </div>
  </div>
  <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
    <button class="icon-btn icon-label-btn" id="compareToggleBtn" onclick="toggleCompareMode()">Compare</button>
    <button class="icon-btn icon-label-btn" id="pinToggleBtn" onclick="togglePinMode()">Pin</button>
    <button class="icon-btn icon-label-btn" onclick="exportCSV()">Export</button>
  </div>
</div>
<div class="search-bar">
  <input type="text" class="search-input" id="searchInput" placeholder="Filter teams…" autocomplete="off">
  <button type="button" class="filter-help-btn" id="filterHelpBtn" title="Search syntax help">?</button>
  <div class="filter-help-panel" id="filterHelpPanel">Try: <code>abq&gt;60</code>, <code>trend:rising</code></div>
</div>
<div class="glance-grid" id="glanceGrid"></div>
</div>"""
controls = controls.replace("<motion></motion>", "").replace("</motion>", "")

split_bars = """
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px;" class="split-grid">
      <motion></motion><div>
        <div style="font-size: 12px; font-weight: 600; color: var(--blue); margin-bottom: 8px;">vs RHP — OSI view</div>
        <div id="rhpBars"></div>
      </div>
      <div>
        <div style="font-size: 12px; font-weight: 600; color: var(--purple); margin-bottom: 8px;">vs LHP — OSI view</div>
        <div id="lhpBars"></div>
      </div>
    </div>"""
split_bars = split_bars.replace("<motion></motion>", "")

if not re.search(r'id="pane-splits"[^>]*>.*?id="masterTable"', text, re.S):
    replacement = r"\1" + controls + split_bars + "\n    " + rankings + "\n  </div>"
    text, n = re.subn(
        r'(<!-- Splits pane -->\s*<motion></motion><div id="pane-splits" style="display:block;">\s*<div class="section-header">.*?</div>\s*)'
        r'(?:<div id="splitsTableMount"></div>\s*)?'
        r'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;(?: margin-top: 20px;)?" class="split-grid">.*?</div>\s*</div>',
        replacement,
        text,
        count=1,
        flags=re.S,
    )
    if n == 0:
        text, n = re.subn(
            r'(<!-- Splits pane -->\s*<div id="pane-splits" style="display:block;">\s*<div class="section-header">.*?</div>\s*)'
            r'(?:<div id="splitsTableMount"></div>\s*)?'
            r'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;(?: margin-top: 20px;)?" class="split-grid">.*?</div>\s*</div>',
            replacement,
            text,
            count=1,
            flags=re.S,
        )
    if n == 0:
        raise SystemExit("Could not patch pane-splits")

text = text.replace(
    "<th>Trend</th><th>Interpretation</th>",
    "<th>Trend</th><th>Reliability</th><th>Interpretation</th>",
)

old_ref = (
    "function renderReferenceTables() {\n"
    "  renderOOR();\n"
    "  renderPitchingScore();\n"
    "  renderPALS();\n"
    "  renderMatchups();\n"
    "}"
)
new_ref = """function renderReferenceTables() {
  renderOOR();
  renderPitchingScore();
  if (window.OEMOverhaul && document.getElementById('dailyMatchupsMount')) {
    OEMOverhaul.renderSection1Matchups();
  } else {
    renderMatchups();
  }
}"""
if old_ref in text:
    text = text.replace(old_ref, new_ref)

text = text.replace(
    "return active ? active.getAttribute('data-pane') : 'strat';",
    "return active ? active.getAttribute('data-pane') : 'splits';",
)

path.write_text(text, encoding="utf-8")
print("Updated", path)
