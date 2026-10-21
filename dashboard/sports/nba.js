/**
 * NBA public-desk adapter.
 *
 * Reads /data/public/nba/slate.json (scripts/publish_public_nba_slate.py, from
 * the nba-model public slate): identity, venue, rest, injuries, observed team
 * rates and player lines. Fields are picked by name, never rest-spread, and
 * the producer's slate carries no model output (its PUBLIC_FORBIDDEN gate and
 * scripts/validate_public_fields.py both refuse it).
 *
 * Early in a season a club's own rates rest on a game or two, so each side
 * reads this season's rates once it has played MIN_GAMES and last season's
 * until then, and says which it is showing.
 */
(function (global) {
  'use strict';

  var SLATE_URL = '/data/public/nba/slate.json';
  var MIN_GAMES = 5;
  var MIN_ROTATION_GAMES = 3;

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Request failed: ' + r.status);
      return r.json();
    });
  }

  function seasonLabel(season) {
    var end = Number(season);
    return isFinite(end) && end > 2000 ? (end - 1) + '-' + String(end).slice(2) : 'Season';
  }

  function chooseForm(current, prior) {
    var games = current && Number(current.games) || 0;
    if (current && current.rates && games >= MIN_GAMES) {
      return { form: current, basis: seasonLabel(current.season) + ' · ' + games + ' Games', current: true };
    }
    if (prior && prior.rates) {
      return {
        form: prior,
        basis: seasonLabel(prior.season) + ' Season' + (games ? ' · ' + games + ' Played This Season' : ''),
        current: false
      };
    }
    if (current && current.rates) {
      return { form: current, basis: seasonLabel(current.season) + ' · ' + games + (games === 1 ? ' Game' : ' Games'),
        current: true };
    }
    return { form: null, basis: 'Not Rated Yet', current: false };
  }

  function chooseRotation(g, side) {
    var form = g[side + '_form'] || {};
    var now = g[side + '_players'] || [];
    var prior = g[side + '_players_prior'] || [];
    if (now.length && Number(form.games || 0) >= MIN_ROTATION_GAMES) {
      return { players: now, basis: seasonLabel(g.season) + ' Per Game' };
    }
    if (prior.length) return { players: prior, basis: seasonLabel(Number(g.season) - 1) + ' Per Game, Current Roster' };
    return { players: now, basis: seasonLabel(g.season) + ' Per Game' };
  }

  function injuryReport(list) {
    var order = { Out: 0, Doubtful: 1, Questionable: 2, 'Day-To-Day': 3, Probable: 4 };
    var players = (list || []).map(function (i) {
      return { player: i.player_name, status: i.status, injury: i.detail || null,
        detail: i.comment || null, 'return': i.return_date || null,
        updated: i.date ? String(i.date).slice(0, 10) : null, player_id: i.player_id || null };
    }).sort(function (a, b) {
      return (order[a.status] == null ? 9 : order[a.status]) - (order[b.status] == null ? 9 : order[b.status]);
    });
    return { players: players, sources: 'ESPN injury report' };
  }

  // The injury feed names no position; the club's player lines do.
  function availabilityList(list, positions) {
    return (list || []).map(function (i) {
      return { name: i.player_name, status: i.status === 'Day-To-Day' ? 'Questionable' : i.status,
        detail: i.detail || '', position: positions[i.player_id] || '' };
    }).sort(function (a, b) { return (a.status === 'Out' ? 0 : 1) - (b.status === 'Out' ? 0 : 1); });
  }

  function positionsOf(g, side) {
    var out = {};
    (g[side + '_players_prior'] || []).concat(g[side + '_players'] || []).forEach(function (p) {
      if (p && p.player_id && p.position) out[p.player_id] = p.position;
    });
    return out;
  }

  function restLabel(days, b2b) {
    if (b2b) return 'Back-To-Back';
    if (days == null) return 'Season Opener';
    return days + (days === 1 ? ' Day Rest' : ' Days Rest');
  }

  // The card's three-up summary row holds about twenty characters a cell.
  function restShort(days, b2b) {
    if (b2b) return 'B2B';
    if (days == null) return 'Opener';
    return days + 'd Rest';
  }

  function availabilitySummary(g) {
    function count(side) {
      var list = g[side + '_injuries'] || [];
      return list.filter(function (i) { return i.status === 'Out' || i.status === 'Doubtful'; }).length;
    }
    return (g.away || '') + ' ' + count('away') + ' · ' + (g.home || '') + ' ' + count('home') + ' Out';
  }

  function mapGame(g, slate) {
    g = g || {};
    var mapped = {
      id: String(g.id || ''), sport: 'nba', season: g.season || slate.season || null,
      slate_date: slate.slate_date || null,
      game_state: String(g.game_state || 'scheduled').toLowerCase(),
      status_detail: g.status_detail || null,
      kickoff_utc: g.kickoff_utc || null,
      away: g.away, home: g.home, away_name: g.away_name || null, home_name: g.home_name || null,
      away_logo: g.away_logo || null, home_logo: g.home_logo || null,
      away_color: g.away_color || null, home_color: g.home_color || null,
      away_record: g.away_record || null, home_record: g.home_record || null,
      away_split_record: g.away_split_record || null, home_split_record: g.home_split_record || null,
      away_score: g.away_score != null ? g.away_score : null,
      home_score: g.home_score != null ? g.home_score : null,
      venue: g.venue || null, venue_city: g.venue_city || null, broadcast: g.broadcast || null,
      neutral: g.neutral === true,
      availability_summary: availabilitySummary(g),
      // League history, shared by every game: drawn as the age-curve chart.
      aging_curve: ((slate.profile_sources || {}).aging_curve) || null
    };
    ['away', 'home'].forEach(function (side) {
      var pick = chooseForm(g[side + '_form'], g[side + '_form_prior']);
      mapped[side + '_rates'] = (pick.form && pick.form.rates) || {};
      mapped[side + '_rates_basis'] = pick.basis;
      mapped[side + '_rates_current'] = pick.current;
      mapped[side + '_season_games'] = Number((g[side + '_form'] || {}).games || 0);
      var rot = chooseRotation(g, side);
      mapped[side + '_rotation'] = rot.players;
      mapped[side + '_rotation_basis'] = rot.basis;
      mapped[side + '_injuries'] = injuryReport(g[side + '_injuries']);
      mapped[side + '_availability_list'] = availabilityList(g[side + '_injuries'], positionsOf(g, side));
      mapped[side + '_game_log'] = g[side + '_game_log'] || [];
      // How the club plays and who it plays (nba-model profiles.py), and the
      // schedule's toll into tonight.
      mapped[side + '_profile'] = g[side + '_profile'] || null;
      mapped[side + '_schedule'] = g[side + '_schedule'] || null;
      mapped[side + '_rest_days'] = g[side + '_rest_days'] != null ? g[side + '_rest_days'] : null;
      mapped[side + '_b2b'] = g[side + '_b2b'] === true;
      mapped[side + '_rest_label'] = restLabel(g[side + '_rest_days'], g[side + '_b2b'] === true);
      mapped[side + '_rest_short'] = restShort(g[side + '_rest_days'], g[side + '_b2b'] === true);
    });
    return mapped;
  }

  function sortGames(games) {
    return games.slice().sort(function (a, b) {
      var ka = String(a.kickoff_utc || ''), kb = String(b.kickoff_utc || '');
      if (ka !== kb) return ka.localeCompare(kb);
      return String(a.id).localeCompare(String(b.id));
    });
  }

  // ChaseMatchupCard.loadGames() calls load(); it returns the desk result shape.
  function load() {
    return loadJson(SLATE_URL).then(function (slate) {
      slate = slate || {};
      if (slate.sport && slate.sport !== 'nba') throw new Error('The NBA slate is not published.');
      var games = sortGames((slate.games || []).map(function (g) { return mapGame(g, slate); }));
      return {
        games: games,
        generatedAt: slate.generated_at_utc || null,
        dataThrough: slate.data_through_utc || null,
        dateIso: slate.slate_date || null,
        source: 'Published slate'
      };
    });
  }

  global.ChaseSportNBA = {
    SLATE_URL: SLATE_URL,
    MIN_GAMES: MIN_GAMES,
    load: load,
    mapGame: mapGame,
    chooseForm: chooseForm
  };
})(typeof window !== 'undefined' ? window : this);
