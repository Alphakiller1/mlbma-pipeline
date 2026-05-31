/**
 * Team Profile — snapshot + accordion metric mini dashboards.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var OSI_TIERS = [[85, 'Elite'], [75, 'High'], [65, 'Dangerous'], [50, 'Inconsistent'], [0, 'Weak']];
  var ABQ_WEIGHTS = { discipline: 0.30, contact: 0.35, pressure: 0.20, kAvoid: 0.15 };

  /** Team accent for logo glow (identity framing — spec §1) */
  var TEAM_ACCENT = {
    ARI: '#A71930', ATL: '#CE1141', BAL: '#DF4601', BOS: '#BD3039', CHC: '#0E3386', CHW: '#27251F',
    CIN: '#C6011F', CLE: '#E31937', COL: '#33006F', DET: '#0C2340', HOU: '#EB6E1F', KCR: '#004687',
    KC: '#004687', LAA: '#BA0021', LAD: '#005A9C', MIA: '#00A3E0', MIL: '#12284B', MIN: '#002B5C',
    NYM: '#002D72', NYY: '#0C2340', ATH: '#003831', OAK: '#003831', PHI: '#E81828', PIT: '#FDB827',
    SDP: '#2F241D', SD: '#2F241D', SEA: '#0C2C56', SFG: '#FD5A1E', SF: '#FD5A1E', STL: '#C41E3A',
    TBR: '#092C5C', TB: '#092C5C', TEX: '#003278', TOR: '#134A8E', WSN: '#AB0003', WAS: '#AB0003'
  };

  function teamAccent(team) {
    return TEAM_ACCENT[String(team || '').trim().toUpperCase()] || '#7C4DFF';
  }

  function wrcTierLabel(wrc) {
    if (wrc == null || isNaN(wrc)) return '—';
    if (wrc >= 115) return 'Elite';
    if (wrc >= 105) return 'Plus';
    if (wrc >= 95) return 'Average';
    return 'Below';
  }

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

  function rawSplitRowForTeam(team, split, metricsR, metricsL) {
    var t = String(team || '').trim().toUpperCase();
    var list = split === 'lhp' ? metricsL : split === 'rhp' ? metricsR : null;
    if (!list || !list.length) return null;
    return list.find(function(r) {
      return String(pick(r, ['Tm', 'Team', 'team', 'tm'])).trim().toUpperCase() === t;
    }) || null;
  }

  function scoredSplitRow(rawRow) {
    if (!rawRow) return null;
    var S = global.MLBMASharedMatchup;
    if (S && S.scoreRowFromSheet) {
      var scored = S.scoreRowFromSheet(rawRow);
      if (scored) {
        return Object.assign({}, rawRow, scored, {
          wOBA: scored.woba != null ? scored.woba : rawRow.wOBA,
          xwOBA: scored.xwoba != null ? scored.xwoba : rawRow.xwOBA,
          'wRC+': scored.wrc != null ? scored.wrc : rawRow['wRC+'],
          SLG: scored.slg != null ? scored.slg : rawRow.SLG,
          OSI: scored.osi != null ? scored.osi : rawRow.OSI
        });
      }
    }
    return rawRow;
  }

  /** FanGraphs rates arrive as decimals (0.23); Savant/contact rates use whole percents (7.2). */
  function normalizeRatePct(v, decimalOk) {
    if (v == null || isNaN(v)) return null;
    if (decimalOk && v > 0 && v <= 1) return v * 100;
    return v;
  }

  function offenseRatesFromRow(row, pickCol) {
    if (!row) return {};
    return {
      wrc: num(pick(row, ['wRC+', 'wrc_plus', 'wrc'], pickCol)),
      woba: num(pick(row, ['wOBA', 'woba'], pickCol)),
      xwoba: num(pick(row, ['xwOBA', 'xwoba'], pickCol)),
      slg: num(pick(row, ['SLG', 'slg'], pickCol)),
      hr: num(pick(row, ['HR', 'hr'], pickCol)),
      k: normalizeRatePct(num(pick(row, ['K%', 'k_pct', 'k'], pickCol)), true),
      bb: normalizeRatePct(num(pick(row, ['BB%', 'bb_pct', 'bb'], pickCol)), true),
      barrel: normalizeRatePct(num(pick(row, ['Barrel%', 'barrel_pct', 'barrel'], pickCol)), false),
      hard: normalizeRatePct(num(pick(row, ['HardHit%', 'hardhit_pct', 'hard'], pickCol)), false)
    };
  }

  function blendOffenseRates(a, b) {
    a = a || {};
    b = b || {};
    function blend(key) {
      if (a[key] != null && b[key] != null) return (a[key] + b[key]) / 2;
      return a[key] != null ? a[key] : b[key];
    }
    return {
      wrc: blend('wrc'), woba: blend('woba'), xwoba: blend('xwoba'), slg: blend('slg'),
      hr: blend('hr'), k: blend('k'), bb: blend('bb'), barrel: blend('barrel'), hard: blend('hard')
    };
  }

  function offenseRatesFromMetrics(team, split, metricsR, metricsL, pickCol) {
    var rRow = scoredSplitRow(rawSplitRowForTeam(team, 'rhp', metricsR, metricsL));
    var lRow = scoredSplitRow(rawSplitRowForTeam(team, 'lhp', metricsR, metricsL));
    var rRates = offenseRatesFromRow(rRow, pickCol);
    var lRates = offenseRatesFromRow(lRow, pickCol);
    if (split === 'rhp') return rRates;
    if (split === 'lhp') return lRates;
    return blendOffenseRates(rRates, lRates);
  }

  function applySheetRates(target, source) {
    if (!source) return;
    ['wrc', 'woba', 'xwoba', 'slg', 'hr', 'k', 'bb', 'barrel', 'hard'].forEach(function(key) {
      if (source[key] != null) target[key] = source[key];
    });
  }

  function resolveOffenseRates(prof, ctx) {
    ctx = ctx || {};
    var pickCol = ctx.pickCol;
    var split = ctx.split || 'both';
    var team = ctx.team;

    function pf(keys) { return num(pick(prof, keys, pickCol)); }

    var rates = {
      wrc: ctx.wrc != null ? ctx.wrc : pf(['wrc_plus', 'wRC+', 'wrc']),
      woba: pf(['woba', 'wOBA']),
      xwoba: pf(['xwoba', 'xwOBA']),
      slg: pf(['slg', 'SLG']),
      hr: pf(['hr', 'HR']),
      k: normalizeRatePct(pf(['k_pct', 'K%']), true),
      bb: normalizeRatePct(pf(['bb_pct', 'BB%']), true),
      barrel: normalizeRatePct(pf(['barrel_pct', 'Barrel%']), false),
      hard: normalizeRatePct(pf(['hardhit_pct', 'HardHit%']), false)
    };

    if (split === 'home') {
      if (pf(['home_wrc']) != null) rates.wrc = pf(['home_wrc']);
      if (pf(['home_woba']) != null) rates.woba = pf(['home_woba']);
      if (pf(['home_slg']) != null) rates.slg = pf(['home_slg']);
    } else if (split === 'away') {
      if (pf(['away_wrc']) != null) rates.wrc = pf(['away_wrc']);
      if (pf(['away_woba']) != null) rates.woba = pf(['away_woba']);
      if (pf(['away_slg']) != null) rates.slg = pf(['away_slg']);
    }

    var sheetSplit = (split === 'home' || split === 'away' || split === 'f5') ? 'both' : split;
    applySheetRates(rates, offenseRatesFromMetrics(team, sheetSplit, ctx.metricsR, ctx.metricsL, pickCol));

    return rates;
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
    var rowR = scoredSplitRow(rawSplitRowForTeam(ctx.team, 'rhp', ctx.metricsR, ctx.metricsL));
    var rowL = scoredSplitRow(rawSplitRowForTeam(ctx.team, 'lhp', ctx.metricsR, ctx.metricsL));

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

    var osiYtd = pf(['osi_ytd', 'OSI_YTD']);
    var abqYtd = pf(['abq_ytd', 'ABQ_YTD', 'abq']);
    var rcvYtd = pf(['rcv_ytd', 'RCV_YTD', 'rcv']);
    var obrYtd = pf(['obr_ytd', 'OBR_YTD', 'obr']);
    if (osiYtd == null) osiYtd = pf(['osi']);

    return {
      osi: osi, abq: abq, rcv: rcv, obr: obr, proj: proj, ppGap: ppGap, pals: pals, oor: oor,
      osiR: pf(['osi_vs_rhp']), osiL: pf(['osi_vs_lhp']),
      osiH: pf(['home_osi']), osiA: pf(['away_osi']), osiF5: pf(['osi_f5']),
      abqR: pf(['abq_vs_rhp']), abqL: pf(['abq_vs_lhp']),
      rcvR: pf(['rcv_vs_rhp']), rcvL: pf(['rcv_vs_lhp']),
      obrR: pf(['obr_vs_rhp']), obrL: pf(['obr_vs_lhp']),
      osiYtd: osiYtd,
      osiL30: pf(['osi_l30', 'OSI_L30']),
      osiL14: pf(['osi_l14', 'OSI_L14']),
      osiL7: pf(['osi_l7', 'OSI_L7']),
      abqYtd: abqYtd,
      abqL30: pf(['abq_l30', 'ABQ_L30']),
      abqL14: pf(['abq_l14', 'ABQ_L14']),
      abqL7: pf(['abq_l7', 'ABQ_L7']),
      rcvYtd: rcvYtd,
      rcvL30: pf(['rcv_l30', 'RCV_L30']),
      rcvL14: pf(['rcv_l14', 'RCV_L14']),
      rcvL7: pf(['rcv_l7', 'RCV_L7']),
      obrYtd: obrYtd,
      obrL30: pf(['obr_l30', 'OBR_L30']),
      obrL14: pf(['obr_l14', 'OBR_L14']),
      obrL7: pf(['obr_l7', 'OBR_L7']),
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

  function renderTrendChartPanel(m, ctx) {
    var C = global.MLBMACharts;
    if (!C || !C.buildTrendLineChart) return '';
    var windowKey = ctx.window || 'YTD';
    var active = ctx.chartMetric || 'osi';
    var pack = C.trendMetricPack ? C.trendMetricPack(m) : {};
    var sliced = C.trendWindowSlice
      ? C.trendWindowSlice(['YTD', 'L30', 'L14', 'L7'], pack[active] || [], windowKey)
      : { labels: ['YTD', 'L30', 'L14', 'L7'], values: pack[active] || [] };
    var readout = C.trendDeltaReadout ? C.trendDeltaReadout(m, windowKey) : '';
    var toggles = ['osi', 'rcv', 'abq', 'obr'].map(function(k) {
      var lbl = k.toUpperCase();
      return '<button type="button" class="hub-pill tp-trend-metric' + (active === k ? ' active' : '')
        + '" data-trend-metric="' + k + '" aria-pressed="' + (active === k ? 'true' : 'false') + '">' + lbl + '</button>';
    }).join('');
    var chart = C.buildTrendLineChart(active.toUpperCase(), sliced.values, 480, 120, {
      labels: sliced.labels,
      metricCtx: active
    });
    return '<div class="tp-trend-panel" data-window="' + esc(windowKey) + '">'
      + '<div class="tp-trend-controls" role="group" aria-label="Chart metric">' + toggles + '</div>'
      + '<div class="tp-trend-chart-mount" data-active-metric="' + esc(active) + '">' + chart + '</div>'
      + '<p class="tp-trend-readout ca-helper">' + esc(readout) + '</p></div>';
  }

  function renderSummaryPanel(prof, team, m, ctx) {
    var rates = resolveOffenseRates(prof, ctx);
    var wrc = ctx.wrc != null ? ctx.wrc : rates.wrc;
    var chips = [
      ['projOSI', m.proj, 'osi', false, 1],
      ['PP-Gap', m.ppGap, 'ppGap', false, 1]
    ].map(function(c) {
      return '<span class="tp-summary-chip"><span class="tp-summary-chip-k">' + esc(c[0]) + '</span>'
        + valChip(c[1], c[2], c[3], c[4]) + '</span>';
    }).join('');

    var filterNote = esc((ctx.splitLabel || ctx.split || 'both') + ' · ' + (ctx.windowLabel || ctx.window || 'YTD'));
    var platoonHtml = platoonSplitSummary(m, ctx);
    var locationHtml = locationSplitSummary(prof, m, ctx);

    return '<div class="tp-summary-panel">'
      + '<div class="tp-summary-head"><span class="tp-summary-title">Offense Summary</span>'
      + '<span class="tp-summary-filter">' + filterNote + '</span></div>'
      + '<div class="tp-summary-chips">' + chips + '</div>'
      + platoonHtml
      + locationHtml
      + renderTrendChartPanel(m, ctx)
      + '</div>';
  }

  function renderSnapshot(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveView(prof, ctx);
    var rates = resolveOffenseRates(prof, ctx);
    if (rates.wrc != null) ctx.wrc = rates.wrc;

    return '<section class="ca-card tp-snapshot-card"><div class="team-snapshot">'
      + '<div class="snapshot-main" style="width:100%">'
      + renderInfographicHero(prof, team, m, ctx)
      + renderSummaryPanel(prof, team, m, ctx)
      + '</div></div></section>';
  }

  function iconCircle(name) {
    var I = (typeof window !== 'undefined' && window.MLBMAIcons) ? window.MLBMAIcons : null;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm" aria-hidden="true"></span>';
  }

  function renderInfographicHero(prof, team, m, ctx) {
    ctx = ctx || {};
    var logo = A ? A.teamLogoImg(team, 120, 'tp-hero-logo snapshot-logo') : '';
    var rank = ctx.osiRank;
    return '<div class="ca-profile-hero">'
      + '<div class="ca-profile-hero__main">'
      + '<h1 class="ca-profile-hero__title">' + esc(ctx.teamName || team) + '</h1>'
      + (ctx.recordWl ? '<p class="ca-profile-hero__sub">'
        + (rank ? '#' + rank + ' OSI rank' : '')
        + (ctx.avgPitchScore != null ? (rank ? ' · ' : '') + 'Pitch Score ' + ctx.avgPitchScore.toFixed(0) : '') + '</p>' : '')
      + '</div>'
      + '<div class="ca-profile-hero__body">'
      + '<div class="tp-hero-logo-wrap">' + logo + '</div>'
      + '</div>'
      + insightRailHtml(prof, m, ctx)
      + '</div>';
  }

  function insightRailHtml(prof, m, ctx) {
    ctx = ctx || {};
    var pickCol = ctx.pickCol;
    var rates = resolveOffenseRates(prof, ctx);
    var woba = rates.woba;
    var xwoba = rates.xwoba;
    var barrel = num(pick(prof, ['barrel_pct', 'Barrel%'], pickCol));
    var hr = num(pick(prof, ['hr', 'HR'], pickCol));
    var rows = [];

    if (woba != null && xwoba != null) {
      var contactGap = (woba - xwoba) * 1000;
      rows.push({
        icon: contactGap > 8 ? 'regression' : contactGap < -8 ? 'trend-up' : 'contact',
        label: contactGap > 8 ? 'Regression watch' : contactGap < -8 ? 'Contact upside' : 'Contact aligned',
        text: contactGap > 8
          ? 'wOBA runs ' + Math.round(contactGap) + ' pts above xwOBA — contact results may cool.'
          : contactGap < -8
            ? 'xwOBA leads wOBA by ' + Math.abs(Math.round(contactGap)) + ' pts — room for balls to fall.'
            : 'wOBA tracks xwOBA — underlying contact matches box-score results.'
      });
    }

    if (barrel != null && barrel >= 9) {
      rows.push({
        icon: 'barrel',
        label: 'Barrel rate leader',
        text: 'Barrel% ' + barrel.toFixed(1) + '% — hard-contact profile ranks with elite lineups.'
      });
    } else if (hr != null && hr >= 80) {
      rows.push({
        icon: 'power',
        label: 'Power profile',
        text: hr + ' HR on the season — legitimate middle-of-order thump.'
      });
    }

    var splitGap = (m.osiR != null && m.osiL != null) ? Math.abs(m.osiR - m.osiL) : null;
    if (splitGap != null && splitGap >= 6) {
      rows.push({
        icon: 'swap',
        label: 'Platoon-sensitive',
        text: 'OSI split gap ' + splitGap.toFixed(1) + ' (RHP ' + m.osiR.toFixed(1) + ' · LHP ' + m.osiL.toFixed(1) + ') — handedness matters.'
      });
    }

    var ppGap = m.ppGap;
    if (rows.length < 3 && ppGap != null && Math.abs(ppGap) >= 4) {
      rows.push({
        icon: ppGap >= 4 ? 'trend-up' : 'regression',
        label: ppGap >= 4 ? 'Process upside' : 'Regression watch',
        text: 'PP-Gap ' + (ppGap >= 0 ? '+' : '') + ppGap.toFixed(1) + ' — projOSI vs current OSI spread.'
      });
    }

    if (rows.length < 3 && m.proj != null && m.osi != null) {
      rows.push({
        icon: 'process',
        label: 'Process baseline',
        text: 'ProjOSI ' + m.proj.toFixed(1) + ' vs OSI ' + m.osi.toFixed(1) + ' on the active filter.'
      });
    }

    if (!rows.length) {
      rows.push({
        icon: 'target',
        label: 'Offense profile',
        text: 'Core split and window metrics loading — check pipeline refresh if empty.'
      });
    }

    return '<div class="ca-insight-rail">' + rows.slice(0, 3).map(function(r) {
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

  function platoonSplitSummary(m, ctx) {
    ctx = ctx || {};
    var split = ctx.split || 'both';
    if (split === 'rhp' || split === 'lhp') return '';
    if (!m) return '';
    var rowL = m.rowL || {};
    var rowR = m.rowR || {};
    var lWoba = pickSplitStat(rowL, ['wOBA', 'woba']);
    var rWoba = pickSplitStat(rowR, ['wOBA', 'woba']);
    var lWrc = pickSplitStat(rowL, ['wRC+', 'wrc_plus', 'wRC', 'wrc']);
    var rWrc = pickSplitStat(rowR, ['wRC+', 'wrc_plus', 'wRC', 'wrc']);
    var lSlg = pickSplitStat(rowL, ['SLG', 'slg']);
    var rSlg = pickSplitStat(rowR, ['SLG', 'slg']);
    var osiL = m.osiL != null ? m.osiL : pickSplitStat(rowL, ['OSI', 'osi']);
    var osiR = m.osiR != null ? m.osiR : pickSplitStat(rowR, ['OSI', 'osi']);

    if (lWoba == null && rWoba == null && osiL == null && osiR == null) return '';

    var wobaDiff = (lWoba != null && rWoba != null) ? lWoba - rWoba : null;
    var osiDiff = (osiL != null && osiR != null) ? osiL - osiR : null;
    var wrcDiff = (lWrc != null && rWrc != null) ? lWrc - rWrc : null;
    var slgDiff = (lSlg != null && rSlg != null) ? lSlg - rSlg : null;

    var stronger = '';
    var weaker = '';
    var balanced = false;
    if (wobaDiff != null) {
      if (Math.abs(wobaDiff) < 0.005) balanced = true;
      else if (wobaDiff > 0) { stronger = 'vs LHP'; weaker = 'vs RHP'; }
      else { stronger = 'vs RHP'; weaker = 'vs LHP'; }
    } else if (osiDiff != null) {
      if (Math.abs(osiDiff) < 2) balanced = true;
      else if (osiDiff > 0) { stronger = 'vs LHP'; weaker = 'vs RHP'; }
      else { stronger = 'vs RHP'; weaker = 'vs LHP'; }
    }

    var lead = '';
    if (balanced) {
      lead = 'Platoon profile is <strong>balanced</strong> across handedness.';
    } else if (stronger && weaker) {
      lead = '<span class="tp-platoon-tag tp-platoon-tag--strong">' + esc(stronger) + ' stronger</span>'
        + '<span class="tp-platoon-tag tp-platoon-tag--weak">' + esc(weaker) + ' weaker</span>';
    }

    var details = [];
    if (wobaDiff != null) {
      details.push('wOBA Δ <strong>' + (wobaDiff >= 0 ? '+' : '') + wobaDiff.toFixed(3) + '</strong>'
        + ' · LHP ' + lWoba.toFixed(3) + ' · RHP ' + rWoba.toFixed(3));
    }
    if (wrcDiff != null && Math.abs(wrcDiff) >= 1) {
      details.push('wRC+ Δ <strong>' + (wrcDiff >= 0 ? '+' : '') + Math.round(wrcDiff) + '</strong>'
        + ' · LHP ' + Math.round(lWrc) + ' · RHP ' + Math.round(rWrc));
    }
    if (slgDiff != null && Math.abs(slgDiff) >= 0.01) {
      details.push('SLG Δ <strong>' + (slgDiff >= 0 ? '+' : '') + slgDiff.toFixed(3) + '</strong>');
    }
    if (osiDiff != null && Math.abs(osiDiff) >= 2) {
      details.push('OSI Δ <strong>' + (osiDiff >= 0 ? '+' : '') + osiDiff.toFixed(1) + '</strong>'
        + ' · LHP ' + osiL.toFixed(1) + ' · RHP ' + osiR.toFixed(1));
    }

    if (!lead && !details.length) return '';

    return '<div class="tp-platoon-summary">'
      + '<div class="tp-platoon-summary-head">Platoon Report</div>'
      + (lead ? '<p class="tp-platoon-summary-lead">' + lead + '</p>' : '')
      + (details.length ? '<p class="tp-platoon-summary-detail">' + details.join(' · ') + '</p>' : '')
      + '</div>';
  }

  function locationSplitSummary(prof, m, ctx) {
    ctx = ctx || {};
    var split = ctx.split || 'both';
    if (split === 'home' || split === 'away') return '';

    var pickCol = ctx.pickCol;
    function pf(keys) { return num(pick(prof, keys, pickCol)); }

    var hWoba = pf(['home_woba']);
    var aWoba = pf(['away_woba']);
    var hWrc = pf(['home_wrc']);
    var aWrc = pf(['away_wrc']);
    var hSlg = pf(['home_slg']);
    var aSlg = pf(['away_slg']);
    var osiH = m && m.osiH != null ? m.osiH : pf(['home_osi']);
    var osiA = m && m.osiA != null ? m.osiA : pf(['away_osi']);

    if (hWoba == null && aWoba == null && hWrc == null && aWrc == null && osiH == null && osiA == null) return '';

    var wobaDiff = (hWoba != null && aWoba != null) ? hWoba - aWoba : null;
    var wrcDiff = (hWrc != null && aWrc != null) ? hWrc - aWrc : null;
    var slgDiff = (hSlg != null && aSlg != null) ? hSlg - aSlg : null;
    var osiDiff = (osiH != null && osiA != null) ? osiH - osiA : null;

    var stronger = '';
    var weaker = '';
    var balanced = false;
    if (wobaDiff != null && Math.abs(wobaDiff) >= 0.005) {
      if (wobaDiff > 0) { stronger = 'Home'; weaker = 'Away'; }
      else { stronger = 'Away'; weaker = 'Home'; }
    } else if (wrcDiff != null && Math.abs(wrcDiff) >= 2) {
      if (wrcDiff > 0) { stronger = 'Home'; weaker = 'Away'; }
      else { stronger = 'Away'; weaker = 'Home'; }
    } else if (osiDiff != null && Math.abs(osiDiff) >= 2) {
      if (osiDiff > 0) { stronger = 'Home'; weaker = 'Away'; }
      else { stronger = 'Away'; weaker = 'Home'; }
    } else if ((hWoba != null && aWoba != null) || (hWrc != null && aWrc != null) || (osiH != null && osiA != null)) {
      balanced = true;
    }

    var lead = '';
    if (balanced) {
      lead = 'Home / away profile is <strong>balanced</strong>.';
    } else if (stronger && weaker) {
      lead = '<span class="tp-platoon-tag tp-platoon-tag--strong">' + esc(stronger) + ' stronger</span>'
        + '<span class="tp-platoon-tag tp-platoon-tag--weak">' + esc(weaker) + ' weaker</span>';
    }

    var details = [];
    if (wobaDiff != null) {
      details.push('wOBA Δ <strong>' + (wobaDiff >= 0 ? '+' : '') + wobaDiff.toFixed(3) + '</strong>'
        + ' · Home ' + hWoba.toFixed(3) + ' · Away ' + aWoba.toFixed(3));
    }
    if (wrcDiff != null && Math.abs(wrcDiff) >= 1) {
      details.push('wRC+ Δ <strong>' + (wrcDiff >= 0 ? '+' : '') + Math.round(wrcDiff) + '</strong>'
        + ' · Home ' + Math.round(hWrc) + ' · Away ' + Math.round(aWrc));
    }
    if (slgDiff != null && Math.abs(slgDiff) >= 0.01) {
      details.push('SLG Δ <strong>' + (slgDiff >= 0 ? '+' : '') + slgDiff.toFixed(3) + '</strong>'
        + ' · Home ' + hSlg.toFixed(3) + ' · Away ' + aSlg.toFixed(3));
    }
    if (osiDiff != null && Math.abs(osiDiff) >= 2) {
      details.push('OSI Δ <strong>' + (osiDiff >= 0 ? '+' : '') + osiDiff.toFixed(1) + '</strong>'
        + ' · Home ' + osiH.toFixed(1) + ' · Away ' + osiA.toFixed(1));
    }

    if (!lead && !details.length) return '';

    return '<div class="tp-platoon-summary tp-location-summary">'
      + '<div class="tp-platoon-summary-head">Location Report</div>'
      + (lead ? '<p class="tp-platoon-summary-lead">' + lead + '</p>' : '')
      + (details.length ? '<p class="tp-platoon-summary-detail">' + details.join(' · ') + '</p>' : '')
      + '</div>';
  }

  function render(prof, team, ctx) {
    if (global.TeamProfileSections && TeamProfileSections.renderAll) {
      return TeamProfileSections.renderAll(prof, team, ctx);
    }
    return '<p class="ca-helper">Offense sections module not loaded.</p>';
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
    resolveOffenseRates: resolveOffenseRates,
    platoonSplitSummary: platoonSplitSummary,
    locationSplitSummary: locationSplitSummary,
    wrcTierLabel: wrcTierLabel,
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
