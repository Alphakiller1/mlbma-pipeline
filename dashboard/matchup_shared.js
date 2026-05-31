/**
 * Shared matchup utilities — lineups, weather, badges, sheet parsing.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(/%/g, ''));
    return isNaN(n) ? null : n;
  }

  function pickCol(row) {
    var keys = Object.keys(row || {});
    var rawArgs = Array.prototype.slice.call(arguments, 1);
    var names = [];
    rawArgs.forEach(function(arg) {
      if (Array.isArray(arg)) {
        arg.forEach(function(n) { names.push(n); });
      } else {
        names.push(arg);
      }
    });
    for (var i = 0; i < names.length; i++) {
      var label = names[i];
      if (row[label] !== undefined && row[label] !== '') return row[label];
      var norm = String(label).toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase().replace(/[^a-z0-9]/g, '') === norm) return row[keys[k]];
      }
    }
    return '';
  }

  function normName(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function teamKey(t) {
    return String(t || '').trim().toUpperCase();
  }

  function cloneObject(obj) {
    return Object.assign({}, obj || {});
  }

  function createFilterState(seed) {
    var defaults = (global.MLBMA_CONFIG && MLBMA_CONFIG.FILTER_DEFAULTS) || {
      hand: 'both',
      location: 'all',
      pitcher: 'both',
      batSide: 'both',
      segment: 'full',
      window: 'YTD'
    };
    return normalizeFilter(Object.assign({}, defaults, seed || {}));
  }

  function normalizeFilter(filter) {
    var f = cloneObject(filter);
    f.hand = String(f.hand || 'both').toLowerCase();
    f.location = String(f.location || 'all').toLowerCase();
    f.pitcher = String(f.pitcher || 'both').toLowerCase();
    f.batSide = String(f.batSide || 'both').toLowerCase();
    f.segment = String(f.segment || 'full').toLowerCase();
    f.window = String(f.window || 'YTD').toUpperCase();
    return f;
  }

  function filterKey(filter) {
    var f = normalizeFilter(filter || {});
    return [f.hand, f.location, f.pitcher, f.batSide, f.segment, f.window].join('|');
  }

  function createScopeState(seed) {
    var defaults = (global.MLBMA_CONFIG && MLBMA_CONFIG.SCOPE_DEFAULTS) || { mode: 'all', team: null };
    var scope = Object.assign({}, defaults, seed || {});
    scope.mode = String(scope.mode || 'all').toLowerCase();
    scope.team = scope.team ? teamKey(scope.team) : null;
    if (scope.mode !== 'team') scope.mode = 'all';
    return scope;
  }

  function parseCSVLine(line) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '"') {
        if (inQ && line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function repairCsvRow(line) {
    // Rejoin cells that were split by commas inside unquoted JSON/array values
    var cells = [];
    var cur = '';
    var depth = 0;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      if (c === ',' && depth === 0) {
        cells.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.join(',');
  }

  function parseCsvText(text) {
    var lines = String(text || '').trim().split('\n');
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]).map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
    return lines.slice(1).filter(function(line) { return line.trim(); }).map(function(line) {
      line = repairCsvRow(line);
      var cols = parseCSVLine(line);
      var row = {};
      headers.forEach(function(h, i) {
        row[h] = (cols[i] || '').replace(/^"|"$/g, '').replace(/""/g, '"').trim();
      });
      return row;
    });
  }

  var _sheetTabCache = {};
  var _sheetTabInflight = {};

  function fetchSheetTab(tabName, options) {
    options = options || {};
    var sid = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_ID;
    if (!sid) return Promise.reject(new Error('no sheet id'));
    var key = String(tabName);
    if (!options.forceRefresh && _sheetTabCache[key]) {
      return Promise.resolve(_sheetTabCache[key].slice());
    }
    if (_sheetTabInflight[key]) {
      return _sheetTabInflight[key].then(function(rows) { return rows.slice(); });
    }
    var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) { /* ignore */ } }, 15000) : null;
    _sheetTabInflight[key] = fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function(r) {
      if (!r.ok) throw new Error('fetch ' + tabName);
      return r.text();
    }).then(parseCsvText).then(function(rows) {
      _sheetTabCache[key] = rows;
      return rows;
    }).finally(function() {
      if (timer) clearTimeout(timer);
      delete _sheetTabInflight[key];
    });
    return _sheetTabInflight[key].then(function(rows) { return rows.slice(); });
  }

  function clearSheetTabCache(tabName) {
    if (tabName) delete _sheetTabCache[String(tabName)];
    else {
      _sheetTabCache = {};
      _sheetTabInflight = {};
    }
  }

  function normalizeGameKey(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\u0040/g, '@');
  }

  function matchupGameKey(m) {
    if (!m) return '';
    if (m.away && m.home) return teamKey(m.away) + '@' + teamKey(m.home);
    return '';
  }

  var TEAM_ABBR_ALIASES = {
    TB: 'TBR', WSH: 'WSN', KC: 'KCR', CWS: 'CHW', SD: 'SDP', SF: 'SFG',
    OAK: 'ATH', AZ: 'ARI', FLA: 'MIA'
  };

  function normalizeTeamAbbrShared(t) {
    var u = teamKey(t);
    return TEAM_ABBR_ALIASES[u] || u;
  }

  function normalizePitcherHandShared(h) {
    var s = String(h || '').trim().toUpperCase();
    if (!s) return '?';
    if (s === 'L' || s === 'LHP' || s.indexOf('LEFT') === 0) return 'L';
    if (s === 'R' || s === 'RHP' || s.indexOf('RIGHT') === 0) return 'R';
    if (s.charAt(0) === 'L') return 'L';
    if (s.charAt(0) === 'R') return 'R';
    return '?';
  }

  function parseBatOrderShared(row) {
    var boRaw = pickCol(row, 'Bat_Order', 'Bat Order', 'bat_order', 'Order', '#', 'BO');
    if (boRaw === '' || boRaw === undefined) {
      if (row.Bat_Order !== undefined && row.Bat_Order !== '') boRaw = row.Bat_Order;
      else if (row['Bat Order'] !== undefined) boRaw = row['Bat Order'];
    }
    if (typeof boRaw === 'number' && !isNaN(boRaw)) return Math.round(boRaw);
    var bo = parseInt(boRaw, 10);
    return isNaN(bo) ? 99 : bo;
  }

  function normalizeLineupGameKeyShared(raw) {
    var gk = normalizeGameKey(raw);
    var at = gk.indexOf('@');
    if (at < 0) return gk;
    return normalizeTeamAbbrShared(gk.slice(0, at)) + '@' + normalizeTeamAbbrShared(gk.slice(at + 1));
  }

  function parseLineupRows(rows) {
    return (rows || []).map(function(row) {
      var game = normalizeLineupGameKeyShared(pickCol(row, 'Game', 'game_key', 'GameKey'));
      var team = normalizeTeamAbbrShared(pickCol(row, 'Team', 'team', 'Tm'));
      if (!team) return null;
      return {
        game: game,
        team: team,
        side: String(pickCol(row, 'Side', 'side', 'Home_Away')).trim().toUpperCase(),
        batOrder: parseBatOrderShared(row),
        position: String(pickCol(row, 'Position', 'Pos', 'position')).trim() || '\u2014',
        player: String(pickCol(row, 'Player', 'Name', 'player_name')).trim() || 'TBD',
        bats: String(pickCol(row, 'Bats', 'Bats Hand', 'Hand', 'bat_hand')).trim() || '?'
      };
    }).filter(Boolean);
  }

  /** @param {Array} lineups - parsed lineup rows @param {string} gameKey @param {string} team @param {string} [side] */
  function parseLineup(lineups, gameKey, team, side) {
    var gk = normalizeLineupGameKeyShared(gameKey);
    var tm = normalizeTeamAbbrShared(team);
    var want = String(side || '').toUpperCase();
    function sideOk(sd) {
      sd = String(sd || '').toUpperCase();
      if (want === 'AWAY') return sd === 'AWAY' || sd === 'A' || sd === '0';
      if (want === 'HOME') return sd === 'HOME' || sd === 'H' || sd === '1';
      return true;
    }
    var primary = (lineups || []).filter(function(r) {
      return normalizeLineupGameKeyShared(r.game) === gk && normalizeTeamAbbrShared(r.team) === tm && sideOk(r.side);
    });
    var rows = primary.length ? primary : (lineups || []).filter(function(r) {
      return normalizeLineupGameKeyShared(r.game) === gk && normalizeTeamAbbrShared(r.team) === tm;
    });
    return rows.slice().sort(function(a, b) { return a.batOrder - b.batOrder; }).slice(0, 9);
  }

  function normalizeBatsHand(bats) {
    var c = String(bats || '?').trim().toUpperCase().charAt(0);
    if (c === 'L' || c === 'R' || c === 'S' || c === 'B') return c === 'B' ? 'S' : c;
    return '?';
  }

  function platoonHighlight(batterHand, spHand) {
    var b = normalizeBatsHand(batterHand);
    var o = String(spHand || '').trim().toUpperCase().charAt(0);
    if (o !== 'L' && o !== 'R') return false;
    if (o === 'R' && (b === 'L' || b === 'S')) return true;
    if (o === 'L' && b === 'R') return true;
    return false;
  }

  function platoonHighlightClass(batterHand, spHand) {
    if (!platoonHighlight(batterHand, spHand)) return '';
    var o = String(spHand || '').trim().toUpperCase().charAt(0);
    return o === 'R' ? 'lineup-row--platoon-l' : 'lineup-row--platoon-r';
  }

  function batterProfileLink(name) {
    if (!name || name === 'TBD') return esc(name || 'TBD');
    return '<a href="batter_profile.html?player=' + encodeURIComponent(name) + '" class="lineup-name-link" onclick="event.stopPropagation()">' + esc(name) + '</a>';
  }

  function buildLineupTable(lineupRows, opposingSPHand) {
    if (!lineupRows || !lineupRows.length) {
      return '<div class="lineup-empty">Lineup not yet confirmed</div>';
    }
    var handLbl = opposingSPHand === 'L' || opposingSPHand === 'R' ? opposingSPHand + 'HP' : '?HP';
    var html = '<div class="lineup-table-head">vs ' + esc(handLbl) + '</div>';
    lineupRows.forEach(function(r) {
      var bn = normalizeBatsHand(r.bats);
      html += '<div class="lineup-row ' + platoonHighlightClass(bn, opposingSPHand) + '">'
        + '<span class="lineup-bo">' + (r.batOrder <= 9 ? r.batOrder : '—') + '</span>'
        + '<span class="lineup-pos">' + esc(r.position) + '</span>'
        + '<span class="lineup-name">' + batterProfileLink(r.player) + '</span>'
        + '<span class="bats-pill hand-' + bn.toLowerCase() + '">' + esc(bn) + '</span>'
        + '</div>';
    });
    return html;
  }

  function parseWeatherString(raw) {
    var s = String(raw || '').trim();
    var out = {
      raw: s || '—',
      temp: null,
      wind: null,
      windDir: null,
      conditions: s || '—',
      dome: false
    };
    if (!s) return out;
    if (/dome|roof|indoor|retractable/i.test(s)) out.dome = true;
    var tempM = s.match(/(\d+)\s*°?\s*F/i);
    if (tempM) out.temp = parseInt(tempM[1], 10);
    var windM = s.match(/wind[:\s]*(\d+)\s*mph(?:\s+([A-Za-z]+))?/i);
    if (windM) {
      out.wind = parseInt(windM[1], 10);
      out.windDir = windM[2] || null;
    }
    if (/clear/i.test(s)) out.conditions = 'Clear';
    else if (/cloud/i.test(s)) out.conditions = 'Cloudy';
    else if (/rain/i.test(s)) out.conditions = 'Rain';
    return out;
  }

  function parseWeatherRow(row) {
    if (!row) return parseWeatherString('');
    var cond = pickCol(row, 'conditions', 'Conditions', 'Weather', 'Summary') || '—';
    var windSpd = numOrNull(pickCol(row, 'wind_speed_mph', 'Wind', 'Wind_Speed', 'wind_mph'));
    var windDir = pickCol(row, 'wind_direction', 'Wind_Dir', 'Wind Direction', 'wind_dir') || null;
    var windStr = windSpd != null
      ? 'Wind ' + windSpd + 'mph' + (windDir ? ' ' + windDir : '')
      : null;
    return {
      raw: cond,
      temp: numOrNull(pickCol(row, 'temperature_f', 'Temp', 'Temperature', 'temp_f')),
      wind: windSpd,
      windDir: windDir,
      conditions: cond,
      stadium: pickCol(row, 'stadium_name', 'Stadium', 'Venue', 'Ballpark') || '',
      dome: /dome|roof|indoor/i.test(String(cond))
        || String(pickCol(row, 'is_dome', 'Is_Dome', 'Roof')).toLowerCase() === 'true'
    };
  }

  function parseWeatherMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var away = teamKey(pickCol(row, 'away_team', 'Away'));
      var home = teamKey(pickCol(row, 'home_team', 'Home'));
      if (!away || !home) return;
      var w = parseWeatherRow(row);
      map[away + '@' + home] = w;
    });
    return map;
  }

  function weatherBadge(weatherData) {
    var w = weatherData || {};
    if (w.dome) return '<span class="weather-badge dome">DOME</span>';
    var parts = [];
    if (w.temp != null) parts.push(w.temp + '°F');
    if (w.wind != null) parts.push('Wind ' + w.wind + 'mph' + (w.windDir ? ' ' + w.windDir : ''));
    if (w.conditions && w.conditions !== '—') parts.push(w.conditions);
    if (!parts.length) parts.push(w.raw || '—');
    return '<span class="weather-badge">' + esc(parts.join(' · ')) + '</span>';
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function gamescriptBadge(awayABQ, homeABQ, awayPitchScore, homePitchScore, awayRcv, homeRcv, awayHr9, homeHr9) {
    awayABQ = awayABQ != null ? awayABQ : 50;
    homeABQ = homeABQ != null ? homeABQ : 50;
    awayPitchScore = awayPitchScore != null ? awayPitchScore : 50;
    homePitchScore = homePitchScore != null ? homePitchScore : 50;
    awayRcv = awayRcv != null ? awayRcv : 50;
    homeRcv = homeRcv != null ? homeRcv : 50;
    awayHr9 = awayHr9 != null ? awayHr9 : 1;
    homeHr9 = homeHr9 != null ? homeHr9 : 1;
    var abqAvg = (awayABQ + homeABQ) / 2;
    var psAvg = (awayPitchScore + homePitchScore) / 2;
    var maxRcv = Math.max(awayRcv, homeRcv);
    var maxHr9 = Math.max(awayHr9, homeHr9);
    if (maxRcv >= 65 && maxHr9 >= 1.2) return { label: 'Power Showdown', cls: 'script-badge script-orange' };
    if (abqAvg > 60 && psAvg > 65) return { label: 'Pitching Duel', cls: 'script-badge script-gray' };
    if (abqAvg > 60 && psAvg < 50) return { label: 'Lineup Grinds SP', cls: 'script-badge script-amber' };
    if (abqAvg < 50 && psAvg > 65) return { label: 'Quick Game', cls: 'script-badge script-blue' };
    return { label: 'Balanced', cls: 'script-badge script-muted' };
  }

  function f5Badge(awayPs, homePs, awayBpAllowed, homeBpAllowed) {
    awayPs = awayPs != null ? awayPs : 50;
    homePs = homePs != null ? homePs : 50;
    awayBpAllowed = awayBpAllowed != null ? awayBpAllowed : 55;
    homeBpAllowed = homeBpAllowed != null ? homeBpAllowed : 55;
    var maxPs = Math.max(awayPs, homePs);
    var minBp = Math.min(awayBpAllowed, homeBpAllowed);
    var maxBp = Math.max(awayBpAllowed, homeBpAllowed);
    if (maxPs >= 70 && minBp < 50) return { label: 'F5 + Full', cls: 'f5-badge f5-green' };
    if (maxPs >= 70 && maxBp > 60) return { label: 'F5 Only', cls: 'f5-badge f5-amber' };
    if (maxPs < 55 && minBp < 50) return { label: 'Full Only', cls: 'f5-badge f5-blue' };
    return { label: 'Lineup Edge', cls: 'f5-badge f5-muted' };
  }

  function pctDecimal(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseFloat(String(v).replace(/%/g, ''));
    if (isNaN(n)) return null;
    return n > 1.5 ? n / 100 : n;
  }

  function normalizePool(values) {
    var nums = values.filter(function(v) { return v != null && !isNaN(v); });
    if (!nums.length) return values.map(function() { return 50; });
    var mn = Math.min.apply(null, nums);
    var mx = Math.max.apply(null, nums);
    if (mx === mn) return values.map(function() { return 50; });
    return values.map(function(v) {
      if (v == null || isNaN(v)) return null;
      return ((v - mn) / (mx - mn)) * 100;
    });
  }

  function invertPool(normValues) {
    return normValues.map(function(v) {
      return v == null || isNaN(v) ? null : 100 - v;
    });
  }

  /** Client-side PitchScore — mirrors Python pool normalize (0.40 K + 0.35 inv BB + 0.25 inv HR/9). */
  function computePitchScoreFromRates(kPct, bbPct, hr9, pool) {
    var k = pctDecimal(kPct);
    var bb = pctDecimal(bbPct);
    var hr = hr9 != null && !isNaN(hr9) ? Number(hr9) : null;
    if (k == null || bb == null || hr == null) return null;
    if (pool && pool.length) {
      var kArr = pool.map(function(p) { return pctDecimal(p.k); });
      var bbArr = pool.map(function(p) { return pctDecimal(p.bb); });
      var hrArr = pool.map(function(p) { return p.hr; });
      var nk = normalizePool(kArr);
      var nbb = invertPool(normalizePool(bbArr));
      var nhr = invertPool(normalizePool(hrArr));
      var idx = pool.findIndex(function(p) {
        return pctDecimal(p.k) === k && pctDecimal(p.bb) === bb && p.hr === hr;
      });
      if (idx < 0) {
        var allK = kArr.concat([k]);
        var allBB = bbArr.concat([bb]);
        var allHR = hrArr.concat([hr]);
        nk = normalizePool(allK);
        nbb = invertPool(normalizePool(allBB));
        nhr = invertPool(normalizePool(allHR));
        idx = allK.length - 1;
      }
      return Math.round((0.4 * (nk[idx] || 50) + 0.35 * (nbb[idx] || 50) + 0.25 * (nhr[idx] || 50)) * 10) / 10;
    }
    var bbInv = (1 - bb) * 100;
    var hrInv = (1 - Math.min(hr / 3, 1)) * 100;
    var raw = k * 0.4 + bbInv * 0.35 + hrInv * 0.25;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  }

  function pitcherOorFromTeamHand(team, hand, oorByTeam) {
    if (!oorByTeam || !team) return null;
    var row = oorByTeam[teamKey(team)];
    if (!row) return null;
    var h = String(hand || 'R').trim().toUpperCase().charAt(0);
    if (h === 'L' && row.hvL != null) return row.hvL;
    if (h === 'R' && row.hvR != null) return row.hvR;
    if (row.hvP != null) return row.hvP;
    if (row.hvR != null && row.hvL != null) return row.hvR * 0.55 + row.hvL * 0.45;
    return row.oor != null ? row.oor : null;
  }

  function buildOorByTeam(oorRows) {
    var map = {};
    (oorRows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'tm', 'team', 't'));
      if (!t) return;
      map[t] = {
        t: t,
        hvP: numOrNull(pickCol(row, 'HvP', 'hvP')),
        hvL: numOrNull(pickCol(row, 'HvL', 'hvL')),
        hvR: numOrNull(pickCol(row, 'HvR', 'hvR')),
        oor: numOrNull(pickCol(row, 'OOR', 'oor'))
      };
    });
    return map;
  }

  /** Enrich SP_Profiles rows with PitchScore, OOR proxy, FIP fallback — mutates rows in place. */
  function enrichSpProfiles(rows, oorByTeam) {
    if (!rows || !rows.length) return rows;
    var pool = rows.map(function(row) {
      return {
        k: pickCol(row, 'K_pct', 'K%', 'k_pct'),
        bb: pickCol(row, 'BB_pct', 'BB%', 'bb_pct'),
        hr: numOrNull(pickCol(row, 'HR9', 'HR/9', 'hr9'))
      };
    });
    rows.forEach(function(row, i) {
      var kPct = pickCol(row, 'K_pct', 'K%', 'k_pct');
      var bbPct = pickCol(row, 'BB_pct', 'BB%', 'bb_pct');
      var hr9 = numOrNull(pickCol(row, 'HR9', 'HR/9', 'hr9'));
      var ps = computePitchScoreFromRates(kPct, bbPct, hr9, pool);
      if (ps != null) row.PitchScore = ps;
      var era = numOrNull(pickCol(row, 'ERA', 'era'));
      var fip = numOrNull(pickCol(row, 'FIP', 'fip'));
      row.FIP = fip != null ? fip : era;
      row.FIP_na = fip == null && era == null;
      row.xFIP = null;
      var team = pickCol(row, 'pitcher_team', 'Team', 'Tm');
      var hand = pickCol(row, 'pitcher_hand', 'Hand', 'hand');
      var oor = pitcherOorFromTeamHand(team, hand, oorByTeam);
      if (oor != null) row.OOR = oor;
      var staleRaw = pickCol(row, 'stale', 'staleness_flag', 'Staleness');
      row.stale = staleRaw === true || staleRaw === 'True' || staleRaw === 'true' || staleRaw === '1';
      row.staleness_flag = row.stale;
      row.L14_drift = row.stale ? 'Stale' : null;
    });
    return rows;
  }

  function scoreRowFromSheet(row) {
    var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
    if (!t) return null;
    var abq = numOrNull(pickCol(row, 'ABQ', 'abq'));
    var rcv = numOrNull(pickCol(row, 'RCV', 'rcv'));
    var obr = numOrNull(pickCol(row, 'OBR', 'obr'));
    var osi = numOrNull(pickCol(row, 'OSI', 'osi'));
    var projOSI = numOrNull(pickCol(row, 'projOSI', 'ProjOSI', 'proj_osi'));
    var reg = numOrNull(pickCol(row, 'reg_signal', 'reg', 'Reg_signal'));
    var ppGap = numOrNull(pickCol(row, 'PP-Gap', 'ppGap', 'PP_Gap'));
    if (abq === null || rcv === null || obr === null || osi === null) return null;
    if (projOSI == null) projOSI = osi;
    if (ppGap == null && abq != null && rcv != null) ppGap = abq - rcv;
    var woba = numOrNull(pickCol(row, 'wOBA', 'woba', 'woba_rhp'));
    var xwoba = numOrNull(pickCol(row, 'xwOBA', 'xwoba'));
    var slg = numOrNull(pickCol(row, 'SLG', 'slg'));
    var wrc = numOrNull(pickCol(row, 'wRC+', 'wrc_plus', 'wRC'));
    var k = numOrNull(pickCol(row, 'K%', 'k_pct'));
    var bb = numOrNull(pickCol(row, 'BB%', 'bb_pct'));
    var barrel = numOrNull(pickCol(row, 'Barrel%', 'barrel_pct'));
    var hard = numOrNull(pickCol(row, 'HardHit%', 'hardhit_pct'));
    if (woba === 0) woba = null;
    if (xwoba === 0) xwoba = null;
    if (slg === 0) slg = null;
    if (wrc === 0) wrc = null;
    if (xwoba == null && woba != null) xwoba = woba;
    return {
      t: t, abq: abq, rcv: rcv, obr: obr, osi: osi,
      projOSI: projOSI, reg_signal: reg, reg: reg, ppGap: ppGap,
      wrc: wrc, woba: woba, xwoba: xwoba, slg: slg,
      k: k, bb: bb, barrel: barrel, hard: hard
    };
  }

  function findScoreRow(rows, team) {
    var tk = teamKey(team);
    if (!tk || !rows || !rows.length) return null;
    for (var i = 0; i < rows.length; i++) {
      if (teamKey(rows[i].t) === tk) return rows[i];
    }
    return null;
  }

  /** vs RHP / vs LHP YTD ratios vs blended Both — scales Team_Profiles window fields by platoon. */
  function handMetricRatios(hand, team, scR, scL, scBoth) {
    if (!hand || hand === 'both') return null;
    var both = findScoreRow(scBoth, team);
    var handRow = findScoreRow(hand === 'r' ? scR : scL, team);
    if (!both || !handRow) return null;
    var ratios = {};
    ['osi', 'abq', 'rcv', 'obr', 'projOSI'].forEach(function(m) {
      var b = both[m], h = handRow[m];
      if (b != null && h != null && !isNaN(b) && !isNaN(h) && Math.abs(b) > 0.01) {
        ratios[m] = h / b;
      }
    });
    return Object.keys(ratios).length ? ratios : null;
  }

  /** PA-weighted team ABQ/RCV/OBR/OSI (+ wRC+/wOBA/SLG) from Batter_Splits_Home/Away rows. */
  function aggregateTeamOffenseFromBatterRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var team = teamKey(pickCol(row, 'Tm', 'Team', 'team', 'team_abbr', 't'));
      if (!team) return;
      if (!map[team]) {
        map[team] = {
          t: team, paSum: 0,
          osi: 0, abq: 0, rcv: 0, obr: 0,
          wrc: 0, woba: 0, xwoba: 0, slg: 0,
          hasOsi: false, hasRate: false
        };
      }
      var d = map[team];
      var pa = parseFloat(pickCol(row, 'PA', 'pa')) || 0;
      if (pa < 1) pa = 1;
      var osi = numOrNull(pickCol(row, 'OSI', 'osi'));
      var abq = numOrNull(pickCol(row, 'ABQ', 'abq'));
      var rcv = numOrNull(pickCol(row, 'RCV', 'rcv'));
      var obr = numOrNull(pickCol(row, 'OBR', 'obr'));
      if (osi != null && abq != null && rcv != null && obr != null) {
        d.osi += osi * pa;
        d.abq += abq * pa;
        d.rcv += rcv * pa;
        d.obr += obr * pa;
        d.hasOsi = true;
        d.paSum += pa;
      }
      var wrc = numOrNull(pickCol(row, 'wRC+', 'wrc', 'wRC'));
      var woba = numOrNull(pickCol(row, 'wOBA', 'woba'));
      var xwoba = numOrNull(pickCol(row, 'xwOBA', 'xwoba'));
      var slg = numOrNull(pickCol(row, 'SLG', 'slg'));
      if (wrc != null) {
        d.wrc += wrc * pa;
        d.woba += (woba != null ? woba : 0) * pa;
        d.xwoba += (xwoba != null ? xwoba : woba != null ? woba : 0) * pa;
        d.slg += (slg != null ? slg : 0) * pa;
        d.hasRate = true;
        if (!d.hasOsi) d.paSum += pa;
      }
    });
    return Object.keys(map).sort().map(function(t) {
      var d = map[t];
      var pa = d.paSum > 0 ? d.paSum : 1;
      var out = { t: d.t };
      if (d.hasOsi) {
        out.osi = Math.round(d.osi / pa * 10) / 10;
        out.abq = Math.round(d.abq / pa * 10) / 10;
        out.rcv = Math.round(d.rcv / pa * 10) / 10;
        out.obr = Math.round(d.obr / pa * 10) / 10;
        out.ppGap = out.abq - out.rcv;
        out.projOSI = out.osi;
      }
      if (d.hasRate) {
        var ratePa = d.paSum > 0 ? d.paSum : pa;
        out.wrc = Math.round(d.wrc / ratePa * 10) / 10;
        out.woba = Math.round(d.woba / ratePa * 1000) / 1000;
        out.xwoba = Math.round(d.xwoba / ratePa * 1000) / 1000;
        out.slg = Math.round(d.slg / ratePa * 1000) / 1000;
      }
      if (out.osi == null && out.wrc != null) {
        // Phase 0 proxy: when split tabs provide only rate stats, map headline process metrics
        // through a light wRC+ anchored transform so context can still move values.
        var base = out.wrc;
        out.osi = base;
        out.rcv = base;
        out.abq = base;
        out.obr = base;
        out.ppGap = 0;
        out.projOSI = out.osi;
      }
      if (out.osi == null && out.woba != null) {
        var proxy = out.woba * 250;
        out.osi = proxy;
        out.rcv = proxy;
        out.abq = proxy;
        out.obr = proxy;
        out.ppGap = 0;
        out.projOSI = out.osi;
      }
      if (out.osi == null) return null;
      return _backfillXwoba(out);
    }).filter(Boolean);
  }

  function applyHandMetricRatios(row, ratios) {
    if (!row || !ratios) return row;
    var out = Object.assign({}, row);
    Object.keys(ratios).forEach(function(m) {
      if (out[m] != null && !isNaN(out[m]) && ratios[m] != null && ratios[m] !== 1) {
        out[m] = out[m] * ratios[m];
      }
    });
    if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
    return out;
  }

  function scaleRowMetrics(row, ratio) {
    var out = Object.assign({}, row);
    if (ratio == null || isNaN(ratio) || ratio === 1) return out;
    ['osi', 'abq', 'rcv', 'obr', 'projOSI', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(k) {
      if (out[k] != null && !isNaN(out[k])) out[k] = out[k] * ratio;
    });
    if (out.abq != null && out.rcv != null) out.ppGap = out.abq - out.rcv;
    return out;
  }

  function blendSplits(scR, scL) {
    var by = {};
    (scR || []).forEach(function(r) { if (r && r.t) by[r.t] = { r: r }; });
    (scL || []).forEach(function(l) {
      if (!l || !l.t) return;
      if (!by[l.t]) by[l.t] = {};
      by[l.t].l = l;
    });
    return Object.keys(by).sort().map(function(t) {
      var pack = by[t], r = pack.r, l = pack.l;
      if (!r && l) return Object.assign({}, l);
      if (r && !l) return Object.assign({}, r);
      function b(k) {
        var rv = numOrNull(r[k]);
        var lv = numOrNull(l[k]);
        if (rv == null && lv == null) return null;
        if (rv == null) return lv;
        if (lv == null) return rv;
        return 0.5 * rv + 0.5 * lv;
      }
      var row = {
        t: t,
        abq: b('abq'),
        rcv: b('rcv'),
        obr: b('obr'),
        osi: b('osi'),
        projOSI: b('projOSI'),
        reg: r.reg != null ? r.reg : l.reg,
        ppGap: null,
        wrc: b('wrc'),
        woba: b('woba'),
        xwoba: b('xwoba'),
        slg: b('slg')
      };
      if (row.abq != null && row.rcv != null) row.ppGap = row.abq - row.rcv;
      return row;
    });
  }

  function normalizeHubFilter(filter) {
    return normalizeFilter(filter || {});
  }

  function _windowSuffix(windowKey) {
    if (windowKey === 'L30') return 'l30';
    if (windowKey === 'L14') return 'l14';
    if (windowKey === 'L7') return 'l7';
    return null;
  }

  function _num(v) {
    return v == null || v === '' || isNaN(v) ? null : Number(v);
  }

  /** Team profiles and location splits often have wOBA but not xwOBA — mirror vs_RHP sheet fallback. */
  function _backfillXwoba(row) {
    if (!row) return row;
    if (_num(row.xwoba) == null && _num(row.woba) != null) row.xwoba = _num(row.woba);
    return row;
  }

  function _profileForTeam(teamProfiles, team) {
    var tk = teamKey(team);
    return (teamProfiles && (teamProfiles[tk] || teamProfiles[team])) || {};
  }

  function _trend(ytd, l14, l7) {
    ytd = _num(ytd); l14 = _num(l14); l7 = _num(l7);
    if (ytd == null) return 'Stable';
    if (l14 != null && l7 != null && l14 > ytd + 3 && l7 > ytd + 3) return 'Rising';
    if ((l14 != null && l14 < ytd - 3) || (l7 != null && l7 < ytd - 5)) return 'Cooling';
    if (l7 != null && l7 > ytd + 5 && l14 != null && Math.abs(l14 - ytd) <= 2) return 'Fake Hot';
    return 'Stable';
  }

  function _tier(osi) {
    osi = _num(osi);
    if (osi == null) return { label: '—', cls: 'tier-incon' };
    if (osi >= 85) return { label: 'Elite', cls: 'tier-elite' };
    if (osi >= 75) return { label: 'High-Level', cls: 'tier-high' };
    if (osi >= 65) return { label: 'Dangerous', cls: 'tier-danger' };
    if (osi >= 50) return { label: 'Inconsistent', cls: 'tier-incon' };
    return { label: 'Weak', cls: 'tier-weak' };
  }

  function _resultsWindowSuffix(windowKey) {
    if (windowKey === 'L30') return 'l30';
    if (windowKey === 'L14') return 'l14';
    if (windowKey === 'L7') return 'l7';
    return null;
  }

  /** Team_Results stores rates as 0–1; dashboard Surface-wins uses 0–100. */
  function _pctFromResults(raw) {
    var v = _num(raw);
    if (v == null) return null;
    if (v >= 0 && v <= 1) return Math.round(v * 1000) / 10;
    return Math.round(v * 10) / 10;
  }

  function _teamResultsPopulated(resultsByTeam) {
    var map = resultsByTeam || {};
    return Object.keys(map).some(function(t) {
      return _pctFromResults(map[t].win_pct) != null;
    });
  }

  function resultVal(resultsRow, metric, filter) {
    if (!resultsRow || !metric) return null;
    var winSuf = _resultsWindowSuffix(filter && filter.window);
    var locSuf = filter && filter.location === 'home' ? 'home'
      : filter && filter.location === 'away' ? 'away' : null;
    var candidates = [];
    if (winSuf && locSuf) {
      candidates.push(metric + '_' + winSuf);
      candidates.push(metric + '_' + locSuf);
    } else if (winSuf) {
      candidates.push(metric + '_' + winSuf);
    } else if (locSuf) {
      candidates.push(metric + '_' + locSuf);
    }
    candidates.push(metric);
    for (var i = 0; i < candidates.length; i++) {
      var col = candidates[i];
      var raw = resultsRow[col];
      if (raw == null || raw === '') raw = pickCol(resultsRow, col, col.toUpperCase());
      var v = _pctFromResults(raw);
      if (v != null) return v;
    }
    return null;
  }

  function parseTeamResultsMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team', 'tm'));
      if (!t) return;
      var rec = {};
      Object.keys(row || {}).forEach(function(k) {
        if (!k || k === 'team') return;
        var v = numOrNull(row[k]);
        if (v != null) rec[String(k).trim().toLowerCase()] = v;
      });
      map[t] = rec;
    });
    return map;
  }

  function resolveLineupRows(store, filter, options) {
    var f = normalizeHubFilter(filter);
    var data = store || {};
    var scR = data.scR || [];
    var scL = data.scL || [];
    var scBoth = (data.scBoth && data.scBoth.length) ? data.scBoth : blendSplits(scR, scL);
    var scHome = data.scHome || [];
    var scAway = data.scAway || [];
    var scVsSp = data.scVsSp || [];
    var scVsRp = data.scVsRp || [];
    var teamProfiles = data.teamProfiles || {};
    var palsByTeam = data.palsByTeam || {};
    var resultsByTeam = data.resultsByTeam || {};
    var resultsPopulated = _teamResultsPopulated(resultsByTeam);
    var opts = options || {};
    var resultsFilter = { window: f.window, location: f.location };

    var source = scBoth;
    var sourceKey = 'both';
    if (f.hand === 'r') { source = scR; sourceKey = 'hand:r'; }
    else if (f.hand === 'l') { source = scL; sourceKey = 'hand:l'; }

    var unavailable = {
      window: false,
      location: false,
      pitcher: false,
      segment: false
    };
    var windowAppliedAny = false;
    var locationAppliedAny = false;
    var pitcherAppliedAny = false;

    if (f.window === 'YTD' && f.hand === 'both') {
      if (f.location === 'home') {
        if (scHome.length >= 10) { source = scHome; sourceKey = 'ytd:home'; }
        else unavailable.location = true;
      } else if (f.location === 'away') {
        if (scAway.length >= 10) { source = scAway; sourceKey = 'ytd:away'; }
        else unavailable.location = true;
      }

      if (f.pitcher === 'sp') {
        if (scVsSp.length >= 10) { source = scVsSp; sourceKey = 'ytd:sp'; }
        else unavailable.pitcher = true;
      } else if (f.pitcher === 'rp') {
        if (scVsRp.length >= 10) { source = scVsRp; sourceKey = 'ytd:rp'; }
        else unavailable.pitcher = true;
      }
    }

    var homeMap = {};
    var awayMap = {};
    var bothMap = {};
    var spMap = {};
    var rpMap = {};
    scHome.forEach(function(r) { if (r && r.t) homeMap[teamKey(r.t)] = r; });
    scAway.forEach(function(r) { if (r && r.t) awayMap[teamKey(r.t)] = r; });
    scBoth.forEach(function(r) { if (r && r.t) bothMap[teamKey(r.t)] = r; });
    scVsSp.forEach(function(r) { if (r && r.t) spMap[teamKey(r.t)] = r; });
    scVsRp.forEach(function(r) { if (r && r.t) rpMap[teamKey(r.t)] = r; });

    var rows = (source || []).map(function(base) {
      var d = _backfillXwoba(Object.assign({}, base));
      var t = d.t;
      var tk = teamKey(t);
      var prof = _profileForTeam(teamProfiles, t);
      var palsRow = palsByTeam[tk] || null;
      if (d.ppGap == null && d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
      if (_num(d.pals) == null && palsRow && _num(palsRow.pals) != null) d.pals = _num(palsRow.pals);
      if (_num(d.xfip) == null && palsRow && _num(palsRow.xfip) != null) d.xfip = _num(palsRow.xfip);
      d.ytdOSI = prof.osi_ytd != null ? _num(prof.osi_ytd) : _num(d.osi);
      d.l30OSI = _num(prof.osi_l30);
      d.l14OSI = _num(prof.osi_l14);
      d.l7OSI = _num(prof.osi_l7);
      d.pitchScore = _num(prof.avg_pitching_score);
      var ipNorm = _num(prof.avg_ip_per_start);
      var ipPerStart = ipNorm != null ? (ipNorm > 0 && ipNorm < 1.5 ? ipNorm * 9 : ipNorm) : null;
      d.pitchInn = ipPerStart != null && ipPerStart > 0 ? (92 / ipPerStart) : null; // proxy pitches per inning faced
      var qsRaw = _num(prof.qs_against_pct != null ? prof.qs_against_pct : prof.qs_against);
      if (qsRaw != null) d.qs = qsRaw;
      else if (ipPerStart != null) d.qs = Math.max(0, Math.min(100, ((ipPerStart - 4.0) / 2.5) * 100)); // IP/start -> QS% proxy

      if (f.window !== 'YTD') {
        var suf = _windowSuffix(f.window);
        var applied = false;
        ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
          var wv = _num(prof[m + '_' + suf]);
          if (wv != null) {
            d[m] = wv;
            applied = true;
          }
        });
        if (applied) windowAppliedAny = true;
        if (applied && f.hand !== 'both') {
          var ratios = handMetricRatios(f.hand, t, scR, scL, scBoth);
          if (ratios) d = applyHandMetricRatios(d, ratios);
        }
      }

      if (f.location === 'home' || f.location === 'away') {
        var loc = f.location;
        var alreadyScoped = f.window === 'YTD' && f.hand === 'both'
          && ((loc === 'home' && scHome.length >= 10) || (loc === 'away' && scAway.length >= 10));
        if (!alreadyScoped) {
          var locRow = loc === 'home' ? homeMap[teamKey(t)] : awayMap[teamKey(t)];
          var locRatio = null;
          var locOsi = _num(prof[loc + '_osi']);
          var baseOsi = _num(prof.osi_ytd) != null ? _num(prof.osi_ytd) : _num(prof.osi);
          if (locOsi != null && baseOsi != null && Math.abs(baseOsi) > 0.0001) locRatio = locOsi / baseOsi;
          if (locRatio == null && locRow) {
            var baseBothForLoc = bothMap[teamKey(t)];
            if (baseBothForLoc && _num(locRow.osi) != null && _num(baseBothForLoc.osi) != null && Math.abs(_num(baseBothForLoc.osi)) > 0.0001) {
              locRatio = _num(locRow.osi) / _num(baseBothForLoc.osi);
            }
          }
          var scaled = false;
          ['osi', 'abq', 'rcv', 'obr'].forEach(function(m) {
            var locVal = _num(prof[loc + '_' + m]);
            var ytdVal = m === 'osi' ? (_num(prof.osi_ytd) != null ? _num(prof.osi_ytd) : _num(prof.osi)) : _num(prof[m]);
            if (locVal == null || ytdVal == null || Math.abs(ytdVal) < 0.01) return;
            if (_num(d[m]) != null) {
              d[m] = d[m] * (locVal / ytdVal);
              scaled = true;
            }
          });
          if (scaled) {
            locationAppliedAny = true;
            ['wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
              var v = _num(prof[loc + '_' + m]);
              if (v == null && locRow) v = _num(locRow[m]);
              if (locRow && (m === 'woba' || m === 'xwoba') && _num(d[m]) != null) {
                var baseBothForWoba = bothMap[teamKey(t)];
                var locWrc = _num(locRow.wrc);
                var baseWrc = baseBothForWoba ? _num(baseBothForWoba.wrc) : null;
                if (locWrc != null && baseWrc != null && Math.abs(baseWrc) > 0.0001) {
                  v = _num(d[m]) * (locWrc / baseWrc);
                }
              }
              if (v == null && locRatio != null && _num(d[m]) != null) v = _num(d[m]) * locRatio;
              if (v != null) d[m] = v;
            });
            if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
          } else if (locRow) {
            // If explicit location aggregate rows exist, apply them directly so location context is never silently ignored.
            ['wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
              var lv = _num(locRow[m]);
              if ((m === 'woba' || m === 'xwoba') && _num(d[m]) != null) {
                var baseBothForWoba2 = bothMap[teamKey(t)];
                var locWrc2 = _num(locRow.wrc);
                var baseWrc2 = baseBothForWoba2 ? _num(baseBothForWoba2.wrc) : null;
                if (locWrc2 != null && baseWrc2 != null && Math.abs(baseWrc2) > 0.0001) {
                  lv = _num(d[m]) * (locWrc2 / baseWrc2);
                }
              }
              if (lv == null && locRatio != null && _num(d[m]) != null) lv = _num(d[m]) * locRatio;
              if (lv != null) d[m] = lv;
            });
            var baseBoth = bothMap[teamKey(t)];
            if (baseBoth && _num(locRow.osi) != null && _num(baseBoth.osi) != null && Math.abs(_num(baseBoth.osi)) > 0.0001) {
              ['osi', 'abq', 'rcv', 'obr', 'projOSI'].forEach(function(m) {
                if (_num(d[m]) == null) return;
                d[m] = d[m] * (_num(locRow.osi) / _num(baseBoth.osi));
              });
              if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
            }
            locationAppliedAny = true;
          }
        }
      }

      if (f.pitcher === 'sp' || f.pitcher === 'rp') {
        var alreadyPitchScoped = f.window === 'YTD' && f.hand === 'both' && f.location === 'all'
          && ((f.pitcher === 'sp' && scVsSp.length >= 10) || (f.pitcher === 'rp' && scVsRp.length >= 10));
        if (!alreadyPitchScoped) {
          var pitchRow = f.pitcher === 'sp' ? spMap[teamKey(t)] : rpMap[teamKey(t)];
          var baseBoth = bothMap[teamKey(t)];
          if (pitchRow && baseBoth) {
            pitcherAppliedAny = true;
            var ratioBase = null;
            if (_num(pitchRow.wrc) != null && _num(baseBoth.wrc) != null && Math.abs(_num(baseBoth.wrc)) > 0.0001) {
              ratioBase = _num(pitchRow.wrc) / _num(baseBoth.wrc);
            } else if (_num(pitchRow.woba) != null && _num(baseBoth.woba) != null && Math.abs(_num(baseBoth.woba)) > 0.0001) {
              ratioBase = _num(pitchRow.woba) / _num(baseBoth.woba);
            }
            ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg', 'projOSI'].forEach(function(m) {
              var pv = _num(pitchRow[m]);
              var bv = _num(baseBoth[m]);
              if (_num(d[m]) == null) return;
              if (pv != null && bv != null && Math.abs(bv) > 0.0001) {
                d[m] = d[m] * (pv / bv);
              } else if (ratioBase != null) {
                d[m] = d[m] * ratioBase;
              }
            });
            if (d.abq != null && d.rcv != null) d.ppGap = d.abq - d.rcv;
          }
        }
      }

      if (f.segment === 'f5') {
        if (_num(d.abq) != null && _num(d.obr) != null && _num(d.rcv) != null) {
          d.osi = (d.abq * 0.45) + (d.obr * 0.35) + (d.rcv * 0.20);
        }
        if (_num(d.abq) != null && _num(d.rcv) != null) d.ppGap = d.abq - d.rcv;
      }

      var R = resultsByTeam[tk] || null;
      if (resultsPopulated) {
        d.winPct = resultVal(R, 'win_pct', resultsFilter);
        d.f5WinPct = resultVal(R, 'f5_win_pct', resultsFilter);
        d.pitcherWinPct = resultVal(R, f.pitcher === 'rp' ? 'rp_win_pct' : 'sp_win_pct', resultsFilter);
      } else {
        d.winPct = null;
        d.f5WinPct = null;
        d.pitcherWinPct = null;
      }

      d.trend = _trend(d.ytdOSI, d.l14OSI, d.l7OSI);
      d.tier = _tier(d.osi);
      return _backfillXwoba(d);
    }).filter(Boolean);

    if (opts.includeMeta) {
      if (f.window !== 'YTD' && !windowAppliedAny) unavailable.window = true;
      if ((f.location === 'home' || f.location === 'away') && !locationAppliedAny && !(f.window === 'YTD' && f.hand === 'both')) {
        unavailable.location = true;
      }
      if ((f.pitcher === 'sp' || f.pitcher === 'rp') && !pitcherAppliedAny && !(f.window === 'YTD' && f.hand === 'both')) {
        unavailable.pitcher = true;
      }
      if (f.segment === 'f5') {
        // No dedicated F5 split tabs currently; F5 context uses derived proxy.
        unavailable.segment = true;
      }
      if (opts.debugSource && typeof console !== 'undefined' && console.debug) {
        console.debug('[LineupModel] resolved_source', sourceKey, 'filter=', f, 'unavailable=', unavailable);
      }
      return {
        rows: rows,
        meta: {
          sourceKey: sourceKey,
          approxWindow: f.window !== 'YTD',
          approxLocation: (f.location === 'home' || f.location === 'away') && f.hand !== 'both',
          teamResultsEmpty: !resultsPopulated,
          resultsPitcherUnsplit: resultsPopulated && (f.pitcher === 'sp' || f.pitcher === 'rp'),
          resultsHandUnsplit: resultsPopulated && f.hand !== 'both',
          unavailable: unavailable
        }
      };
    }
    return rows;
  }

  function splitOSI(teamData, spHand) {
    if (!teamData) return null;
    var h = String(spHand || '').trim().toUpperCase().charAt(0);
    if (h === 'L') return teamData.vsL || teamData.l || null;
    if (h === 'R') return teamData.vsR || teamData.r || null;
    return teamData.both || teamData.b || null;
  }

  function parseMatchupRows(rows) {
    return (rows || []).map(function(row) {
      var away = normalizeTeamAbbrShared(pickCol(row, 'Away'));
      var home = normalizeTeamAbbrShared(pickCol(row, 'Home'));
      if (!away && !home) return null;
      return {
        time: String(pickCol(row, 'Time', 'Game_Time')).trim(),
        away: away,
        home: home,
        awaySP: String(pickCol(row, 'Away_SP', 'Away SP')).trim(),
        awayHand: normalizePitcherHandShared(pickCol(row, 'Away_Hand', 'Away Hand', 'Away_SP_Hand')),
        awayK: numOrNull(pickCol(row, 'Away_K%', 'Away K%')),
        awayBB: numOrNull(pickCol(row, 'Away_BB%', 'Away BB%')),
        awayHR9: numOrNull(pickCol(row, 'Away_HR9', 'Away HR/9')),
        awayFIP: numOrNull(pickCol(row, 'Away_FIP', 'Away FIP')),
        awayXFIP: numOrNull(pickCol(row, 'Away_xFIP', 'Away xFIP')),
        homeSP: String(pickCol(row, 'Home_SP', 'Home SP')).trim(),
        homeHand: normalizePitcherHandShared(pickCol(row, 'Home_Hand', 'Home Hand', 'Home_SP_Hand')),
        homeK: numOrNull(pickCol(row, 'Home_K%', 'Home K%')),
        homeBB: numOrNull(pickCol(row, 'Home_BB%', 'Home BB%')),
        homeHR9: numOrNull(pickCol(row, 'Home_HR9', 'Home HR/9')),
        homeFIP: numOrNull(pickCol(row, 'Home_FIP', 'Home FIP')),
        homeXFIP: numOrNull(pickCol(row, 'Home_xFIP', 'Home xFIP')),
        awayOSI: numOrNull(pickCol(row, 'Away_OSI', 'Away OSI')),
        homeOSI: numOrNull(pickCol(row, 'Home_OSI', 'Home OSI')),
        lineupEdge: String(pickCol(row, 'Lineup_Edge', 'Lineup Edge')).trim(),
        stadium: String(pickCol(row, 'Stadium', 'Venue', 'Ballpark')).trim()
      };
    }).filter(Boolean);
  }

  function parseBullpenUnitRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team'));
      if (!t) return;
      var osiAllowed = numOrNull(pickCol(row, 'overall_OSI_allowed', 'OSI_allowed'));
      var bullpenScore = osiAllowed != null
        ? Math.max(0, Math.min(100, 100 - osiAllowed))
        : null;
      map[t] = {
        t: t,
        osiAllowed: osiAllowed,
        bullpenScore: bullpenScore,
        abqAllowed: numOrNull(pickCol(row, 'overall_ABQ_allowed')),
        rcvAllowed: numOrNull(pickCol(row, 'overall_RCV_allowed')),
        obrAllowed: numOrNull(pickCol(row, 'overall_OBR_allowed')),
        bbPct: numOrNull(pickCol(row, 'overall_BB_pct', 'BB%', 'BB_pct')),
        fip: numOrNull(pickCol(row, 'overall_FIP', 'FIP', 'fip')),
        era: numOrNull(pickCol(row, 'overall_ERA', 'ERA', 'era')),
        hiLevEra: numOrNull(pickCol(row, 'high_leverage_ERA', 'High Leverage ERA')),
        medLevEra: numOrNull(pickCol(row, 'medium_leverage_ERA', 'Medium Leverage ERA')),
        loLevEra: numOrNull(pickCol(row, 'low_leverage_ERA')),
        woba: numOrNull(pickCol(row, 'overall_wOBA', 'wOBA')),
        vsRhhOsi: numOrNull(pickCol(row, 'vs_RHH_OSI_allowed', 'osi_allowed_vs_rhh')),
        vsLhhOsi: numOrNull(pickCol(row, 'vs_LHH_OSI_allowed', 'osi_allowed_vs_lhh')),
        oor: osiAllowed
      };
    });
    return map;
  }

  function parsePalsRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm', 'team', 'TEAM'));
      if (!t) return;
      var palsVal = numOrNull(pickCol(row, 'PALS', 'pals', 'Pals', 'APLs', 'apls', 'APL', 'apl'));
      var xfip = numOrNull(pickCol(row, 'avg_xFIP_faced', 'Avg xFIP Faced', 'avg xfip faced', 'Avg_xFIP_Faced'));
      if (xfip == null) {
        var keys = Object.keys(row || {});
        for (var i = 0; i < keys.length; i++) {
          if (/xfip/i.test(keys[i]) && /avg|faced/i.test(keys[i])) {
            xfip = numOrNull(row[keys[i]]);
            if (xfip != null) break;
          }
        }
      }
      map[t] = {
        t: t,
        osi: numOrNull(pickCol(row, 'OSI', 'osi', 'Osi')),
        pals: palsVal,
        xfip: xfip
      };
    });
    return map;
  }

  function parsePitchingRows(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
      if (!t) return;
      map[t] = {
        t: t,
        kPct: numOrNull(pickCol(row, 'K%', 'K_pct')),
        bbPct: numOrNull(pickCol(row, 'BB%', 'BB_pct')),
        hr9: numOrNull(pickCol(row, 'HR/9', 'HR9')),
        pitchScore: numOrNull(pickCol(row, 'PitchScore', 'Pitching Score'))
      };
    });
    return map;
  }

  function findSpProfile(profiles, pitcherName, team) {
    var key = normName(pitcherName);
    if (!key || key === 'tbd') return null;
    return (profiles || []).find(function(p) {
      var n = normName(pickCol(p, 'pitcher_name', 'Pitcher', 'Name'));
      var tm = teamKey(pickCol(p, 'pitcher_team', 'Team', 'Tm'));
      if (n === key) {
        if (!team || !tm) return true;
        return tm === teamKey(team);
      }
      return false;
    }) || null;
  }

  function spProfileMetrics(profile) {
    if (!profile) return null;
    var kPct = numOrNull(pickCol(profile, 'K_pct', 'K%', 'k_pct'));
    var bbPct = numOrNull(pickCol(profile, 'BB_pct', 'BB%', 'bb_pct'));
    var hr9 = numOrNull(pickCol(profile, 'HR9', 'HR/9', 'hr9'));
    var pitchScore = numOrNull(profile.PitchScore);
    if (pitchScore == null) {
      pitchScore = computePitchScoreFromRates(kPct, bbPct, hr9, null);
    }
    var era = numOrNull(pickCol(profile, 'ERA', 'era'));
    var fip = numOrNull(pickCol(profile, 'FIP', 'fip'));
    if (fip == null) fip = era;
    var staleRaw = pickCol(profile, 'stale', 'staleness_flag', 'Staleness');
    var stale = staleRaw === true || staleRaw === 'True' || staleRaw === 'true' || staleRaw === '1';
    return {
      kPct: kPct,
      bbPct: bbPct,
      hr9: hr9,
      fip: fip,
      fipNa: profile.FIP_na === true,
      xfip: null,
      era: era,
      osiAllowed: numOrNull(pickCol(profile, 'OSI_allowed', 'OSI Allowed', 'osi_allowed')),
      osiAllowedL30: null,
      osiAllowedL14: null,
      abqAllowed: numOrNull(pickCol(profile, 'ABQ_allowed', 'ABQ Allowed')),
      rcvAllowed: numOrNull(pickCol(profile, 'RCV_allowed', 'RCV Allowed')),
      obrAllowed: numOrNull(pickCol(profile, 'OBR_allowed', 'OBR Allowed')),
      pitchScore: pitchScore,
      oor: numOrNull(pickCol(profile, 'OOR', 'oor')),
      stale: stale,
      l14Drift: stale ? 'Stale' : null,
      l14Note: 'L14 requires pipeline data'
    };
  }

  function palsStatus(teamOsi, palsVal) {
    if (palsVal == null || teamOsi == null) return { label: 'Unconfirmed', cls: 'pals-neutral' };
    var gap = teamOsi - palsVal;
    if (Math.abs(gap) < 5) return { label: 'Confirmed', cls: 'pals-confirmed' };
    if (gap >= 8) return { label: 'Inflated', cls: 'pals-inflated' };
    if (gap <= -8) return { label: 'Deflated', cls: 'pals-deflated' };
    return { label: 'Monitor', cls: 'pals-neutral' };
  }

  function metricColor(v, invert) {
    return A && A.metricColor ? A.metricColor(v, 'osi', invert) : '#71717A';
  }

  function osiTierLabel(osi) {
    if (osi == null || isNaN(osi)) return '—';
    if (osi >= 75) return 'Elite';
    if (osi >= 65) return 'Strong';
    if (osi >= 55) return 'Above Avg';
    if (osi >= 45) return 'Average';
    return 'Weak';
  }

  function lineupEdgeIndicator(lineupOsi, pitcherAllowed) {
    if (lineupOsi == null || pitcherAllowed == null) return { label: 'Even', cls: 'edge-even' };
    var diff = lineupOsi - (100 - pitcherAllowed);
    if (diff >= 6) return { label: 'Lineup Advantage', cls: 'edge-lineup' };
    if (diff <= -6) return { label: 'Pitcher Advantage', cls: 'edge-pitcher' };
    return { label: 'Even', cls: 'edge-even' };
  }

  function bullpenRisk(unit) {
    if (!unit || unit.osiAllowed == null) return { label: 'Unknown', cls: 'risk-mid' };
    if (unit.osiAllowed <= 48) return { label: 'Strong', cls: 'risk-good' };
    if (unit.osiAllowed >= 58) return { label: 'Weak', cls: 'risk-bad' };
    if (unit.hiLevEra != null && unit.loLevEra != null && unit.hiLevEra > unit.loLevEra + 1.5) {
      return { label: 'Volatile', cls: 'risk-vol' };
    }
    return { label: 'Average', cls: 'risk-mid' };
  }

  function bullpenPitchScore(unit) {
    if (!unit) return null;
    if (unit.bullpenScore != null) return unit.bullpenScore;
    if (unit.osiAllowed == null) return null;
    return Math.max(0, Math.min(100, 100 - unit.osiAllowed));
  }

  function parkFactor(team) {
    var pf = global.MLBMA_CONFIG && MLBMA_CONFIG.PARK_FACTORS;
    if (!pf) return 1;
    return pf[teamKey(team)] != null ? pf[teamKey(team)] : 1;
  }

  function parkImpactLabel(factor, weather) {
    if (weather && weather.dome) return { label: 'Dome', detail: 'Indoor — weather neutralized' };
    if (factor >= 1.1) return { label: "Hitter's park", detail: 'Elevated run environment' };
    if (factor <= 0.95) return { label: "Pitcher's park", detail: 'Suppressed run environment' };
    if (weather && weather.wind != null && weather.wind >= 12) return { label: 'Wind-aided over lean', detail: 'Strong wind may carry flies' };
    return { label: 'Neutral', detail: 'Typical run environment' };
  }

  function recordHtml(team) {
    return global.MLBMAStandings ? MLBMAStandings.recordHtml(team) : '';
  }

  function teamLogo(team, px) {
    return A ? A.teamLogoImg(team, px || 40) : '';
  }

  function headshot(name, px, opts) {
    if (!A) return '';
    var o = Object.assign({ crop: 'compare', className: 'compare-headshot' }, opts || {});
    if (px) o.size = px;
    return A.pitcherAvatar(name, o);
  }

  function extractWindowOSI(val) {
    if (val == null || val === '') return null;
    var n = parseFloat(val);
    if (!isNaN(n)) return n;
    if (typeof val === 'string') {
      var m = val.match(/OSI[\s":]+([0-9.]+)/i);
      if (m) return parseFloat(m[1]);
    }
    return null;
  }

  function parseTeamProfilesMap(rows) {
    var map = {};
    (rows || []).forEach(function(row) {
      var t = teamKey(pickCol(row, 'team', 'Tm', 'Team'));
      if (!t) return;
      var prof = {
        osi_ytd: extractWindowOSI(pickCol(row, 'osi_ytd', 'OSI_YTD', 'osi', 'OSI')),
        osi_l30: extractWindowOSI(pickCol(row, 'osi_l30', 'OSI_L30', 'L30_OSI')),
        osi_l14: extractWindowOSI(pickCol(row, 'osi_l14', 'OSI_L14', 'L14_OSI')),
        osi_l7: extractWindowOSI(pickCol(row, 'osi_l7', 'OSI_L7', 'L7_OSI')),
        osi: extractWindowOSI(pickCol(row, 'osi', 'OSI', 'osi_ytd', 'OSI_YTD')),
        abq: numOrNull(pickCol(row, 'abq', 'ABQ')),
        rcv: numOrNull(pickCol(row, 'rcv', 'RCV')),
        obr: numOrNull(pickCol(row, 'obr', 'OBR')),
        avg_pitching_score: numOrNull(pickCol(row, 'avg_pitching_score', 'avg pitching score', 'avg_pitchscore', 'Avg Pitching Score', 'Pitch Score Against')),
        avg_ip_per_start: numOrNull(pickCol(row, 'avg_ip_per_start', 'avg ip per start', 'avg_ip', 'Avg IP Per Start')),
        qs_against_pct: numOrNull(pickCol(row, 'qs_against_pct', 'QS_Against_Pct', 'QS% Allowed', 'qs against pct')),
        qs_against: numOrNull(pickCol(row, 'qs_against', 'QS_Against', 'qs against'))
      };
      ['home', 'away'].forEach(function(loc) {
        ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
          var key = loc + '_' + m;
          prof[key] = numOrNull(pickCol(row, key, key.toUpperCase()));
        });
      });
      ['abq', 'rcv', 'obr'].forEach(function(m) {
        ['l30', 'l14', 'l7'].forEach(function(w) {
          prof[m + '_' + w] = numOrNull(pickCol(row, m + '_' + w, m.toUpperCase() + '_' + w.toUpperCase(), w + '_' + m));
        });
      });
      map[t] = prof;
    });
    return map;
  }

  function lineupStoreFromScored(scR, scL, teamProfiles, scVsSp, scVsRp, palsByTeam, resultsByTeam) {
    var both = blendSplits(scR, scL);
    var home = [];
    var away = [];
    Object.keys(teamProfiles || {}).forEach(function(t) {
      var p = teamProfiles[t];
      if (!p) return;
      var h = { t: t };
      var a = { t: t };
      var hasH = false;
      var hasA = false;
      ['osi', 'abq', 'rcv', 'obr', 'wrc', 'woba', 'xwoba', 'slg'].forEach(function(m) {
        var hv = numOrNull(p['home_' + m]);
        var av = numOrNull(p['away_' + m]);
        if (hv != null) { h[m] = hv; hasH = true; }
        if (av != null) { a[m] = av; hasA = true; }
      });
      if (hasH) {
        if (h.abq != null && h.rcv != null) h.ppGap = h.abq - h.rcv;
        if (h.projOSI == null && h.osi != null) h.projOSI = h.osi;
        home.push(_backfillXwoba(h));
      }
      if (hasA) {
        if (a.abq != null && a.rcv != null) a.ppGap = a.abq - a.rcv;
        if (a.projOSI == null && a.osi != null) a.projOSI = a.osi;
        away.push(_backfillXwoba(a));
      }
    });
    return {
      scR: scR || [],
      scL: scL || [],
      scBoth: both || [],
      scHome: home,
      scAway: away,
      scVsSp: scVsSp || [],
      scVsRp: scVsRp || [],
      teamProfiles: teamProfiles || {},
      palsByTeam: palsByTeam || {},
      resultsByTeam: resultsByTeam || {}
    };
  }

  var _lineupModelCache = null;
  var _lineupModelInflight = null;

  function lineupModelFetchAll(options) {
    options = options || {};
    if (!options.forceRefresh && _lineupModelCache) return Promise.resolve(_lineupModelCache);
    if (!options.forceRefresh && _lineupModelInflight) return _lineupModelInflight;
    if (options.forceRefresh) clearSheetTabCache();
    var tabs = global.MLBMA_CONFIG && global.MLBMA_CONFIG.SHEET_TABS;
    if (!tabs) return Promise.reject(new Error('SHEET_TABS missing'));
    _lineupModelInflight = Promise.all([
      fetchSheetTab(tabs.vs_rhp, options),
      fetchSheetTab(tabs.vs_lhp, options),
      fetchSheetTab(tabs.team_profiles, options),
      fetchSheetTab(tabs.batter_splits_vs_sp, options).catch(function() { return []; }),
      fetchSheetTab(tabs.batter_splits_vs_rp, options).catch(function() { return []; }),
      (tabs.pals ? fetchSheetTab(tabs.pals, options) : Promise.resolve([])).catch(function() { return []; }),
      (tabs.team_results ? fetchSheetTab(tabs.team_results, options) : Promise.resolve([])).catch(function() { return []; })
    ]).then(function(res) {
      var payload = {
        rhp: res[0] || [],
        lhp: res[1] || [],
        profiles: res[2] || [],
        splitVsSp: res[3] || [],
        splitVsRp: res[4] || [],
        pals: res[5] || [],
        teamResults: res[6] || []
      };
      _lineupModelCache = payload;
      return payload;
    }).finally(function() {
      _lineupModelInflight = null;
    });
    return _lineupModelInflight;
  }

  function lineupModelScoreRow(raw) {
    return scoreRowFromSheet(raw);
  }

  function lineupModelEnsureStore(options) {
    return lineupModelFetchAll(options).then(function(raw) {
      var scR = (raw.rhp || []).map(scoreRowFromSheet).filter(Boolean);
      var scL = (raw.lhp || []).map(scoreRowFromSheet).filter(Boolean);
      var profiles = parseTeamProfilesMap(raw.profiles || []);
      var scVsSp = aggregateTeamOffenseFromBatterRows(raw.splitVsSp || []);
      var scVsRp = aggregateTeamOffenseFromBatterRows(raw.splitVsRp || []);
      var palsByTeam = parsePalsRows(raw.pals || []);
      var resultsByTeam = parseTeamResultsMap(raw.teamResults || []);
      return lineupStoreFromScored(scR, scL, profiles, scVsSp, scVsRp, palsByTeam, resultsByTeam);
    });
  }

  function lineupModelResolve(team, filter, options) {
    return lineupModelEnsureStore(options).then(function(store) {
      var f = normalizeFilter(filter || {});
      var rows = resolveLineupRows(store, f);
      var tk = teamKey(team);
      var row = (rows || []).find(function(r) { return teamKey(r.t) === tk; }) || null;
      if (!row) return null;
      return Object.assign({ approx: false }, row);
    });
  }

  function _leadMetricForFamily(family) {
    if (family === 'surface') return 'winPct';
    if (family === 'difficulty') return 'abq';
    if (family === 'status') return 'osi';
    return 'osi';
  }

  function lineupModelRankAll(filter, family, options) {
    return lineupModelEnsureStore(options).then(function(store) {
      var f = normalizeFilter(filter || {});
      var resolved = resolveLineupRows(store, f, {
        includeMeta: !!(options && options.includeMeta),
        debugSource: !!(options && options.debugSource)
      });
      var rows = ((resolved && resolved.rows) ? resolved.rows : resolved).slice();
      var lead = _leadMetricForFamily(String(family || 'scoring').toLowerCase());
      rows.sort(function(a, b) {
        var av = numOrNull(a[lead]);
        var bv = numOrNull(b[lead]);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
      var ranked = rows.map(function(r, i) {
        var pct = rows.length > 1 ? Math.round(((rows.length - (i + 1)) / (rows.length - 1)) * 100) : 100;
        return Object.assign({ rank: i + 1, pct: pct }, r);
      });
      if (options && options.includeMeta) {
        return { rows: ranked, meta: resolved && resolved.meta ? resolved.meta : {} };
      }
      return ranked;
    });
  }

  function lineupModelWindowDelta(team, metric, filter, options) {
    var f = normalizeFilter(filter || {});
    return Promise.all([
      lineupModelResolve(team, f, options),
      lineupModelResolve(team, Object.assign({}, f, { window: 'YTD' }), options)
    ]).then(function(res) {
      var cur = res[0];
      var ytd = res[1];
      if (!cur || !ytd) return null;
      var m = String(metric || 'osi');
      var a = numOrNull(cur[m]);
      var b = numOrNull(ytd[m]);
      if (a == null || b == null) return null;
      return a - b;
    });
  }

  function lineupModelLeaguePool(metric, options) {
    var f = createFilterState({ hand: 'both', location: 'all', pitcher: 'both', batSide: 'both', segment: 'full', window: 'YTD' });
    return lineupModelRankAll(f, 'scoring', options).then(function(rows) {
      var vals = (rows || []).map(function(r) { return numOrNull(r[metric]); }).filter(function(v) { return v != null && !isNaN(v); });
      if (!vals.length) return { mean: null, sd: null, values: [] };
      var mean = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
      var variance = vals.reduce(function(acc, v) { return acc + Math.pow(v - mean, 2); }, 0) / vals.length;
      return { mean: mean, sd: Math.sqrt(variance), values: vals };
    });
  }

  var LineupModel = {
    fetchAll: lineupModelFetchAll,
    ensureStore: lineupModelEnsureStore,
    scoreRow: lineupModelScoreRow,
    blendSplits: blendSplits,
    resolve: lineupModelResolve,
    rankAll: lineupModelRankAll,
    windowDelta: lineupModelWindowDelta,
    leaguePool: lineupModelLeaguePool,
    clearCache: function() {
      _lineupModelCache = null;
      _lineupModelInflight = null;
      clearSheetTabCache();
    }
  };

  global.MLBMASharedMatchup = {
    esc: esc,
    numOrNull: numOrNull,
    pickCol: pickCol,
    teamKey: teamKey,
    createFilterState: createFilterState,
    normalizeFilter: normalizeFilter,
    filterKey: filterKey,
    createScopeState: createScopeState,
    normName: normName,
    fetchSheetTab: fetchSheetTab,
    clearSheetTabCache: clearSheetTabCache,
    parseCsvText: parseCsvText,
    parseLineupRows: parseLineupRows,
    parseLineup: parseLineup,
    platoonHighlight: platoonHighlight,
    platoonHighlightClass: platoonHighlightClass,
    buildLineupTable: buildLineupTable,
    parseWeatherString: parseWeatherString,
    parseWeatherRow: parseWeatherRow,
    parseWeatherMap: parseWeatherMap,
    weatherBadge: weatherBadge,
    pctDecimal: pctDecimal,
    computePitchScoreFromRates: computePitchScoreFromRates,
    enrichSpProfiles: enrichSpProfiles,
    buildOorByTeam: buildOorByTeam,
    pitcherOorFromTeamHand: pitcherOorFromTeamHand,
    gamescriptBadge: gamescriptBadge,
    f5Badge: f5Badge,
    splitOSI: splitOSI,
    scoreRowFromSheet: scoreRowFromSheet,
    findScoreRow: findScoreRow,
    handMetricRatios: handMetricRatios,
    applyHandMetricRatios: applyHandMetricRatios,
    aggregateTeamOffenseFromBatterRows: aggregateTeamOffenseFromBatterRows,
    scaleRowMetrics: scaleRowMetrics,
    blendSplits: blendSplits,
    resolveLineupRows: resolveLineupRows,
    parseMatchupRows: parseMatchupRows,
    parseBullpenUnitRows: parseBullpenUnitRows,
    parsePalsRows: parsePalsRows,
    parsePitchingRows: parsePitchingRows,
    findSpProfile: findSpProfile,
    spProfileMetrics: spProfileMetrics,
    palsStatus: palsStatus,
    metricColor: metricColor,
    osiTierLabel: osiTierLabel,
    lineupEdgeIndicator: lineupEdgeIndicator,
    bullpenRisk: bullpenRisk,
    bullpenPitchScore: bullpenPitchScore,
    pitchTier: pitchTier,
    parkFactor: parkFactor,
    parkImpactLabel: parkImpactLabel,
    recordHtml: recordHtml,
    teamLogo: teamLogo,
    headshot: headshot,
    matchupGameKey: matchupGameKey,
    normalizeGameKey: normalizeGameKey
  };
  global.LineupModel = LineupModel;
  global.MLBMALineupModel = LineupModel;
})(typeof window !== 'undefined' ? window : this);
