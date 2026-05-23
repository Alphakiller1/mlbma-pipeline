/**
 * MLB standings — W-L from Stats API with session cache.
 */
(function(global) {
  'use strict';

  var CACHE_KEY = 'mlbma_standings_2026';
  var API_URL = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026';

  /** Map MLB Stats API team codes → dashboard abbreviations */
  var FROM_API = {
    ARI: 'ARI', ATL: 'ATL', BAL: 'BAL', BOS: 'BOS', CHC: 'CHC', CIN: 'CIN',
    CLE: 'CLE', COL: 'COL', DET: 'DET', HOU: 'HOU', KC: 'KC', LAA: 'LAA',
    LAD: 'LAD', MIA: 'MIA', MIL: 'MIL', MIN: 'MIN', NYM: 'NYM', NYY: 'NYY',
    PHI: 'PHI', PIT: 'PIT', SD: 'SD', SF: 'SF', SEA: 'SEA', STL: 'STL',
    TB: 'TB', TEX: 'TEX', TOR: 'TOR', WSH: 'WSH', ATH: 'ATH', OAK: 'ATH',
    AZ: 'ARI', CWS: 'CHW', CHW: 'CHW', KCR: 'KC', TBR: 'TB', SDP: 'SD',
    SFG: 'SF', WSN: 'WSH', LAA: 'LAA', ANA: 'LAA'
  };

  var records = {};
  var loaded = false;
  var loadPromise = null;

  function teamKey(t) {
    return String(t || '').trim().toUpperCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function parsePayload(data) {
    var out = {};
    (data.records || []).forEach(function(div) {
      (div.teamRecords || []).forEach(function(tr) {
        var apiCode = tr.team && (tr.team.abbreviation || tr.team.fileCode || tr.team.name);
        if (!apiCode) return;
        var t = FROM_API[String(apiCode).toUpperCase()] || String(apiCode).toUpperCase();
        var w = tr.wins != null ? tr.wins : (tr.leagueRecord && tr.leagueRecord.wins);
        var l = tr.losses != null ? tr.losses : (tr.leagueRecord && tr.leagueRecord.losses);
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
