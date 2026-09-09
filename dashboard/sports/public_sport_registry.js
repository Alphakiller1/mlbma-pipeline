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
    { id: 'cfb', enabled: false, href: '/cfb/', label: 'CFB', searchEnabled: false,
      previewTabs: ['overview', 'quarterbacks', 'units', 'tendencies', 'availability', 'conditions'] }
  ];

  function enabled() {
    return ALL.filter(function (s) { return s.enabled; });
  }

  function byId(id) {
    var key = String(id || '').toLowerCase();
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === key) return ALL[i];
    return null;
  }

  global.ChasePublicSportRegistry = {
    all: ALL,
    enabled: enabled,
    byId: byId
  };
})(typeof window !== 'undefined' ? window : this);
