// v20260620h
/**
 * Research Lab — Pitcher Intelligence tab
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
  var LEAGUE_OOR = 50;

  /** View-layer flag thresholds — tune in one place */
  var SP_FLAG_RULES = {
    regressionFipGap: 0.50,
    vulnerableKbbMax: 10,
    vulnerableHr9Min: 1.3,
    vulnerableEraMax: 4.50,
    elitePitchScoreMin: 70,
    eliteKpctMin: 22,
    eliteOsiAllowedMax: 55
  };

  /**
   * Pipeline-gated: SP vs-RHB/vs-LHB platoon columns.
   * When present on SP_Profiles, handedness toggle lights up automatically.
   */
  var SP_PLATOON_KEYS = {
    rhh: {
      osiAllowed: ['osi_allowed_vs_rhh', 'OSI_allowed_RHH', 'vs_rhh_osi_allowed', 'osiAllowedVsRhh'],
      pitchScore: ['pitch_score_vs_rhh', 'Pitch_Score_vs_RHH', 'vs_rhh_pitch_score'],
      kPct: ['k_pct_vs_rhh', 'K_pct_vs_RHH', 'vs_rhh_K_pct'],
      bbPct: ['bb_pct_vs_rhh', 'BB_pct_vs_RHH', 'vs_rhh_BB_pct'],
      abqAllowed: ['abq_allowed_vs_rhh', 'ABQ_allowed_RHH'],
      era: ['era_vs_rhh', 'ERA_vs_RHH', 'vs_rhh_ERA'],
      fip: ['fip_vs_rhh', 'FIP_vs_RHH']
    },
    lhh: {
      osiAllowed: ['osi_allowed_vs_lhh', 'OSI_allowed_LHH', 'vs_lhh_osi_allowed', 'osiAllowedVsLhh'],
      pitchScore: ['pitch_score_vs_lhh', 'Pitch_Score_vs_LHH', 'vs_lhh_pitch_score'],
      kPct: ['k_pct_vs_lhh', 'K_pct_vs_LHH', 'vs_lhh_K_pct'],
      bbPct: ['bb_pct_vs_lhh', 'BB_pct_vs_LHH', 'vs_lhh_BB_pct'],
      abqAllowed: ['abq_allowed_vs_lhh', 'ABQ_allowed_LHH'],
      era: ['era_vs_lhh', 'ERA_vs_LHH', 'vs_lhh_ERA'],
      fip: ['fip_vs_lhh', 'FIP_vs_LHH']
    }
  };

  var CACHE = {
    profiles: null, splits: null, gameLog: null, relievers: null, relieverLog: null, oorByTeam: null,
    searchQ: '', dropdownOpen: false,
    viewMode: 'pitcher', bpTeam: '', snapSplit: 'overall',
    intelTab: 'snapshot',
    sortKey: 'pitchScore', sortDir: -1, selected: '',
    tableHand: 'overall', tableSegment: 'full', expandedPitcher: ''
  };

  var SNAP_SPLIT_PILLS = [
    { id: 'overall', label: 'Overall' },
    { id: 'rhh', label: 'vs RHH' },
    { id: 'lhh', label: 'vs LHH' },
    { id: 'home', label: 'Home' },
    { id: 'away', label: 'Away' },
    { id: 'f5', label: 'F5' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return fmt(v, 1) + '%';
  }

  function numOrNull(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pickCol(row, names) {
    return S ? S.pickCol(row, names) : '';
  }

  function teamKey(t) {
    return S && S.teamKey ? S.teamKey(t) : String(t || '').trim().toUpperCase();
  }

  function normName(n) {
    return S ? S.normName(n) : String(n || '').toLowerCase().trim();
  }

  function mColor(v, invert, ctx) {
    if (!A) return '#71717A';
    if (ctx === 'oor') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    return A.metricColor(v, ctx || 'osi', !!invert);
  }
  function metricChip(v, invert, ctx, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals);
    return '<span class="chip c-na">' + fmt(v, decimals) + '</span>';
  }

  function profileMetrics(row) {
    return (row && S && S.spProfileMetrics) ? S.spProfileMetrics(row) : {};
  }

  /** Matchup-framed avatar — same circular HD treatment as Opening Dashboard. */
  function piPitcherAvatar(idOrName, slot, extra) {
    if (!A) return '';
    var presets = {
      rank: { crop: 'matchup', className: 'mc-headshot' },
      dropdown: { crop: 'matchup', className: 'mc-headshot' },
      snapshot: { crop: 'compare', className: 'mc-headshot', size: 80, eager: true },
      standout: { crop: 'matchup', className: 'mc-headshot', eager: false }
    };
    var base = presets[slot] || { crop: 'matchup', className: 'mc-headshot' };
    var html = A.pitcherAvatar(idOrName, Object.assign({}, base, extra || {}));
    return html ? '<span class="mc-sp-photo">' + html + '</span>' : '';
  }

  function ensureRegistry() {
    if (!A) return Promise.resolve();
    if (A.registry && A.registry.loaded) return Promise.resolve();
    if (global.PlatformDashboard && PlatformDashboard.initRegistry) {
      return PlatformDashboard.initRegistry();
    }
    if (global.fetchSheetTab && global.TABS && A.loadRegistry) {
      return A.loadRegistry(function() {
        return fetchSheetTab(TABS.player_registry).then(function(rows) {
          return typeof parseRegistrySheet === 'function' ? parseRegistrySheet(rows || []) : (rows || []);
        });
      });
    }
    return Promise.resolve();
  }

  function isStale(row) {
    return !!(profileMetrics(row).stale);
  }

  /** Analyst flags from SP profile metrics (no xFIP — field is null in pipeline). */
  function spFlags(m) {
    m = m || {};
    var flags = [];
    var era = numOrNull(m.era);
    var fip = numOrNull(m.fip);
    var kPct = numOrNull(m.kPct);
    var bbPct = numOrNull(m.bbPct);
    var hr9 = numOrNull(m.hr9);
    var pitchScore = numOrNull(m.pitchScore);
    var osiAllowed = numOrNull(m.osiAllowed);

    if (fip != null && era != null && (fip - era) >= SP_FLAG_RULES.regressionFipGap) {
      flags.push({ label: 'Regression risk', tone: 'risk' });
    }
    if (era != null && era <= SP_FLAG_RULES.vulnerableEraMax) {
      var kbb = (kPct != null && bbPct != null) ? (kPct - bbPct) : null;
      if ((kbb != null && kbb <= SP_FLAG_RULES.vulnerableKbbMax)
          || (hr9 != null && hr9 >= SP_FLAG_RULES.vulnerableHr9Min)) {
        flags.push({ label: 'Vulnerable', tone: 'vulnerable' });
      }
    }
    if (pitchScore != null && kPct != null && osiAllowed != null
        && pitchScore >= SP_FLAG_RULES.elitePitchScoreMin
        && kPct >= SP_FLAG_RULES.eliteKpctMin
        && osiAllowed <= SP_FLAG_RULES.eliteOsiAllowedMax) {
      flags.push({ label: 'Elite stuff', tone: 'elite' });
    }
    return flags;
  }

  function renderFlagPills(flags) {
    if (!flags || !flags.length) return '';
    return flags.map(function(f) {
      return '<span class="pl-flag-pill pl-flag-pill--' + esc(f.tone) + '">' + esc(f.label) + '</span>';
    }).join('');
  }

  /** Match abbreviated slate names (e.g. "Y. Yamamoto") to full SP_Profiles names. */
  function pitcherNamesMatch(a, b) {
    if (!a || !b) return false;
    var na = normName(a);
    var nb = normName(b);
    if (!na || !nb || na === 'tbd' || nb === 'tbd') return false;
    if (na === nb) return true;
    var la = na.split(' ').pop();
    var lb = nb.split(' ').pop();
    return la.length > 2 && la === lb;
  }

  function todayStarterRawNames() {
    var names = [];
    var matchups = (global.LIVE_DATA && LIVE_DATA.matchups) || [];
    matchups.forEach(function(m) {
      if (m.awaySP && String(m.awaySP).toUpperCase() !== 'TBD') names.push(String(m.awaySP).trim());
      if (m.homeSP && String(m.homeSP).toUpperCase() !== 'TBD') names.push(String(m.homeSP).trim());
    });
    return names;
  }

  function todayStarterSet() {
    var set = new Set();
    todayRankingsProfiles().forEach(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      if (n) set.add(normName(n));
    });
    return set;
  }

  function isTonightStarter(name) {
    return todayStarterRawNames().some(function(s) { return pitcherNamesMatch(s, name); });
  }

  function readPlatoonMetric(row, hand, field) {
    if (!row || hand === 'overall') return null;
    var keys = (SP_PLATOON_KEYS[hand] || {})[field] || [];
    return numOrNull(pickCol(row, keys));
  }

  function leagueHasSpPlatoon(rows) {
    return (rows || []).some(function(r) {
      return readPlatoonMetric(r, 'rhh', 'osiAllowed') != null
        || readPlatoonMetric(r, 'lhh', 'osiAllowed') != null;
    });
  }

  function tableMetric(row, hand, key, met, stats) {
    if (CACHE.tableSegment === 'f5' && (key === 'era' || key === 'fip')) {
      return stats.f5Era != null ? stats.f5Era : stats.era;
    }
    if (hand === 'overall') {
      if (key === 'era' || key === 'fip' || key === 'hr9' || key === 'f5Era') return stats[key];
      return met[key];
    }
    var plat = readPlatoonMetric(row, hand, key);
    return plat != null ? plat : null;
  }

  function todayRankingsProfiles() {
    var starters = todayStarterRawNames();
    if (!starters.length) return [];
    return starterProfiles().filter(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      return starters.some(function(s) { return pitcherNamesMatch(s, n); });
    });
  }

  function ratePerNine(pct) {
    if (pct == null || isNaN(pct)) return null;
    return Math.round(pct * 0.385 * 10) / 10;
  }

  function extendedStats(row, met) {
    met = met || profileMetrics(row);
    var whip = numOrNull(pickCol(row, ['WHIP', 'whip']));
    var k9 = numOrNull(pickCol(row, ['K/9', 'K9', 'k9'])) || ratePerNine(met.kPct);
    var bb9 = numOrNull(pickCol(row, ['BB/9', 'BB9', 'bb9'])) || ratePerNine(met.bbPct);
    var xfip = numOrNull(pickCol(row, ['xFIP', 'xfip', 'xFIP_faced'])) || numOrNull(row && row.xFIP);
    var woba = numOrNull(pickCol(row, ['wOBA', 'wOBA_allowed', 'woba_allowed', 'OBR_allowed']));
    return {
      era: met.era,
      whip: whip,
      k9: k9,
      bb9: bb9,
      hr9: met.hr9,
      fip: met.fip,
      xfip: xfip,
      woba: woba,
      f5Era: numOrNull(pickCol(row, ['F5_ERA', 'F5 ERA']))
    };
  }

  function pitcherRole(row) {
    var role = String(pickCol(row, ['role', 'Role', 'pitcher_role']) || '').trim().toUpperCase();
    if (role === 'RP' || role === 'REL' || role === 'RELIEVER') return 'RP';
    return 'SP';
  }

  /** Rotation SPs only — relievers belong in Bullpen View / bullpen report. */
  function isRotationSp(row) {
    if (!row || pitcherRole(row) !== 'SP') return false;
    var starts = numOrNull(pickCol(row, ['starts', 'Starts']));
    var avgIp = numOrNull(pickCol(row, ['avg_IP', 'avg IP', 'Avg_IP']));
    if (starts != null && starts >= 3) return true;
    if (starts != null && starts >= 2 && avgIp != null && avgIp >= 4) return true;
    if (starts != null && starts >= 1 && avgIp != null && avgIp >= 5) return true;
    return false;
  }

  function starterProfiles() {
    return (CACHE.profiles || []).filter(isRotationSp);
  }

  function loadProfiles() {
    if (CACHE.profiles && CACHE.profiles.length) {
      return Promise.resolve(CACHE.profiles);
    }
    if (global.LIVE_DATA && LIVE_DATA.spProfiles && LIVE_DATA.spProfiles.length) {
      CACHE.profiles = LIVE_DATA.spProfiles.filter(isRotationSp);
      return Promise.resolve(CACHE.profiles);
    }
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      CACHE.profiles = rows || [];
      CACHE.oorByTeam = S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor
        ? S.buildOorByTeam(LIVE_DATA.oor) : {};
      if (S.enrichSpProfiles) S.enrichSpProfiles(CACHE.profiles, CACHE.oorByTeam);
      CACHE.profiles = CACHE.profiles.filter(isRotationSp);
      if (global.LIVE_DATA) LIVE_DATA.spProfiles = CACHE.profiles;
      return CACHE.profiles;
    }).catch(function() { CACHE.profiles = []; return []; });
  }

  function loadGameLog() {
    if (CACHE.gameLog && CACHE.gameLog.length) return Promise.resolve(CACHE.gameLog);
    if (global.LIVE_DATA && LIVE_DATA.spGameLog && LIVE_DATA.spGameLog.length) {
      CACHE.gameLog = LIVE_DATA.spGameLog;
      return Promise.resolve(CACHE.gameLog);
    }
    if (!S || !TABS || !TABS.sp_game_log) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_game_log).then(function(rows) {
      CACHE.gameLog = rows || [];
      if (global.LIVE_DATA) LIVE_DATA.spGameLog = CACHE.gameLog;
      return CACHE.gameLog;
    }).catch(function() { CACHE.gameLog = []; return []; });
  }

  function splitsRows() {
    if (CACHE.splits && CACHE.splits.length) return CACHE.splits;
    if (global.LIVE_DATA && LIVE_DATA.spMetricSplits && LIVE_DATA.spMetricSplits.length) {
      CACHE.splits = LIVE_DATA.spMetricSplits;
      return CACHE.splits;
    }
    return [];
  }

  function gamelogRows() {
    if (CACHE.gameLog && CACHE.gameLog.length) return CACHE.gameLog;
    if (global.LIVE_DATA && LIVE_DATA.spGameLog && LIVE_DATA.spGameLog.length) {
      CACHE.gameLog = LIVE_DATA.spGameLog;
      return CACHE.gameLog;
    }
    return [];
  }

  function parseIp(ip) {
    if (ip == null || ip === '') return 0;
    var s = String(ip).trim();
    var dot = s.indexOf('.');
    if (dot >= 0) {
      var whole = parseInt(s.slice(0, dot), 10) || 0;
      var outs = parseInt(s.slice(dot + 1), 10) || 0;
      return whole + outs / 3;
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function loadSplits() {
    if (CACHE.splits && CACHE.splits.length) return Promise.resolve(CACHE.splits);
    if (global.LIVE_DATA && LIVE_DATA.spMetricSplits && LIVE_DATA.spMetricSplits.length) {
      CACHE.splits = LIVE_DATA.spMetricSplits;
      return Promise.resolve(CACHE.splits);
    }
    if (!S || !TABS || !TABS.sp_metric_splits) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_metric_splits).then(function(rows) {
      CACHE.splits = rows || [];
      if (global.LIVE_DATA) LIVE_DATA.spMetricSplits = CACHE.splits;
      return CACHE.splits;
    }).catch(function() { CACHE.splits = []; return []; });
  }

  var SNAP_SPLIT_DIM = {
    home: { dim: 'location', val: 'home' },
    away: { dim: 'location', val: 'away' }
  };

  function findMetricSplitRow(name, splitView) {
    if (!splitView || splitView === 'overall' || splitView === 'f5') return null;
    var key = normName(name);
    var rows = (global.LIVE_DATA && LIVE_DATA.spMetricSplits) || CACHE.splits || [];
    var spec = SNAP_SPLIT_DIM[splitView];
    return rows.find(function(r) {
      if (normName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher'])) !== key) return false;
      if (spec) {
        var dim = String(pickCol(r, ['split_dimension', 'splitDimension'])).toLowerCase();
        var val = String(pickCol(r, ['split_value', 'splitValue'])).toLowerCase();
        return dim === spec.dim && val === spec.val;
      }
      var st = String(pickCol(r, ['split_type', 'splitType', 'split', 'Split'])).toLowerCase().replace(/\s+/g, '_');
      var legacy = splitView === 'rhh' ? ['vs_rhh', 'rhh'] : splitView === 'lhh' ? ['vs_lhh', 'lhh'] : [splitView];
      for (var i = 0; i < legacy.length; i++) {
        if (st === legacy[i] || st.indexOf(legacy[i]) >= 0) return true;
      }
      return false;
    }) || null;
  }

  function overlaySplitRowMetrics(met, stats, splitRow) {
    if (!splitRow) return { met: met, stats: stats };
    var m = Object.assign({}, met);
    var s = Object.assign({}, stats);
    var era = numOrNull(pickCol(splitRow, ['ERA', 'era']));
    var kPct = numOrNull(pickCol(splitRow, ['K_pct', 'K%']));
    var bbPct = numOrNull(pickCol(splitRow, ['BB_pct', 'BB%']));
    var hr9 = numOrNull(pickCol(splitRow, ['HR9', 'HR/9']));
    if (kPct != null) m.kPct = kPct;
    if (bbPct != null) m.bbPct = bbPct;
    if (hr9 != null) m.hr9 = hr9;
    if (era != null) { s.era = era; s.fip = era; m.era = era; m.fip = era; }
    var abq = numOrNull(pickCol(splitRow, ['ABQ_allowed', 'ABQ Allowed']));
    var rcv = numOrNull(pickCol(splitRow, ['RCV_allowed', 'RCV Allowed']));
    var obr = numOrNull(pickCol(splitRow, ['OBR_allowed', 'OBR Allowed']));
    var osi = numOrNull(pickCol(splitRow, ['OSI_allowed', 'OSI Allowed']));
    if (abq != null) m.abqAllowed = abq;
    if (rcv != null) m.rcvAllowed = rcv;
    if (obr != null) m.obrAllowed = obr;
    if (osi != null) m.osiAllowed = osi;
    var f5 = numOrNull(pickCol(splitRow, ['F5_ERA', 'F5 ERA']));
    if (f5 != null) s.f5Era = f5;
    if (S && S.computePitchScoreFromRates) {
      var ps = S.computePitchScoreFromRates(m.kPct, m.bbPct, m.hr9, null);
      if (ps != null) m.pitchScore = ps;
    }
    return { met: m, stats: s };
  }

  function applyF5Context(stats, row, splitRow) {
    var f5 = numOrNull(pickCol(splitRow, ['F5_ERA', 'F5 ERA']))
      || numOrNull(pickCol(row, ['F5_ERA', 'F5 ERA']));
    var s = Object.assign({}, stats);
    s.f5Context = true;
    if (f5 == null) {
      s.f5Missing = true;
      return s;
    }
    s.era = f5;
    s.fip = f5;
    s.f5Era = f5;
    return s;
  }

  function f5WarningBlock() {
    return A && A.f5WarningHtml ? A.f5WarningHtml() : '';
  }

  function loadRelievers() {
    if (CACHE.relievers) return Promise.resolve(CACHE.relievers);
    if (!S || !TABS || !TABS.bullpen_individual) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.bullpen_individual).then(function(rows) {
      CACHE.relievers = rows || [];
      return CACHE.relievers;
    }).catch(function() { CACHE.relievers = []; return []; });
  }

  function loadRelieverLog() {
    if (CACHE.relieverLog) return Promise.resolve(CACHE.relieverLog);
    if (!S || !TABS || !TABS.reliever_log) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.reliever_log).then(function(rows) {
      CACHE.relieverLog = rows || [];
      return CACHE.relieverLog;
    }).catch(function() { CACHE.relieverLog = []; return []; });
  }

  function findProfile(keyOrName) {
    var key = normName(keyOrName);
    return starterProfiles().find(function(row) {
      return normName(pickCol(row, ['pitcher_name', 'Name', 'Pitcher'])) === key;
    }) || null;
  }

  function searchMatches(q) {
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    return starterProfiles().filter(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    }).slice(0, 10);
  }

  function pitcherGamelog(name, limit) {
    var key = normName(name);
    return gamelogRows()
      .filter(function(r) {
        return normName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher'])) === key;
      })
      .slice()
      .sort(function(a, b) {
        return String(pickCol(b, ['date', 'Date'])).localeCompare(String(pickCol(a, ['date', 'Date'])));
      })
      .slice(0, limit == null ? 12 : limit);
  }

  function summarizeStarts(starts) {
    if (!starts || !starts.length) return null;
    var totalIp = 0, totalK = 0, totalBb = 0, totalEr = 0, totalHr = 0, totalBf = 0;
    var f5ErSum = 0, f5N = 0, qs = 0, outsBefore5 = 0;
    starts.forEach(function(g) {
      var ip = parseIp(pickCol(g, ['IP', 'ip']));
      var er = numOrNull(pickCol(g, ['ER', 'er'])) || 0;
      var k = numOrNull(pickCol(g, ['K'])) || 0;
      var bb = numOrNull(pickCol(g, ['BB'])) || 0;
      var hr = numOrNull(pickCol(g, ['HR'])) || 0;
      var h = numOrNull(pickCol(g, ['H'])) || 0;
      var bf = numOrNull(pickCol(g, ['batters_faced', 'batters faced', 'BF']));
      if (bf == null || bf === 0) bf = k + bb + h;
      totalIp += ip;
      totalK += k;
      totalBb += bb;
      totalEr += er;
      totalHr += hr;
      totalBf += bf;
      var f5 = numOrNull(pickCol(g, ['f5_er', 'F5_ER', 'f5 ER']));
      if (f5 != null) { f5ErSum += f5; f5N++; }
      if (ip >= 6 && er <= 3) qs++;
      if (ip >= 5) outsBefore5++;
    });
    var n = starts.length;
    return {
      starts: n,
      avgIp: totalIp / n,
      avgK: totalK / n,
      avgBb: totalBb / n,
      avgEr: totalEr / n,
      avgF5Er: f5N ? f5ErSum / f5N : null,
      kPct: totalBf > 0 ? (totalK / totalBf) * 100 : null,
      bbPct: totalBf > 0 ? (totalBb / totalBf) * 100 : null,
      era: totalIp > 0 ? (totalEr / totalIp) * 9 : null,
      hrPer9: totalIp > 0 ? (totalHr / totalIp) * 9 : null,
      qsRate: (qs / n) * 100,
      ip5Rate: (outsBefore5 / n) * 100
    };
  }

  function buildPropLeans(met, l5, l10) {
    var leans = [];
    spFlags(met).forEach(function(f) {
      leans.push({ label: f.label, tone: f.tone });
    });
    if (l5) {
      if (l5.avgK >= 6.5) leans.push({ label: 'K prop — hot L5', tone: 'elite' });
      else if (l5.avgK <= 3.5) leans.push({ label: 'K prop — cold L5', tone: 'risk' });
      if (l5.avgEr >= 4) leans.push({ label: 'Runs allowed — elevated L5', tone: 'risk' });
      else if (l5.avgEr <= 2) leans.push({ label: 'Runs allowed — suppressed L5', tone: 'elite' });
      if (l5.avgF5Er != null) {
        if (l5.avgF5Er <= 2) leans.push({ label: 'F5 under lean', tone: 'elite' });
        else if (l5.avgF5Er >= 3.5) leans.push({ label: 'F5 over lean', tone: 'risk' });
      }
      if (l5.ip5Rate >= 80) leans.push({ label: 'Length — 5+ IP in most L5', tone: 'elite' });
      else if (l5.ip5Rate <= 40) leans.push({ label: 'Length — short outings L5', tone: 'risk' });
    }
    if (l10 && l5 && l10.avgK != null && l5.avgK != null) {
      if (l5.avgK - l10.avgK >= 1.5) leans.push({ label: 'K trend — improving', tone: 'elite' });
      else if (l10.avgK - l5.avgK >= 1.5) leans.push({ label: 'K trend — fading', tone: 'risk' });
    }
    if (met.pitchScore != null && met.pitchScore >= 70 && l5 && l5.kPct != null && l5.kPct >= 22) {
      leans.push({ label: 'Stuff + recent K%', tone: 'elite' });
    }
    var seen = {};
    return leans.filter(function(l) {
      if (seen[l.label]) return false;
      seen[l.label] = true;
      return true;
    }).slice(0, 6);
  }

  function propWindowCell(val, d, suffix) {
    if (val == null || isNaN(val)) return '<td class="num">—</td>';
    return '<td class="num">' + fmt(val, d) + (suffix || '') + '</td>';
  }

  function renderPropOutlook(name, row, met) {
    var log = pitcherGamelog(name, 12);
    var l5 = summarizeStarts(log.slice(0, 5));
    var l10 = summarizeStarts(log.slice(0, 10));
    var season = {
      avgIp: numOrNull(pickCol(row, ['avg_IP', 'avg IP'])),
      avgK: met.kPct != null ? 25 * (met.kPct / 100) : null,
      avgBb: met.bbPct != null ? 25 * (met.bbPct / 100) : null,
      avgEr: null,
      avgF5Er: numOrNull(pickCol(row, ['F5_ERA', 'F5 ERA'])),
      kPct: met.kPct,
      bbPct: met.bbPct,
      era: met.era,
      hrPer9: met.hr9,
      qsRate: null,
      ip5Rate: null
    };
    if (season.avgIp != null && met.era != null) {
      season.avgEr = (met.era * season.avgIp) / 9;
    }
    var leans = buildPropLeans(met, l5, l10);
    var leanHtml = leans.length
      ? '<div class="pl-prop-leans">' + leans.map(function(l) {
        return '<span class="pl-prop-lean pl-prop-lean--' + esc(l.tone) + '">' + esc(l.label) + '</span>';
      }).join('') + '</div>'
      : '<p class="pl-section-sub pl-prop-empty">No strong prop leans — check recent starts below.</p>';

    var rows = [
      { label: 'K / start', l5: l5 && l5.avgK, l10: l10 && l10.avgK, s: season.avgK, d: 1 },
      { label: 'ER / start', l5: l5 && l5.avgEr, l10: l10 && l10.avgEr, s: season.avgEr, d: 1, inv: true },
      { label: 'IP / start', l5: l5 && l5.avgIp, l10: l10 && l10.avgIp, s: season.avgIp, d: 1 },
      { label: 'K%', l5: l5 && l5.kPct, l10: l10 && l10.kPct, s: season.kPct, d: 1, sfx: '%' },
      { label: 'BB%', l5: l5 && l5.bbPct, l10: l10 && l10.bbPct, s: season.bbPct, d: 1, sfx: '%', inv: true },
      { label: 'ERA', l5: l5 && l5.era, l10: l10 && l10.era, s: season.era, d: 2, inv: true },
      { label: 'F5 ER avg', l5: l5 && l5.avgF5Er, l10: l10 && l10.avgF5Er, s: season.avgF5Er, d: 2, inv: true },
      { label: '5+ IP rate', l5: l5 && l5.ip5Rate, l10: l10 && l10.ip5Rate, s: season.ip5Rate, d: 0, sfx: '%' }
    ];

    var body = rows.map(function(r) {
      return '<tr><td>' + esc(r.label) + '</td>'
        + propWindowCell(r.l5, r.d, r.sfx)
        + propWindowCell(r.l10, r.d, r.sfx)
        + propWindowCell(r.s, r.d, r.sfx)
        + '</tr>';
    }).join('');

    return '<div class="pl-prop-panel">'
      + '<h4 class="pl-section-title">Prop Outlook</h4>'
      + '<p class="pl-section-sub">Recent form vs season — K props, runs allowed, F5, and outing length.</p>'
      + leanHtml
      + '<div class="rl-table-wrap pl-prop-table-wrap"><table class="rl-table-premium pl-prop-table"><thead><tr>'
      + '<th>Metric</th><th>L5</th><th>L10</th><th>Season</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>'
      + '</div>';
  }

  function gamelogRowClass(g) {
    var ip = parseIp(pickCol(g, ['IP', 'ip']));
    var er = numOrNull(pickCol(g, ['ER', 'er'])) || 0;
    var k = numOrNull(pickCol(g, ['K'])) || 0;
    if (k >= 6 && er <= 2) return ' pl-gamelog-row--good';
    if (er >= 5 || ip < 4) return ' pl-gamelog-row--bad';
    return '';
  }

  function renderRecentStarts(name) {
    var log = pitcherGamelog(name, 12);
    if (!log.length) {
      return '<div class="pl-gamelog-panel">'
        + '<h4 class="pl-section-title">Recent Starts</h4>'
        + '<p class="pl-section-sub">Start-by-start log for prop validation — opponent quality, F5 runs, and strikeouts.</p>'
        + '<p class="rl-empty">No starts in SP_Game_Log — run SP gamelog scrape.</p></div>';
    }
    var body = log.map(function(g) {
      var dt = pickCol(g, ['date', 'Date']);
      var opp = pickCol(g, ['opponent_team', 'opponent team', 'Opponent']);
      var ha = String(pickCol(g, ['home_away', 'home away', 'HA']) || '').charAt(0).toUpperCase();
      var ip = pickCol(g, ['IP', 'ip']);
      var er = pickCol(g, ['ER', 'er']);
      var k = pickCol(g, ['K']);
      var bb = pickCol(g, ['BB']);
      var hr = pickCol(g, ['HR']);
      var f5 = pickCol(g, ['f5_er', 'F5_ER', 'f5 ER']);
      var abqTier = pickCol(g, ['opponent_ABQ_tier', 'opponent ABQ tier']) || '—';
      var oppOsi = numOrNull(pickCol(g, ['opponent_OSI', 'opponent OSI']));
      var gs = numOrNull(pickCol(g, ['game_score', 'game score']));
      var logo = A ? A.teamLogoImg(opp, 18) : '';
      return '<tr class="pl-gamelog-row' + gamelogRowClass(g) + '">'
        + '<td class="pl-gamelog-date">' + esc(dt) + '</td>'
        + '<td class="pl-gamelog-opp"><span class="pl-gamelog-opp-inner">' + logo + ' ' + esc(opp) + '</span></td>'
        + '<td class="num">' + esc(ha || '—') + '</td>'
        + '<td class="num">' + esc(ip) + '</td>'
        + '<td class="num">' + esc(er) + '</td>'
        + '<td class="num pl-gamelog-k">' + esc(k) + '</td>'
        + '<td class="num">' + esc(bb) + '</td>'
        + '<td class="num">' + esc(hr) + '</td>'
        + '<td class="num">' + (f5 !== '' && f5 != null ? esc(f5) : '—') + '</td>'
        + '<td class="num">' + esc(abqTier) + '</td>'
        + '<td class="num">' + (oppOsi != null ? fmt(oppOsi, 1) : '—') + '</td>'
        + '<td class="num">' + (gs != null ? fmt(gs, 1) : '—') + '</td>'
        + '</tr>';
    }).join('');

    return '<div class="pl-gamelog-panel">'
      + '<h4 class="pl-section-title">Recent Starts</h4>'
      + '<p class="pl-section-sub">Last ' + log.length + ' outings — green = 6+ K &amp; ≤2 ER · red = 5+ ER or &lt;4 IP</p>'
      + '<div class="rl-table-wrap pl-gamelog-wrap"><table class="rl-table-premium pl-gamelog-table"><thead><tr>'
      + '<th>Date</th><th>Opp</th><th>H/A</th><th>IP</th><th>ER</th><th>K</th><th>BB</th><th>HR</th><th>F5 ER</th><th>Opp ABQ</th><th>Opp OSI</th><th>GS</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function renderDropdown(items) {
    var dd = document.getElementById('plSearchDropdown');
    if (!dd) return;
    if (!items.length) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = items.map(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
      var met = profileMetrics(row);
      var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
      var av = piPitcherAvatar(pid || n, 'dropdown');
      var logo = A ? A.teamLogoImg(t, 20) : '';
      return '<button type="button" class="pl-dd-item" data-name="' + esc(n) + '">'
        + av
        + '<span class="pl-dd-body">'
        + '<span class="pl-dd-name">' + esc(n) + '</span>'
        + '<span class="pl-dd-meta">' + logo + ' <span class="hand-pill hand-' + hand.toLowerCase() + '">' + esc(hand) + 'HP</span></span>'
        + '</span>'
        + '<span class="pl-dd-stats">ERA <strong>' + fmt(met.era, 2) + '</strong> · K% <strong>' + fmt(met.kPct, 1) + '</strong></span>'
        + '</button>';
    }).join('');
    dd.querySelectorAll('.pl-dd-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectPitcher(btn.getAttribute('data-name'), true);
        dd.style.display = 'none';
      });
    });
  }

  function selectPitcher(name, switchToSnapshot) {
    CACHE.selected = name;
    if (switchToSnapshot) CACHE.intelTab = 'snapshot';
    var inp = document.getElementById('plPitcherSearch');
    if (inp) inp.value = name;
    loadGameLog().then(function() {
      renderIntelSubTabs();
      renderSnapshot();
      renderPitcherLabChrome();
    });
  }

  function renderSnapshot() {
    var mount = document.getElementById('plSnapshotMount');
    if (!mount) return;
    if (CACHE.viewMode === 'bullpen' || CACHE.intelTab !== 'snapshot') {
      mount.innerHTML = '';
      return;
    }
    var row = findProfile(CACHE.selected);
    if (!row) {
      mount.innerHTML = '<p class="rl-empty">Search a starting pitcher above for prop outlook and recent starts.</p>';
      return;
    }
    var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
    var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
    var met = profileMetrics(row);
    var flags = spFlags(met);
    var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
    var avatar = piPitcherAvatar(pid || name, 'snapshot');
    var logo = A ? A.teamLogoImg(team, 28) : '';
    var tonight = isTonightStarter(name);

    mount.innerHTML = '<div class="pl-snapshot-card pl-intel-snapshot ca-card">'
      + '<div class="pl-snap-eyebrow">SP Prop Research</div>'
      + '<div class="pl-snap-row1">'
      + avatar
      + '<div class="pl-snap-identity">'
      + '<h3 class="pl-snap-name pl-snap-name--intel">' + esc(name) + '</h3>'
      + '<div class="pl-snap-meta">' + logo
      + ' <span class="hand-pill hand-' + hand.toLowerCase() + '">' + esc(hand) + 'HP</span>'
      + ' <span class="pl-role-pill">SP</span>'
      + (tonight ? ' <span class="pl-tonight-badge">TONIGHT</span>' : '')
      + (isStale(row) ? ' <span class="pl-stale-pill">Stale</span>' : '')
      + '</div>'
      + (flags.length ? '<div class="pl-snap-flags">' + renderFlagPills(flags) + '</div>' : '')
      + '<div class="pl-snap-quick">' + metricChip(met.pitchScore, false, 'pitching', 0)
      + ' <span class="pl-snap-quick-label">Pitch Score</span></div>'
      + '</div></div>'
      + renderPropOutlook(name, row, met)
      + renderRecentStarts(name)
      + '</div>';
  }

  function bullpenTeams() {
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    return Object.keys(units).sort();
  }

  function bullpenUnit(team) {
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    return units[teamKey(team)] || null;
  }

  function colVal(row, prefix, metric) {
    return numOrNull(pickCol(row, [prefix + '_' + metric, prefix + ' ' + metric]));
  }

  function renderBullpenUsageBlock(team) {
    var mountId = 'plBpUsageMount';
    if (!window.BullpenUsage) {
      return '<div id="' + mountId + '" class="bp-usage-empty">Usage module not loaded.</div>';
    }
    return '<div id="' + mountId + '" class="bp-usage-empty">Loading bullpen usage…</div>';
  }

  function paintBullpenUsage(team) {
    var el = document.getElementById('plBpUsageMount');
    if (!el || !window.BullpenUsage) return;
    BullpenUsage.loadForTeam(team, {
      log: CACHE.relieverLog || [],
      individuals: CACHE.relievers || [],
      live: true
    }).then(function(model) {
      el.outerHTML = BullpenUsage.renderUsageChart(model, { compact: true });
    }).catch(function() {
      var model = BullpenUsage.buildUsageModel({
        team: team,
        log: CACHE.relieverLog || [],
        individuals: CACHE.relievers || []
      });
      el.outerHTML = BullpenUsage.renderUsageChart(model, { compact: true });
    });
  }

  function renderBullpenView() {
    var mount = document.getElementById('plBullpenMount');
    if (!mount) return;
    if (CACHE.viewMode !== 'bullpen') {
      mount.innerHTML = '';
      return;
    }
    var teams = bullpenTeams();
    if (!CACHE.bpTeam && teams.length) CACHE.bpTeam = teams[0];
    var team = CACHE.bpTeam;
    var unit = bullpenUnit(team);
    var bpScore = S && S.bullpenPitchScore ? S.bullpenPitchScore(unit) : (unit && unit.bullpenScore);
    var woba = unit && (unit.woba != null ? unit.woba : numOrNull(pickCol(unit, ['overall_wOBA', 'wOBA'])));
    var rcv = unit && (unit.rcvAllowed != null ? unit.rcvAllowed : numOrNull(pickCol(unit, ['overall_RCV_allowed', 'RCV_allowed'])));
    var obr = unit && (unit.obrAllowed != null ? unit.obrAllowed : numOrNull(pickCol(unit, ['overall_OBR_allowed', 'OBR_allowed'])));
    var hiEra = unit && (unit.hiLevEra != null ? unit.hiLevEra : colVal(unit, 'high_leverage', 'ERA'));
    var medEra = unit && (unit.medLevEra != null ? unit.medLevEra : colVal(unit, 'medium_leverage', 'ERA'));

    var teamOpts = teams.map(function(t) {
      return '<option value="' + esc(t) + '"' + (t === team ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');

    var snapshot = unit
      ? '<div class="pl-bp-snapshot pl-bp-snapshot--unit">'
        + (A ? A.teamLogoImg(team, 48) : '')
        + '<div><h3 class="pl-bp-name">' + esc(team) + ' Bullpen Unit</h3>'
        + '<span class="pl-bp-score-badge" style="color:' + mColor(bpScore, false, 'pitching') + '">Score ' + fmt(bpScore, 0) + '</span>'
        + '<div class="pl-bp-stats">'
        + '<span>wOBA <strong>' + (woba != null ? Number(woba).toFixed(3) : '\u2014') + '</strong></span>'
        + '<span>RCV Allowed <strong style="color:' + mColor(rcv, true) + '">' + fmt(rcv) + '</strong></span>'
        + '<span>OBR Allowed <strong style="color:' + mColor(obr, true) + '">' + fmt(obr) + '</strong></span>'
        + '<span>Hi Lev ERA <strong>' + fmt(hiEra, 2) + '</strong></span>'
        + '<span>Med Lev ERA <strong>' + fmt(medEra, 2) + '</strong></span>'
        + '</div></div></div>'
      : '<p class="rl-empty">Bullpen unit data not loaded \u2014 run pipeline steps 12\u201313.</p>';

    mount.innerHTML = '<div class="pl-bp-panel">'
      + '<div class="pl-bp-controls">'
      + '<label for="plBpTeamSelect" class="ca-metric-label">Team</label>'
      + '<select id="plBpTeamSelect" class="pl-bp-select">' + teamOpts + '</select>'
      + '</div>'
      + snapshot
      + renderBullpenUsageBlock(team)
      + '<p class="rl-profile-link"><a href="bullpen_report.html?team=' + encodeURIComponent(team || '') + '">Full bullpen report \u2192</a></p>'
      + '</div>';

    paintBullpenUsage(team);

    var sel = document.getElementById('plBpTeamSelect');
    if (sel) {
      sel.addEventListener('change', function() {
        CACHE.bpTeam = sel.value;
        renderBullpenView();
      });
    }
  }

  function syncViewChrome() {
    var searchBlock = document.querySelector('.pl-intel-search-block');
    var subTabs = document.getElementById('plIntelSubTabs');
    if (searchBlock) searchBlock.style.display = CACHE.viewMode === 'bullpen' ? 'none' : '';
    if (subTabs && CACHE.viewMode === 'bullpen') {
      subTabs.innerHTML = '';
      subTabs.hidden = true;
    }
    syncIntelPanes();
  }

  function renderViewToggle() {
    var mount = document.getElementById('plViewToggle');
    if (!mount) return;
    mount.innerHTML = '<div class="pl-view-toggle">'
      + '<button type="button" class="pl-view-btn' + (CACHE.viewMode === 'pitcher' ? ' active' : '') + '" data-plview="pitcher">Pitcher Intelligence</button>'
      + '<button type="button" class="pl-view-btn' + (CACHE.viewMode === 'bullpen' ? ' active' : '') + '" data-plview="bullpen">Bullpen View</button>'
      + '</div>';
    syncViewChrome();
    mount.querySelectorAll('[data-plview]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        CACHE.viewMode = btn.getAttribute('data-plview');
        renderViewToggle();
        renderIntelSubTabs();
        if (CACHE.viewMode === 'bullpen') {
          loadRelievers().then(function() {
            renderBullpenView();
            renderSnapshot();
            renderRankings();
          });
        } else {
          renderBullpenView();
          renderSnapshot();
          renderRankings();
          renderPitcherLabChrome();
        }
      });
    });
  }

  function syncIntelPanes() {
    var snap = document.getElementById('plSnapshotPane');
    var rank = document.getElementById('plRankingsPane');
    var isPitcher = CACHE.viewMode === 'pitcher';
    var isSnap = CACHE.intelTab === 'snapshot';
    if (snap) snap.hidden = !isPitcher || !isSnap;
    if (rank) rank.hidden = !isPitcher || isSnap;
  }

  function renderIntelSubTabs() {
    var mount = document.getElementById('plIntelSubTabs');
    if (!mount) return;
    if (CACHE.viewMode === 'bullpen') {
      mount.innerHTML = '';
      mount.hidden = true;
      syncIntelPanes();
      return;
    }
    mount.hidden = false;
    var tab = CACHE.intelTab || 'snapshot';
    mount.innerHTML = '<div class="pl-intel-subtabs hub-pill-row" role="tablist" aria-label="Pitcher Intelligence views">'
      + '<button type="button" class="hub-pill pl-intel-subtab' + (tab === 'snapshot' ? ' active' : '')
      + '" data-pl-intel-tab="snapshot" role="tab" aria-selected="' + (tab === 'snapshot' ? 'true' : 'false') + '">Pitcher Snapshot</button>'
      + '<button type="button" class="hub-pill pl-intel-subtab' + (tab === 'rankings' ? ' active' : '')
      + '" data-pl-intel-tab="rankings" role="tab" aria-selected="' + (tab === 'rankings' ? 'true' : 'false') + '">Today\'s Starters Rankings</button>'
      + '</div>';
    mount.querySelectorAll('[data-pl-intel-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        CACHE.intelTab = btn.getAttribute('data-pl-intel-tab') || 'snapshot';
        renderIntelSubTabs();
        renderPitcherLabChrome();
        renderSnapshot();
        renderRankings();
      });
    });
    syncIntelPanes();
  }

  function renderSearchMount(root) {
    root.innerHTML = '<div id="plViewToggle"></div>'
      + '<div id="plIntelSubTabs"></div>'
      + '<div id="plSnapshotPane" class="pl-intel-pane">'
      + '<div class="pl-intel-search-block">'
      + '<p class="pl-intel-purpose">Starting pitchers only — prop outlook, recent starts, and opponent-quality context. Relievers → Bullpen View.</p>'
      + '<div class="pl-search-wrap pl-intel-search">'
      + '<input type="search" id="plPitcherSearch" class="pl-search-input pl-intel-search-input" placeholder="Search starting pitcher or team…" autocomplete="off">'
      + '<div id="plSearchDropdown" class="pl-search-dropdown"></div></div></div>'
      + '<div id="plStandoutMount"></div>'
      + '<div id="plSnapshotMount"></div>'
      + '</div>'
      + '<div id="plRankingsPane" class="pl-intel-pane" hidden>'
      + '<div id="plIntelToolbar"></div>'
      + '<div id="plRankingsMount"></div>'
      + '</div>'
      + '<div id="plBullpenMount"></div>';

    renderViewToggle();
    renderIntelSubTabs();

    syncViewChrome();
    var inp = document.getElementById('plPitcherSearch');
    if (inp) {
      inp.addEventListener('input', function() {
        CACHE.searchQ = inp.value;
        renderDropdown(searchMatches(inp.value));
        renderPitcherLabChrome();
      });
      inp.addEventListener('focus', function() {
        renderDropdown(searchMatches(inp.value));
      });
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.pl-search-wrap')) {
        var dd = document.getElementById('plSearchDropdown');
        if (dd) dd.style.display = 'none';
      }
    });
  }

  function filteredProfiles() {
    var q = CACHE.searchQ.toLowerCase().trim();
    return starterProfiles().filter(function(row) {
      if (!q) return true;
      var n = pickCol(row, ['pitcher_name', 'Name']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    });
  }

  function pickStandoutCards(rows) {
    var picks = [];
    var used = {};
    function tryAdd(row, reason, metricKey, label) {
      if (picks.length >= 3 || !row) return;
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      if (!n || used[n]) return;
      used[n] = true;
      var m = profileMetrics(row);
      var val = metricKey === 'fipGap' ? ((m.fip || 0) - (m.era || 0)) : m[metricKey];
      picks.push({ row: row, reason: reason, label: label || 'Pitching Score', val: val, flags: spFlags(m) });
    }
    var elite = rows.filter(function(r) {
      return spFlags(profileMetrics(r)).some(function(f) { return f.tone === 'elite'; });
    }).sort(function(a, b) {
      return (profileMetrics(b).pitchScore || 0) - (profileMetrics(a).pitchScore || 0);
    });
    tryAdd(elite[0], 'Elite stuff', 'pitchScore', 'Pitching Score');

    var reg = rows.filter(function(r) {
      return spFlags(profileMetrics(r)).some(function(f) { return f.tone === 'risk'; });
    }).sort(function(a, b) {
      var ma = profileMetrics(a), mb = profileMetrics(b);
      return ((mb.fip || 0) - (mb.era || 0)) - ((ma.fip || 0) - (ma.era || 0));
    });
    tryAdd(reg[0], 'Regression risk', 'fipGap', 'FIP − ERA');

    var rawStarters = todayStarterRawNames();
    if (rawStarters.length) {
      var starter = rows.filter(function(r) {
        var n = pickCol(r, ['pitcher_name', 'Name']);
        return rawStarters.some(function(s) { return pitcherNamesMatch(s, n); });
      }).sort(function(a, b) {
        return (profileMetrics(b).pitchScore || 0) - (profileMetrics(a).pitchScore || 0);
      })[0];
      tryAdd(starter, 'Tonight', 'pitchScore', 'Pitching Score');
    }

    rows.slice().sort(function(a, b) {
      return (profileMetrics(b).pitchScore || 0) - (profileMetrics(a).pitchScore || 0);
    }).forEach(function(r) {
      tryAdd(r, 'Top arm', 'pitchScore', 'Pitching Score');
    });
    return picks;
  }

  function standoutCardHtml(card) {
    var n = pickCol(card.row, ['pitcher_name', 'Name', 'Pitcher']);
    var pid = pickCol(card.row, ['pitcher_id', 'playerId', 'mlb_id']);
    var av = piPitcherAvatar(pid || n, 'standout');
    var invert = card.label === 'FIP − ERA';
    var valHtml = card.label === 'FIP − ERA'
      ? '<span class="chip" style="color:' + mColor(card.val, false, 'pitching') + '">' + fmt(card.val, 2) + '</span>'
      : metricChip(card.val, false, 'pitching', card.label === 'Pitching Score' ? 0 : 1);
    return '<button type="button" class="rl-scorecard rl-scorecard--pitcher pl-standout-card" data-standout-pitcher="' + esc(n) + '">'
      + av
      + '<div class="rl-scorecard-body">'
      + '<h4>' + esc(n) + '</h4>'
      + '<div class="pl-standout-reason">' + renderFlagPills(
        card.flags.length
          ? [card.flags.find(function(f) {
            return (card.reason === 'Elite stuff' && f.tone === 'elite')
              || (card.reason === 'Regression risk' && f.tone === 'risk')
              || (card.reason === 'Tonight' && f.tone !== 'risk')
              || (card.reason === 'Top arm' && f.tone === 'elite');
          }) || card.flags[0]]
          : [{ label: card.reason, tone: 'mid' }]
      ) + '</div>'
      + '<div class="ca-metric-label">' + esc(card.label) + '</div>'
      + '<div class="rl-metric-primary">' + valHtml + '</div>'
      + '</div></button>';
  }

  function renderStandoutMount(rows) {
    var mount = document.getElementById('plStandoutMount');
    if (!mount || CACHE.viewMode === 'bullpen' || CACHE.intelTab !== 'snapshot') {
      if (mount) mount.innerHTML = '';
      return;
    }
    var cards = pickStandoutCards(rows || filteredProfiles());
    if (!cards.length) {
      mount.innerHTML = '';
      return;
    }
    mount.innerHTML = '<div class="pl-standout-head"><h4 class="pl-section-title">Quick Angles</h4>'
      + '<p class="pl-section-sub">Tonight\'s starters and flagged arms — click to load prop research</p></div>'
      + '<div class="pl-standout-strip">' + cards.map(standoutCardHtml).join('') + '</div>';
    mount.querySelectorAll('[data-standout-pitcher]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectPitcher(btn.getAttribute('data-standout-pitcher'), true);
      });
    });
  }

  function renderIntelToolbar() {
    var mount = document.getElementById('plIntelToolbar');
    if (!mount || CACHE.viewMode === 'bullpen' || CACHE.intelTab !== 'rankings') {
      if (mount) mount.innerHTML = '';
      return;
    }
    var hand = CACHE.tableHand || 'overall';
    var segment = CACHE.tableSegment || 'full';
    var hasPlatoon = leagueHasSpPlatoon(CACHE.profiles || []);
    var platoonNote = (hand !== 'overall' && !hasPlatoon)
      ? '<p class="pl-platoon-soon">SP platoon splits coming soon — table shows overall metrics until pipeline adds vs-RHB/vs-LHB columns.</p>'
      : '';
    var segmentNote = segment === 'f5' ? f5WarningBlock() : '';
    var tonight = todayStarterRawNames();
    var todayHint = !tonight.length
      ? '<span class="pl-intel-hint">Projected starters unavailable — load matchups or check back on game day</span>'
      : '<span class="pl-intel-hint">' + tonight.length + ' projected starter' + (tonight.length === 1 ? '' : 's') + ' today</span>';

    mount.innerHTML = '<div class="pl-intel-toolbar">'
      + '<div class="pl-intel-group">'
      + '<span class="ca-metric-label">Today</span>'
      + '<div class="rl-pill-row">' + todayHint + '</div>'
      + '</div>'
      + '<div class="pl-intel-group">'
      + '<span class="ca-metric-label">Segment</span>'
      + '<div class="rl-pill-row">'
      + '<button type="button" class="ca-pill-btn' + (segment === 'full' ? ' active' : '') + '" data-pi-segment="full">Full Game</button>'
      + '<button type="button" class="ca-pill-btn' + (segment === 'f5' ? ' active' : '') + '" data-pi-segment="f5">F5</button>'
      + '</div></div>'
      + '<div class="pl-intel-group">'
      + '<span class="ca-metric-label">Handedness</span>'
      + '<div class="rl-pill-row">'
      + ['overall', 'rhh', 'lhh'].map(function(h) {
        var lbl = { overall: 'Overall', rhh: 'vs RHB', lhh: 'vs LHB' }[h];
        return '<button type="button" class="ca-pill-btn' + (hand === h ? ' active' : '') + '" data-pi-hand="' + h + '">' + lbl + '</button>';
      }).join('')
      + '</div></div></div>'
      + platoonNote + segmentNote;

    mount.querySelectorAll('[data-pi-hand]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        CACHE.tableHand = btn.getAttribute('data-pi-hand');
        renderRankings();
      });
    });
    mount.querySelectorAll('[data-pi-segment]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        CACHE.tableSegment = btn.getAttribute('data-pi-segment');
        if (CACHE.tableSegment === 'f5' && (CACHE.sortKey === 'era' || CACHE.sortKey === 'fip')) {
          CACHE.sortKey = 'f5Era';
        } else if (CACHE.tableSegment === 'full' && CACHE.sortKey === 'f5Era') {
          CACHE.sortKey = 'era';
        }
        renderRankings();
      });
    });
  }

  function renderExpandedPanel(row) {
    var m = profileMetrics(row);
    var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var flags = spFlags(m);
    return '<div class="pl-rank-expand">'
      + '<div class="pl-rank-expand-grid">'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">OSI Allowed</span>' + metricChip(m.osiAllowed, true, 'osi', 1) + '</div>'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">ABQ Allowed</span>' + metricChip(m.abqAllowed, true, 'osi', 1) + '</div>'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">RCV Allowed</span>' + metricChip(m.rcvAllowed, true, 'osi', 1) + '</div>'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">OBR Allowed</span>' + metricChip(m.obrAllowed, true, 'osi', 1) + '</div>'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">OOR</span>' + metricChip(m.oor, false, 'oor', 0) + '</div>'
      + '<div class="pl-expand-metric"><span class="ca-metric-label">HR/9</span>' + metricChip(m.hr9, true, 'pitching', 2) + '</div>'
      + '</div>'
      + (flags.length ? '<div class="pl-expand-flags">' + renderFlagPills(flags) + '</div>' : '')
      + (isStale(row) ? '<span class="pl-stale-pill">Stale sample</span> ' : '')
      + '<p class="rl-profile-link"><a href="pitcher_profile.html?pitcher=' + encodeURIComponent(n) + '">Open full profile →</a></p>'
      + '</div>';
  }

  function sortValue(row, key, met, stats) {
    if (key === 'name') return pickCol(row, ['pitcher_name', 'Name']);
    if (key === 'team') return pickCol(row, ['pitcher_team', 'Team']);
    if (key === 'hand') return pickCol(row, ['hand', 'Hand', 'pitcher_hand']);
    if (key === 'f5Era') return stats.f5Era;
    if (key === 'era') return stats.era;
    if (key === 'xfip') return stats.xfip;
    if (key === 'woba') return stats.woba;
    return met[key];
  }

  function sortProfiles(rows) {
    var key = CACHE.sortKey;
    var dir = CACHE.sortDir;
    return rows.slice().sort(function(a, b) {
      var ma = profileMetrics(a);
      var mb = profileMetrics(b);
      var sa = extendedStats(a, ma);
      var sb = extendedStats(b, mb);
      var av = sortValue(a, key, ma, sa);
      var bv = sortValue(b, key, mb, sb);
      if (key === 'name' || key === 'team' || key === 'hand') {
        return dir * String(av || '').localeCompare(String(bv || ''));
      }
      if (av == null) av = -999;
      if (bv == null) bv = -999;
      return dir * (av - bv);
    });
  }

  function renderRankings() {
    var mount = document.getElementById('plRankingsMount');
    if (!mount || CACHE.viewMode === 'bullpen' || CACHE.intelTab !== 'rankings') {
      if (mount) mount.innerHTML = '';
      var tb = document.getElementById('plIntelToolbar');
      if (tb && (CACHE.viewMode === 'bullpen' || CACHE.intelTab !== 'rankings')) tb.innerHTML = '';
      return;
    }
    renderIntelToolbar();
    var tonight = todayStarterRawNames();
    if (!tonight.length) {
      mount.innerHTML = '<div class="pl-section-head"><h4 class="pl-section-title">Today\'s Starters Rankings</h4>'
        + '<p class="pl-section-sub">Projected starters for today\'s slate</p></div>'
        + '<p class="rl-empty">Projected starters unavailable — load matchups or check back on game day.</p>';
      return;
    }
    var hand = CACHE.tableHand || 'overall';
    var segment = CACHE.tableSegment || 'full';
    var hasPlatoon = leagueHasSpPlatoon(CACHE.profiles || []);
    var rows = sortProfiles(todayRankingsProfiles());
    if (!rows.length) {
      mount.innerHTML = '<div class="pl-section-head"><h4 class="pl-section-title">Today\'s Starters Rankings</h4>'
        + '<p class="pl-section-sub">Projected starters for today\'s slate</p></div>'
        + '<p class="rl-empty">No profiled SPs match today\'s projected starters — refresh SP_Profiles or matchups.</p>';
      return;
    }
    var eraColKey = segment === 'f5' ? 'f5Era' : 'era';
    var COLS = [
      { k: 'pitchScore', label: 'Pitch Score' },
      { k: 'kPct', label: 'K%' },
      { k: 'bbPct', label: 'BB%' },
      { k: eraColKey, label: segment === 'f5' ? 'F5 ERA' : 'ERA' },
      { k: segment === 'f5' ? 'f5Era' : 'fip', label: segment === 'f5' ? 'F5 ERA' : 'FIP' },
      { k: 'osiAllowed', label: 'OSI Allowed' },
      { k: 'abqAllowed', label: 'ABQ Allowed' },
      { k: 'oor', label: 'OOR' }
    ];
    function th(k, label) {
      var sorted = CACHE.sortKey === k;
      var arrow = sorted ? (CACHE.sortDir < 0 ? ' ↓' : ' ↑') : '';
      return '<th class="pl-sort-th' + (sorted ? ' sorted' : '') + '" data-plsort="' + k + '">' + esc(label) + arrow + '</th>';
    }
    function tdNum(val, d, invert, ctx) {
      if (val == null || isNaN(val)) return '<td class="num">—</td>';
      return '<td class="num">' + metricChip(val, invert, ctx, d) + '</td>';
    }
    var colCount = 5 + COLS.length + 1;
    var body = rows.map(function(row, i) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      var handP = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || '?').charAt(0);
      var m = profileMetrics(row);
      var st = extendedStats(row, m);
      if (segment === 'f5') st = applyF5Context(st, row, null);
      var flags = spFlags(m);
      var sel = CACHE.selected === n ? ' pl-rank-row--selected' : '';
      var exp = CACHE.expandedPitcher === n ? ' pl-rank-row--expanded' : '';
      var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
      var vals = COLS.map(function(c) {
        var v = tableMetric(row, hand, c.k, m, st);
        var inv = c.k === 'osiAllowed' || c.k === 'abqAllowed' || c.k === 'bbPct' || c.k === 'era' || c.k === 'fip';
        var ctx = c.k === 'pitchScore' ? 'pitching' : (c.k === 'oor' ? 'oor' : (c.k === 'era' || c.k === 'fip' ? 'pitching' : 'osi'));
        var d = c.k === 'pitchScore' || c.k === 'oor' ? 0 : (c.k === 'era' || c.k === 'fip' ? 2 : 1);
        if (hand !== 'overall' && !hasPlatoon) {
          v = (c.k === 'era' || c.k === 'fip' || c.k === 'f5Era') ? st[c.k === 'f5Era' ? 'f5Era' : c.k] : m[c.k];
        }
        if (c.k === 'era' || c.k === 'fip' || c.k === 'f5Era') {
          var ev = c.k === 'f5Era' ? st.f5Era : v;
          return '<td class="num">' + (ev != null && !isNaN(ev) ? fmt(ev, 2) : '—') + '</td>';
        }
        return tdNum(v, d, inv, ctx);
      }).join('');
      var staleBadge = isStale(row) ? ' <span class="pl-stale-pill">Stale</span>' : '';
      var main = '<tr class="pl-rank-row' + sel + exp + '" data-pitcher="' + esc(n) + '">'
        + '<td class="num pl-rank-idx">' + (i + 1) + '</td>'
        + '<td class="pl-rank-name-select"><span class="pl-rank-pitcher-cell">'
        + piPitcherAvatar(pid || n, 'rank')
        + '<span class="pl-rank-pitcher-text">' + esc(n) + '</span>'
        + staleBadge
        + ' <span class="pl-tonight-badge">START</span>'
        + '</span></td>'
        + '<td class="pl-rank-team"><span class="pl-rank-team-inner">'
        + (A ? A.teamLogoImg(t, 24) : '') + ' <span class="pl-rank-team-abbr">' + esc(t) + '</span></span></td>'
        + '<td class="num">' + esc(handP) + '</td>'
        + '<td class="pl-rank-flags">' + renderFlagPills(flags) + '</td>'
        + vals
        + '<td class="pl-rank-chevron" aria-hidden="true">' + (exp ? '▾' : '▸') + '</td>'
        + '</tr>';
      var expand = exp
        ? '<tr class="pl-rank-expand-row"><td colspan="' + colCount + '">' + renderExpandedPanel(row) + '</td></tr>'
        : '';
      return main + expand;
    }).join('');

    mount.innerHTML = '<div class="pl-section-head"><h4 class="pl-section-title">Today\'s Starters Rankings</h4>'
      + '<p class="pl-section-sub">Projected starters only · sort any column · click row for allowed-metrics depth</p></div>'
      + '<div class="rl-table-wrap pl-rank-wrap rl-sticky-table pl-rank-table-wrap"><table class="rl-table-premium pl-rank-table rl-sp-rank-table hub-table"><thead><tr>'
      + '<th class="pl-rank-idx">#</th>'
      + '<th class="pl-sort-th' + (CACHE.sortKey === 'name' ? ' sorted' : '') + '" data-plsort="name">Pitcher' + (CACHE.sortKey === 'name' ? (CACHE.sortDir < 0 ? ' ↓' : ' ↑') : '') + '</th>'
      + th('team', 'Team') + th('hand', 'Hand')
      + '<th>Flags</th>'
      + COLS.map(function(c) { return th(c.k, c.label); }).join('')
      + '<th></th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';

    mount.querySelectorAll('[data-plsort]').forEach(function(thEl) {
      thEl.addEventListener('click', function() {
        var k = thEl.getAttribute('data-plsort');
        if (CACHE.sortKey === k) CACHE.sortDir *= -1;
        else {
          CACHE.sortKey = k;
          CACHE.sortDir = (k === 'name' || k === 'team' || k === 'hand') ? 1 : -1;
        }
        renderRankings();
      });
    });
    mount.querySelectorAll('.pl-rank-row').forEach(function(tr) {
      tr.addEventListener('click', function(e) {
        var n = tr.getAttribute('data-pitcher');
        if (e.target.closest('.pl-rank-name-select')) {
          selectPitcher(n, true);
          return;
        }
        CACHE.expandedPitcher = CACHE.expandedPitcher === n ? '' : n;
        renderRankings();
      });
    });
  }

  function renderPitcherLabChrome() {
    if (CACHE.viewMode === 'bullpen') {
      var sm = document.getElementById('plStandoutMount');
      if (sm) sm.innerHTML = '';
      return;
    }
    renderStandoutMount(filteredProfiles());
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || 'rlPitcherLabRoot');
    if (!root) return;
    root.innerHTML = '<p class="rl-loading">Loading Pitcher Intelligence…</p>';
    Promise.all([ensureRegistry(), loadProfiles(), loadSplits(), loadGameLog(), loadRelievers(), loadRelieverLog()]).then(function(results) {
      var rows = results[1] || [];
      if (!CACHE.oorByTeam && S && S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor) {
        CACHE.oorByTeam = S.buildOorByTeam(LIVE_DATA.oor);
      }
      renderSearchMount(root);
      renderIntelSubTabs();
      renderPitcherLabChrome();
      renderRankings();
      renderBullpenView();
      var starters = starterProfiles();
      if (starters.length && !CACHE.selected) {
        CACHE.selected = pickCol(starters[0], ['pitcher_name', 'Name', 'Pitcher']);
        renderSnapshot();
      }
    }).catch(function(err) {
      root.innerHTML = '<p class="rl-empty">Error loading Pitcher Intelligence: ' + esc(String(err)) + '</p>';
    });
  }

  function renderPitcherSnapshot(pitcher) {
    CACHE.intelTab = 'snapshot';
    renderIntelSubTabs();
    if (typeof pitcher === 'string') selectPitcher(pitcher, true);
    else if (pitcher) {
      CACHE.selected = pickCol(pitcher, ['pitcher_name', 'Name', 'Pitcher']);
      loadSplits().then(function() {
        renderSnapshot();
        renderPitcherLabChrome();
      });
    }
  }

  global.PitcherLab = {
    mount: mount,
    loadProfiles: loadProfiles,
    renderPitcherSnapshot: renderPitcherSnapshot,
    selectPitcher: selectPitcher,
    spFlags: spFlags
  };
  if (typeof global !== 'undefined') global.spFlags = spFlags;
})(typeof window !== 'undefined' ? window : this);
