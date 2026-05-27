// team_rankings_hub.js — Team Rankings hub (static pill onclick)
'use strict';

window.HUB_BUILD = '20260605a';
console.log('[HUB] script build', window.HUB_BUILD);

window.matchupHubLoaded = false;

var hubA = null;
var hubS = null;
var HUB;
var _hubInitStarted = false;
var _hubLoadGen = 0;
var _hubPalsMap = null;
var _hubLocHomeMap = null;
var _hubLocAwayMap = null;
var _hubLogoHtml = {};
var _hubHeadState = '';
var _hubLoadPromise = null;
var _hubStore = null;
var _hubRowCache = null;
var _hubRenderTicket = 0;
var _hubRenderRaf = 0;

var HUB_HANDS = ['both', 'r', 'l'];
var HUB_WINDOWS = ['YTD', 'L30', 'L14', 'L7'];
var HUB_LOCS = ['all', 'home', 'away'];
var HUB_LINEUPS = ['full', 'f5'];

var _HUB_ROW_KEYS = ['t', 'abq', 'rcv', 'obr', 'osi', 'projOSI', 'reg', 'ppGap', 'wrc', 'woba', 'xwoba', 'slg', 'pals'];

function snapshotScoreRows(rows) {
  return (rows || []).map(function(r) {
    if (!r) return null;
    var o = {};
    _HUB_ROW_KEYS.forEach(function(k) {
      if (r[k] !== undefined) o[k] = r[k];
    });
    return o;
  }).filter(Boolean);
}

function hubData() {
  return _hubStore || {
    scR: HUB.scR || [],
    scL: HUB.scL || [],
    scBoth: HUB.scBoth || [],
    scHome: HUB.scHome || [],
    scAway: HUB.scAway || [],
    teamProfiles: HUB.teamProfiles || {}
  };
}

function bindHubGlobals() {
  window.MatchupShared = window.MLBMASharedMatchup;
  hubA = window.MLBMAAssets || null;
  hubS = window.MLBMASharedMatchup || null;
  var cfg = window.MLBMA_CONFIG;
  if (!cfg || !cfg.SHEET_ID || !cfg.SHEET_TABS) return null;
  return cfg.SHEET_TABS;
}

