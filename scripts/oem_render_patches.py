"""Patch render functions in OEM dashboard for progressive disclosure."""
from pathlib import Path
import re

HTML = Path(__file__).resolve().parents[1] / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = HTML.read_text(encoding="utf-8")

# Mobile cards
start = text.find("    // Mobile card\n")
end = text.find("  });\n\n  if(rows.length === 0)", start)
if start >= 0 and end >= 0:
    new_mobile = """    // Mobile card — read first
    var mSum = getSummaryLabel(d.osi, d.ppGap, d.abq, d.rcv, d.obr, d);
    var mColor = summaryLabelColor(mSum.label);
    var mUid = 'mob_' + d.t;
    mobileHtml += '<div class="mobile-card">'+
      '<div class="mobile-card-head">'+
        '<span class="mobile-card-team">'+d.t+'</span>'+
        '<span class="mobile-card-osi" style="color:var(--text-2);font-size:11px;">Strength '+d.osi.toFixed(1)+'</span>'+
      '</div>'+
      '<div class="read-headline" style="color:'+mColor+';font-size:13px;">'+mSum.label+'</div>'+
      '<div class="read-interp">'+summaryInterpretation(d)+'</div>'+
      '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\\''+mUid+'\\', this)">Show metrics ▾</button>'+
      '<div class="metrics-panel" id="'+mUid+'">'+metricsPanelRows(d)+'</div>'+
      '<div style="display:flex;gap:6px;margin-top:8px;font-size:10px;align-items:center;flex-wrap:wrap;">'+
        (d.trend?'<span class="trend-pill" style="background:'+tc+'22;color:'+tc+';">'+d.trend+'</span>':'')+
      '</div>'+
    '</div>';
"""
    text = text[:start] + new_mobile + text[end:]

# Quadrant tooltip
old_tip = """      var html = '<div class="tt-team">'+d.t+'</div>'+
        '<div class="tt-row"><span class="lab">Status</span><span class="val">'+(d.statusLabel||statusLabel(d))+'</span></div>'+
        '<div class="tt-row"><span class="lab">Tier</span><span class="val" style="color:'+tcol(d.osi)+';">'+tier(d.osi).l+'</span></div>'+
        '<div class="tt-row"><span class="lab">Trend</span><span class="val" style="color:'+trendCol(d.trend)+';">'+trendArrow(d)+' '+(d.trend||'Stable')+'</span></div>'+
        '<div class="tt-row"><span class="lab">Profile</span><span class="val">'+profileLabel(d)+'</span></div>'+
        '<div class="tt-sep"></div>'+
        '<div style="font-size:11px;color:var(--text-2);line-height:1.4;">'+oneLineTakeaway(d)+'</div>';"""

new_tip = """      var m = master || d;
      var sum = getSummaryLabel(m.osi, m.ppGap, m.abq, m.rcv, m.obr, m);
      var sumColor = summaryLabelColor(sum.label);
      var wm = getWhatThisMeans(m);
      var tipUid = 'tip_' + d.t;
      var html = '<div class="tt-team">'+d.t+'</div>'+
        '<div class="tt-summary" style="color:'+sumColor+';">'+sum.label+'</div>'+
        '<div class="read-interp">'+summaryInterpretation(m)+'</div>'+
        (wm ? '<div class="what-means">'+wm+'</div>' : '')+
        confidenceRiskHtml(m)+
        '<div class="osi-secondary"><strong>Offensive Strength</strong> '+m.osi.toFixed(1)+'</div>'+
        '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\\''+tipUid+'\\', this)">Show metrics ▾</button>'+
        '<div class="metrics-panel" id="'+tipUid+'">'+metricsPanelRows(m)+'</div>';"""

if old_tip in text:
    text = text.replace(old_tip, new_tip)

