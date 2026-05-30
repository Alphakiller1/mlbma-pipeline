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

  function phase1Slot(label) {
    return '<span class="tp-metric-slot tp-phase1-slot" title="Phase 1 — export not wired">'
      + '<span class="tp-metric-k">' + esc(label) + '</span>'
      + '<span class="chip c-na">—</span>'
      + '<span class="tp-phase1-tag">Phase 1</span></span>';
  }

  function metricSlot(label, v, ctx, invert, decimals) {
    return '<span class="tp-metric-slot"><span class="tp-metric-k">' + esc(label) + '</span>'
      + valChip(v, ctx, invert, decimals) + '</span>';
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
    var wrc = ctx.wrc != null ? ctx.wrc : pf(prof, ['wrc_plus', 'wRC+', 'wrc'], ctx.pickCol);
    var woba = pf(prof, ['woba', 'wOBA'], ctx.pickCol);
    return sectionCard('Scoring', 'Offensive Quality', 'Team Rankings — Scoring family',
      chipRow([
        metricSlot('OSI', m.osi, 'osi', false, 1),
        metricSlot('wRC+', wrc, 'wrc', false, 0),
        metricSlot('wOBA', woba, 'woba', false, 3),
        metricSlot('RCV', m.rcv, 'rcv', false, 1)
      ]));
  }

  function renderProcess(m) {
    return sectionCard('Process', 'Process & Projection', 'Difficulty + Status families',
      chipRow([
        metricSlot('ABQ', m.abq, 'abq', false, 1),
        metricSlot('OBR', m.obr, 'obr', false, 1),
        metricSlot('projOSI', m.proj, 'osi', false, 1),
        metricSlot('PP-Gap', m.ppGap, 'ppGap', false, 1),
        metricSlot('PALS', m.pals, 'osi', false, 1)
      ]));
  }

  function renderFullSeasonLine(prof, ctx) {
    var pickCol = ctx.pickCol;
    var woba = pf(prof, ['woba', 'wOBA'], pickCol);
    var xwoba = pf(prof, ['xwoba', 'xwOBA'], pickCol);
    var slg = pf(prof, ['slg', 'SLG'], pickCol);
    var hr = pf(prof, ['hr', 'HR'], pickCol);
    var k = pf(prof, ['k_pct', 'K%'], pickCol);
    var bb = pf(prof, ['bb_pct', 'BB%'], pickCol);
    var barrel = pf(prof, ['barrel_pct', 'Barrel%'], pickCol);
    var hard = pf(prof, ['hardhit_pct', 'HardHit%'], pickCol);
    var wrc = ctx.wrc != null ? ctx.wrc : pf(prof, ['wrc_plus', 'wRC+'], pickCol);
    var summary = '';
    if (woba != null && xwoba != null) {
      var delta = (woba - xwoba) * 1000;
      summary = '<p class="ca-helper tp-summary-line">wOBA '
        + (delta > 5 ? 'outpaces' : delta < -5 ? 'trails' : 'tracks')
        + ' xwOBA by <strong>' + Math.abs(Math.round(delta)) + '</strong> points.</p>';
    }
    var slots = [
      metricSlot('wRC+', wrc, 'wrc', false, 0),
      metricSlot('wOBA', woba, 'woba', false, 3),
      metricSlot('xwOBA', xwoba, 'woba', false, 3),
      metricSlot('SLG', slg, 'woba', false, 3),
      metricSlot('HR', hr, 'wrc', false, 0),
      metricSlot('K%', k, 'pitching', true, 1),
      metricSlot('BB%', bb, 'obr', false, 1),
      metricSlot('Barrel%', barrel, 'rcv', false, 1),
      metricSlot('HardHit%', hard, 'rcv', false, 1),
      phase1Slot('AVG'),
      phase1Slot('OBP'),
      phase1Slot('OPS')
    ];
    return sectionCard('Offense', 'Full-Season Offense Line', 'Compare Mode-1 core metrics',
      '<div class="tp-metric-grid">' + slots.join('') + '</div>' + summary);
  }

  function renderHomeAway(prof, ctx) {
    var pickCol = ctx.pickCol;
    function col(prefix, label, ctxKey) {
      return '<div class="tp-ha-col"><h4>' + esc(label) + '</h4>'
        + metricSlot('OSI', pf(prof, [prefix + '_osi'], pickCol), 'osi', false, 1)
        + metricSlot('wRC+', pf(prof, [prefix + '_wrc'], pickCol), 'wrc', false, 0)
        + metricSlot('wOBA', pf(prof, [prefix + '_woba'], pickCol), 'woba', false, 3)
        + metricSlot('SLG', pf(prof, [prefix + '_slg'], pickCol), 'woba', false, 3)
        + '</div>';
    }
    return sectionCard('Location', 'Home / Away Splits', 'Location filter — real split columns',
      '<div class="tp-ha-grid">' + col('home', 'Home') + col('away', 'Away') + '</div>');
  }

  function renderHandednessSplits(prof, team, ctx) {
    if (!Mini || !Mini.splitPairHtml) return '';
    var m = resolveM(prof, team, ctx);
    return sectionCard('Platoon', 'Handedness Splits', 'vs RHP / vs LHP — centerpiece compare profile',
      '<div class="tp-split-section">' + Mini.splitPairHtml(m) + '</div>');
  }

  function renderSurfaceWins(resultsRow, window) {
    var r = resultsForWindow(resultsRow, window);
    var body = chipRow([
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
    function trendRow(label, ytd, l30, l14, l7) {
      var delta = (l7 != null && ytd != null) ? l7 - ytd : null;
      var deltaCls = delta == null ? '' : delta > 2 ? ' trend-up' : delta < -2 ? ' trend-down' : ' trend-flat';
      return '<tr><td>' + esc(label) + '</td>'
        + '<td class="num">' + valChip(ytd, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l30, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l14, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num">' + valChip(l7, label.toLowerCase(), false, 1) + '</td>'
        + '<td class="num' + deltaCls + '">' + (delta != null ? ((delta >= 0 ? '+' : '') + delta.toFixed(1)) : '—') + '</td></tr>';
    }
    var table = '<div class="table-wrap tp-table-wrap"><table class="hub-table tp-table"><thead><tr>'
      + '<th>Metric</th><th>YTD</th><th>L30</th><th>L14</th><th>L7</th><th>Δ L7</th></tr></thead><tbody>'
      + trendRow('OSI', m.osiYtd, m.osiL30, m.osiL14, m.osiL7)
      + trendRow('RCV', m.rcvYtd, m.rcvL30, m.rcvL14, m.rcvL7)
      + trendRow('OBR', m.obrYtd, m.obrL30, m.obrL14, m.obrL7)
      + '</tbody></table></div>';
    return sectionCard('Momentum', 'Window Trends' + hotCold, 'OSI / RCV / OBR across rolling windows', table);
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
    var pickCol = ctx.pickCol;
    var rows = [];
    var woba = pf(prof, ['woba', 'wOBA'], pickCol);
    var xwoba = pf(prof, ['xwoba', 'xwOBA'], pickCol);
    if (woba != null && xwoba != null) {
      var gap = (woba - xwoba) * 1000;
      rows.push({
        icon: gap > 8 ? 'trend-up' : gap < -8 ? 'trend-down' : 'target',
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
        icon: 'swap',
        label: 'Platoon Profile',
        text: 'OSI split gap ' + Math.abs(m.osiR - m.osiL).toFixed(1) + ' (RHP '
          + m.osiR.toFixed(1) + ' vs LHP ' + m.osiL.toFixed(1) + ') — platoon matters for lineup construction.'
      });
    } else if (bbR != null && bbL != null && Math.abs(bbR - bbL) >= 3) {
      rows.push({
        icon: 'discipline',
        label: 'Plate Discipline Split',
        text: 'BB% vs RHP ' + bbR.toFixed(1) + '% vs LHP ' + bbL.toFixed(1) + '% — discipline shifts by handedness.'
      });
    }
    if (m.ppGap != null && Math.abs(m.ppGap) >= 4) {
      rows.push({
        icon: m.ppGap >= 4 ? 'trend-up' : 'regression',
        label: m.ppGap >= 4 ? 'Process Upside' : 'Regression Watch',
        text: 'PP-Gap ' + (m.ppGap >= 0 ? '+' : '') + m.ppGap.toFixed(1) + ' — projOSI vs current OSI spread.'
      });
    }
    rows = rows.filter(Boolean).slice(0, 3);
    if (!rows.length) {
      return sectionCard('Analysis', 'Analyst Take', 'Rule-based callouts from real metrics',
        '<p class="ca-helper">Insufficient split data for analyst callouts.</p>');
    }
    var body = '<div class="ca-insight-rail tp-analyst-rail">' + rows.map(function(r) {
      return '<div class="ca-insight-row">'
        + iconCircle(r.icon)
        + '<span><span class="ca-insight-label">' + esc(r.label) + '</span>'
        + '<span class="ca-insight-text">' + esc(r.text) + '</span></span></div>';
    }).join('') + '</div>';
    return sectionCard('Analysis', 'Analyst Take', 'Notable angles from this team\'s real metrics', body);
  }

  function renderSplitCards(m) {
    if (!Mini || !Mini.renderSnapshot) return '';
    /* Split pair rendered inside snapshot; expose standalone wrapper for ordering */
    return '';
  }

  function renderAll(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveM(prof, team, ctx);
    var html = '';
    html += renderScoring(m, prof, ctx);
    html += renderProcess(m);
    html += renderFullSeasonLine(prof, ctx);
    html += renderHandednessSplits(prof, team, ctx);
    html += renderHomeAway(prof, ctx);
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
    renderFullSeasonLine: renderFullSeasonLine,
    renderHandednessSplits: renderHandednessSplits,
    renderSurfaceWins: renderSurfaceWins,
    renderMomentum: renderMomentum,
    renderTonight: renderTonight,
    renderAnalystTake: renderAnalystTake,
    phase1Slot: phase1Slot
  };
})(typeof window !== 'undefined' ? window : this);
