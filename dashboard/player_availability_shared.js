/* Matchup player selection from the fixture's published availability. */
(function (global) {
  'use strict';

  function nameOf(player) {
    if (typeof player === 'string') return player;
    return player && (player.player_name || player.name || player.player || player.Name) || '';
  }

  function playerId(player) {
    return player && (player.player_id || player.athlete_id) || '';
  }

  function nameParts(player) {
    var parts = nameOf(player).replace(/\s*\(\d+\).*$/, '').normalize('NFKD')
      .toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/['’.-]/g, '')
      .match(/[a-z0-9]+/g) || [];
    if (parts.length > 2 && /^(jr|sr|ii|iii|iv|v)$/.test(parts[parts.length - 1])) parts.pop();
    return parts;
  }

  function isOut(status) {
    var key = String(status || '').trim().toLowerCase().replace(/[-_]+/g, ' ');
    if (/^out\b.*\b(?:1st|first)\s+half\b/.test(key)) return false;
    return /^(out|inactive|ruled out|suspended|suspension)\b/.test(key) ||
      /^(ir|il|ofs|pup|nfi|dnp|injured reserve|injured list|did not play|physically unable to perform|non football (injury|illness))(?:\s|\b|$)/.test(key);
  }

  function samePosition(player, entry) {
    return !player.position || !entry.position || player.position === entry.position;
  }

  function designation(game, side, player) {
    var report = game[side + '_cbb_availability'] || (game[side + '_injuries'] || {}).players ||
      game[side + '_availability_list'] || [];
    var id = playerId(player);
    var byId = id && report.find(function (entry) { return String(playerId(entry)) === String(id); });
    if (byId) return byId;
    var parts = nameParts(player);
    if (!parts.length) return null;
    var abbreviated = [];
    for (var i = 0; i < report.length; i++) {
      var entry = report[i];
      if (id && playerId(entry)) continue;
      var other = nameParts(entry);
      if (parts.join('') === other.join('')) return entry;
      if (parts.length >= 2 && other.length >= 2 && samePosition(player, entry) &&
          (parts[0].length === 1 || other[0].length === 1) && parts[0][0] === other[0][0] &&
          parts.slice(1).join('') === other.slice(1).join('')) abbreviated.push(entry);
    }
    return abbreviated.length === 1 ? abbreviated[0] : null;
  }

  function status(game, side, player) {
    var entry = designation(game, side, player);
    if (entry && entry.status) return entry.status;
    if ((game[side + '_injuries'] || {}).coverage === 'official' ||
        game[side + '_injury_coverage'] === 'official') return '';
    return (player && (player.injury_status || player.status)) || '';
  }

  function available(game, side, players) {
    return (players || []).filter(function (p) { return p && !isOut(status(game, side, p)); });
  }

  function nflStarter(game, side, position) {
    function atPosition(p) { return p && p.position === position && nameOf(p); }
    function eligible(players) {
      return available(game, side, players).find(function (p) {
        return !/^doubtful\b/i.test(status(game, side, p));
      });
    }
    var depth = (game[side + '_players'] || []).filter(atPosition).sort(function (a, b) {
      return (a.depth_rank || 99) - (b.depth_rank || 99);
    });
    var offense = (game[side + '_lineups'] || {}).offense || {};
    var starters = (offense.players || []).filter(atPosition);
    var selected = eligible(depth) || eligible(starters);
    if (selected || depth.length || starters.length || position !== 'QB') return selected || null;
    var published = { name: game[side + '_starter'], position: position };
    return published.name ? eligible([published]) || null : null;
  }

  function nflSummary(players) {
    var statuses = [['Out', 'out'], ['Inactive', 'inactive'], ['Doubtful', 'doubtful'],
      ['Questionable', 'questionable'], ['Did Not Practice', 'DNP'], ['Limited Practice', 'limited']];
    var summary = statuses.map(function (status) {
      var count = players.filter(function (player) { return player.status === status[0]; }).length;
      return count ? count + ' ' + status[1] : '';
    }).filter(Boolean);
    var reserve = players.filter(function (player) {
      return isOut(player.status) && !/^(Out|Inactive)$/.test(player.status);
    }).length;
    if (reserve) summary.push(reserve + ' reserve/suspended');
    return summary.join(' · ') || (players.length ? players.length + ' listed' : 'No designations listed');
  }

  function applyNflReport(game, side, report, snapshot) {
    var saved = { away_availability_list: snapshot };
    var players = report.players.map(function (player) {
      var prior = designation(saved, 'away', player) || {};
      return Object.assign({}, player, {
        status: game.game_state === 'final' && /^(?:Out|Doubtful|Questionable)$/.test(prior.status || '') &&
          /Practice/.test(player.status) ? prior.status : player.status,
        value: prior.value, value_recent: prior.value_recent, missed: prior.missed
      });
    });
    (snapshot || []).forEach(function (player) {
      var durable = /^(ir|injured reserve|pup|suspended|suspension|non.football)\b/i.test(player.status);
      if ((report.coverage !== 'official' || (durable && !report.has_roster_updates)) &&
          !designation({ away_availability_list: players }, 'away', player)) players.push(player);
    });
    game[side + '_availability_list'] = players;
    game[side + '_injury_coverage'] = report.coverage;
    game[side + '_availability'] = nflSummary(players);
  }

  function nflReport(game, signal) {
    var source = game.scheme_source || {};
    var query = new URLSearchParams({ game: game.id, away: game.away, home: game.home,
      kickoff: game.kickoff_utc, season: source.season || '',
      week: game.week || source.week || '' });
    return fetch('/api/nfl-availability?' + query, { cache: 'no-store', signal: signal }).then(function (response) {
      if (!response.ok) throw new Error('Availability request failed');
      return response.json();
    });
  }

  function watch(check, update, shouldContinue) {
    var timer, controller, stopped = false, paused = false, started = false;
    function run() {
      global.clearTimeout(timer);
      if (stopped || paused || global.document.hidden || controller) return;
      started = true;
      controller = new AbortController();
      Promise.resolve().then(function () { return check(controller.signal); }).then(function (data) {
        if (!stopped) update(data);
      }, function () {
        if (!stopped && !paused) update({ status: 'unavailable' });
      }).finally(function () {
        controller = null;
        if (!stopped && !paused && !global.document.hidden && shouldContinue()) {
          timer = global.setTimeout(run, 60000);
        }
      });
    }
    function visible() {
      if (!global.document.hidden && (!started || shouldContinue())) run();
    }
    function suspend() {
      paused = true;
      global.clearTimeout(timer);
    }
    function resume(event) {
      paused = false;
      if (event.persisted) run();
    }
    global.document.addEventListener('visibilitychange', visible);
    global.addEventListener('focus', visible);
    global.addEventListener('pagehide', suspend);
    global.addEventListener('pageshow', resume);
    run();
    return function () {
      stopped = true;
      suspend();
      if (controller) controller.abort();
      global.document.removeEventListener('visibilitychange', visible);
      global.removeEventListener('focus', visible);
      global.removeEventListener('pagehide', suspend);
      global.removeEventListener('pageshow', resume);
    };
  }

  global.ChasePlayerAvailability = {
    available: available, designation: designation, status: status, isOut: isOut,
    nflStarter: nflStarter, nflSummary: nflSummary, applyNflReport: applyNflReport, nflReport: nflReport, watch: watch
  };
})(window);
