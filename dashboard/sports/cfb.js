(function (global) {
  'use strict';
  var B = global.ChaseBoard;
  function normalize(board) {
    if (B && B.normalize) return B.normalize('cfb', board);
    return { schema: 'chase-board/1', sport: 'cfb', games: [], authority: { level: 'unknown', may_bet: false, unmet_gates: [], evidence: '' } };
  }
  global.ChaseSportCFB = {
    BOARD_URL: 'https://alphakiller1.github.io/cfb-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/cfb-model/build.json',
    normalize: normalize
  };
})(window);
