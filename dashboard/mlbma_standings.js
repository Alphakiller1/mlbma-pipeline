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
  var recentForm = {};
  var loaded = false;
  var loadPromise = null;
  var formLoadPromise = null;

  var SEASON_START = '2026-03-27';

  var TEAM_TO_ID = (function() {
    var out = {};
    Object.keys(ID_TO_TEAM).forEach(function(id) {
      out[ID_TO_TEAM[id]] = parseInt(id, 10);
    });
    return out;
  })();

  var FORM_CACHE_KEY = 'mlbma_recent_form_v1_2026';

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

  function writeFormCache() {
    try {
      sessionStorage.setItem(FORM_CACHE_KEY, JSON.stringify({ ts: Date.now(), form: recentForm }));
    } catch (e) { /* ignore */ }
  }

  function readFormCache() {
    try {
      var raw = sessionStorage.getItem(FORM_CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && obj.form) return obj.form;
    } catch (e) { /* ignore */ }
    return null;
  }

  function parseScheduleForm(data, teamId) {
    var results = [];
    (data.dates || []).forEach(function(d) {
      (d.games || []).forEach(function(g) {
        if (!g.status || g.status.abstractGameState !== 'Final') return;
        var away = g.teams && g.teams.away;
        var home = g.teams && g.teams.home;
        if (!away || !home || !away.team || !home.team) return;
        var awayId = away.team.id;
        var homeId = home.team.id;
        if (awayId !== teamId && homeId !== teamId) return;
        var won = awayId === teamId ? !!away.isWinner : !!home.isWinner;
        results.push({
          date: g.gameDate || d.date || '',
          result: won ? 'W' : 'L'
        });
      });
    });
    results.sort(function(a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
    return results.map(function(r) { return r.result; });
  }

  function fetchTeamForm(team) {
    var t = teamKey(team);
    var tid = TEAM_TO_ID[t];
    if (!tid) return Promise.resolve([]);
    var end = new Date().toISOString().slice(0, 10);
    var url = 'https://statsapi.mlb.com/api/v1/schedule?teamId=' + tid
      + '&startDate=' + SEASON_START + '&endDate=' + end
      + '&sportId=1&gameType=R';
    return fetch(url, { cache: 'default' })
      .then(function(r) {
        if (!r.ok) throw new Error('MLB schedule HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        var form = parseScheduleForm(data, tid);
        return form.length > 10 ? form.slice(-10) : form;
      })
      .catch(function(err) {
        console.warn('[MLBMA] recent form fetch failed for ' + t + ':', err);
        return recentForm[t] || [];
      });
  }

  function getRecentForm(team) {
    var t = teamKey(team);
    return recentForm[t] || [];
  }

  function loadRecentForm(teams, count) {
    count = count || 10;
    var cached = readFormCache();
    if (cached && Object.keys(cached).length) {
      recentForm = cached;
    }
    var need = (teams || []).map(teamKey).filter(function(t, i, arr) {
      return t && arr.indexOf(t) === i && (!recentForm[t] || !recentForm[t].length);
    });
    if (!need.length) return Promise.resolve(recentForm);
    if (formLoadPromise) return formLoadPromise;
    formLoadPromise = Promise.all(need.map(function(t) {
      return fetchTeamForm(t).then(function(form) {
        recentForm[t] = form.slice(-count);
      });
    })).then(function() {
      writeFormCache();
      return recentForm;
    }).finally(function() {
      formLoadPromise = null;
    });
    return formLoadPromise;
  }

  function formStripHtml(team, opts) {
    opts = opts || {};
    var form = getRecentForm(team);
    if (!form || !form.length) return '';
    var prefix = (opts && opts.classPrefix) || 'mc-form';
    var mirror = !!opts.mirror;
    var letters = form.map(function(r, i) {
      var cls = r === 'W' ? prefix + '-w' : prefix + '-l';
      var recent = i === form.length - 1;
      return '<span class="' + prefix + '-letter ' + cls + (recent ? ' ' + prefix + '-letter--recent' : '') + '" title="' + (recent ? 'Most recent game' : 'Game ' + (i + 1) + ' of ' + form.length) + '">' + r + '</span>';
    }).join('');
    var orderHint = mirror
      ? '<span class="' + prefix + '-order"><span class="' + prefix + '-order-edge">Recent</span><span class="' + prefix + '-order-arrow" aria-hidden="true">←</span><span class="' + prefix + '-order-mid">Last ' + form.length + '</span><span class="' + prefix + '-order-arrow" aria-hidden="true">←</span><span class="' + prefix + '-order-edge">10 ago</span></span>'
      : '<span class="' + prefix + '-order"><span class="' + prefix + '-order-edge">10 ago</span><span class="' + prefix + '-order-arrow" aria-hidden="true">→</span><span class="' + prefix + '-order-mid">Last ' + form.length + '</span><span class="' + prefix + '-order-arrow" aria-hidden="true">→</span><span class="' + prefix + '-order-edge">Recent</span></span>';
    return '<div class="' + prefix + '-block' + (mirror ? ' ' + prefix + '-block--mirror' : '') + '">'
      + '<div class="' + prefix + '-heading">Last 10 Games</div>'
      + orderHint
      + '<div class="' + prefix + '-strip' + (mirror ? ' ' + prefix + '-strip--mirror' : '') + '" aria-label="Last ' + form.length + ' games, oldest to most recent' + (mirror ? ', mirrored toward center' : '') + '">'
      + letters
      + '</div></div>';
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
    teamKey: teamKey,
    loadRecentForm: loadRecentForm,
    getRecentForm: getRecentForm,
    formStripHtml: formStripHtml
  };
})(typeof window !== 'undefined' ? window : this);
