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
          OSI: scored.osi != null ? scored.osi : rawRow.OSI,
          'K%': scored.k != null ? scored.k : rawRow['K%'],
          'BB%': scored.bb != null ? scored.bb : rawRow['BB%'],
          'Barrel%': scored.barrel != null ? scored.barrel : rawRow['Barrel%'],
          'HardHit%': scored.hard != null ? scored.hard : rawRow['HardHit%']
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
      barrel: normalizeRatePct(num(pick(row, ['Barrel%', 'barrel_pct', 'barrel'], pickCol)), true),
      hard: normalizeRatePct(num(pick(row, ['HardHit%', 'hardhit_pct', 'hard'], pickCol)), true),
      avg: num(pick(row, ['AVG', 'avg'], pickCol)),
      obp: num(pick(row, ['OBP', 'obp'], pickCol)),
      ops: num(pick(row, ['OPS', 'ops'], pickCol))
    };
  }

  /** PA-weighted team rates from Batter_Splits_RHP/LHP player rows (fallback when vs_RHP sheet lacks columns). */
  function offenseRatesFromBatterSplitRows(team, rows, pickCol) {
    if (!rows || !rows.length) return {};
    var t = String(team || '').trim().toUpperCase();
    var teamRows = rows.filter(function(r) {
      return String(pick(r, ['team', 'Team', 'Tm'], pickCol)).trim().toUpperCase() === t;
    });
    if (!teamRows.length) return {};
    var paSum = 0;
    var acc = { wrc: 0, woba: 0, xwoba: 0, slg: 0, k: 0, bb: 0, barrel: 0, hard: 0, avg: 0, obp: 0, ops: 0 };
    var has = {};
    teamRows.forEach(function(r) {
      var pa = num(pick(r, ['PA', 'pa'], pickCol)) || 0;
      if (pa < 1) return;
      paSum += pa;
      function add(key, cols, pct) {
        var v = num(pick(r, cols, pickCol));
        if (v == null) return;
        if (pct) v = normalizeRatePct(v, true);
        acc[key] += v * pa;
        has[key] = true;
      }
      add('wrc', ['wRC+', 'wrc_plus', 'wrc'], false);
      add('woba', ['wOBA', 'woba'], false);
      add('xwoba', ['xwOBA', 'xwoba'], false);
      add('slg', ['SLG', 'slg'], false);
      add('k', ['K%', 'k_pct'], true);
      add('bb', ['BB%', 'bb_pct'], true);
      add('barrel', ['Barrel%', 'barrel_pct'], true);
      add('hard', ['HardHit%', 'hardhit_pct'], true);
      add('avg', ['AVG', 'avg'], false);
      add('obp', ['OBP', 'obp'], false);
      add('ops', ['OPS', 'ops'], false);
    });
    if (paSum < 1) return {};
    var out = {};
    Object.keys(acc).forEach(function(k) {
      if (!has[k]) return;
      out[k] = acc[k] / paSum;
    });
    if (out.wrc != null) out.wrc = Math.round(out.wrc * 10) / 10;
    ['woba', 'xwoba', 'slg', 'avg', 'obp', 'ops'].forEach(function(k) {
      if (out[k] != null) out[k] = Math.round(out[k] * 1000) / 1000;
    });
    ['k', 'bb', 'barrel', 'hard'].forEach(function(k) {
      if (out[k] != null) out[k] = Math.round(out[k] * 10) / 10;
    });
    return out;
  }

  function teamKeyFromRow(row, pickCol) {
    var t = pickCol ? pickCol(row, ['team', 'Team', 'Tm']) : pick(row, ['team', 'Team', 'Tm']);
    return String(t || '').trim().toUpperCase();
  }

  function aggregateTeamBatterSplit(team, splitType, batters, pickCol) {
    if (!batters || !batters.length || !pickCol) return null;
    var t = String(team || '').trim().toUpperCase();
    var want = String(splitType || '').toLowerCase();
    var paSum = 0;
    var acc = { osi: 0, abq: 0, rcv: 0, obr: 0, wrc: 0, woba: 0, slg: 0 };
    var hasMetrics = false;
    var hasRates = false;
    batters.forEach(function(b) {
      if (teamKeyFromRow(b, pickCol) !== t) return;
      var st = String(pickCol(b, ['split_type', 'Split']) || '').toLowerCase();
      if (st !== want) return;
      var pa = num(pickCol(b, ['PA', 'pa'])) || 1;
      var o = num(pickCol(b, ['OSI', 'osi']));
      var abq = num(pickCol(b, ['ABQ', 'abq']));
      var rcv = num(pickCol(b, ['RCV', 'rcv']));
      var obr = num(pickCol(b, ['OBR', 'obr']));
      if (o != null && abq != null && rcv != null && obr != null) {
        acc.osi += o * pa;
        acc.abq += abq * pa;
        acc.rcv += rcv * pa;
        acc.obr += obr * pa;
        paSum += pa;
        hasMetrics = true;
      }
      var wrc = num(pickCol(b, ['wRC+', 'wrc_plus', 'wRC', 'wrc']));
      var woba = num(pickCol(b, ['wOBA', 'woba']));
      var slg = num(pickCol(b, ['SLG', 'slg']));
      if (wrc != null) {
        acc.wrc += wrc * pa;
        if (woba != null) acc.woba += woba * pa;
        if (slg != null) acc.slg += slg * pa;
        if (!hasMetrics) paSum += pa;
        hasRates = true;
      }
    });
    if (!hasMetrics && !hasRates) return null;
    var div = paSum > 0 ? paSum : 1;
    var out = {};
    if (hasMetrics) {
      out.osi = acc.osi / div;
      out.abq = acc.abq / div;
      out.rcv = acc.rcv / div;
      out.obr = acc.obr / div;
    }
    if (hasRates) {
      out.wrc = Math.round((acc.wrc / div) * 10) / 10;
      if (acc.woba) out.woba = Math.round((acc.woba / div) * 1000) / 1000;
      if (acc.slg) out.slg = Math.round((acc.slg / div) * 1000) / 1000;
    }
    return out;
  }

  function estimateF5OsiMetrics(abq, obr, rcv) {
    if (abq == null || obr == null || rcv == null || isNaN(abq) || isNaN(obr) || isNaN(rcv)) return null;
    return (abq * 0.45) + (obr * 0.35) + (rcv * 0.20);
  }

  function batterRowsForPitchSplit(ctx, split) {
    if (!ctx) return [];
    if (split === 'sp') return ctx.batterSplitsVsSp || ctx.batters || [];
    if (split === 'rp') return ctx.batterSplitsVsRp || ctx.batters || [];
    return ctx.batters || [];
  }

  function aggregateTeamMetricsFromRows(team, rows, pickCol) {
    if (!rows || !rows.length || !pickCol) return null;
    var t = String(team || '').trim().toUpperCase();
    var paSum = 0;
    var acc = { osi: 0, abq: 0, rcv: 0, obr: 0, wrc: 0, woba: 0, slg: 0 };
    var hasMetrics = false;
    var hasRates = false;
    rows.forEach(function(b) {
      if (teamKeyFromRow(b, pickCol) !== t) return;
      var pa = num(pickCol(b, ['PA', 'pa'])) || 1;
      var o = num(pickCol(b, ['OSI', 'osi']));
      var abq = num(pickCol(b, ['ABQ', 'abq']));
      var rcv = num(pickCol(b, ['RCV', 'rcv']));
      var obr = num(pickCol(b, ['OBR', 'obr']));
      if (o != null && abq != null && rcv != null && obr != null) {
        acc.osi += o * pa;
        acc.abq += abq * pa;
        acc.rcv += rcv * pa;
        acc.obr += obr * pa;
        paSum += pa;
        hasMetrics = true;
      }
      var wrc = num(pickCol(b, ['wRC+', 'wrc_plus', 'wRC', 'wrc']));
      var woba = num(pickCol(b, ['wOBA', 'woba']));
      var slg = num(pickCol(b, ['SLG', 'slg']));
      if (wrc != null) {
        acc.wrc += wrc * pa;
        if (woba != null) acc.woba += woba * pa;
        if (slg != null) acc.slg += slg * pa;
        if (!hasMetrics) paSum += pa;
        hasRates = true;
      }
    });
    if (!hasMetrics && !hasRates) return null;
    var div = paSum > 0 ? paSum : 1;
    var out = {};
    if (hasMetrics) {
      out.osi = acc.osi / div;
      out.abq = acc.abq / div;
      out.rcv = acc.rcv / div;
      out.obr = acc.obr / div;
    }
    if (hasRates) {
      out.wrc = Math.round((acc.wrc / div) * 10) / 10;
      if (acc.woba) out.woba = Math.round((acc.woba / div) * 1000) / 1000;
      if (acc.slg) out.slg = Math.round((acc.slg / div) * 1000) / 1000;
    }
    return out;
  }

  function aggregateTeamLocationSplit(team, loc, ctx, pickCol) {
    var rows = loc === 'home'
      ? (ctx.batterSplitsHome || [])
      : (ctx.batterSplitsAway || []);
    if (rows.length) {
      var fromSheet = aggregateTeamMetricsFromRows(team, rows, pickCol);
      if (fromSheet) return fromSheet;
    }
    return aggregateTeamBatterSplit(team, loc, ctx.batters || [], pickCol);
  }

  function aggregateTeamPitchSplit(team, split, ctx, pickCol) {
    var rows = batterRowsForPitchSplit(ctx, split);
    if (rows.length) {
      var fromSheet = aggregateTeamMetricsFromRows(team, rows, pickCol);
      if (fromSheet) return fromSheet;
    }
    var want = split === 'sp' ? 'vs_sp' : 'vs_rp';
    return aggregateTeamBatterSplit(team, want, ctx.batters || [], pickCol);
  }

  function profileLocationMetrics(prof, pickCol, prefix) {
    function pf(keys) { return num(pick(prof, keys, pickCol)); }
    var cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    return {
      osi: pf([prefix + '_osi', cap + '_OSI']),
      abq: pf([prefix + '_abq', cap + '_ABQ']),
      rcv: pf([prefix + '_rcv', cap + '_RCV']),
      obr: pf([prefix + '_obr', cap + '_OBR'])
    };
  }

  function offenseRatesFromBatterSplits(team, split, splitsR, splitsL, pickCol) {
    if (split === 'rhp') return offenseRatesFromBatterSplitRows(team, splitsR, pickCol);
    if (split === 'lhp') return offenseRatesFromBatterSplitRows(team, splitsL, pickCol);
    if (split === 'both') {
      return blendOffenseRates(
        offenseRatesFromBatterSplitRows(team, splitsR, pickCol),
        offenseRatesFromBatterSplitRows(team, splitsL, pickCol)
      );
    }
    return {};
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
      hr: blend('hr'), k: blend('k'), bb: blend('bb'), barrel: blend('barrel'), hard: blend('hard'),
      avg: blend('avg'), obp: blend('obp'), ops: blend('ops')
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
    ['wrc', 'woba', 'xwoba', 'slg', 'hr', 'k', 'bb', 'barrel', 'hard', 'avg', 'obp', 'ops'].forEach(function(key) {
      if (source[key] != null) target[key] = source[key];
    });
  }

  function fillMissingRates(target, source) {
    if (!source) return;
    ['wrc', 'woba', 'xwoba', 'slg', 'hr', 'k', 'bb', 'barrel', 'hard', 'avg', 'obp', 'ops'].forEach(function(key) {
      if ((target[key] == null || isNaN(target[key])) && source[key] != null) target[key] = source[key];
    });
  }

  function teamLocationRate(prof, split, key, pickCol) {
    if (!prof || !pickCol) return null;
    function pf(keys) { return num(pick(prof, keys, pickCol)); }
    if (split === 'home') return pf(['home_' + key, key]);
    if (split === 'away') return pf(['away_' + key, key]);
    var h = pf(['home_' + key]);
    var a = pf(['away_' + key]);
    if (h != null && a != null) return (h + a) / 2;
    return h != null ? h : a;
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
      barrel: normalizeRatePct(pf(['barrel_pct', 'Barrel%']), true),
      hard: normalizeRatePct(pf(['hardhit_pct', 'HardHit%']), true),
      avg: pf(['avg', 'AVG']),
      obp: pf(['obp', 'OBP']),
      ops: pf(['ops', 'OPS'])
    };

    if (rates.wrc == null) rates.wrc = teamLocationRate(prof, split, 'wrc', pickCol);
    if (rates.woba == null) rates.woba = teamLocationRate(prof, split, 'woba', pickCol);
    if (rates.slg == null) rates.slg = teamLocationRate(prof, split, 'slg', pickCol);

    if (split === 'home') {
      fillMissingRates(rates, offenseRatesFromBatterSplitRows(team, ctx.batterSplitsHome, pickCol));
      if (pf(['home_wrc']) != null) rates.wrc = pf(['home_wrc']);
      if (pf(['home_woba']) != null) rates.woba = pf(['home_woba']);
      if (pf(['home_slg']) != null) rates.slg = pf(['home_slg']);
    } else if (split === 'away') {
      fillMissingRates(rates, offenseRatesFromBatterSplitRows(team, ctx.batterSplitsAway, pickCol));
      if (pf(['away_wrc']) != null) rates.wrc = pf(['away_wrc']);
      if (pf(['away_woba']) != null) rates.woba = pf(['away_woba']);
      if (pf(['away_slg']) != null) rates.slg = pf(['away_slg']);
    } else if (split === 'f5') {
      fillMissingRates(rates, offenseRatesFromBatterSplitRows(team, ctx.batterSplitsVsSp, pickCol));
    } else if (split === 'sp' || split === 'rp') {
      var pitchAgg = aggregateTeamPitchSplit(team, split, ctx, pickCol);
      if (pitchAgg) {
        if (pitchAgg.wrc != null) rates.wrc = pitchAgg.wrc;
        if (pitchAgg.woba != null) rates.woba = pitchAgg.woba;
        if (pitchAgg.slg != null) rates.slg = pitchAgg.slg;
      }
    } else {
      var sheetSplit = split;
      applySheetRates(rates, offenseRatesFromMetrics(team, sheetSplit, ctx.metricsR, ctx.metricsL, pickCol));
      fillMissingRates(rates, offenseRatesFromBatterSplits(
        team, split, ctx.batterSplitsR, ctx.batterSplitsL, pickCol
      ));
    }

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
    var splitKey = split === 'home' || split === 'away' || split === 'f5' || split === 'sp' || split === 'rp' ? 'both' : split;
    var sheetRow = metricRowForTeam(ctx.team, splitKey, ctx.metricsR, ctx.metricsL);
    var rowR = scoredSplitRow(rawSplitRowForTeam(ctx.team, 'rhp', ctx.metricsR, ctx.metricsL));
    var rowL = scoredSplitRow(rawSplitRowForTeam(ctx.team, 'lhp', ctx.metricsR, ctx.metricsL));

    function pf(keys) { return num(pick(prof, keys, pickCol)); }

    var osi, abq, rcv, obr, proj;
    if (split === 'rhp') {
      osi = pf(['osi_vs_rhp', 'OSI_vs_RHP']); abq = pf(['abq_vs_rhp', 'ABQ_vs_RHP']); rcv = pf(['rcv_vs_rhp', 'RCV_vs_RHP']); obr = pf(['obr_vs_rhp', 'OBR_vs_RHP']);
    } else if (split === 'lhp') {
      osi = pf(['osi_vs_lhp', 'OSI_vs_LHP']); abq = pf(['abq_vs_lhp', 'ABQ_vs_LHP']); rcv = pf(['rcv_vs_lhp', 'RCV_vs_LHP']); obr = pf(['obr_vs_lhp', 'OBR_vs_LHP']);
    } else if (split === 'home' || split === 'away') {
      var loc = split;
      var locAgg = aggregateTeamLocationSplit(ctx.team, loc, ctx, pickCol);
      var profLoc = profileLocationMetrics(prof, pickCol, loc);
      osi = (locAgg && locAgg.osi != null) ? locAgg.osi : profLoc.osi;
      abq = (locAgg && locAgg.abq != null) ? locAgg.abq : profLoc.abq;
      rcv = (locAgg && locAgg.rcv != null) ? locAgg.rcv : profLoc.rcv;
      obr = (locAgg && locAgg.obr != null) ? locAgg.obr : profLoc.obr;
    } else if (split === 'f5') {
      var f5Agg = aggregateTeamPitchSplit(ctx.team, 'sp', ctx, pickCol);
      if (f5Agg) {
        if (f5Agg.osi != null) osi = f5Agg.osi;
        if (f5Agg.abq != null) abq = f5Agg.abq;
        if (f5Agg.rcv != null) rcv = f5Agg.rcv;
        if (f5Agg.obr != null) obr = f5Agg.obr;
      } else {
        osi = pf(['osi_f5', 'OSI_F5']);
        abq = pf(['abq_f5', 'ABQ_F5']);
        rcv = pf(['rcv_f5', 'RCV_F5']);
        obr = pf(['obr_f5', 'OBR_F5']);
      }
      if (osi == null) osi = estimateF5OsiMetrics(abq, obr, rcv);
    } else if (split === 'sp' || split === 'rp') {
      var pitchAgg = aggregateTeamPitchSplit(ctx.team, split, ctx, pickCol);
      if (pitchAgg) {
        if (pitchAgg.osi != null) osi = pitchAgg.osi;
        if (pitchAgg.abq != null) abq = pitchAgg.abq;
        if (pitchAgg.rcv != null) rcv = pitchAgg.rcv;
        if (pitchAgg.obr != null) obr = pitchAgg.obr;
      }
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
    var abqYtd = pf(['abq_ytd', 'ABQ_YTD']);
    var rcvYtd = pf(['rcv_ytd', 'RCV_YTD']);
    var obrYtd = pf(['obr_ytd', 'OBR_YTD']);
    if (osiYtd == null) osiYtd = pf(['osi']);
    /* Do not use split-filtered abq/rcv/obr as YTD trend anchors — causes flat +0.0 deltas. */

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

  function trendTableMetricCell(v, ctxKey) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctxKey || 'osi', false, 1);
    if (v == null || isNaN(v)) return '<span class="chip c-na">—</span>';
    return '<span class="chip c-mid">' + Number(v).toFixed(1) + '</span>';
  }

  function trendTableDeltaCell(v) {
    if (v == null || isNaN(v)) {
      return A && A.chipPlaceholderHtml ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>';
    }
    var display = (v > 0 ? '+' : '') + Number(v).toFixed(1);
    var cls = v > 1.5 ? 'c-good' : v < -1.5 ? 'c-poor' : 'c-mid';
    return '<span class="chip ' + cls + '">' + esc(display) + '</span>';
  }

  function trendTableVelocityCell(v) {
    if (v == null || isNaN(v)) return '<span class="chip c-na">—</span>';
    var display = (v > 0 ? '+' : '') + Number(v).toFixed(2);
    var cls = v > 0.6 ? 'c-good' : v < -0.6 ? 'c-poor' : 'c-mid';
    return '<span class="chip ' + cls + '">' + esc(display) + '</span>';
  }

  function trendDirectiveTone(interpretation) {
    var t = String(interpretation || '').toLowerCase();
    if (t.indexOf('momentum up') >= 0) return 'up';
    if (t.indexOf('momentum down') >= 0) return 'down';
    if (t.indexOf('spike') >= 0) return 'spike';
    if (t.indexOf('stable') >= 0) return 'stable';
    return 'mixed';
  }

  function renderTeamTrendTable(m, ctx, active) {
    var C = global.MLBMACharts;
    if (!C || !C.buildTrendWindowRow || !C.trendMetricPack) return '';
    var pack = C.trendMetricPack(m);
    var metrics = [
      { k: 'osi', label: 'OSI', ctx: 'osi', desc: 'Offense Score' },
      { k: 'rcv', label: 'RCV', ctx: 'rcv', desc: 'Contact Value' },
      { k: 'abq', label: 'ABQ', ctx: 'abq', desc: 'Approach Quality' },
      { k: 'obr', label: 'OBR', ctx: 'obr', desc: 'On-Base Value' }
    ];
    var filterNote = (ctx.splitLabel || ctx.split || 'both') + ' · ' + (ctx.windowLabel || ctx.window || 'YTD')
      + ' · read YTD→L7 left to right for movement';
    var rows = metrics.map(function(def) {
      var row = C.buildTrendWindowRow(pack[def.k] || []);
      return { def: def, row: row };
    });
    var activePack = rows.find(function(r) { return r.def.k === active; }) || rows[0];
    var activeRow = activePack ? activePack.row : null;
    var directive = '';
    if (activeRow && activeRow.interpretation && activeRow.interpretation !== 'Insufficient') {
      var deltaTxt = activeRow.delta != null
        ? ((activeRow.delta > 0 ? '▲ ' : activeRow.delta < 0 ? '▼ ' : '± ') + Math.abs(activeRow.delta).toFixed(1) + ' L7−YTD')
        : '';
      directive = '<div class="tp-trend-directive tp-trend-directive--' + trendDirectiveTone(activeRow.interpretation) + '">'
        + '<span class="tp-trend-directive__metric">' + esc((activePack.def.label || active).toUpperCase()) + '</span>'
        + '<span class="tp-trend-directive__read">' + esc(activeRow.interpretation)
        + (deltaTxt ? ' · ' + esc(deltaTxt) : '')
        + ' · ' + esc(activeRow.trend || 'Stable')
        + ' · ' + esc(activeRow.reliability || 'Noisy')
        + '</span></div>';
    }
    var body = rows.map(function(item) {
      var def = item.def;
      var row = item.row;
      var isActive = def.k === active;
      return '<tr class="tp-trend-table__row' + (isActive ? ' is-active' : '') + '" data-trend-metric-row="' + esc(def.k) + '">'
        + '<th scope="row"><span class="tp-trend-table__metric">' + esc(def.label)
        + '<span class="tp-trend-table__metric-desc">' + esc(def.desc) + '</span></span></th>'
        + '<td class="numcol">' + trendTableMetricCell(row.ytd, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableMetricCell(row.l30, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableMetricCell(row.l14, def.ctx) + '</td>'
        + '<td class="numcol tp-trend-col--highlight">' + trendTableMetricCell(row.l7, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableDeltaCell(row.delta) + '</td>'
        + '<td class="numcol">' + trendTableVelocityCell(row.velocity) + '</td>'
        + '<td><span class="tp-trend-table__reliability">' + esc(row.reliability || 'Noisy') + '</span></td>'
        + '<td><span class="tp-trend-table__interp tp-trend-table__interp--' + trendDirectiveTone(row.interpretation) + '">'
        + esc(row.interpretation || 'Insufficient') + '</span></td>'
        + '</tr>';
    }).join('');
    return '<div class="tp-trend-table-wrap">'
      + '<p class="tp-trend-table-note">' + esc(filterNote) + ' · L7 is a momentum flag, not a standalone predictor.</p>'
      + directive
      + '<table class="tp-trend-table" aria-label="Rolling grade trends by metric">'
      + '<thead><tr>'
      + '<th scope="col">Metric</th>'
      + '<th scope="col">YTD</th><th scope="col">L30</th><th scope="col">L14</th>'
      + '<th scope="col" class="tp-trend-col--highlight">L7</th>'
      + '<th scope="col">Δ L7−YTD</th><th scope="col">Velocity</th>'
      + '<th scope="col">Reliability</th><th scope="col">Interpretation</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
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
    var formReadHtml = global.TeamProfileIntel && TeamProfileIntel.renderFormReadHtml
      ? TeamProfileIntel.renderFormReadHtml(m) : '';
    var readout = '';
    if (!formReadHtml && C.trendDeltaReadout) {
      readout = C.trendDeltaReadout(m, windowKey);
    }
    var toggles = [
      { k: 'osi', abbr: 'OSI', desc: 'Offense Score' },
      { k: 'rcv', abbr: 'RCV', desc: 'Contact Value' },
      { k: 'abq', abbr: 'ABQ', desc: 'Approach Quality' },
      { k: 'obr', abbr: 'OBR', desc: 'On-Base Value' }
    ].map(function(t) {
      return '<button type="button" class="ca-pill-btn tp-trend-metric' + (active === t.k ? ' active' : '')
        + '" data-trend-metric="' + t.k + '" aria-pressed="' + (active === t.k ? 'true' : 'false') + '"'
        + ' title="' + esc(t.desc) + '">' + esc(t.abbr) + '</button>';
    }).join('');
    var chart = C.buildTrendLineChart(active.toUpperCase(), sliced.values, 480, 120, {
      labels: sliced.labels,
      metricCtx: active
    });
    return '<div class="tp-trend-panel" data-window="' + esc(windowKey) + '">'
      + '<div class="tp-trend-controls" role="group" aria-label="Chart metric">' + toggles + '</div>'
      + renderTeamTrendTable(m, ctx, active)
      + '<div class="tp-trend-chart-mount" data-active-metric="' + esc(active) + '">' + chart + '</div>'
      + (formReadHtml || (readout ? '<p class="tp-trend-readout">' + esc(readout) + '</p>' : ''))
      + '</div>';
  }

  function subsectionHeadHtml(label, iconKey) {
    return '<div class="tp-subsection-head">'
      + iconCircle(iconKey || 'circle-dot')
      + '<span class="tp-subsection-head__label">' + esc(label) + '</span>'
      + '</div>';
  }

  function splitContextSummary(m, prof, ctx) {
    var platoon = platoonSplitSummary(m, ctx);
    var location = locationSplitSummary(prof, m, ctx);
    if (!platoon && !location) return '';
    return '<div class="tp-split-context">'
      + (platoon ? platoon.replace('tp-platoon-summary', 'tp-platoon-summary tp-split-context__platoon') : '')
      + (location ? location.replace('tp-location-summary', 'tp-location-summary tp-split-context__location') : '')
      + '</div>';
  }

  function renderOffenseSplitSummary(prof, m, ctx) {
    var splitNotes = splitContextSummary(m, prof, ctx);
    var splitVerdictExtra = '';
    if (global.TeamProfileIntel && TeamProfileIntel.renderSplitVerdictHtml
        && (ctx.split === 'both' || ctx.split === 'home' || ctx.split === 'away' || ctx.split === 'f5' || !ctx.split)) {
      splitVerdictExtra = TeamProfileIntel.renderSplitVerdictHtml(m);
    }
    if (!splitNotes && !splitVerdictExtra) return '';
    var filterNote = (ctx.splitLabel || ctx.split || 'both') + ' · ' + (ctx.windowLabel || ctx.window || 'YTD');
    return '<div class="tp-offense-split-summary">'
      + '<p class="tp-offense-split-summary__label">Split context · ' + esc(filterNote) + '</p>'
      + (splitNotes || '')
      + splitVerdictExtra
      + '</div>';
  }

  function renderSummaryPanel(prof, team, m, ctx) {
    var trendHead = (A && A.caSectionHeadHtml)
      ? A.caSectionHeadHtml('trending-up', 'Trend', 'Rolling Trend', 'YTD → L7 windows · velocity · reliability')
      : '<h2 class="ca-section-title">Rolling Trend</h2>'
        + '<p class="ca-helper tp-summary-filter" title="Research Lab trend parameters">YTD → L7 windows · velocity · reliability</p>';

    return '<div class="tp-summary-panel">'
      + '<header class="ca-section-header tp-summary-head">' + trendHead + '</header>'
      + renderTrendChartPanel(m, ctx)
      + '</div>';
  }

  function renderTrendSnapshot(prof, team, ctx) {
    ctx = ctx || {};
    var m = resolveView(prof, ctx);
    return '<section class="ca-card tp-snapshot-card"><div class="team-snapshot">'
      + '<div class="snapshot-main" style="width:100%">'
      + renderSummaryPanel(prof, team, m, ctx)
      + '</div></div></section>';
  }

  function renderHeroCard(prof, team, ctx) {
    ctx = ctx || {};
    var heroCtx = Object.assign({}, ctx, {
      window: 'YTD',
      windowLabel: 'Season'
    });
    var m = resolveView(prof, heroCtx);
    return renderInfographicHero(prof, team, m, heroCtx);
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

  function heroRecordTone(recordWl) {
    var m = String(recordWl || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    if (!m) return 'neutral';
    var w = parseInt(m[1], 10);
    var l = parseInt(m[2], 10);
    if (!w && !l) return 'neutral';
    var pct = w / (w + l);
    if (pct >= 0.55) return 'positive';
    if (pct <= 0.45) return 'negative';
    return 'neutral';
  }

  function heroRankTone(rank) {
    if (rank == null || isNaN(rank)) return 'neutral';
    if (rank <= 5) return 'elite';
    if (rank <= 12) return 'strong';
    if (rank <= 20) return 'mid';
    return 'weak';
  }

  function heroPitchTone(ps) {
    if (ps == null || isNaN(ps)) return 'neutral';
    if (ps >= 70) return 'elite';
    if (ps >= 55) return 'solid';
    return 'weak';
  }

  function heroStatChip(label, value, tone, chipOpts) {
    chipOpts = chipOpts || {};
    var valueHtml = '';
    if (chipOpts.numeric != null && !isNaN(chipOpts.numeric) && A && A.valChipHtml) {
      valueHtml = valChip(
        chipOpts.numeric,
        chipOpts.context || 'osi',
        !!chipOpts.invert,
        chipOpts.decimals == null ? 1 : chipOpts.decimals
      );
    } else if (value != null && value !== '') {
      valueHtml = value;
    } else {
      return '';
    }
    return '<div class="tp-hero-stat tp-hero-stat--' + esc(tone || 'neutral') + '">'
      + '<span class="tp-hero-stat__label">' + esc(label) + '</span>'
      + '<span class="tp-hero-stat__value">' + valueHtml + '</span>'
      + '</div>';
  }

  function heroRpgTone(rpg) {
    if (rpg == null || isNaN(rpg)) return 'neutral';
    if (rpg >= 5.2) return 'elite';
    if (rpg >= 4.8) return 'strong';
    if (rpg >= 4.3) return 'mid';
    return 'weak';
  }

  function renderInfographicHero(prof, team, m, ctx) {
    ctx = ctx || {};
    m = m || {};
    var accent = teamAccent(team);
    var logo = A ? A.teamLogoImg(team, 88, 'tp-team-banner__logo-img snapshot-logo') : '';
    var watermark = A ? A.teamLogoImg(team, 220, 'tp-team-banner__watermark-img') : '';
    var rank = ctx.osiRank;
    var rpg = ctx.runsPerGame;
    var osi = num(m.osi);
    var wrc = ctx.wrc != null ? ctx.wrc : null;
    var rates = resolveOffenseRates(prof, ctx);
    var status = global.TeamProfileIntel && TeamProfileIntel.offenseStatusLabel
      ? TeamProfileIntel.offenseStatusLabel(m, rates)
      : { label: '', cls: 'tp-intel-status--neutral' };

    var contextBits = [];
    if (ctx.splitLabel || ctx.split) contextBits.push(ctx.splitLabel || ctx.split);
    contextBits.push('Season');
    var contextLine = contextBits.join(' · ');

    var badge = status.label
      ? '<span class="tp-team-banner__badge tp-lineup-identity__badge ' + esc(status.cls) + '">'
        + esc(status.label) + '</span>'
      : '';

    var medallion = osi != null
      ? '<div class="tp-team-banner__medallion" aria-label="Offense Score">'
        + '<span class="tp-team-banner__medallion-k">OSI</span>'
        + valChip(osi, 'osi', false, 1)
        + (rank ? '<span class="tp-team-banner__medallion-rank">League #' + esc(String(rank)) + '</span>' : '')
        + '</div>'
      : '';

    var statRow = ''
      + heroStatChip('Record', ctx.recordWl ? esc(ctx.recordWl) : null, heroRecordTone(ctx.recordWl))
      + heroStatChip('OSI Rank', rank ? '#' + esc(String(rank)) : null, heroRankTone(rank))
      + heroStatChip('Runs Per Game', null, heroRpgTone(rpg),
        rpg != null && !isNaN(rpg) ? { numeric: rpg, context: 'rpg', decimals: 2 } : null)
      + (wrc != null && !isNaN(wrc)
        ? heroStatChip('wRC+', null, heroRankTone(wrc >= 110 ? 5 : wrc >= 100 ? 12 : 22),
          { numeric: wrc, context: 'wrc', decimals: 0 })
        : '');

    return '<section class="tp-team-banner tp-team-banner--hero" style="--tp-accent:' + esc(accent) + '">'
      + '<div class="tp-team-banner__ambient" aria-hidden="true"></div>'
      + (watermark ? '<div class="tp-team-banner__watermark" aria-hidden="true">' + watermark + '</div>' : '')
      + '<div class="tp-team-banner__inner">'
      + '<div class="tp-team-banner__identity">'
      + (logo ? '<div class="tp-team-banner__logo">' + logo + '</div>' : '')
      + '<div class="tp-team-banner__copy">'
      + '<p class="ca-eyebrow tp-team-banner__eyebrow">Offense Profile</p>'
      + '<h2 class="tp-team-banner__title">' + esc(ctx.teamName || team) + '</h2>'
      + (contextLine ? '<p class="tp-team-banner__sub">' + esc(contextLine) + '</p>' : '')
      + badge
      + '</div></div>'
      + medallion
      + '</div>'
      + (statRow ? '<div class="tp-team-banner__stats tp-team-banner__stats--hero" aria-label="Team snapshot">' + statRow + '</div>' : '')
      + '</section>';
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
    if (split === 'sp' || split === 'rp') return '';
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

    if (!details.length) return '';

    return '<div class="tp-platoon-summary">'
      + '<div class="tp-platoon-summary-head">' + subsectionHeadHtml('Platoon Report', 'git-branch') + '</div>'
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
      + '<div class="tp-platoon-summary-head">' + subsectionHeadHtml('Location Report', 'stadium') + '</div>'
      + (lead ? '<p class="tp-platoon-summary-lead">' + lead + '</p>' : '')
      + (details.length ? '<p class="tp-platoon-summary-detail">' + details.join(' · ') + '</p>' : '')
      + '</div>';
  }

  function render(prof, team, ctx) {
    if (global.TeamProfileSections && TeamProfileSections.renderAll) {
      return TeamProfileSections.renderAll(prof, team, ctx);
    }
    return '<div class="ca-empty-state"><p class="ca-helper">Offense breakdown unavailable — sections could not load. Hard refresh or verify team_profile_sections.js is present.</p></div>';
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
    renderOffenseSplitSummary: renderOffenseSplitSummary,
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
    },
    renderHeroCard: function(prof, team, ctx) {
      ctx = ctx || {};
      ctx.splitLabel = splitLabel(ctx.split || 'both');
      ctx.windowLabel = ctx.window || 'YTD';
      return renderHeroCard(prof, team, ctx).replace(/<\/?motion>/g, '');
    },
    renderTrendSnapshot: function(prof, team, ctx) {
      ctx = ctx || {};
      ctx.splitLabel = splitLabel(ctx.split || 'both');
      ctx.windowLabel = ctx.window || 'YTD';
      return renderTrendSnapshot(prof, team, ctx).replace(/<\/?motion>/g, '');
    },
    renderTrendChartPanel: renderTrendChartPanel,
    renderTeamTrendTable: renderTeamTrendTable,
    renderSummaryPanel: renderSummaryPanel,
  };
})(typeof window !== 'undefined' ? window : this);