try {
  HUB = {
    scR: [], scL: [], scBoth: [], scHome: [], scAway: [],
    teamProfiles: {},
    windowAvail: { L30: false, L14: false, L7: false },
    locationAvail: { home: false, away: false },
    hand: 'both',
    lineup: 'full',
    window: 'YTD',
    location: 'all',
    showAdvanced: false,
    sortKey: 'osi',
    sortDir: -1,
    expandedTeam: null,
    loaded: false,
    dataIssue: null
  };
} catch (e) {
  console.error('[HUB] HUB object crash:', e.message, e.stack);
  HUB = { scR: [], scL: [], scBoth: [], loaded: false };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function num(v) {
  if (v == null || v === '' || isNaN(v)) return null;
  return Number(v);
}

function fmt(v, d) {
  if (v == null || isNaN(v)) return '\u2014';
  return Number(v).toFixed(d == null ? 1 : d);
}

function sortArrow(key) {
  if (HUB.sortKey !== key) return '';
  return HUB.sortDir > 0 ? ' \u2191' : ' \u2193';
}

function mc(v, ctx, invert) {
  if (!hubA || !hubA.metricColor) return '#71717A';
  if (ctx === 'ppGap') return hubA.ppGapColor ? hubA.ppGapColor(v) : hubA.metricColor(v, 'osi', false);
  if (ctx === 'projOSI' && v != null) return '#71717A';
  return hubA.metricColor(v, ctx || 'osi', !!invert);
}

function rateScaleColor(v, min, max) {
  if (v == null || isNaN(v) || !hubA) return '#71717A';
  var t = (v - min) / (max - min);
  return hubA.metricColor(Math.max(0, Math.min(100, t * 100)), 'osi', false);
}

function wobaColor(v) { return rateScaleColor(v, 0.28, 0.38); }
function slgColor(v) { return rateScaleColor(v, 0.35, 0.55); }
function wrcColor(v) { return rateScaleColor(v, 70, 130); }

function projColor(proj, osi) {
  if (proj == null || osi == null || isNaN(proj) || isNaN(osi)) return '#71717A';
  if (proj > osi + 0.5) return '#4ADE80';
  if (proj < osi - 0.5) return '#F87171';
  return '#71717A';
}

function trendColor(t) {
  if (!t) return '#71717A';
  if (t === 'Rising') return '#4ADE80';
  if (t === 'Cooling') return '#F87171';
  if (t === 'Fake Hot') return '#FBBF24';
  return '#9CA3AF';
}

function teamKey(t) {
  return hubS && hubS.teamKey ? hubS.teamKey(t) : String(t || '').trim().toUpperCase();
}

function pick(row, keys) {
  if (!row) return null;
  if (hubS && hubS.pickCol) return hubS.pickCol(row, keys);
  for (var i = 0; i < keys.length; i++) {
    if (row[keys[i]] !== undefined && row[keys[i]] !== '') return row[keys[i]];
  }
  return null;
}

function mergeBoth(scR, scL) {
  var by = {};
  scR.forEach(function(r) { by[r.t] = { r: r }; });
  scL.forEach(function(l) {
    if (!by[l.t]) by[l.t] = {};
    by[l.t].l = l;
  });
  return Object.keys(by).sort().map(function(t) {
    var pack = by[t], r = pack.r, l = pack.l;
    if (!r && l) return Object.assign({}, l);
    if (r && !l) return Object.assign({}, r);
    function b(k) { return 0.5 * r[k] + 0.5 * l[k]; }
    var row = {
      t: t,
      abq: b('abq'), rcv: b('rcv'), obr: b('obr'), osi: b('osi'),
      projOSI: b('projOSI'), reg: r.reg, ppGap: r.ppGap,
      wrc: b('wrc'), woba: b('woba'), xwoba: b('xwoba'), slg: b('slg')
    };
    row.ppGap = row.abq - row.rcv;
    return row;
  });
}

function extractWindowOSI(val) {
  if (val == null || val === '') return null;
  var n = parseFloat(val);
  if (!isNaN(n)) return n;
  if (typeof val === 'string') {
    var m = val.match(/OSI[\s":]+([0-9.]+)/i);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function parseTeamProfiles(rows) {
  if (typeof window.parseTeamProfileRows === 'function') {
    return window.parseTeamProfileRows(rows || []);
  }
  var map = {};
  (rows || []).forEach(function(row) {
    var t = teamKey(pick(row, ['team', 'Tm', 'Team']));
    if (!t) return;
    var prof = {
      osi_ytd: extractWindowOSI(pick(row, ['osi_ytd', 'OSI_YTD', 'osi', 'OSI'])),
      osi_l30: extractWindowOSI(pick(row, ['osi_l30', 'OSI_L30', 'L30_OSI'])),
      osi_l14: extractWindowOSI(pick(row, ['osi_l14', 'OSI_L14', 'L14_OSI'])),
      osi_l7: extractWindowOSI(pick(row, ['osi_l7', 'OSI_L7', 'L7_OSI'])),
      osi: extractWindowOSI(pick(row, ['osi', 'OSI', 'osi_ytd', 'OSI_YTD'])),
      abq: num(pick(row, ['abq', 'ABQ'])),
      rcv: num(pick(row, ['rcv', 'RCV'])),
      obr: num(pick(row, ['obr', 'OBR'])),
      home_osi: num(pick(row, ['home_osi', 'Home_OSI'])),
      away_osi: num(pick(row, ['away_osi', 'Away_OSI']))
    };
    ['home', 'away'].forEach(function(loc) {
      ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
        var key = loc + '_' + m;
        prof[key] = num(pick(row, [key, key.toUpperCase()]));
      });
    });
    ['abq', 'rcv', 'obr'].forEach(function(m) {
      ['l30', 'l14', 'l7'].forEach(function(w) {
        prof[m + '_' + w] = num(pick(row, [
          m + '_' + w,
          m.toUpperCase() + '_' + w.toUpperCase(),
          w + '_' + m
        ]));
      });
    });
    map[t] = prof;
  });
  return map;
}

function detectFlatHandData() {
  if (!HUB.scR.length || !HUB.scL.length) return false;
  var lMap = {};
  HUB.scL.forEach(function(r) { lMap[r.t] = r; });
  var same = 0, n = 0;
  HUB.scR.forEach(function(r) {
    var l = lMap[r.t];
    if (!l || r.osi == null || l.osi == null) return;
    n++;
    if (Math.abs(r.osi - l.osi) < 0.05 && Math.abs((r.abq || 0) - (l.abq || 0)) < 0.05) same++;
  });
  return n >= 10 && same / n >= 0.85;
}

function detectFlatWindowData() {
  var keys = Object.keys(HUB.teamProfiles || {});
  if (keys.length < 5) return false;
  var flat = 0;
  var withWin = 0;
  keys.forEach(function(t) {
    var p = HUB.teamProfiles[t];
    if (!p) return;
    var l30 = p.osi_l30, l14 = p.osi_l14, l7 = p.osi_l7;
    if (l30 == null || isNaN(l30)) return;
    withWin++;
    if (l14 != null && l7 != null && Math.abs(l30 - l14) < 0.05 && Math.abs(l30 - l7) < 0.05) {
      flat++;
    }
  });
  return withWin >= 10 && flat / withWin >= 0.85;
}

function refreshWindowAvailFlags(clearIssue) {
  var keys = Object.keys(HUB.teamProfiles || {});
  if (clearIssue) HUB.dataIssue = null;
  if (!keys.length) {
    HUB.dataIssue = 'Team_Profiles tab did not load — check sheet access and hard refresh.';
  } else if (clearIssue && detectFlatWindowData()) {
    HUB.dataIssue = 'L30, L14, and L7 are identical in Google Sheets (empty batter_splits_l7/l14/recent). Run scrape_batter_splits, compute_team_profile, push_team_profiles.';
  }
  ['L30', 'L14', 'L7'].forEach(function(w) {
    var suf = w === 'L30' ? 'l30' : w === 'L14' ? 'l14' : 'l7';
    var n = keys.filter(function(t) {
      var p = HUB.teamProfiles[t];
      if (!p) return false;
      if (p['osi_' + suf] != null && !isNaN(p['osi_' + suf])) return true;
      return ['abq', 'rcv', 'obr'].some(function(m) {
        return p[m + '_' + suf] != null && !isNaN(p[m + '_' + suf]);
      });
    }).length;
    HUB.windowAvail[w] = n >= 10;
  });
  var homeN = keys.filter(function(t) {
    return HUB.teamProfiles[t] && HUB.teamProfiles[t].home_osi != null;
  }).length;
  var awayN = keys.filter(function(t) {
    return HUB.teamProfiles[t] && HUB.teamProfiles[t].away_osi != null;
  }).length;
  HUB.locationAvail.home = (HUB.scHome && HUB.scHome.length >= 10) || homeN >= 10;
  HUB.locationAvail.away = (HUB.scAway && HUB.scAway.length >= 10) || awayN >= 10;
}

function buildLocationScoresFromProfiles() {
  HUB.scHome = [];
  HUB.scAway = [];
  Object.keys(HUB.teamProfiles || {}).forEach(function(t) {
    var p = HUB.teamProfiles[t];
    if (!p) return;
    var h = { t: t };
    var a = { t: t };
    var hasH = false;
    var hasA = false;
    ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
      var hv = p['home_' + m];
      var av = p['away_' + m];
      if (hv != null && !isNaN(hv)) { h[m] = hv; hasH = true; }
      if (av != null && !isNaN(av)) { a[m] = av; hasA = true; }
    });
    if (hasH) {
      if (h.abq != null && h.rcv != null) h.ppGap = h.abq - h.rcv;
      if (h.projOSI == null && h.osi != null) h.projOSI = h.osi;
      HUB.scHome.push(h);
    }
    if (hasA) {
      if (a.abq != null && a.rcv != null) a.ppGap = a.abq - a.rcv;
      if (a.projOSI == null && a.osi != null) a.projOSI = a.osi;
      HUB.scAway.push(a);
    }
  });
  rebuildLocationMaps();
}

