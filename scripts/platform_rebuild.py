"""Definitive platform rebuild — restructure chase_analytics_mlb_oem_v7.html."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = HTML.read_text(encoding="utf-8")

# Script tags
if "mlbma_assets.js" not in text:
    text = text.replace(
        '<script src="oem_overhaul.js"></script>',
        '<script src="mlbma_assets.js"></script>\n<script src="platform_dashboard.js"></script>\n<script src="oem_overhaul.js"></script>',
    )

PLATFORM_CSS = """
/* Platform rebuild */
.oem-mode-tabs, #pane-oem-methodology, .dash-section-nav,
#dailySummarySection, #section-market-map, #section-market-edge,
#section-game-script, #section-validate, .question-section { display: none !important; }
#pane-oem-daily, #pane-oem-research { display: block !important; }
#pane-oem-daily.active, #pane-oem-research.active { display: block !important; }
.platform-section { margin-bottom: 40px; scroll-margin-top: 88px; }
.platform-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--purple-2); margin-bottom: 4px; }
.platform-title { font-size: 22px; font-weight: 700; margin: 0 0 8px; letter-spacing: -.02em; }
.platform-subtitle { font-size: 12px; color: var(--text-2); margin-bottom: 16px; }
.matchups-hero-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
.matchups-hero-meta { font-size: 13px; color: var(--text-2); font-family: var(--mono); margin-right: auto; }
.sort-controls, .filter-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.sort-controls button, .filter-pills button {
  font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); cursor: pointer;
}
.sort-controls button.active, .filter-pills button.active { border-color: var(--purple-3); color: var(--text); background: rgba(168,85,247,.12); }
#matchupsHeroGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; }
.hero-matchup-card {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 14px; padding: 18px;
}
.hmc-row { margin-bottom: 12px; }
.hmc-teams { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hmc-team { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-weight: 700; font-size: 18px; }
.hmc-team.edge-team .hmc-abbr { color: var(--green); }
.hmc-at { color: var(--text-3); font-size: 12px; }
.hmc-time { margin-left: auto; font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.hmc-pitchers { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mc-sp-block { display: flex; gap: 8px; align-items: flex-start; font-size: 11px; }
.mc-sp-stats { font-family: var(--mono); color: var(--text-3); font-size: 10px; margin-top: 2px; }
.hmc-edge-label { font-size: 10px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: .06em; }
.hmc-osi-bar { display: grid; grid-template-columns: 72px 1fr 72px; gap: 8px; align-items: center; margin-bottom: 10px; }
.hmc-osi-val { font-size: 11px; color: var(--text-2); }
.hmc-osi-val.edge-team strong { color: var(--green); }
.hmc-osi-val.tr { text-align: right; }
.hmc-bar-track { height: 8px; border-radius: 4px; overflow: hidden; display: flex; background: var(--bg-4); }
.hmc-bar-away { background: var(--blue); height: 100%; }
.hmc-bar-home { background: var(--purple); height: 100%; }
.hmc-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.script-badge, .f5-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
.script-gray { background: rgba(161,161,170,.15); color: var(--text-2); }
.script-amber { background: rgba(251,191,36,.15); color: var(--gold); }
.script-orange { background: rgba(251,146,60,.15); color: var(--orange); }
.script-blue { background: rgba(96,165,250,.15); color: var(--blue); }
.script-muted { background: var(--bg-4); color: var(--text-3); }
.f5-green { background: rgba(74,222,128,.15); color: var(--green); }
.f5-amber { background: rgba(251,191,36,.15); color: var(--gold); }
.f5-blue { background: rgba(96,165,250,.15); color: var(--blue); }
.f5-muted { background: var(--bg-4); color: var(--text-3); }
.team-logo-fallback, .pitcher-headshot-fallback, .mc-headshot-fallback {
  display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;
  background: var(--bg-4); color: var(--text-3); font-size: 9px; font-weight: 700;
}
.signal-summary-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
#signalChips { display: flex; flex-wrap: wrap; gap: 8px; }
.signal-chip {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer;
  background: var(--bg-3); min-width: 120px;
}
.chip-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; opacity: .85; }
.chip-val { font-size: 12px; font-weight: 600; font-family: var(--mono); }
.chip-green { border-color: rgba(74,222,128,.35); }
.chip-amber { border-color: rgba(251,191,36,.35); }
.chip-teal { border-color: rgba(45,212,191,.35); }
.chip-red { border-color: rgba(248,113,113,.35); }
.chip-gray { border-color: rgba(161,161,170,.35); }
.chip-orange { border-color: rgba(251,146,60,.35); }
#signalSummaryBody.collapsed { display: none; }
.rankings-controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 14px; align-items: center; }
.metric-bar-chart-title { font-size: 12px; font-weight: 600; margin: 16px 0 8px; color: var(--text-2); }
.mbc-row { display: grid; grid-template-columns: 28px 36px 1fr 48px; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 11px; }
.mbc-track { height: 6px; background: var(--bg-4); border-radius: 3px; overflow: hidden; }
.mbc-fill { height: 100%; border-radius: 3px; }
.mbc-val { text-align: right; font-family: var(--mono); font-weight: 600; }
.f5-variance-note { font-size: 10px; color: var(--text-3); margin-top: 6px; }
#pane-matchup, #pane-strat, #pane-reference, #pane-matchup-builder { display: none !important; }
.research-lab-section { margin-top: 48px; padding-top: 32px; border-top: 1px solid var(--border); }
"""

if "/* Platform rebuild */" not in text:
    text = text.replace("</style>", PLATFORM_CSS + "\n</style>", 1)

HERO_SECTION = """
<section class="platform-section" id="section-matchups-hero">
  <motion></motion><div class="platform-eyebrow">Today's Slate</div>
  <h2 class="platform-title">Today's Projected Matchups</h2>
  <div class="matchups-hero-header">
    <div class="matchups-hero-meta" id="matchupsHeroMeta">Loading…</div>
    <div class="sort-controls">
      <span style="font-size:10px;color:var(--text-3);font-weight:600;">Sort:</span>
      <button type="button" class="active" data-match-sort="edge">OSI Edge</button>
      <button type="button" data-match-sort="time">Game Time</button>
      <button type="button" data-match-sort="pitch">Pitching Score</button>
    </div>
    <div class="filter-pills">
      <button type="button" class="active" data-match-filter="all">All</button>
      <button type="button" data-match-filter="edge">Best Edge</button>
      <button type="button" data-match-filter="duel">Pitching Duels</button>
      <button type="button" data-match-filter="power">Power Matchups</button>
      <button type="button" data-match-filter="f5">F5 Plays</button>
    </div>
  </div>
  <div id="matchupsHeroGrid"></div>
</section>

<section class="platform-section" id="section-signal-summary">
  <div class="signal-summary-header">
    <div>
      <div class="platform-eyebrow">Model Reads</motion></div>
      <h2 class="platform-title" style="font-size:16px;margin:0;">Today's Model Reads</h2>
    </div>
    <button type="button" class="btn" id="signalSummaryToggle" style="font-size:11px;">Hide ▴</button>
  </div>
  <div id="signalSummaryBody">
    <div id="signalChips"></div>
  </div>
</section>

<section class="platform-section" id="section-rankings">
  <div class="platform-eyebrow">League Table</div>
  <h2 class="platform-title">Team Offensive Rankings</h2>
  <div class="rankings-controls">
    <div class="control-group">
      <span class="control-label">Window</span>
      <div class="toggle-group" id="dashTimeToggle">
        <button class="toggle-btn active" data-time="YTD">YTD</button>
        <button class="toggle-btn" data-time="L30">L30</button>
        <button class="toggle-btn" data-time="L14">L14</button>
        <button class="toggle-btn warn" data-time="L7">L7</button>
      </div>
    </div>
    <div class="control-group">
      <span class="control-label">Split</span>
      <div class="toggle-group" id="dashSplitToggle">
        <button class="toggle-btn active" data-split="b">Both</button>
        <button class="toggle-btn" data-split="r">vs RHP</button>
        <button class="toggle-btn" data-split="l">vs LHP</button>
        <button class="toggle-btn" data-split="f5">F5</button>
      </motion></div>
    </div>
    <div class="search-bar" style="flex:1;min-width:200px;margin:0;">
      <input type="text" class="search-input" id="dashSearchInput" placeholder="Filter teams…" autocomplete="off">
    </div>
  </div>
  <motion></motion><div id="dashboardRankingsMount"></div>
  <div id="metricBarChart"></div>
</section>
"""
HERO_SECTION = HERO_SECTION.replace("<motion></motion>", "").replace("</motion>", "")

# Insert hero sections after freshness bar if not present
if "section-matchups-hero" not in text:
    text = re.sub(
        r'(<nav class="oem-mode-tabs"[^>]*>.*?</nav>\s*)',
        HERO_SECTION + "\n",
        text,
        count=1,
        flags=re.S,
    )

# Research lab subtabs -> 4 tabs
text = re.sub(
    r'<div class="subtabs">\s*<button class="subtab active" data-pane="splits">Lineup Splits</button>.*?</motion></div>\s*<!-- Splits pane -->',
    """<div class="subtabs">
    <button class="subtab active" data-pane="splits-trends">Splits &amp; Trends</button>
    <button class="subtab" data-pane="compare">Compare</button>
    <button class="subtab" data-pane="pitching">Pitching Context</button>
    <button class="subtab" data-pane="signals">Signal Explorer</button>
  </div>

  <!-- Splits & Trends pane -->""",
    text,
    count=1,
    flags=re.S,
)
text = text.replace('<!-- Splits & Trends pane -->', '<!-- Splits & Trends pane -->')
text = text.replace('id="pane-splits"', 'id="pane-splits-trends"')
text = text.replace(
    '<motion></motion><div class="section-title">Which Lineup Splits Matter Tonight?</div>',
    '<div class="section-title">Splits &amp; Trends</div>',
)
text = re.sub(
    r'<div class="section-title">Which Lineup Splits Matter Tonight\?</div>',
    '<div class="section-title">Splits &amp; Trends</motion></div>',
    text,
    count=1,
)
text = text.replace("</motion>", "")

# Update RESEARCH_SUBTABS
text = re.sub(
    r"var RESEARCH_SUBTABS = \[.*?\];",
    "var RESEARCH_SUBTABS = ['splits-trends', 'compare', 'pitching', 'signals'];",
    text,
    count=1,
)

# onResearchSubtabShown
old_on = """  if (name === 'splits') { renderSplitBars(); renderMasterTable(); }
  else if (name === 'trends') renderTrendHeatmap();
  else if (name === 'compare') initCompare();
  else if (name === 'pitching') { renderPitchingScore(); renderOOR(); }
  else if (name === 'signals' && window.OEMOverhaul) OEMOverhaul.renderConvergence();"""

new_on = """  if (name === 'splits-trends') { renderSplitBars(); renderMasterTable(); renderTrendHeatmap(); }
  else if (name === 'compare') initCompare();
  else if (name === 'pitching') { renderPitchingScore(); renderOOR(); }
  else if (name === 'signals') {
    if (window.OEMOverhaul) OEMOverhaul.renderConvergence();
    else renderStrats();
  }"""

if old_on in text:
    text = text.replace(old_on, new_on)

# renderAll patch
old_render = """  if (STATE.oemMode === 'daily' && window.OEMOverhaul) {
    OEMOverhaul.renderQuestionDashboard();
    OEMOverhaul.bindDashboardNav();
  } else {
    renderDailySummary();
    renderGlanceCards();
    renderMasterTable();
    renderQuadrant();
  }"""
new_render = """  mountDashboardRankings();
  if (window.PlatformDashboard) {
    PlatformDashboard.initRegistry().then(function() { PlatformDashboard.renderDashboard(); });
  } else if (STATE.oemMode === 'daily' && window.OEMOverhaul) {
    OEMOverhaul.renderQuestionDashboard();
    OEMOverhaul.bindDashboardNav();
  } else {
    renderDailySummary();
    renderGlanceCards();
    renderMasterTable();
    renderQuadrant();
  }"""

if old_render in text:
    text = text.replace(old_render, new_render)

# Add mountDashboardRankings function before mountResearchTables
mount_fn = """
function mountDashboardRankings() {
  var mount = document.getElementById('dashboardRankingsMount');
  var table = document.querySelector('#masterTable');
  if (!mount || !table) return;
  var section = table.closest('.section');
  if (section && !mount.contains(section)) mount.appendChild(section);
}

"""
if "function mountDashboardRankings" not in text:
    text = text.replace("function mountResearchTables()", mount_fn + "function mountResearchTables()")

# runPostLoadUI - remove renderStrats on main
text = text.replace("    renderStrats();\n    renderReferenceTables();", "    renderReferenceTables();")

# init - remove setOemMode daily
text = text.replace(
    "    bindOemModeTabs();\n    setOemMode(stateReady() && STATE.oemMode ? STATE.oemMode : 'daily');",
    "    bindOemModeTabs();",
)

# Metric header click -> bar chart
if "PlatformDashboard.renderMetricBarChart" not in text:
    text = text.replace(
        "function setActiveMetric(key){",
        "function setActiveMetric(key){\n  if(window.PlatformDashboard) PlatformDashboard.renderMetricBarChart(key);",
    )

# dash toggles sync with STATE
dash_bind = """
function bindDashRankingsControls(){
  var dt = document.getElementById('dashTimeToggle');
  var ds = document.getElementById('dashSplitToggle');
  var si = document.getElementById('dashSearchInput');
  if(dt && !dt.dataset.bound){
    dt.dataset.bound='1';
    dt.querySelectorAll('.toggle-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var t = btn.getAttribute('data-time');
        STATE.time = t;
        dt.querySelectorAll('.toggle-btn').forEach(function(b){ b.classList.toggle('active', b===btn); });
        var main = document.getElementById('timeToggle');
        if(main) main.querySelectorAll('.toggle-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-time')===t); });
        recomputeAllScores(); renderMasterTable();
        if(window.PlatformDashboard && STATE.activeMetric) PlatformDashboard.renderMetricBarChart(STATE.activeMetric);
      });
    });
  }
  if(ds && !ds.dataset.bound){
    ds.dataset.bound='1';
    ds.querySelectorAll('.toggle-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var s = btn.getAttribute('data-split');
        STATE.split = s === 'f5' ? 'b' : s;
        ds.querySelectorAll('.toggle-btn').forEach(function(b){ b.classList.toggle('active', b===btn); });
        var main = document.getElementById('splitToggle');
        if(main) main.querySelectorAll('.toggle-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-split')===(s==='f5'?'b':s)); });
        recomputeAllScores(); renderMasterTable();
      });
    });
  }
  if(si && !si.dataset.bound){
    si.dataset.bound='1';
    si.addEventListener('input', function(){ STATE.searchQuery = si.value; renderMasterTable(); });
  }
}
"""
if "function bindDashRankingsControls" not in text:
    text = text.replace("function init(){", dash_bind + "\nfunction init(){")

if "bindDashRankingsControls();" not in text:
    text = text.replace("    bindOemModeTabs();", "    bindOemModeTabs();\n    bindDashRankingsControls();")

# Wrap research pane in section
if 'class="research-lab-section"' not in text:
    text = text.replace(
        '<motion></motion><motion></motion><div class="oem-mode-pane" id="pane-oem-research"',
        '<section class="platform-section research-lab-section" id="section-research-lab">\n<div class="oem-mode-pane" id="pane-oem-research"',
    )
    text = text.replace("<motion></motion>", "")
    text = text.replace(
        '</div><!-- /pane-oem-research -->',
        '</div><!-- /pane-oem-research -->\n</section><!-- /section-research-lab -->',
    )

HTML.write_text(text, encoding="utf-8")
print("Patched", HTML)
