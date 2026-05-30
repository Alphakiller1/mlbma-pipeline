// trends_heatmap.js — distinct Trends Heat Map surface
(function(global) {
  'use strict';

  var LM = global.LineupModel || global.MLBMALineupModel || null;
  var A = global.MLBMAAssets || null;
  var MS = global.MLBMASharedMatchup || {};
  var _mounted = null;

  var DEFAULT_STATE = {
    metric: 'rcv',
    hand: 'rhp',
    location: 'both',
    baseline: 'ytd',
    sortKey: 'delta',
    sortDir: 'desc'
  };

  var METRICS = [
    { key: 'winPct', sourceKey: 'winPct', label: 'Win%', disabled: false, phase: true, reason: 'Proxy until Phase 1 feed' },
    { key: 'f5WinPct', sourceKey: 'f5WinPct', label: 'F5 Win%', disabled: false, phase: true, reason: 'Proxy until Phase 1 feed' },
    { key: 'pitchScoreFaced', sourceKey: 'pitchScore', label: 'Pitching Score Faced', disabled: false, phase: true, reason: 'Proxy until Phase 1 feed' },
    { key: 'rcv', sourceKey: 'rcv', label: 'RCV', disabled: false, colorCtx: 'rcv' },
    { key: 'obr', sourceKey: 'obr', label: 'OBR', disabled: false, colorCtx: 'obr' }
  ];

  function teamKey(t) { return MS.teamKey ? MS.teamKey(t) : String(t || '').trim().toUpperCase(); }
  function num(v) { return v == null || v === '' || isNaN(v) ? null : Number(v); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function sortArrow(state, key) {
    if (state.sortKey !== key) return '';
    return state.sortDir === 'asc' ? ' ▲' : ' ▼';
  }
  function deltaText(v) {
    var n = num(v);
    if (n == null) return '—';
    if (n > 0) return '▲ ' + n.toFixed(1);
    if (n < 0) return '▼ ' + Math.abs(n).toFixed(1);
    return '± 0.0';
  }
  function deltaClass(v) {
    var n = num(v);
    if (n == null) return 'thm-delta-flat';
    if (n > 0) return 'thm-delta-up';
    if (n < 0) return 'thm-delta-down';
    return 'thm-delta-flat';
  }

  function ensureStyles() {
    if (document.getElementById('trendsHeatmapStyles')) return;
    var style = document.createElement('style');
    style.id = 'trendsHeatmapStyles';
    style.textContent = ''
      + '.thm-wrap{margin-top:8px;background:var(--surface-1,#0c0c14);border:0.5px solid var(--border,#26262f);border-radius:var(--r-md,12px);padding:16px;box-shadow:var(--e-1,none)}'
      + '.thm-title{font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.015em;color:var(--text,#f4f4f7);margin:0 0 14px;font-family:var(--font-display,var(--font,system-ui));font-variation-settings:"wdth" 125}'
      + '.thm-bar{background:transparent;border:0;border-radius:0;padding:0;margin-bottom:8px}'
      + '.thm-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}'
      + '.thm-group{display:flex;flex-direction:column;gap:6px}'
      + '.thm-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3,#6b6b76);font-weight:700;line-height:1;font-family:var(--font,system-ui)}'
      + '.thm-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.thm-pill{border:0.5px solid var(--border,#26262f);background:var(--surface-2,#14141e);color:var(--text-2,#a1a1aa);font-size:12px;font-weight:700;padding:7px 14px;border-radius:var(--r-pill,999px);cursor:pointer;line-height:1.1}'
      + '.thm-pill:hover{border-color:var(--border-2,#34343d);color:var(--text,#f4f4f7)}'
      + '.thm-pill.active{background:var(--accent-bg,rgba(139,92,246,.14));border-color:transparent;color:var(--accent-l,#c4b5fd)}'
      + '.thm-pill.is-phase1{opacity:.78;color:var(--text-2,#a1a1aa);background:var(--surface-2,#14141e);border-color:var(--border,#26262f)}'
      + '.thm-pill .thm-phase{margin-left:4px;color:var(--text-3,#6b6b76);font-size:10px}'
      + '.thm-note{font-size:15px;font-weight:600;color:var(--text-2,#a1a1aa);margin-top:6px;padding-top:0;border-top:0;line-height:1.6}'
      + '.thm-note.warn{color:var(--warn,#fbbf24)}'
      + '.thm-legend{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-2,#a1a1aa);margin-top:8px}'
      + '.thm-legend-bar{width:180px;height:10px;border-radius:999px;background:linear-gradient(90deg,var(--d-elite,#EC6A6A),var(--d-good,#E89A5C),var(--d-mid,#D8C36A),var(--d-weak,#8FB0D4),var(--d-poor,#6E8CC0));border:1px solid var(--border,#2A2A35)}'
      + '.thm-table-wrap{overflow:auto;border:0;border-radius:0;background:transparent}'
      + '.thm-table{width:100%;border-collapse:separate;border-spacing:8px 6px;font-size:14px}'
      + '.thm-table thead th{background:var(--surface-2,#14141e);color:var(--text-3,#6b6b76);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:10px 8px;border-radius:var(--r-sm,8px);text-align:left;white-space:nowrap;font-weight:700;font-family:var(--font,system-ui)}'
      + '.thm-table thead th.sortable{cursor:pointer;user-select:none}'
      + '.thm-cell{padding:12px 12px;border-radius:var(--r-sm,8px);font-weight:700;color:var(--text,#F5F5F7);min-width:120px;text-align:center;font-size:13px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.02);font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.thm-cell.no-data{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--text-3,#6b6b76) 14%, transparent),color-mix(in srgb,var(--text-3,#6b6b76) 14%, transparent) 6px,transparent 6px,transparent 12px);color:var(--text-3,#6b6b76)}'
      + '.thm-rel{font-size:12px;font-weight:700;color:var(--text-2,#a1a1aa)}'
      + '.thm-int{font-size:12px;font-weight:700;color:var(--text,#f5f5f7)}'
      + '.thm-team{display:flex;align-items:center;gap:8px;padding:0 6px;min-width:120px;color:var(--text,#f4f4f7);font-family:var(--font-display,var(--font,system-ui));font-variation-settings:"wdth" 110}'
      + '.thm-team strong{font-size:13px}'
      + '.thm-team-logo{width:24px;height:24px;border-radius:0!important;object-fit:contain;background:transparent!important;border:0!important;box-shadow:none!important;clip-path:none!important}'
      + '.thm-team .team-logo-fallback{border-radius:0!important;background:transparent!important;border:0!important;box-shadow:none!important}'
      + '.thm-delta{font-weight:800;text-align:right;padding-right:8px;white-space:nowrap;font-size:13px;font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.thm-delta-up{color:var(--pos,#4ade80)}.thm-delta-down{color:var(--neg,#f87171)}.thm-delta-flat{color:var(--text-3,#6b6b76)}';
    document.head.appendChild(style);
  }

  function mapHand(v) {
    if (v === 'rhp') return 'r';
    if (v === 'lhp') return 'l';
    return 'both';
  }
  function mapLocation(v) {
    if (v === 'home') return 'home';
    if (v === 'away') return 'away';
    return 'all';
  }

  function fetchWindowRows(state, windowKey) {
    var filter = {
      hand: mapHand(state.hand),
      location: mapLocation(state.location),
      pitcher: 'both',
      batSide: 'both',
      segment: 'full',
      window: windowKey
    };
    return LM.rankAll(filter, 'scoring').then(function(rows) { return rows || []; });
  }

  function buildRows(state) {
    var metricDef = METRICS.find(function(m) { return m.key === state.metric; }) || { sourceKey: state.metric };
    var sourceKey = metricDef.sourceKey || state.metric;
    return Promise.all([
      fetchWindowRows(state, 'YTD'),
      fetchWindowRows(state, 'L30'),
      fetchWindowRows(state, 'L14'),
      fetchWindowRows(state, 'L7')
    ]).then(function(parts) {
      var ytd = parts[0], l30 = parts[1], l14 = parts[2], l7 = parts[3];
      var by = {};
      [ytd, l30, l14, l7].forEach(function(rows) {
        (rows || []).forEach(function(r) {
          var t = teamKey(r.t);
          if (!t) return;
          if (!by[t]) by[t] = { t: t };
        });
      });
      Object.keys(by).forEach(function(t) {
        var y = (ytd || []).find(function(r) { return teamKey(r.t) === t; }) || {};
        var a = (l30 || []).find(function(r) { return teamKey(r.t) === t; }) || {};
        var b = (l14 || []).find(function(r) { return teamKey(r.t) === t; }) || {};
        var c = (l7 || []).find(function(r) { return teamKey(r.t) === t; }) || {};
        by[t].ytd = num(y[sourceKey]);
        by[t].l30 = num(a[sourceKey]);
        by[t].l14 = num(b[sourceKey]);
        by[t].l7 = num(c[sourceKey]);
        by[t].delta = by[t].ytd != null && by[t].l7 != null ? by[t].l7 - by[t].ytd : null;
        by[t].velocity = computeVelocity(by[t]);
        by[t].trend = trendLabel(by[t]);
        by[t].reliability = reliabilityLabel(by[t]);
        by[t].reliabilityScore = reliabilityRank(by[t].reliability);
        by[t].interpretation = interpretationLabel(by[t]);
      });
      return Object.keys(by).sort().map(function(t) { return by[t]; });
    });
  }

  function sortedRows(rows, state) {
    var out = (rows || []).slice();
    var k = state.sortKey || 'delta';
    var dir = state.sortDir === 'asc' ? 'asc' : 'desc';
    out.sort(function(a, b) {
      if (k === 'team') {
        var ta = teamKey(a.t), tb = teamKey(b.t);
        return dir === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
      }
      if (k === 'reliability') {
        var ar = num(a.reliabilityScore), br = num(b.reliabilityScore);
        if (ar == null && br == null) return teamKey(a.t).localeCompare(teamKey(b.t));
        if (ar == null) return 1;
        if (br == null) return -1;
        if (ar === br) return teamKey(a.t).localeCompare(teamKey(b.t));
        return dir === 'asc' ? (ar - br) : (br - ar);
      }
      var av = num(a[k]);
      var bv = num(b[k]);
      if (av == null && bv == null) return teamKey(a.t).localeCompare(teamKey(b.t));
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return teamKey(a.t).localeCompare(teamKey(b.t));
      return dir === 'asc' ? (av - bv) : (bv - av);
    });
    return out;
  }
  function computeVelocity(row) {
    var pts = [num(row.ytd), num(row.l30), num(row.l14), num(row.l7)];
    var xy = [];
    for (var i = 0; i < pts.length; i++) {
      if (pts[i] == null) continue;
      xy.push({ x: i, y: pts[i] });
    }
    if (xy.length < 2) return null;
    var mx = xy.reduce(function(s, p) { return s + p.x; }, 0) / xy.length;
    var my = xy.reduce(function(s, p) { return s + p.y; }, 0) / xy.length;
    var nume = 0, den = 0;
    xy.forEach(function(p) {
      nume += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    });
    if (!den) return 0;
    return nume / den;
  }
  function trendLabel(row) {
    var v = num(row.velocity);
    if (v == null) return 'Stable';
    if (v >= 0.6) return 'Rising';
    if (v <= -0.6) return 'Cooling';
    return 'Stable';
  }
  function reliabilityLabel(row) {
    if (global.OEMOverhaul && typeof global.OEMOverhaul.trendReliabilityLabel === 'function') {
      return global.OEMOverhaul.trendReliabilityLabel({
        l7OSI: num(row.l7),
        ytdOSI: num(row.ytd),
        l30OSI: num(row.l30),
        trend: trendLabel(row)
      });
    }
    return 'Noisy';
  }
  function reliabilityRank(label) {
    var m = { 'Sustained Rise': 4, Stable: 3, Declining: 2, 'Short Spike': 1, Noisy: 0 };
    return m[label] != null ? m[label] : 0;
  }
  function interpretationLabel(row) {
    var d = num(row.delta);
    var v = num(row.velocity);
    if (d == null || v == null) return 'Insufficient';
    if (d >= 4 && v > 0.6) return 'Momentum Up';
    if (d <= -4 && v < -0.6) return 'Momentum Down';
    if (Math.abs(d) <= 2 && Math.abs(v) < 0.6) return 'Stable Band';
    if (Math.abs(d) >= 5 && Math.abs(v) < 0.4) return 'Recent Spike';
    return 'Mixed Signal';
  }
  function metricColor(value, metricKey) {
    var n = num(value);
    if (n == null) return null;
    if (A && A.metricColor) return A.metricColor(n, metricKey || 'osi', false);
    return null;
  }

  function minMax(values) {
    var vals = (values || []).map(num).filter(function(v) { return v != null; });
    if (!vals.length) return null;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (!isFinite(min) || !isFinite(max)) return null;
    if (Math.abs(max - min) < 1e-9) return { min: min - 1, max: max + 1 };
    return { min: min, max: max };
  }
  function vibrantColor(value, range) {
    var v = num(value);
    if (v == null || !range) return null;
    var t = (v - range.min) / (range.max - range.min);
    if (!isFinite(t)) t = 0.5;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var hue = 4 + (132 * t);
    return 'hsl(' + hue.toFixed(1) + ', 84%, 60%)';
  }

  function teamLogo(team) {
    var t = teamKey(team);
    var map = { TB: 'tb', TBR: 'tb', WSH: 'wsh', WSN: 'wsh', KC: 'kc', KCR: 'kc', CWS: 'chw', CHW: 'chw', SD: 'sd', SDP: 'sd', SF: 'sf', SFG: 'sf', OAK: 'oak', ATH: 'oak', AZ: 'ari' };
    var espn = (map[t] || t || 'mlb').toLowerCase();
    return '<img class="thm-team-logo" src="https://a.espncdn.com/i/teamlogos/mlb/500/' + espn + '.png" alt="' + esc(t) + '" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  function metricPill(metric, state) {
    var on = state.metric === metric.key;
    return '<button class="thm-pill' + (on ? ' active' : '') + (metric.phase ? ' is-phase1' : '') + '" data-a="metric" data-v="' + metric.key + '"' + (metric.phase ? ' title="Proxy metric until Phase 1 feed"' : '') + '>'
      + esc(metric.label) + '</button>';
  }
  function choicePill(group, key, val, label, state) {
    var on = state[key] === val;
    return '<button class="thm-pill' + (on ? ' active' : '') + '" data-a="' + group + '" data-v="' + val + '">' + esc(label) + '</button>';
  }

  function render(root, state) {
    if (!LM || !LM.rankAll) {
      root.innerHTML = '<div class="thm-note">LineupModel unavailable.</div>';
      return;
    }
    var metricDef = METRICS.find(function(m) { return m.key === state.metric; }) || null;
    var phase1Mode = !!(metricDef && metricDef.phase);
      var splitWarn = (state.metric === 'rcv' || state.metric === 'obr') && (state.hand !== 'both' || state.location !== 'both');
    root.innerHTML = '<div class="thm-wrap"><h3 class="thm-title">Trends Heat Map</h3><div class="thm-bar">'
      + '<div class="thm-row">'
      + '<div class="thm-group"><span class="thm-label">Hand</span><div class="thm-pills">'
      + choicePill('hand', 'hand', 'rhp', 'RHP', state)
      + choicePill('hand', 'hand', 'lhp', 'LHP', state)
      + choicePill('hand', 'hand', 'both', 'Both', state)
      + '</div></div>'
      + '<div class="thm-group"><span class="thm-label">Loc</span><div class="thm-pills">'
      + choicePill('loc', 'location', 'home', 'Home', state)
      + choicePill('loc', 'location', 'away', 'Away', state)
      + choicePill('loc', 'location', 'both', 'Both', state)
      + '</div></div>'
      + '</div>'
      + '<div class="thm-row" style="margin-top:8px"><div class="thm-group"><span class="thm-label">Metric</span><div class="thm-pills">'
      + METRICS.map(function(m) { return metricPill(m, state); }).join('')
      + '</div></div></div>'
      + '<div class="thm-note' + ((splitWarn || phase1Mode) ? ' warn' : '') + '">'
      + esc((state.metric.toUpperCase() + ' trend · ' + state.hand.toUpperCase() + ' · ' + state.location + ' locations · color = fixed all-30 league scale · read left→right for movement'))
      + (splitWarn ? ' · windowed split columns unavailable; using all-context window values with split fallback.' : '')
      + (phase1Mode ? ' · Phase 1 metric: showing current proxy model values until dedicated feed is connected.' : '')
      + ' · L7 is a momentum flag, not a standalone predictor.'
      + '</div>'
      + '<div class="thm-legend"><span>Elite</span><span class="thm-legend-bar"></span><span>Poor</span></div>'
      + '</div><div class="thm-table-wrap"><div class="thm-note">Loading trends heat map...</div></div></div>';

    buildRows(state).then(function(rows) {
      var sorted = sortedRows(rows, state);
      var metricDef = METRICS.find(function(m) { return m.key === state.metric; }) || {};
      var colorKey = metricDef.colorCtx || metricDef.sourceKey || state.metric;
      var head = '<table class="thm-table"><thead><tr>'
        + '<th class="sortable" data-a="sort" data-k="team">Team' + sortArrow(state, 'team') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="ytd">YTD' + sortArrow(state, 'ytd') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l30">L30' + sortArrow(state, 'l30') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l14">L14' + sortArrow(state, 'l14') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l7">L7' + sortArrow(state, 'l7') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="delta">Δ L7-YTD' + sortArrow(state, 'delta') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="velocity">Velocity' + sortArrow(state, 'velocity') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="reliability">Reliability' + sortArrow(state, 'reliability') + '</th>'
        + '<th>Interpretation</th>'
        + '</tr></thead><tbody>';
      var body = sorted.map(function(r) {
        function cell(v, digits) {
          if (v == null) return '<td><div class="thm-cell no-data">—</div></td>';
          var c = metricColor(v, colorKey);
          var txt = Number(v).toFixed(digits == null ? 1 : digits);
          var bg = c ? ('background:color-mix(in srgb,' + c + ' 28%, var(--card,#16161D)); color:' + c + ';') : '';
          return '<td><div class="thm-cell" style="' + bg + '">' + txt + '</div></td>';
        }
        var vel = num(r.velocity);
        var velTxt = vel == null ? '—' : (vel > 0 ? '▲ ' : vel < 0 ? '▼ ' : '■ ') + Math.abs(vel).toFixed(2);
        return '<tr>'
          + '<td><div class="thm-team">' + teamLogo(r.t) + '<strong>' + esc(r.t) + '</strong></div></td>'
          + cell(r.ytd, 1)
          + cell(r.l30, 1)
          + cell(r.l14, 1)
          + cell(r.l7, 1)
          + '<td class="thm-delta ' + deltaClass(r.delta) + '">' + esc(deltaText(r.delta)) + '</td>'
          + '<td><div class="thm-cell">' + esc(velTxt) + '</div></td>'
          + '<td><div class="thm-rel">' + esc(r.reliability || 'Noisy') + '</div></td>'
          + '<td><div class="thm-int">' + esc(r.interpretation || 'Insufficient') + '</div></td>'
          + '</tr>';
      }).join('');
      root.querySelector('.thm-table-wrap').innerHTML = head + body + '</tbody></table>';
    }).catch(function(err) {
      root.querySelector('.thm-table-wrap').innerHTML = '<div class="thm-note" style="color:var(--neg,#f87171)">Heat map render error: ' + esc(err && err.message ? err.message : String(err)) + '</div>';
    });
  }

  function bind(root, state) {
    root.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (btn) {
        var a = btn.getAttribute('data-a');
        var v = btn.getAttribute('data-v');
        if (a === 'metric') {
          var def = METRICS.find(function(m) { return m.key === v; });
          if (!def) return;
          state.metric = v;
          state.sortKey = 'delta';
          state.sortDir = 'desc';
          render(root, state);
          return;
        }
        if (a === 'hand') state.hand = v;
        if (a === 'loc') state.location = v;
        if (a === 'hand' || a === 'loc') {
          render(root, state);
          return;
        }
      }
      var th = e.target.closest('th[data-a="sort"]');
      if (th) {
        var k = th.getAttribute('data-k');
        if (!k) return;
        if (state.sortKey === k) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortKey = k; state.sortDir = (k === 'team' ? 'asc' : 'desc'); }
        render(root, state);
      }
    });
  }

  function mount(opts) {
    opts = opts || {};
    ensureStyles();
    var el = typeof opts.mountId === 'string' ? document.getElementById(opts.mountId) : opts.element;
    if (!el) return null;
    var state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    el.innerHTML = '';
    bind(el, state);
    render(el, state);
    _mounted = {
      rerender: function() { render(el, state); },
      getState: function() { return JSON.parse(JSON.stringify(state)); }
    };
    return _mounted;
  }

  global.TrendsHeatmap = { mount: mount, rerender: function() { if (_mounted) _mounted.rerender(); } };
  global.renderTrendHeatmap = function() { if (_mounted) _mounted.rerender(); };
})(typeof window !== 'undefined' ? window : this);
