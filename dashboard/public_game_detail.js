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
    availability: 'whistle', scheme: 'football', 'team-context': 'plane', 'run-game': 'football',
    'def-tendencies': 'target',
    projection: 'target', clash: 'football', players: 'users',
    efficiency: 'trend', quarterbacks: 'football', coverage: 'target', looks: 'target',
    rushing: 'football', trenches: 'users', receivers: 'users', redzone: 'target',
    tendencies: 'lineup'
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

  // The rank pill for either shape a place comes in: {rank, of} or {place, of}.
  function nflBadge(r) {
    return r ? rankBadge({ rank: r.rank != null ? r.rank : r.place, of: r.of }) : '';
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
      teamSplitPanel(sport, game, 'home', extra.homeTeamSplits) + '</div>';
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
      arsenalPanel(sport, game, 'home', people, extra.homeArsenal, extra.pitchBoard, extra.runValue) + '</div>';
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

  function formBody(sport, game) {
    var mirror = mirrorTable(sport, game, FORM_KEYS, STAT_SPECS, function (g, side) {
      return g[side + '_context'];
    });
    // When the form was published is a freshness stamp, not an explanation.
    return (mirror || '<div class="ca-detail-duo">' +
      formPanel(sport, game, 'away') +
      formPanel(sport, game, 'home') + '</div>') +
      (game.context_generated_at
        ? pending('Team form as published ' + publishedTime(game.context_generated_at) + '.') : '');
  }

  function bullpenBody(sport, game, extra) {
    return '<div class="ca-bullpen-subsection"><header class="ca-bullpen-subhead"><div>' +
      '<p>Active Pen</p><h3>Season Quality And Matchup Splits</h3></div>' +
      '<span>Game-day roster</span></header>' + bullpenQualityBody(sport, game, extra) +
      '</div>' +
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

  function safeTotal() {
    var total = 0, seen = false;
    for (var i = 0; i < arguments.length; i++) {
      var n = Number(arguments[i]);
      if (isFinite(n)) { total += n; seen = true; }
    }
    return seen ? total : null;
  }

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
  var nflPool = null;

  function nflLeaguePool(games) {
    var teams = {};
    (games || []).forEach(function (g) {
      ['away', 'home'].forEach(function (side) {
        if (!g || !g[side] || !g[side + '_scheme']) return;
        teams[g[side]] = {
          scheme: g[side + '_scheme'],
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

  // Every value the slate pool yields for one field.
  function nflPoolValues(read) {
    if (!nflPool) return [];
    var out = [];
    Object.keys(nflPool).forEach(function (team) {
      var v = read(nflPool[team]);
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        if (x != null && isFinite(Number(x))) out.push(Number(x));
      });
    });
    return out;
  }

  // A value's place in a pool (1st = highest when hi, lowest otherwise).
  function nflPlace(values, raw, hi) {
    if (raw == null || !isFinite(Number(raw)) || values.length < 8) return null;
    var v = Number(raw);
    var ahead = values.filter(function (x) { return hi ? x > v : x < v; }).length;
    // A value from outside the pool (a thin sample) that trails all of it is last.
    return { rank: Math.min(ahead + 1, values.length), of: values.length };
  }

  // A graded cell: tier colour from its place, the place on hover. A thin
  // sample prints the number and takes no colour.
  function nflPlacedTd(html, place, thin) {
    var tone = place && !thin ? rankTone(place.rank, place.of) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + (thin ? ' is-low-cell' : '') + '"' +
      (thin ? ' title="Thin sample: printed, not graded"'
        : (place ? ' title="' + place.rank + ordinal(place.rank) + ' of ' + place.of + '"' : '')) + '>' +
      html + (thin ? '' : nflBadge(place)) + '</td>';
  }

  // A published {place, of} read as a frequency place for the league marker.
  function nflAsFreq(place) {
    return place ? { place: place.rank, of: place.of } : null;
  }

  function nflResponse(scheme, phase) {
    return (((scheme || {})[phase] || {}).response) || {};
  }

  /* A situational EPA placed among the clubs that publish the same field. With
     fewer than twenty clubs in the pool (a bye-heavy week, a partial slate) the
     league mean and spread published with the scheme stand in, which is the
     estimate the page has always used. */
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
    if (raw == null || !isFinite(Number(raw))) return null;
    var v = Number(raw);
    var hi = phase === 'offense';
    if (nflPool) {
      var pool = Object.keys(nflPool).map(function (team) {
        return nflResponse(nflPool[team][nflWindow.pool], phase)[key];
      }).filter(function (x) { return x != null && isFinite(Number(x)); }).map(Number);
      if (pool.length >= 20) {
        var ahead = pool.filter(function (x) { return hi ? x > v : x < v; }).length;
        return { rank: ahead + 1, of: pool.length };
      }
    }
    var est = responseEntry(scheme, phase, key, v);
    return est && est.rank ? { rank: est.rank, of: est.of } : null;
  }

  /* How often, against the league: an up arrow when this club does it more
     than most clubs, a down arrow when less, a dash in the middle band. The
     band is the site's own middle tier (|percentile - 0.5| < 0.13, about 13th
     to 20th of 32), so an arrow means the same distance from average as a
     coloured grade does: up green, down red, the middle band a yellow dash.
     Read from the published league_frequency_ranks (place 1 = most). */
  function nflFreqRank(scheme, phase, group, key) {
    return (((((scheme || {}).league_frequency_ranks || {})[phase] || {})[group] || {})[key]) || null;
  }

  function nflFreqMark(rank, invert) {
    if (!rank || !(rank.of > 1) || !(rank.place >= 1)) return '';
    var p = (rank.of - rank.place) / (rank.of - 1);
    if (invert) p = 1 - p;
    var d = p - 0.5;
    var cls = Math.abs(d) < 0.13 ? 'is-avg' : (d > 0 ? 'is-up' : 'is-down');
    var glyph = cls === 'is-up' ? '\u25b2' : (cls === 'is-down' ? '\u25bc' : '\u2013');
    var place = invert ? rank.of + 1 - rank.place : rank.place;
    var words = (cls === 'is-up' ? 'Above' : (cls === 'is-down' ? 'Below' : 'Near')) +
      ' league average ' + '\u00b7' + ' ' + place + ordinal(place) + ' most of ' + rank.of;
    return '<span class="ca-freq-mark ' + cls + '" title="' + esc(words) + '" aria-label="' +
      esc(words) + '">' + glyph + '</span>';
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
  function nflResultCell(raw, entry, own, isRate) {
    if (raw == null || !isFinite(Number(raw))) return '<td class="num">&mdash;</td>';
    var tone = entry ? rankTone(entry.rank, entry.of) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + '">' +
      esc(epaText(raw, isRate)) + rankBadge(entry) + '</td>';
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
      ? nflDefendersTable(game[defSide + '_defenders_current']) : '';
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
      return nflPoolValues(function (t) {
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
          (thin ? '' : nflFreqMark(nflAsFreq(adotPlace)))) + '</td></tr>';
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
  function nflLookResult(raw, entry, own) {
    return raw == null ? '<td class="num is-low-cell">No plays</td>' : nflResultCell(raw, entry, own);
  }

  function nflLooksPanel(sport, game, defSide) {
    var offSide = nflOther(defSide);
    var dScheme = nflScheme(game, defSide);
    var oScheme = nflScheme(game, offSide);
    var unit = dScheme.defense || {};
    var allowed = nflResponse(dScheme, 'defense');
    var faced = nflResponse(oScheme, 'offense');
    var head = '<section class="ca-arsenal-panel"><h3>' +
      esc(nflVs(sport, game, defSide, 'Defense', 'Offense')) + '</h3>';
    var rows = NFL_LOOKS.map(function (spec) {
      var rate = (unit[spec[1]] || {})[spec[2]];
      // Usage alone lives in Defensive Tendencies; this table is results.
      if (allowed[spec[3]] == null && faced[spec[3]] == null) return '';
      return '<tr><td class="ca-lineup-name">' + esc(spec[0]) + '</td>' +
        nflUsageCell(rate, nflFreqRank(dScheme, 'defense', spec[1], spec[2])) +
        nflLookResult(allowed[spec[3]], nflResultRank(dScheme, 'defense', spec[3], allowed[spec[3]]), true) +
        nflLookResult(faced[spec[3]], nflResultRank(oScheme, 'offense', spec[3], faced[spec[3]]), false) +
        '</tr>';
    }).filter(Boolean);
    if (!rows.length) return head + pending('Defensive charting is not published for this club.') + '</section>';
    var box = (unit.pressure || {}).avg_box;
    return head + '<p class="ca-lineup-context">' +
      esc([box != null ? 'Average box ' + Number(box).toFixed(1) + ' defenders' : '',
        nflSampleLabel(dScheme, true)].filter(Boolean).join(' · ') || 'Charted defensive snaps') +
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
    var rows = NFL_TENDENCIES.map(function (spec) {
      if (mine[spec[1]] == null) return '';
      return '<tr><td class="ca-lineup-name">' + esc(spec[0]) + '</td>' +
        nflUsageCell(mine[spec[1]], nflFreqRank(oScheme, 'offense', 'personnel', spec[1])) +
        nflRateCell(seen[spec[1]], nflFreqRank(dScheme, 'defense', 'personnel', spec[1])) + '</tr>';
    }).filter(Boolean);
    if (!rows.length) return head + pending('Offensive tendencies are not published for this club.') + '</section>';
    var stats = game[offSide + '_team_stats'] || {};
    var pace = stats.offensive_plays_per_game;
    return head + '<p class="ca-lineup-context">' +
      esc([pace != null ? Number(pace).toFixed(1) + ' plays per game' : '',
        nflSampleLabel(oScheme, false)].filter(Boolean).join(' · ') || 'Charted offensive snaps') + '</p>' +
      nflMixTable('Tendency', [fullName(sport, game, defSide) + ' Faced'], rows) + '</section>';
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
      esc(nflSampleLabel(dScheme, true) || 'Charted defensive snaps') + '</p>' +
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
      },
      metrics: [['completion_rate', true], ['yards_per_attempt', true], ['epa_per_dropback', true], ['success_rate', true]],
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
      weighted: [['epa_per_target', 'targets']],
      derive: function (t) {
        t.catch_rate = t.targets ? t.receptions / t.targets : null;
        t.yards_per_target = t.targets ? t.receiving_yards / t.targets : null;
      },
      metrics: [['catch_rate', true], ['yards_per_target', true], ['epa_per_target', true]],
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

  // Both views of one block: combined shown, current-season held back.
  function nflSeasonViews(combined, current) {
    return '<div data-season-view="combined">' + combined + '</div>' +
      '<div data-season-view="current" hidden>' + current + '</div>';
  }

  /* ---- starter panels: the quarterback and the lead back ---- */

  function nflStarter(game, side, position) {
    var unit = unitData(game, side, 'offense') || {};
    var hit = (unit.players || []).filter(function (p) {
      return String(p.position || '').toUpperCase() === position;
    })[0];
    if (hit) return hit;
    return (game[side + '_players'] || []).filter(function (p) {
      return String(p.position || '').toUpperCase() === position;
    })[0] || null;
  }

  function nflAvailability(game, side) {
    var out = {};
    (game[side + '_availability_list'] || []).forEach(function (entry) {
      out[playerNameKey(entry.name)] = entry;
    });
    return out;
  }

  function nflStatusText(entry) {
    if (!entry) return '';
    var st = String(entry.status || '');
    return st === 'Injured Reserve' ? 'IR' : st;
  }

  var NFL_BACK = {
    QB: {
      family: 'passing', volume: 'dropbacks', unit: 'Dropbacks', minimum: 10, floor: 10, opponent: true,
      groups: [
        ['Coverage', ['man', 'zone', 'team_man', 'team_zone', 'single_high', 'two_high']],
        ['Pass Rush', ['blitz', 'no_blitz', 'pressure', 'clean']],
        ['Box', ['light_box', 'stacked_box']],
        ['Shells', ['cover_0', 'cover_1', 'cover_2', 'cover_2_man', 'cover_3', 'cover_4', 'cover_6']]
      ],
      cols: [['dropbacks', 'DB', null, 'int'], ['completion_rate', 'Cmp%', 'completion_rate', 'pct'],
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
    cover_3: 'Cover 3', cover_4: 'Cover 4', cover_6: 'Cover 6'
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
    cover_6: ['coverage', 'cover_6_rate']
  };

  function nflOppShows(oppDefense, look) {
    var inverse = { no_blitz: 'blitz', clean: 'pressure' }[look];
    var spec = NFL_LOOK_RATE[inverse || look];
    if (!spec || !oppDefense) return null;
    var v = (oppDefense[spec[0]] || {})[spec[1]];
    if (v == null || !isFinite(Number(v))) return null;
    return inverse ? 1 - Number(v) : Number(v);
  }

  // The same look's league place for the opponent; a complement (no blitz,
  // clean pocket) reads its source rate's place turned over.
  function nflOppShowsMark(oppScheme, look) {
    var inverse = { no_blitz: 'blitz', clean: 'pressure' }[look];
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
            nflBadge(rank) + '</td>';
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
          return '<tr><td>' + esc(NFL_LOOK_LABEL[r.look] || r.look) + '</td>' +
            '<td class="num">' + esc(String(r.dropbacks)) + '</td>' +
            '<td class="num' + (rank ? ' ' + nflRankTone(rank) : '') + '"' +
            (rank ? ' title="' + rank.place + ordinal(rank.place) + ' of ' + rank.of +
              (ofOffenses ? ' offenses' : ' at his position') + '"' : '') + '>' +
            esc(nflFormat(r.epa_per_dropback, 'epa')) + nflBadge(rank) + '</td>' +
            (epaShow ? '<td class="num ca-opp-shows">' + (shows == null ? '' :
              esc(pctText(shows)) + nflOppShowsMark(opp.scheme, r.look)) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    if (!main && !coverage) return '';
    return nflSplitWrap(title, coverage + main, '');
  }

  function nflBackPanel(sport, game, side, position) {
    var spec = NFL_BACK[position];
    var starter = nflStarter(game, side, position);
    var name = starter ? starter.name : (position === 'QB' ? game[side + '_starter'] : null);
    var key = playerNameKey(name);
    var profiles = (game[side + '_player_scheme'] || []).filter(function (p) {
      return p.play_family === spec.family && playerNameKey(p.player_name) === key;
    }).sort(function (a, b) { return Number(b.source_season) - Number(a.source_season); });
    function statsFor(rows) {
      return (rows || []).filter(function (p) { return playerNameKey(p.player_name) === key; })[0] || null;
    }
    var stats = statsFor(game[side + '_player_stats']);
    var prior = statsFor(game[side + '_player_stats_prior']);
    var status = nflAvailability(game, side)[key];
    var shot = starter && starter.headshot_url
      ? '<img class="ca-starter-shot" src="' + esc(starter.headshot_url) + '" width="72" height="72" alt="' +
        esc(name || '') + '" loading="lazy" decoding="async">' : '';
    var head = '<section class="ca-starter-panel"><header class="ca-starter-head">' + shot +
      '<div><p class="ca-starter-team">' +
      esc(nflVs(sport, game, side, position, position === 'RB' ? 'Run Defense' : 'Defense')) +
      (status ? ' · ' + esc(nflStatusText(status)) : '') + '</p>' +
      '<h3 class="ca-starter-name">' + esc(name || 'Starter Not Published') + '</h3></div></header>';
    if (!name) return head + pending('No ' + position + ' is published on the depth chart.') + '</section>';

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
          esc(nflFormat(raw, kind)) + nflBadge(rank) + '</strong></div>';
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
          valueHtml + nflBadge(r) + '</strong></div>';
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
              trackRanks.pressure_rate, true) : '')
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
            nflFreqMark(trackRanks.eight_plus_box_rate) : '') + '</p>';
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
    var tone = entry.rank ? rankTone(entry.rank, entry.of || 32) : '';
    return '<td class="num' + (tone ? ' ' + tone : '') + '" title="' +
      esc((entry.label || '') + (entry.rank ? ' · ' + entry.rank + ordinal(entry.rank) +
        ' of ' + (entry.of || 32) : '')) + '">' + esc(nflFormat(entry.value, kind)) +
      (entry.rank ? nflBadge({ rank: entry.rank, of: entry.of || 32 }) : '') + '</td>';
  }

  function nflSplitTable(heads, rows, first) {
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-split-table ca-nfl-split"><thead><tr><th>' +
      esc(first || 'Unit') + '</th>' +
      heads.map(function (h) { return '<th class="num">' + esc(h) + '</th>'; }).join('') +
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
    function unitRow(label, unit) {
      unit = unit || {};
      var ranks = unit.ranks || {};
      return '<tr><td>' + esc(label) + '</td>' + NFL_RUN_UNIT.map(function (m) {
        return nflGradedCell(unit[m[0]] == null ? null : {
          value: unit[m[0]], rank: (ranks[m[0]] || {}).place, of: (ranks[m[0]] || {}).of, label: m[1]
        }, m[2]);
      }).join('') + '</tr>';
    }
    var off = mine.offense || {}, def = theirs.defense || {};
    var sample = [seasons.join(' + '),
      off.games ? off.games + ' games' : '', off.carries ? off.carries + ' designed runs' : ''
    ].filter(Boolean).join(' · ');
    var html = head + (sample ? '<p class="ca-lineup-context">' + esc(sample) + '</p>' : '') +
      nflSplitTable(NFL_RUN_UNIT.map(function (m) { return m[1]; }), [
        unitRow(oNick + ' Run Game', off),
        unitRow(dNick + ' Run Defense', def)
      ]);

    // Every ball carrier, graded among the slate's carriers in this window.
    var floor = win === 'current' ? 10 : 30;
    function pool(key) {
      return nflPoolValues(function (t) {
        return (((t.runGame || {})[win] || {}).carriers || [])
          .filter(function (c) { return c.carries >= floor; })
          .map(function (c) { return c[key]; });
      });
    }
    var pools = { yards_per_carry: pool('yards_per_carry'), epa_per_carry: pool('epa_per_carry'),
      success_rate: pool('success_rate') };
    var carriers = (mine.carriers || []).filter(function (c) { return c.carries > 0; });
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

  /* One possession: the offense's row directly above the row of the defense
     it meets, under the same columns. The reader compares down one column;
     the page never says which way it points. */
  function nflDrivePanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oRates = (game[offSide + '_form'] || {}).rates || {};
    var dRates = (game[defSide + '_form'] || {}).rates || {};
    var oScheme = game[offSide + '_scheme'] || {};
    var dScheme = game[defSide + '_scheme'] || {};
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' + esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) +
      '</h3>' + nflSeasonNote(game);
    if (!Object.keys(oRates).length && !Object.keys(dRates).length) {
      return head + pending('Team form is not published yet.') + '</section>';
    }
    function formRow(label, rates, prefix) {
      return '<tr><td>' + esc(label) + '</td>' +
        nflGradedCell(rates[prefix + 'epa'], 'epa') + nflGradedCell(rates[prefix + 'first_down'], 'pct') +
        nflGradedCell(rates[prefix + 'explosive'], 'pct') + nflGradedCell(rates[prefix + 'sack'], 'pct') +
        nflGradedCell(rates[prefix + 'turnover'], 'pct') + '</tr>';
    }
    var html = head + nflSplitTable(['EPA/Play', '1st Down', 'Explosive', 'Sack', 'Turnover'], [
      formRow(oNick + ' Offense', oRates, 'off_'),
      formRow(dNick + ' Defense', dRates, 'def_')
    ]);

    // Pass and run, from the charted scheme sample (its own season window).
    var SPLIT = [['pass_epa', 'epa'], ['pass_success_rate', 'pct'], ['rush_epa', 'epa'],
      ['rush_success_rate', 'pct'], ['pass_epa_play_action', 'epa']];
    function schemeRow(label, scheme, phase) {
      var resp = nflResponse(scheme, phase);
      return '<tr><td>' + esc(label) + '</td>' + SPLIT.map(function (col) {
        var raw = resp[col[0]];
        if (raw == null) return '<td class="num">&mdash;</td>';
        var rank = nflResultRank(scheme, phase, col[0], raw);
        var tone = rank ? rankTone(rank.rank, rank.of) : '';
        return '<td class="num' + (tone ? ' ' + tone : '') + '"' +
          (rank ? ' title="' + rank.rank + ordinal(rank.rank) + ' of ' + rank.of + '"' : '') + '>' +
          esc(epaText(raw, col[1] === 'pct')) + nflBadge(rank) + '</td>';
      }).join('') + '</tr>';
    }
    html += nflBothWindows(function () {
      var o = nflScheme(game, offSide), d = nflScheme(game, defSide);
      var seasons = (o.source_seasons || []).join(' + ');
      if (!Object.keys(o).length && !Object.keys(d).length) return '';
      return '<div class="ca-split-block"><h4>Pass And Run' +
        (seasons ? ' · ' + esc(seasons) + ' Charting' : '') + '</h4>' +
        nflSplitTable(['Pass EPA', 'Pass Succ', 'Rush EPA', 'Rush Succ', 'PA EPA'], [
          schemeRow(oNick + ' Offense', o, 'offense'),
          schemeRow(dNick + ' Defense', d, 'defense')
        ]) + '</div>';
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
        var pool = nflPoolValues(function (t) {
          return perGame(prior ? nflCombineTeam(t.stats, t.statsPrior) : (t.stats || {}), read);
        });
        return nflPlacedTd(v.toFixed(1), nflPlace(pool, v, true));
      }
      var pace = stats.offensive_plays_per_game;
      var pacePlace = prior
        ? nflAsFreq(nflPlace(nflPoolValues(function (t) {
            var c = nflCombineTeam(t.stats, t.statsPrior); return c && c.offensive_plays_per_game; }), pace, true))
        : (stats.offensive_pace_rank ? { place: stats.offensive_pace_rank, of: stats.offensive_pace_of || 32 } : null);
      html += '<div class="ca-split-block"><h4>' + esc(oNick + ' Per Game · ' + windowLabel + ' · ' + g + ' Games') + '</h4>' +
        nflSplitTable(['Pass Yds', 'Rush Yds', 'TD', '1st Downs', 'Plays'], [
          '<tr><td>Offense</td>' +
          perCell(function (st) { return st.passing_yards; }) +
          perCell(function (st) { return st.rushing_yards; }) +
          perCell(function (st) { return safeTotal(st.passing_tds, st.rushing_tds); }) +
          perCell(function (st) { return safeTotal(st.passing_first_downs, st.rushing_first_downs); }) +
          '<td class="num">' + (pace == null ? '—' : esc(Number(pace).toFixed(1)) +
            nflFreqMark(pacePlace)) + '</td></tr>']) + '</div>';
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
    ['left', 'lane_left', 'Run Left'], ['middle', 'lane_middle', 'Run Middle'],
    ['right', 'lane_right', 'Run Right'], ['gap_guard', 'gap_guard', 'At The Guards'],
    ['gap_tackle', 'gap_tackle', 'At The Tackles'], ['gap_end', 'gap_end', 'Outside The Ends']
  ];

  /* The lead back's direction splits for this possession. The current season
     once it holds a real sample, otherwise the latest season that does, and
     the heading always says which one it is. */
  function nflRunProfile(game, side) {
    var back = nflStarter(game, side, 'RB');
    if (!back) return null;
    var key = playerNameKey(back.name);
    var seasons = (game[side + '_player_scheme'] || []).filter(function (p) {
      return p.play_family === 'rushing' && playerNameKey(p.player_name) === key;
    }).sort(function (a, b) { return Number(b.source_season) - Number(a.source_season); });
    function carries(p) {
      return Number(((p.splits || []).filter(function (s) { return s.look === 'all'; })[0] || {}).carries) || 0;
    }
    return seasons.filter(function (p) { return carries(p) >= 40; })[0] || seasons[0] || null;
  }

  /* One possession in the trenches: this offense's line directly above the
     front it meets, then the run game by direction in the Pitch Mix shape -
     where the back goes, what he has done there, what the front has allowed
     there. */
  function nflTrenchPanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oLine = (game[offSide + '_line_stats'] || {}).offense;
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

    var front = dLine.defense_run_front || {};
    var profile = nflRunProfile(game, offSide);
    var looks = {};
    ((profile && profile.splits) || []).forEach(function (s) { looks[s.look] = s; });
    var all = looks.all || {};
    var season = profile ? profile.source_season : null;
    // How much of a back's work goes each way, for every back on the slate in
    // the same season with a real sample: the pool behind the usage marker.
    function shareOf(p, look) {
      var ls = {};
      (p.splits || []).forEach(function (x) { ls[x.look] = x; });
      var total = Number((ls.all || {}).carries) || 0;
      return total >= 15 && ls[look] ? Number(ls[look].carries) / total : null;
    }
    var rows = NFL_LANES.map(function (lane) {
      var mine = looks[lane[0]], theirs = front[lane[1]];
      if (!mine && !theirs) return '';
      var share = mine && all.carries ? Number(mine.carries) / Number(all.carries) : null;
      var sharePool = nflPoolValues(function (t) {
        return (t.backs || []).filter(function (p) {
          return p.play_family === 'rushing' && p.source_season === season;
        }).map(function (p) { return shareOf(p, lane[0]); });
      });
      function ypc(value, carries) {
        var low = Number(carries) < 5;
        return nflFormat(value, 'num1') + (low ? ' <small class="is-low" title="Under 5 carries">' +
          esc(carries) + '</small>' : '');
      }
      // The back's YPC in this lane is placed among backs in the same lane
      // (published); the front's YPC and stuff rate among the clubs' fronts.
      var mineRank = mine && (mine.league_ranks || {}).yards_per_carry;
      var frontYpc = nflPoolValues(function (t) {
        return (((t.line || {}).defense_run_front || {})[lane[1]] || {}).yards_per_carry_allowed;
      });
      var frontStuff = nflPoolValues(function (t) {
        return (((t.line || {}).defense_run_front || {})[lane[1]] || {}).stuff_rate;
      });
      var thinTheirs = theirs && Number(theirs.carries) < 5;
      return '<tr><td class="ca-lineup-name">' + esc(lane[2]) + '</td>' +
        nflUsageCell(share, nflAsFreq(nflPlace(sharePool, share, true))) +
        (mine ? nflPlacedTd(ypc(mine.yards_per_carry, mine.carries),
          mineRank ? { rank: mineRank.place, of: mineRank.of } : null, Number(mine.carries) < 5)
          : '<td class="num">—</td>') +
        (theirs ? nflPlacedTd(ypc(theirs.yards_per_carry_allowed, theirs.carries),
          nflPlace(frontYpc, theirs.yards_per_carry_allowed, false), thinTheirs)
          : '<td class="num">—</td>') +
        (theirs ? nflPlacedTd(esc(nflFormat(theirs.stuff_rate, 'pct')),
          nflPlace(frontStuff, theirs.stuff_rate, true), thinTheirs)
          : '<td class="num">—</td>') + '</tr>';
    }).filter(Boolean);
    if (rows.length) {
      var who = profile ? profile.player_name + ' ' + profile.source_season : 'Lead back';
      html += '<div class="ca-split-block"><h4>Run Direction</h4>' +
        '<p class="ca-lineup-context">' + esc(who + ' vs ' + dNick + ' D-Line') + '</p>' +
        nflMixTable('Direction', [oNick + ' YPC', dNick + ' Allowed', 'Stuff'], rows) +
        '</div>';
    }
    return html + '</section>';
  }

  function nflCatchersPanel(sport, game, side) {
    var defSide = nflOther(side);
    var status = nflAvailability(game, side);
    var players = (game[side + '_player_stats'] || []).filter(function (p) {
      return Number(p.targets) > 0;
    }).sort(function (a, b) { return Number(b.targets) - Number(a.targets); });
    var head = '<section class="ca-form-panel"><h3>' +
      esc(nflVs(sport, game, side, 'Pass Catchers', 'Pass Defense')) + '</h3>';
    if (!players.length) return head + pending('Receiving totals are not published yet.') + '</section>';
    // Receivers are placed among players at the same position on the slate
    // with at least five targets. Receptions, yards and yards per target are
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
      return nflPoolValues(function (t) {
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
      var st = status[playerNameKey(p.player_name)];
      var stText = nflStatusText(st);
      // Every row is graded (owner rule): a player under the target floor is
      // placed against the players above it; his targets are in the row.
      var thin = false;
      function placed(value, read, digits) {
        if (value == null) return '<td class="num">—</td>';
        return nflPlacedTd(esc(Number(value).toFixed(digits)),
          thin ? null : nflPlace(posPool(p.position, read), value, true), thin);
      }
      function marked(text, value, read) {
        if (value == null) return '<td class="num">—</td>';
        return '<td class="num">' + esc(text) +
          (thin ? '' : nflFreqMark(nflAsFreq(nflPlace(posPool(p.position, read), value, true)))) + '</td>';
      }
      var tgtG = perG(p, 'targets');
      return '<tr' + (thin ? ' class="is-thin"' : '') + '><td>' + esc(p.player_name) +
        ' <span class="ca-lineup-player__position">' + esc(p.position) + '</span>' +
        (stText ? ' <span class="ca-rank ' + (stText === 'Questionable' ? 'c-mid' : 'c-poor') + '">' +
          esc(stText === 'Questionable' ? 'Q' : stText) + '</span>' : '') +
        (thin ? ' <span class="ca-thin-tag" title="Under ' + MIN_TARGETS + ' targets: printed, not graded">Low n</span>' : '') +
        '</td>' +
        marked(tgtG == null ? '—' : tgtG.toFixed(1), tgtG, function (x) { return perG(x, 'targets'); }) +
        placed(perG(p, 'receptions'), function (x) { return perG(x, 'receptions'); }, 1) +
        placed(perG(p, 'receiving_yards'), function (x) { return perG(x, 'receiving_yards'); }, 1) +
        placed(yPerT(p), yPerT, 1) +
        marked(p.target_share == null ? '—' : pctText(p.target_share), p.target_share,
          function (x) { return x.target_share; }) +
        '<td class="num">' + esc(p.receiving_tds == null ? '—' : p.receiving_tds) + '</td></tr>';
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
    ['Shells', ['cover_0', 'cover_1', 'cover_2', 'cover_2_man', 'cover_3', 'cover_4', 'cover_6']]
  ];
  var NFL_REC_FLOOR = 3;

  function nflReceiverMatrices(sport, game, side, statRows) {
    var profiles = game[side + '_player_coverage'] || [];
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

    function matrix(cols, title, oppScheme) {
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
            if (!sp || sp.yards_per_target == null) {
              var tg = sp && sp.targets ? Number(sp.targets) : 0;
              return '<td class="num is-low-cell" title="' + tg + ' targets in this look">' + tg +
                ' <small class="is-low">tgt</small></td>';
            }
            var thin = Number(sp.targets) < NFL_REC_FLOOR;
            var rank = (sp.league_ranks || {}).yards_per_target;
            var title = pctText(sp.catch_rate) + ' catch · ' + epaText(sp.epa_per_target) + ' EPA/tgt';
            return '<td class="num' + (rank && !thin ? ' ' + rankTone(rank.place, rank.of) : '') +
              (thin ? ' is-low-cell' : '') + '" title="' + esc(title +
              (rank && !thin ? ' · ' + rank.place + ordinal(rank.place) + ' of ' + rank.of : '') +
              ' · ' + sp.targets + ' targets' +
              (thin ? ' · under ' + NFL_REC_FLOOR + ' targets, not graded' : '')) + '">' +
              esc(Number(sp.yards_per_target).toFixed(1)) +
              (thin ? ' <small class="is-low">' + esc(sp.targets) + '</small>' : nflBadge(rank)) + '</td>';
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
        return '<th class="num">' + esc(String(p.player_name).split(' ').slice(-1)[0]) + ' ' +
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
    return nflSeasonViews(
      matrix(combinedCols, allSeasons.join(' + ') + ' Receivers By Coverage · Yards Per Target', oppScheme),
      matrix(currentCols, now + ' Receivers By Coverage · Yards Per Target',
        game[oppSide + '_scheme_current'] || {}));
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

  function nflRzPlace(rank) {
    return rank && rank.place ? { rank: rank.place, of: rank.of } : null;
  }

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

    // The unit line: the offense directly above the defense it meets.
    var unitRows = [[oNick + ' Offense', off, (own.ranks || {}).offense || {}],
      [dNick + ' Defense', def, (opp.ranks || {}).defense || {}]];
    html += nflSplitTable(NFL_RZ_UNIT.map(function (c) { return c[1]; }).concat(['Pass Rate']),
      unitRows.map(function (row) {
        var cells = NFL_RZ_UNIT.map(function (col) {
          var raw = row[1][col[0]];
          if (raw == null) return '<td class="num">&mdash;</td>';
          return nflPlacedTd(esc(nflFormat(raw, col[2])), nflRzPlace(row[2][col[0]]), false);
        }).join('');
        // How often they throw is a tendency: a league marker, never a grade.
        return '<tr><td>' + esc(row[0]) + '</td>' + cells +
          nflRateCell(row[1].pass_rate, row[2].pass_rate) + '</tr>';
      }));

    // Where the targets go inside the 20, beside where this defense lets them go.
    var ownPos = own.offense_by_position || {}, oppPos = opp.defense_by_position || {};
    var posRows = [['WR', 'Wide Receivers'], ['TE', 'Tight Ends'], ['RB', 'Running Backs']]
      .filter(function (g) { return ownPos[g[0]] || oppPos[g[0]]; })
      .map(function (g) {
        var mine = ownPos[g[0]] || {}, theirs = oppPos[g[0]] || {};
        return '<tr><td class="ca-lineup-name">' + esc(g[1]) + '</td>' +
          nflUsageCell(mine.target_share, mine.target_share_rank) +
          nflRateCell(theirs.target_share, theirs.target_share_rank) +
          (theirs.receiving_tds_per_game == null ? '<td class="num">&mdash;</td>'
            : nflPlacedTd(esc(nflFormat(theirs.receiving_tds_per_game, 'num2')),
              nflRzPlace(theirs.receiving_tds_rank), false)) + '</tr>';
      });
    if (posRows.length) {
      html += '<div class="ca-split-block"><h4>Targets By Position</h4>' +
        nflMixTable('Position', [dNick + ' Allow', dNick + ' TD / G Allowed'], posRows) + '</div>';
    }

    var players = own.players || [];
    function shareCell(p, metric) {
      var rank = (p.ranks || {})[metric];
      var thin = !rank;
      return nflPlacedTd(esc(nflFormat(p[metric], 'pct')), nflRzPlace(rank), thin);
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
            nflPlacedTd(esc(nflFormat(p.completion_rate, 'pct')), nflRzPlace(r.completion_rate),
              thin || !r.completion_rate) +
            '<td class="num">' + p.passing_tds + '</td><td class="num">' + p.interceptions + '</td>' +
            nflPlacedTd(esc(nflFormat(p.epa_per_dropback, 'epa')), nflRzPlace(r.epa_per_dropback), thin) +
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
  var NFL_TABS = [
    ['units', 'Units', ['efficiency']],
    ['passing', 'Passing', ['quarterbacks', 'coverage', 'looks']],
    ['rushing', 'Rushing', ['run-game', 'trenches', 'rushing']],
    ['receiving', 'Receiving', ['receivers']],
    ['redzone', 'Red Zone', ['redzone']],
    ['tendencies', 'Tendencies', ['tendencies', 'def-tendencies']],
    ['lineups', 'Lineups', ['availability']],
    ['profile', 'Profile', ['radar', 'team-context']]
  ];

  function nflTabOf(key) {
    var hit = NFL_TABS.filter(function (t) { return t[0] === key || t[2].indexOf(key) >= 0; })[0];
    return hit ? hit[0] : null;
  }

  /* Where the two clubs' panels stack (narrower than 1380px), one club is read
     at a time; the switch is sticky with the tabs. */
  function nflClubSwitch(sport, game) {
    return '<div class="ca-nfl-club" role="group" aria-label="Club in view">' +
      ['away', 'home'].map(function (side) {
        return '<button type="button" class="ca-nfl-club__btn" data-club="' + side + '" aria-pressed="false">' +
          esc(nflNick(sport, game, side)) + '</button>';
      }).join('') +
      '<button type="button" class="ca-nfl-club__btn" data-club="both" aria-pressed="false">Both</button></div>';
  }

  function nflSetTab(host, key, scrollTo) {
    var stack = host.querySelector('.ca-detail-stack');
    var tab = NFL_TABS.filter(function (t) { return t[0] === key; })[0];
    if (!stack || !tab) return;
    stack.setAttribute('data-nfl-tab', key);
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

  function wireNflDesk(host) {
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
      var club = event.target.closest && event.target.closest('[data-club]');
      if (club && host.contains(club) && club.classList.contains('ca-nfl-club__btn')) {
        nflSetClub(host, club.getAttribute('data-club'));
      }
    });
    global.addEventListener('hashchange', function () {
      var key = String(global.location.hash || '').slice(1);
      var tab = nflTabOf(key);
      if (tab) nflSetTab(host, tab, key === tab ? 'stack' : key);
    });
  }

  function nflInitDesk(host) {
    var key = String(global.location.hash || '').slice(1);
    var tab = nflTabOf(key) || 'units';
    var section = key && key !== tab && nflTabOf(key) ? key : null;
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

  function nflSections(sport, game, games) {
    nflPool = nflLeaguePool(games);
    return [
      section('efficiency', 'Unit Matchups', 'Each Offense Above The Defense It Meets',
        nflDuo(nflDrivePanel, sport, game)),

      section('quarterbacks', 'Quarterbacks', 'Season Line And Splits By Defensive Look',
        nflDuo(nflBackPanel, sport, game, 'QB')),

      section('coverage', 'Coverage Shells', 'What Each Defense Plays, And How Often',
        nflBothWindows(function () { return nflDuo(nflShellPanel, sport, game); })),

      section('looks', 'Defensive Looks', 'Man, Zone, Blitz, Pressure And Box',
        nflBothWindows(function () { return nflDuo(nflLooksPanel, sport, game); })),

      section('run-game', 'Run Game', 'Each Rushing Unit, Then Every Ball Carrier',
        nflBothWindows(function () { return nflDuo(nflRunGamePanel, sport, game); })),

      section('trenches', 'Trenches', 'Each Line, And Where Runs Have Gone Against Each Front',
        nflDuo(nflTrenchPanel, sport, game)),

      section('rushing', 'Running Backs', 'Season Line And Splits By Box And Direction',
        nflDuo(nflBackPanel, sport, game, 'RB')),

      section('receivers', 'Pass Catchers', 'Volume Per Game And Where Targets Go',
        nflDuo(nflCatchersPanel, sport, game)),

      section('redzone', 'Red Zone', 'Trips, Conversion And Who Gets The Ball Inside The 20',
        nflRedZone(sport, game)),

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
      title: 'Scoring Pressure', metric: 'Points Per Game', off: 'off_ppa', def: 'def_ppa'
    },
    {
      title: 'Drive Sustainability', metric: 'Third-Down Rate', off: 'off_successRate', def: 'def_successRate'
    },
    {
      title: 'Explosive Passing', metric: 'Yards Per Pass Attempt', off: 'off_explosiveness', def: 'def_explosiveness'
    },
    {
      title: 'Run-Game Control', metric: 'Yards Per Rush Attempt', off: 'off_stuffRate', def: 'def_stuffRate'
    },
    {
      title: 'Passing Friction', metric: 'Sacks Per Game', off: 'off_sacks', def: 'def_sacks'
    },
    {
      title: 'Possession Volatility', metric: 'Interceptions Per Game', off: 'off_int', def: 'def_int'
    }
  ];

  function cfbRates(game, side) {
    var currentYear = new Date().getUTCFullYear();
    var season = Number(game.season);
    var form = game[side + '_form'] || {};
    if (season !== currentYear || Number(form.season) !== season) return {};
    return form.rates || {};
  }

  function cfbDecisionPaths() {
    return '<nav class="ca-research-paths" aria-label="Choose a college football research path">' +
      '<a href="#clash"><strong>Game Script</strong><span>Each offense against the defense it will face</span></a>' +
      '<a href="#form"><strong>Team Identity</strong><span>Scoring, passing, rushing, downs and special teams</span></a>' +
      '<a href="#recent"><strong>Form &amp; Context</strong><span>Recent results, venue, travel and schedule setting</span></a>' +
      '</nav>';
  }

  function cfbScriptReading(sport, game, offSide, defSide, lens) {
    var offense = cfbRates(game, offSide)[lens.off];
    var defense = cfbRates(game, defSide)[lens.def];
    if (!offense && !defense) return '';
    function rank(entry, role) {
      return entry && entry.rank && entry.of
        ? role + ' ' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of
        : role + ' rank unavailable';
    }
    return '<li><strong>' + esc(fullName(sport, game, offSide)) + ' offense</strong>' +
      '<span>vs ' + esc(fullName(sport, game, defSide)) + ' defense</span>' +
      '<small>' + esc(rank(offense, 'Offense')) + ' · ' + esc(rank(defense, 'Defense')) +
      '</small></li>';
  }

  function cfbScriptLens(sport, game) {
    var cards = CFB_SCRIPT_LENSES.map(function (lens) {
      var directions = cfbScriptReading(sport, game, 'away', 'home', lens) +
        cfbScriptReading(sport, game, 'home', 'away', lens);
      if (!directions) return '';
      return '<article class="ca-script-lens"><header><span>' + esc(lens.metric) + '</span>' +
        '<h4>' + esc(lens.title) + '</h4></header>' +
        '<ul>' + directions + '</ul></article>';
    }).filter(Boolean).join('');
    if (!cards) return '';
    return '<section class="ca-script-dynamics ca-cfb-script-dynamics" aria-labelledby="caCfbScriptDynamicsTitle">' +
      '<header><div><span>Competitive Dynamics</span>' +
      '<h3 id="caCfbScriptDynamicsTitle">How The Matchup Can Change Possessions And Play Mix</h3></div>' +
      '</header>' +
      '<div class="ca-script-lens-grid">' + cards + '</div></section>';
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

  function cfbClashBody(sport, game) {
    var a = cfbClashCard(sport, game, 'away', 'home');
    var b = cfbClashCard(sport, game, 'home', 'away');
    if (!a && !b) return pending('Unit rates are not published for this pairing yet.');
    return '<div class="ca-detail-stack-inner"><div class="ca-cfb-matchup-stack">' + a + b + '</div>' +
      cfbScriptLens(sport, game) +
      '</div>';
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
      tabs + '</div>' + panels;
  }

  function cfbSections(sport, game) {
    return [
      section('clash', 'Matchup Breakdown',
        'Each Offense Against The Defense It Meets, Rate By Rate',
        cfbDecisionPaths() + cfbClashBody(sport, game)),

      section('form', 'Stat Comparison',
        'Same Rates, Side By Side, Ranked Against The FBS Pool',
        cfbCompareBody(sport, game)),

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
          ['Quarterback', value(game.away_starter)],
          ['Travel', value(game.away_travel)]
        ]) + teamPanel(sport, game, 'home', [
          ['Record', value(game.home_record)],
          ['Conference', value(game.home_conference || game.home_conf)],
          ['Quarterback', value(game.home_starter)],
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
      : sport === 'cfb'
      ? [['overview', 'Overview'], ['clash', 'Matchup'], ['form', 'Comparison'],
         ['radar', 'Radar'], ['recent', 'Recent'],
         ['team-context', 'Venue And Travel']]
      : [['overview', 'Overview'], ['efficiency', 'Units'], ['quarterbacks', 'Passing'],
         ['rushing', 'Rushing'], ['receivers', 'Receiving'], ['redzone', 'Red Zone'],
         ['tendencies', 'Tendencies'],
         ['availability', 'Lineups'], ['radar', 'Radar'], ['team-context', 'Context']];
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
      (sport === 'nfl'
        ? '<div class="ca-nfl-bar"><nav class="ca-detail-nav ca-nfl-tabs" aria-label="Matchup sections" role="tablist">' +
          NFL_TABS.map(function (tab) {
            var glyph = SECTION_ICON[tab[2][0]] ? ico(SECTION_ICON[tab[2][0]], 'ca-detail-nav__ico', 14) : '';
            return '<a href="#' + tab[0] + '" role="tab" data-nfl-tab="' + tab[0] + '" aria-selected="false">' +
              glyph + tab[1] + '</a>';
          }).join('') + '</nav>' + nflClubSwitch(sport, game) + '</div>' + seasonToggle(game)
        : '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
          var glyph = item[0] === 'overview' ? ico('info', 'ca-detail-nav__ico', 14)
            : (SECTION_ICON[item[0]] ? ico(SECTION_ICON[item[0]], 'ca-detail-nav__ico', 14) : '');
          return '<a href="#' + item[0] + '">' + glyph + item[1] + '</a>';
        }).join('') + '</nav>') +
      '<div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra)
        : sport === 'cfb' ? cfbSections(sport, game)
        : nflSections(sport, game, (result && result.games) || [])) +
      '</div>';
    host.innerHTML = html;
    if (sport === 'nfl') nflInitDesk(host);
    host.setAttribute('data-state', 'ready');
    host.__caRadar = { sport: sport, game: game };
    fitRadar(host);
    // Delegated once on the host, so a repainted section keeps working.
    if (!host.dataset.seasonWired) {
      wireSeasonToggle(host);
      wireLineupTabs(host);
      wireCfbCompare(host);
      wireRadarReadout(host);
      if (sport === 'nfl') wireNflDesk(host);
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
