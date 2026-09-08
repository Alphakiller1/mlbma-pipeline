/**
 * chase-board/1 helpers. Adapters must not recompute edge or invent priced rows.
 */
(function (global) {
  'use strict';

  function asList(x) { return Array.isArray(x) ? x : []; }

  function auth(board) {
    board = board || {};
    var a = board.authority;
    if (a && typeof a === 'object') {
      return {
        level: a.level || a.authority || 'unknown',
        may_bet: a.may_bet === true,
        unmet_gates: asList(a.unmet_gates),
        evidence: a.evidence || ''
      };
    }
    return {
      level: a || board.authority_level || 'unknown',
      may_bet: board.may_bet === true,
      unmet_gates: asList(board.unmet_gates),
      evidence: board.evidence || ''
    };
  }

  function teamName(side) {
    if (side == null) return '';
    if (typeof side === 'string') return side;
    return side.abbreviation || side.abbr || side.school || side.name || side.team || '';
  }

  function kickoffUtc(g) {
    return g.kickoff_utc || g.commence_time_utc || g.start_utc || g.game_time_utc || null;
  }

  function sortKey(g) {
    return kickoffUtc(g) || g.kickoff || g.commence_time || g.start || '';
  }

  function mapGame(g) {
    g = g || {};
    var away = teamName(g.away) || teamName(g.teams && g.teams.away);
    var home = teamName(g.home) || teamName(g.teams && g.teams.home);
    var priced = g.priced === true || g.has_price === true;
    return {
      id: g.id || g.game_id || (away + '@' + home),
      kickoff_utc: kickoffUtc(g),
      kickoff_display: g.kickoff_display || g.kickoff || g.start_et || null,
      sort_key: sortKey(g),
      away: away,
      home: home,
      model_margin: g.model_margin != null ? g.model_margin : g.model,
      market_margin: g.market_margin != null ? g.market_margin : g.market,
      published_margin: g.published_margin != null ? g.published_margin : g.published,
      edge_points: g.edge_points,
      edge_withheld_reason: g.edge_withheld_reason || (g.edge_points == null ? (g.withheld_reason || 'not published') : null),
      priced: priced,
      book: g.book || null,
      evidence: g.evidence || g.notes || ''
    };
  }

  function sortGames(games) {
    return asList(games).slice().sort(function (a, b) {
      var ka = String(a.sort_key || a.kickoff_utc || '');
      var kb = String(b.sort_key || b.kickoff_utc || '');
      if (ka && kb && ka !== kb) return ka.localeCompare(kb);
      if (ka && !kb) return -1;
      if (!ka && kb) return 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  function normalize(sport, board, extra) {
    board = board || {};
    extra = extra || {};
    var rawGames = asList(board.games || board.slate || board.matchups);
    return {
      schema: 'chase-board/1',
      sport: sport,
      generated_at: board.generated_at_utc || board.generated_at || null,
      authority: auth(board),
      priced_markets: extra.priced_markets != null ? extra.priced_markets : (board.priced_markets || []),
      flagged_tiles: extra.flagged_tiles != null ? extra.flagged_tiles : (board.flagged_tiles || []),
      player_projections: board.player_projections || [],
      games: sortGames(rawGames.map(mapGame))
    };
  }

  global.ChaseBoard = {
    auth: auth,
    mapGame: mapGame,
    sortGames: sortGames,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : this);
