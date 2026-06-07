/**
 * Team Profile — offense sections §2–§10 (TEAM_PROFILE_CONTENT_SPEC.md)
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var Mini = global.TeamProfileMini;

  function tpIcon(key) {
    var I = global.MLBMAIcons;
    return (I && I.profileIcon) ? I.profileIcon(key) : key;
  }

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
    return '<span class="tp-metric-grid-h">'
      + '<span class="tp-metric-abbr">' + esc(m.abbr) + '</span>'
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
        batterSplitsOverall: ctx.batterSplitsOverall,
        batterSplitsHome: ctx.batterSplitsHome,
        batterSplitsAway: ctx.batterSplitsAway,
        batterSplitsVsSp: ctx.batterSplitsVsSp,
        batterSplitsVsRp: ctx.batterSplitsVsRp,
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
      if (rates.woba != null && rates.xwoba != null) {
        cache[t].contactGap = Math.round((rates.woba - rates.xwoba) * 1000);
      }
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
    var rank = rankMeta.rank;
    var total = rankMeta.total;
    var rankHtml = rank != null
      ? '<span class="tp-offense-stat__rank tp-offense-stat__rank--' + rankTone(rank) + '" title="' + esc(total ? ('League rank #' + rank + ' of ' + total) : ('League rank #' + rank)) + '">'
        + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span>'
        + '</span>'
      : '';
    return '<div class="tp-offense-stat tp-offense-stat--inline" aria-label="' + esc(m.abbr) + '">'
      + '<span class="tp-offense-stat__label">' + esc(m.abbr) + '</span>'
      + '<span class="tp-offense-stat__body">'
      + valChip(v, ctxKey, invert, decimals)
      + rankHtml
      + '</span></div>';
  }

  function titleCaseHint(s) {
    var A = (typeof global !== 'undefined' && global.MLBMAAssets) ? global.MLBMAAssets : null;
    return A && A.titleCaseLabel ? A.titleCaseLabel(s) : s;
  }

  function offenseRankCell(rankMeta) {
    rankMeta = rankMeta || {};
    var rank = rankMeta.rank;
    if (rank == null) return '<td class="num tp-offense-metrics__rank-cell">—</td>';
    return '<td class="num tp-offense-metrics__rank-cell tp-offense-metrics__rank-cell--' + rankTone(rank) + '">'
      + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span></td>';
  }

  function offenseStatsBandTable(title, hint, iconKey, slots, cache, team) {
    var headers = slots.map(function(s) {
      var m = metricLabel(s[0]);
      return '<th scope="col" class="tp-offense-metrics__th">' + esc(m.abbr) + '</th>';
    }).join('');
    var valueCells = slots.map(function(s) {
      return '<td class="num tp-offense-metrics__val-cell">' + valChip(s[1], s[2], s[3], s[4]) + '</td>';
    }).join('');
    var rankCells = slots.map(function(s) {
      var key = s[0];
      var field = METRIC_FIELD[key];
      var invertRank = METRIC_INVERT[key] || false;
      var rankMeta = field && cache && team
        ? leagueRank(cache, team, field, invertRank)
        : { rank: null, total: null };
      return offenseRankCell(rankMeta);
    }).join('');
    var iconHtml = iconKey ? iconCircle(iconKey) : '';
    return '<div class="tp-offense-metrics__band tp-offense-metrics__band--table">'
      + '<div class="tp-offense-metrics__band-head">'
      + (iconHtml ? '<span class="tp-offense-metrics__band-icon">' + iconHtml + '</span>' : '')
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(titleCaseHint(hint)) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__table-wrap table-wrap">'
      + '<table class="tp-offense-metrics__table hub-table" aria-label="' + esc(title) + ' metrics">'
      + '<thead><tr>' + headers + '</tr></thead>'
      + '<tbody>'
      + '<tr class="tp-offense-metrics__values">' + valueCells + '</tr>'
      + '<tr class="tp-offense-metrics__ranks">' + rankCells + '</tr>'
      + '</tbody></table></div></div>';
  }

  function offenseStatsBand(title, hint, iconKey, slots, cache, team) {
    var cells = slots.map(function(s) {
      var key = s[0];
      var field = METRIC_FIELD[key];
      var invertRank = METRIC_INVERT[key] || false;
      var rankMeta = field && cache && team
        ? leagueRank(cache, team, field, invertRank)
        : { rank: null, total: null };
      return offenseStatCell(key, s[1], s[2], s[3], s[4], rankMeta);
    }).join('');
    var iconHtml = iconKey ? iconCircle(iconKey) : '';
    return '<div class="tp-offense-metrics__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + (iconHtml ? '<span class="tp-offense-metrics__band-icon">' + iconHtml + '</span>' : '')
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(titleCaseHint(hint)) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__row tp-offense-metrics__row--inline">' + cells + '</div>'
      + '</div>';
  }

  function offenseMetricsPanel(bands, cache, team) {
    return '<div class="tp-offense-metrics tp-offense-metrics--profile">'
      + bands.map(function(b) {
        return offenseStatsBandTable(b.title, b.hint, b.icon, b.slots, cache, team);
      }).join('')
      + '</div>';
  }

  function metricTile(key, v, ctx, invert, decimals) {
    var m = metricLabel(key);
    return '<article class="tp-metric-tile" aria-label="' + esc(m.abbr) + '">'
      + '<div class="tp-metric-tile__head">'
      + '<span class="tp-metric-tile__name">' + esc(m.abbr) + '</span>'
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
      icon: tpIcon(meta.icon),
      kicker: meta.kicker || 'Team Profile',
      actions: meta.actions || ''
    };
    return '<section class="ca-board tp-section' + extraClass + '"'
      + (meta.sectionId ? ' data-tp-section="' + esc(meta.sectionId) + '"' : '') + '>'
      + (window.MLBMAAssets && MLBMAAssets.sectionHeaderHtml
        ? MLBMAAssets.sectionHeaderHtml(hdrOpts)
        : '<header class="ca-section-header"><h2 class="ca-section-title">'
          + esc(title) + '</h2>'
          + (subtitle ? '<p class="ca-helper">' + esc((global.MLBMAAssets && MLBMAAssets.titleCaseLabel) ? MLBMAAssets.titleCaseLabel(subtitle) : subtitle) + '</p>' : '')
          + '</header>')
      + body + '</section>';
  }

  function profileControls() {
    return (typeof window !== 'undefined' && window.MLBMAProfileControls) ? window.MLBMAProfileControls : null;
  }

  function sectionSplitBar(sectionKey, split) {
    var PC = profileControls();
    if (PC && PC.renderSectionSplitBar) return PC.renderSectionSplitBar(sectionKey, split || 'both');
    if (PC && PC.renderLineupSplitBar) return PC.renderLineupSplitBar(split || 'both');
    return '';
  }

  function lineupSplitBar(split) {
    return sectionSplitBar('offense', split);
  }

  function scheduleSplitBar(split) {
    return sectionSplitBar('schedule', split);
  }

  function lineupWindowBar(windowKey) {
    var PC = profileControls();
    if (PC && PC.renderSectionWindowBar) return PC.renderSectionWindowBar('surface', windowKey || 'YTD');
    if (PC && PC.renderLineupWindowBar) return PC.renderLineupWindowBar(windowKey || 'YTD');
    return '';
  }

  function ctxForSection(baseCtx, prof, team, sectionKey) {
    baseCtx = baseCtx || {};
    var split = baseCtx.getSectionSplit
      ? baseCtx.getSectionSplit(sectionKey)
      : (baseCtx.split || 'both');
    var windowKey = sectionKey === 'surface' && baseCtx.getSectionWindow
      ? baseCtx.getSectionWindow('surface')
      : (baseCtx.window || 'YTD');
    var PC = profileControls();
    var c = Object.assign({}, baseCtx, {
      split: split,
      splitLabel: PC && PC.splitLabel ? PC.splitLabel(split) : split,
      sectionKey: sectionKey,
      window: windowKey,
      windowLabel: windowKey === 'YTD' ? 'Season' : windowKey
    });
    if (Mini && Mini.resolveOffenseRates) {
      var rates = Mini.resolveOffenseRates(prof, c);
      if (rates.wrc != null) c.wrc = rates.wrc;
    }
    return c;
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

  function pctFromResultsRow(row, metric, window, location) {
    if (!row) return null;
    window = window || 'YTD';
    var winSuf = window === 'L30' ? '_l30' : window === 'L14' ? '_l14' : window === 'L7' ? '_l7' : '';
    var locSuf = location === 'home' ? '_home' : location === 'away' ? '_away' : '';
    var keys = [];
    if (locSuf) {
      // Home/Away rows: prefer the windowed home/away column (if the pipeline ever
      // produces it), then the season-level home/away split. Never fall back to the
      // location-less value (e.g. win_pct_l7) — that would make Home and Away silently
      // duplicate the Overall row. Today the data only carries season home/away splits,
      // so in a window view the location rows show the season split rather than a
      // misleading copy of Overall.
      if (winSuf) keys.push(metric + winSuf + locSuf);
      keys.push(metric + locSuf);
    } else {
      if (winSuf) keys.push(metric + winSuf);
      keys.push(metric);
    }
    for (var i = 0; i < keys.length; i++) {
      var v = num(row[keys[i]]);
      if (v == null) continue;
      return v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10;
    }
    return null;
  }

  function surfaceWinMetrics(row, window, location) {
    return {
      winPct: pctFromResultsRow(row, 'win_pct', window, location),
      f5WinPct: pctFromResultsRow(row, 'f5_win_pct', window, location),
      spWinPct: pctFromResultsRow(row, 'sp_win_pct', window, location),
      qsPct: pctFromResultsRow(row, 'qs_pct', window, location)
    };
  }

  function surfaceStatCell(label, v, ctx, invert, decimals, rankMeta) {
    var m = METRIC_LABELS[label] || { abbr: label, gloss: '' };
    rankMeta = rankMeta || {};
    var rank = rankMeta.rank;
    var total = rankMeta.total;
    var rankHtml = rank != null
      ? '<span class="tp-offense-stat__rank tp-offense-stat__rank--' + rankTone(rank) + '" title="' + esc(total ? ('League rank #' + rank + ' of ' + total) : ('League rank #' + rank)) + '">'
        + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span>'
        + '</span>'
      : '';
    return '<div class="tp-surface-stat tp-offense-stat tp-offense-stat--inline" aria-label="' + esc(m.abbr) + '">'
      + '<span class="tp-offense-stat__label">' + esc(m.abbr) + '</span>'
      + '<span class="tp-offense-stat__body">' + valChip(v, ctx, invert, decimals) + rankHtml + '</span>'
      + '</div>';
  }

  function buildSurfaceWinCache(results, window, location, ctx) {
    var cache = {};
    (results || []).forEach(function(row) {
      var pickColFn = ctx && ctx.pickCol ? ctx.pickCol : pick;
      var tkFn = ctx && ctx.teamKey ? ctx.teamKey : function(t) { return String(t || '').trim().toUpperCase(); };
      var t = tkFn(pickColFn(row, ['team', 'Team', 'tm']));
      if (!t) return;
      var m = surfaceWinMetrics(row, window, location);
      cache[t] = {
        winPct: m.winPct,
        f5WinPct: m.f5WinPct,
        spWinPct: m.spWinPct,
        qsPct: m.qsPct
      };
    });
    return cache;
  }

  var SURFACE_RANK_FIELD = {
    'Win%': { field: 'winPct', invert: false },
    'F5 Win%': { field: 'f5WinPct', invert: false },
    'Pitcher Win%': { field: 'spWinPct', invert: false },
    'QS%': { field: 'qsPct', invert: false }
  };

  function surfaceWinMetricTd(slot, cache, team) {
    var meta = SURFACE_RANK_FIELD[slot[0]] || {};
    var rankMeta = meta.field && cache && team
      ? leagueRank(cache, team, meta.field, meta.invert)
      : { rank: null, total: null };
    var rank = rankMeta.rank;
    var rankHtml = rank != null
      ? '<div class="tp-offense-metrics__rank-cell tp-offense-metrics__rank-cell--' + rankTone(rank) + '">'
        + '<span class="tp-offense-stat__rank-num">#' + esc(String(rank)) + '</span></div>'
      : '<div class="tp-offense-metrics__rank-cell tp-offense-metrics__rank-cell--neutral">—</div>';
    return '<td class="num tp-surface-wins__metric-cell">'
      + '<div class="tp-offense-metrics__val-cell">' + valChip(slot[1], slot[2], slot[3], slot[4]) + '</div>'
      + rankHtml
      + '</td>';
  }

  function surfaceWinTableRow(title, hint, slots, cache, team) {
    if (!slots.length) return '';
    return '<tr class="tp-surface-wins__row">'
      + '<th scope="row" class="tp-surface-wins__split-cell">'
      + '<span class="tp-surface-wins__split-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-surface-wins__split-hint">' + esc(titleCaseHint(hint)) + '</span>' : '')
      + '</th>'
      + slots.map(function(s) { return surfaceWinMetricTd(s, cache, team); }).join('')
      + '</tr>';
  }

  function alignSurfaceSlots(slots, headerSlots) {
    var byKey = {};
    (slots || []).forEach(function(s) { byKey[s[0]] = s; });
    return (headerSlots || []).map(function(h) {
      if (byKey[h[0]]) return byKey[h[0]];
      return [h[0], null, h[2] || 'rate', h[3] || false, h[4] != null ? h[4] : 1];
    });
  }

  function surfaceWinsTable(overall, home, away, windowLabel, winCache, homeCache, awayCache, team) {
    var headerSlots = surfaceWinSlots(overall);
    if (!headerSlots.length) headerSlots = surfaceWinSlots(home);
    if (!headerSlots.length) headerSlots = surfaceWinSlots(away);
    var headers = headerSlots.map(function(s) {
      return '<th scope="col" class="tp-offense-metrics__th">' + esc(s[0]) + '</th>';
    }).join('');
    var rows = surfaceWinTableRow('Overall', windowLabel + ' · full sample', alignSurfaceSlots(surfaceWinSlots(overall), headerSlots), winCache, team)
      + surfaceWinTableRow('Home', windowLabel + ' · home games', alignSurfaceSlots(surfaceWinSlots(home), headerSlots), homeCache, team)
      + surfaceWinTableRow('Away', windowLabel + ' · road games', alignSurfaceSlots(surfaceWinSlots(away), headerSlots), awayCache, team);
    if (!rows) return '';
    return '<div class="tp-offense-metrics__table-wrap table-wrap tp-surface-wins__table-wrap">'
      + '<table class="tp-offense-metrics__table tp-surface-wins__table hub-table" aria-label="Surface wins by split">'
      + '<thead><tr><th scope="col" class="tp-surface-wins__corner">Split</th>' + headers + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>';
  }

  function surfaceWinBand(title, hint, slots, cache, team) {
    var cells = slots.map(function(s) {
      var meta = SURFACE_RANK_FIELD[s[0]] || {};
      var rankMeta = meta.field && cache && team
        ? leagueRank(cache, team, meta.field, meta.invert)
        : { rank: null, total: null };
      return surfaceStatCell(s[0], s[1], s[2], s[3], s[4], rankMeta);
    }).join('');
    if (!cells) return '';
    return '<div class="tp-offense-metrics__band tp-surface-wins__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(titleCaseHint(hint)) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__row tp-offense-metrics__row--inline">' + cells + '</div>'
      + '</div>';
  }

  function surfaceWinSlots(metrics) {
    metrics = metrics || {};
    var slots = [
      ['Win%', metrics.winPct, 'rate', false, 1],
      ['F5 Win%', metrics.f5WinPct, 'rate', false, 1],
      ['Pitcher Win%', metrics.spWinPct, 'rate', false, 1]
    ];
    if (metrics.qsPct != null) slots.push(['QS%', metrics.qsPct, 'rate', false, 1]);
    return slots;
  }

  function resultsForWindow(row, window) {
    return surfaceWinMetrics(row, window || 'YTD', null);
  }

  function renderOffenseProfile(m, prof, ctx) {
    var rates = (Mini && Mini.resolveOffenseRates) ? Mini.resolveOffenseRates(prof, ctx) : {};
    var wrc = ctx.wrc != null ? ctx.wrc : rates.wrc;
    var split = ctx.split || 'both';
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var cache = buildTeamMetricCache(ctx);

    var bands = [
      {
        title: 'Run Production',
        hint: 'Rate & counting stats',
        icon: 'run-production',
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
        icon: 'plate-skills',
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

    return sectionCard('Offense Profile', 'Full split lens · league rank on every metric', body,
      { icon: 'offense-profile', kicker: 'Lineup unit', sectionId: 'offense-profile' });
  }

  function buildOpponentStrengthCache(ctx) {
    var map = ctx.palsMap || {};
    var S = global.MLBMASharedMatchup || global.MatchupShared;
    var cache = {};
    Object.keys(map).forEach(function(t) {
      var p = map[t] || {};
      cache[t] = {
        pals: num(p.pals),
        xfip: num(p.xfip),
        pitchScoreFaced: num(p.pitchScoreFaced),
        sos: S && S.sosFromPalsPack ? S.sosFromPalsPack(p, map, t) : (
          p.sos != null ? num(p.sos) : (num(p.ptfPlus) != null ? Math.round((100 - num(p.ptfPlus)) * 10) / 10 : null)
        )
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

  function opponentRankCell(key, cache, team) {
    var meta = OPPONENT_RANK[key] || {};
    var rankMeta = meta.field && cache && team
      ? leagueRank(cache, team, meta.field, meta.rankInvert)
      : { rank: null, total: null };
    return offenseRankCell(rankMeta);
  }

  function opponentStrengthTable(slots, cache, team) {
    var headers = slots.map(function(s) {
      var m = metricLabel(s[0]);
      return '<th scope="col" class="tp-offense-metrics__th">' + esc(m.abbr) + '</th>';
    }).join('');
    var valueCells = slots.map(function(s) {
      return '<td class="num tp-offense-metrics__val-cell">' + valChip(s[1], s[2], s[3], s[4]) + '</td>';
    }).join('');
    var rankCells = slots.map(function(s) {
      return opponentRankCell(s[0], cache, team);
    }).join('');
    return '<div class="tp-offense-metrics tp-offense-metrics--profile tp-offense-metrics--opponent">'
      + '<div class="tp-offense-metrics__band tp-offense-metrics__band--table">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">Opponent Quality Faced</span>'
      + '<span class="tp-offense-metrics__band-hint">PALS · xFIP · Pitching Score · Schedule Difficulty</span>'
      + '</div>'
      + '<div class="tp-offense-metrics__table-wrap table-wrap tp-opponent-strength__table-wrap">'
      + '<table class="tp-offense-metrics__table hub-table tp-opponent-strength__table" aria-label="Opponent quality faced">'
      + '<thead><tr>' + headers + '</tr></thead>'
      + '<tbody>'
      + '<tr class="tp-offense-metrics__values">' + valueCells + '</tr>'
      + '<tr class="tp-offense-metrics__ranks">' + rankCells + '</tr>'
      + '</tbody></table></div></div></div>';
  }

  function renderOpponentStrengthFaced(ctx) {
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var pack = (ctx.palsMap && ctx.palsMap[team]) || {};
    var pals = ctx.pals != null ? ctx.pals : num(pack.pals);
    var xfip = ctx.xfipFaced != null ? ctx.xfipFaced : num(pack.xfip);
    var psFaced = ctx.pitchScoreFaced != null ? ctx.pitchScoreFaced : num(pack.pitchScoreFaced);
    var ptf = num(pack.ptfPlus);
    var sos = (global.MLBMASharedMatchup || global.MatchupShared) && (global.MLBMASharedMatchup || global.MatchupShared).sosFromPalsPack
      ? (global.MLBMASharedMatchup || global.MatchupShared).sosFromPalsPack(pack, ctx.palsMap, team)
      : (pack.sos != null ? num(pack.sos) : (ptf != null ? Math.round((100 - ptf) * 10) / 10 : null));
    var split = ctx.split || 'both';
    var PC = profileControls();
    var splitLbl = ctx.splitLabel || (PC && PC.splitLabel ? PC.splitLabel(split) : split);
    var filterNote = splitLbl + ' · Season · League Rank On Each Metric';
    var cache = buildOpponentStrengthCache(ctx);

    var slots = [
      ['PALS', pals, 'osi', false, 1],
      ['xFIP Faced', xfip, 'pitching', true, 2],
      ['Pitch Score Faced', psFaced, 'pitching', false, 0],
      ['Strength of Schedule', sos, 'osi', false, 1]
    ];

    if (!pals && !xfip && !psFaced && sos == null) {
      return sectionCard('Strength of Opponents Faced', 'Run scrape_pals / compute_pals for PALS and schedule metrics',
        scheduleSplitBar(split)
          + '<p class="ca-helper">PALS, xFIP faced, pitch score faced, and SOS appear after the PALS pipeline runs.</p>',
        { icon: 'schedule-context', kicker: 'Schedule context', sectionId: 'schedule-context' });
    }

    var body = scheduleSplitBar(split)
      + opponentStrengthTable(slots, cache, team)
      + '<p class="ca-helper tp-opponent-strength-note">SOS derived from PTF+ (higher = harder pitching schedule). xFIP rank #1 = toughest staff faced.</p>';

    return sectionCard('Strength of Opponents Faced', filterNote, body,
      { icon: 'schedule-context', kicker: 'Schedule context', sectionId: 'schedule-context' });
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

  function renderSurfaceWins(resultsRow, window, ctx) {
    window = window || 'YTD';
    ctx = ctx || {};
    var team = ctx.teamKey ? ctx.teamKey(ctx.team) : String(ctx.team || '').trim().toUpperCase();
    var winCache = buildSurfaceWinCache(ctx.results || [], window, null, ctx);
    var overall = surfaceWinMetrics(resultsRow, window, null);
    var home = surfaceWinMetrics(resultsRow, window, 'home');
    var away = surfaceWinMetrics(resultsRow, window, 'away');
    var windowLabel = window === 'YTD' ? 'Season' : window;
    var homeCache = buildSurfaceWinCache(ctx.results || [], window, 'home', ctx);
    var awayCache = buildSurfaceWinCache(ctx.results || [], window, 'away', ctx);
    var body = lineupWindowBar(window)
      + '<div class="tp-surface-wins tp-offense-metrics tp-offense-metrics--profile">'
      + surfaceWinsTable(overall, home, away, windowLabel, winCache, homeCache, awayCache, team)
      + '</div>';
    if (A && A.f5WarningHtml) body += A.f5WarningHtml();
    if (overall.qsPct == null) {
      body += '<p class="ca-helper tp-phase1-inline">QS% — <span class="tp-phase1-tag">Phase 1</span> (wire game-results QS to profile)</p>';
    }
    return sectionCard('Surface Wins', 'Win% · F5 · SP context · league rank on each metric', body,
      { icon: 'surface-wins', kicker: 'Results', sectionId: 'surface-wins' });
  }

  function renderRollingTrend(m, prof, ctx) {
    if (!Mini || !Mini.renderTrendChartPanel) return '';
    var body = '<div data-tp-trend-section>' + Mini.renderTrendChartPanel(m, ctx) + '</div>';
    return sectionCard('Rolling Trend', 'Grade movement across time windows', body,
      { icon: 'rolling-trend', kicker: 'Momentum', sectionId: 'rolling-trend' });
  }

  function renderMomentum(m, prof, ctx) {
    return renderRollingTrend(m, prof, ctx);
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
    var m = ctx.tonightMatchup;
    if (!m || !m.away || !m.home) return '';
    return sectionCard('Tonight\'s Matchup', 'Head-to-head compare for tonight\'s game',
      renderTonightSnapshot(m),
      { icon: 'tonight', kicker: 'Tonight' });
  }

  function iconCircle(name) {
    var I = global.MLBMAIcons;
    var key = tpIcon(name);
    if (I && I.iconCircleHtml) return I.iconCircleHtml(key, true);
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
        icon: gap > 8 ? 'contact-hot' : gap < -8 ? 'contact-cold' : 'contact-flat',
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
        icon: 'platoon-profile',
        text: 'OSI split gap ' + Math.abs(m.osiR - m.osiL).toFixed(1) + ' (RHP '
          + m.osiR.toFixed(1) + ' vs LHP ' + m.osiL.toFixed(1) + ') — platoon matters for lineup construction.'
      });
    } else if (bbR != null && bbL != null && Math.abs(bbR - bbL) >= 3) {
      rows.push({
        icon: 'discipline-split',
        text: 'BB% vs RHP ' + bbR.toFixed(1) + '% vs LHP ' + bbL.toFixed(1) + '% — discipline shifts by handedness.'
      });
    }
    if (m.ppGap != null && Math.abs(m.ppGap) >= 4) {
      rows.push({
        icon: m.ppGap >= 4 ? 'process-upside' : 'regression-watch',
        label: m.ppGap >= 4 ? 'Process Upside' : 'Regression Watch',
        text: 'PP-Gap ' + (m.ppGap >= 0 ? '+' : '') + m.ppGap.toFixed(1) + ' — projOSI vs current OSI spread.'
      });
    }
    rows = rows.filter(Boolean).slice(0, 3);
    if (!rows.length) {
      return sectionCard('Analyst Take', 'Rule-based callouts from real metrics',
        '<p class="ca-helper">Insufficient split data for analyst callouts.</p>',
        { icon: 'analyst-take', kicker: 'Analysis', sectionId: 'analyst-take' });
    }
    var body = '<div class="ca-insight-rail tp-analyst-rail">' + rows.map(function(r) {
      return '<div class="ca-insight-row">'
        + iconCircle(r.icon)
        + '<span><span class="ca-insight-label">' + esc(r.label) + '</span>'
        + '<span class="ca-insight-text">' + esc(r.text) + '</span></span></div>';
    }).join('') + '</div>';
    return sectionCard('Analyst Take', 'Notable angles from this team\'s real metrics', body,
      { icon: 'analyst-take', kicker: 'Analysis', sectionId: 'analyst-take' });
  }

  function renderSplitCards(m) {
    if (!Mini || !Mini.renderSnapshot) return '';
    /* Split pair rendered inside snapshot; expose standalone wrapper for ordering */
    return '';
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveM(prof, team, ctxForSection(ctx, prof, team, 'offense'));
    var html = '';
    html += renderOffenseProfile(m, prof, ctxForSection(ctx, prof, team, 'offense'));
    html += renderSurfaceWins(ctx.resultsRow, ctx.getSectionWindow ? ctx.getSectionWindow('surface') : ctx.window, ctx);
    html += renderRollingTrend(resolveM(prof, team, ctx), prof, ctx);
    html += renderScheduleContext(ctxForSection(ctx, prof, team, 'schedule'), ctx.resultsRow, ctx.window);
    if (global.TeamProfileIntel) {
      html += TeamProfileIntel.renderSustainabilitySection(
        resolveM(prof, team, ctxForSection(ctx, prof, team, 'sustainability')),
        prof,
        ctxForSection(ctx, prof, team, 'sustainability')
      );
    }
    if (typeof ctx.renderBattingSection === 'function') {
      html += ctx.renderBattingSection(team, ctxForSection(ctx, prof, team, 'batting'));
    }
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
    phase1Chip: phase1Chip,
    buildTeamMetricCache: buildTeamMetricCache,
    leagueRank: leagueRank,
    rankTone: rankTone
  };
})(typeof window !== 'undefined' ? window : this);
