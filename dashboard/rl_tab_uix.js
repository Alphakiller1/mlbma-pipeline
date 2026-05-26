// rl_tab_uix.js — Research Lab Trends & Splits (single source of truth)
'use strict';

var SPLITS_STATE = {
  section: 'lineup',
  lineupMetric: 'osi',
  lineupSplit: 'r',
  pitchEntity: 'sp',
  pitchStatGroup: 'standard',
  window: 'ytd',
  search: '',
  sortKey: 'osi',
  sortDir: 'desc'
};

var TRENDS_STATE = {
  metric: 'osi',
  location: 'b'
};

/** Bump when trends markup/behavior changes (forces control strip rebuild). */
var TRENDS_UI_VERSION = '20260529a';

window.SPLITS_STATE = SPLITS_STATE;
window.TRENDS_STATE = TRENDS_STATE;

(function(global) {
  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var RL = global.ResearchLab;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v, d) {
    if (v == null || v === '' || isNaN(v)) return '\u2014';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function liveData() {
    return global.LIVE_DATA || {};
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function showRlResearchPane(activeId) {
    var paneId = activeId === 'pitcher' ? 'pitching' : activeId;
    ['trends', 'splits', 'compare', 'pitching'].forEach(function(id) {
      var el = document.getElementById('pane-' + id);
      if (!el) return;
      if (id === paneId) {
        el.style.cssText = 'display:block!important;visibility:visible!important;height:auto!important;overflow:visible!important;';
        el.hidden = false;
        el.removeAttribute('hidden');
      } else {
        el.style.cssText = 'display:none!important;';
        el.hidden = true;
      }
    });
  }

  function getSplitsTeamScores() {
    var LD = liveData();
    return {
      rhp: LD.scYtdR || global.SCO_YTD_R || [],
      lhp: LD.scYtdL || global.SCO_YTD_L || []
    };
  }

  function buildBlendedRows(rRows, lRows) {
    rRows = rRows || [];
    lRows = lRows || [];
    var lMap = {};
    lRows.forEach(function(row) { lMap[row.t] = row; });
    return rRows.map(function(row) {
      var lRow = lMap[row.t] || row;
      return {
        t: row.t,
        osi: ((num(row.osi) || 0) + (num(lRow.osi) || num(row.osi) || 0)) / 2,
        abq: ((num(row.abq) || 0) + (num(lRow.abq) || num(row.abq) || 0)) / 2,
        rcv: ((num(row.rcv) || 0) + (num(lRow.rcv) || num(row.rcv) || 0)) / 2,
        obr: ((num(row.obr) || 0) + (num(lRow.obr) || num(row.obr) || 0)) / 2,
        woba: row.woba != null ? row.woba : row.wOBA,
        xwoba: row.xwoba,
        wrc: row.wrc,
        slg: row.slg,
        obp: row.obp,
        iso: row.iso
      };
    });
  }

  function getBlendedRows() {
    var scores = getSplitsTeamScores();
    return buildBlendedRows(scores.rhp, scores.lhp);
  }

  function getHandRows(hand) {
    var scores = getSplitsTeamScores();
    if (hand === 'r') return scores.rhp.slice();
    if (hand === 'l') return scores.lhp.length ? scores.lhp.slice() : scores.rhp.slice();
    return getBlendedRows();
  }

  function aggregateByTeam(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var team = row.team || row.Team || row.Tm || row.team_abbr || row.t;
      if (!team) return;
      team = String(team).trim().toUpperCase();
      if (!map[team]) map[team] = { t: team, osiSum: 0, abqSum: 0, rcvSum: 0, obrSum: 0, wrcSum: 0, wobaSum: 0, isoSum: 0, paSum: 0, count: 0, paCount: 0 };
      var d = map[team];
      var osi = parseFloat(row.osi || row.OSI);
      var abq = parseFloat(row.abq || row.ABQ);
      var rcv = parseFloat(row.rcv || row.RCV);
      var obr = parseFloat(row.obr || row.OBR);
      var wrc = parseFloat(row["wRC+"] || row.wrc || 0);
      var woba = parseFloat(row.wOBA || row.woba || 0);
      var iso = parseFloat(row.ISO || row.iso || 0);
      var pa = parseFloat(row.PA || row.pa || 1);
      if (!isNaN(wrc) && pa > 0) { d.wrcSum += wrc * pa; d.wobaSum += woba * pa; d.isoSum += iso * pa; d.paSum += pa; d.paCount++; }
      if (!isNaN(osi) && osi > 0) { d.osiSum += osi; d.abqSum += abq || 0; d.rcvSum += rcv || 0; d.obrSum += obr || 0; d.count++; }
    });
    return Object.keys(map).sort().map(function(t) {
      var d = map[t];
      var osi, abq, rcv, obr;
      if (d.count > 0) { osi = d.osiSum/d.count; abq = d.abqSum/d.count; rcv = d.rcvSum/d.count; obr = d.obrSum/d.count; }
      else if (d.paCount > 0) { var wa = d.wrcSum/d.paSum; osi = Math.min(100,Math.max(0,(wa/100)*50)); abq = Math.min(100,Math.max(0,(d.wobaSum/d.paSum/0.32)*50)); rcv = Math.min(100,Math.max(0,(d.isoSum/d.paSum/0.16)*50)); obr = osi; }
      else return null;
      return { t: d.t, osi: osi, abq: abq, rcv: rcv, obr: obr };
    }).filter(Boolean);
  }

  function normalizeTrendProfile(row) {
    if (!row) return {};
    if (typeof global.profileWindowFieldsFromRow === 'function' && (row.team || row.Team || row.Tm || row.osi != null || row.osi_l30 != null)) {
      return global.profileWindowFieldsFromRow(row);
    }
    return {
      osi_ytd: pickProfField(row, ['osi_ytd', 'OSI_YTD', 'osi', 'OSI']),
      osi_l30: pickProfField(row, ['osi_l30', 'OSI_L30', 'l30_osi', 'L30_OSI']),
      osi_l14: pickProfField(row, ['osi_l14', 'OSI_L14', 'l14_osi', 'L14_OSI']),
      osi_l7: pickProfField(row, ['osi_l7', 'OSI_L7', 'l7_osi', 'L7_OSI']),
      abq: pickProfField(row, ['abq', 'ABQ']),
      rcv: pickProfField(row, ['rcv', 'RCV']),
      obr: pickProfField(row, ['obr', 'OBR']),
      pals: pickProfField(row, ['pals', 'PALS']),
      home_osi: pickProfField(row, ['home_osi', 'Home_OSI']),
      away_osi: pickProfField(row, ['away_osi', 'Away_OSI'])
    };
  }

  function profileMapFromTeamProfiles() {
    var LD = liveData();
    var map = {};
    (LD.teamProfiles || []).forEach(function(p) {
      var t = String(p.team || p.Team || p.Tm || '').trim().toUpperCase();
      if (t) map[t] = normalizeTrendProfile(p);
    });
    if (Object.keys(map).length) return map;
    var cached = LD.teamProfilesByTeam || {};
    Object.keys(cached).forEach(function(t) {
      map[t] = normalizeTrendProfile(cached[t]);
    });
    return map;
  }

  function pickProfField(prof, candidates) {
    if (!prof) return null;
    if (typeof global.pickCol === 'function') {
      return num(global.pickCol(prof, candidates));
    }
    for (var i = 0; i < candidates.length; i++) {
      var v = num(prof[candidates[i]]);
      if (v != null) return v;
    }
    return null;
  }

  function ensureTrendWindowScores() {
    if (typeof global.syncWindowScoresFromProfiles === 'function') {
      if (!global.SCO_L30_B || !global.SCO_L30_B.length) global.syncWindowScoresFromProfiles();
    }
  }

  function trendWindowRowMap(timeframe) {
    ensureTrendWindowScores();
    var rows = timeframe === 'L30' ? (global.SCO_L30_B || [])
      : timeframe === 'L14' ? (global.SCO_L14_B || [])
        : (global.SCO_L7_B || []);
    if (!rows.length && typeof global.buildWindowRowsFromProfiles === 'function') {
      rows = global.buildWindowRowsFromProfiles(timeframe, 'b') || [];
    }
    return rowMapByTeam(rows);
  }

  function locationMetricMap(location) {
    var LD = liveData();
    if (location === 'home') return rowMapByTeam(aggregateByTeam(LD.batterSplitsHome));
    if (location === 'away') return rowMapByTeam(aggregateByTeam(LD.batterSplitsAway));
    return {};
  }

  function profileYtd(prof, mk) {
    if (!prof) return null;
    if (mk === 'pals') return pickProfField(prof, ['pals', 'PALS']);
    if (mk === 'osi') {
      return pickProfField(prof, ['osi_ytd', 'OSI_YTD', 'osi', 'OSI']);
    }
    return pickProfField(prof, [mk, mk.toUpperCase(), mk + '_ytd', mk.toUpperCase() + '_YTD']);
  }

  function profileWindowOsi(prof, winKey) {
    if (!prof) return null;
    return pickProfField(prof, ['osi_' + winKey, 'OSI_' + winKey.toUpperCase()]);
  }

  function getWindowRows(window, split) {
    var win = (window || 'ytd').toLowerCase();
    if (win === 'ytd') return null;
    var field = 'osi_' + win;
    var LD2 = liveData();
    var profByTeam = LD2.teamProfilesByTeam || {};
    if (!Object.keys(profByTeam).length) {
      (LD2.teamProfiles || []).forEach(function(p) {
        var t = String(p.team || '').trim().toUpperCase();
        if (t) profByTeam[t] = p;
      });
    }
    if (!Object.keys(profByTeam).length) return null;

    var scores = getSplitsTeamScores();
    var baseRows = split === 'r' ? scores.rhp.slice()
      : split === 'l' ? scores.lhp.slice()
        : buildBlendedRows(scores.rhp, scores.lhp);

    return baseRows.map(function(row) {
      var profile = profByTeam[String(row.t || '').toUpperCase()];
      if (!profile) return row;
      var windowOsi = parseFloat(profile[field]);
      if (!isNaN(windowOsi)) {
        return Object.assign({}, row, { osi: windowOsi, _windowOverride: true });
      }
      return row;
    });
  }

  function palsByTeam() {
    var map = {};
    (liveData().pals || []).forEach(function(p) {
      var t = p.t || String(p.team || '').trim().toUpperCase();
      if (t) map[t] = parseFloat(p.PALS != null ? p.PALS : p.pals);
    });
    return map;
  }

  function metricFromRow(row, mk, palsMap) {
    if (!row) return null;
    if (mk === 'pals') return palsMap[row.t];
    return row[mk] != null ? row[mk] : null;
  }

  function f5Osi(row) {
    return (num(row.abq) || 0) * 0.45 + (num(row.obr) || 0) * 0.35 + (num(row.rcv) || 0) * 0.20;
  }

  function rowMapByTeam(rows) {
    var map = {};
    (rows || []).forEach(function(r) {
      if (r && r.t) map[String(r.t).toUpperCase()] = r;
    });
    return map;
  }

  function showTrendsBanner(msg) {
    var b = document.getElementById('trendLocationBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'trendLocationBanner';
      b.className = 'splits-banner';
      var anchor = document.getElementById('rlTrendTableMount') || document.getElementById('trendMap') || document.getElementById('rlTrendControlsMount');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
    }
    b.textContent = msg;
    b.style.display = 'block';
  }

  function hideTrendsBanner() {
    var b = document.getElementById('trendLocationBanner');
    if (b) b.style.display = 'none';
  }

  function showSplitsBanner(id, msg) {
    var b = document.getElementById(id);
    if (!b) {
      b = document.createElement('div');
      b.id = id;
      b.className = 'splits-banner';
      var mount = document.getElementById('rlSplitsTableMount');
      if (mount && mount.parentNode) mount.parentNode.insertBefore(b, mount);
    }
    b.textContent = msg;
    b.style.display = 'block';
  }

  function hideSplitsBanner(id) {
    var b = document.getElementById(id);
    if (b) b.style.display = 'none';
  }

  function activatePill(btn, selector, root) {
    (root || document).querySelectorAll(selector).forEach(function(p) {
      p.classList.remove('splits-pill-active', 'trends-pill-active');
    });
    btn.classList.add('splits-pill-active');
  }

  function buildSplitsControlsHTML() {
    var st = SPLITS_STATE;
    function pill(active, attrs, label) {
      return '<button type="button" class="splits-pill' + (active ? ' splits-pill-active' : '') + '" ' + attrs + '>' + label + '</button>';
    }
    var spStatPills = pill(st.pitchStatGroup === 'standard', 'data-splits-statgroup="standard" data-splits-section="pitching"', 'Standard')
      + pill(st.pitchStatGroup === 'allowed', 'data-splits-statgroup="allowed" data-splits-section="pitching"', 'Metrics Allowed')
      + pill(st.pitchStatGroup === 'detail', 'data-splits-statgroup="detail" data-splits-section="pitching"', 'Splits Detail');
    var bpStatPills = pill(st.pitchStatGroup === 'standard', 'data-splits-statgroup="standard" data-splits-section="pitching"', 'Standard')
      + pill(st.pitchStatGroup === 'allowed', 'data-splits-statgroup="allowed" data-splits-section="pitching"', 'Metrics Allowed');

    return ''
      + '<div class="splits-controls" id="splitsControlsRoot">'
      + '<div class="splits-section-head">LINEUP SPLITS</div>'
      + '<div class="splits-control-row"><span class="splits-control-label">METRIC</span><div class="splits-pill-group">'
      + ['osi', 'abq', 'rcv', 'obr', 'pals', 'standard'].map(function(m) {
        return pill(st.lineupMetric === m, 'data-splits-metric="' + m + '" data-splits-section="lineup"', m === 'standard' ? 'Standard Stats' : m.toUpperCase());
      }).join('')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">WINDOW</span><div class="splits-pill-group">'
      + ['ytd', 'l30', 'l14', 'l7'].map(function(w) {
        return pill(st.window === w, 'data-splits-window="' + w + '" data-splits-section="lineup"', w.toUpperCase());
      }).join('')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">FILTER</span>'
      + '<input type="search" id="splitsSearch" class="splits-search" placeholder="Search team..." value="' + esc(st.search) + '">'
      + '</div>'
      + '<div class="splits-section-divider"></div>'
      + '<div class="splits-section-head">PITCHING SPLITS</div>'
      + '<div class="splits-control-row"><span class="splits-control-label">VIEW</span><div class="splits-pill-group">'
      + pill(st.section === 'pitching' && st.pitchEntity === 'sp', 'data-splits-entity="sp" data-splits-section="pitching"', 'Starting Pitchers')
      + pill(st.section === 'pitching' && st.pitchEntity === 'bullpen', 'data-splits-entity="bullpen" data-splits-section="pitching"', 'Bullpen')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">STATS</span><div class="splits-pill-group">'
      + (st.pitchEntity === 'bullpen' ? bpStatPills : spStatPills)
      + '</div></div>'
      + '<div class="splits-confirm" id="splitsConfirmLine"></div>'
      + '</div>';
  }

  function initSplitsTab() {
    var controlMount = document.getElementById('rlSplitsControlMount');
    var tableMount = document.getElementById('rlSplitsTableMount');
    if (!controlMount || !tableMount) {
      
      return;
    }
    if (!controlMount.dataset.built) {
      controlMount.innerHTML = buildSplitsControlsHTML();
      controlMount.dataset.built = '1';
      bindSplitsControls();
    }
    renderSplitsTable();
  }

  function bindSplitsControls() {
    var root = document.getElementById('splitsControlsRoot');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', function(e) {
      var btn = e.target.closest(
        'button[data-splits-split], button[data-splits-metric], button[data-splits-window],'
        + 'button[data-splits-entity], button[data-splits-statgroup]'
      );
      if (!btn) return;

      if (btn.dataset.splitsSection === 'lineup') SPLITS_STATE.section = 'lineup';
      if (btn.dataset.splitsSection === 'pitching') SPLITS_STATE.section = 'pitching';

      if (btn.dataset.splitsSplit) {
        SPLITS_STATE.section = 'lineup';
        SPLITS_STATE.lineupSplit = btn.dataset.splitsSplit;
        activatePill(btn, '[data-splits-split]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsMetric) {
        SPLITS_STATE.section = 'lineup';
        SPLITS_STATE.lineupMetric = btn.dataset.splitsMetric;
        SPLITS_STATE.sortKey = btn.dataset.splitsMetric === 'standard' ? 'wrc' : btn.dataset.splitsMetric;
        activatePill(btn, '[data-splits-metric]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsWindow) {
        SPLITS_STATE.section = 'lineup';
        SPLITS_STATE.window = btn.dataset.splitsWindow;
        activatePill(btn, '[data-splits-window]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsEntity) {
        SPLITS_STATE.section = 'pitching';
        SPLITS_STATE.pitchEntity = btn.dataset.splitsEntity;
        SPLITS_STATE.pitchStatGroup = 'standard';
        if (SPLITS_STATE.pitchEntity === 'bullpen') {
          SPLITS_STATE.sortKey = 'eraOverall';
          SPLITS_STATE.sortDir = 'asc';
        } else {
          SPLITS_STATE.sortKey = 'ERA';
          SPLITS_STATE.sortDir = 'asc';
        }
        var cm = document.getElementById('rlSplitsControlMount');
        if (cm) delete cm.dataset.built;
        initSplitsTab();
        return;
      }
      if (btn.dataset.splitsStatgroup) {
        SPLITS_STATE.section = 'pitching';
        SPLITS_STATE.pitchStatGroup = btn.dataset.splitsStatgroup;
        if (SPLITS_STATE.pitchEntity === 'bullpen') {
          SPLITS_STATE.sortKey = btn.dataset.splitsStatgroup === 'allowed' ? 'osiAllowed' : 'eraOverall';
          SPLITS_STATE.sortDir = 'asc';
        } else if (btn.dataset.splitsStatgroup === 'allowed') {
          SPLITS_STATE.sortKey = 'OSI_allowed';
          SPLITS_STATE.sortDir = 'asc';
        } else {
          SPLITS_STATE.sortKey = 'ERA';
          SPLITS_STATE.sortDir = 'asc';
        }
        activatePill(btn, '[data-splits-statgroup]', root);
        renderSplitsTable();
      }
    });

    var searchEl = document.getElementById('splitsSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function() {
        SPLITS_STATE.search = searchEl.value.toLowerCase();
        renderSplitsTable();
      });
    }
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) {
      
      return;
    }
    var confirm = document.getElementById('splitsConfirmLine');
    if (confirm) {
      if (SPLITS_STATE.section === 'pitching') {
        confirm.textContent = 'Pitching: ' + SPLITS_STATE.pitchEntity + ' \u00B7 ' + SPLITS_STATE.pitchStatGroup;
      } else {
        confirm.textContent = 'Lineup: ' + SPLITS_STATE.lineupSplit + ' \u00B7 ' + SPLITS_STATE.lineupMetric + ' \u00B7 ' + SPLITS_STATE.window;
      }
    }
    if (SPLITS_STATE.section === 'lineup') {
      renderLineupSplits(mount);
    } else {
      renderPitchingSplits(mount);
    }
  }

  function renderPitchingSplits(mount) {
    if (SPLITS_STATE.pitchEntity === 'bullpen') renderBullpenSplits(mount);
    else renderSpSplits(mount);
  }

  function attachTableSort(mount) {
    if (!mount) return;
    mount.querySelectorAll('[data-sort-key]').forEach(function(th) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-sort-key');
        if (SPLITS_STATE.sortKey === key) {
          SPLITS_STATE.sortDir = SPLITS_STATE.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          SPLITS_STATE.sortKey = key;
          if (SPLITS_STATE.section === 'pitching' && SPLITS_STATE.pitchEntity === 'bullpen'
            && (key === 'eraOverall' || key === 'osiAllowed' || key === 'hiLevEra' || key === 'loLevEra' || key.indexOf('Allowed') >= 0)) {
            SPLITS_STATE.sortDir = 'asc';
          } else if (SPLITS_STATE.section === 'pitching' && key === 'ERA') {
            SPLITS_STATE.sortDir = 'asc';
          } else {
            SPLITS_STATE.sortDir = 'desc';
          }
        }
        renderSplitsTable();
      });
    });
  }

  function buildLineupMatrixRows() {
    var LD = liveData();
    var scores = getSplitsTeamScores();
    var rRows = scores.rhp;
    var lRows = scores.lhp;
    var win = SPLITS_STATE.window || 'ytd';
    var winRows = getWindowRows(win, SPLITS_STATE.lineupSplit);
    if (winRows) {
      var winMap = rowMapByTeam(winRows);
      if (SPLITS_STATE.lineupSplit === 'r') {
        rRows = rRows.map(function(r) { return winMap[r.t] || r; });
      } else if (SPLITS_STATE.lineupSplit === 'l') {
        lRows = lRows.map(function(r) { return winMap[r.t] || r; });
      } else {
        rRows = winRows;
        lRows = winRows;
      }
      hideSplitsBanner('splitsWindowBanner');
    } else if (win !== 'ytd') {
      showSplitsBanner('splitsWindowBanner', 'Showing YTD \u2014 window data requires Team_Profiles (' + win.toUpperCase() + ')');
    } else {
      hideSplitsBanner('splitsWindowBanner');
    }

    var rMap = rowMapByTeam(rRows);
    var lMap = rowMapByTeam(lRows);
    var homeMap = rowMapByTeam(aggregateByTeam(LD.batterSplitsHome));
    var awayMap = rowMapByTeam(aggregateByTeam(LD.batterSplitsAway));
    var palsMap = palsByTeam();
    var profMap = profileMapFromTeamProfiles();
    var mk = SPLITS_STATE.lineupMetric || 'osi';

    var teams = {};
    rRows.forEach(function(r) { if (r.t) teams[r.t] = true; });
    lRows.forEach(function(r) { if (r.t) teams[r.t] = true; });

    return Object.keys(teams).sort().map(function(t) {
      var r = rMap[t] || {};
      var l = lMap[t] || {};
      var h = homeMap[t] || {};
      var a = awayMap[t] || {};
      var prof = profMap[t] || {};
      var trend = null;
      if (prof.osi_l30 != null && r.osi != null) {
        trend = parseFloat(prof.osi_l30) - parseFloat(r.osi);
      }
      return {
        t: t,
        rhp: metricFromRow(r, mk, palsMap),
        lhp: metricFromRow(l, mk, palsMap),
        home: metricFromRow(h, mk, palsMap),
        away: metricFromRow(a, mk, palsMap),
        f5: mk === 'osi' ? f5Osi(r) : metricFromRow(r, mk, palsMap),
        trend: trend,
        wrc: r.wrc,
        woba: r.woba != null ? r.woba : r.wOBA,
        xwoba: r.xwoba,
        slg: r.slg,
        obp: r.obp,
        iso: r.iso,
        pals: palsMap[t],
        osi: r.osi,
        abq: r.abq,
        rcv: r.rcv,
        obr: r.obr
      };
    });
  }

  function renderLineupSplits(mount) {
    
    try {
      var rows = buildLineupMatrixRows();
      

      if (!rows.length) {
        mount.innerHTML = '<div class="splits-empty">Loading team data\u2026 Run pipeline to load scYtdR/scYtdL.</div>';
        return;
      }

      if (SPLITS_STATE.search) {
        rows = rows.filter(function(r) {
          return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
        });
      }

      var mk = SPLITS_STATE.lineupMetric || 'osi';
      var columns;
      if (mk === 'standard') {
        columns = [
          { key: 't', label: 'Team', type: 'team' },
          { key: 'wrc', label: 'wRC+', color: true, leagueAvg: 100 },
          { key: 'woba', label: 'wOBA', color: true, rate: true },
          { key: 'xwoba', label: 'xwOBA', color: true, rate: true },
          { key: 'slg', label: 'SLG', color: true, rate: true },
          { key: 'obp', label: 'OBP', color: true, rate: true },
          { key: 'iso', label: 'ISO', color: true, rate: true }
        ];
      } else {
        var metricCtx = mk === 'pals' ? 'osi' : mk;
        columns = [
          { key: 't', label: 'Team', type: 'team' },
          { key: 'rhp', label: 'vs RHP', color: true, ctx: metricCtx },
          { key: 'lhp', label: 'vs LHP', color: true, ctx: metricCtx },
          { key: 'home', label: 'Home', color: true, ctx: metricCtx },
          { key: 'away', label: 'Away', color: true, ctx: metricCtx },
          { key: 'f5', label: 'F5', color: true, ctx: metricCtx },
        ];
      }

      if (SPLITS_STATE.sortKey) {
        rows.sort(function(a, b) {
          var av = parseFloat(a[SPLITS_STATE.sortKey]);
          var bv = parseFloat(b[SPLITS_STATE.sortKey]);
          if (isNaN(av)) av = -999;
          if (isNaN(bv)) bv = -999;
          return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
        });
      }

      mount.innerHTML = buildTable(rows, columns);
      attachTableSort(mount);
    } catch (err) {
      console.error('[SPLITS LINEUP] crashed:', err.message, err.stack);
      mount.innerHTML = '<div style="color:red;padding:20px;">Splits render error: ' + esc(err.message) + '</div>';
    }
  }

  function renderSpSplits(mount) {
    
    var profiles = liveData().spProfiles || [];
    if (!profiles.length) {
      mount.innerHTML = '<div class="splits-empty">Loading…</div>';
      setTimeout(function() {
        var p2 = liveData().spProfiles || [];
        if (p2.length) renderSpSplits(mount);
        else mount.innerHTML = '<div class="splits-empty">No pitcher data available.</div>';
      }, 1500);
      return;
    }
    var rows = profiles.map(function(p) {
      var m = S && S.spProfileMetrics ? S.spProfileMetrics(p) : {};
      return {
        pitcher_name: p.pitcher_name || (S ? S.pickCol(p, ['pitcher_name', 'Name']) : ''),
        pitcher_team: p.pitcher_team || (S ? S.pickCol(p, ['pitcher_team', 'Team']) : ''),
        pitcher_hand: String(p.pitcher_hand || p.hand || 'R').charAt(0).toUpperCase(),
        avg_IP: num(p.avg_IP) != null ? num(p.avg_IP) : num(p.avg_ip),
        ERA: num(p.ERA) != null ? num(p.ERA) : m.era,
        K_pct: num(p.K_pct) != null ? num(p.K_pct) : m.kPct,
        BB_pct: num(p.BB_pct) != null ? num(p.BB_pct) : m.bbPct,
        HR9: num(p.HR9) != null ? num(p.HR9) : m.hr9,
        OSI_allowed: num(p.OSI_allowed) != null ? num(p.OSI_allowed) : m.osiAllowed,
        ABQ_allowed: num(p.ABQ_allowed) != null ? num(p.ABQ_allowed) : m.abqAllowed,
        RCV_allowed: num(p.RCV_allowed) != null ? num(p.RCV_allowed) : m.rcvAllowed,
        OBR_allowed: num(p.OBR_allowed) != null ? num(p.OBR_allowed) : m.obrAllowed,
        PitchScore: num(p.PitchScore) != null ? num(p.PitchScore) : m.pitchScore,
        osi_lhh: num(p.osi_allowed_vs_lhh) || num(p.OSI_allowed_LHH),
        osi_rhh: num(p.osi_allowed_vs_rhh) || num(p.OSI_allowed_RHH)
      };
    });
    

    if (SPLITS_STATE.search) {
      rows = rows.filter(function(r) {
        var n = String(r.pitcher_name || '').toLowerCase();
        var t = String(r.pitcher_team || '').toLowerCase();
        return n.indexOf(SPLITS_STATE.search) >= 0 || t.indexOf(SPLITS_STATE.search) >= 0;
      });
    }

    var sg = SPLITS_STATE.pitchStatGroup || 'standard';
    var columns;
    if (sg === 'allowed') {
      columns = [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'pitcher_hand', label: 'Hand', type: 'text' },
        { key: 'PitchScore', label: 'Pitch Score', color: true, ctx: 'osi' },
        { key: 'OSI_allowed', label: 'OSI Allowed', color: true, invert: true },
        { key: 'ABQ_allowed', label: 'ABQ Allowed', color: true, invert: true },
        { key: 'RCV_allowed', label: 'RCV Allowed', color: true, invert: true },
        { key: 'OBR_allowed', label: 'OBR Allowed', color: true, invert: true }
      ];
    } else if (sg === 'detail') {
      columns = [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'pitcher_hand', label: 'Hand', type: 'text' },
        { key: 'osi_lhh', label: 'OSI vs LHH', color: true, invert: true },
        { key: 'osi_rhh', label: 'OSI vs RHH', color: true, invert: true },
        { key: 'OSI_allowed', label: 'OSI Allowed', color: true, invert: true }
      ];
    } else {
      columns = [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'pitcher_hand', label: 'Hand', type: 'text' },
        { key: 'avg_IP', label: 'IP', color: false },
        { key: 'ERA', label: 'ERA', color: true, invert: true },
        { key: 'K_pct', label: 'K%', color: true },
        { key: 'BB_pct', label: 'BB%', color: true, invert: true },
        { key: 'HR9', label: 'HR/9', color: true, invert: true }
      ];
    }

    if (SPLITS_STATE.sortKey) {
      rows.sort(function(a, b) {
        var av = a[SPLITS_STATE.sortKey];
        var bv = b[SPLITS_STATE.sortKey];
        if (av == null || isNaN(av)) return 1;
        if (bv == null || isNaN(bv)) return -1;
        return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
      });
    }

    mount.innerHTML = buildTable(rows, columns);
    attachTableSort(mount);
  }

  function renderBullpenSplits(mount) {
    console.error('[SPLITS BP] statGroup:', SPLITS_STATE.pitchStatGroup);
    var bpRows = Object.entries(liveData().bullpenUnits || {}).map(function(entry) {
      var team = entry[0];
      var unit = entry[1] || {};
      return {
        t: team,
        bullpenScore: parseFloat(unit.bullpenScore) || null,
        osiAllowed: parseFloat(unit.osiAllowed) || null,
        abqAllowed: parseFloat(unit.abqAllowed) || null,
        rcvAllowed: parseFloat(unit.rcvAllowed) || null,
        obrAllowed: parseFloat(unit.obrAllowed) || null,
        hiLevEra: parseFloat(unit.hiLevEra) || null,
        loLevEra: parseFloat(unit.loLevEra) || null,
        eraOverall: parseFloat(unit.eraOverall) || null,
        kPct: parseFloat(unit.kPct || unit.K_pct || unit['K%']) || null,
        bbPct: parseFloat(unit.bbPct || unit.BB_pct || unit['BB%']) || null
      };
    });
    console.error('[SPLITS BP] rows:', bpRows.length);

    if (!bpRows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading bullpen data\u2026</div>';
      return;
    }
    if (SPLITS_STATE.search) {
      bpRows = bpRows.filter(function(r) {
        return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
      });
    }

    var isAllowed = SPLITS_STATE.pitchStatGroup === 'allowed';
    var sortKey = SPLITS_STATE.sortKey || (isAllowed ? 'osiAllowed' : 'eraOverall');
    var sortDir = SPLITS_STATE.sortDir || 'asc';
    bpRows.sort(function(a, b) {
      var av = a[sortKey];
      var bv = b[sortKey];
      if (av == null || isNaN(av)) return 1;
      if (bv == null || isNaN(bv)) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    var columns = isAllowed
      ? [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'bullpenScore', label: 'Bullpen Score', color: true, ctx: 'osi' },
        { key: 'osiAllowed', label: 'OSI Allowed', color: true, invert: true },
        { key: 'abqAllowed', label: 'ABQ Allowed', color: true, invert: true },
        { key: 'rcvAllowed', label: 'RCV Allowed', color: true, invert: true },
        { key: 'obrAllowed', label: 'OBR Allowed', color: true, invert: true }
      ]
      : [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'eraOverall', label: 'ERA Overall', color: true, invert: true },
        { key: 'hiLevEra', label: 'Hi Lev ERA', color: true, invert: true },
        { key: 'loLevEra', label: 'Lo Lev ERA', color: true, invert: true },
        { key: 'kPct', label: 'K%', color: true },
        { key: 'bbPct', label: 'BB%', color: true, invert: true }
      ];

    mount.innerHTML = buildTable(bpRows, columns);
    attachTableSort(mount);
  }

  function initTrendsTab() {
    var mount = document.getElementById('rlTrendControlsMount');
    if (!mount) {
      return;
    }
    if (mount.dataset.trendsUiVersion !== TRENDS_UI_VERSION) {
      mount.dataset.built = '';
      mount.innerHTML = '';
      mount.dataset.trendsUiVersion = TRENDS_UI_VERSION;
    }
    if (!mount.dataset.built) {
      mount.innerHTML = ''
        + '<div class="splits-controls trends-controls" id="trendsControlsRoot">'
        + '<div class="splits-control-row"><span class="splits-control-label">METRIC</span><div class="splits-pill-group">'
        + ['osi', 'abq', 'rcv', 'obr', 'pals'].map(function(m) {
          return '<button type="button" class="splits-pill trends-pill' + (TRENDS_STATE.metric === m ? ' trends-pill-active splits-pill-active' : '') + '" data-trends-metric="' + m + '">' + m.toUpperCase() + '</button>';
        }).join('')
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">LOC</span><div class="splits-pill-group">'
        + [{ v: 'b', l: 'Both' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }].map(function(o) {
          return '<button type="button" class="splits-pill trends-pill' + (TRENDS_STATE.location === o.v ? ' trends-pill-active splits-pill-active' : '') + '" data-trends-location="' + o.v + '">' + o.l + '</button>';
        }).join('')
        + '</div></div></div>'
        + '<p id="trendsContextLine" class="splits-banner" style="margin:8px 0 0;font-size:12px;opacity:0.85;border:none;background:transparent;padding:0;"></p>'
        + '<div id="rlTrendTableMount" class="splits-table-wrap"></div>';
      mount.dataset.built = '1';
      bindTrendsControls();
    }
    renderTrendHeatmap();
  }

  function bindTrendsControls() {
    var root = document.getElementById('trendsControlsRoot');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-trends-metric], [data-trends-location]');
      if (!btn) return;
      if (btn.dataset.trendsMetric) {
        TRENDS_STATE.metric = btn.dataset.trendsMetric;
        activatePill(btn, '[data-trends-metric]', root);
        renderTrendHeatmap();
        return;
      }
      if (btn.dataset.trendsLocation) {
        TRENDS_STATE.location = btn.dataset.trendsLocation;
        activatePill(btn, '[data-trends-location]', root);
        renderTrendHeatmap();
      }
    });
  }

  function metricColorFor(value, metric) {
    if (value == null || isNaN(value)) return '#374151';
    if (!A || !A.metricColor) return '#9CA3AF';
    var ctx = metric === 'pals' ? 'osi' : (metric || 'osi');
    return A.metricColor(value, ctx, false);
  }

  function metricCellHtml(value, metric, isYtdFallback) {
    if (value == null || isNaN(value)) {
      return '<td style="color:#374151;text-align:right;padding:10px 12px;">\u2014</td>';
    }
    var color = metricColorFor(value, metric);
    var display = Number(value).toFixed(1);
    if (isYtdFallback) {
      return '<td style="color:' + color + ';font-weight:600;text-align:right;padding:10px 12px;">'
        + display + ' <span style="color:#4B5563;font-size:10px;font-weight:400;">YTD</span></td>';
    }
    return '<td style="color:' + color + ';font-weight:600;font-variant-numeric:tabular-nums;text-align:right;padding:10px 12px;">'
      + display + '</td>';
  }

  function reliabilityCellHtml(score) {
    var v = score == null || isNaN(score) ? 0 : Number(score);
    var color = '#F87171';
    if (v > 70) color = '#4ADE80';
    else if (v >= 50) color = '#FBBF24';
    return '<td style="color:' + color + ';font-weight:600;text-align:center;padding:10px 12px;">' + Math.round(v) + '</td>';
  }

  function teamCellHtml(t) {
    var logo = A ? A.teamLogoImg(t, 22) : '';
    return '<td style="display:flex;align-items:center;gap:8px;padding:8px 12px;">'
      + logo + '<span style="font-weight:700;color:#F9FAFB;">' + esc(t) + '</span></td>';
  }

  function trendCellValue(team, mk, timeframe, prof, winRowMap, locRowMap, palsMap) {
    var loc = TRENDS_STATE.location || 'b';
    var winRow = winRowMap[team];
    var locRow = locRowMap[team];

    if (mk === 'pals') {
      var pals = (winRow && winRow.pals != null) ? num(winRow.pals) : pickProfField(prof, ['pals', 'PALS']);
      if (pals == null) pals = palsMap[team];
      return { v: pals, fb: true };
    }

    if (mk === 'osi') {
      var osiWin = profileWindowOsi(prof, timeframe === 'L30' ? 'l30' : timeframe === 'L14' ? 'l14' : 'l7');
      if (osiWin == null && winRow) osiWin = num(winRow.osi);
      if (loc === 'home' && osiWin == null) osiWin = pickProfField(prof, ['home_osi', 'Home_OSI']);
      if (loc === 'away' && osiWin == null) osiWin = pickProfField(prof, ['away_osi', 'Away_OSI']);
      if (osiWin != null) return { v: osiWin, fb: false };
      var osiYtd = profileYtd(prof, 'osi');
      return { v: osiYtd, fb: osiYtd != null };
    }

    if (locRow && locRow[mk] != null) {
      return { v: num(locRow[mk]), fb: true };
    }
    if (winRow && winRow[mk] != null) {
      return { v: num(winRow[mk]), fb: timeframe !== 'L30' };
    }
    var ytd = profileYtd(prof, mk);
    return { v: ytd, fb: ytd != null };
  }

  function updateTrendsContextLine() {
    var el = document.getElementById('trendsContextLine');
    if (!el) return;
    var mk = (TRENDS_STATE.metric || 'osi').toUpperCase();
    var loc = TRENDS_STATE.location || 'b';
    var locLbl = loc === 'home' ? 'Home' : loc === 'away' ? 'Away' : 'Both';
    var note = mk === 'OSI'
      ? 'OSI L30/L14/L7 from Team Profiles'
      : 'ABQ/RCV/OBR: window rows use YTD splits until metric windows ship';
    el.textContent = mk + ' \u00b7 ' + locLbl + ' \u00b7 ' + note;
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('rlTrendTableMount');
    if (!mount) return;

    var mk = TRENDS_STATE.metric || 'osi';
    var loc = TRENDS_STATE.location || 'b';
    hideTrendsBanner();
    if (loc !== 'b' && mk !== 'osi' && mk !== 'pals') {
      var LD = liveData();
      var locRows = loc === 'home' ? (LD.batterSplitsHome || []) : (LD.batterSplitsAway || []);
      if (!locRows.length) {
        showTrendsBanner((loc === 'home' ? 'Home' : 'Away') + ' split data not loaded \u2014 run batter splits pipeline.');
      }
    }

    var profMap = profileMapFromTeamProfiles();
    if (!Object.keys(profMap).length) {
      mount.innerHTML = '<div class="splits-empty">Loading trends data\u2026</div>';
      return;
    }

    ensureTrendWindowScores();
    var l30Map = trendWindowRowMap('L30');
    var l14Map = trendWindowRowMap('L14');
    var l7Map = trendWindowRowMap('L7');
    var locMap = locationMetricMap(loc);
    var palsMap = palsByTeam();
    var teams = Object.keys(profMap).sort();

    var tableRows = teams.map(function(t) {
      var prof = profMap[t] || {};
      var c30 = trendCellValue(t, mk, 'L30', prof, l30Map, locMap, palsMap);
      var c14 = trendCellValue(t, mk, 'L14', prof, l14Map, locMap, palsMap);
      var c7 = trendCellValue(t, mk, 'L7', prof, l7Map, locMap, palsMap);
      return {
        t: t,
        l30: c30.v, l14: c14.v, l7: c7.v,
        l30Fb: c30.fb, l14Fb: c14.fb, l7Fb: c7.fb
      };
    });

    tableRows.sort(function(a, b) { return (b.l30 || 0) - (a.l30 || 0); });
    updateTrendsContextLine();

    var winHeaders = ['L30', 'L14', 'L7'];
    var header = '<thead><tr>'
      + '<th class="splits-th splits-th-name">Team</th>'
      + winHeaders.map(function(w) {
        return '<th class="splits-th splits-th-metric">' + w + '</th>';
      }).join('')
      + '</tr></thead>';
    var body = tableRows.map(function(row) {
      return '<tr class="splits-tr">'
        + teamCellHtml(row.t)
        + metricCellHtml(row.l30, mk, row.l30Fb)
        + metricCellHtml(row.l14, mk, row.l14Fb)
        + metricCellHtml(row.l7, mk, row.l7Fb)
        + '</tr>';
    }).join('');

    mount.innerHTML = '<table class="splits-table">' + header + '<tbody>' + body + '</tbody></table>';
  }

  function cellColor(val, col) {
    if (val == null || val === '' || isNaN(val)) return '#374151';
    if (!col.color) return '#D1D5DB';
    if (!A || !A.metricColor) return '#9CA3AF';

    if (col.key === 'ERA' || col.key === 'eraOverall' || col.key === 'hiLevEra' || col.key === 'loLevEra') {
      var era = Number(val);
      if (era < 3.5) return '#4ADE80';
      if (era <= 4.5) return '#FBBF24';
      return '#F87171';
    }
    if (col.key === 'wrc' || col.leagueAvg != null) {
      var w = Number(val);
      if (w > 110) return '#4ADE80';
      if (w >= 90) return '#FBBF24';
      return '#F87171';
    }
    if (col.rate || col.key === 'woba' || col.key === 'xwoba') {
      var rate = Number(val);
      if (rate > 0.340) return '#4ADE80';
      if (rate >= 0.310) return '#FBBF24';
      return '#F87171';
    }
    if (col.key === 'bullpenScore' || col.key === 'PitchScore') {
      return A.metricColor(val, 'osi', false);
    }
    if (col.signed) {
      var d = Number(val);
      if (d > 2) return '#4ADE80';
      if (d < -2) return '#F87171';
      return '#FBBF24';
    }
    var metricKey = col.ctx || col.key;
    if (col.key === 'osiAllowed' || col.key === 'abqAllowed' || col.key === 'rcvAllowed' || col.key === 'obrAllowed'
      || col.key === 'OSI_allowed' || col.key === 'ABQ_allowed' || col.key === 'RCV_allowed' || col.key === 'OBR_allowed'
      || col.key === 'osi_lhh' || col.key === 'osi_rhh') {
      metricKey = 'osi';
    }
    return A.metricColor(val, metricKey, !!col.invert);
  }

  function buildTable(rows, columns) {
    if (!rows.length) return '<div class="splits-empty">No data matches current filters.</div>';

    var header = columns.map(function(col) {
      if (col.type === 'team' || col.type === 'pitcher' || col.type === 'text') {
        return '<th class="splits-th splits-th-name">' + esc(col.label) + '</th>';
      }
      return '<th class="splits-th splits-th-metric" data-sort-key="' + esc(col.key) + '">' + esc(col.label) + '</th>';
    }).join('');

    var body = rows.map(function(row) {
      var cells = columns.map(function(col) {
        if (col.type === 'team') {
          return '<td class="splits-td splits-td-team" style="padding:8px 12px;"><div style="display:flex;align-items:center;gap:8px;">'
            + (A ? A.teamLogoImg(row.t, 22) : '')
            + '<span class="splits-team-abbr" style="font-weight:700;color:#F9FAFB;">' + esc(row.t) + '</span></div></td>';
        }
        if (col.type === 'pitcher') {
          var avatar = A && A.pitcherAvatar ? A.pitcherAvatar(row.pitcher_name, 28) : '';
          return '<td class="splits-td splits-td-pitcher" style="padding:8px 12px;"><div style="display:flex;align-items:center;gap:8px;">'
            + avatar + '<span style="font-weight:600;color:#F9FAFB;">' + esc(row.pitcher_name || '') + '</span></div></td>';
        }
        if (col.type === 'teamBadge') {
          return '<td class="splits-td">' + (A ? A.teamLogoImg(row.pitcher_team, 18) : '') + '</td>';
        }
        if (col.type === 'text') {
          return '<td class="splits-td" style="color:#D1D5DB;">' + esc(row[col.key] != null ? row[col.key] : '\u2014') + '</td>';
        }
        var val = row[col.key];
        if (val == null || val === '' || isNaN(val)) val = null;
        var display = '\u2014';
        if (val != null) {
          if (col.signed) {
            display = (val > 0 ? '+' : '') + Number(val).toFixed(1);
          } else if (col.key === 'ERA' || col.key === 'eraOverall' || col.key === 'hiLevEra' || col.key === 'loLevEra') {
            display = Number(val).toFixed(2);
          } else if (col.rate || col.key === 'woba' || col.key === 'xwoba' || col.key === 'slg' || col.key === 'obp' || col.key === 'iso') {
            display = Number(val).toFixed(3);
          } else if (col.key === 'avg_IP') {
            display = Number(val).toFixed(1);
          } else if (col.key === 'K_pct' || col.key === 'kPct' || col.key === 'BB_pct' || col.key === 'bbPct') {
            display = Number(val).toFixed(1);
          } else {
            display = fmt(val);
          }
        }
        var color = cellColor(val, col);
        return '<td class="splits-td splits-td-num" style="color:' + color + ';font-weight:600;font-variant-numeric:tabular-nums;text-align:right;">' + display + '</td>';
      }).join('');
      return '<tr class="splits-tr">' + cells + '</tr>';
    }).join('');

    return '<table class="splits-table"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function syncGlobalBarToUix() {
    var st = global.STATE;
    if (!st) return;
    var sp = st.split || 'b';
    if (global.SPLITS_STATE) {
      if (sp === 'home' || sp === 'away' || sp === 'f5' || sp === 'r' || sp === 'l' || sp === 'b') {
        global.SPLITS_STATE.lineupSplit = sp;
        global.SPLITS_STATE.section = 'lineup';
      }
      var w = (st.time || 'YTD').toLowerCase();
      if (w === 'ytd' || w === 'l30' || w === 'l14' || w === 'l7') {
        global.SPLITS_STATE.window = w;
      }
    }
  }

  if (RL) {
    RL.initSplitsTab = initSplitsTab;
    RL.initTrendsTab = initTrendsTab;
    RL.renderSplitsTable = renderSplitsTable;
    RL.renderTrendHeatmap = renderTrendHeatmap;
    RL.syncGlobalBarToUix = syncGlobalBarToUix;
    global.initSplitsTab = initSplitsTab;
    global.renderTrendHeatmap = renderTrendHeatmap;
    global.renderSplitsTable = renderSplitsTable;
    global.renderTeamOffenseSplits = function() {
      SPLITS_STATE.section = 'lineup';
      renderSplitsTable();
    };
    global.syncGlobalBarToUix = syncGlobalBarToUix;

    var prevOnSubtab = RL.onSubtab;
    RL.onSubtab = function(name) {
      showRlResearchPane(name === 'pitcher' ? 'pitching' : name);
      if (name === 'splits') initSplitsTab();
      else if (name === 'trends') initTrendsTab();
      if (prevOnSubtab) prevOnSubtab(name);
    };

    global.refreshSplitsIfVisible = function() {
      var pane = document.getElementById('pane-splits');
      if (pane && pane.style.display !== 'none') renderSplitsTable();
    };
  }
})(typeof window !== 'undefined' ? window : this);
