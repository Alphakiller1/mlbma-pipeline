// rl_tab_uix.js — Research Lab Trends & Splits (single source of truth)
'use strict';

var SPLITS_STATE = {
  section: 'lineup',
  entity: 'sp',
  lineupSplit: 'b',
  lineupMetric: 'osi',
  split: 'b',
  metric: 'osi',
  statGroup: 'standard',
  window: 'ytd',
  search: '',
  sortKey: 'osi',
  sortDir: 'desc'
};

var TRENDS_STATE = {
  metric: 'osi',
  hand: 'b',
  location: 'b'
};

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
      rhp: LD.scYtdR || global.SCO_YTD_R || LD.vsRhp || LD.rhpScores || (global.RL_DATA && global.RL_DATA.rhp) || [],
      lhp: LD.scYtdL || global.SCO_YTD_L || LD.vsLhp || LD.lhpScores || (global.RL_DATA && global.RL_DATA.lhp) || []
    };
  }

  function getHandRows(hand) {
    var scores = getSplitsTeamScores();
    var r = scores.rhp;
    var l = scores.lhp;
    if (hand === 'r') return r.slice();
    if (hand === 'l') return l.length ? l.slice() : r.slice();
    var lMap = {};
    l.forEach(function(row) { lMap[row.t] = row; });
    return r.map(function(row) {
      var lRow = lMap[row.t] || row;
      return {
        t: row.t,
        osi: ((parseFloat(row.osi) || 0) + (parseFloat(lRow.osi) || row.osi || 0)) / 2,
        abq: ((parseFloat(row.abq) || 0) + (parseFloat(lRow.abq) || row.abq || 0)) / 2,
        rcv: ((parseFloat(row.rcv) || 0) + (parseFloat(lRow.rcv) || row.rcv || 0)) / 2,
        obr: ((parseFloat(row.obr) || 0) + (parseFloat(lRow.obr) || row.obr || 0)) / 2,
        woba: row.woba != null ? row.woba : row.wOBA,
        wrc: row.wrc,
        slg: row.slg,
        xwoba: row.xwoba
      };
    });
  }

  function aggregateHomeAway(rows) {
    if (!rows || !rows.length) return [];
    var map = {};
    rows.forEach(function(row) {
      var team = row.team || row.Team || row.Tm || row.team_abbr || row.TEAM || row.t;
      if (!team) return;
      team = String(team).trim().toUpperCase();
      var osi = parseFloat(row.osi || row.OSI || 0);
      var abq = parseFloat(row.abq || row.ABQ || 0);
      var rcv = parseFloat(row.rcv || row.RCV || 0);
      var obr = parseFloat(row.obr || row.OBR || 0);
      if (!map[team]) map[team] = { t: team, osiSum: 0, abqSum: 0, rcvSum: 0, obrSum: 0, count: 0 };
      if (!isNaN(osi) && osi > 0) {
        map[team].osiSum += osi;
        map[team].abqSum += abq;
        map[team].rcvSum += rcv;
        map[team].obrSum += obr;
        map[team].count++;
      }
    });
    return Object.keys(map).sort().map(function(t) {
      var d = map[t];
      return {
        t: d.t,
        osi: d.count ? d.osiSum / d.count : 0,
        abq: d.count ? d.abqSum / d.count : 0,
        rcv: d.count ? d.rcvSum / d.count : 0,
        obr: d.count ? d.obrSum / d.count : 0
      };
    });
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
    return ''
      + '<div class="splits-controls" id="splitsControlsRoot">'
      + '<div class="splits-section-head">LINEUP SPLITS</div>'
      + '<div class="splits-control-row"><span class="splits-control-label">SPLIT</span><div class="splits-pill-group" id="splitsLineupSplitPills">'
      + pill(st.split === 'r', 'data-splits-split="r" data-splits-section="lineup"', 'vs RHP')
      + pill(st.split === 'l', 'data-splits-split="l" data-splits-section="lineup"', 'vs LHP')
      + pill(st.split === 'home', 'data-splits-split="home" data-splits-section="lineup"', 'Home')
      + pill(st.split === 'away', 'data-splits-split="away" data-splits-section="lineup"', 'Away')
      + pill(st.split === 'f5', 'data-splits-split="f5" data-splits-section="lineup"', 'F5')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">METRIC</span><div class="splits-pill-group" id="splitsMetricPills">'
      + ['osi', 'abq', 'rcv', 'obr', 'pals', 'standard'].map(function(m) {
        return pill(st.metric === m, 'data-splits-metric="' + m + '" data-splits-section="lineup"', m === 'standard' ? 'Standard' : m.toUpperCase());
      }).join('')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">WINDOW</span><div class="splits-pill-group" id="splitsWindowPills">'
      + ['ytd', 'l30', 'l14', 'l7'].map(function(w) {
        return pill(st.window === w, 'data-splits-window="' + w + '" data-splits-section="lineup"', w.toUpperCase());
      }).join('')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">FILTER</span>'
      + '<input type="search" id="splitsSearch" class="splits-search" placeholder="Search team..." value="' + esc(st.search) + '">'
      + '<label class="splits-minpa-label">Min PA <input type="number" id="splitsMinPa" class="splits-minpa-input" min="0" value="0"></label>'
      + '</div>'
      + '<div class="splits-section-divider"></div>'
      + '<div class="splits-section-head">PITCHING SPLITS</div>'
      + '<div class="splits-control-row"><span class="splits-control-label">VIEW</span><div class="splits-pill-group" id="splitsPitchViewPills">'
      + pill(st.section === 'pitching' && st.entity === 'sp', 'data-splits-entity="sp" data-splits-section="pitching"', 'Starting Pitchers')
      + pill(st.section === 'pitching' && st.entity === 'bullpen', 'data-splits-entity="bullpen" data-splits-section="pitching"', 'Bullpen')
      + '</div></div>'
      + '<div class="splits-control-row"><span class="splits-control-label">STATS</span><div class="splits-pill-group" id="splitsPitchStatPills">'
      + (st.entity === 'bullpen'
        ? pill(st.statGroup === 'standard', 'data-splits-statgroup="standard" data-splits-section="pitching"', 'BP Standard')
        : pill(st.statGroup === 'standard', 'data-splits-statgroup="standard" data-splits-section="pitching"', 'SP Standard')
          + pill(st.statGroup === 'allowed', 'data-splits-statgroup="allowed" data-splits-section="pitching"', 'Metrics Allowed'))
      + '</div></div>'
      + '<div class="splits-confirm" id="splitsConfirmLine"></div>'
      + '</div>';
  }

  function initSplitsTab() {
    var controlMount = document.getElementById('rlSplitsControlMount');
    var tableMount = document.getElementById('rlSplitsTableMount');
    if (!controlMount || !tableMount) {
      console.error('[SPLITS] mount missing');
      return;
    }
    if (!controlMount.dataset.built) {
      controlMount.innerHTML = buildSplitsControlsHTML();
      controlMount.dataset.built = '1';
      try {
        bindSplitsControls();
      } catch (err) {
        console.error('[SPLITS] bindSplitsControls crashed:', err.message, err.stack);
      }
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
        SPLITS_STATE.split = SPLITS_STATE.lineupSplit;
        activatePill(btn, '[data-splits-split]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsMetric) {
        SPLITS_STATE.section = 'lineup';
        SPLITS_STATE.lineupMetric = btn.dataset.splitsMetric;
        SPLITS_STATE.metric = SPLITS_STATE.lineupMetric;
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
        SPLITS_STATE.entity = btn.dataset.splitsEntity;
        if (SPLITS_STATE.entity === 'bullpen') {
          SPLITS_STATE.statGroup = 'standard';
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
        SPLITS_STATE.statGroup = btn.dataset.splitsStatgroup;
        if (SPLITS_STATE.entity === 'bullpen') {
          SPLITS_STATE.sortKey = btn.dataset.splitsStatgroup === 'allowed' ? 'osiAllowed' : 'eraOverall';
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
        SPLITS_STATE.section = 'lineup';
        renderSplitsTable();
      });
    }
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) {
      console.error('[SPLITS] mount not found');
      return;
    }
    var confirm = document.getElementById('splitsConfirmLine');
    if (confirm) {
      if (SPLITS_STATE.section === 'pitching') {
        confirm.textContent = 'Pitching: ' + SPLITS_STATE.entity + ' \u00B7 ' + SPLITS_STATE.statGroup;
      } else {
        confirm.textContent = 'Lineup: ' + SPLITS_STATE.split + ' \u00B7 ' + SPLITS_STATE.metric + ' \u00B7 ' + SPLITS_STATE.window;
      }
    }
    if (SPLITS_STATE.section === 'lineup') {
      renderTeamSplits(mount);
    } else {
      renderPitchingSplits(mount);
    }
  }

  function renderPitchingSplits(mount) {
    if (SPLITS_STATE.entity === 'bullpen') renderBullpenSplits(mount);
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
          if (SPLITS_STATE.section === 'pitching' && SPLITS_STATE.entity === 'bullpen'
            && (key === 'eraOverall' || key === 'osiAllowed' || key === 'hiLevEra' || key === 'loLevEra' || key.indexOf('Allowed') >= 0)) {
            SPLITS_STATE.sortDir = 'asc';
          } else {
            SPLITS_STATE.sortDir = 'desc';
          }
        }
        renderSplitsTable();
      });
    });
  }

  function applyLineupWindow(rows) {
    var win = SPLITS_STATE.window || 'ytd';
    if (win === 'ytd') {
      hideSplitsBanner('splitsWindowBanner');
      return rows;
    }
    var field = 'osi_' + win;
    var LD = liveData();
    var profiles = LD.teamProfiles || [];
    var profileMap = LD.teamProfilesByTeam || {};
    if (!Object.keys(profileMap).length && profiles.length) {
      profiles.forEach(function(p) {
        var t = String(p.team || p.Tm || p.Team || '').trim().toUpperCase();
        if (t) profileMap[t] = p;
      });
    }
    var hasOverride = false;
    rows = rows.map(function(row) {
      var profile = profileMap[row.t];
      if (!profile) return row;
      var windowOsi = parseFloat(profile[field]);
      if (!isNaN(windowOsi) && windowOsi > 0) {
        hasOverride = true;
        return Object.assign({}, row, { osi: windowOsi, _windowOverride: true });
      }
      return row;
    });
    if (!hasOverride) {
      showSplitsBanner('splitsWindowBanner', 'Showing YTD \u2014 window data requires pipeline (Team_Profiles ' + win.toUpperCase() + ')');
    } else {
      hideSplitsBanner('splitsWindowBanner');
    }
    return rows;
  }

  function renderTeamSplits(mount) {
    try {
      var split = SPLITS_STATE.split || 'b';
      var rows;
      var LD = liveData();

      if (split === 'home') {
        rows = aggregateHomeAway(LD.batterSplitsHome);
        if (!rows.length) {
          rows = getHandRows('b');
          showSplitsBanner('splitsLocBanner', 'Home splits: showing YTD baseline');
        } else hideSplitsBanner('splitsLocBanner');
      } else if (split === 'away') {
        rows = aggregateHomeAway(LD.batterSplitsAway);
        if (!rows.length) {
          rows = getHandRows('b');
          showSplitsBanner('splitsLocBanner', 'Away splits: showing YTD baseline');
        } else hideSplitsBanner('splitsLocBanner');
      } else if (split === 'f5') {
        rows = getHandRows('b').map(function(r) {
          return Object.assign({}, r, {
            osi: (r.abq * 0.45) + (r.obr * 0.35) + (r.rcv * 0.20)
          });
        });
        hideSplitsBanner('splitsLocBanner');
      } else if (split === 'r') {
        rows = getHandRows('r');
        hideSplitsBanner('splitsLocBanner');
      } else if (split === 'l') {
        rows = getHandRows('l');
        hideSplitsBanner('splitsLocBanner');
      } else {
        rows = getHandRows('b');
        hideSplitsBanner('splitsLocBanner');
      }

      if (!rows.length) {
        mount.innerHTML = '<div class="splits-empty">Loading team data\u2026</div>';
        return;
      }

      rows = applyLineupWindow(rows);

      var palsMap = palsByTeam();
      rows = rows.map(function(r) {
        return Object.assign({}, r, { pals: palsMap[r.t] });
      });

      if (SPLITS_STATE.search) {
        rows = rows.filter(function(r) {
          return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
        });
      }

      var metric = SPLITS_STATE.metric || 'osi';
      var columns;
      if (metric === 'standard') {
        columns = [
          { key: 't', label: 'Team', type: 'team' },
          { key: 'wrc', label: 'wRC+', color: true, leagueAvg: 100 },
          { key: 'woba', label: 'wOBA', color: true, ctx: 'woba' },
          { key: 'slg', label: 'SLG', color: true, ctx: 'slg' }
        ];
      } else if (metric === 'pals') {
        columns = [
          { key: 't', label: 'Team', type: 'team' },
          { key: 'pals', label: 'PALS', color: true },
          { key: 'osi', label: 'OSI', color: true },
          { key: 'obr', label: 'OBR', color: true },
          { key: 'rcv', label: 'RCV', color: true },
          { key: 'abq', label: 'ABQ', color: true }
        ];
      } else {
        columns = [
          { key: 't', label: 'Team', type: 'team' },
          { key: metric, label: metric.toUpperCase(), color: true },
          { key: 'osi', label: 'OSI', color: true },
          { key: 'obr', label: 'OBR', color: true },
          { key: 'rcv', label: 'RCV', color: true },
          { key: 'abq', label: 'ABQ', color: true }
        ];
      }

      if (SPLITS_STATE.sortKey) {
        rows.sort(function(a, b) {
          var av = parseFloat(a[SPLITS_STATE.sortKey]) || -999;
          var bv = parseFloat(b[SPLITS_STATE.sortKey]) || -999;
          return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
        });
      }

      mount.innerHTML = buildTable(rows, columns);
      attachTableSort(mount);
    } catch (err) {
      console.error('[SPLITS TEAM] crashed:', err.message, err.stack);
      mount.innerHTML = '<div style="color:red;padding:20px;">Splits render error: ' + esc(err.message) + '</div>';
    }
  }

  function renderSpSplits(mount) {
    var profiles = liveData().spProfiles || [];
    if (!profiles.length) {
      mount.innerHTML = '<div class="splits-empty">Loading pitcher data\u2026</div>';
      return;
    }
    var rows = profiles.map(function(p) {
      var m = S && S.spProfileMetrics ? S.spProfileMetrics(p) : {};
      return {
        pitcher_name: S ? S.pickCol(p, ['pitcher_name', 'Name']) : (p.pitcher_name || ''),
        pitcher_team: S ? S.pickCol(p, ['pitcher_team', 'Team']) : (p.pitcher_team || ''),
        pitcher_hand: String(S ? S.pickCol(p, ['hand', 'Hand']) : (p.hand || 'R')).charAt(0),
        ERA: m.era,
        K_pct: m.kPct,
        BB_pct: m.bbPct,
        HR9: m.hr9,
        OSI_allowed: m.osiAllowed,
        ABQ_allowed: m.abqAllowed,
        RCV_allowed: m.rcvAllowed,
        OBR_allowed: m.obrAllowed,
        PitchScore: m.pitchScore
      };
    });
    if (SPLITS_STATE.search) {
      rows = rows.filter(function(r) {
        var n = String(r.pitcher_name || '').toLowerCase();
        var t = String(r.pitcher_team || '').toLowerCase();
        return n.indexOf(SPLITS_STATE.search) >= 0 || t.indexOf(SPLITS_STATE.search) >= 0;
      });
    }
    var columns = SPLITS_STATE.statGroup === 'allowed'
      ? [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'OSI_allowed', label: 'OSI Allowed', color: true, invert: true },
        { key: 'ABQ_allowed', label: 'ABQ Allowed', color: true, invert: true },
        { key: 'RCV_allowed', label: 'RCV Allowed', color: true, invert: true },
        { key: 'OBR_allowed', label: 'OBR Allowed', color: true, invert: true }
      ]
      : [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'ERA', label: 'ERA', color: true, invert: true },
        { key: 'K_pct', label: 'K%', color: true },
        { key: 'BB_pct', label: 'BB%', color: true, invert: true },
        { key: 'HR9', label: 'HR/9', color: true, invert: true }
      ];
    mount.innerHTML = buildTable(rows, columns);
    attachTableSort(mount);
  }

  function renderBullpenSplits(mount) {
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
        eraOverall: parseFloat(unit.eraOverall) || null
      };
    });
    if (!bpRows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading bullpen data\u2026</div>';
      return;
    }
    if (SPLITS_STATE.search) {
      bpRows = bpRows.filter(function(r) {
        return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
      });
    }

    var isAllowed = SPLITS_STATE.statGroup === 'allowed';
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
        { key: 'eraOverall', label: 'ERA', color: true, invert: true },
        { key: 'hiLevEra', label: 'Hi Lev ERA', color: true, invert: true },
        { key: 'loLevEra', label: 'Lo Lev ERA', color: true, invert: true },
        { key: 'bullpenScore', label: 'Bullpen Score', color: true, ctx: 'osi' }
      ];

    mount.innerHTML = buildTable(bpRows, columns);
    attachTableSort(mount);
  }

  function initTrendsTab() {
    var mount = document.getElementById('rlTrendControlsMount');
    if (!mount) {
      console.error('[TRENDS] rlTrendControlsMount missing');
      return;
    }
    if (!mount.dataset.built) {
      mount.innerHTML = ''
        + '<div class="splits-controls trends-controls" id="trendsControlsRoot">'
        + '<div class="splits-control-row"><span class="splits-control-label">METRIC</span><div class="splits-pill-group">'
        + ['osi', 'abq', 'rcv', 'obr', 'pals'].map(function(m) {
          return '<button type="button" class="splits-pill trends-pill' + (TRENDS_STATE.metric === m ? ' trends-pill-active splits-pill-active' : '') + '" data-trends-metric="' + m + '">' + m.toUpperCase() + '</button>';
        }).join('')
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">HAND</span><div class="splits-pill-group">'
        + [{ v: 'b', l: 'Both' }, { v: 'r', l: 'vs RHP' }, { v: 'l', l: 'vs LHP' }].map(function(o) {
          return '<button type="button" class="splits-pill trends-pill' + (TRENDS_STATE.hand === o.v ? ' trends-pill-active splits-pill-active' : '') + '" data-trends-hand="' + o.v + '">' + o.l + '</button>';
        }).join('')
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">LOC</span><div class="splits-pill-group">'
        + [{ v: 'b', l: 'All' }, { v: 'home', l: 'Home' }, { v: 'away', l: 'Away' }].map(function(o) {
          return '<button type="button" class="splits-pill trends-pill' + (TRENDS_STATE.location === o.v ? ' trends-pill-active splits-pill-active' : '') + '" data-trends-location="' + o.v + '">' + o.l + '</button>';
        }).join('')
        + '</div></div></div>'
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
      var btn = e.target.closest('[data-trends-metric], [data-trends-hand], [data-trends-location]');
      if (!btn) return;
      if (btn.dataset.trendsMetric) {
        TRENDS_STATE.metric = btn.dataset.trendsMetric;
        activatePill(btn, '[data-trends-metric]', root);
        renderTrendHeatmap();
        return;
      }
      if (btn.dataset.trendsHand) {
        TRENDS_STATE.hand = btn.dataset.trendsHand;
        activatePill(btn, '[data-trends-hand]', root);
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

  function metricCellHtml(value, metric, isYtdFallback) {
    if (value == null || isNaN(value)) {
      return '<td style="color:#374151;text-align:right;padding:10px 12px;">\u2014</td>';
    }
    var color = '#F9FAFB';
    if (A && A.metricColor) {
      color = A.metricColor(value, metric || 'osi', false);
    }
    var display = Number(value).toFixed(1);
    var suffix = isYtdFallback ? ' <span style="color:#4B5563;font-size:10px;">YTD</span>' : '';
    return '<td style="color:' + color + ';font-weight:600;text-align:right;font-variant-numeric:tabular-nums;padding:10px 12px;">'
      + display + suffix + '</td>';
  }

  function teamCellHtml(t) {
    var logo = A ? A.teamLogoImg(t, 22) : '';
    return '<td style="padding:8px 12px;"><div style="display:flex;align-items:center;gap:8px;">'
      + logo + '<span style="font-weight:700;color:#F9FAFB;">' + esc(t) + '</span></div></td>';
  }

  function profileMetric(prof, mk, winKey) {
    if (!prof) return null;
    if (mk === 'osi') return num(prof['osi_' + winKey]);
    if (mk === 'abq') return num(prof['abq_' + winKey]);
    if (mk === 'rcv') return num(prof['rcv_' + winKey]);
    if (mk === 'obr') return num(prof['obr_' + winKey]);
    return num(prof['osi_' + winKey]);
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function metricFromRow(row, mk, palsMap) {
    if (mk === 'pals') return palsMap[row.t];
    return row[mk] != null ? row[mk] : row.osi;
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('rlTrendTableMount');
    if (!mount) return;

    var location = TRENDS_STATE.location || 'b';
    var hand = TRENDS_STATE.hand || 'b';
    var mk = TRENDS_STATE.metric || 'osi';
    var LD = liveData();
    var baseRows;
    var locFallback = false;

    if (location === 'home') {
      baseRows = aggregateHomeAway(LD.batterSplitsHome);
      if (!baseRows.length) {
        baseRows = getHandRows(hand);
        locFallback = true;
        showTrendsBanner('Home splits: showing YTD baseline');
      } else hideTrendsBanner();
    } else if (location === 'away') {
      baseRows = aggregateHomeAway(LD.batterSplitsAway);
      if (!baseRows.length) {
        baseRows = getHandRows(hand);
        locFallback = true;
        showTrendsBanner('Away splits: showing YTD baseline');
      } else hideTrendsBanner();
    } else {
      baseRows = getHandRows(hand);
      hideTrendsBanner();
    }

    if (!baseRows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading trends data\u2026</div>';
      return;
    }

    var palsMap = palsByTeam();
    var profMap = LD.teamProfilesByTeam || {};
    if (!Object.keys(profMap).length && (LD.teamProfiles || []).length) {
      LD.teamProfiles.forEach(function(p) {
        var t = String(p.team || p.Tm || p.Team || '').trim().toUpperCase();
        if (t) profMap[t] = p;
      });
    }

    var tableRows = baseRows.map(function(r) {
      var prof = profMap[r.t] || {};
      var ytd = metricFromRow(r, mk, palsMap);
      if (ytd == null || isNaN(ytd)) ytd = 0;
      var l30 = profileMetric(prof, mk, 'l30');
      var l14 = profileMetric(prof, mk, 'l14');
      var l7 = profileMetric(prof, mk, 'l7');
      return {
        t: r.t,
        ytd: ytd,
        l30: l30 != null ? l30 : ytd,
        l14: l14 != null ? l14 : ytd,
        l7: l7 != null ? l7 : ytd,
        l30Fb: l30 == null,
        l14Fb: l14 == null,
        l7Fb: l7 == null,
        locFallback: locFallback
      };
    });

    tableRows.sort(function(a, b) { return (b.l30 || 0) - (a.l30 || 0); });

    var header = '<thead><tr>'
      + '<th class="splits-th splits-th-name">Team</th>'
      + '<th class="splits-th splits-th-metric">L30</th>'
      + '<th class="splits-th splits-th-metric">L14</th>'
      + '<th class="splits-th splits-th-metric">L7</th>'
      + '</tr></thead>';
    var body = tableRows.map(function(row) {
      return '<tr class="splits-tr">'
        + teamCellHtml(row.t)
        + metricCellHtml(row.l30, mk, row.l30Fb || row.locFallback)
        + metricCellHtml(row.l14, mk, row.l14Fb || row.locFallback)
        + metricCellHtml(row.l7, mk, row.l7Fb || row.locFallback)
        + '</tr>';
    }).join('');

    mount.innerHTML = '<table class="splits-table">' + header + '<tbody>' + body + '</tbody></table>';
  }

  function palsByTeam() {
    var map = {};
    (liveData().pals || []).forEach(function(p) {
      var t = p.t || (S && S.pickCol ? teamKeyFromPals(p) : null);
      if (!t && p.team) t = String(p.team).trim().toUpperCase();
      if (t) map[t] = parseFloat(p.PALS != null ? p.PALS : p.pals);
    });
    return map;
  }

  function teamKeyFromPals(p) {
    return String(S.pickCol(p, ['team', 'Tm', 'Team', 't']) || '').trim().toUpperCase();
  }

  function cellColor(val, col) {
    if (val == null || val === '' || isNaN(val)) return '#374151';
    if (!col.color || !A || !A.metricColor) return '#F9FAFB';
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
    if (col.key === 'bullpenScore') {
      return A.metricColor(val, 'osi', false);
    }
    var metricKey = col.ctx || col.key;
    if (col.key === 'osiAllowed' || col.key === 'abqAllowed' || col.key === 'rcvAllowed' || col.key === 'obrAllowed') {
      metricKey = col.key.replace('Allowed', '').toLowerCase();
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
          return '<td class="splits-td splits-td-pitcher" style="color:#F9FAFB;">' + esc(row.pitcher_name || '') + '</td>';
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
          display = col.key === 'ERA' || col.key === 'eraOverall' || col.key === 'hiLevEra' || col.key === 'loLevEra'
            ? Number(val).toFixed(2)
            : (col.key === 'woba' || col.key === 'slg' ? Number(val).toFixed(3) : fmt(val));
          if (col.suffix) display += col.suffix;
        }
        var color = cellColor(val, col);
        return '<td class="splits-td splits-td-num" style="color:' + color + ';font-weight:600">' + display + '</td>';
      }).join('');
      return '<tr class="splits-tr">' + cells + '</tr>';
    }).join('');

    return '<table class="splits-table"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function syncGlobalBarToUix() {
    var st = global.STATE;
    if (!st) return;
    var sp = st.split || 'b';
    if (global.TRENDS_STATE) {
      if (sp === 'home' || sp === 'away') {
        global.TRENDS_STATE.location = sp;
        global.TRENDS_STATE.hand = 'b';
      } else {
        global.TRENDS_STATE.location = 'b';
        global.TRENDS_STATE.hand = sp;
      }
    }
    if (global.SPLITS_STATE) {
      if (sp === 'home' || sp === 'away' || sp === 'f5' || sp === 'r' || sp === 'l' || sp === 'b') {
        global.SPLITS_STATE.lineupSplit = sp;
        global.SPLITS_STATE.split = sp;
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
      SPLITS_STATE.entity = 'team';
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
