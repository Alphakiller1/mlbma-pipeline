/**
 * mlbma_auth_ui.js — the account panel behind the header "Sign in" control.
 *
 * Any `<div data-mlbma-auth-panel></div>` present when this script loads is mounted
 * (chase_nav.js creates two: the desktop dropdown and the mobile-menu section, and loads
 * this script on demand). Signed out: Sign in / Create account tabs over the same flow —
 * Google, or an emailed link with a 6-digit code fallback (Supabase creates the account on
 * first sign-in, so "create" is copy, not a different call). Signed in: identity, Discord
 * link, Premium on Patreon, Sign out. Styles live in dashboard/styles/chase-shell.css
 * (`.ca-auth`); nothing here ever blocks a board.
 */
(function (global) {
  'use strict';

  var MOUNT_SELECTOR = '[data-mlbma-auth-panel]';
  // Outbound links come from the central config (dashboard/chase_links.js); fall back to
  // literals so the panel still works where that file isn't loaded.
  var _LINKS = global.CHASE_LINKS || {};
  var PATREON_URL = _LINKS.PATREON || 'https://www.patreon.com/ChaseAnalytics';
  var DISCORD_INVITE_URL = _LINKS.DISCORD_INVITE || 'https://discord.gg/Fb3fHrqK';

  var COPY = {
    signin: {
      title: 'Sign in',
      sub: 'Use the Google account or email you joined with.',
      submit: 'Email me a sign-in link'
    },
    signup: {
      title: 'Create your free account',
      sub: 'Link Discord and unlock Premium through Patreon. Every board stays open without one.',
      submit: 'Create free account'
    }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function googleIcon() {
    return '<svg class="ca-auth__icon" viewBox="0 0 18 18" aria-hidden="true">' +
      '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>' +
      '</svg>';
  }

  function discordIcon() {
    return '<svg class="ca-auth__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.3 18.3 0 0 0-5.42 0c-.17-.4-.42-.89-.63-1.27a.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.6.1 18.1a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.7-3.55-13.7a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.2 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/>' +
      '</svg>';
  }

  function premiumIcon() {
    return '<svg class="ca-auth__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 2l2.9 6.26L21.6 9l-4.8 4.6 1.2 6.7L12 17.1 5.99 20.3l1.2-6.7L2.4 9l6.7-.74L12 2z"/>' +
      '</svg>';
  }

  function msg(e) { return (e && e.message) ? e.message : e; }

  function setStatus(panel, text, kind) {
    var s = panel.querySelector('.ca-auth__status');
    if (!s) return;
    s.className = 'ca-auth__status' + (kind ? ' ca-auth__status--' + kind : '');
    s.textContent = text || '';
  }

  function communityLinks() {
    return '<div class="ca-auth__community">' +
      '<a class="ca-btn ca-auth__link-btn" href="' + esc(PATREON_URL) + '" target="_blank" rel="noopener">' +
      '<span class="ca-auth__premium">' + premiumIcon() + '</span>Get Premium</a>' +
      '<a class="ca-btn ca-auth__link-btn" href="' + esc(DISCORD_INVITE_URL) + '" target="_blank" rel="noopener">' +
      discordIcon() + 'Join Discord</a>' +
      '</div>';
  }

  function renderSignedOut(panel) {
    var mode = panel.getAttribute('data-mlbma-mode') === 'signup' ? 'signup' : 'signin';
    var c = COPY[mode];
    panel.innerHTML =
      '<div class="ca-auth" data-mode="' + mode + '">' +
      '<div class="ca-auth__tabs" role="tablist" aria-label="Account">' +
      '<button type="button" role="tab" class="ca-auth__tab" data-mlbma-action="mode" data-mode="signin" ' +
      'aria-selected="' + (mode === 'signin') + '">Sign in</button>' +
      '<button type="button" role="tab" class="ca-auth__tab" data-mlbma-action="mode" data-mode="signup" ' +
      'aria-selected="' + (mode === 'signup') + '">Create account</button>' +
      '</div>' +
      '<div class="ca-auth__step" data-mlbma-step="start">' +
      '<h2 class="ca-auth__title">' + c.title + '</h2>' +
      '<p class="ca-auth__sub">' + c.sub + '</p>' +
      '<button type="button" class="ca-btn ca-auth__google" data-mlbma-action="google">' +
      googleIcon() + '<span>Continue with Google</span></button>' +
      '<div class="ca-auth__sep">or use email</div>' +
      '<form class="ca-auth__form" data-mlbma-form="magiclink" novalidate>' +
      '<label class="ca-auth__label">Email' +
      '<input class="ca-auth__input" type="email" name="email" autocomplete="email" ' +
      'placeholder="you@example.com" required></label>' +
      '<button type="submit" class="ca-btn ca-btn--primary ca-auth__submit">' + c.submit + '</button>' +
      '</form>' +
      '</div>' +
      // Shown once the email sends. The typed code covers inboxes whose link scanner
      // pre-consumes the one-time link.
      '<div class="ca-auth__step" data-mlbma-step="code" hidden>' +
      '<h2 class="ca-auth__title">Check your inbox</h2>' +
      '<p class="ca-auth__sub">We sent a link and a 6-digit code to <b data-mlbma-sent-to></b>. ' +
      'Open the link, or enter the code here.</p>' +
      '<form class="ca-auth__form" data-mlbma-form="otp" novalidate>' +
      '<label class="ca-auth__label">Code' +
      '<input class="ca-auth__input ca-auth__input--code" type="text" name="code" inputmode="numeric" ' +
      'autocomplete="one-time-code" maxlength="8" placeholder="123456"></label>' +
      '<button type="submit" class="ca-btn ca-btn--primary ca-auth__submit">Verify and sign in</button>' +
      '</form>' +
      '<button type="button" class="ca-auth__text-btn" data-mlbma-action="restart">Use a different email</button>' +
      '</div>' +
      '<p class="ca-auth__status" role="status" aria-live="polite"></p>' +
      communityLinks() +
      '</div>';
  }

  function renderSignedIn(panel, session) {
    var user = session && session.user ? session.user : {};
    var meta = user.user_metadata || {};
    var email = user.email || meta.email || 'your account';
    var name = meta.full_name || meta.name || '';
    var avatar = meta.avatar_url || meta.picture || '';
    var avatarHtml = avatar
      ? '<img class="ca-auth__avatar" src="' + esc(avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="ca-auth__avatar" aria-hidden="true">' + esc((name || email).slice(0, 1).toUpperCase()) + '</span>';
    panel.innerHTML =
      '<div class="ca-auth ca-auth--in">' +
      '<div class="ca-auth__id">' + avatarHtml +
      '<div class="ca-auth__id-meta">' +
      (name ? '<div class="ca-auth__name">' + esc(name) + '</div>' : '') +
      '<div class="ca-auth__email" title="' + esc(email) + '">' + esc(email) + '</div>' +
      '</div></div>' +
      '<div class="ca-auth__row">' +
      '<span class="ca-auth__row-icon">' + discordIcon() + '</span>' +
      '<div class="ca-auth__row-meta"><div class="ca-auth__row-label">Discord</div>' +
      '<div class="ca-auth__row-value is-off" data-mlbma-discord-status>Checking…</div></div>' +
      // Starts Discord OAuth at the Cloudflare Function /api/discord/connect (sends the
      // Supabase JWT; the server does the code exchange + profile write).
      '<button type="button" class="ca-btn ca-auth__row-btn" data-mlbma-action="connect-discord">Connect</button>' +
      '</div>' +
      // Premium = Patreon membership (which auto-grants the Discord role).
      '<div class="ca-auth__row">' +
      '<span class="ca-auth__row-icon ca-auth__premium">' + premiumIcon() + '</span>' +
      '<div class="ca-auth__row-meta"><div class="ca-auth__row-label">Premium</div>' +
      '<div class="ca-auth__row-value is-off">Daily signals and the private Discord</div></div>' +
      '<a class="ca-btn ca-auth__row-btn" href="' + esc(PATREON_URL) + '" target="_blank" rel="noopener">Join</a>' +
      '</div>' +
      '<a class="ca-auth__text-btn" href="' + esc(DISCORD_INVITE_URL) + '" target="_blank" rel="noopener">Join the Discord server</a>' +
      '<button type="button" class="ca-btn ca-auth__signout" data-mlbma-action="signout">Sign out</button>' +
      '<p class="ca-auth__status" role="status" aria-live="polite"></p>' +
      '</div>';
  }

  function render(panel, session) {
    if (session) renderSignedIn(panel, session);
    else renderSignedOut(panel);
  }

  function showStep(panel, step) {
    var steps = panel.querySelectorAll('[data-mlbma-step]');
    for (var i = 0; i < steps.length; i++) {
      steps[i].hidden = steps[i].getAttribute('data-mlbma-step') !== step;
    }
    var tabs = panel.querySelector('.ca-auth__tabs');
    if (tabs) tabs.hidden = step !== 'start';
    var focus = panel.querySelector('[data-mlbma-step="' + step + '"] input');
    if (focus) focus.focus();
  }

  // Fetch the profile once and fill in the Discord status in any signed-in panel.
  // Best-effort and non-blocking — the panel is usable without it.
  function updateAccountFromProfile() {
    if (!global.MLBMA_AUTH || typeof global.MLBMA_AUTH.getProfile !== 'function') return;
    global.MLBMA_AUTH.getProfile().then(applyDiscord).catch(function () { /* keep placeholder */ });
  }

  function applyDiscord(profile) {
    var nodes = document.querySelectorAll('[data-mlbma-discord-status]');
    var linked = !!(profile && profile.discord_user_id);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.textContent = linked
        ? (profile.discord_username ? '@' + profile.discord_username : 'Connected')
        : 'Not connected';
      el.className = 'ca-auth__row-value' + (linked ? '' : ' is-off');
      var btn = el.closest('.ca-auth__row').querySelector('[data-mlbma-action="connect-discord"]');
      if (btn) btn.textContent = linked ? 'Relink' : 'Connect';
    }
  }

  // Ask the Cloudflare Function for a Discord authorize URL (authenticated with the
  // Supabase JWT), then navigate there. /api/* exists only on the Pages deployment.
  function startDiscordConnect(panel) {
    setStatus(panel, 'Starting Discord connection…', 'muted');
    global.MLBMA_AUTH.getAccessToken().then(function (token) {
      if (!token) { setStatus(panel, 'Please sign in first.', 'err'); return; }
      return fetch('/api/discord/connect', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) {
          if (!r.ok) throw new Error('connect ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (data && data.url) { global.location.href = data.url; }
          else throw new Error('no url');
        });
    }).catch(function () {
      setStatus(panel, 'Discord linking could not start. Try again in a moment.', 'err');
    });
  }

  // On returning from a Discord (?discord=) redirect, show a status message, refresh the
  // panel, and strip the params so a reload doesn't repeat them.
  function handleReturnFlags() {
    try {
      var params = new URLSearchParams(global.location.search);
      var d = params.get('discord');
      if (!d) return;
      params.delete('discord'); params.delete('reason');
      var qs = params.toString();
      var clean = global.location.pathname + (qs ? '?' + qs : '') + global.location.hash;
      if (global.history && global.history.replaceState) global.history.replaceState(null, '', clean);
      setTimeout(function () {
        var panels = document.querySelectorAll(MOUNT_SELECTOR);
        var ok = d === 'connected';
        for (var i = 0; i < panels.length; i++) {
          setStatus(panels[i], ok ? 'Discord connected.' : 'Discord connection failed — please try again.', ok ? 'ok' : 'err');
        }
        updateAccountFromProfile();
      }, 900);
    } catch (e) { /* ignore */ }
  }

  function wire(panel) {
    if (panel.getAttribute('data-mlbma-wired') === '1') return;
    panel.setAttribute('data-mlbma-wired', '1');

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mlbma-action]');
      if (!btn || !panel.contains(btn)) return;
      var action = btn.getAttribute('data-mlbma-action');

      if (action === 'mode') {
        var mode = btn.getAttribute('data-mode');
        if (panel.getAttribute('data-mlbma-mode') === mode) return;
        var typed = panel.querySelector('input[name="email"]');
        var keep = typed ? typed.value : '';
        panel.setAttribute('data-mlbma-mode', mode);
        renderSignedOut(panel);
        var fresh = panel.querySelector('input[name="email"]');
        if (fresh) fresh.value = keep;
        var tab = panel.querySelector('[data-mlbma-action="mode"][data-mode="' + mode + '"]');
        if (tab) tab.focus();
      } else if (action === 'restart') {
        setStatus(panel, '');
        showStep(panel, 'start');
      } else if (action === 'google') {
        setStatus(panel, 'Redirecting to Google…', 'muted');
        global.MLBMA_AUTH.signInWithGoogle().catch(function (err) {
          setStatus(panel, 'Could not start Google sign-in: ' + msg(err), 'err');
        });
      } else if (action === 'signout') {
        setStatus(panel, 'Signing out…', 'muted');
        global.MLBMA_AUTH.signOut().catch(function (err) {
          setStatus(panel, 'Sign out failed: ' + msg(err), 'err');
        });
      } else if (action === 'connect-discord') {
        startDiscordConnect(panel);
      }
    });

    panel.addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-mlbma-form]');
      if (!form || !panel.contains(form)) return;
      e.preventDefault();
      var kind = form.getAttribute('data-mlbma-form');
      var submit = form.querySelector('button[type="submit"]');

      if (kind === 'magiclink') {
        var input = form.querySelector('input[name="email"]');
        var email = input ? input.value.trim() : '';
        if (!email || email.indexOf('@') < 1) {
          setStatus(panel, 'Enter a valid email address.', 'err');
          if (input) input.focus();
          return;
        }
        if (submit) submit.disabled = true;
        setStatus(panel, 'Sending…', 'muted');
        global.MLBMA_AUTH.signInWithMagicLink(email).then(function (res) {
          if (res && res.error) throw res.error;
          panel.setAttribute('data-mlbma-email', email);
          var sentTo = panel.querySelector('[data-mlbma-sent-to]');
          if (sentTo) sentTo.textContent = email;
          setStatus(panel, '');
          showStep(panel, 'code');
        }).catch(function (err) {
          setStatus(panel, 'Could not send email: ' + msg(err), 'err');
        }).then(function () { if (submit) submit.disabled = false; });
      } else if (kind === 'otp') {
        var savedEmail = panel.getAttribute('data-mlbma-email') || '';
        var codeInput = form.querySelector('input[name="code"]');
        var code = codeInput ? codeInput.value.replace(/\s+/g, '') : '';
        if (!savedEmail) { showStep(panel, 'start'); return; }
        if (!code) { setStatus(panel, 'Enter the code from your email.', 'err'); return; }
        if (submit) submit.disabled = true;
        setStatus(panel, 'Verifying…', 'muted');
        global.MLBMA_AUTH.verifyEmailOtp(savedEmail, code).then(function (res) {
          if (res && res.error) throw res.error;
          setStatus(panel, 'Signed in.', 'ok'); // onAuthStateChange repaints the panel
        }).catch(function () {
          // Usually an expired code; the link in the same email still works.
          setStatus(panel, 'That code didn\'t verify. It may have expired — use the link in the email, or send a new one.', 'err');
        }).then(function () { if (submit) submit.disabled = false; });
      }
    });
  }

  function mountAll() {
    var panels = document.querySelectorAll(MOUNT_SELECTOR);
    if (!panels.length || !global.MLBMA_AUTH) return;

    for (var i = 0; i < panels.length; i++) {
      // Paint the signed-out form immediately; a session check repaints if signed in.
      renderSignedOut(panels[i]);
      wire(panels[i]);
    }

    var current = null;
    function paint(session) {
      var list = document.querySelectorAll(MOUNT_SELECTOR);
      var changed = !!session !== !!current ||
        (session && current && session.user && current.user && session.user.id !== current.user.id);
      current = session;
      for (var k = 0; k < list.length; k++) {
        wire(list[k]);
        // Token refreshes fire auth events too; only repaint when who is signed in
        // changes, so a half-typed form or a status message is never wiped.
        if (changed || !list[k].hasAttribute('data-mlbma-state')) render(list[k], session);
        list[k].setAttribute('data-mlbma-state', session ? 'in' : 'out');
      }
      if (session && changed) updateAccountFromProfile();
    }

    global.MLBMA_AUTH.getSession().then(function (session) {
      paint(session);
    }).catch(function () { /* keep the already-rendered form */ });
    global.MLBMA_AUTH.onAuthStateChange(function (_event, session) { paint(session); });

    handleReturnFlags();
  }

  global.MLBMA_AUTH_UI = { mount: mountAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})(window);
