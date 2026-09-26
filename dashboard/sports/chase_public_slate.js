/**
 * Public Research slate adapter. Allowlisted game fields only.
 * Never rest-spread a producer board.json object.
 */
(function (global) {
  'use strict';

  var ALLOWED = {
    id: 1, sport: 1, week: 1, game_state: 1, kickoff_utc: 1, kickoff_display: 1,
    game_pk: 1, away: 1, home: 1, away_name: 1, home_name: 1,
    away_record: 1, home_record: 1, away_score: 1, home_score: 1,
    venue: 1, venue_city: 1, broadcast: 1, conditions: 1, surface: 1,
    weather_temp: 1, weather_cond: 1, weather_wind: 1,
    away_starter: 1, home_starter: 1, away_starter_id: 1, home_starter_id: 1,
    away_availability_list: 1, home_availability_list: 1, roof: 1,
    away_hand: 1, home_hand: 1, away_era: 1, home_era: 1,
    away_lineup_state: 1, home_lineup_state: 1,
    away_availability: 1, home_availability: 1, availability_summary: 1,
    away_bullpen: 1, home_bullpen: 1, away_rest_days: 1, home_rest_days: 1,
    away_travel: 1, home_travel: 1, freshness: 1,
    away_form: 1, home_form: 1, away_scheme: 1, home_scheme: 1, scheme_source: 1,
    away_players: 1, home_players: 1, away_lineups: 1, home_lineups: 1,
    away_player_coverage: 1, home_player_coverage: 1,
    away_player_scheme: 1, home_player_scheme: 1,
    away_team_stats: 1, home_team_stats: 1,
    away_line_stats: 1, home_line_stats: 1,
    away_player_stats: 1, home_player_stats: 1,
    away_lineup: 1, home_lineup: 1, away_team_id: 1, home_team_id: 1, venue_id: 1,
    away_short_week: 1, home_short_week: 1, away_travel_km: 1, home_travel_km: 1,
    away_tz_shift: 1, home_tz_shift: 1, venue_country: 1
  };

  function asList(x) { return Array.isArray(x) ? x : []; }

  function teamName(side) {
    if (side == null) return '';
    if (typeof side === 'string') return side;
    return side.abbreviation || side.abbr || side.school || side.name || side.team || '';
  }

  function pickScore() {
    var i, v, n;
    for (i = 0; i < arguments.length; i++) {
      v = arguments[i];
      if (v == null || v === '') continue;
      n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function kickoffUtc(g) {
    return g.kickoff_utc || g.commence_time_utc || g.start_utc || g.game_time_utc || null;
  }

  function freshnessState(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') return raw.state || raw.label || null;
    return null;
  }

  function pickAllowed(src) {
    var out = {};
    Object.keys(ALLOWED).forEach(function (k) {
      if (src[k] != null && src[k] !== '') out[k] = src[k];
    });
    return out;
  }

  function mapGame(sport, g) {
    g = g || {};
    var away = teamName(g.away) || teamName(g.teams && g.teams.away);
    var home = teamName(g.home) || teamName(g.teams && g.teams.home);
    var state = g.game_state || g.status || (g.away_score != null && g.home_score != null ? 'final' : 'scheduled');
    var row = {
      id: String(g.id || g.game_id || (away + '@' + home)),
      sport: sport,
      week: g.week != null ? g.week : (g.scheme_source && g.scheme_source.week),
      game_state: String(state).toLowerCase(),
      kickoff_utc: kickoffUtc(g),
      kickoff_display: g.kickoff_display || null,
      game_pk: g.game_pk || g.gamePk || null,
      away: away,
      home: home,
      away_name: g.away_name || null,
      home_name: g.home_name || null,
      away_record: g.away_record || null,
      home_record: g.home_record || null,
      away_score: pickScore(g.away_score, g.away_runs, g.score_away, g.awayScore),
      home_score: pickScore(g.home_score, g.home_runs, g.score_home, g.homeScore),
      venue: g.venue || g.stadium || null,
      venue_city: g.venue_city || null,
      broadcast: g.broadcast || g.tv || null,
      conditions: g.conditions || g.weather_summary || null,
      surface: g.surface || null,
      weather_temp: g.weather_temp || null,
      weather_cond: g.weather_cond || null,
      weather_wind: g.weather_wind || null,
      away_starter: g.away_starter || g.away_qb || null,
      home_starter: g.home_starter || g.home_qb || null,
      away_availability_list: g.away_availability_list || null,
      home_availability_list: g.home_availability_list || null,
      roof: g.roof || null,
      away_starter_id: g.away_starter_id || null,
      home_starter_id: g.home_starter_id || null,
      away_hand: g.away_hand || null,
      home_hand: g.home_hand || null,
      away_era: g.away_era || null,
      home_era: g.home_era || null,
      away_lineup_state: g.away_lineup_state || null,
      home_lineup_state: g.home_lineup_state || null,
      away_availability: g.away_availability || null,
      home_availability: g.home_availability || null,
      availability_summary: g.availability_summary || null,
      away_bullpen: g.away_bullpen || null,
      home_bullpen: g.home_bullpen || null,
      away_rest_days: g.away_rest_days || null,
      home_rest_days: g.home_rest_days || null,
      away_travel: g.away_travel || null,
      home_travel: g.home_travel || null,
      // Observed team form and charted scheme profiles. Both arrive already
      // projected field by field by the producer, so they are carried across
      // whole rather than re-picked key by key here.
      away_form: g.away_form || null,
      home_form: g.home_form || null,
      away_scheme: g.away_scheme || null,
      home_scheme: g.home_scheme || null,
      scheme_source: g.scheme_source || null,
      away_players: g.away_players || null,
      home_players: g.home_players || null,
      away_lineups: g.away_lineups || null,
      home_lineups: g.home_lineups || null,
      away_player_coverage: g.away_player_coverage || null,
      home_player_coverage: g.home_player_coverage || null,
      away_player_scheme: g.away_player_scheme || null,
      home_player_scheme: g.home_player_scheme || null,
      away_team_stats: g.away_team_stats || null,
      home_team_stats: g.home_team_stats || null,
      away_line_stats: g.away_line_stats || null,
      home_line_stats: g.home_line_stats || null,
      away_player_stats: g.away_player_stats || null,
      home_player_stats: g.home_player_stats || null,
      away_lineup: g.away_lineup || null,
      home_lineup: g.home_lineup || null,
      away_team_id: g.away_team_id || null,
      home_team_id: g.home_team_id || null,
      venue_id: g.venue_id || null,
      away_short_week: g.away_short_week != null ? g.away_short_week : null,
      home_short_week: g.home_short_week != null ? g.home_short_week : null,
      away_travel_km: g.away_travel_km != null ? g.away_travel_km : null,
      home_travel_km: g.home_travel_km != null ? g.home_travel_km : null,
      away_tz_shift: g.away_tz_shift != null ? g.away_tz_shift : null,
      home_tz_shift: g.home_tz_shift != null ? g.home_tz_shift : null,
      venue_country: g.venue_country || null,
      freshness: freshnessState(g.freshness)
    };
    return pickAllowed(row);
  }

  function sortGames(games) {
    return asList(games).slice().sort(function (a, b) {
      var ka = String(a.kickoff_utc || '');
      var kb = String(b.kickoff_utc || '');
      if (ka && kb && ka !== kb) return ka.localeCompare(kb);
      if (ka && !kb) return -1;
      if (!ka && kb) return 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function normalize(sport, slate) {
    slate = slate || {};
    var raw = asList(slate.games || slate.slate || slate.matchups);
    return {
      schema: 'chase-public-slate/1',
      sport: sport,
      generated_at: slate.generated_at_utc || slate.generated_at || slate.published_at || null,
      data_through: slate.data_through_utc || slate.data_through || null,
      games: sortGames(raw.map(function (g) { return mapGame(sport, g); }))
    };
  }

  function kickoffWindow(iso) {
    var d = new Date(iso || '');
    if (!iso || isNaN(d.getTime())) return 'Time TBD';
    var dateLabel = d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York'
    });
    var hour = Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }));
    var windowLabel;
    if (hour < 12) windowLabel = 'morning';
    else if (hour < 15) windowLabel = '1:00 PM ET';
    else if (hour < 19) windowLabel = 'late afternoon';
    else windowLabel = 'night';
    return dateLabel + ' · ' + windowLabel;
  }

  function nflWeek(game) {
    game = game || {};
    var raw = game.week != null ? game.week : (game.scheme_source && game.scheme_source.week);
    var week = Number(raw);
    return Number.isInteger(week) && week > 0 ? week : null;
  }

  global.ChasePublicSlate = {
    mapGame: mapGame,
    sortGames: sortGames,
    normalize: normalize,
    kickoffWindow: kickoffWindow,
    nflWeek: nflWeek,
    ALLOWED_GAME_KEYS: Object.keys(ALLOWED)
  };
})(typeof window !== 'undefined' ? window : this);
