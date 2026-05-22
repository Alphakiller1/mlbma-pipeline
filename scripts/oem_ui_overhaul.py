#!/usr/bin/env python3
"""Apply OEM dashboard UI overhaul (preserve OBR naming)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OEM = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
GLOSS = ROOT / "dashboard" / "glossary.html"
INDEX = ROOT / "index.html"

CSS = """
/* OEM mode tabs, daily summary, freshness, decision labels */
.freshness-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; margin-bottom: 14px;
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
  font-size: 12px; color: var(--text-2);
}
.freshness-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--green);
  box-shadow: 0 0 8px var(--green);
}
.freshness-dot.stale { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
.freshness-meta { margin-left: auto; font-size: 11px; color: var(--text-3); }
.oem-mode-tabs {
  display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px;
  padding: 4px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px;
}
.oem-mode-tab {
  flex: 1; min-width: 120px; padding: 10px 16px; border: none; border-radius: 8px;
  background: transparent; color: var(--text-2); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: var(--font); transition: all 0.15s ease;
}
.oem-mode-tab:hover { color: var(--text); background: var(--bg-3); }
.oem-mode-tab.active {
  background: var(--purple-3); color: #fff;
  box-shadow: 0 0 12px var(--purple-glow);
}
.oem-mode-pane { display: none; }
.oem-mode-pane.active { display: block; }
.daily-summary-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;
}
.daily-summary-card {
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; border-left: 3px solid var(--purple);
}
.daily-summary-card .ds-eyebrow {
  font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--purple); margin-bottom: 6px;
}
.daily-summary-card .ds-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.daily-summary-card .ds-body { font-size: 12px; color: var(--text-2); line-height: 1.5; }
.metric-decision {
  display: inline-block; margin-left: 6px; font-size: 9px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-3);
  vertical-align: middle;
}
.metric-decision.buy { color: var(--blue); }
.metric-decision.fade { color: var(--red-l); }
.metric-decision.elite { color: var(--green); }
.metric-decision.vol { color: var(--orange); }
.rank-expand-hint { font-size: 9px; color: var(--text-3); margin-left: 4px; }
tr.rank-row-expanded { background: rgba(192, 132, 252, 0.06); }
.strat-confidence {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  padding: 2px 6px; border-radius: 4px; margin-left: 8px;
}
.strat-confidence.conf-high { background: var(--green-dim); color: var(--green); }
.strat-confidence.conf-med { background: var(--gold-dim); color: var(--gold); }
.strat-confidence.conf-low { background: var(--bg-4); color: var(--text-3); }
.methodology-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;
}
.methodology-card {
  background: var(--bg-2); border: 1px solid var(--border); border-radius: 12px; padding: 18px;
}
.methodology-card h3 { font-size: 15px; margin-bottom: 8px; color: var(--purple-2); }
.methodology-card p { font-size: 12px; color: var(--text-2); line-height: 1.55; margin-bottom: 10px; }
.methodology-card a { color: var(--purple); font-weight: 600; font-size: 13px; }
"""

HEADER_INSERT = """  <div class="data-error-banner" id="dataErrorBanner"></div>
</div>

<div class="freshness-bar" id="freshnessBar">
  <span class="freshness-dot fresh" id="freshnessDot"></span>
  <span class="freshness-text">Data: <strong id="freshnessLabel">Loading…</strong></span>
  <span class="freshness-meta" id="freshnessMeta">Sheets pipeline · syncs with nav timestamp</span>
</div>
<nav class="oem-mode-tabs" role="tablist" aria-label="Dashboard mode">
  <button type="button" class="oem-mode-tab active" data-oem-mode="daily" role="tab" aria-selected="true">Daily Read</button>
  <button type="button" class="oem-mode-tab" data-oem-mode="research" role="tab">Research Lab</button>
  <button type="button" class="oem-mode-tab" data-oem-mode="methodology" role="tab">Methodology</button>
</nav>

<div class="oem-mode-pane active" id="pane-oem-daily" data-oem-pane="daily">
<section class="daily-summary section" id="dailySummarySection">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Daily Read</div>
      <div class="section-title">Daily Summary</div>
      <div class="section-subtitle">Top actionable reads for today&apos;s slate — edges, movers, and matchup context.</div>
    </div>
  </div>
  <div class="daily-summary-grid" id="dailySummaryGrid"></div>
