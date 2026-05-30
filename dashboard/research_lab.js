// v20260525a
/**
 * Research Lab UIX — compare in-pane, leaderboards, pitching vs lineup, model links.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;

  var CM = function() { return global.CompareMetrics; };

  var RL = {
    compareMode: 'lineup-lineup',
    compareSideA: null,
    compareSideB: null,
    spProfiles: null,
    pvlTeam: '',
    pvlPitcher: '',
    pvlBpTeam: '',
    splitEntity: 'team',
    splitMetric: 'osi',
    rlTrendMetric: 'osi',
    rlWindowCmp: 'L14'
  };
  global.ResearchLab = RL;

  var _rlReadyPoll = null;
  var _rlReadyTries = 0;

  function getResearchTeamData(split) {
    var LD = global.LIVE_DATA || {};
    var rhp = LD.scYtdR || global.SCO_YTD_R || LD.vsRhp || LD.rhpScores || (global.RL_DATA && RL_DATA.rhp) || [];
    var lhp = LD.scYtdL || global.SCO_YTD_L || LD.vsLhp || LD.lhpScores || (global.RL_DATA && RL_DATA.lhp) || [];
    var both = (global.SCO_YTD_B && global.SCO_YTD_B.length) ? global.SCO_YTD_B : (LD.scores || LD.teamScores);
    if (!both || !both.length) {
      if (rhp.length && lhp.length && typeof global.buildYtdBothRows === 'function') {
        both = global.buildYtdBothRows(rhp, lhp);
      } else {
        both = rhp;
      }
    }
    if (split === 'r' || split === 'vs_rhp') return withProfileWindows(rhp || []);
    if (split === 'l' || split === 'vs_lhp') return withProfileWindows(lhp || []);
    return withProfileWindows(both || rhp || []);
  }

  function getResearchPitcherData() {
    var LD = global.LIVE_DATA || {};
    var pitchers = LD.spProfiles || RL.spProfiles || LD.pitchers || LD.spData || (global.RL_DATA && RL_DATA.pitchers) || [];
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
    return bullpen || [];
  }

  function numOrNull(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function extractWindowOSI(val) {
  if (val == null || val === '') return null;
  var n = parseFloat(val);
  if (!isNaN(n)) return n;
  if (typeof val === 'string') {
    var m = val.match(/OSI[\s":]+([0-9.]+)/i);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function profileWindowFieldsFromRow(row) {
    return {
      osi_ytd: numOrNull(S ? S.pickCol(row, 'osi_ytd', 'OSI_YTD', 'osi', 'OSI') : row.osi_ytd || row.osi),
      osi_l30: extractWindowOSI(S ? S.pickCol(row, 'osi_l30', 'OSI_L30', 'l30_osi', 'L30_OSI') : row.osi_l30),
      osi_l14: extractWindowOSI(S ? S.pickCol(row, 'osi_l14', 'OSI_L14', 'l14_osi', 'L14_OSI') : row.osi_l14),
      osi_l7:  extractWindowOSI(S ? S.pickCol(row, 'osi_l7', 'OSI_L7', 'l7_osi', 'L7_OSI') : row.osi_l7)
    };
  }

  function parseTeamProfilesMap(rows) {
    if (typeof global.parseTeamProfileRows === 'function') {
      return global.parseTeamProfileRows(rows);
    }
    var map = {};
    (rows || []).forEach(function(row) {
      var t = S ? S.teamKey(S.pickCol(row, 'team', 'Tm', 'Team')) : String(row.team || '').trim().toUpperCase();
      if (!t) return;
      map[t] = profileWindowFieldsFromRow(row);
    });
    return map;
  }

  function withProfileWindows(rows) {
    var profs = (global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam) || {};
    return (rows || []).map(function(d) {
      var p = profs[d.t];
      if (!p) return d;
      var o = Object.assign({}, d);
      if (p.osi_l30 != null) { o.l30OSI = o.l30osi = p.osi_l30; }
      if (p.osi_l14 != null) { o.l14OSI = o.l14osi = p.osi_l14; }
      if (p.osi_l7 != null) { o.l7OSI = o.l7osi = p.osi_l7; }
      return o;
    });
  }

  function refreshWindowProfileScores() {
    if (typeof global.syncWindowProfileScores === 'function') {
      global.syncWindowProfileScores();
      return;
    }
    var profs = (global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam) || {};
    var base = global.SCO_YTD_B || [];
    if (!base.length) return;
    function buildRows(field) {
      return base.map(function(d) {
        var p = profs[d.t];
        if (!p || p[field] == null || isNaN(p[field])) return null;
        var row = Object.assign({}, d);
        row.osi = p[field];
        row.t = d.t;
        if (field === 'osi_l30') row.l30OSI = p[field];
        if (field === 'osi_l14') row.l14OSI = p[field];
        if (field === 'osi_l7') row.l7OSI = p[field];
        return row;
      }).filter(Boolean);
    }
    global.SCO_L30_B = buildRows('osi_l30');
    global.SCO_L14_B = buildRows('osi_l14');
    global.SCO_L7_B = buildRows('osi_l7');
    if (typeof global.toMap === 'function') {
      global.M_L30 = global.toMap(global.SCO_L30_B);
      global.M_L14 = global.toMap(global.SCO_L14_B);
      global.M_L7 = global.toMap(global.SCO_L7_B);
    }
  }

  function syncResearchGlobalsFromLiveData() {
    var synced = false;
    var r = (global.LIVE_DATA && LIVE_DATA.scYtdR) || [];
    var l = (global.LIVE_DATA && LIVE_DATA.scYtdL) || [];
    if (r.length >= 10 && l.length >= 10) {
      global.SCO_YTD_R = r.map(function(d) { return Object.assign({}, d); });
      global.SCO_YTD_L = l.map(function(d) { return Object.assign({}, d); });
      if (typeof global.buildYtdBothRows === 'function') {
        global.SCO_YTD_B = global.buildYtdBothRows(global.SCO_YTD_R, global.SCO_YTD_L);
      }
      if (typeof global.toMap === 'function') {
        global.M_YTD_R = global.toMap(global.SCO_YTD_R);
        global.M_YTD_L = global.toMap(global.SCO_YTD_L);
      }
      if (typeof global.enrichYtdMaster === 'function') global.enrichYtdMaster();
      else if (typeof global.attachPalsToScores === 'function') global.attachPalsToScores();
      synced = true;
    } else if (global.SCO_YTD_R && global.SCO_YTD_R.length >= 10 && global.SCO_YTD_L && global.SCO_YTD_L.length >= 10) {
      if ((!global.SCO_YTD_B || global.SCO_YTD_B.length < 10) && typeof global.buildYtdBothRows === 'function') {
        global.SCO_YTD_B = global.buildYtdBothRows(global.SCO_YTD_R, global.SCO_YTD_L);
        if (typeof global.enrichYtdMaster === 'function') global.enrichYtdMaster();
      }
      synced = !!(global.SCO_YTD_B && global.SCO_YTD_B.length >= 10);
    }
    if (global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam && Object.keys(LIVE_DATA.teamProfilesByTeam).length) {
      refreshWindowProfileScores();
    }
    return synced;
  }

  function resetResearchLabFilters() {
    if (global.STATE) global.STATE.searchQuery = '';
    ['searchInput', 'dashSearchInput', 'masterSearch'].forEach(function(id) {
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
      _rlReadyTries++;
      syncResearchGlobalsFromLiveData();
      var data = getResearchTeamData('both');
      var profileCount = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam
        ? Object.keys(LIVE_DATA.teamProfilesByTeam).length : 0;
      var profilesReady = profileCount >= 20 || _rlReadyTries >= 40;
      if (data && data.length > 0 && profilesReady) {
        if (_rlReadyPoll) { clearTimeout(_rlReadyPoll); _rlReadyPoll = null; }
        renderResearchLabContent();
      } else if (data && data.length > 0 && !profilesReady && _rlReadyTries < 40) {
        fetchTeamProfiles().finally(function() {
          _rlReadyPoll = setTimeout(tick, 100);
        });
      } else if (_rlReadyTries >= 60) {
        console.warn('[RL] Proceeding with partial data after timeout');
        renderResearchLabContent();
      } else {
        _rlReadyPoll = setTimeout(tick, 300);
      }
    }
    if (_rlReadyPoll) clearTimeout(_rlReadyPoll);
    fetchTeamProfiles();
    tick();
  }

  var SUBTABS = ['trends', 'compare', 'pitching'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function mColor(v, invert, ctx) {
    if (!A || !A.metricColor) return '#71717A';
    if (ctx === 'oor' || ctx === 'OOR') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    if (ctx === 'ppGap') return A.ppGapColor ? A.ppGapColor(v) : '#71717A';
    return A.metricColor(v, ctx || 'osi', !!invert);
  }
  function metricChip(v, ctx, invert, decimals, opts) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals, opts || {});
    return '<span class="chip c-na">' + fmt(v, decimals) + '</span>';
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
      return RL.spProfiles;
    }).catch(function() { return []; });
  }

  function profilesHaveWindowOsi(profs) {
    var n = 0;
    Object.keys(profs || {}).forEach(function(t) {
      var p = profs[t];
      if (p && p.osi_l30 != null && !isNaN(p.osi_l30)) n++;
    });
    return n >= 10;
  }

  function fetchTeamProfiles() {
    var profs = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam;
    if (profs && Object.keys(profs).length >= 20 && profilesHaveWindowOsi(profs)) {
      return Promise.resolve(profs);
    }
    if (!S || !TABS || !TABS.team_profiles) return Promise.resolve({});
    return S.fetchSheetTab(TABS.team_profiles).then(function(rows) {
      if (!global.LIVE_DATA) global.LIVE_DATA = {};
      rows = (typeof fixSplitColumns === 'function') ? fixSplitColumns(rows || []) : (rows || []);
      rows = rows.map(function(row) {
        ['osi_l30','osi_l14','osi_l7'].forEach(function(k) {
          if (typeof row[k] === 'string' && row[k].indexOf('{') !== -1) {
            var m = row[k].match(/OSI[\s":]+([0-9.]+)/i);
            row[k] = m ? parseFloat(m[1]) : null;
          }
        });
        return row;
      });
      LIVE_DATA.teamProfiles = rows;
      LIVE_DATA.teamProfilesByTeam = parseTeamProfilesMap(rows);
      if (typeof global.detectWindowMetricsFromProfiles === 'function') {
        LIVE_DATA.windowMetricsAvailable = global.detectWindowMetricsFromProfiles(LIVE_DATA.teamProfilesByTeam);
      }
      syncResearchGlobalsFromLiveData();
      if (typeof global.renderTrendHeatmap === 'function') global.renderTrendHeatmap();
      if (typeof global.ResearchLab !== 'undefined' && ResearchLab.renderTrendSummary) ResearchLab.renderTrendSummary();
      return LIVE_DATA.teamProfilesByTeam;
    }).catch(function() { return {}; });
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
    if (document.querySelector('.ca-lab__header')) return;
    var el = document.getElementById('researchLabHeader');
    if (!el || el.dataset.mounted) return;
    el.dataset.mounted = '1';
    el.innerHTML = '<div class="rl-workspace-header">'
      + '<h2 class="rl-workspace-title"><img src="assets/chase-icon-filled.png" alt="" width="24" height="24" style="width:24px;height:24px;object-fit:contain" onerror="this.style.display=\'none\'">Research Lab</h2>'
      + '<p class="rl-workspace-subtitle">Four focused tools \u2014 trends, splits, compare, and pitcher research.</p>'
      + '</div>';
  }


  function getActiveRlTab() {
    var active = document.querySelector('.ca-lab__tab.ca-lab__tab--active') || document.querySelector('#layerAdvanced .subtab.active');
    var pane = active ? active.getAttribute('data-pane') : 'trends';
    if (pane === 'pitcher') pane = 'pitching';
    return pane;
  }

  function refreshActiveRlTab() {
    var tab = getActiveRlTab();
    if (tab === 'trends') {
      if (typeof global.renderTrendHeatmap === 'function') global.renderTrendHeatmap();
      renderTrendSummary();
    } else if (tab === 'splits') {
      if (typeof global.renderSplitsTable === 'function') global.renderSplitsTable();
    }
    mountGlobalControlBar();
  }

  function mountGlobalControlBar() {
    var el = document.getElementById('rlGlobalControlBar');
    if (!el) return;
    var st = global.STATE || {};
    if (!st.split) st.split = 'b';
    if (!st.time) st.time = 'YTD';
    var tab = getActiveRlTab();
    var tabLabel = { trends: 'Trends', splits: 'Splits', compare: 'Compare', pitching: 'Pitcher Lab' }[tab] || tab;
    if (tab === 'trends') {
      el.innerHTML = '<div class="rl-global-bar-inner">'
        + '<span class="rl-global-bar-title">Research Lab \u00B7 <strong>Trends</strong> \u00B7 '
        + 'Rolling windows L30 / L14 / L7 (use metric pills below)</span></div>';
      return;
    }
    var splitLabel = { b: 'Both', r: 'vs RHP', l: 'vs LHP', home: 'Home', away: 'Away' }[st.split] || 'Both';
    el.innerHTML = '<div class="rl-global-bar-inner">'
      + '<span class="rl-global-bar-title">Research Lab \u00B7 <strong>' + esc(tabLabel) + '</strong> \u00B7 '
      + esc(splitLabel) + ' \u00B7 ' + esc(st.time) + '</span>'
      + '<div class="rl-global-bar-controls">'
      + '<span class="rl-global-bar-label">Split</span>'
      + ['b', 'r', 'l', 'home', 'away'].map(function(sp) {
        var lbl = { b: 'Both', r: 'vs RHP', l: 'vs LHP', home: 'Home', away: 'Away' }[sp];
        return '<button type="button" class="rl-global-btn' + (st.split === sp ? ' active' : '') + '" data-rl-split="' + sp + '">' + lbl + '</button>';
      }).join('')
      + '<span class="rl-global-bar-label">Window</span>'
      + ['YTD', 'L30', 'L14', 'L7'].map(function(w) {
        return '<button type="button" class="rl-global-btn' + (st.time === w ? ' active' : '') + '" data-rl-window="' + w + '">' + w + '</button>';
      }).join('')
      + '</div></div>';
    el.querySelectorAll('[data-rl-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        st.split = btn.getAttribute('data-rl-split');
        if (typeof global.syncGlobalBarToUix === 'function') global.syncGlobalBarToUix();
        refreshActiveRlTab();
      });
    });
    el.querySelectorAll('[data-rl-window]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        st.time = btn.getAttribute('data-rl-window');
        if (typeof global.syncGlobalBarToUix === 'function') global.syncGlobalBarToUix();
        refreshActiveRlTab();
      });
    });
  }

  function renderTrendSummary() {
    var mount = document.getElementById('rlTrendSummaryMount');
    if (!mount) return;
    syncResearchGlobalsFromLiveData();
    var rows = getResearchTeamData('both');
    if (!rows.length) { mount.innerHTML = ''; return; }
    var cmpKey = 'd' + RL.rlWindowCmp;
    var risers = rows.filter(function(d) { return d[cmpKey] > 2; }).sort(function(a, b) { return b[cmpKey] - a[cmpKey]; }).slice(0, 3);
    var fallers = rows.filter(function(d) { return d[cmpKey] < -2; }).sort(function(a, b) { return a[cmpKey] - b[cmpKey]; }).slice(0, 3);
    var volatile = rows.slice().sort(function(a, b) {
      var va = Math.abs((a.l7OSI || 0) - (a.ytdOSI || a.osi || 0));
      var vb = Math.abs((b.l7OSI || 0) - (b.ytdOSI || b.osi || 0));
      return vb - va;
    }).slice(0, 3);
    var stable = rows.filter(function(d) { return d.trend === 'Stable Elite' || d.trend === 'Stable'; }).slice(0, 3);
    function card(title, items, fmtFn) {
      return '<div class="rl-summary-card"><div class="rl-summary-label">' + esc(title) + '</div><div class="rl-summary-val">'
        + (items.length ? items.map(fmtFn).join('<br>') : '\u2014') + '</div></div>';
    }
    mount.innerHTML = card('Biggest risers', risers, function(d) { return d.t + ' +' + (d[cmpKey] || 0).toFixed(1); })
      + card('Biggest fallers', fallers, function(d) { return d.t + ' ' + (d[cmpKey] || 0).toFixed(1); })
      + card('Most volatile', volatile, function(d) { return d.t + ' L7 \u0394 ' + Math.abs((d.l7OSI || 0) - (d.ytdOSI || d.osi || 0)).toFixed(1); })
      + card('Most stable', stable, function(d) { return d.t + ' \u00B7 ' + (d.trend || 'Stable'); });
  }

  function patchSubtabs() {
    if (document.querySelector('.ca-lab__tabs')) {
      global.RESEARCH_SUBTABS = SUBTABS.slice();
      return;
    }
    mountWorkspaceHeader();
    var layer = document.getElementById('layerAdvanced');
    if (!layer) return;
    var tabBar = layer.querySelector('.subtabs');
    if (tabBar) {
      tabBar.classList.add('rl-segment-tabs');
      var panes = tabBar.querySelectorAll('[data-pane]');
      if (panes.length !== 4 || !tabBar.querySelector('[data-pane="trends"]')) {
        tabBar.innerHTML = ''
          + '<button type="button" class="subtab active" data-pane="trends">Trends</button>'
          + '<button type="button" class="subtab" data-pane="splits">Splits</button>'
          + '<button type="button" class="subtab" data-pane="compare">Compare</button>'
          + '<button type="button" class="subtab" data-pane="pitching">Pitcher Intelligence</button>';
      }
    }
    global.RESEARCH_SUBTABS = SUBTABS.slice();
  }

  function mountLeaderboards() {
    var lbBody = document.getElementById('leaderboardBody');
    if (!lbBody) return;
    if (typeof hideRankSkeleton === 'function') hideRankSkeleton();
    resetResearchLabFilters();
    syncResearchGlobalsFromLiveData();
    if (global.STATE) global.STATE.searchQuery = '';
    var renderLb = function() {
      syncResearchGlobalsFromLiveData();
      if (global.STATE) global.STATE.searchQuery = '';
      if (typeof renderMasterTable === 'function') {
        renderMasterTable({
          bodyId: 'leaderboardBody',
          mobileId: 'leaderboardMobileCards',
          tableId: 'leaderboardTable',
          forcePlatform: true
        });
      }
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
            + '<td class="num">' + metricChip(ps, 'pitching', false, 1) + '</td>'
            + '<td class="num">' + metricChip(m.osiAllowed, 'osi', true, 1) + '</td>'
            + '<td class="num">' + metricChip(m.oor, 'oor', false, 1) + '</td></tr>';
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
            + '<td class="num">' + metricChip(r.score, 'pitching', false, 1) + '</td>'
            + '<td class="num">' + metricChip(r.u.osiAllowed, 'osi', true, 1) + '</td>'
            + '<td class="num">' + metricChip(r.u.oor, 'oor', false, 1) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<p class="ca-helper">Bullpen_Unit data not loaded.</p>') + '</div>';

      root.innerHTML = pitchHtml + bpHtml;
    });
  }

  function renderSplitSummary() {
    var mount = document.getElementById('rlSplitSummaryMount');
    if (mount) mount.remove();
  }

  function renderComparePane() {
    var root = document.getElementById('rlCompareRoot');
    if (!root) return;
    syncResearchGlobalsFromLiveData();
    fetchSpProfiles().then(function() {
      return fetchTeamProfiles();
    }).finally(function() {
      renderComparePaneInner(root);
    });
  }

  function defaultCompareSide() {
    var cm = CM();
    return { key: '', filter: cm ? cm.defaultSideFilter() : { hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' } };
  }

  function ensureCompareSides() {
    if (!RL.compareMode) RL.compareMode = 'lineup-lineup';
    if (!RL.compareSideA || RL.compareSideA.entity) {
      var kA = RL.compareSideA && RL.compareSideA.key ? RL.compareSideA.key : '';
      RL.compareSideA = defaultCompareSide();
      RL.compareSideA.key = kA;
    }
    if (!RL.compareSideB || RL.compareSideB.entity) {
      var kB = RL.compareSideB && RL.compareSideB.key ? RL.compareSideB.key : '';
      RL.compareSideB = defaultCompareSide();
      RL.compareSideB.key = kB;
    }
    if (!RL.compareSideA.filter) RL.compareSideA.filter = defaultCompareSide().filter;
    if (!RL.compareSideB.filter) RL.compareSideB.filter = defaultCompareSide().filter;
  }

  function compareModeInfo() {
    var cm = CM();
    return (cm && cm.MODES && cm.MODES[RL.compareMode]) || { label: 'Compare', desc: '' };
  }

  function applyCompareMode(modeId) {
    var cm = CM();
    if (!cm || !cm.MODES[modeId]) return;
    RL.compareMode = modeId;
    RL.compareSideA.key = '';
    RL.compareSideB.key = '';
    RL.compareSideA.filter = cm.defaultSideFilter();
    RL.compareSideB.filter = cm.defaultSideFilter();
    if (modeId === 'lineup-bullpen') {
      RL.compareSideA.filter.pitcher = 'rp';
    }
    if (modeId === 'lineup-sp') {
      RL.compareSideA.filter.pitcher = 'sp';
    }
  }

  function compareSideRef(sideKey) {
    return sideKey === 'B' ? RL.compareSideB : RL.compareSideA;
  }

  function deriveComparePair() {
    return RL.compareMode || 'lineup-lineup';
  }

  function findTeamProfileRaw(t) {
    var rows = (global.LIVE_DATA && LIVE_DATA.teamProfiles) || [];
    t = String(t || '').toUpperCase();
    return rows.find(function(row) {
      var tk = S ? S.teamKey(S.pickCol(row, 'team', 'Tm', 'Team')) : String(row.team || '').trim().toUpperCase();
      return tk === t;
    }) || null;
  }

  function estimateF5Osi(row) {
    if (!row) return null;
    var abq = row.abq;
    var obr = row.obr;
    var rcv = row.rcv;
    if (abq == null || obr == null || rcv == null || isNaN(abq) || isNaN(obr) || isNaN(rcv)) return null;
    return (abq * 0.45) + (obr * 0.35) + (rcv * 0.20);
  }

  function teamRowForCompare(team, split) {
    if (!team) return null;
    team = String(team).toUpperCase();
    if (split === 'r' || split === 'l' || split === 'b') {
      var dataSplit = split === 'b' ? 'both' : split;
      return getResearchTeamData(dataSplit).find(function(d) { return d.t === team; });
    }
    var base = teamRow(team);
    if (!base) return null;
    var prof = findTeamProfileRaw(team);
    if (split === 'home') {
      var ho = prof ? numOrNull(S.pickCol(prof, 'home_osi', 'Home_OSI')) : null;
      return ho != null ? Object.assign({}, base, { osi: ho }) : base;
    }
    if (split === 'away') {
      var ao = prof ? numOrNull(S.pickCol(prof, 'away_osi', 'Away_OSI')) : null;
      return ao != null ? Object.assign({}, base, { osi: ao }) : base;
    }
    if (split === 'f5') {
      var f5 = prof ? numOrNull(S.pickCol(prof, 'osi_f5', 'OSI_F5')) : null;
      if (f5 == null) f5 = estimateF5Osi(base);
      return f5 != null ? Object.assign({}, base, { osi: f5 }) : base;
    }
    return base;
  }

  function renderComparePaneInner(root) {
    ensureCompareSides();
    syncResearchGlobalsFromLiveData();
    var teams = (global.SCO_YTD_B || []).map(function(r) { return r.t; }).filter(Boolean).sort();
    if (!teams.length) teams = teamList();
    var cm = CM();
    var mode = compareModeInfo();
    var modeBtns = cm ? Object.keys(cm.MODES).map(function(id) {
      var m = cm.MODES[id];
      return '<button type="button" class="ca-pill-btn rl-compare-mode-btn' + (RL.compareMode === id ? ' active' : '') + '" data-cmp-workspace="' + esc(id) + '">' + esc(m.label) + '</button>';
    }).join('') : '';

    root.innerHTML = '<div class="rl-compare-h2h ca-card">'
      + '<div class="rl-compare-h2h-header ca-section-head">'
      + iconCircle('swords') + '<span>Compare Workspace</span>'
      + '</div>'
      + '<h3 class="rl-compare-h2h-title">Head-to-Head Intelligence</h3>'
      + '<p class="rl-compare-h2h-subtitle">Four compare modes with independent split controls on each side.</p>'
      + '<div class="rl-compare-modes rl-compare-modes--large ca-pill-bar">' + modeBtns + '</div>'
      + '<div id="rlCompareQueryLine" class="ca-query-line"><strong>' + esc(mode.label) + '</strong> · ' + esc(mode.desc) + '</div>'
      + '<div class="rl-compare-panels">'
      + renderCompareSidePanelHtml('SIDE A', 'A', RL.compareSideA, teams)
      + renderCompareSidePanelHtml('SIDE B', 'B', RL.compareSideB, teams)
      + '</div>'
      + '<div class="rl-compare-run-wrap">'
      + '<button type="button" class="rl-compare-run" id="rlCmpRun">Compare</button>'
      + '</div>'
      + '<div id="rlCompareOutput"></div>'
      + '</div>';

    if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(root);

    bindCompareWorkspaceModes(teams);
    bindCompareSidePanel('A', teams);
    bindCompareSidePanel('B', teams);

    var run = document.getElementById('rlCmpRun');
    if (run) run.addEventListener('click', function() {
      syncCompareSideKeysFromInputs('A');
      syncCompareSideKeysFromInputs('B');
      renderCompareOutput();
    });

    renderCompareOutput();
  }

  function compareSideEntityLabel(modeId, sideKey) {
    var cm = CM();
    if (!cm) return 'Entity';
    var ent = cm.modeEntity(modeId, sideKey);
    return ent === 'pitcher' ? 'Pitcher' : ent === 'bullpen' ? 'Bullpen' : 'Lineup';
  }

  function renderCompareSplitRows(modeId, sideKey, side) {
    var cm = CM();
    if (!cm) return '';
    var groups = cm.splitGroupsForSide(modeId, sideKey);
    var filter = side.filter || cm.defaultSideFilter();
    return groups.map(function(grp) {
      return '<div class="rl-compare-pill-row ca-pill-bar rl-compare-split-row">'
        + grp.options.map(function(opt) {
          var active = filter[grp.key] === opt.v;
          return '<button type="button" class="ca-pill-btn' + (active ? ' active' : '') + '" data-cmp-filter="' + grp.key + '" data-cmp-filter-val="' + opt.v + '" data-side="' + sideKey + '">' + esc(opt.l) + '</button>';
        }).join('')
        + '</div>';
    }).join('');
  }

  function renderCompareSidePanelHtml(label, sideKey, side, teams) {
    var modeId = RL.compareMode || 'lineup-lineup';
    var entity = compareSideEntityLabel(modeId, sideKey);
    var cm = CM();
    var entType = cm ? cm.modeEntity(modeId, sideKey) : 'lineup';
    var selectorHtml = '';
    if (entType === 'pitcher') {
      selectorHtml = pitcherSearchHtml('rlCmp' + sideKey + 'Key', 'Select pitcher', side.key);
    } else {
      var selLabel = entType === 'bullpen' ? 'Select bullpen team' : 'Select team';
      selectorHtml = teamSelectHtml('rlCmp' + sideKey + 'Key', selLabel, teams, side.key);
    }
    var splitTag = cm ? cm.filterSummary(side.filter) : '';
    return '<div class="rl-compare-panel" data-side="' + sideKey + '">'
      + '<div class="rl-compare-panel-label">' + esc(label) + ' <span class="rl-compare-entity-tag">' + esc(entity) + '</span></div>'
      + renderCompareSplitRows(modeId, sideKey, side)
      + '<div class="rl-compare-panel-select">' + selectorHtml + '</div>'
      + (splitTag ? '<div class="ca-helper rl-compare-filter-note">' + esc(splitTag) + '</div>' : '')
      + '<button type="button" class="rl-compare-clear" data-cmp-clear="' + sideKey + '">Clear</button>'
      + '</div>';
  }

  function bindCompareWorkspaceModes(teams) {
    document.querySelectorAll('[data-cmp-workspace]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        applyCompareMode(btn.getAttribute('data-cmp-workspace'));
        renderComparePaneInner(document.getElementById('rlCompareRoot'));
      });
    });
  }

  function bindCompareSidePanel(sideKey, teams) {
    var side = compareSideRef(sideKey);
    document.querySelectorAll('[data-cmp-filter][data-side="' + sideKey + '"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!side.filter) side.filter = defaultCompareSide().filter;
        side.filter[btn.getAttribute('data-cmp-filter')] = btn.getAttribute('data-cmp-filter-val');
        rerenderComparePanels(teams);
        renderCompareOutput();
      });
    });
    var sel = document.getElementById('rlCmp' + sideKey + 'Key');
    if (sel && sel.tagName === 'SELECT') {
      sel.addEventListener('change', function() { side.key = sel.value; });
    }
    var modeId = RL.compareMode || 'lineup-lineup';
    var cm = CM();
    if (cm && cm.modeEntity(modeId, sideKey) === 'pitcher') {
      bindComparePitcherSearch('rlCmp' + sideKey + 'Key', sideKey);
    }
    var clr = document.querySelector('[data-cmp-clear="' + sideKey + '"]');
    if (clr) {
      clr.addEventListener('click', function() {
        side.key = '';
        rerenderComparePanels(teams);
        renderCompareOutput();
      });
    }
  }

  function syncCompareSideKeysFromInputs(sideKey) {
    var side = compareSideRef(sideKey);
    var el = document.getElementById('rlCmp' + sideKey + 'Key');
    if (el) side.key = el.value || '';
  }

  function rerenderComparePanels(teams) {
    var panels = document.querySelector('.rl-compare-panels');
    if (!panels) return;
    if (!teams) {
      teams = (global.SCO_YTD_B || []).map(function(r) { return r.t; }).filter(Boolean).sort();
      if (!teams.length) teams = teamList();
    }
    panels.innerHTML = renderCompareSidePanelHtml('SIDE A', 'A', RL.compareSideA, teams)
      + renderCompareSidePanelHtml('SIDE B', 'B', RL.compareSideB, teams);
    bindCompareSidePanel('A', teams);
    bindCompareSidePanel('B', teams);
    var mode = compareModeInfo();
    var q = document.getElementById('rlCompareQueryLine');
    if (q) q.innerHTML = '<strong>' + esc(mode.label) + '</strong> · ' + esc(mode.desc);
  }

  function teamSelectHtml(id, label, teams, val) {
    return '<div><label for="' + id + '">' + label + '</label>'
      + '<select id="' + id + '" class="rl-compare-select search-input" style="width:100%;margin-top:6px;">'
      + '<option value="">Select team...</option>'
      + teams.map(function(t) {
        return '<option value="' + esc(t) + '"' + (t === val ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('')
      + '</select></div>';
  }

  function comparePitcherMatches(q) {
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    return getResearchPitcherData().filter(function(row) {
      var n = S ? String(S.pickCol(row, ['pitcher_name', 'Name', 'Pitcher']) || '').toLowerCase() : '';
      var t = S ? String(S.pickCol(row, ['pitcher_team', 'Team', 'Tm']) || '').toLowerCase() : '';
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    }).slice(0, 8);
  }

  function pitcherSearchHtml(id, label, val) {
    return '<div><label for="' + id + '">' + label + '</label>'
      + '<div class="rl-search-wrap pl-search-wrap" style="position:relative;margin-top:6px;">'
      + '<input type="search" id="' + id + '" class="search-input" style="width:100%;" value="' + esc(val || '') + '" placeholder="Search pitcher name or team\u2026" autocomplete="off">'
      + '<div id="' + id + 'Drop" class="pl-search-dropdown rl-compare-pitcher-dd" style="display:none;"></div></div></div>';
  }

  function bindComparePitcherSearch(id, sideKey) {
    var inp = document.getElementById(id);
    var dd = document.getElementById(id + 'Drop');
    if (!inp || !dd) return;
    var side = compareSideRef(sideKey);
    function renderDd() {
      var matches = comparePitcherMatches(inp.value);
      if (!matches.length) { dd.style.display = 'none'; dd.innerHTML = ''; return; }
      dd.style.display = 'block';
      dd.innerHTML = matches.map(function(row) {
        var n = S.pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
        var tm = S.pickCol(row, ['pitcher_team', 'Team', 'Tm']);
        var hand = String(S.pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
        var met = S.spProfileMetrics(row);
        var av = A ? A.pitcherAvatar(n, { crop: 'compare', className: 'pl-dd-av' }) : '';
        return '<button type="button" class="pl-dd-item" data-name="' + esc(n) + '">' + av
          + '<span class="pl-dd-name">' + esc(n) + '</span>'
          + '<span class="pl-dd-meta">' + esc(tm) + ' · ' + esc(hand) + 'HP · PS '
          + (met && met.pitchScore != null ? met.pitchScore.toFixed(0) : '—') + '</span></button>';
      }).join('');
      dd.querySelectorAll('.pl-dd-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var name = btn.getAttribute('data-name');
          side.key = name;
          inp.value = name;
          dd.style.display = 'none';
        });
      });
    }
    inp.addEventListener('input', renderDd);
    inp.addEventListener('focus', renderDd);
    inp.addEventListener('change', function() { side.key = inp.value; });
  }

  var _compareDdCloseBound = false;

  function bindCompareDropdownClose() {
    if (_compareDdCloseBound) return;
    _compareDdCloseBound = true;
    document.addEventListener('click', function cmpDdClose(e) {
      if (!e.target.closest('.rl-search-wrap')) {
        ['A', 'B'].forEach(function(sideKey) {
          var dd = document.getElementById('rlCmp' + sideKey + 'KeyDrop');
          if (dd) dd.style.display = 'none';
        });
      }
    });
  }

  function pitcherAvatarHtml(name, sizeKey) {
    if (!A || !name) return '';
    return A.pitcherAvatar(name, { crop: sizeKey === 'matchup' ? 'matchup' : 'compare', className: 'rl-compare-avatar' });
  }

  function pitcherScorecard(name, label, val, invert) {
    return '<div class="rl-scorecard rl-scorecard--pitcher">'
      + pitcherAvatarHtml(name, 'compare')
      + '<div class="rl-scorecard-body"><h4>' + esc(name) + '</h4>'
      + '<div class="ca-metric-label">' + esc(label) + '</div>'
      + '<div class="rl-metric-primary">' + metricChip(val, 'pitching', invert, 1) + '</div></div></div>';
  }

  function bpScore(u) {
    return u && u.osiAllowed != null ? Math.max(0, 100 - u.osiAllowed) : null;
  }

  function getSideCompareData(side) {
    var entity = side.entity;
    var key = side.key;
    var split = side.split || 'b';
    if (!key) return null;

    if (entity === 'lineup') {
      var row = teamRowForCompare(key, split);
      if (!row) return null;
      return {
        entity: 'lineup',
        label: row.t,
        splitLabel: splitLabelForCompare(split),
        row: row,
        primary: row.osi,
        primaryLabel: 'OSI',
        primaryInvert: false,
        identityHtml: teamIdentityCard(row, splitLabelForCompare(split)),
        metrics: [
          ['osi', 'OSI', false], ['projOSI', 'ProjOSI', false], ['abq', 'ABQ', false],
          ['rcv', 'RCV', false], ['obr', 'OBR', false], ['ppGap', 'PP-Gap', false, false, 'ppGap'],
          ['rhpOSI', 'vRHP', false], ['lhpOSI', 'vLHP', false]
        ]
      };
    }

    if (entity === 'pitcher') {
      var sp = findSpProfile(key);
      if (!sp) return null;
      var m = S ? S.spProfileMetrics(sp) : {};
      var ps = m.pitchScore != null ? m.pitchScore : (m.osiAllowed != null ? 100 - m.osiAllowed : null);
      var lhh = numOrNull(S.pickCol(sp, 'osi_allowed_vs_lhh', 'OSI_allowed_LHH')) || m.osiAllowed;
      var rhh = numOrNull(S.pickCol(sp, 'osi_allowed_vs_rhh', 'OSI_allowed_RHH')) || m.osiAllowed;
      var splitVal = split === 'l' ? lhh : (split === 'r' ? rhh : m.osiAllowed);
      return {
        entity: 'pitcher',
        label: key,
        splitLabel: splitLabelForCompare(split),
        row: sp,
        metricsObj: m,
        splitOsiAllowed: splitVal,
        primary: ps,
        primaryLabel: 'Pitching Score',
        primaryInvert: false,
        identityHtml: pitcherScorecard(key, 'Pitching Score', ps, false),
        metrics: [
          ['kPct', 'K%', true], ['bbPct', 'BB%', true, true],
          ['osiAllowed', 'OSI Allowed', false, true],
          ['abqAllowed', 'ABQ Allowed', false, true],
          ['rcvAllowed', 'RCV Allowed', false, true],
          ['oor', 'Pitcher OOR', false, false, 'oor']
        ]
      };
    }

    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var u = units[key] || units[String(key).toUpperCase()];
    if (!u) return null;
    var unitScore = bpScore(u);
    return {
      entity: 'bullpen',
      label: key,
      splitLabel: splitLabelForCompare(split),
      row: u,
      primary: unitScore,
      primaryLabel: 'Bullpen Score',
      primaryInvert: false,
      identityHtml: bullpenIdentityCard(key, unitScore, u),
      metrics: [
        ['osiAllowed', 'OSI Allowed', u.osiAllowed, false, true],
        ['abqAllowed', 'ABQ Allowed', u.abqAllowed, false, true],
        ['oor', 'Unit OOR', u.oor, false, false, 'oor']
      ]
    };
  }

  function bullpenIdentityCard(team, score, unit) {
    var logo = A ? A.teamLogoImg(team, 40) : '';
    return '<div class="rl-compare-identity">' + logo
      + '<div><div style="font-weight:700;font-size:16px;">' + esc(team) + ' Bullpen</div>'
      + '<div class="ca-helper">Bullpen Score ' + metricChip(score, 'pitching', false, 1)
      + ' · OSI Allowed ' + metricChip(unit && unit.osiAllowed, 'osi', true, 1) + '</div></div></div>';
  }

  function compareIdentityHtml(data) {
    if (!data) return '';
    var cm = CM();
    var splitTag = data.filterSummary ? ' <span class="rl-compare-split-tag">' + esc(data.filterSummary) + '</span>' : '';
    if (data.entity === 'pitcher') {
      return pitcherScorecard(data.label, data.primaryLabel || 'Pitching Score', data.primary, false);
    }
    if (data.entity === 'bullpen') {
      return bullpenIdentityCard(data.label, data.primary, data.row);
    }
    var row = data.row;
    if (!row) return '';
    var logo = A ? A.teamLogoImg(row.t, 40) : '';
    var tier = row.osi >= 75 ? 'Elite' : row.osi >= 60 ? 'Solid' : row.osi >= 45 ? 'Avg' : 'Weak';
    var tierCls = row.osi >= 75 ? 'tier-elite' : row.osi >= 60 ? 'tier-solid' : 'tier-mid';
    return '<div class="rl-compare-identity">' + logo
      + '<div><div style="font-weight:700;font-size:16px;">' + esc(row.t) + splitTag + '</div>'
      + '<div class="ca-helper">OSI ' + metricChip(row.osi, 'osi', false, 1)
      + ' <span class="tier-badge ' + tierCls + '">' + esc(tier) + '</span></div></div></div>';
  }

  function metricValFromSide(data, spec) {
    if (!data) return null;
    if (data.entity === 'pitcher' && data.metricsObj && typeof spec[0] === 'string') {
      if (spec[0] === 'osiAllowed') {
        return data.splitOsiAllowed != null ? data.splitOsiAllowed : data.metricsObj.osiAllowed;
      }
      if (spec[0] === 'kPct' || spec[0] === 'bbPct' || spec[0] === 'abqAllowed' || spec[0] === 'rcvAllowed' || spec[0] === 'oor') {
        return data.metricsObj[spec[0]];
      }
    }
    if (data.entity === 'bullpen' && data.row) {
      return data.row[spec[0]];
    }
    if (data.row) return data.row[spec[0]];
    return null;
  }

  function buildCompareMetricRows(dataA, dataB, pair) {
    var cm = CM();
    if (cm && cm.buildMetricRows) return cm.buildMetricRows(pair || RL.compareMode, dataA, dataB);
    return [];
  }

  function compareMetricRowsHtml(rows) {
    return rows.map(function(row) {
      var va = row.valA;
      var vb = row.valB;
      var winner = 'none';
      if (va != null && vb != null && !isNaN(va) && !isNaN(vb) && Math.abs(va - vb) >= 0.5) {
        var aWins = row.higherBetter ? va > vb : va < vb;
        winner = aWins ? 'a' : 'b';
      }
      return '<div class="rl-compare-metric-row">'
        + '<span class="rl-compare-metric-val rl-compare-metric-val--a' + (winner === 'a' ? ' rl-compare-metric-val--win' : '') + '">' + metricChip(va, row.ctx || 'osi', row.invertA, 1) + '</span>'
        + '<span class="rl-compare-metric-label">' + esc(row.label) + '</span>'
        + '<span class="rl-compare-metric-val rl-compare-metric-val--b' + (winner === 'b' ? ' rl-compare-metric-val--win' : '') + '">' + metricChip(vb, row.ctx || 'osi', row.invertB, 1) + '</span>'
        + '</div>';
    }).join('');
  }

  function compareBarChartHtml(dataA, dataB, bars) {
    if (!bars.length) return '';
    var html = '<div class="rl-compare-bar-chart">';
    bars.forEach(function(bar) {
      var va = bar.valA;
      var vb = bar.valB;
      var max = Math.max(va || 0, vb || 0, 1);
      var wa = va != null ? Math.max(4, (va / max) * 100) : 0;
      var wb = vb != null ? Math.max(4, (vb / max) * 100) : 0;
      html += '<div class="rl-compare-bar-row">'
        + '<span class="rl-compare-bar-side">' + esc(dataA.label) + '</span>'
        + '<div class="rl-compare-bar-track">'
        + '<div class="rl-compare-bar-fill rl-compare-bar-fill--a" style="width:' + wa + '%;background:' + mColor(va, bar.invert, bar.ctx) + '"></div>'
        + '</div>'
        + '<span class="rl-compare-bar-metric">' + esc(bar.label) + '</span>'
        + '<div class="rl-compare-bar-track">'
        + '<div class="rl-compare-bar-fill rl-compare-bar-fill--b" style="width:' + wb + '%;background:' + mColor(vb, bar.invert, bar.ctx) + '"></div>'
        + '</div>'
        + '<span class="rl-compare-bar-side">' + esc(dataB.label) + '</span>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }

  function compareEdgeChips(dataA, dataB, metricRows) {
    var diffs = [];
    metricRows.forEach(function(row) {
      if (row.valA == null || row.valB == null || isNaN(row.valA) || isNaN(row.valB)) return;
      var delta = row.higherBetter ? row.valA - row.valB : row.valB - row.valA;
      diffs.push({ label: row.label, delta: delta, abs: Math.abs(delta) });
    });
    diffs.sort(function(a, b) { return b.abs - a.abs; });
    return diffs.slice(0, 3);
  }

  function compareEdgeSummaryHtml(dataA, dataB, pair, metricRows) {
    var edgeLabel = 'EVEN';
    var edgeCls = 'rl-compare-edge-even';
    var pa = dataA.primary;
    var pb = dataB.primary;
    if (pa != null && pb != null && !isNaN(pa) && !isNaN(pb)) {
      if (pa > pb + 2) { edgeLabel = 'SIDE A EDGE'; edgeCls = 'rl-compare-edge-a'; }
      else if (pb > pa + 2) { edgeLabel = 'SIDE B EDGE'; edgeCls = 'rl-compare-edge-b'; }
    }
    if (pair === 'lineup-sp' && pa != null && pb != null) {
      var lineupSide = dataA.entity === 'lineup' ? dataA : dataB;
      var pitchSide = dataA.entity === 'pitcher' ? dataA : dataB;
      var lo = lineupSide.row && lineupSide.row.osi;
      var po = pitchSide.splitOsiAllowed != null ? pitchSide.splitOsiAllowed : (pitchSide.metricsObj && pitchSide.metricsObj.osiAllowed);
      if (lo != null && po != null) {
        if (lo > 100 - po + 5) { edgeLabel = dataA.entity === 'lineup' ? 'SIDE A EDGE' : 'SIDE B EDGE'; edgeCls = dataA.entity === 'lineup' ? 'rl-compare-edge-a' : 'rl-compare-edge-b'; }
        else if (100 - po > lo + 5) { edgeLabel = dataA.entity === 'pitcher' ? 'SIDE A EDGE' : 'SIDE B EDGE'; edgeCls = dataA.entity === 'pitcher' ? 'rl-compare-edge-a' : 'rl-compare-edge-b'; }
        else { edgeLabel = 'EVEN'; edgeCls = 'rl-compare-edge-even'; }
      }
    }
    var chips = compareEdgeChips(dataA, dataB, metricRows);
    return '<div class="rl-compare-edge-summary">'
      + '<div class="rl-compare-edge-badge ' + edgeCls + '">' + esc(edgeLabel) + '</div>'
      + '<div class="rl-compare-edge-chips">'
      + chips.map(function(c) {
        var sign = c.delta >= 0 ? '+' : '';
        return '<span class="rl-compare-edge-chip">' + esc(c.label) + ' ' + sign + c.delta.toFixed(1) + '</span>';
      }).join('')
      + '</div></div>';
  }
  function iconCircle(name) {
    var I = global.MLBMAIcons;
    if (I && I.iconCircleHtml) return I.iconCircleHtml(name, true);
    return '<span class="ca-icon-circle ca-icon-circle--sm" aria-hidden="true">' + (global.MLBMAIcons && MLBMAIcons.iconSvg ? MLBMAIcons.iconSvg(name) : '') + '</span>';
  }
  function compareInsightRailHtml(dataA, dataB, metricRows) {
    var top = (metricRows || []).slice().filter(function(r) {
      return r.valA != null && r.valB != null && !isNaN(r.valA) && !isNaN(r.valB);
    }).map(function(r) {
      var d = (r.higherBetter ? (r.valA - r.valB) : (r.valB - r.valA));
      return { label: r.label, delta: d, abs: Math.abs(d) };
    }).sort(function(a, b) { return b.abs - a.abs; })[0];
    var primaryA = dataA && dataA.primary != null ? Number(dataA.primary).toFixed(1) : '—';
    var primaryB = dataB && dataB.primary != null ? Number(dataB.primary).toFixed(1) : '—';
    var rows = [
      { icon: 'edge', label: 'Primary Edge', text: esc(dataA.label) + ' ' + primaryA + ' vs ' + esc(dataB.label) + ' ' + primaryB },
      { icon: 'trend-up', label: 'Largest Gap', text: top ? (top.label + ' ' + (top.delta >= 0 ? '+' : '') + top.delta.toFixed(1)) : 'No comparable metrics' },
      { icon: top && top.abs < 1.0 ? 'discipline' : 'trend-down', label: 'Risk Context', text: top && top.abs < 1.0 ? 'Tight matchup, low separation' : 'Meaningful spread across core metrics' }
    ];
    return '<div class="ca-insight-rail" style="margin-top:12px;">' + rows.map(function(r) {
      return '<div class="ca-insight-row">' + iconCircle(r.icon) + '<span><span class="ca-insight-label">'
        + esc(r.label) + '</span><span class="ca-insight-text">' + r.text + '</span></span></div>';
    }).join('') + '</div>';
  }

  function renderCompareOutput() {
    ensureCompareSides();
    bindCompareDropdownClose();
    var out = document.getElementById('rlCompareOutput');
    if (!out) return;
    if (!RL.compareSideA.key || !RL.compareSideB.key) {
      out.innerHTML = '<div class="rl-pane-card ca-card"><p class="rl-empty">Select entities on both sides and click Compare to generate output.</p></div>';
      return;
    }
    out.innerHTML = '<div class="rl-loading">Computing comparison…</div>';
    var cm = CM();
    var pair = deriveComparePair();
    var resolveFn = cm && cm.resolveBoth
      ? cm.resolveBoth(pair, RL.compareSideA, RL.compareSideB, { findSpProfile: findSpProfile })
      : Promise.resolve({ dataA: null, dataB: null });

    resolveFn.then(function(res) {
      var dataA = res.dataA;
      var dataB = res.dataB;
      if (!dataA || !dataB) {
        out.innerHTML = '<div class="rl-pane-card ca-card"><p class="ca-helper">Data not available for one or both selections.</p></div>';
        return;
      }

      var metricRows = buildCompareMetricRows(dataA, dataB, pair);

      var chartHtml = '';
      if (pair === 'lineup-lineup') {
        chartHtml = '<div id="rlTeamRadar" class="rl-compare-chart mc-radar-mount"></div>';
      } else {
        var barMetrics = metricRows.filter(function(row) {
          return row.valA != null && row.valB != null;
        }).slice(0, 5).map(function(row) {
          return {
            label: row.label,
            valA: row.valA,
            valB: row.valB,
            invert: row.invertA,
            ctx: row.ctx
          };
        });
        chartHtml = compareBarChartHtml(dataA, dataB, barMetrics);
      }

      out.innerHTML = '<div class="rl-compare-output">'
        + '<div class="rl-compare-identities">' + compareIdentityHtml(dataA) + compareIdentityHtml(dataB) + '</div>'
        + '<div class="rl-compare-metrics">' + compareMetricRowsHtml(metricRows) + '</div>'
        + chartHtml
        + compareInsightRailHtml(dataA, dataB, metricRows)
        + compareEdgeSummaryHtml(dataA, dataB, pair, metricRows)
        + compareProfileLinks(dataA, dataB, pair)
        + '</div>';

      if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(out);

      if (pair === 'lineup-lineup' && dataA.row && dataB.row) {
        if (global.STATE) global.STATE.compareTeams = [dataA.row.t, dataB.row.t];
        setTimeout(function() {
          var drawRadar = function() {
            if (!global.MLBMACharts) return;
            var rA = splitRowForTeam(dataA.row.t, 'r') || dataA.row;
            var lA = splitRowForTeam(dataA.row.t, 'l') || dataA.row;
            var rB = splitRowForTeam(dataB.row.t, 'r') || dataB.row;
            var lB = splitRowForTeam(dataB.row.t, 'l') || dataB.row;
            MLBMACharts.renderRadarChart('rlTeamRadar',
              MLBMACharts.teamRadarComparePayload(dataA.row, rA, lA),
              MLBMACharts.teamRadarComparePayload(dataB.row, rB, lB),
              dataA.row.t, dataB.row.t, { size: 340 });
          };
          if (global.MLBMACharts && MLBMACharts.renderOnLiveDataReady) {
            MLBMACharts.renderOnLiveDataReady(drawRadar, 'compare radar');
          } else {
            drawRadar();
          }
        }, 0);
      }
    });
  }

  function compareProfileLinks(dataA, dataB, pair) {
    var teamA = dataA.entity === 'lineup' || dataA.entity === 'bullpen' ? dataA.label : null;
    var teamB = dataB.entity === 'lineup' || dataB.entity === 'bullpen' ? dataB.label : null;
    var pitcherA = dataA.entity === 'pitcher' ? dataA.label : null;
    var pitcherB = dataB.entity === 'pitcher' ? dataB.label : null;
    if (pair === 'lineup-bullpen') {
      var bpTeam = dataA.entity === 'bullpen' ? dataA.label : dataB.label;
      var luTeam = dataA.entity === 'lineup' ? dataA.label : dataB.label;
      return '<p class="ca-helper rl-compare-links"><a href="team_profile.html?team=' + encodeURIComponent(luTeam) + '">' + esc(luTeam) + ' profile →</a> · '
        + '<a href="bullpen_report.html?team=' + encodeURIComponent(bpTeam) + '">' + esc(bpTeam) + ' bullpen →</a></p>';
    }
    if (pair === 'pitcher-pitcher') {
      return profileLinks(null, null, dataA.label, dataB.label);
    }
    return profileLinks(teamA, teamB, pitcherA, pitcherB);
  }

  function splitRowForTeam(t, split) {
    return getResearchTeamData(split === 'l' ? 'l' : 'r').find(function(d) { return d.t === t; });
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

  function fmt(v) { return v != null && !isNaN(v) ? Number(v).toFixed(1) : '—'; }

  function renderResearchHome() {
    var root = document.getElementById('rlResearchHomeRoot');
    if (!root) return;
    var cards = [
      { pane: 'splits-trends', title: 'Team Offense Research', use: 'OSI, ProjOSI, ABQ, RCV, OBR, PP-Gap, PALS, splits, trends', cta: 'Open Splits & Trends', icon: 'trending-up' },
      { pane: 'pitching', title: 'Pitcher Research', use: 'Pitching Score, OSI/ABQ/RCV/OBR Allowed, Pitcher OOR, L14 form, staleness', cta: 'Open Pitcher Lab', icon: 'target' },
      { pane: 'pitching-vs-lineup', title: 'Lineup vs Pitcher', use: 'Split lineup edge, starter vulnerability, F5/full-game context', cta: 'Open Lineup vs Pitcher', icon: 'swords' },
      { pane: 'compare', title: 'Compare', use: 'Lineup vs Lineup, Lineup vs SP, Lineup vs Bullpen, Pitcher vs Pitcher', cta: 'Open Compare', icon: 'swords' },
      { pane: 'leaderboards', title: 'Leaderboards', use: 'Sortable rankings, split boards, metrics allowed', cta: 'Open Leaderboards', icon: 'trophy' }
    ];
    root.innerHTML = '<div class="rl-home-header"><h2 class="rl-workspace-title">Research Home</h2>'
      + '<p class="rl-workspace-subtitle">Choose a research path — no giant tables on this screen.</p></div>'
      + '<div class="rl-home-grid">' + cards.map(function(c) {
        return '<button type="button" class="rl-home-card" data-rl-pane="' + c.pane + '">'
          + iconCircle(c.icon)
          + '<strong>' + esc(c.title) + '</strong>'
          + '<span class="rl-home-use">Use for: ' + esc(c.use) + '</span>'
          + '<em>' + esc(c.cta) + ' <i data-lucide="arrow-right" style="width:14px;height:14px" aria-hidden="true"></i></em></button>';
      }).join('') + '</div>';

    if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(root);

    root.querySelectorAll('[data-rl-pane]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pane = btn.getAttribute('data-rl-pane');
        if (typeof global.showResearchSubtab === 'function') global.showResearchSubtab(pane);
      });
    });
  }

  function profileLinks(teamA, teamB, pitcherA, pitcherB) {
    var p = [];
    if (teamA) p.push('<a href="team_profile.html?team=' + encodeURIComponent(teamA) + '">' + esc(teamA) + ' profile â†’</a>');
    if (teamB) p.push('<a href="team_profile.html?team=' + encodeURIComponent(teamB) + '">' + esc(teamB) + ' profile â†’</a>');
    if (pitcherA) p.push('<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(pitcherA) + '">' + esc(pitcherA) + ' â†’</a>');
    if (pitcherB) p.push('<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(pitcherB) + '">' + esc(pitcherB) + ' â†’</a>');
    return '<p class="ca-helper" style="margin-top:12px;">' + p.join(' \u00B7 ') + '</p>';
  }

  function renderPitchingVsLineup() {
    var root = document.getElementById('rlPvlRoot');
    if (!root) return;
    var teams = teamList();
    var pitchers = pitcherOptions();
    root.innerHTML = '<div class="rl-pane-card ca-card">'
      + '<div class="rl-pvl-grid">'
      + '<div><label class="ca-metric-label">Lineup Team</label><select id="rlPvlTeam" class="search-input" style="width:100%;margin-top:6px;">'
      + '<option value="">â€”</option>' + teams.map(function(t) {
        return '<option value="' + t + '"' + (t === RL.pvlTeam ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="ca-metric-label">Opposing SP</label><select id="rlPvlSp" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-4);color:var(--text);">'
      + '<option value="">â€”</option>' + pitchers.map(function(p) {
        return '<option value="' + esc(p.name) + '"' + (p.name === RL.pvlPitcher ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('') + '</select></div>'
      + '<div><label class="ca-metric-label">Opposing Bullpen</label><select id="rlPvlBp" style="width:100%;margin-top:6px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-4);color:var(--text);">'
      + '<option value="">â€”</option>' + teams.map(function(t) {
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
      + snap('Lineup Snapshot', RL.pvlTeam, 'OSI vs ' + hand + 'HP', splitRow ? splitRow.osi : team.osi, false, 'osi')
      + snap('SP Snapshot', RL.pvlPitcher || 'â€”', 'Pitching Score', ps, false, 'pitching')
      + snap('Bullpen Snapshot', RL.pvlBpTeam || 'â€”', 'Bullpen Score', bpScore, false, 'pitching')
      + '</div>'
      + '<div class="rl-edge-card ca-card" style="margin-top:14px;"><strong>Edge Read</strong> â€” '
      + (splitRow && sm.osiAllowed && splitRow.osi > 100 - sm.osiAllowed ? 'Lineup carries platoon split edge vs SP.' : 'Pitching profile suppresses lineup split.')
      + '</div>'
      + '<div class="rl-pane-card ca-card" style="margin-top:12px;"><div class="ca-metric-label">F5 vs Full Game</div>'
      + '<p style="font-size:13px;color:var(--text-2);margin:8px 0 0;">F5 lean tracks SP vs lineup split. Full game adds bullpen score '
      + (bpScore != null ? '(' + bpScore.toFixed(1) + ')' : '') + ' after starter.</p>'
      + '<a href="matchup_compare.html?away=' + encodeURIComponent(RL.pvlTeam) + '&home=' + encodeURIComponent(RL.pvlBpTeam || RL.pvlTeam) + '" class="ca-helper">Open full matchup compare â†’</a></div>';
  }

  function snap(title, name, metric, val, inv, ctx) {
    return '<div class="rl-pvl-snapshot ca-stat-card"><h4>' + esc(title) + '</h4><div style="font-weight:700;margin-bottom:6px;">' + esc(name) + '</div>'
      + '<div class="ca-stat-eyebrow">' + esc(metric) + '</div>'
      + '<div class="ca-stat-value">' + metricChip(val, ctx || 'osi', inv, 1) + '</div></div>';
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

  function onSubtab(name) {
    if (name === 'trends') {
      if (global.TrendsHeatmap && TrendsHeatmap.rerender) TrendsHeatmap.rerender();
    } else if (name === 'compare') {
      fetchSpProfiles().then(function() { renderComparePane(); });
    } else if (name === 'pitching') {
      var mountPl = function() {
        if (global.PitcherLab && PitcherLab.mount) {
          PitcherLab.mount('rlPitcherLabRoot');
        } else if (typeof hidePitchingResearchSections === 'function') {
          hidePitchingResearchSections();
          if (typeof global.renderPitchingScore === 'function') global.renderPitchingScore();
        }
      };
      mountPl();
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
      if (name === 'research-home' || name === 'lineup' || name === 'splits' || name === 'splits-trends') name = 'trends';
      if (name === 'pitcher') name = 'pitching';
      if (name === 'pitching-vs-lineup') name = 'compare';
      if (SUBTABS.indexOf(name) < 0) name = 'trends';
      if (typeof orig === 'function') orig(name);
      else {
        SUBTABS.forEach(function(id) {
          var el = document.getElementById('pane-' + id);
          if (!el) return;
          if (id === name) {
            el.style.cssText = 'display:block!important;visibility:visible!important;height:auto!important;overflow:visible!important;';
            el.hidden = false;
            el.removeAttribute('hidden');
          } else {
            el.style.cssText = 'display:none!important;';
            el.hidden = true;
          }
        });
        var layer = document.getElementById('layerAdvanced');
        if (layer) {
          layer.querySelectorAll('.subtab').forEach(function(btn) {
            var pane = btn.getAttribute('data-pane');
            if (pane === 'lineup' || pane === 'splits' || pane === 'splits-trends') pane = 'trends';
            if (pane === 'pitcher') pane = 'pitching';
            btn.classList.toggle('active', pane === name);
          });
        }
        var root = document.getElementById('section-research-lab');
        if (root) {
          root.querySelectorAll('.ca-lab__tab').forEach(function(tab) {
            var pane = tab.getAttribute('data-pane');
            if (pane === 'pitcher') pane = 'pitching';
            var active = pane === name;
            tab.classList.toggle('ca-lab__tab--active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
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
    fetchSpProfiles();
    fetchTeamProfiles();
    hideTeamOorSections();
  }

  global.ResearchLab = {
    init: init,
    onSubtab: onSubtab,
    mountGlobalControlBar: mountGlobalControlBar,
    renderTrendSummary: renderTrendSummary,
    renderComparePane: renderComparePane,
    renderSplitSummary: renderSplitSummary,
    metricCell: metricCell,
    getResearchTeamData: getResearchTeamData,
    getResearchPitcherData: getResearchPitcherData,
    getResearchBullpenData: getResearchBullpenData,
    syncResearchGlobalsFromLiveData: syncResearchGlobalsFromLiveData,
    fetchTeamProfiles: fetchTeamProfiles,
    resetResearchLabFilters: resetResearchLabFilters,
    initResearchLabWhenReady: initResearchLabWhenReady,
    renderResearchLabContent: renderResearchLabContent,
    refreshActiveRlTab: refreshActiveRlTab
  };

})(typeof window !== 'undefined' ? window : this);
