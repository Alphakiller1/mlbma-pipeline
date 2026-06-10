/**
 * Bullpen Profile — snapshot, pitching value, leverage, OSI tiers, trends, SOS, reliever rank.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v === null || v === undefined || v === '' || v === '—') return null;
    var n = parseFloat(String(v).replace('%', ''));
    return isNaN(n) ? null : n;
  }

  function fmt(v, d) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toFixed(d === undefined ? 1 : d);
  }

  function fmtPct(v) {
    return v === null || isNaN(v) ? '—' : fmt(v, 1) + '%';
  }

  function colVal(row, prefix, metric, pickCol) {
    if (!row || !pickCol) return null;
    return num(pickCol(row, [prefix + '_' + metric, prefix + ' ' + metric]));
  }

  // Delegate to the central league-average grader so the bullpen page matches the
  // platform's red->green scale (was hardcoded 3-step thresholds).
  function allowedColor(val) {   // OSI allowed: 0-100, lower is better
    if (val === null || isNaN(val)) return 'var(--text-3)';
    return (A && A.metricColor) ? A.metricColor(val, 'osi', true) : 'var(--text-3)';
  }

  function eraColor(era) {
    if (era === null || isNaN(era)) return 'var(--text-3)';
    return (A && A.metricColor) ? A.metricColor(era, 'bp_era') : 'var(--text-3)';
  }

  function percentileRank(value, values, lowerIsBetter) {
    var nums = values.filter(function(v) { return v != null && !isNaN(v); });
    if (value == null || isNaN(value) || !nums.length) return null;
    var better = nums.filter(function(v) {
      return lowerIsBetter ? v >= value : v <= value;
    }).length;
    return Math.round((better / nums.length) * 100);
  }

  function avgFromLog(log, pickCol, names, maxApps) {
    var rows = log.slice().sort(function(a, b) {
      return String(pickCol(b, ['date', 'Date'])).localeCompare(String(pickCol(a, ['date', 'Date'])));
    });
    if (maxApps) rows = rows.slice(0, maxApps);
    var sum = 0, n = 0;
    rows.forEach(function(g) {
      for (var i = 0; i < names.length; i++) {
        var v = num(pickCol(g, [names[i]]));
        if (v != null) { sum += v; n++; break; }
      }
    });
    return n ? sum / n : null;
  }

  function resolvePrefix(split) {
    var map = {
      overall: 'overall', lhh: 'vs_lhh', rhh: 'vs_rhh',
      home: 'home', away: 'away',
      hilev: 'high_leverage', lolev: 'low_leverage',
      hlev: 'high_leverage', llev: 'low_leverage'
    };
    return map[split] || 'overall';
  }

  function resolveAllowed(unit, ctx) {
    var pickCol = ctx.pickCol;
    var split = ctx.split || 'overall';
    var window = ctx.window || 'YTD';
    var prefix = resolvePrefix(split);
    var log = ctx.teamLog || [];

    function m(pfx) {
      return {
        abq: colVal(unit, pfx, 'ABQ_allowed', pickCol),
        rcv: colVal(unit, pfx, 'RCV_allowed', pickCol),
        obr: colVal(unit, pfx, 'OBR_allowed', pickCol),
        osi: colVal(unit, pfx, 'OSI_allowed', pickCol)
      };
    }

    var metrics = m(prefix);
    var maxApps = window === 'L14' ? 20 : window === 'L30' ? 45 : null;
    if (window !== 'YTD' && log.length && prefix === 'overall') {
      metrics = {
        abq: avgFromLog(log, pickCol, ['opponent_ABQ', 'opponent ABQ'], maxApps) || metrics.abq,
        rcv: avgFromLog(log, pickCol, ['opponent_RCV', 'opponent RCV'], maxApps) || metrics.rcv,
        obr: avgFromLog(log, pickCol, ['opponent_OBR', 'opponent OBR'], maxApps) || metrics.obr,
        osi: avgFromLog(log, pickCol, ['opponent_OSI', 'opponent OSI'], maxApps) || metrics.osi
      };
    }

    var l14 = {
      abq: avgFromLog(log, pickCol, ['opponent_ABQ', 'opponent ABQ'], 20),
      rcv: avgFromLog(log, pickCol, ['opponent_RCV', 'opponent RCV'], 20),
      obr: avgFromLog(log, pickCol, ['opponent_OBR', 'opponent OBR'], 20),
      osi: avgFromLog(log, pickCol, ['opponent_OSI', 'opponent OSI'], 20)
    };

    return { metrics: metrics, l14: l14, prefix: prefix };
  }

  // Tone for headline bullpen stats (all lower-is-better) -> colored value text,
  // matching the team-profile banner style (tp-hero-stat--{tone}).
  function bpStatTone(label, v) {
    if (v == null || isNaN(v)) return 'neutral';
    if (label.indexOf('OSI') >= 0) {       // OSI Allowed - lower better
      if (v <= 45) return 'elite';
      if (v <= 50) return 'strong';
      if (v <= 56) return 'mid';
      return 'weak';
    }
    // ERA / Hi Lev ERA - lower better
    if (v <= 3.00) return 'elite';
    if (v <= 3.75) return 'strong';
    if (v <= 4.25) return 'mid';
    return 'weak';
  }

  function bannerMetricMeta(label) {
    var u = String(label || '').toUpperCase();
    if (u.indexOf('OSI') >= 0) return { ctx: 'osi', invert: true };
    if (u.indexOf('ERA') >= 0) return { ctx: 'bp_era', invert: null };
    return { ctx: 'default', invert: null };
  }

  function statPill(label, rawVal, display) {
    var valueHtml;
    if (rawVal != null && !isNaN(rawVal)) {
      var meta = bannerMetricMeta(label);
      var color = (A && A.metricTextColor)
        ? A.metricTextColor(rawVal, meta.ctx, meta.invert)
        : '';
      var style = color ? ' style="color:' + color + '"' : '';
      valueHtml = '<span class="tp-hero-stat__num"' + style + '>' + esc(display) + '</span>';
    } else {
      valueHtml = '<span class="tp-hero-stat__num tp-hero-stat__num--na">—</span>';
    }
    return '<div class="tp-hero-stat tp-hero-stat--neutral">'
      + '<span class="tp-hero-stat__label">' + esc(label) + '</span>'
      + '<span class="tp-hero-stat__value">' + valueHtml + '</span></div>';
  }

  function renderSnapshot(team, unit, ctx) {
    var pickCol = ctx.pickCol;
    var logo = A ? A.teamLogoImg(team, 52, 'tp-team-banner__logo') : '';
    var era = colVal(unit, 'overall', 'ERA', pickCol);
    var osi = colVal(unit, 'overall', 'OSI_allowed', pickCol);
    var hiEra = colVal(unit, 'high_leverage', 'ERA', pickCol);
    var badges = (ctx.isToday ? '<span class="pill pill-today">Playing Today</span>' : '');

    var statRow = '<div class="tp-team-banner__stats tp-team-banner__stats--hero pp-hero-stats tp-hero-stat-row" role="group" aria-label="Bullpen headline stats">'
      + statPill('ERA', era, fmt(era, 2))
      + statPill('OSI Allowed', osi, fmt(osi, 1))
      + statPill('Hi Lev ERA', hiEra, fmt(hiEra, 2))
      + '</div>';

    return '<section class="tp-team-banner tp-team-banner--hero bullpen-snapshot profile-hero">'
      + '<div class="tp-team-banner__ambient" aria-hidden="true"></div>'
      + '<div class="tp-team-banner__inner tp-team-banner__inner--solo bp-banner__inner">'
      + '<div class="tp-team-banner__identity">'
      + (logo ? '<div class="tp-team-banner__logo-wrap">' + logo + '</div>' : '')
      + '<div class="tp-team-banner__copy">'
      + '<p class="ca-eyebrow tp-team-banner__eyebrow">Bullpen Profile</p>'
      + '<h1 class="tp-team-banner__title ca-profile-hero__title">' + esc(team) + ' Bullpen</h1>'
      + (badges ? '<div class="tp-team-banner__badges ps-badges">' + badges + '</div>' : '')
      + (ctx.tonightHtml ? '<div class="tp-team-banner__meta ps-tonight">' + ctx.tonightHtml + '</div>' : '')
      + '</div></div>'
      + statRow
      + '</div></section>';
  }

  function valChip(v, metricCtx, invert, dec) {
    if (v == null || isNaN(v)) {
      return A && A.chipPlaceholderHtml ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>';
    }
    return A && A.valChipHtml ? A.valChipHtml(v, metricCtx, invert, dec) : esc(fmt(v, dec));
  }

  function pctNorm(v) {
    if (v == null || isNaN(v)) return null;
    return Math.abs(v) <= 1 ? v * 100 : v;
  }

  function buildPitchingValueTableHtml(unit, prefix, pickCol) {
    var rk = pctNorm(colVal(unit, prefix, 'K_pct', pickCol));
    var rbb = pctNorm(colVal(unit, prefix, 'BB_pct', pickCol));
    var rhr9 = colVal(unit, prefix, 'HR9', pickCol);
    var rera = colVal(unit, prefix, 'ERA', pickCol);
    var rops = colVal(unit, prefix, 'OPS_allowed', pickCol);
    if (rops == null) rops = colVal(unit, prefix, 'OPS', pickCol);
    function cell(v, ctx, inv, d) {
      if (v == null || isNaN(v)) return '<td class="pp-pv-metric-cell tp-empty-cell">—</td>';
      return '<td class="pp-pv-metric-cell">' + valChip(v, ctx, inv, d) + '</td>';
    }
    return '<table class="hub-table tp-table pp-pitching-value-metrics-table" aria-label="Bullpen pitching value">'
      + '<thead><tr><th>K%</th><th>BB%</th><th>HR/9</th><th>ERA</th><th>OPS Allowed</th></tr></thead><tbody><tr>'
      + cell(rk, 'bp_kpct', false, 1) + cell(rbb, 'bp_bbpct', true, 1) + cell(rhr9, 'bp_hr9', true, 2)
      + cell(rera, 'bp_era', true, 2) + cell(rops, 'ops', true, 3)
      + '</tr></tbody></table>';
  }

  function renderPitchingValuePanel(unit, ctx) {
    var pickCol = ctx.pickCol;
    var prefix = resolvePrefix(ctx.split || 'overall');
    var labels = {
      overall: 'Overall', lhh: 'vs LHH', rhh: 'vs RHH', home: 'Home', away: 'Away',
      hilev: 'High leverage', lolev: 'Low leverage', hlev: 'High leverage', llev: 'Low leverage'
    };
    return '<div class="tp-trend-table-wrap pp-pv-metrics-wrap">'
      + buildPitchingValueTableHtml(unit, prefix, pickCol)
      + '<p class="tp-trend-table-note">Showing <strong>' + esc(labels[ctx.split] || ctx.splitLabel || 'Overall') + '</strong>'
      + ' · lower ERA / OPS allowed = stronger bullpen value.</p></div>';
  }

  function buildLeverageTableHtml(unit, pickCol, levView) {
    var rows = [
      { label: 'Both', prefix: 'overall', key: 'all' },
      { label: 'vs LHB', prefix: 'vs_lhh', key: 'lhh' },
      { label: 'vs RHB', prefix: 'vs_rhh', key: 'rhh' },
      { label: 'Away', prefix: 'away', key: 'away' },
      { label: 'Home', prefix: 'home', key: 'home' }
    ];
    var body = rows.map(function(r) {
      return '<tr><th scope="row">' + esc(r.label) + '</th>'
        + '<td class="num">' + valChip(colVal(unit, r.prefix, 'ERA', pickCol), 'bp_era', true, 2) + '</td>'
        + '<td class="num">' + valChip(pctNorm(colVal(unit, r.prefix, 'K_pct', pickCol)), 'bp_kpct', false, 1) + '</td>'
        + '<td class="num">' + valChip(pctNorm(colVal(unit, r.prefix, 'BB_pct', pickCol)), 'bp_bbpct', true, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(unit, r.prefix, 'OSI_allowed', pickCol), 'osi', true, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(unit, r.prefix, 'HR9', pickCol), 'bp_hr9', true, 2) + '</td></tr>';
    }).join('');
    return '<table class="hub-table tp-table bp-leverage-table"><thead><tr>'
      + '<th>Split</th><th>ERA</th><th>K%</th><th>BB%</th><th>OSI Allowed</th><th>HR/9</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderLeveragePanel(unit, ctx) {
    return '<div class="tp-table-wrap">' + buildLeverageTableHtml(unit, ctx.pickCol, ctx.levView)
      + '<p class="tp-trend-table-note">Platoon &amp; venue splits (vs LHB / vs RHB · Away / Home) — color grades vs league bullpen context.</p></div>';
  }

  // Tier splits styled exactly like the pitcher profile: plain graded-text values
  // (not filled chips), High/Mid/Low tier pills, switchable tier dimension.
  var TIER_DIM_LABEL = { osi: 'OSI', abq: 'ABQ', rcv: 'RCV', obr: 'OBR' };

  function bpTierClass(tier) {
    return tier === 'High' ? 'tier-high' : tier === 'Mid' ? 'tier-mid' : tier === 'Low' ? 'tier-low' : '';
  }

  function bpTierColorCell(v, metricCtx, invert, dec, asPct) {
    if (v == null || isNaN(v)) return '<td class="num tp-empty-cell">—</td>';
    var disp = asPct ? fmtPct(v) : fmt(v, dec);
    var color = (A && A.metricColor) ? A.metricColor(v, metricCtx, invert) : '';
    if (color) {
      return '<td class="num"><span class="pp-table-num-text pp-table-num-text--graded" style="color:' + color + '">' + esc(disp) + '</span></td>';
    }
    return '<td class="num">' + esc(disp) + '</td>';
  }

  function bpTierPlainCell(v, dec) {
    if (v == null || isNaN(v)) return '<td class="num tp-empty-cell">—</td>';
    return '<td class="num">' + esc(dec != null ? fmt(v, dec) : String(Math.round(v))) + '</td>';
  }

  function buildTierSplitTableHtml(unit, pickCol, dim) {
    var body = ['High', 'Mid', 'Low'].map(function(tier) {
      var p = 'vs_' + tier.toLowerCase() + '_' + dim;
      var apps = colVal(unit, p, 'apps', pickCol);
      var labelCell = '<td class="' + bpTierClass(tier) + '"><span class="pp-table-label-text">' + tier + '</span></td>';
      if (apps == null || apps === 0) {
        return '<tr>' + labelCell + '<td colspan="8" class="tp-empty-cell">—</td></tr>';
      }
      return '<tr>' + labelCell
        + bpTierPlainCell(apps, 0)
        + bpTierPlainCell(colVal(unit, p, 'ip_per_app', pickCol), 1)
        + bpTierColorCell(colVal(unit, p, 'ERA', pickCol), 'bp_era', true, 2, false)
        + bpTierColorCell(colVal(unit, p, 'FIP', pickCol), 'bp_fip', true, 2, false)
        + bpTierColorCell(pctNorm(colVal(unit, p, 'K_pct', pickCol)), 'bp_kpct', false, 1, true)
        + bpTierColorCell(pctNorm(colVal(unit, p, 'BB_pct', pickCol)), 'bp_bbpct', true, 1, true)
        + bpTierColorCell(colVal(unit, p, 'HR9', pickCol), 'bp_hr9', true, 2, false)
        + bpTierPlainCell(colVal(unit, p, 'pitches_per_app', pickCol), 0)
        + '</tr>';
    }).join('');
    return '<p class="tp-trend-table-note pp-tier-dim-note">Showing stats vs opponent <strong>'
      + esc(TIER_DIM_LABEL[dim] || String(dim).toUpperCase()) + '</strong> tier (High / Mid / Low).</p>'
      + '<table class="pp-data-table pp-tier-split-table pp-profile-table hub-table tp-table" data-tier-dim="' + esc(dim) + '"><thead><tr>'
      + '<th class="pp-table-head">Tier</th><th class="pp-table-head">Apps</th><th class="pp-table-head">IP/App</th>'
      + '<th class="pp-table-head">ERA</th><th class="pp-table-head">FIP</th><th class="pp-table-head">K%</th>'
      + '<th class="pp-table-head">BB%</th><th class="pp-table-head">HR/9</th><th class="pp-table-head">Pitches/App</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderOsiTierPanel(unit, ctx) {
    return '<div class="tp-table-wrap">' + buildTierSplitTableHtml(unit, ctx.pickCol, ctx.tierDim || 'osi') + '</div>';
  }

  function appearanceDates(log, pickCol) {
    var seen = {};
    var dates = [];
    (log || []).forEach(function(g) {
      var d = String(pickCol(g, ['date', 'Date']) || '').trim();
      if (!d || seen[d]) return;
      seen[d] = true;
      dates.push(d);
    });
    dates.sort(function(a, b) { return b.localeCompare(a); });
    return dates;
  }

  function avgMetricOnDates(log, pickCol, names, dateSet) {
    var sum = 0, n = 0;
    (log || []).forEach(function(g) {
      var d = String(pickCol(g, ['date', 'Date']) || '').trim();
      if (!dateSet[d]) return;
      for (var i = 0; i < names.length; i++) {
        var v = num(pickCol(g, [names[i]]));
        if (v != null) { sum += v; n++; break; }
      }
    });
    return n ? sum / n : null;
  }

  function buildBullpenTrendPack(ctx) {
    var pickCol = ctx.pickCol;
    var log = ctx.teamLog || [];
    var dates = appearanceDates(log, pickCol);
    var windows = [
      { key: 'l10', size: 10 },
      { key: 'l6', size: 6 },
      { key: 'l3', size: 3 },
      { key: 'l1', size: 1 }
    ];
    var sets = {};
    windows.forEach(function(w) {
      var slice = dates.slice(0, w.size);
      var set = {};
      slice.forEach(function(d) { set[d] = true; });
      sets[w.key] = set;
    });
    var metrics = {
      osi: ['opponent_OSI', 'opponent OSI'],
      rcv: ['opponent_RCV', 'opponent RCV'],
      abq: ['opponent_ABQ', 'opponent ABQ'],
      obr: ['opponent_OBR', 'opponent OBR']
    };
    var pack = { osi: [], rcv: [], abq: [], obr: [] };
    windows.forEach(function(w) {
      Object.keys(metrics).forEach(function(k) {
        pack[k].push(avgMetricOnDates(log, pickCol, metrics[k], sets[w.key]));
      });
    });
    pack.logCount = dates.length;
    pack.source = dates.length ? 'log' : 'unit';
    return pack;
  }

  function trendInterpBullpen(delta, velocity) {
    var C = global.MLBMACharts;
    var d = num(delta);
    var v = num(velocity);
    if (d == null && v == null) return 'Insufficient';
    if (C && typeof C.trendDirectionFromVelocity === 'function' && v != null && d == null) {
      var dir = C.trendDirectionFromVelocity(v);
      return dir === 'Up' ? 'Heating Up' : dir === 'Down' ? 'Cooling Off' : 'Flat Momentum';
    }
    if (d == null && v != null) {
      if (v > 0.75) return 'Heating Up';
      if (v < -0.75) return 'Cooling Off';
      return 'Flat Momentum';
    }
    if (v == null && d != null) {
      if (d >= 3) return 'Schedule Harder';
      if (d <= -3) return 'Schedule Softer';
      return 'Stable Band';
    }
    if (d >= 3 && v > 0.5) return 'Schedule Harder';
    if (d <= -3 && v < -0.5) return 'Schedule Softer';
    if (Math.abs(d) <= 1.5 && Math.abs(v) < 0.5) return 'Stable Band';
    if (Math.abs(d) >= 4 && Math.abs(v) < 0.35) return 'Short Spike';
    return 'Mixed Signal';
  }

  function bullpenTrendReadout(pack) {
    var keys = ['osi', 'rcv', 'abq', 'obr'];
    var labels = { osi: 'OSI faced', rcv: 'RCV faced', abq: 'ABQ faced', obr: 'OBR faced' };
    var deltas = [];
    keys.forEach(function(k) {
      var vals = pack[k] || [];
      var l10 = num(vals[0]), l1 = num(vals[3]);
      if (l10 == null || l1 == null || Math.abs(l1 - l10) < 0.05) return;
      deltas.push({ label: labels[k], delta: l1 - l10 });
    });
    if (!deltas.length) {
      return pack.logCount
        ? 'Last 1 matches Last 10 across metrics — schedule difficulty flat over recent appearances.'
        : 'No reliever log rows — showing unit snapshot; run pipeline step 12 for rolling windows.';
    }
    deltas.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var lead = deltas[0];
    var harder = lead.delta > 0;
    var driver = deltas.length > 1
      ? '; ' + deltas[1].label + ' ' + (deltas[1].delta >= 0 ? '▲' : '▼') + ' ' + Math.abs(deltas[1].delta).toFixed(1)
      : '';
    return lead.label + ' ' + (harder ? '▲' : '▼') + ' ' + Math.abs(lead.delta).toFixed(1) + ' (L1−L10)'
      + (harder ? ' — recent lineups tougher' : ' — recent lineups softer') + driver + '.';
  }

  function renderRollingTrendPanel(unit, ctx) {
    var pack = buildBullpenTrendPack(ctx);
    var C = global.MLBMACharts;
    var metrics = [
      { k: 'osi', label: 'OSI', ctx: 'osi', desc: 'Composite offense faced' },
      { k: 'rcv', label: 'RCV', ctx: 'rcv', desc: 'Contact quality faced' },
      { k: 'abq', label: 'ABQ', ctx: 'abq', desc: 'Discipline quality faced' },
      { k: 'obr', label: 'OBR', ctx: 'obr', desc: 'On-base floor faced' }
    ];
    var body = metrics.map(function(def) {
      var vals = pack[def.k] || [];
      var l10 = num(vals[0]), l6 = num(vals[1]), l3 = num(vals[2]), l1 = num(vals[3]);
      var velocity = C && C.computeTrendVelocityFromWindows
        ? C.computeTrendVelocityFromWindows([l10, l6, l3, l1]) : null;
      var trendDir = C && C.trendDirectionFromVelocity ? C.trendDirectionFromVelocity(velocity) : 'Stable';
      var delta = l10 != null && l1 != null ? l1 - l10 : null;
      var interp = trendInterpBullpen(delta, velocity);
      var tone = interp.indexOf('Harder') >= 0 || interp.indexOf('Heating') >= 0 ? 'down'
        : interp.indexOf('Softer') >= 0 || interp.indexOf('Cooling') >= 0 ? 'up' : 'mixed';
      var reliability = 'Noisy';
      if (C && C.trendReliabilityForRow) reliability = C.trendReliabilityForRow(l10, l6, l1, trendDir);
      else if (Math.abs(delta || 0) > 8) reliability = 'Short Spike';
      else if (trendDir === 'Stable') reliability = 'Stable';
      return '<tr><th scope="row"><span class="tp-trend-table__metric">' + esc(def.label)
        + '<span class="tp-trend-table__metric-desc">' + esc(def.desc) + '</span></span></th>'
        + '<td class="numcol">' + valChip(l10, def.ctx, true, 1) + '</td>'
        + '<td class="numcol">' + valChip(l6, def.ctx, true, 1) + '</td>'
        + '<td class="numcol">' + valChip(l3, def.ctx, true, 1) + '</td>'
        + '<td class="numcol tp-trend-col--highlight">' + valChip(l1, def.ctx, true, 1) + '</td>'
        + '<td class="numcol">' + (delta != null ? valChip(delta, def.ctx, true, 1) : '—') + '</td>'
        + '<td class="numcol">' + (velocity != null ? esc((velocity > 0 ? '+' : '') + velocity.toFixed(2)) : '—') + '</td>'
        + '<td><span class="tp-trend-table__reliability">' + esc(reliability) + '</span></td>'
        + '<td><span class="tp-trend-table__interp tp-trend-table__interp--' + tone + '">' + esc(interp) + '</span></td></tr>';
    }).join('');
    var chart = '';
    if (C && C.buildTrendLineChart) {
      chart = C.buildTrendLineChart('OSI faced', pack.osi || [], 480, 120, {
        labels: ['L10', 'L6', 'L3', 'L1'], metricCtx: 'osi', invertTrend: true
      });
    }
    var readout = bullpenTrendReadout(pack);
    return '<div class="tp-trend-table-wrap pp-allowed-trend"><p class="tp-trend-table-note">'
      + esc(ctx.splitLabel || 'Overall') + ' · opponent quality by appearance date (L10→L1) · '
      + (pack.logCount ? pack.logCount + ' appearance days in log' : 'no reliever log — showing unit snapshot')
      + ' · L1 is a momentum flag, not a standalone predictor.</p>'
      + '<table class="tp-trend-table"><thead><tr><th>Metric</th><th>L10</th><th>L6</th><th>L3</th>'
      + '<th class="tp-trend-col--highlight">L1</th><th>Δ L1−L10</th><th>Velocity</th><th>Reliability</th><th>Interpretation</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>'
      + '<div class="tp-trend-chart-mount" data-active-metric="osi">' + chart + '</div>'
      + (readout ? '<p class="tp-trend-readout">' + esc(readout) + '</p>' : '')
      + '</div>';
  }

  function filterLogBySosSplit(log, pickCol, split, team) {
    if (!split || split === 'overall') return log || [];
    return (log || []).filter(function(g) {
      if (split === 'home' || split === 'away') {
        // Reliever log records venue in home_away ('home'/'away'), not Home/Away team cols.
        var ha = String(pickCol(g, ['home_away', 'home away']) || '').toLowerCase();
        return ha === split;
      }
      if (split === 'lhh' || split === 'rhh') {
        // Predominant batter hand faced per appearance (LHH/RHH), now populated.
        var hand = String(pickCol(g, ['batter_hand_faced', 'batter hand faced']) || '').toUpperCase();
        if (!hand) return false;
        var isLeft = hand.indexOf('L') === 0;
        return split === 'lhh' ? isLeft : !isLeft;
      }
      return true;
    });
  }

  // Strength of schedule faced: map each opponent the bullpen faced (from the
  // reliever log) to that opponent's season OOR / PALS / OSI and average them.
  function aggregateSOSFromLog(log, pickCol, maxApps, split, team, oorMap, palsMap) {
    var rows = filterLogBySosSplit(log, pickCol, split, team).slice().sort(function(a, b) {
      return String(pickCol(b, ['date', 'Date'])).localeCompare(String(pickCol(a, ['date', 'Date'])));
    });
    if (maxApps) rows = rows.slice(0, maxApps);
    var o = 0, no = 0, p = 0, np = 0, s = 0, ns = 0;
    rows.forEach(function(g) {
      var opp = String(pickCol(g, ['opponent_team', 'opponent team']) || '').trim().toUpperCase();
      var oor = oorMap ? oorMap[opp] : null;
      var pl = palsMap ? palsMap[opp] : null;
      var osiFaced = num(pickCol(g, ['opponent_OSI', 'opponent OSI']));
      if (osiFaced == null && pl && pl.osi != null) osiFaced = pl.osi;
      if (oor != null && !isNaN(oor)) { o += oor; no++; }
      if (pl && pl.pals != null && !isNaN(pl.pals)) { p += pl.pals; np++; }
      if (osiFaced != null && !isNaN(osiFaced)) { s += osiFaced; ns++; }
    });
    return {
      OOR_faced: no ? o / no : null,
      PALS_faced: np ? p / np : null,
      OSI_faced: ns ? s / ns : null,
      apps: rows.length
    };
  }

  function renderStrengthOfSchedulePanel(unit, ctx) {
    var pickCol = ctx.pickCol;
    var log = ctx.teamLog || [];
    var window = ctx.window || 'YTD';
    var split = ctx.sosSplit || 'overall';
    var splitLabels = {
      overall: 'Overall', home: 'Home', away: 'Away', lhh: 'vs LHH', rhh: 'vs RHH'
    };
    var maxApps = window === 'L14' ? 20 : window === 'L30' ? 45 : null;
    var row = aggregateSOSFromLog(log, pickCol, maxApps, split, ctx.team, ctx.oorMap, ctx.palsMap);
    // If a split has no faced-opponent data, fall back to the full-season faced set.
    if (row.OOR_faced == null && row.PALS_faced == null && row.OSI_faced == null && split !== 'overall') {
      row = aggregateSOSFromLog(log, pickCol, maxApps, 'overall', ctx.team, ctx.oorMap, ctx.palsMap);
    }
    return '<div class="tp-trend-table-wrap pp-oor-metrics-wrap" data-sos-split="' + esc(split) + '">'
      + '<table class="hub-table tp-table pp-oor-metrics-table"><thead><tr>'
      + '<th>OOR Faced</th><th>PALS Faced</th><th>OSI Faced</th></tr></thead><tbody><tr>'
      + '<td class="pp-oor-metric-cell">' + valChip(row.OOR_faced, 'oor', false, 1) + '</td>'
      + '<td class="pp-oor-metric-cell">' + valChip(row.PALS_faced, 'pals', false, 1) + '</td>'
      + '<td class="pp-oor-metric-cell">' + valChip(row.OSI_faced, 'osi', false, 1) + '</td>'
      + '</tr></tbody></table>'
      + '<p class="tp-trend-table-note">Showing <strong>' + esc(splitLabels[split] || ctx.sosSplitLabel || 'Overall') + '</strong>'
      + ' · ' + (row.apps || 0) + ' opponent' + ((row.apps === 1) ? '' : 's') + ' faced'
      + (window !== 'YTD' ? ' · ' + esc(window) + ' window' : '')
      + ' · higher OOR / PALS / OSI = tougher opposing offenses faced.</p></div>';
  }

  function renderAllowedDashboard(unit, ctx) {
    var resolved = resolveAllowed(unit, ctx);
    var m = resolved.metrics;
    var l14 = resolved.l14;
    var all = ctx.allUnits || [];
    var pickCol = ctx.pickCol;
    var team = ctx.team;

    function pct(key, val) {
      var vals = all.map(function(u) { return colVal(u, 'overall', key, pickCol); });
      return percentileRank(val, vals, true);
    }

    var cards = [
      { key: 'ABQ_allowed', label: 'ABQ Allowed', val: m.abq, l14: l14.abq,
        note: 'Plate discipline quality of opposing lineups — lower is easier for command.' },
      { key: 'RCV_allowed', label: 'RCV Allowed', val: m.rcv, l14: l14.rcv,
        note: 'Contact quality faced — lower means fewer barrel-heavy matchups.' },
      { key: 'OBR_allowed', label: 'OBR Allowed', val: m.obr, l14: l14.obr,
        note: 'On-base floor of offenses faced — lower limits baserunner traffic.' },
      { key: 'OSI_allowed', label: 'OSI Allowed', val: m.osi, l14: l14.osi,
        note: 'Composite offensive strength faced — primary schedule difficulty read.' }
    ];

    return '<div class="bp-allowed-metrics">' + cards.map(function(c) {
        var p = pct(c.key, c.val);
        var chip = (A && A.valChipHtml && c.val != null)
          ? A.valChipHtml(c.val, 'osi', true, 1)
          : esc(fmt(c.val, 1));
        return '<div class="bp-allowed-stat">' +
          '<div class="bp-allowed-stat__row">' +
          '<span class="bp-allowed-stat__label">' + esc(c.label) + '</span>' +
          '<span class="bp-allowed-stat__value">' + chip + '</span>' +
          (p != null ? '<span class="bp-allowed-stat__rank">P' + p + ' softer</span>' : '') +
          '</div>' +
          '<span class="bp-allowed-stat__note">YTD ' + fmt(colVal(unit, 'overall', c.key, pickCol), 1) +
          ' · L14 ' + fmt(c.l14, 1) + '</span></div>';
      }).join('') + '</div>' +
      (ctx.allowedNote ? '<div class="insight-line tp-note">' + ctx.allowedNote + '</div>' : '');
  }

  function renderOORPanel(unit, ctx) {
    var pickCol = ctx.pickCol;
    var log = ctx.teamLog || [];
    var window = ctx.window || 'YTD';
    var maxApps = window === 'L14' ? 20 : window === 'L30' ? 45 : null;

    var avgOor = colVal(unit, 'overall', 'OSI_allowed', pickCol);
    if (window !== 'YTD' && log.length) {
      var wAvg = avgFromLog(log, pickCol, ['opponent_OSI', 'opponent OSI'], maxApps);
      if (wAvg != null) avgOor = wAvg;
    }

    var oorLabel = avgOor == null ? 'OOR data pending'
      : avgOor >= 55 ? 'Above-average offensive competition faced — bullpen ERA may be legitimate'
      : avgOor <= 45 ? 'Soft schedule — headline bullpen ERA may be inflated'
      : 'Near-average competition faced';

    var oorColor = avgOor >= 55 ? 'var(--red-l)' : avgOor <= 45 ? 'var(--green)' : 'var(--text-2)';
    var tonightOsi = ctx.tonightOsi;
    var tonightLabel = '';
    if (tonightOsi != null && avgOor != null) {
      var delta = tonightOsi - avgOor;
      tonightLabel = delta > 3 ? 'Tougher than season avg' : delta < -3 ? 'Softer than season avg' : 'In line with season avg';
    }

    var splitRows = [
      ['vs LHH lineups', colVal(unit, 'vs_lhh', 'OSI_allowed', pickCol)],
      ['vs RHH lineups', colVal(unit, 'vs_rhh', 'OSI_allowed', pickCol)],
      ['Home', colVal(unit, 'home', 'OSI_allowed', pickCol)],
      ['Away', colVal(unit, 'away', 'OSI_allowed', pickCol)],
      ['High leverage', colVal(unit, 'high_leverage', 'OSI_allowed', pickCol)],
      ['Low leverage', colVal(unit, 'low_leverage', 'OSI_allowed', pickCol)]
    ];

    var trend = log.slice().sort(function(a, b) {
      return String(pickCol(a, ['date', 'Date'])).localeCompare(String(pickCol(b, ['date', 'Date'])));
    }).slice(-24).map(function(g) {
      return num(pickCol(g, ['opponent_OSI', 'opponent OSI']));
    }).filter(function(v) { return v != null; });

    var trendHtml = '';
    if (trend.length >= 3) {
      var max = Math.max.apply(null, trend);
      var min = Math.min.apply(null, trend);
      var range = max - min || 1;
      trendHtml = '<div class="oor-trend"><div class="oor-trend-label">Last ' + trend.length +
        ' appearances — opponent strength</div><div class="oor-spark">' +
        trend.map(function(v) {
          var h = 8 + ((v - min) / range) * 24;
          return '<div class="oor-bar" style="height:' + h + 'px;background:' + allowedColor(v) + '" title="' + v.toFixed(1) + '"></div>';
        }).join('') + '</div></div>';
    }

    return '<div class="oor-panel">' +
      '<div class="oor-hero">' +
      '<div class="oor-score" style="color:' + oorColor + '">' + (avgOor != null ? avgOor.toFixed(1) : '—') + '</div>' +
      '<div class="oor-copy"><p class="oor-label">' + esc(oorLabel) + '</p>' +
      (tonightOsi != null ? '<p class="oor-tonight">Tonight\'s lineup OSI <strong>' + tonightOsi.toFixed(1) + '</strong>' +
        (avgOor != null ? ' vs season avg OOR <strong>' + avgOor.toFixed(1) + '</strong>' : '') +
        (tonightLabel ? ' · <em>' + esc(tonightLabel) + '</em>' : '') + '</p>' : '') +
      '</div></div>' +
      '<div class="oor-splits"><table class="ma-split-table"><tbody>' +
      splitRows.map(function(r) {
        return '<tr><td>' + esc(r[0]) + '</td><td style="font-family:var(--mono);color:' + allowedColor(r[1]) + '">' + fmt(r[1], 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      trendHtml +
      '</div>';
  }

  function buildRelieverTable(relievers, ctx) {
    if (!relievers.length) return '<div class="empty-state">No individual reliever rows for this team.</div>';

    var pickCol = ctx.pickCol;
    var expandedPid = ctx.expandedPid;
    var inferRole = ctx.inferRole;
    var relieverIP = ctx.relieverIP;
    var appearanceDetail = ctx.appearanceDetail;
    var sortKey = ctx.sortKey || 'ip';
    var sortDir = ctx.sortDir === 'asc' ? 1 : -1;
    var colCount = 10;

    function sortVal(r) {
      if (sortKey === 'era') return colVal(r, 'overall', 'ERA', pickCol);
      if (sortKey === 'k') return pctNorm(colVal(r, 'overall', 'K_pct', pickCol));
      if (sortKey === 'osi') return colVal(r, 'overall', 'OSI_allowed', pickCol);
      return relieverIP(pickCol(r, ['pitcher_id']), pickCol(r, ['pitcher_name']));
    }

    var sorted = relievers.slice().sort(function(a, b) {
      var va = sortVal(a), vb = sortVal(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * sortDir;
    });

    function thCell(label, key, isNum) {
      var parts = [];
      if (key && sortKey === key) parts.push('sorted');
      if (isNum) parts.push('col-num');
      var cls = parts.length ? ' class="' + parts.join(' ') + '"' : '';
      var ds = key ? ' data-sort="' + esc(key) + '"' : '';
      return '<th' + cls + ds + '>' + label + '</th>';
    }

    var html = '<div class="bp-reliever-rank-wrap table-wrap">'
      + '<table class="tp-table hub-table bp-reliever-rank-table" data-sort="' + esc(sortKey) + '"><thead><tr>'
      + thCell('Name', 'name', false) + thCell('Role', null, false)
      + thCell('IP', 'ip', true) + thCell('ERA', 'era', true) + thCell('K%', 'k', true)
      + thCell('BB%', null, true) + thCell('HR/9', null, true)
      + thCell('OSI All.', 'osi', true) + thCell('ABQ All.', null, true)
      + thCell('Hi Lev ERA', null, true)
      + '</tr></thead><tbody>';

    sorted.forEach(function(r) {
      var pid = pickCol(r, ['pitcher_id']);
      var name = pickCol(r, ['pitcher_name']);
      var role = inferRole(pid, name);
      var ip = relieverIP(pid, name);
      var exp = expandedPid === String(pid);
      var rolePillCls = 'bp-role-pill' + (role.cls ? ' ' + role.cls : ' bp-role-pill--mid');

      html += '<tr class="reliever-row hub-row' + (exp ? ' expanded' : '') + '" data-pid="' + esc(pid) + '" data-name="' + esc(name) + '">'
        + '<td class="bp-reliever-name-cell"><strong class="bp-reliever-name">' + esc(name) + '</strong></td>'
        + '<td class="bp-role-cell"><span class="' + rolePillCls + '">' + esc(role.label) + '</span></td>'
        + '<td class="num">' + valChip(ip, 'ip', false, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(r, 'overall', 'ERA', pickCol), 'rp_era', true, 2) + '</td>'
        + '<td class="num">' + valChip(pctNorm(colVal(r, 'overall', 'K_pct', pickCol)), 'rp_kpct', false, 1) + '</td>'
        + '<td class="num">' + valChip(pctNorm(colVal(r, 'overall', 'BB_pct', pickCol)), 'rp_bbpct', true, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(r, 'overall', 'HR9', pickCol), 'rp_hr9', true, 2) + '</td>'
        + '<td class="num">' + valChip(colVal(r, 'overall', 'OSI_allowed', pickCol), 'osi', true, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(r, 'overall', 'ABQ_allowed', pickCol), 'abq', true, 1) + '</td>'
        + '<td class="num">' + valChip(colVal(r, 'high_leverage', 'ERA', pickCol), 'rp_era', true, 2) + '</td></tr>';
      if (exp) html += '<tr class="detail-row"><td colspan="' + colCount + '">' + appearanceDetail(pid, name) + '</td></tr>';
    });

    return html.replace(/<\/?motion>/g, '') + '</tbody></table></div>';
  }

  function strip(s) {
    return String(s || '').replace(/<\/?motion>/g, '');
  }

  function renderBullpenDecisionStrip(unit, ctx) {
    var PS = global.ProfileShell;
    if (!PS || !unit) return '';
    var pickCol = ctx.pickCol;
    var hiEra = colVal(unit, 'high_leverage', 'ERA', pickCol);
    var loEra = colVal(unit, 'low_leverage', 'ERA', pickCol);
    var overallEra = colVal(unit, 'overall', 'ERA', pickCol);
    var levTone = 'watch';
    var levHint = 'High vs low leverage ERA';
    if (hiEra != null && loEra != null) {
      if (hiEra > loEra + 1.2) { levTone = 'risk'; levHint = 'Hi lev ERA ' + fmt(hiEra, 2) + ' vs ' + fmt(loEra, 2); }
      else if (hiEra <= loEra) { levTone = 'elite'; levHint = 'Holds up in leverage spots'; }
    }
    var rhhOsi = colVal(unit, 'vs_rhh', 'OSI_allowed', pickCol);
    var lhhOsi = colVal(unit, 'vs_lhh', 'OSI_allowed', pickCol);
    var handVal = '—';
    var handHint = 'Platoon allowed profile';
    var handTone = '';
    if (rhhOsi != null && lhhOsi != null) {
      handVal = Math.abs(rhhOsi - lhhOsi) <= 2 ? 'Balanced' : (rhhOsi > lhhOsi ? 'RHH tougher' : 'LHH tougher');
      handHint = 'RHH ' + fmt(rhhOsi, 1) + ' · LHH ' + fmt(lhhOsi, 1) + ' OSI all.';
      handTone = Math.abs(rhhOsi - lhhOsi) >= 4 ? 'watch' : 'elite';
    }
    var tonightVal = ctx.tonightOsi != null ? fmt(ctx.tonightOsi, 1) : (ctx.isToday ? 'Tonight' : '—');
    var tonightHint = ctx.tonightHtml ? 'Slate game on deck' : 'No slate match found';
    var tonightTone = ctx.tonightOsi != null && colVal(unit, 'overall', 'OSI_allowed', pickCol) != null
      && ctx.tonightOsi > colVal(unit, 'overall', 'OSI_allowed', pickCol) + 3 ? 'risk' : 'watch';
    return PS.decisionStrip([
      PS.decisionCard('Availability', 'See board', 'Closer/setup/long relief below', ''),
      PS.decisionCard('Leverage Risk', hiEra != null ? fmt(hiEra, 2) + ' ERA' : '—', levHint, levTone),
      PS.decisionCard('Fatigue', ctx.totalApps != null ? ctx.totalApps + ' apps' : '—', 'Check 7-day usage chart', 'watch'),
      PS.decisionCard('Handedness Fit', handVal, handHint, handTone),
      PS.decisionCard('Tonight Pressure', tonightVal, tonightHint, tonightTone)
    ]);
  }

  function renderBullpenAnalystTakeLine(unit, ctx) {
    var PS = global.ProfileShell;
    if (!PS || !unit) return PS ? PS.analystTakeLine(null) : '';
    var pickCol = ctx.pickCol;
    var hiEra = colVal(unit, 'high_leverage', 'ERA', pickCol);
    var loEra = colVal(unit, 'low_leverage', 'ERA', pickCol);
    var overall = colVal(unit, 'overall', 'ERA', pickCol);
    var parts = [];
    if (hiEra != null && loEra != null && hiEra > loEra + 1.2) {
      parts.push('Run-line risk rises late: high-leverage ERA is materially worse than low leverage.');
    } else if (overall != null && overall <= 3.8) {
      parts.push('Headline bullpen ERA is strong — validate against opponent quality in Strength of Schedule.');
    }
    if (ctx.tonightOsi != null && colVal(unit, 'overall', 'OSI_allowed', pickCol) != null) {
      var delta = ctx.tonightOsi - colVal(unit, 'overall', 'OSI_allowed', pickCol);
      if (delta > 4) parts.push('Tonight\'s lineup OSI runs hotter than this bullpen\'s season average allowed.');
      else if (delta < -4) parts.push('Tonight\'s opponent profiles softer than season competition faced.');
    }
    return PS.analystTakeLine(parts.slice(0, 2).join(' ') || null);
  }

  global.BullpenProfileDashboard = {
    renderSnapshot: function(team, unit, ctx) { return strip(renderSnapshot(team, unit, ctx)); },
    renderPitchingValuePanel: function(unit, ctx) { return strip(renderPitchingValuePanel(unit, ctx)); },
    renderLeveragePanel: function(unit, ctx) { return strip(renderLeveragePanel(unit, ctx)); },
    renderOsiTierPanel: function(unit, ctx) { return strip(renderOsiTierPanel(unit, ctx)); },
    renderRollingTrendPanel: function(unit, ctx) { return strip(renderRollingTrendPanel(unit, ctx)); },
    renderStrengthOfSchedulePanel: function(unit, ctx) { return strip(renderStrengthOfSchedulePanel(unit, ctx)); },
    renderAllowedDashboard: function(unit, ctx) { return strip(renderAllowedDashboard(unit, ctx)); },
    renderOORPanel: function(unit, ctx) { return strip(renderStrengthOfSchedulePanel(unit, ctx)); },
    buildRelieverTable: function(relievers, ctx) { return strip(buildRelieverTable(relievers, ctx)); },
    resolveAllowed: resolveAllowed
  };
})(typeof window !== 'undefined' ? window : this);
