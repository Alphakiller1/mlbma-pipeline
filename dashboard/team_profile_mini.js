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

  function standoutTrait(prof, m, ctx) {
    var pickCol = ctx && ctx.pickCol;
    var barrel = num(pick(prof, ['barrel_pct', 'Barrel%'], pickCol));
    var hr = num(pick(prof, ['hr', 'HR'], pickCol));
    var wrc = ctx.wrc != null ? ctx.wrc : num(pick(prof, ['wrc_plus', 'wRC+'], pickCol));
    if (barrel != null && barrel >= 10) return 'Barrel rate leader';
    if (hr != null && hr >= 100) return 'Power profile';
    if (wrc != null && wrc >= 115) return 'Elite offense';
    if (m.ppGap != null && m.ppGap >= 4) return 'Process upside';
    if (m.ppGap != null && m.ppGap <= -4) return 'Regression watch';
    var tier = tierLabel(m.osi);
    return tier.label !== '—' ? tier.label + ' offense' : 'Offense profile';
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
    var rowR = rawSplitRowForTeam(ctx.team, 'rhp', ctx.metricsR, ctx.metricsL);
    var rowL = rawSplitRowForTeam(ctx.team, 'lhp', ctx.metricsR, ctx.metricsL);

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

    return '<section class="ca-card tp-snapshot-card"><div class="team-snapshot">'
      + '<div class="snapshot-main" style="width:100%">'
      + renderInfographicHero(prof, team, m, ctx)
      + '</div></div></section>';
  }

  function iconCircle(name) {
    var I = (typeof window !== 'undefined' && window.MLBMAIcons) ? window.MLBMAIcons : null;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm" aria-hidden="true"></span>';
  }

  function renderInfographicHero(prof, team, m, ctx) {
    ctx = ctx || {};
    var accent = teamAccent(team);
    var logo = A ? A.teamLogoImg(team, 88, 'ca-profile-logo-glow snapshot-logo') : '';
    var wrc = ctx.wrc != null ? ctx.wrc : num(pick(prof, ['wrc_plus', 'wRC+', 'wrc'], ctx.pickCol));
    var rank = ctx.osiRank;
    var trait = standoutTrait(prof, m, ctx);
    var eyebrowParts = [];
    if (rank) eyebrowParts.push('#' + rank + ' OVERALL OFFENSE');
    eyebrowParts.push(trait.toUpperCase());
    eyebrowParts.push(String(ctx.teamName || team).toUpperCase());
    var wrcHtml = wrc != null
      ? '<div class="ca-wrc-medallion"><div class="v">' + valChip(wrc, 'wrc', false, 0) + '</div>'
        + '<div class="c">wRC+ · MLB ' + esc(wrcTierLabel(wrc)) + '</div></div>'
      : '';
    return '<div class="ca-profile-hero">'
      + '<div class="ca-profile-hero__main">'
      + '<div class="ca-profile-hero__eyebrow">' + esc(eyebrowParts.join(' · ')) + '</div>'
      + '<h1 class="ca-profile-hero__title">' + esc(ctx.teamName || team) + '</h1>'
      + (ctx.recordWl ? '<p class="ca-profile-hero__sub">' + esc(ctx.recordWl)
        + (rank ? ' · #' + rank + ' OSI rank' : '')
        + (ctx.avgPitchScore != null ? ' · Pitch Score ' + ctx.avgPitchScore.toFixed(0) : '') + '</p>' : '')
      + '</div>'
      + '<div class="ca-profile-hero__body">'
      + '<div class="tp-logo-glow" style="--team-glow:' + accent + '">' + logo + '</div>'
      + '<div class="ca-profile-hero__rail">' + wrcHtml + '</div>'
      + '</div>'
      + insightRailHtml(prof, m, ctx)
      + '</div>';
  }

  function insightRailHtml(prof, m, ctx) {
    ctx = ctx || {};
    var pickCol = ctx.pickCol;
    var woba = num(pick(prof, ['woba', 'wOBA'], pickCol));
    var xwoba = num(pick(prof, ['xwoba', 'xwOBA'], pickCol));
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
  function splitDisplayVal(v, digits, ctx, invert) {
    if (v == null || isNaN(v)) {
      return (A && A.chipPlaceholderHtml) ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>';
    }
    if (ctx === 'woba' || ctx === 'ops') {
      var cls = A && A.solidChipClass ? A.solidChipClass(v, 'woba', !!invert) : 'c-mid';
      return '<span class="chip ' + cls + '">' + Number(v).toFixed(digits == null ? 3 : digits) + '</span>';
    }
    return splitStatChip(v, digits, ctx, invert);
  }

  function splitCardStats(splitRow, fallbackOsi) {
    if (!splitRow) splitRow = {};
    var woba = pickSplitStat(splitRow, ['wOBA', 'woba']);
    var xwoba = pickSplitStat(splitRow, ['xwOBA', 'xwoba']);
    var slg = pickSplitStat(splitRow, ['SLG', 'slg']);
    var wrc = pickSplitStat(splitRow, ['wRC+', 'wrc_plus', 'wRC']);
    var osi = pickSplitStat(splitRow, ['OSI', 'osi']);
    var abq = pickSplitStat(splitRow, ['ABQ', 'abq']);
    var rcv = pickSplitStat(splitRow, ['RCV', 'rcv']);
    var obr = pickSplitStat(splitRow, ['OBR', 'obr']);
    if (osi == null) osi = fallbackOsi;
    return [
      ['wOBA', woba, 3, 'woba', false],
      ['xwOBA', xwoba, 3, 'woba', false],
      ['SLG', slg, 3, 'woba', false],
      ['K%', pickSplitStat(splitRow, ['K%', 'k_pct']), 1, 'pitching', true],
      ['BB%', pickSplitStat(splitRow, ['BB%', 'bb_pct']), 1, 'obr', false],
      ['HR', pickSplitStat(splitRow, ['HR', 'hr']), 0, 'wrc', false],
      ['Barrel%', pickSplitStat(splitRow, ['Barrel%', 'barrel_pct']), 1, 'rcv', false],
      ['HardHit%', pickSplitStat(splitRow, ['HardHit%', 'hardhit_pct']), 1, 'rcv', false]
    ];
  }
  function splitPairHtml(m) {
    var lStats = splitCardStats(m.rowL, m.osiL);
    var rStats = splitCardStats(m.rowR, m.osiR);
    var lWoba = lStats[0][1];
    var rWoba = rStats[0][1];
    var diff = (lWoba != null && rWoba != null) ? (lWoba - rWoba) : null;
    var strongerL = diff != null ? diff >= 0 : null;
    var badgeL = strongerL == null ? 'Split Pending' : (strongerL ? 'Stronger Split' : 'Weaker Split');
    var badgeR = strongerL == null ? 'Split Pending' : (strongerL ? 'Weaker Split' : 'Stronger Split');
    function cardHtml(title, cls, stats, badge) {
      return '<div class="ca-split-card ' + cls + '"><div class="ca-split-head">' + esc(title) + '</div><div class="ca-split-grid">'
        + stats.map(function(s) {
          return '<div class="ca-split-stat"><div class="v">' + splitDisplayVal(s[1], s[2], s[3], s[4]) + '</div><div class="k">' + esc(s[0]) + '</div></div>';
        }).join('')
        + '</div><div class="ca-split-badge">' + esc(badge) + '</div></div>';
    }
    var diffCls = diff == null ? 'c-na' : (diff > 0 ? 'c-good' : diff < 0 ? 'c-poor' : 'c-mid');
    var diffDisplay = diff == null ? '—' : ((diff > 0 ? '+' : '') + diff.toFixed(3));
    return '<div class="ca-split-pair">'
      + cardHtml('vs LHP', 'lhp', lStats, badgeL)
      + '<div class="ca-split-medallion"><div class="d"><span class="chip ' + diffCls + '" style="font-size:13px;padding:2px 6px">' + diffDisplay + '</span></div><div class="c">wOBA Δ LHP−RHP</div></div>'
      + cardHtml('vs RHP', 'rhp', rStats, badgeR)
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
    splitPairHtml: splitPairHtml,
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
