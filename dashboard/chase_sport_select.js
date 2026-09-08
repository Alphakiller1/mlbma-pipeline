/**
 * Sport selector with per-sport saved context. Loads only the selected sport's route.
 */
(function (global) {
  'use strict';

  var SPORTS = [
    { id: 'mlb', href: '/mlb/', label: 'MLB' },
    { id: 'nfl', href: '/nfl/', label: 'NFL' },
    { id: 'wnba', href: '/wnba/', label: 'WNBA' },
    { id: 'cfb', href: '/cfb/', label: 'CFB' }
  ];
  var PREFIX = 'chase-sport-ctx-';

  function currentSport() {
    var m = (location.pathname || '').match(/\/(mlb|nfl|wnba|cfb)(?:\/|$)/i);
    if (m) return m[1].toLowerCase();
    return 'mlb';
  }

  function loadCtx(sport) {
    try {
      return JSON.parse(localStorage.getItem(PREFIX + sport) || 'null') || {};
    } catch (e) { return {}; }
  }

  function saveCtx(sport, patch) {
    var cur = loadCtx(sport);
    var next = Object.assign({}, cur, patch || {}, { sport: sport, savedAt: Date.now() });
    try { localStorage.setItem(PREFIX + sport, JSON.stringify(next)); } catch (e) { /* quota */ }
    return next;
  }

  function hrefFor(sport) {
    var spec = SPORTS.filter(function (s) { return s.id === sport; })[0];
    var base = spec ? spec.href : '/mlb/';
    var ctx = loadCtx(sport);
    if (ctx.surface === 'matchups') return '/' + sport + '/matchups.html';
    if (ctx.surface === 'results') return '/' + sport + '/results.html';
    return base;
  }

  function render(el, current) {
    if (!el) return;
    current = current || currentSport();
    el.className = (el.className || '') + ' ca-sport-select';
    el.setAttribute('role', 'navigation');
    el.setAttribute('aria-label', 'Sport');
    el.innerHTML = SPORTS.map(function (s) {
      var on = s.id === current;
      return '<a class="hub-pill ca-sport-select-pill' + (on ? ' active' : '') + '" href="' + hrefFor(s.id) + '"' +
        (on ? ' aria-current="page"' : '') + '>' + s.label + '</a>';
    }).join('');
  }

  global.ChaseSportSelect = {
    sports: SPORTS,
    currentSport: currentSport,
    loadCtx: loadCtx,
    saveCtx: saveCtx,
    hrefFor: hrefFor,
    render: render
  };
})(window);
