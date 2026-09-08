(function (global) {
  'use strict';
  var B = global.ChaseBoard;
  function normalize(board) {
    board = board || {};
    var nb = B && B.normalize ? B.normalize('mlb', board, {
      priced_markets: board.priced_markets || [],
      flagged_tiles: board.flagged_tiles || []
    }) : { schema: 'chase-board/1', sport: 'mlb', games: [], priced_markets: [], flagged_tiles: [] };
    // MLB Picks = priced_markets; Gems = flagged_tiles. Never relabel as Picks in NFL.
    return nb;
  }
  global.ChaseSportMLB = {
    BOARD_URL: 'https://alphakiller1.github.io/mlb-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/mlb-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/mlb-model/record.json',
    normalize: normalize
  };
})(window);
