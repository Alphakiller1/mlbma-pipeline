/**
 * Lineup vs Bullpen — stat comparison and bullpen usage chart.
 * Relief-only: lineup vs RP splits; bullpen unit excludes rotation arms.
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var A = global.MLBMAAssets;
  var CM = global.CompareMetrics;
  var LC = global.MatchupLvBControls;

  var _pack = {
    relieverLog: [],
    spProfiles: []
  };
  var _hydrateToken = 0;
  var _usageToken = 0;

  function mountUsageChart(container, comp, ctx, token) {
    var mount = container && container.querySelector
      ? container.querySelector('#mc-lvb-usage-mount') : null;
    var BU = global.BullpenUsage;
    if (!mount || !comp || !BU || !BU.loadForTeam || !BU.renderUsageChart) {
      if (mount) mount.innerHTML = '<p class="ca-helper mc-lvp-empty">Bullpen usage chart unavailable.</p>';
      return;
    }
    var bpTeam = comp.bpTeam;
    var filteredLog = filterReliefApps(_pack.relieverLog, bpTeam, ctx, { includeStarters: false });
    var usageToken = ++_usageToken;
    mount.innerHTML = '<p class="ca-helper">Loading bullpen usage chart…</p>';
    BU.loadForTeam(bpTeam, { log: filteredLog, live: true, days: 7 }).then(function(model) {
      if (token !== _hydrateToken || usageToken !== _usageToken) return;
      var el = container.querySelector('#mc-lvb-usage-mount');
      if (!el) return;
      el.innerHTML = BU.renderUsageChart(model, {
        compact: true,
        emptyText: 'No bullpen usage data for ' + bpTeam + ' — run pipeline step 12.'
      });
    }).catch(function() {
      if (token !== _hydrateToken || usageToken !== _usageToken) return;
      var el = container.querySelector('#mc-lvb-usage-mount');
      if (!el || !BU.buildUsageModel) return;
      var fallback = BU.buildUsageModel({ team: bpTeam, log: filteredLog, days: 7 });
      el.innerHTML = BU.renderUsageChart(fallback, {
        compact: true,
        emptyText: 'No bullpen usage data for ' + bpTeam + ' — run pipeline step 12.'
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pick(row) {
    if (!row || !S || !S.pickCol) return null;
    return S.pickCol.apply(S, arguments);
  }

  function teamKey(team) {
    return S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
  }

  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    if (v == null || isNaN(v)) return '<span class="mc-os-stat-na">—</span>';
    return '<strong>' + esc(Number(v).toFixed(decimals == null ? 1 : decimals)) + '</strong>';
  }

  function lvbSectionHead(title, desc) {
    return '<header class="mc-lvb-section-head mc-lvp-section-head">'
      + '<h3 class="mc-lvp-section-head__title">' + esc(title) + '</h3>'
      + (desc ? '<p class="mc-lvp-section-head__desc">' + esc(desc) + '</p>' : '')
      + '</header>';
  }

  function normSpNames(ctx) {
    var names = {};
    var profiles = (ctx && ctx.data && ctx.data.spProfiles) || _pack.spProfiles || [];
    profiles.forEach(function(p) {
      var n = pick(p, ['Name', 'pitcher_name', 'Pitcher']);
      if (n && S && S.normName) names[S.normName(n)] = true;
    });
    return names;
  }

  function isStarterArm(name, ctx) {
    if (!name) return false;
    var key = S && S.normName ? S.normName(name) : String(name).toLowerCase().trim();
    return !!normSpNames(ctx)[key];
  }

  function filterReliefApps(log, team, ctx, opts) {
    opts = opts || {};
    log = log || [];
    var tk = teamKey(team);
    return log.filter(function(r) {
      if (teamKey(pick(r, ['pitcher_team', 'team'])) !== tk) return false;
      var name = pick(r, ['pitcher_name', 'Name']);
      if (!opts.includeStarters && isStarterArm(name, ctx)) return false;
      return true;
    });
  }

  function aggregateSaveRates(log, team, role, windowDays, opponent) {
    var rows = log || [];
    var tk = teamKey(team);
    var oppTk = opponent ? teamKey(opponent) : null;
    var cutoff = null;
    if (windowDays && windowDays > 0) {
      var d = new Date();
      d.setDate(d.getDate() - windowDays);
      cutoff = d.toISOString().slice(0, 10);
    }
    var saves = 0;
    var blown = 0;
    rows.forEach(function(r) {
      var dt = String(pick(r, ['date', 'Date']) || '').slice(0, 10);
      if (cutoff && dt && dt < cutoff) return;
      var result = String(pick(r, ['result']) || '').toLowerCase();
      if (result !== 'save' && result !== 'blown_save') return;
      var opp = teamKey(pick(r, ['opponent_team', 'opp', 'Opponent']));
      if (role === 'earned') {
        if (teamKey(pick(r, ['pitcher_team', 'team'])) !== tk) return;
        if (oppTk && opp !== oppTk) return;
      } else {
        if (opp !== tk) return;
      }
      if (result === 'save') saves++;
      else blown++;
    });
    var opps = saves + blown;
    if (opps <= 0) return { saves: null, blown: null, savePct: null, blownPct: null, opps: 0 };
    return {
      saves: saves,
      blown: blown,
      savePct: Math.round((saves / opps) * 1000) / 10,
      blownPct: Math.round((blown / opps) * 1000) / 10,
      opps: opps
    };
  }

  function filterH2hReliefRows(log, bpTeam, lineupTeam, ctx, windowDays) {
    var luTk = teamKey(lineupTeam);
    var rows = filterReliefApps(log, bpTeam, ctx, { includeStarters: false }).filter(function(r) {
      return teamKey(pick(r, ['opponent_team', 'opp', 'Opponent'])) === luTk;
    });
    if (!windowDays || windowDays <= 0) return rows;
    var d = new Date();
    d.setDate(d.getDate() - windowDays);
    var cutoff = d.toISOString().slice(0, 10);
    return rows.filter(function(r) {
      var dt = String(pick(r, ['date', 'Date']) || '').slice(0, 10);
      return !dt || dt >= cutoff;
    });
  }

  function aggregateReliefRateBlock(rows) {
    rows = rows || [];
    var ip = 0;
    var h = 0;
    var bb = 0;
    var k = 0;
    var hr = 0;
    var bf = 0;
    rows.forEach(function(r) {
      var rowIp = num(pick(r, ['IP', 'ip'])) || 0;
      var rowH = num(pick(r, ['H', 'hits'])) || 0;
      var rowBb = num(pick(r, ['BB', 'bb'])) || 0;
      var rowK = num(pick(r, ['K', 'k'])) || 0;
      var rowHr = num(pick(r, ['HR', 'hr'])) || 0;
      var rowBf = num(pick(r, ['batters_faced', 'BF', 'battersFaced']));
      if (rowBf == null || rowBf <= 0) rowBf = rowK + rowH + rowBb;
      if (rowIp <= 0 && rowBf <= 0) return;
      ip += rowIp;
      h += rowH;
      bb += rowBb;
      k += rowK;
      hr += rowHr;
      bf += rowBf;
    });
    if (bf <= 0 && ip <= 0) return null;
    var ab = bf - bb;
    var avgAllowed = ab > 0 ? Math.round(h / ab * 1000) / 1000 : null;
    var obp = bf > 0 ? (h + bb) / bf : null;
    var tb = (h - hr) * 1.25 + hr * 4;
    var slg = ab > 0 ? tb / ab : null;
    var opsAllowed = (obp != null && slg != null) ? Math.round((obp + slg) * 1000) / 1000 : null;
    var bbPct = bf > 0 ? Math.round(bb / bf * 1000) / 10 : null;
    var fip = ip > 0 ? Math.round(((13 * hr) + (3 * bb) - (2 * k)) / ip + 3.2) * 10 / 10 : null;
    return {
      apps: rows.length,
      bf: bf,
      avgAllowed: avgAllowed,
      opsAllowed: opsAllowed,
      bbPct: bbPct,
      fip: fip
    };
  }

  function aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, windowDays) {
    return aggregateReliefRateBlock(filterH2hReliefRows(log, bpTeam, lineupTeam, ctx, windowDays));
  }

  function pickSaveRate(block, key) {
    if (!block || !block.opps) return null;
    return block[key];
  }

  function lvbWindowDays(state) {
    state = LC ? LC.defaultLvbState(state) : (state || {});
    if (state.lvWin === 'l7') return 7;
    if (state.lvWin === 'l14') return 14;
    if (state.lvWin === 'l30') return 30;
    return 0;
  }

  function bullpenAvgAllowed(log, bpTeam, lineupTeam, ctx, windowDays) {
    var block = aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, windowDays);
    if (block && block.avgAllowed != null) return block.avgAllowed;
    if (windowDays > 0) {
      block = aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, 0);
      if (block && block.avgAllowed != null) return block.avgAllowed;
    }
    var rows = filterReliefApps(log, bpTeam, ctx, { includeStarters: false });
    block = aggregateReliefRateBlock(rows);
    return block && block.avgAllowed != null ? block.avgAllowed : null;
  }

  function lineupSaveExtras(log, lineupTeam, bpTeam, ctx, state) {
    var winDays = lvbWindowDays(state);
    var filtered = filterReliefApps(log, bpTeam, ctx, { includeStarters: false });
    var against = aggregateSaveRates(filtered, lineupTeam, 'against', winDays);
    var earnedH2h = aggregateSaveRates(filtered, bpTeam, 'earned', winDays, lineupTeam);
    if ((!against.opps || !earnedH2h.opps) && winDays > 0) {
      if (!against.opps) against = aggregateSaveRates(filtered, lineupTeam, 'against', 0);
      if (!earnedH2h.opps) earnedH2h = aggregateSaveRates(filtered, bpTeam, 'earned', 0, lineupTeam);
    }
    return {
      savesAgainstPct: pickSaveRate(against, 'savePct'),
      blownSavesCausedPct: pickSaveRate(against, 'blownPct'),
      savesEarnedPct: pickSaveRate(earnedH2h, 'savePct'),
      blownSavePctH2h: pickSaveRate(earnedH2h, 'blownPct'),
      saveOppsH2h: earnedH2h.opps || 0
    };
  }

  function compareMetricRowsHtml(rows) {
    return (rows || []).map(function(row) {
      var va = row.valA;
      var vb = row.valB;
      var d = row.decimals == null ? 1 : row.decimals;
      var winner = 'none';
      if (va != null && vb != null && !isNaN(va) && !isNaN(vb) && Math.abs(va - vb) >= 0.001) {
        var aBetter = row.higherBetter !== false ? va > vb : va < vb;
        if (row.invertA) aBetter = !aBetter;
        var bBetter = row.higherBetter !== false ? vb > va : vb < va;
        if (row.invertB) bBetter = !bBetter;
        if (aBetter && !bBetter) winner = 'a';
        else if (bBetter && !aBetter) winner = 'b';
      }
      return '<div class="mc-lvp-metric-row">'
        + '<span class="mc-lvp-metric-val mc-lvp-metric-val--a' + (winner === 'a' ? ' mc-lvp-metric-val--win' : '') + '">'
        + metricChip(va, row.ctx || 'osi', row.invertA, d) + '</span>'
        + '<span class="mc-lvp-metric-label">' + esc(row.label) + '</span>'
        + '<span class="mc-lvp-metric-val mc-lvp-metric-val--b' + (winner === 'b' ? ' mc-lvp-metric-val--win' : '') + '">'
        + metricChip(vb, row.ctx || 'osi', row.invertB, d) + '</span>'
        + '</div>';
    }).join('');
  }

  function statCompareBody(lineupTeam, bpTeam, rows) {
    var luLogo = S && S.teamLogo ? S.teamLogo(lineupTeam, 22) : '';
    var bpLogo = S && S.teamLogo ? S.teamLogo(bpTeam, 22) : '';
    return '<div class="mc-lvp-stat-head">'
      + '<div class="mc-lvp-stat-side mc-lvp-stat-side--a">' + luLogo + '<span>' + esc(lineupTeam) + ' Lineup</span></div>'
      + '<div class="mc-lvp-stat-side mc-lvp-stat-side--b">' + bpLogo + '<span>' + esc(bpTeam) + ' Bullpen</span></div>'
      + '</div>'
      + '<div class="mc-lvp-metrics">' + compareMetricRowsHtml(rows) + '</div>';
  }

  function ensureLineupStore(ctx) {
    if (!global.LIVE_DATA) global.LIVE_DATA = {};
    if (ctx && ctx.data) {
      global.LIVE_DATA.bullpenUnits = ctx.data.bullpen || {};
      global.LIVE_DATA.bullpenUnitRows = ctx.data.bullpenRows || [];
    }
    if (!LM()) return Promise.resolve(null);
    return LM().ensureStore({ needPitcherSplits: true, needTeamResults: true }).then(function(store) {
      if (store && store.resultsByTeam && global.LIVE_DATA) {
        global.LIVE_DATA.resultsByTeam = store.resultsByTeam;
      }
      return store;
    });
  }

  function LM() {
    return global.LineupModel || null;
  }

  function resolveCompare(ctx, lineupSide, bpSide, state) {
    if (!CM || !CM.resolveBoth || !LC) return Promise.resolve(null);
    state = LC.defaultLvbState(state);
    var m = ctx.m;
    var lineupTeam = lineupSide === 'home' ? m.home : m.away;
    var bpTeam = bpSide === 'home' ? m.home : m.away;
    var luF = LC.lineupFilter(state);
    var bpF = LC.bullpenFilter(state);
    var log = _pack.relieverLog || [];

    return ensureLineupStore(ctx).then(function() {
      return CM.resolveBoth('lineup-bullpen',
        { key: lineupTeam, filter: luF },
        { key: bpTeam, filter: bpF }
      ).then(function(res) {
        var lu = res.dataA && res.dataA.entity === 'lineup' ? res.dataA : res.dataB;
        var bp = res.dataA && res.dataA.entity === 'bullpen' ? res.dataA : res.dataB;
        if (!lu || !bp) return null;
        var winDays = lvbWindowDays(state);
        global._lvbCompareOpts = {
          relieverLog: log,
          ctx: ctx,
          windowDays: winDays
        };
        var metrics = CM.buildMetricRows('lineup-bullpen', lu, bp);
        return {
          lu: lu,
          bp: bp,
          metrics: metrics,
          lineupTeam: lineupTeam,
          bpTeam: bpTeam,
          filterSummary: LC.filterSummary(state),
          state: state
        };
      });
    }).catch(function(err) {
      console.warn('[matchup_lvb] resolve failed', err);
      return null;
    });
  }

  function renderPerformanceBody(comp, ctx) {
    if (!comp) {
      return '<div class="mc-lvb-performance">'
        + '<section class="mc-lvb-section ca-board">'
        + '<p class="ca-helper">Bullpen comparison unavailable — check Bullpen_Unit, Reliever_Log, and Batter_Splits_vsRP.</p>'
        + '</section></div>';
    }
    return '<div class="mc-lvb-performance">'
      + '<section class="mc-lvb-section mc-lvp-section ca-board">'
      + lvbSectionHead(
        'Stat Comparison',
        comp.filterSummary + ' · green favors that side. Lineup vs relief only; bullpen excludes rotation arms.'
      )
      + statCompareBody(comp.lineupTeam, comp.bpTeam, comp.metrics)
      + '</section>'
      + '<section class="mc-lvb-section mc-lvp-section ca-board">'
      + lvbSectionHead(
        'Bullpen Usage',
        comp.bpTeam + ' · last 7-day pitch matrix and availability — relief corps only (excludes rotation arms).'
      )
      + '<div id="mc-lvb-usage-mount" class="mc-lvb-usage-mount">'
      + '<p class="ca-helper">Loading bullpen usage chart…</p></div>'
      + '</section>'
      + '</div>';
  }

  function prepareData(opts) {
    opts = opts || {};
    _pack.relieverLog = opts.relieverLog || [];
    _pack.spProfiles = opts.spProfiles || [];
    return _pack;
  }

  function hydrate(container, ctx, lineupSide, bpSide, state) {
    if (!container) return;
    var token = ++_hydrateToken;
    container.innerHTML = '<p class="ca-helper">Loading bullpen comparison…</p>';
    resolveCompare(ctx, lineupSide, bpSide, state).then(function(comp) {
      if (token !== _hydrateToken) return;
      container.innerHTML = renderPerformanceBody(comp, ctx);
      mountUsageChart(container, comp, ctx, token);
    });
  }

  global.MatchupLvB = {
    lvbSectionHead: lvbSectionHead,
    hydrate: hydrate,
    prepareData: prepareData,
    resolveCompare: resolveCompare,
    filterReliefApps: filterReliefApps
  };
})(typeof window !== 'undefined' ? window : this);
