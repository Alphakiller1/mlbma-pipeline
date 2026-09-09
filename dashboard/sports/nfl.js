(function (global) {
  'use strict';
  function normalize(slate) {
    if (global.ChasePublicSlate) return ChasePublicSlate.normalize('nfl', slate);
    return { schema: 'chase-public-slate/1', sport: 'nfl', games: [] };
  }
  global.ChaseSportNFL = {
    SLATE_URL: '/data/public/nfl/slate.json',
    normalize: normalize
  };
})(window);
