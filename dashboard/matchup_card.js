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
    if (global.ChaseEntity) return ChaseEntity.html({ name: name, id: name, sport: sport });
    return esc(name || '');
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
    var a = g.away_starter || 'Starter TBD';
    var h = g.home_starter || 'Starter TBD';
    if (sport === 'nfl') {
      a = g.away_starter || 'QB TBD';
      h = g.home_starter || 'QB TBD';
    }
    return '<div class="ca-matchup-card__participants"><span>' + esc(a) + '</span><span>' + esc(h) + '</span></div>';
  }

  function contextRow(sport, g) {
    var bits = [];
    if (sport === 'mlb') {
      if (g.away_lineup_state) bits.push('Away lineup ' + g.away_lineup_state);
      if (g.home_lineup_state) bits.push('Home lineup ' + g.home_lineup_state);
    } else if (g.availability_summary) {
      bits.push(g.availability_summary);
    }
    if (g.venue) bits.push(g.venue);
    if (g.broadcast) bits.push(g.broadcast);
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
    if (tabId === 'overview') {
      return '<div class="ca-preview-panel">' +
        '<p class="ca-helper">Resolved public context for this game. Deeper modules load on View full matchup.</p>' +
        participantRow(g.sport, g) + contextRow(g.sport, g) + bookHtml(g) +
        '</div>';
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
        '<a class="ca-text-link" href="' + esc(href) + '">View full matchup</a>' +
        '<a class="ca-text-link ca-text-link--quiet" href="' + esc(model) + '">Open in Model Center ↗</a>' +
        '</div></div>';
    }
    return '<article class="ca-matchup-card' + (open ? ' is-expanded' : '') + '" data-game="' + esc(g.id) + '" data-sport="' + esc(sport) + '">' +
      '<div class="ca-matchup-card__status"><span>' + esc(stateLabel(g)) + '</span>' +
      '<span>' + esc((g.freshness && g.freshness.state) || 'Current') + '</span></div>' +
      '<div class="ca-matchup-card__teams">' +
      '<div class="ca-matchup-card__team">' + entity(sport, g.away) +
      (g.away_record ? '<span class="ca-matchup-card__record">' + esc(g.away_record) + '</span>' : '') + '</div>' +
      '<div class="ca-matchup-card__center">' + centerValue(g) + '</div>' +
      '<div class="ca-matchup-card__team ca-matchup-card__team--home">' + entity(sport, g.home) +
      (g.home_record ? '<span class="ca-matchup-card__record">' + esc(g.home_record) + '</span>' : '') + '</div>' +
      '</div>' +
      participantRow(sport, g) +
      contextRow(sport, g) +
      bookHtml(g) +
      '<div class="ca-matchup-card__actions">' +
      '<button type="button" class="ca-btn ca-btn--secondary" data-expand="1" aria-expanded="' + (open ? 'true' : 'false') +
      '" aria-controls="preview-' + esc(g.id) + '">' + (open ? 'Collapse matchup' : 'Expand matchup') + '</button>' +
      '<a class="ca-btn ca-btn--primary" href="' + esc(href) + '">View full matchup</a>' +
      '</div></article>' + preview;
  }

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

  function render(host, sport, games) {
    if (!host) return;
    var openId = params().get('game');
    var tabId = params().get('preview') || 'overview';
    var pack = groupGames(sport, games);
    var html = '<div class="ca-slate-toolbar"><label><input type="checkbox" id="caExpandedCardsPref"> Expanded cards</label></div>';
    pack.order.forEach(function (key) {
      html += '<section class="ca-slate-group"><h2 class="ca-slate-group__title">' + esc(key) + '</h2>';
      html += '<div class="ca-slate-grid">';
      pack.grouped[key].forEach(function (g) { html += cardHtml(sport, g, openId, tabId); });
      html += '</div></section>';
    });
    host.innerHTML = html;
    bind(host, sport, games);
  }

  function bind(host, sport, games) {
    host.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab) {
        var card = tab.closest('.ca-expanded-preview');
        var article = card && card.previousElementSibling;
        var id = article && article.getAttribute('data-game');
        if (id) {
          writeParams({ game: id, preview: tab.getAttribute('data-tab') });
          render(host, sport, games);
        }
        return;
      }
      var btn = e.target.closest('[data-expand]');
      if (!btn) return;
      var art = btn.closest('.ca-matchup-card');
      var gid = art && art.getAttribute('data-game');
      var open = art && art.classList.contains('is-expanded');
      writeParams({ game: open ? '' : gid, preview: open ? '' : 'overview' });
      render(host, sport, games);
    });
  }

  function mountSlate(opts) {
    opts = opts || {};
    var sport = opts.sport;
    var host = opts.host;
    var adapter = opts.adapter;
    var url = adapter && adapter.SLATE_URL;
    if (!url) {
      if (global.ChaseAsyncState) ChaseAsyncState.render(host, 'error', 'Public slate URL missing.');
      return;
    }
    if (global.ChaseAsyncState) ChaseAsyncState.render(host, 'loading');
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (slate) {
      if (!slate) {
        ChaseAsyncState.render(host, 'error', 'Public slate was not reachable.');
        return;
      }
      var nb = global.ChasePublicSlate.normalize(sport, slate);
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
        ChaseAsyncState.render(host, 'empty', 'No public games on this slate.');
        return;
      }
      render(host, sport, nb.games);
      if (global.ChaseAsyncState) ChaseAsyncState.ready(host);
    }).catch(function (err) {
      ChaseAsyncState.render(host, 'error', err.message);
    });
  }

  global.ChaseMatchupCard = {
    mountSlate: mountSlate,
    fullMatchupUrl: fullMatchupUrl,
    modelCenterUrl: modelCenterUrl
  };
})(typeof window !== 'undefined' ? window : this);
