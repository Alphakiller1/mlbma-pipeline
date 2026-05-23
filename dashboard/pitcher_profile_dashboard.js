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

  function allowedColor(val) {
    if (val === null || isNaN(val)) return 'var(--text-3)';
    if (val <= 52) return 'var(--green)';
    if (val <= 62) return 'var(--gold)';
    return 'var(--red-l)';
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
    var fipVal = num(pick(profile, ['FIP', 'fip']));
    var eraVal = num(pick(profile, ['ERA']));
    var fipLabel = fipVal != null ? fmt(fipVal, 2) : (eraVal != null ? fmt(eraVal, 2) + ' (ERA)' : 'FIP N/A');

    return '<div class="pitcher-snapshot">'
      + '<div class="ps-photo">' + hs + '</div>'
      + '<div class="ps-main">'
      + '<div class="ps-name-row">' + logo + '<h1 class="ps-name">' + esc(name) + '</h1></div>'
      + '<div class="ps-badges">'
      + '<span class="pill ' + (hand === 'L' ? 'hand-pill-l' : 'hand-pill-r') + '">' + (hand === 'L' ? 'LHP' : 'RHP') + '</span>'
      + '<span class="pill" style="background:var(--bg-4);border:1px solid var(--border);">' + esc(team) + ' · SP</span>'
      + (ctx.isToday ? '<span class="pill pill-today">Today\'s Starter</span>' : '')
      + '<span class="tier-pill ' + pt.cls + '">' + esc(pt.label) + '</span>'
      + (stale ? '<span class="pill" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(251,191,36,.35);">Stale L14</span>' : '')
      + '</div>'
      + '<div class="ps-stat-bar">'
      + statPill('Pitch Score', fmt(ps, 0))
      + statPill('K%', fmt(num(pick(profile, ['K_pct', 'K%'])), 1) + (num(pick(profile, ['K_pct'])) != null ? '%' : ''))
      + statPill('BB%', fmt(num(pick(profile, ['BB_pct', 'BB%'])), 1) + (num(pick(profile, ['BB_pct'])) != null ? '%' : ''))
      + statPill('FIP', fipLabel)
      + statPill('xFIP', '—')
      + statPill('ERA', fmt(num(pick(profile, ['ERA'])), 2))
      + '</div>'
      + (staleWarn ? '<p class="ps-stale-note">' + esc(staleWarn) + '</p>' : '')
      + (ctx.tonightHtml ? '<div class="ps-tonight">' + ctx.tonightHtml + '</div>' : '')
      + '</div></div>';
  }

  function statPill(label, val) {
    return '<div class="ps-stat"><span class="ps-stat-label">' + esc(label) + '</span><span class="ps-stat-val">' + esc(val) + '</span></div>';
  }

  function renderAllowedDashboard(profile, ctx) {
    var resolved = resolveAllowed(ctx);
    var m = resolved.metrics;
    var l14 = resolved.l14;
    var all = ctx.allProfiles || [];
    var pick = ctx.pickCol;
    var name = pick(profile, ['pitcher_name']);

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

    return '<div class="allowed-header"><h2 class="section-title">' + title + '</h2>'
      + '<p class="section-subtitle">Lower allowed scores = softer opposing offense · ' + esc(ctx.splitLabel) + ' · ' + esc(ctx.window) + '</p></div>'
      + f5
      + '<div class="metric-grid allowed-grid">' + cards.map(function(c) {
        var col = allowedColor(c.val);
        var p = pct(c.key, c.val);
        return '<div class="metric-card allowed-card">'
          + '<div class="m-label">' + esc(c.label) + '</div>'
          + '<div class="m-val" style="color:' + col + '">' + fmt(c.val, 1) + '</div>'
          + (p != null ? '<div class="m-pctile">Softer than ' + p + '% of SPs</div>' : '')
          + '<div class="m-compare"><span>YTD ' + fmt(num(pick(profile, [c.key])), 1) + '</span>'
          + '<span>L14 ' + fmt(c.l14, 1) + '</span></div>'
          + '<div class="m-note">' + esc(c.note) + '</div></div>';
      }).join('') + '</div>';
  }

  function renderOORPanel(profile, ctx) {
    var pick = ctx.pickCol;
    var log = ctx.log || [];
    var oorMap = ctx.oorMap || {};
    var window = ctx.window || 'YTD';
    var maxStarts = window === 'L14' ? 4 : window === 'L30' ? 8 : null;

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
    if (trend.length >= 3) {
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
      + '<div class="oor-splits"><table class="ma-split-table"><tbody>'
      + splitRows.map(function(r) {
        return '<tr><td>' + esc(r[0]) + '</td><td style="font-family:var(--mono);color:' + allowedColor(r[1]) + '">' + fmt(r[1], 1) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      + trendHtml
      + '</div>';
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
    resolveAllowed: resolveAllowed
  };
})(typeof window !== 'undefined' ? window : this);
