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
      LM.ensureStore({ needTeamResults: true }).then(function(store) {
        var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
        resolve((store && store.resultsByTeam && store.resultsByTeam[tk]) || null);
      }).catch(function() { resolve(null); });
    });
  }

  function teamProfileForTeam(team) {
    var profs = (global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam) || {};
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    return profs[tk] || null;
  }

  function pitchScoreFromTeamProfile(team) {
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    var profRows = (global.LIVE_DATA && LIVE_DATA.teamProfiles) || [];
    var row = profRows.find(function(r) {
      return S && S.teamKey(S.pickCol(r, 'team', 'Tm', 'Team')) === tk;
    });
    if (row && S) {
      var fromRow = num(S.pickCol(row, 'avg_pitching_score', 'avg pitching score', 'avg_pitchscore', 'Avg Pitching Score', 'Pitch Score Against'));
      if (fromRow != null) return fromRow;
    }
    var prof = teamProfileForTeam(team);
    if (!prof || !S) return null;
    return num(S.pickCol(prof, 'avg_pitching_score', 'avg pitching score', 'avg_pitchscore', 'Avg Pitching Score'));
  }

  function normalizeRateStat(v) {
    v = num(v);
    if (v == null) return null;
    if (v > 1.5 && v <= 100) return Math.round(v * 10) / 1000;
    return v;
  }

  function ensureCompareDataReady(modeId, deps) {
    deps = deps || {};
    var LD = global.LIVE_DATA || (global.LIVE_DATA = {});
    var tabs = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
    var chain = Promise.resolve();

    if (typeof global.deferResearchDataLoad === 'function') {
      chain = chain.then(function() { return global.deferResearchDataLoad(); });
    }

    if (typeof deps.fetchSpProfiles === 'function') {
      chain = chain.then(function() { return deps.fetchSpProfiles(); });
    }

    if (LM && LM.ensureStore) {
      var storeOpts = { needPals: true, needTeamResults: true };
      if (modeId === 'lineup-sp' || modeId === 'lineup-bullpen') storeOpts.needPitcherSplits = true;
      chain = chain.then(function() { return LM.ensureStore(storeOpts); });
    }

    if (!S || !tabs) return chain;

    return chain.then(function() {
      var jobs = [];
      if (modeId === 'lineup-bullpen' || modeId === 'lineup-sp') {
        if (!LD.relieverLog || !LD.relieverLog.length) {
          jobs.push(S.fetchSheetTab(tabs.reliever_log).catch(function() { return []; }).then(function(rows) {
            LD.relieverLog = rows || [];
          }));
        }
      }
      if (modeId === 'lineup-bullpen') {
        if (!LD.bullpenUnitRows || !LD.bullpenUnitRows.length) {
          jobs.push(S.fetchSheetTab(tabs.bullpen_unit).catch(function() { return []; }).then(function(rows) {
            LD.bullpenUnitRows = rows || [];
            if (S.parseBullpenUnitRows) LD.bullpenUnits = S.parseBullpenUnitRows(rows);
          }));
        }
      }
      if (modeId === 'lineup-sp' || modeId === 'pitcher-pitcher') {
        if (!LD.spGameLog || !LD.spGameLog.length) {
          jobs.push(S.fetchSheetTab(tabs.sp_game_log).catch(function() { return []; }).then(function(rows) {
            LD.spGameLog = rows || [];
          }));
        }
        if (!LD.spMetricSplits || !LD.spMetricSplits.length) {
          jobs.push(ensureSpMetricSplits());
        }
      }
      if (modeId === 'lineup-lineup' && (!LD.pitching || !LD.pitching.length) && tabs.pitching_score) {
        jobs.push(S.fetchSheetTab(tabs.pitching_score).catch(function() { return []; }).then(function(rows) {
          if (S.parsePitchingRows) LD.pitching = S.parsePitchingRows(rows);
        }));
      }
      return Promise.all(jobs);
    });
  }

  function resolveLineupSide(team, filter) {
    if (!LM || !LM.resolve) return Promise.resolve(null);
    var f = S ? S.createFilterState(filter) : filter;
    return LM.resolve(team, f, { needPals: true, needTeamResults: true }).then(function(row) {
      if (!row) return null;
      row = enrichLineupRow(row);
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

  function enrichLineupRow(row) {
    if (!row) return row;
    var out = Object.assign({}, row);
    if (out.pals == null) out.pals = palsValueForTeam(out.t);
    if (out.pitchScore == null) out.pitchScore = pitchScoreFromTeamProfile(out.t);
    if (out.pitchScore == null) {
      var palsEntry = palsForTeam(out.t);
      if (palsEntry) {
        out.pitchScore = num(palsEntry.pitchScoreFaced || palsEntry.avg_pitch_score_faced);
      }
    }
    out.woba = normalizeRateStat(out.woba);
    out.xwoba = normalizeRateStat(out.xwoba);
    out.slg = normalizeRateStat(out.slg);
    out.ops = normalizeRateStat(out.ops);
    return out;
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
      opsAllowed: bullpenPrefixedMetric(rawRow, prefix, 'OPS_allowed')
        || (unit && unit.opsAllowed),
      avgAllowed: bullpenPrefixedMetric(rawRow, prefix, 'AVG_allowed')
        || (unit && unit.avgAllowed),
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
    return ensureCompareDataReady(modeId, deps || {}).then(function() {
      return Promise.all([
        resolveSide(modeId, 'A', sideA, deps),
        resolveSide(modeId, 'B', sideB, deps)
      ]);
    }).then(function(res) {
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

  function lineupPals(row) {
    if (row && row.pals != null) return row.pals;
    return palsValueForTeam(row && row.t);
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
      metricRow('PALS', lineupPals(a.row), lineupPals(b.row), { ctx: 'osi' }),
      metricRow('Pitch Score Allowed', a.row.pitchScore, b.row.pitchScore, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('Staff HR/9', hrA, hrB, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('Proj OSI', a.row.projOSI, b.row.projOSI, { ctx: 'osi' })
    ];
  }

  function normalizePct(v) {
    v = num(v);
    if (v == null) return null;
    if (v > 0 && v <= 1.5) return Math.round(v * 1000) / 10;
    return v;
  }

  function scaleRate(v) {
    v = num(v);
    if (v == null) return null;
    if (v > 0 && v <= 1.5) return v;
    return null;
  }

  function wobaFromSpProfile(row) {
    if (!row || !S) return null;
    var wrc = num(S.pickCol(row, 'wRC_faced', 'wrc_faced', 'wRC+_faced', 'wRC+'));
    if (wrc != null) return Math.round(0.320 * (wrc / 100) * 1000) / 1000;
    var w = scaleRate(S.pickCol(row, 'wOBA_allowed', 'woba_allowed', 'wOBA', 'woba'));
    if (w != null) return w;
    var ops = scaleRate(S.pickCol(row, 'OPS', 'ops_allowed', 'OPS_allowed'));
    if (ops != null) return Math.round((ops / 1.280) * 0.320 * 1000) / 1000;
    return null;
  }

  function whipFromPitchScore(ps) {
    ps = num(ps);
    if (ps == null) return null;
    return Math.round((1.42 - (ps - 50) * 0.0085) * 100) / 100;
  }

  function spQsFromLog(name) {
    if (!name || !S) return null;
    var log = (global.LIVE_DATA && LIVE_DATA.spGameLog) || [];
    var key = S.normName(name);
    var qs = 0;
    var n = 0;
    log.forEach(function(g) {
      var rowName = S.normName(S.pickCol(g, 'pitcher_name', 'Name', 'Pitcher'));
      if (rowName !== key) return;
      n++;
      var ip = num(S.pickCol(g, 'IP', 'ip')) || 0;
      var er = num(S.pickCol(g, 'ER', 'er')) || 0;
      if (ip >= 6 && er <= 3) qs++;
    });
    return n ? Math.round((qs / n) * 1000) / 10 : null;
  }

  function pitcherExtendedStats(spRow, mo) {
    mo = mo || {};
    spRow = spRow || {};
    var kPct = normalizePct(mo.kPct != null ? mo.kPct : S.pickCol(spRow, 'K_pct', 'K%', 'k_pct'));
    var bbPct = normalizePct(mo.bbPct != null ? mo.bbPct : S.pickCol(spRow, 'BB_pct', 'BB%', 'bb_pct'));
    var whip = num(S.pickCol(spRow, 'WHIP', 'whip'));
    var k9 = num(S.pickCol(spRow, 'K/9', 'K9', 'k9')) || ratePerNine(kPct);
    var bb9 = num(S.pickCol(spRow, 'BB/9', 'BB9', 'bb9')) || ratePerNine(bbPct);
    var xfip = num(S.pickCol(spRow, 'xFIP', 'xfip'));
    var fip = num(S.pickCol(spRow, 'FIP', 'fip')) || mo.fip;
    if (xfip == null) xfip = fip;
    var ops = scaleRate(S.pickCol(spRow, 'OPS_allowed', 'OPS Allowed', 'ops_allowed', 'OPS'));
    var woba = wobaFromSpProfile(spRow);
    var qsRaw = S.pickCol(spRow, 'QS_pct', 'qs_pct', 'QS%');
    var qs = pctFmt(qsRaw);
    var pitchScore = mo.pitchScore != null ? mo.pitchScore : num(S.pickCol(spRow, 'PitchScore'));
    var name = S.pickCol(spRow, 'Name', 'pitcher_name', 'Pitcher');
    if (qs == null && name) qs = spQsFromLog(name);
    return { k9: k9, bb9: bb9, whip: whip, xfip: xfip, fip: fip, ops: ops, woba: woba, qs: qs, pitchScore: pitchScore };
  }

  function palsForTeam(team) {
    var LD = global.LIVE_DATA || {};
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    if (LD.pals && !Array.isArray(LD.pals) && LD.pals[tk]) return LD.pals[tk];
    return (LD.pals || []).find(function(p) {
      return S && S.teamKey(p.t || p.Tm || p.team) === tk;
    }) || null;
  }

  function palsValueForTeam(team) {
    var entry = palsForTeam(team);
    if (!entry) return null;
    return num(entry.pals != null ? entry.pals : entry.PALS);
  }

  function lineupPitchingFaced(luRow, team) {
    luRow = luRow || {};
    if (luRow.l10K9Faced != null || luRow.l10Bb9Faced != null) {
      return {
        k9: luRow.l10K9Faced,
        bb9: luRow.l10Bb9Faced,
        whip: luRow.l10WhipFaced,
        xfip: luRow.l10XfipFaced
      };
    }
    var pals = palsForTeam(team || luRow.t);
    var pitchScore = luRow.pitchScore;
    return {
      k9: ratePerNine(luRow.k),
      bb9: ratePerNine(luRow.bb),
      whip: whipFromPitchScore(pitchScore),
      xfip: pals && pals.xfip != null ? pals.xfip : null
    };
  }

  function spWinPctFromLog(name) {
    if (!name || !S) return null;
    var log = (global.LIVE_DATA && LIVE_DATA.spGameLog) || [];
    var key = S.normName(name);
    var w = 0;
    var d = 0;
    log.forEach(function(g) {
      var rowName = S.normName(S.pickCol(g, 'pitcher_name', 'Name', 'Pitcher'));
      if (rowName !== key) return;
      var res = String(S.pickCol(g, 'team_result', 'Team_Result', 'result', 'dec', 'Dec') || '').trim().toUpperCase();
      if (!res) return;
      if (res.charAt(0) === 'W') { w++; d++; }
      else if (res.charAt(0) === 'L') d++;
    });
    return d ? Math.round((w / d) * 1000) / 10 : null;
  }

  function swapMetricRow(r) {
    return metricRow(r.label, r.valB, r.valA, {
      ctx: r.ctx,
      invertA: r.invertB,
      invertB: r.invertA,
      decimals: r.decimals,
      higherBetter: r.higherBetter
    });
  }

  function lineupSpMetrics(lineup, pitcher, lineupFirst) {
    var lu = lineup.row || {};
    var mo = pitcher.metricsObj || {};
    var allow = pitcher.splitOsiAllowed != null ? pitcher.splitOsiAllowed : mo.osiAllowed;
    var ext = pitcherExtendedStats(pitcher.row, mo);
    var against = lineupPitchingFaced(lu, lineup.label || lu.t);
    var spK9 = ext.k9 != null ? ext.k9 : pitcher.k9;
    var spBb9 = ext.bb9 != null ? ext.bb9 : pitcher.bb9;
    var spPitchScore = ext.pitchScore != null ? ext.pitchScore : pitcher.primary;
    var spWin = spWinPctFromLog(pitcher.label);
    var luWin = lineupWinPctForCompare(lineup, lineup.filter);
    var rows = [
      metricRow('OSI / OSI Allowed', lu.osi, allow, { invertB: true }),
      metricRow('Win% / SP Win%', luWin, spWin, { ctx: 'pct' }),
      metricRow('QS% / QS%', lu.qs, ext.qs, { ctx: 'qspct' }),
      metricRow('wRC+ / RCV Allowed', lu.wrc, mo.rcvAllowed, { invertB: true }),
      metricRow('wOBA / wOBA Allowed', lu.woba, ext.woba, { ctx: 'woba', invertB: true, decimals: 3 }),
      metricRow('xwOBA / xFIP', lu.xwoba, ext.xfip, { ctx: 'pitching', invertB: true, decimals: 3 }),
      metricRow('SLG / OPS Allowed', lu.slg, ext.ops, { ctx: 'ops', invertB: true, decimals: 3 }),
      metricRow('Pitch Score Against / Pitching Score', lu.pitchScore, spPitchScore, { ctx: 'pitching', invertA: true }),
      metricRow('K/9', against.k9, spK9, { ctx: 'pitching', invertA: true }),
      metricRow('BB/9', against.bb9, spBb9, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('WHIP', against.whip, ext.whip, { ctx: 'whip', invertA: true, invertB: true }),
      metricRow('ABQ / ABQ Allowed', lu.abq, mo.abqAllowed, { invertB: true }),
      metricRow('RCV / RCV Allowed', lu.rcv, mo.rcvAllowed, { invertB: true }),
      metricRow('HR/9 Faced / HR/9', teamPitchingHr9(lu.t), mo.hr9, { ctx: 'pitching', invertA: true, invertB: true })
    ];
    if (!lineupFirst) return rows.map(swapMetricRow);
    return rows;
  }

  function lineupWinPctForCompare(lu, filter) {
    if (!lu || !lu.row) return null;
    var f = filter || {};
    if (f.segment === 'f5' && lu.row.f5WinPct != null) return lu.row.f5WinPct;
    if (f.pitcher === 'rp' && lu.row.pitcherWinPct != null) return lu.row.pitcherWinPct;
    return lu.row.winPct;
  }

  function bbPctPoints(v) {
    if (S && S.rateAsPctPoints) {
      var pts = S.rateAsPctPoints(v);
      return pts != null ? Math.round(pts * 10) / 10 : null;
    }
    v = num(v);
    if (v == null) return null;
    if (v > 0 && v <= 1.5) return Math.round(v * 1000) / 10;
    return Math.round(v * 10) / 10;
  }

  function windowDaysFromFilter(filter) {
    var w = filter && filter.window;
    if (w === 'L7') return 7;
    if (w === 'L14') return 14;
    if (w === 'L30') return 30;
    return 0;
  }

  function normSpNameSet(ctx) {
    var names = {};
    var profiles = (ctx && ctx.spProfiles)
      || (global.LIVE_DATA && LIVE_DATA.spProfiles)
      || [];
    profiles.forEach(function(p) {
      var n = S ? S.pickCol(p, 'Name', 'pitcher_name', 'Pitcher') : null;
      if (n && S && S.normName) names[S.normName(n)] = true;
    });
    return names;
  }

  function isStarterArm(name, ctx) {
    if (!name) return false;
    var key = S && S.normName ? S.normName(name) : String(name).toLowerCase().trim();
    return !!normSpNameSet(ctx)[key];
  }

  function filterReliefApps(log, team, ctx, opts) {
    opts = opts || {};
    log = log || [];
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    return log.filter(function(r) {
      if (S.teamKey(S.pickCol(r, 'pitcher_team', 'team')) !== tk) return false;
      var name = S.pickCol(r, 'pitcher_name', 'Name');
      if (!opts.includeStarters && isStarterArm(name, ctx)) return false;
      return true;
    });
  }

  function aggregateSaveRates(log, team, role, windowDays, opponent) {
    var rows = log || [];
    var tk = S ? S.teamKey(team) : String(team || '').toUpperCase();
    var oppTk = opponent ? S.teamKey(opponent) : null;
    var cutoff = null;
    if (windowDays && windowDays > 0) {
      var d = new Date();
      d.setDate(d.getDate() - windowDays);
      cutoff = d.toISOString().slice(0, 10);
    }
    var saves = 0;
    var blown = 0;
    rows.forEach(function(r) {
      var dt = String(S.pickCol(r, 'date', 'Date') || '').slice(0, 10);
      if (cutoff && dt && dt < cutoff) return;
      var result = String(S.pickCol(r, 'result') || '').toLowerCase();
      if (result !== 'save' && result !== 'blown_save') return;
      var opp = S.teamKey(S.pickCol(r, 'opponent_team', 'opp', 'Opponent'));
      if (role === 'earned') {
        if (S.teamKey(S.pickCol(r, 'pitcher_team', 'team')) !== tk) return;
        if (oppTk && opp !== oppTk) return;
      } else if (opp !== tk) return;
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
    var luTk = S ? S.teamKey(lineupTeam) : String(lineupTeam || '').toUpperCase();
    var rows = filterReliefApps(log, bpTeam, ctx, { includeStarters: false }).filter(function(r) {
      return S.teamKey(S.pickCol(r, 'opponent_team', 'opp', 'Opponent')) === luTk;
    });
    if (!windowDays || windowDays <= 0) return rows;
    var d = new Date();
    d.setDate(d.getDate() - windowDays);
    var cutoff = d.toISOString().slice(0, 10);
    return rows.filter(function(r) {
      var dt = String(S.pickCol(r, 'date', 'Date') || '').slice(0, 10);
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
      var rowIp = num(S.pickCol(r, 'IP', 'ip')) || 0;
      var rowH = num(S.pickCol(r, 'H', 'hits')) || 0;
      var rowBb = num(S.pickCol(r, 'BB', 'bb')) || 0;
      var rowK = num(S.pickCol(r, 'K', 'k')) || 0;
      var rowHr = num(S.pickCol(r, 'HR', 'hr')) || 0;
      var rowBf = num(S.pickCol(r, 'batters_faced', 'BF', 'battersFaced'));
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
    return { apps: rows.length, bf: bf, avgAllowed: avgAllowed, opsAllowed: opsAllowed, bbPct: bbPct, fip: fip };
  }

  function aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, windowDays) {
    return aggregateReliefRateBlock(filterH2hReliefRows(log, bpTeam, lineupTeam, ctx, windowDays));
  }

  function pickSaveRate(block, key) {
    if (!block || !block.opps) return null;
    return block[key];
  }

  function bullpenSeasonAvgAllowed(log, bpTeam, ctx) {
    var block = aggregateReliefRateBlock(filterReliefApps(log, bpTeam, ctx, { includeStarters: false }));
    return block && block.avgAllowed != null ? block.avgAllowed : null;
  }

  function buildLineupBullpenExtras(lineupTeam, bpTeam, lineupData, bpData, opts) {
    opts = opts || {};
    var LD = global.LIVE_DATA || {};
    var log = opts.relieverLog || LD.relieverLog || [];
    var ctx = opts.ctx || { spProfiles: LD.spProfiles || [] };
    var luRow = (lineupData && lineupData.row) || {};
    var met = (bpData && bpData.metrics) || {};
    var bpUnit = (bpData && bpData.row) || {};
    var filter = (lineupData && lineupData.filter) || opts.filter || {};
    var winDays = opts.windowDays != null ? opts.windowDays : windowDaysFromFilter(filter);
    var filtered = filterReliefApps(log, bpTeam, ctx, { includeStarters: false });
    var against = aggregateSaveRates(filtered, lineupTeam, 'against', winDays);
    var earnedH2h = aggregateSaveRates(filtered, bpTeam, 'earned', winDays, lineupTeam);
    if ((!against.opps || !earnedH2h.opps) && winDays > 0) {
      if (!against.opps) against = aggregateSaveRates(filtered, lineupTeam, 'against', 0);
      if (!earnedH2h.opps) earnedH2h = aggregateSaveRates(filtered, bpTeam, 'earned', 0, lineupTeam);
    }
    var h2hRates = aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, winDays);
    if ((!h2hRates || !h2hRates.bf) && winDays > 0) {
      h2hRates = aggregateH2hReliefStats(log, bpTeam, lineupTeam, ctx, 0);
    }
    var seasonBlock = (!h2hRates || !h2hRates.bf)
      ? aggregateReliefRateBlock(filterReliefApps(log, bpTeam, ctx, { includeStarters: false }))
      : null;
    return {
      savesAgainstPct: pickSaveRate(against, 'savePct'),
      blownSavesCausedPct: pickSaveRate(against, 'blownPct'),
      savesEarnedPct: pickSaveRate(earnedH2h, 'savePct'),
      blownSavePctH2h: pickSaveRate(earnedH2h, 'blownPct'),
      fipAllowed: (h2hRates && h2hRates.fip != null ? h2hRates.fip : null)
        || (seasonBlock && seasonBlock.fip != null ? seasonBlock.fip : null)
        || (met.fip != null ? met.fip : bpUnit.fip),
      lineupOps: h2hRates && h2hRates.opsAllowed != null ? h2hRates.opsAllowed : luRow.ops,
      lineupAvg: h2hRates && h2hRates.avgAllowed != null ? h2hRates.avgAllowed : luRow.avg,
      lineupBbPct: h2hRates && h2hRates.bbPct != null ? h2hRates.bbPct : null,
      bpFip: (h2hRates && h2hRates.fip != null ? h2hRates.fip : null)
        || (seasonBlock && seasonBlock.fip != null ? seasonBlock.fip : null)
        || (met.fip != null ? met.fip : bpUnit.fip),
      bpBbPct: (h2hRates && h2hRates.bbPct != null ? h2hRates.bbPct : null)
        || (seasonBlock && seasonBlock.bbPct != null ? seasonBlock.bbPct : null)
        || (met.bbPct != null ? met.bbPct : bpUnit.bbPct),
      bpOpsAllowed: (h2hRates && h2hRates.opsAllowed != null ? h2hRates.opsAllowed : null)
        || (seasonBlock && seasonBlock.opsAllowed != null ? seasonBlock.opsAllowed : null)
        || met.opsAllowed || bpUnit.opsAllowed,
      bpAvgAllowed: (h2hRates && h2hRates.avgAllowed != null ? h2hRates.avgAllowed : null)
        || (seasonBlock && seasonBlock.avgAllowed != null ? seasonBlock.avgAllowed : null)
        || met.avgAllowed || bpUnit.avgAllowed
        || bullpenSeasonAvgAllowed(log, bpTeam, ctx)
    };
  }

  function lineupBullpenMetrics(lineup, bp, lineupFirst, extras) {
    extras = extras || {};
    var lu = lineup.row || {};
    var met = bp.metrics || {};
    var luWin = extras.winAgainstPct != null ? extras.winAgainstPct : lineupWinPctForCompare(lineup, lineup.filter);
    var luSaveAgainst = extras.savesAgainstPct;
    var luBlownCaused = extras.blownSavesCausedPct;
    var luFipAllowed = extras.fipAllowed != null ? extras.fipAllowed : null;
    var bpFip = extras.bpFip != null ? extras.bpFip
      : (met.fip != null ? met.fip : bp.row.fip);
    var luBb = extras.lineupBbPct != null ? extras.lineupBbPct : bbPctPoints(lu.bb);
    var luOps = extras.lineupOps != null ? extras.lineupOps : lu.ops;
    var luAvg = extras.lineupAvg != null ? extras.lineupAvg : lu.avg;
    var bpBb = extras.bpBbPct != null ? extras.bpBbPct : bbPctPoints(met.bbPct != null ? met.bbPct : bp.row.bbPct);
    var bpSavePct = extras.savesEarnedPct != null ? extras.savesEarnedPct : bp.savePct;
    var bpBlownSavePct = extras.blownSavePctH2h != null ? extras.blownSavePctH2h : bp.blownSavePct;
    var bpOps = extras.bpOpsAllowed != null ? extras.bpOpsAllowed : met.opsAllowed;
    var bpAvgAllowed = extras.bpAvgAllowed != null ? extras.bpAvgAllowed
      : (met.avgAllowed != null ? met.avgAllowed : (bp.row && bp.row.avgAllowed != null ? bp.row.avgAllowed : null));
    var bpAbq = (bp.row && bp.row.abqAllowed != null) ? bp.row.abqAllowed : null;
    var bpRcv = (bp.row && bp.row.rcvAllowed != null) ? bp.row.rcvAllowed : null;
    var rows = [
      metricRow('OSI / OSI Allowed', lu.osi, met.osiAllowed, { invertB: true }),
      metricRow('Win% Against / Win% Earned', luWin, bp.winPct, { ctx: 'rpwin' }),
      metricRow('Saves Against % / Saves Earned %', luSaveAgainst, bpSavePct, { ctx: 'qspct' }),
      metricRow('BB% / BB% Allowed', luBb, bpBb, { ctx: 'bp_bbpct', invertA: true, invertB: false }),
      metricRow('Blown Saves Caused % / Blown Save %', luBlownCaused, bpBlownSavePct, { ctx: 'qspct', invertA: false, invertB: true }),
      metricRow('OPS / OPS Allowed', luOps, bpOps, { ctx: 'ops', invertB: true, decimals: 3 }),
      metricRow('AVG / AVG Allowed', luAvg, bpAvgAllowed, { ctx: 'avg', invertB: true, decimals: 3 }),
      metricRow('ABQ / ABQ Allowed', lu.abq, bpAbq, { invertB: true }),
      metricRow('RCV / RCV Allowed', lu.rcv, bpRcv, { invertB: true }),
      metricRow('FIP Allowed / FIP', luFipAllowed, bpFip, { ctx: 'bp_fip', invertA: false, invertB: true })
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
      var extras = buildLineupBullpenExtras(
        lu2.label,
        bp2.label,
        lu2,
        bp2,
        global._lvbCompareOpts || {}
      );
      return lineupBullpenMetrics(lu2, bp2, dataA.entity === 'lineup', extras);
    }
    if (modeId === 'pitcher-pitcher') return pitcherPitcherMetrics(dataA, dataB);
    return [];
  }

  function metricCoverage(rows) {
    rows = rows || [];
    var total = rows.length * 2;
    var filled = 0;
    rows.forEach(function(r) {
      if (r.valA != null && !isNaN(r.valA)) filled++;
      if (r.valB != null && !isNaN(r.valB)) filled++;
    });
    return { total: total, filled: filled, pct: total ? Math.round((filled / total) * 100) : 100 };
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
    resultMetric: resultMetric,
    buildLineupBullpenExtras: buildLineupBullpenExtras,
    ensureCompareDataReady: ensureCompareDataReady,
    metricCoverage: metricCoverage
  };
})(typeof window !== 'undefined' ? window : this);
