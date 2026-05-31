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
    bats: '<svg' + SVG_ATTRS + '><path d="M4 20 9 4"/><path d="M9 4l2 8"/><path d="M20 20 15 4"/><path d="M15 4l-2 8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    layers: '<svg' + SVG_ATTRS + '><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.65-8.58 3.91a2 2 0 0 1-1.66 0L3.6 12.65a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-8.58 3.91a2 2 0 0 1-1.66 0L3.6 17.65a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/></svg>',
    calendar: '<svg' + SVG_ATTRS + '><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
    'calendar-days': '<svg' + SVG_ATTRS + '><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>',
    flame: '<svg' + SVG_ATTRS + '><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    activity: '<svg' + SVG_ATTRS + '><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
    lightbulb: '<svg' + SVG_ATTRS + '><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    brain: '<svg' + SVG_ATTRS + '><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>',
    'brain-circuit': '<svg' + SVG_ATTRS + '><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>',
    users: '<svg' + SVG_ATTRS + '><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'chart-line': '<svg' + SVG_ATTRS + '><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    'git-branch': '<svg' + SVG_ATTRS + '><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    home: '<svg' + SVG_ATTRS + '><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'map-pin': '<svg' + SVG_ATTRS + '><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
    clock: '<svg' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'list-ordered': '<svg' + SVG_ATTRS + '><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
    'table-2': '<svg' + SVG_ATTRS + '><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>',
    gauge: '<svg' + SVG_ATTRS + '><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
    crosshair: '<svg' + SVG_ATTRS + '><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>',
    zap: '<svg' + SVG_ATTRS + '><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
    'alert-triangle': '<svg' + SVG_ATTRS + '><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    binoculars: '<svg' + SVG_ATTRS + '><path d="M10 10h4"/><path d="M13 13v5a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-5"/><path d="M11 13v5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-5"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M12 6V4"/><path d="M6 10a2 2 0 0 0-2 2v1a6 6 0 0 0 12 0v-1a2 2 0 0 0-2-2Z"/></svg>',
    'line-chart': '<svg' + SVG_ATTRS + '><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    stadium: '<svg' + SVG_ATTRS + '><ellipse cx="12" cy="11" rx="9" ry="5"/><path d="M3 11v3c0 2.8 4 5 9 5s9-2.2 9-5v-3"/><path d="M3 14v3c0 2.8 4 5 9 5s9-2.2 9-5v-3"/></svg>'
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
    contact: 'bats',
    offense: 'bats',
    lineup: 'list-ordered',
    rotation: 'target',
    bullpen: 'flame',
    layers: 'layers',
    calendar: 'calendar',
    schedule: 'calendar-days',
    wins: 'trophy',
    flame: 'flame',
    activity: 'activity',
    sustainability: 'activity',
    lightbulb: 'lightbulb',
    research: 'lightbulb',
    intel: 'brain-circuit',
    brain: 'brain',
    users: 'users',
    roster: 'users',
    'chart-line': 'chart-line',
    linechart: 'chart-line',
    platoon: 'git-branch',
    split: 'git-branch',
    branch: 'git-branch',
    home: 'home',
    away: 'map-pin',
    venue: 'map-pin',
    stadium: 'stadium',
    clock: 'clock',
    window: 'clock',
    table: 'table-2',
    data: 'table-2',
    gauge: 'gauge',
    grades: 'layers',
    scoring: 'chart-line',
    crosshair: 'crosshair',
    velocity: 'zap',
    zap: 'zap',
    risk: 'alert-triangle',
    fade: 'trending-down',
    scout: 'binoculars',
    usage: 'bar-chart-3',
    tonight: 'swords',
    matchup: 'swords'
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
