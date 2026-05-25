// rl_tab_uix.js - rebuilt from scratch
'use strict';

var SPLITS_STATE = {
  entity: 'team',
  statGroup: 'created',
  split: 'b',
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

  function getSplitsTeamScores() {
    var LD = global.LIVE_DATA || {};
    var rhp = LD.scYtdR || global.SCO_YTD_R || LD.vsRhp || LD.rhpScores || (global.RL_DATA && global.RL_DATA.rhp) || [];
    var lhp = LD.scYtdL || global.SCO_YTD_L || LD.vsLhp || LD.lhpScores || (global.RL_DATA && global.RL_DATA.lhp) || [];
    return { rhp: rhp, lhp: lhp };
  }

  function activatePill(btn, selector, root) {
    (root || document).querySelectorAll(selector).forEach(function(p) {
      p.classList.remove('splits-pill-active', 'trends-pill-active');
    });
    btn.classList.add(btn.hasAttribute('data-splits-entity') || btn.hasAttribute('data-splits-statgroup') || btn.hasAttribute('data-splits-split') || btn.hasAttribute('data-splits-window') ? 'splits-pill-active' : 'trends-pill-active');
  }

  /* FUNCTION 1 */
  function initSplitsTab() {
    var controlMount = document.getElementById('rlSplitsControlMount');
    var tableMount = document.getElementById('rlSplitsTableMount');
    if (!controlMount || !tableMount) {
      console.error('[SPLITS] mount missing');
      return;
    }
    if (!controlMount.dataset.built) {
      controlMount.innerHTML = ''
        + '<div class="splits-controls" id="splitsControlsRoot">'
        + '<div class="splits-control-row"><span class="splits-control-label">VIEW</span><div class="splits-pill-group">'
        + '<button type="button" class="splits-pill splits-pill-active" data-splits-entity="team">Team Offense</button>'
        + '<button type="button" class="splits-pill" data-splits-entity="sp">Starting Pitchers</button>'
        + '<button type="button" class="splits-pill" data-splits-entity="bullpen">Bullpen</button>'
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">STATS</span><div class="splits-pill-group" id="splitsStatPills">'
        + '<button type="button" class="splits-pill splits-pill-active" data-splits-statgroup="created" data-for-entity="team">Created</button>'
        + '<button type="button" class="splits-pill" data-splits-statgroup="standard" data-for-entity="team">Standard</button>'
        + '<button type="button" class="splits-pill" data-splits-statgroup="allowed" data-for-entity="sp">Allowed</button>'
        + '<button type="button" class="splits-pill" data-splits-statgroup="standard" data-for-entity="sp">SP Standard</button>'
        + '<button type="button" class="splits-pill" data-splits-statgroup="standard" data-for-entity="bullpen">BP Standard</button>'
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">SPLIT</span><div class="splits-pill-group" id="splitsSplitPills">'
        + '<button type="button" class="splits-pill splits-pill-active" data-splits-split="b" data-for-entity="team">Both</button>'
        + '<button type="button" class="splits-pill" data-splits-split="r" data-for-entity="team">vs RHP</button>'
        + '<button type="button" class="splits-pill" data-splits-split="l" data-for-entity="team">vs LHP</button>'
        + '<button type="button" class="splits-pill" data-splits-split="overall" data-for-entity="sp,bullpen">Overall</button>'
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">WINDOW</span><div class="splits-pill-group">'
        + '<button type="button" class="splits-pill splits-pill-active" data-splits-window="ytd">YTD</button>'
        + '<button type="button" class="splits-pill" data-splits-window="l30">L30</button>'
        + '<button type="button" class="splits-pill" data-splits-window="l14">L14</button>'
        + '<button type="button" class="splits-pill" data-splits-window="l7">L7</button>'
        + '</div></div>'
        + '<div class="splits-control-row"><span class="splits-control-label">FILTER</span>'
        + '<input type="search" id="splitsSearch" class="splits-search" placeholder="Search team or pitcher...">'
        + '</div><div class="splits-confirm" id="splitsConfirmLine"></div>'
        + '</div>';
      controlMount.dataset.built = '1';
      bindSplitsControls();
    }
    var searchEl = document.getElementById('splitsSearch');
    if (searchEl) searchEl.value = SPLITS_STATE.search || '';
    renderSplitsTable();
  }

  /* FUNCTION 2 */
  function bindSplitsControls() {
    var root = document.getElementById('splitsControlsRoot');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-splits-entity], button[data-splits-statgroup], button[data-splits-split], button[data-splits-window]');
      if (!btn) return;

      if (btn.dataset.splitsEntity) {
        console.log('[SPLITS] pill clicked: entity', btn.dataset.splitsEntity);
        SPLITS_STATE.entity = btn.dataset.splitsEntity;
        activatePill(btn, '[data-splits-entity]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsStatgroup) {
        console.log('[SPLITS] pill clicked: statGroup', btn.dataset.splitsStatgroup);
        SPLITS_STATE.statGroup = btn.dataset.splitsStatgroup;
        activatePill(btn, '[data-splits-statgroup]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsSplit) {
        console.log('[SPLITS] pill clicked: split', btn.dataset.splitsSplit);
        SPLITS_STATE.split = btn.dataset.splitsSplit;
        activatePill(btn, '[data-splits-split]', root);
        renderSplitsTable();
        return;
      }
      if (btn.dataset.splitsWindow) {
        console.log('[SPLITS] pill clicked: window', btn.dataset.splitsWindow);
        SPLITS_STATE.window = btn.dataset.splitsWindow;
        activatePill(btn, '[data-splits-window]', root);
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

  /* FUNCTION 3 */
  function renderSplitsTable() {
    console.log('[SPLITS] render called:', JSON.stringify(SPLITS_STATE));
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) {
      console.error('[SPLITS] mount not found');
      return;
    }
    var confirm = document.getElementById('splitsConfirmLine');
    if (confirm) {
      confirm.textContent = 'Showing: ' + SPLITS_STATE.entity + ' \u00B7 ' + SPLITS_STATE.statGroup + ' \u00B7 ' + SPLITS_STATE.split + ' \u00B7 ' + SPLITS_STATE.window;
    }
    if (SPLITS_STATE.entity === 'team') renderTeamSplits(mount);
    else if (SPLITS_STATE.entity === 'sp') renderSpSplits(mount);
    else if (SPLITS_STATE.entity === 'bullpen') renderBullpenSplits(mount);
  }

  /* FUNCTION 4 */
  function renderTeamSplits(mount) {
    var scores = getSplitsTeamScores();
    var rhp = scores.rhp;
    var lhp = scores.lhp;
    console.log('[SPLITS TEAM] scYtdR:', rhp.length, 'scYtdL:', lhp.length, 'split:', SPLITS_STATE.split);

    if (!rhp.length) {
      mount.innerHTML = '<div class="splits-empty">Loading team data\u2026 (scYtdR: 0 rows)</div>';
      return;
    }

    var rows;
    if (SPLITS_STATE.split === 'r') rows = rhp.slice();
    else if (SPLITS_STATE.split === 'l') rows = lhp.length ? lhp.slice() : rhp.slice();
    else {
      var lm = {};
      lhp.forEach(function(r) { lm[r.t] = r; });
      rows = rhp.map(function(r) {
        var l = lm[r.t] || r;
        return {
          t: r.t,
          osi: ((parseFloat(r.osi) || 0) + (parseFloat(l.osi) || 0)) / 2,
          obr: ((parseFloat(r.obr) || 0) + (parseFloat(l.obr) || 0)) / 2,
          rcv: ((parseFloat(r.rcv) || 0) + (parseFloat(l.rcv) || 0)) / 2,
          abq: ((parseFloat(r.abq) || 0) + (parseFloat(l.abq) || 0)) / 2,
          woba: r.woba != null ? r.woba : r.wOBA,
          wrc: r.wrc,
          slg: r.slg
        };
      });
    }

    var palsMap = palsByTeam();
    rows = rows.map(function(r) {
      return Object.assign({}, r, { pals: palsMap[r.t] });
    });

    if (SPLITS_STATE.search) {
      rows = rows.filter(function(r) {
        return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
      });
    }

    if (SPLITS_STATE.sortKey) {
      rows.sort(function(a, b) {
        var av = parseFloat(a[SPLITS_STATE.sortKey]) || -999;
        var bv = parseFloat(b[SPLITS_STATE.sortKey]) || -999;
        return SPLITS_STATE.sortDir === 'asc' ? av - bv : bv - av;
      });
    }

    var columns = [
      { key: 't', label: 'Team', type: 'team' },
      { key: 'osi', label: 'OSI', color: true },
      { key: 'obr', label: 'OBR', color: true },
      { key: 'rcv', label: 'RCV', color: true },
      { key: 'abq', label: 'ABQ', color: true },
      { key: 'pals', label: 'PALS', color: true }
    ];
    if (SPLITS_STATE.statGroup === 'standard') {
      columns = [
        { key: 't', label: 'Team', type: 'team' },
        { key: 'wrc', label: 'wRC+', color: true, leagueAvg: 100 },
        { key: 'woba', label: 'wOBA', color: true, ctx: 'woba' },
        { key: 'slg', label: 'SLG', color: true, ctx: 'slg' }
      ];
    }

    mount.innerHTML = buildTable(rows, columns);
    mount.querySelectorAll('[data-sort-key]').forEach(function(th) {
      th.addEventListener('click', function() {
        var key = th.getAttribute('data-sort-key');
        if (SPLITS_STATE.sortKey === key) {
          SPLITS_STATE.sortDir = SPLITS_STATE.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          SPLITS_STATE.sortKey = key;
          SPLITS_STATE.sortDir = 'desc';
        }
        renderSplitsTable();
      });
    });
  }

  /* FUNCTION 5 */
  function renderSpSplits(mount) {
    var profiles = (global.LIVE_DATA && global.LIVE_DATA.spProfiles) || [];
    console.log('[SPLITS SP] profiles:', profiles.length);
    if (!profiles.length) {
      mount.innerHTML = '<div class="splits-empty">Loading pitcher data\u2026 (spProfiles: 0)</div>';
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
        OSI_allowed: m.osiAllowed,
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
        { key: 'PitchScore', label: 'Pitch Score', color: true },
        { key: 'OSI_allowed', label: 'OSI Allowed', color: true, invert: true }
      ]
      : [
        { key: 'pitcher_name', label: 'Pitcher', type: 'pitcher' },
        { key: 'pitcher_team', label: 'Team', type: 'teamBadge' },
        { key: 'ERA', label: 'ERA', color: true, invert: true },
        { key: 'K_pct', label: 'K%', color: true }
      ];
    mount.innerHTML = buildTable(rows, columns);
  }

  /* FUNCTION 6 */
  function renderBullpenSplits(mount) {
    var units = (global.LIVE_DATA && global.LIVE_DATA.bullpenUnits) || {};
    var rows = Object.entries(units).map(function(entry) {
      var u = entry[1] || {};
      return {
        t: entry[0],
        bullpenScore: u.bullpenScore,
        osiAllowed: u.osiAllowed,
        rcvAllowed: u.rcvAllowed,
        obrAllowed: u.obrAllowed,
        hiLevEra: u.hiLevEra,
        loLevEra: u.loLevEra
      };
    });
    console.log('[SPLITS BULLPEN] rows:', rows.length, 'first osiAllowed:', rows[0] && rows[0].osiAllowed);
    if (!rows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading bullpen data\u2026 (bullpenUnits: 0)</div>';
      return;
    }
    if (SPLITS_STATE.search) {
      rows = rows.filter(function(r) {
        return String(r.t || '').toLowerCase().indexOf(SPLITS_STATE.search) >= 0;
      });
    }
    rows.sort(function(a, b) { return (b.bullpenScore || 0) - (a.bullpenScore || 0); });
    var columns = [
      { key: 't', label: 'Team', type: 'team' },
      { key: 'bullpenScore', label: 'BP Score', color: true },
      { key: 'osiAllowed', label: 'OSI Allowed', color: true, invert: true },
      { key: 'rcvAllowed', label: 'RCV Allowed', color: true, invert: true },
      { key: 'obrAllowed', label: 'OBR Allowed', color: true, invert: true },
      { key: 'hiLevEra', label: 'Hi Lev ERA', invert: true },
      { key: 'loLevEra', label: 'Lo Lev ERA', invert: true }
    ];
    mount.innerHTML = buildTable(rows, columns);
  }

  /* FUNCTION 7 */
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

  /* FUNCTION 8 */
  function bindTrendsControls() {
    var root = document.getElementById('trendsControlsRoot');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    root.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-trends-metric], [data-trends-hand], [data-trends-location]');
      if (!btn) return;
      if (btn.dataset.trendsMetric) {
        console.log('[TRENDS] pill clicked: metric', btn.dataset.trendsMetric);
        TRENDS_STATE.metric = btn.dataset.trendsMetric;
        activatePill(btn, '[data-trends-metric]', root);
        renderTrendHeatmap();
        return;
      }
      if (btn.dataset.trendsHand) {
        console.log('[TRENDS] pill clicked: hand', btn.dataset.trendsHand);
        TRENDS_STATE.hand = btn.dataset.trendsHand;
        activatePill(btn, '[data-trends-hand]', root);
        renderTrendHeatmap();
        return;
      }
      if (btn.dataset.trendsLocation) {
        console.log('[TRENDS] pill clicked: location', btn.dataset.trendsLocation);
        TRENDS_STATE.location = btn.dataset.trendsLocation;
        activatePill(btn, '[data-trends-location]', root);
        renderTrendHeatmap();
      }
    });
  }

  /* FUNCTION 9 */
  function renderTrendHeatmap() {
    console.log('[TRENDS] render:', JSON.stringify(TRENDS_STATE));
    var mount = document.getElementById('rlTrendTableMount');
    if (!mount) return;

    var LD = global.LIVE_DATA || {};
    var rhp = LD.scYtdR || [];
    var lhp = LD.scYtdL || [];
    var rows;
    if (TRENDS_STATE.hand === 'r') rows = rhp.slice();
    else if (TRENDS_STATE.hand === 'l') rows = lhp.length ? lhp.slice() : rhp.slice();
    else {
      var lm = {};
      lhp.forEach(function(r) { lm[r.t] = r; });
      rows = rhp.map(function(r) {
        var l = lm[r.t] || r;
        return {
          t: r.t,
          osi: ((parseFloat(r.osi) || 0) + (parseFloat(l.osi) || 0)) / 2,
          abq: ((parseFloat(r.abq) || 0) + (parseFloat(l.abq) || 0)) / 2,
          rcv: ((parseFloat(r.rcv) || 0) + (parseFloat(l.rcv) || 0)) / 2,
          obr: ((parseFloat(r.obr) || 0) + (parseFloat(l.obr) || 0)) / 2
        };
      });
    }
    console.log('[TRENDS] rows:', rows.length);

    if (!rows.length) {
      mount.innerHTML = '<div class="splits-empty">Loading trends data\u2026</div>';
      return;
    }

    var palsMap = palsByTeam();
    var mk = TRENDS_STATE.metric;
    var tableRows = rows.map(function(r) {
      var ytd;
      if (mk === 'pals') ytd = palsMap[r.t];
      else if (mk === 'osi') ytd = r.osi;
      else if (mk === 'abq') ytd = r.abq;
      else if (mk === 'rcv') ytd = r.rcv;
      else if (mk === 'obr') ytd = r.obr;
      else ytd = r.osi;
      if (ytd == null || isNaN(ytd)) ytd = 0;
      var rel = r.reg || r.reg_signal || 'Stable';
      return {
        t: r.t,
        l30: ytd,
        l14: ytd,
        l7: ytd,
        reliability: rel
      };
    });

    tableRows.sort(function(a, b) { return (b.l30 || 0) - (a.l30 || 0); });

    var columns = [
      { key: 't', label: 'Team', type: 'team' },
      { key: 'l30', label: 'L30', suffix: ' (YTD)' },
      { key: 'l14', label: 'L14', suffix: ' (YTD)' },
      { key: 'l7', label: 'L7', suffix: ' (YTD)' },
      { key: 'reliability', label: 'Reliability', type: 'text' }
    ];
    mount.innerHTML = buildTable(tableRows, columns);
  }

  /* FUNCTION 10 */
  function palsByTeam() {
    var map = {};
    (global.LIVE_DATA && global.LIVE_DATA.pals || []).forEach(function(p) {
      map[p.t] = parseFloat(p.PALS);
    });
    return map;
  }

  /* FUNCTION 11 */
  function buildTable(rows, columns) {
    if (!rows.length) return '<div class="splits-empty">No data matches current filters.</div>';

    var header = columns.map(function(col) {
      if (col.type === 'team' || col.type === 'pitcher') {
        return '<th class="splits-th splits-th-name">' + esc(col.label) + '</th>';
      }
      if (col.type === 'text') {
        return '<th class="splits-th splits-th-name">' + esc(col.label) + '</th>';
      }
      return '<th class="splits-th splits-th-metric" data-sort-key="' + esc(col.key) + '">' + esc(col.label) + '</th>';
    }).join('');

    var body = rows.map(function(row) {
      var cells = columns.map(function(col) {
        if (col.type === 'team') {
          return '<td class="splits-td splits-td-team"><span class="splits-team-abbr">' + esc(row.t) + '</span>'
            + (A ? A.teamLogoImg(row.t, 22) : '') + '</td>';
        }
        if (col.type === 'pitcher') {
          return '<td class="splits-td splits-td-pitcher">' + esc(row.pitcher_name || '') + '</td>';
        }
        if (col.type === 'teamBadge') {
          return '<td class="splits-td">' + (A ? A.teamLogoImg(row.pitcher_team, 18) : '') + '</td>';
        }
        if (col.type === 'text') {
          return '<td class="splits-td">' + esc(row[col.key] != null ? row[col.key] : '\u2014') + '</td>';
        }
        var val = row[col.key];
        if (val == null || val === '' || isNaN(val)) val = 0;
        var display = col.key === 'ERA' || col.key === 'hiLevEra' || col.key === 'loLevEra'
          ? Number(val).toFixed(2)
          : (col.key === 'woba' || col.key === 'slg' ? Number(val).toFixed(3) : fmt(val));
        if (col.suffix) display += col.suffix;
        var color = '#D1D5DB';
        if (col.color && A && A.metricColor) {
          color = A.metricColor(val, col.ctx || col.key, !!col.invert);
        }
        if (col.leagueAvg != null && A && A.metricColor) {
          var z = (val - col.leagueAvg) / 15;
          color = A.metricColor(Math.max(0, Math.min(100, 50 + z * 25)), 'osi', false);
        }
        return '<td class="splits-td splits-td-num" style="color:' + color + ';font-weight:600">' + display + '</td>';
      }).join('');
      return '<tr class="splits-tr">' + cells + '</tr>';
    }).join('');

    return '<table class="splits-table"><thead><tr>' + header + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  if (RL) {
    RL.initSplitsTab = initSplitsTab;
    RL.initTrendsTab = initTrendsTab;
    RL.renderSplitsTable = renderSplitsTable;
    RL.renderTrendHeatmap = renderTrendHeatmap;
    RL.initSplitsControls = initSplitsTab;
    global.initSplitsTab = initSplitsTab;
    global.renderTrendHeatmap = renderTrendHeatmap;
    global.renderSplitsTable = renderSplitsTable;
    global.renderTeamOffenseSplits = function() { SPLITS_STATE.entity = 'team'; renderSplitsTable(); };

    var prevOnSubtab = RL.onSubtab;
    console.log('[RL UIX] wrapping RL.onSubtab, prevOnSubtab:', typeof prevOnSubtab);
    RL.onSubtab = function(name) {
      if (name === 'splits') {
        console.log('[SPLITS] tab clicked');
        console.log('[SPLITS] controlMount:', document.getElementById('rlSplitsControlMount'));
        console.log('[SPLITS] tableMount:', document.getElementById('rlSplitsTableMount'));
        console.log('[SPLITS] SPLITS_STATE:', JSON.stringify(SPLITS_STATE));
        var LD = global.LIVE_DATA || {};
        console.log('[SPLITS] scYtdR:', LD.scYtdR ? LD.scYtdR.length : 0, 'SCO_YTD_R:', global.SCO_YTD_R ? global.SCO_YTD_R.length : 0);
        console.log('[SPLITS] initSplitsTab called from onSubtab wrap');
        initSplitsTab();
      } else if (name === 'trends') initTrendsTab();
      else if (prevOnSubtab) prevOnSubtab(name);
    };

    global.refreshSplitsIfVisible = function() {
      var pane = document.getElementById('pane-splits');
      if (pane && pane.style.display !== 'none') renderSplitsTable();
    };
  }
})(typeof window !== 'undefined' ? window : this);
