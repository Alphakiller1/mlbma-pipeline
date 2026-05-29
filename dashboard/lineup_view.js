// lineup_view.js — unified Team Rankings / Splits / Trends view (Phase 0)
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
    trend: false
  };

  var FAMILY_DEFS = {
    scoring: [
      { key: 'osi', label: 'OSI', digits: 1, phase: 0, sanity: [0, 150] },
      { key: 'wrc', label: 'wRC+', digits: 0, phase: 0, sanity: [40, 200] },
      { key: 'woba', label: 'wOBA', digits: 3, phase: 0, sanity: [0.25, 0.45] },
      { key: 'rcv', label: 'RCV', digits: 1, phase: 0, sanity: [0, 150] },
      { key: 'trend', label: 'TREND', trend: true, phase: 0 }
    ],
    difficulty: [
      { key: 'abq', label: 'ABQ', digits: 1, phase: 0, sanity: [0, 150] },
      { key: 'obr', label: 'OBR', digits: 1, phase: 0, sanity: [0, 150] },
      { key: 'qs', label: 'QS%', digits: 1, phase: 0, sanity: [0, 100] },
      { key: 'pitchInn', label: 'Pitch/Inn', digits: 1, phase: 0, sanity: [8, 30] },
      { key: 'pitchScore', label: 'PitchScore', digits: 1, phase: 0, sanity: [0, 150] },
      { key: 'trend', label: 'TREND', trend: true, phase: 0 }
    ],
    surface: [
      { key: 'winPct', label: 'Win%', digits: 1, phase: 0, sanity: [0, 100] },
      { key: 'f5WinPct', label: 'F5 Win%', digits: 1, phase: 0, sanity: [0, 100] },
      { key: 'pitcherWinPct', label: 'Pitcher Win%', digits: 1, phase: 0, sanity: [0, 100] },
      { key: 'trend', label: 'TREND', trend: true, phase: 0 }
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
      + '.lv-wrap{margin-top:12px}'
      + '.lv-bar{background:#111114;border:1px solid #28282f;border-radius:12px;padding:12px 14px;margin-bottom:10px}'
      + '.lv-row{display:flex;flex-wrap:wrap;gap:12px 14px;align-items:flex-start}'
      + '.lv-group{display:flex;flex-direction:column;gap:6px}'
      + '.lv-label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#71717a;font-weight:600}'
      + '.lv-pills{display:flex;flex-wrap:wrap;gap:6px}'
      + '.lv-pill{border:1px solid #28282f;background:#18181c;color:#a1a1aa;font-size:11px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer}'
      + '.lv-pill:hover{border-color:rgba(192,132,252,.4);color:#f4f4f7}'
      + '.lv-pill.active{background:rgba(192,132,252,.18);border-color:#c084fc;color:#c084fc}'
      + '.lv-pill[disabled],.lv-disabled .lv-pill{opacity:.45;cursor:not-allowed}'
      + '.lv-query{font-size:12px;color:#a1a1aa;margin-top:8px;padding-top:8px;border-top:1px solid #28282f}'
      + '.lv-team-wrap{display:none}.lv-team-wrap.show{display:flex}'
      + '.lv-input{border:1px solid #28282f;background:#18181c;color:#f4f4f7;padding:7px 10px;border-radius:8px;min-width:160px;font-size:12px;font-weight:600}'
      + '.lv-input-row{display:flex;gap:6px;align-items:center}'
      + '.lv-help{font-size:10px;color:#71717a}.lv-help.error{color:#f87171}'
      + '.lv-table-wrap{overflow:auto;border:1px solid #28282f;border-radius:12px;background:#111114}'
      + '.lv-table{width:100%;border-collapse:collapse;font-size:13px}'
      + '.lv-table th{position:sticky;top:0;background:#18181c;color:#71717a;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:10px;border-bottom:1px solid #28282f;text-align:left}'
      + '.lv-table td{padding:9px 10px;border-bottom:1px solid rgba(40,40,47,.8)}'
      + '.lv-row-team{cursor:pointer}.lv-row-team:hover{background:rgba(192,132,252,.06)}'
      + '.lv-team-cell{display:flex;align-items:center;gap:8px}'
      + '.lv-team-logo{width:22px;height:22px;border-radius:50%;object-fit:contain;background:#0a0a0a;border:1px solid #28282f}'
      + '.lv-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:12px}'
      + '.lv-card{background:#111114;border:1px solid #28282f;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;min-height:140px}'
      + '.lv-card-lab{font-size:11px;color:#a1a1aa;letter-spacing:.06em;text-transform:uppercase}'
      + '.lv-card-val{font-size:36px;line-height:1.05;font-weight:800;color:#f4f4f7;margin:8px 0}'
      + '.lv-card-meta{display:flex;justify-content:space-between;font-size:12px;color:#a1a1aa;margin-top:auto}'
      + '.lv-meter{height:6px;border-radius:999px;background:rgba(113,113,122,.22);overflow:hidden;margin-top:8px}'
      + '.lv-meter>span{display:block;height:100%;background:linear-gradient(90deg,#60a5fa,#a78bfa)}'
      + '.lv-phase{font-size:10px;color:#fbbf24;margin-left:6px}'
      + '.lv-note{font-size:12px;color:#a1a1aa;padding:14px}'
      + '.lv-trend{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px}'
      + '.lv-badge-pos{background:rgba(74,222,128,.15);color:#4ade80}.lv-badge-neg{background:rgba(248,113,113,.15);color:#f87171}.lv-badge-flat{background:rgba(113,113,122,.2);color:#a1a1aa}';
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
    if (!FAMILY_DEFS[family]) family = DEFAULTS.family;
    return { filter: f, scope: scope, family: family, trend: p.get('trend') === '1' };
  }

  function writeUrl(state) {
    var p = new URLSearchParams(location.search);
    var f = state.filter;
    p.set('hand', f.hand); p.set('loc', f.location); p.set('pitch', f.pitcher); p.set('side', f.batSide);
    p.set('seg', f.segment); p.set('window', f.window);
    p.set('scope', state.scope.mode); p.set('family', state.family);
    if (state.scope.mode === 'team' && state.scope.team) p.set('team', teamKey(state.scope.team)); else p.delete('team');
    if (state.trend) p.set('trend', '1'); else p.delete('trend');
    history.replaceState(null, '', location.pathname + '?' + p.toString() + location.hash);
  }

  function nonDefaultTokens(state) {
    var out = [];
    if (state.scope.mode === 'team' && state.scope.team) out.push(teamKey(state.scope.team));
    else out.push('All teams');
    out.push(state.family);
    var f = state.filter;
    if (f.hand !== 'both') out.push(f.hand === 'r' ? 'vs RHP' : 'vs LHP');
    if (f.location !== 'all') out.push(f.location);
    if (f.pitcher !== 'both') out.push(f.pitcher === 'sp' ? 'vs SP' : 'vs RP');
    if (f.segment !== 'full') out.push('F5');
    if (f.window !== 'YTD') out.push(f.window);
    if (state.trend) out.push('delta vs YTD');
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
    if (!A || !A.metricColor) return '#f4f4f7';
    if (key === 'wrc') return A.metricColor(value, 'wrc', false);
    if (key === 'woba') return A.metricColor(value, 'woba', false);
    return A.metricColor(value, key, false);
  }
  function trendBadge(delta) {
    var d = num(delta);
    if (d == null) return '<span class="lv-trend lv-badge-flat">—</span>';
    if (d > 0.25) return '<span class="lv-trend lv-badge-pos">+' + d.toFixed(2) + '</span>';
    if (d < -0.25) return '<span class="lv-trend lv-badge-neg">' + d.toFixed(2) + '</span>';
    return '<span class="lv-trend lv-badge-flat">' + d.toFixed(2) + '</span>';
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
    var surfaceMode = state.family === 'surface';
    var rows = ''
      + '<div class="lv-row">'
      + '<div class="lv-group"><span class="lv-label">Scope</span><div class="lv-pills">'
      + '<button class="lv-pill' + (state.scope.mode === 'all' ? ' active' : '') + '" data-a="scope" data-v="all">All teams</button>'
      + '<button class="lv-pill' + (state.scope.mode === 'team' ? ' active' : '') + '" data-a="scope" data-v="team">One team</button>'
      + '</div></div>'
      + '<div class="lv-group lv-team-wrap' + (state.scope.mode === 'team' ? ' show' : '') + '"><span class="lv-label">Team</span>'
      + '<div class="lv-input-row"><input id="lvTeamInput" class="lv-input" list="lvTeamList" value="' + esc(state.scope.team || '') + '" placeholder="Type team code..."><button class="lv-pill" data-a="team-apply">Apply</button></div>'
      + '<datalist id="lvTeamList">' + (teams || []).map(function(t) { return '<option value="' + esc(t) + '"></option>'; }).join('') + '</datalist>'
      + '<span id="lvTeamHelp" class="lv-help">Aliases: SF, TB, KC, SD, WSH, OAK, AZ</span></div>'
      + '</div>'
      + '<div class="lv-row" style="margin-top:8px">'
      + '<div class="lv-group' + (surfaceMode ? ' lv-disabled' : '') + '" title="' + (surfaceMode ? 'Not applicable for Surface wins' : '') + '"><span class="lv-label">Hand</span><div class="lv-pills">'
      + pill('hand', 'both', 'Both', state, surfaceMode) + pill('hand', 'r', 'vs RHP', state, surfaceMode) + pill('hand', 'l', 'vs LHP', state, surfaceMode) + '</div></div>'
      + '<div class="lv-group"><span class="lv-label">Location</span><div class="lv-pills">'
      + pill('location', 'all', 'All', state, false) + pill('location', 'home', 'Home', state, false) + pill('location', 'away', 'Away', state, false) + '</div></div>'
      + '<div class="lv-group' + (surfaceMode ? ' lv-disabled' : '') + '" title="' + (surfaceMode ? 'Not applicable for Surface wins' : '') + '"><span class="lv-label">Pitch</span><div class="lv-pills">'
      + pill('pitcher', 'both', 'Both', state, surfaceMode) + pill('pitcher', 'sp', 'SP', state, surfaceMode) + pill('pitcher', 'rp', 'RP', state, surfaceMode) + '</div></div>'
      + '<div class="lv-group lv-disabled" title="Bat side aggregation coming in Phase 2"><span class="lv-label">Side</span><div class="lv-pills">'
      + pill('batSide', 'both', 'Both', state, true) + pill('batSide', 'rhb', 'RHB', state, true) + pill('batSide', 'lhb', 'LHB', state, true) + '</div></div>'
      + '<div class="lv-group"><span class="lv-label">Segment</span><div class="lv-pills">'
      + pill('segment', 'full', 'Full', state, false) + pill('segment', 'f5', 'F5', state, false) + '</div></div>'
      + '<div class="lv-group"><span class="lv-label">Window</span><div class="lv-pills">'
      + pill('window', 'YTD', 'YTD', state, false) + pill('window', 'L30', 'L30', state, false) + pill('window', 'L14', 'L14', state, false) + pill('window', 'L7', 'L7', state, false) + '</div></div>'
      + '</div>'
      + '<div class="lv-row" style="margin-top:8px">'
      + '<div class="lv-group"><span class="lv-label">Family</span><div class="lv-pills">'
      + famPill('scoring', 'Scoring', state) + famPill('difficulty', 'Difficulty', state) + famPill('surface', 'Surface wins', state)
      + '</div></div>'
      + '<div class="lv-group"><span class="lv-label">Trend</span><div class="lv-pills">'
      + '<button class="lv-pill' + (state.trend ? ' active' : '') + '" data-a="trend">Δ vs YTD</button>'
      + '</div></div>'
      + '</div>'
      + '<div class="lv-query">' + esc(nonDefaultTokens(state).join(' · ')) + '</div>';
    root.querySelector('.lv-controls').innerHTML = rows;
  }
  function pill(key, val, label, state, disabled) {
    var on = state.filter[key] === val;
    return '<button class="lv-pill' + (on ? ' active' : '') + '" data-a="f" data-k="' + key + '" data-v="' + val + '"' + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
  }
  function famPill(val, label, state) {
    return '<button class="lv-pill' + (state.family === val ? ' active' : '') + '" data-a="family" data-v="' + val + '">' + esc(label) + '</button>';
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

  function renderBody(root, state, rows, deltaMap) {
    var mount = root.querySelector('.lv-body');
    var defs = familyDefs(state.family);
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
        } else if (def.trend) {
          valHtml = trendBadge(deltaMap[row.t + '|osi']);
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
          + '<div class="lv-card-val" style="color:' + colorMetric(def.key, row[def.key]) + '">' + valHtml + '</div>'
          + '<div class="lv-card-meta">' + meta + '</div>' + meter + '</article>';
      }).join('');
      mount.innerHTML = '<div class="lv-note" style="padding:0 0 10px 0"><span class="lv-team-cell">'
        + teamLogoHtml(row.t, 28) + '<strong style="font-size:18px">' + esc(row.t) + '</strong></span></div>'
        + '<div class="lv-card-grid">' + cards + '</div>';
      return;
    }

    var head = '<tr><th>#</th><th>Team</th>' + defs.map(function(def) {
      return '<th>' + esc(def.label) + (def.placeholder ? ' <span class="lv-phase">Phase 1</span>' : '') + '</th>';
    }).join('') + '</tr>';
    var body = (rows || []).map(function(r, idx) {
      var cols = defs.map(function(def) {
        if (def.placeholder) return '<td>— <span class="lv-phase">Phase 1</span></td>';
        if (def.trend) return '<td>' + trendBadge(deltaMap[r.t + '|osi']) + '</td>';
        var raw = r[def.key];
        var safe = sanityOk(def, raw) ? raw : null;
        if (safe == null && raw != null) console.warn('[LineupView] sanity fail', def.key, r.t, raw);
        return '<td style="color:' + colorMetric(def.key, safe) + '">' + (safe == null ? '—' : fmt(safe, def.digits)) + '</td>';
      }).join('');
      return '<tr class="lv-row-team" data-team="' + esc(r.t) + '"><td>' + (idx + 1) + '</td><td><span class="lv-team-cell">'
        + teamLogoHtml(r.t, 22) + '<strong>' + esc(r.t) + '</strong></span></td>' + cols + '</tr>';
    }).join('');
    mount.innerHTML = '<div class="lv-table-wrap"><table class="lv-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function bind(root, ctx) {
    root.addEventListener('click', function(e) {
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
          if (ctx.state.family === 'surface') ctx.state.filter.batSide = 'both';
          rerender(root, ctx);
        } else if (a === 'trend') {
          ctx.state.trend = !ctx.state.trend;
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
      var runYtd = ctx.state.trend || ctx.state.filter.window !== 'YTD';
      if (!runYtd) {
        renderControls(root, ctx.state, ctx.teams);
        renderBody(root, ctx.state, rows, {});
        return null;
      }
      var ytdFilter = Object.assign({}, ctx.state.filter, { window: 'YTD' });
      return LM.rankAll(ytdFilter, ctx.state.family).then(function(ytdRows) {
        var yMap = {};
        (ytdRows || []).forEach(function(r) { yMap[teamKey(r.t)] = r; });
        var delta = {};
        rows.forEach(function(r) {
          var y = yMap[teamKey(r.t)];
          delta[r.t + '|osi'] = y && num(r.osi) != null && num(y.osi) != null ? num(r.osi) - num(y.osi) : null;
        });
        renderControls(root, ctx.state, ctx.teams);
        renderBody(root, ctx.state, rows, delta);
      });
    }).then(function() {
      if (!A || !A.registerLeaguePool || !LM.leaguePool) return null;
      return Promise.all(['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba'].map(function(k) {
        return LM.leaguePool(k).then(function(pool) {
          if (pool && pool.values && pool.values.length) A.registerLeaguePool(k, pool.values);
        });
      }));
    }).catch(function(err) {
      console.error('[LineupView] render failed', err);
      root.querySelector('.lv-body').innerHTML = '<div class="lv-note" style="color:#f87171">Render error: ' + esc(err && err.message ? err.message : String(err)) + '</div>';
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
