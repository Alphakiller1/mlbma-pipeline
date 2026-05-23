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
      var col = colors[ti] || '#7C3AED';
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
      var col = colors[ti] || '#7C3AED';
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
      var col = hi ? '#7C3AED' : 'rgba(161,161,170,.55)';
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
    var teamCol = opts.teamColor || '#7C3AED';
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

  global.MLBMACharts = {
    buildSparkline: buildSparkline,
    buildRadarChart: buildRadarChart,
    buildMiniQuadrant: buildMiniQuadrant,
    buildSnapshotRadar: buildSnapshotRadar,
    teamRadarValues: teamRadarValues,
    teamOsiTrend: teamOsiTrend
  };
})(typeof window !== 'undefined' ? window : this);