</section>
<div id="dailyMatchupsMount"></div>

<!-- Control bar -->"""

METHODOLOGY_PANE = """
<div class="oem-mode-pane" id="pane-oem-methodology" data-oem-pane="methodology">
  <div class="section">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Methodology</div>
        <div class="section-title">Model framework &amp; definitions</div>
        <div class="section-subtitle">Full glossary, formulas, signals, and tier bands live on the standalone glossary page.</div>
      </div>
    </div>
    <div class="methodology-grid">
      <div class="methodology-card">
        <h3>Metric Glossary</h3>
        <p>ABQ, RCV, OBR, OSI, projOSI, PP-Gap, Power-Floor Gap, PALS, signals, and betting archetypes — searchable reference.</p>
        <a href="glossary.html">Open full glossary →</a>
      </div>
      <div class="methodology-card">
        <h3>Core composites</h3>
        <p><strong>OBR</strong> = 65% xwOBA + 35% BB% (on-base floor). <strong>OSI</strong> = 43% RCV + 37% ABQ + 20% OBR. <strong>projOSI</strong> = OSI + capped regression adjustment.</p>
      </div>
      <div class="methodology-card">
        <h3>Gap metrics</h3>
        <p><strong>PP-Gap</strong> = ABQ − RCV (process vs production). <strong>Power-Floor Gap</strong> = RCV − OBR (damage vs on-base floor).</p>
      </div>
      <div class="methodology-card">
        <h3>Market status map</h3>
        <p>OSI × PP-Gap quadrants label betting posture: back team totals, buy low, fade momentum, or fade / under lean.</p>
      </div>
    </div>
  </div>
</div>
"""

JS_BLOCK = """
/* ============================================================
   OEM MODE TABS · DAILY SUMMARY · FRESHNESS · DECISION LABELS
   ============================================================ */
STATE.oemMode = STATE.oemMode || 'daily';

function parseFreshnessDate(raw) {
  if (!raw) return null;
  var d = new Date(String(raw).trim());
  if (!isNaN(d.getTime())) return d;
  return null;
}

function syncFreshnessIndicator(ts) {
  var label = document.getElementById('freshnessLabel');
  var dot = document.getElementById('freshnessDot');
  var meta = document.getElementById('freshnessMeta');
  var hu = document.getElementById('headerUpdated');
  var text = ts || '—';
  if (hu) hu.textContent = text;
  if (label) label.textContent = text;
  var d = parseFreshnessDate(ts);
  var stale = false;
  if (d) {
    stale = (Date.now() - d.getTime()) / (1000 * 60 * 60) > 24;
    text = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (label) label.textContent = text;
  }
  if (dot) {
    dot.classList.toggle('stale', stale);
    dot.classList.toggle('fresh', !stale);
  }
  if (meta) {
    meta.textContent = stale ? 'Data may be stale (>24h) — re-run pipeline' : 'Fresh pipeline sync';
  }
  if (window.ChaseNav) {
    ChaseNav.setLastUpdated(text);
    ChaseNav.setPipelineStatus(stale ? 'stale' : 'fresh');
  }
}

function setOemMode(mode) {
  STATE.oemMode = mode;
  document.querySelectorAll('.oem-mode-tab').forEach(function(btn) {
    var on = btn.getAttribute('data-oem-mode') === mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.oem-mode-pane').forEach(function(pane) {
    pane.classList.toggle('active', pane.getAttribute('data-oem-pane') === mode);
  });
  urlEncodeState();
  if (mode === 'daily') renderDailySummary();
}

function metricDecision(key, d) {
  if (!d) return '';
  var v = d[key];
  if (v === null || v === undefined || isNaN(v)) return '';
  if (key === 'osi') {
    if (v >= 75) return '<span class="metric-decision elite">Elite</span>';
    if (v < 50) return '<span class="metric-decision fade">Weak</span>';
    return '';
  }
  if (key === 'projOSI') {
    var delta = (d.projOSI != null && d.osi != null) ? d.projOSI - d.osi : 0;
    if (delta > 1.5) return '<span class="metric-decision buy">Up</span>';
    if (delta < -1.5) return '<span class="metric-decision fade">Down</span>';
    return '';
  }
  if (key === 'ppGap') {
    if (v > 4) return '<span class="metric-decision buy">Buy</span>';
    if (v < -4) return '<span class="metric-decision fade">Fade</span>';
    return '';
  }
  if (key === 'dfGap') {
    if (v > 8) return '<span class="metric-decision vol">Power</span>';
    if (v < -4) return '<span class="metric-decision buy">Floor</span>';
    return '';
  }
  if (key === 'obr') {
    if (v >= 60) return '<span class="metric-decision buy">Traffic</span>';
    if (v < 45) return '<span class="metric-decision fade">Thin</span>';
    return '';
  }
  if (key === 'abq' || key === 'rcv') {
    if (v >= 65) return '<span class="metric-decision elite">Strong</span>';
    if (v < 45) return '<span class="metric-decision fade">Weak</span>';
    return '';
  }
  return '';
}

