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
    var dec = stat.key === 'wrc' ? 0 : 3;
    return '<td class="mc-os-cell mc-os-cell--stat">' + metricChip(value, stat.ctx, true, dec) + '</td>';
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
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-hands">' + stripHtml + '</div></div>';
  }

  function lineupOffenseCard(ctx, lineupSide, spHand, rankIndex) {
    var m = ctx.m;
    var team = lineupSide === 'home' ? m.home : m.away;
    var side = lineupSide === 'home' ? 'home' : 'away';
    var handSlice = String(spHand || '').trim().toUpperCase().charAt(0) === 'L' ? 'handL' : 'handR';
    var strips = [
      { sliceKey: 'overall', title: team + ' BATS', highlight: false },
      { sliceKey: handSlice, title: handLabel(spHand), highlight: true }
    ];
    var accent = teamAccentColor(team);
    var stripHtml = strips.map(function(st) {
      var stripCls = 'mc-os-strip' + (st.highlight ? ' mc-os-strip--matchup' : '');
      return '<div class="' + stripCls + '"><div class="mc-os-strip-head">' + esc(st.title) + '</div>'
        + stripTable(st.sliceKey, rankIndex, team, WINDOWS)
        + '</div>';
    }).join('');
    var logo = A && A.teamLogoImg ? A.teamLogoImg(team, 48) : '';
    return '<div class="mc-os-card mc-os-card--lineup" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head">' + logo
      + '<div class="mc-os-card-head-text"><span class="mc-os-card-team">' + esc(team) + '</span>'
      + '<span class="mc-os-card-role">Offensive league rank (#1 = best offense)</span></div></div>'
      + '<div class="mc-os-card-strips">' + stripHtml + '</div></div>';
  }

  function ctxPitcherSplitsReady(splits, spName, pitcherTeam) {
    return !!(findSpBatHandSplit(splits, spName, pitcherTeam, 'LHH')
      || findSpBatHandSplit(splits, spName, pitcherTeam, 'RHH'));
  }

  function renderPitcherAllowedPanel(spName, pitcherTeam, splits, spHand) {
    if (!ctxPitcherSplitsReady(splits, spName, pitcherTeam)) {
      return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--pitcher-panel"><p class="ca-helper">'
        + 'Hand splits unavailable — run SP metric splits pipeline.</p></div>';
    }
    return pitcherAllowedCard(spName, pitcherTeam, splits, buildPitcherAllowedValues(splits), spHand);
  }

  function renderLvpTeamRanks(ctx, lineupSide, spHand) {
    if (!ctx || !ctx.m || !ctx.offenseRankIndex) return '';
    var handLbl = handLabel(spHand);
    return '<div class="mc-section-block mc-offense-splits mc-lvp-team-ranks">'
      + '<h3 class="mc-lvp-block-title">Team Offense — League Rank</h3>'
      + '<p class="mc-os-hint ca-helper">League rank heatmap for the selected lineup — '
      + handLbl + ' strip matches tonight\'s starter hand.</p>'
      + lineupOffenseCard(ctx, lineupSide, spHand, ctx.offenseRankIndex)
      + '<div class="mc-os-legend mc-os-legend--lineup">'
      + '<span class="mc-os-legend-label">Lineup ranks:</span>'
      + '<span class="mc-os-leg mc-os-cell--elite">#1–5 Elite</span>'
      + '<span class="mc-os-leg mc-os-cell--strong">#6–12 Strong</span>'
      + '<span class="mc-os-leg mc-os-cell--mid">#13–20 Average</span>'
      + '<span class="mc-os-leg mc-os-cell--weak">#21–25 Weak</span>'
      + '<span class="mc-os-leg mc-os-cell--poor">#26+ Poor</span>'
      + '</div></div>';
  }

  function renderLvpSplitJux(ctx, lineupSide, spHand, spName, pitcherTeam) {
    return renderLvpTeamRanks(ctx, lineupSide, spHand);
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
    renderLvpSplitJux: renderLvpSplitJux,
    renderLvpTeamRanks: renderLvpTeamRanks,
    renderPitcherAllowedPanel: renderPitcherAllowedPanel
  };
})(typeof window !== 'undefined' ? window : this);
