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
    return (designation(game, side, player) || {}).status ||
      (player && (player.injury_status || player.status)) || '';
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

  global.ChasePlayerAvailability = {
    available: available, designation: designation, status: status, isOut: isOut, nflStarter: nflStarter
  };
})(window);