# renderStrats blocks + forEach
old_blocks = """  var blocks=[
    {tag:'Elite Confirmed', bc:'#4ADE80', n:count(function(d){return d.osi>=75 && d.pals!=null && Math.abs(d.osi-d.pals)<5 && d.ppGap>-2;}), d:'High OSI with PALS confirmation — stable elite profiles.'},
    {tag:'Buy-Low', bc:'#60A5FA', n:count(function(d){return d.ppGap>=4 && d.pals!=null && Math.abs(d.osi-d.pals)<4;}), d:'Process ahead of production with PALS aligned — undervalued lean.'},
    {tag:'Cooling Risk', bc:'#F87171', n:count(function(d){return d.ppGap<=-4 || d.trend==='Cooling' || d.trend==='Reg. Risk';}), d:'Production ahead of process or negative recent trend.'},
    {tag:'Volatile Power', bc:'#A78BFA', n:count(function(d){return d.dfGap>=10;}), d:'Damage materially ahead of floor — boom/bust scoring paths.'},
    {tag:'Process-Forward', bc:'#22d3ee', n:count(function(d){return d.ppGap>=6 && d.abq>=60;}), d:'Strong process without matching RCV yet.'},
    {tag:'Weak Unsupported', bc:'#FB923C', n:count(function(d){return d.osi<50 && (d.sus==null || d.sus<55);}), d:'Low composite with weak sustainability support.'},
    {tag:'Platoon Sensitive', bc:'#C084FC', n:count(function(d){return d.exploit>=10;}), d:'Large RHP/LHP split — lineup construction matters.'},
  ];"""

new_blocks = """  var blocks=[
    {tag:'Elite Confirmed', bc:'#4ADE80', filterFn:function(d){return d.osi>=75 && d.pals!=null && Math.abs(d.osi-d.pals)<5 && d.ppGap>-2;}, n:count(function(d){return d.osi>=75 && d.pals!=null && Math.abs(d.osi-d.pals)<5 && d.ppGap>-2;}), d:'High OSI with PALS confirmation — stable elite profiles.'},
    {tag:'Buy-Low', bc:'#60A5FA', filterFn:function(d){return d.ppGap>=4 && d.pals!=null && Math.abs(d.osi-d.pals)<4;}, n:count(function(d){return d.ppGap>=4 && d.pals!=null && Math.abs(d.osi-d.pals)<4;}), d:'Process ahead of production with PALS aligned — undervalued lean.'},
    {tag:'Cooling Risk', bc:'#F87171', filterFn:function(d){return d.ppGap<=-4 || d.trend==='Cooling' || d.trend==='Reg. Risk';}, n:count(function(d){return d.ppGap<=-4 || d.trend==='Cooling' || d.trend==='Reg. Risk';}), d:'Production ahead of process or negative recent trend.'},
    {tag:'Volatile Power', bc:'#A78BFA', filterFn:function(d){return d.dfGap>=10;}, n:count(function(d){return d.dfGap>=10;}), d:'Damage materially ahead of floor — boom/bust scoring paths.'},
    {tag:'Process-Forward', bc:'#22d3ee', filterFn:function(d){return d.ppGap>=6 && d.abq>=60;}, n:count(function(d){return d.ppGap>=6 && d.abq>=60;}), d:'Strong process without matching RCV yet.'},
    {tag:'Weak Unsupported', bc:'#FB923C', filterFn:function(d){return d.osi<50 && (d.sus==null || d.sus<55);}, n:count(function(d){return d.osi<50 && (d.sus==null || d.sus<55);}), d:'Low composite with weak sustainability support.'},
    {tag:'Platoon Sensitive', bc:'#C084FC', filterFn:function(d){return d.exploit>=10;}, n:count(function(d){return d.exploit>=10;}), d:'Large RHP/LHP split — lineup construction matters.'},
  ];"""

text = text.replace(old_blocks, new_blocks)

old_strats = """  blocks.forEach(function(b){
    var conf = stratConfidence(b.n);
    html += '<div class="strat-card" style="border-left-color:'+b.bc+';">'+
      '<div class="strat-tag" style="color:'+b.bc+';">'+b.tag+
      '<span class="strat-confidence '+conf.cls+'">'+conf.label+' conf</span></div>'+
      '<div class="strat-teams">'+b.n+' teams meet criteria</div>'+
      '<div class="strat-desc">'+b.d+'</div>'+
    '</div>';
  });"""

