/**
 * mlbma_auth_ui.js — small reusable auth panel.
 *
 * Drop a `<div data-mlbma-auth-panel></div>` anywhere and include this script (after
 * mlbma_auth.js). It self-mounts: signed-out shows "Continue with Google" + an email
 * magic-link form; signed-in shows the current email + "Sign out". It is purely
 * additive — it never blocks the dashboard or its data loading. Styling reuses the
 * existing design-system CSS variables so it matches the rest of the site.
 */
(function (global) {
  'use strict';

  var MOUNT_SELECTOR = '[data-mlbma-auth-panel]';
  var STYLE_ID = 'mlbma-auth-ui-style';

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
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
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
      '<p class="mlbma-auth-card__sub">Create a free account to save preferences and (soon) link Discord. ' +
      'The dashboard stays open either way.</p>' +
      '<button type="button" class="mlbma-auth-btn mlbma-auth-btn--google" data-mlbma-action="google">' +
      googleIcon() + '<span>Continue with Google</span></button>' +
      '<div class="mlbma-auth-sep">or</div>' +
      '<form class="mlbma-auth-field" data-mlbma-form="magiclink" novalidate>' +
      '<input class="mlbma-auth-input" type="email" name="email" autocomplete="email" ' +
      'placeholder="you@example.com" aria-label="Email address" required>' +
      '<button type="submit" class="mlbma-auth-btn mlbma-auth-btn--primary" data-mlbma-action="magiclink">' +
      'Email me a magic link</button>' +
      '</form>' +
      '<p class="mlbma-auth-status" role="status" aria-live="polite"></p>' +
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
      '<button type="button" class="mlbma-auth-btn" data-mlbma-action="signout">Sign out</button>' +
      '<p class="mlbma-auth-status" role="status" aria-live="polite"></p>' +
      '</div>';
  }

  function render(panel, session) {
    if (session) renderSignedIn(panel, session);
    else renderSignedOut(panel);
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
      }
    });

    panel.addEventListener('submit', function (e) {
      var form = e.target.closest('[data-mlbma-form="magiclink"]');
      if (!form) return;
      e.preventDefault();
      var input = form.querySelector('input[name="email"]');
      var email = input ? input.value.trim() : '';
      if (!email || email.indexOf('@') < 1) {
        setStatus(panel, 'Enter a valid email address.', 'err');
        return;
      }
      setStatus(panel, 'Sending magic link…', 'muted');
      global.MLBMA_AUTH.signInWithMagicLink(email).then(function () {
        setStatus(panel, 'Check ' + email + ' for your sign-in link.', 'ok');
      }).catch(function (err) {
        setStatus(panel, 'Could not send link: ' + (err && err.message ? err.message : err), 'err');
      });
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
    }

    global.MLBMA_AUTH.getSession().then(paint).catch(function () { paint(null); });
    global.MLBMA_AUTH.onAuthStateChange(function (_event, session) { paint(session); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})(window);
