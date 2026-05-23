"""Phase 1 — main dashboard three-section cleanup."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = HTML.read_text(encoding="utf-8")

# Remove legacy daily pane wrapper and hidden question sections
text = re.sub(
    r'\n<div class="oem-mode-pane active" id="pane-oem-daily"[^>]*>\s*<div class="layer-main" id="layerMain">.*?</motion></div><!-- /pane-oem-daily -->',
    "",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r'\n<div class="oem-mode-pane active" id="pane-oem-daily"[^>]*>\s*<motion></motion><div class="layer-main" id="layerMain">.*?</div><!-- /pane-oem-daily -->',
    "",
    text,
    count=1,
    flags=re.S,
)
# Fallback: delete block between pane-oem-daily open and pane-oem-research comment
if 'id="pane-oem-daily"' in text:
    text = re.sub(
        r'<div class="oem-mode-pane active" id="pane-oem-daily"[^>]*>.*?(?=<!-- LAYER 2 — Advanced Tools -->)',
        "",
        text,
        count=1,
        flags=re.S,
    )

# Rename signal section
text = text.replace('id="section-signal-summary"', 'id="section-signal-board"')
text = text.replace(
    '<div class="platform-eyebrow">Model Reads</motion></div>\n      <h2 class="platform-title" style="font-size:16px;margin:0;">Today\'s Model Reads</h2>',
    '<div class="platform-eyebrow">Predictive Signals</div>\n      <h2 class="platform-title" style="font-size:16px;margin:0;">Daily Predictive Signal Board</h2>',
)
text = text.replace(
    '<div class="platform-eyebrow">Model Reads</motion></div>',
    '<div class="platform-eyebrow">Predictive Signals</div>',
)
text = text.replace(
    "<h2 class=\"platform-title\" style=\"font-size:16px;margin:0;\">Today's Model Reads</h2>",
    '<h2 class="platform-title" style="font-size:16px;margin:0;">Daily Predictive Signal Board</h2>',
)
text = text.replace("</motion>", "")

# Remove oem_overhaul.js script
text = re.sub(r'\n<script src="oem_overhaul\.js"></script>', "", text)

# Update platform CSS — hide legacy, show only platform sections + research
old_css = """.oem-mode-tabs, #pane-oem-methodology, .dash-section-nav,
#dailySummarySection, #section-market-map, #section-market-edge,
#section-game-script, #section-validate, .question-section { display: none !important; }
#pane-oem-daily, #pane-oem-research { display: block !important; }
#pane-oem-daily.active, #pane-oem-research.active { display: block !important; }"""

new_css = """.oem-mode-tabs, #pane-oem-methodology, #pane-oem-daily,
.dash-section-nav, #dailySummarySection, #section-market-map,
#section-market-edge, #section-game-script, #section-validate,
.question-section { display: none !important; }
#pane-oem-research, #section-research-lab { display: block !important; }
body.platform-dashboard .show-advanced-metrics .status-only-cols { display: none !important; }
body.platform-dashboard .show-advanced-metrics .advanced-cols { display: table-cell !important; }
.rank-logo { vertical-align: middle; margin-right: 6px; border-radius: 2px; }
.mc-sp-photo img, .mc-sp-photo .pitcher-headshot-fallback { width: 36px; height: 36px; flex-shrink: 0; }
.hero-lineup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
.hero-lineup-grid .lineup-row.platoon-adv { background: rgba(74,222,128,.08); border-radius: 4px; }
.hero-lineup-grid .lineup-row.platoon-disadv { opacity: 0.55; }"""

if old_css in text:
    text = text.replace(old_css, new_css)

# Add body class in init
if "document.body.classList.add('platform-dashboard')" not in text:
    text = text.replace(
        "function init(){",
        "function init(){\n  document.body.classList.add('platform-dashboard');",
    )

# Simplify renderAll
old_render = """  mountDashboardRankings();
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
new_render = """  mountDashboardRankings();
  if (window.PlatformDashboard) {
    PlatformDashboard.initRegistry().then(function() { PlatformDashboard.renderDashboard(); });
  } else {
    renderMasterTable();
  }"""
if old_render in text:
    text = text.replace(old_render, new_render)

# renderDailyRead
text = re.sub(
    r"function renderDailyRead\(\) \{[^}]+\}[^}]*\}",
    """function renderDailyRead() {
  mountDashboardRankings();
  if (window.PlatformDashboard) {
    PlatformDashboard.initRegistry().then(function() { PlatformDashboard.renderDashboard(); });
  } else {
    renderMasterTable();
  }
  bindFilterHelp();
}""",
    text,
    count=1,
    flags=re.S,
)

# runPostLoadUI - remove renderStrats, renderReferenceTables for daily
text = text.replace(
    "    renderTrendHeatmap();\n    renderReferenceTables();",
    "    renderTrendHeatmap();",
)
text = text.replace(
    "    renderStrats();\n    renderReferenceTables();",
    "",
)

# mountResearchTables - do not steal table from dashboard
text = text.replace(
    """function mountResearchTables() {
  var splitsMount = document.getElementById('splitsTableMount');
  var rankSection = document.querySelector('#masterTable');
  if (splitsMount && rankSection) {
    var section = rankSection.closest('.section');
    if (section && !splitsMount.contains(section)) splitsMount.appendChild(section);
  }""",
    """function mountResearchTables() {
  var dashMount = document.getElementById('dashboardRankingsMount');
  var rankSection = document.querySelector('#masterTable');
  if (dashMount && rankSection && dashMount.contains(rankSection.closest('.section'))) {
    /* keep rankings on main dashboard */
  } else {
  var splitsMount = document.getElementById('splitsTableMount');
  if (splitsMount && rankSection) {
    var section = rankSection.closest('.section');
    if (section && !splitsMount.contains(section)) splitsMount.appendChild(section);
  }
  }""",
)

# loadLiveData - fetch player registry
if "TABS.player_registry" not in text.split("function loadLiveData")[1].split("}).then(function(results)")[0]:
    text = text.replace(
        "    fetchSheetTab(TABS.weather),\n    fetchSheetText(TABS.last_updated)",
        "    fetchSheetTab(TABS.weather),\n    fetchSheetTab(TABS.player_registry),\n    fetchSheetText(TABS.last_updated)",
    )
    text = text.replace(
        "signalsRows = results[9], weatherRows = results[10], tsText = results[11];",
        "signalsRows = results[9], weatherRows = results[10], registryRows = results[11], tsText = results[12];",
    )
    text = text.replace(
        "LIVE_DATA.weather = parseWeatherMap(weatherRows);",
        "LIVE_DATA.weather = parseWeatherMap(weatherRows);\n    LIVE_DATA.playerRegistry = registryRows || [];\n    if (window.MLBMAAssets && MLBMAAssets.parseRegistryRows) {\n      MLBMAAssets.parseRegistryRows(parseRegistrySheet(registryRows));\n    }",
    )

# parseRegistrySheet helper before loadLiveData if missing
if "function parseRegistrySheet" not in text:
    text = text.replace(
        "function loadLiveData() {",
        """function parseRegistrySheet(rows) {
  if (!rows || !rows.length) return [];
  return rows.map(function(r) {
    return {
      player_id: r.player_id || r.playerId || r.Player_ID,
      full_name: r.full_name || r.fullName || r.Full_Name || r.name,
      team_abbr: r.team_abbr || r.team || r.Tm
    };
  }).filter(function(r) { return r.player_id && r.full_name; });
}

function loadLiveData() {""",
    )

HTML.write_text(text, encoding="utf-8")
print("Phase 1 HTML cleanup done")
