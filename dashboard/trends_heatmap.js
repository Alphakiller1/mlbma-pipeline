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
    { key: 'pitchScoreFaced', sourceKey: 'pitchScoreFaced', label: 'Pitching Score Faced', disabled: false, colorCtx: 'pitching', invert: true },
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

  function thmPillCss() {
    return ''
      + '.thm-wrap .ca-pill-btn,.thm-wrap button.ca-pill-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;padding:10px 18px!important;border-radius:14px!important;font-family:inherit!important;font-size:13px!important;font-weight:600!important;line-height:1.25!important;cursor:pointer!important;appearance:none!important;-webkit-appearance:none!important;text-decoration:none!important;white-space:nowrap!important;border:1px solid rgba(124,77,255,.4)!important;background:rgba(255,255,255,.03)!important;color:#e9e6ff!important;box-shadow:none!important;transition:transform .2s ease,box-shadow .2s ease,background .2s ease,border-color .2s ease,color .2s ease!important}'
      + '.thm-wrap .ca-pill-btn:hover:not(:disabled):not(.active),.thm-wrap button.ca-pill-btn:hover:not(:disabled):not(.active){background:rgba(124,77,255,.12)!important;border-color:#C4B0FF!important;color:#fff!important}'
      + '.thm-wrap .ca-pill-btn.active,.thm-wrap button.ca-pill-btn.active{color:#fff!important;background:linear-gradient(135deg,#7C4DFF 0%,#5B2BE0 100%)!important;border-color:transparent!important;box-shadow:0 10px 40px -10px rgba(124,77,255,.55),inset 0 1px 0 rgba(255,255,255,.18)!important}';
  }

  function ensureStyles() {
    var style = document.getElementById('trendsHeatmapStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'trendsHeatmapStyles';
      document.head.appendChild(style);
    }
    style.textContent = ''
      + '.thm-wrap{margin-top:8px;background:var(--surface-1,#0c0c14);border:0.5px solid var(--border,#26262f);border-radius:var(--r-md,12px);padding:16px;box-shadow:var(--e-1,none)}'
      + '.thm-title{font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.015em;color:var(--text,#f4f4f7);margin:0 0 14px;font-family:var(--font-display,var(--font,system-ui));font-variation-settings:"wdth" 125}'
      + '.thm-bar{background:transparent;border:0;border-radius:0;padding:0;margin-bottom:8px}'
      + '.thm-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}'
      + '.thm-group{display:flex;flex-direction:column;gap:6px}'
      + '.thm-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3,#6b6b76);font-weight:700;line-height:1;font-family:var(--font,system-ui)}'
      + '.thm-pills{display:flex;flex-wrap:wrap;gap:10px}'
      + thmPillCss()
      + '.thm-pill.is-phase1{opacity:1}'
      + '.thm-note{font-size:15px;font-weight:600;color:var(--text-2,#a1a1aa);margin-top:6px;padding-top:0;border-top:0;line-height:1.6}'
      + '.thm-note.warn{color:var(--warn,#fbbf24)}'
      + '.thm-legend{display:flex;align-items:center;gap:9px;font-size:11px;color:#717892;margin-top:14px;font-family:var(--display);font-weight:600;letter-spacing:.04em;text-transform:uppercase}'
      + '.thm-table-wrap{overflow:auto;margin-top:12px}'
      + '.thm-table{width:100%;border-collapse:collapse}'
      + '.thm-table thead th{background:#0C0E18;color:#AEB4C6;font-family:var(--display);font-weight:800;font-size:13.5px;letter-spacing:.05em;text-transform:uppercase;padding:14px;border-bottom:1.5px solid #37405A;text-align:center;white-space:nowrap}'
      + '.thm-table thead th:first-child{text-align:left}'
      + '.thm-table thead th.sortable{cursor:pointer;user-select:none}'
      + '.thm-table tbody td{padding:0 14px;height:46px;border-bottom:1px solid rgba(255,255,255,.06);text-align:center;vertical-align:middle}'
      + '.thm-table tbody td:first-child{text-align:left}'
      + '.thm-table tbody tr:nth-child(even){background:rgba(255,255,255,.018)}'
      + '.thm-table tbody tr:hover{background:rgba(124,77,255,.10);box-shadow:inset 3px 0 0 #7C4DFF}'
      + '.thm-table td.numcol{width:1%;white-space:nowrap}'
      + '.thm-rel{display:inline-block;font-size:12px;font-weight:700;text-align:center;letter-spacing:.01em}'
      + '.thm-rel--rise{color:#1FB866}'
      + '.thm-rel--stable{color:#AEB4C6}'
      + '.thm-rel--decline{color:#E0392E}'
      + '.thm-rel--spike{color:#C9A21E}'
      + '.thm-rel--noisy{color:#717892}'
      + '.thm-team{display:flex;align-items:center;gap:11px;padding:0;color:#F6F8FC;font-family:var(--display)}'
      + '.thm-team strong{font-size:15px;font-weight:800;letter-spacing:.02em}'
      + '.thm-team-logo{width:28px;height:28px;border-radius:0!important;object-fit:contain;background:transparent!important;border:0!important}'
      + '.thm-delta{font-weight:800;text-align:center;white-space:nowrap;font-size:15px;font-family:var(--display);font-variant-numeric:tabular-nums}'
      + '.thm-delta-up{color:#1FB866}.thm-delta-down{color:#E0392E}.thm-delta-flat{color:#717892}'
      + '.thm-legend-bar{width:130px;height:10px;border-radius:5px;overflow:hidden;display:flex}'
      + '.thm-legend-bar i{flex:1;background:#1FB866}'
      + '.thm-legend-bar i:nth-child(2){background:#5FB83C}.thm-legend-bar i:nth-child(3){background:#C9A21E}'
      + '.thm-legend-bar i:nth-child(4){background:#E0762E}.thm-legend-bar i:nth-child(5){background:#E0392E}';
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

  function rankFamilyForMetric(metricKey) {
    if (metricKey === 'winPct' || metricKey === 'f5WinPct') return 'surface';
    if (metricKey === 'pitchScoreFaced') return 'difficulty';
    return 'scoring';
  }

  function ensureHeatmapStore(state) {
    if (!LM || !LM.fetchAll) return Promise.resolve();
    var fam = rankFamilyForMetric(state && state.metric);
    var opts = { needPals: fam === 'difficulty' || fam === 'status', needL10SpHand: fam === 'difficulty' };
    if (fam === 'surface') opts.needTeamResults = true;
    return LM.fetchAll(opts);
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
    var family = rankFamilyForMetric(state.metric);
    return ensureHeatmapStore(state).then(function() {
      return LM.rankAll(filter, family).then(function(rows) { return rows || []; });
    });
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
      (ytd || []).forEach(function(r) {
        var t = teamKey(r.t);
        if (t) by[t] = { t: t };
      });
      [l30, l14, l7].forEach(function(rows) {
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
        by[t].ytd = num(y[sourceKey]) != null ? num(y[sourceKey]) : num(y.pitchScore);
        by[t].l30 = num(a[sourceKey]) != null ? num(a[sourceKey]) : num(a.pitchScore);
        by[t].l14 = num(b[sourceKey]) != null ? num(b[sourceKey]) : num(b.pitchScore);
        by[t].l7 = num(c[sourceKey]) != null ? num(c[sourceKey]) : num(c.pitchScore);
        by[t].delta = by[t].ytd != null && by[t].l7 != null ? by[t].l7 - by[t].ytd : null;
        by[t].velocity = computeVelocity(by[t]);
        by[t].trend = trendLabel(by[t]);
        by[t].reliability = reliabilityLabel(by[t]);
        by[t].reliabilityScore = reliabilityRank(by[t].reliability);
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
  function reliabilityClass(label) {
    var key = String(label || 'Noisy');
    if (key === 'Sustained Rise') return 'thm-rel--rise';
    if (key === 'Declining') return 'thm-rel--decline';
    if (key === 'Short Spike') return 'thm-rel--spike';
    if (key === 'Stable' || key === 'Stable Elite') return 'thm-rel--stable';
    return 'thm-rel--noisy';
  }
  function metricColor(value, metricKey, invert) {
    var n = num(value);
    if (n == null) return null;
    if (A && A.metricColor) return A.metricColor(n, metricKey || 'osi', !!invert);
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
    return '<img class="thm-team-logo" src="https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/' + espn + '.png&w=64&h=64" width="28" height="28" alt="' + esc(t) + '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">';
  }

  function metricPill(metric, state) {
    var on = state.metric === metric.key;
    return '<button type="button" class="ca-pill-btn thm-pill' + (on ? ' active' : '') + (metric.phase ? ' is-phase1' : '') + '" data-a="metric" data-v="' + metric.key + '"' + (metric.phase ? ' title="Proxy metric until Phase 1 feed"' : '') + '>'
      + esc(metric.label) + '</button>';
  }
  function choicePill(group, key, val, label, state) {
    var on = state[key] === val;
    return '<button type="button" class="ca-pill-btn thm-pill' + (on ? ' active' : '') + '" data-a="' + group + '" data-v="' + val + '">' + esc(label) + '</button>';
  }

  function render(root, state) {
    ensureStyles();
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
      + '<div class="thm-legend"><span>Elite</span><span class="thm-legend-bar"><i></i><i></i><i></i><i></i><i></i></span><span>Poor</span></div>'
      + '</div><div class="thm-table-wrap"><div class="thm-note">Loading trends heat map...</div></div></div>';

    buildRows(state).then(function(rows) {
      var sorted = sortedRows(rows, state);
      var metricDef = METRICS.find(function(m) { return m.key === state.metric; }) || {};
      var colorKey = metricDef.colorCtx || metricDef.sourceKey || state.metric;
      var colorInvert = !!metricDef.invert;
      var head = '<table class="thm-table"><thead><tr>'
        + '<th class="sortable" data-a="sort" data-k="team">Team' + sortArrow(state, 'team') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="ytd">YTD' + sortArrow(state, 'ytd') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l30">L30' + sortArrow(state, 'l30') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l14">L14' + sortArrow(state, 'l14') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l7">L7' + sortArrow(state, 'l7') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="delta">Δ L7-YTD' + sortArrow(state, 'delta') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="velocity">Velocity' + sortArrow(state, 'velocity') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="reliability">Reliability' + sortArrow(state, 'reliability') + '</th>'
        + '</tr></thead><tbody>';
      var body = sorted.map(function(r) {
        function cell(v, digits) {
          if (A && A.valChipHtml) {
            return '<td class="numcol">' + A.valChipHtml(v, colorKey, colorInvert, digits == null ? 1 : digits) + '</td>';
          }
          if (v == null) return '<td class="numcol"><span class="chip c-na">—</span></td>';
          return '<td class="numcol"><span class="chip c-mid">' + Number(v).toFixed(digits == null ? 1 : digits) + '</span></td>';
        }
        function deltaChip(v) {
          if (v == null) return '<td class="numcol">' + (A && A.chipPlaceholderHtml ? A.chipPlaceholderHtml('—') : '<span class="chip c-na">—</span>') + '</td>';
          var display = (v > 0 ? '+' : '') + Number(v).toFixed(1);
          var cls = v > 1.5 ? 'c-good' : v < -1.5 ? 'c-poor' : 'c-mid';
          return '<td class="numcol"><span class="chip ' + cls + '">' + display + '</span></td>';
        }
        var vel = num(r.velocity);
        var velDisplay = vel == null ? '—' : (vel > 0 ? '+' : '') + vel.toFixed(2);
        var velCls = vel == null ? 'c-na' : (vel > 0.6 ? 'c-good' : vel < -0.6 ? 'c-poor' : 'c-mid');
        return '<tr>'
          + '<td><div class="thm-team team-cell-bold">' + teamLogo(r.t) + '<strong class="ab">' + esc(r.t) + '</strong></div></td>'
          + cell(r.ytd, 1)
          + cell(r.l30, 1)
          + cell(r.l14, 1)
          + cell(r.l7, 1)
          + deltaChip(r.delta)
          + '<td class="numcol"><span class="chip ' + velCls + '">' + esc(velDisplay) + '</span></td>'
          + '<td><span class="thm-rel ' + reliabilityClass(r.reliability) + '">' + esc(r.reliability || 'Noisy') + '</span></td>'
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
    if (LM && LM.onUpdate) {
      LM.onUpdate(function(reason) {
        if (reason === 'l10SpHand' || reason === 'pals') render(el, state);
      });
    }
    _mounted = {
      rerender: function() { render(el, state); },
      getState: function() { return JSON.parse(JSON.stringify(state)); }
    };
    return _mounted;
  }

  global.TrendsHeatmap = { mount: mount, rerender: function() { if (_mounted) _mounted.rerender(); } };
  global.renderTrendHeatmap = function() { if (_mounted) _mounted.rerender(); };
})(typeof window !== 'undefined' ? window : this);
