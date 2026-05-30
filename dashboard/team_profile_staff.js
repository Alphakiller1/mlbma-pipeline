/**
 * Team Profile — pitching, lineup, and roster sections.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function sectionCard(ctx, eyebrow, title, subtitle, body) {
    if (ctx.sectionCard) return ctx.sectionCard(eyebrow, title, subtitle, body);
    return '<section class="ca-card tp-section">'
      + (A && A.sectionHeaderHtml
        ? A.sectionHeaderHtml({ eyebrow: eyebrow, title: title, subtitle: subtitle || '' })
        : '<header class="ca-section-header"><h2>' + esc(title) + '</h2></header>')
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
    return sectionCard(ctx, 'Pitching', 'Staff Snapshot', 'Team-level pitching context from profiles + Pitch Score', body);
  }

  function renderRotation(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var fmt = ctx.fmt;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var rotKpi = '<div class="tp-kpi-grid">';
    var avgPs = num(pickCol(prof, ['avg_pitching_score']));
    [
      ['Pitching Score', valChip(ctx, avgPs, 'pitching', false, 0)],
      ['Avg IP/Start', valChip(ctx, num(pickCol(prof, ['avg_ip_per_start'])), 'osi', false, 2)],
      ['Team K%', valChip(ctx, num(pickCol(prof, ['team_k_pct'])), 'pitching', false, 1)],
      ['Team BB%', valChip(ctx, num(pickCol(prof, ['team_bb_pct'])), 'pitching', true, 1)],
      ['Team ERA', valChip(ctx, num(pickCol(prof, ['team_era'])), 'pitching', true, 2)]
    ].forEach(function(pair) {
      rotKpi += '<div class="tp-kpi-card"><div class="tp-kpi-lab">' + pair[0] + '</div><div class="m-val">' + pair[1] + '</div></div>';
    });
    rotKpi += '</div>';
    rotKpi += ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Tier</th><th>K%</th><th>BB%</th><th>OSI Allowed</th><th>Stale</th></tr></thead><tbody>';
    var teamSps = (DATA.sps || []).filter(function(s) {
      return teamKey(pickCol(s, ['pitcher_team', 'pitcher team'])) === teamKey(team);
    }).sort(function(a, b) {
      return (num(pickCol(b, ['PitchScore'])) || 0) - (num(pickCol(a, ['PitchScore'])) || 0);
    });
    if (!teamSps.length) {
      rotKpi += '<tr><td colspan="6" class="tp-empty">No SP profiles for this team</td></tr>';
    } else {
      teamSps.forEach(function(sp) {
        var pname = pickCol(sp, ['pitcher_name']);
        var ps = num(pickCol(sp, ['PitchScore'])) || (ctx.poolPitchScore ? ctx.poolPitchScore(sp) : null);
        var tier = ctx.tierLabel(ps, ctx.PITCH_TIERS);
        var stale = pickCol(sp, ['stale']) === 'True' || pickCol(sp, ['stale']) === 'true';
        rotKpi += '<tr><td><a href="pitcher_profile.html?pitcher=' + ctx.encodePlayer(pname) + '">' + esc(pname) + '</a></td>';
        rotKpi += '<td><span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></td>';
        rotKpi += '<td class="num">' + fmt(num(pickCol(sp, ['K_pct'])), 1) + '</td>';
        rotKpi += '<td class="num">' + fmt(num(pickCol(sp, ['BB_pct'])), 1) + '</td>';
        rotKpi += '<td class="num">' + fmt(num(pickCol(sp, ['OSI_allowed'])), 1) + '</td>';
        rotKpi += '<td>' + (stale ? '⚠' : '—') + '</td></tr>';
      });
    }
    rotKpi += '</tbody>' + ctx.profileTableClose();
    return sectionCard(ctx, 'Rotation', 'Starting Rotation', 'SP profiles and team pitching context', rotKpi);
  }

  function renderBullpen(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var fmt = ctx.fmt;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var bpKpi = '<div class="tp-kpi-grid">';
    [['bullpen_era', 'ERA', true, 2], ['bullpen_osi_allowed', 'OSI Allowed', true, 1],
      ['bullpen_high_lev_era', 'High-Lev ERA', true, 2], ['bullpen_ir_scored_pct', 'IR Scored%', false, 1]].forEach(function(pair) {
      var v = num(pickCol(prof, [pair[0]]));
      bpKpi += '<div class="tp-kpi-card"><div class="tp-kpi-lab">' + pair[1] + '</div><div class="m-val">'
        + valChip(ctx, v, pair[1].indexOf('OSI') >= 0 ? 'osi' : 'pitching', pair[2], pair[3]) + '</div></div>';
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
        var era = num(pickCol(r, ['overall_ERA']));
        var osiA = num(pickCol(r, ['overall_OSI_allowed']));
        var hand = pickCol(r, ['pitcher_hand']);
        var rhh = num(pickCol(r, ['vs_rhh_OSI_allowed']));
        var lhh = num(pickCol(r, ['vs_lhh_OSI_allowed']));
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
    return sectionCard(ctx, 'Bullpen', 'Bullpen Overview', 'Unit metrics and individual reliever profiles', bpKpi);
  }

  function renderRoster(prof, team, ctx) {
    var pickCol = ctx.pickCol;
    var num = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data;
    var rosterBody = ctx.profileTableOpen()
      + '<thead><tr><th>Name</th><th>Pos</th><th>Bats</th><th>ABQ</th><th>RCV</th><th>OBR</th><th>OSI</th><th>vs RHP</th><th>vs LHP</th><th>Trend</th></tr></thead><tbody>';
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
      return {
        name: n,
        pos: reg ? pickCol(reg, ['position']) : '',
        bats: reg ? pickCol(reg, ['bats']) : '',
        abq: num(pickCol(main, ['ABQ'])),
        rcv: num(pickCol(main, ['RCV'])),
        obr: num(pickCol(main, ['OBR'])),
        osi: num(pickCol(main, ['OSI'])),
        rhp: byName[n]['vs_RHP'] ? num(pickCol(byName[n]['vs_RHP'], ['OSI'])) : null,
        lhp: byName[n]['vs_LHP'] ? num(pickCol(byName[n]['vs_LHP'], ['OSI'])) : null,
        trend: pickCol(main, ['trend'])
      };
    }).sort(function(a, b) { return (b.osi || 0) - (a.osi || 0); });

    if (!rosterList.length) {
      rosterBody += '<tr><td colspan="10" class="tp-empty">No qualified batters (run batter profile pipeline)</td></tr>';
    } else {
      rosterList.forEach(function(b) {
        rosterBody += '<tr><td><a href="batter_profile.html?player=' + ctx.encodePlayer(b.name) + '">' + esc(b.name) + '</a></td>';
        rosterBody += '<td>' + esc(b.pos || '—') + '</td><td>' + esc(b.bats || '—') + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.abq, 'abq', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.rcv, 'rcv', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.obr, 'obr', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.osi, 'osi', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.rhp, 'osi', false, 1) + '</td>';
        rosterBody += '<td class="num">' + valChip(ctx, b.lhp, 'osi', false, 1) + '</td>';
        rosterBody += '<td>' + (ctx.trendArrow ? ctx.trendArrow(b.trend) : '—') + '</td></tr>';
      });
    }
    rosterBody += '</tbody>' + ctx.profileTableClose();
    return sectionCard(ctx, 'Roster', 'Qualified Batters (50+ PA)', 'Season-long batter metrics with platoon splits', rosterBody);
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    var html = '';
    if (ctx.renderLineup) html += ctx.renderLineup(team);
    html += renderPitchingSummary(prof, team, ctx);
    html += renderRotation(prof, team, ctx);
    html += renderBullpen(prof, team, ctx);
    html += renderRoster(prof, team, ctx);
    return html;
  }

  global.TeamProfileStaff = {
    renderAll: renderAll,
    renderPitchingSummary: renderPitchingSummary,
    renderRotation: renderRotation,
    renderBullpen: renderBullpen,
    renderRoster: renderRoster
  };
})(typeof window !== 'undefined' ? window : this);