function windowSuffix(win) {
  if (win === 'L30') return 'l30';
  if (win === 'L14') return 'l14';
  if (win === 'L7') return 'l7';
  return null;
}

function tierInfo(osi) {
  if (osi == null || isNaN(osi)) return { label: '\u2014', cls: 'tier-incon' };
  if (osi >= 85) return { label: 'Elite', cls: 'tier-elite' };
  if (osi >= 75) return { label: 'High-Level', cls: 'tier-high' };
  if (osi >= 65) return { label: 'Dangerous', cls: 'tier-danger' };
  if (osi >= 50) return { label: 'Inconsistent', cls: 'tier-incon' };
  return { label: 'Weak', cls: 'tier-weak' };
}

function computeTrend(ytd, l14, l7) {
  ytd = num(ytd); l14 = num(l14); l7 = num(l7);
  if (ytd == null) return 'Stable';
  if (l14 != null && l7 != null && l14 > ytd + 3 && l7 > ytd + 3) return 'Rising';
  if ((l14 != null && l14 < ytd - 3) || (l7 != null && l7 < ytd - 5)) return 'Cooling';
  if (l7 != null && l7 > ytd + 5 && l14 != null && Math.abs(l14 - ytd) <= 2) return 'Fake Hot';
  return 'Stable';
}

function computeTakeaway(d) {
  var ti = tierInfo(d.osi);
  var pp = d.ppGap != null ? d.ppGap : 0;
  var osi = d.osi != null ? d.osi : 0;
  if (osi >= 75 && pp < -5) return 'High-level output but cooling trend';
  if (osi >= 75 && pp > 5) return 'Elite process and production';
  if (osi < 50 && pp > 5) return 'Weak production but process improving';
  if (d.trend === 'Fake Hot') return 'Hot streak unsupported by process';
  return ti.label + ' offense';
}

function scaleRowMetrics(row, ratio) {
  if (hubS && hubS.scaleRowMetrics) return hubS.scaleRowMetrics(row, ratio);
  return row;
}

function handRatiosForTeam(team) {
  if (!hubS || !hubS.handMetricRatios) return null;
  var store = hubData();
  return hubS.handMetricRatios(HUB.hand, team, store.scR, store.scL, store.scBoth);
}

function applyHandPlatoonToRow(d) {
  if (HUB.hand === 'both' || !hubS || !hubS.applyHandMetricRatios) return d;
  var ratios = handRatiosForTeam(d.t);
  return ratios ? hubS.applyHandMetricRatios(d, ratios) : d;
}

function applyLineupScopeToRow(d) {
  if (HUB.lineup !== 'f5') return d;
  var out = Object.assign({}, d);
  if (out.abq != null && out.obr != null && out.rcv != null) {
    out.osi = (out.abq * 0.45) + (out.obr * 0.35) + (out.rcv * 0.20);
  }
  if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
  return out;
}

function profileYtdMetric(prof, m) {
  if (m === 'osi') return prof.osi_ytd != null ? prof.osi_ytd : prof.osi;
  return prof[m];
}

function locationMetricRatio(prof, loc, m) {
  var locVal = prof[loc + '_' + m];
  var ytdVal = profileYtdMetric(prof, m);
  if (locVal == null || isNaN(locVal) || ytdVal == null || isNaN(ytdVal) || Math.abs(ytdVal) < 0.01) {
    return null;
  }
  return locVal / ytdVal;
}

function applyWindowToRow(d) {
  if (HUB.window === 'YTD') return Object.assign({}, d);
  var prof = hubProfile(d.t);
  var suf = windowSuffix(HUB.window);
  if (!suf) return d;
  var out = Object.assign({}, d);
  var applied = false;
  ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
    var wv = prof[m + '_' + suf];
    if (wv != null && !isNaN(wv)) {
      out[m] = wv;
      applied = true;
    }
  });
  if (!applied) return d;
  /* Team_Profiles windows are overall — scale by vs RHP/LHP YTD platoon split */
  out = applyHandPlatoonToRow(out);
  if (out.projOSI != null && d.ytdOSI) {
    out.projOSI = d.ytdOSI ? out.osi + (d.projOSI - d.ytdOSI) : out.projOSI;
  }
  return out;
}

function rebuildLocationMaps() {
  _hubLocHomeMap = {};
  _hubLocAwayMap = {};
  var store = hubData();
  (store.scHome || []).forEach(function(r) {
    var tk = teamKey(r.t);
    if (tk) _hubLocHomeMap[tk] = r;
  });
  (store.scAway || []).forEach(function(r) {
    var tk = teamKey(r.t);
    if (tk) _hubLocAwayMap[tk] = r;
  });
}

function locationRowForTeam(team) {
  var loc = HUB.location;
  if (loc !== 'home' && loc !== 'away') return null;
  var tk = teamKey(team);
  if (!tk) return null;
  var map = loc === 'home' ? _hubLocHomeMap : _hubLocAwayMap;
  return map && map[tk] ? map[tk] : null;
}

