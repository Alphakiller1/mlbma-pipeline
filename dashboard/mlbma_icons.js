/**
 * MLBMA icon system — baseball-native, textured marks (no runtime library load).
 *
 * Two glyph families:
 *   • LINE icons  (SVG_ATTRS)  — thin UI affordances: arrows, search, list, grid.
 *   • MARK icons  (MARK_ATTRS, class="ca-icon-mark") — filled, layered baseball
 *     glyphs with a currentColor radial gradient for "lit leather" depth + engraved
 *     seam/detail strokes. These render in .ca-icon-circle section badges, where the
 *     CSS opts out of the line-stroke override so each path keeps its own fill.
 *
 * Texture stays themeable: every gradient stop uses currentColor at varying opacity,
 * so the whole set still inherits the section's accent color.
 */
(function(global) {
  'use strict';

  var SVG_ATTRS = ' xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  var MARK_ATTRS = ' class="ca-icon-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"';

  function L(body) { return '<svg' + SVG_ATTRS + '>' + body + '</svg>'; }
  function M(body) {
    var s = '<svg' + MARK_ATTRS + '>' + body;     // mark bodies already close their own </svg>
    return /<\/svg>$/.test(s) ? s : s + '</svg>';
  }

  /** Lit radial gradient (currentColor stops) → dimensional, still themeable. */
  function grad(id, cx, cy) {
    return '<defs><radialGradient id="' + id + '" cx="' + (cx || 36) + '%" cy="' + (cy || 28) + '%" r="78%">'
      + '<stop offset="0" stop-color="currentColor" stop-opacity=".95"/>'
      + '<stop offset=".55" stop-color="currentColor" stop-opacity=".6"/>'
      + '<stop offset="1" stop-color="currentColor" stop-opacity=".38"/>'
      + '</radialGradient></defs>';
  }

  // ── Baseball-native MARK glyphs ──────────────────────────────────────────────

  var gBaseball = M(grad('mbgBall', 36, 30)
    + '<circle cx="12" cy="12" r="9" fill="url(#mbgBall)" stroke="currentColor" stroke-width="1.3"/>'
    + '<path d="M7 4.8C9.3 8 9.3 16 7 19.2" fill="none" stroke="#05060B" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>'
    + '<path d="M17 4.8C14.7 8 14.7 16 17 19.2" fill="none" stroke="#05060B" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>'
    + '<g stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".75">'
    + '<path d="M8.2 7 9.6 6.5M8 9.4 9.5 9M8 12 9.5 12M8 14.6 9.5 15M8.2 17 9.6 17.5"/>'
    + '<path d="M15.8 7 14.4 6.5M16 9.4 14.5 9M16 12 14.5 12M16 14.6 14.5 15M15.8 17 14.4 17.5"/>'
    + '</g></svg>');

  var gBat = M(grad('mbgBat', 40, 24)
    + '<g transform="rotate(-45 12 12)">'
    + '<rect x="10.4" y="3.6" width="3.6" height="10.2" rx="1.8" fill="url(#mbgBat)" stroke="currentColor" stroke-width="1.2"/>'
    + '<rect x="11" y="12.6" width="2.4" height="6.4" rx="1.1" fill="url(#mbgBat)" stroke="currentColor" stroke-width="1.1"/>'
    + '<rect x="10.5" y="18.2" width="3.4" height="2.2" rx="1" fill="currentColor" stroke="none"/>'
    + '<path d="M12 5v8" stroke="#05060B" stroke-width="1" stroke-linecap="round" opacity=".35"/>'
    + '</g></svg>');

  var gBats = M(grad('mbgBats', 40, 24)
    + '<g transform="rotate(-32 12 12)"><rect x="10.6" y="2.6" width="3" height="9" rx="1.5" fill="url(#mbgBats)" stroke="currentColor" stroke-width="1.1"/>'
    + '<rect x="11.1" y="10.4" width="2" height="9.6" rx=".9" fill="url(#mbgBats)" stroke="currentColor" stroke-width="1"/></g>'
    + '<g transform="rotate(32 12 12)"><rect x="10.6" y="2.6" width="3" height="9" rx="1.5" fill="url(#mbgBats)" stroke="currentColor" stroke-width="1.1"/>'
    + '<rect x="11.1" y="10.4" width="2" height="9.6" rx=".9" fill="url(#mbgBats)" stroke="currentColor" stroke-width="1"/></g>'
    + '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="#05060B" stroke-width=".6"/></svg>');

  var gPlate = M(grad('mbgPlate', 42, 26)
    + '<path d="M5.2 5.4h13.6v6.1L12 19.2 5.2 11.5Z" fill="url(#mbgPlate)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<path d="M6.6 6.7h10.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/></svg>');

  var gDiamond = M(grad('mbgDia', 42, 24)
    + '<path d="M12 3 21 12 12 21 3 12Z" fill="url(#mbgDia)" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    + '<g fill="currentColor" stroke="#05060B" stroke-width=".5">'
    + '<rect x="10.6" y="18.4" width="2.8" height="2.8" rx=".5" transform="rotate(45 12 19.8)"/>'
    + '<rect x="18.4" y="10.6" width="2.6" height="2.6" rx=".5" transform="rotate(45 19.7 11.9)"/>'
    + '<rect x="10.7" y="2.9" width="2.6" height="2.6" rx=".5" transform="rotate(45 12 4.2)"/>'
    + '<rect x="3" y="10.6" width="2.6" height="2.6" rx=".5" transform="rotate(45 4.3 11.9)"/>'
    + '</g><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>');

  var gGlove = M(grad('mbgGlove', 38, 26)
    + '<path d="M5.8 8.6a1.7 1.7 0 0 0 3.4 0 1.7 1.7 0 0 0 3.4 0 1.7 1.7 0 0 0 3.4 0 1.6 1.6 0 0 0 3 0L18.6 13a6.6 6.6 0 0 1-13.2 0Z" fill="url(#mbgGlove)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M4.6 13.2A2.2 2.2 0 0 1 6 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'
    + '<path d="M9.2 9.2v2.4M12.6 9.2v2.4M16 9.2v2.4" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".4"/>'
    + '<circle cx="12" cy="13.7" r="2.4" fill="currentColor" stroke="#05060B" stroke-width=".6"/></svg>');

  var gCap = M(grad('mbgCap', 40, 30)
    + '<path d="M4.5 14a7.5 7.5 0 0 1 15 0Z" fill="url(#mbgCap)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M12.4 14q6.4.1 8.2 2.3.6.7-.3 1.1Q18 18.2 14 17.6Z" fill="url(#mbgCap)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'
    + '<circle cx="12" cy="6.7" r="1" fill="currentColor" stroke="none"/>'
    + '<path d="M9 14V8.4M12 13.9V6.9M15 14V8.4" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".42"/></svg>');

  var gHelmet = M(grad('mbgHel', 40, 30)
    + '<path d="M4.4 14.2a7.6 7.6 0 0 1 15.2 0v.5a1.4 1.4 0 0 1-1.4 1.4H5.8a1.4 1.4 0 0 1-1.4-1.4Z" fill="url(#mbgHel)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M18.8 12.6q2.5.3 2.5 2 0 1.5-2.3 1.6" fill="url(#mbgHel)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'
    + '<circle cx="7.2" cy="13.8" r="2.4" fill="currentColor" stroke="#05060B" stroke-width=".5" opacity=".7"/>'
    + '<path d="M12 6.7v7.4" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".4"/></svg>');

  var gMag = M(grad('mbgMag', 34, 30)
    + '<circle cx="10" cy="10" r="6.4" fill="url(#mbgMag)" stroke="currentColor" stroke-width="1.5"/>'
    + '<path d="M6.2 6.4C7.8 8.2 7.8 11.8 6.2 13.6M13.8 6.4C12.2 8.2 12.2 11.8 13.8 13.6" fill="none" stroke="#05060B" stroke-width="1" stroke-linecap="round" opacity=".5"/>'
    + '<path d="M14.9 14.9 20.6 20.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>');

  var gMask = M(grad('mbgMk', 40, 24)
    + '<path d="M6.6 5h10.8a1.5 1.5 0 0 1 1.5 1.5V12a7 7 0 0 1-14 0V6.5A1.5 1.5 0 0 1 6.6 5Z" fill="url(#mbgMk)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M9 5v12.4M12 5.2v13.6M15 5v12.4M5.5 9h13M5.7 12.8h12.6" stroke="#05060B" stroke-width="1.1" stroke-linecap="round" opacity=".5"/></svg>');

  var gPennant = M(grad('mbgPen', 28, 30)
    + '<path d="M6 3.2v17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    + '<path d="M6.8 4.3 20 7.1 6.8 10.7Z" fill="url(#mbgPen)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'
    + '<path d="m11.4 6 .7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6L9.1 7.7l1.6-.2Z" fill="#05060B" stroke="none" opacity=".5"/></svg>');

  var gTrophy = M(grad('mbgTr', 42, 26)
    + '<path d="M7 3h10v5.6a5 5 0 0 1-10 0Z" fill="url(#mbgTr)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>'
    + '<path d="M7 5H4.8A2.8 2.8 0 0 0 7 9.5M17 5h2.2A2.8 2.8 0 0 1 17 9.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<path d="M12 13.5v3.3M8.6 20.7h6.8M9.9 17.7h4.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M9.6 6.4h4.8" stroke="#05060B" stroke-width="1.3" stroke-linecap="round" opacity=".45"/></svg>');

  var gZone = M(grad('mbgZone', 42, 22)
    + '<rect x="6" y="3.8" width="12" height="13" rx="1" fill="url(#mbgZone)" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M10 3.8v13M14 3.8v13M6 8.1h12M6 12.5h12" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".4"/>'
    + '<rect x="10" y="8.1" width="4" height="4.4" fill="currentColor" stroke="none" opacity=".4"/>'
    + '<path d="M7.6 18.7h8.8L12 21.4Z" fill="currentColor" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>');

  var gRadar = M(grad('mbgRad', 40, 60)
    + '<path d="M3.4 17.6a8.6 8.6 0 0 1 17.2 0Z" fill="url(#mbgRad)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<g stroke="currentColor" stroke-width="1" opacity=".42" stroke-linecap="round"><path d="M5 15 6.5 13.6M12 11.4V9.4M19 15 17.5 13.6"/></g>'
    + '<path d="M12 17.6 16.5 9.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<circle cx="12" cy="17.6" r="1.7" fill="currentColor" stroke="none"/></svg>');

  var gScore = M(grad('mbgSc', 42, 22)
    + '<rect x="3" y="5" width="18" height="14" rx="2" fill="url(#mbgSc)" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M3 8.6h18" stroke="currentColor" stroke-width="1.2" opacity=".5"/>'
    + '<g fill="currentColor" stroke="none" opacity=".78"><rect x="5.4" y="11" width="3.2" height="5" rx=".6"/><rect x="10.4" y="11" width="3.2" height="5" rx=".6"/><rect x="15.4" y="11" width="3.2" height="5" rx=".6"/></g></svg>');

  var gMoney = M(grad('mbgMon', 36, 30)
    + '<circle cx="12" cy="12" r="9" fill="url(#mbgMon)" stroke="currentColor" stroke-width="1.3"/>'
    + '<path d="M6.6 6.6C8.4 8.6 8.4 15.4 6.6 17.4" fill="none" stroke="#05060B" stroke-width="1" stroke-linecap="round" opacity=".4"/>'
    + '<path d="M15.6 9.1h-4a1.8 1.8 0 0 0 0 3.6h2a1.8 1.8 0 0 1 0 3.6H9.2M12 7.4v9.8" fill="none" stroke="#05060B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".72"/></svg>');

  var gSplit = M(grad('mbgSp', 32, 30)
    + '<circle cx="12" cy="12" r="8.6" fill="url(#mbgSp)" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M12 3.4a8.6 8.6 0 0 1 0 17.2Z" fill="currentColor" stroke="none" opacity=".34"/>'
    + '<path d="M12 3v18" stroke="currentColor" stroke-width="1.2" opacity=".7"/></svg>');

  var gClock = M(grad('mbgCl', 38, 30)
    + '<circle cx="12" cy="13.6" r="7.6" fill="url(#mbgCl)" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M9.8 2.6h4.4M12 2.6V5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    + '<path d="M12 13.6V9.2M12 13.6l3 1.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    + '<circle cx="12" cy="13.6" r="1" fill="currentColor" stroke="none"/></svg>');

  var gAlert = M(grad('mbgAl', 40, 64)
    + '<path d="M12 3.6 21.2 19.4a1.4 1.4 0 0 1-1.2 2.1H4a1.4 1.4 0 0 1-1.2-2.1Z" fill="url(#mbgAl)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M12 9.2v4.6" stroke="#05060B" stroke-width="2" stroke-linecap="round" opacity=".62"/>'
    + '<circle cx="12" cy="17.4" r="1.1" fill="#05060B" stroke="none" opacity=".62"/></svg>');

  var gStadium = M(grad('mbgSt', 42, 22)
    + '<path d="M3 10v3.6c0 2.8 4 5 9 5s9-2.2 9-5V10" fill="url(#mbgSt)" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<ellipse cx="12" cy="10" rx="9" ry="5" fill="url(#mbgSt)" stroke="currentColor" stroke-width="1.4"/>'
    + '<ellipse cx="12" cy="10" rx="4.6" ry="2.4" fill="currentColor" stroke="none" opacity=".3"/></svg>');

  var gClip = M(grad('mbgCp', 38, 22)
    + '<rect x="4.5" y="4" width="15" height="17" rx="2.4" fill="url(#mbgCp)" stroke="currentColor" stroke-width="1.4"/>'
    + '<rect x="8.5" y="2.6" width="7" height="3.4" rx="1.2" fill="currentColor" stroke="none"/>'
    + '<path d="M8 10.2h8M8 13.6h8M8 17h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".55"/></svg>');

  var gFlask = M(grad('mbgFl', 40, 24)
    + '<path d="M9.2 3h5.6M10 3v6.4l-5 9.3A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.3l-5-9.3V3" fill="url(#mbgFl)" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M8.1 15.1h7.8l2.1 4H6Z" fill="currentColor" stroke="none" opacity=".5"/>'
    + '<circle cx="10" cy="12.8" r="1.1" fill="currentColor" stroke="none"/></svg>');

  var gTrendUp = M(grad('mbgTu', 36, 30)
    + '<path d="M3 17.6 9 11l3.4 3.2L20 6.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M14.8 6.4H20v5.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="9" cy="11" r="1.9" fill="url(#mbgTu)" stroke="currentColor" stroke-width=".7"/></svg>');

  var gTrendDown = M(grad('mbgTd', 36, 30)
    + '<path d="M3 6.4 9 13l3.4-3.2L20 17.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M14.8 17.6H20v-5.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="9" cy="13" r="1.9" fill="url(#mbgTd)" stroke="currentColor" stroke-width=".7"/></svg>');

  // ── Catalog ──────────────────────────────────────────────────────────────────
  var CA_ICONS = {
    // Baseball-native marks
    baseball: gBaseball, bat: gBat, bats: gBats, 'home-plate': gPlate, home: gPlate,
    diamond: gDiamond, glove: gGlove, cap: gCap, helmet: gHelmet, mask: gMask,
    magnifier: gMag, binoculars: gMag, pennant: gPennant, trophy: gTrophy,
    'strike-zone': gZone, target: gZone, crosshair: gZone, radar: gRadar, gauge: gRadar,
    activity: gRadar, flame: gRadar, 'chart-line': gRadar, 'line-chart': gRadar,
    scoreboard: gScore, 'bar-chart-3': gScore, layers: gScore, 'circle-dollar-sign': gMoney,
    split: gSplit, clock: gClock, 'alert-triangle': gAlert, stadium: gStadium,
    'clipboard-list': gClip, 'flask-conical': gFlask, swords: gBats,
    'trend-up': gTrendUp, 'trend-down': gTrendDown,

    // Line UI affordances
    'trending-up': L('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
    'trending-down': L('<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>'),
    'arrow-up': L('<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'),
    'arrow-down': L('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    'arrow-right': L('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
    'arrow-left-right': L('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
    search: L('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    list: L('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'),
    'list-ordered': L('<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>'),
    'layout-grid': L('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
    'table-2': L('<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>'),
    'git-branch': L('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
    'git-compare': L('<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/>'),
    'book-open': L('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'),
    wind: L('<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>'),
    'map-pin': L('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
    users: L('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    'circle-dot': L('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>'),
    calendar: L('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>')
  };

  // Textured calendar (rotation / schedule) — mark, not line
  CA_ICONS['calendar-days'] = M(grad('mbgCal', 42, 20)
    + '<rect x="3.2" y="5.2" width="17.6" height="15.2" rx="3" fill="url(#mbgCal)" stroke="currentColor" stroke-width="1.4"/>'
    + '<path d="M6.3 3.2v4M17.7 3.2v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path d="M3.6 10h16.8" stroke="currentColor" stroke-width="1.4" opacity=".7"/>'
    + '<g fill="currentColor" stroke="none"><circle cx="8" cy="13.8" r="1.05"/><circle cx="12" cy="13.8" r="1.05"/><circle cx="16" cy="13.8" r="1.05"/><circle cx="8" cy="17" r="1.05"/><circle cx="12" cy="17" r="1.05"/></g></svg>');

  var ICON_ALIAS = {
    trend: 'radar', 'trend-up': 'trend-up', 'trend-down': 'trend-down',
    bars: 'scoreboard', chart: 'scoreboard',
    dollar: 'circle-dollar-sign', edge: 'circle-dollar-sign', betting: 'circle-dollar-sign',
    award: 'trophy', leader: 'pennant',
    rankings: 'scoreboard', grid: 'layout-grid',
    process: 'strike-zone', power: 'radar', regression: 'trend-down',
    analyst: 'clipboard-list', clipboard: 'clipboard-list',
    discipline: 'bat', shield: 'glove', swap: 'arrow-left-right',
    onbase: 'bat', compare: 'bats', matchups: 'bats',
    trends: 'radar', pitching: 'baseball', flask: 'flask-conical',
    open: 'arrow-right', barrel: 'bat', contact: 'bat', offense: 'helmet', lineup: 'bats',
    rotation: 'baseball', starters: 'baseball', bullpen: 'glove',
    calendar: 'calendar-days', schedule: 'calendar-days',
    opponents: 'magnifier', wins: 'pennant', results: 'trophy',
    flame: 'radar', activity: 'radar', sustainability: 'strike-zone',
    lightbulb: 'clipboard-list', research: 'magnifier', intel: 'magnifier', brain: 'magnifier',
    users: 'cap', roster: 'cap',
    'chart-line': 'radar', linechart: 'radar',
    platoon: 'split', branch: 'git-branch',
    away: 'map-pin', venue: 'stadium',
    weather: 'wind', window: 'clock',
    table: 'scoreboard', data: 'scoreboard', gauge: 'radar', grades: 'scoreboard', scoring: 'radar',
    crosshair: 'strike-zone', velocity: 'radar', zap: 'bats', risk: 'alert-triangle',
    fade: 'trend-down', scout: 'magnifier', usage: 'scoreboard', tonight: 'diamond',
    matchup: 'bats', game: 'diamond', production: 'scoreboard',
    skills: 'bat', depth: 'list-ordered', late: 'clock', analysis: 'clipboard-list',
    plate: 'home-plate', mound: 'baseball', identity: 'cap', intelligence: 'magnifier'
  };

  /** Team Profile — semantic section key → baseball glyph. */
  var PROFILE_ICONS = {
    lineup: 'bats', rotation: 'baseball', bullpen: 'glove', starters: 'baseball', relievers: 'glove',
    'offense-profile': 'helmet', batting: 'bat', 'rolling-trend': 'radar', momentum: 'radar', trend: 'radar',
    'schedule-context': 'calendar-days', schedule: 'calendar-days', opponents: 'magnifier',
    'surface-wins': 'pennant', results: 'trophy', tonight: 'diamond',
    'analyst-take': 'clipboard-list', analysis: 'clipboard-list', sustainability: 'strike-zone',
    'research-takeaways': 'clipboard-list', 'staff-takeaways': 'clipboard-list', 'staff-snapshot': 'glove',
    pitching: 'baseball', 'rotation-section': 'baseball', 'bullpen-section': 'glove',
    roster: 'cap', usage: 'scoreboard', 'run-production': 'scoreboard', 'plate-skills': 'bat',
    'totals-lean': 'circle-dollar-sign', 'matchup-risk': 'bats', 'fade-conditions': 'alert-triangle',
    'research-note': 'clipboard-list', 'run-prevention': 'glove', 'depth-gap': 'list-ordered',
    'late-inning': 'clock', 'high-leverage': 'alert-triangle', 'platoon-angle': 'split',
    'contact-hot': 'trend-up', 'contact-cold': 'trend-down', 'contact-flat': 'strike-zone',
    'platoon-profile': 'split', 'discipline-split': 'split', 'process-upside': 'strike-zone',
    'regression-watch': 'trend-down', 'platoon-report': 'split', identity: 'cap', intelligence: 'magnifier'
  };

  function profileIcon(key) {
    if (!key) return 'clipboard-list';
    var k = String(key).toLowerCase();
    if (PROFILE_ICONS[k]) return PROFILE_ICONS[k];
    return resolveLucideName(k);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resolveLucideName(name) {
    if (!name) return 'circle-dot';
    var key = String(name).toLowerCase();
    return ICON_ALIAS[key] || key;
  }

  function iconSvg(name) {
    var key = profileIcon(name);
    return CA_ICONS[key] || CA_ICONS[ICON_ALIAS[key]] || CA_ICONS['circle-dot'];
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
      var legacyClass = el.getAttribute ? el.getAttribute('class') : '';
      if (legacyClass) {
        svg.setAttribute('class', ((svg.getAttribute('class') || '') + ' ' + legacyClass).trim());
      }
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
    profileIcon: profileIcon,
    PROFILE_ICONS: PROFILE_ICONS,
    ICON_ALIAS: ICON_ALIAS
  };
})(typeof window !== 'undefined' ? window : this);
