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
      + '.lv-bar{background:var(--bg-3,#16161D);border:1px solid var(--border,#2A2A35);border-radius:16px;padding:16px 16px 14px;margin-bottom:14px;box-shadow:var(--e-1,none)}'
      + '.lv-sec.ca-section-head{margin:4px 0 12px}'
      + '.lv-sec{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3,#71717A);margin:4px 0 12px;font-family:var(--display,var(--font,system-ui))}'
      + '.lv-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:flex-start}'
      + '.lv-group{display:flex;flex-direction:column;gap:6px}'
      + '.lv-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3,#6b6b76);font-weight:700;font-family:var(--font,system-ui)}'
      + '.lv-pills{display:flex;flex-wrap:wrap;gap:10px}'
      + '.lv-pill[disabled],.lv-disabled .lv-pill{opacity:.45;cursor:not-allowed}'
      + '.lv-query{font-size:13.5px;font-weight:600;color:var(--text-2,#a1a1aa);margin:18px 0 0;line-height:1.6;display:flex;align-items:center;flex-wrap:wrap;gap:8px}'
      + '.lv-query strong{font-family:var(--mono,monospace);font-variant-numeric:tabular-nums;color:var(--text,#f4f4f7)}'
      + '.lv-family-grid{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:12px;margin:8px 0 14px}'
      + '@media(max-width:1040px){.lv-family-grid{grid-template-columns:1fr}}'
      + '.lv-family{position:relative;background:var(--bg-3,#16161D);border:1px solid var(--border,#2A2A35);border-radius:16px;padding:20px 20px 16px;cursor:pointer;overflow:hidden;transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease;color:var(--text,#F5F5F7);appearance:none;-webkit-appearance:none}'
      + '.lv-family::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(135deg,var(--accent,#9A6BFF),#5B2BE0);opacity:0;transition:opacity .15s ease}'
      + '.lv-family:hover{border-color:var(--border-2,#34343d);transform:translateY(-1px)}'
      + '.lv-family.active{background:var(--bg-4,#1C1C25);border-color:color-mix(in srgb,var(--accent,#8b5cf6) 45%, var(--border,#26262f));box-shadow:0 18px 50px -16px color-mix(in srgb,var(--accent,#8b5cf6) 45%, transparent)}'
      + '.lv-family.active::before{opacity:1}'
      + '.lv-family-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}'
      + '.lv-family-name{font-family:var(--font-display,var(--font,system-ui));font-size:23px;font-weight:800;letter-spacing:-.01em;color:var(--text,#F5F5F7)}'
      + '.lv-family-n{font-family:var(--mono,monospace);font-size:11px;color:var(--text-3,#6b6b76)}'
      + '.lv-family-desc{font-size:14px;font-weight:500;color:var(--v-light,#c4b0ff);margin:10px 0 16px;line-height:1.55;letter-spacing:.01em}'
      + '.lv-family.active .lv-family-desc{color:#E8DCFF;font-weight:500}'
      + '.lv-family-chips{display:flex;flex-wrap:wrap;gap:6px}'
      + '.lv-family-chip{font-family:var(--mono,monospace);font-size:11px;padding:5px 10px;border-radius:7px;background:var(--raised,#22222C);border:1px solid var(--border,#26262f);color:var(--text-2,#a1a1aa)}'
      + '.lv-family.active .lv-family-chip{background:var(--accent-bg,rgba(139,92,246,.14));border-color:transparent;color:var(--accent-l,#c4b5fd)}'
      + '.lv-family-chip.phase{border-style:dashed;color:var(--text-3,#6b6b76);background:transparent}'
      + '.lv-lens{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:8px;background:var(--bg-3,#16161D);border:1px solid var(--border,#2A2A35);border-radius:16px;padding:8px}'
      + '@media(max-width:960px){.lv-lens{grid-template-columns:1fr}}'
      + '.lv-cat{background:var(--bg-2,#101015);border:1px solid var(--border,#2A2A35);border-radius:12px;padding:14px 14px 12px}'
      + '.lv-cat-h{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3,#6b6b76);margin-bottom:10px;font-family:var(--font,system-ui)}'
      + '.lv-cat-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}.lv-cat-row:last-child{margin-bottom:0}'
      + '.lv-cat-k{font-size:12px;color:var(--text-3,#6b6b76);min-width:74px}'
      + '.lv-team-wrap{display:none}.lv-team-wrap.show{display:flex}'
      + '.lv-input{border:0.5px solid var(--border,#26262f);background:var(--surface-2,#14141e);color:var(--text,#f4f4f7);padding:7px 10px;border-radius:var(--r-sm,8px);min-width:160px;font-size:12px;font-weight:600}'
      + '.lv-input-row{display:flex;gap:6px;align-items:center}'
      + '.lv-help{font-size:10px;color:var(--text-3,#6b6b76)}.lv-help.error{color:var(--neg,#f87171)}'
      + '.lv-table-wrap{overflow:auto}'
      + '.lv-table{width:100%;border-collapse:collapse}'
      + '.lv-table thead th{background:#0C0E18;color:#AEB4C6;font-family:var(--display,var(--font,system-ui));font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:14px;border-bottom:1.5px solid #37405A;text-align:center;white-space:nowrap;position:sticky;top:0;z-index:2}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){text-align:left}'
      + '.lv-table thead th.sorted{background:rgba(124,77,255,.16);color:#9A6BFF}'
      + '.lv-table td.sort-col{background:rgba(124,77,255,.05)}'
      + '.lv-table th.lv-sortable{cursor:pointer;user-select:none}'
      + '.lv-table th:first-child,.lv-table td:first-child{position:sticky;left:0;background:#10131F;z-index:1;width:44px}'
      + '.lv-table th:nth-child(2),.lv-table td:nth-child(2){position:sticky;left:44px;background:#10131F;z-index:1;min-width:150px}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){background:#0C0E18;z-index:3}'
      + '.lv-table td{padding:0 14px;height:46px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle;text-align:center;color:var(--text,#F5F5F7)}'
      + '.lv-table td:first-child,.lv-table td:nth-child(2){text-align:left}'
      + '.lv-table td.num{width:1%;white-space:nowrap}'
      + '.lv-rank-num{font-family:var(--display,var(--font,system-ui));font-weight:800;font-size:15px;color:#717892;font-variant-numeric:tabular-nums;text-align:center}'
      + '.lv-team-cell{display:flex;align-items:center;gap:11px}'
      + '.lv-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.018)}'
      + '.lv-table tbody tr.lv-row-team:hover td{background:rgba(124,77,255,.10);box-shadow:inset 3px 0 0 var(--purple,#7C4DFF)}'
      + '.lv-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:12px}'
      + '.lv-infographic{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,1.2fr);gap:12px;margin-top:12px}'
      + '@media(max-width:980px){.lv-infographic{grid-template-columns:1fr}}'
      + '.lv-card{background:var(--surface-1,#0c0c14);border:0.5px solid var(--border,#26262f);border-radius:var(--r-sm,8px);padding:12px 14px;display:flex;flex-direction:column;min-height:140px;box-shadow:var(--e-1,none)}'
      + '.lv-card-lab{font-size:11px;color:var(--text-2,#a1a1aa);letter-spacing:.06em;text-transform:uppercase}'
      + '.lv-card-val{font-size:36px;line-height:1.05;font-weight:800;color:var(--text,#f4f4f7);margin:8px 0;font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.lv-card-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--text-2,#a1a1aa);margin-top:auto}'
      + '.lv-meter{height:6px;border-radius:var(--r-pill,999px);background:color-mix(in srgb, var(--text-3,#6b6b76) 22%, transparent);overflow:hidden;margin-top:8px}'
      + '.lv-meter>span{display:block;height:100%;background:var(--accent)}'
      + '.lv-phase{font-size:10px;color:var(--warn,#fbbf24);margin-left:6px}'
      + '.lv-note{font-size:12px;color:var(--text-2,#a1a1aa);padding:14px}'
      + '.lv-banner{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.45;border:1px solid var(--border,#2A2A35);background:var(--bg-2,#101015);color:var(--text-2,#a1a1aa)}'
      + '.lv-banner.warn{border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08);color:var(--gold,#fbbf24)}';
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
    var p = new URLSearchParams(location.search);
    var f = state.filter;
    p.set('hand', f.hand); p.set('loc', f.location); p.set('pitch', f.pitcher); p.set('side', f.batSide);
    p.set('seg', f.segment); p.set('window', f.window);
    p.set('family', state.family);
    p.set('sort', state.sortKey); p.set('dir', state.sortDir);
    p.delete('scope');
    p.delete('team');
    p.delete('trend');
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
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
    if (!A || !A.metricColor) return 'var(--text,#f4f4f7)';
    if (key === 'wrc') return A.metricColor(value, 'wrc', false);
    if (key === 'woba' || key === 'xwoba') return A.metricColor(value, 'woba', false);
    if (key === 'winPct' || key === 'f5WinPct' || key === 'pitcherWinPct') return A.metricColor(value, 'osi', false);
    if (key === 'pitchScore') return A.metricColor(value, 'pitching', false);
    if (key === 'qs') return A.metricColor(value, 'pitching', true);
    if (key === 'xfip') return A.metricColor(value, 'xfip', true);
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
    if (n == null) return 'var(--text-2,#a1a1aa)';
    return colorMetric(key || 'osi', n);
  }
  function valueChipHtml(value, def, range) {
    var safe = sanityOk(def, value) ? value : null;
    if (safe == null) return (A && A.chipPlaceholderHtml) ? A.chipPlaceholderHtml('—') : '—';
    var ctx = def && def.key ? def.key : 'osi';
    var invert = false;
    if (ctx === 'pitchScore') ctx = 'pitching';
    if (ctx === 'qs') { ctx = 'pitching'; invert = true; }
    if (ctx === 'xfip') { ctx = 'xfip'; invert = true; }
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
  function fetchPalsMap() {
    if (!MS || !MS.fetchSheetTab || !MS.pickCol || !MS.teamKey || !CFG || !CFG.SHEET_TABS || !CFG.SHEET_TABS.pals) {
      return Promise.resolve({});
    }
    return MS.fetchSheetTab(CFG.SHEET_TABS.pals, { forceRefresh: true }).then(function(rows) {
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
  function lvSec(label, icon) {
    return '<div class="ca-section-head lv-sec">' + iconCircle(icon) + '<span>' + esc(label) + '</span></div>';
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
  function renderControls(root, state, teams, meta) {
    var rows = ''
      + lvSec('Metric family', 'bar-chart-3')
      + '<div class="lv-family-grid">'
      + familyCard('surface', 'Surface Level Wins', 'Win-facing outcomes for full game, F5, and pitching context.', ['Win%', 'F5 Win%', 'Pitcher Win%'], state)
      + familyCard('scoring', 'Scoring', 'How much damage the lineup does at the plate.', ['OSI', 'wRC+', 'wOBA', 'RCV'], state)
      + familyCard('difficulty', 'Difficulty', 'How hard the lineup is to pitch against.', ['ABQ', 'OBR', 'QS% Allowed', 'Pitch/Inn', 'Pitch Score Against'], state)
      + familyCard('status', 'Status-Projection', 'How current output compares with projection/process.', ['projOSI', 'PP-Gap', 'PALS', 'xwOBA', 'xFIP Faced'], state)
      + '</div>'
      + lvSec('Lens context', 'target')
      + '<div class="lv-lens">'
      + '<div class="lv-cat"><div class="lv-cat-h">Matchup</div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Hand</span><div class="lv-pills">'
      + pill('hand', 'both', 'Both', state, false) + pill('hand', 'r', 'vs RHP', state, false) + pill('hand', 'l', 'vs LHP', state, false) + '</div></div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Pitcher</span><div class="lv-pills">'
      + pill('pitcher', 'both', 'Both', state, false) + pill('pitcher', 'sp', 'SP', state, false) + pill('pitcher', 'rp', 'RP', state, false) + '</div></div>'
      + '</div>'
      + '<div class="lv-cat"><div class="lv-cat-h">Situation</div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Location</span><div class="lv-pills">'
      + pill('location', 'all', 'All', state, false) + pill('location', 'home', 'Home', state, false) + pill('location', 'away', 'Away', state, false) + '</div></div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Segment</span><div class="lv-pills">'
      + pill('segment', 'full', 'Full', state, false) + pill('segment', 'f5', 'F5', state, false) + '</div></div>'
      + '</div>'
      + '<div class="lv-cat"><div class="lv-cat-h">Lineup side</div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Bats</span><div class="lv-pills">'
      + pill('batSide', 'both', 'Both', state, false) + pill('batSide', 'rhb', 'RHB', state, false) + pill('batSide', 'lhb', 'LHB', state, false) + '</div></div>'
      + '</div>'
      + '<div class="lv-cat"><div class="lv-cat-h">Time window</div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Range</span><div class="lv-pills">'
      + pill('window', 'YTD', 'YTD', state, false) + pill('window', 'L30', 'L30', state, false) + pill('window', 'L14', 'L14', state, false) + pill('window', 'L7', 'L7', state, false) + '</div></div>'
      + '</div>'
      + '</div>'
      + '<div class="lv-query ca-query-line">Showing <strong>' + esc(nonDefaultTokens(state).join(' · ')) + '</strong></div>'
      + renderContextBanner(meta, state);
    root.querySelector('.lv-controls').innerHTML = rows;
  }
  function pill(key, val, label, state, disabled) {
    var on = state.filter[key] === val;
    return '<button class="lv-pill' + (on ? ' active' : '') + '" data-a="f" data-k="' + key + '" data-v="' + val + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }
  function familyCard(val, name, desc, chips, state) {
    var on = state.family === val;
    return '<button class="lv-family' + (on ? ' active' : '') + '" data-a="family" data-v="' + val + '">'
      + '<div class="lv-family-top"><span class="lv-family-name">' + esc(name) + '</span><span class="lv-family-n">' + chips.length + ' metrics</span></div>'
      + '<div class="lv-family-desc">' + esc(desc) + '</div>'
      + '<div class="lv-family-chips">' + chips.map(function(ch) {
        var phase = (ch === 'PP-Gap');
        return '<span class="lv-family-chip' + (phase ? ' phase' : '') + '">' + esc(ch) + '</span>';
      }).join('') + '</div></button>';
  }

  function renderBody(root, state, rows) {
    var mount = root.querySelector('.lv-body');
    var defs = visibleDefsForDensity(familyDefs(state.family));
    var ranges = rangeMapForDefs(rows, defs);

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

    var head = '<tr><th>#</th><th>Team</th>' + defs.map(function(def) {
      if (def.placeholder) return '<th>' + esc(def.label) + ' <span class="lv-phase">Phase 1</span></th>';
      var sorted = state.sortKey === def.key;
      var arrow = sorted ? (state.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      return '<th class="lv-sortable' + (sorted ? ' sorted' : '') + '" data-a="sort" data-k="' + def.key + '" title="Click to sort">' + esc(def.label) + arrow + '</th>';
    }).join('') + '</tr>';
    var body = sortedRows.map(function(r, idx) {
      var cols = defs.map(function(def) {
        if (def.placeholder) return '<td>— <span class="lv-phase">Phase 1</span></td>';
        var raw = r[def.key];
        var safe = sanityOk(def, raw) ? raw : null;
        if (safe == null && raw != null) console.warn('[LineupView] sanity fail', def.key, r.t, raw);
        return '<td class="num' + (state.sortKey === def.key ? ' sort-col' : '') + '">' + valueChipHtml(safe, def, ranges[def.key]) + '</td>';
      }).join('');
      return '<tr class="lv-row-team" data-team="' + esc(r.t) + '"><td class="lv-rank-num">' + (idx + 1) + '</td><td><span class="lv-team-cell team-cell-bold">'
        + teamLogoHtml(r.t, 28) + '<strong class="ab">' + esc(r.t) + '</strong></span></td>' + cols + '</tr>';
    }).join('');
    mount.innerHTML = '<div class="lv-table-wrap"><table class="lv-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function bind(root, ctx) {
    root.addEventListener('click', function(e) {
      var sortTh = e.target.closest('th[data-a="sort"]');
      if (sortTh) {
        var sk = sortTh.getAttribute('data-k');
        if (sk) {
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
          var k = btn.dataset.k; var v = btn.dataset.v;
          ctx.state.filter[k] = v;
          rerender(root, ctx);
        } else if (a === 'family') {
          ctx.state.family = btn.dataset.v;
          normalizeSortState(ctx.state);
          rerender(root, ctx);
        }
      }
    });
  }

  function rerender(root, ctx) {
    var l = document.getElementById('hubLoading');
    if (l) l.classList.add('hide');
    if (!LM || !LM.rankAll) {
      root.querySelector('.lv-body').innerHTML = '<div class="lv-note">LineupModel not available.</div>';
      return;
    }
    writeUrl(ctx.state);
    renderControls(root, ctx.state, ctx.teams, ctx.meta);
    root.querySelector('.lv-body').innerHTML = '<div class="lv-note">Loading lineup model…</div>';
    LM.rankAll(ctx.state.filter, ctx.state.family, { includeMeta: true }).then(function(resolved) {
      var rows = (resolved && resolved.rows) ? resolved.rows : (resolved || []);
      ctx.meta = (resolved && resolved.meta) ? resolved.meta : {};
      var shouldRetryPals = ctx.state.family === 'status'
        && rows.length > 0
        && rows.every(function(r) { return num(r && r.pals) == null; });
      if (shouldRetryPals && !ctx._didPalsForceRefresh) {
        ctx._didPalsForceRefresh = true;
        if (LM && LM.clearCache) LM.clearCache();
        return LM.rankAll(ctx.state.filter, ctx.state.family, { forceRefresh: true, includeMeta: true });
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
      renderBody(root, ctx.state, rows);
      if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(root);
      return null;
    }).then(function() {
      if (!A || !A.registerLeaguePool || !LM.leaguePool) return null;
      return Promise.all(['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'xfip', 'pals', 'projOSI', 'ppGap'].map(function(k) {
        return LM.leaguePool(k).then(function(pool) {
          if (pool && pool.values && pool.values.length) A.registerLeaguePool(k, pool.values);
        });
      }));
    }).catch(function(err) {
      console.error('[LineupView] render failed', err);
      root.querySelector('.lv-body').innerHTML = '<div class="lv-note" style="color:var(--neg,#f87171)">Render error: ' + esc(err && err.message ? err.message : String(err)) + '</div>';
    });
  }

  function mount(opts) {
    opts = opts || {};
    ensureStyles();
    var el = typeof opts.mountId === 'string' ? document.getElementById(opts.mountId) : opts.element;
    if (!el) return null;
    var state = stateFromUrl();
    state.filter = normalizeFilter(state.filter);
    normalizeSortState(state);
    var shell = document.createElement('div');
    shell.className = 'lv-wrap';
    shell.innerHTML = '<div class="lv-bar"><div class="lv-controls"></div></div><div class="lv-body"></div>';
    el.innerHTML = '';
    el.appendChild(shell);
    var ctx = { state: state, teams: [], _didPalsForceRefresh: false, meta: {} };
    bind(shell, ctx);
    rerender(shell, ctx);
    return {
      rerender: function() { rerender(shell, ctx); },
      getState: function() { return JSON.parse(JSON.stringify(ctx.state)); }
    };
  }

  global.LineupView = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
