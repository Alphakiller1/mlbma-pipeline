/**
 * Compare workspace — mode definitions, split filters, metric matrices.
 * Used by Research Lab compare pane (research_lab.js).
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup;
  var LM = global.LineupModel;

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function ratePerNine(pct) {
    if (pct == null || isNaN(pct)) return null;
    return Math.round(pct * 0.385 * 10) / 10;
  }

  function pctFmt(v) {
    v = num(v);
    if (v == null) return null;
    if (v >= 0 && v <= 1) return Math.round(v * 1000) / 10;
    return Math.round(v * 10) / 10;
  }

  function defaultSideFilter() {
    return S && S.createFilterState
      ? S.createFilterState({ hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' })
      : { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' };
  }

  var MODES = {
    'lineup-lineup': {
      id: 'lineup-lineup',
      label: 'Lineup vs Lineup',
      desc: 'Team offensive profiles with independent split context per side.',
      sideA: 'lineup',
      sideB: 'lineup',
      primaryKey: 'osi',
      primaryLabel: 'OSI',
      primaryCtx: 'osi'
    },
    'lineup-sp': {
      id: 'lineup-sp',
      label: 'Lineup vs Starting Pitcher',
      desc: 'Lineup bats against a starting pitcher on allowed metrics.',
      sideA: 'lineup',
      sideB: 'pitcher',
      primaryKey: 'osi',
      primaryLabel: 'OSI vs Allowed',
      primaryCtx: 'osi'
    },
    'lineup-bullpen': {
      id: 'lineup-bullpen',
      label: 'Lineup vs Bullpen',
      desc: 'Lineup offense against relief-only bullpen unit stats.',
      sideA: 'lineup',
      sideB: 'bullpen',
      primaryKey: 'osi',
      primaryLabel: 'OSI vs BP Allowed',
      primaryCtx: 'osi'
    },
    'pitcher-pitcher': {
      id: 'pitcher-pitcher',
      label: 'Pitcher vs Pitcher',
      desc: 'Starting pitcher skill and allowed metrics head-to-head.',
      sideA: 'pitcher',
      sideB: 'pitcher',
      primaryKey: 'pitchScore',
      primaryLabel: 'Pitching Score',
      primaryCtx: 'pitching'
    }
  };

  var LINEUP_SPLIT_GROUPS = [
    { key: 'hand', options: [{ v: 'both', l: 'Both' }, { v: 'r', l: 'vs RHP' }, { v: 'l', l: 'vs LHP' }] },
    { key: 'location', options: [{ v: 'all', l: 'Both' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }] },
    { key: 'segment', options: [{ v: 'full', l: 'Full Outing' }, { v: 'f5', l: 'F5' }] },
    { key: 'pitcher', options: [{ v: 'both', l: 'All Pitch' }, { v: 'sp', l: 'vs SP' }, { v: 'rp', l: 'vs RP' }] },
    { key: 'window', options: [{ v: 'YTD', l: 'YTD' }, { v: 'L30', l: 'L30' }, { v: 'L14', l: 'L14' }, { v: 'L7', l: 'L7' }] }
  ];

  var PITCHER_SPLIT_GROUPS = [
    { key: 'batSide', options: [{ v: 'both', l: 'Both' }, { v: 'r', l: 'vs RHH' }, { v: 'l', l: 'vs LHH' }] },
    { key: 'location', options: [{ v: 'all', l: 'Both' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }] },
    { key: 'segment', options: [{ v: 'full', l: 'Full Outing' }, { v: 'f5', l: 'F5' }] },
    { key: 'window', options: [{ v: 'YTD', l: 'YTD' }, { v: 'L30', l: 'L30' }, { v: 'L14', l: 'L14' }, { v: 'L7', l: 'L7' }] }
  ];

  var BULLPEN_SPLIT_GROUPS = [
    { key: 'batSide', options: [{ v: 'both', l: 'Both' }, { v: 'r', l: 'vs RHH' }, { v: 'l', l: 'vs LHH' }] },
    { key: 'location', options: [{ v: 'all', l: 'Both' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }] },
    { key: 'window', options: [{ v: 'YTD', l: 'YTD' }, { v: 'L30', l: 'L30' }, { v: 'L14', l: 'L14' }, { v: 'L7', l: 'L7' }] }
  ];

  var BP_PREFIX_MAP = {
    both: 'overall',
    home: 'home',
    away: 'away',
    r: 'vs_rhh',
    l: 'vs_lhh'
  };

  function modeEntity(modeId, sideKey) {
    var m = MODES[modeId] || MODES['lineup-lineup'];
    return sideKey === 'B' ? m.sideB : m.sideA;
  }

  function splitGroupsForSide(modeId, sideKey) {
    var entity = modeEntity(modeId, sideKey);
    if (entity === 'lineup') return LINEUP_SPLIT_GROUPS;
    if (entity === 'pitcher') return PITCHER_SPLIT_GROUPS;
    if (entity === 'bullpen') return BULLPEN_SPLIT_GROUPS;
    return [];
  }

  function normPitcherName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function ensureSpMetricSplits() {
    if (global.LIVE_DATA && LIVE_DATA.spMetricSplits && LIVE_DATA.spMetricSplits.length) {
      return Promise.resolve(LIVE_DATA.spMetricSplits);
    }
    var tabs = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
    if (!S || !tabs || !tabs.sp_metric_splits) return Promise.resolve([]);
    return S.fetchSheetTab(tabs.sp_metric_splits).then(function(rows) {
      rows = rows || [];
      if (global.LIVE_DATA) LIVE_DATA.spMetricSplits = rows;
      return rows;
    }).catch(function() { return []; });
  }

  function findPitcherLocationSplit(name, location) {
    if (!location || location === 'all') return null;
    var key = normPitcherName(name);
    var rows = (global.LIVE_DATA && LIVE_DATA.spMetricSplits) || [];
    return rows.find(function(r) {
      if (normPitcherName(S.pickCol(r, 'pitcher_name', 'Name', 'Pitcher')) !== key) return false;
      var dim = String(S.pickCol(r, ['split_dimension', 'splitDimension'])).toLowerCase();
      var val = String(S.pickCol(r, ['split_value', 'splitValue'])).toLowerCase();
      if (dim === 'location' && val === location) return true;
      var st = String(S.pickCol(r, ['split_type', 'splitType', 'split'])).toLowerCase().replace(/\s+/g, '_');
      return st === location || st === 'at_' + location;
    }) || null;
  }

  function fetchSpWindowRow(name, windowKey) {
    if (!windowKey || windowKey === 'YTD') return Promise.resolve(null);
    if (windowKey !== 'L14') return Promise.resolve(null);
    var tabs = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
    if (!S || !tabs || !tabs.sp_l14) return Promise.resolve(null);
    return S.fetchSheetTab(tabs.sp_l14).then(function(rows) {
      var key = normPitcherName(name);
      return (rows || []).find(function(r) {
        return normPitcherName(S.pickCol(r, ['Name', 'pitcher_name', 'Pitcher'])) === key;
      }) || null;
    }).catch(function() { return null; });
  }

  function overlaySplitRowMetrics(met, splitRow) {
    if (!splitRow) return met;
    var out = Object.assign({}, met);
    function pick(keys) {
      return num(S.pickCol(splitRow, keys));
    }
    var kPct = pick(['K_pct', 'K%']);
    var bbPct = pick(['BB_pct', 'BB%']);
    var hr9 = pick(['HR9', 'HR/9']);
    if (kPct != null) out.kPct = kPct;
    if (bbPct != null) out.bbPct = bbPct;
    if (hr9 != null) out.hr9 = hr9;
    var era = pick(['ERA', 'era']);
    if (era != null) { out.era = era; out.fip = pick(['FIP', 'fip']) != null ? pick(['FIP', 'fip']) : era; }
    ['abqAllowed', 'rcvAllowed', 'obrAllowed', 'osiAllowed'].forEach(function(k, i) {
      var cols = [['ABQ_allowed', 'ABQ Allowed'], ['RCV_allowed', 'RCV Allowed'], ['OBR_allowed', 'OBR Allowed'], ['OSI_allowed', 'OSI Allowed']][i];
      var v = pick(cols);
      if (v != null) out[k] = v;
    });
    if (S.computePitchScoreFromRates) {
      var ps = S.computePitchScoreFromRates(out.kPct, out.bbPct, out.hr9, null);
      if (ps != null) out.pitchScore = ps;
    }
    return out;
  }

  function applyF5Segment(met, sp, splitRow) {
    var f5 = num(S.pickCol(splitRow, ['F5_ERA', 'F5 ERA', 'f5_era']))
      || num(S.pickCol(sp, ['F5_ERA', 'F5 ERA', 'f5_era']));
    if (f5 == null) return met;
    var out = Object.assign({}, met);
    out.era = f5;
    out.fip = f5;
    out.f5Context = true;
    return out;
  }

  function overlaySpWindowMetrics(met, winRow) {
    if (!winRow) return met;
    var out = Object.assign({}, met);
    var kPct = num(S.pickCol(winRow, ['K%', 'K_pct', 'k_pct']));
    var bbPct = num(S.pickCol(winRow, ['BB%', 'BB_pct', 'bb_pct']));
    var era = num(S.pickCol(winRow, ['ERA', 'era']));
    var hr9 = num(S.pickCol(winRow, ['HR/9', 'HR9', 'hr9']));
    if (kPct != null) out.kPct = kPct;
    if (bbPct != null) out.bbPct = bbPct;
    if (era != null) { out.era = era; out.fip = num(S.pickCol(winRow, ['FIP', 'fip'])) || era; }
    if (hr9 != null) out.hr9 = hr9;
    if (S.computePitchScoreFromRates) {
      var ps = S.computePitchScoreFromRates(out.kPct, out.bbPct, out.hr9, null);
      if (ps != null) out.pitchScore = ps;
    }
    return out;
  }

  function filterSummary(filter) {
    filter = filter || {};
    var parts = [];
    if (filter.hand && filter.hand !== 'both') parts.push(filter.hand === 'r' ? 'vs RHP' : 'vs LHP');
    if (filter.batSide && filter.batSide !== 'both') parts.push(filter.batSide === 'r' ? 'vs RHH' : 'vs LHH');
    if (filter.location && filter.location !== 'all') parts.push(filter.location === 'home' ? 'Home' : 'Away');
    if (filter.segment === 'f5') parts.push('F5');
    else if (filter.segment === 'full') parts.push('Full Outing');
    if (filter.pitcher === 'sp') parts.push('vs SP');
    else if (filter.pitcher === 'rp') parts.push('vs RP');
    if (filter.window && filter.window !== 'YTD') parts.push(filter.window);
    return parts.length ? parts.join(' · ') : 'YTD · Both · Full Outing';
  }

  function teamPitchingHr9(team) {
    var LD = global.LIVE_DATA || {};
    var rows = LD.pitching || [];
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    var row = rows.find(function(p) { return S && S.teamKey(p.t) === tk; });
    return row ? num(row.hr9) : null;
  }

  function teamResultsRow(team) {
    return new Promise(function(resolve) {
      if (!LM || !LM.ensureStore) { resolve(null); return; }
      LM.ensureStore().then(function(store) {
        var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
        resolve((store && store.resultsByTeam && store.resultsByTeam[tk]) || null);
      }).catch(function() { resolve(null); });
    });
  }

  function resolveLineupSide(team, filter) {
    if (!LM || !LM.resolve) return Promise.resolve(null);
    var f = S ? S.createFilterState(filter) : filter;
    return LM.resolve(team, f).then(function(row) {
      if (!row) return null;
      return {
        entity: 'lineup',
        label: row.t,
        filterSummary: filterSummary(f),
        row: row,
        primary: num(row.osi),
        primaryLabel: 'OSI',
        filter: f
      };
    });
  }

  function pitcherBatSplitValue(sp, met, filter) {
    var bs = (filter && filter.batSide) || 'both';
    var lhh = num(S.pickCol(sp, 'osi_allowed_vs_lhh', 'OSI_allowed_LHH')) || met.osiAllowed;
    var rhh = num(S.pickCol(sp, 'osi_allowed_vs_rhh', 'OSI_allowed_RHH')) || met.osiAllowed;
    if (bs === 'l') return lhh;
    if (bs === 'r') return rhh;
    return met.osiAllowed;
  }

  function resolvePitcherSide(name, filter, deps) {
    deps = deps || {};
    var findSp = deps.findSpProfile;
    if (!findSp || !S) return Promise.resolve(null);
    var sp = findSp(name);
    if (!sp) return Promise.resolve(null);
    var f = S.createFilterState ? S.createFilterState(filter || {}) : (filter || {});

    return ensureSpMetricSplits().then(function() {
      return fetchSpWindowRow(name, f.window);
    }).then(function(winRow) {
      var met = S.spProfileMetrics(sp);
      var splitRow = findPitcherLocationSplit(name, f.location);
      met = overlaySplitRowMetrics(met, splitRow);
      if (!splitRow && (f.location === 'home' || f.location === 'away')) {
        var locEra = num(S.pickCol(sp, f.location === 'home' ? ['home_ERA', 'home_era'] : ['away_ERA', 'away_era']));
        if (locEra != null) {
          met = Object.assign({}, met);
          met.era = locEra;
          met.fip = locEra;
        }
      }
      if (f.segment === 'f5') met = applyF5Segment(met, sp, splitRow);
      if (f.window && f.window !== 'YTD') met = overlaySpWindowMetrics(met, winRow);
      var avgP = num(S.pickCol(sp, 'avg_pitches', 'Avg_Pitches', 'avg_pitches_per_start'));
      var avgIp = num(S.pickCol(sp, 'avg_IP', 'avg_ip', 'Avg_IP'));
      if (splitRow) {
        var spAvgP = num(S.pickCol(splitRow, ['avg_pitches', 'Avg_Pitches']));
        var spAvgIp = num(S.pickCol(splitRow, ['avg_IP', 'avg_ip']));
        if (spAvgP != null) avgP = spAvgP;
        if (spAvgIp != null) avgIp = spAvgIp;
      }
      var ppi = avgP != null && avgIp != null && avgIp > 0 ? Math.round((avgP / avgIp) * 10) / 10 : null;
      var allow = pitcherBatSplitValue(sp, met, f);
      return {
        entity: 'pitcher',
        label: name,
        filterSummary: filterSummary(f),
        row: sp,
        metricsObj: Object.assign({}, met, { pitchesPerInning: ppi, splitOsiAllowed: allow }),
        splitOsiAllowed: allow,
        primary: num(met.pitchScore),
        primaryLabel: f.segment === 'f5' ? 'Pitching Score (F5 ERA ctx)' : 'Pitching Score',
        filter: f,
        k9: ratePerNine(met.kPct),
        bb9: ratePerNine(met.bbPct)
      };
    });
  }

  function bullpenPrefix(filter) {
    filter = filter || {};
    var loc = filter.location === 'home' ? 'home' : filter.location === 'away' ? 'away' : null;
    var hand = filter.batSide === 'r' ? 'vs_rhh' : filter.batSide === 'l' ? 'vs_lhh' : null;
    if (loc && hand) return loc;
    if (hand) return hand;
    if (loc) return loc;
    return 'overall';
  }

  function bullpenRawRow(team) {
    var LD = global.LIVE_DATA || {};
    var rows = LD.bullpenUnitRows || [];
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    return rows.find(function(r) {
      return S && S.teamKey(S.pickCol(r, 'team', 'Tm', 'Team')) === tk;
    }) || null;
  }

  function bullpenPrefixedMetric(rawRow, prefix, metric, pct) {
    if (!rawRow || !prefix) return null;
    var keys = [prefix + '_' + metric];
    if (pct && metric.indexOf('_pct') < 0) {
      keys.push(prefix + '_' + metric.replace('_pct', '%'));
      keys.push(prefix + ' ' + metric);
    }
    var v = num(S.pickCol(rawRow, keys));
    if (v == null) return null;
    if (pct && v <= 1.5 && v >= 0) return Math.round(v * 1000) / 10;
    return v;
  }

  function bullpenResolvedMetrics(unit, rawRow, filter) {
    var f = filter || {};
    var prefix = bullpenPrefix(f);
    var osi = bullpenPrefixedMetric(rawRow, prefix, 'OSI_allowed')
      || bullpenBatMetric(unit, 'osiAllowed', f);
    return {
      osiAllowed: osi,
      fip: bullpenPrefixedMetric(rawRow, prefix, 'FIP') || (unit && unit.fip),
      bbPct: bullpenPrefixedMetric(rawRow, prefix, 'BB_pct', true) || (unit && unit.bbPct),
      opsAllowed: bullpenPrefixedMetric(rawRow, prefix, 'OPS_allowed'),
      era: bullpenPrefixedMetric(rawRow, prefix, 'ERA') || (unit && unit.era),
      kPct: bullpenPrefixedMetric(rawRow, prefix, 'K_pct', true),
      apps: bullpenPrefixedMetric(rawRow, prefix, 'apps'),
      ipPerApp: bullpenPrefixedMetric(rawRow, prefix, 'ip_per_app'),
      pitchesPerApp: bullpenPrefixedMetric(rawRow, prefix, 'pitches_per_app'),
      prefix: prefix
    };
  }

  function bullpenBatMetric(unit, key, filter) {
    var bs = (filter && filter.batSide) || 'both';
    if (key === 'osiAllowed') {
      if (bs === 'r' && unit.vsRhhOsi != null) return unit.vsRhhOsi;
      if (bs === 'l' && unit.vsLhhOsi != null) return unit.vsLhhOsi;
      return unit.osiAllowed;
    }
    return unit[key];
  }

  function resultRaw(R, baseKey, filter) {
    if (!R || !baseKey) return null;
    var winSuf = filter && filter.window && filter.window !== 'YTD' ? String(filter.window).toLowerCase() : null;
    var locSuf = filter && filter.location === 'home' ? 'home'
      : filter && filter.location === 'away' ? 'away' : null;
    var candidates = [];
    if (winSuf && locSuf) {
      candidates.push(baseKey + '_' + winSuf);
      candidates.push(baseKey + '_' + locSuf);
    } else if (winSuf) {
      candidates.push(baseKey + '_' + winSuf);
    } else if (locSuf) {
      candidates.push(baseKey + '_' + locSuf);
    }
    candidates.push(baseKey);
    for (var i = 0; i < candidates.length; i++) {
      var col = candidates[i];
      var raw = R[col];
      if (raw == null || raw === '') raw = S ? S.pickCol(R, col, col.toUpperCase()) : null;
      var v = num(raw);
      if (v != null) return v;
    }
    return null;
  }

  function resultMetric(R, baseKey, filter) {
    var v = resultRaw(R, baseKey, filter);
    return v != null ? pctFmt(v) : null;
  }

  function saveConversionPct(R, filter) {
    if (!R) return null;
    var blownPct = resultMetric(R, 'blown_save_pct', filter);
    if (blownPct != null) return Math.round((100 - blownPct) * 10) / 10;
    var saves = resultRaw(R, 'saves', filter);
    var blown = resultRaw(R, 'blown_saves', filter);
    if (saves == null && blown == null) return null;
    var s = saves != null ? saves : 0;
    var b = blown != null ? blown : 0;
    var opps = s + b;
    if (opps <= 0) return null;
    return Math.round((s / opps) * 1000) / 10;
  }

  function blownSavePct(R, filter) {
    if (!R) return null;
    var pct = resultMetric(R, 'blown_save_pct', filter);
    if (pct != null) return pct;
    var saves = resultRaw(R, 'saves', filter);
    var blown = resultRaw(R, 'blown_saves', filter);
    if (saves == null && blown == null) return null;
    var s = saves != null ? saves : 0;
    var b = blown != null ? blown : 0;
    var opps = s + b;
    if (opps <= 0) return null;
    return Math.round((b / opps) * 1000) / 10;
  }

  function resolveBullpenSide(team, filter) {
    var LD = global.LIVE_DATA || {};
    var units = LD.bullpenUnits || {};
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    var u = units[tk] || units[team];
    if (!u) return Promise.resolve(null);
    var f = S.createFilterState ? S.createFilterState(filter || {}) : (filter || {});
    var rawRow = bullpenRawRow(team);
    var met = bullpenResolvedMetrics(u, rawRow, f);
    var osi = met.osiAllowed;
    var score = osi != null ? Math.max(0, 100 - osi) : null;
    var resultsFilter = { window: f.window, location: f.location };
    return teamResultsRow(team).then(function(R) {
      var winPct = resultMetric(R, 'rp_win_pct', resultsFilter);
      return {
        entity: 'bullpen',
        label: team,
        filterSummary: filterSummary(f),
        row: u,
        rawRow: rawRow,
        metrics: met,
        results: R,
        splitOsiAllowed: osi,
        primary: score,
        primaryLabel: 'Bullpen Score',
        filter: f,
        saves: R ? num(R.saves) : null,
        blownSaves: R ? num(R.blown_saves) : null,
        winPct: winPct,
        savePct: saveConversionPct(R, resultsFilter),
        blownSavePct: blownSavePct(R, resultsFilter)
      };
    });
  }

  function resolveSide(modeId, sideKey, side, deps) {
    var entity = modeEntity(modeId, sideKey);
    if (!side || !side.key) return Promise.resolve(null);
    if (entity === 'lineup') return resolveLineupSide(side.key, side.filter);
    if (entity === 'pitcher') return resolvePitcherSide(side.key, side.filter, deps);
    if (entity === 'bullpen') return resolveBullpenSide(side.key, side.filter);
    return Promise.resolve(null);
  }

  function resolveBoth(modeId, sideA, sideB, deps) {
    return Promise.all([
      resolveSide(modeId, 'A', sideA, deps),
      resolveSide(modeId, 'B', sideB, deps)
    ]).then(function(res) {
      return { dataA: res[0], dataB: res[1] };
    });
  }

  function metricRow(label, valA, valB, opts) {
    opts = opts || {};
    return {
      label: label,
      valA: valA,
      valB: valB,
      higherBetter: opts.higherBetter !== false,
      invertA: !!opts.invertA,
      invertB: opts.invertB != null ? !!opts.invertB : !!opts.invertA,
      ctx: opts.ctx || 'osi',
      decimals: opts.decimals
    };
  }

  function lineupLineupMetrics(a, b) {
    var hrA = teamPitchingHr9(a.row.t);
    var hrB = teamPitchingHr9(b.row.t);
    return [
      metricRow('Win%', a.row.winPct, b.row.winPct, { ctx: 'pct' }),
      metricRow('wRC+', a.row.wrc, b.row.wrc, { ctx: 'osi' }),
      metricRow('wOBA', a.row.woba, b.row.woba, { ctx: 'osi' }),
      metricRow('xwOBA', a.row.xwoba, b.row.xwoba, { ctx: 'osi' }),
      metricRow('SLG', a.row.slg, b.row.slg, { ctx: 'osi' }),
      metricRow('OSI', a.row.osi, b.row.osi, { ctx: 'osi' }),
      metricRow('ABQ', a.row.abq, b.row.abq, { ctx: 'osi' }),
      metricRow('RCV', a.row.rcv, b.row.rcv, { ctx: 'osi' }),
      metricRow('PALS', a.row.pals, b.row.pals, { ctx: 'osi' }),
      metricRow('Pitch Score Allowed', a.row.pitchScore, b.row.pitchScore, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('Staff HR/9', hrA, hrB, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('Proj OSI', a.row.projOSI, b.row.projOSI, { ctx: 'osi' })
    ];
  }

  function lineupSpMetrics(lineup, pitcher, lineupFirst) {
    var lu = lineup;
    var sp = pitcher;
    var allow = sp.splitOsiAllowed != null ? sp.splitOsiAllowed : (sp.metricsObj && sp.metricsObj.osiAllowed);
    var mo = sp.metricsObj || {};
    if (lineupFirst) {
      return [
        metricRow('OSI vs Allowed', lu.row.osi, allow, { invertB: true }),
        metricRow('Win%', lu.row.winPct, null, { ctx: 'pct' }),
        metricRow('QS% Allowed', lu.row.qs, null, { ctx: 'pct' }),
        metricRow('wRC+', lu.row.wrc, null, { ctx: 'osi' }),
        metricRow('wOBA', lu.row.woba, null, { ctx: 'osi' }),
        metricRow('xwOBA', lu.row.xwoba, null, { ctx: 'osi' }),
        metricRow('SLG', lu.row.slg, null, { ctx: 'osi' }),
        metricRow('Pitching Score', null, sp.primary, { ctx: 'pitching' }),
        metricRow('K/9', null, sp.k9, { ctx: 'pitching' }),
        metricRow('BB/9', null, sp.bb9, { ctx: 'pitching', invertB: true }),
        metricRow('OSI Allowed', null, allow, { invertB: true }),
        metricRow('ABQ Allowed', lu.row.abq, mo.abqAllowed, { invertB: true }),
        metricRow('RCV vs Allowed', lu.row.rcv, mo.rcvAllowed, { invertB: true }),
        metricRow('HR/9', null, mo.hr9, { ctx: 'pitching', invertB: true })
      ];
    }
    return [
      metricRow('OSI vs Allowed', allow, lu.row.osi, { invertA: true }),
      metricRow('Win%', null, lu.row.winPct, { ctx: 'pct' }),
      metricRow('QS% Allowed', null, lu.row.qs, { ctx: 'pct' }),
      metricRow('wRC+', null, lu.row.wrc, { ctx: 'osi' }),
      metricRow('wOBA', null, lu.row.woba, { ctx: 'osi' }),
      metricRow('xwOBA', null, lu.row.xwoba, { ctx: 'osi' }),
      metricRow('SLG', null, lu.row.slg, { ctx: 'osi' }),
      metricRow('Pitching Score', sp.primary, null, { ctx: 'pitching' }),
      metricRow('K/9', sp.k9, null, { ctx: 'pitching' }),
      metricRow('BB/9', sp.bb9, null, { ctx: 'pitching', invertA: true }),
      metricRow('OSI Allowed', allow, null, { invertA: true }),
      metricRow('ABQ Allowed', mo.abqAllowed, lu.row.abq, { invertA: true }),
      metricRow('RCV vs Allowed', mo.rcvAllowed, lu.row.rcv, { invertA: true }),
      metricRow('HR/9', mo.hr9, null, { ctx: 'pitching', invertA: true })
    ];
  }

  function lineupWinPctForCompare(lu, filter) {
    if (!lu || !lu.row) return null;
    var f = filter || {};
    if (f.segment === 'f5' && lu.row.f5WinPct != null) return lu.row.f5WinPct;
    return lu.row.winPct;
  }

  function lineupBullpenMetrics(lineup, bp, lineupFirst, extras) {
    extras = extras || {};
    var lu = lineup.row || {};
    var met = bp.metrics || {};
    var luWin = lineupWinPctForCompare(lineup, lineup.filter);
    var luSaveAgainst = extras.savesAgainstPct;
    var luBlownCaused = extras.blownSavesCausedPct;
    var luFipAllowed = extras.fipAllowed != null ? extras.fipAllowed : lu.xfip;
    var bpFip = met.fip != null ? met.fip : bp.row.fip;
    var bpBb = met.bbPct != null ? met.bbPct : bp.row.bbPct;
    var bpOps = met.opsAllowed;
    var rows = [
      metricRow('Win% Against / Win% Earned', luWin, bp.winPct, { ctx: 'pct' }),
      metricRow('Saves Against % / Saves Earned %', luSaveAgainst, bp.savePct, { ctx: 'pct', invertA: true }),
      metricRow('BB% / BB% Allowed', lu.bb, bpBb, { ctx: 'pitching', invertB: true }),
      metricRow('Blown Saves Caused % / Blown Save %', luBlownCaused, bp.blownSavePct, { ctx: 'pct', invertB: true }),
      metricRow('OPS / OPS Allowed', lu.ops, bpOps, { ctx: 'ops', invertB: true, decimals: 3 }),
      metricRow('AVG / AVG Allowed', lu.avg, extras.avgAllowed, { ctx: 'avg', invertB: true, decimals: 3 }),
      metricRow('FIP Allowed / FIP', luFipAllowed, bpFip, { ctx: 'pitching', invertA: true, invertB: true })
    ];
    if (!lineupFirst) {
      return rows.map(function(r) {
        return metricRow(r.label, r.valB, r.valA, {
          ctx: r.ctx,
          invertA: r.invertB,
          invertB: r.invertA,
          decimals: r.decimals,
          higherBetter: r.higherBetter
        });
      });
    }
    return rows;
  }

  function pitcherPitcherMetrics(a, b) {
    var ma = a.metricsObj || {};
    var mb = b.metricsObj || {};
    var rows = [
      metricRow('Pitching Score', a.primary, b.primary, { ctx: 'pitching' }),
      metricRow('OOR', ma.oor, mb.oor, { ctx: 'osi' }),
      metricRow('K%', ma.kPct, mb.kPct, { ctx: 'pitching' }),
      metricRow('BB%', ma.bbPct, mb.bbPct, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('K/9', a.k9, b.k9, { ctx: 'pitching' }),
      metricRow('BB/9', a.bb9, b.bb9, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('HR/9', ma.hr9, mb.hr9, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('ABQ Allowed', ma.abqAllowed, mb.abqAllowed, { ctx: 'osi', invertA: true, invertB: true }),
      metricRow('OSI Allowed', a.splitOsiAllowed, b.splitOsiAllowed, { ctx: 'osi', invertA: true, invertB: true }),
      metricRow('RCV Allowed', ma.rcvAllowed, mb.rcvAllowed, { ctx: 'osi', invertA: true, invertB: true }),
      metricRow('Pitches / Inning', ma.pitchesPerInning, mb.pitchesPerInning, { ctx: 'osi' }),
      metricRow('ERA', ma.era, mb.era, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('FIP', ma.fip, mb.fip, { ctx: 'pitching', invertA: true, invertB: true })
    ];
    var f5A = a.filter && a.filter.segment === 'f5';
    var f5B = b.filter && b.filter.segment === 'f5';
    if (f5A || f5B) {
      rows.splice(12, 0, metricRow('F5 ERA', f5A ? ma.era : null, f5B ? mb.era : null, { ctx: 'pitching', invertA: true, invertB: true }));
    }
    return rows;
  }

  function buildMetricRows(modeId, dataA, dataB) {
    if (!dataA || !dataB) return [];
    if (modeId === 'lineup-lineup') return lineupLineupMetrics(dataA, dataB);
    if (modeId === 'lineup-sp') {
      var lu = dataA.entity === 'lineup' ? dataA : dataB;
      var sp = dataA.entity === 'pitcher' ? dataA : dataB;
      return lineupSpMetrics(lu, sp, dataA.entity === 'lineup');
    }
    if (modeId === 'lineup-bullpen') {
      var lu2 = dataA.entity === 'lineup' ? dataA : dataB;
      var bp2 = dataA.entity === 'bullpen' ? dataA : dataB;
      return lineupBullpenMetrics(lu2, bp2, dataA.entity === 'lineup', global._lvbMetricExtras || {});
    }
    if (modeId === 'pitcher-pitcher') return pitcherPitcherMetrics(dataA, dataB);
    return [];
  }

  global.CompareMetrics = {
    MODES: MODES,
    defaultSideFilter: defaultSideFilter,
    modeEntity: modeEntity,
    splitGroupsForSide: splitGroupsForSide,
    filterSummary: filterSummary,
    resolveBoth: resolveBoth,
    buildMetricRows: buildMetricRows,
    bullpenResolvedMetrics: bullpenResolvedMetrics,
    bullpenPrefix: bullpenPrefix,
    saveConversionPct: saveConversionPct,
    blownSavePct: blownSavePct,
    resultMetric: resultMetric
  };
})(typeof window !== 'undefined' ? window : this);
