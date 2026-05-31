/**
 * MLBMA Charts — sparklines and radar (pure SVG, no dependencies).
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function sparkColor(values) {
    var pts = (values || []).filter(function(v) { return v != null && !isNaN(v); });
    if (pts.length < 2) return '#71717A';
    var first = pts[0];
    var last = pts[pts.length - 1];
    if (Math.abs(last - first) <= 2) return '#71717A';
    return last > first ? '#4ADE80' : '#F87171';
  }

  /**
   * @param {Array<number|null>} values - e.g. [ytd, l30, l14, l7]
   * @param {number} width
   * @param {number} height
   * @param {object} opts - { title, labels }
   */
  function buildSparkline(values, width, height, opts) {
    opts = opts || {};
    width = width || 80;
    height = height || 28;
    var pts = (values || []).map(num).filter(function(v) { return v != null; });
    var pad = 2;
    var w = width - pad * 2;
    var h = height - pad * 2;
    var color = sparkColor(values);
    var labelStr = (opts.labels || ['YTD', 'L30', 'L14', 'L7']).map(function(l, i) {
      var v = values[i];
      return l + ': ' + (v != null && !isNaN(v) ? Number(v).toFixed(1) : '—');
    }).join(' · ');
    if (!pts.length) {
      return '<svg class="mlbma-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">'
        + '<line x1="' + pad + '" y1="' + (height / 2) + '" x2="' + (width - pad) + '" y2="' + (height / 2) + '" stroke="#3f3f46" stroke-width="1"/></svg>';
    }
    var min = Math.min.apply(null, pts);
    var max = Math.max.apply(null, pts);
    var range = max - min || 1;
    var coords = [];
    var raw = values || [];
    var xi = 0;
    var denom = Math.max(1, raw.length - 1);
    for (var i = 0; i < raw.length; i++) {
      var v = num(raw[i]);
      if (v == null) continue;
      var x = pad + (xi / denom) * w;
      var y = pad + h - ((v - min) / range) * h;
      coords.push({ x: x, y: y });
      xi++;
    }
    if (coords.length < 2) {
      var c = coords[0] || { x: width / 2, y: height / 2 };
      return '<svg class="mlbma-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img">'
        + '<title>' + esc(labelStr) + '</title>'
        + '<circle cx="' + c.x + '" cy="' + c.y + '" r="2" fill="' + color + '"/></svg>';
    }
    var d = 'M' + coords.map(function(c) { return c.x.toFixed(1) + ',' + c.y.toFixed(1); }).join(' L');
    var circles = coords.map(function(c) {
      return '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="1.5" fill="' + color + '"/>';
    }).join('');
    return '<svg class="mlbma-sparkline" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" role="img">'
      + '<title>' + esc(labelStr) + '</title>'
      + '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
      + circles + '</svg>';
  }

  function polar(cx, cy, r, angle) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  /**
   * @param {string} containerId - element id or pass element via opts.el
   * @param {Array<{abbr, values}>} teams
   * @param {Array<string>} metrics - axis labels
   * @param {Array<string>} colors - hex per team
   * @param {object} opts - { size, el }
   */
  function buildRadarChart(containerId, teams, metrics, colors, opts) {
    opts = opts || {};
    var size = opts.size || 320;
    var el = opts.el || document.getElementById(containerId);
    if (!el) return null;
    var n = metrics.length;
    if (!n || !teams.length) {
      el.innerHTML = '<p class="ca-helper">Not enough data for radar chart.</p>';
      return null;
    }
    var cx = size / 2;
    var cy = size / 2;
    var maxR = size * 0.36;
    var start = -Math.PI / 2;
    var rings = [20, 40, 60, 80, 100];
    var svg = '<svg class="mlbma-radar" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
    rings.forEach(function(pct) {
      var r = (pct / 100) * maxR;
      var pts = [];
      for (var i = 0; i < n; i++) {
        var ang = start + (i / n) * Math.PI * 2;
        var p = polar(cx, cy, r, ang);
        pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
      }
      svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
    });
    for (var ai = 0; ai < n; ai++) {
      var ang = start + (ai / n) * Math.PI * 2;
      var p = polar(cx, cy, maxR, ang);
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" stroke="rgba(255,255,255,0.12)"/>';
      var lx = polar(cx, cy, maxR + 16, ang);
      svg += '<text x="' + lx.x.toFixed(1) + '" y="' + (lx.y + 4).toFixed(1) + '" text-anchor="middle" fill="#A1A1AA" font-size="10" font-weight="600">' + esc(metrics[ai]) + '</text>';
    }
    teams.forEach(function(team, ti) {
      var col = colors[ti] || '#7C4DFF';
      var vals = (team.values || []).map(function(v) {
        var x = num(v);
        return x == null ? 50 : Math.max(0, Math.min(100, x));
      });
      while (vals.length < n) vals.push(50);
      var poly = [];
      for (var j = 0; j < n; j++) {
        var ang2 = start + (j / n) * Math.PI * 2;
        var rr = (vals[j] / 100) * maxR;
        var pt = polar(cx, cy, rr, ang2);
        poly.push(pt.x.toFixed(1) + ',' + pt.y.toFixed(1));
      }
      svg += '<polygon class="mlbma-radar-fill" points="' + poly.join(' ') + '" fill="' + col + '" fill-opacity="0.15" stroke="' + col + '" stroke-width="2"/>';
      for (var k = 0; k < n; k++) {
        var ang3 = start + (k / n) * Math.PI * 2;
        var rr2 = (vals[k] / 100) * maxR;
        var dot = polar(cx, cy, rr2, ang3);
        svg += '<circle cx="' + dot.x.toFixed(1) + '" cy="' + dot.y.toFixed(1) + '" r="4" fill="' + col + '"/>';
      }
    });
    svg += '</svg>';
    var legend = '<div class="mlbma-radar-legend">';
    teams.forEach(function(team, ti) {
      var col = colors[ti] || '#7C4DFF';
      legend += '<span class="mlbma-radar-legend-item"><i style="background:' + col + '"></i>' + esc(team.abbr || team.name || 'Team') + '</span>';
    });
    legend += '</div>';
    el.innerHTML = '<div class="mlbma-radar-wrap">' + svg + legend + '</div>';
    var poly = el.querySelector('.mlbma-radar-fill');
    if (poly && poly.getTotalLength) {
      var len = poly.getTotalLength();
      poly.style.strokeDasharray = len;
      poly.style.strokeDashoffset = len;
      poly.style.transition = 'stroke-dashoffset 400ms ease';
      requestAnimationFrame(function() { poly.style.strokeDashoffset = '0'; });
    }
    return el;
  }

  function teamOsiTrend(team) {
    if (!team || typeof SCO_YTD_B === 'undefined') return [null, null, null, null];
    var row = SCO_YTD_B.find(function(d) { return d.t === team; });
    if (!row) return [null, null, null, null];
    return [row.ytdOSI != null ? row.ytdOSI : row.osi, row.l30OSI, row.l14OSI, row.l7OSI];
  }

  /**
   * Mini quadrant scatter (200×200) — highlights one team vs league.
   */
  function buildMiniQuadrant(containerId, rows, highlightTeam, opts) {
    opts = opts || {};
    var el = opts.el || document.getElementById(containerId);
    if (!el || !rows || !rows.length) return null;
    var size = opts.size || 200;
    var pad = 28;
    var W = size;
    var H = size;
    var cw = W - pad * 2;
    var ch = H - pad * 2;
    var xMn = 35, xMx = 75, yMn = -12, yMx = 12;
    var xRng = xMx - xMn;
    var yRng = yMx - yMn;
    function xs(v) { return pad + ((v - xMn) / xRng) * cw; }
    function ys(v) { return pad + (1 - (v - yMn) / yRng) * ch; }
    var mx = xs(55);
    var my = ys(0);
    var svg = '<svg class="mlbma-mini-quad" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    svg += '<rect x="' + mx + '" y="' + pad + '" width="' + (W - pad - mx) + '" height="' + (my - pad) + '" fill="rgba(74,222,128,.08)"/>';
    svg += '<rect x="' + pad + '" y="' + my + '" width="' + (mx - pad) + '" height="' + (H - pad - my) + '" fill="rgba(248,113,113,.08)"/>';
    svg += '<line x1="' + mx + '" y1="' + pad + '" x2="' + mx + '" y2="' + (H - pad) + '" stroke="rgba(192,132,252,.25)" stroke-dasharray="3,3"/>';
    svg += '<line x1="' + pad + '" y1="' + my + '" x2="' + (W - pad) + '" y2="' + my + '" stroke="rgba(192,132,252,.25)" stroke-dasharray="3,3"/>';
    rows.forEach(function(d) {
      if (d.osi == null || d.ppGap == null) return;
      var cx = xs(d.osi);
      var cy = ys(d.ppGap);
      var hi = d.t === highlightTeam;
      var r = hi ? 9 : 5;
      var col = hi ? '#7C4DFF' : 'rgba(161,161,170,.55)';
      svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r + '" fill="' + col + '" stroke="' + (hi ? '#fff' : 'none') + '" stroke-width="1.5"/>';
      if (hi) svg += '<text x="' + cx.toFixed(1) + '" y="' + (cy - 12).toFixed(1) + '" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">' + esc(d.t) + '</text>';
    });
    svg += '</svg>';
    el.innerHTML = '<div class="mlbma-mini-quad-wrap">' + svg + '<div class="mlbma-mini-quad-caption">OSI × PP-Gap · league position</div></div>';
    return el;
  }

  function teamRadarValues(row) {
    if (!row) return [50, 50, 50, 50, 50, 50];
    var sus = row.sus != null ? Math.min(100, Math.max(0, row.sus)) : 50;
    var edge = row.splitEdge != null ? Math.min(100, Math.max(0, 50 + row.splitEdge * 2)) : 50;
    return [
      norm100(row.abq, false),
      norm100(row.rcv, false),
      norm100(row.obr, false),
      norm100(row.projOSI != null ? row.projOSI : row.osi, false),
      norm100(sus, false),
      norm100(edge, false)
    ];
  }

  function norm100(v, invert) {
    if (v == null || isNaN(v)) return 50;
    var n = Math.max(0, Math.min(100, Number(v)));
    return invert ? 100 - n : n;
  }

  /**
   * Snapshot mini radar — team vs league midpoint, dot legend, no axis labels.
   */
  function buildSnapshotRadar(containerId, teamValues, metricNames, opts) {
    opts = opts || {};
    var size = opts.size || 160;
    var el = opts.el || document.getElementById(containerId);
    if (!el) return null;
    var n = metricNames.length;
    var cx = size / 2;
    var cy = size / 2;
    var maxR = size * 0.34;
    var start = -Math.PI / 2;
    var teamCol = opts.teamColor || '#7C4DFF';
    var refVals = metricNames.map(function() { return 50; });
    var svg = '<svg class="mlbma-radar mlbma-snapshot-radar" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';

    [20, 40, 60, 80, 100].forEach(function(pct) {
      var r = (pct / 100) * maxR;
      var pts = [];
      for (var i = 0; i < n; i++) {
        var ang = start + (i / n) * Math.PI * 2;
        var p = polar(cx, cy, r, ang);
        pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
      }
      svg += '<polygon points="' + pts.join(' ') + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    });

    var refPoly = [];
    for (var ri = 0; ri < n; ri++) {
      var angR = start + (ri / n) * Math.PI * 2;
      var rr = (refVals[ri] / 100) * maxR;
      var ptR = polar(cx, cy, rr, angR);
      refPoly.push(ptR.x.toFixed(1) + ',' + ptR.y.toFixed(1));
    }
    svg += '<polygon points="' + refPoly.join(' ') + '" fill="none" stroke="#71717A" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.85"/>';

    var vals = (teamValues || []).map(function(v) {
      var x = num(v);
      return x == null ? 50 : Math.max(0, Math.min(100, x));
    });
    while (vals.length < n) vals.push(50);
    var poly = [];
    for (var j = 0; j < n; j++) {
      var ang2 = start + (j / n) * Math.PI * 2;
      var rr2 = (vals[j] / 100) * maxR;
      var dot = polar(cx, cy, rr2, ang2);
      poly.push(dot.x.toFixed(1) + ',' + dot.y.toFixed(1));
    }
    svg += '<polygon points="' + poly.join(' ') + '" fill="' + teamCol + '" fill-opacity="0.2" stroke="' + teamCol + '" stroke-width="2"/>';
    svg += '</svg>';

    var legend = '<div class="mlbma-snapshot-radar-legend">';
    metricNames.forEach(function(name, i) {
      legend += '<span class="mlbma-sr-leg-item"><i style="background:' + teamCol + '"></i>' + esc(name) + '</span>';
    });
    legend += '<span class="mlbma-sr-leg-item mlbma-sr-leg-ref"><i style="background:transparent;border:1px dashed #71717A"></i>League avg</span>';
    legend += '</div>';

    el.innerHTML = '<div class="mlbma-snapshot-radar-wrap">' + svg + legend + '</div>';
    return el;
  }

  function liveDataReady() {
    return global.LIVE_DATA && global.LIVE_DATA.scYtdR && global.LIVE_DATA.scYtdR.length >= 28;
  }

  function renderOnLiveDataReady(fn, label) {
    if (!fn) return;
    if (liveDataReady()) {
      fn();
      return;
    }
    if (!global._mlbmaLiveDataQueue) global._mlbmaLiveDataQueue = [];
    var queued = global._mlbmaLiveDataQueue.indexOf(fn) >= 0;
    if (!queued) global._mlbmaLiveDataQueue.push(fn);
  }

  function flushLiveDataReadyQueue() {
    if (!liveDataReady() || !global._mlbmaLiveDataQueue || !global._mlbmaLiveDataQueue.length) return;
    var q = global._mlbmaLiveDataQueue.slice();
    global._mlbmaLiveDataQueue = [];
    q.forEach(function(fn) {
      try { if (fn) fn(); } catch (e) { console.error('[MLBMACharts] live data queue fn error', e); }
    });
  }

  function renderOnDataReady(checkFn, renderFn, opts) {
    opts = opts || {};
    var interval = opts.interval || 300;
    var maxTries = opts.maxTries || 120;
    var tries = 0;
    function tick() {
      tries += 1;
      try {
        if (checkFn && checkFn()) {
          if (renderFn) renderFn();
          return;
        }
      } catch (e) {
        console.warn('[MLBMACharts] renderOnDataReady check error', e);
      }
      if (tries < maxTries) setTimeout(tick, interval);
      else if (opts.onTimeout) opts.onTimeout();
    }
    tick();
  }

  function quadYValue(d) {
    if (!d) return null;
    if (d.reg_signal != null && !isNaN(d.reg_signal)) return Number(d.reg_signal) * 450;
    if (d.reg != null && !isNaN(d.reg)) return Number(d.reg) * 450;
    if (d.ppGap != null && !isNaN(d.ppGap)) return Number(d.ppGap);
    return null;
  }

  function marketQuadrantMeta(rcv, yVal) {
    var hiRcv = (rcv || 0) >= 50;
    var posY = (yVal || 0) > 0;
    if (hiRcv && posY) return { color: '#4ADE80', label: 'Elite & Undervalued' };
    if (!hiRcv && posY) return { color: '#2DD4BF', label: 'Buy-Low Offense' };
    if (hiRcv && !posY) return { color: '#FBBF24', label: 'Strong But Cooling' };
    return { color: '#F87171', label: 'Weak & Concerning' };
  }

  function teamEspnLogoUrl(t) {
    var map = { ARI: 'ari', AZ: 'ari', ATH: 'ath', OAK: 'ath', SF: 'sf', SFG: 'sf', TB: 'tb', TBR: 'tb', WSH: 'wsh', WAS: 'wsh', WSN: 'wsh', CHW: 'chw', CWS: 'chw', KCR: 'kc', KC: 'kc', SDP: 'sd', SD: 'sd' };
    var key = String(t || '').trim().toUpperCase();
    var slug = map[key] || key.toLowerCase();
    return 'https://a.espncdn.com/i/teamlogos/mlb/500/' + slug + '.png';
  }

  function quadrantBubbleMarkup(d, cx, cy, meta) {
    var logoUrl = teamEspnLogoUrl(d.t);
    var gid = 'qb_' + String(d.t).replace(/[^a-z0-9]/gi, '');
    return '<g class="mlbma-quad-dot" data-team="' + esc(d.t) + '" tabindex="0" role="button" aria-label="' + esc(d.t) + '">'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="28" fill="' + meta.color + '" fill-opacity=".18"/>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="28" fill="' + meta.color + '" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>'
      + '<clipPath id="' + gid + '"><circle cx="' + cx + '" cy="' + cy + '" r="22"/></clipPath>'
      + '<image class="mlbma-quad-logo" href="' + esc(logoUrl) + '" x="' + (cx - 11) + '" y="' + (cy - 11) + '" width="22" height="22" clip-path="url(#' + gid + ')" preserveAspectRatio="xMidYMid slice" data-team="' + esc(d.t) + '"/>'
      + '<text class="mlbma-quad-abbr" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="9" font-weight="700" font-family="var(--mono)" pointer-events="none" style="display:none">' + esc(d.t) + '</text>'
      + '<title>' + esc(d.t) + ' · RCV ' + d.rcv.toFixed(1) + ' · Gap ' + quadYValue(d).toFixed(1) + ' · OSI ' + (d.osi != null ? d.osi.toFixed(1) : '—') + ' · ' + meta.label + '</title>'
      + '</g>';
  }

  function resolveQuadrantTipRow(d) {
    if (!d) return d;
    var master = null;
    if (typeof global.SCO_YTD_B !== 'undefined' && global.SCO_YTD_B.length) {
      master = global.SCO_YTD_B.find(function(r) { return r.t === d.t; });
    } else if (global.LIVE_DATA && global.LIVE_DATA.scYtdB) {
      master = (global.LIVE_DATA.scYtdB || []).find(function(r) { return r.t === d.t; });
    }
    if (!master) return d;
    return Object.assign({}, master, d);
  }

  function metricColor(v, ctx, invert) {
    var A = global.MLBMAAssets;
    if (A && A.metricColor) return A.metricColor(v, ctx || 'osi', !!invert);
    if (typeof global.tcol === 'function') return global.tcol(v, ctx, invert);
    return '#E4E4E7';
  }

  function trendColor(trend) {
    var A = global.MLBMAAssets;
    if (A && A.trendColor) return A.trendColor(trend);
    if (typeof global.trendCol === 'function') return global.trendCol(trend);
    return '#71717A';
  }

  function fmtMetric(v, decimals) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(decimals == null ? 1 : decimals);
  }

  function fmtSigned(v, decimals) {
    if (v == null || isNaN(v)) return '—';
    var n = Number(v);
    return (n > 0 ? '+' : '') + n.toFixed(decimals == null ? 1 : decimals);
  }

  function ttRow(label, valHtml) {
    return '<div class="tt-row"><span class="lab">' + esc(label) + '</span><span class="val">' + valHtml + '</span></div>';
  }

  function buildMarketQuadrantTipHtml(d) {
    d = resolveQuadrantTipRow(d);
    if (!d) return '';

    var osi = num(d.osi);
    var proj = num(d.projOSI != null ? d.projOSI : d.osi);
    var form = num(d.currentFormOSI);
    var projDelta = (proj != null && osi != null) ? proj - osi : null;

    var pp = num(d.ppGap != null ? d.ppGap : (d.abq != null && d.rcv != null ? d.abq - d.rcv : null));
    var df = num(d.dfGap != null ? d.dfGap : (d.rcv != null && d.obr != null ? d.rcv - d.obr : null));
    var edge = num(d.splitEdge);

    var susVal = num(d.sus);
    var sus = (typeof global.susGrade === 'function' && susVal != null)
      ? global.susGrade(susVal)
      : { l: '—', c: '#FBBF24' };

    var reg = (typeof global.regFmt === 'function')
      ? global.regFmt(d.reg != null ? d.reg : d.reg_signal)
      : ['—', '#71717A', 'Stable'];

    var trend = d.trend || 'Stable';
    var trendC = trendColor(trend);

    var projHtml = proj != null
      ? '<span style="color:' + metricColor(proj, 'osi') + '">' + fmtMetric(proj) + '</span>'
        + (projDelta != null && Math.abs(projDelta) >= 0.05
          ? ' <span class="tt-delta">(' + fmtSigned(projDelta) + ')</span>' : '')
      : '—';

    var susHtml = susVal != null
      ? '<span style="color:' + sus.c + '">' + esc(sus.l) + ' (' + fmtMetric(susVal) + ')</span>'
      : '—';

    var regHtml = '<span style="color:' + reg[1] + '">' + esc(reg[0]) + '</span>';

    return '<div class="tt-team">' + esc(d.t) + '</div>'
      + '<div class="tt-sep"></div>'
      + ttRow('OSI', '<span style="color:' + metricColor(osi, 'osi') + '">' + fmtMetric(osi) + '</span>')
      + ttRow('Projected OSI', projHtml)
      + ttRow('Current Form', '<span style="color:' + metricColor(form, 'osi') + '">' + fmtMetric(form) + '</span>')
      + '<div class="tt-sep"></div>'
      + ttRow('RCV', '<span style="color:' + metricColor(d.rcv, 'rcv') + '">' + fmtMetric(d.rcv) + '</span>')
      + ttRow('ABQ', '<span style="color:' + metricColor(d.abq, 'abq') + '">' + fmtMetric(d.abq) + '</span>')
      + ttRow('OBR', '<span style="color:' + metricColor(d.obr, 'obr') + '">' + fmtMetric(d.obr) + '</span>')
      + '<div class="tt-sep"></div>'
      + ttRow('PP Gap (ABQ–RCV)', '<span style="color:' + metricColor(pp, 'ppGap') + '">' + fmtSigned(pp) + '</span>')
      + ttRow('DF Gap (RCV–OBR)', '<span style="color:' + metricColor(df, 'dfGap') + '">' + fmtSigned(df) + '</span>')
      + '<div class="tt-sep"></div>'
      + ttRow('Sustainability', susHtml)
      + ttRow('Regression', regHtml)
      + ttRow('Trend', '<span style="color:' + trendC + '">' + esc(trend) + '</span>')
      + ttRow('Split Edge', '<span style="color:' + (edge != null && Math.abs(edge) >= 3 ? '#9A6BFF' : '#E4E4E7') + '">' + fmtSigned(edge) + '</span>');
  }

  /** RCV vs regression gap quadrant — 30-team market map bubbles. */
  function renderMarketQuadrant(containerId, rows, opts) {
    opts = opts || {};
    var el = opts.el || document.getElementById(containerId);
    if (!el) return null;
    var data = (rows || []).filter(function(d) {
      return d && d.rcv != null && !isNaN(d.rcv) && quadYValue(d) != null;
    });
    if (!data.length) {
      el.innerHTML = '<div class="mlbma-quad-placeholder"><p class="ca-helper">Market map loads when team offense data is available (vs_RHP scores).</p></div>';
      return el;
    }
    var W = opts.width || Math.min(1200, el.clientWidth || 900);
    var H = opts.height || Math.max(520, W < 700 ? 520 : 560);
    var ml = 80, mr = 60, mt = 60, mb = 70;
    var cw = W - ml - mr;
    var ch = H - mt - mb;
    var xMn = 0, xMx = 100;
    var yVals = data.map(quadYValue);
    var yMn = Math.min(-12, Math.min.apply(null, yVals.concat([-12])));
    var yMx = Math.max(12, Math.max.apply(null, yVals.concat([12])));
    var xRng = xMx - xMn;
    var yRng = yMx - yMn;
    function xs(v) { return ml + ((v - xMn) / xRng) * cw; }
    function ys(v) { return mt + (1 - (v - yMn) / yRng) * ch; }
    var mx = xs(50);
    var my = ys(0);
    var tipId = opts.tipId || (containerId + 'Tip');

    var legend = '<div class="mlbma-quad-legend">'
      + [{ c: '#22C55E', l: 'Elite & Undervalued' }, { c: '#2DD4BF', l: 'Buy-Low Offense' },
         { c: '#F59E0B', l: 'Strong But Cooling' }, { c: '#FB7185', l: 'Weak & Concerning' }]
        .map(function(q) {
          return '<span class="mlbma-quad-leg-item"><i style="background:' + q.c + '"></i>' + esc(q.l) + '</span>';
        }).join('') + '</div>';

    var svg = '<svg class="mlbma-market-quad" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="RCV vs regression gap market map">'
      + '<rect x="' + ml + '" y="' + mt + '" width="' + cw + '" height="' + ch + '" fill="#0f0f12" rx="8"/>'
      + '<rect x="' + mx + '" y="' + mt + '" width="' + (W - mr - mx) + '" height="' + (my - mt) + '" fill="rgba(34,197,94,.08)"/>'
      + '<rect x="' + ml + '" y="' + mt + '" width="' + (mx - ml) + '" height="' + (my - mt) + '" fill="rgba(45,212,191,.08)"/>'
      + '<rect x="' + mx + '" y="' + my + '" width="' + (W - mr - mx) + '" height="' + (H - mb - my) + '" fill="rgba(245,158,11,.08)"/>'
      + '<rect x="' + ml + '" y="' + my + '" width="' + (mx - ml) + '" height="' + (H - mb - my) + '" fill="rgba(251,113,133,.08)"/>';

    [25, 50, 75].forEach(function(v) {
      var gx = xs(v);
      svg += '<line x1="' + gx + '" y1="' + mt + '" x2="' + gx + '" y2="' + (H - mb) + '" stroke="rgba(255,255,255,.05)"/>';
      svg += '<text x="' + gx + '" y="' + (H - mb + 16) + '" text-anchor="middle" fill="#71717A" font-size="10" font-family="var(--mono)">' + v + '</text>';
    });
    [-10, -5, 0, 5, 10].forEach(function(v) {
      if (v < yMn || v > yMx) return;
      var gy = ys(v);
      svg += '<line x1="' + ml + '" y1="' + gy + '" x2="' + (W - mr) + '" y2="' + gy + '" stroke="rgba(255,255,255,.05)"/>';
      svg += '<text x="' + (ml - 6) + '" y="' + (gy + 4) + '" text-anchor="end" fill="#71717A" font-size="10" font-family="var(--mono)">' + (v > 0 ? '+' : '') + v + '</text>';
    });

    svg += '<line x1="' + mx + '" y1="' + mt + '" x2="' + mx + '" y2="' + (H - mb) + '" stroke="rgba(192,132,252,.35)" stroke-dasharray="5,4"/>';
    svg += '<line x1="' + ml + '" y1="' + my + '" x2="' + (W - mr) + '" y2="' + my + '" stroke="rgba(192,132,252,.35)" stroke-dasharray="5,4"/>';

    svg += '<text x="' + (W - mr - 6) + '" y="' + (mt + 12) + '" text-anchor="end" fill="rgba(34,197,94,.95)" font-size="9" font-weight="700">ELITE &amp; UNDERVALUED</text>';
    svg += '<text x="' + (ml + 6) + '" y="' + (mt + 12) + '" text-anchor="start" fill="rgba(45,212,191,.95)" font-size="9" font-weight="700">BUY-LOW OFFENSE</text>';
    svg += '<text x="' + (W - mr - 6) + '" y="' + (H - mb - 6) + '" text-anchor="end" fill="rgba(245,158,11,.95)" font-size="9" font-weight="700">STRONG BUT COOLING</text>';
    svg += '<text x="' + (ml + 6) + '" y="' + (H - mb - 6) + '" text-anchor="start" fill="rgba(251,113,133,.95)" font-size="9" font-weight="700">WEAK &amp; CONCERNING</text>';

    data.forEach(function(d) {
      var xVal = d.rcv;
      var yVal = quadYValue(d);
      var meta = marketQuadrantMeta(xVal, yVal);
      svg += quadrantBubbleMarkup(d, xs(xVal), ys(yVal), meta);
    });

    svg += '<text x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#A1A1AA" font-size="11">RCV Score</text>';
    svg += '<text transform="rotate(-90 ' + ml + ' ' + (H / 2) + ')" x="' + ml + '" y="' + (H / 2) + '" text-anchor="middle" fill="#A1A1AA" font-size="10">xwOBA − wOBA Gap</text>';
    svg += '</svg>';

    el.innerHTML = '<div class="mlbma-quad-wrap">' + legend
      + '<div class="mlbma-quad-chart-wrap chart-wrap">' + svg
      + '<div id="' + esc(tipId) + '" class="tooltip chart-tip mlbma-quad-tip" role="tooltip"></div></div></div>';

    var tip = document.getElementById(tipId);
    var wrap = el.querySelector('.mlbma-quad-chart-wrap');
    el.querySelectorAll('.mlbma-quad-dot').forEach(function(g) {
      g.addEventListener('click', function() {
        var t = g.getAttribute('data-team');
        if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
      });
      var img = g.querySelector('.mlbma-quad-logo');
      var abbr = g.querySelector('.mlbma-quad-abbr');
      if (img && abbr) {
        img.addEventListener('error', function() {
          img.style.display = 'none';
          abbr.style.display = 'block';
        });
      }
      g.addEventListener('mouseenter', function() {
        var t = g.getAttribute('data-team');
        var d = data.find(function(r) { return r.t === t; });
        if (!d || !tip) return;
        tip.innerHTML = buildMarketQuadrantTipHtml(d);
        tip.classList.add('show');
      });
      g.addEventListener('mousemove', function(e) {
        if (!tip || !wrap) return;
        var rect = wrap.getBoundingClientRect();
        var tipW = tip.offsetWidth || 240;
        var tipH = tip.offsetHeight || 200;
        var x = e.clientX - rect.left + 14;
        var y = e.clientY - rect.top + 14;
        if (x + tipW + 8 > rect.width) x = e.clientX - rect.left - tipW - 14;
        if (y + tipH + 8 > rect.height) y = e.clientY - rect.top - tipH - 14;
        if (x < 8) x = 8;
        if (y < 8) y = 8;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      });
      g.addEventListener('mouseleave', function() {
        if (tip) tip.classList.remove('show');
      });
      g.addEventListener('focus', function() {
        var t = g.getAttribute('data-team');
        var d = data.find(function(r) { return r.t === t; });
        if (!d || !tip) return;
        tip.innerHTML = buildMarketQuadrantTipHtml(d);
        tip.classList.add('show');
        var circle = g.querySelector('circle');
        if (circle && wrap) {
          var cx = parseFloat(circle.getAttribute('cx') || '0');
          var cy = parseFloat(circle.getAttribute('cy') || '0');
          var tipW = tip.offsetWidth || 240;
          var x = cx + 36;
          var y = cy - 20;
          if (x + tipW > wrap.clientWidth) x = cx - tipW - 36;
          tip.style.left = Math.max(8, x) + 'px';
          tip.style.top = Math.max(8, y) + 'px';
        }
      });
      g.addEventListener('blur', function() {
        if (tip) tip.classList.remove('show');
      });
    });
    return el;
  }

  function renderSparkline(containerId, values, options) {
    options = options || {};
    var el = options.el || document.getElementById(containerId);
    if (!el) return null;
    var w = options.width || 140;
    var h = options.height || 32;
    var label = options.label || '';
    var pts = (values || []).filter(function(v) { return v != null && !isNaN(v); });
    if (pts.length < 2) {
      el.innerHTML = '<div class="mlbma-sparkline-row mlbma-sparkline-limited">'
        + (label ? '<span class="mlbma-spark-label">' + esc(label) + '</span>' : '')
        + '<span class="mlbma-spark-note">Limited data</span></div>';
      return el;
    }
    el.innerHTML = '<div class="mlbma-sparkline-row">'
      + (label ? '<span class="mlbma-spark-label">' + esc(label) + '</span>' : '')
      + buildSparkline(values, w, h, options) + '</div>';
    return el;
  }

  function buildSparklineRow(label, values, width, height, opts) {
    opts = opts || {};
    width = width || 140;
    height = height || 32;
    var pts = (values || []).filter(function(v) { return v != null && !isNaN(v); });
    var cur = pts.length ? pts[pts.length - 1] : null;
    if (!pts.length) {
      return '<div class="mlbma-sparkline-row mlbma-sparkline-limited">'
        + '<span class="mlbma-spark-label">' + esc(label) + '</span>'
        + '<span class="mlbma-spark-note">—</span></div>';
    }
    return '<div class="mlbma-sparkline-row">'
      + '<span class="mlbma-spark-label">' + esc(label) + '</span>'
      + buildSparkline(values, width, height, opts)
      + (cur != null ? '<span class="mlbma-spark-val">' + Number(cur).toFixed(1) + '</span>' : '')
      + '</div>';
  }

  /** Larger trend chart for profile summary panels (YTD → L7). */
  function trendLineColor(values, metricCtx) {
    var pts = (values || []).map(num).filter(function(v) { return v != null; });
    if (pts.length < 2) return '#9A6BFF';
    var first = pts[0];
    var last = pts[pts.length - 1];
    if (Math.abs(last - first) <= 2) return '#C4B0FF';
    return last > first ? '#4ADE80' : '#F87171';
  }

  function metricColorVal(v, ctx) {
    if (v == null || isNaN(v)) return 'var(--text-3, #71717A)';
    if (global.MLBMAAssets && MLBMAAssets.metricColor) return MLBMAAssets.metricColor(v, ctx || 'osi', false);
    return trendLineColor([v], ctx);
  }

  function trendWindowSlice(allLabels, values, windowKey) {
    var labels = allLabels || ['YTD', 'L30', 'L14', 'L7'];
    var vals = values || [];
    var idx;
    if (windowKey === 'L7') idx = [0, 3];
    else if (windowKey === 'L14') idx = [0, 2, 3];
    else idx = [0, 1, 2, 3];
    return {
      labels: idx.map(function(i) { return labels[i]; }),
      values: idx.map(function(i) { return vals[i]; })
    };
  }

  function trendMetricPack(m) {
    m = m || {};
    return {
      osi: [m.osiYtd, m.osiL30, m.osiL14, m.osiL7],
      abq: [m.abqYtd, m.abqL30, m.abqL14, m.abqL7],
      rcv: [m.rcvYtd, m.rcvL30, m.rcvL14, m.rcvL7],
      obr: [m.obrYtd, m.obrL30, m.obrL14, m.obrL7]
    };
  }

  function trendDeltaReadout(m, windowKey) {
    var pack = trendMetricPack(m);
    var keys = ['osi', 'rcv', 'abq', 'obr'];
    var labels = { osi: 'OSI', rcv: 'RCV', abq: 'ABQ', obr: 'OBR' };
    var deltas = [];
    var missing = [];
    keys.forEach(function(k) {
      var ytd = num((pack[k] || [])[0]);
      var l7 = num((pack[k] || [])[3]);
      if (ytd == null || l7 == null) {
        missing.push(labels[k]);
        return;
      }
      if (Math.abs(l7 - ytd) < 0.05) return;
      deltas.push({ key: k, label: labels[k], delta: l7 - ytd });
    });
    if (!deltas.length) {
      if (missing.length === keys.length) {
        return 'Rolling window columns missing — run compute_team_profile + push_team_profiles for L7/L14/L30 splits.';
      }
      return 'L7 matches YTD across metrics — run batter split window scrape for fresh rolling trends.';
    }
    deltas.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var lead = deltas[0];
    var winLabel = windowKey === 'L7' ? 'L7' : windowKey === 'L14' ? 'L14' : windowKey === 'L30' ? 'L30' : 'L7';
    var arrow = lead.delta > 0 ? '▲' : '▼';
    var driver = deltas.length > 1 ? ', driven by ' + deltas[1].label + ' (' + (deltas[1].delta >= 0 ? '+' : '') + deltas[1].delta.toFixed(1) + ')' : '';
    return lead.label + ' ' + arrow + ' ' + Math.abs(lead.delta).toFixed(1) + ' over ' + winLabel + driver + '.';
  }

  function computeTrendVelocityFromWindows(values) {
    var pts = (values || []).map(num);
    var xy = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i] == null) continue;
      xy.push({ x: i, y: pts[i] });
    }
    if (xy.length < 2) return null;
    var mx = xy.reduce(function(s, p) { return s + p.x; }, 0) / xy.length;
    var my = xy.reduce(function(s, p) { return s + p.y; }, 0) / xy.length;
    var nume = 0;
    var den = 0;
    xy.forEach(function(p) {
      nume += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    });
    if (!den) return 0;
    return nume / den;
  }

  function trendDirectionFromVelocity(velocity) {
    var v = num(velocity);
    if (v == null) return 'Stable';
    if (v >= 0.6) return 'Rising';
    if (v <= -0.6) return 'Cooling';
    return 'Stable';
  }

  function trendInterpretationLabel(delta, velocity) {
    var d = num(delta);
    var v = num(velocity);
    if (d == null || v == null) return 'Insufficient';
    if (d >= 4 && v > 0.6) return 'Momentum Up';
    if (d <= -4 && v < -0.6) return 'Momentum Down';
    if (Math.abs(d) <= 2 && Math.abs(v) < 0.6) return 'Stable Band';
    if (Math.abs(d) >= 5 && Math.abs(v) < 0.4) return 'Recent Spike';
    return 'Mixed Signal';
  }

  function trendReliabilityForRow(ytd, l30, l7, trendDir) {
    var OEM = (typeof global !== 'undefined' && global.OEMOverhaul) ? global.OEMOverhaul : null;
    if (OEM && typeof OEM.trendReliabilityLabel === 'function') {
      return OEM.trendReliabilityLabel({
        l7OSI: num(l7),
        ytdOSI: num(ytd),
        l30OSI: num(l30),
        trend: trendDir
      });
    }
    var l7v = num(l7);
    var ytdv = num(ytd);
    var l30v = num(l30);
    if (l7v != null && ytdv != null && Math.abs(l7v - ytdv) > 8
        && (l30v == null || Math.abs(l30v - ytdv) < 4)) {
      return 'Short Spike';
    }
    if (trendDir === 'Rising' && l30v != null && ytdv != null && l30v > ytdv) return 'Sustained Rise';
    if (trendDir === 'Cooling') return 'Declining';
    if (trendDir === 'Stable') return 'Stable';
    return 'Noisy';
  }

  function buildTrendWindowRow(values) {
    var ytd = num(values && values[0]);
    var l30 = num(values && values[1]);
    var l14 = num(values && values[2]);
    var l7 = num(values && values[3]);
    var velocity = computeTrendVelocityFromWindows([ytd, l30, l14, l7]);
    var trendDir = trendDirectionFromVelocity(velocity);
    var deltaVal = ytd != null && l7 != null ? l7 - ytd : null;
    return {
      ytd: ytd,
      l30: l30,
      l14: l14,
      l7: l7,
      delta: deltaVal,
      velocity: velocity,
      trend: trendDir,
      reliability: trendReliabilityForRow(ytd, l30, l7, trendDir),
      interpretation: trendInterpretationLabel(deltaVal, velocity)
    };
  }

  function buildTrendLineChart(label, values, width, height, opts) {
    opts = opts || {};
    width = width || 320;
    height = height || 96;
    var chartH = 56;
    var labels = opts.labels || ['YTD', 'L30', 'L14', 'L7'];
    var metricCtx = opts.metricCtx || 'osi';
    var raw = values || [];
    var nums = raw.map(num);
    var valid = nums.filter(function(v) { return v != null; });
    var cur = valid.length ? valid[valid.length - 1] : null;
    var lineColor = trendLineColor(nums, metricCtx);
    var curColor = metricColorVal(cur, metricCtx);
    var padL = 10;
    var padR = 10;
    var padT = 8;
    var padB = 8;
    var iw = width - padL - padR;
    var ih = chartH - padT - padB;
    var denom = Math.max(1, raw.length - 1);
    var coords = [];

    for (var i = 0; i < raw.length; i++) {
      var v = nums[i];
      if (v == null) continue;
      coords.push({ x: padL + (i / denom) * iw, v: v, i: i });
    }

    var min = valid.length ? Math.min.apply(null, valid) : 0;
    var max = valid.length ? Math.max.apply(null, valid) : 100;
    var range = max - min || 1;
    coords.forEach(function(c) {
      c.y = padT + ih - ((c.v - min) / range) * ih;
    });

    var svgBody = '';
    if (!valid.length) {
      svgBody = '<line x1="' + padL + '" y1="' + (chartH / 2) + '" x2="' + (width - padR) + '" y2="' + (chartH / 2)
        + '" stroke="rgba(124,77,255,0.25)" stroke-width="1" stroke-dasharray="4 4"/>';
    } else if (coords.length === 1) {
      var c0 = coords[0];
      svgBody = '<line x1="' + padL + '" y1="' + c0.y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + c0.y.toFixed(1)
        + '" stroke="rgba(124,77,255,0.2)" stroke-width="1"/>'
        + '<circle cx="' + c0.x.toFixed(1) + '" cy="' + c0.y.toFixed(1) + '" r="4" fill="' + lineColor + '" stroke="#08090F" stroke-width="2"/>';
    } else {
      var linePath = 'M' + coords.map(function(c) { return c.x.toFixed(1) + ',' + c.y.toFixed(1); }).join(' L');
      var areaPath = linePath
        + ' L' + coords[coords.length - 1].x.toFixed(1) + ',' + (padT + ih).toFixed(1)
        + ' L' + coords[0].x.toFixed(1) + ',' + (padT + ih).toFixed(1) + ' Z';
      var gridLines = [0.25, 0.5, 0.75].map(function(pct) {
        var gy = padT + ih * (1 - pct);
        return '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + gy.toFixed(1)
          + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
      }).join('');
      var dots = coords.map(function(c, idx) {
        var isLast = idx === coords.length - 1;
        return '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="' + (isLast ? '4.5' : '3') + '" fill="'
          + (isLast ? lineColor : '#C4B0FF') + '" stroke="#08090F" stroke-width="' + (isLast ? '2' : '1.5') + '"/>';
      }).join('');
      svgBody = '<defs>'
        + '<linearGradient id="trendFill-' + esc(metricCtx) + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0%" stop-color="' + lineColor + '" stop-opacity="0.35"/>'
        + '<stop offset="100%" stop-color="' + lineColor + '" stop-opacity="0"/>'
        + '</linearGradient></defs>'
        + gridLines
        + '<path d="' + areaPath + '" fill="url(#trendFill-' + esc(metricCtx) + ')" stroke="none"/>'
        + '<path d="' + linePath + '" fill="none" stroke="' + lineColor + '" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>'
        + dots;
    }

    var axis = labels.map(function(l, i) {
      var v = nums[i];
      var valHtml = (v != null && !isNaN(v))
        ? '<strong style="color:' + esc(metricColorVal(v, metricCtx)) + '">' + Number(v).toFixed(1) + '</strong>'
        : '<span class="mlbma-trend-na">—</span>';
      return '<span class="mlbma-trend-axis"><span class="mlbma-trend-axis-l">' + esc(l) + '</span>' + valHtml + '</span>';
    }).join('');

    var deltaHtml = '';
    var ytdVal = nums.length ? nums[0] : null;
    var endIdx = labels.length > 3 ? 3 : labels.length - 1;
    var endVal = nums.length > endIdx ? nums[endIdx] : null;
    if (ytdVal != null && endVal != null && !isNaN(ytdVal) && !isNaN(endVal)) {
      var delta = endVal - ytdVal;
      if (Math.abs(delta) >= 0.05) {
        var deltaCls = delta > 2 ? 'is-up' : delta < -2 ? 'is-down' : 'is-flat';
        deltaHtml = '<span class="mlbma-trend-delta ' + deltaCls + '">'
          + (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' YTD→L7</span>';
      } else {
        deltaHtml = '<span class="mlbma-trend-delta is-flat">Flat YTD→L7</span>';
      }
    }

    return '<div class="mlbma-trend-chart" data-metric="' + esc(metricCtx) + '">'
      + '<div class="mlbma-trend-head">'
      + '<span class="mlbma-trend-label">' + esc(label) + '</span>'
      + '<div class="mlbma-trend-head-val">'
      + (cur != null ? '<span class="mlbma-trend-cur" style="color:' + esc(curColor) + '">' + Number(cur).toFixed(1) + '</span>' : '')
      + deltaHtml + '</div></div>'
      + '<div class="mlbma-trend-svg-wrap">'
      + '<svg class="mlbma-trend-svg" viewBox="0 0 ' + width + ' ' + chartH + '" preserveAspectRatio="none" aria-hidden="true">'
      + svgBody + '</svg></div>'
      + '<div class="mlbma-trend-axis-row">' + axis + '</div>'
      + '</div>';
  }

  function teamRadarComparePayload(bothRow, rhpRow, lhpRow) {
    if (!bothRow) return null;
    var rhpOsi = rhpRow && rhpRow.osi != null ? rhpRow.osi : null;
    var lhpOsi = lhpRow && lhpRow.osi != null ? lhpRow.osi : null;
    var bestSplit = rhpOsi != null && lhpOsi != null ? Math.max(rhpOsi, lhpOsi)
      : (rhpOsi != null ? rhpOsi : lhpOsi);
    return {
      abq: bothRow.abq,
      rcv: bothRow.rcv,
      obr: bothRow.obr,
      projOSI: bothRow.projOSI != null ? bothRow.projOSI : bothRow.osi,
      sustain: bothRow.obr,
      bestSplit: bestSplit
    };
  }

  function radarPayloadValues(payload) {
    if (!payload) return [50, 50, 50, 50, 50, 50];
    return [
      norm100(payload.abq, false),
      norm100(payload.rcv, false),
      norm100(payload.obr, false),
      norm100(payload.projOSI, false),
      norm100(payload.sustain, false),
      norm100(payload.bestSplit, false)
    ];
  }

  /**
   * Two-team hex radar — ABQ, RCV, OBR, ProjOSI, Sustain, Best Split.
   */
  function renderRadarChart(containerId, teamAData, teamBData, labelA, labelB, opts) {
    opts = opts || {};
    var metrics = ['ABQ', 'RCV', 'OBR', 'ProjOSI', 'Sustain', 'Best Split'];
    var teams = [];
    var colors = [];
    if (teamAData) {
      teams.push({ abbr: labelA || 'A', values: radarPayloadValues(teamAData) });
      colors.push('#7C4DFF');
    }
    if (teamBData) {
      teams.push({ abbr: labelB || 'B', values: radarPayloadValues(teamBData) });
      colors.push('#22D3EE');
    }
  return buildRadarChart(containerId, teams, metrics, colors, opts);
  }

  function renderMarketMapWithToggle(containerId, getRowsForSplit, opts) {
    opts = opts || {};
    var el = document.getElementById(containerId);
    if (!el) return;
    var split = opts.defaultSplit || 'rhp';
    var tipId = opts.tipId || (containerId + 'Tip');

    function renderSplit(nextSplit) {
      split = nextSplit;
      var rows = typeof getRowsForSplit === 'function' ? getRowsForSplit(split) : [];
      var toggleHtml = '<div class="mlbma-map-split-toggle ca-pill-bar" style="margin-bottom:12px">'
        + '<span class="ca-pill-label">Split</span>'
        + '<button type="button" class="ca-pill-btn' + (split === 'rhp' ? ' active' : '') + '" data-map-split="rhp">vs RHP</button>'
        + '<button type="button" class="ca-pill-btn' + (split === 'lhp' ? ' active' : '') + '" data-map-split="lhp">vs LHP</button>'
        + '</div>';
      el.innerHTML = toggleHtml + '<div id="' + containerId + 'Chart"></div><div id="' + tipId + '" class="chart-tip mlbma-quad-tip"></div>';
      renderMarketQuadrant(containerId + 'Chart', rows, { tipId: tipId, width: opts.width, height: opts.height });
      el.querySelectorAll('[data-map-split]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          renderSplit(btn.getAttribute('data-map-split'));
        });
      });
    }
    renderSplit(split);
  }

  function getQuadrantRows(split) {
    var ld = global.LIVE_DATA || {};
    if (split === 'lhp' || split === 'l') {
      if (ld.scYtdL && ld.scYtdL.length >= 20) return ld.scYtdL;
      if (typeof global.SCO_YTD_L !== 'undefined' && global.SCO_YTD_L.length) return global.SCO_YTD_L;
      return [];
    }
    if (ld.scYtdR && ld.scYtdR.length >= 20) return ld.scYtdR;
    if (typeof global.SCO_YTD_R !== 'undefined' && global.SCO_YTD_R.length) return global.SCO_YTD_R;
    return [];
  }

  global.MLBMACharts = {
    buildSparkline: buildSparkline,
    buildSparklineRow: buildSparklineRow,
    buildTrendLineChart: buildTrendLineChart,
    trendWindowSlice: trendWindowSlice,
    trendMetricPack: trendMetricPack,
    trendDeltaReadout: trendDeltaReadout,
    buildTrendWindowRow: buildTrendWindowRow,
    trendDirectionFromVelocity: trendDirectionFromVelocity,
    trendInterpretationLabel: trendInterpretationLabel,
    buildRadarChart: buildRadarChart,
    buildMiniQuadrant: buildMiniQuadrant,
    buildSnapshotRadar: buildSnapshotRadar,
    teamRadarValues: teamRadarValues,
    teamRadarComparePayload: teamRadarComparePayload,
    teamOsiTrend: teamOsiTrend,
    renderOnDataReady: renderOnDataReady,
    renderOnLiveDataReady: renderOnLiveDataReady,
    flushLiveDataReadyQueue: flushLiveDataReadyQueue,
    liveDataReady: liveDataReady,
    renderMarketQuadrant: renderMarketQuadrant,
    renderMarketMapWithToggle: renderMarketMapWithToggle,
    teamEspnLogoUrl: teamEspnLogoUrl,
    renderSparkline: renderSparkline,
    renderRadarChart: renderRadarChart,
    quadYValue: quadYValue,
    marketQuadrantMeta: marketQuadrantMeta,
    buildMarketQuadrantTipHtml: buildMarketQuadrantTipHtml,
    getQuadrantRows: getQuadrantRows
  };
})(typeof window !== 'undefined' ? window : this);
