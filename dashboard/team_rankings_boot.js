// team_rankings_boot.js — instant Team Rankings table from static snapshot (no deps)
(function (global) {
  'use strict';

  var FAMILY_DEFS = {
    surface: [
      { key: 'winPct', label: 'Win%', digits: 1 },
      { key: 'f5WinPct', label: 'F5 Win%', digits: 1 },
      { key: 'pitcherWinPct', label: 'Pitcher W%', digits: 1 }
    ],
    scoring: [
      { key: 'osi', label: 'OSI', digits: 1 },
      { key: 'wrc', label: 'wRC+', digits: 0 },
      { key: 'woba', label: 'wOBA', digits: 3 },
      { key: 'rcv', label: 'RCV', digits: 1 }
    ],
    difficulty: [
      { key: 'abq', label: 'ABQ', digits: 1 },
      { key: 'obr', label: 'OBR', digits: 1 },
      { key: 'qs', label: 'QS% Allowed', digits: 1 },
      { key: 'pitchInn', label: 'Pitch/Inn', digits: 1 },
      { key: 'pitchScore', label: 'Pitch Score Against', digits: 1 }
    ],
    status: [
      { key: 'projOSI', label: 'projOSI', digits: 1 },
      { key: 'ppGap', label: 'PP-Gap', digits: 1 },
      { key: 'pals', label: 'PALS', digits: 1 },
      { key: 'xwoba', label: 'xwOBA', digits: 3 },
      { key: 'xfip', label: 'xFIP Faced', digits: 2 }
    ]
  };

  var DEFAULT_FILTER = {
    hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    return v == null || v === '' || isNaN(v) ? null : Number(v);
  }

  function fmt(v, d) {
    var n = num(v);
    if (n == null) return '—';
    if (d === 0) return String(Math.round(n));
    return n.toFixed(d == null ? 1 : d);
  }

  function isDefaultFilter(f) {
    if (!f) return false;
    return f.hand === 'both' && f.location === 'all' && f.pitcher === 'both'
      && f.batSide === 'both' && f.segment === 'full' && f.window === 'YTD';
  }

  function stateFromUrl() {
    var p = new URLSearchParams(location.search);
    var family = String(p.get('family') || 'surface').toLowerCase();
    if (!FAMILY_DEFS[family]) family = 'surface';
    var sortKey = String(p.get('sort') || (family === 'surface' ? 'winPct' : family === 'scoring' ? 'osi' : family === 'difficulty' ? 'abq' : 'projOSI'));
    var sortDir = String(p.get('dir') || 'desc').toLowerCase();
    if (sortDir !== 'asc' && sortDir !== 'desc') sortDir = 'desc';
    return {
      filter: {
        hand: p.get('hand') || DEFAULT_FILTER.hand,
        location: p.get('loc') || DEFAULT_FILTER.location,
        pitcher: p.get('pitch') || DEFAULT_FILTER.pitcher,
        batSide: p.get('side') || DEFAULT_FILTER.batSide,
        segment: p.get('seg') || DEFAULT_FILTER.segment,
        window: p.get('window') || DEFAULT_FILTER.window
      },
      family: family,
      sortKey: sortKey,
      sortDir: sortDir
    };
  }

  function pickPack(snap, state) {
    if (!snap || !snap.families || !isDefaultFilter(state.filter)) return null;
    return snap.families[state.family] || snap.families.surface || null;
  }

  function sortRows(rows, sortKey, sortDir) {
    var out = (rows || []).slice();
    out.sort(function (a, b) {
      var av = num(a[sortKey]);
      var bv = num(b[sortKey]);
      if (av == null && bv == null) return String(a.t).localeCompare(String(b.t));
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return String(a.t).localeCompare(String(b.t));
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });
    return out;
  }

  function dismissLoading() {
    var l = document.getElementById('hubLoading');
    if (l) l.classList.add('hide');
  }

  function ensureBootStyles() {
    if (document.getElementById('lvBootStyles')) return;
    var style = document.createElement('style');
    style.id = 'lvBootStyles';
    style.textContent = ''
      + '.lv-wrap{margin-top:14px}'
      + '.lv-bar{background:var(--bg-3,#16161D);border:1px solid var(--border,#2A2A35);border-radius:16px;padding:16px;margin-bottom:14px}'
      + '.lv-note{font-size:12px;color:var(--text-2,#a1a1aa);padding:8px 4px}'
      + '.lv-table-wrap{overflow:auto}'
      + '.lv-table{width:100%;border-collapse:collapse}'
      + '.lv-table thead th{background:#0C0E18;color:#AEB4C6;font-weight:800;font-size:13.5px;padding:14px;border-bottom:1.5px solid #37405A;text-align:center;white-space:nowrap;position:sticky;top:0;z-index:2}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){text-align:left}'
      + '.lv-table thead th.sorted{background:rgba(124,77,255,.16);color:#9A6BFF}'
      + '.lv-table td.sort-col{background:rgba(124,77,255,.05)}'
      + '.lv-table td{padding:0 14px;height:46px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle;text-align:center;color:var(--text,#F5F5F7)}'
      + '.lv-table td:first-child,.lv-table td:nth-child(2){text-align:left}'
      + '.lv-table td.num{white-space:nowrap}'
      + '.lv-rank-num{font-weight:800;font-size:15px;color:#717892;font-variant-numeric:tabular-nums}'
      + '.lv-team-cell strong{font-weight:800;font-size:14px;color:var(--text,#f4f4f7)}'
      + '.lv-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.018)}'
      + '.chip{display:inline-block;padding:4px 8px;border-radius:6px;font-weight:700;font-variant-numeric:tabular-nums;background:rgba(113,113,122,.25);color:var(--text,#f4f4f7)}';
    document.head.appendChild(style);
  }

  function renderTable(mount, state, rows) {
    var defs = FAMILY_DEFS[state.family] || FAMILY_DEFS.surface;
    var sorted = sortRows(rows, state.sortKey, state.sortDir);
    var head = '<tr><th>#</th><th>Team</th>' + defs.map(function (def) {
      var sortedCol = state.sortKey === def.key;
      var arrow = sortedCol ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      return '<th class="lv-sortable' + (sortedCol ? ' sorted' : '') + '">' + esc(def.label) + arrow + '</th>';
    }).join('') + '</tr>';
    var body = sorted.map(function (r, idx) {
      var cols = defs.map(function (def) {
        return '<td class="num' + (state.sortKey === def.key ? ' sort-col' : '') + '">'
          + '<span class="chip c-mid">' + fmt(r[def.key], def.digits) + '</span></td>';
      }).join('');
      return '<tr class="lv-row-team" data-team="' + esc(r.t) + '"><td class="lv-rank-num">' + (idx + 1)
        + '</td><td><span class="lv-team-cell team-cell-bold"><strong class="ab">' + esc(r.t) + '</strong></span></td>'
        + cols + '</tr>';
    }).join('');
    mount.innerHTML = '<div class="lv-table-wrap"><table class="lv-table lv-table--boot"><thead>' + head
      + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function paint(snap) {
    if (global.__MLBMA_RANKINGS_BOOT_DONE) return;
    var root = document.getElementById('lineupViewMount');
    if (!root) return;
    // Never clobber a fully mounted LineupView (boot fetch can finish after mount).
    if (global.__lineupViewReady || global.__MLBMA_LINEUP_VIEW_ACTIVE) return;
    if (root.querySelector('.lv-family-grid')) return;

    var pack = pickPack(snap, stateFromUrl());
    if (!pack || !pack.rows || !pack.rows.length) return;

    ensureBootStyles();
    var state = stateFromUrl();
    if (!state.sortKey && pack.sortKey) state.sortKey = pack.sortKey;
    if (!state.sortDir && pack.sortDir) state.sortDir = pack.sortDir;

    var wrap = document.createElement('div');
    wrap.className = 'lv-wrap lv-wrap--boot';
    wrap.innerHTML = '<div class="lv-bar"><div class="lv-controls"><p class="lv-note lv-note--boot">Loading filters…</p></div></div><div class="lv-body"></div>';
    root.innerHTML = '';
    root.appendChild(wrap);
    renderTable(wrap.querySelector('.lv-body'), state, pack.rows);

    global.__MLBMA_RANKINGS_SNAPSHOT = snap;
    global.__MLBMA_RANKINGS_BOOT_DONE = true;
    global.__lineupViewMounted = true;
    global.__lineupViewReady = true;
    dismissLoading();
    if (global.console && console.info) {
      console.info('[PERF] Team Rankings boot snapshot painted', pack.rows.length, 'rows');
    }
  }

  function start() {
    var promise = global.__MLBMA_SNAPSHOT_PROMISE;
    if (!promise || !promise.then) return;
    promise.then(function (snap) {
      global.__MLBMA_RANKINGS_SNAPSHOT = global.__MLBMA_RANKINGS_SNAPSHOT || snap;
      if (document.getElementById('lineupViewMount')) {
        paint(snap);
      } else {
        document.addEventListener('DOMContentLoaded', function () { paint(snap); });
      }
    }).catch(function () { /* live path handles miss */ });
  }

  start();
})(typeof window !== 'undefined' ? window : this);
