/**
 * Shared public MatchupCard + ExpandedMatchupPreview (L5).
 * Sport preview tab ids come from ChasePublicSportRegistry (L7). No model fields.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function params() {
    try { return new URLSearchParams(window.location.search || ''); }
    catch (e) { return new URLSearchParams(); }
  }

  function writeParams(patch) {
    var next = params();
    Object.keys(patch).forEach(function (k) {
      if (patch[k] == null || patch[k] === '') next.delete(k);
      else next.set(k, patch[k]);
    });
    var q = next.toString();
    var url = window.location.pathname + (q ? '?' + q : '') + window.location.hash;
    if (window.history && history.replaceState) history.replaceState(null, '', url);
  }

  function fullMatchupUrl(sport, g) {
    if (sport === 'mlb') {
      return '/dashboard/matchup_compare.html?away=' + encodeURIComponent(g.away || '') +
        '&home=' + encodeURIComponent(g.home || '') + '&game=' + encodeURIComponent(g.id || '');
    }
    return '/' + sport + '/matchups.html?game=' + encodeURIComponent(g.id || '');
  }

  function modelCenterUrl(sport, g) {
    return '/model-center/?sport=' + encodeURIComponent(sport) + '&game=' + encodeURIComponent(g.id || '');
  }

  function entity(sport, name) {
    var logo = '';
    if (global.MLBMAAssets && MLBMAAssets.teamLogoImg) {
      logo = MLBMAAssets.teamLogoImg(name, 56, 'ca-matchup-logo', sport);
    } else if (global.ChaseEntity) {
      return ChaseEntity.html({ name: name, id: name, sport: sport });
    }
    return '<span class="ca-entity ca-entity--mark" data-sport="' + esc(sport) + '" data-id="' + esc(name || '') + '">' +
      logo + '<span class="ca-entity-name">' + esc(name || '') + '</span></span>';
  }

  function statusChip(kind, raw) {
    var v = String(raw || '').trim();
    var cls = 'ca-status-chip';
    var low = v.toLowerCase();
    if (!v) {
      cls += ' is-muted';
      v = 'Unavailable';
    } else if (low.indexOf('confirm') >= 0 || low.indexOf('available') >= 0 || low === 'ok') {
      cls += ' is-ok';
    } else if (low.indexOf('project') >= 0 || low.indexOf('limited') >= 0 || low.indexOf('question') >= 0) {
      cls += ' is-watch';
    } else {
      cls += ' is-muted';
    }
    return '<span class="' + cls + '">' + esc(kind) + ': ' + esc(v) + '</span>';
  }

  function statusRow(sport, g) {
    var chips = [];
    if (sport === 'mlb') {
      chips.push(statusChip('Lineup', g.away_lineup_state || g.home_lineup_state || 'Projected'));
      chips.push(statusChip('Bullpen', g.availability_summary || 'Available'));
    } else {
      chips.push(statusChip('Availability', g.availability_summary || 'Updated'));
    }
    return '<div class="ca-matchup-card__chips">' + chips.join('') + '</div>';
  }

  function kickoffLabel(g) {
    if (g.kickoff_display) return g.kickoff_display;
    var iso = g.kickoff_utc;
    var d = new Date(iso || '');
    if (!iso || isNaN(d.getTime())) return 'Kickoff TBD';
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
    }) + ' ET';
  }

  function centerValue(g) {
    var live = g.game_state === 'live' || g.game_state === 'final';
    if (live && g.away_score != null && g.home_score != null) {
      return esc(g.away_score) + '–' + esc(g.home_score);
    }
    return esc(kickoffLabel(g));
  }

  function stateLabel(g) {
    var s = String(g.game_state || 'scheduled');
    if (s === 'final') return 'Final';
    if (s === 'live') return 'Live';
    if (s === 'postponed') return 'Postponed';
    if (s === 'delayed') return 'Delayed';
    return 'Scheduled';
  }

  function bookHtml(g) {
    if (!g.book || !g.book_market || !g.book_side || g.book_number == null || !g.quote_as_of_utc) return '';
    return '<p class="ca-matchup-card__book">' + esc(g.book) + ' · ' + esc(g.book_market) +
      ' · ' + esc(g.book_side) + ' ' + esc(g.book_number) +
      ' <time datetime="' + esc(g.quote_as_of_utc) + '">quoted ' + esc(g.quote_as_of_utc) + '</time></p>';
  }

  function participantRow(sport, g) {
    var aLab = sport === 'nfl' ? 'QB' : 'SP';
    var a = g.away_starter || (sport === 'nfl' ? 'QB TBD' : 'Starter TBD');
    var h = g.home_starter || (sport === 'nfl' ? 'QB TBD' : 'Starter TBD');
    return '<div class="ca-matchup-card__participants">' +
      '<span><em>' + aLab + '</em> ' + esc(a) + '</span>' +
      '<span><em>' + aLab + '</em> ' + esc(h) + '</span></div>';
  }

  function contextRow(sport, g) {
    var bits = [];
    if (g.venue) bits.push(g.venue);
    if (g.conditions) bits.push(g.conditions);
    if (!bits.length) return '<div class="ca-matchup-card__context">Venue and conditions unavailable</div>';
    return '<div class="ca-matchup-card__context">' + esc(bits.join(' · ')) + '</div>';
  }

  function tabList(sport) {
    var spec = global.ChasePublicSportRegistry && ChasePublicSportRegistry.byId(sport);
    var ids = (spec && spec.previewTabs) || ['overview'];
    var labels = {
      overview: 'Overview', lineups: 'Lineups', starters: 'Starters', bullpens: 'Bullpens',
      conditions: 'Conditions', availability: 'Availability', quarterbacks: 'Quarterbacks',
      trenches: 'Trenches', scheme: 'Scheme', rotation: 'Rotation', form: 'Team form',
      units: 'Units', tendencies: 'Tendencies'
    };
    return ids.map(function (id) {
      return { id: id, label: labels[id] || id };
    });
  }

  function previewBody(tabId, g) {
    var sport = g.sport;
    if (tabId === 'overview') {
      return '<div class="ca-preview-panel">' +
        '<p class="ca-helper">Resolved public context for this game. Deeper modules load on View full matchup.</p>' +
        participantRow(sport, g) + contextRow(sport, g) + bookHtml(g) +
        '</div>';
    }
    if (tabId === 'lineups') {
      return '<div class="ca-preview-panel"><p>Away lineup: ' + esc(g.away_lineup_state || 'Unavailable') +
        '</p><p>Home lineup: ' + esc(g.home_lineup_state || 'Unavailable') + '</p></div>';
    }
    if (tabId === 'starters' || tabId === 'quarterbacks') {
      return '<div class="ca-preview-panel">' + participantRow(sport, g) + '</div>';
    }
    if (tabId === 'conditions') {
      var bits = [g.venue, g.conditions, g.broadcast].filter(Boolean);
      return '<div class="ca-preview-panel"><p>' + esc(bits.join(' · ') || 'Venue and conditions unavailable') + '</p></div>';
    }
    if (tabId === 'availability') {
      return '<div class="ca-preview-panel"><p>' + esc(g.availability_summary || 'Availability designations are not published for this game') + '</p></div>';
    }
    return '<div class="ca-async" data-state="empty"><p>' + esc(tabId) +
      ' preview is unavailable until the public preview contract is published for this game.</p></div>';
  }

  function cardHtml(sport, g, openId, tabId) {
    var open = openId === g.id;
    var href = fullMatchupUrl(sport, g);
    var model = modelCenterUrl(sport, g);
    var tabs = tabList(sport);
    var active = tabId || 'overview';
    var tabHtml = tabs.map(function (t) {
      var sel = t.id === active;
      return '<button type="button" class="ca-preview-tab" role="tab" data-tab="' + esc(t.id) +
        '" aria-selected="' + (sel ? 'true' : 'false') + '">' + esc(t.label) + '</button>';
    }).join('');
    var preview = '';
    if (open) {
      preview = '<div class="ca-expanded-preview" id="preview-' + esc(g.id) + '" role="region" aria-label="Matchup preview">' +
        '<div class="ca-expanded-preview__head">' + esc(g.away) + ' at ' + esc(g.home) + ' · ' + esc(kickoffLabel(g)) + '</div>' +
        '<div class="ca-preview-tabs" role="tablist">' + tabHtml + '</div>' +
        previewBody(active, Object.assign({ sport: sport }, g)) +
        '<div class="ca-expanded-preview__foot">' +
        '<a class="ca-text-link" href="' + esc(href) + '">Open Matchup Analysis →</a>' +
        '<a class="ca-text-link ca-text-link--quiet" href="' + esc(model) + '">Open in Model Center ↗</a>' +
        '</div></div>';
    }
    return '<article class="ca-matchup-card' + (open ? ' is-expanded' : '') + '" data-game="' + esc(g.id) + '" data-sport="' + esc(sport) + '">' +
      '<div class="ca-matchup-card__head">' +
      '<span class="ca-matchup-card__kick">' + centerValue(g) + '</span>' +
      '<span class="ca-matchup-card__broadcast">' + esc(g.broadcast || 'TV TBD') + '</span></div>' +
      '<div class="ca-matchup-card__teams">' +
      '<div class="ca-matchup-card__team">' + entity(sport, g.away) +
      (g.away_record ? '<span class="ca-matchup-card__record">' + esc(g.away_record) + '</span>' : '') + '</div>' +
      '<div class="ca-matchup-card__center" aria-hidden="true">@</div>' +
      '<div class="ca-matchup-card__team ca-matchup-card__team--home">' + entity(sport, g.home) +
      (g.home_record ? '<span class="ca-matchup-card__record">' + esc(g.home_record) + '</span>' : '') + '</div>' +
      '</div>' +
      participantRow(sport, g) +
      statusRow(sport, g) +
      contextRow(sport, g) +
      bookHtml(g) +
      '<div class="ca-matchup-card__actions">' +
      '<button type="button" class="ca-text-link" data-expand="1" aria-expanded="' + (open ? 'true' : 'false') +
      '" aria-controls="preview-' + esc(g.id) + '">' + (open ? 'Collapse matchup' : 'Expand matchup') + '</button>' +
      '<a class="ca-text-link ca-text-link--accent" href="' + esc(href) + '">Open Matchup Analysis →</a>' +
      '</div></article>' + preview;
  }

  var expandedAll = false;

  function groupGames(sport, games) {
    var order = [];
    var grouped = {};
    var windowFn = global.ChasePublicSlate && ChasePublicSlate.kickoffWindow;
    games.forEach(function (g) {
      var key = windowFn ? windowFn(g.kickoff_utc) : 'Slate';
      if (!grouped[key]) { grouped[key] = []; order.push(key); }
      grouped[key].push(g);
    });
    return { order: order, grouped: grouped };
  }

  function asyncPaint(host, kind, detail) {
    if (global.ChaseAsyncState) ChaseAsyncState.render(host, kind, detail);
  }

  function render(host, sport, games) {
    if (!host) return;
    var openId = params().get('game');
    var tabId = params().get('preview') || 'overview';
    var pack = groupGames(sport, games);
    var html = '<div class="ca-slate-toolbar"><label><input type="checkbox" id="caExpandedCardsPref"' +
      (expandedAll ? ' checked' : '') + '> Expanded cards</label></div>';
    pack.order.forEach(function (key) {
      html += '<section class="ca-slate-group"><h2 class="ca-slate-group__title">' + esc(key) + '</h2>';
      html += '<div class="ca-slate-grid">';
      pack.grouped[key].forEach(function (g) {
        html += cardHtml(sport, g, expandedAll ? g.id : openId, tabId);
      });
      html += '</div></section>';
    });
    host.innerHTML = html;
    bind(host, sport, games);
  }

  function bind(host, sport, games) {
    host.__slate = { sport: sport, games: games };
    if (host.getAttribute('data-card-bound') === '1') return;
    host.setAttribute('data-card-bound', '1');
    host.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.id !== 'caExpandedCardsPref') return;
      expandedAll = !!t.checked;
      var pack = host.__slate || {};
      render(host, pack.sport, pack.games);
    });
    host.addEventListener('click', function (e) {
      var pack = host.__slate || {};
      var tab = e.target.closest('[data-tab]');
      if (tab) {
        var card = tab.closest('.ca-expanded-preview');
        var article = card && card.previousElementSibling;
        var id = article && article.getAttribute('data-game');
        if (id) {
          writeParams({ game: id, preview: tab.getAttribute('data-tab') });
          render(host, pack.sport, pack.games);
        }
        return;
      }
      var btn = e.target.closest('[data-expand]');
      if (!btn) return;
      var art = btn.closest('.ca-matchup-card');
      var gid = art && art.getAttribute('data-game');
      var open = art && art.classList.contains('is-expanded');
      writeParams({ game: open ? '' : gid, preview: open ? '' : 'overview' });
      render(host, pack.sport, pack.games);
    });
  }

  function mountSlate(opts) {
    opts = opts || {};
    var sport = opts.sport;
    var host = opts.host;
    var adapter = opts.adapter;
    var url = adapter && adapter.SLATE_URL;
    if (!url) {
      asyncPaint(host, 'error', 'Public slate URL missing.');
      return;
    }
    asyncPaint(host, 'loading');
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (slate) {
      if (!slate) {
        asyncPaint(host, 'error', 'Public slate was not reachable.');
        return;
      }
      if (!global.ChasePublicSlate) {
        asyncPaint(host, 'error', 'Public slate adapter missing.');
        return;
      }
      var nb = ChasePublicSlate.normalize(sport, slate);
      if (global.ChaseDataStatus) {
        ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
          return {
            sport: sport,
            state: 'ok',
            publishedAt: nb.generated_at,
            dataCutoff: nb.data_through,
            source: 'public-slate',
            issues: []
          };
        });
      }
      if (!nb.games.length) {
        asyncPaint(host, 'empty', 'No public games on this slate.');
        return;
      }
      render(host, sport, nb.games);
      if (global.ChaseAsyncState) ChaseAsyncState.ready(host);
    }).catch(function (err) {
      asyncPaint(host, 'error', err.message);
    });
  }

  global.ChaseMatchupCard = {
    mountSlate: mountSlate,
    fullMatchupUrl: fullMatchupUrl,
    modelCenterUrl: modelCenterUrl
  };
})(typeof window !== 'undefined' ? window : this);
