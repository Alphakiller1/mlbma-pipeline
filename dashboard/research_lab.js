/**
 * Research Lab UIX — compare in-pane, leaderboards, pitching vs lineup, model links.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;

  var RL = {
    compareMode: 'team',
    compareA: '',
    compareB: '',
    spProfiles: null,
    pvlTeam: '',
    pvlPitcher: '',
    pvlBpTeam: ''
  };

  var SUBTABS = ['research-home', 'splits-trends', 'compare', 'pitching-vs-lineup', 'pitching', 'leaderboards', 'model-links'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mColor(v, invert) {
    return A && A.metricColor ? A.metricColor(v, 'osi', !!invert) : '#71717A';
  }

  function teamList() {
    var rows = global.SCO_YTD_B || [];
    return rows.map(function(d) { return d.t; }).filter(Boolean).sort();
  }

  function teamRow(t) {
    return (global.SCO_YTD_B || []).find(function(d) { return d.t === t; });
  }

  function fetchSpProfiles() {
    if (RL.spProfiles) return Promise.resolve(RL.spProfiles);
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      RL.spProfiles = rows || [];
      return RL.spProfiles;
    }).catch(function() { return []; });
  }

  function pitcherOptions() {
    var names = {};
    (global.LIVE_DATA && LIVE_DATA.matchups || []).forEach(function(m) {
      if (m.awaySP && m.awaySP !== 'TBD') names[m.awaySP] = m.away;
      if (m.homeSP && m.homeSP !== 'TBD') names[m.homeSP] = m.home;
    });
    (RL.spProfiles || []).forEach(function(row) {
      var n = S ? S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher') : '';
      if (n) names[n] = S.pickCol(row, 'pitcher_team', 'Team', 'Tm');
    });
    return Object.keys(names).sort().map(function(n) {
      return { name: n, team: names[n] };
    });
  }

  function findSpProfile(name) {
    if (!S || !name) return null;
    return S.findSpProfile(RL.spProfiles || [], name, null);
  }

  function mountWorkspaceHeader() {
    var el = document.getElementById('researchLabHeader');
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = '1';
    el.innerHTML = '<div class="rl-workspace-header">'
      + '<h2 class="rl-workspace-title"><img src="assets/chase-icon-filled.png" alt="" width="24" height="24" style="width:24px;height:24px;object-fit:contain" onerror="this.style.display=\'none\'">Research Lab</h2>'
      + '<p class="rl-workspace-subtitle">Validate model signals with splits, trends, comparisons, and pitching context.</p>'
      + '<div class="rl-workflow-strip">'
      + '<span class="rl-workflow-step">1 · Select</span>'
      + '<span class="rl-workflow-step">2 · Split / Window</span>'
      + '<span class="rl-workflow-step">3 · Compare</span>'
      + '<span class="rl-workflow-step">4 · Deep Dive</span>'
      + '</div></div>';
  }

  function patchSubtabs() {
    mountWorkspaceHeader();
    var layer = document.getElementById('layerAdvanced');
    if (!layer) return;
    var tabBar = layer.querySelector('.subtabs');
    if (tabBar && !tabBar.classList.contains('rl-segment-tabs')) {
      tabBar.classList.add('rl-segment-tabs');
      tabBar.innerHTML = ''
        + '<button type="button" class="subtab" data-pane="research-home">Research Home</button>'
        + '<button type="button" class="subtab active" data-pane="splits-trends">Splits &amp; Trends</button>'
        + '<button type="button" class="subtab" data-pane="compare">Compare</button>'
        + '<button type="button" class="subtab" data-pane="pitching-vs-lineup">Pitching vs Lineup</button>'
        + '<button type="button" class="subtab" data-pane="pitching">Pitching Context</button>'
        + '<button type="button" class="subtab" data-pane="leaderboards">Leaderboards</button>'
        + '<button type="button" class="subtab" data-pane="model-links">Model Links</button>';
    }
    global.RESEARCH_SUBTABS = SUBTABS;
  }

  function restoreSplitsTable() {
    var anchor = document.getElementById('masterTableAnchor');
    var section = document.getElementById('masterTableSection');
    if (anchor && section && section.parentNode !== anchor) anchor.appendChild(section);
  }

  function mountLeaderboards() {
    var mount = document.getElementById('leaderboardsRankingsMount');
    var table = document.getElementById('masterTable');
    if (!mount || !table) return;
    var section = document.getElementById('masterTableSection');
    if (section && section.parentNode !== mount) mount.appendChild(section);
    if (!table.dataset.platformHeaders) {
      table.dataset.platformHeaders = '1';
      if (global.STATE) {
        global.STATE.showAdvancedMetrics = true;
        document.body.classList.add('show-advanced-metrics');
      }
      var thead = table.querySelector('thead tr');
      if (thead) {
        thead.innerHTML = '<th style="width:30px;">#</th><th data-sort="t">Team</th><th data-sort="abq">ABQ</th><th data-sort="rcv">RCV</th><th data-sort="obr">OBR</th><th data-sort="osi" class="sorted">OSI</th><th data-sort="projOSI">ProjOSI</th><th data-sort="ppGap">PP-Gap</th><th>PALS</th><th data-sort="trend">Trend</th>';
        if (typeof bindMasterTableSort === 'function') bindMasterTableSort();
      }
    }
    if (typeof hideRankSkeleton === 'function') hideRankSkeleton();
    if (typeof renderMasterTable === 'function') renderMasterTable();
  }

  function renderComparePane() {
    var root = document.getElementById('rlCompareRoot');
    if (!root) return;

    var teams = teamList();
    var pitchers = pitcherOptions();

    root.innerHTML = '<div class="rl-compare-modes">'
      + ['team', 'pitcher', 'bullpen', 'lineup-pitcher'].map(function(m) {
        var lbl = { team: 'Team vs Team', pitcher: 'Pitcher vs Pitcher', bullpen: 'Bullpen vs Bullpen', 'lineup-pitcher': 'Lineup vs Pitcher' }[m];
        return '<button type="button" class="rl-compare-mode-btn' + (RL.compareMode === m ? ' active' : '') + '" data-cmode="' + m + '">' + lbl + '</button>';
      }).join('')
      + '</div>'
      + '<div class="rl-compare-selectors" id="rlCompareSelectors"></div>'
      + '<div id="rlCompareOutput"></div>';

    root.querySelectorAll('[data-cmode]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        RL.compareMode = btn.getAttribute('data-cmode');
        RL.compareA = '';
        RL.compareB = '';
        renderCompareSelectors();
        renderCompareOutput();
        root.querySelectorAll('[data-cmode]').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-cmode') === RL.compareMode);
        });
      });
    });

    renderCompareSelectors();
    renderCompareOutput();
  }

  function searchSelectHtml(id, label, options, val, placeholder) {
    var listId = id + 'List';
    return '<div><label for="' + id + '">' + label + '</label>'
      + '<div class="rl-search-wrap">'
      + '<input type="search" id="' + id + '" list="' + listId + '" value="' + esc(val || '') + '" placeholder="' + esc(placeholder || 'Search…') + '" autocomplete="off">'
      + '<datalist id="' + listId + '">'
      + options.map(function(o) {
        var v = typeof o === 'string' ? o : o.value;
        var t = typeof o === 'string' ? o : o.label;
        return '<option value="' + esc(v) + '">' + esc(t) + '</option>';
      }).join('')
      + '</datalist></div></div>';
  }

  function bindSearchInput(id, onPick) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('change', function() { onPick(inp.value); });
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); onPick(inp.value); }
    });
  }

  function renderCompareSelectors() {
    var el = document.getElementById('rlCompareSelectors');
    if (!el) return;
    var teams = teamList();
    var pitchers = pitcherOptions();
    var mode = RL.compareMode;

    var html = '';
    if (mode === 'team' || mode === 'bullpen') {
      html = searchSelectHtml('rlCmpA', mode === 'bullpen' ? 'Bullpen A' : 'Team A', teams, RL.compareA, 'Search teams…')
        + searchSelectHtml('rlCmpB', mode === 'bullpen' ? 'Bullpen B' : 'Team B', teams, RL.compareB, 'Search teams…');
    } else if (mode === 'pitcher') {
      var popts = pitchers.map(function(p) { return { value: p.name, label: p.name + ' (' + p.team + ')' }; });
      html = searchSelectHtml('rlCmpA', 'Pitcher A', popts, RL.compareA, 'Search pitchers…')
        + searchSelectHtml('rlCmpB', 'Pitcher B', popts, RL.compareB, 'Search pitchers…');
    } else {
      html = searchSelectHtml('rlCmpA', 'Lineup Team', teams, RL.compareA, 'Search teams…')
        + searchSelectHtml('rlCmpB', 'Opposing SP', pitchers.map(function(p) { return { value: p.name, label: p.name }; }), RL.compareB, 'Search SP…');
    }
    html += '<div class="rl-compare-actions">'
      + '<button type="button" class="rl-compare-run" id="rlCmpRun">Compare</button>'
      + '<button type="button" id="rlCmpSwap">Swap</button>'
      + '<button type="button" id="rlCmpClear">Clear</button></div>';
    el.innerHTML = html;

    bindSearchInput('rlCmpA', function(v) { RL.compareA = v; });
    bindSearchInput('rlCmpB', function(v) { RL.compareB = v; });
    var run = document.getElementById('rlCmpRun');
    if (run) run.addEventListener('click', function() {
      var a = document.getElementById('rlCmpA');
      var b = document.getElementById('rlCmpB');
      if (a) RL.compareA = a.value;
      if (b) RL.compareB = b.value;
      renderCompareOutput();
    });
    var swap = document.getElementById('rlCmpSwap');
    var clr = document.getElementById('rlCmpClear');
    if (swap) swap.addEventListener('click', function() {
      var t = RL.compareA; RL.compareA = RL.compareB; RL.compareB = t;
      renderCompareSelectors();
      renderCompareOutput();
    });
    if (clr) clr.addEventListener('click', function() {
      RL.compareA = ''; RL.compareB = '';
      renderCompareSelectors();
      renderCompareOutput();
    });
  }

  function renderCompareOutput() {
    var out = document.getElementById('rlCompareOutput');
    if (!out) return;
    if (!RL.compareA || !RL.compareB) {
      out.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Select two entities above to generate a side-by-side comparison.</p></div>';
      return;
    }

    if (RL.compareMode === 'team') {
      renderTeamCompare(out);
    } else if (RL.compareMode === 'pitcher') {
      renderPitcherCompare(out);
    } else if (RL.compareMode === 'bullpen') {
      renderBullpenCompare(out);
    } else {
      renderLineupPitcherCompare(out);
    }
  }

  function renderTeamCompare(out) {
    var a = teamRow(RL.compareA);
    var b = teamRow(RL.compareB);
    if (!a || !b) {
      out.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Team data not available for selection.</p></div>';
      return;
    }
    var keys = [
      ['osi', 'OSI', false], ['abq', 'ABQ', false], ['rcv', 'RCV', false], ['obr', 'OBR', false],
      ['projOSI', 'ProjOSI', false], ['ppGap', 'PP-Gap', false]
    ];
    var edge = a.osi > b.osi + 2 ? a.t : (b.osi > a.osi + 2 ? b.t : 'Even');
    out.innerHTML = scorecardsHtml(a, b, 'Team') + edgeCard(edge, 'OSI edge based on composite offensive strength.')
      + metricTable(keys, a, b)
      + '<div id="rlTeamRadar" class="mc-radar-mount" style="margin:16px auto;"></div>'
      + profileLinks(a.t, b.t, null, null);
    if (global.STATE) global.STATE.compareTeams = [a.t, b.t];
    setTimeout(function() {
      if (!global.MLBMACharts) return;
      var metrics = ['ABQ', 'RCV', 'OBR', 'ProjOSI', 'Sustain', 'Split Edge'];
      MLBMACharts.buildRadarChart('rlTeamRadar', [
        { abbr: a.t, values: MLBMACharts.teamRadarValues(a) },
        { abbr: b.t, values: MLBMACharts.teamRadarValues(b) }
      ], metrics, ['#7C3AED', '#0891B2'], { size: 320 });
    }, 0);
  }

  function pitcherAvatarHtml(name, sizeKey) {
    if (!A || !name) return '';
    return A.pitcherAvatar(name, { crop: sizeKey === 'matchup' ? 'matchup' : 'compare', className: 'rl-compare-avatar' });
  }

  function renderPitcherCompare(out) {
    var pa = findSpProfile(RL.compareA);
    var pb = findSpProfile(RL.compareB);
    var ma = pa && S ? S.spProfileMetrics(pa) : {};
    var mb = pb && S ? S.spProfileMetrics(pb) : {};
    var psA = ma.osiAllowed != null ? 100 - ma.osiAllowed : null;
    var psB = mb.osiAllowed != null ? 100 - mb.osiAllowed : null;
    var edge = (psA || 0) > (psB || 0) + 5 ? RL.compareA : ((psB || 0) > (psA || 0) + 5 ? RL.compareB : 'Even');
    out.innerHTML = '<div class="rl-scorecards rl-scorecards--pitchers">'
      + pitcherScorecard(RL.compareA, 'Pitching Score', psA, false)
      + pitcherScorecard(RL.compareB, 'Pitching Score', psB, false)
      + '</div>' + edgeCard(edge, 'Lower OSI allowed = stronger pitcher profile.')
      + '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr><th>Metric</th><th>' + esc(RL.compareA) + '</th><th>' + esc(RL.compareB) + '</th></tr></thead><tbody>'
      + row3('K%', ma.kPct, mb.kPct, true) + row3('BB%', ma.bbPct, mb.bbPct, true)
      + row3('OSI Allowed', ma.osiAllowed, mb.osiAllowed, true, true)
      + row3('OOR', ma.oor, mb.oor, true)
      + '</tbody></table></div>'
      + profileLinks(null, null, RL.compareA, RL.compareB);
  }

  function bpScore(u) {
    return u && u.osiAllowed != null ? Math.max(0, 100 - u.osiAllowed) : null;
  }

  function renderBullpenCompare(out) {
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var ua = units[RL.compareA] || units[(RL.compareA || '').toUpperCase()];
    var ub = units[RL.compareB] || units[(RL.compareB || '').toUpperCase()];
    var sa = bpScore(ua);
    var sb = bpScore(ub);
    var edge = (sa || 0) > (sb || 0) + 5 ? RL.compareA : ((sb || 0) > (sa || 0) + 5 ? RL.compareB : 'Even');
    out.innerHTML = '<div class="rl-scorecards">'
      + scorecardOne(RL.compareA, 'Bullpen Score', sa, false)
      + scorecardOne(RL.compareB, 'Bullpen Score', sb, false)
      + '</div>' + edgeCard(edge, 'Bullpen edge from composite OSI allowed.')
      + '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr><th>Metric</th><th>' + esc(RL.compareA) + '</th><th>' + esc(RL.compareB) + '</th></tr></thead><tbody>'
      + row3('OSI Allowed', ua && ua.osiAllowed, ub && ub.osiAllowed, true, true)
      + row3('ABQ Allowed', ua && ua.abqAllowed, ub && ub.abqAllowed, true, true)
      + row3('OOR', ua && ua.oor, ub && ub.oor, true)
      + '</tbody></table></div>'
      + '<p class="ca-helper"><a href="bullpen_report.html?team=' + encodeURIComponent(RL.compareA) + '">' + esc(RL.compareA) + ' report →</a> · '
      + '<a href="bullpen_report.html?team=' + encodeURIComponent(RL.compareB) + '">' + esc(RL.compareB) + ' report →</a></p>';
  }

  function renderLineupPitcherCompare(out) {
    var team = teamRow(RL.compareA);
    var sp = findSpProfile(RL.compareB);
    var sm = sp && S ? S.spProfileMetrics(sp) : {};
    var hand = sp ? String(S.pickCol(sp, 'hand', 'Hand', 'throws') || 'R').charAt(0) : 'R';
    var split = hand === 'L' ? (global.SCO_YTD_L || []) : (global.SCO_YTD_R || []);
    var splitRow = split.find(function(d) { return d.t === RL.compareA; });
    var lineupOsi = splitRow ? splitRow.osi : (team ? team.osi : null);
    var allow = sm.osiAllowed;
    var edge = lineupOsi != null && allow != null && lineupOsi > (100 - allow) + 5 ? 'Lineup' : 'Pitcher';
    out.innerHTML = '<div class="rl-scorecards">'
      + scorecardOne(RL.compareA + ' vs ' + hand + 'HP', 'Lineup OSI', lineupOsi, false)
      + scorecardOne(RL.compareB, 'OSI Allowed', allow, true)
      + '</div>' + edgeCard(edge, 'Lineup split OSI vs pitcher allowed profile.')
      + profileLinks(RL.compareA, null, RL.compareB, null);
  }

  function scorecardOne(title, label, val, invert) {
    return '<div class="rl-scorecard"><h4>' + esc(title) + '</h4>'
      + '<div class="ca-metric-label">' + esc(label) + '</div>'
      + '<div class="rl-metric-primary" style="color:' + mColor(val, invert) + '">' + (val != null ? Number(val).toFixed(1) : '—') + '</div></div>';
  }

  function pitcherScorecard(name, label, val, invert) {
    return '<div class="rl-scorecard rl-scorecard--pitcher">'
      + pitcherAvatarHtml(name, 'compare')
      + '<div class="rl-scorecard-body"><h4>' + esc(name) + '</h4>'
      + '<div class="ca-metric-label">' + esc(label) + '</div>'
      + '<div class="rl-metric-primary" style="color:' + mColor(val, invert) + '">' + (val != null ? Number(val).toFixed(1) : '—') + '</div></div></div>';
  }

  function scorecardsHtml(a, b, kind) {
    return '<div class="rl-scorecards">'
      + scorecardOne(a.t, 'OSI', a.osi, false)
      + scorecardOne(b.t, 'OSI', b.osi, false)
      + '</div>';
  }

  function edgeCard(edge, why) {
    return '<div class="rl-edge-card"><strong>Edge: ' + esc(edge) + '</strong> — ' + esc(why)
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-3);">Confidence: Medium · Risk: bullpen volatility / lineup changes</div></div>';
  }

  function metricTable(keys, a, b) {
    return '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr><th>Metric</th><th>' + esc(a.t) + '</th><th>' + esc(b.t) + '</th></tr></thead><tbody>'
      + keys.map(function(k) { return row3(k[1], a[k[0]], b[k[0]], k[2], k[2]); }).join('')
      + '</tbody></table></div>';
  }

  function row3(label, va, vb, higherBetter, invert) {
    var best = '—';
    if (va != null && vb != null) {
      if (higherBetter) best = va > vb ? 'A' : (vb > va ? 'B' : '—');
      else best = va < vb ? 'A' : (vb < va ? 'B' : '—');
    }
    return '<tr><td>' + esc(label) + '</td>'
      + '<td style="color:' + mColor(va, invert) + '">' + fmt(va) + '</td>'
      + '<td style="color:' + mColor(vb, invert) + '">' + fmt(vb) + '</td></tr>';
  }

  function fmt(v) { return v != null && !isNaN(v) ? Number(v).toFixed(1) : '—'; }

  function renderResearchHome() {
    var root = document.getElementById('rlResearchHomeRoot');
    if (!root) return;
    var cards = [
      { pane: 'splits-trends', title: 'Team Offense', desc: 'Splits, trends, heatmaps, and master metric table', icon: '◆' },
      { pane: 'pitching', title: 'Pitcher Lab', desc: 'SP metrics allowed, rankings, and staleness', icon: '◎' },
      { pane: 'pitching-vs-lineup', title: 'Lineup vs Pitcher', desc: 'Lineup edge vs SP and bullpen context', icon: '⚡' },
      { pane: 'compare', title: 'Compare', desc: 'Team, pitcher, bullpen, and lineup comparisons', icon: '⇄' },
      { pane: 'leaderboards', title: 'Leaderboards', desc: 'Offensive, pitching, and bullpen rankings', icon: '▤' },
      { pane: 'model-links', title: 'Model Links', desc: 'Signals, matchups, and report shortcuts', icon: '→' }
    ];
    root.innerHTML = '<div class="rl-home-header"><h2 class="rl-workspace-title">Research Home</h2>'
      + '<p class="rl-workspace-subtitle">Choose a research path — all tools run in-pane.</p></div>'
      + '<div class="rl-home-grid">' + cards.map(function(c) {
        return '<button type="button" class="rl-home-card" data-rl-pane="' + c.pane + '">'
          + '<span class="rl-home-icon">' + c.icon + '</span>'
          + '<strong>' + esc(c.title) + '</strong>'
          + '<span>' + esc(c.desc) + '</span>'
          + '<em>Open →</em></button>';
      }).join('') + '</div>'
      + '<div class="rl-metric-legend"><span class="rl-legend-title">Metric colors</span>'
      + '<span class="rl-legend-item"><i style="background:#4ADE80"></i> Higher = better (OSI, ABQ…)</span>'
      + '<span class="rl-legend-item"><i style="background:#F87171"></i> Lower = better (allowed)</span>'
      + '<span class="rl-legend-item"><i style="background:#22D3EE"></i> OOR contextual</span>'
      + '<span class="rl-legend-item"><i style="background:#FBBF24"></i> PP-Gap negative</span></div>';

    root.querySelectorAll('[data-rl-pane]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pane = btn.getAttribute('data-rl-pane');
        if (typeof global.showResearchSubtab === 'function') global.showResearchSubtab(pane);
      });
    });
  }

  function profileLinks(teamA, teamB, pitcherA, pitcherB) {
    var p = [];
    if (teamA) p.push('<a href="team_profile.html?team=' + encodeURIComponent(teamA) + '">' + esc(teamA) + ' profile →</a>');
    if (teamB) p.push('<a href="team_profile.html?team=' + encodeURIComponent(teamB) + '">' + esc(teamB) + ' profile →</a>');
    if (pitcherA) p.push('<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(pitcherA) + '">' + esc(pitcherA) + ' →</a>');
    if (pitcherB) p.push('<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(pitcherB) + '">' + esc(pitcherB) + ' →</a>');
    return '<p class="ca-helper" style="margin-top:12px;">' + p.join(' · ') + '</p>';
  }

  function renderPitchingVsLineup() {
    var root = document.getElementById('rlPvlRoot');
    if (!root) return;
    var teams = teamList();
    var pitchers = pitcherOptions();
    root.innerHTML = '<div class="rl-pane-card">'
      + '<div class="rl-pvl-grid">'
      + '<div><label class="ca-metric-label">Lineup Team</label><select id="rlPvlTeam" class="search-input" style="width:100%;margin-top:6px;">'
      + '<option value="">—</option>' + teams.map(function(t) {
        return '<option value="' + t + '"' + (t === RL.pvlTeam ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="ca-metric-label">Opposing SP</label><select id="rlPvlSp" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-4);color:var(--text);">'
      + '<option value="">—</option>' + pitchers.map(function(p) {
        return '<option value="' + esc(p.name) + '"' + (p.name === RL.pvlPitcher ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="ca-metric-label">Opposing Bullpen</label><select id="rlPvlBp" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-4);color:var(--text);">'
      + '<option value="">—</option>' + teams.map(function(t) {
        return '<option value="' + t + '"' + (t === RL.pvlBpTeam ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select></div>'
      + '</div><div id="rlPvlOutput"></div></div>';

    ['rlPvlTeam', 'rlPvlSp', 'rlPvlBp'].forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      sel.addEventListener('change', function() {
        RL.pvlTeam = document.getElementById('rlPvlTeam').value;
        RL.pvlPitcher = document.getElementById('rlPvlSp').value;
        RL.pvlBpTeam = document.getElementById('rlPvlBp').value;
        renderPvlOutput();
      });
    });
    renderPvlOutput();
  }

  function renderPvlOutput() {
    var out = document.getElementById('rlPvlOutput');
    if (!out || !RL.pvlTeam) {
      if (out) out.innerHTML = '<p class="ca-helper" style="margin-top:14px;">Select a lineup team to build the matchup snapshot.</p>';
      return;
    }
    var team = teamRow(RL.pvlTeam);
    var sp = findSpProfile(RL.pvlPitcher);
    var sm = sp && S ? S.spProfileMetrics(sp) : {};
    var hand = sp ? String(S.pickCol(sp, 'hand', 'Hand') || 'R').charAt(0) : 'R';
    var splitRow = (hand === 'L' ? global.SCO_YTD_L : global.SCO_YTD_R || []).find(function(d) { return d.t === RL.pvlTeam; });
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var bp = units[RL.pvlBpTeam] || {};
    var bpScore = bp.osiAllowed != null ? 100 - bp.osiAllowed : null;
    var ps = sm.osiAllowed != null ? 100 - sm.osiAllowed : null;
    out.innerHTML = '<div class="rl-pvl-grid" style="margin-top:16px;">'
      + snap('Lineup Snapshot', RL.pvlTeam, 'OSI vs ' + hand + 'HP', splitRow ? splitRow.osi : team.osi, false)
      + snap('SP Snapshot', RL.pvlPitcher || '—', 'Pitching Score', ps, false)
      + snap('Bullpen Snapshot', RL.pvlBpTeam || '—', 'Bullpen Score', bpScore, false)
      + '</div>'
      + '<div class="rl-edge-card" style="margin-top:14px;"><strong>Edge Read</strong> — '
      + (splitRow && sm.osiAllowed && splitRow.osi > 100 - sm.osiAllowed ? 'Lineup carries platoon split edge vs SP.' : 'Pitching profile suppresses lineup split.')
      + '</div>'
      + '<div class="rl-pane-card" style="margin-top:12px;"><div class="ca-metric-label">F5 vs Full Game</div>'
      + '<p style="font-size:13px;color:var(--text-2);margin:8px 0 0;">F5 lean tracks SP vs lineup split. Full game adds bullpen score '
      + (bpScore != null ? '(' + bpScore.toFixed(1) + ')' : '') + ' after starter.</p>'
      + '<a href="matchup_compare.html?away=' + encodeURIComponent(RL.pvlTeam) + '&home=' + encodeURIComponent(RL.pvlBpTeam || RL.pvlTeam) + '" class="ca-helper">Open full matchup compare →</a></div>';
  }

  function snap(title, name, metric, val, inv) {
    return '<div class="rl-pvl-snapshot"><h4>' + esc(title) + '</h4><div style="font-weight:700;margin-bottom:6px;">' + esc(name) + '</div>'
      + '<div class="ca-metric-label">' + esc(metric) + '</div>'
      + '<div class="rl-metric-primary" style="color:' + mColor(val, inv) + '">' + fmt(val) + '</div></div>';
  }

  function renderModelLinks() {
    var root = document.getElementById('rlModelLinksRoot');
    if (!root) return;
    var cards = [
      { href: 'model_report.html', title: 'Daily Signal Board', desc: 'All fired signals and verdicts for tonight.' },
      { href: 'model_report.html#section-convergence', title: 'Convergence Explorer', desc: 'Weighted plays by game side.' },
      { href: 'chase_analytics_mlb_oem_v7.html#section-matchups-hero', title: 'Today\'s Matchups', desc: 'Slate cards with lineups and edges.' },
      { href: 'model_report.html?fired=1', title: 'Fired Signals Only', desc: 'Filter to actionable fired rows.' },
      { href: 'glossary.html', title: 'Metric Glossary', desc: 'Definitions and methodology reference.' },
      { href: 'player_search.html', title: 'Player Search', desc: 'Find batter and pitcher profiles.' }
    ];
    root.innerHTML = '<div class="rl-model-links">' + cards.map(function(c) {
      return '<a class="rl-model-link-card" href="' + c.href + '"><h4>' + esc(c.title) + '</h4><p>' + esc(c.desc) + '</p></a>';
    }).join('') + '</div>';
  }

  function initSplitsControls() {
    var mount = document.getElementById('rlSplitsControlMount');
    if (!mount || !global.MLBMAControls) return;
    MLBMAControls.renderBar(mount, {
      state: { entity: 'team', split: global.STATE ? global.STATE.split === 'r' ? 'r' : global.STATE.split === 'l' ? 'l' : 'b' : 'b', window: global.STATE ? global.STATE.time : 'YTD', view: 'table' },
      onChange: function(st) {
        if (!global.STATE) return;
        if (st.split === 'r') global.STATE.split = 'r';
        else if (st.split === 'l') global.STATE.split = 'l';
        else global.STATE.split = 'b';
        global.STATE.time = st.window;
        if (typeof renderMasterTable === 'function') renderMasterTable();
        if (typeof renderSplitBars === 'function') renderSplitBars();
        if (typeof renderTrendHeatmap === 'function') renderTrendHeatmap();
      }
    });
  }

  function onSubtab(name) {
    if (name === 'research-home') renderResearchHome();
    if (name === 'splits-trends') restoreSplitsTable();
    if (name === 'compare') {
      fetchSpProfiles().then(function() { renderComparePane(); });
    } else if (name === 'pitching-vs-lineup') {
      fetchSpProfiles().then(function() { renderPitchingVsLineup(); });
    } else if (name === 'leaderboards') {
      mountLeaderboards();
    } else if (name === 'model-links') {
      renderModelLinks();
    } else if (name === 'pitching') {
      if (global.PitcherLab && PitcherLab.mount) {
        PitcherLab.mount('rlPitcherLabRoot');
      } else if (typeof mountResearchTables === 'function') {
        mountResearchTables();
        if (typeof renderPitchingScore === 'function') renderPitchingScore();
      }
      hideTeamOorSections();
    }
  }

  function hideTeamOorSections() {
    var oor = document.getElementById('oorSection');
    if (oor) oor.style.display = 'none';
  }

  function hookShowResearchSubtab() {
    if (global._rlSubtabHooked) return;
    global._rlSubtabHooked = true;
    var orig = global.showResearchSubtab;
    global.showResearchSubtab = function(name) {
      if (typeof orig === 'function') orig(name);
      else {
        SUBTABS.forEach(function(id) {
          var el = document.getElementById('pane-' + id);
          if (el) el.style.display = (id === name) ? 'block' : 'none';
        });
        var layer = document.getElementById('layerAdvanced');
        if (layer) {
          layer.querySelectorAll('.subtab').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-pane') === name);
          });
        }
        onSubtab(name);
      }
    };
    var origMount = global.mountDashboardRankings;
    global.mountDashboardRankings = function() {
      if (typeof mountLeaderboards === 'function') mountLeaderboards();
      else if (typeof origMount === 'function') origMount();
    };
    var origInitCompare = global.initCompare;
    global.initCompare = function() {
      fetchSpProfiles().then(function() { renderComparePane(); });
    };
  }

  function init() {
    patchSubtabs();
    hookShowResearchSubtab();
    restoreSplitsTable();
    initSplitsControls();
    fetchSpProfiles();
    hideTeamOorSections();
  }

  global.ResearchLab = {
    init: init,
    initSplitsControls: initSplitsControls,
    onSubtab: onSubtab,
    mountLeaderboards: mountLeaderboards,
    renderComparePane: renderComparePane
  };

})(typeof window !== 'undefined' ? window : this);
