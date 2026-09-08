(function (global) {
  'use strict';
  var B = global.ChaseBoard;
  function normalize(board) {
    board = board || {};
    var nb = B && B.normalize ? B.normalize('wnba', board) : { schema: 'chase-board/1', sport: 'wnba', games: [] };
    if (!nb.authority || nb.authority.level === 'unknown') {
      nb.authority = {
        level: board.authority || 'RESEARCH_ONLY',
        may_bet: board.may_bet === true,
        unmet_gates: board.unmet_gates || [],
        evidence: board.evidence || ''
      };
    }
    return nb;
  }
  global.ChaseSportWNBA = {
    BOARD_URL: 'https://alphakiller1.github.io/wnba-edge-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/wnba-edge-model/build.json',
    normalize: normalize
  };
})(window);
