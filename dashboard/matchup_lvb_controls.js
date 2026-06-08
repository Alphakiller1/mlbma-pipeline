/**
 * Lineup vs Bullpen — split filter controls (handedness, location, window, F5).
 * Lineup hand = RHH/LHH/Both; bullpen hand = vs RHH/vs LHH/Both; lineup always vs RP.
 */
(function(global) {
  'use strict';

  var HAND_OPTIONS = [
    { id: 'both', label: 'Both' },
    { id: 'r', label: 'RH' },
    { id: 'l', label: 'LH' }
  ];

  var BP_HAND_OPTIONS = [
    { id: 'both', label: 'Both' },
    { id: 'r', label: 'vs RHH' },
    { id: 'l', label: 'vs LHH' }
  ];

  var LOC_OPTIONS = [
    { id: 'all', label: 'Both' },
    { id: 'home', label: 'Home' },
    { id: 'away', label: 'Away' }
  ];

  var WINDOW_OPTIONS = [
    { id: 'l7', label: 'L7' },
    { id: 'l14', label: 'L14' },
    { id: 'l30', label: 'L30' },
    { id: 'ytd', label: 'YTD' }
  ];

  var SEGMENT_OPTIONS = [
    { id: 'full', label: 'Full Game' },
    { id: 'f5', label: 'F5' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function normHand(v) {
    v = String(v || 'both').toLowerCase();
    return v === 'r' || v === 'l' ? v : 'both';
  }

  function normLoc(v) {
    v = String(v || 'all').toLowerCase();
    return v === 'home' || v === 'away' ? v : 'all';
  }

  function normWin(v) {
    v = String(v || 'ytd').toLowerCase();
    return ['l7', 'l14', 'l30', 'ytd'].indexOf(v) >= 0 ? v : 'ytd';
  }

  function normSegment(v) {
    v = String(v || 'full').toLowerCase();
    return v === 'f5' ? 'f5' : 'full';
  }

  function defaultLvbState(base) {
    base = base || {};
    return {
      lvbLuHand: normHand(base.lvbLuHand),
      lvbBpHand: normHand(base.lvbBpHand),
      lvbLoc: normLoc(base.lvbLoc),
      lvbSegment: normSegment(base.lvbSegment),
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
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">Lineup Bats</span>'
      + '<div class="hub-pill-row">' + pillRow(HAND_OPTIONS, 'lvb-lu-hand', state.lvbLuHand) + '</div></div>'
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">BP vs</span>'
      + '<div class="hub-pill-row">' + pillRow(BP_HAND_OPTIONS, 'lvb-bp-hand', state.lvbBpHand) + '</div></div>'
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">Location</span>'
      + '<div class="hub-pill-row">' + pillRow(LOC_OPTIONS, 'lvb-loc', state.lvbLoc) + '</div></div>'
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">Window</span>'
      + '<div class="hub-pill-row">' + pillRow(WINDOW_OPTIONS, 'lvb-win', state.lvWin) + '</div></div>'
      + '<div class="hub-ctrl-group mc-lvb-ctrl"><span class="hub-ctrl-label">Segment</span>'
      + '<div class="hub-pill-row">' + pillRow(SEGMENT_OPTIONS, 'lvb-segment', state.lvbSegment) + '</div></div>'
      + '</div>'
      + '<p class="ca-helper mc-lvb-filter-hint">Lineup stats vs relief only (excludes starters). Bullpen unit excludes rotation arms.</p>';
  }

  function lineupFilter(state) {
    state = defaultLvbState(state);
    var winMap = { ytd: 'YTD', l7: 'L7', l14: 'L14', l30: 'L30' };
    return {
      hand: state.lvbLuHand,
      location: state.lvbLoc,
      pitcher: 'rp',
      segment: state.lvbSegment,
      window: winMap[state.lvWin] || 'YTD'
    };
  }

  function bullpenFilter(state) {
    state = defaultLvbState(state);
    return {
      batSide: state.lvbBpHand,
      location: state.lvbLoc,
      window: 'YTD'
    };
  }

  function filterSummary(state) {
    state = defaultLvbState(state);
    var parts = [];
    if (state.lvbLuHand !== 'both') parts.push(state.lvbLuHand === 'r' ? 'RHH' : 'LHH');
    if (state.lvbBpHand !== 'both') parts.push(state.lvbBpHand === 'r' ? 'vs RHH' : 'vs LHH');
    if (state.lvbLoc !== 'all') parts.push(state.lvbLoc === 'home' ? 'Home' : 'Away');
    if (state.lvbSegment === 'f5') parts.push('F5');
    parts.push('vs RP');
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
    function wire(attr, key, norm) {
      root.querySelectorAll('[data-' + attr + ']').forEach(function(btn) {
        btn.onclick = function() {
          state[key] = norm(btn.getAttribute('data-' + attr));
          setActive(attr, btn);
          if (onChange) onChange(state);
        };
      });
    }
    wire('lvb-lu-hand', 'lvbLuHand', normHand);
    wire('lvb-bp-hand', 'lvbBpHand', normHand);
    wire('lvb-loc', 'lvbLoc', normLoc);
    wire('lvb-win', 'lvWin', normWin);
    wire('lvb-segment', 'lvbSegment', normSegment);
  }

  global.MatchupLvBControls = {
    defaultLvbState: defaultLvbState,
    controlsHtml: controlsHtml,
    bindControls: bindControls,
    lineupFilter: lineupFilter,
    bullpenFilter: bullpenFilter,
    filterSummary: filterSummary,
    normHand: normHand,
    normLoc: normLoc,
    normWin: normWin,
    normSegment: normSegment
  };
})(typeof window !== 'undefined' ? window : this);
