/**
 * Pitcher Profile — snapshot, metrics allowed dashboard, OOR panel.
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

  function allowedColor(val) {   // OSI allowed: 0-100, lower is better
    if (val === null || isNaN(val)) return 'var(--text-3)';
    return (A && A.metricColor) ? A.metricColor(val, 'osi', true) : 'var(--text-3)';
  }

  function pitchingTier(score, tiers) {
    if (score === null || isNaN(score)) return { label: '—', cls: 'tier-avg' };
    for (var i = 0; i < tiers.length; i++) {
      if (score >= tiers[i][0]) return { label: tiers[i][1], cls: tiers[i][2] };
    }
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function percentileRank(value, values, lowerIsBetter) {
    var nums = values.filter(function(v) { return v != null && !isNaN(v); });
    if (value == null || isNaN(value) || !nums.length) return null;
    var better = nums.filter(function(v) {
      return lowerIsBetter ? v >= value : v <= value;
    }).length;
    return Math.round((better / nums.length) * 100);
  }

  function parseIP(ip) {
    if (!ip && ip !== 0) return 0;
    var s = String(ip).trim();
    if (!s) return 0;
    if (s.indexOf('.') >= 0) {
      var p = s.split('.');
      return parseInt(p[0], 10) + (parseInt(p[1], 10) || 0) / 3;
    }
    return parseFloat(s) || 0;
  }

  function pickNum(row, pickCol, names) {
    if (!row) return null;
    if (pickCol) return num(pickCol(row, names));
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return num(row[names[i]]);
    }
    return null;
  }

  function avgFromLog(log, pickCol, names, maxStarts) {
    var rows = log.slice().sort(function(a, b) {
      return String(pickCol(b, ['date', 'Date'])).localeCompare(String(pickCol(a, ['date', 'Date'])));
    });
    if (maxStarts) rows = rows.slice(0, maxStarts);
    var sum = 0, n = 0;
    rows.forEach(function(g) {
      var v = pickNum(g, pickCol, names);
      if (v != null) { sum += v; n++; }
    });
    return n ? sum / n : null;
  }

  function avgOorFromLog(log, pickCol, oorMap, maxStarts) {
    var rows = log.slice().sort(function(a, b) {
      return String(pickCol(b, ['date', 'Date'])).localeCompare(String(pickCol(a, ['date', 'Date'])));
    });
    if (maxStarts) rows = rows.slice(0, maxStarts);
    var sum = 0, n = 0;
    rows.forEach(function(g) {
      var tm = String(pickCol(g, ['opponent_team', 'opponent team']) || '').toUpperCase();
      var o = oorMap[tm];
      if (o == null) o = pickNum(g, pickCol, ['opponent_OSI', 'opponent OSI']);
      if (o != null) { sum += o; n++; }
    });
    return n ? sum / n : null;
  }

  function resolveAllowed(ctx) {
    var profile = ctx.profile;
    var splits = ctx.splits || [];
    var log = ctx.log || [];
    var split = ctx.split || 'ytd';
    var window = ctx.window || 'YTD';
    var pick = ctx.pickCol;

    function pf(keys) {
      if (!profile || !pick) return null;
      return num(pick(profile, keys));
    }

    function fromSplitRow(s) {
      if (!s) return null;
      return {
        abq: num(pick(s, ['ABQ_allowed', 'ABQ allowed'])),
        rcv: num(pick(s, ['RCV_allowed', 'RCV allowed'])),
        obr: num(pick(s, ['OBR_allowed', 'OBR allowed'])),
        osi: num(pick(s, ['OSI_allowed', 'OSI allowed']))
      };
    }

    var metrics = {
      abq: pf(['ABQ_allowed', 'ABQ allowed']),
      rcv: pf(['RCV_allowed', 'RCV allowed']),
      obr: pf(['OBR_allowed', 'OBR allowed']),
      osi: pf(['OSI_allowed', 'OSI allowed'])
    };

    if (split === 'lhh' && ctx.findSplit) {
      var s = ctx.findSplit(splits, 'batter_hand', 'LHH') || ctx.findSplit(splits, 'batter_hand', 'L');
      var m = fromSplitRow(s);
      if (m) metrics = m;
    } else if (split === 'rhh' && ctx.findSplit) {
      s = ctx.findSplit(splits, 'batter_hand', 'RHH') || ctx.findSplit(splits, 'batter_hand', 'R');
      m = fromSplitRow(s);
      if (m) metrics = m;
    } else if (split === 'home' && ctx.findSplit) {
      m = fromSplitRow(ctx.findSplit(splits, 'location', 'home'));
      if (m) metrics = m;
    } else if (split === 'away' && ctx.findSplit) {
      m = fromSplitRow(ctx.findSplit(splits, 'location', 'away'));
      if (m) metrics = m;
    }

    var maxStarts = window === 'L14' ? 4 : window === 'L30' ? 8 : null;
    if (window !== 'YTD' && log.length) {
      metrics = {
        abq: avgFromLog(log, pick, ['opponent_ABQ', 'opponent ABQ'], maxStarts) || metrics.abq,
        rcv: avgFromLog(log, pick, ['opponent_RCV', 'opponent RCV'], maxStarts) || metrics.rcv,
        obr: avgFromLog(log, pick, ['opponent_OBR', 'opponent OBR'], maxStarts) || metrics.obr,
        osi: avgFromLog(log, pick, ['opponent_OSI', 'opponent OSI'], maxStarts) || metrics.osi
      };
    }

    var l14 = {
      abq: avgFromLog(log, pick, ['opponent_ABQ', 'opponent ABQ'], 4),
      rcv: avgFromLog(log, pick, ['opponent_RCV', 'opponent RCV'], 4),
      obr: avgFromLog(log, pick, ['opponent_OBR', 'opponent OBR'], 4),
      osi: avgFromLog(log, pick, ['opponent_OSI', 'opponent OSI'], 4)
    };

    return { metrics: metrics, l14: l14, isF5: split === 'f5' };
  }

  function lookupMlbId(profile, pickCol) {
    var id = pickCol(profile, ['pitcher_id', 'pitcherId']);
    if (id && A) return String(id);
    if (A && A.lookupMlbId) {
      var name = pickCol(profile, ['pitcher_name', 'pitcherName', 'Name']);
      var found = A.lookupMlbId(name);
      if (found) return found;
    }
    return id || null;
  }

  function renderSnapshot(profile, ctx) {
    var pick = ctx.pickCol;
    var name = pick(profile, ['pitcher_name', 'pitcherName', 'Name']);
    var team = pick(profile, ['pitcher_team', 'pitcherTeam', 'Tm']);
    var hand = String(pick(profile, ['pitcher_hand', 'pitcherHand', 'Hand']) || 'R').toUpperCase().slice(0, 1);
    var pid = lookupMlbId(profile, pick);
    var hs = A ? A.pitcherAvatar(pid, { crop: 'profile', className: 'pitcher-headshot-lg', eager: true }) : '';
    var logo = A ? A.teamLogoImg(team, 40, 'snapshot-logo') : '';
    var ps = ctx.pitchScore;
    var pt = pitchingTier(ps, ctx.pitchTiers || []);
    var stale = pick(profile, ['stale']) === 'True' || pick(profile, ['stale']) === 'true';
    var staleWarn = pick(profile, ['staleness_warning', 'stalenessWarning']);
    var k = num(pick(profile, ['K_pct', 'K%']));
    var bb = num(pick(profile, ['BB_pct', 'BB%']));

    function chip(v, context, invert, dec, display) {
      if (A && A.valChipHtml) return A.valChipHtml(v, context, !!invert, dec, { display: display });
      return '<span class="chip">' + esc(display != null ? display : (v == null ? '—' : String(v))) + '</span>';
    }

    var psChip = chip(ps, 'pitching', false, 0, ps != null ? fmt(ps, 0) : '—');
    var kChip = chip(k, 'pitching', false, 1, k != null ? fmt(k, 1) + '%': '—');
    var bbChip = chip(bb, 'pitching', true, 1, bb != null ? fmt(bb, 1) + '%': '—');

    return '<div class="pp-hero-inner">'
      + '<div class="ps-photo">' + hs + '</div>'
      + '<div class="ps-main">'
      + '<div class="ps-name-row">' + logo + '<h1 class="ps-name">' + esc(name) + '</h1></div>'
      + '<div class="pp-hero-badges">'
      + '<span class="pill ' + (hand === 'L' ? 'hand-pill-l' : 'hand-pill-r') + '">' + (hand === 'L' ? 'LHP' : 'RHP') + '</span>'
      + '<span class="pill">' + esc(team) + ' · SP</span>'
      + (ctx.isToday ? '<span class="pill pill-today">Today\'s Starter</span>' : '')
      + '<span class="tier-pill ' + pt.cls + '">' + esc(pt.label) + '</span>'
      + (stale ? '<span class="pill">Stale L14</span>' : '')
      + '</div>'
      + '<div class="pp-hero-score">'
      + '<span class="hub-ctrl-label">Pitch Score</span>' + psChip
      + '<span class="hub-ctrl-label">K%</span>' + kChip
      + '<span class="hub-ctrl-label">BB%</span>' + bbChip
      + '</div>'
      + (staleWarn ? '<p class="ps-stale-note">' + esc(staleWarn) + '</p>' : '')
      + (ctx.tonightHtml ? '<div class="ps-tonight">' + ctx.tonightHtml + '</div>' : '')
      + '</div></div>';
  }

  function statPill(label, val) {
    return '<div class="ps-stat"><span class="ps-stat-label">' + esc(label) + '</span><span class="ps-stat-val">' + esc(val) + '</span></div>';
  }

  function valChip(val, ctx, invert, dec, opts) {
    opts = opts || {};
    var d = dec == null ? 1 : dec;
    if (A && A.valChipHtml) return A.valChipHtml(val, ctx, invert, d, opts);
    var txt = val == null || isNaN(val) ? '—' : fmt(val, d);
    return '<span class="chip">' + esc(txt) + '</span>';
  }

  function verdictChipHtml(verdict, tone) {
    var cls = { attack: 'c-elite', respect: 'c-good', volatile: 'c-mid', fade: 'c-weak' }[tone] || 'c-mid';
    return '<span class="chip ' + cls + '">' + esc(verdict) + '</span>';
  }

  function toneToChipClass(tone) {
    if (tone === 'elite' || tone === 'attack') return 'c-elite';
    if (tone === 'watch' || tone === 'respect' || tone === 'volatile') return 'c-mid';
    if (tone === 'risk' || tone === 'fade') return 'c-weak';
    return null;
  }

  function pitcherStatCell(label, chipHtml, hint) {
    var hintHtml = hint
      ? '<span class="pp-stat-hint">' + esc(hint) + '</span>'
      : '';
    return '<div class="tp-offense-stat tp-offense-stat--inline" aria-label="' + esc(label) + '">'
      + '<span class="tp-offense-stat__label">' + esc(label) + '</span>'
      + '<span class="tp-offense-stat__body">' + chipHtml + hintHtml + '</span>'
      + '</div>';
  }

  function chipWithText(val, ctx, invert, dec, text, tone) {
    var opts = tone ? { chipClass: toneToChipClass(tone) } : {};
    var chip = valChip(val, ctx, invert, dec, opts);
    if (text == null) return chip;
    return chip.replace(/>([^<]*)</, '>' + esc(String(text)) + '<');
  }

  function pitcherStatNum(label, val, ctx, invert, dec, hint, tone) {
    var chipClass = tone ? toneToChipClass(tone) : null;
    var opts = chipClass ? { chipClass: chipClass } : {};
    return pitcherStatCell(label, valChip(val, ctx, invert, dec, opts), hint);
  }

  function metricsBand(title, hint, cellsHtml) {
    if (!cellsHtml) return '';
    return '<div class="tp-offense-metrics__band">'
      + '<div class="tp-offense-metrics__band-head">'
      + '<span class="tp-offense-metrics__band-title">' + esc(title) + '</span>'
      + (hint ? '<span class="tp-offense-metrics__band-hint">' + esc(hint) + '</span>' : '')
      + '</div>'
      + '<div class="tp-offense-metrics__row tp-offense-metrics__row--inline">' + cellsHtml + '</div>'
      + '</div>';
  }

  function renderAllowedDashboard(profile, ctx) {
    var resolved = resolveAllowed(ctx);
    var m = resolved.metrics;
    var l14 = resolved.l14;
    var all = ctx.allProfiles || [];
    var pick = ctx.pickCol;
    var name = pick(profile, ['pitcher_name']);
    var omitHeader = !!ctx.omitHeader;

    function pct(key, val) {
      var vals = all.map(function(p) { return num(pick(p, [key, key.replace('_', ' ')])); });
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

    var f5 = resolved.isF5 ? (A ? A.f5WarningHtml() : '') : '';
    var title = 'What Lineups Do Against ' + esc(name);

    var headerHtml = omitHeader ? '' : (
      '<div class="allowed-header"><h2 class="section-title">' + title + '</h2>'
      + '<p class="section-subtitle">Lower allowed scores = softer opposing offense · ' + esc(ctx.splitLabel) + ' · ' + esc(ctx.window) + '</p></div>'
    );

    var cells = cards.map(function(c) {
      var p = pct(c.key, c.val);
      var hint = (p != null ? 'Softer than ' + p + '% of SPs · ' : '')
        + 'YTD ' + fmt(num(pick(profile, [c.key])), 1) + ' · L14 ' + fmt(c.l14, 1);
      var ctxKey = (c.key || '').indexOf('ABQ') >= 0 ? 'abq'
        : (c.key || '').indexOf('RCV') >= 0 ? 'rcv'
        : (c.key || '').indexOf('OBR') >= 0 ? 'obr'
        : 'osi';
      return pitcherStatCell(c.label, valChip(c.val, ctxKey, true, 1), hint);
    }).join('');

    return headerHtml + f5
      + '<div class="tp-offense-metrics tp-offense-metrics--profile">'
      + metricsBand('Allowed metrics', 'Lower = softer opposing offense · ' + esc(ctx.splitLabel || 'Overall') + ' · ' + esc(ctx.window || 'YTD'), cells)
      + '</div>';
  }

  function renderOORPanel(profile, ctx) {
    var pick = ctx.pickCol;
    var log = ctx.log || [];
    var oorMap = ctx.oorMap || {};
    var window = ctx.window || 'YTD';
    var maxStarts = window === 'L14' ? 4 : window === 'L30' ? 8 : null;
    var compact = !!ctx.compact;

    var avgOor = num(pick(profile, ['avg_opponent_OOR', 'avg_OOR', 'OOR']));
    if (avgOor == null) avgOor = avgOorFromLog(log, pick, oorMap, maxStarts);
    if (avgOor == null && log.length) avgOor = avgFromLog(log, pick, ['opponent_OSI', 'opponent OSI'], maxStarts);

    var oorLabel = avgOor == null ? 'OOR data pending'
      : avgOor >= 55 ? 'Above-average offensive competition faced — ERA may be legitimate'
      : avgOor <= 45 ? 'Soft schedule — headline ERA may be inflated'
      : 'Near-average competition faced';

    var oorColor = avgOor >= 55 ? 'var(--red-l)' : avgOor <= 45 ? 'var(--green)' : 'var(--text-2)';

    var tonightOsi = ctx.tonightOsi;
    var tonightLabel = '';
    if (tonightOsi != null && avgOor != null) {
      var delta = tonightOsi - avgOor;
      tonightLabel = delta > 3 ? 'Tougher than season avg' : delta < -3 ? 'Softer than season avg' : 'In line with season avg';
    }

    var splitRows = [
      ['vs LHH lineups', avgFromLog(log.filter(function(g) {
        var h = String(pick(g, ['opponent_hand', 'opponent hand']) || '').toUpperCase();
        return h === 'L' || h === 'LHH';
      }), pick, ['opponent_OSI', 'opponent OSI'], null)],
      ['vs RHH lineups', avgFromLog(log.filter(function(g) {
        var h = String(pick(g, ['opponent_hand', 'opponent hand']) || '').toUpperCase();
        return h === 'R' || h === 'RHH';
      }), pick, ['opponent_OSI', 'opponent OSI'], null)],
      ['Home', avgFromLog(log.filter(function(g) {
        return String(pick(g, ['home_away', 'home away']) || '').toLowerCase() === 'home';
      }), pick, ['opponent_OSI', 'opponent OSI'], null)],
      ['Away', avgFromLog(log.filter(function(g) {
        return String(pick(g, ['home_away', 'home away']) || '').toLowerCase() === 'away';
      }), pick, ['opponent_OSI', 'opponent OSI'], null)]
    ];

    var trend = log.slice().sort(function(a, b) {
      return String(pick(a, ['date', 'Date'])).localeCompare(String(pick(b, ['date', 'Date'])));
    }).slice(-12).map(function(g, i) {
      var v = pickNum(g, pick, ['opponent_OSI', 'opponent OSI']);
      if (v == null) {
        var tm = String(pick(g, ['opponent_team', 'opponent team']) || '').toUpperCase();
        v = oorMap[tm];
      }
      return { i: i, v: v };
    }).filter(function(x) { return x.v != null; });

    var trendHtml = '';
    if (!compact && trend.length >= 3) {
      var max = Math.max.apply(null, trend.map(function(t) { return t.v; }));
      var min = Math.min.apply(null, trend.map(function(t) { return t.v; }));
      var range = max - min || 1;
      trendHtml = '<div class="oor-trend"><div class="oor-trend-label">Last ' + trend.length + ' starts — opponent strength</div><div class="oor-spark">'
        + trend.map(function(t) {
          var h = 8 + ((t.v - min) / range) * 24;
          return '<div class="oor-bar" style="height:' + h + 'px;background:' + allowedColor(t.v) + '" title="' + t.v.toFixed(1) + '"></div>';
        }).join('') + '</div></div>';
    }

    return '<div class="oor-panel">'
      + '<div class="oor-hero">'
      + '<div class="oor-score" style="color:' + oorColor + '">' + (avgOor != null ? avgOor.toFixed(1) : '—') + '</div>'
      + '<div class="oor-copy"><p class="oor-label">' + esc(oorLabel) + '</p>'
      + (tonightOsi != null ? '<p class="oor-tonight">Tonight\'s lineup OSI <strong>' + tonightOsi.toFixed(1) + '</strong>'
        + (avgOor != null ? ' vs season avg OOR <strong>' + avgOor.toFixed(1) + '</strong>' : '')
        + (tonightLabel ? ' · <em>' + esc(tonightLabel) + '</em>' : '') + '</p>' : '')
      + '</div></div>'
      + (compact ? '' : (
        '<div class="oor-splits"><table class="ma-split-table"><tbody>'
        + splitRows.map(function(r) {
          return '<tr><td>' + esc(r[0]) + '</td><td style="font-family:var(--mono);color:' + allowedColor(r[1]) + '">' + fmt(r[1], 1) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      ))
      + trendHtml
      + '</div>';
  }

  function deriveStartVerdict(profile, ctx) {
    var pick = ctx.pickCol;
    var ps = ctx.pitchScore != null ? ctx.pitchScore : num(pick(profile, ['PitchScore', 'pitch_score', 'Pitching Score']));
    var k = num(pick(profile, ['K_pct', 'K%']));
    var bb = num(pick(profile, ['BB_pct', 'BB%']));
    var resolved = resolveAllowed(ctx);
    var osiAllow = resolved.metrics.osi;
    var hr9 = num(pick(profile, ['HR9', 'HR/9']));
    var risks = 0;
    var notes = [];
    if (bb != null && bb >= 10) { risks++; notes.push('elevated walks'); }
    if (k != null && k < 18) { risks++; notes.push('modest strikeout rate'); }
    if (osiAllow != null && osiAllow >= 62) { risks++; notes.push('tough opposing lineups faced'); }
    if (hr9 != null && hr9 >= 1.35) { risks++; notes.push('HR/9 pressure'); }
    if (ps != null && ps < 55) risks++;
    if (ctx.window === 'L14' && (pick(profile, ['stale']) === 'True' || pick(profile, ['stale']) === 'true')) {
      risks++;
      notes.push('limited recent sample');
    }
    if (ps == null && k == null) {
      return { verdict: 'Respect', tone: 'respect', detail: 'Insufficient sample for a firm start read in this split.' };
    }
    if (ps != null && ps >= 72 && risks <= 1) {
      return { verdict: 'Attack', tone: 'attack', detail: 'Pitch score and command profile support attacking this start' + (notes.length ? ' — watch ' + notes.join(', ') + '.' : '.') };
    }
    if (risks >= 3 || (ps != null && ps < 52)) {
      return { verdict: 'Fade', tone: 'fade', detail: 'Volatility flags: ' + (notes.length ? notes.join(', ') : 'weak pitch score / contact risk') + '.' };
    }
    if (risks >= 2 || (ps != null && ps < 65)) {
      return { verdict: 'Volatile', tone: 'volatile', detail: 'Mixed signals — ' + (notes.length ? notes.join(', ') : 'command or contact risk in play') + '.' };
    }
    return { verdict: 'Respect', tone: 'respect', detail: 'Balanced starter profile — respect quality without forcing exposure.' };
  }

  function renderStartVerdict(profile, ctx) {
    return renderPitcherIntelPanel(profile, ctx);
  }

  function renderDecisionStrip(profile, ctx) {
    return '';
  }

  function renderRiskStrip(profile, ctx) {
    return '';
  }

  function renderPitcherIntelPanel(profile, ctx) {
    var pick = ctx.pickCol;
    var PS = global.ProfileShell;
    var v = deriveStartVerdict(profile, ctx);
    var ps = ctx.pitchScore != null ? ctx.pitchScore : num(pick(profile, ['PitchScore', 'pitch_score', 'Pitching Score']));
    var k = num(pick(profile, ['K_pct', 'K%']));
    var bb = num(pick(profile, ['BB_pct', 'BB%']));
    var hr9 = num(pick(profile, ['HR9', 'HR/9']));
    var era = num(pick(profile, ['ERA']));
    var fip = num(pick(profile, ['FIP', 'fip']));
    var xfip = num(pick(profile, ['xFIP', 'xfip']));
    var resolved = resolveAllowed(ctx);
    var osiAllow = resolved.metrics.osi;
    var avgOor = num(pick(profile, ['avg_opponent_OOR', 'avg_OOR', 'OOR']));
    if (avgOor == null) avgOor = avgOorFromLog(ctx.log || [], pick, ctx.oorMap || {}, null);
    var cmdTone = bb != null && bb >= 10 ? 'risk' : bb != null && bb <= 7 ? 'elite' : 'watch';
    var contactTone = osiAllow != null && PS ? PS.toneFromScore(osiAllow, true) : '';
    var psTone = ps != null && PS ? PS.toneFromScore(ps, false) : '';
    var oorTone = avgOor != null && PS ? PS.toneFromScore(avgOor, false) : '';
    var oorHint = ctx.tonightOsi != null
      ? 'Tonight OSI ' + fmt(ctx.tonightOsi, 1)
      : 'Season competition context';

    var bbChip = bb != null
      ? chipWithText(bb, 'pitching', true, 1, fmt(bb, 1) + '% BB', cmdTone)
      : '<span class="chip chip-ph">—</span>';

    var osiChip = osiAllow != null
      ? chipWithText(osiAllow, 'osi', true, 1, fmt(osiAllow, 1) + ' OSI all.', contactTone)
      : '<span class="chip chip-ph">—</span>';

    var oorChip = avgOor != null
      ? chipWithText(avgOor, 'osi', false, 1, fmt(avgOor, 1) + ' OOR', oorTone)
      : '<span class="chip chip-ph">—</span>';

    var decisionCells = pitcherStatCell('Start Verdict', verdictChipHtml(v.verdict, v.tone))
      + pitcherStatNum('Pitch Score', ps, 'pitching', false, 0, '', psTone)
      + pitcherStatCell('Command Risk', bbChip, k != null ? fmt(k, 1) + '% K' : '')
      + pitcherStatCell('Contact Risk', osiChip, 'Lower allowed = softer lineups')
      + pitcherStatCell('Opponent Quality', oorChip, oorHint);

    var detailNote = (ctx.splitLabel || 'Overall') + ' · ' + (ctx.window || 'YTD');
    var coreCells = ''
      + pitcherStatNum('K%', k, 'pitching', false, 1)
      + pitcherStatNum('BB%', bb, 'pitching', true, 1)
      + pitcherStatNum('HR/9', hr9, 'pitching', true, 2)
      + pitcherStatNum('ERA', era, 'pitching', true, 2)
      + pitcherStatNum('FIP', fip, 'pitching', true, 2)
      + pitcherStatNum('xFIP', xfip, 'pitching', true, 2);

    function splitRow(label, row) {
      if (!row) return '';
      var rk = num(pick(row, ['K_pct', 'K%']));
      var rbb = num(pick(row, ['BB_pct', 'BB%']));
      var rhr9 = num(pick(row, ['HR9', 'HR/9']));
      var rera = num(pick(row, ['ERA']));
      var rfip = num(pick(row, ['FIP', 'fip']));
      var rxfip = num(pick(row, ['xFIP', 'xfip']));
      return '<tr>'
        + '<td>' + esc(label) + '</td>'
        + '<td>' + valChip(rk, 'pitching', false, 1) + '</td>'
        + '<td>' + valChip(rbb, 'pitching', true, 1) + '</td>'
        + '<td>' + valChip(rhr9, 'pitching', true, 2) + '</td>'
        + '<td>' + valChip(rera, 'pitching', true, 2) + '</td>'
        + '<td>' + valChip(rfip, 'pitching', true, 2) + '</td>'
        + '<td>' + valChip(rxfip, 'pitching', true, 2) + '</td>'
        + '</tr>';
    }

    var sOverall = profile;
    var sLhh = ctx.findSplit && ctx.splits ? (ctx.findSplit(ctx.splits, 'batter_hand', 'LHH') || ctx.findSplit(ctx.splits, 'batter_hand', 'L')) : null;
    var sRhh = ctx.findSplit && ctx.splits ? (ctx.findSplit(ctx.splits, 'batter_hand', 'RHH') || ctx.findSplit(ctx.splits, 'batter_hand', 'R')) : null;

    var splitBody = splitRow('Overall', sOverall)
      + (sLhh ? splitRow('vs LHH', sLhh) : '')
      + (sRhh ? splitRow('vs RHH', sRhh) : '');

    var splitTable = splitBody
      ? '<div class="pp-split-table-wrap"><table class="hub-table tp-table pp-split-table"><thead><tr>'
        + '<th>Split</th><th>K%</th><th>BB%</th><th>HR/9</th><th>ERA</th><th>FIP</th><th>xFIP</th>'
        + '</tr></thead><tbody>' + splitBody + '</tbody></table></div>'
      : '<div class="empty-state">No split rows available for this pitcher.</div>';

    var metricsHtml = '<div class="tp-offense-metrics tp-offense-metrics--profile pp-intel-panel__metrics">'
      + metricsBand(
        'Pitching Value',
        'Core pitching rates + risk context · ' + detailNote,
        coreCells + decisionCells
      )
      + '</div>'
      + splitTable;

    if (ctx.omitHeader) {
      return metricsHtml;
    }

    var subtitle = v.detail || '';
    if (ctx.splitLabel || ctx.window) {
      subtitle = (ctx.splitLabel || 'Overall') + ' · ' + (ctx.window || 'YTD')
        + (subtitle ? ' · ' + subtitle : '');
    }
    var header = (A && A.sectionHeaderHtml)
      ? A.sectionHeaderHtml({
        icon: 'target',
        kicker: 'Pitcher Profile',
        title: 'Pitching Value',
        subtitle: 'Core pitching rates + split table (Overall / vs LHH / vs RHH)'
      })
      : '<header class="ca-section-header"><p class="ca-eyebrow">Pitcher Profile</p>'
        + '<h2 class="ca-section-title">Pitching Value</h2>'
        + '<p class="ca-helper">Core pitching rates + split table (Overall / vs LHH / vs RHH)</p>'
        + '</header>';

    return '<section class="ca-board pp-section pp-intel-panel" aria-label="Pitcher profile summary">'
      + header + metricsHtml + '</section>';
  }

  function renderAnalystTakeLine(profile, ctx) {
    var pick = ctx.pickCol;
    var k = num(pick(profile, ['K_pct', 'K%']));
    var bb = num(pick(profile, ['BB_pct', 'BB%']));
    var parts = [];
    if (k != null && bb != null && bb >= 9 && k < 20) {
      parts.push('Weak K/BB mix raises inning-to-inning volatility.');
    }
    var hi = ctx.findSplit && ctx.splits ? ctx.findSplit(ctx.splits, 'osi_tier', 'High') : null;
    var lo = ctx.findSplit && ctx.splits ? ctx.findSplit(ctx.splits, 'osi_tier', 'Low') : null;
    if (hi && lo) {
      var ipH = num(pick(hi, ['avg_IP', 'avg IP']));
      var ipL = num(pick(lo, ['avg_IP', 'avg IP']));
      if (ipH != null && ipL != null && ipH < ipL - 1) {
        parts.push('Shorter leash vs high-OSI lineups — F5 risk rises late.');
      }
    }
    var line = parts.filter(Boolean).slice(0, 2).join(' ');
    if (!line) return '';
    return '<p class="pp-intel-read">' + esc(line) + '</p>';
  }

  global.PitcherProfileDashboard = {
    renderSnapshot: function(profile, ctx) {
      return renderSnapshot(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderAllowedDashboard: function(profile, ctx) {
      return renderAllowedDashboard(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderOORPanel: function(profile, ctx) {
      return renderOORPanel(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderStartVerdict: function(profile, ctx) {
      return renderStartVerdict(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderPitcherIntelPanel: function(profile, ctx) {
      return renderPitcherIntelPanel(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderDecisionStrip: function(profile, ctx) {
      return renderDecisionStrip(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderRiskStrip: function(profile, ctx) {
      return renderRiskStrip(profile, ctx).replace(/<\/?motion>/g, '');
    },
    renderAnalystTakeLine: function(profile, ctx) {
      return renderAnalystTakeLine(profile, ctx).replace(/<\/?motion>/g, '');
    },
    deriveStartVerdict: deriveStartVerdict,
    resolveAllowed: resolveAllowed
  };
})(typeof window !== 'undefined' ? window : this);
