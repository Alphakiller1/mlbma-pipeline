/**
 * Team Profile — pitching, lineup, and roster sections.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function tpIcon(key) {
    var I = global.MLBMAIcons;
    return (I && I.profileIcon) ? I.profileIcon(key) : key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sectionCard(ctx, title, subtitle, body, extraClass, meta) {
    meta = meta || {};
    if (ctx.sectionCard) return ctx.sectionCard(title, subtitle, body, extraClass, meta);
    var hdrOpts = {
      title: title,
      subtitle: subtitle || '',
      icon: tpIcon(meta.icon),
      kicker: meta.kicker || 'Staff',
      actions: meta.actions || ''
    };
    return '<section class="ca-board tp-section' + (extraClass ? ' ' + extraClass : '') + '">'
      + (A && A.sectionHeaderHtml
        ? A.sectionHeaderHtml(hdrOpts)
        : '<header class="ca-section-header"><h2 class="ca-section-title">' + esc(title) + '</h2>'
          + (subtitle ? '<p class="ca-helper">' + esc(subtitle) + '</p>' : '') + '</header>')
      + body + '</section>';
  }

  function valChip(ctx, v, chipCtx, invert, dec) {
    if (ctx.valChip) return ctx.valChip(v, chipCtx, invert, dec);
    return '<span class="chip c-na">—</span>';
  }

  function metricSlot(ctx, label, v, chipCtx, invert, dec) {
    return '<span class="tp-metric-slot"><span class="tp-metric-k">' + esc(label) + '</span>'
      + valChip(ctx, v, chipCtx, invert, dec) + '</span>';
  }

  function chipRow(ctx, items) {
    return '<div class="tp-chip-row">' + items.join('') + '</div>';
  }

  function rankTone(rank) {
    if (rank == null || isNaN(rank)) return 'neutral';
    if (rank <= 5) return 'elite';
    if (rank <= 12) return 'strong';
    if (rank <= 20) return 'mid';
    return 'weak';
  }

  function staffLeagueRank(cache, team, field, invert) {
    var entries = Object.keys(cache || {}).map(function(t) {
      return { t: t, v: cache[t][field] };
    }).filter(function(e) { return e.v != null && !isNaN(e.v); });
    entries.sort(function(a, b) {
      if (a.v === b.v) return a.t.localeCompare(b.t);
      return invert ? a.v - b.v : b.v - a.v;
    });
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].t === team) return { rank: i + 1, total: entries.length };
    }
    return { rank: null, total: entries.length || null };
  }

  function buildTeamStaffCache(data, options) {
    options = options || {};
    var split = options.split || 'overall';
    var scope = options.scope || 'staff';
    var pickCol = options.pickCol;
    var num = options.num;
    var teamKey = options.teamKey;
    var poolPS = options.poolPitchScore;
    var prefix = resolveBullpenPrefix(split);
    var cache = {};
    (data.profiles || []).forEach(function(prof) {
      var t = teamKey(pickCol(prof, ['team', 'Team', 'tm']));
      if (!t) return;
      var teamSps = (data.sps || []).filter(function(s) {
        return teamKey(pickCol(s, ['pitcher_team', 'pitcher team'])) === t;
      });
      var unit = bullpenUnitForTeam(t, data, teamKey);
      var entry = {};
      if (scope === 'staff' || scope === 'rotation') {
        entry.avgPs = split === 'overall'
          ? num(pickCol(prof, ['avg_pitching_score']))
          : avgTeamSpMetric(teamSps, data, split, 'pitchScore', pickCol, num, teamKey, poolPS);
        if (entry.avgPs == null) {
          entry.avgPs = avgTeamSpMetric(teamSps, data, 'overall', 'pitchScore', pickCol, num, teamKey, poolPS);
        }
        entry.kPct = split === 'overall'
          ? num(pickCol(prof, ['team_k_pct']))
          : avgTeamSpMetric(teamSps, data, split, 'kPct', pickCol, num, teamKey, poolPS);
        entry.bbPct = split === 'overall'
          ? num(pickCol(prof, ['team_bb_pct']))
          : avgTeamSpMetric(teamSps, data, split, 'bbPct', pickCol, num, teamKey, poolPS);
        entry.osiAllow = avgTeamSpMetric(teamSps, data, split, 'osiAllowed', pickCol, num, teamKey, poolPS);
        entry.ipStart = num(pickCol(prof, ['avg_ip_per_start']));
        entry.teamEra = num(pickCol(prof, ['team_era']));
      }
      if (scope === 'staff' || scope === 'bullpen') {
        entry.bpEra = unit ? colVal(unit, prefix, 'ERA', pickCol, num) : null;
        if (entry.bpEra == null) entry.bpEra = num(pickCol(prof, ['bullpen_era']));
        entry.bpOsi = unit ? colVal(unit, prefix, 'OSI_allowed', pickCol, num) : null;
        if (entry.bpOsi == null) entry.bpOsi = num(pickCol(prof, ['bullpen_osi_allowed']));
        entry.bpK = unit ? colVal(unit, prefix, 'K_pct', pickCol, num) : null;
        entry.bpBb = unit ? colVal(unit, prefix, 'BB_pct', pickCol, num) : null;
        entry.bpScore = entry.bpOsi != null ? Math.max(0, Math.min(100, 100 - entry.bpOsi)) : null;
      }
      cache[t] = entry;
    });
    return cache;
  }

  function staffStatCell(label, chipHtml, rankMeta) {
    rankMeta = rankMeta || {};
    var rank = rankMeta.rank;
    var total = rankMeta.total;
    var rankHtml = rank != null
      ? '<span class="tp-offense-stat__rank tp-offense-stat__rank--' + rankTone(rank) + '" title="' + esc(total ? ('League rank #' + rank + ' of ' + total) : ('League rank #' + rank)) + '">'
        + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span>'
        + '</span>'
      : '';
    return '<div class="tp-offense-stat tp-offense-stat--inline" aria-label="' + esc(label) + '">'
      + '<span class="tp-offense-stat__label">' + esc(label) + '</span>'
      + '<span class="tp-offense-stat__body">' + chipHtml + rankHtml + '</span></div>';
  }

  function staffMetricsBand(title, hint, cellsHtml) {
    if (!cellsHtml) return '';
    return '<div class="tp-offense-metrics tp-offense-metrics--profile tp-offense-metrics--staff">'
      + '<div class="tp-offense-metrics__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(hint) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__row tp-offense-metrics__row--inline">' + cellsHtml + '</div>'
      + '</div></div>';
  }

  // Launchpad button into a dedicated profile page (Pitcher / Bullpen Profile).
  function staffLaunchBtn(href, label) {
    return '<a class="tp-profile-launch" href="' + href + '">' + esc(label)
      + ' <span class="tp-profile-launch__arrow" aria-hidden="true">&rarr;</span></a>';
  }

  function colVal(row, prefix, metric, pickCol, numFn) {
    if (!row || !pickCol) return null;
    var num = numFn || function(v) {
      if (v == null || v === '' || isNaN(v)) return null;
      return Number(v);
    };
    return num(pickCol(row, [prefix + '_' + metric, prefix + ' ' + metric]));
  }

  function resolveBullpenPrefix(split) {
    var map = {
      overall: 'overall', lhh: 'vs_lhh', rhh: 'vs_rhh',
      home: 'home', away: 'away',
      hilev: 'high_leverage', lolev: 'low_leverage',
      hlev: 'high_leverage', llev: 'low_leverage'
    };
    return map[split] || 'overall';
  }

  function ctxPickCol(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
    }
    return '';
  }

  function normPitcherName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function spMetricSplitsFor(sp, data, teamKey) {
    var pid = ctxPickCol(sp, ['pitcher_id']);
    var pname = ctxPickCol(sp, ['pitcher_name']);
    var tm = teamKey(ctxPickCol(sp, ['pitcher_team', 'pitcher team']));
    var target = normPitcherName(pname);
    return (data.spMetricSplits || []).filter(function(s) {
      if (pid && String(ctxPickCol(s, ['pitcher_id'])) === String(pid)) return true;
      return teamKey(ctxPickCol(s, ['pitcher_team'])) === tm
        && normPitcherName(ctxPickCol(s, ['pitcher_name'])) === target;
    });
  }

  function findSpSplit(splits, dimension, value) {
    value = String(value);
    var aliases = {
      LHH: ['LHH', 'L', 'vs LHH', 'vs L', 'Left', 'left'],
      RHH: ['RHH', 'R', 'vs RHH', 'vs R', 'Right', 'right'],
      home: ['home', 'Home'],
      away: ['away', 'Away'],
      High: ['High', 'high'],
      Low: ['Low', 'low'],
      Mid: ['Mid', 'mid']
    };
    var dims = [dimension];
    if (dimension === 'batter_hand') dims = ['batter_hand', 'vs_hand'];
    if (dimension === 'location') dims = ['location', 'home_away'];
    var vals = aliases[value] || [value];
    for (var d = 0; d < dims.length; d++) {
      for (var i = 0; i < splits.length; i++) {
        var s = splits[i];
        var dim = ctxPickCol(s, ['split_dimension', 'splitDimension']);
        if (dim !== dims[d]) continue;
        var sv = ctxPickCol(s, ['split_value', 'splitValue']);
        for (var j = 0; j < vals.length; j++) {
          if (String(sv).toLowerCase() === String(vals[j]).toLowerCase()) return s;
        }
      }
    }
    return null;
  }

  function resolveSpSplitMetrics(sp, splits, split, pickCol, num, poolPitchScore) {
    var kPct = num(pickCol(sp, ['K_pct']));
    var bbPct = num(pickCol(sp, ['BB_pct']));
    var hr9 = num(pickCol(sp, ['HR9', 'HR/9']));
    var osiAllowed = num(pickCol(sp, ['OSI_allowed']));
    var pitchScore = num(pickCol(sp, ['PitchScore']));
    if (pitchScore == null && poolPitchScore) pitchScore = poolPitchScore(sp);
    var base = { kPct: kPct, bbPct: bbPct, hr9: hr9, osiAllowed: osiAllowed, pitchScore: pitchScore };
    if (!split || split === 'overall' || !splits.length) return base;
    var s = null;
    if (split === 'lhh') {
      s = findSpSplit(splits, 'batter_hand', 'LHH') || findSpSplit(splits, 'batter_hand', 'L');
    } else if (split === 'rhh') {
      s = findSpSplit(splits, 'batter_hand', 'RHH') || findSpSplit(splits, 'batter_hand', 'R');
    } else if (split === 'home') {
      s = findSpSplit(splits, 'location', 'home');
    } else if (split === 'away') {
      s = findSpSplit(splits, 'location', 'away');
    } else if (split === 'f5') {
      s = findSpSplit(splits, 'osi_tier', 'High') || findSpSplit(splits, 'osi_tier', 'Low');
    }
    if (!s) return base;
    return {
      kPct: num(pickCol(s, ['K_pct'])) != null ? num(pickCol(s, ['K_pct'])) : base.kPct,
      bbPct: num(pickCol(s, ['BB_pct'])) != null ? num(pickCol(s, ['BB_pct'])) : base.bbPct,
      osiAllowed: num(pickCol(s, ['OSI_allowed'])) != null ? num(pickCol(s, ['OSI_allowed'])) : base.osiAllowed,
      hr9: base.hr9,
      pitchScore: base.pitchScore
    };
  }

  function avgTeamSpMetric(teamSps, data, split, field, pickCol, num, teamKey, poolPitchScore) {
    var vals = [];
    teamSps.forEach(function(sp) {
      var splits = spMetricSplitsFor(sp, data, teamKey);
      var m = resolveSpSplitMetrics(sp, splits, split, pickCol, num, poolPitchScore);
      if (m[field] != null && !isNaN(m[field])) vals.push(m[field]);
    });
    if (!vals.length) return null;
    return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
  }

  function bullpenUnitForTeam(team, data, teamKey) {
    return (data.bullpenUnit || []).find(function(u) {
      return teamKey(ctxPickCol(u, ['team', 'Team', 'tm'])) === teamKey(team);
    }) || null;
  }

  function staffSplitSubtitle(split, category) {
    var PC = global.MLBMAProfileControls;
    var label = PC && PC.splitLabel ? PC.splitLabel(split) : split;
    if (category === 'rotation') return label + ' · matches SP profile splits';
    if (category === 'bullpen') return label + ' · matches Bullpen Profile splits';
    return label;
  }

  function renderPitchingSummary(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var tk = teamKey(team);
    var staffCache = buildTeamStaffCache(DATA, {
      split: 'overall',
      scope: 'staff',
      pickCol: pickCol,
      num: num,
      teamKey: teamKey,
      poolPitchScore: ctx.poolPitchScore
    });
    var pitchRow = ctx.pitchTeamRow ? ctx.pitchTeamRow(team) : null;
    var avgPs = num(pickCol(prof, ['avg_pitching_score']));
    if (avgPs == null && pitchRow) avgPs = num(pickCol(pitchRow, ['PitchScore']));
    var bpEra = num(pickCol(prof, ['bullpen_era']));
    var bpOsi = num(pickCol(prof, ['bullpen_osi_allowed']));
    var teamEra = num(pickCol(prof, ['team_era']));
    var cells = [
      staffStatCell('Pitch Score', valChip(ctx, avgPs, 'pitching', false, 0), staffLeagueRank(staffCache, tk, 'avgPs', false)),
      staffStatCell('Team ERA', valChip(ctx, teamEra, 'pitching', true, 2), staffLeagueRank(staffCache, tk, 'teamEra', true)),
      staffStatCell('Bullpen ERA', valChip(ctx, bpEra, 'pitching', true, 2), staffLeagueRank(staffCache, tk, 'bpEra', true)),
      staffStatCell('Bullpen OSI Allowed', valChip(ctx, bpOsi, 'osi', true, 1), staffLeagueRank(staffCache, tk, 'bpOsi', true))
    ].join('');
    var body = staffMetricsBand('Staff snapshot', 'Team-level pitching context · league rank on each metric', cells);
    body += '<p class="ca-helper tp-staff-meta">'
      + '<a href="bullpen_report.html">Full Bullpen Profile</a>'
      + ' · Rotation and reliever tables below</p>';
    return sectionCard(ctx, 'Staff Snapshot', 'Team-level pitching context from profiles + Pitch Score', body, null,
      { icon: 'staff-snapshot', kicker: 'Pitching' });
  }

  function renderRotation(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var poolPS = ctx.poolPitchScore;
    var teamSps = (DATA.sps || []).filter(function(s) {
      return teamKey(pickCol(s, ['pitcher_team', 'pitcher team'])) === teamKey(team);
    }).sort(function(a, b) {
      var psA = poolPS ? poolPS(a) : num(pickCol(a, ['PitchScore']));
      var psB = poolPS ? poolPS(b) : num(pickCol(b, ['PitchScore']));
      return (psB || 0) - (psA || 0);
    });
    // Team rotation-as-a-unit KPIs (overall) with league ranks — unique team-level
    // value not shown on the per-pitcher Pitcher Profile.
    var avgPs = num(pickCol(prof, ['avg_pitching_score']))
      || avgTeamSpMetric(teamSps, DATA, 'overall', 'pitchScore', pickCol, num, teamKey, poolPS);
    var kPct = num(pickCol(prof, ['team_k_pct']));
    var bbPct = num(pickCol(prof, ['team_bb_pct']));
    var era = num(pickCol(prof, ['team_era']));
    var ipStart = num(pickCol(prof, ['avg_ip_per_start']));
    var tk = teamKey(team);
    var rotCache = buildTeamStaffCache(DATA, {
      split: 'overall', scope: 'rotation', pickCol: pickCol, num: num, teamKey: teamKey, poolPitchScore: poolPS
    });
    var rotCells = [
      staffStatCell('Pitching Score', valChip(ctx, avgPs, 'pitching', false, 0), staffLeagueRank(rotCache, tk, 'avgPs', false)),
      staffStatCell('Avg IP/Start', valChip(ctx, ipStart, 'osi', false, 2), staffLeagueRank(rotCache, tk, 'ipStart', false)),
      staffStatCell('K%', valChip(ctx, kPct, 'pitching', false, 1), staffLeagueRank(rotCache, tk, 'kPct', false)),
      staffStatCell('BB%', valChip(ctx, bbPct, 'pitching', true, 1), staffLeagueRank(rotCache, tk, 'bbPct', true)),
      staffStatCell('Team ERA', valChip(ctx, era, 'pitching', true, 2), staffLeagueRank(rotCache, tk, 'teamEra', true))
    ].join('');
    var rotKpi = staffMetricsBand('Rotation snapshot', 'Team rotation as a unit · league rank on each KPI', rotCells);
    rotKpi += '<p class="ca-helper tp-staff-launch-hint">Open a starter for full splits, tiers &amp; F5 &rarr;</p>';
    // Compact launchpad: each SP links to its full Pitcher Profile (deep splits live there).
    rotKpi += ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Hand</th><th>Tier</th></tr></thead><tbody>';
    if (!teamSps.length) {
      rotKpi += '<tr><td colspan="3" class="tp-empty">No SP profiles for this team</td></tr>';
    } else {
      var S = global.MLBMASharedMatchup;
      teamSps.forEach(function(sp, idx) {
        var pname = pickCol(sp, ['pitcher_name']);
        var hand = pickCol(sp, ['pitcher_hand']) || '—';
        var ps = poolPS ? poolPS(sp) : num(pickCol(sp, ['PitchScore']));
        var tier = (S && S.pitcherStaffTier)
          ? S.pitcherStaffTier({
              pitchScore: ps,
              kPct: num(pickCol(sp, ['K_pct', 'K%'])),
              bbPct: num(pickCol(sp, ['BB_pct', 'BB%'])),
              osiAllowed: num(pickCol(sp, ['OSI_allowed'])),
              hr9: num(pickCol(sp, ['HR9', 'HR/9']))
            })
          : ctx.tierLabel(ps, ctx.PITCH_TIERS);
        var nameCell = ctx.spPlayerCellHtml
          ? ctx.spPlayerCellHtml(sp, idx < 3)
          : '<a href="pitcher_profile.html?pitcher=' + ctx.encodePlayer(pname) + '">' + esc(pname) + '</a>';
        rotKpi += '<tr><td>' + nameCell + '</td>'
          + '<td>' + esc(hand) + '</td>'
          + '<td><span class="tier-badge ' + esc(tier.cls) + '"'
          + (tier.hint ? ' title="' + esc(tier.hint) + '"' : '') + '>' + esc(tier.label) + '</span></td></tr>';
      });
    }
    rotKpi += '</tbody>' + ctx.profileTableClose();
    return sectionCard(ctx, 'Starting Rotation', 'Team rotation unit — open any starter for the full Pitcher Profile', rotKpi, 'tp-rotation-section',
      { icon: 'rotation-section', kicker: 'SP unit' });
  }

  function renderBullpen(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var unit = bullpenUnitForTeam(team, DATA, teamKey);
    var kpiDefs = [
      ['ERA', 'ERA', true, 2],
      ['OSI Allowed', 'OSI_allowed', true, 1],
      ['K%', 'K_pct', false, 1],
      ['BB%', 'BB_pct', true, 1]
    ];
    var tk = teamKey(team);
    var bpCache = buildTeamStaffCache(DATA, {
      split: 'overall', scope: 'bullpen', pickCol: pickCol, num: num, teamKey: teamKey, poolPitchScore: ctx.poolPitchScore
    });
    var bpRankField = { ERA: 'bpEra', 'OSI Allowed': 'bpOsi', 'K%': 'bpK', 'BB%': 'bpBb' };
    // Team bullpen-as-a-unit KPIs (overall) with league ranks. Deep usage, tiers,
    // splits & reliever rank live in the dedicated Bullpen Profile (launch below).
    var bpCells = kpiDefs.map(function(pair) {
      var v = unit ? colVal(unit, 'overall', pair[1], pickCol, num) : null;
      if (v == null) {
        if (pair[1] === 'ERA') v = num(pickCol(prof, ['bullpen_era']));
        else if (pair[1] === 'OSI_allowed') v = num(pickCol(prof, ['bullpen_osi_allowed']));
      }
      var rankMeta = staffLeagueRank(bpCache, tk, bpRankField[pair[0]], pair[2]);
      return staffStatCell(pair[0], valChip(ctx, v, pair[0].indexOf('OSI') >= 0 ? 'osi' : 'pitching', pair[2], pair[3]), rankMeta);
    }).join('');
    var bpKpi = staffMetricsBand('Bullpen snapshot', 'Team bullpen as a unit · league rank on each KPI', bpCells);
    var closer = pickCol(prof, ['closer_name']);
    var setup = pickCol(prof, ['primary_setup']);
    if (closer) {
      bpKpi += '<p class="ca-helper tp-staff-meta">Closer: <strong>' + esc(closer) + '</strong>'
        + (setup ? ' · Setup: ' + esc(setup.split(';').join(', ')) : '') + '</p>';
    }
    bpKpi += staffLaunchBtn('bullpen_report.html?team=' + encodeURIComponent(tk), 'Open full Bullpen Profile');
    var intel = (global.TeamProfileIntel && TeamProfileIntel.renderBullpenIntel)
      ? TeamProfileIntel.renderBullpenIntel(prof, team, ctx) : '';
    return sectionCard(ctx, 'Bullpen Overview', 'Team bullpen unit — open the full Bullpen Profile for usage, tiers & splits', bpKpi, 'tp-bullpen-section',
      { icon: 'bullpen-section', kicker: 'Bullpen unit' }) + intel;
  }

  function renderRoster(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var split = ctx.split || 'both';
    var spHand = ctx.lineupSpHand ? ctx.lineupSpHand(team) : null;
    var batterMetrics = ctx.batterMetricsForLineup;
    var rosterBody = ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Pos</th><th>Bats</th><th>ABQ</th><th>RCV</th><th>OBR</th><th>OSI</th><th>Trend</th><th></th></tr></thead><tbody>';
    var batters = (DATA.batters || []).filter(function(b) {
      return teamKey(pickCol(b, ['team'])) === teamKey(team) && num(pickCol(b, ['PA'])) >= 50;
    });
    var byName = {};
    batters.forEach(function(b) {
      var n = pickCol(b, ['player_name']);
      if (!byName[n]) byName[n] = {};
      var st = pickCol(b, ['split_type']);
      byName[n][st] = b;
      if (st === 'vs_RHP' || !byName[n].main) byName[n].main = b;
    });
    var rosterList = Object.keys(byName).map(function(n) {
      var main = byName[n].main || byName[n]['vs_RHP'] || {};
      var reg = (DATA.registry || []).find(function(r) {
        return pickCol(r, ['full_name']) === n && teamKey(pickCol(r, ['team_abbr', 'team'])) === teamKey(team);
      });
      var m = batterMetrics
        ? batterMetrics(n, team, split, spHand)
        : {
          abq: num(pickCol(main, ['ABQ'])),
          rcv: num(pickCol(main, ['RCV'])),
          obr: num(pickCol(main, ['OBR'])),
          osi: num(pickCol(main, ['OSI']))
        };
      return {
        name: n,
        pos: reg ? pickCol(reg, ['position']) : '',
        bats: reg ? pickCol(reg, ['bats']) : '',
        abq: m.abq,
        rcv: m.rcv,
        obr: m.obr,
        osi: m.osi,
        trend: pickCol(main, ['trend'])
      };
    }).sort(function(a, b) { return (b.osi || 0) - (a.osi || 0); });

    if (!rosterList.length) {
      rosterBody += '<tr><td colspan="9" class="tp-empty">No qualified batters (run batter profile pipeline)</td></tr>';
    } else {
      rosterList.forEach(function(b) {
        rosterBody += '<tr><td><a href="batter_profile.html?player=' + ctx.encodePlayer(b.name) + '">' + esc(b.name) + '</a></td>';
        rosterBody += '<td>' + esc(b.pos || '—') + '</td><td>' + esc(b.bats || '—') + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.abq, 'abq', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.rcv, 'rcv', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.obr, 'obr', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.osi, 'osi', false, 1) + '</td>';
        rosterBody += '<td>' + (ctx.trendArrow ? ctx.trendArrow(b.trend) : '—') + '</td>';
        rosterBody += '<td><a class="ca-btn ca-btn--ghost ca-btn--sm" href="batter_profile.html?player=' + ctx.encodePlayer(b.name) + '">Profile</a></td></tr>';
      });
    }
    rosterBody += '</tbody>' + ctx.profileTableClose();
    return sectionCard(ctx, 'Qualified Batters (50+ PA)', 'Season-long batter metrics with platoon splits', rosterBody, null,
      { icon: 'roster', kicker: 'Roster' });
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    var cat = ctx.category || 'lineup';
    var html = '';
    if (cat === 'lineup') {
      /* Team Batters render inside TeamProfileSections.renderAll for lineup unit order */
    } else if (cat === 'rotation') {
      html += renderRotation(prof, team, ctx);
    } else if (cat === 'bullpen') {
      html += renderBullpen(prof, team, ctx);
      html += '<section class="ca-card tp-section tp-bp-usage-section">'
        + (A && A.sectionHeaderHtml
          ? A.sectionHeaderHtml({
            title: 'Bullpen Usage · L7',
            subtitle: 'Live MLB API pitch matrix',
            icon: 'usage',
            kicker: 'Usage'
          })
          : '<header class="ca-section-header"><h2 class="ca-section-title">Bullpen Usage · L7</h2>'
            + '<p class="ca-helper">Live MLB API pitch matrix</p></header>')
        + '<div id="tpBpUsageMount" class="tp-bp-usage-mount" data-team="' + esc(team) + '">'
        + '<div class="tp-empty">Loading bullpen usage…</div></div></section>';
    } else {
      if (ctx.renderBattingSection) html += ctx.renderBattingSection(team, ctx);
      else if (ctx.renderLineup) html += ctx.renderLineup(team, ctx);
      html += renderPitchingSummary(prof, team, ctx);
      html += renderRotation(prof, team, ctx);
      html += renderBullpen(prof, team, ctx);
    }
    return html;
  }

  global.TeamProfileStaff = {
    renderAll: renderAll,
    renderPitchingSummary: renderPitchingSummary,
    renderRotation: renderRotation,
    renderBullpen: renderBullpen,
    renderRoster: renderRoster,
    resolveBullpenPrefix: resolveBullpenPrefix,
    colVal: colVal,
    resolveSpSplitMetrics: resolveSpSplitMetrics,
    avgTeamSpMetric: avgTeamSpMetric,
    bullpenUnitForTeam: bullpenUnitForTeam,
    spMetricSplitsFor: spMetricSplitsFor,
    buildTeamStaffCache: buildTeamStaffCache,
    staffLeagueRank: staffLeagueRank
  };
})(typeof window !== 'undefined' ? window : this);
