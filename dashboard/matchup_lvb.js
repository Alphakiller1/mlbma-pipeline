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

  function aggregateSaveRates(log, team, role, windowDays) {
    var rows = log || [];
    var tk = teamKey(team);
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
      if (role === 'earned') {
        if (teamKey(pick(r, ['pitcher_team', 'team'])) !== tk) return;
      } else {
        if (teamKey(pick(r, ['opponent_team', 'opp', 'Opponent'])) !== tk) return;
      }
      if (result === 'save') saves++;
      else blown++;
    });
    var opps = saves + blown;
    if (opps <= 0) return { saves: null, blown: null, savePct: null, blownPct: null };
    return {
      saves: saves,
      blown: blown,
      savePct: Math.round((saves / opps) * 1000) / 10,
      blownPct: Math.round((blown / opps) * 1000) / 10
    };
  }

  function bullpenAvgAllowed(log, bpTeam, ctx) {
    var rows = filterReliefApps(log, bpTeam, ctx, { includeStarters: false });
    var hits = 0;
    var ab = 0;
    rows.forEach(function(r) {
      var bf = num(pick(r, ['batters_faced', 'BF', 'battersFaced']));
      var bb = num(pick(r, ['BB', 'bb'])) || 0;
      var h = num(pick(r, ['H', 'hits'])) || 0;
      if (bf == null || bf <= 0) {
        bf = (num(pick(r, ['K', 'k'])) || 0) + h + bb;
      }
      var rowAb = bf - bb;
      if (rowAb > 0) {
        hits += h;
        ab += rowAb;
      }
    });
    if (ab <= 0) return null;
    return Math.round((hits / ab) * 1000) / 1000;
  }

  function lineupSaveExtras(log, lineupTeam, bpTeam, ctx, state) {
    var winDays = state.lvWin === 'l7' ? 7 : state.lvWin === 'l14' ? 14 : state.lvWin === 'l30' ? 30 : 0;
    var filtered = filterReliefApps(log, bpTeam, ctx, { includeStarters: false });
    var against = aggregateSaveRates(filtered, lineupTeam, 'against', winDays);
    return {
      savesAgainstPct: against.savePct,
      blownSavesCausedPct: against.blownPct
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
      var saveExtras = lineupSaveExtras(log, lineupTeam, bpTeam, ctx, state);
      var pals = ctx.data && ctx.data.pals ? ctx.data.pals[teamKey(lineupTeam)] : null;
      global._lvbMetricExtras = Object.assign({}, saveExtras, {
        fipAllowed: pals && pals.xfip != null ? pals.xfip : null,
        avgAllowed: bullpenAvgAllowed(log, bpTeam, ctx)
      });
      return CM.resolveBoth('lineup-bullpen',
        { key: lineupTeam, filter: luF },
        { key: bpTeam, filter: bpF }
      );
    }).then(function(res) {
      var lu = res.dataA && res.dataA.entity === 'lineup' ? res.dataA : res.dataB;
      var bp = res.dataA && res.dataA.entity === 'bullpen' ? res.dataA : res.dataB;
      if (!lu || !bp) return null;
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