function renderDailySummary() {
  var el = document.getElementById('dailySummaryGrid');
  if (!el) return;
  var rows = (SCO_YTD_B && SCO_YTD_B.length) ? SCO_YTD_B.slice() : [];
  if (!rows.length) {
    el.innerHTML = '<div class="daily-summary-card"><div class="ds-body">Loading summary…</div></div>';
    return;
  }
  function top(sortFn, filterFn) {
    var pool = rows.filter(filterFn || function() { return true; }).sort(sortFn);
    return pool[0];
  }
  var buyLow = top(function(a, b) { return b.ppGap - a.ppGap; }, function(d) { return d.ppGap > 4; });
  var fade = top(function(a, b) { return a.ppGap - b.ppGap; }, function(d) { return d.ppGap < -4 || d.trend === 'Cooling'; });
  var power = top(function(a, b) { return b.dfGap - a.dfGap; }, function(d) { return d.dfGap > 8; });
  var elite = top(function(a, b) { return b.osi - a.osi; }, function(d) { return d.osi >= 75; });
  var nMatch = (LIVE_DATA.matchups && LIVE_DATA.matchups.length) ? LIVE_DATA.matchups.length : 0;
  var cards = [
    { e: 'Top edge', t: buyLow ? buyLow.t + ' · Buy-low process' : '—', b: buyLow ? 'PP-Gap +' + buyLow.ppGap.toFixed(1) + ' — process ahead of box-score output.' : 'No buy-low standouts.' },
    { e: 'Fade watch', t: fade ? fade.t + ' · ' + (fade.trend || 'Cooling') : '—', b: fade ? 'Production ahead of process or negative momentum.' : 'No major fade flags.' },
    { e: 'Power skew', t: power ? power.t + ' · Power-Floor +' + power.dfGap.toFixed(1) : '—', b: 'Boom/bust run paths — team totals volatility.' },
    { e: 'Elite anchor', t: elite ? elite.t + ' · OSI ' + elite.osi.toFixed(1) : '—', b: 'Stable offensive floor for ML / team-total backs.' },
    { e: 'Slate', t: nMatch + ' games', b: nMatch ? 'Matchup cards below use lineup OSI vs SP hand.' : 'Matchups load after sheet sync.' }
  ];
  el.innerHTML = cards.map(function(c) {
    return '<div class="daily-summary-card"><div class="ds-eyebrow">' + c.e + '</div><div class="ds-title">' + c.t + '</div><div class="ds-body">' + c.b + '</div></div>';
  }).join('');
}

function stratConfidence(n) {
  if (n >= 6) return { label: 'High', cls: 'conf-high' };
  if (n >= 3) return { label: 'Med', cls: 'conf-med' };
  return { label: 'Low', cls: 'conf-low' };
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.oem-mode-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setOemMode(btn.getAttribute('data-oem-mode'));
    });
  });
});
"""


def patch_oem(text: str) -> str:
    if "oem-mode-tabs" not in text:
        text = text.replace("/* Quadrant chart */", CSS + "\n/* Quadrant chart */", 1)

    old_header = """  <div class="data-error-banner" id="dataErrorBanner"></div>
</div>

