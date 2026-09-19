/**
 * Public Research sport registry. Enabled sports only appear in nav/search/routes.
 * WNBA/CFB stay registered for future L7 work and must not render while disabled.
 */
(function (global) {
  'use strict';

  var ALL = [
    { id: 'mlb', enabled: true, href: '/mlb/', label: 'MLB', searchEnabled: true,
      previewTabs: ['overview', 'lineups', 'starters', 'bullpens', 'conditions'] },
    { id: 'nfl', enabled: true, href: '/nfl/', label: 'NFL', searchEnabled: true,
      previewTabs: ['overview', 'availability', 'quarterbacks', 'trenches', 'scheme', 'conditions'] },
    { id: 'wnba', enabled: false, href: '/wnba/', label: 'WNBA', searchEnabled: false,
      previewTabs: ['overview', 'rotation', 'availability', 'form', 'conditions'] },
    { id: 'cfb', enabled: true, href: '/cfb/', label: 'CFB', searchEnabled: false,
      previewTabs: ['overview', 'projection', 'units', 'tendencies', 'availability', 'conditions'] }
  ];

  var TEAM_NAMES = {
    mlb: {
      ARI: 'Arizona Diamondbacks', ATL: 'Atlanta Braves', BAL: 'Baltimore Orioles', BOS: 'Boston Red Sox',
      CHC: 'Chicago Cubs', CWS: 'Chicago White Sox', CIN: 'Cincinnati Reds', CLE: 'Cleveland Guardians',
      COL: 'Colorado Rockies', DET: 'Detroit Tigers', HOU: 'Houston Astros', KC: 'Kansas City Royals',
      LAA: 'Los Angeles Angels', LAD: 'Los Angeles Dodgers', MIA: 'Miami Marlins', MIL: 'Milwaukee Brewers',
      MIN: 'Minnesota Twins', NYM: 'New York Mets', NYY: 'New York Yankees', ATH: 'Athletics', OAK: 'Athletics',
      PHI: 'Philadelphia Phillies', PIT: 'Pittsburgh Pirates', SD: 'San Diego Padres', SDP: 'San Diego Padres',
      SEA: 'Seattle Mariners', SF: 'San Francisco Giants', SFG: 'San Francisco Giants', STL: 'St. Louis Cardinals',
      TB: 'Tampa Bay Rays', TBR: 'Tampa Bay Rays', TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays',
      WSH: 'Washington Nationals', WSN: 'Washington Nationals'
    },
    nfl: {
      ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
      CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
      DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
      HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', JAC: 'Jacksonville Jaguars',
      KC: 'Kansas City Chiefs', LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams',
      MIA: 'Miami Dolphins', MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints',
      NYG: 'New York Giants', NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
      SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans',
      WSH: 'Washington Commanders', WAS: 'Washington Commanders'
    }
  };

  var LOGO_KEYS = {
    mlb: { SDP: 'SD', SFG: 'SF', TBR: 'TB', WSN: 'WSH', OAK: 'ATH' },
    nfl: { JAC: 'JAX', WAS: 'WSH' }
  };

  function enabled() {
    return ALL.filter(function (s) { return s.enabled; });
  }

  function byId(id) {
    var key = String(id || '').toLowerCase();
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === key) return ALL[i];
    return null;
  }

  function teamName(sport, abbr, supplied) {
    if (supplied && String(supplied).trim() && String(supplied).toUpperCase() !== String(abbr || '').toUpperCase()) {
      return String(supplied).trim();
    }
    var league = TEAM_NAMES[String(sport || '').toLowerCase()] || {};
    var key = String(abbr || '').toUpperCase();
    return league[key] || String(supplied || abbr || '').trim();
  }

  function logoKey(sport, abbr) {
    var league = LOGO_KEYS[String(sport || '').toLowerCase()] || {};
    var key = String(abbr || '').toUpperCase();
    return league[key] || key;
  }

  global.ChasePublicSportRegistry = {
    all: ALL,
    enabled: enabled,
    byId: byId,
    teamName: teamName,
    logoKey: logoKey
  };
})(typeof window !== 'undefined' ? window : this);
