/** Public matchup desk — factual MLB/NFL cards, expansion, and slate loading. */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function query() {
    try { return new URLSearchParams(global.location.search || ''); }
    catch (err) { return new URLSearchParams(); }
  }

  function easternDateIso(date) {
    return (date || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  function shiftIso(iso, amount) {
    var parts = String(iso || easternDateIso()).split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function longDate(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3) return 'Date unavailable';
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 16)).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC'
    });
  }

  /* Day and time, nothing else. The date was redundant on a slate that is
     already scoped to one day, and the published kickoff_display carried
     whatever the source felt like ("Sun, Sep 9 · night"). */
  function clock(iso) {
    var date = new Date(iso || '');
    if (!iso || isNaN(date.getTime())) return '';
    var day = date.toLocaleDateString('en-US', {
      weekday: 'long', timeZone: 'America/New_York'
    });
    var time = date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    });
    return day + ' · ' + time + ' ET';
  }

  function teamName(sport, abbr, supplied) {
    var registry = global.ChasePublicSportRegistry;
    if (registry && registry.teamName) return registry.teamName(sport, abbr, supplied);
    return supplied || abbr || 'Team unavailable';
  }

  function logoKey(sport, abbr) {
    var registry = global.ChasePublicSportRegistry;
    return registry && registry.logoKey ? registry.logoKey(sport, abbr) : abbr;
  }

  function logoHtml(sport, abbr, supplied, size, className) {
    var name = teamName(sport, abbr, supplied);
    var key = logoKey(sport, abbr);
    if (global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      return MLBMAAssets.teamLogoImg(key, size || 48, className || 'ca-matchup-logo', sport)
        .replace('alt="' + esc(String(key || '').toUpperCase()) + '"', 'alt="' + esc(name) + ' logo"');
    }
    return '<span class="ca-team-logo-placeholder" aria-hidden="true"></span>';
  }

  /* Baseball headshots resolve from a person id; football ones arrive as a
     published URL, because the league hosts them under an opaque asset hash
     rather than anything derivable from the player. Both land in the same
     frame. */
  function headshot(id, name, url) {
    var src = url || null;
    if (!src && id && global.MLBMAAssets && MLBMAAssets.headshotUrl) {
      src = MLBMAAssets.headshotUrl(id, 40, 'matchup');
    }
    if (src) {
      return '<img class="ca-matchup-card__shot" src="' + esc(src) +
        '" width="40" height="40" alt="' + esc(name || 'Probable starter') + '" loading="lazy" decoding="async">';
    }
    return '<span class="ca-matchup-card__shot ca-matchup-card__shot--empty" aria-hidden="true"></span>';
  }

  function gameStateLabel(state) {
    var value = String(state || 'scheduled').toLowerCase();
    if (value === 'live') return { label: 'Live', tone: 'is-live' };
    if (value === 'final') return { label: 'Final', tone: 'is-final' };
    if (value === 'postponed') return { label: 'Postponed', tone: 'is-watch' };
    if (value === 'delayed') return { label: 'Delayed', tone: 'is-watch' };
    return { label: 'Scheduled', tone: 'is-muted' };
  }

  function lineupLabel(value) {
    var state = String(value || '').toLowerCase();
    if (state.indexOf('confirm') >= 0) return { label: 'Confirmed', tone: 'is-ok' };
    if (state.indexOf('project') >= 0 || state.indexOf('expected') >= 0) return { label: 'Expected', tone: 'is-muted' };
    if (state.indexOf('partial') >= 0) return { label: 'Partial', tone: 'is-watch' };
    return { label: 'Not published', tone: 'is-muted' };
  }

  function safeNumber(value, digits) {
    if (value == null || value === '') return '';
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits == null ? 2 : digits) : '';
  }

  function sideValue(game, side, suffix, fallback) {
    var value = game[side + '_' + suffix];
    return value == null || value === '' ? fallback : value;
  }

  /* Designations that take a quarterback off the field. Questionable does not:
     a questionable QB1 still starts far more often than not, so the card names
     him and shows the designation rather than promoting his backup. */
  var UNAVAILABLE = { out: 1, doubtful: 1, 'injured reserve': 1, ir: 1, pup: 1,
    suspension: 1, suspended: 1, 'non football injury': 1 };

  /* The card always names a quarterback. Every club has a depth chart, so
     "not published" was never the truth - it meant nobody had looked past the
     first field. The published depth order is walked in order and the first
     quarterback not ruled out is the one who takes the snap, with his own
     designation shown beside him if he carries one. */
  function quarterback(game, side) {
    var players = game[side + '_players'] || [];
    var designations = {};
    (game[side + '_availability_list'] || []).forEach(function (entry) {
      designations[String(entry.name || '').toLowerCase()] = entry.status;
    });
    var arms = players.filter(function (pl) { return pl.position === 'QB'; })
      .sort(function (a, b) { return (a.depth_rank || 99) - (b.depth_rank || 99); });
    for (var i = 0; i < arms.length; i++) {
      var status = designations[String(arms[i].name || '').toLowerCase()];
      if (status && UNAVAILABLE[String(status).toLowerCase()]) continue;
      return {
        name: arms[i].name,
        depth: arms[i].depth_rank,
        headshot: arms[i].headshot_url,
        status: status || '',
        // Say so when the man taking the snap is not the man at the top of the
        // chart; that is the fact a reader wants, not the depth number.
        promoted: arms[i].depth_rank > 1
      };
    }
    var named = game[side + '_starter'];
    return named ? { name: named, depth: null, headshot: null, status: '', promoted: false } : null;
  }

  function starterName(game, side, sport) {
    if (sport === 'nfl') {
      var qb = quarterback(game, side);
      return qb ? qb.name : 'Quarterback Not Published';
    }
    return sideValue(game, side, 'starter', 'Probable Starter Not Published');
  }

  function starterMeta(game, side, sport) {
    if (sport === 'nfl') {
      var qb = quarterback(game, side);
      if (!qb) return '';
      if (qb.status) return 'QB' + (qb.depth || 1) + ' · ' + qb.status;
      if (qb.promoted) return 'QB' + qb.depth + ' · Starting';
      return 'QB1';
    }
    var bits = [];
    var hand = String(sideValue(game, side, 'hand', '')).toUpperCase();
    if (hand === 'R' || hand === 'RHP') bits.push('RHP');
    if (hand === 'L' || hand === 'LHP') bits.push('LHP');
    var wl = sideValue(game, side, 'starter_record', '');
    if (wl) bits.push(String(wl));
    return bits.join(' · ');
  }

  function conditions(game) {
    if (game.conditions) return game.conditions;
    return [game.weather_temp ? game.weather_temp + '°' : '', game.weather_cond, game.weather_wind]
      .filter(Boolean).join(' · ') || 'Conditions Not Published';
  }

  function venue(game) {
    return [game.venue, game.venue_city].filter(Boolean).join(' · ') || 'Venue Not Published';
  }

  /* ---------------------------------------------------------------------
   * Weather as a symbol, and numbers that carry their own grade.
   *
   * A card is scanned, not read. A condition spelled out in eight-point grey
   * ("Partly Cloudy, 12 mph, L To R") is the same weight as everything around
   * it, so nobody sees it; a symbol reads before the eye has finished landing.
   * The words stay beside it - the symbol is a second channel, never the only
   * one, and every icon carries its text in the label a screen reader gets.
   * ------------------------------------------------------------------ */

  /* Weather symbols now come from the shared desk set (dashboard/chase_icons.js)
     rather than from a filled 16x16 table kept here. Two icon vocabularies on
     one card - a filled weather glyph beside stroked outlines everywhere else -
     read as two different products stacked. */

  /* A number on a card should say how good it is without the reader having to
     know the league. The chip class comes from the published league baseline,
     so the colour is a statement about this season's distribution and not a
     threshold someone once typed in. */
  function gradeClass(value, context) {
    var A = global.MLBMAAssets;
    var n = Number(value);
    if (value == null || value === '' || !isFinite(n) || !A || !A.valueTier) return '';
    var tier = A.valueTier(n, context);
    return tier ? A.TIER_CHIP[tier] : '';
  }

  /* The same rank scale as the game page - the rank's place in its own
     denominator. This copy used to cut at 0.88/0.65/0.35/0.15, so 26th of 30
     read poor here and weak one click away. */
  function rankClass(rank, of) {
    var A = global.MLBMAAssets;
    return A && A.rankChipClass ? A.rankChipClass(rank, of) : '';
  }

  function kickoff(game) {
    var state = String(game.game_state || '').toLowerCase();
    if ((state === 'live' || state === 'final') && game.away_score != null && game.home_score != null) {
      return esc(game.away_score) + '–' + esc(game.home_score) + ' · ' + (state === 'final' ? 'Final' : 'Live');
    }
    return esc(clock(game.kickoff_utc) || game.kickoff_display || 'Time Not Published');
  }

  function fullMatchupUrl(sport, game) {
    var href = '/' + sport + '/matchup.html?game=' + encodeURIComponent(game.id || '');
    if (game.game_pk) href += '&gamePk=' + encodeURIComponent(game.game_pk);
    var slateDate = game.slate_date || (game.kickoff_utc && easternDateIso(new Date(game.kickoff_utc)));
    if (slateDate) href += '&date=' + encodeURIComponent(slateDate);
    return href;
  }

  function teamBlock(sport, game, side) {
    var abbr = game[side];
    var supplied = game[side + '_name'];
    var name = teamName(sport, abbr, supplied);
    var record = game[side + '_record'];
    // Identity is the official crest plus the full team name (owner decision
    // 2026-09-10, and what the matchup IA asks for). The club colour survives
    // as a restrained left rule on the block rather than a filled tab, so the
    // crest is the thing that carries the club.
    //
    // Crest legibility is measured, not assumed: mlbma_assets.js composites
    // every logo over the card ground and picks the full-colour asset, ESPN's
    // dark variant, or a light plate accordingly.
    var code = String(abbr || '').toUpperCase();
    var accent = '';
    if (global.MLBMAAssets && MLBMAAssets.teamColor) {
      var clubColor = MLBMAAssets.teamColor(code, sport);
      if (clubColor) accent = ' style="--team-accent:' + esc(clubColor) + '"';
    }
    var crest = logoHtml(sport, abbr, supplied, 44, 'ca-matchup-logo');
    return '<div class="ca-matchup-card__club ca-matchup-card__club--' + side + '"' + accent + '>' +
      crest +
      '<div class="ca-matchup-card__club-copy">' +
      '<span class="ca-matchup-card__name">' + esc(name) + '</span>' +
      (record ? '<span class="ca-matchup-card__record">' + esc(record) + '</span>' : '') +
      '</div></div>';
  }

  function starterBlock(sport, game, side) {
    var name = starterName(game, side, sport);
    var id = sideValue(game, side, 'starter_id', '');
    return '<div class="ca-matchup-card__starter">' +
      headshot(id, name) + '<div><span class="ca-matchup-card__starter-label">' +
      (sport === 'nfl' ? 'Quarterback' : 'Probable starter') + '</span>' +
      '<strong>' + esc(name) + '</strong><span>' + esc(starterMeta(game, side, sport)) + '</span></div></div>';
  }

  /* The desk symbol set (dashboard/chase_icons.js, glyphs from Lucide).
     Guarded, because a card must still render every word if the icon file has
     not loaded - the symbol is a second channel beside the label, never the
     label itself. */
  function ico(name, cls, px) {
    return (global.ChaseIcons && ChaseIcons.icon) ? ChaseIcons.icon(name, cls, px) : '';
  }

  function wxIco(text) {
    return (global.ChaseIcons && ChaseIcons.weatherIcon)
      ? ChaseIcons.weatherIcon(text, 'ca-matchup-card__ico', 16)
      : '';
  }

  /* A fact reads as symbol, then label, then value. The symbol is what makes a
     row of three cells scannable at a glance instead of three grey captions
     that all look alike. */
  function miniFact(label, value, tone, glyph) {
    return '<div class="ca-matchup-card__fact"><span>' +
      (glyph ? ico(glyph, 'ca-matchup-card__ico') : '') + esc(label) + '</span><strong class="' +
      esc(tone || '') + '">' + esc(value || 'Not published') + '</strong></div>';
  }


  /* Offensive context, straight from the published team-rankings snapshot.
     Rendered as value plus league rank so it reads as a description of the
     season, never as a forecast. projOSI and ppGap are absent from
     PUBLIC_RANK_METRICS and the snapshot's `status` family is never read, so
     the model-private fields are excluded by construction. */
  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  }

  function contextStrip(game, side) {
    var ctx = game[side + '_context'];
    if (!ctx) return '';
    var cells = ['osi', 'wrc', 'woba', 'abq'].map(function (key) {
      var entry = ctx[key];
      var spec = PUBLIC_RANK_METRICS[key];
      if (!entry || !spec) return '';
      var value = Number(entry.value);
      if (!isFinite(value)) return '';
      var shown = spec.digits === 3
        ? value.toFixed(3).replace(/^0/, '')
        : value.toFixed(spec.digits);
      return '<div class="ca-ctx-cell">' +
        '<span class="ca-ctx-label">' + esc(spec.label) + '</span>' +
        '<strong class="ca-ctx-value ' + rankClass(entry.rank, entry.of) + '">' +
        esc(shown) + '</strong>' +
        '<span class="ca-ctx-rank">' + entry.rank + ordinal(entry.rank) +
        ' Of ' + entry.of + '</span>' +
        '</div>';
    }).filter(Boolean).join('');
    return cells ? '<div class="ca-ctx-strip">' + cells + '</div>' : '';
  }


  /* NFL availability. The list is factual roster status - designation and
     injury type as reported - with no projection, snap share or confidence.
     Capped at five per side on the card; the rest are counted. */
  function availabilityPanel(game, side, teamLabel) {
    var list = game[side + '_availability_list'];
    if (!list) return '';
    if (!list.length) {
      return '<section class="ca-avail"><h4 class="ca-ctx-head">' + esc(teamLabel) +
        '</h4><p class="ca-avail-empty">No designations reported</p></section>';
    }
    var shown = list.slice(0, 5);
    var rows = shown.map(function (p) {
      var tone = p.status === 'Out' ? 'is-out'
        : (p.status === 'Doubtful' ? 'is-doubtful' : 'is-questionable');
      return '<li class="ca-avail-row">' +
        '<span class="ca-avail-pos">' + esc(p.position || '--') + '</span>' +
        '<span class="ca-avail-name">' + esc(p.name) + '</span>' +
        (p.detail ? '<span class="ca-avail-detail">' + esc(p.detail) + '</span>' : '<span></span>') +
        '<span class="ca-avail-status ' + tone + '">' + esc(p.status) + '</span>' +
        '</li>';
    }).join('');
    var more = list.length - shown.length;
    return '<section class="ca-avail"><h4 class="ca-ctx-head">' + esc(teamLabel) +
      '</h4><ul class="ca-avail-list">' + rows + '</ul>' +
      (more > 0 ? '<p class="ca-avail-more">+' + more + ' more designated</p>' : '') +
      '</section>';
  }

  function expandedHtml(sport, game, panelId) {
    var awayName = teamName(sport, game.away, game.away_name);
    var homeName = teamName(sport, game.home, game.home_name);
    // No starter blocks here: the collapsed card already shows both faces, and
    // repeating them made the same two headshots appear twice on expand.
    var html = '<div class="ca-matchup-card__expand" id="' + esc(panelId) + '" hidden>';
    if (sport === 'nfl') {
      var awayAv = availabilityPanel(game, 'away', awayName);
      var homeAv = availabilityPanel(game, 'home', homeName);
      if (awayAv || homeAv) {
        html += '<div class="ca-ctx-duo">' + awayAv + homeAv + '</div>' +
          '<p class="ca-ctx-note">Official injury report designations. ' +
          'Roster status only; no projection or snap share.</p>';
      }
    }
    if (sport === 'mlb') {
      var awayCtx = contextStrip(game, 'away'), homeCtx = contextStrip(game, 'home');
      if (awayCtx || homeCtx) {
        html += '<div class="ca-ctx-duo">' +
          '<section><h4 class="ca-ctx-head">' + esc(awayName) + ' Offense</h4>' + awayCtx + '</section>' +
          '<section><h4 class="ca-ctx-head">' + esc(homeName) + ' Offense</h4>' + homeCtx + '</section>' +
          '</div>' +
          '<p class="ca-ctx-note">Season to date, graded against the 30-team league pool. ' +
          'OSI = 0.43&#183;RCV + 0.37&#183;ABQ + 0.20&#183;OBR.</p>';
      }
    }
    if (sport === 'mlb') {
      var awayLineup = lineupLabel(game.away_lineup_state);
      var homeLineup = lineupLabel(game.home_lineup_state);
      html += '<div class="ca-matchup-card__detail-grid">' +
        miniFact(awayName + ' lineup', awayLineup.label, awayLineup.tone) +
        miniFact(homeName + ' lineup', homeLineup.label, homeLineup.tone) +
        miniFact(awayName + ' bullpen', game.away_bullpen || 'Availability Not Published') +
        miniFact(homeName + ' bullpen', game.home_bullpen || 'Availability Not Published') +
        '</div>';
    } else {
      html += '<div class="ca-matchup-card__detail-grid">' +
        miniFact(awayName + ' availability', game.away_availability || game.availability_summary || 'Report Not Published') +
        miniFact(homeName + ' availability', game.home_availability || game.availability_summary || 'Report Not Published') +
        miniFact(awayName + ' rest', game.away_rest_days ? game.away_rest_days + ' days' : 'Not published') +
        miniFact(homeName + ' rest', game.home_rest_days ? game.home_rest_days + ' days' : 'Not published') +
        '</div>';
    }
    return html + '<div class="ca-matchup-card__environment">' +
      miniFact('Venue', venue(game)) + miniFact(sport === 'nfl' ? 'Weather and surface' : 'Conditions',
        [conditions(game), game.surface].filter(Boolean).join(' · ')) + '</div></div>';
  }


  /* The collapsed card carries the starter faces, the way the earlier Chase
     matchup cards did: a probable pitcher or a quarterback is the single most
     identifying fact about a game, and a name alone does not read at a glance.
     Both sides are built from the same template so the row is symmetric even
     when one side has no published starter. */
  function starterFace(sport, game, side) {
    var name = starterName(game, side, sport);
    var id = sideValue(game, side, 'starter_id', '');
    var shotUrl = null;
    if (sport === 'nfl') {
      var qb = quarterback(game, side);
      shotUrl = qb && qb.headshot;
    }
    var meta = starterMeta(game, side, sport);
    var era = sport === 'mlb' ? safeNumber(sideValue(game, side, 'era', ''), 2) : '';
    var eraChip = era
      ? '<span class="ca-matchup-card__arm-era ' + gradeClass(era, 'era') + '">' +
        esc(era) + '<i>ERA</i></span>'
      : '';
    var metaHtml = meta
      ? '<span class="ca-matchup-card__arm-meta">' + esc(meta) + '</span>'
      // An unpublished line is an absence, not a headline, so it takes the
      // muted treatment rather than the tracked caps real data gets.
      : '<span class="ca-matchup-card__arm-meta is-absent">Season Line Not Published</span>';
    return '<div class="ca-matchup-card__arm">' +
      headshot(id, name, shotUrl) +
      '<div class="ca-matchup-card__arm-copy">' +
      '<span class="ca-matchup-card__arm-name">' + esc(name) + '</span>' +
      metaHtml + '</div>' + eraChip + '</div>';
  }

  function restSummary(game) {
    var away = game.away_rest_days, home = game.home_rest_days;
    if (away == null && home == null) return 'Rest Not Published';
    var fmt = function (v) { return v == null ? '--' : v + 'd'; };
    return fmt(away) + ' / ' + fmt(home);
  }

  /* Arms used over pitches thrown, in the three days before this game, away
     club first. It read "Workload Not Published" on every card of every slate
     because nothing published the field; it is published now, and the label
     beside it says what the two numbers are. */
  function bullpenSummary(game) {
    var away = game.away_bullpen, home = game.home_bullpen;
    if (!away && !home) return 'Workload Not Published';
    // Arms over pitches, away club first. The label names the window; the
    // slash is what says these are two numbers and not one.
    return [away || '—', home || '—'].join(' · ');
  }

  function cardHtml(sport, game) {
    var id = 'matchup-' + String(game.id || '').replace(/[^a-z0-9_-]/gi, '-');
    var panelId = id + '-details';
    var state = gameStateLabel(game.game_state);
    var statusLine;
    if (sport === 'mlb') {
      var awayLineup = lineupLabel(game.away_lineup_state);
      var homeLineup = lineupLabel(game.home_lineup_state);
      statusLine = awayLineup.label === homeLineup.label ? awayLineup.label :
        awayLineup.label + ' / ' + homeLineup.label;
    } else {
      statusLine = game.availability_summary || 'Availability Report Pending';
    }
    // Conditions are hydrated close to first pitch, so most of the day there is
    // nothing to say. An empty weather slot says nothing loudly; no slot says
    // nothing quietly, which is the right volume for a fact that is coming.
    var wxText = conditions(game);
    var hasWx = wxText && wxText.indexOf('not published') < 0;
    var roof = game.roof || (sport === 'mlb' ? null : game.surface);
    return '<article class="ca-matchup-card" id="' + esc(id) + '" data-game="' + esc(game.id) +
      '" data-sport="' + esc(sport) + '">' +
      // Where the game is played is the first thing a reader orients on, so it
      // sits above everything else rather than fourth in a row of small facts.
      // The building's own facts - roof, surface - travel with its name.
      '<div class="ca-matchup-card__venue">' +
            // `landmark` for both sports. The stadium bowl is the more literal symbol
      // but at fifteen pixels two nested ellipses read as an eye, and a venue
      // line is the wrong place to make a reader work out what they are seeing.
      ico('landmark', 'ca-matchup-card__ico ca-matchup-card__ico--venue', 15) +
      '<span class="ca-matchup-card__venue-name">' +
      esc(game.venue || 'Venue Not Published') + '</span>' +
      (game.venue_city ? '<span class="ca-matchup-card__venue-city">' + esc(game.venue_city) + '</span>' : '') +
      (roof ? '<span class="ca-matchup-card__venue-tag">' +
        (/dome|indoor|closed|retract/i.test(String(roof)) ? ico('roof', 'ca-matchup-card__ico', 13) : '') +
        esc(roof) + '</span>' : '') +
      '<span class="ca-status-chip ' + state.tone + '">' + state.label + '</span></div>' +
      '<header class="ca-matchup-card__head"><span class="ca-matchup-card__kick">' +
      ico('clock', 'ca-matchup-card__ico') + kickoff(game) + '</span>' +
      (hasWx ? '<span class="ca-matchup-card__wx">' + wxIco(wxText) + esc(wxText) + '</span>' : '') +
      '</header>' +
      '<div class="ca-matchup-card__teams">' + teamBlock(sport, game, 'away') +
      '<span class="ca-matchup-card__versus" aria-hidden="true">At</span>' + teamBlock(sport, game, 'home') + '</div>' +
      '<div class="ca-matchup-card__arms" role="group" aria-label="' +
      (sport === 'mlb' ? 'Probable Starters' : 'Quarterbacks') + '">' +
      starterFace(sport, game, 'away') + starterFace(sport, game, 'home') + '</div>' +
      // Three compact factual cells, one row - the collapsed anatomy the style
      // lock specifies (design/GPT_IMAGE_PROMPTS_CHASE_DESK.md).
      '<div class="ca-matchup-card__summary">' +
      miniFact(sport === 'mlb' ? 'Bullpen, L3' : 'Travel',
        sport === 'mlb' ? bullpenSummary(game) : (game.away_travel || restSummary(game)),
        '', sport === 'mlb' ? 'users' : 'plane') +
      miniFact(sport === 'mlb' ? 'Lineup Status' : 'Availability', statusLine,
        '', sport === 'mlb' ? 'lineup' : 'whistle') +
      miniFact('Broadcast', game.broadcast || 'Not Published', '', 'tv') +
      '</div>' +
      expandedHtml(sport, game, panelId) +
      '<footer class="ca-matchup-card__actions">' +
      '<button type="button" class="ca-matchup-card__expand-btn" data-expand-matchup aria-expanded="false" aria-controls="' +
      esc(panelId) + '"><span>Expand Matchup</span><span aria-hidden="true">+</span></button>' +
      '<a class="ca-matchup-card__detail-link" href="' + esc(fullMatchupUrl(sport, game)) + '">Full Matchup Analysis <span aria-hidden="true">→</span></a>' +
      '</footer></article>';
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('Request failed: ' + response.status);
      return response.json();
    });
  }

  function mlbState(game) {
    var abstractState = String(game && game.status && game.status.abstractGameState || '').toLowerCase();
    var detailed = String(game && game.status && game.status.detailedState || '').toLowerCase();
    if (abstractState === 'final') return 'final';
    if (abstractState === 'live') return 'live';
    if (detailed.indexOf('postpon') >= 0) return 'postponed';
    if (detailed.indexOf('delay') >= 0) return 'delayed';
    return 'scheduled';
  }

  function broadcasts(game) {
    var names = [];
    (game.broadcasts || []).forEach(function (item) {
      var name = item && (item.name || item.callSign);
      var type = String(item && item.type || '').toUpperCase();
      if (name && (!type || type === 'TV') && names.indexOf(name) < 0) names.push(name);
    });
    return names.slice(0, 2).join(', ');
  }

  function mapOfficialMlbGame(game) {
    var awayNode = game && game.teams && game.teams.away;
    var homeNode = game && game.teams && game.teams.home;
    var awayTeam = awayNode && awayNode.team;
    var homeTeam = homeNode && homeNode.team;
    if (!awayTeam || !homeTeam) return null;
    var away = String(awayTeam.abbreviation || '').trim();
    var home = String(homeTeam.abbreviation || '').trim();
    if (!away || !home) return null;
    var awayStarter = awayNode.probablePitcher || {};
    var homeStarter = homeNode.probablePitcher || {};
    var location = game.venue && game.venue.location || {};
    var weather = game.weather || {};
    var lineup = game.lineups || {};
    function record(node) {
      var leagueRecord = node && node.leagueRecord;
      return leagueRecord && leagueRecord.wins != null && leagueRecord.losses != null
        ? leagueRecord.wins + '-' + leagueRecord.losses : '';
    }
    function lineupState(players) { return players && players.length ? 'Confirmed' : 'Expected'; }
    return {
      id: String(game.gamePk), game_pk: game.gamePk, sport: 'mlb', game_state: mlbState(game),
      kickoff_utc: game.gameDate || null, away: away, home: home,
      away_name: awayTeam.name || '', home_name: homeTeam.name || '',
      away_record: record(awayNode), home_record: record(homeNode),
      away_score: awayNode.score, home_score: homeNode.score,
      venue: game.venue && game.venue.name || '',
      venue_id: game.venue && game.venue.id || null,
      away_team_id: awayTeam.id || null, home_team_id: homeTeam.id || null,
      venue_city: [location.city, location.stateAbbrev].filter(Boolean).join(', '),
      broadcast: broadcasts(game),
      conditions: [weather.temp ? weather.temp + '°' : '', weather.condition, weather.wind].filter(Boolean).join(' · '),
      weather_temp: weather.temp || '', weather_cond: weather.condition || '', weather_wind: weather.wind || '',
      away_starter: awayStarter.fullName || '', home_starter: homeStarter.fullName || '',
      away_starter_id: awayStarter.id || null, home_starter_id: homeStarter.id || null,
      away_hand: awayStarter.pitchHand && awayStarter.pitchHand.code || '',
      home_hand: homeStarter.pitchHand && homeStarter.pitchHand.code || '',
      away_era: awayStarter.era || '', home_era: homeStarter.era || '',
      away_lineup_state: lineupState(lineup.awayPlayers), home_lineup_state: lineupState(lineup.homePlayers),
      // The batting orders arrive on this same payload. They were being
      // discarded, which is why the analysis page had to re-request the
      // schedule to show a lineup at all.
      away_lineup: lineup.awayPlayers || [], home_lineup: lineup.homePlayers || [],
      freshness: 'Official schedule'
    };
  }

  function sameGame(left, right) {
    if (!left || !right) return false;
    if (left.game_pk && right.game_pk && String(left.game_pk) === String(right.game_pk)) return true;
    return String(left.away || '').toUpperCase() === String(right.away || '').toUpperCase() &&
      String(left.home || '').toUpperCase() === String(right.home || '').toUpperCase();
  }

  function mergeGames(official, curated) {
    if (!official.length) return curated;
    return official.map(function (game) {
      var extra = curated.find(function (candidate) { return sameGame(game, candidate); });
      if (!extra) return game;
      var merged = Object.assign({}, game);
      Object.keys(extra).forEach(function (key) {
        if (extra[key] != null && extra[key] !== '') merged[key] = extra[key];
      });
      merged.id = String(game.id);
      merged.game_pk = game.game_pk;
      return merged;
    });
  }

  function loadGames(sport, adapter, dateIso) {
    if (!adapter || !adapter.SLATE_URL) return Promise.reject(new Error('Public slate URL missing.'));
    // Chips are graded as cards and game pages paint, so this season's league
    // baselines must be in the registry first. It never rejects: a failed fetch
    // leaves cells ungraded rather than holding the slate back.
    var baselines = (global.MLBMAAssets && global.MLBMAAssets.baselinesReady) || Promise.resolve(null);
    var publicRequest = loadJson(adapter.SLATE_URL).then(function (slate) {
      var normalized = global.ChasePublicSlate.normalize(sport, slate);
      return { normalized: normalized, error: null };
    }).catch(function (error) { return { normalized: { games: [] }, error: error }; });
    if (sport !== 'mlb') {
      return Promise.all([publicRequest, baselines]).then(function (parts) {
        var result = parts[0];
        if (result.error && !result.normalized.games.length) throw result.error;
        return {
          games: result.normalized.games, generatedAt: result.normalized.generated_at,
          dataThrough: result.normalized.data_through, source: 'Published slate'
        };
      });
    }
    var date = dateIso || query().get('date') || easternDateIso();
    var officialUrl = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(date) +
      // NOTE: probablePitcher cannot be hydrated with stats on this endpoint -
      // probablePitcher(stats(...)) returns identity only (verified 2026-09-10),
      // so away_era/home_era stay empty and the card says so. Sourcing a season
      // line needs either a second call per pitcher
      // (/api/v1/people/{id}/stats?stats=season&group=pitching) or the slate
      // producer publishing away_era/home_era, which the public schema in
      // chase_public_slate.js already allows.
      '&hydrate=probablePitcher,team,venue,weather,broadcasts,lineups';
    var officialRequest = loadJson(officialUrl).then(function (payload) {
      var games = [];
      (payload.dates || []).forEach(function (block) {
        (block.games || []).forEach(function (game) {
          var mapped = mapOfficialMlbGame(game);
          if (mapped) games.push(mapped);
        });
      });
      return games;
    }).catch(function () { return []; });
    return Promise.all([publicRequest, officialRequest, baselines]).then(function (parts) {
      var published = parts[0].normalized;
      var official = parts[1];
      var games = mergeGames(official, published.games || []);
      games.forEach(function (game) { game.slate_date = date; });
      if (!games.length && parts[0].error) throw parts[0].error;
      // Season lines and team context are additive; both resolve to empty on
      // failure so the slate still renders.
      return Promise.all([loadStarterLines(games, date), loadTeamContext()])
        .then(function (extra) {
          return { games: applyEvidence(games, extra[0], extra[1]), published: published, official: official };
        });
    }).then(function (bundle) {
      var games = bundle.games, published = bundle.published, official = bundle.official;
      // Freshness has to describe what the cards are actually showing. It used
      // to report the published file's timestamp while the cards were drawn
      // from the live schedule - two provenances presented as one, and the
      // strip could say "data through yesterday" above today's fixtures. When
      // the official schedule supplies the games, the observation time is this
      // fetch; the file's own timestamp only applies when the file supplied
      // them.
      var fromOfficial = official.length > 0;
      return {
        games: games,
        generatedAt: fromOfficial ? new Date().toISOString() : (published.generated_at || null),
        dataThrough: fromOfficial ? new Date().toISOString() : (published.data_through || date),
        dateIso: date,
        source: fromOfficial
          ? (published.games && published.games.length
              ? 'Official MLB schedule, read live · published context merged in'
              : 'Official MLB schedule, read live')
          : 'Published MLB slate'
      };
    });
  }

  /* ---------------------------------------------------------------------
   * Evidence enrichment (2026-09-10).
   *
   * Two facts the collapsed card needs were reachable all along; neither was
   * being fetched.
   *
   * 1. The starter's season line. probablePitcher cannot be hydrated with
   *    stats on the /schedule endpoint (verified: it returns identity only),
   *    but /api/v1/people accepts a personIds list and DOES hydrate them - so
   *    the whole slate's starters cost one request, not thirty.
   *
   * 2. Team offensive context. OSI / RCV / ABQ / OBR / wRC+ / wOBA / Pitch
   *    Score already ship in dashboard/team_rankings_snapshot.json, which is
   *    already served publicly. Only the `status` family is withheld: it
   *    carries projOSI and ppGap, which design/public_metric_classification
   *    .json lists as model_private.
   *
   * Both are additive and fail soft: if either request fails the card renders
   * exactly as it did before, with the value explicitly unpublished.
   * ------------------------------------------------------------------ */

  // The public projection, not the snapshot. The snapshot's `status` family
  // carries projOSI and ppGap for all thirty clubs, and serving the whole file
  // published them to every visitor even though nothing rendered them.
  var TEAM_CONTEXT_URL = '/data/public/team_context.json';

  // Which metrics the card is allowed to show, and how to print them. The
  // exclusion of projOSI and ppGap now happens in the producer, so they are not
  // in the artifact this file reads at all.
  var PUBLIC_RANK_METRICS = {
    osi: { label: 'OSI', hi: true, digits: 1 },
    wrc: { label: 'wRC+', hi: true, digits: 0 },
    woba: { label: 'wOBA', hi: true, digits: 3 },
    rcv: { label: 'RCV', hi: true, digits: 1 },
    abq: { label: 'ABQ', hi: true, digits: 1 },
    obr: { label: 'OBR', hi: true, digits: 1 },
    pitchScore: { label: 'Pitch Score', hi: true, digits: 0 }
  };

  // The rankings snapshot keeps Baseball-Reference style codes; the schedule
  // endpoint keeps the club's own. Seven of thirty disagree, so an unaliased
  // join silently dropped ARI, CHW, KCR, SDP, SFG, TBR and WSN - nearly half
  // the sides on a normal slate.
  var TEAM_ALIAS = {
    ARI: 'AZ', ARZ: 'AZ', CHW: 'CWS', CWS: 'CWS', KCR: 'KC', SDP: 'SD',
    SFG: 'SF', TBR: 'TB', TBD: 'TB', WSN: 'WSH', WAS: 'WSH'
  };

  function canonTeam(code) {
    var key = String(code || '').toUpperCase().trim();
    return TEAM_ALIAS[key] || key;
  }

  var teamContextPromise = null;

  function loadTeamContext() {
    if (teamContextPromise) return teamContextPromise;
    teamContextPromise = loadJson(TEAM_CONTEXT_URL).then(function (payload) {
      // Ranks arrive already recomputed from each descriptive value against the
      // same league pool (scripts/publish_public_context.py), so there is one
      // ranking service and the matchup page and the league board cannot
      // disagree on a boundary team.
      return {
        teams: (payload && payload.teams) || {},
        generatedAt: (payload && payload.data_through_utc) || null,
        formulas: (payload && payload.formulas) || {}
      };
    }).catch(function () { return { teams: {}, generatedAt: null, formulas: {} }; });
    return teamContextPromise;
  }

  function seasonYear(dateIso) {
    var year = parseInt(String(dateIso || '').slice(0, 4), 10);
    return Number.isFinite(year) ? year : new Date().getFullYear();
  }

  /** One request for every probable starter on the slate. */
  function loadStarterLines(games, dateIso) {
    var ids = [];
    games.forEach(function (game) {
      ['away', 'home'].forEach(function (side) {
        var id = game[side + '_starter_id'];
        if (id && ids.indexOf(id) < 0) ids.push(id);
      });
    });
    if (!ids.length) return Promise.resolve({});
    var url = 'https://statsapi.mlb.com/api/v1/people?personIds=' + ids.join(',') +
      '&hydrate=stats(group=[pitching],type=[season],season=' + seasonYear(dateIso) + ')';
    return loadJson(url).then(function (payload) {
      var byId = {};
      (payload.people || []).forEach(function (person) {
        var stat = {};
        (person.stats || []).forEach(function (block) {
          var split = (block.splits || [])[0];
          if (split && split.stat) stat = split.stat;
        });
        byId[person.id] = {
          hand: person.pitchHand && person.pitchHand.code || '',
          era: stat.era != null ? stat.era : '',
          wins: stat.wins, losses: stat.losses,
          whip: stat.whip != null ? stat.whip : '',
          strikeouts: stat.strikeOuts, walks: stat.baseOnBalls,
          innings: stat.inningsPitched
        };
      });
      return byId;
    }).catch(function () { return {}; });
  }

  function applyEvidence(games, lines, context) {
    games.forEach(function (game) {
      ['away', 'home'].forEach(function (side) {
        var line = lines[game[side + '_starter_id']];
        if (line) {
          if (!game[side + '_hand'] && line.hand) game[side + '_hand'] = line.hand;
          if (line.era !== '' && line.era != null) game[side + '_era'] = line.era;
          if (line.wins != null && line.losses != null) {
            game[side + '_starter_record'] = line.wins + '-' + line.losses;
          }
          if (line.whip !== '' && line.whip != null) game[side + '_whip'] = line.whip;
        }
        var team = canonTeam(game[side]);
        if (context.teams[team]) game[side + '_context'] = context.teams[team];
      });
      game.context_generated_at = context.generatedAt;
    });
    return games;
  }

  function updateStatus(sport, result) {
    var fields = {
      sport: sport, state: result.games.length ? 'ok' : 'empty', publishedAt: result.generatedAt,
      dataCutoff: result.dataThrough, source: result.source, issues: [],
      slateDateEt: result.dateIso, gameCount: result.games.length
    };
    if (global.ChaseShell && ChaseShell.setContext) ChaseShell.setContext(fields);
    var context = document.getElementById('caContextBar');
    if (context && !result.generatedAt) {
      // AUDIT B3: this printed result.source verbatim, so the bar read
      // "MLB · ok" — a machine status value rendered as visible copy.
      var reading = result.games.length
        ? result.games.length + (result.games.length === 1 ? ' game' : ' games') + ' on the published slate'
        : 'No games on the published slate';
      context.textContent = sport.toUpperCase() + ' · ' + reading +
        (result.dateIso ? ' · ' + longDate(result.dateIso) : '');
      context.setAttribute('data-state', fields.state);
    }
    if (global.ChaseNav && ChaseNav.applyDataStatus && result.generatedAt) ChaseNav.applyDataStatus(fields);
  }

  function filterGames(host, games) {
    var desk = host.__desk || {};
    var term = String(desk.query || '').trim().toLowerCase();
    var filter = desk.filter || 'all';
    return games.filter(function (game) {
      if (desk.results && String(game.game_state || '').toLowerCase() !== 'final') return false;
      if (filter === 'confirmed' && sportLineupState(game).indexOf('Confirmed') < 0) return false;
      if (!term) return true;
      var text = [game.away, game.home, teamName(desk.sport, game.away, game.away_name),
        teamName(desk.sport, game.home, game.home_name), game.venue, game.broadcast,
        game.away_starter, game.home_starter].join(' ').toLowerCase();
      return text.indexOf(term) >= 0;
    });
  }

  function sportLineupState(game) {
    return lineupLabel(game.away_lineup_state).label + ' ' + lineupLabel(game.home_lineup_state).label;
  }

  function toolbarHtml(host, sport, count) {
    var desk = host.__desk || {};
    if (desk.embedded) {
      return '<div class="ca-embedded-slate-head"><span>' + count + ' games</span>' +
        '<a href="/' + sport + '/">View full ' + sport.toUpperCase() + ' slate <span aria-hidden="true">→</span></a></div>';
    }
    var html = '<div class="ca-desk-toolbar" data-desk-sport="' + esc(sport) + '"><div class="ca-desk-toolbar__primary">';
    if (sport === 'mlb') {
      html += '<div class="ca-desk-dates" aria-label="Choose MLB date">' +
        '<button type="button" data-date-shift="-1" aria-label="Previous day">←</button>' +
        '<button type="button" class="ca-desk-dates__today" data-date-today>' + longDate(desk.dateIso || easternDateIso()) + '</button>' +
        '<button type="button" data-date-shift="1" aria-label="Next day">→</button></div>';
    } else {
      html += '<strong class="ca-desk-window-label">' +
        (desk.results ? 'Completed games' : (sport === 'nfl' ? 'NFL Weeks' : 'Kickoff windows')) + '</strong>';
    }
    // Search moved to the header (#chaseNavSearch drives the same filter), so
    // the toolbar no longer carries a duplicate field.
    html += '</div>' +
      '<div class="ca-desk-toolbar__secondary"><button type="button" class="ca-desk-chip' +
      ((desk.filter || 'all') === 'all' ? ' is-on' : '') + '" data-filter="all">All games</button>';
    if (sport === 'mlb' && !desk.results) {
      html += '<button type="button" class="ca-desk-chip' + (desk.filter === 'confirmed' ? ' is-on' : '') +
        '" data-filter="confirmed">Confirmed lineups</button>';
    }
    html += '<span class="ca-desk-count" aria-live="polite">' + count + ' games</span></div></div>';
    return html;
  }

  function renderGroups(sport, games) {
    if (sport !== 'nfl') return '<div class="ca-slate-grid">' + games.map(function (game) { return cardHtml(sport, game); }).join('') + '</div>';
    var groups = [];
    var byKey = {};
    games.forEach(function (game) {
      var week = global.ChasePublicSlate.nflWeek(game);
      var key = week == null ? 'unknown' : String(week);
      if (!byKey[key]) {
        byKey[key] = { label: week == null ? 'Week Unavailable' : 'Week ' + week, games: [] };
        groups.push(byKey[key]);
      }
      byKey[key].games.push(game);
    });
    return groups.map(function (group) {
      var ordered = global.ChasePublicSlate.sortGames(group.games);
      return '<section class="ca-kickoff-window"><header><h2>' + esc(group.label) + '</h2><span>' + ordered.length +
        (ordered.length === 1 ? ' game' : ' games') + ' · chronological</span></header><div class="ca-slate-grid">' +
        ordered.map(function (game) { return cardHtml(sport, game); }).join('') + '</div></section>';
    }).join('');
  }

  /* The toolbar was moved onto the page head, so its controls are no longer
     inside the .ca-async slate host they drive. closest('.ca-async') therefore
     returned null and every date and filter control silently did nothing -
     next day did not advance, filters did not filter. Resolve the desk by
     walking up first, then falling back to the mounted slate on the page. */
  function deskHostFor(el) {
    var host = el && el.closest ? el.closest('.ca-async') : null;
    if (host && host.__desk) return host;
    var mounted = [].slice.call(document.querySelectorAll('.ca-async'))
      .filter(function (node) { return node.__desk; });
    if (!mounted.length) return null;
    // A page can carry more than one desk (the home route has MLB and NFL);
    // prefer the one this toolbar was rendered for.
    var scope = el && el.closest ? el.closest('[data-desk-sport]') : null;
    var want = scope && scope.getAttribute('data-desk-sport');
    if (want) {
      for (var i = 0; i < mounted.length; i++) {
        if (mounted[i].__desk.sport === want) return mounted[i];
      }
    }
    return mounted[0];
  }

  function render(host) {
    var desk = host.__desk || {};
    var shown = filterGames(host, desk.games || []);
    host.setAttribute('data-state', shown.length ? 'ready' : 'empty');
    var toolbar = toolbarHtml(host, desk.sport, shown.length);
    // The date and filter controls belong on the title row, not in a band of
    // their own - a page that carries the mount point gets them there, and the
    // slate holds only the games.
    var controlHost = document.querySelector('[data-desk-toolbar-host]');
    var body = renderGroups(desk.sport, shown) +
      (!shown.length ? '<div class="ca-empty-state"><h2>' + (desk.results ? 'No completed games' : 'No matching games') +
        '</h2><p>' + (desk.results ? 'Final scores will appear here when games finish.' : 'Adjust the date, filters, or search.') + '</p></div>' : '');
    if (controlHost) {
      controlHost.innerHTML = toolbar;
      host.innerHTML = body;
    } else {
      host.innerHTML = toolbar + body;
    }
    host.setAttribute('data-state', shown.length ? 'ready' : 'empty');
  }

  function mount(opts) {
    opts = opts || {};
    var host = opts.host;
    if (!host) return Promise.reject(new Error('Slate host missing.'));
    host.__desk = host.__desk || {};
    host.__desk.sport = opts.sport;
    host.__desk.adapter = opts.adapter;
    host.__desk.embedded = !!opts.embedded;
    host.__desk.results = !!opts.results;
    host.__desk.dateIso = opts.dateIso || query().get('date') || easternDateIso();
    host.setAttribute('data-state', 'loading');
    host.innerHTML = '<div class="ca-loading-state" role="status">Loading ' + esc(opts.sport.toUpperCase()) + ' matchups…</div>';
    return loadGames(opts.sport, opts.adapter, host.__desk.dateIso).then(function (result) {
      host.__desk.games = result.games;
      host.__desk.dateIso = result.dateIso || host.__desk.dateIso;
      if (!host.__desk.embedded) updateStatus(opts.sport, result);
      render(host);
      return result;
    }).catch(function (error) {
      host.setAttribute('data-state', 'error');
      host.innerHTML = '<div class="ca-error-state" role="alert"><h2>Matchups unavailable</h2><p>' +
        esc(error.message || 'The published slate could not be loaded.') + '</p><button type="button" data-retry-slate>Retry</button></div>';
      throw error;
    });
  }

  function bind() {
    document.addEventListener('click', function (event) {
      var expand = event.target.closest('[data-expand-matchup]');
      if (expand) {
        var card = expand.closest('.ca-matchup-card');
        var panel = document.getElementById(expand.getAttribute('aria-controls'));
        var opening = expand.getAttribute('aria-expanded') !== 'true';
        var host = card && card.closest('.ca-async');
        if (host) {
          host.querySelectorAll('[data-expand-matchup][aria-expanded="true"]').forEach(function (button) {
            if (button === expand) return;
            button.setAttribute('aria-expanded', 'false');
            button.querySelector('span').textContent = 'Expand matchup';
            var oldPanel = document.getElementById(button.getAttribute('aria-controls'));
            if (oldPanel) oldPanel.hidden = true;
            var oldCard = button.closest('.ca-matchup-card');
            if (oldCard) oldCard.classList.remove('is-expanded');
          });
        }
        expand.setAttribute('aria-expanded', opening ? 'true' : 'false');
        expand.querySelector('span').textContent = opening ? 'Collapse matchup' : 'Expand matchup';
        if (panel) panel.hidden = !opening;
        if (card) card.classList.toggle('is-expanded', opening);
        return;
      }
      var filter = event.target.closest('[data-filter]');
      if (filter) {
        var filterHost = deskHostFor(filter);
        if (filterHost && filterHost.__desk) {
          filterHost.__desk.filter = filter.getAttribute('data-filter');
          render(filterHost);
        }
        return;
      }
      var shift = event.target.closest('[data-date-shift]');
      var today = event.target.closest('[data-date-today]');
      if (shift || today) {
        var dateHost = deskHostFor(shift || today);
        if (!dateHost || !dateHost.__desk) return;
        var nextDate = today ? easternDateIso() : shiftIso(dateHost.__desk.dateIso, Number(shift.getAttribute('data-date-shift')));
        mount({ sport: dateHost.__desk.sport, adapter: dateHost.__desk.adapter, host: dateHost,
          dateIso: nextDate, results: dateHost.__desk.results });
        return;
      }
      var retry = event.target.closest('[data-retry-slate]');
      if (retry) {
        var retryHost = deskHostFor(retry);
        if (retryHost && retryHost.__desk) mount({ sport: retryHost.__desk.sport, adapter: retryHost.__desk.adapter,
          host: retryHost, dateIso: retryHost.__desk.dateIso, results: retryHost.__desk.results });
      }
    });
    // The header search drives the same slate filter as the toolbar field, so
    // the reference chrome's search box is a real control rather than an
    // ornament. It fans out to every mounted desk on the page, which is what
    // the home route needs - it carries both an MLB and an NFL slate.
    document.addEventListener('input', function (event) {
      if (event.target.id !== 'chaseNavSearch') return;
      var value = event.target.value;
      document.querySelectorAll('.ca-async').forEach(function (host) {
        if (!host.__desk) return;
        host.__desk.query = value;
        render(host);
      });
    });

    document.addEventListener('input', function (event) {
      if (!event.target.matches('[data-desk-search]')) return;
      var host = event.target.closest('.ca-async');
      if (!host || !host.__desk) return;
      host.__desk.query = event.target.value;
      var start = event.target.selectionStart;
      render(host);
      var next = host.querySelector('[data-desk-search]');
      if (next) { next.focus(); next.setSelectionRange(start, start); }
    });
  }

  bind();

  global.ChaseMatchupCard = {
    mount: mount,
    mountSlate: function (opts) { return mount(opts); },
    mountMlb: function (opts) {
      opts = opts || {};
      opts.sport = 'mlb';
      opts.adapter = opts.adapter || global.ChaseSportMLB;
      return mount(opts);
    },
    loadGames: loadGames, canonTeam: canonTeam,
    fullMatchupUrl: fullMatchupUrl,
    teamName: teamName,
    logoHtml: logoHtml,
    cardHtml: cardHtml
  };
})(typeof window !== 'undefined' ? window : this);