function overlayLocationRateStats(out, prof, loc, locRow) {
  ['wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
    var v = prof[loc + '_' + m];
    if ((v == null || isNaN(v)) && locRow) v = locRow[m];
    if (v != null && !isNaN(v)) out[m] = v;
  });
  return out;
}

function locationAlreadyInBaseRows() {
  var store = hubData();
  return HUB.window === 'YTD' && HUB.hand === 'both'
    && (HUB.location === 'home' || HUB.location === 'away')
    && ((HUB.location === 'home' && (store.scHome || []).length >= 10)
      || (HUB.location === 'away' && (store.scAway || []).length >= 10));
}

/** Platoon + rolling windows: scale hand row by home/away vs YTD team anchors in Team_Profiles. */
function applyLocationToRow(d) {
  if (HUB.location !== 'home' && HUB.location !== 'away') return d;
  if (locationAlreadyInBaseRows()) return d;

  var loc = HUB.location;
  var prof = hubProfile(d.t);
  var locRow = locationRowForTeam(d.t);
  var out = Object.assign({}, d);
  var scaled = false;

  ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
    var ratio = locationMetricRatio(prof, loc, m);
    if (ratio == null || isNaN(ratio)) return;
    if (d[m] != null && !isNaN(d[m])) {
      out[m] = d[m] * ratio;
      scaled = true;
    }
  });

  if (!scaled) return d;

  out = overlayLocationRateStats(out, prof, loc, locRow);
  if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
  if (d.projOSI != null && d.osi != null && out.osi != null) {
    out.projOSI = d.projOSI + (out.osi - d.osi);
  } else if (out.projOSI == null && out.osi != null) {
    out.projOSI = out.osi;
  }
  return out;
}

function filterBaseRows() {
  return handBaseRows();
}

function hubProfile(team) {
  var tk = teamKey(team);
  var profs = hubData().teamProfiles || {};
  return profs[tk] || profs[team] || {};
}

