/**
 * MLBMA Lucide icons — uniform violet circles, shared refresh helper.
 */
(function(global) {
  'use strict';

  var LUCIDE_CDN = 'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js';
  var lucideReady = null;

  var ICON_ALIAS = {
    trend: 'trending-up',
    'trend-up': 'trending-up',
    'trend-down': 'trending-down',
    target: 'target',
    swap: 'arrow-left-right',
    edge: 'circle-dollar-sign',
    risk: 'trending-down',
    trophy: 'trophy',
    leader: 'trophy',
    process: 'target',
    power: 'trending-up',
    regression: 'trending-down',
    betting: 'circle-dollar-sign',
    analyst: 'clipboard-list',
    discipline: 'shield-check',
    onbase: 'circle-dot',
    compare: 'swords',
    trends: 'trending-up',
    rankings: 'trophy',
    pitching: 'target',
    flask: 'flask-conical',
    chart: 'bar-chart-3',
    matchups: 'swords',
    open: 'arrow-right'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveLucideName(name) {
    if (!name) return 'circle-dot';
    var key = String(name).toLowerCase();
    return ICON_ALIAS[key] || key;
  }

  function loadScript(src, id) {
    if (id && document.getElementById(id)) {
      return new Promise(function(resolve) {
        if (global.lucide) resolve(global.lucide);
        else document.getElementById(id).addEventListener('load', function() { resolve(global.lucide); });
      });
    }
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      if (id) s.id = id;
      s.src = src;
      s.async = true;
      s.onload = function() { resolve(global.lucide); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function ensureLucide() {
    if (global.lucide && global.lucide.createIcons) return Promise.resolve(global.lucide);
    if (!lucideReady) {
      lucideReady = loadScript(LUCIDE_CDN, 'lucide-cdn').catch(function(err) {
        lucideReady = null;
        throw err;
      });
    }
    return lucideReady;
  }

  function iconCircleHtml(name, small) {
    var lucideName = resolveLucideName(name);
    var cls = 'ca-icon-circle' + (small ? ' ca-icon-circle--sm' : '');
    return '<span class="' + cls + '" aria-hidden="true"><i data-lucide="' + esc(lucideName) + '"></i></span>';
  }

  function iconHtml(name, size) {
    var lucideName = resolveLucideName(name);
    var px = size || 18;
    return '<i data-lucide="' + esc(lucideName) + '" style="width:' + px + 'px;height:' + px + 'px" aria-hidden="true"></i>';
  }

  function refreshIcons(root) {
    return ensureLucide().then(function(lucide) {
      if (!lucide || !lucide.createIcons) return;
      var opts = {};
      if (root && root.querySelectorAll) {
        opts.root = root;
      }
      lucide.createIcons(opts);
    }).catch(function(err) {
      if (global.console && console.warn) console.warn('[MLBMAIcons] refresh failed', err);
    });
  }

  function initOnReady() {
    refreshIcons(document.body);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnReady);
  } else {
    initOnReady();
  }

  global.MLBMAIcons = {
    iconCircleHtml: iconCircleHtml,
    iconHtml: iconHtml,
    refreshIcons: refreshIcons,
    ensureLucide: ensureLucide,
    resolveLucideName: resolveLucideName,
    ICON_ALIAS: ICON_ALIAS
  };
})(typeof window !== 'undefined' ? window : this);
