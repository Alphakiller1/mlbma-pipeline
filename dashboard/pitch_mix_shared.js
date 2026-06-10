/**
 * Shared pitch-mix index + render helpers (matchup LvP + batter profile).
 */
(function (global) {
  'use strict';

  var S = global.MLBMASharedMatchup || {};
  var A = global.MLBMAAssets;

  function esc(s) {
    return S && S.esc ? S.esc(s) : String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pick(row) {
    if (!row || !S || !S.pickCol) return null;
    return S.pickCol.apply(S, [row].concat(Array.prototype.slice.call(arguments, 1)));
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    return '<span class="chip c-na">' + fmt(v, decimals) + '</span>';
  }

  function tabKeys() {
    var tabs = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
    if (!tabs) return null;
    return {
      pitcherL14: tabs.pitch_mix_pitcher_l14,
      pitcherYtd: tabs.pitch_mix_pitcher,
      teamBattingL14: tabs.pitch_mix_team_batting_l14,
      teamBattingYtd: tabs.pitch_mix_team_batting,
      batterL14: tabs.pitch_mix_batter_l14,
      batterYtd: tabs.pitch_mix_batter
    };
  }

  function pitchTypeKey(row) {
    var t = pick(row, ['pitch_type', 'pitch_type_code', 'Pitch Type']);
    var n = pick(row, ['pitch_name', 'Pitch Name']);
    var key = String(t || n || '').trim().toLowerCase();
    return key || null;
  }

  function pitchLabel(row) {
    return pick(row, ['pitch_name', 'Pitch Name', 'pitch_type', 'Pitch Type']) || '—';
  }

  function normPlayerName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function canonicalPlayerName(name) {
    var raw = String(name || '').trim();
    if (raw.indexOf(',') >= 0) {
      var parts = raw.split(',');
      if (parts.length >= 2) raw = parts.slice(1).join(',').trim() + ' ' + parts[0].trim();
    }
    return normPlayerName(raw);
  }

  function lookupPitchMixRows(map, name) {
    if (!map || !name) return [];
    var key = canonicalPlayerName(name);
    if (map[key] && map[key].length) return map[key];
    var last = key.split(' ').pop();
    if (!last || last.length < 3) return [];
    var matches = [];
    Object.keys(map).forEach(function (k) {
      if (k === key || k.split(' ').pop() !== last) return;
      var init = key.charAt(0);
      if (init && k.charAt(0) === init) matches = matches.concat(map[k]);
    });
    return matches;
  }

  function normalizeAvg(v) {
    var n = num(v);
    if (n == null) return null;
    if (n > 1 && n <= 100) return Math.round(n * 10) / 1000;
    return n;
  }

  function pitchMixField(row, keys) {
    return num(pick(row, keys));
  }

  function pitchMixRowStats(row, side) {
    if (!row) return null;
    var stats = {
      label: pitchLabel(row),
      key: pitchTypeKey(row),
      usage: pitchMixField(row, ['pitch_pct', 'Pitch Pct', 'usage_pct']),
      whiff: pitchMixField(row, ['whiff_rate', 'Whiff Rate', 'whiff_pct', 'Whiff Pct']),
      csw: pitchMixField(row, ['csw_rate', 'CSW Rate', 'csw_pct']),
      zone: pitchMixField(row, ['zone_rate', 'Zone Rate', 'zone_pct']),
      chase: pitchMixField(row, ['chase_rate', 'Chase Rate', 'chase_pct']),
      xwoba: pitchMixField(row, ['xwoba', 'xWOBA', 'xwOBA']),
      velo: pitchMixField(row, ['avg_release_speed', 'Avg Release Speed', 'velocity']),
      spin: pitchMixField(row, ['avg_spin_rate', 'Avg Spin Rate', 'spin_rate']),
      ivb: pitchMixField(row, ['avg_pfx_z', 'Avg Pfx Z', 'pfx_z']),
      hb: pitchMixField(row, ['avg_pfx_x', 'Avg Pfx X', 'pfx_x']),
      izSwing: pitchMixField(row, ['in_zone_swing_rate', 'In Zone Swing Rate', 'iz_swing_rate']),
      ev: pitchMixField(row, ['avg_launch_speed', 'Avg Launch Speed', 'launch_speed']),
      pitches: pitchMixField(row, ['pitches', 'Pitches'])
    };
    if (side === 'bat') {
      stats.avg = normalizeAvg(pick(row, ['batting_avg', 'Batting Avg', 'Batting_Avg', 'avg', 'BA']));
      if (stats.avg == null) {
        var hits = num(pick(row, ['hits', 'H', 'is_hit']));
        var ab = num(pick(row, ['ab', 'AB', 'is_ab']));
        if (hits != null && ab != null && ab > 0) stats.avg = hits / ab;
      }
    }
    return stats;
  }

  function rowsByPitchKey(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = pitchTypeKey(row);
      if (!key) return;
      if (!map[key]) map[key] = row;
    });
    return map;
  }

  function sortPitchKeys(spMap) {
    return Object.keys(spMap).sort(function (a, b) {
      var ua = num(pick(spMap[a], ['pitch_pct'])) || 0;
      var ub = num(pick(spMap[b], ['pitch_pct'])) || 0;
      return ub - ua;
    });
  }

  function buildPitchMixIndex(raw) {
    raw = raw || {};
    var pitcherL14 = raw.pitcherL14 || [];
    var pitcherYtd = raw.pitcherYtd || [];
    var teamBatL14 = raw.teamBattingL14 || [];
    var teamBatYtd = raw.teamBattingYtd || [];
    var batterL14 = raw.batterL14 || [];
    var batterYtd = raw.batterYtd || [];

    var byPitcherName = {};
    var byTeamBatL14 = {};
    var byTeamBatYtd = {};
    var byBatterName = {};

    function indexPitcherRows(rows, map) {
      (rows || []).forEach(function (row) {
        var name = canonicalPlayerName(pick(row, ['full_name', 'pitcher_name', 'Name', 'Pitcher']));
        if (!name) return;
        if (!map[name]) map[name] = [];
        map[name].push(row);
      });
    }

    function indexTeamBatRows(rows, map) {
      (rows || []).forEach(function (row) {
        var tk = S && S.teamKey
          ? S.teamKey(pick(row, ['team_abbr', 'team', 'Tm', 'Team']))
          : String(pick(row, ['team_abbr', 'team']) || '').toUpperCase();
        if (!tk) return;
        if (!map[tk]) map[tk] = [];
        map[tk].push(row);
      });
    }

    function indexBatterRows(rows, map) {
      (rows || []).forEach(function (row) {
        var name = canonicalPlayerName(pick(row, ['full_name', 'batter_name', 'Name', 'Batter']));
        if (!name) return;
        if (!map[name]) map[name] = [];
        map[name].push(row);
      });
    }

    indexPitcherRows(pitcherL14.length ? pitcherL14 : pitcherYtd, byPitcherName);
    indexTeamBatRows(teamBatL14, byTeamBatL14);
    indexTeamBatRows(teamBatYtd, byTeamBatYtd);
    indexBatterRows(batterL14.length ? batterL14 : batterYtd, byBatterName);

    var pitcherRows = pitcherL14.length ? pitcherL14 : pitcherYtd;
    var teamBatRows = teamBatL14.length ? teamBatL14 : teamBatYtd;
    var batterRows = batterL14.length ? batterL14 : batterYtd;

    return {
      byPitcherName: byPitcherName,
      byTeamBatL14: byTeamBatL14,
      byTeamBatYtd: byTeamBatYtd,
      byBatterName: byBatterName,
      window: pitcherL14.length || batterL14.length ? 'L14' : (pitcherYtd.length || batterYtd.length ? 'YTD' : null),
      ready: pitcherRows.length > 0 && (teamBatRows.length > 0 || batterRows.length > 0),
      partial: pitcherRows.length > 0 || teamBatRows.length > 0 || batterRows.length > 0,
      pitcherCount: pitcherRows.length,
      teamBatCount: teamBatRows.length,
      batterCount: batterRows.length
    };
  }

  function pitchMixPlainVal(v, decimals) {
    if (v == null || isNaN(v)) return '<span class="chip c-na">—</span>';
    return '<span class="bp-pm-plain">' + Number(v).toFixed(decimals == null ? 1 : decimals) + '</span>';
  }

  function pitchMixMoveCell(ivb, hb) {
    if ((ivb == null || isNaN(ivb)) && (hb == null || isNaN(hb))) {
      return '<span class="chip c-na">—</span>';
    }
    var ivbTxt = ivb != null && !isNaN(ivb) ? Number(ivb).toFixed(1) : '—';
    var hbTxt = hb != null && !isNaN(hb) ? Number(hb).toFixed(1) : '—';
    return '<span class="bp-pm-move" title="IVB / HB (in)">' + ivbTxt + '<span class="bp-pm-move-sep">/</span>' + hbTxt + '</span>';
  }

  function pitchMixSpCells(sp) {
    sp = sp || {};
    return ''
      + '<td class="num bp-pm-stat">' + metricChip(sp.usage, 'pct', false, 1) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixPlainVal(sp.velo, 1) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixPlainVal(sp.spin, 0) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixMoveCell(sp.ivb, sp.hb) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(sp.whiff, 'swstr', false, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(sp.csw, 'swstr', false, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(sp.zone, 'default', false, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(sp.chase, 'swstr', false, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(sp.xwoba, 'woba', true, 3) + '</td>';
  }

  function pitchMixBatCells(bat) {
    bat = bat || {};
    return ''
      + '<td class="num bp-pm-stat bp-pm-pitch-divider">' + metricChip(bat.avg, 'avg', false, 3) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.whiff, 'swstr', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.chase, 'bbpct', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.csw, 'swstr', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.zone, 'default', false, 1) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixPlainVal(bat.ev, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.xwoba, 'woba', false, 3) + '</td>';
  }

  function batterOnlyCells(bat) {
    bat = bat || {};
    return ''
      + '<td class="num bp-pm-stat">' + metricChip(bat.usage, 'pct', false, 1) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixPlainVal(bat.pitches, 0) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.avg, 'avg', false, 3) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.whiff, 'swstr', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.chase, 'bbpct', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.csw, 'swstr', true, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.zone, 'default', false, 1) + '</td>'
      + '<td class="num bp-pm-stat bp-pm-stat--plain">' + pitchMixPlainVal(bat.ev, 1) + '</td>'
      + '<td class="num bp-pm-stat">' + metricChip(bat.xwoba, 'woba', false, 3) + '</td>';
  }

  function resolveBatterPitchMix(mix, batterName, spName) {
    if (!mix || !mix.partial) return { status: 'pending' };
    var batRows = lookupPitchMixRows(mix.byBatterName, batterName);
    if (!batRows.length) {
      return { status: 'no_batter', batterName: batterName, window: mix.window };
    }

    var batMap = rowsByPitchKey(batRows);
    var hasSp = spName && spName !== 'TBD';
    if (!hasSp) {
      var soloKeys = Object.keys(batMap).sort(function (a, b) {
        return (num(pick(batMap[b], ['pitches'])) || 0) - (num(pick(batMap[a], ['pitches'])) || 0);
      });
      var soloRows = soloKeys.map(function (key) {
        var bat = pitchMixRowStats(batMap[key], 'bat');
        return { pitch: bat && bat.label, bat: bat, sp: null };
      }).filter(function (r) { return r.bat; });
      return {
        status: soloRows.length ? 'batter_only' : 'empty',
        window: mix.window,
        rows: soloRows,
        batterName: batterName
      };
    }

    var spRows = lookupPitchMixRows(mix.byPitcherName, spName);
    if (!spRows.length) {
      return { status: 'no_pitcher', spName: spName, window: mix.window, batterName: batterName };
    }

    var spMap = rowsByPitchKey(spRows);
    var keys = sortPitchKeys(spMap);
    var rows = keys.map(function (key) {
      var sp = pitchMixRowStats(spMap[key], 'sp');
      var bat = batMap[key] ? pitchMixRowStats(batMap[key], 'bat') : null;
      return { pitch: sp && sp.label, sp: sp, bat: bat };
    }).filter(function (r) {
      return r.sp && (r.sp.usage == null || r.sp.usage >= 2);
    });

    return {
      status: rows.length ? 'ok' : 'empty',
      window: mix.window,
      rows: rows,
      spName: spName,
      batterName: batterName
    };
  }

  function pitchMixInsight(rows, spName, batterName) {
    if (!rows || !rows.length) return '';
    var top = rows[0];
    var topPitch = top.pitch || (top.sp && top.sp.label) || '—';
    if (!spName || spName === 'TBD') {
      var best = rows.slice().sort(function (a, b) {
        return (num(b.bat && b.bat.xwoba) || 0) - (num(a.bat && a.bat.xwoba) || 0);
      })[0];
      if (best && best.bat && best.bat.xwoba != null) {
        return '<p class="bp-pm-insight">Best contact pitch: <strong>' + esc(best.pitch || best.bat.label)
          + '</strong> (xwOBA ' + fmt(best.bat.xwoba, 3) + ').</p>';
      }
      return '';
    }
    var overlap = rows.filter(function (r) { return r.bat && r.bat.xwoba != null; });
    if (!overlap.length) {
      return '<p class="bp-pm-insight">Top SP offering: <strong>' + esc(topPitch) + '</strong>'
        + (top.sp && top.sp.usage != null ? ' (' + fmt(top.sp.usage, 1) + '% usage)' : '') + '.</p>';
    }
    var risk = overlap.slice().sort(function (a, b) {
      return (num(b.bat.xwoba) || 0) - (num(a.bat.xwoba) || 0);
    })[0];
    var spXw = top.sp && top.sp.xwoba != null ? fmt(top.sp.xwoba, 3) : '—';
    var batXw = risk.bat && risk.bat.xwoba != null ? fmt(risk.bat.xwoba, 3) : '—';
    return '<p class="bp-pm-insight">Primary pitch <strong>' + esc(topPitch) + '</strong> · batter xwOBA '
      + esc(batXw) + ' on <strong>' + esc(risk.pitch || risk.bat.label) + '</strong> · SP xwOBA allowed '
      + esc(spXw) + '.</p>';
  }

  function renderCompareTable(pack) {
    var rows = pack.rows || [];
    var body = rows.map(function (r) {
      return '<tr>'
        + '<td class="bp-pm-pitch-name">' + esc(r.pitch || (r.sp && r.sp.label)) + '</td>'
        + pitchMixSpCells(r.sp)
        + pitchMixBatCells(r.bat || {})
        + '</tr>';
    }).join('');
    var spCols = 9;
    var batCols = 7;
    return '<div class="bp-pm-table-wrap"><table class="bp-pm-table"><colgroup>'
      + '<col class="bp-pm-col-pitch"><col span="' + spCols + '"><col span="' + batCols + '">'
      + '</colgroup><thead>'
      + '<tr class="bp-pm-groups">'
      + '<th scope="colgroup" aria-hidden="true"></th>'
      + '<th colspan="' + spCols + '" class="bp-pm-group bp-pm-group--sp">Pitcher · Shape &amp; Results</th>'
      + '<th colspan="' + batCols + '" class="bp-pm-group bp-pm-group--bat">Batter · Contact &amp; Discipline</th>'
      + '</tr><tr class="bp-pm-cols">'
      + '<th scope="col">Pitch</th>'
      + '<th scope="col">Usage%</th><th scope="col">Velo</th><th scope="col">Spin</th><th scope="col">IVB/HB</th>'
      + '<th scope="col">Whiff%</th><th scope="col">CSW%</th><th scope="col">Zone%</th><th scope="col">Chase%</th><th scope="col">xwOBA</th>'
      + '<th scope="col" class="bp-pm-pitch-divider">Avg</th><th scope="col">Whiff%</th><th scope="col">Chase%</th>'
      + '<th scope="col">CSW%</th><th scope="col">Zone%</th><th scope="col">EV</th><th scope="col">xwOBA</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderBatterOnlyTable(rows) {
    var body = (rows || []).map(function (r) {
      return '<tr><td class="bp-pm-pitch-name">' + esc(r.pitch || (r.bat && r.bat.label))
        + '</td>' + batterOnlyCells(r.bat) + '</tr>';
    }).join('');
    return '<div class="bp-pm-table-wrap"><table class="bp-pm-table bp-pm-table--solo"><thead><tr>'
      + '<th scope="col">Pitch</th><th scope="col">Seen%</th><th scope="col">Pitches</th>'
      + '<th scope="col">Avg</th><th scope="col">Whiff%</th><th scope="col">Chase%</th>'
      + '<th scope="col">CSW%</th><th scope="col">Zone%</th><th scope="col">EV</th><th scope="col">xwOBA</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderBatterProfileSection(pack, opts) {
    opts = opts || {};
    var spName = opts.spName || '';
    var batterName = opts.batterName || '';
    var sub = 'Pitch-type contact and discipline'
      + (pack.window ? ' · ' + pack.window : '');

    if (pack.status === 'pending') {
      return '<div class="bp-pm-empty"><p class="ca-helper">Pitch mix data is loading. Run <code>scrape_pitch_mix</code> if tabs are empty.</p></div>';
    }
    if (pack.status === 'no_batter') {
      return '<div class="bp-pm-empty"><p class="ca-helper">No pitch-mix rows for <strong>' + esc(batterName)
        + '</strong> in Pitch_Mix_Batter_L14 yet.</p></div>';
    }
    if (pack.status === 'no_pitcher') {
      var solo = opts.mix ? resolveBatterPitchMix(opts.mix, batterName, null) : { rows: [] };
      return pitchMixInsight(solo.rows, null, batterName)
        + renderBatterOnlyTable(solo.rows)
        + '<p class="ca-helper" style="margin-top:10px">Listed starter mix unavailable for <strong>'
        + esc(spName) + '</strong>.</p>';
    }
    if (pack.status === 'empty' || !pack.rows || !pack.rows.length) {
      return '<div class="bp-pm-empty"><p class="ca-helper">No overlapping pitch types above usage threshold.</p></div>';
    }
    if (pack.status === 'batter_only') {
      return pitchMixInsight(pack.rows, null, batterName) + renderBatterOnlyTable(pack.rows);
    }

    var spAvatar = A && A.pitcherAvatar
      ? A.pitcherAvatar(opts.spId || spName, 'compare', { eager: true, className: 'bp-pm-sp-avatar' })
      : '';
    return '<div class="bp-pm-head">'
      + '<div class="bp-pm-head__sp">' + spAvatar + '<span>' + esc(spName) + ' · Arsenal</span></div>'
      + '<div class="bp-pm-head__bat"><span>' + esc(batterName) + ' · vs Pitch</span></div>'
      + '</div>'
      + pitchMixInsight(pack.rows, spName, batterName)
      + renderCompareTable(pack);
  }

  global.MLBMAPitchMix = {
    tabKeys: tabKeys,
    buildIndex: buildPitchMixIndex,
    canonicalPlayerName: canonicalPlayerName,
    lookupRows: lookupPitchMixRows,
    resolveBatterPitchMix: resolveBatterPitchMix,
    renderBatterProfileSection: renderBatterProfileSection,
    pitchMixRowStats: pitchMixRowStats
  };
})(typeof window !== 'undefined' ? window : this);
