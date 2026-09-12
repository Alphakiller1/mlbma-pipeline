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
    availability: 'whistle', scheme: 'football', 'team-context': 'plane'
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

  function paintSection(host, id, body) {
    var node = host.querySelector('[data-body="' + id + '"]');
    if (node) node.innerHTML = body;
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
        '<p>' + esc(clock(game.kickoff_utc)) + '</p>';
    }
    return '<strong>' + esc(clock(game.kickoff_utc)) + '</strong>';
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
  function loadBullpen(teamId, teamCode, dateIso) {
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
        return { used: [], games: 0, window: start + ' to ' + end,
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
                id: pid, name: (player.person || {}).fullName || '', outings: []
              });
              rec.outings.push({
                date: entry.date,
                pitches: Number(stat.numberOfPitches) || 0,
                innings: stat.inningsPitched || '0.0'
              });
            });
          });
        });
        var used = Object.keys(byPitcher).map(function (id) {
          var rec = byPitcher[id];
          rec.outings.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
          rec.pitches = rec.outings.reduce(function (sum, o) { return sum + o.pitches; }, 0);
          rec.dates = rec.outings.map(function (o) { return o.date; });
          rec.backToBack = consecutiveDays(rec.dates);
          return rec;
        }).sort(function (a, b) { return b.pitches - a.pitches; });
        return { used: used, games: finals.length, window: start + ' to ' + end,
                 days: dayColumns(start, end) };
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
    if (!(of > 1) || !(rank >= 1)) return '';
    var pct = (of - rank) / (of - 1);
    if (pct >= 0.87) return 'c-elite';
    if (pct >= 0.63) return 'c-good';
    if (pct >= 0.37) return 'c-mid';
    if (pct >= 0.13) return 'c-weak';
    return 'c-poor';
  }

  function rankBadge(entry) {
    if (!entry || !(entry.of > 1)) return '';
    return '<span class="ca-rank ' + rankTone(entry.rank, entry.of) + '">' +
      entry.rank + ordinal(entry.rank) + '</span>';
  }

  function percentBar(rank, of) {
    if (!(of > 1) || !(rank >= 1)) return '';
    var pct = Math.round(((of - rank) / (of - 1)) * 100);
    return '<span class="ca-pct-bar" role="img" aria-label="' + pct +
      ' percent of clubs rate below this value">' +
      '<span class="ca-pct-bar__fill" style="width:' + pct + '%"></span></span>';
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
    if (!(global.MLBMAAssets && MLBMAAssets.teamBarColor)) return null;
    // The bar variant, not the raw brand hex: half the league is navy, and a
    // navy bar on a near-black panel is an invisible bar.
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
    if (!entry || !(entry.of > 1) || !(entry.rank >= 1)) return null;
    return ((entry.of - entry.rank) / (entry.of - 1)) * 100;
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
      var bar = '<span class="' + track + '"><span class="ca-mirror__fill"' +
        (styles[which] ? ' data-club="1"' : '') + ' style="width:' +
        (pct == null ? 0 : pct.toFixed(1)) + '%"></span></span>';
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
      '<span class="ca-mirror__label">' + esc(label) + '</span>' +
      side(home, homePct, 'home') + '</div>';
  }

  function clubPair(sport, game) {
    var a = clubColour(sport, game, 'away');
    var h = clubColour(sport, game, 'home');
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

  /* Allowed rates read the other way round: a .200 opponent average is elite,
     not poor. This flips the ramp for baselines measured on HITTERS (avg, ops)
     being read against a pitcher. Baselines already declared low-is-good -
     bbpct, era, whip, xfip - grade correctly on their own and must not pass
     through here, or they invert twice. */
  var GRADE_FLIP = { 'c-elite': 'c-poor', 'c-good': 'c-weak', 'c-mid': 'c-mid',
    'c-weak': 'c-good', 'c-poor': 'c-elite' };

  function gradeAllowed(value, context) {
    var cls = gradeFor(value, context);
    return GRADE_FLIP[cls] || cls;
  }

  /* An index centred on 100 grades against 100 - there is no pool to take a
     percentile from. */
  /* A 0-100 percentile index grades against the middle of its own scale, not
     against 100 the way an index centred on 100 does. */
  function scoreTone(value) {
    var v = Number(value);
    if (!isFinite(v)) return '';
    if (v >= 75) return 'c-elite';
    if (v >= 60) return 'c-good';
    if (v >= 40) return 'c-mid';
    if (v >= 25) return 'c-weak';
    return 'c-poor';
  }

  /* Roughly two starts in five is a league-average quality-start rate, so the
     bands sit around that rather than around fifty. */
  function qsTone(value) {
    var v = Number(value);
    if (!isFinite(v)) return '';
    if (v >= 60) return 'c-elite';
    if (v >= 48) return 'c-good';
    if (v >= 33) return 'c-mid';
    if (v >= 22) return 'c-weak';
    return 'c-poor';
  }

  function indexTone(value) {
    var v = Number(value);
    if (!isFinite(v)) return '';
    if (v >= 115) return 'c-elite';
    if (v >= 105) return 'c-good';
    if (v >= 95) return 'c-mid';
    if (v >= 85) return 'c-weak';
    return 'c-poor';
  }

  /* A number that carries its own grade, off the published league baseline, so
     the reader does not have to know what a good ERA is this season. */
  function gradeFor(value, context) {
    var n = Number(value);
    if (!isFinite(n)) return '';
    if (global.MLBMAAssets && MLBMAAssets.solidChipClass) {
      return MLBMAAssets.solidChipClass(n, context) || '';
    }
    return '';
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
      ['Pitch Score', anySplit.pitch_score, scoreTone(anySplit.pitch_score)],
      ['QS%', anySplit.qs_pct == null ? null : anySplit.qs_pct + '%', qsTone(anySplit.qs_pct)],
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
    // key, header, baseline to grade against, whether it is an allowed rate
    // that must read the other way round, suffix.
    var SPLIT_COLS = [
      // WHIP rather than ERA. ERA cannot exist on a batter-hand cut - an
      // earned run belongs to an inning, not to the handedness of one plate
      // appearance - so an ERA column left two of the four rows empty for a
      // reason no reader could be expected to infer. WHIP is attributable to
      // every split, carries the same kind of information, and the table has
      // no holes in it.
      ['whip', 'WHIP', 'whip', false, ''],
      // xFIP, not FIP. FIP still carries the home runs this arm actually gave
      // up, which on a two-month split is mostly the park and the luck; xFIP
      // is the same formula with that term normalised, and it is the one of
      // the two worth a column when there is only room for one.
      ['xfip', 'xFIP', 'xfip', false, ''],
      ['k_pct', 'K%', 'kpct', false, '%'],
      ['bb_pct', 'BB%', 'bbpct', false, '%'],
      ['hr9', 'HR/9', null, false, ''],
      ['ops', 'OPS', 'ops', true, ''],
      ['ops_plus', 'OPS+', null, false, ''],
      ['pitches_per_inning', 'P/IP', null, false, '']
    ];

    var banks = SPLIT_ROWS.map(function (row) {
      return [row[0], ((bank && bank.splits) || {})[row[1]]];
    }).filter(function (pair) { return !!pair[1]; });

    var cols = SPLIT_COLS.filter(function (col) {
      return banks.some(function (pair) { return pair[1][col[0]] != null; });
    });

    var splitBody = !banks.length ? '' : banks.map(function (pair) {
      var st = pair[1];
      var cells = cols.map(function (col) {
        var v = st[col[0]];
        if (v == null) return '<td class="num">&mdash;</td>';
        var cls = col[0] === 'ops_plus' ? indexTone(v)
          : (col[2] ? (col[3] ? gradeAllowed(v, col[2]) : gradeFor(v, col[2])) : '');
        return '<td class="num ' + cls + '">' + esc(v) + col[4] + '</td>';
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

    var rows = players.map(function (pl, i) {
      var person = people[pl.id] || {};
      var stat = person.stat || {};
      function cell(key, context) {
        var v = stat[key];
        if (v == null) return '<td class="num">&mdash;</td>';
        return '<td class="num ' + gradeFor(v, context) + '">' + esc(v) + '</td>';
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
    var tone = entry.percentile == null ? '' : scoreTone(entry.percentile);
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

  function bullpenPanel(sport, game, side, report, quality) {
    quality = quality || {};
    var label = fullName(sport, game, side);
    var head = '<section class="ca-bullpen-panel"><h3>' + esc(label) + '</h3>';
    if (report === null || report === undefined) {
      return head + pending('Bullpen workload is loading.') + '</section>';
    }
    if (!report.used.length) {
      return head + '<p class="ca-lineup-context">Last ' + report.games +
        ' completed games</p>' + pending('No relief appearances recorded in this window.') + '</section>';
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
      '<tbody>' + rows + '</tbody></table></div></section>';
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
      return '<tr><td>' + esc(spec[1]) + '</td>' +
        cell(st.avg, 'avg') + cell(st.obp, 'obp') + cell(st.slg, 'slg') +
        cell(st.ops, 'ops') +
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

  function radarPoints(ctx, keys, radius, cx, cy) {
    return keys.map(function (key, i) {
      var entry = ctx && ctx[key];
      var pct = entry ? percentOf(entry) : null;
      // An axis with no value collapses to the centre rather than being skipped,
      // so the shape keeps its geometry and the gap is visible as a gap.
      var r = pct == null ? 0 : (pct / 100) * radius;
      var angle = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
      return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    });
  }

  function radarWeb(sport, game, spec, plan) {
    // Sized for the labels, not for the pentagon: the widest axis name is
    // about 85px at 12px display type, and it hangs outward from an anchor at
    // radius + 18. A box drawn to the shape alone let neighbouring webs write
    // their labels over each other.
    var w = 360, h = 250, cx = w / 2, cy = 140, radius = 80, labelGap = 18;
    var away = plan.away, home = plan.home;
    var keys = spec.keys.filter(function (key) {
      return plan.label(key) && ((away && away[key]) || (home && home[key]));
    });
    // Three axes is the fewest that makes a shape rather than a line.
    if (keys.length < 3) return '';
    if (!away && !home) return '';

    var rings = [0.25, 0.5, 0.75, 1].map(function (step) {
      var pts = keys.map(function (_, i) {
        var a = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
        return (cx + radius * step * Math.cos(a)).toFixed(1) + ',' +
               (cy + radius * step * Math.sin(a)).toFixed(1);
      }).join(' ');
      return '<polygon class="ca-radar__ring" points="' + pts + '"/>';
    }).join('');

    var spokes = keys.map(function (_, i) {
      var a = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
      return '<line class="ca-radar__spoke" x1="' + cx + '" y1="' + cy + '" x2="' +
        (cx + radius * Math.cos(a)).toFixed(1) + '" y2="' +
        (cy + radius * Math.sin(a)).toFixed(1) + '"/>';
    }).join('');

    /* Each axis is its own hoverable, focusable object carrying what the
       metric measures and where both clubs sit on it. A radar shows shape
       beautifully and values not at all; this is how the values get back. */
    function readout(ctx, key) {
      var entry = ctx && ctx[key];
      if (!entry) return 'not published';
      var pct = percentOf(entry);
      var value = entry.value;
      return value + (entry.rank ? '  ·  ' + entry.rank + ordinal(entry.rank) +
        ' of ' + entry.of : '') + (pct == null ? '' : '  ·  ' + Math.round(pct) + 'th pct');
    }

    function wrap(text, perLine) {
      var words = String(text || '').split(' ');
      var lines = [];
      var line = '';
      words.forEach(function (word) {
        if ((line + ' ' + word).trim().length > perLine) { lines.push(line.trim()); line = word; }
        else { line = (line + ' ' + word).trim(); }
      });
      if (line) lines.push(line);
      return lines.slice(0, 3);
    }

    var labels = keys.map(function (key, i) {
      var a = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
      var lx = cx + (radius + labelGap) * Math.cos(a);
      var ly = cy + (radius + labelGap) * Math.sin(a);
      var anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
      var means = STAT_MEANS[key] || '';
      var body = wrap(means, 42);
      var awayLine = fullName(sport, game, 'away') + ':  ' + readout(away, key);
      var homeLine = fullName(sport, game, 'home') + ':  ' + readout(home, key);
      var rows = [plan.label(key)].concat(body, [awayLine, homeLine]);
      var tipW = 250;
      var tipH = 22 + rows.length * 15;
      // The card is pinned toward the middle so it never leaves the box, and
      // below the axis unless the axis is itself low.
      var tx = Math.max(6, Math.min(w - tipW - 6, cx - tipW / 2));
      var ty = ly < cy ? ly + 12 : ly - tipH - 14;
      var tip = '<g class="ca-radar__tip" aria-hidden="true">' +
        '<rect x="' + tx + '" y="' + ty.toFixed(1) + '" width="' + tipW + '" height="' + tipH +
        '" rx="6"/>' +
        rows.map(function (row, n) {
          return '<text class="ca-radar__tip-line' + (n === 0 ? ' is-head' : '') +
            (n >= rows.length - 2 ? ' is-value' : '') + '" x="' + (tx + 10) +
            '" y="' + (ty + 18 + n * 15).toFixed(1) + '">' + esc(row) + '</text>';
        }).join('') + '</g>';
      return '<g class="ca-radar__axis" tabindex="0" role="button" aria-label="' +
        esc(plan.label(key) + '. ' + means + '. ' + awayLine + '. ' + homeLine) + '">' +
        '<circle class="ca-radar__hit" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) +
        '" r="30"/>' +
        '<text class="ca-radar__label" x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) +
        '" text-anchor="' + anchor + '">' + esc(plan.label(key)) + '</text>' +
        tip + '</g>';
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

    function ordered(a, h, colour) {
      var pair = [
        { ctx: a, cls: 'is-away', colour: colour.away, size: area(a, keys) },
        { ctx: h, cls: 'is-home', colour: colour.home, size: area(h, keys) }
      ].sort(function (x, y) { return y.size - x.size; });
      return pair.map(function (one) {
        return shape(one.ctx, one.cls, one.colour);
      }).join('');
    }

    function shape(ctx, cls, colour) {
      if (!ctx) return '';
      var pts = radarPoints(ctx, keys, radius, cx, cy)
        .map(function (pt) { return pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }).join(' ');
      return '<polygon class="ca-radar__area ' + cls + '" points="' + pts + '"' +
        (colour ? ' style="stroke:' + esc(colour) + ';fill:' + esc(colour) + '"' : '') + '/>';
    }

    return '<figure class="ca-radar">' +
      '<figcaption>' + esc(spec.title) + '</figcaption>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h +
      '" role="img" aria-label="' + esc(spec.title) + ' percentile comparison">' +
      // The bigger shape is drawn FIRST so the smaller one is never buried
      // under it. Two translucent fills over each other used to leave the
      // dominant club's outline as the only one a reader could follow, which
      // made the comparison look like one lumpy polygon instead of two.
      rings + spokes + ordered(away, home, plan.colour) + labels +
      '</svg></figure>';
  }

  /* Where each sport keeps its context, and what it calls each axis. The MLB
     board is a flat map of metric entries; the NFL board nests the same shape
     one level down under `rates` and carries its own labels. */
  function radarPlan(sport, game) {
    var colour = radarPair(sport, game);
    if (sport === 'nfl') {
      return {
        colour: colour,
        away: ((game.away_form || {}).rates) || null,
        home: ((game.home_form || {}).rates) || null,
        label: function (key) {
          if (NFL_AXIS[key]) return NFL_AXIS[key];
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

  function hexRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* Are these two colours far enough apart to carry two overlaid shapes?
     Plain Euclidean distance in RGB is crude, but it is the right kind of
     crude here: the question is only "can a reader tell these apart", and a
     club pair that fails it is rare enough that the fallback costs nothing. */
  function tooClose(a, b) {
    var x = hexRgb(a), y = hexRgb(b);
    if (!x || !y) return false;
    var d = Math.sqrt(Math.pow(x[0] - y[0], 2) + Math.pow(x[1] - y[1], 2) +
                      Math.pow(x[2] - y[2], 2));
    return d < 110;
  }

  function radarPair(sport, game) {
    var pair = clubPair(sport, game);
    if (pair.away && pair.home && tooClose(pair.away, pair.home)) {
      return { away: '', home: '', fellBack: true };
    }
    return { away: pair.away, home: pair.home, fellBack: false };
  }

  function radarBody(sport, game) {
    var plan = radarPlan(sport, game);
    var pair = plan.colour;
    function swatch(colour) {
      return colour ? ' style="background:' + esc(colour) + '"' : '';
    }
    var specs = sport === 'nfl' ? NFL_RADARS : RADARS;
    var webs = specs.map(function (spec) { return radarWeb(sport, game, spec, plan); })
      .filter(Boolean).join('');
    if (!webs) return pending('Team profile is not published for this pairing.');
    return '<div class="ca-radar-duo">' + webs + '</div>' +
      '<p class="ca-radar-key">' +
      '<span class="ca-radar-key__swatch is-away"' + swatch(pair.away) + '></span>' +
      esc(fullName(sport, game, 'away')) +
      '<span class="ca-radar-key__swatch is-home"' + swatch(pair.home) + '></span>' +
      esc(fullName(sport, game, 'home')) +
      '</p>' +
      '<p class="ca-detail-source-note">Every axis is that club’s percentile on the ' +
      'metric named, against the same league pool the section above uses — the only ' +
      'honest way to put rates with no units in common on one shape. Further from the ' +
      'centre is better on every axis, including the ones ranked low-is-good. ' +
      (sport === 'nfl'
        ? 'Both webs read the ten charted rates from the form section above, split into ' +
          'the two phases of the game. '
        : 'The legacy web carried a projOSI axis; that is a forecast, so this one carries ' +
          'Pitch Score, a descriptive index over the same kind of inputs. ') +
      (plan.colour.fellBack
        ? 'These two clubs wear colours too close to tell apart when the shapes overlap, ' +
          'so the web uses the chart pair instead of the club pair; the key names which is ' +
          'which.'
        : 'Each shape is drawn in its own club’s colour.') + '</p>';
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
    return '<div class="ca-detail-stack-inner">' +
      bullpenPanel(sport, game, 'away', extra.awayBullpen, extra.bullpenQuality) +
      bullpenPanel(sport, game, 'home', extra.homeBullpen, extra.bullpenQuality) + '</div>' +
      '<p class="ca-detail-source-note">Pitch counts read from the official box score of each completed game. Relief appearances only — a pitcher who started that game is excluded by his own line. A dash is a day that arm did not pitch. The shading runs dim to hot with the size of the day, not good to bad: thirty-five pitches is a heavy outing, which is a fact about availability tonight rather than a judgement about the pitcher.</p>';
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
      section('bullpens', 'Bullpen Workload', 'Pitch Count By Day, The Week Before This Game',
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
    ['blitz_rate', 'Blitz Rate', 'pct'],
    ['pressure_rate', 'Pressure Rate', 'pct'],
    ['stacked_box_rate', 'Stacked Box Rate', 'pct'],
    ['avg_box', 'Average Box Count', 'num']
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
    ['pass_epa_blitz', 'Pass EPA When Blitzed', 'epa'],
    ['pass_epa_pressure', 'Pass EPA Under Pressure', 'epa'],
    ['pass_epa_play_action', 'Pass EPA On Play Action', 'epa'],
    ['pass_success_rate', 'Pass Success Rate', 'pct'],
    ['rush_success_rate', 'Rush Success Rate', 'pct']
  ];

  var TARGET_ROWS = [
    ['target_share_rb_all', 'Running Backs'],
    ['target_share_wr_all', 'Receivers'],
    ['target_share_te_all', 'Tight Ends']
  ];

  function pctText(value) {
    var v = Number(value);
    return isFinite(v) ? (v * 100).toFixed(1) + '%' : '\u2014';
  }

  function epaText(value) {
    var v = Number(value);
    if (!isFinite(v)) return '\u2014';
    return (v > 0 ? '+' : '') + v.toFixed(3);
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
  function rateTable(caption, rows, source) {
    var body = rows.map(function (row) {
      var raw = source[row[0]];
      if (raw == null) return '';
      var bar = '';
      if (row[2] === 'pct') {
        var pct = Math.max(0, Math.min(100, Number(raw) * 100));
        bar = '<span class="ca-rate-bar" aria-hidden="true"><span style="width:' +
          pct.toFixed(1) + '%"></span></span>';
      }
      return '<tr><td>' + esc(row[1]) + bar + '</td><td class="num">' +
        esc(schemeValue(raw, row[2])) + '</td></tr>';
    }).filter(Boolean).join('');
    if (!body) return '';
    return '<div class="ca-rate-block"><h4>' + esc(caption) + '</h4>' +
      '<table class="ca-rate-table"><tbody>' + body + '</tbody></table></div>';
  }

  /* A 100% stacked bar. The segments are the shells themselves, so the bar can
     only ever say how the charted snaps divided up. */
  function stackedBar(segments) {
    var total = segments.reduce(function (sum, seg) { return sum + seg.value; }, 0);
    if (!(total > 0)) return '';
    var bar = segments.map(function (seg, i) {
      var share = (seg.value / total) * 100;
      return '<span class="ca-stack__seg ca-stack__seg--' + ((i % 7) + 1) + '" style="width:' +
        share.toFixed(2) + '%" title="' + esc(seg.label) + ' ' + share.toFixed(1) + '%"></span>';
    }).join('');
    var key = segments.map(function (seg, i) {
      var share = (seg.value / total) * 100;
      return '<li><span class="ca-stack__swatch ca-stack__swatch--' + ((i % 7) + 1) +
        '"></span>' + esc(seg.label) + ' <strong>' + share.toFixed(1) + '%</strong></li>';
    }).join('');
    return '<div class="ca-stack">' + bar + '</div><ul class="ca-stack__key">' + key + '</ul>';
  }

  function provenanceLine(scheme) {
    var seasons = (scheme.participation_source_seasons || scheme.source_seasons || []).join(', ');
    var bits = [];
    if (seasons) bits.push('Charted from the ' + seasons + ' season');
    if (scheme.charting_samples != null) bits.push(Number(scheme.charting_samples).toLocaleString('en-US') + ' charted plays');
    if (scheme.coverage_samples != null) bits.push(Number(scheme.coverage_samples).toLocaleString('en-US') + ' coverage snaps');
    return bits.join(' \u00b7 ');
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

  /* An EPA per play is a margin centred on zero, not a percentile, so it takes
     its own ramp: a tenth of a point either side of zero is the difference
     between a good offence and a bad one. */
  function epaTone(value, goodHigh) {
    var v = Number(value);
    if (!isFinite(v)) return '';
    var scaled = goodHigh ? v : -v;
    if (scaled >= 0.15) return 'c-elite';
    if (scaled >= 0.05) return 'c-good';
    if (scaled > -0.05) return 'c-mid';
    if (scaled > -0.15) return 'c-weak';
    return 'c-poor';
  }

  function epaText(value, isRate) {
    var v = Number(value);
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.0005) v = 0;
    return isRate ? (v * 100).toFixed(1) + '%' : (v > 0 ? '+' : '') + v.toFixed(3);
  }

  function confrontation(sport, game, offSide, defSide) {
    var off = ((game[offSide + '_scheme'] || {}).offense || {}).response || {};
    var def = ((game[defSide + '_scheme'] || {}).defense || {}).response || {};
    var rows = SITUATIONS.map(function (spec) {
      var a = off[spec[0]], b = def[spec[0]];
      if (a == null && b == null) return '';
      var isRate = spec[0].indexOf('success') >= 0;
      return '<tr><td><span class="ca-sit">' + esc(spec[1]) + '</span>' +
        '<span class="ca-sit__means">' + esc(spec[2]) + '</span></td>' +
        '<td class="num ' + epaTone(a, true) + '">' + esc(epaText(a, isRate)) + '</td>' +
        '<td class="num ' + epaTone(b, false) + '">' + esc(epaText(b, isRate)) + '</td></tr>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-sit-table">' +
      '<thead><tr><th>Situation</th>' +
      '<th class="num">' + esc(fullName(sport, game, offSide)) + ' Offence</th>' +
      '<th class="num">' + esc(fullName(sport, game, defSide)) + ' Defence</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function coverageMatrix(sport, game, offSide, defSide) {
    var off = ((game[offSide + '_scheme'] || {}).offense || {}).response || {};
    var defScheme = (game[defSide + '_scheme'] || {}).defense || {};
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
      var width = tendency == null ? 0 : Math.max(0, Math.min(100, Number(tendency) * 100));
      return '<div class="ca-coverage-row">' +
        '<div class="ca-coverage-result ' + epaTone(offValue, true) + '"><strong>' +
        esc(epaText(offValue, false)) + '</strong><span>Off EPA / play</span></div>' +
        '<div class="ca-coverage-look"><span>' + esc(spec[2]) + '</span>' +
        '<div class="ca-coverage-track" aria-label="' + esc(spec[2]) + ' used ' +
        esc(pctText(tendency)) + '"><i style="width:' + width.toFixed(1) + '%"></i></div>' +
        '<strong>' + esc(pctText(tendency)) + ' Used</strong></div>' +
        '<div class="ca-coverage-result ca-coverage-result--def ' + epaTone(defValue, false) + '">' +
        '<strong>' + esc(epaText(defValue, false)) + '</strong><span>EPA allowed / play</span></div>' +
        '</div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return '<div class="ca-coverage-matrix"><header><div>' +
      logo(sport, game, offSide, 32, 'ca-coverage-crest') + '<span><b>' +
      esc(fullName(sport, game, offSide)) + '</b><small>Offensive response</small></span></div>' +
      '<strong>Coverage</strong><div><span><b>' + esc(fullName(sport, game, defSide)) +
      '</b><small>Defensive tendency + allowance</small></span>' +
      logo(sport, game, defSide, 32, 'ca-coverage-crest') + '</div></header>' + rows + '</div>';
  }

  function playerCoveragePanels(sport, game, offSide) {
    var profiles = game[offSide + '_player_coverage'] || [];
    var offense = unitData(game, offSide, 'offense');
    var starterNames = {};
    ((offense || {}).players || []).forEach(function (player) {
      if (['RB', 'WR', 'TE'].indexOf(String(player.position || '').toUpperCase()) >= 0) {
        starterNames[playerNameKey(player.name)] = true;
      }
    });
    profiles = profiles.filter(function (profile) {
      return starterNames[playerNameKey(profile.player_name)];
    });
    if (!profiles.length) {
      return '<section class="ca-player-coverage"><h4>Skill Players By Coverage</h4>' +
        pending('No season-labelled player coverage splits are published for these starters.') + '</section>';
    }
    var bySeason = {};
    profiles.forEach(function (profile) {
      (bySeason[profile.source_season] = bySeason[profile.source_season] || []).push(profile);
    });
    return Object.keys(bySeason).sort().reverse().map(function (season) {
      var cards = bySeason[season].map(function (profile) {
        var splits = (profile.splits || []).filter(function (split) {
          return split.coverage !== 'all' && Number(split.targets) >= 3;
        }).sort(function (a, b) { return Number(b.targets) - Number(a.targets); }).slice(0, 5);
        if (!splits.length) return '';
        var rows = splits.map(function (split) {
          var label = String(split.coverage || '').replace(/^cover_/, 'Cover ').replace(/_/g, ' ');
          return '<tr><td>' + esc(titleCase(label)) + '</td><td class="num">' +
            esc(split.targets) + '</td><td class="num">' + esc(pctText(split.catch_rate)) +
            '</td><td class="num">' + esc(split.yards_per_target == null ? '—' :
              Number(split.yards_per_target).toFixed(1)) +
            '</td><td class="num">' + esc(epaText(split.epa_per_target, false)) + '</td></tr>';
        }).join('');
        return '<article class="ca-player-coverage-card"><header><span class="ca-lineup-player__position">' +
          esc(profile.position) + '</span><strong>' + esc(profile.player_name) + '</strong></header>' +
          '<div class="ca-lineup-scroll"><table><thead><tr><th>Coverage</th><th class="num">Tgt</th>' +
          '<th class="num">Catch</th><th class="num">Y/T</th><th class="num">EPA/T</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div></article>';
      }).filter(Boolean).join('');
      if (!cards) return '';
      return '<section class="ca-player-coverage" data-scheme-seasons="' + esc(season) + '">' +
        '<div class="ca-player-coverage__head"><div><h4>Skill Players By Coverage</h4><p>' +
        esc(fullName(sport, game, offSide)) + ' targets against charted ' + season + ' coverages</p></div>' +
        '<span>Minimum 3 targets shown</span></div><div class="ca-player-coverage-grid">' + cards +
        '</div></section>';
    }).join('');
  }

  function schemePanel(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'];
    var defScheme = game[defSide + '_scheme'];
    var offName = fullName(sport, game, offSide);
    var defName = fullName(sport, game, defSide);
    var charted = ((defScheme || {}).participation_source_seasons ||
      (defScheme || {}).source_seasons || []).join(', ');
    var panelSeasons = [].concat((offScheme || {}).participation_source_seasons ||
      (offScheme || {}).source_seasons || [],
      (defScheme || {}).participation_source_seasons ||
      (defScheme || {}).source_seasons || []).map(Number).filter(Number.isFinite)
      .filter(function (year, index, all) { return all.indexOf(year) === index; })
      .join(',');
    var head = '<section class="ca-scheme-panel" data-scheme-seasons="' +
      esc(panelSeasons) + '"><h3>' + esc(offName) +
      ' Offence Versus ' + esc(defName) + ' Defence</h3>' +
      (charted ? '<p class="ca-lineup-context">Charted ' + esc(charted) + '</p>' : '');
    if (!offScheme || !defScheme) {
      return head + pending('Charted scheme profiles are not published for this pairing.') +
        '</section>';
    }
    var defCov = (defScheme.defense || {}).coverage || {};
    var defPressure = (defScheme.defense || {}).pressure || {};
    var offPersonnel = (offScheme.offense || {}).personnel || {};
    var offResponse = (offScheme.offense || {}).response || {};
    var offTargets = (offScheme.offense || {}).target_share || {};
    var versus = confrontation(sport, game, offSide, defSide);
    var coverage = coverageMatrix(sport, game, offSide, defSide);
    var coverageNote = defCov.zone_rate == null ? '' :
      '<p class="ca-detail-source-note">' + esc(defName) + ' played zone on ' +
      pctText(defCov.zone_rate) + ' of its charted coverage snaps.</p>';

    var targets = TARGET_ROWS
      .filter(function (row) { return offTargets[row[0]] != null; })
      .map(function (row) { return { label: row[1], value: Number(offTargets[row[0]]) }; });
    var targetBlock = targets.length
      ? '<div class="ca-rate-block"><h4>Target share</h4>' +
        stackedBar(targets) +
        '<p class="ca-detail-source-note">Observed shares of charted targets. It describes ' +
        'the sample named above and says nothing about this game.</p></div>'
      : '';

    /* Two columns, split the way the confrontation is: what that defence did,
       and what this offence did. A masonry of six unequal blocks read as a
       pile; naming the two halves makes the pairing the point. */
    return head +
      '<p class="ca-lineup-context">' + esc(provenanceLine(defScheme)) + '</p>' +
      coverage + coverageNote +
      // The direct confrontation first: what this offence has done in each
      // situation, beside what the defence it meets has given up in the same
      // one. The distribution bars below say how often each look happens; this
      // says what happens when it does, which is the question a reader has.
      (versus ? '<div class="ca-sit-block"><h4>Situation By Situation</h4>' + versus +
        '<p class="ca-detail-source-note">Both columns are EPA per play from the ' +
        'offence’s point of view, so they sit on one scale: positive is good for the ' +
        'offence and bad for the defence, which is why the two grade in opposite ' +
        'directions. Success rates are shares of plays that stayed on schedule.</p></div>' : '') +
      '<div class="ca-scheme-duo">' +
      '<div class="ca-scheme-col"><h4 class="ca-scheme-col__head">' + esc(defName) +
      ' defence</h4>' +
      rateTable('Pressure', PRESSURE_ROWS, defPressure) + '</div>' +
      '<div class="ca-scheme-col"><h4 class="ca-scheme-col__head">' + esc(offName) +
      ' offence</h4>' +
      rateTable('Personnel And Formation', PERSONNEL_ROWS, offPersonnel) +
      rateTable('Response By Look', RESPONSE_ROWS, offResponse) +
      targetBlock + '</div>' +
      '</div>' + playerCoveragePanels(sport, game, offSide) + '</section>';
  }

  function formRow(entry) {
    if (!entry) return '';
    var value = Number(entry.value);
    var text = Math.abs(value) < 1 && String(entry.label).indexOf('EPA') < 0
      ? (value * 100).toFixed(1) + '%'
      : (Math.abs(value) < 1 ? epaText(value) : value.toFixed(2));
    return '<div class="ca-form-cell">' +
      '<span class="ca-form-label">' + esc(titleCase(entry.label)) + '</span>' +
      '<strong class="ca-form-value">' + esc(text) + '</strong>' +
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
    var order = ['off_epa', 'off_first_down', 'off_explosive', 'off_sack', 'off_turnover',
      'def_epa', 'def_first_down', 'def_explosive', 'def_sack', 'def_turnover'];
    var cells = order.map(function (key) { return formRow(form.rates[key]); })
      .filter(Boolean).join('');
    var plays = form.plays != null
      ? '<p class="ca-lineup-context">' + Number(form.plays).toFixed(1) + ' plays per game</p>'
      : '';
    return '<section class="ca-form-panel"><h3>' + esc(label) + '</h3>' + plays +
      '<div class="ca-form-grid">' + cells + '</div></section>';
  }

  /* Identity-only starting units arranged in formation rows. The source names
     a position and its first player; this renderer never invents a snap share. */
  function playerNameKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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
    return '<details class="ca-injury-report"><summary>Full Injury Report <span>' +
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

  var NFL_FORM_ORDER = ['off_epa', 'off_first_down', 'off_explosive', 'off_sack',
    'off_turnover', 'def_epa', 'def_first_down', 'def_explosive', 'def_sack', 'def_turnover'];

  function nflMirror(sport, game) {
    var away = ((game.away_form || {}).rates) || {};
    var home = ((game.home_form || {}).rates) || {};
    var rows = NFL_FORM_ORDER.map(function (key) {
      var entry = away[key] || home[key];
      if (!entry) return '';
      return mirrorRow(titleCase(entry.label), away[key], home[key], function (v) {
        var n = Number(v);
        if (!isFinite(n)) return '\u2014';
        // A rate under one is a share; an EPA is a per-play margin. Both are
        // published as decimals, so the label decides how to read them.
        return String(entry.label).indexOf('EPA') >= 0
          ? (n > 0 ? '+' : '') + n.toFixed(3)
          : (n * 100).toFixed(1) + '%';
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

  function nflQuickRail(sport, game) {
    var seasons = schemeSeasons(game);
    var current = currentSeason(game);
    var evidence = (seasons.length ? seasons.join('–') + ' Scheme · ' : '') +
      current + ' Form';
    return '<nav class="ca-matchup-lens" aria-label="Matchup briefing">' +
      '<a href="#availability"><span>Starting Units</span><strong>Offense + Defense</strong>' +
      '<small>Every published starter by position</small></a>' +
      '<a href="#availability"><span>Availability</span><strong>' +
      esc(game.away) + ' · ' + esc(value(game.away_availability, 'report pending')) +
      '</strong><small>' + esc(game.home) + ' · ' +
      esc(value(game.home_availability, 'report pending')) + '</small></a>' +
      '<a href="#scheme"><span>Evidence</span><strong>' + esc(evidence) +
      '</strong><small>Source seasons stay visible</small></a>' +
      '<a href="#team-context"><span>Travel</span><strong>' +
      esc(value(game.away_travel)) + '</strong><small>' +
      esc(fullName(sport, game, 'away')) + '</small></a></nav>';
  }

  function nflSections(sport, game) {
    var source = game.scheme_source || {};
    return nflQuickRail(sport, game) + [
      section('availability', 'Starting Lineups And Availability',
        'Offense, Defense And Official Designations',
        '<div class="ca-detail-duo ca-lineup-duo">' +
        lineupBoard(sport, game, 'away') +
        lineupBoard(sport, game, 'home') + '</div>' +
        '<p class="ca-detail-source-note">Designations come from the official injury report. ' +
        'A published starter absent from the injury report is marked Active; a missing report ' +
        'is marked Report Pending. Starting units follow the published depth chart and carry ' +
        'identity and position only—never a snap projection.</p>'),

      section('scheme', 'Scheme Confrontation',
        'Charted Tendencies, Each Offence Against The Other Defence',
        '<div class="ca-detail-stack-inner">' +
        schemePanel(sport, game, 'away', 'home') +
        schemePanel(sport, game, 'home', 'away') + '</div>' +
        '<p class="ca-detail-source-note" data-season-prior-only>Every rate here describes snaps that have already ' +
        'been charted, in the season named under each heading. At the start of a season that ' +
        'season is LAST season, and a prior-season rate is not a statement about this game — ' +
        'which is why the seasons are named on the control above rather than in a footnote. ' +
        'Distribution bars are shares of the charted sample and sum to 100%.</p>'),

      section('form', 'Team Form',
        'Ten Observed Rates, Graded Against The 32-Team League Pool',
        (nflMirror(sport, game) || '<div class="ca-detail-duo">' +
          nflFormPanel(sport, game, 'away') +
          nflFormPanel(sport, game, 'home') + '</div>') +
        '<p class="ca-detail-source-note">Each bar is the league percentile of the rate ' +
        'directly above it, computed from that rate against the same 32-team pool. Sacks and ' +
        'giveaways rank best when low; takeaways and sacks generated rank best when high. ' +
        (source.season ? 'Season ' + esc(source.season) +
          (source.week ? ', week ' + esc(source.week) : '') + '. ' : '') +
        'Ranks are recomputed from these rates alone, so none of them can inherit an ordering from anywhere else.</p>'),

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
        ]) + '</div>')
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
      : [['overview', 'Overview'], ['availability', 'Lineups'], ['scheme', 'Scheme'],
         ['form', 'Team Form'], ['radar', 'Radar'], ['team-context', 'Rest And Travel']];
    var html = '<a class="ca-detail-back" href="/' + sport + '/">← Back To ' + sport.toUpperCase() + ' Matchups</a>' +
      '<article class="ca-detail-hero" id="overview"><header class="ca-detail-hero__meta">' +
      '<p class="ca-detail-eyebrow">' + sport.toUpperCase() + ' · Matchup Analysis</p>' +
      '</header>' +
      '<div class="ca-detail-hero__teams">' + teamHero(sport, game, 'away') + '<div class="ca-detail-center">' +
      scoreOrTime(game) + '</div>' + teamHero(sport, game, 'home') + '</div>' +
      // Conditions live in the banner now: they are read once, at the top,
      // beside where and when - not as their own section of dimensions and
      // capacities nobody came for.
      '<div class="ca-detail-facts">' + fact('Venue', venue(game)) +
      wxFact(game) + fact('Broadcast', value(game.broadcast)) +
      fact('Status', gameStatus(game)) + '</div></article>' +
      '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
        var glyph = item[0] === 'overview' ? ico('info', 'ca-detail-nav__ico', 14)
          : (SECTION_ICON[item[0]] ? ico(SECTION_ICON[item[0]], 'ca-detail-nav__ico', 14) : '');
        return '<a href="#' + item[0] + '">' + glyph + item[1] + '</a>';
      }).join('') + '</nav>' + (sport === 'nfl' ? seasonToggle(game) : '') +
      '<div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra) : nflSections(sport, game)) +
      '</div>';
    host.innerHTML = html;
    host.setAttribute('data-state', 'ready');
    // Delegated once on the host, so a repainted section keeps working.
    if (!host.dataset.seasonWired) {
      wireSeasonToggle(host);
      wireLineupTabs(host);
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

        // Stage 3 - bullpen workload, then one bulk call for those arms.
        // The second request earns its place: saves, holds and games finished
        // are what say which of these men is the closer and which is the long
        // man, and neither is derivable from a pitch count.
        Promise.all([
          loadBullpen(game.away_team_id, game.away, dateIso),
          loadBullpen(game.home_team_id, game.home, dateIso)
        ]).then(function (reports) {
          extra.awayBullpen = reports[0] || { used: [], games: 0, window: 'window not published' };
          extra.homeBullpen = reports[1] || { used: [], games: 0, window: 'window not published' };
          paintSection(host, 'bullpens', bullpenBody(sport, game, extra));
          var ids = [];
          [extra.awayBullpen, extra.homeBullpen].forEach(function (report) {
            report.used.forEach(function (rec) { ids.push(rec.id); });
          });
          return loadPeople(ids, 'pitching', season);
        }).then(function (quality) {
          extra.bullpenQuality = quality || {};
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
