/** Public matchup desk — factual MLB/NFL cards, expansion, and slate loading. */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function query() {
    try { return new URLSearchParams(global.location.search || ''); }
    catch (err) { return new URLSearchParams(); }
  }

  function easternDateIso(date) {
    return (date || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  function shiftIso(iso, amount) {
    var parts = String(iso || easternDateIso()).split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function longDate(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3) return 'Date unavailable';
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 16)).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC'
    });
  }

  function clock(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function teamName(sport, abbr, supplied) {
    var registry = global.ChasePublicSportRegistry;
    if (registry && registry.teamName) return registry.teamName(sport, abbr, supplied);
    return supplied || abbr || 'Team unavailable';
  }

  function logoKey(sport, abbr) {
    var registry = global.ChasePublicSportRegistry;
    return registry && registry.logoKey ? registry.logoKey(sport, abbr) : abbr;
  }

  function logoHtml(sport, abbr, supplied, size, className) {
    var name = teamName(sport, abbr, supplied);
    var key = logoKey(sport, abbr);
    if (global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      return MLBMAAssets.teamLogoImg(key, size || 48, className || 'ca-matchup-logo', sport)
        .replace('alt="' + esc(String(key || '').toUpperCase()) + '"', 'alt="' + esc(name) + ' logo"');
    }
    return '<span class="ca-team-logo-placeholder" aria-hidden="true"></span>';
  }

  function headshot(id, name) {
    if (id && global.MLBMAAssets && MLBMAAssets.headshotUrl) {
      return '<img class="ca-matchup-card__shot" src="' + esc(MLBMAAssets.headshotUrl(id, 40, 'matchup')) +
        '" width="40" height="40" alt="' + esc(name || 'Probable starter') + '" loading="lazy" decoding="async">';
    }
    return '<span class="ca-matchup-card__shot ca-matchup-card__shot--empty" aria-hidden="true"></span>';
  }

  function gameStateLabel(state) {
    var value = String(state || 'scheduled').toLowerCase();
    if (value === 'live') return { label: 'Live', tone: 'is-live' };
    if (value === 'final') return { label: 'Final', tone: 'is-final' };
    if (value === 'postponed') return { label: 'Postponed', tone: 'is-watch' };
    if (value === 'delayed') return { label: 'Delayed', tone: 'is-watch' };
    return { label: 'Scheduled', tone: 'is-muted' };
  }

  function lineupLabel(value) {
    var state = String(value || '').toLowerCase();
    if (state.indexOf('confirm') >= 0) return { label: 'Confirmed', tone: 'is-ok' };
    if (state.indexOf('project') >= 0 || state.indexOf('expected') >= 0) return { label: 'Expected', tone: 'is-muted' };
    if (state.indexOf('partial') >= 0) return { label: 'Partial', tone: 'is-watch' };
    return { label: 'Not published', tone: 'is-muted' };
  }

  function safeNumber(value, digits) {
    if (value == null || value === '') return '';
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits == null ? 2 : digits) : '';
  }

  function sideValue(game, side, suffix, fallback) {
    var value = game[side + '_' + suffix];
    return value == null || value === '' ? fallback : value;
  }

  function starterName(game, side, sport) {
    return sideValue(game, side, 'starter', sport === 'nfl' ? 'Quarterback not published' : 'Probable starter not published');
  }

  function starterMeta(game, side, sport) {
    if (sport === 'nfl') return 'Expected quarterback';
    var bits = [];
    var hand = String(sideValue(game, side, 'hand', '')).toUpperCase();
    if (hand === 'R' || hand === 'RHP') bits.push('RHP');
    if (hand === 'L' || hand === 'LHP') bits.push('LHP');
    var era = safeNumber(sideValue(game, side, 'era', ''), 2);
    if (era) bits.push(era + ' ERA');
    return bits.join(' · ') || 'Season line not published';
  }

  function conditions(game) {
    if (game.conditions) return game.conditions;
    return [game.weather_temp ? game.weather_temp + '°' : '', game.weather_cond, game.weather_wind]
      .filter(Boolean).join(' · ') || 'Conditions not published';
  }

  function venue(game) {
    return [game.venue, game.venue_city].filter(Boolean).join(' · ') || 'Venue not published';
  }

  function kickoff(game) {
    var state = String(game.game_state || '').toLowerCase();
    if ((state === 'live' || state === 'final') && game.away_score != null && game.home_score != null) {
      return esc(game.away_score) + '–' + esc(game.home_score) + ' · ' + (state === 'final' ? 'Final' : 'Live');
    }
    return esc(game.kickoff_display || clock(game.kickoff_utc) || 'Time not published');
  }

  function fullMatchupUrl(sport, game) {
    var href = '/' + sport + '/matchup.html?game=' + encodeURIComponent(game.id || '');
    if (game.game_pk) href += '&gamePk=' + encodeURIComponent(game.game_pk);
    if (game.kickoff_utc) href += '&date=' + encodeURIComponent(easternDateIso(new Date(game.kickoff_utc)));
    return href;
  }

  function teamBlock(sport, game, side) {
    var abbr = game[side];
    var supplied = game[side + '_name'];
    var name = teamName(sport, abbr, supplied);
    var record = game[side + '_record'];
    // Identity is a club-coloured abbreviation tab plus the official full name.
    // The tab replaced the crest on 2026-09-09 (owner decision, per the Model
    // Center reference renderings): the colour carries the club at a glance and
    // reads with more life than a small monochrome-on-dark crest. The full name
    // and record stay beside it, so the abbreviation never becomes the only
    // identity. The tab is aria-hidden; screen readers get the full name.
    var code = String(abbr || '').toUpperCase();
    var tab = (global.MLBMAAssets && MLBMAAssets.teamTabHtml)
      ? MLBMAAssets.teamTabHtml(code, sport, 'ca-matchup-card__tab')
      : '<span class="ca-team-tab ca-matchup-card__tab" aria-hidden="true">' + esc(code) + '</span>';
    return '<div class="ca-matchup-card__club ca-matchup-card__club--' + side + '">' +
      tab +
      '<div class="ca-matchup-card__club-copy">' +
      '<span class="ca-matchup-card__name">' + esc(name) + '</span>' +
      (record ? '<span class="ca-matchup-card__record">' + esc(record) + '</span>' : '') +
      '</div></div>';
  }

  function starterBlock(sport, game, side) {
    var name = starterName(game, side, sport);
    var id = sideValue(game, side, 'starter_id', '');
    return '<div class="ca-matchup-card__starter">' +
      headshot(id, name) + '<div><span class="ca-matchup-card__starter-label">' +
      (sport === 'nfl' ? 'Quarterback' : 'Probable starter') + '</span>' +
      '<strong>' + esc(name) + '</strong><span>' + esc(starterMeta(game, side, sport)) + '</span></div></div>';
  }

  function miniFact(label, value, tone) {
    return '<div class="ca-matchup-card__fact"><span>' + esc(label) + '</span><strong class="' +
      esc(tone || '') + '">' + esc(value || 'Not published') + '</strong></div>';
  }

  function expandedHtml(sport, game, panelId) {
    var awayName = teamName(sport, game.away, game.away_name);
    var homeName = teamName(sport, game.home, game.home_name);
    var html = '<div class="ca-matchup-card__expand" id="' + esc(panelId) + '" hidden>' +
      '<div class="ca-matchup-card__starters">' + starterBlock(sport, game, 'away') + starterBlock(sport, game, 'home') + '</div>';
    if (sport === 'mlb') {
      var awayLineup = lineupLabel(game.away_lineup_state);
      var homeLineup = lineupLabel(game.home_lineup_state);
      html += '<div class="ca-matchup-card__detail-grid">' +
        miniFact(awayName + ' lineup', awayLineup.label, awayLineup.tone) +
        miniFact(homeName + ' lineup', homeLineup.label, homeLineup.tone) +
        miniFact(awayName + ' bullpen', game.away_bullpen || 'Availability not published') +
        miniFact(homeName + ' bullpen', game.home_bullpen || 'Availability not published') +
        '</div>';
    } else {
      html += '<div class="ca-matchup-card__detail-grid">' +
        miniFact(awayName + ' availability', game.away_availability || game.availability_summary || 'Report not published') +
        miniFact(homeName + ' availability', game.home_availability || game.availability_summary || 'Report not published') +
        miniFact(awayName + ' rest', game.away_rest_days ? game.away_rest_days + ' days' : 'Not published') +
        miniFact(homeName + ' rest', game.home_rest_days ? game.home_rest_days + ' days' : 'Not published') +
        '</div>';
    }
    return html + '<div class="ca-matchup-card__environment">' +
      miniFact('Venue', venue(game)) + miniFact(sport === 'nfl' ? 'Weather and surface' : 'Conditions',
        [conditions(game), game.surface].filter(Boolean).join(' · ')) + '</div></div>';
  }

  function cardHtml(sport, game) {
    var id = 'matchup-' + String(game.id || '').replace(/[^a-z0-9_-]/gi, '-');
    var panelId = id + '-details';
    var state = gameStateLabel(game.game_state);
    var statusLine;
    if (sport === 'mlb') {
      var awayLineup = lineupLabel(game.away_lineup_state);
      var homeLineup = lineupLabel(game.home_lineup_state);
      statusLine = awayLineup.label === homeLineup.label ? awayLineup.label :
        awayLineup.label + ' / ' + homeLineup.label;
    } else {
      statusLine = game.availability_summary || 'Availability report pending';
    }
    return '<article class="ca-matchup-card" id="' + esc(id) + '" data-game="' + esc(game.id) +
      '" data-sport="' + esc(sport) + '">' +
      '<header class="ca-matchup-card__head"><span class="ca-matchup-card__kick">' + kickoff(game) +
      (game.broadcast ? '<span class="ca-matchup-card__broadcast">' + esc(game.broadcast) + '</span>' : '') +
      '</span><span class="ca-status-chip ' + state.tone + '">' + state.label + '</span></header>' +
      '<div class="ca-matchup-card__teams">' + teamBlock(sport, game, 'away') +
      '<span class="ca-matchup-card__versus" aria-hidden="true">at</span>' + teamBlock(sport, game, 'home') + '</div>' +
      '<div class="ca-matchup-card__summary">' + miniFact(sport === 'mlb' ? 'Probable starters' : 'Quarterbacks',
        starterName(game, 'away', sport) + ' · ' + starterName(game, 'home', sport)) +
      miniFact(sport === 'mlb' ? 'Lineup status' : 'Player availability', statusLine) +
      miniFact('Venue', venue(game)) + '</div>' +
      expandedHtml(sport, game, panelId) +
      '<footer class="ca-matchup-card__actions">' +
      '<button type="button" class="ca-matchup-card__expand-btn" data-expand-matchup aria-expanded="false" aria-controls="' +
      esc(panelId) + '"><span>Expand matchup</span><span aria-hidden="true">+</span></button>' +
      '<a class="ca-matchup-card__detail-link" href="' + esc(fullMatchupUrl(sport, game)) + '">Full matchup analysis <span aria-hidden="true">→</span></a>' +
      '</footer></article>';
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Request failed: ' + response.status);
      return response.json();
    });
  }

  function mlbState(game) {
    var abstractState = String(game && game.status && game.status.abstractGameState || '').toLowerCase();
    var detailed = String(game && game.status && game.status.detailedState || '').toLowerCase();
    if (abstractState === 'final') return 'final';
    if (abstractState === 'live') return 'live';
    if (detailed.indexOf('postpon') >= 0) return 'postponed';
    if (detailed.indexOf('delay') >= 0) return 'delayed';
    return 'scheduled';
  }

  function broadcasts(game) {
    var names = [];
    (game.broadcasts || []).forEach(function (item) {
      var name = item && (item.name || item.callSign);
      var type = String(item && item.type || '').toUpperCase();
      if (name && (!type || type === 'TV') && names.indexOf(name) < 0) names.push(name);
    });
    return names.slice(0, 2).join(', ');
  }

  function mapOfficialMlbGame(game) {
    var awayNode = game && game.teams && game.teams.away;
    var homeNode = game && game.teams && game.teams.home;
    var awayTeam = awayNode && awayNode.team;
    var homeTeam = homeNode && homeNode.team;
    if (!awayTeam || !homeTeam) return null;
    var away = String(awayTeam.abbreviation || '').trim();
    var home = String(homeTeam.abbreviation || '').trim();
    if (!away || !home) return null;
    var awayStarter = awayNode.probablePitcher || {};
    var homeStarter = homeNode.probablePitcher || {};
    var location = game.venue && game.venue.location || {};
    var weather = game.weather || {};
    var lineup = game.lineups || {};
    function record(node) {
      var leagueRecord = node && node.leagueRecord;
      return leagueRecord && leagueRecord.wins != null && leagueRecord.losses != null
        ? leagueRecord.wins + '-' + leagueRecord.losses : '';
    }
    function lineupState(players) { return players && players.length ? 'Confirmed' : 'Expected'; }
    return {
      id: String(game.gamePk), game_pk: game.gamePk, sport: 'mlb', game_state: mlbState(game),
      kickoff_utc: game.gameDate || null, away: away, home: home,
      away_name: awayTeam.name || '', home_name: homeTeam.name || '',
      away_record: record(awayNode), home_record: record(homeNode),
      away_score: awayNode.score, home_score: homeNode.score,
      venue: game.venue && game.venue.name || '',
      venue_city: [location.city, location.stateAbbrev].filter(Boolean).join(', '),
      broadcast: broadcasts(game),
      conditions: [weather.temp ? weather.temp + '°' : '', weather.condition, weather.wind].filter(Boolean).join(' · '),
      weather_temp: weather.temp || '', weather_cond: weather.condition || '', weather_wind: weather.wind || '',
      away_starter: awayStarter.fullName || '', home_starter: homeStarter.fullName || '',
      away_starter_id: awayStarter.id || null, home_starter_id: homeStarter.id || null,
      away_hand: awayStarter.pitchHand && awayStarter.pitchHand.code || '',
      home_hand: homeStarter.pitchHand && homeStarter.pitchHand.code || '',
      away_era: awayStarter.era || '', home_era: homeStarter.era || '',
      away_lineup_state: lineupState(lineup.awayPlayers), home_lineup_state: lineupState(lineup.homePlayers),
      freshness: 'Official schedule'
    };
  }

  function sameGame(left, right) {
    if (!left || !right) return false;
    if (left.game_pk && right.game_pk && String(left.game_pk) === String(right.game_pk)) return true;
    return String(left.away || '').toUpperCase() === String(right.away || '').toUpperCase() &&
      String(left.home || '').toUpperCase() === String(right.home || '').toUpperCase();
  }

  function mergeGames(official, curated) {
    if (!official.length) return curated;
    return official.map(function (game) {
      var extra = curated.find(function (candidate) { return sameGame(game, candidate); });
      if (!extra) return game;
      var merged = Object.assign({}, game);
      Object.keys(extra).forEach(function (key) {
        if (extra[key] != null && extra[key] !== '') merged[key] = extra[key];
      });
      merged.id = String(game.id);
      merged.game_pk = game.game_pk;
      return merged;
    });
  }

  function loadGames(sport, adapter, dateIso) {
    if (!adapter || !adapter.SLATE_URL) return Promise.reject(new Error('Public slate URL missing.'));
    var publicRequest = loadJson(adapter.SLATE_URL).then(function (slate) {
      var normalized = global.ChasePublicSlate.normalize(sport, slate);
      return { normalized: normalized, error: null };
    }).catch(function (error) { return { normalized: { games: [] }, error: error }; });
    if (sport !== 'mlb') {
      return publicRequest.then(function (result) {
        if (result.error && !result.normalized.games.length) throw result.error;
        return {
          games: result.normalized.games, generatedAt: result.normalized.generated_at,
          dataThrough: result.normalized.data_through, source: 'Published NFL slate'
        };
      });
    }
    var date = dateIso || query().get('date') || easternDateIso();
    var officialUrl = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(date) +
      '&hydrate=probablePitcher,team,venue,weather,broadcasts,lineups';
    var officialRequest = loadJson(officialUrl).then(function (payload) {
      var games = [];
      (payload.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (game) {
          var mapped = mapOfficialMlbGame(game);
          if (mapped) games.push(mapped);
        });
      });
      return games;
    }).catch(function () { return []; });
    return Promise.all([publicRequest, officialRequest]).then(function (parts) {
      var published = parts[0].normalized;
      var official = parts[1];
      var games = mergeGames(official, published.games || []);
      if (!games.length && parts[0].error) throw parts[0].error;
      return {
        games: games, generatedAt: published.generated_at || null,
        dataThrough: published.data_through || date, dateIso: date,
        source: official.length ? (published.games && published.games.length ? 'Official schedule + published context' : 'Official MLB schedule') : 'Published MLB slate'
      };
    });
  }

  function updateStatus(sport, result) {
    var fields = {
      sport: sport, state: result.games.length ? 'ok' : 'empty', publishedAt: result.generatedAt,
      dataCutoff: result.dataThrough, source: result.source, issues: []
    };
    if (global.ChaseShell && ChaseShell.setContext) ChaseShell.setContext(fields);
    var context = document.getElementById('caContextBar');
    if (context && !result.generatedAt) {
      // AUDIT B3: this printed result.source verbatim, so the bar read
      // "MLB · ok" — a machine status value rendered as visible copy.
      var reading = result.games.length
        ? result.games.length + (result.games.length === 1 ? ' game' : ' games') + ' on the published slate'
        : 'No games on the published slate';
      context.textContent = sport.toUpperCase() + ' · ' + reading +
        (result.dateIso ? ' · ' + longDate(result.dateIso) : '');
      context.setAttribute('data-state', fields.state);
    }
    if (global.ChaseNav && ChaseNav.applyDataStatus && result.generatedAt) ChaseNav.applyDataStatus(fields);
  }

  function filterGames(host, games) {
    var desk = host.__desk || {};
    var term = String(desk.query || '').trim().toLowerCase();
    var filter = desk.filter || 'all';
    return games.filter(function (game) {
      if (desk.results && String(game.game_state || '').toLowerCase() !== 'final') return false;
      if (filter === 'confirmed' && sportLineupState(game).indexOf('Confirmed') < 0) return false;
      if (!term) return true;
      var text = [game.away, game.home, teamName(desk.sport, game.away, game.away_name),
        teamName(desk.sport, game.home, game.home_name), game.venue, game.broadcast,
        game.away_starter, game.home_starter].join(' ').toLowerCase();
      return text.indexOf(term) >= 0;
    });
  }

  function sportLineupState(game) {
    return lineupLabel(game.away_lineup_state).label + ' ' + lineupLabel(game.home_lineup_state).label;
  }

  function toolbarHtml(host, sport, count) {
    var desk = host.__desk || {};
    if (desk.embedded) {
      return '<div class="ca-embedded-slate-head"><span>' + count + ' games</span>' +
        '<a href="/' + sport + '/">View full ' + sport.toUpperCase() + ' slate <span aria-hidden="true">→</span></a></div>';
    }
    var html = '<div class="ca-desk-toolbar"><div class="ca-desk-toolbar__primary">';
    if (sport === 'mlb') {
      html += '<div class="ca-desk-dates" aria-label="Choose MLB date">' +
        '<button type="button" data-date-shift="-1" aria-label="Previous day">←</button>' +
        '<button type="button" class="ca-desk-dates__today" data-date-today>' + longDate(desk.dateIso || easternDateIso()) + '</button>' +
        '<button type="button" data-date-shift="1" aria-label="Next day">→</button></div>';
    } else {
      html += '<strong class="ca-desk-window-label">' + (desk.results ? 'Completed games' : 'Kickoff windows') + '</strong>';
    }
    html += '<label class="ca-desk-search"><span class="sr-only">Search teams, venues, or players</span>' +
      '<input type="search" data-desk-search value="' + esc(desk.query || '') + '" placeholder="Search teams, venues, or players"></label></div>' +
      '<div class="ca-desk-toolbar__secondary"><button type="button" class="ca-desk-chip' +
      ((desk.filter || 'all') === 'all' ? ' is-on' : '') + '" data-filter="all">All games</button>';
    if (sport === 'mlb' && !desk.results) {
      html += '<button type="button" class="ca-desk-chip' + (desk.filter === 'confirmed' ? ' is-on' : '') +
        '" data-filter="confirmed">Confirmed lineups</button>';
    }
    html += '<span class="ca-desk-count" aria-live="polite">' + count + ' games</span></div></div>';
    return html;
  }

  function renderGroups(sport, games) {
    if (sport !== 'nfl') return '<div class="ca-slate-grid">' + games.map(function (game) { return cardHtml(sport, game); }).join('') + '</div>';
    var groups = {};
    games.forEach(function (game) {
      var label = global.ChasePublicSlate.kickoffWindow(game.kickoff_utc);
      (groups[label] = groups[label] || []).push(game);
    });
    return Object.keys(groups).map(function (label) {
      return '<section class="ca-kickoff-window"><header><h2>' + esc(label) + '</h2><span>' + groups[label].length +
        (groups[label].length === 1 ? ' game' : ' games') + '</span></header><div class="ca-slate-grid">' +
        groups[label].map(function (game) { return cardHtml(sport, game); }).join('') + '</div></section>';
    }).join('');
  }

  function render(host) {
    var desk = host.__desk || {};
    var shown = filterGames(host, desk.games || []);
    host.innerHTML = toolbarHtml(host, desk.sport, shown.length) + renderGroups(desk.sport, shown) +
      (!shown.length ? '<div class="ca-empty-state"><h2>' + (desk.results ? 'No completed games' : 'No matching games') +
        '</h2><p>' + (desk.results ? 'Final scores will appear here when games finish.' : 'Adjust the date, filters, or search.') + '</p></div>' : '');
    host.setAttribute('data-state', shown.length ? 'ready' : 'empty');
  }

  function mount(opts) {
    opts = opts || {};
    var host = opts.host;
    if (!host) return Promise.reject(new Error('Slate host missing.'));
    host.__desk = host.__desk || {};
    host.__desk.sport = opts.sport;
    host.__desk.adapter = opts.adapter;
    host.__desk.embedded = !!opts.embedded;
    host.__desk.results = !!opts.results;
    host.__desk.dateIso = opts.dateIso || query().get('date') || easternDateIso();
    host.setAttribute('data-state', 'loading');
    host.innerHTML = '<div class="ca-loading-state" role="status">Loading ' + esc(opts.sport.toUpperCase()) + ' matchups…</div>';
    return loadGames(opts.sport, opts.adapter, host.__desk.dateIso).then(function (result) {
      host.__desk.games = result.games;
      host.__desk.dateIso = result.dateIso || host.__desk.dateIso;
      if (!host.__desk.embedded) updateStatus(opts.sport, result);
      render(host);
      return result;
    }).catch(function (error) {
      host.setAttribute('data-state', 'error');
      host.innerHTML = '<div class="ca-error-state" role="alert"><h2>Matchups unavailable</h2><p>' +
        esc(error.message || 'The published slate could not be loaded.') + '</p><button type="button" data-retry-slate>Retry</button></div>';
      throw error;
    });
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var expand = event.target.closest('[data-expand-matchup]');
      if (expand) {
        var card = expand.closest('.ca-matchup-card');
        var panel = document.getElementById(expand.getAttribute('aria-controls'));
        var opening = expand.getAttribute('aria-expanded') !== 'true';
        var host = card && card.closest('.ca-async');
        if (host) {
          host.querySelectorAll('[data-expand-matchup][aria-expanded="true"]').forEach(function (button) {
            if (button === expand) return;
            button.setAttribute('aria-expanded', 'false');
            button.querySelector('span').textContent = 'Expand matchup';
            var oldPanel = document.getElementById(button.getAttribute('aria-controls'));
            if (oldPanel) oldPanel.hidden = true;
            var oldCard = button.closest('.ca-matchup-card');
            if (oldCard) oldCard.classList.remove('is-expanded');
          });
        }
        expand.setAttribute('aria-expanded', opening ? 'true' : 'false');
        expand.querySelector('span').textContent = opening ? 'Collapse matchup' : 'Expand matchup';
        if (panel) panel.hidden = !opening;
        if (card) card.classList.toggle('is-expanded', opening);
        return;
      }
      var filter = event.target.closest('[data-filter]');
      if (filter) {
        var filterHost = filter.closest('.ca-async');
        if (filterHost && filterHost.__desk) {
          filterHost.__desk.filter = filter.getAttribute('data-filter');
          render(filterHost);
        }
        return;
      }
      var shift = event.target.closest('[data-date-shift]');
      var today = event.target.closest('[data-date-today]');
      if (shift || today) {
        var dateHost = (shift || today).closest('.ca-async');
        if (!dateHost || !dateHost.__desk) return;
        var nextDate = today ? easternDateIso() : shiftIso(dateHost.__desk.dateIso, Number(shift.getAttribute('data-date-shift')));
        mount({ sport: dateHost.__desk.sport, adapter: dateHost.__desk.adapter, host: dateHost,
          dateIso: nextDate, results: dateHost.__desk.results });
        return;
      }
      var retry = event.target.closest('[data-retry-slate]');
      if (retry) {
        var retryHost = retry.closest('.ca-async');
        if (retryHost && retryHost.__desk) mount({ sport: retryHost.__desk.sport, adapter: retryHost.__desk.adapter,
          host: retryHost, dateIso: retryHost.__desk.dateIso, results: retryHost.__desk.results });
      }
    });
    document.addEventListener('input', function (event) {
      if (!event.target.matches('[data-desk-search]')) return;
      var host = event.target.closest('.ca-async');
      if (!host || !host.__desk) return;
      host.__desk.query = event.target.value;
      var start = event.target.selectionStart;
      render(host);
      var next = host.querySelector('[data-desk-search]');
      if (next) { next.focus(); next.setSelectionRange(start, start); }
    });
  }

  bind();

  global.ChaseMatchupCard = {
    mount: mount,
    mountSlate: function (opts) { return mount(opts); },
    mountMlb: function (opts) {
      opts = opts || {};
      opts.sport = 'mlb';
      opts.adapter = opts.adapter || global.ChaseSportMLB;
      return mount(opts);
    },
    loadGames: loadGames,
    fullMatchupUrl: fullMatchupUrl,
    teamName: teamName,
    logoHtml: logoHtml,
    cardHtml: cardHtml
  };
})(typeof window !== 'undefined' ? window : this);
