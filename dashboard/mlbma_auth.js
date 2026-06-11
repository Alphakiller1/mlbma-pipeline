/**
 * mlbma_auth.js — thin browser auth shell over Supabase Auth.
 *
 * Phase 1 of the auth-gated product. This is the *logic* layer only (no UI). It loads
 * the supabase-js client from a CDN on demand, reads connection info from
 * window.MLBMA_CONFIG.SUPABASE (the publishable / anon key — never a secret), and exposes
 * a tiny window.MLBMA_AUTH facade. It does NOT gate the dashboard or touch hub_dataset
 * loading; including this script is inert until something calls MLBMA_AUTH.init().
 *
 * Public API (window.MLBMA_AUTH):
 *   init()                         -> Promise<client>   (idempotent; loads SDK + client)
 *   getSession()                   -> Promise<Session|null>
 *   getUser()                      -> Promise<User|null>
 *   signInWithGoogle()             -> Promise            (redirects to Google)
 *   signInWithMagicLink(email)     -> Promise            (emails a magic link)
 *   signOut()                      -> Promise
 *   getAccessToken()               -> Promise<string|null>  (JWT for authed API calls)
 *   onAuthStateChange(cb)          -> unsubscribe fn
 *   isConfigured()                 -> boolean
 */
(function (global) {
  'use strict';

  // Pinned UMD build so a CDN "latest" change can't silently break auth.
  var SUPABASE_CDN =
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var STORAGE_KEY = 'mlbma-auth'; // isolated from the dashboard's raw hub_dataset fetches

  var _client = null;
  var _readyPromise = null;
  var _listeners = [];

  function supaConfig() {
    var c = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SUPABASE;
    if (c && c.url && c.publishable_key) return c;
    return null;
  }

  function isConfigured() {
    return !!supaConfig();
  }

  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (global.supabase && typeof global.supabase.createClient === 'function') {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-mlbma-supabase-sdk]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('supabase-js failed to load')); });
        return;
      }
      var s = document.createElement('script');
      s.src = SUPABASE_CDN;
      s.async = true;
      s.setAttribute('data-mlbma-supabase-sdk', '1');
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }

  /** Idempotent: loads the SDK + creates the client once, returns the same promise after. */
  function init() {
    if (_readyPromise) return _readyPromise;
    var cfg = supaConfig();
    if (!cfg) {
      _readyPromise = Promise.reject(new Error('MLBMA_AUTH: window.MLBMA_CONFIG.SUPABASE is missing url/publishable_key'));
      return _readyPromise;
    }
    _readyPromise = loadSdk().then(function () {
      _client = global.supabase.createClient(cfg.url, cfg.publishable_key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // completes OAuth / magic-link redirects automatically
          storageKey: STORAGE_KEY
        }
      });
      _client.auth.onAuthStateChange(function (event, session) {
        for (var i = 0; i < _listeners.length; i++) {
          try { _listeners[i](event, session); } catch (e) { /* listener errors are non-fatal */ }
        }
      });
      return _client;
    });
    return _readyPromise;
  }

  function withClient(fn) {
    return init().then(function () { return fn(_client); });
  }

  function getSession() {
    return withClient(function (c) { return c.auth.getSession(); })
      .then(function (res) { return (res && res.data && res.data.session) || null; })
      .catch(function () { return null; });
  }

  function getUser() {
    return getSession().then(function (s) { return s ? s.user : null; });
  }

  // Fetch the signed-in user's own profiles row (RLS restricts it to their row). Resolves
  // null when signed out or if the row isn't present yet; never rejects.
  function getProfile() {
    return getSession().then(function (s) {
      if (!s || !s.user) return null;
      return withClient(function (c) {
        return c.from('profiles')
          .select('id, email, full_name, avatar_url, role, subscription_status, discord_user_id, discord_username, discord_avatar')
          .eq('id', s.user.id)
          .maybeSingle();
      }).then(function (res) { return (res && res.data) || null; })
        .catch(function () { return null; });
    });
  }

  function getAccessToken() {
    return getSession().then(function (s) { return s ? s.access_token : null; });
  }

  // Land the user back on the page they started from (origin + path, no hash/query so
  // the SDK's detectSessionInUrl can cleanly parse and strip the auth fragment).
  function redirectTarget() {
    return global.location.origin + global.location.pathname;
  }

  function signInWithGoogle() {
    return withClient(function (c) {
      return c.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTarget() }
      });
    });
  }

  function signInWithMagicLink(email) {
    email = (email || '').trim();
    if (!email) return Promise.reject(new Error('email is required'));
    return withClient(function (c) {
      return c.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: redirectTarget() }
      });
    });
  }

  // Verify the 6-digit email code (the robust alternative to clicking the magic link —
  // email link-scanners often pre-consume one-time links, but a typed code can't be).
  // Requires the Supabase email template to include {{ .Token }} so a code is present.
  function verifyEmailOtp(email, token) {
    email = (email || '').trim();
    token = (token || '').trim();
    if (!email || !token) return Promise.reject(new Error('email and code are required'));
    return withClient(function (c) {
      return c.auth.verifyOtp({ email: email, token: token, type: 'email' });
    });
  }

  function signOut() {
    return withClient(function (c) { return c.auth.signOut(); });
  }

  /** Subscribe to auth changes. Returns an unsubscribe function. */
  function onAuthStateChange(cb) {
    if (typeof cb !== 'function') return function () {};
    _listeners.push(cb);
    return function () {
      var idx = _listeners.indexOf(cb);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }

  global.MLBMA_AUTH = {
    init: init,
    isConfigured: isConfigured,
    getSession: getSession,
    getUser: getUser,
    getProfile: getProfile,
    getAccessToken: getAccessToken,
    signInWithGoogle: signInWithGoogle,
    signInWithMagicLink: signInWithMagicLink,
    verifyEmailOtp: verifyEmailOtp,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    // escape hatch for advanced callers (e.g. profile reads); may be null before init()
    _rawClient: function () { return _client; }
  };
})(window);
