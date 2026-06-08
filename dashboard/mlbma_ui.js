/**
 * MLBMA shared dashboard UI ù nav, loading overlay, footer timestamp.
 */
(function (global) {
  'use strict';

  var NAV = [
    [{ file: 'chase_analytics_mlb_oem_v7.html', label: 'Main' }],
    [
      { file: 'team_rankings.html', label: 'Matchups' },
      { file: 'glossary.html', label: 'Glossary' },
    ],
    [
      { file: 'batter_profile.html', label: 'Batter' },
      { file: 'pitcher_profile.html', label: 'Pitcher' },
      { file: 'reliever_profile.html', label: 'Reliever' },
      { file: 'bullpen_report.html', label: 'Bullpen' },
      { file: 'team_profile.html', label: 'Team' },
    ],
  ];

  function currentPage() {
    var script = document.querySelector('script[data-page]');
    if (script && script.getAttribute('data-page')) {
      return script.getAttribute('data-page');
    }
    var path = global.location.pathname || '';
    var parts = path.split('/');
    return parts[parts.length - 1] || 'chase_analytics_mlb_oem_v7.html';
  }

  function renderNav(container, page) {
    if (!container) return;
    var html = '<button type="button" class="mlbma-nav-toggle" aria-label="Menu" id="mlbmaNavToggle">&#9776;</button>';
    html += '<nav class="mlbma-nav" id="mlbmaNavInner">';
    NAV.forEach(function (group, gi) {
      if (gi > 0) html += '<span class="mlbma-nav-sep" aria-hidden="true"></span>';
      html += '<div class="mlbma-nav-group">';
      group.forEach(function (item) {
        var cls = 'mlbma-nav-pill' + (item.file === page ? ' active' : '');
        html += '<a class="' + cls + '" href="' + item.file + '">' + item.label + '</a>';
      });
      html += '</div>';
    });
    html += '</nav>';
    container.innerHTML = html;
    var toggle = document.getElementById('mlbmaNavToggle');
    var inner = document.getElementById('mlbmaNavInner');
    if (toggle && inner) {
      toggle.addEventListener('click', function () {
        inner.classList.toggle('open');
      });
    }
  }

  function hideInlineLoadingText() {
    document.querySelectorAll('.loading-text, #loadingText').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function ensureIconScripts() {
    if (document.getElementById('mlbma-icons-script')) return;
    var s = document.createElement('script');
    s.id = 'mlbma-icons-script';
    s.src = 'mlbma_icons.js?v=20260606c';
    s.async = true;
    document.head.appendChild(s);
  }

  function injectShell() {
    ensureIconScripts();
    var page = currentPage();
    if (!document.getElementById('chaseHeader')) {
      document.querySelectorAll('[data-mlbma-nav]').forEach(function (el) {
        renderNav(el, page);
      });
    }
    if (!document.getElementById('mlbmaLoadProgress')) {
      var bar = document.createElement('div');
      bar.className = 'mlbma-load-progress';
      bar.id = 'mlbmaLoadProgress';
      document.body.insertBefore(bar, document.body.firstChild);
    }
    if (!document.getElementById('mlbmaLoading')) {
      var ov = document.createElement('div');
      ov.className = 'mlbma-loading';
      ov.id = 'mlbmaLoading';
      var iconSrc = (window.MLBMAAssets && MLBMAAssets.BRAND && MLBMAAssets.BRAND.iconFilled)
        ? MLBMAAssets.BRAND.iconFilled
        : 'assets/chase-icon-filled.png';
      ov.innerHTML =
        '<img class="chase-loading-icon ca-icon-loading mlbma-load-icon" src="' + iconSrc + '" alt="" width="80" height="80" '
        + 'onerror="this.style.display=\'none\'">' +
        '<div class="mlbma-load-sub">Loading live data...</div>';
      document.body.insertBefore(ov, document.body.firstChild);
    }
    hideInlineLoadingText();
    document.querySelectorAll('.loading, #loadingScreen, #loading, #loadingOverlay').forEach(function (el) {
      el.classList.add('hide');
      el.style.display = 'none';
    });
    document.body.classList.add('mlbma-shell-ready');
  }

  function finishLoading() {
    var ov = document.getElementById('mlbmaLoading');
    var bar = document.getElementById('mlbmaLoadProgress');
    if (ov) {
      ov.classList.add('hide');
      ov.setAttribute('aria-hidden', 'true');
      ov.style.display = 'none';
    }
    if (bar) bar.classList.add('done');
    hideInlineLoadingText();
    document.querySelectorAll('.loading, #loadingScreen, #loading, #loadingOverlay').forEach(function (el) {
      el.classList.add('hide');
      el.style.display = 'none';
    });
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.documentElement.classList.remove('mlbma-page-loading');
    document.body.classList.remove('mlbma-page-loading');
    document.documentElement.classList.remove('view-pending');
    document.body.classList.remove('view-pending');
    applyDashboardTitleCase(document);
  }

  /** Dismiss full-viewport loading overlay (alias used by dashboards). */
  function hideLoadingOverlay() {
    finishLoading();
  }

  /**
   * Auto-dismiss overlay after ms; call returned function when load completes.
   * @param {number} ms
   * @param {function} onTimeout
   * @returns {function} complete
   */
  function startLoadWatchdog(ms, onTimeout) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      console.warn('[MLBMA_UI] load watchdog fired ù dismissing overlay');
      if (typeof onTimeout === 'function') onTimeout();
      hideLoadingOverlay();
    }, ms || 8000);
    return function complete() {
      done = true;
      clearTimeout(timer);
    };
  }

  function sheetCsvUrl(tab) {
    var sid = (global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_ID) || global.MLBMA_SHEET_ID;
    if (!sid) return null;
    return (
      'https://docs.google.com/spreadsheets/d/' + sid +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tab)
    );
  }

  function loadFooterTimestamp() {
    var el = document.getElementById('mlbmaFooterUpdated');
    if (!el) return;
    var tab =
      global.MLBMA_CONFIG &&
      global.MLBMA_CONFIG.SHEET_TABS &&
      global.MLBMA_CONFIG.SHEET_TABS.last_updated;
    var url = tab ? sheetCsvUrl(tab) : null;
    if (!url) {
      el.textContent = 'ù';
      return;
    }
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var line = (t || '').trim().split('\n')[1] || '';
        var val = line.split(',')[0].replace(/^"|"$/g, '').trim();
        el.textContent = val || 'ù';
      })
      .catch(function () { el.textContent = 'ù'; });
  }

  function injectFooter() {
    if (document.getElementById('mlbmaFooter')) return;
    var ft = document.createElement('footer');
    ft.className = 'mlbma-footer';
    ft.id = 'mlbmaFooter';
    ft.innerHTML =
      '<div>Chase Analytics ù MLBMA Pipeline v2.0</div>' +
      '<div class="mlbma-footer-center">Data refreshes daily after 9am ET pipeline run</div>' +
      '<div class="mlbma-footer-right">Updated: <span id="mlbmaFooterUpdated">ù</span></div>';
    document.body.appendChild(ft);
    loadFooterTimestamp();
  }

  var TITLE_CASE_SELECTORS = [
    '.purpose',
    '.ca-page-header__sub',
    '.ca-tool-card__lede',
    '.ca-hero__lede',
    '.lv-family-desc',
    '.rl-workspace-subtitle',
    '.gloss-convention__lead',
    '.gloss-convention__note',
    '.matchups-section-sub',
    '.ca-section-header .ca-helper',
    '.tp-intel-note',
    '.tp-opponent-strength-note',
    '.tp-staff-meta',
    '.tp-summary-filter',
    '.ca-empty-state .ca-helper',
    '.matchups-feature-list li'
  ].join(',');

  function shouldSkipTitleCase(el) {
    if (!el || el.dataset.titleCased === '1') return true;
    if (el.querySelector('.chip, .val-chip, .hub-pill, button, img, svg, input, select, table, li')) return true;
    return false;
  }

  function applyDashboardTitleCase(root) {
    var A = global.MLBMAAssets;
    var tc = A && A.titleCaseLabel;
    if (!tc) return;
    (root || document).querySelectorAll(TITLE_CASE_SELECTORS).forEach(function (el) {
      if (shouldSkipTitleCase(el)) return;
      var text = (el.textContent || '').trim();
      if (!text) return;
      el.textContent = tc(text);
      el.dataset.titleCased = '1';
    });
  }

  function init() {
    document.body.classList.add('mlbma-page-loading');
    injectShell();
    injectFooter();
    applyDashboardTitleCase(document);
    setTimeout(function () {
      var ov = document.getElementById('mlbmaLoading');
      if (ov && !ov.classList.contains('hide')) {
        console.warn('[MLBMA_UI] safety timeout ù dismissing loading overlay');
        finishLoading();
      }
    }, 14000);
  }

  function loadViewportHelper() {
    if (global.MLBMAViewport) return;
    var s = document.createElement('script');
    s.src = 'platform_viewport.js?v=20260610';
    s.async = true;
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      loadViewportHelper();
      init();
    });
  } else {
    loadViewportHelper();
    init();
  }

  global.MLBMA_UI = {
    finishLoading: finishLoading,
    hideLoadingOverlay: hideLoadingOverlay,
    startLoadWatchdog: startLoadWatchdog,
    renderNav: renderNav,
    loadFooterTimestamp: loadFooterTimestamp,
    currentPage: currentPage,
    injectShell: injectShell,
    applyDashboardTitleCase: applyDashboardTitleCase,
  };
})(window);
