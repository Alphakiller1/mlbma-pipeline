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

  function pickScore() {
    var i, v, n;
    for (i = 0; i < arguments.length; i++) {
      v = arguments[i];
      if (v == null || v === '') continue;
      n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
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
      market_gap: g.market_gap != null ? g.market_gap : (
        g.model_margin != null && g.market_margin != null ? Number(g.model_margin) - Number(g.market_margin) : null
      ),
      published_margin: g.published_margin != null ? g.published_margin : g.published,
      edge_points: g.edge_points,
      edge_withheld_reason: g.edge_withheld_reason || (g.edge_points == null ? (g.withheld_reason || 'not published') : null),
      priced: priced,
      book: g.book || null,
      evidence: g.evidence || g.notes || '',
      away_score: pickScore(g.away_score, g.away_runs, g.score_away, g.awayScore, g.score && g.score.away),
      home_score: pickScore(g.home_score, g.home_runs, g.score_home, g.homeScore, g.score && g.score.home),

      /* Entitled-board passthrough. These are carried, never derived: the
         Model Center detail view needs them and normalize() previously dropped
         them, so a board that published a projected score rendered without one.
         A field the board did not send stays null and renders "Not published". */
      away_name: g.away_name || teamName(g.away) || null,
      home_name: g.home_name || teamName(g.home) || null,
      away_record: g.away_record || null,
      home_record: g.home_record || null,
      away_projected: g.away_projected != null ? g.away_projected : g.away_proj,
      home_projected: g.home_projected != null ? g.home_projected : g.home_proj,
      total_projected: g.total_projected != null ? g.total_projected : g.total_proj,
      win_probability: g.win_probability != null ? g.win_probability : g.win_prob,
      lean: g.lean || g.model_lean || null
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

  function signed(value) {
    if (value == null || value === '' || isNaN(value)) return '—';
    var n = Number(value);
    return (n > 0 ? '+' : '') + n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  /** Model Center only. Public sport routes must not call this helper. */
  function marginAxisHtml(game, sport) {
    game = game || {};
    sport = String(sport || '').toLowerCase();
    var domain = sport === 'mlb' ? 2.5 : 6;
    var unit = sport === 'mlb' ? 'run margin' : 'point margin';
    var gap = game.market_gap;
    if (gap == null && game.model_margin != null && game.market_margin != null) {
      gap = Number(game.model_margin) - Number(game.market_margin);
    }
    if (gap == null || isNaN(gap) || game.model_margin == null || game.market_margin == null) return '';
    var clipped = Math.max(-domain, Math.min(domain, Number(gap)));
    var modelLeft = 50 + (clipped / domain) * 50;
    return '<figure class="ca-gap-axis" data-domain="' + domain + '" data-unit="' + unit + '">'
      + '<figcaption>Model–market gap · ' + unit + '</figcaption>'
      + '<div class="ca-gap-axis__track"><span class="ca-gap-axis__zero"></span>'
      + '<span class="ca-gap-axis__line" style="--ca-gap-model:' + modelLeft.toFixed(2) + '%"></span>'
      + '<span class="ca-gap-axis__tick ca-gap-axis__tick--market" style="left:50%"><i></i><b>Market ' + signed(game.market_margin) + '</b></span>'
      + '<span class="ca-gap-axis__tick ca-gap-axis__tick--model" style="left:' + modelLeft.toFixed(2) + '%"><i></i><b>Model ' + signed(game.model_margin) + '</b></span>'
      + '</div><p>A gap is a disagreement with the market, not a betting edge.</p></figure>';
  }

  global.ChaseBoard = {
    auth: auth,
    mapGame: mapGame,
    sortGames: sortGames,
    normalize: normalize,
    marginAxisHtml: marginAxisHtml
  };
})(typeof window !== 'undefined' ? window : this);
