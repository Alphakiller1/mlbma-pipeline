"""Inject progressive disclosure helpers and base HTML patches in OEM dashboard."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = HTML.read_text(encoding="utf-8")

CSS = """
/* Progressive disclosure — read first, math deeper */
.read-block { padding: 4px 0; }
.read-headline { font-size: 14px; font-weight: 600; line-height: 1.35; margin-bottom: 4px; }
.read-interp { font-size: 12px; color: var(--text-2); line-height: 1.5; margin-bottom: 6px; }
.osi-secondary { font-size: 11px; color: var(--text-3); margin-top: 4px; }
.osi-secondary strong { color: var(--text-2); font-weight: 600; }
.summary-tag {
  display: inline-block; font-size: 9px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; padding: 2px 6px; border-radius: 4px; margin: 2px 4px 0 0;
  background: var(--bg-4); color: var(--text-2); border: 1px solid var(--border);
}
.metric-acronym { font-size: 10px; color: var(--text-3); font-weight: 500; }
.metrics-toggle {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
  background: transparent; border: 1px solid var(--border); color: var(--text-2);
  font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 6px;
  cursor: pointer; font-family: var(--font); transition: border-color 0.15s, color 0.15s;
}
.metrics-toggle:hover { border-color: var(--purple-3); color: var(--text); }
.metrics-panel {
  max-height: 0; overflow: hidden; opacity: 0;
  transition: max-height 0.35s ease, opacity 0.25s ease, margin 0.25s ease;
  margin-top: 0;
}
.metrics-panel.open {
  max-height: 480px; opacity: 1; margin-top: 10px;
  padding-top: 10px; border-top: 1px solid var(--border);
}
.metrics-panel .detail-metric-row .lab { color: var(--text-2); }
.metrics-panel .detail-metric-row .val { color: var(--text); font-weight: 500; }
.what-means { font-size: 11px; color: var(--text-2); font-style: italic; margin: 6px 0; line-height: 1.45; }
.conf-risk-row { font-size: 10px; color: var(--text-3); margin: 8px 0 4px; line-height: 1.6; }
.conf-risk-row .conf-label { font-weight: 600; color: var(--text-2); margin-right: 6px; }
.conf-pip { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin: 0 3px 0 8px; vertical-align: middle; background: var(--border-2); }
.conf-pip.on-high { background: var(--green); box-shadow: 0 0 6px var(--green-dim); }
.conf-pip.on-med { background: var(--gold); }
.conf-pip.on-low { background: var(--text-3); }
.risk-tag { display: inline-block; font-size: 9px; padding: 2px 6px; border-radius: 4px; margin: 2px 4px 0 0; background: var(--gold-dim); color: var(--gold); }
.daily-read-only-hidden { display: none !important; }
.filter-help-panel {
  display: none; margin-top: 8px; padding: 10px 12px; background: var(--bg-3);
  border: 1px solid var(--border); border-radius: 8px; font-size: 11px; color: var(--text-2);
}
.filter-help-panel.open { display: block; }
.filter-help-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text-3);
  width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 13px; font-weight: 700;
}
.filter-help-btn:hover { color: var(--text); border-color: var(--purple-3); }
.tt-summary { font-size: 13px; font-weight: 600; margin-bottom: 4px; line-height: 1.35; }
.strat-card-read { font-size: 12px; color: var(--text-2); line-height: 1.5; margin: 6px 0 8px; }
.num-neutral { color: var(--text) !important; }
.daily-summary-card .read-headline { font-size: 13px; }
"""

HELPERS = r"""
/* ============================================================
   PROGRESSIVE DISCLOSURE · SUMMARY LABELS · CONFIDENCE
   ============================================================ */

