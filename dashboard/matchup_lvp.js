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
    teamL10SpHand: []
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
    if (A && A.caSectionHeadHtml) return A.caSectionHeadHtml(title, sub);
    return '<h3 class="mc-lvp-section-title">' + esc(title) + '</h3>'
      + (sub ? '<p class="mc-pane-desc">' + esc(sub) + '</p>' : '');
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

  function spWinPct(comp, ctx) {
    var fromLog = winPctFromLog(comp.log);
    if (fromLog != null) return fromLog;
    return null;
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

  function pitchMixRowStats(row, side) {
    if (!row) return null;
    var stats = {
      label: pitchLabel(row),
      key: pitchTypeKey(row),
      usage: num(pick(row, ['pitch_pct', 'pitch_pct', 'Pitch Pct', 'usage_pct'])),
      whiff: num(pick(row, ['whiff_rate', 'Whiff Rate'])),
      csw: num(pick(row, ['csw_rate', 'CSW Rate'])),
      xwoba: num(pick(row, ['xwoba', 'xWOBA', 'xwOBA'])),
      velo: num(pick(row, ['avg_release_speed', 'Avg Release Speed', 'velocity']))
    };
    if (side === 'bat') {
      stats.avg = num(pick(row, ['batting_avg', 'Batting Avg', 'avg', 'BA']));
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
        var ba = num(pick(row, ['batting_avg', 'Batting Avg', 'avg', 'BA']));
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
      var bat = lu || (team ? { label: team.label, avg: team.avg, whiff: team.whiff, xwoba: team.xwoba } : null);
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
        + '<td class="num">' + metricChip(sp.usage, 'pct', false, 1) + '</td>'
        + '<td class="num">' + metricChip(sp.whiff, 'pitching', false, 1) + '</td>'
        + '<td class="num">' + metricChip(sp.xwoba, 'woba', true, 3) + '</td>'
        + '<td class="num mc-lvp-pitch-divider">' + metricChip(bat.avg, 'avg', false, 3) + '</td>'
        + '<td class="num">' + metricChip(bat.whiff, 'pitching', true, 1) + '</td>'
        + '<td class="num">' + metricChip(bat.xwoba, 'woba', false, 3) + '</td>'
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
      + '<div class="mc-lvp-table-wrap"><table class="mc-lvp-table mc-lvp-table--pitchmix"><thead>'
      + '<tr><th rowspan="2">Pitch</th>'
      + '<th colspan="3" class="mc-lvp-pitchmix-group mc-lvp-pitchmix-group--sp">Pitcher</th>'
      + '<th colspan="3" class="mc-lvp-pitchmix-group mc-lvp-pitchmix-group--lu">Lineup / Team</th>'
      + '</tr><tr>'
      + '<th>Usage%</th><th>Whiff%</th><th>xwOBA</th>'
      + '<th>Avg</th><th>Whiff%</th><th>xwOBA</th>'
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
    var winPct = pctFromResults(pick(l10, ['win_pct', 'win pct', 'Win%']));
    var qsPct = pctFromResults(pick(l10, ['qs_against_pct', 'qs against pct', 'QS% Allowed']));
    var wrc = num(pick(l10, ['wrc_plus', 'wrc+', 'wRC+']));
    var ops = num(pick(l10, ['ops', 'OPS']));
    var woba = num(pick(l10, ['woba', 'wOBA']));
    var pitchScore = num(pick(l10, ['pitch_score_against', 'pitch score against', 'Pitch Score Against']));
    var pa = num(pick(l10, ['vs_sp_pa', 'vs sp pa']));
    if (winPct != null) base.winPct = winPct;
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

  function lineupFormCaption(spHand, l10Row) {
    var handLbl = handLabel(spHand);
    var games = l10Row && l10Row.l10Games != null ? l10Row.l10Games : LINEUP_GAMES;
    return 'Last ' + games + ' · vs SP · vs ' + handLbl;
  }

  function filterCaption(f) {
    return 'L10 vs SP';
  }

  function normPitcherName(name) {
    return S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
  }

  function pitcherGamelog(name, limit) {
    var key = normPitcherName(name);
    return (_pack.spGameLog || [])
      .filter(function(r) {
        return normPitcherName(pick(r, ['pitcher_name', 'Name', 'Pitcher'])) === key;
      })
      .slice()
      .sort(function(a, b) {
        return String(pick(b, ['date', 'Date'])).localeCompare(String(pick(a, ['date', 'Date'])));
      })
      .slice(0, limit == null ? STARTS_LIMIT : limit);
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
      var res = String(pick(g, ['team_result', 'Team_Result', 'result', 'dec', 'decision', 'Dec']) || '')
        .trim().charAt(0).toUpperCase();
      if (res === 'W') { w++; d++; }
      else if (res === 'L') d++;
    });
    return d ? Math.round((w / d) * 1000) / 10 : null;
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
    var spWin = spWinPct(comp, ctx);
    var spPitchScore = pitchScoreFromLogSummary(logSum);
    if (spPitchScore == null && comp.sp) spPitchScore = comp.sp.primary;

    return [
      metricRow('Win%', lu.winPct, spWin, { ctx: 'pct' }),
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

  function lineupPerformanceHtml(luSide, spHand, luFilter, l10Row) {
    var row = l10Row || (luSide && luSide.row ? luSide.row : {});
    var cap = lineupFormCaption(spHand, row);
    var cols = [
      { label: 'Win%', key: 'winPct', ctx: 'pct' },
      { label: 'QS% Allowed', key: 'qs', ctx: 'pct', inv: true },
      { label: 'wRC+', key: 'wrc', ctx: 'wrc', dec: 0 },
      { label: 'OPS', key: 'ops', ctx: 'ops', dec: 3 },
      { label: 'wOBA', key: 'woba', ctx: 'woba', dec: 3 },
      { label: 'Pitch Score Against', key: 'pitchScore', ctx: 'pitching', inv: true }
    ];
    var head = cols.map(function(c) { return '<th>' + esc(c.label) + '</th>'; }).join('');
    var cells = cols.map(function(c) {
      return '<td class="num">' + metricChip(row[c.key], c.ctx, c.inv, c.dec == null ? 1 : c.dec) + '</td>';
    }).join('');
    return sectionHead('Lineup Recent Form', cap)
      + '<div class="mc-lvp-table-wrap"><table class="mc-lvp-table"><thead><tr>' + head + '</tr></thead>'
      + '<tbody><tr>' + cells + '</tr></tbody></table></div>';
  }

  function pitcherStartsHtml(spName, log, summary) {
    var cap = 'Last ' + (log && log.length ? log.length : 0) + ' starts';
    if (!log || !log.length) {
      return sectionHead('Pitcher Last 10 Starts', cap)
        + '<p class="ca-helper mc-lvp-empty">No starts in SP_Game_Log for ' + esc(spName) + '.</p>';
    }
    var sumFooter = summary
      ? '<div class="mc-lvp-starts-sum">'
        + '<span class="mc-lvp-starts-sum-label">L' + log.length + ' avg</span>'
        + '<span>ERA <strong>' + fmt(summary.era, 2) + '</strong></span>'
        + '<span>K/9 <strong>' + fmt(summary.k9, 1) + '</strong></span>'
        + '<span>BB/9 <strong>' + fmt(summary.bb9, 1) + '</strong></span>'
        + '<span>WHIP <strong>' + fmt(summary.whip, 2) + '</strong></span>'
        + '<span>QS% <strong>' + fmt(summary.qsRate, 0) + '%</strong></span>'
        + (winPctFromLog(log) != null ? '<span>Win% <strong>' + fmt(winPctFromLog(log), 1) + '%</strong></span>' : '')
        + '</div>'
      : '';
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
        + '<td class="mc-lvp-date">' + esc(dt) + '</td>'
        + '<td><span class="mc-lvp-opp">' + logo + ' ' + esc(opp) + '</span></td>'
        + '<td class="num">' + esc(ip) + '</td>'
        + '<td class="num">' + esc(er) + '</td>'
        + '<td class="num">' + esc(k) + '</td>'
        + '<td class="num">' + esc(bb) + '</td>'
        + '<td class="num">' + esc(hr) + '</td>'
        + '</tr>';
    }).join('');
    return sectionHead('Pitcher Last 10 Starts', cap)
      + '<div class="mc-lvp-table-wrap"><table class="mc-lvp-table mc-lvp-table--starts"><thead><tr>'
      + '<th>Date</th><th>Opp</th><th>IP</th><th>ER</th><th>K</th><th>BB</th><th>HR</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>'
      + sumFooter;
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
      return null;
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
      + '<div class="mc-lvp-perf-panel">' + lineupPerformanceHtml(comp.lu, comp.spHand, comp.luFilter, comp.lu && comp.lu.row) + '</div>'
      + '<div class="mc-lvp-perf-panel">' + pitcherStartsHtml(comp.spName, comp.log, comp.logSum) + '</div>'
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
