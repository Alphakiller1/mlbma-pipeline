/**
 * mlbma_supabase_headers.js — single source of truth for hub_dataset request headers.
 *
 * Phase 2 of the auth-gated product. Every read of the public `hub_dataset` table goes
 * through here so there is ONE place that decides whether the request is anonymous or
 * authenticated:
 *   - If mlbma_auth.js has persisted a Supabase Auth session (under the isolated
 *     storageKey 'mlbma-auth'), the request goes out AS THAT USER — the user's JWT in the
 *     Authorization header.
 *   - Otherwise (signed out, or the stored token has expired) it falls back to the
 *     anonymous publishable key, exactly like before.
 *
 * hub_dataset is still PUBLIC read today, so attaching the JWT is a harmless no-op right
 * now. This is the wiring that lets a later phase lock the table down to authenticated
 * (or subscribed) users by changing only the RLS policy — no fetch site has to change.
 *
 * It is a pure, synchronous localStorage read: it NEVER loads the Supabase SDK, so
 * anonymous and data-only pages pay nothing and it is safe to call extremely early
 * (e.g. from the inline <head> prefetch, before any other script).
 *
 * NOTE: matchup_shared.js ships an identical guarded copy of `supabaseHeaders` so that
 * data pages which don't load this file still get authenticated reads. If you change the
 * logic here, change it there too.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'mlbma-auth'; // must match mlbma_auth.js
  var EXPIRY_SKEW_MS = 10000;     // treat a token within 10s of expiry as already expired

  // The signed-in user's access token from the persisted session, or null when there is
  // no valid (unexpired) session. Defensive about the stored shape across supabase-js
  // versions: v2 stores the session object directly; older shapes wrap it in
  // currentSession/session.
  function storedAccessToken() {
    try {
      var store = global.localStorage;
      if (!store) return null;
      var raw = store.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var session = parsed && (parsed.access_token ? parsed
        : (parsed.currentSession || parsed.session || null));
      if (!session || !session.access_token) return null;
      // expires_at is unix SECONDS; don't send a dead token (it would just 401 and fall back).
      if (session.expires_at && (session.expires_at * 1000) <= (Date.now() + EXPIRY_SKEW_MS)) {
        return null;
      }
      return session.access_token;
    } catch (e) {
      return null;
    }
  }

  // Headers for a hub_dataset PostgREST request. `apikey` is always the publishable key
  // (PostgREST requires it); `Authorization` carries the user JWT when signed in, else the
  // publishable key (anonymous role).
  function supabaseHeaders(publishableKey) {
    var token = storedAccessToken();
    return {
      apikey: publishableKey,
      Authorization: 'Bearer ' + (token || publishableKey)
    };
  }

  // Don't clobber an already-installed copy — keep one shared global no matter which file
  // (this one, or matchup_shared.js) happens to load first.
  if (!global.MLBMA_supabaseHeaders) global.MLBMA_supabaseHeaders = supabaseHeaders;
  if (!global.MLBMA_supabaseStoredToken) global.MLBMA_supabaseStoredToken = storedAccessToken;
})(window);