var METRIC_NAMES = {
  abq: { full: 'Process Quality', short: 'ABQ' },
  rcv: { full: 'Run Creation', short: 'RCV' },
  obr: { full: 'On-Base Floor', short: 'OBR' },
  osi: { full: 'Offensive Strength', short: 'OSI' },
  projOSI: { full: 'Projected OSI', short: 'ProjOSI' },
  ppGap: { full: 'Process-Production Gap', short: 'PP-Gap' },
  dfGap: { full: 'Power-Floor Gap', short: 'Power-Floor Gap' },
  pals: { full: 'Pitching-Adjusted Score', short: 'PALS' },
  oor: { full: 'Opponent Difficulty', short: 'OOR' }
};

function metricLabelFull(key) {
  var m = METRIC_NAMES[key] || { full: key, short: key };
  return m.full + ' <span class="metric-acronym">(' + m.short + ')</span>';
}

function getSummaryLabel(osi, ppGap, abq, rcv, obr, extras) {
  extras = extras || {};
  osi = osi != null && !isNaN(osi) ? osi : 0;
  ppGap = ppGap != null && !isNaN(ppGap) ? ppGap : 0;
  abq = abq != null ? abq : 0;
  rcv = rcv != null ? rcv : 0;
  obr = obr != null ? obr : 0;
  var tags = [];
  var label;
  if (osi >= 75 && ppGap > 0) label = 'Strong + Supported';
  else if (osi >= 75 && ppGap < 0) label = 'Cooling / Fade Risk';
  else if (osi >= 50 && osi < 75 && ppGap >= 4) label = 'Buy-Low Candidate';
  else if (osi >= 50 && osi < 75 && ppGap < 0) label = 'Monitor Closely';
  else if (osi < 50 && ppGap > 0) label = 'Speculative Upside';
  else if (osi < 50 && ppGap < 0) label = 'Avoid / Under Lean';
  else label = 'Neutral Profile';
  if (abq - rcv >= 8) tags.push('Process Edge');
  if (rcv - obr >= 12) tags.push('Volatile Power');
  var platoon = extras.exploit != null ? extras.exploit : (extras.splitEdge != null ? Math.abs(extras.splitEdge) : 0);
  if (extras.rhpOSI != null && extras.lhpOSI != null && Math.abs(extras.rhpOSI - extras.lhpOSI) >= 12) platoon = 12;
  if (platoon >= 12) tags.push('Split Dependent');
  return { label: label, tags: tags };
}

function summaryLabelColor(label) {
  if (label === 'Strong + Supported') return 'var(--green)';
  if (label === 'Buy-Low Candidate' || label === 'Speculative Upside') return 'var(--blue)';
  if (label === 'Cooling / Fade Risk' || label === 'Avoid / Under Lean') return 'var(--red-l)';
  if (label === 'Monitor Closely') return 'var(--gold)';
  return 'var(--text-2)';
}

function summaryInterpretation(d) {
  var s = getSummaryLabel(d.osi, d.ppGap, d.abq, d.rcv, d.obr, d);
  if (s.label === 'Buy-Low Candidate') return 'Process is stronger than production. Projection points upward.';
  if (s.label === 'Strong + Supported') return 'Elite output backed by process — sustainable lean.';
  if (s.label === 'Cooling / Fade Risk') return 'High output but process lagging — fade momentum without proof.';
  if (s.label === 'Monitor Closely') return 'Production may be running ahead of underlying process.';
  if (s.label === 'Speculative Upside') return 'Process ahead of box score — upside if results catch up.';
  if (s.label === 'Avoid / Under Lean') return 'Weak composite with production not supported by process.';
  return takeaway(d).split('.')[0] + '.';
}

function getWhatThisMeans(d) {
  if (d.ppGap != null && d.ppGap >= 4) return 'What this means: Process is ahead of production — potential buy-low.';
  if (d.ppGap != null && d.ppGap <= -4) return 'What this means: Production running ahead of process — monitor for cooling.';
  if (d.dfGap != null && d.dfGap >= 8) return 'What this means: Power upside but inning-to-inning volatility risk.';
  return '';
}

