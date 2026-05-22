/**
 * MLBMA shared dashboard UI — nav, loading overlay, footer timestamp.
 */
(function (global) {
  'use strict';

  var NAV = [
    [{ file: 'chase_analytics_mlb_oem_v7.html', label: 'Main' }],
    [
      { file: 'matchup_sheet.html', label: 'Matchups' },
      { file: 'player_search.html', label: 'Player Search' },
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

  function injectShell() {
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
      ov.innerHTML =
        '<div class="mlbma-load-logo">Chase Analytics</div>' +
        '<div class="mlbma-load-sub">Loading live data...</div>';
      document.body.insertBefore(ov, document.body.firstChild);
    }
    document.querySelectorAll('.loading, #loadingScreen, #loading').forEach(function (el) {
      el.classList.add('hide');
      el.style.display = 'none';
    });
  }

  function finishLoading() {
    var ov = document.getElementById('mlbmaLoading');
    var bar = document.getElementById('mlbmaLoadProgress');
    if (ov) ov.classList.add('hide');
    if (bar) bar.classList.add('done');
    document.querySelectorAll('.loading, #loadingScreen, #loading').forEach(function (el) {
      el.classList.add('hide');
    });
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
      el.textContent = '—';
      return;
    }
    fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var line = (t || '').trim().split('\n')[1] || '';
        var val = line.split(',')[0].replace(/^"|"$/g, '').trim();
        el.textContent = val || '—';
      })
      .catch(function () { el.textContent = '—'; });
  }

  function injectFooter() {
    if (document.getElementById('mlbmaFooter')) return;
    var ft = document.createElement('footer');
    ft.className = 'mlbma-footer';
    ft.id = 'mlbmaFooter';
    ft.innerHTML =
      '<div>Chase Analytics · MLBMA Pipeline v2.0</div>' +
      '<div class="mlbma-footer-center">Data refreshes daily after 9am ET pipeline run</div>' +
      '<div class="mlbma-footer-right">Updated: <span id="mlbmaFooterUpdated">—</span></div>';
    document.body.appendChild(ft);
    loadFooterTimestamp();
  }

  function init() {
    injectShell();
    injectFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.MLBMA_UI = {
    finishLoading: finishLoading,
    renderNav: renderNav,
    loadFooterTimestamp: loadFooterTimestamp,
    currentPage: currentPage,
  };
})(window);
