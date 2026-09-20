/**
 * CFB public-desk adapter.
 *
 * The college-football producer publishes a model board (projections, win
 * probability, totals) rather than an ops slate, so this adapter exposes a
 * load() hook that ChaseMatchupCard.mount() calls directly: it fetches the
 * board + build, maps each game into the desk's card model, and carries the
 * producer honesty fields through untouched (authority, may_bet, unmet gates,
 * unpublished market/edge). It never invents a market or upgrades authority.
 */
(function (global) {
  'use strict';

  var BOARD_URL = 'https://alphakiller1.github.io/cfb-model/board.json';
  var BUILD_URL = 'https://alphakiller1.github.io/cfb-model/build.json';
  var SLATE_URL = 'https://alphakiller1.github.io/cfb-model/slate.json';

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Request failed: ' + r.status);
      return r.json();
    });
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

  // Context label shown where an MLB/NFL card shows the venue: neutral-site
  // and conference framing, which are the "where/what" facts CFB publishes.
  function contextLabel(away, home, g, week) {
    var bits = [];
    if (g.neutral) bits.push('Neutral site');
    if (away.conference && home.conference) {
      bits.push(away.conference === home.conference ? (away.conference + ' game') : 'Non-conference');
    }
    if (week != null) bits.push('Week ' + week);
    return bits.join(' · ') || 'FBS matchup';
  }

  function mapGame(g, board) {
    g = g || {};
    var away = side(g.away);
    var home = side(g.home);
    var margin = g.published_margin != null ? g.published_margin : g.model_margin; // home − away
    return {
      id: String(g.key || g.id || (away.abbr + '@' + home.abbr)),
      sport: 'cfb',
      game_state: 'scheduled',
      kickoff_utc: g.kickoff || g.kickoff_utc || null,
      away: away.abbr,
      home: home.abbr,
      away_name: away.school,
      home_name: home.school,
      away_conf: away.conference,
      home_conf: home.conference,
      away_color: away.color,
      home_color: home.color,
      away_logo: away.logo,
      home_logo: home.logo,
      neutral: g.neutral === true,
      venue: contextLabel(away, home, g, board.week),
      // Model outputs (the CFB producer's published fields).
      win_probability: num(g.win_probability),        // P(home)
      model_margin: num(margin),
      raw_model_margin: num(g.raw_model_margin),
      preseason_margin: num(g.preseason_margin),
      efficiency_margin: num(g.efficiency_margin),
      efficiency_reliability: num(g.efficiency_reliability),
      proj_away: num(g.projected_away_score),
      proj_home: num(g.projected_home_score),
      proj_total: num(g.projected_total),
      independent_total: num(g.independent_total),
      total_model_weight: num(g.total_model_weight),
      total_basis: g.total_basis || null,
      market_margin: num(g.market_margin),
      market_total: num(g.market_total),
      edge_points: num(g.edge_points),
      edge_withheld_reason: g.edge_withheld_reason || null,
      model_regime: g.model_regime || null,
      forecast_source: g.forecast_source || null,
      in_validated_regime: g.in_validated_regime === true,
      action: g.action || null,
      evidence: (board.authority && board.authority.evidence) || ''
    };
  }

  function publicKey(g) {
    return String(g.away_name || g.away || '').toLowerCase() + '|' +
      String(g.home_name || g.home || '').toLowerCase();
  }

  function indexPublic(games) {
    var idx = {};
    (games || []).forEach(function (g) {
      idx[publicKey(g)] = g;
    });
    return idx;
  }

  function mergePublic(mapped, pub) {
    if (!pub) return mapped;
    mapped.away_form = pub.away_form || null;
    mapped.home_form = pub.home_form || null;
    mapped.away_record = pub.away_record || null;
    mapped.home_record = pub.home_record || null;
    mapped.away_conference = pub.away_conference || mapped.away_conf;
    mapped.home_conference = pub.home_conference || mapped.home_conf;
    mapped.away_travel = pub.away_travel || null;
    mapped.home_travel = pub.home_travel || null;
    mapped.stadium = pub.venue || null;
    mapped.roof = pub.roof || null;
    mapped.surface = pub.surface || null;
    mapped.away_recent = pub.away_recent || null;
    mapped.home_recent = pub.home_recent || null;
    if (pub.neutral === true) mapped.neutral = true;
    return mapped;
  }

  function sortGames(games) {
    return games.slice().sort(function (a, b) {
      var ka = String(a.kickoff_utc || ''), kb = String(b.kickoff_utc || '');
      if (ka && kb && ka !== kb) return ka.localeCompare(kb);
      if (ka && !kb) return -1;
      if (!ka && kb) return 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  // ChaseMatchupCard.mount() calls load(dateIso). Returns the desk result shape.
  function load() {
    return Promise.all([
      loadJson(BOARD_URL),
      loadJson(BUILD_URL).catch(function () { return {}; }),
      loadJson(SLATE_URL).catch(function () { return { games: [] }; })
    ]).then(function (parts) {
      var board = parts[0] || {};
      var build = parts[1] || {};
      var published = indexPublic((parts[2] || {}).games);
      var raw = Array.isArray(board.games) ? board.games : [];
      var games = sortGames(raw.map(function (g) {
        return mergePublic(mapGame(g, board), published[publicKey({
          away_name: (g.away && (g.away.school || g.away.name)) || g.away,
          home_name: (g.home && (g.home.school || g.home.name)) || g.home
        })]);
      }));
      var auth = board.authority || {};
      return {
        games: games,
        generatedAt: board.generated_at || board.generated_at_utc || null,
        dataThrough: build.generated_at || build.generated_at_utc || null,
        state: build.state || null,
        source: 'CFB model board',
        authority: {
          level: auth.level || 'unknown',
          may_bet: auth.may_bet === true,
          unmet_gates: auth.unmet_gates || [],
          evidence: auth.evidence || ''
        },
        meta: {
          season: board.season != null ? board.season : null,
          week: board.week != null ? board.week : null,
          regime: board.regime || null,
          total_model_weights: board.total_model_weights || null
        }
      };
    });
  }

  global.ChaseSportCFB = {
    BOARD_URL: BOARD_URL,
    BUILD_URL: BUILD_URL,
    SLATE_URL: SLATE_URL,
    load: load,
    mapGame: mapGame
  };
})(typeof window !== 'undefined' ? window : this);
