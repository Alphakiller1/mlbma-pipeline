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
    return { osi: 'osi', abq: 'abq', rcv: 'rcv', obr: 'obr', pals: 'pals', pitchfaced: 'pitchfaced', pitchscorefaced: 'pitchfaced' }[m] || 'osi';
  }

  function palsByTeam() {
    var map = {};
    var raw = global.LIVE_DATA && LIVE_DATA.pals;
    if (!raw || !raw.length) return map;
    var rows = (S && S.parsePalsRows) ? S.parsePalsRows(raw) : raw;
    (rows || []).forEach(function(p) {
      var t = p.t || String(S.pickCol(p, 'team', 'Tm', 'Team') || '').trim().toUpperCase();
      if (t) map[t] = p.pals != null ? p.pals : num(S.pickCol(p, 'PALS', 'pals'));
    });
    return map;
  }

  function pitchScoreFaced(team) {
    var map = pitchingScoreFacedByTeam();
    if (map[team] != null) return map[team];
    var palsMap = palsByTeam();
    var v = palsMap[team];
    if (v != null) return 100 - v;
    return null;
  }

  function pitchingScoreFacedByTeam() {
    var map = {};
    var raw = global.LIVE_DATA && LIVE_DATA.pals;
    if (!raw || !raw.length) return map;
    var rows = (S && S.parsePalsRows) ? S.parsePalsRows(raw) : raw;
    (rows || []).forEach(function(p) {
      var t = p.t || String(S.pickCol(p, 'team', 'Tm', 'Team') || '').trim().toUpperCase();
      if (!t) return;
      var xfip = num(S.pickCol(p, 'avg_xFIP_faced', 'Avg xFIP Faced', 'avg_xfip_faced'));
      if (xfip == null && p.avg_xFIP_faced != null) xfip = num(p.avg_xFIP_faced);
      if (xfip != null && !isNaN(xfip)) {
        map[t] = Math.max(0, Math.min(100, 100 - (xfip - 3.0) * 25));
        return;
      }
      var pals = p.pals != null ? p.pals : num(S.pickCol(p, 'PALS', 'pals'));
      if (pals != null) map[t] = 100 - pals;
    });
    return map;
  }

  function renderOnLiveDataReady(fn, label) {
    if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
      MLBMACharts.renderOnLiveDataReady(fn, label || 'rl');
    } else if (global.LIVE_DATA && LIVE_DATA.loaded) {
      fn();
    } else {
      setTimeout(fn, 1000);
    }
  }

  function activeTrendWindow() {
    var st = global.STATE || {};
    var w = String(st.time || 'YTD').toUpperCase();
    if (w === 'L30' || w === 'L14' || w === 'L7') return w;
    return 'YTD';
  }

  function trendColHighlight(win) {
    return activeTrendWindow() === win ? ' rl-trend-col--highlight' : '';
  }

  function ytdMetricVal(d, metric) {
    var k = metricKey(metric);
    if (metric === 'pals') return palsByTeam()[d.t];
    if (metric === 'pitchfaced') return pitchScoreFaced(d.t);
    return d[k] != null ? d[k] : (k === 'osi' ? d.osi : null);
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
    if (metric === 'pals') {
      if (win === 'YTD') return palsByTeam()[d.t];
      return null;
    }
    if (metric === 'pitchfaced') {
      if (win === 'YTD') return pitchScoreFaced(d.t);
      return null;
    }
    if (win === 'YTD') return d[k] != null ? d[k] : d.osi;
    if (!metricHasWindowColumns(metric)) {
      if (metric === 'abq' || metric === 'rcv' || metric === 'obr') return d[k] != null ? d[k] : null;
      return null;
    }
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

  function reliabilityForRow(d, metric) {
    if (metric === 'pals' || metric === 'pitchfaced') return { label: 'YTD Only', cls: 'rl-badge-gray' };
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
    if (metric === 'osi' || metric === 'pals' || metric === 'pitchfaced' || metricHasWindowColumns(metric)) return '';
    return '<div class="rl-window-banner hub-banner hub-banner--window show" style="display:block;margin:0 0 12px">'
      + 'Component metrics (ABQ/RCV/OBR) show YTD \u2014 window data requires pipeline enhancement.</div>';
  }

  function trendsSplitBannerHtml() {
    var split = global.STATE.rlTrendSplit || 'b';
    if (split === 'b') return '';
    return '<div class="rl-window-banner hub-banner hub-banner--location show" style="display:block;margin:0 0 12px">'
      + 'Home/Away trends require batter splits pipeline step \u2014 showing YTD values.</div>';
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

  function aggregateBatterSplitsByTeam(rawRows, metric) {
    var mk = metricKey(metric);
    var buckets = {};
    (rawRows || []).forEach(function(row) {
      var t = S.teamKey ? S.teamKey(S.pickCol(row, 'team', 'Tm', 'Team')) : String(S.pickCol(row, 'team', 'Tm', 'Team') || '').trim().toUpperCase();
      if (!t) return;
      if (!buckets[t]) buckets[t] = { t: t, w: 0, sums: {} };
      var pa = num(S.pickCol(row, 'PA', 'pa')) || 1;
      var sc = S.scoreRowFromSheet ? S.scoreRowFromSheet(row) : null;
      var val = null;
      if (sc && sc[mk] != null && !isNaN(sc[mk])) val = sc[mk];
      else if (mk === 'pals') val = palsByTeam()[t];
      else if (mk === 'pitchfaced') val = pitchScoreFaced(t);
      else {
        var woba = num(S.pickCol(row, 'wOBA', 'woba'));
        if (woba != null) val = Math.min(100, Math.max(0, (woba - 0.28) * 250));
        else val = num(S.pickCol(row, 'wRC+', 'wRC', 'SLG', 'OPS'));
      }
      if (val == null || isNaN(val)) return;
      buckets[t].w += pa;
      if (!buckets[t].sums[mk]) buckets[t].sums[mk] = 0;
      buckets[t].sums[mk] += val * pa;
      if (sc) {
        ['abq', 'rcv', 'obr', 'osi'].forEach(function(k) {
          if (sc[k] == null || isNaN(sc[k])) return;
          if (!buckets[t].sums[k]) buckets[t].sums[k] = 0;
          buckets[t].sums[k] += sc[k] * pa;
        });
      }
    });
    return Object.keys(buckets).map(function(tk) {
      var b = buckets[tk];
      var w = b.w || 1;
      var o = { t: tk, pa: b.w };
      Object.keys(b.sums).forEach(function(k) {
        o[k] = b.sums[k] / w;
      });
      if (o.osi == null && o[mk] != null) o.osi = o[mk];
      return o;
    });
  }

  var SP_SPLIT_TYPES = {
    overall: ['overall'],
    rhh: ['vs_rhh', 'rhh'],
    lhh: ['vs_lhh', 'lhh'],
    home: ['home'],
    away: ['away'],
    f5: ['f5'],
    full: ['full', 'full_outing']
  };

  function findSpMetricSplitRow(pitcherName, splitView) {
    var key = String(pitcherName || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    var types = SP_SPLIT_TYPES[splitView || 'overall'] || ['overall'];
    var rows = (global.LIVE_DATA && LIVE_DATA.spMetricSplits) || [];
    return rows.find(function(r) {
      var n = String(S.pickCol(r, 'pitcher_name', 'Name', 'Pitcher') || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (n !== key) return false;
      var st = String(S.pickCol(r, 'split_type', 'splitType', 'split', 'Split')).toLowerCase().replace(/\s+/g, '_');
      for (var i = 0; i < types.length; i++) {
        if (st === types[i] || st.indexOf(types[i]) >= 0) return true;
      }
      return false;
    }) || null;
  }

  function spMetricFromProfile(row, metricKey, splitKey) {
    var m = S.spProfileMetrics ? S.spProfileMetrics(row) : null;
    if (!m) return null;
    var sk = splitKey || global._rlSpSplitView || 'overall';
    var mk = metricKey || global._rlSpSplitMetric || 'osiAllowed';
    var allowedKeys = ['osiAllowed', 'abqAllowed', 'rcvAllowed', 'obrAllowed'];
    if (allowedKeys.indexOf(mk) >= 0 && sk !== 'overall') {
      return null;
    }
    if (mk === 'pitchScore') {
      var splitRow = findSpMetricSplitRow(S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher'), sk);
      if (splitRow && S.spProfileMetrics) {
        var sm = S.spProfileMetrics(Object.assign({}, row, splitRow));
        if (sm && sm.pitchScore != null) return sm.pitchScore;
      }
      return m.pitchScore;
    }
    var map = {
      pitchScore: m.pitchScore,
      osiAllowed: m.osiAllowed,
      abqAllowed: m.abqAllowed,
      rcvAllowed: m.rcvAllowed,
      obrAllowed: m.obrAllowed
    };
    return map[mk];
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
    if (!global._rlSplitFacing) global._rlSplitFacing = 'all';
    if (!global._rlSplitHand) global._rlSplitHand = 'both';
    if (global._rlSpSearchQuery == null) global._rlSpSearchQuery = '';
    if (global._rlBpTeam == null) global._rlBpTeam = '';
    if (!global._rlBpMetric) global._rlBpMetric = 'score';
    if (!global._rlBpSearch) global._rlBpSearch = '';
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
    var metric = global._rlSpSplitMetric || 'osiAllowed';
    var split = global._rlSpSplitView || 'overall';
    var simple = !!global._rlSpSimpleView;
    var allowedMetric = ['osiAllowed', 'abqAllowed', 'rcvAllowed', 'obrAllowed'].indexOf(metric) >= 0;
    var splitNote = (allowedMetric && split !== 'overall')
      ? '<p class="rl-note" style="margin:0 0 10px;font-size:12px;color:var(--text-2)">Split-specific allowed metrics require pipeline enhancement \u2014 showing overall values or standard rates from SP_Metric_Splits.</p>'
      : '';
    var metricLbl = { osiAllowed: 'OSI Allowed', abqAllowed: 'ABQ Allowed', rcvAllowed: 'RCV Allowed', obrAllowed: 'OBR Allowed', pitchScore: 'Pitching Score' }[metric] || 'Metric';
    var splitLbl = { overall: 'Overall', rhh: 'vs RHH', lhh: 'vs LHH', home: 'Home', away: 'Away', f5: 'F5', full: 'Full Outing' }[split] || split;
    mount.innerHTML = splitNote + '<div class="rl-splits-search" style="margin:0 0 12px">'
      + '<input type="search" id="rlSpSplitSearch" class="search-input" style="width:100%;max-width:420px;" '
      + 'placeholder="Search pitcher by name or team..." value="' + esc(q) + '" autocomplete="off"></div>'
      + '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
      + '<th></th><th>Pitcher</th><th>Team</th><th>Hand</th><th>' + esc(metricLbl) + ' (' + esc(splitLbl) + ')</th>'
      + (simple ? '' : '<th>K%</th><th>BB%</th><th>HR/9</th><th>ERA</th><th>ABQ Allowed</th><th>RCV Allowed</th>')
      + '</tr></thead><tbody>'
      + (filtered.length ? filtered.map(function(row) {
        var n = S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher');
        var t = S.pickCol(row, 'pitcher_team', 'Team', 'Tm');
        var hand = String(S.pickCol(row, 'hand', 'Hand', 'pitcher_hand') || 'R').charAt(0);
        var m = S.spProfileMetrics(row);
        var mv = spMetricFromProfile(row, metric, split);
        var splitRow = findSpMetricSplitRow(n, split);
        if (mv == null && splitRow && metric === 'pitchScore' && S.spProfileMetrics) {
          var sm = S.spProfileMetrics(Object.assign({}, row, splitRow));
          mv = sm ? sm.pitchScore : null;
        }
        if (mv == null && splitRow && !allowedMetric) {
          mv = num(S.pickCol(splitRow, 'ERA'));
        }
        var av = A ? A.pitcherAvatar(row, { crop: 'compare', className: 'rl-av-28' }) : '';
        var logo = A ? A.teamLogoImg(t, 20) : '';
        var inv = metric !== 'pitchScore';
        var naTitle = (mv == null && allowedMetric && split !== 'overall')
          ? ' title="Split-specific allowed metrics require pipeline enhancement"' : '';
        return '<tr class="rl-row-click" data-pitcher="' + esc(n) + '">'
          + '<td>' + av + '</td><td>' + esc(n) + '</td><td>' + logo + ' ' + esc(t) + '</td><td>' + esc(hand) + '</td>'
          + '<td class="num"' + naTitle + ' style="color:' + mColor(mv, inv, metric === 'pitchScore' ? 'pitching' : 'osi') + '">' + fmt(mv) + '</td>'
          + (simple ? '' : '<td class="num">' + fmt(m.kPct) + '</td><td class="num">' + fmt(m.bbPct) + '</td>'
          + '<td class="num">' + fmt(m.hr9) + '</td><td class="num">' + fmt(m.era) + '</td>'
          + '<td class="num" style="color:' + mColor(m.abqAllowed, true, 'osi') + '">' + fmt(m.abqAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.rcvAllowed, true, 'osi') + '">' + fmt(m.rcvAllowed) + '</td>')
          + '</tr>';
      }).join('') : '<tr><td colspan="10">No pitchers match your search.</td></tr>')
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
    var split = global._rlBpSplit || 'overall';
    var win = global._rlBpWindow || 'YTD';
    var metric = global._rlBpMetric || 'score';
    var search = String(global._rlBpSearch || '').toLowerCase().trim();
    if (!global._bullpenFieldsLogged && bpRows.length) {
      global._bullpenFieldsLogged = true;
      console.log('[BULLPEN] first unit fields:', Object.keys(bpRows[0] || {}));
    }
    var filtered = bpRows.filter(function(row) {
      return !search || row.t.toLowerCase().indexOf(search) >= 0;
    });
    var metricHdr = { score: 'Avg Pitching Score', woba: 'wOBA', rcv: 'RCV Allowed', obr: 'OBR Allowed', hi: 'High Lev ERA', med: 'Med Lev ERA' }[metric] || 'Metric';
    mount.innerHTML = '<div class="rl-splits-search" style="margin:0 0 12px">'
      + '<input type="search" id="rlBpSplitSearch" class="search-input" placeholder="Search team..." '
      + 'value="' + esc(global._rlBpSearch || '') + '" style="width:100%;max-width:320px;"></div>'
      + (win !== 'YTD' ? '<p class="rl-note" style="margin:0 0 10px;font-size:12px;color:var(--text-2)">Bullpen window splits use YTD until pipeline adds L30/L14/L7 bullpen columns.</p>' : '')
      + '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
      + '<th></th><th>Team</th><th>' + esc(metricHdr) + '</th>'
      + '</tr></thead><tbody>'
      + (filtered.length ? filtered.map(function(row) {
        var osi = split === 'lhh' ? (row.lhh != null ? row.lhh : row.osi)
          : split === 'rhh' ? (row.rhh != null ? row.rhh : row.osi) : row.osi;
        var score = row.score != null ? row.score : (osi != null ? Math.max(0, Math.min(100, 100 - osi)) : null);
        var val = metric === 'score' ? score
          : metric === 'woba' ? row.woba
          : metric === 'rcv' ? (row.rcv != null ? row.rcv : row.abq)
          : metric === 'obr' ? row.obr
          : metric === 'hi' ? row.hi
          : row.med;
        var inv = metric === 'score' ? false : (metric !== 'woba');
        return '<tr class="rl-row-click" data-team="' + esc(row.t) + '">'
          + '<td>' + (A ? A.teamLogoImg(row.t, 24) : '') + '</td><td><strong>' + esc(row.t) + '</strong></td>'
          + '<td class="num" style="color:' + mColor(val, inv, metric === 'score' ? 'pitching' : 'osi') + '">' + (metric === 'woba' && val != null ? Number(val).toFixed(3) : fmt(val)) + '</td></tr>';
      }).join('') : '<tr><td colspan="3">No teams match your search.</td></tr>')
      + '</tbody></table></div>';
    var searchEl = document.getElementById('rlBpSplitSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        global._rlBpSearch = searchEl.value;
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
      + ['osi', 'abq', 'rcv', 'obr', 'pals', 'pitchfaced'].map(function(m) {
        var lbl = m === 'pitchfaced' ? 'Pitch Score Faced' : m.toUpperCase();
        return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-trend-metric="' + m + '">' + lbl + '</button>';
      }).join('')
      + '</div><div class="rl-pill-row">'
      + '<span class="ca-pill-label">Handedness</span>'
      + [{ id: 'b', l: 'Both' }, { id: 'r', l: 'vs RHP' }, { id: 'l', l: 'vs LHP' }].map(function(s) {
        return '<button type="button" class="ca-pill-btn' + (split === s.id ? ' active' : '') + '" data-trend-split="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div><div class="rl-pill-row">'
      + '<span class="ca-pill-label">Location</span>'
      + [{ id: 'b', l: 'Both' }, { id: 'home', l: 'Home' }, { id: 'away', l: 'Away' }].map(function(s) {
        var loc = global.STATE.rlTrendLoc || 'b';
        return '<button type="button" class="ca-pill-btn' + (loc === s.id ? ' active' : '') + '" data-trend-loc="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div></div>';
    mount.querySelectorAll('[data-trend-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendMetric = btn.getAttribute('data-trend-metric');
        console.log('[TRENDS] metric changed to:', global.STATE.rlTrendMetric);
        console.log('[TRENDS] SCO_YTD_B length:', global.SCO_YTD_B ? global.SCO_YTD_B.length : 0);
        console.log('[TRENDS] LIVE_DATA.pals length:', global.LIVE_DATA && LIVE_DATA.pals ? LIVE_DATA.pals.length : 0);
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
    mount.querySelectorAll('[data-trend-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendSplit = btn.getAttribute('data-trend-split');
        global.STATE.rlHandedness = global.STATE.rlTrendSplit;
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
    mount.querySelectorAll('[data-trend-loc]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendLoc = btn.getAttribute('data-trend-loc');
        mountTrendControls();
        renderTrendHeatmap();
      });
    });
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('trendMap');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric || 'osi';
    var split = global.STATE.rlHandedness || global.STATE.rlTrendSplit || 'b';
    global.STATE.rlHandedness = split;

    if (metric === 'pals' && global.LIVE_DATA && !global.LIVE_DATA.researchLoaded) {
      mount.innerHTML = '<p class="rl-empty">Loading PALS data\u2026</p>';
      setTimeout(function() { renderTrendHeatmap(); }, 1000);
      return;
    }

    var handKey = split === 'r' ? 'r' : split === 'l' ? 'l' : 'both';
    var rows = RL.getResearchTeamData(handKey);
    console.log('[TRENDS] rendering with', rows.length, 'rows, metric:', metric, 'hand:', handKey);
    if (!rows.length) {
      if (RL.syncResearchGlobalsFromLiveData) RL.syncResearchGlobalsFromLiveData();
      rows = RL.getResearchTeamData(handKey);
    }
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">Loading team data\u2026</p>';
      renderOnLiveDataReady(function() { renderTrendHeatmap(); }, 'trendHeatmap');
      return;
    }

    var hiWin = activeTrendWindow();
    console.log('[TRENDS] window highlight:', hiWin, 'L30 available:', global.SCO_L30_B ? global.SCO_L30_B.length : 0);

    var sorted = rows.slice().sort(function(a, b) {
      var bv = ytdMetricVal(b, metric) || 0;
      var av = ytdMetricVal(a, metric) || 0;
      return bv - av;
    });

    var html = trendsWindowBannerHtml() + trendsComponentBannerHtml(metric) + trendsSplitBannerHtml()
      + ((metric === 'pals' || metric === 'pitchfaced') ? '<div class="rl-window-banner hub-banner hub-banner--window show" style="display:block;margin:0 0 12px">PALS / Pitch Score Faced: YTD column only. L30/L14/L7 unavailable for this metric.</div>' : '')
      + '<table class="rl-table-premium rl-trend-table"><thead><tr>'
      + '<th>Team</th><th class="' + trendColHighlight('YTD').trim() + '">YTD</th>'
      + '<th class="' + trendColHighlight('L30').trim() + '">L30</th>'
      + '<th class="' + trendColHighlight('L14').trim() + '">L14</th>'
      + '<th class="' + trendColHighlight('L7').trim() + '">L7</th>'
      + '<th>Reliability</th>'
      + '</tr></thead><tbody>';
    sorted.forEach(function(d) {
      var ytd = ytdMetricVal(d, metric);
      var l30 = windowVal(d, metric, 'L30');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      var compFb = (metric === 'abq' || metric === 'rcv' || metric === 'obr');
      if (compFb && l30 == null && ytd != null) { l30 = ytd; l14 = ytd; l7 = ytd; }
      var rel = reliabilityForRow(d, metric);
      var logo = A ? A.teamLogoImg(d.t, 22) : '';
      html += '<tr class="rl-row-click" data-team="' + esc(d.t) + '">'
        + '<td class="rl-team-cell">' + logo + ' <strong>' + esc(d.t) + '</strong></td>'
        + trendCell(ytd, metric, false, 'YTD', false)
        + trendCell(l30, metric, false, 'L30', compFb && windowVal(d, metric, 'L30') == null)
        + trendCell(l14, metric, false, 'L14', compFb && windowVal(d, metric, 'L14') == null)
        + trendCell(l7, metric, false, 'L7', compFb && windowVal(d, metric, 'L7') == null)
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

  function trendCell(v, metric, inv, win, useYtdFallback) {
    var cls = 'num' + trendColHighlight(win);
    if (metric === 'pals' && win !== 'YTD') {
      return '<td class="' + cls + ' rl-na" title="PALS window data unavailable">—</td>';
    }
    if (metric === 'pitchfaced' && win !== 'YTD') {
      return '<td class="' + cls + ' rl-na" title="Pitch Score Faced window data unavailable">—</td>';
    }
    if (v == null || isNaN(v)) {
      if (useYtdFallback) {
        return '<td class="' + cls + ' rl-na-muted" title="Window uses OSI trend — component metrics show YTD">—</td>';
      }
      return '<td class="' + cls + ' rl-na" title="requires pipeline run">—</td>';
    }
    var suffix = useYtdFallback ? ' <span class="rl-ytd-tag">(YTD)</span>' : '';
    return '<td class="' + cls + '" style="color:' + mColor(v, inv, metricKey(metric)) + '">' + fmt(v) + suffix + '</td>';
  }

  function cell(v, metric, inv) {
    return trendCell(v, metric, inv, 'YTD', false);
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
        + '<span class="ca-pill-label">Context</span>'
        + [{ id: 'both', l: 'Full Game' }, { id: 'f5', l: 'F5' }].map(function(c) {
          var cur = global._rlSplitContext || 'both';
          return '<button type="button" class="ca-pill-btn' + (cur === c.id ? ' active' : '') + '" data-split-context="' + c.id + '">' + c.l + '</button>';
        }).join('')
        + '</div><div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Facing</span>'
        + [{ id: 'all', l: 'All' }, { id: 'sp', l: 'vs SP' }, { id: 'rp', l: 'vs Reliever' }].map(function(f) {
          var cur = global._rlSplitFacing || 'all';
          return '<button type="button" class="ca-pill-btn' + (cur === f.id ? ' active' : '') + '" data-split-facing="' + f.id + '">' + f.l + '</button>';
        }).join('')
        + '</div><div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Metric</span>'
        + ['osi', 'obr', 'rcv', 'abq', 'pals'].map(function(m) {
          return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-split-metric="' + m + '">' + m.toUpperCase() + '</button>';
        }).join('')
        + '</div>'
        : entity === 'sp' ? '<div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Metric</span>'
        + ['osiAllowed', 'abqAllowed', 'rcvAllowed', 'obrAllowed', 'pitchScore'].map(function(m) {
          var cur = global._rlSpSplitMetric || 'osiAllowed';
          var lbl = { osiAllowed: 'OSI Allowed', abqAllowed: 'ABQ Allowed', rcvAllowed: 'RCV Allowed', obrAllowed: 'OBR Allowed', pitchScore: 'Pitching Score' }[m];
          return '<button type="button" class="ca-pill-btn' + (cur === m ? ' active' : '') + '" data-sp-split-metric="' + m + '">' + lbl + '</button>';
        }).join('')
        + '</div><div class="rl-pill-row rl-pill-row--secondary"><span class="ca-pill-label">Split</span>'
        + ['overall', 'rhh', 'lhh', 'home', 'away', 'f5', 'full'].map(function(s) {
          var cur = global._rlSpSplitView || 'overall';
          var lbl = { overall: 'Overall', rhh: 'vs RHH', lhh: 'vs LHH', home: 'Home', away: 'Away', f5: 'F5', full: 'Full Outing' }[s];
          return '<button type="button" class="ca-pill-btn' + (cur === s ? ' active' : '') + '" data-sp-split-view="' + s + '">' + lbl + '</button>';
        }).join('')
        + '<button type="button" class="ca-pill-btn' + (global._rlSpSimpleView ? ' active' : '') + '" data-sp-simple-view="1">Simplified</button>'
        + '</div>'
        : entity === 'bp' ? '<div class="rl-pill-row rl-pill-row--secondary"><span class="ca-pill-label">Metric</span>'
        + [{ id: 'score', l: 'Avg Pitching Score' }, { id: 'woba', l: 'wOBA' }, { id: 'rcv', l: 'RCV Allowed' }, { id: 'obr', l: 'OBR Allowed' }, { id: 'hi', l: 'High Lev ERA' }, { id: 'med', l: 'Med Lev ERA' }].map(function(m) {
          var cur = global._rlBpMetric || 'score';
          return '<button type="button" class="ca-pill-btn' + (cur === m.id ? ' active' : '') + '" data-bp-metric="' + m.id + '">' + m.l + '</button>';
        }).join('')
        + '</div><div class="rl-pill-row rl-pill-row--secondary"><span class="ca-pill-label">Split</span>'
        + ['overall', 'rhh', 'lhh', 'home', 'away'].map(function(s) {
          var cur = global._rlBpSplit || 'overall';
          var lbl = { overall: 'Overall', rhh: 'vs RHH', lhh: 'vs LHH', home: 'Home', away: 'Away' }[s];
          return '<button type="button" class="ca-pill-btn' + (cur === s ? ' active' : '') + '" data-bp-split="' + s + '">' + lbl + '</button>';
        }).join('')
        + '<span class="ca-pill-label" style="margin-left:12px">Window</span>'
        + ['YTD', 'L30', 'L14', 'L7'].map(function(w) {
          var cur = global._rlBpWindow || 'YTD';
          return '<button type="button" class="ca-pill-btn' + (cur === w ? ' active' : '') + '" data-bp-window="' + w + '">' + w + '</button>';
        }).join('') + '</div>' : '');
    var confirm = document.getElementById('rlSplitsConfirm');
    if (confirm) {
      var entLbl = { team: 'Team Offense', sp: 'Starting Pitcher', bp: 'Bullpen' }[entity];
      confirm.textContent = 'Showing: ' + entLbl + ' \u00B7 ' + (entity === 'team' ? metric.toUpperCase() : 'OSI Allowed') + ' \u00B7 ' + (global._rlSplitFacing || 'all');
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
    mount.querySelectorAll('[data-split-facing]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitFacing = btn.getAttribute('data-split-facing');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-split-hand]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitHand = btn.getAttribute('data-split-hand');
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
    mount.querySelectorAll('[data-sp-split-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSpSplitView = btn.getAttribute('data-sp-split-view');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    var spSimple = mount.querySelector('[data-sp-simple-view]');
    if (spSimple) {
      spSimple.addEventListener('click', function() {
        global._rlSpSimpleView = !global._rlSpSimpleView;
        mountSplitsControls();
        renderSplitsTable();
      });
    }
    mount.querySelectorAll('[data-bp-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlBpSplit = btn.getAttribute('data-bp-split');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-bp-window]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlBpWindow = btn.getAttribute('data-bp-window');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-bp-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlBpMetric = btn.getAttribute('data-bp-metric');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) return;
    var LD = global.LIVE_DATA || {};
    console.log('[SPLITS] rendering team offense, SCO_YTD_R:', LD.scYtdR ? LD.scYtdR.length : 0, 'SCO_YTD_L:', LD.scYtdL ? LD.scYtdL.length : 0);
    RL.syncResearchGlobalsFromLiveData();
    ensureTrendState();
    var entity = global._rlSplitEntity || 'team';
    var metric = global._rlSplitMetric || 'osi';
    if (entity === 'team' && !(LD.scYtdR && LD.scYtdR.length) && !(LD.scYtdL && LD.scYtdL.length)) {
      mount.innerHTML = '<p class="rl-loading">Loading team offense data\u2026</p>';
      renderOnLiveDataReady(function() { renderSplitsTable(); }, 'rlSplitsTable');
      return;
    }
    mount.innerHTML = '<p class="rl-loading">Loading split data\u2026</p>';
    if (entity === 'team') {
      var mk = metricKey(metric);
      var useF5 = global._rlSplitContext === 'f5';
      var facing = global._rlSplitFacing || 'all';
      function valFor(row, m) {
        if (!row) return null;
        if (m === 'pals') return palsByTeam()[row.t];
        if (useF5 && m !== 'pals') return estimateF5Osi(row);
        return row[m] != null ? row[m] : row.osi;
      }
      function homeAwayMaps(homeRows, awayRows) {
        var h = {}, a = {};
        var aggH = aggregateBatterSplitsByTeam(homeRows || [], mk);
        var aggA = aggregateBatterSplitsByTeam(awayRows || [], mk);
        aggH.forEach(function(s) { h[s.t] = valFor(s, mk); });
        aggA.forEach(function(s) { a[s.t] = valFor(s, mk); });
        return { h: h, a: a };
      }
      function renderTeamTable(r, l, homeMap, awayMap, banner) {
        var mLabel = mk.toUpperCase();
        var rows = r.map(function(row) {
          var lrow = l.find(function(x) { return x.t === row.t; }) || {};
          return {
            t: row.t,
            rv: valFor(row, mk),
            lv: valFor(lrow, mk),
            home: homeMap[row.t],
            away: awayMap[row.t]
          };
        }).sort(function(a, b) { return (b.rv || 0) - (a.rv || 0); });
        mount.innerHTML = (banner || '') + '<div class="rl-table-wrap rl-splits-scroll"><table class="rl-table-premium"><thead><tr>'
          + '<th></th><th>Team</th><th>vs RHP ' + esc(mLabel) + '</th><th>vs LHP ' + esc(mLabel) + '</th>'
          + '<th>Home ' + esc(mLabel) + '</th><th>Away ' + esc(mLabel) + '</th><th>PALS</th>'
          + '</tr></thead><tbody>'
          + rows.map(function(row) {
            var logo = A ? A.teamLogoImg(row.t, 24) : '';
            var palsV = palsByTeam()[row.t];
            return '<tr class="rl-row-click" data-team="' + esc(row.t) + '">'
              + '<td>' + logo + '</td><td><strong>' + esc(row.t) + '</strong></td>'
              + '<td class="num" style="color:' + mColor(row.rv, false, mk) + '">' + fmt(row.rv) + '</td>'
              + '<td class="num" style="color:' + mColor(row.lv, false, mk) + '">' + fmt(row.lv) + '</td>'
              + '<td class="num" style="color:' + mColor(row.home, false, mk) + '">' + fmt(row.home) + '</td>'
              + '<td class="num" style="color:' + mColor(row.away, false, mk) + '">' + fmt(row.away) + '</td>'
              + '<td class="num" style="color:' + mColor(palsV, false, 'osi') + '">' + fmt(palsV) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        bindRowClicks(mount, 'team');
      }
      var r = (LD.scYtdR && LD.scYtdR.length) ? LD.scYtdR.map(function(d) { return Object.assign({}, d); }) : RL.getResearchTeamData('r');
      var l = (LD.scYtdL && LD.scYtdL.length) ? LD.scYtdL.map(function(d) { return Object.assign({}, d); }) : RL.getResearchTeamData('l');
      var banner = '';
      if (facing === 'sp') {
        if (LD.batterSplitsVsSP && LD.batterSplitsVsSP.length) {
          r = aggregateBatterSplitsByTeam(LD.batterSplitsVsSP, metric);
          l = r.slice();
        } else {
          banner = '<p class="rl-note" style="margin:0 0 10px">VS SP splits require pipeline run \u2014 showing All (vs RHP/LHP) data.</p>';
        }
      } else if (facing === 'rp') {
        if (LD.batterSplitsVsRP && LD.batterSplitsVsRP.length) {
          r = aggregateBatterSplitsByTeam(LD.batterSplitsVsRP, metric);
          l = r.slice();
        } else {
          banner = '<p class="rl-note" style="margin:0 0 10px">VS Reliever splits require pipeline run \u2014 showing All data.</p>';
        }
      }
      var maps = homeAwayMaps(LD.batterSplitsHome, LD.batterSplitsAway);
      renderTeamTable(r, l, maps.h, maps.a, banner);
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
      var lhh = u.vsLhhOsi != null ? u.vsLhhOsi : num(S.pickCol(u, 'osi_allowed_vs_lhh', 'vs_LHH_OSI_allowed'));
      var rhh = u.vsRhhOsi != null ? u.vsRhhOsi : num(S.pickCol(u, 'osi_allowed_vs_rhh', 'vs_RHH_OSI_allowed'));
      if (lhh == null) lhh = u.osiAllowed;
      if (rhh == null) rhh = u.osiAllowed;
      return {
        t: tk, lhh: lhh, rhh: rhh, osi: u.osiAllowed, abq: u.abqAllowed,
        rcv: u.rcvAllowed, obr: u.obrAllowed, woba: u.woba,
        score: S.bullpenPitchScore ? S.bullpenPitchScore(u) : u.bullpenScore,
        hi: u.hiLevEra, med: u.medLevEra, lo: u.loLevEra
      };
    }).sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
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
    if (document.querySelector('.ca-lab__header')) return;
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
