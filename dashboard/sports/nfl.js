(function (global) {
  'use strict';
  function normalize(slate) {
    if (global.ChasePublicSlate) return ChasePublicSlate.normalize('nfl', slate);
    return { schema: 'chase-public-slate/1', sport: 'nfl', games: [] };
  }
  function detail(game) {
    return fetch('/data/public/nfl/film-coverage.json', {cache: 'no-cache'}).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      game.nfl_film_coverage = data;
      return game;
    }).catch(function () { return game; });
  }
  global.ChaseSportNFL = {
    SLATE_URL: '/data/public/nfl/slate.json',
    normalize: normalize,
    detail: detail
  };
})(window);
