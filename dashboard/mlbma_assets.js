/**
 * MLBMA shared assets — logos, headshots, registry, centralized metric grading.
 */
(function(global) {
  'use strict';

  var ESPN_ABBR_MAP = {
    ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CHW: 'chw', CWS: 'chw',
    CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det', HOU: 'hou', KC: 'kc', KCR: 'kc',
    LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy',
    ATH: 'oak', OAK: 'oak', PHI: 'phi', PIT: 'pit', SD: 'sd', SDP: 'sd', SF: 'sf',
    SFG: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TBR: 'tb', TEX: 'tex', TOR: 'tor',
    WSH: 'wsh', WAS: 'wsh', WSN: 'wsh', AZ: 'ari', CHA: 'chw', KCA: 'kc', TBA: 'tb'
  };

  function getEspnAbbr(abbr) {
    if (!abbr) return 'mlb';
    var upper = String(abbr).toUpperCase();
    return (ESPN_ABBR_MAP[upper] || upper).toLowerCase();
  }

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

  /**
   * League-average metric registry — the single source of truth for color grading.
   * mean = the LEAGUE AVERAGE (the neutral midpoint of the red->green scale, not a
   * pool-derived average), std = the spread that sets how fast color shifts, hi =
   * whether HIGHER is better. Color is graded vs the league average so the same value
   * always gets the same color regardless of the rest of today's slate.
   */
  var CONTEXT_DEFAULTS = {
    // composite proprietary metrics (already 0-100, higher = better)
    osi: { mean: 50, std: 12, hi: true },
    // ABQ no longer needs a sens widener: the league baseline now uses ABQ's true (tighter)
    // 30-team std instead of an inflated pooled one, so near-average gaps already separate.
    abq: { mean: 50, std: 12, hi: true },
    rcv: { mean: 50, std: 12, hi: true },
    obr: { mean: 50, std: 12, hi: true },
    projosi: { mean: 50, std: 12, hi: true },
    pals: { mean: 50, std: 12, hi: true },
    oor: { mean: 50, std: 12, hi: true },
    pitching: { mean: 50, std: 12, hi: true },   // PitchScore: higher = better
    rate: { mean: 50, std: 10, hi: true },
    // offense rate stats (higher = better)
    woba: { mean: 0.320, std: 0.035, hi: true },
    xwoba: { mean: 0.318, std: 0.030, hi: true },
    ops: { mean: 0.730, std: 0.070, hi: true },
    obp: { mean: 0.318, std: 0.030, hi: true },
    iso: { mean: 0.165, std: 0.055, hi: true },
    slg: { mean: 0.410, std: 0.050, hi: true },
    avg: { mean: 0.248, std: 0.022, hi: true },
    hr: { mean: 34, std: 8, hi: true },   // split-level team HR (vs a hand), not full-season
    wrc: { mean: 100, std: 15, hi: true },
    rpg: { mean: 4.40, std: 0.40, hi: true },       // runs scored / game (offense)
    barrel: { mean: 8.0, std: 2.0, hi: true },       // Barrel% (offense)
    hardhit: { mean: 39.0, std: 3.0, hi: true },     // HardHit% (offense)
    // pitching stats (LOWER is better unless noted)
    era: { mean: 4.10, std: 0.85, hi: false },
    fip: { mean: 4.10, std: 0.55, hi: false },
    xfip: { mean: 4.05, std: 0.35, hi: false },
    whip: { mean: 1.28, std: 0.12, hi: false },
    hr9: { mean: 1.20, std: 0.28, hi: false },       // HR/9 allowed
    bb9: { mean: 3.20, std: 0.60, hi: false },        // BB/9 allowed
    bbpct: { mean: 8.0, std: 1.8, hi: false },        // BB% in percent points (lower better)
    k9: { mean: 8.70, std: 1.30, hi: true },          // K/9 (pitcher, higher better)
    kpct: { mean: 22.5, std: 4.5, hi: true },         // K% in percent points (higher better)
    qspct: { mean: 35, std: 8, hi: true },             // quality-start rate % (higher better)
    ipstart: { mean: 5.10, std: 0.40, hi: true },      // avg IP per SP start (higher = deeper outings)
    rpwin: { mean: 20, std: 5, hi: true },             // reliever win % of team games (higher = better)
    swstr: { mean: 11.0, std: 2.0, hi: true },         // SwStr% (pitcher, higher better)
    ra_pg: { mean: 4.40, std: 0.40, hi: false },       // runs allowed / game
    ir: { mean: 33, std: 8, hi: false },               // inherited-runners scored % (lower better)
    pitchinn: { mean: 16.65, std: 0.45, hi: true, sens: 1.2 },  // pitches/inning forced (higher = grind = harder lineup); tight cluster, measured from game_results
    // Aggregate pitching contexts -- own-population baselines so team/bullpen cells aren't
    // graded against the (2.5-3x wider) individual-pitcher spread. Live-refreshed by
    // core.compute_baselines; values here are first-paint fallbacks. K%/BB% in pct points.
    team_era: { mean: 4.09, std: 0.57, hi: false },   // 30 team staffs (IP-weighted)
    team_fip: { mean: 4.11, std: 0.46, hi: false },
    team_whip: { mean: 1.30, std: 0.10, hi: false },
    team_hr9: { mean: 1.09, std: 0.19, hi: false },
    bp_era: { mean: 3.40, std: 0.65, hi: false },     // 30 team bullpen units
    bp_fip: { mean: 3.52, std: 0.48, hi: false },
    bp_whip: { mean: 1.21, std: 0.12, hi: false },
    bp_hr9: { mean: 0.86, std: 0.19, hi: false },
    bp_kpct: { mean: 23.7, std: 2.22, hi: true },
    bp_bbpct: { mean: 9.17, std: 1.71, hi: false },
    rp_era: { mean: 3.40, std: 1.65, hi: false },     // individual relievers
    rp_fip: { mean: 3.51, std: 1.17, hi: false },
    rp_whip: { mean: 1.22, std: 0.29, hi: false },
    rp_hr9: { mean: 0.86, std: 0.63, hi: false },
    rp_kpct: { mean: 24.0, std: 5.78, hi: true },
    rp_bbpct: { mean: 9.28, std: 3.61, hi: false },
    default: { mean: 50, std: 12, hi: true }
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

  function teamLogoUrl(team, size) {
    size = size || 500;
    return 'https://a.espncdn.com/i/teamlogos/mlb/' + size + '/' + getEspnAbbr(team) + '.png';
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
    'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/c_fill,g_auto:face,w_320,h_320,q_auto:best/v1/people/0/headshot/67/current';

  /** Minimum CDN square (face-crop) width per avatar preset. */
  var AVATAR_IMG_SCALE = { matchup: 1.0, compare: 1.0, profile: 1.0 };
  var HEADSHOT_MIN_WIDTH = { matchup: 320, compare: 426, profile: 640 };
  var HEADSHOT_WIDTH_STEPS = [320, 426, 640];

  function headshotEffectivePx(px, cropMod) {
    px = px || 48;
    var scale = AVATAR_IMG_SCALE[cropMod] || AVATAR_IMG_SCALE.matchup;
    return Math.ceil(px * scale);
  }

  function headshotUrlWidth(displayPx, dpr, cropMod) {
    cropMod = cropMod || 'matchup';
    dpr = dpr || 2;
    var floor = HEADSHOT_MIN_WIDTH[cropMod] || HEADSHOT_MIN_WIDTH.matchup;
    var need = Math.ceil(displayPx * dpr * 1.35);
    var chosen = floor;
    for (var i = 0; i < HEADSHOT_WIDTH_STEPS.length; i++) {
      if (HEADSHOT_WIDTH_STEPS[i] >= need) {
        chosen = HEADSHOT_WIDTH_STEPS[i];
        break;
      }
      chosen = HEADSHOT_WIDTH_STEPS[i];
    }
    return Math.max(floor, chosen);
  }

  /** Square face crop from MLB CDN — fills circular avatars with a sharp, centered head. */
  function headshotUrlPath(mlbId, width) {
    var id = mlbId != null ? String(mlbId) : '0';
    var w = width || HEADSHOT_MIN_WIDTH.matchup;
    return 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/c_fill,g_auto:face,w_'
      + w + ',h_' + w + ',q_auto:best/v1/people/' + id + '/headshot/67/current';
  }

  function headshotUrl(mlbId, displayPx, cropMod) {
    if (!mlbId) return GENERIC_HEADSHOT;
    var eff = headshotEffectivePx(displayPx, cropMod);
    return headshotUrlPath(mlbId, headshotUrlWidth(eff, 2, cropMod));
  }

  function headshotSrcSet(mlbId, displayPx, cropMod) {
    if (!mlbId) return '';
    var eff = headshotEffectivePx(displayPx, cropMod);
    var w1 = headshotUrlWidth(eff, 1, cropMod);
    var w2 = headshotUrlWidth(eff, 2, cropMod);
    if (w1 === w2) return headshotUrlPath(mlbId, w2) + ' 2x';
    return headshotUrlPath(mlbId, w1) + ' 1x, ' + headshotUrlPath(mlbId, w2) + ' 2x';
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
    'Freddy Peralta': 642547,
    'Dylan Cease': 656302,
    'Kevin Gausman': 592332,
    'Logan Webb': 657277,
    'Sonny Gray': 543243,
    'Blake Snell': 543243,
    'Joe Ryan': 669185,
    'Pablo Lopez': 641154,
    'Tyler Glasnow': 607192,
    'Yoshinobu Yamamoto': 808967,
    'Y. Yamamoto': 808967,
    'Y Yamamoto': 808967,
    'Shota Imanaga': 810517,
    'Paul Skenes': 694973,
    'Tarik Skubal': 669373,
    'Chris Sale': 519242,
    'Zac Gallen': 668678,
    'George Kirby': 669923,
    'Hunter Brown': 680694,
    'Framber Valdez': 664285,
    'Roki Sasaki': 838982
  };

  function lastToken(name) {
    var parts = String(name || '').trim().split(/\s+/);
    return parts.length ? parts[parts.length - 1].replace(/\.$/, '').toLowerCase() : '';
  }

  function isAbbreviatedPitcherName(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (parts.length < 2) return false;
    return parts[0].replace(/\.$/, '').length === 1;
  }

  function lookupKnownPitcherId(name) {
    var key = String(name || '').trim();
    if (KNOWN_PITCHER_IDS[key]) return String(KNOWN_PITCHER_IDS[key]);
    if (!isAbbreviatedPitcherName(key)) return null;
    var ln = lastToken(key);
    if (!ln) return null;
    var hit = null;
    Object.keys(KNOWN_PITCHER_IDS).forEach(function(full) {
      if (lastToken(full) !== ln) return;
      if (hit != null) { hit = null; return; }
      hit = KNOWN_PITCHER_IDS[full];
    });
    return hit != null ? String(hit) : null;
  }

  function lookupMlbIdByLastName(name) {
    var ln = lastToken(name);
    if (!ln || ln.length < 3) return null;
    var ids = {};
    if (REGISTRY.loaded) {
      Object.keys(REGISTRY.byId).forEach(function(id) {
        var entry = REGISTRY.byId[id];
        if (entry && lastToken(entry.name) === ln) ids[id] = true;
      });
    }
    Object.keys(KNOWN_PITCHER_IDS).forEach(function(full) {
      if (lastToken(full) === ln) ids[String(KNOWN_PITCHER_IDS[full])] = true;
    });
    var matches = Object.keys(ids);
    return matches.length === 1 ? matches[0] : null;
  }

  function resolveMlbId(idOrName) {
    if (idOrName == null || idOrName === '') return null;
    if (/^\d+$/.test(String(idOrName))) return String(idOrName);
    var id = lookupMlbId(idOrName);
    if (id) return id;
    id = lookupKnownPitcherId(idOrName);
    if (id) return id;
    if (isAbbreviatedPitcherName(idOrName)) {
      id = lookupMlbIdByLastName(idOrName);
      if (id) return id;
    }
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
    if (idOrName && typeof idOrName === 'object') {
      var p = idOrName;
      var directId = p.mlbId || p.playerId || p.pitcher_id;
      if (directId != null && /^\d+$/.test(String(directId))) {
        idOrName = directId;
      } else {
        var nm = p.pitcher_name || p.name || p.Pitcher || p.fullName;
        var fromMap = lookupKnownPitcherId(nm);
        if (!fromMap && !directId) {
          console.warn('[AVATAR] no ID for pitcher:', p.pitcher_name || p.name || p.Pitcher);
        }
        idOrName = fromMap || nm;
      }
    }
    var opts = normalizeAvatarOpts(sizeKeyOrOpts, maybeOpts);
    var cropCfg = resolveAvatarCrop(opts);
    var px = opts.size || cropCfg.px;
    var mod = opts.cropMod || cropCfg.mod;
    if (opts.size && !opts.cropMod) {
      if (opts.size >= 96) mod = 'profile';
      else if (opts.size >= 56) mod = 'compare';
      else mod = 'matchup';
    }
    var mlbId = resolveMlbId(idOrName);
    if (!mlbId) {
      var missingCls = opts.className || opts.cls || 'pitcher-headshot';
      return '<span class="ca-pitcher-avatar headshot-wrap ' + missingCls + '-wrap ca-pitcher-avatar--' + mod + '" '
        + 'role="img" aria-label="Pitcher photo unavailable">'
        + '<span class="ca-pitcher-avatar-fallback pitcher-silhouette" aria-hidden="true" style="display:flex"></span>'
        + '</span>';
    }
    var cls = opts.className || opts.cls || 'pitcher-headshot';
    return headshotImg(mlbId, px, cls, Object.assign({}, opts, { cropMod: mod }));
  }

  function headshotImg(mlbId, px, cls, opts) {
    opts = opts || {};
    px = px || 48;
    cls = cls || 'pitcher-headshot';
    var mod = opts.cropMod || (px >= 96 ? 'profile' : px >= 56 ? 'compare' : 'matchup');
    var url = headshotUrl(mlbId, px, mod);
    var srcset = headshotSrcSet(mlbId, px, mod);
    var modClass = 'ca-pitcher-avatar--' + mod;
    var loading = opts.eager ? 'eager' : (opts.lazy === false ? 'eager' : 'lazy');
    var fetchPri = opts.eager ? ' fetchpriority="high"' : '';
    var decoding = opts.eager ? ' sync' : ' async';
    var err = 'var i=this,w=i.closest(\'.ca-pitcher-avatar\');if(!w)return;'
      + 'i.style.display=\'none\';var f=w.querySelector(\'.ca-pitcher-avatar-fallback\');if(f)f.style.display=\'flex\';';
    return '<span class="ca-pitcher-avatar headshot-wrap ' + cls + '-wrap ' + modClass + '" '
      + 'role="img" aria-label="Pitcher photo">'
      + '<img class="ca-pitcher-avatar-img ' + cls + '" src="' + url + '"'
      + (srcset ? ' srcset="' + srcset + '"' : '')
      + ' alt="" width="' + px + '" height="' + px + '" '
      + 'loading="' + loading + '" decoding="' + decoding + '"' + fetchPri + ' onerror="' + err + '">'
      + '<span class="ca-pitcher-avatar-fallback pitcher-silhouette" aria-hidden="true"></span>'
      + '</span>';
  }

  function brandLogoNavHtml(heightPx) {
    heightPx = heightPx || 48;
    return '<img class="chase-nav-logo ca-logo-nav chase-brand-logo chase-nav-logo--dark" src="' + BRAND.logoNavDark + '" '
      + 'alt="Chase Analytics" height="' + heightPx + '" style="height:' + heightPx + 'px;width:auto;max-height:48px;object-fit:contain" loading="eager" '
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
        REGISTRY.byName[parts[0].charAt(0) + ' ' + parts[parts.length - 1]] = entry;
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
    // League-average anchored: grade vs the fixed league baseline for this metric, so
    // the same value always gets the same color. The live pool is used ONLY when we
    // have no baseline for this context (unknown metric), never to override one.
    var hasBaseline = Object.prototype.hasOwnProperty.call(CONTEXT_DEFAULTS, context);
    var pool = hasBaseline ? null : LEAGUE_POOLS[context];
    var mean = pool && pool.mean != null ? pool.mean : cfg.mean;
    var std = pool && pool.std != null ? pool.std : cfg.std;
    var z = (value - mean) / std;
    // Optional per-metric sensitivity: scales the color spread for tightly-clustered
    // metrics (e.g. ABQ) so near-average teams still differentiate. Same scaling feeds
    // both the gradient and the discrete chips, so they stay consistent.
    return cfg.sens ? z * cfg.sens : z;
  }

  /** Direction from the registry (lower-is-better => invert), unless caller overrides. */
  function _resolveInvert(context, invert) {
    if (invert != null) return !!invert;
    var cfg = CONTEXT_DEFAULTS[context];
    return !!(cfg && cfg.hi === false);
  }

  /**
   * Continuous red->green gradient. Color is INTERPOLATED from the deviation vs league
   * average (z-score) instead of snapped to a few buckets, so neighbouring values get
   * distinct shades. League average sits at the amber midpoint.
   */
  // Tuned for TEXT on the dark page bg (metricColor is text-only; fills use heatColor).
  // Poor/weak lightened so red/orange values clear the contrast floor.
  var GRADIENT_STOPS = [
    { t: 0.00, c: [248, 113, 113] },  // poor      #F87171 legible red
    { t: 0.27, c: [251, 146, 60] },   // weak      #FB923C orange
    { t: 0.50, c: [251, 191, 36] },   // average   #FBBF24 amber (league avg)
    { t: 0.74, c: [123, 220, 90] },   // good      #7BDC5A lime
    { t: 1.00, c: [74, 222, 128] }    // elite     #4ADE80 green
  ];

  function _gradRgb(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    for (var i = 1; i < GRADIENT_STOPS.length; i++) {
      var hi = GRADIENT_STOPS[i];
      if (t <= hi.t) {
        var lo = GRADIENT_STOPS[i - 1];
        var f = (t - lo.t) / ((hi.t - lo.t) || 1);
        return [
          Math.round(lo.c[0] + (hi.c[0] - lo.c[0]) * f),
          Math.round(lo.c[1] + (hi.c[1] - lo.c[1]) * f),
          Math.round(lo.c[2] + (hi.c[2] - lo.c[2]) * f)
        ];
      }
    }
    return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].c.slice();
  }

  /** Direction-adjusted z-score -> gradient position [0,1]. +/-2 sigma spans the scale.
   * Tightened from +/-2.5: with only 30 teams the best/worst sit near +/-2 sigma, so a
   * 2.5-sigma span never let the extremes reach full red/green. */
  function _zToGradient(z, invert) {
    if (invert) z = -z;
    return (z + 2) / 4;
  }

  function gradientColor(value, context, invert) {
    if (value == null || isNaN(value)) return GRADE_COLORS.average;
    var rgb = _gradRgb(_zToGradient(zScore(value, context), _resolveInvert(context, invert)));
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  // Bucket edges tuned for an n=30 league. With ~normal team data, z>1.5 is ~top 2-3
  // teams (elite), z>0.85 the next ~4 (strong), the +/-0.30 core ~7 teams (average), and
  // symmetric on the low side -- so all seven colors get used instead of everyone reading
  // amber. (Old +/-2 / +/-1 edges left 'elite'/'veryWeak' essentially unreachable.)
  function gradeKeyFromZ(z, invert) {
    if (invert) z = -z;
    if (z <= -1.5) return 'veryWeak';
    if (z <= -0.85) return 'weak';
    if (z <= -0.30) return 'belowAvg';
    if (z <= 0.30) return 'average';
    if (z <= 0.85) return 'aboveAvg';
    if (z <= 1.5) return 'strong';
    return 'elite';
  }

  /** Map 7-step grade keys to 5 solid chip classes (reference spec). */
  var SOLID_CHIP_CLASS = {
    elite: 'c-elite',
    strong: 'c-good',
    aboveAvg: 'c-good',
    average: 'c-mid',
    belowAvg: 'c-mid',
    weak: 'c-weak',
    veryWeak: 'c-poor'
  };

  function metricGradeKey(value, context, invert) {
    if (value == null || isNaN(value)) return null;
    if (typeof context === 'boolean') {
      invert = context;
      context = 'osi';
    }
    context = context || 'osi';
    return gradeKeyFromZ(zScore(value, context), _resolveInvert(context, invert));
  }

  function solidChipClass(value, context, invert, opts) {
    opts = opts || {};
    if (opts.chipClass) return opts.chipClass;
    if (value == null || isNaN(value)) return 'c-na';
    if (opts.trend) {
      var s = String(opts.trend).toLowerCase();
      if (s.indexOf('rising') >= 0 || s.indexOf('hot') >= 0) return SOLID_CHIP_CLASS.strong;
      if (s.indexOf('cooling') >= 0 || s.indexOf('reg') >= 0) return SOLID_CHIP_CLASS.weak;
      return SOLID_CHIP_CLASS.average;
    }
    context = context || 'osi';
    if (context === 'oor' || context === 'OOR' || opts.mode === 'contextual') {
      if (value >= 55) return 'c-good';
      if (value <= 45) return 'c-mid';
      return 'c-mid';
    }
    if (context === 'ppGap' || context === 'PP_GAP') {
      if (value > 0) return 'c-good';
      if (value < 0) return 'c-poor';
      return 'c-mid';
    }
    if (context === 'dfGap' || context === 'POWER_FLOOR') {
      if (value >= 8) return 'c-weak';
      if (value <= -4) return 'c-good';
      return 'c-mid';
    }
    if (opts.color != null) {
      var c = String(opts.color);
      if (c.indexOf('green') >= 0 || c.indexOf('#4ADE') >= 0 || c.indexOf('#22C55') >= 0 || c.indexOf('#1FB8') >= 0) return 'c-good';
      if (c.indexOf('red') >= 0 || c.indexOf('#F871') >= 0 || c.indexOf('#EF44') >= 0 || c.indexOf('#E039') >= 0) return 'c-poor';
      if (c.indexOf('gold') >= 0 || c.indexOf('#FBBF') >= 0 || c.indexOf('#C9A2') >= 0) return 'c-mid';
      if (c.indexOf('purple') >= 0) return 'c-mid';
      return 'c-mid';
    }
    var gk = metricGradeKey(value, context, invert);
    return gk ? (SOLID_CHIP_CLASS[gk] || 'c-mid') : 'c-mid';
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
    var rgb = _gradRgb(_zToGradient(zScore(value, context), _resolveInvert(context, invert)));
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
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
    var rgb = _gradRgb(_zToGradient(zScore(value, context), _resolveInvert(context, invert)));
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.85)';
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

  /** Resolve display color for chips — same rules as metricCell, no math changes. */
  function metricTextColor(value, context, invert, opts) {
    opts = opts || {};
    if (opts.color != null) return opts.color;
    if (opts.trend) return trendColor(opts.trend);
    if (opts.staleness) return stalenessColor(opts.staleness);
    context = context || 'osi';
    if (context === 'oor' || context === 'OOR' || opts.mode === 'contextual') {
      return contextualOorColor(value);
    }
    if (context === 'ppGap' || context === 'PP_GAP') return ppGapColor(value);
    if (context === 'dfGap' || context === 'POWER_FLOOR') return dfGapColor(value);
    return metricColor(value, context, !!invert);
  }

  /** @deprecated Inline styles replaced by solid .chip classes — kept for legacy call sites. */
  function chipStyle(value, context, invert, opts) {
    return '';
  }

  /** Neutral placeholder chip for missing window/metric data. */
  function chipPlaceholderHtml(label) {
    var display = label != null ? String(label) : '—';
    return '<span class="chip c-na">' + escHtml(display) + '</span>';
  }

  /** Standard solid chip HTML — saturated block, dark ink (reference spec). */
  function valChipHtml(value, context, invert, decimals, opts) {
    opts = opts || {};
    var d = decimals != null ? decimals : 1;
    if (value == null || isNaN(value)) {
      if (opts.placeholder === false) return escHtml(opts.display != null ? opts.display : '—');
      return chipPlaceholderHtml(opts.display != null ? opts.display : '—');
    }
    var display = opts.display != null ? opts.display
      : Number(value).toFixed(d);
    var cls = solidChipClass(value, context, invert, opts);
    return '<span class="chip ' + cls + '">' + escHtml(display) + '</span>';
  }

  /**
   * Standard metric display cell for Research Lab / profiles.
   * @param {object} opts - { label, value, context, invert, mode, tier, hint, decimals, trend, staleness }
   */
  function metricCell(opts) {
    opts = opts || {};
    var v = opts.value;
    var d = opts.decimals != null ? opts.decimals : 1;
    var display = (v != null && !isNaN(v)) ? Number(v).toFixed(d) : '—';
    return '<div class="mc-metric-cell">'
      + '<span class="mc-label">' + escHtml(opts.label || '') + '</span>'
      + valChipHtml(v, opts.context || 'osi', !!opts.invert, d, opts)
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

  var PLATFORM_CTAS = [
    {
      key: 'matchups',
      label: 'Matchups',
      desc: "Today's slate, starters, and lineup edges.",
      href: 'chase_analytics_mlb_oem_v7.html#section-matchups-hero',
      icon: 'swords'
    },
    {
      key: 'rankings',
      label: 'Team Rankings',
      desc: 'Scoring, difficulty, and status-projection tables.',
      href: 'team_rankings.html',
      icon: 'trophy'
    },
    {
      key: 'research',
      label: 'Research Lab',
      desc: 'Trends, compare, and pitcher intelligence.',
      href: 'chase_analytics_mlb_oem_v7.html#section-research-lab',
      icon: 'flask-conical'
    }
  ];

  function platformCtaHtml(activeKey, opts) {
    opts = opts || {};
    var landing = opts.variant === 'landing';
    var I = global.MLBMAIcons;
    return '<nav class="ca-platform-cta' + (landing ? ' ca-platform-cta--landing' : '') + '" aria-label="Platform workflows">'
      + PLATFORM_CTAS.map(function(c) {
        var on = !landing && activeKey === c.key ? ' is-active' : '';
        var icon = I && I.iconCircleHtml ? I.iconCircleHtml(c.icon, true) : '';
        return '<a class="ca-platform-cta__item' + on + '" href="' + escHtml(c.href) + '">'
          + icon
          + '<span class="ca-platform-cta__body">'
          + '<span class="ca-platform-cta__label">' + escHtml(c.label) + '</span>'
          + '<span class="ca-platform-cta__desc">' + escHtml(c.desc) + '</span>'
          + '</span></a>';
      }).join('')
      + '</nav>';
  }

  function pageHeaderHtml(opts) {
    opts = opts || {};
    var out = '<header class="ca-page-header">';
    if (opts.eyebrow) out += '<p class="ca-eyebrow">' + escHtml(opts.eyebrow) + '</p>';
    out += '<h1 class="ca-page-title">' + escHtml(opts.title || '') + '</h1>';
    if (opts.subtitle) out += '<p class="ca-helper ca-page-header__sub">' + escHtml(titleCaseLabel(opts.subtitle)) + '</p>';
    if (opts.showPlatformNav !== false) out += platformCtaHtml(opts.activeNav || null);
    out += '</header>';
    return out;
  }

  function caSectionHeadHtml(iconKey, kicker, title, purpose) {
    var I = global.MLBMAIcons;
    var icon = '';
    if (I && I.iconCircleHtml) {
      icon = I.iconCircleHtml(iconKey || 'circle-dot', true);
    } else if (I && I.iconSvg) {
      icon = '<span class="ca-icon" aria-hidden="true">' + I.iconSvg(iconKey || 'circle-dot', { px: 38 }) + '</span>';
    }
    var body = '<div class="ca-section-head__body">';
    if (kicker) body += '<div class="kicker">' + escHtml(kicker) + '</div>';
    body += '<div class="title">' + escHtml(title || '') + '</div>';
    if (purpose) body += '<div class="purpose">' + escHtml(titleCaseLabel(purpose)) + '</div>';
    body += '</div>';
    return '<div class="ca-section-head">' + icon + body + '</div>';
  }

  function glossaryLinkHtml(anchor, label) {
    var id = String(anchor || '').replace(/^#/, '');
    var text = label || 'Glossary';
    return '<a class="glossary-link" href="glossary.html#' + escHtml(id) + '">' + escHtml(text) + '</a>';
  }

  // Title-Case a subtitle/explanation, leaving acronyms & metric tokens
  // (wRC+, xFIP, K%, HR/9, OSI…) untouched — only all-lowercase words get capitalized.
  function titleCaseLabel(s) {
    if (!s) return s;
    return String(s).replace(/\S+/g, function(w) {
      if (/[A-Z]/.test(w)) return w;
      return w.replace(/(^|[-/])([a-z])/g, function(m, sep, ch) { return sep + ch.toUpperCase(); });
    });
  }

  function sectionHeaderHtml(opts) {
    opts = opts || {};
    if (opts.icon || opts.iconKey) {
      var head = caSectionHeadHtml(
        opts.icon || opts.iconKey,
        opts.kicker || opts.eyebrow || '',
        opts.title || '',
        titleCaseLabel(opts.subtitle || opts.purpose || '')
      );
      var out = '<header class="ca-section-header">' + head;
      if (opts.showPlatformNav) out += platformCtaHtml(opts.activeNav || null);
      if (opts.actions) out += '<div class="ca-section-header__actions">' + opts.actions + '</div>';
      out += '</header>';
      return out;
    }
    var out = '<header class="ca-section-header">';
    if (opts.eyebrow) out += '<p class="ca-eyebrow">' + escHtml(opts.eyebrow) + '</p>';
    out += '<h2 class="ca-section-title">' + escHtml(opts.title || '') + '</h2>';
    if (opts.subtitle) out += '<p class="ca-helper">' + escHtml(titleCaseLabel(opts.subtitle)) + '</p>';
    if (opts.showPlatformNav) out += platformCtaHtml(opts.activeNav || null);
    if (opts.actions) out += '<div class="ca-section-header__actions">' + opts.actions + '</div>';
    out += '</header>';
    return out;
  }

  function mountPlatformHeader(mountId, opts) {
    var el = typeof mountId === 'string' ? document.getElementById(mountId) : mountId;
    if (!el) return;
    el.innerHTML = pageHeaderHtml(opts || {});
    if (global.MLBMAIcons && MLBMAIcons.refreshIcons) MLBMAIcons.refreshIcons(el);
  }

  /**
   * Live league-average baselines (written by core.compute_baselines -> the pipeline).
   * Updates the registry mean/std with the current season's full-league averages while
   * KEEPING each metric's direction (hi). Falls back silently to the built-in defaults.
   */
  function applyLeagueBaselines(data) {
    var b = data && data.baselines;
    if (!b) return;
    Object.keys(b).forEach(function(ctx) {
      var live = b[ctx];
      if (CONTEXT_DEFAULTS[ctx] && live && live.mean != null && live.std) {
        CONTEXT_DEFAULTS[ctx].mean = live.mean;
        CONTEXT_DEFAULTS[ctx].std = live.std;   // direction (hi) preserved
      }
    });
  }

  function loadLeagueBaselines() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch('league_baselines.json?_=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { if (d) applyLeagueBaselines(d); return d; })
      .catch(function() { return null; });
  }

  global.MLBMAAssets = {
    BRAND: BRAND,
    getEspnAbbr: getEspnAbbr,
    espnAbbr: getEspnAbbr,
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
    gradientColor: gradientColor,
    metricTextColor: metricTextColor,
    chipStyle: chipStyle,
    valChipHtml: valChipHtml,
    chipPlaceholderHtml: chipPlaceholderHtml,
    solidChipClass: solidChipClass,
    metricGradeKey: metricGradeKey,
    SOLID_CHIP_CLASS: SOLID_CHIP_CLASS,
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
    PLATFORM_CTAS: PLATFORM_CTAS,
    platformCtaHtml: platformCtaHtml,
    pageHeaderHtml: pageHeaderHtml,
    sectionHeaderHtml: sectionHeaderHtml,
    caSectionHeadHtml: caSectionHeadHtml,
    glossaryLinkHtml: glossaryLinkHtml,
    titleCaseLabel: titleCaseLabel,
    mountPlatformHeader: mountPlatformHeader,
    GRADE_COLORS: GRADE_COLORS,
    loadLeagueBaselines: loadLeagueBaselines,
    get registry() { return REGISTRY; },
    get leaguePools() { return LEAGUE_POOLS; }
  };

  // Fetch live league baselines on load (best-effort). The JSON is tiny + local, so it
  // typically resolves before a page's own (slower) data fetch + render.
  loadLeagueBaselines();
})(typeof window !== 'undefined' ? window : this);
