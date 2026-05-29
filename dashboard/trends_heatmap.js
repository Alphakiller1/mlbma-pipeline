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
    { key: 'winPct', label: 'Win%', disabled: true, reason: 'Phase 1' },
    { key: 'f5WinPct', label: 'F5 Win%', disabled: true, reason: 'Phase 1' },
    { key: 'pitchScoreFaced', label: 'PitchScore Faced', disabled: true, reason: 'Phase 1' },
    { key: 'rcv', label: 'RCV', disabled: false, colorCtx: 'rcv' },
    { key: 'obr', label: 'OBR', disabled: false, colorCtx: 'obr' }
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
      + '.thm-wrap{margin-top:8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:14px;padding:16px}'
      + '.thm-title{font-size:44px;line-height:1;font-weight:800;letter-spacing:-.02em;color:rgba(17,24,39,.08);margin:0 0 10px}'
      + '.thm-bar{background:transparent;border:0;border-radius:0;padding:0;margin-bottom:8px}'
      + '.thm-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}'
      + '.thm-group{display:flex;flex-direction:column;gap:6px}'
      + '.thm-label{font-size:13px;letter-spacing:0;color:#6b7280;font-weight:500;line-height:1}'
      + '.thm-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.thm-pill{border:1px solid #d1d5db;background:#f8fafc;color:#9ca3af;font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;cursor:pointer;line-height:1.1}'
      + '.thm-pill:hover{border-color:#94a3b8;color:#64748b}'
      + '.thm-pill.active{background:#27436a;border-color:#27436a;color:#93c5fd}'
      + '.thm-pill[disabled]{opacity:.55;cursor:not-allowed;color:#d1d5db;background:#f3f4f6}'
      + '.thm-pill .thm-phase{margin-left:4px;color:#d1d5db;font-size:10px}'
      + '.thm-note{font-size:13px;color:#6b7280;margin-top:6px;padding-top:0;border-top:0;line-height:1.25}'
      + '.thm-note.warn{color:#9ca3af}'
      + '.thm-table-wrap{overflow:auto;border:0;border-radius:0;background:transparent}'
      + '.thm-table{width:100%;border-collapse:separate;border-spacing:8px 6px;font-size:14px}'
      + '.thm-table thead th{background:transparent;color:#6b7280;font-size:13px;text-transform:none;letter-spacing:0;padding:6px 6px;border-radius:0;text-align:left;white-space:nowrap;font-weight:700}'
      + '.thm-table thead th.sortable{cursor:pointer;user-select:none}'
      + '.thm-cell{padding:12px 12px;border-radius:10px;font-weight:700;color:#0b0f14;min-width:120px;text-align:center;font-size:13px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.02)}'
      + '.thm-cell.no-data{background:repeating-linear-gradient(45deg,rgba(148,163,184,.24),rgba(148,163,184,.24) 8px,rgba(148,163,184,.1) 8px,rgba(148,163,184,.1) 16px);color:#64748b}'
      + '.thm-team{display:flex;align-items:center;gap:8px;padding:0 6px;min-width:120px;color:#111827}'
      + '.thm-team strong{font-size:13px}'
      + '.thm-team-logo{width:24px;height:24px;border-radius:50%;object-fit:contain;background:#f8fafc;border:1px solid #cbd5e1}'
      + '.thm-delta{font-weight:800;text-align:right;padding-right:8px;white-space:nowrap;font-size:13px}'
      + '.thm-delta-up{color:#84cc16}.thm-delta-down{color:#f87171}.thm-delta-flat{color:#94a3b8}';
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
        var m = state.metric;
        by[t].ytd = num(y[m]);
        by[t].l30 = num(a[m]);
        by[t].l14 = num(b[m]);
        by[t].l7 = num(c[m]);
        by[t].delta = by[t].ytd != null && by[t].l7 != null ? by[t].l7 - by[t].ytd : null;
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
    if (A && A.teamLogoImg) return A.teamLogoImg(team, 20, 'thm-team-logo');
    return '';
  }

  function metricPill(metric, state) {
    var on = state.metric === metric.key;
    return '<button class="thm-pill' + (on ? ' active' : '') + '" data-a="metric" data-v="' + metric.key + '"' + (metric.disabled ? ' disabled title="Phase 1 metric"' : '') + '>'
      + esc(metric.label) + (metric.disabled ? '<span class="thm-phase">Phase 1</span>' : '') + '</button>';
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
      + '<div class="thm-note' + (splitWarn ? ' warn' : '') + '">'
      + esc((state.metric.toUpperCase() + ' trend · ' + state.hand.toUpperCase() + ' · ' + state.location + ' locations · color = value · read left→right for movement'))
      + (splitWarn ? ' · windowed split columns unavailable; using all-context window values with split fallback.' : '')
      + '</div>'
      + '</div><div class="thm-table-wrap"><div class="thm-note">Loading trends heat map...</div></div></div>';

    buildRows(state).then(function(rows) {
      var sorted = sortedRows(rows, state);
      var valueRange = minMax([].concat(
        sorted.map(function(r) { return r.ytd; }),
        sorted.map(function(r) { return r.l30; }),
        sorted.map(function(r) { return r.l14; }),
        sorted.map(function(r) { return r.l7; })
      ));
      var deltaRange = minMax(sorted.map(function(r) { return r.delta; }));
      var head = '<table class="thm-table"><thead><tr>'
        + '<th class="sortable" data-a="sort" data-k="team">Team' + sortArrow(state, 'team') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="ytd">YTD' + sortArrow(state, 'ytd') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l30">L30' + sortArrow(state, 'l30') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l14">L14' + sortArrow(state, 'l14') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="l7">L7' + sortArrow(state, 'l7') + '</th>'
        + '<th class="sortable" data-a="sort" data-k="delta">Δ L7-YTD' + sortArrow(state, 'delta') + '</th>'
        + '</tr></thead><tbody>';
      var body = sorted.map(function(r) {
        function cell(v, digits) {
          if (v == null) return '<td><div class="thm-cell no-data">—</div></td>';
          var c = vibrantColor(v, valueRange);
          var txt = Number(v).toFixed(digits == null ? 1 : digits);
          return '<td><div class="thm-cell" style="' + (c ? ('background:' + c + ';') : '') + '">' + txt + '</div></td>';
        }
        return '<tr>'
          + '<td><div class="thm-team">' + teamLogo(r.t) + '<strong>' + esc(r.t) + '</strong></div></td>'
          + cell(r.ytd, 1)
          + cell(r.l30, 1)
          + cell(r.l14, 1)
          + cell(r.l7, 1)
          + '<td class="thm-delta ' + deltaClass(r.delta) + '" style="color:' + (vibrantColor(r.delta, deltaRange) || '#94a3b8') + '">' + esc(deltaText(r.delta)) + '</td>'
          + '</tr>';
      }).join('');
      root.querySelector('.thm-table-wrap').innerHTML = head + body + '</tbody></table>';
    }).catch(function(err) {
      root.querySelector('.thm-table-wrap').innerHTML = '<div class="thm-note" style="color:#f87171">Heat map render error: ' + esc(err && err.message ? err.message : String(err)) + '</div>';
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
          if (!def || def.disabled) return;
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