new_strats = """  blocks.forEach(function(b, bi){
    var matching = (SCO_YTD_B || []).filter(b.filterFn);
    var uid = 'strat_' + bi;
    html += '<div class="strat-card" style="border-left-color:'+b.bc+';">'+
      '<div class="strat-tag" style="color:'+b.bc+';">'+b.tag+'</div>'+
      '<div class="strat-teams">'+b.n+' teams meet criteria</div>'+
      '<div class="strat-card-read">'+b.d+'</div>'+
      blockConfidenceRisk(matching)+
      '<button type="button" class="metrics-toggle" onclick="toggleMetricsPanel(\\''+uid+'\\', this)">Show matching teams ▾</button>'+
      '<div class="metrics-panel" id="'+uid+'">'+
        matching.slice(0,8).map(function(d){
          return '<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">'+
            renderReadBlock(d, uid+'_'+d.t, { skipConf: true, teamPrefix: d.t })+'</div>';
        }).join('')+
        (matching.length > 8 ? '<div style="font-size:10px;color:var(--text-3);">+'+(matching.length-8)+' more in Research Lab</div>' : '')+
      '</div>'+
    '</div>';
  });"""

text = text.replace(old_strats, new_strats)

# renderTeamDetail read block
text = text.replace(
    "  return '<div class=\"detail-panel\">'+\n    '<div>'+\n      '<div class=\"detail-title\">'+team+'</div>'",
    "  return '<div class=\"detail-panel\">'+\n    '<div style=\"grid-column:1/-1;margin-bottom:12px;\">'+renderReadBlock(master, 'detail_'+team)+'</div>'+\n    '<div>'+\n      '<div class=\"detail-title\">'+team+'</div>'",
)

# attachPalsToScores
text = text.replace(
    "      d.statusLabel = statusLabel(d);",
    "      d.statusLabel = getSummaryLabel(d.osi, d.ppGap, d.abq, d.rcv, d.obr, d).label;",
)

# renderMatchupOutput
old_match = """        '</div>'+
      '</div>'+
      '<div class="detail-metric-row"><span class="lab">Season OSI</span><span class="val" style="color:'+tcol(m.osi)+';">'+m.osi.toFixed(1)+'</span></div>'+
      '<div class="detail-metric-row"><span class="lab">'+splitLabel+' OSI</span><span class="val" style="color:'+tcol(sp?sp.osi:0)+';">'+(sp?sp.osi.toFixed(1):'—')+'</span></div>'+
      '<div class="detail-metric-row"><span class="lab">'+splitLabel+' ABQ / RCV</span><span class="val">'+(sp?sp.abq.toFixed(1):'—')+' / '+(sp?sp.rcv.toFixed(1):'—')+'</span></div>'+
      '<div class="detail-metric-row"><span class="lab">Current Form OSI</span><span class="val" style="color:'+tcol(m.currentFormOSI)+';">'+m.currentFormOSI.toFixed(1)+'</span></div>'+
      '<div class="detail-metric-row"><span class="lab">Trend / Sustain</span><span class="val"><span class="trend-pill" style="background:'+trendCol(m.trend)+'22;color:'+trendCol(m.trend)+';">'+m.trend+'</span> <span class="grade-badge" style="background:'+sg.bg+';color:'+sg.c+';">'+sg.l+'</span></span></div>'+
      '<div class="detail-metric-row"><span class="lab">Regression</span><span class="val" style="color:'+rf[1]+';">'+rf[0]+'</span></div>'+
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;color:var(--text-2);">'+
        matchupTakeaway(m, sp, splitLabel)+
      '</div>'+"""

new_match = """        '</div>'+
      '</div>'+
      renderReadBlock(m, 'match_'+team.t, { teamPrefix: team.role }) +
      '<div style="margin-top:8px;font-size:11px;color:var(--text-2);">'+matchupTakeaway(m, sp, splitLabel)+'</div>'+"""

text = text.replace(old_match, new_match)

# renderDailyRead
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

text = re.sub(r'</?motion>', '', text)

HTML.write_text(text, encoding="utf-8")
print("Applied render patches")
