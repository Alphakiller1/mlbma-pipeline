/**
 * Compact offense splits rank chart — matchup compare LvL pane.
 * League rank heatmap: wRC+, OPS, wOBA, SLG × L7/L14/L30/YTD × split lens.
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var A = global.MLBMAAssets;

  var STATS = [
    { key: 'wrc', label: 'wRC+', ctx: 'wrc' },
    { key: 'ops', label: 'OPS', ctx: 'ops' },
    { key: 'woba', label: 'wOBA', ctx: 'woba' },
    { key: 'slg', label: 'SLG', ctx: 'slg' }
  ];

  var PITCHER_SPLIT_STATS = [
    { key: 'xfip', label: 'xFIP', ctx: 'xfip', invert: true, decimals: 2 },
    { key: 'k_pct', label: 'K%', ctx: 'kpct', invert: false, decimals: 1 },
    { key: 'bb_pct', label: 'BB%', ctx: 'bbpct', invert: true, decimals: 1 },
    { key: 'obp', label: 'OBP', ctx: 'obp', invert: true, decimals: 3 }
  ];

  var WINDOWS = [
    { key: 'l7', label: 'L7' },
    { key: 'l14', label: 'L14' },
    { key: 'l30', label: 'L30' },
    { key: 'ytd', label: 'YTD' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lvpSectionHead(title, desc) {
    if (global.MatchupLvP && MatchupLvP.lvpSectionHead) {
      return MatchupLvP.lvpSectionHead(title, desc);
    }
    return '<header class="mc-lvp-section-head">'
      + '<h3 class="mc-lvp-section-head__title">' + esc(title) + '</h3>'
      + (desc ? '<p class="mc-lvp-section-head__desc">' + esc(desc) + '</p>' : '')
      + '</header>';
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function aggToMap(list) {
    var map = {};
    (list || []).forEach(function(r) {
      if (r && r.t) map[r.t] = r;
    });
    return map;
  }

  function ratesFromRow(row) {
    if (!row) return null;
    var ops = num(row.ops);
    var obp = num(row.obp);
    var slg = num(row.slg);
    if (ops == null && obp != null && slg != null) ops = Math.round((obp + slg) * 1000) / 1000;
    return {
      wrc: num(row.wrc),
      ops: ops,
      woba: num(row.woba),
      slg: slg
    };
  }

  function ratesFromProfileLoc(prof, loc) {
    if (!prof) return null;
    var wrc = num(prof[loc + '_wrc']);
    var woba = num(prof[loc + '_woba']);
    var slg = num(prof[loc + '_slg']);
    if (wrc == null && woba == null && slg == null) return null;
    return { wrc: wrc, woba: woba, slg: slg, ops: null };
  }

  function windowScale(prof, window) {
    if (!prof || window === 'ytd') return 1;
    var ytd = num(prof.osi_ytd) != null ? num(prof.osi_ytd) : num(prof.osi);
    if (ytd == null || Math.abs(ytd) < 0.01) return 1;
    var wKey = window === 'l30' ? 'osi_l30' : window === 'l14' ? 'osi_l14' : 'osi_l7';
    var wVal = num(prof[wKey]);
    if (wVal == null) return 1;
    return wVal / ytd;
  }

  function scaleRates(rates, scale) {
    if (!rates || scale == null || isNaN(scale) || Math.abs(scale - 1) < 0.001) return rates;
    function s(v) {
      return v != null ? Math.round(v * scale * 1000) / 1000 : null;
    }
    return {
      wrc: rates.wrc != null ? Math.round(rates.wrc * scale * 10) / 10 : null,
      ops: s(rates.ops),
      woba: s(rates.woba),
      slg: s(rates.slg)
    };
  }

  function applyWindowRates(ytdRates, prof, window, recentRates) {
    if (!ytdRates) return null;
    if (window === 'ytd') return ytdRates;
    if (window === 'l30' && recentRates) return recentRates;
    return scaleRates(ytdRates, windowScale(prof, window));
  }

  function buildSliceYtdMaps(data) {
    var scR = data.scR || {};
    var scL = data.scL || {};
    var bothList = S && S.blendSplits
      ? S.blendSplits(Object.keys(scR).map(function(t) { return scR[t]; }), Object.keys(scL).map(function(t) { return scL[t]; }))
      : [];
    var overall = {};
    bothList.forEach(function(r) {
      if (r && r.t) overall[r.t] = ratesFromRow(r);
    });
    var handR = {};
    var handL = {};
    Object.keys(scR).forEach(function(t) { handR[t] = ratesFromRow(scR[t]); });
    Object.keys(scL).forEach(function(t) { handL[t] = ratesFromRow(scL[t]); });
    var locHome = data.splitHomeMap || {};
    var locAway = data.splitAwayMap || {};
    Object.keys(locHome).forEach(function(t) { locHome[t] = ratesFromRow(locHome[t]); });
    Object.keys(locAway).forEach(function(t) { locAway[t] = ratesFromRow(locAway[t]); });
    var profs = data.teamProfiles || {};
    Object.keys(profs).forEach(function(t) {
      var p = profs[t];
      if (!locHome[t]) {
        var rh = ratesFromProfileLoc(p, 'home');
        if (rh) locHome[t] = rh;
      }
      if (!locAway[t]) {
        var ra = ratesFromProfileLoc(p, 'away');
        if (ra) locAway[t] = ra;
      }
    });
    var recent = {};
    var recentMap = data.splitRecentMap || {};
    Object.keys(recentMap).forEach(function(t) {
      recent[t] = ratesFromRow(recentMap[t]);
    });
    return {
      overall: overall,
      handR: handR,
      handL: handL,
      locHome: locHome,
      locAway: locAway,
      recent: recent
    };
  }

  function buildTeamWindowMap(ytdMap, prof, recentMap) {
    var out = { ytd: ytdMap || {} };
    var teams = Object.keys(ytdMap || {});
    ['l7', 'l14', 'l30'].forEach(function(w) {
      out[w] = {};
      teams.forEach(function(t) {
        var base = ytdMap[t];
        var p = prof && prof[t];
        var recent = recentMap && recentMap[t];
        out[w][t] = applyWindowRates(base, p, w, w === 'l30' ? recent : null);
      });
    });
    return out;
  }

  function rankLeague(teamValueMap, statKey) {
    var entries = Object.keys(teamValueMap || {}).map(function(t) {
      return { t: t, v: teamValueMap[t] && teamValueMap[t][statKey] };
    }).filter(function(e) { return e.v != null && !isNaN(e.v); });
    entries.sort(function(a, b) {
      if (a.v === b.v) return a.t.localeCompare(b.t);
      return b.v - a.v;
    });
    var ranks = {};
    entries.forEach(function(e, i) { ranks[e.t] = i + 1; });
    return { ranks: ranks, total: entries.length };
  }

  function rankLeagueLowerBetter(valueMap, statKey) {
    var entries = Object.keys(valueMap || {}).map(function(k) {
      return { k: k, v: valueMap[k] && valueMap[k][statKey] };
    }).filter(function(e) { return e.v != null && !isNaN(e.v); });
    entries.sort(function(a, b) {
      if (a.v === b.v) return a.k.localeCompare(b.k);
      return a.v - b.v;
    });
    var ranks = {};
    entries.forEach(function(e, i) { ranks[e.k] = i + 1; });
    return { ranks: ranks, total: entries.length };
  }

  function pickCol(row, keys) {
    if (S && S.pickCol) return S.pickCol(row, keys);
    keys = keys || [];
    for (var i = 0; i < keys.length; i++) {
      if (row && row[keys[i]] != null && row[keys[i]] !== '') return row[keys[i]];
    }
    return null;
  }

  function normSpName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function spLookupKey(name, team) {
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    return normSpName(name) + '|' + tk;
  }

  function allowedRatesFromSplitRow(row) {
    if (!row) return null;
    var wrc = num(pickCol(row, ['wRC_faced', 'wrc_faced', 'wRC+_faced', 'wRC+']));
    var ops = num(pickCol(row, ['OPS', 'ops']));
    var woba = num(pickCol(row, ['wOBA', 'woba']));
    var slg = num(pickCol(row, ['SLG', 'slg']));
    var obp = num(pickCol(row, ['OBP', 'obp']));
    if (wrc == null && ops == null && woba == null) return null;
    if (woba == null && wrc != null) woba = Math.round(0.320 * (wrc / 100) * 1000) / 1000;
    if (ops == null && obp != null && slg != null) ops = Math.round((obp + slg) * 1000) / 1000;
    if (slg == null && ops != null && woba != null) {
      var obpEst = obp != null ? obp : Math.min(woba * 1.08, ops * 0.95);
      slg = Math.round((ops - obpEst) * 1000) / 1000;
      if (slg < 0 || slg > 1.2) slg = Math.round(ops * 0.55 * 1000) / 1000;
    }
    return { wrc: wrc, ops: ops, woba: woba, slg: slg };
  }

  function findSpLocationSplit(rows, name, team, location) {
    if (!location) return null;
    var key = normSpName(name);
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var want = String(location || '').toLowerCase();
    return (rows || []).find(function(r) {
      var n = normSpName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher']));
      if (n !== key) return false;
      var tm = S.teamKey(pickCol(r, ['pitcher_team', 'Tm', 'Team']));
      if (tm && tm !== tk) return false;
      var d = String(pickCol(r, ['split_dimension', 'splitDimension']) || '').toLowerCase();
      var v = String(pickCol(r, ['split_value', 'splitValue']) || '').toLowerCase();
      return d === 'location' && v === want;
    }) || null;
  }

  function obpAllowedFromRow(row) {
    if (!row) return null;
    var obp = num(pickCol(row, ['OBP', 'obp', 'OBP_allowed', 'obp_allowed']));
    if (obp != null) return obp;
    var ops = num(pickCol(row, ['OPS', 'ops']));
    if (ops != null) return Math.round(ops * 0.435 * 1000) / 1000;
    return null;
  }

  function pitcherRatesFromRow(row, profileFallback) {
    var src = row || profileFallback;
    if (!src) return null;
    var xfip = num(pickCol(src, ['xFIP', 'xfip']));
    if (xfip == null && profileFallback) {
      xfip = num(pickCol(profileFallback, ['xFIP', 'xfip']));
    }
    return {
      xfip: xfip,
      k_pct: num(pickCol(src, ['K_pct', 'K%', 'k_pct'])),
      bb_pct: num(pickCol(src, ['BB_pct', 'BB%', 'bb_pct'])),
      obp: obpAllowedFromRow(src)
    };
  }

  function dominantBatHand(lineup) {
    if (!lineup || !lineup.length) return 'rhh';
    var l = 0;
    var r = 0;
    lineup.forEach(function(slot) {
      var h = String(slot.batSide || slot.bats || slot.hand || '').trim().toUpperCase();
      if (h.charAt(0) === 'L') l++;
      else if (h.charAt(0) === 'R') r++;
    });
    return l > r ? 'lhh' : 'rhh';
  }

  function findSpBatHandSplit(rows, name, team, batHand) {
    var key = normSpName(name);
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var want = String(batHand || '').toUpperCase();
    function tryFind(dim, val) {
      var valU = String(val || '').toUpperCase();
      return (rows || []).find(function(r) {
        var n = normSpName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher']));
        if (n !== key) return false;
        var tm = S.teamKey(pickCol(r, ['pitcher_team', 'Tm', 'Team']));
        if (tm && tm !== tk) return false;
        var d = String(pickCol(r, ['split_dimension', 'splitDimension']) || '').toLowerCase();
        var v = String(pickCol(r, ['split_value', 'splitValue']) || '').toUpperCase();
        return d === dim && v === valU;
      }) || null;
    }
    var hit = tryFind('batter_hand', want);
    if (hit) return hit;
    if (want === 'LHH') return tryFind('batter_hand', 'L') || tryFind('vs_lhh', 'LHH');
    if (want === 'RHH') return tryFind('batter_hand', 'R') || tryFind('vs_rhh', 'RHH');
    return null;
  }

  function parseBatHandFromSplitRow(r) {
    var dim = String(pickCol(r, ['split_dimension', 'splitDimension']) || '').toLowerCase();
    var val = String(pickCol(r, ['split_value', 'splitValue']) || '').toUpperCase();
    if (dim === 'batter_hand') {
      if (val === 'L' || val === 'LHH') return 'lhh';
      if (val === 'R' || val === 'RHH') return 'rhh';
    }
    if (val === 'LHH' || val === 'VS_LHH') return 'lhh';
    if (val === 'RHH' || val === 'VS_RHH') return 'rhh';
    return null;
  }

  function buildPitcherAllowedRankIndex(splits) {
    var pools = { lhh: {}, rhh: {} };
    (splits || []).forEach(function(r) {
      var hand = parseBatHandFromSplitRow(r);
      if (!hand) return;
      var name = pickCol(r, ['pitcher_name', 'Name', 'Pitcher']);
      var team = pickCol(r, ['pitcher_team', 'Tm', 'Team']);
      if (!name) return;
      var rates = allowedRatesFromSplitRow(r);
      if (!rates) return;
      pools[hand][spLookupKey(name, team)] = rates;
    });
    var index = { lhh: { ytd: {} }, rhh: { ytd: {} } };
    STATS.forEach(function(st) {
      index.lhh.ytd[st.key] = rankLeagueLowerBetter(pools.lhh, st.key);
      index.rhh.ytd[st.key] = rankLeagueLowerBetter(pools.rhh, st.key);
    });
    index.values = {
      lhh: pools.lhh,
      rhh: pools.rhh
    };
    return index;
  }

  function fmtVal(v, dec) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(dec == null ? 1 : dec);
  }

  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    if (v == null || isNaN(v)) return '<span class="mc-os-stat-na">—</span>';
    return '<strong>' + esc(fmtVal(v, decimals)) + '</strong>';
  }

  function pitcherStatCellHtml(value, stat) {
    if (value == null || isNaN(value)) {
      return '<td class="mc-os-cell mc-os-cell--na mc-os-cell--stat">—</td>';
    }
    var dec = stat.decimals != null ? stat.decimals : (stat.key === 'wrc' ? 0 : 3);
    var invert = stat.invert != null ? stat.invert : true;
    return '<td class="mc-os-cell mc-os-cell--stat">' + metricChip(value, stat.ctx, invert, dec) + '</td>';
  }

  function pitcherSplitStripTable(label, rates, highlight) {
    var head = PITCHER_SPLIT_STATS.map(function(st) {
      return '<th scope="col">' + esc(st.label) + '</th>';
    }).join('');
    var cells = PITCHER_SPLIT_STATS.map(function(st) {
      var value = rates ? rates[st.key] : null;
      return pitcherStatCellHtml(value, st);
    }).join('');
    var stripCls = 'mc-os-strip' + (highlight ? ' mc-os-strip--matchup' : '');
    return '<div class="' + stripCls + '">'
      + '<div class="mc-os-strip-head">' + esc(label) + '</div>'
      + '<table class="mc-os-table mc-os-table--pitcher"><thead><tr><th scope="col"></th>' + head + '</tr></thead>'
      + '<tbody><tr><th scope="row" class="mc-os-win">YTD</th>' + cells + '</tr></tbody></table></div>';
  }

  function pitcherAllowedStripTable(handKey, valuePools, spKeyVal, highlight) {
    var rates = valuePools[handKey] && valuePools[handKey][spKeyVal];
    var head = STATS.map(function(st) {
      return '<th scope="col">' + esc(st.label) + '</th>';
    }).join('');
    var cells = STATS.map(function(st) {
      var value = rates ? rates[st.key] : null;
      return pitcherStatCellHtml(value, st);
    }).join('');
    var stripCls = 'mc-os-strip' + (highlight ? ' mc-os-strip--matchup' : '');
    var label = handKey === 'lhh' ? 'ALLOWED vs LHH' : 'ALLOWED vs RHH';
    return '<div class="' + stripCls + '">'
      + '<div class="mc-os-strip-head">' + esc(label) + '</div>'
      + '<table class="mc-os-table mc-os-table--pitcher"><thead><tr><th scope="col"></th>' + head + '</tr></thead>'
      + '<tbody><tr><th scope="row" class="mc-os-win">YTD</th>' + cells + '</tr></tbody></table></div>';
  }

  function buildPitcherAllowedValues(splits) {
    var pools = { lhh: {}, rhh: {} };
    (splits || []).forEach(function(r) {
      var hand = parseBatHandFromSplitRow(r);
      if (!hand) return;
      var name = pickCol(r, ['pitcher_name', 'Name', 'Pitcher']);
      var team = pickCol(r, ['pitcher_team', 'Tm', 'Team']);
      if (!name) return;
      var rates = allowedRatesFromSplitRow(r);
      if (!rates) return;
      pools[hand][spLookupKey(name, team)] = rates;
    });
    return pools;
  }

  var _bvpHydrateToken = 0;

  function shortBatterName(name) {
    var raw = String(name || '').trim();
    if (!raw) return '—';
    if (raw.indexOf(',') >= 0) {
      var parts = raw.split(',');
      raw = parts.slice(1).join(',').trim() + ' ' + parts[0].trim();
    }
    var bits = raw.split(/\s+/).filter(Boolean);
    if (bits.length < 2) return raw;
    return bits[0].charAt(0).toUpperCase() + '. ' + bits[bits.length - 1];
  }

  function parseSlashStat(raw) {
    if (raw == null || raw === '' || raw === '.---' || raw === '-.--') return null;
    var s = String(raw).trim();
    if (s.charAt(0) === '.') s = '0' + s;
    var n = Number(s);
    return isNaN(n) ? null : n;
  }

  function resolvePitcherId(spName, pitcherTeam, spProfiles) {
    var sp = S && S.findSpProfile ? S.findSpProfile(spProfiles || [], spName, pitcherTeam) : null;
    if (sp) {
      var id = num(pickCol(sp, ['pitcher_id', 'player_id', 'Player ID']));
      if (id) return id;
    }
    var reg = A && A.lookupPlayer ? A.lookupPlayer(spName) : null;
    return reg && reg.id ? num(reg.id) : null;
  }

  function resolveBatterId(name) {
    var reg = A && A.lookupPlayer ? A.lookupPlayer(name) : null;
    return reg && reg.id ? num(reg.id) : null;
  }

  function fetchBvpCareer(batterId, pitcherId) {
    if (!batterId || !pitcherId || typeof fetch !== 'function') return Promise.resolve(null);
    var url = 'https://statsapi.mlb.com/api/v1/people/' + encodeURIComponent(batterId)
      + '/stats?stats=vsPlayerTotal&opposingPlayerId=' + encodeURIComponent(pitcherId) + '&group=hitting';
    return fetch(url)
      .then(function(resp) { return resp.ok ? resp.json() : null; })
      .then(function(data) {
        var splits = data && data.stats && data.stats[0] && data.stats[0].splits;
        if (!splits || !splits.length) return null;
        var st = splits[0].stat || {};
        var ab = num(st.atBats);
        var pa = num(st.plateAppearances);
        if ((ab == null || ab <= 0) && (pa == null || pa <= 0)) return null;
        var hits = num(st.hits) || 0;
        var hrs = num(st.homeRuns) || 0;
        var abVal = ab != null ? ab : 0;
        var avgVal = parseSlashStat(st.avg);
        var opsVal = parseSlashStat(st.ops);
        if (avgVal == null && abVal > 0) avgVal = Math.round((hits / abVal) * 1000) / 1000;
        if (opsVal == null && avgVal != null) opsVal = Math.round(avgVal * 1.28 * 1000) / 1000;
        return {
          ab: abVal,
          h: hits,
          hr: hrs,
          avg: avgVal != null ? avgVal : 0,
          ops: opsVal != null ? opsVal : 0,
          pa: pa != null ? pa : abVal
        };
      })
      .catch(function() { return null; });
  }

  function bvpNaCell() {
    return '<td class="mc-os-cell mc-os-cell--na mc-os-cell--na-bvp">N/A</td>';
  }

  function bvpCountCell(v) {
    var n = num(v);
    return '<td class="num mc-os-cell mc-os-cell--bvp-count">' + esc(String(n != null ? n : 0)) + '</td>';
  }

  function bvpRateCell(v, ctx) {
    var n = num(v);
    if (n == null) {
      return '<td class="num mc-os-cell mc-os-cell--bvp-rate"><span class="mc-os-bvp-rate-val">.000</span></td>';
    }
    return '<td class="num mc-os-cell mc-os-cell--bvp-rate">' + metricChip(n, ctx, false, 3) + '</td>';
  }

  function bvpStatCells(row) {
    if (!row) {
      return bvpNaCell() + bvpNaCell() + bvpNaCell() + bvpNaCell() + bvpNaCell();
    }
    var avg = row.avg;
    var ops = row.ops;
    if (avg == null && row.ab > 0) avg = row.h / row.ab;
    if (ops == null && avg != null) ops = avg * 1.28;
    return ''
      + bvpCountCell(row.ab)
      + bvpCountCell(row.h)
      + bvpCountCell(row.hr)
      + bvpRateCell(avg, 'avg')
      + bvpRateCell(ops, 'ops');
  }

  function renderBvpTable(rows, spName) {
    if (!rows || !rows.length) {
      return '<p class="ca-helper">No projected lineup rows for hitter vs pitcher lookup.</p>';
    }
    var body = rows.map(function(r) {
      return '<tr>'
        + '<th scope="row" class="mc-os-bvp-name">' + esc(shortBatterName(r.name)) + '</th>'
        + bvpStatCells(r.stats)
        + '</tr>';
    }).join('');
    return '<table class="mc-os-table mc-os-table--bvp" aria-label="Hitter vs ' + esc(spName) + ' career stats">'
      + '<thead><tr>'
      + '<th scope="col">Hitter</th><th scope="col">AB</th><th scope="col">H</th><th scope="col">HR</th>'
      + '<th scope="col">AVG</th><th scope="col">OPS</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function hydrateHitterVsPitcher(root, ctx, lineupSide, pitcherSide) {
    var box = root && root.querySelector('#mcLvPBvp');
    if (!box || !ctx || !ctx.m) return;
    var token = ++_bvpHydrateToken;
    var m = ctx.m;
    var spName = pitcherSide === 'home' ? m.homeSP : m.awaySP;
    var pitcherTeam = pitcherSide === 'home' ? m.home : m.away;
    var lineup = lineupSide === 'home' ? ctx.homeLineup : ctx.awayLineup;
    var spProfiles = (ctx.data && ctx.data.spProfiles) || [];
    var pitcherId = resolvePitcherId(spName, pitcherTeam, spProfiles);

    box.innerHTML = '<p class="ca-helper">Loading hitter vs pitcher stats…</p>';
    if (!spName || !lineup || !lineup.length) {
      box.innerHTML = '<p class="ca-helper">Projected lineup unavailable for hitter vs pitcher stats.</p>';
      return;
    }
    if (!pitcherId) {
      box.innerHTML = '<p class="ca-helper">Pitcher ID unavailable — cannot load hitter vs pitcher stats.</p>';
      return;
    }

    var slots = lineup.slice().sort(function(a, b) {
      return (a.batOrder || 99) - (b.batOrder || 99);
    }).slice(0, 9).map(function(slot) {
      return {
        name: slot.player || slot.name,
        batterId: resolveBatterId(slot.player || slot.name)
      };
    }).filter(function(s) { return s.name; });

    Promise.all(slots.map(function(slot) {
      if (!slot.batterId) return Promise.resolve({ name: slot.name, stats: null });
      return fetchBvpCareer(slot.batterId, pitcherId).then(function(stats) {
        return { name: slot.name, stats: stats };
      });
    })).then(function(rows) {
      if (token !== _bvpHydrateToken) return;
      box.innerHTML = renderBvpTable(rows, spName);
    }).catch(function() {
      if (token !== _bvpHydrateToken) return;
      box.innerHTML = '<p class="ca-helper">Hitter vs pitcher stats unavailable right now.</p>';
    });
  }

  function pitcherAllowedCard(spName, pitcherTeam, splits, valuePools, spHand) {
    var accent = teamAccentColor(pitcherTeam);
    var spKeyVal = spLookupKey(spName, pitcherTeam);
    if (!findSpBatHandSplit(splits, spName, pitcherTeam, 'LHH')
        && !findSpBatHandSplit(splits, spName, pitcherTeam, 'RHH')) {
      return '<div class="mc-os-card mc-os-card--pitcher"><p class="ca-helper">Hand splits unavailable — run SP metric splits pipeline.</p></div>';
    }
    if (!valuePools) valuePools = buildPitcherAllowedValues(splits);
    var avatar = S && S.headshot ? S.headshot(spName, null, { crop: 'compare', eager: true }) : '';
    var highlightHand = 'rhh';
    var stripHtml = pitcherAllowedStripTable('lhh', valuePools, spKeyVal, highlightHand === 'lhh')
      + pitcherAllowedStripTable('rhh', valuePools, spKeyVal, highlightHand === 'rhh');
    return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--pitcher-panel" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head">' + avatar
      + '<div class="mc-os-card-head-text"><span class="mc-os-card-team">' + esc(spName) + '</span>'
      + '<span class="mc-os-card-role">Allowed offense vs batter hand · YTD season split</span></div></div>'
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-hands">' + stripHtml + '</div>'
      + '<div class="mc-os-bvp-block">'
      + '<header class="mc-lvp-panel-head mc-lvp-panel-head--bvp">'
      + '<div class="mc-lvp-panel-head__title">Hitter vs Pitcher Stats</div>'
      + '<p class="mc-lvp-panel-head__desc">Career regular-season plate appearances vs this starter · N/A = no prior matchup</p>'
      + '</header>'
      + '<div id="mcLvPBvp" class="mc-os-bvp"><p class="ca-helper">Loading career matchup stats…</p></div>'
      + '</div></div>';
  }

  function lineupOffenseCard(ctx, lineupSide, spHand, rankIndex, opts) {
    opts = opts || {};
    var m = ctx.m;
    var team = lineupSide === 'home' ? m.home : m.away;
    var side = lineupSide === 'home' ? 'home' : 'away';
    var handSlice = opts.handSlice
      || (String(spHand || '').trim().toUpperCase().charAt(0) === 'L' ? 'handL' : 'handR');
    var handTitle = opts.handTitle || handLabel(spHand);
    var strips = [
      { sliceKey: 'overall', title: 'BATS', highlight: opts.highlightOverall || false },
      { sliceKey: handSlice, title: handTitle, highlight: opts.highlightHand !== false },
      { sliceKey: 'locAway', title: 'ON ROAD', highlight: side === 'away' }
    ];
    var accent = teamAccentColor(team);
    var stripHtml = strips.map(function(st) {
      var stripCls = 'mc-os-strip' + (st.highlight ? ' mc-os-strip--matchup' : '');
      return '<div class="' + stripCls + '"><div class="mc-os-strip-head">' + esc(st.title) + '</div>'
        + stripTable(st.sliceKey, rankIndex, team, WINDOWS)
        + '</div>';
    }).join('');
    var logo = A && A.teamLogoImg ? A.teamLogoImg(team, 36) : '';
    return '<div class="mc-os-card mc-os-card--lineup mc-os-card--lineup-compact" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head mc-os-card-head--compact">' + logo
      + '<div class="mc-os-card-head-text mc-os-card-head-text--logo-only"></div></div>'
      + '<div class="mc-os-card-strips mc-os-card-strips--lineup-stack">' + stripHtml + '</div></div>';
  }

  function ctxPitcherSplitsReady(splits, spName, pitcherTeam, spProfiles) {
    if (findSpBatHandSplit(splits, spName, pitcherTeam, 'LHH')
        || findSpBatHandSplit(splits, spName, pitcherTeam, 'RHH')) return true;
    if (findSpLocationSplit(splits, spName, pitcherTeam, 'home')
        || findSpLocationSplit(splits, spName, pitcherTeam, 'away')) return true;
    return !!(S && S.findSpProfile && S.findSpProfile(spProfiles || [], spName, pitcherTeam));
  }

  function pitcherSplitStatsCard(spName, pitcherTeam, splits, spProfiles, lineup) {
    if (!spName || !ctxPitcherSplitsReady(splits, spName, pitcherTeam, spProfiles)) return '';
    var accent = teamAccentColor(pitcherTeam);
    var profile = S && S.findSpProfile ? S.findSpProfile(spProfiles || [], spName, pitcherTeam) : null;
    var homeRow = findSpLocationSplit(splits, spName, pitcherTeam, 'home');
    var awayRow = findSpLocationSplit(splits, spName, pitcherTeam, 'away');
    var lhhRow = findSpBatHandSplit(splits, spName, pitcherTeam, 'LHH');
    var rhhRow = findSpBatHandSplit(splits, spName, pitcherTeam, 'RHH');
    var homeRates = pitcherRatesFromRow(homeRow, profile);
    var awayRates = pitcherRatesFromRow(awayRow, profile);
    var lhhRates = pitcherRatesFromRow(lhhRow, profile);
    var rhhRates = pitcherRatesFromRow(rhhRow, profile);
    var bothRates = pitcherRatesFromRow(profile, profile);
    var highlightHand = dominantBatHand(lineup);
    var avatar = S && S.headshot ? S.headshot(spName, 48, { crop: 'compare', eager: true }) : '';
    var locHtml = pitcherSplitStripTable('HOME', homeRates, false)
      + pitcherSplitStripTable('AWAY', awayRates, false);
    var handHtml = pitcherSplitStripTable('VS LHH', lhhRates, highlightHand === 'lhh')
      + pitcherSplitStripTable('VS RHH', rhhRates, highlightHand === 'rhh')
      + pitcherSplitStripTable('BOTH', bothRates, false);
    return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--pitcher-compact" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head mc-os-card-head--compact">' + avatar
      + '<div class="mc-os-card-head-text"><span class="mc-os-card-team mc-os-card-team--pitcher">' + esc(spName) + '</span>'
      + '<span class="mc-os-card-role">xFIP · K% · BB% · OBP allowed · YTD</span></div></div>'
      + '<div class="mc-os-pitcher-split-groups">'
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-loc">' + locHtml + '</div>'
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-hands-trio">' + handHtml + '</div>'
      + '</div></div>';
  }

  function renderPitcherAllowedPanel(spName, pitcherTeam, splits, spHand) {
    if (!findSpBatHandSplit(splits, spName, pitcherTeam, 'LHH')
        && !findSpBatHandSplit(splits, spName, pitcherTeam, 'RHH')) {
      return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--pitcher-panel"><p class="ca-helper">'
        + 'Hand splits unavailable — run SP metric splits pipeline.</p></div>';
    }
    return pitcherAllowedCard(spName, pitcherTeam, splits, buildPitcherAllowedValues(splits), spHand);
  }

  function renderLvpTeamRanks(ctx, lineupSide, spHand, spName, pitcherTeam, splits, spProfiles, lineup) {
    if (!ctx || !ctx.m || !ctx.offenseRankIndex) return '';
    var handLbl = handLabel(spHand);
    var pitcherCard = pitcherSplitStatsCard(spName, pitcherTeam, splits || [], spProfiles, lineup);
    return '<section class="mc-lvp-section mc-lvp-section--ranks mc-offense-splits mc-lvp-team-ranks ca-board">'
      + lvpSectionHead(
        'Team Offense — League Rank',
        'League rank heatmap · ' + handLbl + ' matches tonight\'s starter hand · pitcher season splits beside lineup context.'
      )
      + '<div class="mc-lvp-offense-pitcher-duo">'
      + lineupOffenseCard(ctx, lineupSide, spHand, ctx.offenseRankIndex)
      + pitcherCard
      + '</div>'
      + '<div class="mc-os-legend mc-os-legend--lineup mc-os-legend--compact">'
      + '<span class="mc-os-legend-label">Ranks:</span>'
      + '<span class="mc-os-leg mc-os-cell--elite">#1–5 Elite</span>'
      + '<span class="mc-os-leg mc-os-cell--strong">#6–12 Strong</span>'
      + '<span class="mc-os-leg mc-os-cell--mid">#13–20 Average</span>'
      + '<span class="mc-os-leg mc-os-cell--weak">#21–25 Weak</span>'
      + '<span class="mc-os-leg mc-os-cell--poor">#26+ Poor</span>'
      + '</div></section>';
  }

  function renderLvpSplitJux(ctx, lineupSide, spHand, spName, pitcherTeam, splits, spProfiles, lineup) {
    return renderLvpTeamRanks(ctx, lineupSide, spHand, spName, pitcherTeam, splits, spProfiles, lineup);
  }

  function buildRankIndex(data) {
    var ytd = buildSliceYtdMaps(data);
    var profs = data.teamProfiles || {};
    var slices = {
      overall: buildTeamWindowMap(ytd.overall, profs, ytd.recent),
      handR: buildTeamWindowMap(ytd.handR, profs, null),
      handL: buildTeamWindowMap(ytd.handL, profs, null),
      locHome: buildTeamWindowMap(ytd.locHome, profs, null),
      locAway: buildTeamWindowMap(ytd.locAway, profs, null)
    };
    var index = {};
    Object.keys(slices).forEach(function(slice) {
      index[slice] = {};
      WINDOWS.forEach(function(win) {
        var teamMap = slices[slice][win.key] || {};
        index[slice][win.key] = {};
        STATS.forEach(function(st) {
          index[slice][win.key][st.key] = rankLeague(teamMap, st.key);
        });
      });
    });
    return index;
  }

  function rankTone(rank, total) {
    if (rank == null) return 'na';
    if (rank <= 5) return 'elite';
    if (rank <= 12) return 'strong';
    if (rank <= 20) return 'mid';
    if (rank <= 25) return 'weak';
    return 'poor';
  }

  function cellHtml(rank, total) {
    if (rank == null) {
      return '<td class="mc-os-cell mc-os-cell--na">—</td>';
    }
    var tone = rankTone(rank, total);
    return '<td class="mc-os-cell mc-os-cell--' + tone + '" title="League rank #' + rank + (total ? ' of ' + total : '') + '">'
      + '<span class="mc-os-rank">#' + esc(String(rank)) + '</span></td>';
  }

  function stripTable(sliceKey, rankIndex, team, windowRows) {
    var head = STATS.map(function(st) {
      return '<th scope="col">' + esc(st.label) + '</th>';
    }).join('');
    var body = windowRows.map(function(win) {
      var cells = STATS.map(function(st) {
        var pack = rankIndex[sliceKey] && rankIndex[sliceKey][win.key] && rankIndex[sliceKey][win.key][st.key];
        var rank = pack && pack.ranks ? pack.ranks[team] : null;
        var total = pack ? pack.total : null;
        return cellHtml(rank, total);
      }).join('');
      return '<tr><th scope="row" class="mc-os-win">' + esc(win.label) + '</th>' + cells + '</tr>';
    }).join('');
    return '<table class="mc-os-table"><thead><tr><th scope="col"></th>' + head + '</tr></thead><tbody>'
      + body + '</tbody></table>';
  }

  function teamAccentColor(team) {
    var C = global.MLBMACharts;
    if (C && typeof C.radarColorForTeam === 'function') return C.radarColorForTeam(team);
    return '#7C4DFF';
  }

  function teamCard(team, side, strips, rankIndex) {
    var logo = A && A.teamLogoImg ? A.teamLogoImg(team, 48) : '';
    var sideCls = side === 'home' ? 'mc-os-card--home' : 'mc-os-card--away';
    var accent = teamAccentColor(team);
    var stripHtml = strips.map(function(st) {
      return '<div class="mc-os-strip">'
        + '<div class="mc-os-strip-head">' + esc(st.title) + '</div>'
        + stripTable(st.sliceKey, rankIndex, team, WINDOWS)
        + '</div>';
    }).join('');
    return '<div class="mc-os-card ' + sideCls + '" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head">' + logo + '<span class="mc-os-card-team">' + esc(team) + '</span></div>'
      + '<div class="mc-os-card-strips">' + stripHtml + '</div>'
      + '</div>';
  }

  function handLabel(hand) {
    var h = String(hand || '').trim().toUpperCase().charAt(0);
    if (h === 'L') return 'VS LHP';
    if (h === 'R') return 'VS RHP';
    return 'VS HAND';
  }

  function buildStripsForTeam(team, side, oppHand) {
    var locSlice = side === 'home' ? 'locHome' : 'locAway';
    var locTitle = side === 'home' ? 'AT HOME' : 'ON ROAD';
    var handSlice = String(oppHand || '').trim().toUpperCase().charAt(0) === 'L' ? 'handL' : 'handR';
    return [
      { sliceKey: 'overall', title: team + ' BATS' },
      { sliceKey: handSlice, title: handLabel(oppHand) },
      { sliceKey: locSlice, title: team + ' ' + locTitle }
    ];
  }

  function renderLineupTeamCard(ctx, lineupSide, spHand) {
    if (!ctx || !ctx.m || !ctx.offenseRankIndex) return '';
    var m = ctx.m;
    var team = lineupSide === 'home' ? m.home : m.away;
    var side = lineupSide === 'home' ? 'home' : 'away';
    var strips = buildStripsForTeam(team, side, spHand);
    return '<div class="mc-section-block mc-offense-splits mc-lvp-offense-splits">'
      + '<h3 class="mc-lvp-block-title">Offensive Splits — League Rank</h3>'
      + '<p class="mc-os-hint ca-helper">Color-coded league rank for the selected lineup — '
      + handLabel(spHand) + ' strip uses tonight\'s starter hand · L7/L14/L30 scaled from team form.</p>'
      + teamCard(team, side, strips, ctx.offenseRankIndex)
      + '<div class="mc-os-legend">'
      + '<span class="mc-os-leg mc-os-cell--elite">#1–5 Elite</span>'
      + '<span class="mc-os-leg mc-os-cell--strong">#6–12 Strong</span>'
      + '<span class="mc-os-leg mc-os-cell--mid">#13–20 Average</span>'
      + '<span class="mc-os-leg mc-os-cell--weak">#21–25 Weak</span>'
      + '<span class="mc-os-leg mc-os-cell--poor">#26+ Poor</span>'
      + '</div></div>';
  }

  function renderSection(ctx) {
    if (!ctx || !ctx.m || !ctx.offenseRankIndex) return '';
    var m = ctx.m;
    var idx = ctx.offenseRankIndex;
    var awayStrips = buildStripsForTeam(m.away, 'away', m.homeHand);
    var homeStrips = buildStripsForTeam(m.home, 'home', m.awayHand);
    return '<div class="mc-section-block mc-offense-splits">'
      + '<h2 class="mc-section-title">Offensive Splits — League Rank</h2>'
      + '<p class="mc-os-hint ca-helper">Color-coded league rank (#1 = best). '
      + 'Handedness = opposing starter · Location = this game · L7/L14/L30 scaled from team form windows.</p>'
      + '<div class="mc-os-duo">'
      + teamCard(m.away, 'away', awayStrips, idx)
      + teamCard(m.home, 'home', homeStrips, idx)
      + '</div>'
      + '<div class="mc-os-legend">'
      + '<span class="mc-os-leg mc-os-cell--elite">#1–5 Elite</span>'
      + '<span class="mc-os-leg mc-os-cell--strong">#6–12 Strong</span>'
      + '<span class="mc-os-leg mc-os-cell--mid">#13–20 Average</span>'
      + '<span class="mc-os-leg mc-os-cell--weak">#21–25 Weak</span>'
      + '<span class="mc-os-leg mc-os-cell--poor">#26+ Poor</span>'
      + '</div></div>';
  }

  function prepareData(raw) {
    var splitHome = S.aggregateTeamOffenseFromBatterRows(raw.splitHomeRows || []);
    var splitAway = S.aggregateTeamOffenseFromBatterRows(raw.splitAwayRows || []);
    var splitRecent = S.aggregateTeamOffenseFromBatterRows(raw.splitRecentRows || []);
    var data = {
      scR: raw.scR || {},
      scL: raw.scL || {},
      teamProfiles: raw.teamProfiles || {},
      splitHome: splitHome,
      splitAway: splitAway,
      splitRecent: splitRecent,
      splitRecentMap: aggToMap(splitRecent),
      splitHomeMap: aggToMap(splitHome),
      splitAwayMap: aggToMap(splitAway)
    };
    data.offenseRankIndex = buildRankIndex(data);
    return data;
  }

  global.MatchupOffenseSplits = {
    prepareData: prepareData,
    buildRankIndex: buildRankIndex,
    buildPitcherAllowedRankIndex: buildPitcherAllowedRankIndex,
    buildPitcherAllowedValues: buildPitcherAllowedValues,
    renderSection: renderSection,
    renderLineupTeamCard: renderLineupTeamCard,
    lineupOffenseCard: lineupOffenseCard,
    handLabel: handLabel,
    renderLvpSplitJux: renderLvpSplitJux,
    renderLvpTeamRanks: renderLvpTeamRanks,
    renderPitcherAllowedPanel: renderPitcherAllowedPanel,
    hydrateHitterVsPitcher: hydrateHitterVsPitcher
  };
})(typeof window !== 'undefined' ? window : this);
