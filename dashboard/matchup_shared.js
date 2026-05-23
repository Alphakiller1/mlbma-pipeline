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
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < args.length; i++) {
      var label = args[i];
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

  function parseCsvText(text) {
    var lines = String(text || '').trim().split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h) { return h.replace(/^"|"$/g, '').trim(); });
    return lines.slice(1).map(function(line) {
      var cols = line.match(/("([^"]|"")*"|[^,]*)/g) || [];
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
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('fetch ' + tabName);
      return r.text();
    }).then(parseCsvText);
  }

  function normalizeGameKey(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\u0040/g, '@');
  }

  function matchupGameKey(m) {
    if (!m) return '';
    if (m.away && m.home) return teamKey(m.away) + '@' + teamKey(m.home);
    return '';
  }

  function parseLineupRows(rows) {
    return (rows || []).map(function(row) {
      var game = String(pickCol(row, 'Game')).trim();
      var team = teamKey(pickCol(row, 'Team'));
      if (!team) return null;
      var bo = parseInt(pickCol(row, 'Bat_Order', 'Bat Order'), 10);
      if (isNaN(bo)) bo = 99;
      return {
        game: game,
        team: team,
        side: String(pickCol(row, 'Side')).trim().toUpperCase(),
        batOrder: bo,
        position: String(pickCol(row, 'Position')).trim() || '—',
        player: String(pickCol(row, 'Player')).trim() || 'TBD',
        bats: String(pickCol(row, 'Bats')).trim() || '?'
      };
    }).filter(Boolean);
  }

  /** @param {Array} lineups - parsed lineup rows @param {string} gameKey @param {string} team @param {string} [side] */
  function parseLineup(lineups, gameKey, team, side) {
    var gk = normalizeGameKey(gameKey);
    var tm = teamKey(team);
    var want = String(side || '').toUpperCase();
    function sideOk(sd) {
      sd = String(sd || '').toUpperCase();
      if (want === 'AWAY') return sd === 'AWAY' || sd === 'A' || sd === '0';
      if (want === 'HOME') return sd === 'HOME' || sd === 'H' || sd === '1';
      return true;
    }
    var primary = (lineups || []).filter(function(r) {
      return normalizeGameKey(r.game) === gk && r.team === tm && sideOk(r.side);
    });
    var rows = primary.length ? primary : (lineups || []).filter(function(r) {
      return normalizeGameKey(r.game) === gk && r.team === tm;
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
    return {
      raw: pickCol(row, 'Conditions', 'Weather', 'Summary') || '—',
      temp: numOrNull(pickCol(row, 'Temp', 'Temperature', 'temp_f')),
      wind: numOrNull(pickCol(row, 'Wind', 'Wind_Speed', 'wind_mph')),
      windDir: pickCol(row, 'Wind_Dir', 'Wind Direction', 'wind_dir') || null,
      conditions: pickCol(row, 'Conditions', 'Weather') || '—',
      dome: /dome|roof|indoor/i.test(String(pickCol(row, 'Conditions', 'Weather', 'Roof')))
    };
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

  function scoreRowFromSheet(row) {
    var t = teamKey(pickCol(row, 'Tm', 'Team', 'tm'));
    if (!t) return null;
    var abq = numOrNull(pickCol(row, 'ABQ', 'abq'));
    var rcv = numOrNull(pickCol(row, 'RCV', 'rcv'));
    var obr = numOrNull(pickCol(row, 'OBR', 'obr'));
    var osi = numOrNull(pickCol(row, 'OSI', 'osi'));
    if (abq === null || rcv === null || obr === null || osi === null) return null;
    return { t: t, abq: abq, rcv: rcv, obr: obr, osi: osi };
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
      var away = teamKey(pickCol(row, 'Away'));
      var home = teamKey(pickCol(row, 'Home'));
      if (!away && !home) return null;
      return {
        time: String(pickCol(row, 'Time', 'Game_Time')).trim(),
        away: away,
        home: home,
        awaySP: String(pickCol(row, 'Away_SP', 'Away SP')).trim(),
        awayHand: String(pickCol(row, 'Away_Hand', 'Away Hand')).trim().toUpperCase(),
        awayK: numOrNull(pickCol(row, 'Away_K%', 'Away K%')),
        awayBB: numOrNull(pickCol(row, 'Away_BB%', 'Away BB%')),
        awayHR9: numOrNull(pickCol(row, 'Away_HR9', 'Away HR/9')),
        awayFIP: numOrNull(pickCol(row, 'Away_FIP', 'Away FIP')),
        awayXFIP: numOrNull(pickCol(row, 'Away_xFIP', 'Away xFIP')),
        homeSP: String(pickCol(row, 'Home_SP', 'Home SP')).trim(),
        homeHand: String(pickCol(row, 'Home_Hand', 'Home Hand')).trim().toUpperCase(),
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
      map[t] = {
        t: t,
        osiAllowed: numOrNull(pickCol(row, 'overall_OSI_allowed', 'OSI_allowed')),
        abqAllowed: numOrNull(pickCol(row, 'overall_ABQ_allowed')),
        rcvAllowed: numOrNull(pickCol(row, 'overall_RCV_allowed')),
        obrAllowed: numOrNull(pickCol(row, 'overall_OBR_allowed')),
        hiLevEra: numOrNull(pickCol(row, 'high_leverage_ERA', 'High Leverage ERA')),
        loLevEra: numOrNull(pickCol(row, 'low_leverage_ERA')),
        oor: numOrNull(pickCol(row, 'OOR', 'avg_opponent_OOR', 'Avg_Opponent_OOR'))
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
    return {
      kPct: numOrNull(pickCol(profile, 'K_pct', 'K%', 'k_pct')),
      bbPct: numOrNull(pickCol(profile, 'BB_pct', 'BB%', 'bb_pct')),
      hr9: numOrNull(pickCol(profile, 'HR9', 'HR/9')),
      fip: numOrNull(pickCol(profile, 'FIP', 'fip')),
      xfip: numOrNull(pickCol(profile, 'xFIP', 'xfip')),
      osiAllowed: numOrNull(pickCol(profile, 'OSI_allowed', 'OSI Allowed')),
      abqAllowed: numOrNull(pickCol(profile, 'ABQ_allowed', 'ABQ Allowed')),
      rcvAllowed: numOrNull(pickCol(profile, 'RCV_allowed')),
      obrAllowed: numOrNull(pickCol(profile, 'OBR_allowed')),
      oor: numOrNull(pickCol(profile, 'OOR', 'avg_opponent_OOR', 'Avg_Opponent_OOR')),
      staleness: pickCol(profile, 'staleness_flag', 'Staleness', 'staleness'),
      l14Drift: numOrNull(pickCol(profile, 'L14_drift', 'l14_drift'))
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
    if (!unit || unit.osiAllowed == null) return null;
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
    return A.pitcherAvatar(name, px || 64, Object.assign({ cls: 'compare-headshot' }, opts || {}));
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
    weatherBadge: weatherBadge,
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
