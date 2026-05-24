/**
 * Research Lab tab UIX — trends heatmap, splits tables, compare enhancements.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var RL = global.ResearchLab;
  var TABS = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;

  if (!RL) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v) {
    return v != null && !isNaN(v) ? Number(v).toFixed(1) : '—';
  }

  function mColor(v, invert, ctx) {
    if (!A || !A.metricColor) return '#71717A';
    if (ctx === 'delta') {
      if (v == null || isNaN(v)) return '#71717A';
      if (v > 0) return '#4ADE80';
      if (v < 0) return '#F87171';
      return '#71717A';
    }
    if (ctx === 'ppGap') return A.ppGapColor ? A.ppGapColor(v) : '#71717A';
    if (ctx === 'oor' || ctx === 'OOR') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    var inv = !!invert || (ctx && /allowed/i.test(String(ctx)));
    return A.metricColor(v, ctx || 'osi', inv);
  }

  function metricKey(metric) {
    var m = (metric || 'osi').toLowerCase();
    return { osi: 'osi', abq: 'abq', rcv: 'rcv', obr: 'obr' }[m] || 'osi';
  }

  function metricCap(metric) {
    var k = metricKey(metric);
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function profileWindowMetric(p, metric, win) {
    if (!p || win === 'YTD') return null;
    var k = metricKey(metric);
    var suffix = win === 'L30' ? 'l30' : win === 'L14' ? 'l14' : 'l7';
    var field = k + '_' + suffix;
    var v = p[field];
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function metricHasWindowColumns(metric) {
    var avail = global.LIVE_DATA && LIVE_DATA.windowMetricsAvailable;
    if (avail && avail[metricKey(metric)] != null) return !!avail[metricKey(metric)];
    if (metricKey(metric) === 'osi') {
      var w = global.LIVE_DATA && LIVE_DATA.windowDataAvailable;
      return !!(w && w.L30);
    }
    return false;
  }

  function profileWindowOsi(p, win) {
    if (!p) return null;
    var v = win === 'L30' ? p.osi_l30 : win === 'L14' ? p.osi_l14 : win === 'L7' ? p.osi_l7 : null;
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function windowVal(d, metric, win) {
    var k = metricKey(metric);
    if (win === 'YTD') return d[k] != null ? d[k] : d.osi;
    if (!metricHasWindowColumns(metric)) return null;
    var profs = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam;
    var p = profs && profs[d.t];
    var fromProf = profileWindowMetric(p, metric, win);
    if (fromProf != null) return fromProf;
    if (metric === 'osi') {
      fromProf = profileWindowOsi(p, win);
      if (fromProf != null) return fromProf;
    }
    return null;
  }

  function windowDelta(ytd, windowValAt, metric) {
    if (ytd == null || windowValAt == null || isNaN(ytd) || isNaN(windowValAt)) return null;
    if (metric !== 'osi' && !metricHasWindowColumns(metric)) return null;
    return windowValAt - ytd;
  }

  function reliabilityForRow(d) {
    if (!metricHasWindowColumns('osi')) return { label: 'YTD Only', cls: 'rl-badge-gray' };
    var profs = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam;
    var p = profs && profs[d.t];
    var ytd = (p && p.osi_ytd != null) ? p.osi_ytd : windowVal(d, 'osi', 'YTD');
    var l14 = profileWindowOsi(p, 'L14');
    if (l14 == null) l14 = windowVal(d, 'osi', 'L14');
    var l7 = profileWindowOsi(p, 'L7');
    if (l7 == null) l7 = windowVal(d, 'osi', 'L7');
    if (l14 == null && l7 == null) return { label: 'YTD Only', cls: 'rl-badge-gray' };
    return reliabilityLabel(ytd, l14, l7);
  }

  function trendsComponentBannerHtml(metric) {
    if (metric === 'osi' || metricHasWindowColumns(metric)) return '';
    return '<div class="rl-window-banner hub-banner hub-banner--window show" style="display:block;margin:0 0 12px">'
      + 'L30/L14/L7 shows OSI trend — component metrics (ABQ/RCV/OBR) use YTD values.</div>';
  }

  function trendsWindowBannerHtml() {
    if (metricHasWindowColumns('osi')) return '';
    return '<div class="rl-window-banner hub-banner hub-banner--window show" style="display:block;margin:0 0 12px">'
      + 'L30/L14/L7 window data requires pipeline enhancement. Currently showing YTD in YTD column only — window columns unavailable until pipeline writes osi_l30/osi_l14/osi_l7 to Team_Profiles.</div>';
  }

  function reliabilityLabel(ytd, l14, l7) {
    if (ytd == null) return { label: 'YTD Only', cls: 'rl-badge-gray' };
    if (l14 == null || l7 == null) return { label: 'YTD Only', cls: 'rl-badge-gray' };
    var near = function(a, b) { return Math.abs(a - b) <= 2; };
    if (l14 > ytd + 3 && l7 > ytd + 3) return { label: 'Sustained Rise', cls: 'rl-badge-green' };
    if (l7 > ytd + 5 && near(l14, ytd)) return { label: 'Short Spike', cls: 'rl-badge-amber' };
    if (l14 < ytd - 3) return { label: 'Cooling Risk', cls: 'rl-badge-red' };
    if (l7 < ytd - 5 && near(l14, ytd)) return { label: 'Noisy L7 Drop', cls: 'rl-badge-amber' };
    if (Math.abs(l7 - ytd) <= 3 && Math.abs(l14 - ytd) <= 3) {
      return { label: 'Stable', cls: 'rl-badge-gray' };
    }
    return { label: 'Mixed', cls: 'rl-badge-gray' };
  }

  function platoonLabel(rVal, lVal) {
    if (rVal == null || lVal == null) return 'Balanced';
    var edge = rVal - lVal;
    if (Math.abs(edge) < 5) return 'Balanced';
    if (edge > 10) return 'RHP Crusher';
    if (edge < -10) return 'LHP Crusher';
    return 'Split Dependent';
  }

  function splitEdgeStyle(edge) {
    var a = Math.abs(edge);
    if (a > 15) return 'color:#F87171;font-weight:700';
    if (a > 10) return 'color:#FBBF24;font-weight:700';
    return 'color:' + mColor(edge, false, 'ppGap') + ';font-weight:600';
  }

  function numOrNull(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function estimateF5Osi(row) {
    if (!row) return null;
    var abq = row.abq, obr = row.obr, rcv = row.rcv;
    if (abq == null || obr == null || rcv == null || isNaN(abq) || isNaN(obr) || isNaN(rcv)) return null;
    return (abq * 0.45) + (obr * 0.35) + (rcv * 0.20);
  }

  function f5OsiForTeam(team, splitRows) {
    var t = String(team || '').toUpperCase();
    var both = splitRows || RL.getResearchTeamData('both') || [];
    var row = both.find(function(d) { return d.t === t; });
    return estimateF5Osi(row);
  }

  function ensureTrendState() {
    if (!global.STATE) global.STATE = {};
    if (!global.STATE.rlTrendMetric) global.STATE.rlTrendMetric = 'osi';
    if (!global.STATE.rlTrendSplit) global.STATE.rlTrendSplit = 'b';
    if (!global._rlSplitEntity) global._rlSplitEntity = 'team';
    if (!global._rlSplitMetric) global._rlSplitMetric = 'osi';
    if (global._rlSpSearchQuery == null) global._rlSpSearchQuery = '';
    if (global._rlBpTeam == null) global._rlBpTeam = '';
  }

  function filterPitcherProfiles(profiles, query) {
    query = String(query || '').toLowerCase().trim();
    if (!query) return profiles || [];
    return (profiles || []).filter(function(row) {
      var n = String(S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher') || '').toLowerCase();
      var t = String(S.pickCol(row, 'pitcher_team', 'Team', 'Tm') || '').toLowerCase();
      return n.indexOf(query) >= 0 || t.indexOf(query) >= 0;
    });
  }

  function renderPitcherSplitsTable(mount, profiles) {
    var q = global._rlSpSearchQuery || '';
    var filtered = filterPitcherProfiles(profiles, q);
    mount.innerHTML = '<div class="rl-splits-search" style="margin:0 0 12px">'
      + '<input type="search" id="rlSpSplitSearch" class="search-input" style="width:100%;max-width:420px;" '
      + 'placeholder="Search pitcher by name or team..." value="' + esc(q) + '" autocomplete="off"></div>'
      + '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
      + '<th></th><th>Pitcher</th><th>Team</th><th>Hand</th><th>Pitching Score</th><th>K%</th><th>BB%</th><th>HR/9</th><th>ERA</th>'
      + '<th>OSI Allowed</th><th>ABQ Allowed</th><th>OOR (vs RHH)</th><th>OOR (vs LHH)</th><th>F5 ERA</th>'
      + '</tr></thead><tbody>'
      + (filtered.length ? filtered.map(function(row) {
        var n = S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher');
        var t = S.pickCol(row, 'pitcher_team', 'Team', 'Tm');
        var hand = String(S.pickCol(row, 'hand', 'Hand', 'pitcher_hand') || 'R').charAt(0);
        var m = S.spProfileMetrics(row);
        var f5Era = num(S.pickCol(row, 'F5_ERA', 'F5 ERA', 'f5_era'));
        var oorR = num(S.pickCol(row, 'oor_vs_rhh', 'OOR_vs_RHH')) || m.oor;
        var oorL = num(S.pickCol(row, 'oor_vs_lhh', 'OOR_vs_LHH')) || m.oor;
        var av = A ? A.pitcherAvatar(n, { crop: 'compare', className: 'rl-av-28' }) : '';
        var logo = A ? A.teamLogoImg(t, 20) : '';
        return '<tr class="rl-row-click" data-pitcher="' + esc(n) + '">'
          + '<td>' + av + '</td><td>' + esc(n) + '</td><td>' + logo + ' ' + esc(t) + '</td><td>' + esc(hand) + '</td>'
          + '<td class="num" style="color:' + mColor(m.pitchScore, false, 'pitching') + '">' + fmt(m.pitchScore) + '</td>'
          + '<td class="num">' + fmt(m.kPct) + '</td><td class="num">' + fmt(m.bbPct) + '</td>'
          + '<td class="num">' + fmt(m.hr9) + '</td><td class="num">' + fmt(m.era) + '</td>'
          + '<td class="num" style="color:' + mColor(m.osiAllowed, true, 'osi') + '">' + fmt(m.osiAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.abqAllowed, true, 'osi') + '">' + fmt(m.abqAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(oorR, false, 'oor') + '">' + fmt(oorR) + '</td>'
          + '<td class="num" style="color:' + mColor(oorL, false, 'oor') + '">' + fmt(oorL) + '</td>'
          + '<td class="num">' + (f5Era != null ? fmt(f5Era) : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="14">No pitchers match your search.</td></tr>')
      + '</tbody></table></div>';
    var searchEl = document.getElementById('rlSpSplitSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        global._rlSpSearchQuery = searchEl.value;
        renderPitcherSplitsTable(mount, profiles);
      });
    }
    bindRowClicks(mount, 'pitcher');
  }

  function renderBullpenSplitsTable(mount, bpRows) {
    var teams = bpRows.map(function(r) { return r.t; }).sort();
    var selected = global._rlBpTeam || '';
    var ordered = bpRows.slice();
    if (selected) {
      ordered.sort(function(a, b) {
        if (a.t === selected) return -1;
        if (b.t === selected) return 1;
        return Math.abs(b.edge || 0) - Math.abs(a.edge || 0);
      });
    }
    mount.innerHTML = '<div class="rl-splits-search" style="margin:0 0 12px">'
      + '<label for="rlBpTeamSelect" style="display:block;font-size:12px;color:var(--text-2);margin-bottom:6px;">Select team bullpen...</label>'
      + '<select id="rlBpTeamSelect" class="search-input" style="width:100%;max-width:280px;">'
      + '<option value="">All teams</option>'
      + teams.map(function(t) {
        return '<option value="' + esc(t) + '"' + (t === selected ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('')
      + '</select></div>'
      + '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
      + '<th></th><th>Team</th><th>Bullpen Score</th><th>OSI Allowed</th><th>ABQ Allowed</th>'
      + '<th>vs LHH OSI Allowed</th><th>vs RHH OSI Allowed</th><th>High Lev ERA</th><th>OOR</th>'
      + '</tr></thead><tbody>'
      + ordered.map(function(row) {
        var highlight = selected && row.t === selected ? ' rl-split-gold' : '';
        var score = row.score != null ? row.score : (row.osi != null ? Math.max(0, 100 - row.osi) : null);
        return '<tr class="rl-row-click' + highlight + '" data-team="' + esc(row.t) + '">'
          + '<td>' + (A ? A.teamLogoImg(row.t, 24) : '') + '</td><td><strong>' + esc(row.t) + '</strong></td>'
          + '<td class="num" style="color:' + mColor(score, false, 'pitching') + '">' + fmt(score) + '</td>'
          + '<td class="num" style="color:' + mColor(row.osi, true, 'osi') + '">' + fmt(row.osi) + '</td>'
          + '<td class="num" style="color:' + mColor(row.abq, true, 'osi') + '">' + fmt(row.abq) + '</td>'
          + '<td class="num" style="color:' + mColor(row.lhh, true, 'osi') + '">' + fmt(row.lhh) + '</td>'
          + '<td class="num" style="color:' + mColor(row.rhh, true, 'osi') + '">' + fmt(row.rhh) + '</td>'
          + '<td class="num">' + fmt(row.hi) + '</td>'
          + '<td class="num" style="color:' + mColor(row.oor, false, 'oor') + '">' + fmt(row.oor) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var sel = document.getElementById('rlBpTeamSelect');
    if (sel) {
      sel.addEventListener('change', function() {
        global._rlBpTeam = sel.value;
        renderBullpenSplitsTable(mount, bpRows);
      });
    }
    bindRowClicks(mount, 'team');
  }

  function mountTrendControls() {
    var mount = document.getElementById('rlTrendControlsMount');
    if (!mount) return;
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var split = global.STATE.rlTrendSplit || 'b';
    mount.innerHTML = '<div class="rl-tab-controls">'
      + '<div class="rl-pill-row rl-pill-row--primary">'
      + '<span class="ca-pill-label">Metric</span>'
      + ['osi', 'abq', 'rcv', 'obr'].map(function(m) {
        return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-trend-metric="' + m + '">' + m.toUpperCase() + '</button>';
      }).join('')
      + '</div><div class="rl-pill-row">'
      + '<span class="ca-pill-label">Split</span>'
      + [{ id: 'b', l: 'Both' }, { id: 'r', l: 'vs RHP' }, { id: 'l', l: 'vs LHP' }].map(function(s) {
        return '<button type="button" class="ca-pill-btn' + (split === s.id ? ' active' : '') + '" data-trend-split="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div></div>';
    mount.querySelectorAll('[data-trend-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendMetric = btn.getAttribute('data-trend-metric');
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
    mount.querySelectorAll('[data-trend-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendSplit = btn.getAttribute('data-trend-split');
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('trendMap');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    console.log('[TRENDS] L30 data available:', global.SCO_L30_B ? global.SCO_L30_B.length : 'missing');
    console.log('[TRENDS] L14 data available:', global.SCO_L14_B ? global.SCO_L14_B.length : 'missing');
    console.log('[TRENDS] L7 data available:', global.SCO_L7_B ? global.SCO_L7_B.length : 'missing');
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var split = global.STATE.rlTrendSplit || 'b';
    var rows = RL.getResearchTeamData(split === 'r' ? 'r' : split === 'l' ? 'l' : 'both');
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">Team offense data is loading — check vs_RHP / vs_LHP sheets.</p>';
      return;
    }
    var sorted = rows.slice().sort(function(a, b) {
      return (windowVal(b, metric, 'YTD') || 0) - (windowVal(a, metric, 'YTD') || 0);
    });
    var profs = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam;
    if (profs && Object.keys(profs).length && global.LIVE_DATA.teamProfiles && global.LIVE_DATA.teamProfiles[0]) {
      console.log('[TRENDS] teamProfiles column keys:', Object.keys(global.LIVE_DATA.teamProfiles[0]));
    }
    var html = trendsWindowBannerHtml() + trendsComponentBannerHtml(metric)
      + '<table class="rl-table-premium rl-trend-table"><thead><tr>'
      + '<th>Team</th><th>YTD</th><th>L30</th><th>L14</th><th>L7</th><th>Δ L14</th><th>Δ L7</th><th>Velocity</th><th>Reliability</th>'
      + '</tr></thead><tbody>';
    sorted.forEach(function(d) {
      var ytd = windowVal(d, metric, 'YTD');
      var l30 = windowVal(d, metric, 'L30');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      var d14 = windowDelta(ytd, l14, metric);
      var d7 = windowDelta(ytd, l7, metric);
      var velocity = (d7 != null && d14 != null) ? d7 - d14 : null;
      var rel = reliabilityForRow(d);
      var logo = A ? A.teamLogoImg(d.t, 22) : '';
      html += '<tr class="rl-row-click" data-team="' + esc(d.t) + '">'
        + '<td class="rl-team-cell">' + logo + ' <strong>' + esc(d.t) + '</strong></td>'
        + cell(ytd, metric, false)
        + cell(l30, metric, false)
        + cell(l14, metric, false)
        + cell(l7, metric, false)
        + deltaCell(d14)
        + deltaCell(d7)
        + deltaCell(velocity)
        + '<td><span class="rl-reliability-badge ' + rel.cls + '">' + esc(rel.label) + '</span></td></tr>';
    });
    html += '</tbody></table>';
    mount.innerHTML = html;
    mount.querySelectorAll('.rl-row-click').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var t = tr.getAttribute('data-team');
        if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
      });
    });
  }

  function cell(v, metric, inv) {
    if (v == null || isNaN(v)) return '<td class="num rl-na" title="requires pipeline run">—</td>';
    return '<td class="num" style="color:' + mColor(v, inv, metricKey(metric)) + '">' + fmt(v) + '</td>';
  }

  function deltaCell(v) {
    if (v == null || isNaN(v)) return '<td class="num">—</td>';
    var prefix = v > 0 ? '+' : '';
    return '<td class="num" style="color:' + mColor(v, false, 'delta') + '">' + prefix + fmt(v) + '</td>';
  }

  function renderTrendSummary() {
    var html = trendSummaryHtml();
    ['rlTrendSummaryMount', 'homeTrendSummaryMount'].forEach(function(id) {
      var mount = document.getElementById(id);
      if (mount) mount.innerHTML = html;
    });
  }

  function trendSummaryHtml() {
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var rows = RL.getResearchTeamData('both');
    if (!rows.length) return '';
    var enriched = rows.map(function(d) {
      var ytd = windowVal(d, metric, 'YTD');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      return { t: d.t, ytd: ytd, l14: l14, l7: l7, d14: (l14 != null && ytd != null) ? l14 - ytd : null };
    });
    var risers = enriched.filter(function(x) { return x.d14 != null && x.d14 > 0; })
      .sort(function(a, b) { return b.d14 - a.d14; }).slice(0, 3);
    var fallers = enriched.filter(function(x) { return x.d14 != null && x.d14 < 0; })
      .sort(function(a, b) { return a.d14 - b.d14; }).slice(0, 3);
    var hotL7 = enriched.filter(function(x) {
      return x.l7 != null && x.ytd != null && x.l7 > x.ytd + 6;
    }).sort(function(a, b) { return (b.l7 - b.ytd) - (a.l7 - a.ytd); }).slice(0, 3);
    var stable = enriched.filter(function(x) {
      if (x.ytd == null || x.l14 == null || x.l7 == null) return false;
      return Math.abs(x.l7 - x.ytd) <= 3 && Math.abs(x.l14 - x.ytd) <= 3;
    }).slice(0, 3);
    return trendCard('Biggest Risers', risers, function(x) { return '+' + x.d14.toFixed(1); })
      + trendCard('Biggest Fallers', fallers, function(x) { return x.d14.toFixed(1); })
      + trendCard('Hot L7 Spike', hotL7, function(x) { return 'L7 +' + (x.l7 - x.ytd).toFixed(1); })
      + trendCard('Most Stable', stable, function() { return '±3'; });
  }

  function trendCard(title, items, valueFn) {
    var meta = {
      'Biggest Risers': { variant: 'risers', subtitle: 'L14 improvement vs YTD baseline' },
      'Biggest Fallers': { variant: 'fallers', subtitle: 'L14 decline vs YTD baseline' },
      'Hot L7 Spike': { variant: 'hot', subtitle: 'Recent L7 surge — may be noisy' },
      'Most Stable': { variant: 'stable', subtitle: 'All windows within ±3 of YTD' }
    }[title] || { variant: 'stable', subtitle: '' };
    var body = '';
    if (items.length) {
      body = '<div class="rl-summary-chips">' + items.map(function(x) {
        var logo = A && A.teamLogoImg ? A.teamLogoImg(x.t, 16, 'rl-summary-team-logo') : '';
        return '<span class="rl-summary-chip">' + logo
          + '<span class="rl-summary-chip-abbr">' + esc(x.t) + '</span>'
          + '<span class="rl-summary-chip-val">' + esc(valueFn(x)) + '</span></span>';
      }).join('') + '</div>';
    } else {
      body = '<div class="rl-summary-empty"><span class="rl-summary-empty-icon" aria-hidden="true"></span>'
        + '<span>No signal yet — waiting for pipeline data</span></div>';
    }
    return '<div class="rl-summary-card rl-summary-card--' + meta.variant + '">'
      + '<div class="rl-summary-head"><span class="rl-summary-icon" aria-hidden="true"></span>'
      + '<div><div class="rl-summary-label">' + esc(title) + '</div>'
      + '<div class="rl-summary-sub">' + esc(meta.subtitle) + '</div></div></div>'
      + body + '</div>';
  }

  function mountSplitsControls() {
    var mount = document.getElementById('rlSplitsControlMount');
    if (!mount) return;
    ensureTrendState();
    var entity = global._rlSplitEntity || 'team';
    var metric = global._rlSplitMetric || 'osi';
    mount.innerHTML = '<div class="rl-pill-row rl-pill-row--primary">'
      + [{ id: 'team', l: 'Team Offense' }, { id: 'sp', l: 'Starting Pitcher' }, { id: 'bp', l: 'Bullpen' }].map(function(e) {
        return '<button type="button" class="ca-pill-btn' + (entity === e.id ? ' active' : '') + '" data-split-entity="' + e.id + '">' + e.l + '</button>';
      }).join('')
      + '</div>'
      + (entity === 'team' ? '<div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Metric</span>'
        + ['osi', 'abq', 'rcv', 'obr'].map(function(m) {
          return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-split-metric="' + m + '">' + m.toUpperCase() + '</button>';
        }).join('')
        + '<span class="ca-pill-label" style="margin-left:12px">Context</span>'
        + [{ id: 'both', l: 'Both' }, { id: 'f5', l: 'F5' }].map(function(c) {
          var cur = global._rlSplitContext || 'both';
          return '<button type="button" class="ca-pill-btn' + (cur === c.id ? ' active' : '') + '" data-split-context="' + c.id + '">' + c.l + '</button>';
        }).join('')
        + '</div>'
        : entity === 'sp' ? '<div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Metric</span>'
        + ['osiAllowed', 'abqAllowed', 'rcvAllowed', 'obrAllowed', 'pitchScore'].map(function(m) {
          var cur = global._rlSpSplitMetric || 'osiAllowed';
          var lbl = { osiAllowed: 'OSI Allowed', abqAllowed: 'ABQ Allowed', rcvAllowed: 'RCV Allowed', obrAllowed: 'OBR Allowed', pitchScore: 'Pitching Score' }[m];
          return '<button type="button" class="ca-pill-btn' + (cur === m ? ' active' : '') + '" data-sp-split-metric="' + m + '">' + lbl + '</button>';
        }).join('') + '</div>' : '');
    var confirm = document.getElementById('rlSplitsConfirm');
    if (confirm) {
      var entLbl = { team: 'Team Offense', sp: 'Starting Pitcher', bp: 'Bullpen' }[entity];
      confirm.textContent = 'Showing: ' + entLbl + ' · ' + (entity === 'team' ? metric.toUpperCase() : 'OSI Allowed') + ' · Both splits';
    }
    mount.querySelectorAll('[data-split-entity]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitEntity = btn.getAttribute('data-split-entity');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-split-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitMetric = btn.getAttribute('data-split-metric');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-split-context]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitContext = btn.getAttribute('data-split-context');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-sp-split-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSpSplitMetric = btn.getAttribute('data-sp-split-metric');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    ensureTrendState();
    var entity = global._rlSplitEntity || 'team';
    var metric = global._rlSplitMetric || 'osi';
    mount.innerHTML = '<p class="rl-loading">Loading split data…</p>';
    if (entity === 'team') {
      var r = RL.getResearchTeamData('r');
      var l = RL.getResearchTeamData('l');
      var both = RL.getResearchTeamData('both');
      var rows = r.map(function(row) {
        var lrow = l.find(function(x) { return x.t === row.t; }) || {};
        var rv = row[metric];
        var lv = lrow[metric];
        return {
          t: row.t, rv: rv, lv: lv,
          f5: f5OsiForTeam(row.t, both),
          edge: (rv != null && lv != null) ? rv - lv : null
        };
      }).sort(function(a, b) {
        return Math.abs(b.edge || 0) - Math.abs(a.edge || 0);
      });
      var f5Tip = ' title="Estimated from process metrics — ABQ/OBR weighted for starter-driven innings"';
      mount.innerHTML = '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
        + '<th></th><th>Team</th><th>vs RHP</th><th>vs LHP</th><th>Split Edge</th>'
        + '<th' + f5Tip + '>F5 OSI (est.)</th><th>Platoon Label</th>'
        + '</tr></thead><tbody>'
        + rows.map(function(row) {
          var logo = A ? A.teamLogoImg(row.t, 24) : '';
          return '<tr class="rl-row-click" data-team="' + esc(row.t) + '">'
            + '<td>' + logo + '</td><td><strong>' + esc(row.t) + '</strong></td>'
            + '<td class="num" style="color:' + mColor(row.rv, false, metric) + '">' + fmt(row.rv) + '</td>'
            + '<td class="num" style="color:' + mColor(row.lv, false, metric) + '">' + fmt(row.lv) + '</td>'
            + '<td class="num" style="' + splitEdgeStyle(row.edge) + '">' + fmt(row.edge) + '</td>'
            + '<td class="num" style="color:' + mColor(row.f5, false, 'osi') + '">' + fmt(row.f5) + '</td>'
            + '<td>' + esc(platoonLabel(row.rv, row.lv)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      bindRowClicks(mount, 'team');
      return;
    }
    if (entity === 'sp') {
      var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
      var load = profiles.length
        ? Promise.resolve(profiles)
        : (global.PitcherLab ? PitcherLab.loadProfiles() : Promise.resolve([]));
      load.then(function(list) {
        profiles = list || profiles;
        renderPitcherSplitsTable(mount, profiles);
      });
      return;
    }
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var bpRows = Object.keys(units).map(function(tk) {
      var u = units[tk];
      var lhh = num(S.pickCol(u, 'osi_allowed_vs_lhh', 'vs_LHH_OSI_allowed')) || u.osiAllowed;
      var rhh = num(S.pickCol(u, 'osi_allowed_vs_rhh', 'vs_RHH_OSI_allowed')) || u.osiAllowed;
      return {
        t: tk, lhh: lhh, rhh: rhh, osi: u.osiAllowed, abq: u.abqAllowed,
        score: S.bullpenPitchScore ? S.bullpenPitchScore(u) : u.bullpenScore,
        oor: u.oor, edge: (lhh != null && rhh != null) ? rhh - lhh : null,
        hi: u.hiLevEra, lo: u.loLevEra
      };
    }).sort(function(a, b) { return Math.abs(b.edge || 0) - Math.abs(a.edge || 0); });
    renderBullpenSplitsTable(mount, bpRows);
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function bindRowClicks(mount, kind) {
    mount.querySelectorAll('.rl-row-click').forEach(function(tr) {
      tr.addEventListener('click', function() {
        if (kind === 'pitcher') {
          var p = tr.getAttribute('data-pitcher');
          if (p) global.location.href = 'pitcher_profile.html?pitcher=' + encodeURIComponent(p);
        } else {
          var t = tr.getAttribute('data-team');
          if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
        }
      });
    });
  }

  function patchWorkspaceHeader() {
    var el = document.getElementById('researchLabHeader');
    if (!el || el.dataset.uixPatched) return;
    el.dataset.uixPatched = '1';
    el.innerHTML = '<div class="rl-workspace-header">'
      + '<div class="rl-workspace-eyebrow">Research Lab</div>'
      + '<h2 class="rl-workspace-title">Research Lab</h2>'
      + '<p class="rl-workspace-subtitle">Four focused tools for validating offensive and pitching model signals.</p>'
      + '</div>';
    /* tab pills live in .rl-segment-tabs only — no duplicate header pills */
  }

  global.renderTrendHeatmap = renderTrendHeatmap;
  RL.mountTrendControls = mountTrendControls;
  RL.renderTrendHeatmap = renderTrendHeatmap;
  RL.renderTrendSummary = renderTrendSummary;
  RL.mountSplitsEntityControls = mountSplitsControls;
  RL.renderSplitsTable = renderSplitsTable;
  RL.initSplitsControls = mountSplitsControls;
  RL.patchWorkspaceHeader = patchWorkspaceHeader;

  var origOnSubtab = RL.onSubtab;
  RL.onSubtab = function(name) {
    patchWorkspaceHeader();
    if (name === 'trends') {
      RL.syncResearchGlobalsFromLiveData();
      mountTrendControls();
      renderTrendHeatmap();
      renderTrendSummary();
    } else if (name === 'splits') {
      RL.syncResearchGlobalsFromLiveData();
      mountSplitsControls();
      renderSplitsTable();
    } else if (origOnSubtab) origOnSubtab(name);
  };

})(typeof window !== 'undefined' ? window : this);