function enrichRow(base) {
  var t = base.t;
  var prof = hubProfile(t);
  var d = Object.assign({}, base);
  if (d.ppGap == null && d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
  d.ytdOSI = prof.osi_ytd != null ? prof.osi_ytd : base.osi;
  d.l30OSI = prof.osi_l30;
  d.l14OSI = prof.osi_l14;
  d.l7OSI = prof.osi_l7;
  d = applyWindowToRow(d);
  d = applyLocationToRow(d);
  d = applyLineupScopeToRow(d);
  d.trend = computeTrend(d.ytdOSI, d.l14OSI, d.l7OSI);
  d.tier = tierInfo(d.osi);
  d.takeaway = computeTakeaway(d);
  if (d.pals == null && _hubPalsMap) d.pals = _hubPalsMap[t];
  return d;
}

function buildPalsMap() {
  _hubPalsMap = {};
  if (!window.LIVE_DATA || !window.LIVE_DATA.pals || !hubS) return;
  (window.LIVE_DATA.pals || []).forEach(function(p) {
    var tk = teamKey(hubS.pickCol(p, 'team', 'Tm', 'Team'));
    if (tk) _hubPalsMap[tk] = num(hubS.pickCol(p, 'PALS', 'pals'));
  });
}

function resolveHandRowSource() {
  var store = hubData();
  var hand = HUB.hand || 'both';
  var loc = HUB.location || 'all';
  var win = HUB.window || 'YTD';

  if (win === 'YTD') {
    if (loc === 'home' && hand === 'both' && (store.scHome || []).length >= 10) {
      return store.scHome;
    }
    if (loc === 'away' && hand === 'both' && (store.scAway || []).length >= 10) {
      return store.scAway;
    }
    if (hand === 'r') return store.scR || [];
    if (hand === 'l') return store.scL || [];
    return (store.scBoth && store.scBoth.length) ? store.scBoth : (store.scR || []);
  }

  if (hand === 'r') return store.scR || [];
  if (hand === 'l') return store.scL || [];
  return (store.scBoth && store.scBoth.length) ? store.scBoth : (store.scR || []);
}

function handBaseRows() {
  return (resolveHandRowSource() || []).map(function(r) {
    return Object.assign({}, r);
  });
}

function currentFilterKey(state) {
  var s = state || HUB;
  return [s.hand, s.window, s.location, s.lineup].join('|');
}

function cloneEnrichedRows(rows) {
  return (rows || []).map(function(d) {
    return Object.assign({}, d);
  });
}

function rebuildMasterRows() {
  return filterBaseRows().map(function(r) { return enrichRow(r); });
}

function registerPoolsForRows(rows) {
  if (!hubA || !hubA.registerLeaguePool || !rows || !rows.length) return;
  ['osi', 'abq', 'rcv', 'obr', 'projOSI', 'ppGap', 'wrc', 'xwoba', 'slg'].forEach(function(k) {
    hubA.registerLeaguePool(k, rows.map(function(d) { return d[k]; }));
  });
}

function precomputeHubRowCache() {
  _hubRowCache = {};
  if (!_hubStore || !HUB.scR.length) return;
  var saved = {
    hand: HUB.hand,
    window: HUB.window,
    location: HUB.location,
    lineup: HUB.lineup
  };
  HUB_HANDS.forEach(function(hand) {
    HUB_WINDOWS.forEach(function(win) {
      HUB_LOCS.forEach(function(loc) {
        HUB_LINEUPS.forEach(function(lineup) {
          HUB.hand = hand;
          HUB.window = win;
          HUB.location = loc;
          HUB.lineup = lineup;
          _hubRowCache[currentFilterKey()] = cloneEnrichedRows(rebuildMasterRows());
        });
      });
    });
  });
  HUB.hand = saved.hand;
  HUB.window = saved.window;
  HUB.location = saved.location;
  HUB.lineup = saved.lineup;
  console.log('[HUB] precomputed ' + Object.keys(_hubRowCache).length + ' table views');
}

function rowsForCurrentFilter() {
  var key = currentFilterKey();
  if (_hubRowCache && _hubRowCache[key]) {
    return cloneEnrichedRows(_hubRowCache[key]);
  }
  return rebuildMasterRows();
}

function sortRows(rows) {
  var k = HUB.sortKey;
  var dir = HUB.sortDir;
  return (rows || []).slice().sort(function(a, b) {
    var av = a[k], bv = b[k];
    if (k === 'rank') { av = a.osi; bv = b.osi; }
    if (av == null || isNaN(av)) return 1;
    if (bv == null || isNaN(bv)) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  });
}

function confirmLine() {
  var handLbl = { both: 'Both', r: 'vs RHP', l: 'vs LHP' }[HUB.hand] || HUB.hand;
  var locLbl = { all: 'All', home: 'Home', away: 'Away' }[HUB.location] || HUB.location;
  var lineupLbl = HUB.lineup === 'f5' ? 'F5 lineup' : 'Full lineup';
  return 'Showing: <strong>OSI</strong> \u00B7 <strong>' + esc(handLbl)
    + '</strong> \u00B7 <strong>' + esc(HUB.window) + '</strong> \u00B7 <strong>' + esc(locLbl)
    + '</strong> \u00B7 <strong>' + esc(lineupLbl) + '</strong>';
}

function syncControlPills() {
  var bar = document.getElementById('hubControlBar');
  if (!bar) return;
  bar.querySelectorAll('[data-hub-key]').forEach(function(btn) {
    var key = btn.getAttribute('data-hub-key');
    var val = btn.getAttribute('data-val');
    btn.classList.toggle('active', HUB[key] === val);
  });
  var conf = document.getElementById('hubConfirm');
  if (conf) conf.innerHTML = confirmLine();
  var adv = document.getElementById('hubAdvCols');
  if (adv) adv.checked = HUB.showAdvanced;
}

function applyFilterChange() {
  _hubRenderTicket++;
  var ticket = _hubRenderTicket;
  if (_hubRenderRaf) return;
  _hubRenderRaf = requestAnimationFrame(function() {
    _hubRenderRaf = 0;
    if (ticket !== _hubRenderTicket) {
      applyFilterChange();
      return;
    }
    syncControlPills();
    try {
      updateBanners(false);
    } catch (bannerErr) {
      console.warn('[HUB] banner update failed', bannerErr);
    }
    renderHubTableNow();
  });
}

function setFilter(key, val) {
  if (!HUB || val == null || !key) return;
  if (HUB[key] === val) {
    applyFilterChange();
    return;
  }
  HUB[key] = val;
  applyFilterChange();
}

function renderHubTableNow() {
  try {
    renderHubTable();
  } catch (err) {
    console.error('[HUB] render failed', err);
    var body = document.getElementById('hubTableBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="13" style="color:#F87171;padding:16px">Table render error — hard refresh. ' + esc(err.message || String(err)) + '</td></tr>';
    }
  }
}

function scheduleRenderHubTable() {
  applyFilterChange();
}

/** Called from static pill onclick in team_rankings.html — always hits latest filter state. */
function hubPick(key, val) {
  setFilter(key, val);
  if (window.__HUB_DEBUG && HUB && HUB.scR && HUB.scR.length) {
    var sample = (HUB.scR[0] && HUB.scR[0].t) || 'ARI';
    var rows = rowsForCurrentFilter();
    var row = rows.filter(function(r) { return r.t === sample; })[0];
    console.log('[HUB] filter', currentFilterKey(), sample, row ? { osi: row.osi, abq: row.abq } : '—');
  }
}

function setHand(h) { setFilter('hand', h); }
function setWindow(win) { setFilter('window', win); }
function setLocation(loc) { setFilter('location', loc); }
function setLineup(mode) { setFilter('lineup', mode); }

function renderControls() {
  /* Pills are static in team_rankings.html with onclick="hubPick(...)" — do not replace innerHTML */
  syncControlPills();
}

function bindHubTableSort() {
  var table = document.getElementById('hubTable');
  if (!table || table.dataset.sortBound === '1') return;
  table.dataset.sortBound = '1';
  table.addEventListener('click', function(e) {
    var th = e.target.closest('#hubTableHead th[data-sort]');
    if (!th) return;
    var k = th.getAttribute('data-sort');
    if (HUB.sortKey === k) HUB.sortDir *= -1;
    else { HUB.sortKey = k; HUB.sortDir = -1; }
    _hubHeadState = '';
    scheduleRenderHubTable();
  });
}

function hubHeadStateKey() {
  return [HUB.sortKey, HUB.sortDir, HUB.showAdvanced ? '1' : '0'].join('|');
}

function updateHead() {
  var head = document.getElementById('hubTableHead');
  if (!head) return;
  var stateKey = hubHeadStateKey();
  if (stateKey === _hubHeadState) return;
  _hubHeadState = stateKey;
  var adv = HUB.showAdvanced ? ' show' : '';
  head.innerHTML = ''
    + '<th data-sort="rank">#' + sortArrow('rank') + '</th>'
    + '<th data-sort="t">Team' + sortArrow('t') + '</th>'
    + '<th data-sort="osi" class="col-primary' + (HUB.sortKey === 'osi' ? ' sorted' : '') + '">OSI' + sortArrow('osi') + '</th>'
    + '<th data-sort="obr">OBR' + sortArrow('obr') + '</th>'
    + '<th data-sort="rcv">RCV' + sortArrow('rcv') + '</th>'
    + '<th data-sort="abq">ABQ' + sortArrow('abq') + '</th>'
    + '<th data-sort="wrc">wRC+' + sortArrow('wrc') + '</th>'
    + '<th data-sort="woba">wOBA' + sortArrow('woba') + '</th>'
    + '<th data-sort="xwoba">xwOBA' + sortArrow('xwoba') + '</th>'
    + '<th data-sort="slg">SLG' + sortArrow('slg') + '</th>'
    + '<th data-sort="trend">TREND' + sortArrow('trend') + '</th>'
    + '<th data-sort="ppGap" class="col-adv' + adv + '">PP-Gap' + sortArrow('ppGap') + '</th>'
    + '<th data-sort="projOSI" class="col-adv' + adv + '">ProjOSI' + sortArrow('projOSI') + '</th>'
    + '<th data-sort="pals" class="col-adv' + adv + '">PALS' + sortArrow('pals') + '</th>';
}

function hubTeamLogo(t) {
  var tk = teamKey(t);
  if (!tk) return '';
  if (_hubLogoHtml[tk]) return _hubLogoHtml[tk];
  _hubLogoHtml[tk] = hubA ? hubA.teamLogoImg(tk, 28) : '';
  return _hubLogoHtml[tk];
}

function renderHubTable() {
  updateHead();
  var body = document.getElementById('hubTableBody');
  if (!body) return;
  if (!HUB.loaded) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--text-2)">Loading team data from Google Sheets\u2026</td></tr>';
    return;
  }
  if (!HUB.scR.length) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:#F87171">Could not load vs_RHP sheet data.</td></tr>';
    return;
  }
  var rows;
  var filterKey = currentFilterKey();
  try {
    rows = sortRows(rowsForCurrentFilter());
    registerPoolsForRows(rows);
  } catch (err) {
    console.error('[HUB] rebuild rows failed', err);
    body.innerHTML = '<tr><td colspan="13" style="color:#F87171;padding:16px">Filter error — hard refresh. ' + esc(err.message || String(err)) + '</td></tr>';
    return;
  }
  hideHubLoading();
  var advShow = HUB.showAdvanced;
  var html = '';
  rows.forEach(function(d, i) {
    var wobaStr = d.woba != null && !isNaN(d.woba) ? Number(d.woba).toFixed(3) : '\u2014';
    var xwobaStr = d.xwoba != null && !isNaN(d.xwoba) ? Number(d.xwoba).toFixed(3) : '\u2014';
    var slgStr = d.slg != null && !isNaN(d.slg) ? Number(d.slg).toFixed(3) : '\u2014';
    var tc = trendColor(d.trend);
    html += '<tr class="hub-row' + (HUB.expandedTeam === d.t ? ' expanded' : '') + '" data-team="' + esc(d.t) + '">'
      + '<td class="hub-rank"><button type="button" class="hub-expand-btn" aria-label="Expand">' + (HUB.expandedTeam === d.t ? '\u2212' : '+') + '</button><span class="hub-rank-num">' + (i + 1) + '</span></td>'
      + '<td><div class="hub-team-cell">' + hubTeamLogo(d.t) + '<div><strong>' + esc(d.t) + '</strong>'
      + '<a class="hub-profile-link" href="team_profile.html?team=' + encodeURIComponent(d.t) + '" onclick="event.stopPropagation()">Profile</a></div></div></td>'
      + '<td class="col-primary" style="color:' + mc(d.osi, 'osi') + ';font-weight:700">' + fmt(d.osi) + '</td>'
      + '<td style="color:' + mc(d.obr, 'obr') + '">' + fmt(d.obr) + '</td>'
      + '<td style="color:' + mc(d.rcv, 'rcv') + '">' + fmt(d.rcv) + '</td>'
      + '<td style="color:' + mc(d.abq, 'abq') + '">' + fmt(d.abq) + '</td>'
      + '<td style="color:' + wrcColor(d.wrc) + '">' + fmt(d.wrc, 0) + '</td>'
      + '<td style="color:' + wobaColor(d.woba) + '">' + wobaStr + '</td>'
      + '<td style="color:' + wobaColor(d.xwoba) + '">' + xwobaStr + '</td>'
      + '<td style="color:' + slgColor(d.slg) + '">' + slgStr + '</td>'
      + '<td><span class="trend-badge" style="background:' + tc + '22;color:' + tc + '">' + esc(d.trend) + '</span></td>'
      + '<td class="col-adv' + (advShow ? ' show' : '') + '" style="color:' + mc(d.ppGap, 'ppGap') + '">' + fmt(d.ppGap) + '</td>'
      + '<td class="col-adv' + (advShow ? ' show' : '') + '" style="color:' + projColor(d.projOSI, d.osi) + '">' + fmt(d.projOSI) + '</td>'
      + '<td class="col-adv' + (advShow ? ' show' : '') + '">' + fmt(d.pals) + '</td>'
      + '</tr>';
  });
  body.innerHTML = rows.length ? html : '<tr><td colspan="13">No team data loaded.</td></tr>';
  body.setAttribute('data-hub-filter', filterKey);
}

