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

  var _rlReadyPoll = null;

  function getResearchTeamData(split) {
    var LD = global.LIVE_DATA || {};
    var rhp = LD.scYtdR || global.SCO_YTD_R || LD.vsRhp || LD.rhpScores || (global.RL_DATA && RL_DATA.rhp) || [];
    var lhp = LD.scYtdL || global.SCO_YTD_L || LD.vsLhp || LD.lhpScores || (global.RL_DATA && RL_DATA.lhp) || [];
    var both = (global.SCO_YTD_B && global.SCO_YTD_B.length) ? global.SCO_YTD_B : (LD.scores || LD.teamScores);
    if (!both || !both.length) {
      if (rhp.length && lhp.length && typeof global.buildYtdBothFromSplits === 'function') {
        both = global.buildYtdBothFromSplits(rhp, lhp);
      } else {
        both = rhp;
      }
    }
    console.log('[RL] getResearchTeamData:', { split: split, rhpLen: rhp.length, lhpLen: lhp.length, bothLen: both && both.length });
    if (split === 'r' || split === 'vs_rhp') return rhp || [];
    if (split === 'l' || split === 'vs_lhp') return lhp || [];
    return both || rhp || [];
  }

  function getResearchPitcherData() {
    var LD = global.LIVE_DATA || {};
    var pitchers = LD.spProfiles || RL.spProfiles || LD.pitchers || LD.spData || (global.RL_DATA && RL_DATA.pitchers) || [];
    console.log('[RL] getResearchPitcherData:', pitchers.length);
    return pitchers || [];
  }

  function getResearchBullpenData() {
    var LD = global.LIVE_DATA || {};
    var bullpen = LD.bullpenUnit || LD.bullpen || LD.bullpenData;
    if (!bullpen && LD.bullpenUnits) {
      bullpen = Object.keys(LD.bullpenUnits).map(function(tk) {
        var u = LD.bullpenUnits[tk];
        return Object.assign({ t: tk }, u);
      });
    }
    if (global.RL_DATA && RL_DATA.bullpen && !bullpen) bullpen = RL_DATA.bullpen;
    console.log('[RL] getResearchBullpenData:', Array.isArray(bullpen) ? bullpen.length : (bullpen ? 1 : 0));
    return bullpen || [];
  }

  function syncResearchGlobalsFromLiveData() {
    var r = (global.LIVE_DATA && LIVE_DATA.scYtdR) || [];
    var l = (global.LIVE_DATA && LIVE_DATA.scYtdL) || [];
    if (r.length >= 10 && l.length >= 10) {
      global.SCO_YTD_R = r.map(function(d) { return Object.assign({}, d); });
      global.SCO_YTD_L = l.map(function(d) { return Object.assign({}, d); });
      if (typeof global.buildYtdBothFromSplits === 'function') {
        global.SCO_YTD_B = global.buildYtdBothFromSplits(global.SCO_YTD_R, global.SCO_YTD_L);
      }
      if (typeof global.toMap === 'function') {
        global.M_YTD_R = global.toMap(global.SCO_YTD_R);
        global.M_YTD_L = global.toMap(global.SCO_YTD_L);
      }
      if (typeof global.enrichYtdMaster === 'function') global.enrichYtdMaster();
      else if (typeof global.attachPalsToScores === 'function') global.attachPalsToScores();
      return true;
    }
    if (global.SCO_YTD_R && global.SCO_YTD_R.length >= 10 && global.SCO_YTD_L && global.SCO_YTD_L.length >= 10) {
      if ((!global.SCO_YTD_B || global.SCO_YTD_B.length < 10) && typeof global.buildYtdBothFromSplits === 'function') {
        global.SCO_YTD_B = global.buildYtdBothFromSplits(global.SCO_YTD_R, global.SCO_YTD_L);
        if (typeof global.enrichYtdMaster === 'function') global.enrichYtdMaster();
      }
      return !!(global.SCO_YTD_B && global.SCO_YTD_B.length >= 10);
    }
    return false;
  }

  function resetResearchLabFilters() {
    if (global.STATE) global.STATE.searchQuery = '';
    ['searchInput', 'dashSearchInput'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function renderResearchLabContent() {
    syncResearchGlobalsFromLiveData();
    if (typeof global.renderResearchLab === 'function') global.renderResearchLab();
  }

  function initResearchLabWhenReady() {
    function tick() {
      syncResearchGlobalsFromLiveData();
      var data = getResearchTeamData('both');
      if (data && data.length > 0) {
        console.log('[RL] Data ready, rendering Research Lab with', data.length, 'teams');
        if (_rlReadyPoll) { clearTimeout(_rlReadyPoll); _rlReadyPoll = null; }
        renderResearchLabContent();
      } else {
        console.log('[RL] Waiting for data...');
        _rlReadyPoll = setTimeout(tick, 300);
      }
    }
    if (_rlReadyPoll) clearTimeout(_rlReadyPoll);
    tick();
  }

  var SUBTABS = ['research-home', 'splits-trends', 'compare', 'pitching-vs-lineup', 'pitching', 'leaderboards', 'model-links'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mColor(v, invert, ctx) {
    if (!A || !A.metricColor) return '#71717A';
    if (ctx === 'oor' || ctx === 'OOR') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    if (ctx === 'ppGap') return A.ppGapColor ? A.ppGapColor(v) : '#71717A';
    return A.metricColor(v, ctx || 'osi', !!invert);
  }

  function metricCell(opts) {
    return A && A.metricCell ? A.metricCell(opts) : '';
  }

  function teamList() {
    var rows = getResearchTeamData('both');
    return rows.map(function(d) { return d.t; }).filter(Boolean).sort();
  }

  function teamRow(t) {
    return getResearchTeamData('both').find(function(d) { return d.t === t; });
  }

  function fetchSpProfiles() {
    if (RL.spProfiles && RL.spProfiles.length) return Promise.resolve(RL.spProfiles);
    var cached = getResearchPitcherData();
    if (cached && cached.length) {
      RL.spProfiles = cached;
      if (global.LIVE_DATA) LIVE_DATA.spProfiles = cached;
      return Promise.resolve(RL.spProfiles);
    }
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      RL.spProfiles = rows || [];
      var oorMap = S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor
        ? S.buildOorByTeam(LIVE_DATA.oor) : {};
      if (S.enrichSpProfiles) S.enrichSpProfiles(RL.spProfiles, oorMap);
      if (global.LIVE_DATA) LIVE_DATA.spProfiles = RL.spProfiles;
      console.log('[FETCH] SP_Profiles loaded:', RL.spProfiles.length);
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
      + '<p class="rl-workspace-subtitle">Validate model signals with splits, trends, comparisons, pitcher context, and lineup-vs-pitcher research.</p>'
      + '<div class="rl-workflow-strip">'
      + '<span class="rl-workflow-step">1 · Select Path</span>'
      + '<span class="rl-workflow-step">2 · Apply Split/Window</span>'
      + '<span class="rl-workflow-step">3 · Validate Signal</span>'
      + '<span class="rl-workflow-step">4 · Open Deep Profile</span>'
      + '</div>'
      + (A && A.researchLabLegendHtml ? A.researchLabLegendHtml() : '')
      + '</div>';
  }

  function patchSubtabs() {
    mountWorkspaceHeader();
    var layer = document.getElementById('layerAdvanced');
    if (!layer) return;
    var tabBar = layer.querySelector('.subtabs');
    if (tabBar && !tabBar.classList.contains('rl-segment-tabs')) {
      tabBar.classList.add('rl-segment-tabs');
      tabBar.innerHTML = ''
        + '<button type="button" class="subtab active" data-pane="research-home">Research Home</button>'
        + '<button type="button" class="subtab" data-pane="splits-trends">Splits &amp; Trends</button>'
        + '<button type="button" class="subtab" data-pane="compare">Compare</button>'
        + '<button type="button" class="subtab" data-pane="pitching-vs-lineup">Lineup vs Pitcher</button>'
        + '<button type="button" class="subtab" data-pane="pitching">Pitcher Lab</button>'
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
    if (!mount || !table) {
      if (mount) mount.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Team rankings unavailable — load sheet data first.</p></div>';
      return;
    }
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
    syncResearchGlobalsFromLiveData();
    var renderLb = function() {
      if (typeof renderMasterTable === 'function') renderMasterTable();
      mountExtraLeaderboards();
    };
    if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
      MLBMACharts.renderOnLiveDataReady(renderLb, 'mountLeaderboards');
    } else {
      renderLb();
    }
  }

  function mountExtraLeaderboards() {
    var root = document.getElementById('rlExtraLeaderboards');
    if (!root) return;
    fetchSpProfiles().then(function() {
      var rows = RL.spProfiles || [];
      if (!rows.length) {
        root.innerHTML = '<div class="rl-pane-card" style="margin-top:20px;"><p class="ca-helper">Pitcher and bullpen leaderboards require SP_Profiles and Bullpen_Unit sheet data.</p></div>';
        return;
      }
      var pitchRows = rows.slice().sort(function(a, b) {
        var ma = S.spProfileMetrics(a);
        var mb = S.spProfileMetrics(b);
        return (mb.pitchScore || 0) - (ma.pitchScore || 0);
      });
      var pitchHtml = '<div class="rl-lb-section"><h4 class="rl-lb-title">Starting Pitcher Rankings (' + pitchRows.length + ')</h4>'
        + '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr>'
        + '<th>Pitcher</th><th>Team</th><th>Pitch Score</th><th>OSI Allowed</th><th>Pitcher OOR</th></tr></thead><tbody>'
        + pitchRows.map(function(row) {
          var n = S.pickCol(row, 'pitcher_name', 'Name');
          var t = S.pickCol(row, 'pitcher_team', 'Team');
          var m = S.spProfileMetrics(row);
          var ps = m.pitchScore;
          return '<tr class="pl-rank-row" onclick="location.href=\'pitcher_profile.html?pitcher=' + encodeURIComponent(n) + '\'">'
            + '<td>' + esc(n) + '</td><td>' + esc(t) + '</td>'
            + '<td style="color:' + mColor(ps, false, 'pitching') + '">' + fmt(ps) + '</td>'
            + '<td style="color:' + mColor(m.osiAllowed, true) + '">' + fmt(m.osiAllowed) + '</td>'
            + '<td style="color:' + mColor(m.oor, false, 'oor') + '">' + fmt(m.oor) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';

      var units = global.LIVE_DATA && LIVE_DATA.bullpenUnits ? Object.keys(LIVE_DATA.bullpenUnits) : [];
      var bpRows = units.map(function(tk) {
        var u = LIVE_DATA.bullpenUnits[tk];
        return { t: tk, u: u, score: S.bullpenPitchScore ? S.bullpenPitchScore(u) : (u.bullpenScore != null ? u.bullpenScore : null) };
      }).sort(function(a, b) { return (b.score || 0) - (a.score || 0); }).slice(0, 15);

      var bpHtml = '<div class="rl-lb-section"><h4 class="rl-lb-title">Bullpen Unit Rankings</h4>'
        + (bpRows.length ? '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr>'
        + '<th>Team</th><th>Bullpen Score</th><th>OSI Allowed</th><th>Unit OOR</th></tr></thead><tbody>'
        + bpRows.map(function(r) {
          return '<tr onclick="location.href=\'bullpen_report.html?team=' + encodeURIComponent(r.t) + '\'">'
            + '<td>' + (A ? A.teamLogoImg(r.t, 20) : '') + ' ' + esc(r.t) + '</td>'
            + '<td style="color:' + mColor(r.score, false, 'pitching') + '">' + fmt(r.score) + '</td>'
            + '<td style="color:' + mColor(r.u.osiAllowed, true) + '">' + fmt(r.u.osiAllowed) + '</td>'
            + '<td style="color:' + mColor(r.u.oor, false, 'oor') + '">' + fmt(r.u.oor) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<p class="ca-helper">Bullpen_Unit data not loaded.</p>') + '</div>';

      root.innerHTML = pitchHtml + bpHtml;
      console.log('[MLBMA] extra leaderboards pitchers=' + pitchRows.length + ' bullpens=' + bpRows.length);
    });
  }

  function renderSplitSummary() {
    var mount = document.getElementById('rlSplitSummaryMount');
    if (!mount) {
      var splitsPane = document.getElementById('pane-splits-trends');
      if (!splitsPane || splitsPane.querySelector('#rlSplitSummaryMount')) return;
      mount = document.createElement('div');
      mount.id = 'rlSplitSummaryMount';
      mount.className = 'rl-split-summary-grid';
      var anchor = splitsPane.querySelector('#rlSplitsControlMount');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(mount, anchor.nextSibling);
      else splitsPane.insertBefore(mount, splitsPane.firstChild);
    }
    var r = getResearchTeamData('r');
    var l = getResearchTeamData('l');
    if (!r.length && !l.length) {
      mount.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Split summary cards populate after team offense data loads.</p></div>';
      return;
    }
    function best(arr) {
      if (!arr.length) return null;
      return arr.slice().sort(function(a, b) { return b.osi - a.osi; })[0];
    }
    function biggestSplit() {
      var hit = null, gap = 0;
      r.forEach(function(row) {
        var lrow = l.find(function(x) { return x.t === row.t; });
        if (!lrow) return;
        var g = Math.abs(row.osi - lrow.osi);
        if (g > gap) { gap = g; hit = { t: row.t, gap: g }; }
      });
      return hit;
    }
    var cards = [
      { title: 'Best vs RHP', val: best(r), metric: 'osi' },
      { title: 'Best vs LHP', val: best(l), metric: 'osi' },
      { title: 'Biggest Split Edge', val: biggestSplit(), metric: 'gap' },
      { title: 'YTD Leader', val: best(getResearchTeamData('both')), metric: 'osi' }
    ];
    mount.innerHTML = cards.map(function(c) {
      var body = '—';
      if (c.val) {
        body = c.metric === 'gap' ? c.val.t + ' · ' + c.val.gap.toFixed(1) + ' pt gap'
          : c.val.t + ' · OSI ' + c.val.osi.toFixed(1);
      }
      return '<div class="rl-summary-card"><div class="rl-summary-label">' + esc(c.title) + '</div><div class="rl-summary-val">' + esc(body) + '</div></div>';
    }).join('');
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


  function splitRowForTeam(t, split) {
    return getResearchTeamData(split === 'l' ? 'l' : 'r').find(function(d) { return d.t === t; });
  }

  function teamIdentityCard(row) {
    if (!row) return '';
    var logo = A ? A.teamLogoImg(row.t, 48) : '';
    var tier = row.osi >= 75 ? 'Elite' : row.osi >= 60 ? 'Solid' : row.osi >= 45 ? 'Avg' : 'Weak';
    var tierCls = row.osi >= 75 ? 'tier-elite' : row.osi >= 60 ? 'tier-solid' : 'tier-mid';
    return '<div class="rl-compare-identity">' + logo
      + '<div><div style="font-weight:700;font-size:16px;">' + esc(row.t) + '</div>'
      + '<div class="ca-helper">OSI <strong style="color:' + mColor(row.osi, false) + '">' + fmt(row.osi) + '</strong>'
      + ' <span class="tier-badge ' + tierCls + '">' + esc(tier) + '</span></div></div>';
  }

  function compareSummaryRead(a, b) {
    var parts = [];
    [['rcv', 'RCV'], ['obr', 'OBR'], ['osi', 'OSI'], ['abq', 'ABQ']].forEach(function(pair) {
      var k = pair[0], label = pair[1];
      if (a[k] == null || b[k] == null || Math.abs(a[k] - b[k]) < 2) return;
      var lead = a[k] > b[k] ? a.t : b.t;
      var trail = a[k] > b[k] ? b.t : a.t;
      parts.push(lead + ' leads ' + trail + ' in ' + label + ' (' + Math.max(a[k], b[k]).toFixed(0) + ' vs ' + Math.min(a[k], b[k]).toFixed(0) + ')');
    });
    if (!parts.length) return a.t + ' and ' + b.t + ' profile as evenly matched across core metrics.';
    var leader = a.osi > b.osi + 2 ? a.t : (b.osi > a.osi + 2 ? b.t : null);
    var tail = leader ? ' — clear offensive edge to ' + leader : ' — mixed offensive profile.';
    return parts.slice(0, 2).join(' and ') + tail;
  }

  function mountMarketQuadrant() {
    if (!global.MLBMACharts) return;
    syncResearchGlobalsFromLiveData();
    if (typeof global.scheduleMarketMapRender === 'function') {
      global.scheduleMarketMapRender();
      return;
    }
    MLBMACharts.renderOnDataReady(function() {
      return MLBMACharts.getQuadrantRows().length >= 20;
    }, function() {
      MLBMACharts.renderMarketQuadrant('rlMarketQuadrant', MLBMACharts.getQuadrantRows(), { tipId: 'rlMarketQuadrantTip' });
    });
  }

  function renderTeamCompare(out) {
    var a = teamRow(RL.compareA);
    var b = teamRow(RL.compareB);
    if (!a || !b) {
      out.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Team data not available for selection.</p></div>';
      return;
    }
    var keys = [
      ['osi', 'OSI', false], ['projOSI', 'ProjOSI', false], ['abq', 'ABQ', false], ['rcv', 'RCV', false], ['obr', 'OBR', false],
      ['ppGap', 'PP-Gap', false, true], ['dfGap', 'Power-Floor Gap', false, true], ['pals', 'PALS', false],
      ['rhpOSI', 'vRHP', false], ['lhpOSI', 'vLHP', false], ['trend', 'Trend', false, false, true]
    ];
    var edge = a.osi > b.osi + 2 ? a.t : (b.osi > a.osi + 2 ? b.t : 'Even');
    var rA = splitRowForTeam(a.t, 'r') || a;
    var lA = splitRowForTeam(a.t, 'l') || a;
    var rB = splitRowForTeam(b.t, 'r') || b;
    var lB = splitRowForTeam(b.t, 'l') || b;
    out.innerHTML = '<div class="rl-compare-identities">' + teamIdentityCard(a) + teamIdentityCard(b) + '</div>'
      + '<div id="rlTeamRadar" class="mc-radar-mount" style="margin:8px auto 16px;"></div>'
      + '<div class="rl-compare-summary"><strong>Summary:</strong> ' + esc(compareSummaryRead(a, b)) + '</div>'
      + edgeCard(edge, 'OSI edge based on composite offensive strength.')
      + metricTable(keys, a, b)
      + profileLinks(a.t, b.t, null, null);
    if (global.STATE) global.STATE.compareTeams = [a.t, b.t];
    setTimeout(function() {
      var drawRadar = function() {
        if (!global.MLBMACharts) return;
        MLBMACharts.renderRadarChart('rlTeamRadar',
          MLBMACharts.teamRadarComparePayload(a, rA, lA),
          MLBMACharts.teamRadarComparePayload(b, rB, lB), a.t, b.t, { size: 340 });
      };
      if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
        MLBMACharts.renderOnLiveDataReady(drawRadar, 'compare radar');
      } else {
        drawRadar();
      }
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
      + row3('OSI Allowed', ma.osiAllowed, mb.osiAllowed, false, true)
      + row3('ABQ Allowed', ma.abqAllowed, mb.abqAllowed, false, true)
      + row3('RCV Allowed', ma.rcvAllowed, mb.rcvAllowed, false, true)
      + row3('OBR Allowed', ma.obrAllowed, mb.obrAllowed, false, true)
      + row3('Pitcher OOR', ma.oor, mb.oor, false, false, 'oor')
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
      + row3('Bullpen Unit OOR', ua && ua.oor, ub && ub.oor, false, false, 'oor')
      + '</tbody></table></div>'
      + '<p class="ca-helper"><a href="bullpen_report.html?team=' + encodeURIComponent(RL.compareA) + '">' + esc(RL.compareA) + ' report →</a> · '
      + '<a href="bullpen_report.html?team=' + encodeURIComponent(RL.compareB) + '">' + esc(RL.compareB) + ' report →</a></p>';
  }

  function renderLineupPitcherCompare(out) {
    var team = teamRow(RL.compareA);
    var sp = findSpProfile(RL.compareB);
    var sm = sp && S ? S.spProfileMetrics(sp) : {};
    var hand = sp ? String(S.pickCol(sp, 'hand', 'Hand', 'throws') || 'R').charAt(0) : 'R';
    var split = getResearchTeamData(hand === 'L' ? 'l' : 'r');
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
      + keys.map(function(k) {
        if (k[0] === 'trend') return row3(k[1], a.trend, b.trend, false, false, 'trend');
        if (k[0] === 'ppGap' || k[0] === 'dfGap') return row3(k[1], a[k[0]], b[k[0]], false, false, k[0]);
        return row3(k[1], a[k[0]], b[k[0]], k[2], k[3]);
      }).join('')
      + '</tbody></table></div>';
  }

  function row3(label, va, vb, higherBetter, invert, ctx) {
    if (ctx === 'oor') {
      return '<tr><td>' + esc(label) + '</td>'
        + '<td style="color:' + mColor(va, false, 'oor') + '">' + fmt(va) + '</td>'
        + '<td style="color:' + mColor(vb, false, 'oor') + '">' + fmt(vb) + '</td></tr>';
    }
    if (label === 'PP-Gap' || label === 'Power-Floor Gap') {
      var ca = label === 'PP-Gap' ? mColor(va, false, 'ppGap') : mColor(va, false, 'dfGap');
      var cb = label === 'PP-Gap' ? mColor(vb, false, 'ppGap') : mColor(vb, false, 'dfGap');
      return '<tr><td>' + esc(label) + '</td><td style="color:' + ca + '">' + fmt(va) + '</td><td style="color:' + cb + '">' + fmt(vb) + '</td></tr>';
    }
    if (label === 'Trend') {
      return '<tr><td>' + esc(label) + '</td><td style="color:' + mColor(va, false, null) + '">' + esc(va || '—') + '</td><td style="color:' + mColor(vb, false, null) + '">' + esc(vb || '—') + '</td></tr>';
    }
    return '<tr><td>' + esc(label) + '</td>'
      + '<td style="color:' + mColor(va, invert, invert ? 'osi' : 'osi') + '">' + fmt(va) + '</td>'
      + '<td style="color:' + mColor(vb, invert, invert ? 'osi' : 'osi') + '">' + fmt(vb) + '</td></tr>';
  }

  function fmt(v) { return v != null && !isNaN(v) ? Number(v).toFixed(1) : '—'; }

  function renderResearchHome() {
    var root = document.getElementById('rlResearchHomeRoot');
    if (!root) return;
    var cards = [
      { pane: 'splits-trends', title: 'Team Offense Research', use: 'OSI, ProjOSI, ABQ, RCV, OBR, PP-Gap, PALS, splits, trends', cta: 'Open Splits & Trends', icon: '◆' },
      { pane: 'pitching', title: 'Pitcher Research', use: 'Pitching Score, OSI/ABQ/RCV/OBR Allowed, Pitcher OOR, L14 form, staleness', cta: 'Open Pitcher Lab', icon: '◎' },
      { pane: 'pitching-vs-lineup', title: 'Lineup vs Pitcher', use: 'Split lineup edge, starter vulnerability, F5/full-game context', cta: 'Open Lineup vs Pitcher', icon: '⚡' },
      { pane: 'compare', title: 'Compare', use: 'Team vs team, pitcher vs pitcher, bullpen vs bullpen, lineup vs pitcher', cta: 'Open Compare', icon: '⇄' },
      { pane: 'leaderboards', title: 'Leaderboards', use: 'Sortable rankings, split boards, metrics allowed', cta: 'Open Leaderboards', icon: '▤' }
    ];
    root.innerHTML = '<div class="rl-home-header"><h2 class="rl-workspace-title">Research Home</h2>'
      + '<p class="rl-workspace-subtitle">Choose a research path — no giant tables on this screen.</p></div>'
      + '<div class="rl-home-grid">' + cards.map(function(c) {
        return '<button type="button" class="rl-home-card" data-rl-pane="' + c.pane + '">'
          + '<span class="rl-home-icon">' + c.icon + '</span>'
          + '<strong>' + esc(c.title) + '</strong>'
          + '<span class="rl-home-use">Use for: ' + esc(c.use) + '</span>'
          + '<em>' + esc(c.cta) + ' →</em></button>';
      }).join('') + '</div>'
      + (A && A.researchLabLegendHtml ? A.researchLabLegendHtml() : '');

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
    var splitRow = getResearchTeamData(hand === 'L' ? 'l' : 'r').find(function(d) { return d.t === RL.pvlTeam; });
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
      { href: 'model_report.html', title: 'Daily Predictive Signal Board', desc: 'All fired signals and verdicts for tonight.' },
      { href: 'model_report.html#section-convergence', title: 'Signal Explorer', desc: 'Convergence matrix and weighted plays.' },
      { href: 'model_report.html?fired=1', title: 'Highest Confidence Signals', desc: 'Filter to actionable fired rows.' },
      { href: 'model_report.html#section-risks', title: 'Context Risks', desc: 'Schedule, platoon, and volatility flags.' },
      { href: 'model_report.html#section-f5', title: 'F5 Model Signals', desc: 'First-five specific model outputs.' },
      { href: 'model_report.html#section-regression', title: 'Regression / Buy-Low Signals', desc: 'Process vs production divergence plays.' }
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
    if (name === 'splits-trends') {
      resetResearchLabFilters();
      restoreSplitsTable();
      syncResearchGlobalsFromLiveData();
      renderSplitSummary();
      if (typeof global.renderMasterTable === 'function') global.renderMasterTable();
      if (typeof global.renderSplitBars === 'function') global.renderSplitBars();
      if (typeof global.renderTrendHeatmap === 'function') global.renderTrendHeatmap();
      mountMarketQuadrant();
    }
    if (name === 'compare') {
      fetchSpProfiles().then(function() { renderComparePane(); });
    } else if (name === 'pitching-vs-lineup') {
      fetchSpProfiles().then(function() { renderPitchingVsLineup(); });
    } else if (name === 'leaderboards') {
      mountLeaderboards();
    } else if (name === 'model-links') {
      renderModelLinks();
    } else if (name === 'pitching') {
      var mountPl = function() {
        if (global.PitcherLab && PitcherLab.mount) {
          PitcherLab.mount('rlPitcherLabRoot');
        } else if (typeof mountResearchTables === 'function') {
          mountResearchTables();
          if (typeof renderPitchingScore === 'function') renderPitchingScore();
        }
      };
      if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
        MLBMACharts.renderOnLiveDataReady(mountPl, 'PitcherLab');
      } else {
        mountPl();
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
    renderComparePane: renderComparePane,
    renderSplitSummary: renderSplitSummary,
    metricCell: metricCell,
    getResearchTeamData: getResearchTeamData,
    getResearchPitcherData: getResearchPitcherData,
    getResearchBullpenData: getResearchBullpenData,
    syncResearchGlobalsFromLiveData: syncResearchGlobalsFromLiveData,
    resetResearchLabFilters: resetResearchLabFilters,
    initResearchLabWhenReady: initResearchLabWhenReady,
    renderResearchLabContent: renderResearchLabContent,
    mountMarketQuadrant: mountMarketQuadrant
  };

})(typeof window !== 'undefined' ? window : this);
