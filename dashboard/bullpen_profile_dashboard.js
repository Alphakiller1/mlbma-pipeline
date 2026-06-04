/**
 * Bullpen Report — snapshot, metrics allowed, OOR panel, reliever table.
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
    return (A && A.metricColor) ? A.metricColor(era, 'era') : 'var(--text-3)';
  }

  function irColor(v) {          // inherited-runners scored %, lower is better
    if (v === null || isNaN(v)) return 'var(--text-3)';
    return (A && A.metricColor) ? A.metricColor(v, 'ir') : 'var(--text-3)';
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

  function statPill(label, rawVal, display) {
    var ctx = (label.indexOf('ERA') >= 0) ? 'era' : (label.indexOf('OSI') >= 0) ? 'osi' : 'ir';
    var inv = label.indexOf('OSI') >= 0;
    var dec = (label.indexOf('%') >= 0 || label.indexOf('OSI') >= 0) ? 1 : 2;
    var chip = (A && A.valChipHtml && rawVal != null && !isNaN(rawVal))
      ? A.valChipHtml(rawVal, ctx, inv, dec)
      : esc(display);
    return '<div class="tp-hero-stat"><span class="tp-hero-stat__label">' + esc(label) + '</span>' +
      '<span class="tp-hero-stat__value">' + chip + '</span></div>';
  }

  function renderSnapshot(team, unit, ctx) {
    var pickCol = ctx.pickCol;
    var logo = A ? A.teamLogoImg(team, 52, 'tp-team-banner__logo') : '';
    var era = colVal(unit, 'overall', 'ERA', pickCol);
    var osi = colVal(unit, 'overall', 'OSI_allowed', pickCol);
    var irp = colVal(unit, 'overall', 'inherited_runners_scored_pct', pickCol);
    var hiEra = colVal(unit, 'high_leverage', 'ERA', pickCol);
    var apps = num(pickCol(unit, ['appearances'])) || (ctx.totalApps != null ? ctx.totalApps : null);
    var badges = (ctx.isToday ? '<span class="pill pill-today">Playing Today</span>' : '') +
      (ctx.pitchScore != null ? '<span class="pill pill-score">Staff Pitch Score ' + fmt(ctx.pitchScore, 0) + '</span>' : '') +
      (apps != null ? '<span class="pill pill-meta">' + apps + ' apps</span>' : '');

    return '<div class="tp-team-banner tp-team-banner--hero bullpen-snapshot">' +
      '<div class="tp-team-banner__ambient" aria-hidden="true"></div>' +
      '<div class="tp-team-banner__inner">' +
      '<div class="tp-team-banner__identity">' +
      (logo ? '<div class="tp-team-banner__logo-wrap">' + logo + '</div>' : '') +
      '<div class="tp-team-banner__copy">' +
      '<div class="tp-team-banner__eyebrow">Bullpen Profile</div>' +
      '<h1 class="tp-team-banner__name ca-profile-hero__title">' + esc(team) + ' Bullpen</h1>' +
      (badges ? '<div class="tp-team-banner__badges ps-badges">' + badges + '</div>' : '') +
      '</div></div>' +
      '<div class="tp-hero-stat-row tp-team-banner__stats--hero">' +
      statPill('ERA', era, fmt(era, 2)) +
      statPill('OSI Allowed', osi, fmt(osi, 1)) +
      statPill('IR Scored %', irp, fmtPct(irp)) +
      statPill('Hi Lev ERA', hiEra, fmt(hiEra, 2)) +
      '</div>' +
      (ctx.tonightHtml ? '<div class="tp-team-banner__meta ps-tonight">' + ctx.tonightHtml + '</div>' : '') +
      '</div></div>';
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
    var colCount = 14;

    var html = '<table class="tp-table hub-table"><thead><tr>' +
      '<th>Name</th><th>Role</th><th>IP</th><th>ERA</th><th>K%</th><th>BB%</th><th>HR/9</th>' +
      '<th>OSI All.</th><th>ABQ All.</th><th>OOR</th><th>vs RHH OSI</th><th>vs LHH OSI</th>' +
      '<th>IR Scored%</th><th>Hi Lev ERA</th>' +
      '</tr></thead><tbody>';

    relievers.forEach(function(r) {
      var pid = pickCol(r, ['pitcher_id']);
      var name = pickCol(r, ['pitcher_name']);
      var role = inferRole(pid, name);
      var ip = relieverIP(pid, name);
      var exp = expandedPid === String(pid);
      var oor = colVal(r, 'overall', 'OSI_allowed', pickCol);

      html += '<tr class="reliever-row' + (exp ? ' expanded' : '') + '" data-pid="' + esc(pid) + '" data-name="' + esc(name) + '">' +
        '<td><strong><a href="reliever_profile.html?player=' + encodeURIComponent(name) + '" style="color:var(--purple-2);text-decoration:none;">' + esc(name) + '</a></strong></td>' +
        '<td class="' + role.cls + '">' + esc(role.label) + '</td>' +
        '<td class="num">' + fmt(ip, 1) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'overall', 'ERA', pickCol), 2) + '</td>' +
        '<td class="num">' + fmtPct(colVal(r, 'overall', 'K_pct', pickCol)) + '</td>' +
        '<td class="num">' + fmtPct(colVal(r, 'overall', 'BB_pct', pickCol)) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'overall', 'HR9', pickCol), 2) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'overall', 'OSI_allowed', pickCol), 1) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'overall', 'ABQ_allowed', pickCol), 1) + '</td>' +
        '<td class="num">' + fmt(oor, 1) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'vs_rhh', 'OSI_allowed', pickCol), 1) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'vs_lhh', 'OSI_allowed', pickCol), 1) + '</td>' +
        '<td class="num">' + fmtPct(colVal(r, 'overall', 'inherited_runners_scored_pct', pickCol)) + '</td>' +
        '<td class="num">' + fmt(colVal(r, 'high_leverage', 'ERA', pickCol), 2) + '</td></tr>';
      if (exp) html += '<tr class="detail-row"><td colspan="' + colCount + '">' + appearanceDetail(pid, name) + '</td></tr>';
    });

    return html.replace(/<\/?motion>/g, '') + '</tbody></table>';
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
      parts.push('Headline bullpen ERA is strong — validate against opponent quality in OOR panel.');
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
    renderAllowedDashboard: function(unit, ctx) { return strip(renderAllowedDashboard(unit, ctx)); },
    renderOORPanel: function(unit, ctx) { return strip(renderOORPanel(unit, ctx)); },
    renderDecisionStrip: function(unit, ctx) { return strip(renderBullpenDecisionStrip(unit, ctx)); },
    renderAnalystTakeLine: function(unit, ctx) { return strip(renderBullpenAnalystTakeLine(unit, ctx)); },
    buildRelieverTable: function(relievers, ctx) { return strip(buildRelieverTable(relievers, ctx)); },
    resolveAllowed: resolveAllowed
  };
})(typeof window !== 'undefined' ? window : this);
