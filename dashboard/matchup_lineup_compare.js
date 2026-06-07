/**
 * Lineup card comparison — player stats with split/window toggles (LvL pane).
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var A = global.MLBMAAssets;

  var SPLIT_OPTIONS = [
    { id: 'tonight', label: 'Tonight' },
    { id: 'rhp', label: 'vs RHP' },
    { id: 'lhp', label: 'vs LHP' },
    { id: 'road', label: 'Road' },
    { id: 'home', label: 'Home' }
  ];

  var WINDOW_OPTIONS = [
    { id: 'l7', label: 'L7' },
    { id: 'l14', label: 'L14' },
    { id: 'l30', label: 'L30' },
    { id: 'ytd', label: 'YTD' }
  ];

  var STAT_COLS = [
    { key: 'wrc', label: 'wRC+', ctx: 'wrc', decimals: 0 },
    { key: 'ops', label: 'OPS', ctx: 'ops', decimals: 3 },
    { key: 'woba', label: 'wOBA', ctx: 'woba', decimals: 3 },
    { key: 'slg', label: 'SLG', ctx: 'slg', decimals: 3 }
  ];

  var NAME_SUFFIXES = { jr: 1, sr: 1, ii: 1, iii: 1, iv: 1, v: 1 };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pick(row) {
    if (!row || !S || !S.pickCol) return null;
    return S.pickCol.apply(S, arguments);
  }

  function normNameLocal(s) {
    return S && S.normName ? S.normName(s) : String(s || '').toLowerCase().trim();
  }

  function nameParts(name) {
    var parts = normNameLocal(name).split(' ').filter(Boolean);
    while (parts.length > 1 && NAME_SUFFIXES[parts[parts.length - 1]]) {
      parts.pop();
    }
    return parts;
  }

  function lastName(name) {
    var parts = nameParts(name);
    return parts.length ? parts[parts.length - 1] : normNameLocal(name);
  }

  function firstNamePart(name) {
    var parts = nameParts(name);
    return parts.length ? parts[0] : '';
  }

  function firstInitial(name) {
    var raw = String(name || '').trim();
    var dot = raw.match(/^([A-Za-z])\./);
    if (dot) return dot[1].toLowerCase();
    var first = firstNamePart(name);
    return first ? first.charAt(0) : '';
  }

  function batterNamesMatch(lineupName, sheetName) {
    var na = normNameLocal(lineupName);
    var nb = normNameLocal(sheetName);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (lastName(lineupName) !== lastName(sheetName)) return false;
    var init = firstInitial(lineupName);
    if (init) {
      var sheetFirst = firstNamePart(sheetName);
      if (sheetFirst && sheetFirst.charAt(0) !== init) return false;
    }
    return true;
  }

  function findRegistryEntry(name, team) {
    if (!A || !A.registry || !A.registry.byId) return null;
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').trim().toUpperCase();
    var ln = lastName(name);
    var init = firstInitial(name);
    var best = null;
    var bestScore = 0;
    Object.keys(A.registry.byId).forEach(function(id) {
      var entry = A.registry.byId[id];
      if (!entry || !entry.name) return;
      if (lastName(entry.name) !== ln || ln.length < 2) return;
      var score = 68;
      var entryFirst = firstNamePart(entry.name);
      if (init && entryFirst && entryFirst.charAt(0) === init) score = 88;
      if (batterNamesMatch(name, entry.name)) score = 100;
      if (entry.team && S && S.teamKey(entry.team) === tk) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    return bestScore >= 68 ? best : null;
  }

  function resolveCanonicalName(name, team) {
    if (!name) return name;
    if (A && A.lookupPlayer) {
      var hit = A.lookupPlayer(name);
      if (hit && hit.name) return hit.name;
    }
    var reg = findRegistryEntry(name, team);
    if (reg && reg.name) return reg.name;
    return name;
  }

  function scoreIndexKey(key, player, tk) {
    var parts = key.split('|');
    if (parts.length !== 2) return 0;
    var sheetNorm = parts[0];
    if (lastName(player) !== lastName(sheetNorm)) return 0;
    var score = 68;
    var sheetFirst = firstNamePart(sheetNorm);
    var init = firstInitial(player);
    if (init && sheetFirst && sheetFirst.charAt(0) === init) score = 90;
    if (batterNamesMatch(player, sheetNorm)) score = 100;
    if (parts[1] === tk) score += 12;
    else score -= 8;
    return score;
  }

  function findIndexKey(index, player, team) {
    if (!index || !player) return null;
    var tk = S && S.teamKey ? S.teamKey(team) : String(team || '').trim().toUpperCase();
    var reg = findRegistryEntry(player, team);
    var names = [player];
    var canonical = resolveCanonicalName(player, team);
    if (canonical && names.indexOf(canonical) < 0) names.push(canonical);
    if (reg && reg.name && names.indexOf(reg.name) < 0) names.push(reg.name);

    var i;
    for (i = 0; i < names.length; i++) {
      var direct = playerKey(names[i], team);
      if (index[direct]) return direct;
      if (reg && reg.team) {
        direct = playerKey(names[i], reg.team);
        if (index[direct]) return direct;
      }
    }

    var bestKey = null;
    var bestScore = 0;
    Object.keys(index).forEach(function(key) {
      if (key.indexOf('|') < 0) return;
      var score = 0;
      for (i = 0; i < names.length; i++) {
        score = Math.max(score, scoreIndexKey(key, names[i], tk));
      }
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    });
    return bestScore >= 68 ? bestKey : null;
  }

  function playerPack(index, player, team) {
    var key = findIndexKey(index, player, team);
    return key ? index[key] : null;
  }

  function playerKey(name, team) {
    var n = S && S.normName ? S.normName(name) : String(name || '').toLowerCase().trim();
    var t = S && S.teamKey ? S.teamKey(team) : String(team || '').trim().toUpperCase();
    return n + '|' + t;
  }

  function indexRows(rows, bucket, index) {
    (rows || []).forEach(function(row) {
      var name = pick(row, 'Name', 'Player', 'player_name', 'full_name');
      var team = pick(row, 'Tm', 'Team', 'team', 'team_abbr');
      if (!name || !team) return;
      if (S && S.teamKey) team = S.teamKey(team);
      var k = playerKey(name, team);
      if (!index[k]) index[k] = {};
      index[k][bucket] = row;
    });
  }

  function prepareData(raw) {
    var index = {};
    indexRows(raw.batterRhp || [], 'handR', index);
    indexRows(raw.batterLhp || [], 'handL', index);
    indexRows(raw.batterHome || [], 'home', index);
    indexRows(raw.batterAway || [], 'away', index);
    indexRows(raw.batterRecent || [], 'recent', index);
    indexRows(raw.batterOverall || [], 'overall', index);
    return { batterIndex: index };
  }

  function ratesFromRow(row) {
    if (!row) return null;
    var wrc = num(pick(row, 'wRC+', 'WRC+', 'wrc+', 'wrc', 'wRC'));
    var woba = num(pick(row, 'wOBA', 'woba', 'WOBA'));
    var slg = num(pick(row, 'SLG', 'slg'));
    var obp = num(pick(row, 'OBP', 'obp'));
    var ops = num(pick(row, 'OPS', 'ops'));
    if (ops == null && obp != null && slg != null) ops = Math.round((obp + slg) * 1000) / 1000;
    if (wrc == null && ops == null && woba == null && slg == null) return null;
    return { wrc: wrc, woba: woba, slg: slg, ops: ops };
  }

  function windowScale(prof, window) {
    if (!prof || window === 'ytd') return 1;
    var ytd = num(prof.osi_ytd) != null ? num(prof.osi_ytd) : num(prof.osi);
    if (ytd == null || Math.abs(ytd) < 0.01) return 1;
    var wKey = window === 'l30' ? 'osi_l30' : window === 'l14' ? 'osi_l14' : 'osi_l7';
    var wVal = num(prof[wKey]);
    if (wVal == null) return 1;
    return wVal / ytd;
  }

  function scaleRates(rates, scale) {
    if (!rates || scale == null || isNaN(scale) || Math.abs(scale - 1) < 0.001) return rates;
    function s(v, wrc) {
      if (v == null) return null;
      if (wrc) return Math.round(v * scale * 10) / 10;
      return Math.round(v * scale * 1000) / 1000;
    }
    return {
      wrc: s(rates.wrc, true),
      ops: s(rates.ops, false),
      woba: s(rates.woba, false),
      slg: s(rates.slg, false)
    };
  }

  function oppHandChar(hand) {
    return String(hand || '').trim().toUpperCase().charAt(0);
  }

  function splitBucketForSide(side, splitId, m) {
    if (splitId === 'rhp') return 'handR';
    if (splitId === 'lhp') return 'handL';
    if (splitId === 'road') return 'away';
    if (splitId === 'home') return 'home';
    if (splitId === 'tonight') {
      var opp = side === 'away' ? m.homeHand : m.awayHand;
      return oppHandChar(opp) === 'L' ? 'handL' : 'handR';
    }
    return 'handR';
  }

  function splitLabelForSide(side, splitId, m) {
    if (splitId === 'rhp') return 'vs RHP';
    if (splitId === 'lhp') return 'vs LHP';
    if (splitId === 'road') return side === 'away' ? 'On road' : 'Road split';
    if (splitId === 'home') return side === 'home' ? 'At home' : 'Home split';
    var opp = side === 'away' ? m.homeHand : m.awayHand;
    var h = oppHandChar(opp);
    var loc = side === 'away' ? ' · Road' : ' · Home';
    return 'vs ' + (h === 'L' ? 'LHP' : h === 'R' ? 'RHP' : 'SP') + loc;
  }

  function lookupRow(index, player, team, bucket) {
    var pack = playerPack(index, player, team);
    if (!pack) return null;
    return pack[bucket] || null;
  }

  function playerRates(index, player, team, side, splitId, window, profs, m) {
    var pack = playerPack(index, player, team);
    if (!pack) return null;
    var bucket = splitBucketForSide(side, splitId, m);
    var ytdRow = pack[bucket] || pack.overall;
    if (window === 'l30' && pack.recent) {
      var recentRates = ratesFromRow(pack.recent);
      if (recentRates && (recentRates.wrc != null || recentRates.ops != null || recentRates.woba != null)) {
        return recentRates;
      }
    }
    var ytd = ratesFromRow(ytdRow);
    if (!ytd || window === 'ytd') return ytd;
    var prof = (profs || {})[S && S.teamKey ? S.teamKey(team) : team];
    return scaleRates(ytd, windowScale(prof, window));
  }

  function teamAccentColor(team) {
    var C = global.MLBMACharts;
    if (C && typeof C.radarColorForTeam === 'function') return C.radarColorForTeam(team);
    return '#7C4DFF';
  }

  function valChip(v, ctx, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'wrc', false, decimals);
    if (v == null || isNaN(v)) return '<span class="mc-lcc-na">—</span>';
    return '<strong>' + esc(decimals != null ? Number(v).toFixed(decimals) : v) + '</strong>';
  }

  function batsHand(bats) {
    var b = String(bats || '?').trim().toUpperCase().charAt(0);
    return b === 'L' || b === 'R' || b === 'S' ? b : '?';
  }

  function platoonRowClass(bats, oppHand) {
    if (!S || !S.platoonHighlightClass) return '';
    return S.platoonHighlightClass(bats, oppHand) || '';
  }

  function batterLink(name) {
    if (S && S.batterProfileLink) return S.batterProfileLink(name);
    return esc(name || 'TBD');
  }

  function teamLogo(team, size) {
    if (S && S.teamLogo) return S.teamLogo(team, size || 24);
    return '';
  }

  function controlsHtml(state) {
    var split = state.lvSplit || 'tonight';
    var win = state.lvWin || 'ytd';
    var splitPills = SPLIT_OPTIONS.map(function(opt) {
      var on = split === opt.id;
      return '<button type="button" class="hub-pill mc-lcc-pill' + (on ? ' active' : '') + '"'
        + ' data-lcc-split="' + esc(opt.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + esc(opt.label) + '</button>';
    }).join('');
    var winPills = WINDOW_OPTIONS.map(function(opt) {
      var on = win === opt.id;
      return '<button type="button" class="hub-pill mc-lcc-pill' + (on ? ' active' : '') + '"'
        + ' data-lcc-win="' + esc(opt.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + esc(opt.label) + '</button>';
    }).join('');
    return '<div class="mc-lcc-controls hub-control-bar">'
      + '<div class="hub-ctrl-group mc-lcc-ctrl"><span class="hub-ctrl-label">Split lens</span>'
      + '<div class="hub-pill-row">' + splitPills + '</div></div>'
      + '<div class="hub-ctrl-group mc-lcc-ctrl"><span class="hub-ctrl-label">Window</span>'
      + '<div class="hub-pill-row">' + winPills + '</div></div>'
      + '</div>';
  }

  function lineupTableHtml(lineup, team, side, ctx, state) {
    var index = ctx.batterIndex || {};
    var splitId = state.lvSplit || 'tonight';
    var window = state.lvWin || 'ytd';
    var m = ctx.m;
    var oppHand = side === 'away' ? m.homeHand : m.awayHand;
    var splitLbl = splitLabelForSide(side, splitId, m);
    var head = STAT_COLS.map(function(st) {
      return '<th scope="col">' + esc(st.label) + '</th>';
    }).join('');
    if (!lineup || !lineup.length) {
      return '<div class="mc-lcc-empty">Lineup not yet confirmed</div>';
    }
    var body = lineup.slice(0, 9).map(function(r) {
      var rates = playerRates(index, r.player, team, side, splitId, window, ctx.teamProfiles, m);
      var bn = batsHand(r.bats);
      var rowCls = platoonRowClass(bn, oppHand);
      var statCells = STAT_COLS.map(function(st) {
        var v = rates ? rates[st.key] : null;
        return '<td class="mc-lcc-stat">' + valChip(v, st.ctx, st.decimals) + '</td>';
      }).join('');
      return '<tr class="mc-lcc-row' + (rowCls ? ' ' + rowCls : '') + '">'
        + '<td class="mc-lcc-bo">' + esc(r.batOrder >= 1 && r.batOrder <= 9 ? String(r.batOrder) : '—') + '</td>'
        + '<td class="mc-lcc-pos">' + esc(r.position || '—') + '</td>'
        + '<td class="mc-lcc-name">' + batterLink(r.player) + '</td>'
        + '<td class="mc-lcc-bats"><span class="bats-pill hand-' + (bn === '?' ? 'unk' : bn.toLowerCase()) + '">' + esc(bn) + '</span></td>'
        + statCells
        + '</tr>';
    }).join('');
    return '<div class="mc-lcc-split-read">' + esc(splitLbl) + ' · ' + esc(String(window).toUpperCase()) + '</div>'
      + '<div class="mc-lcc-table-wrap"><table class="mc-lcc-table">'
      + '<thead><tr><th scope="col">#</th><th scope="col">Pos</th><th scope="col">Player</th><th scope="col">B</th>' + head + '</tr></thead>'
      + '<tbody>' + body + '</tbody></table></div>';
  }

  function cardRoleLabel(side, splitId, m) {
    var role = side === 'home' ? 'Home' : 'Away';
    return role + ' · ' + splitLabelForSide(side, splitId, m);
  }

  function teamCardHtml(team, side, lineup, ctx, state) {
    var accent = teamAccentColor(team);
    var splitId = (state && state.lvSplit) || 'tonight';
    return '<div class="mc-card mc-lineup-col mc-lcc-card" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-lcc-head">'
      + teamLogo(team, 44)
      + '<div class="mc-lcc-head-text">'
      + '<span class="mc-lcc-team">' + esc(team) + '</span>'
      + '<span class="mc-lcc-role">' + esc(cardRoleLabel(side, splitId, ctx.m)) + '</span>'
      + '</div></div>'
      + lineupTableHtml(lineup, team, side, ctx, state)
      + '</div>';
  }

  function renderSection(ctx, state) {
    if (!ctx || !ctx.m) return '';
    state = state || { lvSplit: 'tonight', lvWin: 'ytd' };
    var m = ctx.m;
    var banner = ctx.lineupOk ? '' : '<div class="lineup-banner">Lineup not yet confirmed — stats may shift when orders are posted.</div>';
    return '<div class="mc-section-block mc-lineups-block mc-lcc-block">'
      + '<h2 class="mc-section-title">Projected Lineups</h2>'
      + '<p class="mc-lcc-hint ca-helper">Side-by-side projected orders with color-coded wRC+, OPS, wOBA, and SLG. '
      + 'Split lens toggles tonight\'s platoon and location context, fixed handedness, or road/home; window toggles L7, L14, L30, and YTD.</p>'
      + banner
      + controlsHtml(state)
      + '<div class="mc-grid-2 mc-lcc-duo" id="mcLccDuo">'
      + teamCardHtml(m.away, 'away', ctx.awayLineup, ctx, state)
      + teamCardHtml(m.home, 'home', ctx.homeLineup, ctx, state)
      + '</div></div>';
  }

  function refreshCards(root, ctx, state) {
    var duo = root.querySelector('#mcLccDuo');
    if (!duo || !ctx || !ctx.m) return;
    var m = ctx.m;
    duo.innerHTML = teamCardHtml(m.away, 'away', ctx.awayLineup, ctx, state)
      + teamCardHtml(m.home, 'home', ctx.homeLineup, ctx, state);
  }

  function bindControls(root, ctx, state, onChange) {
    root.querySelectorAll('[data-lcc-split]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvSplit = btn.getAttribute('data-lcc-split') || 'tonight';
        root.querySelectorAll('[data-lcc-split]').forEach(function(b) {
          var on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        refreshCards(root, ctx, state);
        if (onChange) onChange(state);
      };
    });
    root.querySelectorAll('[data-lcc-win]').forEach(function(btn) {
      btn.onclick = function() {
        state.lvWin = btn.getAttribute('data-lcc-win') || 'ytd';
        root.querySelectorAll('[data-lcc-win]').forEach(function(b) {
          var on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        refreshCards(root, ctx, state);
        if (onChange) onChange(state);
      };
    });
  }

  global.MatchupLineupCompare = {
    prepareData: prepareData,
    renderSection: renderSection,
    refreshCards: refreshCards,
    bindControls: bindControls,
    SPLIT_OPTIONS: SPLIT_OPTIONS,
    WINDOW_OPTIONS: WINDOW_OPTIONS
  };
})(typeof window !== 'undefined' ? window : this);
