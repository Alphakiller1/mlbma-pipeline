/**
 * MLBMA icon system — Lucide SVGs inlined (no runtime library load).
 */
(function(global) {
  'use strict';

  var SVG_ATTRS = ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  /** Inlined Lucide paths + one custom crossed-bats mark. */
  var CA_ICONS = {
    'trending-up': '<svg' + SVG_ATTRS + '><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    'trending-down': '<svg' + SVG_ATTRS + '><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
    target: '<svg' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    'bar-chart-3': '<svg' + SVG_ATTRS + '><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    'circle-dollar-sign': '<svg' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
    trophy: '<svg' + SVG_ATTRS + '><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    'shield-check': '<svg' + SVG_ATTRS + '><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
    'arrow-left-right': '<svg' + SVG_ATTRS + '><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>',
    'clipboard-list': '<svg' + SVG_ATTRS + '><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    'layout-grid': '<svg' + SVG_ATTRS + '><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
    list: '<svg' + SVG_ATTRS + '><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>',
    swords: '<svg' + SVG_ATTRS + '><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
    'flask-conical': '<svg' + SVG_ATTRS + '><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>',
    search: '<svg' + SVG_ATTRS + '><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    'arrow-right': '<svg' + SVG_ATTRS + '><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    'circle-dot': '<svg' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>',
    'git-compare': '<svg' + SVG_ATTRS + '><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>',
    bats: '<svg' + SVG_ATTRS + '><path d="M4 20 9 4"/><path d="M9 4l2 8"/><path d="M20 20 15 4"/><path d="M15 4l-2 8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>'
  };

  var ICON_ALIAS = {
    trend: 'trending-up',
    'trend-up': 'trending-up',
    'trend-down': 'trending-down',
    bars: 'bar-chart-3',
    chart: 'bar-chart-3',
    dollar: 'circle-dollar-sign',
    edge: 'circle-dollar-sign',
    betting: 'circle-dollar-sign',
    award: 'trophy',
    leader: 'trophy',
    rankings: 'layout-grid',
    grid: 'layout-grid',
    process: 'target',
    power: 'trending-up',
    regression: 'trending-down',
    risk: 'trending-down',
    analyst: 'clipboard-list',
    clipboard: 'clipboard-list',
    discipline: 'shield-check',
    shield: 'shield-check',
    swap: 'arrow-left-right',
    onbase: 'circle-dot',
    compare: 'swords',
    matchups: 'swords',
    trends: 'trending-up',
    pitching: 'target',
    flask: 'flask-conical',
    open: 'arrow-right',
    barrel: 'bats',
    contact: 'bats'
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

  function iconSvg(name) {
    var key = resolveLucideName(name);
    return CA_ICONS[key] || CA_ICONS['circle-dot'];
  }

  function iconCircleHtml(name, small, hero) {
    var cls = 'ca-icon-circle';
    if (hero) cls += ' ca-icon-circle--hero';
    else if (small) cls += ' ca-icon-circle--sm';
    return '<span class="' + cls + '" aria-hidden="true">' + iconSvg(name) + '</span>';
  }

  function iconHtml(name, size) {
    var px = size || 18;
    var svg = iconSvg(name);
    return svg.replace('<svg', '<svg style="width:' + px + 'px;height:' + px + 'px;flex:none"');
  }

  /** Upgrade legacy data-lucide placeholders to inlined SVG (no CDN). */
  function refreshIcons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('[data-lucide]');
    nodes.forEach(function(el) {
      var name = el.getAttribute('data-lucide');
      if (!name) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = iconSvg(name);
      var svg = tmp.firstElementChild;
      if (!svg) return;
      if (el.style.width) svg.style.width = el.style.width;
      if (el.style.height) svg.style.height = el.style.height;
      if (el.className) svg.setAttribute('class', el.className);
      el.replaceWith(svg);
    });
    return Promise.resolve();
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
    CA_ICONS: CA_ICONS,
    iconCircleHtml: iconCircleHtml,
    iconHtml: iconHtml,
    iconSvg: iconSvg,
    refreshIcons: refreshIcons,
    resolveLucideName: resolveLucideName,
    ICON_ALIAS: ICON_ALIAS
  };
})(typeof window !== 'undefined' ? window : this);