function updateBanners(runDetect) {
  var msg = HUB.dataIssue || '';
  var wBan = document.getElementById('hubWindowBanner');
  if (wBan) {
    if (runDetect && !msg && detectFlatHandData()) {
      msg = 'vs_RHP and vs_LHP show identical OSI/ABQ in Google Sheets \u2014 re-run compute + push_sheets so handedness toggles work on YTD.';
    } else if (!msg && (HUB.location === 'home' || HUB.location === 'away')) {
      var locN = HUB.location === 'home' ? (HUB.scHome || []).length : (HUB.scAway || []).length;
      if (locN < 10) {
        msg = 'Home/Away split data sparse \u2014 run scrape_batter_splits (home/away) then compute_team_profile + push_team_profiles.';
      }
    } else if (runDetect && !msg && HUB.window !== 'YTD' && detectFlatWindowData()) {
      msg = 'L30 / L14 / L7 show the same values in Team_Profiles (pipeline needs dated batter splits). Home/Away still works.';
    } else if (!msg && HUB.window !== 'YTD' && !HUB.windowAvail[HUB.window]) {
      msg = 'Window columns sparse in Team_Profiles \u2014 showing YTD for teams missing window fields.';
    }
    var showWin = !!msg;
    wBan.classList.toggle('show', showWin);
    wBan.style.display = showWin ? 'block' : 'none';
    if (showWin) wBan.textContent = msg;
  }
  var lBan = document.getElementById('hubLocationBanner');
  if (lBan) {
    var locMsg = '';
    if (!msg && (HUB.location === 'home' || HUB.location === 'away')) {
      var locN = HUB.location === 'home' ? (HUB.scHome || []).length : (HUB.scAway || []).length;
      if (locN < 10) locMsg = 'Home/Away: using Team_Profiles fallback \u2014 re-run batter splits for full ABQ/RCV/OBR.';
    }
    var showLoc = !!locMsg;
    lBan.classList.toggle('show', showLoc);
    lBan.style.display = showLoc ? 'block' : 'none';
    if (showLoc) lBan.textContent = locMsg;
  }
}

