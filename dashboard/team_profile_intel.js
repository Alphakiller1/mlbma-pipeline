/**
 * Team Profile — scouting interpretation layer (view logic, real data only).
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var Mini = global.TeamProfileMini;

  var METRIC_NAMES = {
    osi: 'Offense Score (OSI)',
    abq: 'Approach (ABQ)',
    rcv: 'Run creation (RCV)',
    obr: 'On-base value (OBR)'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function valChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    return '<span class="chip c-na">—</span>';
  }

  function delta(ytd, win) {
    if (ytd == null || win == null || isNaN(ytd) || isNaN(win)) return null;
    return win - ytd;
  }

  function trendWord(d, threshold) {
    threshold = threshold == null ? 2 : threshold;
    if (d == null || Math.abs(d) < threshold) return 'steady';
    return d > 0 ? 'improving' : 'cooling';
  }

  /** L7/L14/L30 vs YTD for OSI/RCV/ABQ/OBR — plain-English form read. */
  function formRead(m) {
    if (!m) return '';
    var specs = [
      { k: 'abq', ytd: m.abqYtd, l7: m.abqL7, l14: m.abqL14, l30: m.abqL30 },
      { k: 'rcv', ytd: m.rcvYtd, l7: m.rcvL7, l14: m.rcvL14, l30: m.rcvL30 },
      { k: 'obr', ytd: m.obrYtd, l7: m.obrL7, l14: m.obrL14, l30: m.obrL30 },
      { k: 'osi', ytd: m.osiYtd, l7: m.osiL7, l14: m.osiL14, l30: m.osiL30 }
    ];
    var hasAny = specs.some(function(s) {
      return s.ytd != null || s.l7 != null || s.l14 != null || s.l30 != null;
    });
    if (!hasAny) {
      return 'Windowed grade history unavailable — run team profile pipeline for L7/L14/L30 columns.';
    }

    var parts = [];
    specs.forEach(function(s) {
      var d14 = delta(s.ytd, s.l14);
      var d7 = delta(s.ytd, s.l7);
      var d30 = delta(s.ytd, s.l30);
      var pick = null;
      if (d14 != null && Math.abs(d14) >= 2) pick = { w: 'L14', d: d14 };
      else if (d7 != null && Math.abs(d7) >= 2) pick = { w: 'L7', d: d7 };
      else if (d30 != null && Math.abs(d30) >= 2) pick = { w: 'L30', d: d30 };
      if (!pick) return;
      parts.push(METRIC_NAMES[s.k] + ' ' + trendWord(pick.d) + ' over ' + pick.w);
    });

    if (!parts.length) {
      return 'Recent windows track close to season baseline — no major grade movers over L7/L14/L30.';
    }

    var lead = parts.slice(0, 2).join(', ');
    var tail = parts.length > 2 ? ' (' + parts.slice(2).join('; ') + ')' : '';
    var tone = parts.some(function(p) { return p.indexOf('cooling') >= 0; })
      && parts.some(function(p) { return p.indexOf('improving') >= 0; })
      ? ' — mixed short-term signals.'
      : parts[0].indexOf('improving') >= 0
        ? ' — profile heating up in the near term.'
        : parts[0].indexOf('cooling') >= 0
          ? ' — short-term run creation lagging season pace.'
          : '.';
    return lead + tail + tone;
  }

  function pickRowStat(row, keys) {
    if (!row || !Mini) return null;
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v != null && v !== '') {
        var n = parseFloat(String(v).replace(/%/g, ''));
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  function platoonSide(m, side) {
    var isL = side === 'lhp';
    var row = isL ? (m && m.rowL) : (m && m.rowR);
    function pct(v) {
      if (v == null || isNaN(v)) return null;
      return v > 0 && v <= 1 ? v * 100 : v;
    }
    return {
      label: isL ? 'vs LHP' : 'vs RHP',
      osi: isL ? m.osiL : m.osiR,
      abq: isL ? m.abqL : m.abqR,
      rcv: isL ? m.rcvL : m.rcvR,
      obr: isL ? m.obrL : m.obrR,
      woba: pickRowStat(row, ['wOBA', 'woba']),
      xwoba: pickRowStat(row, ['xwOBA', 'xwoba']),
      k: pct(pickRowStat(row, ['K%', 'k_pct', 'K_pct'])),
      bb: pct(pickRowStat(row, ['BB%', 'bb_pct', 'BB_pct']))
    };
  }

  /** vs-RHP vs vs-LHP verdict from real split metrics. */
  function splitVerdict(m) {
    if (!m) return '';
    var rhp = platoonSide(m, 'rhp');
    var lhp = platoonSide(m, 'lhp');
    var hasR = rhp.osi != null || rhp.rcv != null || rhp.woba != null;
    var hasL = lhp.osi != null || lhp.rcv != null || lhp.woba != null;
    if (!hasR && !hasL) {
      return 'Platoon split data unavailable for a handedness verdict.';
    }

    function diff(a, b) {
      if (a == null || b == null) return null;
      return a - b;
    }

    var rcvDiff = diff(lhp.rcv, rhp.rcv);
    var osiDiff = diff(lhp.osi, rhp.osi);
    var wobaDiff = diff(lhp.woba, rhp.woba);
    var abqDiff = diff(lhp.abq, rhp.abq);

    var stronger = '';
    var weaker = '';
    if (wobaDiff != null && Math.abs(wobaDiff) >= 0.005) {
      stronger = wobaDiff > 0 ? 'vs LHP' : 'vs RHP';
      weaker = wobaDiff > 0 ? 'vs RHP' : 'vs LHP';
    } else if (rcvDiff != null && Math.abs(rcvDiff) >= 2) {
      stronger = rcvDiff > 0 ? 'vs LHP' : 'vs RHP';
      weaker = rcvDiff > 0 ? 'vs RHP' : 'vs LHP';
    } else if (osiDiff != null && Math.abs(osiDiff) >= 2) {
      stronger = osiDiff > 0 ? 'vs LHP' : 'vs RHP';
      weaker = osiDiff > 0 ? 'vs RHP' : 'vs LHP';
    }

    if (!stronger) {
      return 'Handedness splits are balanced — OSI/RCV/wOBA show no meaningful platoon edge.';
    }

    var drivers = [];
    if (rcvDiff != null && Math.abs(rcvDiff) >= 2) {
      drivers.push('RCV ' + (rcvDiff > 0 ? '+' : '') + rcvDiff.toFixed(1) + ' ' + stronger.replace('vs ', ''));
    }
    if (wobaDiff != null && Math.abs(wobaDiff) >= 0.005) {
      drivers.push('wOBA ' + (wobaDiff > 0 ? '+' : '') + wobaDiff.toFixed(3));
    }
    if (abqDiff != null && Math.abs(abqDiff) < 2 && drivers.length) {
      return 'Stronger damage ' + stronger + ' (' + drivers.join(', ') + ') while approach (ABQ) holds steady both sides — the power ceiling shifts more than plate quality.';
    }
    if (drivers.length) {
      return stronger + ' is the stronger side (' + drivers.join(', ') + ') with ' + weaker + ' lagging on the same metrics.';
    }
    return stronger + ' grades ahead on offense score; monitor platoon deployment in matchups.';
  }

  /** wOBA vs xwOBA sustainability — no BABIP/Barrel (not in profile path). */
  function sustainabilityVerdict(rates) {
    rates = rates || {};
    var woba = num(rates.woba);
    var xwoba = num(rates.xwoba);
    if (woba == null || xwoba == null) {
      return {
        label: null,
        sentence: 'wOBA/xwOBA pair unavailable — sustainability check needs both contact-quality fields.',
        woba: woba,
        xwoba: xwoba,
        gap: null,
        gapPts: null,
        note: 'Based on wOBA − xwOBA only (BABIP/Barrel/HardHit not in team profile export).'
      };
    }
    var gap = woba - xwoba;
    var gapPts = Math.round(gap * 1000);
    var label = 'Sustainable';
    var sentence = 'Results track expected contact quality — wOBA and xwOBA aligned.';
    if (Math.abs(gap) >= 0.024) {
      label = gap > 0 ? 'Overperforming' : 'Underperforming';
      sentence = gap > 0
        ? 'Overperforming: wOBA .' + woba.toFixed(3) + ' vs xwOBA .' + xwoba.toFixed(3)
          + ' (' + (gapPts >= 0 ? '+' : '') + gapPts + ') — modest regression risk.'
        : 'Underperforming: xwOBA .' + xwoba.toFixed(3) + ' above wOBA .' + woba.toFixed(3)
          + ' (' + gapPts + ') — room to recover toward expected output.';
    } else if (Math.abs(gap) >= 0.010) {
      label = 'Volatile';
      sentence = 'wOBA .' + woba.toFixed(3) + ' vs xwOBA .' + xwoba.toFixed(3)
        + ' (' + (gapPts >= 0 ? '+' : '') + gapPts + ') — gap worth monitoring.';
    } else if (Math.abs(gap) >= 0.006) {
      label = gap > 0 ? 'Slightly over' : 'Slightly under';
      sentence = 'Small wOBA/xwOBA gap (' + (gapPts >= 0 ? '+' : '') + gapPts + ') — mostly sustainable with minor noise.';
    }
    var k = num(rates.k);
    var bb = num(rates.bb);
    if (k != null && k >= 24 && gap > 0.012) {
      sentence += ' Elevated K% adds swing variance to the run environment.';
    } else if (bb != null && bb >= 9 && gap < -0.012) {
      sentence += ' Strong walk rate supports catching up toward xwOBA.';
    }
    return {
      label: label,
      sentence: sentence,
      woba: woba,
      xwoba: xwoba,
      gap: gap,
      gapPts: gapPts,
      note: 'Verdict from wOBA − xwOBA and K%/BB% context only — BABIP/Barrel/HardHit not in profile export.'
    };
  }

  function offenseStatusLabel(m, rates) {
    m = m || {};
    rates = rates || {};
    var osi = num(m.osi);
    var rcv = num(m.rcv);
    var abq = num(m.abq);
    var k = num(rates.k);
    if (osi == null) return { label: 'Offense profile', cls: 'tp-intel-status--neutral' };
    if (osi >= 78 && rcv != null && rcv >= 72) {
      return { label: 'High-ceiling power offense', cls: 'tp-intel-status--elite' };
    }
    if (osi >= 75 && abq != null && abq >= 72) {
      return { label: 'Elite process offense', cls: 'tp-intel-status--elite' };
    }
    if (osi >= 72) {
      return { label: 'Plus run-scoring unit', cls: 'tp-intel-status--plus' };
    }
    if (k != null && k >= 25 && osi >= 58) {
      return { label: 'Strikeout-heavy but dangerous', cls: 'tp-intel-status--volatile' };
    }
    if (osi < 52) {
      return { label: 'Below-average offense', cls: 'tp-intel-status--weak' };
    }
    if (num(m.ppGap) != null && m.ppGap > 4) {
      return { label: 'Process ahead of results', cls: 'tp-intel-status--plus' };
    }
    return { label: 'League-average offensive profile', cls: 'tp-intel-status--neutral' };
  }

  function offenseIdentityLine(m, rates) {
    m = m || {};
    rates = rates || {};
    var osi = num(m.osi);
    var rcv = num(m.rcv);
    var abq = num(m.abq);
    var obr = num(m.obr);
    var k = num(rates.k);
    if (osi == null) {
      return 'Load Team_Profiles for a data-derived offensive identity summary.';
    }
    var tier = osi >= 75 ? 'upper-tier' : osi >= 60 ? 'competitive' : 'subpar';
    var shape = '';
    if (rcv != null && abq != null) {
      if (rcv >= abq + 8) shape = 'damage-driven';
      else if (abq >= rcv + 8) shape = 'process-driven';
      else shape = 'balanced process and contact';
    }
    var kNote = k != null && k >= 24
      ? ' with elevated strikeout volatility'
      : k != null && k <= 19
        ? ' with strong contact rates'
        : '';
    var obrNote = obr != null && obr >= 68 ? ' and on-base value that keeps innings alive' : '';
    return 'A ' + tier + ' offense built on ' + (shape || 'mixed grade pillars') + kNote + obrNote + '.';
  }

  function researchTakeaways(m, rates, ctx) {
    m = m || {};
    rates = rates || {};
    ctx = ctx || {};
    var cards = [];
    var rcv = num(m.rcv);
    var woba = num(rates.woba);
    var k = num(rates.k);
    var bb = num(rates.bb);

    if (rcv != null || woba != null) {
      var env = rcv != null && rcv >= 70
        ? 'Run environment leans high — RCV and contact quality support above-average run scoring.'
        : rcv != null && rcv < 55
          ? 'Run environment leans muted — contact value grades suggest fewer multi-run innings.'
          : woba != null && woba >= 0.330
            ? 'Contact profile supports a productive run environment on wOBA alone.'
            : 'Middle-of-the-pack run environment — totals lean neutral without a clear RCV edge.';
      cards.push({ title: 'Totals lean', body: env });
    }

    if (k != null || m.osiR != null || m.osiL != null) {
      var risk = '';
      if (k != null && k >= 24) {
        risk = 'Strikeout rate is elevated — elite-K starters and swing-miss profiles are the primary matchup stress test.';
      } else if (k != null && k <= 18) {
        risk = 'Low strikeout rate — contact-heavy staffs and ground-ball arms are less of a natural foil.';
      } else {
        risk = 'Strikeout profile is league-average — matchup risk tracks more on platoon and pitch-type fit than pure K%.';
      }
      var rcvDiff = (m.rcvL != null && m.rcvR != null) ? m.rcvL - m.rcvR : null;
      if (rcvDiff != null && Math.abs(rcvDiff) >= 4) {
        risk += ' Platoon split adds handedness risk — weaker side is more fade-friendly.';
      }
      cards.push({ title: 'Matchup risk', body: risk });
    }

    var fade = [];
    if (k != null && k >= 24) fade.push('vs high-K, swing-miss arms');
    if (m.rcvR != null && m.rcvL != null && m.rcvR < m.rcvL - 3) fade.push('when facing RHP with power stuff');
    if (m.rcvR != null && m.rcvL != null && m.rcvL < m.rcvR - 3) fade.push('when facing LHP with power stuff');
    if (num(m.osi) != null && num(m.osi) < 55) fade.push('in spots where process grades lag league average');
    if (fade.length) {
      cards.push({
        title: 'Fade conditions',
        body: 'Offense is most vulnerable ' + fade.join(', ') + ' — research context only, not a wager recommendation.'
      });
    }

    if (!cards.length) {
      cards.push({
        title: 'Research note',
        body: 'Insufficient grade/rate data for automated takeaways — expand split/window filters or refresh Team_Profiles.'
      });
    }
    return cards.slice(0, 4);
  }

  function renderFormReadHtml(m) {
    var text = formRead(m);
    if (!text) return '';
    return '<p class="tp-intel-read tp-intel-read--form">' + esc(text) + '</p>';
  }

  function renderSplitVerdictHtml(m) {
    var text = splitVerdict(m);
    if (!text) return '';
    return '<p class="tp-intel-read tp-intel-read--split">' + esc(text) + '</p>';
  }

  function renderSustainabilitySection(m, prof, ctx) {
    var rates = Mini && Mini.resolveOffenseRates ? Mini.resolveOffenseRates(prof, ctx) : {};
    var v = sustainabilityVerdict(rates);
    var labelChip = v.label
      ? '<span class="tp-intel-verdict-label tp-intel-verdict-label--' + esc(String(v.label).toLowerCase().replace(/\s+/g, '-')) + '">'
        + esc(v.label) + '</span>'
      : '';
    var chips = '<div class="tp-intel-chip-row">'
      + '<span class="tp-intel-chip-item"><span class="ca-metric-label">wOBA</span>' + valChip(v.woba, 'woba', false, 3) + '</span>'
      + '<span class="tp-intel-chip-item"><span class="ca-metric-label">xwOBA</span>' + valChip(v.xwoba, 'woba', false, 3) + '</span>'
      + (v.gapPts != null
        ? '<span class="tp-intel-chip-item"><span class="ca-metric-label">Gap</span>'
          + '<span class="chip">' + (v.gapPts >= 0 ? '+' : '') + v.gapPts + '</span></span>'
        : '')
      + '</div>';
    var body = '<div class="tp-intel-sustain">'
      + labelChip
      + chips
      + '<p class="tp-intel-read">' + esc(v.sentence) + '</p>'
      + '<p class="ca-helper tp-intel-note">' + esc(v.note) + '</p>'
      + '</div>';
    return sectionWrap('Sustainability Check', 'wOBA vs expected contact quality (xwOBA)', body, 'activity');
  }

  function renderResearchTakeaways(m, prof, ctx) {
    var rates = Mini && Mini.resolveOffenseRates ? Mini.resolveOffenseRates(prof, ctx) : {};
    var cards = researchTakeaways(m, rates, ctx);
    var grid = '<div class="tp-intel-takeaways">' + cards.map(function(c) {
      return '<article class="tp-intel-takeaway ca-card">'
        + '<h3 class="tp-intel-takeaway__title">' + esc(c.title) + '</h3>'
        + '<p class="tp-intel-takeaway__body">' + esc(c.body) + '</p>'
        + '</article>';
    }).join('') + '</div>';
    return sectionWrap('Research Takeaways', 'Metric translation for research — not betting picks', grid, 'lightbulb');
  }

  function renderStatusIdentity(m, rates) {
    var status = offenseStatusLabel(m, rates);
    var line = offenseIdentityLine(m, rates);
    return '<div class="tp-intel-status">'
      + '<span class="tp-intel-status__label ' + esc(status.cls) + '">' + esc(status.label) + '</span>'
      + '<p class="tp-intel-status__line">' + esc(line) + '</p>'
      + '</div>';
  }

  function sectionWrap(title, subtitle, body, iconKey) {
    var hdrOpts = {
      icon: iconKey || 'brain-circuit',
      kicker: 'Intelligence',
      title: title,
      subtitle: subtitle || ''
    };
    if (A && A.sectionHeaderHtml) {
      return '<section class="ca-board ca-card tp-section tp-intel-section">'
        + A.sectionHeaderHtml(hdrOpts)
        + body + '</section>';
    }
    return '<section class="ca-board ca-card tp-section tp-intel-section"><header class="ca-section-header">'
      + '<h2 class="ca-section-title">' + esc(title) + '</h2>'
      + (subtitle ? '<p class="ca-helper">' + esc(subtitle) + '</p>' : '')
      + '</header>' + body + '</section>';
  }

  function readHtml(text, kind) {
    if (!text) return '';
    return '<p class="tp-intel-read tp-intel-read--' + esc(kind || 'staff') + '">' + esc(text) + '</p>';
  }

  function staffTakeawaysGrid(cards, subtitle) {
    if (!cards || !cards.length) return '';
    var grid = '<div class="tp-intel-takeaways">' + cards.map(function(c) {
      return '<article class="tp-intel-takeaway ca-card">'
        + '<h3 class="tp-intel-takeaway__title">' + esc(c.title) + '</h3>'
        + '<p class="tp-intel-takeaway__body">' + esc(c.body) + '</p>'
        + '</article>';
    }).join('') + '</div>';
    return sectionWrap('Staff Takeaways', subtitle || 'Research context — not betting picks', grid, 'clipboard-list');
  }

  function renderStaffStatus(pack, kind) {
    if (!pack || !pack.status) return '';
    return '<div class="tp-intel-status">'
      + '<span class="tp-intel-status__label ' + esc(pack.status.cls) + '">' + esc(pack.status.label) + '</span>'
      + '<p class="tp-intel-status__line">' + esc(pack.identity || '') + '</p>'
      + '</div>';
  }

  /* ——— Starting Pitchers ——— */
  function buildRotationPack(prof, team, ctx) {
    var Staff = global.TeamProfileStaff;
    if (!Staff || !ctx || !ctx.pickCol) return null;
    var pickCol = ctx.pickCol;
    var numFn = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data || {};
    var split = ctx.split || 'overall';
    var poolPS = ctx.poolPitchScore;
    var teamSps = (DATA.sps || []).filter(function(s) {
      return teamKey(pickCol(s, ['pitcher_team', 'pitcher team'])) === teamKey(team);
    });
    function avg(field) {
      return Staff.avgTeamSpMetric(teamSps, DATA, split, field, pickCol, numFn, teamKey, poolPS);
    }
    var avgPs = split === 'overall'
      ? (numFn(pickCol(prof, ['avg_pitching_score'])) || avg('pitchScore'))
      : avg('pitchScore');
    var kPct = split === 'overall' ? numFn(pickCol(prof, ['team_k_pct'])) : avg('kPct');
    var bbPct = split === 'overall' ? numFn(pickCol(prof, ['team_bb_pct'])) : avg('bbPct');
    var osiAllow = avg('osiAllowed');
    var era = numFn(pickCol(prof, ['team_era']));
    var ipStart = numFn(pickCol(prof, ['avg_ip_per_start']));
    var scores = teamSps.map(function(sp) {
      var splits = Staff.spMetricSplitsFor(sp, DATA, teamKey);
      var m = Staff.resolveSpSplitMetrics(sp, splits, split, pickCol, numFn, poolPS);
      return {
        name: pickCol(sp, ['pitcher_name']),
        ps: m.pitchScore || (poolPS ? poolPS(sp) : null),
        k: m.kPct,
        bb: m.bbPct,
        osi: m.osiAllowed,
        stale: pickCol(sp, ['stale']) === 'True' || pickCol(sp, ['stale']) === 'true'
      };
    }).filter(function(r) { return r.ps != null; }).sort(function(a, b) { return b.ps - a.ps; });
    var staleCount = scores.filter(function(r) { return r.stale; }).length;
    return {
      split: split,
      count: teamSps.length,
      avgPs: avgPs,
      kPct: kPct,
      bbPct: bbPct,
      osiAllow: osiAllow,
      era: era,
      ipStart: ipStart,
      top: scores[0] || null,
      bottom: scores.length ? scores[scores.length - 1] : null,
      staleCount: staleCount,
      lhhPs: Staff.avgTeamSpMetric(teamSps, DATA, 'lhh', 'pitchScore', pickCol, numFn, teamKey, poolPS),
      rhhPs: Staff.avgTeamSpMetric(teamSps, DATA, 'rhh', 'pitchScore', pickCol, numFn, teamKey, poolPS),
      lhhOsi: Staff.avgTeamSpMetric(teamSps, DATA, 'lhh', 'osiAllowed', pickCol, numFn, teamKey, poolPS),
      rhhOsi: Staff.avgTeamSpMetric(teamSps, DATA, 'rhh', 'osiAllowed', pickCol, numFn, teamKey, poolPS)
    };
  }

  function rotationStatusIdentity(pack) {
    if (!pack || pack.count === 0) {
      return { status: { label: 'Rotation data pending', cls: 'tp-intel-status--neutral' }, identity: 'Load SP_Profiles for rotation intelligence.' };
    }
    var ps = pack.avgPs;
    var kbb = (pack.kPct != null && pack.bbPct != null) ? pack.kPct - pack.bbPct : null;
    var status = { label: 'League-average rotation', cls: 'tp-intel-status--neutral' };
    if (ps != null && ps >= 72 && kbb != null && kbb >= 14) {
      status = { label: 'Strikeout-forward rotation', cls: 'tp-intel-status--elite' };
    } else if (ps != null && ps >= 68 && pack.osiAllow != null && pack.osiAllow <= 52) {
      status = { label: 'Run-suppression rotation', cls: 'tp-intel-status--plus' };
    } else if (ps != null && ps < 55) {
      status = { label: 'Volatile back-end rotation', cls: 'tp-intel-status--volatile' };
    } else if (kbb != null && kbb <= 8) {
      status = { label: 'Contact-management staff', cls: 'tp-intel-status--volatile' };
    }
    var identity = 'Rotation of ' + pack.count + ' profiled arm' + (pack.count === 1 ? '' : 's');
    if (pack.top && pack.bottom && pack.top.ps != null && pack.bottom.ps != null) {
      identity += ' — top ' + pack.top.name + ' (' + Math.round(pack.top.ps) + ' Pitch Score)';
      if (pack.top.ps - pack.bottom.ps >= 12) {
        identity += ', steep drop to ' + pack.bottom.name + ' (' + Math.round(pack.bottom.ps) + ')';
      }
    }
    if (pack.kPct != null && pack.bbPct != null) {
      identity += ' · K−BB ' + (pack.kPct - pack.bbPct).toFixed(1) + ' pts';
    }
    identity += '.';
    return { status: status, identity: identity };
  }

  function rotationRead(pack) {
    if (!pack || !pack.count) return 'No SP profiles loaded for this team.';
    var parts = [];
    if (pack.top && pack.top.ps != null && pack.top.ps >= 70) {
      parts.push(pack.top.name + ' anchors the staff on Pitch Score');
    }
    if (pack.staleCount > 0) {
      parts.push(pack.staleCount + ' arm' + (pack.staleCount === 1 ? ' has' : 's have') + ' stale samples — verify before matchup use');
    }
    if (pack.kPct != null && pack.bbPct != null) {
      var kbb = pack.kPct - pack.bbPct;
      if (kbb >= 15) parts.push('rotation wins on swing-and-miss (K−BB ' + kbb.toFixed(1) + ')');
      else if (kbb <= 8) parts.push('contact-heavy profile — OSI Allowed matters more than raw K%');
    }
    if (pack.osiAllow != null && pack.osiAllow <= 50) {
      parts.push('allowed grades suppress opposing lineups');
    } else if (pack.osiAllow != null && pack.osiAllow >= 58) {
      parts.push('allowed metrics leak quality contact');
    }
    if (!parts.length) return 'Rotation grades sit near league baseline on the active split — no extreme skew in the staff.';
    return parts.join('; ') + '.';
  }

  function rotationSplitVerdict(pack) {
    if (!pack) return '';
    if (pack.split === 'lhh' || pack.split === 'rhh' || pack.split === 'home' || pack.split === 'away' || pack.split === 'f5') {
      return 'Platoon verdict uses overall split — switch to Overall to compare vs LHH vs RHH.';
    }
    if (pack.lhhOsi == null && pack.rhhOsi == null && pack.lhhPs == null && pack.rhhPs == null) {
      return 'SP platoon splits limited — vs LHH/vs RHH rows depend on SP_Metric_Splits coverage.';
    }
    var psDiff = (pack.lhhPs != null && pack.rhhPs != null) ? pack.lhhPs - pack.rhhPs : null;
    var osiDiff = (pack.lhhOsi != null && pack.rhhOsi != null) ? pack.lhhOsi - pack.rhhOsi : null;
    if (psDiff != null && Math.abs(psDiff) >= 3) {
      var side = psDiff > 0 ? 'vs LHH' : 'vs RHP';
      return side + ' is the stronger rotation side on Pitch Score (Δ ' + (psDiff >= 0 ? '+' : '') + psDiff.toFixed(1) + ')'
        + (osiDiff != null && Math.abs(osiDiff) >= 2
          ? '; OSI Allowed ' + (osiDiff > 0 ? 'weaker vs LHH' : 'weaker vs RHH') + ' (Δ ' + osiDiff.toFixed(1) + ').'
          : '.');
    }
    if (osiDiff != null && Math.abs(osiDiff) >= 2) {
      return 'Platoon edge is on allowed grades — ' + (osiDiff < 0 ? 'vs RHH' : 'vs LHH') + ' suppresses contact better (OSI Allowed Δ ' + osiDiff.toFixed(1) + ').';
    }
    return 'Rotation platoon profile is balanced across vs LHH and vs RHH on available splits.';
  }

  function rotationTakeaways(pack) {
    if (!pack || !pack.count) return [];
    var cards = [];
    if (pack.avgPs != null) {
      cards.push({
        title: 'Run prevention lean',
        body: pack.avgPs >= 68
          ? 'Staff Pitch Score supports limiting runs — lean under-friendly when this rotation is on the mound.'
          : pack.avgPs < 55
            ? 'Below-average Pitch Score — run environment tilts higher when these arms start.'
            : 'Middle-tier Pitch Score — totals lean follows matchup and bullpen more than rotation alone.'
      });
    }
    if (pack.kPct != null && pack.bbPct != null) {
      var kbb = pack.kPct - pack.bbPct;
      cards.push({
        title: 'Matchup risk',
        body: kbb >= 14
          ? 'High K−BB rotation — contact-heavy offenses are the main fade spot; swing-and-miss lineups are tougher.'
          : kbb <= 8
            ? 'Low K−BB — patient, high-OBP lineups can stress this staff; strikeouts are not the primary out path.'
            : 'Average strikeout profile — matchup risk tracks platoon and park more than pure K%.'
      });
    }
    if (pack.top && pack.bottom && pack.top.ps - pack.bottom.ps >= 15) {
      cards.push({
        title: 'Depth gap',
        body: 'Large ace-to-back-end gap — research the specific starter; staff average overstates the bottom of the rotation.'
      });
    }
    return cards.slice(0, 3);
  }

  /* ——— Bullpen ——— */
  function buildBullpenPack(prof, team, ctx) {
    var Staff = global.TeamProfileStaff;
    if (!Staff || !ctx) return null;
    var pickCol = ctx.pickCol;
    var numFn = ctx.num;
    var teamKey = ctx.teamKey;
    var DATA = ctx.data || {};
    var split = ctx.split || 'overall';
    var prefix = Staff.resolveBullpenPrefix(split);
    var unit = Staff.bullpenUnitForTeam(team, DATA, teamKey);
    function cv(metric) {
      return unit ? Staff.colVal(unit, prefix, metric, pickCol, numFn) : null;
    }
    function cvP(p, metric) {
      return unit ? Staff.colVal(unit, p, metric, pickCol, numFn) : null;
    }
    var era = cv('ERA');
    var osi = cv('OSI_allowed');
    if (era == null && split === 'overall') era = numFn(pickCol(prof, ['bullpen_era']));
    if (osi == null && split === 'overall') osi = numFn(pickCol(prof, ['bullpen_osi_allowed']));
    if (era == null && split === 'hlev') era = numFn(pickCol(prof, ['bullpen_high_lev_era']));
    var bpScore = osi != null ? Math.max(0, Math.min(100, 100 - osi)) : null;
    var relievers = (DATA.bullpen || []).filter(function(r) {
      return teamKey(pickCol(r, ['pitcher_team'])) === teamKey(team);
    });
    return {
      split: split,
      unit: unit,
      era: era,
      osi: osi,
      bpScore: bpScore,
      k: cv('K_pct'),
      bb: cv('BB_pct'),
      hiEra: cvP('high_leverage', 'ERA'),
      medEra: cvP('medium_leverage', 'ERA'),
      lhhOsi: cvP('vs_lhh', 'OSI_allowed'),
      rhhOsi: cvP('vs_rhh', 'OSI_allowed'),
      closer: pickCol(prof, ['closer_name']),
      setup: pickCol(prof, ['primary_setup']),
      relieverCount: relievers.length
    };
  }

  function bullpenStatusIdentity(pack) {
    if (!pack || (!pack.unit && pack.era == null && pack.osi == null)) {
      return { status: { label: 'Bullpen data pending', cls: 'tp-intel-status--neutral' }, identity: 'Run pipeline steps 12–13 for Bullpen_Unit rows.' };
    }
    var status = { label: 'League-average bullpen', cls: 'tp-intel-status--neutral' };
    if (pack.bpScore != null && pack.bpScore >= 72) {
      status = { label: 'Elite leverage unit', cls: 'tp-intel-status--elite' };
    } else if (pack.bpScore != null && pack.bpScore >= 62) {
      status = { label: 'Reliable late-inning group', cls: 'tp-intel-status--plus' };
    } else if (pack.bpScore != null && pack.bpScore < 48) {
      status = { label: 'High-risk bullpen', cls: 'tp-intel-status--volatile' };
    } else if (pack.hiEra != null && pack.era != null && pack.hiEra > pack.era + 1.2) {
      status = { label: 'High-leverage concern', cls: 'tp-intel-status--volatile' };
    }
    var identity = pack.relieverCount
      ? pack.relieverCount + ' profiled reliever' + (pack.relieverCount === 1 ? '' : 's')
      : 'Bullpen unit profile';
    if (pack.closer) identity += ' · closer ' + pack.closer;
    if (pack.k != null && pack.bb != null) identity += ' · K−BB ' + (pack.k - pack.bb).toFixed(1);
    identity += '.';
    return { status: status, identity: identity };
  }

  function bullpenRead(pack) {
    if (!pack || (!pack.unit && pack.osi == null)) return 'Bullpen unit metrics unavailable on this split.';
    var parts = [];
    if (pack.hiEra != null && pack.era != null) {
      if (pack.hiEra <= pack.era - 0.40) parts.push('high-leverage arms outperform the unit ERA');
      else if (pack.hiEra >= pack.era + 0.75) parts.push('high-leverage ERA runs hot — late innings are the stress point');
    }
    if (pack.osi != null && pack.osi <= 48) parts.push('OSI Allowed grades are strong — contact quality suppressed');
    else if (pack.osi != null && pack.osi >= 56) parts.push('allowed grades leak hard contact');
    if (pack.lhhOsi != null && pack.rhhOsi != null && Math.abs(pack.lhhOsi - pack.rhhOsi) >= 3) {
      parts.push((pack.rhhOsi < pack.lhhOsi ? 'vs RHH' : 'vs LHH') + ' is the softer platoon side on OSI Allowed');
    }
    if (!parts.length) return 'Bullpen profile is balanced on the active split — no extreme leverage or platoon skew.';
    return parts.join('; ') + '.';
  }

  function bullpenSplitVerdict(pack) {
    if (!pack) return '';
    if (pack.split !== 'overall' && pack.split !== 'lhh' && pack.split !== 'rhh') {
      return 'Handedness verdict uses overall or vs LHH/vs RHH splits — switch split filter to compare platoon sides.';
    }
    if (pack.lhhOsi == null && pack.rhhOsi == null) {
      return 'Bullpen platoon OSI Allowed unavailable — vs LHH/vs RHH columns missing on Bullpen_Unit.';
    }
    var diff = pack.lhhOsi - pack.rhhOsi;
    if (Math.abs(diff) < 2) return 'Bullpen platoon profile is balanced on OSI Allowed vs LHH and vs RHH.';
    var stronger = diff < 0 ? 'vs RHH' : 'vs LHH';
    var weaker = diff < 0 ? 'vs LHH' : 'vs RHH';
    return stronger + ' is the stronger bullpen side (OSI Allowed Δ ' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + ') — ' + weaker + ' is the platoon target.';
  }

  function bullpenTakeaways(pack) {
    if (!pack) return [];
    var cards = [];
    if (pack.bpScore != null || pack.era != null) {
      cards.push({
        title: 'Late-inning lean',
        body: (pack.bpScore != null && pack.bpScore >= 65) || (pack.era != null && pack.era <= 3.85)
          ? 'Bullpen supports holding leads — late runs less likely when the pen is active.'
          : (pack.bpScore != null && pack.bpScore < 50) || (pack.era != null && pack.era >= 4.60)
            ? 'Pen vulnerability — extra-inning and late rallies are the primary research angle.'
            : 'Neutral pen profile — game state and starter length drive the late-inning picture.'
      });
    }
    if (pack.hiEra != null && pack.era != null && pack.hiEra >= pack.era + 0.6) {
      cards.push({
        title: 'High-leverage risk',
        body: 'Hi-leverage ERA exceeds unit ERA — closer/setup matchups deserve extra scrutiny in research.'
      });
    }
    if (pack.lhhOsi != null && pack.rhhOsi != null && Math.abs(pack.lhhOsi - pack.rhhOsi) >= 3) {
      cards.push({
        title: 'Platoon angle',
        body: 'Handedness split on OSI Allowed is meaningful — stack research toward the softer platoon side.'
      });
    }
    return cards.slice(0, 3);
  }

  function renderRotationIntel(prof, team, ctx) {
    var pack = buildRotationPack(prof, team, ctx);
    if (!pack) return '';
    return readHtml(rotationRead(pack), 'rotation')
      + readHtml(rotationSplitVerdict(pack), 'split')
      + staffTakeawaysGrid(rotationTakeaways(pack), 'Rotation research context — not betting picks');
  }

  function renderBullpenIntel(prof, team, ctx) {
    var pack = buildBullpenPack(prof, team, ctx);
    if (!pack) return '';
    return readHtml(bullpenRead(pack), 'bullpen')
      + readHtml(bullpenSplitVerdict(pack), 'split')
      + staffTakeawaysGrid(bullpenTakeaways(pack), 'Bullpen research context — not betting picks');
  }

  function renderRotationStatus(prof, team, ctx) {
    var pack = buildRotationPack(prof, team, ctx);
    if (!pack) return '';
    var si = rotationStatusIdentity(pack);
    pack.status = si.status;
    pack.identity = si.identity;
    return renderStaffStatus(pack, 'rotation');
  }

  function renderBullpenStatus(prof, team, ctx) {
    var pack = buildBullpenPack(prof, team, ctx);
    if (!pack) return '';
    var si = bullpenStatusIdentity(pack);
    pack.status = si.status;
    pack.identity = si.identity;
    return renderStaffStatus(pack, 'bullpen');
  }

  global.TeamProfileIntel = {
    formRead: formRead,
    splitVerdict: splitVerdict,
    sustainabilityVerdict: sustainabilityVerdict,
    researchTakeaways: researchTakeaways,
    offenseStatusLabel: offenseStatusLabel,
    offenseIdentityLine: offenseIdentityLine,
    renderFormReadHtml: renderFormReadHtml,
    renderSplitVerdictHtml: renderSplitVerdictHtml,
    renderSustainabilitySection: renderSustainabilitySection,
    renderResearchTakeaways: renderResearchTakeaways,
    renderStatusIdentity: renderStatusIdentity,
    buildRotationPack: buildRotationPack,
    buildBullpenPack: buildBullpenPack,
    renderRotationIntel: renderRotationIntel,
    renderBullpenIntel: renderBullpenIntel,
    renderRotationStatus: renderRotationStatus,
    renderBullpenStatus: renderBullpenStatus
  };
})(typeof window !== 'undefined' ? window : this);
