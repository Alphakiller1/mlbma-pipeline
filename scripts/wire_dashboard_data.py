"""Wire dashboard: scripts, LIVE_DATA, window scores, signals pane."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CHASE = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = CHASE.read_text(encoding="utf-8")

# Script tags before chase_nav
nav_marker = '  <script src="chase_nav.js"></script>'
scripts = """  <script src="oem_overhaul.js"></script>
  <script src="mlbma_standings.js"></script>
  <script src="mlbma_signals.js"></script>
"""
if "oem_overhaul.js" not in text:
    text = text.replace(nav_marker, scripts + nav_marker, 1)

# CSS for record pill and window banner
css_insert = """
.team-record-pill, .hmc-record {
  font-size: 10px; font-weight: 600; font-family: var(--mono);
  color: var(--text-3); margin-left: 6px;
}
.window-data-banner {
  display: none; margin: 0 0 14px; padding: 10px 14px;
  background: var(--gold-dim); border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 10px; font-size: 12px; color: var(--gold-l); line-height: 1.45;
}
.window-data-banner.show { display: block; }
"""
if ".window-data-banner" not in text:
    text = text.replace("</style>", css_insert + "\n</style>", 1)

# LIVE_DATA init
text = text.replace(
    "bullpenUnits: {}, rhp: null, lhp: null };",
    "bullpenUnits: {}, teamProfilesByTeam: {}, signalsToday: [], signalsConvergence: [],\n"
    "  windowDataAvailable: { L30: false, L14: false, L7: false }, rhp: null, lhp: null };",
    1,
)

# Window banner in research controls
if 'id="windowDataBanner"' not in text:
    text = text.replace(
        '<div class="glance-grid" id="glanceGrid"></div>',
        '<div id="windowDataBanner" class="window-data-banner"></div>\n<div class="glance-grid" id="glanceGrid"></div>',
        1,
    )

# Rankings window banner
if 'id="dashWindowDataBanner"' not in text:
    text = text.replace(
        '<div id="dashboardRankingsMount"></div>',
        '<div id="dashWindowDataBanner" class="window-data-banner"></div>\n  <div id="dashboardRankingsMount"></div>',
        1,
    )

# Signals pane structure
old_signals = """    <div id="convergenceGrid"></div>
  </div>
  <div id="pane-strat" """
new_signals = """    <div id="signalsTodayPanel"></div>
    <div id="convergenceGrid" style="margin-top:20px;"></div>
    <div id="stratsSignals" style="margin-top:24px;"></div>
  </div>
  <div id="pane-strat" """
if "signalsTodayPanel" not in text:
    text = text.replace(old_signals, new_signals, 1)

# loadLiveData fetch list
old_fetch = """    fetchSheetTab(TABS.signals_convergence),
    fetchSheetTab(TABS.weather),
    fetchSheetTab(TABS.player_registry),
    fetchSheetText(TABS.last_updated)
  ]).then(function(results) {
    var vsRhpRows = results[0], vsLhpRows = results[1], oorRows = results[2],
        pitchingRows = results[3], palsRows = results[4], bullpenRows = results[5],
        lineupsRows = results[6], gamesRows = results[7], matchupsRows = results[8], signalsRows = results[9], weatherRows = results[10], registryRows = results[11], tsText = results[12];"""

new_fetch = """    fetchSheetTab(TABS.signals_convergence),
    fetchSheetTab(TABS.signals_today).catch(function() { return []; }),
    fetchSheetTab(TABS.team_profiles).catch(function() { return []; }),
    fetchSheetTab(TABS.weather),
    fetchSheetTab(TABS.player_registry),
    fetchSheetText(TABS.last_updated)
  ]).then(function(results) {
    var vsRhpRows = results[0], vsLhpRows = results[1], oorRows = results[2],
        pitchingRows = results[3], palsRows = results[4], bullpenRows = results[5],
        lineupsRows = results[6], gamesRows = results[7], matchupsRows = results[8],
        signalsConvRows = results[9], signalsTodayRows = results[10], teamProfRows = results[11],
        weatherRows = results[12], registryRows = results[13], tsText = results[14];"""

if "signalsTodayRows" not in text:
    text = text.replace(old_fetch, new_fetch, 1)

# LIVE_DATA assignments in loadLiveData then block
text = text.replace(
    "LIVE_DATA.signalsConvergence = signalsRows || [];",
    "LIVE_DATA.signalsConvergence = signalsConvRows || [];\n"
    "    LIVE_DATA.signalsToday = signalsTodayRows || [];\n"
    "    LIVE_DATA.teamProfilesByTeam = parseTeamProfileRows(teamProfRows);",
    1,
)

# applyLiveData: sync windows + convergence render
text = text.replace(
    "    ensureHardcodedTimeframes();\n    enrichYtdMaster();",
    "    syncWindowScoresFromProfiles();\n    enrichYtdMaster();",
    1,
)

# onResearchSubtabShown signals branch
text = text.replace(
    """  else if (name === 'signals') {
    if (window.OEMOverhaul) OEMOverhaul.renderConvergence();
    renderStrats();
  }""",
    """  else if (name === 'signals') {
    if (window.MLBMASignals) MLBMASignals.renderExplorer();
    else {
      if (window.OEMOverhaul) OEMOverhaul.renderConvergence();
      renderStrats();
    }
  }""",
    1,
)

# renderStrats targets
text = text.replace(
    "var targets = [document.getElementById('stratsDaily'), document.getElementById('strats')].filter(Boolean);",
    "var targets = [document.getElementById('stratsDaily'), document.getElementById('strats'), document.getElementById('stratsSignals')].filter(Boolean);",
    1,
)

# renderDailyRead / applyLiveData - standings + signals after load
if "MLBMAStandings.load" not in text:
    text = text.replace(
        "    renderAll();\n    renderReferenceTables();\n    hideLoadingOverlay();",
        "    var afterLoad = function() {\n"
        "      renderAll();\n"
        "      renderReferenceTables();\n"
        "      if (window.OEMOverhaul && OEMOverhaul.renderConvergence) OEMOverhaul.renderConvergence();\n"
        "      hideLoadingOverlay();\n"
        "    };\n"
        "    if (window.MLBMAStandings) MLBMAStandings.load().then(afterLoad).catch(afterLoad);\n"
        "    else afterLoad();",
        1,
    )

# Insert new functions before parseBullpenUnitRows if not present
helper_block = r'''
function parseTeamProfileRows(rows) {
  var map = {};
  (rows || []).forEach(function(row) {
    var t = teamKey(pickCol(row, ['team', 'Tm', 'Team']));
    if (!t) return;
    map[t] = {
      osi_ytd: numOrNull(pickCol(row, ['osi', 'OSI'])),
      osi_l30: numOrNull(pickCol(row, ['osi_l30', 'OSI_L30'])),
      osi_l14: numOrNull(pickCol(row, ['osi_l14', 'OSI_L14'])),
      osi_l7: numOrNull(pickCol(row, ['osi_l7', 'OSI_L7']))
    };
  });
  return map;
}

function windowOsiField(timeframe) {
  if (timeframe === 'L30') return 'osi_l30';
  if (timeframe === 'L14') return 'osi_l14';
  if (timeframe === 'L7') return 'osi_l7';
  return null;
}

function buildWindowRowsFromProfiles(timeframe, splitTab) {
  var field = windowOsiField(timeframe);
  if (!field) return [];
  var profs = LIVE_DATA.teamProfilesByTeam || {};
  var base = splitTab === 'r' ? SCO_YTD_R : (splitTab === 'l' ? SCO_YTD_L : SCO_YTD_B);
  if (!base || !base.length) return [];
  return base.map(function(d) {
    var p = profs[d.t];
    if (!p || p[field] == null || isNaN(p[field])) return null;
    var row = Object.assign({}, d);
    row.osi = p[field];
    row.windowPartial = true;
    row.windowNote = 'OSI from Team_Profiles; ABQ/RCV/OBR remain YTD until window metric sheets ship.';
    return row;
  }).filter(Boolean);
}

function syncWindowScoresFromProfiles() {
  var avail = { L30: false, L14: false, L7: false };
  ['L30', 'L14', 'L7'].forEach(function(tf) {
    var rows = buildWindowRowsFromProfiles(tf, 'b');
    if (rows.length >= 20) {
      avail[tf] = true;
      if (tf === 'L30') SCO_L30_B = rows;
      else if (tf === 'L14') SCO_L14_B = rows;
      else SCO_L7_B = rows;
    } else {
      if (tf === 'L30') SCO_L30_B = [];
      else if (tf === 'L14') SCO_L14_B = [];
      else SCO_L7_B = [];
    }
  });
  LIVE_DATA.windowDataAvailable = avail;
  M_L30 = toMap(SCO_L30_B);
  M_L14 = toMap(SCO_L14_B);
  M_L7 = toMap(SCO_L7_B);
}

function windowDataMessage(timeframe) {
  if (timeframe === 'YTD') return '';
  var avail = LIVE_DATA.windowDataAvailable || {};
  if (avail[timeframe]) {
    return 'Window OSI from Team_Profiles · other metrics shown as YTD baseline.';
  }
  return 'YTD data shown — window data requires full pipeline run (Team_Profiles osi_l30/l14/l7).';
}

function updateWindowDataBanners() {
  var msg = windowDataMessage(STATE.time);
  ['windowDataBanner', 'dashWindowDataBanner'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  });
}

'''

if "function parseTeamProfileRows" not in text:
    text = text.replace("function parseBullpenUnitRows(rows) {", helper_block + "\nfunction parseBullpenUnitRows(rows) {", 1)

# Replace ensureHardcodedTimeframes body usage - keep function but make no-op or redirect
text = text.replace(
    "function ensureHardcodedTimeframes() {\n  SCO_L30_B = buildScores('L30', 'b');\n  SCO_L14_B = buildScores('L14', 'b');\n  SCO_L7_B = buildScores('L7', 'b');\n  M_L30 = toMap(SCO_L30_B);\n  M_L14 = toMap(SCO_L14_B);\n  M_L7 = toMap(SCO_L7_B);\n}",
    "function ensureHardcodedTimeframes() {\n  /* legacy — use syncWindowScoresFromProfiles() after live load */\n  syncWindowScoresFromProfiles();\n}",
    1,
)

# currentRows rewrite
old_current = """function currentRows(){
  var rows;
  /* Live sheet scores only for YTD — L30/L14/L7 keep hardcoded timeframe data */
  if (LIVE_DATA.loaded && STATE.time === 'YTD') {
    if (STATE.split === 'b') rows = SCO_YTD_B;
    else if (STATE.split === 'r') rows = SCO_YTD_R;
    else rows = SCO_YTD_L;
  } else if(STATE.time==='YTD'){
    if(STATE.split==='b') rows = SCO_YTD_B;
    else if(STATE.split==='r') rows = SCO_YTD_R;
    else rows = SCO_YTD_L;
  } else if(STATE.time==='L7') rows = SCO_L7_B;
  else if(STATE.time==='L30'){
    rows = (STATE.split==='b') ? SCO_L30_B : buildScores('L30', STATE.split);
  } else if(STATE.time==='L14'){
    rows = (STATE.split==='b') ? SCO_L14_B : buildScores('L14', STATE.split);
  } else {
    rows = SCO_YTD_B;
  }
  return rows && rows.length ? rows : [];
}"""

new_current = """function currentRows(){
  var rows;
  if (STATE.time === 'YTD') {
    if (STATE.split === 'b') rows = SCO_YTD_B;
    else if (STATE.split === 'r') rows = SCO_YTD_R;
    else rows = SCO_YTD_L;
  } else if (STATE.time === 'L30' || STATE.time === 'L14' || STATE.time === 'L7') {
    var avail = LIVE_DATA.windowDataAvailable || {};
    if (!avail[STATE.time]) {
      updateWindowDataBanners();
      return [];
    }
    if (STATE.split === 'b') {
      rows = STATE.time === 'L30' ? SCO_L30_B : (STATE.time === 'L14' ? SCO_L14_B : SCO_L7_B);
    } else {
      rows = buildWindowRowsFromProfiles(STATE.time, STATE.split);
    }
  } else {
    rows = SCO_YTD_B;
  }
  updateWindowDataBanners();
  return rows && rows.length ? rows : [];
}"""

if "windowDataAvailable" in text and "buildWindowRowsFromProfiles" in text:
    if old_current.split("function currentRows")[1].split("function applyFilter")[0] in text:
        # partial match - use regex
        pass
text = re.sub(
    r"function currentRows\(\)\{[\s\S]*?return rows && rows\.length \? rows : \[\];\n\}",
    new_current,
    text,
    count=1,
)

# renderMasterTable - empty window message
if "window-empty-msg" not in text:
    text = text.replace(
        "function renderMasterTable(){",
        "function renderMasterTable(){\n  if (STATE.time !== 'YTD' && !(LIVE_DATA.windowDataAvailable && LIVE_DATA.windowDataAvailable[STATE.time])) {\n"
        "    var body = document.getElementById('masterBody');\n"
        "    if (body) body.innerHTML = '<tr><td colspan=\"20\" style=\"text-align:center;padding:24px;color:var(--text-2);\">' + esc(windowDataMessage(STATE.time)) + '</td></tr>';\n"
        "    return;\n  }\n",
        1,
    )

# Platform dashboard renderDashboard - load standings
if "MLBMAStandings.load" not in text or "PlatformDashboard.renderDashboard" in text:
    pass

# DOMContentLoaded - standings on page init
if "MLBMAStandings.load()" not in text.split("DOMContentLoaded")[-1][:800]:
    text = text.replace(
        "document.addEventListener('DOMContentLoaded', function(){",
        "document.addEventListener('DOMContentLoaded', function(){\n  if (window.MLBMAStandings) MLBMAStandings.load();",
        1,
    )

CHASE.write_text(text, encoding="utf-8")
print("chase_analytics patched:", CHASE)
