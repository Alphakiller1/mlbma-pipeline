/**
 * CFB adapter (chase-board/1). Wraps the shared ChaseBoard normalizer and
 * re-attaches the CFB-specific model fields the generic mapper drops
 * (team identity, win probability, projected scoreline/total, model regime,
 * efficiency provenance, action label). It never recomputes edge or invents a
 * priced market — the producer's honesty gates travel through untouched.
 */
(function (global) {
  'use strict';
  var B = global.ChaseBoard;

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function side(raw) {
    raw = raw || {};
    if (typeof raw === 'string') return { abbr: raw, school: raw, conference: null, color: null, logo: null };
    return {
      abbr: raw.abbreviation || raw.abbr || raw.school || raw.name || '',
      school: raw.school || raw.name || raw.abbreviation || raw.abbr || '',
      conference: raw.conference || null,
      color: raw.color || null,
      logo: raw.logo || null
    };
  }

  // model_margin / published_margin are home-minus-away (positive → home favored).
  // win_probability is the home team's win probability.
  function mapGame(g) {
    g = g || {};
    var base = (B && B.mapGame) ? B.mapGame(g) : {
      id: null, away: '', home: '', model_margin: g.model_margin,
      market_margin: g.market_margin, published_margin: g.published_margin,
      edge_points: g.edge_points, edge_withheld_reason: g.edge_withheld_reason,
      market_gap: g.market_gap, priced: g.priced === true, kickoff_utc: g.kickoff_utc || null,
      kickoff_display: g.kickoff_display || g.kickoff || null, sort_key: g.kickoff_utc || g.kickoff || ''
    };
    var away = side(g.away);
    var home = side(g.home);
    base.away = base.away || away.abbr;
    base.home = base.home || home.abbr;
    base.away_team = away;
    base.home_team = home;
    base.neutral = g.neutral === true;
    base.same_conference = (away.conference && home.conference && away.conference === home.conference)
      ? away.conference : null;
    base.win_probability = num(g.win_probability);       // P(home wins)
    base.projected_total = num(g.projected_total);
    base.independent_total = num(g.independent_total);
    base.market_total = num(g.market_total);
    base.projected_away_score = num(g.projected_away_score);
    base.projected_home_score = num(g.projected_home_score);
    base.total_model_weight = num(g.total_model_weight);
    base.total_modelled = g.total_modelled === true;
    base.total_basis = g.total_basis || null;
    base.model_regime = g.model_regime || null;
    base.used_efficiency = g.used_efficiency === true;
    base.efficiency_reliability = num(g.efficiency_reliability);
    base.efficiency_margin = num(g.efficiency_margin);
    base.preseason_margin = num(g.preseason_margin);
    base.raw_model_margin = num(g.raw_model_margin);
    base.in_validated_regime = g.in_validated_regime === true;
    base.forecast_source = g.forecast_source || null;
    base.action = g.action || null;
    return base;
  }

  function normalize(board) {
    board = board || {};
    var nb;
    if (B && B.normalize) {
      nb = B.normalize('cfb', board);
      // Re-map games through the CFB mapper so the rich fields survive.
      var raw = Array.isArray(board.games) ? board.games : [];
      nb.games = (B.sortGames ? B.sortGames(raw.map(mapGame)) : raw.map(mapGame));
    } else {
      var games = (Array.isArray(board.games) ? board.games : []).map(mapGame);
      nb = {
        schema: 'chase-board/1',
        sport: 'cfb',
        generated_at: board.generated_at || board.generated_at_utc || null,
        authority: { level: (board.authority && board.authority.level) || 'unknown',
          may_bet: !!(board.authority && board.authority.may_bet),
          unmet_gates: (board.authority && board.authority.unmet_gates) || [],
          evidence: (board.authority && board.authority.evidence) || '' },
        priced_markets: board.priced_markets || [],
        flagged_tiles: board.flagged_tiles || [],
        games: games
      };
    }
    nb.meta = {
      schema_version: board.schema_version || null,
      season: board.season != null ? board.season : null,
      week: board.week != null ? board.week : null,
      order: board.order || null,
      regime: board.regime || null,
      total_model_weights: board.total_model_weights || null,
      lam: board.lam != null ? board.lam : null
    };
    return nb;
  }

  global.ChaseSportCFB = {
    BOARD_URL: 'https://alphakiller1.github.io/cfb-model/board.json',
    BUILD_URL: 'https://alphakiller1.github.io/cfb-model/build.json',
    RECORD_URL: 'https://alphakiller1.github.io/cfb-model/record.json',
    normalize: normalize,
    mapGame: mapGame
  };
})(typeof window !== 'undefined' ? window : this);
