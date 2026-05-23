/**
 * Profile page control bars — split/window/view + metric sparklines.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function splitLabel(key) {
    var map = {
      both: 'Both', overall: 'Overall', rhp: 'vs RHP', lhp: 'vs LHP', lhh: 'vs LHH', rhh: 'vs RHH',
      home: 'Home', away: 'Away', f5: 'F5', hlev: 'High Leverage', llev: 'Low Leverage',
      b: 'Both', r: 'vs RHP', l: 'vs LHP', hilev: 'High Leverage'
    };
    return map[key] || key;
  }

  function viewLabel(v) {
    return { summary: 'Summary', expanded: 'Expanded', analyst: 'Analyst' }[v] || v;
  }

  function pickCol(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
    }
    return '';
  }

  function sparkHtml(values, width, height, label) {
    if (!global.MLBMACharts) return '';
    var cur = (values || []).filter(function(v) { return v != null && !isNaN(v); }).pop();
    return '<div class="pc-spark-item">'
      + MLBMACharts.buildSparkline(values, width || 80, height || 28)
      + '<span class="pc-spark-label">' + esc(label)
      + (cur != null ? ' <strong>' + Number(cur).toFixed(1) + '</strong>' : '')
      + '</span></div>';
  }

  function bindToggles(root, state, handlers) {
    root.querySelectorAll('[data-pctrl]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var grp = btn.closest('[data-pgroup]');
        if (!grp) return;
        var key = grp.getAttribute('data-pgroup');
        state[key] = btn.getAttribute('data-pctrl');
        grp.querySelectorAll('[data-pctrl]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        if (handlers.confirmText) {
          var conf = root.querySelector('[data-pconfirm]');
          if (conf) conf.textContent = handlers.confirmText(state);
        }
        if (handlers.onSparklineUpdate) handlers.onSparklineUpdate(state);
        if (handlers.onChange) handlers.onChange(state);
      });
    });
  }

  function pillGroup(label, groupKey, options, active) {
    return '<div class="control-group" data-pgroup="' + groupKey + '">'
      + '<span class="control-label">' + esc(label) + '</span>'
      + '<div class="toggle-group">'
      + options.map(function(o) {
        var val = o.value || o;
        var lbl = o.label || splitLabel(val);
        return '<button type="button" class="toggle-btn' + (active === val ? ' active' : '') + (o.warn ? ' warn' : '') + '" data-pctrl="' + esc(val) + '">' + esc(lbl) + '</button>';
      }).join('')
      + '</div></div>';
  }

  function teamMetricTrend(team, metric) {
    if (!team || !global.SCO_YTD_B) return [null, null, null, null];
    var row = global.SCO_YTD_B.find(function(d) { return d.t === team; });
    if (!row) return [null, null, null, null];
    var m = metric.toLowerCase();
    if (m === 'osi') return [row.ytdOSI != null ? row.ytdOSI : row.osi, row.l30OSI, row.l14OSI, row.l7OSI];
    if (m === 'abq') return [row.abq, row.l30ABQ, row.l14ABQ, row.l7ABQ];
    if (m === 'rcv') return [row.rcv, row.l30RCV, row.l14RCV, row.l7RCV];
    if (m === 'obr') return [row.obr, row.l30OBR, row.l14OBR, row.l7OBR];
    return [null, null, null, null];
  }

  function pitcherPitchTrend(profile, team, pitchingRows) {
    var ps = profile && profile.PitchScore != null ? num(profile.PitchScore) : null;
    if (ps == null && global.MLBMASharedMatchup && profile) {
      var m = MLBMASharedMatchup.spProfileMetrics(profile);
      ps = m ? m.pitchScore : null;
    }
    if (ps == null && team && pitchingRows) {
      var pr = pitchingRows.find(function(p) {
        return String(pickCol(p, ['Tm', 'tm', 'team'])).toUpperCase() === String(team).toUpperCase();
      });
      ps = pr ? num(pickCol(pr, ['PitchScore'])) : null;
    }
    return [ps, ps, ps, ps];
  }

  function pitcherOsiAllowTrend(profile) {
    var ytd = num(pickCol(profile, ['OSI_allowed', 'osi_allowed']));
    return [ytd, null, null, ytd];
  }

  function bullpenOsiTrend(unit, team, pitchingRows) {
    if (unit) {
      var ytd = unit.osiAllowed != null ? unit.osiAllowed
        : num(pickCol(unit, ['overall_OSI_allowed', 'osi_allowed']));
      var score = unit.bullpenScore != null ? unit.bullpenScore
        : (ytd != null ? Math.max(0, Math.min(100, 100 - ytd)) : null);
      return { osi: [ytd, ytd, ytd, ytd], score: [score, score, score, score] };
    }
    var bp = pitchingRows && pitchingRows.find(function(p) {
      return String(pickCol(p, ['Tm', 'tm'])).toUpperCase() === String(team).toUpperCase();
    });
    var oa = bp ? num(pickCol(bp, ['osi_allowed', 'OSI_allowed'])) : null;
    var score = bp ? num(pickCol(bp, ['PitchScore'])) : null;
    return { osi: [oa, oa, oa, oa], score: [score, score, score, score] };
  }

  /** Team profile bar */
  function renderTeam(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var state = Object.assign({ split: 'both', window: 'YTD', view: 'summary', team: opts.teamName || '' }, opts.state || {});

    function confirmText(st) {
      return 'Showing: ' + (st.team || opts.teamName || 'Team') + ' · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    function sparkBlock(st) {
      var t = st.team || opts.teamName;
      var C = global.MLBMACharts;
      function row(label, metric) {
        var vals = teamMetricTrend(t, metric);
        if (C && C.buildSparklineRow) return C.buildSparklineRow(label, vals, 120, 28, { labels: ['YTD', 'L30', 'L14', 'L7'] });
        return sparkHtml(vals, 120, 28, label);
      }
      return '<div class="pc-spark-strip" data-pspark>'
        + row('ABQ', 'abq') + row('RCV', 'rcv') + row('OBR', 'obr') + row('OSI', 'osi')
        + '</div>';
    }

    function teamSnapshotStrip(st) {
      var t = st.team || opts.teamName;
      if (!t) return '';
      var row = (global.SCO_YTD_B || []).find(function(d) { return d.t === t; });
      if (!row && global.ResearchLab && ResearchLab.teamRow) row = ResearchLab.teamRow(t);
      if (!row) return '';
      var logo = A ? A.teamLogoImg(t, 32) : '';
      var tier = row.osi >= 75 ? 'Elite' : row.osi >= 60 ? 'Solid' : row.osi >= 45 ? 'Avg' : 'Weak';
      var tierCls = row.osi >= 75 ? 'tier-elite' : row.osi >= 60 ? 'tier-solid' : 'tier-mid';
      var rhp = row.rhpOSI != null ? row.rhpOSI : null;
      var lhp = row.lhpOSI != null ? row.lhpOSI : null;
      var mc = A && A.metricColor ? A.metricColor.bind(A) : function() { return '#71717A'; };
      var tonight = '';
      (global.LIVE_DATA && LIVE_DATA.matchups || []).forEach(function(m) {
        if (m.away === t) tonight = 'vs ' + m.home + ' · ' + (m.homeSP || 'TBD') + ' · ' + (m.time || 'TBD');
        if (m.home === t) tonight = 'vs ' + m.away + ' · ' + (m.awaySP || 'TBD') + ' · ' + (m.time || 'TBD');
      });
      return '<div class="pc-team-snapshot">'
        + '<div class="pc-team-snapshot-meta">' + logo
        + '<div><strong>' + esc(t) + '</strong> · OSI <strong style="color:' + mc(row.osi, 'osi') + '">' + (row.osi != null ? row.osi.toFixed(1) : '—') + '</strong>'
        + ' <span class="tier-badge ' + tierCls + '">' + esc(tier) + '</span></div></div>'
        + sparkBlock(st)
        + '<div class="pc-split-compare"><span>vRHP <strong style="color:' + mc(rhp, 'osi') + '">' + (rhp != null ? rhp.toFixed(1) : '—') + '</strong></span>'
        + '<span>vLHP <strong style="color:' + mc(lhp, 'osi') + '">' + (lhp != null ? lhp.toFixed(1) : '—') + '</strong></span></div>'
        + (tonight ? '<span class="pc-tonight-chip">' + esc(tonight) + '</span>' : '')
        + '</div>';
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar">'
      + '<div class="pc-control-row">'
      + pillGroup('Split', 'split', [
        { value: 'both' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' },
        { value: 'home' }, { value: 'away' }, { value: 'f5' }
      ], state.split)
      + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }, { value: 'L7', warn: true }], state.window)
      + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view)
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + teamSnapshotStrip(state) + '</div>';

    bindToggles(el, state, { confirmText: confirmText, onChange: opts.onChange });
    el._profileState = state;
    return state;
  }

  /** Pitcher profile — 3 rows with search */
  function renderPitcher(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var state = Object.assign({
      split: 'overall', window: 'YTD', view: 'summary',
      pitcherKey: '', pitcherName: '', profile: null, team: ''
    }, opts.state || {});

    var pitchers = opts.pitchers || [];
    var datalist = pitchers.map(function(p) {
      return '<option value="' + esc(p.label) + '" data-key="' + esc(p.key) + '"></option>';
    }).join('');

    function confirmText(st) {
      var name = st.pitcherName || 'Select pitcher';
      return 'Showing: ' + name + ' · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    function updateSparks(st) {
      var row = document.querySelector('[data-pspark]');
      if (!row) return;
      var prof = st.profile || (opts.getProfile && opts.getProfile(st.pitcherKey));
      row.innerHTML = sparkHtml(pitcherPitchTrend(prof, st.team, opts.pitchingRows), 100, 32, 'Pitching Score')
        + sparkHtml(pitcherOsiAllowTrend(prof), 100, 32, 'OSI Allowed');
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar pc-pitcher-bar">'
      + '<div class="pc-control-row pc-control-row--search">'
      + '<div class="control-group pc-search-group">'
      + '<span class="control-label">Pitcher</span>'
      + '<input type="search" class="pc-pitcher-search" id="pcPitcherSearch" list="pcPitcherList" placeholder="Search pitcher or team…" value="' + esc(state.pitcherName || '') + '" autocomplete="off">'
      + '<datalist id="pcPitcherList">' + datalist + '</datalist>'
      + '</div>'
      + pillGroup('Split', 'split', [
        { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
        { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'F5' }
      ], state.split)
      + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }], state.window)
      + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view)
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + '<div class="pc-spark-row" data-pspark></div></div>';

    var search = el.querySelector('#pcPitcherSearch');
    if (search) {
      search.addEventListener('change', function() {
        var val = search.value.trim();
        var hit = pitchers.find(function(p) { return p.label === val || p.key === val; });
        if (hit && opts.onPitcherSelect) opts.onPitcherSelect(hit.key, hit.label);
      });
      search.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        var val = search.value.trim().toLowerCase();
        var hit = pitchers.find(function(p) {
          return p.label.toLowerCase() === val || p.key.toLowerCase() === val
            || (p.team && p.team.toLowerCase() === val);
        });
        if (hit && opts.onPitcherSelect) opts.onPitcherSelect(hit.key, hit.label);
      });
    }

    bindToggles(el, state, {
      confirmText: confirmText,
      onChange: opts.onChange,
      onSparklineUpdate: updateSparks
    });
    updateSparks(state);
    el._profileState = state;
    return state;
  }

  /** Bullpen report — team dropdown + 3 rows */
  function renderBullpen(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var teams = opts.teams || [];
    var state = Object.assign({ split: 'overall', window: 'YTD', view: 'summary', team: opts.team || '' }, opts.state || {});

    function confirmText(st) {
      return 'Showing: ' + (st.team || '—') + ' Bullpen · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    function updateSparks(st) {
      var row = el.querySelector('[data-pspark]');
      if (!row) return;
      var unit = opts.getUnit && opts.getUnit(st.team);
      var trends = bullpenOsiTrend(unit, st.team, opts.pitchingRows);
      row.innerHTML = sparkHtml(trends.osi, 100, 32, 'OSI Allowed')
        + sparkHtml(trends.score, 100, 32, 'Bullpen Score');
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar pc-bullpen-bar">'
      + '<div class="pc-control-row">'
      + '<div class="control-group"><span class="control-label">Team</span>'
      + '<select class="pc-team-select" id="pcBullpenTeam"><option value="">— Select team —</option>'
      + teams.map(function(t) {
        return '<option value="' + esc(t) + '"' + (state.team === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('')
      + '</select></div>'
      + pillGroup('Split', 'split', [
        { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
        { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' },
        { value: 'hlev', label: 'High Lev' }, { value: 'llev', label: 'Low Lev' }
      ], state.split)
      + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }], state.window)
      + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view)
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + '<div class="pc-spark-row" data-pspark></div></div>';

    var sel = el.querySelector('#pcBullpenTeam');
    if (sel) {
      sel.addEventListener('change', function() {
        state.team = sel.value;
        if (opts.onTeamChange) opts.onTeamChange(state.team);
        var conf = el.querySelector('[data-pconfirm]');
        if (conf) conf.textContent = confirmText(state);
        updateSparks(state);
      });
    }

    bindToggles(el, state, {
      confirmText: confirmText,
      onChange: opts.onChange,
      onSparklineUpdate: updateSparks
    });
    updateSparks(state);
    el._profileState = state;
    return state;
  }

  global.MLBMAProfileControls = {
    render: renderTeam,
    renderTeam: renderTeam,
    renderPitcher: renderPitcher,
    renderBullpen: renderBullpen,
    teamMetricTrend: teamMetricTrend,
    pitcherPitchTrend: pitcherPitchTrend,
    pitcherOsiAllowTrend: pitcherOsiAllowTrend
  };
})(typeof window !== 'undefined' ? window : this);
