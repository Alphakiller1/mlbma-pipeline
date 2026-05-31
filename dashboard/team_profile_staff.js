/**
 * Team Profile — pitching, lineup, and roster sections.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sectionCard(ctx, title, subtitle, body, extraClass, meta) {
    meta = meta || {};
    if (ctx.sectionCard) return ctx.sectionCard(title, subtitle, body, extraClass, meta);
    var hdrOpts = {
      title: title,
      subtitle: subtitle || '',
      icon: meta.icon,
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

  function computePitchScore(kPct, bbPct, hr9) {
    if (kPct == null || bbPct == null || hr9 == null) return null;
    return Math.min(100, Math.max(0, kPct * 0.4 + (100 - bbPct) * 0.35 + (100 - Math.min(hr9 * 12, 100)) * 0.25));
  }

  function resolveSpSplitMetrics(sp, splits, split, pickCol, num, poolPitchScore) {
    var kPct = num(pickCol(sp, ['K_pct']));
    var bbPct = num(pickCol(sp, ['BB_pct']));
    var hr9 = num(pickCol(sp, ['HR9', 'HR/9']));
    var osiAllowed = num(pickCol(sp, ['OSI_allowed']));
    var pitchScore = num(pickCol(sp, ['PitchScore']));
    if (pitchScore == null && poolPitchScore) pitchScore = poolPitchScore(sp);
    if (pitchScore == null) pitchScore = computePitchScore(kPct, bbPct, hr9);
    var base = { kPct: kPct, bbPct: bbPct, osiAllowed: osiAllowed, pitchScore: pitchScore };
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
    if (category === 'bullpen') return label + ' · matches bullpen report splits';
    return label;
  }

  function renderPitchingSummary(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var pitchRow = ctx.pitchTeamRow ? ctx.pitchTeamRow(team) : null;
    var avgPs = num(pickCol(prof, ['avg_pitching_score']));
    if (avgPs == null && pitchRow) avgPs = num(pickCol(pitchRow, ['PitchScore']));
    var bpEra = num(pickCol(prof, ['bullpen_era']));
    var bpOsi = num(pickCol(prof, ['bullpen_osi_allowed']));
    var teamEra = num(pickCol(prof, ['team_era']));
    var body = chipRow(ctx, [
      metricSlot(ctx, 'Pitch Score', avgPs, 'pitching', false, 0),
      metricSlot(ctx, 'Team ERA', teamEra, 'pitching', true, 2),
      metricSlot(ctx, 'Bullpen ERA', bpEra, 'pitching', true, 2),
      metricSlot(ctx, 'Bullpen OSI Allowed', bpOsi, 'osi', true, 1)
    ]);
    body += '<p class="ca-helper tp-staff-links">'
      + '<a href="bullpen_report.html">Full bullpen report</a>'
      + ' · Rotation and reliever tables below</p>';
    return sectionCard(ctx, 'Staff Snapshot', 'Team-level pitching context from profiles + Pitch Score', body, null,
      { icon: 'shield', kicker: 'Pitching' });
  }

  function renderRotation(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var fmt = ctx.fmt;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var split = ctx.split || 'overall';
    var poolPS = ctx.poolPitchScore;
    var teamSps = (DATA.sps || []).filter(function(s) {
      return teamKey(pickCol(s, ['pitcher_team', 'pitcher team'])) === teamKey(team);
    }).sort(function(a, b) {
      var psA = poolPS ? poolPS(a) : num(pickCol(a, ['PitchScore']));
      var psB = poolPS ? poolPS(b) : num(pickCol(b, ['PitchScore']));
      return (psB || 0) - (psA || 0);
    });
    var rotKpi = '<div class="tp-kpi-grid">';
    var avgPs = split === 'overall'
      ? (num(pickCol(prof, ['avg_pitching_score'])) || avgTeamSpMetric(teamSps, DATA, 'overall', 'pitchScore', pickCol, num, teamKey, poolPS))
      : avgTeamSpMetric(teamSps, DATA, split, 'pitchScore', pickCol, num, teamKey, poolPS);
    var kPct = split === 'overall'
      ? num(pickCol(prof, ['team_k_pct']))
      : avgTeamSpMetric(teamSps, DATA, split, 'kPct', pickCol, num, teamKey, poolPS);
    var bbPct = split === 'overall'
      ? num(pickCol(prof, ['team_bb_pct']))
      : avgTeamSpMetric(teamSps, DATA, split, 'bbPct', pickCol, num, teamKey, poolPS);
    var era = num(pickCol(prof, ['team_era']));
    var ipStart = num(pickCol(prof, ['avg_ip_per_start']));
    [
      ['Pitching Score', valChip(ctx, avgPs, 'pitching', false, 0)],
      ['Avg IP/Start', valChip(ctx, ipStart, 'osi', false, 2)],
      ['K%', valChip(ctx, kPct, 'pitching', false, 1)],
      ['BB%', valChip(ctx, bbPct, 'pitching', true, 1)],
      ['Team ERA', valChip(ctx, era, 'pitching', true, 2)]
    ].forEach(function(pair) {
      rotKpi += '<div class="tp-kpi-card"><div class="tp-kpi-lab">' + pair[0] + '</div><div class="m-val">' + pair[1] + '</div></div>';
    });
    rotKpi += '</div>';
    rotKpi += ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Tier</th><th>K%</th><th>BB%</th><th>OSI Allowed</th><th>Stale</th></tr></thead><tbody>';
    if (!teamSps.length) {
      rotKpi += '<tr><td colspan="6" class="tp-empty">No SP profiles for this team</td></tr>';
    } else {
      teamSps.forEach(function(sp) {
        var pname = pickCol(sp, ['pitcher_name']);
        var splits = spMetricSplitsFor(sp, DATA, teamKey);
        var m = resolveSpSplitMetrics(sp, splits, split, pickCol, num, poolPS);
        var ps = m.pitchScore || (ctx.poolPitchScore ? ctx.poolPitchScore(sp) : null);
        var tier = ctx.tierLabel(ps, ctx.PITCH_TIERS);
        var stale = pickCol(sp, ['stale']) === 'True' || pickCol(sp, ['stale']) === 'true';
        rotKpi += '<tr><td><a href="pitcher_profile.html?pitcher=' + ctx.encodePlayer(pname) + '">' + esc(pname) + '</a></td>';
        rotKpi += '<td><span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></td>';
        rotKpi += '<td class="num">' + valChip(ctx, m.kPct, 'pitching', false, 1) + '</td>';
        rotKpi += '<td class="num">' + valChip(ctx, m.bbPct, 'pitching', true, 1) + '</td>';
        rotKpi += '<td class="num">' + valChip(ctx, m.osiAllowed, 'osi', true, 1) + '</td>';
        rotKpi += '<td>' + (stale ? '⚠' : '—') + '</td></tr>';
      });
    }
    rotKpi += '</tbody>' + ctx.profileTableClose();
    var intel = (global.TeamProfileIntel && TeamProfileIntel.renderRotationIntel)
      ? TeamProfileIntel.renderRotationIntel(prof, team, ctx) : '';
    var PC = global.MLBMAProfileControls;
    var splitBar = PC && PC.renderSplitControls && PC.wrapSectionFilterBar
      ? PC.wrapSectionFilterBar(PC.renderSplitControls('rotation', split), 'tp-section-filter-bar--split')
      : '';
    return sectionCard(ctx, 'Starting Rotation', 'Split filters rotation KPIs and SP rows', splitBar + rotKpi, 'tp-rotation-section',
      { icon: 'target', kicker: 'SP unit' }) + intel;
  }

  function renderBullpen(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var fmt = ctx.fmt;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var split = ctx.split || 'overall';
    var prefix = resolveBullpenPrefix(split);
    var unit = bullpenUnitForTeam(team, DATA, teamKey);
    var bpKpi = '<div class="tp-kpi-grid">';
    var kpiDefs = [
      ['ERA', 'ERA', true, 2],
      ['OSI Allowed', 'OSI_allowed', true, 1],
      ['K%', 'K_pct', false, 1],
      ['BB%', 'BB_pct', true, 1]
    ];
    kpiDefs.forEach(function(pair) {
      var v = unit ? colVal(unit, prefix, pair[1], pickCol, num) : null;
      if (v == null && split === 'overall') {
        if (pair[1] === 'ERA') v = num(pickCol(prof, ['bullpen_era']));
        else if (pair[1] === 'OSI_allowed') v = num(pickCol(prof, ['bullpen_osi_allowed']));
      }
      if (v == null && pair[0] === 'ERA' && split === 'hlev') {
        v = num(pickCol(prof, ['bullpen_high_lev_era']));
      }
      bpKpi += '<div class="tp-kpi-card"><div class="tp-kpi-lab">' + pair[0] + '</div><div class="m-val">'
        + valChip(ctx, v, pair[0].indexOf('OSI') >= 0 ? 'osi' : 'pitching', pair[2], pair[3]) + '</div></div>';
    });
    bpKpi += '</div>';
    var closer = pickCol(prof, ['closer_name']);
    var setup = pickCol(prof, ['primary_setup']);
    if (closer) {
      bpKpi += '<p class="ca-helper" style="margin-bottom:12px">Closer: <strong>' + esc(closer) + '</strong>'
        + (setup ? ' · Setup: ' + esc(setup.split(';').join(', ')) : '') + '</p>';
    }
    bpKpi += ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Role</th><th>ERA</th><th>OSI Allowed</th><th>Hand</th></tr></thead><tbody>';
    var relievers = (DATA.bullpen || []).filter(function(r) {
      return teamKey(pickCol(r, ['pitcher_team'])) === teamKey(team);
    });
    if (!relievers.length) {
      bpKpi += '<tr><td colspan="5" class="tp-empty">No bullpen individual data</td></tr>';
    } else {
      relievers.forEach(function(r) {
        var pname = pickCol(r, ['pitcher_name']);
        var pid = pickCol(r, ['pitcher_id']);
        var role = ctx.inferRoleFromLog(pid, pname);
        var era = colVal(r, prefix, 'ERA', pickCol, num);
        var osiA = colVal(r, prefix, 'OSI_allowed', pickCol, num);
        var hand = pickCol(r, ['pitcher_hand']);
        var rhh = colVal(r, 'vs_rhh', 'OSI_allowed', pickCol, num);
        var lhh = colVal(r, 'vs_lhh', 'OSI_allowed', pickCol, num);
        var handAdv = '';
        if (rhh !== null && lhh !== null) {
          handAdv = rhh < lhh ? 'vs RHH' : (lhh < rhh ? 'vs LHH' : 'even');
        }
        bpKpi += '<tr><td><a href="reliever_profile.html?player=' + ctx.encodePlayer(pname) + '">' + esc(pname) + '</a></td>';
        bpKpi += '<td><span class="role-badge ' + role.cls + '">' + esc(role.label) + '</span></td>';
        bpKpi += '<td class="num">' + fmt(era, 2) + '</td><td class="num">' + fmt(osiA, 1) + '</td>';
        bpKpi += '<td>' + esc(hand) + (handAdv ? ' · ' + handAdv : '') + '</td></tr>';
      });
    }
    bpKpi += '</tbody>' + ctx.profileTableClose();
    var intel = (global.TeamProfileIntel && TeamProfileIntel.renderBullpenIntel)
      ? TeamProfileIntel.renderBullpenIntel(prof, team, ctx) : '';
    var PC = global.MLBMAProfileControls;
    var splitBar = PC && PC.renderSplitControls && PC.wrapSectionFilterBar
      ? PC.wrapSectionFilterBar(PC.renderSplitControls('bullpen', split), 'tp-section-filter-bar--split')
      : '';
    return sectionCard(ctx, 'Bullpen Overview', 'Split filters bullpen KPIs and reliever rows', splitBar + bpKpi, 'tp-bullpen-section',
      { icon: 'flame', kicker: 'Bullpen unit' }) + intel;
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
      { icon: 'users', kicker: 'Roster' });
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    var cat = ctx.category || 'lineup';
    var html = '';
    if (cat === 'lineup') {
      if (ctx.renderBattingSection) html += ctx.renderBattingSection(team, ctx);
      else if (ctx.renderLineup) html += ctx.renderLineup(team, ctx);
    } else if (cat === 'rotation') {
      html += renderRotation(prof, team, ctx);
    } else if (cat === 'bullpen') {
      html += renderBullpen(prof, team, ctx);
      html += '<section class="ca-card tp-section tp-bp-usage-section">'
        + (A && A.sectionHeaderHtml
          ? A.sectionHeaderHtml({
            title: 'Bullpen Usage · L7',
            subtitle: 'Live MLB API pitch matrix',
            icon: 'bar-chart-3',
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
    spMetricSplitsFor: spMetricSplitsFor
  };
})(typeof window !== 'undefined' ? window : this);