function teamConfidenceRisk(d) {
  var pa = d.paYTD || d.pa || 0;
  var risks = [];
  var palsGap = d.pals != null ? Math.abs(d.osi - d.pals) : 999;
  var l30 = d.l30OSI != null ? d.l30OSI : d.ytdOSI;
  var l7 = d.l7OSI;
  var ytd = d.ytdOSI != null ? d.ytdOSI : d.osi;
  var l30supports = l30 != null && ytd != null && Math.abs(l30 - ytd) < 6;
  var l7only = l7 != null && ytd != null && Math.abs(l7 - ytd) > 8 &&
    (l30 == null || Math.abs(l30 - ytd) < 4);
  if (pa > 0 && pa < 20) risks.push('Small sample');
  if (d.rhpOSI != null && d.lhpOSI != null && Math.abs(d.rhpOSI - d.lhpOSI) >= 12) risks.push('Confirm platoon split');
  if (l7only) risks.push('L7 spike only');
  if (palsGap >= 8) risks.push('PALS unconfirmed');
  var level = 'Low';
  if (pa >= 40 && palsGap < 8 && l30supports && !l7only && risks.length === 0) level = 'High';
  else if (pa >= 30 && risks.length <= 1 && !l7only) level = 'Medium';
  return { level: level, risks: risks };
}

function confidenceRiskHtml(d) {
  var cr = teamConfidenceRisk(d);
  var levels = ['High', 'Medium', 'Low'];
  var confHtml = levels.map(function(l) {
    var on = l === cr.level;
    var pipCls = on ? (l === 'High' ? 'on-high' : l === 'Medium' ? 'on-med' : 'on-low') : '';
    return '<span class="conf-pip ' + pipCls + '"></span>' + l + (l !== 'Low' ? ' ' : '');
  }).join('');
  var riskHtml = cr.risks.length
    ? cr.risks.map(function(r) { return '<span class="risk-tag">' + r + '</span>'; }).join('')
    : '<span style="color:var(--text-3);">None flagged</span>';
  return '<motion></motion><div class="conf-risk-row"><span class="conf-label">Confidence:</span>' + confHtml +
    '<br><span class="conf-label">Risk:</span> ' + riskHtml + '</div>';
}

function fmtMetricVal(v, signed) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (signed) return (v > 0 ? '+' : '') + v.toFixed(1);
  return v.toFixed(1);
}

function metricsPanelRows(d) {
  return [
    ['abq', fmtMetricVal(d.abq)],
    ['rcv', fmtMetricVal(d.rcv)],
    ['obr', fmtMetricVal(d.obr)],
    ['osi', fmtMetricVal(d.osi)],
    ['projOSI', fmtMetricVal(d.projOSI)],
    ['ppGap', fmtMetricVal(d.ppGap, true)],
    ['dfGap', fmtMetricVal(d.dfGap, true)]
  ].map(function(row) {
    return '<div class="detail-metric-row"><span class="lab">' + metricLabelFull(row[0]) + '</span><span class="val num-neutral">' + row[1] + '</span></div>';
  }).join('');
}

function renderReadBlock(d, uid, opts) {
  opts = opts || {};
  uid = uid || ('metrics_' + d.t + '_' + Math.random().toString(36).slice(2, 7));
  var sum = getSummaryLabel(d.osi, d.ppGap, d.abq, d.rcv, d.obr, d);
  var color = summaryLabelColor(sum.label);
  var tags = sum.tags.map(function(t) { return '<span class="summary-tag">' + t + '</span>'; }).join('');
  var wm = getWhatThisMeans(d);
  var html = '<div class="read-block">';
  if (opts.teamPrefix) html += '<div style="font-size:11px;color:var(--purple);font-weight:600;margin-bottom:4px;">' + opts.teamPrefix + '</div>';
  html += '<div class="read-headline" style="color:' + color + ';">' + sum.label + '</div>' + tags +
    '<div class="read-interp">' + summaryInterpretation(d) + '</div>' +
    (wm ? '<motion></motion><div class="what-means">' + wm + '</div>' : '') +
    (opts.skipConf ? '' : confidenceRiskHtml(d)) +
    '<div class="osi-secondary"><strong>Offensive Strength</strong> ' + d.osi.toFixed(1) + '</div>' +
    '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\'' + uid + '\', this)">Show metrics ▾</button>' +
    '<div class="metrics-panel" id="' + uid + '">' + metricsPanelRows(d) + '</div></div>';
  return html;
}

