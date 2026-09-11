/* ===========================================================================
 * CHASE ICONS — the desk's symbol set
 * ---------------------------------------------------------------------------
 * Source: Lucide (https://lucide.dev), ISC licence, © Lucide contributors.
 * Lucide is itself a fork of Feather Icons (MIT, © Cole Bemis).
 *
 * The glyphs are vendored rather than loaded, deliberately. This site is
 * vanilla HTML/CSS/JS with no bundler, and its CSP does not admit an icon CDN;
 * a runtime <script> from unpkg would fail silently and every symbol on the
 * page would vanish at once. Inlining the path data makes the set part of the
 * build: it cannot 404, cannot drift, and costs no request.
 *
 * Everything here is a 24×24 stroked outline on `currentColor`, so an icon
 * takes the colour and weight of the text beside it and a grade class tints
 * the symbol along with its number.
 *
 * An icon is NEVER the only carrier of meaning. Every call site puts the glyph
 * beside a label or a value; the symbol is a second channel that makes a row
 * scannable, not a replacement for the word.
 * ======================================================================== */
(function (global) {
  'use strict';

  // Path data as published by Lucide, trimmed to the drawing itself: the shared
  // <svg> wrapper below carries the viewBox, the stroke and the joins.
  var GLYPHS = {
    /* --- Places and fixtures ------------------------------------------- */
    // A ballpark read from above: the grandstand bowl with the field inside it.
    // Drawn as two ellipses rather than as a bowl in perspective - at fifteen
    // pixels a perspective drawing collapses into an unreadable blob, and the
    // plan view stays a stadium all the way down.
    stadium: '<ellipse cx="12" cy="12" rx="10" ry="6.2"/>' +
      '<ellipse cx="12" cy="12" rx="4.6" ry="2.6"/>',
    landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/>' +
      '<line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/>' +
      '<line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    // Under a roof: weather is not a factor.
    roof: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7' +
      'l3.5 2.4-2 2-1.9-.5a1 1 0 0 0-.9 1.7l2.3 1.6 1.6 2.3a1 1 0 0 0 1.7-.9l-.5-1.9 2-2 ' +
      '2.4 3.5a1 1 0 0 0 1.7-.9z"/>',

    /* --- Weather -------------------------------------------------------- */
    clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>' +
      '<path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/>' +
      '<path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    partly: '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/>' +
      '<path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/>' +
      '<path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    cloudy: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    rain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>' +
      '<path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
    snow: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>' +
      '<path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/>' +
      '<path d="M16 15h.01"/><path d="M16 19h.01"/>',
    storm: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>' +
      '<path d="m13 12-3 5h4l-3 5"/>',
    wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>' +
      '<path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',

    /* --- People and paperwork ------------------------------------------ */
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
      '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lineup: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>' +
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
      '<path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    whistle: '<path d="M2 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0"/><path d="M8 12h14l-3-3"/>' +
      '<circle cx="8" cy="12" r="1.6"/>',

    /* --- Broadcast and time --------------------------------------------- */
    tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>' +
      '<line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>' +
      '<line x1="3" x2="21" y1="10" y2="10"/>',

    /* --- Readings -------------------------------------------------------- */
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    trendDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/>' +
      '<circle cx="12" cy="12" r="2"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
      '<path d="M12 9v4"/><path d="M12 17h.01"/>',
    baseball: '<circle cx="12" cy="12" r="10"/><path d="M5.6 5.6c3 3 3 9.8 0 12.8"/>' +
      '<path d="M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
    football: '<path d="M3 21s0-9 5-14 13-5 13-5 0 9-5 14-13 5-13 5Z"/><path d="m9 15 6-6"/>' +
      '<path d="m11 11 1 1"/><path d="m13 9 1 1"/><path d="m9 13 1 1"/>'
  };

  // Conditions text, as the schedule states it, to the glyph that describes it.
  // Ordered: the first phrase that matches wins, so "partly cloudy" is not
  // read as "cloudy" and "light rain" is not read as "clear".
  var WEATHER_MATCH = [
    [/thunder|t-?storm|lightning/i, 'storm'],
    [/snow|flurr|sleet|winter/i, 'snow'],
    [/rain|shower|drizzle|precip/i, 'rain'],
    [/dome|roof closed|indoor/i, 'roof'],
    [/partly|mostly sunny|few clouds|partial/i, 'partly'],
    [/cloud|overcast/i, 'cloudy'],
    [/clear|sunny|fair/i, 'clear'],
    [/wind|breez/i, 'wind']
  ];

  function weatherGlyphKey(text) {
    var s = String(text || '');
    if (!s) return '';
    for (var i = 0; i < WEATHER_MATCH.length; i++) {
      if (WEATHER_MATCH[i][0].test(s)) return WEATHER_MATCH[i][1];
    }
    return 'cloudy';
  }

  /**
   * One icon, as an inline SVG string.
   *
   * @param {string} name  a key of GLYPHS
   * @param {string} [cls] extra classes; `ca-ico` is always applied
   * @param {number} [px]  rendered size, default 16
   */
  function icon(name, cls, px) {
    var body = GLYPHS[name];
    if (!body) return '';
    var size = px || 16;
    return '<svg class="ca-ico ' + (cls || '') + '" viewBox="0 0 24 24" width="' + size +
      '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
      'focusable="false">' + body + '</svg>';
  }

  function weatherIcon(text, cls, px) {
    var key = weatherGlyphKey(text);
    return key ? icon(key, (cls || '') + ' ca-ico--wx', px) : '';
  }

  function has(name) { return Object.prototype.hasOwnProperty.call(GLYPHS, name); }

  global.ChaseIcons = {
    icon: icon,
    weatherIcon: weatherIcon,
    weatherGlyphKey: weatherGlyphKey,
    has: has,
    names: function () { return Object.keys(GLYPHS); }
  };
}(typeof window !== 'undefined' ? window : this));
