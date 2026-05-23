/**
 * Shared global control bar — entity, split, window, view + confirmation line.
 */
(function(global) {
  'use strict';

  var DEFAULT = { entity: 'team', split: 'b', window: 'YTD', view: 'table' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function labelEntity(e) {
    return { team: 'Team', pitcher: 'Pitcher', bullpen: 'Bullpen' }[e] || e;
  }

  function labelSplit(s) {
    return { b: 'Both', r: 'vs RHP', l: 'vs LHP', f5: 'F5' }[s] || s;
  }

  function labelWindow(w) {
    return w || 'YTD';
  }

  function labelView(v) {
    return { table: 'Table', cards: 'Cards', chart: 'Chart' }[v] || v;
  }

  function confirmationLine(state) {
    state = state || DEFAULT;
    return 'Showing: ' + labelEntity(state.entity) + ' · ' + labelSplit(state.split) + ' · '
      + labelWindow(state.window) + ' · ' + labelView(state.view);
  }

  /**
   * @param {HTMLElement|string} mount
   * @param {object} opts - { id, entityOptions, showView, onChange, state }
   */
  function renderBar(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var id = opts.id || 'ctrl_' + Math.random().toString(36).slice(2, 8);
    var state = Object.assign({}, DEFAULT, opts.state || global.MLBMA_CTRL_STATE || {});

    var entities = opts.entityOptions || ['team', 'pitcher', 'bullpen'];
    var showView = opts.showView !== false;

    el.innerHTML = '<div class="mlbma-control-bar" id="' + id + '">'
      + '<div class="mlbma-control-row">'
      + '<div class="mlbma-control-group"><span class="mlbma-control-label">Entity</span><div class="mlbma-toggle-group" data-ctrl="entity">'
      + entities.map(function(e) {
        return '<button type="button" class="mlbma-toggle' + (state.entity === e ? ' active' : '') + '" data-val="' + e + '">'
          + esc(labelEntity(e)) + '</button>';
      }).join('')
      + '</div></div>'
      + '<div class="mlbma-control-group"><span class="mlbma-control-label">Split</span><div class="mlbma-toggle-group" data-ctrl="split">'
      + ['b', 'r', 'l'].map(function(s) {
        return '<button type="button" class="mlbma-toggle' + (state.split === s ? ' active' : '') + '" data-val="' + s + '">'
          + esc(labelSplit(s)) + '</button>';
      }).join('')
      + '</div></div>'
      + '<div class="mlbma-control-group"><span class="mlbma-control-label">Window</span><div class="mlbma-toggle-group" data-ctrl="window">'
      + ['YTD', 'L30', 'L14', 'L7'].map(function(w) {
        return '<button type="button" class="mlbma-toggle' + (state.window === w ? ' active' : '') + '" data-val="' + w + '">'
          + esc(w) + '</button>';
      }).join('')
      + '</div></div>'
      + (showView ? '<div class="mlbma-control-group"><span class="mlbma-control-label">View</span><div class="mlbma-toggle-group" data-ctrl="view">'
        + ['table', 'cards'].map(function(v) {
          return '<button type="button" class="mlbma-toggle' + (state.view === v ? ' active' : '') + '" data-val="' + v + '">'
            + esc(labelView(v)) + '</button>';
        }).join('') + '</div></div>' : '')
      + '</div>'
      + '<div class="mlbma-control-confirm" data-confirm-for="' + id + '">' + esc(confirmationLine(state)) + '</div>'
      + '</div>';

    el.querySelectorAll('.mlbma-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var grp = btn.closest('[data-ctrl]');
        if (!grp) return;
        var key = grp.getAttribute('data-ctrl');
        state[key] = btn.getAttribute('data-val');
        grp.querySelectorAll('.mlbma-toggle').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        var conf = el.querySelector('[data-confirm-for]');
        if (conf) conf.textContent = confirmationLine(state);
        global.MLBMA_CTRL_STATE = state;
        if (typeof opts.onChange === 'function') opts.onChange(state);
      });
    });

    el._ctrlState = state;
    return state;
  }

  global.MLBMAControls = {
    renderBar: renderBar,
    confirmationLine: confirmationLine,
    DEFAULT: DEFAULT
  };
})(typeof window !== 'undefined' ? window : this);
