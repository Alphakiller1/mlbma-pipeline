/**
 * MLBMA shared assets — team logos, pitcher headshots, player registry lookup.
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

  var REGISTRY = { byName: {}, byId: {}, loaded: false, promise: null };

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

  function headshotUrl(mlbId) {
    if (!mlbId) return '';
    return 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/'
      + mlbId + '/headshot/67/current';
  }

  function headshotImg(mlbId, px, cls) {
    px = px || 40;
    cls = cls || 'pitcher-headshot';
    var url = headshotUrl(mlbId);
    if (!url) {
      return '<span class="' + cls + '-fallback" style="width:' + px + 'px;height:' + px + 'px;">SP</span>';
    }
    return '<img class="' + cls + '" src="' + url + '" width="' + px + '" height="' + px + '" '
      + 'alt="" loading="lazy" style="border-radius:50%;object-fit:cover;" '
      + 'onerror="this.onerror=null;this.style.display=\'none\';'
      + 'this.nextElementSibling&&(this.nextElementSibling.style.display=\'inline-flex\');">'
      + '<span class="' + cls + '-fallback" style="display:none;width:' + px + 'px;height:' + px + 'px;">SP</span>';
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

  function metricColor(v, invert) {
    if (v == null || isNaN(v)) return 'var(--text-3)';
    if (invert) {
      if (v <= 45) return 'var(--green)';
      if (v <= 55) return 'var(--text-2)';
      if (v <= 65) return 'var(--gold)';
      return 'var(--red)';
    }
    if (v >= 75) return 'var(--green)';
    if (v >= 65) return 'var(--purple-2)';
    if (v >= 55) return 'var(--text)';
    if (v >= 45) return 'var(--gold)';
    return 'var(--red)';
  }

  function f5WarningHtml() {
    return '<div class="f5-variance-note">F5 (Inn. 1–5) · <em>Higher variance — smaller sample</em></div>';
  }

  global.MLBMAAssets = {
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
    metricColor: metricColor,
    f5WarningHtml: f5WarningHtml,
    get registry() { return REGISTRY; }
  };
})(typeof window !== 'undefined' ? window : this);