function hideHubLoading() {
  var l = document.getElementById('hubLoading');
  if (l) {
    l.classList.add('hide');
    l.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
    l.setAttribute('aria-hidden', 'true');
  }
}

function buildScBothFromHandedness() {
  if (!HUB.scR.length || !HUB.scL.length) return;
  var lMap = {};
  HUB.scL.forEach(function(r) { lMap[r.t] = r; });
  HUB.scBoth = HUB.scR.map(function(r) {
    var l = lMap[r.t] || r;
    return Object.assign({}, r, {
      osi: (r.osi + (l.osi || r.osi)) / 2,
      abq: (r.abq + (l.abq || r.abq)) / 2,
      rcv: (r.rcv + (l.rcv || r.rcv)) / 2,
      obr: (r.obr + (l.obr || r.obr)) / 2,
      woba: ((r.woba || 0) + (l.woba || r.woba || 0)) / 2,
      xwoba: ((r.xwoba || 0) + (l.xwoba || r.xwoba || 0)) / 2,
      wrc: ((r.wrc || 0) + (l.wrc || r.wrc || 0)) / 2,
      slg: ((r.slg || 0) + (l.slg || r.slg || 0)) / 2
    });
  });
}

function fetchTabRetry(MS, tabName, triesLeft) {
  return MS.fetchSheetTab(tabName).catch(function(err) {
    if (triesLeft > 0) {
      console.warn('[HUB] retry fetch', tabName, triesLeft);
      return fetchTabRetry(MS, tabName, triesLeft - 1);
    }
    throw err;
  });
}

function rebuildHubStore(scR, scL, teamProfiles) {
  var r = snapshotScoreRows(scR);
  var l = snapshotScoreRows(scL);
  var both = snapshotScoreRows(mergeBoth(r, l));
  if (!both.length && r.length && l.length) {
    var lMap = {};
    l.forEach(function(row) { lMap[row.t] = row; });
    both = snapshotScoreRows(r.map(function(row) {
      var lp = lMap[row.t] || row;
      return {
        t: row.t,
        osi: (row.osi + (lp.osi || row.osi)) / 2,
        abq: (row.abq + (lp.abq || row.abq)) / 2,
        rcv: (row.rcv + (lp.rcv || row.rcv)) / 2,
        obr: (row.obr + (lp.obr || row.obr)) / 2,
        woba: ((row.woba || 0) + (lp.woba || row.woba || 0)) / 2,
        xwoba: ((row.xwoba || 0) + (lp.xwoba || row.xwoba || 0)) / 2,
        wrc: ((row.wrc || 0) + (lp.wrc || row.wrc || 0)) / 2,
        slg: ((row.slg || 0) + (lp.slg || row.slg || 0)) / 2,
        projOSI: row.projOSI,
        ppGap: row.ppGap
      };
    }));
  }
  _hubStore = {
    scR: r,
    scL: l,
    scBoth: both,
    scHome: [],
    scAway: [],
    teamProfiles: teamProfiles || {}
  };
  HUB.scR = _hubStore.scR;
  HUB.scL = _hubStore.scL;
  HUB.scBoth = _hubStore.scBoth;
  HUB.teamProfiles = _hubStore.teamProfiles;
  buildLocationScoresFromProfiles();
  _hubStore.scHome = snapshotScoreRows(HUB.scHome);
  _hubStore.scAway = snapshotScoreRows(HUB.scAway);
  HUB.scHome = _hubStore.scHome;
  HUB.scAway = _hubStore.scAway;
  rebuildLocationMaps();
}

function hubApplyPayload(gen, payload) {
  if (gen !== _hubLoadGen) return;
  rebuildHubStore(payload.scR, payload.scL, payload.teamProfiles);
  buildPalsMap();
  refreshWindowAvailFlags(true);
  try {
    precomputeHubRowCache();
  } catch (preErr) {
    console.error('[HUB] precompute failed — using live filter path', preErr);
    _hubRowCache = null;
  }
  HUB.loaded = true;
  updateBanners(true);
  syncControlPills();
  applyFilterChange();
  console.log('[HUB] load complete build=' + window.HUB_BUILD + ' gen=' + gen
    + ' teams R=' + HUB.scR.length
    + ' home=' + HUB.scHome.length + ' away=' + HUB.scAway.length
    + ' profiles=' + Object.keys(HUB.teamProfiles).length
    + ' views=' + (_hubRowCache ? Object.keys(_hubRowCache).length : 0)
    + (HUB.dataIssue ? ' ISSUE: ' + HUB.dataIssue : ''));
  hideHubLoading();
}

