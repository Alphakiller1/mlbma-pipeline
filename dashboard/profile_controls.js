/**
 * Profile page control bars — split/window/view + metric sparklines.
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function splitLabel(key) {
    var map = {
      both: 'Both', overall: 'Overall', rhp: 'vs RHP', lhp: 'vs LHP', lhh: 'vs LHH', rhh: 'vs RHH',
      home: 'Home', away: 'Away', f5: 'F5', hlev: 'High Lev', llev: 'Low Lev', b: 'Both', r: 'vs RHP', l: 'vs LHP'
    };
    return map[key] || key;
  }

  function viewLabel(v) {
    return { summary: 'Summary', expanded: 'Expanded', analyst: 'Analyst', table: 'Table', cards: 'Cards' }[v] || v;
  }

  function metricTrend(team, metric) {
    if (!team || !global.SCO_YTD_B) return [null, null, null, null];
    var row = global.SCO_YTD_B.find(function(d) { return d.t === team; });
    if (!row) return [null, null, null, null];
    var m = metric.toLowerCase();
    if (m === 'osi') return [row.ytdOSI != null ? row.ytdOSI : row.osi, row.l30OSI, row.l14OSI, row.l7OSI];
    if (m === 'abq') return [row.abq, row.l30ABQ, row.l14ABQ, row.l7ABQ];
    if (m === 'rcv') return [row.rcv, row.l30RCV, row.l14RCV, row.l7RCV];
    if (m === 'obr') return [row.obr, row.l30OBR, row.l14OBR, row.l7OBR];
    if (m === 'pitching' || m === 'pitchscore') {
      var ps = typeof getSpPitchScore === 'function' ? getSpPitchScore(team) : null;
      return [ps, ps, ps, ps];
    }
    return [row[m], null, null, null];
  }

  function sparkRow(metrics, team, width, height) {
    if (!global.MLBMACharts) return '';
    return '<div class="pc-spark-row">' + metrics.map(function(m) {
      var vals = typeof m.values === 'function' ? m.values(team) : metricTrend(team, m.key);
      var cur = vals.filter(function(v) { return v != null && !isNaN(v); }).pop();
      return '<div class="pc-spark-item">'
        + MLBMACharts.buildSparkline(vals, width || 80, height || 28)
        + '<span class="pc-spark-label">' + esc(m.label) + (cur != null ? ' <strong>' + Number(cur).toFixed(1) + '</strong>' : '') + '</span>'
        + '</div>';
    }).join('') + '</div>';
  }

  function bindToggles(root, state, onChange) {
    root.querySelectorAll('[data-pctrl]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var grp = btn.closest('[data-pgroup]');
        if (!grp) return;
        var key = grp.getAttribute('data-pgroup');
        state[key] = btn.getAttribute('data-pctrl');
        grp.querySelectorAll('[data-pctrl]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        var conf = root.querySelector('[data-pconfirm]');
        if (conf && typeof onChange === 'object' && onChange.confirmText) {
          conf.textContent = onChange.confirmText(state);
        } else if (conf && onChange && onChange.confirmText) {
          conf.textContent = onChange.confirmText(state);
        }
        if (typeof onChange === 'function') onChange(state);
        else if (onChange && typeof onChange.onChange === 'function') onChange.onChange(state);
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

  /**
   * @param {string|HTMLElement} mount
   * @param {object} opts - { type: 'team'|'pitcher'|'bullpen', state, teamName, onChange, confirmText }
   */
  function render(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var type = opts.type || 'team';
    var state = Object.assign({
      split: 'both', window: 'YTD', view: 'summary', team: opts.teamName || ''
    }, opts.state || {});

    var splitOpts = type === 'pitcher'
      ? [{ value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'F5' }]
      : type === 'bullpen'
        ? [{ value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'hlev', label: 'High Lev' }, { value: 'llev', label: 'Low Lev' }]
        : [{ value: 'both', label: 'Both' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' }, { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'F5' }];

    var winOpts = type === 'team'
      ? [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }, { value: 'L7', warn: true }]
      : [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }];

    var viewOpts = [{ value: 'summary', label: 'Summary' }, { value: 'expanded', label: 'Expanded' }, { value: 'analyst', label: 'Analyst' }];

    var sparks = type === 'pitcher'
      ? [{ key: 'pitching', label: 'Pitch Score' }, { key: 'osi', label: 'OSI Allowed', values: function() { return [null, null, null, null]; } }]
      : type === 'bullpen'
        ? [{ key: 'osi', label: 'OSI Allowed' }, { key: 'pitching', label: 'Bullpen Score' }]
        : [{ key: 'abq', label: 'ABQ' }, { key: 'rcv', label: 'RCV' }, { key: 'obr', label: 'OBR' }, { key: 'osi', label: 'OSI' }];

    function confirmText(st) {
      var teamLbl = st.team || opts.teamName || 'Team';
      return 'Showing: ' + teamLbl + ' · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar">'
      + '<div class="pc-control-row">'
      + pillGroup('Split', 'split', splitOpts, state.split)
      + pillGroup('Window', 'window', winOpts, state.window)
      + pillGroup('View', 'view', viewOpts, state.view)
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + sparkRow(sparks, state.team || opts.teamName, 80, 28)
      + '</div>';

    bindToggles(el, state, {
      confirmText: confirmText,
      onChange: opts.onChange
    });
    el._profileState = state;
    return state;
  }

  global.MLBMAProfileControls = { render: render, sparkRow: sparkRow, metricTrend: metricTrend };
})(typeof window !== 'undefined' ? window : this);