<!-- Control bar -->"""
    if old_header in text and "pane-oem-daily" not in text:
        text = text.replace(old_header, HEADER_INSERT, 1)

    if "pane-oem-research" not in text:
        text = text.replace(
            '<div class="layer-label">Advanced Tools</div>',
            '<div class="oem-mode-pane" id="pane-oem-research" data-oem-pane="research">\n<div class="layer-label">Research Lab</div>',
            1,
        )
        text = text.replace(
            "</div><!-- /layer-advanced -->",
            "</div><!-- /layer-advanced -->\n</div><!-- /pane-oem-research -->",
            1,
        )
        text = text.replace(
            "</div><!-- /layer-main -->",
            "</div><!-- /layer-main -->\n</div><!-- /pane-oem-daily -->",
            1,
        )
        text = text.replace(
            "</div><!-- /pane-oem-research -->",
            "</div><!-- /pane-oem-research -->\n" + METHODOLOGY_PANE,
            1,
        )

    # Display label replacements (never rename OBR metric/key)
    pairs = [
        (">DF-Gap <span", ">Power-Floor Gap <span"),
        (">Proj <span", ">ProjOSI <span"),
        ("Offensive Status Map", "Offensive Market Status Map"),
        ("Elite &amp; Still Undervalued", "Back Team Totals"),
        ("Buy-Low Offense", "Buy Low Offense"),
        ("Strong But Cooling", "Fade Momentum"),
        ("Weak &amp; Concerning", "Fade / Under Lean"),
        ("ELITE &amp; STILL UNDERVALUED", "BACK TEAM TOTALS"),
        ("BUY-LOW OFFENSE", "BUY LOW OFFENSE"),
        ("STRONG BUT COOLING", "FADE MOMENTUM"),
        ("WEAK &amp; CONCERNING", "FADE / UNDER LEAN"),
        ("Damage-Floor Gap", "Power-Floor Gap"),
        ("DF-Gap (RCV", "Power-Floor Gap (RCV"),
        ("['dfGap','DF-Gap']", "['dfGap','Power-Floor Gap']"),
        ("dfGap:'Damage-Floor Gap", "dfGap:'Power-Floor Gap"),
        ('<div class="lab">Proj</div>', '<div class="lab">ProjOSI</div>'),
        ("OOR · Pitching Score · PALS · Today&apos;s Matchups", "OOR · Pitching Score · PALS"),
        ("high Damage-Floor Gap", "high Power-Floor Gap"),
        ("DF-Gap helps", "Power-Floor Gap helps"),
        ("Chart</span>\n    <div class=\"toggle-group\" id=\"quadrantToggle\">\n      <button class=\"toggle-btn active\" data-quad=\"status\">Status Map</button>",
         "Chart</span>\n    <div class=\"toggle-group\" id=\"quadrantToggle\">\n      <button class=\"toggle-btn active\" data-quad=\"status\">Market Map</button>"),
        ("Quadrant view — hover", "Market quadrant — hover"),
        ("#chartTitle\">OSI vs process-production gap", "#chartTitle\">OSI vs PP-Gap · market posture"),
    ]
    for old, new in pairs:
        text = text.replace(old, new)

    if "function renderDailySummary()" not in text:
        anchor = "function updateBrandPill() {"
        text = text.replace(anchor, JS_BLOCK + "\n" + anchor, 1)

    # updateBrandPill uses syncFreshnessIndicator
    if "syncFreshnessIndicator(LIVE_DATA.lastUpdated)" not in text:
        text = text.replace(
            "function updateBrandPill() {\n  var pill = document.getElementById('brandPill');\n  if (!pill) return;\n  if (LIVE_DATA.loaded && LIVE_DATA.lastUpdated) {\n    pill.textContent = 'Live';\n    var hu = document.getElementById('headerUpdated');\n    if (hu) hu.textContent = LIVE_DATA.lastUpdated;\n    pill.style.background = 'var(--green-dim)';\n    pill.style.color = 'var(--green)';\n    pill.style.borderColor = 'rgba(74, 222, 128, 0.35)';",
            "function updateBrandPill() {\n  var pill = document.getElementById('brandPill');\n  if (!pill) return;\n  if (LIVE_DATA.loaded && LIVE_DATA.lastUpdated) {\n    syncFreshnessIndicator(LIVE_DATA.lastUpdated);\n    pill.textContent = document.getElementById('freshnessDot') && document.getElementById('freshnessDot').classList.contains('stale') ? 'Stale' : 'Live';\n    pill.style.background = 'var(--green-dim)';\n    pill.style.color = 'var(--green)';\n    pill.style.borderColor = 'rgba(74, 222, 128, 0.35)';",
            1,
        )
        text = text.replace(
            "        if (LIVE_DATA.lastUpdated) {\n          var el = document.getElementById('brandPill');\n          if (el) el.textContent = 'Live';\n          var hu = document.getElementById('headerUpdated');\n          if (hu) hu.textContent = LIVE_DATA.lastUpdated;\n        }",
            "        if (LIVE_DATA.lastUpdated) {\n          syncFreshnessIndicator(LIVE_DATA.lastUpdated);\n          var el = document.getElementById('brandPill');\n          if (el) el.textContent = 'Live';\n        }",
            1,
        )

    if "renderDailySummary();" not in text.split("function renderAll")[1][:800]:
        text = text.replace(
            "function renderAll(){\n  attachPalsToScores();",
            "function renderAll(){\n  attachPalsToScores();\n  renderDailySummary();",
            1,
        )

    # mountReferenceTables - matchups to daily
    old_mount = """  if(match && match.parentNode !== mount){ mount.appendChild(match); }
  [oor,pitch,pals,match].forEach(function(el){"""
    new_mount = """  var dailyMount = document.getElementById('dailyMatchupsMount');
  if(match && dailyMount && match.parentNode !== dailyMount){ dailyMount.appendChild(match); }
  [oor,pitch,pals].forEach(function(el){"""
    if old_mount in text:
        text = text.replace(old_mount, new_mount, 1)

    # renderStrats confidence
    old_strat = """    html += '<div class="strat-card" style="border-left-color:'+b.bc+';">'+
      '<div class="strat-tag" style="color:'+b.bc+';">'+b.tag+'</div>'+
      '<div class="strat-teams">'+b.n+' teams meet criteria</div>'+
      '<div class="strat-desc">'+b.d+'</div>'+
    '</div>';"""
    new_strat = """    var conf = stratConfidence(b.n);
    html += '<div class="strat-card" style="border-left-color:'+b.bc+';">'+
      '<div class="strat-tag" style="color:'+b.bc+';">'+b.tag+
      '<span class="strat-confidence '+conf.cls+'">'+conf.label+' conf</span></div>'+
      '<div class="strat-teams">'+b.n+' teams meet criteria</div>'+
      '<div class="strat-desc">'+b.d+'</div>'+
    '</div>';"""
    if old_strat in text:
        text = text.replace(old_strat, new_strat, 1)

    # Table cells with decision labels - status mode advanced cols
    text = text.replace(
        "'<td class=\"advanced-cols num\">'+d.abq.toFixed(1)+'</td>'+\n        '<td class=\"advanced-cols num\">'+d.rcv.toFixed(1)+'</td>'+\n        '<td class=\"advanced-cols num\">'+d.obr.toFixed(1)+'</td>'+\n        '<td class=\"advanced-cols num\" style=\"color:'+tcol(d.osi)+';font-weight:600;\">'+d.osi.toFixed(1)+'</td>'+\n        '<td class=\"advanced-cols num\">'+projStr+'</td>'+\n        '<td class=\"advanced-cols num\">'+ppStr+'</td>'+\n        '<td class=\"advanced-cols num\">'+dfStr+'</td>'+",
        "'<td class=\"advanced-cols num\">'+d.abq.toFixed(1)+metricDecision('abq',d)+'</td>'+\n        '<td class=\"advanced-cols num\">'+d.rcv.toFixed(1)+metricDecision('rcv',d)+'</td>'+\n        '<td class=\"advanced-cols num\">'+d.obr.toFixed(1)+metricDecision('obr',d)+'</td>'+\n        '<td class=\"advanced-cols num\" style=\"color:'+tcol(d.osi)+';font-weight:600;\">'+d.osi.toFixed(1)+metricDecision('osi',d)+'</td>'+\n        '<td class=\"advanced-cols num\">'+projStr+metricDecision('projOSI',d)+'</td>'+\n        '<td class=\"advanced-cols num\">'+ppStr+metricDecision('ppGap',d)+'</td>'+\n        '<td class=\"advanced-cols num\">'+dfStr+metricDecision('dfGap',d)+'</td>'+",
        1,
    )
    text = text.replace(
        "'<td class=\"num\" style=\"'+activeColStyle('abq')+'\">'+d.abq.toFixed(1)+'</td>'+\n      '<td class=\"num\" style=\"'+activeColStyle('rcv')+'\">'+d.rcv.toFixed(1)+'</td>'+\n      '<td class=\"num\" style=\"'+activeColStyle('obr')+'\">'+d.obr.toFixed(1)+'</td>'+\n      '<td class=\"num\" style=\"color:'+tcol(d.osi)+';font-weight:600;'+activeColStyle('osi')+'\">'+d.osi.toFixed(1)+'</td>'+\n      '<td class=\"num\" style=\"color:'+projC+';font-weight:500;'+activeColStyle('projOSI')+'\">'+projStr+'</td>'+\n      '<td class=\"num\" style=\"color:'+ppC+';'+activeColStyle('ppGap')+'\">'+ppStr+'</td>'+\n      '<td class=\"num\" style=\"color:'+dfC+';'+activeColStyle('dfGap')+'\">'+dfStr+'</td>'+",
        "'<td class=\"num\" style=\"'+activeColStyle('abq')+'\">'+d.abq.toFixed(1)+metricDecision('abq',d)+'</td>'+\n      '<td class=\"num\" style=\"'+activeColStyle('rcv')+'\">'+d.rcv.toFixed(1)+metricDecision('rcv',d)+'</td>'+\n      '<td class=\"num\" style=\"'+activeColStyle('obr')+'\">'+d.obr.toFixed(1)+metricDecision('obr',d)+'</td>'+\n      '<td class=\"num\" style=\"color:'+tcol(d.osi)+';font-weight:600;'+activeColStyle('osi')+'\">'+d.osi.toFixed(1)+metricDecision('osi',d)+'</td>'+\n      '<td class=\"num\" style=\"color:'+projC+';font-weight:500;'+activeColStyle('projOSI')+'\">'+projStr+metricDecision('projOSI',d)+'</td>'+\n      '<td class=\"num\" style=\"color:'+ppC+';'+activeColStyle('ppGap')+'\">'+ppStr+metricDecision('ppGap',d)+'</td>'+\n      '<td class=\"num\" style=\"color:'+dfC+';'+activeColStyle('dfGap')+'\">'+dfStr+metricDecision('dfGap',d)+'</td>'+",
        1,
    )
    text = text.replace(
        "'<td class=\"rank-cell status-only-cols\">'+pinBtn+(i+1)+'</td>'+",
        "'<td class=\"rank-cell status-only-cols\">'+pinBtn+(i+1)+(STATE.expandedTeam===d.t?' ▾':' ▸')+'<span class=\"rank-expand-hint\">expand</span></td>'+",
        1,
    )
    text = text.replace(
        "html += '<tr class=\"'+highlightCls+pinnedCls+compareCls+'\" data-team=\"'+d.t+'\"",
        "html += '<tr class=\"'+highlightCls+pinnedCls+compareCls+(STATE.expandedTeam===d.t?' rank-row-expanded':'')+'\" data-team=\"'+d.t+'\"",
        1,
    )

    if "oemMode" not in text.split("urlEncodeState")[0][-2000:]:
        # add oemMode to url state if exists
        pass

    return text


def patch_glossary(text: str) -> str:
    text = text.replace("<div class=\"term\">DF-Gap</div>", '<div class="term">Power-Floor Gap</div>', 1)
    text = text.replace("<li><b>DF-Gap</b>", "<li><b>Power-Floor Gap</b>", 1)
    return text


def write_index() -> None:
    INDEX.write_text(
        """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chase Analytics · MLB</title>
  <meta http-equiv="refresh" content="0; url=dashboard/chase_analytics_mlb_oem_v7.html">
  <script>location.replace('dashboard/chase_analytics_mlb_oem_v7.html');</script>
  <style>
    body { font-family: system-ui, sans-serif; background: #0A0A0A; color: #E5E5E5;
      display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    a { color: #C084FC; }
  </style>
</head>
<body>
  <p>Redirecting to <a href="dashboard/chase_analytics_mlb_oem_v7.html">MLB Offensive Extrapolation Model</a>…</p>
</body>
</html>
""",
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    oem = patch_oem(OEM.read_text(encoding="utf-8"))
    OEM.write_text(oem, encoding="utf-8", newline="\n")
    print("OK chase_analytics_mlb_oem_v7.html")
    if GLOSS.exists():
        g = patch_glossary(GLOSS.read_text(encoding="utf-8"))
        GLOSS.write_text(g, encoding="utf-8", newline="\n")
        print("OK glossary.html")
    write_index()
    print("OK index.html")


if __name__ == "__main__":
    main()
