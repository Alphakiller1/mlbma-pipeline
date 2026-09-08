(function (global) {
  'use strict';
  global.ChaseSportMLB = {
    BOARD_URL: 'https://alphakiller1.github.io/mlb-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/mlb-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/mlb-model/record.json',
    normalize: function (board) {
      board = board || {};
      return {
        schema: 'chase-board/1',
        sport: 'mlb',
        generated_at: board.generated_at || board.generated_at_utc,
        authority: {
          level: board.authority || 'unknown',
          may_bet: board.may_bet === true,
          unmet_gates: board.unmet_gates || [],
          evidence: board.evidence || ''
        },
        priced_markets: board.priced_markets || [],
        flagged_tiles: board.flagged_tiles || [],
        games: board.games || board.slate || []
      };
    }
  };
})(window);
