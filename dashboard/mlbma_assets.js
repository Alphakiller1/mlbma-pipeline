/**
 * MLBMA shared assets — logos, headshots, registry, centralized metric grading.
 */
(function(global) {
  'use strict';

  var ESPN_ABBR = {
    ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CHW: 'cws', CWS: 'cws',
    CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det', HOU: 'hou', KC: 'kc', KCR: 'kc',
    LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy',
    ATH: 'ath', OAK: 'ath', PHI: 'phi', PIT: 'pit', SD: 'sd', SDP: 'sd', SF: 'sf',
    SFG: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TBR: 'tb', TEX: 'tex', TOR: 'tor',
    WSH: 'wsh', WAS: 'wsh', WSN: 'wsh', AZ: 'ari', CHA: 'cws', KCA: 'kc', TBA: 'tb'
  };

  var BRAND = {
    logoNav: 'assets/chase-logo-transparent.png',
    logoHero: 'assets/chase-logo-horizontal.png',
    iconFilled: 'assets/chase-icon-filled.png',
    iconOutline: 'assets/chase-icon-outline.png'
  };

  var REGISTRY = { byName: {}, byId: {}, loaded: false, promise: null };

  /** @type {Object<string, {mean:number, std:number, n:number}>} */
  var LEAGUE_POOLS = {};

  var CONTEXT_DEFAULTS = {
    osi: { mean: 50, std: 12 },
    abq: { mean: 50, std: 12 },
    rcv: { mean: 50, std: 12 },
    obr: { mean: 50, std: 12 },
    pitching: { mean: 50, std: 12 },
    rate: { mean: 50, std: 10 },
    default: { mean: 50, std: 12 }
  };

  var GRADE_COLORS = {
    veryWeak: 'var(--metric-very-weak, #EF4444)',
    weak: 'var(--metric-weak, #F97316)',
    belowAvg: 'var(--metric-below, #FBBF24)',
    average: 'var(--metric-neutral, #71717A)',
    aboveAvg: 'var(--metric-above, #86EFAC)',
    strong: 'var(--metric-strong, #4ADE80)',
    elite: 'var(--metric-elite, #22C55E)'
  };

  var HEAT_RGBA = {
    veryWeak: 'rgba(239, 68, 68, 0.85)',
    weak: 'rgba(249, 115, 22, 0.8)',
    belowAvg: 'rgba(251, 191, 36, 0.75)',
    average: 'rgba(113, 113, 122, 0.45)',
    aboveAvg: 'rgba(134, 239, 172, 0.65)',
    strong: 'rgba(74, 222, 128, 0.8)',
    elite: 'rgba(34, 197, 94, 0.9)'
  };

  function normName(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function espnAbbr(team) {
    var t = String(team || '').toUpperCase();
    return ESPN_ABBR[t] || t.toLowerCase();
  }

  function teamLogoUrl(team, size) {
    size = size || 500;
    return 'https://a.espncdn.com/i/teamlogos/mlb/' + size + '/' + espnAbbr(team) + '.png';
  }

  function teamLogoImg(team, px, cls) {
    px = px || 24;
    cls = cls || 'team-logo';
    var ab = String(team || '').toUpperCase();
    var initials = ab.slice(0, 2);
    return '<img class="' + cls + '" src="' + teamLogoUrl(team, px >= 40 ? 500 : 500) + '" '
      + 'width="' + px + '" height="' + px + '" alt="' + ab + '" loading="lazy" '
      + 'onerror="this.onerror=null;this.src=\'\';this.style.display=\'none\';'
      + 'this.nextElementSibling&&(this.nextElementSibling.style.display=\'inline-flex\');">'
      + '<span class="team-logo-fallback" style="display:none;width:' + px + 'px;height:' + px + 'px;">'
      + initials + '</span>';
  }

  var GENERIC_HEADSHOT =
    'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/0/headshot/67/current';

  function headshotUrl(mlbId) {
    if (!mlbId) return GENERIC_HEADSHOT;
    return 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/'
      + mlbId + '/headshot/67/current';
  }

  function headshotImg(mlbId, px, cls) {
    px = px || 48;
    cls = cls || 'pitcher-headshot';
    var url = headshotUrl(mlbId);
    var generic = GENERIC_HEADSHOT;
    return '<span class="headshot-wrap ' + cls + '-wrap" style="width:' + px + 'px;height:' + px + 'px" role="img" aria-label="Pitcher">'
      + '<img class="' + cls + '" src="' + url + '" alt="" loading="lazy" '
      + 'onerror="this.onerror=null;this.src=\'' + generic + '\';">'
      + '</span>';
  }

  function parseRegistryRows(rows) {
    REGISTRY.byName = {};
    REGISTRY.byId = {};
    (rows || []).forEach(function(r) {
      var id = r.player_id || r.playerId || r.mlbId;
      var name = r.full_name || r.fullName || r.name;
      if (!id || !name) return;
      var entry = { id: String(id), name: name, team: r.team_abbr || r.team };
      REGISTRY.byId[String(id)] = entry;
      REGISTRY.byName[normName(name)] = entry;
      var parts = normName(name).split(' ');
      if (parts.length >= 2) {
        REGISTRY.byName[parts[parts.length - 1] + ' ' + parts[0]] = entry;
      }
    });
    REGISTRY.loaded = true;
  }

  function loadRegistry(fetchFn) {
    if (REGISTRY.loaded) return Promise.resolve(REGISTRY);
    if (REGISTRY.promise) return REGISTRY.promise;
    REGISTRY.promise = (fetchFn ? fetchFn() : Promise.resolve([]))
      .then(function(rows) {
        parseRegistryRows(rows);
        return REGISTRY;
      })
      .catch(function() {
        REGISTRY.loaded = true;
        return REGISTRY;
      });
    return REGISTRY.promise;
  }

  function lookupPlayer(name) {
    if (!name) return null;
    var key = normName(name);
    if (REGISTRY.byName[key]) return REGISTRY.byName[key];
    var best = null, bestScore = 0;
    Object.keys(REGISTRY.byName).forEach(function(k) {
      if (k.indexOf(key) >= 0 || key.indexOf(k) >= 0) {
        var score = Math.min(k.length, key.length);
        if (score > bestScore) { bestScore = score; best = REGISTRY.byName[k]; }
      }
    });
    return best;
  }

  function lookupMlbId(name) {
    var p = lookupPlayer(name);
    return p ? p.id : null;
  }

  function poolStats(values) {
    var nums = (values || []).filter(function(v) {
      return v != null && !isNaN(v) && isFinite(v);
    });
    if (!nums.length) return null;
    var mean = nums.reduce(function(a, b) { return a + b; }, 0) / nums.length;
    var variance = nums.reduce(function(a, b) {
      var d = b - mean;
      return a + d * d;
    }, 0) / nums.length;
    var std = Math.sqrt(variance);
    if (std < 1e-6) std = CONTEXT_DEFAULTS.default.std;
    return { mean: mean, std: std, n: nums.length };
  }

  /**
   * Register league values for a metric context (e.g. 'osi', 'abq').
   * @param {string} context
   * @param {number[]} values
   */
  function registerLeaguePool(context, values) {
    var stats = poolStats(values);
    if (stats) LEAGUE_POOLS[context] = stats;
    return stats;
  }

  function zScore(value, context) {
    var cfg = CONTEXT_DEFAULTS[context] || CONTEXT_DEFAULTS.default;
    var pool = LEAGUE_POOLS[context];
    var mean = pool && pool.mean != null ? pool.mean : cfg.mean;
    var std = pool && pool.std != null ? pool.std : cfg.std;
    return (value - mean) / std;
  }

  function gradeKeyFromZ(z, invert) {
    if (invert) z = -z;
    if (z <= -2) return 'veryWeak';
    if (z <= -1) return 'weak';
    if (z <= -0.35) return 'belowAvg';
    if (z <= 0.35) return 'average';
    if (z <= 1) return 'aboveAvg';
    if (z <= 2) return 'strong';
    return 'elite';
  }

  /**
   * Central metric color — 7-step red→green vs league average.
   * @param {number} value
   * @param {string|boolean} [context] - metric context or legacy invert flag
   * @param {boolean} [invert] - lower is better (e.g. ERA allowed)
   */
  function metricColor(value, context, invert) {
    if (value == null || isNaN(value)) return GRADE_COLORS.average;
    if (typeof context === 'boolean') {
      invert = context;
      context = 'osi';
    }
    context = context || 'osi';
    var z = zScore(value, context);
    return GRADE_COLORS[gradeKeyFromZ(z, invert)];
  }

  /** @deprecated Use metricColor — alias for legacy call sites */
  function tcol(v, context, invert) {
    return metricColor(v, context, invert);
  }

  /** Heatmap / chart fill — same grading as metricColor */
  function heatColor(value, context, invert) {
    if (value == null || isNaN(value)) return HEAT_RGBA.average;
    if (typeof context === 'boolean') {
      invert = context;
      context = 'osi';
    }
    context = context || 'osi';
    var z = zScore(value, context);
    return HEAT_RGBA[gradeKeyFromZ(z, invert)] || HEAT_RGBA.average;
  }

  /** @deprecated Use heatColor */
  function hcol(v, context, invert) {
    return heatColor(v, context, invert);
  }

  /** Trend label accent (classification, not raw metric) */
  function trendColor(trend) {
    if (!trend) return GRADE_COLORS.average;
    var s = String(trend).toLowerCase();
    if (s.indexOf('rising') >= 0 || s.indexOf('hot') >= 0 || s.indexOf('surge') >= 0) {
      return GRADE_COLORS.strong;
    }
    if (s.indexOf('cooling') >= 0 || s.indexOf('reg') >= 0 || s.indexOf('fade') >= 0) {
      return GRADE_COLORS.weak;
    }
    if (s.indexOf('stable') >= 0 || s.indexOf('steady') >= 0) {
      return GRADE_COLORS.aboveAvg;
    }
    if (s.indexOf('volatile') >= 0) return 'var(--accent-risk, #FBBF24)';
    return GRADE_COLORS.average;
  }

  /** @deprecated Use trendColor */
  function trendCol(t) {
    return trendColor(t);
  }

  function metricLegendHtml(opts) {
    opts = opts || {};
    var title = opts.title || 'Colors graded relative to league average';
    return '<div class="ca-metric-legend" role="note">'
      + '<span class="ca-metric-legend-title">' + title + '</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#EF4444"></span>Very weak</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#F97316"></span>Weak</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#FBBF24"></span>Below avg</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#71717A"></span>Average</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#86EFAC"></span>Above avg</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#4ADE80"></span>Strong</span>'
      + '<span class="ca-metric-legend-step"><span class="ca-metric-legend-swatch" style="background:#22C55E"></span>Elite</span>'
      + '</div>';
  }

  function brandLogoNavHtml() {
    return '<img class="ca-logo-nav chase-brand-logo" src="' + BRAND.logoNav + '" alt="Chase Analytics" height="32" loading="eager" '
      + 'onerror="this.style.display=\'none\';this.nextElementSibling&&(this.nextElementSibling.style.display=\'flex\');">';
  }

  function f5WarningHtml() {
    return '<div class="f5-variance-note">F5 (Inn. 1–5) · <em>Higher variance — smaller sample</em></div>';
  }

  global.MLBMAAssets = {
    BRAND: BRAND,
    espnAbbr: espnAbbr,
    teamLogoUrl: teamLogoUrl,
    teamLogoImg: teamLogoImg,
    headshotUrl: headshotUrl,
    headshotImg: headshotImg,
    loadRegistry: loadRegistry,
    parseRegistryRows: parseRegistryRows,
    lookupPlayer: lookupPlayer,
    lookupMlbId: lookupMlbId,
    normName: normName,
    registerLeaguePool: registerLeaguePool,
    metricColor: metricColor,
    heatColor: heatColor,
    trendColor: trendColor,
    metricLegendHtml: metricLegendHtml,
    brandLogoNavHtml: brandLogoNavHtml,
    tcol: tcol,
    hcol: hcol,
    trendCol: trendCol,
    f5WarningHtml: f5WarningHtml,
    GRADE_COLORS: GRADE_COLORS,
    get registry() { return REGISTRY; },
    get leaguePools() { return LEAGUE_POOLS; }
  };
})(typeof window !== 'undefined' ? window : this);
