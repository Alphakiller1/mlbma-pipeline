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

  function renderBoard(sport, payload) {
    var host = $('mcBoard');
    if (!host) return;
    var board = payload && payload.board;
    var mapped = global.ChaseBoard && ChaseBoard.normalize ? ChaseBoard.normalize(board) : board;
    var games = (mapped && mapped.games) || (board && board.games) || [];
    var want = qs().get('game');
    if (want) {
      games = games.filter(function (g) {
        return String(g.id || g.game_id || '') === want;
      });
    }
    if (!games.length) {
      paintGate('No priced games', 'Entitlement is verified. This sport has no published Model Center rows yet.');
      return;
    }
    var html = '<div class="ca-board-list">';
    games.forEach(function (g) {
      html += '<article class="ca-card ca-card-pad"><h2>' + esc(g.away) + ' at ' + esc(g.home) + '</h2>';
      if (g.model_margin != null) html += '<p>Model margin ' + esc(g.model_margin) + '</p>';
      if (g.market_margin != null) html += '<p>Market margin ' + esc(g.market_margin) + '</p>';
      if (g.edge_points != null) html += '<p>Edge ' + esc(g.edge_points) + '</p>';
      if (g.edge_withheld_reason) html += '<p class="ca-helper">' + esc(g.edge_withheld_reason) + '</p>';
      html += '</article>';
    });
    html += '</div>';
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
