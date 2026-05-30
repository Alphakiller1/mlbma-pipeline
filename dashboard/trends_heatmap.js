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
      + '.thm-title{font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:var(--text,#f4f4f7);margin:0 0 14px}'
      + '.thm-bar{background:transparent;border:0;border-radius:0;padding:0;margin-bottom:8px}'
      + '.thm-row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center}'
      + '.thm-group{display:flex;flex-direction:column;gap:6px}'
      + '.thm-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3,#6b6b76);font-weight:600;line-height:1}'
      + '.thm-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.thm-pill{border:0.5px solid var(--border,#26262f);background:var(--surface-2,#14141e);color:var(--text-2,#a1a1aa);font-size:12px;font-weight:700;padding:7px 14px;border-radius:var(--r-pill,999px);cursor:pointer;line-height:1.1}'
      + '.thm-pill:hover{border-color:var(--border-2,#34343d);color:var(--text,#f4f4f7)}'
      + '.thm-pill.active{background:var(--accent-bg,rgba(139,92,246,.14));border-color:transparent;color:var(--accent-l,#c4b5fd)}'
      + '.thm-pill.is-phase1{opacity:.78;color:var(--text-2,#a1a1aa);background:var(--surface-2,#14141e);border-color:var(--border,#26262f)}'
      + '.thm-pill .thm-phase{margin-left:4px;color:var(--text-3,#6b6b76);font-size:10px}'
      + '.thm-note{font-size:13px;color:var(--text-2,#a1a1aa);margin-top:6px;padding-top:0;border-top:0;line-height:1.25}'
      + '.thm-note.warn{color:var(--warn,#fbbf24)}'
      + '.thm-table-wrap{overflow:auto;border:0;border-radius:0;background:transparent}'
      + '.thm-table{width:100%;border-collapse:separate;border-spacing:8px 6px;font-size:14px}'
      + '.thm-table thead th{background:var(--surface-2,#14141e);color:var(--text-3,#6b6b76);font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;border-radius:var(--r-sm,8px);text-align:left;white-space:nowrap;font-weight:700}'
      + '.thm-table thead th.sortable{cursor:pointer;user-select:none}'
      + '.thm-cell{padding:12px 12px;border-radius:var(--r-sm,8px);font-weight:700;color:var(--bg,#050509);min-width:120px;text-align:center;font-size:13px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.02);font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.thm-cell.no-data{background:repeating-linear-gradient(45deg,color-mix(in srgb, var(--text-3,#6b6b76) 24%, transparent),color-mix(in srgb, var(--text-3,#6b6b76) 24%, transparent) 8px,color-mix(in srgb, var(--text-3,#6b6b76) 10%, transparent) 8px,color-mix(in srgb, var(--text-3,#6b6b76) 10%, transparent) 16px);color:var(--text-3,#6b6b76)}'
      + '.thm-team{display:flex;align-items:center;gap:8px;padding:0 6px;min-width:120px;color:var(--text,#f4f4f7)}'
      + '.thm-team strong{font-size:13px}'
      + '.thm-team-logo{width:24px;height:24px;border-radius:50%;object-fit:contain;background:var(--surface-2,#14141e);border:0.5px solid var(--border,#26262f)}'
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
      + esc((state.metric.toUpperCase() + ' trend · ' + state.hand.toUpperCase() + ' · ' + state.location + ' locations · color = value · read left→right for movement'))
      + (splitWarn ? ' · windowed split columns unavailable; using all-context window values with split fallback.' : '')
      + (phase1Mode ? ' · Phase 1 metric: showing current proxy model values until dedicated feed is connected.' : '')
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
          + '<td class="thm-delta ' + deltaClass(r.delta) + '" style="color:' + (vibrantColor(r.delta, deltaRange) || 'var(--text-3,#6b6b76)') + '">' + esc(deltaText(r.delta)) + '</td>'
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
