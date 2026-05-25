// v20260525a
/**
 * Research Lab — Pitcher Intelligence tab
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
  var LEAGUE_OOR = 50;
  var CACHE = {
    profiles: null, splits: null, relievers: null, oorByTeam: null,
    sortKey: 'pitchScore', sortDir: -1, selected: '',
    searchQ: '', dropdownOpen: false,
    viewMode: 'pitcher', bpTeam: '', snapSplit: 'overall'
  };

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

  function profileMetrics(row) {
    return (row && S && S.spProfileMetrics) ? S.spProfileMetrics(row) : {};
  }

  function isStale(row) {
    return !!(profileMetrics(row).stale);
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
      console.log('[PITCHER INTEL] profiles available:', CACHE.profiles.length);
      return Promise.resolve(CACHE.profiles);
    }
    if (global.LIVE_DATA && LIVE_DATA.spProfiles && LIVE_DATA.spProfiles.length) {
      CACHE.profiles = LIVE_DATA.spProfiles;
      console.log('[PITCHER INTEL] profiles available:', CACHE.profiles.length);
      return Promise.resolve(CACHE.profiles);
    }
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      CACHE.profiles = rows || [];
      CACHE.oorByTeam = S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor
        ? S.buildOorByTeam(LIVE_DATA.oor) : {};
      if (S.enrichSpProfiles) S.enrichSpProfiles(CACHE.profiles, CACHE.oorByTeam);
      if (global.LIVE_DATA) LIVE_DATA.spProfiles = CACHE.profiles;
      console.log('[PITCHER INTEL] profiles available:', CACHE.profiles.length);
      return CACHE.profiles;
    }).catch(function() { CACHE.profiles = []; return []; });
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

  var SNAP_SPLIT_TYPES = {
    overall: ['overall'],
    rhh: ['vs_rhh', 'rhh'],
    lhh: ['vs_lhh', 'lhh'],
    home: ['home'],
    away: ['away']
  };

  function findMetricSplitRow(name, splitView) {
    var key = normName(name);
    var types = SNAP_SPLIT_TYPES[splitView || 'overall'] || ['overall'];
    var rows = (global.LIVE_DATA && LIVE_DATA.spMetricSplits) || CACHE.splits || [];
    return rows.find(function(r) {
      if (normName(pickCol(r, ['pitcher_name', 'Name', 'Pitcher'])) !== key) return false;
      var st = String(pickCol(r, ['split_type', 'splitType', 'split', 'Split'])).toLowerCase().replace(/\s+/g, '_');
      for (var i = 0; i < types.length; i++) {
        if (st === types[i] || st.indexOf(types[i]) >= 0) return true;
      }
      return false;
    }) || null;
  }

  function loadRelievers() {
    if (CACHE.relievers) return Promise.resolve(CACHE.relievers);
    if (!S || !TABS || !TABS.bullpen_individual) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.bullpen_individual).then(function(rows) {
      CACHE.relievers = rows || [];
      return CACHE.relievers;
    }).catch(function() { CACHE.relievers = []; return []; });
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
    var key = normName(name);
    return (CACHE.splits || []).find(function(s) {
      if (normName(pickCol(s, ['pitcher_name', 'Name'])) !== key) return false;
      var dim = String(pickCol(s, ['split_dimension', 'splitDimension'])).toLowerCase();
      if (dim !== 'abq_tier') return false;
      return String(pickCol(s, ['split_value', 'splitValue'])).toLowerCase() === tier.toLowerCase();
    }) || null;
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
      var av = A ? A.pitcherAvatar(pid || n, { crop: 'compare', className: 'pl-dd-av' }) : '';
      var logo = A ? A.teamLogoImg(t, 18) : '';
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
    var tiers = ['High', 'Mid', 'Low'];
    var rows = tiers.map(function(tier) {
      var split = findAbqSplit(name, tier);
      if (!split) {
        return '<tr><td>' + esc(tier) + ' ABQ</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>';
      }
      return '<tr><td>' + esc(tier) + ' ABQ</td>'
        + '<td class="num">' + fmt(numOrNull(pickCol(split, ['starts'])), 0) + '</td>'
        + '<td class="num">' + fmt(numOrNull(pickCol(split, ['ERA'])), 2) + '</td>'
        + '<td class="num">' + fmtPct(numOrNull(pickCol(split, ['K_pct', 'K%']))) + '</td>'
        + '<td class="num" style="color:' + mColor(numOrNull(pickCol(split, ['OSI_allowed'])), true) + '">'
        + fmt(numOrNull(pickCol(split, ['OSI_allowed']))) + '</td></tr>';
    }).join('');
    return '<div class="pl-opp-panel">'
      + '<h4 class="pl-section-title">Opponent Profile</h4>'
      + '<p class="pl-section-sub">Performance vs High / Mid / Low ABQ lineups</p>'
      + '<table class="rl-table-premium pl-opp-table"><thead><tr>'
      + '<th>Tier</th><th>Starts</th><th>ERA</th><th>K%</th><th>OSI Allowed</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
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
    var splitRow = snapSplit !== 'overall' ? findMetricSplitRow(name, snapSplit) : null;
    var stats = extendedStats(row, met);
    if (splitRow) {
      stats.era = numOrNull(pickCol(splitRow, ['ERA', 'era'])) != null ? numOrNull(pickCol(splitRow, ['ERA', 'era'])) : stats.era;
      stats.kPct = numOrNull(pickCol(splitRow, ['K_pct', 'K%'])) != null ? numOrNull(pickCol(splitRow, ['K_pct', 'K%'])) : stats.kPct;
      stats.bbPct = numOrNull(pickCol(splitRow, ['BB_pct', 'BB%'])) != null ? numOrNull(pickCol(splitRow, ['BB_pct', 'BB%'])) : stats.bbPct;
    }
    var role = pitcherRole(row);
    var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
    var avatar = A ? A.pitcherAvatar(pid || name, { crop: 'profile', className: 'pl-snap-avatar pl-snap-avatar--intel', size: 80, eager: true }) : '';
    var logo = A ? A.teamLogoImg(team, 28) : '';
    var splitPills = '<div class="rl-pill-row" style="margin:12px 0 8px">'
      + ['overall', 'rhh', 'lhh', 'home', 'away'].map(function(s) {
        var lbl = { overall: 'Overall', rhh: 'vs RHH', lhh: 'vs LHH', home: 'Home', away: 'Away' }[s];
        return '<button type="button" class="ca-pill-btn' + (snapSplit === s ? ' active' : '') + '" data-pl-snap-split="' + s + '">' + lbl + '</button>';
      }).join('') + '</div>';
    var allowedNote = snapSplit !== 'overall'
      ? '<p class="pl-section-sub" style="margin:0 0 8px">Allowed metrics are overall only; rates below from SP_Metric_Splits (' + esc(snapSplit) + ').</p>'
      : '';
    function allowedCard(label, val, ctx) {
      if (snapSplit !== 'overall') {
        return '<div class="pl-created-metric" title="Split-specific allowed metrics require pipeline enhancement">'
          + '<div class="ca-metric-label">' + esc(label) + '</div>'
          + '<div class="pl-created-val" style="color:#71717A">—</div></div>';
      }
      return createdMetricCard(label, val, true, ctx);
    }

    mount.innerHTML = '<div class="pl-snapshot-card pl-intel-snapshot">'
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
      + statAnchorCell('ERA', stats.era, 2)
      + statAnchorCell('WHIP', stats.whip, 2)
      + statAnchorCell('K/9', stats.k9, 1)
      + statAnchorCell('BB/9', stats.bb9, 1)
      + statAnchorCell('HR/9', stats.hr9, 2)
      + statAnchorCell('FIP', stats.fip, 2)
      + statAnchorCell('xFIP', stats.xfip, 2)
      + statAnchorCell('wOBA', stats.woba, 3)
      + '</div>'
      + splitPills
      + allowedNote
      + '<div class="pl-created-row">'
      + createdMetricCard('Pitching Score', met.pitchScore, false, 'pitching')
      + allowedCard('OSI Allowed', met.osiAllowed, 'osi')
      + allowedCard('ABQ Allowed', met.abqAllowed, 'osi')
      + allowedCard('RCV Allowed', met.rcvAllowed, 'osi')
      + allowedCard('OBR Allowed', met.obrAllowed, 'osi')
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

  function bullpenUsageForTeam(team) {
    var tk = teamKey(team);
    var unit = bullpenUnit(team);
    var usage = [];
    if (unit && unit.relievers && unit.relievers.length) {
      usage = unit.relievers.map(function(r) {
        return {
          name: r.name || r.pitcher_name || pickCol(r, ['pitcher_name', 'Name']),
          days: numOrNull(r.days_last_5) != null ? numOrNull(r.days_last_5) : (numOrNull(r.appearances_last_5) || 0)
        };
      });
    }
    if (!usage.length) {
      var counts = {};
      (CACHE.relievers || []).forEach(function(r) {
        if (teamKey(pickCol(r, ['pitcher_team', 'team', 'Team', 'Tm'])) !== tk) return;
        var n = pickCol(r, ['pitcher_name', 'Name']);
        if (!n) return;
        counts[n] = (counts[n] || 0) + 1;
      });
      usage = Object.keys(counts).map(function(n) { return { name: n, days: counts[n] }; });
    }
    return usage.sort(function(a, b) { return b.days - a.days; }).slice(0, 8);
  }

  function bullpenUsageChartSvg(usage) {
    if (!usage.length) return '<p class="rl-empty">No reliever usage data for this team.</p>';
    var w = 520, h = 140, pad = 8, barW = Math.max(28, Math.floor((w - pad * 2) / usage.length) - 6);
    var maxD = Math.max.apply(null, usage.map(function(u) { return u.days; }).concat([1]));
    var bars = usage.map(function(u, i) {
      var bh = Math.round((u.days / maxD) * 90) || 4;
      var x = pad + i * (barW + 6);
      var col = u.days <= 1 ? '#4ADE80' : u.days === 2 ? '#FBBF24' : '#F87171';
      var label = String(u.name || '').split(' ').pop() || u.name;
      return '<rect x="' + x + '" y="' + (h - 28 - bh) + '" width="' + barW + '" height="' + bh + '" fill="' + col + '" rx="3"/>'
        + '<text x="' + (x + barW / 2) + '" y="' + (h - 10) + '" fill="#9CA3AF" font-size="9" text-anchor="middle">' + esc(label) + '</text>'
        + '<text x="' + (x + barW / 2) + '" y="' + (h - 32 - bh) + '" fill="#E4E4E7" font-size="10" text-anchor="middle">' + u.days + '</text>';
    }).join('');
    return '<div class="pl-bp-usage"><h4 class="pl-section-title">Last 5 Days Usage</h4>'
      + '<svg class="pl-bp-usage-svg" viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">' + bars + '</svg>'
      + '<p class="rl-note" style="font-size:11px;margin-top:6px">Green = 0\u20131 days \u00B7 Amber = 2 \u00B7 Red = 3+</p></div>';
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
      + bullpenUsageChartSvg(bullpenUsageForTeam(team))
      + '<p class="rl-profile-link"><a href="bullpen_report.html?team=' + encodeURIComponent(team || '') + '">Full bullpen report \u2192</a></p>'
      + '</div>';

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
      + '<div id="plRankingsMount"></div>';

    renderViewToggle();

    syncViewChrome();
    var inp = document.getElementById('plPitcherSearch');
    if (inp) {
      inp.addEventListener('input', function() {
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
    return (CACHE.profiles || []).filter(function(row) {
      if (!q) return true;
      var n = pickCol(row, ['pitcher_name', 'Name']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    });
  }

  function sortValue(row, key, met, stats) {
    if (key === 'name') return pickCol(row, ['pitcher_name', 'Name']);
    if (key === 'team') return pickCol(row, ['pitcher_team', 'Team']);
    if (key === 'hand') return pickCol(row, ['hand', 'Hand', 'pitcher_hand']);
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
      return;
    }
    var rows = sortProfiles(filteredProfiles());
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">No pitchers match — load SP_Profiles or clear search.</p>';
      return;
    }
    function th(k, label) {
      return '<th class="pl-sort-th' + (CACHE.sortKey === k ? ' sorted' : '') + '" data-plsort="' + k + '">' + esc(label) + '</th>';
    }
    mount.innerHTML = '<div class="pl-section-head"><h4 class="pl-section-title">Pitcher Rankings</h4></div>'
      + '<div class="rl-table-wrap pl-rank-wrap rl-sticky-table"><table class="rl-table-premium pl-rank-table"><thead><tr>'
      + '<th>#</th><th></th>' + th('name', 'Pitcher') + th('team', 'Team') + th('hand', 'Hand')
      + th('era', 'ERA') + th('kPct', 'K%') + th('bbPct', 'BB%') + th('xfip', 'xFIP') + th('woba', 'wOBA')
      + th('pitchScore', 'Pitching Score') + th('osiAllowed', 'OSI Allowed') + th('abqAllowed', 'ABQ Allowed')
      + th('oor', 'OOR') + th('f5Era', 'F5 ERA')
      + '</tr></thead><tbody>'
      + rows.map(function(row, i) {
        var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
        var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
        var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || '?').charAt(0);
        var m = profileMetrics(row);
        var st = extendedStats(row, m);
        var sel = CACHE.selected === n ? ' pl-rank-row--selected' : '';
        var pid = pickCol(row, ['pitcher_id', 'playerId', 'mlb_id']);
        return '<tr class="pl-rank-row' + sel + '" data-pitcher="' + esc(n) + '">'
          + '<td>' + (i + 1) + '</td>'
          + '<td>' + (A ? A.pitcherAvatar(pid || n, { crop: 'compare', className: 'pl-rank-av' }) : '') + '</td>'
          + '<td>' + esc(n) + '</td>'
          + '<td>' + (A ? A.teamLogoImg(t, 20) : '') + ' ' + esc(t) + '</td>'
          + '<td>' + esc(hand) + '</td>'
          + '<td class="num">' + fmt(st.era, 2) + '</td>'
          + '<td class="num">' + fmt(m.kPct, 1) + '</td>'
          + '<td class="num">' + fmt(m.bbPct, 1) + '</td>'
          + '<td class="num">' + fmt(st.xfip, 2) + '</td>'
          + '<td class="num">' + fmt(st.woba, 3) + '</td>'
          + '<td class="num" style="color:' + mColor(m.pitchScore, false, 'pitching') + '">' + fmt(m.pitchScore, 0) + '</td>'
          + '<td class="num" style="color:' + mColor(m.osiAllowed, true) + '">' + fmt(m.osiAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.abqAllowed, true) + '">' + fmt(m.abqAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.oor, false, 'oor') + '">' + fmt(m.oor, 0) + '</td>'
          + '<td class="num">' + fmt(st.f5Era, 2) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    mount.querySelectorAll('[data-plsort]').forEach(function(thEl) {
      thEl.addEventListener('click', function() {
        var k = thEl.getAttribute('data-plsort');
        if (CACHE.sortKey === k) CACHE.sortDir *= -1;
        else { CACHE.sortKey = k; CACHE.sortDir = -1; }
        renderRankings();
      });
    });
    mount.querySelectorAll('.pl-rank-row').forEach(function(tr) {
      tr.addEventListener('click', function() {
        selectPitcher(tr.getAttribute('data-pitcher'));
      });
    });
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || 'rlPitcherLabRoot');
    if (!root) return;
    root.innerHTML = '<p class="rl-loading">Loading Pitcher Intelligence…</p>';
    Promise.all([loadProfiles(), loadSplits()]).then(function(results) {
      var rows = results[0];
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

  global.PitcherLab = { mount: mount, loadProfiles: loadProfiles, renderPitcherSnapshot: renderPitcherSnapshot, selectPitcher: selectPitcher };
})(typeof window !== 'undefined' ? window : this);
