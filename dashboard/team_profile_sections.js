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

  function metricGrid(headers, cells) {
    return '<div class="tp-metric-grid tp-metric-grid--header-row">'
      + '<div class="tp-metric-grid-head">' + headers.map(function(h) {
        return '<span class="tp-metric-grid-h">' + esc(h) + '</span>';
      }).join('') + '</div>'
      + '<div class="tp-metric-grid-body">' + cells.join('') + '</div></div>';
  }

  function metricSlot(label, v, ctx, invert, decimals) {
    return chipOnly(v, ctx, invert, decimals, label);
  }

  function sectionCard(eyebrow, title, subtitle, body) {
    return '<section class="ca-card tp-section">'
      + (window.MLBMAAssets && MLBMAAssets.sectionHeaderHtml
        ? MLBMAAssets.sectionHeaderHtml({ eyebrow: eyebrow, title: title, subtitle: subtitle || '' })
        : '<header class="ca-section-header"><p class="ca-eyebrow">' + esc(eyebrow) + '</p><h2 class="ca-section-title">'
          + esc(title) + '</h2></header>')
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

  function renderScoring(m, prof, ctx) {
    var rates = (Mini && Mini.resolveOffenseRates) ? Mini.resolveOffenseRates(prof, ctx) : {};
    var wrc = ctx.wrc != null ? ctx.wrc : rates.wrc;
    var woba = rates.woba;
    var xwoba = rates.xwoba;
    var slg = rates.slg;
    var hr = rates.hr;
    var k = rates.k;
    var bb = rates.bb;
    var barrel = rates.barrel;
    var hard = rates.hard;

    var summary = '';
    if (woba != null && xwoba != null) {
      var delta = (woba - xwoba) * 1000;
      summary = '<p class="ca-helper tp-summary-line">wOBA '
        + (delta > 5 ? 'outpaces' : delta < -5 ? 'trails' : 'tracks')
        + ' xwOBA by <strong>' + Math.abs(Math.round(delta)) + '</strong> points.</p>';
    }

    var slots = [
      ['wRC+', wrc, 'wrc', false, 0],
      ['wOBA', woba, 'woba', false, 3],
      ['xwOBA', xwoba, 'woba', false, 3],
      ['SLG', slg, 'woba', false, 3],
      ['HR', hr, 'wrc', false, 0],
      ['K%', k, 'pitching', true, 1],
      ['BB%', bb, 'obr', false, 1],
      ['Barrel%', barrel, 'rcv', false, 1],
      ['HardHit%', hard, 'rcv', false, 1]
    ];
    var headers = slots.map(function(s) { return s[0]; }).concat(['AVG', 'OBP', 'OPS']);
    var cells = slots.map(function(s) {
      return chipOnly(s[1], s[2], s[3], s[4], s[0]);
    });
    cells.push(phase1Chip('AVG'));
    cells.push(phase1Chip('OBP'));
    cells.push(phase1Chip('OPS'));

    return sectionCard('Scoring', 'Scoring', 'Rate line on active split · created metrics in Process',
      metricGrid(headers, cells) + summary);
  }

  function renderProcess(m) {
    var headers = ['OSI', 'RCV', 'ABQ', 'OBR', 'projOSI', 'PP-Gap'];
    var cells = [
      chipOnly(m.osi, 'osi', false, 1, 'OSI'),
      chipOnly(m.rcv, 'rcv', false, 1, 'RCV'),
      chipOnly(m.abq, 'abq', false, 1, 'ABQ'),
      chipOnly(m.obr, 'obr', false, 1, 'OBR'),
      chipOnly(m.proj, 'osi', false, 1, 'projOSI'),
      chipOnly(m.ppGap, 'ppGap', false, 1, 'PP-Gap')
    ];
    return sectionCard('Process', 'Process', 'Created metrics + projection spread',
      metricGrid(headers, cells));
  }

  function renderPitchingFaced(ctx) {
    var pals = ctx.pals;
    var xfip = ctx.xfipFaced;
    if (pals == null && xfip == null) {
      return sectionCard('Pitching Faced', 'Quality of Arms Seen', 'PALS tab — run compute_pals pipeline step',
        '<p class="ca-helper">PALS and avg xFIP faced not loaded for this team.</p>');
    }
    return sectionCard('Pitching Faced', 'Pitching Faced', 'Schedule-adjusted difficulty (PALS tab)',
      metricGrid(['PALS', 'xFIP Faced'], [
        chipOnly(pals, 'osi', false, 1, 'PALS'),
        chipOnly(xfip, 'pitching', true, 2, 'xFIP Faced')
      ]));
  }

  function renderSurfaceWins(resultsRow, window) {
    var r = resultsForWindow(resultsRow, window);
    var body = metricGrid(['Win%', 'F5 Win%', 'Pitcher Win%'], [
      chipOnly(r.winPct, 'osi', false, 1, 'Win%'),
      chipOnly(r.f5WinPct, 'osi', false, 1, 'F5 Win%'),
      chipOnly(r.spWinPct, 'pitching', false, 1, 'Pitcher Win%')
    ]);
    if (A && A.f5WarningHtml) body += A.f5WarningHtml();
    if (r.qsPct != null) {
      body += metricGrid(['QS%'], [chipOnly(r.qsPct, 'pitching', false, 1, 'QS%')]);
    } else {
      body += '<p class="ca-helper tp-phase1-inline">QS% — <span class="tp-phase1-tag">Phase 1</span> (wire game-results QS to profile)</p>';
    }
    return sectionCard('Surface', 'Surface Wins', 'Team_Results · ' + (window || 'YTD'),
      body);
  }

  function renderMomentum(m, prof, ctx) {
    var pickCol = ctx.pickCol;
    var hotCold = '';
    if (m.osiL7 != null && m.osiYtd != null) {
      if (m.osiL7 - m.osiYtd >= 8) hotCold = ' <span class="pill-hot">Hot</span>';
      else if (m.osiL7 - m.osiYtd <= -8) hotCold = ' <span class="pill-cold">Cold</span>';
    }

    function formatWindowDelta(delta) {
      if (delta == null || isNaN(delta)) return '—';
      if (Math.abs(delta) < 0.005) return '0.0';
      var dec = Math.abs(delta) < 10 ? 2 : 1;
      var text = delta.toFixed(dec);
      if (text === '-0.00' || text === '-0.0') text = '0.0';
      return (delta > 0 ? '+' : '') + text;
    }

    function trendDelta(ytd, l30, l14, l7) {
      if (l7 == null) return null;
      if (ytd != null && Math.abs(l7 - ytd) >= 0.05) return l7 - ytd;
      if (l30 != null && Math.abs(l7 - l30) >= 0.05) return l7 - l30;
      if (l14 != null && Math.abs(l7 - l14) >= 0.05) return l7 - l14;
      if (ytd != null) return l7 - ytd;
      return null;
    }

    function trendRow(label, ytd, l30, l14, l7) {
      var delta = trendDelta(ytd, l30, l14, l7);
      var deltaCls = delta == null ? '' : delta > 2 ? ' trend-up' : delta < -2 ? ' trend-down' : ' trend-flat';
      return '<tr><td>' + esc(label) + '</td>'
        + '<td class="num">' + valChip(ytd, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l30, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l14, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l7, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num' + deltaCls + '">' + formatWindowDelta(delta) + '</td></tr>';
    }

    var staleNote = '';
    if (m.osiYtd != null && m.osiL7 != null && m.osiL30 != null
        && Math.abs(m.osiL7 - m.osiYtd) < 0.05
        && Math.abs(m.osiL30 - m.osiYtd) < 0.05
        && Math.abs(m.osiL14 - m.osiYtd) < 0.05) {
      staleNote = '<p class="ca-helper tp-window-stale">Rolling windows match YTD — run <code>scrape_batter_splits</code> + team profile push for live L7/L14/L30 splits.</p>';
    }

    var table = '<div class="table-wrap tp-table-wrap"><table class="hub-table tp-table"><thead><tr>'
      + '<th>Metric</th><th>YTD</th><th>L30</th><th>L14</th><th>L7</th><th>Δ L7</th></tr></thead><tbody>'
      + trendRow('OSI', m.osiYtd, m.osiL30, m.osiL14, m.osiL7)
      + trendRow('RCV', m.rcvYtd, m.rcvL30, m.rcvL14, m.rcvL7)
      + trendRow('OBR', m.obrYtd, m.obrL30, m.obrL14, m.obrL7)
      + '</tbody></table></div>';
    return sectionCard('Momentum', 'Window Trends' + hotCold, 'OSI / RCV / OBR across rolling windows · Δ uses L7−YTD, else L7−L30/L14', table + staleNote);
  }

  function renderTonight(ctx) {
    if (!ctx.tonightGame) return '';
    var g = ctx.tonightGame;
    var edge = (ctx.teamOsi != null && ctx.oppPitchScore != null) ? ctx.teamOsi - ctx.oppPitchScore : null;
    var body = '<div class="tp-matchup-panel">';
    body += '<p><strong>Opponent:</strong> ' + esc(g.oppName || g.opp) + (g.oppOsi != null ? ' · OSI ' + g.oppOsi.toFixed(1) : '') + '</p>';
    body += '<p><strong>Opposing SP:</strong> ' + esc(g.spName || 'TBD') + (g.oppPs != null ? ' · Pitch Score ' + g.oppPs.toFixed(1) : '') + '</p>';
    if (edge != null) {
      body += '<p><strong>Lineup edge (OSI − opp Pitch):</strong> <span class="' + (edge > 0 ? 'trend-up' : 'trend-down') + '">'
        + (edge >= 0 ? '+' : '') + edge.toFixed(1) + '</span></p>';
    }
    if (ctx.lineupEdgePct != null) {
      body += '<div class="tp-edge-bar" style="--edge:' + Math.max(0, Math.min(100, ctx.lineupEdgePct)) + '%"></div>';
    }
    body += '<a class="ca-btn ca-btn--primary" href="matchup_compare.html">View full matchup</a></div>';
    return sectionCard('Tonight', 'Matchup Context', 'Today\'s slate — compact compare slice', body);
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
    html += renderScoring(m, prof, ctx);
    html += renderProcess(m);
    html += renderPitchingFaced(ctx);
    html += renderSurfaceWins(ctx.resultsRow, ctx.window);
    html += renderMomentum(m, prof, ctx);
    html += renderTonight(ctx);
    html += renderAnalystTake(m, prof, ctx);
    return html.replace(/<\/?motion>/g, '');
  }

  global.TeamProfileSections = {
    renderAll: renderAll,
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
