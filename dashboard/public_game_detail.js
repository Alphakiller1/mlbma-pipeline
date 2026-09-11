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
      entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</span>' +
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
      var bar = '<span class="' + track + '"><span class="ca-mirror__fill"' +
        (styles[which] ? ' data-club="1"' : '') + ' style="width:' +
        (pct == null ? 0 : pct.toFixed(1)) + '%"></span></span>';
      var value = '<span class="' + val + '">' + esc(format(entry.value)) +
        '<i class="' + rankTone(entry.rank, entry.of) + '">' +
        entry.rank + ordinal(entry.rank) + '</i></span>';
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
    var f = fip(stat);
    var headline = [
      ['ERA', stat.era, 'era'],
      ['FIP', f == null ? null : f.toFixed(2), 'era'],
      ['WHIP', stat.whip, 'whip'],
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
    // What this arm has done against each side of the plate, and what his most
    // recent outing actually looked like. Both were in the architecture and
    // neither was being fetched.
    var splits = person && person.splits;
    var splitHtml = '';
    if (splits && (splits.vl || splits.vr)) {
      function splitRow(label, st) {
        if (!st) return '';
        return '<tr><td>' + esc(label) + '</td>' +
          '<td class="num ' + gradeFor(st.avg, 'avg') + '">' + esc(st.avg != null ? st.avg : '\u2014') + '</td>' +
          '<td class="num ' + gradeFor(st.ops, 'ops') + '">' + esc(st.ops != null ? st.ops : '\u2014') + '</td>' +
          '<td class="num">' + esc(st.strikeOuts != null ? st.strikeOuts : '\u2014') + '</td>' +
          '<td class="num">' + esc(st.baseOnBalls != null ? st.baseOnBalls : '\u2014') + '</td>' +
          '<td class="num">' + esc(st.battersFaced != null ? st.battersFaced : '\u2014') + '</td></tr>';
      }
      splitHtml = '<div class="ca-split-block"><h4>Opponents By Side Of The Plate</h4>' +
        '<table class="ca-lineup-table ca-split-table"><thead><tr><th>Faces</th>' +
        '<th class="num">AVG</th><th class="num">OPS</th><th class="num">K</th>' +
        '<th class="num">BB</th><th class="num">BF</th></tr></thead><tbody>' +
        splitRow('Left-handed hitters', splits.vl) +
        splitRow('Right-handed hitters', splits.vr) +
        '</tbody></table></div>';
    }
    var lastHtml = '';
    if (person && person.lastStart) {
      var ls = person.lastStart;
      lastHtml = '<p class="ca-last-start"><span>Last Start</span>' +
        esc(ls.date) + ' \u00b7 ' + esc(ls.innings) + ' IP \u00b7 ' +
        esc(ls.pitches) + ' pitches \u00b7 ' + esc(ls.strikeOuts) + ' K \u00b7 ' +
        esc(ls.baseOnBalls) + ' BB \u00b7 ' + esc(ls.earnedRuns) + ' ER</p>';
    }
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
      lastHtml + splitHtml + list(rows) + '</section>';
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
        '<td>' + esc(person.bats || '\u2014') + '</td>' +
        cell('avg', 'avg') + cell('obp', 'obp') + cell('slg', 'slg') + cell('ops', 'ops') +
        '</tr>';
    }).join('');

    return '<section class="ca-lineup-panel">' +
      '<h3>' + esc(teamLabel) + ' Versus ' + esc(handLabel) + '</h3>' +
      '<p class="ca-lineup-context">' + esc(context) + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>#</th><th>Batter</th><th>Bats</th>' +
      '<th class="num">AVG</th><th class="num">OBP</th>' +
      '<th class="num">SLG</th><th class="num">OPS</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">Every figure is that batter against ' +
      esc(handLabel) + ' this season, not his overall line. Colour grades each ' +
      'rate against the league average for it.</p></section>';
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

  function arsenalPanel(sport, game, side, people, rows, boards) {
    // The away starter faces the home lineup, and the other way round.
    var oppSide = side === 'away' ? 'home' : 'away';
    var canon = (global.ChaseMatchupCard && ChaseMatchupCard.canonTeam) ||
      function (c) { return String(c || '').toUpperCase(); };
    var board = ((boards && boards.teams) || {})[canon(game[oppSide])] || null;
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
      return '<tr data-pitch="' + esc(pitchFamily(row.code)) + '">' +
        '<td class="ca-lineup-name">' + esc(row.name) + '</td>' +
        '<td class="num"><span class="ca-usage ' + usageTone(pct) + '">' +
        usageSquares(pct) + '<b>' + pct.toFixed(1) + '%</b></span></td>' +
        '<td class="num">' + row.count.toLocaleString('en-US') + '</td>' +
        '<td class="num">' + (isFinite(row.speed) ? row.speed.toFixed(1) : '\u2014') + '</td>' +
        '<td class="num">' + (opp && opp.xwoba
          ? esc(formatStat(opp.xwoba.value, 3)) + rankBadge(opp.xwoba) : '\u2014') + '</td>' +
        '<td class="num">' + (opp && opp.whiff_rate
          ? opp.whiff_rate.value.toFixed(1) + '%' + rankBadge(opp.whiff_rate) : '\u2014') + '</td>' +
        '</tr>';
    }).join('');

    return head +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table ca-arsenal-table">' +
      '<thead><tr><th>Pitch</th><th class="num">Usage</th><th class="num">Count</th>' +
      '<th class="num">MPH</th><th class="num">' + esc(oppLabel) + ' xwOBA</th>' +
      '<th class="num">Whiff</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '<p class="ca-detail-source-note">' +
      (isFinite(total) ? total.toLocaleString('en-US') + ' tracked pitches' : 'Sample not published') +
      '. Usage is this pitcher\u2019s share of his own pitches, so the column sums to 100%. ' +
      'The last three columns are how ' + esc(oppLabel) + ' has hit that pitch this ' +
      'season, ranked among clubs with a comparable sample.</p></section>';
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
      // Quality beside workload: an arm that threw 35 pitches yesterday reads
      // differently depending on whether he is the best in the pen or the last
      // man in it. FIP, K% and BB% are arithmetic over counting stats already
      // on the row - the architecture asked for all three and none were here.
      var f = fip(stat);
      var bf = Number(stat.battersFaced);
      function rate(count) {
        if (!isFinite(bf) || bf <= 0 || count == null) return null;
        return Number(count) / bf * 100;
      }
      var k = rate(stat.strikeOuts), bb = rate(stat.baseOnBalls);
      return '<tr>' +
        '<td class="ca-lineup-name">' + esc(rec.name) + (rec.backToBack ?
          ' <span class="ca-flag">back to back</span>' : '') + '</td>' +
        '<td class="num">' + rec.outings.length + '</td>' +
        '<td class="num">' + rec.pitches + '</td>' +
        '<td>' + esc(rec.dates.join(', ')) + '</td>' +
        '<td class="num ' + gradeFor(stat.era, 'era') + '">' +
        esc(stat.era != null ? stat.era : '\u2014') + '</td>' +
        '<td class="num ' + (f == null ? '' : gradeFor(f, 'era')) + '">' +
        (f == null ? '\u2014' : f.toFixed(2)) + '</td>' +
        '<td class="num">' + (k == null ? '\u2014' : k.toFixed(1) + '%') + '</td>' +
        '<td class="num">' + (bb == null ? '\u2014' : bb.toFixed(1) + '%') + '</td>' +
        '<td class="num ' + gradeFor(stat.whip, 'whip') + '">' +
        esc(stat.whip != null ? stat.whip : '\u2014') + '</td>' +
        '</tr>';
    }).join('');
    return head +
      '<p class="ca-lineup-context">' + esc(label) + ' \u00b7 relief appearances \u00b7 ' +
      esc(report.window) + '</p>' +
      '<div class="ca-lineup-scroll"><table class="ca-lineup-table">' +
      '<thead><tr><th>Reliever</th><th class="num">App</th><th class="num">Pitches</th>' +
      '<th>Dates</th><th class="num">ERA</th><th class="num">FIP</th>' +
      '<th class="num">K%</th><th class="num">BB%</th><th class="num">WHIP</th></tr></thead>' +
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
      arsenalPanel(sport, game, 'away', people, extra.awayArsenal, extra.pitchBoard) +
      arsenalPanel(sport, game, 'home', people, extra.homeArsenal, extra.pitchBoard) + '</div>' +
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
      'league pool, so a bar always shows that rate\u2019s own percentile and never a rating.</p>' +
      leagueBoard(sport, game, (window.__caLeagueBoard || null));
  }

  function bullpenBody(sport, game, extra) {
    return '<div class="ca-detail-stack-inner">' +
      bullpenPanel(sport, game, 'away', extra.awayBullpen, extra.bullpenQuality) +
      bullpenPanel(sport, game, 'home', extra.homeBullpen, extra.bullpenQuality) + '</div>' +
      '<p class="ca-detail-source-note">Read from the official box score of each completed game. ' +
      'Relief appearances only \u2014 a pitcher who started that game is excluded by his own line. ' +
      'ERA, FIP, K%, BB% and WHIP are that reliever\u2019s full-season rates, shown so a heavy ' +
      'recent workload is read beside the arm that carried it. ' +
      'FIP = (13\u00b7HR + 3\u00b7(BB+HBP) \u2212 2\u00b7K) / IP + 3.15.</p>';
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
      section('recent', 'Last Ten Games', 'What Each Club Has Actually Been Doing',
        recentBody(sport, game, extra)),
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
      '<span class="ca-form-rank ' + rankTone(entry.rank, entry.of) + '">' +
      entry.rank + ordinal(entry.rank) + ' of ' + entry.of + '</span>' +
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
          paintSection(host, 'recent', recentBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
        });

        // Stage 2 - pitch mix and the ballpark record.
        Promise.all([
          loadArsenal(game.away_starter_id, season),
          loadArsenal(game.home_starter_id, season),
          loadVenue(game.venue_id),
          loadPitchBoard()
        ]).then(function (parts) {
          extra.awayArsenal = parts[0] || [];
          extra.homeArsenal = parts[1] || [];
          extra.venue = parts[2];
          extra.pitchBoard = parts[3];
          paintSection(host, 'arsenal', arsenalBody(sport, game, extra));
          paintSection(host, 'conditions', ballparkBody(game, extra.venue));
        }).catch(function () { /* the section keeps its pending note */ });

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
