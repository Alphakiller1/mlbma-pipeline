/**
 * Team Profile — offense sections §2–§10 (TEAM_PROFILE_CONTENT_SPEC.md)
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var Mini = global.TeamProfileMini;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pick(row, keys, pickCol) {
    if (!row) return null;
    if (pickCol) {
      var v = pickCol(row, keys);
      return v === '' ? null : v;
    }
    for (var i = 0; i < keys.length; i++) {
      if (row[keys[i]] !== undefined && row[keys[i]] !== '') return row[keys[i]];
    }
    return null;
  }

  function valChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    return '<span class="chip c-na">' + (v != null && !isNaN(v) ? Number(v).toFixed(decimals == null ? 1 : decimals) : '—') + '</span>';
  }

  function phase1Chip(label) {
    return '<span class="tp-metric-chip-only tp-phase1-slot" title="Phase 1 — export not wired" aria-label="' + esc(label) + '">'
      + '<span class="chip c-na">—</span><span class="tp-phase1-tag">Phase 1</span></span>';
  }

  function chipOnly(v, ctx, invert, decimals, label) {
    return '<span class="tp-metric-chip-only"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>'
      + valChip(v, ctx, invert, decimals) + '</span>';
  }

  var METRIC_LABELS = {
    'OSI': { abbr: 'OSI', gloss: 'osi' },
    'RCV': { abbr: 'RCV', gloss: 'rcv' },
    'ABQ': { abbr: 'ABQ', gloss: 'abq' },
    'OBR': { abbr: 'OBR', gloss: 'obr' },
    'projOSI': { abbr: 'proj OSI', gloss: 'projosi' },
    'PP-Gap': { abbr: 'PP-Gap', gloss: 'pp-gap' },
    'wRC+': { abbr: 'wRC+', gloss: 'wrc-plus' },
    'wOBA': { abbr: 'wOBA', gloss: 'woba' },
    'xwOBA': { abbr: 'xwOBA', gloss: 'xwoba' },
    'SLG': { abbr: 'SLG', gloss: 'slg' },
    'HR': { abbr: 'HR', gloss: 'hr' },
    'K%': { abbr: 'K%', gloss: 'k-pct' },
    'BB%': { abbr: 'BB%', gloss: 'bb-pct' },
    'Barrel%': { abbr: 'Barrel%', gloss: 'barrel' },
    'HardHit%': { abbr: 'Hard Hit%', gloss: 'hardhit' },
    'AVG': { abbr: 'AVG', gloss: 'avg' },
    'OBP': { abbr: 'OBP', gloss: 'obp' },
    'OPS': { abbr: 'OPS', gloss: 'ops' },
    'PALS': { abbr: 'PALS', gloss: 'pals' },
    'xFIP Faced': { abbr: 'xFIP Faced', gloss: 'xfip' },
    'Pitch Score Faced': { abbr: 'Pitch Score Faced', gloss: 'pitching-score' },
    'Strength of Schedule': { abbr: 'SOS', gloss: 'pals' },
    'Win%': { abbr: 'Win%', gloss: 'win-pct' },
    'F5 Win%': { abbr: 'F5 Win%', gloss: 'f5-win-pct' },
    'Pitcher Win%': { abbr: 'SP Win%', gloss: 'sp-win-pct' },
    'QS%': { abbr: 'QS%', gloss: 'qs-pct' }
  };

  function metricHeaderCell(key) {
    var m = METRIC_LABELS[key] || { abbr: key, gloss: '' };
    var gloss = m.gloss
      ? '<a class="tp-metric-gloss-link" href="glossary.html#' + esc(m.gloss) + '" title="Definition in glossary">↗</a>'
      : '';
    return '<span class="tp-metric-grid-h">'
      + '<span class="tp-metric-abbr">' + esc(m.abbr) + '</span>'
      + gloss
      + '</span>';
  }

  function metricLabel(key) {
    return METRIC_LABELS[key] || { abbr: key, gloss: '' };
  }

  function rankTone(rank) {
    if (rank == null || isNaN(rank)) return 'neutral';
    if (rank <= 5) return 'elite';
    if (rank <= 12) return 'strong';
    if (rank <= 20) return 'mid';
    return 'weak';
  }

  function teamKeyFromProf(prof, ctx) {
    if (!prof) return '';
    var raw = pick(prof, ['team', 'Team', 'tm'], ctx && ctx.pickCol);
    if (ctx && ctx.teamKey) return ctx.teamKey(raw);
    return String(raw || '').trim().toUpperCase();
  }

  function buildTeamMetricCache(ctx) {
    if (!Mini || !ctx || !ctx.profiles || !ctx.profiles.length) return {};
    var cache = {};
    ctx.profiles.forEach(function(prof) {
      var t = teamKeyFromProf(prof, ctx);
      if (!t) return;
      var miniCtx = {
        pickCol: ctx.pickCol,
        team: t,
        split: ctx.split || 'both',
        window: ctx.window || 'YTD',
        metricsR: ctx.metricsR,
        metricsL: ctx.metricsL,
        batterSplitsR: ctx.batterSplitsR,
        batterSplitsL: ctx.batterSplitsL,
        batters: ctx.batters
      };
      var m = Mini.resolveView(prof, miniCtx);
      var rates = Mini.resolveOffenseRates ? Mini.resolveOffenseRates(prof, miniCtx) : {};
      cache[t] = {
        osi: num(m.osi),
        rcv: num(m.rcv),
        abq: num(m.abq),
        obr: num(m.obr),
        proj: num(m.proj),
        ppGap: num(m.ppGap),
        wrc: num(rates.wrc),
        woba: num(rates.woba),
        xwoba: num(rates.xwoba),
        ops: num(rates.ops),
        hr: num(rates.hr),
        slg: num(rates.slg),
        avg: num(rates.avg),
        k: num(rates.k),
        bb: num(rates.bb),
        obp: num(rates.obp),
        barrel: num(rates.barrel),
        hard: num(rates.hard)
      };
    });
    return cache;
  }

  function leagueRank(cache, team, field, invert) {
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

  var METRIC_FIELD = {
    'OSI': 'osi',
    'RCV': 'rcv',
    'ABQ': 'abq',
    'OBR': 'obr',
    'projOSI': 'proj',
    'PP-Gap': 'ppGap',
    'wRC+': 'wrc',
    'wOBA': 'woba',
    'xwOBA': 'xwoba',
    'OPS': 'ops',
    'HR': 'hr',
    'SLG': 'slg',
    'AVG': 'avg',
    'K%': 'k',
    'BB%': 'bb',
    'OBP': 'obp',
    'Barrel%': 'barrel',
    'HardHit%': 'hard'
  };

  var METRIC_INVERT = {
    'K%': true
  };

  function offenseStatCell(key, v, ctxKey, invert, decimals, rankMeta) {
    rankMeta = rankMeta || {};
    var m = metricLabel(key);
    var glossLink = m.gloss
      ? '<a class="tp-metric-gloss-link" href="glossary.html#' + esc(m.gloss) + '" title="Glossary">↗</a>'
      : '';
    var rank = rankMeta.rank;
    var total = rankMeta.total;
    var rankHtml = rank != null
      ? '<span class="tp-offense-stat__rank tp-offense-stat__rank--' + rankTone(rank) + '" title="League rank">'
        + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span>'
        + (total ? '<span class="tp-offense-stat__rank-of">/' + esc(String(total)) + '</span>' : '')
        + '</span>'
      : '';
    return '<div class="tp-offense-stat" aria-label="' + esc(m.abbr) + '">'
      + '<span class="tp-offense-stat__label">' + esc(m.abbr) + glossLink + '</span>'
      + '<span class="tp-offense-stat__body">'
      + valChip(v, ctxKey, invert, decimals)
      + rankHtml
      + '</span></div>';
  }

  function offenseStatsBand(title, hint, slots, cache, team) {
    var cells = slots.map(function(s) {
      var key = s[0];
      var field = METRIC_FIELD[key];
      var invertRank = METRIC_INVERT[key] || false;
      var rankMeta = field && cache && team
        ? leagueRank(cache, team, field, invertRank)
        : { rank: null, total: null };
      return offenseStatCell(key, s[1], s[2], s[3], s[4], rankMeta);
    }).join('');
    return '<div class="tp-offense-metrics__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(hint) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__row">' + cells + '</div>'
      + '</div>';
  }

  function offenseMetricsPanel(bands, cache, team) {
    return '<div class="tp-offense-metrics">'
      + bands.map(function(b) {
        return offenseStatsBand(b.title, b.hint, b.slots, cache, team);
      }).join('')
      + '</div>';
  }

  function metricTile(key, v, ctx, invert, decimals) {
    var m = metricLabel(key);
    var glossLink = m.gloss
      ? '<a class="tp-metric-gloss-link" href="glossary.html#' + esc(m.gloss) + '" title="Glossary">↗</a>'
      : '';
    return '<article class="tp-metric-tile" aria-label="' + esc(m.abbr) + '">'
      + '<div class="tp-metric-tile__head">'
      + '<span class="tp-metric-tile__name">' + esc(m.abbr) + glossLink + '</span>'
      + '</div>'
      + '<div class="tp-metric-tile__value">' + valChip(v, ctx, invert, decimals) + '</div>'
      + '</article>';
  }

  function metricTileGrid(slots, layout) {
    layout = layout || 'auto';
    return '<div class="tp-metric-tile-grid tp-metric-tile-grid--' + esc(layout) + '">'
      + slots.map(function(s) { return metricTile(s[0], s[1], s[2], s[3], s[4]); }).join('')
      + '</div>';
  }

  function metricTileGroup(title, hint, slots, layout, iconKey) {
    var I = (typeof window !== 'undefined' && window.MLBMAIcons) ? window.MLBMAIcons : null;
    var iconHtml = (I && I.iconCircleHtml && iconKey)
      ? I.iconCircleHtml(iconKey, true)
      : '';
    return '<div class="tp-metric-group">'
      + '<div class="tp-metric-group__head">'
      + (iconHtml ? '<div class="tp-metric-group__icon">' + iconHtml + '</div>' : '')
      + '<div class="tp-metric-group__copy">'
      + '<h3 class="tp-metric-group__title">' + esc(title) + '</h3>'
      + (hint ? '<p class="tp-metric-group__hint">' + esc(hint) + '</p>' : '')
      + '</div>'
      + '</div>'
      + metricTileGrid(slots, layout || 'auto')
      + '</div>';
  }

  function metricGridFromSlots(slots, layout) {
    return metricTileGrid(slots, layout || 'auto');
  }

  function metricSlot(label, v, ctx, invert, decimals) {
    return chipOnly(v, ctx, invert, decimals, label);
  }

  function sectionCard(title, subtitle, body, meta) {
    meta = meta || {};
    var hdrOpts = {
      title: title,
      subtitle: subtitle || '',
      icon: meta.icon,
      kicker: meta.kicker || 'Team Profile'
    };
    return '<section class="ca-board ca-card tp-section">'
      + (window.MLBMAAssets && MLBMAAssets.sectionHeaderHtml
        ? MLBMAAssets.sectionHeaderHtml(hdrOpts)
        : '<header class="ca-section-header"><h2 class="ca-section-title">'
          + esc(title) + '</h2>'
          + (subtitle ? '<p class="ca-helper">' + esc(subtitle) + '</p>' : '')
          + '</header>')
      + body + '</section>';
  }

  function chipRow(items) {
    return '<div class="tp-chip-row">' + items.join('') + '</div>';
  }

  function resolveM(prof, team, ctx) {
    if (Mini && Mini.resolveView) return Mini.resolveView(prof, ctx);
    return {};
  }

  function pf(prof, keys, pickCol) {
    return num(pick(pickCol ? prof : prof, keys, pickCol));
  }

  function resultsForWindow(row, window) {
    if (!row) return {};
    window = window || 'YTD';
    var sfx = window === 'L30' ? '_l30' : window === 'L14' ? '_l14' : window === 'L7' ? '_l7' : '';
    function pct(key) {
      var v = num(row[key]);
      if (v == null) return null;
      return v <= 1 ? Math.round(v * 1000) / 10 : v;
    }
    return {
      winPct: pct('win_pct' + sfx) != null ? pct('win_pct' + sfx) : pct('win_pct'),
      f5WinPct: pct('f5_win_pct' + sfx) != null ? pct('f5_win_pct' + sfx) : pct('f5_win_pct'),
      spWinPct: pct('sp_win_pct' + sfx) != null ? pct('sp_win_pct' + sfx) : pct('sp_win_pct'),
      qsPct: pct('qs_pct' + sfx) != null ? pct('qs_pct' + sfx) : pct('qs_pct')
    };
  }

  function renderOffenseProfile(m, prof, ctx) {
    var rates = (Mini && Mini.resolveOffenseRates) ? Mini.resolveOffenseRates(prof, ctx) : {};
    var wrc = ctx.wrc != null ? ctx.wrc : rates.wrc;
    var filterNote = (ctx.splitLabel || ctx.split || 'both') + ' · ' + (ctx.windowLabel || ctx.window || 'YTD');
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var cache = buildTeamMetricCache(ctx);

    var bands = [
      {
        title: 'Chase Analytics Grades',
        hint: 'Process & projection',
        slots: [
          ['OSI', m.osi, 'osi', false, 1],
          ['RCV', m.rcv, 'rcv', false, 1],
          ['ABQ', m.abq, 'abq', false, 1],
          ['OBR', m.obr, 'obr', false, 1],
          ['projOSI', m.proj, 'osi', false, 1],
          ['PP-Gap', m.ppGap, 'ppGap', false, 1]
        ]
      },
      {
        title: 'Run Production',
        hint: 'Rate & counting stats',
        slots: [
          ['wRC+', wrc, 'wrc', false, 0],
          ['wOBA', rates.woba, 'woba', false, 3],
          ['xwOBA', rates.xwoba, 'woba', false, 3],
          ['OPS', rates.ops, 'wrc', false, 3],
          ['HR', rates.hr, 'wrc', false, 0],
          ['SLG', rates.slg, 'woba', false, 3],
          ['AVG', rates.avg, 'woba', false, 3]
        ]
      },
      {
        title: 'Plate Skills',
        hint: 'Discipline & contact',
        slots: [
          ['K%', rates.k, 'pitching', true, 1],
          ['BB%', rates.bb, 'obr', false, 1],
          ['OBP', rates.obp, 'obr', false, 3],
          ['Barrel%', rates.barrel, 'rcv', false, 1],
          ['HardHit%', rates.hard, 'rcv', false, 1]
        ]
      }
    ];

    var body = offenseMetricsPanel(bands, cache, team);

    return sectionCard('Offense Profile', filterNote + ' · #/30 = league rank', body, { icon: 'layers', kicker: 'Lineup unit' });
  }

  function buildOpponentStrengthCache(ctx) {
    var map = ctx.palsMap || {};
    var cache = {};
    Object.keys(map).forEach(function(t) {
      var p = map[t] || {};
      var ptf = num(p.ptfPlus);
      cache[t] = {
        pals: num(p.pals),
        xfip: num(p.xfip),
        pitchScoreFaced: num(p.pitchScoreFaced),
        sos: ptf != null ? Math.round((100 - ptf) * 10) / 10 : null
      };
    });
    return cache;
  }

  var OPPONENT_RANK = {
    'PALS': { field: 'pals', rankInvert: false },
    'xFIP Faced': { field: 'xfip', rankInvert: true },
    'Pitch Score Faced': { field: 'pitchScoreFaced', rankInvert: false },
    'Strength of Schedule': { field: 'sos', rankInvert: false }
  };

  function opponentStrengthPanel(slots, cache, team) {
    var cells = slots.map(function(s) {
      var meta = OPPONENT_RANK[s[0]] || {};
      var rankMeta = meta.field && cache && team
        ? leagueRank(cache, team, meta.field, meta.rankInvert)
        : { rank: null, total: null };
      return offenseStatCell(s[0], s[1], s[2], s[3], s[4], rankMeta);
    }).join('');
    return '<div class="tp-offense-metrics tp-offense-metrics--opponent">'
      + '<div class="tp-offense-metrics__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">Opponent quality faced</span>'
      + '<span class="tp-offense-metrics__band-hint">PALS · xFIP · pitching score · schedule difficulty</span>'
      + '</div>'
      + '<div class="tp-offense-metrics__row">' + cells + '</div>'
      + '</div></div>';
  }

  function renderOpponentStrengthFaced(ctx) {
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var pack = (ctx.palsMap && ctx.palsMap[team]) || {};
    var pals = ctx.pals != null ? ctx.pals : num(pack.pals);
    var xfip = ctx.xfipFaced != null ? ctx.xfipFaced : num(pack.xfip);
    var psFaced = ctx.pitchScoreFaced != null ? ctx.pitchScoreFaced : num(pack.pitchScoreFaced);
    var ptf = num(pack.ptfPlus);
    var sos = ptf != null ? Math.round((100 - ptf) * 10) / 10 : null;
    var filterNote = (ctx.splitLabel || ctx.split || 'both') + ' · ' + (ctx.windowLabel || ctx.window || 'YTD');
    var cache = buildOpponentStrengthCache(ctx);

    var slots = [
      ['PALS', pals, 'osi', false, 1],
      ['xFIP Faced', xfip, 'pitching', true, 2],
      ['Pitch Score Faced', psFaced, 'pitching', false, 0],
      ['Strength of Schedule', sos, 'osi', false, 1]
    ];

    if (!pals && !xfip && !psFaced && sos == null) {
      return sectionCard('Strength of Opponents Faced', 'Run scrape_pals / compute_pals for PALS and schedule metrics',
        '<p class="ca-helper">PALS, xFIP faced, pitch score faced, and SOS appear after the PALS pipeline runs.</p>',
        { icon: 'crosshair', kicker: 'Schedule context' });
    }

    var body = opponentStrengthPanel(slots, cache, team)
      + '<p class="ca-helper tp-opponent-strength-note">SOS derived from PTF+ (higher = harder pitching schedule). xFIP rank #1 = toughest staff faced.</p>';

    return sectionCard('Strength of Opponents Faced', filterNote + ' · #/30 = league rank', body,
      { icon: 'crosshair', kicker: 'Schedule context' });
  }

  function renderScheduleContext(ctx, resultsRow, window) {
    return renderOpponentStrengthFaced(ctx);
  }

  function renderScoring(m, prof, ctx) {
    return renderOffenseProfile(m, prof, ctx);
  }

  function renderProcess(m) {
    return '';
  }

  function renderPitchingFaced(ctx) {
    return '';
  }

  function renderSurfaceWins(resultsRow, window) {
    return '';
  }

  function renderMomentum(m, prof, ctx) {
    return '';
  }

  function fmtRatePct(v) {
    if (v == null || v === '' || isNaN(v)) return '—';
    var n = Number(v);
    if (n > 0 && n <= 1) return Math.round(n * 100) + '%';
    return Math.round(n) + '%';
  }

  function pitchHandLabel(h) {
    var s = String(h || '').trim().toUpperCase();
    if (s === 'L' || s === 'LHP' || s.charAt(0) === 'L') return 'LHP';
    if (s === 'R' || s === 'RHP' || s.charAt(0) === 'R') return 'RHP';
    return '?';
  }

  function pitchTierLabel(score) {
    if (score == null || isNaN(score)) return { label: '', cls: '' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function spPitchScoreFor(name, team) {
    var S = global.MLBMASharedMatchup;
    var profiles = (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
    if (S && S.findSpProfile && profiles.length) {
      var p = S.findSpProfile(profiles, name, team);
      if (p && S.spProfileMetrics) {
        var metrics = S.spProfileMetrics(p);
        if (metrics && metrics.pitchScore != null) return metrics.pitchScore;
      }
    }
    return typeof global.getSpPitchScore === 'function' ? global.getSpPitchScore(team) : null;
  }

  function teamRecordHtml(team) {
    if (global.MLBMAStandings && MLBMAStandings.recordHtml) return MLBMAStandings.recordHtml(team);
    return '';
  }

  function compareMatchupUrl(away, home) {
    var PD = global.PlatformDashboard;
    if (PD && PD.compareUrl) return PD.compareUrl(away, home);
    return 'matchup_compare.html?away=' + encodeURIComponent(away || '') + '&home=' + encodeURIComponent(home || '');
  }

  function pitcherProfileUrl(name) {
    return 'pitcher_profile.html?pitcher=' + encodeURIComponent(name || '');
  }

  function renderTonightSpSnap(side, m, role) {
    var team = role === 'away' ? m.away : m.home;
    var name = role === 'away' ? m.awaySP : m.homeSP;
    var hand = role === 'away' ? m.awayHand : m.homeHand;
    var k = role === 'away' ? m.awayK : m.homeK;
    var bb = role === 'away' ? m.awayBB : m.homeBB;
    var fip = role === 'away' ? m.awayFIP : m.homeFIP;
    var ps = spPitchScoreFor(name, team);
    var tier = pitchTierLabel(ps);
    var psColor = A && ps != null ? A.metricColor(ps, true) : 'var(--text-2)';
    var pname = name && String(name).trim() && String(name).toUpperCase() !== 'TBD' ? name : 'TBD';
    var pid = A && A.resolveMlbId ? A.resolveMlbId(name) : (A ? A.lookupMlbId(name) : null);
    var avatar = A && pname !== 'TBD'
      ? A.pitcherAvatar(pid || name, { crop: 'matchup', className: 'tp-tonight-snap__avatar', eager: true })
      : '';
    var nameHtml = pname === 'TBD'
      ? '<span class="tp-tonight-snap__name">' + esc(pname) + '</span>'
      : '<a href="' + pitcherProfileUrl(pname) + '" class="tp-tonight-snap__name pitcher-link" onclick="event.stopPropagation()">' + esc(pname) + '</a>';
    var stats = [fmtRatePct(k) + ' K%', fmtRatePct(bb) + ' BB%', fip != null ? Number(fip).toFixed(2) + ' FIP' : '— FIP'];
    return '<div class="tp-tonight-snap__sp tp-tonight-snap__sp--' + role + '" onclick="event.stopPropagation()">'
      + avatar
      + '<div class="tp-tonight-snap__sp-body">'
      + '<div class="tp-tonight-snap__sp-top">'
      + '<span class="tp-tonight-snap__side">' + esc(side) + '</span>'
      + '<span class="hand-pill hand-' + pitchHandLabel(hand).charAt(0).toLowerCase() + '">' + esc(pitchHandLabel(hand)) + '</span>'
      + (tier.label ? '<span class="pitch-tier ' + tier.cls + '">' + esc(tier.label) + '</span>' : '')
      + '</div>'
      + nameHtml
      + '<div class="tp-tonight-snap__sp-meta">'
      + (ps != null
        ? '<span class="tp-tonight-snap__ps"><em>Pitch Score</em><strong style="color:' + psColor + '">' + Number(ps).toFixed(0) + '</strong></span>'
        : '')
      + '<span class="tp-tonight-snap__sp-stats">' + esc(stats.join(' · ')) + '</span>'
      + '</div></div></div>';
  }

  function renderTonightSnapshot(m) {
    var logo = A && A.teamLogoImg ? function(t) { return A.teamLogoImg(t, { className: 'tp-tonight-snap__logo' }); } : function() { return ''; };
    var awayRec = teamRecordHtml(m.away);
    var homeRec = teamRecordHtml(m.home);
    var awayOSI = m.awayOSI != null ? m.awayOSI : 0;
    var homeOSI = m.homeOSI != null ? m.homeOSI : 0;
    var total = awayOSI + homeOSI || 1;
    var awayPct = Math.max(10, (awayOSI / total) * 100);
    var fav = awayOSI >= homeOSI ? m.away : m.home;
    var handLabel = pitchHandLabel(m.homeHand);
    var awayHandLabel = pitchHandLabel(m.awayHand);
    var awayEdgeCls = fav === m.away ? ' edge-team' : '';
    var homeEdgeCls = fav === m.home ? ' edge-team' : '';
    var meta = [];
    if (m.time) meta.push('<span class="tp-tonight-snap__time">' + esc(m.time) + '</span>');
    if (m.stadium) meta.push('<span class="tp-tonight-snap__venue">' + esc(m.stadium) + '</span>');
    var S = global.MLBMASharedMatchup;
    if (S && S.formatWeatherMetaHtml) {
      var gk = m.away + '@' + m.home;
      var w = (global.LIVE_DATA && LIVE_DATA.weather || {})[gk] || m.weather;
      if (w) {
        var wh = S.formatWeatherMetaHtml(w, m.home);
        if (wh) meta.push(wh);
      }
    }
    var compareUrl = compareMatchupUrl(m.away, m.home);
    return '<div class="tp-tonight-snapshot" data-tp-matchup-card>'
      + '<article class="tp-tonight-snap" data-away="' + esc(m.away) + '" data-home="' + esc(m.home) + '" role="link" tabindex="0">'
      + '<div class="tp-tonight-snap__head">'
      + '<div class="tp-tonight-snap__matchup">'
      + '<span class="tp-tonight-snap__team">' + logo(m.away) + '<strong>' + esc(m.away) + '</strong>'
      + (awayRec ? '<span class="tp-tonight-snap__rec">' + awayRec + '</span>' : '') + '</span>'
      + '<span class="tp-tonight-snap__at">@</span>'
      + '<span class="tp-tonight-snap__team">' + logo(m.home) + '<strong>' + esc(m.home) + '</strong>'
      + (homeRec ? '<span class="tp-tonight-snap__rec">' + homeRec + '</span>' : '') + '</span>'
      + '</div>'
      + (meta.length ? '<div class="tp-tonight-snap__meta">' + meta.join('') + '</div>' : '')
      + '</div>'
      + '<div class="tp-tonight-snap__pitchers">'
      + renderTonightSpSnap('Away', m, 'away')
      + renderTonightSpSnap('Home', m, 'home')
      + '</div>'
      + '<div class="tp-tonight-snap__edge">'
      + '<div class="tp-tonight-snap__edge-label">Lineup edge vs ' + esc(handLabel) + ' / ' + esc(awayHandLabel) + '</div>'
      + '<div class="tp-tonight-snap__osi">'
      + '<span class="tp-tonight-snap__osi-val' + awayEdgeCls + '">' + esc(m.away) + ' <strong>' + (m.awayOSI != null ? m.awayOSI.toFixed(1) : '—') + '</strong></span>'
      + '<div class="tp-tonight-snap__bar"><span style="width:' + awayPct + '%"></span></div>'
      + '<span class="tp-tonight-snap__osi-val tr' + homeEdgeCls + '">' + esc(m.home) + ' <strong>' + (m.homeOSI != null ? m.homeOSI.toFixed(1) : '—') + '</strong></span>'
      + '</div></div>'
      + '<a class="tp-tonight-snap__cta" href="' + compareUrl + '" onclick="event.stopPropagation()">View Full Analysis →</a>'
      + '</article></div>';
  }

  function renderTonight(ctx) {
    ctx = ctx || {};
    if (ctx.battingTab === 'qualified') return '';
    var m = ctx.tonightMatchup;
    if (!m || !m.away || !m.home) return '';
    return sectionCard('Tonight\'s Matchup', 'Starters and lineup edge at a glance',
      renderTonightSnapshot(m),
      { icon: 'swords', kicker: 'Tonight' });
  }

  function iconCircle(name) {
    var I = global.MLBMAIcons;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm"></span>';
  }

  function renderAnalystTake(m, prof, ctx) {
    return '';
  }

  function renderSplitCards(m) {
    if (!Mini || !Mini.renderSnapshot) return '';
    /* Split pair rendered inside snapshot; expose standalone wrapper for ordering */
    return '';
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    if (Mini && Mini.resolveOffenseRates) {
      var rates = Mini.resolveOffenseRates(prof, ctx);
      if (rates.wrc != null) ctx.wrc = rates.wrc;
    }
    var m = resolveM(prof, team, ctx);
    var html = '';
    html += renderOffenseProfile(m, prof, ctx);
    html += renderScheduleContext(ctx, ctx.resultsRow, ctx.window);
    if (global.TeamProfileIntel) {
      html += TeamProfileIntel.renderSustainabilitySection(m, prof, ctx);
    }
    html += renderTonight(ctx);
    return html.replace(/<\/?motion>/g, '');
  }

  global.TeamProfileSections = {
    renderAll: renderAll,
    renderOffenseProfile: renderOffenseProfile,
    renderOpponentStrengthFaced: renderOpponentStrengthFaced,
    renderScheduleContext: renderScheduleContext,
    renderScoring: renderScoring,
    renderProcess: renderProcess,
    renderPitchingFaced: renderPitchingFaced,
    renderSurfaceWins: renderSurfaceWins,
    renderMomentum: renderMomentum,
    renderTonight: renderTonight,
    renderAnalystTake: renderAnalystTake,
    phase1Chip: phase1Chip
  };
})(typeof window !== 'undefined' ? window : this);