function blockConfidenceRisk(matching) {
  if (!matching || !matching.length) return confidenceRiskHtml({ pa: 0, osi: 0, pals: null });
  var levels = { High: 0, Medium: 0, Low: 0 };
  var riskSet = {};
  matching.forEach(function(d) {
    var cr = teamConfidenceRisk(d);
    levels[cr.level]++;
    cr.risks.forEach(function(r) { riskSet[r] = true; });
  });
  var level = levels.High >= levels.Medium && levels.High >= levels.Low ? 'High'
    : levels.Medium >= levels.Low ? 'Medium' : 'Low';
  var risks = Object.keys(riskSet);
  var confHtml = ['High', 'Medium', 'Low'].map(function(l) {
    var on = l === level;
    var pipCls = on ? (l === 'High' ? 'on-high' : l === 'Medium' ? 'on-med' : 'on-low') : '';
    return '<span class="conf-pip ' + pipCls + '"></span>' + l + (l !== 'Low' ? ' ' : '');
  }).join('');
  var riskHtml = risks.length
    ? risks.map(function(r) { return '<span class="risk-tag">' + r + '</span>'; }).join('')
    : '<span style="color:var(--text-3);">None flagged</span>';
  return '<div class="conf-risk-row"><span class="conf-label">Confidence:</span>' + confHtml +
    '<br><span class="conf-label">Risk:</span> ' + riskHtml + '</div>';
}

function toggleMetricsPanel(uid, btn) {
  var panel = document.getElementById(uid);
  if (!panel) return;
  var open = panel.classList.toggle('open');
  if (btn) btn.textContent = open ? 'Hide metrics ▴' : 'Show metrics ▾';
}

function bindFilterHelp() {
  var btn = document.getElementById('filterHelpBtn');
  var panel = document.getElementById('filterHelpPanel');
  if (!btn || !panel || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', function() {
    panel.classList.toggle('open');
    btn.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
  });
}
"""

HELPERS = HELPERS.replace("return '<motion></motion><div class=\"conf-risk-row\">", "return '<div class=\"conf-risk-row\">")
HELPERS = HELPERS.replace("</span></motion></motion></motion></div>';", "</span></div>';")
HELPERS = HELPERS.replace("(wm ? '<motion></motion><motion></motion><div class=\"what-means\">", "(wm ? '<div class=\"what-means\">")

if ".metrics-toggle" not in text:
    text = text.replace("/* Tabs (secondary) */", CSS + "\n/* Tabs (secondary) */", 1)

marker = "var RESEARCH_SUBTABS = ['strat', 'splits', 'trends', 'compare', 'matchup', 'reference'];"
if "function getSummaryLabel" not in text:
    text = text.replace(marker, HELPERS + "\n" + marker, 1)

text = text.replace(
    '<div class="section-title">Daily Summary</div>',
    '<div class="section-title">Today\'s Model Summary</div>',
)
text = text.replace(
    '<!-- At-a-glance cards -->\n<div class="glance-grid" id="glanceGrid"></div>',
    '<!-- At-a-glance cards (Research Lab only) -->\n<div class="glance-grid daily-read-only-hidden" id="glanceGrid"></div>',
)

search_old = """<!-- Search/Filter bar -->
<div class="search-bar">
  <input type="text" class="search-input" id="searchInput" placeholder="Filter: nyy, abq>60, trend:rising, k<22..." autocomplete="off">
  <span class="filter-help">Try: <code>abq&gt;60 reg&gt;10</code> or <code>trend:rising</code> or just <code>nyy bos atl</code></span>
