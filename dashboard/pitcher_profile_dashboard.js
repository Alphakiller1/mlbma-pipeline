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

  function normHomeAway(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'h' || s === 'home') return 'home';
    if (s === 'a' || s === 'away' || s === '@') return 'away';
    return s;
  }

  function filterLogByLocation(log, pickCol, loc) {
    return (log || []).filter(function(g) {
      return normHomeAway(pickCol(g, ['home_away', 'home away', 'HA'])) === loc;
    });
  }

  function findTeamProfile(teamProfiles, pickCol, team) {
    var t = String(team || '').trim().toUpperCase();
    if (!t) return null;
    return (teamProfiles || []).find(function(p) {
      return String(pickCol(p, ['team', 'Tm', 'Team']) || '').trim().toUpperCase() === t;
    }) || null;
  }

  function opponentCompetitionFromGame(g, pickCol, extras) {
    extras = extras || {};
    var tm = String(pickCol(g, ['opponent_team', 'opponent team', 'Opponent']) || '').trim().toUpperCase();
    var oor = pickNum(g, pickCol, ['opponent_OOR', 'opponent OOR']);
    if (oor == null && tm && extras.oorMap) oor = num(extras.oorMap[tm]);
    var pals = pickNum(g, pickCol, ['opponent_PALS', 'opponent PALS']);
    if (pals == null && tm) {
      var tp = findTeamProfile(extras.teamProfiles, pickCol, tm);
      if (tp) pals = num(pickCol(tp, ['pals', 'PALS']));
    }
    var wrc = pickNum(g, pickCol, ['opponent_wRC', 'opponent wRC', 'opponent_wRC+']);
    if (wrc == null && tm) {
      var tpW = findTeamProfile(extras.teamProfiles, pickCol, tm);
      if (tpW) {
        var ha = normHomeAway(pickCol(g, ['home_away', 'home away', 'HA']));
        if (ha === 'home') wrc = num(pickCol(tpW, ['home_wrc', 'home_wrc+', 'wRC+']));
        else if (ha === 'away') wrc = num(pickCol(tpW, ['away_wrc', 'away_wrc+']));
        if (wrc == null) {
          var hw = num(pickCol(tpW, ['home_wrc']));
          var aw = num(pickCol(tpW, ['away_wrc']));
          if (hw != null && aw != null) wrc = (hw + aw) / 2;
        }
      }
    }
    return { oor: oor, pals: pals, wrc: wrc };
  }

  function aggregateCompetitionFromLog(log, pickCol, extras) {
    if (!log || !log.length) return null;
    extras = extras || {};
    var rows = sortLogByDate(log, pickCol);
    var sumOor = 0, nOor = 0, sumPals = 0, nPals = 0, sumWrc = 0, nWrc = 0;
    rows.forEach(function(g) {
      var c = opponentCompetitionFromGame(g, pickCol, extras);
      if (c.oor != null) { sumOor += c.oor; nOor++; }
      if (c.pals != null) { sumPals += c.pals; nPals++; }
      if (c.wrc != null) { sumWrc += c.wrc; nWrc++; }
    });
    if (!nOor && !nPals && !nWrc) return null;
    return {
      OOR_faced: nOor ? sumOor / nOor : null,
      PALS_faced: nPals ? sumPals / nPals : null,
      wRC_faced: nWrc ? sumWrc / nWrc : null
    };
  }

  function competitionFromProfile(profile, pickCol) {
    if (!profile || !pickCol) return null;
    return {
      OOR_faced: num(pickCol(profile, ['OOR_faced', 'avg_opponent_OOR', 'OOR'])),
      PALS_faced: num(pickCol(profile, ['PALS_faced', 'PALS faced'])),
      wRC_faced: num(pickCol(profile, ['wRC_faced', 'wrc_faced', 'wRC+_faced']))
    };
  }

  function competitionExtrasFromCtx(ctx) {
    return {
      oorMap: ctx.oorMap || {},
      teamProfiles: ctx.teamProfiles || []
    };
  }

  function aggregatePitchingFromLog(log, pickCol) {
    if (!log || !log.length) return null;
    var k = 0, bb = 0, hr = 0, bf = 0, ip = 0;
    log.forEach(function(g) {
      var rowBf = num(pickCol(g, ['batters_faced', 'batters faced', 'BF']));
      var rowK = num(pickCol(g, ['K', 'k']));
      var rowBb = num(pickCol(g, ['BB', 'bb']));
      var rowHr = num(pickCol(g, ['HR', 'hr']));
      var rowIp = parseIP(pickCol(g, ['IP', 'ip']));
      if (rowBf != null && rowBf > 0) {
        bf += rowBf;
        k += rowK || 0;
        bb += rowBb || 0;
        hr += rowHr || 0;
      }
      ip += rowIp;
    });
    if (bf <= 0 && ip <= 0) return null;
    return {
      K_pct: bf > 0 ? Math.round(k / bf * 1000) / 10 : null,
      BB_pct: bf > 0 ? Math.round(bb / bf * 1000) / 10 : null,
      HR9: ip > 0 ? Math.round(hr / ip * 9 * 100) / 100 : null,
      xFIP: null,
      OPS: null
    };
  }

  function aggregateF5FromLog(log, pickCol) {
    if (!log || !log.length) return null;
    var pitch = aggregatePitchingFromLog(log, pickCol);
    var sumF5 = 0, nF5 = 0;
    log.forEach(function(g) {
      var v = num(pickCol(g, ['f5_er', 'F5_ER', 'f5 ER']));
      if (v != null) { sumF5 += v; nF5++; }
    });
    if (!pitch && nF5 === 0) return null;
    var out = pitch ? Object.assign({}, pitch) : {};
    if (nF5 > 0) out.F5_ERA = Math.round(sumF5 / nF5 * 100) / 100;
    return out;
  }

  function enrichPitchingRow(row, profile, pickCol) {
    if (!row) return row;
    if (!profile || !pickCol) return row;
    var out = Object.assign({}, row);
    function fillIfMissing(outKeys, profKeys) {
      if (num(pickCol(out, outKeys)) != null) return;
      var v = num(pickCol(profile, profKeys || outKeys));
      if (v != null) out[outKeys[0]] = v;
    }
    fillIfMissing(['xFIP', 'xfip'], ['xFIP', 'xfip']);
    fillIfMissing(['FIP', 'fip'], ['FIP', 'fip']);
    fillIfMissing(['K_pct', 'K%'], ['K_pct', 'K%']);
    fillIfMissing(['BB_pct', 'BB%'], ['BB_pct', 'BB%']);
    fillIfMissing(['HR9', 'HR/9'], ['HR9', 'HR/9']);
    fillIfMissing(['OPS', 'ops', 'OPS_against'], ['OPS', 'ops', 'OPS_against']);
    return out;
  }

  function resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, opts) {
    opts = opts || {};
    var dims = opts.dimensions || [];
    var i;
    var hit;
    if (findSplit && splits && splits.length) {
      for (i = 0; i < dims.length; i++) {
        hit = findSplit(splits, dims[i][0], dims[i][1]);
        if (hit) {
          if (opts.mode === 'competition') {
            return {
              OOR_faced: num(pickCol(hit, ['OOR_faced', 'avg_opponent_OOR', 'OOR'])),
              PALS_faced: num(pickCol(hit, ['PALS_faced', 'PALS faced'])),
              wRC_faced: num(pickCol(hit, ['wRC_faced', 'wrc_faced', 'wRC+_faced']))
            };
          }
          return enrichPitchingRow(hit, profile, pickCol);
        }
      }
    }
    if (opts.logLocation && log && log.length) {
      var sub = filterLogByLocation(log, pickCol, opts.logLocation);
      if (sub.length) {
        if (opts.mode === 'competition') {
          return aggregateCompetitionFromLog(sub, pickCol, {
            oorMap: opts.oorMap,
            teamProfiles: opts.teamProfiles
          });
        }
        if (opts.mode === 'f5') {
          var f5 = aggregateF5FromLog(sub, pickCol);
          if (f5) return enrichPitchingRow(f5, profile, pickCol);
        }
        var pitch = aggregatePitchingFromLog(sub, pickCol);
        if (pitch) return enrichPitchingRow(pitch, profile, pickCol);
      }
    }
    if (opts.useProfile) {
      if (opts.mode === 'competition') {
        var compExtras = {
          oorMap: opts.oorMap,
          teamProfiles: opts.teamProfiles
        };
        if (log && log.length) {
          var compAgg = aggregateCompetitionFromLog(log, pickCol, compExtras);
          if (compAgg && (compAgg.OOR_faced != null || compAgg.PALS_faced != null || compAgg.wRC_faced != null)) {
            return compAgg;
          }
        }
        return competitionFromProfile(profile, pickCol);
      }
      var base = enrichPitchingRow(profile, profile, pickCol);
      if (opts.mode === 'f5' && log && log.length) {
        var allF5 = aggregateF5FromLog(log, pickCol);
        if (allF5) base = Object.assign({}, base, allF5);
      }
      return base;
    }
    return null;
  }

  function sortLogByDate(log, pickCol) {
    return (log || []).slice().sort(function(a, b) {
      return String(pickCol(b, ['date', 'Date', 'game_date'])).localeCompare(
        String(pickCol(a, ['date', 'Date', 'game_date']))
      );
    });
  }

  function filterLogForAllowedSplit(log, pickCol, split) {
    var rows = sortLogByDate(log, pickCol);
    if (!split || split === 'overall' || split === 'ytd') return rows;
    if (split === 'home') return filterLogByLocation(rows, pickCol, 'home');
    if (split === 'away') return filterLogByLocation(rows, pickCol, 'away');
    if (split === 'f5') {
      return rows.filter(function(g) {
        return num(pickCol(g, ['f5_er', 'F5_ER', 'f5 ER'])) != null;
      });
    }
    // Start log has no batter-hand context per start — use sheet split rows instead.
    if (split === 'lhh' || split === 'rhh') return [];
    return rows;
  }

  function shouldUseSheetForAllowedSplit(split) {
    return split === 'lhh' || split === 'rhh';
  }

  function metricsFromLogRows(log, pickCol, maxStarts) {
    return {
      abq: avgFromLog(log, pickCol, ['opponent_ABQ', 'opponent ABQ'], maxStarts),
      rcv: avgFromLog(log, pickCol, ['opponent_RCV', 'opponent RCV'], maxStarts),
      obr: avgFromLog(log, pickCol, ['opponent_OBR', 'opponent OBR'], maxStarts),
      osi: avgFromLog(log, pickCol, ['opponent_OSI', 'opponent OSI'], maxStarts)
    };
  }

  function sheetAllowedMetrics(splits, profile, pick, findSplit, split) {
    function fromSplitRow(s) {
      if (!s) return null;
      return {
        abq: num(pick(s, ['ABQ_allowed', 'ABQ allowed'])),
        rcv: num(pick(s, ['RCV_allowed', 'RCV allowed'])),
        obr: num(pick(s, ['OBR_allowed', 'OBR allowed'])),
        osi: num(pick(s, ['OSI_allowed', 'OSI allowed']))
      };
    }
    if (split === 'lhh' && findSplit) {
      return fromSplitRow(findSplit(splits, 'batter_hand', 'LHH') || findSplit(splits, 'batter_hand', 'L'));
    }
    if (split === 'rhh' && findSplit) {
      return fromSplitRow(findSplit(splits, 'batter_hand', 'RHH') || findSplit(splits, 'batter_hand', 'R'));
    }
    if (split === 'home' && findSplit) return fromSplitRow(findSplit(splits, 'location', 'home'));
    if (split === 'away' && findSplit) return fromSplitRow(findSplit(splits, 'location', 'away'));
    if (!profile || !pick) return null;
    return {
      abq: num(pick(profile, ['ABQ_allowed', 'ABQ allowed'])),
      rcv: num(pick(profile, ['RCV_allowed', 'RCV allowed'])),
      obr: num(pick(profile, ['OBR_allowed', 'OBR allowed'])),
      osi: num(pick(profile, ['OSI_allowed', 'OSI allowed']))
    };
  }

  /** Rolling pack: [L10, L6, L3, L1] per metric from filtered start log. */
  function buildAllowedTrendPack(ctx) {
    var pick = ctx.pickCol;
    var split = ctx.split || 'overall';
    var log = shouldUseSheetForAllowedSplit(split)
      ? []
      : filterLogForAllowedSplit(ctx.log || [], pick, split);
    var pack = {
      abq: [], rcv: [], obr: [], osi: [],
      logCount: log.length,
      split: split,
      source: 'log'
    };
    [10, 6, 3, 1].forEach(function(n) {
      var m = metricsFromLogRows(log, pick, n);
      pack.abq.push(m.abq);
      pack.rcv.push(m.rcv);
      pack.obr.push(m.obr);
      pack.osi.push(m.osi);
    });
    if (log.length) return pack;

    pack.source = 'sheet';
    var sheet = sheetAllowedMetrics(ctx.splits, ctx.profile, pick, ctx.findSplit, split);
    if (!sheet) return pack;
    pack.abq = [sheet.abq, sheet.abq, sheet.abq, sheet.abq];
    pack.rcv = [sheet.rcv, sheet.rcv, sheet.rcv, sheet.rcv];
    pack.obr = [sheet.obr, sheet.obr, sheet.obr, sheet.obr];
    pack.osi = [sheet.osi, sheet.osi, sheet.osi, sheet.osi];
    return pack;
  }

  function buildPitcherAllowedTrendRow(values) {
    var C = global.MLBMACharts;
    var l10 = num(values && values[0]);
    var l6 = num(values && values[1]);
    var l3 = num(values && values[2]);
    var l1 = num(values && values[3]);
    var velocity = C && C.computeTrendVelocityFromWindows
      ? C.computeTrendVelocityFromWindows([l10, l6, l3, l1])
      : null;
    var trendDir = C && C.trendDirectionFromVelocity
      ? C.trendDirectionFromVelocity(velocity)
      : 'Stable';
    var deltaVal = l10 != null && l1 != null ? l1 - l10 : null;
    var interpretation = allowedInterpretation(deltaVal, velocity);
    var reliability = 'Noisy';
    if (C && C.trendReliabilityForRow) {
      reliability = C.trendReliabilityForRow(l10, l6, l1, trendDir);
    } else if (Math.abs(deltaVal || 0) > 8) {
      reliability = 'Short Spike';
    } else if (trendDir === 'Stable') {
      reliability = 'Stable';
    }
    return {
      l10: l10,
      l6: l6,
      l3: l3,
      l1: l1,
      delta: deltaVal,
      velocity: velocity,
      trend: trendDir,
      reliability: reliability,
      interpretation: interpretation
    };
  }

  function resolveAllowed(ctx) {
    var pack = buildAllowedTrendPack(ctx);
    var window = ctx.window || 'L10';
    var idx = { L10: 0, L6: 1, L3: 2, L1: 3 }[window];
    if (idx == null) idx = 0;
    function pickWindow(key) {
      var i = { L10: 0, L6: 1, L3: 2, L1: 3 }[key];
      if (i == null) i = 0;
      return {
        abq: pack.abq[i],
        rcv: pack.rcv[i],
        obr: pack.obr[i],
        osi: pack.osi[i]
      };
    }
    return {
      metrics: pickWindow(window),
      pack: pack,
      isF5: (ctx.split || '') === 'f5',
      logCount: pack.logCount,
      source: pack.source
    };
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

  var TEAM_ACCENT = {
    ARI: '#A71930', ATL: '#CE1141', BAL: '#DF4601', BOS: '#BD3039', CHC: '#0E3386', CHW: '#27251F',
    CIN: '#C6011F', CLE: '#E31937', COL: '#33006F', DET: '#0C2340', HOU: '#EB6E1F', KCR: '#004687',
    KC: '#004687', LAA: '#BA0021', LAD: '#005A9C', MIA: '#00A3E0', MIL: '#FFC52F', MIN: '#002B5C',
    NYM: '#002D72', NYY: '#003087', OAK: '#003831', ATH: '#003831', PHI: '#E81828', PIT: '#FDB827',
    SDP: '#2F241D', SD: '#2F241D', SEA: '#0C2C56', SFG: '#FD5A1E', SF: '#FD5A1E', STL: '#C41E3A',
    TBR: '#092C5C', TB: '#092C5C', TEX: '#003278', TOR: '#134A8E', WSN: '#AB0003', WAS: '#AB0003'
  };

  function teamAccent(team) {
    return TEAM_ACCENT[String(team || '').trim().toUpperCase()] || '#7C4DFF';
  }

  function renderSnapshot(profile, ctx) {
    var pick = ctx.pickCol;
    var name = pick(profile, ['pitcher_name', 'pitcherName', 'Name']);
    var team = pick(profile, ['pitcher_team', 'pitcherTeam', 'Tm']);
    var hand = String(pick(profile, ['pitcher_hand', 'pitcherHand', 'Hand']) || 'R').toUpperCase().slice(0, 1);
    var pid = lookupMlbId(profile, pick);
    var hs = A ? A.pitcherAvatar(pid, { crop: 'profile', className: 'tp-pitcher-banner__avatar', eager: true }) : '';
    var logo = A ? A.teamLogoImg(team, 88, 'tp-team-banner__logo-img snapshot-logo') : '';
    var watermark = A ? A.teamLogoImg(team, 220, 'tp-team-banner__watermark-img') : '';
    var accent = teamAccent(team);
    var ps = ctx.pitchScore;
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

    function heroStat(label, valueHtml, tone, ariaLabel) {
      var solo = !label;
      var aria = solo && ariaLabel ? ' aria-label="' + esc(ariaLabel) + '"' : '';
      return '<div class="tp-hero-stat tp-hero-stat--' + (tone || 'neutral') + (solo ? ' tp-hero-stat--solo' : '') + '"' + aria + '>'
        + (label ? '<span class="tp-hero-stat__label">' + esc(label) + '</span>' : '')
        + '<span class="tp-hero-stat__value">' + valueHtml + '</span>'
        + '</div>';
    }

    function heroMetricText(val, ctx, invert, dec, opts) {
      opts = opts || {};
      if (val == null || isNaN(val)) {
        return '<span class="tp-hero-stat__num tp-hero-stat__num--na">—</span>';
      }
      var d = dec == null ? 1 : dec;
      var display = opts.display != null ? String(opts.display) : fmt(val, d);
      var color = A && A.metricTextColor
        ? A.metricTextColor(val, ctx, !!invert, opts)
        : 'var(--text-1, #F3F4F6)';
      return '<span class="tp-hero-stat__num" style="color:' + color + '">' + esc(display) + '</span>';
    }

    var handVal = hand === 'L' ? 'LHP' : 'RHP';

    var statRow = '<div class="tp-team-banner__stats tp-team-banner__stats--hero pp-hero-stats tp-hero-stat-row" role="group" aria-label="Pitcher headline stats">'
      + heroStat('', '<span class="tp-hero-stat__num">' + esc(handVal) + '</span>', 'neutral', handVal)
      + heroStat('Pitch Score', heroMetricText(ps, 'pitching', false, 0), 'neutral')
      + heroStat('ERA', heroMetricText(era, 'era', true, 2), 'neutral')
      + heroStat('QS%', heroMetricText(qsPct, 'pitching', false, 0, { display: qsPct != null ? fmt(qsPct, 0) + '%' : '—' }), 'neutral')
      + '</div>';

    var notes = ctx.tonightHtml
      ? '<div class="tp-pitcher-banner__tonight">' + ctx.tonightHtml + '</div>'
      : '';

    return '<section class="tp-team-banner tp-team-banner--hero tp-pitcher-banner" style="--tp-accent:' + esc(accent) + '">'
      + '<div class="tp-team-banner__ambient" aria-hidden="true"></div>'
      + (watermark ? '<div class="tp-team-banner__watermark" aria-hidden="true">' + watermark + '</div>' : '')
      + '<div class="tp-team-banner__inner tp-pitcher-banner__inner">'
      + '<div class="tp-pitcher-banner__photo">' + hs + '</div>'
      + '<div class="tp-pitcher-banner__identity">'
      + (logo ? '<div class="tp-team-banner__logo">' + logo + '</div>' : '')
      + '<div class="tp-team-banner__copy">'
      + '<p class="ca-eyebrow tp-team-banner__eyebrow">Pitcher Profile</p>'
      + '<h1 class="tp-team-banner__title">' + esc(name) + '</h1>'
      + (ctx.isToday ? '<span class="tp-pitcher-banner__today pill pill-today">Today\'s starter</span>' : '')
      + notes
      + '</div></div>'
      + statRow
      + '</div></section>';
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

  function allowedInterpretation(delta, velocity) {
    var d = num(delta);
    var v = num(velocity);
    if (d == null || v == null) return 'Insufficient';
    if (d >= 4 && v > 0.6) return 'Schedule Harder';
    if (d <= -4 && v < -0.6) return 'Schedule Softer';
    if (Math.abs(d) <= 2 && Math.abs(v) < 0.6) return 'Stable Band';
    if (Math.abs(d) >= 5 && Math.abs(v) < 0.4) return 'Short Spike';
    return 'Mixed Signal';
  }

  function allowedDirectiveTone(interp) {
    var t = String(interp || '').toLowerCase();
    if (t.indexOf('harder') >= 0 || t.indexOf('spike') >= 0) return 'down';
    if (t.indexOf('softer') >= 0) return 'up';
    if (t.indexOf('stable') >= 0) return 'stable';
    return 'mixed';
  }

  function trendTableMetricCellAllowed(v, ctxKey) {
    return valChip(v, ctxKey, true, 1);
  }

  function trendTableDeltaCellAllowed(v) {
    if (v == null || isNaN(v)) {
      return A && A.chipPlaceholderHtml ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>';
    }
    var display = (v > 0 ? '+' : '') + Number(v).toFixed(1);
    var cls = v > 1.5 ? 'c-weak' : v < -1.5 ? 'c-elite' : 'c-mid';
    return '<span class="chip ' + cls + '">' + esc(display) + '</span>';
  }

  function trendTableVelocityCellAllowed(v) {
    if (v == null || isNaN(v)) return '<span class="chip c-na">—</span>';
    var display = (v > 0 ? '+' : '') + Number(v).toFixed(2);
    var cls = v > 0.6 ? 'c-weak' : v < -0.6 ? 'c-elite' : 'c-mid';
    return '<span class="chip ' + cls + '">' + esc(display) + '</span>';
  }

  function allowedTrendReadout(pack) {
    var keys = ['osi', 'rcv', 'abq', 'obr'];
    var labels = { osi: 'OSI allowed', rcv: 'RCV allowed', abq: 'ABQ allowed', obr: 'OBR allowed' };
    var deltas = [];
    keys.forEach(function(k) {
      var vals = pack[k] || [];
      var l10 = num(vals[0]);
      var l1 = num(vals[3]);
      if (l10 == null || l1 == null) return;
      if (Math.abs(l1 - l10) < 0.05) return;
      deltas.push({ key: k, label: labels[k], delta: l1 - l10 });
    });
    if (!deltas.length) {
      if (!pack.logCount) {
        return 'No start log rows for this pitcher — run SP game-log scrape for rolling windows.';
      }
      return 'Last 1 matches Last 10 across metrics — schedule difficulty flat over recent starts.';
    }
    deltas.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var lead = deltas[0];
    var harder = lead.delta > 0;
    var arrow = harder ? '▲' : '▼';
    var driver = deltas.length > 1
      ? '; ' + deltas[1].label + ' ' + (deltas[1].delta >= 0 ? '▲' : '▼') + ' ' + Math.abs(deltas[1].delta).toFixed(1)
      : '';
    return lead.label + ' ' + arrow + ' ' + Math.abs(lead.delta).toFixed(1) + ' (L1−L10)'
      + (harder ? ' — recent lineups tougher' : ' — recent lineups softer') + driver + '.';
  }

  function renderPitcherAllowedTrendTable(pack, ctx) {
    var metrics = [
      { k: 'osi', label: 'OSI', ctx: 'osi', desc: 'Composite offense faced' },
      { k: 'rcv', label: 'RCV', ctx: 'rcv', desc: 'Contact quality faced' },
      { k: 'abq', label: 'ABQ', ctx: 'abq', desc: 'Discipline quality faced' },
      { k: 'obr', label: 'OBR', ctx: 'obr', desc: 'On-base floor faced' }
    ];
    var rows = metrics.map(function(def) {
      return { def: def, row: buildPitcherAllowedTrendRow(pack[def.k] || []) };
    });
    var filterNote = (ctx.splitLabel || 'Overall')
      + ' · read L10→L1 left to right · lower = softer opposing offense';
    if (pack.source === 'sheet') {
      if (ctx.split === 'lhh' || ctx.split === 'rhh') {
        filterNote += ' · season split snapshot (platoon not in start log)';
      } else if (ctx.split === 'f5') {
        filterNote += ' · no F5-tagged starts in log — showing season snapshot';
      } else {
        filterNote += ' · no starts for this split — showing season snapshot';
      }
    }
    var body = rows.map(function(item) {
      var def = item.def;
      var row = item.row;
      return '<tr class="tp-trend-table__row">'
        + '<th scope="row"><span class="tp-trend-table__metric">' + esc(def.label)
        + '<span class="tp-trend-table__metric-desc">' + esc(def.desc) + '</span></span></th>'
        + '<td class="numcol">' + trendTableMetricCellAllowed(row.l10, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableMetricCellAllowed(row.l6, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableMetricCellAllowed(row.l3, def.ctx) + '</td>'
        + '<td class="numcol tp-trend-col--highlight">' + trendTableMetricCellAllowed(row.l1, def.ctx) + '</td>'
        + '<td class="numcol">' + trendTableDeltaCellAllowed(row.delta) + '</td>'
        + '<td class="numcol">' + trendTableVelocityCellAllowed(row.velocity) + '</td>'
        + '<td><span class="tp-trend-table__reliability">' + esc(row.reliability || 'Noisy') + '</span></td>'
        + '<td><span class="tp-trend-table__interp tp-trend-table__interp--' + allowedDirectiveTone(row.interpretation) + '">'
        + esc(row.interpretation || 'Insufficient') + '</span></td>'
        + '</tr>';
    }).join('');
    return '<div class="tp-trend-table-wrap">'
      + '<p class="tp-trend-table-note">' + esc(filterNote) + ' · L1 is a momentum flag, not a standalone predictor.</p>'
      + '<table class="tp-trend-table" aria-label="Opposing offense allowed rolling trends">'
      + '<thead><tr>'
      + '<th scope="col">Metric</th>'
      + '<th scope="col">L10</th><th scope="col">L6</th><th scope="col">L3</th>'
      + '<th scope="col" class="tp-trend-col--highlight">L1</th>'
      + '<th scope="col">Δ L1−L10</th><th scope="col">Velocity</th>'
      + '<th scope="col">Reliability</th><th scope="col">Interpretation</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function renderAllowedDashboard(profile, ctx) {
    var C = global.MLBMACharts;
    var pack = buildAllowedTrendPack(ctx);
    var f5 = (ctx.split || '') === 'f5' ? (A ? A.f5WarningHtml() : '') : '';

    var chart = '';
    if (C && C.buildTrendLineChart) {
      var vals = pack.osi || [];
      chart = C.buildTrendLineChart('OSI allowed', vals, 480, 120, {
        labels: ['L10', 'L6', 'L3', 'L1'],
        metricCtx: 'osi',
        invertTrend: true
      });
    }

    var readout = allowedTrendReadout(pack);
    var splitKey = ctx.split || 'overall';
    return '<div class="pp-allowed-trend tp-trend-panel" data-allowed-source="' + esc(pack.source) + '" data-allowed-split="' + esc(splitKey) + '">'
      + f5
      + renderPitcherAllowedTrendTable(pack, ctx)
      + '<div class="tp-trend-chart-mount" data-active-metric="osi">' + chart + '</div>'
      + (readout ? '<p class="tp-trend-readout">' + esc(readout) + '</p>' : '')
      + '</div>';
  }

  function resolvePitchingValueRow(viewSplit, profile, splits, log, pickCol, findSplit) {
    var s;
    if (viewSplit === 'home') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, {
        dimensions: [['location', 'home'], ['home_away', 'home']],
        logLocation: 'home'
      });
    } else if (viewSplit === 'away') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, {
        dimensions: [['location', 'away'], ['home_away', 'away']],
        logLocation: 'away'
      });
    } else if (viewSplit === 'lhh') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, {
        dimensions: [['batter_hand', 'LHH'], ['batter_hand', 'L'], ['vs_lhh', 'LHH'], ['vs_lhh', 'vs LHH']]
      });
    } else if (viewSplit === 'rhh') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, {
        dimensions: [['batter_hand', 'RHH'], ['batter_hand', 'R'], ['vs_rhh', 'RHH'], ['vs_rhh', 'vs RHH']]
      });
    } else {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, { useProfile: true });
    }
    return enrichPitchingRow(s, profile, pickCol);
  }

  function buildPitchingValueTableHtml(profile, splits, log, pickCol, findSplit, viewSplit) {
    viewSplit = viewSplit || 'overall';
    var splitLabels = {
      overall: 'Both', home: 'Home', away: 'Away', lhh: 'vs LHB', rhh: 'vs RHB'
    };
    var s = resolvePitchingValueRow(viewSplit, profile, splits, log, pickCol, findSplit);
    function cell(v, ctx, invert, dec) {
      if (v == null || isNaN(v)) return '<td class="pp-pv-metric-cell tp-empty-cell">—</td>';
      return '<td class="pp-pv-metric-cell">' + valChip(v, ctx, invert, dec) + '</td>';
    }
    var rk = pctNorm(num(pickCol(s, ['K_pct', 'K%'])));
    var rbb = pctNorm(num(pickCol(s, ['BB_pct', 'BB%'])));
    var rhr9 = num(pickCol(s, ['HR9', 'HR/9']));
    var rxfip = num(pickCol(s, ['xFIP', 'xfip']));
    var rops = num(pickCol(s, ['OPS', 'ops', 'OPS_against', 'OPP', 'Opp OPS']));
    return '<table class="hub-table tp-table pp-pitching-value-metrics-table" aria-label="Pitching value metrics">'
      + '<thead><tr><th>K%</th><th>BB%</th><th>HR/9</th><th>xFIP</th><th>OPS</th></tr></thead>'
      + '<tbody><tr>'
      + cell(rk, 'kpct', false, 1) + cell(rbb, 'bbpct', true, 1) + cell(rhr9, 'hr9', true, 2)
      + cell(rxfip, 'xfip', true, 2) + cell(rops, 'ops', true, 3)
      + '</tr></tbody></table>'
      + '<p class="tp-trend-table-note pp-pv-split-note">Showing <strong>' + esc(splitLabels[viewSplit] || viewSplit) + '</strong>'
      + ' · lower OPS / xFIP = stronger pitching value for this split</p>';
  }

  function enrichF5Row(row, profile, pickCol) {
    if (!row) row = {};
    row = enrichPitchingRow(row, profile, pickCol);
    if (num(pickCol(row, ['F5_ERA', 'F5 ERA', 'ER/5'])) == null && profile) {
      var f5 = num(pickCol(profile, ['F5_ERA', 'F5 ERA', 'ER/5']));
      if (f5 != null) row.F5_ERA = f5;
    }
    return row;
  }

  function resolveF5Row(viewSplit, profile, splits, log, pickCol, findSplit) {
    var base = { mode: 'f5' };
    var s;
    if (viewSplit === 'home') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['location', 'home'], ['home_away', 'home']],
        logLocation: 'home'
      }, base));
    } else if (viewSplit === 'away') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['location', 'away'], ['home_away', 'away']],
        logLocation: 'away'
      }, base));
    } else if (viewSplit === 'lhh') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['batter_hand', 'LHH'], ['batter_hand', 'L'], ['vs_lhh', 'LHH'], ['vs_lhh', 'vs LHH']]
      }, base));
    } else if (viewSplit === 'rhh') {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['batter_hand', 'RHH'], ['batter_hand', 'R'], ['vs_rhh', 'RHH'], ['vs_rhh', 'vs RHH']]
      }, base));
    } else {
      s = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({ useProfile: true }, base));
    }
    return enrichF5Row(s, profile, pickCol);
  }

  function buildF5TableHtml(profile, splits, log, pickCol, findSplit, viewSplit) {
    viewSplit = viewSplit || 'overall';
    var splitLabels = {
      overall: 'Both', home: 'Home', away: 'Away', lhh: 'vs LHB', rhh: 'vs RHB'
    };
    var s = resolveF5Row(viewSplit, profile, splits, log, pickCol, findSplit);
    var xfip = num(pickCol(s, ['xFIP', 'xfip']));
    var k = pctNorm(num(pickCol(s, ['K_pct', 'K%'])));
    var bb = pctNorm(num(pickCol(s, ['BB_pct', 'BB%'])));
    var f5er = num(pickCol(s, ['F5_ERA', 'F5 ERA', 'ER/5', 'er5']));
    function cell(v, ctx, invert, dec) {
      if (v == null || isNaN(v)) return '<td class="pp-f5-metric-cell tp-empty-cell">—</td>';
      return '<td class="pp-f5-metric-cell">' + valChip(v, ctx, invert, dec) + '</td>';
    }
    return '<table class="hub-table tp-table pp-f5-metrics-table" aria-label="F5 profile metrics">'
      + '<thead><tr><th>xFIP</th><th>K%</th><th>BB%</th><th>ER/5</th></tr></thead>'
      + '<tbody><tr>'
      + cell(xfip, 'xfip', true, 2) + cell(k, 'kpct', false, 1) + cell(bb, 'bbpct', true, 1) + cell(f5er, 'era', true, 2)
      + '</tr></tbody></table>'
      + '<p class="tp-trend-table-note pp-f5-split-note">Showing <strong>' + esc(splitLabels[viewSplit] || viewSplit) + '</strong>'
      + ' · ER/5 = earned runs per five innings (first-five)</p>';
  }

  function resolveCompetitionRow(viewSplit, profile, splits, log, pickCol, findSplit, ctx) {
    var extras = competitionExtrasFromCtx(ctx);
    var baseOpts = {
      mode: 'competition',
      oorMap: extras.oorMap,
      teamProfiles: extras.teamProfiles
    };
    if (viewSplit === 'home') {
      return resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['location', 'home'], ['home_away', 'home']],
        logLocation: 'home'
      }, baseOpts));
    }
    if (viewSplit === 'away') {
      return resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['location', 'away'], ['home_away', 'away']],
        logLocation: 'away'
      }, baseOpts));
    }
    if (viewSplit === 'lhh') {
      return resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['batter_hand', 'LHH'], ['batter_hand', 'L'], ['vs_lhh', 'LHH'], ['vs_lhh', 'vs LHH']]
      }, baseOpts));
    }
    if (viewSplit === 'rhh') {
      return resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
        dimensions: [['batter_hand', 'RHH'], ['batter_hand', 'R'], ['vs_rhh', 'RHH'], ['vs_rhh', 'vs RHH']]
      }, baseOpts));
    }
    var row = resolvePitcherSplitRow(splits, log, profile, pickCol, findSplit, Object.assign({
      useProfile: true
    }, baseOpts));
    if (row) return row;
    return competitionFromProfile(profile, pickCol);
  }

  function buildOORMetricsTableHtml(profile, splits, log, pickCol, findSplit, viewSplit, ctx) {
    viewSplit = viewSplit || 'overall';
    var splitLabels = {
      overall: 'Both', home: 'Home', away: 'Away', lhh: 'vs LHB', rhh: 'vs RHB'
    };
    var s = resolveCompetitionRow(viewSplit, profile, splits, log, pickCol, findSplit, ctx);
    var oor = s ? num(pickCol(s, ['OOR_faced', 'avg_opponent_OOR', 'OOR'])) : null;
    var pals = s ? num(pickCol(s, ['PALS_faced', 'PALS faced'])) : null;
    var wrc = s ? num(pickCol(s, ['wRC_faced', 'wrc_faced', 'wRC+_faced'])) : null;
    function cell(v, metricCtx, dec) {
      if (v == null || isNaN(v)) return '<td class="pp-oor-metric-cell tp-empty-cell">—</td>';
      return '<td class="pp-oor-metric-cell">' + valChip(v, metricCtx, false, dec) + '</td>';
    }
    return '<table class="hub-table tp-table pp-oor-metrics-table" aria-label="Strength of competition metrics">'
      + '<thead><tr><th>OOR</th><th>PALS Faced</th><th>wRC+ Faced</th></tr></thead>'
      + '<tbody><tr>'
      + cell(oor, 'oor', 1) + cell(pals, 'pals', 1) + cell(wrc, 'wrc', 0)
      + '</tr></tbody></table>'
      + '<p class="tp-trend-table-note pp-oor-split-note">Showing <strong>' + esc(splitLabels[viewSplit] || viewSplit) + '</strong>'
      + ' · higher = tougher schedule (contextualizes ERA)</p>';
  }

  function renderOORPanel(profile, ctx) {
    var pick = ctx.pickCol;
    var find = ctx.findSplit;
    var splits = ctx.splits || [];
    var log = ctx.log || [];
    var viewSplit = ctx.splitFocus || 'overall';

    return '<div class="tp-trend-table-wrap pp-oor-metrics-wrap" data-split-focus="' + esc(viewSplit) + '">'
      + buildOORMetricsTableHtml(profile, splits, log, pick, find, viewSplit, ctx)
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
    var find = ctx.findSplit;
    var splits = ctx.splits || [];
    var log = ctx.log || [];
    var viewSplit = ctx.splitFocus || 'overall';
    var metricsHtml = '<div class="pp-intel-panel__metrics">'
      + buildPitchingValueTableHtml(profile, splits, log, pick, find, viewSplit)
      + '</div>';

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
    resolveAllowed: resolveAllowed,
    buildPitchingValueTableHtml: buildPitchingValueTableHtml,
    buildF5TableHtml: buildF5TableHtml,
    buildOORMetricsTableHtml: buildOORMetricsTableHtml,
    resolvePitcherSplitRow: resolvePitcherSplitRow
  };
})(typeof window !== 'undefined' ? window : this);
