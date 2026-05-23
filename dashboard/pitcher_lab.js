/**
 * Research Lab — Pitcher Lab tab
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
  var CACHE = {
    profiles: null, sortKey: 'pitchScore', sortDir: -1, selected: '',
    searchQ: '', dropdownOpen: false
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 1 : d);
  }

  function pickCol(row, names) {
    return S ? S.pickCol(row, names) : '';
  }

  function normName(n) {
    return S ? S.normName(n) : String(n || '').toLowerCase().trim();
  }

  function mColor(v, invert, ctx) {
    if (!A) return '#71717A';
    if (ctx === 'oor') return A.contextualOorColor ? A.contextualOorColor(v) : '#71717A';
    return A.metricColor(v, ctx || 'osi', !!invert);
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Ace', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Average', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function profileMetrics(row) {
    return (row && S && S.spProfileMetrics) ? S.spProfileMetrics(row) : {};
  }

  function isStale(row) {
    return !!(profileMetrics(row).stale);
  }

  function oorCompLabel(oor) {
    if (oor == null || isNaN(oor)) return 'Near';
    if (oor >= 55) return 'Above';
    if (oor <= 45) return 'Below';
    return 'Near';
  }

  function loadProfiles() {
    if (CACHE.profiles && CACHE.profiles.length) return Promise.resolve(CACHE.profiles);
    if (global.ResearchLab && global.LIVE_DATA && LIVE_DATA.spProfiles && LIVE_DATA.spProfiles.length) {
      CACHE.profiles = LIVE_DATA.spProfiles;
      return Promise.resolve(CACHE.profiles);
    }
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      CACHE.profiles = rows || [];
      var oorMap = S.buildOorByTeam && global.LIVE_DATA && LIVE_DATA.oor
        ? S.buildOorByTeam(LIVE_DATA.oor) : {};
      if (S.enrichSpProfiles) S.enrichSpProfiles(CACHE.profiles, oorMap);
      if (global.LIVE_DATA) LIVE_DATA.spProfiles = CACHE.profiles;
      return CACHE.profiles;
    }).catch(function() { CACHE.profiles = []; return []; });
  }

  function findProfile(keyOrName) {
    var key = normName(keyOrName);
    return (CACHE.profiles || []).find(function(row) {
      return normName(pickCol(row, ['pitcher_name', 'Name', 'Pitcher'])) === key;
    }) || null;
  }

  function searchMatches(q) {
    q = String(q || '').toLowerCase().trim();
    if (!q) return [];
    return (CACHE.profiles || []).filter(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    }).slice(0, 12);
  }

  function renderDropdown(items) {
    var dd = document.getElementById('plSearchDropdown');
    if (!dd) return;
    if (!items.length) { dd.innerHTML = ''; dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = items.map(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
      var m = profileMetrics(row);
      var av = A ? A.pitcherAvatar(n, { crop: 'compare', className: 'pl-dd-av' }) : '';
      return '<button type="button" class="pl-dd-item" data-name="' + esc(n) + '">'
        + av + '<span class="pl-dd-name">' + esc(n) + '</span>'
        + '<span class="pl-dd-meta">' + esc(t) + ' · ' + esc(hand) + 'HP · PS ' + fmt(m.pitchScore, 0) + '</span></button>';
    }).join('');
    dd.querySelectorAll('.pl-dd-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        selectPitcher(btn.getAttribute('data-name'));
        dd.style.display = 'none';
      });
    });
  }

  function selectPitcher(name) {
    CACHE.selected = name;
    var inp = document.getElementById('plPitcherSearch');
    if (inp) inp.value = name;
    renderSnapshot();
    renderRankings();
  }

  function bettingContext(row, met) {
    var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var ps = met.pitchScore;
    var tier = pitchTier(ps);
    var allow = met.osiAllowed;
    var oor = met.oor;
    var comp = oorCompLabel(oor);
    var allowNote = allow != null && allow < 50 ? 'below' : (allow > 55 ? 'above' : 'near');
    var stale = isStale(row);
    var uses = [];
    if (ps >= 65) uses.push('F5 unders', 'pitcher K props');
    if (allow != null && allow > 58) uses.push('opposing team overs');
    if (met.kPct >= 24) uses.push('strikeout props');
    if (stale) uses.push('verify recent starts before betting');
    if (!uses.length) uses.push('matchup-specific totals', 'first-inning props');
    return '<div class="pl-betting-context">'
      + '<p><strong>' + esc(name) + '</strong> has a Pitching Score of <strong style="color:' + mColor(ps, false, 'pitching') + '">'
      + fmt(ps, 0) + '</strong> (' + esc(tier.label) + '). Opposing lineups have generated an OSI Allowed of '
      + '<strong style="color:' + mColor(allow, true) + '">' + fmt(allow) + '</strong> against him — '
      + allowNote + ' league average. He has faced <strong>' + comp.toLowerCase() + '</strong> average competition (OOR '
      + fmt(oor, 0) + ').'
      + (stale ? ' <em class="pl-stale-warn">⚠ Stale sample — refresh pipeline before betting.</em>' : '')
      + '</p><p class="pl-best-bets"><strong>Best bet uses:</strong> ' + esc(uses.join(', ')) + '.</p></div>';
  }

  function renderSnapshot() {
    var mount = document.getElementById('plSnapshotMount');
    if (!mount) return;
    var row = findProfile(CACHE.selected);
    if (!row) {
      mount.innerHTML = '';
      return;
    }
    var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
    var hand = String(pickCol(row, ['hand', 'Hand', 'pitcher_hand']) || 'R').charAt(0);
    var met = profileMetrics(row);
    var tier = pitchTier(met.pitchScore);
    var avatar = A ? A.pitcherAvatar(name, { crop: 'profile', className: 'pl-snap-avatar', eager: true }) : '';
    var logo = A ? A.teamLogoImg(team, 28) : '';
    mount.innerHTML = '<div class="pl-snapshot-card">'
      + '<div class="pl-snap-row1">' + avatar
      + '<div><h3 class="pl-snap-name">' + esc(name) + '</h3>'
      + '<div class="pl-snap-meta">' + logo + ' <span class="hand-pill hand-' + hand.toLowerCase() + '">' + esc(hand) + 'HP</span>'
      + ' <span class="tier-badge ' + tier.cls + '">Pitch Score ' + fmt(met.pitchScore, 0) + ' · ' + esc(tier.label) + '</span></div></div></div>'
      + '<div class="pl-snap-row2"><span>K% <strong>' + fmt(met.kPct, 1) + '</strong></span>'
      + '<span>BB% <strong>' + fmt(met.bbPct, 1) + '</strong></span>'
      + '<span>HR/9 <strong>' + fmt(met.hr9, 2) + '</strong></span>'
      + '<span>FIP/ERA <strong>' + fmt(met.fip != null ? met.fip : met.era, 2) + '</strong></span>'
      + '<span>IP <strong>' + fmt(pickCol(row, ['IP', 'ip']), 1) + '</strong></span></div>'
      + '<div class="pl-allowed-row">'
      + allowedCard('OSI Allowed', met.osiAllowed)
      + allowedCard('ABQ Allowed', met.abqAllowed)
      + allowedCard('RCV Allowed', met.rcvAllowed)
      + allowedCard('OBR Allowed', met.obrAllowed)
      + '</div>'
      + '<div class="pl-oor-line">Competition: <strong>' + esc(oorCompLabel(met.oor)) + ' average</strong> (OOR '
      + '<span style="color:' + mColor(met.oor, false, 'oor') + '">' + fmt(met.oor, 0) + '</span>)'
      + (isStale(row) ? ' · <span class="pl-stale-pill">Stale sample</span>' : ' · <span class="pl-fresh-pill">Fresh</span>')
      + '</div>'
      + bettingContext(row, met)
      + '<p class="rl-profile-link"><a href="pitcher_profile.html?pitcher=' + encodeURIComponent(name) + '">Full pitcher profile →</a></p>'
      + '</div>';
  }

  function allowedCard(label, v) {
    return '<div class="pl-allowed-card"><div class="ca-metric-label">' + esc(label) + '</div>'
      + '<div class="pl-allowed-val" style="color:' + mColor(v, true, 'osi') + '">' + fmt(v) + '</div></div>';
  }

  function renderSearchMount(root) {
    root.innerHTML = '<div class="pl-search-block">'
      + '<label for="plPitcherSearch" class="pl-search-label">Search by pitcher name or team…</label>'
      + '<div class="pl-search-wrap">'
      + '<input type="search" id="plPitcherSearch" class="pl-search-input" placeholder="Search by pitcher name or team…" autocomplete="off">'
      + '<div id="plSearchDropdown" class="pl-search-dropdown"></div></div></div>'
      + '<div id="plSnapshotMount"></div>'
      + '<div id="plRankingsMount"></div>';

    var inp = document.getElementById('plPitcherSearch');
    if (inp) {
      inp.addEventListener('input', function() {
        CACHE.searchQ = inp.value;
        renderDropdown(searchMatches(inp.value));
        renderRankings();
      });
      inp.addEventListener('focus', function() {
        renderDropdown(searchMatches(inp.value));
      });
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.pl-search-wrap')) {
        var dd = document.getElementById('plSearchDropdown');
        if (dd) dd.style.display = 'none';
      }
    });
  }

  function filteredProfiles() {
    var q = CACHE.searchQ.toLowerCase().trim();
    return (CACHE.profiles || []).filter(function(row) {
      if (!q) return true;
      var n = pickCol(row, ['pitcher_name', 'Name']).toLowerCase();
      var t = pickCol(row, ['pitcher_team', 'Team']).toLowerCase();
      return n.indexOf(q) >= 0 || t.indexOf(q) >= 0;
    });
  }

  function sortProfiles(rows) {
    var key = CACHE.sortKey, dir = CACHE.sortDir;
    return rows.slice().sort(function(a, b) {
      var ma = profileMetrics(a), mb = profileMetrics(b);
      var av = ma[key], bv = mb[key];
      if (key === 'name') return dir * String(pickCol(a, ['pitcher_name'])).localeCompare(String(pickCol(b, ['pitcher_name'])));
      if (av == null) av = -999;
      if (bv == null) bv = -999;
      return dir * (av - bv);
    });
  }

  function renderRankings() {
    var mount = document.getElementById('plRankingsMount');
    if (!mount) return;
    var rows = sortProfiles(filteredProfiles());
    if (!rows.length) {
      mount.innerHTML = '<p class="rl-empty">No pitchers match — load SP_Profiles or clear search.</p>';
      return;
    }
    function th(k, label) {
      return '<th class="pl-sort-th' + (CACHE.sortKey === k ? ' sorted' : '') + '" data-plsort="' + k + '">' + esc(label) + '</th>';
    }
    mount.innerHTML = '<div class="rl-table-wrap pl-rank-wrap"><table class="rl-table-premium pl-rank-table"><thead><tr>'
      + '<th>#</th>' + th('name', 'Pitcher') + th('team', 'Team') + th('hand', 'Hand')
      + th('pitchScore', 'Pitch Score') + th('kPct', 'K%') + th('bbPct', 'BB%') + th('hr9', 'HR/9')
      + th('osiAllowed', 'OSI Allowed') + th('abqAllowed', 'ABQ Allowed') + th('oor', 'OOR') + th('stale', 'Stale')
      + '</tr></thead><tbody>'
      + rows.map(function(row, i) {
        var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
        var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
        var hand = String(pickCol(row, ['hand', 'Hand']) || '?').charAt(0);
        var m = profileMetrics(row);
        var sel = CACHE.selected === n ? ' pl-rank-row--selected' : '';
        return '<tr class="pl-rank-row' + sel + '" data-pitcher="' + esc(n) + '">'
          + '<td>' + (i + 1) + '</td>'
          + '<td>' + (A ? A.pitcherAvatar(n, { crop: 'compare', className: 'pl-rank-av' }) : '') + esc(n) + '</td>'
          + '<td>' + (A ? A.teamLogoImg(t, 20) : '') + ' ' + esc(t) + '</td>'
          + '<td>' + esc(hand) + '</td>'
          + '<td class="num" style="color:' + mColor(m.pitchScore, false, 'pitching') + '">' + fmt(m.pitchScore, 0) + '</td>'
          + '<td class="num">' + fmt(m.kPct, 1) + '</td>'
          + '<td class="num">' + fmt(m.bbPct, 1) + '</td>'
          + '<td class="num">' + fmt(m.hr9, 2) + '</td>'
          + '<td class="num" style="color:' + mColor(m.osiAllowed, true) + '">' + fmt(m.osiAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.abqAllowed, true) + '">' + fmt(m.abqAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(m.oor, false, 'oor') + '">' + fmt(m.oor) + '</td>'
          + '<td>' + (isStale(row) ? '<span class="pl-stale-pill">Stale</span>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    mount.querySelectorAll('[data-plsort]').forEach(function(th) {
      th.addEventListener('click', function() {
        var k = th.getAttribute('data-plsort');
        if (CACHE.sortKey === k) CACHE.sortDir *= -1;
        else { CACHE.sortKey = k; CACHE.sortDir = -1; }
        renderRankings();
      });
    });
    mount.querySelectorAll('.pl-rank-row').forEach(function(tr) {
      tr.addEventListener('click', function() {
        selectPitcher(tr.getAttribute('data-pitcher'));
      });
    });
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || 'rlPitcherLabRoot');
    if (!root) return;
    root.innerHTML = '<p class="rl-loading">Loading pitcher profiles…</p>';
    loadProfiles().then(function(rows) {
      renderSearchMount(root);
      renderRankings();
      if (rows.length && !CACHE.selected) {
        CACHE.selected = pickCol(rows[0], ['pitcher_name', 'Name', 'Pitcher']);
        renderSnapshot();
      }
    }).catch(function(err) {
      root.innerHTML = '<p class="rl-empty">Error loading SP_Profiles: ' + esc(String(err)) + '</p>';
    });
  }

  global.PitcherLab = { mount: mount, loadProfiles: loadProfiles };
})(typeof window !== 'undefined' ? window : this);