</div>"""

search_new = """<!-- Search/Filter bar -->
<div class="search-bar">
  <input type="text" class="search-input" id="searchInput" placeholder="Filter teams…" autocomplete="off">
  <button type="button" class="filter-help-btn" id="filterHelpBtn" title="Search syntax help" aria-expanded="false">?</button>
  <motion></motion><div class="filter-help-panel" id="filterHelpPanel">Try: <code>abq&gt;60 reg&gt;10</code>, <code>trend:rising</code>, or team codes like <code>nyy bos atl</code></div>
</div>"""
search_new = search_new.replace("<motion></motion>", "")
text = text.replace(search_old, search_new)

thead_old = """          <th data-sort="statusLabel" class="status-only-cols">Status</th>
          <th data-sort="osi" class="status-only-cols sorted">Tier <span class="sort-ind">↓</span></th>
          <th data-sort="trend" class="status-only-cols">Trend</th>
          <th data-sort="profileLabel" class="status-only-cols">Profile</th>
          <th class="status-only-cols">Takeaway</th>"""

thead_new = """          <th data-sort="statusLabel" class="status-only-cols">Summary</th>
          <th class="status-only-cols">Read</th>
          <th data-sort="osi" class="status-only-cols sorted">Strength <span class="sort-ind">↓</span></th>
          <th data-sort="trend" class="status-only-cols">Trend</th>"""
text = text.replace(thead_old, thead_new)

adv_headers = {
    '<th data-sort="abq" class="advanced-cols">ABQ <span class="sort-ind"></span></th>':
    '<th data-sort="abq" class="advanced-cols">Process Quality <span class="metric-acronym">(ABQ)</span> <span class="sort-ind"></span></th>',
    '<th data-sort="rcv" class="advanced-cols">RCV <span class="sort-ind"></span></th>':
    '<th data-sort="rcv" class="advanced-cols">Run Creation <span class="metric-acronym">(RCV)</span> <span class="sort-ind"></span></th>',
    '<th data-sort="obr" class="advanced-cols">OBR <span class="sort-ind"></span></th>':
    '<th data-sort="obr" class="advanced-cols">On-Base Floor <span class="metric-acronym">(OBR)</span> <span class="sort-ind"></span></th>',
    '<th data-sort="osi" class="advanced-cols">OSI <span class="sort-ind"></span></th>':
    '<th data-sort="osi" class="advanced-cols">Offensive Strength <span class="metric-acronym">(OSI)</span> <span class="sort-ind"></span></th>',
    '<th data-sort="projOSI" class="advanced-cols">ProjOSI <span class="sort-ind"></span></th>':
    '<th data-sort="projOSI" class="advanced-cols">Projected OSI <span class="metric-acronym">(ProjOSI)</span> <span class="sort-ind"></span></th>',
    '<th data-sort="ppGap" class="advanced-cols">PP-Gap <span class="sort-ind"></span></th>':
    '<th data-sort="ppGap" class="advanced-cols">Process-Production Gap <span class="metric-acronym">(PP-Gap)</span> <span class="sort-ind"></span></th>',
}
for old, new in adv_headers.items():
    text = text.replace(old, new)

if "renderStrats();\n  bindFilterHelp();" not in text:
    text = text.replace(
        "function renderDailyRead() {\n  renderDailySummary();\n  renderQuadrant();\n  renderMasterTable();\n  mountReferenceTables();\n  renderMatchups();\n}",
        "function renderDailyRead() {\n  renderDailySummary();\n  renderQuadrant();\n  renderMasterTable();\n  mountReferenceTables();\n  renderMatchups();\n  renderStrats();\n  bindFilterHelp();\n}",
    )

if "STATE.oemMode !== 'daily'" not in text:
    text = text.replace(
        "  renderGlanceCards();\n  renderMasterTable();",
        "  if (STATE.oemMode !== 'daily') renderGlanceCards();\n  renderMasterTable();",
    )

HTML.write_text(text, encoding="utf-8")
print("Applied base patches")
