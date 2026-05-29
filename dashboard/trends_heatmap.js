// trends_heatmap.js — distinct Trends Heat Map surface
(function(global) {
  'use strict';

  var LM = global.LineupModel || global.MLBMALineupModel || null;
  var A = global.MLBMAAssets || null;
  var MS = global.MLBMASharedMatchup || {};
  var _mounted = null;
  var _poolSeeded = {};

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
      + '.thm-wrap{margin-top:12px}'
      + '.thm-bar{background:#111114;border:1px solid #28282f;border-radius:12px;padding:12px 14px;margin-bottom:10px}'
      + '.thm-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:flex-start}'
      + '.thm-group{display:flex;flex-direction:column;gap:6px}'
      + '.thm-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:600}'
      + '.thm-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.thm-pill{border:1px solid #28282f;background:#18181c;color:#a1a1aa;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer}'
      + '.thm-pill:hover{border-color:rgba(192,132,252,.4);color:#f4f4f7}'
      + '.thm-pill.active{background:rgba(192,132,252,.18);border-color:#c084fc;color:#c084fc}'
      + '.thm-pill[disabled]{opacity:.45;cursor:not-allowed}'
      + '.thm-pill .thm-phase{margin-left:6px;color:#fbbf24;font-size:10px}'
      + '.thm-note{font-size:12px;color:#a1a1aa;margin-top:8px;padding-top:8px;border-top:1px solid #28282f}'
      + '.thm-note.warn{color:#fbbf24}'
      + '.thm-table-wrap{overflow:auto;border:1px solid #28282f;border-radius:12px;background:#111114}'
      + '.thm-table{width:100%;border-collapse:separate;border-spacing:4px;font-size:13px}'
      + '.thm-table thead th{background:#18181c;color:#a1a1aa;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:8px 10px;border-radius:8px;text-align:left;white-space:nowrap}'
      + '.thm-table thead th.sortable{cursor:pointer;user-select:none}'
      + '.thm-cell{padding:10px 10px;border-radius:8px;font-weight:700;color:#050506;min-width:84px;text-align:center}'
      + '.thm-cell.no-data{background:repeating-linear-gradient(45deg,rgba(113,113,122,.18),rgba(113,113,122,.18) 8px,rgba(113,113,122,.08) 8px,rgba(113,113,122,.08) 16px);color:#a1a1aa}'
      + '.thm-team{display:flex;align-items:center;gap:8px;padding:0 6px;min-width:108px}'
      + '.thm-team-logo{width:20px;height:20px;border-radius:50%;object-fit:contain;background:#0a0a0a;border:1px solid #28282f}'
      + '.thm-delta{font-weight:700;text-align:right;padding-right:8px;white-space:nowrap}'
      + '.thm-delta-up{color:#84cc16}.thm-delta-down{color:#f87171}.thm-delta-flat{color:#a1a1aa}';
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

  function seedLeaguePool(metricKey) {
    if (!A || !A.registerLeaguePool || !LM || !LM.leaguePool || _poolSeeded[metricKey]) return Promise.resolve();
    return LM.leaguePool(metricKey).then(function(pool) {
      if (pool && pool.values && pool.values.length) {
        A.registerLeaguePool(metricKey, pool.values);
        _poolSeeded[metricKey] = true;
      }
    });
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

  function metricColor(state, value) {
    if (value == null || !A || !A.metricColor) return null;
    return A.metricColor(value, state.metric, false);
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
    root.innerHTML = '<div class="thm-wrap"><div class="thm-bar">'
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

    seedLeaguePool(state.metric).then(function() {
      return buildRows(state);
    }).then(function(rows) {
      var sorted = sortedRows(rows, state);
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
          var c = metricColor(state, v);
          var txt = Number(v).toFixed(digits == null ? 1 : digits);
          return '<td><div class="thm-cell" style="' + (c ? ('background:' + c + ';') : '') + '">' + txt + '</div></td>';
        }
        return '<tr>'
          + '<td><div class="thm-team">' + teamLogo(r.t) + '<strong>' + esc(r.t) + '</strong></div></td>'
          + cell(r.ytd, 1)
          + cell(r.l30, 1)
          + cell(r.l14, 1)
          + cell(r.l7, 1)
          + '<td class="thm-delta ' + deltaClass(r.delta) + '">' + esc(deltaText(r.delta)) + '</td>'
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
