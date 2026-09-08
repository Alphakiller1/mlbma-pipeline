(function (global) {
  'use strict';
  function normalize(board) {
    board = board || {};
    return {
      schema: 'chase-board/1',
      sport: 'wnba',
      generated_at: board.generated_at || board.generated_at_utc,
      authority: {
        level: board.authority || 'RESEARCH_ONLY',
        may_bet: board.may_bet === true,
        unmet_gates: board.unmet_gates || [],
        evidence: board.evidence || ''
      },
      games: board.games || []
    };
  }
  global.ChaseSportWNBA = {
    BOARD_URL: 'https://alphakiller1.github.io/wnba-edge-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/wnba-edge-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/wnba-edge-model/record.json',
    normalize: normalize
  };
})(window);
