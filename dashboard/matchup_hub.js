// matchup_hub.js
window.matchupHubLoaded = false;

var hubA = null;
var hubS = null;
var HUB;

try {
  hubA = null;
  hubS = null;
} catch (e) {
  console.error('[HUB] globals crash:', e.message, e.stack);
}
function bindHubGlobals() {
  window.MatchupShared = window.MLBMASharedMatchup;
  hubA = window.MLBMAAssets || null;
  hubS = window.MLBMASharedMatchup || null;
  return window.MLBMA_CONFIG && window.MLBMA_CONFIG.SHEET_TABS;
}

try {
  HUB = {
    scR: [], scL: [], scBoth: [], splitHome: [], splitAway: [], teamProfiles: {},
    windowAvail: { L30: false, L14: false, L7: false },
    locationAvail: { home: false, away: false },
    hand: 'both', activeSplit: 'both', window: 'YTD', activeWindow: 'ytd', location: 'all',
    showAdvanced: false, sortKey: 'osi', sortDir: -1,
    expandedTeam: null, loaded: false
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
  if (ctx === 'projOSI' && v != null) {
    return '#71717A';
  }
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
  return hubS ? hubS.pickCol(row, keys) : (row && row[keys[0]]);
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

function buildLocationSplitRows(splitRows, scoreFn, locOsiKey) {
  var scored = [];
  (splitRows || []).forEach(function(row) {
    var s = scoreFn ? scoreFn(row) : null;
    if (s) scored.push(s);
  });
  if (scored.length >= 10) return scored;
  var base = HUB.scBoth.length ? HUB.scBoth : HUB.scR;
  if (!base.length) return [];
  return base.map(function(r) {
    var prof = HUB.teamProfiles[r.t] || {};
    var locOsi = prof[locOsiKey];
    if (locOsi == null) return null;
    var ratio = r.osi ? locOsi / r.osi : 1;
    return Object.assign({}, r, {
      osi: locOsi,
      abq: r.abq != null ? r.abq * ratio : r.abq,
      rcv: r.rcv != null ? r.rcv * ratio : r.rcv,
      obr: r.obr != null ? r.obr * ratio : r.obr,
      projOSI: r.projOSI != null ? r.projOSI * ratio : locOsi
    });
  }).filter(Boolean);
}

function overlayLocationRows(baseRows, locRows) {
  var locMap = {};
  (locRows || []).forEach(function(r) { locMap[r.t] = r; });
  return (baseRows || []).map(function(r) {
    var loc = locMap[r.t];
    if (!loc) return Object.assign({}, r);
    return Object.assign({}, r, {
      abq: loc.abq != null ? loc.abq : r.abq,
      rcv: loc.rcv != null ? loc.rcv : r.rcv,
      obr: loc.obr != null ? loc.obr : r.obr,
      osi: loc.osi != null ? loc.osi : r.osi,
      projOSI: loc.projOSI != null ? loc.projOSI : r.projOSI,
      ppGap: loc.ppGap != null ? loc.ppGap : r.ppGap
    });
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

function fixSplitColumns(rows) {
  var fixed = [];
  for (var i = 0; i < rows.length; i++) {
    var row = Object.assign({}, rows[i]);
    var keys = Object.keys(row);
    keys.forEach(function(col, colIdx) {
      var val = row[col];
      if (typeof val !== 'string') return;
      if (val.charAt(0) !== '[' && val.charAt(0) !== '{') return;
      var combined = val;
      var k = colIdx + 1;
      while (k < keys.length) {
        var opens = (combined.match(/\{/g) || []).length;
        var closes = (combined.match(/\}/g) || []).length;
        if (opens === closes && opens > 0) break;
        combined += ', ' + (row[keys[k]] || '');
        row[keys[k]] = '__consumed__';
        k++;
      }
      row[col] = combined;
    });
    fixed.push(row);
  }
  return fixed;
}

function parseTeamProfiles(rows) {
  rows = fixSplitColumns(rows || []);
  var map = {};
  (rows || []).forEach(function(row) {
    var t = teamKey(pick(row, ['team', 'Tm', 'Team']));
    if (!t) return;
    map[t] = {
      osi_l30: extractWindowOSI(pick(row, ['osi_l30', 'OSI_L30', 'OSI L30', 'L30_OSI'])),
      osi_l14: extractWindowOSI(pick(row, ['osi_l14', 'OSI_L14', 'OSI L14', 'L14_OSI'])),
      osi_l7: extractWindowOSI(pick(row, ['osi_l7', 'OSI_L7', 'OSI L7', 'L7_OSI'])),
      home_osi: num(pick(row, ['home_osi', 'Home_OSI'])),
      away_osi: num(pick(row, ['away_osi', 'Away_OSI']))
    };
  });
  return map;
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

function windowOsi(prof, win) {
  if (!prof) return null;
  if (win === 'L30') return prof.osi_l30;
  if (win === 'L14') return prof.osi_l14;
  if (win === 'L7') return prof.osi_l7;
  return null;
}

function applyWindowToRow(d) {
  if (HUB.window === 'YTD') return d;
  var prof = HUB.teamProfiles[d.t] || HUB.teamProfiles[teamKey(d.t)] || {};
  if (!HUB.windowAvail[HUB.window]) return d;
  var wOsi = windowOsi(prof, HUB.window);
  if (wOsi == null || isNaN(wOsi)) return d;
  var ratio = d.ytdOSI ? wOsi / d.ytdOSI : 1;
  var out = Object.assign({}, d, { osi: wOsi });
  ['abq', 'rcv', 'obr', 'projOSI', 'wrc', 'xwoba', 'slg'].forEach(function(k) {
    if (out[k] != null && !isNaN(out[k])) out[k] = out[k] * ratio;
  });
  if (out.ppGap == null && out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
  out.tier = tierInfo(out.osi);
  out.trend = computeTrend(d.ytdOSI, d.l14OSI, d.l7OSI);
  out.takeaway = computeTakeaway(out);
  return out;
}

function enrichRow(base) {
  var t = base.t;
  var prof = HUB.teamProfiles[t] || {};
  var d = Object.assign({}, base);
  if (d.ppGap == null && d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
  d.ytdOSI = base.osi;
  d.l30OSI = windowOsi(prof, 'L30');
  d.l14OSI = windowOsi(prof, 'L14');
  d.l7OSI = windowOsi(prof, 'L7');
  d.trend = computeTrend(d.ytdOSI, d.l14OSI, d.l7OSI);
  d.tier = tierInfo(d.osi);
  d.takeaway = computeTakeaway(d);
  if (d.pals == null && window.LIVE_DATA && window.LIVE_DATA.pals && window.MLBMASharedMatchup) {
    var pmap = {};
    (window.LIVE_DATA.pals || []).forEach(function(p) {
      var tk = hubS && hubS.pickCol ? teamKey(hubS.pickCol(p, 'team', 'Tm', 'Team')) : null;
      if (tk) pmap[tk] = hubS && hubS.pickCol ? num(hubS.pickCol(p, 'PALS', 'pals')) : null;
    });
    d.pals = pmap[t];
  }
  return applyWindowToRow(d);
}

function buildScBothFromHandedness() {
  if (!HUB.scR || !HUB.scR.length || !HUB.scL || !HUB.scL.length) return;
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

function rebuildMasterRows() {
  var hand = HUB.hand || 'both';
  var base;

  if (hand === 'r') {
    base = HUB.scR && HUB.scR.length ? HUB.scR.slice() : null;
  } else if (hand === 'l') {
    base = HUB.scL && HUB.scL.length ? HUB.scL.slice() : null;
  } else if (hand === 'f5') {
    var src = (HUB.scBoth && HUB.scBoth.length) ? HUB.scBoth : HUB.scR;
    base = (src || []).map(function(r) {
      return Object.assign({}, r, {
        osi: (r.abq * 0.45) + (r.obr * 0.35) + (r.rcv * 0.20)
      });
    });
  } else {
    base = (HUB.scBoth && HUB.scBoth.length) ? HUB.scBoth.slice() : (HUB.scR ? HUB.scR.slice() : null);
  }

  if (!base || !base.length) {
    console.warn('[HUB] rebuildMasterRows: no rows for hand=' + hand + ', falling back to scR');
    base = (HUB.scR || []).slice();
  }

  var location = HUB.location || 'all';
  if (location === 'home' && HUB.splitHome && HUB.splitHome.length) {
    base = overlayLocationRows(base, HUB.splitHome);
  } else if (location === 'away' && HUB.splitAway && HUB.splitAway.length) {
    base = overlayLocationRows(base, HUB.splitAway);
  }

  HUB.activeSplit = hand;
  var rows = (base || []).map(function(r) {
    return enrichRow(Object.assign({}, r));
  });
  if (hubA && hubA.registerLeaguePool) {
    ['osi', 'abq', 'rcv', 'obr', 'projOSI', 'ppGap', 'wrc', 'xwoba', 'slg'].forEach(function(k) {
      hubA.registerLeaguePool(k, rows.map(function(d) { return d[k]; }));
    });
  }
  return rows;
}

function sortRows(rows) {
  var k = HUB.sortKey;
  var dir = HUB.sortDir;
  return (rows || []).slice().sort(function(a, b) {
    var av = a[k], bv = b[k];
    if (k === 'rank') {
      av = a.osi; bv = b.osi;
    }
    if (av == null || isNaN(av)) return 1;
    if (bv == null || isNaN(bv)) return -1;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  });
}

function confirmLine() {
  var handLbl = { both: 'Both', r: 'vs RHP', l: 'vs LHP', f5: 'F5' }[HUB.hand] || HUB.hand;
  var locLbl = { all: 'All', home: 'Home', away: 'Away' }[HUB.location] || HUB.location;
  return 'Showing: <strong>OSI</strong> \u00B7 <strong>' + esc(handLbl)
    + '</strong> \u00B7 <strong>' + esc(HUB.window) + '</strong> \u00B7 <strong>' + esc(locLbl) + '</strong>';
}

function setWindow(win) {
  HUB.window = win;
  HUB.activeWindow = win === 'YTD' ? 'ytd' : win.toLowerCase();
  renderControls();
  updateBanners();
  renderHubTable();
}

function renderControls() {
  function pills(mountId, opts, key) {
    var el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = opts.map(function(o) {
      return '<button type="button" class="hub-pill' + (HUB[key] === o.id ? ' active' : '') + '" data-val="' + o.id + '">' + esc(o.label) + '</button>';
    }).join('');
    el.querySelectorAll('.hub-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var v = btn.getAttribute('data-val');
        if (key === 'window') setWindow(v);
        else {
          HUB[key] = v;
          renderControls();
          updateBanners();
        }
        renderHubTable();
      });
    });
  }
  pills('hubHandPills', [{ id: 'both', label: 'Both' }, { id: 'r', label: 'vs RHP' }, { id: 'l', label: 'vs LHP' }, { id: 'f5', label: 'F5' }], 'hand');
  pills('hubWindowPills', [{ id: 'YTD', label: 'YTD' }, { id: 'L30', label: 'L30' }, { id: 'L14', label: 'L14' }, { id: 'L7', label: 'L7' }], 'window');
  pills('hubLocationPills', [{ id: 'all', label: 'All' }, { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' }], 'location');
  var conf = document.getElementById('hubConfirm');
  if (conf) conf.innerHTML = confirmLine();
  var adv = document.getElementById('hubAdvCols');
  if (adv) adv.checked = HUB.showAdvanced;
}

function updateBanners() {
  var wBan = document.getElementById('hubWindowBanner');
  if (wBan) {
    var showWin = HUB.window !== 'YTD' && !HUB.windowAvail[HUB.window];
    wBan.classList.toggle('show', showWin);
    if (showWin) {
      wBan.textContent = 'L30/L14/L7 window data requires pipeline enhancement \u2014 showing YTD baseline';
    }
  }
  var lBan = document.getElementById('hubLocationBanner');
  if (lBan) {
    var needLoc = HUB.location === 'home' || HUB.location === 'away';
    var homeEmpty = !(HUB.splitHome && HUB.splitHome.length);
    var awayEmpty = !(HUB.splitAway && HUB.splitAway.length);
    var locMissing = HUB.location === 'home' ? homeEmpty : (HUB.location === 'away' ? awayEmpty : false);
    var showLoc = needLoc && (locMissing || !(HUB.location === 'home' ? HUB.locationAvail.home : HUB.locationAvail.away));
    lBan.classList.toggle('show', showLoc);
    if (showLoc) {
      lBan.textContent = 'Home/Away splits require batter_splits_home/away pipeline data';
    }
  }
}

function updateHead() {
  var head = document.getElementById('hubTableHead');
  if (!head) return;
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
  head.querySelectorAll('th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var k = th.getAttribute('data-sort');
      if (HUB.sortKey === k) HUB.sortDir *= -1;
      else { HUB.sortKey = k; HUB.sortDir = -1; }
      renderHubTable();
    });
  });
}

function renderHubTable() {
  updateHead();
  var body = document.getElementById('hubTableBody');
  if (!body) return;
  if (!HUB.loaded) {
    body.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:24px;color:var(--text-2)">Loading...</td></tr>';
    return;
  }
  var rows = sortRows(rebuildMasterRows());
  hideHubLoading();
  var html = '';
  var colSpan = 13;
  rows.forEach(function(d, i) {
    var logo = hubA ? hubA.teamLogoImg(d.t, 28) : '';
    var expanded = HUB.expandedTeam === d.t;
    html += '<tr class="hub-row' + (expanded ? ' expanded' : '') + '" data-team="' + esc(d.t) + '">'
      + '<td class="hub-rank"><button type="button" class="hub-expand-btn" aria-label="Expand">' + (expanded ? '\u2212' : '+') + '</button><span class="hub-rank-num">' + (i + 1) + '</span></td>'
      + '<td><div class="hub-team-cell">' + logo + '<div><strong>' + esc(d.t) + '</strong>'
      + '<a class="hub-profile-link" href="team_profile.html?team=' + encodeURIComponent(d.t) + '" onclick="event.stopPropagation()">Profile</a></div></div></td>'
      + '<td class="col-primary" style="color:' + mc(d.osi, 'osi') + ';font-weight:700">' + fmt(d.osi) + '</td>'
      + '<td style="color:' + mc(d.obr, 'obr') + '">' + fmt(d.obr) + '</td>'
      + '<td style="color:' + mc(d.rcv, 'rcv') + '">' + fmt(d.rcv) + '</td>'
      + '<td style="color:' + mc(d.abq, 'abq') + '">' + fmt(d.abq) + '</td>'
      + '<td style="color:' + wrcColor(d.wrc) + '">' + fmt(d.wrc, 0) + '</td>'
      + '<td style="color:' + wobaColor(d.woba) + '">' + (d.woba != null && !isNaN(d.woba) ? Number(d.woba).toFixed(3) : '\u2014') + '</td>'
      + '<td style="color:' + wobaColor(d.xwoba) + '">' + (d.xwoba != null ? Number(d.xwoba).toFixed(3) : '\u2014') + '</td>'
      + '<td style="color:' + slgColor(d.slg) + '">' + (d.slg != null ? Number(d.slg).toFixed(3) : '\u2014') + '</td>'
      + '<td><span class="trend-badge" style="background:' + trendColor(d.trend) + '22;color:' + trendColor(d.trend) + '">' + esc(d.trend) + '</span></td>'
      + '<td class="col-adv' + (HUB.showAdvanced ? ' show' : '') + '" style="color:' + mc(d.ppGap, 'ppGap') + '">' + fmt(d.ppGap) + '</td>'
      + '<td class="col-adv' + (HUB.showAdvanced ? ' show' : '') + '" style="color:' + projColor(d.projOSI, d.osi) + '">' + fmt(d.projOSI) + '</td>'
      + '<td class="col-adv' + (HUB.showAdvanced ? ' show' : '') + '">' + fmt(d.pals) + '</td>'
      + '</tr>';
  });
  body.innerHTML = html || '<tr><td colspan="' + colSpan + '">No team data loaded.</td></tr>';
}

function hideHubLoading() {
  var l = document.getElementById('hubLoading');
  if (l) {
    l.classList.add('hide');
    l.style.cssText = 'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
    l.setAttribute('aria-hidden', 'true');
  }
}

function hubLoadData() {
  var TABS = HUB._tabs || bindHubGlobals();
  var MS = window.MatchupShared || window.MLBMASharedMatchup;
  if (!MS || !MS.fetchSheetTab || !TABS) {
    var body = document.getElementById('hubTableBody');
    if (body) body.innerHTML = '<tr><td colspan="13">Shared data module unavailable.</td></tr>';
    hideHubLoading();
    return Promise.resolve();
  }
  var scoreFn = window.scoreRowFromSheet || (window.MatchupShared && window.MatchupShared.scoreRowFromSheet) || MS.scoreRowFromSheet;
  if (!scoreFn) {
    console.error('[HUB] scoreRowFromSheet not found');
    hideHubLoading();
    return Promise.resolve();
  }
  function scoreRaw(row) {
    return scoreFn(row);
  }
  return MS.fetchSheetTab(TABS.vs_rhp).then(function(rows) {
    HUB.scR = (rows || []).map(scoreRaw).filter(Boolean);
    return Promise.all([
      MS.fetchSheetTab(TABS.vs_lhp),
      MS.fetchSheetTab(TABS.team_profiles).catch(function() { return []; }),
      MS.fetchSheetTab(TABS.batter_splits_home).catch(function() { return []; }),
      MS.fetchSheetTab(TABS.batter_splits_away).catch(function() { return []; })
    ]);
  }).then(function(res) {
    HUB.scL = (res[0] || []).map(scoreRaw).filter(Boolean);
    HUB.teamProfiles = parseTeamProfiles(res[1] || []);
    HUB.scBoth = mergeBoth(HUB.scR, HUB.scL);
    if ((!HUB.scBoth || !HUB.scBoth.length) && HUB.scR.length && HUB.scL.length) {
      buildScBothFromHandedness();
    }
    HUB.splitHome = buildLocationSplitRows(res[2] || [], scoreFn, 'home_osi');
    HUB.splitAway = buildLocationSplitRows(res[3] || [], scoreFn, 'away_osi');
    HUB.locationAvail.home = HUB.splitHome.length >= 10;
    HUB.locationAvail.away = HUB.splitAway.length >= 10;
    ['L30', 'L14', 'L7'].forEach(function(w) {
      var field = w === 'L30' ? 'osi_l30' : w === 'L14' ? 'osi_l14' : 'osi_l7';
      HUB.windowAvail[w] = Object.keys(HUB.teamProfiles).filter(function(t) {
        return HUB.teamProfiles[t][field] != null;
      }).length >= 20;
    });
    HUB.loaded = true;
    updateBanners();
    renderHubTable();
    console.log('[HUB] hubLoadData complete');
    hideHubLoading();
  }).catch(function(err) {
    console.error('[HUB] load failed', err);
    HUB.loaded = true;
    renderHubTable();
    hideHubLoading();
  });
}

function bindHubRowClicks() {
  var body = document.getElementById('hubTableBody');
  if (!body || body.dataset.bound) return;
  body.dataset.bound = '1';
  body.addEventListener('click', function(e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr.hub-row');
    if (!tr) return;
    var t = tr.getAttribute('data-team');
    HUB.expandedTeam = HUB.expandedTeam === t ? null : t;
    renderHubTable();
  });
}

function initHub() {
  var TABS = bindHubGlobals();
  if (!TABS) {
    console.error('[HUB] MLBMA_CONFIG not loaded yet, retry in 500ms');
    setTimeout(initHub, 500);
    return;
  }
  HUB._tabs = TABS;
  bindHubRowClicks();
  renderControls();
  updateBanners();
  var advEl = document.getElementById('hubAdvCols');
  if (advEl) {
    advEl.addEventListener('change', function(e) {
      HUB.showAdvanced = e.target.checked;
      renderHubTable();
    });
  } else {
    console.warn('[HUB] hubAdvCols element not found');
  }
  renderHubTable();
  hubLoadData().finally(function() {
    hideHubLoading();
  });
}

try {
  window.HUB = HUB;
  window.renderHubTable = renderHubTable;
  window.hubLoadData = hubLoadData;
  window.initHub = initHub;
} catch (e) {
  console.error('[HUB] exports crash:', e.message, e.stack);
}
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      try {
        initHub();
      } catch (e) {
        console.error('[HUB] initHub crash (DOMContentLoaded):', e.message, e.stack);
        hideHubLoading();
      }
    });
  } else {
    try {
      initHub();
    } catch (e) {
      console.error('[HUB] initHub crash (immediate):', e.message, e.stack);
      hideHubLoading();
    }
  }
} catch (e) {
  console.error('[HUB] DOM listener crash:', e.message, e.stack);
}
window.matchupHubLoaded = true;
