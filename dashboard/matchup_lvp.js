/**
 * Lineup vs Pitcher — performance comparison (LvP pane).
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var A = global.MLBMAAssets;
  var CM = global.CompareMetrics;

  var LINEUP_GAMES = 10;
  var STARTS_LIMIT = 10;

  var _pack = {
    spGameLog: [],
    spMetricSplits: [],
    pitchMix: null,
    teamL10SpHand: [],
    teamL10SpHandGames: []
  };
  var _hydrateToken = 0;

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
    return S.pickCol.apply(S, arguments);
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    return '<span class="chip c-na">' + fmt(v, decimals) + '</span>';
  }

  function sectionHead(title, sub) {
    if (A && A.caSectionHeadHtml) return A.caSectionHeadHtml('target', '', title, sub || '');
    return '<h3 class="mc-lvp-section-title">' + esc(title) + '</h3>'
      + (sub ? '<p class="mc-pane-desc">' + esc(sub) + '</p>' : '');
  }

  function lvpPanelHead(title, purpose) {
    return sectionHead(title, purpose);
  }

  function perfSummaryTableHtml(cols, row) {
    var head = cols.map(function(c) { return '<th>' + esc(c.label) + '</th>'; }).join('');
    var cells = cols.map(function(c) {
      var v = row && row[c.key] != null ? row[c.key] : c.val;
      return '<td class="num mc-lvp-summary-stat">' + metricChip(v, c.ctx, c.inv, c.dec == null ? 1 : c.dec) + '</td>';
    }).join('');
    return '<div class="mc-lvp-table-wrap mc-lvp-table-wrap--summary"><table class="mc-lvp-table mc-lvp-table--summary">'
      + '<thead><tr>' + head + '</tr></thead><tbody><tr>' + cells + '</tr></tbody></table></div>';
  }

  function normalizePct(pct) {
    var n = num(pct);
    if (n == null) return null;
    if (n > 0 && n <= 1.5) return n * 100;
    return n;
  }

  function k9FromPct(pct) {
    pct = normalizePct(pct);
    if (pct == null) return null;
    return Math.round(pct * 0.385 * 10) / 10;
  }

  function ratePerNine(pct) {
    return k9FromPct(pct);
  }

  function scaleRate(val) {
    var n = num(val);
    if (n == null) return null;
    if (n > 1.5) return null;
    return n;
  }

  function wobaFromProfile(row) {
    var wrc = num(pick(row, ['wRC_faced', 'wrc_faced', 'wRC+_faced', 'wRC+']));
    if (wrc != null) return Math.round(0.320 * (wrc / 100) * 1000) / 1000;
    var w = scaleRate(pick(row, ['wOBA_allowed', 'woba_allowed', 'wOBA', 'woba']));
    if (w != null) return w;
    var ops = scaleRate(pick(row, ['OPS', 'ops_allowed', 'OPS_allowed']));
    if (ops != null) return Math.round((ops / 1.280) * 0.320 * 1000) / 1000;
    return null;
  }

  function whipFromPitchScore(ps) {
    ps = num(ps);
    if (ps == null) return null;
    return Math.round((1.42 - (ps - 50) * 0.0085) * 100) / 100;
  }

  function teamResultsRow(ctx, team) {
    if (!ctx._resultsByTeam && S && S.parseTeamResultsMap) {
      ctx._resultsByTeam = S.parseTeamResultsMap((ctx.data && ctx.data.teamResults) || []);
    }
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    return ctx._resultsByTeam && ctx._resultsByTeam[tk];
  }

  function lineupSplitRow(ctx, team, spHand) {
    if (!ctx) return null;
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var map = spHandFilter(spHand) === 'l' ? ctx.scL : ctx.scR;
    if (!map) return null;
    if (Array.isArray(map)) {
      return map.find(function(r) { return S.teamKey(r.t) === tk; }) || null;
    }
    return map[tk] || null;
  }

  function parseIp(raw) {
    if (raw == null || raw === '') return 0;
    var s = String(raw).trim();
    if (s.indexOf('.') >= 0) {
      var p = s.split('.');
      return (num(p[0]) || 0) + (num(p[1]) || 0) / 3;
    }
    return num(s) || 0;
  }

  function spHandFilter(hand) {
    return String(hand || 'R').charAt(0).toUpperCase() === 'L' ? 'l' : 'r';
  }

  function handLabel(hand) {
    return spHandFilter(hand) === 'l' ? 'LHP' : 'RHP';
  }

  function prepareData(opts) {
    opts = opts || {};
    _pack = {
      spGameLog: opts.spGameLog || [],
      spMetricSplits: opts.spMetricSplits || [],
      teamL10SpHand: opts.teamL10SpHand || [],
      teamL10SpHandGames: opts.teamL10SpHandGames || [],
      pitchMix: buildPitchMixIndex({
        pitcherL14: opts.pitchMixPitcherL14,
        pitcherYtd: opts.pitchMixPitcher,
        teamBattingL14: opts.pitchMixTeamBattingL14,
        teamBattingYtd: opts.pitchMixTeamBatting,
        batterL14: opts.pitchMixBatterL14
      })
    };
    return _pack;
  }

  function pitchMixTabKeys() {
    var tabs = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
    if (!tabs) return null;
    return {
      pitcherL14: tabs.pitch_mix_pitcher_l14,
      pitcherYtd: tabs.pitch_mix_pitcher,
      teamBattingL14: tabs.pitch_mix_team_batting_l14,
      teamBattingYtd: tabs.pitch_mix_team_batting,
      batterL14: tabs.pitch_mix_batter_l14
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

  /** Pitch-mix sheets use "Last, First"; slate/SP rows use "First Last". */
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
    Object.keys(map).forEach(function(k) {
      if (k === key || k.split(' ').pop() !== last) return;
      var init = key.charAt(0);
      if (init && k.charAt(0) === init) matches = matches.concat(map[k]);
    });
    return matches;
  }

  function ensurePitchMixLoaded(ctx) {
    if (_pack.pitchMix && _pack.pitchMix.ready) return Promise.resolve(_pack.pitchMix);
    var d = ctx && ctx.data ? ctx.data : {};
    if (d.pitchMixPitcherL14 && d.pitchMixPitcherL14.length) {
      refreshPitchMixData({
        pitchMixPitcherL14: d.pitchMixPitcherL14,
        pitchMixPitcher: d.pitchMixPitcher,
        pitchMixTeamBattingL14: d.pitchMixTeamBattingL14,
        pitchMixTeamBatting: d.pitchMixTeamBatting,
        pitchMixBatterL14: d.pitchMixBatterL14
      });
      if (_pack.pitchMix && _pack.pitchMix.ready) return Promise.resolve(_pack.pitchMix);
    }
    var tabs = pitchMixTabKeys();
    if (!tabs || !S || !S.fetchSheetTab) return Promise.resolve(_pack.pitchMix);
    return Promise.all([
      S.fetchSheetTab(tabs.pitcherL14, { forceRefresh: true }).catch(function() { return []; }),
      S.fetchSheetTab(tabs.pitcherYtd, { forceRefresh: true }).catch(function() { return []; }),
      S.fetchSheetTab(tabs.teamBattingL14, { forceRefresh: true }).catch(function() { return []; }),
      S.fetchSheetTab(tabs.teamBattingYtd, { forceRefresh: true }).catch(function() { return []; }),
      S.fetchSheetTab(tabs.batterL14, { forceRefresh: true }).catch(function() { return []; })
    ]).then(function(res) {
      var mix = refreshPitchMixData({
        pitchMixPitcherL14: res[0] || [],
        pitchMixPitcher: res[1] || [],
        pitchMixTeamBattingL14: res[2] || [],
        pitchMixTeamBatting: res[3] || [],
        pitchMixBatterL14: res[4] || []
      });
      if (ctx && ctx.data) {
        ctx.data.pitchMixPitcherL14 = res[0] || [];
        ctx.data.pitchMixPitcher = res[1] || [];
        ctx.data.pitchMixTeamBattingL14 = res[2] || [];
        ctx.data.pitchMixTeamBatting = res[3] || [];
        ctx.data.pitchMixBatterL14 = res[4] || [];
      }
      return mix;
    });
  }

  function buildPitchMixIndex(raw) {
    raw = raw || {};
    var pitcherL14 = raw.pitcherL14 || [];
    var pitcherYtd = raw.pitcherYtd || [];
    var teamBatL14 = raw.teamBattingL14 || [];
    var teamBatYtd = raw.teamBattingYtd || [];
    var batterL14 = raw.batterL14 || [];

    var byPitcherName = {};
    var byTeamBatL14 = {};
    var byTeamBatYtd = {};
    var byBatterName = {};

    function indexPitcherRows(rows, map) {
      (rows || []).forEach(function(row) {
        var raw = pick(row, ['full_name', 'pitcher_name', 'Name', 'Pitcher']);
        var name = canonicalPlayerName(raw);
        if (!name) return;
        if (!map[name]) map[name] = [];
        map[name].push(row);
      });
    }

    function indexTeamBatRows(rows, map) {
      (rows || []).forEach(function(row) {
        var tk = S && S.teamKey
          ? S.teamKey(pick(row, ['team_abbr', 'team', 'Tm', 'Team']))
          : String(pick(row, ['team_abbr', 'team']) || '').toUpperCase();
        if (!tk) return;
        if (!map[tk]) map[tk] = [];
        map[tk].push(row);
      });
    }

    function indexBatterRows(rows, map) {
      (rows || []).forEach(function(row) {
        var name = canonicalPlayerName(pick(row, ['full_name', 'batter_name', 'Name', 'Batter']));
        if (!name) return;
        if (!map[name]) map[name] = [];
        map[name].push(row);
      });
    }

    indexPitcherRows(pitcherL14.length ? pitcherL14 : pitcherYtd, byPitcherName);
    indexTeamBatRows(teamBatL14, byTeamBatL14);
    indexTeamBatRows(teamBatYtd, byTeamBatYtd);
    indexBatterRows(batterL14, byBatterName);

    var pitcherRows = pitcherL14.length ? pitcherL14 : pitcherYtd;
    var teamBatRows = teamBatL14.length ? teamBatL14 : teamBatYtd;

    return {
      byPitcherName: byPitcherName,
      byTeamBatL14: byTeamBatL14,
      byTeamBatYtd: byTeamBatYtd,
      byBatterName: byBatterName,
      window: pitcherL14.length ? 'L14' : (pitcherYtd.length ? 'YTD' : null),
      ready: pitcherRows.length > 0 && teamBatRows.length > 0,
      partial: pitcherRows.length > 0 || teamBatRows.length > 0,
      pitcherCount: pitcherRows.length,
      teamBatCount: teamBatRows.length
    };
  }

  function normalizeAvg(v) {
    var n = num(v);
    if (n == null) return null;
    if (n > 1 && n <= 100) return Math.round(n * 10) / 1000;
    return n;
  }

  function pitchMixRowStats(row, side) {
    if (!row) return null;
    var stats = {
      label: pitchLabel(row),
      key: pitchTypeKey(row),
      usage: num(pick(row, ['pitch_pct', 'pitch_pct', 'Pitch Pct', 'usage_pct'])),
      whiff: num(pick(row, ['whiff_rate', 'Whiff Rate', 'whiff_pct', 'Whiff Pct'])),
      csw: num(pick(row, ['csw_rate', 'CSW Rate'])),
      xwoba: num(pick(row, ['xwoba', 'xWOBA', 'xwOBA'])),
      velo: num(pick(row, ['avg_release_speed', 'Avg Release Speed', 'velocity']))
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
    (rows || []).forEach(function(row) {
      var key = pitchTypeKey(row);
      if (!key) return;
      if (!map[key]) map[key] = row;
    });
    return map;
  }

  function aggregateLineupBatMix(lineup, batterIndex) {
    if (!lineup || !lineup.length || !batterIndex) return null;
    var acc = {};
    var n = 0;
    lineup.forEach(function(slot) {
      var name = slot && (slot.player || slot.name);
      if (!name) return;
      var rows = lookupPitchMixRows(batterIndex, name);
      if (!rows || !rows.length) return;
      n++;
      rows.forEach(function(row) {
        var key = pitchTypeKey(row);
        if (!key) return;
        if (!acc[key]) {
          acc[key] = { pitches: 0, hits: 0, ab: 0, xwobaSum: 0, xwobaN: 0, whiffSum: 0, whiffN: 0, label: pitchLabel(row) };
        }
        var pitches = num(pick(row, ['pitches', 'Pitches'])) || 0;
        var xw = num(pick(row, ['xwoba', 'xWOBA']));
        var whiff = num(pick(row, ['whiff_rate', 'Whiff Rate']));
        var hits = num(pick(row, ['hits', 'H', 'is_hit']));
        var ab = num(pick(row, ['ab', 'AB', 'is_ab']));
        var ba = normalizeAvg(pick(row, ['batting_avg', 'Batting Avg', 'Batting_Avg', 'avg', 'BA']));
        acc[key].pitches += pitches;
        if (hits != null && ab != null) { acc[key].hits += hits; acc[key].ab += ab; }
        else if (ba != null && ab != null && ab > 0) { acc[key].hits += ba * ab; acc[key].ab += ab; }
        else if (ba != null && pitches > 0) { acc[key].hits += ba * pitches; acc[key].ab += pitches; }
        if (xw != null && pitches > 0) { acc[key].xwobaSum += xw * pitches; acc[key].xwobaN += pitches; }
        if (whiff != null && pitches > 0) { acc[key].whiffSum += whiff * pitches; acc[key].whiffN += pitches; }
      });
    });
    if (!n) return null;
    var out = {};
    Object.keys(acc).forEach(function(k) {
      var a = acc[k];
      out[k] = {
        label: a.label,
        key: k,
        avg: a.ab > 0 ? a.hits / a.ab : null,
        whiff: a.whiffN ? a.whiffSum / a.whiffN : null,
        xwoba: a.xwobaN ? a.xwobaSum / a.xwobaN : null
      };
    });
    return out;
  }

  function mergeBatSideStats(lu, team) {
    if (!lu && !team) return null;
    function pickStat(key) {
      if (lu && lu[key] != null && !isNaN(lu[key])) return lu[key];
      if (team && team[key] != null && !isNaN(team[key])) return team[key];
      return null;
    }
    return {
      label: (lu && lu.label) || (team && team.label),
      key: (lu && lu.key) || (team && team.key),
      avg: pickStat('avg'),
      whiff: pickStat('whiff'),
      xwoba: pickStat('xwoba')
    };
  }

  function resolvePitchMix(spName, lineupTeam, lineup) {
    var mix = _pack.pitchMix;
    if (!mix || !mix.partial) return { status: 'pending' };

    var spRows = lookupPitchMixRows(mix.byPitcherName, spName);
    var tk = S && S.teamKey ? S.teamKey(lineupTeam) : String(lineupTeam || '').toUpperCase();
    var teamRows = mix.byTeamBatL14[tk] || mix.byTeamBatYtd[tk] || [];
    if (!spRows.length) return { status: 'no_pitcher', spName: spName, window: mix.window };
    if (!teamRows.length) return { status: 'no_lineup', lineupTeam: lineupTeam, window: mix.window };

    var spMap = rowsByPitchKey(spRows);
    var teamMap = rowsByPitchKey(teamRows);
    var lineupMap = aggregateLineupBatMix(lineup, mix.byBatterName);
    var keys = Object.keys(spMap).sort(function(a, b) {
      var ua = num(pick(spMap[a], ['pitch_pct'])) || 0;
      var ub = num(pick(spMap[b], ['pitch_pct'])) || 0;
      return ub - ua;
    });

    var rows = keys.map(function(key) {
      var sp = pitchMixRowStats(spMap[key], 'sp');
      var team = pitchMixRowStats(teamMap[key], 'bat');
      var lu = lineupMap && lineupMap[key] ? lineupMap[key] : null;
      var bat = mergeBatSideStats(lu, team);
      return { pitch: sp && sp.label, sp: sp, bat: bat };
    }).filter(function(r) {
      return r.sp && (r.sp.usage == null || r.sp.usage >= 2);
    });

    return {
      status: rows.length ? 'ok' : 'empty',
      window: mix.window,
      rows: rows,
      lineupWeighted: !!(lineupMap && Object.keys(lineupMap).length)
    };
  }

  function pitchMixHtml(comp, ctx) {
    var lineup = comp.lineupSide === 'home' ? ctx.homeLineup : ctx.awayLineup;
    var mix = resolvePitchMix(comp.spName, comp.lineupTeam, lineup);
    var sub = 'Pitcher usage vs lineup avg by pitch type'
      + (mix.window ? ' · ' + mix.window : '')
      + (mix.lineupWeighted ? ' · projected lineup weighted' : ' · team batting mix');

    if (mix.status === 'pending') {
      return sectionHead('Pitch Mix Breakdown', sub)
        + '<div class="mc-lvp-pitchmix-empty ca-board">'
        + '<p class="ca-helper">Pitch mix sync pending. After <code>scrape_pitch_mix</code> finishes and rows land in '
        + '<strong>Pitch_Mix_Pitcher_L14</strong> / <strong>Pitch_Mix_Team_Batting_L14</strong> (Sheets + Supabase), reload this page.</p>'
        + '</div>';
    }
    if (mix.status === 'no_pitcher') {
      return sectionHead('Pitch Mix Breakdown', sub)
        + '<div class="mc-lvp-pitchmix-empty ca-board">'
        + '<p class="ca-helper">Sheets are synced but no pitch-mix rows matched <strong>' + esc(mix.spName) + '</strong> yet.</p>'
        + '</div>';
    }
    if (mix.status === 'no_lineup') {
      return sectionHead('Pitch Mix Breakdown', sub)
        + '<div class="mc-lvp-pitchmix-empty ca-board">'
        + '<p class="ca-helper">Pitcher mix loaded; team batting mix missing for <strong>' + esc(mix.lineupTeam) + '</strong>.</p>'
        + '</div>';
    }
    if (mix.status === 'empty' || !mix.rows.length) {
      return sectionHead('Pitch Mix Breakdown', sub)
        + '<div class="mc-lvp-pitchmix-empty ca-board">'
        + '<p class="ca-helper">Matched pitcher and team tabs but no overlapping pitch types above usage threshold.</p>'
        + '</div>';
    }

    var body = mix.rows.map(function(r) {
      var sp = r.sp || {};
      var bat = r.bat || {};
      return '<tr>'
        + '<td class="mc-lvp-pitch-name">' + esc(r.pitch || sp.label) + '</td>'
        + '<td class="num mc-pm-stat">' + metricChip(sp.usage, 'pct', false, 1) + '</td>'
        + '<td class="num mc-pm-stat">' + metricChip(sp.whiff, 'pitching', false, 1) + '</td>'
        + '<td class="num mc-pm-stat">' + metricChip(sp.xwoba, 'woba', true, 3) + '</td>'
        + '<td class="num mc-pm-stat mc-lvp-pitch-divider">' + metricChip(bat.avg, 'avg', false, 3) + '</td>'
        + '<td class="num mc-pm-stat">' + metricChip(bat.whiff, 'pitching', true, 1) + '</td>'
        + '<td class="num mc-pm-stat">' + metricChip(bat.xwoba, 'woba', false, 3) + '</td>'
        + '</tr>';
    }).join('');

    var luLogo = S && S.teamLogo ? S.teamLogo(comp.lineupTeam, 18) : '';
    var spLogo = S && S.teamLogo ? S.teamLogo(comp.pitcherTeam, 18) : '';

    return sectionHead('Pitch Mix Breakdown', sub)
      + '<div class="mc-lvp-pitchmix-head">'
      + '<div class="mc-lvp-pitchmix-side mc-lvp-pitchmix-side--sp">' + spLogo
      + '<span>' + esc(comp.spName) + ' · Usage</span></div>'
      + '<div class="mc-lvp-pitchmix-side mc-lvp-pitchmix-side--lu">' + luLogo
      + '<span>' + esc(comp.lineupTeam) + ' vs Pitch</span></div>'
      + '</div>'
      + '<div class="mc-lvp-table-wrap"><table class="mc-lvp-table mc-lvp-table--pitchmix"><colgroup>'
      + '<col class="mc-pm-col-pitch"><col span="3" class="mc-pm-col-sp"><col span="3" class="mc-pm-col-lu">'
      + '</colgroup><thead>'
      + '<tr class="mc-lvp-pitchmix-groups">'
      + '<th scope="colgroup" aria-hidden="true"></th>'
      + '<th colspan="3" class="mc-lvp-pitchmix-group mc-lvp-pitchmix-group--sp">Pitcher</th>'
      + '<th colspan="3" class="mc-lvp-pitchmix-group mc-lvp-pitchmix-group--lu">Lineup / Team</th>'
      + '</tr><tr class="mc-lvp-pitchmix-cols">'
      + '<th scope="col">Pitch</th>'
      + '<th scope="col">Usage%</th><th scope="col">Whiff%</th><th scope="col">xwOBA</th>'
      + '<th scope="col" class="mc-lvp-pitch-divider">Avg</th><th scope="col">Whiff%</th><th scope="col">xwOBA</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function teamL10SpHandMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      if (!row) return;
      var team = S && S.teamKey
        ? S.teamKey(pick(row, ['team', 'Tm', 'Team']))
        : String(pick(row, ['team']) || '').toUpperCase();
      var hand = String(pick(row, ['opp_starter_hand', 'opp starter hand', 'hand']) || '').trim().toUpperCase();
      if (!team || (hand !== 'R' && hand !== 'L')) return;
      map[team + ':' + hand] = row;
    });
    return map;
  }

  function lineupL10Row(ctx, team, spHand) {
    if (!ctx._l10SpHandMap) {
      ctx._l10SpHandMap = teamL10SpHandMap(_pack.teamL10SpHand || []);
    }
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var hand = spHandFilter(spHand) === 'l' ? 'L' : 'R';
    return ctx._l10SpHandMap[tk + ':' + hand] || null;
  }

  function teamL10SpHandGamesMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      if (!row) return;
      var team = S && S.teamKey
        ? S.teamKey(pick(row, ['team', 'Tm', 'Team']))
        : String(pick(row, ['team']) || '').toUpperCase();
      var hand = String(pick(row, ['opp_starter_hand', 'opp starter hand', 'hand']) || '').trim().toUpperCase();
      if (!team || (hand !== 'R' && hand !== 'L')) return;
      var key = team + ':' + hand;
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    Object.keys(map).forEach(function(key) {
      map[key].sort(function(a, b) {
        return String(pick(b, ['date', 'Date'])).localeCompare(String(pick(a, ['date', 'Date'])));
      });
    });
    return map;
  }

  function lineupL10GamesList(ctx, team, spHand) {
    if (!ctx._l10SpHandGamesMap) {
      ctx._l10SpHandGamesMap = teamL10SpHandGamesMap(_pack.teamL10SpHandGames || []);
    }
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
    var hand = spHandFilter(spHand) === 'l' ? 'L' : 'R';
    return (ctx._l10SpHandGamesMap[tk + ':' + hand] || []).filter(function(g) {
      var gh = String(pick(g, ['opp_starter_hand', 'opp starter hand']) || '').trim().toUpperCase();
      if (gh && gh !== hand) return false;
      var pa = num(pick(g, ['vs_sp_pa', 'vs sp pa']));
      return pa != null && pa > 0;
    });
  }

  function shortPitcherName(name) {
    var raw = String(name || '').trim();
    if (!raw) return '—';
    if (raw.indexOf(',') >= 0) {
      var parts = raw.split(',');
      raw = parts.slice(1).join(',').trim() + ' ' + parts[0].trim();
    }
    var bits = raw.split(/\s+/).filter(Boolean);
    if (bits.length < 2) return raw.toUpperCase();
    return bits[0].charAt(0).toUpperCase() + '. ' + bits[bits.length - 1].toUpperCase();
  }

  function formatShortDate(raw) {
    if (!raw) return '—';
    var s = String(raw).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return parseInt(m[2], 10) + '/' + parseInt(m[3], 10);
    return s;
  }

  function formatIpCell(raw) {
    if (raw == null || raw === '') return '—';
    var n = num(raw);
    if (n == null) return String(raw);
    var whole = Math.floor(n);
    var thirds = Math.round((n - whole) * 3);
    if (thirds === 0) return String(whole);
    if (thirds === 3) return String(whole + 1);
    return whole + ' ' + thirds + '/3';
  }

  function aggregateVsSpSummary(games) {
    if (!games || !games.length) return null;
    var totals = { ab: 0, h: 0, bb: 0, ibb: 0, hbp: 0, sf: 0, hr: 0, d2: 0, d3: 0 };
    var qs = 0;
    games.forEach(function(g) {
      totals.ab += num(pick(g, ['vs_sp_ab', 'vs sp ab'])) || 0;
      totals.h += num(pick(g, ['vs_sp_h', 'vs sp h'])) || 0;
      totals.bb += num(pick(g, ['vs_sp_bb', 'vs sp bb'])) || 0;
      var qsFlag = pick(g, ['opp_quality_start', 'opp quality start']);
      if (qsFlag === true || qsFlag === 'True' || qsFlag === '1' || qsFlag === 1) qs++;
    });
    var pa = totals.ab + totals.bb + totals.hbp + totals.sf;
    if (pa <= 0) return null;
    var woba = null;
    var singles = Math.max(totals.h - totals.hr - totals.d2 - totals.d3, 0);
    var wobaNum = (
      0.690 * totals.bb + 0.690 * totals.ibb + 0.722 * totals.hbp
      + 0.880 * singles + 1.242 * totals.d2 + 1.569 * totals.d3 + 2.015 * totals.hr
    ) / pa;
    if (!isNaN(wobaNum)) woba = Math.round(wobaNum * 1000) / 1000;
    var wrc = woba != null ? Math.round((woba / 0.320) * 100) : null;
    var ops = null;
    if (woba != null) ops = Math.round((woba / 0.320) * 1.28 * 1000) / 1000;
    var pitchScore = num(pick(games[0], ['pitch_score_against']));
    return {
      l10Games: games.length,
      qs: games.length ? Math.round((qs / games.length) * 1000) / 10 : null,
      wrc: wrc,
      ops: ops,
      woba: woba,
      l10VsSpPa: pa
    };
  }

  function pctFromResults(raw) {
    var n = num(raw);
    if (n == null) return null;
    if (n > 0 && n <= 1.5) return Math.round(n * 1000) / 10;
    return Math.round(n * 10) / 10;
  }

  function lineupL10FormRow(luSide, ctx, team, spHand) {
    var base = Object.assign({}, luSide && luSide.row ? luSide.row : {});
    var l10 = lineupL10Row(ctx, team, spHand);
    if (!l10) return base;
    var games = num(pick(l10, ['games', 'Games']));
    if (games == null || games < 1) return base;
    var qsPct = pctFromResults(pick(l10, ['qs_against_pct', 'qs against pct', 'QS% Allowed']));
    var wrc = num(pick(l10, ['wrc_plus', 'wrc+', 'wRC+']));
    var ops = num(pick(l10, ['ops', 'OPS']));
    var woba = num(pick(l10, ['woba', 'wOBA']));
    var pitchScore = num(pick(l10, ['pitch_score_against', 'pitch score against', 'Pitch Score Against']));
    var pa = num(pick(l10, ['vs_sp_pa', 'vs sp pa']));
    if (qsPct != null) base.qs = qsPct;
    if (wrc != null) base.wrc = wrc;
    if (ops != null) base.ops = ops;
    if (woba != null) base.woba = woba;
    if (pitchScore != null) base.pitchScore = pitchScore;
    var k9Faced = num(pick(l10, ['sp_k9_faced', 'sp k9 faced']));
    var bb9Faced = num(pick(l10, ['sp_bb9_faced', 'sp bb9 faced']));
    var whipFaced = num(pick(l10, ['sp_whip_faced', 'sp whip faced']));
    var xfipFaced = num(pick(l10, ['sp_xfip_faced', 'sp xfip faced']));
    if (k9Faced != null) base.l10K9Faced = k9Faced;
    if (bb9Faced != null) base.l10Bb9Faced = bb9Faced;
    if (whipFaced != null) base.l10WhipFaced = whipFaced;
    if (xfipFaced != null) base.l10XfipFaced = xfipFaced;
    base.l10Games = games;
    base.l10VsSpPa = pa;
    return base;
  }

  function lineupFilter(spHand) {
    if (!S || !S.createFilterState) {
      return { hand: spHandFilter(spHand), location: 'all', pitcher: 'sp', batSide: 'both', segment: 'full', window: 'YTD' };
    }
    return S.createFilterState({
      hand: spHandFilter(spHand),
      location: 'all',
      pitcher: 'sp',
      batSide: 'both',
      segment: 'full',
      window: 'YTD'
    });
  }

  function pitcherFilter(pitcherSide) {
    var loc = pitcherSide === 'home' ? 'home' : 'away';
    if (!S || !S.createFilterState) {
      return { batSide: 'both', location: loc, segment: 'full', window: 'L14' };
    }
    return S.createFilterState({
      batSide: 'both',
      location: loc,
      segment: 'full',
      window: 'L14'
    });
  }

  function lineupFormCaption(spHand, l10Row, lineupTeam) {
    var handLbl = handLabel(spHand);
    var games = l10Row && l10Row.l10Games != null ? l10Row.l10Games : LINEUP_GAMES;
    var teamLbl = lineupTeam ? String(lineupTeam).toUpperCase() + ' bats vs ' + handLbl + ' starters' : ('Last ' + games + ' vs ' + handLbl);
    return teamLbl + ' · stats vs opposing starter only';
  }

  function filterCaption(f) {
    return 'L10 vs SP';
  }

  function normPitcherName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function pitcherGamelog(name, limit) {
    var key = canonicalPlayerName(name);
    if (!key) return [];
    var rows = (_pack.spGameLog || []).filter(function(r) {
      var rowName = canonicalPlayerName(pick(r, ['pitcher_name', 'Name', 'Pitcher']));
      if (rowName === key) return true;
      var last = key.split(' ').pop();
      if (!last || last.length < 3) return false;
      return rowName.split(' ').pop() === last && rowName.charAt(0) === key.charAt(0);
    });
    return rows.slice().sort(function(a, b) {
      return String(pick(b, ['date', 'Date'])).localeCompare(String(pick(a, ['date', 'Date'])));
    }).slice(0, limit == null ? STARTS_LIMIT : limit);
  }

  function summarizeStarts(starts) {
    if (!starts || !starts.length) return null;
    var totalIp = 0, totalK = 0, totalBb = 0, totalEr = 0, totalHr = 0, totalH = 0, totalBf = 0;
    var qs = 0, outsBefore5 = 0;
    starts.forEach(function(g) {
      var ip = parseIp(pick(g, ['IP', 'ip']));
      var er = num(pick(g, ['ER', 'er'])) || 0;
      var k = num(pick(g, ['K'])) || 0;
      var bb = num(pick(g, ['BB'])) || 0;
      var hr = num(pick(g, ['HR'])) || 0;
      var h = num(pick(g, ['H'])) || 0;
      var bf = num(pick(g, ['batters_faced', 'batters faced', 'BF']));
      if (bf == null || bf === 0) bf = k + bb + h;
      totalIp += ip;
      totalK += k;
      totalBb += bb;
      totalEr += er;
      totalHr += hr;
      totalH += h;
      totalBf += bf;
      if (ip >= 6 && er <= 3) qs++;
      if (ip >= 5) outsBefore5++;
    });
    var n = starts.length;
    var whip = totalIp > 0 ? (totalH + totalBb) / totalIp : null;
    var hr9 = totalIp > 0 ? (totalHr / totalIp) * 9 : null;
    return {
      starts: n,
      k9: totalIp > 0 ? Math.round((totalK / totalIp) * 9 * 10) / 10 : null,
      bb9: totalIp > 0 ? Math.round((totalBb / totalIp) * 9 * 10) / 10 : null,
      whip: whip != null ? Math.round(whip * 100) / 100 : null,
      era: totalIp > 0 ? Math.round((totalEr / totalIp) * 9 * 100) / 100 : null,
      qsRate: Math.round((qs / n) * 100),
      kPct: totalBf > 0 ? Math.round((totalK / totalBf) * 1000) / 10 : null,
      bbPct: totalBf > 0 ? Math.round((totalBb / totalBf) * 1000) / 10 : null,
      hr9: hr9 != null ? Math.round(hr9 * 100) / 100 : null
    };
  }

  function winPctFromLog(log) {
    var w = 0, d = 0;
    (log || []).forEach(function(g) {
      var res = String(pick(g, ['team_result', 'Team_Result', 'Team Result', 'result', 'dec', 'decision', 'Dec']) || '')
        .trim().toUpperCase();
      if (!res) return;
      var ch = res.charAt(0);
      if (ch === 'W') { w++; d++; }
      else if (ch === 'L') d++;
    });
    return d ? Math.round((w / d) * 1000) / 10 : null;
  }

  function spWinPct(comp) {
    return winPctFromLog(comp && comp.log);
  }

  function extendedPitcherStats(row, met) {
    met = met || {};
    var kPct = normalizePct(met.kPct != null ? met.kPct : pick(row, ['K_pct', 'K%', 'k_pct']));
    var bbPct = normalizePct(met.bbPct != null ? met.bbPct : pick(row, ['BB_pct', 'BB%', 'bb_pct']));
    var whip = num(pick(row, ['WHIP', 'whip']));
    var k9 = num(pick(row, ['K/9', 'K9', 'k9'])) || k9FromPct(kPct);
    var bb9 = num(pick(row, ['BB/9', 'BB9', 'bb9'])) || k9FromPct(bbPct);
    var xfip = num(pick(row, ['xFIP', 'xfip']));
    var fip = num(pick(row, ['FIP', 'fip']));
    if (xfip == null) xfip = fip;
    var ops = scaleRate(pick(row, ['OPS', 'ops_allowed', 'OPS_allowed']));
    var woba = wobaFromProfile(row);
    return { whip: whip, k9: k9, bb9: bb9, xfip: xfip, fip: fip, woba: woba, ops: ops, kPct: kPct, bbPct: bbPct };
  }

  function lineupPitchingAgainst(ctx, lineupTeam, luRow, spHand) {
    luRow = luRow || {};
    if (luRow.l10K9Faced != null || luRow.l10Bb9Faced != null) {
      return {
        k9: luRow.l10K9Faced,
        bb9: luRow.l10Bb9Faced,
        whip: luRow.l10WhipFaced,
        xfip: luRow.l10XfipFaced
      };
    }
    var split = lineupSplitRow(ctx, lineupTeam, spHand) || {};
    var tk = S && S.teamKey ? S.teamKey(lineupTeam) : String(lineupTeam || '').toUpperCase();
    var pals = ctx.pals && ctx.pals[tk];
    var kPct = split.k;
    var bbPct = split.bb;
    var pitchScore = luRow.pitchScore != null ? luRow.pitchScore : null;
    var xfip = pals && pals.xfip;
    return {
      k9: k9FromPct(kPct),
      bb9: k9FromPct(bbPct),
      whip: whipFromPitchScore(pitchScore),
      xfip: xfip
    };
  }

  function pitchScoreFromLogSummary(logSum) {
    if (!logSum || logSum.kPct == null) return null;
    if (S && S.computePitchScoreFromRates) {
      return S.computePitchScoreFromRates(logSum.kPct, logSum.bbPct, logSum.hr9, null);
    }
    return null;
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
      decimals: opts.decimals == null ? 1 : opts.decimals
    };
  }

  function buildDuelMetrics(comp, ctx, lineupTeam) {
    var lu = comp.lu && comp.lu.row ? comp.lu.row : {};
    var mo = (comp.sp && comp.sp.metricsObj) || {};
    var ext = comp.spExt || {};
    var logSum = comp.logSum;
    var against = lineupPitchingAgainst(ctx, lineupTeam, lu, comp.spHand);

    var spK9 = (logSum && logSum.k9 != null) ? logSum.k9 : (ext.k9 != null ? ext.k9 : k9FromPct(ext.kPct != null ? ext.kPct : mo.kPct));
    var spBb9 = (logSum && logSum.bb9 != null) ? logSum.bb9 : (ext.bb9 != null ? ext.bb9 : k9FromPct(ext.bbPct != null ? ext.bbPct : mo.bbPct));
    var spWhip = (logSum && logSum.whip != null) ? logSum.whip : ext.whip;
    var spXfip = ext.xfip != null ? ext.xfip : (mo.fip != null ? mo.fip : null);
    var spWoba = ext.woba;
    var spOps = ext.ops;
    var spQs = logSum ? logSum.qsRate : num(pick(comp.sp && comp.sp.row, ['QS_pct', 'qs_pct', 'QS%']));
    var spPitchScore = pitchScoreFromLogSummary(logSum);
    if (spPitchScore == null && comp.sp) spPitchScore = comp.sp.primary;

    return [
      metricRow('QS% Allowed / QS%', lu.qs, spQs, { ctx: 'pct', invertA: true }),
      metricRow('Pitch Score Against / Pitching Score', lu.pitchScore, spPitchScore, { ctx: 'pitching', invertA: true }),
      metricRow('K/9', against.k9, spK9, { ctx: 'pitching', invertA: true }),
      metricRow('BB/9', against.bb9, spBb9, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('WHIP', against.whip, spWhip, { ctx: 'whip', invertA: true, invertB: true }),
      metricRow('OPS / OPS Allowed', lu.ops, spOps, { ctx: 'ops', invertB: true, decimals: 3 }),
      metricRow('xFIP', against.xfip, spXfip, { ctx: 'pitching', invertA: true, invertB: true }),
      metricRow('wOBA / wOBA Allowed', lu.woba, spWoba, { ctx: 'woba', invertB: true, decimals: 3 })
    ];
  }

  function compareMetricRowsHtml(rows, decimalsOverride) {
    return (rows || []).map(function(row) {
      var va = row.valA;
      var vb = row.valB;
      var d = decimalsOverride != null ? decimalsOverride : (row.decimals == null ? 1 : row.decimals);
      var winner = 'none';
      if (va != null && vb != null && !isNaN(va) && !isNaN(vb) && Math.abs(va - vb) >= 0.001) {
        var aWins = row.higherBetter ? va > vb : va < vb;
        winner = aWins ? 'a' : 'b';
      }
      return '<div class="mc-lvp-metric-row">'
        + '<span class="mc-lvp-metric-val mc-lvp-metric-val--a' + (winner === 'a' ? ' mc-lvp-metric-val--win' : '') + '">'
        + metricChip(va, row.ctx || 'osi', row.invertA, d) + '</span>'
        + '<span class="mc-lvp-metric-label">' + esc(row.label) + '</span>'
        + '<span class="mc-lvp-metric-val mc-lvp-metric-val--b' + (winner === 'b' ? ' mc-lvp-metric-val--win' : '') + '">'
        + metricChip(vb, row.ctx || 'osi', row.invertB, d) + '</span>'
        + '</div>';
    }).join('');
  }

  function lineupL10GamesTableHtml(ctx, team, spHand) {
    var games = lineupL10GamesList(ctx, team, spHand);
    var handLbl = handLabel(spHand);
    if (!games.length) {
      var hasPack = (_pack.teamL10SpHandGames || []).length > 0;
      var msg = hasPack
        ? ('No last-10 vs ' + handLbl + ' with vs-starter plate appearances for ' + esc(team) + ' yet.')
        : 'Team L10 vs SP game log unavailable — reload after pipeline publishes Team_L10_SP_Games.';
      return '<p class="ca-helper mc-lvp-empty">' + msg + '</p>';
    }
    var body = games.map(function(g) {
      var dt = formatShortDate(pick(g, ['date', 'Date']));
      var opp = pick(g, ['opp', 'Opp', 'opponent']);
      var ha = String(pick(g, ['home_away', 'home away']) || '').trim().toUpperCase();
      var loc = ha === 'HOME' ? 'H' : (ha === 'AWAY' ? 'A' : '—');
      var pitcher = shortPitcherName(pick(g, ['opp_starter_name', 'opp starter name', 'pitcher_name']));
      var runs = num(pick(g, ['runs_off_sp', 'runs off sp']));
      if (runs == null) runs = num(pick(g, ['opp_starter_er', 'opp starter er', 'ER']));
      var h = num(pick(g, ['vs_sp_h', 'vs sp h']));
      var bb = num(pick(g, ['vs_sp_bb', 'vs sp bb']));
      var ip = pick(g, ['opp_starter_ip', 'opp starter ip', 'IP']);
      var er = pick(g, ['opp_starter_er', 'opp starter er', 'ER']);
      var logo = S && S.teamLogo ? S.teamLogo(opp, 16) : '';
      return '<tr>'
        + '<td class="mc-lvp-date">' + esc(dt) + '</td>'
        + '<td class="num mc-lvp-loc">' + esc(loc) + '</td>'
        + '<td><span class="mc-lvp-opp">' + logo + ' ' + esc(opp) + '</span></td>'
        + '<td class="mc-lvp-pitcher">' + esc(pitcher) + '</td>'
        + '<td class="num">' + (runs != null ? esc(runs) : '—') + '</td>'
        + '<td class="num">' + esc(formatIpCell(ip)) + '</td>'
        + '<td class="num">' + esc(er != null ? er : '—') + '</td>'
        + '<td class="num">' + (h != null ? esc(h) : '—') + '</td>'
        + '<td class="num">' + (bb != null ? esc(bb) : '—') + '</td>'
        + '</tr>';
    }).join('');
    return '<div class="mc-lvp-table-wrap mc-lvp-table-wrap--games"><table class="mc-lvp-table mc-lvp-table--l10games">'
      + '<colgroup><col class="mc-l10-col-date"><col class="mc-l10-col-loc"><col class="mc-l10-col-opp">'
      + '<col class="mc-l10-col-pitcher"><col span="5" class="mc-l10-col-stat"></colgroup>'
      + '<thead><tr>'
      + '<th>Date</th><th>Loc</th><th>Opp</th><th>Pitcher</th>'
      + '<th>Runs</th><th>IP</th><th>ER</th><th>H</th><th>BB</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function lineupPerformanceHtml(luSide, spHand, luFilter, l10Row, ctx, lineupTeam) {
    var games = ctx && lineupTeam ? lineupL10GamesList(ctx, lineupTeam, spHand) : [];
    var fromGames = aggregateVsSpSummary(games);
    var row = Object.assign({}, l10Row || (luSide && luSide.row ? luSide.row : {}));
    if (fromGames) {
      Object.keys(fromGames).forEach(function(k) {
        if (fromGames[k] != null && !isNaN(fromGames[k])) row[k] = fromGames[k];
      });
    }
    var handLbl = handLabel(spHand);
    var gameCount = games.length || (row.l10Games != null ? row.l10Games : LINEUP_GAMES);
    var title = lineupTeam ? String(lineupTeam).toUpperCase() + ' bats vs ' + handLbl : ('Lineup vs ' + handLbl);
    var purpose = 'Stats vs opposing starter only · last ' + gameCount + ' games';
    var cols = [
      { label: 'QS% Allowed', key: 'qs', ctx: 'pct', inv: true },
      { label: 'wRC+', key: 'wrc', ctx: 'wrc', dec: 0 },
      { label: 'OPS', key: 'ops', ctx: 'ops', dec: 3 },
      { label: 'wOBA', key: 'woba', ctx: 'woba', dec: 3 }
    ];
    var gameTable = ctx && lineupTeam
      ? lineupL10GamesTableHtml(ctx, lineupTeam, spHand)
      : '';
    return lvpPanelHead(title, purpose)
      + perfSummaryTableHtml(cols, row)
      + gameTable;
  }

  function pitcherStartsHtml(spName, log, summary) {
    var n = log && log.length ? log.length : 0;
    var purpose = 'Last ' + n + ' starts';
    if (!log || !log.length) {
      return lvpPanelHead(spName, purpose)
        + '<p class="ca-helper mc-lvp-empty">No starts in SP_Game_Log for ' + esc(spName) + '.</p>';
    }
    var sumRow = summary ? {
      era: summary.era,
      k9: summary.k9,
      bb9: summary.bb9,
      whip: summary.whip,
      qsRate: summary.qsRate
    } : {};
    var sumCols = [
      { label: 'WHIP', key: 'whip', ctx: 'whip', inv: true, dec: 2 },
      { label: 'BB/9', key: 'bb9', ctx: 'bb9', inv: true, dec: 1 },
      { label: 'K/9', key: 'k9', ctx: 'k9', dec: 1 },
      { label: 'ERA', key: 'era', ctx: 'era', inv: true, dec: 2 }
    ];
    var body = log.map(function(g) {
      var dt = pick(g, ['date', 'Date']);
      var opp = pick(g, ['opponent_team', 'opponent team', 'Opponent']);
      var ip = pick(g, ['IP', 'ip']);
      var er = pick(g, ['ER', 'er']);
      var k = pick(g, ['K']);
      var bb = pick(g, ['BB']);
      var hr = pick(g, ['HR']);
      var logo = A && A.teamLogoImg ? A.teamLogoImg(opp, 16) : '';
      return '<tr>'
        + '<td class="num">' + esc(hr) + '</td>'
        + '<td class="num">' + esc(bb) + '</td>'
        + '<td class="num">' + esc(k) + '</td>'
        + '<td class="num">' + esc(er) + '</td>'
        + '<td class="num">' + esc(ip) + '</td>'
        + '<td><span class="mc-lvp-opp">' + logo + ' ' + esc(opp) + '</span></td>'
        + '<td class="mc-lvp-date">' + esc(dt) + '</td>'
        + '</tr>';
    }).join('');
    return lvpPanelHead(spName, purpose)
      + perfSummaryTableHtml(sumCols, sumRow)
      + '<div class="mc-lvp-table-wrap mc-lvp-table-wrap--games"><table class="mc-lvp-table mc-lvp-table--starts mc-lvp-table--starts-mirror">'
      + '<thead><tr>'
      + '<th>HR</th><th>BB</th><th>K</th><th>ER</th><th>IP</th><th>Opp</th><th>Date</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function statCompareHtml(lineupTeam, spName, pitcherTeam, rows) {
    var luLogo = S && S.teamLogo ? S.teamLogo(lineupTeam, 22) : '';
    var spLogo = S && S.teamLogo ? S.teamLogo(pitcherTeam, 22) : '';
    return sectionHead('Stat Comparison', 'Lineup offense vs starting pitcher — green favors that side for the metric context.')
      + '<div class="mc-lvp-stat-head">'
      + '<div class="mc-lvp-stat-side mc-lvp-stat-side--a">' + luLogo + '<span>' + esc(lineupTeam) + ' Lineup</span></div>'
      + '<div class="mc-lvp-stat-side mc-lvp-stat-side--b">' + spLogo + '<span>' + esc(spName) + '</span></div>'
      + '</div>'
      + '<div class="mc-lvp-metrics">' + compareMetricRowsHtml(rows) + '</div>';
  }

  function buildFallbackComp(ctx, lineupSide, pitcherSide) {
    var m = ctx.m;
    var lineupTeam = lineupSide === 'home' ? m.home : m.away;
    var pitcherTeam = pitcherSide === 'home' ? m.home : m.away;
    var spName = pitcherSide === 'home' ? m.homeSP : m.awaySP;
    var spHand = pitcherSide === 'home' ? m.homeHand : m.awayHand;
    var luF = lineupFilter(spHand);
    var l10Form = lineupL10FormRow({ row: {} }, ctx, lineupTeam, spHand);
    var log = pitcherGamelog(spName, STARTS_LIMIT);
    var logSum = summarizeStarts(log);
    return {
      lu: { entity: 'lineup', row: l10Form },
      sp: { entity: 'pitcher', row: {} },
      log: log,
      logSum: logSum,
      spExt: {},
      luFilter: luF,
      spHand: spHand,
      lineupTeam: lineupTeam,
      pitcherTeam: pitcherTeam,
      spName: spName,
      lineupSide: lineupSide,
      fallback: true
    };
  }

  function resolveCompare(ctx, lineupSide, pitcherSide) {
    if (!CM || !CM.resolveBoth || !S) return Promise.resolve(null);
    var m = ctx.m;
    var lineupTeam = lineupSide === 'home' ? m.home : m.away;
    var pitcherTeam = pitcherSide === 'home' ? m.home : m.away;
    var spName = pitcherSide === 'home' ? m.homeSP : m.awaySP;
    var spHand = pitcherSide === 'home' ? m.homeHand : m.awayHand;
    var luF = lineupFilter(spHand);
    var spF = pitcherFilter(pitcherSide);

    if (!global.LIVE_DATA) global.LIVE_DATA = {};
    global.LIVE_DATA.spMetricSplits = _pack.spMetricSplits || [];
    if (ctx.data && ctx.data.pitching) {
      global.LIVE_DATA.pitching = Object.keys(ctx.data.pitching).map(function(k) { return ctx.data.pitching[k]; });
    }

    var deps = {
      findSpProfile: function(name) {
        return S.findSpProfile(ctx.data.spProfiles, name, pitcherTeam);
      }
    };

    return CM.resolveBoth('lineup-sp',
      { key: lineupTeam, filter: luF },
      { key: spName, filter: spF },
      deps
    ).then(function(res) {
      var lu = res.dataA && res.dataA.entity === 'lineup' ? res.dataA : res.dataB;
      var sp = res.dataA && res.dataA.entity === 'pitcher' ? res.dataA : res.dataB;
      var l10Form = lineupL10FormRow(lu, ctx, lineupTeam, spHand);
      if (lu) {
        lu = Object.assign({}, lu, { row: l10Form });
      }
      var log = pitcherGamelog(spName, STARTS_LIMIT);
      var logSum = summarizeStarts(log);
      var spExt = extendedPitcherStats(sp && sp.row, sp && sp.metricsObj);
      return {
        lu: lu,
        sp: sp,
        log: log,
        logSum: logSum,
        spExt: spExt,
        luFilter: luF,
        spHand: spHand,
        lineupTeam: lineupTeam,
        pitcherTeam: pitcherTeam,
        spName: spName,
        lineupSide: lineupSide
      };
    }).catch(function(err) {
      console.warn('[matchup_lvp] resolve failed', err);
      return buildFallbackComp(ctx, lineupSide, pitcherSide);
    });
  }

  function renderPerformanceBody(comp, ctx) {
    if (!comp) {
      return '<div class="mc-lvp-performance ca-board">'
        + '<p class="ca-helper">Performance comparison unavailable — check sheet data and reload.</p></div>';
    }
    var metrics = buildDuelMetrics(comp, ctx || {}, comp.lineupTeam);
    return '<div class="mc-lvp-performance ca-board">'
      + '<h3 class="mc-lvp-block-title">Performance Comparison</h3>'
      + '<p class="mc-pane-desc">Lineup last ' + LINEUP_GAMES + ' games vs same-handed SPs (stats vs starter only) · pitcher last ' + STARTS_LIMIT + ' starts · head-to-head stat matrix.</p>'
      + '<div class="mc-grid-2 mc-lvp-perf-grid">'
      + '<div class="mc-lvp-perf-panel mc-lvp-perf-panel--lineup">' + lineupPerformanceHtml(comp.lu, comp.spHand, comp.luFilter, comp.lu && comp.lu.row, ctx, comp.lineupTeam) + '</div>'
      + '<div class="mc-lvp-perf-panel mc-lvp-perf-panel--pitcher">' + pitcherStartsHtml(comp.spName, comp.log, comp.logSum) + '</div>'
      + '</div>'
      + statCompareHtml(comp.lineupTeam, comp.spName, comp.pitcherTeam, metrics)
      + pitchMixHtml(comp, ctx)
      + '</div>';
  }

  function refreshPitchMixData(opts) {
    if (!opts) return _pack.pitchMix;
    _pack.pitchMix = buildPitchMixIndex({
      pitcherL14: opts.pitchMixPitcherL14,
      pitcherYtd: opts.pitchMixPitcher,
      teamBattingL14: opts.pitchMixTeamBattingL14,
      teamBattingYtd: opts.pitchMixTeamBatting,
      batterL14: opts.pitchMixBatterL14
    });
    return _pack.pitchMix;
  }

  function hasPitchMixData() {
    return !!(_pack.pitchMix && _pack.pitchMix.ready);
  }

  function hydrate(container, ctx, lineupSide, pitcherSide) {
    if (!container) return;
    if (ctx) {
      delete ctx._l10SpHandMap;
      delete ctx._l10SpHandGamesMap;
    }
    var token = ++_hydrateToken;
    container.innerHTML = '<p class="ca-helper">Loading performance comparison…</p>';
    ensurePitchMixLoaded(ctx).then(function() {
      return resolveCompare(ctx, lineupSide, pitcherSide);
    }).then(function(comp) {
      if (token !== _hydrateToken) return;
      container.innerHTML = renderPerformanceBody(comp, ctx);
    });
  }

  global.MatchupLvP = {
    prepareData: prepareData,
    refreshPitchMixData: refreshPitchMixData,
    ensurePitchMixLoaded: ensurePitchMixLoaded,
    hasPitchMixData: hasPitchMixData,
    pitchMixTabKeys: pitchMixTabKeys,
    hydrate: hydrate,
    resolveCompare: resolveCompare,
    renderPerformanceBody: renderPerformanceBody
  };
})(typeof window !== 'undefined' ? window : this);
