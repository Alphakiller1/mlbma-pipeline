/**
 * mlbma_auth_ui.js — small reusable auth panel.
 *
 * Drop a `<div data-mlbma-auth-panel></div>` anywhere and include this script (after
 * mlbma_auth.js). It self-mounts: signed-out shows "Continue with Google" + an email
 * sign-in form (magic link, with a 6-digit code fallback); signed-in shows the current
 * email, a Discord connection status (Phase 2 prep), and "Sign out". It is purely
 * additive — it never blocks the dashboard or its data loading. Styling reuses the
 * existing design-system CSS variables so it matches the rest of the site.
 */
(function (global) {
  'use strict';

  var MOUNT_SELECTOR = '[data-mlbma-auth-panel]';
  var STYLE_ID = 'mlbma-auth-ui-style';
  var PATREON_URL = 'https://www.patreon.com/ChaseAnalytics';
  var DISCORD_INVITE_URL = 'https://discord.gg/Fb3fHrqK';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.mlbma-auth-card{background:var(--bg-3,var(--card,#18181c));border:1px solid var(--border,#28282f);' +
      'border-radius:14px;padding:20px 22px;max-width:420px;}' +
      '.mlbma-auth-card__title{font-size:15px;font-weight:700;margin:0 0 4px;color:var(--text,#F5F6FA);}' +
      '.mlbma-auth-card__sub{font-size:12.5px;line-height:1.45;color:var(--text-2,#A4A8B6);margin:0 0 16px;}' +
      '.mlbma-auth-btn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;' +
      'border-radius:10px;padding:11px 14px;font-size:13.5px;font-weight:600;cursor:pointer;' +
      'border:1px solid var(--border,#28282f);background:transparent;color:var(--text,#F5F6FA);' +
      'transition:border-color .15s,background .15s;font-family:inherit;}' +
      '.mlbma-auth-btn:hover{border-color:var(--v,#9A6BFF);}' +
      '.mlbma-auth-btn:disabled{opacity:.55;cursor:default;}' +
      '.mlbma-auth-btn--google{background:#fff;color:#1f2330;border-color:#fff;font-weight:700;}' +
      '.mlbma-auth-btn--google:hover{background:#f1f1f4;border-color:#f1f1f4;}' +
      '.mlbma-auth-btn--primary{background:var(--v,#9A6BFF);border-color:var(--v,#9A6BFF);color:#fff;}' +
      '.mlbma-auth-btn--primary:hover{background:var(--v-mid,#7C4DFF);border-color:var(--v-mid,#7C4DFF);}' +
      '.mlbma-auth-sep{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--text-3,#6E7383);' +
      'font-size:11px;letter-spacing:.08em;text-transform:uppercase;}' +
      '.mlbma-auth-sep::before,.mlbma-auth-sep::after{content:"";flex:1;height:1px;background:var(--border,#28282f);}' +
      '.mlbma-auth-field{display:flex;flex-direction:column;gap:8px;}' +
      '.mlbma-auth-input{width:100%;border-radius:10px;padding:11px 12px;font-size:14px;' +
      'background:var(--bg-2,#0E1018);border:1px solid var(--border,#28282f);color:var(--text,#F5F6FA);' +
      'font-family:inherit;}' +
      '.mlbma-auth-input:focus{outline:none;border-color:var(--v,#9A6BFF);}' +
      '.mlbma-auth-status{margin:12px 0 0;font-size:12.5px;line-height:1.4;min-height:1em;}' +
      '.mlbma-auth-status--ok{color:var(--green,#3CCB7F);}' +
      '.mlbma-auth-status--err{color:var(--red,#F2545B);}' +
      '.mlbma-auth-status--muted{color:var(--text-3,#6E7383);}' +
      '.mlbma-auth-id{display:flex;align-items:center;gap:11px;margin-bottom:14px;}' +
      '.mlbma-auth-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;' +
      'background:var(--v-bg,rgba(124,77,255,.11));border:1px solid var(--border,#28282f);flex:0 0 auto;}' +
      '.mlbma-auth-id__meta{min-width:0;}' +
      '.mlbma-auth-id__label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3,#6E7383);}' +
      '.mlbma-auth-id__email{font-size:14px;font-weight:600;color:var(--text,#F5F6FA);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.mlbma-auth-otp{margin-top:12px;}' +
      '.mlbma-auth-discord{margin:14px 0;padding:14px 0;border-top:1px solid var(--border,#28282f);' +
      'border-bottom:1px solid var(--border,#28282f);}' +
      '.mlbma-auth-discord__row{display:flex;align-items:center;gap:11px;margin-bottom:10px;}' +
      '.mlbma-auth-discord__meta{min-width:0;}' +
      '.mlbma-auth-discord__status{font-size:13.5px;font-weight:600;color:var(--text,#F5F6FA);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.mlbma-auth-discord__status--off{color:var(--text-3,#6E7383);font-weight:500;}' +
      '.mlbma-auth-discord__icon{width:32px;height:32px;flex:0 0 auto;color:#5865F2;}' +
      '.mlbma-auth-btn--discord{background:#5865F2;border-color:#5865F2;color:#fff;}' +
      '.mlbma-auth-btn--discord:hover{background:#4752c4;border-color:#4752c4;}' +
      '.mlbma-auth-billing{margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid var(--border,#28282f);}' +
      '.mlbma-auth-billing__status{font-size:13.5px;font-weight:600;color:var(--text,#F5F6FA);}' +
      '.mlbma-auth-billing__status--off{color:var(--text-3,#6E7383);font-weight:500;}' +
      '.mlbma-auth-billing__icon{width:30px;height:30px;flex:0 0 auto;color:var(--gold,#E8C24A);}' +
      '.mlbma-auth-patreon{display:block;margin-top:14px;text-align:center;font-size:12.5px;' +
      'font-weight:600;color:var(--gold,#E8C24A);text-decoration:none;}' +
      '.mlbma-auth-patreon:hover{text-decoration:underline;}' +
      '.mlbma-auth-community{margin-top:16px;padding-top:16px;border-top:1px solid var(--border,#28282f);' +
      'display:flex;flex-direction:column;gap:6px;}' +
      '.mlbma-auth-community .mlbma-auth-patreon{margin-top:2px;}' +
      '.mlbma-auth-join-link{display:block;margin-top:8px;text-align:center;font-size:12px;' +
      'font-weight:600;color:var(--v,#9A6BFF);text-decoration:none;}' +
      '.mlbma-auth-join-link:hover{text-decoration:underline;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function googleIcon() {
    return '<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">' +
      '<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>' +
      '</svg>';
  }

  function discordIcon() {
    return '<svg class="mlbma-auth-discord__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a.07.07 0 0 0-.08.04c-.21.38-.45.88-.62 1.27a18.3 18.3 0 0 0-5.42 0c-.17-.4-.42-.89-.63-1.27a.08.08 0 0 0-.08-.04A19.7 19.7 0 0 0 3.68 4.37a.07.07 0 0 0-.03.03C.53 9.05-.32 13.6.1 18.1a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.7-3.55-13.7a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.2 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/>' +
      '</svg>';
  }

  function billingIcon() {
    return '<svg class="mlbma-auth-billing__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 2l2.9 6.26L21.6 9l-4.8 4.6 1.2 6.7L12 17.1 5.99 20.3l1.2-6.7L2.4 9l6.7-.74L12 2z"/>' +
      '</svg>';
  }

  // Compact error-message extractor used by the form handlers.
  function msg(e) { return (e && e.message) ? e.message : e; }

  function setStatus(panel, msg, kind) {
    var s = panel.querySelector('.mlbma-auth-status');
    if (!s) return;
    s.className = 'mlbma-auth-status' + (kind ? ' mlbma-auth-status--' + kind : '');
    s.textContent = msg || '';
  }

  function renderSignedOut(panel) {
    panel.innerHTML =
      '<div class="mlbma-auth-card">' +
      '<h2 class="mlbma-auth-card__title">Sign in to Chase Analytics</h2>' +
      '<p class="mlbma-auth-card__sub">Create a free account to save preferences and link Discord. ' +
      'The dashboard stays open either way.</p>' +
      '<button type="button" class="mlbma-auth-btn mlbma-auth-btn--google" data-mlbma-action="google">' +
      googleIcon() + '<span>Continue with Google</span></button>' +
      '<div class="mlbma-auth-sep">or</div>' +
      '<form class="mlbma-auth-field" data-mlbma-form="magiclink" novalidate>' +
      '<input class="mlbma-auth-input" type="email" name="email" autocomplete="email" ' +
      'placeholder="you@example.com" aria-label="Email address" required>' +
      '<button type="submit" class="mlbma-auth-btn mlbma-auth-btn--primary" data-mlbma-action="magiclink">' +
      'Email me a sign-in link</button>' +
      '</form>' +
      // Revealed after the email sends — lets a user who can't open the link (e.g. an email
      // scanner pre-consumed the one-time link) finish sign-in by typing the 6-digit code.
      '<form class="mlbma-auth-field mlbma-auth-otp" data-mlbma-form="otp" novalidate hidden>' +
      '<input class="mlbma-auth-input" type="text" name="code" inputmode="numeric" ' +
      'autocomplete="one-time-code" maxlength="8" placeholder="6-digit code from email" ' +
      'aria-label="Email sign-in code">' +
      '<button type="submit" class="mlbma-auth-btn mlbma-auth-btn--primary" data-mlbma-action="verifyotp">' +
      'Verify code &amp; sign in</button>' +
      '</form>' +
      '<p class="mlbma-auth-status" role="status" aria-live="polite"></p>' +
      '<div class="mlbma-auth-community">' +
      '<a class="mlbma-auth-btn mlbma-auth-btn--discord" href="' + esc(DISCORD_INVITE_URL) + '" ' +
      'target="_blank" rel="noopener">Join our Discord</a>' +
      '<a class="mlbma-auth-patreon" href="' + esc(PATREON_URL) + '" target="_blank" rel="noopener">' +
      '★ Premium picks on Patreon →</a>' +
      '</div>' +
      '</div>';
  }

  function renderSignedIn(panel, session) {
    var user = session && session.user ? session.user : {};
    var meta = user.user_metadata || {};
    var email = user.email || meta.email || 'your account';
    var avatar = meta.avatar_url || meta.picture || '';
    var avatarHtml = avatar
      ? '<img class="mlbma-auth-avatar" src="' + esc(avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="mlbma-auth-avatar" aria-hidden="true"></span>';
    panel.innerHTML =
      '<div class="mlbma-auth-card">' +
      '<div class="mlbma-auth-id">' + avatarHtml +
      '<div class="mlbma-auth-id__meta">' +
      '<div class="mlbma-auth-id__label">Signed in as</div>' +
      '<div class="mlbma-auth-id__email" title="' + esc(email) + '">' + esc(email) + '</div>' +
      '</div></div>' +
      // Discord connection status (Phase 2 prep — real OAuth lands in Phase 3).
      '<div class="mlbma-auth-discord">' +
      '<div class="mlbma-auth-discord__row">' + discordIcon() +
      '<div class="mlbma-auth-discord__meta">' +
      '<div class="mlbma-auth-id__label">Discord</div>' +
      '<div class="mlbma-auth-discord__status mlbma-auth-discord__status--off" data-mlbma-discord-status>Checking…</div>' +
      '</div></div>' +
      // Starts Discord OAuth at the Cloudflare Function /api/discord/connect (sends the
      // Supabase JWT; the server does the code exchange + profile write). Works on the
      // Cloudflare Pages deployment; degrades gracefully where /api/* doesn't exist.
      '<button type="button" class="mlbma-auth-btn mlbma-auth-btn--discord" ' +
      'data-mlbma-action="connect-discord">Connect Discord</button>' +
      '<a class="mlbma-auth-join-link" href="' + esc(DISCORD_INVITE_URL) + '" target="_blank" rel="noopener">' +
      'Join our Discord server →</a>' +
      '</div>' +
      // Premium = Patreon membership (which auto-grants the Discord role). Static CTA while
      // the paywall lives on Patreon — no Stripe / subscription_status dependency.
      '<div class="mlbma-auth-billing">' +
      '<div class="mlbma-auth-discord__row">' + billingIcon() +
      '<div class="mlbma-auth-discord__meta">' +
      '<div class="mlbma-auth-id__label">Premium</div>' +
      '<div class="mlbma-auth-billing__status mlbma-auth-billing__status--off">Daily signals + private Discord</div>' +
      '</div></div>' +
      '<a class="mlbma-auth-btn mlbma-auth-btn--primary" href="' + esc(PATREON_URL) + '" target="_blank" rel="noopener">' +
      'Join Premium on Patreon</a>' +
      '</div>' +
      '<button type="button" class="mlbma-auth-btn" data-mlbma-action="signout">Sign out</button>' +
      '<p class="mlbma-auth-status" role="status" aria-live="polite"></p>' +
      '</div>';
  }

  function render(panel, session) {
    if (session) renderSignedIn(panel, session);
    else renderSignedOut(panel);
  }

  // Fetch the profile once and fill in BOTH the Discord status and the billing controls in
  // any signed-in panel. Best-effort and non-blocking — the panel is usable without it.
  function updateAccountFromProfile() {
    if (!global.MLBMA_AUTH || typeof global.MLBMA_AUTH.getProfile !== 'function') return;
    global.MLBMA_AUTH.getProfile().then(function (profile) {
      applyDiscord(profile);
      applyBilling(profile);
    }).catch(function () { /* leave placeholders on any error */ });
  }

  function applyDiscord(profile) {
    var nodes = document.querySelectorAll('[data-mlbma-discord-status]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (profile && profile.discord_user_id) {
        el.textContent = profile.discord_username ? ('@' + profile.discord_username) : 'Connected';
        el.className = 'mlbma-auth-discord__status';
      } else {
        el.textContent = 'Not connected';
        el.className = 'mlbma-auth-discord__status mlbma-auth-discord__status--off';
      }
    }
  }

  var SUB_LABELS = { active: 'Active', past_due: 'Past due', incomplete: 'Incomplete', inactive: 'Inactive', free: 'Free' };

  function applyBilling(profile) {
    var status = (profile && profile.subscription_status) || 'free';
    var active = status === 'active';
    var statusNodes = document.querySelectorAll('[data-mlbma-sub-status]');
    for (var i = 0; i < statusNodes.length; i++) {
      statusNodes[i].textContent = SUB_LABELS[status] || status;
      statusNodes[i].className = 'mlbma-auth-billing__status' + (active ? '' : ' mlbma-auth-billing__status--off');
    }
    var actionHtml = active
      ? '<button type="button" class="mlbma-auth-btn" data-mlbma-action="manage-billing">Manage billing</button>'
      : '<button type="button" class="mlbma-auth-btn mlbma-auth-btn--primary" data-mlbma-action="upgrade">Upgrade to Premium</button>';
    var actionNodes = document.querySelectorAll('[data-mlbma-billing-action]');
    for (var j = 0; j < actionNodes.length; j++) actionNodes[j].innerHTML = actionHtml;
  }

  // Kick off Discord linking: ask the Cloudflare Function for an authorize URL (authenticated
  // with the Supabase JWT), then navigate there. Degrades gracefully where /api/* doesn't
  // exist (localhost, GitHub Pages) — those deployments have no Functions.
  function startDiscordConnect(panel) {
    setStatus(panel, 'Starting Discord connection…', 'muted');
    var getToken = (global.MLBMA_AUTH && global.MLBMA_AUTH.getAccessToken)
      ? global.MLBMA_AUTH.getAccessToken() : Promise.resolve(null);
    getToken.then(function (token) {
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
      setStatus(panel, 'Discord linking is only available on the deployed app (Cloudflare Functions) — not on localhost or GitHub Pages.', 'err');
    });
  }

  // Shared: ask an authenticated billing endpoint (POST) for a URL, then navigate there.
  // Degrades gracefully where /api/* or Stripe env vars don't exist.
  function startBillingRedirect(panel, path, startMsg) {
    setStatus(panel, startMsg, 'muted');
    var getToken = (global.MLBMA_AUTH && global.MLBMA_AUTH.getAccessToken)
      ? global.MLBMA_AUTH.getAccessToken() : Promise.resolve(null);
    getToken.then(function (token) {
      if (!token) { setStatus(panel, 'Please sign in first.', 'err'); return; }
      return fetch(path, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            if (!r.ok) throw new Error((data && data.message) || ('HTTP ' + r.status));
            if (data && data.url) { global.location.href = data.url; }
            else throw new Error('no url');
          });
        });
    }).catch(function (err) {
      setStatus(panel, 'Billing needs the deployed app (Cloudflare Functions + Stripe). '
        + (err && err.message ? '(' + err.message + ')' : ''), 'err');
    });
  }
  function startCheckout(panel) { startBillingRedirect(panel, '/api/billing/create-checkout-session', 'Opening checkout…'); }
  function startPortal(panel) { startBillingRedirect(panel, '/api/billing/create-portal-session', 'Opening billing portal…'); }

  // On returning from a Discord (?discord=) or Stripe (?billing=) redirect, show a status
  // message, refresh the account panel, and strip the params so a reload doesn't repeat them.
  function handleReturnFlags() {
    try {
      var params = new URLSearchParams(global.location.search);
      var d = params.get('discord');
      var bill = params.get('billing');
      if (!d && !bill) return;
      params.delete('discord'); params.delete('billing'); params.delete('reason');
      var qs = params.toString();
      var clean = global.location.pathname + (qs ? '?' + qs : '') + global.location.hash;
      if (global.history && global.history.replaceState) global.history.replaceState(null, '', clean);
      setTimeout(function () {
        var panels = document.querySelectorAll(MOUNT_SELECTOR);
        var text, kind;
        if (d) {
          text = d === 'connected' ? 'Discord connected.' : 'Discord connection failed — please try again.';
          kind = d === 'connected' ? 'ok' : 'err';
        } else {
          text = bill === 'success' ? 'Subscription updated — thank you!' : 'Checkout canceled.';
          kind = bill === 'success' ? 'ok' : 'muted';
        }
        for (var i = 0; i < panels.length; i++) setStatus(panels[i], text, kind);
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

      if (action === 'google') {
        setStatus(panel, 'Redirecting to Google…', 'muted');
        global.MLBMA_AUTH.signInWithGoogle().catch(function (err) {
          setStatus(panel, 'Could not start Google sign-in: ' + (err && err.message ? err.message : err), 'err');
        });
      } else if (action === 'signout') {
        setStatus(panel, 'Signing out…', 'muted');
        global.MLBMA_AUTH.signOut().catch(function (err) {
          setStatus(panel, 'Sign out failed: ' + (err && err.message ? err.message : err), 'err');
        });
      } else if (action === 'connect-discord') {
        startDiscordConnect(panel);
      } else if (action === 'upgrade') {
        startCheckout(panel);
      } else if (action === 'manage-billing') {
        startPortal(panel);
      }
    });

    panel.addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-mlbma-form]');
      if (!form || !panel.contains(form)) return;
      e.preventDefault();
      var kind = form.getAttribute('data-mlbma-form');

      if (kind === 'magiclink') {
        var input = form.querySelector('input[name="email"]');
        var email = input ? input.value.trim() : '';
        if (!email || email.indexOf('@') < 1) {
          setStatus(panel, 'Enter a valid email address.', 'err');
          return;
        }
        setStatus(panel, 'Sending sign-in email…', 'muted');
        global.MLBMA_AUTH.signInWithMagicLink(email).then(function () {
          panel.setAttribute('data-mlbma-email', email);
          var otp = panel.querySelector('.mlbma-auth-otp');
          if (otp) otp.hidden = false;
          setStatus(panel, 'Emailed ' + email + '. Click the link, or enter the 6-digit code below.', 'ok');
        }).catch(function (err) {
          setStatus(panel, 'Could not send email: ' + msg(err), 'err');
        });
      } else if (kind === 'otp') {
        var savedEmail = panel.getAttribute('data-mlbma-email') || '';
        var codeInput = form.querySelector('input[name="code"]');
        var code = codeInput ? codeInput.value.trim() : '';
        if (!savedEmail) { setStatus(panel, 'Request a sign-in email first.', 'err'); return; }
        if (!code) { setStatus(panel, 'Enter the code from your email.', 'err'); return; }
        setStatus(panel, 'Verifying code…', 'muted');
        global.MLBMA_AUTH.verifyEmailOtp(savedEmail, code).then(function () {
          setStatus(panel, 'Signed in!', 'ok'); // onAuthStateChange repaints the panel
        }).catch(function () {
          // Most failures here are an expired code, or codes not enabled in the email
          // template — the link in the same email always works, so steer there.
          setStatus(panel, 'That code didn\'t verify (expired, or codes not enabled yet). Click the link in the email instead.', 'err');
        });
      }
    });
  }

  function mountAll() {
    var panels = document.querySelectorAll(MOUNT_SELECTOR);
    if (!panels.length) return;

    if (!global.MLBMA_AUTH || !global.MLBMA_AUTH.isConfigured()) {
      injectStyles();
      for (var j = 0; j < panels.length; j++) {
        panels[j].innerHTML =
          '<div class="mlbma-auth-card"><p class="mlbma-auth-status mlbma-auth-status--muted" style="margin:0">' +
          'Sign-in is not configured yet.</p></div>';
      }
      return;
    }

    injectStyles();
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      p.innerHTML = '<div class="mlbma-auth-card"><p class="mlbma-auth-status mlbma-auth-status--muted" style="margin:0">Loading…</p></div>';
      wire(p);
    }

    function paint(session) {
      var list = document.querySelectorAll(MOUNT_SELECTOR);
      for (var k = 0; k < list.length; k++) { wire(list[k]); render(list[k], session); }
      if (session) updateAccountFromProfile();
    }

    global.MLBMA_AUTH.getSession().then(paint).catch(function () { paint(null); });
    global.MLBMA_AUTH.onAuthStateChange(function (_event, session) { paint(session); });

    handleReturnFlags();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})(window);
