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
      if (hash === 'section-matchups-hero') return 'matchups';
      if (!hash) return 'opening';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'compare';
    if (page === 'team_rankings.html' || page === 'matchup_sheet.html') return 'matchups';
    return page;
  }

  function sportNavKey() {
    var path = window.location.pathname || '';
    var m = path.match(/^\/(mlb|nfl|wnba|cfb)(\/|$)/i);
    if (m) return m[1].toLowerCase();
    if (/^\/models(\/|$)/i.test(path)) return 'models';
    return '';
  }

  function currentNavKey() {
    var sportKey = sportNavKey();
    if (sportKey) return sportKey;
    var page = currentPageName();
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (isOpeningPage(page)) {
      if (hash === 'section-research-lab') return 'research';
      if (hash === 'section-matchups-hero') return 'matchups';
      return 'opening';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'compare';
    if (page === 'team_rankings.html') return 'matchups';
    return page;
  }

  function setActivePage() {
    var currentKey = currentNavKey();

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
      link.style.background = '';
      link.style.color = '';
      if (href && href.split('/').pop().split('?')[0] === profilePage) {
        link.style.background = 'rgba(124, 58, 237, 0.15)';
        link.style.color = '#9A6BFF';
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
    return ChaseDataStatus.fetchLastUpdated({
      source: sport === 'mlb' ? 'sheet' : 'board',
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
