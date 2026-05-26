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

  function fetchSheetTab(tabName) {
    var sid = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_ID;
    if (!sid) return Promise.reject(new Error('no sheet id'));
    var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) { /* ignore */ } }, 15000) : null;
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function(r) {
      if (!r.ok) throw new Error('fetch ' + tabName);
      return r.text();
    }).then(parseCsvText).finally(function() {
      if (timer) clearTimeout(timer);
    });
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

  var _scoreRowLogged = false;

  function scoreRowFromSheet(row) {
    if (!_scoreRowLogged && row && typeof row === 'object') {
      _scoreRowLogged = true;
      console.log('[SCORE] extracting row, available columns:', Object.keys(row));
    }
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
    var woba = parseFloat(row['wOBA'] || row['woba'] || row['woba_rhp'] || 0) || null;
    var xwoba = parseFloat(row['xwOBA'] || row['xwoba'] || 0) || null;
    var slg = parseFloat(row['SLG'] || row['slg'] || 0) || null;
    var wrc = parseFloat(row['wRC+'] || row['wrc_plus'] || row['wRC'] || 0) || null;
    if (woba === 0) woba = null;
    if (xwoba === 0) xwoba = null;
    if (slg === 0) slg = null;
    if (wrc === 0) wrc = null;
    if (xwoba == null && woba != null) xwoba = woba;
    return {
      t: t, abq: abq, rcv: rcv, obr: obr, osi: osi,
      projOSI: projOSI, reg_signal: reg, reg: reg, ppGap: ppGap,
      wrc: wrc, woba: woba, xwoba: xwoba, slg: slg
    };
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
      var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
      if (!t) return;
      map[t] = {
        t: t,
        osi: numOrNull(pickCol(row, 'OSI', 'osi')),
        pals: numOrNull(pickCol(row, 'PALS', 'pals'))
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

  global.MLBMASharedMatchup = {
    esc: esc,
    numOrNull: numOrNull,
    pickCol: pickCol,
    teamKey: teamKey,
    normName: normName,
    fetchSheetTab: fetchSheetTab,
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
})(typeof window !== 'undefined' ? window : this);
