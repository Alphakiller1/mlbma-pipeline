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
    { key: 'location', options: [{ v: 'all', l: 'All' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }] },
    { key: 'segment', options: [{ v: 'full', l: 'Full' }, { v: 'f5', l: 'F5' }] },
    { key: 'pitcher', options: [{ v: 'both', l: 'All Pitch' }, { v: 'sp', l: 'vs SP' }, { v: 'rp', l: 'vs RP' }] },
    { key: 'window', options: [{ v: 'YTD', l: 'YTD' }, { v: 'L30', l: 'L30' }, { v: 'L14', l: 'L14' }, { v: 'L7', l: 'L7' }] }
  ];

  var PITCHER_BAT_GROUPS = [
    { key: 'batSide', options: [{ v: 'both', l: 'Both' }, { v: 'r', l: 'vs RHH' }, { v: 'l', l: 'vs LHH' }] }
  ];

  function modeEntity(modeId, sideKey) {
    var m = MODES[modeId] || MODES['lineup-lineup'];
    return sideKey === 'B' ? m.sideB : m.sideA;
  }

  function splitGroupsForSide(modeId, sideKey) {
    var entity = modeEntity(modeId, sideKey);
    if (entity === 'lineup') return LINEUP_SPLIT_GROUPS;
    if (entity === 'pitcher' || entity === 'bullpen') return PITCHER_BAT_GROUPS;
    return [];
  }

  function filterSummary(filter) {
    filter = filter || {};
    var parts = [];
    if (filter.hand && filter.hand !== 'both') parts.push(filter.hand === 'r' ? 'vs RHP' : 'vs LHP');
    if (filter.location && filter.location !== 'all') parts.push(filter.location === 'home' ? 'Home' : 'Away');
    if (filter.segment === 'f5') parts.push('F5');
    if (filter.pitcher === 'sp') parts.push('vs SP');
    else if (filter.pitcher === 'rp') parts.push('vs RP');
    if (filter.window && filter.window !== 'YTD') parts.push(filter.window);
    if (filter.batSide && filter.batSide !== 'both') parts.push(filter.batSide === 'r' ? 'vs RHH' : 'vs LHH');
    return parts.length ? parts.join(' · ') : 'YTD · Both';
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
    var met = S.spProfileMetrics(sp);
    var avgP = num(S.pickCol(sp, 'avg_pitches', 'Avg_Pitches', 'avg_pitches_per_start'));
    var avgIp = num(S.pickCol(sp, 'avg_IP', 'avg_ip', 'Avg_IP'));
    var ppi = avgP != null && avgIp != null && avgIp > 0 ? Math.round((avgP / avgIp) * 10) / 10 : null;
    var allow = pitcherBatSplitValue(sp, met, filter);
    var bs = (filter && filter.batSide) || 'both';
    var splitNote = bs === 'r' ? 'vs RHH' : bs === 'l' ? 'vs LHH' : 'Both';
    return Promise.resolve({
      entity: 'pitcher',
      label: name,
      filterSummary: splitNote,
      row: sp,
      metricsObj: Object.assign({}, met, { pitchesPerInning: ppi, splitOsiAllowed: allow }),
      splitOsiAllowed: allow,
      primary: num(met.pitchScore),
      primaryLabel: 'Pitching Score',
      filter: filter,
      k9: ratePerNine(met.kPct),
      bb9: ratePerNine(met.bbPct)
    });
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

  function resolveBullpenSide(team, filter) {
    var LD = global.LIVE_DATA || {};
    var units = LD.bullpenUnits || {};
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    var u = units[tk] || units[team];
    if (!u) return Promise.resolve(null);
    var bs = (filter && filter.batSide) || 'both';
    var splitNote = bs === 'r' ? 'vs RHH' : bs === 'l' ? 'vs LHH' : 'Both';
    var osi = bullpenBatMetric(u, 'osiAllowed', filter);
    var score = osi != null ? Math.max(0, 100 - osi) : null;
    return teamResultsRow(team).then(function(R) {
      return {
        entity: 'bullpen',
        label: team,
        filterSummary: splitNote,
        row: u,
        results: R,
        splitOsiAllowed: osi,
        primary: score,
        primaryLabel: 'Bullpen Score',
        filter: filter,
        saves: R ? num(R.saves) : null,
        blownSaves: R ? num(R.blown_saves) : null,
        winPct: R ? pctFmt(R.win_pct) : null
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
      ctx: opts.ctx || 'osi'
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

  function lineupBullpenMetrics(lineup, bp, lineupFirst) {
    var allow = bp.splitOsiAllowed != null ? bp.splitOsiAllowed : bp.row.osiAllowed;
    var u = bp.row;
    if (lineupFirst) {
      return [
        metricRow('OSI vs BP Allowed', lineup.row.osi, allow, { invertB: true }),
        metricRow('Win%', lineup.row.winPct, bp.winPct, { ctx: 'pct' }),
        metricRow('wRC+', lineup.row.wrc, null, { ctx: 'osi' }),
        metricRow('wOBA', lineup.row.woba, u.woba, { ctx: 'osi' }),
        metricRow('Saves (team)', null, bp.saves, { ctx: 'osi' }),
        metricRow('Blown Saves', null, bp.blownSaves, { ctx: 'osi', invertB: true }),
        metricRow('BB% Allowed', null, u.bbPct, { ctx: 'pitching', invertB: true }),
        metricRow('FIP', null, u.fip, { ctx: 'pitching', invertB: true }),
        metricRow('OSI Allowed', null, allow, { invertB: true }),
        metricRow('ABQ vs Allowed', lineup.row.abq, u.abqAllowed, { invertB: true })
      ];
    }
    return [
      metricRow('OSI vs BP Allowed', allow, lineup.row.osi, { invertA: true }),
      metricRow('Win%', bp.winPct, lineup.row.winPct, { ctx: 'pct' }),
      metricRow('wRC+', null, lineup.row.wrc, { ctx: 'osi' }),
      metricRow('wOBA', u.woba, lineup.row.woba, { ctx: 'osi' }),
      metricRow('Saves (team)', bp.saves, null, { ctx: 'osi' }),
      metricRow('Blown Saves', bp.blownSaves, null, { ctx: 'osi', invertA: true }),
      metricRow('BB% Allowed', u.bbPct, null, { ctx: 'pitching', invertA: true }),
      metricRow('FIP', u.fip, null, { ctx: 'pitching', invertA: true }),
      metricRow('OSI Allowed', allow, null, { invertA: true }),
      metricRow('ABQ vs Allowed', u.abqAllowed, lineup.row.abq, { invertA: true })
    ];
  }

  function pitcherPitcherMetrics(a, b) {
    var ma = a.metricsObj || {};
    var mb = b.metricsObj || {};
    return [
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
      var bp = dataA.entity === 'bullpen' ? dataA : dataB;
      return lineupBullpenMetrics(lu2, bp, dataA.entity === 'lineup');
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
    buildMetricRows: buildMetricRows
  };
})(typeof window !== 'undefined' ? window : this);
