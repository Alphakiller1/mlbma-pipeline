/**
 * Model Center client. Board URLs stay on the server.
 * Numbers load only after /api/model-center/board returns 200.
 */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function qs() {
    try { return new URLSearchParams(location.search || ''); }
    catch (e) { return new URLSearchParams(); }
  }

  function setContext(text) {
    var el = $('mcContext');
    if (el) el.textContent = text;
  }

  function paintGate(title, body) {
    var host = $('mcBoard');
    if (!host) return;
    host.innerHTML = '<div class="ca-card ca-card-pad"><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p></div>';
  }

  function authHeaders() {
    var fallback = global.MLBMA_supabaseStoredToken ? MLBMA_supabaseStoredToken() : null;
    var pending = (global.MLBMA_AUTH && MLBMA_AUTH.getAccessToken)
      ? MLBMA_AUTH.getAccessToken()
      : Promise.resolve(fallback);
    return pending.then(function (jwt) {
      var headers = { Accept: 'application/json' };
      if (jwt) headers.Authorization = 'Bearer ' + jwt;
      return headers;
    });
  }

  function fetchMe() {
    return authHeaders().then(function (headers) {
      return fetch('/api/me', { headers: headers, cache: 'no-store' });
    }).then(function (r) {
      var ct = String(r.headers.get('content-type') || '');
      if (r.status === 401) return { signedIn: false, entitled: false };
      if (r.status === 404 || r.status === 405 || ct.indexOf('application/json') < 0) {
        return { signedIn: false, entitled: false, offline: true };
      }
      if (!r.ok) return { signedIn: false, entitled: false, error: true };
      return r.json().then(function (body) {
        return {
          signedIn: true,
          entitled: !!(body && body.model_center && body.model_center.entitled),
          profile: body && body.profile
        };
      });
    }).catch(function () {
      return { signedIn: false, entitled: false, offline: true };
    });
  }

  /* ---------------------------------------------------------------------
   * Board rendering (2026-09-09). Implements the Model Center reference
   * renderings: a model-versus-market slate board, and a game detail view
   * when ?game= names one.
   *
   * Every value here comes from the entitled /api/model-center/board payload.
   * Nothing is defaulted, derived, or filled in: a field the board did not
   * publish renders as "Not published", never as 0 or a guess. Edge is read
   * from the payload and never recomputed client-side (chase-board/1).
   * ------------------------------------------------------------------ */

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function signed(v, digits) {
    var n = num(v);
    if (n == null) return null;
    return (n > 0 ? '+' : '') + n.toFixed(digits == null ? 1 : digits);
  }

  function fixed(v, digits) {
    var n = num(v);
    return n == null ? null : n.toFixed(digits == null ? 1 : digits);
  }

  /* The reference renderings use a club-coloured abbreviation tile. There is no
     team-colour registry in the asset layer, and inventing one would mean
     hand-picking 62 brand colours, so the chip pairs the official crest with
     the abbreviation instead: same scan speed, real assets, nothing invented. */
  function chip(sport, abbr) {
    var code = String(abbr || '').toUpperCase();
    var logo = '';
    if (code && global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      logo = MLBMAAssets.teamLogoImg(code, 28, 'mc-chip__crest', sport);
    }
    return '<span class="mc-chip">' + logo +
      '<span class="mc-chip__code">' + esc(code || 'n/a') + '</span></span>';
  }

  /* One axis places both marks and both tick labels, and the domain is fixed
     per sport so every card on the board shares a scale and can be compared.
     MLB is run margin, NFL is point margin. */
  function domainFor(sport) { return String(sport).toLowerCase() === 'nfl' ? 10 : 3; }

  function gauge(sport, modelVal, marketVal) {
    var m = num(modelVal), k = num(marketVal);
    if (m == null && k == null) {
      return '<p class="mc-withheld">Model and market lines are not published for this game.</p>';
    }
    var half = domainFor(sport);
    var clamp = function (v) { return Math.max(-half, Math.min(half, v)); };
    var pct = function (v) { return ((clamp(v) + half) / (2 * half)) * 100; };
    // Labels sit directly above their own mark, so the number and the position
    // on the axis read as one object. Each is nudged inside the track at the
    // extremes so a label never overflows the card.
    var label = function (cls, name, v) {
      var x = pct(v);
      var align = x < 12 ? 'left:0;transform:none' : (x > 88 ? 'right:0;transform:none' : 'left:' + x.toFixed(2) + '%;transform:translateX(-50%)');
      return '<div class="mc-gauge__leg ' + cls + '" style="' + align + '">' +
        '<span>' + name + '</span><strong>' + esc(signed(v)) + '</strong></div>';
    };
    var parts = '<div class="mc-gauge">';
    parts += '<div class="mc-gauge__legend">' +
      (m != null ? label('is-model', 'Model', m) : '') +
      (k != null ? label('is-market', 'Market', k) : '') + '</div>';
    parts += '<div class="mc-gauge__track">' +
      '<div class="mc-gauge__zero" style="left:' + pct(0).toFixed(2) + '%"></div>';
    if (m != null && k != null) {
      var lo = Math.min(pct(m), pct(k)), hi = Math.max(pct(m), pct(k));
      parts += '<div class="mc-gauge__span" style="left:' + lo.toFixed(2) +
        '%;width:' + (hi - lo).toFixed(2) + '%"></div>';
    }
    if (k != null) parts += '<div class="mc-gauge__pin mc-gauge__pin--market" style="left:' + pct(k).toFixed(2) + '%"></div>';
    if (m != null) parts += '<div class="mc-gauge__pin" style="left:' + pct(m).toFixed(2) + '%"></div>';
    parts += '</div>';
    parts += '<div class="mc-gauge__axis"><span>' + (-half) + '</span><span>0</span><span>+' + half + '</span></div>';
    return parts + '</div>';
  }

  function readRow(g) {
    var lean = g.lean || g.model_lean || '';
    var withheld = g.edge_withheld_reason;
    // ChaseBoard.mapGame fills edge_withheld_reason with the literal string
    // "not published" whenever a board carries no edge_points. That is the
    // normal case, not a notice worth its own line, so only a real reason
    // is surfaced.
    if (withheld && String(withheld).toLowerCase() === 'not published') withheld = '';
    var vals = '';
    var mm = signed(g.model_margin), km = signed(g.market_margin);
    if (mm) vals += '<span>Model ' + esc(mm) + '</span>';
    if (km) vals += '<span>Market ' + esc(km) + '</span>';
    return '<div class="mc-game__read">' +
      '<div><span class="mc-game__lean">' + esc(lean || 'No lean published') + '</span>' +
      (withheld ? '<span class="mc-withheld mc-game__note">' + esc(withheld) + '</span>' : '') +
      '</div>' +
      (vals ? '<div class="mc-game__values">' + vals + '</div>' : '') + '</div>';
  }

  function gameCard(sport, g) {
    var kick = g.kickoff_display || g.time || '';
    return '<article class="mc-game">' +
      '<header class="mc-game__head"><div class="mc-teams">' +
      chip(sport, g.away) + chip(sport, g.home) + '</div>' +
      (kick ? '<span class="mc-game__time">' + esc(kick) + '</span>' : '') +
      '</header>' +
      gauge(sport, g.model_margin, g.market_margin) +
      readRow(g) +
      '</article>';
  }

  function tile(label, value) {
    return '<div class="mc-tile"><span>' + esc(label) + '</span><strong>' +
      esc(value == null ? 'Not published' : value) + '</strong></div>';
  }

  function trustPanel(board) {
    var perf = board && board.performance;
    var rows = '';
    if (perf && typeof perf === 'object') {
      Object.keys(perf).forEach(function (k) {
        rows += tile(String(k).replace(/_/g, ' '), perf[k]);
      });
    }
    return '<section class="mc-panel mc-trust">' +
      '<div class="mc-trust__head"><h2 class="mc-panel__title">Model trust and performance</h2>' +
      '<span class="mc-badge">Research only</span></div>' +
      (rows ? '<div class="mc-tiles">' + rows + '</div>'
            : '<p class="mc-withheld">Model performance is not published on this board.</p>') +
      '<p class="mc-disclaimer">Not financial, investment, or wagering advice. ' +
      'Models are experimental and for research purposes. The distance between ' +
      'model and market is a gap, not a betting edge.</p></section>';
  }

  function detailView(sport, rawBoard, g) {
    var html = '<section class="mc-panel"><p class="mc-eyebrow">' +
      esc(sport.toUpperCase()) + ' · Game detail</p><div class="mc-hero">' +
      '<div class="mc-hero__side">' + chip(sport, g.away) +
      '<span class="mc-hero__name">' + esc(g.away_name || g.away || '') + '</span>' +
      (g.away_record ? '<span class="mc-hero__sub">' + esc(g.away_record) + '</span>' : '') + '</div>';

    var aScore = fixed(g.away_projected, 1), hScore = fixed(g.home_projected, 1);
    html += '<div class="mc-hero__center"><div class="mc-hero__score">' +
      (aScore != null && hScore != null ? esc(aScore) + ' - ' + esc(hScore) : 'Not published') +
      '</div><div class="mc-hero__label">Projected score</div></div>';

    html += '<div class="mc-hero__side">' + chip(sport, g.home) +
      '<span class="mc-hero__name">' + esc(g.home_name || g.home || '') + '</span>' +
      (g.home_record ? '<span class="mc-hero__sub">' + esc(g.home_record) + '</span>' : '') +
      '</div></div></section>';

    html += '<section class="mc-panel"><h2 class="mc-panel__title">Model versus market</h2>' +
      gauge(sport, g.model_margin, g.market_margin) + readRow(g) + '</section>';

    var totalLabel = sport === 'nfl' ? 'Total points' : 'Total runs';
    html += '<section class="mc-panel"><h2 class="mc-panel__title">Key projections</h2>' +
      '<div class="mc-tiles">' +
      tile((g.away || 'Away') + ' projected', aScore) +
      tile((g.home || 'Home') + ' projected', hScore) +
      tile(totalLabel, fixed(g.total_projected, 1)) +
      tile('Win probability', g.win_probability == null ? null :
        Math.round(Number(g.win_probability) * (Number(g.win_probability) <= 1 ? 100 : 1)) + '%') +
      '</div></section>';

    return html + trustPanel(rawBoard);
  }

  function renderBoard(sport, payload) {
    var host = $('mcBoard');
    if (!host) return;
    // Entitlement succeeded, so the access panel has done its job. paintGate()
    // leaves it visible on every failure path.
    var access = $('mcAccess');
    if (access) access.hidden = true;
    var board = payload && payload.board;
    // normalize(sport, board, extra) takes the sport FIRST. This used to call
    // normalize(board), which put the payload in the sport slot and left the
    // board undefined, so games came back [] and every entitled session saw
    // "No priced games" no matter what the API returned.
    var mapped = global.ChaseBoard && ChaseBoard.normalize
      ? ChaseBoard.normalize(sport, board)
      : board;
    var games = (mapped && mapped.games) || (board && board.games) || [];
    var want = qs().get('game');
    if (want) {
      var one = games.filter(function (g) {
        return String(g.id || g.game_id || '') === want;
      })[0];
      if (!one) {
        paintGate('Game not on this board',
          'Entitlement is verified, but the requested game is not in the published Model Center rows.');
        return;
      }
      host.innerHTML = '<div class="mc-board">' + detailView(sport, board, one) + '</div>';
      return;
    }
    if (!games.length) {
      paintGate('No priced games', 'Entitlement is verified. This sport has no published Model Center rows yet.');
      return;
    }
    var title = sport === 'nfl' ? 'The week' : "Today's slate";
    var html = '<div class="mc-board"><header class="mc-board__head">' +
      '<h2 class="mc-board__title">' + esc(title) + '</h2>' +
      '<span class="mc-board__meta">' + games.length +
      (games.length === 1 ? ' game' : ' games') + ' · ' + esc(sport.toUpperCase()) + '</span></header>' +
      '<div class="mc-grid">' +
      games.map(function (g) { return gameCard(sport, g); }).join('') +
      '</div>' + trustPanel(board) + '</div>';
    host.innerHTML = html;
  }

  function loadBoard(sport) {
    return authHeaders().then(function (headers) {
      return fetch('/api/model-center/board?sport=' + encodeURIComponent(sport), {
        headers: headers,
        cache: 'no-store'
      });
    }).then(function (r) {
      if (r.status === 403) {
        paintGate('Premium required', 'Sign in with an active Chase Analytics Premium subscription to open Model Center.');
        return;
      }
      if (r.status === 401) {
        paintGate('Sign in', 'Model Center is a signed-in product. Use the account panel to continue.');
        return;
      }
      if (r.status === 503 || r.status === 404) {
        paintGate('Board withheld', 'Entitlement is verified. The model board source is not attached to this environment, so no numbers are shown.');
        return;
      }
      if (!r.ok) {
        paintGate('Unavailable', 'Model Center could not load the authenticated board.');
        return;
      }
      return r.json().then(function (payload) { renderBoard(sport, payload); });
    }).catch(function () {
      paintGate('Unavailable', 'Model Center could not reach the entitlement API.');
    });
  }

  function boot() {
    var sport = (qs().get('sport') || 'mlb').toLowerCase();
    if (sport !== 'nfl') sport = 'mlb';
    var game = qs().get('game');
    setContext(game
      ? ('Requested ' + sport.toUpperCase() + ' game ' + game + '. Numbers load only after server-side entitlement.')
      : 'Numbers load only after server-side entitlement.');
    paintGate('Checking access', 'Verifying the session before any model numbers load.');
    var start = global.MLBMA_AUTH && MLBMA_AUTH.init
      ? MLBMA_AUTH.init().catch(function () { return null; })
      : Promise.resolve(null);
    start.then(function () {
      if (global.MLBMA_AUTH_UI && MLBMA_AUTH_UI.mount) {
        document.querySelectorAll('[data-mlbma-auth-panel]').forEach(function (el) {
          MLBMA_AUTH_UI.mount(el);
        });
      }
      return fetchMe();
    }).then(function (me) {
      if (me.offline) {
        paintGate('Sign in on chase-analytics.com', 'Model Center entitlement is verified by /api/me. Local static hosts do not expose that API, so no model numbers are shown.');
        return;
      }
      if (!me.signedIn) {
        paintGate('Sign in', 'Model Center stays empty until a Chase Analytics session is present.');
        return;
      }
      if (!me.entitled) {
        paintGate('Premium required', 'This account is signed in but not entitled. Join Premium, then reload.');
        return;
      }
      return loadBoard(sport);
    });
  }

  global.ChaseModelCenter = { renderBoard: renderBoard };

  // The fixture harness under dashboard/mockups/ sets this so it can drive
  // renderBoard directly. Production pages never set it, so the entitlement
  // path below is the only way real numbers reach the DOM.
  if (global.CHASE_MC_NO_BOOT) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
