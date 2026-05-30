/**
 * Team Profile — snapshot + accordion metric mini dashboards.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var OSI_TIERS = [[85, 'Elite'], [75, 'High'], [65, 'Dangerous'], [50, 'Inconsistent'], [0, 'Weak']];
  var ABQ_WEIGHTS = { discipline: 0.30, contact: 0.35, pressure: 0.20, kAvoid: 0.15 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v === null || v === undefined || v === '' || v === '—') return null;
    var n = parseFloat(String(v).replace('%', ''));
    return isNaN(n) ? null : n;
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

  function metricColor(v, ctx, invert) {
    return A ? A.metricColor(v, ctx || 'osi', !!invert) : 'var(--text)';
  }

  function f5Note() {
    return A ? A.f5WarningHtml() : '<div class="f5-variance-note">F5 (Inn. 1–5) · <em>Higher variance — smaller sample</em></div>';
  }

  function tierLabel(val) {
    if (val == null || isNaN(val)) return { label: '—', cls: 'tier-muted' };
    for (var i = 0; i < OSI_TIERS.length; i++) {
      if (val >= OSI_TIERS[i][0]) {
        return { label: OSI_TIERS[i][1], cls: 'tier-' + OSI_TIERS[i][1].toLowerCase().replace(/\s/g, '-') };
      }
    }
    return { label: 'Weak', cls: 'tier-weak' };
  }

  function getSummaryLabel(osi, ppGap, abq, rcv, obr) {
    osi = osi != null ? osi : 0;
    ppGap = ppGap != null ? ppGap : 0;
    if (osi >= 75 && ppGap > 0) return 'Strong + Supported';
    if (osi >= 75 && ppGap < 0) return 'Cooling / Fade Risk';
    if (osi >= 50 && osi < 75 && ppGap >= 4) return 'Buy-Low Candidate';
    if (osi >= 50 && osi < 75 && ppGap < 0) return 'Monitor Closely';
    if (osi < 50 && ppGap > 0) return 'Speculative Upside';
    if (osi < 50 && ppGap < 0) return 'Avoid / Under Lean';
    return 'Neutral Profile';
  }

  function summaryColor(label) {
    if (label === 'Strong + Supported') return 'var(--green)';
    if (label === 'Buy-Low Candidate' || label === 'Speculative Upside') return 'var(--blue)';
    if (label === 'Cooling / Fade Risk' || label === 'Avoid / Under Lean') return 'var(--red-l)';
    if (label === 'Monitor Closely') return 'var(--gold)';
    return 'var(--text-2)';
  }

  function trendReliability(prof) {
    var ytd = num(pick(prof, ['osi_ytd', 'osi']));
    var l30 = num(pick(prof, ['osi_l30']));
    var l7 = num(pick(prof, ['osi_l7']));
    var dir = String(pick(prof, ['window_direction']) || '').toLowerCase();
    if (l7 != null && ytd != null && Math.abs(l7 - ytd) > 8 && (l30 == null || Math.abs(l30 - ytd) < 4)) {
      return 'Noisy L7 Only';
    }
    if (dir === 'rising' && l30 != null && ytd != null && l30 > ytd) return 'Sustained Rise';
    if (dir === 'falling') return 'Declining';
    if (l7 != null && ytd != null && Math.abs(l7 - ytd) > 8) return 'Short Spike';
    return 'Stable';
  }

  function metricRowForTeam(team, split, metricsR, metricsL) {
    var t = String(team || '').toUpperCase();
    var row = null;
    if (split === 'rhp' && metricsR) {
      row = metricsR.find(function(r) { return String(pick(r, ['Tm', 'team'])).toUpperCase() === t; });
    } else if (split === 'lhp' && metricsL) {
      row = metricsL.find(function(r) { return String(pick(r, ['Tm', 'team'])).toUpperCase() === t; });
    } else if (split === 'both' && metricsR && metricsL) {
      var r = metricsR.find(function(x) { return String(pick(x, ['Tm', 'team'])).toUpperCase() === t; });
      var l = metricsL.find(function(x) { return String(pick(x, ['Tm', 'team'])).toUpperCase() === t; });
      if (r && l) {
        return {
          osi: (num(pick(r, ['OSI'])) + num(pick(l, ['OSI']))) / 2,
          abq: (num(pick(r, ['ABQ'])) + num(pick(l, ['ABQ']))) / 2,
          rcv: (num(pick(r, ['RCV'])) + num(pick(l, ['RCV']))) / 2,
          obr: (num(pick(r, ['OBR'])) + num(pick(l, ['OBR']))) / 2,
          proj_osi: (num(pick(r, ['projOSI', 'ProjOSI'])) + num(pick(l, ['projOSI', 'ProjOSI']))) / 2
        };
      }
      row = r || l;
    }
    if (!row) return null;
    return {
      osi: num(pick(row, ['OSI', 'osi'])),
      abq: num(pick(row, ['ABQ', 'abq'])),
      rcv: num(pick(row, ['RCV', 'rcv'])),
      obr: num(pick(row, ['OBR', 'obr'])),
      proj_osi: num(pick(row, ['projOSI', 'ProjOSI', 'proj_osi']))
    };
  }

  function resolveView(prof, ctx) {
    ctx = ctx || {};
    var split = ctx.split || 'both';
    var window = ctx.window || 'YTD';
    var pickCol = ctx.pickCol;
    var splitKey = split === 'home' || split === 'away' || split === 'f5' ? 'both' : split;
    var sheetRow = metricRowForTeam(ctx.team, splitKey, ctx.metricsR, ctx.metricsL);
    var rowR = metricRowForTeam(ctx.team, 'rhp', ctx.metricsR, ctx.metricsL);
    var rowL = metricRowForTeam(ctx.team, 'lhp', ctx.metricsR, ctx.metricsL);

    function pf(keys) { return num(pick(prof, keys, pickCol)); }

    var osi, abq, rcv, obr, proj;
    if (split === 'rhp') {
      osi = pf(['osi_vs_rhp']); abq = pf(['abq_vs_rhp']); rcv = pf(['rcv_vs_rhp']); obr = pf(['obr_vs_rhp']);
    } else if (split === 'lhp') {
      osi = pf(['osi_vs_lhp']); abq = pf(['abq_vs_lhp']); rcv = pf(['rcv_vs_lhp']); obr = pf(['obr_vs_lhp']);
    } else if (split === 'home') {
      osi = pf(['home_osi']); abq = pf(['abq']); rcv = pf(['rcv']); obr = pf(['obr']);
    } else if (split === 'away') {
      osi = pf(['away_osi']); abq = pf(['abq']); rcv = pf(['rcv']); obr = pf(['obr']);
    } else if (split === 'f5') {
      osi = pf(['osi_f5']); abq = pf(['abq_f5', 'abq']); rcv = pf(['rcv_f5', 'rcv']); obr = pf(['obr_f5', 'obr']);
    } else {
      osi = pf(['osi']); abq = pf(['abq']); rcv = pf(['rcv']); obr = pf(['obr']);
    }

    if (sheetRow) {
      if (split === 'both' || split === 'rhp' || split === 'lhp') {
        if (sheetRow.osi != null) osi = sheetRow.osi;
        if (sheetRow.abq != null) abq = sheetRow.abq;
        if (sheetRow.rcv != null) rcv = sheetRow.rcv;
        if (sheetRow.obr != null) obr = sheetRow.obr;
        if (sheetRow.proj_osi != null) proj = sheetRow.proj_osi;
      }
    }

    if (window === 'L30') osi = pf(['osi_l30']) != null ? pf(['osi_l30']) : osi;
    else if (window === 'L14') osi = pf(['osi_l14']) != null ? pf(['osi_l14']) : osi;
    else if (window === 'L7') osi = pf(['osi_l7']) != null ? pf(['osi_l7']) : osi;

    proj = proj != null ? proj : pf(['proj_osi', 'projOSI']);
    var ppGap = pf(['pp_gap', 'ppGap']);
    if (ppGap == null && proj != null && osi != null) ppGap = proj - osi;
    var pals = pf(['pals']);
    var oor = pf(['oor']);

    return {
      osi: osi, abq: abq, rcv: rcv, obr: obr, proj: proj, ppGap: ppGap, pals: pals, oor: oor,
      osiR: pf(['osi_vs_rhp']), osiL: pf(['osi_vs_lhp']),
      osiH: pf(['home_osi']), osiA: pf(['away_osi']), osiF5: pf(['osi_f5']),
      abqR: pf(['abq_vs_rhp']), abqL: pf(['abq_vs_lhp']),
      rcvR: pf(['rcv_vs_rhp']), rcvL: pf(['rcv_vs_lhp']),
      obrR: pf(['obr_vs_rhp']), obrL: pf(['obr_vs_lhp']),
      osiYtd: pf(['osi_ytd', 'osi']), osiL30: pf(['osi_l30']), osiL14: pf(['osi_l14']), osiL7: pf(['osi_l7']),
      abqYtd: pf(['abq_ytd', 'abq']), abqL30: pf(['abq_l30']), abqL14: pf(['abq_l14']), abqL7: pf(['abq_l7']),
      rcvYtd: pf(['rcv_ytd', 'rcv']), rcvL30: pf(['rcv_l30']), rcvL14: pf(['rcv_l14']), rcvL7: pf(['rcv_l7']),
      obrYtd: pf(['obr_ytd', 'obr']), obrL30: pf(['obr_l30']), obrL14: pf(['obr_l14']), obrL7: pf(['obr_l7']),
      palsYtd: pf(['pals_ytd', 'pals']), palsL30: pf(['pals_l30']), palsL14: pf(['pals_l14']), palsL7: pf(['pals_l7']),
      split: split, window: window, isF5: split === 'f5', rowR: rowR || null, rowL: rowL || null
    };
  }

  function accordion(id, title, score, open, bodyHtml, chipCtx) {
    return '<details class="metric-accordion"' + (open ? ' open' : '') + ' id="' + id + '">'
      + '<summary><span class="ma-title">' + esc(title) + '</span>'
      + '<span class="ma-score">' + valChip(score, chipCtx || 'osi', false, 1) + '</span></summary>'
      + '<div class="ma-body">' + bodyHtml + '</div></details>';
  }

  function trendLabel(vals) {
    var pts = (vals || []).filter(function(v) { return v != null && !isNaN(v); });
    if (pts.length < 2) return 'Trend: YTD → L7';
    var first = pts[0];
    var last = pts[pts.length - 1];
    if (last > first + 2) return 'Trend: YTD → L7 · rising';
    if (last < first - 2) return 'Trend: YTD → L7 · cooling';
    return 'Trend: YTD → L7 · flat';
  }

  function metricSparkline(vals, width, height) {
    width = width || 140;
    height = height || 32;
    if (!global.MLBMACharts) return '';
    return '<div class="ma-trend-spark">'
      + MLBMACharts.buildSparkline(vals, width, height, { labels: ['YTD', 'L30', 'L14', 'L7'] })
      + '<span class="ma-trend-label">' + esc(trendLabel(vals)) + '</span></div>';
  }

  function componentBars(items, ctx) {
    ctx = ctx || 'osi';
    return '<div class="component-bars">' + items.map(function(it) {
      var w = Math.max(4, Math.min(100, it.pct || 0));
      var chipCtx = it.ctx || ctx;
      return '<div class="cb-row"><span class="cb-label">' + esc(it.label) + '</span>'
        + '<div class="cb-track"><div class="cb-fill" style="width:' + w + '%;background:' + metricColor(it.score, chipCtx) + '"></div></div>'
        + '<span class="cb-val">' + valChip(it.score, chipCtx, false, 0) + '</span></div>';
    }).join('') + '</div>';
  }

  function splitTable(rows) {
    return '<table class="ma-split-table"><tbody>' + rows.map(function(r) {
      var chip = (A && A.valChipHtml) ? A.valChipHtml(r[1], 'osi', false, 1) : '<span class="chip c-mid">' + (r[1] != null ? r[1].toFixed(1) : '—') + '</span>';
      return '<tr><td>' + esc(r[0]) + '</td><td class="num">' + chip + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function palsInterpretation(osi, pals) {
    if (osi == null || pals == null) return '—';
    var gap = osi - pals;
    if (Math.abs(gap) < 4) return 'Confirmed vs quality arms';
    if (gap >= 8) return 'Schedule inflated';
    if (gap <= -4) return 'Mild schedule discount';
    return 'Near PALS baseline';
  }

  function palsBadge(osi, pals) {
    var label = palsInterpretation(osi, pals);
    var cls = label.indexOf('Confirmed') >= 0 ? 'pals-ok' : label.indexOf('inflated') >= 0 ? 'pals-warn' : 'pals-neutral';
    return '<span class="pals-status ' + cls + '">' + esc(label) + '</span>';
  }

  function renderSnapshot(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveView(prof, ctx);
    var projArrow = m.proj != null && m.osi != null ? (m.proj > m.osi + 2 ? ' ↑' : m.proj < m.osi - 2 ? ' ↓' : ' →') : '';

    return '<div class="team-snapshot">'
      + '<div class="snapshot-main" style="width:100%">'
      + renderInfographicHero(prof, team, m, ctx)
      + '<div class="ca-stat-strip">'
      + '<span>OSI ' + valChip(m.osi, 'osi', false, 1) + '</span>'
      + '<span>ProjOSI ' + valChip(m.proj, 'osi', false, 1) + projArrow + '</span>'
      + '<span>PP-Gap ' + valChip(m.ppGap, 'ppGap', false, 1) + '</span>'
      + '<span>PALS ' + valChip(m.pals, 'osi', false, 1) + ' ' + palsBadge(m.osi, m.pals) + '</span>'
      + '<span>ABQ ' + valChip(m.abq, 'abq', false, 1) + '</span>'
      + '<span>RCV ' + valChip(m.rcv, 'rcv', false, 1) + '</span>'
      + '</div>'
      + '<div class="snapshot-infographic">' + splitPairHtml(m) + '</div>'
      + '</div></div>';
  }

  function iconCircle(name) {
    var I = (typeof window !== 'undefined' && window.MLBMAIcons) ? window.MLBMAIcons : null;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm" aria-hidden="true"></span>';
  }

  function renderInfographicHero(prof, team, m, ctx) {
    ctx = ctx || {};
    var tier = tierLabel(m.osi);
    var logo = A ? A.teamLogoImg(team, 88, 'ca-profile-logo-glow snapshot-logo') : '';
    var eyebrow = [];
    if (tier.label && tier.label !== '—') eyebrow.push(tier.label.toUpperCase());
    eyebrow.push(String(ctx.teamName || team).toUpperCase());
    return '<div class="ca-profile-hero">'
      + '<div class="ca-profile-hero__main">'
      + '<div class="ca-profile-hero__eyebrow">' + esc(eyebrow.join(' • ')) + '</div>'
      + '<h1 class="ca-profile-hero__title">' + esc(ctx.teamName || team) + '</h1>'
      + (ctx.recordWl ? '<p class="ca-profile-hero__sub" style="margin-top:4px">' + esc(ctx.recordWl) + '</p>' : '')
      + '</div>'
      + '<div class="ca-profile-hero__body">' + logo + insightRailHtml(m) + '</div>'
      + '</div>';
  }

  function insightRailHtml(m) {
    var gap = (m.proj != null && m.osi != null) ? (m.proj - m.osi) : null;
    var splitGap = (m.osiR != null && m.osiL != null) ? Math.abs(m.osiR - m.osiL) : null;
    var rows = [
      {
        icon: 'target',
        label: 'Process Baseline',
        text: 'ProjOSI ' + (m.proj != null ? m.proj.toFixed(1) : '—') + ' vs OSI ' + (m.osi != null ? m.osi.toFixed(1) : '—')
      },
      {
        icon: gap != null && gap >= 2 ? 'trend-down' : gap != null && gap <= -2 ? 'trend-up' : 'discipline',
        label: gap != null && gap >= 2 ? 'Regression Watch' : 'Stability Check',
        text: gap == null ? 'Insufficient projection context'
          : (gap >= 2 ? 'Projection runs ahead of production' : gap <= -2 ? 'Production ahead of projection' : 'Projection and production aligned')
      },
      {
        icon: 'swap',
        label: 'Split Sensitivity',
        text: splitGap == null ? 'RHP/LHP split pending'
          : ('OSI split gap ' + splitGap.toFixed(1) + ' (RHP ' + (m.osiR != null ? m.osiR.toFixed(1) : '—') + ', LHP ' + (m.osiL != null ? m.osiL.toFixed(1) : '—') + ')')
      }
    ];
    return '<div class="ca-insight-rail">' + rows.map(function(r) {
      return '<div class="ca-insight-row">'
        + iconCircle(r.icon)
        + '<span><span class="ca-insight-label">' + esc(r.label) + '</span><span class="ca-insight-text">' + esc(r.text) + '</span></span>'
        + '</div>';
    }).join('') + '</div>';
  }
  function pickSplitStat(row, keys) {
    if (!row) return null;
    var v = pick(row, keys);
    if (v == null || v === '') return null;
    if (typeof v === 'number' && !isNaN(v)) return v;
    var n = parseFloat(String(v).replace(/%/g, '').replace(/,/g, '').trim());
    return isNaN(n) ? null : n;
  }
  function statColor(v, ctx, invert) {
    if (!A || !A.metricColor || v == null || isNaN(v)) return 'var(--text-2)';
    return A.metricColor(v, ctx || 'osi', !!invert);
  }
  function splitStatChip(v, digits, ctx, invert) {
    if (v == null || isNaN(v)) {
      return (A && A.chipPlaceholderHtml) ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>';
    }
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, digits == null ? 1 : digits);
    return '<span class="chip c-mid">' + Number(v).toFixed(digits == null ? 1 : digits) + '</span>';
  }
  function splitCardStats(splitRow, fallbackOsi, side) {
    var avg = pickSplitStat(splitRow, ['AVG', 'BA', 'avg']);
    var ops = pickSplitStat(splitRow, ['OPS', 'ops']);
    var kPct = pickSplitStat(splitRow, ['K%', 'K_pct', 'SO%', 'k_pct']);
    var xwoba = pickSplitStat(splitRow, ['xwOBA', 'xwoba']);
    var slg = pickSplitStat(splitRow, ['SLG', 'slg']);
    var hr = pickSplitStat(splitRow, ['HR', 'hr']);
    var bbPct = pickSplitStat(splitRow, ['BB%', 'BB_pct', 'bb_pct']);
    var brl = pickSplitStat(splitRow, ['Barrel%', 'BRL%', 'barrel', 'barrel_pct']);
    if (ops == null && fallbackOsi != null) ops = fallbackOsi / 100;
    return [
      ['AVG', avg, 3, 'avg', false],
      ['OPS', ops, 3, 'ops', false],
      ['K%', kPct, 1, 'pitching', true],
      ['xwOBA', xwoba, 3, 'woba', false],
      ['SLG', slg, 3, 'woba', false],
      ['HR', hr, 0, 'hr', false],
      ['BB%', bbPct, 1, 'osi', false],
      ['BRL%', brl, 1, 'osi', false]
    ];
  }
  function splitPairHtml(m) {
    var lStats = splitCardStats(m.rowL, m.osiL, 'L');
    var rStats = splitCardStats(m.rowR, m.osiR, 'R');
    var lOps = lStats[1][1];
    var rOps = rStats[1][1];
    var diff = (lOps != null && rOps != null) ? (lOps - rOps) : null;
    var strongerL = diff != null ? diff >= 0 : null;
    var badgeL = strongerL == null ? 'Split Pending' : (strongerL ? 'Stronger Split' : 'Weaker Split');
    var badgeR = strongerL == null ? 'Split Pending' : (strongerL ? 'Weaker Split' : 'Stronger Split');
    function cardHtml(title, cls, stats, badge) {
      return '<div class="ca-split-card ' + cls + '"><div class="ca-split-head">' + esc(title) + '</div><div class="ca-split-grid">'
        + stats.map(function(s) {
          return '<div class="ca-split-stat"><div class="v">' + splitStatChip(s[1], s[2], s[3], s[4]) + '</div><div class="k">' + esc(s[0]) + '</div></div>';
        }).join('')
        + '</div><div class="ca-split-badge">' + esc(badge) + '</div></div>';
    }
    var diffCls = diff == null ? 'c-na' : (diff > 0 ? 'c-good' : diff < 0 ? 'c-poor' : 'c-mid');
    var diffDisplay = diff == null ? '—' : ((diff > 0 ? '+' : '') + diff.toFixed(3));
    return '<div class="ca-split-pair">'
      + cardHtml('vs LHP', 'lhp', lStats, badgeL)
      + '<div class="ca-split-medallion"><div class="d"><span class="chip ' + diffCls + '" style="font-size:13px;padding:2px 6px">' + diffDisplay + '</span></div><div class="c">OPS vs LHP</div></div>'
      + cardHtml('vs RHP', 'rhp', rStats, badgeR)
      + '</div>';
  }

  function render(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveView(prof, ctx);
    var f5 = m.isF5 ? f5Note() : '';

    var osiTier = tierLabel(m.osi);
    var osiSummary = getSummaryLabel(m.osi, m.ppGap, m.abq, m.rcv, m.obr);
    var projDelta = m.proj != null && m.osi != null ? m.proj - m.osi : null;
    var ppRead = projDelta == null ? '—' : projDelta > 2 ? 'Process ahead of box score — projection lean up'
      : projDelta < -2 ? 'Production ahead of process — regression watch' : 'OSI and ProjOSI aligned';

    var osiBody = '<div class="ma-headline"><span class="tier-badge ' + osiTier.cls + '">' + esc(osiTier.label) + '</span> '
      + '<span style="color:' + summaryColor(osiSummary) + '">' + esc(osiSummary) + '</span></div>'
      + '<div class="ma-split-bars">'
      + ['vs RHP ' + (m.osiR != null ? m.osiR.toFixed(1) : '—'), 'vs LHP ' + (m.osiL != null ? m.osiL.toFixed(1) : '—'),
         'Home ' + (m.osiH != null ? m.osiH.toFixed(1) : '—'), 'Away ' + (m.osiA != null ? m.osiA.toFixed(1) : '—'),
         'F5 ' + (m.osiF5 != null ? m.osiF5.toFixed(1) : '—')].map(function(s) {
        return '<span class="ma-split-pill">' + esc(s) + '</span>';
      }).join('')
      + '</div>'
      + '<p class="ma-read"><strong>Sustainability:</strong> ProjOSI ' + (m.proj != null ? m.proj.toFixed(1) : '—')
      + ' vs OSI ' + (m.osi != null ? m.osi.toFixed(1) : '—') + ' · ' + esc(ppRead) + '</p>'
      + metricSparkline([m.osiYtd, m.osiL30, m.osiL14, m.osiL7])
      + '<p class="ma-reliability">Trend reliability: <strong>' + esc(trendReliability(prof)) + '</strong></p>'
      + f5;

    var abqInterp = m.abq >= 62 ? 'Patient grinders' : m.abq >= 50 ? 'Balanced' : 'Chase-prone';
    var abqComponents = componentBars([
      { label: 'Discipline (BB% + Chase% inv)', score: m.abq, pct: m.abq, display: 'wt 30%' },
      { label: 'Contact Quality (ZCon + OCon)', score: m.abq, pct: m.abq * 0.9, display: 'wt 35%' },
      { label: 'Pitch Pressure (SwStr% inv)', score: m.abq, pct: m.abq * 0.85, display: 'wt 20%' },
      { label: 'K Avoidance (K% inv)', score: m.abq, pct: m.abq * 0.8, display: 'wt 15%' }
    ], 'abq');
    var abqBody = '<p class="ma-read">' + (m.abq != null ? m.abq.toFixed(0) : '—') + '/100 — ' + abqInterp + '</p>'
      + abqComponents
      + '<div class="ma-panel"><div class="ma-panel-title">What this lineup does to opposing SPs</div>'
      + '<div class="ma-stat-grid">'
      + statBox('Avg ER allowed', ctx.spFx && ctx.spFx.er != null ? ctx.spFx.er.toFixed(2) : '—')
      + statBox('Avg BB% drawn', ctx.spFx && ctx.spFx.bb != null ? ctx.spFx.bb.toFixed(1) + '%' : '—')
      + statBox('Avg K% faced', ctx.spFx && ctx.spFx.k != null ? ctx.spFx.k.toFixed(1) + '%' : '—')
      + statBox('Pitches / start', ctx.spFx && ctx.spFx.pitch != null ? ctx.spFx.pitch.toFixed(0) : '—')
      + '</div><p class="ma-muted">vs league average when available · sourced from SP profiles</p></div>'
      + metricSparkline([m.abqYtd != null ? m.abqYtd : m.abq, m.abqL30, m.abqL14, m.abqL7])
      + f5;

    var rcvInterp = m.rcv >= 62 ? 'Cluster scorer' : m.rcv >= 50 ? 'Balanced' : 'Limited damage';
    var rcvBody = '<p class="ma-read">' + (m.rcv != null ? m.rcv.toFixed(0) : '—') + '/100 — ' + rcvInterp + '</p>'
      + componentBars([
        { label: 'wRC+ contribution', score: m.rcv, pct: m.rcv, display: 'wt 35%' },
        { label: 'Barrel% (park-adj)', score: m.rcv, pct: m.rcv * 0.92, display: 'wt 32%' },
        { label: 'ISO (park-adj)', score: m.rcv, pct: m.rcv * 0.88, display: 'wt 20%' },
        { label: 'HardHit% (park-adj)', score: m.rcv, pct: m.rcv * 0.85, display: 'wt 13%' }
      ], 'rcv')
      + '<div class="ma-panel"><div class="ma-panel-title">Is this RCV schedule-confirmed?</div>'
      + '<p class="ma-read">OSI ' + (m.osi != null ? m.osi.toFixed(1) : '—') + ' vs PALS ' + (m.pals != null ? m.pals.toFixed(1) : '—') + '</p>'
      + palsBadge(m.osi, m.pals) + '</div>'
      + splitTable([['vs RHP', m.osiR], ['vs LHP', m.osiL], ['Home', m.osiH], ['Away', m.osiA], ['F5', m.osiF5]])
      + metricSparkline([m.rcvYtd != null ? m.rcvYtd : m.rcv, m.rcvL30, m.rcvL14, m.rcvL7])
      + f5;

    var obrInterp = m.obr >= 62 ? 'Reliable table-setters' : m.obr >= 50 ? 'Moderate' : 'Thin baserunner paths';
    var obrRel = '';
    if (m.abq >= 60 && m.obr >= 60) obrRel = 'Complete process profile — dangerous even vs elite pitching';
    else if (m.abq >= 60 && m.obr < 50) obrRel = 'Patient but not getting on base — watch opposing SP walk rate';
    else if (m.obr >= 60 && m.abq < 50) obrRel = 'Gets on base but chase-prone';
    var obrBody = '<p class="ma-read">' + (m.obr != null ? m.obr.toFixed(0) : '—') + '/100 — ' + obrInterp + '</p>'
      + componentBars([
        { label: 'xwOBA contribution', score: m.obr, pct: m.obr, display: 'wt 65%' },
        { label: 'BB% contribution', score: m.obr, pct: m.obr * 0.9, display: 'wt 35%' }
      ], 'obr')
      + (obrRel ? '<p class="ma-read">' + esc(obrRel) + '</p>' : '')
      + '<div class="ma-panel"><div class="ma-panel-title">Effect on opposing pitchers</div>'
      + '<p class="ma-read">High OBR lineups force pitchers to work harder in the zone.</p></div>'
      + splitTable([['vs RHP', m.obrR || m.osiR], ['vs LHP', m.obrL || m.osiL], ['Home', m.osiH], ['Away', m.osiA], ['F5', m.osiF5]])
      + metricSparkline([m.obrYtd != null ? m.obrYtd : m.obr, m.obrL30, m.obrL14, m.obrL7])
      + f5;

    var tonightPals = ctx.tonightSpHand ? 'Tonight vs ' + ctx.tonightSpHand + 'HP — PALS context for SP-only schedule' : '';
    var palsBody = '<p class="ma-read"><strong>PALS evaluates performance vs opposing SPs only.</strong></p>'
      + '<div class="pals-compare">'
      + '<div><span class="pals-num">' + valChip(m.osi, 'osi', false, 1) + '</span><span class="pals-lbl">OSI</span></div>'
      + '<span class="pals-gap">' + valChip(m.pals != null && m.osi != null ? (m.osi - m.pals) : null, 'ppGap', false, 1) + '</span>'
      + '<div><span class="pals-num">' + valChip(m.pals, 'osi', false, 1) + '</span><span class="pals-lbl">PALS</span></div>'
      + '</div>'
      + '<p class="ma-read">' + esc(palsInterpretation(m.osi, m.pals)) + '</p>'
      + splitTable([['vs RHP SPs', m.osiR], ['vs LHP SPs', m.osiL], ['Home', m.osiH], ['Away', m.osiA], ['F5', m.osiF5]])
      + (tonightPals ? '<p class="ma-read ma-tonight">' + esc(tonightPals) + '</p>' : '')
      + metricSparkline([m.palsYtd != null ? m.palsYtd : m.pals, m.palsL30, m.palsL14, m.palsL7])
      + f5;

    return '<div class="mini-dashboards">'
      + accordion('ma-osi', 'OSI — Offensive Strength', m.osi, true, osiBody, 'osi')
      + accordion('ma-abq', 'ABQ — Process Quality', m.abq, false, abqBody, 'abq')
      + accordion('ma-rcv', 'RCV — Run Creation', m.rcv, false, rcvBody, 'rcv')
      + accordion('ma-obr', 'OBR — On-Base Floor', m.obr, false, obrBody, 'obr')
      + accordion('ma-pals', 'PALS — vs SP Schedule', m.pals, false, palsBody, 'osi')
      + '</div>';
  }

  function statBox(label, val) {
    return '<div class="ma-stat-box"><div class="ms-label">' + esc(label) + '</div><div class="ms-val">' + esc(String(val)) + '</div></div>';
  }

  function splitLabel(split) {
    var map = { both: 'Both', rhp: 'vs RHP', lhp: 'vs LHP', home: 'Home', away: 'Away', f5: 'F5 (Inn. 1–5)' };
    return map[split] || split;
  }

  global.TeamProfileMini = {
    resolveView: resolveView,
    render: function(prof, team, ctx) {
      ctx = ctx || {};
      ctx.splitLabel = splitLabel(ctx.split || 'both');
      ctx.windowLabel = ctx.window || 'YTD';
      return render(prof, team, ctx).replace(/<\/?motion>/g, '').replace(/<spaning /g, '<span ');
    },
    renderSnapshot: function(prof, team, ctx) {
      ctx = ctx || {};
      ctx.splitLabel = splitLabel(ctx.split || 'both');
      ctx.windowLabel = ctx.window || 'YTD';
      return renderSnapshot(prof, team, ctx).replace(/<\/?motion>/g, '');
    }
  };
})(typeof window !== 'undefined' ? window : this);