function hubLoadData(forceRefresh) {
  if (_hubLoadPromise && !forceRefresh) {
    return _hubLoadPromise;
  }
  if (forceRefresh) {
    _hubRowCache = null;
    HUB.loaded = false;
    if (hubS && hubS.clearSheetTabCache) hubS.clearSheetTabCache();
  }
  if (HUB.loaded && _hubStore && !forceRefresh) {
    return Promise.resolve();
  }

  var gen = ++_hubLoadGen;
  var TABS = HUB._tabs || bindHubGlobals();
  var MS = window.MatchupShared || window.MLBMASharedMatchup;
  if (!MS || !MS.fetchSheetTab || !TABS) {
    HUB.loaded = true;
    HUB.dataIssue = 'MLBMA config or shared fetch module not loaded.';
    hideHubLoading();
    return Promise.resolve();
  }
  var scoreFn = window.scoreRowFromSheet || MS.scoreRowFromSheet;
  if (!scoreFn) {
    HUB.loaded = true;
    HUB.dataIssue = 'scoreRowFromSheet missing — check matchup_shared.js load order.';
    hideHubLoading();
    return Promise.resolve();
  }

  var body = document.getElementById('hubTableBody');
  if (body && !HUB.scR.length) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--text-2)">Loading team data from Google Sheets\u2026</td></tr>';
  }

  _hubLoadPromise = fetchTabRetry(MS, TABS.vs_rhp, 1).then(function(rows) {
    if (gen !== _hubLoadGen) return null;
    var scR = (rows || []).map(scoreFn).filter(Boolean);
    console.log('[HUB] vs_RHP rows parsed:', scR.length);
    if (!scR.length) {
      throw new Error('vs_RHP returned 0 teams — check vs_RHP tab in Google Sheets');
    }
    return Promise.all([
      fetchTabRetry(MS, TABS.vs_lhp, 1),
      fetchTabRetry(MS, TABS.team_profiles, 2).catch(function(err) {
        console.error('[HUB] Team_Profiles fetch failed', err);
        HUB.dataIssue = 'Team_Profiles failed to load — window/location toggles will not change OSI.';
        return [];
      })
    ]).then(function(res) {
      if (gen !== _hubLoadGen) return null;
      return {
        scR: scR,
        scL: (res[0] || []).map(scoreFn).filter(Boolean),
        teamProfiles: parseTeamProfiles(res[1] || [])
      };
    });
  }).then(function(payload) {
    if (!payload) return;
    hubApplyPayload(gen, payload);
  }).catch(function(err) {
    if (gen !== _hubLoadGen) return;
    console.error('[HUB] load failed', err);
    HUB.loaded = true;
    HUB.dataIssue = 'Sheet load failed: ' + (err && err.message ? err.message : String(err));
    scheduleRenderHubTable();
    hideHubLoading();
  }).finally(function() {
    if (gen === _hubLoadGen) _hubLoadPromise = null;
  });

  return _hubLoadPromise;
}

function bindHubRowClicks() {
  var body = document.getElementById('hubTableBody');
  if (!body) return;
  if (body.dataset.bound === '1') return;
  body.dataset.bound = '1';
  body.addEventListener('click', function(e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr.hub-row');
    if (!tr) return;
    var t = tr.getAttribute('data-team');
    HUB.expandedTeam = HUB.expandedTeam === t ? null : t;
    scheduleRenderHubTable();
  });
}

function initHub() {
  if (_hubInitStarted) return;
  _hubInitStarted = true;

  var TABS = bindHubGlobals();
  if (!TABS) {
    _hubInitStarted = false;
    setTimeout(initHub, 300);
    return;
  }
  HUB._tabs = TABS;
  bindHubRowClicks();
  bindHubTableSort();
  renderControls();
  updateBanners(false);
  var advEl = document.getElementById('hubAdvCols');
  if (advEl && advEl.dataset.bound !== '1') {
    advEl.dataset.bound = '1';
    advEl.addEventListener('change', function(e) {
      HUB.showAdvanced = e.target.checked;
      _hubHeadState = '';
      scheduleRenderHubTable();
    });
  }
  scheduleRenderHubTable();
  hubLoadData().catch(function(err) {
    console.error('[HUB] init load failed', err);
  });
  setTimeout(function() {
    if (HUB.loaded) return;
    HUB.dataIssue = 'Sheet load timed out — click Retry or run hubLoadData(true) in console.';
    var body = document.getElementById('hubTableBody');
    if (body) {
      body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:#F87171">'
        + esc(HUB.dataIssue)
        + ' <button type="button" class="hub-pill" onclick="hubLoadData(true)" style="margin-left:8px">Retry</button></td></tr>';
    }
    hideHubLoading();
  }, 25000);
}

try {
  window.HUB = HUB;
  window.renderHubTable = renderHubTable;
  window.hubLoadData = function(force) {
    return hubLoadData(!!force);
  };
  window.initHub = initHub;
  window.hubSetFilter = setFilter;
  window.hubResetFilters = function() {
    HUB.hand = 'both';
    HUB.lineup = 'full';
    HUB.window = 'YTD';
    HUB.location = 'all';
    applyFilterChange();
  };
} catch (e) {
  console.error('[HUB] exports crash:', e.message, e.stack);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHub);
} else {
  initHub();
}
try {
  window.__HUB_DEBUG = new URLSearchParams(location.search).get('hubdebug') === '1';
} catch (e) { window.__HUB_DEBUG = false; }
window.matchupHubLoaded = true;
