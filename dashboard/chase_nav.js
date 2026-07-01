// Three-view navigation: opening, matchups, and research.
/**
 * Chase Analytics navigation: dropdowns, mobile menu, active page, pipeline timestamp.
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
  var lastFocusedElement = null;

  function mobileMenuFocusables() {
    if (!mobileMenu) return [];
    return Array.prototype.slice.call(
      mobileMenu.querySelectorAll('a[href], button:not([disabled])')
    ).filter(function (el) {
      return el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null;
    });
  }

  function mobileMenuIsOpen() {
    return !!(mobileMenu && mobileMenu.classList.contains('open'));
  }

  function openMobileMenu() {
    if (!hamburger || !mobileOverlay || !mobileMenu) return;
    lastFocusedElement = document.activeElement;
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileOverlay.style.display = 'block';
    mobileOverlay.setAttribute('aria-hidden', 'false');
    mobileMenu.style.display = 'block';
    mobileMenu.setAttribute('aria-hidden', 'false');
    void mobileOverlay.offsetHeight;
    mobileOverlay.classList.add('open');
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (mobileClose) mobileClose.focus();
  }

  function closeMobileMenu(restoreFocus) {
    if (!hamburger || !mobileOverlay || !mobileMenu) return;
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileOverlay.classList.remove('open');
    mobileOverlay.setAttribute('aria-hidden', 'true');
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    setTimeout(function () {
      mobileOverlay.style.display = 'none';
      mobileMenu.style.display = '';
    }, 200);
    if (restoreFocus !== false && lastFocusedElement && lastFocusedElement.focus) {
      lastFocusedElement.focus();
    }
  }

  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.addEventListener('click', openMobileMenu);
  }
  if (mobileClose) mobileClose.addEventListener('click', function () { closeMobileMenu(); });
  if (mobileOverlay) mobileOverlay.addEventListener('click', function () { closeMobileMenu(); });
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a[href]').forEach(function (link) {
      link.addEventListener('click', function () { closeMobileMenu(false); });
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && mobileMenuIsOpen()) {
      var focusables = mobileMenuFocusables();
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === 'Escape') {
      dropdowns.forEach(function (dropdown) {
        dropdown.classList.remove('open');
        var t = dropdown.querySelector('.chase-nav-link');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      if (mobileMenuIsOpen()) {
        e.preventDefault();
        closeMobileMenu();
      }
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth >= 768 && mobileMenuIsOpen()) closeMobileMenu(false);
  });

  function currentPageName() {
    var path = window.location.pathname || '';
    var parts = path.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'index.html';
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
  if (page === 'chase_analytics_mlb_oem_v7.html' || page === '') {
      if (hash === 'section-research-lab') return 'research';
      if (hash === 'section-matchups-hero') return 'matchups';
      if (!hash) return 'opening';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'matchups';
    if (page === 'team_rankings.html' || page === 'matchup_sheet.html') return 'team-rankings';
    return page;
  }

  function currentNavKey() {
    var page = currentPageName();
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (page === 'chase_analytics_mlb_oem_v7.html') {
      if (hash === 'section-research-lab') return 'research';
      if (hash === 'section-matchups-hero') return 'matchups';
      return 'opening';
    }
    if (page === 'glossary.html') return 'glossary';
    if (page === 'matchup_compare.html') return 'matchups';
    if (page === 'team_rankings.html') return 'team-rankings';
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
      link.removeAttribute('aria-current');
      if (href && href.split('/').pop().split('?')[0] === profilePage) {
        link.style.background = 'rgba(124, 58, 237, 0.15)';
        link.style.color = '#9A6BFF';
        link.setAttribute('aria-current', 'page');
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
    if (currentPageName() !== 'chase_analytics_mlb_oem_v7.html') return;
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
      if (currentPageName() !== 'chase_analytics_mlb_oem_v7.html') return;
      e.preventDefault();
      window.location.hash = hash;
      syncDashboardViewFromNav(hash);
      setActivePage();
      closeMobileMenu(false);
    });
  }

  bindDashboardHashNav();

  function setTimestampText(text) {
    var el = document.getElementById('lastUpdated');
    var mobile = document.getElementById('mobileLastUpdated');
    var display = (!text || text === '--') ? 'Syncing' : text;
    if (el) el.textContent = display;
    if (mobile) mobile.textContent = display;
    if (window.PlatformDashboard && PlatformDashboard.setOpeningHeroSync) {
      PlatformDashboard.setOpeningHeroSync(display);
    }
  }

  function formatClock() {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    var dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return dateStr + ' ' + timeStr;
  }

  function parseSheetTimestamp(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  function hoursSince(d) {
    return (Date.now() - d.getTime()) / (1000 * 60 * 60);
  }

  function applyPipelineFromDate(d) {
    if (!d) return;
    var stale = hoursSince(d) > 24;
    window.ChaseNav.setPipelineStatus(stale ? 'stale' : 'fresh');
    setTimestampText(
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    );
  }

  async function loadLastUpdatedFromSheet() {
    var cfg = window.MLBMA_CONFIG;
    var sid = cfg && cfg.SHEET_ID;
    var tab =
      cfg && cfg.SHEET_TABS && (cfg.SHEET_TABS.last_updated || cfg.SHEET_TABS.Last_Updated);
    if (!sid || !tab) {
      setTimestampText(formatClock());
      return;
    }
    try {
      var url =
        'https://docs.google.com/spreadsheets/d/' +
        sid +
        '/gviz/tq?tqx=out:csv&sheet=' +
        encodeURIComponent(tab);
      var res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('sheet');
      var text = await res.text();
      var line = (text || '').trim().split('\n')[1] || '';
      var raw = line.split(',')[0].replace(/^"|"$/g, '').trim();
      var d = parseSheetTimestamp(raw);
      if (d) {
        applyPipelineFromDate(d);
        return;
      }
      if (raw) {
        window.ChaseNav.setLastUpdated(raw);
      }
    } catch (e) {
      /* fallback */
    }
    setTimestampText(formatClock());
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
      setTimestampText(timestamp);
    },
    refresh: loadLastUpdatedFromSheet
  };

  loadLastUpdatedFromSheet();
})();
