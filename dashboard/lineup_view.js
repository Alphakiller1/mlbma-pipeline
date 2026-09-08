// lineup_view.js — Team Rankings unified view (Phase 0)
(function(global) {
  'use strict';

  var MS = global.MLBMASharedMatchup || {};
  var LM = global.LineupModel || global.MLBMALineupModel || null;
  var A = global.MLBMAAssets || null;
  var CFG = global.MLBMA_CONFIG || {};

  var DEFAULTS = {
    filter: (CFG.FILTER_DEFAULTS || { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' }),
    family: 'surface',
    sortKey: 'winPct',
    sortDir: 'desc'
  };

  var FAMILY_DEFS = {
    surface: [
      { key: 'winPct', label: 'Win%', digits: 1, tier: 'core', sanity: [0, 100] },
      { key: 'f5WinPct', label: 'F5 Win%', digits: 1, tier: 'core', sanity: [0, 100] },
      { key: 'pitcherWinPct', label: 'Pitcher W%', digits: 1, tier: 'core', sanity: [0, 100] }
    ],
    scoring: [
      { key: 'osi', label: 'OSI', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'wrc', label: 'wRC+', digits: 0, tier: 'core', sanity: [40, 200] },
      { key: 'woba', label: 'wOBA', digits: 3, tier: 'core', sanity: [0.25, 0.45] },
      { key: 'rcv', label: 'RCV', digits: 1, tier: 'core', sanity: [0, 150] }
    ],
    difficulty: [
      { key: 'abq', label: 'ABQ', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'obr', label: 'OBR', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'qs', label: 'QS% Allowed', digits: 1, tier: 'core', sanity: [0, 100] },
      { key: 'pitchInn', label: 'Pitch/Inn', digits: 1, tier: 'core', sanity: [8, 30] },
      { key: 'pitchScore', label: 'Pitch Score Against', digits: 1, tier: 'core', sanity: [0, 150] }
    ],
    status: [
      { key: 'projOSI', label: 'projOSI', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'ppGap', label: 'PP-Gap', digits: 1, tier: 'core', sanity: [-75, 75] },
      { key: 'pals', label: 'PALS', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'xwoba', label: 'xwOBA', digits: 3, tier: 'core', sanity: [0.25, 0.45] },
      { key: 'xfip', label: 'xFIP Faced', digits: 2, tier: 'core', sanity: [3.0, 5.5] }
    ]
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function num(v) { return v == null || v === '' || isNaN(v) ? null : Number(v); }
  function teamKey(t) { return MS.teamKey ? MS.teamKey(t) : String(t || '').trim().toUpperCase(); }

  function ensureStyles() {
    if (document.getElementById('lineupViewStyles')) return;
    var style = document.createElement('style');
    style.id = 'lineupViewStyles';
    style.textContent = ''
      + '.lv-wrap{margin-top:14px}'
      + '.lv-bar{background:var(--bg-3);border:1px solid var(--border);border-radius:16px;padding:16px 16px 14px;margin-bottom:14px;box-shadow:var(--e-1)}'
      + '.lv-sec.ca-section-head{margin:4px 0 12px}'
      + '.lv-sec.ca-section-head--rule{margin:4px 0 12px}'
      + '.lv-sec{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin:4px 0 12px;font-family:var(--display,var(--font,system-ui))}'
      + '.lv-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:flex-start}'
      + '.lv-group{display:flex;flex-direction:column;gap:6px}'
      + '.lv-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);font-weight:700;font-family:var(--font,system-ui)}'
      + '.lv-pills{display:flex;flex-wrap:wrap;gap:10px}'
      + '.lv-pill[disabled],.lv-disabled .lv-pill{opacity:.45;cursor:not-allowed}'
      + '.lv-query{font-size:13.5px;font-weight:600;color:var(--text-2);margin:18px 0 0;line-height:1.6;display:flex;align-items:center;flex-wrap:wrap;gap:8px}'
      + '.lv-query strong{font-family:var(--mono,monospace);font-variant-numeric:tabular-nums;color:var(--text)}'
      + '.lv-family-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:8px 0 14px;align-items:stretch}'
      + '@media(max-width:1040px){.lv-family-grid{grid-template-columns:repeat(2,minmax(220px,1fr))}}'
      + '.lv-family{display:flex;flex-direction:column;position:relative;background:var(--bg-3);border:1px solid var(--border);border-radius:16px;padding:20px 20px 16px;cursor:pointer;overflow:hidden;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;color:var(--text);appearance:none;-webkit-appearance:none;height:100%}'
      + '.lv-family::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(135deg,var(--accent), var(--ca-violet-700));opacity:0;transition:opacity .15s ease}'
      + '.lv-family:hover{border-color:var(--border-2);transform:translateY(-1px)}'
      + '.lv-family.active{background:var(--bg-4);border-color:color-mix(in srgb,var(--accent) 45%, var(--border));box-shadow:0 18px 50px -16px color-mix(in srgb,var(--accent) 45%, transparent)}'
      + '.lv-family.active::before{opacity:1}'
      + '.lv-family-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;min-height:56px;flex-shrink:0}'
      + '.lv-family-name{font-family:var(--font-display,var(--font,system-ui));font-size:23px;font-weight:800;letter-spacing:-.01em;line-height:1.2;color:var(--text)}'
      + '.lv-family-n{font-family:var(--mono,monospace);font-size:11px;color:var(--text-3);line-height:1.2;padding-top:4px;flex-shrink:0}'
      + '.lv-family-desc{font-size:14px;font-weight:500;color:var(--v-light);margin:10px 0 16px;line-height:1.55;letter-spacing:.01em;min-height:calc(14px * 1.55 * 2);flex-shrink:0}'
      + '.lv-family.active .lv-family-desc{color:#E8DCFF;font-weight:500}'
      + '.lv-family-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}'
      + '.lv-family-chip{font-family:var(--mono,monospace);font-size:11px;padding:5px 10px;border-radius:7px;background:var(--raised);border:1px solid var(--border);color:var(--text-2)}'
      + '.lv-family.active .lv-family-chip{background:var(--accent-bg);border-color:transparent;color:var(--accent-l)}'
      + '.lv-family-chip.phase{border-style:dashed;color:var(--text-3);background:transparent}'
      + '.lv-lens{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:8px;background:var(--bg-3);border:1px solid var(--border);border-radius:16px;padding:8px}'
      + '@media(max-width:960px){.lv-lens{grid-template-columns:1fr}}'
      + '.lv-cat{background:var(--bg-2);border:1px solid var(--border);border-radius:12px;padding:14px 14px 12px}'
      + '.lv-cat-h{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin-bottom:10px;font-family:var(--font,system-ui)}'
      + '.lv-cat-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}.lv-cat-row:last-child{margin-bottom:0}'
      + '.lv-cat-k{font-size:12px;color:var(--text-3);min-width:74px}'
      + '.lv-team-wrap{display:none}.lv-team-wrap.show{display:flex}'
      + '.lv-input{border:0.5px solid var(--border);background:var(--surface-2);color:var(--text);padding:7px 10px;border-radius:var(--r-sm);min-width:160px;font-size:12px;font-weight:600}'
      + '.lv-input-row{display:flex;gap:6px;align-items:center}'
      + '.lv-help{font-size:10px;color:var(--text-3)}.lv-help.error{color:var(--neg)}'
      + '.lv-table-wrap{overflow:auto}'
      + '.lv-table{width:100%;border-collapse:collapse;table-layout:fixed}'
      + '.lv-table thead th{background:#0C0E18;color:#AEB4C6;font-family:var(--display,var(--font,system-ui));font-weight:800;font-size:13.5px;letter-spacing:.05em;text-transform:uppercase;padding:14px;border-bottom:1.5px solid #37405A;text-align:center;white-space:nowrap;position:sticky;top:0;z-index:2}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){text-align:left}'
      + '.lv-table thead th.sorted{background:rgba(124,77,255,.16);color:#9A6BFF}'
      + '.lv-table td.sort-col{background:rgba(124,77,255,.05)}'
      + '.lv-table th.lv-sortable{cursor:pointer;user-select:none}'
      + '.lv-table th:first-child,.lv-table td:first-child{position:sticky;left:0;background:#10131F;z-index:1;width:44px;max-width:44px}'
      + '.lv-table th:nth-child(2),.lv-table td:nth-child(2){position:sticky;left:44px;background:#10131F;z-index:1;width:148px;max-width:148px}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){background:#0C0E18;z-index:3}'
      + '.lv-table td{padding:0 14px;height:46px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle;text-align:center;color:var(--text)}'
      + '.lv-table td:first-child,.lv-table td:nth-child(2){text-align:left}'
      + '.lv-table th.lv-sortable,.lv-table td.num{white-space:nowrap}'
      + '.lv-team-cell{display:flex;align-items:center;gap:11px;min-width:0;overflow:hidden}'
      + '.lv-team-cell .ab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
      + '.lv-rank-num{font-family:var(--display,var(--font,system-ui));font-weight:800;font-size:15px;color:#717892;font-variant-numeric:tabular-nums;text-align:center}'
      + '.lv-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.018)}'
      + '.lv-table tbody tr.lv-row-team:hover td{background:rgba(124,77,255,.10);box-shadow:inset 3px 0 0 var(--purple)}'
      + '.lv-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:12px}'
      + '.lv-infographic{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,1.2fr);gap:12px;margin-top:12px}'
      + '@media(max-width:980px){.lv-infographic{grid-template-columns:1fr}}'
      + '.lv-card{background:var(--surface-1);border:0.5px solid var(--border);border-radius:var(--r-sm);padding:12px 14px;display:flex;flex-direction:column;min-height:140px;box-shadow:var(--e-1)}'
      + '.lv-card-lab{font-size:11px;color:var(--text-2);letter-spacing:.06em;text-transform:uppercase}'
      + '.lv-card-val{font-size:36px;line-height:1.05;font-weight:800;color:var(--text);margin:8px 0;font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.lv-card-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-top:auto}'
      + '.lv-meter{height:6px;border-radius:var(--r-pill);background:color-mix(in srgb, var(--text-3) 22%, transparent);overflow:hidden;margin-top:8px}'
      + '.lv-meter>span{display:block;height:100%;background:var(--accent)}'
      + '.lv-phase{font-size:10px;color:var(--warn);margin-left:6px}'
      + '.lv-note{font-size:12px;color:var(--text-2);padding:14px}'
      + '.lv-banner{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.45;border:1px solid var(--border);background:var(--bg-2);color:var(--text-2)}'
      + '.lv-banner.warn{border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08);color:var(--gold)}'
      + '.lv-lg-rank{font-size:11px;color:var(--text-3);font-variant-numeric:tabular-nums;margin-left:6px;white-space:nowrap}'
      + '.lv-sort-pills{display:none;flex-wrap:wrap;gap:8px;margin:0 0 10px}'
      + '.lv-dual-cards{display:none;flex-direction:column;gap:10px}'
      + '.lv-team-card{background:var(--bg-3);border:1.5px solid var(--border);border-radius:14px;padding:12px 14px}'
      + '.lv-team-card-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}'
      + '.lv-team-card-rank{font-family:var(--display,var(--font,system-ui));font-weight:800;font-size:18px;color:var(--text-2);min-width:1.6em}'
      + '.lv-team-card-metrics{display:flex;flex-direction:column;gap:8px}'
      + '.lv-team-card-metric{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;font-size:13px}'
      + '.lv-team-card-metric .lab{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);min-width:7.5em}'
      + '.lv-league-expander{margin-top:4px;border:1.5px solid var(--border);border-radius:14px;padding:8px 12px 12px;background:var(--bg-2)}'
      + '.lv-league-expander>summary{cursor:pointer;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text);min-height:44px;display:flex;align-items:center}'
      + '.lv-matchup{margin:18px 0}.lv-matchup .lv-bar{margin-bottom:10px}'
      + '.lv-matchup-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}'
      + '.lv-matchup-control{display:flex;flex-direction:column;gap:6px}'
      + '.lv-matchup-control .lv-pills{gap:6px}'
      + '.lv-matchup-teams{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}'
      + '.lv-matchup-team{background:var(--bg-3);border:1px solid var(--border);border-radius:14px;padding:14px}'
      + '.lv-matchup-team-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}'
      + '.lv-matchup-team-context{font-size:12px;color:var(--text-2);margin-bottom:10px}'
      + '.lv-matchup-team-metrics{display:flex;flex-direction:column;gap:8px}'
      + '.lv-matchup-team-metric{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}'
      + '.lv-matchup-team-metric .lab{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}'
      + '.lv-matchup-overrides{display:flex;flex-wrap:wrap;gap:10px;padding:8px 0 12px}'
      + '.lv-matchup-note{font-size:12px;color:var(--text-2);margin:0 0 8px}'
      + '@media(max-width:700px){.lv-matchup-teams{grid-template-columns:1fr}}'
      + '.lv-matchup-context{margin:0 0 20px}'
      + '.lv-matchup-context > .mc-pane-title,.lv-matchup-context > .lv-matchup-heading{margin:0 0 8px;font-size:20px;line-height:1.2}'
      + '.lv-matchup-lede{font-size:13px;color:var(--text-2);margin:0 0 12px;max-width:720px;line-height:1.4}'
      + '.lv-matchup-context .lv-scope-host{margin:0 0 12px}'
      + '.ca-scopebar .hub-pill,.ca-scopebar .lv-pill{min-height:44px}'
      + '@media(max-width:767px){'
      + '.lv-sort-pills{display:flex}'
      + '.lv-dual-cards{display:flex}'
      + '.lv-league-expander .lv-table-wrap{display:none!important}'
      + '}';
    document.head.appendChild(style);
  }

  function normalizeFilter(f) {
    return MS.createFilterState ? MS.createFilterState(Object.assign({}, DEFAULTS.filter, f || {})) : Object.assign({}, DEFAULTS.filter, f || {});
  }
  function familyDefs(family) {
    return FAMILY_DEFS[family] || FAMILY_DEFS.scoring;
  }
  function defaultSortKeyForFamily(family) {
    var defs = familyDefs(family);
    var d = defs.find(function(x) { return !x.trend && !x.placeholder; });
    return d ? d.key : DEFAULTS.sortKey;
  }
  function normalizeSortState(state) {
    var defs = familyDefs(state.family);
    var allowed = {};
    defs.forEach(function(d) {
      if (!d.trend && !d.placeholder) allowed[d.key] = true;
    });
    if (!allowed[state.sortKey]) state.sortKey = defaultSortKeyForFamily(state.family);
    if (state.sortDir !== 'asc' && state.sortDir !== 'desc') state.sortDir = 'desc';
  }

  function stateFromUrl() {
    var p = new URLSearchParams(location.search);
    var f = normalizeFilter({
      hand: p.get('hand') || DEFAULTS.filter.hand,
      location: p.get('loc') || DEFAULTS.filter.location,
      pitcher: p.get('pitch') || DEFAULTS.filter.pitcher,
      batSide: p.get('side') || DEFAULTS.filter.batSide,
      segment: p.get('seg') || DEFAULTS.filter.segment,
      window: p.get('window') || DEFAULTS.filter.window
    });
    var family = String(p.get('family') || DEFAULTS.family).toLowerCase();
    if (!FAMILY_DEFS[family]) family = DEFAULTS.family;
    var st = {
      filter: f,
      family: family,
      sortKey: String(p.get('sort') || defaultSortKeyForFamily(family)),
      sortDir: String(p.get('dir') || DEFAULTS.sortDir).toLowerCase()
    };
    normalizeSortState(st);
    return st;
  }

  function writeUrl(state) {
    var f = state.filter;
    var current = new URLSearchParams(location.search);
    var defaults = {
      hand: DEFAULTS.filter.hand,
      loc: DEFAULTS.filter.location,
      pitch: DEFAULTS.filter.pitcher,
      side: DEFAULTS.filter.batSide,
      seg: DEFAULTS.filter.segment,
      window: DEFAULTS.filter.window,
      family: DEFAULTS.family,
      sort: defaultSortKeyForFamily(state.family),
      dir: DEFAULTS.sortDir
    };
    var params = {
      hand: f.hand, loc: f.location, pitch: f.pitcher, side: f.batSide,
      seg: f.segment, window: f.window, family: state.family,
      sort: state.sortKey, dir: state.sortDir
    };
    var omitted = (global.ChaseScopeBar && ChaseScopeBar.omitDefaults)
      ? ChaseScopeBar.omitDefaults(params, defaults)
      : params;
    var p = new URLSearchParams();
    if (current.has('hubdebug')) p.set('hubdebug', current.get('hubdebug'));
    Object.keys(omitted).forEach(function (k) { p.set(k, omitted[k]); });
    var q = p.toString();
    history.pushState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  function nonDefaultTokens(state) {
    var out = ['All teams'];
    out.push(
      state.family === 'status' ? 'status-projection'
        : state.family === 'surface' ? 'surface-level-wins'
          : state.family
    );
    var f = state.filter;
    if (f.hand !== 'both') out.push(f.hand === 'r' ? 'vs RHP' : 'vs LHP');
    if (f.location !== 'all') out.push(f.location);
    if (f.pitcher !== 'both') out.push(f.pitcher === 'sp' ? 'vs SP' : 'vs RP');
    if (f.segment !== 'full') out.push('F5');
    if (f.window !== 'YTD') out.push(f.window);
    return out;
  }

  function fmt(v, d) {
    var n = num(v);
    if (n == null) return '—';
    return Number(n).toFixed(d == null ? 1 : d);
  }
  function sanityOk(def, v) {
    if (!def || !def.sanity) return true;
    var n = num(v);
    if (n == null) return false;
    return n >= def.sanity[0] && n <= def.sanity[1];
  }

  function colorMetric(key, value) {
    if (!A || !A.metricColor) return 'var(--text)';
    if (key === 'wrc') return A.metricColor(value, 'wrc', false);
    if (key === 'woba' || key === 'xwoba') return A.metricColor(value, 'woba', false);
    if (key === 'winPct' || key === 'f5WinPct' || key === 'pitcherWinPct') return A.metricColor(value, key, false);
    // Pitch Score Against: high = pitchers did WELL = lineup was EASY = bad for the
    // lineup, so invert (high -> red), same as QS% Allowed.
    if (key === 'pitchScore') return A.metricColor(value, 'pitching', true);
    if (key === 'pitchInn') return A.metricColor(value, 'pitchinn', false);
    if (key === 'qs') return A.metricColor(value, 'pitching', true);
    if (key === 'xfip') return A.metricColor(value, 'xfipFaced', true);
    if (key === 'ppGap') return A.metricColor(value, 'ppGap', false);
    return A.metricColor(value, key, false);
  }
  function rangeFor(rows, key) {
    var vals = (rows || []).map(function(r) { return num(r[key]); }).filter(function(v) { return v != null; });
    if (vals.length < 2) return null;
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    if (!isFinite(min) || !isFinite(max) || max - min < 1e-9) return null;
    return { min: min, max: max };
  }
  function rangeColor(value, range, key) {
    var n = num(value);
    if (n == null) return 'var(--text-2)';
    return colorMetric(key || 'osi', n);
  }
  function valueChipHtml(value, def, range) {
    var safe = sanityOk(def, value) ? value : null;
    if (safe == null) return (A && A.chipPlaceholderHtml) ? A.chipPlaceholderHtml('—') : '—';
    var ctx = def && def.key ? def.key : 'osi';
    var invert = false;
    if (ctx === 'pitchScore') { ctx = 'pitching'; invert = true; }  // high = easy lineup = red
    if (ctx === 'pitchInn') ctx = 'pitchinn';
    if (ctx === 'qs') { ctx = 'pitching'; invert = true; }
    if (ctx === 'xfip') { ctx = 'xfipFaced'; invert = true; }
    if (ctx === 'xwoba') ctx = 'woba';
    if (ctx === 'ppGap') ctx = 'ppGap';
    if (A && A.valChipHtml) return A.valChipHtml(safe, ctx, invert, def.digits);
    return '<span class="chip c-mid">' + fmt(safe, def.digits) + '</span>';
  }
  function visibleDefsForDensity(defs) {
    return (defs || []).filter(function(def) { return def.tier !== 'advanced'; });
  }
  function rangeMapForDefs(rows, defs) {
    var out = {};
    (defs || []).forEach(function(def) {
      if (!def || def.placeholder || def.trend) return;
      out[def.key] = rangeFor(rows, def.key);
    });
    return out;
  }
  function fetchPalsMap(forceRefresh) {
    if (LM && LM.refreshPals && forceRefresh) {
      return LM.refreshPals({ forceRefreshPals: true }).then(function(raw) {
        if (!MS || !MS.parsePalsRows) return {};
        var parsed = MS.parsePalsRows((raw && raw.pals) || []);
        var map = {};
        Object.keys(parsed || {}).forEach(function(tk) {
          var row = parsed[tk];
          if (row && row.pals != null) map[tk] = row.pals;
        });
        return map;
      }).catch(function() { return {}; });
    }
    if (!MS || !MS.fetchSheetTab || !CFG || !CFG.SHEET_TABS || !CFG.SHEET_TABS.pals) {
      return Promise.resolve({});
    }
    return MS.fetchSheetTab(CFG.SHEET_TABS.pals).then(function(rows) {
      if (MS.parsePalsRows) {
        var parsed = MS.parsePalsRows(rows || []);
        var map = {};
        Object.keys(parsed || {}).forEach(function(tk) {
          var row = parsed[tk];
          if (row && row.pals != null) map[tk] = row.pals;
        });
        return map;
      }
      var map = {};
      (rows || []).forEach(function(row) {
        var t = MS.teamKey(MS.pickCol(row, 'Tm', 'Team', 'tm', 'team'));
        if (!t) return;
        var pals = num(MS.pickCol(row, 'PALS', 'pals', 'Pals', 'APLs', 'apls', 'APL', 'apl'));
        if (pals != null) map[t] = pals;
      });
      return map;
    }).catch(function() {
      return {};
    });
  }
  function withPalsFallback(rows) {
    rows = rows || [];
    if (!rows.length) return Promise.resolve(rows);
    var missingAll = rows.every(function(r) { return num(r && r.pals) == null; });
    if (!missingAll) return Promise.resolve(rows);
    return fetchPalsMap().then(function(palsMap) {
      if (!palsMap || !Object.keys(palsMap).length) return rows;
      return rows.map(function(r) {
        var tk = teamKey(r && r.t);
        if (!tk || palsMap[tk] == null) return r;
        return Object.assign({}, r, { pals: palsMap[tk] });
      });
    });
  }
  function teamLogoHtml(team, px) {
    var size = px || 28;
    if (MS && MS.teamLogo) return MS.teamLogo(team, size);
    if (A && A.teamLogoImg) return A.teamLogoImg(team, size, 'lv-team-logo');
    return '';
  }
  function iconCircle(name) {
    var I = global.MLBMAIcons;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm" aria-hidden="true"></span>';
  }
  function lvSec(label, icon, purpose) {
    var A = global.MLBMAAssets;
    if (A && A.caSectionHeadHtml) {
      return A.caSectionHeadHtml(icon || 'bar-chart-3', 'Team Rankings', label, purpose || '');
    }
    return '<div class="ca-section-head--rule lv-sec">' + iconCircle(icon) + '<span>' + esc(label) + '</span></div>';
  }

  function renderContextBanner(meta, state) {
    meta = meta || {};
    state = state || {};
    var un = meta.unavailable || {};
    var msgs = [];
    if (meta.teamResultsEmpty && state.family === 'surface') {
      msgs.push('Team_Results sheet is empty — run the game-results pipeline (scrape_results → compute_results → push_team_results).');
    }
    if (state.family === 'surface' && meta.resultsPitcherUnsplit) {
      msgs.push('Win results are team-level; not split by pitcher faced.');
    }
    if (state.family === 'surface' && meta.resultsHandUnsplit) {
      msgs.push('Win results are team-level; not split by platoon.');
    }
    if (un.window) msgs.push('Selected window split unavailable; showing closest available context.');
    if (un.location) msgs.push('Location split unavailable for selected combination; showing nearest available split.');
    if (un.pitcher) msgs.push('Pitcher split unavailable for selected combination; showing nearest available split.');
    if (un.segment && state.family !== 'surface') msgs.push('F5 split tab unavailable; using derived F5 proxy from available components.');
    if (!msgs.length) return '';
    return '<div class="lv-banner warn">' + esc(msgs.join(' ')) + '</div>';
  }
  var SURFACE_LOCK_TIP = 'Not available for Surface Level Wins — win results are team-level, not split by platoon.';

  function filterCount(state) {
    var n = 0;
    var f = state.filter || {};
    var d = DEFAULTS.filter;
    if (state.family !== DEFAULTS.family) n += 1;
    if (f.window !== d.window) n += 1;
    if (f.segment !== d.segment) n += 1;
    if (f.hand !== d.hand) n += 1;
    if (f.location !== d.location) n += 1;
    if (f.pitcher !== d.pitcher) n += 1;
    if (f.batSide !== d.batSide) n += 1;
    return n;
  }
  function statedContextHtml(state) {
    var f = state.filter;
    var surfaceLock = state.family === 'surface';
    var hand = f.hand === 'r' ? 'vs RHP' : (f.hand === 'l' ? 'vs LHP' : 'Both hands');
    var loc = f.location === 'home' ? 'Home' : (f.location === 'away' ? 'Away' : 'All parks');
    var pitch = f.pitcher === 'sp' ? 'vs SP' : (f.pitcher === 'rp' ? 'vs RP' : 'SP+RP');
    var bats = f.batSide === 'rhb' ? 'RHB' : (f.batSide === 'lhb' ? 'LHB' : 'Both bats');
    var lock = surfaceLock ? ' <span title="' + esc(SURFACE_LOCK_TIP) + '">(surface lock: platoon/bats league-level)</span>' : '';
    return 'Stated context (not toggles): <strong>' + esc(hand) + '</strong> · <strong>' + esc(loc) + '</strong> · <strong>' + esc(pitch) + '</strong> · <strong>' + esc(bats) + '</strong>' + lock;
  }
  function confidenceHtml(state) {
    var w = (state.filter && state.filter.window) || 'YTD';
    if (w === 'YTD') {
      return 'Figures and confidence both use the full-season sample.';
    }
    return 'Figures use the ' + esc(w) + ' window. Confidence language uses the full available sample (YTD), not the window slice.';
  }
  function bindRankingsDataStatus(bar) {
    var el = bar && bar.querySelector('#lvDataStatus');
    if (!el || !global.ChaseDataStatus) return;
    var snap = global.__MLBMA_RANKINGS_SNAPSHOT || {};
    ChaseDataStatus.bindResume(el, function () {
      var sheet = global.MLBMA_SHEET_BUST || '';
      var parsed = sheet && /\d{4}-\d{2}-\d{2}/.test(String(sheet))
        ? { as_of: String(sheet) }
        : { as_of: snap.generatedAt || null };
      var extra = {
        source: sheet ? 'sheet' : (snap.generatedAt ? 'snapshot' : 'unknown'),
        sport: 'mlb',
        publishedAt: snap.generatedAt || sheet || null,
        dataCutoff: parsed.as_of
      };
      if (!parsed.as_of && !snap.generatedAt) return ChaseDataStatus.unknownFields(extra);
      return ChaseDataStatus.fieldsFromParsed(parsed, extra);
    });
  }

  function familyPill(val, label, state) {
    var on = state.family === val;
    return '<button type="button" class="hub-pill lv-pill' + (on ? ' active' : '') + '" data-a="family" data-v="' + val + '">' + esc(label) + '</button>';
  }
  function renderControls(root, state, teams, meta) {
    var host = root.querySelector('.lv-controls');
    var intro = lvSec('Matchup analysis lens', 'bar-chart-3', 'Window and segment govern the table; family switches Scoring / Difficulty / Projection. Hand, park, pitcher, and bat side stay stated context.');
    var rowView = '<div class="ca-scopebar-row"><div class="ca-scopebar-group"><span class="ca-scopebar-label">View</span><div class="ca-scopebar-pills">'
      + familyPill('surface', 'Surface', state)
      + familyPill('scoring', 'Scoring', state)
      + familyPill('difficulty', 'Difficulty', state)
      + familyPill('status', 'Projection', state)
      + '</div></div></div>';
    var rowScope = '<div class="ca-scopebar-row"><div class="ca-scopebar-group"><span class="ca-scopebar-label">Window</span><div class="ca-scopebar-pills">'
      + pill('window', 'YTD', 'YTD', state, false) + pill('window', 'L30', 'L30', state, false)
      + pill('window', 'L14', 'L14', state, false) + pill('window', 'L7', 'L7', state, false)
      + '</div></div><div class="ca-scopebar-group"><span class="ca-scopebar-label">Segment</span><div class="ca-scopebar-pills">'
      + pill('segment', 'full', 'Full', state, false) + pill('segment', 'f5', 'F5', state, false)
      + '</div></div></div>';
    host.innerHTML = intro + '<div class="lv-scope-host"></div>' + renderContextBanner(meta, state);
    var bar = host.querySelector('.lv-scope-host');
    if (global.ChaseScopeBar && ChaseScopeBar.render) {
      ChaseScopeBar.render(bar, {
        controls: [rowView, rowScope],
        context: statedContextHtml(state),
        summary: 'Showing <strong>' + esc(nonDefaultTokens(state).join(' · ')) + '</strong>',
        confidence: confidenceHtml(state),
        resetLabel: 'Reset scope',
        count: filterCount(state)
      });
      bindRankingsDataStatus(bar);
    } else {
      bar.innerHTML = rowView + rowScope
        + '<p class="ca-scopebar-context">' + statedContextHtml(state) + '</p>'
        + '<div class="lv-query ca-query-line">Showing <strong>' + esc(nonDefaultTokens(state).join(' · ')) + '</strong></div>';
    }
  }
  function pill(key, val, label, state, disabled, tip) {
    var on = state.filter[key] === val;
    return '<button type="button" class="hub-pill lv-pill' + (on ? ' active' : '') + '" data-a="f" data-k="' + key + '" data-v="' + val + '"'
      + (disabled ? ' disabled' : '') + (disabled && tip ? ' title="' + esc(tip) + '"' : '')
      + '>' + esc(label) + '</button>';
  }
  function metricInverts(key) {
    return key === 'qs' || key === 'pitchScore' || key === 'xfip';
  }
  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }
  function leagueRankMaps(rows, defs) {
    var n = (rows || []).length;
    var maps = {};
    (defs || []).forEach(function(def) {
      if (!def || def.placeholder || def.trend) return;
      var invert = metricInverts(def.key);
      var items = (rows || []).map(function(r) {
        return { t: teamKey(r.t), v: num(r[def.key]) };
      });
      items.sort(function(a, b) {
        if (a.v == null && b.v == null) return 0;
        if (a.v == null) return 1;
        if (b.v == null) return -1;
        if (a.v === b.v) return a.t.localeCompare(b.t);
        return invert ? (a.v - b.v) : (b.v - a.v);
      });
      var ranks = {};
      var lastVal = null;
      var lastRank = 0;
      items.forEach(function(item, idx) {
        if (item.v == null) { ranks[item.t] = null; return; }
        if (lastVal == null || item.v !== lastVal) lastRank = idx + 1;
        lastVal = item.v;
        ranks[item.t] = lastRank;
      });
      maps[def.key] = { ranks: ranks, n: n };
    });
    return maps;
  }
  function rankSuffix(def, team, maps) {
    var pack = maps[def.key];
    if (!pack) return '';
    var rk = pack.ranks[teamKey(team)];
    if (rk == null) return '';
    return '<span class="lv-lg-rank">· ' + ordinal(rk) + ' of ' + pack.n + '</span>';
  }
  function valueWithRankHtml(def, row, ranges, maps) {
    var raw = row[def.key];
    var safe = sanityOk(def, raw) ? raw : null;
    if (safe == null && raw != null) console.warn('[LineupView] sanity fail', def.key, row.t, raw);
    return valueChipHtml(safe, def, ranges[def.key]) + rankSuffix(def, row.t, maps);
  }
  function renderBody(root, state, rows) {
    var mount = root.querySelector('.lv-body');
    var defs = visibleDefsForDensity(familyDefs(state.family));
    applyLeaguePoolsFromRows(rows);
    var ranges = rangeMapForDefs(rows, defs);
    var maps = leagueRankMaps(rows, defs);

    var sortedRows = (rows || []).slice();
    var sortKey = state.sortKey;
    var sortDir = state.sortDir === 'asc' ? 'asc' : 'desc';
    sortedRows.sort(function(a, b) {
      var av = num(a[sortKey]);
      var bv = num(b[sortKey]);
      if (av == null && bv == null) return teamKey(a.t).localeCompare(teamKey(b.t));
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return teamKey(a.t).localeCompare(teamKey(b.t));
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });

    var sortPills = '<div class="lv-sort-pills" role="toolbar" aria-label="Sort">' + defs.map(function(def) {
      if (def.placeholder) return '';
      var sorted = state.sortKey === def.key;
      var arrow = sorted ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      return '<button type="button" class="hub-pill lv-pill' + (sorted ? ' active' : '') + '" data-a="sort" data-k="' + def.key + '">' + esc(def.label) + arrow + '</button>';
    }).join('') + '</div>';

    var head = '<tr><th>#</th><th>Team</th>' + defs.map(function(def) {
      if (def.placeholder) return '<th>' + esc(def.label) + ' <span class="lv-phase">Phase 1</span></th>';
      var sorted = state.sortKey === def.key;
      var arrow = sorted ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      return '<th class="lv-sortable' + (sorted ? ' sorted' : '') + '" data-a="sort" data-k="' + def.key + '" title="Click to sort">' + esc(def.label) + arrow + '</th>';
    }).join('') + '</tr>';
    var body = sortedRows.map(function(r, idx) {
      var cols = defs.map(function(def) {
        if (def.placeholder) return '<td>— <span class="lv-phase">Phase 1</span></td>';
        return '<td class="num' + (state.sortKey === def.key ? ' sort-col' : '') + '">' + valueWithRankHtml(def, r, ranges, maps) + '</td>';
      }).join('');
      return '<tr class="lv-row-team" data-team="' + esc(r.t) + '"><td class="lv-rank-num">' + (idx + 1) + '</td><td><span class="lv-team-cell team-cell-bold">'
        + teamLogoHtml(r.t, 28) + '<strong class="ab">' + esc(r.t) + '</strong></span></td>' + cols + '</tr>';
    }).join('');

    var cards = '<div class="lv-dual-cards">' + sortedRows.map(function(r, idx) {
      var metrics = defs.map(function(def) {
        if (def.placeholder) return '';
        return '<div class="lv-team-card-metric"><span class="lab">' + esc(def.label) + '</span>'
          + valueWithRankHtml(def, r, ranges, maps) + '</div>';
      }).join('');
      return '<article class="lv-team-card" data-team="' + esc(r.t) + '"><div class="lv-team-card-head">'
        + '<span class="lv-team-card-rank">' + (idx + 1) + '</span>'
        + teamLogoHtml(r.t, 28) + '<strong>' + esc(r.t) + '</strong></div>'
        + '<div class="lv-team-card-metrics">' + metrics + '</div></article>';
    }).join('') + '</div>';

    mount.innerHTML = sortPills
      + '<details class="lv-league-expander" open>'
      + '<summary>Compare to league</summary>'
      + '<div class="lv-table-wrap"><table class="lv-table lv-no-cardify"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>'
      + cards
      + '</details>';
  }

  function bind(root, ctx) {
    root.addEventListener('click', function(e) {
      var sortTh = e.target.closest('[data-a="sort"]');
      if (sortTh) {
        var sk = sortTh.getAttribute('data-k');
        if (sk) {
          ctx._userInteracted = true;
          if (ctx.state.sortKey === sk) ctx.state.sortDir = ctx.state.sortDir === 'desc' ? 'asc' : 'desc';
          else { ctx.state.sortKey = sk; ctx.state.sortDir = 'desc'; }
          rerender(root, ctx);
        }
        return;
      }
      var btn = e.target.closest('button');
      if (btn) {
        var a = btn.dataset.a;
        if (a === 'f' && !btn.disabled) {
          ctx._userInteracted = true;
          var k = btn.dataset.k; var v = btn.dataset.v;
          ctx.state.filter[k] = v;
          rerender(root, ctx);
        } else if (a === 'family') {
          ctx._userInteracted = true;
          ctx.state.family = btn.dataset.v;
          if (ctx.state.family === 'surface') {
            // Surface win results carry no platoon/batter-side splits — reset those
            // lenses so the disabled pills never show a stale active selection.
            ctx.state.filter.hand = 'both';
            ctx.state.filter.batSide = 'both';
          }
          normalizeSortState(ctx.state);
          rerender(root, ctx);
        } else if (a === 'scope-reset') {
          ctx._userInteracted = true;
          ctx.state.filter = Object.assign({}, DEFAULTS.filter);
          ctx.state.family = DEFAULTS.family;
          normalizeSortState(ctx.state);
          rerender(root, ctx);
        }
      }
    });
  }

  function registerLeaguePoolsFromRows(dataRows) {
    if (!A || !A.registerLeaguePool || !dataRows || !dataRows.length) return false;
    var metrics = [
      'winPct', 'f5WinPct', 'pitcherWinPct',
      'osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'xfip',
      'pals', 'projOSI', 'ppGap', 'pitchScore', 'pitchScoreFaced'
    ];
    var registered = false;
    metrics.forEach(function(k) {
      var vals = dataRows.map(function(r) { return num(r[k]); }).filter(function(v) { return v != null && !isNaN(v); });
      if (vals.length >= 2) {
        A.registerLeaguePool(k, vals);
        registered = true;
      }
    });
    var xfipFaced = dataRows.map(function(r) { return num(r.xfip); }).filter(function(v) { return v != null && !isNaN(v); });
    if (xfipFaced.length >= 2) {
      A.registerLeaguePool('xfipFaced', xfipFaced);
      registered = true;
    }
    return registered;
  }

  function applyLeaguePoolsFromRows(rows) {
    if (!A || !A.registerLeaguePool || !rows || !rows.length) return false;
    if (registerLeaguePoolsFromRows(rows)) return true;
    if (LM && LM.buildLeaguePools) {
      var pools = LM.buildLeaguePools(rows);
      Object.keys(pools || {}).forEach(function(k) {
        var pool = pools[k];
        if (pool && pool.values && pool.values.length) A.registerLeaguePool(k, pool.values);
      });
      return true;
    }
    return false;
  }

  function scheduleLeaguePools(root, ctx, rows) {
    if (!A || !A.registerLeaguePool) return;
    var run = function() {
      if (applyLeaguePoolsFromRows(rows)) {
        renderBody(root, ctx.state, rows);
        return;
      }
      // Avoid a second full rankAll() via leaguePoolsBulk on first paint — baselines.json
      // already seeds chip grading; row pools backfill on the next filter change if needed.
    };
    if (global.requestIdleCallback) global.requestIdleCallback(run, { timeout: 1200 });
    else setTimeout(run, 0);
  }

  function dismissPageLoading() {
    var l = document.getElementById('hubLoading');
    if (l) l.classList.add('hide');
    if (global.MLBMA_UI && MLBMA_UI.hideLoadingOverlay) MLBMA_UI.hideLoadingOverlay();
    else if (global.MLBMA_UI && MLBMA_UI.finishLoading) MLBMA_UI.finishLoading();
  }

  function isDefaultSnapshotFilter(f) {
    if (!f) return false;
    return f.hand === 'both' && f.location === 'all' && f.pitcher === 'both'
      && f.batSide === 'both' && f.segment === 'full' && f.window === 'YTD';
  }

  function snapshotRowsForState(state) {
    var snap = global.__MLBMA_RANKINGS_SNAPSHOT;
    if (!snap || !snap.families || !state || !isDefaultSnapshotFilter(state.filter)) return null;
    var pack = snap.families[state.family] || snap.families.surface;
    if (!pack || !pack.rows || !pack.rows.length) return null;
    return pack.rows.slice();
  }

  function scheduleLiveHydration(root, ctx) {
    if (ctx._liveHydrationScheduled || ctx._liveReady) return;
    ctx._liveHydrationScheduled = true;
    var run = function() {
      if (ctx._userInteracted || ctx._liveReady) return;
      rerender(root, ctx, { silent: true, hydrate: true });
    };
    if (global.requestIdleCallback) {
      global.requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 1800);
    }
  }

  function rerender(root, ctx, opts) {
    opts = opts || {};
    var silent = !!opts.silent || !!opts.fromBoot;
    var splitActive = ctx.state.filter.hand !== 'both'
      || (ctx.state.filter.location !== 'all' && ctx.state.filter.location !== 'both')
      || ctx.state.filter.window !== 'YTD'
      || ctx.state.filter.pitcher !== 'both';
    var body = root.querySelector('.lv-body');
    var bootTable = body && body.querySelector('.lv-table--boot');
    if (bootTable && !splitActive && !ctx._userInteracted) silent = true;
    if (!LM || !LM.rankAll) {
      dismissPageLoading();
      if (body) body.innerHTML = '<div class="lv-note">LineupModel not available.</div>';
      return;
    }
    writeUrl(ctx.state);
    if (!ctx._controlsReady || !silent) {
      renderControls(root, ctx.state, ctx.teams, ctx.meta);
      ctx._controlsReady = true;
    }
    dismissPageLoading();
    global.__lineupViewMounted = true;
    var snapshotRows = !opts.hydrate && !splitActive && !ctx._userInteracted
      ? snapshotRowsForState(ctx.state) : null;
    if (snapshotRows && (opts.fromBoot || opts.silent)) {
      ctx.teams = snapshotRows.map(function(r) { return r.t; }).sort();
      renderControls(root, ctx.state, ctx.teams, ctx.meta);
      ctx._controlsReady = true;
      if (!bootTable) renderBody(root, ctx.state, snapshotRows);
      global.__lineupViewReady = true;
      scheduleLeaguePools(root, ctx, snapshotRows);
      scheduleLiveHydration(root, ctx);
      return;
    }
    if (!silent && body && !body.querySelector('.lv-table')) {
      body.innerHTML = '<div class="lv-note">Loading rankings…</div>';
    }
    LM.rankAll(ctx.state.filter, ctx.state.family, { includeMeta: true }).then(function(resolved) {
      var rows = (resolved && resolved.rows) ? resolved.rows : (resolved || []);
      ctx.meta = (resolved && resolved.meta) ? resolved.meta : {};
      var shouldRetryPals = ctx.state.family === 'status'
        && rows.length > 0
        && rows.every(function(r) { return num(r && r.pals) == null; });
      if (shouldRetryPals && !ctx._didPalsForceRefresh) {
        ctx._didPalsForceRefresh = true;
        if (LM && LM.refreshPals) {
          return LM.refreshPals({ forceRefreshPals: true }).then(function() {
            return LM.rankAll(ctx.state.filter, ctx.state.family, { includeMeta: true });
          });
        }
        return fetchPalsMap(true).then(function() {
          return LM.rankAll(ctx.state.filter, ctx.state.family, { includeMeta: true });
        });
      }
      ctx._didPalsForceRefresh = false;
      return { rows: rows, meta: ctx.meta };
    }).then(function(resolved) {
      var rows = (resolved && resolved.rows) ? resolved.rows : (resolved || []);
      var meta = (resolved && resolved.meta) ? resolved.meta : ctx.meta;
      if (ctx.state.family !== 'status') return { rows: rows || [], meta: meta || {} };
      return withPalsFallback(rows || []).then(function(nextRows) { return { rows: nextRows, meta: meta || {} }; });
    }).then(function(rows) {
      var meta = (rows && rows.meta) ? rows.meta : (ctx.meta || {});
      rows = (rows && rows.rows) ? rows.rows : (rows || []);
      ctx.meta = meta;
      ctx.teams = rows.map(function(r) { return r.t; }).sort();
      renderControls(root, ctx.state, ctx.teams, ctx.meta);
      ctx._controlsReady = true;
      renderBody(root, ctx.state, rows);
      if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(root);
      dismissPageLoading();
      global.__lineupViewReady = true;
      ctx._liveReady = true;
      scheduleLeaguePools(root, ctx, rows);
      return null;
    }).catch(function(err) {
      console.error('[LineupView] render failed', err);
      dismissPageLoading();
      root.querySelector('.lv-body').innerHTML = '<div class="lv-note" style="color:var(--neg)">Render error: ' + esc(err && err.message ? err.message : String(err)) + '</div>';
    });
  }

  function mount(opts) {
    opts = opts || {};
    global.__MLBMA_LINEUP_VIEW_ACTIVE = true;
    ensureStyles();
    var el = typeof opts.mountId === 'string' ? document.getElementById(opts.mountId) : opts.element;
    if (!el) return null;
    var state = stateFromUrl();
    state.filter = normalizeFilter(state.filter);
    normalizeSortState(state);
    var bootShell = el.querySelector('.lv-wrap--boot');
    var shell;
    if (bootShell) {
      shell = bootShell;
      shell.classList.remove('lv-wrap--boot');
    } else {
      shell = document.createElement('div');
      shell.className = 'lv-wrap';
      shell.innerHTML = '<div class="lv-bar"><div class="lv-controls"></div></div><div class="lv-body"></div>';
      el.innerHTML = '';
      el.appendChild(shell);
    }
    var ctx = { state: state, teams: [], _didPalsForceRefresh: false, meta: {}, _teamResultsRefresh: false, _controlsReady: false };
    bind(shell, ctx);
    if (LM && LM.onUpdate) {
      LM.onUpdate(function(reason) {
        if (reason === 'teamResults') {
          if (ctx._teamResultsRefresh || ctx.state.family !== 'surface') return;
          ctx._teamResultsRefresh = true;
          rerender(shell, ctx, { silent: true });
          return;
        }
        if (reason === 'l10SpHand' || reason === 'pals') {
          if (ctx.state.family !== 'difficulty' && ctx.state.family !== 'status') return;
          rerender(shell, ctx);
        }
      });
    }
    if (LM && LM.fetchAll) {
      LM.fetchAll({
        allowPartialTeamResults: true,
        prefetchTeamResults: true,
        prefetchL10SpHand: true
      });
    }
    var fromBoot = !!global.__MLBMA_RANKINGS_BOOT_DONE && isDefaultSnapshotFilter(state.filter);
    rerender(shell, ctx, { fromBoot: fromBoot, silent: fromBoot });
    window.addEventListener('popstate', function () {
      ctx.state = stateFromUrl();
      ctx.state.filter = normalizeFilter(ctx.state.filter);
      normalizeSortState(ctx.state);
      rerender(shell, ctx, { silent: true });
    });
    return {
      rerender: function() { rerender(shell, ctx); },
      getState: function() { return JSON.parse(JSON.stringify(ctx.state)); }
    };
  }

  function matchupHand(hand) {
    var h = String(hand || '').trim().toLowerCase().charAt(0);
    return h === 'l' || h === 'r' ? h : 'both';
  }

  function resolvedRows(value) {
    return value && !Array.isArray(value) && Array.isArray(value.rows) ? value.rows : (value || []);
  }

  function matchupPill(kind, value, label, active, disabled) {
    return '<button type="button" class="hub-pill lv-pill' + (active ? ' active' : '') + '" data-mr-kind="'
      + kind + '" data-mr-value="' + value + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }

  function matchupFilter(state, side) {
    var ctx = state.contexts[side];
    var locked = state.family === 'surface';
    return normalizeFilter({
      hand: locked ? 'both' : ctx.hand,
      location: ctx.location,
      pitcher: 'both',
      batSide: locked ? 'both' : ctx.batSide,
      segment: state.segment,
      window: state.window
    });
  }

  function matchupContextText(state, side) {
    var ctx = state.contexts[side];
    if (state.family === 'surface') {
      return (side === 'away' ? 'Away split' : 'Home split') + ' · team results (starter hand and bat side do not apply)';
    }
    var hand = ctx.hand === 'l' ? 'LHP' : ctx.hand === 'r' ? 'RHP' : 'all pitchers';
    var pitcher = ctx.opposingStarter && ctx.opposingStarter !== 'TBD' ? ' ' + ctx.opposingStarter : '';
    var bats = ctx.batSide === 'both' ? '' : ' · ' + ctx.batSide.toUpperCase() + '-side bats';
    return (side === 'away' ? 'Away split' : 'Home split') + ' · vs ' + hand + pitcher + bats;
  }

  function matchupTeamCard(state, side, rows) {
    var ctx = state.contexts[side];
    var defs = visibleDefsForDensity(familyDefs(state.family));
    var maps = leagueRankMaps(rows, defs);
    var ranges = rangeMapForDefs(rows, defs);
    var row = (rows || []).find(function(r) { return teamKey(r.t) === teamKey(ctx.team); });
    var metrics = defs.map(function(def) {
      return '<div class="lv-matchup-team-metric"><span class="lab">' + esc(def.label) + '</span><span>'
        + (row ? valueWithRankHtml(def, row, ranges, maps) : '—') + '</span></div>';
    }).join('');
    return '<article class="lv-matchup-team" data-team="' + esc(ctx.team) + '">'
      + '<div class="lv-matchup-team-head">' + teamLogoHtml(ctx.team, 30) + '<strong>' + esc(ctx.team) + '</strong></div>'
      + '<div class="lv-matchup-team-context">' + esc(matchupContextText(state, side)) + '</div>'
      + '<div class="lv-matchup-team-metrics">' + metrics + '</div></article>';
  }

  function matchupControlsHtml(state) {
    function family(value, label) {
      return matchupPill('family', value, label, state.family === value, false);
    }
    function scope(kind, value, label) {
      return matchupPill(kind, value, label, state[kind] === value, false);
    }
    var rowView = '<div class="ca-scopebar-row"><div class="ca-scopebar-group"><span class="ca-scopebar-label">View</span><div class="ca-scopebar-pills">'
      + family('surface', 'Results') + family('scoring', 'Scoring') + family('difficulty', 'Difficulty')
      + '</div></div></div>';
    var rowScope = '<div class="ca-scopebar-row"><div class="ca-scopebar-group"><span class="ca-scopebar-label">Window</span><div class="ca-scopebar-pills">'
      + scope('window', 'YTD', 'YTD') + scope('window', 'L30', 'L30') + scope('window', 'L14', 'L14') + scope('window', 'L7', 'L7')
      + '</div></div><div class="ca-scopebar-group"><span class="ca-scopebar-label">Segment</span><div class="ca-scopebar-pills">'
      + scope('segment', 'full', 'Full') + scope('segment', 'f5', 'F5') + '</div></div></div>';
    return { rowView: rowView, rowScope: rowScope };
  }

  function matchupStatedContext(state) {
    return 'Stated context (not toggles): <strong>' + esc(state.contexts.away.team) + '</strong> '
      + esc(matchupContextText(state, 'away')) + ' · <strong>' + esc(state.contexts.home.team) + '</strong> '
      + esc(matchupContextText(state, 'home'));
  }

  function renderMatchupScope(host, state) {
    var rows = matchupControlsHtml(state);
    var count = 0;
    if (state.family !== 'scoring') count++;
    if (state.window !== 'YTD') count++;
    if (state.segment !== 'full') count++;
    if (global.ChaseScopeBar && ChaseScopeBar.render) {
      ChaseScopeBar.render(host, {
        controls: [rows.rowView, rows.rowScope],
        context: matchupStatedContext(state),
        confidence: confidenceHtml({ filter: { window: state.window } }),
        count: count,
        dataStatusHtml: ''
      });
    } else {
      host.innerHTML = rows.rowView + rows.rowScope
        + '<p class="ca-scopebar-context">' + matchupStatedContext(state) + '</p>';
    }
  }

  function matchupOverridesHtml(state) {
    var side = state.leagueSide;
    var ctx = state.contexts[side];
    var locked = state.family === 'surface';
    return '<div class="lv-matchup-overrides" aria-label="League comparison context">'
      + '<div class="lv-matchup-control"><span class="lv-label">League lens</span><div class="lv-pills">'
      + matchupPill('leagueSide', 'away', state.contexts.away.team, side === 'away', false)
      + matchupPill('leagueSide', 'home', state.contexts.home.team, side === 'home', false) + '</div></div>'
      + '<div class="lv-matchup-control"><span class="lv-label">Pitcher hand</span><div class="lv-pills">'
      + matchupPill('hand', 'both', 'Both', ctx.hand === 'both', locked)
      + matchupPill('hand', 'r', 'RHP', ctx.hand === 'r', locked)
      + matchupPill('hand', 'l', 'LHP', ctx.hand === 'l', locked) + '</div></div>'
      + '<div class="lv-matchup-control"><span class="lv-label">Bat side</span><div class="lv-pills">'
      + matchupPill('batSide', 'both', 'Both', ctx.batSide === 'both', locked)
      + matchupPill('batSide', 'r', 'R', ctx.batSide === 'r', locked)
      + matchupPill('batSide', 'l', 'L', ctx.batSide === 'l', locked) + '</div></div></div>'
      + (locked ? '<p class="lv-matchup-note">Team results are team-level; pitcher hand and bat side are locked to Both.</p>' : '')
      + '<p class="lv-matchup-note">League board context: ' + esc(matchupContextText(state, side)) + '.</p>';
  }

  function mountMatchup(opts) {
    opts = opts || {};
    ensureStyles();
    var el = typeof opts.mountId === 'string' ? document.getElementById(opts.mountId) : opts.element;
    if (!el || !LM || !LM.rankAll || !opts.away || !opts.home) return null;
    var state = {
      family: 'scoring', window: 'YTD', segment: 'full', leagueSide: 'away', sortDir: 'desc', sortKey: 'osi',
      contexts: {
        away: { team: teamKey(opts.away), location: 'away', hand: matchupHand(opts.homeHand), batSide: 'both', opposingStarter: opts.homeStarter || 'TBD' },
        home: { team: teamKey(opts.home), location: 'home', hand: matchupHand(opts.awayHand), batSide: 'both', opposingStarter: opts.awayStarter || 'TBD' }
      }
    };
    el.classList.add('lv-matchup');
    if (state.family === 'status') state.family = 'scoring';

    function paint() {
      normalizeSortState(state);
      el.innerHTML = '<section class="lv-matchup-context" aria-labelledby="lvTeamContextHeading">'
        + '<h2 id="lvTeamContextHeading" class="lv-matchup-heading">Team context</h2>'
        + '<p class="lv-matchup-lede">Descriptive league rank for these two clubs. Projection is not part of this view.</p>'
        + '<div class="lv-matchup-loading lv-note">Loading league context…</div></section>';
      return Promise.all([
        LM.rankAll(matchupFilter(state, 'away'), state.family, { includeMeta: true }),
        LM.rankAll(matchupFilter(state, 'home'), state.family, { includeMeta: true })
      ]).then(function(values) {
        var awayRows = resolvedRows(values[0]);
        var homeRows = resolvedRows(values[1]);
        var leagueRows = state.leagueSide === 'home' ? homeRows : awayRows;
        applyLeaguePoolsFromRows(awayRows.concat(homeRows));
        el.innerHTML = '<section class="lv-matchup-context" aria-labelledby="lvTeamContextHeading">'
          + '<h2 id="lvTeamContextHeading" class="lv-matchup-heading">Team context</h2>'
          + '<p class="lv-matchup-lede">Descriptive league rank for these two clubs. Open Compare to league for the full board.</p>'
          + '<div class="lv-scope-host"></div>'
          + '<div class="lv-matchup-teams">' + matchupTeamCard(state, 'away', awayRows) + matchupTeamCard(state, 'home', homeRows) + '</div>'
          + '<div class="lv-matchup-league"><div class="lv-body"></div></div></section>';
        renderMatchupScope(el.querySelector('.lv-scope-host'), state);
        renderBody(el.querySelector('.lv-matchup-league'), state, leagueRows);
        var details = el.querySelector('.lv-league-expander');
        if (details) {
          details.removeAttribute('open');
          var holder = document.createElement('div');
          holder.innerHTML = matchupOverridesHtml(state);
          while (holder.lastChild) details.insertBefore(holder.lastChild, details.children[1] || null);
        }
      }).catch(function(err) {
        el.innerHTML = '<div class="lv-note" style="color:var(--neg)">Team context unavailable: ' + esc(err && err.message ? err.message : err) + '</div>';
      });
    }

    el.addEventListener('click', function(e) {
      var sort = e.target.closest('[data-a="sort"]');
      if (sort) {
        var key = sort.getAttribute('data-k');
        if (state.sortKey === key) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortKey = key; state.sortDir = 'desc'; }
        paint();
        return;
      }
      var btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      var kind = btn.getAttribute('data-mr-kind');
      var value = btn.getAttribute('data-mr-value');
      if (!kind || !value) return;
      if (kind === 'family' && value === 'status') return;
      if (kind === 'family' || kind === 'window' || kind === 'segment' || kind === 'leagueSide') state[kind] = value;
      else if (kind === 'hand' || kind === 'batSide') state.contexts[state.leagueSide][kind] = value;
      paint();
    });
    paint();
    return { rerender: paint, getState: function() { return JSON.parse(JSON.stringify(state)); } };
  }

  global.LineupView = { mount: mount, mountMatchup: mountMatchup };
})(typeof window !== 'undefined' ? window : this);
