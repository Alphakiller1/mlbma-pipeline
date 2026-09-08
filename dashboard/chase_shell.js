/**
 * ResearchShell — sport selector, DataStatus slot, optional entity search.
 * Modes live on <body data-mode>. Does not invent a fifth density budget.
 */
(function (global) {
  'use strict';

  function slotInHeader() {
    var header = document.getElementById('chaseHeader');
    if (!header) return null;
    var slot = header.querySelector('#caDataStatusSlot');
    if (slot) return slot;
    slot = document.createElement('div');
    slot.id = 'caDataStatusSlot';
    var status = header.querySelector('.chase-status');
    if (status) status.insertBefore(slot, status.firstChild);
    else header.appendChild(slot);
    return slot;
  }

  function bindSearch(host) {
    if (!host || host.getAttribute('data-ca-search') === '1') return host;
    host.setAttribute('data-ca-search', '1');
    host.className = (host.className || '') + ' ca-entity-search-host';
    host.innerHTML =
      '<form class="ca-entity-search" method="get" role="search" action="">' +
      '<label for="caEntityQ">Find a team or game</label>' +
      '<input id="caEntityQ" name="q" type="search" autocomplete="off" spellcheck="false">' +
      '<button type="submit">Filter</button>' +
      '</form>';
    var form = host.querySelector('form');
    var input = host.querySelector('#caEntityQ');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = String(input.value || '').trim().toLowerCase();
      var cards = document.querySelectorAll('[data-game], article.ca-card, .lv-row-team, .lv-team-card');
      var n = 0;
      cards.forEach(function (c) {
        var hay = ((c.getAttribute('data-game') || '') + ' ' + (c.textContent || '')).toLowerCase();
        var show = !q || hay.indexOf(q) !== -1;
        c.hidden = !show;
        if (show) n++;
      });
      host.setAttribute('data-match-count', String(n));
    });
    return host;
  }

  function mount(opts) {
    opts = opts || {};
    var sport = opts.sport || (global.ChaseSportSelect && ChaseSportSelect.currentSport()) || 'mlb';
    var mode = opts.mode || document.body.getAttribute('data-mode') || 'entry';
    document.body.setAttribute('data-mode', mode);
    document.body.setAttribute('data-sport', sport);

    var header = document.getElementById('chaseHeader');
    if (header) header.classList.add('ca-app-shell');

    var ctx = document.getElementById('caContextBar');
    if (ctx) {
      ctx.hidden = false;
      ctx.classList.add('ca-context-bar');
      var bits = [String(sport).toUpperCase(), String(opts.surface || mode || '')];
      ctx.textContent = bits.filter(Boolean).join(' · ');
      var main = document.querySelector('main');
      if (main) main.classList.add('ca-page-shell', 'ca-shell-main');
    }

    var slot = slotInHeader();
    var sportEl = document.getElementById('sportSelect');
    if (global.ChaseSportSelect && sportEl) {
      ChaseSportSelect.render(sportEl, sport);
      ChaseSportSelect.saveCtx(sport, { surface: opts.surface || 'index' });
    }

    var searchHost = null;
    if (opts.search) {
      searchHost = document.getElementById('caEntitySearch');
      if (!searchHost) {
        searchHost = document.createElement('div');
        searchHost.id = 'caEntitySearch';
        var after = sportEl && sportEl.parentNode;
        if (after) after.insertBefore(searchHost, sportEl.nextSibling);
        else {
          var main = document.querySelector('main');
          if (main) main.insertBefore(searchHost, main.firstChild);
        }
      }
      bindSearch(searchHost);
    }

    return { dataStatusSlot: slot, sport: sport, mode: mode, searchHost: searchHost };
  }

  global.ChaseShell = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
