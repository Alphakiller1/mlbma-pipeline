(function (global) {
  'use strict';
  function normalize(slate) {
    if (global.ChasePublicSlate) return ChasePublicSlate.normalize('mlb', slate);
    return { schema: 'chase-public-slate/1', sport: 'mlb', games: [] };
  }
  function mountMatchupRankings(element, ctx) {
    var m = ctx && ctx.m;
    if (!element || !m || !global.LineupView || !LineupView.mountMatchup || !global.LineupModel) return null;
    var view = LineupView.mountMatchup({
      element: element,
      away: m.away,
      home: m.home,
      awayStarter: m.awaySP,
      homeStarter: m.homeSP,
      awayHand: m.awayHand,
      homeHand: m.homeHand
    });
    element.__lineupView = view;
    return view;
  }
  global.ChaseSportMLB = {
    SLATE_URL: '/data/public/mlb/slate.json',
    normalize: normalize,
    mountMatchupRankings: mountMatchupRankings
  };
})(window);
