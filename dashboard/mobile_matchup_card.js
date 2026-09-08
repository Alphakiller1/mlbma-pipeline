/**
 * mobile_matchup_card.js — RotoWire-inspired, MOBILE-ONLY restructure of the
 * hero matchup cards into a compact scoreboard / game-preview card.
 *
 * Strategy: never re-render the card (that's matchup_shared.js's job and powers
 * desktop). Instead, on phones/tablets only, INJECT a few mobile-only sub-blocks
 * built entirely from the card's own already-rendered DOM, and tag the card
 * `.mcm-enhanced` so responsive.css can reflow the existing rows into the
 * scoreboard layout.
 *
 * Desktop safety (two independent guards):
 *   1. This script only injects when matchMedia('(max-width: 768px)') matches,
 *      so a desktop that never narrows keeps a pristine card DOM.
 *   2. Every injected `.mcm-*` element is ALSO CSS-gated to <=768px in
 *      responsive.css, so even if the viewport is resized after injection the
 *      extra blocks are display:none on desktop — no visual/behaviour change.
 *
 * Data: read straight from the card DOM (abbr, records, time, weather, pitchers,
 * OSI edge, pitcher/team links). No LIVE_DATA coupling, so it survives re-renders
 * and data-shape changes. Anything not present in the data (umpire, betting line,
 * O/U) is simply omitted — no fabricated fields.
 */
(function () {
  'use strict';

  var MQ = window.matchMedia('(max-width: 768px)');

  function txt(el, sel) {
    var n = el.querySelector(sel);
    return n ? n.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function chip(label, href, hash) {
    var h = href + (hash || '');
    return '<a class="mcm-chip" href="' + h + '" onclick="event.stopPropagation()">' +
           '<span class="mcm-chip__dot" aria-hidden="true"></span>' +
           '<span class="mcm-chip__t">' + label + '</span></a>';
  }

  // A compact "Projected" status badge. The lineup feed carries projected
  // lineups only (no per-game confirmed flag today), so we label honestly and
  // leave a hook (data-mcm-status) for a future confirmed signal.
  function statusBadge(team) {
    return '<span class="mcm-status" data-mcm-status="projected">' +
           '<span class="mcm-status__dot"></span>' +
           '<span class="mcm-status__t">Projected</span>' +
           '<span class="mcm-status__team">' + team + '</span></span>';
  }

  function enhance(card) {
    if (!card || card.classList.contains('mcm-enhanced')) return;
    var away = card.getAttribute('data-away') || '';
    var home = card.getAttribute('data-home') || '';
    var time = txt(card, '.hmc-time');
    var cmp = 'matchup_compare.html?away=' + encodeURIComponent(away) +
              '&home=' + encodeURIComponent(home);

    // ── 1. Action row: prominent time + tappable chips (real routes only). ──
    var actions = document.createElement('div');
    actions.className = 'mcm-actions';
    actions.innerHTML =
      '<span class="mcm-time">' + (time || '—') + '</span>' +
      '<div class="mcm-chips">' +
        chip('Full Analysis', cmp) +
        chip('Bullpen', 'bullpen_report.html') +
        chip('Signals', cmp, '#signals') +
      '</div>';
    card.insertBefore(actions, card.firstChild);

    // ── 2. Lineup status row (away | home) above the lineups. ──
    var lineupsHost = card.querySelector('.matchup-lineup-grid') ||
                      card.querySelector('.hmc-lineups');
    if (lineupsHost) {
      var status = document.createElement('div');
      status.className = 'mcm-status-row';
      status.innerHTML = statusBadge(away) + statusBadge(home);
      lineupsHost.parentNode.insertBefore(status, lineupsHost);
    }

    // ── 3. Game-context footer strip. Only real fields: weather + stadium +
    //       model (lineup) edge. Umpire / betting line / O/U are not in the
    //       data feed, so they are intentionally omitted. ──
    var temp = txt(card, '.hmc-weather-chip--temp');
    var windLabel = txt(card, '.hmc-wind-label');
    var windMph = txt(card, '.hmc-wind-mph');
    var cond = txt(card, '.hmc-weather-chip--cond');
    var dome = txt(card, '.hmc-weather-chip--dome');
    var stadium = txt(card, '.hmc-stadium');

    var osi = card.querySelectorAll('.hmc-osi-num');
    var edgeCell = '';
    if (osi.length >= 2) {
      var a = parseFloat(osi[0].textContent), h = parseFloat(osi[1].textContent);
      if (!isNaN(a) && !isNaN(h)) {
        var diff = a - h;
        var lead = diff >= 0 ? away : home;
        var mag = Math.abs(diff).toFixed(1);
        edgeCell = '<div class="mcm-foot-cell"><span class="mcm-foot-k">Lineup Edge</span>' +
                   '<span class="mcm-foot-v">' + lead + ' +' + mag + '</span></div>';
      }
    }

    var wx = dome ? 'Dome' :
      [temp, (windMph ? windMph + ' mph ' + windLabel : ''), cond]
        .filter(Boolean).join(' · ');
    var footCells = '';
    if (wx) footCells += '<div class="mcm-foot-cell"><span class="mcm-foot-k">Weather</span>' +
                         '<span class="mcm-foot-v">' + wx + '</span></div>';
    if (stadium) footCells += '<div class="mcm-foot-cell"><span class="mcm-foot-k">Venue</span>' +
                              '<span class="mcm-foot-v">' + stadium + '</span></div>';
    footCells += edgeCell;
    if (footCells) {
      var foot = document.createElement('div');
      foot.className = 'mcm-footer';
      foot.innerHTML = footCells;
      var viewFull = card.querySelector('.hmc-view-full');
      if (viewFull) card.insertBefore(foot, viewFull);
      else card.appendChild(foot);
    }

    card.classList.add('mcm-enhanced');
  }

  function run() {
    if (!MQ.matches) return;
    var cards = document.querySelectorAll('.hero-matchup-card');
    for (var i = 0; i < cards.length; i++) enhance(cards[i]);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled || !MQ.matches) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { scheduled = false; run(); });
  }

  function init() {
    run();
    // Cards (re)render on slate load / nav. Re-enhance newly inserted ones.
    if (window.MutationObserver && document.body) {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    // If a desktop viewport is later narrowed into mobile range, enhance then.
    var onChange = function () { if (MQ.matches) run(); };
    if (MQ.addEventListener) MQ.addEventListener('change', onChange);
    else if (MQ.addListener) MQ.addListener(onChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MLBMAMobileMatchupCard = { run: run, enhance: enhance };
})();
