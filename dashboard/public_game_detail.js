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
      logo(sport, game, side, 76, 'ca-detail-team__logo') +
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
  function section(id, title, note, body) {
    return '<section class="ca-detail-section" id="' + esc(id) + '"><header class="ca-detail-section__head"><h2>' +
      esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : '') + '</header>' +
      '<div class="ca-detail-section__body" data-body="' + esc(id) + '">' + body + '</div></section>';
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
      return '<strong>' + esc(game.away_score) + '–' + esc(game.home_score) + '</strong><p>' + esc(gameStatus(game)) + '</p>';
    }
    return '<strong>' + esc(clock(game.kickoff_utc)) + '</strong><p>' + esc(gameStatus(game)) + '</p>';
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

  var STAT_SPECS = {
    osi: { label: 'OSI', digits: 1 },
    wrc: { label: 'wRC+', digits: 0 },
    woba: { label: 'wOBA', digits: 3 },
    rcv: { label: 'RCV', digits: 1 },
    abq: { label: 'ABQ', digits: 1 },
    obr: { label: 'OBR', digits: 1 },
    pitchScore: { label: 'Pitch Score', digits: 0 }
  };
  var FORM_KEYS = ['osi', 'wrc', 'woba', 'rcv', 'abq', 'obr', 'pitchScore'];

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /** One bulk request for every person on the card - both arms and both orders. */
  function loadPeople(ids, group, season) {
    var unique = ids.filter(function (id, i) { return id && ids.indexOf(id) === i; });
    if (!unique.length) return Promise.resolve({});
    var url = 'https://statsapi.mlb.com/api/v1/people?personIds=' + unique.join(',') +
      '&hydrate=stats(group=[' + group + '],type=[season],season=' + season + ')';
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
    var end = isoDaysBefore(dateIso, 1);
    var start = isoDaysBefore(dateIso, 3);
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
      if (!finals.length) return { used: [], games: 0, window: start + ' to ' + end };
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
        return { used: used, games: finals.length, window: start + ' to ' + end };
      });
    }).catch(function () { return null; });
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
    var shown = formatStat(entry.value, spec.digits);
    if (!shown) return '';
    return '<div class="ca-form-cell">' +
      '<span class="ca-form-label">' + esc(spec.label) + '</span>' +
      '<strong class="ca-form-value">' + esc(shown) + '</strong>' +
      percentBar(entry.rank, entry.of) +
      '<span class="ca-form-rank">' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</span>' +
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
  function percentOf(entry) {
    if (!entry || !(entry.of > 1) || !(entry.rank >= 1)) return null;
    return ((entry.of - entry.rank) / (entry.of - 1)) * 100;
  }

  function mirrorRow(label, away, home, format) {
    if (!away && !home) return '';
    var awayPct = percentOf(away), homePct = percentOf(home);
    // The side with the better season carries the emphasis, so a scan down the
    // column shows who wins each row without reading a single number.
    var lead = '';
    if (awayPct != null && homePct != null && Math.abs(awayPct - homePct) >= 4) {
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
      var bar = '<span class="' + track + '"><span class="ca-mirror__fill" style="width:' +
        (pct == null ? 0 : pct.toFixed(1)) + '%"></span></span>';
      var value = '<span class="' + val + '">' + esc(format(entry.value)) +
        '<i>' + entry.rank + ordinal(entry.rank) + '</i></span>';
      return which === 'away' ? value + bar : bar + value;
    }
    return '<div class="ca-mirror__row' + lead + '">' +
      side(away, awayPct, 'away') +
      '<span class="ca-mirror__label">' + esc(label) + '</span>' +
      side(home, homePct, 'home') + '</div>';
  }

  function mirrorTable(sport, game, keys, specs, source) {
    var awayCtx = source(game, 'away') || {};
    var homeCtx = source(game, 'home') || {};
    var rows = keys.map(function (key) {
      var spec = specs[key];
      if (!spec) return '';
      return mirrorRow(spec.label, awayCtx[key], homeCtx[key], function (v) {
        return formatStat(v, spec.digits) || '\u2014';
      });
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
  function derivedRates(stat) {
    var out = [];
    var bf = Number(stat.battersFaced);
    var ip = parseFloat(stat.inningsPitched);
    if (isFinite(bf) && bf > 0) {
      if (stat.strikeOuts != null) out.push(['K%', (Number(stat.strikeOuts) / bf * 100).toFixed(1) + '%']);
      if (stat.baseOnBalls != null) out.push(['BB%', (Number(stat.baseOnBalls) / bf * 100).toFixed(1) + '%']);
    }
    if (isFinite(ip) && ip > 0 && stat.homeRuns != null) {
      out.push(['HR/9', (Number(stat.homeRuns) * 9 / ip).toFixed(2)]);
    }
    if (stat.avg != null) out.push(['Opp AVG', stat.avg]);
    return out;
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

  function starterPanel(sport, game, side, people) {
    var label = fullName(sport, game, side);
    var id = game[side + '_starter_id'];
    var person = people[id];
    var name = person ? person.name : (game[side + '_starter'] || 'Probable Starter Not Published');
    var stat = (person && person.stat) || {};
    var hand = (person && person.throws) || String(game[side + '_hand'] || '').toUpperCase();
    var handLabel = hand === 'L' ? 'LHP' : (hand === 'R' ? 'RHP' : '');
    // The line a scout reads first, at the size that says so, with the counting
    // stats behind it underneath. A flat eight-row list gave "Batters Faced"
    // exactly as much weight as ERA.
    var headline = [
      ['ERA', stat.era, 'era'],
      ['WHIP', stat.whip, 'whip'],
      ['Record', stat.wins != null && stat.losses != null ? stat.wins + '-' + stat.losses : null, null],
      ['IP', stat.inningsPitched, null]
    ].map(function (row) {
      if (row[1] == null) return '';
      return '<div class="ca-stat"><span class="ca-stat__label">' + esc(row[0]) +
        '</span><strong class="ca-stat__value ' + (row[2] ? gradeFor(row[1], row[2]) : '') +
        '">' + esc(row[1]) + '</strong></div>';
    }).join('');
    var rows = [
      ['Strikeouts', stat.strikeOuts != null ? stat.strikeOuts : 'Not Published'],
      ['Walks', stat.baseOnBalls != null ? stat.baseOnBalls : 'Not Published'],
      ['Home Runs Allowed', stat.homeRuns != null ? stat.homeRuns : 'Not Published'],
      ['Batters Faced', stat.battersFaced != null ? stat.battersFaced : 'Not Published']
    ];
    var rates = derivedRates(stat).map(function (pair) {
      return '<div class="ca-form-cell"><span class="ca-form-label">' + esc(pair[0]) +
        '</span><strong class="ca-form-value">' + esc(pair[1]) + '</strong></div>';
    }).join('');
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
      (rates ? '<div class="ca-form-grid ca-form-grid--tight">' + rates + '</div>' : '') +
      list(rows) + '</section>';
  }

  /* The centrepiece: one lineup against the other side's arm, with the context
     the fixture already resolves stated rather than left to a filter. */
  function lineupPanel(sport, game, side, people, oppLabel, oppHand) {
    var players = game[side + '_lineup'] || [];
    var teamLabel = fullName(sport, game, side);
    var context = teamLabel + ' \u00b7 ' + (side === 'away' ? 'away' : 'home') +
      (oppHand ? ' \u00b7 versus ' + (oppHand === 'L' ? 'LHP' : 'RHP') : '') +
      ' \u00b7 season to date';

    if (!players.length) {
      return '<section class="ca-lineup-panel"><h3>' + esc(teamLabel) + ' lineup</h3>' +
        '<p class="ca-lineup-context">' + esc(context) + '</p>' +
        '<p class="ca-detail-source-note">Batting order not published yet \u2014 status: ' +
        esc(lineupState(game[side + '_lineup_state'])) +
        '. It appears here as soon as the club posts it.</p></section>';
    }

    var rows = players.map(function (pl, i) {
      var person = people[pl.id] || {};
      var stat = person.stat || {};
      return '<tr>' +
        '<td class="ca-lineup-slot">' + (i + 1) + '</td>' +
        '<td class="ca-lineup-name">' + esc(person.name || pl.fullName || '') + '</td>' +
        '<td>' + esc(((pl.primaryPosition || {}).abbreviation) || person.pos || '') + '</td>' +
        '<td>' + esc(person.bats || '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.avg != null ? stat.avg : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.obp != null ? stat.obp : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.slg != null ? stat.slg : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.ops != null ? stat.ops : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.homeRuns != null ? stat.homeRuns : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.rbi != null ? stat.rbi : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.plateAppearances != null ? stat.plateAppearances : '\u2014') + '</td>' +
        '</tr>';
    }).join('');

    return '<section class="ca-lineup-panel">' +
      '<h3>' + esc(teamLabel) + ' lineup versus ' + esc(oppLabel) + '</h3>' +
      '<p class="ca-lineup-context">' + esc(context) + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>#</th><th>Batter</th><th>Pos</th><th>Bats</th>' +
      '<th class="num">AVG</th><th class="num">OBP</th><th class="num">SLG</th>' +
      '<th class="num">OPS</th><th class="num">HR</th><th class="num">RBI</th>' +
      '<th class="num">PA</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">Season totals, official MLB stats. ' +
      'PA is shown so a small sample is never mistaken for a trend.</p></section>';
  }

  /* A usage bar is the pitcher's own share of his own pitches. The sample is
     printed beside it so a 6% offering is never read as a pattern. */
  function arsenalPanel(sport, game, side, people, rows) {
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
    var bars = rows.map(function (row) {
      var pct = row.pct * 100;
      return '<div class="ca-arsenal-row">' +
        '<span class="ca-arsenal-name">' + esc(row.name) + '</span>' +
        '<span class="ca-arsenal-bar"><span class="ca-arsenal-bar__fill" style="width:' +
        Math.max(1, Math.round(pct)) + '%"></span></span>' +
        '<span class="ca-arsenal-pct">' + pct.toFixed(1) + '%</span>' +
        '<span class="ca-arsenal-meta">' + (isFinite(row.speed) ? row.speed.toFixed(1) + ' mph' : '\u2014') +
        ' \u00b7 n ' + row.count + '</span></div>';
    }).join('');
    return head + '<div class="ca-arsenal-list">' + bars + '</div>' +
      '<p class="ca-detail-source-note">' + (isFinite(total) ? total + ' tracked pitches' : 'Sample not published') +
      '. Share is of this pitcher\u2019s own pitches, so the column sums to 100%.</p></section>';
  }

  function ballparkBody(game, venueRecord) {
    var info = (venueRecord && venueRecord.fieldInfo) || {};
    var loc = (venueRecord && venueRecord.location) || {};
    var dims = ['leftLine', 'leftCenter', 'center', 'rightCenter', 'rightLine']
      .map(function (key) { return info[key]; }).filter(function (v) { return v != null; });
    return '<div class="ca-detail-facts">' +
      fact('Venue', venue(game)) +
      fact('Weather', conditions(game)) +
      fact('Surface', info.turfType || value(game.surface)) +
      fact('Roof', info.roofType || 'Not Published') +
      fact('Capacity', info.capacity != null ? Number(info.capacity).toLocaleString('en-US') : 'Not Published') +
      fact('Elevation', loc.elevation != null ? loc.elevation + ' ft' : 'Not Published') +
      fact('Outfield', dims.length === 5 ? dims.join(' \u00b7 ') + ' ft' : 'Not Published') +
      fact('Start', clock(game.kickoff_utc)) + '</div>' +
      '<p class="ca-detail-source-note">Dimensions run left line, left-centre, centre, right-centre, ' +
      'right line. Ballpark facts come from the official venue record; no park factor is published ' +
      'here because none is measured.</p>';
  }

  function bullpenPanel(sport, game, side, report, quality) {
    var label = fullName(sport, game, side);
    var head = '<section class="ca-bullpen-panel"><h3>' + esc(label) + '</h3>';
    if (report === null || report === undefined) {
      return head + pending('Bullpen workload is loading.') + '</section>';
    }
    if (!report.used.length) {
      return head + '<p class="ca-lineup-context">Last ' + report.games +
        ' completed games</p>' + pending('No relief appearances recorded in this window.') + '</section>';
    }
    var rows = report.used.map(function (rec) {
      var line = (quality || {})[rec.id];
      var stat = (line && line.stat) || {};
      return '<tr>' +
        '<td class="ca-lineup-name">' + esc(rec.name) + (rec.backToBack ?
          ' <span class="ca-flag">back to back</span>' : '') + '</td>' +
        '<td class="num">' + rec.outings.length + '</td>' +
        '<td class="num">' + rec.pitches + '</td>' +
        '<td>' + esc(rec.dates.join(', ')) + '</td>' +
        '<td class="num">' + esc(stat.era != null ? stat.era : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.whip != null ? stat.whip : '\u2014') + '</td>' +
        '<td class="num">' + esc(stat.inningsPitched != null ? stat.inningsPitched : '\u2014') + '</td>' +
        '</tr>';
    }).join('');
    return head +
      '<p class="ca-lineup-context">' + esc(label) + ' \u00b7 relief appearances \u00b7 ' +
      esc(report.window) + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>Reliever</th><th class="num">App</th><th class="num">Pitches</th>' +
      '<th>Dates</th><th class="num">ERA</th><th class="num">WHIP</th><th class="num">IP</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></section>';
  }

  /* Each section's body is its own builder so a stage that resolves late can
     repaint just that block instead of the whole page. */
  function startersBody(sport, game, extra) {
    var people = extra.people || {};
    return '<div class="ca-detail-duo">' +
      starterPanel(sport, game, 'away', people) +
      starterPanel(sport, game, 'home', people) + '</div>' +
      '<p class="ca-detail-source-note">K% and BB% are strikeouts and walks over batters faced; ' +
      'HR/9 is home runs allowed over innings pitched. Each is a quotient of two counting stats ' +
      'listed beneath it.</p>';
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
      arsenalPanel(sport, game, 'away', people, extra.awayArsenal) +
      arsenalPanel(sport, game, 'home', people, extra.homeArsenal) + '</div>';
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
      'league pool, so a bar always shows that rate\u2019s own percentile and never a rating.</p>';
  }

  function bullpenBody(sport, game, extra) {
    return '<div class="ca-detail-stack-inner">' +
      bullpenPanel(sport, game, 'away', extra.awayBullpen, extra.bullpenQuality) +
      bullpenPanel(sport, game, 'home', extra.homeBullpen, extra.bullpenQuality) + '</div>' +
      '<p class="ca-detail-source-note">Read from the official box score of each completed game. ' +
      'Relief appearances only \u2014 a pitcher who started that game is excluded by his own line. ' +
      'Season ERA, WHIP and IP are that reliever\u2019s full-season totals, shown so a heavy recent ' +
      'workload is read beside the arm that carried it.</p>';
  }

  function mlbSections(sport, game, extra) {
    extra = extra || {};
    return [
      section('starters', 'Probable Starters', 'Season Totals From The Official MLB Record',
        startersBody(sport, game, extra)),
      section('lineups', 'Lineup Versus Starter', 'Each Order Against The Opposing Arm',
        lineupsBody(sport, game, extra)),
      section('arsenal', 'Pitch Mix', 'What Each Starter Throws, And How Often',
        arsenalBody(sport, game, extra)),
      section('form', 'Offensive Form And League Context', 'Graded Against The 30-Team League Pool',
        formBody(sport, game)),
      section('bullpens', 'Bullpen Workload', 'Relief Appearances In The Three Days Before This Game',
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
    ['cover_0_rate', 'Cover 0'],
    ['cover_1_rate', 'Cover 1'],
    ['cover_2_rate', 'Cover 2'],
    ['cover_2_man_rate', 'Cover 2 man'],
    ['cover_3_rate', 'Cover 3'],
    ['cover_4_rate', 'Cover 4'],
    ['cover_6_rate', 'Cover 6']
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
    var seasons = (scheme.source_seasons || []).join(', ');
    var bits = [];
    if (seasons) bits.push('Charted from the ' + seasons + ' season');
    if (scheme.charting_samples != null) bits.push(Number(scheme.charting_samples).toLocaleString('en-US') + ' charted plays');
    if (scheme.coverage_samples != null) bits.push(Number(scheme.coverage_samples).toLocaleString('en-US') + ' coverage snaps');
    return bits.join(' \u00b7 ');
  }

  /* One direction of the confrontation: this offence against that defence. */
  function schemePanel(sport, game, offSide, defSide) {
    var offScheme = game[offSide + '_scheme'];
    var defScheme = game[defSide + '_scheme'];
    var offName = fullName(sport, game, offSide);
    var defName = fullName(sport, game, defSide);
    var head = '<section class="ca-scheme-panel"><h3>' + esc(offName) +
      ' offence versus ' + esc(defName) + ' defence</h3>';
    if (!offScheme || !defScheme) {
      return head + pending('Charted scheme profiles are not published for this pairing.') +
        '</section>';
    }
    var defCov = (defScheme.defense || {}).coverage || {};
    var defPressure = (defScheme.defense || {}).pressure || {};
    var offPersonnel = (offScheme.offense || {}).personnel || {};
    var offResponse = (offScheme.offense || {}).response || {};
    var offTargets = (offScheme.offense || {}).target_share || {};
    var seasons = (defScheme.source_seasons || []).join(', ');

    var manZone = '';
    if (defCov.man_rate != null && defCov.zone_rate != null) {
      manZone = '<div class="ca-rate-block"><h4>Coverage split</h4>' +
        stackedBar([
          { label: 'Man', value: Number(defCov.man_rate) },
          { label: 'Zone', value: Number(defCov.zone_rate) }
        ]) +
        '<p class="ca-detail-source-note">' + esc(defName) + ' played zone on ' +
        pctText(defCov.zone_rate) + ' of the charted sample' +
        (seasons ? ' in ' + esc(seasons) : '') + '.</p></div>';
    }

    var shells = COVERAGE_SHELLS
      .filter(function (row) { return defCov[row[0]] != null; })
      .map(function (row) { return { label: row[1], value: Number(defCov[row[0]]) }; });
    var shellBlock = shells.length
      ? '<div class="ca-rate-block"><h4>Coverage shells</h4>' + stackedBar(shells) + '</div>'
      : '';

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
      '<div class="ca-scheme-duo">' +
      '<div class="ca-scheme-col"><h4 class="ca-scheme-col__head">' + esc(defName) +
      ' defence</h4>' + manZone + shellBlock +
      rateTable('Pressure', PRESSURE_ROWS, defPressure) + '</div>' +
      '<div class="ca-scheme-col"><h4 class="ca-scheme-col__head">' + esc(offName) +
      ' offence</h4>' +
      rateTable('Personnel And Formation', PERSONNEL_ROWS, offPersonnel) +
      rateTable('Response By Look', RESPONSE_ROWS, offResponse) +
      targetBlock + '</div>' +
      '</div></section>';
  }

  function formRow(entry) {
    if (!entry) return '';
    var value = Number(entry.value);
    var text = Math.abs(value) < 1 && String(entry.label).indexOf('EPA') < 0
      ? (value * 100).toFixed(1) + '%'
      : (Math.abs(value) < 1 ? epaText(value) : value.toFixed(2));
    return '<div class="ca-form-cell">' +
      '<span class="ca-form-label">' + esc(entry.label) + '</span>' +
      '<strong class="ca-form-value">' + esc(text) + '</strong>' +
      percentBar(entry.rank, entry.of) +
      '<span class="ca-form-rank">' + entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</span>' +
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

  /* The named offence, with faces. Identity, position and depth only - the
     rest of the row those names came from is the model's output and never
     leaves the producer. */
  function playerRow(players, designations) {
    if (!players || !players.length) return '';
    var byName = {};
    (designations || []).forEach(function (entry) {
      byName[String(entry.name || '').toLowerCase()] = entry.status;
    });
    var cards = players.map(function (pl) {
      var status = byName[String(pl.name || '').toLowerCase()];
      var shot = pl.headshot_url
        ? '<img class="ca-person__shot" src="' + esc(pl.headshot_url) + '" alt="' +
          esc(pl.name) + '" width="56" height="56" loading="lazy" decoding="async">'
        : '<span class="ca-person__shot" aria-hidden="true"></span>';
      return '<li class="ca-person">' + shot +
        '<span class="ca-person__slot">' + esc(pl.position) +
        (pl.depth_rank > 1 ? String(pl.depth_rank) : '') + '</span>' +
        '<span class="ca-person__name">' + esc(pl.name) + '</span>' +
        (status ? '<span class="ca-status-pill" data-status="' +
          esc(String(status).toLowerCase().replace(/\s+/g, '-')) + '">' + esc(status) +
          '</span>' : '') + '</li>';
    }).join('');
    return '<ul class="ca-person-row">' + cards + '</ul>';
  }

  function namedQuarterback(game, side) {
    var players = game[side + '_players'] || [];
    for (var i = 0; i < players.length; i++) {
      if (players[i].position === 'QB' && players[i].depth_rank === 1) return players[i].name;
    }
    return game[side + '_starter'] || '';
  }

  function availabilityPanel(sport, game, side) {
    var entries = game[side + '_availability_list'];
    var label = fullName(sport, game, side);
    var qb = namedQuarterback(game, side);
    var head = '<section class="ca-avail-panel"><h3>' + esc(label) + '</h3>' +
      '<p class="ca-lineup-context">' +
      (qb ? 'Quarterback: ' + esc(qb) : 'Quarterback not published') + '</p>' +
      playerRow(game[side + '_players'], entries);
    if (!entries) {
      return head + pending('Injury report not published for this club.') + '</section>';
    }
    if (!entries.length) {
      return head + pending('No designations reported.') + '</section>';
    }
    var rows = entries.map(function (entry) {
      return '<tr>' +
        '<td class="ca-lineup-name">' + esc(entry.name) + '</td>' +
        '<td>' + esc(entry.position || '\u2014') + '</td>' +
        '<td><span class="ca-status-pill" data-status="' +
        esc(String(entry.status || '').toLowerCase().replace(/\s+/g, '-')) + '">' +
        esc(entry.status) + '</span></td>' +
        '<td>' + esc(entry.detail || '\u2014') + '</td></tr>';
    }).join('');
    return head + '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>Player</th><th>Pos</th><th>Designation</th><th>Detail</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></section>';
  }

  var NFL_FORM_ORDER = ['off_epa', 'off_first_down', 'off_explosive', 'off_sack',
    'off_turnover', 'def_epa', 'def_first_down', 'def_explosive', 'def_sack', 'def_turnover'];

  function nflMirror(sport, game) {
    var away = ((game.away_form || {}).rates) || {};
    var home = ((game.home_form || {}).rates) || {};
    var rows = NFL_FORM_ORDER.map(function (key) {
      var entry = away[key] || home[key];
      if (!entry) return '';
      return mirrorRow(entry.label, away[key], home[key], function (v) {
        var n = Number(v);
        if (!isFinite(n)) return '\u2014';
        // A rate under one is a share; an EPA is a per-play margin. Both are
        // published as decimals, so the label decides how to read them.
        return String(entry.label).indexOf('EPA') >= 0
          ? (n > 0 ? '+' : '') + n.toFixed(3)
          : (n * 100).toFixed(1) + '%';
      });
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

  function nflSections(sport, game) {
    var source = game.scheme_source || {};
    return [
      section('availability', 'Quarterbacks And Availability',
        'Official Designations For This Week',
        '<div class="ca-detail-duo">' +
        availabilityPanel(sport, game, 'away') +
        availabilityPanel(sport, game, 'home') + '</div>' +
        '<p class="ca-detail-source-note">Designations come from the official injury report. ' +
        'Players listed active are not repeated here, because active is the default state. ' +
        'The named offence is the club\u2019s current depth chart: identity, position and ' +
        'depth order only. A designation shown beside a name is that player\u2019s own ' +
        'entry on the injury report.</p>'),

      section('scheme', 'Scheme Confrontation',
        'Charted Tendencies, Each Offence Against The Other Defence',
        '<div class="ca-detail-stack-inner">' +
        schemePanel(sport, game, 'away', 'home') +
        schemePanel(sport, game, 'home', 'away') + '</div>' +
        '<p class="ca-detail-source-note">Every rate on this page describes snaps that have ' +
        'already been charted, in the season named beside it. A prior-season rate is not a ' +
        'statement about this game. Distribution bars are shares of the charted sample and ' +
        'sum to 100%.</p>'),

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
      ? [['overview', 'Overview'], ['starters', 'Starters'], ['lineups', 'Lineup Vs Starter'], ['arsenal', 'Pitch Mix'], ['form', 'Offensive form'], ['bullpens', 'Bullpens'], ['conditions', 'Ballpark'], ['sources', 'Sources']]
      : [['overview', 'Overview'], ['availability', 'Availability'], ['scheme', 'Scheme'], ['form', 'Team Form'], ['team-context', 'Rest & travel'], ['conditions', 'Venue'], ['sources', 'Sources']];
    var html = '<a class="ca-detail-back" href="/' + sport + '/">← Back to ' + sport.toUpperCase() + ' matchups</a>' +
      '<article class="ca-detail-hero" id="overview"><header class="ca-detail-hero__meta"><div><p class="ca-detail-eyebrow">' +
      sport.toUpperCase() + ' · Matchup analysis</p><span>' + esc(gameStatus(game)) + '</span></div><span>' +
      esc(value(game.broadcast, 'Broadcast Not Published')) + '</span></header>' +
      '<div class="ca-detail-hero__teams">' + teamHero(sport, game, 'away') + '<div class="ca-detail-center">' +
      scoreOrTime(game) + '</div>' + teamHero(sport, game, 'home') + '</div>' +
      '<div class="ca-detail-facts">' + fact('Venue', venue(game)) + fact('Conditions', conditions(game)) +
      fact('Broadcast', value(game.broadcast)) + fact('Status', gameStatus(game)) + '</div></article>' +
      '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
        return '<a href="#' + item[0] + '">' + item[1] + '</a>';
      }).join('') + '</nav><div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra) : nflSections(sport, game)) +
      section('conditions', sport === 'mlb' ? 'Ballpark And Conditions' : 'Venue, Weather, And Surface', 'Game Environment',
        sport === 'mlb' ? ballparkBody(game, (extra || {}).venue)
          : '<div class="ca-detail-facts">' + fact('Venue', venue(game)) + fact('Weather', conditions(game)) +
            fact('Surface', value(game.surface)) + fact('Roof', value(game.roof)) +
            fact('Start', clock(game.kickoff_utc)) + '</div>') +
      section('sources', 'Sources And Freshness', 'Know What Is Published And When',
        '<p class="ca-detail-source-note">Schedule and identity information: ' + esc(result.source) + '. ' +
        'Published context: ' + esc(publishedTime(result.generatedAt)) + '. Data through: ' +
        esc(publishedTime(result.dataThrough)) + '. Missing fields remain explicitly unavailable and are never inferred from the browser clock.</p>') +
      '</div>';
    host.innerHTML = html;
    host.setAttribute('data-state', 'ready');
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
        Promise.all([
          loadPeople(armIds, 'pitching', season),
          loadPeople(hitterIds, 'hitting', season)
        ]).then(function (batches) {
          extra.people = {};
          batches.forEach(function (batch) {
            Object.keys(batch).forEach(function (id) { extra.people[id] = batch[id]; });
          });
          repaintStarters();
        }).catch(function () { /* identity is already on screen */ });

        // Stage 2 - pitch mix and the ballpark record.
        Promise.all([
          loadArsenal(game.away_starter_id, season),
          loadArsenal(game.home_starter_id, season),
          loadVenue(game.venue_id)
        ]).then(function (parts) {
          extra.awayArsenal = parts[0] || [];
          extra.homeArsenal = parts[1] || [];
          extra.venue = parts[2];
          paintSection(host, 'arsenal', arsenalBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
        }).catch(function () { /* the section keeps its pending note */ });

        // Stage 3 - bullpen workload, then one bulk call for those arms.
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
