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
var _hubFallbackWarned = false;

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
  var cfgDefaults = (window.MLBMA_CONFIG && window.MLBMA_CONFIG.FILTER_DEFAULTS) || {};
  var scopeDefaults = (window.MLBMA_CONFIG && window.MLBMA_CONFIG.SCOPE_DEFAULTS) || {};
  var defaultFilter = (window.MLBMASharedMatchup && window.MLBMASharedMatchup.createFilterState)
    ? window.MLBMASharedMatchup.createFilterState(cfgDefaults)
    : {
        hand: 'both',
        location: 'all',
        pitcher: 'both',
        batSide: 'both',
        segment: 'full',
        window: 'YTD'
      };
  var defaultScope = (window.MLBMASharedMatchup && window.MLBMASharedMatchup.createScopeState)
    ? window.MLBMASharedMatchup.createScopeState(scopeDefaults)
    : { mode: 'all', team: null };
  HUB = {
    scR: [], scL: [], scBoth: [], scHome: [], scAway: [],
    teamProfiles: {},
    windowAvail: { L30: false, L14: false, L7: false },
    locationAvail: { home: false, away: false },
    filter: defaultFilter,
    scope: defaultScope,
    family: 'summary',
    hand: defaultFilter.hand,
    lineup: defaultFilter.segment,
    window: defaultFilter.window,
    location: defaultFilter.location,
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

function syncLegacyFilterFields() {
  if (!HUB.filter) return;
  HUB.hand = HUB.filter.hand;
  HUB.location = HUB.filter.location;
  HUB.lineup = HUB.filter.segment;
  HUB.window = HUB.filter.window;
}

function normalizeHubState() {
  if (hubS && hubS.createFilterState) HUB.filter = hubS.createFilterState(HUB.filter || {});
  if (!HUB.filter) {
    HUB.filter = { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' };
  }
  if (hubS && hubS.createScopeState) HUB.scope = hubS.createScopeState(HUB.scope || {});
  if (!HUB.scope) HUB.scope = { mode: 'all', team: null };
  if (!HUB.family) HUB.family = 'summary';
  syncLegacyFilterFields();
}

function isAllowedValue(value, allowed) {
  return allowed.indexOf(String(value || '').toLowerCase()) >= 0;
}

function applyUrlState() {
  try {
    var p = new URLSearchParams(location.search);
    normalizeHubState();
    var f = Object.assign({}, HUB.filter || {});
    var hand = (p.get('hand') || '').toLowerCase();
    var loc = (p.get('loc') || '').toLowerCase();
    var pitch = (p.get('pitch') || '').toLowerCase();
    var side = (p.get('side') || '').toLowerCase();
    var seg = (p.get('seg') || '').toLowerCase();
    var win = (p.get('window') || '').toUpperCase();
    if (isAllowedValue(hand, ['both', 'r', 'l'])) f.hand = hand;
    if (isAllowedValue(loc, ['all', 'home', 'away'])) f.location = loc;
    if (isAllowedValue(pitch, ['both', 'sp', 'rp'])) f.pitcher = pitch;
    if (isAllowedValue(side, ['both', 'rhb', 'lhb'])) f.batSide = side;
    if (isAllowedValue(seg, ['full', 'f5'])) f.segment = seg;
    if (isAllowedValue(win, ['YTD', 'L30', 'L14', 'L7'])) f.window = win;
    HUB.filter = hubS && hubS.createFilterState ? hubS.createFilterState(f) : f;

    var scope = (p.get('scope') || '').toLowerCase();
    if (isAllowedValue(scope, ['all', 'team'])) HUB.scope.mode = scope;
    var team = (p.get('team') || '').toUpperCase();
    HUB.scope.team = HUB.scope.mode === 'team' && team ? teamKey(team) : null;
    var family = (p.get('family') || '').toLowerCase();
    if (isAllowedValue(family, ['summary', 'surface', 'scoring', 'difficulty'])) HUB.family = family;
  } catch (e) {
    console.warn('[HUB] failed to parse URL state', e);
  }
  syncLegacyFilterFields();
}

function persistUrlState() {
  try {
    normalizeHubState();
    var f = HUB.filter || {};
    var s = HUB.scope || { mode: 'all', team: null };
    var p = new URLSearchParams(location.search);
    p.set('hand', f.hand);
    p.set('loc', f.location);
    p.set('pitch', f.pitcher);
    p.set('side', f.batSide);
    p.set('seg', f.segment);
    p.set('window', f.window);
    p.set('scope', s.mode || 'all');
    p.set('family', HUB.family || 'summary');
    if (s.mode === 'team' && s.team) p.set('team', teamKey(s.team));
    else p.delete('team');
    var next = location.pathname + '?' + p.toString() + location.hash;
    history.replaceState(null, '', next);
  } catch (e) {
    console.warn('[HUB] failed to persist URL state', e);
  }
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

function ordinal(n) {
  n = Number(n) || 0;
  var mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return n + 'th';
  if (n % 10 === 1) return n + 'st';
  if (n % 10 === 2) return n + 'nd';
  if (n % 10 === 3) return n + 'rd';
  return n + 'th';
}

function familyMetricDefs() {
  var fam = HUB.family || 'summary';
  if (fam === 'scoring') {
    return [
      { key: 'wrc', label: 'wRC+', d: 0, color: function(v) { return wrcColor(v); } },
      { key: 'woba', label: 'wOBA', d: 3, color: function(v) { return wobaColor(v); } },
      { key: 'osi', label: 'OSI', d: 1, color: function(v) { return mc(v, 'osi'); } },
      { key: 'rcv', label: 'RCV', d: 1, color: function(v) { return mc(v, 'rcv'); } }
    ];
  }
  if (fam === 'difficulty') {
    return [
      { key: 'abq', label: 'ABQ', d: 1, color: function(v) { return mc(v, 'abq'); } },
      { key: 'obr', label: 'OBR', d: 1, color: function(v) { return mc(v, 'obr'); } },
      { key: 'ppGap', label: 'PP-Gap', d: 1, color: function(v) { return mc(v, 'ppGap'); } },
      { key: 'osi', label: 'OSI', d: 1, color: function(v) { return mc(v, 'osi'); } }
    ];
  }
  if (fam === 'surface') {
    return [
      { key: 'osi', label: 'OSI', d: 1, color: function(v) { return mc(v, 'osi'); } },
      { key: 'projOSI', label: 'ProjOSI', d: 1, color: function(v) { return mc(v, 'osi'); } },
      { key: 'pals', label: 'PALS', d: 1, color: function(v) { return mc(v, 'osi'); } },
      { key: 'trend', label: 'Trend', d: null, color: function() { return '#A1A1AA'; }, trend: true }
    ];
  }
  return [
    { key: 'osi', label: 'OSI', d: 1, color: function(v) { return mc(v, 'osi'); } },
    { key: 'wrc', label: 'wRC+', d: 0, color: function(v) { return wrcColor(v); } },
    { key: 'abq', label: 'ABQ', d: 1, color: function(v) { return mc(v, 'abq'); } },
    { key: 'trend', label: 'Trend', d: null, color: function() { return '#A1A1AA'; }, trend: true }
  ];
}

function rankInfo(rows, key, team) {
  var pool = (rows || []).filter(function(r) { return r && r[key] != null && !isNaN(r[key]); })
    .slice()
    .sort(function(a, b) { return b[key] - a[key]; });
  if (!pool.length) return null;
  var idx = pool.findIndex(function(r) { return r.t === team; });
  if (idx < 0) return null;
  var rank = idx + 1;
  var pct = pool.length > 1 ? Math.round(((pool.length - rank) / (pool.length - 1)) * 100) : 100;
  return { rank: rank, total: pool.length, pct: pct };
}

var TEAM_HELP_DEFAULT = 'Aliases supported: SF, TB, KC, SD, WSH, OAK, AZ';

function setTeamInputStatus(msg, isError) {
  var status = document.getElementById('hubTeamStatus');
  var input = document.getElementById('hubTeamSelect');
  if (status) {
    status.textContent = msg || TEAM_HELP_DEFAULT;
    status.classList.toggle('is-error', !!isError);
  }
  if (input) input.classList.toggle('is-invalid', !!isError);
}

function renderTeamCards(target, allRows) {
  var cards = document.getElementById('hubTeamCards');
  var tableWrap = document.getElementById('hubTableWrap');
  if (!cards || !tableWrap || !target) return false;
  var defs = familyMetricDefs();
  var intro = (HUB.family || 'summary') + ' · ' + (HUB.filter && HUB.filter.window ? HUB.filter.window : 'YTD');
  var body = '<div class="hub-team-title">' + hubTeamLogo(target.t) + '<h2>' + esc(target.t) + '</h2></div>'
    + '<div class="hub-team-sub">' + esc(intro) + '</div><div class="hub-kpi-grid">';
  defs.forEach(function(def) {
    var v = target[def.key];
    var val = def.trend
      ? '<span class="trend-badge" style="background:' + trendColor(v) + '22;color:' + trendColor(v) + '">' + esc(v || 'Stable') + '</span>'
      : fmt(v, def.d);
    var ri = def.trend ? null : rankInfo(allRows, def.key, target.t);
    var meter = ri ? '<div class="hub-kpi-meter"><span style="width:' + ri.pct + '%"></span></div>' : '';
    var meta = ri ? ('<span>' + ordinal(ri.rank) + ' of ' + ri.total + '</span><span>' + ordinal(ri.pct) + ' pct</span>') : '<span>—</span><span>—</span>';
    var valClass = def.trend ? 'hub-kpi-val hub-kpi-val--tag' : 'hub-kpi-val';
    body += '<article class="hub-kpi-card"><div class="hub-kpi-lab">' + esc(def.label) + '</div>'
      + '<div class="' + valClass + '" style="color:' + (def.color ? def.color(v) : '#F4F4F7') + '">' + val + '</div>'
      + '<div class="hub-kpi-meta">' + meta + '</div>' + meter + '</article>';
  });
  body += '</div>';
  cards.innerHTML = body;
  cards.classList.add('show');
  tableWrap.style.display = 'none';
  return true;
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
  if (hubS && hubS.blendSplits) return hubS.blendSplits(scR, scL);
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

function buildPalsMap() {
  _hubPalsMap = {};
  if (!window.LIVE_DATA || !window.LIVE_DATA.pals || !hubS) return;
  (window.LIVE_DATA.pals || []).forEach(function(p) {
    var tk = teamKey(hubS.pickCol(p, 'team', 'Tm', 'Team'));
    if (tk) _hubPalsMap[tk] = num(hubS.pickCol(p, 'PALS', 'pals'));
  });
}

function currentFilterKey(state) {
  var s = state || HUB;
  var f = s.filter || {};
  if (hubS && hubS.filterKey) return hubS.filterKey(f);
  return [f.hand, f.location, f.pitcher, f.batSide, f.segment, f.window].join('|');
}

function cloneEnrichedRows(rows) {
  return (rows || []).map(function(d) {
    return Object.assign({}, d);
  });
}

function rebuildMasterRows() {
  normalizeHubState();
  if (hubS && hubS.resolveLineupRows) {
    return hubS.resolveLineupRows(hubData(), HUB.filter || {});
  }
  if (!_hubFallbackWarned) {
    _hubFallbackWarned = true;
    console.warn('[HUB] shared resolver missing; returning empty rows to avoid divergent local resolver path');
  }
  return [];
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
  normalizeHubState();
  var saved = {
    hand: HUB.filter.hand,
    window: HUB.filter.window,
    location: HUB.filter.location,
    segment: HUB.filter.segment
  };
  HUB_HANDS.forEach(function(hand) {
    HUB_WINDOWS.forEach(function(win) {
      HUB_LOCS.forEach(function(loc) {
        HUB_LINEUPS.forEach(function(lineup) {
          HUB.filter.hand = hand;
          HUB.filter.window = win;
          HUB.filter.location = loc;
          HUB.filter.segment = lineup;
          syncLegacyFilterFields();
          _hubRowCache[currentFilterKey()] = cloneEnrichedRows(rebuildMasterRows());
        });
      });
    });
  });
  HUB.filter.hand = saved.hand;
  HUB.filter.window = saved.window;
  HUB.filter.location = saved.location;
  HUB.filter.segment = saved.segment;
  syncLegacyFilterFields();
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
  var f = HUB.filter || {};
  var scopeLbl = HUB.scope && HUB.scope.mode === 'team' ? 'One team' : 'All teams';
  var familyLbl = HUB.family || 'summary';
  var handLbl = { both: 'both', r: 'vs RHP', l: 'vs LHP' }[f.hand] || f.hand;
  var locLbl = { all: 'all', home: 'home', away: 'away' }[f.location] || f.location;
  var pitchLbl = { both: 'both', sp: 'vs SP', rp: 'vs RP' }[f.pitcher] || f.pitcher;
  var sideLbl = { both: 'both', rhb: 'as RHB', lhb: 'as LHB' }[f.batSide] || f.batSide;
  var segLbl = f.segment === 'f5' ? 'F5' : 'full game';
  var winLbl = f.window || 'YTD';
  return esc(scopeLbl) + ' \u00B7 ' + esc(familyLbl) + ' \u00B7 ' + esc(handLbl)
    + ' \u00B7 ' + esc(locLbl) + ' \u00B7 ' + esc(pitchLbl)
    + ' \u00B7 ' + esc(sideLbl) + ' \u00B7 ' + esc(segLbl) + ' \u00B7 ' + esc(winLbl);
}

function syncControlPills() {
  normalizeHubState();
  var bar = document.getElementById('hubControlBar');
  if (!bar) return;
  bar.querySelectorAll('[data-hub-key]').forEach(function(btn) {
    var key = btn.getAttribute('data-hub-key');
    var val = btn.getAttribute('data-val');
    btn.classList.toggle('active', HUB.filter && HUB.filter[key] === val);
  });
  bar.querySelectorAll('[data-hub-scope]').forEach(function(btn) {
    var mode = btn.getAttribute('data-hub-scope');
    btn.classList.toggle('active', HUB.scope && HUB.scope.mode === mode);
  });
  document.querySelectorAll('[data-hub-family]').forEach(function(btn) {
    var fam = btn.getAttribute('data-hub-family');
    btn.classList.toggle('active', (HUB.family || 'summary') === fam);
  });
  var conf = document.getElementById('hubConfirm');
  if (conf) conf.textContent = confirmLine();
  var adv = document.getElementById('hubAdvCols');
  if (adv) adv.checked = HUB.showAdvanced;
  syncTeamSelector();
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
    persistUrlState();
  });
}

function setFilter(key, val) {
  normalizeHubState();
  if (!HUB || val == null || !key) return;
  if (key === 'lineup') key = 'segment';
  var next = String(val);
  if (HUB.filter && HUB.filter[key] === next) {
    applyFilterChange();
    return;
  }
  if (HUB.filter && Object.prototype.hasOwnProperty.call(HUB.filter, key)) {
    HUB.filter[key] = next;
    if (hubS && hubS.createFilterState) HUB.filter = hubS.createFilterState(HUB.filter);
    syncLegacyFilterFields();
  } else {
    HUB[key] = next;
  }
  applyFilterChange();
}

function setScopeMode(mode) {
  normalizeHubState();
  var next = String(mode || 'all').toLowerCase();
  if (next !== 'team') next = 'all';
  if (HUB.scope.mode === next) {
    applyFilterChange();
    return;
  }
  HUB.scope.mode = next;
  if (next === 'all') HUB.scope.team = null;
  applyFilterChange();
}

function setFamily(mode) {
  normalizeHubState();
  var next = String(mode || 'summary').toLowerCase();
  if (!isAllowedValue(next, ['summary', 'surface', 'scoring', 'difficulty'])) next = 'summary';
  if (HUB.family === next) {
    applyFilterChange();
    return;
  }
  HUB.family = next;
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

function hubScopePick(mode) {
  setScopeMode(mode);
}

function hubFamilyPick(mode) {
  setFamily(mode);
}

var TEAM_INPUT_ALIASES = {
  TB: 'TBR',
  WSH: 'WSN',
  WS: 'WSN',
  KC: 'KCR',
  CWS: 'CHW',
  CHISOX: 'CHW',
  SD: 'SDP',
  SF: 'SFG',
  OAK: 'ATH',
  AZ: 'ARI',
  ARZ: 'ARI'
};

function resolveTeamInput(raw, teams) {
  var input = teamKey(raw).replace(/[^A-Z]/g, '');
  if (!input) return null;
  var allowed = {};
  (teams || []).forEach(function(t) { allowed[teamKey(t)] = true; });
  if (allowed[input]) return input;
  var aliased = TEAM_INPUT_ALIASES[input];
  if (aliased && allowed[aliased]) return aliased;
  var starts = (teams || []).filter(function(t) { return teamKey(t).indexOf(input) === 0; });
  if (starts.length === 1) return teamKey(starts[0]);
  return null;
}

function hubSelectTeam(team) {
  normalizeHubState();
  var teams = allTeamsForSelector();
  var t = resolveTeamInput(team, teams);
  if (!t) {
    setTeamInputStatus('Team not found. Try a 3-letter team code or alias (e.g. SFG or SF).', true);
    return;
  }
  HUB.scope.mode = 'team';
  HUB.scope.team = t;
  setTeamInputStatus('', false);
  applyFilterChange();
}

function hubApplyTeamInput() {
  var input = document.getElementById('hubTeamSelect');
  if (!input) return;
  hubSelectTeam(input.value);
}

function hubTeamInputKeydown(e) {
  var ev = e || window.event;
  var key = ev && (ev.key || ev.code);
  if (key === 'Enter' || key === 'NumpadEnter') {
    if (ev && ev.preventDefault) ev.preventDefault();
    hubApplyTeamInput();
  }
}

function setHand(h) { setFilter('hand', h); }
function setWindow(win) { setFilter('window', win); }
function setLocation(loc) { setFilter('location', loc); }
function setLineup(mode) { setFilter('segment', mode); }

function allTeamsForSelector() {
  var seen = {};
  var out = [];
  [HUB.scBoth || [], HUB.scR || [], HUB.scL || []].forEach(function(rows) {
    (rows || []).forEach(function(r) {
      var t = teamKey(r && r.t);
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    });
  });
  return out.sort();
}

function syncTeamSelector() {
  var wrap = document.getElementById('hubTeamSelectWrap');
  var input = document.getElementById('hubTeamSelect');
  var list = document.getElementById('hubTeamOptions');
  if (!wrap || !input || !list) return;
  var show = HUB.scope && HUB.scope.mode === 'team';
  wrap.classList.toggle('show', !!show);
  if (!show) {
    setTeamInputStatus('', false);
    return;
  }
  var teams = allTeamsForSelector();
  var current = HUB.scope.team ? teamKey(HUB.scope.team) : '';
  if (!current && teams.length) {
    current = teams[0];
    HUB.scope.team = current;
  }
  var sig = teams.join('|');
  if (input.dataset.teamSig !== sig) {
    input.dataset.teamSig = sig;
    var html = '';
    teams.forEach(function(t) {
      html += '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    });
    Object.keys(TEAM_INPUT_ALIASES).sort().forEach(function(a) {
      var canonical = TEAM_INPUT_ALIASES[a];
      if (teams.indexOf(canonical) >= 0) html += '<option value="' + esc(a) + '">' + esc(a) + ' \u2192 ' + esc(canonical) + '</option>';
    });
    list.innerHTML = html;
  }
  if (input.value !== (current || '')) input.value = current || '';
  setTeamInputStatus('', false);
}

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
  return [HUB.sortKey, HUB.sortDir, HUB.showAdvanced ? '1' : '0', HUB.family || 'summary'].join('|');
}

function familyVisibleColumns() {
  var fam = HUB.family || 'summary';
  if (fam === 'scoring') return { osi: true, rcv: true, wrc: true, woba: true, xwoba: true, slg: true, trend: true };
  if (fam === 'difficulty') return { osi: true, abq: true, obr: true, ppGap: true, trend: true };
  if (fam === 'surface') return { osi: true, projOSI: true, pals: true, trend: true };
  return { osi: true, wrc: true, abq: true, trend: true };
}

function showAdvCol(col, advEnabled, visibleSet) {
  if (!visibleSet[col]) return false;
  if (col === 'projOSI' || col === 'pals') return (HUB.family || 'summary') === 'surface' || advEnabled;
  if (col === 'ppGap') return advEnabled || (HUB.family || 'summary') === 'difficulty';
  return true;
}

function updateHead() {
  var head = document.getElementById('hubTableHead');
  if (!head) return;
  var stateKey = hubHeadStateKey();
  if (stateKey === _hubHeadState) return;
  _hubHeadState = stateKey;
  var adv = HUB.showAdvanced;
  var visible = familyVisibleColumns();
  function thIf(col, html) { return visible[col] ? html : ''; }
  function thAdvIf(col, html) { return showAdvCol(col, adv, visible) ? html : ''; }
  head.innerHTML = ''
    + '<th data-sort="rank">#' + sortArrow('rank') + '</th>'
    + '<th data-sort="t">Team' + sortArrow('t') + '</th>'
    + thIf('osi', '<th data-sort="osi" class="col-primary' + (HUB.sortKey === 'osi' ? ' sorted' : '') + '">OSI' + sortArrow('osi') + '</th>')
    + thIf('obr', '<th data-sort="obr">OBR' + sortArrow('obr') + '</th>')
    + thIf('rcv', '<th data-sort="rcv">RCV' + sortArrow('rcv') + '</th>')
    + thIf('abq', '<th data-sort="abq">ABQ' + sortArrow('abq') + '</th>')
    + thIf('wrc', '<th data-sort="wrc">wRC+' + sortArrow('wrc') + '</th>')
    + thIf('woba', '<th data-sort="woba">wOBA' + sortArrow('woba') + '</th>')
    + thIf('xwoba', '<th data-sort="xwoba">xwOBA' + sortArrow('xwoba') + '</th>')
    + thIf('slg', '<th data-sort="slg">SLG' + sortArrow('slg') + '</th>')
    + thIf('trend', '<th data-sort="trend">TREND' + sortArrow('trend') + '</th>')
    + thAdvIf('ppGap', '<th data-sort="ppGap">PP-Gap' + sortArrow('ppGap') + '</th>')
    + thAdvIf('projOSI', '<th data-sort="projOSI">ProjOSI' + sortArrow('projOSI') + '</th>')
    + thAdvIf('pals', '<th data-sort="pals">PALS' + sortArrow('pals') + '</th>');
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
  var cards = document.getElementById('hubTeamCards');
  var tableWrap = document.getElementById('hubTableWrap');
  if (!body) return;
  if (cards) cards.classList.remove('show');
  if (tableWrap) tableWrap.style.display = '';
  if (!HUB.loaded) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--text-2)">Loading team data from Google Sheets\u2026</td></tr>';
    return;
  }
  if (!HUB.scR.length) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:#F87171">Could not load vs_RHP sheet data.</td></tr>';
    return;
  }
  var rows;
  var allRows;
  var filterKey = currentFilterKey();
  try {
    allRows = sortRows(rowsForCurrentFilter());
    rows = allRows.slice();
    if (HUB.scope && HUB.scope.mode === 'team') {
      var target = HUB.scope.team || HUB.expandedTeam || (rows[0] && rows[0].t) || null;
      rows = target ? rows.filter(function(r) { return r.t === target; }) : rows;
      if (!rows.length && allRows.length) {
        target = allRows[0].t;
        rows = [allRows[0]];
      }
      HUB.scope.team = target;
      if (rows.length && renderTeamCards(rows[0], allRows)) {
        body.innerHTML = '';
        body.setAttribute('data-hub-filter', filterKey);
        hideHubLoading();
        return;
      }
    }
    registerPoolsForRows(allRows);
  } catch (err) {
    console.error('[HUB] rebuild rows failed', err);
    body.innerHTML = '<tr><td colspan="13" style="color:#F87171;padding:16px">Filter error — hard refresh. ' + esc(err.message || String(err)) + '</td></tr>';
    return;
  }
  hideHubLoading();
  var advShow = HUB.showAdvanced;
  var visible = familyVisibleColumns();
  function tdIf(col, html) { return visible[col] ? html : ''; }
  function tdAdvIf(col, html) { return showAdvCol(col, advShow, visible) ? html : ''; }
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
      + tdIf('osi', '<td class="col-primary" style="color:' + mc(d.osi, 'osi') + ';font-weight:700">' + fmt(d.osi) + '</td>')
      + tdIf('obr', '<td style="color:' + mc(d.obr, 'obr') + '">' + fmt(d.obr) + '</td>')
      + tdIf('rcv', '<td style="color:' + mc(d.rcv, 'rcv') + '">' + fmt(d.rcv) + '</td>')
      + tdIf('abq', '<td style="color:' + mc(d.abq, 'abq') + '">' + fmt(d.abq) + '</td>')
      + tdIf('wrc', '<td style="color:' + wrcColor(d.wrc) + '">' + fmt(d.wrc, 0) + '</td>')
      + tdIf('woba', '<td style="color:' + wobaColor(d.woba) + '">' + wobaStr + '</td>')
      + tdIf('xwoba', '<td style="color:' + wobaColor(d.xwoba) + '">' + xwobaStr + '</td>')
      + tdIf('slg', '<td style="color:' + slgColor(d.slg) + '">' + slgStr + '</td>')
      + tdIf('trend', '<td><span class="trend-badge" style="background:' + tc + '22;color:' + tc + '">' + esc(d.trend) + '</span></td>')
      + tdAdvIf('ppGap', '<td style="color:' + mc(d.ppGap, 'ppGap') + '">' + fmt(d.ppGap) + '</td>')
      + tdAdvIf('projOSI', '<td style="color:' + projColor(d.projOSI, d.osi) + '">' + fmt(d.projOSI) + '</td>')
      + tdAdvIf('pals', '<td>' + fmt(d.pals) + '</td>')
      + '</tr>';
  });
  body.innerHTML = rows.length ? html : '<tr><td colspan="13">No team data loaded.</td></tr>';
  body.setAttribute('data-hub-filter', filterKey);
}

