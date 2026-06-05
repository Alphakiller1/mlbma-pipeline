/**
 * MLBMA icon system — infographic PNG marks from the ChatGPT MLB icon set,
 * plus thin inline SVG for small utility affordances (arrows, wind, etc.).
 *
 * Mark icons: dashboard/assets/icons/*.png (cropped from MLB icons grids).
 * Regenerate: python scripts/build_mlbma_icons.py
 * Validate:   python scripts/validate_mlbma_icons.py
 */
(function(global) {
  'use strict';

  var ICON_VER = '20260619b';
  var ICON_BASE = 'assets/icons/';
  var MICRO_PX = 18;

  var SVG_ATTRS = ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  function L(body) { return '<svg' + SVG_ATTRS + '>' + body + '</svg>'; }

  /** Primary mark catalog — PNG filename stem (no extension). */
  var MARK_ICONS = {
    dashboard: 'dashboard',
    'team-rankings': 'team-rankings',
    trends: 'trends',
    matchups: 'matchups',
    compare: 'compare',
    'team-profile': 'team-profile',
    'player-profile': 'player-profile',
    offense: 'offense',
    pitching: 'pitching',
    lineups: 'lineups',
    metrics: 'metrics',
    'research-lab': 'research-lab',
    alerts: 'alerts',
    glossary: 'glossary',
    reports: 'reports',
    settings: 'settings',
    'strike-zone': 'strike-zone',
    'velocity-gauge': 'velocity-gauge',
    'search-filter': 'search-filter',
    'team-shield': 'team-shield',
    'roster-board': 'roster-board',
    'lab-flask': 'lab-flask',
    'notify-bell': 'notify-bell',
    playbook: 'playbook',
    'summary-doc': 'summary-doc',
    'config-gear': 'config-gear',
    'diamond-field': 'diamond-field',
    'lineup-bars': 'lineup-bars',
    'trend-line': 'trend-line',
    'matchup-plates': 'matchup-plates',
    'batting-chart': 'batting-chart',
    'compare-stats': 'compare-stats',
    'player-card': 'player-card',
    'offense-power': 'offense-power',
    'analytics-hub': 'analytics-hub',

    // Legacy keys → PNG marks
    baseball: 'pitching',
    bat: 'offense',
    bats: 'matchups',
    'home-plate': 'diamond-field',
    home: 'diamond-field',
    diamond: 'diamond-field',
    glove: 'team-shield',
    cap: 'team-profile',
    helmet: 'player-profile',
    mask: 'strike-zone',
    magnifier: 'search-filter',
    binoculars: 'search-filter',
    pennant: 'team-rankings',
    trophy: 'team-rankings',
    target: 'strike-zone',
    crosshair: 'strike-zone',
    radar: 'trends',
    gauge: 'velocity-gauge',
    activity: 'trend-line',
    flame: 'trend-line',
    'chart-line': 'trend-line',
    'line-chart': 'trend-line',
    scoreboard: 'team-rankings',
    'bar-chart-3': 'metrics',
    layers: 'metrics',
    'circle-dollar-sign': 'metrics',
    split: 'compare-stats',
    clock: 'settings',
    'alert-triangle': 'alerts',
    stadium: 'diamond-field',
    'clipboard-list': 'reports',
    'flask-conical': 'research-lab',
    swords: 'matchups',
    'trending-up': 'trends',
    'trending-down': 'trend-line',
    'trend-up': 'trends',
    'trend-down': 'trend-line',
    'calendar-days': 'lineups',
    'list-ordered': 'lineups',
    'layout-grid': 'dashboard',
    'table-2': 'metrics',
    'book-open': 'glossary',
    'git-compare': 'compare',
    search: 'search-filter',
    list: 'lineup-bars',
    insight: 'research-lab'
  };

  /** Thin line SVGs — utility controls + micro-size fallbacks (<=18px). */
  var LINE_ICONS = {
    'trending-up': L('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
    'trending-down': L('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>'),
    'arrow-up': L('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
    'arrow-down': L('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    'arrow-right': L('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
    'arrow-left-right': L('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
    'git-branch': L('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
    wind: L('<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
    'map-pin': L('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
    users: L('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    'circle-dot': L('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>'),
    calendar: L('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
    list: L('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'),
    search: L('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    'book-open': L('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>')
  };

  var ICON_ALIAS = {
    trend: 'trends', 'trend-up': 'trends', 'trend-down': 'trend-line',
    bars: 'team-rankings', chart: 'metrics',
    dollar: 'metrics', edge: 'metrics', betting: 'metrics',
    award: 'team-rankings', leader: 'team-rankings',
    rankings: 'team-rankings', grid: 'dashboard',
    process: 'strike-zone', power: 'offense-power', regression: 'trend-line',
    analyst: 'reports', clipboard: 'reports',
    discipline: 'strike-zone', shield: 'team-shield', swap: 'arrow-left-right',
    onbase: 'offense', contact: 'batting-chart',
    pitching: 'pitching', flask: 'research-lab',
    open: 'arrow-right', barrel: 'offense-power',
    rotation: 'pitching', starters: 'pitching', bullpen: 'team-shield',
    calendar: 'lineups', schedule: 'lineups',
    opponents: 'search-filter', wins: 'team-rankings', results: 'team-rankings',
    flame: 'trend-line', activity: 'trend-line', sustainability: 'strike-zone',
    lightbulb: 'reports', research: 'research-lab', intel: 'search-filter', brain: 'research-lab',
    insight: 'research-lab',
    users: 'player-profile', roster: 'team-profile',
    'chart-line': 'trend-line', linechart: 'trend-line',
    platoon: 'compare-stats', branch: 'git-branch',
    away: 'diamond-field', venue: 'diamond-field',
    weather: 'wind', window: 'settings',
    table: 'metrics', data: 'metrics', grades: 'metrics', scoring: 'trends',
    velocity: 'velocity-gauge', zap: 'matchups', risk: 'alerts',
    fade: 'trend-line', scout: 'search-filter', usage: 'metrics', tonight: 'matchups',
    matchup: 'matchups', game: 'diamond-field', production: 'metrics',
    skills: 'offense', depth: 'lineups', late: 'settings', analysis: 'reports',
    plate: 'diamond-field', mound: 'pitching', identity: 'team-profile', intelligence: 'search-filter',
    compare: 'compare', matchups: 'matchups', lineup: 'lineups', split: 'compare-stats',
    batting: 'offense'
  };

  var PROFILE_ICONS = {
    lineup: 'lineups', rotation: 'pitching', bullpen: 'team-shield', starters: 'pitching', relievers: 'team-shield',
    'offense-profile': 'offense', batting: 'offense', 'rolling-trend': 'trends', momentum: 'trends', trend: 'trends',
    'schedule-context': 'lineups', schedule: 'lineups', opponents: 'search-filter',
    'surface-wins': 'team-rankings', results: 'team-rankings', tonight: 'matchups',
    'analyst-take': 'reports', analysis: 'reports', sustainability: 'strike-zone',
    'research-takeaways': 'research-lab', 'staff-takeaways': 'reports', 'staff-snapshot': 'team-shield',
    pitching: 'pitching', 'rotation-section': 'pitching', 'bullpen-section': 'team-shield',
    roster: 'team-profile', usage: 'metrics', 'run-production': 'metrics', 'plate-skills': 'offense',
    'totals-lean': 'metrics', 'matchup-risk': 'matchups', 'fade-conditions': 'alerts',
    'research-note': 'research-lab', 'run-prevention': 'pitching', 'depth-gap': 'lineups',
    'late-inning': 'settings', 'high-leverage': 'alerts', 'platoon-angle': 'compare-stats',
    'contact-hot': 'trends', 'contact-cold': 'trend-line', 'contact-flat': 'strike-zone',
    'platoon-profile': 'compare-stats', 'discipline-split': 'compare-stats', 'process-upside': 'strike-zone',
    'regression-watch': 'trend-line', 'platoon-report': 'compare-stats', identity: 'team-profile', intelligence: 'search-filter',
    target: 'strike-zone', spark: 'metrics', shield: 'team-shield', list: 'lineups', split: 'compare-stats',
    insight: 'research-lab'
  };

  function resolveLucideName(name) {
    if (!name) return 'circle-dot';
    var key = String(name).toLowerCase();
    return ICON_ALIAS[key] || key;
  }

  function profileIcon(key) {
    if (!key) return 'reports';
    var k = String(key).toLowerCase();
    if (PROFILE_ICONS[k]) return PROFILE_ICONS[k];
    return resolveLucideName(k);
  }

  function markFile(name) {
    var key = profileIcon(name);
    if (MARK_ICONS[key]) return MARK_ICONS[key];
    key = resolveLucideName(key);
    return MARK_ICONS[key] || null;
  }

  function lineIcon(name) {
    var key = resolveLucideName(profileIcon(name));
    return LINE_ICONS[key] || LINE_ICONS[name] || null;
  }

  function isMarkIcon(name) {
    return !!markFile(name);
  }

  function iconImgHtml(name, px) {
    var file = markFile(name);
    if (!file) return '';
    var size = px || 46;
    return '<img class="ca-icon-img" src="' + ICON_BASE + file + '.png?v=' + ICON_VER + '" '
      + 'alt="" width="' + size + '" height="' + size + '" loading="lazy" decoding="async">';
  }

  function iconSvg(name, opts) {
    opts = opts || {};
    var resolved = profileIcon(name);
    var useLine = opts.preferLine || (opts.px && opts.px <= MICRO_PX);
    if (useLine) {
      var line = lineIcon(name);
      if (line) return line;
    }
    var img = iconImgHtml(resolved, opts.px);
    if (img) return img;
    var key = resolveLucideName(resolved);
    return LINE_ICONS[key] || LINE_ICONS['circle-dot'];
  }

  function iconCircleHtml(name, small, hero) {
    var cls = 'ca-icon-circle';
    if (isMarkIcon(name)) cls += ' ca-icon-circle--asset';
    if (hero) cls += ' ca-icon-circle--hero';
    else if (small) cls += ' ca-icon-circle--sm';
    var px = hero ? 50 : (small ? 38 : 46);
    return '<span class="' + cls + '" aria-hidden="true">' + iconSvg(name, { px: px }) + '</span>';
  }

  function iconHtml(name, size) {
    var px = size || 18;
    var out = iconSvg(name, { px: px, preferLine: px <= MICRO_PX });
    if (out.indexOf('<img') === 0) {
      return out.replace(/width="\d+"/, 'width="' + px + '"').replace(/height="\d+"/, 'height="' + px + '"');
    }
    return out.replace('<svg', '<svg style="width:' + px + 'px;height:' + px + 'px;flex:none"');
  }

  function decorateAssetParent(node) {
    if (!node || node.tagName !== 'IMG') return;
    var circle = node.closest('.ca-icon-circle');
    if (circle) circle.classList.add('ca-icon-circle--asset');
    var toolIcon = node.closest('.ca-tool-card__icon');
    if (toolIcon) toolIcon.classList.add('ca-tool-card__icon--asset');
    var sectionIcon = node.closest('.ca-icon');
    if (sectionIcon) sectionIcon.classList.add('ca-icon--asset');
    var tabIcon = node.closest('.tp-unit-tab-icon');
    if (tabIcon) tabIcon.classList.add('tp-unit-tab-icon--asset');
  }

  function refreshIcons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('[data-lucide]');
    nodes.forEach(function(el) {
      var name = el.getAttribute('data-lucide');
      if (!name) return;
      var inlinePx = parseInt(el.style.width, 10) || parseInt(el.style.height, 10) || 0;
      var tmp = document.createElement('div');
      tmp.innerHTML = iconSvg(name, { px: inlinePx || undefined, preferLine: inlinePx > 0 && inlinePx <= MICRO_PX });
      var node = tmp.firstElementChild;
      if (!node) return;
      if (el.style.width) node.style.width = el.style.width;
      if (el.style.height) node.style.height = el.style.height;
      var legacyClass = el.getAttribute ? el.getAttribute('class') : '';
      if (legacyClass) {
        node.setAttribute('class', ((node.getAttribute('class') || '') + ' ' + legacyClass).trim());
      }
      decorateAssetParent(node);
      el.replaceWith(node);
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
    MARK_ICONS: MARK_ICONS,
    LINE_ICONS: LINE_ICONS,
    CA_ICONS: MARK_ICONS,
    iconCircleHtml: iconCircleHtml,
    iconHtml: iconHtml,
    iconSvg: iconSvg,
    iconImgHtml: iconImgHtml,
    refreshIcons: refreshIcons,
    resolveLucideName: resolveLucideName,
    profileIcon: profileIcon,
    isMarkIcon: isMarkIcon,
    markFile: markFile,
    PROFILE_ICONS: PROFILE_ICONS,
    ICON_ALIAS: ICON_ALIAS
  };
})(typeof window !== 'undefined' ? window : this);
