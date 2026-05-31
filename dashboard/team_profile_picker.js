/**
 * Team Profile — searchable team picker (combobox).
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function logoHtml(team, px, cls) {
    var A = global.MLBMAAssets;
    return A && A.teamLogoImg ? A.teamLogoImg(team, px || 24, cls || 'tp-picker-logo') : '';
  }

  function mount(options) {
    options = options || {};
    var mountEl = typeof options.mount === 'string' ? document.getElementById(options.mount) : options.mount;
    if (!mountEl) return null;

    var teams = options.teams || [];
    var names = options.teamNames || {};
    var onChange = options.onChange || function() {};
    var current = options.value || teams[0];

    var sorted = teams.slice().sort(function(a, b) {
      return String(names[a] || a).localeCompare(String(names[b] || b));
    });

    mountEl.className = 'tp-team-picker';
    mountEl.innerHTML = ''
      + '<button type="button" class="tp-team-picker__trigger" aria-haspopup="listbox" aria-expanded="false">'
      + '<span class="tp-team-picker__logo"></span>'
      + '<span class="tp-team-picker__text">'
      + '<span class="tp-team-picker__abbr"></span>'
      + '<span class="tp-team-picker__sep" aria-hidden="true">·</span>'
      + '<span class="tp-team-picker__name"></span>'
      + '</span>'
      + '<svg class="tp-team-picker__chev" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">'
      + '<path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>'
      + '</svg></button>'
      + '<div class="tp-team-picker__panel" hidden>'
      + '<div class="tp-team-picker__search-wrap">'
      + '<svg class="tp-team-picker__search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
      + '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
      + '<input type="search" class="tp-team-picker__search" placeholder="Search team name or abbr…" autocomplete="off" spellcheck="false" aria-label="Search teams" />'
      + '</div>'
      + '<ul class="tp-team-picker__list" role="listbox"></ul>'
      + '</div>';

    var trigger = mountEl.querySelector('.tp-team-picker__trigger');
    var panel = mountEl.querySelector('.tp-team-picker__panel');
    var search = mountEl.querySelector('.tp-team-picker__search');
    var list = mountEl.querySelector('.tp-team-picker__list');
    var logoSlot = mountEl.querySelector('.tp-team-picker__logo');
    var abbrEl = mountEl.querySelector('.tp-team-picker__abbr');
    var nameEl = mountEl.querySelector('.tp-team-picker__name');
    var isOpen = false;
    var highlightIdx = -1;

    function setValue(team, silent) {
      if (teams.indexOf(team) < 0) return;
      current = team;
      logoSlot.innerHTML = logoHtml(team, 28);
      abbrEl.textContent = team;
      nameEl.textContent = names[team] || team;
      trigger.setAttribute('aria-label', 'Selected team: ' + team + ', ' + (names[team] || team));
      if (!silent) onChange(team);
    }

    function visibleTeams(filter) {
      var q = String(filter || '').trim().toLowerCase();
      return sorted.filter(function(t) {
        if (!q) return true;
        var n = String(names[t] || '').toLowerCase();
        return t.toLowerCase().indexOf(q) >= 0 || n.indexOf(q) >= 0;
      });
    }

    function renderList(filter) {
      var rows = visibleTeams(filter);
      highlightIdx = rows.indexOf(current);
      if (highlightIdx < 0 && rows.length) highlightIdx = 0;
      list.innerHTML = rows.map(function(t, i) {
        return '<li class="tp-team-picker__opt' + (t === current ? ' is-selected' : '')
          + (i === highlightIdx ? ' is-highlight' : '')
          + '" role="option" data-team="' + esc(t) + '" aria-selected="' + (t === current) + '">'
          + logoHtml(t, 24)
          + '<span class="tp-team-picker__opt-text">'
          + '<span class="tp-team-picker__opt-abbr">' + esc(t) + '</span>'
          + '<span class="tp-team-picker__opt-name">' + esc(names[t] || t) + '</span>'
          + '</span></li>';
      }).join('');
      if (!rows.length) {
        list.innerHTML = '<li class="tp-team-picker__empty">No teams match your search</li>';
        highlightIdx = -1;
      }
    }

    function syncHighlight() {
      var opts = list.querySelectorAll('.tp-team-picker__opt');
      opts.forEach(function(el, i) {
        el.classList.toggle('is-highlight', i === highlightIdx);
      });
      var hi = opts[highlightIdx];
      if (hi && typeof hi.scrollIntoView === 'function') {
        hi.scrollIntoView({ block: 'nearest' });
      }
    }

    function openPanel() {
      isOpen = true;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      mountEl.classList.add('is-open');
      search.value = '';
      renderList('');
      window.setTimeout(function() { search.focus(); }, 0);
    }

    function closePanel() {
      isOpen = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      mountEl.classList.remove('is-open');
    }

    function pick(team) {
      if (!team || teams.indexOf(team) < 0) return;
      setValue(team);
      closePanel();
      trigger.focus();
    }

    trigger.addEventListener('click', function() {
      if (isOpen) closePanel();
      else openPanel();
    });

    search.addEventListener('input', function() {
      renderList(search.value);
      syncHighlight();
    });

    search.addEventListener('keydown', function(e) {
      var rows = visibleTeams(search.value);
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        trigger.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!rows.length) return;
        highlightIdx = Math.min(rows.length - 1, highlightIdx + 1);
        renderList(search.value);
        syncHighlight();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        highlightIdx = Math.max(0, highlightIdx - 1);
        renderList(search.value);
        syncHighlight();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIdx >= 0 && rows[highlightIdx]) pick(rows[highlightIdx]);
      }
    });

    list.addEventListener('click', function(e) {
      var opt = e.target.closest('.tp-team-picker__opt');
      if (opt) pick(opt.getAttribute('data-team'));
    });

    list.addEventListener('mousemove', function(e) {
      var opt = e.target.closest('.tp-team-picker__opt');
      if (!opt) return;
      var opts = list.querySelectorAll('.tp-team-picker__opt');
      for (var i = 0; i < opts.length; i++) {
        if (opts[i] === opt) {
          highlightIdx = i;
          syncHighlight();
          break;
        }
      }
    });

    document.addEventListener('click', function(e) {
      if (isOpen && !mountEl.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });

    setValue(current, true);
    renderList('');

    return {
      setValue: function(t) { setValue(t, true); renderList(''); },
      getValue: function() { return current; }
    };
  }

  global.TeamProfilePicker = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
