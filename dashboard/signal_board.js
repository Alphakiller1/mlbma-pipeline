/**
 * Daily Predictive Signal Board — Signals_Today + Signals_Convergence UI.
 */
(function(global) {
  'use strict';

  var T = MLBMA_CONFIG.SHEET_TABS;
  var S = global.MLBMASharedMatchup;

  var STATE = {
    filters: { firedOnly: false, f5Only: false, side: '', gameKey: '', minMag: 0 },
    matchups: [],
    weather: {},
    pitching: {},
    scR: {},
    scL: {},
    bullpen: {},
    pipelineTs: null,
    highlightSignalIdx: null
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function qp(name) {
    return new URLSearchParams(global.location.search).get(name) || '';
  }

  function fetchTab(name) {
    if (S && S.fetchSheetTab) return S.fetchSheetTab(name);
    var sid = MLBMA_CONFIG.SHEET_ID;
    var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(name);
    return fetch(url, { cache: 'no-store' }).then(function(r) {
      if (!r.ok) throw new Error('fetch');
      return r.text();
    }).then(function(text) {
      if (S && S.parseCsvText) return S.parseCsvText(text);
      return [];
    });
  }

  function gameKeyFromParts(away, home) {
    return String(away || '').trim().toUpperCase() + '@' + String(home || '').trim().toUpperCase();
  }

  function parseGameParam(raw) {
    if (!raw) return '';
    var s = String(raw).trim().toUpperCase().replace(/\s+/g, '');
    if (s.indexOf('@') < 0 && s.length === 6) return s.slice(0, 3) + '@' + s.slice(3);
    return s.replace(/\s*@\s*/g, '@');
  }

  function applyUrlFilters() {
    if (qp('fired') === '1') STATE.filters.firedOnly = true;
    var game = parseGameParam(qp('game'));
    if (game) STATE.filters.gameKey = game;
    var hash = (global.location.hash || '').replace(/^#/, '');
    if (hash.indexOf('signal-') === 0) {
      STATE.highlightSignalIdx = parseInt(hash.slice(7), 10);
    }
  }

  function parseLastUpdated(rows) {
    if (!rows || !rows.length) return null;
    var row = rows[0];
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v) return String(v).trim();
    }
    return null;
  }

  function isStale(tsText) {
    if (!tsText) return false;
    var d = new Date(tsText);
    if (isNaN(d.getTime())) return false;
    return (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;
  }

  function getMatchup(gk) {
    return STATE.matchups.find(function(m) {
      return gameKeyFromParts(m.away, m.home) === gk;
    });
  }

  function getPitchScore(team) {
    var p = STATE.pitching[S.teamKey(team)];
    return p ? p.pitchScore : null;
  }

  function matchupContextHtml(gk) {
    var m = getMatchup(gk);
    if (!m || !S) return '';
    var chips = [];
    var awayRow = S.splitOSI({ vsR: STATE.scR[m.away], vsL: STATE.scL[m.away] }, m.homeHand);
    var homeRow = S.splitOSI({ vsR: STATE.scR[m.home], vsL: STATE.scL[m.home] }, m.awayHand);
    var script = S.gamescriptBadge(
      awayRow ? awayRow.abq : null, homeRow ? homeRow.abq : null,
      getPitchScore(m.away), getPitchScore(m.home),
      awayRow ? awayRow.rcv : null, homeRow ? homeRow.rcv : null,
      m.awayHR9, m.homeHR9
    );
    var f5 = S.f5Badge(
      getPitchScore(m.away), getPitchScore(m.home),
      STATE.bullpen[m.home] ? STATE.bullpen[m.home].osiAllowed : null,
      STATE.bullpen[m.away] ? STATE.bullpen[m.away].osiAllowed : null
    );
    chips.push('<span class="mr-chip script">' + esc(script.label) + '</span>');
    chips.push('<span class="mr-chip f5">' + esc(f5.label) + '</span>');
    var w = STATE.weather[gk];
    if (w) chips.push('<span class="mr-chip weather">' + (w.dome ? 'DOME' : esc(w.raw || w.conditions).slice(0, 24)) + '</span>');
    return chips.length ? '<div class="mr-chips">' + chips.join('') + '</div>' : '';
  }

  function renderHero(LD) {
    var el = document.getElementById('sbHero');
    if (!el) return;
    var signals = LD.signalsToday || [];
    var conv = LD.signalsConvergence || [];
    var fired = signals.filter(function(r) {
      return global.MLBMASignals && MLBMASignals.truthy(MLBMASignals.pickCol(r, ['fired', 'Fired']));
    });
    var plays = conv.filter(function(r) {
      return global.MLBMASignals && MLBMASignals.isConvergencePlay(r);
    });
    var staleHtml = isStale(STATE.pipelineTs)
      ? '<div class="mr-stale-banner">Pipeline data may be stale — last update: ' + esc(STATE.pipelineTs || 'unknown') + '</div>'
      : '';
    el.innerHTML = staleHtml
      + '<div class="mr-hero-top">'
      + '<div><div class="ca-title-with-icon">'
      + (global.MLBMAIcons && MLBMAIcons.iconCircleHtml ? MLBMAIcons.iconCircleHtml('target', true) : '')
      + '<h1 class="mr-title">Signal Board</h1></div>'
      + '<p class="mr-subtitle">Tonight\'s fired model signals, convergence plays, and game-context reads.</p></div>'
      + '</div>'
      + '<div class="mr-stats">'
      + '<div class="mr-stat"><div class="mr-stat-val">' + (STATE.matchups.length || '—') + '</div><div class="mr-stat-label">Games</div></div>'
      + '<div class="mr-stat"><div class="mr-stat-val">' + fired.length + '</div><div class="mr-stat-label">Signals Fired</div></div>'
      + '<div class="mr-stat"><div class="mr-stat-val">' + plays.length + '</div><div class="mr-stat-label">Convergence Plays</div></div>'
      + '<div class="mr-stat"><div class="mr-stat-val">' + signals.length + '</div><div class="mr-stat-label">Evaluated</div></div>'
      + '</div>';
  }

  function bindFilters() {
    document.querySelectorAll('[data-sb-filter]').forEach(function(btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function() {
        var key = btn.getAttribute('data-sb-filter');
        if (key === 'fired') {
          STATE.filters.firedOnly = !STATE.filters.firedOnly;
          btn.classList.toggle('active', STATE.filters.firedOnly);
        } else if (key === 'f5') {
          STATE.filters.f5Only = !STATE.filters.f5Only;
          btn.classList.toggle('active', STATE.filters.f5Only);
        } else if (key === 'clear-game') {
          STATE.filters.gameKey = '';
          document.querySelectorAll('.mr-conv-card.active').forEach(function(c) { c.classList.remove('active'); });
          syncGamePill();
        } else if (key === 'side-away' || key === 'side-home') {
          var side = key === 'side-away' ? 'away' : 'home';
          STATE.filters.side = STATE.filters.side === side ? '' : side;
          document.querySelectorAll('[data-sb-filter^="side-"]').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-sb-filter') === 'side-' + STATE.filters.side);
          });
        }
        renderAll();
      });
    });
  }

  function syncGamePill() {
    var pill = document.getElementById('sbGameFilterPill');
    if (!pill) return;
    if (STATE.filters.gameKey) {
      pill.textContent = 'Game: ' + STATE.filters.gameKey;
      pill.classList.add('active');
      pill.style.display = '';
    } else {
      pill.style.display = 'none';
    }
  }

  function renderAll() {
    var LD = global.LIVE_DATA || {};
    if (global.MLBMASignals) {
      MLBMASignals.renderExplorer({
        filters: STATE.filters,
        highlightSignalIdx: STATE.highlightSignalIdx,
        matchupContextHtml: matchupContextHtml,
        compareUrl: function(away, home) {
          return 'matchup_compare.html?away=' + encodeURIComponent(away) + '&home=' + encodeURIComponent(home);
        }
      });
    }
    syncGamePill();
    if (STATE.highlightSignalIdx != null && !isNaN(STATE.highlightSignalIdx)) {
      var row = document.getElementById('signal-row-' + STATE.highlightSignalIdx);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function load() {
    applyUrlFilters();
    global.LIVE_DATA = global.LIVE_DATA || {};

    Promise.all([
      fetchTab(T.signals_today).catch(function() { return []; }),
      fetchTab(T.signals_convergence).catch(function() { return []; }),
      fetchTab(T.today_matchups).catch(function() { return []; }),
      fetchTab(T.weather).catch(function() { return []; }),
      fetchTab(T.last_updated).catch(function() { return []; }),
      fetchTab(T.vs_rhp).catch(function() { return []; }),
      fetchTab(T.vs_lhp).catch(function() { return []; }),
      fetchTab(T.pitching_score).catch(function() { return []; }),
      fetchTab(T.bullpen_unit).catch(function() { return []; })
    ]).then(function(res) {
      LIVE_DATA.signalsToday = res[0] || [];
      LIVE_DATA.signalsConvergence = res[1] || [];
      STATE.matchups = S ? S.parseMatchupRows(res[2]) : [];
      STATE.weather = S ? (function(rows) {
        var map = {};
        (rows || []).forEach(function(row) {
          var away = S.teamKey(S.pickCol(row, 'Away'));
          var home = S.teamKey(S.pickCol(row, 'Home'));
          if (!away || !home) return;
          var w = S.parseWeatherRow(row);
          if (!w.temp && w.raw) {
            var p = S.parseWeatherString(w.raw);
            w.temp = p.temp; w.wind = p.wind; w.dome = p.dome;
          }
          map[away + '@' + home] = w;
        });
        return map;
      })(res[3]) : {};
      STATE.pipelineTs = parseLastUpdated(res[4]);
      STATE.scR = {};
      STATE.scL = {};
      (res[5] || []).forEach(function(row) {
        var scored = S.scoreRowFromSheet(row);
        if (scored) STATE.scR[scored.t] = scored;
      });
      (res[6] || []).forEach(function(row) {
        var scored = S.scoreRowFromSheet(row);
        if (scored) STATE.scL[scored.t] = scored;
      });
      STATE.pitching = S ? S.parsePitchingRows(res[7]) : {};
      STATE.bullpen = S ? S.parseBullpenUnitRows(res[8]) : {};

      renderHero(LIVE_DATA);
      bindFilters();
      if (STATE.filters.firedOnly) {
        var fb = document.querySelector('[data-sb-filter="fired"]');
        if (fb) fb.classList.add('active');
      }
      if (STATE.filters.gameKey) syncGamePill();
      renderAll();
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    }).catch(function(err) {
      console.error(err);
      var hero = document.getElementById('sbHero');
      if (hero) hero.innerHTML = '<p class="ca-helper">Could not load signal board data.</p>';
      if (global.MLBMA_UI) MLBMA_UI.hideLoadingOverlay();
    });
  }

  global.SignalBoard = {
    load: load,
    setGameFilter: function(gk) {
      if (STATE.filters.gameKey === gk) STATE.filters.gameKey = '';
      else STATE.filters.gameKey = gk || '';
      syncGamePill();
      renderAll();
      document.querySelectorAll('.mr-conv-card').forEach(function(c) {
        c.classList.toggle('active', c.getAttribute('data-game-key') === STATE.filters.gameKey);
      });
    },
    getState: function() { return STATE; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})(window);
