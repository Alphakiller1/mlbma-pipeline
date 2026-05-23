"""Structural overhaul: question-driven dashboard layout."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
NAV = ROOT / "dashboard" / "chase_nav.html"
text = HTML.read_text(encoding="utf-8")

CSS = """
/* Question-driven dashboard */
.question-section { margin-bottom: 36px; scroll-margin-top: 88px; }
.question-title { font-size: 20px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em; }
.question-subtitle { font-size: 12px; color: var(--text-2); margin-bottom: 16px; max-width: 640px; line-height: 1.5; }
.main-research-only { display: none !important; }
.dash-section-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 20px; }
.dash-section-nav a {
  font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 6px;
  border: 1px solid var(--border); color: var(--text-2); text-decoration: none;
}
.dash-section-nav a:hover { border-color: var(--purple-3); color: var(--text); }
.question-card .ds-eyebrow { color: var(--purple-2); font-weight: 600; }
.matchup-card-v2 {
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px; transition: border-color 0.15s;
}
.matchup-card-v2:hover { border-color: var(--purple-3); }
.mc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mc-time { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.weather-badge { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: var(--bg-4); color: var(--text-2); }
.mc-matchup { font-size: 18px; font-weight: 700; font-family: var(--mono); margin-bottom: 12px; }
.mc-sp-row { font-size: 11px; color: var(--text-2); margin-bottom: 10px; line-height: 1.7; }
.mc-sp-label { color: var(--text-3); font-weight: 600; text-transform: uppercase; font-size: 9px; }
.pitch-tier { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 4px; }
.pitch-tier-elite { background: var(--green-dim); color: var(--green); }
.pitch-tier-solid { background: rgba(96,165,250,.15); color: var(--blue); }
.pitch-tier-mid { background: var(--bg-4); color: var(--text-2); }
.pitch-tier-vol { background: var(--gold-dim); color: var(--gold); }
.mc-osi-label { font-size: 10px; color: var(--text-3); margin-bottom: 6px; }
.mc-osi-bar { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
.mc-bar-track { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--bg-4); }
.mc-bar-away { background: var(--blue); opacity: 0.85; }
.mc-bar-home { background: var(--purple); opacity: 0.85; }
.mc-meta { font-size: 11px; color: var(--text-2); margin-bottom: 8px; }
.edge-columns, .val-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 768px) { .edge-columns, .val-columns { grid-template-columns: 1fr; } }
.edge-col-title { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
.edge-col-title.buy { color: var(--blue); }
.edge-col-title.fade { color: var(--gold); }
.edge-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; cursor: pointer; flex-wrap: wrap; }
.edge-row:hover { border-color: var(--purple-3); }
.edge-team { font-weight: 700; font-family: var(--mono); min-width: 36px; }
.edge-pp { font-family: var(--mono); font-weight: 600; }
.edge-pp.pos { color: var(--blue); }
.edge-pp.neg { color: var(--gold); }
.pals-badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
.pals-badge.ok { background: var(--green-dim); color: var(--green); }
.pals-badge.warn { background: var(--gold-dim); color: var(--gold); }
.proj-arrow { font-size: 12px; font-weight: 700; }
.proj-arrow.up { color: var(--green); }
.proj-arrow.down { color: var(--red-l); }
.proj-arrow.flat { color: var(--text-3); }
.script-card { background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 10px; }
.script-game { font-size: 12px; font-weight: 600; font-family: var(--mono); margin-bottom: 6px; }
.script-label { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
.script-duel { color: var(--blue); }
.script-grind { color: var(--green); }
.script-power { color: var(--purple); }
.script-sloppy { color: var(--gold); }
.script-quick { color: var(--text-2); }
.script-neutral { color: var(--text-2); }
.f5-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; background: var(--bg-4); color: var(--text-2); margin-bottom: 6px; }
.script-detail { font-size: 11px; color: var(--text-3); }
.val-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.val-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
.val-confirmed { background: var(--green-dim); color: var(--green); }
.val-inflated { background: rgba(248,113,113,.15); color: var(--red-l); }
.val-deflated { background: rgba(96,165,250,.15); color: var(--blue); }
.val-neutral { background: var(--bg-4); color: var(--text-3); }
.val-col h3 { font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 10px; }
#gameScriptGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.metrics-toggle.sm { padding: 2px 8px; font-size: 10px; margin: 0; }
.research-controls { margin-bottom: 16px; }
"""

if ".question-section" not in text:
    text = text.replace("#pane-reference { display: none; }", "#pane-reference { display: none; }\n" + CSS)

nav_old = """    <motion></motion><div class="chase-nav-links">
      <a href="chase_analytics_mlb_oem_v7.html" class="chase-nav-link">Dashboard</a>
      <a href="matchup_sheet.html" class="chase-nav-link">Matchups</a>
      <div class="chase-dropdown">""".replace("<motion></motion>", "")

nav_new = """    <div class="chase-nav-links">
      <a href="#section-lineup-edge" class="chase-nav-link" data-dash-section="section-lineup-edge">Tonight&apos;s Games</a>
      <a href="#section-market-edge" class="chase-nav-link" data-dash-section="section-market-edge">Market Edge</a>
      <a href="#section-game-script" class="chase-nav-link" data-dash-section="section-game-script">Game Script</a>
      <a href="#section-validate" class="chase-nav-link" data-dash-section="section-validate">Validate</a>
      <a href="#" class="chase-nav-link" data-oem-research="1">Research</a>
      <div class="chase-dropdown">"""

text = text.replace(
    """    <div class="chase-nav-links">
      <a href="chase_analytics_mlb_oem_v7.html" class="chase-nav-link">Dashboard</a>
      <a href="matchup_sheet.html" class="chase-nav-link">Matchups</a>
      <div class="chase-dropdown">""",
    nav_new,
    1,
)

mob_old = """    <a href="chase_analytics_mlb_oem_v7.html" class="chase-mobile-link">Dashboard</a>
    <a href="matchup_sheet.html" class="chase-mobile-link">Matchups</a>"""
mob_new = """    <a href="#section-lineup-edge" class="chase-mobile-link" data-dash-section="section-lineup-edge">Tonight&apos;s Games</a>
    <a href="#section-market-edge" class="chase-mobile-link" data-dash-section="section-market-edge">Market Edge</a>
    <a href="#section-game-script" class="chase-mobile-link" data-dash-section="section-game-script">Game Script</a>
    <a href="#section-validate" class="chase-mobile-link" data-dash-section="section-validate">Validate</a>
    <a href="#" class="chase-mobile-link" data-oem-research="1">Research Lab</a>"""
text = text.replace(mob_old, mob_new, 1)
text = text.replace('Players\n          <svg xmlns="http://www.w3.org/2000/svg"', 'Profiles\n          <svg xmlns="http://www.w3.org/2000/svg"', 1)

# Daily pane replacement
idx_start = text.find('<motion></motion><div class="oem-mode-pane active" id="pane-oem-daily"'.replace("<motion></motion>", ""))
if idx_start < 0:
    idx_start = text.find('<motion></motion><div class="oem-mode-pane active" id="pane-oem-daily"'.replace("<motion></motion>", ""))
idx_start = text.find('<div class="oem-mode-pane active" id="pane-oem-daily"')
idx_end = text.find('</div><!-- /pane-oem-daily -->', idx_start)

if idx_start >= 0 and idx_end >= 0:
    # Extract rankings section from old content for research mount
    old_daily = text[idx_start:idx_end]
    rank_match = re.search(r'(<!-- Rankings table -->.*?</motion></motion></div>\s*</div>\s*<div class="mobile-cards".*?</div>\s*</motion></motion></div>)', old_daily, re.S)
    if not rank_match:
        rank_match = re.search(r'(<!-- Rankings table -->.*?</motion></motion></div>\s*</div>\s*<div class="mobile-cards".*?</div>\s*</div>)', old_daily, re.S)
    if not rank_match:
        rank_match = re.search(r'(<!-- Rankings table -->.*?<div class="mobile-cards" id="mobileCards"></div>\s*</motion></motion></div>)', old_daily, re.S)
    rankings_block = rank_match.group(1) if rank_match else ""
    rankings_block = re.sub(r'</?motion>', '', rankings_block)

    new_daily = '''<div class="oem-mode-pane active" id="pane-oem-daily" data-oem-pane="daily">
<div class="layer-main" id="layerMain">

<section class="daily-summary section" id="dailySummarySection">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Daily Read</div>
      <div class="section-title">Five Questions for Tonight</div>
      <motion></motion><motion></motion><div class="section-subtitle">Quick answers before matchups, market edge, game script, and validation.</div>
    </div>
  </div>
  <div class="daily-summary-grid" id="dailySummaryGrid"></div>
</section>

<nav class="dash-section-nav" aria-label="Dashboard sections">
  <a href="#section-lineup-edge" data-dash-section="section-lineup-edge">Tonight&apos;s Games</a>
  <a href="#section-market-edge" data-dash-section="section-market-edge">Market Edge</a>
  <a href="#section-game-script" data-dash-section="section-game-script">Game Script</a>
  <a href="#section-validate" data-dash-section="section-validate">Validate</a>
</nav>

<section class="question-section" id="section-lineup-edge">
  <h2 class="question-title">Who Has The Offensive Edge Tonight?</h2>
  <p class="question-subtitle">Split-specific lineup OSI vs tonight&apos;s SP handedness. Expand any game for lineup detail.</p>
  <div id="dailyMatchupsMount"></div>
</section>

<div class="section status-map-wrap" id="section-market-map">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Visual Anchor</div>
      <div class="section-title" id="chartTitle">Offensive Market Status Map</div>
      <div class="section-subtitle">OSI vs PP-Gap — buy-low vs fade quadrants.</div>
    </div>
  </div>
  <div class="legend-row">
    <span class="legend-dot"><span class="dot" style="background: var(--green);"></span> Back Team Totals</span>
    <span class="legend-dot"><span class="dot" style="background: var(--blue);"></span> Buy Low Offense</span>
    <span class="legend-dot"><span class="dot" style="background: var(--gold);"></span> Fade Momentum</span>
    <span class="legend-dot"><span class="dot" style="background: var(--red);"></span> Fade / Under Lean</span>
  </div>
  <div class="chart-wrap">
    <div class="chart-placeholder" id="chartPlaceholder">Loading status map...</div>
    <div id="mainChart"></div>
    <div class="tooltip" id="chartTip"></div>
  </div>
</div>

<section class="question-section" id="section-market-edge">
  <h2 class="question-title">Which Offenses Are Priced Wrong?</h2>
  <p class="question-subtitle">Top buy-low and fade candidates by process-production gap with PALS confirmation.</p>
  <div id="marketEdgeBoard"></motion></motion></div>
</section>

<section class="question-section" id="section-game-script">
  <h2 class="question-title">How Will This Game Be Played?</h2>
  <p class="question-subtitle">ABQ vs Pitching Score game script with F5 vs full-game badge.</p>
  <div id="gameScriptGrid"></div>
</section>

<section class="question-section" id="section-validate">
  <h2 class="question-title">Can I Trust This Number?</h2>
  <p class="question-subtitle">PALS schedule confirmation for offenses · OOR ERA validation for tonight&apos;s SPs.</p>
  <div id="validationGrid"></div>
</section>

<div class="main-research-only" id="mainResearchControls">
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
    <div class="toggle-group" id="timeToggle">
      <button class="toggle-btn active" data-time="YTD">YTD</button>
      <button class="toggle-btn" data-time="L30">L30</button>
      <button class="toggle-btn" data-time="L14">L14</button>
      <button class="toggle-btn warn" data-time="L7" id="l7ToggleBtn">L7</button>
    </div>
  </div>
</div>
<div class="search-bar">
  <input type="text" class="search-input" id="searchInput" placeholder="Filter teams…" autocomplete="off">
  <button type="button" class="filter-help-btn" id="filterHelpBtn" title="Search syntax help">?</button>
  <div class="filter-help-panel" id="filterHelpPanel">Try: <code>abq&gt;60</code>, <code>trend:rising</code></div>
</div>
<div class="glance-grid" id="glanceGrid"></div>
''' + rankings_block + '''
</div><!-- /mainResearchControls -->

</div><!-- /layer-main -->
'''
    new_daily = re.sub(r'</?motion>', '', new_daily)
    text = text[:idx_start] + new_daily + text[idx_end:]

# Research subtabs
text = text.replace(
    """  <div class="subtabs">
    <button class="subtab active" data-pane="strat">Strategic Signals</button>
    <button class="subtab" data-pane="splits">Splits</button>
    <button class="subtab" data-pane="trends">Trends</button>
    <button class="subtab" data-pane="compare">Compare</button>
    <button class="subtab" data-pane="matchup">Matchup Builder</button>
    <button class="subtab" data-pane="reference">Reference Tables</button>
  </div>""",
    """  <div class="subtabs">
    <button class="subtab active" data-pane="splits">Lineup Splits</button>
    <button class="subtab" data-pane="trends">Trends</button>
    <button class="subtab" data-pane="compare">Compare</button>
    <button class="subtab" data-pane="pitching">Pitching Context</button>
    <button class="subtab" data-pane="signals">Signals Today</button>
  </div>""",
    1,
)

text = text.replace(
    "var RESEARCH_SUBTABS = ['strat', 'splits', 'trends', 'compare', 'matchup', 'reference'];",
    "var RESEARCH_SUBTABS = ['splits', 'trends', 'compare', 'pitching', 'signals'];",
)

text = text.replace(
    """  <motion></motion><div id="pane-splits" style="display:none;">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Platoon Splits</div>
        <div class="section-title">vs RHP and vs LHP · OSI distribution view</div>
        <div class="section-subtitle">YTD data · click bars to view team detail</div>
      </div>
    </div>""".replace("<motion></motion>", ""),
    """  <div id="pane-splits" style="display:block;">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Research Lab</div>
        <div class="section-title">Which Lineup Splits Matter Tonight?</div>
        <div class="section-subtitle">Split OSI bars plus full metric table with window toggles.</div>
      </div>
    </div>
    <div id="splitsTableMount"></div>""",
)

text = text.replace(
    '<div class="section-title">OSI Heatmap with directional arrows · YTD → L30 → L14 → L7</div>',
    '<div class="section-title">Is This Trend Real Or Noise?</motion></motion></div>'.replace("</motion></motion></div>", "</motion></motion></div>"),
)
text = text.replace('<div class="section-title">Is This Trend Real Or Noise?</motion></motion></div>', '<div class="section-title">Is This Trend Real Or Noise?</div>')

text = text.replace(
    '<div class="section-title">Side-by-side radar &amp; metrics — pick 2–4 teams</div>',
    '<div class="section-title">How Do Two Teams Compare?</div>',
)

text = text.replace(
    '  <!-- Strategic Signals pane -->\n  <div id="pane-strat">',
    '''  <motion></motion><div id="pane-pitching" style="display:none;">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Research Lab</div>
        <div class="section-title">What Does The Pitching Context Say?</div>
        <div class="section-subtitle">Pitching Score + OOR SP context for F5 vs full-game validation.</div>
      </div>
    </div>
    <div id="pitchingResearchMount"></div>
    <div id="oorResearchMount"></div>
  </div>
  <div id="pane-signals" style="display:none;">
    <motion></motion><div class="section-header">
      <div>
        <div class="section-eyebrow">Research Lab</div>
        <div class="section-title">What Have Signals Fired On Today?</div>
        <div class="section-subtitle">Convergence signal matrix per game.</div>
      </div>
    </div>
    <div id="convergenceGrid"></div>
  </div>
  <div id="pane-strat" style="display:none;">'''.replace("<motion></motion>", ""),
)

if 'oem_overhaul.js' not in text:
    text = text.replace(
        '<script src="mlbma_ui.js" data-page="chase_analytics_mlb_oem_v7.html"></script>',
        '<script src="mlbma_ui.js" data-page="chase_analytics_mlb_oem_v7.html"></script>\n<script src="oem_overhaul.js"></script>',
    )

text = text.replace(
    """function renderDailyRead() {
  renderDailySummary();
  renderQuadrant();
  renderMasterTable();
  mountReferenceTables();
  renderMatchups();
  renderStrats();
  bindFilterHelp();
}""",
    """function renderDailyRead() {
  if (window.OEMOverhaul) {
    OEMOverhaul.renderQuestionDashboard();
    OEMOverhaul.bindDashboardNav();
  } else {
    renderDailySummary();
    renderQuadrant();
    renderMatchups();
  }
  mountReferenceTables();
  bindFilterHelp();
}""",
)

text = text.replace(
    """function renderAll(){
  console.log('[MLBMA] renderAll start');
  attachPalsToScores();
  renderDailySummary();
  if (typeof hideChartPlaceholder === 'function') hideChartPlaceholder();
  if (typeof hideRankSkeleton === 'function') hideRankSkeleton();
  renderGlanceCards();
  renderMasterTable();
  renderQuadrant();
  renderWatchlistBar();
  renderComparePane();
  renderMatchupOutput();
  renderSplitBars();
  renderTrendHeatmap();
  renderStrats();
  mountReferenceTables();
  renderReferenceTables();
  urlEncodeState();
}""",
    """function renderAll(){
  console.log('[MLBMA] renderAll start');
  attachPalsToScores();
  if (typeof hideChartPlaceholder === 'function') hideChartPlaceholder();
  if (typeof hideRankSkeleton === 'function') hideRankSkeleton();
  if (STATE.oemMode === 'daily' && window.OEMOverhaul) {
    OEMOverhaul.renderQuestionDashboard();
    OEMOverhaul.bindDashboardNav();
  } else {
    renderDailySummary();
    renderGlanceCards();
    renderMasterTable();
    renderQuadrant();
  }
  renderWatchlistBar();
  renderComparePane();
  renderSplitBars();
  renderTrendHeatmap();
  mountResearchTables();
  mountReferenceTables();
  if (STATE.oemMode === 'research') renderReferenceTables();
  urlEncodeState();
}""",
)

if 'function mountResearchTables' not in text:
    text = text.replace(
        'function mountReferenceTables(){',
        '''function mountResearchTables() {
  var splitsMount = document.getElementById('splitsTableMount');
  var rankSection = document.querySelector('#masterTable');
  if (splitsMount && rankSection) {
    var section = rankSection.closest('.section');
    if (section && !splitsMount.contains(section)) splitsMount.appendChild(section);
  }
  var pitchMount = document.getElementById('pitchingResearchMount');
  var pitchSec = document.getElementById('pitchingSection');
  var oorMount = document.getElementById('oorResearchMount');
  var oorSec = document.getElementById('oorSection');
  if (pitchMount && pitchSec && !pitchMount.contains(pitchSec)) pitchMount.appendChild(pitchSec);
  if (oorMount && oorSec && !oorMount.contains(oorSec)) oorMount.appendChild(oorSec);
  var palsSec = document.getElementById('palsSection');
  if (palsSec) palsSec.style.display = 'none';
}

function mountReferenceTables(){''',
    )

text = text.replace(
    """function onResearchSubtabShown(name) {
  if (name === 'splits') renderSplitBars();
  else if (name === 'trends') renderTrendHeatmap();
  else if (name === 'compare') initCompare();
  else if (name === 'matchup') {
    populateMatchupSelectors();
    renderMatchupOutput();
  } else if (name === 'strat') renderStrats();
  else if (name === 'reference') {
    mountReferenceTables();
    renderReferenceTables();
  }
}""",
    """function onResearchSubtabShown(name) {
  mountResearchTables();
  if (name === 'splits') { renderSplitBars(); renderMasterTable(); }
  else if (name === 'trends') renderTrendHeatmap();
  else if (name === 'compare') initCompare();
  else if (name === 'pitching') { renderPitchingScore(); renderOOR(); }
  else if (name === 'signals' && window.OEMOverhaul) OEMOverhaul.renderConvergence();
}""",
)

text = text.replace(
    "function showResearchSubtab(name) {\n  name = name || 'strat';",
    "function showResearchSubtab(name) {\n  name = name || 'splits';",
)

if 'function parseWeatherMap' not in text:
    text = text.replace(
        'function parseMatchupRows(rows) {',
        '''function parseWeatherMap(rows) {
  var map = {};
  (rows || []).forEach(function(row) {
    var away = String(matchupCol(row, 'Away')).trim().toUpperCase();
    var home = String(matchupCol(row, 'Home')).trim().toUpperCase();
    if (!away || !home) return;
    var cond = String(matchupCol(row, 'Conditions') || matchupCol(row, 'Weather') || '').trim();
    if (cond) map[away + '@' + home] = cond;
  });
  return map;
}

function parseMatchupRows(rows) {''',
    )

if 'signals_convergence: SHEET_TABS' not in text:
    text = text.replace(
        'today_matchups: SHEET_TABS.today_matchups,',
        'today_matchups: SHEET_TABS.today_matchups,\n  signals_convergence: SHEET_TABS.signals_convergence,\n  weather: SHEET_TABS.weather,',
    )

if 'fetchSheetTab(TABS.signals_convergence)' not in text:
    text = text.replace(
        'fetchSheetTab(TABS.today_matchups),\n    fetchSheetText(TABS.last_updated)',
        'fetchSheetTab(TABS.today_matchups),\n    fetchSheetTab(TABS.signals_convergence),\n    fetchSheetTab(TABS.weather),\n    fetchSheetText(TABS.last_updated)',
    )
    text = text.replace(
        'lineupsRows = results[6], gamesRows = results[7], matchupsRows = results[8], tsText = results[9];',
        'lineupsRows = results[6], gamesRows = results[7], matchupsRows = results[8], signalsRows = results[9], weatherRows = results[10], tsText = results[11];',
    )
    text = text.replace(
        'LIVE_DATA.matchups = parseMatchupRows(matchupsRows);',
        'LIVE_DATA.matchups = parseMatchupRows(matchupsRows);\n    LIVE_DATA.signalsConvergence = signalsRows || [];\n    LIVE_DATA.weather = parseWeatherMap(weatherRows);',
    )

text = re.sub(r'</?motion>', '', text)

HTML.write_text(text, encoding="utf-8")

if NAV.exists():
    nav_text = NAV.read_text(encoding="utf-8")
    nav_text = nav_text.replace(
        """    <div class="chase-nav-links">
      <a href="chase_analytics_mlb_oem_v7.html" class="chase-nav-link">Dashboard</a>
      <a href="matchup_sheet.html" class="chase-nav-link">Matchups</a>
      <div class="chase-dropdown">""",
        nav_new,
        1,
    )
    nav_text = nav_text.replace(mob_old, mob_new, 1)
    nav_text = nav_text.replace('Players\n          <svg', 'Profiles\n          <svg', 1)
    NAV.write_text(nav_text, encoding="utf-8")

print("Structural overhaul applied")
