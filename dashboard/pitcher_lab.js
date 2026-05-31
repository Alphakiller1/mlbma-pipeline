// v20260620f
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
   * Pipeline-gated: SP vs-RHB/vs-LHB platoon columns (Compare SP-modes gap).
   * When present on SP_Profiles, handedness toggle lights up automatically.
   */
  var SP_PLATOON_KEYS = {
    rhh: {
      osiAllowed: ['osi_allowed_vs_rhh', 'OSI_allowed_RHH', 'vs_rhh_osi_allowed', 'osiAllowedVsRhh'],
      pitchScore: ['pitch_score_vs_rhh', 'Pitch_Score_vs_RHH', 'vs_rhh_pitch_score'],
      kPct: ['k_pct_vs_rhh', 'K_pct_vs_RHH', 'vs_rhh_K_pct'],
      era: ['era_vs_rhh', 'ERA_vs_RHH', 'vs_rhh_ERA']
    },
    lhh: {
      osiAllowed: ['osi_allowed_vs_lhh', 'OSI_allowed_LHH', 'vs_lhh_osi_allowed', 'osiAllowedVsLhh'],
      pitchScore: ['pitch_score_vs_lhh', 'Pitch_Score_vs_LHH', 'vs_lhh_pitch_score'],
      kPct: ['k_pct_vs_lhh', 'K_pct_vs_LHH', 'vs_lhh_K_pct'],
      era: ['era_vs_lhh', 'ERA_vs_LHH', 'vs_lhh_ERA']
    }
  };

  var CACHE = {
    profiles: null, splits: null, gameLog: null, relievers: null, relieverLog: null, oorByTeam: null,
    sortKey: 'pitchScore', sortDir: -1, selected: '',
    searchQ: '', dropdownOpen: false,
    viewMode: 'pitcher', bpTeam: '', snapSplit: 'overall',
    todayFilter: 'all', tableHand: 'overall', tableSegment: 'full', expandedPitcher: ''
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
      rank: { crop: 'matchup', className: 'mc-headshot', eager: false },
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

  function todayStarterSet() {
    var set = new Set();
    var matchups = (global.LIVE_DATA && LIVE_DATA.matchups) || [];
    matchups.forEach(function(m) {
      if (m.awaySP && String(m.awaySP).toUpperCase() !== 'TBD') set.add(normName(m.awaySP));
      if (m.homeSP && String(m.homeSP).toUpperCase() !== 'TBD') set.add(normName(m.homeSP));
    });
    return set;
  }

  function isTonightStarter(name) {
    return todayStarterSet().has(normName(name));
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
      if (key === 'era' || key === 'fip' || key === 'hr9') return stats[key];
      return met[key];
    }
    var plat = readPlatoonMetric(row, hand, key);
    return plat != null ? plat : null;
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

  function loadProfiles() {
    if (CACHE.profiles && CACHE.profiles.length) {
      return Promise.resolve(CACHE.profiles);
    }
    if (global.LIVE_DATA && LIVE_DATA.spProfiles && LIVE_DATA.spProfiles.length) {
      CACHE.profiles = LIVE_DATA.spProfiles;
      return Promise.resolve(CACHE.profiles);
    }
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      CACHE.profiles = rows || [];
      CACHE.oorByTeam = S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor
        ? S.buildOorByTeam(LIVE_DATA.oor) : {};
      if (S.enrichSpProfiles) S.enrichSpProfiles(CACHE.profiles, CACHE.oorByTeam);
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

  function splitRowToStats(split) {
    if (!split) return null;
    return {
      starts: numOrNull(pickCol(split, ['starts', 'Starts'])),
      ERA: numOrNull(pickCol(split, ['ERA', 'era'])),
      K_pct: numOrNull(pickCol(split, ['K_pct', 'K%'])),
      OSI_allowed: numOrNull(pickCol(split, ['OSI_allowed', 'OSI Allowed']))
    };
  }

  function aggregateGamelogTier(starts) {
    if (!starts || !starts.length) return null;
    var totalIp = 0;
    var totalEr = 0;
    var totalBf = 0;
    var totalK = 0;
    var osiSum = 0;
    var osiN = 0;
    starts.forEach(function(r) {
      totalIp += parseIp(pickCol(r, ['IP', 'ip']));
      totalEr += numOrNull(pickCol(r, ['ER', 'er'])) || 0;
      var k = numOrNull(pickCol(r, ['K'])) || 0;
      var bb = numOrNull(pickCol(r, ['BB'])) || 0;
      var h = numOrNull(pickCol(r, ['H'])) || 0;
      var bf = numOrNull(pickCol(r, ['batters_faced', 'batters faced', 'BF']));
      if (bf == null || bf === 0) bf = k + bb + h;
      totalBf += bf;
      totalK += k;
      var osi = numOrNull(pickCol(r, ['opponent_OSI', 'opponent OSI']));
      if (osi != null) { osiSum += osi; osiN += 1; }
    });
    return {
      starts: starts.length,
      ERA: totalIp > 0 ? Math.round((totalEr / totalIp) * 9 * 100) / 100 : null,
      K_pct: totalBf > 0 ? Math.round((totalK / totalBf) * 1000) / 10 : null,
      OSI_allowed: osiN > 0 ? Math.round((osiSum / osiN) * 10) / 10 : null
    };
  }

  function findTierSplitRow(name, tier, dimension) {
    var key = normName(name);
    return splitsRows().find(function(s) {
      if (normName(pickCol(s, ['pitcher_name', 'Name', 'Pitcher'])) !== key) return false;
      var dim = String(pickCol(s, ['split_dimension', 'splitDimension'])).toLowerCase();
      if (dim !== dimension) return false;
      return String(pickCol(s, ['split_value', 'splitValue'])).toLowerCase() === tier.toLowerCase();
    }) || null;
  }

  function findOpponentTierSplit(name, tier) {
    return findTierSplitRow(name, tier, 'abq_tier') || findTierSplitRow(name, tier, 'osi_tier');
  }

  function buildAbqTierStats(name) {
    var tiers = ['High', 'Mid', 'Low'];
    var key = normName(name);
    var log = gamelogRows();
    var pitcherStarts = log.filter(function(r) {
      return normName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher'])) === key;
    });
    if (pitcherStarts.length) {
      return tiers.map(function(tier) {
        var bucket = pitcherStarts.filter(function(r) {
          var t = String(pickCol(r, ['opponent_ABQ_tier', 'opponent ABQ tier', 'Opponent_ABQ_tier'])).trim();
          return t.toLowerCase() === tier.toLowerCase();
        });
        return { tier: tier, stats: aggregateGamelogTier(bucket), source: 'gamelog' };
      });
    }
    return tiers.map(function(tier) {
      return { tier: tier, stats: splitRowToStats(findOpponentTierSplit(name, tier)), source: 'splits' };
    });
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
    return (CACHE.profiles || []).find(function(row) {
      return normName(pickCol(row, ['pitcher_name', 'Name', 'Pitcher'])) === key;
    }) || null;
  }

  function searchMatches(q) {
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    return (CACHE.profiles || []).filter(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    }).slice(0, 10);
  }

  function platoonOor(row, side) {
    var met = profileMetrics(row);
    var key = side === 'RHH'
      ? ['OOR_vs_RHH', 'oor_rhh', 'OOR_RHH', 'HvR']
      : ['OOR_vs_LHH', 'oor_lhh', 'OOR_LHH', 'HvL'];
    var v = numOrNull(pickCol(row, key));
    if (v != null) return v;
    var team = teamKey(pickCol(row, ['pitcher_team', 'Team', 'Tm']));
    var oorRow = CACHE.oorByTeam && CACHE.oorByTeam[team];
    if (!oorRow) return met.oor;
    return side === 'RHH' ? (oorRow.hvR != null ? oorRow.hvR : met.oor) : (oorRow.hvL != null ? oorRow.hvL : met.oor);
  }

  function findAbqSplit(name, tier) {
    return findOpponentTierSplit(name, tier);
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
        selectPitcher(btn.getAttribute('data-name'));
        dd.style.display = 'none';
      });
    });
  }

  function selectPitcher(name) {
    CACHE.selected = name;
    var inp = document.getElementById('plPitcherSearch');
    if (inp) inp.value = name;
    loadSplits().then(function() {
      return loadGameLog();
    }).then(function() {
      renderSnapshot();
      renderRankings();
    });
  }

  function statAnchorCell(label, val, d) {
    return '<div class="pl-stat-anchor-cell">'
      + '<div class="pl-stat-anchor-val">' + fmt(val, d) + '</div>'
      + '<div class="pl-stat-anchor-label">' + esc(label) + '</div></div>';
  }

  function createdMetricCard(label, val, invert, ctx) {
    return '<div class="pl-created-metric">'
      + '<div class="ca-metric-label">' + esc(label) + '</div>'
      + '<div class="pl-created-val" style="color:' + mColor(val, invert, ctx || 'osi') + '">' + fmt(val, label === 'Pitching Score' ? 0 : 1) + '</div>'
      + '</div>';
  }

  function oorBar(label, val) {
    var pct = val == null || isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
    var leaguePct = LEAGUE_OOR;
    return '<div class="pl-oor-row">'
      + '<span class="pl-oor-side">' + esc(label) + '</span>'
      + '<div class="pl-oor-track">'
      + '<span class="pl-oor-league" style="left:' + leaguePct + '%" title="League avg"></span>'
      + '<div class="pl-oor-fill" style="width:' + pct + '%;background:' + mColor(val, false, 'oor') + '"></div>'
      + '</div>'
      + '<span class="pl-oor-num" style="color:' + mColor(val, false, 'oor') + '">' + fmt(val, 0) + '</span>'
      + '</div>';
  }

  function renderOorSection(row, met) {
    var rhh = platoonOor(row, 'RHH');
    var lhh = platoonOor(row, 'LHH');
    return '<div class="pl-oor-panel">'
      + '<h4 class="pl-section-title">Opponent Quality (OOR)</h4>'
      + '<p class="pl-section-sub">vs RHH / LHH lineups — bar marker at league average (' + LEAGUE_OOR + ')</p>'
      + oorBar('vs RHH', rhh)
      + oorBar('vs LHH', lhh)
      + (isStale(row) ? '<span class="pl-stale-pill">Stale sample</span>' : '')
      + '</div>';
  }

  function renderOpponentTable(name) {
    var tierStats = buildAbqTierStats(name);
    var totalStarts = tierStats.reduce(function(n, t) { return n + ((t.stats && t.stats.starts) || 0); }, 0);
    var source = tierStats.some(function(t) { return t.source === 'gamelog'; }) ? 'SP_Game_Log' : 'SP_Metric_Splits';
    var rows = tierStats.map(function(entry) {
      var split = entry.stats;
      if (!split || !split.starts) {
        return '<tr class="pl-opp-row pl-opp-row--empty"><td>' + esc(entry.tier) + ' ABQ</td>'
          + '<td class="num" title="No starts vs this opponent ABQ tier">—</td>'
          + '<td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>';
      }
      return '<tr class="pl-opp-row"><td>' + esc(entry.tier) + ' ABQ</td>'
        + '<td class="num">' + fmt(split.starts, 0) + '</td>'
        + '<td class="num">' + fmt(split.ERA, 2) + '</td>'
        + '<td class="num">' + fmtPct(split.K_pct) + '</td>'
        + '<td class="num">' + metricChip(split.OSI_allowed, true, 'osi', 1) + '</td></tr>';
    }).join('');
    var foot = totalStarts
      ? '<p class="pl-section-sub pl-opp-foot">' + totalStarts + ' starts bucketed by opponent ABQ tier · ' + esc(source) + '</p>'
      : '<p class="pl-section-sub pl-opp-foot">No gamelog rows for this pitcher — run SP gamelog scrape + compute_sp_splits.</p>';
    return '<div class="pl-opp-panel">'
      + '<h4 class="pl-section-title">Opponent Profile</h4>'
      + '<p class="pl-section-sub">Performance vs High / Mid / Low ABQ lineups (by opponent lineup ABQ tier per start)</p>'
      + '<table class="rl-table-premium pl-opp-table"><thead><tr>'
      + '<th>Tier</th><th>Starts</th><th>ERA</th><th>K%</th><th>Opp OSI</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + foot + '</div>';
  }

  function renderSnapshot() {
    var mount = document.getElementById('plSnapshotMount');
    if (!mount) return;
    if (CACHE.viewMode === 'bullpen') {
      mount.innerHTML = '';
      return;
    }
    var row = findProfile(CACHE.selected);
    if (!row) {
      mount.innerHTML = '<p class="rl-empty">Select a pitcher above to view the Pitcher Intelligence snapshot.</p>';
      return;
    }
    var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
    var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
    var snapSplit = CACHE.snapSplit || 'overall';
    var met = profileMetrics(row);
    var splitRow = findMetricSplitRow(name, snapSplit);
    var stats = extendedStats(row, met);
    var merged = overlaySplitRowMetrics(met, stats, splitRow);
    met = merged.met;
    stats = merged.stats;
    if (snapSplit === 'f5') {
      stats = applyF5Context(stats, row, splitRow);
    }
    var role = pitcherRole(row);
    var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
    var avatar = piPitcherAvatar(pid || name, 'snapshot');
    var logo = A ? A.teamLogoImg(team, 28) : '';
    var splitPills = '<div class="rl-pill-row pl-snap-split-row" style="margin:12px 0 8px">'
      + SNAP_SPLIT_PILLS.map(function(p) {
        return '<button type="button" class="ca-pill-btn' + (snapSplit === p.id ? ' active' : '') + '" data-pl-snap-split="' + p.id + '">' + esc(p.label) + '</button>';
      }).join('') + '</div>';
    var allowedNote = '';
    if (snapSplit === 'f5') {
      allowedNote = '<p class="pl-section-sub" style="margin:0 0 8px">F5 view — ERA/FIP from first-five innings (inn. 1–5). Allowed metrics remain full-outing context.</p>'
        + f5WarningBlock();
    } else if (snapSplit !== 'overall') {
      allowedNote = splitRow
        ? '<p class="pl-section-sub" style="margin:0 0 8px">Rates from SP_Metric_Splits · ' + esc(snapSplit) + '.</p>'
        : '<p class="pl-section-sub" style="margin:0 0 8px">Split unavailable for this pitcher — showing overall until pipeline adds ' + esc(snapSplit) + ' rows.</p>';
    }
    function allowedCard(label, key, ctx) {
      if (snapSplit !== 'overall' && snapSplit !== 'f5' && !splitRow) {
        return '<div class="pl-created-metric" title="Split row not in SP_Metric_Splits">'
          + '<div class="ca-metric-label">' + esc(label) + '</div>'
          + '<div class="pl-created-val" style="color:#71717A">—</div></div>';
      }
      return createdMetricCard(label, met[key], true, ctx);
    }
    var eraLbl = snapSplit === 'f5' ? 'F5 ERA' : 'ERA';
    var fipLbl = snapSplit === 'f5' ? 'F5 ERA' : 'FIP';

    mount.innerHTML = '<div class="pl-snapshot-card pl-intel-snapshot ca-card">'
      + '<div class="pl-snap-eyebrow">Pitcher Snapshot</div>'
      + '<div class="pl-snap-row1">'
      + avatar
      + '<div class="pl-snap-identity">'
      + '<h3 class="pl-snap-name pl-snap-name--intel">' + esc(name) + '</h3>'
      + '<div class="pl-snap-meta">' + logo
      + ' <span class="hand-pill hand-' + hand.toLowerCase() + '">' + esc(hand) + 'HP</span>'
      + ' <span class="pl-role-pill">' + esc(role) + '</span>'
      + (isStale(row) ? ' <span class="pl-stale-pill">Stale</span>' : '')
      + '</div></div></div>'
      + '<div class="pl-stat-anchor">'
      + statAnchorCell(eraLbl, stats.f5Missing ? null : stats.era, 2)
      + statAnchorCell('WHIP', stats.whip, 2)
      + statAnchorCell('K/9', stats.k9, 1)
      + statAnchorCell('BB/9', stats.bb9, 1)
      + statAnchorCell('HR/9', stats.hr9, 2)
      + statAnchorCell(fipLbl, stats.f5Missing ? null : stats.fip, 2)
      + statAnchorCell('xFIP', stats.xfip, 2)
      + statAnchorCell('wOBA', stats.woba, 3)
      + '</div>'
      + splitPills
      + allowedNote
      + '<div class="pl-created-row">'
      + createdMetricCard('Pitching Score', met.pitchScore, false, 'pitching')
      + allowedCard('OSI Allowed', 'osiAllowed', 'osi')
      + allowedCard('ABQ Allowed', 'abqAllowed', 'osi')
      + allowedCard('RCV Allowed', 'rcvAllowed', 'osi')
      + allowedCard('OBR Allowed', 'obrAllowed', 'osi')
      + '</div>'
      + renderOorSection(row, met)
      + renderOpponentTable(name)
      + '<p class="rl-profile-link"><a href="pitcher_profile.html?pitcher=' + encodeURIComponent(name) + '">Full pitcher profile →</a></p>'
      + '</div>';
    mount.querySelectorAll('[data-pl-snap-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        CACHE.snapSplit = btn.getAttribute('data-pl-snap-split');
        renderSnapshot();
      });
    });
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
    if (searchBlock) searchBlock.style.display = CACHE.viewMode === 'bullpen' ? 'none' : '';
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
        }
      });
    });
  }

  function renderSearchMount(root) {
    root.innerHTML = '<div id="plViewToggle"></div>'
      + '<div class="pl-intel-search-block">'
      + '<div class="pl-search-wrap pl-intel-search">'
      + '<input type="search" id="plPitcherSearch" class="pl-search-input pl-intel-search-input" placeholder="Search pitcher or team..." autocomplete="off">'
      + '<div id="plSearchDropdown" class="pl-search-dropdown"></div></div></div>'
      + '<div id="plSnapshotMount"></div>'
      + '<div id="plBullpenMount"></div>'
      + '<div id="plStandoutMount"></div>'
      + '<div id="plIntelToolbar"></div>'
      + '<div id="plRankingsMount"></div>';

    renderViewToggle();

    syncViewChrome();
    var inp = document.getElementById('plPitcherSearch');
    if (inp) {
      inp.addEventListener('input', function() {
        // RULE: Every state change must trigger a render
        CACHE.searchQ = inp.value;
        renderDropdown(searchMatches(inp.value));
        renderRankings();
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
    var rows = (CACHE.profiles || []).filter(function(row) {
      if (!q) return true;
      var n = pickCol(row, ['pitcher_name', 'Name']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    });
    if (CACHE.todayFilter === 'today') {
      var tonight = todayStarterSet();
      if (tonight.size) {
        rows = rows.filter(function(row) {
          return tonight.has(normName(pickCol(row, ['pitcher_name', 'Name'])));
        });
      }
    }
    return rows;
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

    var tonight = todayStarterSet();
    if (tonight.size) {
      var starter = rows.filter(function(r) {
        return tonight.has(normName(pickCol(r, ['pitcher_name', 'Name'])));
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
    if (!mount || CACHE.viewMode === 'bullpen') {
      if (mount) mount.innerHTML = '';
      return;
    }
    var cards = pickStandoutCards(rows || filteredProfiles());
    if (!cards.length) {
      mount.innerHTML = '';
      return;
    }
    mount.innerHTML = '<div class="pl-standout-strip">' + cards.map(standoutCardHtml).join('') + '</div>';
    mount.querySelectorAll('[data-standout-pitcher]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectPitcher(btn.getAttribute('data-standout-pitcher'));
      });
    });
  }

  function renderIntelToolbar(rows) {
    var mount = document.getElementById('plIntelToolbar');
    if (!mount || CACHE.viewMode === 'bullpen') {
      if (mount) mount.innerHTML = '';
      return;
    }
    var tonight = todayStarterSet();
    var hasPlatoon = leagueHasSpPlatoon(rows || CACHE.profiles || []);
    var hand = CACHE.tableHand || 'overall';
    var segment = CACHE.tableSegment || 'full';
    var platoonNote = (hand !== 'overall' && !hasPlatoon)
      ? '<p class="pl-platoon-soon">SP platoon splits coming soon — needs SP scraper expansion. Table shows overall metrics until pipeline adds vs-RHB/vs-LHB columns.</p>'
      : '';
    var segmentNote = segment === 'f5' ? f5WarningBlock() : '';
    var todayHint = !tonight.size
      ? '<span class="pl-intel-hint">Today\'s starters unavailable</span>' : '';

    mount.innerHTML = '<div class="pl-intel-toolbar">'
      + '<div class="pl-intel-group">'
      + '<span class="ca-metric-label">View</span>'
      + '<div class="rl-pill-row">'
      + '<button type="button" class="ca-pill-btn' + (CACHE.todayFilter === 'all' ? ' active' : '') + '" data-pi-today="all">All SPs</button>'
      + '<button type="button" class="ca-pill-btn' + (CACHE.todayFilter === 'today' ? ' active' : '') + '"' + (tonight.size ? '' : ' disabled title="No matchup probables loaded"') + ' data-pi-today="today">Today\'s Starters</button>'
      + todayHint
      + '</div></div>'
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

    mount.querySelectorAll('[data-pi-today]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (btn.disabled) return;
        CACHE.todayFilter = btn.getAttribute('data-pi-today');
        renderRankings();
      });
    });
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
    if (key === 'f5Era') return stats.f5Era;
    return met[key];
  }

  function sortProfiles(rows) {
    var key = CACHE.sortKey, dir = CACHE.sortDir;
    return rows.slice().sort(function(a, b) {
      var ma = profileMetrics(a), mb = profileMetrics(b);
      var sa = extendedStats(a, ma), sb = extendedStats(b, mb);
      var av = sortValue(a, key, ma, sa), bv = sortValue(b, key, mb, sb);
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
    if (!mount || CACHE.viewMode === 'bullpen') {
      if (mount && CACHE.viewMode === 'bullpen') mount.innerHTML = '';
      var sm = document.getElementById('plStandoutMount');
      var tb = document.getElementById('plIntelToolbar');
      if (sm) sm.innerHTML = '';
      if (tb) tb.innerHTML = '';
      return;
    }
    var allRows = filteredProfiles();
    renderIntelToolbar(allRows);
    renderStandoutMount(allRows);
    var hand = CACHE.tableHand || 'overall';
    var segment = CACHE.tableSegment || 'full';
    var hasPlatoon = leagueHasSpPlatoon(CACHE.profiles || []);
    var rows = sortProfiles(allRows);
    if (!rows.length) {
      var emptyMsg = CACHE.todayFilter === 'today' && !todayStarterSet().size
        ? 'Today\'s starters unavailable — load matchups or switch to All SPs.'
        : CACHE.todayFilter === 'today'
          ? 'No ranked SPs match today\'s probables.'
          : 'No pitchers match — load SP_Profiles or clear search.';
      mount.innerHTML = '<p class="rl-empty">' + esc(emptyMsg) + '</p>';
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
      var tonight = isTonightStarter(n);
      var vals = COLS.map(function(c) {
        var v = tableMetric(row, hand, c.k, m, st);
        var inv = c.k === 'osiAllowed' || c.k === 'abqAllowed' || c.k === 'bbPct' || c.k === 'era' || c.k === 'fip';
        var ctx = c.k === 'pitchScore' ? 'pitching' : (c.k === 'oor' ? 'oor' : (c.k === 'era' || c.k === 'fip' ? 'pitching' : 'osi'));
        var d = c.k === 'pitchScore' || c.k === 'oor' ? 0 : (c.k === 'era' || c.k === 'fip' ? 2 : 1);
        if (hand !== 'overall' && !hasPlatoon) v = (c.k === 'era' || c.k === 'fip' || c.k === 'f5Era') ? st[c.k === 'f5Era' ? 'f5Era' : c.k] : m[c.k];
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
        + (tonight ? ' <span class="pl-tonight-badge">TONIGHT</span>' : '')
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

    mount.innerHTML = '<div class="pl-section-head"><h4 class="pl-section-title">Pitcher Rankings</h4>'
      + '<p class="pl-section-sub">Sort any column · click row for allowed-metrics depth</p></div>'
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
        else { CACHE.sortKey = k; CACHE.sortDir = (k === 'name' || k === 'team' || k === 'hand') ? 1 : -1; }
        renderRankings();
      });
    });
    mount.querySelectorAll('.pl-rank-row').forEach(function(tr) {
      tr.addEventListener('click', function(e) {
        var n = tr.getAttribute('data-pitcher');
        if (e.target.closest('.pl-rank-name-select')) {
          selectPitcher(n);
          return;
        }
        CACHE.expandedPitcher = CACHE.expandedPitcher === n ? '' : n;
        renderRankings();
      });
    });
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
      renderRankings();
      renderBullpenView();
      if (rows.length && !CACHE.selected) {
        CACHE.selected = pickCol(rows[0], ['pitcher_name', 'Name', 'Pitcher']);
        renderSnapshot();
      }
    }).catch(function(err) {
      root.innerHTML = '<p class="rl-empty">Error loading Pitcher Intelligence: ' + esc(String(err)) + '</p>';
    });
  }

  function renderPitcherSnapshot(pitcher) {
    if (typeof pitcher === 'string') selectPitcher(pitcher);
    else if (pitcher) {
      CACHE.selected = pickCol(pitcher, ['pitcher_name', 'Name', 'Pitcher']);
      loadSplits().then(renderSnapshot);
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
