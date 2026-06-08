/**
 * Lineup vs Bullpen — split filter controls (window).
 * Lineup and bullpen splits use both batters, both hands, and all locations by default.
 */
(function(global) {
  'use strict';

  var WINDOW_OPTIONS = [
    { id: 'l7', label: 'L7' },
    { id: 'l14', label: 'L14' },
    { id: 'l30', label: 'L30' },
    { id: 'ytd', label: 'YTD' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function normWin(v) {
    v = String(v || 'ytd').toLowerCase();
    return ['l7', 'l14', 'l30', 'ytd'].indexOf(v) >= 0 ? v : 'ytd';
  }

  function defaultLvbState(base) {
    base = base || {};
    return {
      lvWin: normWin(base.lvWin)
    };
  }

  function pillRow(options, attr, activeId) {
    return options.map(function(opt) {
      var on = activeId === opt.id;
      return '<button type="button" class="hub-pill mc-lvb-pill' + (on ? ' active' : '') + '"'
        + ' data-' + attr + '="' + esc(opt.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + esc(opt.label) + '</button>';
    }).join('');
  }

  function controlsHtml(state) {
    state = defaultLvbState(state);
    return '<div class="mc-lvb-controls hub-control-bar mc-lcc-controls">'
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">Window</span>'
      + '<div class="hub-pill-row">' + pillRow(WINDOW_OPTIONS, 'lvb-win', state.lvWin) + '</div></div>'
      + '</div>'
      + '<p class="ca-helper mc-lvb-filter-hint">Lineup stats vs relief only (excludes starters). Bullpen unit excludes rotation arms.</p>';
  }

  function lineupFilter(state) {
    state = defaultLvbState(state);
    var winMap = { ytd: 'YTD', l7: 'L7', l14: 'L14', l30: 'L30' };
    return {
      hand: 'both',
      location: 'all',
      pitcher: 'rp',
      segment: 'full',
      window: winMap[state.lvWin] || 'YTD'
    };
  }

  function bullpenFilter(state) {
    state = defaultLvbState(state);
    var winMap = { ytd: 'YTD', l7: 'L7', l14: 'L14', l30: 'L30' };
    return {
      batSide: 'both',
      location: 'all',
      window: winMap[state.lvWin] || 'YTD'
    };
  }

  function filterSummary(state) {
    state = defaultLvbState(state);
    var parts = ['vs RP'];
    if (state.lvWin !== 'ytd') parts.push(String(state.lvWin).toUpperCase());
    return parts.join(' · ');
  }

  function bindControls(root, state, onChange) {
    if (!root || !state) return;
    function setActive(attr, btn) {
      root.querySelectorAll('[data-' + attr + ']').forEach(function(b) {
        var on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    root.querySelectorAll('[data-lvb-win]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvWin = normWin(btn.getAttribute('data-lvb-win'));
        setActive('lvb-win', btn);
        if (onChange) onChange(state);
      };
    });
  }

  global.MatchupLvBControls = {
    defaultLvbState: defaultLvbState,
    controlsHtml: controlsHtml,
    bindControls: bindControls,
    lineupFilter: lineupFilter,
    bullpenFilter: bullpenFilter,
    filterSummary: filterSummary,
    normWin: normWin
  };
})(typeof window !== 'undefined' ? window : this);