function updateBanners(runDetect) {
  var f = HUB.filter || {};
  var msg = HUB.dataIssue || '';
  var wBan = document.getElementById('hubWindowBanner');
  if (wBan) {
    if (runDetect && !msg && detectFlatHandData()) {
      msg = 'vs_RHP and vs_LHP show identical OSI/ABQ in Google Sheets \u2014 re-run compute + push_sheets so handedness toggles work on YTD.';
    } else if (!msg && (f.location === 'home' || f.location === 'away')) {
      var locN = f.location === 'home' ? (HUB.scHome || []).length : (HUB.scAway || []).length;
      if (locN < 10) {
        msg = 'Home/Away split data sparse \u2014 run scrape_batter_splits (home/away) then compute_team_profile + push_team_profiles.';
      }
    } else if (runDetect && !msg && f.window !== 'YTD' && detectFlatWindowData()) {
      msg = 'L30 / L14 / L7 show the same values in Team_Profiles (pipeline needs dated batter splits). Home/Away still works.';
    } else if (!msg && f.window !== 'YTD' && !HUB.windowAvail[f.window]) {
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
    if (!msg && (f.location === 'home' || f.location === 'away')) {
      var locN = f.location === 'home' ? (HUB.scHome || []).length : (HUB.scAway || []).length;
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
    if (HUB.scope && HUB.scope.mode === 'team') HUB.scope.team = t;
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
  normalizeHubState();
  applyUrlState();
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
  window.hubLoadData = hubLoadData;
  window.initHub = initHub;
  window.hubSetFilter = setFilter;
  window.hubScopePick = hubScopePick;
  window.hubFamilyPick = hubFamilyPick;
  window.hubSelectTeam = hubSelectTeam;
  window.hubApplyTeamInput = hubApplyTeamInput;
  window.hubTeamInputKeydown = hubTeamInputKeydown;
  window.hubResetFilters = function() {
    normalizeHubState();
    HUB.filter = hubS && hubS.createFilterState
      ? hubS.createFilterState()
      : { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' };
    HUB.scope = hubS && hubS.createScopeState ? hubS.createScopeState() : { mode: 'all', team: null };
    HUB.family = 'summary';
    syncLegacyFilterFields();
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
