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
    'Pitch Score Faced': { abbr: 'Pitch Score', gloss: 'pitching-score' },
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

  function offenseMetricTile(key, v, ctxKey, invert, decimals, rankMeta) {
    rankMeta = rankMeta || {};
    var m = metricLabel(key);
    var glossLink = m.gloss
      ? '<a class="tp-metric-gloss-link" href="glossary.html#' + esc(m.gloss) + '" title="Glossary">↗</a>'
      : '';
    var rank = rankMeta.rank;
    var total = rankMeta.total;
    var rankHtml = rank != null
      ? '<span class="tp-metric-tile__rank tp-metric-tile__rank--' + rankTone(rank) + '">#'
        + esc(String(rank)) + (total ? '<span class="tp-metric-tile__rank-of">/' + esc(String(total)) + '</span>' : '')
        + '</span>'
      : '';
    return '<article class="tp-metric-tile tp-metric-tile--dense" aria-label="' + esc(m.abbr) + '">'
      + '<div class="tp-metric-tile__head">'
      + '<span class="tp-metric-tile__abbr">' + esc(m.abbr) + glossLink + '</span>'
      + '</div>'
      + '<div class="tp-metric-tile__value">' + valChip(v, ctxKey, invert, decimals) + '</div>'
      + (rankHtml ? '<div class="tp-metric-tile__foot">' + rankHtml + '</div>' : '')
      + '</article>';
  }

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

  function offenseStatsBand(title, hint, iconKey, slots, cache, team, layout) {
    var cells = slots.map(function(s) {
      var key = s[0];
      var field = METRIC_FIELD[key];
      var invertRank = METRIC_INVERT[key] || false;
      var rankMeta = field && cache && team
        ? leagueRank(cache, team, field, invertRank)
        : { rank: null, total: null };
      return offenseMetricTile(key, s[1], s[2], s[3], s[4], rankMeta);
    }).join('');
    var iconHtml = iconKey ? iconCircle(iconKey) : '';
    return '<div class="tp-metric-band">'
      + '<header class="tp-metric-band__head">'
      + (iconHtml ? '<span class="tp-metric-band__icon">' + iconHtml + '</span>' : '')
      + '<div class="tp-metric-band__copy">'
      + '<span class="tp-metric-band__title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-metric-band__hint">' + esc(hint) + '</span>' : '')
      + '</div></header>'
      + '<div class="tp-metric-tile-grid tp-metric-tile-grid--' + esc(layout || 'auto') + '">' + cells + '</div>'
      + '</div>';
  }

  function offenseMetricsPanel(bands, cache, team) {
    return '<div class="tp-profile-metrics">'
      + bands.map(function(b) {
        return offenseStatsBand(b.title, b.hint, b.icon, b.slots, cache, team, b.layout);
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
    var extraClass = meta.extraClass ? ' ' + meta.extraClass : '';
    var hdrOpts = {
      title: title,
      subtitle: subtitle || '',
      icon: meta.icon,
      kicker: meta.kicker || 'Team Profile',
      actions: meta.actions || ''
    };
    return '<section class="ca-board tp-section' + extraClass + '"'
      + (meta.sectionId ? ' data-tp-section="' + esc(meta.sectionId) + '"' : '') + '>'
      + (window.MLBMAAssets && MLBMAAssets.sectionHeaderHtml
        ? MLBMAAssets.sectionHeaderHtml(hdrOpts)
        : '<header class="ca-section-header"><h2 class="ca-section-title">'
          + esc(title) + '</h2>'
          + (subtitle ? '<p class="ca-helper">' + esc(subtitle) + '</p>' : '')
          + '</header>')
      + body + '</section>';
  }

  function profileControls() {
    return (typeof window !== 'undefined' && window.MLBMAProfileControls) ? window.MLBMAProfileControls : null;
  }

  function lineupSplitBar(split) {
    var PC = profileControls();
    if (PC && PC.renderLineupSplitBar) return PC.renderLineupSplitBar(split || 'both');
    if (PC && PC.renderSplitControls && PC.wrapSectionFilterBar) {
      return PC.wrapSectionFilterBar(PC.renderSplitControls('lineup', split || 'both'), 'tp-section-filter-bar--split');
    }
    return '';
  }

  function lineupWindowBar(windowKey) {
    var PC = profileControls();
    if (PC && PC.renderLineupWindowBar) return PC.renderLineupWindowBar(windowKey || 'YTD');
    if (PC && PC.renderWindowControls && PC.wrapSectionFilterBar) {
      return PC.wrapSectionFilterBar(PC.renderWindowControls(windowKey || 'YTD'), 'tp-section-filter-bar--window');
    }
    return '';
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
    var split = ctx.split || 'both';
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var cache = buildTeamMetricCache(ctx);

    var bands = [
      {
        title: 'Chase Analytics Grades',
        hint: 'Process & projection',
        icon: 'layers',
        layout: '3',
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
        icon: 'trending-up',
        layout: '4',
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
        icon: 'target',
        layout: '3',
        slots: [
          ['K%', rates.k, 'pitching', true, 1],
          ['BB%', rates.bb, 'obr', false, 1],
          ['OBP', rates.obp, 'obr', false, 3],
          ['Barrel%', rates.barrel, 'rcv', false, 1],
          ['HardHit%', rates.hard, 'rcv', false, 1]
        ]
      }
    ];

    var body = lineupSplitBar(split) + offenseMetricsPanel(bands, cache, team);

    return sectionCard('Offense Profile', 'League rank on every metric', body,
      { icon: 'layers', kicker: 'Lineup unit', sectionId: 'offense-profile' });
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
    window = window || 'YTD';
    var r = resultsForWindow(resultsRow, window);
    var body = lineupWindowBar(window)
      + '<div class="tp-surface-wins">'
      + chipRow([
        metricSlot('Win%', r.winPct, 'osi', false, 1),
        metricSlot('F5 Win%', r.f5WinPct, 'osi', false, 1),
        metricSlot('Pitcher Win%', r.spWinPct, 'pitching', false, 1)
      ]);
    if (A && A.f5WarningHtml) body += A.f5WarningHtml();
    if (r.qsPct != null) {
      body += chipRow([metricSlot('QS%', r.qsPct, 'pitching', false, 1)]);
    } else {
      body += '<p class="ca-helper tp-phase1-inline">QS% — <span class="tp-phase1-tag">Phase 1</span> (wire game-results QS to profile)</p>';
    }
    body += '</div>';
    return sectionCard('Surface Wins', 'Team_Results · ' + window, body,
      { icon: 'trophy', kicker: 'Results', sectionId: 'surface-wins' });
  }

  function renderRollingTrend(m, prof, ctx) {
    if (!Mini || !Mini.renderTrendChartPanel) return '';
    var body = lineupWindowBar(ctx.window || 'YTD')
      + '<div data-tp-trend-section>' + Mini.renderTrendChartPanel(m, ctx) + '</div>';
    return sectionCard('Rolling Trend', 'YTD → L7 grade windows · velocity · reliability', body,
      { icon: 'trending-up', kicker: 'Momentum', sectionId: 'rolling-trend' });
  }

  function renderMomentum(m, prof, ctx) {
    return renderRollingTrend(m, prof, ctx);
  }

  function renderHandednessSection(prof, team, ctx) {
    if (!Mini || !Mini.platoonSplitSummary) return '';
    var platoonCtx = Object.assign({}, ctx, { split: 'both' });
    var m = Mini.resolveView ? Mini.resolveView(prof, platoonCtx) : {};
    var platoon = Mini.platoonSplitSummary(m, platoonCtx);
    var verdict = '';
    if (global.TeamProfileIntel && TeamProfileIntel.renderSplitVerdictHtml) {
      verdict = TeamProfileIntel.renderSplitVerdictHtml(m);
    }
    if (!platoon && !verdict) return '';
    var body = '<div class="tp-split-section">' + (platoon || '') + (verdict || '') + '</div>';
    return sectionCard('Handedness Splits', 'vs RHP · vs LHP · platoon differential', body,
      { icon: 'split', kicker: 'Platoon', sectionId: 'handedness-splits' });
  }

  function renderLocationSection(prof, team, ctx) {
    if (!Mini || !Mini.locationSplitSummary) return '';
    var locCtx = Object.assign({}, ctx, { split: 'both' });
    var m = Mini.resolveView ? Mini.resolveView(prof, locCtx) : {};
    var location = Mini.locationSplitSummary(prof, m, locCtx);
    if (!location) return '';
    var body = '<div class="tp-split-section">' + location + '</div>';
    return sectionCard('Home / Away', 'Location split · park-adjusted offense rates', body,
      { icon: 'map-pin', kicker: 'Location', sectionId: 'location-splits' });
  }

  function compareMatchupUrl(away, home) {
    var PD = global.PlatformDashboard;
    if (PD && PD.compareUrl) return PD.compareUrl(away, home);
    return 'matchup_compare.html?away=' + encodeURIComponent(away || '') + '&home=' + encodeURIComponent(home || '');
  }

  function renderTonightSnapshot(m) {
    var compareUrl = compareMatchupUrl(m.away, m.home);
    var meta = [];
    if (m.time) meta.push(esc(m.time));
    if (m.stadium) meta.push(esc(m.stadium));
    var awaySp = m.awaySP && String(m.awaySP).trim() && String(m.awaySP).toUpperCase() !== 'TBD' ? m.awaySP : null;
    var homeSp = m.homeSP && String(m.homeSP).trim() && String(m.homeSP).toUpperCase() !== 'TBD' ? m.homeSP : null;
    var spLine = (awaySp || homeSp)
      ? '<p class="tp-tonight-compare__sp">' + esc(awaySp || 'TBD') + ' vs ' + esc(homeSp || 'TBD') + '</p>'
      : '';
    return '<div class="tp-tonight-compare" data-tp-matchup-card>'
      + '<div class="tp-tonight-compare__inner">'
      + '<p class="tp-tonight-compare__matchup">'
      + '<strong>' + esc(m.away) + '</strong>'
      + '<span class="tp-tonight-compare__at">@</span>'
      + '<strong>' + esc(m.home) + '</strong>'
      + (meta.length ? '<span class="tp-tonight-compare__meta">' + meta.join(' · ') + '</span>' : '')
      + '</p>'
      + spLine
      + '<p class="tp-tonight-compare__prompt">Full matchup analysis — starters, lineups, and side-by-side metrics — lives in <strong>Compare</strong>. Open the workspace for these two teams.</p>'
      + '<a class="ca-btn ca-btn--primary ca-btn--sm tp-tonight-compare__cta" href="' + compareUrl + '">Open Compare →</a>'
      + '</div></div>';
  }

  function renderTonight(ctx) {
    ctx = ctx || {};
    if (ctx.battingTab === 'qualified') return '';
    var m = ctx.tonightMatchup;
    if (!m || !m.away || !m.home) return '';
    return sectionCard('Tonight\'s Matchup', 'Head-to-head compare for tonight\'s game',
      renderTonightSnapshot(m),
      { icon: 'swords', kicker: 'Tonight' });
  }

  function iconCircle(name) {
    var I = global.MLBMAIcons;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm"></span>';
  }

  function renderAnalystTake(m, prof, ctx) {
    var pickCol = ctx.pickCol;
    var rows = [];
    var woba = pf(prof, ['woba', 'wOBA'], pickCol);
    var xwoba = pf(prof, ['xwoba', 'xwOBA'], pickCol);
    if (woba != null && xwoba != null) {
      var gap = (woba - xwoba) * 1000;
      rows.push({
        icon: gap > 8 ? 'trending-up' : gap < -8 ? 'trending-down' : 'target',
        label: 'Contact Profile',
        text: gap > 8 ? 'wOBA runs ' + Math.round(gap) + ' pts above xwOBA — possible regression in contact results.'
          : gap < -8 ? 'xwOBA ahead of wOBA by ' + Math.abs(Math.round(gap)) + ' pts — upside if balls find gaps.'
          : 'wOBA and xwOBA are aligned — contact results match process.'
      });
    }
    var bbR = pf(prof, ['bb_pct_vs_rhp', 'bb_vs_rhp'], pickCol);
    var bbL = pf(prof, ['bb_pct_vs_lhp', 'bb_vs_lhp'], pickCol);
    if (m.osiR != null && m.osiL != null && Math.abs(m.osiR - m.osiL) >= 6) {
      rows.push({
        icon: 'split',
        label: 'Platoon Profile',
        text: 'OSI split gap ' + Math.abs(m.osiR - m.osiL).toFixed(1) + ' (RHP '
          + m.osiR.toFixed(1) + ' vs LHP ' + m.osiL.toFixed(1) + ') — platoon matters for lineup construction.'
      });
    } else if (bbR != null && bbL != null && Math.abs(bbR - bbL) >= 3) {
      rows.push({
        icon: 'target',
        label: 'Plate Discipline Split',
        text: 'BB% vs RHP ' + bbR.toFixed(1) + '% vs LHP ' + bbL.toFixed(1) + '% — discipline shifts by handedness.'
      });
    }
    if (m.ppGap != null && Math.abs(m.ppGap) >= 4) {
      rows.push({
        icon: m.ppGap >= 4 ? 'trending-up' : 'activity',
        label: m.ppGap >= 4 ? 'Process Upside' : 'Regression Watch',
        text: 'PP-Gap ' + (m.ppGap >= 0 ? '+' : '') + m.ppGap.toFixed(1) + ' — projOSI vs current OSI spread.'
      });
    }
    rows = rows.filter(Boolean).slice(0, 3);
    if (!rows.length) {
      return sectionCard('Analyst Take', 'Rule-based callouts from real metrics',
        '<p class="ca-helper">Insufficient split data for analyst callouts.</p>',
        { icon: 'lightbulb', kicker: 'Analysis', sectionId: 'analyst-take' });
    }
    var body = '<div class="ca-insight-rail tp-analyst-rail">' + rows.map(function(r) {
      return '<div class="ca-insight-row">'
        + iconCircle(r.icon)
        + '<span><span class="ca-insight-label">' + esc(r.label) + '</span>'
        + '<span class="ca-insight-text">' + esc(r.text) + '</span></span></div>';
    }).join('') + '</div>';
    return sectionCard('Analyst Take', 'Notable angles from this team\'s real metrics', body,
      { icon: 'lightbulb', kicker: 'Analysis', sectionId: 'analyst-take' });
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
    html += renderRollingTrend(m, prof, ctx);
    html += renderHandednessSection(prof, team, ctx);
    html += renderLocationSection(prof, team, ctx);
    html += renderScheduleContext(ctx, ctx.resultsRow, ctx.window);
    html += renderSurfaceWins(ctx.resultsRow, ctx.window);
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
