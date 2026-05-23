/**
 * Research Lab tab UIX — trends heatmap, splits tables, compare enhancements.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var RL = global.ResearchLab;
  var TABS = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
  var _teamF5OsiMap = null;

  if (!RL) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v) {
    return v != null && !isNaN(v) ? Number(v).toFixed(1) : '—';
  }

  function mColor(v, invert, ctx) {
    if (!A || !A.metricColor) return '#71717A';
    if (ctx === 'delta') {
      if (v == null || isNaN(v)) return '#71717A';
      if (v > 0) return '#4ADE80';
      if (v < 0) return '#F87171';
      return '#71717A';
    }
    if (ctx === 'ppGap') return A.ppGapColor ? A.ppGapColor(v) : '#71717A';
    if (ctx === 'oor' || ctx === 'OOR') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    var inv = !!invert || (ctx && /allowed/i.test(String(ctx)));
    return A.metricColor(v, ctx || 'osi', inv);
  }

  function metricKey(metric) {
    var m = (metric || 'osi').toLowerCase();
    return { osi: 'osi', abq: 'abq', rcv: 'rcv', obr: 'obr' }[m] || 'osi';
  }

  function metricCap(metric) {
    var k = metricKey(metric);
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function windowVal(d, metric, win) {
    var k = metricKey(metric);
    var cap = metricCap(metric);
    if (win === 'YTD') return d[k] != null ? d[k] : d.osi;
    if (metric !== 'osi') return null;
    var profs = global.LIVE_DATA && LIVE_DATA.teamProfilesByTeam;
    var p = profs && profs[d.t];
    if (p) {
      if (win === 'L30' && p.osi_l30 != null) return p.osi_l30;
      if (win === 'L14' && p.osi_l14 != null) return p.osi_l14;
      if (win === 'L7' && p.osi_l7 != null) return p.osi_l7;
    }
    if (win === 'L30') return d['l30' + cap] != null ? d['l30' + cap] : d.l30OSI;
    if (win === 'L14') return d['l14' + cap] != null ? d['l14' + cap] : d.l14OSI;
    if (win === 'L7') return d['l7' + cap] != null ? d['l7' + cap] : d.l7OSI;
    return null;
  }

  function reliabilityLabel(ytd, l14, l7) {
    if (ytd == null || l14 == null || l7 == null) return { label: 'Mixed', cls: 'rl-badge-gray' };
    var near = function(a, b) { return Math.abs(a - b) <= 2; };
    if (l14 > ytd + 3 && l7 > ytd + 3) return { label: 'Sustained Rise', cls: 'rl-badge-green' };
    if (l7 > ytd + 5 && near(l14, ytd)) return { label: 'Short Spike', cls: 'rl-badge-amber' };
    if (l14 < ytd - 3) return { label: 'Cooling Risk', cls: 'rl-badge-red' };
    if (l7 < ytd - 5 && near(l14, ytd)) return { label: 'Noisy L7 Drop', cls: 'rl-badge-amber' };
    if (Math.abs(l7 - ytd) <= 3 && Math.abs(l14 - ytd) <= 3) {
      return { label: 'Stable', cls: 'rl-badge-gray' };
    }
    return { label: 'Mixed', cls: 'rl-badge-gray' };
  }

  function platoonLabel(rVal, lVal) {
    if (rVal == null || lVal == null) return 'Balanced';
    var edge = rVal - lVal;
    if (Math.abs(edge) < 5) return 'Balanced';
    if (edge > 10) return 'RHP Crusher';
    if (edge < -10) return 'LHP Crusher';
    return 'Split Dependent';
  }

  function splitEdgeStyle(edge) {
    var a = Math.abs(edge);
    if (a > 15) return 'color:#F87171;font-weight:700';
    if (a > 10) return 'color:#FBBF24;font-weight:700';
    return 'color:' + mColor(edge, false, 'ppGap') + ';font-weight:600';
  }

  function numOrNull(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function loadTeamF5OsiMap() {
    if (_teamF5OsiMap) return Promise.resolve(_teamF5OsiMap);
    if (!S || !TABS || !TABS.team_profiles) return Promise.resolve({});
    return S.fetchSheetTab(TABS.team_profiles).then(function(rows) {
      var map = {};
      (rows || []).forEach(function(row) {
        var t = String(S.pickCol(row, 'team', 'Tm', 'Team') || '').toUpperCase();
        if (!t) return;
        map[t] = numOrNull(S.pickCol(row, ['osi_f5', 'OSI_F5', 'osi_F5']));
      });
      _teamF5OsiMap = map;
      return map;
    }).catch(function() {
      _teamF5OsiMap = {};
      return _teamF5OsiMap;
    });
  }

  function f5OsiForTeam(team) {
    var t = String(team || '').toUpperCase();
    var map = _teamF5OsiMap;
    if (map && map[t] != null) return map[t];
    return null;
  }

  function ensureTrendState() {
    if (!global.STATE) global.STATE = {};
    if (!global.STATE.rlTrendMetric) global.STATE.rlTrendMetric = 'osi';
    if (!global.STATE.rlTrendSplit) global.STATE.rlTrendSplit = 'b';
    if (!global._rlSplitEntity) global._rlSplitEntity = 'team';
    if (!global._rlSplitMetric) global._rlSplitMetric = 'osi';
  }

  function mountTrendControls() {
    var mount = document.getElementById('rlTrendControlsMount');
    if (!mount) return;
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var split = global.STATE.rlTrendSplit || 'b';
    mount.innerHTML = '<div class="rl-tab-controls">'
      + '<div class="rl-pill-row rl-pill-row--primary">'
      + '<span class="ca-pill-label">Metric</span>'
      + ['osi', 'abq', 'rcv', 'obr'].map(function(m) {
        return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-trend-metric="' + m + '">' + m.toUpperCase() + '</button>';
      }).join('')
      + '</div><div class="rl-pill-row">'
      + '<span class="ca-pill-label">Split</span>'
      + [{ id: 'b', l: 'Both' }, { id: 'r', l: 'vs RHP' }, { id: 'l', l: 'vs LHP' }].map(function(s) {
        return '<button type="button" class="ca-pill-btn' + (split === s.id ? ' active' : '') + '" data-trend-split="' + s.id + '">' + s.l + '</button>';
      }).join('')
      + '</div></div>';
    mount.querySelectorAll('[data-trend-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendMetric = btn.getAttribute('data-trend-metric');
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
    mount.querySelectorAll('[data-trend-split]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global.STATE.rlTrendSplit = btn.getAttribute('data-trend-split');
        mountTrendControls();
        renderTrendHeatmap();
        renderTrendSummary();
      });
    });
  }

  function renderTrendHeatmap() {
    var mount = document.getElementById('trendMap');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    console.log('[TRENDS] L30 data available:', global.SCO_L30_B ? global.SCO_L30_B.length : 'missing');
    console.log('[TRENDS] L14 data available:', global.SCO_L14_B ? global.SCO_L14_B.length : 'missing');
    console.log('[TRENDS] L7 data available:', global.SCO_L7_B ? global.SCO_L7_B.length : 'missing');
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var split = global.STATE.rlTrendSplit || 'b';
    var rows = RL.getResearchTeamData(split === 'r' ? 'r' : split === 'l' ? 'l' : 'both');
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">Team offense data is loading — check vs_RHP / vs_LHP sheets.</p>';
      return;
    }
    var sorted = rows.slice().sort(function(a, b) {
      return (windowVal(b, metric, 'YTD') || 0) - (windowVal(a, metric, 'YTD') || 0);
    });
    var html = '<table class="rl-table-premium rl-trend-table"><thead><tr>'
      + '<th>Team</th><th>YTD</th><th>L30</th><th>L14</th><th>L7</th><th>Δ L14</th><th>Δ L7</th><th>Velocity</th><th>Reliability</th>'
      + '</tr></thead><tbody>';
    sorted.forEach(function(d) {
      var ytd = windowVal(d, metric, 'YTD');
      var l30 = windowVal(d, metric, 'L30');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      var d14 = (l14 != null && ytd != null) ? l14 - ytd : null;
      var d7 = (l7 != null && ytd != null) ? l7 - ytd : null;
      var velocity = (d7 != null && d14 != null) ? d7 - d14 : null;
      var rel = reliabilityLabel(ytd, l14, l7);
      var logo = A ? A.teamLogoImg(d.t, 22) : '';
      html += '<tr class="rl-row-click" data-team="' + esc(d.t) + '">'
        + '<td class="rl-team-cell">' + logo + ' <strong>' + esc(d.t) + '</strong></td>'
        + cell(ytd, metric, false)
        + cell(l30, metric, false)
        + cell(l14, metric, false)
        + cell(l7, metric, false)
        + deltaCell(d14)
        + deltaCell(d7)
        + deltaCell(velocity)
        + '<td><span class="rl-reliability-badge ' + rel.cls + '">' + esc(rel.label) + '</span></td></tr>';
    });
    html += '</tbody></table>';
    mount.innerHTML = html;
    mount.querySelectorAll('.rl-row-click').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var t = tr.getAttribute('data-team');
        if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
      });
    });
  }

  function cell(v, metric, inv) {
    if (v == null || isNaN(v)) return '<td class="num rl-na" title="requires pipeline run">—</td>';
    return '<td class="num" style="color:' + mColor(v, inv, metricKey(metric)) + '">' + fmt(v) + '</td>';
  }

  function deltaCell(v) {
    if (v == null || isNaN(v)) return '<td class="num">—</td>';
    var prefix = v > 0 ? '+' : '';
    return '<td class="num" style="color:' + mColor(v, false, 'delta') + '">' + prefix + fmt(v) + '</td>';
  }

  function renderTrendSummary() {
    var html = trendSummaryHtml();
    ['rlTrendSummaryMount', 'homeTrendSummaryMount'].forEach(function(id) {
      var mount = document.getElementById(id);
      if (mount) mount.innerHTML = html;
    });
  }

  function trendSummaryHtml() {
    ensureTrendState();
    var metric = global.STATE.rlTrendMetric;
    var rows = RL.getResearchTeamData('both');
    if (!rows.length) return '';
    var enriched = rows.map(function(d) {
      var ytd = windowVal(d, metric, 'YTD');
      var l14 = windowVal(d, metric, 'L14');
      var l7 = windowVal(d, metric, 'L7');
      return { t: d.t, ytd: ytd, l14: l14, l7: l7, d14: (l14 != null && ytd != null) ? l14 - ytd : null };
    });
    var risers = enriched.filter(function(x) { return x.d14 != null && x.d14 > 0; })
      .sort(function(a, b) { return b.d14 - a.d14; }).slice(0, 3);
    var fallers = enriched.filter(function(x) { return x.d14 != null && x.d14 < 0; })
      .sort(function(a, b) { return a.d14 - b.d14; }).slice(0, 3);
    var hotL7 = enriched.filter(function(x) {
      return x.l7 != null && x.ytd != null && x.l7 > x.ytd + 6;
    }).sort(function(a, b) { return (b.l7 - b.ytd) - (a.l7 - a.ytd); }).slice(0, 3);
    var stable = enriched.filter(function(x) {
      if (x.ytd == null || x.l14 == null || x.l7 == null) return false;
      return Math.abs(x.l7 - x.ytd) <= 3 && Math.abs(x.l14 - x.ytd) <= 3;
    }).slice(0, 3);
    return trendCard('Biggest Risers', risers, function(x) { return '+' + x.d14.toFixed(1); })
      + trendCard('Biggest Fallers', fallers, function(x) { return x.d14.toFixed(1); })
      + trendCard('Hot L7 Spike', hotL7, function(x) { return 'L7 +' + (x.l7 - x.ytd).toFixed(1); })
      + trendCard('Most Stable', stable, function() { return '±3'; });
  }

  function trendCard(title, items, valueFn) {
    var meta = {
      'Biggest Risers': { variant: 'risers', subtitle: 'L14 improvement vs YTD baseline' },
      'Biggest Fallers': { variant: 'fallers', subtitle: 'L14 decline vs YTD baseline' },
      'Hot L7 Spike': { variant: 'hot', subtitle: 'Recent L7 surge — may be noisy' },
      'Most Stable': { variant: 'stable', subtitle: 'All windows within ±3 of YTD' }
    }[title] || { variant: 'stable', subtitle: '' };
    var body = '';
    if (items.length) {
      body = '<div class="rl-summary-chips">' + items.map(function(x) {
        var logo = A && A.teamLogoImg ? A.teamLogoImg(x.t, 16, 'rl-summary-team-logo') : '';
        return '<span class="rl-summary-chip">' + logo
          + '<span class="rl-summary-chip-abbr">' + esc(x.t) + '</span>'
          + '<span class="rl-summary-chip-val">' + esc(valueFn(x)) + '</span></span>';
      }).join('') + '</div>';
    } else {
      body = '<div class="rl-summary-empty"><span class="rl-summary-empty-icon" aria-hidden="true"></span>'
        + '<span>No signal yet — waiting for pipeline data</span></div>';
    }
    return '<div class="rl-summary-card rl-summary-card--' + meta.variant + '">'
      + '<div class="rl-summary-head"><span class="rl-summary-icon" aria-hidden="true"></span>'
      + '<div><div class="rl-summary-label">' + esc(title) + '</div>'
      + '<div class="rl-summary-sub">' + esc(meta.subtitle) + '</div></div></div>'
      + body + '</div>';
  }

  function mountSplitsControls() {
    var mount = document.getElementById('rlSplitsControlMount');
    if (!mount) return;
    ensureTrendState();
    var entity = global._rlSplitEntity || 'team';
    var metric = global._rlSplitMetric || 'osi';
    mount.innerHTML = '<div class="rl-pill-row rl-pill-row--primary">'
      + [{ id: 'team', l: 'Team Offense' }, { id: 'sp', l: 'Starting Pitcher' }, { id: 'bp', l: 'Bullpen' }].map(function(e) {
        return '<button type="button" class="ca-pill-btn' + (entity === e.id ? ' active' : '') + '" data-split-entity="' + e.id + '">' + e.l + '</button>';
      }).join('')
      + '</div>'
      + (entity === 'team' ? '<div class="rl-pill-row rl-pill-row--secondary">'
        + '<span class="ca-pill-label">Metric</span>'
        + ['osi', 'abq', 'rcv', 'obr'].map(function(m) {
          return '<button type="button" class="ca-pill-btn' + (metric === m ? ' active' : '') + '" data-split-metric="' + m + '">' + m.toUpperCase() + '</button>';
        }).join('') + '</div>' : '');
    var confirm = document.getElementById('rlSplitsConfirm');
    if (confirm) {
      var entLbl = { team: 'Team Offense', sp: 'Starting Pitcher', bp: 'Bullpen' }[entity];
      confirm.textContent = 'Showing: ' + entLbl + ' · ' + (entity === 'team' ? metric.toUpperCase() : 'OSI Allowed') + ' · Both splits';
    }
    mount.querySelectorAll('[data-split-entity]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitEntity = btn.getAttribute('data-split-entity');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
    mount.querySelectorAll('[data-split-metric]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        global._rlSplitMetric = btn.getAttribute('data-split-metric');
        mountSplitsControls();
        renderSplitsTable();
      });
    });
  }

  function renderSplitsTable() {
    var mount = document.getElementById('rlSplitsTableMount');
    if (!mount) return;
    RL.syncResearchGlobalsFromLiveData();
    ensureTrendState();
    var entity = global._rlSplitEntity || 'team';
    var metric = global._rlSplitMetric || 'osi';
    mount.innerHTML = '<p class="rl-loading">Loading split data…</p>';
    if (entity === 'team') {
      var r = RL.getResearchTeamData('r');
      var l = RL.getResearchTeamData('l');
      loadTeamF5OsiMap().then(function() {
        var rows = r.map(function(row) {
          var lrow = l.find(function(x) { return x.t === row.t; }) || {};
          var rv = row[metric];
          var lv = lrow[metric];
          return {
            t: row.t, rv: rv, lv: lv,
            f5: f5OsiForTeam(row.t),
            edge: (rv != null && lv != null) ? rv - lv : null
          };
        }).sort(function(a, b) {
          return Math.abs(b.edge || 0) - Math.abs(a.edge || 0);
        });
        var f5Tip = ' title="F5 estimate — ABQ/OBR weighted"';
        mount.innerHTML = '<table class="rl-table-premium"><thead><tr>'
          + '<th></th><th>Team</th><th>vs RHP</th><th>vs LHP</th><th>Split Edge</th>'
          + '<th' + f5Tip + '>F5 OSI</th><th>Platoon Label</th>'
          + '</tr></thead><tbody>'
          + rows.map(function(row) {
            var logo = A ? A.teamLogoImg(row.t, 24) : '';
            return '<tr class="rl-row-click" data-team="' + esc(row.t) + '">'
              + '<td>' + logo + '</td><td><strong>' + esc(row.t) + '</strong></td>'
              + '<td class="num" style="color:' + mColor(row.rv, false, metric) + '">' + fmt(row.rv) + '</td>'
              + '<td class="num" style="color:' + mColor(row.lv, false, metric) + '">' + fmt(row.lv) + '</td>'
              + '<td class="num" style="' + splitEdgeStyle(row.edge) + '">' + fmt(row.edge) + '</td>'
              + '<td class="num" style="color:' + mColor(row.f5, false, 'osi') + '">' + fmt(row.f5) + '</td>'
              + '<td>' + esc(platoonLabel(row.rv, row.lv)) + '</td></tr>';
          }).join('') + '</tbody></table>';
        bindRowClicks(mount, 'team');
      });
      return;
    }
    if (entity === 'sp') {
      (global.PitcherLab ? PitcherLab.loadProfiles() : Promise.resolve([])).then(function(profiles) {
        profiles = profiles || (global.LIVE_DATA && LIVE_DATA.spProfiles) || [];
        mount.innerHTML = '<table class="rl-table-premium"><thead><tr>'
          + '<th></th><th>Pitcher</th><th>Team</th><th>Hand</th><th>vs LHH</th><th>vs RHH</th><th>Split Edge</th><th>Platoon Vulnerability</th>'
          + '</tr></thead><tbody>'
          + profiles.slice(0, 120).map(function(row) {
            var n = S.pickCol(row, 'pitcher_name', 'Name', 'Pitcher');
            var t = S.pickCol(row, 'pitcher_team', 'Team', 'Tm');
            var hand = String(S.pickCol(row, 'hand', 'Hand', 'pitcher_hand') || 'R').charAt(0);
            var m = S.spProfileMetrics(row);
            var lhh = num(S.pickCol(row, 'osi_allowed_vs_lhh', 'OSI_allowed_LHH')) || m.osiAllowed;
            var rhh = num(S.pickCol(row, 'osi_allowed_vs_rhh', 'OSI_allowed_RHH')) || m.osiAllowed;
            var edge = (lhh != null && rhh != null) ? rhh - lhh : null;
            var vuln = edge != null && Math.abs(edge) > 10 ? 'High' : '—';
            var av = A ? A.pitcherAvatar(n, { crop: 'compare', className: 'rl-av-28' }) : '';
            return '<tr class="rl-row-click" data-pitcher="' + esc(n) + '">'
              + '<td>' + av + '</td><td>' + esc(n) + '</td><td>' + esc(t) + '</td><td>' + esc(hand) + '</td>'
              + '<td class="num" style="color:' + mColor(lhh, true, 'osi') + '">' + fmt(lhh) + '</td>'
              + '<td class="num" style="color:' + mColor(rhh, true, 'osi') + '">' + fmt(rhh) + '</td>'
              + '<td class="num" style="' + splitEdgeStyle(edge) + '">' + fmt(edge) + '</td>'
              + '<td>' + esc(vuln) + '</td></tr>';
          }).join('') + '</tbody></table>';
        bindRowClicks(mount, 'pitcher');
      });
      return;
    }
    var units = (global.LIVE_DATA && LIVE_DATA.bullpenUnits) || {};
    var bpRows = Object.keys(units).map(function(tk) {
      var u = units[tk];
      var lhh = num(S.pickCol(u, 'osi_allowed_vs_lhh', 'vs_LHH_OSI_allowed')) || u.osiAllowed;
      var rhh = num(S.pickCol(u, 'osi_allowed_vs_rhh', 'vs_RHH_OSI_allowed')) || u.osiAllowed;
      return {
        t: tk, lhh: lhh, rhh: rhh,
        edge: (lhh != null && rhh != null) ? rhh - lhh : null,
        hi: u.hiLevEra, lo: u.loLevEra
      };
    }).sort(function(a, b) { return Math.abs(b.edge || 0) - Math.abs(a.edge || 0); });
    mount.innerHTML = '<table class="rl-table-premium"><thead><tr>'
      + '<th></th><th>Team</th><th>vs LHH</th><th>vs RHH</th><th>Split Edge</th><th>High Lev ERA</th><th>Low Lev ERA</th>'
      + '</tr></thead><tbody>'
      + bpRows.map(function(row) {
        return '<tr class="rl-row-click" data-team="' + esc(row.t) + '">'
          + '<td>' + (A ? A.teamLogoImg(row.t, 24) : '') + '</td><td><strong>' + esc(row.t) + '</strong></td>'
          + '<td class="num" style="color:' + mColor(row.lhh, true, 'osi') + '">' + fmt(row.lhh) + '</td>'
          + '<td class="num" style="color:' + mColor(row.rhh, true, 'osi') + '">' + fmt(row.rhh) + '</td>'
          + '<td class="num" style="' + splitEdgeStyle(row.edge) + '">' + fmt(row.edge) + '</td>'
          + '<td class="num">' + fmt(row.hi) + '</td><td class="num">' + fmt(row.lo) + '</td></tr>';
      }).join('') + '</tbody></table>';
    bindRowClicks(mount, 'team');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function bindRowClicks(mount, kind) {
    mount.querySelectorAll('.rl-row-click').forEach(function(tr) {
      tr.addEventListener('click', function() {
        if (kind === 'pitcher') {
          var p = tr.getAttribute('data-pitcher');
          if (p) global.location.href = 'pitcher_profile.html?pitcher=' + encodeURIComponent(p);
        } else {
          var t = tr.getAttribute('data-team');
          if (t) global.location.href = 'team_profile.html?team=' + encodeURIComponent(t);
        }
      });
    });
  }

  function patchWorkspaceHeader() {
    var el = document.getElementById('researchLabHeader');
    if (!el || el.dataset.uixPatched) return;
    el.dataset.uixPatched = '1';
    el.innerHTML = '<div class="rl-workspace-header">'
      + '<div class="rl-workspace-eyebrow"><img src="assets/chase-icon-outline.png" alt="" width="20" height="20" onerror="this.style.display=\'none\'"> Research Lab</div>'
      + '<h2 class="rl-workspace-title">Research Lab</h2>'
      + '<p class="rl-workspace-subtitle">Four focused tools for validating offensive and pitching model signals.</p>'
      + '<div class="rl-header-pills">'
      + ['trends', 'splits', 'compare', 'pitching'].map(function(tab) {
        var label = { trends: 'Trends', splits: 'Splits', compare: 'Compare', pitching: 'Pitcher Lab' }[tab];
        return '<button type="button" class="rl-header-pill" data-rl-goto="' + tab + '">' + label + '</button>';
      }).join('')
      + '</div></div>';
    el.querySelectorAll('[data-rl-goto]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pane = btn.getAttribute('data-rl-goto');
        var subtab = document.querySelector('.rl-segment-tabs .subtab[data-pane="' + pane + '"]');
        if (subtab) subtab.click();
      });
    });
  }

  global.renderTrendHeatmap = renderTrendHeatmap;
  RL.mountTrendControls = mountTrendControls;
  RL.renderTrendHeatmap = renderTrendHeatmap;
  RL.renderTrendSummary = renderTrendSummary;
  RL.mountSplitsEntityControls = mountSplitsControls;
  RL.renderSplitsTable = renderSplitsTable;
  RL.initSplitsControls = mountSplitsControls;
  RL.patchWorkspaceHeader = patchWorkspaceHeader;

  var origOnSubtab = RL.onSubtab;
  RL.onSubtab = function(name) {
    patchWorkspaceHeader();
    if (name === 'trends') {
      RL.syncResearchGlobalsFromLiveData();
      mountTrendControls();
      renderTrendHeatmap();
      renderTrendSummary();
    } else if (name === 'splits') {
      RL.syncResearchGlobalsFromLiveData();
      mountSplitsControls();
      renderSplitsTable();
    } else if (origOnSubtab) origOnSubtab(name);
  };

})(typeof window !== 'undefined' ? window : this);
