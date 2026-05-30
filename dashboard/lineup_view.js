// lineup_view.js — Team Rankings unified view (Phase 0)
(function(global) {
  'use strict';

  var MS = global.MLBMASharedMatchup || {};
  var LM = global.LineupModel || global.MLBMALineupModel || null;
  var A = global.MLBMAAssets || null;
  var CFG = global.MLBMA_CONFIG || {};

  var DEFAULTS = {
    filter: (CFG.FILTER_DEFAULTS || { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' }),
    scope: (CFG.SCOPE_DEFAULTS || { mode: 'all', team: null }),
    family: 'scoring',
    density: 'core',
    sortKey: 'osi',
    sortDir: 'desc'
  };

  var FAMILY_DEFS = {
    scoring: [
      { key: 'osi', label: 'OSI', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'wrc', label: 'wRC+', digits: 0, tier: 'core', sanity: [40, 200] },
      { key: 'woba', label: 'wOBA', digits: 3, tier: 'core', sanity: [0.25, 0.45] },
      { key: 'rcv', label: 'RCV', digits: 1, tier: 'advanced', sanity: [0, 150] }
    ],
    difficulty: [
      { key: 'abq', label: 'ABQ', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'obr', label: 'OBR', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'qs', label: 'QS%', digits: 1, tier: 'advanced', sanity: [0, 100] },
      { key: 'pitchInn', label: 'Pitch/Inn', digits: 1, tier: 'advanced', sanity: [8, 30] },
      { key: 'pitchScore', label: 'PitchScore', digits: 1, tier: 'advanced', sanity: [0, 150] }
    ],
    status: [
      { key: 'projOSI', label: 'projOSI', digits: 1, tier: 'core', sanity: [0, 150] },
      { key: 'ppGap', label: 'PP-Gap', digits: 1, tier: 'core', sanity: [-75, 75] },
      { key: 'pals', label: 'PALS', digits: 1, tier: 'core', sanity: [0, 150] }
    ]
  };

  var TEAM_ALIASES = {
    TB: 'TBR', WSH: 'WSN', KC: 'KCR', CWS: 'CHW', SD: 'SDP', SF: 'SFG', OAK: 'ATH', AZ: 'ARI'
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
      + '.lv-sec{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--text-3,#71717A);margin:4px 0 12px;font-family:var(--font-body,var(--font,system-ui))}'
      + '.lv-sec::after{content:"";flex:1;height:1px;background:var(--border,#2A2A35)}'
      + '.lv-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:flex-start}'
      + '.lv-group{display:flex;flex-direction:column;gap:6px}'
      + '.lv-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3,#6b6b76);font-weight:700;font-family:var(--font,system-ui)}'
      + '.lv-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.lv-pill{border:0.5px solid var(--border,#26262f);background:var(--surface-2,#14141e);color:var(--text-2,#a1a1aa);font-size:12px;font-weight:600;padding:7px 14px;border-radius:var(--r-pill,999px);cursor:pointer}'
      + '.lv-pill:hover{border-color:var(--border-2,#34343d);color:var(--text,#f4f4f7)}'
      + '.lv-pill.active{background:var(--accent-bg,rgba(139,92,246,.14));border-color:transparent;color:var(--accent-l,#c4b5fd)}'
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
      + '.lv-family-desc{font-size:13px;font-weight:600;color:var(--text-2,#a1a1aa);margin:8px 0 14px;line-height:1.55}'
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
      + '.lv-table-wrap{overflow:auto;border:1px solid var(--border,#2A2A35);border-radius:16px;background:var(--bg-3,#16161D)}'
      + '.lv-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}'
      + '.lv-table th{position:sticky;top:0;background:var(--raised,#22222C);color:var(--text-3,#6b6b76);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;padding:13px 12px;border-bottom:1px solid var(--border-2,#3A3A47);text-align:right;z-index:2;font-family:var(--font-body,var(--font,system-ui));font-weight:700}'
      + '.lv-table th:first-child,.lv-table th:nth-child(2){text-align:left}'
      + '.lv-table th.sorted{background:linear-gradient(180deg,rgba(139,92,246,.18),rgba(139,92,246,.06));color:var(--accent-l,#c4b5fd)}'
      + '.lv-table td.sort-col{background:rgba(139,92,246,0.05)}'
      + '.lv-table th.lv-sortable{cursor:pointer;user-select:none}'
      + '.lv-table th:first-child,.lv-table td:first-child{position:sticky;left:0;background:var(--bg-3,#16161D);z-index:1}'
      + '.lv-table th:nth-child(2),.lv-table td:nth-child(2){position:sticky;left:48px;background:var(--bg-3,#16161D);z-index:1}'
      + '.lv-table thead th:first-child,.lv-table thead th:nth-child(2){background:var(--raised,#22222C);z-index:3}'
      + '.lv-table td{padding:0 12px;height:54px;border-bottom:1px solid var(--border,#2A2A35);min-height:54px;text-align:right;color:var(--text,#F5F5F7)}'
      + '.lv-table td:not(:nth-child(2)){font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.lv-table td .ca-value-chip{margin-left:auto}'
      + '.lv-table tbody tr:nth-child(even) td{background:rgba(255,255,255,0.012)}'
      + '.lv-row-team{cursor:pointer}.lv-row-team:hover td{background:rgba(139,92,246,0.06)}.lv-row-team:hover td:first-child{box-shadow:inset 2px 0 0 var(--accent,#8b5cf6)}'
      + '.lv-team-cell{display:flex;align-items:center;gap:8px;font-family:var(--font-display,var(--font,system-ui));font-variation-settings:"wdth" 110;font-weight:700}'
      + '.lv-team-logo{width:22px;height:22px;border-radius:0;object-fit:contain;background:transparent;border:0}'
      + '.lv-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:12px}'
      + '.lv-card{background:var(--surface-1,#0c0c14);border:0.5px solid var(--border,#26262f);border-radius:var(--r-sm,8px);padding:12px 14px;display:flex;flex-direction:column;min-height:140px;box-shadow:var(--e-1,none)}'
      + '.lv-card-lab{font-size:11px;color:var(--text-2,#a1a1aa);letter-spacing:.06em;text-transform:uppercase}'
      + '.lv-card-val{font-size:36px;line-height:1.05;font-weight:800;color:var(--text,#f4f4f7);margin:8px 0;font-family:var(--mono,monospace);font-variant-numeric:tabular-nums}'
      + '.lv-card-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--text-2,#a1a1aa);margin-top:auto}'
      + '.lv-meter{height:6px;border-radius:var(--r-pill,999px);background:color-mix(in srgb, var(--text-3,#6b6b76) 22%, transparent);overflow:hidden;margin-top:8px}'
      + '.lv-meter>span{display:block;height:100%;background:var(--accent)}'
      + '.lv-phase{font-size:10px;color:var(--warn,#fbbf24);margin-left:6px}'
      + '.lv-note{font-size:12px;color:var(--text-2,#a1a1aa);padding:14px}';
    document.head.appendChild(style);
  }

  function normalizeFilter(f) {
    return MS.createFilterState ? MS.createFilterState(Object.assign({}, DEFAULTS.filter, f || {})) : Object.assign({}, DEFAULTS.filter, f || {});
  }
  function normalizeScope(s) {
    return MS.createScopeState ? MS.createScopeState(Object.assign({}, DEFAULTS.scope, s || {})) : Object.assign({}, DEFAULTS.scope, s || {});
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
    var scope = normalizeScope({
      mode: p.get('scope') || DEFAULTS.scope.mode,
      team: p.get('team') || DEFAULTS.scope.team
    });
    var family = String(p.get('family') || DEFAULTS.family).toLowerCase();
    if (family === 'surface') family = 'status';
    if (!FAMILY_DEFS[family]) family = DEFAULTS.family;
    var st = {
      filter: f,
      scope: scope,
      family: family,
      density: String(p.get('density') || DEFAULTS.density).toLowerCase(),
      sortKey: String(p.get('sort') || defaultSortKeyForFamily(family)),
      sortDir: String(p.get('dir') || DEFAULTS.sortDir).toLowerCase()
    };
    if (st.density !== 'core' && st.density !== 'advanced' && st.density !== 'all') st.density = 'core';
    normalizeSortState(st);
    return st;
  }

  function writeUrl(state) {
    var p = new URLSearchParams(location.search);
    var f = state.filter;
    p.set('hand', f.hand); p.set('loc', f.location); p.set('pitch', f.pitcher); p.set('side', f.batSide);
    p.set('seg', f.segment); p.set('window', f.window);
    p.set('scope', state.scope.mode); p.set('family', state.family);
    p.set('density', state.density || 'core');
    p.set('sort', state.sortKey); p.set('dir', state.sortDir);
    if (state.scope.mode === 'team' && state.scope.team) p.set('team', teamKey(state.scope.team)); else p.delete('team');
    p.delete('trend');
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
  }

  function nonDefaultTokens(state) {
    var out = [];
    if (state.scope.mode === 'team' && state.scope.team) out.push(teamKey(state.scope.team));
    else out.push('All teams');
    out.push(state.family === 'status' ? 'status-projection' : state.family);
    var f = state.filter;
    if (f.hand !== 'both') out.push(f.hand === 'r' ? 'vs RHP' : 'vs LHP');
    if (f.location !== 'all') out.push(f.location);
    if (f.pitcher !== 'both') out.push(f.pitcher === 'sp' ? 'vs SP' : 'vs RP');
    if (f.segment !== 'full') out.push('F5');
    if (f.window !== 'YTD') out.push(f.window);
    if (state.density && state.density !== 'core') out.push(state.density + ' density');
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
    if (key === 'woba') return A.metricColor(value, 'woba', false);
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
    if (safe == null) return '—';
    var color = rangeColor(safe, range, def && def.key);
    return '<span class="ca-value-chip" style="--vc:' + color + '">' + fmt(safe, def.digits) + '</span>';
  }
  function visibleDefsForDensity(defs, density) {
    var d = density || 'core';
    if (d === 'all') return (defs || []).slice();
    return (defs || []).filter(function(def) {
      if (d === 'advanced') return def.tier === 'advanced';
      return def.tier !== 'advanced';
    });
  }
  function rangeMapForDefs(rows, defs) {
    var out = {};
    (defs || []).forEach(function(def) {
      if (!def || def.placeholder || def.trend) return;
      out[def.key] = rangeFor(rows, def.key);
    });
    return out;
  }
  function ordinal(n) {
    n = Number(n) || 0;
    var m = n % 100;
    if (m >= 11 && m <= 13) return n + 'th';
    if (n % 10 === 1) return n + 'st';
    if (n % 10 === 2) return n + 'nd';
    if (n % 10 === 3) return n + 'rd';
    return n + 'th';
  }

  function teamLogoHtml(team, px) {
    if (MS && MS.teamLogo) return MS.teamLogo(team, px || 22);
    if (A && A.teamLogoImg) return A.teamLogoImg(team, px || 22, 'lv-team-logo');
    return '';
  }

  function renderControls(root, state, teams) {
    var rows = ''
      + '<div class="lv-sec">Scope</div>'
      + '<div class="lv-row">'
      + '<div class="lv-group"><div class="lv-pills">'
      + '<button class="lv-pill' + (state.scope.mode === 'all' ? ' active' : '') + '" data-a="scope" data-v="all">All teams</button>'
      + '<button class="lv-pill' + (state.scope.mode === 'team' ? ' active' : '') + '" data-a="scope" data-v="team">One team</button>'
      + '</div></div>'
      + '<div class="lv-group lv-team-wrap' + (state.scope.mode === 'team' ? ' show' : '') + '"><span class="lv-label">Team</span>'
      + '<div class="lv-input-row"><input id="lvTeamInput" class="lv-input" list="lvTeamList" value="' + esc(state.scope.team || '') + '" placeholder="Type team code..."><button class="lv-pill" data-a="team-apply">Apply</button></div>'
      + '<datalist id="lvTeamList">' + (teams || []).map(function(t) { return '<option value="' + esc(t) + '"></option>'; }).join('') + '</datalist>'
      + '<span id="lvTeamHelp" class="lv-help">Aliases: SF, TB, KC, SD, WSH, OAK, AZ</span></div>'
      + '</div>'
      + '<div class="lv-sec" style="margin-top:12px">Metric family</div>'
      + '<div class="lv-family-grid">'
      + familyCard('scoring', 'Scoring', 'How much damage the lineup does at the plate.', ['OSI', 'wRC+', 'wOBA', 'RCV'], state)
      + familyCard('difficulty', 'Difficulty', 'How hard the lineup is to pitch against.', ['ABQ', 'OBR', 'QS%', 'Pitch/Inn', 'PitchScore'], state)
      + familyCard('status', 'Status-Projection', 'How current output compares with projection/process.', ['projOSI', 'PP-Gap', 'PALS'], state)
      + '</div>'
      + '<div class="lv-sec">Lens context</div>'
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
      + '<div class="lv-cat"><div class="lv-cat-h">Table density</div>'
      + '<div class="lv-cat-row"><span class="lv-cat-k">Columns</span><div class="lv-pills">'
      + densityPill('core', 'Core', state) + densityPill('advanced', 'Advanced', state) + densityPill('all', 'All', state) + '</div></div>'
      + '</div>'
      + '</div>'
      + '<div class="lv-query ca-query-line">Showing <strong>' + esc(nonDefaultTokens(state).join(' · ')) + '</strong></div>';
    root.querySelector('.lv-controls').innerHTML = rows;
  }
  function pill(key, val, label, state, disabled) {
    var on = state.filter[key] === val;
    return '<button class="lv-pill' + (on ? ' active' : '') + '" data-a="f" data-k="' + key + '" data-v="' + val + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }
  function famPill(val, label, state) {
    return '<button class="lv-pill' + (state.family === val ? ' active' : '') + '" data-a="family" data-v="' + val + '">' + esc(label) + '</button>';
  }
  function densityPill(val, label, state) {
    var on = (state.density || 'core') === val;
    return '<button class="lv-pill' + (on ? ' active' : '') + '" data-a="density" data-v="' + val + '">' + esc(label) + '</button>';
  }
  function familyCard(val, name, desc, chips, state) {
    var on = state.family === val;
    return '<button class="lv-family' + (on ? ' active' : '') + '" data-a="family" data-v="' + val + '">'
      + '<div class="lv-family-top"><span class="lv-family-name">' + esc(name) + '</span><span class="lv-family-n">' + chips.length + ' metrics</span></div>'
      + '<div class="lv-family-desc">' + esc(desc) + '</div>'
      + '<div class="lv-family-chips">' + chips.map(function(ch) {
        var phase = (ch === 'QS%' || ch === 'Pitch/Inn' || ch === 'PitchScore' || ch === 'PP-Gap');
        return '<span class="lv-family-chip' + (phase ? ' phase' : '') + '">' + esc(ch) + '</span>';
      }).join('') + '</div></button>';
  }

  function teamAliasesResolve(raw, teams) {
    var tk = teamKey(raw).replace(/[^A-Z]/g, '');
    if (!tk) return null;
    var allowed = {};
    (teams || []).forEach(function(t) { allowed[teamKey(t)] = true; });
    if (allowed[tk]) return tk;
    var alias = TEAM_ALIASES[tk];
    if (alias && allowed[alias]) return alias;
    var starts = (teams || []).filter(function(t) { return teamKey(t).indexOf(tk) === 0; });
    return starts.length === 1 ? teamKey(starts[0]) : null;
  }

  function renderBody(root, state, rows) {
    var mount = root.querySelector('.lv-body');
    var defs = visibleDefsForDensity(familyDefs(state.family), state.density);
    var ranges = rangeMapForDefs(rows, defs);
    if (state.scope.mode === 'team' && state.scope.team) {
      var row = (rows || []).find(function(r) { return teamKey(r.t) === teamKey(state.scope.team); });
      if (!row) {
        mount.innerHTML = '<div class="lv-note">No team row found for current context.</div>';
        return;
      }
      var cards = defs.map(function(def) {
        var valHtml = '—';
        var meta = '<span>—</span><span>—</span>';
        var meter = '';
        if (def.placeholder) {
          valHtml = '— <span class="lv-phase">Phase 1</span>';
        } else {
          var raw = row[def.key];
          var safe = sanityOk(def, raw) ? raw : null;
          valHtml = safe == null ? '—' : fmt(safe, def.digits);
          if (safe == null && raw != null) console.warn('[LineupView] sanity fail', def.key, row.t, raw);
          var rankRow = (rows || []).filter(function(r) { return num(r[def.key]) != null; }).sort(function(a, b) { return num(b[def.key]) - num(a[def.key]); });
          var idx = rankRow.findIndex(function(r) { return r.t === row.t; });
          if (idx >= 0) {
            var rank = idx + 1;
            var pct = rankRow.length > 1 ? Math.round(((rankRow.length - rank) / (rankRow.length - 1)) * 100) : 100;
            meta = '<span>' + ordinal(rank) + ' of ' + rankRow.length + '</span><span>' + ordinal(pct) + ' pct</span>';
            meter = '<div class="lv-meter"><span style="width:' + pct + '%"></span></div>';
          }
        }
        return '<article class="lv-card"><div class="lv-card-lab">' + esc(def.label) + '</div>'
          + '<div class="lv-card-val">' + valueChipHtml(row[def.key], def, ranges[def.key]) + '</div>'
          + '<div class="lv-card-meta">' + meta + '</div>' + meter + '</article>';
      }).join('');
      mount.innerHTML = '<div class="lv-note" style="padding:0 0 10px 0"><span class="lv-team-cell">'
        + teamLogoHtml(row.t, 28) + '<strong style="font-size:18px">' + esc(row.t) + '</strong></span></div>'
        + '<div class="lv-card-grid">' + cards + '</div>';
      return;
    }

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
        return '<td class="' + (state.sortKey === def.key ? 'sort-col' : '') + '">' + valueChipHtml(safe, def, ranges[def.key]) + '</td>';
      }).join('');
      return '<tr class="lv-row-team" data-team="' + esc(r.t) + '"><td>' + (idx + 1) + '</td><td><span class="lv-team-cell">'
        + teamLogoHtml(r.t, 22) + '<strong>' + esc(r.t) + '</strong></span></td>' + cols + '</tr>';
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
        } else if (a === 'scope') {
          ctx.state.scope.mode = btn.dataset.v;
          if (ctx.state.scope.mode === 'all') ctx.state.scope.team = null;
          rerender(root, ctx);
        } else if (a === 'family') {
          ctx.state.family = btn.dataset.v;
          normalizeSortState(ctx.state);
          rerender(root, ctx);
        } else if (a === 'density') {
          ctx.state.density = btn.dataset.v || 'core';
          rerender(root, ctx);
        } else if (a === 'team-apply') {
          var input = root.querySelector('#lvTeamInput');
          var t = teamAliasesResolve(input && input.value, ctx.teams);
          var help = root.querySelector('#lvTeamHelp');
          if (!t) {
            if (help) { help.classList.add('error'); help.textContent = 'Team not found. Try SFG or alias SF.'; }
            return;
          }
          if (help) { help.classList.remove('error'); help.textContent = 'Aliases: SF, TB, KC, SD, WSH, OAK, AZ'; }
          ctx.state.scope.mode = 'team';
          ctx.state.scope.team = t;
          rerender(root, ctx);
        }
      }
      var tr = e.target.closest('tr.lv-row-team');
      if (tr) {
        ctx.state.scope.mode = 'team';
        ctx.state.scope.team = teamKey(tr.getAttribute('data-team'));
        rerender(root, ctx);
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
    renderControls(root, ctx.state, ctx.teams);
    root.querySelector('.lv-body').innerHTML = '<div class="lv-note">Loading lineup model…</div>';
    LM.rankAll(ctx.state.filter, ctx.state.family).then(function(rows) {
      rows = rows || [];
      ctx.teams = rows.map(function(r) { return r.t; }).sort();
      if (ctx.state.scope.mode === 'team' && !ctx.state.scope.team && ctx.teams.length) ctx.state.scope.team = ctx.teams[0];
      renderControls(root, ctx.state, ctx.teams);
      renderBody(root, ctx.state, rows);
      return null;
    }).then(function() {
      if (!A || !A.registerLeaguePool || !LM.leaguePool) return null;
      return Promise.all(['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba'].map(function(k) {
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
    state.scope = normalizeScope(state.scope);
    normalizeSortState(state);
    var shell = document.createElement('div');
    shell.className = 'lv-wrap';
    shell.innerHTML = '<div class="lv-bar"><div class="lv-controls"></div></div><div class="lv-body"></div>';
    el.innerHTML = '';
    el.appendChild(shell);
    var ctx = { state: state, teams: [] };
    bind(shell, ctx);
    rerender(shell, ctx);
    return {
      rerender: function() { rerender(shell, ctx); },
      getState: function() { return JSON.parse(JSON.stringify(ctx.state)); }
    };
  }

  global.LineupView = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
