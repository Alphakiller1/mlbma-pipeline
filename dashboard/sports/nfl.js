(function (global) {
  'use strict';
  var B = global.ChaseBoard;
  function normalize(board) {
    if (B && B.normalize) return B.normalize('nfl', board);
    board = board || {};
    return { schema: 'chase-board/1', sport: 'nfl', generated_at: board.generated_at_utc || board.generated_at, authority: { level: 'unknown', may_bet: false, unmet_gates: [], evidence: '' }, games: [] };
  }
  global.ChaseSportNFL = {
    BOARD_URL: 'https://alphakiller1.github.io/nfl-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/nfl-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/nfl-model/record.json',
    normalize: normalize
  };
})(window);
