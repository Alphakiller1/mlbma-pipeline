(function (global) {
  'use strict';
  function auth(board) {
    var a = board.authority;
    if (a && typeof a === 'object') {
      return { level: a.level, may_bet: a.may_bet === true, unmet_gates: a.unmet_gates || a.unmet_gates, evidence: a.evidence || '' };
    }
    return { level: a || 'unknown', may_bet: board.may_bet === true, unmet_gates: board.unmet_gates || [], evidence: board.evidence || '' };
  }
  function normalize(board) {
    board = board || {};
    return {
      schema: 'chase-board/1',
      sport: 'cfb',
      generated_at: board.generated_at || board.generated_at_utc,
      authority: auth(board),
      games: (board.games || []).map(function (g) {
        var away = g.away && (g.away.abbreviation || g.away.school || g.away);
        var home = g.home && (g.home.abbreviation || g.home.school || g.home);
        return {
          id: g.id || away + '@' + home,
          kickoff_utc: g.kickoff_utc || null,
          kickoff_display: g.kickoff || null,
          away: away,
          home: home,
          model_margin: g.model_margin,
          market_margin: g.market_margin,
          published_margin: g.published_margin,
          edge_points: g.edge_points,
          edge_withheld_reason: g.edge_withheld_reason,
          book: g.book || null
        };
      })
    };
  }
  global.ChaseSportCFB = {
    BOARD_URL: 'https://alphakiller1.github.io/cfb-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/cfb-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/cfb-model/record.json',
    normalize: normalize
  };
})(window);
