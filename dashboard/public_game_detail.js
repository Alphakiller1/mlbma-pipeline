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
    'club-splits': 'users', 'pitch-matchup': 'target', bvp: 'lineup', 'runs-hand': 'trend', series: 'calendar',
    recent: 'calendar', form: 'trend', radar: 'gauge', bullpens: 'users',
    availability: 'whistle', scheme: 'football', 'team-context': 'plane', 'run-game': 'football',
    'def-tendencies': 'target',
    projection: 'target', clash: 'football', players: 'users',
    efficiency: 'trend', quarterbacks: 'football', coverage: 'target', looks: 'target',
    rushing: 'football', trenches: 'users', receivers: 'users', redzone: 'target',
    tendencies: 'lineup', 'game-log': 'calendar',
    'cfb-efficiency': 'trend', 'cfb-passing': 'football', 'cfb-rushing': 'football',
    'cfb-rushers': 'users', 'cfb-quarterbacks': 'football', 'cfb-situational': 'target',
    'cfb-game-log': 'calendar', 'cfb-special': 'target'
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
    return '<span class="ca-rank ' + percentileClass(p) + '">' + n + ordinal(n) + '</span>';
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

  /* How often, against the league: the club's league rank as a colour-coded
     pill, from the published league_frequency_ranks (place 1 = most). Owner
     direction 2026-10-01 replaced the up/down arrows with the rank itself.
     The pill reads in the direction the colour does: for a rate where less is
     better (invert), 1st is the club that does it least. */
  function nflFreqRank(scheme, phase, group, key) {
    return (((((scheme || {}).league_frequency_ranks || {})[phase] || {})[group] || {})[key]) || null;
  }

  function nflFreqMark(rank, invert) {
    if (!rank || !(rank.of > 1) || !(rank.place >= 1)) return '';
    var shown = invert ? rank.of + 1 - rank.place : rank.place;
    var words = rank.place + ordinal(rank.place) + ' most of ' + rank.of;
    return '<span class="ca-rank ca-freq-mark ' + rankTone(shown, rank.of) + '" title="' + esc(words) +
      '" aria-label="' + esc(words) + '">' + shown + ordinal(shown) + '</span>';
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

  function nflDrivePanel(sport, game, offSide) {
    var defSide = nflOther(offSide);
    var oRates = (game[offSide + '_form'] || {}).rates || {};
    var dRates = (game[defSide + '_form'] || {}).rates || {};
    var oScheme = game[offSide + '_scheme'] || {};
    var dScheme = game[defSide + '_scheme'] || {};
    var oNick = nflNick(sport, game, offSide), dNick = nflNick(sport, game, defSide);
    var head = '<section class="ca-form-panel"><h3>' + esc(nflVs(sport, game, offSide, 'Offense', 'Defense')) +
      '</h3>';
    if (!Object.keys(oRates).length && !Object.keys(dRates).length) {
      return head + pending('Team form is not published yet.') + '</section>';
    }
    function formRow(label, rates, prefix) {
      return '<tr><td>' + esc(label) + '</td>' +
        nflGradedCell(rates[prefix + 'epa'], 'epa') + nflGradedCell(rates[prefix + 'first_down'], 'pct') +
        nflGradedCell(rates[prefix + 'explosive'], 'pct') + nflGradedCell(rates[prefix + 'sack'], 'pct') +
        nflGradedCell(rates[prefix + 'turnover'], 'pct') + '</tr>';
    }
    var html = head + nflBothWindows(function () {
      var o = nflFormFor(game, offSide), d = nflFormFor(game, defSide);
      if (!Object.keys(o).length && !Object.keys(d).length) return '';
      return nflFormNote(game) +
        nflSplitTable(['EPA/Play', '1st Down', 'Explosive', 'Sack', 'Turnover'], [
          formRow(oNick + ' Offense', o, 'off_'),
          formRow(dNick + ' Defense', d, 'def_')
        ]);
    });

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
                : nflBadge(rank)) + '</td>';
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
    'league make rate for their distance, fumbles at the league’s average fumble outcome, and ' +
    'return and defensive touchdowns at the league rate per game.';

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
      return '<g><title>Week ' + g.week + ' ' + (g.home ? 'vs ' : '@ ') + g.opp + ': final ' +
        (actual > 0 ? '+' : '') + actual + ', noise-adjusted ' + (adjusted > 0 ? '+' : '') +
        adjusted.toFixed(1) + '</title>' +
        bar(x, actual, 'ca-log-bar', 0) + bar(x + 28, adjusted, 'ca-log-bar ca-log-bar--adj', 1) +
        '<text x="' + (x + 25) + '" y="' + (H + 16) + '">W' + g.week + ' ' + (g.home ? 'vs' : '@') +
        ' ' + esc(g.opp) + '</text></g>';
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
          var r = (weekRanks[g.game_id + '|' + g.opp] || {})[spec[0]];
          var extra = spec[0] === 'third_down' ? ' (' + g.third_down_made + '/' + g.third_down_att + ')' : '';
          return '<td class="num ' + (r ? rankTone(r.rank, r.of) : '') + '" title="' + esc(spec[1] + ' · ' +
            (r ? r.rank + ordinal(r.rank) + ' of ' + r.of + ' clubs in Week ' + g.week : '') + extra) + '">' +
            esc(nflLogValue(e.value, spec[2])) + rankBadge(r) + '</td>';
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
            : nflLogValue(e.value, spec[2])) + rankBadge(e) + '</td>';
      }).join('') + '</tr>' : '';
    var table = nflSplitTable(heads, [rows + seasonRow], 'Game').replace('<th class="num">Noise-Adj</th>',
      '<th class="num" title="' + esc(NFL_NOISE_NOTE) + '">Noise-Adj</th>');
    return head + nflMarginStrip(games) + table + '</section>';
  }

  function nflGameLogBody(sport, game, logs) {
    return nflDuo(nflGameLogPanel, sport, game, logs);
  }

  var NFL_TABS = [
    ['units', 'Units', ['efficiency']],
    ['dvoa', 'DVOA', ['dvoa']],
    ['games', 'Games', ['game-log']],
    ['passing', 'Passing', ['quarterbacks', 'coverage', 'looks']],
    ['rushing', 'Rushing', ['run-game', 'trenches', 'rushing']],
    ['receiving', 'Receiving', ['receivers']],
    ['redzone', 'Red Zone', ['redzone']],
    ['tendencies', 'Tendencies', ['tendencies', 'def-tendencies']],
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
        var full = sport === 'cfb' ? cfbName(sport, game, side) : nflNick(sport, game, side);
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

  /* One table, one rhythm (owner 2026-10-01: "not everything is represented
     the same"). Whether a rank pill fits beside its figure depends on that
     figure's width, so a narrow column used to put some pills beside and some
     under. Each visible table is measured: if any pill would wrap, every pill
     in it stacks under its figure; otherwise all sit inline. */
  function nflPillWrapped(pill) {
    var cell = pill.parentNode, first = cell && cell.firstChild;
    if (!first || first === pill) return false;
    var box;
    if (first.nodeType === 3) {
      var range = document.createRange();
      range.selectNodeContents(first);
      box = range.getBoundingClientRect();
    } else {
      box = first.getBoundingClientRect();
    }
    return pill.getBoundingClientRect().top > box.top + box.height / 2;
  }

  function nflEvenPills(host) {
    Array.prototype.forEach.call(host.querySelectorAll('table.ca-nfl-split, table.ca-nfl-mix'), function (table) {
      if (!table.offsetParent) return;
      table.classList.remove('is-stacked');
      var pills = table.querySelectorAll('td.num > .ca-rank');
      for (var i = 0; i < pills.length; i++) {
        // Wrapped under its figure, or (where a column keeps one line) spilling
        // past its cell into the next: either way the table stacks.
        var cell = pills[i].parentNode;
        if (nflPillWrapped(pills[i]) || cell.scrollWidth > cell.clientWidth + 1) {
          table.classList.add('is-stacked');
          return;
        }
      }
    });
  }

  function wireNflDesk(host) {
    var pending = 0;
    function even() {
      if (pending) global.cancelAnimationFrame(pending);
      pending = global.requestAnimationFrame(function () { pending = 0; nflEvenPills(host); });
    }
    // Any tab, club or season switch can reveal tables; so can a resize.
    host.addEventListener('click', even);
    global.addEventListener('resize', even);
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
      ? [feed.season, feed.week != null ? 'Week ' + feed.week : null, source].filter(Boolean).join(' · ')
      : 'Licensed FTN DVOA feed required';
    var rows = displayRows.map(function (row) {
      var entry = feed[row[0]];
      var shown = nflDvoaValue(entry);
      var place = entry && typeof entry === 'object' && entry.rank && entry.of
        ? { rank: entry.rank, of: entry.of } : null;
      var tone = place ? rankTone(place.rank, place.of) : '';
      return '<tr><td>' + esc(row[1]) + '</td><td class="num' + (tone ? ' ' + tone : '') + '">' +
        (shown == null ? '<span class="ca-vs-none">Not Published</span>' : esc(shown)) +
        (place ? rankBadge(place) : '') + '</td></tr>';
    });
    return '<section class="ca-form-panel ca-nfl-dvoa-panel"><h3>' +
      esc(fullName(sport, game, side) + ' DVOA') + '</h3><p class="ca-lineup-context">' +
      esc(context) + '</p>' + nflSplitTable(['DVOA'], rows, 'Metric') + '</section>';
  }

  function nflSections(sport, game, games) {
    nflPool = nflLeaguePool(games);
    return [
      section('efficiency', 'Unit Matchups', 'Each Offense Above The Defense It Meets',
        nflDuo(nflDrivePanel, sport, game)),

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

  /* ---------------------------------------------------------------------
   * The CFB desk, in the NFL desk's design layer.
   *
   * Read a tab at a time. Every table puts one club's unit above the unit
   * it meets, and every figure carries its place among the FBS clubs (rank
   * pill, tier colour). Only evidence: no verdict lines, no gap ordering,
   * no explanations (owner rules, 2026-09-26).
   * ------------------------------------------------------------------ */
  var CFB_TABS = [
    ['units', 'Units', ['cfb-efficiency', 'cfb-dvoa']],
    ['games', 'Games', ['cfb-game-log']],
    ['passing', 'Passing', ['cfb-quarterbacks', 'cfb-passing']],
    ['rushing', 'Rushing', ['cfb-rushing', 'cfb-rushers']],
    ['situational', 'Situational', ['cfb-situational']],
    ['special', 'Special Teams', ['cfb-special']],
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
    ]
  };
  var CFB_LEDGER_UNITS = {
    efficiency: ['Offense', 'Defense'],
    passing: ['Passing Offense', 'Pass Defense'],
    rushing: ['Rushing Offense', 'Run Defense'],
    situational: ['Offense', 'Defense']
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

  var CFB_FEED_KEY = { scheme: '_scheme_stats', run: '_run_game', model: '_model_form' };

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

  // A rate with its FBS place. The label rides in the tooltip, because one
  // column can mean "sacks taken" for an offense and "sacks made" for the
  // defense beside it.
  function cfbCell(entry, extraClass) {
    var cls = extraClass ? ' ' + extraClass : '';
    if (!entry || entry.value == null) return '<td class="num ca-vs-none' + cls + '">Not Rated</td>';
    var place = entry.rank ? { rank: entry.rank, of: entry.of } : null;
    return '<td class="num' + cls + (place ? ' ' + rankTone(place.rank, place.of) : '') + '" title="' +
      esc(titleCase(entry.label || '') + (place ? ' · ' + place.rank + ordinal(place.rank) +
        (entry.better === 'neutral' ? ' most' : '') + ' of ' + place.of : '')) + '">' +
      esc(cfbValue(entry)) +
      (place ? rankBadge(place) : '') + '</td>';
  }

  function cfbSample(sport, game, sides) {
    var of = null;
    var bits = sides.map(function (side) {
      var rates = cfbRates(game, side);
      of = of || ((rates.off_ppg || rates.def_ppg) || {}).of;
      var form = game[side + '_form'] || {};
      var games = Math.round(Number(form.games != null ? form.games : form.plays));
      return cfbName(sport, game, side) + ' ' + (Object.keys(rates).length && games > 0
        ? games + (games === 1 ? ' Game' : ' Games') : 'Not Rated Yet');
    });
    return '<p class="ca-lineup-context">' + esc(bits.concat(of ? ['Ranked Of ' + of + ' FBS'] : [])
      .join(' · ')) + '</p>';
  }

  // A side's place among FBS schools as a bar length: 1st fills it.
  function cfbBar(entry, side) {
    var ranked = entry && entry.value != null && entry.rank && entry.of > 1;
    var pct = ranked ? Math.max(4, Math.round(((entry.of - entry.rank) / (entry.of - 1)) * 100)) : 0;
    return '<span class="ca-ledger-bar ' + side + (ranked ? ' ' + rankTone(entry.rank, entry.of) : '') +
      '"><i style="width:' + pct + '%"></i></span>';
  }

  function cfbLedgerRow(label, left, right) {
    return '<tr><td>' + esc(label) + '</td>' + cfbCell(left) +
      '<td class="ca-ledger-bars" aria-hidden="true"><span class="ca-ledger-pair">' +
      cfbBar(left, 'is-left') + cfbBar(right, 'is-right') + '</span></td>' +
      cfbCell(right, 'ca-ledger-right') + '</tr>';
  }

  function cfbLedgerTable(left, right, groups) {
    function head(name, unit, cls) {
      return '<th class="num' + cls + '"><span class="ca-ledger-school">' + esc(name) + '</span>' +
        esc(unit) + '</th>';
    }
    return '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-cfb-ledger-table">' +
      '<colgroup><col class="ca-ledger-col-stat"><col class="ca-ledger-col-val">' +
      '<col class="ca-ledger-col-bars"><col class="ca-ledger-col-val"></colgroup>' +
      '<thead><tr><th>Stat</th>' + head(left[0], left[1], '') +
      '<th class="ca-ledger-bars" aria-hidden="true"></th>' +
      head(right[0], right[1], ' ca-ledger-right') + '</tr></thead><tbody>' +
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
          return cfbLedgerRow(spec[2], cfbFeed(game, offSide, spec[0])['off_' + spec[1]],
            cfbFeed(game, defSide, spec[0])['def_' + spec[1]]);
        })
      };
    });
    if (!groups.some(function (g) { return g.rows.length; })) {
      return head + pending('Unit rates are not published for this pairing yet.') + '</section>';
    }
    return head + cfbSample(sport, game, [offSide, defSide]) +
      (area === 'passing' ? cfbSchemeLine(sport, game, offSide, defSide) : '') +
      cfbLedgerTable([offName, 'Offense'], [defName, 'Defense'], groups) + '</section>';
  }

  /* School against school on the same figure (SP+, special teams): the same
     ledger, the away school on the left and the home school on the right. */
  function cfbHeadToHead(sport, game, title, context, rows) {
    var head = '<section class="ca-form-panel ca-cfb-panel ca-cfb-ledger ca-cfb-h2h"><h3>' +
      esc(title) + '</h3>' + context;
    var shown = rows.filter(function (r) { return r[1] || r[2]; });
    if (!shown.length) return head + pending('Ratings are not published for this pairing yet.') + '</section>';
    return head + cfbLedgerTable([cfbName(sport, game, 'away'), 'Away'],
      [cfbName(sport, game, 'home'), 'Home'],
      [{ title: '', rows: shown.map(function (r) { return cfbLedgerRow(r[0], r[1], r[2]); }) }]) +
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
        format: key === 'overall' || key === 'special_teams' ? 'signed' : 'num' };
    }
    return cfbHeadToHead(sport, game,
      cfbName(sport, game, 'away') + ' vs ' + cfbName(sport, game, 'home') + ' SP+',
      '<p class="ca-lineup-context">' + esc(context || 'Opponent-adjusted ratings are not available') +
        '</p>',
      CFB_SP_PLUS.map(function (row) { return [row[1], entry(away, row[0]), entry(home, row[0])]; }));
  }

  // One passer against the defense he meets: his season line, then EPA per
  // play on each split beside what that defense allows on the same split.
  var CFB_QB_LINE = [['completion_pct', 'Comp%'], ['yards_per_attempt', 'Yds/Att'],
    ['td_rate', 'TD%'], ['int_rate', 'INT%'], ['yards', 'Yards'], ['touchdowns', 'TD']];
  // The splits measured on both sides: the passer's EPA and the defense's
  // EPA allowed on the same plays, so each row is a pair.
  var CFB_QB_SPLITS = [['all', 'All Plays'], ['pass', 'Dropbacks'], ['rush', 'Rushes'],
    ['standardDowns', 'Standard Downs'], ['passingDowns', 'Passing Downs']];

  function cfbQbPanel(sport, game, offSide) {
    var defSide = offSide === 'away' ? 'home' : 'away';
    var qbs = game[offSide + '_qbs'] || [];
    var defense = game[defSide + '_defense_splits'] || {};
    var defName = cfbName(sport, game, defSide);
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(cfbName(sport, game, offSide) + ' Quarterbacks vs ' + defName + ' Defense') + '</h3>';
    if (!qbs.length) return head + pending('Quarterback lines are not published yet.') + '</section>';
    var lineRows = qbs.map(function (q) {
      var line = q.line || {};
      return '<tr><td>' + esc(q.player_name) + ' <span class="ca-lineup-player__position">QB</span>' +
        '<small class="ca-qb-volume">' + esc(line.completions + '/' + line.attempts) + '</small></td>' +
        CFB_QB_LINE.map(function (c) {
          return line[c[0]] ? cfbCell(line[c[0]]) : '<td class="num ca-vs-none">Not Rated</td>';
        }).join('') + '</tr>';
    });
    var lead = qbs[0];
    var splitRows = CFB_QB_SPLITS.filter(function (sp) {
      return (lead.epa_splits || {})[sp[0]] && defense[sp[0]];
    }).map(function (sp) {
      return cfbLedgerRow(sp[1], (lead.epa_splits || {})[sp[0]], defense[sp[0]]);
    });
    return head + '<div class="ca-split-block"><h4>Season Line</h4>' +
      nflSplitTable(CFB_QB_LINE.map(function (c) { return c[1]; }), lineRows, 'Passer') + '</div>' +
      (splitRows.length ? '<div class="ca-split-block"><h4>' + esc(lead.player_name +
        ' EPA Per Play vs ' + defName + ' Allowed') + '</h4>' +
        cfbLedgerTable([lead.player_name, 'EPA/Play'], [defName, 'Allows'],
          [{ title: '', rows: splitRows }]) + '</div>' : '') +
      '</section>';
  }

  var CFB_RUSHER_COLS = [['yards', 'Yards'], ['yards_per_carry', 'Yds/Car'],
    ['touchdowns', 'TD'], ['long', 'Long']];

  function cfbRushersPanel(sport, game, side) {
    var list = game[side + '_rushers'] || [];
    var head = '<section class="ca-form-panel ca-cfb-panel"><h3>' +
      esc(cfbName(sport, game, side) + ' Ball Carriers') + '</h3>';
    if (!list.length) return head + pending('Rushing lines are not published yet.') + '</section>';
    var rows = list.map(function (r) {
      return '<tr><td>' + esc(r.player_name) + ' <span class="ca-lineup-player__position">' +
        esc(r.position || '') + '</span><small class="ca-qb-volume">' + esc(r.carries + ' car') +
        '</small></td>' + CFB_RUSHER_COLS.map(function (c) {
          return r[c[0]] ? cfbCell(r[c[0]]) : '<td class="num ca-vs-none">Not Rated</td>';
        }).join('') + '</tr>';
    });
    return head + nflSplitTable(CFB_RUSHER_COLS.map(function (c) { return c[1]; }), rows, 'Player') +
      '</section>';
  }

  var CFB_LOG_COLS = [['total_yards', 'Yards', 'int'], ['passing_yards', 'Pass', 'int'],
    ['rushing_yards', 'Rush', 'int'], ['turnovers', 'TO', 'int'], ['third_down_rate', '3rd Dn', 'pct']];

  function cfbLogCell(entry, kind, extra) {
    if (!entry || entry.value == null) return '<td class="num ca-vs-none">Not Charted</td>';
    var e = { value: entry.value, rank: entry.rank, of: entry.of, format: kind };
    return '<td class="num ' + (entry.rank ? rankTone(entry.rank, entry.of) : '') + '" title="' +
      esc((entry.rank ? entry.rank + ordinal(entry.rank) + ' of ' + entry.of : '') + (extra || '')) + '">' +
      esc(cfbValue(e)) + (entry.rank ? rankBadge({ rank: entry.rank, of: entry.of }) : '') + '</td>';
  }

  function cfbGameLogPanel(sport, game, side) {
    var log = game[side + '_game_log'] || {};
    var head = '<section class="ca-form-panel ca-log-panel"><h3>' +
      esc(cfbName(sport, game, side) + ' Game Log') + '</h3>';
    var games = log.games || [];
    if (!games.length) return head + pending('No completed games are published for this school yet.') +
      '</section>';
    var rows = games.map(function (g) {
      var pts = (g.points || {}).value, opp = (g.opponent_points || {}).value;
      return '<tr><td>W' + g.week + ' ' + (g.neutral ? 'vs ' : (g.home ? 'vs ' : '@ ')) +
        esc(g.opponent || g.opponent_name || '') + '</td>' +
        '<td class="num">' + (pts == null || opp == null ? '<span class="ca-vs-none">Not Final</span>'
          : nflLogResult(pts, opp, 0)) + '</td>' +
        CFB_LOG_COLS.map(function (c) {
          return cfbLogCell(g[c[0]], c[2], c[0] === 'third_down_rate' && g.third_down
            ? ' · ' + g.third_down : '');
        }).join('') + '</tr>';
    }).join('');
    var season = log.season || {};
    var seasonRow = season.points ? '<tr class="ca-log-season"><td>Season Avg</td>' +
      '<td class="num">' + esc(Number(season.points.value).toFixed(1) + '–' +
        Number((season.opponent_points || {}).value).toFixed(1)) + '</td>' +
      CFB_LOG_COLS.map(function (c) {
        return cfbLogCell(season[c[0]], c[2] === 'int' ? 'num' : c[2]);
      }).join('') + '</tr>' : '';
    return head + nflSplitTable(['Result'].concat(CFB_LOG_COLS.map(function (c) { return c[1]; })),
      [rows + seasonRow], 'Game') + '</section>';
  }

  function cfbSections(sport, game) {
    return [
      section('cfb-efficiency', 'Efficiency', 'Scoring, Yardage And Per-Play Production',
        nflDuo(cfbLedgerPanel, sport, game, 'efficiency')),
      section('cfb-dvoa', 'DVOA Equivalent', 'SP+ Opponent-Adjusted Efficiency By Unit',
        cfbDvoaBody(sport, game)),
      section('cfb-game-log', 'Game Log', 'Every Game, Ranked Against That Week',
        nflDuo(cfbGameLogPanel, sport, game)),
      section('cfb-quarterbacks', 'Quarterbacks', 'Season Line And EPA By Situation, Beside The Defense',
        nflDuo(cfbQbPanel, sport, game)),
      section('cfb-passing', 'Pass Game', 'Efficiency, Volume, Scoring And Protection',
        nflDuo(cfbLedgerPanel, sport, game, 'passing')),
      section('cfb-rushing', 'Run Game', 'Efficiency, Volume And Line Play',
        nflDuo(cfbLedgerPanel, sport, game, 'rushing')),
      section('cfb-rushers', 'Ball Carriers', 'Season Rushing Lines, Ranked Of FBS Rushers',
        nflDuo(cfbRushersPanel, sport, game)),
      section('cfb-situational', 'Situational', 'Downs, Tempo, Play Mix And Havoc',
        nflDuo(cfbLedgerPanel, sport, game, 'situational')),
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
         ['lineups', 'Vs Hand'], ['pitch-matchup', 'Vs Pitch Mix'], ['bvp', 'Batter Vs Pitcher'],
         ['club-splits', 'Club Splits'], ['recent', 'Last Ten'], ['runs-hand', 'Runs Vs Hand'],
         ['series', 'Series'], ['form', 'Offensive Form'], ['radar', 'Radar'], ['bullpens', 'Bullpens']]
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
      '</article>' +
      (sport === 'nfl' || sport === 'cfb'
        ? '<div class="ca-nfl-bar"><nav class="ca-detail-nav ca-nfl-tabs" aria-label="Matchup sections" role="tablist">' +
          (sport === 'cfb' ? CFB_TABS : NFL_TABS).map(function (tab) {
            var glyph = SECTION_ICON[tab[2][0]] ? ico(SECTION_ICON[tab[2][0]], 'ca-detail-nav__ico', 14) : '';
            return '<a href="#' + tab[0] + '" role="tab" data-nfl-tab="' + tab[0] + '" aria-selected="false">' +
              glyph + tab[1] + '</a>';
          }).join('') + '</nav>' + nflClubSwitch(sport, game) + '</div>' +
          (sport === 'nfl' ? seasonToggle(game) : '')
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
    host.__deskTabs = sport === 'cfb' ? CFB_TABS : NFL_TABS;
    if (sport === 'nfl' || sport === 'cfb') nflInitDesk(host);
    host.setAttribute('data-state', 'ready');
    host.__caRadar = { sport: sport, game: game };
    fitRadar(host);
    // Delegated once on the host, so a repainted section keeps working.
    if (!host.dataset.seasonWired) {
      wireSeasonToggle(host);
      wireLineupTabs(host);
      wireRadarReadout(host);
      wirePitchMetric(host);
      wireBvpView(host);
      wireFormSplit(host);
      wireRunsHand(host);
      if (sport === 'nfl' || sport === 'cfb') wireNflDesk(host);
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
      if (sport === 'nfl') {
        loadNflGameLogs().then(function (logs) {
          paintSection(host, 'game-log', nflGameLogBody(sport, game, logs));
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
