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

  /** @see dashboard/assets/.gitkeep — four brand styles */
  var BRAND = {
    icon: 'assets/chase-icon-filled.png',
    logoNavDark: 'assets/chase-logo-horizontal.png',
    logoHorizontalLight: 'assets/chase-logo-horizontal-light.png',
    logoStackedLight: 'assets/chase-logo-stacked-light.png',
    iconOutline: 'assets/chase-icon-outline.png',
    iconFilled: 'assets/chase-icon-filled.png',
    logoNav: 'assets/chase-logo-horizontal.png',
    logoHero: 'assets/chase-logo-horizontal.png'
  };

  var AVATAR_SIZES = {
    matchup: 48,
    compare: 64,
    profile: 112,
    compact: 40
  };

  var AVATAR_CROP = {
    matchup: { px: 48, mod: 'matchup' },
    compare: { px: 64, mod: 'compare' },
    profile: { px: 112, mod: 'profile' }
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

  var KNOWN_PITCHER_IDS = {
    'Max Scherzer': 453286,
    'Justin Verlander': 434378,
    'Gerrit Cole': 543037,
    'Jacob deGrom': 594798,
    'Zack Wheeler': 554430,
    'Shane Bieber': 669456,
    'Sandy Alcantara': 645261,
    'Corbin Burnes': 669203,
    'Spencer Strider': 675911,
    'Freddy Peralta': 642547
  };

  function resolveMlbId(idOrName) {
    if (idOrName == null || idOrName === '') return null;
    if (/^\d+$/.test(String(idOrName))) return String(idOrName);
    var id = lookupMlbId(idOrName);
    if (id) return id;
    var key = String(idOrName).trim();
    if (KNOWN_PITCHER_IDS[key]) return String(KNOWN_PITCHER_IDS[key]);
    return null;
  }

  function normalizeAvatarOpts(sizeKeyOrOpts, maybeOpts) {
    var opts = {};
    if (sizeKeyOrOpts && typeof sizeKeyOrOpts === 'object' && !Array.isArray(sizeKeyOrOpts)) {
      opts = Object.assign({}, sizeKeyOrOpts);
    } else {
      opts = Object.assign({}, maybeOpts || {});
      if (sizeKeyOrOpts != null) {
        if (typeof sizeKeyOrOpts === 'number') opts.size = sizeKeyOrOpts;
        else opts.crop = opts.crop || sizeKeyOrOpts;
      }
    }
    return opts;
  }

  function resolveAvatarCrop(opts) {
    var crop = opts.crop || 'matchup';
    if (AVATAR_CROP[crop]) return AVATAR_CROP[crop];
    if (typeof opts.size === 'number') {
      if (opts.size >= 96) return AVATAR_CROP.profile;
      if (opts.size >= 56) return AVATAR_CROP.compare;
      return AVATAR_CROP.matchup;
    }
    return AVATAR_CROP.matchup;
  }

  /**
   * Standard circular pitcher avatar — matchup (48), compare (64), profile (112).
   * @param {string|number|null} idOrName - MLB ID or player name
   * @param {string|number|object} [sizeKeyOrOpts] - preset, px, or opts object
   * @param {object} [maybeOpts] - { size, crop, cls, className, eager, lazy, fallback }
   */
  function pitcherAvatar(idOrName, sizeKeyOrOpts, maybeOpts) {
    var opts = normalizeAvatarOpts(sizeKeyOrOpts, maybeOpts);
    var cropCfg = resolveAvatarCrop(opts);
    var px = opts.size || cropCfg.px;
    var mod = cropCfg.mod;
    var mlbId = resolveMlbId(idOrName);
    var cls = opts.className || opts.cls || 'pitcher-headshot';
    return headshotImg(mlbId, px, cls, Object.assign({}, opts, { cropMod: mod }));
  }

  function headshotImg(mlbId, px, cls, opts) {
    opts = opts || {};
    px = px || 48;
    cls = cls || 'pitcher-headshot';
    var mod = opts.cropMod || (px >= 96 ? 'profile' : px >= 56 ? 'compare' : 'matchup');
    var url = headshotUrl(mlbId);
    var generic = GENERIC_HEADSHOT;
    var modClass = 'ca-pitcher-avatar--' + mod;
    var loading = opts.eager ? 'eager' : (opts.lazy === false ? 'eager' : 'lazy');
    var fetchPri = opts.eager ? ' fetchpriority="high"' : '';
    var err = 'var i=this,w=i.closest(\'.ca-pitcher-avatar\');if(!w)return;'
      + 'if(i.dataset.fallback!==\'1\'){i.dataset.fallback=\'1\';i.src=\'' + generic + '\';}'
      + 'else{i.style.display=\'none\';var f=w.querySelector(\'.ca-pitcher-avatar-fallback\');if(f)f.style.display=\'flex\';}';
    return '<span class="ca-pitcher-avatar headshot-wrap ' + cls + '-wrap ' + modClass + '" '
      + 'role="img" aria-label="Pitcher photo">'
      + '<img class="ca-pitcher-avatar-img ' + cls + '" src="' + url + '" alt="" width="' + px + '" height="' + px + '" '
      + 'loading="' + loading + '"' + fetchPri + ' onerror="' + err + '">'
      + '<span class="ca-pitcher-avatar-fallback pitcher-silhouette" aria-hidden="true"></span>'
      + '</span>';
  }

  function brandLogoNavHtml(heightPx) {
    heightPx = heightPx || 32;
    return '<img class="chase-nav-logo ca-logo-nav chase-brand-logo--dark" src="' + BRAND.logoNavDark + '" '
      + 'alt="Chase Analytics" height="' + heightPx + '" style="height:' + heightPx + 'px;width:auto;max-height:36px;object-fit:contain" loading="eager" '
      + 'onerror="this.style.display=\'none\';var f=this.nextElementSibling;if(f)f.style.display=\'inline\';">'
      + '<span class="chase-nav-logo-fallback" style="display:none;font-weight:700;color:#fff;">Chase Analytics</span>';
  }

  function brandLogoLightBadgeHtml(kind, heightPx) {
    kind = kind || 'horizontal';
    heightPx = heightPx || (kind === 'stacked' ? 100 : 36);
    var src = kind === 'stacked' ? BRAND.logoStackedLight : BRAND.logoHorizontalLight;
    return '<div class="ca-brand-badge-light" role="img" aria-label="Chase Analytics">'
      + '<img class="ca-brand-logo-light ca-brand-logo-light--' + kind + '" src="' + src + '" alt="Chase Analytics" '
      + 'style="height:' + heightPx + 'px;width:auto;object-fit:contain" loading="lazy" '
      + 'onerror="this.onerror=null;this.src=\'' + BRAND.logoNavDark + '\';"></div>';
  }

  function brandIconHtml(px, cls) {
    px = px || 48;
    cls = cls || 'ca-brand-icon';
    return '<img class="' + cls + '" src="' + BRAND.icon + '" alt="" width="' + px + '" height="' + px + '" '
      + 'style="width:' + px + 'px;height:' + px + 'px;object-fit:contain" loading="lazy" '
      + 'onerror="this.style.display=\'none\'">';
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

  function f5WarningHtml() {
    return '<div class="f5-variance-note">F5 (Inn. 1–5) · <em>Higher variance — smaller sample</em></div>';
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function contextualOorColor(value) {
    if (value == null || isNaN(value)) return GRADE_COLORS.average;
    if (value >= 55) return '#60A5FA';
    if (value <= 45) return '#A78BFA';
    return '#71717A';
  }

  function ppGapColor(gap) {
    if (gap == null || isNaN(gap)) return GRADE_COLORS.average;
    if (gap > 0) return '#4ADE80';
    if (gap < 0) return '#F87171';
    return GRADE_COLORS.average;
  }

  function dfGapColor(gap) {
    if (gap == null || isNaN(gap)) return GRADE_COLORS.average;
    if (gap >= 8) return '#FB923C';
    if (gap <= -4) return GRADE_COLORS.strong;
    return GRADE_COLORS.average;
  }

  function stalenessColor(label) {
    var s = String(label || '').toLowerCase();
    if (s.indexOf('fresh') >= 0 || s.indexOf('stable') >= 0) return GRADE_COLORS.strong;
    if (s.indexOf('moderate') >= 0 || s.indexOf('volatile') >= 0) return '#FBBF24';
    if (s.indexOf('stale') >= 0 || s.indexOf('declin') >= 0) return GRADE_COLORS.weak;
    return GRADE_COLORS.average;
  }

  /**
   * Standard metric display cell for Research Lab / profiles.
   * @param {object} opts - { label, value, context, invert, mode, tier, hint, decimals, trend, staleness }
   */
  function metricCell(opts) {
    opts = opts || {};
    var v = opts.value;
    var color;
    if (opts.mode === 'contextual' || opts.context === 'OOR' || opts.context === 'oor') {
      color = contextualOorColor(v);
    } else if (opts.context === 'ppGap' || opts.context === 'PP_GAP') {
      color = ppGapColor(v);
    } else if (opts.context === 'dfGap' || opts.context === 'POWER_FLOOR') {
      color = dfGapColor(v);
    } else if (opts.trend) {
      color = trendColor(opts.trend);
    } else if (opts.staleness) {
      color = stalenessColor(opts.staleness);
    } else {
      color = metricColor(v, opts.context || 'osi', !!opts.invert);
    }
    var d = opts.decimals != null ? opts.decimals : 1;
    var display = (v != null && !isNaN(v)) ? Number(v).toFixed(d) : '—';
    return '<div class="mc-metric-cell">'
      + '<span class="mc-label">' + escHtml(opts.label || '') + '</span>'
      + '<span class="mc-value" style="color:' + color + '">' + display + '</span>'
      + (opts.tier ? '<span class="mc-tier">' + escHtml(opts.tier) + '</span>' : '')
      + (opts.hint ? '<span class="mc-hint">' + escHtml(opts.hint) + '</span>' : '')
      + '</div>';
  }

  function researchLabLegendHtml() {
    return '<div class="rl-metric-legend rl-metric-legend--global" role="note">'
      + '<span class="rl-legend-title">Metric colors</span>'
      + '<span class="rl-legend-item"><i style="background:#4ADE80"></i> Higher = better (OSI, ABQ, RCV…)</span>'
      + '<span class="rl-legend-item"><i style="background:#F87171"></i> Allowed metrics inverted (lower = better)</span>'
      + '<span class="rl-legend-item"><i style="background:#60A5FA"></i> OOR = competition difficulty (contextual)</span>'
      + '<span class="rl-legend-item"><i style="background:#FBBF24"></i> PP-Gap negative = regression risk</span>'
      + '</div>';
  }

  global.MLBMAAssets = {
    BRAND: BRAND,
    espnAbbr: espnAbbr,
    teamLogoUrl: teamLogoUrl,
    teamLogoImg: teamLogoImg,
    headshotUrl: headshotUrl,
    headshotImg: headshotImg,
    pitcherAvatar: pitcherAvatar,
    resolveMlbId: resolveMlbId,
    AVATAR_SIZES: AVATAR_SIZES,
    brandLogoLightBadgeHtml: brandLogoLightBadgeHtml,
    brandIconHtml: brandIconHtml,
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
    metricCell: metricCell,
    contextualOorColor: contextualOorColor,
    ppGapColor: ppGapColor,
    dfGapColor: dfGapColor,
    stalenessColor: stalenessColor,
    researchLabLegendHtml: researchLabLegendHtml,
    GRADE_COLORS: GRADE_COLORS,
    get registry() { return REGISTRY; },
    get leaguePools() { return LEAGUE_POOLS; }
  };
})(typeof window !== 'undefined' ? window : this);
