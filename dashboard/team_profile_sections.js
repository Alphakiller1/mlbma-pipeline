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
    'xFIP Faced': { abbr: 'xFIP', gloss: 'xfip' },
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

    var caGrades = [
      ['OSI', m.osi, 'osi', false, 1],
      ['RCV', m.rcv, 'rcv', false, 1],
      ['ABQ', m.abq, 'abq', false, 1],
      ['OBR', m.obr, 'obr', false, 1],
      ['projOSI', m.proj, 'osi', false, 1],
      ['PP-Gap', m.ppGap, 'ppGap', false, 1]
    ];
    var runPower = [
      ['wRC+', wrc, 'wrc', false, 0],
      ['wOBA', rates.woba, 'woba', false, 3],
      ['xwOBA', rates.xwoba, 'woba', false, 3],
      ['OPS', rates.ops, 'wrc', false, 3],
      ['HR', rates.hr, 'wrc', false, 0],
      ['SLG', rates.slg, 'woba', false, 3],
      ['AVG', rates.avg, 'woba', false, 3]
    ];
    var plateSkills = [
      ['K%', rates.k, 'pitching', true, 1],
      ['BB%', rates.bb, 'obr', false, 1],
      ['OBP', rates.obp, 'obr', false, 3],
      ['Barrel%', rates.barrel, 'rcv', false, 1],
      ['HardHit%', rates.hard, 'rcv', false, 1]
    ];

    var body = metricTileGroup('Chase Analytics Grades', 'Process and projection pillars', caGrades, 'auto', 'layers')
      + metricTileGroup('Run Production', 'Rate stats and counting production', runPower, 'auto', 'chart-line')
      + metricTileGroup('Plate Skills', 'Discipline, contact quality, and power indicators', plateSkills, 'auto', 'bats');

    return sectionCard('Offense Profile', filterNote, body, { icon: 'layers', kicker: 'Lineup unit' });
  }

  function renderScheduleContext(ctx, resultsRow, window) {
    var pals = ctx.pals;
    var xfip = ctx.xfipFaced;
    var r = resultsForWindow(resultsRow, window);
    var slots = [];
    if (pals != null) slots.push(['PALS', pals, 'osi', false, 1]);
    if (xfip != null) slots.push(['xFIP Faced', xfip, 'pitching', true, 2]);
    if (r.winPct != null) slots.push(['Win%', r.winPct, 'osi', false, 1]);
    if (r.f5WinPct != null) slots.push(['F5 Win%', r.f5WinPct, 'osi', false, 1]);
    if (r.spWinPct != null) slots.push(['SP Win%', r.spWinPct, 'pitching', false, 1]);
    if (r.qsPct != null) slots.push(['QS%', r.qsPct, 'pitching', false, 1]);

    if (!slots.length) {
      return sectionCard('Schedule & Results', 'Run compute_pals and team results export when empty',
        '<p class="ca-helper">PALS, xFIP faced, and win rates appear here after the pipeline runs.</p>',
        { icon: 'calendar', kicker: 'Context' });
    }

    var body = metricTileGrid(slots, 'auto');
    if (A && A.f5WarningHtml && r.f5WinPct != null) body += A.f5WarningHtml();
    return sectionCard('Schedule & Results', (ctx.windowLabel || ctx.window || 'YTD') + ' · schedule difficulty and win rates', body,
      { icon: 'calendar', kicker: 'Context' });
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

  function renderTonight(ctx) {
    ctx = ctx || {};
    if (ctx.battingTab === 'qualified') return '';
    var m = ctx.tonightMatchup;
    if (!m || !m.away || !m.home) return '';
    var PD = global.PlatformDashboard;
    if (!PD || !PD.renderHeroMatchupCard) return '';
    var cardHtml = PD.renderHeroMatchupCard(m, 0, { eagerAvatars: true, extraClass: 'hero-matchup-card--profile' });
    return sectionCard('Tonight\'s Matchup', 'Starters, lineup edge, and projected batting order',
      '<div class="tp-matchup-card-wrap" data-tp-matchup-card>' + cardHtml + '</div>',
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
    if (global.TeamProfileIntel) {
      html += TeamProfileIntel.renderResearchTakeaways(m, prof, ctx);
    }
    return html.replace(/<\/?motion>/g, '');
  }

  global.TeamProfileSections = {
    renderAll: renderAll,
    renderOffenseProfile: renderOffenseProfile,
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
