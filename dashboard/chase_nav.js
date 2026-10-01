// v20260523d � three-view nav: opening / matchups / research
/**
 * Chase Analytics navigation � dropdowns, mobile menu, active page, pipeline timestamp.
 */
(function () {
  'use strict';

  const dropdowns = document.querySelectorAll('.chase-dropdown');

  dropdowns.forEach(function (dropdown) {
    var trigger = dropdown.querySelector('.chase-nav-link');
    if (!trigger) return;

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdowns.forEach(function (d) {
        if (d !== dropdown) {
          d.classList.remove('open');
          var t = d.querySelector('.chase-nav-link');
          if (t) t.setAttribute('aria-expanded', 'false');
        }
      });
      var isOpen = dropdown.classList.toggle('open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });
  });

  document.addEventListener('click', function () {
    dropdowns.forEach(function (dropdown) {
      dropdown.classList.remove('open');
      var t = dropdown.querySelector('.chase-nav-link');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  });

  var hamburger = document.getElementById('hamburgerBtn');
  var mobileOverlay = document.getElementById('mobileOverlay');
  var mobileMenu = document.getElementById('mobileMenu');
  var mobileClose = document.getElementById('mobileClose');

  function openMobileMenu() {
    if (!hamburger || !mobileOverlay || !mobileMenu) return;
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileOverlay.style.display = '';
    mobileMenu.style.display = '';
    mobileMenu.setAttribute('aria-hidden', 'false');
    mobileOverlay.classList.add('open');
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    if (!hamburger || !mobileOverlay || !mobileMenu) return;
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileOverlay.classList.remove('open');
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    mobileOverlay.style.display = '';
    mobileMenu.style.display = '';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', openMobileMenu);
  }
  if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      dropdowns.forEach(function (dropdown) {
        dropdown.classList.remove('open');
        var t = dropdown.querySelector('.chase-nav-link');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      closeMobileMenu();
    }
  });

  function currentPageName() {
    var path = window.location.pathname || '';
    var parts = path.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'index.html';
  }

  // The opening dashboard is the site home. Recognise it whether served at the
  // clean root (index.html / "") or via the legacy filename URL.
  function isOpeningPage(page) {
    return page === 'index.html' || page === '' ||
           page === 'chase_analytics_mlb_oem_v7.html' || page === 'chase_analytics_mlb_oem_v7';
  }

  function navTargetKey(href) {
    if (!href) return '';
    var hash = '';
    var pathPart = href;
    var hi = href.indexOf('#');
    if (hi >= 0) {
      hash = href.slice(hi + 1);
      pathPart = href.slice(0, hi);
    }
    var page = pathPart.split('/').pop() || '';
    if (isOpeningPage(page)) {
      if (hash === 'section-research-lab') return 'research';
      if (hash === 'section-matchups-hero' || hash === 'openingSlate' || hash === 'section-opening-workflows') return 'matchups';
      if (!hash) return 'home';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'matchups';
    if (page === 'team_rankings.html' || page === 'matchup_sheet.html') return 'matchups';    return page;
  }

  function sportNavKey() {
    var path = window.location.pathname || '';
    var m = path.match(/^\/(mlb|nfl|wnba|cfb)(\/|$)/i);
    if (m) return m[1].toLowerCase();
    if (/^\/models(\/|$)/i.test(path)) return 'models';
    if (/^\/model-center(\/|$)/i.test(path)) return 'models';
    return '';
  }

  function currentNavKey() {
    var path = window.location.pathname || '';
    var sportKey = sportNavKey();
    if (sportKey) return sportKey;
    var page = currentPageName();
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (/\/nfl(\/|$)/.test(path)) return 'nfl';
    if (isOpeningPage(page)) {
      if (hash === 'section-research-lab') return 'research';
      if (hash === 'section-matchups-hero' || hash === 'openingSlate' || hash === 'section-opening-workflows') return 'matchups';
      return 'home';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'matchups';
    if (page === 'team_rankings.html') return 'matchups';    return page;
  }

  function setActivePage() {
    var currentKey = currentNavKey();

    // Sport routes are all named index.html, so the filename cannot identify
    // them. The first path segment can: /mlb/... is the MLB desk. The homepage
    // carries data-sport="mlb" for its adapters but shows both slates, so it
    // must not light a tab — hence pathname rather than the body attribute.
    var seg = String(location.pathname || '').split('/').filter(Boolean)[0] || '';
    var routeSport = /^(mlb|nfl|wnba|cfb)$/.test(seg) ? seg : '';
    document.querySelectorAll('.chase-sport-tab').forEach(function (tab) {
      var key = tab.getAttribute('data-nav');
      if (routeSport && key === routeSport) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.classList.remove('active');
        tab.removeAttribute('aria-current');
      }
    });

    document.querySelectorAll('.chase-nav-link').forEach(function (link) {
      if (link.tagName !== 'A') return;
      var href = link.getAttribute('href');
      var dataNav = link.getAttribute('data-nav');
      var key = dataNav || navTargetKey(href);
      if (key && key === currentKey) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });

    var profilePage = currentPageName();

    document.querySelectorAll('.chase-dropdown-item').forEach(function (link) {
      if (link.tagName !== 'A') return;
      var href = link.getAttribute('href');
      link.classList.remove('active');
      if (href && href.split('/').pop().split('?')[0] === profilePage) {
        link.classList.add('active');
        var dropdown = link.closest('.chase-dropdown');
        if (dropdown) {
          var trig = dropdown.querySelector('.chase-nav-link');
          if (trig) trig.classList.add('active');
        }
      }
    });

    document.querySelectorAll('.chase-mobile-link').forEach(function (link) {
      var href = link.getAttribute('href');
      var dataNav = link.getAttribute('data-nav');
      var key = dataNav || navTargetKey(href);
      if (key && key === currentKey) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }

  /* Account menu. The header chip reads "Sign in" (or the signed-in initials)
     and opens a dropdown holding the account panel; the mobile menu carries the
     same panel inline because the chip is hidden at <=768px. The auth scripts
     load on first open, on a sign-in redirect, or when a stored session needs
     checking -- never on a signed-out cold boot. */
  function initAccount() {
    var btn = document.getElementById('chaseAccount');
    var badge = document.getElementById('chaseAccountBadge');
    if (!btn || !badge) return;

    var STAMP = window.DESIGN_LAYER_VERSION ? '?v=' + window.DESIGN_LAYER_VERSION : '';
    var authReady = null;
    var pop = null;

    function storedUser() {
      try {
        var saved = JSON.parse(localStorage.getItem('mlbma-auth') || 'null');
        return (saved && saved.user) || null;
      } catch (err) { return null; }
    }

    function paint(user) {
      var meta = (user && user.user_metadata) || {};
      var source = String(meta.full_name || meta.name || (user && user.email) || '').trim();
      var label = btn.querySelector('.chase-account__label');
      if (!user) {
        badge.textContent = '';
        badge.hidden = true;
        btn.classList.add('is-signed-out');
        btn.setAttribute('aria-label', 'Sign in or create an account');
        if (!label) {
          label = document.createElement('span');
          label.className = 'chase-account__label';
          btn.insertBefore(label, btn.firstChild);
        }
        label.textContent = 'Sign in';
        return;
      }
      var initials = source.indexOf('@') > 0
        ? source.slice(0, 2).toUpperCase()
        : source.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
      badge.textContent = initials || 'ME';
      badge.hidden = false;
      btn.classList.remove('is-signed-out');
      btn.setAttribute('aria-label', 'Account: ' + (source || 'signed in'));
      if (label) label.remove();
    }

    function loadScript(src) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src + STAMP;
        s.onload = resolve;
        s.onerror = function () { reject(new Error(src)); };
        document.head.appendChild(s);
      });
    }

    function loadAuth() {
      if (authReady) return authReady;
      var core = window.MLBMA_AUTH ? Promise.resolve() : loadScript('/dashboard/mlbma_auth.js');
      authReady = core.then(function () {
        window.MLBMA_AUTH.onAuthStateChange(function (_event, session) {
          paint(session && session.user);
        });
        return window.MLBMA_AUTH_UI ? window.MLBMA_AUTH_UI.mount() : loadScript('/dashboard/mlbma_auth_ui.js');
      }).catch(function () {
        authReady = null;
        document.querySelectorAll('[data-mlbma-auth-panel]').forEach(function (panel) {
          panel.innerHTML = '<p class="ca-auth__status ca-auth__status--err">Sign-in could not load. Check your connection and try again.</p>';
        });
      });
      return authReady;
    }

    function mountPoint() {
      var panel = document.createElement('div');
      panel.setAttribute('data-mlbma-auth-panel', '');
      panel.innerHTML = '<p class="ca-auth__status ca-auth__status--muted">Loading…</p>';
      return panel;
    }

    pop = document.createElement('div');
    pop.className = 'chase-account-pop';
    pop.id = 'chaseAccountPanel';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Account');
    pop.hidden = true;
    pop.appendChild(mountPoint());
    document.body.appendChild(pop);
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-controls', 'chaseAccountPanel');

    var mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
      var section = document.createElement('section');
      section.className = 'chase-mobile-account';
      section.setAttribute('aria-label', 'Account');
      section.appendChild(mountPoint());
      var mobileStatus = mobileMenu.querySelector('.chase-mobile-status');
      mobileMenu.insertBefore(section, mobileStatus || null);
      var burger = document.getElementById('hamburgerBtn');
      if (burger) burger.addEventListener('click', loadAuth);
    }

    function place() {
      var r = btn.getBoundingClientRect();
      pop.style.top = Math.round(r.bottom + 8) + 'px';
      pop.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';
    }

    function setOpen(open) {
      if (open === !pop.hidden) return;
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) return;
      place();
      loadAuth().then(function () {
        var first = pop.querySelector('input:not([type="hidden"]), button');
        if (first && !pop.hidden) first.focus();
      });
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(pop.hidden);
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !pop.hidden) {
        setOpen(false);
        btn.focus();
      }
    });
    window.addEventListener('resize', function () { if (!pop.hidden) place(); });

    paint(storedUser());

    // Landing back from Google / the email link / Discord: load now so the SDK
    // completes the session from the URL, and open the panel to show the result.
    var url = location.hash + location.search;
    if (/access_token=|refresh_token=|error_description=|[?&]code=|[?&]discord=/.test(url)) {
      loadAuth().then(function () {
        if (window.matchMedia('(min-width: 769px)').matches) setOpen(true);
      });
    } else if (storedUser()) {
      // Refresh or retire the stored session off the critical path.
      setTimeout(loadAuth, 1500);
    }
  }

  initAccount();

  setActivePage();
  window.addEventListener('hashchange', setActivePage);

  function syncDashboardViewFromNav(hash) {
    if (!isOpeningPage(currentPageName())) return;
    if (hash) window.location.hash = hash;
    var sync = window.syncDashboardView;
    if (typeof sync === 'function') sync();
  }

  function bindDashboardHashNav() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href*="chase_analytics_mlb_oem_v7.html"]');
      if (!link || link.tagName !== 'A') return;
      var href = link.getAttribute('href') || '';
      var hashIdx = href.indexOf('#');
      if (hashIdx < 0) return;
      var hash = href.slice(hashIdx);
      var pathPart = href.slice(0, hashIdx);
      var targetPage = pathPart.split('/').pop() || 'chase_analytics_mlb_oem_v7.html';
      if (targetPage !== 'chase_analytics_mlb_oem_v7.html') return;
      if (!isOpeningPage(currentPageName())) return;
      e.preventDefault();
      window.location.hash = hash;
      syncDashboardViewFromNav(hash);
      setActivePage();
      closeMobileMenu();
    });
  }

  bindDashboardHashNav();

  function setTimestampText(text) {
    var el = document.getElementById('lastUpdated');
    var mobile = document.getElementById('mobileLastUpdated');
    var display = (!text || text === '--' || text === '�') ? 'syncing�' : text;
    if (el) el.textContent = display;
    if (mobile) mobile.textContent = display;
    if (window.PlatformDashboard && PlatformDashboard.setOpeningHeroSync) {
      PlatformDashboard.setOpeningHeroSync(display);
    }
  }

  function rewriteSportRootNavHrefs() {
    var path = window.location.pathname || '';
    if (!/^\/(nfl|cfb|wnba|mlb)(\/|$)/i.test(path)) return;
    var dash = '/dashboard/';
    document.querySelectorAll('.chase-header a[href], .chase-mobile-menu a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '/' || href.indexOf('http') === 0) return;
      a.setAttribute('href', dash + href);
    });
    document.querySelectorAll('.chase-header img[src], .chase-mobile-menu img[src]').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (!src || src.charAt(0) === '/' || src.indexOf('http') === 0) return;
      img.setAttribute('src', dash + src);
    });
  }
  rewriteSportRootNavHrefs();

  function applyDataStatusFields(fields) {
    fields = fields || (window.ChaseDataStatus && ChaseDataStatus.unknownFields()) || { state: 'unknown' };
    var host = document.getElementById('navDataStatus') || document.getElementById('lastUpdated');
    var painted = window.ChaseDataStatus
      ? ChaseDataStatus.render(host, fields)
      : { age: 'unknown', state: 'unknown' };
    window.ChaseNav.setPipelineStatus(painted.state === 'ok' ? 'fresh' : 'stale');
    var mobile = document.getElementById('mobileLastUpdated');
    if (mobile && painted.age) mobile.textContent = painted.age;
    if (window.PlatformDashboard && PlatformDashboard.setOpeningHeroSync) {
      PlatformDashboard.setOpeningHeroSync(painted.age || 'unknown');
    }
  }

  function loadLastUpdatedFromSheet() {
    if (!window.ChaseDataStatus || !ChaseDataStatus.fetchLastUpdated) {
      setTimestampText('unknown');
      window.ChaseNav.setPipelineStatus('stale');
      return Promise.resolve();
    }
    var sport = String((document.body && document.body.getAttribute('data-sport')) || 'mlb').toLowerCase();
    var publicResearch = document.body && document.body.getAttribute('data-ca-product') === 'research';
    return ChaseDataStatus.fetchLastUpdated({
      source: publicResearch || sport !== 'mlb' ? 'public-slate' : 'sheet',
      sport: sport
    }).then(function (fields) {
      applyDataStatusFields(fields);
    });
  }

  window.ChaseNav = {
    setPipelineStatus: function (status) {
      var dot = document.getElementById('pipelineStatus');
      var mobileDots = document.querySelectorAll('.chase-mobile-status .chase-pipeline-dot');
      var stale = status === 'stale';
      if (dot) {
        dot.classList.toggle('stale', stale);
        dot.title = stale ? 'Pipeline: Stale' : 'Pipeline: Fresh';
      }
      mobileDots.forEach(function (d) {
        d.classList.toggle('stale', stale);
        d.title = stale ? 'Pipeline: Stale' : 'Pipeline: Fresh';
      });
    },
    setLastUpdated: function (timestamp) {
      // Display-only leftover. Prefer ChaseDataStatus fields; never a wall clock.
      if (timestamp && typeof timestamp === 'object') {
        applyDataStatusFields(timestamp);
        return;
      }
      if (!timestamp || timestamp === '?' || timestamp === '--') {
        setTimestampText('unknown');
        return;
      }
      setTimestampText(String(timestamp));
    },
    applyDataStatus: applyDataStatusFields,
    refresh: loadLastUpdatedFromSheet
  };

  loadLastUpdatedFromSheet();
})();
