/**
 * MLB standings — W-L from Stats API with session cache.
 */
(function(global) {
  'use strict';

  var CACHE_KEY = 'mlbma_standings_v2_2026';
  var API_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026';

  /** Map MLB Stats API team id → dashboard abbreviations */
  var ID_TO_TEAM = {
    109: 'ARI', 144: 'ATL', 110: 'BAL', 111: 'BOS', 112: 'CHC', 145: 'CHW', 113: 'CIN',
    114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KCR', 108: 'LAA', 119: 'LAD',
    146: 'MIA', 158: 'MIL', 142: 'MIN', 121: 'NYM', 147: 'NYY', 133: 'ATH', 143: 'PHI',
    134: 'PIT', 135: 'SDP', 136: 'SEA', 137: 'SFG', 138: 'STL', 139: 'TBR', 140: 'TEX',
    141: 'TOR', 120: 'WSN'
  };

  /** Map MLB Stats API team codes → dashboard abbreviations (legacy fallback) */
  var FROM_API = {
    ARI: 'ARI', ATL: 'ATL', BAL: 'BAL', BOS: 'BOS', CHC: 'CHC', CIN: 'CIN',
    CLE: 'CLE', COL: 'COL', DET: 'DET', HOU: 'HOU', KC: 'KCR', LAA: 'LAA',
    LAD: 'LAD', MIA: 'MIA', MIL: 'MIL', MIN: 'MIN', NYM: 'NYM', NYY: 'NYY',
    PHI: 'PHI', PIT: 'PIT', SD: 'SDP', SF: 'SFG', SEA: 'SEA', STL: 'STL',
    TB: 'TBR', TEX: 'TEX', TOR: 'TOR', WSH: 'WSN', ATH: 'ATH', OAK: 'ATH',
    AZ: 'ARI', CWS: 'CHW', CHW: 'CHW', KCR: 'KCR', TBR: 'TBR', SDP: 'SDP',
    SFG: 'SFG', WSN: 'WSN', LAA: 'LAA', ANA: 'LAA'
  };

  var TEAM_ALIASES = {
    KC: 'KCR', TB: 'TBR', SD: 'SDP', SF: 'SFG', WSH: 'WSN', WAS: 'WSN',
    OAK: 'ATH', AZ: 'ARI', CWS: 'CHW'
  };

  var records = {};
  var loaded = false;
  var loadPromise = null;

  function teamKey(t) {
    var k = String(t || '').trim().toUpperCase();
    return TEAM_ALIASES[k] || k;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function parsePayload(data) {
    var out = {};
    (data.records || []).forEach(function(div) {
      (div.teamRecords || []).forEach(function(tr) {
        var team = tr.team || {};
        var tid = team.id;
        var t = tid != null ? ID_TO_TEAM[tid] : null;
        if (!t) {
          var apiCode = team.abbreviation || team.fileCode || team.teamCode;
          if (apiCode) t = FROM_API[String(apiCode).toUpperCase()] || null;
        }
        if (!t) return;
        var lr = tr.leagueRecord || {};
        var w = tr.wins != null ? tr.wins : lr.wins;
        var l = tr.losses != null ? tr.losses : lr.losses;
        if (w == null || l == null) return;
        out[t] = { wins: parseInt(w, 10), losses: parseInt(l, 10) };
      });
    });
    return out;
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.records) return obj.records;
    } catch (e) { /* ignore */ }
    return null;
  }

  function writeCache(rec) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), records: rec }));
    } catch (e) { /* ignore */ }
  }

  function load() {
    if (loaded) return Promise.resolve(records);
    if (loadPromise) return loadPromise;
    var cached = readCache();
    if (cached && Object.keys(cached).length) {
      records = cached;
      loaded = true;
      return Promise.resolve(records);
    }
    loadPromise = fetch(API_URL, { cache: 'default' })
      .then(function(r) {
        if (!r.ok) throw new Error('MLB standings HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        records = parsePayload(data);
        writeCache(records);
        loaded = true;
        return records;
      })
      .catch(function(err) {
        console.warn('[MLBMA] standings fetch failed:', err);
        records = cached || {};
        loaded = true;
        return records;
      })
      .finally(function() {
        loadPromise = null;
      });
    return loadPromise;
  }

  function getRecord(team) {
    var t = teamKey(team);
    var r = records[t];
    if (!r) return null;
    return r;
  }

  function formatRecord(team) {
    var r = getRecord(team);
    if (!r) return '';
    return r.wins + '-' + r.losses;
  }

  function recordHtml(team) {
    var wl = formatRecord(team);
    if (!wl) return '';
    return '<span class="team-record-pill">' + esc(wl) + '</span>';
  }

  global.MLBMAStandings = {
    load: load,
    getRecord: getRecord,
    formatRecord: formatRecord,
    recordHtml: recordHtml,
    teamKey: teamKey
  };
})(typeof window !== 'undefined' ? window : this);
