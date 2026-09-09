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

  function section(id, title, note, body) {
    return '<section class="ca-detail-section" id="' + esc(id) + '"><header class="ca-detail-section__head"><h2>' +
      esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : '') + '</header>' + body + '</section>';
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

  function mlbSections(sport, game) {
    return [
      section('starters', 'Probable starters', 'Season information when published',
        '<div class="ca-detail-duo">' + teamPanel(sport, game, 'away', starterRows(sport, game, 'away')) +
        teamPanel(sport, game, 'home', starterRows(sport, game, 'home')) + '</div>'),
      section('lineups', 'Lineup availability', 'Confirmed orders replace expected status when posted',
        '<div class="ca-detail-duo">' +
        teamPanel(sport, game, 'away', [['Status', lineupState(game.away_lineup_state)], ['Opposing starter', value(game.home_starter)]]) +
        teamPanel(sport, game, 'home', [['Status', lineupState(game.home_lineup_state)], ['Opposing starter', value(game.away_starter)]]) + '</div>'),
      section('bullpens', 'Bullpen availability', 'Recent workload context',
        '<div class="ca-detail-duo">' +
        teamPanel(sport, game, 'away', [['Availability', value(game.away_bullpen, 'Workload report not published')]]) +
        teamPanel(sport, game, 'home', [['Availability', value(game.home_bullpen, 'Workload report not published')]]) + '</div>')
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

  function render(host, sport, game, result) {
    var awayName = fullName(sport, game, 'away');
    var homeName = fullName(sport, game, 'home');
    document.title = awayName + ' at ' + homeName + ' — Chase Analytics';
    var nav = sport === 'mlb'
      ? [['overview', 'Overview'], ['starters', 'Starters'], ['lineups', 'Lineups'], ['bullpens', 'Bullpens'], ['conditions', 'Conditions'], ['sources', 'Sources']]
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
      (sport === 'mlb' ? mlbSections(sport, game) : nflSections(sport, game)) +
      section('conditions', sport === 'mlb' ? 'Ballpark and conditions' : 'Venue, weather, and surface', 'Game environment',
        '<div class="ca-detail-facts">' + fact('Venue', venue(game)) + fact('Weather', conditions(game)) +
        fact('Surface', value(game.surface)) + fact('Start', clock(game.kickoff_utc)) + '</div>') +
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
      render(host, sport, game, result);
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
