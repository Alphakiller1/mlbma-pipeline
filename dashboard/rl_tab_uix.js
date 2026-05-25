// v20260525d
/**
 * Research Lab tab UIX â€” trends heatmap, splits tables, compare enhancements.
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
    return v != null && !isNaN(v) ? Number(v).toFixed(1) : 'â€”';
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
    (global.LIVE_DATA && LIVE_DATA.pals || []).forEach(function(p) {
      var team = (p.t || p.Tm || p.team || '').toString().trim().toUpperCase();
      var val = p.PALS != null ? p.PALS : p.pals;
      if (val == null && S) val = num(S.pickCol(p, 'PALS', 'pals'));
      if (team && val != null && !isNaN(val)) map[team] = parseFloat(val);
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
    (global.LIVE_DATA && LIVE_DATA.pals || []).forEach(function(p) {
      var team = (p.t || p.Tm || p.team || '').toString().trim().toUpperCase();
      if (!team) return;
      var xfip = parseFloat(p.avg_xFIP_faced);
      if (isNaN(xfip) && S) xfip = num(S.pickCol(p, 'avg_xFIP_faced', 'Avg xFIP Faced'));
      if (!isNaN(xfip)) {
        map[team] = Math.max(0, Math.min(100, 100 - (xfip - 3.0) * 25));
      }
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

  function getActualWindowVal(d, metric, win) {
    var k = metricKey(metric);
    if (metric === 'pals' || metric === 'pitchfaced') return null;
    if (win === 'YTD') return ytdMetricVal(d, metric);
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

  function windowVal(d, metric, win) {
    if (win === 'YTD') return ytdMetricVal(d, metric);
    var actual = getActualWindowVal(d, metric, win);
    if (actual != null && !isNaN(actual)) return actual;
    return ytdMetricVal(d, metric);
  }

  function windowValIsFallback(d, metric, win) {
    if (win === 'YTD') return false;
    var actual = getActualWindowVal(d, metric, win);
    if (actual != null && !isNaN(actual)) return false;
    var ytd = ytdMetricVal(d, metric);
    return ytd != null && !isNaN(ytd);
  }

  function trendsYtdFallbackBannerHtml() {
    var hasWin = (global.SCO_L30_B && global.SCO_L30_B.length >= 10)
      || metricHasWindowColumns('osi');
    if (hasWin) return '';
    return '<div id="rlTrendWindowBanner" class="rl-window-banner hub-banner hub-banner--window show" style="display:block;margin:0 0 12px">'
      + 'L30/L14/L7 window splits require FanGraphs time-window scraping \u2014 showing YTD baseline values</div>';
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
    return trendsYtdFallbackBannerHtml();
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
      var t = S.teamKey ? S.teamKey(S.pickCol(row, ['team', 'Tm', 'Team', 'team_abbr', 't']))
        : String(row.t || row.Tm || row.team || row.Team || row.team_abbr || '').trim().toUpperCase();
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


  function syncTrendStateFromGlobal() {
    var st = global.STATE || {};
    if (st.split === 'home' || st.split === 'away') {
      global.STATE.rlTrendLoc = st.split;
      global.STATE.rlTrendSplit = 'b';
      global.STATE.rlHandedness = 'b';
    } else if (st.split === 'r' || st.split === 'l' || st.split === 'b') {
      global.STATE.rlTrendSplit = st.split;
      global.STATE.rlHandedness = st.split;
    }
  }

  function setTrendPillActive(mount, attr, activeBtn) {
    mount.querySelectorAll('[' + attr + ']').forEach(function(b) {
      b.classList.toggle('active', b === activeBtn);
    });
  }

  function mountTrendControls() {
    var mount = document.getElementById('rlTrendControlsMount');
    if (!mount) return;
    ensureTrendState();
    syncTrendStateFromGlobal();
    var metric = global.STATE.rlTrendMetric;
    var split = global.STATE.rlTrendSplit || global.STATE.rlHandedness || 'b';
    var loc = global.STATE.rlTrendLoc || 'b';
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
        return '<button type="button" class="ca-pill-btn' + (split === s.id ? ' active' : '') + '" data-trend-split="' + s.id + '" data-trend-hand="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div><div class="rl-pill-row">'
      + '<span class="ca-pill-label">Location</span>'
      + [{ id: 'b', l: 'Both' }, { id: 'home', l: 'Home' }, { id: 'away', l: 'Away' }].map(function(s) {
        return '<button type="button" class="ca-pill-btn' + (loc === s.id ? ' active' : '') + '" data-trend-loc="' + s.id + '" data-trend-location="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div></div>';
    mount.querySelectorAll('[data-trend-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendMetric = btn.getAttribute('data-trend-metric');
        console.log('[TRENDS] metric:', global.STATE.rlTrendMetric);
        setTrendPillActive(mount, 'data-trend-metric', btn);
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
    function bindHandPills(sel) {
      mount.querySelectorAll(sel).forEach(function(btn) {
        btn.addEventListener('click', function() {
          var hand = btn.dataset.trendHand || btn.dataset.trendSplit;
          global.STATE.rlHandedness = hand;
          global.STATE.rlTrendSplit = hand;
          setTrendPillActive(mount, 'data-trend-split', btn);
          renderTrendHeatmap();
          renderTrendSummary();
        });
      });
    }
    bindHandPills('[data-trend-split]');
    function bindLocPills(sel) {
      mount.querySelectorAll(sel).forEach(function(btn) {
        btn.addEventListener('click', function() {
          global.STATE.rlTrendLoc = btn.getAttribute('data-trend-loc') || btn.getAttribute('data-trend-location');
          console.log('[TRENDS] location:', global.STATE.rlTrendLoc);
          setTrendPillActive(mount, 'data-trend-loc', btn);
          renderTrendHeatmap();
        });
      });
    }
    bindLocPills('[data-trend-loc]');
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('trendMap');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    ensureTrendState();
    syncTrendStateFromGlobal();
    var metric = global.STATE.rlTrendMetric || 'osi';
    var rawHand = global.STATE.rlHandedness || global.STATE.rlTrendSplit || 'b';
    global.STATE.rlHandedness = rawHand;
    global.STATE.rlTrendSplit = rawHand;
    var loc = global.STATE.rlTrendLoc || 'b';
    var LD = global.LIVE_DATA || {};

    if (!global._rlHomeSplitLogged && LD.batterSplitsHome && LD.batterSplitsHome[0]) {
      global._rlHomeSplitLogged = true;
      console.log('[TRENDS] batterSplitsHome first row:', JSON.stringify(LD.batterSplitsHome[0]));
    }

    var handKey = rawHand === 'r' ? 'r' : rawHand === 'l' ? 'l' : 'both';
    var rows = RL.getResearchTeamData(handKey);
    if (loc === 'home' && LD.batterSplitsHome && LD.batterSplitsHome.length) {
      rows = aggregateBatterSplitsByTeam(LD.batterSplitsHome, metric);
    } else if (loc === 'away' && LD.batterSplitsAway && LD.batterSplitsAway.length) {
      rows = aggregateBatterSplitsByTeam(LD.batterSplitsAway, metric);
    }
    console.log('[TRENDS] handKey:', handKey, 'rows:', rows ? rows.length : 0, 'location:', loc);
    if (!rows.length) {
      if (RL.syncResearchGlobalsFromLiveData) RL.syncResearchGlobalsFromLiveData();
      rows = RL.getResearchTeamData(handKey);
    }
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">Loading team data\u2026</p>';
      renderOnLiveDataReady(function() { renderTrendHeatmap(); }, 'trendHeatmap');
      return;
    }

    var sorted = rows.slice().sort(function(a, b) {
      var bv = windowVal(b, metric, 'L30') || 0;
      var av = windowVal(a, metric, 'L30') || 0;
      return bv - av;
    });

    var locBanner = '';
    if (loc === 'home' && (!LD.batterSplitsHome || !LD.batterSplitsHome.length)) {
      locBanner = '<div class="rl-window-banner hub-banner hub-banner--location show" style="display:block;margin:0 0 12px">'
        + 'Home/Away splits require batter splits pipeline step \u2014 showing handedness YTD data.</div>';
    } else if (loc === 'away' && (!LD.batterSplitsAway || !LD.batterSplitsAway.length)) {
      locBanner = '<div class="rl-window-banner hub-banner hub-banner--location show" style="display:block;margin:0 0 12px">'
        + 'Home/Away splits require batter splits pipeline step \u2014 showing handedness YTD data.</div>';
    }

    var html = trendsWindowBannerHtml() + trendsComponentBannerHtml(metric) + trendsSplitBannerHtml() + locBanner
      + '<table class="rl-table-premium rl-trend-table"><thead><tr>'
      + '<th>Team</th>'
      + '<th class="' + trendColHighlight('L30').trim() + '">L30</th>'
      + '<th class="' + trendColHighlight('L14').trim() + '">L14</th>'
      + '<th class="' + trendColHighlight('L7').trim() + '">L7</th>'
      + '<th>Reliability</th>'
      + '</tr></thead><tbody>';
    sorted.forEach(function(d) {
      var l30 = windowVal(d, metric, 'L30');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      var rel = reliabilityForRow(d, metric);
      var logo = A ? A.teamLogoImg(d.t, 22) : '';
      html += '<tr class="rl-row-click" data-team="' + esc(d.t) + '">'
        + '<td class="rl-team-cell">' + logo + ' <strong>' + esc(d.t) + '</strong></td>'
        + trendCell(l30, metric, false, 'L30', windowValIsFallback(d, metric, 'L30'))
        + trendCell(l14, metric, false, 'L14', windowValIsFallback(d, metric, 'L14'))
        + trendCell(l7, metric, false, 'L7', windowValIsFallback(d, metric, 'L7'))
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
    if (v == null || isNaN(v)) {
      return '<td class="' + cls + ' rl-na-muted">\u2014</td>';
    }
    var suffix = useYtdFallback ? ' <span class="rl-ytd-tag ytd-tag">YTD</span>' : '';
    return '<td class="' + cls + '" style="color:' + mColor(v, inv, metricKey(metric)) + '">' + fmt(v) + suffix + '</td>';
  }

  function cell(v, metric, inv) {
    return trendCell(v, metric, inv, 'YTD', false);
  }

  function deltaCell(v) {
    if (v == null || isNaN(v)) return '<td class="num">â€”</td>';
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
      + trendCard('Most Stable', stable, function() { return 'Â±3'; });
  }

  function trendCard(title, items, valueFn) {
    var meta = {
      'Biggest Risers': { variant: 'risers', subtitle: 'L14 improvement vs YTD baseline' },
      'Biggest Fallers': { variant: 'fallers', subtitle: 'L14 decline vs YTD baseline' },
      'Hot L7 Spike': { variant: 'hot', subtitle: 'Recent L7 surge â€” may be noisy' },
      'Most Stable': { variant: 'stable', subtitle: 'All windows within Â±3 of YTD' }
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
        + '<span>No signal yet â€” waiting for pipeline data</span></div>';
    }
    return '<div class="rl-summary-card rl-summary-card--' + meta.variant + '">'
      + '<div class="rl-summary-head"><span class="rl-summary-icon" aria-hidden="true"></span>'
      + '<div><div class="rl-summary-label">' + esc(title) + '</div>'
      + '<div class="rl-summary-sub">' + esc(meta.subtitle) + '</div></div></div>'
      + body + '</div>';
  }

  /* ========== SPLITS TAB (FanGraphs-style unified state) ========== */

  var SPLITS_STATE = global.SPLITS_STATE || {
    entity: 'team',
    statGroup: 'created',
    split: 'b',
    window: 'ytd',
    minPA: 50,
    search: '',
    sortKey: null,
    sortDir: 'desc'
  };
  global.SPLITS_STATE = SPLITS_STATE;

  function activateSplitsPill(clicked, groupSelector) {
    document.querySelectorAll(groupSelector).forEach(function(p) {
      p.classList.remove('splits-pill-active');
    });
    clicked.classList.add('splits-pill-active');
  }

  function migrateSplitsStateFromLegacy() {
    var e = global._rlSplitEntity || 'team';
    SPLITS_STATE.entity = (e === 'bp') ? 'bullpen' : e;
    if (global._rlSplitMetric) {
      var m = global._rlSplitMetric;
      SPLITS_STATE.statGroup = (m === 'pals') ? 'created' : (['osi', 'abq', 'rcv', 'obr'].indexOf(m) >= 0 ? 'created' : SPLITS_STATE.statGroup);
    }
    if (global._rlSplitContext === 'f5') SPLITS_STATE.split = 'f5';
    else if (global._rlSplitFacing === 'sp') SPLITS_STATE.statGroup = 'vsSP';
    else if (global._rlSplitFacing === 'rp') SPLITS_STATE.statGroup = 'vsRP';
    SPLITS_STATE.search = global._rlSpSearchQuery || global._rlBpSearch || SPLITS_STATE.search || '';
    SPLITS_STATE.minPA = SPLITS_STATE.minPA || 50;
  }

  function syncLegacySplitsGlobals() {
    global._rlSplitEntity = SPLITS_STATE.entity === 'bullpen' ? 'bp' : SPLITS_STATE.entity;
    global._rlSplitMetric = SPLITS_STATE.statGroup === 'created' ? 'osi' : global._rlSplitMetric;
    global.STATE = global.STATE || {};
    global.STATE.rlSplitMetric = SPLITS_STATE.statGroup;
  }

  function buildSplitsControlsHTML() {
    return '<div class="splits-controls">'
      + '<div class="splits-control-row splits-entity-row">'
      + '<span class="splits-control-label">VIEW</span>'
      + '<div class="splits-pill-group">'
      + '<button type="button" class="splits-pill splits-pill-active" data-splits-entity="team">Team Offense</button>'
      + '<button type="button" class="splits-pill" data-splits-entity="sp">Starting Pitchers</button>'
      + '<button type="button" class="splits-pill" data-splits-entity="bullpen">Bullpen</button>'
      + '</div></div>'
      + '<div class="splits-control-row splits-statgroup-row">'
      + '<span class="splits-control-label">STATS</span>'
      + '<div class="splits-pill-group" id="splitsStatGroupPills"></div>'
      + '</div>'
      + '<div class="splits-control-row splits-split-row">'
      + '<span class="splits-control-label">SPLIT</span>'
      + '<div class="splits-pill-group" id="splitsSplitPills"></div>'
      + '</div>'
      + '<div class="splits-control-row splits-window-row">'
      + '<span class="splits-control-label">WINDOW</span>'
      + '<div class="splits-pill-group">'
      + '<button type="button" class="splits-pill splits-pill-active" data-splits-window="ytd">YTD</button>'
      + '<button type="button" class="splits-pill" data-splits-window="l30">L30</button>'
      + '<button type="button" class="splits-pill" data-splits-window="l14">L14</button>'
      + '<button type="button" class="splits-pill" data-splits-window="l7">L7</button>'
      + '</div></div>'
      + '<div class="splits-control-row splits-filter-row">'
      + '<span class="splits-control-label">FILTER</span>'
      + '<input type="search" id="splitsSearch" placeholder="Search team or pitcher..." class="splits-search">'
      + '<label class="splits-minpa-label">Min PA <input type="number" id="splitsMinPA" value="50" min="0" max="500" class="splits-minpa-input"></label>'
      + '</div>'
      + '<div class="splits-confirm" id="splitsConfirmLine"></div>'
      + '<div class="splits-banner" id="splitsBanner" style="display:none"></div>'
      + '</div>';
  }

  var SPLITS_STAT_GROUPS = {
    team: [
      { val: 'standard', label: 'Standard' },
      { val: 'advanced', label: 'Advanced' },
      { val: 'created', label: 'Created Metrics' },
      { val: 'vsSP', label: 'vs SP' },
      { val: 'vsRP', label: 'vs Reliever' }
    ],
    sp: [
      { val: 'standard', label: 'Standard' },
      { val: 'advanced', label: 'Advanced' },
      { val: 'allowed', label: 'Metrics Allowed' },
      { val: 'splits', label: 'Splits Detail' }
    ],
    bullpen: [
      { val: 'standard', label: 'Standard' },
      { val: 'allowed', label: 'Metrics Allowed' },
      { val: 'usage', label: 'Usage' }
    ]
  };

  var SPLITS_SPLIT_CONTEXTS = {
    team: [
      { val: 'b', label: 'Both' }, { val: 'r', label: 'vs RHP' }, { val: 'l', label: 'vs LHP' },
      { val: 'home', label: 'Home' }, { val: 'away', label: 'Away' }, { val: 'f5', label: 'F5' }
    ],
    sp: [
      { val: 'overall', label: 'Overall' }, { val: 'vsRHH', label: 'vs RHH' }, { val: 'vsLHH', label: 'vs LHH' },
      { val: 'home', label: 'Home' }, { val: 'away', label: 'Away' }, { val: 'f5', label: 'F5' }, { val: 'full', label: 'Full Outing' }
    ],
    bullpen: [
      { val: 'overall', label: 'Overall' }, { val: 'vsRHH', label: 'vs RHH' }, { val: 'vsLHH', label: 'vs LHH' },
      { val: 'home', label: 'Home' }, { val: 'away', label: 'Away' }
    ]
  };

  function rebuildDynamicSplitsPills() {
    var entity = SPLITS_STATE.entity;
    var groups = SPLITS_STAT_GROUPS[entity] || [];
    var contexts = SPLITS_SPLIT_CONTEXTS[entity] || [];
    if (!groups.some(function(g) { return g.val === SPLITS_STATE.statGroup; })) {
      SPLITS_STATE.statGroup = groups[0] ? groups[0].val : 'created';
    }
    if (!contexts.some(function(s) { return s.val === SPLITS_STATE.split; })) {
      SPLITS_STATE.split = contexts[0] ? contexts[0].val : 'b';
    }

    var sgMount = document.getElementById('splitsStatGroupPills');
    if (sgMount) {
      sgMount.innerHTML = groups.map(function(g) {
        var active = g.val === SPLITS_STATE.statGroup ? ' splits-pill-active' : '';
        return '<button type="button" class="splits-pill' + active + '" data-splits-statgroup="' + g.val + '">' + g.label + '</button>';
      }).join('');
      sgMount.querySelectorAll('[data-splits-statgroup]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activateSplitsPill(this, '[data-splits-statgroup]');
          SPLITS_STATE.statGroup = this.dataset.splitsStatgroup;
          renderSplitsTable();
        });
      });
    }

    var spMount = document.getElementById('splitsSplitPills');
    if (spMount) {
      spMount.innerHTML = contexts.map(function(s) {
        var active = s.val === SPLITS_STATE.split ? ' splits-pill-active' : '';
        return '<button type="button" class="splits-pill' + active + '" data-splits-split="' + s.val + '">' + s.label + '</button>';
      }).join('');
      spMount.querySelectorAll('[data-splits-split]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activateSplitsPill(this, '[data-splits-split]');
          SPLITS_STATE.split = this.dataset.splitsSplit;
          renderSplitsTable();
        });
      });
    }

    document.querySelectorAll('[data-splits-window]').forEach(function(btn) {
      btn.classList.toggle('splits-pill-active', btn.dataset.splitsWindow === SPLITS_STATE.window);
    });
    document.querySelectorAll('[data-splits-entity]').forEach(function(btn) {
      var ent = btn.dataset.splitsEntity;
      btn.classList.toggle('splits-pill-active', ent === SPLITS_STATE.entity);
    });
  }

  function bindSplitsControlsOnce() {
    var root = document.getElementById('rlSplitsControlMount');
    if (!root || root.dataset.splitsBound === '1') return;
    root.dataset.splitsBound = '1';

    root.querySelectorAll('[data-splits-entity]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activateSplitsPill(this, '[data-splits-entity]');
        SPLITS_STATE.entity = this.dataset.splitsEntity;
        var sg0 = SPLITS_STAT_GROUPS[SPLITS_STATE.entity];
        SPLITS_STATE.statGroup = sg0 && sg0[0] ? sg0[0].val : 'created';
        SPLITS_STATE.split = SPLITS_SPLIT_CONTEXTS[SPLITS_STATE.entity][0].val;
        rebuildDynamicSplitsPills();
        renderSplitsTable();
      });
    });

    root.querySelectorAll('[data-splits-window]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        activateSplitsPill(this, '[data-splits-window]');
        SPLITS_STATE.window = this.dataset.splitsWindow;
        renderSplitsTable();
      });
    });

    var searchEl = document.getElementById('splitsSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        SPLITS_STATE.search = this.value.toLowerCase();
        renderSplitsTable();
      });
    }

    var minPaEl = document.getElementById('splitsMinPA');
    if (minPaEl) {
      minPaEl.addEventListener('change', function() {
        SPLITS_STATE.minPA = parseInt(this.value, 10) || 0;
        renderSplitsTable();
      });
    }
  }

  function updateSplitsConfirmLine() {
    var el = document.getElementById('splitsConfirmLine');
    var legacy = document.getElementById('rlSplitsConfirm');
    var entityLabel = { team: 'Team Offense', sp: 'Starting Pitchers', bullpen: 'Bullpen' }[SPLITS_STATE.entity] || SPLITS_STATE.entity;
    var sg = (SPLITS_STAT_GROUPS[SPLITS_STATE.entity] || []).find(function(g) { return g.val === SPLITS_STATE.statGroup; });
    var sp = (SPLITS_SPLIT_CONTEXTS[SPLITS_STATE.entity] || []).find(function(s) { return s.val === SPLITS_STATE.split; });
    var line = 'Showing: ' + entityLabel + ' \u00B7 ' + (sg ? sg.label : SPLITS_STATE.statGroup)
      + ' \u00B7 ' + (sp ? sp.label : SPLITS_STATE.split) + ' \u00B7 ' + SPLITS_STATE.window.toUpperCase()
      + ' \u00B7 Min PA: ' + SPLITS_STATE.minPA;
    if (el) el.textContent = line;
    if (legacy) legacy.textContent = line;
  }

  function updateSplitsBanner() {
    var banner = document.getElementById('splitsBanner');
    if (!banner) return;
    var win = SPLITS_STATE.window.toUpperCase();
    var hasWin = win === 'YTD' || (global.SCO_L30_B && global.SCO_L30_B.length >= 10) || metricHasWindowColumns('osi');
    if (win !== 'YTD' && !hasWin) {
      banner.textContent = win + ' window data requires pipeline time-window enhancement \u2014 showing YTD values';
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  function aggregateByTeam(rows) {
    if (!rows || !rows.length) return [];
    var map = {};
    rows.forEach(function(row) {
      var team = String(row.team || row.Team || row.team_abbr || row.Tm || row.t || '').trim().toUpperCase();
      if (!team) return;
      if (!map[team]) map[team] = { t: team, osiSum: 0, abqSum: 0, rcvSum: 0, obrSum: 0, wobaSum: 0, slgSum: 0, wrcSum: 0, count: 0, pa: 0 };
      var pa = num(S.pickCol(row, ['PA', 'pa'])) || 1;
      map[team].pa += pa;
      map[team].osiSum += parseFloat(row.osi || row.OSI || 0);
      map[team].abqSum += parseFloat(row.abq || row.ABQ || 0);
      map[team].rcvSum += parseFloat(row.rcv || row.RCV || 0);
      map[team].obrSum += parseFloat(row.obr || row.OBR || 0);
      map[team].wobaSum += parseFloat(row.woba || row.wOBA || 0);
      map[team].slgSum += parseFloat(row.slg || row.SLG || 0);
      map[team].wrcSum += parseFloat(row.wrc || row['wRC+'] || row.wRC || 0);
      map[team].count++;
    });
    return Object.values(map).map(function(d) {
      if (SPLITS_STATE.minPA > 0 && d.pa < SPLITS_STATE.minPA) return null;
      return {
        t: d.t,
        pa: d.pa,
        osi: d.count ? d.osiSum / d.count : null,
        abq: d.count ? d.abqSum / d.count : null,
        rcv: d.count ? d.rcvSum / d.count : null,
        obr: d.count ? d.obrSum / d.count : null,
        woba: d.count ? d.wobaSum / d.count : null,
        slg: d.count ? d.slgSum / d.count : null,
        wrc: d.count ? d.wrcSum / d.count : null,
        avg: null, obp: null, ops: null,
        bbpct: null, kpct: null, iso: null, xwoba: null
      };
    }).filter(Boolean);
  }

  function buildBlendedRows(rhp, lhp) {
    var lhpMap = {};
    lhp.forEach(function(r) { lhpMap[r.t] = r; });
    return rhp.map(function(r) {
      var l = lhpMap[r.t] || r;
      return {
        t: r.t,
        osi: ((r.osi || 0) + (l.osi || 0)) / 2,
        abq: ((r.abq || 0) + (l.abq || 0)) / 2,
        rcv: ((r.rcv || 0) + (l.rcv || 0)) / 2,
        obr: ((r.obr || 0) + (l.obr || 0)) / 2,
        woba: r.woba != null && l.woba != null ? (r.woba + l.woba) / 2 : (r.woba || l.woba),
        slg: r.slg != null && l.slg != null ? (r.slg + l.slg) / 2 : (r.slg || l.slg),
        wrc: r.wrc != null && l.wrc != null ? (r.wrc + l.wrc) / 2 : (r.wrc || l.wrc),
        xwoba: r.xwoba != null && l.xwoba != null ? (r.xwoba + l.xwoba) / 2 : (r.xwoba || l.xwoba),
        projOSI: r.projOSI != null && l.projOSI != null ? (r.projOSI + l.projOSI) / 2 : (r.projOSI || l.projOSI),
        ppGap: (r.ppGap != null ? r.ppGap : (r.abq - r.rcv)) != null && (l.ppGap != null ? l.ppGap : (l.abq - l.rcv)) != null
          ? ((r.ppGap != null ? r.ppGap : (r.abq - r.rcv)) + (l.ppGap != null ? l.ppGap : (l.abq - l.rcv))) / 2
          : (r.ppGap != null ? r.ppGap : (r.abq - r.rcv))
      };
    });
  }

  function enrichTeamFacingRows(rows, LD) {
    var spMap = {}, rpMap = {};
    aggregateByTeam(LD.batterSplitsVsSP || []).forEach(function(r) { spMap[r.t] = r; });
    aggregateByTeam(LD.batterSplitsVsRP || []).forEach(function(r) { rpMap[r.t] = r; });
    return rows.map(function(r) {
      var sp = spMap[r.t] || {};
      var rp = rpMap[r.t] || {};
      return Object.assign({}, r, {
        vsSP_osi: sp.osi, vsSP_obr: sp.obr, vsSP_rcv: sp.rcv, vsSP_abq: sp.abq,
        vsRP_osi: rp.osi, vsRP_obr: rp.obr, vsRP_rcv: rp.rcv, vsRP_abq: rp.abq
      });
    });
  }

  function getSplitsColumns(statGroup, entity) {
    if (entity === 'team') {
      if (statGroup === 'standard') return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'wrc', label: 'wRC+', color: true, leagueAvg: 100 },
        { key: 'woba', label: 'wOBA', color: true },
        { key: 'slg', label: 'SLG', color: true }
      ];
      if (statGroup === 'advanced') return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'xwoba', label: 'xwOBA', color: true },
        { key: 'woba', label: 'wOBA', color: true },
        { key: 'slg', label: 'SLG', color: true }
      ];
      if (statGroup === 'created') return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'osi', label: 'OSI', color: true },
        { key: 'obr', label: 'OBR', color: true },
        { key: 'rcv', label: 'RCV', color: true },
        { key: 'abq', label: 'ABQ', color: true },
        { key: 'projOSI', label: 'ProjOSI', color: true },
        { key: 'ppGap', label: 'PP-Gap', ppgap: true },
        { key: 'pals', label: 'PALS', color: true }
      ];
      if (statGroup === 'vsSP') return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'vsSP_osi', label: 'OSI vs SP', color: true },
        { key: 'vsSP_obr', label: 'OBR vs SP', color: true },
        { key: 'vsSP_rcv', label: 'RCV vs SP', color: true },
        { key: 'vsSP_abq', label: 'ABQ vs SP', color: true }
      ];
      if (statGroup === 'vsRP') return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'vsRP_osi', label: 'OSI vs RP', color: true },
        { key: 'vsRP_obr', label: 'OBR vs RP', color: true },
        { key: 'vsRP_rcv', label: 'RCV vs RP', color: true },
        { key: 'vsRP_abq', label: 'ABQ vs RP', color: true }
      ];
    }
    if (entity === 'sp') {
      if (statGroup === 'standard') return [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'pitcher_hand', label: 'Hand', type: 'hand' },
        { key: 'ERA', label: 'ERA', invert: true, color: true },
        { key: 'K_pct', label: 'K%', color: true },
        { key: 'BB_pct', label: 'BB%', invert: true },
        { key: 'HR9', label: 'HR/9', invert: true }
      ];
      if (statGroup === 'allowed') return [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'PitchScore', label: 'Pitch Score', color: true },
        { key: 'OSI_allowed', label: 'OSI Allowed', invert: true, color: true },
        { key: 'OBR_allowed', label: 'OBR Allowed', invert: true, color: true },
        { key: 'RCV_allowed', label: 'RCV Allowed', invert: true, color: true },
        { key: 'ABQ_allowed', label: 'ABQ Allowed', invert: true, color: true }
      ];
    }
    if (entity === 'bullpen') {
      return [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'bullpenScore', label: 'BP Score', color: true },
        { key: 'osiAllowed', label: 'OSI Allowed', invert: true, color: true },
        { key: 'rcvAllowed', label: 'RCV Allowed', invert: true, color: true },
        { key: 'obrAllowed', label: 'OBR Allowed', invert: true, color: true },
        { key: 'hiLevEra', label: 'Hi Lev ERA', invert: true, color: true },
        { key: 'loLevEra', label: 'Lo Lev ERA', invert: true, color: true }
      ];
    }
    return [{ key: 't', label: 'Team', type: 'team' }];
  }

  function splitsCellColor(val, col) {
    if (val == null || isNaN(val)) return '#71717A';
    if (col.ppgap) {
      if (val > 0) return '#2DD4BF';
      if (val < 0) return '#FB7185';
      return '#6B7280';
    }
    if (!col.color || !A) return '#D1D5DB';
    if (col.leagueAvg != null) {
      var z = (val - col.leagueAvg) / 15;
      return A.metricColor(Math.max(0, Math.min(100, 50 + z * 25)), 'osi', false);
    }
    return A.metricColor(val, col.key, !!col.invert);
  }

  function formatSplitsCell(val, col) {
    if (val == null || isNaN(val)) return '\u2014';
    var num = Number(val);
    if (col.key === 'ERA' || col.key === 'hiLevEra' || col.key === 'loLevEra' || col.key === 'eraOverall') return num.toFixed(2);
    if (col.key.indexOf('pct') >= 0 || col.key.indexOf('Pct') >= 0 || col.key === 'K_pct' || col.key === 'BB_pct') {
      return (num < 1 ? num * 100 : num).toFixed(1) + '%';
    }
    if (col.key === 'woba' || col.key === 'xwoba' || col.key === 'avg' || col.key === 'obp' || col.key === 'slg') {
      return num.toFixed(3);
    }
    if (col.key === 'bullpenScore') return num.toFixed(0);
    return num.toFixed(1);
  }

  function buildSplitsTable(rows, columns) {
    if (!rows.length) return '<div class="splits-empty">No data matches current filters.</div>';
    var headerCells = columns.map(function(col) {
      if (col.type === 'team' || col.type === 'pitcher') {
        return '<th class="splits-th splits-th-name">' + esc(col.label) + '</th>';
      }
      return '<th class="splits-th splits-th-metric" data-sort-key="' + esc(col.key) + '">' + esc(col.label) + ' <span class="sort-arrow">\u2195</span></th>';
    }).join('');

    var bodyRows = rows.map(function(row) {
      var cells = columns.map(function(col) {
        if (col.type === 'team') {
          return '<td class="splits-td splits-td-team rl-row-click" data-team="' + esc(row.t) + '">'
            + (A ? A.teamLogoImg(row.t, 22) : '') + '<span class="splits-team-abbr">' + esc(row.t || '') + '</span></td>';
        }
        if (col.type === 'pitcher') {
          var pn = row.pitcher_name || '';
          return '<td class="splits-td splits-td-pitcher rl-row-click" data-pitcher="' + esc(pn) + '">'
            + (A ? A.pitcherAvatar({ pitcher_name: pn, pitcher_id: row.pitcher_id }, { crop: 'compare', className: 'rl-av-28' }) : '')
            + '<span class="splits-pitcher-name">' + esc(pn) + '</span></td>';
        }
        if (col.type === 'teamBadge') {
          return '<td class="splits-td">' + (A ? A.teamLogoImg(row.pitcher_team || row.t, 18) : '') + '</td>';
        }
        if (col.type === 'hand') {
          var h = String(row.pitcher_hand || '?').charAt(0);
          var cls = h === 'L' ? 'hand-l' : 'hand-r';
          return '<td class="splits-td"><span class="hand-pill ' + cls + '">' + esc(h) + '</span></td>';
        }
        var v = row[col.key];
        if (v == null || v === '' || isNaN(v)) return '<td class="splits-td splits-td-dash">\u2014</td>';
        var color = splitsCellColor(parseFloat(v), col);
        return '<td class="splits-td splits-td-num" style="color:' + color + ';font-weight:600">' + formatSplitsCell(v, col) + '</td>';
      }).join('');
      return '<tr class="splits-tr">' + cells + '</tr>';
    }).join('');

    return '<table class="splits-table"><thead><tr class="splits-thead-tr">' + headerCells + '</tr></thead><tbody>' + bodyRows + '</tbody></table>';
  }

  function bindSplitsTableSort(mount) {
    mount.querySelectorAll('[data-sort-key]').forEach(function(th) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-sort-key');
        if (SPLITS_STATE.sortKey === key) {
          SPLITS_STATE.sortDir = SPLITS_STATE.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          SPLITS_STATE.sortKey = key;
          SPLITS_STATE.sortDir = 'desc';
        }
        renderSplitsTable();
      });
    });
  }

  function bindSplitsRowClicks(mount, kind) {
    mount.querySelectorAll('.rl-row-click[data-team]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var t = el.getAttribute('data-team');
        if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
      });
    });
    mount.querySelectorAll('.rl-row-click[data-pitcher]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var p = el.getAttribute('data-pitcher');
        if (p) global.location.href = 'pitcher_profile.html?pitcher=' + encodeURIComponent(p);
      });
    });
  }

  function spRowFromProfile(p) {
    var m = S && S.spProfileMetrics ? S.spProfileMetrics(p) : {};
    var kPct = m.kPct, bbPct = m.bbPct, hr9 = m.hr9;
    var ps = m.pitchScore;
    if (ps == null && S && S.computePitchScoreFromRates) {
      ps = S.computePitchScoreFromRates(kPct, bbPct, hr9, null);
    }
    return {
      pitcher_name: S.pickCol(p, ['pitcher_name', 'Name', 'Pitcher']),
      pitcher_team: S.pickCol(p, ['pitcher_team', 'Team', 'Tm']),
      pitcher_hand: String(S.pickCol(p, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0),
      pitcher_id: S.pickCol(p, ['pitcher_id', 'playerId']),
      ERA: m.era,
      K_pct: kPct,
      BB_pct: bbPct,
      HR9: hr9,
      avg_IP: num(S.pickCol(p, ['IP', 'ip', 'avg_IP'])),
      PitchScore: ps,
      OSI_allowed: m.osiAllowed,
      OBR_allowed: m.obrAllowed,
      RCV_allowed: m.rcvAllowed,
      ABQ_allowed: m.abqAllowed
    };
  }

  function renderTeamSplits(mount) {
    var LD = global.LIVE_DATA || {};
    var rhpRows = LD.scYtdR || (RL.getResearchTeamData ? RL.getResearchTeamData('r') : []) || [];
    var lhpRows = LD.scYtdL || (RL.getResearchTeamData ? RL.getResearchTeamData('l') : []) || [];
    if (!rhpRows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading team data\u2026</div>';
      renderOnLiveDataReady(function() { renderSplitsTable(); }, 'rlSplits');
      return;
    }
    var baseRows;
    if (SPLITS_STATE.split === 'r') baseRows = rhpRows.slice();
    else if (SPLITS_STATE.split === 'l') baseRows = lhpRows.slice();
    else if (SPLITS_STATE.split === 'home') baseRows = aggregateByTeam(LD.batterSplitsHome || []);
    else if (SPLITS_STATE.split === 'away') baseRows = aggregateByTeam(LD.batterSplitsAway || []);
    else if (SPLITS_STATE.split === 'f5') {
      baseRows = rhpRows.map(function(r) {
        var o = Object.assign({}, r);
        o.osi = estimateF5Osi(r);
        return o;
      });
    } else baseRows = buildBlendedRows(rhpRows, lhpRows);

    if (SPLITS_STATE.statGroup === 'vsSP' || SPLITS_STATE.statGroup === 'vsRP') {
      baseRows = enrichTeamFacingRows(baseRows, LD);
    }

    var palsMap = palsByTeam();
    var pitchMap = pitchingScoreFacedByTeam();
    baseRows = baseRows.map(function(r) {
      return Object.assign({}, r, {
        pals: palsMap[r.t],
        pitchScoreFaced: pitchMap[r.t],
        ppGap: r.ppGap != null ? r.ppGap : (r.abq != null && r.rcv != null ? r.abq - r.rcv : null)
      });
    });

    var columns = getSplitsColumns(SPLITS_STATE.statGroup, 'team');
    var filtered = baseRows.filter(function(r) {
      if (!SPLITS_STATE.search) return true;
      return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
    });
    if (SPLITS_STATE.sortKey) {
      filtered.sort(function(a, b) {
        var av = parseFloat(a[SPLITS_STATE.sortKey]);
        var bv = parseFloat(b[SPLITS_STATE.sortKey]);
        if (isNaN(av)) av = -999;
        if (isNaN(bv)) bv = -999;
        return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
      });
    } else {
      filtered.sort(function(a, b) { return (parseFloat(b.osi) || 0) - (parseFloat(a.osi) || 0); });
    }

    mount.innerHTML = buildSplitsTable(filtered, columns);
    bindSplitsTableSort(mount);
    bindSplitsRowClicks(mount, 'team');
  }

  function renderSpSplits(mount) {
    var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
    if (!profiles.length && global.PitcherLab) {
      mount.innerHTML = '<div class="splits-empty">Loading pitcher data\u2026</div>';
      PitcherLab.loadProfiles().then(function(list) {
        if (global.LIVE_DATA) LIVE_DATA.spProfiles = list || [];
        renderSplitsTable();
      });
      return;
    }
    var rows = profiles.map(spRowFromProfile);
    var filtered = rows.filter(function(p) {
      if (!SPLITS_STATE.search) return true;
      var name = String(p.pitcher_name || '').toLowerCase();
      var team = String(p.pitcher_team || '').toLowerCase();
      return name.indexOf(SPLITS_STATE.search) >= 0 || team.indexOf(SPLITS_STATE.search) >= 0;
    });
    if (SPLITS_STATE.sortKey) {
      filtered.sort(function(a, b) {
        var av = parseFloat(a[SPLITS_STATE.sortKey]) || -999;
        var bv = parseFloat(b[SPLITS_STATE.sortKey]) || -999;
        return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
      });
    }
    var columns = getSplitsColumns(SPLITS_STATE.statGroup, 'sp');
    mount.innerHTML = buildSplitsTable(filtered, columns);
    bindSplitsTableSort(mount);
    bindSplitsRowClicks(mount, 'sp');
  }

  function renderBullpenSplits(mount) {
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var bpRows = Object.entries(units).map(function(entry) {
      var unit = entry[1] || {};
      return {
        t: entry[0],
        bullpenScore: unit.bullpenScore,
        osiAllowed: unit.osiAllowed,
        abqAllowed: unit.abqAllowed,
        rcvAllowed: unit.rcvAllowed,
        obrAllowed: unit.obrAllowed,
        hiLevEra: unit.hiLevEra,
        loLevEra: unit.loLevEra,
        eraOverall: unit.eraOverall
      };
    });
    if (!bpRows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading bullpen data\u2026</div>';
      return;
    }
    var filtered = bpRows.filter(function(r) {
      if (!SPLITS_STATE.search) return true;
      return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
    });
    if (SPLITS_STATE.sortKey) {
      filtered.sort(function(a, b) {
        var av = parseFloat(a[SPLITS_STATE.sortKey]) || -999;
        var bv = parseFloat(b[SPLITS_STATE.sortKey]) || -999;
        return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
      });
    } else {
      filtered.sort(function(a, b) { return (b.bullpenScore || 0) - (a.bullpenScore || 0); });
    }
    var columns = getSplitsColumns(SPLITS_STATE.statGroup, 'bullpen');
    mount.innerHTML = buildSplitsTable(filtered, columns);
    bindSplitsTableSort(mount);
    bindSplitsRowClicks(mount, 'team');
  }

  function renderSplitsTable() {
    console.log('[SPLITS] render called:', JSON.stringify(SPLITS_STATE));
    RL.syncResearchGlobalsFromLiveData();
    migrateSplitsStateFromLegacy();
    syncLegacySplitsGlobals();

    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) {
      console.error('[SPLITS] mount not found');
      return;
    }
    updateSplitsConfirmLine();
    updateSplitsBanner();

    if (SPLITS_STATE.entity === 'team') renderTeamSplits(mount);
    else if (SPLITS_STATE.entity === 'sp') renderSpSplits(mount);
    else if (SPLITS_STATE.entity === 'bullpen') renderBullpenSplits(mount);
  }

  function initSplitsTab() {
    var controlMount = document.getElementById('rlSplitsControlMount');
    if (!controlMount) {
      console.error('[SPLITS] rlSplitsControlMount missing');
      return;
    }
    migrateSplitsStateFromLegacy();
    if (!controlMount.dataset.initialized) {
      controlMount.innerHTML = buildSplitsControlsHTML();
      bindSplitsControlsOnce();
      rebuildDynamicSplitsPills();
      controlMount.dataset.initialized = 'true';
    } else {
      rebuildDynamicSplitsPills();
    }
    var searchEl = document.getElementById('splitsSearch');
    if (searchEl) searchEl.value = SPLITS_STATE.search || '';
    var minPa = document.getElementById('splitsMinPA');
    if (minPa) minPa.value = SPLITS_STATE.minPA;

    if (global.LIVE_DATA && (global.LIVE_DATA.scYtdR || []).length) {
      renderSplitsTable();
    } else {
      renderOnLiveDataReady(function() { renderSplitsTable(); }, 'rlSplitsInit');
    }
  }

  function mountSplitsControls() {
    initSplitsTab();
  }

  function renderTeamOffenseSplits(mount) {
    SPLITS_STATE.entity = 'team';
    if (mount && !document.getElementById('rlSplitsTableMount')) {
      mount.id = 'rlSplitsTableMount';
    }
    renderSplitsTable();
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
    /* tab pills live in .rl-segment-tabs only â€” no duplicate header pills */
  }

  global.renderTrendHeatmap = renderTrendHeatmap;
  global.renderTeamOffenseSplits = renderTeamOffenseSplits;
  RL.mountTrendControls = mountTrendControls;
  RL.renderTrendHeatmap = renderTrendHeatmap;
  RL.renderTrendSummary = renderTrendSummary;
  RL.mountSplitsEntityControls = mountSplitsControls;
  RL.renderSplitsTable = renderSplitsTable;
  RL.renderTeamOffenseSplits = renderTeamOffenseSplits;
  RL.initSplitsControls = initSplitsTab;
  RL.initSplitsTab = initSplitsTab;
  global.initSplitsTab = initSplitsTab;
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
      initSplitsTab();
    } else if (origOnSubtab) origOnSubtab(name);
  };

})(typeof window !== 'undefined' ? window : this);
