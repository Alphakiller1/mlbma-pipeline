/**
 * Research Lab UIX â€” compare in-pane, leaderboards, pitching vs lineup, model links.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;

  var RL = {
    compareSideA: { entity: 'lineup', split: 'b', key: '' },
    compareSideB: { entity: 'lineup', split: 'b', key: '' },
    spProfiles: null,
    pvlTeam: '',
    pvlPitcher: '',
    pvlBpTeam: '',
    splitEntity: 'team',
    splitMetric: 'osi',
    rlTrendMetric: 'osi',
    rlWindowCmp: 'L14'
  };

  var _rlReadyPoll = null;
  var _rlReadyTries = 0;

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
    if (split === 'r' || split === 'vs_rhp') return withProfileWindows(rhp || []);
    if (split === 'l' || split === 'vs_lhp') return withProfileWindows(lhp || []);
    return withProfileWindows(both || rhp || []);
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

  function numOrNull(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function profileWindowFieldsFromRow(row) {
    return {
      osi_ytd: numOrNull(S ? S.pickCol(row, 'osi_ytd', 'OSI_YTD', 'osi', 'OSI') : row.osi_ytd || row.osi),
      osi_l30: numOrNull(S ? S.pickCol(row, 'osi_l30', 'OSI_L30', 'l30_osi', 'L30_OSI') : row.osi_l30),
      osi_l14: numOrNull(S ? S.pickCol(row, 'osi_l14', 'OSI_L14', 'l14_osi', 'L14_OSI') : row.osi_l14),
      osi_l7: numOrNull(S ? S.pickCol(row, 'osi_l7', 'OSI_L7', 'l7_osi', 'L7_OSI') : row.osi_l7)
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

  function buildWindowScoresFromProfiles() {
    if (typeof global.syncWindowScoresFromProfiles === 'function') {
      global.syncWindowScoresFromProfiles();
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
    console.log('[TRENDS] built L30:', global.SCO_L30_B.length, 'L14:', global.SCO_L14_B.length, 'L7:', global.SCO_L7_B.length);
    console.log('[TRENDS] SCO_L30_B built:', global.SCO_L30_B.length, 'teams');
    console.log('[TRENDS] SCO_L14_B built:', global.SCO_L14_B.length, 'teams');
    console.log('[TRENDS] SCO_L7_B built:', global.SCO_L7_B.length, 'teams');
  }

  function syncResearchGlobalsFromLiveData() {
    var synced = false;
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
      synced = true;
    } else if (global.SCO_YTD_R && global.SCO_YTD_R.length >= 10 && global.SCO_YTD_L && global.SCO_YTD_L.length >= 10) {
      if ((!global.SCO_YTD_B || global.SCO_YTD_B.length < 10) && typeof global.buildYtdBothFromSplits === 'function') {
        global.SCO_YTD_B = global.buildYtdBothFromSplits(global.SCO_YTD_R, global.SCO_YTD_L);
        if (typeof global.enrichYtdMaster === 'function') global.enrichYtdMaster();
      }
      synced = !!(global.SCO_YTD_B && global.SCO_YTD_B.length >= 10);
    }
    if (global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam && Object.keys(LIVE_DATA.teamProfilesByTeam).length) {
      buildWindowScoresFromProfiles();
    }
    console.log('[TRENDS] L30 data available:', global.SCO_L30_B ? global.SCO_L30_B.length : 'missing');
    console.log('[TRENDS] L14 data available:', global.SCO_L14_B ? global.SCO_L14_B.length : 'missing');
    console.log('[TRENDS] L7 data available:', global.SCO_L7_B ? global.SCO_L7_B.length : 'missing');
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
        console.log('[RL] Data ready, rendering Research Lab with', data.length, 'teams');
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
        console.log('[RL] Waiting for data...');
        _rlReadyPoll = setTimeout(tick, 300);
      }
    }
    if (_rlReadyPoll) clearTimeout(_rlReadyPoll);
    fetchTeamProfiles();
    tick();
  }

  var SUBTABS = ['trends', 'splits', 'compare', 'pitching'];

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
    console.log('[TRENDS] fetching Team_Profiles tab key:', TABS.team_profiles);
    return S.fetchSheetTab(TABS.team_profiles).then(function(rows) {
      if (!global.LIVE_DATA) global.LIVE_DATA = {};
      LIVE_DATA.teamProfiles = rows || [];
      console.log('[TRENDS] Team_Profiles fetch result:', LIVE_DATA.teamProfiles ? LIVE_DATA.teamProfiles.length : 'null or undefined');
      if (LIVE_DATA.teamProfiles && LIVE_DATA.teamProfiles.length) {
        console.log('[TRENDS] teamProfiles first row keys:', Object.keys(LIVE_DATA.teamProfiles[0]));
        console.log('[TRENDS] teamProfiles first row:', JSON.stringify(LIVE_DATA.teamProfiles[0]));
      }
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
      + '<p class="rl-workspace-subtitle">Four focused tools â€” trends, splits, compare, and pitcher research.</p>'
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
      if (typeof global.renderSplitBars === 'function') global.renderSplitBars();
      renderSplitsTable();
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
    var splitLabel = { b: 'Both', r: 'vs RHP', l: 'vs LHP', home: 'Home', away: 'Away' }[st.split] || 'Both';
    el.innerHTML = '<div class="rl-global-bar-inner">'
      + '<span class="rl-global-bar-title">Research Lab Â· <strong>' + esc(tabLabel) + '</strong> Â· '
      + esc(splitLabel) + ' Â· ' + esc(st.time) + '</span>'
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
        refreshActiveRlTab();
      });
    });
    el.querySelectorAll('[data-rl-window]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        st.time = btn.getAttribute('data-rl-window');
        refreshActiveRlTab();
      });
    });
  }

  function mountTrendControls() {
    var ext = global.ResearchLab && ResearchLab.mountTrendControls;
    if (ext && ext !== mountTrendControls) return ext();
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
        + (items.length ? items.map(fmtFn).join('<br>') : 'â€”') + '</div></div>';
    }
    mount.innerHTML = card('Biggest risers', risers, function(d) { return d.t + ' +' + (d[cmpKey] || 0).toFixed(1); })
      + card('Biggest fallers', fallers, function(d) { return d.t + ' ' + (d[cmpKey] || 0).toFixed(1); })
      + card('Most volatile', volatile, function(d) { return d.t + ' L7 Î” ' + Math.abs((d.l7OSI || 0) - (d.ytdOSI || d.osi || 0)).toFixed(1); })
      + card('Most stable', stable, function(d) { return d.t + ' Â· ' + (d.trend || 'Stable'); });
  }

  function mountSplitsEntityControls() {
    var mount = document.getElementById('rlSplitsControlMount');
    if (!mount) return;
    var entity = RL.splitEntity || 'team';
    var metric = RL.splitMetric || 'osi';
    mount.innerHTML = '<div class="rl-splits-controls ca-pill-bar" style="margin-bottom:14px">'
      + '<span class="ca-pill-label">Entity</span>'
      + [{ id: 'team', label: 'Team Offense' }, { id: 'sp', label: 'Starting Pitcher' }, { id: 'bp', label: 'Bullpen' }].map(function(e) {
        return '<button type="button" class="ca-pill-btn' + (entity === e.id ? ' active' : '') + '" data-split-entity="' + e.id + '">' + e.label + '</button>';
      }).join('')
      + '<span class="ca-pill-label">Metric</span>'
      + ['osi', 'abq', 'rcv', 'obr'].map(function(m) {
        return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-split-metric="' + m + '">' + m.toUpperCase() + '</button>';
      }).join('')
      + '</div>';
    mount.querySelectorAll('[data-split-entity]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        RL.splitEntity = btn.getAttribute('data-split-entity');
        mountSplitsEntityControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-split-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        RL.splitMetric = btn.getAttribute('data-split-metric');
        mountSplitsEntityControls();
        renderSplitsTable();
      });
    });
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) return;
    syncResearchGlobalsFromLiveData();
    var entity = RL.splitEntity || 'team';
    var metric = RL.splitMetric || 'osi';
    var r = getResearchTeamData('r');
    var l = getResearchTeamData('l');
    if (entity === 'team') {
      var rows = r.map(function(row) {
        var lrow = l.find(function(x) { return x.t === row.t; }) || {};
        var edge = (row[metric] || 0) - (lrow[metric] || 0);
        return { t: row.t, r: row[metric], l: lrow[metric], edge: edge };
      }).sort(function(a, b) { return Math.abs(b.edge) - Math.abs(a.edge); });
      mount.innerHTML = '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr>'
        + '<th></th><th>Team</th><th>vs RHP</th><th>vs LHP</th><th>Split Edge</th><th>Home</th><th>Away</th><th>F5</th></tr></thead><tbody>'
        + rows.map(function(row) {
          var gold = Math.abs(row.edge) >= 8 ? ' rl-split-gold' : '';
          var logo = A ? A.teamLogoImg(row.t, 24) : '';
          return '<tr class="hub-row' + gold + '" onclick="location.href=\'team_profile.html?team=' + encodeURIComponent(row.t) + '\'">'
            + '<td>' + logo + '</td><td>' + esc(row.t) + '</td>'
            + '<td style="color:' + mColor(row.r, false, metric) + '">' + fmt(row.r) + '</td>'
            + '<td style="color:' + mColor(row.l, false, metric) + '">' + fmt(row.l) + '</td>'
            + '<td style="color:' + mColor(row.edge, false, 'ppGap') + ';font-weight:700">' + fmt(row.edge) + '</td>'
            + '<td title="requires pipeline run">â€”</td><td title="requires pipeline run">â€”</td><td title="requires pipeline run">â€”</td></tr>';
        }).join('') + '</tbody></table></div>';
      return;
    }
    if (entity === 'sp') {
      fetchSpProfiles().then(function() {
        var rows = (RL.spProfiles || []).slice();
        mount.innerHTML = '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr>'
          + '<th>Pitcher</th><th>Team</th><th>Hand</th><th>vs LHH</th><th>vs RHH</th><th>Split Edge</th><th>Home</th><th>Away</th></tr></thead><tbody>'
          + rows.slice(0, 80).map(function(row) {
            var n = S.pickCol(row, 'pitcher_name', 'Name');
            var t = S.pickCol(row, 'pitcher_team', 'Team');
            var hand = S.pickCol(row, 'hand', 'Hand') || 'R';
            var m = S.spProfileMetrics(row);
            var lhh = m.osiAllowedLhh != null ? m.osiAllowedLhh : m.osiAllowed;
            var rhh = m.osiAllowedRhh != null ? m.osiAllowedRhh : m.osiAllowed;
            var edge = (lhh != null && rhh != null) ? rhh - lhh : null;
            return '<tr onclick="location.href=\'pitcher_profile.html?pitcher=' + encodeURIComponent(n) + '\'">'
              + '<td>' + esc(n) + '</td><td>' + esc(t) + '</td><td>' + esc(hand) + '</td>'
              + '<td style="color:' + mColor(lhh, true) + '">' + fmt(lhh) + '</td>'
              + '<td style="color:' + mColor(rhh, true) + '">' + fmt(rhh) + '</td>'
              + '<td style="color:' + mColor(edge, false, 'ppGap') + '">' + fmt(edge) + '</td>'
              + '<td title="requires pipeline run">â€”</td><td title="requires pipeline run">â€”</td></tr>';
          }).join('') + '</tbody></table></div>';
      });
      return;
    }
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var bpRows = Object.keys(units).map(function(tk) {
      var u = units[tk];
      return { t: tk, osi: u.osiAllowed, abq: u.abqAllowed, score: S.bullpenPitchScore ? S.bullpenPitchScore(u) : u.bullpenScore };
    }).sort(function(a, b) { return (a.osi || 0) - (b.osi || 0); });
    mount.innerHTML = '<div class="rl-table-wrap"><table class="rl-table-premium"><thead><tr>'
      + '<th>Team</th><th>OSI Allowed</th><th>ABQ Allowed</th><th>Bullpen Score</th></tr></thead><tbody>'
      + bpRows.map(function(row) {
        return '<tr onclick="location.href=\'bullpen_report.html?team=' + encodeURIComponent(row.t) + '\'">'
          + '<td>' + (A ? A.teamLogoImg(row.t, 24) : '') + ' ' + esc(row.t) + '</td>'
          + '<td style="color:' + mColor(row.osi, true) + '">' + fmt(row.osi) + '</td>'
          + '<td style="color:' + mColor(row.abq, true) + '">' + fmt(row.abq) + '</td>'
          + '<td style="color:' + mColor(row.score, false, 'pitching') + '">' + fmt(row.score) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
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
    return { entity: 'lineup', split: 'b', key: '' };
  }

  function ensureCompareSides() {
    if (!RL.compareSideA) RL.compareSideA = defaultCompareSide();
    if (!RL.compareSideB) RL.compareSideB = defaultCompareSide();
  }

  function compareSideRef(sideKey) {
    return sideKey === 'B' ? RL.compareSideB : RL.compareSideA;
  }

  function deriveComparePair(sideA, sideB) {
    var ea = sideA.entity;
    var eb = sideB.entity;
    if (ea === 'lineup' && eb === 'lineup') return 'lineup-lineup';
    if (ea === 'pitcher' && eb === 'pitcher') return 'pitcher-pitcher';
    if (ea === 'bullpen' && eb === 'bullpen') return 'bullpen-bullpen';
    if ((ea === 'lineup' && eb === 'pitcher') || (ea === 'pitcher' && eb === 'lineup')) return 'lineup-pitcher';
    if ((ea === 'bullpen' && eb === 'lineup') || (ea === 'lineup' && eb === 'bullpen')) return 'bullpen-lineup';
    if ((ea === 'bullpen' && eb === 'pitcher') || (ea === 'pitcher' && eb === 'bullpen')) return 'pitcher-bullpen';
    return 'mixed';
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

  function splitLabelForCompare(split) {
    return { b: 'Both', r: 'vs RHP', l: 'vs LHP', home: 'Home', away: 'Away', f5: 'F5' }[split] || 'Both';
  }

  function renderComparePaneInner(root) {
    ensureCompareSides();
    syncResearchGlobalsFromLiveData();
    var teams = (global.SCO_YTD_B || []).map(function(r) { return r.t; }).filter(Boolean).sort();
    if (!teams.length) teams = teamList();

    root.innerHTML = '<div class="rl-compare-h2h">'
      + '<div class="rl-compare-h2h-header">'
      + '<h3 class="rl-compare-h2h-title">Head-to-Head Intelligence</h3>'
      + '<p class="rl-compare-h2h-subtitle">Select any two entities. Compare the data. Find the edge.</p>'
      + '</div>'
      + '<div class="rl-compare-panels">'
      + renderCompareSidePanelHtml('SIDE A', 'A', RL.compareSideA, teams)
      + renderCompareSidePanelHtml('SIDE B', 'B', RL.compareSideB, teams)
      + '</div>'
      + '<div class="rl-compare-run-wrap">'
      + '<button type="button" class="rl-compare-run" id="rlCmpRun">Compare</button>'
      + '</div>'
      + '<div id="rlCompareOutput"></div>'
      + '</div>';

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

  function renderCompareSidePanelHtml(label, sideKey, side, teams) {
    var entities = [
      { id: 'lineup', lbl: 'Lineup' },
      { id: 'pitcher', lbl: 'Pitcher' },
      { id: 'bullpen', lbl: 'Bullpen' }
    ];
    var splits = ['b', 'r', 'l', 'home', 'away', 'f5'];
    var selectorHtml = '';
    if (side.entity === 'pitcher') {
      selectorHtml = pitcherSearchHtml('rlCmp' + sideKey + 'Key', 'Select pitcher', side.key);
    } else {
      selectorHtml = teamSelectHtml('rlCmp' + sideKey + 'Key', side.entity === 'bullpen' ? 'Select bullpen team' : 'Select team', teams, side.key);
    }
    return '<div class="rl-compare-panel" data-side="' + sideKey + '">'
      + '<div class="rl-compare-panel-label">' + esc(label) + '</div>'
      + '<div class="rl-compare-pill-row ca-pill-bar">'
      + entities.map(function(e) {
        return '<button type="button" class="ca-pill-btn' + (side.entity === e.id ? ' active' : '') + '" data-cmp-entity="' + e.id + '" data-side="' + sideKey + '">' + e.lbl + '</button>';
      }).join('')
      + '</div>'
      + '<div class="rl-compare-pill-row ca-pill-bar rl-compare-split-row">'
      + splits.map(function(sp) {
        return '<button type="button" class="ca-pill-btn' + (side.split === sp ? ' active' : '') + '" data-cmp-split="' + sp + '" data-side="' + sideKey + '">' + splitLabelForCompare(sp) + '</button>';
      }).join('')
      + '</div>'
      + '<div class="rl-compare-panel-select">' + selectorHtml + '</div>'
      + '<button type="button" class="rl-compare-clear" data-cmp-clear="' + sideKey + '">Clear</button>'
      + '</div>';
  }

  function bindCompareSidePanel(sideKey, teams) {
    var side = compareSideRef(sideKey);
    document.querySelectorAll('[data-cmp-entity][data-side="' + sideKey + '"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        side.entity = btn.getAttribute('data-cmp-entity');
        side.key = '';
        rerenderComparePanels(teams);
      });
    });
    document.querySelectorAll('[data-cmp-split][data-side="' + sideKey + '"]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        side.split = btn.getAttribute('data-cmp-split');
        rerenderComparePanels(teams);
      });
    });
    var sel = document.getElementById('rlCmp' + sideKey + 'Key');
    if (sel && sel.tagName === 'SELECT') {
      sel.addEventListener('change', function() { side.key = sel.value; });
    }
    if (side.entity === 'pitcher') {
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
  }

  function teamSelectHtml(id, label, teams, val) {
    return '<div><label for="' + id + '">' + label + '</label>'
      + '<select id="' + id + '" class="rl-compare-select search-input" style="width:100%;margin-top:6px;">'
      + '<option value="">Select teamâ€¦</option>'
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
      + '<input type="search" id="' + id + '" class="search-input" style="width:100%;" value="' + esc(val || '') + '" placeholder="Search pitcher name or teamâ€¦" autocomplete="off">'
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
      + '<div class="rl-metric-primary" style="color:' + mColor(val, invert) + '">' + (val != null ? Number(val).toFixed(1) : '—') + '</div></div></div>';
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
      + '<div class="ca-helper">Bullpen Score <strong style="color:' + mColor(score, false, 'pitching') + '">' + fmt(score) + '</strong>'
      + ' · OSI Allowed <strong style="color:' + mColor(unit && unit.osiAllowed, true) + '">' + fmt(unit && unit.osiAllowed) + '</strong></div></div></div>';
  }

  function teamIdentityCard(row, splitNote) {
    if (!row) return '';
    var logo = A ? A.teamLogoImg(row.t, 40) : '';
    var tier = row.osi >= 75 ? 'Elite' : row.osi >= 60 ? 'Solid' : row.osi >= 45 ? 'Avg' : 'Weak';
    var tierCls = row.osi >= 75 ? 'tier-elite' : row.osi >= 60 ? 'tier-solid' : 'tier-mid';
    var splitTag = splitNote ? ' <span class="rl-compare-split-tag">' + esc(splitNote) + '</span>' : '';
    return '<div class="rl-compare-identity">' + logo
      + '<div><div style="font-weight:700;font-size:16px;">' + esc(row.t) + splitTag + '</div>'
      + '<div class="ca-helper">OSI <strong style="color:' + mColor(row.osi, false) + '">' + fmt(row.osi) + '</strong>'
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
    if (pair === 'lineup-lineup' || pair === 'pitcher-pitcher' || pair === 'bullpen-bullpen') {
      return dataA.metrics.map(function(spec) {
        return {
          label: spec[1],
          valA: metricValFromSide(dataA, spec),
          valB: metricValFromSide(dataB, spec),
          higherBetter: spec[2] !== false,
          invertA: !!spec[3],
          invertB: !!spec[3],
          ctx: spec[4] || (spec[0] === 'ppGap' ? 'ppGap' : (spec[3] ? 'osi' : 'osi'))
        };
      });
    }
    if (pair === 'lineup-pitcher') {
      var lineup = dataA.entity === 'lineup' ? dataA : dataB;
      var pitcher = dataA.entity === 'pitcher' ? dataA : dataB;
      var allow = pitcher.splitOsiAllowed != null ? pitcher.splitOsiAllowed : pitcher.metricsObj.osiAllowed;
      var aFirst = dataA.entity === 'lineup';
      return [
        { label: 'OSI vs Allowed', valA: aFirst ? lineup.primary : allow, valB: aFirst ? allow : lineup.primary, higherBetter: true, invertA: !aFirst, invertB: aFirst, ctx: 'osi' },
        { label: 'ABQ vs ABQ Allowed', valA: aFirst ? lineup.row.abq : pitcher.metricsObj.abqAllowed, valB: aFirst ? pitcher.metricsObj.abqAllowed : lineup.row.abq, higherBetter: true, invertA: !aFirst, invertB: aFirst, ctx: 'osi' },
        { label: 'RCV vs RCV Allowed', valA: aFirst ? lineup.row.rcv : pitcher.metricsObj.rcvAllowed, valB: aFirst ? pitcher.metricsObj.rcvAllowed : lineup.row.rcv, higherBetter: true, invertA: !aFirst, invertB: aFirst, ctx: 'osi' }
      ];
    }
    if (pair === 'bullpen-lineup') {
      var bp = dataA.entity === 'bullpen' ? dataA : dataB;
      var lu = dataA.entity === 'lineup' ? dataA : dataB;
      var aFirstBp = dataA.entity === 'bullpen';
      return [
        { label: 'Lineup OSI vs BP Allowed', valA: aFirstBp ? bp.row.osiAllowed : lu.primary, valB: aFirstBp ? lu.primary : bp.row.osiAllowed, higherBetter: true, invertA: aFirstBp, invertB: !aFirstBp, ctx: 'osi' },
        { label: 'ABQ vs ABQ Allowed', valA: aFirstBp ? bp.row.abqAllowed : lu.row.abq, valB: aFirstBp ? lu.row.abq : bp.row.abqAllowed, higherBetter: true, invertA: aFirstBp, invertB: !aFirstBp, ctx: 'osi' }
      ];
    }
    if (pair === 'pitcher-bullpen') {
      return [
        { label: 'Pitching Score', valA: dataA.primary, valB: dataB.primary, higherBetter: true, invertA: false, invertB: false, ctx: 'pitching' },
        { label: 'OSI Allowed', valA: dataA.splitOsiAllowed || (dataA.metricsObj && dataA.metricsObj.osiAllowed) || (dataA.row && dataA.row.osiAllowed), valB: dataB.splitOsiAllowed || (dataB.metricsObj && dataB.metricsObj.osiAllowed) || (dataB.row && dataB.row.osiAllowed), higherBetter: false, invertA: true, invertB: true, ctx: 'osi' }
      ];
    }
    return [
      { label: dataA.primaryLabel, valA: dataA.primary, valB: dataB.primary, higherBetter: true, invertA: !!dataA.primaryInvert, invertB: !!dataB.primaryInvert, ctx: 'osi' }
    ];
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
        + '<span class="rl-compare-metric-val rl-compare-metric-val--a' + (winner === 'a' ? ' rl-compare-metric-val--win' : '') + '" style="color:' + mColor(va, row.invertA, row.ctx) + '">' + fmt(va) + '</span>'
        + '<span class="rl-compare-metric-label">' + esc(row.label) + '</span>'
        + '<span class="rl-compare-metric-val rl-compare-metric-val--b' + (winner === 'b' ? ' rl-compare-metric-val--win' : '') + '" style="color:' + mColor(vb, row.invertB, row.ctx) + '">' + fmt(vb) + '</span>'
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
    if (pair === 'lineup-pitcher' && pa != null && pb != null) {
      var lineupSide = dataA.entity === 'lineup' ? dataA : dataB;
      var pitchSide = dataA.entity === 'pitcher' ? dataA : dataB;
      var lo = lineupSide.primary;
      var po = pitchSide.metricsObj && pitchSide.metricsObj.osiAllowed;
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

  function renderCompareOutput() {
    ensureCompareSides();
    bindCompareDropdownClose();
    var out = document.getElementById('rlCompareOutput');
    if (!out) return;
    if (!RL.compareSideA.key || !RL.compareSideB.key) {
      out.innerHTML = '<div class="rl-pane-card"><p class="rl-empty">Select entities on both sides and click Compare to generate output.</p></div>';
      return;
    }
    out.innerHTML = '<div class="rl-loading">Computing comparison…</div>';
    setTimeout(function() {
      var sideA = RL.compareSideA;
      var sideB = RL.compareSideB;
      var pair = deriveComparePair(sideA, sideB);
      var dataA = getSideCompareData(sideA);
      var dataB = getSideCompareData(sideB);
      if (!dataA || !dataB) {
        out.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Data not available for one or both selections.</p></div>';
        return;
      }

      var metricRows = buildCompareMetricRows(dataA, dataB, pair);

      var chartHtml = '';
      if (pair === 'lineup-lineup') {
        chartHtml = '<div id="rlTeamRadar" class="rl-compare-chart mc-radar-mount"></div>';
      } else {
        var barMetrics = metricRows.slice(0, 5).map(function(row) {
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
        + '<div class="rl-compare-identities">' + dataA.identityHtml + dataB.identityHtml + '</div>'
        + '<div class="rl-compare-metrics">' + compareMetricRowsHtml(metricRows) + '</div>'
        + chartHtml
        + compareEdgeSummaryHtml(dataA, dataB, pair, metricRows)
        + compareProfileLinks(dataA, dataB, pair)
        + '</div>';

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
    }, 50);
  }

  function compareProfileLinks(dataA, dataB, pair) {
    var teamA = dataA.entity === 'lineup' || dataA.entity === 'bullpen' ? dataA.label : null;
    var teamB = dataB.entity === 'lineup' || dataB.entity === 'bullpen' ? dataB.label : null;
    var pitcherA = dataA.entity === 'pitcher' ? dataA.label : null;
    var pitcherB = dataB.entity === 'pitcher' ? dataB.label : null;
    if (pair === 'bullpen-bullpen') {
      return '<p class="ca-helper rl-compare-links"><a href="bullpen_report.html?team=' + encodeURIComponent(dataA.label) + '">' + esc(dataA.label) + ' report →</a> · '
        + '<a href="bullpen_report.html?team=' + encodeURIComponent(dataB.label) + '">' + esc(dataB.label) + ' report →</a></p>';
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
      { pane: 'splits-trends', title: 'Team Offense Research', use: 'OSI, ProjOSI, ABQ, RCV, OBR, PP-Gap, PALS, splits, trends', cta: 'Open Splits & Trends', icon: 'â—†' },
      { pane: 'pitching', title: 'Pitcher Research', use: 'Pitching Score, OSI/ABQ/RCV/OBR Allowed, Pitcher OOR, L14 form, staleness', cta: 'Open Pitcher Lab', icon: 'â—Ž' },
      { pane: 'pitching-vs-lineup', title: 'Lineup vs Pitcher', use: 'Split lineup edge, starter vulnerability, F5/full-game context', cta: 'Open Lineup vs Pitcher', icon: 'âš¡' },
      { pane: 'compare', title: 'Compare', use: 'Team vs team, pitcher vs pitcher, bullpen vs bullpen, lineup vs pitcher', cta: 'Open Compare', icon: 'â‡„' },
      { pane: 'leaderboards', title: 'Leaderboards', use: 'Sortable rankings, split boards, metrics allowed', cta: 'Open Leaderboards', icon: 'â–¤' }
    ];
    root.innerHTML = '<div class="rl-home-header"><h2 class="rl-workspace-title">Research Home</h2>'
      + '<p class="rl-workspace-subtitle">Choose a research path â€” no giant tables on this screen.</p></div>'
      + '<div class="rl-home-grid">' + cards.map(function(c) {
        return '<button type="button" class="rl-home-card" data-rl-pane="' + c.pane + '">'
          + '<span class="rl-home-icon">' + c.icon + '</span>'
          + '<strong>' + esc(c.title) + '</strong>'
          + '<span class="rl-home-use">Use for: ' + esc(c.use) + '</span>'
          + '<em>' + esc(c.cta) + ' â†’</em></button>';
      }).join('') + '</div>';

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
    return '<p class="ca-helper" style="margin-top:12px;">' + p.join(' Â· ') + '</p>';
  }

  function renderPitchingVsLineup() {
    var root = document.getElementById('rlPvlRoot');
    if (!root) return;
    var teams = teamList();
    var pitchers = pitcherOptions();
    root.innerHTML = '<div class="rl-pane-card">'
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
      + snap('Lineup Snapshot', RL.pvlTeam, 'OSI vs ' + hand + 'HP', splitRow ? splitRow.osi : team.osi, false)
      + snap('SP Snapshot', RL.pvlPitcher || 'â€”', 'Pitching Score', ps, false)
      + snap('Bullpen Snapshot', RL.pvlBpTeam || 'â€”', 'Bullpen Score', bpScore, false)
      + '</div>'
      + '<div class="rl-edge-card" style="margin-top:14px;"><strong>Edge Read</strong> â€” '
      + (splitRow && sm.osiAllowed && splitRow.osi > 100 - sm.osiAllowed ? 'Lineup carries platoon split edge vs SP.' : 'Pitching profile suppresses lineup split.')
      + '</div>'
      + '<div class="rl-pane-card" style="margin-top:12px;"><div class="ca-metric-label">F5 vs Full Game</div>'
      + '<p style="font-size:13px;color:var(--text-2);margin:8px 0 0;">F5 lean tracks SP vs lineup split. Full game adds bullpen score '
      + (bpScore != null ? '(' + bpScore.toFixed(1) + ')' : '') + ' after starter.</p>'
      + '<a href="matchup_compare.html?away=' + encodeURIComponent(RL.pvlTeam) + '&home=' + encodeURIComponent(RL.pvlBpTeam || RL.pvlTeam) + '" class="ca-helper">Open full matchup compare â†’</a></div>';
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
    mountSplitsEntityControls();
  }

  function onSubtab(name) {
    if (name === 'compare') {
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
    fetchSpProfiles();
    fetchTeamProfiles();
    hideTeamOorSections();
  }

  global.ResearchLab = {
    init: init,
    initSplitsControls: initSplitsControls,
    onSubtab: onSubtab,
    mountGlobalControlBar: mountGlobalControlBar,
    mountTrendControls: mountTrendControls,
    renderTrendSummary: renderTrendSummary,
    renderSplitsTable: renderSplitsTable,
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
    renderResearchLabContent: renderResearchLabContent
  };

})(typeof window !== 'undefined' ? window : this);
