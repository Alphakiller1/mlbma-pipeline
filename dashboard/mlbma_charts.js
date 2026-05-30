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

  /**
   * RCV (x) vs reg_signal / PP-Gap (y) market quadrant — pure SVG.
   */
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
      + '<div id="' + esc(tipId) + '" class="chart-tip mlbma-quad-tip"></div></div></div>';

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
      g.addEventListener('mouseenter', function(e) {
        var t = g.getAttribute('data-team');
        var d = data.find(function(r) { return r.t === t; });
        if (!d || !tip) return;
        var yVal = quadYValue(d);
        var meta = marketQuadrantMeta(d.rcv, yVal);
        var pp = d.ppGap != null ? d.ppGap.toFixed(1) : '—';
        tip.innerHTML = '<div class="tt-team">' + esc(d.t) + '</div>'
          + '<div>RCV <strong>' + d.rcv.toFixed(1) + '</strong> · Gap <strong>' + yVal.toFixed(1) + '</strong></div>'
          + '<div>PP-Gap <strong>' + pp + '</strong> · OSI <strong>' + (d.osi != null ? d.osi.toFixed(1) : '—') + '</strong></div>'
          + '<div class="tt-quad" style="color:' + meta.color + '">' + esc(meta.label) + '</div>';
        tip.classList.add('show');
      });
      g.addEventListener('mousemove', function(e) {
        if (!tip || !wrap) return;
        var rect = wrap.getBoundingClientRect();
        var x = e.clientX - rect.left + 12;
        var y = e.clientY - rect.top + 12;
        if (x + 200 > rect.width) x = e.clientX - rect.left - 210;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
      });
      g.addEventListener('mouseleave', function() {
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
    getQuadrantRows: getQuadrantRows
  };
})(typeof window !== 'undefined' ? window : this);
