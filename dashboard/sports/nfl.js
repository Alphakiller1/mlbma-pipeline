(function (global) {
  'use strict';
  function asList(x) { return Array.isArray(x) ? x : []; }
  function auth(board) {
    var a = board.authority;
    if (a && typeof a === 'object') {
      return { level: a.level, may_bet: a.may_bet === true, unmet_gates: a.unmet_gates || [], evidence: a.evidence || '' };
    }
    return { level: a || 'unknown', may_bet: board.may_bet === true, unmet_gates: board.unmet_gates || [], evidence: board.evidence || '' };
  }
  function gameTime(g) {
    return g.kickoff_utc || g.kickoff || g.commence_time || '';
  }
  function normalize(board) {
    board = board || {};
    var games = asList(board.games || board.slate || board.matchups);
    return {
      schema: 'chase-board/1',
      sport: 'nfl',
      generated_at: board.generated_at_utc || board.generated_at,
      authority: auth(board),
      games: games.map(function (g) {
        return {
          id: g.id || (g.away + '@' + g.home),
          kickoff_utc: g.kickoff_utc || null,
          kickoff_display: g.kickoff || null,
          sort_key: gameTime(g),
          away: g.away || (g.teams && g.teams.away),
          home: g.home || (g.teams && g.teams.home),
          model_margin: g.model_margin,
          market_margin: g.market_margin,
          published_margin: g.published_margin,
          edge_points: g.edge_points,
          edge_withheld_reason: g.edge_withheld_reason,
          priced: g.priced === true
        };
      }).sort(function (a, b) {
        return String(a.sort_key).localeCompare(String(b.sort_key));
      })
    };
  }
  global.ChaseSportNFL = {
    BOARD_URL: 'https://alphakiller1.github.io/nfl-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/nfl-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/nfl-model/record.json',
    normalize: normalize
  };
})(window);
