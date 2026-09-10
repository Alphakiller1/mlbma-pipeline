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
    if (!iso || isNaN(date.getTime())) return 'Time not published';
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
    }) + ' · ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function publishedTime(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return 'Not published';
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
    return input == null || input === '' ? (fallback || 'Not published') : input;
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
      '<p>' + esc(value(game[side + '_record'], 'Record not published')) + '</p></div></div>';
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
    return 'Not published';
  }

  function conditions(game) {
    if (game.conditions) return game.conditions;
    return [game.weather_temp ? game.weather_temp + '°' : '', game.weather_cond, game.weather_wind]
      .filter(Boolean).join(' · ') || 'Not published';
  }

  function venue(game) {
    return [game.venue, game.venue_city].filter(Boolean).join(' · ') || 'Not published';
  }

  function scoreOrTime(game) {
    var state = String(game.game_state || '').toLowerCase();
    if ((state === 'live' || state === 'final') && game.away_score != null && game.home_score != null) {
      return '<strong>' + esc(game.away_score) + '–' + esc(game.home_score) + '</strong><p>' + esc(gameStatus(game)) + '</p>';
    }
    return '<strong>' + esc(clock(game.kickoff_utc)) + '</strong><p>' + esc(gameStatus(game)) + '</p>';
  }

  function starterRows(sport, game, side) {
    if (sport === 'nfl') {
      return [
        ['Expected quarterback', value(game[side + '_starter'], 'Not published')],
        ['Player availability', value(game[side + '_availability'] || game.availability_summary, 'Report pending')],
        ['Rest', game[side + '_rest_days'] ? game[side + '_rest_days'] + ' days' : 'Not published'],
        ['Travel', value(game[side + '_travel'])]
      ];
    }
    var hand = String(game[side + '_hand'] || '').toUpperCase();
    if (hand === 'R') hand = 'RHP';
    if (hand === 'L') hand = 'LHP';
    var era = game[side + '_era'];
    if (era != null && era !== '' && Number.isFinite(Number(era))) era = Number(era).toFixed(2);
    return [
      ['Probable starter', value(game[side + '_starter'])],
      ['Throws', value(hand)],
      ['ERA', value(era)],
      ['Lineup status', lineupState(game[side + '_lineup_state'])]
    ];
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

  function starterPanel(sport, game, side, people) {
    var label = fullName(sport, game, side);
    var id = game[side + '_starter_id'];
    var person = people[id];
    var name = person ? person.name : (game[side + '_starter'] || 'Probable starter not published');
    var stat = (person && person.stat) || {};
    var hand = (person && person.throws) || String(game[side + '_hand'] || '').toUpperCase();
    var handLabel = hand === 'L' ? 'LHP' : (hand === 'R' ? 'RHP' : '');
    var rows = [
      ['Record', stat.wins != null && stat.losses != null ? stat.wins + '-' + stat.losses : 'Not published'],
      ['ERA', stat.era != null ? stat.era : 'Not published'],
      ['WHIP', stat.whip != null ? stat.whip : 'Not published'],
      ['Innings', stat.inningsPitched != null ? stat.inningsPitched : 'Not published'],
      ['Strikeouts', stat.strikeOuts != null ? stat.strikeOuts : 'Not published'],
      ['Walks', stat.baseOnBalls != null ? stat.baseOnBalls : 'Not published'],
      ['Home runs allowed', stat.homeRuns != null ? stat.homeRuns : 'Not published'],
      ['Batters faced', stat.battersFaced != null ? stat.battersFaced : 'Not published']
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
      fact('Roof', info.roofType || 'Not published') +
      fact('Capacity', info.capacity != null ? Number(info.capacity).toLocaleString('en-US') : 'Not published') +
      fact('Elevation', loc.elevation != null ? loc.elevation + ' ft' : 'Not published') +
      fact('Outfield', dims.length === 5 ? dims.join(' \u00b7 ') + ' ft' : 'Not published') +
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
    return '<div class="ca-detail-duo">' +
      formPanel(sport, game, 'away') +
      formPanel(sport, game, 'home') + '</div>' +
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
      section('starters', 'Probable starters', 'Season totals from the official MLB record',
        startersBody(sport, game, extra)),
      section('lineups', 'Lineup versus starter', 'Each order against the opposing arm',
        lineupsBody(sport, game, extra)),
      section('arsenal', 'Pitch mix', 'What each starter throws, and how often',
        arsenalBody(sport, game, extra)),
      section('form', 'Offensive form and league context', 'Graded against the 30-team league pool',
        formBody(sport, game)),
      section('bullpens', 'Bullpen workload', 'Relief appearances in the three days before this game',
        bullpenBody(sport, game, extra))
    ].join('');
  }

  function nflSections(sport, game) {
    return [
      section('quarterbacks', 'Quarterbacks and availability', 'Expected status from the published slate',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', starterRows(sport, game, 'away')) +
        teamPanel(sport, game, 'home', starterRows(sport, game, 'home')) + '</div>'),
      section('team-context', 'Rest and travel', 'Factual scheduling context',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', [
          ['Rest', game.away_rest_days ? game.away_rest_days + ' days' : 'Not published'], ['Travel', value(game.away_travel)]
        ]) + teamPanel(sport, game, 'home', [
          ['Rest', game.home_rest_days ? game.home_rest_days + ' days' : 'Not published'], ['Travel', value(game.home_travel)]
        ]) + '</div>')
    ].join('');
  }

  function render(host, sport, game, extra, result) {
    var awayName = fullName(sport, game, 'away');
    var homeName = fullName(sport, game, 'home');
    document.title = awayName + ' at ' + homeName + ' — Chase Analytics';
    var nav = sport === 'mlb'
      ? [['overview', 'Overview'], ['starters', 'Starters'], ['lineups', 'Lineup vs starter'], ['arsenal', 'Pitch mix'], ['form', 'Offensive form'], ['bullpens', 'Bullpens'], ['conditions', 'Ballpark'], ['sources', 'Sources']]
      : [['overview', 'Overview'], ['quarterbacks', 'Quarterbacks'], ['team-context', 'Rest & travel'], ['conditions', 'Conditions'], ['sources', 'Sources']];
    var html = '<a class="ca-detail-back" href="/' + sport + '/">← Back to ' + sport.toUpperCase() + ' matchups</a>' +
      '<article class="ca-detail-hero" id="overview"><header class="ca-detail-hero__meta"><div><p class="ca-detail-eyebrow">' +
      sport.toUpperCase() + ' · Matchup analysis</p><span>' + esc(gameStatus(game)) + '</span></div><span>' +
      esc(value(game.broadcast, 'Broadcast not published')) + '</span></header>' +
      '<div class="ca-detail-hero__teams">' + teamHero(sport, game, 'away') + '<div class="ca-detail-center">' +
      scoreOrTime(game) + '</div>' + teamHero(sport, game, 'home') + '</div>' +
      '<div class="ca-detail-facts">' + fact('Venue', venue(game)) + fact('Conditions', conditions(game)) +
      fact('Broadcast', value(game.broadcast)) + fact('Status', gameStatus(game)) + '</div></article>' +
      '<nav class="ca-detail-nav" aria-label="Matchup sections">' + nav.map(function (item) {
        return '<a href="#' + item[0] + '">' + item[1] + '</a>';
      }).join('') + '</nav><div class="ca-detail-stack">' +
      (sport === 'mlb' ? mlbSections(sport, game, extra) : nflSections(sport, game)) +
      section('conditions', sport === 'mlb' ? 'Ballpark and conditions' : 'Venue, weather, and surface', 'Game environment',
        sport === 'mlb' ? ballparkBody(game, (extra || {}).venue)
          : '<div class="ca-detail-facts">' + fact('Venue', venue(game)) + fact('Weather', conditions(game)) +
            fact('Surface', value(game.surface)) + fact('Roof', value(game.roof)) +
            fact('Start', clock(game.kickoff_utc)) + '</div>') +
      section('sources', 'Sources and freshness', 'Know what is published and when',
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
