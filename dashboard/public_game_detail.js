/** Public factual game detail for MLB and NFL. */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function params() {
    try { return new URLSearchParams(global.location.search || ''); }
    catch (error) { return new URLSearchParams(); }
  }

  function clock(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return 'Time Not Published';
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
    }) + ' · ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function publishedTime(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return 'Not Published';
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
    }) + ' · ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function fullName(sport, game, side) {
    return global.ChaseMatchupCard.teamName(sport, game[side], game[side + '_name']);
  }

  function logo(sport, game, side, size, cls) {
    var name = fullName(sport, game, side);
    var src = game[side + '_logo'];
    size = size || 48;
    cls = cls || 'ca-matchup-logo';
    if (src) {
      return '<img class="' + esc(cls) + '" src="' + esc(src) + '" width="' + size +
        '" height="' + size + '" alt="' + esc(name) + ' logo" loading="lazy" decoding="async">';
    }
    return global.ChaseMatchupCard.logoHtml(sport, game[side], game[side + '_name'], size, cls);
  }

  function value(input, fallback) {
    return input == null || input === '' ? (fallback || 'Not Published') : input;
  }

  function gameStatus(game) {
    var state = String(game.game_state || 'scheduled').toLowerCase();
    if (state === 'live') return 'Live';
    if (state === 'final') return 'Final';
    if (state === 'postponed') return 'Postponed';
    if (state === 'delayed') return 'Delayed';
    return 'Scheduled';
  }

  function teamHero(sport, game, side) {
    return '<div class="ca-detail-team ca-detail-team--' + side + '">' +
      logo(sport, game, side, 96, 'ca-detail-team__logo') +
      '<div><h1>' + esc(fullName(sport, game, side)) + '</h1>' +
      '<p>' + esc(value(game[side + '_record'], 'Record Not Published')) + '</p></div></div>';
  }

  function fact(label, content) {
    return '<div class="ca-detail-fact"><span>' + esc(label) + '</span><strong>' + esc(value(content)) + '</strong></div>';
  }

  function list(rows) {
    return '<dl class="ca-detail-list">' + rows.map(function (row) {
      return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(value(row[1])) + '</dd></div>';
    }).join('') + '</dl>';
  }

  function teamPanel(sport, game, side, rows) {
    return '<article class="ca-detail-team-panel"><header class="ca-detail-team-panel__head">' +
      logo(sport, game, side, 44, '') + '<div><h3>' + esc(fullName(sport, game, side)) + '</h3><p>' +
      (side === 'away' ? 'Away' : 'Home') + '</p></div></header>' + list(rows) + '</article>';
  }

  /* The body is wrapped so a later stage can replace just that section.
     Repainting the whole page would throw away the reader's scroll position
     every time another source resolves. */
  /* Each section wears the symbol for what it is about. Eight headings in the
     same weight of the same face read as one undifferentiated stack; a glyph
     in front of each gives the eye somewhere to land when it comes back to the
     page, and the anchor nav below reuses the same symbols so a jump link and
     its destination are obviously the same thing. */
  var SECTION_ICON = {
    starters: 'baseball', arsenal: 'target', lineups: 'lineup',
    'club-splits': 'users',
    recent: 'calendar', form: 'trend', radar: 'gauge', bullpens: 'users',
    availability: 'whistle', scheme: 'football', 'team-context': 'plane',
    projection: 'target', clash: 'football', players: 'users'
  };

  function ico(name, cls, px) {
    return (global.ChaseIcons && ChaseIcons.icon) ? ChaseIcons.icon(name, cls, px) : '';
  }

  function section(id, title, note, body) {
    var glyph = SECTION_ICON[id] ? ico(SECTION_ICON[id], 'ca-detail-section__ico', 18) : '';
    return '<section class="ca-detail-section" id="' + esc(id) + '"><header class="ca-detail-section__head"><h2>' +
      glyph + esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : '') + '</header>' +
      '<div class="ca-detail-section__body" data-body="' + esc(id) + '">' + body + '</div></section>';
  }

  /* The season control changes the evidence on screen. A previous version
     changed only the pressed button, leaving every 2025 table visible under
     "2026 Only". A display scope must never relabel an older sample. */
  function wireSeasonToggle(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-season-scope]');
      if (!btn || !host.contains(btn)) return;
      var group = btn.closest('.ca-season-toggle');
      if (!group) return;
      Array.prototype.forEach.call(group.querySelectorAll('[data-season-scope]'), function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      var scope = btn.getAttribute('data-season-scope');
      var current = Number(group.getAttribute('data-current-season'));
      var visible = 0;
      Array.prototype.forEach.call(host.querySelectorAll('[data-scheme-seasons]'), function (panel) {
        var seasons = String(panel.getAttribute('data-scheme-seasons') || '')
          .split(',').map(Number).filter(Number.isFinite);
        var isCurrentOnly = seasons.length === 1 && seasons[0] === current;
        var show = scope !== 'current' || isCurrentOnly;
        panel.hidden = !show;
        if (show) visible += 1;
      });
      Array.prototype.forEach.call(host.querySelectorAll('[data-season-prior-only]'), function (node) {
        node.hidden = scope === 'current';
      });
      var note = host.querySelector('[data-season-empty]');
      if (note) note.hidden = scope !== 'current' || visible > 0;
      host.setAttribute('data-season-scope', scope);
    });
  }

  function kickoffTime(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return 'Time Not Published';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function activateLineupTab(btn) {
    var board = btn.closest('.ca-lineup-board');
    if (!board) return;
    var unit = btn.getAttribute('data-lineup-unit');
    Array.prototype.forEach.call(board.querySelectorAll('[data-lineup-unit]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(board.querySelectorAll('[data-lineup-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-lineup-panel') !== unit;
    });
  }

  function wireLineupTabs(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-lineup-unit]');
      if (btn && host.contains(btn)) activateLineupTab(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-lineup-unit]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(
        btn.closest('.ca-lineup-tabs').querySelectorAll('[data-lineup-unit]'));
      var step = event.key === 'ArrowRight' ? 1 : -1;
      var next = tabs[(tabs.indexOf(btn) + step + tabs.length) % tabs.length];
      event.preventDefault();
      activateLineupTab(next);
      next.focus();
    });
  }

  function activateSchemeTab(btn) {
    var switcher = btn.closest('.ca-scheme-switch');
    if (!switcher) return;
    var direction = btn.getAttribute('data-scheme-direction');
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-scheme-direction]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-scheme-direction-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-scheme-direction-panel') !== direction;
    });
  }

  function activateCfbCompare(btn) {
    var group = btn.closest('.ca-cfb-compare-tabs');
    if (!group) return;
    var scope = btn.getAttribute('data-cfb-compare');
    var host = group.parentNode;
    Array.prototype.forEach.call(group.querySelectorAll('[data-cfb-compare]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-cfb-compare-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-cfb-compare-panel') !== scope;
    });
  }

  function wireCfbCompare(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-cfb-compare]');
      if (btn && host.contains(btn)) activateCfbCompare(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-cfb-compare]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(
        btn.closest('.ca-cfb-compare-tabs').querySelectorAll('[data-cfb-compare]'));
      var next = tabs[(tabs.indexOf(btn) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      activateCfbCompare(next);
      next.focus();
    });
  }

  function wireSchemeTabs(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-scheme-direction]');
      if (btn && host.contains(btn)) activateSchemeTab(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-scheme-direction]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(btn.closest('.ca-scheme-switch__tabs')
        .querySelectorAll('[data-scheme-direction]'));
      var next = tabs[(tabs.indexOf(btn) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      activateSchemeTab(next);
      next.focus();
    });
  }

  function activatePlayerTab(btn) {
    var switcher = btn.closest('.ca-player-switch');
    if (!switcher) return;
    var side = btn.getAttribute('data-player-side');
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-player-side]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-player-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-player-panel') !== side;
    });
  }

  function wirePlayerTabs(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-player-side]');
      if (btn && host.contains(btn)) activatePlayerTab(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-player-side]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(btn.closest('.ca-player-switch__tabs')
        .querySelectorAll('[data-player-side]'));
      var next = tabs[(tabs.indexOf(btn) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      activatePlayerTab(next);
      next.focus();
    });
  }

  function activateMatchupTab(btn) {
    var switcher = btn.closest('.ca-nfl-matchup-switch');
    if (!switcher) return;
    var side = btn.getAttribute('data-matchup-side');
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-matchup-side]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(switcher.querySelectorAll('[data-matchup-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-matchup-panel') !== side;
    });
  }

  function wireMatchupTabs(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-matchup-side]');
      if (btn && host.contains(btn)) activateMatchupTab(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-matchup-side]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(btn.closest('.ca-scheme-switch__tabs')
        .querySelectorAll('[data-matchup-side]'));
      var next = tabs[(tabs.indexOf(btn) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      activateMatchupTab(next);
      next.focus();
    });
  }

  function activateTeamStatView(btn) {
    var lab = btn.closest('.ca-nfl-lab');
    if (!lab) return;
    var view = btn.getAttribute('data-team-stat-view');
    Array.prototype.forEach.call(lab.querySelectorAll('[data-team-stat-view]'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.setAttribute('tabindex', on ? '0' : '-1');
    });
    Array.prototype.forEach.call(lab.querySelectorAll('[data-team-stat-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-team-stat-panel') !== view;
    });
  }

  function wireTeamStatViews(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-team-stat-view]');
      if (btn && host.contains(btn)) activateTeamStatView(btn);
    });
    host.addEventListener('keydown', function (event) {
      var btn = event.target.closest && event.target.closest('[data-team-stat-view]');
      if (!btn || !host.contains(btn) || ['ArrowLeft', 'ArrowRight'].indexOf(event.key) < 0) return;
      var tabs = Array.prototype.slice.call(btn.closest('[role="tablist"]')
        .querySelectorAll('[data-team-stat-view]'));
      var next = tabs[(tabs.indexOf(btn) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      activateTeamStatView(next);
      next.focus();
    });
  }

  function refreshPlayerFilters(control) {
    var hub = control.closest('.ca-player-research');
    if (!hub) return;
    var position = (hub.querySelector('[data-player-position].is-on') || {}).dataset;
    var family = (hub.querySelector('[data-player-family].is-on') || {}).dataset;
    position = position ? position.playerPosition : 'all';
    family = family ? family.playerFamily : 'overview';
    var visible = 0;
    Array.prototype.forEach.call(hub.querySelectorAll('.ca-player-volume-card'), function (card) {
      var positions = String(card.getAttribute('data-player-position-value') || '').split(',');
      var families = String(card.getAttribute('data-player-families') || '').split(',');
      var show = (position === 'all' || positions.indexOf(position) >= 0) &&
        (family === 'overview' || families.indexOf(family) >= 0);
      card.hidden = !show;
      if (show) visible += 1;
      Array.prototype.forEach.call(card.querySelectorAll('[data-player-stat-family]'), function (stat) {
        var statFamilies = String(stat.getAttribute('data-player-stat-family') || '').split(',');
        stat.hidden = family !== 'overview' && statFamilies.indexOf(family) < 0;
      });
    });
    var splitPanels = hub.querySelector('[data-player-split-panels]');
    if (splitPanels) splitPanels.hidden = family !== 'splits';
    var boards = hub.querySelector('.ca-player-switch');
    if (boards) boards.hidden = family === 'splits';
    var empty = hub.querySelector('[data-player-filter-empty]');
    if (empty) empty.hidden = family === 'splits' || visible > 0;
  }

  function activatePlayerFilter(btn) {
    var group = btn.closest('[data-player-filter-group]');
    if (!group) return;
    var attr = btn.hasAttribute('data-player-position') ? 'data-player-position' : 'data-player-family';
    Array.prototype.forEach.call(group.querySelectorAll('[' + attr + ']'), function (tab) {
      var on = tab === btn;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-pressed', String(on));
    });
    refreshPlayerFilters(btn);
  }

  function wirePlayerFilters(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-player-position], [data-player-family]');
      if (btn && host.contains(btn)) activatePlayerFilter(btn);
    });
  }

  function paintSection(host, id, body) {
    var node = host.querySelector('[data-body="' + id + '"]');
    if (node) node.innerHTML = body;
    if (id === 'radar') fitRadar(host);
  }

  function pending(message) {
    return '<p class="ca-detail-source-note">' + esc(message) + '</p>';
  }

  function lineupState(raw) {
    var state = String(raw || '').toLowerCase();
    if (state.indexOf('confirm') >= 0) return 'Confirmed';
    if (state.indexOf('partial') >= 0) return 'Partial';
    if (state.indexOf('project') >= 0 || state.indexOf('expect') >= 0) return 'Expected';
    return 'Not Published';
  }

  function conditions(game) {
    if (game.conditions) return game.conditions;
    return [game.weather_temp ? game.weather_temp + '°' : '', game.weather_cond, game.weather_wind]
      .filter(Boolean).join(' · ') || 'Not Published';
  }

  function venue(game) {
    return [game.venue, game.venue_city].filter(Boolean).join(' · ') || 'Not Published';
  }

  function scoreOrTime(game) {
    var state = String(game.game_state || '').toLowerCase();
    if ((state === 'live' || state === 'final') && game.away_score != null && game.home_score != null) {
      return '<strong>' + esc(game.away_score) + '–' + esc(game.home_score) + '</strong>' +
        '<p>' + esc(kickoffTime(game.kickoff_utc)) + '</p>';
    }
    return '<strong>' + esc(kickoffTime(game.kickoff_utc)) + '</strong>';
  }

  /* ---------------------------------------------------------------------
   * MLB evidence stack (2026-09-10).
   *
   * The breakdown page rendered five sections that all said "not published".
   * Everything below was reachable the whole time:
   *
   *   starters   /api/v1/people?personIds=... hydrated with season pitching -
   *              one request for both arms, ERA / W-L / WHIP / K / BB / IP.
   *   lineups    the schedule endpoint hydrates `lineups`, which is the real
   *              batting order; the hitters' season lines come from the same
   *              bulk /people call, hydrated with season hitting.
   *   form       dashboard/team_rankings_snapshot.json, already served, gives
   *              OSI / RCV / ABQ / OBR / wRC+ / wOBA / Pitch Score for all 30
   *              clubs. Its `status` family carries projOSI and ppGap, both
   *              model_private, and is never read.
   *
   * Every value is descriptive and league-relative. Ranks are recomputed here
   * from the descriptive value itself so they can never inherit a model's
   * ordering. Nothing is projected, and a field that is not published says so.
   * ------------------------------------------------------------------ */

  /* One line per metric, for the axis tooltip. An axis label of three capital
     letters is a name, not an explanation, and a reader meeting OBR for the
     first time on a radar has nowhere to go for it. */
  var STAT_MEANS = {
    osi: 'Offensive strength index: RCV, ABQ and OBR in one number',
    wrc: 'Runs created per plate appearance, park and league adjusted. 100 is average',
    woba: 'Weighted on-base average: every way of reaching, weighted by run value',
    rcv: 'Run conversion: how often baserunners are turned into runs',
    abq: 'At-bat quality: contact, discipline and damage per plate appearance',
    obr: 'On-base rate quality against the pitching actually faced',
    pitchScore: 'Staff suppression index over K%, walk rate and home runs allowed',
    xwoba: 'Expected wOBA from contact quality, stripped of where balls landed',
    xfip: 'Fielding-independent ERA with home runs normalised to league rate',
    pals: 'Strength of schedule: the quality of pitching this club has faced',
    winPct: 'Share of completed games won',
    f5WinPct: 'Share of games led after five innings',
    pitcherWinPct: 'Share of starts the club has won'
  };

  var STAT_SPECS = {
    osi: { label: 'OSI', digits: 1 },
    wrc: { label: 'wRC+', digits: 0 },
    woba: { label: 'wOBA', digits: 3 },
    rcv: { label: 'RCV', digits: 1 },
    abq: { label: 'ABQ', digits: 1 },
    obr: { label: 'OBR', digits: 1 },
    pitchScore: { label: 'Pitch Score', digits: 0 },
    // Three the producer publishes and the page was not reading. xwOBA was
    // named descriptive_public in the first classification and should never
    // have been withheld; xFIP is the same class of number; SOS describes the
    // run of pitching a club has already faced.
    xwoba: { label: 'xwOBA', digits: 3 },
    xfip: { label: 'xFIP', digits: 2 },
    pals: { label: 'SOS', digits: 1 },
    winPct: { label: 'Win%', digits: 1 },
    f5WinPct: { label: 'F5 Win%', digits: 1 },
    pitcherWinPct: { label: 'SP Win%', digits: 1 }
  };
  // The head-to-head comparison stays the ten that describe how a club scores
  // and what it has faced; the full board below carries the winning family too.
  var FORM_KEYS = ['osi', 'wrc', 'woba', 'xwoba', 'rcv', 'abq', 'obr',
    'pitchScore', 'xfip', 'pals'];
  var BOARD_KEYS = FORM_KEYS.concat(['winPct', 'f5WinPct', 'pitcherWinPct']);

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* One bulk request for every person on the card.
   *
   * `split` is the whole point for hitters. The section is headed "versus RHP"
   * and was showing each batter's OVERALL season line underneath it, which
   * claims a split the numbers do not deliver - the heading and the table
   * disagreed and the heading was the one telling the truth about intent.
   * sitCodes vr / vl return the real thing.
   */
  function loadPeople(ids, group, season, split) {
    var unique = ids.filter(function (id, i) { return id && ids.indexOf(id) === i; });
    if (!unique.length) return Promise.resolve({});
    var type = split ? 'statSplits],sitCodes=[' + split : 'season';
    var url = 'https://statsapi.mlb.com/api/v1/people?personIds=' + unique.join(',') +
      '&hydrate=stats(group=[' + group + '],type=[' + type + '],season=' + season + ')';
    return fetchJson(url).then(function (payload) {
      var byId = {};
      (payload.people || []).forEach(function (person) {
        var stat = {};
        (person.stats || []).forEach(function (block) {
          var split = (block.splits || [])[0];
          if (split && split.stat) stat = split.stat;
        });
        byId[person.id] = {
          name: person.fullName || '',
          bats: (person.batSide || {}).code || '',
          throws: (person.pitchHand || {}).code || '',
          pos: ((person.primaryPosition || {}).abbreviation) || '',
          stat: stat
        };
      });
      return byId;
    }).catch(function () { return {}; });
  }

  /* The unit table below is about the bullpen available for this game, not
     every pitcher who has appeared for the club this season. Start with the
     official active roster on game day, remove rotation arms by their own
     season usage, then add their counting stats before deriving rates. This
     avoids the classic error of averaging twelve pitcher ERAs or percentages.

     The hand splits do not publish earned runs, so ERA is deliberately blank
     there. WHIP, OPS, K%, BB% and HR/9 all have the counting fields required
     to aggregate them exactly. */
  function bullpenStatTotal(people, ids) {
    var sums = {
      outs: 0, bf: 0, so: 0, bb: 0, hits: 0, hbp: 0, ab: 0,
      tb: 0, sf: 0, er: 0, hr: 0, apps: 0, hasEr: false
    };
    ids.forEach(function (id) {
      var stat = ((people || {})[id] || {}).stat || {};
      var outs = Number(stat.outsPitched != null ? stat.outsPitched : stat.outs) || 0;
      sums.outs += outs;
      sums.bf += Number(stat.battersFaced) || 0;
      sums.so += Number(stat.strikeOuts) || 0;
      sums.bb += Number(stat.baseOnBalls) || 0;
      sums.hits += Number(stat.hits) || 0;
      sums.hbp += Number(stat.hitBatsmen) || 0;
      sums.ab += Number(stat.atBats) || 0;
      sums.tb += Number(stat.totalBases) || 0;
      sums.sf += Number(stat.sacFlies) || 0;
      sums.hr += Number(stat.homeRuns) || 0;
      sums.apps += Number(stat.gamesPitched != null ? stat.gamesPitched : stat.gamesPlayed) || 0;
      if (stat.earnedRuns != null && stat.earnedRuns !== '') {
        sums.er += Number(stat.earnedRuns) || 0;
        sums.hasEr = true;
      }
    });
    if (!sums.outs && !sums.bf) return null;
    var obpDen = sums.ab + sums.bb + sums.hbp + sums.sf;
    var obp = obpDen ? (sums.hits + sums.bb + sums.hbp) / obpDen : null;
    var slg = sums.ab ? sums.tb / sums.ab : null;
    return {
      era: sums.hasEr && sums.outs ? (sums.er * 27) / sums.outs : null,
      whip: sums.outs ? ((sums.hits + sums.bb) * 3) / sums.outs : null,
      ops: obp != null && slg != null ? obp + slg : null,
      kPct: sums.bf ? (sums.so / sums.bf) * 100 : null,
      bbPct: sums.bf ? (sums.bb / sums.bf) * 100 : null,
      hr9: sums.outs ? (sums.hr * 27) / sums.outs : null,
      outs: sums.outs,
      apps: sums.apps,
      arms: ids.length
    };
  }

  function loadActiveBullpen(teamId, season, siteCode, dateIso, starterId) {
    if (!teamId) return Promise.resolve(null);
    var rosterUrl = 'https://statsapi.mlb.com/api/v1/teams/' + teamId +
      '/roster?rosterType=active' + (dateIso ? '&date=' + encodeURIComponent(dateIso) : '');
    return fetchJson(rosterUrl).then(function (payload) {
      var ids = (payload.roster || []).filter(function (row) {
        return row && row.person && row.person.id &&
          ((row.position || {}).type === 'Pitcher' || (row.position || {}).abbreviation === 'P');
      }).map(function (row) { return row.person.id; });
      if (!ids.length) return null;
      return Promise.all([
        loadPeople(ids, 'pitching', season),
        loadPeople(ids, 'pitching', season, siteCode),
        loadPeople(ids, 'pitching', season, 'vl'),
        loadPeople(ids, 'pitching', season, 'vr')
      ]).then(function (packs) {
        var overallPeople = packs[0] || {};
        var tonight = starterId == null ? '' : String(starterId);
        var reliefIds = ids.filter(function (id) {
          var stat = (overallPeople[id] || {}).stat;
          return stat && String(id) !== tonight && !isRotationArm(stat);
        });
        return {
          ids: reliefIds,
          people: overallPeople,
          overall: bullpenStatTotal(overallPeople, reliefIds),
          site: bullpenStatTotal(packs[1], reliefIds),
          vsL: bullpenStatTotal(packs[2], reliefIds),
          vsR: bullpenStatTotal(packs[3], reliefIds),
          siteCode: siteCode,
          rosterDate: dateIso || ''
        };
      });
    }).catch(function () { return null; });
  }

  /** Pitch mix for one arm. Usage share, count and average velocity. */
  function loadArsenal(id, season) {
    if (!id) return Promise.resolve(null);
    return fetchJson('https://statsapi.mlb.com/api/v1/people/' + id +
      '/stats?stats=pitchArsenal&season=' + season + '&group=pitching').then(function (payload) {
      var splits = ((payload.stats || [])[0] || {}).splits || [];
      var rows = splits.map(function (split) {
        var stat = split.stat || {};
        return {
          code: (stat.type || {}).code || '',
          name: (stat.type || {}).description || '',
          pct: Number(stat.percentage),
          count: Number(stat.count),
          total: Number(stat.totalPitches),
          speed: Number(stat.averageSpeed)
        };
      }).filter(function (r) { return r.name && isFinite(r.pct); });
      rows.sort(function (a, b) { return b.pct - a.pct; });
      return rows;
    }).catch(function () { return null; });
  }

  /** Ballpark dimensions, surface and roof, from the venue record itself. */
  function loadVenue(id) {
    if (!id) return Promise.resolve(null);
    return fetchJson('https://statsapi.mlb.com/api/v1/venues/' + id +
      '?hydrate=fieldInfo,location').then(function (payload) {
      return (payload.venues || [])[0] || null;
    }).catch(function () { return null; });
  }

  function isoDaysBefore(dateIso, days) {
    var d = new Date((dateIso || '') + 'T12:00:00Z');
    if (isNaN(d.getTime())) d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  /* Who actually came out of the pen, and how much work it cost. Every value
     is read off the official box score of a completed game: appearances,
     pitches thrown, and the date. Nothing here is projected, and a pitcher who
     started that game is excluded by his own gamesStarted line. */
  /* A rotation arm who follows an opener is credited with a relief appearance,
     but his pitches are a start's worth of work on a starter's schedule - not
     bullpen load. Read off his own season line (the box score carries it): at
     least five starts, and starts at least 40% of his appearances. Same rule as
     the published card figure (outputs/publish_public_slate.is_rotation_arm). */
  var ROTATION_MIN_STARTS = 5;
  var ROTATION_START_SHARE = 0.4;

  function isRotationArm(season) {
    var starts = Number((season || {}).gamesStarted) || 0;
    var games = Number((season || {}).gamesPlayed) || 0;
    return starts >= ROTATION_MIN_STARTS && games > 0 && starts / games >= ROTATION_START_SHARE;
  }

  function loadBullpen(teamId, teamCode, dateIso, starterId) {
    if (!teamId) return Promise.resolve(null);
    // The seven days before this game, exclusive of game day itself - one
    // column each, so Last 3 and Last 5 both sit inside the window shown.
    var end = isoDaysBefore(dateIso, 1);
    var start = isoDaysBefore(dateIso, 7);
    return fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + teamId +
      '&startDate=' + start + '&endDate=' + end).then(function (payload) {
      var finals = [];
      (payload.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (g) {
          if (((g.status || {}).abstractGameState || '') === 'Final') {
            finals.push({ pk: g.gamePk, date: block.date || g.officialDate });
          }
        });
      });
      if (!finals.length) {
        return { used: [], bulk: [], starter: null, games: 0, window: start + ' to ' + end,
                 days: dayColumns(start, end) };
      }
      return Promise.all(finals.map(function (game) {
        return fetchJson('https://statsapi.mlb.com/api/v1/game/' + game.pk + '/boxscore')
          .then(function (box) { return { box: box, date: game.date }; })
          .catch(function () { return null; });
      })).then(function (boxes) {
        var byPitcher = {};
        boxes.filter(Boolean).forEach(function (entry) {
          ['away', 'home'].forEach(function (sideKey) {
            var team = (entry.box.teams || {})[sideKey] || {};
            if (String((team.team || {}).id) !== String(teamId)) return;
            (team.pitchers || []).forEach(function (pid) {
              var player = (team.players || {})['ID' + pid];
              var stat = player && player.stats && player.stats.pitching;
              if (!stat) return;
              if (Number(stat.gamesStarted) > 0) return;  // relief appearances only
              var rec = byPitcher[pid] || (byPitcher[pid] = {
                id: pid, name: (player.person || {}).fullName || '', outings: [],
                seasonDate: '', rotation: false
              });
              // The season line as of his latest outing in the window.
              if (entry.date >= rec.seasonDate) {
                rec.seasonDate = entry.date;
                rec.rotation = isRotationArm((player.seasonStats || {}).pitching);
              }
              rec.outings.push({
                date: entry.date,
                pitches: Number(stat.numberOfPitches) || 0,
                innings: stat.inningsPitched || '0.0'
              });
            });
          });
        });
        var arms = Object.keys(byPitcher).map(function (id) {
          var rec = byPitcher[id];
          rec.outings.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
          rec.pitches = rec.outings.reduce(function (sum, o) { return sum + o.pitches; }, 0);
          rec.dates = rec.outings.map(function (o) { return o.date; });
          rec.backToBack = consecutiveDays(rec.dates);
          return rec;
        }).sort(function (a, b) { return b.pitches - a.pitches; });
        // Tonight's starter is not in tonight's bullpen, whatever relief work he
        // did earlier in the week. Rotation arms who worked behind an opener are
        // kept, but apart: their innings are real, they are not pen availability.
        var tonight = starterId == null ? null : String(starterId);
        return {
          used: arms.filter(function (r) { return String(r.id) !== tonight && !r.rotation; }),
          bulk: arms.filter(function (r) { return String(r.id) !== tonight && r.rotation; }),
          starter: arms.filter(function (r) { return String(r.id) === tonight; })[0] || null,
          games: finals.length, window: start + ' to ' + end,
          days: dayColumns(start, end)
        };
      });
    }).catch(function () { return null; });
  }

  /* The days the matrix has a column for, oldest first. Built from the window
     rather than from the outings, so a day nobody pitched still shows as a day
     nobody pitched - which is itself what a workload report is for. */
  function dayColumns(start, end) {
    var out = [];
    var cursor = new Date(start + 'T12:00:00Z');
    var last = new Date(end + 'T12:00:00Z');
    while (cursor <= last && out.length < 10) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  function dayLabel(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return isNaN(d.getTime()) ? iso
      : d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  }

  /* How heavy a day was, on the reading lines a pitching coach uses.

     This is a workload ramp, not a grade: it runs dim to hot, never green to
     red. Fifteen pitches is a light day, not a good one, and colouring it the
     same green that means "elite" three sections up would say something about
     an arm that nobody measured. Only the top of the ramp is coloured, because
     only the top of the ramp is the thing a reader is scanning for. The count
     is printed in the cell, so the shade is always a second reading of it. */
  /* What this arm is used for, read off the season he has already had.
     Saves and holds are records of games finished and leads protected - not a
     depth chart somebody typed, and not a projection. An arm with no shape to
     his usage gets no tag rather than a guessed one, because "Middle" applied
     to everybody says nothing. */
  function relieverRole(stat) {
    if (!stat) return '';
    var saves = Number(stat.saves) || 0;
    var holds = Number(stat.holds) || 0;
    var finished = Number(stat.gamesFinished) || 0;
    var apps = Number(stat.gamesPitched) || 0;
    var innings = parseFloat(stat.inningsPitched) || 0;
    var perApp = apps ? innings / apps : 0;
    if (saves >= 10 || (saves >= 3 && apps >= 10 && finished / apps >= 0.5)) return 'Closer';
    if (holds >= 8) return 'Set-Up';
    if (perApp >= 1.6 && apps >= 8) return 'Long';
    if (holds >= 3) return 'Middle';
    return '';
  }

  function pitchLoad(count) {
    if (!count) return 'p-zero';
    if (count >= 35) return 'p-heavy';
    if (count >= 25) return 'p-full';
    if (count >= 15) return 'p-light';
    return 'p-touch';
  }


  /* The same ramp over a multi-day sum, so Last 3 and Last 5 - the columns a
     reader actually checks before asking who is available - carry the reading
     too, on thresholds scaled to the days they cover. */
  function loadTotal(count, days) {
    if (!count) return 'p-zero';
    var perDay = count / Math.max(days, 1);
    if (perDay >= 20) return 'p-heavy';
    if (perDay >= 13) return 'p-full';
    if (perDay >= 7) return 'p-light';
    return 'p-touch';
  }

  function consecutiveDays(dates) {
    var sorted = dates.slice().sort();
    for (var i = 1; i < sorted.length; i++) {
      var a = new Date(sorted[i - 1] + 'T12:00:00Z').getTime();
      var b = new Date(sorted[i] + 'T12:00:00Z').getTime();
      if (Math.round((b - a) / 86400000) === 1) return true;
    }
    return false;
  }

  var TEAM_CONTEXT_URL = '/data/public/team_context.json';
  var leagueBoardPromise = null;

  /* The whole 30-team board, so the two clubs on this page can be read against
     the league they were ranked in. It is the same artifact the cards already
     use, so the ranks here and the ranks in the section above cannot disagree -
     one ranking service, which is what the architecture asks for. */
  function loadLeagueBoard() {
    if (leagueBoardPromise) return leagueBoardPromise;
    leagueBoardPromise = fetchJson(TEAM_CONTEXT_URL).catch(function () { return null; });
    return leagueBoardPromise;
  }

  var RUN_VALUE_URL = '/data/public/pitch_run_value.json';
  var runValuePromise = null;

  function loadRunValue() {
    if (runValuePromise) return runValuePromise;
    runValuePromise = fetchJson(RUN_VALUE_URL).catch(function () { return null; });
    return runValuePromise;
  }

  var PITCH_BOARD_URL = '/data/public/pitch_type_board.json';
  var pitchBoardPromise = null;

  function loadPitchBoard() {
    if (pitchBoardPromise) return pitchBoardPromise;
    pitchBoardPromise = fetchJson(PITCH_BOARD_URL).catch(function () { return null; });
    return pitchBoardPromise;
  }

  /* The last ten completed games for one club: opponent, score, result.
     The banner on the earlier Chase analysis pages carried this and it is the
     quickest read of form there is - not a rate to interpret, just what has
     been happening. Every value is a final score off the official record. */
  function loadRecentForm(teamId, dateIso) {
    if (!teamId) return Promise.resolve(null);
    var end = isoDaysBefore(dateIso, 1);
    var start = isoDaysBefore(dateIso, 32);
    return fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + teamId +
      '&startDate=' + start + '&endDate=' + end + '&hydrate=team').then(function (payload) {
      var out = [];
      (payload.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (g) {
          if (((g.status || {}).abstractGameState || '') !== 'Final') return;
          var teams = g.teams || {};
          var home = ((teams.home || {}).team || {}).id === teamId;
          var mine = home ? teams.home : teams.away;
          var opp = home ? teams.away : teams.home;
          if (!mine || !opp) return;
          out.push({
            date: g.officialDate || block.date,
            home: home,
            opponent: (opp.team || {}).abbreviation || '',
            scored: mine.score,
            allowed: opp.score,
            won: !!mine.isWinner
          });
        });
      });
      out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return out.slice(-10);
    }).catch(function () { return null; });
  }

  /* An arm's platoon splits and his most recent outing. Both are one request
     each for the two starters on the card, and both were named in the
     architecture as section 3.2 content. */
  function loadArmSplits(ids, season) {
    var unique = ids.filter(Boolean);
    if (!unique.length) return Promise.resolve({});
    return Promise.all(['vl', 'vr'].map(function (sit) {
      return loadPeople(unique, 'pitching', season, sit).then(function (batch) {
        return { sit: sit, batch: batch };
      });
    })).then(function (parts) {
      var out = {};
      parts.forEach(function (part) {
        Object.keys(part.batch).forEach(function (id) {
          out[id] = out[id] || {};
          out[id][part.sit] = part.batch[id].stat;
        });
      });
      return out;
    }).catch(function () { return {}; });
  }

  function loadLastStart(id, season) {
    if (!id) return Promise.resolve(null);
    return fetchJson('https://statsapi.mlb.com/api/v1/people/' + id +
      '?hydrate=stats(group=[pitching],type=[gameLog],season=' + season + ')').then(function (payload) {
      var splits = [];
      ((payload.people || [])[0] || {}).stats && payload.people[0].stats.forEach(function (blk) {
        (blk.splits || []).forEach(function (sp) { splits.push(sp); });
      });
      if (!splits.length) return null;
      splits.sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });
      var last = splits[splits.length - 1];
      var st = last.stat || {};
      return {
        date: last.date || '',
        innings: st.inningsPitched != null ? st.inningsPitched : '\u2014',
        pitches: st.numberOfPitches != null ? st.numberOfPitches : '\u2014',
        strikeOuts: st.strikeOuts != null ? st.strikeOuts : '\u2014',
        baseOnBalls: st.baseOnBalls != null ? st.baseOnBalls : '\u2014',
        earnedRuns: st.earnedRuns != null ? st.earnedRuns : '\u2014'
      };
    }).catch(function () { return null; });
  }

  var STARTER_SPLITS_URL = '/data/public/starter_splits.json';
  var starterSplitsPromise = null;

  function loadStarterSplits() {
    if (starterSplitsPromise) return starterSplitsPromise;
    starterSplitsPromise = fetchJson(STARTER_SPLITS_URL).catch(function () { return null; });
    return starterSplitsPromise;
  }

  function seasonOf(dateIso) {
    var y = parseInt(String(dateIso || '').slice(0, 4), 10);
    return isFinite(y) ? y : new Date().getFullYear();
  }

  /* -------- rendering -------- */

  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  }

  /* The bar is the league percentile of the value beside it and nothing else.
     Rank 1 of 30 fills it, rank 30 of 30 empties it. It never encodes a
     rating, a projection, or an ordering borrowed from anywhere else. */
  /* One place that decides what a rank's colour means, so a 4th of 30 looks the
     same wherever it appears. The number is always printed, so the colour is a
     second reading of a fact that is already legible without it. */
  function rankTone(rank, of) {
    var A = global.MLBMAAssets;
    return A && A.rankChipClass ? A.rankChipClass(rank, of) : '';
  }

  function rankBadge(entry) {
    if (!entry || !(entry.of > 1)) return '';
    return '<span class="ca-rank ' + rankTone(entry.rank, entry.of) + '">' +
      entry.rank + ordinal(entry.rank) + '</span>';
  }

  function percentBar(rank, of) {
    if (!(of > 1) || !(rank >= 1)) return '';
    var pct = Math.round(((of - rank) / (of - 1)) * 100);
    return segmentedMeter(pct, rankTone(rank, of), pct +
      ' percent of clubs rate below this value');
  }

  function segmentedMeter(percent, tone, label, reverse) {
    var pct = Math.max(0, Math.min(100, Number(percent) || 0));
    var active = Math.max(0, Math.min(10, Math.round(pct / 10)));
    var cells = '';
    for (var i = 0; i < 10; i += 1) {
      cells += '<i' + (i < active ? ' class="is-on"' : '') + '></i>';
    }
    return '<span class="ca-segment-meter ' + esc(tone || 'c-mid') +
      (reverse ? ' is-reverse' : '') + '" role="img" aria-label="' + esc(label) + '">' +
      cells + '</span>';
  }

  function formatStat(input, digits) {
    var v = Number(input);
    if (!isFinite(v)) return '';
    return digits === 3 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(digits);
  }

  function statCell(entry, spec) {
    if (!entry || !spec) return '';
    // The producer ships a label with each entry; it is the one that knows
    // which metric it computed, so it wins over the local table.
    if (entry.label) spec = { label: entry.label, digits: spec.digits };
    var shown = formatStat(entry.value, spec.digits);
    if (!shown) return '';
    return '<div class="ca-form-cell">' +
      '<span class="ca-form-label">' + esc(spec.label) + '</span>' +
      '<strong class="ca-form-value">' + esc(shown) + '</strong>' +
      percentBar(entry.rank, entry.of) +
      '<span class="ca-form-rank ' + rankTone(entry.rank, entry.of) + '">' +
      entry.rank + ordinal(entry.rank) + ' Of ' + entry.of + '</span>' +
      '</div>';
  }

  /* ---------------------------------------------------------------------
   * The mirrored comparison row.
   *
   * Two clubs in two separate panels is not a comparison - the eye has to
   * carry a number across a gutter and hold it while it finds the other one.
   * The legacy Chase card put both on one axis and let the bars meet in the
   * middle, and that is the piece of the old product most worth restoring.
   *
   * Each row is one metric: away value, away bar growing leftward from the
   * centre, the metric's name, home bar growing rightward, home value. The
   * bars are league percentiles of that rate, so the longer bar is the better
   * season and the reader never has to know the scale. Rank sits under each
   * value, because a bar without its rank is a picture and a rank without its
   * bar is a number.
   * ------------------------------------------------------------------ */
  /* A club's own published brand colour. Using it for identity is not the same
     as using colour to grade a number: the bar's LENGTH still carries the
     value and the rank still sits beside it, so the hue only answers "whose
     side is this" - which is the question a two-sided chart otherwise makes
     the reader answer by counting columns. */
  function clubColour(sport, game, side) {
    var published = game[side + '_color'];
    if (published) {
      var hex = String(published).trim();
      if (hex.charAt(0) !== '#') hex = '#' + hex;
      if (/^#[0-9A-Fa-f]{3,8}$/.test(hex)) return hex;
    }
    if (!(global.MLBMAAssets && MLBMAAssets.teamBarColor)) return null;
    // The bar variant, not the raw brand hex: half the MLB league is navy, and
    // a navy bar on a near-black panel is an invisible bar.
    return MLBMAAssets.teamBarColor(game[side], sport) || null;
  }

  function clubStyle(sport, game, side) {
    var colour = clubColour(sport, game, side);
    return colour ? ' style="--club:' + esc(colour) + '"' : '';
  }

  function titleCase(text) {
    if (global.MLBMAAssets && MLBMAAssets.titleCaseLabel) {
      return MLBMAAssets.titleCaseLabel(text);
    }
    return String(text || '').replace(/([a-z])/g, function (m, ch) {
      return ch.toUpperCase();
    });
  }

  function percentOf(entry) {
    var place = entry && (entry.rank || entry.place);
    if (!entry || !(entry.of > 1) || !(place >= 1)) return null;
    return ((entry.of - place) / (entry.of - 1)) * 100;
  }

  function mirrorRow(label, away, home, format, styles) {
    styles = styles || { away: '', home: '' };
    if (!away && !home) return '';
    var awayPct = percentOf(away), homePct = percentOf(home);
    // The side with the better season carries the emphasis, so a scan down the
    // column shows who wins each row without reading a single number.
    // Every row takes a side. A four-point dead band left rows uncoloured and
    // the reader unsure whether that meant "level" or "not computed".
    var lead = '';
    if (awayPct != null && homePct != null && awayPct !== homePct) {
      lead = awayPct > homePct ? ' is-away' : ' is-home';
    }
    function side(entry, pct, which) {
      // The side is carried in a class rather than inferred from position:
      // every child of the row is a span, so a :first-of-type rule matches the
      // value and silently leaves the bar unmirrored.
      var track = 'ca-mirror__track ca-mirror__track--' + which;
      var val = 'ca-mirror__value ca-mirror__value--' + which;
      if (!entry) {
        var blank = '<span class="' + val + ' is-absent">&mdash;</span>';
        return which === 'away'
          ? blank + '<span class="' + track + '"></span>'
          : '<span class="' + track + '"></span>' + blank;
      }
      var bar = '<span class="' + track + '">' + segmentedMeter(
        pct == null ? 0 : pct, rankTone(entry.rank, entry.of),
        (pct == null ? 0 : Math.round(pct)) + ' league percentile', which === 'away') + '</span>';
      // The grade class goes on the value, so the figure and the rank beneath
      // it carry the same reading - and the row's winner is left to the bars.
      var value = '<span class="' + val + ' ' + rankTone(entry.rank, entry.of) + '">' +
        esc(format(entry.value)) +
        '<i>' + entry.rank + ordinal(entry.rank) + '</i></span>';
      return which === 'away' ? value + bar : bar + value;
    }
    return '<div class="ca-mirror__row' + lead + '"' +
      (styles.rowStyle || '') + '>' +
      side(away, awayPct, 'away') +
      '<span class="ca-mirror__label">' +
      (styles.labelHtml != null ? styles.labelHtml : esc(label)) + '</span>' +
      side(home, homePct, 'home') + '</div>';
  }

  function clubPair(sport, game, left, right) {
    left = left || 'away';
    right = right || 'home';
    var a = clubColour(sport, game, left);
    var h = clubColour(sport, game, right);
    return {
      away: a || '', home: h || '',
      rowStyle: (a || h)
        ? ' style="' + (a ? '--club-away:' + esc(a) + ';' : '') +
          (h ? '--club-home:' + esc(h) + ';' : '') + '"'
        : ''
    };
  }

  function mirrorTable(sport, game, keys, specs, source) {
    var awayCtx = source(game, 'away') || {};
    var homeCtx = source(game, 'home') || {};
    var rows = keys.map(function (key) {
      var spec = specs[key];
      if (!spec) return '';
      return mirrorRow(spec.label, awayCtx[key], homeCtx[key], function (v) {
        return formatStat(v, spec.digits) || '\u2014';
      }, clubPair(sport, game));
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-mirror">' +
      '<div class="ca-mirror__head">' +
      '<span class="ca-mirror__team">' + logo(sport, game, 'away', 28, 'ca-mirror__crest') +
      esc(fullName(sport, game, 'away')) + '</span>' +
      '<span class="ca-mirror__axis">Percentile Of The League Pool</span>' +
      '<span class="ca-mirror__team ca-mirror__team--home">' +
      esc(fullName(sport, game, 'home')) +
      logo(sport, game, 'home', 28, 'ca-mirror__crest') + '</span>' +
      '</div>' + rows + '</div>';
  }

  function formPanel(sport, game, side) {
    var ctx = game[side + '_context'];
    var label = fullName(sport, game, side);
    if (!ctx) {
      return '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>' +
        '<p class="ca-detail-source-note">Team form is not published for this club.</p></section>';
    }
    var cells = FORM_KEYS.map(function (key) {
      return statCell(ctx[key], STAT_SPECS[key]);
    }).filter(Boolean).join('');
    return '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>' +
      '<div class="ca-form-grid">' + cells + '</div></section>';
  }

  /* Rates the season line implies but does not carry. Each is a plain quotient
     of two published counting stats, so it is exactly as factual as its
     inputs; where an input is missing the rate is simply absent. */
  /* Innings pitched arrive as "119.1", which is 119 innings and one out - not
     119.1 innings. Treating it as a decimal quietly mis-states every rate built
     on it. */
  function inningsToOuts(ip) {
    var parts = String(ip == null ? '' : ip).split('.');
    var whole = parseInt(parts[0], 10);
    if (!isFinite(whole)) return null;
    return whole * 3 + (parts[1] ? parseInt(parts[1], 10) : 0);
  }

  function inningsValue(ip) {
    var outs = inningsToOuts(ip);
    return outs == null ? null : outs / 3;
  }

  /* Fielding Independent Pitching over the three outcomes a pitcher controls
     alone. It is a plain arithmetic combination of published counting stats -
     the same class of number as K% - and it is stated with its constant so the
     reader can see the whole of it. */
  var FIP_CONSTANT = 3.15;

  function fip(stat) {
    var ip = inningsValue(stat.inningsPitched);
    if (!ip) return null;
    var hr = Number(stat.homeRuns), bb = Number(stat.baseOnBalls);
    var hbp = Number(stat.hitBatsmen || 0), k = Number(stat.strikeOuts);
    if (![hr, bb, k].every(isFinite)) return null;
    return ((13 * hr) + (3 * (bb + (isFinite(hbp) ? hbp : 0))) - (2 * k)) / ip + FIP_CONSTANT;
  }

  /* A number that carries its own grade, off the published league baseline of
     the population it belongs to - a starter's split against every qualified
     starter's line in that split, a batter against batters, a club against
     clubs - so the reader does not have to know what a good ERA is this season.

     The fixed ramps that used to sit here are gone: Pitch Score was cut around
     50 on a 75/60/40/25 ladder, QS% around a typed-in "two starts in five",
     OPS+ at +-5/+-15, and allowed OPS was a HITTER club baseline flipped over.
     None of those was the league's distribution. With no baseline the cell is
     left ungraded rather than painted a neutral that would claim "average". */
  function gradeFor(value, context) {
    var A = global.MLBMAAssets;
    var n = Number(value);
    if (value == null || value === '' || !isFinite(n) || !A || !A.valueTier) return '';
    var tier = A.valueTier(n, context);
    return tier ? A.TIER_CHIP[tier] : '';
  }

  /* A published 0-100 percentile is already a place in its league, so it takes
     the rank scale directly. */
  function percentileClass(percentile) {
    var A = global.MLBMAAssets;
    var p = Number(percentile);
    if (percentile == null || !isFinite(p) || !A || !A.percentileTier) return '';
    var tier = A.percentileTier(p / 100);
    return tier ? A.TIER_CHIP[tier] : '';
  }

  function starterPanel(sport, game, side, people, splitBank) {
    var label = fullName(sport, game, side);
    var id = game[side + '_starter_id'];
    var person = people[id];
    var bank = ((splitBank && splitBank.starters) || {})[String(id)];
    var name = person ? person.name : (game[side + '_starter'] || 'Probable Starter Not Published');
    var stat = (person && person.stat) || {};
    var hand = (person && person.throws) || String(game[side + '_hand'] || '').toUpperCase();
    var handLabel = hand === 'L' ? 'LHP' : (hand === 'R' ? 'RHP' : '');
    // The season line, kept as the one anchor the splits below are read
    // against - a .620 OPS allowed to left-handers means nothing without the
    // number the same arm posts overall.
    /* The four the header carries are the season's summary, and they are
       deliberately NOT the four the splits table repeats underneath. xFIP and
       WHIP live in the table, split four ways, where they say more; the header
       carries the two that only exist at season level - how often he gives his
       club a start worth having, and how his stuff rates against the rest of
       the league's starters. */
    var seasonBank = ((bank && bank.splits) || {});
    var anySplit = seasonBank.home || seasonBank.away || seasonBank.vs_rhh || seasonBank.vs_lhh || {};
    var headline = [
      ['ERA', stat.era, gradeFor(stat.era, 'era')],
      // Season-level indices, graded against the starters they were built from.
      ['Pitch Score', anySplit.pitch_score, gradeFor(anySplit.pitch_score, 'sp_pitch_score')],
      ['QS%', anySplit.qs_pct == null ? null : anySplit.qs_pct + '%', gradeFor(anySplit.qs_pct, 'sp_qs_pct')],
      ['IP', stat.inningsPitched, '']
    ].map(function (row) {
      if (row[1] == null) return '';
      return '<div class="ca-stat"><span class="ca-stat__label">' + esc(row[0]) +
        '</span><strong class="ca-stat__value ' + row[2] + '">' + esc(row[1]) +
        '</strong></div>';
    }).join('');
    /* The whole panel is splits now, as rates. It used to print 55 strikeouts
       and 243 batters faced and leave the reader to divide - which is how a
       counting stat ends up reading like a rate it is not.

       Columns are chosen from the data rather than fixed, because the source
       splits different things by different dimensions: ERA is attributable to
       a park but not to the hand of the man at the plate, OPS allowed is the
       reverse, and xFIP is currently empty for every starter in the league.
       A column nobody in this table has a value for is not rendered, so the
       table shows gaps only where a gap is real - and xFIP appears on its own
       the day the pipeline starts producing it. */
    // Shorthand, because ten columns in a half-width panel leave the label
    // column about seven characters before "Vs Right-Handed" breaks over three
    // lines and the table stops being scannable. The note spells them out.
    var SPLIT_ROWS = [
      ['Vs LHH', 'vs_lhh'],
      ['Vs RHH', 'vs_rhh'],
      ['Home', 'home'],
      ['Road', 'away']
    ];
    // key, header, baseline stat, suffix. Each cell grades against the league
    // distribution of that stat IN THAT SPLIT (context sp_<split>_<stat>, every
    // qualified starter's line), because a line against left-handed batters and
    // a road line are different populations. Direction travels with the
    // published baseline: OPS allowed is low-is-good, OPS+ high-is-good.
    var SPLIT_COLS = [
      // WHIP rather than ERA. ERA cannot exist on a batter-hand cut - an
      // earned run belongs to an inning, not to the handedness of one plate
      // appearance - so an ERA column left two of the four rows empty for a
      // reason no reader could be expected to infer. WHIP is attributable to
      // every split, carries the same kind of information, and the table has
      // no holes in it.
      ['whip', 'WHIP', 'whip', ''],
      // xFIP, not FIP. FIP still carries the home runs this arm actually gave
      // up, which on a two-month split is mostly the park and the luck; xFIP
      // is the same formula with that term normalised, and it is the one of
      // the two worth a column when there is only room for one.
      ['xfip', 'xFIP', 'xfip', ''],
      ['k_pct', 'K%', 'kpct', '%'],
      ['bb_pct', 'BB%', 'bbpct', '%'],
      ['hr9', 'HR/9', null, ''],
      ['ops', 'OPS', 'ops', ''],
      ['ops_plus', 'OPS+', 'ops_plus', ''],
      ['pitches_per_inning', 'P/IP', null, '']
    ];

    var banks = SPLIT_ROWS.map(function (row) {
      return [row[0], ((bank && bank.splits) || {})[row[1]], row[1]];
    }).filter(function (pair) { return !!pair[1]; });

    var cols = SPLIT_COLS.filter(function (col) {
      return banks.some(function (pair) { return pair[1][col[0]] != null; });
    });

    var splitBody = !banks.length ? '' : banks.map(function (pair) {
      var st = pair[1];
      var cells = cols.map(function (col) {
        var v = st[col[0]];
        if (v == null) return '<td class="num">&mdash;</td>';
        var cls = col[2] ? gradeFor(v, 'sp_' + pair[2] + '_' + col[2]) : '';
        return '<td class="num ' + cls + '">' + esc(v) + col[3] + '</td>';
      }).join('');
      return '<tr><td>' + esc(pair[0]) + '</td>' + cells + '</tr>';
    }).join('');

    var splitHtml = splitBody
      ? '<div class="ca-split-block"><h4>Splits</h4><div class="ca-lineup-scroll">' +
        '<table class="ca-lineup-table ca-split-table"><thead><tr><th>Split</th>' +
        cols.map(function (col) { return '<th class="num">' + esc(col[1]) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + splitBody + '</tbody></table></div>' +
        '</div>'
      : '';
    var lastHtml = '';
    if (person && person.lastStart) {
      var ls = person.lastStart;
      lastHtml = '<p class="ca-last-start"><span>Last Start</span>' +
        esc(ls.date) + ' \u00b7 ' + esc(ls.innings) + ' IP \u00b7 ' +
        esc(ls.pitches) + ' pitches \u00b7 ' + esc(ls.strikeOuts) + ' K \u00b7 ' +
        esc(ls.baseOnBalls) + ' BB \u00b7 ' + esc(ls.earnedRuns) + ' ER</p>';
    }
    var shot = '';
    if (id && global.MLBMAAssets && MLBMAAssets.headshotUrl) {
      shot = '<img class="ca-starter-shot" src="' + esc(MLBMAAssets.headshotUrl(id, 72, 'profile')) +
        '" width="72" height="72" alt="' + esc(name) + '" loading="lazy" decoding="async">';
    }
    return '<section class="ca-starter-panel">' +
      '<header class="ca-starter-head">' + shot +
      '<div><p class="ca-starter-team">' + esc(label) + (handLabel ? ' \u00b7 ' + handLabel : '') + '</p>' +
      '<h3 class="ca-starter-name">' + esc(name) + '</h3></div></header>' +
      (headline ? '<div class="ca-stat-row">' + headline + '</div>' : '') +
      lastHtml + splitHtml + '</section>';
  }

  /* The centrepiece: one lineup against the other side's arm, with the context
     the fixture already resolves stated rather than left to a filter. */
  function lineupPanel(sport, game, side, people, oppLabel, oppHand) {
    var players = game[side + '_lineup'] || [];
    var teamLabel = fullName(sport, game, side);
    // The heading names the split the numbers actually are. It used to name the
    // opposing starter, which reads as "this lineup against this man" while the
    // figures underneath were season totals against everyone.
    var handLabel = oppHand === 'L' ? 'Left-Handed Pitching'
      : (oppHand === 'R' ? 'Right-Handed Pitching' : 'All Pitching');
    var context = teamLabel + ' \u00b7 ' + (side === 'away' ? 'Away' : 'Home') +
      ' \u00b7 ' + handLabel + ' \u00b7 ' + seasonOf(game.kickoff_utc) + ' Season' +
      (oppLabel ? ' \u00b7 ' + oppLabel + ' Starts' : '');

    if (!players.length) {
      return '<section class="ca-lineup-panel"><h3>' + esc(teamLabel) + ' Versus ' +
        esc(handLabel) + '</h3>' +
        '<p class="ca-lineup-context">' + esc(context) + '</p>' +
        '<p class="ca-detail-source-note">Batting order not published yet \u2014 status: ' +
        esc(lineupState(game[side + '_lineup_state'])) +
        '. It appears here as soon as the club posts it.</p></section>';
    }

    // A batter is graded against every qualified batter on the same split, not
    // against the thirty clubs: one hitter's OPS versus one hand spreads three
    // to four times wider than a club's, so the club baseline saturated nearly
    // every row to elite or poor.
    var split = oppHand === 'L' ? 'vl' : (oppHand === 'R' ? 'vr' : 'season');
    var rows = players.map(function (pl, i) {
      var person = people[pl.id] || {};
      var stat = person.stat || {};
      function cell(key, context) {
        var v = stat[key];
        if (v == null) return '<td class="num">&mdash;</td>';
        return '<td class="num ' + gradeFor(v, 'bat_' + split + '_' + context) + '">' + esc(v) + '</td>';
      }
      return '<tr>' +
        '<td class="ca-lineup-slot">' + (i + 1) + '</td>' +
        '<td class="ca-lineup-name">' + esc(person.name || pl.fullName || '') + '</td>' +
        '<td class="ca-lineup-bats">' + esc(person.bats || '\u2014') + '</td>' +
        cell('avg', 'avg') + cell('obp', 'obp') + cell('slg', 'slg') + cell('ops', 'ops') +
        '</tr>';
    }).join('');

    // The heading was the club's full name, then a line under it repeating the
    // club, the side, the handedness, the season and the opposing starter. The
    // crest says which club without spending a line on it, and the handedness
    // is the one thing the heading has to carry - it is what the numbers
    // underneath are split by. The rest moves to the note at the foot.
    return '<section class="ca-lineup-panel">' +
      '<h3 class="ca-lineup-head">' + logo(sport, game, side, 26, 'ca-lineup-head__crest') +
      '<span>Versus ' + esc(handLabel) + '</span></h3>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>#</th><th>Batter</th><th class="ca-lineup-bats">Bats</th>' +
      '<th class="num">AVG</th><th class="num">OBP</th>' +
      '<th class="num">SLG</th><th class="num">OPS</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">' + esc(context) + '. Every figure is that ' +
      'batter against ' + esc(handLabel) + ' this season, not his overall line. Colour ' +
      'grades each rate against the league average for it.</p></section>';
  }

  /* A usage bar is the pitcher's own share of his own pitches. The sample is
     printed beside it so a 6% offering is never read as a pattern. */
  /* Pitch families, so an arsenal reads by shape before it is read by number.
     These are categories, not a scale - a slider is not "better" than a
     fastball - so they take the series palette rather than the metric ramp. */
  var PITCH_FAMILY = {
    FF: 'heat', FA: 'heat', FT: 'heat', SI: 'heat', FC: 'heat',
    SL: 'break', ST: 'break', CU: 'break', KC: 'break', SV: 'break', SC: 'break',
    CH: 'offspeed', FS: 'offspeed', FO: 'offspeed', EP: 'offspeed',
    KN: 'other'
  };

  /* How heavily an offering is leaned on. These are the conventional reading
     lines for a starter's mix: a third of everything is the pitch he lives on,
     under a tenth is a look he shows. */
  /* Ten squares, one per ten per cent of the mix, filled to the share this
     pitch takes. A square grid is read at a glance the way a bar is not: four
     filled is "about forty per cent" without the eye going to the number, and
     the number is printed beside it anyway. */
  function usageSquares(pct) {
    var filled = Math.round(Math.max(0, Math.min(100, pct)) / 10);
    var cells = '';
    for (var i = 0; i < 10; i++) {
      cells += '<i' + (i < filled ? ' class="is-on"' : '') + '></i>';
    }
    return '<span class="ca-usage__grid" aria-hidden="true">' + cells + '</span>';
  }

  function usageTone(pct) {
    if (pct >= 30) return 'u-primary';
    if (pct >= 18) return 'u-secondary';
    if (pct >= 9) return 'u-tertiary';
    return 'u-rare';
  }

  function pitchFamily(code) {
    return PITCH_FAMILY[String(code || '').toUpperCase()] || 'other';
  }

  /* Run value per 100 pitches, from the pitcher's side: positive is runs the
     pitch saved. Graded on its percentile against every pitcher throwing that
     same pitch type, because a +1.0 slider and a +1.0 four-seamer are not the
     same achievement - the distributions differ and one pool would say they
     were the same. */
  function rvCell(entry) {
    if (!entry || entry.run_value_per_100 == null) return '<td class="num">&mdash;</td>';
    var v = entry.run_value_per_100;
    var tone = percentileClass(entry.percentile);
    var badge = entry.percentile == null ? ''
      : '<span class="ca-rank ' + tone + '">' + Math.round(entry.percentile) + 'th</span>';
    return '<td class="num ' + tone + '">' + esc((v > 0 ? '+' : '') + v.toFixed(1)) +
      badge + '</td>';
  }

  function arsenalPanel(sport, game, side, people, rows, boards, runValue) {
    // The away starter faces the home lineup, and the other way round.
    var oppSide = side === 'away' ? 'home' : 'away';
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var board = ((boards && boards.teams) || {})[canon(game[oppSide])] || null;
    var arm = ((runValue && runValue.pitchers) || {})[String(game[side + '_starter_id'])] || null;
    var oppLabel = fullName(sport, game, oppSide);
    var id = game[side + '_starter_id'];
    var name = (people[id] && people[id].name) || game[side + '_starter'] || 'Probable starter';
    var head = '<section class="ca-arsenal-panel"><h3>' + esc(name) + '</h3>' +
      '<p class="ca-lineup-context">' + esc(fullName(sport, game, side)) + ' \u00b7 season to date</p>';
    if (rows === null || rows === undefined) {
      return head + pending('Pitch mix is loading.') + '</section>';
    }
    if (!rows.length) {
      return head + pending('No tracked pitches published for this arm this season.') + '</section>';
    }
    var total = rows[0].total;
    /* A table, because these are five parallel readings of the same shape and a
       column of them is read down, not across. Usage is graded by how heavily
       the pitch is leaned on - a 36% offering is the pitch, a 5% one is a look
       - and the number is printed beside the bar, so the colour is a second
       reading of something already legible. */
    var body = rows.map(function (row) {
      var pct = row.pct * 100;
      var opp = (board || {})[row.code];
      var rv = ((arm && arm.pitches) || {})[row.code];
      return '<tr data-pitch="' + esc(pitchFamily(row.code)) + '">' +
        '<td class="ca-lineup-name">' + esc(row.name) + '</td>' +
        '<td class="num"><span class="ca-usage ' + usageTone(pct) + '">' +
        usageSquares(pct) + '<b>' + pct.toFixed(1) + '%</b></span></td>' +
        '<td class="num">' + row.count.toLocaleString('en-US') + '</td>' +
        '<td class="num">' + (isFinite(row.speed) ? row.speed.toFixed(1) : '\u2014') + '</td>' +
        rvCell(rv) +
        '<td class="num">' + (opp && opp.xwoba
          ? esc(formatStat(opp.xwoba.value, 3)) + rankBadge(opp.xwoba) : '\u2014') + '</td>' +
        '<td class="num">' + (opp && opp.contact_rate
          ? opp.contact_rate.value.toFixed(1) + '%' + rankBadge(opp.contact_rate) : '\u2014') + '</td>' +
        '</tr>';
    }).join('');

    return head +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-arsenal-table">' +
      '<thead><tr><th>Pitch</th><th class="num">Usage</th><th class="num">Count</th>' +
      '<th class="num">MPH</th><th class="num">RV/100</th>' +
      '<th class="num">' + esc(oppLabel) + ' xwOBA</th>' +
      '<th class="num">Contact</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">' +
      (isFinite(total) ? total.toLocaleString('en-US') + ' tracked pitches' : 'Sample not published') +
      '. Usage is this pitcher\u2019s share of his own pitches, so the column sums to 100%. ' +
      'The last two columns are how ' + esc(oppLabel) + ' has hit that pitch this season, ' +
      'ranked among clubs with a comparable sample. Contact is the share of swings that ' +
      'touched the ball \u2014 the same measurement as whiff rate, read the way the rest of ' +
      'this row reads, so higher is better for the hitting club throughout.</p></section>';
  }

  /* Conditions as separate facts with a symbol, not one run-on string.
     "79\u00b0 \u00b7 Cloudy \u00b7 10 mph, R To L" is four facts crushed into one line of
     small grey type, which is the same weight as everything around it and so
     gets read by nobody. */
  var WX_GLYPH = {
    clear: '<circle cx="12" cy="12" r="5"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<path d="M12 1v2M12 21v2M23 12h-2M3 12H1M19.8 4.2l-1.4 1.4M5.6 18.4l-1.4 1.4M19.8 19.8l-1.4-1.4M5.6 5.6L4.2 4.2"/></g>',
    partly: '<circle cx="8" cy="8" r="3.6"/><path d="M10 20.4a4.4 4.4 0 0 1-.4-8.8 6 6 0 0 1 11.3 1.6 3.7 3.7 0 0 1-.8 7.2z"/>',
    cloudy: '<path d="M6.8 19.8a4.9 4.9 0 0 1-.5-9.8 6.7 6.7 0 0 1 12.8 1.8 4.2 4.2 0 0 1-.9 8z"/>',
    rain: '<path d="M6.8 15.4a4.9 4.9 0 0 1-.5-9.8 6.7 6.7 0 0 1 12.8 1.8 4.2 4.2 0 0 1-.9 8z"/>' +
      '<g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 18l-1 3.4M12 18l-1 3.4M16 18l-1 3.4"/></g>',
    snow: '<path d="M6.8 15.4a4.9 4.9 0 0 1-.5-9.8 6.7 6.7 0 0 1 12.8 1.8 4.2 4.2 0 0 1-.9 8z"/>' +
      '<g stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 19.4h1.6M14.4 19.4H16M9.8 18.4V21M15.2 18.4V21"/></g>',
    storm: '<path d="M6.8 14a4.9 4.9 0 0 1-.5-9.8 6.7 6.7 0 0 1 12.8 1.8 4.2 4.2 0 0 1-.9 8z"/>' +
      '<path d="M13.2 14.2L9 19.6h3.3l-1.5 3.9 5.1-6.3h-3.4z"/>',
    wind: '<g stroke="currentColor" stroke-width="2.1" stroke-linecap="round" fill="none">' +
      '<path d="M3 9.2h11a3 3 0 1 0-3-3M3 14.6h13.8a3 3 0 1 1-3 3M3 19.5h7.5"/></g>',
    roof: '<path d="M12 3L2.4 9.6h2.2V21h14.8V9.6h2.2z" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linejoin="round"/>'
  };

  function wxKey(game) {
    var roof = String(game.roof || '').toLowerCase();
    if (roof.indexOf('closed') >= 0 || roof.indexOf('dome') >= 0 || roof.indexOf('indoor') >= 0) return 'roof';
    var text = (String(game.conditions || '') + ' ' + String(game.weather_cond || '')).toLowerCase();
    if (!text.trim()) return null;
    if (text.indexOf('dome') >= 0 || text.indexOf('roof closed') >= 0) return 'roof';
    if (text.indexOf('thunder') >= 0 || text.indexOf('storm') >= 0) return 'storm';
    if (text.indexOf('snow') >= 0 || text.indexOf('sleet') >= 0) return 'snow';
    if (text.indexOf('rain') >= 0 || text.indexOf('drizzle') >= 0 || text.indexOf('shower') >= 0) return 'rain';
    if (text.indexOf('partly') >= 0 || text.indexOf('mostly sunny') >= 0) return 'partly';
    if (text.indexOf('cloud') >= 0 || text.indexOf('overcast') >= 0) return 'cloudy';
    if (text.indexOf('clear') >= 0 || text.indexOf('sunny') >= 0 || text.indexOf('fair') >= 0) return 'clear';
    if (text.indexOf('wind') >= 0 || text.indexOf('breez') >= 0) return 'wind';
    return null;
  }

  function wxGlyph(key, cls) {
    if (!key) return '';
    return '<svg class="' + (cls || 'ca-wx-glyph') + '" viewBox="0 0 24 24" width="28" height="28" ' +
      'aria-hidden="true" focusable="false" fill="currentColor">' + WX_GLYPH[key] + '</svg>';
  }

  /* The wind reading carries a direction - "10 mph, R To L" - which is a fact
     about the ballpark, so the arrow points the way the ball is pushed. */
  function windArrow(text) {
    var t = String(text || '').toLowerCase();
    var deg = null;
    if (t.indexOf('l to r') >= 0) deg = 90;
    else if (t.indexOf('r to l') >= 0) deg = 270;
    else if (t.indexOf('in from') >= 0 || t.indexOf('in ') === 0) deg = 180;
    else if (t.indexOf('out to') >= 0) deg = 0;
    if (deg === null) return '';
    return '<svg class="ca-wx-arrow" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" ' +
      'style="transform:rotate(' + deg + 'deg)" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/></svg>';
  }

  function wxTile(game) {
    var key = wxKey(game);
    var temp = game.weather_temp;
    var cond = game.weather_cond;
    var wind = game.weather_wind;
    if (!key && !temp && !cond && !wind) return '';
    return '<div class="ca-wx-tile">' +
      '<span class="ca-wx-tile__mark">' + wxGlyph(key) + '</span>' +
      '<span class="ca-wx-tile__read">' +
      (temp ? '<strong>' + esc(temp) + '\u00b0</strong>' : '') +
      (cond ? '<span class="ca-wx-tile__cond">' + esc(cond) + '</span>' : '') +
      (wind ? '<span class="ca-wx-tile__wind">' + windArrow(wind) + esc(wind) + '</span>' : '') +
      '</span></div>';
  }

  function parkFact(game) {
    var parks = (window.__caLeagueBoard || {}).parks || {};
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var park = parks[canon(game.home)];
    if (!park) return fact('Park Factor', 'Not Published');
    return '<div class="ca-detail-fact"><span>Park Factor</span><strong>' +
      '<span class="' + rankTone(park.rank, park.of) + '">' + park.factor + '</span>' +
      '<i class="ca-fact-note">' + park.rank + ordinal(park.rank) + ' of ' + park.of +
      ' \u00b7 ' + park.runs_per_game_home.toFixed(1) + ' R/G here vs ' +
      park.runs_per_game_road.toFixed(1) + ' away \u00b7 ' + park.home_games +
      ' games</i></strong></div>';
  }

  /* Weather and wind, in the banner, as one fact with its symbol. The rest of
     the ballpark record - capacity, elevation, dimensions - answered a question
     nobody asked on a matchup page. */
  function wxFact(game) {
    var key = wxKey(game);
    var bits = [game.weather_temp ? game.weather_temp + '\u00b0' : '',
                game.weather_cond || '', game.weather_wind || ''].filter(Boolean);
    if (!bits.length) {
      var roof = String(game.roof || '');
      if (/indoor|dome|closed|retractable/i.test(roof)) {
        return '<div class="ca-detail-fact"><span>Conditions</span>' +
          '<strong class="ca-wx-fact">' + wxGlyph('roof', 'ca-wx-glyph ca-wx-glyph--sm') +
          '<span>Indoors · Weather Not A Factor</span></strong></div>';
      }
      return fact('Conditions', roof ? titleCase(roof) + ' · Forecast Not Published'
                                     : 'Not Published');
    }
    return '<div class="ca-detail-fact"><span>Conditions</span><strong class="ca-wx-fact">' +
      (key ? wxGlyph(key, 'ca-wx-glyph ca-wx-glyph--sm') : '') +
      '<span>' + esc(bits.join(' \u00b7 ')) + '</span></strong></div>';
  }

  function ballparkBody(game, venueRecord) {
    var info = (venueRecord && venueRecord.fieldInfo) || {};
    var loc = (venueRecord && venueRecord.location) || {};
    var dims = ['leftLine', 'leftCenter', 'center', 'rightCenter', 'rightLine']
      .map(function (key) { return info[key]; }).filter(function (v) { return v != null; });
    var tile = wxTile(game);
    return (tile ? '<div class="ca-wx-row">' + tile +
      '<p class="ca-wx-note">Conditions at first pitch, from the official game record.</p></div>' : '') +
      '<div class="ca-detail-facts">' +
      fact('Venue', venue(game)) +
      (tile ? '' : fact('Weather', conditions(game))) +
      fact('Surface', info.turfType || value(game.surface)) +
      fact('Roof', info.roofType || 'Not Published') +
      fact('Capacity', info.capacity != null ? Number(info.capacity).toLocaleString('en-US') : 'Not Published') +
      fact('Elevation', loc.elevation != null ? loc.elevation + ' ft' : 'Not Published') +
      fact('Outfield', dims.length === 5 ? dims.join(' \u00b7 ') + ' ft' : 'Not Published') +
      parkFact(game) +
      fact('Start', clock(game.kickoff_utc)) + '</div>' +
      '<p class="ca-detail-source-note">Dimensions run left line, left-centre, centre, ' +
      'right-centre, right line, from the official venue record. Park factor is total runs ' +
      'per game here, both clubs counted, against the same club\u2019s runs per game on the ' +
      'road \u2014 100 is neutral. It describes how this park has played this season, with ' +
      'its sample beside it, and is not a coefficient from a model.</p>';
  }

  function bullpenIp(outs) {
    outs = Number(outs) || 0;
    return Math.floor(outs / 3) + '.' + (outs % 3);
  }

  function bullpenRate(value, digits, suffix) {
    if (value == null || !isFinite(Number(value))) return '&mdash;';
    return esc(Number(value).toFixed(digits)) + (suffix || '');
  }

  function bullpenSplitPanel(sport, game, side, unit) {
    var club = fullName(sport, game, side);
    var head = '<article class="ca-bullpen-splits"><header class="ca-bullpen-splits__head">' +
      logo(sport, game, side, 40, 'ca-bullpen-splits__logo') + '<div><h3>' + esc(club) +
      '</h3><p>' + (side === 'away' ? 'Away bullpen · road split highlighted' :
        'Home bullpen · home split highlighted') + '</p></div></header>';
    if (unit === undefined) return head + pending('Bullpen splits are loading.') + '</article>';
    if (!unit || !unit.overall) {
      return head + pending('Active bullpen split record is not published for this game.') + '</article>';
    }
    var rows = [
      ['overall', 'Full Season', unit.overall, false],
      ['site', side === 'away' ? 'On Road' : 'At Home', unit.site, true],
      ['vsL', 'Vs LHB', unit.vsL, false],
      ['vsR', 'Vs RHB', unit.vsR, false]
    ].map(function (row) {
      var stat = row[2];
      if (!stat) return '';
      return '<tr' + (row[3] ? ' class="is-matchup"' : '') + '><th scope="row">' +
        esc(row[1]) + (row[3] ? ' <span>Tonight</span>' : '') + '</th>' +
        '<td class="num">' + bullpenRate(stat.era, 2) + '</td>' +
        '<td class="num">' + bullpenRate(stat.whip, 2) + '</td>' +
        '<td class="num">' + bullpenRate(stat.ops, 3) + '</td>' +
        '<td class="num">' + bullpenRate(stat.kPct, 1, '%') + '</td>' +
        '<td class="num">' + bullpenRate(stat.bbPct, 1, '%') + '</td>' +
        '<td class="num">' + bullpenRate(stat.hr9, 2) + '</td>' +
        '<td class="num">' + esc(bullpenIp(stat.outs)) + '</td></tr>';
    }).join('');
    var sample = unit.overall.arms + ' active relievers · ' +
      Number(unit.overall.apps || 0).toLocaleString('en-US') + ' appearances · ' +
      bullpenIp(unit.overall.outs) + ' IP';
    return head + '<p class="ca-bullpen-splits__sample">' + esc(sample) + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-bullpen-split-table"><thead><tr>' +
      '<th>Split</th><th class="num">ERA</th><th class="num">WHIP</th>' +
      '<th class="num">OPS</th><th class="num">K%</th><th class="num">BB%</th>' +
      '<th class="num">HR/9</th><th class="num">IP</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></article>';
  }

  function bullpenQualityBody(sport, game, extra) {
    return '<div class="ca-detail-duo ca-bullpen-split-grid">' +
      bullpenSplitPanel(sport, game, 'away', extra.awayBullpenUnit) +
      bullpenSplitPanel(sport, game, 'home', extra.homeBullpenUnit) + '</div>';
  }

  function bullpenPanel(sport, game, side, report, quality) {
    quality = quality || {};
    var label = fullName(sport, game, side);
    var head = '<section class="ca-bullpen-panel"><h3>' + esc(label) + '</h3>';
    if (report === null || report === undefined) {
      return head + pending('Bullpen workload is loading.') + '</section>';
    }
    if (!report.used.length) {
      return head + '<p class="ca-lineup-context">Last ' + report.games +
        ' completed games</p>' + pending('No relief appearances recorded in this window.') +
        bulkNote(report) + '</section>';
    }
    var days = report.days || [];
    if (!days.length) {
      return head + pending('No relief appearances recorded in this window.') + '</section>';
    }

    /* Pitch count by day: one row per arm, one column per day, totals on the
       right. A table of season rates answered a different question - what a
       reader needs here is who threw, when, and how much. */
    var rows = report.used.map(function (rec) {
      var byDay = {};
      rec.outings.forEach(function (o) { byDay[o.date] = (byDay[o.date] || 0) + o.pitches; });
      var cells = days.map(function (day) {
        var n = byDay[day] || 0;
        // A day off is drawn as a dash: it is still a cell and still a fact,
        // but a grid of bold zeros drowns the counts they exist to set off.
        return '<td class="num ca-pc ' + pitchLoad(n) + '">' +
          (n ? n : '–') + '</td>';
      }).join('');
      // A zero total reads as a dash for the same reason a zero day does, so
      // the summary columns and the grid speak the same language.
      function totalCell(n, days) {
        return '<td class="num ca-pc-total ' + loadTotal(n, days) + '">' +
          (n ? n : '–') + '</td>';
      }

      // Named `tail`, not `window` - a local of that name would shadow the
      // global inside this closure.
      function tail(n) {
        return days.slice(-n).reduce(function (sum, d) { return sum + (byDay[d] || 0); }, 0);
      }
      var role = relieverRole((quality[rec.id] || {}).stat);
      return '<tr><td class="ca-lineup-name">' + esc(rec.name) +
        (role ? ' <span class="ca-role" data-role="' +
          esc(role.toLowerCase()) + '">' + esc(role) + '</span>' : '') +
        (rec.backToBack ? ' <span class="ca-flag">Back To Back</span>' : '') + '</td>' +
        cells + totalCell(tail(3), 3) + totalCell(tail(5), 5) + '</tr>';
    }).join('');

    var header = days.map(function (d) {
      return '<th class="num">' + esc(dayLabel(d)) + '</th>';
    }).join('');

    return head + '<div class="ca-lineup-scroll">' +
      '<table class="ca-lineup-table ca-pc-table"><thead><tr><th>Pitcher</th>' + header +
      '<th class="num">Last 3</th><th class="num">Last 5</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' + bulkNote(report) + '</section>';
  }

  /* What was left out of the table, said out loud rather than dropped: the
     starter's own relief work earlier in the week, and rotation arms who threw
     behind an opener. */
  function bulkNote(report) {
    var notes = [];
    function outing(rec) {
      return rec.outings.slice().reverse().map(function (o) {
        return o.pitches + ' ' + dayLabel(o.date);
      }).join(', ');
    }
    if (report.starter) {
      notes.push(esc(report.starter.name) + ' starts tonight, so his relief work (' +
        esc(outing(report.starter)) + ') is not counted here.');
    }
    if (report.bulk && report.bulk.length) {
      notes.push('Rotation arms who pitched behind an opener, not counted as bullpen load: ' +
        report.bulk.map(function (rec) {
          return esc(rec.name) + ' (' + esc(outing(rec)) + ')';
        }).join('; ') + '.');
    }
    return notes.length
      ? '<p class="ca-detail-source-note ca-bullpen-note">' + notes.join(' ') + '</p>'
      : '';
  }

  /* Each section's body is its own builder so a stage that resolves late can
     repaint just that block instead of the whole page. */
  function startersBody(sport, game, extra) {
    var people = extra.people || {};
    return '<div class="ca-detail-duo">' +
      starterPanel(sport, game, 'away', people, extra.starterSplits) +
      starterPanel(sport, game, 'home', people, extra.starterSplits) + '</div>' +
      '<p class="ca-detail-source-note">The four figures above each table are the arm’s ' +
      'whole season, kept as the anchor the splits are read against. Vs LHH and Vs RHH are ' +
      'left- and right-handed hitters; Home and Road are this arm’s own starts in each. ' +
      'K% and BB% are strikeouts ' +
      'and walks as a share of batters faced; HR/9 is home runs allowed per nine innings; OPS+ ' +
      'is 100 × league OPS allowed over this line’s OPS allowed, so 100 is average ' +
      'and higher is the better arm. The source measures earned runs by park and opponent ' +
      'production by batter hand, not the other way round, so a column appears only on the rows ' +
      'it is actually measured for. Colour grades every figure against this season’s ' +
      'published league baseline, with allowed rates read the way a pitcher earns them: a low ' +
      'OPS against is green.</p>';
  }

  /* ---------------------------------------------------------------------
   * The club's own splits, under the order that produces them.
   *
   * The lineup panel says what nine men have done against this hand of
   * pitching. It does not say what the CLUB has done - at home, on the road,
   * against each hand - which is the same question asked of the whole roster
   * and is the context those nine lines sit in. One request per club answers
   * it, from the same endpoint the starter splits come from.
   * ------------------------------------------------------------------ */
  var TEAM_SPLIT_URL = 'https://statsapi.mlb.com/api/v1/teams/{id}/stats?stats=statSplits' +
    '&sitCodes=h,a,vl,vr,sp,rp&group=hitting&season={season}&gameType=R';

  /* `sp` and `rp` are the same split endpoint's own codes for the two halves of
     a pitching staff. A club's line against relievers is a different number
     from its line against starters - different stuff, different leverage, and
     often a different half of the lineup - and it is the one that says what
     happens after the starter this page is about comes out. */
  var TEAM_SPLIT_ROWS = [
    ['h', 'At Home'], ['a', 'On The Road'],
    ['vl', 'Vs LHP'], ['vr', 'Vs RHP'],
    ['sp', 'Vs Starters'], ['rp', 'Vs Bullpens']
  ];

  function loadTeamSplits(teamId, season) {
    if (!teamId) return Promise.resolve(null);
    return fetchJson(TEAM_SPLIT_URL.replace('{id}', teamId).replace('{season}', season))
      .then(function (payload) {
        var out = {};
        (((payload.stats || [])[0] || {}).splits || []).forEach(function (row) {
          var code = (row.split || {}).code;
          if (code && row.stat) out[code] = row.stat;
        });
        return out;
      }).catch(function () { return null; });
  }

  function rate(stat, key) {
    var v = stat && stat[key];
    return v == null || v === '' ? null : Number(v);
  }

  function teamSplitPanel(sport, game, side, splits) {
    var label = fullName(sport, game, side);
    var head = '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>';
    if (!splits) return head + pending('Club splits are loading.') + '</section>';
    var rows = TEAM_SPLIT_ROWS.map(function (spec) {
      var st = splits[spec[0]];
      if (!st) return '';
      var pa = Number(st.plateAppearances) || 0;
      function cell(value, context, suffix) {
        if (value == null) return '<td class="num">&mdash;</td>';
        return '<td class="num ' + (context ? gradeFor(value, context) : '') + '">' +
          esc(value) + (suffix || '') + '</td>';
      }
      var kPct = pa ? Math.round((Number(st.strikeOuts) / pa) * 1000) / 10 : null;
      var bbPct = pa ? Math.round((Number(st.baseOnBalls) / pa) * 1000) / 10 : null;
      // Each split grades against the thirty clubs on that same split.
      var tm = 'tm_' + spec[0] + '_';
      return '<tr><td>' + esc(spec[1]) + '</td>' +
        cell(st.avg, tm + 'avg') + cell(st.obp, tm + 'obp') + cell(st.slg, tm + 'slg') +
        cell(st.ops, tm + 'ops') +
        '<td class="num">' + esc(st.homeRuns == null ? '—' : st.homeRuns) + '</td>' +
        cell(kPct, null, '%') + cell(bbPct, null, '%') +
        '<td class="num">' + esc(pa || '—') + '</td></tr>';
    }).filter(Boolean).join('');
    if (!rows) return head + pending('Club splits are not published for this season.') + '</section>';
    return head + '<div class="ca-lineup-scroll">' +
      '<table class="ca-lineup-table ca-split-table"><thead><tr><th>Split</th>' +
      '<th class="num">AVG</th><th class="num">OBP</th><th class="num">SLG</th>' +
      '<th class="num">OPS</th><th class="num">HR</th><th class="num">K%</th>' +
      '<th class="num">BB%</th><th class="num">PA</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></section>';
  }

  function teamSplitsBody(sport, game, extra) {
    return '<div class="ca-detail-duo">' +
      teamSplitPanel(sport, game, 'away', extra.awayTeamSplits) +
      teamSplitPanel(sport, game, 'home', extra.homeTeamSplits) + '</div>' +
      '<p class="ca-detail-source-note">The whole club, not the nine men posted tonight: ' +
      'what this roster has hit at home, on the road, and against each hand of pitching this ' +
      'season, plus what it has done against starters and against bullpens, read from ' +
      'the official split record. K% and BB% are shares of plate ' +
      'appearances. Colour grades each rate against this season’s published league ' +
      'baseline. Home runs are a count, so they are not graded — a club with more plate ' +
      'appearances in a split will have more of them.</p>';
  }

  function lineupsBody(sport, game, extra) {
    var people = extra.people || {};
    var awayArm = people[game.away_starter_id] || {};
    var homeArm = people[game.home_starter_id] || {};
    return '<div class="ca-detail-stack-inner">' +
      lineupPanel(sport, game, 'away', people,
        homeArm.name || value(game.home_starter, 'the home starter'), homeArm.throws) +
      lineupPanel(sport, game, 'home', people,
        awayArm.name || value(game.away_starter, 'the away starter'), awayArm.throws) +
      '</div>';
  }

  function arsenalBody(sport, game, extra) {
    var people = extra.people || {};
    return '<div class="ca-detail-duo">' +
      arsenalPanel(sport, game, 'away', people, extra.awayArsenal, extra.pitchBoard, extra.runValue) +
      arsenalPanel(sport, game, 'home', people, extra.homeArsenal, extra.pitchBoard, extra.runValue) + '</div>' +
      '<p class="ca-detail-source-note">The opponent figure is how the lineup ' +
      'that arm faces has hit that pitch this season, ranked among clubs with a ' +
      'comparable sample. It describes the season already played: pitch-type ' +
      'specific team hitting has been measured on this data and does not carry ' +
      'from one window to the next, so it is history, not a read on tonight.</p>';
  }

  /* The legacy Team Rankings board, restored where the architecture puts it:
     inside the matchup, behind a disclosure, rather than as a public
     destination of its own. Sorted by the metric the section leads with, and
     the two clubs in this game are marked so the reader can find them without
     hunting. */
  function leagueBoard(sport, game, board) {
    var teams = (board && board.teams) || {};
    var codes = Object.keys(teams);
    if (codes.length < 2) return '';
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var here = {};
    here[canon(game.away)] = 'away';
    here[canon(game.home)] = 'home';

    var keys = BOARD_KEYS.filter(function (key) {
      return codes.some(function (code) { return teams[code][key]; });
    });
    if (!keys.length) return '';

    var sortKey = keys[0];
    codes.sort(function (a, b) {
      var ra = (teams[a][sortKey] || {}).rank || 99;
      var rb = (teams[b][sortKey] || {}).rank || 99;
      return ra - rb;
    });

    var head = '<tr><th>#</th><th>Club</th>' + keys.map(function (key) {
      return '<th class="num">' + esc(STAT_SPECS[key].label) + '</th>';
    }).join('') + '</tr>';

    var rows = codes.map(function (code) {
      var side = here[code];
      var cells = keys.map(function (key) {
        var entry = teams[code][key];
        if (!entry) return '<td class="num">&mdash;</td>';
        // The rank is parenthesised rather than merely spaced: across seven
        // metrics a bare trailing digit reads as part of the value, so wRC+ 110
        // ranked 3rd looked like 1103.
        return '<td class="num">' + esc(formatStat(entry.value, STAT_SPECS[key].digits)) +
          '<i class="' + rankTone(entry.rank, entry.of) + '">(' + entry.rank + ')</i></td>';
      }).join('');
      var rank = (teams[code][sortKey] || {}).rank;
      return '<tr' + (side ? ' class="is-here"' : '') + '>' +
        '<td class="ca-lineup-slot">' + (rank || '') + '</td>' +
        '<td class="ca-lineup-name">' + esc(code) +
        (side ? ' <span class="ca-flag">' + (side === 'away' ? 'Away' : 'Home') + '</span>' : '') +
        '</td>' + cells + '</tr>';
    }).join('');

    return '<details class="ca-disclosure" open><summary>The Full Board · All ' +
      codes.length + ' Clubs</summary>' +
      '<div class="ca-disclosure__body">' +
      '<p class="ca-lineup-context">Sorted By ' + esc(STAT_SPECS[sortKey].label) +
      ' \u00b7 The Two Clubs In This Game Are Marked</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-league-table">' +
      '<thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">The small figure beside each value is that ' +
      'club\u2019s rank on that metric. Every rank is computed from the value it sits ' +
      'beside against this same pool, so the board and the comparison above cannot ' +
      'disagree on a boundary club.</p></div></details>';
  }

  /* Ten squares, oldest to newest, each one a game. Won or lost is carried by
     the letter as well as the colour, and every square states its own score,
     opponent and date to a screen reader and on hover. */
  var WINDOW_ORDER = ['ytd', 'l30', 'l14', 'l7'];
  var WINDOW_LABEL = { ytd: 'YTD', l30: 'L30', l14: 'L14', l7: 'L7' };

  /* The trend line the earlier card carried, rebuilt on what the data actually
     holds. The legacy sparkline plotted OSI across these four windows; OSI is a
     plate-appearance quality index and the game record does not carry its
     inputs, so this is not that line relabelled - it plots runs per game, which
     is what the completed-game record measures, and it says so.

     Drawn as an inline SVG polyline over a shared scale, with each window's
     value and its league rank printed underneath. A chart nobody can read the
     numbers off is decoration. */
  function sparkline(rolling, colour) {
    if (!rolling || !rolling.windows) return '';
    var points = WINDOW_ORDER
      .filter(function (key) { return rolling.windows[key]; })
      .map(function (key) {
        var w = rolling.windows[key];
        return { key: key, value: Number(w.runs_per_game), rank: w.rank, of: w.of, games: w.games };
      });
    if (points.length < 2) return '';

    var values = points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var pad = (hi - lo) < 0.4 ? 0.4 : (hi - lo) * 0.18;
    lo -= pad; hi += pad;
    var W = 168, H = 44;
    var step = points.length > 1 ? W / (points.length - 1) : W;
    var coords = points.map(function (p, i) {
      var y = H - ((p.value - lo) / (hi - lo)) * H;
      return [i * step, Math.max(3, Math.min(H - 3, y))];
    });
    var line = coords.map(function (c) { return c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join(' ');
    var dots = coords.map(function (c, i) {
      var last = i === coords.length - 1;
      return '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="' +
        (last ? 3.6 : 2.4) + '"' + (last ? ' class="is-now"' : '') + '/>';
    }).join('');

    var readout = points.map(function (p) {
      return '<span class="ca-spark__step">' +
        '<i>' + WINDOW_LABEL[p.key] + '</i>' +
        '<b>' + p.value.toFixed(2) + '</b>' +
        '<span class="ca-rank ' + rankTone(p.rank, p.of) + '">' + p.rank + ordinal(p.rank) + '</span>' +
        '</span>';
    }).join('');

    return '<div class="ca-spark"' + (colour ? ' style="--club:' + esc(colour) + '"' : '') + '>' +
      '<svg class="ca-spark__chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="Runs per game across the season, last 30, last 14 and last 7 games" ' +
      'preserveAspectRatio="none"><polyline points="' + line + '"/>' + dots + '</svg>' +
      '<span class="ca-spark__read">' + readout + '</span></div>';
  }

  function recentStrip(sport, game, side, results) {
    var label = fullName(sport, game, side);
    if (!results) {
      return '<div class="ca-recent"><span class="ca-recent__team">' + esc(label) +
        '</span><span class="ca-recent__pending">Recent results loading</span></div>';
    }
    if (!results.length) {
      return '<div class="ca-recent"><span class="ca-recent__team">' + esc(label) +
        '</span><span class="ca-recent__pending">No completed games in the last month</span></div>';
    }
    var wins = results.filter(function (r) { return r.won; }).length;
    var squares = results.map(function (r) {
      var title = r.date + ' ' + (r.home ? 'vs ' : 'at ') + r.opponent + ' ' +
        r.scored + '-' + r.allowed + ' ' + (r.won ? 'won' : 'lost');
      return '<span class="ca-recent__game' + (r.won ? ' is-win' : ' is-loss') +
        '" title="' + esc(title) + '"><abbr title="' + esc(title) + '">' +
        (r.won ? 'W' : 'L') + '</abbr>' +
        '<i>' + esc(r.scored) + '\u2013' + esc(r.allowed) + '</i></span>';
    }).join('');
    var rolling = ((window.__caLeagueBoard || {}).rolling || {})[
      ((global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
        function (c) { return String(c || '').toUpperCase(); })(game[side])];
    return '<div class="ca-recent">' +
      '<span class="ca-recent__team">' + logo(sport, game, side, 24, 'ca-recent__crest') +
      esc(label) + '</span>' +
      '<span class="ca-recent__record">' + wins + '\u2013' + (results.length - wins) +
      '<i>Last ' + results.length + '</i></span>' +
      sparkline(rolling, clubColour(sport, game, side)) +
      '<span class="ca-recent__games">' + squares + '</span></div>';
  }

  function recentBody(sport, game, extra) {
    return '<div class="ca-recent-stack">' +
      recentStrip(sport, game, 'away', extra.awayRecent) +
      recentStrip(sport, game, 'home', extra.homeRecent) + '</div>' +
      '<p class="ca-detail-source-note">The line is runs scored per game across ' +
      'the season, the last thirty, the last fourteen and the last seven \u2014 the ' +
      'trend the completed-game record actually measures, with each window\u2019s ' +
      'league rank beneath it. Oldest on the left. Each square is one ' +
      'completed game with its final score; hover or focus for the opponent and ' +
      'date. Won and lost are carried by the letter as well as the colour.</p>';
  }

  /* ---------------------------------------------------------------------
   * The team profile radar.
   *
   * Two webs, both clubs overlaid on each. Every axis is the club's PERCENTILE
   * on that metric, which is the only honest way to put OSI, wRC+ and xwOBA on
   * one shape - they have nothing in common as raw units, and a radar drawn on
   * raw values would be a picture of the scales rather than of the clubs.
   *
   * The legacy radar carried a ProjOSI axis. That is a forecast and is named
   * model_private, so the axis here is Pitch Score - a descriptive index over
   * the same kind of inputs - and the swap is stated in the note rather than
   * quietly made.
   * ------------------------------------------------------------------ */
  var RADARS = [
    { title: 'Process Composite', keys: ['rcv', 'abq', 'osi', 'obr', 'pitchScore'] },
    { title: 'Offense And Schedule', keys: ['pals', 'wrc', 'xwoba', 'woba', 'xfip'] }
  ];

  var NFL_RADARS = [
    { title: 'Offense', keys: ['off_epa', 'off_first_down', 'off_explosive',
                               'off_sack', 'off_turnover'] },
    { title: 'Defense', keys: ['def_epa', 'def_first_down', 'def_explosive',
                               'def_sack', 'def_turnover'] }
  ];

  /* An axis label has room for about eight characters before it leaves the
     viewBox or collides with its neighbour, so the webs name their own axes
     instead of reusing the sentence-length labels the mirror carries. */
  var NFL_AXIS = {
    off_epa: 'EPA', off_first_down: '1st Down', off_explosive: 'Explosive',
    off_sack: 'Sacks Taken', off_turnover: 'Ball Security',
    def_epa: 'EPA', def_first_down: '1st Down', def_explosive: 'Explosive',
    def_sack: 'Sacks', def_turnover: 'Takeaways'
  };

  var CFB_RADARS = [
    { title: 'Offense', keys: ['off_ppa', 'off_ypg', 'off_successRate',
                               'off_explosiveness', 'off_stuffRate', 'off_comp'] },
    { title: 'Defense', keys: ['def_ppa', 'def_ypg', 'def_successRate',
                               'def_explosiveness', 'def_stuffRate', 'def_comp'] }
  ];

  var CFB_AXIS = {
    off_ppa: 'PPG', off_ypg: 'YPG', off_successRate: '3rd Down',
    off_explosiveness: 'YPA', off_stuffRate: 'YPC', off_comp: 'Comp%',
    def_ppa: 'PPG', def_ypg: 'YPG', def_successRate: '3rd Down',
    def_explosiveness: 'YPA', def_stuffRate: 'YPC', def_comp: 'Comp%'
  };

  /* Every web is laid out in a box RADAR_W units wide and then scaled to the
     column it lands in. Type set in those units scaled with the box - the axis
     names measured 10.7px at 1440 and 8.7px on a phone - so the layout takes
     `k`, box units per screen pixel, and sets every piece of type at k times
     its screen size. fitRadar() measures the drawn width and redraws when k
     has moved. The pixel sizes mirror the .ca-radar rules in chase-public.css,
     which own the type; here they only size the room around it. */
  var RADAR_W = 520;
  var RADAR_LABEL_PX = 15;

  function radarPoints(ctx, keys, radius, cx, cy) {
    return keys.map(function (key, i) {
      var entry = ctx && ctx[key];
      var pct = entry ? percentOf(entry) : null;
      // An axis with no value collapses to the centre rather than being skipped,
      // so the shape keeps its geometry and the gap is visible as a gap.
      var r = pct == null ? 0 : (pct / 100) * radius;
      var angle = radarAngle(i, keys.length);
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    });
  }

  function radarAngle(i, count) {
    return (Math.PI * 2 * i) / count - Math.PI / 2;
  }

  function radarKeys(spec, plan) {
    return spec.keys.filter(function (key) {
      return plan.label(key) && ((plan.away && plan.away[key]) || (plan.home && plan.home[key]));
    });
  }

  /* At phone scale a two-word axis name goes onto two lines, rather than the
     whole web shrinking to make room for its longest name. */
  function radarLabelLines(text, k) {
    var words = String(text || '').split(' ');
    if (k < 1.15 || words.length < 2) return [String(text || '')];
    var best = null;
    for (var i = 1; i < words.length; i++) {
      var lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
      var longest = Math.max(lines[0].length, lines[1].length);
      if (!best || longest < best.longest) best = { lines: lines, longest: longest };
    }
    return best.lines;
  }

  // Generous for a bold face on purpose: a name is never measured narrower
  // than it draws.
  function radarTextWidth(text, px) {
    return String(text || '').length * px * 0.6;
  }

  /* Where each axis name sits, relative to a centre at 0,0. A name above the
     web ends at its anchor, one below starts there, and one beside is centred
     on it - so a two-line name grows away from the shape, never into it. */
  function radarBlocks(keys, plan, geo) {
    var px = geo.labelPx, lineH = px * 1.15;
    return keys.map(function (key, i) {
      var a = radarAngle(i, keys.length);
      var sin = Math.sin(a), cos = Math.cos(a);
      var lines = radarLabelLines(plan.label(key), geo.k);
      var x = (geo.radius + geo.gap) * cos, y = (geo.radius + geo.gap) * sin;
      var first;
      if (sin < -0.3) first = y - (lines.length - 1) * lineH;
      else if (sin > 0.3) first = y + px * 0.8;
      else first = y + px * 0.35 - ((lines.length - 1) * lineH) / 2;
      return {
        key: key, x: x, y: y, lines: lines, first: first, lineH: lineH,
        anchor: Math.abs(cos) < 0.3 ? 'middle' : (cos > 0 ? 'start' : 'end'),
        top: first - px * 0.8,
        bottom: first + (lines.length - 1) * lineH + px * 0.25
      };
    });
  }

  /* One geometry for both webs, so the pair is drawn to the same scale and
     height: the largest radius at which every side-hung name still fits in the
     box, and a box exactly tall enough for the highest and lowest names. */
  function radarGeometry(specs, plan, k) {
    var geo = {
      k: k, w: RADAR_W, cx: RADAR_W / 2,
      labelPx: RADAR_LABEL_PX * k, gap: 12 * k, pad: 8 * k
    };
    var radius = 150;
    specs.forEach(function (spec) {
      var keys = radarKeys(spec, plan);
      keys.forEach(function (key, i) {
        var cos = Math.abs(Math.cos(radarAngle(i, keys.length)));
        if (cos < 0.3) return;
        var width = Math.max.apply(null, radarLabelLines(plan.label(key), k).map(function (line) {
          return radarTextWidth(line, geo.labelPx);
        }));
        radius = Math.min(radius, (geo.cx - geo.pad - width) / cos - geo.gap);
      });
    });
    geo.radius = Math.max(56, Math.floor(radius));
    var highest = -geo.radius, lowest = geo.radius;
    specs.forEach(function (spec) {
      radarBlocks(radarKeys(spec, plan), plan, geo).forEach(function (b) {
        highest = Math.min(highest, b.top);
        lowest = Math.max(lowest, b.bottom);
      });
    });
    geo.cy = Math.ceil(geo.pad - highest);
    geo.h = Math.ceil(geo.cy + lowest + geo.pad);
    return geo;
  }

  function radarWeb(sport, game, spec, plan, geo) {
    var away = plan.away, home = plan.home;
    var keys = radarKeys(spec, plan);
    // Three axes is the fewest that makes a shape rather than a line.
    if (keys.length < 3) return '';
    if (!away && !home) return '';

    var k = geo.k, w = geo.w, h = geo.h, cx = geo.cx, cy = geo.cy, radius = geo.radius;

    var rings = [0.25, 0.5, 0.75, 1].map(function (step) {
      var pts = keys.map(function (_, i) {
        var a = radarAngle(i, keys.length);
        return (cx + radius * step * Math.cos(a)).toFixed(1) + ',' +
               (cy + radius * step * Math.sin(a)).toFixed(1);
      }).join(' ');
      return '<polygon class="ca-radar__ring' + (step === 1 ? ' is-outer' : '') +
        '" points="' + pts + '"/>';
    }).join('');

    var spokes = keys.map(function (_, i) {
      var a = radarAngle(i, keys.length);
      return '<line class="ca-radar__spoke" data-axis="' + i + '" x1="' + cx + '" y1="' + cy +
        '" x2="' + (cx + radius * Math.cos(a)).toFixed(1) + '" y2="' +
        (cy + radius * Math.sin(a)).toFixed(1) + '"/>';
    }).join('');

    function place(n) { return n + ordinal(n); }

    function readout(ctx, key) {
      var entry = ctx && ctx[key];
      if (!entry) return 'not published';
      var pct = percentOf(entry);
      return String(entry.value) + (entry.rank ? ', ' + place(entry.rank) + ' of ' + entry.of : '') +
        (pct == null ? '' : ', ' + place(Math.round(pct)) + ' percentile');
    }

    function code(side) { return String(game[side] || '').toUpperCase(); }

    /* Each axis is its own hoverable, focusable object, and what it opens is
       HTML rather than SVG. The first readout was drawn inside the web: it
       scaled with the box (about 10px on screen), sat on a 60% black the spokes
       showed through, and covered the axis names either side of the one being
       read. The card is built here and placed by wireRadarReadout(). One row
       per club, each carrying the club's own colour, so the numbers are read
       against the same key as the shapes. */
    function cardRow(ctx, side, key) {
      var entry = ctx && ctx[key];
      var colour = plan.colour[side];
      var pct = entry ? percentOf(entry) : null;
      return '<div class="ca-radar__card-row">' +
        '<span class="ca-radar__card-club"><i class="ca-radar-key__swatch is-' + side + '"' +
        (colour ? ' style="background:' + esc(colour) + '"' : '') + '></i>' + esc(code(side)) + '</span>' +
        (entry
          ? '<b>' + esc(String(entry.value)) + '</b>' +
            '<span>' + (entry.rank ? esc(place(entry.rank) + ' of ' + entry.of) : '') + '</span>' +
            '<span>' + (pct == null ? '' : esc(place(Math.round(pct)) + ' percentile')) + '</span>'
          : '<b class="is-absent">Not published</b><span></span><span></span>') +
        '</div>';
    }

    var cards = [];
    var labels = radarBlocks(keys, plan, geo).map(function (b, i) {
      var lx = cx + b.x, ly = cy + b.y;
      var name = plan.label(b.key);
      var means = STAT_MEANS[b.key] || '';
      cards.push('<div class="ca-radar__card" data-card="' + i + '" hidden aria-hidden="true">' +
        '<p class="ca-radar__card-head">' + esc(name) + '<span>' + esc(spec.title) + '</span></p>' +
        (means ? '<p class="ca-radar__card-means">' + esc(means) + '</p>' : '') +
        cardRow(away, 'away', b.key) + cardRow(home, 'home', b.key) + '</div>');
      var text = '<text class="ca-radar__label" text-anchor="' + b.anchor + '">' +
        b.lines.map(function (line, n) {
          return '<tspan x="' + lx.toFixed(1) + '" y="' +
            (cy + b.first + n * b.lineH).toFixed(1) + '">' + esc(line) + '</tspan>';
        }).join('') + '</text>';
      return '<g class="ca-radar__axis" data-axis="' + i + '" data-low="' + (b.y > 1 ? '1' : '0') +
        '" tabindex="0" role="button" aria-label="' +
        esc(name + '. ' + means + ' ' + fullName(sport, game, 'away') + ': ' + readout(away, b.key) +
          '. ' + fullName(sport, game, 'home') + ': ' + readout(home, b.key) + '.') + '">' +
        '<circle class="ca-radar__hit" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) +
        '" r="' + (30 * k).toFixed(1) + '"/>' + text + '</g>';
    }).join('');

    function area(ctx, keys2) {
      // A rough area for the polygon, used only to decide which shape is drawn
      // underneath. Sum of the radii is enough for that and costs nothing.
      if (!ctx) return 0;
      return keys2.reduce(function (sum, key) {
        var pct = ctx[key] ? percentOf(ctx[key]) : null;
        return sum + (pct == null ? 0 : pct);
      }, 0);
    }

    function ordered(a, hm, colour) {
      var pair = [
        { ctx: a, cls: 'is-away', colour: colour.away, size: area(a, keys) },
        { ctx: hm, cls: 'is-home', colour: colour.home, size: area(hm, keys) }
      ].sort(function (x, y) { return y.size - x.size; });
      return pair.map(function (one) {
        return shape(one.ctx, one.cls, one.colour);
      }).join('');
    }

    function shape(ctx, cls, colour) {
      if (!ctx) return '';
      var points = radarPoints(ctx, keys, radius, cx, cy);
      var pts = points.map(function (pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }).join(' ');
      // A point on every axis that carries a value, so a reader can find where
      // each club sits without tracing its outline back to the spoke.
      var dots = points.map(function (pt, i) {
        var entry = ctx[keys[i]];
        if (!entry || percentOf(entry) == null) return '';
        return '<circle class="ca-radar__dot ' + cls + '" data-axis="' + i + '" cx="' +
          pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="' + (3.5 * k).toFixed(1) + '"' +
          (colour ? ' style="fill:' + esc(colour) + '"' : '') + '/>';
      }).join('');
      return '<polygon class="ca-radar__area ' + cls + '" points="' + pts + '"' +
        (colour ? ' style="stroke:' + esc(colour) + ';fill:' + esc(colour) + '"' : '') + '/>' + dots;
    }

    return '<figure class="ca-radar">' +
      '<figcaption>' + esc(spec.title) + '</figcaption>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" data-k="' + k + '" style="--radar-k:' + k + '"' +
      ' role="img" aria-label="' + esc(spec.title) + ' percentile comparison">' +
      // The bigger shape is drawn FIRST so the smaller one is never buried
      // under it. Two translucent fills over each other used to leave the
      // dominant club's outline as the only one a reader could follow, which
      // made the comparison look like one lumpy polygon instead of two.
      rings + spokes + ordered(away, home, plan.colour) + labels +
      '</svg>' + cards.join('') + '</figure>';
  }

  /* Where each sport keeps its context, and what it calls each axis. The MLB
     board is a flat map of metric entries; the NFL board nests the same shape
     one level down under `rates` and carries its own labels. */
  function radarPlan(sport, game) {
    var colour = radarPair(sport, game);
    if (sport === 'nfl' || sport === 'cfb') {
      var axis = sport === 'cfb' ? CFB_AXIS : NFL_AXIS;
      return {
        colour: colour,
        away: ((game.away_form || {}).rates) || null,
        home: ((game.home_form || {}).rates) || null,
        label: function (key) {
          if (axis[key]) return axis[key];
          var entry = (((game.away_form || {}).rates) || {})[key] ||
                      (((game.home_form || {}).rates) || {})[key];
          return entry ? titleCase(entry.label) : '';
        }
      };
    }
    return {
      colour: colour,
      away: game.away_context || null,
      home: game.home_context || null,
      label: function (key) { return STAT_SPECS[key] ? STAT_SPECS[key].label : ''; }
    };
  }

  /* Both clubs in their own colours wherever the pair can be told apart. The
     first version dropped BOTH clubs to the chart pair whenever their first
     colours were close - 47% of MLB pairings and 51% of NFL pairings, so the
     radar lost club identity on half the slate, and most often where two navy
     clubs met. A club's second colour is tried first now (see
     MLBMAAssets.teamPairColors), and the chart pair is the last resort. */
  function radarPair(sport, game) {
    if (sport === 'cfb' && (game.away_color || game.home_color)) {
      return {
        away: clubColour(sport, game, 'away') || '',
        home: clubColour(sport, game, 'home') || '',
        awayAlt: false, homeAlt: false, fellBack: false
      };
    }
    var assets = global.MLBMAAssets;
    if (!(assets && assets.teamPairColors)) {
      return { away: '', home: '', awayAlt: false, homeAlt: false, fellBack: false };
    }
    return assets.teamPairColors(game.away, game.home, sport, { minRatio: 3 });
  }

  function radarBody(sport, game, k) {
    k = k > 0 ? k : 1;
    var plan = radarPlan(sport, game);
    var pair = plan.colour;
    function swatch(colour) {
      return colour ? ' style="background:' + esc(colour) + '"' : '';
    }
    var specs = sport === 'cfb' ? CFB_RADARS : (sport === 'nfl' ? NFL_RADARS : RADARS);
    var geo = radarGeometry(specs, plan, k);
    var webs = specs.map(function (spec) { return radarWeb(sport, game, spec, plan, geo); })
      .filter(Boolean).join('');
    if (!webs) return pending('Team profile is not published for this pairing.');
    var switched = [];
    if (pair.awayAlt) switched.push(fullName(sport, game, 'away'));
    if (pair.homeAlt) switched.push(fullName(sport, game, 'home'));
    var colourNote = pair.fellBack
      ? 'These two clubs wear colours too close to tell apart when the shapes overlap - ' +
        'in their second colours as well - so the web uses the chart pair instead of the ' +
        'club pair; the key names which is which.'
      : switched.length
        ? 'The two clubs’ first colours are too close to tell apart where the shapes ' +
          'cross, so ' + esc(switched.join(' and ')) +
          (switched.length > 1 ? ' are drawn in their' : ' is drawn in its') +
          ' second club colour.'
        : (pair.away && pair.home ? 'Each shape is drawn in its own club’s colour.' : '');
    return '<div class="ca-radar-duo">' + webs + '</div>' +
      '<p class="ca-radar-key">' +
      '<span class="ca-radar-key__item"><span class="ca-radar-key__swatch is-away"' +
      swatch(pair.away) + '></span>' + logo(sport, game, 'away', 22, 'ca-mirror__crest') +
      esc(fullName(sport, game, 'away')) + '</span>' +
      '<span class="ca-radar-key__item"><span class="ca-radar-key__swatch is-home"' +
      swatch(pair.home) + '></span>' + logo(sport, game, 'home', 22, 'ca-mirror__crest') +
      esc(fullName(sport, game, 'home')) + '</span>' +
      '</p>' +
      '<p class="ca-detail-source-note">Every axis is that club’s percentile on the ' +
      'metric named, against the same league pool the section above uses — the only ' +
      'honest way to put rates with no units in common on one shape. Further from the ' +
      'centre is better on every axis, including the ones ranked low-is-good. ' +
      (sport === 'cfb'
        ? 'Both webs read the eight season-to-date unit rates from the section above, split into offence and defence. '
        : sport === 'nfl'
        ? 'Both webs read the ten charted rates from the form section above, split into ' +
          'the two phases of the game. '
        : 'The legacy web carried a projOSI axis; that is a forecast, so this one carries ' +
          'Pitch Score, a descriptive index over the same kind of inputs. ') +
      colourNote + '</p>';
  }

  /* Redraw the radar at the scale it is actually shown at (see RADAR_W). Runs
     after every paint of the section and whenever the page resizes; a change
     under 4% is not worth a redraw, which is also what keeps a resize from
     repainting on every frame. */
  function fitRadar(host) {
    var args = host.__caRadar;
    var node = host.querySelector('[data-body="radar"]');
    var svg = node && node.querySelector('.ca-radar svg');
    if (!args || !svg) return;
    var shown = svg.getBoundingClientRect().width;
    if (!(shown > 0)) return;
    var k = Math.round((RADAR_W / shown) * 100) / 100;
    var drawn = Number(svg.getAttribute('data-k')) || 1;
    if (Math.abs(k - drawn) / drawn < 0.04) return;
    node.innerHTML = radarBody(args.sport, args.game, k);
  }

  /* One axis readout at a time, opened by hover and by focus - a tap on a
     phone focuses the axis - and closed by leaving it, blurring it or Escape.
     The card goes on the OUTSIDE of the name it belongs to: above a name in the
     upper half of the web, below one in the lower half. So it never covers the
     name being read, and it is held inside the section so it is never cut off
     at the panel edge. Delegated once on the host, so a redrawn web keeps it. */
  function wireRadarReadout(host) {
    function each(list, fn) { Array.prototype.forEach.call(list, fn); }
    function clear() {
      each(host.querySelectorAll('.ca-radar__card:not([hidden])'), function (card) { card.hidden = true; });
      each(host.querySelectorAll('.ca-radar .is-active'), function (el) { el.classList.remove('is-active'); });
    }
    function axisOf(node) {
      return node && node.closest ? node.closest('.ca-radar__axis') : null;
    }
    function show(axis) {
      var fig = axis.closest('.ca-radar');
      var i = axis.getAttribute('data-axis');
      var card = fig && fig.querySelector('.ca-radar__card[data-card="' + i + '"]');
      if (!card || !card.hidden) return;
      clear();
      each(fig.querySelectorAll('[data-axis="' + i + '"]'), function (el) { el.classList.add('is-active'); });
      card.hidden = false;
      var gap = 10;
      var name = axis.querySelector('.ca-radar__label').getBoundingClientRect();
      var box = fig.getBoundingClientRect();
      var bounds = (fig.closest('.ca-detail-section') || fig).getBoundingClientRect();
      var width = card.offsetWidth, height = card.offsetHeight;
      var top = axis.getAttribute('data-low') === '1' ? name.bottom + gap : name.top - gap - height;
      if (top < bounds.top + gap) top = name.bottom + gap;
      if (top + height > bounds.bottom - gap) top = name.top - gap - height;
      var left = name.left + name.width / 2 - width / 2;
      left = Math.max(bounds.left + gap, Math.min(bounds.right - gap - width, left));
      card.style.left = Math.round(left - box.left) + 'px';
      card.style.top = Math.round(top - box.top) + 'px';
    }
    host.addEventListener('mouseover', function (event) {
      var axis = axisOf(event.target);
      if (axis) show(axis);
    });
    host.addEventListener('mouseout', function (event) {
      var axis = axisOf(event.target);
      if (axis && !axis.contains(event.relatedTarget) && axis !== document.activeElement) clear();
    });
    host.addEventListener('focusin', function (event) {
      var axis = axisOf(event.target);
      if (axis) show(axis);
    });
    host.addEventListener('focusout', function (event) {
      if (axisOf(event.target)) clear();
    });
    host.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && axisOf(event.target)) clear();
    });
  }

  function formBody(sport, game) {
    var formNote = game.context_generated_at
      ? 'Team form as published ' + publishedTime(game.context_generated_at) + '. '
      : '';
    var mirror = mirrorTable(sport, game, FORM_KEYS, STAT_SPECS, function (g, side) {
      return g[side + '_context'];
    });
    return (mirror || '<div class="ca-detail-duo">' +
      formPanel(sport, game, 'away') +
      formPanel(sport, game, 'home') + '</div>') +
      '<p class="ca-detail-source-note">' + esc(formNote) +
      'OSI = 0.43\u00b7RCV + 0.37\u00b7ABQ + 0.20\u00b7OBR; Pitch Score = 0.40\u00b7K% + ' +
      '0.35\u00b7inv(BB%) + 0.25\u00b7inv(HR/9). Both are constructed indices, stated with their ' +
      'weights. Every rank and every bar is computed from the value beside it against the same ' +
      'league pool, so a bar always shows that rate\u2019s own percentile and never a rating. ' +
      'Two readings share each row and they answer different questions: the figure and its rank ' +
      'take the colour of where that club sits in the thirty, the same ramp as every other number ' +
      'on this page, while the bars take green and red for which club leads the row.</p>' +
      '';
  }

  function bullpenBody(sport, game, extra) {
    return '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Active Pen</p><h3>Season Quality And Matchup Splits</h3></div>' +
      '<span>Game-day roster</span></header>' + bullpenQualityBody(sport, game, extra) +
      '<p class="ca-detail-source-note">Rates combine the official counting stats of the ' +
      'relievers active for this game, with rotation arms and tonight’s starter removed by ' +
      'their season usage. Full Season is the anchor; the highlighted row is the bullpen’s ' +
      'home or road record for tonight’s setting. Vs LHB and Vs RHB show how those same arms ' +
      'have handled each batter side. ERA is not published on the hand splits, so it stays ' +
      'blank there rather than being inferred. Lower is better for ERA, WHIP, OPS, BB% and ' +
      'HR/9; higher is better for K%.</p></div>' +
      '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Availability</p><h3>Pitch Count By Day</h3></div><span>Previous seven days</span></header>' +
      '<div class="ca-detail-stack-inner">' +
      bullpenPanel(sport, game, 'away', extra.awayBullpen, extra.bullpenQuality) +
      bullpenPanel(sport, game, 'home', extra.homeBullpen, extra.bullpenQuality) + '</div>' +
      '<p class="ca-detail-source-note">Pitch counts read from the official box score of each completed game. Relief appearances only — a pitcher who started that game is excluded by his own line, tonight’s starter is left out of his own club’s pen, and rotation arms who pitched behind an opener are listed under the table rather than counted as bullpen load. A dash is a day that arm did not pitch. The shading runs dim to hot with the size of the day, not good to bad: thirty-five pitches is a heavy outing, which is a fact about availability tonight rather than a judgement about the pitcher.</p>' +
      '</div>';
  }

  function mlbSections(sport, game, extra) {
    extra = extra || {};
    return [
      section('starters', 'Probable Starters', 'Splits By Handedness And By Park',
        startersBody(sport, game, extra)),
      section('arsenal', 'Pitch Mix', 'What Each Starter Throws, And How Often',
        arsenalBody(sport, game, extra)),
      section('lineups', 'Lineup Versus Starter', 'Each Order Against The Opposing Arm',
        lineupsBody(sport, game, extra)),
      section('club-splits', 'Club Batting Splits', 'The Whole Roster, By Park And By Hand',
        teamSplitsBody(sport, game, extra)),
      section('recent', 'Last Ten Games', 'What Each Club Has Actually Been Doing',
        recentBody(sport, game, extra)),
      section('form', 'Offensive Form And League Context', 'Graded Against The 30-Team League Pool',
        formBody(sport, game)),
      section('radar', 'Team Profile Radar', 'Both Clubs On One Shape, By Percentile',
        radarBody(sport, game)),
      section('bullpens', 'Bullpen Matchup', 'Season Quality, Situational Splits And Recent Workload',
        bullpenBody(sport, game, extra))
    ].join('');
  }

  /* ---------------------------------------------------------------------
   * NFL evidence stack.
   *
   * Two sources, both observed, both projected field by field before they ever
   * reach the browser (outputs/nfl_public_context.py):
   *
   *   form    ten descriptive rates per club, each with a rank recomputed from
   *           that rate against the 32-team pool. The board's own teams[].rank
   *           ranks a model power rating and is never carried across.
   *   scheme  charted coverage, pressure, personnel, response and target-share
   *           rates, with the source season and the sample counts. The board's
   *           confidence, staff_continuity and carryover_weight are forecasts
   *           about the evidence and are never carried across.
   *
   * Everything here describes what a team has already done. Every scheme
   * sentence is past tense and names the season it was charted in, because a
   * prior-season rate stated in the present tense is a forecast wearing a
   * fact's clothes.
   * ------------------------------------------------------------------ */

  var COVERAGE_SHELLS = [
    ['cover_0_rate', 'pass_epa_cover_0', 'Cover 0'],
    ['cover_1_rate', 'pass_epa_cover_1', 'Cover 1'],
    ['cover_2_rate', 'pass_epa_cover_2', 'Cover 2'],
    ['cover_2_man_rate', 'pass_epa_cover_2_man', '2-Man'],
    ['cover_3_rate', 'pass_epa_cover_3', 'Cover 3'],
    ['cover_4_rate', 'pass_epa_cover_4', 'Cover 4'],
    ['cover_6_rate', 'pass_epa_cover_6', 'Cover 6']
  ];

  var PRESSURE_ROWS = [
    ['blitz_rate', 'pass_epa_blitz', 'Blitz', 'Pass EPA / play when blitzed'],
    ['pressure_rate', 'pass_epa_pressure', 'Pressure', 'Pass EPA / play under pressure'],
    ['stacked_box_rate', 'rush_epa_stacked_box', 'Stacked Box', 'Rush EPA / play vs stacked boxes']
  ];

  var PERSONNEL_ROWS = [
    ['personnel_11_rate', '11 Personnel', 'pct'],
    ['personnel_12_rate', '12 Personnel', 'pct'],
    ['formation_shotgun_rate', 'Shotgun', 'pct'],
    ['formation_under_center_rate', 'Under Centre', 'pct'],
    ['motion_rate', 'Pre-Snap Motion', 'pct'],
    ['play_action_rate', 'Play Action', 'pct'],
    ['rpo_rate', 'RPO', 'pct'],
    ['screen_rate', 'Screen', 'pct'],
    ['no_huddle_rate', 'No Huddle', 'pct'],
    ['neutral_pass_rate', 'Neutral Pass Rate', 'pct']
  ];

  var RESPONSE_ROWS = [
    ['pass_epa_man', 'Pass EPA Vs Man', 'epa'],
    ['pass_epa_zone', 'Pass EPA Vs Zone', 'epa'],
    ['pass_epa_play_action', 'Pass EPA On Play Action', 'epa'],
    ['pass_success_rate', 'Pass Success Rate', 'pct'],
    ['rush_success_rate', 'Rush Success Rate', 'pct']
  ];

  var TARGET_ROWS = [
    ['target_share_rb_all', 'Running Backs', 'pct'],
    ['target_share_wr_all', 'Wide Receivers', 'pct'],
    ['target_share_te_all', 'Tight Ends', 'pct']
  ];

  function pctText(value) {
    var v = Number(value);
    return isFinite(v) ? (v * 100).toFixed(1) + '%' : '\u2014';
  }

  function schemeValue(value, kind) {
    if (kind === 'epa') return epaText(value);
    if (kind === 'num') return isFinite(Number(value)) ? Number(value).toFixed(2) : '\u2014';
    return pctText(value);
  }

  /* A share gets a bar behind it. These rates run 0-100% of the charted snaps,
     so the bar is the rate itself at its own scale and the column becomes
     scannable instead of being twelve numbers to read one at a time.
     EPA is a signed per-play margin on a different scale entirely, so it keeps
     the number alone rather than being given a bar that would imply one. */
  function frequencyRank(scheme, phase, group, key) {
    return (((((scheme || {}).league_frequency_ranks || {})[phase] || {})[group] || {})[key]) || null;
  }

  function schemeNorm(z) {
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }

  function responseEntry(scheme, phase, key, value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    if (!isFinite(n)) return null;
    var base = ((((scheme || {}).league_response || {})[phase] || {})[key]) || {};
    var of = Number(base.n) || 32;
    var mean = Number(base.mean);
    var std = Number(base.std);
    var entry = { value: n, of: of };
    if (isFinite(mean) && isFinite(std) && std > 0) {
      var z = (n - mean) / std;
      if (phase === 'defense') z = -z;
      var pct = schemeNorm(z);
      entry.rank = Math.max(1, Math.min(of, Math.round((1 - pct) * (of - 1) + 1)));
    }
    return entry;
  }

  function freqEntry(scheme, phase, group, key, value) {
    var rank = frequencyRank(scheme, phase, group, key);
    if (value == null && !rank) return null;
    var n = Number(value);
    var entry = { value: isFinite(n) ? n : null };
    if (rank) {
      entry.rank = rank.place;
      entry.of = rank.of;
    }
    if (entry.value == null && entry.rank == null) return null;
    return entry;
  }

  function rateTable(caption, rows, source, scheme, phase, group, modifier) {
    var body = rows.map(function (row) {
      var raw = source[row[0]];
      if (raw == null) return '';
      var bar = '';
      if (row[2] === 'pct') {
        var rank = frequencyRank(scheme, phase, group, row[0]);
        bar = rank ? segmentedMeter(percentOf(rank), rankTone(rank.place, rank.of),
          row[1] + ': ' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
          ' by league frequency') : '';
      }
      var rankText = row[2] === 'pct' ? frequencyRank(scheme, phase, group, row[0]) : null;
      return '<tr><td>' + esc(row[1]) + bar + '</td><td class="num ' +
        (rankText ? rankTone(rankText.place, rankText.of) : '') + '">' +
        esc(schemeValue(raw, row[2])) + (rankText ? '<small>' + rankText.place +
        ordinal(rankText.place) + ' of ' + rankText.of + ' frequency</small>' : '') + '</td></tr>';
    }).filter(Boolean).join('');
    if (!body) return '';
    return '<div class="ca-rate-block' + (modifier ? ' ' + esc(modifier) : '') + '"><h4>' + esc(caption) + '</h4>' +
      '<table class="ca-rate-table"><tbody>' + body + '</tbody></table></div>';
  }

  function pressureMatchups(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'] || {};
    var defScheme = game[defSide + '_scheme'] || {};
    var offResponse = ((offScheme.offense || {}).response) || {};
    var defResponse = ((defScheme.defense || {}).response) || {};
    var pressure = ((defScheme.defense || {}).pressure) || {};
    var rows = PRESSURE_ROWS.map(function (spec) {
      var frequency = pressure[spec[0]];
      var offVal = offResponse[spec[1]];
      var defVal = defResponse[spec[1]];
      if (frequency == null && offVal == null && defVal == null) return '';
      var rank = frequencyRank(defScheme, 'defense', 'pressure', spec[0]);
      var meter = rank ? segmentedMeter(percentOf(rank), rankTone(rank.place, rank.of),
        spec[2] + ': ' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
        ' by how often this defence creates the look') : '';
      return '<div class="ca-pressure-row' + nflRowLead(offScheme, defScheme, spec[1], offVal, defVal) + '">' +
        '<div class="ca-pressure-freq"><strong>' + esc(spec[2]) + '</strong>' +
        '<span>' + esc(pctText(frequency)) +
        (rank ? ' · ' + rank.place + ordinal(rank.place) + ' of ' + rank.of : '') +
        '</span>' + meter + '<small>' + esc(spec[3]) + '</small></div>' +
        nflEpaCell(offScheme, 'offense', spec[1], offVal, false) +
        nflEpaCell(defScheme, 'defense', spec[1], defVal, false) + '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-rate-block ca-rate-block--pressure ca-pressure-matchup">' +
      '<h4>Pressure Matchups</h4>' +
      nflPairHead(sport, game, offSide, defSide, 'How Often · Then The EPA',
        'Offence in the look', 'Defence creating it') +
      rows + '</div>';
  }

  function personnelDuel(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'] || {};
    var defScheme = game[defSide + '_scheme'] || {};
    var offP = ((offScheme.offense || {}).personnel) || {};
    var defP = ((defScheme.defense || {}).personnel) || {};
    var rows = PERSONNEL_ROWS.map(function (row) {
      var off = freqEntry(offScheme, 'offense', 'personnel', row[0], offP[row[0]]);
      var def = freqEntry(defScheme, 'defense', 'personnel', row[0], defP[row[0]]);
      if (!off && !def) return '';
      function side(entry, which) {
        if (!entry || entry.value == null) {
          return '<div class="ca-snap-side ca-snap-side--' + which + ' is-absent">&mdash;</div>';
        }
        var pct = Number(entry.value) * 100;
        return '<div class="ca-snap-side ca-snap-side--' + which + ' ' +
          rankTone(entry.rank, entry.of) + '">' +
          '<span class="ca-usage ' + usageTone(pct) + '">' + usageSquares(pct) +
          '<b>' + esc(pctText(entry.value)) + '</b></span>' +
          (entry.rank ? '<i>' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</i>' : '') +
          '</div>';
      }
      return '<div class="ca-snap-row">' + side(off, 'off') +
        '<span class="ca-snap-label">' + esc(row[1]) + '</span>' +
        side(def, 'def') + '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-rate-block ca-rate-block--personnel">' +
      '<h4>Personnel And Formation</h4>' +
      nflPairHead(sport, game, offSide, defSide, 'Share Of Charted Snaps',
        'This offence runs', 'What that defence has faced') +
      '<div class="ca-snap-board">' + rows + '</div></div>';
  }

  /* One direction of the confrontation: this offence against that defence. */
  /* ---------------------------------------------------------------------
   * Which season is on screen.
   *
   * Every charted rate in this section comes from the seasons the board names
   * in `source_seasons`, and at week one of a new season that is LAST season -
   * a fact the page stated in a note under the bars and nowhere a reader would
   * see it. It belongs in the heading and on a control, because "this offence
   * plays 54% eleven personnel" and "this offence played 54% eleven personnel
   * last year" are different claims.
   *
   * The control offers the season on its own as well as the combined view. It
   * is wired to what the board actually publishes: when a season carries no
   * charted plays yet, choosing it says so rather than relabelling last year's
   * numbers with this year's date.
   * ------------------------------------------------------------------ */
  function schemeSeasons(game) {
    var out = {};
    ['away', 'home'].forEach(function (side) {
      var profile = game[side + '_scheme'] || {};
      (profile.participation_source_seasons || profile.source_seasons || []).forEach(function (y) {
        out[Number(y)] = true;
      });
    });
    return Object.keys(out).map(Number).sort();
  }

  function currentSeason(game) {
    var declared = Number((game.scheme_source || {}).season);
    if (isFinite(declared) && declared > 2000) return declared;
    return seasonOf(game.kickoff_utc);
  }

  function seasonToggle(game) {
    var charted = schemeSeasons(game);
    var now = currentSeason(game);
    if (!charted.length) return '';
    var shown = charted.concat([now]).filter(function (year, index, all) {
      return all.indexOf(year) === index;
    }).sort();
    var options = [
      ['combined', shown.join(' + '), 'Prior-season charting and current-season form'],
      ['current', String(now) + ' Only', 'Current-season evidence only']
    ];
    return '<aside class="ca-analysis-scope" aria-label="Analysis scope"><div>' +
      '<span class="ca-analysis-scope__eyebrow">Evidence Window</span>' +
      '<strong>Choose The Seasons In View</strong></div>' +
      '<div class="ca-season-toggle" role="group" aria-label="Statistics shown" ' +
      'data-current-season="' + now + '">' +
      options.map(function (opt, i) {
        return '<button type="button" class="ca-season-toggle__btn' + (i === 0 ? ' is-on' : '') +
          '" data-season-scope="' + opt[0] + '" aria-pressed="' + (i === 0) + '" title="' +
          esc(opt[2]) + '">' + esc(opt[1]) + '</button>';
      }).join('') +
      '</div><p class="ca-analysis-scope__copy">Combined keeps prior-season scheme context ' +
      'beside current form. Current-only never relabels an older sample.</p>' +
      '<p class="ca-season-toggle__note" data-season-empty hidden>No ' + now +
      '-only scheme charting is published yet. Current Team Form and Radar remain below.</p>' +
      '</aside>';
  }

  /* ---------------------------------------------------------------------
   * The confrontation, situation by situation.
   *
   * The board publishes each club's EPA per play split by what the defence was
   * doing - against man, against zone, against the blitz, under pressure, off
   * play-action - for BOTH phases, and the page was rendering none of it. It
   * is the most direct thing on the artifact: this offence has moved the ball
   * at +0.33 a play against man; the defence it meets on Sunday has given up
   * -0.11 a play in the same situation.
   *
   * Both numbers are EPA per play from the offence's point of view, so they are
   * on the same scale and can be put on the same row. Positive is good for the
   * offence and bad for the defence, which is why the two columns grade in
   * opposite directions rather than sharing one ramp.
   * ------------------------------------------------------------------ */
  var SITUATIONS = [
    ['pass_epa_man', 'Versus Man', 'Dropback EPA per play against man coverage'],
    ['pass_epa_zone', 'Versus Zone', 'Dropback EPA per play against zone coverage'],
    ['pass_epa_blitz', 'Versus Blitz', 'Dropback EPA per play when the defence sends extra'],
    ['pass_epa_pressure', 'Under Pressure', 'Dropback EPA per play when the pocket breaks down'],
    ['pass_epa_play_action', 'Off Play Action', 'Dropback EPA per play on play-action'],
    ['rush_epa', 'Running The Ball', 'Rush EPA per play'],
    ['pass_success_rate', 'Dropback Success', 'Share of dropbacks that gained enough to stay on schedule'],
    ['rush_success_rate', 'Rush Success', 'Share of runs that gained enough to stay on schedule']
  ];

  /* Situational EPA and success rates grade against the league average of that
     same situation, in that phase, in the 32 clubs' own spread. Zero is not
     average: every offence gives EPA back under pressure and gains it off play
     action, and a success rate is a share near 45% - so the fixed ramp around
     zero that used to sit here painted every offence elite on success rate and
     every defence poor, whatever they had actually done. Offence reads high as
     good; the defensive column is EPA allowed, so low is good. No published
     baseline, no colour. */
  function responseTone(scheme, phase, key, value) {
    var A = global.MLBMAAssets;
    var baseline = ((((scheme || {}).league_response || {})[phase]) || {})[key];
    if (!A || !A.baselineChipClass || !baseline) return '';
    return A.baselineChipClass(value, baseline, phase === 'offense');
  }

  function epaText(value, isRate) {
    var v = Number(value);
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.0005) v = 0;
    return isRate ? (v * 100).toFixed(1) + '%' : (v > 0 ? '+' : '') + v.toFixed(3);
  }

  function nflPairHead(sport, game, offSide, defSide, axis, offRole, defRole) {
    return '<header class="ca-nfl-pair">' +
      '<div>' + logo(sport, game, offSide, 32, 'ca-coverage-crest') +
      '<span><b>' + esc(fullName(sport, game, offSide)) + '</b><small>' + esc(offRole) + '</small></span></div>' +
      '<strong>' + esc(axis) + '</strong>' +
      '<div><span><b>' + esc(fullName(sport, game, defSide)) + '</b><small>' + esc(defRole) + '</small></span>' +
      logo(sport, game, defSide, 32, 'ca-coverage-crest') + '</div></header>';
  }

  function nflEpaCell(scheme, phase, key, value, isRate) {
    var tone = responseTone(scheme, phase, key, value);
    var entry = responseEntry(scheme, phase, key, value);
    var shown = value == null || value === '' ? '\u2014' : epaText(value, isRate);
    var rank = entry && entry.rank
      ? '<i>' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</i>' : '';
    var caption = isRate
      ? (phase === 'offense' ? 'Off success' : 'Success allowed')
      : (phase === 'offense' ? 'Off EPA / play' : 'EPA allowed / play');
    return '<div class="ca-nfl-epa ca-nfl-epa--' + phase + ' ' + tone + '">' +
      '<strong>' + esc(shown) + '</strong>' + rank +
      '<span>' + caption + '</span></div>';
  }

  function nflRowLead(offScheme, defScheme, key, offVal, defVal) {
    var a = percentOf(responseEntry(offScheme, 'offense', key, offVal));
    var b = percentOf(responseEntry(defScheme, 'defense', key, defVal));
    if (a == null || b == null || a === b) return '';
    return a > b ? ' is-off' : ' is-def';
  }

  function confrontation(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'] || {};
    var defScheme = game[defSide + '_scheme'] || {};
    var off = ((offScheme.offense || {}).response) || {};
    var def = ((defScheme.defense || {}).response) || {};
    var rows = SITUATIONS.map(function (spec) {
      var a = off[spec[0]], b = def[spec[0]];
      if (a == null && b == null) return '';
      var isRate = spec[0].indexOf('success') >= 0;
      return '<div class="ca-coverage-row' + nflRowLead(offScheme, defScheme, spec[0], a, b) + '">' +
        nflEpaCell(offScheme, 'offense', spec[0], a, isRate) +
        '<div class="ca-coverage-look ca-sit-look"><span>' + esc(spec[1]) + '</span>' +
        '<small>' + esc(spec[2]) + '</small></div>' +
        nflEpaCell(defScheme, 'defense', spec[0], b, isRate) + '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-coverage-matrix ca-sit-board">' +
      nflPairHead(sport, game, offSide, defSide, 'Situation',
        'This offence’s EPA', 'What that defence has allowed') +
      rows + '</div>';
  }

  function coverageMatrix(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'] || {};
    var defFull = game[defSide + '_scheme'] || {};
    var off = ((offScheme.offense || {}).response) || {};
    var defScheme = defFull.defense || {};
    var def = defScheme.response || {};
    var tendencies = defScheme.coverage || {};
    var rows = [
      ['man_rate', 'pass_epa_man', 'Man'],
      ['zone_rate', 'pass_epa_zone', 'Zone']
    ].concat(COVERAGE_SHELLS).map(function (spec) {
      var tendency = tendencies[spec[0]];
      var offValue = off[spec[1]];
      var defValue = def[spec[1]];
      if (tendency == null && offValue == null && defValue == null) return '';
      var rank = frequencyRank(defFull, 'defense', 'coverage', spec[0]);
      var meter = rank ? segmentedMeter(percentOf(rank), rankTone(rank.place, rank.of),
        spec[2] + ': ' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
        ' by how often this defence plays it') : '';
      return '<div class="ca-coverage-row' +
        nflRowLead(offScheme, defFull, spec[1], offValue, defValue) + '">' +
        nflEpaCell(offScheme, 'offense', spec[1], offValue, false) +
        '<div class="ca-coverage-look"><span>' + esc(spec[2]) + '</span>' +
        meter + '<strong>' + esc(pctText(tendency)) +
        (rank ? ' · ' + rank.place + ordinal(rank.place) : '') + '</strong></div>' +
        nflEpaCell(defFull, 'defense', spec[1], defValue, false) + '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-coverage-matrix">' +
      nflPairHead(sport, game, offSide, defSide, 'Coverage',
        'Offensive response', 'Defensive tendency + allowance') +
      rows + '</div>';
  }

  function playerCoveragePanels(sport, game, offSide) {
    var profiles = game[offSide + '_player_coverage'] || [];
    var offense = unitData(game, offSide, 'offense');
    var starterProfiles = {};
    ((offense || {}).players || []).forEach(function (player) {
      if (['QB', 'RB', 'WR', 'TE'].indexOf(String(player.position || '').toUpperCase()) >= 0) {
        starterProfiles[playerNameKey(player.name)] = player;
      }
    });
    profiles = profiles.filter(function (profile) {
      return starterProfiles[playerNameKey(profile.player_name)];
    });
    if (!profiles.length) return '<section class="ca-player-coverage"><h4>Players By Coverage</h4>' +
      '<div class="ca-player-coverage-groups"><section class="ca-player-coverage-group"><h5>Quarterbacks</h5>' +
      pending('Quarterback-level coverage splits are not published. Use Offensive Response in the comparison above.') +
      '</section><section class="ca-player-coverage-group"><h5>Running Backs</h5>' +
      pending('No season-labelled coverage splits are published for these starters.') +
      '</section><section class="ca-player-coverage-group"><h5>Wide Receivers</h5>' +
      pending('No season-labelled coverage splits are published for these starters.') + '</section></div></section>';
    var bySeason = {};
    profiles.forEach(function (profile) {
      (bySeason[profile.source_season] = bySeason[profile.source_season] || []).push(profile);
    });
    function allCoverage(profile) {
      return (profile.splits || []).find(function (split) {
        return split.coverage === 'all' && Number(split.targets) >= 20 &&
          isFinite(Number(split.epa_per_target));
      }) || null;
    }
    function positionalValue(profile) {
      var overall = allCoverage(profile);
      if (!overall) return null;
      var published = (overall.league_ranks || {}).epa_per_target;
      if (published) return { rank: published.place, of: published.of, overall: overall,
        tone: rankTone(published.place, published.of) };
      var position = String(profile.position || '').toUpperCase();
      var season = String(profile.source_season || '');
      var pool = [].concat(game.away_player_coverage || [], game.home_player_coverage || [])
        .filter(function (candidate) {
          return String(candidate.position || '').toUpperCase() === position &&
            String(candidate.source_season || '') === season && allCoverage(candidate);
        }).sort(function (a, b) {
          return Number(allCoverage(b).epa_per_target) - Number(allCoverage(a).epa_per_target);
        });
      var rank = 1 + pool.filter(function (candidate) {
        return Number(allCoverage(candidate).epa_per_target) > Number(overall.epa_per_target);
      }).length;
      return { rank: rank, of: pool.length, overall: overall, tone: rankTone(rank, pool.length) };
    }
    function rankedPlayerCell(value, rank, format) {
      var shown = value == null ? '—' : format(value);
      if (!rank) return '<td class="num">' + esc(shown) + '</td>';
      return '<td class="num ' + rankTone(rank.place, rank.of) + '" title="' +
        rank.place + ordinal(rank.place) + ' of ' + rank.of + ' at this position and coverage">' +
        esc(shown) + '<small>' + rank.place + ordinal(rank.place) + '</small></td>';
    }
    return Object.keys(bySeason).sort().reverse().map(function (season) {
      function playerCard(profile) {
        var starter = starterProfiles[playerNameKey(profile.player_name)] || {};
        var positionValue = positionalValue(profile);
        var splits = (profile.splits || []).filter(function (split) {
          return split.coverage !== 'all' && Number(split.targets) >= 3;
        }).sort(function (a, b) { return Number(b.targets) - Number(a.targets); }).slice(0, 5);
        if (!splits.length) return '';
        var rows = splits.map(function (split) {
          var label = String(split.coverage || '').replace(/^cover_/, 'Cover ').replace(/_/g, ' ');
          var ranks = split.league_ranks || {};
          return '<tr><td>' + esc(titleCase(label)) + '</td><td class="num">' +
            esc(split.targets) + '</td>' +
            rankedPlayerCell(split.catch_rate, ranks.catch_rate, pctText) +
            rankedPlayerCell(split.yards_per_target, ranks.yards_per_target,
              function (v) { return Number(v).toFixed(1); }) +
            rankedPlayerCell(split.epa_per_target, ranks.epa_per_target,
              function (v) { return epaText(v, false); }) + '</tr>';
        }).join('');
        var portrait = starter.headshot_url
          ? '<img class="ca-player-coverage-card__shot" src="' + esc(starter.headshot_url) +
            '" alt="" width="64" height="64" loading="lazy" decoding="async">'
          : '<span class="ca-player-coverage-card__initials" aria-hidden="true">' +
            esc(initials(profile.player_name)) + '</span>';
        var grade = positionValue
          ? '<div class="ca-player-coverage-card__grade ' + esc(positionValue.tone) +
            '" title="Ranked by season EPA per target among same-position players in this matchup with at least 20 targets">' +
            '<span>Position Rank</span><strong>' + positionValue.rank + ordinal(positionValue.rank) +
            ' / ' + positionValue.of + '</strong><small>' +
            esc(epaText(positionValue.overall.epa_per_target, false)) + ' EPA/T</small></div>'
          : '<div class="ca-player-coverage-card__grade c-na"><span>Position Rank</span>' +
            '<strong>—</strong><small>No 20-target sample</small></div>';
        return '<article class="ca-player-coverage-card" role="listitem"><header>' + portrait +
          '<div class="ca-player-coverage-card__identity"><span class="ca-lineup-player__position">' +
          esc(profile.position) + '</span><strong>' + esc(profile.player_name) + '</strong></div>' +
          grade + '</header>' +
          '<div class="ca-lineup-scroll"><table><thead><tr><th>Coverage</th><th class="num">Tgt</th>' +
          '<th class="num">Catch</th><th class="num">Y/T</th><th class="num">EPA/T</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div></article>';
      }
      var labels = { QB: 'Quarterbacks', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends' };
      var groups = ['RB', 'WR', 'TE'].map(function (position) {
        var cards = bySeason[season].filter(function (profile) {
          return String(profile.position || '').toUpperCase() === position;
        }).map(playerCard).filter(Boolean).join('');
        if (!cards) return '';
        var content = cards;
        return '<section class="ca-player-coverage-group" data-position="' + position + '"><h5>' +
          labels[position] + '</h5><div class="ca-player-coverage-grid" role="list" ' +
          'aria-label="' + labels[position] + ' coverage cards; scroll horizontally on small screens">' +
          content + '</div></section>';
      }).filter(Boolean).join('');
      if (!groups) return '';
      return '<section class="ca-player-coverage" data-scheme-seasons="' + esc(season) + '">' +
        '<div class="ca-player-coverage__head"><div><h4>Players By Coverage</h4><p>' +
        esc(fullName(sport, game, offSide)) + ' · ' + season + ' receiving splits</p></div>' +
        '<span>League rank within position · 20+ overall targets; rows 3+ targets</span></div>' +
        '<div class="ca-player-coverage-groups">' + groups + '</div></section>';
    }).join('');
  }

  function playerSchemePanels(sport, game, offSide) {
    var profiles = game[offSide + '_player_scheme'] || [];
    var offense = unitData(game, offSide, 'offense');
    var starters = {};
    ((offense || {}).players || []).forEach(function (player) {
      if (['QB', 'RB'].indexOf(String(player.position || '').toUpperCase()) >= 0) {
        starters[playerNameKey(player.name)] = player;
      }
    });
    profiles = profiles.filter(function (profile) {
      return starters[playerNameKey(profile.player_name)];
    });
    if (!profiles.length) return '<section class="ca-player-scheme"><div class="ca-player-coverage__head">' +
      '<div><h4>Quarterbacks And Running Backs By Scheme</h4><p>' +
      esc(fullName(sport, game, offSide)) + '</p></div></div>' +
      pending('Observed player-level QB passing and RB rushing scheme splits are not published for these starters.') +
      '</section>';

    function ranked(value, rank, formatter) {
      var shown = value == null ? '—' : formatter(value);
      if (!rank) return '<td class="num">' + esc(shown) + '</td>';
      return '<td class="num ' + rankTone(rank.place, rank.of) + '" title="' +
        rank.place + ordinal(rank.place) + ' of ' + rank.of + ' at this position for this look">' +
        esc(shown) + '<small>' + rank.place + ordinal(rank.place) + '</small></td>';
    }
    function card(profile) {
      var starter = starters[playerNameKey(profile.player_name)] || {};
      var position = String(profile.position || '').toUpperCase();
      var volume = position === 'QB' ? 'dropbacks' : 'carries';
      var minimum = position === 'QB' ? 10 : 5;
      var order = position === 'QB'
        ? ['man', 'zone', 'blitz', 'no_blitz', 'pressure', 'clean', 'cover_0', 'cover_1',
           'cover_2', 'cover_3', 'cover_4', 'cover_6', 'cover_2_man']
        : ['stacked_box', 'light_box', 'left', 'middle', 'right', 'gap_guard', 'gap_tackle', 'gap_end'];
      var splits = (profile.splits || []).filter(function (split) {
        return split.look !== 'all' && Number(split[volume]) >= minimum;
      }).sort(function (a, b) {
        var ai = order.indexOf(a.look); var bi = order.indexOf(b.look);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      }).slice(0, 8);
      if (!splits.length) return '';
      var portrait = starter.headshot_url
        ? '<img class="ca-player-coverage-card__shot" src="' + esc(starter.headshot_url) +
          '" alt="" width="64" height="64" loading="lazy" decoding="async">'
        : '<span class="ca-player-coverage-card__initials" aria-hidden="true">' +
          esc(initials(profile.player_name)) + '</span>';
      var rows = splits.map(function (split) {
        var label = String(split.look || '').replace(/^cover_/, 'Cover ').replace(/^gap_/, '')
          .replace(/_/g, ' ');
        var ranks = split.league_ranks || {};
        if (position === 'QB') {
          return '<tr><td>' + esc(titleCase(label)) + '</td><td class="num">' +
            esc(split.dropbacks) + '</td>' + ranked(split.completion_rate, ranks.completion_rate, pctText) +
            ranked(split.yards_per_attempt, ranks.yards_per_attempt, function (v) { return Number(v).toFixed(1); }) +
            ranked(split.epa_per_dropback, ranks.epa_per_dropback, function (v) { return epaText(v, false); }) +
            '</tr>';
        }
        return '<tr><td>' + esc(titleCase(label)) + '</td><td class="num">' + esc(split.carries) +
          '</td>' + ranked(split.yards_per_carry, ranks.yards_per_carry, function (v) { return Number(v).toFixed(1); }) +
          ranked(split.epa_per_carry, ranks.epa_per_carry, function (v) { return epaText(v, false); }) +
          ranked(split.success_rate, ranks.success_rate, pctText) + '</tr>';
      }).join('');
      var headings = position === 'QB'
        ? '<th>Defensive Look</th><th class="num">DB</th><th class="num">Cmp</th><th class="num">Y/A</th><th class="num">EPA/DB</th>'
        : '<th>Run Look</th><th class="num">Att</th><th class="num">YPC</th><th class="num">EPA/Att</th><th class="num">Success</th>';
      return '<article class="ca-player-coverage-card ca-player-scheme-card" role="listitem"><header>' + portrait +
        '<div class="ca-player-coverage-card__identity"><span class="ca-lineup-player__position">' +
        esc(position) + '</span><strong>' + esc(profile.player_name) + '</strong><small>' +
        esc(position === 'QB' ? 'Passing Response' : 'Rushing Response') + '</small></div></header>' +
        '<div class="ca-lineup-scroll"><table><thead><tr>' + headings + '</tr></thead><tbody>' + rows +
        '</tbody></table></div></article>';
    }
    var seasons = {};
    profiles.forEach(function (profile) {
      (seasons[profile.source_season] = seasons[profile.source_season] || []).push(profile);
    });
    return Object.keys(seasons).sort().reverse().map(function (season) {
      var groups = ['QB', 'RB'].map(function (position) {
        var cards = seasons[season].filter(function (profile) { return profile.position === position; })
          .map(card).filter(Boolean).join('');
        if (!cards) return '';
        return '<section class="ca-player-coverage-group" data-position="' + position + '"><h5>' +
          (position === 'QB' ? 'Quarterbacks' : 'Running Backs') + '</h5>' +
          '<div class="ca-player-coverage-grid" role="list">' + cards + '</div></section>';
      }).filter(Boolean).join('');
      return groups ? '<section class="ca-player-scheme" data-scheme-seasons="' + esc(season) + '">' +
        '<div class="ca-player-coverage__head"><div><h4>Quarterbacks And Running Backs By Scheme</h4><p>' +
        esc(fullName(sport, game, offSide)) + ' · ' + season + ' observed player splits</p></div>' +
        '<span>Green to red by same-position league rank · QB 10+ dropbacks; RB 5+ carries</span></div>' +
        '<div class="ca-player-coverage-groups">' + groups + '</div></section>' : '';
    }).join('');
  }

  function schemePanel(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'];
    var defScheme = game[defSide + '_scheme'];
    var offName = fullName(sport, game, offSide);
    var defName = fullName(sport, game, defSide);
    var panelSeasons = [].concat((offScheme || {}).participation_source_seasons ||
      (offScheme || {}).source_seasons || [],
      (defScheme || {}).participation_source_seasons ||
      (defScheme || {}).source_seasons || []).map(Number).filter(Number.isFinite)
      .filter(function (year, index, all) { return all.indexOf(year) === index; })
      .join(',');
    var head = '<section class="ca-scheme-panel" data-scheme-seasons="' +
      esc(panelSeasons) + '"><h3>' +
      logo(sport, game, offSide, 28, 'ca-coverage-crest') +
      esc(offName) + ' offence versus ' + esc(defName) + ' defence' +
      logo(sport, game, defSide, 28, 'ca-coverage-crest') + '</h3>';
    if (!offScheme || !defScheme) {
      return head + pending('Charted scheme profiles are not published for this pairing.') +
        '</section>';
    }
    var defCov = (defScheme.defense || {}).coverage || {};
    var offTargets = ((offScheme.offense || {}).target_share) || {};
    var versus = confrontation(sport, game, offSide, defSide);
    var coverage = coverageMatrix(sport, game, offSide, defSide);
    var coverageNote = defCov.zone_rate == null ? '' :
      '<p class="ca-lineup-context">' + esc(defName) + ' played zone on ' +
      pctText(defCov.zone_rate) + ' of its charted coverage snaps.</p>';
    var targetBlock = rateTable('Target Share', TARGET_ROWS, offTargets,
      offScheme, 'offense', 'target_share', 'ca-rate-block--targets');

    var defPressure = (defScheme.defense || {}).pressure || {};
    var offResponse = (offScheme.offense || {}).response || {};
    function snapshotStat(label, primary, secondary) {
      return '<div class="ca-scheme-snapshot__stat"><span>' + esc(label) + '</span>' +
        '<strong>' + esc(primary) + '</strong><small>' + esc(secondary) + '</small></div>';
    }
    function freqRankText(group, key) {
      var rank = frequencyRank(defScheme, 'defense', group, key);
      return rank && rank.place ? rank.place + ordinal(rank.place) + ' of ' + rank.of : 'Rank unavailable';
    }
    var zoneResponse = responseEntry(offScheme, 'offense', 'pass_epa_zone', offResponse.pass_epa_zone);
    var snapshot = '<div class="ca-scheme-snapshot" aria-label="Scheme quick read">' +
      snapshotStat('Zone faced', pctText(defCov.zone_rate), freqRankText('coverage', 'zone_rate')) +
      snapshotStat('Blitz faced', pctText(defPressure.blitz_rate), freqRankText('pressure', 'blitz_rate')) +
      snapshotStat('Pressure faced', pctText(defPressure.pressure_rate), freqRankText('pressure', 'pressure_rate')) +
      snapshotStat('Off EPA vs zone', epaText(offResponse.pass_epa_zone),
        zoneResponse && zoneResponse.rank ? zoneResponse.rank + ordinal(zoneResponse.rank) + ' of ' + zoneResponse.of : 'Rank unavailable') +
      '</div>';

    return head + coverageNote + snapshot +
      '<details class="ca-scheme-detail"><summary>Coverage + situational EPA</summary>' +
      '<div class="ca-scheme-detail__body">' + coverage +
      (versus ? '<div class="ca-sit-block"><h4>Situation By Situation</h4>' + versus + '</div>' : '') +
      '</div></details>' +
      '<details class="ca-scheme-detail"><summary>Pressure, personnel + target distribution</summary>' +
      '<div class="ca-scheme-detail__body"><div class="ca-scheme-grid" aria-label="' + esc(offName) +
      ' offence and ' + esc(defName) + ' defence scheme details">' +
      pressureMatchups(sport, game, offSide, defSide) +
      personnelDuel(sport, game, offSide, defSide) +
      targetBlock + '</div></div></details></section>';
  }

  function schemeSwitcher(sport, game) {
    function tab(side, opp, selected) {
      var off = side === 'away' ? 'away' : 'home';
      var def = side === 'away' ? 'home' : 'away';
      return '<button type="button" id="caScheme' + (side === 'away' ? 'Away' : 'Home') +
        'Tab" class="ca-scheme-switch__tab' + (selected ? ' is-on' : '') + '" role="tab" ' +
        'aria-selected="' + (selected ? 'true' : 'false') + '" aria-controls="caScheme' +
        (side === 'away' ? 'Away' : 'Home') + 'Panel"' +
        (selected ? '' : ' tabindex="-1"') + ' data-scheme-direction="' + side + '">' +
        '<strong>' + logo(sport, game, off, 22, 'ca-scheme-tab-crest') +
        esc(fullName(sport, game, off)) + ' offence</strong>' +
        '<span>' + logo(sport, game, def, 18, 'ca-scheme-tab-crest') +
        'vs ' + esc(fullName(sport, game, def)) + ' defence</span></button>';
    }
    return '<div class="ca-scheme-switch"><div class="ca-scheme-switch__tabs" role="tablist" ' +
      'aria-label="Choose scheme confrontation">' +
      tab('away', 'home', true) + tab('home', 'away', false) +
      '</div><div id="caSchemeAwayPanel" role="tabpanel" aria-labelledby="caSchemeAwayTab" ' +
      'data-scheme-direction-panel="away">' + schemePanel(sport, game, 'away', 'home') + '</div>' +
      '<div id="caSchemeHomePanel" role="tabpanel" aria-labelledby="caSchemeHomeTab" ' +
      'data-scheme-direction-panel="home" hidden>' + schemePanel(sport, game, 'home', 'away') + '</div>' +
      '</div>';
  }

  function formText(entry) {
    if (!entry) return '\u2014';
    var n = Number(entry.value);
    if (!isFinite(n)) return '\u2014';
    var label = String(entry.label || '');
    if (entry.format === 'ppa' || label.indexOf('PPA') >= 0 || label.indexOf('EPA') >= 0) {
      return (n > 0 ? '+' : '') + n.toFixed(3);
    }
    if (entry.format === 'num') {
      if (Math.abs(n) >= 10) return n.toFixed(1);
      var tenth = Math.round(n * 10) / 10;
      if (Math.abs(n - tenth) < 0.03) return tenth.toFixed(1);
      if (Math.abs(n) >= 1) return n.toFixed(2);
      return n.toFixed(3);
    }
    if (entry.format === 'pct' || (Math.abs(n) <= 1 && !entry.format)) {
      return (n * 100).toFixed(1) + '%';
    }
    return n.toFixed(2);
  }

  function formRow(entry) {
    if (!entry) return '';
    return '<div class="ca-form-cell">' +
      '<span class="ca-form-label">' + esc(titleCase(entry.label)) + '</span>' +
      '<strong class="ca-form-value">' + esc(formText(entry)) + '</strong>' +
      percentBar(entry.rank, entry.of) +
      '<span class="ca-form-rank ' + rankTone(entry.rank, entry.of) + '">' +
      entry.rank + ordinal(entry.rank) + ' Of ' + entry.of + '</span>' +
      '</div>';
  }

  function nflFormPanel(sport, game, side) {
    var form = game[side + '_form'];
    var label = fullName(sport, game, side);
    if (!form || !form.rates) {
      return '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>' +
        pending('Team form is not published for this club.') + '</section>';
    }
    var order = sport === 'cfb' ? CFB_FORM_ORDER : ['off_epa', 'off_first_down', 'off_explosive', 'off_sack', 'off_turnover',
      'def_epa', 'def_first_down', 'def_explosive', 'def_sack', 'def_turnover'];
    var cells = order.map(function (key) { return formRow(form.rates[key]); })
      .filter(Boolean).join('');
    var plays = form.plays != null
      ? '<p class="ca-lineup-context">' + (sport === 'cfb'
          ? Math.round(Number(form.plays)) + ' games in the ESPN sample'
          : Number(form.plays).toFixed(1) + ' plays per game') + '</p>'
      : '';
    return '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>' + plays +
      '<div class="ca-form-grid">' + cells + '</div></section>';
  }

  /* Identity-only starting units arranged in formation rows. The source names
     a position and its first player; this renderer never invents a snap share. */
  function playerNameKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      .replace(/(?:jr|sr|ii|iii|iv)$/, '');
  }

  function initials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (part) { return part.charAt(0); }).join('').toUpperCase() || '—';
  }

  function designationMap(entries) {
    var out = {};
    (entries || []).forEach(function (entry) {
      out[playerNameKey(entry.name)] = entry;
    });
    return out;
  }

  function designationFor(player, entries, byName) {
    return byName[playerNameKey(player.name)] || {
      status: Array.isArray(entries) ? 'Active' : 'Report pending',
      detail: ''
    };
  }

  function playerGroup(player, unit) {
    if (player.group) return player.group;
    var pos = String(player.position || '').toUpperCase();
    if (unit === 'offense') {
      if (['QB', 'RB', 'FB'].indexOf(pos) >= 0) return 'Backfield';
      if (['WR', 'TE'].indexOf(pos) >= 0) return 'Receivers';
      return 'Offensive Line';
    }
    if (['LDE', 'DE', 'RDE', 'DT', 'NT'].indexOf(pos) >= 0) return 'Front';
    if (['WLB', 'OLB', 'LILB', 'ILB', 'MLB', 'RILB', 'SLB', 'LB'].indexOf(pos) >= 0) {
      return 'Linebackers';
    }
    return 'Secondary';
  }

  function playerPortrait(player) {
    if (player.headshot_url) {
      return '<img class="ca-lineup-player__shot" src="' + esc(player.headshot_url) +
        '" alt="" width="160" height="160" loading="lazy" decoding="async">';
    }
    return '<span class="ca-lineup-player__initials" aria-hidden="true">' +
      esc(initials(player.name)) + '</span>';
  }

  function lineupPlayer(player, designation) {
    var status = designation.status || 'Active';
    var statusKey = String(status).toLowerCase().replace(/\s+/g, '-');
    return '<article class="ca-lineup-player" data-position="' + esc(player.position) + '">' +
      playerPortrait(player) + '<div class="ca-lineup-player__identity">' +
      '<span class="ca-lineup-player__position">' + esc(player.position) + '</span>' +
      '<strong>' + esc(player.name) + '</strong></div>' +
      '<div class="ca-lineup-player__availability"><span class="ca-status-pill" data-status="' +
      esc(statusKey) + '">' + esc(status) + '</span>' +
      (designation.detail ? '<small>' + esc(designation.detail) + '</small>' : '') +
      '</div></article>';
  }

  function legacyOffense(game, side) {
    var starters = [];
    (game[side + '_players'] || []).forEach(function (player) {
      var position = String(player.position || '').toUpperCase();
      var rank = Number(player.depth_rank || 1);
      if ((position === 'WR' && rank <= 3) ||
          (['QB', 'RB', 'TE', 'FB'].indexOf(position) >= 0 && rank === 1)) {
        starters.push(player);
      }
    });
    return starters.length ? { package: 'Published Skill Starters', players: starters } : null;
  }

  function unitData(game, side, unit) {
    var lineups = game[side + '_lineups'] || {};
    return lineups[unit] || (unit === 'offense' ? legacyOffense(game, side) : null);
  }

  function lineupUnit(game, side, unit, entries, tabId, panelId) {
    var data = unitData(game, side, unit);
    var hidden = unit === 'defense' ? ' hidden' : '';
    if (!data || !data.players || !data.players.length) {
      return '<section class="ca-lineup-unit" role="tabpanel" id="' + panelId +
        '" aria-labelledby="' + tabId + '" data-lineup-panel="' + unit + '"' + hidden + '>' +
        pending((unit === 'offense' ? 'Offensive' : 'Defensive') +
          ' starters are not published for this club.') + '</section>';
    }
    var groups = {};
    data.players.forEach(function (player) {
      var group = playerGroup(player, unit);
      (groups[group] = groups[group] || []).push(player);
    });
    var order = unit === 'offense'
      ? ['Receivers', 'Offensive Line', 'Backfield']
      : ['Secondary', 'Linebackers', 'Front'];
    var byName = designationMap(entries);
    var content = order.filter(function (group) { return groups[group] && groups[group].length; })
      .map(function (group) {
        return '<section class="ca-lineup-group" data-lineup-group="' +
          esc(group.toLowerCase().replace(/\s+/g, '-')) + '"><header><h4>' + esc(group) + '</h4><span>' +
          groups[group].length + '</span></header><div class="ca-lineup-group__players">' +
          groups[group].map(function (player) {
            return lineupPlayer(player, designationFor(player, entries, byName));
          }).join('') + '</div></section>';
      }).join('');
    return '<section class="ca-lineup-unit" role="tabpanel" id="' + panelId +
      '" aria-labelledby="' + tabId + '" data-lineup-panel="' + unit + '"' + hidden + '>' +
      '<div class="ca-lineup-unit__meta"><strong>' + esc(data.package || titleCase(unit)) +
      '</strong><span>' + data.players.length + ' Published Starters</span></div>' +
      '<div class="ca-lineup-groups">' + content + '</div></section>';
  }

  function namedQuarterback(game, side) {
    var players = game[side + '_players'] || [];
    for (var i = 0; i < players.length; i++) {
      if (players[i].position === 'QB' && players[i].depth_rank === 1) return players[i].name;
    }
    return game[side + '_starter'] || '';
  }

  function injuryReport(entries) {
    if (!entries) return pending('Injury report not published for this club.');
    if (!entries.length) return pending('No designations reported.');
    var rows = entries.map(function (entry) {
      return '<li class="ca-avail-row"><span class="ca-avail-pos">' +
        esc(entry.position || '—') + '</span><strong class="ca-avail-name">' +
        esc(entry.name) + '</strong><span class="ca-avail-detail">' +
        esc(entry.detail || 'No detail') + '</span><span class="ca-status-pill" data-status="' +
        esc(String(entry.status || '').toLowerCase().replace(/\s+/g, '-')) + '">' +
        esc(entry.status) + '</span></li>';
    }).join('');
    return '<details class="ca-injury-report"><summary><span class="ca-injury-report__label">Full Injury Report</span><span class="ca-injury-report__count">' +
      entries.length + ' Player' + (entries.length === 1 ? '' : 's') +
      '</span></summary><ul class="ca-avail-list">' + rows + '</ul></details>';
  }

  function lineupBoard(sport, game, side) {
    var entries = game[side + '_availability_list'];
    var label = fullName(sport, game, side);
    var qb = namedQuarterback(game, side);
    var key = side === 'away' ? 'away' : 'home';
    var offenseTab = key + '-offense-tab';
    var defenseTab = key + '-defense-tab';
    var offensePanel = key + '-offense-panel';
    var defensePanel = key + '-defense-panel';
    return '<article class="ca-lineup-board"><header class="ca-lineup-board__head">' +
      logo(sport, game, side, 44, 'ca-lineup-board__logo') + '<div><h3>' + esc(label) + '</h3>' +
      '<p>' + (qb ? 'QB ' + esc(qb) + ' · ' : '') +
      esc(value(game[side + '_availability'], 'Injury Report Pending')) + '</p></div></header>' +
      '<div class="ca-lineup-tabs" role="tablist" aria-label="' + esc(label) + ' starting unit">' +
      '<button type="button" role="tab" id="' + offenseTab + '" aria-controls="' + offensePanel +
      '" aria-selected="true" tabindex="0" class="ca-lineup-tab is-on" data-lineup-unit="offense">Offense</button>' +
      '<button type="button" role="tab" id="' + defenseTab + '" aria-controls="' + defensePanel +
      '" aria-selected="false" tabindex="-1" class="ca-lineup-tab" data-lineup-unit="defense">Defense</button>' +
      '</div>' + lineupUnit(game, side, 'offense', entries, offenseTab, offensePanel) +
      lineupUnit(game, side, 'defense', entries, defenseTab, defensePanel) +
      injuryReport(entries) + '</article>';
  }

  /* ---------------------------------------------------------------------
   * NFL decision desk.
   *
   * The old page opened with two full depth charts, then made the reader work
   * through every coverage shell before reaching the ten team rates. This
   * layer keeps every fact and every section, but orders them by the questions
   * bettors, prop researchers and fantasy players actually ask: how the units
   * match up, how much volume the teams and players have produced, which
   * scheme splits explain it, and only then who is available.
   * ------------------------------------------------------------------ */
  var NFL_MATCHUP_ROWS = [
    ['off_epa', 'def_epa', 'EPA / Play',
      'Expected points added on each snap; offense high is good, defense low is good',
      'Scoring'],
    ['off_first_down', 'def_first_down', 'First-Down Rate',
      'Share of plays that became a first down', 'Drive volume'],
    ['off_explosive', 'def_explosive', 'Explosive-Play Rate',
      'Share of plays that cleared the source explosive-play threshold',
      'Explosives'],
    ['off_sack', 'def_sack', 'Sack Rate',
      'Sacks taken by the offense versus sacks generated by the defense',
      'Pass protection'],
    ['off_turnover', 'def_turnover', 'Turnover Rate',
      'Giveaways by the offense versus takeaways generated by the defense',
      'Possessions']
  ];

  function nflFormEntry(game, side, key) {
    return ((((game[side + '_form'] || {}).rates) || {})[key]) || null;
  }

  function nflFormCell(entry, caption) {
    if (!entry) {
      return '<div class="ca-nfl-matchup-cell is-absent"><strong>—</strong>' +
        '<span>' + esc(caption) + '</span></div>';
    }
    return '<div class="ca-nfl-matchup-cell ' + rankTone(entry.rank, entry.of) + '">' +
      '<strong>' + esc(formText(entry)) + '</strong><i>' + entry.rank +
      ordinal(entry.rank) + ' of ' + entry.of + '</i><span>' + esc(caption) + '</span></div>';
  }

  function nflMatchupDirection(sport, game, offSide, defSide) {
    var rows = NFL_MATCHUP_ROWS.map(function (spec) {
      var offense = nflFormEntry(game, offSide, spec[0]);
      var defense = nflFormEntry(game, defSide, spec[1]);
      if (!offense && !defense) return '';
      var offPct = percentOf(offense);
      var defPct = percentOf(defense);
      var lead = offPct == null || defPct == null || offPct === defPct ? '' :
        (offPct > defPct ? ' is-off' : ' is-def');
      var leadLabel = lead === ' is-off' ? String(game[offSide] || 'OFF') + ' offense' :
        (lead === ' is-def' ? String(game[defSide] || 'DEF') + ' defense' : 'Even');
      return '<div class="ca-nfl-matchup-row' + lead + '" title="' + esc(spec[3]) + '">' +
        nflFormCell(offense, 'Offense') +
        '<div class="ca-nfl-matchup-axis"><strong>' + esc(spec[2]) + '</strong>' +
        '<small>' + esc(spec[4]) + '</small>' +
        '<em>' + esc(leadLabel) + '</em></div>' +
        nflFormCell(defense, 'Defense') + '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<article class="ca-nfl-matchup-board">' +
      nflPairHead(sport, game, offSide, defSide, 'Unit Matchup',
        'Offensive performance', 'Defensive resistance') + rows + '</article>';
  }

  function nflReadingKey() {
    return '<aside class="ca-nfl-reading-key" aria-label="How to read the matchup board">' +
      '<div><span>Board Key</span><strong>Offense → Defense</strong><i aria-hidden="true">·</i>' +
      '<strong>1st = league best</strong><i aria-hidden="true">·</i>' +
      '<strong class="ca-nfl-key-edge">Green = stronger indicator</strong></div></aside>';
  }

  function nflScriptSnapshot(sport, game) {
    var signals = [];
    [['away', 'home'], ['home', 'away']].forEach(function (pair) {
      NFL_MATCHUP_ROWS.forEach(function (spec) {
        var offense = nflFormEntry(game, pair[0], spec[0]);
        var defense = nflFormEntry(game, pair[1], spec[1]);
        var offPct = percentOf(offense), defPct = percentOf(defense);
        if (offPct == null || defPct == null) return;
        var gap = offPct - defPct;
        signals.push({
          gap: Math.abs(gap),
          winner: gap >= 0
            ? String(game[pair[0]] || fullName(sport, game, pair[0])) + ' offense'
            : String(game[pair[1]] || fullName(sport, game, pair[1])) + ' defense',
          metric: spec[2],
          impact: spec[4],
          ranks: offense.rank + ordinal(offense.rank) + ' OFF vs ' +
            defense.rank + ordinal(defense.rank) + ' DEF'
        });
      });
    });
    var cards = signals.sort(function (a, b) { return b.gap - a.gap; }).slice(0, 4)
      .map(function (signal) {
        return '<article class="ca-nfl-signal"><span>' + esc(signal.impact) + '</span>' +
          '<strong>' + esc(signal.winner) + '</strong><small>' + esc(signal.metric) +
          ' · ' + esc(signal.ranks) + '</small></article>';
      }).join('');
    if (!cards) return '';
    return '<section class="ca-nfl-snapshot" aria-labelledby="caNflSnapshotTitle">' +
      '<header><div><span>Quick Read</span><h3 id="caNflSnapshotTitle">Largest Matchup Gaps</h3></div>' +
      '<p>League-relative edges, not projections</p></header>' +
      '<div class="ca-nfl-signal-grid">' + cards + '</div></section>';
  }

  function ratePerGame(value, games, digits) {
    var n = Number(value), gp = Number(games);
    if (!isFinite(n) || !isFinite(gp) || gp <= 0) return '—';
    return (n / gp).toFixed(digits == null ? 1 : digits);
  }

  function safeTotal() {
    var total = 0, seen = false;
    for (var i = 0; i < arguments.length; i++) {
      var n = Number(arguments[i]);
      if (isFinite(n)) { total += n; seen = true; }
    }
    return seen ? total : null;
  }

  function teamProductionValues(stats) {
    if (!stats) return [];
    var games = Number(stats.games);
    var yards = safeTotal(stats.passing_yards, stats.rushing_yards);
    var tds = safeTotal(stats.passing_tds, stats.rushing_tds);
    var firsts = safeTotal(stats.passing_first_downs, stats.rushing_first_downs);
    return [
      { label: 'Total Yards', unit: 'per game', value: Number(ratePerGame(yards, games, 1)), total: yards },
      { label: 'Pass Yards', unit: 'per game', value: Number(ratePerGame(stats.passing_yards, games, 1)), total: stats.passing_yards },
      { label: 'Rush Yards', unit: 'per game', value: Number(ratePerGame(stats.rushing_yards, games, 1)), total: stats.rushing_yards },
      { label: 'Offensive TD', unit: 'per game', value: Number(ratePerGame(tds, games, 2)), total: tds },
      { label: 'First Downs', unit: 'per game', value: Number(ratePerGame(firsts, games, 1)), total: firsts },
      { label: 'Sacks Allowed', unit: 'per game', value: Number(ratePerGame(stats.sacks_suffered, games, 1)), total: stats.sacks_suffered, low: true }
    ];
  }

  function productionCompareCell(entry, leading) {
    var valid = entry && isFinite(entry.value);
    return '<div class="ca-production-compare__value' + (leading ? ' is-leading' : '') + '">' +
      '<strong>' + esc(valid ? entry.value.toFixed(entry.label === 'Offensive TD' ? 2 : 1) : '—') + '</strong>' +
      '<span>' + esc(valid && entry.total != null ? Math.round(Number(entry.total)) + ' total' : 'Not published') + '</span></div>';
  }

  function teamProductionComparison(sport, game) {
    var away = teamProductionValues(game.away_team_stats);
    var home = teamProductionValues(game.home_team_stats);
    var rows = [0, 1, 2, 3, 4, 5].map(function (index) {
      var left = away[index];
      var right = home[index];
      var low = (left || right || {}).low;
      var leftLeads = left && right && isFinite(left.value) && isFinite(right.value)
        ? (low ? left.value < right.value : left.value > right.value) : !!left;
      var rightLeads = left && right && isFinite(left.value) && isFinite(right.value)
        ? (low ? right.value < left.value : right.value > left.value) : !!right;
      var axis = left || right || { label: 'Not Published', unit: '' };
      return '<div class="ca-production-compare__row">' + productionCompareCell(left, leftLeads) +
        '<div class="ca-production-compare__axis"><strong>' + esc(axis.label) + '</strong><span>' +
        esc(axis.unit) + '</span></div>' + productionCompareCell(right, rightLeads) + '</div>';
    }).join('');
    return '<div class="ca-production-compare"><div class="ca-production-compare__teams"><span>' +
      logo(sport, game, 'away', 22, 'ca-scheme-tab-crest') + esc(fullName(sport, game, 'away')) +
      '</span><span>' + logo(sport, game, 'home', 22, 'ca-scheme-tab-crest') +
      esc(fullName(sport, game, 'home')) + '</span></div>' + rows + '</div>';
  }

  function nflSplitValue(raw, kind) {
    var n = Number(raw);
    if (!isFinite(n)) return '—';
    if (kind === 'pct') return (n * 100).toFixed(1) + '%';
    if (kind === 'epa') return epaText(n);
    return n.toFixed(kind === 'two' ? 2 : 1);
  }

  function nflSplitStat(label, raw, kind, detail) {
    return '<div class="ca-nfl-split-stat"><span>' + esc(label) + '</span><strong>' +
      esc(nflSplitValue(raw, kind)) + '</strong><small>' + esc(detail || '') + '</small></div>';
  }

  function nflSplitDuelCell(scheme, phase, key, raw, caption, kind) {
    var entry = responseEntry(scheme, phase, key, raw);
    return '<div class="ca-nfl-split-duel__value ' +
      (entry ? rankTone(entry.rank, entry.of) : '') + '"><strong>' +
      esc(nflSplitValue(raw, kind)) + '</strong><span>' + esc(caption) + '</span>' +
      (entry && entry.rank ? '<small>' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</small>' : '') +
      '</div>';
  }

  function nflSplitDuelRow(offScheme, defScheme, spec) {
    var off = (((offScheme.offense || {}).response) || {})[spec[0]];
    var def = (((defScheme.defense || {}).response) || {})[spec[0]];
    if (off == null && def == null) return '';
    return '<div class="ca-nfl-split-duel__row">' +
      nflSplitDuelCell(offScheme, 'offense', spec[0], off, 'Offense', spec[2]) +
      '<div class="ca-nfl-split-duel__axis"><strong>' + esc(spec[1]) + '</strong><span>' +
      esc(spec[3]) + '</span></div>' +
      nflSplitDuelCell(defScheme, 'defense', spec[0], def, 'Defense allowed', spec[2]) + '</div>';
  }

  function nflTeamSplitCard(sport, game, offSide, defSide, family) {
    var stats = game[offSide + '_team_stats'] || {};
    var games = Number(stats.games);
    var offScheme = game[offSide + '_scheme'] || {};
    var defScheme = game[defSide + '_scheme'] || {};
    var offPressure = ((offScheme.offense || {}).pressure) || {};
    var defPressure = ((defScheme.defense || {}).pressure) || {};
    var volume;
    var duels;
    if (family === 'rushing') {
      var ypc = Number(stats.carries) > 0 ? Number(stats.rushing_yards) / Number(stats.carries) : null;
      volume = nflSplitStat('Rush Yds / G', ratePerGame(stats.rushing_yards, games, 1), 'num', 'ground volume') +
        nflSplitStat('Carries / G', ratePerGame(stats.carries, games, 1), 'num', 'team attempts') +
        nflSplitStat('Yards / Carry', ypc, 'num', 'efficiency') +
        nflSplitStat('Rush TD / G', ratePerGame(stats.rushing_tds, games, 2), 'two', 'scoring') +
        nflSplitStat('Rush 1D / G', ratePerGame(stats.rushing_first_downs, games, 1), 'num', 'drive extension') +
        nflSplitStat('Stacked Box', offPressure.stacked_box_rate, 'pct', 'offense faced');
      duels = [
        ['rush_epa', 'Rush EPA / Play', 'epa', 'down-and-distance value'],
        ['rush_success_rate', 'Rush Success', 'pct', 'staying on schedule'],
        ['rush_epa_stacked_box', 'EPA Vs Stacked Box', 'epa', 'heavy-box response']
      ];
    } else {
      var comp = Number(stats.attempts) > 0 ? Number(stats.completions) / Number(stats.attempts) : null;
      var ypa = Number(stats.attempts) > 0 ? Number(stats.passing_yards) / Number(stats.attempts) : null;
      volume = nflSplitStat('Pass Yds / G', ratePerGame(stats.passing_yards, games, 1), 'num', 'air volume') +
        nflSplitStat('Attempts / G', ratePerGame(stats.attempts, games, 1), 'num', 'dropback volume') +
        nflSplitStat('Completion', comp, 'pct', 'accuracy') +
        nflSplitStat('Yards / Att', ypa, 'num', 'efficiency') +
        nflSplitStat('Pass TD / G', ratePerGame(stats.passing_tds, games, 2), 'two', 'scoring') +
        nflSplitStat('Sacks / G', ratePerGame(stats.sacks_suffered, games, 1), 'num', 'allowed');
      duels = [
        ['pass_epa', 'Pass EPA / Play', 'epa', 'dropback value'],
        ['pass_success_rate', 'Pass Success', 'pct', 'staying on schedule'],
        ['pass_epa_pressure', 'EPA Under Pressure', 'epa', pctText(defPressure.pressure_rate) + ' defensive pressure'],
        ['pass_epa_blitz', 'EPA Vs Blitz', 'epa', pctText(defPressure.blitz_rate) + ' defensive blitz']
      ];
    }
    var rows = duels.map(function (spec) { return nflSplitDuelRow(offScheme, defScheme, spec); })
      .filter(Boolean).join('');
    return '<article class="ca-nfl-split-card"><header>' +
      '<div>' + logo(sport, game, offSide, 34, 'ca-production-team__logo') + '<span><strong>' +
      esc(fullName(sport, game, offSide)) + ' offense</strong><small>' + esc(family) + ' profile</small></span></div>' +
      '<b aria-hidden="true">vs</b><div>' + logo(sport, game, defSide, 34, 'ca-production-team__logo') +
      '<span><strong>' + esc(fullName(sport, game, defSide)) + ' defense</strong><small>opponent response</small></span></div>' +
      '</header><div class="ca-nfl-split-stat-grid">' + volume + '</div>' +
      '<div class="ca-nfl-split-duel">' + rows + '</div></article>';
  }

  function nflTeamFamilyPanel(sport, game, family) {
    return '<div class="ca-nfl-family-grid">' +
      nflTeamSplitCard(sport, game, 'away', 'home', family) +
      nflTeamSplitCard(sport, game, 'home', 'away', family) + '</div>' +
      '<p class="ca-detail-source-note">Standard rates use completed 2026 games. EPA and success-rate splits use the evidence window selected above and are ranked against the 32-team pool.</p>';
  }

  function dvoaField(record, key) {
    if (!record) return null;
    if (record[key] != null) return record[key];
    var parts = key.split('_');
    var node = record;
    for (var i = 0; i < parts.length; i++) node = node && node[parts[i]];
    return node == null ? null : node;
  }

  function nflDvoaPanel(sport, game) {
    var away = game.away_dvoa || null;
    var home = game.home_dvoa || null;
    if (!away && !home) {
      return '<div class="ca-dvoa-status"><span>DVOA Feed Status</span><strong>Licensed values are not connected</strong>' +
        '<p>DVOA is FTN’s opponent-adjusted efficiency. This view will show total, pass and rush DVOA as soon as a licensed field is published; EPA is kept separate and is never relabeled.</p>' +
        '<a href="https://ftnfantasy.com/stats/nfl/team-total-dvoa" target="_blank" rel="noopener">Open official FTN DVOA ↗</a></div>';
    }
    var specs = [
      ['total', 'Total DVOA'], ['offense_total', 'Offense DVOA'],
      ['offense_pass', 'Pass Offense'], ['offense_rush', 'Rush Offense'],
      ['defense_total', 'Defense DVOA'], ['defense_pass', 'Pass Defense'],
      ['defense_rush', 'Rush Defense']
    ];
    var rows = specs.map(function (spec) {
      var left = dvoaField(away, spec[0]);
      var right = dvoaField(home, spec[0]);
      if (left == null && right == null) return '';
      return '<div class="ca-production-compare__row"><div class="ca-production-compare__value"><strong>' +
        esc(left == null ? '—' : nflSplitValue(left, 'pct')) + '</strong><span>FTN DVOA</span></div>' +
        '<div class="ca-production-compare__axis"><strong>' + esc(spec[1]) + '</strong><span>opponent adjusted</span></div>' +
        '<div class="ca-production-compare__value"><strong>' + esc(right == null ? '—' : nflSplitValue(right, 'pct')) +
        '</strong><span>FTN DVOA</span></div></div>';
    }).filter(Boolean).join('');
    return '<div class="ca-production-compare"><div class="ca-production-compare__teams"><span>' +
      logo(sport, game, 'away', 22, 'ca-scheme-tab-crest') + esc(fullName(sport, game, 'away')) + '</span><span>' +
      logo(sport, game, 'home', 22, 'ca-scheme-tab-crest') + esc(fullName(sport, game, 'home')) +
      '</span></div>' + rows + '</div><p class="ca-detail-source-note">DVOA © FTN. Positive is better on offense; negative is better on defense.</p>';
  }

  function nflTeamLab(sport, game, leagueView) {
    var views = [
      ['overview', 'Overview'], ['passing', 'Passing'], ['rushing', 'Rushing'], ['dvoa', 'DVOA']
    ];
    var tabs = views.map(function (view, index) {
      return '<button type="button" role="tab" class="ca-filter-pill' + (index ? '' : ' is-on') +
        '" data-team-stat-view="' + view[0] + '" aria-selected="' + (index ? 'false' : 'true') +
        '" tabindex="' + (index ? '-1' : '0') + '">' + esc(view[1]) + '</button>';
    }).join('');
    var overview = nflScriptSnapshot(sport, game) + nflMatchupSwitcher(sport, game) +
      teamProductionComparison(sport, game) +
      (leagueView ? '<details class="ca-ranking-detail"><summary>Full 32-Team Ranking View</summary>' +
        '<div class="ca-ranking-detail__body">' + leagueView + '</div></details>' : '');
    return '<div class="ca-nfl-lab"><div class="ca-filter-dock"><div><span>Team Stat Splits</span>' +
      '<strong>Choose one view</strong></div><div class="ca-filter-pills" role="tablist" aria-label="Team stat splits">' +
      tabs + '</div></div>' +
      '<div data-team-stat-panel="overview">' + overview + '</div>' +
      '<div data-team-stat-panel="passing" hidden>' + nflTeamFamilyPanel(sport, game, 'passing') + '</div>' +
      '<div data-team-stat-panel="rushing" hidden>' + nflTeamFamilyPanel(sport, game, 'rushing') + '</div>' +
      '<div data-team-stat-panel="dvoa" hidden>' + nflDvoaPanel(sport, game) + '</div>' +
      nflMetricGuide() + '</div>';
  }

  function nflMatchupSwitcher(sport, game) {
    function tab(side, defSide, selected) {
      var cap = side === 'away' ? 'Away' : 'Home';
      return '<button type="button" id="caMatchup' + cap + 'Tab" class="ca-scheme-switch__tab' +
        (selected ? ' is-on' : '') + '" role="tab" aria-selected="' + (selected ? 'true' : 'false') +
        '" aria-controls="caMatchup' + cap + 'Panel"' + (selected ? '' : ' tabindex="-1"') +
        ' data-matchup-side="' + side + '"><strong>' + logo(sport, game, side, 22, 'ca-scheme-tab-crest') +
        esc(fullName(sport, game, side)) + ' offense</strong><span>' + logo(sport, game, defSide, 18, 'ca-scheme-tab-crest') +
        'vs ' + esc(fullName(sport, game, defSide)) + ' defense</span></button>';
    }
    return '<div class="ca-nfl-matchup-switch"><div class="ca-scheme-switch__tabs" role="tablist" ' +
      'aria-label="Choose unit matchup">' + tab('away', 'home', true) + tab('home', 'away', false) +
      '</div><div id="caMatchupAwayPanel" role="tabpanel" aria-labelledby="caMatchupAwayTab" ' +
      'data-matchup-panel="away">' + nflMatchupDirection(sport, game, 'away', 'home') + '</div>' +
      '<div id="caMatchupHomePanel" role="tabpanel" aria-labelledby="caMatchupHomeTab" ' +
      'data-matchup-panel="home" hidden>' + nflMatchupDirection(sport, game, 'home', 'away') + '</div></div>';
  }

  function nflMetricGuide() {
    return '<details class="ca-metric-guide"><summary>How To Read The Advanced Metrics</summary>' +
      '<dl><div><dt>EPA / Play</dt><dd>Expected points gained or lost per snap. ' +
      'It captures down, distance and field position; it is not raw yardage.</dd></div>' +
      '<div><dt>Success Rate</dt><dd>The share of plays that gained enough to keep the drive on schedule.</dd></div>' +
      '<div><dt>DVOA</dt><dd>Opponent-adjusted efficiency owned and published by FTN. ' +
      'It is not in the current licensed feed, so this page does not imitate it with a private power rating.</dd></div>' +
      '<div><dt>League Rank</dt><dd>Recomputed from the displayed observed rate against the 32-team pool; ' +
      '1st is always best after metric direction is applied.</dd></div></dl></details>';
  }

  function playerStat(label, primary, secondary, family) {
    return '<div class="ca-player-stat" data-player-stat-family="' + esc(family || 'overview') + '"><span>' + esc(label) + '</span><strong>' +
      esc(primary == null ? '—' : primary) + '</strong>' +
      (secondary ? '<small>' + esc(secondary) + '</small>' : '') + '</div>';
  }

  function playerStatsCard(game, side, player) {
    var games = Number(player.games);
    var position = String(player.position || '').toUpperCase();
    var starter = (((unitData(game, side, 'offense') || {}).players) || []).find(function (candidate) {
      return playerNameKey(candidate.name) === playerNameKey(player.player_name);
    }) || {};
    var portrait = starter.headshot_url
      ? '<img class="ca-player-volume-card__shot" src="' + esc(starter.headshot_url) +
        '" alt="" width="64" height="64" loading="lazy" decoding="async">'
      : '<span class="ca-player-volume-card__initials" aria-hidden="true">' +
        esc(initials(player.player_name)) + '</span>';
    var stats;
    if (position === 'QB') {
      var completion = Number(player.attempts) > 0
        ? (Number(player.completions) / Number(player.attempts) * 100).toFixed(1) + '%' : '—';
      var ypa = Number(player.attempts) > 0
        ? (Number(player.passing_yards) / Number(player.attempts)).toFixed(1) : '—';
      stats = playerStat('Pass Yds / G', ratePerGame(player.passing_yards, games, 1),
        value(player.passing_yards, '—') + ' total', 'passing') +
        playerStat('Comp / Att', value(player.completions, '—') + ' / ' + value(player.attempts, '—'), completion, 'passing') +
        playerStat('Yards / Att', ypa, 'Passing efficiency', 'passing') +
        playerStat('Pass TD–INT', value(player.passing_tds, '—') + '–' +
          value(player.passing_interceptions, '—'), 'Season totals', 'passing') +
        playerStat('Rush Yds / G', ratePerGame(player.rushing_yards, games, 1),
          value(player.rushing_tds, '—') + ' rush TD', 'rushing') +
        playerStat('PPR / G', ratePerGame(player.fantasy_points_ppr, games, 1), 'Observed fantasy points', 'fantasy');
    } else if (position === 'RB') {
      var ypc = Number(player.carries) > 0
        ? (Number(player.rushing_yards) / Number(player.carries)).toFixed(1) : '—';
      stats = playerStat('Carries / G', ratePerGame(player.carries, games, 1), value(player.carries, '—') + ' total', 'rushing') +
        playerStat('Rush Yds / G', ratePerGame(player.rushing_yards, games, 1), value(player.rushing_yards, '—') + ' total', 'rushing') +
        playerStat('Yards / Carry', ypc, value(player.rushing_tds, '—') + ' rush TD', 'rushing') +
        playerStat('Targets / G', ratePerGame(player.targets, games, 1), value(player.receptions, '—') + ' receptions', 'receiving') +
        playerStat('Rec Yds / G', ratePerGame(player.receiving_yards, games, 1), value(player.receiving_tds, '—') + ' rec TD', 'receiving') +
        playerStat('PPR / G', ratePerGame(player.fantasy_points_ppr, games, 1), 'Observed fantasy points', 'fantasy');
    } else {
      var ypt = Number(player.targets) > 0
        ? (Number(player.receiving_yards) / Number(player.targets)).toFixed(1) : '—';
      stats = playerStat('Targets / G', ratePerGame(player.targets, games, 1), value(player.targets, '—') + ' total', 'receiving') +
        playerStat('Receptions / G', ratePerGame(player.receptions, games, 1), value(player.receptions, '—') + ' total', 'receiving') +
        playerStat('Rec Yds / G', ratePerGame(player.receiving_yards, games, 1), value(player.receiving_yards, '—') + ' total', 'receiving') +
        playerStat('Yards / Target', ypt, value(player.receiving_tds, '—') + ' rec TD', 'receiving') +
        playerStat('Target Share', pctText(player.target_share), 'Share of team targets', 'receiving') +
        playerStat('PPR / G', ratePerGame(player.fantasy_points_ppr, games, 1), 'Observed fantasy points', 'fantasy');
    }
    var positionFilter = position === 'TE' ? 'te' : position.toLowerCase();
    var families = position === 'QB' ? 'passing,rushing,fantasy' :
      (position === 'RB' ? 'rushing,receiving,fantasy' : 'receiving,fantasy');
    return '<article class="ca-player-volume-card" data-player-position-value="' + esc(positionFilter) +
      '" data-player-families="' + families + '"><header>' + portrait + '<div><span>' +
      esc(position) + '</span><h5>' + esc(player.player_name) + '</h5><p>' +
      esc(player.season + ' · ' + games + ' game' + (games === 1 ? '' : 's')) +
      '</p></div></header><div class="ca-player-stat-grid">' + stats + '</div></article>';
  }

  function playerStatsTeam(sport, game, side) {
    var stats = game[side + '_player_stats'] || [];
    var label = fullName(sport, game, side);
    return '<section class="ca-player-volume-team"><header>' +
      logo(sport, game, side, 36, 'ca-production-team__logo') + '<div><h4>' + esc(label) +
      '</h4><p>Observed season volume · no projection</p></div></header>' +
      (stats.length ? '<div class="ca-player-volume-grid">' + stats.map(function (player) {
        return playerStatsCard(game, side, player);
      }).join('') + '</div>' : pending('Season volume is not published for the listed starters.')) +
      '</section>';
  }

  function playerRate(player, keys) {
    var games = Number(player && player.games);
    if (!(games > 0)) return null;
    var seen = false;
    var total = (keys || []).reduce(function (sum, key) {
      var n = Number(player[key]);
      if (player[key] != null && player[key] !== '' && isFinite(n)) {
        seen = true;
        return sum + n;
      }
      return sum;
    }, 0);
    return seen ? total / games : null;
  }

  function playerLeader(stats, positions, keys) {
    var allowed = positions.split(',');
    return (stats || []).reduce(function (best, player) {
      if (allowed.indexOf(String(player.position || '').toUpperCase()) < 0) return best;
      var rate = playerRate(player, keys);
      if (rate == null || (best && rate <= best.rate)) return best;
      return { name: player.player_name, rate: rate };
    }, null);
  }

  function playerComparisonCell(entry, better) {
    return '<div class="ca-player-compare__value' + (better ? ' is-leading' : '') + '">' +
      '<strong>' + esc(entry ? entry.name : 'Not published') + '</strong>' +
      '<span>' + esc(entry ? entry.rate.toFixed(1) : '—') + '</span></div>';
  }

  function playerComparison(sport, game) {
    var away = game.away_player_stats || [];
    var home = game.home_player_stats || [];
    var rows = [
      ['Passing', 'yards / game', 'QB', ['passing_yards']],
      ['Backfield', 'touches / game', 'RB', ['carries', 'targets']],
      ['Receiving', 'targets / game', 'WR,TE', ['targets']],
      ['Fantasy', 'PPR points / game', 'QB,RB,WR,TE', ['fantasy_points_ppr']]
    ].map(function (spec) {
      var left = playerLeader(away, spec[2], spec[3]);
      var right = playerLeader(home, spec[2], spec[3]);
      var leftLeads = left && right ? left.rate > right.rate : !!left;
      var rightLeads = left && right ? right.rate > left.rate : !!right;
      return '<div class="ca-player-compare__row">' + playerComparisonCell(left, leftLeads) +
        '<div class="ca-player-compare__axis"><strong>' + esc(spec[0]) + '</strong><span>' +
        esc(spec[1]) + '</span></div>' + playerComparisonCell(right, rightLeads) + '</div>';
    }).join('');
    return '<section class="ca-player-compare" aria-labelledby="caPlayerCompareTitle"><header>' +
      '<div><span>Volume Leaders</span><h3 id="caPlayerCompareTitle">Team-To-Team Prop Baselines</h3></div>' +
      '<p>Completed games · rate per game</p></header>' +
      '<div class="ca-player-compare__teams"><span>' + logo(sport, game, 'away', 22, 'ca-scheme-tab-crest') +
      esc(fullName(sport, game, 'away')) + '</span><span>' + logo(sport, game, 'home', 22, 'ca-scheme-tab-crest') +
      esc(fullName(sport, game, 'home')) + '</span></div><div class="ca-player-compare__rows">' + rows +
      '</div></section>';
  }

  function playerDeepDive(sport, game, side) {
    var hasScheme = (game[side + '_player_scheme'] || []).length;
    var hasCoverage = (game[side + '_player_coverage'] || []).length;
    if (!hasScheme && !hasCoverage) return '';
    return '<details class="ca-player-deep-dive"><summary>' +
      esc(fullName(sport, game, side)) + ' Advanced Player Splits</summary>' +
      (hasScheme ? playerSchemePanels(sport, game, side) : '') +
      (hasCoverage ? playerCoveragePanels(sport, game, side) : '') + '</details>';
  }

  function nflPlayerHub(sport, game) {
    function tab(side, selected) {
      var cap = side === 'away' ? 'Away' : 'Home';
      return '<button type="button" id="caPlayer' + cap + 'Tab" class="ca-player-switch__tab' +
        (selected ? ' is-on' : '') + '" role="tab" aria-selected="' + (selected ? 'true' : 'false') +
        '" aria-controls="caPlayer' + cap + 'Panel"' + (selected ? '' : ' tabindex="-1"') +
        ' data-player-side="' + side + '">' + logo(sport, game, side, 24, 'ca-scheme-tab-crest') +
        '<span><strong>' + esc(fullName(sport, game, side)) + '</strong><small>Full player board</small></span></button>';
    }
    var positions = [['all', 'All'], ['qb', 'QB'], ['rb', 'RB'], ['wr', 'WR'], ['te', 'TE']];
    var families = [['overview', 'Overview'], ['passing', 'Passing'], ['rushing', 'Rushing'],
      ['receiving', 'Receiving'], ['fantasy', 'Fantasy'], ['splits', 'Advanced Splits']];
    function filterButtons(items, attr) {
      return items.map(function (item, index) {
        return '<button type="button" class="ca-filter-pill' + (index ? '' : ' is-on') + '" ' + attr +
          '="' + item[0] + '" aria-pressed="' + (index ? 'false' : 'true') + '">' + esc(item[1]) + '</button>';
      }).join('');
    }
    var hasDeep = (game.away_player_scheme || []).length || (game.away_player_coverage || []).length ||
      (game.home_player_scheme || []).length || (game.home_player_coverage || []).length;
    var deep = hasDeep ? playerDeepDive(sport, game, 'away') + playerDeepDive(sport, game, 'home') :
      pending('No qualifying advanced player split sample is published for this matchup.');
    return '<div class="ca-player-research">' + playerComparison(sport, game) +
      '<div class="ca-player-filter-dock"><div data-player-filter-group><span>Position</span><div class="ca-filter-pills">' +
      filterButtons(positions, 'data-player-position') + '</div></div>' +
      '<div data-player-filter-group><span>Stat View</span><div class="ca-filter-pills">' +
      filterButtons(families, 'data-player-family') + '</div></div></div>' +
      '<div class="ca-player-switch"><div class="ca-player-switch__tabs" role="tablist" ' +
      'aria-label="Choose team player board">' + tab('away', true) + tab('home', false) + '</div>' +
      '<div id="caPlayerAwayPanel" role="tabpanel" aria-labelledby="caPlayerAwayTab" ' +
      'data-player-panel="away">' + playerStatsTeam(sport, game, 'away') + '</div>' +
      '<div id="caPlayerHomePanel" role="tabpanel" aria-labelledby="caPlayerHomeTab" ' +
      'data-player-panel="home" hidden>' + playerStatsTeam(sport, game, 'home') + '</div></div>' +
      '<p class="ca-detail-source-note" data-player-filter-empty hidden>No players match both selected filters.</p>' +
      '<div class="ca-player-deep-stack" data-player-split-panels hidden>' + deep + '</div>' +
      '<p class="ca-detail-source-note">Volume, yards, touchdowns, receptions and fantasy points are completed-game ' +
      'regular-season totals from nflverse/nflfastR. Per-game figures divide those totals by games played; ' +
      'they are not prop projections. Advanced player splits appear only when a qualifying observed sample is published.</p></div>';
  }

  var NFL_FORM_OFF = ['off_epa', 'off_first_down', 'off_explosive', 'off_sack', 'off_turnover'];
  var NFL_FORM_DEF = ['def_epa', 'def_first_down', 'def_explosive', 'def_sack', 'def_turnover'];
  var NFL_FORM_ORDER = NFL_FORM_OFF.concat(NFL_FORM_DEF);
  var CFB_FORM_ORDER = [
    'off_ppa', 'def_ppa', 'off_ypg', 'def_ypg',
    'off_successRate', 'def_successRate', 'off_fourth', 'def_fourth',
    'off_first_downs', 'def_first_downs',
    'off_explosiveness', 'def_explosiveness', 'off_pass_ypg', 'def_pass_ypg',
    'off_comp', 'def_comp', 'off_qbr', 'def_qbr', 'off_pass_td', 'def_pass_td',
    'off_int', 'def_int', 'off_sacks', 'def_sacks',
    'off_stuffRate', 'def_stuffRate', 'off_rush_ypg', 'def_rush_ypg',
    'off_rush_td', 'def_rush_td',
    'off_fg', 'off_punt', 'off_kr', 'off_pr', 'off_pen'
  ];

  function nflFormFamily(sport, game, keys, title, role) {
    var away = ((game.away_form || {}).rates) || {};
    var home = ((game.home_form || {}).rates) || {};
    var rows = keys.map(function (key) {
      var entry = away[key] || home[key];
      if (!entry) return '';
      return mirrorRow(titleCase(entry.label), away[key], home[key], function (v) {
        return formText({ value: v, format: entry.format, label: entry.label });
      }, clubPair(sport, game));
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-form-family"><h4>' + esc(title) + '</h4>' +
      '<div class="ca-mirror">' +
      cfbMirrorHead(sport, game, 'away', 'home', 'Percentile Of The 32-Team Pool', role, role) +
      rows + '</div></div>';
  }

  function nflMirror(sport, game) {
    var off = nflFormFamily(sport, game, NFL_FORM_OFF, 'Offensive form', 'Offense');
    var def = nflFormFamily(sport, game, NFL_FORM_DEF, 'Defensive form', 'Defense');
    if (!off && !def) return '';
    return off + def;
  }

  function nflSections(sport, game) {
    var source = game.scheme_source || {};
    var leagueView = nflMirror(sport, game);
    return [
      section('form', 'Matchup Analysis',
        'Team Splits, Advanced Efficiency And Production In One Workspace',
        nflTeamLab(sport, game, leagueView) +
        '<p class="ca-detail-source-note">Observed results only · 1st is strongest after metric direction is normalized. ' +
        (source.season ? 'Team form: ' + esc(source.season) +
          (source.week ? ', through week ' + esc(source.week) : '') + '. ' : '') +
        'Production: nflverse/nflfastR.</p>'),

      section('scheme', 'Scheme Splits',
        'Coverage, Pressure And Personnel By Matchup Direction',
        schemeSwitcher(sport, game) +
        '<p class="ca-detail-source-note" data-season-prior-only>Observed charting only · season shown in the evidence control ' +
        '· frequency ranks use the 32-team pool.</p>'),

      section('players', 'Player Stat Lab',
        'Filter By Team, Position Or Stat Family',
        nflPlayerHub(sport, game)),

      section('availability', 'Starting Lineups And Availability',
        'Offense, Defense And Official Designations',
        '<div class="ca-detail-duo ca-lineup-duo">' +
        lineupBoard(sport, game, 'away') +
        lineupBoard(sport, game, 'home') + '</div>' +
        '<p class="ca-detail-source-note">Designations come from the official injury report. ' +
        'A published starter absent from the injury report is marked Active; a missing report ' +
        'is marked Report Pending. Starting units follow the published depth chart and carry ' +
        'identity and position only—never a snap projection.</p>'),

      section('radar', 'Team Profile Radar', 'Both Clubs On One Shape, By Percentile',
        radarBody(sport, game)),

      section('team-context', 'Rest, Travel And Venue', 'Factual Scheduling Context',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', [
          ['Record', value(game.away_record)],
          ['Rest', game.away_rest_days ? game.away_rest_days + ' days' : 'Not Published'],
          ['Travel', value(game.away_travel)]
        ]) + teamPanel(sport, game, 'home', [
          ['Record', value(game.home_record)],
          ['Rest', game.home_rest_days ? game.home_rest_days + ' days' : 'Not Published'],
          ['Travel', value(game.home_travel)]
        ]) +         '</div>')
    ].join('');
  }

  var CFB_CLASH_GROUPS = [
    { title: 'Scoring', rows: [
      { off: 'off_ppa', def: 'def_ppa' },
      { off: 'off_pass_td', def: 'def_pass_td' },
      { off: 'off_rush_td', def: 'def_rush_td' }
    ]},
    { title: 'Yardage', rows: [
      { off: 'off_ypg', def: 'def_ypg' },
      { off: 'off_pass_ypg', def: 'def_pass_ypg' },
      { off: 'off_rush_ypg', def: 'def_rush_ypg' }
    ]},
    { title: 'Passing', rows: [
      { off: 'off_explosiveness', def: 'def_explosiveness' },
      { off: 'off_comp', def: 'def_comp' },
      { off: 'off_qbr', def: 'def_qbr' }
    ]},
    { title: 'Rushing', rows: [
      { off: 'off_stuffRate', def: 'def_stuffRate' }
    ]},
    { title: 'Downs', rows: [
      { off: 'off_successRate', def: 'def_successRate' },
      { off: 'off_first_downs', def: 'def_first_downs' },
      { off: 'off_fourth', def: 'def_fourth' }
    ]},
    { title: 'Pressure And Ball Security', rows: [
      { off: 'off_sacks', def: 'def_sacks' },
      { off: 'off_int', def: 'def_int' }
    ]}
  ];

  var CFB_COMPARE_TABS = [
    { id: 'all', label: 'All' },
    { id: 'scoring', label: 'Scoring', keys: ['off_ppa', 'def_ppa', 'off_pass_td', 'def_pass_td', 'off_rush_td', 'def_rush_td'] },
    { id: 'passing', label: 'Passing', keys: ['off_explosiveness', 'def_explosiveness', 'off_pass_ypg', 'def_pass_ypg', 'off_comp', 'def_comp', 'off_qbr', 'def_qbr', 'off_int', 'def_int', 'off_sacks', 'def_sacks'] },
    { id: 'rushing', label: 'Rushing', keys: ['off_stuffRate', 'def_stuffRate', 'off_rush_ypg', 'def_rush_ypg', 'off_rush_td', 'def_rush_td'] },
    { id: 'downs', label: 'Downs', keys: ['off_successRate', 'def_successRate', 'off_fourth', 'def_fourth', 'off_first_downs', 'def_first_downs'] },
    { id: 'special', label: 'Special Teams', keys: ['off_fg', 'off_punt', 'off_kr', 'off_pr', 'off_pen'] }
  ];

  var CFB_SCRIPT_LENSES = [
    {
      title: 'Scoring Pressure', metric: 'Points Per Game', off: 'off_ppa', def: 'def_ppa',
      impact: 'Scoring and points allowed summarize how often each unit has finished drives. A sustained scoring gap can force the opponent away from its preferred pace and play mix.'
    },
    {
      title: 'Drive Sustainability', metric: 'Third-Down Rate', off: 'off_successRate', def: 'def_successRate',
      impact: 'Third-down conversion extends possessions and adds snaps. Stops reduce play volume; conversions create more carries, routes and red-zone chances.'
    },
    {
      title: 'Explosive Passing', metric: 'Yards Per Pass Attempt', off: 'off_explosiveness', def: 'def_explosiveness',
      impact: 'Yards per attempt shows how much passing production has come with each throw. Higher output can flip field position quickly, but it is not a count of explosive plays.'
    },
    {
      title: 'Run-Game Control', metric: 'Yards Per Rush Attempt', off: 'off_stuffRate', def: 'def_stuffRate',
      impact: 'Efficient rushing keeps the full playbook available and shortens later downs. Strong resistance can create obvious passing situations and change possession length.'
    },
    {
      title: 'Passing Friction', metric: 'Sacks Per Game', off: 'off_sacks', def: 'def_sacks',
      impact: 'Sacks create lost-yardage downs and can end drives. Protection preserves route depth and dropback volume; pressure can compress both.'
    },
    {
      title: 'Possession Volatility', metric: 'Interceptions Per Game', off: 'off_int', def: 'def_int',
      impact: 'Interceptions remove an offensive possession and may create a short field. This comparison describes ball-security and takeaway history; it does not predict a turnover.'
    }
  ];

  function cfbRates(game, side) {
    return ((game[side + '_form'] || {}).rates) || {};
  }

  function cfbDecisionPaths() {
    return '<nav class="ca-research-paths" aria-label="Choose a college football research path">' +
      '<a href="#clash"><strong>Game Script</strong><span>Each offense against the defense it will face</span></a>' +
      '<a href="#form"><strong>Team Identity</strong><span>Scoring, passing, rushing, downs and special teams</span></a>' +
      '<a href="#recent"><strong>Form &amp; Context</strong><span>Recent results, venue, travel and schedule setting</span></a>' +
      '</nav>';
  }

  function cfbReadingKey() {
    return '<aside class="ca-cfb-reading-key" aria-label="How to read the college football matchup board">' +
      '<div><span>Reading Order</span><strong>Producing Offense</strong><i aria-hidden="true">→</i>' +
      '<strong>Game-Script Lever</strong><i aria-hidden="true">→</i><strong>Opposing Defense</strong></div>' +
      '<p>Values are season-to-date results. Ranks use the same FBS pool and are normalized so 1st is strongest. ' +
      'The brighter side owns the stronger observed indicator; it is matchup evidence, not a forecast or recommendation.</p></aside>';
  }

  function cfbScriptReading(sport, game, offSide, defSide, lens) {
    var offense = cfbRates(game, offSide)[lens.off];
    var defense = cfbRates(game, defSide)[lens.def];
    if (!offense && !defense) return '';
    var offPct = percentOf(offense);
    var defPct = percentOf(defense);
    var verdict = 'One side of this comparison is not yet published.';
    if (offPct != null && defPct != null) {
      var gap = offPct - defPct;
      verdict = Math.abs(gap) < 8 ? 'The FBS-relative indicators are closely matched.' :
        (gap > 0 ? 'The offense carries the stronger observed indicator.' :
          'The defense carries the stronger observed resistance.');
    }
    function rank(entry, role) {
      return entry && entry.rank && entry.of
        ? role + ' ' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of
        : role + ' rank unavailable';
    }
    return '<li><strong>' + esc(fullName(sport, game, offSide)) + ' offense</strong>' +
      '<span>vs ' + esc(fullName(sport, game, defSide)) + ' defense</span>' +
      '<small>' + esc(rank(offense, 'Offense')) + ' · ' + esc(rank(defense, 'Defense')) +
      '</small><p>' + esc(verdict) + '</p></li>';
  }

  function cfbScriptLens(sport, game) {
    var cards = CFB_SCRIPT_LENSES.map(function (lens) {
      var directions = cfbScriptReading(sport, game, 'away', 'home', lens) +
        cfbScriptReading(sport, game, 'home', 'away', lens);
      if (!directions) return '';
      return '<article class="ca-script-lens"><header><span>' + esc(lens.metric) + '</span>' +
        '<h4>' + esc(lens.title) + '</h4></header><p>' + esc(lens.impact) + '</p>' +
        '<ul>' + directions + '</ul></article>';
    }).filter(Boolean).join('');
    if (!cards) return '';
    return '<section class="ca-script-dynamics ca-cfb-script-dynamics" aria-labelledby="caCfbScriptDynamicsTitle">' +
      '<header><div><span>Competitive Dynamics</span>' +
      '<h3 id="caCfbScriptDynamicsTitle">How The Matchup Can Change Possessions And Play Mix</h3></div>' +
      '<p>Connect observed team rates to pace, field position and opportunity without treating descriptive evidence as a prediction.</p></header>' +
      '<div class="ca-script-lens-grid">' + cards + '</div></section>';
  }

  function cfbMetricGuide() {
    return '<details class="ca-metric-guide"><summary>How To Read The CFB Metrics</summary>' +
      '<dl><div><dt>FBS Percentile</dt><dd>League-relative placement among teams that published the rate. ' +
      'Direction is normalized, so a 1st-place defense is always the strongest result.</dd></div>' +
      '<div><dt>Points And Yards Per Game</dt><dd>Descriptive production shaped by pace, field position and opponents. ' +
      'Use it with rate metrics rather than as a standalone efficiency measure.</dd></div>' +
      '<div><dt>Third/Fourth Down</dt><dd>Conversion history on possession-leverage downs. ' +
      'It helps explain drive survival, not the quality of every snap.</dd></div>' +
      '<div><dt>Yards Per Attempt</dt><dd>Production per pass or rush attempt. Passing YPA is a useful field-position lens, ' +
      'but it is not an explosive-play rate.</dd></div>' +
      '<div><dt>Sacks And Interceptions</dt><dd>Per-game outcomes that show disruption and possession volatility. ' +
      'Small samples can move these rates quickly.</dd></div></dl></details>';
  }

  function cfbClashSpecs() {
    var out = [];
    CFB_CLASH_GROUPS.forEach(function (group) {
      group.rows.forEach(function (row) { out.push(row); });
    });
    return out;
  }

  function cfbShortLabel(entry, fallback) {
    return titleCase(String((entry && entry.label) || fallback || '')
      .replace(/^Offense /, ''));
  }

  function cfbMixRow(name, pct) {
    return '<div class="ca-arsenal-row">' +
      '<span class="ca-arsenal-name">' + esc(name) + '</span>' +
      '<span class="ca-arsenal-bar"><span class="ca-arsenal-bar__fill" style="width:' +
      pct + '%"></span></span>' +
      '<span class="ca-arsenal-pct">' + pct.toFixed(1) + '%</span></div>';
  }

  function cfbStyleMeter(form) {
    var rates = (form && form.rates) || {};
    var pass = rates.off_pass_ypg && Number(rates.off_pass_ypg.value);
    var rush = rates.off_rush_ypg && Number(rates.off_rush_ypg.value);
    if (!(pass >= 0) || !(rush >= 0) || (pass + rush) <= 0) return '';
    var passPct = (pass / (pass + rush)) * 100;
    return '<div class="ca-arsenal-list">' +
      cfbMixRow('Pass yards', passPct) +
      cfbMixRow('Rush yards', 100 - passPct) + '</div>';
  }

  function cfbSnapshotClub(sport, game, side) {
    var rates = cfbRates(game, side);
    var form = game[side + '_form'] || {};
    var qb = game[side + '_starter']
      ? '<p class="ca-lineup-context">QB ' + esc(game[side + '_starter']) + '</p>' : '';
    var cells = ['off_ppa', 'def_ppa', 'off_ypg', 'off_successRate'].map(function (key) {
      return formRow(rates[key]);
    }).filter(Boolean).join('');
    return '<section class="ca-form-panel">' +
      '<h3>' + logo(sport, game, side, 28, 'ca-mirror__crest') + ' ' +
      esc(fullName(sport, game, side)) + '</h3>' +
      '<p class="ca-lineup-context">' +
      esc(value(game[side + '_record'], 'Record not published')) +
      (game[side + '_conference'] || game[side + '_conf']
        ? ' · ' + esc(game[side + '_conference'] || game[side + '_conf']) : '') +
      '</p>' + qb + cfbStyleMeter(form) +
      '<div class="ca-form-grid ca-form-grid--tight">' + cells + '</div></section>';
  }

  function cfbScoreboard(sport, game) {
    return '<div class="ca-detail-duo">' +
      cfbSnapshotClub(sport, game, 'away') +
      cfbSnapshotClub(sport, game, 'home') +
      '</div>';
  }

  function cfbFmt(entry) {
    return function (v) {
      return formText({
        value: v,
        format: entry && entry.format,
        label: entry && entry.label
      });
    };
  }

  function cfbMirrorHead(sport, game, left, right, axis, leftRole, rightRole) {
    return '<div class="ca-mirror__head">' +
      '<span class="ca-mirror__team">' + logo(sport, game, left, 32, 'ca-mirror__crest') +
      '<span>' + esc(fullName(sport, game, left)) +
      (leftRole ? '<i>' + esc(leftRole) + '</i>' : '') + '</span></span>' +
      '<span class="ca-mirror__axis">' + esc(axis) + '</span>' +
      '<span class="ca-mirror__team ca-mirror__team--home"><span>' +
      esc(fullName(sport, game, right)) +
      (rightRole ? '<i>' + esc(rightRole) + '</i>' : '') + '</span>' +
      logo(sport, game, right, 32, 'ca-mirror__crest') + '</span></div>';
  }

  function cfbClashTally(offRates, defRates) {
    var won = 0, counted = 0;
    cfbClashSpecs().forEach(function (spec) {
      var offPct = percentOf(offRates[spec.off]);
      var defPct = percentOf(defRates[spec.def]);
      if (offPct == null || defPct == null) return;
      counted += 1;
      if (offPct > defPct) won += 1;
    });
    return { won: won, counted: counted };
  }

  function cfbClashCard(sport, game, offSide, defSide) {
    var offRates = cfbRates(game, offSide);
    var defRates = cfbRates(game, defSide);
    var offName = fullName(sport, game, offSide);
    var defName = fullName(sport, game, defSide);
    var styles = clubPair(sport, game, offSide, defSide);
    var groups = CFB_CLASH_GROUPS.map(function (group) {
      var specs = group.rows.slice().sort(function (a, b) {
        var gapA = percentOf(offRates[a.off]) - percentOf(defRates[a.def]);
        var gapB = percentOf(offRates[b.off]) - percentOf(defRates[b.def]);
        var absA = isFinite(gapA) ? Math.abs(gapA) : -1;
        var absB = isFinite(gapB) ? Math.abs(gapB) : -1;
        return absB - absA;
      });
      var rows = specs.map(function (spec) {
        var off = offRates[spec.off];
        var def = defRates[spec.def];
        if (!off && !def) return '';
        return mirrorRow(cfbShortLabel(off || def, spec.off), off, def, cfbFmt(off || def), styles);
      }).filter(Boolean).join('');
      if (!rows) return '';
      return '<div class="ca-mirror__group">' + esc(group.title) + '</div>' + rows;
    }).filter(Boolean).join('');
    if (!groups) return '';
    var tally = cfbClashTally(offRates, defRates);
    var take = tally.counted
      ? (tally.won > tally.counted / 2
          ? offName + '’s offense grades ahead of ' + defName + '’s defense on ' +
            tally.won + ' of ' + tally.counted + ' rates.'
          : tally.won < tally.counted / 2
            ? defName + '’s defense grades ahead of ' + offName + '’s offense on ' +
              (tally.counted - tally.won) + ' of ' + tally.counted + ' rates.'
            : offName + '’s offense and ' + defName + '’s defense sit on even unit percentiles.')
      : '';
    var games = (game[offSide + '_form'] || {}).plays;
    var sample = games != null
      ? '<p class="ca-lineup-context">' + Math.round(Number(games)) + ' games in the ESPN sample. Rank sits under each rate; the longer bar is the better FBS percentile.</p>'
      : '';
    return '<section class="ca-arsenal-panel">' +
      '<h3>' + logo(sport, game, offSide, 28, 'ca-mirror__crest') +
      esc(offName) + ' offense vs ' + esc(defName) + ' defense' +
      logo(sport, game, defSide, 28, 'ca-mirror__crest') + '</h3>' +
      sample +
      '<div class="ca-mirror">' +
      cfbMirrorHead(sport, game, offSide, defSide,
        'Offense vs Defense · FBS Percentile', 'Offense', 'Defense') +
      groups + '</div>' +
      (take ? '<p class="ca-lineup-context">' + esc(take) + '</p>' : '') +
      '</section>';
  }

  function cfbEdgesBoard(sport, game, offSide, defSide) {
    var offRates = cfbRates(game, offSide);
    var defRates = cfbRates(game, defSide);
    var styles = clubPair(sport, game, offSide, defSide);
    var items = cfbClashSpecs().map(function (spec) {
      var off = offRates[spec.off];
      var def = defRates[spec.def];
      var gap = (percentOf(off) == null || percentOf(def) == null)
        ? null : percentOf(off) - percentOf(def);
      if (gap == null || Math.abs(gap) < 8) return null;
      return { abs: Math.abs(gap), off: off, def: def, spec: spec };
    }).filter(Boolean);
    items.sort(function (a, b) { return b.abs - a.abs; });
    items = items.slice(0, 6);
    if (!items.length) return '';
    var rows = items.map(function (item) {
      return mirrorRow(
        cfbShortLabel(item.off || item.def, item.spec.off),
        item.off, item.def, cfbFmt(item.off || item.def), styles);
    }).join('');
    return '<div class="ca-mirror">' +
      cfbMirrorHead(sport, game, offSide, defSide,
        'Largest Percentile Gaps', 'Offense', 'Defense') +
      rows + '</div>';
  }

  function cfbEdges(sport, game) {
    var a = cfbEdgesBoard(sport, game, 'away', 'home');
    var b = cfbEdgesBoard(sport, game, 'home', 'away');
    if (!a && !b) return '';
    return '<section class="ca-arsenal-panel"><h3>Largest unit gaps</h3>' +
      '<p class="ca-lineup-context">The widest FBS-percentile separations between each offense and the defense it meets. These show where the matchup is most different—not which team will win.</p>' +
      a + b + '</section>';
  }

  function cfbClashBody(sport, game) {
    var a = cfbClashCard(sport, game, 'away', 'home');
    var b = cfbClashCard(sport, game, 'home', 'away');
    if (!a && !b) return pending('Unit rates are not published for this pairing yet.');
    var espn = ((game.away_form || {}).source === 'espn') || ((game.home_form || {}).source === 'espn');
    var edges = cfbEdges(sport, game);
    return '<div class="ca-detail-stack-inner"><div class="ca-cfb-matchup-stack">' + a + b + '</div>' +
      cfbScriptLens(sport, game) +
      (edges ? '<details class="ca-ranking-detail ca-cfb-gap-detail"><summary>Open Largest Unit Gaps</summary>' +
        '<div class="ca-ranking-detail__body">' + edges + '</div></details>' : '') +
      cfbMetricGuide() +
      '<p class="ca-detail-source-note">' +
      (espn
        ? 'Each row is a season-to-date ESPN team rate, ranked against every FBS club that published it. The left club is this offense’s production; the right club is what that defense has allowed. Rank sits under the number; bar length is the same percentile. This describes games already played.'
        : 'Each row is one season-to-date unit rate: this offense’s production against what that defense has allowed, ranked against the same FBS pool. The longer bar is the better percentile.') +
      '</p></div>';
  }

  function cfbCompareMirror(sport, game, keys) {
    var away = cfbRates(game, 'away');
    var home = cfbRates(game, 'home');
    var order = keys || CFB_FORM_ORDER;
    var rows = order.map(function (key) {
      var entry = away[key] || home[key];
      if (!entry) return '';
      return mirrorRow(titleCase(entry.label), away[key], home[key], function (v) {
        return formText({ value: v, format: entry.format, label: entry.label });
      }, clubPair(sport, game));
    }).filter(Boolean).join('');
    if (!rows) return pending('These rates are not published for this pairing.');
    return '<div class="ca-mirror">' +
      cfbMirrorHead(sport, game, 'away', 'home', 'Percentile Of The FBS Pool') +
      rows + '</div>';
  }

  function cfbCompareBody(sport, game) {
    var tabs = CFB_COMPARE_TABS.map(function (tab, i) {
      return '<button type="button" class="ca-lineup-tab' + (i === 0 ? ' is-on' : '') +
        '" data-cfb-compare="' + tab.id + '" aria-selected="' + (i === 0 ? 'true' : 'false') +
        '" tabindex="' + (i === 0 ? '0' : '-1') + '">' + esc(tab.label) + '</button>';
    }).join('');
    var panels = CFB_COMPARE_TABS.map(function (tab, i) {
      return '<div data-cfb-compare-panel="' + tab.id + '"' + (i === 0 ? '' : ' hidden') + '>' +
        cfbCompareMirror(sport, game, tab.keys) + '</div>';
    }).join('');
    return '<div class="ca-lineup-tabs ca-cfb-compare-tabs" role="tablist" aria-label="Stat families">' +
      tabs + '</div>' + panels +
      '<p class="ca-detail-source-note">Each bar is that rate’s percentile against every FBS team that published it this season. Use the family tabs to scan scoring, passing, rushing, downs, or special teams without leaving the pairing.</p>';
  }

  function cfbSections(sport, game) {
    return [
      section('clash', 'Matchup Breakdown',
        'Each Offense Against The Defense It Meets, Rate By Rate',
        cfbDecisionPaths() + cfbReadingKey() + cfbClashBody(sport, game)),

      section('form', 'Stat Comparison',
        'Same Rates, Side By Side, Ranked Against The FBS Pool',
        cfbCompareBody(sport, game)),

      section('radar', 'Team Profile Radar', 'Both Clubs On One Shape, By Percentile',
        radarBody(sport, game)),

      section('recent', 'Recent Results', 'Completed Games, Oldest To Newest',
        '<div class="ca-recent-stack">' +
        recentStrip(sport, game, 'away', game.away_recent || []) +
        recentStrip(sport, game, 'home', game.home_recent || []) + '</div>' +
        '<p class="ca-detail-source-note">Each square is a completed game with its final score. Hover or focus for the opponent and date. These are results already in the book, not a statement about Saturday.</p>'),

      section('team-context', 'Venue And Travel', 'Factual Scheduling Context',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', [
          ['Record', value(game.away_record)],
          ['Conference', value(game.away_conference || game.away_conf)],
          ['Quarterback', value(game.away_starter)],
          ['Travel', value(game.away_travel)]
        ]) + teamPanel(sport, game, 'home', [
          ['Record', value(game.home_record)],
          ['Conference', value(game.home_conference || game.home_conf)],
          ['Quarterback', value(game.home_starter)],
          ['Travel', value(game.home_travel)]
        ]) + '</div>' +
        '<p class="ca-detail-source-note">' +
        (game.neutral ? 'Neutral site. ' : '') +
        (game.stadium ? esc(String(game.stadium)) +
          (game.roof ? ' · ' + esc(String(game.roof)) : '') + '. ' : '') +
        (game.broadcast ? esc(String(game.broadcast)) + '. ' : '') +
        'Travel is the published home/away or distance note. A missing number is unpublished, not zero.</p>')
    ].join('');
  }
  function render(host, sport, game, extra, result) {
    var awayName = fullName(sport, game, 'away');
    var homeName = fullName(sport, game, 'home');
    document.title = awayName + ' at ' + homeName + ' — Chase Analytics';
    var nav = sport === 'mlb'
      ? [['overview', 'Overview'], ['starters', 'Starters'], ['arsenal', 'Pitch Mix'],
         ['lineups', 'Lineup Vs Starter'], ['club-splits', 'Club Splits'], ['recent', 'Last Ten'], ['form', 'Offensive Form'],
         ['radar', 'Radar'], ['bullpens', 'Bullpens']]
      : sport === 'cfb'
      ? [['overview', 'Overview'], ['clash', 'Matchup'], ['form', 'Comparison'],
         ['radar', 'Radar'], ['recent', 'Recent'],
         ['team-context', 'Venue And Travel']]
      : [['overview', 'Overview'], ['form', 'Matchup'], ['scheme', 'Scheme'],
         ['players', 'Players'], ['availability', 'Lineups'], ['radar', 'Team Shape'],
         ['team-context', 'Context']];
    var html = '<a class="ca-detail-back" href="/' + sport + '/">← Back To ' + sport.toUpperCase() + ' Matchups</a>' +
      '<article class="ca-detail-hero" id="overview"><header class="ca-detail-hero__meta">' +
      '<p class="ca-detail-eyebrow">' + sport.toUpperCase() + ' · Matchup Analysis</p>' +
      '</header>' +
      '<div class="ca-detail-hero__teams">' + teamHero(sport, game, 'away') + '<div class="ca-detail-center">' +
      scoreOrTime(game) + '</div>' + teamHero(sport, game, 'home') + '</div>' +
      // Conditions live in the banner now: they are read once, at the top,
      // beside where and when - not as their own section of dimensions and
      // capacities nobody came for.
      '<div class="ca-detail-facts">' + (sport === 'cfb'
        ? fact('Setting', venue(game)) +
          fact('Stadium', value(game.stadium)) +
          fact('Broadcast', value(game.broadcast)) +
          fact('Status', gameStatus(game))
        : fact('Venue', venue(game)) +
          wxFact(game) + fact('Broadcast', value(game.broadcast)) +
          fact('Status', gameStatus(game))) + '</div>' +
      (sport === 'cfb' ? cfbScoreboard(sport, game) : '') +
      '</article>' +
      '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
        var glyph = item[0] === 'overview' ? ico('info', 'ca-detail-nav__ico', 14)
          : (SECTION_ICON[item[0]] ? ico(SECTION_ICON[item[0]], 'ca-detail-nav__ico', 14) : '');
        return '<a href="#' + item[0] + '">' + glyph + item[1] + '</a>';
      }).join('') + '</nav>' + (sport === 'nfl' ? seasonToggle(game) : '') +
      '<div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra)
        : sport === 'cfb' ? cfbSections(sport, game)
        : nflSections(sport, game)) +
      '</div>';
    host.innerHTML = html;
    host.setAttribute('data-state', 'ready');
    host.__caRadar = { sport: sport, game: game };
    fitRadar(host);
    // Delegated once on the host, so a repainted section keeps working.
    if (!host.dataset.seasonWired) {
      wireSeasonToggle(host);
      wireLineupTabs(host);
      wireSchemeTabs(host);
      wirePlayerTabs(host);
      wireMatchupTabs(host);
      wireTeamStatViews(host);
      wirePlayerFilters(host);
      wireCfbCompare(host);
      wireRadarReadout(host);
      if (global.ResizeObserver) {
        new global.ResizeObserver(function () { fitRadar(host); }).observe(host);
      }
      host.dataset.seasonWired = '1';
    }
  }

  function mount(opts) {
    opts = opts || {};
    var host = opts.host;
    var sport = opts.sport;
    var adapter = opts.adapter;
    requireHost(host);
    host.setAttribute('data-state', 'loading');
    host.innerHTML = '<div class="ca-loading-state" role="status">Loading matchup analysis…</div>';
    var requested = params().get('game') || params().get('gamePk') || '';
    var requestedAway = String(params().get('away') || '').toUpperCase();
    var requestedHome = String(params().get('home') || '').toUpperCase();
    return global.ChaseMatchupCard.loadGames(sport, adapter, params().get('date')).then(function (result) {
      var game = result.games.find(function (candidate) {
        return String(candidate.id) === String(requested) || String(candidate.game_pk || '') === String(requested);
      });
      if (!game && requestedAway && requestedHome) {
        game = result.games.find(function (candidate) {
          return String(candidate.away || '').toUpperCase() === requestedAway &&
            String(candidate.home || '').toUpperCase() === requestedHome;
        });
      }
      if (!game && requested) {
        game = result.games.find(function (candidate) {
          var label = String(candidate.away_name || candidate.away || '') + ' @ ' +
            String(candidate.home_name || candidate.home || '');
          return label.toLowerCase() === String(requested).toLowerCase();
        });
      }
      if (!game && result.games.length === 1 && !requested) game = result.games[0];
      if (!game) throw new Error('The requested game is not in the published slate.');

      // Paint identity immediately, then fill the evidence in stages. A slow
      // source must never hold back the hero, and a stage that resolves late
      // repaints only its own section so the reader never loses their place.
      var extra = {};
      render(host, sport, game, extra, result);

      if (sport === 'mlb') {
        var dateIso = result.dateIso || params().get('date') ||
          String(game.kickoff_utc || '').slice(0, 10);
        var season = seasonOf(dateIso || game.kickoff_utc);

        var repaintStarters = function () {
          paintSection(host, 'starters', startersBody(sport, game, extra));
          paintSection(host, 'lineups', lineupsBody(sport, game, extra));
          paintSection(host, 'arsenal', arsenalBody(sport, game, extra));
        };

        // Stage 1 - everyone named on the card, in one request per group.
        var hitterIds = [];
        ['away_lineup', 'home_lineup'].forEach(function (key) {
          (game[key] || []).forEach(function (pl) { if (pl && pl.id) hitterIds.push(pl.id); });
        });
        var armIds = [game.away_starter_id, game.home_starter_id].filter(Boolean);
        // Each lineup is fetched against the hand it will actually face, so the
        // two orders can be on different splits within the same game.
        var awayIds = (game.away_lineup || []).map(function (pl) { return pl.id; });
        var homeIds = (game.home_lineup || []).map(function (pl) { return pl.id; });
        function sit(hand) { return hand === 'L' ? 'vl' : (hand === 'R' ? 'vr' : null); }
        loadPeople(armIds, 'pitching', season).then(function (arms) {
          extra.people = arms;
          repaintStarters();
          var awayHand = sit((arms[game.home_starter_id] || {}).throws || game.home_hand);
          var homeHand = sit((arms[game.away_starter_id] || {}).throws || game.away_hand);
          return Promise.all([
            loadPeople(awayIds, 'hitting', season, awayHand),
            loadPeople(homeIds, 'hitting', season, homeHand)
          ]);
        }).then(function (batches) {
          batches.forEach(function (batch) {
            Object.keys(batch).forEach(function (id) { extra.people[id] = batch[id]; });
          });
          repaintStarters();
          return Promise.all([
            loadArmSplits(armIds, season),
            loadLastStart(game.away_starter_id, season),
            loadLastStart(game.home_starter_id, season)
          ]);
        }).then(function (extras) {
          if (!extras) return;
          Object.keys(extras[0] || {}).forEach(function (id) {
            if (extra.people[id]) extra.people[id].splits = extras[0][id];
          });
          if (extra.people[game.away_starter_id]) extra.people[game.away_starter_id].lastStart = extras[1];
          if (extra.people[game.home_starter_id]) extra.people[game.home_starter_id].lastStart = extras[2];
          paintSection(host, 'starters', startersBody(sport, game, extra));
        }).catch(function () { /* identity is already on screen */ });

        // The league board backs the "Compare with the league" disclosure. It is
        // cheap, cached, and the same artifact the cards already read.
        loadLeagueBoard().then(function (board) {
          if (!board) return;
          window.__caLeagueBoard = board;
          paintSection(host, 'form', formBody(sport, game));
          paintSection(host, 'radar', radarBody(sport, game));
          paintSection(host, 'recent', recentBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
        });

        loadStarterSplits().then(function (found) {
          extra.starterSplits = found;
          paintSection(host, 'starters', startersBody(sport, game, extra));
        });

        // Stage 2 - pitch mix and the ballpark record.
        Promise.all([
          loadArsenal(game.away_starter_id, season),
          loadArsenal(game.home_starter_id, season),
          loadVenue(game.venue_id),
          loadPitchBoard(),
          loadRunValue()
        ]).then(function (parts) {
          extra.awayArsenal = parts[0] || [];
          extra.homeArsenal = parts[1] || [];
          extra.venue = parts[2];
          extra.pitchBoard = parts[3];
          extra.runValue = parts[4];
          paintSection(host, 'arsenal', arsenalBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
        }).catch(function () { /* the section keeps its pending note */ });

        // The club's own splits, beside the order that produces them.
        Promise.all([
          loadTeamSplits(game.away_team_id, season),
          loadTeamSplits(game.home_team_id, season)
        ]).then(function (found) {
          extra.awayTeamSplits = found[0];
          extra.homeTeamSplits = found[1];
          paintSection(host, 'club-splits', teamSplitsBody(sport, game, extra));
        }).catch(function () { /* the panels keep their pending note */ });

        // The last ten games for each club - the quickest read of form there is.
        Promise.all([
          loadRecentForm(game.away_team_id, dateIso),
          loadRecentForm(game.home_team_id, dateIso)
        ]).then(function (recent) {
          extra.awayRecent = recent[0] || [];
          extra.homeRecent = recent[1] || [];
          paintSection(host, 'recent', recentBody(sport, game, extra));
        }).catch(function () { /* the strip keeps its pending note */ });

        // Stage 3 - bullpen quality splits and recent workload. The active
        // roster requests establish the unit available on this game date; the
        // box scores answer the separate question of how heavily it was used.
        Promise.all([
          loadBullpen(game.away_team_id, game.away, dateIso, game.away_starter_id),
          loadBullpen(game.home_team_id, game.home, dateIso, game.home_starter_id),
          loadActiveBullpen(game.away_team_id, season, 'a', dateIso, game.away_starter_id),
          loadActiveBullpen(game.home_team_id, season, 'h', dateIso, game.home_starter_id)
        ]).then(function (reports) {
          var none = { used: [], bulk: [], starter: null, games: 0, window: 'window not published' };
          extra.awayBullpen = reports[0] || none;
          extra.homeBullpen = reports[1] || none;
          extra.awayBullpenUnit = reports[2];
          extra.homeBullpenUnit = reports[3];
          extra.bullpenQuality = {};
          [reports[2], reports[3]].forEach(function (unit) {
            Object.keys((unit && unit.people) || {}).forEach(function (id) {
              extra.bullpenQuality[id] = unit.people[id];
            });
          });
          paintSection(host, 'bullpens', bullpenBody(sport, game, extra));
          var ids = [];
          [extra.awayBullpen, extra.homeBullpen].forEach(function (report) {
            report.used.forEach(function (rec) { ids.push(rec.id); });
          });
          return loadPeople(ids, 'pitching', season);
        }).then(function (quality) {
          Object.keys(quality || {}).forEach(function (id) {
            extra.bullpenQuality[id] = quality[id];
          });
          paintSection(host, 'bullpens', bullpenBody(sport, game, extra));
        }).catch(function () { /* the section keeps its pending note */ });
      }
      if (global.ChaseShell && ChaseShell.setContext) {
        ChaseShell.setContext({ sport: sport, state: 'ok', publishedAt: result.generatedAt,
          dataCutoff: result.dataThrough, source: result.source, issues: [] });
      }
      var context = document.getElementById('caContextBar');
      if (context) {
        context.textContent = sport.toUpperCase() + ' · ' + result.source + ' · Data through ' +
          publishedTime(result.dataThrough);
        context.setAttribute('data-state', 'ok');
      }
      return game;
    }).catch(function (error) {
      host.setAttribute('data-state', 'error');
      host.innerHTML = '<div class="ca-error-state" role="alert"><h1>Matchup unavailable</h1><p>' +
        esc(error.message) + '</p><a class="ca-detail-back" href="/' + sport + '/">Return to ' +
        sport.toUpperCase() + ' matchups</a></div>';
    });
  }

  function requireHost(host) {
    if (!host) throw new Error('Matchup host missing.');
  }

  global.ChasePublicGameDetail = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
