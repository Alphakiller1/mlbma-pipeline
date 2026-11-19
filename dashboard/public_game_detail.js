/** Public factual game detail for MLB and NFL. */
(function (global) {
  'use strict';

  var availability = global.ChasePlayerAvailability;

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
    if (sport === 'cbb') return '<span class="ca-team-logo-placeholder" aria-hidden="true"></span>';
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
    if (state === 'canceled') return 'Canceled';
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
    'club-splits': 'users', 'pitch-matchup': 'target', bvp: 'lineup', 'runs-hand': 'trend', series: 'calendar',
    recent: 'calendar', form: 'trend', radar: 'gauge', bullpens: 'users',
    availability: 'whistle', scheme: 'football', 'team-context': 'plane', 'run-game': 'football',
    'def-tendencies': 'target',
    projection: 'target', clash: 'football', players: 'users',
    efficiency: 'trend', quarterbacks: 'football', coverage: 'target', looks: 'target',
    rushing: 'football', trenches: 'users', receivers: 'users', strength: 'gauge', 'cfb-strength': 'gauge', 'position-coverage': 'target', redzone: 'target',
    tendencies: 'lineup', 'game-log': 'calendar', pace: 'trend',
    'cfb-efficiency': 'trend', 'cfb-passing': 'football', 'cfb-rushing': 'football',
    'cfb-rushers': 'users', 'cfb-quarterbacks': 'football', 'cfb-situational': 'target',
    'cfb-game-log': 'calendar', 'cfb-schedule': 'calendar', 'cfb-availability': 'whistle',
    'cfb-special': 'target',
    'nba-ratings': 'gauge', 'nba-efficiency': 'trend', 'nba-shooting': 'target',
    'nba-rotation': 'users', 'nba-availability': 'whistle', 'nba-game-log': 'calendar',
    'nba-shot-chart': 'target', 'nba-shot-kinds': 'target', 'nba-play-types': 'lineup', 'nba-defenders': 'users',
    'nba-size': 'users', 'nba-tracking': 'gauge', 'nba-style': 'whistle', 'nba-scheme': 'lineup', 'nba-regression': 'trend',
    'nba-shooter-regression': 'trend', 'nba-player-types': 'users', 'nba-player-zones': 'target',
    'nba-player-bio': 'users', 'nba-schedule': 'plane', 'nba-edge-map': 'target', 'nba-fingerprint': 'lineup',
    'nba-tape': 'gauge', 'nba-aging': 'trend', 'nba-shot-maps': 'target', 'nba-onfloor': 'users',
    'special-teams': 'football', situational: 'target', 'cfb-receivers': 'users', 'cfb-defenders': 'users',
    'cbb-resume': 'gauge', 'cbb-regression': 'trend', 'cbb-schedule': 'plane',
    'nba-lineups': 'lineup', 'nba-splits': 'trend'
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

  function paintSection(host, id, body) {
    var node = host.querySelector('[data-body="' + id + '"]');
    if (node) node.innerHTML = body;
    if (id === 'radar') fitRadar(host);
    if (id === 'pitch-matchup') applyPitchMetric(host);
    if (id === 'bvp') applyBvpView(host);
    if (id === 'form') applyFormSplit(host);
    if (id === 'runs-hand') applyRunsHand(host);
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
      // FIP less its league constant; the page adds the season's constant
      // from the bullpen board so it sits on the league's own scale.
      fipRaw: sums.outs
        ? (13 * sums.hr + 3 * (sums.bb + sums.hbp) - 2 * sums.so) / (sums.outs / 3) : null,
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
        loadPeople(ids, 'pitching', season, 'vr'),
        // Late and close, and runners in scoring position: the two
        // situations a pen is brought in for.
        loadPeople(ids, 'pitching', season, 'lc'),
        loadPeople(ids, 'pitching', season, 'risp')
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
          lc: bullpenStatTotal(packs[4], reliefIds),
          risp: bullpenStatTotal(packs[5], reliefIds),
          // Each arm's own line on every split, for the reliever table.
          byArm: { season: packs[0], site: packs[1], vl: packs[2], vr: packs[3],
                   lc: packs[4], risp: packs[5] },
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

  /* Every hitter against every pitch type, each placed among the hitters who
     have seen that pitch type (scripts/publish_public_matchup_depth.py). */
  var RUNS_BY_HAND_URL = '/data/public/team_runs_by_hand.json';
  var runsByHandPromise = null;

  function loadRunsByHand() {
    if (runsByHandPromise) return runsByHandPromise;
    runsByHandPromise = fetchJson(RUNS_BY_HAND_URL).catch(function () { return null; });
    return runsByHandPromise;
  }

  var INDEX_SPLITS_URL = '/data/public/team_index_splits.json';
  var indexSplitsPromise = null;

  function loadIndexSplits() {
    if (indexSplitsPromise) return indexSplitsPromise;
    indexSplitsPromise = fetchJson(INDEX_SPLITS_URL).catch(function () { return null; });
    return indexSplitsPromise;
  }

  var BATTER_PITCH_URL = '/data/public/batter_pitch_types.json';
  var batterPitchPromise = null;

  function loadBatterPitch() {
    if (batterPitchPromise) return batterPitchPromise;
    batterPitchPromise = fetchJson(BATTER_PITCH_URL).catch(function () { return null; });
    return batterPitchPromise;
  }

  /* League pools the bullpen section grades against: every qualified reliever
     and the thirty pens as rostered now, per split, plus the season's FIP
     constant. No player lines - those come live from the Stats API. */
  var BULLPEN_BOARD_URL = '/data/public/bullpen_board.json';
  var bullpenBoardPromise = null;

  function loadBullpenBoard() {
    if (bullpenBoardPromise) return bullpenBoardPromise;
    bullpenBoardPromise = fetchJson(BULLPEN_BOARD_URL).catch(function () { return null; });
    return bullpenBoardPromise;
  }

  /* Every hitter's history against one pitcher, for a whole lineup in one
     request: each season he faced him, regular season and postseason apart,
     summed here into a career line (both), a postseason line, and the
     seasons. Rates are recomputed from the summed counts, never averaged. */
  var BVP_COUNTS = ['plateAppearances', 'atBats', 'hits', 'doubles', 'triples', 'homeRuns',
    'baseOnBalls', 'intentionalWalks', 'hitByPitch', 'strikeOuts', 'sacFlies', 'rbi'];
  var POSTSEASON_TYPES = { F: true, D: true, L: true, W: true };

  function bvpLine(stats) {
    var line = {};
    BVP_COUNTS.forEach(function (key) {
      line[key] = stats.reduce(function (sum, st) { return sum + (Number(st[key]) || 0); }, 0);
    });
    var singles = line.hits - line.doubles - line.triples - line.homeRuns;
    var tb = singles + 2 * line.doubles + 3 * line.triples + 4 * line.homeRuns;
    var obpDen = line.atBats + line.baseOnBalls + line.hitByPitch + line.sacFlies;
    line.avg = line.atBats ? line.hits / line.atBats : null;
    line.obp = obpDen ? (line.hits + line.baseOnBalls + line.hitByPitch) / obpDen : null;
    line.slg = line.atBats ? tb / line.atBats : null;
    line.ops = line.obp != null && line.slg != null ? line.obp + line.slg : null;
    return line;
  }

  function loadVsPitcher(batterIds, pitcherId) {
    var ids = (batterIds || []).filter(Boolean);
    if (!ids.length || !pitcherId) return Promise.resolve({});
    return fetchJson('https://statsapi.mlb.com/api/v1/people?personIds=' + ids.join(',') +
      '&hydrate=stats(group=[hitting],type=[vsPlayer],opposingPlayerId=' + pitcherId +
      ',sportId=1,gameType=[R,F,D,L,W])').then(function (payload) {
      var out = {};
      (payload.people || []).forEach(function (person) {
        var rows = [];
        (person.stats || []).forEach(function (block) {
          if (((block.type || {}).displayName || '') !== 'vsPlayer') return;
          (block.splits || []).forEach(function (split) {
            if (split && split.stat) {
              rows.push({ season: String(split.season || ''), post: !!POSTSEASON_TYPES[split.gameType],
                          stat: split.stat });
            }
          });
        });
        if (!rows.length) { out[person.id] = null; return; }
        var post = rows.filter(function (r) { return r.post; });
        var bySeason = {};
        rows.forEach(function (r) { (bySeason[r.season] = bySeason[r.season] || []).push(r); });
        out[person.id] = {
          total: bvpLine(rows.map(function (r) { return r.stat; })),
          post: post.length ? bvpLine(post.map(function (r) { return r.stat; })) : null,
          seasons: Object.keys(bySeason).sort().reverse().map(function (season) {
            var group = bySeason[season];
            return { season: season, post: group.some(function (r) { return r.post; }),
                     line: bvpLine(group.map(function (r) { return r.stat; })) };
          })
        };
      });
      return out;
    }).catch(function () { return {}; });
  }

  /* When the order is not posted, the section still shows the club's starting
     nine: the active-roster position players who have started most often in
     the club's last ten completed games, in the lineup spot they usually hold.
     Bench players stay out. Starts and spots are read off each box score's
     batting order, where a starter's slot is a multiple of 100 (100-900) and
     a substitute's is not. */
  var LIKELY_STARTER_GAMES = 10;

  function loadRosterHitters(teamId, dateIso, season) {
    if (!teamId) return Promise.resolve(null);
    var roster = fetchJson('https://statsapi.mlb.com/api/v1/teams/' + teamId +
      '/roster?rosterType=active' + (dateIso ? '&date=' + encodeURIComponent(dateIso) : ''))
      .then(function (payload) {
        return (payload.roster || []).filter(function (row) {
          return row && row.person && row.person.id && (row.position || {}).type !== 'Pitcher';
        }).map(function (row) { return row.person.id; });
      });
    var starts = fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + teamId +
      '&startDate=' + isoDaysBefore(dateIso, 21) + '&endDate=' + isoDaysBefore(dateIso, 1))
      .then(function (payload) {
        var finals = [];
        (payload.dates || []).forEach(function (block) {
          (block.games || []).forEach(function (g) {
            if (((g.status || {}).detailedState || '') === 'Final') finals.push(g.gamePk);
          });
        });
        return Promise.all(finals.slice(-LIKELY_STARTER_GAMES).map(function (pk) {
          return fetchJson('https://statsapi.mlb.com/api/v1/game/' + pk + '/boxscore')
            .catch(function () { return null; });
        }));
      }).then(function (boxes) {
        var tally = {};
        boxes.filter(Boolean).forEach(function (box) {
          ['away', 'home'].forEach(function (key) {
            var team = (box.teams || {})[key] || {};
            if (String((team.team || {}).id) !== String(teamId)) return;
            Object.keys(team.players || {}).forEach(function (slot) {
              var player = team.players[slot];
              var order = Number(player.battingOrder);
              if (!order || order % 100) return;
              var rec = tally[player.person.id] || (tally[player.person.id] = { starts: 0, slots: 0 });
              rec.starts += 1;
              rec.slots += order / 100;
            });
          });
        });
        return tally;
      });
    return Promise.all([roster, starts]).then(function (parts) {
      var tally = parts[1];
      var nine = parts[0].filter(function (id) { return tally[id]; })
        .sort(function (a, b) { return tally[b].starts - tally[a].starts; })
        .slice(0, 9)
        .sort(function (a, b) {
          return tally[a].slots / tally[a].starts - tally[b].slots / tally[b].starts;
        });
      return loadPeople(nine, 'hitting', season).then(function (people) {
        return nine.map(function (id) {
          var person = people[id] || {};
          return { id: id, name: person.name || '', bats: person.bats || '',
                   starts: tally[id].starts };
        });
      });
    }).catch(function () { return null; });
  }

  /* This season's meetings between the two clubs, and - in October - where the
     series stands. Both are read off the official schedule. */
  function loadSeries(game, season) {
    var a = game.away_team_id, h = game.home_team_id;
    if (!a || !h) return Promise.resolve(null);
    var meetings = fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + a +
      '&opponentId=' + h + '&season=' + season + '&gameType=R').then(function (payload) {
      var out = [];
      (payload.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (g) {
          if (((g.status || {}).detailedState || '') !== 'Final') return;
          var t = g.teams || {};
          var awayId = ((t.away || {}).team || {}).id;
          var mine = awayId === a ? t.away : t.home;
          var theirs = awayId === a ? t.home : t.away;
          out.push({ date: g.officialDate || block.date, awayHosted: awayId !== a,
                     scored: mine.score, allowed: theirs.score, won: !!mine.isWinner });
        });
      });
      return out.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
    }).catch(function () { return []; });
    var status = game.game_pk
      ? fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=' + game.game_pk +
        '&hydrate=seriesStatus').then(function (payload) {
          var g = ((payload.dates || [])[0] || {}).games || [];
          g = g[0] || {};
          return ['F', 'D', 'L', 'W'].indexOf(g.gameType) >= 0 ? (g.seriesStatus || null) : null;
        }).catch(function () { return null; })
      : Promise.resolve(null);
    return Promise.all([meetings, status]).then(function (parts) {
      return { meetings: parts[0], status: parts[1] };
    });
  }

  /* A batting-order entry names its hitter as `person_id` / `name` in the slate
     published from the official schedule, and as `id` / `fullName` in the
     older CSV-projected slate. Every reader goes through these two, so a shape
     change upstream cannot blank the lineup tables again. */
  function lineupId(pl) {
    return pl ? (pl.id || pl.person_id || null) : null;
  }

  function lineupName(pl) {
    return pl ? (pl.fullName || pl.name || '') : '';
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

  function rankPosition(entry, maxOf) {
    if (!entry) return null;
    var rank = Number(entry.rank != null ? entry.rank : entry.place);
    var of = Number(entry.of);
    if (!Number.isInteger(rank) || !Number.isInteger(of) || of < 2 ||
        rank < 1 || rank > of || (maxOf != null && of > maxOf)) return null;
    return { rank: rank, of: of };
  }

  function rankLabel(place, cohort) {
    return place.rank + ordinal(place.rank) + ' of ' + place.of + (cohort ? ' ' + cohort : '');
  }

  /* The bar is the league percentile of the value beside it and nothing else.
     Rank 1 of 30 fills it, rank 30 of 30 empties it. It never encodes a
     rating, a projection, or an ordering borrowed from anywhere else. */
  /* One place that decides what a rank's colour means, so a 4th of 30 looks the
     same wherever it appears. The number is always printed, so the colour is a
     second reading of a fact that is already legible without it. */
  function rankTone(rank, of) {
    var A = global.MLBMAAssets;
    var place = rankPosition({ rank: rank, of: of });
    return place && A && A.rankChipClass ? A.rankChipClass(place.rank, place.of) : '';
  }

  function rankBadge(entry, tone, label, extraClass, percentile) {
    var place = rankPosition(entry);
    if (!place) return '';
    var words = label || rankLabel(place, entry.cohort);
    var mark = percentile == null ? place.rank + ordinal(place.rank) : percentile + '%ile';
    var data = percentile == null ? ' data-rank="' + place.rank + '" data-rank-of="' + place.of + '"'
      : ' data-percentile="' + percentile + '"';
    return '<span class="ca-rank ' + (tone || rankTone(place.rank, place.of)) +
      (extraClass ? ' ' + extraClass : '') + '"' + data +
      ' title="' + esc(words) + '" aria-label="' + esc(words) + '">' + mark + '</span>';
  }

  /* A game-log figure is placed among that week's team-games, a pool that can
     outnumber the league's teams. It prints on the league's own scale - the
     same share of the pool ahead of it, read as a place among the teams - so
     no place runs past the number of teams (owner 2026-11-13). {rank, of,
     pool}; a pool no larger than the league prints as it is. */
  function teamScaled(rank, of, teams) {
    var place = rankPosition({ rank: rank, of: of });
    if (!place || !(teams > 1)) return null;
    if (place.of <= teams) return { rank: place.rank, of: place.of, pool: null };
    return { rank: 1 + Math.round((place.rank - 1) * (teams - 1) / (place.of - 1)), of: teams, pool: place.of };
  }
  function teamScaledLabel(place, raw, cohort, poolLabel) {
    return rankLabel(place, cohort) +
      (place.pool ? ' · ' + raw + ordinal(raw) + ' of ' + place.pool + ' ' + poolLabel : '');
  }

  // The rank pill for either shape a place comes in: {rank, of} or {place, of}.
  function nflBadge(r, cohort) {
    var place = rankPosition(r);
    return place ? rankBadge(r, '', cohort ? rankLabel(place, cohort) : '') : '';
  }

  function percentBar(rank, of) {
    var place = rankPosition({ rank: rank, of: of });
    if (!place) return '';
    var pct = Math.round(((place.of - place.rank) / (place.of - 1)) * 100);
    return segmentedMeter(pct, rankTone(place.rank, place.of), pct +
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
    var place = rankPosition(entry);
    return place ? ((place.of - place.rank) / (place.of - 1)) * 100 : null;
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
        var shown = formatStat(v, spec.digits);
        return shown ? shown + (spec.suffix || '') : '\u2014';
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
    // No official probable: the slate named RotoWire's listed arm instead.
    var role = String(game[side + '_starter_role'] || '').toLowerCase();
    var roleLabel = role === 'primary' ? 'Primary' : (role === 'projected' ? 'Projected' : '');
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
      '<div><p class="ca-starter-team">' + esc(label) + (handLabel ? ' \u00b7 ' + handLabel : '') +
        (roleLabel ? ' \u00b7 ' + roleLabel : '') + '</p>' +
      '<h3 class="ca-starter-name">' + esc(name) + '</h3></div></header>' +
      (headline ? '<div class="ca-stat-row">' + headline + '</div>' : '') +
      lastHtml + splitHtml + '</section>';
  }

  /* The centrepiece: one lineup against the other side's arm, with the context
     the fixture already resolves stated rather than left to a filter. */
  function lineupPanel(sport, game, side, people, oppLabel, oppHand, extra) {
    var posted = game[side + '_lineup'] || [];
    // No order posted: the likely starting nine stand in, in their usual spots.
    var roster = (extra || {})[side + 'RosterHitters'];
    var players = posted.length ? posted : (roster || []).map(function (h) {
      return { id: h.id, fullName: h.name };
    });
    var teamLabel = fullName(sport, game, side);
    // The heading names the split the numbers actually are. It used to name the
    // opposing starter, which reads as "this lineup against this man" while the
    // figures underneath were season totals against everyone.
    var handLabel = oppHand === 'L' ? 'Left-Handed Pitching'
      : (oppHand === 'R' ? 'Right-Handed Pitching' : 'All Pitching');
    var context = teamLabel + ' \u00b7 ' + (side === 'away' ? 'Away' : 'Home') +
      ' \u00b7 ' + handLabel + ' \u00b7 ' + seasonOf(game.kickoff_utc) + ' Season' +
      (oppLabel ? ' \u00b7 ' + oppLabel + ' Starts' : '');

    if (!players.length && !posted.length && roster === undefined) {
      return '<section class="ca-lineup-panel"><h3 class="ca-lineup-head">' +
        logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>Versus ' +
        esc(handLabel) + '</span></h3>' + pending('Likely starters are loading.') + '</section>';
    }
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
      var person = people[lineupId(pl)] || {};
      var stat = person.stat || {};
      function cell(key, context) {
        var v = stat[key];
        if (v == null) return '<td class="num">&mdash;</td>';
        return '<td class="num ' + gradeFor(v, 'bat_' + split + '_' + context) + '">' + esc(v) + '</td>';
      }
      return '<tr>' +
        '<td class="ca-lineup-slot">' + (i + 1) + '</td>' +
        '<td class="ca-lineup-name">' + esc(person.name || lineupName(pl)) + '</td>' +
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
      '</section>';
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
    // Pitch-mix numbers keep their place; other player stats are colour only.
    var tone = percentileClass(entry.percentile);
    return '<td class="num ' + tone + '">' + esc((v > 0 ? '+' : '') + v.toFixed(1)) +
      percentileBadge(entry.percentile) + '</td>';
  }

  /* The starter's strikeout rate on this pitch, graded as a percentile of
     every pitcher throwing the same pitch type (pitch-mix numbers keep their
     pill). */
  function kCell(entry) {
    if (!entry || entry.value == null) return '<td class="num ca-vs-none">No PA</td>';
    var tone = percentileClass(entry.percentile);
    return '<td class="num ' + tone + '">' + esc(Number(entry.value).toFixed(1)) + '%' +
      percentileBadge(entry.percentile) + '</td>';
  }

  function opponentCell(entry, format) {
    if (!entry || entry.value == null) return '<td class="num ca-vs-none">Few Seen</td>';
    var tone = rankTone(entry.rank, entry.of);
    return '<td class="num ' + tone + '">' + esc(format(Number(entry.value))) +
      rankBadge(entry) + '</td>';
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
        '<td class="num">' + (isFinite(row.speed) ? row.speed.toFixed(1) : '\u2014') + '</td>' +
        rvCell(rv) + kCell(rv && rv.k_percent) +
        // The value takes the same grade as its rank pill, so the colour reads
        // on the figure and not only on the badge beside it.
        opponentCell(opp && opp.xwoba, function (v) { return formatStat(v, 3); }) +
        opponentCell(opp && opp.batting_avg, function (v) { return formatStat(v, 3); }) +
        opponentCell(opp && opp.contact_rate, function (v) { return v.toFixed(1) + '%'; }) +
        '</tr>';
    }).join('');

    return head +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-arsenal-table">' +
      '<thead><tr><th>Pitch</th><th class="num">Usage</th>' +
      '<th class="num">MPH</th><th class="num">RV/100</th>' +
      '<th class="num">K%</th>' +
      '<th class="num">' + esc(oppLabel) + ' xwOBA</th>' +
      '<th class="num">' + esc(oppLabel) + ' AVG</th>' +
      '<th class="num">Contact</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '</section>';
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
                game.weather_cond || '', game.weather_wind || '',
                game.weather_precip_pct >= 20 ? game.weather_precip_pct + '% Precip' : ''].filter(Boolean);
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
      '</div>' : '') +
      '<div class="ca-detail-facts">' +
      fact('Venue', venue(game)) +
      (tile ? '' : fact('Weather', conditions(game))) +
      fact('Surface', info.turfType || value(game.surface)) +
      fact('Roof', info.roofType || 'Not Published') +
      fact('Capacity', info.capacity != null ? Number(info.capacity).toLocaleString('en-US') : 'Not Published') +
      fact('Elevation', loc.elevation != null ? loc.elevation + ' ft' : 'Not Published') +
      fact('Outfield', dims.length === 5 ? dims.join(' \u00b7 ') + ' ft' : 'Not Published') +
      parkFact(game) +
      fact('Start', clock(game.kickoff_utc)) + '</div>';
  }

  function bullpenIp(outs) {
    outs = Number(outs) || 0;
    return Math.floor(outs / 3) + '.' + (outs % 3);
  }

  function bullpenRate(value, digits, suffix) {
    if (value == null || !isFinite(Number(value))) return '&mdash;';
    return esc(Number(value).toFixed(digits)) + (suffix || '');
  }

  /* A pitching rate's place in a sorted league pool. Lower is better for
     everything a pitcher allows, higher for strikeouts. An arm
     or pen that is not in the pool (too few batters on that split) is placed
     against it all the same, so no number on the table is left ungraded. */
  var PITCHING_HIGH = { k_pct: true };

  function poolPlace(pool, value, metric) {
    var v = Number(value);
    if (!pool || pool.length < 2 || value == null || !isFinite(v)) return null;
    var higher = !!PITCHING_HIGH[metric];
    var ahead = 0;
    for (var i = 0; i < pool.length; i++) {
      if (higher ? pool[i] > v : pool[i] < v) ahead++;
    }
    return { rank: Math.min(pool.length, ahead + 1), of: pool.length };
  }

  function gradedCell(value, digits, suffix, place, withBadge) {
    if (value == null || !isFinite(Number(value))) return '<td class="num">&mdash;</td>';
    var tone = place ? rankTone(place.rank, place.of) : '';
    var shown = digits === 3 ? formatStat(value, 3) : Number(value).toFixed(digits);
    // Club cells print their place; player cells are graded by colour only.
    return '<td class="num ' + tone + '">' + esc(shown) + (suffix || '') +
      (withBadge && place ? rankBadge(place) : '') + '</td>';
  }

  // Unit-table row key -> the split its league pool is published under.
  var UNIT_SPLIT = { overall: 'season', vsL: 'vl', vsR: 'vr', lc: 'lc', risp: 'risp' };
  // FIP, not ERA: the Stats API publishes no earned runs on the hand and
  // situation splits, and FIP is built from counts every split carries.
  // Season ERA is carried, graded, on the sample line above the table.
  var UNIT_COLUMNS = [
    ['fip', 'fip', 2, ''], ['whip', 'whip', 2, ''], ['ops', 'ops', 3, ''],
    ['kPct', 'k_pct', 1, '%'], ['bbPct', 'bb_pct', 1, '%'], ['hr9', 'hr9', 2, '']
  ];

  function bullpenSplitPanel(sport, game, side, unit, board) {
    var club = fullName(sport, game, side);
    var head = '<article class="ca-bullpen-splits"><header class="ca-bullpen-splits__head">' +
      logo(sport, game, side, 40, 'ca-bullpen-splits__logo') + '<div><h3>' + esc(club) +
      '</h3><p>' + (side === 'away' ? 'Away bullpen · road split highlighted' :
        'Home bullpen · home split highlighted') + '</p></div></header>';
    if (unit === undefined) return head + pending('Bullpen splits are loading.') + '</article>';
    if (!unit || !unit.overall) {
      return head + pending('Active bullpen split record is not published for this game.') + '</article>';
    }
    var pools = (board && board.units) || {};
    var constant = board && board.fip_constant;
    var siteSplit = side === 'away' ? 'a' : 'h';
    var rows = [
      ['overall', 'Full Season', unit.overall, false],
      ['site', side === 'away' ? 'On Road' : 'At Home', unit.site, true],
      ['vsL', 'Vs LHB', unit.vsL, false],
      ['vsR', 'Vs RHB', unit.vsR, false],
      ['lc', 'Late & Close', unit.lc, false],
      ['risp', 'With RISP', unit.risp, false]
    ].map(function (row) {
      var stat = row[2];
      if (!stat) return '';
      if (stat.fipRaw != null && constant != null) stat.fip = stat.fipRaw + constant;
      var pool = pools[row[0] === 'site' ? siteSplit : UNIT_SPLIT[row[0]]] || {};
      return '<tr' + (row[3] ? ' class="is-matchup"' : '') + '><th scope="row">' +
        esc(row[1]) + (row[3] ? ' <span>Tonight</span>' : '') + '</th>' +
        UNIT_COLUMNS.map(function (col) {
          var v = stat[col[0]];
          return gradedCell(v, col[2], col[3], poolPlace(pool[col[1]], v, col[1]), true);
        }).join('') +
        '<td class="num">' + esc(bullpenIp(stat.outs)) + '</td></tr>';
    }).join('');
    var era = unit.overall.era;
    var eraPlace = poolPlace((pools.season || {}).era, era, 'era');
    var sample = (era != null
      ? '<span class="' + (eraPlace ? rankTone(eraPlace.rank, eraPlace.of) : '') + '">ERA ' +
        esc(Number(era).toFixed(2)) + (eraPlace ? rankBadge(eraPlace) : '') + '</span> · ' : '') +
      esc(unit.overall.arms + ' active relievers · ' +
        Number(unit.overall.apps || 0).toLocaleString('en-US') + ' appearances · ' +
        bullpenIp(unit.overall.outs) + ' IP');
    return head + '<p class="ca-bullpen-splits__sample">' + sample + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-bullpen-split-table"><thead><tr>' +
      '<th>Split</th><th class="num">FIP</th><th class="num">WHIP</th>' +
      '<th class="num">OPS</th><th class="num">K%</th><th class="num">BB%</th>' +
      '<th class="num">HR/9</th><th class="num">IP</th></tr></thead><tbody>' +
      rows + '</tbody></table></div></article>';
  }

  function bullpenQualityBody(sport, game, extra) {
    return '<div class="ca-detail-duo ca-bullpen-split-grid">' +
      bullpenSplitPanel(sport, game, 'away', extra.awayBullpenUnit, extra.bullpenBoard) +
      bullpenSplitPanel(sport, game, 'home', extra.homeBullpenUnit, extra.bullpenBoard) + '</div>';
  }

  /* Every arm in the active pen on one row: his role, his season, and the two
     platoon and two leverage splits, each graded against the league's
     relievers on that same split. Closer first, then set-up, then by innings. */
  var ROLE_ORDER = { 'Closer': 0, 'Set-Up': 1, 'Middle': 2, 'Long': 3 };
  var ARM_COLUMNS = [
    // [split, rate key, pool metric, digits, suffix, header]
    ['season', 'era', 'era', 2, '', 'ERA'],
    ['season', 'fip', 'fip', 2, '', 'FIP'],
    ['season', 'whip', 'whip', 2, '', 'WHIP'],
    ['season', 'kPct', 'k_pct', 1, '%', 'K%'],
    ['season', 'bbPct', 'bb_pct', 1, '%', 'BB%'],
    ['vl', 'ops', 'ops', 3, '', 'OPS Vs L'],
    ['vr', 'ops', 'ops', 3, '', 'OPS Vs R'],
    ['lc', 'ops', 'ops', 3, '', 'Late & Close'],
    ['risp', 'ops', 'ops', 3, '', 'RISP']
  ];

  function reliefArmsPanel(sport, game, side, unit, board) {
    var label = fullName(sport, game, side);
    var head = '<section class="ca-lineup-panel ca-relief-arms"><h3 class="ca-lineup-head">' +
      logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>' + esc(label) +
      ' Relievers</span></h3>';
    if (unit === undefined) return head + pending('Relievers are loading.') + '</section>';
    if (!unit || !unit.ids || !unit.ids.length) {
      return head + pending('Active relievers are not published for this game.') + '</section>';
    }
    var pools = (board && board.relievers) || {};
    var constant = board && board.fip_constant;
    var arms = unit.ids.map(function (id) {
      var person = (unit.byArm.season || {})[id] || {};
      var lines = {};
      Object.keys(unit.byArm).forEach(function (split) {
        lines[split] = bullpenStatTotal(unit.byArm[split], [id]);
      });
      Object.keys(lines).forEach(function (split) {
        var line = lines[split];
        if (line && line.fipRaw != null && constant != null) line.fip = line.fipRaw + constant;
      });
      return { id: id, name: person.name || '', throws: person.throws || '',
               role: relieverRole(person.stat), lines: lines };
    }).filter(function (arm) { return arm.lines.season; });
    arms.sort(function (a, b) {
      var ra = ROLE_ORDER[a.role] != null ? ROLE_ORDER[a.role] : 9;
      var rb = ROLE_ORDER[b.role] != null ? ROLE_ORDER[b.role] : 9;
      return ra - rb || b.lines.season.outs - a.lines.season.outs;
    });
    var rows = arms.map(function (arm) {
      var season = arm.lines.season;
      return '<tr><td class="ca-lineup-name">' + esc(arm.name) +
        (arm.role ? ' <span class="ca-role" data-role="' + esc(arm.role.toLowerCase()) + '">' +
          esc(arm.role) + '</span>' : '') + '</td>' +
        '<td class="ca-lineup-bats">' + esc(arm.throws || '—') + '</td>' +
        '<td class="num">' + esc(season.apps || 0) + '</td>' +
        '<td class="num">' + esc(bullpenIp(season.outs)) + '</td>' +
        ARM_COLUMNS.map(function (col) {
          var line = arm.lines[col[0]];
          // An arm who has not faced a batter in a split has a count, not a rate.
          if (!line) return '<td class="num ca-vs-none">0 BF</td>';
          var v = line[col[1]];
          return gradedCell(v, col[3], col[4],
            poolPlace((pools[col[0]] || {})[col[2]], v, col[2]), false);
        }).join('') + '</tr>';
    }).join('');
    return head + '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-relief-table">' +
      '<thead><tr><th>Pitcher</th><th class="ca-lineup-bats">T</th><th class="num">G</th>' +
      '<th class="num">IP</th>' + ARM_COLUMNS.map(function (col) {
        return '<th class="num">' + esc(col[5]) + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  /* Pitch codes with no league row: pitch-outs, unknowns. */
  var UNTRACKED_PITCH = { PO: true, UN: true, UNK: true, AB: true, IN: true };

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
        // A day off prints 0 on the dim p-zero shade: still a fact, and quiet
        // enough that the days with work stand out (no dash cells, owner rule).
        return '<td class="num ca-pc ' + pitchLoad(n) + '">' +
          n + '</td>';
      }).join('');
      // A zero total reads the same way a zero day does, so the summary
      // columns and the grid speak the same language.
      function totalCell(n, days) {
        return '<td class="num ca-pc-total ' + loadTotal(n, days) + '">' +
          n + '</td>';
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
      starterPanel(sport, game, 'home', people, extra.starterSplits) + '</div>';
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
    '&sitCodes=h,a,vl,vr,sp,rp,risp,risp2,lc&group=hitting&season={season}&gameType=R';

  /* `sp` and `rp` are the same split endpoint's own codes for the two halves of
     a pitching staff. A club's line against relievers is a different number
     from its line against starters - different stuff, different leverage, and
     often a different half of the lineup - and it is the one that says what
     happens after the starter this page is about comes out. */
  var TEAM_SPLIT_ROWS = [
    ['h', 'At Home'], ['a', 'On The Road'],
    ['vl', 'Vs LHP'], ['vr', 'Vs RHP'],
    ['sp', 'Vs Starters'], ['rp', 'Vs Bullpens'],
    // With runners in scoring position, with two out, and late in a close
    // game - each graded against the thirty clubs on that same split.
    ['risp', 'With RISP'], ['risp2', 'RISP, 2 Outs'], ['lc', 'Late & Close']
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

  function teamSplitPanel(sport, game, side, splits, extra) {
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
      // One decimal always, so 9.0% never prints as "9%" beside 9.3%.
      var kPct = pa ? ((Number(st.strikeOuts) / pa) * 100).toFixed(1) : null;
      var bbPct = pa ? ((Number(st.baseOnBalls) / pa) * 100).toFixed(1) : null;
      // Each split grades against the thirty clubs on that same split.
      var tm = 'tm_' + spec[0] + '_';
      return '<tr><td>' + esc(spec[1]) + '</td>' +
        cell(st.avg, tm + 'avg') + cell(st.obp, tm + 'obp') + cell(st.slg, tm + 'slg') +
        cell(st.ops, tm + 'ops') +
        cell(st.homeRuns, tm + 'hr') +
        cell(kPct, tm + 'kpct', '%') + cell(bbPct, tm + 'bbpct', '%') +
        '<td class="num">' + esc(pa || '—') + '</td></tr>';
    }).filter(Boolean).join('');
    if (!rows) return head + pending('Club splits are not published for this season.') + '</section>';
    return head + '<div class="ca-lineup-scroll">' +
      '<table class="ca-lineup-table ca-split-table"><thead><tr><th>Split</th>' +
      '<th class="num">AVG</th><th class="num">OBP</th><th class="num">SLG</th>' +
      '<th class="num">OPS</th><th class="num">HR</th><th class="num">K%</th>' +
      '<th class="num">BB%</th><th class="num">PA</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' + indexSplitTable(sport, game, side, extra) + '</section>';
  }

  /* The club's own offensive indices - OSI and the three it is built from -
     for the season and on each split the pipeline has current, each ranked
     among the thirty clubs. The hand and the park the club meets tonight are
     marked. A split only appears when its source is current
     (scripts/publish_public_matchup_depth.py MAX_SOURCE_AGE_DAYS). */
  var INDEX_KEYS = [['osi', 'OSI'], ['abq', 'ABQ'], ['rcv', 'RCV'], ['obr', 'OBR']];
  var INDEX_ROWS = [
    ['vs_rhp', 'Vs RHP'], ['vs_lhp', 'Vs LHP'], ['home', 'At Home'], ['away', 'On The Road'],
    ['l30', 'Last 30 Days'], ['l14', 'Last 14 Days'], ['l7', 'Last 7 Days']
  ];

  function indexSplitTable(sport, game, side, extra) {
    extra = extra || {};
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var code = canon(game[side]);
    var season = ((window.__caLeagueBoard || {}).teams || {})[code] || {};
    var splits = (((extra.indexSplits || {}).teams) || {})[code] || {};
    var oppSide = side === 'away' ? 'home' : 'away';
    var hand = ((extra.people || {})[game[oppSide + '_starter_id']] || {}).throws ||
      String(game[oppSide + '_hand'] || '').toUpperCase();
    var tonight = {};
    if (hand === 'R') tonight.vs_rhp = true;
    if (hand === 'L') tonight.vs_lhp = true;
    tonight[side === 'away' ? 'away' : 'home'] = true;
    function cells(entries) {
      return INDEX_KEYS.map(function (key) {
        var entry = entries[key[0]];
        if (!entry || entry.value == null) return '<td class="num ca-vs-none">Not Rated</td>';
        return '<td class="num ' + rankTone(entry.rank, entry.of) + '">' +
          esc(Number(entry.value).toFixed(1)) + rankBadge(entry) + '</td>';
      }).join('');
    }
    var rows = [];
    if (season.osi) rows.push('<tr><td>Season</td>' + cells(season) + '</tr>');
    INDEX_ROWS.forEach(function (row) {
      if (!splits[row[0]]) return;
      rows.push('<tr><td>' + esc(row[1]) +
        (tonight[row[0]] ? ' <span class="ca-flag">Tonight</span>' : '') + '</td>' +
        cells(splits[row[0]]) + '</tr>');
    });
    if (!rows.length) return '';
    return '<h4 class="ca-index-head">Offensive Index</h4><div class="ca-lineup-scroll">' +
      '<table class="ca-lineup-table ca-split-table ca-index-table"><thead><tr><th>Split</th>' +
      INDEX_KEYS.map(function (key) { return '<th class="num">' + key[1] + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function teamSplitsBody(sport, game, extra) {
    return '<div class="ca-detail-duo">' +
      teamSplitPanel(sport, game, 'away', extra.awayTeamSplits, extra) +
      teamSplitPanel(sport, game, 'home', extra.homeTeamSplits, extra) + '</div>';
  }

  function lineupsBody(sport, game, extra) {
    var people = extra.people || {};
    var awayArm = people[game.away_starter_id] || {};
    var homeArm = people[game.home_starter_id] || {};
    return '<div class="ca-detail-stack-inner">' +
      lineupPanel(sport, game, 'away', people,
        homeArm.name || value(game.home_starter, 'the home starter'),
        homeArm.throws || String(game.home_hand || '').toUpperCase(), extra) +
      lineupPanel(sport, game, 'home', people,
        awayArm.name || value(game.away_starter, 'the away starter'),
        awayArm.throws || String(game.away_hand || '').toUpperCase(), extra) +
      '</div>';
  }

  function arsenalBody(sport, game, extra) {
    var people = extra.people || {};
    return '<div class="ca-detail-duo">' +
      arsenalPanel(sport, game, 'away', people, extra.awayArsenal, extra.pitchBoard, extra.runValue) +
      arsenalPanel(sport, game, 'home', people, extra.homeArsenal, extra.pitchBoard, extra.runValue) + '</div>';
  }

  /* ---------------------------------------------------------------------
   * Lineup versus pitch mix.
   *
   * The Pitch Mix section says how the whole club has hit each of the
   * starter's pitches. This one asks it of every hitter in the order: one row
   * per batter, one column per pitch the opposing starter leans on, each
   * cell placed among the hitters who have seen that same pitch type. The
   * metric switch reads the same grid three ways. The last column is the
   * hitter's career line against this starter - a count, never graded.
   * ------------------------------------------------------------------ */
  var PITCH_SHORT = {
    FF: '4-Seam', FA: 'Fastball', SI: 'Sinker', FT: '2-Seam', FC: 'Cutter',
    SL: 'Slider', ST: 'Sweeper', SV: 'Slurve', CU: 'Curve', KC: 'Knuckle-Curve',
    CS: 'Slow Curve', CH: 'Change', FS: 'Splitter', FO: 'Forkball', SC: 'Screwball',
    KN: 'Knuckler', EP: 'Eephus'
  };
  var MATCHUP_METRICS = [
    ['xwoba', 'xwOBA', 3, ''],
    ['whiff_percent', 'Whiff%', 1, '%'],
    ['hard_hit_percent', 'Hard-Hit%', 1, '%']
  ];

  /* The percentile pill, for pitch-mix numbers only: in the MLB desk a rank
     prints on team stats and on the pitch-mix tables, and every other player
     stat is graded by colour alone (owner rule, 2026-09-28). */
  function percentileBadge(percentile) {
    var p = Number(percentile);
    if (percentile == null || !isFinite(p)) return '';
    var n = Math.round(p);
    return '<span class="ca-rank ' + percentileClass(p) + '" aria-label="' + n + ordinal(n) +
      ' percentile">' + n + '%ile</span>';
  }

  function vsStarterCell(history) {
    if (history === undefined) return '<td class="num">…</td>';
    var line = history && history.total;
    var pa = Number((line || {}).plateAppearances) || 0;
    if (!pa) return '<td class="num ca-vs-none">No PA</td>';
    var parts = [line.hits + '-' + line.atBats];
    if (Number(line.homeRuns)) parts.push(line.homeRuns + ' HR');
    if (Number(line.baseOnBalls)) parts.push(line.baseOnBalls + ' BB');
    parts.push(line.strikeOuts + ' K');
    return '<td class="num ca-vs-line" title="' + pa + ' career plate appearances">' +
      esc(parts.join(' · ')) + '</td>';
  }

  /* ---------------------------------------------------------------------
   * Batter versus pitcher: each hitter's whole history against tonight's
   * starter - regular season and postseason, summed from the counts - with
   * the seasons behind it one switch away. A rate over a dozen plate
   * appearances is still a rate the hitter produced, so it is graded like
   * every other number on the page, against the league's batters on the
   * season split, and the PA beside it says how much it rests on.
   * ------------------------------------------------------------------ */
  var BVP_RATES = [['avg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['ops', 'OPS']];
  /* Per-plate-appearance variance of each rate (a single at-bat's outcome):
     AVG and OBP are binomial near .24 / .32; one at-bat's total bases and one
     PA's OPS contribution spread about 0.75 and 0.95. */
  var BVP_PA_VARIANCE = { avg: 0.19, obp: 0.21, slg: 0.56, ops: 0.9 };

  /* Graded against the league's batters on the season split, with the
     sampling noise of this many trips added to the league's spread: a
     1-for-2 is not a 100th-percentile hitter, and an 0-for-3 is not the
     worst in baseball. The grade says how far the history actually sits from
     average once its size is counted, so a long history can reach the ends of
     the scale and three trips cannot. */
  function batterPercentile(value, stat, trips) {
    var A = global.MLBMAAssets;
    var cfg = A && A.CONTEXT_BASELINES && A.CONTEXT_BASELINES['bat_season_' + stat];
    if (value == null || !cfg || !(cfg.std > 0) || !(trips > 0)) return null;
    var spread = Math.sqrt(cfg.std * cfg.std + BVP_PA_VARIANCE[stat] / trips);
    return schemeNorm((value - cfg.mean) / spread) * 100;
  }

  function bvpRateCells(line) {
    return BVP_RATES.map(function (rate) {
      var v = line[rate[0]];
      if (v == null) return '<td class="num ca-vs-none">0 AB</td>';
      var trips = rate[0] === 'avg' || rate[0] === 'slg' ? line.atBats : line.plateAppearances;
      var pct = batterPercentile(v, rate[0], trips);
      return '<td class="num ' + percentileClass(pct) + '">' + esc(formatStat(v, 3)) + '</td>';
    }).join('');
  }

  function bvpCountCells(line) {
    return ['plateAppearances', 'hits', 'doubles', 'homeRuns', 'baseOnBalls', 'strikeOuts']
      .map(function (key) { return '<td class="num">' + esc(line[key]) + '</td>'; }).join('');
  }

  function bvpPost(post) {
    if (!post) return '<td class="num ca-vs-none">None</td>';
    var bits = [post.hits + '-' + post.atBats];
    if (post.homeRuns) bits.push(post.homeRuns + ' HR');
    return '<td class="num ca-vs-line" title="' + post.plateAppearances +
      ' postseason plate appearances">' + esc(bits.join(' · ')) + '</td>';
  }

  function bvpSpan(seasons) {
    var years = seasons.map(function (s) { return s.season; }).filter(Boolean).sort();
    if (!years.length) return '';
    return years[0] === years[years.length - 1] ? years[0]
      : years[0] + '–' + years[years.length - 1].slice(2);
  }

  function bvpPanel(sport, game, side, extra) {
    var oppSide = side === 'away' ? 'home' : 'away';
    var people = extra.people || {};
    var starterId = game[oppSide + '_starter_id'];
    var starterName = (people[starterId] && people[starterId].name) ||
      game[oppSide + '_starter'] || 'The Opposing Starter';
    var head = '<section class="ca-lineup-panel ca-bvp"><h3 class="ca-lineup-head">' +
      logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>Versus ' +
      esc(starterName) + '</span></h3>';
    if (!starterId) return head + pending('Opposing starter not announced yet.') + '</section>';
    var vs = extra[side + 'VsStarter'];
    var posted = game[side + '_lineup'] || [];
    var roster = extra[side + 'RosterHitters'];
    var hitters = posted.length
      ? posted.map(function (pl) {
          var person = people[lineupId(pl)] || {};
          return { id: lineupId(pl), name: person.name || lineupName(pl), bats: person.bats || '' };
        })
      : (roster || []);
    if (!posted.length) {
      head += '<p class="ca-lineup-context">Order Not Posted · Likely Starters From The Last 10 Games</p>';
    }
    if (vs === undefined || (!posted.length && roster === undefined)) {
      return head + pending('Batter history is loading.') + '</section>';
    }
    var faced = hitters.filter(function (h) {
      return vs[h.id] && vs[h.id].total && vs[h.id].total.plateAppearances;
    });
    var never = hitters.filter(function (h) { return faced.indexOf(h) < 0; });
    var neverLine = never.length
      ? '<p class="ca-bvp-never"><strong>Never Faced ' + esc(starterName) + ':</strong> ' +
        esc(never.map(function (h) { return h.name; }).join(', ')) + '</p>'
      : '';
    if (!faced.length) {
      return head + '<p class="ca-bvp-never"><strong>No hitter on this ' +
        (posted.length ? 'lineup' : 'likely lineup') + ' has faced ' + esc(starterName) +
        '.</strong></p></section>';
    }
    var rows = faced.map(function (h) {
      var history = vs[h.id];
      var main = '<tr><td class="ca-lineup-name">' + esc(h.name) + '</td>' +
        '<td class="ca-lineup-bats">' + esc(h.bats || '') + '</td>' +
        bvpCountCells(history.total) + bvpRateCells(history.total) + bvpPost(history.post) +
        '<td class="num">' + esc(bvpSpan(history.seasons)) + '</td></tr>';
      var seasons = history.seasons.map(function (s) {
        return '<tr class="ca-bvp-season" data-bvp-season hidden><td class="ca-lineup-name">' +
          esc(s.season) + (s.post ? ' <span class="ca-flag">Incl. Postseason</span>' : '') +
          '</td><td class="ca-lineup-bats"></td>' + bvpCountCells(s.line) +
          bvpRateCells(s.line) + '<td class="num"></td><td class="num">' + esc(s.season) +
          '</td></tr>';
      }).join('');
      return main + seasons;
    }).join('');
    return head + '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-bvp-table">' +
      '<thead><tr><th>Batter</th><th class="ca-lineup-bats">Bats</th><th class="num">PA</th>' +
      '<th class="num">H</th><th class="num">2B</th><th class="num">HR</th>' +
      '<th class="num">BB</th><th class="num">K</th>' +
      BVP_RATES.map(function (r) { return '<th class="num">' + r[1] + '</th>'; }).join('') +
      '<th class="num">Postseason</th><th class="num">Seasons</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' + neverLine + '</section>';
  }

  function bvpBody(sport, game, extra) {
    return '<div class="ca-season-toggle ca-metric-switch" role="group" aria-label="Rows shown">' +
      '<button type="button" class="ca-season-toggle__btn is-on" data-bvp-view="career" ' +
      'aria-pressed="true">Career</button>' +
      '<button type="button" class="ca-season-toggle__btn" data-bvp-view="seasons" ' +
      'aria-pressed="false">By Season</button></div>' +
      '<div class="ca-detail-stack-inner">' + bvpPanel(sport, game, 'away', extra) +
      bvpPanel(sport, game, 'home', extra) + '</div>';
  }

  function wireBvpView(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-bvp-view]');
      if (!btn || !host.contains(btn)) return;
      host.setAttribute('data-bvp-view', btn.getAttribute('data-bvp-view'));
      applyBvpView(host);
    });
  }

  function applyBvpView(host) {
    var view = host.getAttribute('data-bvp-view') || 'career';
    Array.prototype.forEach.call(host.querySelectorAll('[data-bvp-view]'), function (b) {
      if (b === host) return;
      var on = b.getAttribute('data-bvp-view') === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-bvp-season]'), function (row) {
      row.hidden = view !== 'seasons';
    });
  }

  function pitchMatchupPanel(sport, game, side, extra) {
    var oppSide = side === 'away' ? 'home' : 'away';
    var people = extra.people || {};
    var starterId = game[oppSide + '_starter_id'];
    var starterName = (people[starterId] && people[starterId].name) ||
      game[oppSide + '_starter'] || 'The Opposing Starter';
    var head = '<section class="ca-lineup-panel ca-pitch-matchup"><h3 class="ca-lineup-head">' +
      logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>Versus ' +
      esc(starterName) + '</span></h3>';
    if (!starterId) return head + pending('Opposing starter not announced yet.') + '</section>';
    var arsenal = extra[oppSide + 'Arsenal'];
    var board = extra.batterPitch;
    if (arsenal === undefined || board === undefined) {
      return head + pending('Pitch matchups are loading.') + '</section>';
    }
    if (!board || !board.hitters) {
      return head + pending('Hitter pitch-type lines are not published yet.') + '</section>';
    }
    if (!arsenal || !arsenal.length) {
      return head + pending('No tracked pitches published for the opposing starter.') + '</section>';
    }
    var pitches = arsenal.filter(function (row) {
      return row.pct >= 0.05 && !UNTRACKED_PITCH[row.code];
    }).slice(0, 5);
    var posted = game[side + '_lineup'] || [];
    var roster = extra[side + 'RosterHitters'];
    var hitters = posted.length
      ? posted.map(function (pl) {
          var person = people[lineupId(pl)] || {};
          return { id: lineupId(pl), name: person.name || lineupName(pl), bats: person.bats || '' };
        })
      : (roster || []);
    if (!hitters.length) {
      return head + pending(roster === undefined ? 'Pitch matchups are loading.'
        : 'Batting order not published yet.') + '</section>';
    }
    var vs = extra[side + 'VsStarter'];
    var sub = posted.length ? '' : '<p class="ca-lineup-context">Order Not Posted · ' +
      'Likely Starters From The Last 10 Games</p>';
    var tables = MATCHUP_METRICS.map(function (metric, index) {
      var rows = hitters.map(function (hitter, i) {
        var lines = ((board.hitters[String(hitter.id)] || {}).pitches) || {};
        var cells = pitches.map(function (pitch) {
          var line = lines[pitch.code];
          var entry = line && line[metric[0]];
          if (!line) return '<td class="num ca-vs-none">No PA</td>';
          if (!entry || entry.value == null) {
            // Whiff rate needs a swing and hard-hit rate a ball in play.
            return '<td class="num ca-vs-none">' +
              (metric[0] === 'hard_hit_percent' ? 'No BIP' : 'No Swings') + '</td>';
          }
          var shown = metric[2] === 3 ? formatStat(entry.value, 3)
            : Number(entry.value).toFixed(metric[2]) + metric[3];
          return '<td class="num ' + percentileClass(entry.percentile) + '" title="' +
            esc(line.pa + ' PA · ' + Number(line.pitches).toLocaleString('en-US') +
              ' pitches seen') + '">' + esc(shown) + percentileBadge(entry.percentile) + '</td>';
        }).join('');
        return '<tr><td class="ca-lineup-slot">' + (i + 1) + '</td>' +
          '<td class="ca-lineup-name">' + esc(hitter.name) + '</td>' +
          '<td class="ca-lineup-bats">' + esc(hitter.bats || '—') + '</td>' +
          cells + vsStarterCell(vs ? vs[hitter.id] : undefined) + '</tr>';
      }).join('');
      return '<div class="ca-lineup-scroll" data-pitch-metric="' + metric[0] + '"' +
        (index ? ' hidden' : '') + '><table class="ca-lineup-table ca-pitch-matchup-table">' +
        '<thead><tr><th>#</th><th>Batter</th><th class="ca-lineup-bats">Bats</th>' +
        pitches.map(function (pitch) {
          return '<th class="num ca-pm-pitch">' + esc(PITCH_SHORT[pitch.code] || pitch.name) +
            '<small>' + (pitch.pct * 100).toFixed(0) + '%</small></th>';
        }).join('') + '<th class="num">Career Vs</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }).join('');
    return head + sub + tables + '</section>';
  }

  function pitchMatchupBody(sport, game, extra) {
    return '<div class="ca-season-toggle ca-metric-switch" role="group" aria-label="Metric shown">' +
      MATCHUP_METRICS.map(function (metric, i) {
        return '<button type="button" class="ca-season-toggle__btn' + (i ? '' : ' is-on') +
          '" data-pitch-metric-pick="' + metric[0] + '" aria-pressed="' + (i === 0) + '">' +
          esc(metric[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="ca-detail-stack-inner">' +
      pitchMatchupPanel(sport, game, 'away', extra) +
      pitchMatchupPanel(sport, game, 'home', extra) + '</div>';
  }

  /* One switch for the whole section, remembered across repaints: the body
     is repainted as each source lands, so the choice lives on the host. */
  function wirePitchMetric(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-pitch-metric-pick]');
      if (!btn || !host.contains(btn)) return;
      host.setAttribute('data-pitch-metric', btn.getAttribute('data-pitch-metric-pick'));
      applyPitchMetric(host);
    });
  }

  function applyPitchMetric(host) {
    var metric = host.getAttribute('data-pitch-metric') || MATCHUP_METRICS[0][0];
    Array.prototype.forEach.call(host.querySelectorAll('[data-pitch-metric-pick]'), function (b) {
      var on = b.getAttribute('data-pitch-metric-pick') === metric;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-pitch-metric]'), function (node) {
      if (node === host) return;
      node.hidden = node.getAttribute('data-pitch-metric') !== metric;
    });
  }

  /* ---------------------------------------------------------------------
   * The season series, and in October the series being played.
   * ------------------------------------------------------------------ */
  /* ---------------------------------------------------------------------
   * Runs versus the starter's hand: what each club has scored and allowed
   * per game when a right- or left-hander started against it, over the
   * season or its last 30 / 14 / 7 games, anywhere or at home or on the
   * road. Every rate is ranked among the clubs in that same cell.
   * ------------------------------------------------------------------ */
  var RUN_WINDOWS = [['ytd', 'YTD'], ['l30', 'L30'], ['l14', 'L14'], ['l7', 'L7']];
  var RUN_VENUES = [['all', 'All'], ['home', 'At Home'], ['away', 'On The Road']];
  var RUN_HANDS = [['vs_rhp', 'Vs RHP Starters', 'R'], ['vs_lhp', 'Vs LHP Starters', 'L'],
    ['any', 'All Starters', '']];

  function runsHandTable(game, side, cells, oppHand) {
    var rows = RUN_HANDS.map(function (hand) {
      var cell = cells[hand[0]];
      var label = esc(hand[1]) + (hand[2] && hand[2] === oppHand
        ? ' <span class="ca-flag">Tonight</span>' : '');
      if (!cell) {
        return '<tr><td>' + label + '</td><td class="num">0</td>' +
          '<td class="num ca-vs-none">No Games</td><td class="num ca-vs-none">No Games</td>' +
          '<td class="num ca-vs-none">No Games</td></tr>';
      }
      function rate(entry, text) {
        return '<td class="num ' + rankTone(entry.rank, entry.of) + '">' +
          esc(text) + rankBadge(entry) + '</td>';
      }
      var runs = cell.runs_per_game;
      var risp = cell.risp_avg;
      return '<tr><td>' + label + '</td><td class="num">' + cell.games + '</td>' +
        '<td class="num">' + cell.wins + '\u2013' + cell.losses + '</td>' +
        rate(runs, Number(runs.value).toFixed(2)) +
        (risp ? rate(risp, formatStat(risp.value, 3))
          : '<td class="num ca-vs-none">0 AB</td>') + '</tr>';
    }).join('');
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-runs-hand-table">' +
      '<thead><tr><th>Opposing Starter</th><th class="num">G</th><th class="num">W\u2013L</th>' +
      '<th class="num">Runs/G</th><th class="num">AVG W/ RISP</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>';
  }

  function runsHandPanel(sport, game, side, extra) {
    var label = fullName(sport, game, side);
    var head = '<section class="ca-form-panel"><h3 class="ca-lineup-head">' +
      logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>' + esc(label) + '</span></h3>';
    var data = extra.runsByHand;
    if (data === undefined) return head + pending('Runs by starter hand are loading.') + '</section>';
    var team = ((data && data.teams) || {})[String(game[side + '_team_id'])];
    if (!team) return head + pending('Runs by starter hand are not published for this club.') + '</section>';
    var oppSide = side === 'away' ? 'home' : 'away';
    var oppHand = ((extra.people || {})[game[oppSide + '_starter_id']] || {}).throws ||
      String(game[oppSide + '_hand'] || '').toUpperCase();
    var views = [];
    RUN_WINDOWS.forEach(function (w) {
      RUN_VENUES.forEach(function (v) {
        var cells = ((team[w[0]] || {})[v[0]]) || {};
        views.push('<div data-runs-view="' + w[0] + '-' + v[0] + '"' +
          (w[0] === 'ytd' && v[0] === 'all' ? '' : ' hidden') + '>' +
          runsHandTable(game, side, cells, oppHand) + '</div>');
      });
    });
    return head + views.join('') + '</section>';
  }

  function runsHandBody(sport, game, extra) {
    function toggle(name, options) {
      return '<div class="ca-season-toggle ca-metric-switch" role="group" aria-label="' + name + '">' +
        options.map(function (opt, i) {
          return '<button type="button" class="ca-season-toggle__btn' + (i ? '' : ' is-on') +
            '" data-runs-pick="' + (name === 'Window' ? 'window' : 'venue') + ':' + opt[0] +
            '" aria-pressed="' + (i === 0) + '">' + esc(opt[1]) + '</button>';
        }).join('') + '</div>';
    }
    return '<div class="ca-runs-hand-controls">' + toggle('Window', RUN_WINDOWS) +
      toggle('Venue', RUN_VENUES) + '</div><div class="ca-detail-duo">' +
      runsHandPanel(sport, game, 'away', extra) + runsHandPanel(sport, game, 'home', extra) +
      '</div>';
  }

  function wireRunsHand(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-runs-pick]');
      if (!btn || !host.contains(btn)) return;
      var pick = btn.getAttribute('data-runs-pick').split(':');
      host.setAttribute('data-runs-' + pick[0], pick[1]);
      applyRunsHand(host);
    });
  }

  function applyRunsHand(host) {
    var chosen = {
      window: host.getAttribute('data-runs-window') || 'ytd',
      venue: host.getAttribute('data-runs-venue') || 'all'
    };
    Array.prototype.forEach.call(host.querySelectorAll('[data-runs-pick]'), function (b) {
      var pick = b.getAttribute('data-runs-pick').split(':');
      var on = chosen[pick[0]] === pick[1];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-runs-view]'), function (node) {
      node.hidden = node.getAttribute('data-runs-view') !== chosen.window + '-' + chosen.venue;
    });
  }

  /* Head to head, one panel per club in the Club Batting Splits layout: each
     club's record, runs and runs allowed per game against the other, overall
     and at each park. There is no league pool for one pairing, so nothing is
     ranked (owner rule: player-level and one-off numbers are colour only).
     The colour compares each figure with the league - runs per game against
     the thirty clubs' season runs per game, the record against .500 - with
     the noise of that many games added to the spread, so six meetings can
     tint a cell but cannot paint it elite. */
  var RUNS_PER_GAME_VAR = 9;    // one game's runs spread about 3 (sd), squared
  var WIN_VAR = 0.25;           // one game is a coin flip at .500

  function leagueRunsScale() {
    var rolling = (window.__caLeagueBoard || {}).rolling || {};
    var values = Object.keys(rolling).map(function (code) {
      return Number((((rolling[code] || {}).windows || {}).ytd || {}).runs_per_game);
    }).filter(function (v) { return isFinite(v) && v > 0; });
    if (values.length < 20) return { mean: 4.4, std: 0.45 };
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    var std = Math.sqrt(values.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) /
      values.length);
    return { mean: mean, std: std };
  }

  function h2hTone(value, mean, std, perGameVar, games, higherBetter) {
    if (!(games > 0)) return '';
    var z = (value - mean) / Math.sqrt(std * std + perGameVar / games);
    return percentileClass(schemeNorm(higherBetter ? z : -z) * 100);
  }

  function h2hPanel(sport, game, side, games) {
    var away = fullName(sport, game, 'away');
    var home = fullName(sport, game, 'home');
    var label = fullName(sport, game, side);
    var scale = leagueRunsScale();
    // Meetings are stored from the away club's side; the home club reads them turned over.
    var mine = games.map(function (g) {
      return side === 'away' ? g
        : { won: !g.won, scored: g.allowed, allowed: g.scored, awayHosted: g.awayHosted };
    });
    function row(name, list) {
      if (!list.length) {
        return '<tr><td>' + esc(name) + '</td><td class="num">0</td>' +
          '<td class="num ca-vs-none">No Meetings</td><td class="num ca-vs-none">No Meetings</td>' +
          '<td class="num ca-vs-none">No Meetings</td></tr>';
      }
      var n = list.length;
      var w = list.filter(function (g) { return g.won; }).length;
      var rpg = list.reduce(function (a, g) { return a + (Number(g.scored) || 0); }, 0) / n;
      var rapg = list.reduce(function (a, g) { return a + (Number(g.allowed) || 0); }, 0) / n;
      return '<tr><td>' + esc(name) + '</td><td class="num">' + n + '</td>' +
        '<td class="num ' + h2hTone(w / n, 0.5, 0, WIN_VAR, n, true) + '">' +
        w + '–' + (n - w) + '</td>' +
        '<td class="num ' + h2hTone(rpg, scale.mean, scale.std, RUNS_PER_GAME_VAR, n, true) + '">' +
        rpg.toFixed(2) + '</td>' +
        '<td class="num ' + h2hTone(rapg, scale.mean, scale.std, RUNS_PER_GAME_VAR, n, false) + '">' +
        rapg.toFixed(2) + '</td></tr>';
    }
    return '<section class="ca-form-panel"><h3 class="ca-lineup-head">' +
      logo(sport, game, side, 26, 'ca-lineup-head__crest') + '<span>' + esc(label) + '</span></h3>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-h2h-table">' +
      '<thead><tr><th>Meetings</th><th class="num">G</th><th class="num">W–L</th>' +
      '<th class="num">Runs/G</th><th class="num">Allowed/G</th></tr></thead><tbody>' +
      row('Season Series', mine) +
      row('At ' + home, mine.filter(function (g) { return !g.awayHosted; })) +
      row('At ' + away, mine.filter(function (g) { return g.awayHosted; })) +
      '</tbody></table></div></section>';
  }

  function seriesBody(sport, game, extra) {
    var data = extra.series;
    if (data === undefined) return pending('Season series is loading.');
    if (!data) return pending('Season series is not published for this pairing.');
    var away = fullName(sport, game, 'away');
    var home = fullName(sport, game, 'home');
    var status = data.status;
    var statusHtml = '';
    if (status) {
      var standing = status.isTied ? 'Series Tied ' + status.wins + '–' + status.losses
        : (status.result || '');
      statusHtml = '<div class="ca-detail-facts ca-series-facts">' +
        fact('Series', status.description || 'Postseason') +
        fact('Game', status.gameNumber + ' Of ' + status.totalGames) +
        (standing ? fact('Standing', standing) : '') + '</div>';
    }
    var games = data.meetings || [];
    if (!games.length) {
      return statusHtml + pending('The clubs did not meet in the regular season.');
    }
    // Game by game, oldest to newest, read from the away club's side.
    var squares = games.map(function (g) {
      var where = g.awayHosted ? 'vs ' + home : 'at ' + home;
      var title = g.date + ' ' + away + ' ' + where + ' ' + g.scored + '-' + g.allowed +
        ' ' + (g.won ? 'won' : 'lost');
      return '<span class="ca-recent__game' + (g.won ? ' is-win' : ' is-loss') +
        '" title="' + esc(title) + '"><abbr title="' + esc(title) + '">' +
        (g.won ? 'W' : 'L') + '</abbr><i>' + esc(g.scored) + '–' + esc(g.allowed) +
        '</i></span>';
    }).join('');
    return statusHtml +
      '<div class="ca-detail-duo ca-series-duo">' + h2hPanel(sport, game, 'away', games) +
      h2hPanel(sport, game, 'home', games) + '</div>' +
      '<div class="ca-recent-stack"><div class="ca-recent ca-series-strip">' +
      '<span class="ca-recent__team">' + logo(sport, game, 'away', 24, 'ca-recent__crest') +
      esc(away) + '<i class="ca-series-strip__note">Game By Game</i></span>' +
      '<span class="ca-recent__games">' + squares + '</span></div></div>';
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
      '</div></details>';
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
      recentStrip(sport, game, 'home', extra.homeRecent) + '</div>';
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
    { title: 'Offense', keys: ['off_ppg', 'off_ypg', 'off_third_down',
                               'off_ypa', 'off_ypc', 'off_comp'] },
    { title: 'Defense', keys: ['def_ppg', 'def_ypg', 'def_third_down',
                               'def_ypa', 'def_ypc', 'def_comp'] }
  ];

  var CFB_AXIS = {
    off_ppg: 'PPG', off_ypg: 'YPG', off_third_down: '3rd Down',
    off_ypa: 'YPA', off_ypc: 'YPC', off_comp: 'Comp%',
    def_ppg: 'PPG', def_ypg: 'YPG', def_third_down: '3rd Down',
    def_ypa: 'YPA', def_ypc: 'YPC', def_comp: 'Comp%'
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
    return '<div class="ca-radar-duo">' + webs + '</div>' +
      '<p class="ca-radar-key">' +
      '<span class="ca-radar-key__item"><span class="ca-radar-key__swatch is-away"' +
      swatch(pair.away) + '></span>' + logo(sport, game, 'away', 22, 'ca-mirror__crest') +
      esc(fullName(sport, game, 'away')) + '</span>' +
      '<span class="ca-radar-key__item"><span class="ca-radar-key__swatch is-home"' +
      swatch(pair.home) + '></span>' + logo(sport, game, 'home', 22, 'ca-mirror__crest') +
      esc(fullName(sport, game, 'home')) + '</span>' +
      '</p>';
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

  /* The same mirror, read on one split at a time. Each split line is ranked
     among the thirty clubs on that same split (one Stats API request for the
     whole league), and on the hand splits the club's OSI / ABQ / RCV / OBR sit
     above it (team_index_splits.json). */
  var FORM_SPLITS = [
    ['season', 'Season'], ['vr', 'Vs Righties'], ['vl', 'Vs Lefties'],
    ['h', 'At Home'], ['a', 'On The Road'], ['sp', 'Vs Starters'], ['rp', 'Vs Bullpens']
  ];
  var INDEX_FOR_SPLIT = { vr: 'vs_rhp', vl: 'vs_lhp', h: 'home', a: 'away' };
  var SPLIT_SPECS = {
    osi: { label: 'OSI', digits: 1 }, abq: { label: 'ABQ', digits: 1 },
    rcv: { label: 'RCV', digits: 1 }, obr: { label: 'OBR', digits: 1 },
    avg: { label: 'AVG', digits: 3 }, obp: { label: 'OBP', digits: 3 },
    slg: { label: 'SLG', digits: 3 }, ops: { label: 'OPS', digits: 3 },
    iso: { label: 'ISO', digits: 3 }, kPct: { label: 'K%', digits: 1, suffix: '%' },
    bbPct: { label: 'BB%', digits: 1, suffix: '%' }, hrPct: { label: 'HR%', digits: 1, suffix: '%' }
  };
  var SPLIT_KEYS = ['osi', 'abq', 'rcv', 'obr', 'avg', 'obp', 'slg', 'ops', 'iso',
    'kPct', 'bbPct', 'hrPct'];
  // Strikeouts are the one offensive rate where lower is better.
  var SPLIT_LOW = { kPct: true };

  function loadLeagueTeamSplits(season) {
    return fetchJson('https://statsapi.mlb.com/api/v1/teams/stats?stats=statSplits&group=hitting' +
      '&sitCodes=h,a,vl,vr,sp,rp&season=' + season + '&sportIds=1&gameType=R&limit=1000')
      .then(function (payload) {
        var bySplit = {};
        (((payload.stats || [])[0] || {}).splits || []).forEach(function (row) {
          var code = (row.split || {}).code;
          var team = (row.team || {}).id;
          var st = row.stat || {};
          var pa = Number(st.plateAppearances) || 0;
          if (!code || !team || !pa) return;
          var slg = Number(st.slg), avg = Number(st.avg);
          (bySplit[code] = bySplit[code] || {})[team] = {
            avg: avg, obp: Number(st.obp), slg: slg, ops: Number(st.ops), iso: slg - avg,
            kPct: Number(st.strikeOuts) / pa * 100, bbPct: Number(st.baseOnBalls) / pa * 100,
            hrPct: Number(st.homeRuns) / pa * 100
          };
        });
        // Rank every rate among the clubs on that split.
        Object.keys(bySplit).forEach(function (code) {
          var clubs = Object.keys(bySplit[code]);
          SPLIT_KEYS.forEach(function (key) {
            var values = clubs.map(function (id) { return bySplit[code][id][key]; })
              .filter(function (v) { return isFinite(v); });
            if (!values.length) return;
            clubs.forEach(function (id) {
              var v = bySplit[code][id][key];
              if (!isFinite(v)) { delete bySplit[code][id][key]; return; }
              var ahead = values.filter(function (o) { return SPLIT_LOW[key] ? o < v : o > v; }).length;
              bySplit[code][id][key] = { value: v, rank: ahead + 1, of: values.length };
            });
          });
        });
        return bySplit;
      }).catch(function () { return null; });
  }

  function formSplitContext(game, side, split, extra) {
    var line = (((extra.leagueSplits || {})[split]) || {})[game[side + '_team_id']] || null;
    if (!line) return null;
    var out = Object.assign({}, line);
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var index = ((((extra.indexSplits || {}).teams) || {})[canon(game[side])] || {})[INDEX_FOR_SPLIT[split]];
    if (index) ['osi', 'abq', 'rcv', 'obr'].forEach(function (k) { if (index[k]) out[k] = index[k]; });
    return out;
  }

  function formBody(sport, game, extra) {
    extra = extra || {};
    var mirror = mirrorTable(sport, game, FORM_KEYS, STAT_SPECS, function (g, side) {
      return g[side + '_context'];
    });
    // When the form was published is a freshness stamp, not an explanation.
    var season = (mirror || '<div class="ca-detail-duo">' +
      formPanel(sport, game, 'away') +
      formPanel(sport, game, 'home') + '</div>') +
      (game.context_generated_at
        ? pending('Team form as published ' + publishedTime(game.context_generated_at) + '.') : '');
    if (sport !== 'mlb') return season;
    var views = FORM_SPLITS.slice(1).map(function (spec) {
      var body = extra.leagueSplits === undefined ? pending('Split form is loading.')
        : (mirrorTable(sport, game, SPLIT_KEYS, SPLIT_SPECS, function (g, side) {
            return formSplitContext(g, side, spec[0], extra);
          }) || pending('Split form is not published for this pairing.'));
      return '<div data-form-view="' + spec[0] + '" hidden>' + body + '</div>';
    }).join('');
    return '<div class="ca-season-toggle ca-metric-switch" role="group" aria-label="Split shown">' +
      FORM_SPLITS.map(function (spec, i) {
        return '<button type="button" class="ca-season-toggle__btn' + (i ? '' : ' is-on') +
          '" data-form-split="' + spec[0] + '" aria-pressed="' + (i === 0) + '">' +
          esc(spec[1]) + '</button>';
      }).join('') + '</div>' +
      '<div data-form-view="season">' + season + '</div>' + views;
  }

  function wireFormSplit(host) {
    host.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-form-split]');
      if (!btn || !host.contains(btn)) return;
      host.setAttribute('data-form-split', btn.getAttribute('data-form-split'));
      applyFormSplit(host);
    });
  }

  function applyFormSplit(host) {
    var split = host.getAttribute('data-form-split') || 'season';
    Array.prototype.forEach.call(host.querySelectorAll('[data-form-split]'), function (b) {
      if (b === host) return;
      var on = b.getAttribute('data-form-split') === split;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-form-view]'), function (node) {
      node.hidden = node.getAttribute('data-form-view') !== split;
    });
  }

  function bullpenBody(sport, game, extra) {
    return '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Active Pen</p><h3>Season Quality And Matchup Splits</h3></div>' +
      '<span>Game-day roster</span></header>' + bullpenQualityBody(sport, game, extra) +
      '</div>' +
      '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Relief Arms</p><h3>Every Active Reliever, Graded</h3></div>' +
      '<span>Against league relievers</span></header><div class="ca-detail-stack-inner">' +
      reliefArmsPanel(sport, game, 'away', extra.awayBullpenUnit, extra.bullpenBoard) +
      reliefArmsPanel(sport, game, 'home', extra.homeBullpenUnit, extra.bullpenBoard) +
      '</div></div>' +
      '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Availability</p><h3>Pitch Count By Day</h3></div><span>Previous seven days</span></header>' +
      '<div class="ca-detail-stack-inner">' +
      bullpenPanel(sport, game, 'away', extra.awayBullpen, extra.bullpenQuality) +
      bullpenPanel(sport, game, 'home', extra.homeBullpen, extra.bullpenQuality) + '</div>' +
      '</div>';
  }

  function mlbSections(sport, game, extra) {
    extra = extra || {};
    return [
      section('starters', 'Probable Starters', 'Splits By Handedness And By Park',
        startersBody(sport, game, extra)),
      section('arsenal', 'Pitch Mix', 'What Each Starter Throws, And How Often',
        arsenalBody(sport, game, extra)),
      section('lineups', 'Lineup Vs Handedness', 'Each Order Against The Hand It Faces',
        lineupsBody(sport, game, extra)),
      section('pitch-matchup', 'Lineup Versus Pitch Mix', 'Every Hitter Against Every Pitch He Will See',
        pitchMatchupBody(sport, game, extra)),
      section('bvp', 'Batter Versus Pitcher', 'Every Meeting With Tonight’s Starter',
        bvpBody(sport, game, extra)),
      section('club-splits', 'Club Batting Splits', 'The Whole Roster, By Park And By Hand',
        teamSplitsBody(sport, game, extra)),
      section('recent', 'Last Ten Games', 'What Each Club Has Actually Been Doing',
        recentBody(sport, game, extra)),
      section('runs-hand', 'Runs Versus Starter Hand', 'Scoring And Hitting With RISP By The Hand That Started',
        runsHandBody(sport, game, extra)),
      section('series', 'Season Series', 'Every Meeting Between These Clubs',
        seriesBody(sport, game, extra)),
      section('form', 'Offensive Form And League Context', 'Graded Against The 30-Team League Pool',
        formBody(sport, game, extra)),
      section('radar', 'Team Profile Radar', 'Both Clubs On One Shape, By Percentile',
        radarBody(sport, game)),
      section('bullpens', 'Bullpen Matchup', 'Season Quality, Situational Splits And Recent Workload',
        bullpenBody(sport, game, extra))
    ].join('');
  }

  function pctText(value) {
    var v = Number(value);
    return isFinite(v) ? (v * 100).toFixed(1) + '%' : '\u2014';
  }

  function schemeNorm(z) {
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }

  function epaText(value, isRate) {
    var v = Number(value);
    if (!isFinite(v)) return '—';
    if (Math.abs(v) < 0.0005) v = 0;
    return isRate ? (v * 100).toFixed(1) + '%' : (v > 0 ? '+' : '') + v.toFixed(3);
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
    var players = availability.available(game, side, data && data.players);
    if (unit === 'offense' && data && data.players) {
      ['QB', 'RB'].forEach(function (position) {
        function inSlot(p) { return p.position === position; }
        if (!data.players.some(inSlot) || players.some(inSlot)) return;
        var replacement = availability.nflStarter(game, side, position);
        if (replacement) players.push(replacement);
      });
    }
    if (!players.length) {
      return '<section class="ca-lineup-unit" role="tabpanel" id="' + panelId +
        '" aria-labelledby="' + tabId + '" data-lineup-panel="' + unit + '"' + hidden + '>' +
        pending((unit === 'offense' ? 'Offensive' : 'Defensive') +
          ' starters are not published for this club.') + '</section>';
    }
    var groups = {};
    players.forEach(function (player) {
      var group = playerGroup(player, unit);
      (groups[group] = groups[group] || []).push(player);
    });
    var order = unit === 'offense'
      ? ['Receivers', 'Offensive Line', 'Backfield']
      : ['Secondary', 'Linebackers', 'Front'];
    var fallback = { status: Array.isArray(entries) ? 'Active' : 'Report pending' };
    var content = order.filter(function (group) { return groups[group] && groups[group].length; })
      .map(function (group) {
        return '<section class="ca-lineup-group" data-lineup-group="' +
          esc(group.toLowerCase().replace(/\s+/g, '-')) + '"><header><h4>' + esc(group) + '</h4><span>' +
          groups[group].length + '</span></header><div class="ca-lineup-group__players">' +
          groups[group].map(function (player) {
            var report = availability.designation(game, side, player);
            return lineupPlayer(player, {
              status: (report || {}).status || player.injury_status || player.status || fallback.status,
              detail: report && report.detail
            });
          }).join('') + '</div></section>';
      }).join('');
    return '<section class="ca-lineup-unit" role="tabpanel" id="' + panelId +
      '" aria-labelledby="' + tabId + '" data-lineup-panel="' + unit + '"' + hidden + '>' +
      '<div class="ca-lineup-unit__meta"><strong>' + esc(data.package || titleCase(unit)) +
      '</strong><span>' + players.length + ' Listed Players</span></div>' +
      '<div class="ca-lineup-groups">' + content + '</div></section>';
  }

  /* The league's official report lists practice participation before a club
     issues game statuses (outputs/publish_public_slate.py); a player who did
     not practise or was limited is not ruled out. Short tag and tone per
     status, anything else (Out, IR, a suspension) in the out tone. */
  var NFL_STATUS_TAG = {
    Questionable: ['Q', 'c-mid'], Doubtful: ['D', 'c-weak'],
    'Did Not Practice': ['DNP', 'c-weak'], 'Limited Practice': ['LP', 'c-mid']
  };

  /* How often a player listed this way played (outputs/nfl_injury_value.py:
     nflverse weekly reports joined to snap counts): game status with the
     week's last practice when that rests on 20+ listings, else the status.
     A practice-only listing is "no game status"; roster statuses (IR, PUP, a
     suspension) sit. */
  var NFL_PRACTICE_WORD = { DNP: 'did not practice', Limited: 'limited practice', Full: 'full practice' };
  function nflPlays(game, entry) {
    var rates = game.designation_play_rates;
    if (!rates) return null;
    var st = /^(Out|Doubtful|Questionable)$/.test(entry.status) ? entry.status
      : /^(Did Not Practice|Limited Practice)$/.test(entry.status) ? 'None' : null;
    if (!st) return null;
    var label = st === 'None' ? 'no game status' : st;
    var both = entry.practice && (rates.by_status_practice || {})[st + '|' + entry.practice];
    if (both && both.n >= 20) {
      return { played: both.played, n: both.n, basis: label + ', ' + NFL_PRACTICE_WORD[entry.practice] };
    }
    var one = (rates.by_status || {})[st];
    return one && one.n >= 20 ? { played: one.played, n: one.n, basis: label } : null;
  }

  function injuryReport(game, entries, club) {
    if (!entries) return pending('Injury report not published for this club.');
    if (!entries.length) return pending('No designations reported.');
    var players = entries.map(function (entry) {
      var rate = nflPlays(game, entry);
      return { player: entry.name, position: entry.position, status: entry.status,
        injury: entry.detail ? titleCase(entry.detail) : '',
        value: entry.value != null ? Number(entry.value) : null,
        value_recent: entry.value_recent != null ? Number(entry.value_recent) : null,
        missed: entry.missed != null ? Number(entry.missed) : null,
        plays: rate ? rate.played : null, plays_n: rate ? rate.n : null, plays_basis: rate ? rate.basis : null };
    });
    var valueNote = 'Points of the spread his club gives up without him: his position\u2019s price on ' +
      'closing lines (2019\u201325) times his snap share when he plays';
    var playsNote = 'nflverse weekly reports joined to snap counts, 2019\u201325';
    return '<details class="ca-injury-report"><summary><span>Full Injury Report</span>' +
      '<span class="ca-injury-report__meta"><span class="ca-injury-report__count">' +
      players.length + (players.length === 1 ? ' player' : ' players') +
      '</span><span class="ca-injury-report__chevron" aria-hidden="true"></span></span></summary>' +
      injuryTable(players, { label: club + ' injury report', playsNote: playsNote, valueNote: valueNote,
        alwaysMetrics: true }) + '</details>';
  }

  function lineupBoard(sport, game, side) {
    var entries = game[side + '_availability_list'];
    var label = fullName(sport, game, side);
    var qb = (availability.nflStarter(game, side, 'QB') || {}).name;
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
      injuryReport(game, entries, label) + '</article>';
  }

  function safeTotal() {
    var total = 0, seen = false;
    for (var i = 0; i < arguments.length; i++) {
      var n = Number(arguments[i]);
      if (isFinite(n)) { total += n; seen = true; }
    }
    return seen ? total : null;
  }

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
      // Each season-bound block carries both windows; show the chosen one.
      Array.prototype.forEach.call(host.querySelectorAll('[data-season-view]'), function (node) {
        node.hidden = node.getAttribute('data-season-view') !== scope;
      });
      host.setAttribute('data-season-scope', scope);
    });
  }

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
      ['current', String(now) + ' Only', 'Current-season evidence only'],
      ['combined', shown.join(' + '), 'Prior-season charting and current-season form']
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
      '</div>' +
      '</aside>';
  }

  /* ---------------------------------------------------------------------
   * The NFL desk, drawn in the MLB page's table language.
   *
   * Three components and no others, the same three the MLB matchup uses:
   *   starter panel  (.ca-starter-panel)   quarterback and running back
   *   club split     (.ca-form-panel)      team efficiency, trenches, pass catchers
   *   mix table      (.ca-arsenal-panel)   coverage shells, defensive looks, tendencies
   *
   * Every section is an away | home duo. A mix table is one club's usage of a
   * look, with the OTHER club's result against that look in the last column -
   * the way Pitch Mix carries the opposing lineup's xwOBA - so the matchup sits
   * inside the row and both directions are on screen at once.
   *
   * Nothing here names a gap. No row is sorted by one, no column declares a
   * side, and colour grades a result against the league, never a frequency.
   * ------------------------------------------------------------------ */

  // Every club on the published slate, so a result can be placed by its real
  // rank rather than a rank inferred from a normal curve. Set per render.
  var NFL_TEAM_COUNT = 32;
  var nflPool = null;

  function nflLeaguePool(games) {
    var teams = {};
    (games || []).forEach(function (g) {
      ['away', 'home'].forEach(function (side) {
        if (!g || !g[side]) return;
        teams[g[side]] = {
          scheme: g[side + '_scheme'] || null,
          schemeCurrent: g[side + '_scheme_current'] || null,
          line: g[side + '_line_stats'] || {},
          stats: g[side + '_team_stats'] || {},
          players: g[side + '_player_stats'] || [],
          playersPrior: g[side + '_player_stats_prior'] || [],
          statsPrior: g[side + '_team_stats_prior'] || {},
          backs: g[side + '_player_scheme'] || [],
          receivers: g[side + '_player_coverage'] || [],
          defenders: g[side + '_defenders_current'] || [],
          runGame: g[side + '_run_game'] || {}
        };
      });
    });
    return Object.keys(teams).length ? teams : null;
  }

  function rankValues(values) {
    return values.filter(function (x) {
      return (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '')) && Number.isFinite(Number(x));
    }).map(Number);
  }

  function nflTeamValues(read) {
    return rankValues(Object.values(nflPool || {}).map(read));
  }

  function nflPlayerValues(read) {
    return rankValues(Object.values(nflPool || {}).flatMap(read));
  }

  function nflTeamRank(entry, cohort) {
    var place = rankPosition(entry, NFL_TEAM_COUNT);
    return place ? Object.assign(place, { cohort: cohort || 'NFL teams' }) : null;
  }

  // A value's place in a pool (1st = highest when hi, lowest otherwise).
  function nflPlace(values, raw, hi, minimum) {
    if (raw == null || raw === '' || !isFinite(Number(raw)) || values.length < (minimum || 8)) return null;
    var v = Number(raw);
    var ahead = values.filter(function (x) { return hi ? x > v : x < v; }).length;
    // A value from outside the pool (a thin sample) that trails all of it is last.
    return { rank: Math.min(ahead + 1, values.length), of: values.length };
  }

  // A graded cell: tier colour from its place, the place on hover. A thin
  // sample prints the number and takes no colour.
  function nflPlacedTd(html, place, thin, cohort) {
    var shown = thin ? null : rankPosition(place);
    var tone = shown ? rankTone(shown.rank, shown.of) : '';
    var label = shown ? rankLabel(shown, cohort || place.cohort) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + (thin ? ' is-low-cell' : '') + '"' +
      (thin ? ' title="Thin sample: printed, not graded"'
        : (label ? ' title="' + esc(label) + '"' : '')) + '>' +
      html + rankBadge(shown, tone, label) + '</td>';
  }

  // A published {place, of} read as a frequency place for the league marker.
  function nflAsFreq(place, cohort) {
    return place ? { place: place.rank, of: place.of, cohort: cohort || place.cohort } : null;
  }

  function nflResponse(scheme, phase) {
    return (((scheme || {})[phase] || {}).response) || {};
  }

  /* Which season window the scheme panels are reading. The combined window
     is the model board's charting (participation + FTN, prior season in); the
     current window is this season alone, built from FTN charting and the
     play-by-play (outputs/nfl_advanced_context.team_scheme_current). */
  var nflWindow = { key: '_scheme', pool: 'scheme' };

  function nflScheme(game, side) {
    return game[side + nflWindow.key] || {};
  }

  // Render a scheme block once per window, as the two season views.
  function nflBothWindows(render) {
    var combined = render();
    nflWindow = { key: '_scheme_current', pool: 'schemeCurrent' };
    var current;
    try { current = render(); } finally { nflWindow = { key: '_scheme', pool: 'scheme' }; }
    return nflSeasonViews(combined, current);
  }

  function nflResultRank(scheme, phase, key, raw) {
    var seasons = ((scheme || {}).source_seasons || []).join(',');
    var pool = nflTeamValues(function (team) {
      var other = team[nflWindow.pool];
      return other && (other.source_seasons || []).join(',') === seasons ? nflResponse(other, phase)[key] : null;
    });
    return nflTeamRank(nflPlace(pool, raw, phase === 'offense'), 'NFL teams with comparable charting');
  }

  /* How often, against the league: the club's league rank as a colour-coded
     pill, from the published league_frequency_ranks (place 1 = most). Owner
     direction 2026-10-01 replaced the up/down arrows with the rank itself.
     The pill reads in the direction the colour does: for a rate where less is
     better (invert), 1st is the club that does it least. */
  function nflFreqRank(scheme, phase, group, key) {
    var rank = (((((scheme || {}).league_frequency_ranks || {})[phase] || {})[group] || {})[key]);
    return nflAsFreq(nflTeamRank(rank));
  }

  function nflFreqMark(rank, invert) {
    var place = rankPosition(rank);
    if (!place) return '';
    if (invert) place.rank = place.of + 1 - place.rank;
    var words = place.rank + ordinal(place.rank) + (invert ? ' least' : ' most') + ' of ' + place.of +
      (rank.cohort ? ' ' + rank.cohort : '');
    return rankBadge(place, '', words, 'ca-freq-mark');
  }

  function nflUsageCell(rate, rank, invert) {
    var n = Number(rate);
    if (rate == null || !isFinite(n)) return '<td class="num">&mdash;</td>';
    var pct = n * 100;
    return '<td class="num"><span class="ca-usage ' + usageTone(pct) + '">' +
      usageSquares(pct) + '<b>' + pct.toFixed(1) + '%</b></span>' + nflFreqMark(rank, invert) + '</td>';
  }

  // A plain rate with its league marker, for the other club's column.
  function nflRateCell(rate, rank, invert) {
    var n = Number(rate);
    if (rate == null || !isFinite(n)) return '<td class="num">&mdash;</td>';
    return '<td class="num">' + esc(pctText(n)) + nflFreqMark(rank, invert) + '</td>';
  }

  /* Every result is coloured and chipped, both clubs alike. (MLB's Pitch Mix
     leaves the opposing lineup's number plain beside its chip; on the NFL desk
     that read as an ungraded number, so both columns carry the tier.) */
  function nflResultCell(raw, entry, own, isRate, sample) {
    if (raw == null || !isFinite(Number(raw))) return '<td class="num">&mdash;</td>';
    var tone = entry ? rankTone(entry.rank, entry.of) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + '">' +
      esc(epaText(raw, isRate)) + rankBadge(entry) +
      (sample ? '<small class="ca-cbb-count">' + esc(sample) + '</small>' : '') + '</td>';
  }

  function nflMixTable(firstHead, heads, rows) {
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-arsenal-table ca-nfl-mix">' +
      '<thead><tr><th>' + esc(firstHead) + '</th><th class="num">Usage</th>' +
      heads.map(function (h) { return '<th class="num">' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function nflSampleLabel(scheme, participation) {
    var seasons = ((scheme || {})[participation ? 'participation_source_seasons' : 'source_seasons']) ||
      (scheme || {}).source_seasons || [];
    return seasons.length ? seasons.join(' + ') + ' charting' : '';
  }

  function nflSharpWeek(scheme, field) {
    var source = scheme.sharp_source;
    return source && Number.isInteger(source[field]) ? 'Sharp Football Analysis · through Week ' + source[field] : '';
  }

  function nflOther(side) { return side === 'away' ? 'home' : 'away'; }

  // Non-breaking, so a shell name never splits across lines in a narrow column.
  var NFL_SHELLS = [
    ['cover_0', 'Cover 0'], ['cover_1', 'Cover 1'], ['cover_2', 'Cover 2'],
    ['cover_2_man', 'Cover 2 Man'], ['cover_3', 'Cover 3'], ['cover_4', 'Cover 4'],
    ['cover_6', 'Cover 6']
  ];
  var NFL_MIDDLE = [['single_high', 'Middle Closed'], ['two_high', 'Middle Open']];

  /* One defense's coverage shells, most-played first. Ordering by this club's
     own usage is a fact about the club; it never reorders by a gap. */
  function nflShellPanel(sport, game, defSide) {
    var offSide = nflOther(defSide);
    var dScheme = nflScheme(game, defSide);
    var oScheme = nflScheme(game, offSide);
    var cov = ((dScheme.defense || {}).coverage) || {};
    var allowed = nflResponse(dScheme, 'defense');
    var faced = nflResponse(oScheme, 'offense');
    var oppLabel = fullName(sport, game, offSide);
    var head = '<section class="ca-arsenal-panel"><h3>' +
      esc(nflVs(sport, game, defSide, 'Coverage', 'Passing')) + '</h3>';
    // Without shell charting (the current season), the middle of the field -
    // closed for the one-high family, open for the two-high family - is the
    // shell evidence that is charted.
    var shells = NFL_SHELLS.some(function (s) { return cov[s[0] + '_rate'] != null; })
      ? NFL_SHELLS : NFL_MIDDLE;
    // A results table: a shell with no EPA on either side reads in Defensive
    // Tendencies instead.
    var rows = shells.filter(function (s) {
      return cov[s[0] + '_rate'] != null &&
        (allowed['pass_epa_' + s[0]] != null || faced['pass_epa_' + s[0]] != null);
    })
      .sort(function (a, b) { return cov[b[0] + '_rate'] - cov[a[0] + '_rate']; })
      .map(function (s) {
        var key = 'pass_epa_' + s[0];
        return '<tr><td class="ca-lineup-name">' + esc(s[1]) + '</td>' +
          nflUsageCell(cov[s[0] + '_rate'], nflFreqRank(dScheme, 'defense', 'coverage', s[0] + '_rate')) +
          nflResultCell(allowed[key], nflResultRank(dScheme, 'defense', key, allowed[key]), true) +
          nflResultCell(faced[key], nflResultRank(oScheme, 'offense', key, faced[key]), false) +
          '</tr>';
      });
    var defenders = nflWindow.pool === 'schemeCurrent'
      ? nflDefendersTable(availability.available(game, defSide, game[defSide + '_defenders_current'])) : '';
    if (!rows.length && defenders) return head + defenders + '</section>';
    if (!rows.length) return head + pending('Coverage charting is not published for this defense.') + '</section>';
    var context = [
      cov.man_rate != null ? pctText(cov.man_rate) + ' man' : '',
      cov.zone_rate != null ? pctText(cov.zone_rate) + ' zone' : '',
      cov.single_high_rate != null ? pctText(cov.single_high_rate) + ' single-high' : '',
      cov.two_high_rate != null ? pctText(cov.two_high_rate) + ' two-high' : ''
    ].concat([nflSampleLabel(dScheme, true)]).filter(Boolean).join(' · ');
    return head + '<p class="ca-lineup-context">' + esc(context || 'Charted coverage snaps') + '</p>' +
      nflMixTable('Shell', ['EPA Allowed', oppLabel + ' EPA'], rows) + defenders + '</section>';
  }

  /* The current season's coverage by defender (Pro Football Reference
     charting): each defender's targets and what was completed on them, placed
     among every defender on the slate with enough targets. Allowed rates grade
     low as good; aDOT is how deep he is tested, marked, never graded. */
  var NFL_DEFENDER_FLOOR = 5;

  // A graded cell whose pill is the percentile within a large player pool.
  function nflPercentileTd(html, place, poolLabel) {
    if (!place || !(place.of > 1)) return nflPlacedTd(html, null, true);
    var pct = Math.round(((place.of - place.rank) / (place.of - 1)) * 100);
    var tone = rankTone(place.rank, place.of);
    return '<td class="num' + (tone ? ' ' + tone : '') + '" title="' + pct + ordinal(pct) +
      ' percentile of ' + place.of + ' ' + poolLabel + '">' + html +
      '<span class="ca-rank ' + tone + '">' + pct + '%ile</span></td>';
  }

  function nflDefendersTable(list) {
    var rows = (list || []).filter(function (d) { return d && d.targets > 0; });
    if (!rows.length) return pending('Coverage charting is not published for this defense.');
    function pool(key) {
      return nflPlayerValues(function (t) {
        return (t.defenders || []).filter(function (d) { return d.targets >= NFL_DEFENDER_FLOOR; })
          .map(function (d) { return d[key]; });
      });
    }
    var pools = {
      completion_rate: pool('completion_rate'), yards_per_target: pool('yards_per_target'),
      passer_rating: pool('passer_rating'), adot: pool('adot')
    };
    var body = rows.slice(0, 8).map(function (d) {
      // Every defender is graded, placed against the defenders with at least
      // NFL_DEFENDER_FLOOR targets; the Tgt column carries his own sample.
      var thin = false;
      // Defenders are placed among every defender on the slate (a pool of a
      // couple of hundred), so the pill is the percentile, not the place.
      function graded(key, text) {
        var place = nflPlace(pools[key], d[key], false);
        if (!place || thin) return nflPlacedTd(esc(text), null, thin);
        var pct = Math.round(((place.of - place.rank) / (place.of - 1)) * 100);
        var tone = rankTone(place.rank, place.of);
        return '<td class="num' + (tone ? ' ' + tone : '') + '" title="' + pct + ordinal(pct) +
          ' percentile of ' + place.of + ' defenders with ' + NFL_DEFENDER_FLOOR + '+ targets">' +
          esc(text) + '<span class="ca-rank ' + tone + '">' + pct + '%ile</span></td>';
      }
      var adotPlace = nflPlace(pools.adot, d.adot, true);
      return '<tr' + (thin ? ' class="is-thin"' : '') + '><td class="ca-lineup-name">' + esc(d.player_name) +
        (d.position ? ' <small>' + esc(d.position) + '</small>' : '') +
        (thin ? ' <span class="ca-thin-tag" title="Under ' + NFL_DEFENDER_FLOOR +
          ' targets: printed, not graded">Low n</span>' : '') + '</td>' +
        '<td class="num">' + esc(String(d.targets)) + '</td>' +
        graded('completion_rate', d.completion_rate == null ? '' : pctText(d.completion_rate)) +
        graded('yards_per_target', d.yards_per_target == null ? '' : Number(d.yards_per_target).toFixed(1)) +
        graded('passer_rating', d.passer_rating == null ? '' : Number(d.passer_rating).toFixed(1)) +
        '<td class="num">' + (d.adot == null ? '&mdash;' : esc(Number(d.adot).toFixed(1)) +
          (thin ? '' : nflFreqMark(nflAsFreq(adotPlace, 'defenders with ' + NFL_DEFENDER_FLOOR + '+ targets')))) + '</td></tr>';
    });
    return '<p class="ca-lineup-context">Coverage allowed by defender</p>' +
      nflSplitTable(['Tgt', 'Cmp%', 'Yds/Tgt', 'Rating', 'aDOT'], body, 'Defender');
  }

  /* How a defense plays beyond the shell - man or zone, extra rushers, the
     pocket collapsing, the box loaded - and how the other offense has done in
     each. Usage is the defense's own rate on its charted snaps. */
  var NFL_LOOKS = [
    ['Man Coverage', 'coverage', 'man_rate', 'pass_epa_man'],
    ['Zone Coverage', 'coverage', 'zone_rate', 'pass_epa_zone'],
    ['Blitz', 'pressure', 'blitz_rate', 'pass_epa_blitz'],
    ['Pressure', 'pressure', 'pressure_rate', 'pass_epa_pressure'],
    ['Play Action Faced', 'personnel', 'play_action_rate', 'pass_epa_play_action'],
    ['Stacked Box', 'pressure', 'stacked_box_rate', 'rush_epa_stacked_box'],
    ['Light Box', 'pressure', 'light_box_rate', 'rush_epa_light_box'],
    ['Motion Faced', 'personnel', 'motion_rate', 'pass_epa_motion'],
    ['Screen Faced', 'personnel', 'screen_rate', 'pass_epa_screen']
  ];

  // A charted look this club has not run a play into has no result to show.
  function nflLookResult(raw, entry, own, sample) {
    return raw == null ? '<td class="num is-low-cell">No plays</td>' : nflResultCell(raw, entry, own, false, sample);
  }

  function nflLooksPanel(sport, game, defSide) {
    var offSide = nflOther(defSide);
    var dScheme = nflScheme(game, defSide);
    var oScheme = nflScheme(game, offSide);
    var unit = dScheme.defense || {};
    var allowed = nflResponse(dScheme, 'defense');
    var faced = nflResponse(oScheme, 'offense');
    var allowedSamples = unit.response_samples || {};
    var facedSamples = (oScheme.offense || {}).response_samples || {};
    var head = '<section class="ca-arsenal-panel"><h3>' +
      esc(nflVs(sport, game, defSide, 'Defense', 'Offense')) + '</h3>';
    var rows = NFL_LOOKS.map(function (spec) {
      var rate = (unit[spec[1]] || {})[spec[2]];
      // Usage alone lives in Defensive Tendencies; this table is results.
      if (allowed[spec[3]] == null && faced[spec[3]] == null) return '';
      return '<tr><td class="ca-lineup-name">' + esc(spec[0]) + '</td>' +
        nflUsageCell(rate, nflFreqRank(dScheme, 'defense', spec[1], spec[2])) +
        nflLookResult(allowed[spec[3]], nflResultRank(dScheme, 'defense', spec[3], allowed[spec[3]]), true,
          allowedSamples[spec[3]] ? allowedSamples[spec[3]] + ' dropbacks' : '') +
        nflLookResult(faced[spec[3]], nflResultRank(oScheme, 'offense', spec[3], faced[spec[3]]), false,
          facedSamples[spec[3]] ? facedSamples[spec[3]] + ' dropbacks' : '') +
        '</tr>';
    }).filter(Boolean);
    if (!rows.length) return head + pending('Defensive charting is not published for this club.') + '</section>';
    var box = (unit.pressure || {}).avg_box;
    return head + '<p class="ca-lineup-context">' +
      esc([box != null ? 'Average box ' + Number(box).toFixed(1) + ' defenders' : '',
        nflSampleLabel(dScheme, true), dScheme.sharp_source ? 'Man and zone from ' + nflSharpWeek(dScheme, 'through_week') : ''].filter(Boolean).join(' · ') || 'Charted defensive snaps') +
      '</p>' + nflMixTable('Look', ['EPA Allowed', fullName(sport, game, offSide) + ' EPA'], rows) +
      '</section>';
  }

  /* Tendencies are how often, never how well, so nothing in this table is
     graded. The last column is how often the other defense has seen the same
     thing, which is what makes it a matchup rather than a profile. */
  var NFL_TENDENCIES = [
    ['11 Personnel', 'personnel_11_rate'], ['12 Personnel', 'personnel_12_rate'],
    ['13 Personnel', 'personnel_13_rate'], ['21 Personnel', 'personnel_21_rate'],
    ['22 Personnel', 'personnel_22_rate'], ['Shotgun', 'formation_shotgun_rate'],
    ['Under Center', 'formation_under_center_rate'], ['Motion', 'motion_rate'],
    ['Play Action', 'play_action_rate'], ['RPO', 'rpo_rate'], ['Screen', 'screen_rate'],
    ['No Huddle', 'no_huddle_rate'], ['Neutral Pass Rate', 'neutral_pass_rate']
  ];

  function nflTendencyPanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oScheme = nflScheme(game, offSide);
    var mine = ((oScheme.offense || {}).personnel) || {};
    var dScheme = nflScheme(game, defSide);
    var seen = ((dScheme.defense || {}).personnel) || {};
    var head = '<section class="ca-arsenal-panel"><h3>' +
      esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) + '</h3>';
    var personnelWeek = nflSharpWeek(oScheme, 'personnel_through_week');
    function row(spec, responseKey) {
      if (mine[spec[1]] == null) return '';
      var cells = '<tr><td class="ca-lineup-name">' + esc(spec[0]) + '</td>' +
        nflUsageCell(mine[spec[1]], nflFreqRank(oScheme, 'offense', 'personnel', spec[1])) +
        nflRateCell(seen[spec[1]], nflFreqRank(dScheme, 'defense', 'personnel', spec[1]));
      if (responseKey) {
        var offense = nflResponse(oScheme, 'offense')[responseKey];
        var defense = nflResponse(dScheme, 'defense')[responseKey];
        var offenseN = (oScheme.offense.response_samples || {})[responseKey];
        var defenseN = ((dScheme.defense || {}).response_samples || {})[responseKey];
        cells += nflLookResult(offense, nflResultRank(oScheme, 'offense', responseKey, offense), false,
          offenseN ? offenseN + ' plays' : '');
        cells += nflLookResult(defense, nflResultRank(dScheme, 'defense', responseKey, defense), true,
          defenseN ? defenseN + ' plays' : '');
      }
      return cells + '</tr>';
    }
    var tendencyRows = [], personnelRows = [];
    NFL_TENDENCIES.forEach(function (spec) {
      var group = /^personnel_(\d\d)_rate$/.exec(spec[1]);
      var result = group && personnelWeek ? 'epa_personnel_' + group[1] : '';
      var html = row(spec, result);
      if (html) (result ? personnelRows : tendencyRows).push(html);
    });
    if (!tendencyRows.length && !personnelRows.length) return head + pending('Offensive tendencies are not published for this club.') + '</section>';
    var stats = game[offSide + '_team_stats'] || {};
    var pace = stats.offensive_plays_per_game;
    var facedHead = fullName(sport, game, defSide) + ' Faced';
    return head + '<p class="ca-lineup-context">' +
      esc([pace != null ? Number(pace).toFixed(1) + ' plays per game' : '',
        nflSampleLabel(oScheme, false)].filter(Boolean).join(' · ') || 'Charted offensive snaps') + '</p>' +
      (personnelRows.length ? '<p class="ca-lineup-context">' + esc(personnelWeek) + '</p>' +
        nflMixTable('Personnel', [facedHead, 'Offense EPA/Play', 'Allowed EPA/Play'], personnelRows) : '') +
      (tendencyRows.length ? nflMixTable('Tendency', [facedHead], tendencyRows) : '') + '</section>';
  }


  /* Pace (owner 2026-10-04): each offense's tempo by situation - full game,
     each half, leading, trailing and neutral - as game-clock seconds between
     snaps of a drive and snaps per game, beside the same for the plays run
     against the defense it meets; then time of possession, full game and by
     half. A league place on every figure; for seconds per snap 1st is the
     fastest. Leading/trailing is the possession team's score. Snaps and
     possession time a defense faces are volume it allows, so there 1st is
     the fewest (owner 2026-11-12: colour follows what the unit wants). */
  var NFL_PACE_SITUATIONS = [['', 'Full Game'], ['_h1', '1st Half'], ['_h2', '2nd Half'],
    ['_leading', 'Leading'], ['_trailing', 'Trailing'], ['_neutral', 'Neutral']];
  var NFL_TOP_ROWS = [['', 'Full Game'], ['_h1', '1st Half'], ['_h2', '2nd Half']];

  function nflPaceCell(value, rank, kind, invert, sample) {
    var n = Number(value);
    if (value == null || !isFinite(n)) return '<td class="num ca-vs-none">Not Charted</td>';
    var secs = Math.round(n * 60);
    var text = kind === 'sec' ? n.toFixed(1) + 's'
      : (kind === 'clock' ? Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2) : n.toFixed(1));
    var indicator = kind === 'sec' && rank && global.ChaseIcons
      ? ChaseIcons.rankedPace(rank.place, rank.of, true, 'NFL teams', sample) : '';
    return '<td class="num">' + esc(text) + indicator + nflFreqMark(rank, invert) + '</td>';
  }

  function nflPacePanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oScheme = nflScheme(game, offSide), dScheme = nflScheme(game, defSide);
    var mine = ((oScheme.offense || {}).pace) || {};
    var seen = ((dScheme.defense || {}).pace) || {};
    var head = '<section class="ca-arsenal-panel ca-nfl-pace-panel"><h3>' +
      esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) + '</h3>';
    function cell(side, scheme, key, kind, invert) {
      return nflPaceCell((side === 'offense' ? mine : seen)[key],
        nflFreqRank(scheme, side, 'pace', key), kind, invert,
        scheme[side + '_plays'] ? scheme[side + '_plays'] + ' charted snaps in the selected window' : '');
    }
    var tempo = NFL_PACE_SITUATIONS.filter(function (sit) {
      return mine['seconds_per_play' + sit[0]] != null || seen['seconds_per_play' + sit[0]] != null;
    }).map(function (sit) {
      return '<tr><td class="ca-lineup-name">' + esc(sit[1]) + '</td>' +
        cell('offense', oScheme, 'seconds_per_play' + sit[0], 'sec', true) +
        cell('offense', oScheme, 'plays_per_game' + sit[0], 'num1', false) +
        cell('defense', dScheme, 'seconds_per_play' + sit[0], 'sec', true) +
        cell('defense', dScheme, 'plays_per_game' + sit[0], 'num1', true) + '</tr>';
    });
    var top = NFL_TOP_ROWS.filter(function (row) {
      return mine['time_of_possession' + row[0]] != null || seen['time_of_possession' + row[0]] != null;
    }).map(function (row) {
      return '<tr><td class="ca-lineup-name">' + esc(row[1]) + '</td>' +
        cell('offense', oScheme, 'time_of_possession' + row[0], 'clock', false) +
        cell('defense', dScheme, 'time_of_possession' + row[0], 'clock', true) + '</tr>';
    });
    if (!tempo.length && !top.length) {
      return head + pending('Pace is not published for this pairing yet.') + '</section>';
    }
    var off = nflNick(sport, game, offSide), def = nflNick(sport, game, defSide);
    function table(first, heads, rows) {
      return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-arsenal-table ca-nfl-mix">' +
        '<thead><tr><th>' + esc(first) + '</th>' + heads.map(function (h) {
          return '<th class="num">' + esc(h) + '</th>';
        }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    return head +
      (tempo.length ? '<div class="ca-split-block"><h4>Tempo By Situation</h4>' +
        table('Situation', [off + ' Sec/Snap', off + ' Snaps/G', def + ' Faced Sec/Snap',
          def + ' Faced Snaps/G'], tempo) + '</div>' : '') +
      (top.length ? '<div class="ca-split-block"><h4>Time Of Possession Per Game</h4>' +
        table('Window', [off + ' Offense', def + ' Defense Faced'], top) + '</div>' : '') +
      '</section>';
  }

  /* Defensive tendencies: how often each defense plays each coverage, shell,
     pressure look and personnel package, beside how often the other offense
     has faced the same thing. Frequencies, so marked, never graded. */
  var NFL_DEF_TENDENCIES = [
    ['Man Coverage', 'coverage', 'man_rate'], ['Zone Coverage', 'coverage', 'zone_rate'],
    ['Middle Closed (MFC)', 'coverage', 'single_high_rate'], ['Middle Open (MFO)', 'coverage', 'two_high_rate'],
    ['Cover 0', 'coverage', 'cover_0_rate'], ['Cover 1', 'coverage', 'cover_1_rate'],
    ['Cover 2', 'coverage', 'cover_2_rate'], ['Cover 2 Man', 'coverage', 'cover_2_man_rate'],
    ['Cover 3', 'coverage', 'cover_3_rate'], ['Cover 4', 'coverage', 'cover_4_rate'],
    ['Cover 6', 'coverage', 'cover_6_rate'],
    ['Blitz', 'pressure', 'blitz_rate'], ['Pressure', 'pressure', 'pressure_rate'],
    ['Stacked Box', 'pressure', 'stacked_box_rate'], ['Light Box', 'pressure', 'light_box_rate'],
    ['Base Defense', 'package', 'base_rate'], ['Nickel', 'package', 'nickel_rate'],
    ['Dime', 'package', 'dime_rate'], ['Sub Package', 'package', 'sub_package_rate']
  ];

  function nflDefTendencyPanel(sport, game, defSide) {
    var offSide = nflOther(defSide);
    var dScheme = nflScheme(game, defSide);
    var oScheme = nflScheme(game, offSide);
    var mine = dScheme.defense || {};
    var seen = oScheme.offense || {};
    var head = '<section class="ca-arsenal-panel"><h3>' +
      esc(fullName(sport, game, defSide)) + ' Defense</h3>';
    var paired = [], solo = [];
    NFL_DEF_TENDENCIES.forEach(function (spec) {
      var own = (mine[spec[1]] || {})[spec[2]];
      if (own == null) return;
      var faced = (seen[spec[1]] || {})[spec[2]];
      var cells = '<tr><td class="ca-lineup-name">' + esc(spec[0]) + '</td>' +
        nflUsageCell(own, nflFreqRank(dScheme, 'defense', spec[1], spec[2]));
      if (faced == null) {
        solo.push(cells + '</tr>');
      } else {
        paired.push(cells + nflRateCell(faced, nflFreqRank(oScheme, 'offense', spec[1], spec[2])) + '</tr>');
      }
    });
    if (!paired.length && !solo.length) return '';
    // Looks charted only from the defense's side read without a Faced column.
    return head + '<p class="ca-lineup-context">' +
      esc([nflSampleLabel(dScheme, true), nflSharpWeek(dScheme, 'through_week'),
        dScheme.sharp_source && dScheme.sharp_source.middle_report_date ?
          'Middle-of-field rates published ' + dScheme.sharp_source.middle_report_date : ''].filter(Boolean).join(' · ') ||
        'Charted defensive snaps') + '</p>' +
      (paired.length ? nflMixTable('Tendency', [fullName(sport, game, offSide) + ' Faced'], paired) : '') +
      (solo.length ? '<div class="ca-split-block"><h4>Defense Only</h4>' +
        nflMixTable('Tendency', [], solo) + '</div>' : '') + '</section>';
  }

  /* ---- the 2025 + 2026 window ----------------------------------------
     The evidence window changes the data, not just what is hidden. Under
     "2025 + 2026" each player's two seasons are combined look by look -
     counts summed, rates recomputed from the sums - and graded against every
     player on the slate combined the same way. Under "2026 Only" the current
     season stands alone with its published league ranks. */
  var NFL_MERGE = {
    QB: { volume: 'dropbacks', key: 'look',
      sums: ['dropbacks', 'attempts', 'completions', 'passing_yards', 'passing_tds', 'interceptions', 'games'],
      weighted: [['epa_per_dropback', 'dropbacks'], ['success_rate', 'dropbacks']],
      derive: function (t) {
        t.completion_rate = t.attempts ? t.completions / t.attempts : null;
        t.yards_per_attempt = t.attempts ? t.passing_yards / t.attempts : null;
        t.dropbacks_per_game = t.games ? t.dropbacks / t.games : null;
        t.passing_yards_per_game = t.games ? t.passing_yards / t.games : null;
        t.attempts_per_game = t.games ? t.attempts / t.games : null;
      },
      metrics: [['completion_rate', true], ['yards_per_attempt', true], ['epa_per_dropback', true],
        ['success_rate', true], ['attempts_per_game', true]],
      minimum: 10, allFloor: 100 },
    RB: { volume: 'carries', key: 'look',
      sums: ['carries', 'rushing_yards', 'rushing_tds', 'games'],
      weighted: [['epa_per_carry', 'carries'], ['success_rate', 'carries']],
      derive: function (t) {
        t.yards_per_carry = t.carries ? t.rushing_yards / t.carries : null;
        t.carries_per_game = t.games ? t.carries / t.games : null;
        t.rushing_yards_per_game = t.games ? t.rushing_yards / t.games : null;
      },
      metrics: [['yards_per_carry', true], ['epa_per_carry', true], ['success_rate', true]],
      minimum: 5, allFloor: 50 },
    REC: { volume: 'targets', key: 'coverage',
      sums: ['targets', 'receptions', 'receiving_yards', 'touchdowns'],
      weighted: [['epa_per_target', 'targets'], ['success_rate', 'targets']],
      derive: function (t) {
        t.catch_rate = t.targets ? t.receptions / t.targets : null;
        t.yards_per_target = t.targets ? t.receiving_yards / t.targets : null;
      },
      metrics: [['catch_rate', true], ['yards_per_target', true], ['epa_per_target', true],
        ['success_rate', true]],
      minimum: 3, allFloor: 20 }
  };

  function nflMergeSplits(profiles, kind) {
    var spec = NFL_MERGE[kind];
    var byLook = {};
    profiles.forEach(function (p) {
      (p.splits || []).forEach(function (sp) {
        var look = sp[spec.key];
        var t = byLook[look] || (byLook[look] = {});
        spec.sums.forEach(function (k) { t[k] = (t[k] || 0) + (Number(sp[k]) || 0); });
        spec.weighted.forEach(function (w) {
          if (sp[w[0]] == null) return;
          t['_' + w[0]] = (t['_' + w[0]] || 0) + Number(sp[w[0]]) * (Number(sp[w[1]]) || 0);
          t['_' + w[0] + '_n'] = (t['_' + w[0] + '_n'] || 0) + (Number(sp[w[1]]) || 0);
        });
      });
    });
    return Object.keys(byLook).map(function (look) {
      var t = byLook[look];
      spec.weighted.forEach(function (w) {
        t[w[0]] = t['_' + w[0] + '_n'] ? t['_' + w[0]] / t['_' + w[0] + '_n'] : null;
        delete t['_' + w[0]]; delete t['_' + w[0] + '_n'];
      });
      spec.derive(t);
      t[spec.key] = look;
      return t;
    });
  }

  // Every player on the slate, both seasons combined, by kind (QB / RB / REC).
  var nflMergedPool = null;
  function nflMergedPlayers(kind) {
    if (!nflPool) return [];
    nflMergedPool = nflMergedPool || {};
    if (nflMergedPool[kind]) return nflMergedPool[kind];
    var groups = {};
    Object.keys(nflPool).forEach(function (team) {
      var rows = kind === 'REC' ? (nflPool[team].receivers || []) : (nflPool[team].backs || []);
      rows.forEach(function (p) {
        if (kind !== 'REC' && p.position !== kind) return;
        var id = p.player_id || playerNameKey(p.player_name);
        (groups[id] = groups[id] || { position: p.position, profiles: [] }).profiles.push(p);
      });
    });
    nflMergedPool[kind] = Object.keys(groups).map(function (id) {
      return { id: id, position: groups[id].position, splits: nflMergeSplits(groups[id].profiles, kind) };
    });
    return nflMergedPool[kind];
  }

  // Rank a combined split among slate players of the same position, same look.
  function nflRankMerged(splits, kind, position) {
    var spec = NFL_MERGE[kind];
    var players = nflMergedPlayers(kind).filter(function (p) { return p.position === position; });
    var alls = players.map(function (p) {
      var a = p.splits.filter(function (x) { return x[spec.key] === 'all'; })[0];
      return a ? Number(a[spec.volume]) || 0 : 0;
    }).sort(function (a, b) { return a - b; });
    var median = alls.length ? alls[Math.floor(alls.length / 2)] : 0;
    var allFloor = Math.max(spec.minimum, Math.min(spec.allFloor, Math.round(median / 2)));
    splits.forEach(function (sp) {
      var look = sp[spec.key];
      var floor = look === 'all' ? allFloor : spec.minimum;
      if ((Number(sp[spec.volume]) || 0) < floor) return;
      spec.metrics.forEach(function (m) {
        var pool = players.map(function (p) {
          var x = p.splits.filter(function (y) { return y[spec.key] === look; })[0];
          return x && (Number(x[spec.volume]) || 0) >= floor && x[m[0]] != null ? Number(x[m[0]]) : null;
        }).filter(function (v) { return v != null; });
        if (pool.length < 2 || sp[m[0]] == null) return;
        var v = Number(sp[m[0]]);
        var ahead = pool.filter(function (x) { return m[1] ? x > v : x < v; }).length;
        (sp.league_ranks = sp.league_ranks || {})[m[0]] = { place: ahead + 1, of: pool.length };
      });
    });
    return splits;
  }

  /* A player's two seasons as one line: totals summed; target share is the
     combined targets over the combined team targets each share implies. */
  function nflCombineRows(current, prior) {
    var byId = {};
    (prior || []).forEach(function (r) { byId[r.player_id || playerNameKey(r.player_name)] = r; });
    return (current || []).map(function (c) {
      var p = byId[c.player_id || playerNameKey(c.player_name)];
      if (!p) return c;
      var out = {};
      Object.keys(c).forEach(function (k) { out[k] = c[k]; });
      ['games', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'completions', 'attempts',
        'passing_yards', 'passing_tds', 'passing_interceptions', 'carries', 'rushing_yards', 'rushing_tds']
        .forEach(function (k) {
          if (c[k] != null || p[k] != null) out[k] = (Number(c[k]) || 0) + (Number(p[k]) || 0);
        });
      var teamTargets = (c.target_share ? Number(c.targets) / Number(c.target_share) : 0) +
        (p.target_share ? Number(p.targets) / Number(p.target_share) : 0);
      out.target_share = teamTargets ? out.targets / teamTargets : c.target_share;
      out.season = (p.season || '') + ' + ' + (c.season || '');
      return out;
    });
  }

  function nflCombineTeam(current, prior) {
    if (!prior || !current) return current || prior || null;
    var out = {};
    Object.keys(current).forEach(function (k) {
      var a = Number(current[k]), b = Number(prior[k]);
      out[k] = isFinite(a) && isFinite(b) && typeof current[k] === 'number' ? a + b : current[k];
    });
    var snaps = ['attempts', 'carries', 'sacks_suffered'].reduce(function (t, k) {
      return t + (Number(out[k]) || 0); }, 0);
    out.offensive_plays_per_game = out.games ? snaps / out.games : null;
    delete out.offensive_pace_rank;
    return out;
  }

  // Keep the current season visible on first load.
  function nflSeasonViews(combined, current) {
    return '<div data-season-view="combined" hidden>' + combined + '</div>' +
      '<div data-season-view="current">' + current + '</div>';
  }

  /* ---- starter panels: the quarterback and the lead back ---- */

  var NFL_BACK = {
    QB: {
      family: 'passing', volume: 'dropbacks', unit: 'Dropbacks', minimum: 10, floor: 10, opponent: true,
      groups: [
        ['Coverage', ['man', 'zone', 'team_man', 'team_zone', 'single_high', 'two_high']],
        ['Pass Rush', ['blitz', 'no_blitz', 'pressure', 'clean']],
        ['Box', ['light_box', 'stacked_box']],
        ['Shells', ['cover_0', 'cover_1', 'cover_2', 'cover_2_man', 'cover_3', 'cover_4', 'cover_6']]
      ],
      cols: [['dropbacks', 'DB', null, 'int'], ['attempts', 'Att', null, 'int'],
        ['attempts_per_game', 'Att/G', 'attempts_per_game', 'num1'],
        ['completion_rate', 'Cmp%', 'completion_rate', 'pct'],
        ['yards_per_attempt', 'Y/A', 'yards_per_attempt', 'num1'],
        ['epa_per_dropback', 'EPA/DB', 'epa_per_dropback', 'epa'],
        ['success_rate', 'Succ%', 'success_rate', 'pct']]
    },
    RB: {
      family: 'rushing', volume: 'carries', unit: 'Carries', minimum: 5, floor: 5, opponent: false,
      groups: [
        ['Box', ['light_box', 'stacked_box']],
        ['Personnel Faced', ['base', 'nickel', 'dime']],
        ['Direction', ['left', 'middle', 'right']],
        ['Point Of Attack', ['gap_guard', 'gap_tackle', 'gap_end']]
      ],
      cols: [['carries', 'Att', null, 'int'], ['yards_per_carry', 'YPC', 'yards_per_carry', 'num1'],
        ['epa_per_carry', 'EPA/Att', 'epa_per_carry', 'epa'],
        ['success_rate', 'Succ%', 'success_rate', 'pct']]
    }
  };

  var NFL_LOOK_LABEL = {
    man: 'Vs Man', zone: 'Vs Zone', single_high: 'Single High (MFC)', two_high: 'Two High (MFO)',
    team_man: 'Offense Vs Man', team_zone: 'Offense Vs Zone',
    blitz: 'Vs Blitz', no_blitz: 'No Blitz', pressure: 'Pressured', clean: 'Clean Pocket',
    light_box: 'Light Box', stacked_box: 'Stacked Box', base: 'Vs Base', nickel: 'Vs Nickel',
    dime: 'Vs Dime', left: 'Run Left', middle: 'Run Middle', right: 'Run Right',
    gap_guard: 'At The Guards', gap_tackle: 'At The Tackles', gap_end: 'Outside The Ends',
    cover_0: 'Cover 0', cover_1: 'Cover 1', cover_2: 'Cover 2', cover_2_man: 'Cover 2 Man',
    cover_3: 'Cover 3', cover_4: 'Cover 4', cover_6: 'Cover 6',
    play_action: 'Play Action', no_play_action: 'No Play Action',
    motion: 'With Motion', no_motion: 'No Motion'
  };

  function nflFormat(raw, kind) {
    var v = Number(raw);
    if (raw == null || !isFinite(v)) return '—';
    if (kind === 'pct') return pctText(v);
    if (kind === 'epa') return epaText(v, false);
    if (kind === 'num1') return v.toFixed(1);
    if (kind === 'num2') return v.toFixed(2);
    return String(Math.round(v));
  }

  function nflRankTone(rank) {
    return rank && rank.place ? rankTone(rank.place, rank.of) : '';
  }

  /* One season's splits for one back, as the MLB starter table: rows are the
     looks he has a real sample in, colour is his place among players at his
     position for that same look, and the count is always printed. */
  /* How often the defense this back is facing shows each look, from its own
     charting. A plain rate beside his result, the way Pitch Mix sets usage
     beside what the other side has done with it - context, never a grade. */
  var NFL_LOOK_RATE = {
    man: ['coverage', 'man_rate'], zone: ['coverage', 'zone_rate'],
    team_man: ['coverage', 'man_rate'], team_zone: ['coverage', 'zone_rate'],
    light_box: ['pressure', 'light_box_rate'],
    single_high: ['coverage', 'single_high_rate'], two_high: ['coverage', 'two_high_rate'],
    blitz: ['pressure', 'blitz_rate'], pressure: ['pressure', 'pressure_rate'],
    stacked_box: ['pressure', 'stacked_box_rate'],
    cover_0: ['coverage', 'cover_0_rate'], cover_1: ['coverage', 'cover_1_rate'],
    cover_2: ['coverage', 'cover_2_rate'], cover_2_man: ['coverage', 'cover_2_man_rate'],
    cover_3: ['coverage', 'cover_3_rate'], cover_4: ['coverage', 'cover_4_rate'],
    cover_6: ['coverage', 'cover_6_rate'],
    play_action: ['personnel', 'play_action_rate'], motion: ['personnel', 'motion_rate']
  };
  // A complement look reads its source rate turned over.
  var NFL_LOOK_INVERSE = { no_blitz: 'blitz', clean: 'pressure',
    no_play_action: 'play_action', no_motion: 'motion' };

  function nflOppShows(oppDefense, look) {
    var inverse = NFL_LOOK_INVERSE[look];
    var spec = NFL_LOOK_RATE[inverse || look];
    if (!spec || !oppDefense) return null;
    var v = (oppDefense[spec[0]] || {})[spec[1]];
    if (v == null || !isFinite(Number(v))) return null;
    return inverse ? 1 - Number(v) : Number(v);
  }

  // The same look's league place for the opponent; a complement (no blitz,
  // clean pocket) reads its source rate's place turned over.
  function nflOppShowsMark(oppScheme, look) {
    var inverse = NFL_LOOK_INVERSE[look];
    var spec = NFL_LOOK_RATE[inverse || look];
    if (!spec) return '';
    return nflFreqMark(nflFreqRank(oppScheme, 'defense', spec[0], spec[1]), !!inverse);
  }

  // One season's splits under a heading that names the season and its sample.
  function nflSplitWrap(title, inner, status) {
    return '<div class="ca-split-block"><h4>' + esc(title) + '</h4>' +
      (status ? pending(status) : '') + inner + '</div>';
  }

  function nflBackSplits(profile, spec, opp) {
    var order = [];
    var groupOf = {};
    spec.groups.forEach(function (g) {
      g[1].forEach(function (look) { order.push(look); groupOf[look] = g[0]; });
    });
    if (!spec.opponent) opp = null;
    var total = ((profile.splits || []).filter(function (s) { return s.look === 'all'; })[0] || {})[spec.volume];
    function named(s) {
      // Only the looks this table names. The source also publishes
      // middle-field-closed/open, which are single-high/two-high under another
      // name, and a look that holds every snap (a back who never saw a blitz
      // has "No Blitz" equal to his whole line) says nothing a split should.
      return s.look !== 'all' && order.indexOf(s.look) >= 0 &&
        Number(s[spec.volume]) > 0 && Number(s[spec.volume]) !== Number(total);
    }
    var rows = (profile.splits || []).filter(function (s) {
      return named(s) && Number(s[spec.volume]) >= spec.minimum;
    });
    // Early in a season no look may reach the minimum; show what there is.
    if (!rows.length) rows = (profile.splits || []).filter(named);
    rows = rows.sort(function (a, b) {
      var ai = order.indexOf(a.look), bi = order.indexOf(b.look);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    var all = (profile.splits || []).filter(function (s) { return s.look === 'all'; })[0] || {};
    var season = profile.source_season;
    var title = season + ' Splits' + (all[spec.volume] != null
      ? ' · ' + all[spec.volume] + ' ' + spec.unit : '');
    if (!rows.length) return '';
    // A row that carries only EPA (coverage charted per offense, not per play)
    // reads in its own table, under just the columns it has.
    var epaOnly = rows.filter(function (r) {
      return r.epa_per_dropback != null && r.completion_rate == null && r.success_rate == null;
    });
    rows = rows.filter(function (r) { return epaOnly.indexOf(r) < 0; });
    var cols = spec.cols.filter(function (col) {
      return rows.some(function (r) { return r[col[0]] != null; });
    });
    var showCol = !!opp && rows.some(function (r) { return nflOppShows(opp.defense, r.look) != null; });
    var width = cols.length + 1 + (showCol ? 1 : 0);
    var lastGroup = null;
    var body = rows.map(function (r) {
      var ranks = r.league_ranks || {};
      // Below the floor a split is still graded when the pipeline placed it
      // against the players above the floor; only an unplaced one is tagged.
      var thin = Number(r[spec.volume]) < spec.floor && !Object.keys(ranks).length;
      var shows = opp ? nflOppShows(opp.defense, r.look) : null;
      // The looks come in families; a family row keeps seventeen of them scannable.
      var group = groupOf[r.look];
      var groupRow = group !== lastGroup
        ? '<tr class="ca-split-group"><th colspan="' + width + '" scope="colgroup">' + esc(group) +
          '</th></tr>' : '';
      lastGroup = group;
      return groupRow + '<tr' + (thin ? ' class="is-thin"' : '') + '><td>' +
        esc(NFL_LOOK_LABEL[r.look] || titleCase(String(r.look).replace(/_/g, ' '))) +
        (thin ? ' <span class="ca-thin-tag" title="Under ' + spec.floor + ' ' + spec.unit.toLowerCase() +
          ': printed, not graded">Low n</span>' : '') + '</td>' +
        cols.map(function (col) {
          var rank = col[2] && !thin ? ranks[col[2]] : null;
          var tone = nflRankTone(rank);
          return '<td class="num' + (tone ? ' ' + tone : '') + '"' +
            (rank ? ' title="' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
              ' at his position in this look"' : '') + '>' + esc(nflFormat(r[col[0]], col[3])) +
            nflBadge(rank, 'qualified players at his position in this look') + '</td>';
        }).join('') + (showCol ? '<td class="num ca-opp-shows">' +
          (shows == null ? '' : esc(pctText(shows)) + nflOppShowsMark(opp.scheme, r.look)) +
          '</td>' : '') + '</tr>';
    }).join('');
    var showHead = opp ? '<th class="num ca-opp-shows" title="How often ' + esc(opp.name) +
      ' shows this look on its charted snaps">' + esc(opp.nick) + ' Show</th>' : '';
    var main = rows.length
      ? '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split"><thead><tr><th>Look</th>' +
        cols.map(function (col) { return '<th class="num">' + esc(col[1]) + '</th>'; }).join('') +
        (showCol ? showHead : '') + '</tr></thead><tbody>' + body + '</tbody></table></div>'
      : '';
    var coverage = '';
    if (epaOnly.length) {
      var epaShow = !!opp && epaOnly.some(function (r) { return nflOppShows(opp.defense, r.look) != null; });
      coverage = '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split ca-nfl-epa-only">' +
        '<thead><tr><th>Coverage</th><th class="num">DB</th><th class="num">EPA/DB</th>' +
        (epaShow ? showHead : '') + '</tr></thead><tbody>' +
        epaOnly.map(function (r) {
          var rank = (r.league_ranks || {}).epa_per_dropback || null;
          var shows = opp ? nflOppShows(opp.defense, r.look) : null;
          var ofOffenses = /^team_/.test(r.look);
          var teamRank = ofOffenses ? nflTeamRank(rank) : null;
          if (ofOffenses) rank = nflAsFreq(teamRank);
          return '<tr><td>' + esc(NFL_LOOK_LABEL[r.look] || r.look) + '</td>' +
            '<td class="num">' + esc(String(r.dropbacks)) + '</td>' +
            '<td class="num' + (rank ? ' ' + nflRankTone(rank) : '') + '"' +
            (rank ? ' title="' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
              (ofOffenses ? ' offenses' : ' at his position') + '"' : '') + '>' +
            esc(nflFormat(r.epa_per_dropback, 'epa')) +
            nflBadge(rank, ofOffenses ? 'NFL offenses in this look' : 'qualified players at his position') + '</td>' +
            (epaShow ? '<td class="num ca-opp-shows">' + (shows == null ? '' :
              esc(pctText(shows)) + nflOppShowsMark(opp.scheme, r.look)) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (!main && !coverage) return '';
    return nflSplitWrap(title, coverage + main, '');
  }

  function nflBackPanel(sport, game, side, position) {
    var spec = NFL_BACK[position];
    var starter = availability.nflStarter(game, side, position);
    var name = starter && starter.name;
    var key = playerNameKey(name);
    var profiles = (game[side + '_player_scheme'] || []).filter(function (p) {
      return p.play_family === spec.family && playerNameKey(p.player_name) === key;
    }).sort(function (a, b) { return Number(b.source_season) - Number(a.source_season); });
    function statsFor(rows) {
      return (rows || []).filter(function (p) { return playerNameKey(p.player_name) === key; })[0] || null;
    }
    var stats = statsFor(game[side + '_player_stats']);
    var prior = statsFor(game[side + '_player_stats_prior']);
    var status = availability.status(game, side, starter);
    var shot = starter && starter.headshot_url
      ? '<img class="ca-starter-shot" src="' + esc(starter.headshot_url) + '" width="72" height="72" alt="' +
        esc(name || '') + '" loading="lazy" decoding="async">' : '';
    var head = '<section class="ca-starter-panel"><header class="ca-starter-head">' + shot +
      '<div><p class="ca-starter-team">' +
      esc(nflVs(sport, game, side, position, position === 'RB' ? 'Run Defense' : 'Defense')) +
      (status ? ' · ' + esc(status) : '') + '</p>' +
      '<h3 class="ca-starter-name">' + esc(name || 'Starter Not Published') + '</h3></div></header>';
    if (!name) return head + pending('No available ' + position + ' is listed on the depth chart.') + '</section>';

    var current = profiles[0] || null;
    // Tracking is NFL Next Gen, published for the current season only; it
    // reads the same in both windows.
    var tracking = (current && current.tracking) || {};
    var trackRanks = (current && current.tracking_ranks) || {};
    var lowTag = ' <span class="ca-thin-tag" title="Too few ' + spec.unit.toLowerCase() +
      ' to rank against the league">Low n</span>';
    var combined = null;
    if (profiles.length) {
      combined = {
        source_season: profiles.length > 1 ? profiles.map(function (p) { return p.source_season; })
          .sort().join(' + ') : profiles[0].source_season,
        splits: profiles.length > 1
          ? nflRankMerged(nflMergeSplits(profiles, position), position, position)
          : profiles[0].splits
      };
    }
    var oppSide = nflOther(side);
    var opp = {
      scheme: game[oppSide + '_scheme'] || {},
      defense: (game[oppSide + '_scheme'] || {}).defense || null,
      name: fullName(sport, game, oppSide),
      nick: nflNick(sport, game, oppSide)
    };

    function tiles(profile) {
      var all = profile ? ((profile.splits || []).filter(function (x) { return x.look === 'all'; })[0] || {}) : {};
      var ranks = all.league_ranks || {};
      // A line below the league floor carries no rank: the tile says so.
      var thin = !!profile && !Object.keys(ranks).length;
      function tile(labelText, raw, kind, rank) {
        if (raw == null || !isFinite(Number(raw))) return '';
        var tone = nflRankTone(rank);
        return '<div class="ca-stat"><span class="ca-stat__label">' + esc(labelText) +
          (thin ? lowTag : '') + '</span><strong class="ca-stat__value' + (tone ? ' ' + tone : '') + '"' +
          (rank ? ' title="' + rank.place + ordinal(rank.place) + ' of ' + rank.of + '"' : '') + '>' +
          esc(nflFormat(raw, kind)) + nflBadge(rank, 'qualified ' + position + 's in this window') + '</strong></div>';
      }
      // Next Gen tracking, graded like the tiles beside it. The pipeline
      // places these 1st = highest; where less is better for the player (a
      // quicker release, fewer pressures) the place is flipped so 1st = best
      // and the tier colour agrees with every other tile.
      function trackTile(labelText, valueHtml, rank, lowerIsBetter) {
        var r = rank && rank.place && rank.of
          ? { place: lowerIsBetter ? rank.of + 1 - rank.place : rank.place, of: rank.of } : null;
        var tone = nflRankTone(r);
        return '<div class="ca-stat"><span class="ca-stat__label">' + esc(labelText) +
          (r ? '' : lowTag) + '</span><strong class="ca-stat__value' + (tone ? ' ' + tone : '') + '"' +
          (r ? ' title="' + r.place + ordinal(r.place) + ' of ' + r.of + '"' : '') + '>' +
          valueHtml + nflBadge(r, position + 's with qualifying tracking data') + '</strong></div>';
      }
      var html = position === 'QB'
        ? tile('EPA / DB', all.epa_per_dropback, 'epa', ranks.epa_per_dropback) +
          tile('Cmp%', all.completion_rate, 'pct', ranks.completion_rate) +
          tile('Y/A', all.yards_per_attempt, 'num1', ranks.yards_per_attempt) +
          (tracking.avg_time_to_throw != null
            ? trackTile('Time To Throw', Number(tracking.avg_time_to_throw).toFixed(2) + 's',
              trackRanks.avg_time_to_throw, true) : '') +
          (tracking.pressure_rate != null
            ? trackTile('Pressured', esc(pctText(tracking.pressure_rate)),
              trackRanks.pressure_rate, true) : '') +
          (tracking.cpoe != null
            ? trackTile('CPOE', esc((tracking.cpoe > 0 ? '+' : '') + (tracking.cpoe * 100).toFixed(1) + '%'),
              trackRanks.cpoe, false) : '') +
          // How deep he throws is style, not quality: it carries a neutral mark.
          (tracking.avg_intended_air_yards != null
            ? '<div class="ca-stat"><span class="ca-stat__label">Air Yds / Att</span><strong class="ca-stat__value">' +
              esc(Number(tracking.avg_intended_air_yards).toFixed(1)) +
              nflFreqMark(nflAsFreq(rankPosition(trackRanks.avg_intended_air_yards), 'QBs with qualifying tracking data')) +
              '</strong></div>' : '')
        : tile('YPC', all.yards_per_carry, 'num1', ranks.yards_per_carry) +
          tile('EPA / Carry', all.epa_per_carry, 'epa', ranks.epa_per_carry) +
          tile('Success', all.success_rate, 'pct', ranks.success_rate) +
          (tracking.ryoe_per_carry != null
            ? trackTile('RYOE / Carry',
              nflFormat(tracking.ryoe_per_carry, 'epa').replace(/(\.\d\d)\d$/, '$1'),
              trackRanks.ryoe_per_carry, false) : '');
      return html ? '<div class="ca-stat-row">' + html + '</div>' : '';
    }

    // The season line, the way the MLB panel prints the last start.
    function seasonLine(rows, title) {
      rows = rows.filter(Boolean);
      if (!rows.length) return '';
      function sum(k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); }
      var games = sum('games');
      if (!games) return '';
      var bits = position === 'QB'
        ? [sum('completions') + '/' + sum('attempts'), sum('passing_yards') + ' yds',
          sum('passing_tds') + ' TD', sum('passing_interceptions') + ' INT']
        : [sum('carries') + ' car', sum('rushing_yards') + ' yds', sum('rushing_tds') + ' TD',
          sum('receptions') + ' rec'];
      return '<p class="ca-last-start"><span>' + esc(title) + '</span>' +
        esc(games + (games === 1 ? ' game' : ' games') + ' · ' + bits.join(' · ')) +
        (position === 'RB' && tracking.eight_plus_box_rate != null
          ? esc(' · 8+ box ' + pctText(tracking.eight_plus_box_rate)) +
            nflFreqMark(nflAsFreq(rankPosition(trackRanks.eight_plus_box_rate), 'RBs with qualifying tracking data')) :
          '') + '</p>';
    }

    var currentSeasonNo = current ? current.source_season : (stats && stats.season);
    var combinedView = tiles(combined) +
      seasonLine([stats, prior], (prior ? (prior.season || (currentSeasonNo - 1)) + ' + ' : '') +
        (currentSeasonNo || '') + ' Seasons') +
      (combined ? nflBackSplits(combined, spec, opp) : pending('Scheme splits are not published for this player yet.'));
    var currentOnly = profiles.filter(function (p) { return p.source_season === currentSeasonNo; })[0] || null;
    var oppNow = game[oppSide + '_scheme_current'] || {};
    var oppCurrent = { scheme: oppNow, defense: oppNow.defense || null, name: opp.name, nick: opp.nick };
    var currentView = tiles(currentOnly) +
      seasonLine([stats], (currentSeasonNo || '') + ' Season') +
      (currentOnly ? nflBackSplits(currentOnly, spec, oppCurrent)
        : pending('No ' + (currentSeasonNo || 'current') + ' splits are published for this player yet.'));
    return head + nflSeasonViews(combinedView, currentView) + '</section>';
  }

  /* ---- club split tables ---- */

  function nflGradedCell(entry, kind) {
    if (!entry || entry.value == null) return '<td class="num">&mdash;</td>';
    var place = nflTeamRank(entry);
    var tone = place ? rankTone(place.rank, place.of) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + '" title="' +
      esc(entry.label || '') + '">' + esc(nflFormat(entry.value, kind)) + nflBadge(place) + '</td>';
  }

  function nflLedgerEntry(raw, kind, place, label) {
    if (raw == null || !isFinite(Number(raw))) return null;
    var ranked = nflTeamRank(place, place && place.cohort);
    return {
      value: raw,
      text: nflFormat(raw, kind),
      rank: ranked && ranked.rank,
      of: ranked && ranked.of,
      cohort: ranked && ranked.cohort,
      label: label
    };
  }

  function nflSplitTable(heads, rows, first, numeric) {
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split"><thead><tr><th>' +
      esc(first || 'Unit') + '</th>' +
      heads.map(function (h) { return '<th'+(numeric===false?'':' class="num"')+'>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  /* A club's nickname for row labels inside a panel that already names both
     clubs in full: "Chargers Offense" reads, "LAC Offense" is the bare
     abbreviation the public identity gates reject. */
  function nflNick(sport, game, side) {
    var full = String(fullName(sport, game, side) || '');
    return full.split(' ').pop() || full;
  }

  /* Panel title naming both units that meet: "Browns O-Line vs Panthers
     D-Line". The first side is the club the panel is about. */
  function nflVs(sport, game, side, unit, oppUnit) {
    return nflNick(sport, game, side) + ' ' + unit + ' vs ' +
      nflNick(sport, game, nflOther(side)) + ' ' + oppUnit;
  }

  /* The run game: the club's whole rushing unit against the run defense it
     meets, then every ball carrier who made it. Unit figures carry their place
     among the 32 clubs; a carrier's figures are placed among the carriers on
     the slate with a real sample in the same window. */
  var NFL_RUN_UNIT = [
    ['yards_per_game', 'Yds/G', 'num1'], ['yards_per_carry', 'YPC', 'num1'],
    ['epa_per_carry', 'EPA/Car', 'epa'], ['success_rate', 'Succ', 'pct'],
    ['explosive_rate', '10+ Yd', 'pct'], ['stuff_rate', 'Stuffed', 'pct']
  ];

  function nflRunGamePanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var win = nflWindow.pool === 'schemeCurrent' ? 'current' : 'combined';
    var mine = (game[offSide + '_run_game'] || {})[win] || {};
    var theirs = (game[defSide + '_run_game'] || {})[win] || {};
    var seasons = ((game[offSide + '_run_game'] || {}).seasons || {})[win] || [];
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' +
      esc(nflVs(sport, game, offSide, 'Run Game', 'Run Defense')) + '</h3>';
    if (!mine.offense && !theirs.defense) {
      return head + pending('Run game figures are not published for this club.') + '</section>';
    }
    function entry(unit, stat) {
      var rank = (unit.ranks || {})[stat[0]] || {};
      return nflLedgerEntry(unit[stat[0]], stat[2], rank, stat[1]);
    }
    var off = mine.offense || {}, def = theirs.defense || {};
    var sample = [seasons.join(' + '),
      off.games ? off.games + ' games' : '', off.carries ? off.carries + ' designed runs' : ''
    ].filter(Boolean).join(' · ');
    var rows = NFL_RUN_UNIT.map(function (stat) {
      return cfbLedgerRow(stat[1], entry(off, stat), entry(def, stat));
    });
    var html = head + (sample ? '<p class="ca-lineup-context">' + esc(sample) + '</p>' : '') +
      cfbLedgerTable([oNick, 'Run Game'], [dNick, 'Run Defense'], [{ rows: rows }]);

    // Every ball carrier, graded among the slate's carriers in this window.
    var floor = win === 'current' ? 10 : 30;
    function pool(key) {
      return nflPlayerValues(function (t) {
        return (((t.runGame || {})[win] || {}).carriers || [])
          .filter(function (c) { return c.carries >= floor; })
          .map(function (c) { return c[key]; });
      });
    }
    var pools = { yards_per_carry: pool('yards_per_carry'), epa_per_carry: pool('epa_per_carry'),
      success_rate: pool('success_rate') };
    var carriers = availability.available(game, offSide, mine.carriers).filter(function (c) { return c.carries > 0; });
    if (carriers.length) {
      var rows = carriers.map(function (c) {
        // Carriers are placed among every carrier on the slate (a pool near a
        // hundred), so the pill is the percentile, as for defenders.
        function graded(key, kind) {
          return nflPercentileTd(esc(nflFormat(c[key], kind)), nflPlace(pools[key], c[key], true),
            'carriers with ' + floor + '+ carries');
        }
        return '<tr><td class="ca-lineup-name">' + esc(c.player_name) +
          (c.position ? ' <small>' + esc(c.position) + '</small>' : '') + '</td>' +
          '<td class="num">' + esc(String(c.carries)) +
          ' <small>' + esc(pctText(c.carry_share)) + '</small></td>' +
          graded('yards_per_carry', 'num1') + graded('epa_per_carry', 'epa') +
          graded('success_rate', 'pct') +
          '<td class="num">' + esc(String(c.touchdowns || 0)) + '</td></tr>';
      });
      html += '<div class="ca-split-block ca-nfl-carriers"><h4>' + esc(oNick) + ' Ball Carriers</h4>' +
        nflSplitTable(['Car', 'YPC', 'EPA/Car', 'Succ', 'TD'], rows, 'Player') + '</div>';
    }
    return html + '</section>';
  }

  /* The window a scheme panel reads, or nothing when it is not published. */
  function nflSeasonNote(game) {
    var season = (game.scheme_source || {}).season;
    return season ? '<p class="ca-lineup-context">' + esc(season + ' form') + '</p>' : '';
  }

  /* Units form, per evidence window. "2025 + 2026" is the model's form: prior
     seasons blended with this one by games played (the share is published).
     "2026 Only" is this season alone, adjusted for opponents the same way. */
  function nflFormFor(game, side) {
    var form = game[side + '_form'] || {};
    if (nflWindow.pool === 'schemeCurrent') return (form.current || {}).rates || {};
    return form.rates || {};
  }

  function nflFormNote(game) {
    var form = game.away_form || {};
    var season = (game.scheme_source || {}).season;
    if (nflWindow.pool === 'schemeCurrent') {
      return season ? '<p class="ca-lineup-context">' + esc(season + ' form') + '</p>' : '';
    }
    var share = form.live_share;
    return '<p class="ca-lineup-context">' + esc('Model form' +
      (share != null && season ? ' \u00b7 ' + Math.round(share * 100) + '% ' + season : '')) + '</p>';
  }

  var NFL_FORM_LEDGER = [
    ['epa', 'EPA/Play', 'epa'], ['first_down', '1st Down', 'pct'], ['explosive', 'Explosive', 'pct'],
    ['sack', 'Sack', 'pct'], ['turnover', 'Turnover', 'pct']
  ];
  var NFL_PASS_RUN_LEDGER = [
    ['pass_epa', 'Pass EPA', 'epa'], ['pass_success_rate', 'Pass Succ', 'pct'],
    ['rush_epa', 'Rush EPA', 'epa'], ['rush_success_rate', 'Rush Succ', 'pct'],
    ['pass_epa_play_action', 'PA EPA', 'epa']
  ];

  function nflDrivePanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' + esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) +
      '</h3>';
    function formEntry(rates, prefix, stat) {
      var entry = rates[prefix + stat[0]];
      return entry && nflLedgerEntry(entry.value, stat[2],
        { rank: entry.rank, of: entry.of || 32 }, entry.label);
    }
    function schemeEntry(scheme, phase, stat) {
      var raw = nflResponse(scheme, phase)[stat[0]];
      return nflLedgerEntry(raw, stat[2], nflResultRank(scheme, phase, stat[0], raw));
    }
    var html = head + nflBothWindows(function () {
      var off = nflFormFor(game, offSide), def = nflFormFor(game, defSide);
      var oScheme = nflScheme(game, offSide), dScheme = nflScheme(game, defSide);
      var groups = [];
      var hasForm = Object.keys(off).length || Object.keys(def).length;
      if (hasForm) {
        groups.push({ title: 'Team Form', rows: NFL_FORM_LEDGER.map(function (stat) {
          return cfbLedgerRow(stat[1], formEntry(off, 'off_', stat), formEntry(def, 'def_', stat));
        }) });
      }
      if (Object.keys(oScheme).length || Object.keys(dScheme).length) {
        var seasons = (oScheme.source_seasons || dScheme.source_seasons || []).join(' + ');
        groups.push({ title: 'Pass And Run' + (seasons ? ' · ' + seasons + ' Charting' : ''),
          rows: NFL_PASS_RUN_LEDGER.map(function (stat) {
            return cfbLedgerRow(stat[1], schemeEntry(oScheme, 'offense', stat),
              schemeEntry(dScheme, 'defense', stat));
          }) });
      }
      if (!groups.length) return pending('Team form is not published yet.');
      return (hasForm ? nflFormNote(game) : '') +
        cfbLedgerTable([oNick, 'Offense'], [dNick, 'Defense'], groups);
    });

    function perGameBlock(stats, prior, windowLabel) {
    if (!stats || !stats.games) return '';
    var html = '';
      var g = Number(stats.games);
      function perGame(st, read) {
        st = st || {};
        var n = read(st), gp = Number(st.games);
        return n == null || !(gp > 0) ? null : Number(n) / gp;
      }
      // Each per-game figure placed among the clubs on the slate.
      function perCell(read) {
        var v = perGame(stats, read);
        if (v == null) return '<td class="num">—</td>';
        var pool = nflTeamValues(function (t) {
          return perGame(prior ? nflCombineTeam(t.stats, t.statsPrior) : (t.stats || {}), read);
        });
        return nflPlacedTd(v.toFixed(1), nflTeamRank(nflPlace(pool, v, true), 'NFL teams on the published slate'));
      }
      var pace = stats.offensive_plays_per_game;
      var pacePlace = prior
        ? nflTeamRank(nflPlace(nflTeamValues(function (t) {
            var c = nflCombineTeam(t.stats, t.statsPrior); return c && c.offensive_plays_per_game;
          }), pace, true), 'NFL teams on the published slate')
        : nflTeamRank({ rank: stats.offensive_pace_rank, of: stats.offensive_pace_of });
      html += '<div class="ca-split-block"><h4>' + esc(oNick + ' Per Game · ' + windowLabel + ' · ' + g + ' Games') + '</h4>' +
        nflSplitTable(['Pass Yds', 'Rush Yds', 'TD', '1st Downs', 'Plays'], [
          '<tr><td>Offense</td>' +
          perCell(function (st) { return st.passing_yards; }) +
          perCell(function (st) { return st.rushing_yards; }) +
          perCell(function (st) { return safeTotal(st.passing_tds, st.rushing_tds); }) +
          perCell(function (st) { return safeTotal(st.passing_first_downs, st.rushing_first_downs); }) +
          '<td class="num">' + (pace == null ? '—' : esc(Number(pace).toFixed(1)) +
            nflFreqMark(nflAsFreq(pacePlace))) + '</td></tr>']) + '</div>';
    return html;
    }
    var teamNow = game[offSide + '_team_stats'] || {};
    var teamPrior = game[offSide + '_team_stats_prior'] || null;
    var seasonNow = teamNow.season;
    html += nflSeasonViews(
      perGameBlock(nflCombineTeam(teamNow, teamPrior), teamPrior,
        teamPrior ? (seasonNow - 1) + ' + ' + seasonNow : String(seasonNow || '')),
      perGameBlock(teamNow, null, String(seasonNow || '')));
    return html + '</section>';
  }

  var NFL_TRENCH_COLS = [
    ['line_yards', 'Line Yds', 'num2'], ['stuff_rate', 'Stuff', 'pct'],
    ['short_success', 'Short Yd', 'pct'], ['havoc_rate', 'Havoc', 'pct'],
    ['yards_before_contact', 'YBC', 'num2']
  ];

  var NFL_LANES = [
    ['lane_left', 'Run Left'], ['lane_middle', 'Run Middle'], ['lane_right', 'Run Right'],
    ['gap_guard', 'At The Guards'], ['gap_tackle', 'At The Tackles'], ['gap_end', 'Outside The Ends']
  ];
  var NFL_RUN_LANE_MIN = 5;

  function nflRunLanePlace(line, group, lane, metric, higher) {
    function eligibleValue(peer) {
      var splits = peer[group] || {};
      var sample = splits[lane];
      if (!sample) return null;
      if (metric === 'usage') return splits.carries > 0 ? sample.carries / splits.carries : null;
      return sample.carries >= NFL_RUN_LANE_MIN ? sample[metric] : null;
    }
    var value = eligibleValue(line);
    if (value == null || !Number.isFinite(Number(value))) return null;
    var sample = line[group][lane];
    var basis = metric === 'usage' ? 'NFL offenses with recorded carries in this lane' :
      (group === 'offense_run_lanes' ? 'NFL offenses' : 'NFL defenses') + ' with 5+ carries in this lane';
    var published = nflTeamRank((sample.league_ranks || {})[metric], basis);
    if (published) return published;
    // Older boards carry observed splits. Compare one eligible club at a
    // time, using the same season and direction on the published slate.
    var pool = nflTeamValues(function (t) {
      return Number(t.line.season) === Number(line.season) ? eligibleValue(t.line) : null;
    });
    return nflTeamRank(nflPlace(pool, value, higher, 2), basis + ' on the published slate');
  }

  function nflRunLaneCell(line, group, lane, metric, kind, higher) {
    var sample = (line[group] || {})[lane];
    if (!sample || sample[metric] == null) return '<td class="num">&mdash;</td>';
    var thin = !(sample.carries >= NFL_RUN_LANE_MIN);
    var value = esc(nflFormat(sample[metric], kind)) + (thin ? ' <small class="is-low">' +
      esc(sample.carries) + ' car</small>' : '');
    return nflPlacedTd(value, nflRunLanePlace(line, group, lane, metric, higher), thin);
  }

  /* One possession in the trenches: this offense's line directly above the
     front it meets, then the run game by direction in the Pitch Mix shape -
     where the offense runs, what it has done there, what the front has
     allowed there. */
  function nflTrenchPanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var offLine = game[offSide + '_line_stats'] || {};
    var oLine = offLine.offense;
    var dLine = game[defSide + '_line_stats'] || {};
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' + esc(nflVs(sport, game, offSide, 'O-Line', 'D-Line')) +
      '</h3>' + nflSeasonNote(game);
    if (!oLine && !dLine.defense) return head + pending('Line data is not published yet.') + '</section>';
    var html = head + nflSplitTable(NFL_TRENCH_COLS.map(function (c) { return c[1]; }), [
      [oNick + ' OL', oLine || {}], [dNick + ' DL', dLine.defense || {}]
    ].map(function (row) {
      return '<tr><td>' + esc(row[0]) + '</td>' + NFL_TRENCH_COLS.map(function (col) {
        return nflGradedCell(row[1][col[0]], col[2]);
      }).join('') + '</tr>';
    }));

    var teamRuns = offLine.offense_run_lanes || {};
    var front = dLine.defense_run_front || {};
    var rows = NFL_LANES.map(function (spec) {
      var lane = spec[0], mine = teamRuns[lane];
      if (!mine && !front[lane]) return '';
      var share = mine && teamRuns.carries > 0 ? Number(mine.carries) / teamRuns.carries : null;
      var usage = nflAsFreq(nflRunLanePlace(offLine, 'offense_run_lanes', lane, 'usage', true));
      return '<tr><td class="ca-lineup-name">' + esc(spec[1]) + '</td>' + nflUsageCell(share, usage) +
        nflRunLaneCell(offLine, 'offense_run_lanes', lane, 'yards_per_carry', 'num1', true) +
        nflRunLaneCell(dLine, 'defense_run_front', lane, 'yards_per_carry_allowed', 'num1', false) +
        nflRunLaneCell(dLine, 'defense_run_front', lane, 'stuff_rate', 'pct', true) + '</tr>';
    }).filter(Boolean);
    if (rows.length) {
      var sampleNote = oNick + ' designed runs vs ' + dNick + ' run defense · ' + (offLine.season || dLine.season);
      html += '<div class="ca-split-block"><h4>Team Run Direction</h4>' +
        '<p class="ca-lineup-context">' + esc(sampleNote) + '</p>' +
        nflMixTable('Direction', [oNick + ' YPC', dNick + ' Allowed', 'Stuff'], rows) +
        '</div>';
    } else {
      html += pending('Comparable run-direction splits are unavailable for this matchup.');
    }
    return html + '</section>';
  }

  function nflCatchersPanel(sport, game, side) {
    var defSide = nflOther(side);
    var players = availability.available(game, side, game[side + '_player_stats']).filter(function (p) {
      return Number(p.targets) > 0;
    }).sort(function (a, b) { return Number(b.targets) - Number(a.targets); });
    var head = '<section class="ca-form-panel"><h3>' +
      esc(nflVs(sport, game, side, 'Pass Catchers', 'Pass Defense')) + '</h3>';
    if (!players.length) return head + pending('Receiving totals are not published yet.') + '</section>';
    // Receivers are placed among players at the same position on the slate
    // with at least three targets. Receptions, yards and yards per target are
    // production, so they are graded; targets and target share are
    // opportunity, so they carry the league marker instead.
    var MIN_TARGETS = 3;
    function perG(p, key) {
      var gp = Number(p.games) || 0;
      return gp > 0 && p[key] != null ? Number(p[key]) / gp : null;
    }
    function yPerT(p) {
      return Number(p.targets) ? Number(p.receiving_yards) / Number(p.targets) : null;
    }
    function volumeTable(list, combinedPool) {
    function posPool(position, read) {
      return nflPlayerValues(function (t) {
        var rowsForTeam = combinedPool ? nflCombineRows(t.players, t.playersPrior) : (t.players || []);
        return rowsForTeam.filter(function (x) {
          return x.position === position && Number(x.targets) >= MIN_TARGETS;
        }).map(read);
      });
    }
    // Pass catchers are receivers, tight ends and backs; a quarterback's
    // trick-play catch is not a receiving line.
    list = (list || []).filter(function (p) { return ['WR', 'TE', 'RB', 'FB'].indexOf(p.position) >= 0; });
    var rows = list.map(function (p) {
      var stText = availability.status(game, side, p);
      // Every row is graded (owner rule): a player under the target floor is
      // placed against the players above it; his targets are in the row.
      var thin = false;
      var cohort = p.position + 's with ' + MIN_TARGETS + '+ targets on the published slate' +
        (p.targets < MIN_TARGETS ? ' · placement for a below-threshold sample' : '');
      function placed(value, read, digits) {
        if (value == null) return '<td class="num">—</td>';
        return nflPlacedTd(esc(Number(value).toFixed(digits)),
          thin ? null : nflPlace(posPool(p.position, read), value, true), thin, cohort);
      }
      function marked(text, value, read) {
        if (value == null) return '<td class="num">—</td>';
        return '<td class="num">' + esc(text) +
          (thin ? '' : nflFreqMark(nflAsFreq(nflPlace(posPool(p.position, read), value, true), cohort))) + '</td>';
      }
      var tgtG = perG(p, 'targets');
      return '<tr' + (thin ? ' class="is-thin"' : '') + '><td>' + esc(p.player_name) +
        ' <span class="ca-lineup-player__position">' + esc(p.position) + '</span>' +
        (stText ? ' <span class="ca-rank ' + (NFL_STATUS_TAG[stText] || [0, 'c-poor'])[1] + '">' +
          esc((NFL_STATUS_TAG[stText] || [stText])[0]) + '</span>' : '') +
        (thin ? ' <span class="ca-thin-tag" title="Under ' + MIN_TARGETS + ' targets: printed, not graded">Low n</span>' : '') +
        '</td>' +
        marked(tgtG == null ? '—' : tgtG.toFixed(1), tgtG, function (x) { return perG(x, 'targets'); }) +
        placed(perG(p, 'receptions'), function (x) { return perG(x, 'receptions'); }, 1) +
        placed(perG(p, 'receiving_yards'), function (x) { return perG(x, 'receiving_yards'); }, 1) +
        placed(yPerT(p), yPerT, 1) +
        marked(p.target_share == null ? '—' : pctText(p.target_share), p.target_share,
          function (x) { return x.target_share; }) +
        placed(p.receiving_tds, function (x) { return x.receiving_tds; }, 0) + '</tr>';
    });
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split">' +
      '<thead><tr><th>Player</th><th class="num">Tgt/G</th><th class="num">Rec/G</th>' +
      '<th class="num">Yds/G</th><th class="num">Y/Tgt</th><th class="num">Share</th><th class="num">TD</th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    var combinedPlayers = nflCombineRows(players, game[side + '_player_stats_prior']);
    var seasonNow = (players[0] || {}).season;
    var volume = nflSeasonViews(
      '<div class="ca-split-block"><h4>' + esc((seasonNow ? (seasonNow - 1) + ' + ' + seasonNow : '') +
        ' Per Game') + '</h4>' + volumeTable(combinedPlayers, true) + '</div>',
      '<div class="ca-split-block"><h4>' + esc((seasonNow || '') + ' Per Game') + '</h4>' +
        volumeTable(players, false) + '</div>');
    var mine = (((game[side + '_scheme'] || {}).offense || {}).target_share) || {};
    var allowed = (((game[defSide + '_scheme'] || {}).defense || {}).target_share) || {};
    var mixRows = [['wr', 'Wide Receivers'], ['te', 'Tight Ends'], ['rb', 'Running Backs']].map(function (k) {
      var v = mine['target_share_' + k[0] + '_all'], a = allowed['target_share_' + k[0] + '_all'];
      if (v == null && a == null) return '';
      var tk = 'target_share_' + k[0] + '_all';
      return '<tr><td class="ca-lineup-name">' + k[1] + '</td>' +
        nflUsageCell(v, nflFreqRank(game[side + '_scheme'], 'offense', 'target_share', tk)) +
        nflRateCell(a, nflFreqRank(game[defSide + '_scheme'], 'defense', 'target_share', tk)) + '</tr>';
    }).filter(Boolean);
    var mixHtml = mixRows.length
      ? '<div class="ca-split-block"><h4>Target Distribution</h4>' +
        nflMixTable('Position', [nflNick(sport, game, defSide) + ' Allow'], mixRows) + '</div>' : '';
    return head + volume + mixHtml + nflReceiverMatrices(sport, game, side, players) + '</section>';
  }

  /* Receivers against coverage, in the quarterback table's shape: rows are the
     defense's looks in families, one column per leading receiver (yards per
     target, graded among receivers at his position in that same look, with
     the target count beside it), and the last column how often this week's
     opponent shows the look. One table per season, because coverage and
     pressure come from participation data the current season does not have
     yet; the current table carries its charted blitz and box looks. */
  var NFL_REC_GROUPS = [
    ['Coverage', ['man', 'zone', 'single_high', 'two_high']],
    ['Pass Rush', ['blitz', 'no_blitz', 'pressure', 'clean']],
    ['Box', ['light_box', 'stacked_box']],
    ['Scheme', ['play_action', 'no_play_action', 'motion', 'no_motion']],
    ['Shells', ['cover_0', 'cover_1', 'cover_2', 'cover_2_man', 'cover_3', 'cover_4', 'cover_6']]
  ];
  var NFL_REC_FLOOR = 3;
  /* What "success" means against a look, one stat at a time (owner
     2026-10-01: WR success against specific coverages and schemes). Success
     is nflfastR's: the target gained the offense positive EPA. */
  var NFL_REC_METRICS = [
    ['yards_per_target', 'Yds / Tgt', 'yds'], ['success_rate', 'Success %', 'pct'],
    ['catch_rate', 'Catch %', 'pct'], ['epa_per_target', 'EPA / Tgt', 'epa']
  ];

  // "Marvin Mims Jr." -> "Mims": a generational suffix is never the surname.
  function nflSurname(name) {
    var parts = String(name || '').trim().split(/\s+/);
    while (parts.length > 1 && /^(jr|sr|ii|iii|iv|v)\.?$/i.test(parts[parts.length - 1])) parts.pop();
    return parts[parts.length - 1] || '';
  }

  function nflReceiverMatrices(sport, game, side, statRows) {
    var profiles = availability.available(game, side, game[side + '_player_coverage']);
    if (!profiles.length) return '';
    // The leading receivers this season, by targets, who have a split profile.
    var order = (statRows || []).map(function (p) { return playerNameKey(p.player_name); });
    var byName = {};
    profiles.forEach(function (p) {
      var k = playerNameKey(p.player_name);
      (byName[k] = byName[k] || []).push(p);
    });
    var leaders = order.filter(function (k) { return byName[k]; }).slice(0, 3);
    if (!leaders.length) return '';
    var oppSide = nflOther(side);
    var oppScheme = game[oppSide + '_scheme'] || {};
    var oppDef = oppScheme.defense || null;
    var oppNick = nflNick(sport, game, oppSide);
    var seasons = profiles.map(function (p) { return p.source_season; });
    var now = Math.max.apply(null, seasons);

    function metricText(value, kind) {
      if (kind === 'pct') return pctText(value);
      if (kind === 'epa') return epaText(value);
      return Number(value).toFixed(1);
    }

    function matrix(cols, title, oppScheme, metric) {
      metric = metric || NFL_REC_METRICS[0];
      var key = metric[0];
      var oppDef = (oppScheme || {}).defense || null;
      var looks = {};
      cols.forEach(function (p, i) {
        ((p && p.splits) || []).forEach(function (sp) { (looks[sp.coverage] = looks[sp.coverage] || [])[i] = sp; });
      });
      var body = '';
      NFL_REC_GROUPS.forEach(function (g) {
        var present = g[1].filter(function (look) { return looks[look]; });
        if (!present.length) return;
        body += '<tr class="ca-split-group"><th colspan="' + (leaders.length + 2) + '" scope="colgroup">' +
          esc(g[0]) + '</th></tr>';
        present.forEach(function (look) {
          var cells = leaders.map(function (k, i) {
            var sp = looks[look][i];
            // Every cell reads the same way: a figure and a pill beside it.
            // Graded cells carry the tier-coloured rank; a split under the
            // target floor carries a neutral pill with its target count.
            if (!sp || sp[key] == null) {
              var tg = sp && sp.targets ? Number(sp.targets) : 0;
              return '<td class="num is-low-cell" title="' + tg + ' targets in this look">' +
                '<span class="ca-rank is-sample">' + tg + ' tgt</span></td>';
            }
            var thin = Number(sp.targets) < NFL_REC_FLOOR;
            var rank = (sp.league_ranks || {})[key];
            var title = Number(sp.yards_per_target).toFixed(1) + ' yds/tgt · ' +
              pctText(sp.catch_rate) + ' catch · ' + epaText(sp.epa_per_target) + ' EPA/tgt' +
              (sp.success_rate != null ? ' · ' + pctText(sp.success_rate) + ' success' : '');
            return '<td class="num' + (rank && !thin ? ' ' + rankTone(rank.place, rank.of) : '') +
              (thin ? ' is-low-cell' : '') + '" title="' + esc(title +
              (rank && !thin ? ' · ' + rank.place + ordinal(rank.place) + ' of ' + rank.of : '') +
              ' · ' + sp.targets + ' targets' +
              (thin ? ' · under ' + NFL_REC_FLOOR + ' targets, not graded' : '')) + '">' +
              esc(metricText(sp[key], metric[2])) +
              (thin ? '<span class="ca-rank is-sample">' + esc(sp.targets) + ' tgt</span>'
                : nflBadge(rank, 'qualified ' + byName[k][0].position + 's in this look')) + '</td>';
          }).join('');
          var shows = oppDef ? nflOppShows(oppDef, look) : null;
          body += '<tr><td>' + esc(NFL_LOOK_LABEL[look] || look) + '</td>' + cells +
            '<td class="num ca-opp-shows">' + (shows == null ? '—'
              : esc(pctText(shows)) + nflOppShowsMark(oppScheme, look)) + '</td></tr>';
        });
      });
      if (!body) return pending('No receiver splits are published for this window yet.');
      var heads = leaders.map(function (k) {
        var p = byName[k][0];
        return '<th class="num">' + esc(nflSurname(p.player_name)) + ' ' +
          '<span class="ca-lineup-player__position">' + esc(p.position) + '</span></th>';
      }).join('');
      return '<div class="ca-split-block"><h4>' + esc(title) + '</h4>' +
        '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split">' +
        '<thead><tr><th>Look</th>' + heads + '<th class="num ca-opp-shows">' + esc(oppNick) +
        ' Show</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
    }

    var combinedCols = leaders.map(function (k) {
      var rows = byName[k];
      if (rows.length === 1) return rows[0];
      return { splits: nflRankMerged(nflMergeSplits(rows, 'REC'), 'REC', rows[0].position) };
    });
    var currentCols = leaders.map(function (k) {
      return byName[k].filter(function (p) { return p.source_season === now; })[0] || null;
    });
    var allSeasons = seasons.filter(function (y, i, a) { return a.indexOf(y) === i; }).sort();
    function switchable(cols, label, scheme) {
      var buttons = NFL_REC_METRICS.map(function (m, i) {
        return '<button type="button" class="ca-rec-metric__btn' + (i ? '' : ' is-on') +
          '" data-rec-metric="' + m[0] + '" aria-pressed="' + (i ? 'false' : 'true') + '">' +
          esc(m[1]) + '</button>';
      }).join('');
      var views = NFL_REC_METRICS.map(function (m, i) {
        return '<div data-rec-metric-view="' + m[0] + '"' + (i ? ' hidden' : '') + '>' +
          matrix(cols, label + ' Receivers By Coverage And Scheme · ' + m[1], scheme, m) + '</div>';
      }).join('');
      return '<div class="ca-rec-metric"><div class="ca-rec-metric__bar" role="group" ' +
        'aria-label="Receiver stat">' + buttons + '</div>' + views + '</div>';
    }
    return nflSeasonViews(
      switchable(combinedCols, allSeasons.join(' + '), oppScheme),
      switchable(currentCols, String(now), game[oppSide + '_scheme_current'] || {}));
  }

  /* ---- red zone: trips, conversion and who gets the ball inside the 20 ----
     outputs/nfl_red_zone.py. A trip is a drive with a snap at the 20 or closer;
     TD% and Score% count scores snapped from there. Ranks are league places,
     1st = best for the side (fewest trips allowed is 1st for a defense). */
  var NFL_RZ_UNIT = [
    ['trips_per_game', 'Trips / G', 'num2'], ['trip_rate', 'Trip Rate', 'pct'],
    ['td_rate', 'TD%', 'pct'], ['score_rate', 'Score%', 'pct'],
    ['epa_per_play', 'EPA / Play', 'epa']
  ];
  var NFL_RZ_FLOOR = { target_share: 3, carry_share: 3, qb: 8 };

  function nflRzThinTag(floor, unit) {
    return ' <span class="ca-thin-tag" title="Under ' + floor + ' red zone ' + unit +
      ': printed, not graded">Low n</span>';
  }

  function nflRedZonePanel(sport, game, offSide, windowKey) {
    var defSide = nflOther(offSide);
    var own = ((game[offSide + '_red_zone'] || {})[windowKey]) || null;
    var opp = ((game[defSide + '_red_zone'] || {})[windowKey]) || null;
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' +
      esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) + '</h3>';
    if (!own || !opp) return head + pending('Red zone data is not published yet.') + '</section>';
    var off = own.offense || {}, def = opp.defense || {};
    var html = head + '<p class="ca-lineup-context">' + esc(
      oNick + ' ' + off.trips + ' trips on ' + off.drives + ' drives · ' +
      dNick + ' allowed ' + def.trips + ' on ' + def.drives) + '</p>';

    var oRanks = (own.ranks || {}).offense || {}, dRanks = (opp.ranks || {}).defense || {};
    var unitRows = NFL_RZ_UNIT.map(function (stat) {
      return cfbLedgerRow(stat[1],
        nflLedgerEntry(off[stat[0]], stat[2], oRanks[stat[0]]),
        nflLedgerEntry(def[stat[0]], stat[2], dRanks[stat[0]]));
    });
    // Pass rate keeps its frequency rank without a performance bar.
    unitRows.push(cfbLedgerRow('Pass Rate',
      nflLedgerEntry(off.pass_rate, 'pct'), nflLedgerEntry(def.pass_rate, 'pct'),
      [nflFreqMark(nflAsFreq(nflTeamRank(oRanks.pass_rate))), nflFreqMark(nflAsFreq(nflTeamRank(dRanks.pass_rate)))]));
    html += cfbLedgerTable([oNick, 'Offense'], [dNick, 'Defense'], [{ rows: unitRows }]);

    // Where the targets go inside the 20, beside where this defense lets them go.
    var ownPos = own.offense_by_position || {}, oppPos = opp.defense_by_position || {};
    var posRows = [['WR', 'Wide Receivers'], ['TE', 'Tight Ends'], ['RB', 'Running Backs']]
      .filter(function (g) { return ownPos[g[0]] || oppPos[g[0]]; })
      .map(function (g) {
        var mine = ownPos[g[0]] || {}, theirs = oppPos[g[0]] || {};
        return '<tr><td class="ca-lineup-name">' + esc(g[1]) + '</td>' +
          nflUsageCell(mine.target_share, nflAsFreq(nflTeamRank(mine.target_share_rank))) +
          nflRateCell(theirs.target_share, nflAsFreq(nflTeamRank(theirs.target_share_rank))) +
          (theirs.receiving_tds_per_game == null ? '<td class="num">&mdash;</td>'
            : nflPlacedTd(esc(nflFormat(theirs.receiving_tds_per_game, 'num2')),
              nflTeamRank(theirs.receiving_tds_rank), false)) + '</tr>';
      });
    if (posRows.length) {
      html += '<div class="ca-split-block"><h4>Targets By Position</h4>' +
        nflMixTable('Position', [dNick + ' Allow', dNick + ' TD / G Allowed'], posRows) + '</div>';
    }

    var players = availability.available(game, offSide, own.players);
    function shareCell(p, metric) {
      var rank = (p.ranks || {})[metric];
      var thin = !rank;
      return nflPlacedTd(esc(nflFormat(p[metric], 'pct')), rank, thin, 'qualified ' + p.position + 's inside the 20');
    }
    function nameCell(p, thin, floor, unit, showPos) {
      return '<td>' + esc(p.player_name) +
        (showPos ? ' <span class="ca-lineup-player__position">' + esc(p.position) + '</span>' : '') +
        (thin ? nflRzThinTag(floor, unit) : '') + '</td>';
    }

    // The starter's line; a backup with a snap or two inside the 20 is noise.
    var qbs = players.filter(function (p) { return p.position === 'QB' && p.dropbacks > 0; });
    qbs = qbs.filter(function (p, i) { return i === 0 || p.dropbacks >= 3; }).slice(0, 2);
    if (qbs.length) {
      html += '<div class="ca-split-block"><h4>Passing Inside The 20</h4>' +
        nflSplitTable(['DB', 'ATT', 'Cmp%', 'TD', 'INT', 'EPA/DB'], qbs.map(function (p) {
          var r = p.ranks || {};
          var thin = !r.epa_per_dropback;
          return '<tr' + (thin ? ' class="is-thin"' : '') + '>' +
            nameCell(p, thin, NFL_RZ_FLOOR.qb, 'dropbacks') +
            '<td class="num">' + p.dropbacks + '</td><td class="num">' + p.attempts + '</td>' +
            nflPlacedTd(esc(nflFormat(p.completion_rate, 'pct')), r.completion_rate,
              thin || !r.completion_rate, 'qualified passers inside the 20') +
            '<td class="num">' + p.passing_tds + '</td><td class="num">' + p.interceptions + '</td>' +
            nflPlacedTd(esc(nflFormat(p.epa_per_dropback, 'epa')), r.epa_per_dropback, thin,
              'qualified passers inside the 20') +
            '</tr>';
        }), 'Quarterback') + '</div>';
    }

    var catchers = players.filter(function (p) { return p.position !== 'QB' && p.targets > 0; })
      .sort(function (a, b) { return b.targets - a.targets || b.target_share - a.target_share; })
      .slice(0, 6);
    if (catchers.length) {
      html += '<div class="ca-split-block"><h4>Targets Inside The 20</h4>' +
        nflSplitTable(['TGT', 'Tgt Share', 'Inside 10', 'TD'], catchers.map(function (p) {
          var thin = !(p.ranks || {}).target_share;
          return '<tr' + (thin ? ' class="is-thin"' : '') + '>' +
            nameCell(p, thin, NFL_RZ_FLOOR.target_share, 'targets', true) +
            '<td class="num">' + p.targets + '</td>' + shareCell(p, 'target_share') +
            '<td class="num">' + p.targets_inside10 + '</td>' +
            '<td class="num">' + p.receiving_tds + '</td></tr>';
        }), 'Player') + '</div>';
    }

    var carriers = players.filter(function (p) { return p.position === 'RB' && p.carries > 0; })
      .sort(function (a, b) { return b.carries - a.carries; }).slice(0, 4);
    if (carriers.length) {
      html += '<div class="ca-split-block"><h4>Carries Inside The 20</h4>' +
        nflSplitTable(['CAR', 'Car Share', 'Inside 5', 'TD'], carriers.map(function (p) {
          var thin = !(p.ranks || {}).carry_share;
          return '<tr' + (thin ? ' class="is-thin"' : '') + '>' +
            nameCell(p, thin, NFL_RZ_FLOOR.carry_share, 'carries') +
            '<td class="num">' + p.carries + '</td>' + shareCell(p, 'carry_share') +
            '<td class="num">' + p.carries_inside5 + '</td>' +
            '<td class="num">' + p.rushing_tds + '</td></tr>';
        }), 'Player') + '</div>';
    }
    return html + '</section>';
  }

  // Both evidence windows, as the season toggle expects.
  /* Special teams and situational figures (2026-11-18 audit;
     outputs/nfl_special_teams.py), head to head in the page's two evidence
     windows. Each figure is ranked among the 32 clubs; a kicking or
     fourth-down rate names the tries it rests on in its tooltip. */
  var NFL_SPECIAL = [['fg_short', 'FG% Under 40'], ['fg_40s', 'FG% 40-49'], ['fg_long', 'FG% 50+'], ['xp_pct', 'XP%'],
    ['net_punt', 'Net Punt'], ['opp_net_punt', 'Opp Net Punt'], ['kr_avg', 'Kick Return Avg'],
    ['kr_allowed', 'Kick Return Allowed'], ['pr_avg', 'Punt Return Avg'], ['pr_allowed', 'Punt Return Allowed'],
    ['start_own', 'Start (Own Yard Line)'], ['start_opp', 'Opp Start (Own Yard Line)']];
  var NFL_SITUATIONAL = [['fourth_go_rate', '4th-Down Go Rate'], ['fourth_conv', '4th-Down Conversion'],
    ['fourth_conv_allowed', '4th-Down Conv Allowed'], ['two_min_epa', 'Two-Minute EPA/Play'],
    ['two_min_epa_allowed', 'Two-Minute EPA Allowed'], ['penalties_pg', 'Penalties/G'],
    ['penalty_yds_pg', 'Penalty Yds/G'], ['drawn_pg', 'Penalties Drawn/G']];
  function nflSpecialTable(sport, game, rows, title, windowKey) {
    var a = ((game.away_special_teams || {})[windowKey]) || {};
    var h = ((game.home_special_teams || {})[windowKey]) || {};
    return cfbHeadToHead(sport, game, fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') + ' ' + title,
      '', rows.map(function (r) { return [r[1], a[r[0]] || null, h[r[0]] || null]; }));
  }
  function nflSpecial(sport, game, rows, title) {
    return nflSeasonViews(nflSpecialTable(sport, game, rows, title, 'combined'),
      nflSpecialTable(sport, game, rows, title, 'current'));
  }

  function nflRedZone(sport, game) {
    return nflSeasonViews(nflDuo(nflRedZonePanel, sport, game, 'combined'),
      nflDuo(nflRedZonePanel, sport, game, 'current'));
  }

  function nflDuo(fn, sport, game) {
    var args = Array.prototype.slice.call(arguments, 3);
    return '<div class="ca-detail-duo ca-nfl-duo">' +
      fn.apply(null, [sport, game, 'away'].concat(args)) +
      fn.apply(null, [sport, game, 'home'].concat(args)) + '</div>';
  }

  /* The NFL desk is read a group at a time. Each tab names the sections it
     shows; a section id in the address opens the tab that holds it. */
  /* ---------------------------------------------------------------------
   * Game log: every game a club has played - the final, the noise-adjusted
   * score (outputs/nfl_game_log.py: kicks at league make rates, fumbles at
   * the league's average outcome, return and defensive scores at the league
   * rate), and the surface and advanced numbers behind it. Each game's rates
   * carry their percentile among all team-games this season; the season row
   * carries the club's place among the 32.
   * ------------------------------------------------------------------ */
  var NFL_GAME_LOG_URL = '/data/public/nfl/game_logs.json';
  var nflGameLogPromise = null;

  function loadNflGameLogs() {
    if (nflGameLogPromise) return nflGameLogPromise;
    nflGameLogPromise = fetchJson(NFL_GAME_LOG_URL).catch(function () { return null; });
    return nflGameLogPromise;
  }

  // The definition rides on the column header's tooltip, not as page copy.
  var NFL_NOISE_NOTE = 'Final score with the luck taken out: field goals and extra points at the ' +
    'league make rate for their distance, and fumbles at the league’s average fumble outcome. ' +
    'Return and defensive touchdowns count as scored: they repeat.';

  // [key, header, kind, higher is better]
  var NFL_LOG_RATES = [
    ['off_epa_play', 'Off EPA/Play', 'epa', true],
    ['def_epa_play', 'Def EPA/Play', 'epa', false],
    ['off_success', 'Off Success', 'pct', true],
    ['def_success', 'Def Success', 'pct', false],
    ['yards_per_play', 'Yds/Play', 'num1', true],
    ['yards_per_play_allowed', 'Allowed/Play', 'num1', false],
    ['turnover_margin', 'TO ±', 'signed', true],
    ['third_down', '3rd Down', 'pct', true]
  ];

  function nflLogValue(v, kind) {
    if (kind === 'signed') return (v > 0 ? '+' : '') + Math.round(v);
    return nflFormat(v, kind);
  }

  function nflLogResult(points, oppPoints, digits) {
    var letter = points > oppPoints ? 'W' : (points < oppPoints ? 'L' : 'T');
    return '<span class="ca-log-result" data-result="' + letter + '"><b>' + letter + '</b> ' +
      esc(Number(points).toFixed(digits)) + '–' + esc(Number(oppPoints).toFixed(digits)) + '</span>';
  }

  /* Margin by game: the actual margin as a solid bar and the noise-adjusted
     margin as an outlined bar beside it, on one shared scale. */
  function nflMarginStrip(games) {
    var top = Math.max(7, Math.max.apply(null, games.map(function (g) {
      return Math.max(Math.abs(g.points - g.opp_points), Math.abs(g.adj_points - g.opp_adj_points));
    })));
    // Room above and below the bars for each bar's own figure.
    var H = 132, mid = H / 2, reach = mid - 22, step = 84, W = games.length * step;
    function bar(x, margin, cls, digits) {
      var h = Math.max(2, Math.abs(margin) / top * reach);
      var y = margin >= 0 ? mid - h : mid;
      var label = (margin > 0 ? '+' : '') + margin.toFixed(digits);
      var ty = margin >= 0 ? y - 5 : y + h + 14;
      return '<rect class="' + cls + (margin >= 0 ? ' is-up' : ' is-down') + '" x="' + x +
        '" y="' + y.toFixed(1) + '" width="22" height="' + h.toFixed(1) + '" rx="3"/>' +
        '<text class="ca-log-figure" x="' + (x + 11) + '" y="' + ty.toFixed(1) + '">' + label + '</text>';
    }
    var body = games.map(function (g, i) {
      var x = i * step + 14;
      var actual = g.points - g.opp_points, adjusted = g.adj_points - g.opp_adj_points;
      return '<g><title>' + (g.__label ? esc(g.__label) : 'Week ' + g.week) + ' ' + (g.home ? 'vs ' : '@ ') + g.opp + ': final ' +
        (actual > 0 ? '+' : '') + actual + ', noise-adjusted ' + (adjusted > 0 ? '+' : '') +
        adjusted.toFixed(1) + '</title>' +
        bar(x, actual, 'ca-log-bar', 0) + bar(x + 28, adjusted, 'ca-log-bar ca-log-bar--adj', 1) +
        '<text x="' + (x + 25) + '" y="' + (H + 16) + '">' + (g.__label ? esc(g.__label) + ' ' + esc(g.opp) :
        'W' + g.week + ' ' + (g.home ? 'vs' : '@') + ' ' + esc(g.opp)) + '</text></g>';
    }).join('');
    return '<figure class="ca-log-strip"><svg viewBox="0 0 ' + W + ' ' + (H + 22) + '" width="' + W +
      '" height="' + (H + 22) + '" role="img" aria-label="Final and noise-adjusted margin by game">' +
      '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '"/>' + body + '</svg>' +
      '<figcaption><span class="ca-log-key"></span>Final Margin' +
      '<span class="ca-log-key ca-log-key--adj"></span>Noise-Adjusted Margin</figcaption></figure>';
  }

  // The club's season row: game rates averaged, then placed among the 32.
  function nflLogSeason(logs) {
    var teams = (logs && logs.teams) || {};
    var avg = {};
    Object.keys(teams).forEach(function (code) {
      var games = teams[code];
      var row = { points: 0, opp_points: 0, adj: 0, opp_adj: 0 };
      games.forEach(function (g) {
        row.points += g.points / games.length; row.opp_points += g.opp_points / games.length;
        row.adj += g.adj_points / games.length; row.opp_adj += g.opp_adj_points / games.length;
      });
      NFL_LOG_RATES.forEach(function (spec) {
        var vals = games.map(function (g) { return g[spec[0]] && g[spec[0]].value; })
          .filter(function (v) { return v != null; });
        row[spec[0]] = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
      });
      avg[code] = row;
    });
    NFL_LOG_RATES.forEach(function (spec) {
      var pool = Object.keys(avg).map(function (c) { return avg[c][spec[0]]; })
        .filter(function (v) { return v != null; });
      Object.keys(avg).forEach(function (c) {
        var v = avg[c][spec[0]];
        if (v == null) return;
        var ahead = pool.filter(function (o) { return spec[3] ? o > v : o < v; }).length;
        avg[c][spec[0]] = { value: v, rank: ahead + 1, of: pool.length };
      });
    });
    return avg;
  }

  /* Each game's rates placed among the clubs that played that week, so a
     game cell reads as a rank of the 32, the same scale as the season row. */
  function nflLogWeekRanks(logs) {
    var teams = (logs && logs.teams) || {};
    var weeks = {};
    Object.keys(teams).forEach(function (code) {
      teams[code].forEach(function (g) { (weeks[g.week] = weeks[g.week] || []).push(g); });
    });
    var ranks = {};
    Object.keys(weeks).forEach(function (wk) {
      NFL_LOG_RATES.forEach(function (spec) {
        var pool = weeks[wk].map(function (g) { return g[spec[0]] && g[spec[0]].value; })
          .filter(function (v) { return v != null; });
        weeks[wk].forEach(function (g) {
          var e = g[spec[0]];
          if (!e || e.value == null) return;
          var ahead = pool.filter(function (o) { return spec[3] ? o > e.value : o < e.value; }).length;
          (ranks[g.game_id + '|' + g.opp] = ranks[g.game_id + '|' + g.opp] || {})[spec[0]] =
            { rank: ahead + 1, of: pool.length };
        });
      });
    });
    return ranks;
  }

  function nflGameLogPanel(sport, game, side, logs) {
    var head = '<section class="ca-form-panel ca-log-panel"><h3>' +
      esc(nflNick(sport, game, side) + ' Game Log') + '</h3>';
    if (logs === undefined) return head + pending('Game logs are loading.') + '</section>';
    var games = (((logs || {}).teams) || {})[game[side]];
    if (!games || !games.length) {
      return head + pending('No completed games are published for this club yet.') + '</section>';
    }
    var season = nflLogSeason(logs)[game[side]];
    var weekRanks = nflLogWeekRanks(logs);
    var heads = ['Final', 'Noise-Adj'].concat(NFL_LOG_RATES.map(function (s) { return s[1]; }));
    var rows = games.map(function (g) {
      return '<tr><td>W' + g.week + ' ' + (g.home ? 'vs ' : '@ ') + esc(g.opp) + '</td>' +
        '<td class="num">' + nflLogResult(g.points, g.opp_points, 0) + '</td>' +
        '<td class="num">' + nflLogResult(g.adj_points, g.opp_adj_points, 1) + '</td>' +
        NFL_LOG_RATES.map(function (spec) {
          var e = g[spec[0]];
          if (!e || e.value == null) return '<td class="num ca-vs-none">No Plays</td>';
          var rawRank = (weekRanks[g.game_id + '|' + g.opp] || {})[spec[0]];
          var r = rawRank && teamScaled(rawRank.rank, rawRank.of, NFL_TEAM_COUNT);
          var extra = spec[0] === 'third_down' ? ' (' + g.third_down_made + '/' + g.third_down_att + ')' : '';
          var week = 'NFL team-games in Week ' + g.week;
          var label = r ? teamScaledLabel(r, rawRank.rank, r.pool ? 'on the NFL team scale' : week, week) : '';
          return '<td class="num ' + (r ? rankTone(r.rank, r.of) : '') + '" title="' + esc(spec[1] + ' · ' +
            label + extra) + '">' +
            esc(nflLogValue(e.value, spec[2])) + rankBadge(r, '', label) + '</td>';
        }).join('') + '</tr>';
    }).join('');
    var seasonRow = season ? '<tr class="ca-log-season"><td>Season Avg</td>' +
      '<td class="num">' + esc(season.points.toFixed(1) + '–' + season.opp_points.toFixed(1)) + '</td>' +
      '<td class="num">' + esc(season.adj.toFixed(1) + '–' + season.opp_adj.toFixed(1)) + '</td>' +
      NFL_LOG_RATES.map(function (spec) {
        var e = season[spec[0]];
        if (!e) return '<td class="num ca-vs-none">No Plays</td>';
        return '<td class="num ' + rankTone(e.rank, e.of) + '">' +
          esc(spec[2] === 'signed' ? (e.value > 0 ? '+' : '') + e.value.toFixed(1)
            : nflLogValue(e.value, spec[2])) + nflBadge(nflTeamRank(e), 'NFL team season averages') + '</td>';
      }).join('') + '</tr>' : '';
    var table = nflSplitTable(heads, [rows + seasonRow], 'Game').replace('<th class="num">Noise-Adj</th>',
      '<th class="num" title="' + esc(NFL_NOISE_NOTE) + '">Noise-Adj</th>');
    return head + '<p class="ca-lineup-context">' + esc('nflverse play-by-play · ' +
      logs.season + ' regular season · published through Week ' + logs.through_week) + '</p>' +
      nflMarginStrip(games) + table + '</section>';
  }

  function nflPowerBody(sport, game, logs) {
    if (logs === undefined) return pending('The power ranking is loading.');
    var power = (logs || {}).adjusted || {};
    var table = power.teams || {};
    return powerPanel(fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') + ' Power Ranking',
      [[fullName(sport, game, 'away'), table[game.away]], [fullName(sport, game, 'home'), table[game.home]]],
      { cohort: 'NFL clubs', digits: 1, first: 'Club', units: 'Points per game',
        caption: logs ? logs.season + ' regular season · through week ' + logs.through_week + ' · home field ' +
          powerSigned(power.home_court || 0, 1) + ' points' : '' });
  }

  function nflPredictabilityBody(sport, game, logs) {
    if (logs === undefined) return pending('Predictability is loading.');
    var table = (logs || {}).predictability || {};
    return predictabilityPanel(nflNick(sport, game, 'away'), nflNick(sport, game, 'home'),
      table[game.away], table[game.home], String((logs || {}).season || '') + ' · through week ' + ((logs || {}).through_week || ''));
  }

  function nflGameLogBody(sport, game, logs) {
    return nflDuo(nflGameLogPanel, sport, game, logs);
  }

  var NFL_TABS = [
    ['units', 'Units', ['power', 'strength', 'efficiency', 'predictability']],
    ['dvoa', 'DVOA', ['dvoa']],
    ['games', 'Games', ['game-log']],
    ['passing', 'Passing', ['quarterbacks', 'coverage', 'looks']],
    ['rushing', 'Rushing', ['run-game', 'trenches', 'rushing']],
    ['receiving', 'Receiving', ['position-coverage', 'receivers']],
    ['redzone', 'Red Zone', ['redzone']],
    ['special', 'Special Teams', ['special-teams', 'situational']],
    ['tendencies', 'Tendencies', ['pace', 'tendencies', 'def-tendencies']],
    ['lineups', 'Lineups', ['availability']],
    ['profile', 'Profile', ['radar', 'team-context']]
  ];

  /* The tabbed desk is shared: NFL and CFB each name their own tabs, and
     the host remembers which list it was drawn with. */
  function deskTabs(host) {
    return (host && host.__deskTabs) || NFL_TABS;
  }

  function nflTabOf(key, tabs) {
    var hit = (tabs || NFL_TABS).filter(function (t) { return t[0] === key || t[2].indexOf(key) >= 0; })[0];
    return hit ? hit[0] : null;
  }

  /* Where the two clubs' panels stack (narrower than 1380px), one club is read
     at a time; the switch is sticky with the tabs. */
  function nflClubSwitch(sport, game) {
    return '<div class="ca-nfl-club" role="group" aria-label="Club in view">' +
      ['away', 'home'].map(function (side) {
        var full = sport === 'cbb' ? cbbSchool(game,side) : sport === 'cfb' ? cfbName(sport, game, side) : nflNick(sport, game, side);
        var short = sport === 'cfb' ? (game[side] || full) : full;
        return '<button type="button" class="ca-nfl-club__btn" data-club="' + side + '" aria-pressed="false">' +
          '<span class="ca-club-label-full">' + esc(full) + '</span>' +
          '<span class="ca-club-label-short">' + esc(short) + '</span></button>';
      }).join('') +
      '<button type="button" class="ca-nfl-club__btn" data-club="both" aria-pressed="false">Both</button></div>';
  }

  function nflSetTab(host, key, scrollTo) {
    var stack = host.querySelector('.ca-detail-stack');
    var tab = deskTabs(host).filter(function (t) { return t[0] === key; })[0];
    if (!stack || !tab) return;
    stack.setAttribute('data-nfl-tab', key);
    if (host.querySelector('.ca-cbb-controls')) host.querySelectorAll('[data-cbb-chart-control]').forEach(function(g){g.hidden=key!=='shooting';});
    Array.prototype.forEach.call(stack.querySelectorAll(':scope > .ca-detail-section'), function (sec) {
      sec.classList.toggle('is-tab-on', tab[2].indexOf(sec.id) >= 0);
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-nfl-tab]'), function (a) {
      if (a === stack) return;
      var on = a.getAttribute('data-nfl-tab') === key;
      a.classList.toggle('is-on', on);
      a.setAttribute('aria-selected', String(on));
    });
    fitRadar(host);
    var target = scrollTo && document.getElementById(scrollTo);
    if (target && target !== stack) {
      target.scrollIntoView({ block: 'start' });
    } else if (scrollTo) {
      var bar = host.querySelector('.ca-nfl-bar');
      var top = bar ? bar.getBoundingClientRect().top : 0;
      // Back to the top of the tab when the bar is already stuck.
      if (bar && top <= 80) {
        var start = stack.getBoundingClientRect().top + global.pageYOffset -
          bar.getBoundingClientRect().height - 80;
        global.scrollTo(0, Math.max(0, start));
      }
    }
  }

  function nflSetClub(host, club) {
    var stack = host.querySelector('.ca-detail-stack');
    if (!stack) return;
    stack.setAttribute('data-club', club);
    Array.prototype.forEach.call(host.querySelectorAll('.ca-nfl-club__btn'), function (b) {
      var on = b.getAttribute('data-club') === club;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  /* One rhythm per table AND per pair, on every desk (owner 2026-10-01: "not
     everything is represented the same"; 2026-11-12: "these are not formatted
     the same, fix throughout site").

     Whether a rank pill fits beside its figure depends on that figure's width,
     so a narrow column used to put some pills beside and some under. Deciding
     table by table was not enough either: the away and home panels of a duo
     are read across, and a longer club name or a wider figure tipped one table
     into stacking while its mirror stayed inline. So the tables in the same
     place in both panels are measured together. If any pill in either would
     wrap or spill, both stack; otherwise both sit inline. Their header rows,
     and the rows of mirrors that list the same labels, then take one height so
     the two read line for line. Every desk table with rank pills takes part,
     whichever sport drew it. */
  // The figure a pill belongs to is what comes right before it - bare text,
  // a value span, or a wrapper's first part - not the cell's first child,
  // which may be a usage bar or a wrapper holding the pill itself.
  function deskPillFigure(pill) {
    var node = pill.previousSibling;
    while (node && node.nodeType === 3 && !node.textContent.trim()) node = node.previousSibling;
    return node;
  }

  function deskPillWrapped(pill) {
    var figure = deskPillFigure(pill);
    if (!figure) return false;
    var box;
    if (figure.nodeType === 3) {
      var range = document.createRange();
      range.selectNodeContents(figure);
      box = range.getBoundingClientRect();
    } else {
      box = figure.getBoundingClientRect();
    }
    return pill.getBoundingClientRect().top > box.top + box.height / 2;
  }

  function deskTableNeedsStack(table) {
    var pills = table.querySelectorAll('td.num .ca-rank');
    for (var i = 0; i < pills.length; i++) {
      if (!pills[i].offsetParent) continue;
      // Wrapped under its figure, or (where a column keeps one line) spilling
      // past its cell into the next: either way the table stacks.
      var cell = pills[i].closest('td');
      if (deskPillWrapped(pills[i]) || cell.scrollWidth > cell.clientWidth + 1) return true;
    }
    return false;
  }

  function deskVisibleTables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('table.ca-lineup-table'), function (t) {
      return t.offsetParent;
    });
  }

  // A table's shape: how many columns, and what its first column is called.
  // Mirrors share it; a defenders list under one panel never pairs with a
  // shell table under the other.
  function deskTableShape(table) {
    var head = table.tHead && table.tHead.rows[0];
    return (head ? head.cells.length : 0) + '|' + (head && head.cells[0] ? head.cells[0].textContent.trim() : '');
  }

  /* Groups of tables that must read alike: the k-th table of each shape in
     the away panel with the k-th of that shape in the home panel; any table
     outside a duo on its own. */
  function deskTableGroups(stack) {
    var groups = [], grouped = [];
    Array.prototype.forEach.call(stack.querySelectorAll('.ca-detail-duo'), function (duo) {
      if (!duo.offsetParent) return;
      var panels = Array.prototype.filter.call(duo.children, function (c) { return c.offsetParent; });
      var byShape = {};
      panels.forEach(function (panel, side) {
        var seen = {};
        deskVisibleTables(panel).forEach(function (table) {
          if (table.closest('.ca-detail-duo') !== duo) return; // a nested duo pairs its own
          var shape = deskTableShape(table);
          var key = shape + '#' + (seen[shape] = (seen[shape] || 0) + 1);
          (byShape[key] = byShape[key] || [])[side] = table;
          grouped.push(table);
        });
      });
      Object.keys(byShape).forEach(function (key) {
        groups.push(byShape[key].filter(Boolean));
      });
    });
    deskVisibleTables(stack).forEach(function (table) {
      if (grouped.indexOf(table) < 0) groups.push([table]);
    });
    return groups;
  }

  function deskRowLabel(row) {
    return row.cells[0] ? row.cells[0].textContent.trim() : '';
  }

  function deskEvenHeights(rows) {
    var tallest = 0;
    rows.forEach(function (r) { tallest = Math.max(tallest, r.getBoundingClientRect().height); });
    rows.forEach(function (r) {
      if (r.getBoundingClientRect().height < tallest - 0.5) r.style.height = tallest + 'px';
    });
  }

  function deskEvenGroup(tables) {
    tables.forEach(function (t) {
      t.classList.remove('is-stacked');
      Array.prototype.forEach.call(t.rows, function (r) { r.style.height = ''; });
    });
    var stack = tables.some(deskTableNeedsStack);
    tables.forEach(function (t) { t.classList.toggle('is-stacked', stack); });
    if (tables.length < 2) return;
    deskEvenHeights(tables.map(function (t) { return t.tHead && t.tHead.rows[0]; }).filter(Boolean));
    // Row for row only where both tables list the same things in the same
    // order (a look, a shell, a stat) - never across two clubs' player lists.
    var bodies = tables.map(function (t) {
      return Array.prototype.filter.call(t.tBodies[0] ? t.tBodies[0].rows : [], function (r) { return r.offsetParent; });
    });
    var labels = bodies[0].map(deskRowLabel).join('\n');
    if (!bodies[0].length || bodies.some(function (rows) { return rows.map(deskRowLabel).join('\n') !== labels; })) return;
    bodies[0].forEach(function (_, i) {
      deskEvenHeights(bodies.map(function (rows) { return rows[i]; }));
    });
  }

  function deskTableScroll(table, wrapper, overflows) {
    var hint = wrapper.previousElementSibling;
    if (!hint || !hint.classList.contains('ca-table-scroll-note')) {
      if (!overflows) return;
      hint = document.createElement('p');
      hint.className = 'ca-table-scroll-note';
      hint.textContent = 'Scroll for more columns';
      hint.setAttribute('aria-hidden', 'true');
      wrapper.before(hint);
    }
    hint.hidden = !overflows;
    wrapper.toggleAttribute('data-table-scroll', overflows);
    if (!overflows) {
      wrapper.removeAttribute('tabindex');
      wrapper.removeAttribute('role');
      wrapper.removeAttribute('aria-label');
      return;
    }
    var owner = table.closest('.ca-split-block') || table.closest('section');
    var heading = owner && owner.querySelector('h3, h4, h2');
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', (heading ? heading.textContent.trim() + ' · ' : '') + 'Scrollable table');
  }

  function deskEvenTables(host) {
    var stack = host.querySelector('.ca-detail-stack');
    if (!stack) return;
    // Where one club is on screen at a time (narrower than 1380px), its
    // mirror is hidden but sits at the same width when shown, so both are
    // measured as one for this synchronous pass - nothing paints in between -
    // and switching club never changes the rhythm.
    var club = stack.getAttribute('data-club');
    if (club && club !== 'both') stack.setAttribute('data-club', 'both');
    try {
      var groups = deskTableGroups(stack);
      groups.forEach(deskEvenGroup);
      groups.flat().map(function (table) {
        var scroll = table.parentElement;
        return [table, scroll, scroll.scrollWidth > scroll.clientWidth + 1];
      }).forEach(function (entry) {
        if (entry[1].classList.contains('ca-lineup-scroll')) deskTableScroll(entry[0], entry[1], entry[2]);
      });
    } finally {
      if (club && club !== 'both') stack.setAttribute('data-club', club);
    }
  }

  function wireNflDesk(host) {
    var pending = 0;
    function even() {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () { pending = 0; deskEvenTables(host); });
    }
    // Any tab, club or season switch can reveal tables; so can a resize, and
    // a headshot or logo arriving late can change a row's height.
    host.addEventListener('click', even);
    host.addEventListener('load', even, true);
    global.addEventListener('resize', even);
    if (global.ResizeObserver) new global.ResizeObserver(even).observe(host.querySelector('.ca-detail-stack'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(even);
    even();
    host.addEventListener('click', function (event) {
      var tab = event.target.closest && event.target.closest('a[data-nfl-tab]');
      if (tab && host.contains(tab)) {
        event.preventDefault();
        var key = tab.getAttribute('data-nfl-tab');
        nflSetTab(host, key, 'stack');
        if (global.history && global.history.replaceState) {
          global.history.replaceState(null, '', '#' + key);
        }
        return;
      }
      var metricBtn = event.target.closest && event.target.closest('[data-rec-metric]');
      if (metricBtn && host.contains(metricBtn)) {
        var box = metricBtn.closest('.ca-rec-metric');
        var want = metricBtn.getAttribute('data-rec-metric');
        Array.prototype.forEach.call(box.querySelectorAll('[data-rec-metric]'), function (b) {
          var on = b.getAttribute('data-rec-metric') === want;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        Array.prototype.forEach.call(box.querySelectorAll('[data-rec-metric-view]'), function (v) {
          v.hidden = v.getAttribute('data-rec-metric-view') !== want;
        });
        return;
      }
      var club = event.target.closest && event.target.closest('[data-club]');
      if (club && host.contains(club) && club.classList.contains('ca-nfl-club__btn')) {
        nflSetClub(host, club.getAttribute('data-club'));
      }
    });
    global.addEventListener('hashchange', function () {
      var key = String(global.location.hash || '').slice(1);
      var tab = nflTabOf(key, deskTabs(host));
      if (tab) nflSetTab(host, tab, key === tab ? 'stack' : key);
      even();
    });
  }

  function nflInitDesk(host) {
    var tabs = deskTabs(host);
    var key = String(global.location.hash || '').slice(1);
    var tab = nflTabOf(key, tabs) || tabs[0][0];
    var section = key && key !== tab && nflTabOf(key, tabs) ? key : null;
    nflSetTab(host, tab, section);
    // Logos and fonts landing after the first scroll move the section; anchor
    // it again once the page has settled.
    if (section) {
      var again = function () {
        var el = document.getElementById(section);
        if (el) el.scrollIntoView({ block: 'start' });
      };
      if (document.readyState === 'complete') global.setTimeout(again, 400);
      else global.addEventListener('load', function () { global.setTimeout(again, 100); }, { once: true });
    }
    var narrow = global.matchMedia && global.matchMedia('(max-width: 1379px)').matches;
    nflSetClub(host, narrow ? 'away' : 'both');
  }

  var NFL_DVOA_ROWS = [
    ['total_dvoa', 'Total DVOA'], ['offense_dvoa', 'Offense DVOA'],
    ['defense_dvoa', 'Defense DVOA'], ['special_teams_dvoa', 'Special Teams DVOA']
  ];
  var NFL_DVOA_DETAIL_ROWS = [
    ['pass_offense_dvoa', 'Pass Offense'], ['rush_offense_dvoa', 'Rush Offense'],
    ['pass_defense_dvoa', 'Pass Defense'], ['rush_defense_dvoa', 'Rush Defense']
  ];

  function nflDvoaValue(raw) {
    var value = raw && typeof raw === 'object' ? raw.value : raw;
    var n = Number(value);
    if (value == null || !isFinite(n)) return null;
    return (n > 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
  }

  function nflDvoaPanel(sport, game, side) {
    var feed = game[side + '_dvoa'] || {};
    var optional = NFL_DVOA_DETAIL_ROWS.filter(function (row) {
      return nflDvoaValue(feed[row[0]]) != null;
    });
    var displayRows = NFL_DVOA_ROWS.concat(optional);
    var published = displayRows.some(function (row) {
      return nflDvoaValue(feed[row[0]]) != null;
    });
    var source = feed.source || 'FTN Data';
    var context = published
      ? [feed.season, feed.week != null ? 'Week ' + (feed.week_edition || feed.week) : null, source].filter(Boolean).join(' · ')
      : 'Licensed FTN DVOA feed required';
    var rows = displayRows.map(function (row) {
      var entry = feed[row[0]];
      var shown = nflDvoaValue(entry);
      var place = nflTeamRank(entry);
      var tone = place ? rankTone(place.rank, place.of) : '';
      return '<tr><td>' + esc(row[1]) + '</td><td class="num' + (tone ? ' ' + tone : '') + '">' +
        (shown == null ? '<span class="ca-vs-none">Not Published</span>' : esc(shown)) +
        (place ? rankBadge(place) : '') + '</td></tr>';
    });
    return '<section class="ca-form-panel ca-nfl-dvoa-panel"><h3>' +
      esc(fullName(sport, game, side) + ' DVOA') + '</h3><p class="ca-lineup-context">' +
      esc(context) + '</p>' + nflSplitTable(['DVOA'], rows, 'Metric') + '</section>';
  }

  /* ---------------------------------------------------------------------
   * Coverage by position group (2026-11-18): every target to a WR, TE or RB
   * against each look the defense showed, the offense's group beside what
   * the defense it meets allows to that group on the same look
   * (data/public/nfl/position_coverage.json, outputs/nfl_position_coverage.py).
   * Coverage, shells and pressure are the prior season's participation
   * charting; blitz, box, play action and motion are charted this season
   * too. Each figure is the club's place among the 32. Its own file, read
   * when the page opens, so the slate does not carry it per game.
   * ------------------------------------------------------------------ */
  var NFL_POSCOV_URL = '/data/public/nfl/position_coverage.json';
  var nflPosCovPromise = null;
  function loadNflPositionCoverage() {
    if (!nflPosCovPromise) nflPosCovPromise = fetchJson(NFL_POSCOV_URL).catch(function () { return null; });
    return nflPosCovPromise;
  }
  var NFL_POSCOV_GROUPS = [
    ['Season', ['all']],
    ['Coverage', ['man', 'zone', 'single_high', 'two_high']],
    ['Shells', ['cover_0', 'cover_1', 'cover_2', 'cover_2_man', 'cover_3', 'cover_4', 'cover_6']],
    ['Pass Rush', ['blitz', 'no_blitz', 'pressure', 'clean']],
    ['Box And Scheme', ['light_box', 'stacked_box', 'play_action', 'motion']]
  ];
  var NFL_POSCOV_POS = [['WR', 'Wide Receivers'], ['TE', 'Tight Ends'], ['RB', 'Running Backs']];
  var NFL_POSCOV_METRICS = [
    ['yards_per_target', 'Yds / Tgt', 'num1'], ['epa_per_target', 'EPA / Tgt', 'epa'],
    ['success_rate', 'Success %', 'pct'], ['catch_rate', 'Catch %', 'pct'],
    ['target_share', 'Target Share', 'pct']
  ];
  var NFL_ALIGN = [['wr', 'To WRs'], ['te', 'To TEs'], ['rb', 'To RBs'], ['outside', 'Outside'], ['slot', 'Slot']];

  function nflPosCovClub(data, game, side) {
    return (((data || {}).clubs) || {})[game[side]] || null;
  }

  function nflPosCovCell(stats, metric, phase, who) {
    if (!stats || stats[metric[0]] == null) return '<td class="num ca-vs-none">No Targets</td>';
    var rank = (stats.league_ranks || {})[metric[0]];
    var share = metric[0] === 'target_share';
    var cohort = 'NFL ' + (phase === 'offense' ? 'offenses' : 'defenses') + ' in this look';
    var title = who + ' · ' + stats.targets + ' targets · ' + Number(stats.yards_per_target).toFixed(1) +
      ' yds/tgt · ' + epaText(stats.epa_per_target) + ' EPA/tgt · ' + pctText(stats.catch_rate) + ' catch' +
      (stats.success_rate != null ? ' · ' + pctText(stats.success_rate) + ' success' : '') +
      (stats.target_share != null ? ' · ' + pctText(stats.target_share) + ' of targets in this look' : '');
    if (share) {
      return '<td class="num c-volume" title="' + esc(title) + '">' + esc(nflFormat(stats[metric[0]], 'pct')) +
        nflFreqMark(rank ? { place: rank.place, of: rank.of, cohort: cohort } : null) + '</td>';
    }
    return '<td class="num ' + nflRankTone(rank) + '" title="' + esc(title +
      (rank ? ' · ' + rank.place + ordinal(rank.place) + ' of ' + rank.of + ' ' + cohort : '')) + '">' +
      esc(nflFormat(stats[metric[0]], metric[2])) + nflBadge(rank, cohort) + '</td>';
  }

  function nflPosCovTable(sport, game, side, data, win, metric) {
    var opp = nflOther(side);
    var off = ((nflPosCovClub(data, game, side) || {})[win] || {}).offense || {};
    var def = ((nflPosCovClub(data, game, opp) || {})[win] || {}).defense || {};
    var oppScheme = game[opp + (win === 'current' ? '_scheme_current' : '_scheme')] || {};
    var offNick = nflNick(sport, game, side), defNick = nflNick(sport, game, opp);
    var body = '';
    NFL_POSCOV_GROUPS.forEach(function (g) {
      var present = g[1].filter(function (look) {
        return NFL_POSCOV_POS.some(function (p) { return (off[p[0]] || {})[look] || (def[p[0]] || {})[look]; });
      });
      if (!present.length) return;
      body += '<tr class="ca-split-group"><th colspan="8" scope="colgroup">' + esc(g[0]) + '</th></tr>';
      present.forEach(function (look) {
        var shows = look === 'all' ? null : nflOppShows(oppScheme.defense || null, look);
        var showCell = look === 'all' ? '<td class="num ca-opp-shows">Every Snap</td>'
          : '<td class="num ca-opp-shows">' + (shows == null ? '<span class="ca-vs-none">Not Charted</span>'
            : esc(pctText(shows)) + nflOppShowsMark(oppScheme, look)) + '</td>';
        body += '<tr><td>' + esc(look === 'all' ? 'All Targets' : (NFL_LOOK_LABEL[look] || look)) + '</td>' +
          showCell + NFL_POSCOV_POS.map(function (p) {
            return nflPosCovCell((off[p[0]] || {})[look], metric, 'offense', offNick + ' ' + p[0] + 's') +
              nflPosCovCell((def[p[0]] || {})[look], metric, 'defense', defNick + ' vs ' + p[0] + 's');
          }).join('') + '</tr>';
      });
    });
    if (!body) return pending('Coverage by position group is not published for this window yet.');
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split ca-poscov-table">' +
      '<thead><tr><th rowspan="2">Look</th><th rowspan="2" class="num ca-opp-shows">' + esc(defNick) + ' Show</th>' +
      NFL_POSCOV_POS.map(function (p) {
        return '<th colspan="2" class="ca-poscov-group" scope="colgroup">' + esc(p[1]) + '</th>';
      }).join('') + '</tr><tr>' + NFL_POSCOV_POS.map(function () {
        return '<th class="num">' + esc(offNick) + '</th><th class="num">' + esc(defNick) + ' Allow</th>';
      }).join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  // Sharp's charting of the defense by position and alignment (this season).
  function nflAlignmentBlock(sport, game, opp, data) {
    var club = nflPosCovClub(data, game, opp) || {};
    var allowed = club.alignment_allowed;
    var src = (((data || {}).sources) || {}).alignment || {};
    if (!allowed) return '';
    var defNick = nflNick(sport, game, opp);
    var cells = NFL_ALIGN.map(function (a) {
      var e = allowed[a[0]];
      if (!e) return '<td class="num ca-vs-none">Not Charted</td>';
      var rank = e.league_rank;
      var cohort = 'NFL defenses, fewest allowed first';
      return '<td class="num ' + nflRankTone(rank) + '" title="' + esc(defNick + ' yards per target allowed ' +
        a[1].toLowerCase() + (rank ? ' · ' + rank.place + ordinal(rank.place) + ' of ' + rank.of : '')) + '">' +
        esc(Number(e.yards_per_target).toFixed(1)) + nflBadge(rank, cohort) + '</td>';
    }).join('');
    return '<div class="ca-split-block"><h4>' + esc(defNick + ' Yards Per Target Allowed By Position And Alignment') +
      '</h4>' + (src.through_week ? '<p class="ca-lineup-context">' + esc('Through week ' + src.through_week +
        ' · Sharp Football Analysis') + '</p>' : '') +
      nflSplitTable(NFL_ALIGN.map(function (a) { return a[1]; }),
        ['<tr><td>' + esc(defNick + ' Defense') + '</td>' + cells + '</tr>'], 'Defense') + '</div>';
  }

  function nflPosCovPanel(sport, game, side, data, win) {
    var opp = nflOther(side);
    var head = '<section class="ca-form-panel ca-nfl-poscov"><h3>' +
      esc(nflVs(sport, game, side, 'Pass Catchers', 'Coverage')) + '</h3>';
    if (data === undefined) return head + pending('Loading coverage by position group.') + '</section>';
    if (!data || !nflPosCovClub(data, game, side)) {
      return head + pending('Coverage by position group is not published yet.') + '</section>';
    }
    var seasons = ((data.seasons || {})[win] || []).join(' + ');
    var buttons = NFL_POSCOV_METRICS.map(function (m, i) {
      return '<button type="button" class="ca-rec-metric__btn' + (i ? '' : ' is-on') +
        '" data-rec-metric="' + m[0] + '" aria-pressed="' + (i ? 'false' : 'true') + '">' + esc(m[1]) + '</button>';
    }).join('');
    var views = NFL_POSCOV_METRICS.map(function (m, i) {
      return '<div data-rec-metric-view="' + m[0] + '"' + (i ? ' hidden' : '') + '>' +
        nflPosCovTable(sport, game, side, data, win, m) + '</div>';
    }).join('');
    return head + (seasons ? '<p class="ca-lineup-context">' + esc(seasons + ' · Targets to WR, TE And RB') + '</p>' : '') +
      '<div class="ca-rec-metric"><div class="ca-rec-metric__bar" role="group" aria-label="Position group stat">' +
      buttons + '</div>' + views + '</div>' + (win === 'current' ? nflAlignmentBlock(sport, game, opp, data) : '') +
      '</section>';
  }

  function nflPosCovBody(sport, game, data) {
    return nflSeasonViews(nflDuo(nflPosCovPanel, sport, game, data, 'combined'),
      nflDuo(nflPosCovPanel, sport, game, data, 'current'));
  }

  function nflSections(sport, game, games) {
    nflPool = nflLeaguePool(games);
    return [
      section('power', 'Power Ranking', 'Opponent-Adjusted · Points And Play Efficiency · Per Game',
        nflPowerBody(sport, game, undefined)),

      section('strength', 'Strength Index', 'OSI, DSI And NSI · Fitted To Predict Later Games',
        strengthBody(sport, game)),

      section('efficiency', 'Unit Matchups', 'Each Offense Against The Defense It Meets',
        nflDuo(nflDrivePanel, sport, game)),

      section('predictability', 'Predictability', 'How Often Each Offense Lands Off The NFL Curve',
        nflPredictabilityBody(sport, game, undefined)),

      section('dvoa', 'DVOA', 'Total And Unit Efficiency From FTN Team Total DVOA',
        nflDuo(nflDvoaPanel, sport, game)),

      section('game-log', 'Game Log', 'Every Game, Final And Noise-Adjusted',
        nflGameLogBody(sport, game, undefined)),

      section('quarterbacks', 'Quarterbacks', 'Season Line And Splits By Defensive Look',
        nflDuo(nflBackPanel, sport, game, 'QB')),

      section('coverage', 'Coverage Quality', 'What Each Defense Allows In Coverage',
        nflBothWindows(function () { return nflDuo(nflShellPanel, sport, game); })),

      section('looks', 'Defensive Looks', 'Man, Zone, Blitz, Pressure And Box',
        nflBothWindows(function () { return nflDuo(nflLooksPanel, sport, game); })),

      section('run-game', 'Run Game', 'Each Rushing Unit, Then Every Ball Carrier',
        nflBothWindows(function () { return nflDuo(nflRunGamePanel, sport, game); })),

      section('trenches', 'Trenches', 'Each Line, And Where Runs Have Gone Against Each Front',
        nflDuo(nflTrenchPanel, sport, game)),

      section('rushing', 'Running Backs', 'Season Line And Splits By Box And Direction',
        nflDuo(nflBackPanel, sport, game, 'RB')),

      section('position-coverage', 'Coverage By Position Group',
        'WR, TE And RB Targets By Look, Beside What The Defense Allows',
        nflPosCovBody(sport, game, undefined)),

      section('receivers', 'Pass Catchers', 'Volume Per Game And Where Targets Go',
        nflDuo(nflCatchersPanel, sport, game)),

      section('redzone', 'Red Zone', 'Trips, Conversion And Who Gets The Ball Inside The 20',
        nflRedZone(sport, game)),

      section('special-teams', 'Special Teams', 'Kicking, Punting, Returns And Field Position',
        nflSpecial(sport, game, NFL_SPECIAL, 'Special Teams')),

      section('situational', 'Situational', 'Fourth Down, Two-Minute Drill And Penalties',
        nflSpecial(sport, game, NFL_SITUATIONAL, 'Situational')),

      section('pace', 'Pace And Possession', 'Tempo By Situation And Time Of Possession',
        nflBothWindows(function () { return nflDuo(nflPacePanel, sport, game); }) + paceKey()),

      section('tendencies', 'Offensive Tendencies', 'Personnel, Formation And Play Type',
        nflBothWindows(function () { return nflDuo(nflTendencyPanel, sport, game); })),

      section('def-tendencies', 'Defensive Tendencies', 'Coverage, Shells, Pressure And Personnel Packages',
        nflBothWindows(function () { return nflDuo(nflDefTendencyPanel, sport, game); })),

      section('availability', 'Starting Lineups And Availability',
        'Offense, Defense And Official Designations',
        '<div class="ca-detail-duo ca-lineup-duo">' +
        lineupBoard(sport, game, 'away') +
        lineupBoard(sport, game, 'home') + '</div>'),

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

  /* ---------------------------------------------------------------------
   * The CFB desk, in the NFL desk's design layer.
   *
   * Read a tab at a time. Every table puts one club's unit above the unit
   * it meets, and every figure carries its place among the FBS clubs (rank
   * pill, tier colour). Only evidence: no verdict lines, no gap ordering,
   * no explanations (owner rules, 2026-09-26).
   * ------------------------------------------------------------------ */
  var CFB_TABS = [
    ['units', 'Units', ['cfb-power', 'cfb-strength', 'cfb-efficiency', 'cfb-dvoa', 'cfb-predictability']],
    ['games', 'Games', ['cfb-game-log', 'cfb-schedule']],
    ['passing', 'Passing', ['cfb-quarterbacks', 'cfb-pass-map', 'cfb-passing', 'cfb-receivers']],
    ['rushing', 'Rushing', ['cfb-rushing', 'cfb-run-direction', 'cfb-rushers']],
    ['defense', 'Defense', ['cfb-defenders']],
    ['situational', 'Situational', ['cfb-situational', 'cfb-formation']],
    ['special', 'Special Teams', ['cfb-special']],
    ['availability', 'Availability', ['cfb-availability']],
    ['profile', 'Profile', ['radar', 'recent', 'team-context']]
  ];

  /* The matchup ledger (2026-10-03). One shape for every unit comparison: a
     row per stat, the offense's figure and FBS rank on the left, the defense
     it meets on the right, and between them two bars drawn out from the
     centre to each side's place among FBS schools. The two directions sit
     side by side with the same rows in the same order, and each stat appears
     once on the desk. [feed, rate suffix shared by off_ / def_, label]; the
     feeds are form (ESPN box-score rates), scheme and run (CFBD) and model
     (the CFB model's opponent-adjusted inputs). */
  var CFB_LEDGER = {
    efficiency: [
      ['Scoring', [['form', 'ppg', 'Points/G'], ['form', 'points_per_play', 'Pts/Play'],
        ['scheme', 'points_per_opportunity', 'Pts/Opp']]],
      ['Yardage', [['form', 'ypg', 'Yards/G'], ['form', 'yards_per_play', 'Yds/Play'],
        ['form', 'first_downs', '1st Downs/G'], ['form', 'first_down_rate', '1st Down%']]],
      ['Per Play', [['model', 'ppa', 'Adj EPA/Play'], ['scheme', 'success_rate', 'Success'],
        ['scheme', 'explosiveness', 'Explosive']]]
    ],
    passing: [
      ['Efficiency', [['form', 'ypa', 'Yds/Att'], ['form', 'comp', 'Comp%'],
        ['form', 'yards_per_completion', 'Yds/Comp'], ['form', 'qbr', 'Rating'],
        ['scheme', 'pass_ppa', 'EPA/Pass'], ['scheme', 'pass_success', 'Pass Success'],
        ['form', 'pass_first_rate', 'Pass 1D%']]],
      ['Volume', [['form', 'pass_ypg', 'Pass Yds/G'], ['form', 'dropbacks_pg', 'Dropbacks/G']]],
      ['Scoring And Ball', [['form', 'pass_td_rate', 'TD Rate'],
        ['form', 'interception_rate', 'INT Rate']]],
      ['Protection And Havoc', [['form', 'sack_rate', 'Sack%'], ['form', 'sack_yards_pg', 'Sack Yds/G'],
        ['scheme', 'havoc_db', 'DB Havoc']]]
    ],
    rushing: [
      ['Efficiency', [['form', 'ypc', 'Yds/Rush'], ['run', 'rush_ppa', 'EPA/Rush'],
        ['run', 'rush_success', 'Success'], ['run', 'rush_explosiveness', 'Explosive'],
        ['form', 'rush_first_rate', 'Rush 1D%']]],
      ['Volume', [['form', 'rush_ypg', 'Rush Yds/G'], ['form', 'rush_attempts_pg', 'Rush Att/G'],
        ['form', 'rush_td', 'Rush TD/G']]],
      ['Line Play', [['run', 'line_yards', 'Line Yds'], ['run', 'second_level_yards', '2nd Level'],
        ['run', 'open_field_yards', 'Open Field'], ['run', 'power_success', 'Power'],
        ['run', 'stuff_rate', 'Stuffed'], ['run', 'havoc_front_seven', 'Front-7 Havoc']]]
    ],
    situational: [
      ['Downs', [['form', 'third_down', '3rd Down'], ['form', 'fourth', '4th Down'],
        ['scheme', 'standard_down_success', 'Standard Dn'],
        ['scheme', 'passing_down_success', 'Passing Dn']]],
      ['Tempo And Mix', [['form', 'plays_pg', 'Plays/G'], ['form', 'pass_rate', 'Pass Rate'],
        ['scheme', 'passing_down_rate', 'Passing Downs'], ['scheme', 'field_position', 'Start (Own)']]],
      ['Havoc', [['scheme', 'havoc_total', 'Havoc']]]
    ],
    /* The official scorer's charting (scripts/cfb_charting.py, 2026-11-18):
       where passes go and what they gain, the pocket, the formation and the
       run direction, each offense against the defense it meets. */
    coverage: [
      ['Short Passes', [['chart', 'short_rate', 'Short Share'], ['chart', 'short_comp', 'Short Comp%'],
        ['chart', 'short_ypa', 'Short Yds/Att'], ['chart', 'short_epa', 'Short EPA/Att']]],
      ['Deep Passes', [['chart', 'deep_rate', 'Deep Share'], ['chart', 'deep_comp', 'Deep Comp%'],
        ['chart', 'deep_ypa', 'Deep Yds/Att'], ['chart', 'deep_epa', 'Deep EPA/Att']]],
      ['Direction', [['chart', 'left_rate', 'Left Share'], ['chart', 'left_epa', 'Left EPA/Att'],
        ['chart', 'middle_rate', 'Middle Share'], ['chart', 'middle_epa', 'Middle EPA/Att'],
        ['chart', 'right_rate', 'Right Share'], ['chart', 'right_epa', 'Right EPA/Att']]],
      ['Air And After The Catch', [['chart', 'adot', 'Air Yds/Tgt'], ['chart', 'yac', 'YAC/Comp']]],
      ['Pocket', [['chart', 'pressure_rate', 'Hurry+Sack%'], ['chart', 'clean_epa', 'Clean EPA/DB'],
        ['chart', 'pressured_epa', 'Pressured EPA/DB']]]
    ],
    run_direction: [
      ['Run Left', [['chart', 'run_left_rate', 'Left Share'], ['chart', 'run_left_ypc', 'Left Yds/Rush'],
        ['chart', 'run_left_epa', 'Left EPA/Rush'], ['chart', 'run_left_success', 'Left Success']]],
      ['Run Middle', [['chart', 'run_middle_rate', 'Middle Share'], ['chart', 'run_middle_ypc', 'Middle Yds/Rush'],
        ['chart', 'run_middle_epa', 'Middle EPA/Rush'], ['chart', 'run_middle_success', 'Middle Success']]],
      ['Run Right', [['chart', 'run_right_rate', 'Right Share'], ['chart', 'run_right_ypc', 'Right Yds/Rush'],
        ['chart', 'run_right_epa', 'Right EPA/Rush'], ['chart', 'run_right_success', 'Right Success']]]
    ],
    formation: [
      ['Formation', [['chart', 'shotgun_rate', 'Shotgun'], ['chart', 'under_center_rate', 'Under Center'],
        ['chart', 'no_huddle_rate', 'No Huddle']]],
      ['Efficiency By Formation', [['chart', 'shotgun_epa', 'Shotgun EPA/Play'],
        ['chart', 'under_center_epa', 'Under Center EPA/Play']]],
      ['Run Share By Formation', [['chart', 'shotgun_run_rate', 'Shotgun Runs'],
        ['chart', 'under_center_run_rate', 'Under Center Runs']]]
    ]
  };
  var CFB_LEDGER_UNITS = {
    efficiency: ['Offense', 'Defense'],
    passing: ['Passing Offense', 'Pass Defense'],
    rushing: ['Rushing Offense', 'Run Defense'],
    situational: ['Offense', 'Defense'],
    coverage: ['Passing Offense', 'Pass Defense'],
    run_direction: ['Rushing Offense', 'Run Defense'],
    formation: ['Offense', 'Defense']
  };
  var CFB_SPECIAL = [['off_fg', 'FG%'], ['off_punt', 'Net Punt'], ['off_kr', 'KR Avg'],
    ['off_pr', 'PR Avg'], ['off_pen', 'Pen Yds/G']];
  var CFB_SP_PLUS = [['overall', 'Overall SP+'], ['offense', 'Offense SP+'],
    ['defense', 'Defense SP+'], ['special_teams', 'Special Teams SP+']];

  function cfbRates(game, side) {
    var currentYear = new Date().getUTCFullYear();
    var season = Number(game.season);
    var form = game[side + '_form'] || {};
    if (season !== currentYear || Number(form.season) !== season) return {};
    return form.rates || {};
  }

  var CFB_FEED_KEY = { scheme: '_scheme_stats', run: '_run_game', model: '_model_form', chart: '_charting' };

  function cfbFeed(game, side, feed) {
    if (feed === 'form') return cfbRates(game, side);
    return ((game[side + CFB_FEED_KEY[feed]] || {}).rates) || {};
  }

  // The school, not the mascot: "Coastal Carolina Offense", never "Chanticleers".
  function cfbName(sport, game, side) {
    return game[side + '_name'] || fullName(sport, game, side);
  }

  // One decimal throughout: per-game counts and averages side by side read
  // alike (0.7, 1.7, 1.5), never 0.667 beside 1.5.
  function cfbValue(entry) {
    var v = Number(entry.value);
    if (entry.format === 'ppa') return (v > 0 ? '+' : '') + v.toFixed(3);
    if (entry.format === 'signed') return (v > 0 ? '+' : '') + v.toFixed(1);
    if (entry.format === 'pct') return (v * 100).toFixed(1) + '%';
    if (entry.format === 'num2') return v.toFixed(2);
    if (entry.format === 'int') return String(Math.round(v));
    return entry.format === 'num' && Math.abs(v) < 10 && entry.label && /explosive/i.test(entry.label)
      ? v.toFixed(2) : v.toFixed(1);
  }

  function cfbGrade(entry) {
    var place = entry && entry.value != null && rankPosition(entry);
    if (!place) return null;
    var percentile = Math.round(percentOf(place));
    var label = rankLabel(place, entry.cohort);
    var tone = entry.rankDisplay ? percentileClass(percentile) : rankTone(place.rank, place.of);
    if (entry.better === 'neutral') {
      tone = 'c-volume';
      label = label.replace(' of ', ' most of ');
    }
    if (entry.lowSample) tone = 'c-na';
    if (entry.rankDisplay === 'percentile') label = percentile + ordinal(percentile) + ' percentile · ' + label;
    return { place: place, percentile: percentile, tone: tone, label: label };
  }

  var CFB_RANK_DIRECTION = { high: 'Higher is better', low: 'Lower is better', neutral: 'Highest value first' };

  function cfbCell(entry, extraClass, suffix, grade = cfbGrade(entry)) {
    var cls = extraClass ? ' ' + extraClass : '';
    // A missing value says why when the caller knows ("Not Applicable",
    // "No Close Games"); the site prints no dashes.
    if (!entry || entry.value == null) {
      return '<td class="num ca-vs-none' + cls + '">' + esc((entry && entry.missing) || 'Not Rated') + '</td>';
    }
    var title = [titleCase(entry.label || ''), grade && grade.label,
      grade && CFB_RANK_DIRECTION[entry.better]].filter(Boolean).join(' · ');
    var tone = grade ? grade.tone : entry.better === 'neutral' ? 'c-volume' : '';
    return '<td class="num' + cls + (!entry.rankDisplay && tone ? ' ' + tone : '') + '" title="' + esc(title) + '">' +
      esc(entry.text == null ? cfbValue(entry) : entry.text) + (suffix || '') +
      (grade ? rankBadge(grade.place, grade.tone, grade.label, '',
        entry.rankDisplay === 'percentile' ? grade.percentile : null) : '') +
      (entry.sample ? '<small class="ca-qb-volume">' + esc(entry.sample) + '</small>' : '') + '</td>';
  }

  function cfbSample(sport, game, sides, includeDefense) {
    var of = null, shortSample = false;
    var bits = sides.map(function (side) {
      var rates = cfbRates(game, side);
      of = of || ((rates.off_ppg || rates.def_ppg) || {}).of;
      var form = game[side + '_form'] || {};
      var games = Math.round(Number(form.games != null ? form.games : form.plays));
      var defenseGames = Number(form.opponent_games);
      var name = cfbName(sport, game, side);
      if (!Object.keys(rates).length || !(games > 0)) return name + ' Not Rated Yet';
      if (includeDefense && defenseGames > 0 && defenseGames !== games) {
        shortSample = true;
        return name + ' ' + games + ' Offense / ' + defenseGames + ' Defense Games';
      }
      return name + ' ' + games + (games === 1 ? ' Game' : ' Games');
    });
    var context = shortSample ? ['ESPN Sample'].concat(bits) : bits.concat(of ? ['Ranked Of ' + of + ' FBS'] : []);
    return '<p class="' + (shortSample ? 'ca-cfb-split-sample' : 'ca-lineup-context') + '">' +
      esc(context.join(' · ')) + '</p>';
  }

  function cfbBar(grade, side) {
    var pct = grade ? Math.max(4, grade.percentile) : 0;
    return '<span class="ca-ledger-bar ' + side + (grade ? ' ' + grade.tone : '') +
      '"><i style="width:' + pct + '%"></i></span>';
  }

  function cfbLedgerRow(label, left, right, marks, hidden) {
    var leftGrade = cfbGrade(left), rightGrade = cfbGrade(right);
    return '<tr' + (hidden ? ' hidden' : '') + '><td role="rowheader">' + esc(label) + '</td>' +
      cfbCell(left, '', marks && marks[0], leftGrade) +
      '<td class="ca-ledger-bars" aria-hidden="true"><span class="ca-ledger-pair">' +
      cfbBar(leftGrade, 'is-left') + cfbBar(rightGrade, 'is-right') + '</span></td>' +
      cfbCell(right, 'ca-ledger-right', marks && marks[1], rightGrade) + '</tr>';
  }

  function cfbLedgerTable(left, right, groups, id) {
    function head(column, cls) {
      return '<th scope="col" class="num' + cls + '"><span class="ca-ledger-school">' + esc(column[0]) + '</span>' +
        esc(column[1]) + (column[2] ? '<span class="ca-ledger-basis">' + esc(column[2]) + '</span>' : '') + '</th>';
    }
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-cfb-ledger-table"' +
      (id ? ' id="' + esc(id) + '"' : '') + '>' +
      '<colgroup><col class="ca-ledger-col-stat"><col class="ca-ledger-col-val">' +
      '<col class="ca-ledger-col-bars"><col class="ca-ledger-col-val"></colgroup>' +
      '<thead><tr><th scope="col">Stat</th>' + head(left, '') +
      '<th class="ca-ledger-bars" aria-hidden="true"></th>' +
      head(right, ' ca-ledger-right') + '</tr></thead><tbody>' +
      groups.map(function (g) {
        if (!g.rows.length) return '';
        return (g.title ? '<tr class="ca-ledger-group"><th colspan="4">' + esc(g.title) + '</th></tr>' : '') +
          g.rows.join('');
      }).join('') + '</tbody></table></div>';
  }

  // A row prints in both directions when either has it, so the two panels
  // keep the same rows and line up; the side without it reads "Not Rated".
  function cfbLedgerShown(game, spec) {
    return ['away', 'home'].some(function (side) {
      var rates = cfbFeed(game, side, spec[0]);
      return ['off_', 'def_'].some(function (p) {
        return rates[p + spec[1]] && rates[p + spec[1]].value != null;
      });
    });
  }

  function cfbSchemeLine(sport, game, offSide, defSide) {
    var off = (game[offSide + '_scheme_profile'] || {}).offense_scheme || {};
    var def = (game[defSide + '_scheme_profile'] || {}).defense_scheme || {};
    var line = [off.family ? cfbName(sport, game, offSide) + ' ' + off.family : null,
      def.front ? cfbName(sport, game, defSide) + ' ' + def.front : null].filter(Boolean).join(' vs ');
    return line ? '<p class="ca-lineup-context">' + esc(line) + '</p>' : '';
  }

  // The charted sample behind a charting ledger: the dropbacks and rushes
  // each side has, and the week it runs through.
  function cfbChartLine(game, offSide, defSide) {
    var off = game[offSide + '_charting'] || {}, def = game[defSide + '_charting'] || {};
    var a = off.samples || {}, b = def.samples || {};
    if (!off.samples && !def.samples) return '';
    return '<p class="ca-lineup-context">' + esc(['Official play-by-play charting via collegefootballdata.com',
      (off.through_week || def.through_week) ? 'Through week ' + (off.through_week || def.through_week) : '',
      a.off_dropbacks != null ? a.off_dropbacks + ' dropbacks and ' + a.off_rushes + ' rushes on offense' : '',
      b.def_dropbacks != null ? b.def_dropbacks + ' and ' + b.def_rushes + ' faced on defense' : ''
    ].filter(Boolean).join(' · ')) + '</p>';
  }

  function cfbLedgerPanel(sport, game, offSide, area) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var offName = cfbName(sport, game, offSide), defName = cfbName(sport, game, defSide);
    var units = CFB_LEDGER_UNITS[area];
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger"><h3>' +
      esc(offName + ' ' + units[0] + ' vs ' + defName + ' ' + units[1]) + '</h3>';
    var groups = CFB_LEDGER[area].map(function (group) {
      return {
        title: group[0],
        rows: group[1].filter(function (spec) { return cfbLedgerShown(game, spec); }).map(function (spec) {
          var offense = cfbFeed(game, offSide, spec[0])['off_' + spec[1]];
          var defense = cfbFeed(game, defSide, spec[0])['def_' + spec[1]];
          return cfbLedgerRow(spec[2], cfbTeamMetric(offense, 'FBS offenses'), cfbTeamMetric(defense, 'FBS defenses'));
        })
      };
    });
    if (!groups.some(function (g) { return g.rows.length; })) {
      return head + pending('Unit rates are not published for this pairing yet.') + '</section>';
    }
    return head + cfbSample(sport, game, [offSide, defSide], true) +
      (area === 'passing' ? cfbSchemeLine(sport, game, offSide, defSide) : '') +
      (CFB_LEDGER[area].some(function (g) { return g[1].some(function (spec) { return spec[0] === 'chart'; }); })
        ? cfbChartLine(game, offSide, defSide) : '') +
      cfbLedgerTable([offName, 'Offense', 'FBS Rank'], [defName, 'Defense', 'FBS Rank'], groups) + '</section>';
  }

  function cfbTeamMetric(entry, cohort, rankDisplay = 'rank') {
    return entry && Object.assign({}, entry, { cohort: cohort, rankDisplay: rankDisplay });
  }

  /* School against school on the same figure (SP+, special teams): the same
     ledger, the away school on the left and the home school on the right. */
  function cfbHeadToHead(sport, game, title, context, rows) {
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger ca-cfb-h2h"><h3>' +
      esc(title) + '</h3>' + context;
    var shown = rows.filter(function (r) { return r[1] || r[2]; });
    if (!shown.length) return head + pending('Ratings are not published for this pairing yet.') + '</section>';
    var rankBasis = sport === 'cfb' ? 'FBS Teams' : '';
    return head + cfbLedgerTable([cfbName(sport, game, 'away'), 'Away', rankBasis],
      [cfbName(sport, game, 'home'), 'Home', rankBasis],
      [{ title: '', rows: shown.map(function (r) {
        var left = rankBasis ? cfbTeamMetric(r[1], 'FBS teams') : r[1];
        var right = rankBasis ? cfbTeamMetric(r[2], 'FBS teams') : r[2];
        return cfbLedgerRow(r[0], left, right, r[3]);
      }) }]) +
      '</section>';
  }

  function cfbSpecialBody(sport, game) {
    var away = cfbRates(game, 'away'), home = cfbRates(game, 'home');
    return cfbHeadToHead(sport, game,
      cfbName(sport, game, 'away') + ' vs ' + cfbName(sport, game, 'home') + ' Special Teams',
      cfbSample(sport, game, ['away', 'home']),
      CFB_SPECIAL.map(function (col) { return [col[1], away[col[0]], home[col[0]]]; }));
  }

  function cfbDvoaBody(sport, game) {
    var away = game.away_adjusted_efficiency || {}, home = game.home_adjusted_efficiency || {};
    var feed = away.source ? away : home;
    var context = [feed.season, feed.source, feed.method].filter(Boolean).join(' · ');
    function entry(f, key) {
      var e = f[key];
      if (!e || !isFinite(Number(e.value))) return null;
      return { value: e.value, rank: e.rank, of: e.of, label: e.label || key,
        better: key === 'defense' ? 'low' : 'high',
        format: key === 'overall' || key === 'special_teams' ? 'signed' : 'num' };
    }
    return cfbHeadToHead(sport, game,
      cfbName(sport, game, 'away') + ' vs ' + cfbName(sport, game, 'home') + ' SP+',
      '<p class="ca-lineup-context">' + esc(context || 'Opponent-adjusted ratings are not available') +
        '</p>',
      CFB_SP_PLUS.map(function (row) { return [row[1], entry(away, row[0]), entry(home, row[0])]; }));
  }

  /* College headshots (2026-10-03): ESPN publishes a portrait for most FBS
     players under the athlete id the slate already carries. A missing one
     answers 404, so the image falls back to the player's initials. */
  function cfbHeadshotUrl(id) {
    return id ? 'https://a.espncdn.com/combiner/i?img=/i/headshots/college-football/players/full/' +
      encodeURIComponent(id) + '.png&w=96&h=96' : '';
  }

  function cfbInitials(name) {
    return '<span class="ca-cfb-player__shot is-initials" aria-hidden="true">' +
      esc(initials(name)) + '</span>';
  }

  function cfbPlayerCell(player, position, volume, status) {
    var url = cfbHeadshotUrl(player.player_id);
    var shot = url
      ? '<img class="ca-cfb-player__shot" src="' + esc(url) + '" alt="" width="40" height="40" ' +
        'loading="lazy" decoding="async" data-initials="' + esc(initials(player.player_name)) + '">'
      : cfbInitials(player.player_name);
    var label = [position, status].filter(Boolean).join(' · ');
    var sample = [volume, player.ranked === false ? 'Low Sample' : ''].filter(Boolean).join(' · ');
    return '<td><span class="ca-cfb-player">' + shot + '<span class="ca-cfb-player__id">' +
      esc(player.player_name) + ' <span class="ca-lineup-player__position">' + esc(label) +
      '</span><small class="ca-qb-volume">' + esc(sample) + '</small></span></span></td>';
  }

  // A portrait ESPN does not have swaps for the initials in place.
  function cfbHeadshotFallback(event) {
    var img = event.target;
    if (!img || img.tagName !== 'IMG' || !img.classList.contains('ca-cfb-player__shot')) return;
    var span = document.createElement('span');
    span.className = 'ca-cfb-player__shot is-initials';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = img.getAttribute('data-initials') || '';
    img.replaceWith(span);
  }
  document.addEventListener('error', cfbHeadshotFallback, true);

  // One passer against the defense he meets: his season line, then EPA per
  // play on each split beside what that defense allows on the same split.
  var CFB_QB_LINE = [['completion_pct', 'Comp%'], ['yards_per_attempt', 'Yds/Att'],
    ['td_rate', 'TD%'], ['int_rate', 'INT%'], ['yards', 'Yards'], ['touchdowns', 'TD']];
  // The splits measured on both sides: the passer's EPA and the defense's
  // EPA allowed on the same plays, so each row is a pair.
  var CFB_QB_SPLITS = [['all', 'All Plays'], ['pass', 'Dropbacks'], ['rush', 'Rushes'],
    ['standardDowns', 'Standard Downs'], ['passingDowns', 'Passing Downs']];

  function cfbPlayerRank(entry, qualified, cohort) {
    if (!entry) return null;
    var place = rankPosition(entry);
    // Older exports placed an unqualified player below the entire pool at
    // N+1. Render the lower endpoint of the comparison for those rows.
    if (!place && qualified === false && Number(entry.rank) === Number(entry.of) + 1) {
      place = rankPosition({ rank: entry.of, of: entry.of });
    }
    return Object.assign({}, entry, {
      rank: place && place.rank,
      of: place && place.of,
      rankDisplay: 'percentile',
      lowSample: qualified === false,
      cohort: cohort + (qualified === false ? ' · placement for a below-threshold sample' : '')
    });
  }

  /* Each passer by look from the official scorer's charting (2026-11-18):
     depth, direction, pocket and formation, his figures placed among FBS
     passers with a real sample in that look, beside the EPA per dropback the
     defense he meets allows on the same look. */
  var CFB_QB_LOOKS = [
    ['Season', [['all', 'All Dropbacks']]],
    ['Depth', [['short', 'Short'], ['deep', 'Deep']]],
    ['Direction', [['left', 'Left'], ['middle', 'Middle'], ['right', 'Right']]],
    ['Pocket', [['clean', 'Clean Pocket'], ['pressured', 'Hurried Or Sacked']]],
    ['Formation', [['shotgun', 'Shotgun'], ['under_center', 'Under Center']]]
  ];

  var CFB_QB_LOOK_MIN = 5;

  function cfbQbLooks(sport, game, offSide, q) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var looks = q.looks || {};
    var allowed = (game[defSide + '_charting'] || {}).allowed_looks || {};
    var defName = cfbName(sport, game, defSide);
    var rows = [];
    CFB_QB_LOOKS.forEach(function (group) {
      // A look with a handful of dropbacks is not a split: it gets no row.
      var present = group[1].filter(function (l) { return looks[l[0]] && looks[l[0]].dropbacks >= CFB_QB_LOOK_MIN; });
      if (!present.length) return;
      rows.push('<tr class="ca-split-group"><th colspan="6" scope="colgroup">' + esc(group[0]) + '</th></tr>');
      present.forEach(function (l) {
        var mine = looks[l[0]], theirs = allowed[l[0]] || {};
        var cohort = 'FBS passers in this look';
        rows.push('<tr><td>' + esc(l[1]) + '</td><td class="num" title="' + esc(mine.attempts + ' attempts · ' +
          mine.touchdowns + ' TD · ' + mine.interceptions + ' INT') + '">' + esc(String(mine.dropbacks)) + '</td>' +
          cfbCell(cfbPlayerRank(mine.completion_pct, mine.qualified, cohort)) +
          cfbCell(cfbPlayerRank(mine.yards_per_attempt, mine.qualified, cohort)) +
          cfbCell(cfbPlayerRank(mine.epa_per_dropback, mine.qualified, cohort)) +
          cfbCell(theirs.epa_per_dropback ? cfbTeamMetric(theirs.epa_per_dropback, 'FBS defenses in this look', 'percentile')
            : { missing: 'Not Charted' }) + '</tr>');
      });
    });
    if (!rows.length) return '';
    return '<div class="ca-split-block"><h4>' + esc(q.player_name + ' By Look vs ' + defName + ' Allowed') + '</h4>' +
      nflSplitTable(['Dropbacks', 'Comp%', 'Yds/Att', 'EPA/DB', defName + ' Allows'], rows, 'Look') + '</div>';
  }

  function cfbQbPanel(sport, game, offSide) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var qbs = availability.available(game, offSide, game[offSide + '_qbs']);
    var defense = game[defSide + '_defense_splits'] || {};
    var defName = cfbName(sport, game, defSide);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(cfbName(sport, game, offSide) + ' Quarterbacks vs ' + defName + ' Defense') + '</h3>';
    if (!qbs.length) return head + pending('Quarterback lines are not published yet.') + '</section>';
    var lineRows = qbs.map(function (q) {
      var line = q.line || {};
      var volume = line.attempts != null ? line.completions + '/' + line.attempts : '';
      return '<tr>' + cfbPlayerCell(q, q.depth_rank === 1 ? 'QB · Starting' : 'QB', volume,
        availability.status(game, offSide, q)) +
        CFB_QB_LINE.map(function (c) {
          return cfbCell(cfbPlayerRank(line[c[0]], q.ranked, 'qualified FBS passers'));
        }).join('') + '</tr>';
    });
    var lead = qbs[0];
    var splitRows = CFB_QB_SPLITS.filter(function (sp) {
      return (lead.epa_splits || {})[sp[0]] && defense[sp[0]];
    }).map(function (sp) {
      return cfbLedgerRow(sp[1], cfbPlayerRank(lead.epa_splits[sp[0]], lead.ranked, 'qualified FBS passers in this split'),
        cfbTeamMetric(defense[sp[0]], 'FBS defenses in this split', 'percentile'));
    });
    return head + '<div class="ca-split-block"><h4>Season Line · FBS Passer Percentiles</h4>' +
      nflSplitTable(CFB_QB_LINE.map(function (c) { return c[1]; }), lineRows, 'Passer') + '</div>' +
      (splitRows.length ? '<div class="ca-split-block"><h4>' + esc(lead.player_name +
        ' EPA Per Play vs ' + defName + ' Allowed') + '</h4>' +
        cfbLedgerTable([lead.player_name, 'QB EPA/Play', 'Passer Percentile'],
          [defName, 'EPA/Play Allowed', 'FBS Defense Percentile'],
          [{ title: '', rows: splitRows }]) + '</div>' : '') +
      cfbQbLooks(sport, game, offSide, lead) +
      '</section>';
  }

  var CFB_RUSHER_COLS = [['yards', 'Yards'], ['yards_per_carry', 'Yds/Car'],
    ['touchdowns', 'TD'], ['long', 'Long']];

  function cfbRushersPanel(sport, game, side) {
    var list = availability.available(game, side, game[side + '_rushers']);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(cfbName(sport, game, side) + ' Ball Carriers') + '</h3>';
    if (!list.length) return head + pending('Rushing lines are not published yet.') + '</section>';
    var rows = list.map(function (r) {
      return '<tr>' + cfbPlayerCell(r, r.position || '', r.carries + ' car', availability.status(game, side, r)) +
        CFB_RUSHER_COLS.map(function (c) {
          return cfbCell(cfbPlayerRank(r[c[0]], r.ranked, 'qualified FBS rushers'));
        }).join('') + '</tr>';
    });
    return head + nflSplitTable(CFB_RUSHER_COLS.map(function (c) { return c[1]; }), rows, 'Player') +
      '</section>';
  }

  /* Pass catchers and defensive playmakers (2026-11-18 audit; cfb_depth.
     receivers / defenders): season lines ranked among FBS players, the Ball
     Carriers table's shape. */
  var CFB_RECEIVER_COLS = [['receptions', 'Rec'], ['yards', 'Yards'], ['yards_per_catch', 'Yds/Rec'],
    ['touchdowns', 'TD'], ['long', 'Long']];
  var CFB_DEFENDER_COLS = [['tackles', 'Tkl'], ['tfl', 'TFL'], ['sacks', 'Sacks'], ['hurries', 'Hurries'],
    ['interceptions', 'INT'], ['passes_defended', 'PD']];
  function cfbPlayersPanel(sport, game, side, key, title, cols, volume, cohort, empty) {
    var list = availability.available(game, side, game[side + key]);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(cfbName(sport, game, side) + ' ' + title) + '</h3>';
    if (!list.length) return head + pending(empty) + '</section>';
    var rows = list.map(function (r) {
      return '<tr>' + cfbPlayerCell(r, r.position || '', volume(r), availability.status(game, side, r)) +
        cols.map(function (c) { return cfbCell(cfbPlayerRank(r[c[0]], r.ranked, cohort)); }).join('') + '</tr>';
    });
    return head + nflSplitTable(cols.map(function (c) { return c[1]; }), rows, 'Player') + '</section>';
  }
  function cfbReceiversPanel(sport, game, side) {
    return cfbPlayersPanel(sport, game, side, '_receivers', 'Pass Catchers', CFB_RECEIVER_COLS,
      function (r) { return r.catches + ' rec'; }, 'qualified FBS receivers', 'Receiving lines are not published yet.');
  }
  function cfbDefendersPanel(sport, game, side) {
    return cfbPlayersPanel(sport, game, side, '_defenders', 'Defensive Playmakers', CFB_DEFENDER_COLS,
      function (r) { return r.tackles_total + ' tkl'; }, 'qualified FBS defenders', 'Defensive lines are not published yet.');
  }

  var CFB_LOG_COLS = [['total_yards', 'Yards', 'int'], ['passing_yards', 'Pass', 'int'],
    ['rushing_yards', 'Rush', 'int'], ['turnovers', 'TO', 'int'], ['third_down_rate', '3rd Dn', 'pct']];

  // A week's team-games can outnumber FBS; teamScaled prints them on its scale.
  function cfbLogCell(entry, kind, extra, teams, week) {
    if (!entry || entry.value == null) return '<td class="num ca-vs-none">Not Charted</td>';
    var e = { value: entry.value, rank: entry.rank, of: entry.of, format: kind };
    var place = teamScaled(entry.rank, entry.of, teams);
    var pool = week == null ? 'eligible FBS teams' : 'FBS team-games in Week ' + week;
    var label = place ? teamScaledLabel(place, entry.rank, place.pool ? 'on the FBS team scale' : pool, pool) : '';
    return '<td class="num ' + (place ? rankTone(place.rank, place.of) : '') + '" title="' +
      esc(label + (extra || '')) + '">' + esc(cfbValue(e)) + rankBadge(place, '', label) + '</td>';
  }

  function cfbGameLogPanel(sport, game, side) {
    var log = game[side + '_game_log'] || {};
    var head = '<section class="ca-form-panel ca-log-panel"><h3>' +
      esc(cfbName(sport, game, side) + ' Game Log') + '</h3>';
    var games = log.games || [];
    if (!games.length) return head + pending('No completed games are published for this school yet.') +
      '</section>';
    var charted = games.filter(function (g) { return g.adj_points != null && (g.points || {}).value != null; })
      .map(function (g) {
        return { week: g.week, home: g.home || g.neutral, opp: g.opponent || g.opponent_name || '',
          points: g.points.value, opp_points: g.opponent_points.value, adj_points: g.adj_points,
          opp_adj_points: g.adj_opponent_points };
      });
    function mean(list, key) { return list.reduce(function (t, g) { return t + g[key]; }, 0) / list.length; }
    // The FBS cohort the season row is ranked in.
    var fbs = ((log.season || {}).total_yards || {}).of || ((cfbRates(game, side).off_ppg || {}).of) || null;
    var rows = games.map(function (g) {
      var pts = (g.points || {}).value, opp = (g.opponent_points || {}).value;
      return '<tr><td>W' + g.week + ' ' + (g.neutral ? 'vs ' : (g.home ? 'vs ' : '@ ')) +
        esc(g.opponent || g.opponent_name || '') + '</td>' +
        '<td class="num">' + (pts == null || opp == null ? '<span class="ca-vs-none">Not Final</span>'
          : nflLogResult(pts, opp, 0)) + '</td>' +
        '<td class="num">' + (g.adj_points == null ? '<span class="ca-vs-none">Not Charted</span>'
          : nflLogResult(g.adj_points, g.adj_opponent_points, 1)) + '</td>' +
        CFB_LOG_COLS.map(function (c) {
          return cfbLogCell(g[c[0]], c[2], c[0] === 'third_down_rate' && g.third_down
            ? ' · ' + g.third_down : '', fbs, g.week);
        }).join('') + '</tr>';
    }).join('');
    var season = log.season || {};
    var seasonRow = season.points ? '<tr class="ca-log-season"><td>Season Avg</td>' +
      '<td class="num">' + esc(Number(season.points.value).toFixed(1) + '–' +
        Number((season.opponent_points || {}).value).toFixed(1)) + '</td>' +
      '<td class="num">' + (charted.length ? esc(mean(charted, 'adj_points').toFixed(1) + '–' +
        mean(charted, 'opp_adj_points').toFixed(1)) : '<span class="ca-vs-none">Not Charted</span>') + '</td>' +
      CFB_LOG_COLS.map(function (c) {
        return cfbLogCell(season[c[0]], c[2] === 'int' ? 'num' : c[2]);
      }).join('') + '</tr>' : '';
    var table = nflSplitTable(['Result', 'Noise-Adj'].concat(CFB_LOG_COLS.map(function (c) { return c[1]; })),
      [rows + seasonRow], 'Game').replace('<th class="num">Noise-Adj</th>',
      '<th class="num" title="' + esc(NFL_NOISE_NOTE) + '">Noise-Adj</th>');
    return head + (charted.length ? nflMarginStrip(charted) : '') + table + '</section>';
  }

  /* Schedule strength (scripts/cfb_depth.py schedule_strength): each school's
     FBS opponents - average SP+, average ESPN FPI and combined win rate - over
     games played and games remaining, each ranked of FBS (1st = hardest). */
  var CFB_SOS_COLS = [['sp', 'Opp SP+'], ['fpi', 'Opp FPI'], ['win_rate', 'Opp Win%']];

  function cfbScheduleBody(sport, game) {
    function table(window, title) {
      var rows = ['away', 'home'].map(function (side) {
        var block = ((game[side + '_schedule_strength'] || {})[window]) || {};
        var games = (block.sp || block.fpi || block.win_rate || {}).games;
        return '<tr><td>' + esc(cfbName(sport, game, side)) +
          (games ? '<small class="ca-qb-volume">' + esc(games + (games === 1 ? ' FBS game' : ' FBS games')) +
            '</small>' : '') + '</td>' +
          (Object.keys(block).length
            ? CFB_SOS_COLS.map(function (c) { return cfbCell(cfbTeamMetric(block[c[0]], 'FBS teams')); }).join('')
            : '<td class="num ca-vs-none" colspan="' + CFB_SOS_COLS.length + '">' +
              (window === 'remaining' ? 'No FBS Games Remaining' : 'No FBS Games Played') + '</td>') +
          '</tr>';
      });
      return '<div class="ca-split-block"><h4>' + esc(title) + '</h4>' +
        nflSplitTable(CFB_SOS_COLS.map(function (c) { return c[1]; }), rows, 'School') + '</div>';
    }
    var any = ['away', 'home'].some(function (side) { return game[side + '_schedule_strength']; });
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(cfbName(sport, game, 'away') + ' vs ' + cfbName(sport, game, 'home') + ' Schedule Strength') +
      '</h3>';
    if (!any) return head + pending('Schedule strength is not published for this matchup yet.') + '</section>';
    return '<div class="ca-detail-stack-inner">' + head + table('played', 'Games Played') +
      table('remaining', 'Games Remaining') + '</section></div>';
  }

  /* The same report table becomes stacked player rows at narrow widths. */
  var INJURY_METRICS = [
    ['plays', 'Play rate', injuryPlaysCell],
    ['value', 'Value', injuryValueCell],
    ['missed', 'Games missed', injuryMissedCell]
  ];

  function injuryCell(label, classes, html, title) {
    return '<td role="cell" class="' + classes + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      (label ? '<span class="ca-injury-table__field" aria-hidden="true">' + esc(label) + '</span>' : '') +
      html + '</td>';
  }

  function injuryMetricCell(label, text, title, muted) {
    return injuryCell(label, 'ca-injury-table__stat' + (muted ? ' is-missing' : ''), text, title);
  }

  function injuryStatus(pl) {
    var status = pl.status || 'Status not listed';
    var tone = availability.isOut(status) ? 'out' :
      (/^(doubtful|questionable|did not practice|game.time decision|day.to.day)$/i.test(status) ? 'uncertain' : 'neutral');
    return '<span class="ca-injury-status" data-tone="' + tone + '">' + esc(status) + '</span>';
  }

  function injuryTable(players, options) {
    var hasPositions = players.some(function (pl) { return pl.position; });
    var metrics = INJURY_METRICS.filter(function (column) {
      return (options.alwaysMetrics && column[0] !== 'missed') ||
        players.some(function (pl) { return pl[column[0]] != null; });
    });
    var cols = '<th scope="col" role="columnheader" class="ca-injury-table__identity">Player</th>' +
      '<th scope="col" role="columnheader" class="ca-injury-table__designation">Status</th>' +
      '<th scope="col" role="columnheader">Injury</th>' +
      (options.showDate ? '<th scope="col" role="columnheader" class="ca-injury-table__date">Updated</th>' : '') +
      metrics.map(function (col) {
        return '<th scope="col" role="columnheader" class="ca-injury-table__stat">' + esc(col[1]) + '</th>';
      }).join('');
    var rows = players.slice().sort(function (a, b) {
      return Number(availability.isOut(b.status)) - Number(availability.isOut(a.status));
    }).map(function (pl) {
      var position = hasPositions ? '<span class="ca-injury-player__position"' +
        (pl.position ? '' : ' aria-hidden="true"') + '>' + esc(pl.position || '–') + '</span>' : '';
      var player = '<th scope="row" role="rowheader" class="ca-injury-table__identity"><span class="ca-injury-player">' +
        position + '<span>' + esc(pl.player) + '</span></span></th>';
      var injury = esc(pl.injury || 'Undisclosed') + (options.injuryContext ? options.injuryContext(pl) : '');
      var date = pl['return'] ? 'Return ' + injuryDate(pl['return']) : (pl.updated ? injuryDate(pl.updated) : 'Date not listed');
      return '<tr role="row">' + player +
        injuryCell('', 'ca-injury-table__designation', injuryStatus(pl)) +
        injuryCell('Injury', 'ca-injury-table__injury', injury, options.injuryContext ? '' : pl.detail) +
        (options.showDate ? injuryCell('Updated', 'ca-injury-table__date', esc(date)) : '') +
        metrics.map(function (col) { return col[2](pl, col[1], options); }).join('') + '</tr>';
    }).join('');
    return '<div class="ca-injury-table-wrap"><table class="ca-injury-table" role="table" aria-label="' + esc(options.label) +
      '" data-metrics="' + metrics.length + '"' + (options.showDate ? ' data-dated' : '') + '>' +
      '<thead role="rowgroup"><tr role="row">' + cols + '</tr></thead><tbody role="rowgroup">' + rows +
      '</tbody>' + injuryExpectedRow(players, 2 + Number(Boolean(options.showDate)) + metrics.length) + '</table></div>';
  }

  /* Owner 2026-11-13: every player on an injury report carries his value -
     the points of the spread his club gives up without him - and how often a
     player listed the same way has played. The club's expected missing value
     is each value times the chance he sits (a player ruled Out sits). The
     sport's adapter supplies the figures and the words for the tooltips. */
  function injuryPlaysCell(pl, label, options) {
    if (pl.plays == null) return injuryMetricCell(label, 'No history', '', true);
    var pct = Math.round(pl.plays * 100);
    var title = pl.plays_title || ('Listed ' + (pl.plays_basis || pl.status) + ': played ' + pct + '%' +
      (pl.plays_n ? ' of ' + pl.plays_n + ' listings' : '') + (options.playsNote ? ' · ' + options.playsNote : ''));
    return injuryMetricCell(label, pct + '%', title);
  }
  function injuryPoints(v) {
    return (v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  }
  function injuryValueCell(pl, label, options) {
    if (pl.value == null) return injuryMetricCell(label, 'Not rated', '', true);
    var title = options.valueNote || 'Points of the spread his club gives up without him';
    if (pl.value_recent != null) {
      title += ' · ' + injuryPoints(Number(pl.value_recent)) + ' pts of it on the last three games';
    }
    return injuryMetricCell(label, esc(injuryPoints(Number(pl.value))) + '<small> pts</small>', title);
  }
  /* Games in a row his club has played without a box-score line from him
     (CFB). A long absence is in the line already: Expected Missing counts
     such a player on the club's last three games (value_recent). */
  function injuryMissedCell(pl, label) {
    if (pl.missed == null) return injuryMetricCell(label, 'No record', '', true);
    return injuryMetricCell(label, esc(pl.missed), 'Games in a row his club has played without a line from him');
  }
  function injurySits(pl) {
    if (pl.plays != null) return 1 - pl.plays;
    return /^(out|ir|injured reserve|suspended|suspension|out for season|out indefinitely)\b/i.test(pl.status || '') ? 1 : null;
  }
  // Σ value × chance he sits, over the listed players both are known for.
  function injuryExpected(players) {
    var total = 0, counted = 0, open = 0, faded = 0;
    players.forEach(function (pl) {
      var sits = injurySits(pl);
      if (pl.value == null || sits == null) { if (pl.value != null) open++; return; }
      var worth = pl.value_recent != null ? Number(pl.value_recent) : Number(pl.value);
      if (worth < Number(pl.value)) faded++;
      total += Math.max(0, worth) * sits;
      counted++;
    });
    return { total: total, counted: counted, open: open, faded: faded };
  }
  function injuryExpectedRow(players, span) {
    var e = injuryExpected(players);
    if (!e.counted) return '';
    return '<tfoot role="rowgroup"><tr class="ca-injury-total" role="row"><th scope="row" role="rowheader">Expected missing</th>' +
      '<td role="cell" colspan="' + span +
      '" title="' + esc('Each listed player\u2019s value times his chance of sitting, summed' +
        (e.faded ? '; ' + e.faded + ' already missing games counted on the last three games only' : '') +
        (e.open ? '; ' + e.open + ' listed without a play history not counted' : '')) + '">' +
      esc(e.total.toFixed(1)) + '<small> pts</small></td></tr></tfoot>';
  }

  // "2026-11-22" reads "Nov 22"; a date already in words is left as it is.
  function injuryDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
    if (!m) return String(text || '');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] +
      ' ' + Number(m[3]);
  }

  /* CFB: each listed player's value comes with the slate (scripts/
     cfb_injury_value.py: 2024-25 closing lines priced his share of his
     school's passes, carries and catches). A college report has no history
     of its own, so how often a player listed this way played is the NFL
     official report's record (outputs/nfl_injury_value.json, 2019-25). */
  var CFB_PLAY_RATES = { Questionable: [0.6644, 9828], Doubtful: [0.0083, 1084], Out: [0.0004, 7252] };
  var CFB_VALUE_NOTE = 'Points of the spread his school gives up without him: closing lines (2024–25) ' +
    'priced his share of its passes, carries and catches; defenders are not rated';

  function cfbInjuryPanel(sport, game, side) {
    var report = game[side + '_injuries'];
    var title = cfbName(sport, game, side) + ' Injury Report';
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-injury-panel"><h3>' + esc(title) + '</h3>';
    if (!report) {
      return head + pending('The injury report is not published for this ' +
        (sport === 'nba' ? 'club' : 'school') + ' yet.') + '</section>';
    }
    var players = report.players || [];
    var valueNote = report.value_note, playsNote = report.plays_note;
    if (sport === 'cfb') {
      valueNote = CFB_VALUE_NOTE;
      playsNote = 'no college history yet';
      players = players.map(function (pl) {
        var row = {}, rate = CFB_PLAY_RATES[pl.status];
        Object.keys(pl).forEach(function (k) { row[k] = pl[k]; });
        if (rate) { row.plays = rate[0]; row.plays_n = rate[1]; row.plays_basis = pl.status + ' (NFL official report record)'; }
        // A roster status, not a game designation: he does not play.
        if (/^(Out For Season|IR|Suspended)$/.test(pl.status)) {
          row.plays = 0;
          row.plays_title = pl.status + ': does not play this week';
        }
        return row;
      });
    }
    return head + '<p class="ca-lineup-context">' + esc(report.sources || '') + '</p>' +
      (players.length ? injuryTable(players, { label: title, showDate: true, playsNote: playsNote, valueNote: valueNote }) :
        pending('No players are listed on the current report.')) + '</section>';
  }

  /* ---------------------------------------------------------------------
   * NBA desk (2026-10-21).
   *
   * The same tabbed desk and matchup ledger as CFB: one club's offense on the
   * left, the defense it meets on the right, each figure with its place among
   * the 30 clubs. The rates are ESPN box-score facts published by nba-model's
   * public slate; nothing here is a projection. Early in a season a club is
   * read on last season's rates until it has played enough games
   * (ChaseSportNBA.MIN_GAMES), and every panel says which.
   * ------------------------------------------------------------------ */
  var NBA_TABS = [
    ['units', 'Matchup', ['nba-edge-map', 'nba-ratings', 'nba-efficiency', 'nba-power', 'nba-predictability']],
    ['games', 'Game Log', ['nba-game-log']],
    ['availability', 'Injuries', ['nba-availability']],
    ['rotation', 'Rotation', ['nba-rotation', 'nba-lineups']],
    ['players', 'Players', ['nba-player-types', 'nba-player-zones', 'nba-shot-maps', 'nba-player-bio']],
    ['shots', 'Shooting', ['nba-shooting', 'nba-shot-chart', 'nba-shot-kinds', 'nba-databallr']],
    ['playtypes', 'Play Types', ['nba-fingerprint', 'nba-play-types']],
    ['defense', 'Defense', ['nba-coverage', 'nba-defenders', 'nba-onfloor', 'nba-scheme']],
    ['style', 'Coaching', ['nba-style']],
    ['athletic', 'Size & Speed', ['nba-tape', 'nba-size', 'nba-tracking']],
    ['regression', 'Form & Variance', ['nba-regression', 'nba-shooter-regression', 'nba-aging']],
    ['context', 'Schedule & Rest', ['team-context', 'nba-schedule', 'nba-splits']]
  ];

  var NBA_LEDGER = {
    efficiency: [
      ['Scoring', [['rtg', 'Pts/100'], ['ppg', 'Pts/G']]],
      ['Four Factors', [['efg', 'eFG%'], ['tov', 'TOV%'], ['orb', 'OREB%'], ['ftr', 'FTM/FGA']]]
    ],
    shooting: [
      ['Shot Mix', [['three_rate', '3PA Share']]],
      ['Making Shots', [['three_pct', '3P%'], ['two_pct', '2P%'], ['ft_pct', 'FT%']]],
      ['Ball Movement', [['ast_rate', 'Assisted FG%']]]
    ]
  };

  var NBA_ROTATION = [['games', 'GP', 'int'], ['mpg', 'MIN/G', 'num'], ['ppg', 'PTS/G', 'num'],
    ['rpg', 'REB/G', 'num'], ['apg', 'AST/G', 'num'], ['three_pm', '3PM/G', 'num'], ['ts_pct', 'TS%', 'pct']];

  function nbaRates(game, side) {
    return game[side + '_rates'] || {};
  }

  function nbaBasis(sport, game, sides) {
    var bits = sides.map(function (side) {
      return nflNick(sport, game, side) + ' ' + (game[side + '_rates_basis'] || 'Not Rated Yet');
    });
    return '<p class="ca-lineup-context">' + esc(['ESPN box scores'].concat(bits, ['NBA team ranks']).join(' · ')) + '</p>';
  }

  function nbaLedgerPanel(sport, game, offSide, area) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var offName = fullName(sport, game, offSide), defName = fullName(sport, game, defSide);
    var off = nbaRates(game, offSide), def = nbaRates(game, defSide);
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger"><h3>' +
      esc(offName + ' Offense vs ' + defName + ' Defense') + '</h3>';
    var groups = NBA_LEDGER[area].map(function (group) {
      return {
        title: group[0],
        rows: group[1].filter(function (spec) {
          // Keep the two directions on the same rows when one rate is missing.
          return [off, def].some(function (rates) {
            return (rates['off_' + spec[0]] || {}).value != null ||
              (rates['def_' + spec[0]] || {}).value != null;
          });
        }).map(function (spec) {
          return cfbLedgerRow(spec[1], off['off_' + spec[0]], def['def_' + spec[0]]);
        })
      };
    });
    if (!groups.some(function (g) { return g.rows.length; })) {
      return head + pending('Team rates are not published for this pairing yet.') + '</section>';
    }
    return head + nbaBasis(sport, game, [offSide, defSide]) +
      cfbLedgerTable([offName, 'Offense'], [defName, 'Defense'], groups) + '</section>';
  }

  function nbaRatingsBody(sport, game) {
    var a = nbaRates(game, 'away'), h = nbaRates(game, 'home');
    return cfbHeadToHead(sport, game,
      fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') + ' Team Ratings',
      nbaBasis(sport, game, ['away', 'home']),
      [['Net Rating', a.net_rtg, h.net_rtg], ['Offense /100', a.off_rtg, h.off_rtg],
        ['Defense /100', a.def_rtg, h.def_rtg],
        ['Pace (poss/G)', a.pace, h.pace, [nbaPaceMark(game, 'away'), nbaPaceMark(game, 'home')]],
        ['Points/G', a.off_ppg, h.off_ppg], ['Allowed/G', a.def_ppg, h.def_ppg]]) + paceKey();
  }

  function paceKey() { return global.ChaseIcons ? ChaseIcons.paceLegend() : ''; }

  function nbaPaceMark(game, side) {
    var entry = nbaRates(game, side).pace;
    var games = game[side + '_rates_games'];
    return entry && global.ChaseIcons ? ChaseIcons.rankedPace(entry.rank, entry.of, false, 'NBA teams',
      games ? games + ' games · possessions per game' : 'Possessions per game') : '';
  }

  function nbaFigure(v, format) {
    if (v == null || !isFinite(Number(v))) return '—';
    var n = Number(v);
    if (format === 'pct') return (n * 100).toFixed(1) + '%';
    if (format === 'int') return String(Math.round(n));
    return n.toFixed(1);
  }

  function nbaPlayerCell(player, status) {
    var init = initials(player.player_name);
    var shot = player.headshot
      ? '<img class="ca-cfb-player__shot" src="' + esc(player.headshot) + '" alt="" width="40" height="40" ' +
        'loading="lazy" decoding="async" data-initials="' + esc(init) + '">'
      : cfbInitials(player.player_name);
    var label = [player.position, status].filter(Boolean).join(' · ');
    var starts = Number(player.starts || 0);
    // Profile rows carry minutes, not starts.
    var volume = player.starts == null && player.mpg != null
      ? Number(player.mpg).toFixed(1) + ' MPG'
      : starts + (starts === 1 ? ' Start' : ' Starts');
    return '<td><span class="ca-cfb-player">' + shot + '<span class="ca-cfb-player__id">' +
      esc(player.player_name) + ' <span class="ca-lineup-player__position">' + esc(label) +
      '</span><small class="ca-qb-volume">' + esc(volume + (player.moved ? ' · New Club' : '')) +
      '</small></span></span></td>';
  }

  /* League places for NBA player figures (2026-11-11). The pool is every
     club's players in the evidence window (the season in view): per-game lines
     among players with 10+ MPG (the window's own policy), profile figures
     (tracking, zones, defense, play types) among every profiled player. A
     player under the floor is placed against the pool, not added to it.
     higher: true or false grades the place; null ranks it neutrally (usage,
     volume and movement are not better or worse). */
  var nbaPools = {};
  function nbaPool(game, kind, key, read) {
    var w = game.__nbaWindow;
    if (!w || !w.teams) return null;
    var id = w.season + '|' + kind + '|' + key;
    if (nbaPools[id]) return nbaPools[id];
    var values = [];
    Object.keys(w.teams).forEach(function (code) {
      var team = w.teams[code] || {};
      var list = kind === 'line' ? (team.players || []) : ((team.profile || {}).players || []);
      list.forEach(function (p) {
        if (kind === 'line' && !(p.mpg >= 10)) return;
        var v = read(p);
        if (v != null && isFinite(Number(v))) values.push(Number(v));
      });
    });
    return (nbaPools[id] = values);
  }
  function nbaPlayerPlace(value, pool, higher) {
    if (value == null || !isFinite(Number(value)) || !pool || pool.length < 10) return null;
    var v = Number(value), ahead = 0;
    pool.forEach(function (x) { if (higher === false ? x < v - 1e-9 : x > v + 1e-9) ahead += 1; });
    return { rank: Math.min(ahead + 1, pool.length), of: pool.length };
  }
  function nbaRankedTd(text, place, higher, cohort, detail, extra) {
    if (!place) return '<td class="num ca-stack-rank"' + (detail ? ' title="' + esc(detail) + '"' : '') + '>' + esc(text) +
      (extra || '') + '</td>';
    var tone = higher == null ? 'c-volume' : rankTone(place.rank, place.of);
    var label = place.rank + ordinal(place.rank) + (higher == null ? ' most' : '') + ' of ' + place.of + ' ' + cohort;
    return '<td class="num ca-stack-rank ' + tone + '" title="' + esc((detail ? detail + ' · ' : '') + label) + '">' + esc(text) +
      rankBadge(place, tone, label) + (extra || '') + '</td>';
  }
  // Current 3P% minus the earlier-season track record, for every 10+ MPG
  // shooter with both (the line joined to his profile by player id).
  function nbaGapPool(game) {
    var w = game.__nbaWindow;
    if (!w || !w.teams) return null;
    var id = w.season + '|gap';
    if (nbaPools[id]) return nbaPools[id];
    var values = [];
    Object.keys(w.teams).forEach(function (code) {
      var team = w.teams[code] || {}, track = {};
      ((team.profile || {}).players || []).forEach(function (p) {
        if ((p.three_track_record || {}).pct != null) track[p.player_id] = p.three_track_record.pct;
      });
      (team.players || []).forEach(function (p) {
        if (p.mpg >= 10 && p.three_pct != null && track[p.player_id] != null) values.push((p.three_pct - track[p.player_id]) * 100);
      });
    });
    return (nbaPools[id] = values);
  }
  function nbaProfileRank(game, key, read, value, higher) {
    return nbaPlayerPlace(value, nbaPool(game, 'profile', key, read), higher);
  }

  function nbaRotationPanel(sport, game, side) {
    var list = availability.available(game, side, game[side + '_rotation'])
      .sort(function (a, b) { return (b.mpg || 0) - (a.mpg || 0); }).slice(0, 10);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(fullName(sport, game, side) + ' Rotation') + '</h3>';
    if (!list.length) return head + pending('Player lines are not published for this club yet.') + '</section>';
    var current = !game.__nbaYear || game.__nbaYear === Number(game.season);
    var rows = list.map(function (pl) {
      return '<tr>' + nbaPlayerCell(pl, current ? availability.status(game, side, pl) : '') + NBA_ROTATION.map(function (col) {
        var text = nbaFigure(pl[col[0]], col[2]);
        if (col[0] === 'games' || col[0] === 'mpg') return '<td class="num">' + esc(text) + '</td>';
        var pool = nbaPool(game, 'line', col[0], function (p) { return p[col[0]]; });
        return nbaRankedTd(text, nbaPlayerPlace(pl[col[0]], pool, true), true,
          'same-season players with 10+ MPG' + (pl.mpg >= 10 ? '' : ' (placed; under 10 MPG)'));
      }).join('') + '</tr>';
    });
    return head + '<p class="ca-lineup-context">' +
      esc((game[side + '_rotation_basis'] || 'Per Game') + ' · Most Minutes First') + '</p>' +
      nflSplitTable(NBA_ROTATION.map(function (c) { return c[1]; }), rows, 'Player') +
      nbaColorLegend() + '</section>';
  }

  function nbaShortDate(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3) return String(iso || '');
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12)).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', timeZone: 'UTC'
    });
  }

  function nbaSeasonLabel(year) {
    return Number(year) > 0 ? (Number(year) - 1) + '–' + String(year).slice(-2) : '';
  }

  var NBA_NOISE_NOTE = 'Final score with half of each team\u2019s three-point and free-throw luck taken out: ' +
    'makes against the team\u2019s own season rate, regressed toward the league.';
  var NBA_TEAM_COUNT = 30;
  var NBA_LOG_COLS = [['off_rtg', 'Off/100'], ['def_rtg', 'Def/100'], ['pace', 'Poss/G']];

  function nbaGameLogPanel(sport, game, side) {
    var data = game.__nbaPower, mine = data && data.logs && data.logs[game[side]];
    if (mine && mine.length) return nbaPowerLog(sport, game, side, data, mine);
    var log = game[side + '_game_log'] || [];
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(fullName(sport, game, side) + ' Game Log') + '</h3>';
    if (!log.length) return head + pending('No games played this season yet.') + '</section>';
    var wins = log.filter(function (g) { return g.result === 'W'; }).length;
    var rows = log.map(function (g) {
      var opp = global.ChaseMatchupCard.teamName('nba', g.opponent) || g.opponent;
      return '<tr><td>' + esc(nbaShortDate(g.date)) + '</td>' +
        '<td class="num">' + esc((g.home ? 'vs ' : '@ ') + opp.split(' ').pop()) + '</td>' +
        '<td class="num"><span class="ca-rank ' + (g.result === 'W' ? 'c-good' : 'c-poor') + '">' +
        esc(g.result) + '</span></td>' +
        '<td class="num">' + esc(g.score) + '</td>' +
        '<td class="num">' + esc(nbaFigure(g.off_rtg)) + '</td>' +
        '<td class="num">' + esc(nbaFigure(g.def_rtg)) + '</td>' +
        '<td class="num">' + esc(nbaFigure(g.possessions)) + '</td></tr>';
    });
    return head + '<p class="ca-lineup-context">' +
      esc([nbaSeasonLabel(game.season), 'Last ' + log.length + (log.length === 1 ? ' game' : ' games'),
        wins + '–' + (log.length - wins)].filter(Boolean).join(' · ')) +
      '</p>' + nflSplitTable(['Opponent', 'Result', 'Final', 'Off/100', 'Def/100', 'Poss'], rows, 'Date') + '</section>';
  }

  function nbaGameLogs(sport, game) {
    if (!game.__nbaPower) return nflDuo(nbaGameLogPanel, sport, game);
    return '<div class="ca-cbb-log-stack">' + nbaGameLogPanel(sport, game, 'away') + nbaGameLogPanel(sport, game, 'home') + '</div>';
  }

  function nbaPowerLog(sport, game, side, data, games) {
    var head = '<section class="ca-form-panel ca-cfb-panel ca-log-panel"><h3>' +
      esc(fullName(sport, game, side) + ' Game Log') + '</h3>';
    var wins = games.filter(function (g) { return g.points > g.opp_points; }).length;
    var rows = games.map(function (g) {
      var opp = (global.ChaseMatchupCard.teamName('nba', g.opp) || g.opp).split(' ').pop();
      return '<tr><td>' + esc(nbaShortDate(g.date)) + '</td>' +
        '<td>' + esc((g.home ? 'vs ' : '@ ') + opp) + '</td>' +
        '<td class="num">' + nflLogResult(g.points, g.opp_points, 0) + '</td>' +
        '<td class="num">' + nflLogResult(g.adj_points, g.opp_adj_points, 1) + '</td>' +
        NBA_LOG_COLS.map(function (c) {
          var e = g[c[0]];
          var neutral = c[0] === 'pace';
          var label = 'NBA team-games the week of ' + nbaShortDate(g.week) + (neutral ? ' · most possessions first' : '');
          return powerCell(e, neutral ? 'neutral' : '', e && Number(e.value).toFixed(1), label, NBA_TEAM_COUNT);
        }).join('') + '</tr>';
    });
    var table = nflSplitTable(['Opponent', 'Final', 'Adj. Score'].concat(NBA_LOG_COLS.map(function (c) { return c[1]; })),
      rows, 'Date').replace('<th class="num">Adj. Score</th>', '<th class="num" title="' + esc(NBA_NOISE_NOTE) + '">Adj. Score</th>');
    var context = [nbaSeasonLabel(data.season), data.through ? 'Through ' + nbaShortDate(data.through) : '',
      wins + '–' + (games.length - wins), 'Ranks vs. NBA team-games from the same week'];
    return head + '<p class="ca-lineup-context">' + esc(context.filter(Boolean).join(' · ')) + '</p>' +
      logMarginStrip(games, function (g) { return g.date.slice(5).replace('-', '/'); }) + table + '</section>';
  }

  /* ---------------------------------------------------------------------
   * NBA matchup depth (2026-10-21): how each club plays and who it plays.
   *
   * Everything here is published or observed (nba-model profiles.py):
   * stats.nba.com shot locations, Synergy play types, Second Spectrum
   * tracking, the defender dashboard, bio and coaching staffs; ESPN
   * play-by-play shot kinds and transition; Basketball-Reference's aging
   * history. Each block names the season it is read on.
   * ------------------------------------------------------------------ */
  function nbaProf(game, side) {
    return game[side + '_profile'] || {};
  }

  function nbaPlayers(game, side) {
    return game.nba_fixture_only ? [] : availability.available(game, side, nbaProf(game, side).players);
  }

  function nbaProfBasis(sport, game) {
    var bits = ['away', 'home'].map(function (side) {
      return nflNick(sport, game, side) + ' ' + (nbaProf(game, side).basis || 'Not Published');
    });
    return '<p class="ca-lineup-context">' + esc(bits.join(' · ') + ' · NBA team ranks') + '</p>';
  }

  var NBA_ZONES = [['rim', 'Rim'], ['paint', 'Paint'], ['mid', 'Mid-Range'], ['corner3', 'Corner 3'],
    ['above3', 'Above-Break 3']];

  /* A half court in feet x 10 (basket at 250, 52.5). Zones follow the league's
     shot-location zones; each is shaded by its FG% rank and labelled with the
     share of shots taken there and the FG% on them. */
  var NBA_COURT = {
    above3: 'M0 142 L0 470 L500 470 L500 142 L470 142 A237.5 237.5 0 0 1 30 142 Z',
    mid: 'M30 0 L30 142 A237.5 237.5 0 0 0 470 142 L470 0 Z',
    corner3: 'M0 0 L30 0 L30 142 L0 142 Z M470 0 L500 0 L500 142 L470 142 Z',
    paint: 'M170 0 L330 0 L330 190 L170 190 Z',
    rim: 'M210 0 L290 0 L290 52.5 A40 40 0 0 1 210 52.5 Z'
  };
  var NBA_COURT_LABEL = { rim: [250, 40], paint: [250, 150], mid: [250, 245], corner3: [62, 100],
    above3: [250, 360] };

  function nbaPct(v, d) {
    return v == null || !isFinite(Number(v)) ? '—' : (Number(v) * 100).toFixed(d == null ? 1 : d) + '%';
  }

  function nbaCourt(off, title) {
    var zones = ['above3', 'mid', 'corner3', 'paint', 'rim'];
    var shapes = zones.map(function (z) {
      var e = (off[z] || {}).fg || {};
      var tone = e.rank && e.of ? rankTone(e.rank, e.of) : 'c-na';
      return '<path class="ca-court-zone ' + tone + '" d="' + NBA_COURT[z] + '"' +
        nbaTip(((off[z] || {}).label || z) + ': ' + nbaPct(((off[z] || {}).share || {}).value) + ' of shots, ' +
          nbaPct(e.value) + ' FG' + (e.rank ? ' (' + e.rank + ordinal(e.rank) + ' of ' + e.of + ')' : '')) + '></path>';
    }).join('');
    var lines = '<g class="ca-court-lines" aria-hidden="true">' +
      '<rect x="1" y="1" width="498" height="468"></rect>' +
      '<rect x="170" y="1" width="160" height="189"></rect>' +
      '<circle cx="250" cy="190" r="60"></circle>' +
      '<path d="M210 52.5 A40 40 0 0 0 290 52.5"></path>' +
      '<path d="M30 1 L30 142 A237.5 237.5 0 0 0 470 142 L470 1"></path>' +
      '<line x1="220" y1="40" x2="280" y2="40"></line>' +
      '<circle class="ca-court-rim" cx="250" cy="52.5" r="7.5"></circle></g>';
    var badges = zones.filter(function (z) { return z !== 'corner3'; }).map(function (z) {
      var pos = NBA_COURT_LABEL[z], zone = off[z] || {};
      var share = (zone.share || {}).value, fg = zone.fg || {};
      if (share == null && fg.value == null) return '';
      var y = z === 'rim' ? 98 : z === 'paint' ? 160 : pos[1];
      return '<g class="ca-court-badge '+(fg.rank ? rankTone(fg.rank,fg.of) : 'c-na')+'" transform="translate(' + pos[0] + ' ' + y + ')">' +
        '<rect x="-46" y="-26" width="92" height="50" rx="10"></rect>' +
        '<text class="ca-court-badge__big" y="-2">' + esc(nbaPct(share, 0)) + '</text>' +
        '<text class="ca-court-badge__small" y="16">' + esc(nbaPct(fg.value)) + (fg.rank ? ' · ' + fg.rank +
          ordinal(fg.rank) : '') + '</text></g>';
    }).join('');
    var c3 = off.corner3 || {};
    return '<figure class="ca-court ca-nba-court"><svg viewBox="0 0 500 470" role="img" aria-label="' + esc(title) + '">' +
      '<rect class="ca-court-floor" x="0" y="0" width="500" height="470"></rect>' + shapes + lines + badges + '</svg>' +
      '<figcaption>Share of shots · FG% · FG% rank, zones shaded by rank · Corner 3: ' +
      esc(nbaPct((c3.share || {}).value, 0) + ' · ' + nbaPct((c3.fg || {}).value)) + '</figcaption></figure>';
  }

  function nbaShotChartPanel(sport, game, offSide) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var off = ((nbaProf(game, offSide).shot_profile || {}).offense) || {};
    var dfn = ((nbaProf(game, defSide).shot_profile || {}).defense) || {};
    var offName = fullName(sport, game, offSide), defName = fullName(sport, game, defSide);
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger"><h3>' +
      esc(offName + ' Shots vs ' + defName + ' Defense') + '</h3>';
    if (!Object.keys(off).length) return head + pending('Shot locations are not published for this club yet.') + '</section>';
    var groups = [
      { title: 'Share Of Field-Goal Attempts', rows: NBA_ZONES.map(function (z) {
        return cfbLedgerRow(z[1] + ' Share', (off[z[0]] || {}).share, (dfn[z[0]] || {}).share);
      }) },
      { title: 'Field-Goal Percentage By Zone', rows: NBA_ZONES.map(function (z) {
        return cfbLedgerRow(z[1] + ' FG%', (off[z[0]] || {}).fg, (dfn[z[0]] || {}).fg);
      }) }
    ];
    var zb = nbaProf(game, offSide).zones_basis;
    return head + (zb ? '<p class="ca-lineup-context">' + esc('Geometric shot zones · ' + zb) + '</p>' : '') +
      nbaCourt(off, offName + ' shot chart') +
      cfbLedgerTable([offName, 'Offense'], [defName, 'Allowed'], groups) +
      '<p class="ca-cbb-note">Offense FGM/FGA: '+esc(NBA_ZONES.map(function(z){var x=off[z[0]]||{};return z[1]+' '+(x.made==null?'No Shots':x.made+'/'+x.attempts);}).join(' · '))+'</p>' + '</section>';
  }

  var NBA_KINDS = [['drive', 'Drives'], ['rim_finish', 'Rim Finishes'], ['cut', 'Cuts'], ['putback', 'Putbacks'],
    ['post', 'Post Moves'], ['floater', 'Floaters'], ['pullup', 'Pull-Ups'], ['stepback', 'Step-Backs'],
    ['catch_shoot', 'Catch-And-Shoot'], ['jumper', 'Other Jumpers'], ['transition', 'Transition'],
    ['assisted', 'Assisted (Of Makes)']];

  function nbaKindsPanel(sport, game, side) {
    var kinds = nbaProf(game, side).shot_kinds || {};
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Shot Diet') + '</h3>';
    if (!Object.keys(kinds).length) return head + pending('Shot kinds are not published for this club yet.') + '</section>';
    var rows = NBA_KINDS.filter(function (k) { return kinds[k[0]]; }).map(function (k) {
      var e = kinds[k[0]];
      // Assisted is a share of makes: it has no shooting percentage of its own.
      var efg = e.efg || { value: null, missing: k[0] === 'assisted' ? 'Not Applicable' : 'Under 15 Att' };
      return '<tr><td>' + esc(k[1]) + '</td>' + cfbCell(e.share) + cfbCell(efg) + '</tr>';
    });
    return head + '<p class="ca-lineup-context">ESPN play-by-play · Effective FG% requires at least 15 attempts</p>' +
      nflSplitTable(['Share', 'eFG%'], rows, 'Shot').replace('ca-nfl-split', 'ca-nfl-split ca-nba-fit') + '</section>';
  }

  var NBA_PT_SHORT = { PRBallHandler: 'P&R Ball Handler', PRRollman: 'P&R Roll Man', OffRebound: 'Putbacks',
    OffScreen: 'Off Screen', Misc: 'Other' };

  // Possessions per game of a play type, placed among the 30 clubs (most first):
  // volume, so it ranks without a good or bad tone.
  function nbaPlayTypeVolume(game, side, key, value) {
    var w = game.__nbaWindow, pool = [];
    if (w && w.teams) Object.keys(w.teams).forEach(function (code) {
      var e = ((((w.teams[code] || {}).profile || {}).play_types || {})[side] || {})[key];
      if (e && e.possessions_per_game != null) pool.push(Number(e.possessions_per_game));
    });
    var place = nbaPlayerPlace(value, pool, true);
    return { value: value, format: 'num', better: 'neutral', rank: place ? place.rank : null, of: place ? place.of : null,
      label: 'possessions per game' };
  }

  function nbaPlayTypePanel(sport, game, offSide) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var off = ((nbaProf(game, offSide).play_types || {}).offense) || {};
    var dfn = ((nbaProf(game, defSide).play_types || {}).defense) || {};
    var offName = fullName(sport, game, offSide), defName = fullName(sport, game, defSide);
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger"><h3>' +
      esc(offName + ' Play Types vs ' + defName + ' Defense') + '</h3>';
    var keys = Object.keys(off).sort(function (a, b) {
      return (((off[b] || {}).freq || {}).value || 0) - (((off[a] || {}).freq || {}).value || 0);
    });
    if (!keys.length) return head + pending('Play types are not published for this club yet.') + '</section>';
    var groups = [
      { title: 'Usage (Share Of Possessions)', rows: keys.map(function (k) {
        return cfbLedgerRow(NBA_PT_SHORT[k] || off[k].label, off[k].freq, (dfn[k] || {}).freq);
      }) },
      { title: 'Efficiency (Points Per Possession)', rows: keys.map(function (k) {
        return cfbLedgerRow(NBA_PT_SHORT[k] || off[k].label, off[k].ppp, (dfn[k] || {}).ppp);
      }) },
      {title:'Volume (Possessions Per Game)',rows:keys.map(function(k){
        return cfbLedgerRow(NBA_PT_SHORT[k]||off[k].label,nbaPlayTypeVolume(game,'offense',k,off[k].possessions_per_game),
          nbaPlayTypeVolume(game,'defense',k,(dfn[k]||{}).possessions_per_game));})}
    ];
    return head + nbaProfBasis(sport, game) + '<p class="ca-lineup-context">Synergy Play Types · stats.nba.com</p>' +
      cfbLedgerTable([offName, 'Offense'], [defName, 'Defense Faced'], groups) + '</section>';
  }

  // Opponents' FG% against a player minus their normal FG%: negative is good defense.
  function nbaDiffCell(game, z) {
    if (!z || z.diff == null) return '<td class="num ca-vs-none">Not Tracked</td>';
    var d = Number(z.diff) * 100;
    var place = nbaProfileRank(game, 'dz|' + z.zone, function (p) {
      var hit = (p.defense_zones || []).filter(function (x) { return x.zone === z.zone; })[0];
      return hit ? hit.diff : null;
    }, z.diff, false);
    return nbaRankedTd((d > 0 ? '+' : '') + d.toFixed(1), place, false, 'profiled defenders · lowest first',
      z.label + ': ' + nbaPct(z.fg_against) + ' against vs ' + nbaPct(z.normal_fg) + ' normal · ' +
      (z.attempts_pg != null ? Number(z.attempts_pg).toFixed(1) : '—') + ' attempts per game');
  }

  function nbaDefendersPanel(sport, game, side) {
    var players = nbaPlayers(game, side);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Defenders By Zone') + '</h3>';
    var withD = players.filter(function (p) { return (p.defense_zones || []).length; });
    if (!withD.length) return head + pending('Defender tracking is not published for this club yet.') + '</section>';
    var cols = [['Less Than 6Ft', 'Rim'], ['Less Than 10Ft', '≤10 Ft'], ['Greater Than 15Ft', '15+ Ft'],
      ['3 Pointers', '3PT'], ['Overall', 'All']];
    var rows = withD.map(function (p) {
      var by = {};
      p.defense_zones.forEach(function (z) { by[z.zone] = z; });
      var speed = p.tracking && p.tracking.speed_def != null ? Number(p.tracking.speed_def) : null;
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) + cols.map(function (c) { return nbaDiffCell(game, by[c[0]]); }).join('') +
        (speed == null ? '<td class="num ca-vs-none">Not Tracked</td>' :
          nbaRankedTd(speed.toFixed(2), nbaProfileRank(game, 'speed_def', function (x) {
            return (x.tracking || {}).speed_def; }, speed, null), null, 'profiled players · mph on defense')) +
        '</tr>';
    });
    return head + '<p class="ca-lineup-context">' + esc('Opponents’ FG% With Him As Closest Defender, Minus ' +
      'Their Normal FG% (Points) · Negative Is Better · ' + (nbaProf(game, side).basis || '')) + '</p>' +
      nflSplitTable(cols.map(function (c) { return c[1]; }).concat(['D Speed']), rows, 'Defender') + '</section>';
  }

  function nbaEntry(obj, key) { return obj ? obj[key] : null; }

  /* On-floor defense: opponents' FG% in each zone with the player on the
     floor against with him off it (ESPN play-by-play). Shares credit with
     four teammates, so it reads beside the closest-defender table, not
     instead of it. */
  function nbaOnFloorCell(game, z) {
    if (!z || z.diff == null) return '<td class="num ca-vs-none">Too Few Shots</td>';
    var d = Number(z.diff) * 100;
    var place = nbaProfileRank(game, 'of|' + z.zone, function (p) {
      var hit = (p.defense_onfloor || []).filter(function (x) { return x.zone === z.zone; })[0];
      return hit ? hit.diff : null;
    }, z.diff, false);
    return nbaRankedTd((d > 0 ? '+' : '') + d.toFixed(1), place, false, 'profiled players · lowest first',
      z.label + ': ' + nbaPct(z.fg_on) + ' with him on the floor (' + z.attempts_on + ' attempts) vs ' +
      nbaPct(z.fg_off) + ' with him off (' + z.attempts_off + ')');
  }

  function nbaOnFloorPanel(sport, game, side) {
    var prof = nbaProf(game, side);
    var players = nbaPlayers(game, side).filter(function (p) { return (p.defense_onfloor || []).length; });
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' On-Floor Defense By Zone') + '</h3>';
    if (!players.length) return head + pending('Not enough on-floor shots for this club yet.') + '</section>';
    var cols = [['rim', 'Rim'], ['paint', 'Paint'], ['mid', 'Mid'], ['three', '3PT']];
    var rows = players.map(function (p) {
      var by = {};
      p.defense_onfloor.forEach(function (z) { by[z.zone] = z; });
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) + cols.map(function (c) { return nbaOnFloorCell(game, by[c[0]]); }).join('') +
        '</tr>';
    });
    return head + '<p class="ca-lineup-context">' + esc('Opponents’ FG% With Him On The Floor Minus With Him ' +
      'Off (Points) · Negative Is Better · ' + (prof.zones_basis || '') + ' · 60+ Attempts Each Way') + '</p>' +
      nflSplitTable(cols.map(function (c) { return c[1]; }), rows, 'Defender') + '</section>';
  }

  function nbaSizeBody(sport, game) {
    var a = nbaProf(game, 'away').size || {}, h = nbaProf(game, 'home').size || {};
    return cfbHeadToHead(sport, game, fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') +
      ' Size And Age', nbaProfBasis(sport, game),
      [['Height (In)', a.height, h.height], ['Tallest Regular (In)', a.tallest, h.tallest],
        ['Weight (Lb)', a.weight, h.weight], ['Age', a.age, h.age]]);
  }

  function nbaTrackingBody(sport, game) {
    var a = nbaProf(game, 'away'), h = nbaProf(game, 'home');
    var at = a.tracking || {}, ht = h.tracking || {};
    function tr(p) { return ((p.play_types || {}).offense || {}).Transition || {}; }
    return cfbHeadToHead(sport, game, fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') +
      ' Speed And Movement', '<p class="ca-lineup-context">Second Spectrum Tracking And Synergy · stats.nba.com</p>',
      [['Avg Speed (Mph)', at.avg_speed, ht.avg_speed], ['Speed On Offense', at.avg_speed_off, ht.avg_speed_off],
        ['Speed On Defense', at.avg_speed_def, ht.avg_speed_def], ['Miles Per Game', at.dist_miles, ht.dist_miles],
        ['Transition Share', tr(a).freq, tr(h).freq], ['Transition PPP', tr(a).ppp, tr(h).ppp],
        ['Drives/G', at.drives, ht.drives], ['Drive FG%', at.drive_fg_pct, ht.drive_fg_pct],
        ['Catch-And-Shoot Att', at.catch_shoot_fga, ht.catch_shoot_fga],
        ['Catch-And-Shoot eFG%', at.catch_shoot_efg_pct, ht.catch_shoot_efg_pct],
        ['Pull-Up Att', at.pull_up_fga, ht.pull_up_fga], ['Pull-Up eFG%', at.pull_up_efg_pct, ht.pull_up_efg_pct],
        ['Post Touches', at.post_touches, ht.post_touches]]);
  }

  /* A league percentile as a short bar: the 50th is marked, the fill runs
     in the club's colour, and the number sits beside it. */
  function nbaPctlRows(rows, side) {
    return '<div class="ca-pctl">' + rows.map(function (r) {
      var v = Math.max(0, Math.min(100, Number(r.percentile) || 0));
      return '<div class="ca-pctl__row"' + nbaTip(r.label + ': ' + Math.round(v) + ordinal(Math.round(v)) +
        ' percentile' + (r.tip ? ' · ' + r.tip : '')) + '><span class="ca-pctl__label">' + esc(r.label) +
        '</span><span class="ca-pctl__track"><i class="ca-pctl__fill is-' + side + '" style="width:' + v.toFixed(1) +
        '%"></i><i class="ca-pctl__mid"></i></span><b class="ca-pctl__val">' + Math.round(v) + '</b></div>';
    }).join('') + '</div>';
  }

  function nbaStylePanel(sport, game, side) {
    var p = nbaProf(game, side), coach = p.coach || {}, phil = coach.philosophy || {};
    var nick = nflNick(sport, game, side);
    var head = '<section class="ca-form-panel ca-cfb-panel ca-coach-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Coach And Style') + '</h3>';
    var tenure = coach.first_season_with_club ? 'First Season With The ' + nick :
      coach.season_with_club ? 'Season ' + coach.season_with_club + ' With The ' + nick : '';
    var hero = '<div class="ca-coach-hero"><div><span class="ca-coach-hero__kicker">Head Coach</span><b>' +
      esc(coach.head_coach || 'Not Published') + '</b></div>' +
      (tenure ? '<span class="ca-coach-tenure' + (coach.first_season_with_club ? ' is-new' : '') + '">' +
        esc(tenure) + '</span>' : '') + '</div>';
    var facts = '<dl class="ca-detail-list">' + [
      ['NBA Head-Coaching Seasons', coach.seasons_as_head_coach != null ? String(coach.seasons_as_head_coach) :
        (coach.head_coach_seasons != null ? String(coach.head_coach_seasons) : 'Not Published')],
      ['Career Record', coach.career_record && coach.career_record !== '0-0' ? coach.career_record :
        'No Games Yet'],
      ['Staff Size', coach.staff_size != null ? String(coach.staff_size) : 'Not Published']
    ].map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') +
      '</dl>';
    var career = (coach.career || []).slice(-6);
    var path = career.length ? '<div class="ca-coach-career" aria-label="Head-coaching seasons">' + career.map(function (c) {
      return '<span' + nbaTip(c.season_label + ' · ' + c.team + ' · ' + c.w + '-' + c.l + ' in ' + c.games + ' games') +
        '><b>' + esc(c.season_label) + '</b>' + esc(c.team + ' ' + c.w + '-' + c.l) + '</span>';
    }).join('') + '</div>' : '';
    var metrics = phil.metrics || [];
    function group(off) {
      return metrics.filter(function (m) { return off !== /^(opp_|drb)/.test(m.key); }).map(function (m) {
        return { label: m.label, percentile: m.percentile, tip: m.seasons + ' season' + (m.seasons === 1 ? '' : 's') };
      });
    }
    var fingerprint = metrics.length ? '<div class="ca-coach-fp"><div><h4>Offense</h4>' +
      nbaPctlRows(group(true), side) + '</div><div><h4>Defense</h4>' + nbaPctlRows(group(false), side) +
      '</div></div>' : '';
    var philTags = (phil.tags || []).slice(0, 6).map(function (t) {
      return '<li class="ca-style-tag"><span>' + esc(t.tag) + '</span><small>' + Math.round(t.percentile) +
        ordinal(Math.round(t.percentile)) + ' pct</small></li>';
    }).join('');
    var tags = (p.style || []).map(function (t) {
      return '<li class="ca-style-tag"><span>' + esc(t.tag) + '</span>' + rankBadge({ rank: t.rank, of: t.of }) + '</li>';
    }).join('');
    return head + hero + facts + path +
      '<h4 class="ca-coach-h">Coaching Fingerprint</h4>' +
      (metrics.length ? '<p class="ca-lineup-context">League percentiles across coaching seasons · Midline is 50th</p>' : '') +
      (philTags ? '<ul class="ca-style-tags">' + philTags + '</ul>' : '') + fingerprint +
      '<h4 class="ca-coach-h">This Roster’s Style</h4><p class="ca-lineup-context">' + esc('Shown Where ' +
      'The Club Ranks Top Or Bottom Five · ' + (p.basis || '')) + '</p>' +
      (tags ? '<ul class="ca-style-tags">' + tags + '</ul>' : pending('No extreme tendencies on this basis.')) +
      '</section>';
  }

  var NBA_SCHEME_ORDER = ['switch', 'pnr_pressure', 'pnr_containment', 'roll_allowed', 'mid_funnel',
    'rim_deterrence', 'rim_protection', 'iso_faced', 'threes_conceded', 'assisted_threes'];

  function nbaSchemePanel(sport, game, side) {
    var p = nbaProf(game, side), ds = p.defense_scheme || {}, coach = (p.coach || {}).head_coach;
    var head = '<section class="ca-form-panel ca-cfb-panel ca-scheme-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Inferred Defensive Tendencies') + '</h3>';
    var idx = ds.indices || {};
    if (!Object.keys(idx).length) return head + pending('Scheme figures are not published for this club yet.') + '</section>';
    // A status line, not an explanation: whose staff the figures were measured under.
    var under = ds.measured_under && coach && ds.measured_under !== coach ?
      pending('Measured Under ' + ds.measured_under + ' · ' + (ds.basis || 'Last Season')) : '';
    var reads = (ds.reads || []).map(function (r) {
      return '<li class="ca-scheme-read is-' + esc(r.strength) + '"><div class="ca-scheme-read__head"><b>' + esc(r.scheme) +
        '</b><span>' + esc(r.strength === 'strong' ? 'Strong Signal' : 'Clear Signal') + '</span></div>' +
        '<p class="ca-scheme-read__ev">' + esc((r.evidence || []).map(function (e) {
          return e.label + ' ' + Math.round(e.percentile) + ordinal(Math.round(e.percentile));
        }).join(' · ')) + '</p></li>';
    }).join('');
    var rows = NBA_SCHEME_ORDER.filter(function (k) { return idx[k]; }).map(function (k) {
      return { label: idx[k].label, percentile: idx[k].percentile };
    });
    return head + '<p class="ca-lineup-context">' + esc((ds.basis || '') + ' · League percentiles from observed outcomes') + '</p>' + under +
      (reads ? '<ul class="ca-scheme-reads">' + reads + '</ul>' : '') +
      '<h4 class="ca-coach-h">The Figures Behind It</h4>' + nbaPctlRows(rows, side) +
      '</section>';
  }

  var NBA_REGRESSION = [['opp_three_luck', 'Opp 3P% − League'], ['own_three_vs_league', 'Own 3P% − League'],
    ['opp_ft_luck', 'Opp FT% − League'], ['close_win_pct', 'Close-Game Win%'],
    ['wins_over_pythag', 'Wins vs Point Diff']];

  // A regression row's entry, or a word for why it has none (no dashes).
  function regressionEntry(prof, key) {
    var e = prof[key];
    if (e && e.value != null) return e;
    if (!Object.keys(prof).length) return null;  // nothing published: the panel says so
    if (key === 'close_win_pct') {
      // Under three close games has no rate; the record itself still reads.
      var record = prof.close_record;
      return { value: null, missing: record && record !== '0-0' ? record + ' Close' : 'No Close Games' };
    }
    return { value: null, missing: 'Too Few Games' };
  }

  function nbaRegressionBody(sport, game) {
    var a = nbaProf(game, 'away').regression || {}, h = nbaProf(game, 'home').regression || {};
    var basis = nbaProf(game, 'away').regression_basis || nbaProf(game, 'home').regression_basis || '';
    var context = '<p class="ca-lineup-context">' + esc(basis + ' · Close Games: ' +
      nflNick(sport, game, 'away') + ' ' + (a.close_record || 'None') + ', ' + nflNick(sport, game, 'home') + ' ' +
      (h.close_record || 'None')) + '</p>';
    return cfbHeadToHead(sport, game, fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') +
      ' Regression Watch', context, NBA_REGRESSION.map(function (r) {
        return [r[1], regressionEntry(a, r[0]), regressionEntry(h, r[0])];
      }));
  }

  function nbaShooterRegressionPanel(sport, game, side) {
    var prof = {};
    nbaPlayers(game, side).forEach(function (p) { prof[p.player_id] = p; });
    var rot = availability.available(game, side, game[side + '_rotation']).filter(function (p) { return prof[p.player_id]; });
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Shooters And Age') + '</h3>';
    if (!rot.length) return head + pending('Player profiles are not published for this club yet.') + '</section>';
    var rows = rot.map(function (p) {
      var pr = prof[p.player_id], rec = pr.three_track_record || {}, age = pr.age_change || {};
      var gap = p.three_pct != null && rec.pct != null ? (p.three_pct - rec.pct) * 100 : null;
      var ageO = age.offense, ageD = age.defense;
      var shooters = nbaPool(game, 'line', 'three_pct', function (x) { return x.three_pm >= 1 ? x.three_pct : null; });
      var ageTotal = ageO == null ? null : ageO + (ageD || 0);
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) +
        (p.three_pct == null ? '<td class="num ca-vs-none">No Attempts</td>' :
          nbaRankedTd(nbaPct(p.three_pct), nbaPlayerPlace(p.three_pct, shooters, true), true,
            'same-season shooters with 10+ MPG and 1+ 3PM per game')) +
        (rec.pct == null ? '<td class="num ca-vs-none">No Track Record</td>' :
          nbaRankedTd(nbaPct(rec.pct), nbaProfileRank(game, 'track', function (x) {
            return (x.three_track_record || {}).pct; }, rec.pct, true), true, 'profiled players · earlier seasons',
            rec.attempts + ' attempts in earlier seasons', '<small class="ca-qb-volume">' + esc(rec.attempts + ' att') + '</small>')) +
        (gap == null ? '<td class="num ca-vs-none">No Track Record</td>' :
          nbaRankedTd((gap > 0 ? '+' : '') + gap.toFixed(1), nbaPlayerPlace(gap, nbaGapPool(game), null),
            null, 'shooting above track record')) +
        '<td class="num">' + esc(pr.age != null ? String(Math.round(pr.age)) : 'Not Listed') + '</td>' +
        (ageTotal == null ? '<td class="num ca-vs-none">Not Published</td>' :
          nbaRankedTd((ageTotal > 0 ? '+' : '') + ageTotal.toFixed(1), nbaProfileRank(game, 'age_curve', function (x) {
            var a = x.age_change || {}; return a.offense == null ? null : a.offense + (a.defense || 0); }, ageTotal, true),
            true, 'profiled players · largest expected gain first', (age.about || '') + ' · Offense ' +
            Number(ageO).toFixed(2) + ', Defense ' + Number(ageD || 0).toFixed(2))) + '</tr>';
    });
    return head + '<p class="ca-lineup-context">' + esc((game[side + '_rotation_basis'] || '') + ' 3P% · Track ' +
      'Record: Earlier Seasons · Age Curve: League Average Change In Box Plus-Minus From This Age To The Next') +
      '</p>' + nflSplitTable(['3P%', 'Track Record', 'Gap', 'Age', 'Age Curve'], rows, 'Player') + '</section>';
  }

  function nbaPlayerTypesPanel(sport, game, side) {
    var players = nbaPlayers(game, side).filter(function (p) { return (p.play_types || []).length; });
    var head = '<section class="ca-form-panel ca-cfb-panel ca-nba-player-type-panel"><h3>' + esc(fullName(sport, game, side) +
      ' How Each Player Scores') + '</h3>';
    if (!players.length) return head + pending('Player play types are not published yet.') + '</section>';
    var rows = players.map(function (p) {
      var cells = [0, 1, 2].map(function (i) {
        var t = p.play_types[i];
        if (!t) return '<td class="ca-vs-none">None</td>';  // fewer than three play types logged
        var place = nbaProfileRank(game, 'pt|' + t.play_type, function (x) {
          var hit = (x.play_types || []).filter(function (y) { return y.play_type === t.play_type; })[0];
          return hit ? hit.ppp : null;
        }, t.ppp, true);
        var tone = place ? rankTone(place.rank, place.of) : '';
        var label = place ? place.rank + ordinal(place.rank) + ' of ' + place.of + ' profiled players running ' + t.label : '';
        return '<td class="' + tone + '" title="' + esc(t.label + ': ' + nbaPct(t.freq, 0) + ' of his possessions, ' +
          (t.ppp != null ? Number(t.ppp).toFixed(2) : 'no') + ' points per possession' + (label ? ' · ' + label : '')) + '">' +
          esc(t.label) + '<small class="ca-qb-volume">' + esc(nbaPct(t.freq, 0) + ' · ' +
          (t.ppp != null ? Number(t.ppp).toFixed(2) + ' PPP' : 'No PPP')) + '</small>' + rankBadge(place, tone, label) + '</td>';
      }).join('');
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) + cells + '</tr>';
    });
    return head + '<p class="ca-lineup-context">Synergy · Share of player possessions and points per possession' +
      ' · Efficiency ranked against players in the same play type</p>' +
      nflSplitTable(['Most Used', 'Second', 'Third'], rows, 'Player', false) + '</section>';
  }

  function nbaPlayerZonesPanel(sport, game, side) {
    var players = nbaPlayers(game, side).filter(function (p) { return (p.zones || []).length; });
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Where Each Player Shoots') + '</h3>';
    if (!players.length) return head + pending('Player shot locations are not published yet.') + '</section>';
    var rows = players.map(function (p) {
      var by = {};
      p.zones.forEach(function (z) { by[z.zone] = z; });
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) + NBA_ZONES.map(function (z) {
        var e = by[z[0]];
        if (!e || !e.fga) return '<td class="num ca-vs-none">None</td>';
        var share = '<small class="ca-qb-volume">' + esc(nbaPct(e.share, 0) + ' FGA') + '</small>';
        // Under one attempt a game the FG% is a thin sample: shown, not ranked.
        if (e.fga < 1) return '<td class="num ca-stack-rank" title="' + esc(z[1] + ': ' + Number(e.fga).toFixed(1) +
          ' attempts per game, under the 1 per game ranked') + '">' + esc(nbaPct(e.fg)) +
          share + '<small class="ca-qb-volume">Low n</small></td>';
        var place = nbaProfileRank(game, 'zone|' + z[0], function (x) {
          var hit = (x.zones || []).filter(function (y) { return y.zone === z[0]; })[0];
          return hit && hit.fga >= 1 ? hit.fg : null;
        }, e.fg, true);
        return nbaRankedTd(nbaPct(e.fg), place, true, 'profiled players with 1+ attempt per game there',
          z[1] + ': ' + Number(e.fga).toFixed(1) + ' attempts per game', share);
      }).join('') + '</tr>';
    });
    return head + '<p class="ca-lineup-context">NBA Stats · Accuracy rank requires 1+ attempt per game in that zone</p>' +
      nflSplitTable(NBA_ZONES.map(function (z) { return z[1]; }), rows, 'Player') + '</section>';
  }

  function nbaBioCell(game, key, read, value, higher, text, what) {
    if (value == null) return '<td class="num ca-vs-none">Not Tracked</td>';
    return nbaRankedTd(text, nbaProfileRank(game, key, read, value, higher), higher, 'profiled players · ' + what);
  }

  function nbaPlayerBioPanel(sport, game, side) {
    var players = nbaPlayers(game, side);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(fullName(sport, game, side) +
      ' Bodies And Engines') + '</h3>';
    if (!players.length) return head + pending('Player bio is not published yet.') + '</section>';
    var rows = players.map(function (p) {
      var t = p.tracking || {};
      return '<tr>' + nbaPlayerCell(p, availability.status(game, side, p)) +
        '<td class="num">' + esc(p.height || 'Not Listed') + '</td>' +
        '<td class="num">' + esc(p.weight_lb != null ? String(Math.round(p.weight_lb)) : 'Not Listed') + '</td>' +
        '<td class="num">' + esc(p.age != null ? String(Math.round(p.age)) : 'Not Listed') + '</td>' +
        nbaBioCell(game, 'usage', function (x) { return x.usage; }, p.usage, null, nbaPct(p.usage), 'usage') +
        nbaBioCell(game, 'ts', function (x) { return x.ts; }, p.ts, true, nbaPct(p.ts), 'true shooting') +
        nbaBioCell(game, 'speed', function (x) { return (x.tracking || {}).speed; }, t.speed,
          null, t.speed != null ? Number(t.speed).toFixed(2) : '', 'mph') +
        nbaBioCell(game, 'drives', function (x) { return (x.tracking || {}).drives; }, t.drives,
          null, t.drives != null ? Number(t.drives).toFixed(1) : '', 'drives per game') + '</tr>';
    });
    return head + '<p class="ca-lineup-context">NBA Stats and Second Spectrum · TS% is true shooting percentage</p>' +
      nflSplitTable(['Height', 'Weight (lb)', 'Age', 'Usage%', 'TS%', 'Speed (mph)', 'Drives/G'], rows, 'Player') + '</section>';
  }

  /* Five-man units and situational splits (2026-11-18 audit; nba-model
     lineups.py). Units come from pbpstats.com: the club's most-used fives,
     points per 100 possessions both ways, plain figures (no league pool of
     units to place them in). Splits are the club's net rating at home, on
     the road, on the second night of a back-to-back and with rest, each
     placed among the 30 clubs, the games behind it in the tooltip. */
  function nbaLineupsPanel(sport, game, side) {
    var units = game[side + '_lineup_units'] || [];
    var head = '<section class="ca-form-panel ca-cfb-panel ca-nba-units"><h3>' + esc(fullName(sport, game, side) + ' Five-Man Units') + '</h3>';
    if (!units.length) return head + pending('Five-man units are not published for this club yet.') + '</section>';
    function one(v) { return v == null ? 'Not Published' : Number(v).toFixed(1); }
    var rows = units.map(function (u) {
      var names = (u.players || []).map(function (n) {
        var parts = String(n).split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : String(n);
      }).join(', ');
      var net = u.net_rating;
      return '<tr><td title="' + esc((u.players || []).join(', ')) + '">' + esc(names) + '</td>' +
        '<td class="num">' + esc(one(u.minutes)) + '</td><td class="num">' + esc(one(u.off_rating)) + '</td>' +
        '<td class="num">' + esc(one(u.def_rating)) + '</td><td class="num">' +
        esc(net == null ? 'Not Published' : (net > 0 ? '+' : '') + Number(net).toFixed(1)) + '</td></tr>';
    });
    return head + '<p class="ca-lineup-context">' + esc([nbaSeasonLabel(game.season), 'pbpstats', 'Total minutes together']
      .filter(Boolean).join(' · ')) + '</p>' + nflSplitTable(['Min', 'Off/100', 'Def/100', 'Net/100'], rows, 'Unit') + '</section>';
  }
  var NBA_SPLITS = [['at_home', 'At Home'], ['on_road', 'On The Road'], ['back_to_back', 'Back-To-Back'],
    ['rested', 'With Rest']];
  function nbaSplitsBody(sport, game) {
    var a = game.away_splits || {}, h = game.home_splits || {};
    function entry(splits, key) {
      var e = splits[key];
      if (!e) return Object.keys(splits).length ? { value: null, missing: 'No Games' } : null;
      var n = (splits.games || {})[key];
      return Object.assign({}, e, { cohort: 'NBA teams in this split', sample: n ? n + (n === 1 ? ' game' : ' games') : '' });
    }
    var context = '<p class="ca-lineup-context">' + esc([nbaSeasonLabel(game.season), 'Same-split NBA team ranks']
      .filter(Boolean).join(' · ')) + '</p>';
    return cfbHeadToHead(sport, game, fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') +
      ' Situational Splits', context, NBA_SPLITS.map(function (r) { return [r[1], entry(a, r[0]), entry(h, r[0])]; }));
  }

  function nbaSchedulePanel(sport, game, side) {
    var s = game[side + '_schedule'] || {};
    return teamPanel(sport, game, side, [
      ['Rest', value(game[side + '_rest_label'])],
      ['Games In Last 7 Days', s.games_last_7 != null ? String(s.games_last_7) : null],
      ['Third Game In Four Nights', s.three_in_four ? 'Yes' : 'No'],
      ['Travel Into Tonight (Mi)', s.travel_miles != null ? String(s.travel_miles) : 'At Home Or First Game'],
      ['Miles In Last 7 Days', s.miles_last_7 != null ? String(s.miles_last_7) : null],
      ['Time Zones Crossed', s.tz_shift != null ? String(s.tz_shift) : null],
      ['Visiting Altitude', s.altitude ? 'Yes' : 'No']
    ]);
  }

  /* ---------------------------------------------------------------------
   * NBA matchup illustrations (2026-10-21).
   *
   * Away is --nba-away, home --nba-home: the clubs' colours set on the host
   * by nbaPair, with the validated --viz pair behind them. Every mark carries a hover/focus tooltip (data-tip) and
   * every chart sits beside a table that holds the same figures.
   * ------------------------------------------------------------------ */
  /* Team identity for the NBA illustrations: the clubs' own colours, lifted
     to the 3:1 floor on the dark ground and switched to a second colour when
     the pair is too close (MLBMAAssets.teamPairColors, the radar's rule). The
     validated --viz pair stands in only when no combination separates. */
  function nbaPair(game) {
    var A = global.MLBMAAssets;
    var pair = A && A.teamPairColors ? A.teamPairColors(game.away, game.home, 'nba', { minRatio: 3 }) : null;
    if (!pair || pair.fellBack || !pair.away || !pair.home) return { away: '', home: '' };
    return pair;
  }

  function nbaKey(sport, game) {
    return '<p class="ca-radar-key ca-viz-key">' + ['away', 'home'].map(function (side) {
      return '<span class="ca-radar-key__item"><span class="ca-radar-key__swatch is-' + side +
        ' ca-viz-swatch"></span>' + logo(sport, game, side, 22, 'ca-mirror__crest') +
        esc(fullName(sport, game, side)) + '</span>';
    }).join('') + '</p>';
  }

  function nbaTip(text) {
    var label = esc(text);
    return ' data-tip="' + label + '" aria-label="' + label + '" tabindex="0"';
  }

  var NBA_MAP_PREVIEW = 10;
  var NBA_MAP_GROUPS = [
    ['Shot Accuracy', 'shot_profile', 'fg', [
      ['rim', 'Rim FG%'], ['paint', 'Paint FG%'], ['mid', 'Mid-Range FG%'],
      ['corner3', 'Corner 3 FG%'], ['above3', 'Above-Break 3 FG%']
    ]],
    ['Four Factors', null, null, [
      ['efg', 'Effective FG%'], ['tov', 'Turnover % (Lost / Forced)'], ['orb', 'Offensive Rebound %'],
      ['ftr', 'Free Throws Made / FGA']
    ]],
    ['Play-Type Efficiency (PPP)', 'play_types', 'ppp', [
      ['Transition', 'Transition'], ['PRBallHandler', 'P&R Ball Handler'], ['PRRollman', 'P&R Roll Man'],
      ['Isolation', 'Isolation'], ['Postup', 'Post-Up'], ['Spotup', 'Spot-Up'], ['Cut', 'Cuts'],
      ['Handoff', 'Handoffs'], ['OffScreen', 'Off Screens'], ['OffRebound', 'Putbacks']
    ]]
  ];

  function nbaMapMetric(game, side, unit, group, metric) {
    var profile = group[1], field = group[2], key = metric[0];
    var entry = profile ? nbaProf(game, side)[profile]?.[unit]?.[key]?.[field]
      : nbaRates(game, side)[(unit === 'offense' ? 'off_' : 'def_') + key];
    if (!entry || entry.value == null || !isFinite(Number(entry.value)) || !rankPosition(entry, NBA_TEAM_COUNT)) return null;
    return Object.assign({}, entry, { cohort: unit === 'offense' ? 'NBA offenses' : 'NBA defenses' });
  }

  function nbaMapPanel(sport, game, offSide) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var offNick = nflNick(sport, game, offSide), defNick = nflNick(sport, game, defSide);
    var expanded = game.__nbaMapExpanded && game.__nbaMapExpanded[offSide];
    var count = 0;
    var groups = NBA_MAP_GROUPS.map(function (group) {
      var rows = [];
      group[3].forEach(function (metric) {
        var off = nbaMapMetric(game, offSide, 'offense', group, metric);
        var def = nbaMapMetric(game, defSide, 'defense', group, metric);
        if (!off || !def) return;
        count++;
        rows.push(cfbLedgerRow(metric[1], off, def, null, count > NBA_MAP_PREVIEW && !expanded));
      });
      return { title: group[0], rows: rows };
    });
    var head = '<section class="ca-form-panel ca-cfb-panel ca-nba-map"><h3>' +
      esc(offNick + ' Offense vs ' + defNick + ' Defense') + '</h3>';
    if (!count) return head + pending('Paired team ranks are not published for this matchup yet.') + '</section>';
    var id = 'nba-map-ranks-' + offSide;
    var more = count > NBA_MAP_PREVIEW ? '<button type="button" class="ca-nba-map__more" data-nba-map-more="' + offSide +
      '" aria-controls="' + id + '" aria-expanded="' + Boolean(expanded) + '">' +
      nbaMapButtonLabel(count, expanded) + '</button>' : '';
    return head + cfbLedgerTable([offNick, 'Offense'], [defNick, 'Defense'], groups, id) + more + '</section>';
  }

  function nbaMapButtonLabel(count, expanded) {
    return expanded ? 'Show First ' + NBA_MAP_PREVIEW : 'Show All ' + count + ' Categories';
  }

  /* Mirrored bars: the away club grows left, the home club right, from a
     shared label column, so the two read against each other row by row. */
  function nbaButterfly(rows, awayName, homeName, caption) {
    if (!rows.length) return '';
    var head = '<div class="ca-fly__row ca-fly__head"><b>' + esc(awayName) + '</b><span aria-hidden="true"></span><b>' +
      esc(homeName) + '</b></div>';
    var body = rows.map(function (r) {
      function bar(side, v) {
        var w = Math.max(2, Math.min(100, v.pct || 0));
        return '<span class="ca-fly__cell is-' + side + '"' + nbaTip(v.tip) + '>' +
          '<span class="ca-fly__track"><span class="ca-fly__bar is-' + side + '" style="width:' + w.toFixed(1) +
          '%"></span></span><b class="ca-fly__val">' + esc(v.text) + (v.indicator || '') + '</b></span>';
      }
      return '<div class="ca-fly__row">' + bar('away', r.away) + '<span class="ca-fly__label">' + esc(r.label) +
        '</span>' + bar('home', r.home) + '</div>';
    }).join('');
    return '<figure class="ca-fly">' + head + body + (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
      '</figure>';
  }

  function nbaPlayTypeFingerprint(sport, game) {
    var a = ((nbaProf(game, 'away').play_types || {}).offense) || {};
    var h = ((nbaProf(game, 'home').play_types || {}).offense) || {};
    var keys = Object.keys(a).filter(function (k) { return h[k]; });
    if (!keys.length) return pending('Play types are not published for this pairing yet.');
    var max = 0;
    keys.forEach(function (k) {
      max = Math.max(max, (a[k].freq || {}).value || 0, (h[k].freq || {}).value || 0);
    });
    keys.sort(function (x, y) {
      return (((a[y].freq || {}).value || 0) + ((h[y].freq || {}).value || 0)) -
        (((a[x].freq || {}).value || 0) + ((h[x].freq || {}).value || 0));
    });
    function cell(entry, nick, label) {
      var f = (entry.freq || {}).value, ppp = (entry.ppp || {}).value;
      return { pct: max ? 100 * (f || 0) / max : 0,
        text: nbaPct(f, 0) + (ppp != null ? ' · ' + Number(ppp).toFixed(2) + ' PPP' : ''),
        tip: nick + ' ' + label + ': ' + nbaPct(f) + ' of possessions, ' +
          (ppp != null ? Number(ppp).toFixed(2) + ' points per possession' : 'efficiency not published') +
          ((entry.ppp || {}).rank ? ' (' + entry.ppp.rank + ordinal(entry.ppp.rank) + ' of ' + entry.ppp.of + ')' : '') };
    }
    var an = nflNick(sport, game, 'away'), hn = nflNick(sport, game, 'home');
    return nbaButterfly(keys.map(function (k) {
      var label = NBA_PT_SHORT[k] || a[k].label;
      return { label: label, away: cell(a[k], an, label), home: cell(h[k], hn, label) };
    }), an, hn, 'Bar length shows relative usage · Printed values show possession share and points per possession');
  }

  function nbaTaleOfTape(sport, game) {
    var ap = nbaProf(game, 'away'), hp = nbaProf(game, 'home');
    var ar = game.away_rates || {}, hr = game.home_rates || {};
    var spec = [
      ['Height', (ap.size || {}).height, (hp.size || {}).height, function (v) { return Number(v).toFixed(1) + '"'; }],
      ['Weight', (ap.size || {}).weight, (hp.size || {}).weight, function (v) { return Math.round(v) + ' lb'; }],
      ['Age (Years)', (ap.size || {}).age, (hp.size || {}).age, function (v) { return Number(v).toFixed(1); }],
      ['Speed', (ap.tracking || {}).avg_speed, (hp.tracking || {}).avg_speed, function (v) { return Number(v).toFixed(2) + ' mph'; }],
      ['Miles/G', (ap.tracking || {}).dist_miles, (hp.tracking || {}).dist_miles, function (v) { return Number(v).toFixed(1); }],
      ['Drives/G', (ap.tracking || {}).drives, (hp.tracking || {}).drives, function (v) { return Number(v).toFixed(1); }],
      ['Pace (Poss/G)', ar.pace, hr.pace, function (v) { return Number(v).toFixed(1); }]
    ];
    var an = nflNick(sport, game, 'away'), hn = nflNick(sport, game, 'home');
    var rows = spec.filter(function (r) { return r[1] && r[2]; }).map(function (r) {
      function cell(e, nick, side) {
        return { pct: e.of > 1 ? 100 * (e.of - e.rank + 1) / e.of : 0, text: r[3](e.value),
          tip: nick + ' ' + (e.label || r[0]) + ': ' + r[3](e.value) + ' · ' + e.rank + ordinal(e.rank) + ' of ' + e.of,
          indicator: r[0] === 'Pace (Poss/G)' ? nbaPaceMark(game, side) : '' };
      }
      return { label: r[0], away: cell(r[1], an, 'away'), home: cell(r[2], hn, 'home') };
    });
    if (!rows.length) return '';
    return nbaButterfly(rows, an, hn, 'Bar length shows NBA team rank by size, speed or volume · Longest is 1st by value');
  }

  /* The league's aging curve, with every rotation player standing on it at
     his age: who sits on the climb, who on the plateau, who on the slope. */
  function nbaAgingChart(sport, game) {
    var curve = game.aging_curve || [];
    if (!curve.length) return '';
    var W = 960, H = 340, L = 48, R = 20, T = 26, B = 36;
    var ages = curve.map(function (c) { return c.age; });
    var vals = curve.map(function (c) { return c.offense + c.defense; });
    var lo = Math.min.apply(null, vals.concat([-0.8])), hi = Math.max.apply(null, vals.concat([1.4]));
    var a0 = Math.min.apply(null, ages), a1 = Math.max.apply(null, ages);
    function X(age) { return L + (W - L - R) * (age - a0) / (a1 - a0); }
    function Y(v) { return T + (H - T - B) * (hi - v) / (hi - lo); }
    var grid = [-0.5, 0, 0.5, 1.0].filter(function (v) { return v >= lo && v <= hi; }).map(function (v) {
      return '<line class="ca-aging__grid' + (v === 0 ? ' is-zero' : '') + '" x1="' + L + '" x2="' + (W - R) +
        '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"></line><text class="ca-aging__tick" x="' + (L - 6) +
        '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + (v > 0 ? '+' : '') + v.toFixed(1) + '</text>';
    }).join('');
    var xt = [20, 24, 28, 32, 36].filter(function (a) { return a >= a0 && a <= a1; }).map(function (a) {
      return '<text class="ca-aging__tick" x="' + X(a).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + a + '</text>';
    }).join('');
    var path = curve.map(function (c, i) {
      return (i ? 'L' : 'M') + X(c.age).toFixed(1) + ' ' + Y(c.offense + c.defense).toFixed(1);
    }).join(' ');
    var dots = [], placed = [];
    function surname(name) {
      var bits = String(name || '').split(' ').filter(function (b) { return !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(b); });
      return bits[bits.length - 1] || '';
    }
    function labelY(x, y, w) {
      var ty = y - 10;
      for (var guard = 0; guard < 12; guard++) {
        var hit = placed.some(function (b) { return x < b.x + b.w && x + w > b.x && Math.abs(ty - b.y) < 15; });
        if (!hit) break;
        ty -= 15;
      }
      placed.push({ x: x, y: ty, w: w });
      return ty;
    }
    ['away', 'home'].forEach(function (side, si) {
      nbaPlayers(game, side).forEach(function (p, i) {
        var ch = p.age_change || {};
        if (p.age == null || ch.offense == null) return;
        var v = ch.offense + ch.defense;
        var cx = X(Math.max(a0, Math.min(a1, p.age))) + (si ? 3 : -3);
        dots.push('<circle class="ca-aging__dot is-' + side + '" cx="' + cx.toFixed(1) + '" cy="' + Y(v).toFixed(1) +
          '" r="6"' + nbaTip(p.player_name + ', ' + Math.round(p.age) + ': league history ' + (v > 0 ? '+' : '') +
            v.toFixed(2) + ' box plus-minus to next season') + '></circle>' +
          (i < 3 ? (function () {
            var nm = surname(p.player_name), x = cx + 8;
            return '<text class="ca-aging__name" x="' + x.toFixed(1) + '" y="' + labelY(x, Y(v), nm.length * 7.5).toFixed(1) +
              '">' + esc(nm) + '</text>';
          })() : ''));
      });
    });
    var bands = [[a0, 24.5, 'Climbing'], [24.5, 28.5, 'Prime'], [28.5, a1, 'Decline']].map(function (b, i) {
      return '<rect class="ca-aging__band' + (i === 1 ? ' is-prime' : '') + '" x="' + X(b[0]).toFixed(1) + '" y="' + T +
        '" width="' + (X(b[1]) - X(b[0])).toFixed(1) + '" height="' + (H - T - B) + '"></rect><text class="ca-aging__band-label" x="' +
        ((X(b[0]) + X(b[1])) / 2).toFixed(1) + '" y="' + (T + 16) + '">' + b[2] + '</text>';
    }).join('');
    return '<figure class="ca-aging"><svg style="max-width:' + W + 'px" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="League aging ' +
      'curve with each rotation player at his age">' + bands + grid + xt +
      '<path class="ca-aging__curve" d="' + path + '"></path>' + dots.join('') +
      '<text class="ca-aging__axis" x="' + L + '" y="12">Change in box plus-minus to next season</text></svg>' +
      '<figcaption>' + nbaKey(sport, game) + '<span>Horizontal axis is age in years · The line is the historical NBA average ' +
      'and each dot places a roster player on it · Basketball-Reference, 2018–19 to 2025–26</span></figcaption></figure>';
  }

  /* One bar per rotation player, split by zone (rim to above-break three),
     in shades of the club's colour: the shot diet reads down the column. */
  function nbaShotMapsPanel(sport, game, side) {
    var players = nbaPlayers(game, side).filter(function (p) { return (p.zones || []).length; });
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' + esc(nflNick(sport, game, side) +
      ' Shot Distribution') + '</h3>';
    if (!players.length) return head + pending('Player shot locations are not published yet.') + '</section>';
    var legend = '<figcaption class="ca-dist-legend">' + NBA_ZONES.map(function (z, i) {
      return '<span><i class="ca-dist-seg is-' + side + ' z' + i + '" aria-hidden="true"></i>' + esc(z[1]) + '</span>';
    }).join('') + '</figcaption>';
    var rows = players.map(function (p) {
      var by = {};
      (p.zones || []).forEach(function (z) { by[z.zone] = z; });
      var segs = NBA_ZONES.map(function (z, i) {
        var e = by[z[0]];
        if (!e || !e.share) return '';
        var w = 100 * e.share;
        return '<i class="ca-dist-seg is-' + side + ' z' + i + '" style="width:' + w.toFixed(1) + '%"' +
          nbaTip(p.player_name + ' · ' + z[1] + ': ' + nbaPct(e.share, 0) + ' of his shots, ' + nbaPct(e.fg) + ' FG' +
            (e.fga != null ? ', ' + Number(e.fga).toFixed(1) + ' a game' : '')) + '>' +
          (w >= 13 ? '<b>' + Math.round(w) + '%</b>' : '') + '</i>';
      }).join('');
      return '<div class="ca-dist-row"><span class="ca-dist-row__name"><b>' + esc(p.player_name) + '</b><small>' +
        esc([p.position, p.height].filter(Boolean).join(' · ')) + '</small></span><span class="ca-dist-bar">' +
        segs + '</span></div>';
    }).join('');
    return head + '<p class="ca-lineup-context">' + esc((nbaProf(game, side).zones_basis || 'NBA Stats') +
      ' · Each bar shows a player’s share of attempts by zone') + '</p>' +
      '<figure class="ca-dist">' + legend + rows + '</figure></section>';
  }

  // One tooltip for every marked figure, on hover and on keyboard focus.
  if (global.document && !global.__caVizTip) {
    global.__caVizTip = true;
    var tipEl = null;
    var showTip = function (target, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.className = 'ca-viz-tip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
      }
      tipEl.textContent = target.getAttribute('data-tip');
      tipEl.style.display = 'block';
      var r = tipEl.getBoundingClientRect();
      var left = Math.min(global.innerWidth - r.width - 8, Math.max(8, x + 12));
      var top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
      tipEl.style.left = left + 'px';
      tipEl.style.top = top + 'px';
    };
    var hideTip = function () { if (tipEl) tipEl.style.display = 'none'; };
    document.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-tip]');
      if (t) showTip(t, e.clientX, e.clientY);
      else hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-tip]');
      if (!t) return;
      var r = t.getBoundingClientRect();
      showTip(t, r.left + r.width / 2, r.top);
    });
    document.addEventListener('focusout', hideTip);
    global.addEventListener('scroll', hideTip, { passive: true });
  }

  function nbaDepthSections(sport, game) {
    return [
      section('nba-edge-map', 'Matchup Map', 'NBA team ranks by unit · Longest bar is 1st · PPP is points per possession',
        nbaColorLegend(false) + nflDuo(nbaMapPanel, sport, game)),
      section('nba-fingerprint', 'Play-Type Fingerprint', 'Synergy offensive play types · Ordered by combined usage',
        '<div class="ca-viz-card">' + nbaPlayTypeFingerprint(sport, game) + '</div>'),
      section('nba-tape', 'Tale Of The Tape', 'Rotation size, tracking and possessions per game',
        '<div class="ca-viz-card">' +
        (nbaTaleOfTape(sport, game) || pending('Not published for this pairing yet.')) + '</div>'),
      section('nba-aging', 'League Age Curve', 'Historical year-to-year change in box plus-minus by age',
        '<div class="ca-viz-card">' + (nbaAgingChart(sport, game) || pending('The aging curve is not published.')) + '</div>'),
      section('nba-shot-maps', 'Player Shot Distribution', 'Zone colors show where each player takes his shots',
        nflDuo(nbaShotMapsPanel, sport, game)),
      section('nba-shot-chart', 'Team Shot Chart', 'Court shows offense · Table compares accuracy and shot share against the defense',
        nflDuo(nbaShotChartPanel, sport, game)),
      section('nba-shot-kinds', 'Shot Diet', 'Attempt share and effective FG% by shot type · Assisted share uses made shots',
        nflDuo(nbaKindsPanel, sport, game)),
      section('nba-play-types', 'Play Types Against The Defense', 'Usage, points per possession and possessions per game',
        nflDuo(nbaPlayTypePanel, sport, game)),
      section('nba-coverage', 'Measured Coverage', 'Zone and non-zone usage, points per possession and sample counts',
        nflDuo(nbaCoveragePanel, sport, game) + filmCoverageCards('nba', game, game.__nbaYear || game.season)),
      section('nba-databallr', 'Databallr Shot Zones', 'Provider-defined zones · FG%, makes, attempts and shot share',
        nflDuo(nbaDataballrPanel, sport, game)),
      section('nba-defenders', 'Closest Defender By Zone', 'Opponent FG% versus the shooter’s usual rate · Percentage-point difference',
        nflDuo(nbaDefendersPanel, sport, game)),
      section('nba-onfloor', 'On/Off Defense By Zone', 'Opponent FG% with the player on court minus off court · Percentage points',
        nflDuo(nbaOnFloorPanel, sport, game)),
      section('nba-size', 'Size And Age', 'Rotation-weighted height in inches, weight in pounds and age in years', nbaSizeBody(sport, game)),
      section('nba-tracking', 'Movement And Shot Creation', 'Tracking speed in mph · Distance, drives and shot attempts per game',
        nbaTrackingBody(sport, game)),
      section('nba-style', 'Coach And Style', 'Career record, coaching percentiles and this roster’s team ranks',
        nflDuo(nbaStylePanel, sport, game)),
      section('nba-scheme', 'Inferred Defensive Tendencies', 'Scheme signals inferred from measured outcomes · League percentiles',
        nflDuo(nbaSchemePanel, sport, game)),
      section('nba-regression', 'Team Shooting And Close Games', 'Shooting versus league rates · Gaps in percentage points',
        nbaRegressionBody(sport, game)),
      section('nba-shooter-regression', 'Shooter Track Records', '3P% versus earlier seasons · Historical change in box plus-minus by age',
        nflDuo(nbaShooterRegressionPanel, sport, game)),
      section('nba-player-types', 'Player Play Types', 'Three most-used actions per player · Usage share and points per possession',
        nflDuo(nbaPlayerTypesPanel, sport, game)),
      section('nba-player-zones', 'Player Shooting By Zone', 'Field-goal accuracy, rank and share of each player’s attempts',
        nflDuo(nbaPlayerZonesPanel, sport, game)),
      section('nba-player-bio', 'Player Bio And Tracking', 'Size and age · Usage, true shooting, speed and drives per game',
        nflDuo(nbaPlayerBioPanel, sport, game)),
      section('nba-schedule', 'Travel And Schedule Load', 'Fixture rest, games and miles in the past seven days, and time zones',
        nflDuo(nbaSchedulePanel, sport, game)),
      section('nba-splits', 'Situational Net Rating', 'Point differential per 100 possessions · Home, road, back-to-back and rested',
        nbaSplitsBody(sport, game))
    ].join('');
  }

  function nbaPowerBody(sport, game) {
    var data = game.__nbaPower;
    if (data === undefined) return pending('The power ranking is loading.');
    var teams = (data && data.teams) || {};
    return powerPanel(fullName(sport, game, 'away') + ' vs ' + fullName(sport, game, 'home') + ' Power Ranking',
      [[fullName(sport, game, 'away'), teams[game.away]], [fullName(sport, game, 'home'), teams[game.home]]],
      { cohort: 'NBA clubs', digits: 1, first: 'Club', units: 'Points per 100 possessions',
        caption: data ? nbaSeasonLabel(data.season) + ' · ' + data.games + ' finals through ' +
          nbaShortDate(data.through) + ' · home court ' + Number(data.home_court).toFixed(1) + ' per 100' : '' });
  }

  function nbaPredictabilityBody(sport, game) {
    var data = game.__nbaPredictability;
    if (data === undefined) return pending('Predictability is loading.');
    var teams = (data && data.teams) || {};
    return predictabilityPanel(fullName(sport, game, 'away'), fullName(sport, game, 'home'),
      teams[game.away], teams[game.home], (data ? nbaSeasonLabel(data.season) + ' · ' + data.games + ' finals' : ''));
  }
  function nbaSections(sport, game) {
    function context(side) {
      return teamPanel(sport, game, side, [
        ['Record', value(game[side + '_record'])],
        [side === 'home' ? 'Home Record' : 'Road Record', value(game[side + '_split_record'])],
        ['Rest', value(game[side + '_rest_label'])],
        ['Ratings Read On', value(game[side + '_rates_basis'])],
        ['Rotation Read On', value(game[side + '_rotation_basis'])]
      ]);
    }
    return [
      section('nba-ratings', 'Team Ratings', 'Points scored, allowed and net per 100 possessions · Pace in possessions per game',
        nbaRatingsBody(sport, game)),
      section('nba-efficiency', 'Offense Against Defense', 'Scoring, effective FG%, turnovers, offensive rebounds and free throws',
        nflDuo(nbaLedgerPanel, sport, game, 'efficiency')),
      section('nba-predictability', 'Offensive Consistency', 'Scoring spread and frequency outside the expected range',
        nbaPredictabilityBody(sport, game)),
      section('nba-power', 'Adjusted Power Ranking', 'Opponent- and luck-adjusted ratings per 100 possessions · Actual and expected records',
        nbaPowerBody(sport, game)),
      section('nba-shooting', 'Team Shooting Rates', 'Three-point attempt share, shooting accuracy and assisted field goals',
        nflDuo(nbaLedgerPanel, sport, game, 'shooting')),
      section('nba-rotation', 'Rotation', 'Per-game stats by minutes · Production compared with same-season players at 10+ MIN/G',
        nflDuo(nbaRotationPanel, sport, game)),
      section('nba-lineups', 'Five-Man Units', 'Minutes together · Points scored, allowed and net per 100 possessions',
        nflDuo(nbaLineupsPanel, sport, game)),
      section('nba-availability', 'Current Injury Report', 'Fixture status and report date · Historical play rate, player value and games missed',
        nflDuo(cfbInjuryPanel, sport, game)),
      section('nba-game-log', 'Game Log', 'Final and adjusted margins in points · Offensive and defensive ratings per 100 possessions',
        nbaGameLogs(sport, game)),
      section('team-context', 'Fixture Context', 'Current records and rest · Evidence windows for team ratings and rotation',
        '<div class="ca-detail-duo">' + context('away') + context('home') + '</div>')
    ].join('') + nbaDepthSections(sport, game);
  }

  /* Each tab reads top to bottom in the order NBA_TABS lists its sections,
     whatever order they were built in. */
  function nbaOrdered(html) {
    var order = [];
    NBA_TABS.forEach(function (t) { order = order.concat(t[2]); });
    var parts = html.split(/(?=<section class="ca-detail-section" id=")/);
    function rank(part) {
      var m = /^<section class="ca-detail-section" id="([^"]+)"/.exec(part);
      var i = m ? order.indexOf(m[1]) : -1;
      return i < 0 ? order.length : i;
    }
    return parts.map(function (part, i) { return { part: part, i: i, r: rank(part) }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
      .map(function (x) { return x.part; }).join('');
  }


  function nbaColorLegend(showVolume = true) {
    return '<p class="ca-basketball-legend"><span class="c-elite">Elite</span><span class="c-good">Strong</span>' +
      '<span class="c-mid">Average</span><span class="c-weak">Weak</span><span class="c-poor">Poor</span>' +
      (showVolume ? '<span class="c-volume">Usage / volume</span>' : '') + '</p>';
  }
  function nbaEvidenceStamp(iso) {
    if (!iso) return 'not published';
    var d=new Date(iso);
    return isNaN(d.getTime())?'not published':d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET';
  }
  function nbaControls(game) {
    var years = game.__nbaEvidence ? Object.keys(game.__nbaEvidence.seasons).sort().reverse() : [];
    var buttons = years.map(function (year) {
      var active = Number(year) === game.__nbaYear;
      return '<button type="button" data-nba-season="' + year + '" aria-pressed="' + active + '"' +
        (active ? ' class="is-on"' : '') + '>' + nbaSeasonLabel(year) + '</button>';
    }).join('');
    var status = 'Loading team and player seasons…';
    if (game.__nbaWindow) {
      status = game.__nbaWindow.data_through_utc
        ? 'ESPN box scores through ' + nbaEvidenceStamp(game.__nbaWindow.data_through_utc)
        : 'ESPN box-score cutoff unavailable';
    } else if (game.__nbaEvidenceError) {
      status = 'Two-season evidence is temporarily unavailable.';
    } else if (game.nba_fixture_only) {
      status = 'ESPN fixture · Team statistics and injury report pending';
    }
    return '<div class="ca-analysis-scope ca-cbb-controls ca-nba-controls"><strong>Team and player stat season</strong>' +
      (buttons ? '<div class="ca-cbb-options" role="group" aria-label="NBA evidence season">' + buttons + '</div>' : '') +
      '<p class="ca-cbb-note ca-cbb-status">' + esc(status) + '</p></div>';
  }
  function repaintNba(host,game) {
    var stack=host.querySelector('.ca-detail-stack');
    if(!stack)return;
    var tab=stack.getAttribute('data-nfl-tab'),club=stack.getAttribute('data-club');
    var y=global.scrollY;
    stack.innerHTML=nbaOrdered(nbaSections('nba',game));
    host.querySelector('.ca-nba-controls').outerHTML=nbaControls(game);
    nflSetTab(host,tab);nflSetClub(host,club);
    global.scrollTo({top:y,behavior:'instant'});
  }
  function wireNbaControls(host,game) {
    host.addEventListener('click',function(event){
      var button=event.target.closest('[data-nba-season]');
      if (button && global.ChaseSportNBA.selectSeason(game, Number(button.dataset.nbaSeason))) {
        repaintNba(host, game);
        host.querySelector('[data-nba-season="' + button.dataset.nbaSeason + '"]').focus({ preventScroll: true });
      }
      var more = event.target.closest('[data-nba-map-more]');
      if (!more) return;
      var table = more.closest('.ca-nba-map').querySelector('table');
      var rows = Array.from(table.querySelectorAll('tbody tr:not(.ca-ledger-group)'));
      var expanded = more.getAttribute('aria-expanded') !== 'true';
      game.__nbaMapExpanded = game.__nbaMapExpanded || {};
      game.__nbaMapExpanded[more.dataset.nbaMapMore] = expanded;
      rows.slice(NBA_MAP_PREVIEW).forEach(function (row) { row.hidden = !expanded; });
      more.setAttribute('aria-expanded', String(expanded));
      more.textContent = nbaMapButtonLabel(rows.length, expanded);
    });
  }
  function nbaGraded(value,entry) {
    var tone=entry && entry.rank ? rankTone(entry.rank,entry.of) : 'c-na';
    var label=entry && entry.rank ? 'Same-season rank '+entry.rank+' of '+entry.of+'; '+(entry.better==='low'?'lower':'higher')+' is favorable' : '';
    return '<span class="ca-basketball-value '+tone+'"'+(label?' title="'+esc(label)+'"':'')+'>'+esc(value)+'</span>'+
      (entry && entry.rank ? rankBadge({rank:entry.rank,of:entry.of},tone,label) : '');
  }
  function nbaCoveragePanel(sport,game,side) {
    var other=side==='away'?'home':'away',a=game[side+'_measured_coverage'],b=game[other+'_measured_coverage'];
    var title=fullName(sport,game,side)+' Offense vs '+fullName(sport,game,other)+' Coverage';
    if(!a||!b||!a.offense||!b.defense)return deskPanel(title,'Measured coverage',pending('Measured coverage is unavailable for this evidence window.'));
    function ppp(row, sample) {
      var value = row.ppp == null ? '—' : Number(row.ppp).toFixed(sample.ppp_decimals === 2 ? 2 : 3);
      return nbaGraded(value,row.ppp_grade)+'<small class="ca-cbb-count ca-coverage-sample">'+
        (row.possessions==null?'—':row.possessions)+' poss</small>'+
        (row.possessions>0&&!row.sample_qualified?'<small class="ca-cbb-count">Thin sample</small>':'');
    }
    var rows=b.defense.rows.map(function(d){
      var o=a.offense.rows.find(function(r){return r.id===d.id;})||{};
      return [esc(d.label),basketballVolume(d.frequency),ppp(d,b.defense),ppp(o,a.offense)];
    });
    var offenseStamp=nbaEvidenceStamp(a.offense.retrieved_at_utc), defenseStamp=nbaEvidenceStamp(b.defense.retrieved_at_utc);
    var stamps=offenseStamp===defenseStamp?offenseStamp:offenseStamp+' / '+defenseStamp;
    return deskPanel(title,(a.season-1)+'–'+String(a.season).slice(2)+' · NBA Inside the Game · '+a.offense.games+' offense / '+b.defense.games+' defense games',
      cbbTable(['Coverage','Defense usage','Defense PPP allowed','Offense PPP vs. coverage'],rows,'ca-nba-evidence-table')+nbaColorLegend()+
      pending('Retrieved '+stamps));
  }
  function nbaDataballrPanel(sport,game,side) {
    var other=side==='away'?'home':'away',a=game[side+'_databallr'],b=game[other+'_databallr'];
    var title=fullName(sport,game,side)+' Shots vs '+fullName(sport,game,other)+' Allowed';
    if(!a||!b)return deskPanel(title,'Databallr',pending('Databallr context is unavailable for this evidence window.'));
    function cell(z){
      if(!z)return '—';
      return nbaGraded(nbaPct(z.fg_pct),z.fg_grade)+'<small class="ca-cbb-count">'+z.made+'/'+z.attempts+'</small>'+
        '<small class="ca-cbb-count c-volume">'+nbaPct(z.shot_share)+' of FGA</small>';
    }
    var rows=a.offense.zones.map(function(o){var d=b.defense.zones.find(function(z){return z.id===o.id;});
      return [esc(o.label),cell(o),cell(d)];});
    return deskPanel(title,(a.season-1)+'–'+String(a.season).slice(2)+' · Databallr · all possessions',cbbTable(['Zone','Offense FG%','Allowed FG%'],rows,'ca-nba-evidence-table')+nbaColorLegend()+
      pending('Source updated '+nbaEvidenceStamp(a.offense.source_updated_at)+' / '+nbaEvidenceStamp(b.defense.source_updated_at)));
  }

  /* The CBB desk reads in the order a matchup is worked: tempo and efficiency,
     where the shots come from, how possessions start and end, how each defense
     lines up, who is available to play, then the schedule. */
  var CBB_TABS = [
    ['units','Units',['cbb-power','cbb-pace','cbb-efficiency','cbb-sos','cbb-predictability']],
    ['shooting','Shot Profile',['cbb-shot-chart']],
    ['possessions','Possessions',['cbb-transition','cbb-situations','cbb-restarts']],
    ['defense','Defense',['cbb-shot-types','cbb-personnel','cbb-tagged-schemes']],
    ['roster','Roster',['cbb-availability','cbb-rotation','cbb-size']],
    ['games','Games',['cbb-game-log']],
    ['resume','Résumé',['cbb-resume','cbb-regression']],
    ['context','Context',['cbb-schedule']]
  ];
  function cbbYear(game) { return game.__cbbYear || 2027; }
  function cbbClock(game) { return scoreOrTime(game).replace(/\s+(AM|PM)\s+ET<\/strong>/,'<span class="ca-cbb-meridiem"> $1 ET</span></strong>'); }
  function detailCenter(sport,game) {
    if(sport!=='cbb')return scoreOrTime(game);
    return cbbClock(game)+(game.kickoff_utc?'<p>'+esc(new Date(game.kickoff_utc).toLocaleDateString('en-US',
      {weekday:'short',month:'short',day:'numeric',timeZone:'America/New_York'}))+'</p>':'');
  }
  function cbbTeam(game,side) { return game[side + (cbbYear(game) === 2026 ? '_cbb_prior' : '_cbb')]; }
  function cbbSchool(game,side) { var c=cbbTeam(game,side);return c && c.identity.short_name || fullName('cbb',game,side); }
  function cbbSeason(game) { return cbbYear(game)===2027 ? '2026–27' : '2025–26'; }
  function cbbNumber(n,digits) { return n == null ? '—' : Number(n).toFixed(digits == null ? 1 : digits); }
  function cbbPlural(n,word) { return n+' '+word+(Number(n)===1?'':'s'); }
  function cbbMissing(text) { return '<span class="ca-basketball-value c-na">'+esc(text||'Not reported')+'</span>'; }
  /* D-I games a team had completed when its evidence was published. Every
     season-rate source counts D-I opponents only, so this is the denominator a
     partial source is read against. */
  function cbbDivisionGames(game,side) {
    var team=cbbTeam(game,side), check=global.ChaseSportCBB.isDivisionI;
    if(!team)return 0;
    return (team.games||[]).filter(function(g){
      return g.points!=null && (!check || check(g.opponent_id)) &&
        (cbbYear(game)!==game.season || String(g.date)<String(game.slate_date));
    }).length;
  }
  function cbbCoverage(game,side,games) {
    var total=cbbDivisionGames(game,side);
    return cbbSchool(game,side)+' '+(total&&games<total?games+' of '+total:games)+' D-I '+(total===1||(!total&&games===1)?'game':'games');
  }
  /* A value outside the ranked pool (a sample under its floor) can still be
     placed among it when asked: where it would sit, clamped to the pool. */
  function cbbPlace(value, peers, higher, minimum, placeOutside) {
    if (!Number.isFinite(value) || !Array.isArray(peers) || peers.length < (minimum || 10)) return null;
    var ahead = 0, included = false;
    peers.forEach(function (peer) {
      var delta = higher ? peer - value : value - peer;
      if (Math.abs(delta) < 1e-10) included = true;
      else if (delta > 0) ahead += 1;
    });
    if (!included && !placeOutside) return null;
    return {rank:Math.min(ahead + 1, peers.length), of:peers.length};
  }
  function cbbRanked(value, place, cohort, tone) {
    if (!place) return value;
    var label = place.rank + ordinal(place.rank) + ' of ' + place.of + ' ' + cohort;
    return '<span class="ca-cbb-ranked">' + value + rankBadge(place, tone || '', label) + '</span>';
  }
  function cbbComparison(game, family, row, value, higher, minimum, placeOutside) {
    var peers = global.ChaseSportCBB.comparisonRanks(cbbYear(game), family, row);
    return cbbPlace(value, peers, higher, minimum, placeOutside);
  }
  function cbbMetric(game,n,text,key,higher,group) {
    var chart = global.ChaseCbbCharts, year = cbbYear(game);
    group = group || 'team';
    var place = cbbPlace(n, global.ChaseSportCBB.rankSamples(year, group, key), higher);
    if (!place) return chart.metric(n, text, year, group, key, higher);
    var cohort = (group === 'player' ? 'same-season D-I rotation players' : 'same-season D-I teams') +
      ' · ' + (higher ? 'higher' : 'lower') + ' is favorable';
    // Every graded figure prints its place, player lines included (2026-11-11).
    return cbbRanked(chart.value(text, rankTone(place.rank, place.of)), place, cohort);
  }
  function cbbTable(head,rows,cls) {
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-basketball-table '+(cls||'')+'"><thead><tr>'+head.map(function(h,i){return '<th scope="col"'+(i?' class="num"':'')+'>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v,i){
      // A cell spanning several columns: {span: n, html: '...'}.
      if(v&&v.span)return '<td class="num ca-vs-none" colspan="'+v.span+'">'+v.html+'</td>';
      return '<td'+(i?' class="num"':'')+'>'+v+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
  }
  /* Predictability (pipeline/predictability.py), shared by the NFL, NBA and
     CBB desks: each offense's percentile among its league for staying on the
     curve (100 = least volatile), read from how it scores - how lumpy its
     scoring events are and how many a game holds. Beneath it, how often that
     spread puts a game beyond 1.5 league standard deviations; a league-average
     offense does 13.4% of the time. Defenses and net margins are not scored:
     no read of them predicted their variance better than league average. */
  function predictabilityPanel(awayName, homeName, a, b, season, bare) {
    var panel = bare ? cbbPanel : deskPanel;
    var curve = (a && a.curve) || (b && b.curve);
    function cell(block) {
      if (!block) return cbbMissing('Too few games');
      var place = {rank: block.place, of: block.of};
      var label = 'least volatile first · game spread ' + Number(block.volatility).toFixed(2) + '× the league-average offense';
      return cbbRanked('<span class="ca-basketball-value ' + rankTone(block.place, block.of) + '">' +
        esc(String(block.predictability)) + '</span>', place, label) +
        '<small class="ca-cbb-count">' + (100 * block.off_curve).toFixed(1) + '% off-curve · ' +
        block.games + (block.games === 1 ? ' game' : ' games') + '</small>';
    }
    if (!curve) return panel('Predictability', season, pending('Predictability needs more completed games for these teams.'));
    var rows = [[esc(awayName), cell(a && a.offense)], [esc(homeName), cell(b && b.offense)]];
    return panel('Offense', season + ' · ' + curve.metric + ' · per-' + curve.event + ' scoring spread · league-average off-curve ' +
        (100 * curve.league_off_curve).toFixed(1) + '% (beyond ' + curve.z + ' SD)',
      cbbTable(['Offense', 'Predictability'], rows, 'ca-cbb-factor-table'));
  }
  /* Adjusted power ranking (pipeline/power.py), shared by the CBB, NBA, NFL
     and CFB desks: each team's offense, defense and net against an average
     opponent on a neutral floor, read on noise-adjusted scoring, with its
     place; the schedule it has played (its opponents' average net, hardest
     first); and its record beside the record its play supports. Every figure
     is tier-coloured (owner, 2026-11-11): wins above the supported record
     grade as sustainability, fewest above first. */
  var POWER_NOTES = {
    net: 'Offense minus defense: margin against an average opponent on a neutral floor.',
    offense: 'Scoring against an average defense, opponent-adjusted, luck-adjusted.',
    defense: 'Scoring allowed to an average offense, opponent-adjusted, luck-adjusted. Lower ranks first.',
    schedule: 'Average net of the opponents played. First is the hardest schedule.',
    supports: 'The record the team\u2019s play supports: each game played, the chance a team this good wins it against that opponent there.',
    luck: 'Wins above the record its play supports. First is the fewest above it: the record its play best backs. Last runs furthest ahead of its play.'
  };
  function powerCell(entry, tone, text, label, teamCount) {
    if (!entry || entry.value == null) return '<td class="num ca-vs-none">Not Rated</td>';
    var place = teamCount ? teamScaled(entry.rank, entry.of, teamCount) : rankPosition(entry);
    var cls = tone === 'neutral' ? 'c-volume' : place ? rankTone(place.rank, place.of) : '';
    var lab = place ? teamScaledLabel(place, entry.rank, place.pool ? 'on the team scale' : label, label) : '';
    return '<td class="num ca-stack-rank ' + cls + '" title="' + esc(lab) + '">' + esc(text) +
      rankBadge(place, cls, lab) + '</td>';
  }
  function powerSigned(v, digits) {
    var n = Number(v);
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(digits == null ? 1 : digits);
  }
  function powerPanel(title, rows, opts, bare) {
    var panel = bare ? cbbPanel : deskPanel;
    var cohort = opts.cohort;
    if (!rows.some(function (r) { return r[1]; })) {
      return panel(title, '', pending(opts.pending || 'The power ranking needs completed games for these teams.'));
    }
    var body = rows.map(function (r) {
      var t = r[1];
      if (!t) return '<tr><td>' + esc(r[0]) + '</td><td class="num ca-vs-none" colspan="7">Not Rated Yet</td></tr>';
      var rec = t.record, exp = t.expected_record;
      var above = rec.wins - exp.wins;
      // Wins above the supported record grade as sustainability: the fewest
      // above it (a record its play backs) is first, the furthest ahead last.
      var luck = t.luck;
      return '<tr><td>' + esc(r[0]) + '</td>' +
        powerCell(t.net, '', powerSigned(t.net.value, opts.digits), cohort) +
        powerCell(t.offense, '', Number(t.offense.value).toFixed(opts.digits), cohort) +
        powerCell(t.defense, '', Number(t.defense.value).toFixed(opts.digits), cohort + ' · fewest allowed first') +
        // Graded like the SOS panel: the hardest schedule ranks first, tier-coloured.
        powerCell(t.schedule, '', powerSigned(t.schedule.value, opts.digits), cohort + ' · hardest first') +
        '<td class="num">' + esc(rec.wins + '–' + rec.losses) + '</td>' +
        '<td class="num">' + esc(Number(exp.wins).toFixed(1) + '–' + Number(exp.losses).toFixed(1)) + '</td>' +
        powerCell(luck, '', powerSigned(above, 1), cohort + ' · fewest above first, the most sustainable record') + '</tr>';
    });
    var heads = [['Net', 'net'], ['Offense', 'offense'], ['Defense', 'defense'], ['Schedule', 'schedule'],
      ['Record', ''], ['Expected Record', 'supports'], ['Wins Above', 'luck']];
    var table = nflSplitTable(heads.map(function (h) { return h[0]; }), body, opts.first || 'Team');
    heads.forEach(function (h) {
      if (h[1]) table = table.replace('<th class="num">' + h[0] + '</th>',
        '<th class="num" title="' + esc(POWER_NOTES[h[1]] + (opts.units ? ' ' + opts.units + '.' : '')) + '">' + h[0] + '</th>');
    });
    return panel(title, opts.caption || '', table);
  }

  /* Final and noise-adjusted margin by game, for the basketball and CFB logs:
     the most recent games, oldest at the left. */
  function logMarginStrip(games, label, limit) {
    var shown = games.slice(0, limit || 15).reverse().map(function (g) {
      return { week: label(g), home: g.home, opp: g.opp, points: g.points, opp_points: g.opp_points,
        adj_points: g.adj_points, opp_adj_points: g.opp_adj_points, __label: label(g) };
    });
    return nflMarginStrip(shown);
  }

  function deskPanel(title,caption,body) {
    return '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger"><h3>'+esc(title)+'</h3>'+
      (caption?'<p class="ca-lineup-context">'+esc(caption)+'</p>':'')+body+'</section>';
  }
  /* CBB panels carry a title and their table only: the owner removed the
     caption line beneath titles (2026-11-11). Callers still pass one. */
  function cbbPanel(title,caption,body) { return deskPanel(title,'',body); }
  function filmEvidenceLink(label, url) {
    return /^https:\/\//i.test(url || '') ? '<a href="'+esc(url)+'">'+esc(label)+'</a>' : '';
  }
  function nflFilmCoverage(game) {
    var archive = game.nfl_film_coverage;
    var kickoff = String(game.kickoff_utc || '');
    var season = Number(kickoff.slice(0,4)) - (Number(kickoff.slice(5,7)) <= 2 ? 1 : 0);
    var teams = [String(game.away),String(game.home)];
    return (archive && archive.film_samples || []).filter(function (sample) {
      return sample.season === season && [sample.away.team_id,sample.home.team_id].some(function (id) { return teams.indexOf(id) !== -1; });
    }).map(function (sample) {
      var rows = sample.film_plays.map(function (play) {
        var other = play.side === 'away' ? 'home' : 'away';
        var epa = (play.play_epa >= 0 ? '+' : '') + play.play_epa.toFixed(2);
        return ['<strong>'+esc(play.kind)+'</strong><br><small>'+esc(sample[play.side].team_id+' O vs '+sample[other].team_id+' D · Q'+play.period+' '+play.game_clock)+'</small>',
          esc(play.result), '<span class="ca-basketball-value">'+epa+'</span>'];
      });
      return deskPanel('Reviewed coverage plays: '+sample.away.team_name+' at '+sample.home.team_name,
        'Week '+sample.week+' · '+sample.game_date+' · '+rows.length+(rows.length===1?' example':' examples'),
        cbbTable(['Coverage','Result','Offense EPA'],rows,'ca-nba-evidence-table ca-film-table')+
        '<p class="ca-cbb-note ca-cbb-cite">'+
        filmEvidenceLink('Patriots film review',sample.film_url)+' · '+filmEvidenceLink('Play-by-play',sample.results_url)+
        ' · <a href="/data/public/nfl/film-coverage.json">Charted plays</a></p>');
    }).join('');
  }
  function filmCoverageCards(sport, game, season) {
    var archive = game[sport + '_film_coverage'];
    var teams = [String(game.away), String(game.home)];
    var labels = {man:'Man-to-man',zone:'Zone',press:'Backcourt press',drop:'Drop',switch:'Switch',blitz:'Blitz',unclassified:'Unclassified'};
    var seasonSamples = (archive && archive.film_samples || []).filter(function (sample) {
      return Number(sample.season) === Number(season);
    });
    var relevant = seasonSamples.filter(function (sample) {
      return [sample.away.team_id,sample.home.team_id].some(function (id) { return teams.indexOf(id) !== -1; });
    });
    var cards = relevant.sort(function (a,b) {
      return Number(b.game_id === String(game.id)) - Number(a.game_id === String(game.id)) || b.game_date.localeCompare(a.game_date);
    }).map(function (sample) {
      var rows = [];
      ['away','home'].forEach(function (side) {
        var other = side === 'away' ? 'home' : 'away';
        var plays = sample.film_possessions.filter(function (play) { return play.side === side; });
        Object.keys(labels).forEach(function (kind) {
          var tagged = plays.filter(function (play) { return kind === 'press' ? play.press_observed === true : play.kind === kind; });
          if (!tagged.length) return;
          var points = tagged.reduce(function (total, play) { return total + play.points; },0);
          rows.push(['<strong>'+esc(labels[kind])+'</strong><br><small>'+esc(sample[side].team_name+' O vs '+sample[other].team_name+' D')+'</small>',
            '<span class="ca-basketball-value ca-film-volume">'+tagged.length+'</span>',
            kind === 'unclassified' ? '—' : '<span class="ca-basketball-value">'+points+'</span>',
            kind === 'unclassified' ? '—' : '<span class="ca-basketball-value">'+(points/tagged.length).toFixed(2)+'</span>']);
        });
      });
      if (!rows.length) return '';
      var title = (sport === 'nba' ? 'Reviewed ball screens: ' : 'Reviewed defense: ')+sample.away.team_name+' at '+sample.home.team_name;
      var caption = sample.game_date+' · '+sample.film_scope+' · '+sample.film_possessions.length+' reviewed';
      return (sport === 'cbb' ? cbbPanel : deskPanel)(title, caption, cbbTable(['Coverage','Poss','Pts','PPP'],rows,'ca-nba-evidence-table ca-film-table')+
        '<p class="ca-cbb-note ca-cbb-cite">'+
        filmEvidenceLink(sample.film_source,sample.film_url)+' · '+filmEvidenceLink('Play-by-play',sample.results_url)+
        ' · <a href="/data/public/'+sport+'/film-coverage.json">Charted possessions</a></p>');
    }).join('');
    return cards;
  }
  function cbbControls(game) {
    return '<div class="ca-analysis-scope ca-cbb-controls" aria-label="CBB evidence controls"><div><span class="ca-lineup-context">Evidence window</span><strong class="ca-cbb-control-title">Choose the season in view</strong></div>'+cbbOptions('season',[['2027','2026–27'],['2026','2025–26']],String(cbbYear(game)))+
      '<div data-cbb-chart-control>'+cbbOptions('metric',[['fg','FG%'],['share','Shot share']],game.__cbbMetric||'fg')+'</div><div data-cbb-chart-control>'+cbbOptions('view',[['offense','Offense'],['defense','Opponent allowed']],game.__cbbView||'offense')+'</div>'+
      global.ChaseCbbCharts.metricLegend()+cbbThroughLine(game)+'</div>';
  }
  /* A status line: the last game each school's evidence counts. 2026-11-18
     audit: the desk sat at Nov 12 for five days and said nothing. When
     Basketball Quant's rates lag and the box-score rates stand in
     (export.lay_box_rates), the fields only it measures carry its date. */
  function cbbThroughLine(game) {
    var parts = ['away', 'home'].map(function (side) {
      var t = cbbTeam(game, side);
      return t && t.data_through ? cbbSchool(game, side) + ' games through ' + injuryDate(t.data_through) : null;
    }).filter(Boolean);
    var basis = (cbbTeam(game, 'away') || {}).rates_basis || (cbbTeam(game, 'home') || {}).rates_basis;
    if (basis && basis.basketball_quant_through) {
      parts.push('Shot types and transition through ' + injuryDate(basis.basketball_quant_through));
    }
    return parts.length ? pending(parts.join(' · ')) : '';
  }
  function cbbOptions(kind,items,selected) { return '<div class="ca-cbb-options" role="group" aria-label="'+esc(kind)+'">'+items.map(function(x){return '<button type="button" data-cbb-'+kind+'="'+x[0]+'" class="'+(selected===x[0]?'is-on':'')+'" aria-pressed="'+(selected===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>'; }
  function cbbRateRead(team) {
    if (!team) return { rates:{}, source:'Uncovered' };
    var box=team.official_box;
    if (!team.rates.games_all && box && box.rates) return { rates:box.rates, source:box.source, through:box.data_through, box:true };
    return { rates:team.rates, source:team.source, through:team.data_through };
  }
  function cbbRateMetric(game,read,key,higher,format) {
    var n=read.rates[key];
    if (n == null) return cbbMissing();
    var text=format(n);
    return cbbMetric(game,n,text,key,higher);
  }
  function cbbRateCaption(game,side,opp,x,y) {
    var through=[x.through,y.through].filter(Boolean).sort().pop();
    return cbbSeason(game)+' · '+cbbCoverage(game,side,x.rates.games_all||0)+' · '+cbbCoverage(game,opp,y.rates.games_all||0)+
      (through?' · through '+through:'');
  }
  function cbbLedger(game, side, specs) {
    var other = nflOther(side);
    var offName = cbbSchool(game, side), defName = cbbSchool(game, other);
    var off = cbbRateRead(cbbTeam(game, side)).rates, def = cbbRateRead(cbbTeam(game, other)).rates;
    var title = offName + ' Offense vs ' + defName + ' Defense';
    if (!off.games_all && !def.games_all) {
      return cbbPanel(title, '', pending('No D-I team rates are available in this season.'));
    }
    // 'most' / 'least' mark a style share: a neutral pill, 1st taking the
    // most of it ('least' when the key is its complement).
    function entry(rates, key, higher, format) {
      var raw = rates[key], n = Number(raw);
      if (raw == null || raw === '' || !Number.isFinite(n)) return null;
      var neutral = typeof higher === 'string';
      var place = cbbPlace(n, global.ChaseSportCBB.rankSamples(cbbYear(game), 'team', key),
        neutral ? higher === 'most' : higher);
      return {
        value: n, text: format(n), rank: place && place.rank, of: place && place.of,
        label: 'Same-season D-I teams', better: neutral ? 'neutral' : undefined
      };
    }
    var groups = specs.map(function (group) {
      return {
        title: group[0],
        rows: group[1].map(function (stat) {
          return cfbLedgerRow(stat[0], entry(off, stat[1], stat[2], stat[5]),
            entry(def, stat[3], stat[4], stat[5]));
        })
      };
    });
    return cbbPanel(title, '', cfbLedgerTable([offName, 'Offense'], [defName, 'Defense'], groups));
  }
  function cbbPct(n) { return global.ChaseCbbCharts.pct(n); }
  function cbbPer100(n) { return cbbNumber(n==null?null:100*n); }
  function cbbEfficiency(sport,game,side) {
    // [label, offense key, higher is favorable, defense key, higher is favorable, format]
    return cbbLedger(game,side,[
      ['Scoring And Possession',[
        ['Points/100','ppp_off_all',true,'ppp_def_all',false,cbbPer100],
        ['eFG%','efg_o_all',true,'efg_d_all',false,cbbPct],
        ['TOV%','tov_pct_o_all',false,'tov_pct_d_all',true,cbbPct],
        // Each unit's share of the offense's missed shots.
        ['ORB% / DRB%','orb_pct_all',true,'drb_pct_all',true,cbbPct]
      ]],
      ['Shooting And Ball Movement',[
        // Shot mix is style (owner 2026-11-12: colour follows what the unit
        // wants, and a three scores about what the league's average shot
        // does), so both shares read neutral. The 2PA share complements the
        // 3PA share, so its 1st is the team with the lowest 3PA rate.
        ['2PA rate (2PA/FGA)','tpr_o_all','least','tpr_d_all','least',function(n){return cbbPct(1-n);}],
        ['2P% (2PM/2PA)','fg2_pct_o_all',true,'fg2_pct_d_all',false,cbbPct],
        ['3PA rate (3PA/FGA)','tpr_o_all','most','tpr_d_all','most',cbbPct],
        ['3P% (3PM/3PA)','fg3_pct_o_all',true,'fg3_pct_d_all',false,cbbPct],
        ['FT rate (FTA/FGA)','ftr_o_all',true,'ftr_d_all',false,function(n){return cbbNumber(n,3);}],
        ['FT% (FTM/FTA)','ft_pct_o_all',true,'ft_pct_d_all',false,cbbPct],
        ['Assist rate','ast_rate_o_all',true,'ast_rate_d_all',false,cbbPct]
      ]]
    ]);
  }
  function cbbTransition(sport,game,side) {
    return cbbLedger(game, side, [['', [
      ['Fast-break pts/100','fb_pts_per100_all',true,'fb_pts_per100_d_all',false,function(n){return cbbNumber(n);}],
      ['Paint pts/100','pitp_per100_all',true,'pitp_per100_d_all',false,function(n){return cbbNumber(n);}],
      ['Steal rate','stl_pct_o_all',false,'stl_pct_d_all',true,cbbPct],
      ['Pts off turnovers/100','pts_off_to_per_dposs_d_all',false,'pts_off_to_per_dposs_all',true,cbbPer100],
      ['Block rate','blk_pct_o_all',false,'blk_pct_d_all',true,cbbPct]
    ]]]);
  }
  /* Every D-I game's shots by type: how often the offense takes each one and
     what it scores per attempt, beside how often the defense allows it and
     what it gives up. Points per attempt grade offense high, defense low.

     A share's colour follows what each unit wants (owner 2026-11-12): a shot
     type the league scores on at more than 5% above its points per shot
     (2 x eFG) is one an offense wants more of and a defense wants to allow
     less of; more than 5% below, the reverse - a defense that forces
     mid-range jumpers is doing its job. In between, the share is style: a
     neutral pill, 1st taking it most. Read from the season's baselines. */
  var CBB_SHOT_TYPES = [['rim','At rim'],['layup','Layups'],['driving','Drives'],['floater','Floaters'],
    ['pullup','Pull-ups'],['midrange','Mid-range'],['three','Threes'],['corner3','Corner threes']];
  function cbbShotWanted(game, shot) {
    var C = global.ChaseSportCBB, year = cbbYear(game);
    function mean(key) {
      var s = C.rankSamples(year, 'team', key);
      return Array.isArray(s) && s.length ? s.reduce(function (a, b) { return a + b; }, 0) / s.length : null;
    }
    var pps = mean(shot + '_ppa_off_all'), efg = mean('efg_o_all');
    if (pps == null || !efg) return null;
    var ratio = pps / (2 * efg);
    return ratio > 1.05 ? 'more' : ratio < 0.95 ? 'less' : null;
  }
  function cbbStyleMetric(game, read, key, format) {
    var n = read.rates[key];
    if (n == null) return cbbMissing();
    var place = cbbPlace(n, global.ChaseSportCBB.rankSamples(cbbYear(game), 'team', key), true);
    var text = global.ChaseCbbCharts.value(format(n), 'c-volume');
    return place ? cbbRanked(text, place, 'same-season D-I teams · 1st takes it most', 'c-volume') : text;
  }
  function cbbShotTypes(sport,game,side) {
    var opp=side==='away'?'home':'away',x=cbbRateRead(cbbTeam(game,side)),y=cbbRateRead(cbbTeam(game,opp));
    var heading=cbbSchool(game,side)+' Offense vs '+cbbSchool(game,opp)+' Defense';
    if(!x.rates.games_all&&!y.rates.games_all)return cbbPanel(heading,cbbSeason(game),pending('No D-I shot-type sample is available in this season.'));
    function pps(n){return cbbNumber(n,2);}
    function pair(read,shot,side,higher){
      var freq=read.rates[shot+'_freq_'+side+'_all'];
      if(freq==null&&read.rates.games_all&&/^(driving|floater|pullup)$/.test(shot))
        return [cbbMissing('Not tracked'),cbbMissing('Not tracked')];
      var wanted=cbbShotWanted(game,shot), key=shot+'_freq_'+side+'_all';
      var share=wanted==null?cbbStyleMetric(game,read,key,cbbPct):
        cbbRateMetric(game,read,key,side==='off'?wanted==='more':wanted==='less',cbbPct);
      return [share,
        freq===0?cbbMissing('No attempts'):cbbRateMetric(game,read,shot+'_ppa_'+side+'_all',higher,pps)];
    }
    var rows=CBB_SHOT_TYPES.map(function(t){
      return [esc(t[1])].concat(pair(x,t[0],'off',true),pair(y,t[0],'def',false));
    });
    return cbbPanel(heading,cbbRateCaption(game,side,opp,x,y)+' · Basketball Quant shot types',
      cbbTable(['Shot type','O share','O pts/shot','D share allowed','D pts/shot allowed'],rows,'ca-cbb-shot-type-table'));
  }
  /* Schedule strength: the average D-I opponent's points scored and allowed
     per 100 possessions, and their net, over games played. 1st is the
     hardest: the best offenses, the stingiest defenses. */
  function cbbAdjusted(game,side) { var t=cbbTeam(game,side);return t&&t.adjusted||null; }
  /* Strength of schedule from the power ranking (pipeline/power.py): the
     opponents' adjusted offense, defense and net per 100, over D-I games
     played. 1st is the hardest: the best offenses, the stingiest defenses. */
  function cbbSos(game) {
    function cell(e,signed){
      if(!e)return cbbMissing('No D-I games');
      var text=(signed&&e.value>0?'+':'')+cbbNumber(e.value);
      return cbbRanked(global.ChaseCbbCharts.value(text,rankTone(e.rank,e.of)),{rank:e.rank,of:e.of},'D-I schedules · hardest first');
    }
    var played=['away','home'].map(function(side){
      var a=cbbAdjusted(game,side);
      return [esc(cbbSchool(game,side)),a?String(a.record.games):'0',cell(a&&a.schedule_offense),
        cell(a&&a.schedule_defense),cell(a&&a.schedule,true)];
    });
    var head=['School','D-I games','Vs offenses (opp adj off/100)','Vs defenses (opp adj def/100)','Total SOS (opp adj net/100)'];
    if(!played.some(function(r){return r[1]!=='0';}))
      return cbbPanel('Schedule strength',cbbSeason(game),pending('No D-I schedule sample is published for these teams.'));
    return cbbPanel('Games played',cbbSeason(game),cbbTable(head,played,'ca-cbb-factor-table'));
  }
  function cbbShotPanel(sport,game,side) {
    var opp=side==='away'?'home':'away',a=cbbTeam(game,side),b=cbbTeam(game,opp),chart=global.ChaseCbbCharts;
    var defense=game.__cbbView==='defense',metric=game.__cbbMetric||'fg',share=metric==='share';
    var attacker=cbbSchool(game,side), defender=cbbSchool(game,opp);
    var title=attacker+' Offense vs '+defender+' Defense';
    function label(schema) { return schema==='cbb'?'CBB Analytics zones':'Chase zones'; }
    if(!a||!b){
      var picked=defense?b:a;
      if(!picked)return cbbPanel(title,cbbSeason(game),pending('Zone evidence is unavailable for the selected team and view.'));
      var alone=picked.shots.coordinates[defense?'defense':'offense'];
      return cbbPanel(title,cbbSeason(game)+' · '+label('coordinates')+' · through '+(alone.totals.data_through||'not published'),
        chart.court(alone,title,{metric:metric,defense:defense})+chart.legend(defense,metric));
    }
    // Chase zones exist for every D-I team, so every matchup reads on one
    // definition and every zone ranks among all 365.
    var schema='coordinates',off=a.shots[schema].offense,def=b.shots[schema].defense;
    var shown=defense?def:off, shownRole=defense?'defense':'offense';
    /* One reading per zone, shared by the court, its badge and the table.
       Accuracy: the zone's place among same-source D-I teams when ranked, else
       its gap to the D-I zone average; on defense a low FG% allowed is the
       favorable end. Volume: shot share is a tendency and is never graded. */
    function zoneRead(z, role) {
      var onDefense=role==='defense', key={side:role,basis:schema,kind:z.id};
      if (!z.attempts) return {tone:'c-na',place:null};
      if (share) {
        // Graded like every other stat: offense ranks its larger shares first,
        // defense ranks the smaller share allowed first.
        var spot=cbbComparison(game,'shot_share',key,z.shot_share,!onDefense);
        return {tone:spot?rankTone(spot.rank,spot.of):'c-na', place:spot,
          cohort:'same-source D-I teams · '+(onDefense?'smallest share allowed first':'largest share first')};
      }
      var place=cbbComparison(game,'shot_accuracy',key,z.fg_pct,!onDefense,10,true);
      return {tone:place?rankTone(place.rank,place.of):chart.grade(z.delta_pp,onDefense), place:place,
        cohort:'D-I teams with 10+ zone attempts · '+(onDefense?'lowest FG% allowed first':'highest FG% first')};
    }
    function zoneCell(z, role) {
      if (!z || !z.attempts) return cbbMissing('No attempts');
      var r=zoneRead(z,role);
      var value=share ? chart.value(chart.pct(z.shot_share),r.tone,'Share of all FGA')
        : chart.value(chart.pct(z.fg_pct),r.tone,'D-I zone average '+chart.pct(z.league_fg_pct)+' · '+chart.pp(z.delta_pp));
      return cbbRanked(value,r.place,r.cohort);
    }
    var tones={};
    shown.zones.forEach(function(z){tones[z.id]=zoneRead(z,shownRole).tone;});
    var rows=off.zones.filter(function(z){
      var q=def.zones.find(function(x){return x.id===z.id;});
      return z.attempts||(q&&q.attempts);
    }).map(function(z){
      var q=def.zones.find(function(x){return x.id===z.id;});
      return [esc(z.label),zoneCell(z,'offense'),zoneCell(q,'defense')];
    });
    var t=shown.totals, efgPlace=t.attempts ? cbbComparison(game,'shot_accuracy',
      {side:shownRole,basis:schema,kind:'efg'},t.efg_pct,!defense,10,true) : null;
    var efgDelta=t.efg_pct!=null&&t.league_efg_pct!=null?100*(t.efg_pct-t.league_efg_pct):null;
    var efg=chart.value(chart.pct(t.efg_pct),efgPlace?rankTone(efgPlace.rank,efgPlace.of):chart.grade(efgDelta,defense),
      'D-I average '+chart.pct(t.league_efg_pct));
    var court=defense?defender+' shots allowed':attacker+' shots taken';
    var through=[off.totals.data_through,def.totals.data_through].filter(Boolean).sort().pop();
    return cbbPanel(title,cbbSeason(game)+' · '+cbbCoverage(game,side,off.totals.games)+' · '+cbbCoverage(game,opp,def.totals.games)+
        ' · '+label(schema)+(through?' · through '+through:''),
      '<p class="ca-cbb-court-title">'+esc(court)+'</p>'+chart.court(shown,court,{metric:metric,defense:defense,tones:tones})+chart.legend(defense,metric,true)+
      '<div class="ca-cbb-summary"><span><strong>'+t.made+'/'+t.attempts+'</strong> FGM/FGA</span><span><strong>'+
        cbbRanked(efg,efgPlace,'same-source D-I teams · '+(defense?'lowest eFG% allowed first':'highest eFG% first'))+'</strong> eFG</span></div>'+
      cbbTable(share?['Zone','Offense share','Allowed share']:['Zone','Offense FG%','Allowed FG%'],rows,'ca-cbb-zone-table'));
  }
  function cbbRotation(sport,game,side) {
    if (game.cbb_availability_pending) return pending('Checking the current availability report…');
    var c=cbbTeam(game,side);if(!c)return pending('Player evidence is unavailable.');
    var box=c.official_box||{};
    var useBox=!c.players.some(function(p){return p.G>0;})&&Array.isArray(box.players);
    var players=availability.available(game,side,useBox?box.players:c.players).sort(function(a,b){return (b.Min_pct||0)-(a.Min_pct||0);}).slice(0,12);
    var title=cbbSchool(game,side)+' Rotation';
    if (!players.length) return cbbPanel(title,cbbSeason(game),pending('No player lines are available for this matchup and season.'));
    var rows=players.map(function(p){return [esc(String(p.Name||'').replace(/\s*\(\d+\).*$/,'')),cbbNumber(p.G,0),cbbNumber(p.Min_pct,0)].concat(['Pts','Reb','Ast','TS'].map(function(k){
      if(p[k]==null)return cbbMissing(k==='TS'?'No attempts':'Not reported');
      // ESPN box lines publish TS only when the player shot (no FGA/FTA keys).
      var qualified=(p.G||0)>0&&(k!=='TS'||(p.FGA||0)+(p.FTA||0)>0||(p.FGA==null&&p.TS!=null));
      var text=cbbNumber(p[k])+(k==='TS'?'%':'');
      return qualified?cbbMetric(game,p[k],text,k,true,'player'):text;
    }));});
    return cbbPanel(title,cbbSeason(game)+' · '+(useBox?'ESPN final boxes':'Basketball Quant')+' · per game · players listed out are removed',
      cbbTable(['Player','GP','MIN%','PTS','REB','AST','TS%'],rows,'ca-cbb-rotation-table'));
  }
  /* Each completed game's box line (pipeline/cbb_public/game_lines.py): every
     figure is coloured and placed among all D-I team-games that week, printed
     on the D-I team scale (teamScaled). */
  var CBB_LOG_COLS = [['orb_pct','ORB%'],['drb_pct','DRB%'],['efg_pct','eFG%'],['fg3_pct','3P%'],['fg2_pct','2P%'],
    ['ft_pct','FT%'],['pace','Pace'],['fg3a_share','3PA share'],['fg2a_share','2PA share']];
  var CBB_LOG_VOLUME = new Set(['pace','fg3a_share','fg2a_share']);
  function cbbLogCell(g,key,teams) {
    var e=(g.box||{})[key];
    if(!e||e.value==null)return cbbMissing(g.box?'None':'Not published');
    var text=key==='pace'?cbbNumber(e.value):cbbPct(e.value);
    var place=g.score_corrected?null:teamScaled(e.rank,e.of,teams);
    if(!place)return global.ChaseCbbCharts.value(text,'');
    var pool='D-I team-games'+(g.week?' in the week of '+g.week:' that week');
    var volume=CBB_LOG_VOLUME.has(key);
    var label=teamScaledLabel(place,e.rank,place.pool?'on the D-I team scale':pool,pool);
    var tone=volume?'c-volume':rankTone(place.rank,place.of);
    return '<span class="ca-cbb-ranked">'+global.ChaseCbbCharts.value(text,tone)+
      rankBadge(place,tone,volume?label+' · highest first':label)+'</span>';
  }
  /* Twelve columns need the full width: the two schools stack. */
  function cbbGameLogs(sport,game) {
    return '<div class="ca-cbb-log-stack">'+cbbGames(sport,game,'away',false)+cbbGames(sport,game,'home',false)+'</div>';
  }
  // A short opponent tag for the margin strip: the school's abbreviation when the
  // index has it, else its first word.
  function cbbLogOpponent(g) {
    var id=global.ChaseSportCBB.identity&&global.ChaseSportCBB.identity(g.opponent_id);
    return (id&&id.abbr)||String(g.opponent||'').split(' ')[0];
  }

  // Overlay a final on the same fixture, keeping the independently published
  // box and adjustment when they still match the scoreboard.
  function cbbLogFinal(games,game,side) {
    var opponent=side==='away'?'home':'away';
    var points=game[side+'_score'], opponentPoints=game[opponent+'_score'];
    if(cbbYear(game)!==game.season||game.game_state!=='final'||points==null||opponentPoints==null)return;
    var final={id:game.id,date:game.slate_date,opponent:cbbSchool(game,opponent),opponent_id:game[opponent],
      site:game.neutral?'Neutral':titleCase(side),state:'post',points:points,opponent_points:opponentPoints};
    var index=games.findIndex(function(g){return String(g.id)===String(final.id);});
    if(index<0){games.push(final);return;}
    var stored=games[index];
    if(String(stored.opponent_id)===String(final.opponent_id)){
      final=Object.assign({},stored,final);
      if(stored.points!=null&&stored.opponent_points!=null&&
          (Number(stored.points)!==Number(points)||Number(stored.opponent_points)!==Number(opponentPoints))){
        final.score_corrected=true;
        final.adj_points=null;
        final.adj_opponent_points=null;
      }
    }
    games[index]=final;
  }

  function cbbGames(sport,game,side,upcoming) {
    var c=cbbTeam(game,side), title=cbbSchool(game,side)+(upcoming?' Remaining Schedule':' Game Log');
    if(!c)return cbbPanel(title,cbbSeason(game),pending('Game history is unavailable.'));
    var games=(c.games||[]).slice(), check=global.ChaseSportCBB.isDivisionI;
    cbbLogFinal(games,game,side);
    games=games.filter(function(g){return upcoming?g.state==='pre'&&g.date>=String(game.slate_date):g.points!=null;});
    games.sort(function(a,b){return upcoming?a.date.localeCompare(b.date):b.date.localeCompare(a.date);});
    var division=0, teams=global.ChaseSportCBB.teamCount(cbbYear(game));
    var rows=games.map(function(g){
      var d1=!check||check(g.opponent_id);
      if(d1)division++;
      var result='Scheduled';
      if(g.points!=null){
        var won=Number(g.points)>Number(g.opponent_points);
        result='<span class="'+(won?'c-good':'c-poor')+'" data-result="'+(won?'W':'L')+'">'+(won?'W ':'L ')+esc(g.points+'–'+g.opponent_points)+'</span>';
        if(g.score_corrected&&g.box)result+='<small class="ca-qb-volume">Box awaiting verification</small>';
      }
      var where=g.site==='Away'?'@ ':'vs ';
      var known=global.ChaseSportCBB.identity&&global.ChaseSportCBB.identity(g.opponent_id);
      var day=esc(upcoming?g.date:String(g.date).slice(5).replace('-','/'));
      var opponent=where+esc((known&&known.short_name)||g.opponent)+(d1?'':' <span class="ca-lineup-player__position">Non-D-I</span>');
      // A final with no published box reads once across the box columns.
      if(!upcoming&&!g.box&&g.adj_points==null)
        return [day,opponent,result,{span:CBB_LOG_COLS.length+1,html:esc('Box score not published')}];
      var adjusted=upcoming?[]:[g.adj_points!=null?nflLogResult(g.adj_points,g.adj_opponent_points,1):
        cbbMissing(g.score_corrected?'Pending verification':'Not published')];
      return [day,opponent,result]
        .concat(adjusted).concat(upcoming?[]:CBB_LOG_COLS.map(function(c){return cbbLogCell(g,c[0],teams);}));
    });
    var caption=cbbSeason(game)+' · '+cbbPlural(games.length,'game')+(division<games.length?' · '+division+' vs D-I':'');
    var head=['Date','Opponent',upcoming?'State':'Result'].concat(upcoming?[]:['Noise-Adj']).concat(upcoming?[]:CBB_LOG_COLS.map(function(c){return c[1];}));
    var strip=upcoming?'':logMarginStrip(games.filter(function(g){return g.adj_points!=null;}).map(function(g){
      return {date:g.date,home:g.site!=='Away',opp:cbbLogOpponent(g),points:g.points,opp_points:g.opponent_points,
        adj_points:g.adj_points,opp_adj_points:g.adj_opponent_points};
    }),function(g){return g.date.slice(5).replace('-','/');});
    var table=rows.length?cbbTable(head,rows,'ca-cbb-log-table').replace('<th scope="col" class="num">Noise-Adj</th>',
      '<th scope="col" class="num" title="'+esc(NBA_NOISE_NOTE)+'">Noise-Adj</th>'):'';
    return cbbPanel(title,caption,rows.length?strip+table:
      pending(upcoming?'No remaining fixtures in this evidence window.':'No completed games in this evidence window.'));
  }
  function cbbTactics(game,side) { var team=cbbTeam(game,side);return team&&team.observed_tactics; }
  function basketballVolume(n) {
    if(n==null)return '—';
    return '<span class="ca-basketball-volume" style="--volume:'+Math.max(0,Math.min(100,100*n)).toFixed(1)+'%">'+nbaPct(n)+'<span aria-hidden="true"></span></span>';
  }
  /* Possession-tagged evidence comes from NCAA play-by-play, which does not
     publish every game. Its caption counts the games it holds against the D-I
     games each team has played, so a short sample is never mistaken for a season. */
  function cbbTacticCaption(game,side,other) {
    var a=cbbTactics(game,side), b=cbbTactics(game,other);
    return cbbSeason(game)+' · '+cbbCoverage(game,side,(a&&a.games)||0)+' · '+cbbCoverage(game,other,(b&&b.games)||0)+' · NCAA play-by-play';
  }
  function cbbUsage(game, family, row) {
    if (!row || !Number.isFinite(row.usage)) return cbbMissing('No sample');
    var comparison = global.ChaseSportCBB.comparison(cbbYear(game), family, row);
    var peers = comparison && comparison.usage_samples || [];
    var place = cbbPlace(row.usage, peers, true);
    var pct = 100 * row.usage;
    var tone = place ? rankTone(place.rank, place.of) + ' ca-usage--graded' : 'c-na ca-usage--graded';
    return '<span class="ca-cbb-usage"><span class="ca-usage '+tone+'">'+
      usageSquares(pct)+'<b>'+nbaPct(row.usage)+'</b></span>'+nflFreqMark(place && {place:place.rank, of:place.of})+'</span>';
  }
  function cbbObservedPpp(game, family, row) {
    if (!row || !Number.isFinite(row.ppp)) return cbbMissing('No sample');
    var text = cbbNumber(row.ppp, 3), grade = row.ppp_grade, low = false;
    var higher = row.side === 'offense';
    if (!grade) {
      var comparison = global.ChaseSportCBB.comparison(cbbYear(game), family, row);
      var baseline = comparison && comparison.ppp_baseline;
      // A start event too rare for its own cohort reads against team PPP.
      if (!baseline || !(baseline.sample_size >= 20))
        baseline = global.ChaseSportCBB.baseline(cbbYear(game), 'team', higher ? 'ppp_off_all' : 'ppp_def_all');
      var tone = '';
      if (row.possessions > 0 && baseline && baseline.sample_size >= 20) {
        var adjusted = baseline.mean + (row.ppp - baseline.mean) * row.possessions / (row.possessions + 40);
        tone = global.MLBMAAssets.baselineChipClass(adjusted, baseline, higher);
      }
      if (tone) {
        low = row.possessions < 10;
        text = global.ChaseCbbCharts.value(text, tone, baseline.sample_size+
          ' same-season teams · sample-weighted toward the D-I average');
        var spot = cbbComparison(game, family, row, row.ppp, higher, 20, true);
        var pool = 'placed among same-season D-I teams with 10+ possessions';
        if (!spot) {
          // An event too rare for its own pool is placed among team season PPP.
          spot = cbbPlace(row.ppp, global.ChaseSportCBB.rankSamples(cbbYear(game), 'team',
            higher ? 'ppp_off_all' : 'ppp_def_all'), higher, 10, true);
          pool = 'placed among D-I team season points per possession';
        }
        text = cbbRanked(text, spot, pool);
      } else {
        low = row.possessions < 10;
        text = nbaGraded(text, null);
      }
    } else text = cbbRanked(nbaGraded(text, grade), grade, 'qualified same-season D-I teams');
    return text+'<small class="ca-cbb-count'+(low?' is-low':'')+'">'+row.possessions+' poss'+
      (low?' · Low n':'')+'</small>';
  }
  function cbbRestarts(sport,game,side) {
    var other=side==='away'?'home':'away',a=cbbTactics(game,side),b=cbbTactics(game,other);
    var off=a&&a.restart_contexts||[],def=b&&b.restart_contexts||[];
    var title=cbbSchool(game,side)+' Offense vs '+cbbSchool(game,other)+' Defense';
    var rows=[['defensive_rebound','After defensive rebound'],['steal','After steal'],
      ['turnover','After dead-ball turnover'],['timeout','After timeout']].flatMap(function(k){
      var o=off.find(function(r){return r.side==='offense'&&r.kind===k[0];});
      var d=def.find(function(r){return r.side==='defense'&&r.kind===k[0];});
      return o||d?[[esc(k[1]),cbbUsage(game,'restart_contexts',o),cbbObservedPpp(game,'restart_contexts',o),
        cbbObservedPpp(game,'restart_contexts',d)]]:[];
    });
    return cbbPanel(title,cbbTacticCaption(game,side,other),rows.length ?
      cbbTable(['Start event','O share','O PPP','D PPP allowed'],rows,'ca-nba-evidence-table') :
      pending('NCAA play-by-play has not published a possession sample for this pairing.'));
  }
  function cbbTaggedCoverage(sport,game,side) {
    var sample=game.cbb_tagged_schemes,other=side==='away'?'home':'away',reports=sample&&sample.reports||[];
    var rows=[['zone','Zone'],['press','Press']].flatMap(function(k){
      var o=reports.find(function(r){return r.team_id===String(game[side])&&r.side==='offense'&&r.kind===k[0];});
      var d=reports.find(function(r){return r.team_id===String(game[other])&&r.side==='defense'&&r.kind===k[0];});
      var grade=d?'<span class="ca-basketball-value '+rankTone(101-d.percentile,100)+'">'+d.percentile+' pct</span>':cbbMissing('Not published');
      return o||d?[[k[1],cbbUsage(game,'tagged_schemes',d),grade,o?'#'+o.reported_rank:cbbMissing('Not published')]]:[];
    });
    var title=cbbSchool(game,side)+' Offense vs '+cbbSchool(game,other)+' Coverage';
    return cbbPanel(title,'2025–26 · Synergy via Action Network · March 17, 2026',
      (rows.length?cbbTable(['Coverage','D usage','D efficiency','O efficiency rank'],rows,'ca-nba-evidence-table'):
        pending('The published tournament sample has no values for this matchup direction.'))+
      '<p class="ca-cbb-note ca-cbb-cite"><a href="https://www.actionnetwork.com/ncaab/5-key-stats-betting-march-madness-ncaa-tournament-2026">Published sample</a></p>');
  }
  /* Backcourt pressure (pipeline/cbb_public/pressure.py): turnovers in the
     first 10 seconds after a score, before the offense gets a shot away, per
     100 such possessions. The offense column is what it gives up against
     pressure, the second what that defense forces; both rank among
     same-season D-I teams. */
  function cbbPressure(sport,game,side) {
    var opp=side==='away'?'home':'away',o=(cbbTeam(game,side)||{}).pressure,d=(cbbTeam(game,opp)||{}).pressure;
    var heading=cbbSchool(game,side)+' Offense vs '+cbbSchool(game,opp)+' Pressure';
    if(!o&&!d)return cbbPanel(heading,cbbSeason(game),pending('No D-I play-by-play is published for these teams.'));
    function cell(block,part,field,key,higher){
      var unit=block&&block[part];
      if(!unit||!unit.after_score)return cbbMissing('No sample');
      var n=unit[field+'_per100'],low=unit.after_score<100;
      return cbbMetric(game,n,cbbNumber(n),key,higher)+(low?'<small class="ca-cbb-count is-low">Low n</small>':'');
    }
    var rows=[['Backcourt turnovers/100',cell(o,'offense','lost','pressure_lost_per100',false),cell(d,'defense','forced','pressure_forced_per100',true)],
      ['Backcourt steals/100',cell(o,'offense','stolen','pressure_stolen_per100',false),cell(d,'defense','steals','pressure_steals_per100',true)]];
    var through=[o&&o.data_through,d&&d.data_through].filter(Boolean).sort().pop();
    return cbbPanel(heading,cbbSeason(game)+' · '+cbbCoverage(game,side,o?o.games:0)+' · '+cbbCoverage(game,opp,d?d.games:0)+
      (through?' · through '+through:'')+' · ESPN play-by-play',cbbTable(['Stat','Offense','Forced'],rows,'ca-cbb-factor-table'));
  }
  function cbbTagged(game) {
    var reports=(game.cbb_tagged_schemes||{}).reports||[],ids=[String(game.away),String(game.home)];
    return reports.some(function(r){return ids.indexOf(r.team_id)!==-1;});
  }
  /* Pace prefers the source that counts the most of a team's games: ESPN final
     boxes cover every D-I final, NCAA possession counts only the games it holds. */
  function cbbPace(game) {
    function read(teamSide) {
      var t=cbbTactics(game,teamSide), team=cbbTeam(game,teamSide), box=team&&team.official_box, bp=box&&box.pace;
      var counted=t&&t.pace&&t.pace.games||0, estimated=bp?(bp.games||box.games||0):0;
      if(bp&&estimated>=counted)return { pace:bp.estimated_per40, recent:bp.recent5_estimated_per40, games:estimated,
        keys:['estimated_per40','recent5_estimated_per40'], source:'ESPN final boxes' };
      if(counted)return { pace:t.pace.observed_per40, recent:t.pace.recent5_per40, games:counted,
        keys:['observed_per40','recent5_per40'], source:'NCAA possession counts' };
      return {};
    }
    var away=read('away'), home=read('home');
    if(!away.games&&!home.games)return cbbPanel('Team pace',cbbSeason(game),pending('Pace requires a completed D-I game.'));
    function cell(team, recent) {
      if (!team.games) return cbbMissing('No D-I game');
      if (recent && !(team.games > 5)) return cbbMissing('Under 6 games');
      var n = recent ? team.recent : team.pace;
      var key = team.keys[recent ? 1 : 0];
      var peers = global.ChaseSportCBB.baseline(cbbYear(game), 'pace_samples', key);
      var games = recent ? Math.min(team.games, 5) : team.games;
      var display = cbbNumber(n) + (global.ChaseIcons ? ChaseIcons.observedPace(n, peers, 'D-I teams on the same method',
        cbbPlural(games,'game')+' · '+team.source) : '');
      var spot = cbbPlace(n, peers, true);
      return cbbRanked('<span class="ca-basketball-value '+(spot?rankTone(spot.rank,spot.of):'c-na')+'">'+display+'</span>', spot,
        'same-season D-I teams · fastest first · '+team.source);
    }
    var rows=[['Season pace',cell(away,false),cell(home,false)]];
    if(away.games>5||home.games>5)rows.push(['Last 5 pace',cell(away,true),cell(home,true)]);
    rows.push(['D-I games',String(away.games||0),String(home.games||0)]);
    var sources=[away.source,home.source].filter(Boolean).filter(function(s,i,all){return all.indexOf(s)===i;});
    return cbbPanel('Team pace',cbbSeason(game)+' · '+sources.join(' / '),
      cbbTable(['Metric',cbbSchool(game,'away'),cbbSchool(game,'home')],rows,'ca-cbb-factor-table')+paceKey());
  }
  function cbbSituations(sport,game,side) {
    var a=cbbTactics(game,side),other=side==='home'?'away':'home',b=cbbTactics(game,other);
    var offense=a?a.situations:[], defense=b?b.situations:[];
    var rows=['transition','half_court'].flatMap(function(kind){
      var o=offense.find(function(r){return r.side==='offense'&&r.kind===kind;}),d=defense.find(function(r){return r.side==='defense'&&r.kind===kind;});
      return o||d?[[kind==='transition'?'Transition':'Half court',cbbUsage(game,'situations',o),
        cbbObservedPpp(game,'situations',o),cbbObservedPpp(game,'situations',d)]]:[];
    });
    return cbbPanel(cbbSchool(game,side)+' Offense vs '+cbbSchool(game,other)+' Defense',cbbTacticCaption(game,side,other),
      rows.length ? cbbTable(['Type','O usage','O PPP','D PPP allowed'],rows,'ca-nba-evidence-table') :
        pending('NCAA play-by-play has not published a possession sample for this pairing.'));
  }
  function cbbPersonnel(sport,game,side) {
    var a=cbbTactics(game,side),other=side==='home'?'away':'home',b=cbbTactics(game,other);
    var title=cbbSchool(game,side)+' Offense vs '+cbbSchool(game,other)+' Lineups';
    if(!b||!b.personnel.length) {
      var team=cbbTeam(game,other), box=team&&team.official_box, groups=box&&box.starter_groups||[];
      return cbbPanel(title,cbbSeason(game)+' · '+cbbSchool(game,other)+' starting groups · ESPN final boxes',
        groups.length ? cbbTable(['Starting group','Starts','Share'],groups.map(function(r){
          return [esc(r.personnel),String(r.games),cbbUsage(game,'starter_groups',r)];
        }),'ca-cbb-factor-table') : pending('Lineup evidence is unavailable for '+cbbSchool(game,other)+'.'));
    }
    var rows=b.personnel.filter(function(r){return r.side==='defense'&&r.basis==='own';}).sort(function(x,y){return y.usage-x.usage;}).slice(0,5).map(function(d){
      var o=a&&a.personnel.find(function(r){return r.side==='offense'&&r.basis==='opponent'&&r.personnel===d.personnel;});
      return [esc(d.personnel),cbbUsage(game,'personnel',d),cbbObservedPpp(game,'personnel',d),
        cbbObservedPpp(game,'personnel',o)];
    });
    return cbbPanel(title,cbbTacticCaption(game,side,other),
      rows.length?cbbTable(['D lineup (G-F-C)','D use','D PPP allowed','O PPP vs'],rows,'ca-nba-evidence-table'):pending('No complete five-player lineup was matched.'));
  }
  function cbbSize(sport,game,side) {
    var a=cbbTactics(game,side), title=cbbSchool(game,side)+' Size';
    if(!a)return cbbPanel(title,cbbSeason(game),pending('Position-size evidence is unavailable.'));
    var labels={G:'Guards',F:'Forwards',C:'Centers'};
    var starterRows=a.starter_position_size||[];
    var summary=a.size_summary||{}, starters=summary.starters||{};
    var startsComplete=starters.reported_starts>0&&starterRows.reduce(function(total,row){return total+row.recorded_starts;},0)===starters.reported_starts;
    function height(r, basis, position) {
      if (!r || r.mean_height_inches == null) return cbbMissing();
      var tenths = Math.round(r.mean_height_inches * 10), feet = Math.floor(tenths / 120);
      var text = feet+'′ '+((tenths-feet*120)/10).toFixed(1)+'″';
      var starter = basis === 'starters';
      var place = cbbComparison(game, 'height', {side:basis, kind:position}, r.mean_height_inches, true);
      var value = global.ChaseCbbCharts.value(text, place && rankTone(place.rank, place.of));
      return cbbRanked(value, place, 'same-season D-I '+(starter?'starter groups':'rosters')+' · '+
        (labels[position] || 'all positions')+' · tallest first')+
        '<small class="ca-cbb-count">'+cbbPlural(r.players,'player')+
        (starter?'<span class="ca-cbb-count__games">'+cbbPlural(r.recorded_starts,'start')+'</span>':'')+'</small>';
    }
    var rows=[];
    if(summary.whole_team||summary.starters)rows.push(['All positions',height(summary.starters,'starters','all'),height(summary.whole_team,'whole_team','all')]);
    ['G','F','C'].forEach(function(position){var r=(a.position_size||[]).find(function(p){return p.position===position;}),starter=starterRows.find(function(p){return p.position===position;});
      rows.push([esc(labels[position]),!starter&&startsComplete?cbbMissing('No starts'):height(starter,'starters',position),height(r,'whole_team',position)]);});
    var startSource=starters.source?' · starters '+starters.games+' games through '+starters.data_through:'';
    return cbbPanel(title,cbbSeason(game)+' · listed heights'+startSource,
      rows.length?cbbTable(['Position','Starters (by starts)','Whole roster'],rows,'ca-cbb-factor-table'):pending('Reported heights are not available.'));
  }
  /* What a listed player is worth to the spread (scripts/fit_cbb_injury_value.py,
     outputs/cbb_injury_value.json): closing lines over 2024-25 and 2025-26
     priced an absent regular at role x minutes/40 plus star x (game score)^2/10,
     the game score read from his Basketball Quant line - points, shooting,
     rebounds and assists per game (makes and attempts are season totals).
     A college report has no history of its own yet, so how often a player
     listed this way played is the NBA official report's record (nba-model
     designation_rates.json, 2024-25 to 2026-27); a game-time decision reads
     as Questionable. */
  var CBB_INJURY_VALUE = { role: 0.4411, star: 0.0233 };
  var CBB_PLAY_RATES = { Questionable: [0.5092, 2824], Doubtful: [0.0131, 535], Probable: [0.9171, 1073],
    Out: [0.002, 18930] };
  function cbbPlayerValue(game, side, playerId) {
    var team = cbbTeam(game, side);
    var p = team && (team.players || []).find(function (x) { return String(x.athlete_id) === String(playerId); });
    var g = p && Number(p.G);
    if (!p || !(g > 0)) return null;
    var minutes = (Number(p.Min_pct) || 0) / 100 * 40;
    var gs = (Number(p.Pts) || 0) + 0.4 * (Number(p.FGM) || 0) / g - 0.7 * (Number(p.FGA) || 0) / g -
      0.4 * ((Number(p.FTA) || 0) - (Number(p.FTM) || 0)) / g + 0.45 * (Number(p.Reb) || 0) + 0.7 * (Number(p.Ast) || 0);
    gs = Math.max(gs, 0);
    return CBB_INJURY_VALUE.role * minutes / 40 + CBB_INJURY_VALUE.star * gs * gs / 10;
  }
  function cbbPlays(status) {
    var key = status === 'Game Time Decision' ? 'Questionable' : status;
    var r = CBB_PLAY_RATES[key];
    return r ? { played: r[0], n: r[1], basis: key + ' (NBA official report record)' } : null;
  }

  function cbbAvailability(sport,game,side) {
    var title = cbbSchool(game,side) + ' Availability';
    var asOf = game.cbb_availability_as_of;
    var players = game[side + '_cbb_availability'] || [];
    if (game.cbb_availability_pending) return cbbPanel(title,'Current public injury listings',pending('Checking the latest public report…'));
    if (!asOf) return cbbPanel(title,'Public injury listings',pending(game.cbb_availability_archived ?
      'A game-day report snapshot is unavailable for this fixture.' : 'A current public report is unavailable for this fixture.'));
    var caption = (game.cbb_availability_archived ? 'Archived injury reports' : 'Public injury reports') +
      ' · ' + (game.cbb_availability_sources||[]).join(', ') + ' · checked ' + nbaEvidenceStamp(asOf);
    var fixture = game.cbb_fixture_check || {};
    function sourceLink(name, url) {
      return /^https:\/\/www\.(covers\.com|actionnetwork\.com|rotowire\.com)\//.test(url || '')
        ? '<a href="'+esc(url)+'">'+esc(name)+'</a>' : esc(name);
    }
    var listed = players.map(function (player) {
      var rate = cbbPlays(player.status), value = cbbPlayerValue(game, side, player.player_id);
      return Object.assign({}, player, { value: value == null ? null : Math.round(value * 100) / 100,
        plays: rate ? rate.played : null, plays_n: rate ? rate.n : null, plays_basis: rate ? rate.basis : null });
    });
    var valueNote = 'Points of the spread his school gives up without him: closing lines (2024\u201326) ' +
      'priced his minutes and box-score production';
    function injuryContext(player) {
      var source = sourceLink(player.source, player.source_url) +
        (player.updated ? ' · ' + esc(player.updated.slice(0, 10)) : '');
      return (
        (player.detail ? '<small class="ca-cbb-count">'+esc(player.detail)+'</small>' : '') +
        (source ? '<small class="ca-cbb-count">' + source + '</small>' : ''));
    }
    var count = fixture[side + '_listings'];
    var empty = count === 0 ? 'Covers lists no injuries for this school.' :
      count > 0 ? 'The matchup report lists entries awaiting a verified roster match.' :
        'No checked public source lists an injury for this school.';
    return cbbPanel(title,caption,(listed.length ? injuryTable(listed, { label: title, alwaysMetrics: true,
      playsNote: 'no college history yet', valueNote: valueNote, injuryContext: injuryContext }) :
      pending(empty)) +
      (fixture.source_url ? '<p class="ca-cbb-note ca-cbb-cite">'+sourceLink('Covers matchup injury report',fixture.source_url)+
        (fixture.retrieved_at_utc ? ' · checked '+esc(nbaEvidenceStamp(fixture.retrieved_at_utc)) : '')+'</p>' : ''));
  }
  /* CBB résumé and luck (2026-11-18 audit; pipeline/cbb_public/resume.py):
     NET and quadrant records from the NCAA's current-season list (none
     before its December release), T-Rank from barttorvik.com, and the NBA
     desk's regression figures over each school's D-I season. */
  var CBB_TORVIK = [['trank', 'T-Rank'], ['adj_off', 'Adjusted Offense'], ['adj_def', 'Adjusted Defense'],
    ['barthag', 'Barthag'], ['wab', 'Wins Above Bubble'], ['adj_tempo', 'Adjusted Tempo']];
  function cbbResume(sport, game) {
    var a = (cbbTeam(game, 'away') || {}).resume || {}, h = (cbbTeam(game, 'home') || {}).resume || {};
    var unranked = { value: null, missing: 'Not Ranked' };
    function row(label, ea, eh) {
      return '<tr><td>' + esc(label) + '</td>' + cfbCell(ea || unranked) + cfbCell(eh || unranked) + '</tr>';
    }
    var rows = [];
    if (a.net || h.net) {
      rows.push(row('NET', a.net, h.net));
      ['q1', 'q2', 'q3', 'q4'].forEach(function (q, i) {
        rows.push('<tr><td>Quadrant ' + (i + 1) + '</td><td class="num">' + esc((a.quadrants || {})[q] || '0-0') +
          '</td><td class="num">' + esc((h.quadrants || {})[q] || '0-0') + '</td></tr>');
      });
    }
    if (a.torvik || h.torvik) {
      CBB_TORVIK.forEach(function (r) { rows.push(row(r[1], (a.torvik || {})[r[0]], (h.torvik || {})[r[0]])); });
    }
    if (!rows.length) return pending('Résumé figures are not published for this pairing yet.');
    var through = a.net_through || h.net_through;
    var tThrough = a.torvik_through || h.torvik_through;
    var status = ((a.net || h.net) ? pending('NET · NCAA · Through ' + injuryDate(through)) :
      pending('NET not published for this season yet')) +
      ((a.torvik || h.torvik) && tThrough ? pending('T-Rank · barttorvik.com · Retrieved ' + injuryDate(tThrough)) : '');
    return status + nflSplitTable([cbbSchool(game, 'away'), cbbSchool(game, 'home')], rows, 'Stat');
  }
  function cbbRegression(sport, game) {
    var a = (cbbTeam(game, 'away') || {}).regression || {}, h = (cbbTeam(game, 'home') || {}).regression || {};
    var context = '<p class="ca-lineup-context">' + esc('Close Games: ' + cbbSchool(game, 'away') + ' ' +
      (a.close_record || 'None') + ', ' + cbbSchool(game, 'home') + ' ' + (h.close_record || 'None')) + '</p>';
    return cfbHeadToHead(sport, game, cbbSchool(game, 'away') + ' vs ' + cbbSchool(game, 'home') + ' Regression Watch',
      context, NBA_REGRESSION.map(function (r) { return [r[1], regressionEntry(a, r[0]), regressionEntry(h, r[0])]; }));
  }
  // Rest, density, travel and altitude into the game (pipeline/cbb_public/venues.py).
  function cbbSchedulePanel(sport, game, side) {
    var s = game[side + '_schedule'];
    if (!s) return teamPanel(sport, game, side, [['Schedule Load', 'Not Published']]);
    function n(v, none) { return v != null ? String(v) : none; }
    return teamPanel(sport, game, side, [
      ['Rest', game[side + '_rest_label'] || 'Not Published'],
      ['Games In Last 7 Days', n(s.games_last_7, '0')],
      ['Travel Into This Game (Mi)', n(s.travel_miles, s.rest_days == null ? 'First Game' : 'Not Published')],
      ['Miles In Last 7 Days', n(s.miles_last_7, s.rest_days == null ? 'First Game' : 'Not Published')],
      ['Time Zones Crossed', n(s.tz_shift, s.rest_days == null ? 'First Game' : 'Not Published')],
      ['Venue Elevation (Ft)', n(s.venue_elevation_ft, 'Not Published')],
      ['Visiting Altitude', s.altitude ? 'Yes' : 'No']
    ]);
  }

  function cbbSections(sport,game) {
    function part(id,title,note,body) {
      return section(id,title,note,game.cbbDetailReady||id==='cbb-availability' ? body : pending('Loading matchup evidence…'));
    }
    // Pressure is measured from every D-I game's play-by-play. Man and zone
    // tags exist only in charted film or Synergy's published tournament sample
    // (no free feed tags them, and the box-score fingerprint failed against
    // Synergy, r = -0.09), so they join only where such a sample covers a team.
    var tags = filmCoverageCards('cbb',game,cbbYear(game)) || (cbbYear(game) === 2026 && cbbTagged(game) ? nflDuo(cbbTaggedCoverage,sport,game) : '');
    var pressed = ['away','home'].some(function (s) { var t = cbbTeam(game,s); return t && t.pressure; });
    var coverage = (pressed ? nflDuo(cbbPressure,sport,game) : '') + tags;
    return part('cbb-power','Power Ranking','Opponent-Adjusted, Luck-Adjusted · Per 100 Possessions · D-I Games',
        powerPanel(cbbSchool(game,'away')+' vs '+cbbSchool(game,'home')+' Power Ranking',
          [[cbbSchool(game,'away'),cbbAdjusted(game,'away')],[cbbSchool(game,'home'),cbbAdjusted(game,'home')]],
          {cohort:'D-I teams',digits:1,first:'School',units:'Points per 100 possessions'},true))+
      part('cbb-pace','Pace','Possessions Per 40 Minutes · Overtime Normalized',cbbPace(game))+
      part('cbb-efficiency','Efficiency','Each Offense Against The Defense It Meets',nflDuo(cbbEfficiency,sport,game))+
      part('cbb-sos','Strength Of Schedule','D-I Opponents Played · Opponent-Adjusted Ratings',cbbSos(game))+
      part('cbb-predictability','Predictability','How Often Each Offense Lands Off The D-I Curve',
        predictabilityPanel(cbbSchool(game,'away'),cbbSchool(game,'home'),cbbTeam(game,'away')&&cbbTeam(game,'away').predictability,
          cbbTeam(game,'home')&&cbbTeam(game,'home').predictability,cbbSeason(game),true))+
      part('cbb-shot-chart','Shot Chart','Zone Shooting Against The Defense It Meets',nflDuo(cbbShotPanel,sport,game))+
      part('cbb-transition','Transition And Turnovers','Every D-I Game · Each Offense Against The Defense It Meets',nflDuo(cbbTransition,sport,game))+
      part('cbb-situations','Transition And Half Court','Possession-Tagged Efficiency',nflDuo(cbbSituations,sport,game))+
      part('cbb-restarts','Possession Starts','Efficiency By How The Possession Began',nflDuo(cbbRestarts,sport,game))+
      part('cbb-shot-types','Shot Types','Every D-I Game · What Each Offense Takes Against What The Defense Allows',nflDuo(cbbShotTypes,sport,game))+
      part('cbb-personnel','Defensive Lineups','Lineup Shapes Each Defense Uses',nflDuo(cbbPersonnel,sport,game))+
      (coverage||!game.cbbDetailReady ? part('cbb-tagged-schemes',tags?'Press And Zone':'Full-Court Pressure',
        'Backcourt Turnovers In The First 10 Seconds After A Score',coverage) : '')+
      part('cbb-availability','Availability','Current Public Injury Listings',nflDuo(cbbAvailability,sport,game))+
      part('cbb-rotation','Rotation','Per-Game Output · Available Players',nflDuo(cbbRotation,sport,game))+
      part('cbb-size','Size By Position','Average Listed Height',nflDuo(cbbSize,sport,game))+
      part('cbb-game-log','Game Log','Completed Games · Each Figure Ranked Against That Week',cbbGameLogs(sport,game))+
      part('cbb-resume','Résumé','NET, Quadrant Records And T-Rank',cbbResume(sport,game))+
      part('cbb-regression','Regression Watch','Shooting Luck And Close Games',cbbRegression(sport,game))+
      part('cbb-schedule','Schedule Load','Rest, Travel And Altitude Into This Game',nflDuo(cbbSchedulePanel,sport,game));
  }
  function wireCbbControls(host,game) {
    host.addEventListener('click',function(event){
      var b=event.target.closest('[data-cbb-season],[data-cbb-metric],[data-cbb-view]');if(!b)return;
      var stack=host.querySelector('.ca-detail-stack'),tab=stack.getAttribute('data-nfl-tab'),club=stack.getAttribute('data-club');
      if(b.dataset.cbbSeason)game.__cbbYear=Number(b.dataset.cbbSeason);
      if(b.dataset.cbbMetric)game.__cbbMetric=b.dataset.cbbMetric;
      if(b.dataset.cbbView)game.__cbbView=b.dataset.cbbView;
      stack.innerHTML=cbbSections('cbb',game);
      host.querySelector('.ca-cbb-controls').outerHTML=cbbControls(game);
      nflSetTab(host,tab);nflSetClub(host,club);
    });
  }

  function deskTabsFor(sport) {
    return sport === 'cbb' ? CBB_TABS : (sport === 'cfb' ? CFB_TABS : (sport === 'nba' ? NBA_TABS : NFL_TABS));
  }

  /* ---------------------------------------------------------------------
   * Strength indices, NFL and CFB (2026-11-18; outputs/strength_index.py):
   * OSI, DSI and NSI, the football members of the MLB index family. Each is
   * fitted at game level to predict later games better than the raw figure
   * beside it, from this season's raw and opponent-adjusted efficiency, last
   * season's, and the margin so far. 100 is the league average and every 10
   * points is one standard deviation, higher always better. The formula for
   * the week shown is printed under the table.
   * ------------------------------------------------------------------ */
  function strengthEntry(e, label, format, better) {
    return e ? { value: e.value, rank: e.rank, of: e.of, label: label, format: format, better: better } : null;
  }

  function strengthIndex(e, label, words) {
    return e ? { value: e.index, rank: e.rank, of: e.of, label: label + ' · ' + words, format: 'num', better: 'high' } : null;
  }

  function strengthFormula(block, unit) {
    var w = block.weights || {}, n = w.nsi || {}, o = w.osi || {};
    function f(x, d) { return Number(x || 0).toFixed(d == null ? 2 : d); }
    var prior = block.prior_season;
    return 'Through week ' + block.week + ' · NSI = ' + f(n.net_adj) + ' × adjusted net ' + unit + ' + ' +
      f(n.p_net) + ' × ' + prior + ' net ' + unit + ' + ' + f(n.net) + ' × net ' + unit + ' + ' + f(n.m1) +
      ' × margin per game · home field ' + f(n.home_field, 1) + ' points · OSI = ' + f(o.off) + ' × ' + unit +
      ' + ' + f(o.off_adj) + ' × adjusted + ' + f(o.p_off) + ' × ' + prior + ' · DSI on the same weights for ' +
      unit + ' allowed (' + f(o.def) + ', ' + f(o.def_adj) + ', ' + f(o.p_def) + ')';
  }

  function strengthBody(sport, game) {
    var away = game.away_strength, home = game.home_strength;
    var awayName = sport === 'cfb' ? cfbName(sport, game, 'away') : fullName(sport, game, 'away');
    var homeName = sport === 'cfb' ? cfbName(sport, game, 'home') : fullName(sport, game, 'home');
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger ca-cfb-h2h ca-strength-panel"><h3>' +
      esc(awayName + ' vs ' + homeName + ' Strength Index') + '</h3>';
    if (!away && !home) return head + pending('Strength indices are not published for this pairing yet.') + '</section>';
    var feed = away || home;
    var unit = sport === 'cfb' ? 'PPA' : 'EPA';
    var cohort = sport === 'cfb' ? 'FBS teams' : 'NFL teams';
    var prior = String(feed.prior_season || '');
    function row(label, pick) {
      var l = pick(away || {}), r = pick(home || {});
      return cfbLedgerRow(label, l && cfbTeamMetric(l, cohort), r && cfbTeamMetric(r, cohort));
    }
    function input(b, key, label, format, better) {
      return strengthEntry((b.inputs || {})[key], label, format, better);
    }
    var groups = [
      { title: 'Index · 100 Is League Average', rows: [
        row('NSI · Net', function (b) { return strengthIndex(b.nsi, 'Net Strength Index', 'points per game against an average team on a neutral field'); }),
        row('OSI · Offense', function (b) { return strengthIndex(b.osi, 'Offensive Strength Index', unit + ' per play expected against an average defense'); }),
        row('DSI · Defense', function (b) { return strengthIndex(b.dsi, 'Defensive Strength Index', unit + ' per play expected to allow an average offense'); })
      ] },
      { title: 'In Points And ' + unit, rows: [
        row('Net Pts/G', function (b) { return strengthEntry(b.nsi, 'Points per game against an average team, neutral field', 'signed', 'high'); }),
        row('Exp ' + unit + '/Play', function (b) { return strengthEntry(b.osi, 'Expected offense ' + unit + ' per play against an average defense', 'ppa', 'high'); }),
        row('Exp ' + unit + ' Allowed', function (b) { return strengthEntry(b.dsi, 'Expected ' + unit + ' per play allowed to an average offense', 'ppa', 'low'); })
      ] },
      { title: 'Inputs', rows: [
        row(unit + '/Play', function (b) { return input(b, 'off', 'Offense ' + unit + ' per play this season', 'ppa', 'high'); }),
        row('Adj ' + unit + '/Play', function (b) { return input(b, 'off_adj', 'Offense ' + unit + ' per play, opponent-adjusted', 'ppa', 'high'); }),
        row(prior + ' ' + unit + '/Play', function (b) { return input(b, 'p_off', 'Offense ' + unit + ' per play last season, opponent-adjusted', 'ppa', 'high'); }),
        row(unit + ' Allowed', function (b) { return input(b, 'def', unit + ' per play allowed this season', 'ppa', 'low'); }),
        row('Adj ' + unit + ' Allowed', function (b) { return input(b, 'def_adj', unit + ' per play allowed, opponent-adjusted', 'ppa', 'low'); }),
        row(prior + ' ' + unit + ' Allowed', function (b) { return input(b, 'p_def', unit + ' per play allowed last season, opponent-adjusted', 'ppa', 'low'); }),
        row('Margin/G', function (b) { return input(b, 'm1', 'Point margin per game this season', 'signed', 'high'); })
      ] }
    ];
    var basis = sport === 'cfb' ? 'FBS Teams' : 'NFL Teams';
    return head + '<p class="ca-lineup-context">' + esc(strengthFormula(feed, unit)) + '</p>' +
      cfbLedgerTable([awayName, 'Away', basis], [homeName, 'Home', basis], groups) + '</section>';
  }

  function cfbSections(sport, game) {
    function quarterbackName(side) {
      var qbs = game[side + '_qbs'] || [];
      if (qbs.length) return (availability.available(game, side, qbs)[0] || {}).player_name;
      return availability.available(game, side, [game[side + '_starter']])[0];
    }
    var meta = game.__cfbPower || {};
    return [
      section('cfb-power', 'Power Ranking', 'Opponent-Adjusted · Points And Play Efficiency · Per Game',
        powerPanel(cfbName(sport, game, 'away') + ' vs ' + cfbName(sport, game, 'home') + ' Power Ranking',
          [[cfbName(sport, game, 'away'), game.away_power], [cfbName(sport, game, 'home'), game.home_power]],
          { cohort: 'FBS', digits: 1, first: 'School', units: 'Points per game',
            caption: meta.through_week ? 'Through week ' + meta.through_week + ' · collegefootballdata.com play-by-play · home field ' +
              powerSigned(meta.home_court || 0, 1) + ' points' : '' })),
      section('cfb-strength', 'Strength Index', 'OSI, DSI And NSI · Fitted To Predict Later Games',
        strengthBody(sport, game)),
      section('cfb-efficiency', 'Efficiency', 'Scoring, Yardage And Per-Play Production',
        nflDuo(cfbLedgerPanel, sport, game, 'efficiency')),
      section('cfb-dvoa', 'SP+ Ratings', 'Opponent-Adjusted Efficiency By Unit',
        cfbDvoaBody(sport, game)),
      section('cfb-predictability', 'Predictability', 'How Often Each Offense Lands Off The FBS Curve',
        predictabilityPanel(cfbName(sport, game, 'away'), cfbName(sport, game, 'home'), game.away_predictability,
          game.home_predictability, meta.through_week ? 'Through week ' + meta.through_week + ' · FBS games' : '')),
      section('cfb-game-log', 'Game Log', 'Every Game, Ranked Against That Week',
        nflDuo(cfbGameLogPanel, sport, game)),
      section('cfb-schedule', 'Schedule Strength', 'FBS Opponents Played And Remaining, Ranked Of FBS',
        cfbScheduleBody(sport, game)),
      section('cfb-availability', 'Injury Report', 'Every Listed Player, Out First',
        nflDuo(cfbInjuryPanel, sport, game)),
      section('cfb-quarterbacks', 'Quarterbacks', 'Season Line And EPA By Situation, Beside The Defense',
        nflDuo(cfbQbPanel, sport, game)),
      section('cfb-pass-map', 'Pass Map', 'Depth, Direction, Air Yards And The Pocket, Offense Against Defense',
        nflDuo(cfbLedgerPanel, sport, game, 'coverage')),
      section('cfb-passing', 'Pass Game', 'Efficiency, Volume, Scoring And Protection',
        nflDuo(cfbLedgerPanel, sport, game, 'passing')),
      section('cfb-receivers', 'Pass Catchers', 'Season Receiving Lines And FBS Receiver Percentiles',
        nflDuo(cfbReceiversPanel, sport, game)),
      section('cfb-rushing', 'Run Game', 'Efficiency, Volume And Line Play',
        nflDuo(cfbLedgerPanel, sport, game, 'rushing')),
      section('cfb-run-direction', 'Run Direction', 'Left, Middle And Right, Against The Defense',
        nflDuo(cfbLedgerPanel, sport, game, 'run_direction')),
      section('cfb-rushers', 'Ball Carriers', 'Season Rushing Lines And FBS Rusher Percentiles',
        nflDuo(cfbRushersPanel, sport, game)),
      section('cfb-defenders', 'Defensive Playmakers', 'Season Defensive Lines And FBS Defender Percentiles',
        nflDuo(cfbDefendersPanel, sport, game)),
      section('cfb-situational', 'Situational', 'Downs, Tempo, Play Mix And Havoc',
        nflDuo(cfbLedgerPanel, sport, game, 'situational')),
      section('cfb-formation', 'Formation And Tempo', 'Shotgun, Under Center And No Huddle',
        nflDuo(cfbLedgerPanel, sport, game, 'formation')),
      section('cfb-special', 'Special Teams', 'Kicking, Returns And Penalties',
        cfbSpecialBody(sport, game)),

      section('radar', 'Team Profile Radar', 'Both Clubs On One Shape, By Percentile',
        radarBody(sport, game)),

      section('recent', 'Recent Results', 'Completed Games, Oldest To Newest',
        '<div class="ca-recent-stack">' +
        recentStrip(sport, game, 'away', game.away_recent || []) +
        recentStrip(sport, game, 'home', game.home_recent || []) + '</div>'),

      section('team-context', 'Venue And Travel', 'Factual Scheduling Context',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', [
          ['Record', value(game.away_record)],
          ['Conference', value(game.away_conference || game.away_conf)],
          ['Quarterback', value(quarterbackName('away'))],
          ['Travel', value(game.away_travel)]
        ]) + teamPanel(sport, game, 'home', [
          ['Record', value(game.home_record)],
          ['Conference', value(game.home_conference || game.home_conf)],
          ['Quarterback', value(quarterbackName('home'))],
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
         ['lineups', 'Vs Hand'], ['pitch-matchup', 'Vs Pitch Mix'], ['bvp', 'Batter Vs Pitcher'],
         ['club-splits', 'Club Splits'], ['recent', 'Last Ten'], ['runs-hand', 'Runs Vs Hand'],
         ['series', 'Series'], ['form', 'Offensive Form'], ['radar', 'Radar'], ['bullpens', 'Bullpens']]
      : sport === 'cfb'
      ? [['overview', 'Overview'], ['clash', 'Matchup'], ['form', 'Comparison'],
         ['radar', 'Radar'], ['recent', 'Recent'],
         ['team-context', 'Venue And Travel']]
      : [['overview', 'Overview'], ['efficiency', 'Units'], ['quarterbacks', 'Passing'],
         ['rushing', 'Rushing'], ['receivers', 'Receiving'], ['redzone', 'Red Zone'],
         ['special-teams', 'Special Teams'], ['tendencies', 'Tendencies'],
         ['availability', 'Lineups'], ['radar', 'Radar'], ['team-context', 'Context']];
    var html = '<a class="ca-detail-back" href="/' + sport + '/">← Back To ' + sport.toUpperCase() + ' Matchups</a>' +
      '<article class="ca-detail-hero" id="overview"><header class="ca-detail-hero__meta">' +
      '<p class="ca-detail-eyebrow">' + sport.toUpperCase() + ' · Matchup Analysis</p>' +
      '</header>' +
      '<div class="ca-detail-hero__teams">' + teamHero(sport, game, 'away') + '<div class="ca-detail-center">' +
      detailCenter(sport, game) + '</div>' + teamHero(sport, game, 'home') + '</div>' +
      // Conditions live in the banner now: they are read once, at the top,
      // beside where and when - not as their own section of dimensions and
      // capacities nobody came for.
      '<div class="ca-detail-facts">' + (sport === 'cbb'
        ? fact('Arena', venue(game)) + fact('Site', game.neutral ? 'Neutral court' : 'Home court') + fact('Broadcast', value(game.broadcast)) + fact('Status', gameStatus(game))
        : sport === 'nba'
        ? fact('Arena', venue(game)) +
          fact('Broadcast', value(game.broadcast)) +
          fact('Rest', (game.away || '') + ' ' + value(game.away_rest_label) + ' · ' +
            (game.home || '') + ' ' + value(game.home_rest_label)) +
          fact('Status', gameStatus(game))
        : sport === 'cfb'
        ? fact('Setting', venue(game)) +
          fact('Stadium', value(game.stadium)) +
          fact('Broadcast', value(game.broadcast)) +
          fact('Status', gameStatus(game))
        : fact('Venue', venue(game)) +
          wxFact(game) + fact('Broadcast', value(game.broadcast)) +
          fact('Status', gameStatus(game))) + '</div>' +
      '</article>' +
      (sport === 'nfl' || sport === 'cfb' || sport === 'nba' || sport === 'cbb'
        ? '<div class="ca-nfl-bar"><nav class="ca-detail-nav ca-nfl-tabs" aria-label="Matchup sections" role="tablist">' +
          deskTabsFor(sport).map(function (tab) {
            var glyph = SECTION_ICON[tab[2][0]] ? ico(SECTION_ICON[tab[2][0]], 'ca-detail-nav__ico', 14) : '';
            return '<a href="#' + tab[0] + '" role="tab" data-nfl-tab="' + tab[0] + '" aria-selected="false">' +
              glyph + esc(tab[1]) + '</a>';
          }).join('') + '</nav>' + nflClubSwitch(sport, game) + '</div>' +
          (sport === 'nfl' ? seasonToggle(game) : sport === 'cbb' ? cbbControls(game) : sport === 'nba' ? nbaControls(game) : '')
        : '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
          var glyph = item[0] === 'overview' ? ico('info', 'ca-detail-nav__ico', 14)
            : (SECTION_ICON[item[0]] ? ico(SECTION_ICON[item[0]], 'ca-detail-nav__ico', 14) : '');
          return '<a href="#' + item[0] + '">' + glyph + item[1] + '</a>';
        }).join('') + '</nav>') +
      '<div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra)
        : sport === 'cfb' ? cfbSections(sport, game)
        : sport === 'cbb' ? cbbSections(sport, game)
        : sport === 'nba' ? nbaOrdered(nbaSections(sport, game))
        : nflSections(sport, game, (result && result.games) || [])) +
      '</div>';
    host.innerHTML = html;
    host.__deskTabs = deskTabsFor(sport);
    if (sport === 'nba' && host.style && host.style.setProperty) {
      var pair = nbaPair(game);
      host.style.setProperty('--nba-away', pair.away || 'var(--viz-away)');
      host.style.setProperty('--nba-home', pair.home || 'var(--viz-home)');
    }
    if (sport === 'nfl' || sport === 'cfb' || sport === 'nba' || sport === 'cbb') nflInitDesk(host);
    host.setAttribute('data-state', 'ready');
    host.__caRadar = { sport: sport, game: game };
    fitRadar(host);
    // Delegated once on the host, so a repainted section keeps working.
    if (!host.dataset.seasonWired) {
      if (sport === 'cbb') wireCbbControls(host,game);
      if (sport === 'nba') wireNbaControls(host,game);
      wireSeasonToggle(host);
      wireLineupTabs(host);
      wireRadarReadout(host);
      wirePitchMetric(host);
      wireBvpView(host);
      wireFormSplit(host);
      wireRunsHand(host);
      if (sport === 'nfl' || sport === 'cfb' || sport === 'nba' || sport === 'cbb') wireNflDesk(host);
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
      // A newly listed CBB fixture may arrive in the scoreboard before the daily export.
      if (sport === 'cbb' && requested && result.statusReady &&
          !result.games.some(function (game) { return String(game.id) === requested; })) return result.statusReady;
      return result;
    }).then(function (result) {
      var game = result.games.find(function (candidate) {
        return String(candidate.id) === String(requested) || String(candidate.game_pk || '') === String(requested) ||
          (candidate.public_game_id && String(candidate.public_game_id) === String(requested));
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
      if (result.availabilityReady) result.availabilityReady.then(function() {
        paintSection(host, 'cbb-availability', nflDuo(cbbAvailability, sport, game));
        if (game.cbbDetailReady) paintSection(host, 'cbb-rotation', nflDuo(cbbRotation, sport, game));
      });
      if (result.statusReady) result.statusReady.then(function(updated){
        if(!updated.statusObservedAt)return;
        if (sport === 'cbb' && (game.away_cbb || game.home_cbb)) {
          paintSection(host,'cbb-game-log',cbbGameLogs(sport,game));
        }
        var center=host.querySelector('.ca-detail-center');
        if(center)center.innerHTML=detailCenter(sport,game);
        ['away','home'].forEach(function(side){
          var team=host.querySelector('.ca-detail-team--'+side);
          if(team)team.outerHTML=teamHero(sport,game,side);
        });
        var status=host.querySelector('.ca-detail-facts .ca-detail-fact:last-child strong');if(status)status.textContent=gameStatus(game);
      });
      return ((sport === 'cbb' || sport === 'nba' || sport === 'nfl') && adapter.detail ? adapter.detail(game) : Promise.resolve(game)).then(function () {
      if (sport === 'nfl') {
        var coverageBody=host.querySelector('[data-body="coverage"]');
        if(coverageBody) coverageBody.insertAdjacentHTML('beforeend',nflFilmCoverage(game));
      }
      if (sport === 'nba') repaintNba(host,game);
      if (sport === 'cbb') {
        function repaintCbbEvidence() {
          var stack=host.querySelector('.ca-detail-stack'),tab=stack.getAttribute('data-nfl-tab'),club=stack.getAttribute('data-club');
          stack.innerHTML=cbbSections(sport,game);nflSetTab(host,tab);nflSetClub(host,club);
          // The controls carry the evidence's through-dates, known once the teams load.
          var controls=host.querySelector('.ca-cbb-controls');
          if(controls)controls.outerHTML=cbbControls(game);
        }
        host.querySelector('.ca-nfl-club').outerHTML=nflClubSwitch(sport,game);
        repaintCbbEvidence();
        if (game.cbbRanksReady && !game.cbbRanksLoaded) game.cbbRanksReady.then(function (loaded) { if (loaded) repaintCbbEvidence(); });
      }


      if (sport === 'mlb') {
        var dateIso = result.dateIso || params().get('date') ||
          String(game.kickoff_utc || '').slice(0, 10);
        var season = seasonOf(dateIso || game.kickoff_utc);

        var repaintStarters = function () {
          paintSection(host, 'starters', startersBody(sport, game, extra));
          paintSection(host, 'lineups', lineupsBody(sport, game, extra));
          paintSection(host, 'arsenal', arsenalBody(sport, game, extra));
          paintSection(host, 'pitch-matchup', pitchMatchupBody(sport, game, extra));
        };
        var repaintPitchMatchup = function () {
          paintSection(host, 'pitch-matchup', pitchMatchupBody(sport, game, extra));
          paintSection(host, 'bvp', bvpBody(sport, game, extra));
        };

        // Stage 1 - everyone named on the card, in one request per group.
        var hitterIds = [];
        ['away_lineup', 'home_lineup'].forEach(function (key) {
          (game[key] || []).forEach(function (pl) { if (lineupId(pl)) hitterIds.push(lineupId(pl)); });
        });
        var armIds = [game.away_starter_id, game.home_starter_id].filter(Boolean);
        // Each lineup is fetched against the hand it will actually face, so the
        // two orders can be on different splits within the same game.
        var awayIds = (game.away_lineup || []).map(lineupId).filter(Boolean);
        var homeIds = (game.home_lineup || []).map(lineupId).filter(Boolean);
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
          // Each order's career line against the arm it faces. When no order
          // is posted, the active roster's regulars stand in for it.
          ['away', 'home'].forEach(function (side) {
            var opp = side === 'away' ? 'home' : 'away';
            var posted = (game[side + '_lineup'] || []).map(lineupId).filter(Boolean);
            var ids = posted.length ? Promise.resolve(posted)
              : loadRosterHitters(game[side + '_team_id'], dateIso, season).then(function (list) {
                  extra[side + 'RosterHitters'] = list || [];
                  repaintPitchMatchup();
                  var ids = (list || []).map(function (h) { return h.id; });
                  var arm = extra.people[game[opp + '_starter_id']] || {};
                  loadPeople(ids, 'hitting', season,
                    sit(arm.throws || String(game[opp + '_hand'] || '').toUpperCase()))
                    .then(function (batch) {
                      Object.keys(batch).forEach(function (id) { extra.people[id] = batch[id]; });
                      paintSection(host, 'lineups', lineupsBody(sport, game, extra));
                    });
                  return ids;
                });
            ids.then(function (list) {
              return loadVsPitcher(list, game[opp + '_starter_id']);
            }).then(function (lines) {
              extra[side + 'VsStarter'] = lines || {};
              repaintPitchMatchup();
            });
          });
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
          paintSection(host, 'form', formBody(sport, game, extra));
          paintSection(host, 'radar', radarBody(sport, game));
          paintSection(host, 'recent', recentBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
          paintSection(host, 'club-splits', teamSplitsBody(sport, game, extra));
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
          repaintPitchMatchup();
          paintSection(host, 'bullpens', bullpenBody(sport, game, extra));
        }).catch(function () { /* the section keeps its pending note */ });

        Promise.all([loadIndexSplits(), loadLeagueTeamSplits(season)]).then(function (found) {
          extra.indexSplits = found[0];
          extra.leagueSplits = found[1];
          paintSection(host, 'club-splits', teamSplitsBody(sport, game, extra));
          paintSection(host, 'form', formBody(sport, game, extra));
        });

        loadBatterPitch().then(function (found) {
          extra.batterPitch = found;
          repaintPitchMatchup();
        });

        loadRunsByHand().then(function (found) {
          extra.runsByHand = found;
          paintSection(host, 'runs-hand', runsHandBody(sport, game, extra));
        });

        loadSeries(game, season).then(function (found) {
          extra.series = found;
          paintSection(host, 'series', seriesBody(sport, game, extra));
        });

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
          loadActiveBullpen(game.home_team_id, season, 'h', dateIso, game.home_starter_id),
          loadBullpenBoard()
        ]).then(function (reports) {
          extra.bullpenBoard = reports[4];
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
      if (sport === 'nba') {
        fetchJson('/data/public/nba/predictability.json').catch(function () { return null; }).then(function (data) {
          game.__nbaPredictability = data;
          paintSection(host, 'nba-predictability', nbaPredictabilityBody(sport, game));
        });
        fetchJson('/data/public/nba/power.json').catch(function () { return null; }).then(function (data) {
          game.__nbaPower = data;
          paintSection(host, 'nba-power', nbaPowerBody(sport, game));
          paintSection(host, 'nba-game-log', nbaGameLogs(sport, game));
        });
      }
      if (sport === 'nfl') {
        loadNflPositionCoverage().then(function (data) {
          paintSection(host, 'position-coverage', nflPosCovBody(sport, game, data));
          // Keep the season window the reader has chosen while it loaded.
          var scope = host.getAttribute('data-season-scope');
          if (scope) {
            Array.prototype.forEach.call(host.querySelectorAll('[data-body="position-coverage"] [data-season-view]'),
              function (node) { node.hidden = node.getAttribute('data-season-view') !== scope; });
          }
        });
        loadNflGameLogs().then(function (logs) {
          paintSection(host, 'game-log', nflGameLogBody(sport, game, logs));
          paintSection(host, 'predictability', nflPredictabilityBody(sport, game, logs));
          paintSection(host, 'power', nflPowerBody(sport, game, logs));
        });
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
      });
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
