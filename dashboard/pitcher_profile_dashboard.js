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

  // K%/BB% arrive as a fraction (0.21) in some feeds and percent (21) in others;
  // normalize to percent points so they grade on the kpct/bbpct contexts.
  function pctNorm(v) {
    if (v == null || isNaN(v)) return v;
    return v <= 1.5 ? v * 100 : v;
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

    var maxStarts = window === 'L1' ? 1 : window === 'L3' ? 3 : window === 'L6' ? 6
      : window === 'L10' ? 10 : window === 'L7' ? 2 : window === 'L14' ? 4 : window === 'L30' ? 8 : null;
    var overall = (split === 'ytd' || split === '' || split == null);
    // Drive the rolling windows from the game log so YTD/L30/L14/L7 sit on ONE
    // consistent basis (recent schedule difficulty) and actually differ. For the
    // overall view we window every column incl. YTD; for a specific split we only
    // window the non-YTD columns and keep the split-row value otherwise. Falls back
    // to the profile/split value when the log lacks a metric.
    if (log.length && (overall || window !== 'YTD')) {
      var lm = {
        abq: avgFromLog(log, pick, ['opponent_ABQ', 'opponent ABQ'], maxStarts),
        rcv: avgFromLog(log, pick, ['opponent_RCV', 'opponent RCV'], maxStarts),
        obr: avgFromLog(log, pick, ['opponent_OBR', 'opponent OBR'], maxStarts),
        osi: avgFromLog(log, pick, ['opponent_OSI', 'opponent OSI'], maxStarts)
      };
      metrics = {
        abq: lm.abq != null ? lm.abq : metrics.abq,
        rcv: lm.rcv != null ? lm.rcv : metrics.rcv,
        obr: lm.obr != null ? lm.obr : metrics.obr,
        osi: lm.osi != null ? lm.osi : metrics.osi
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
    var era = num(pick(profile, ['ERA', 'era']));
    var qsPct = null;
    if (ctx.log && ctx.log.length) {
      var qsHits = 0, qsTot = 0;
      ctx.log.forEach(function(g) {
        var gip = parseIP(pick(g, ['IP', 'ip']));
        var ger = num(pick(g, ['ER', 'er']));
        if (ger != null) { qsTot++; if (gip >= 6 && ger <= 3) qsHits++; }
      });
      qsPct = qsTot ? (qsHits / qsTot * 100) : null;
    }

    function heroTone(good, bad, val, lowerBetter) {
      if (val == null || isNaN(val)) return 'neutral';
      if (lowerBetter) return val <= good ? 'positive' : (val >= bad ? 'negative' : 'mid');
      return val >= good ? 'positive' : (val <= bad ? 'negative' : 'mid');
    }

    function heroStat(label, valueHtml, tone) {
      return '<div class="tp-hero-stat tp-hero-stat--' + (tone || 'neutral') + '">'
        + '<span class="tp-hero-stat__label">' + esc(label) + '</span>'
        + '<span class="tp-hero-stat__value">' + valueHtml + '</span>'
        + '</div>';
    }

    return '<div class="pp-hero-inner">'
      + '<div class="ps-photo">' + hs + '</div>'
      + '<div class="ps-main">'
      + '<div class="ps-name-row">' + logo + '<h1 class="ps-name">' + esc(name) + '</h1></div>'
      + '<div class="pp-hero-badges">'
      + '<span class="pill ' + (hand === 'L' ? 'hand-pill-l' : 'hand-pill-r') + '">' + (hand === 'L' ? 'LHP' : 'RHP') + '</span>'
      + '<span class="pill">' + esc(team) + ' · SP</span>'
      + (ctx.isToday ? '<span class="pill pill-today">Today\'s Starter</span>' : '')
      + '<span class="tier-pill ' + pt.cls + '">' + esc(pt.label) + '</span>'
      + '</div>'
      + '<div class="pp-hero-stats tp-hero-stat-row tp-team-banner__stats--hero" role="group" aria-label="Headline stats">'
      + heroStat('Pitcher Score', ps != null ? fmt(ps, 0) : '—', heroTone(60, 45, ps, false))
      + heroStat('ERA', era != null ? fmt(era, 2) : '—', heroTone(3.60, 4.60, era, true))
      + heroStat('QS%', qsPct != null ? fmt(qsPct, 0) + '%' : '—', heroTone(60, 40, qsPct, false))
      + '</div>'
      + (staleWarn ? '<div class="pp-hero-note">' + esc(staleWarn) + '</div>' : '')
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
    var pick = ctx.pickCol;
    var omitHeader = !!ctx.omitHeader;
    var resolved = resolveAllowed(ctx);
    var f5 = resolved.isF5 ? (A ? A.f5WarningHtml() : '') : '';

    var headerHtml = omitHeader ? '' : (
      '<div class="allowed-header">'
      + '<p class="section-subtitle">Rolling schedule difficulty (lower = softer) · ' + esc(ctx.splitLabel || 'Overall') + '</p>'
      + '</div>'
    );

    function ctxKeyForMetric(key) {
      return key === 'abq' ? 'abq' : key === 'rcv' ? 'rcv' : key === 'obr' ? 'obr' : 'osi';
    }

    function metricsForWindow(win) {
      var c = Object.assign({}, ctx, { window: win });
      return resolveAllowed(c).metrics;
    }

    var wins = [
      { key: 'L1', label: 'Last 1' },
      { key: 'L3', label: 'Last 3' },
      { key: 'L6', label: 'Last 6' },
      { key: 'L10', label: 'Last 10' }
    ];

    var byWin = {
      L1: metricsForWindow('L1'),
      L3: metricsForWindow('L3'),
      L6: metricsForWindow('L6'),
      L10: metricsForWindow('L10')
    };

    function cell(metricKey, winKey) {
      var v = byWin[winKey] ? byWin[winKey][metricKey] : null;
      return '<td class="num">' + valChip(v, ctxKeyForMetric(metricKey), true, 1) + '</td>';
    }

    function row(metricKey, label) {
      return '<tr>'
        + '<td>' + esc(label) + '</td>'
        + wins.map(function(w) { return cell(metricKey, w.key); }).join('')
        + '</tr>';
    }

    function metricHead(label, desc) {
      return '<span class="tp-trend-table__metric">' + esc(label)
        + (desc ? '<span class="tp-trend-table__metric-desc">' + esc(desc) + '</span>' : '')
        + '</span>';
    }

    function trendRow(metricKey, label, desc) {
      return '<tr data-trend-metric-row="' + esc(metricKey) + '">'
        + '<th scope="row">' + metricHead(label, desc) + '</th>'
        + wins.map(function(w) { return cell(metricKey, w.key); }).join('')
        + '</tr>';
    }

    var table = '<div class="tp-trend-table-wrap">'
      + '<p class="tp-trend-table-note">Rolling windows · lower = softer opposing offense · ' + esc(ctx.splitLabel || 'Overall') + '</p>'
      + '<table class="tp-trend-table" aria-label="Opposing offense allowed rolling windows">'
      + '<thead><tr><th>Metric</th>' + wins.map(function(w) { return '<th class="numcol">' + esc(w.label) + '</th>'; }).join('') + '</tr></thead>'
      + '<tbody>'
      + trendRow('abq', 'ABQ allowed', 'Discipline quality faced (lower = easier)') 
      + trendRow('rcv', 'RCV allowed', 'Contact quality faced (lower = fewer barrels)') 
      + trendRow('obr', 'OBR allowed', 'On-base floor faced (lower = less traffic)') 
      + trendRow('osi', 'OSI allowed', 'Composite offensive strength faced') 
      + '</tbody></table></div>';

    return headerHtml + f5 + table;
  }

  function renderOORPanel(profile, ctx) {
    var pick = ctx.pickCol;
    var find = ctx.findSplit;
    var splits = ctx.splits || [];

    var sBoth = profile;
    var sHome = find ? find(splits, 'location', 'home') : null;
    var sAway = find ? find(splits, 'location', 'away') : null;
    var sLhb = find ? (find(splits, 'batter_hand', 'LHH') || find(splits, 'batter_hand', 'L')) : null;
    var sRhb = find ? (find(splits, 'batter_hand', 'RHH') || find(splits, 'batter_hand', 'R')) : null;

    function fcell(v, ctxKey, dec) {
      if (v == null || isNaN(v)) return '<td class="num tp-empty-cell">—</td>';
      return '<td class="num">' + valChip(v, ctxKey, false, dec) + '</td>';
    }
    function frow(label, s) {
      var oor = s ? num(pick(s, ['OOR_faced', 'avg_opponent_OOR', 'OOR'])) : null;
      var pals = s ? num(pick(s, ['PALS_faced'])) : null;
      var wrc = s ? num(pick(s, ['wRC_faced'])) : null;
      return '<tr><td>' + esc(label) + '</td>'
        + fcell(oor, 'oor', 1) + fcell(pals, 'pals', 1) + fcell(wrc, 'wrc', 0) + '</tr>';
    }

    var overall = num(pick(profile, ['OOR_faced', 'avg_opponent_OOR', 'avg_OOR', 'OOR']));
    var lbl = overall == null ? 'Competition strength pending'
      : overall >= 50 ? 'Tough schedule — ERA may be legitimate'
      : overall <= 42 ? 'Soft schedule — headline ERA may be inflated'
      : 'Near-average competition faced';

    var hero = '<div class="oor-panel"><div class="oor-hero">'
      + '<div class="oor-score">' + (overall != null ? fmt(overall, 1) : '—') + '</div>'
      + '<div class="oor-copy"><p class="oor-label">' + esc(lbl) + '</p></div>'
      + '</div></div>';

    var table = '<div class="tp-trend-table-wrap">'
      + '<p class="tp-trend-table-note">Competition faced — higher = tougher schedule (contextualizes ERA)</p>'
      + '<table class="hub-table tp-table pp-startlog" aria-label="Strength of competition by split">'
      + '<thead><tr><th>Split</th><th>OOR</th><th>PALS Faced</th><th>wRC+ Faced</th></tr></thead><tbody>'
      + frow('Both', sBoth) + frow('Home', sHome) + frow('Away', sAway)
      + frow('vs LHB', sLhb) + frow('vs RHB', sRhb)
      + '</tbody></table></div>';

    return hero + table;
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

    function splitRow(label, row) {
      if (!row) return '<tr><td>' + esc(label) + '</td><td colspan="5" class="tp-empty-cell">—</td></tr>';
      var rk = pctNorm(num(pick(row, ['K_pct', 'K%'])));
      var rbb = pctNorm(num(pick(row, ['BB_pct', 'BB%'])));
      var rhr9 = num(pick(row, ['HR9', 'HR/9']));
      var rxfip = num(pick(row, ['xFIP', 'xfip']));
      var rops = num(pick(row, ['OPS', 'ops', 'OPS_against']));
      return '<tr>'
        + '<td>' + esc(label) + '</td>'
        + '<td>' + valChip(rk, 'kpct', false, 1) + '</td>'
        + '<td>' + valChip(rbb, 'bbpct', true, 1) + '</td>'
        + '<td>' + valChip(rhr9, 'hr9', true, 2) + '</td>'
        + '<td>' + valChip(rxfip, 'xfip', true, 2) + '</td>'
        + '<td>' + valChip(rops, 'ops', true, 3) + '</td>'
        + '</tr>';
    }

    var sOverall = profile;
    var sHome = ctx.findSplit && ctx.splits ? ctx.findSplit(ctx.splits, 'location', 'home') : null;
    var sAway = ctx.findSplit && ctx.splits ? ctx.findSplit(ctx.splits, 'location', 'away') : null;
    var sLhh = ctx.findSplit && ctx.splits ? (ctx.findSplit(ctx.splits, 'batter_hand', 'LHH') || ctx.findSplit(ctx.splits, 'batter_hand', 'L')) : null;
    var sRhh = ctx.findSplit && ctx.splits ? (ctx.findSplit(ctx.splits, 'batter_hand', 'RHH') || ctx.findSplit(ctx.splits, 'batter_hand', 'R')) : null;

    var splitBody = splitRow('Both', sOverall)
      + splitRow('Home', sHome)
      + splitRow('Away', sAway)
      + splitRow('vs LHB', sLhh)
      + splitRow('vs RHB', sRhh);

    var splitTable = '<div class="pp-split-table-wrap"><table class="hub-table tp-table pp-split-table pp-startlog"><thead><tr>'
      + '<th>Split</th><th>K%</th><th>BB%</th><th>HR/9</th><th>xFIP</th><th>OPS</th>'
      + '</tr></thead><tbody>' + splitBody + '</tbody></table></div>';

    // Pitching Value = the split table only (Context band removed per spec).
    var metricsHtml = '<div class="pp-intel-panel__metrics">' + splitTable + '</div>';

    if (ctx.omitHeader) {
      return metricsHtml;
    }

    var header = (A && A.sectionHeaderHtml)
      ? A.sectionHeaderHtml({
        icon: 'target',
        kicker: 'Pitcher Profile',
        title: 'Pitching Value',
        subtitle: 'K% · BB% · HR/9 · xFIP · OPS — Both / Home / Away / vs LHB / vs RHB'
      })
      : '<header class="ca-section-header"><p class="ca-eyebrow">Pitcher Profile</p>'
        + '<h2 class="ca-section-title">Pitching Value</h2>'
        + '<p class="ca-helper">K% · BB% · HR/9 · xFIP · OPS — Both / Home / Away / vs LHB / vs RHB</p>'
        + '</header>';

    return '<section class="ca-board pp-section pp-intel-panel" aria-label="Pitcher profile summary">'
      + header + metricsHtml + '</section>';
  }

  function renderAnalystTakeLine(profile, ctx) {
    var pick = ctx.pickCol;
    var k = num(pick(profile, ['K_pct', 'K%']));
    var bb = num(pick(profile, ['BB_pct', 'BB%']));
    var parts = [];
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
