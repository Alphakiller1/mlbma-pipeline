/**
 * Research Lab — Pitcher Lab tab (SP profiles, allowed metrics, rankings).
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;
  var S = global.MLBMASharedMatchup;
  var TABS = global.MLBMA_CONFIG && MLBMA_CONFIG.SHEET_TABS;
  var CACHE = {
    profiles: null, sortKey: 'pitchScore', sortDir: -1, selected: '',
    teamFilter: '', handFilter: 'all', searchQ: ''
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
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
    return A.metricColor(v, ctx || 'pitching', !!invert);
  }

  function cell(opts) {
    return A && A.metricCell ? A.metricCell(opts) : '';
  }

  function trendLabel(row) {
    var drift = num(pickCol(row, ['L14_drift', 'osi_drift', 'drift']));
    if (isStale(row)) return 'Stale Sample';
    if (drift == null) return 'No recent data';
    if (drift <= -4) return 'Improving';
    if (drift >= 4) return 'Declining';
    if (Math.abs(drift) >= 2) return 'Volatile';
    return 'Stable';
  }

  function pitchTier(score) {
    if (score == null || isNaN(score)) return { label: '—', cls: 'tier-mid' };
    if (score >= 70) return { label: 'Elite', cls: 'tier-elite' };
    if (score >= 55) return { label: 'Solid', cls: 'tier-solid' };
    if (score >= 40) return { label: 'Avg', cls: 'tier-mid' };
    return { label: 'Volatile', cls: 'tier-vol' };
  }

  function profileMetrics(row) {
    if (!row) return {};
    var base = (S && S.spProfileMetrics) ? S.spProfileMetrics(row) : {};
    return Object.assign({
      kPct: null, bbPct: null, hr9: null, fip: null, xfip: null,
      osiAllowed: null, abqAllowed: null, rcvAllowed: null, obrAllowed: null,
      oor: null, pitchScore: null
    }, base, {
      pitchScore: num(pickCol(row, ['PitchScore', 'Pitching Score', 'pitch_score', 'pitchscore']))
    });
  }

  function percentileRank(value, values, lowerIsBetter) {
    var nums = values.filter(function(v) { return v != null && !isNaN(v); });
    if (value == null || isNaN(value) || !nums.length) return null;
    var better = nums.filter(function(v) { return lowerIsBetter ? v >= value : v <= value; }).length;
    return Math.round((better / nums.length) * 100);
  }

  function isStale(row) {
    var flag = String(pickCol(row, ['staleness_flag', 'staleness', 'stale'])).toLowerCase();
    var drift = num(pickCol(row, ['L14_drift', 'osi_drift', 'drift']));
    return flag === 'true' || flag === '1' || flag === 'stale' || flag === 'yes'
      || (drift != null && Math.abs(drift) >= 5);
  }

  function l14Form(row) {
    var drift = num(pickCol(row, ['L14_drift', 'osi_drift', 'drift']));
    if (drift == null) return '—';
    return (drift > 0 ? '+' : '') + drift.toFixed(1);
  }

  function oorLabel(oor) {
    if (oor == null || isNaN(oor)) return '';
    if (oor >= 55) return 'Above avg competition';
    if (oor <= 45) return 'Below avg competition';
    return 'Near avg competition';
  }

  function loadProfiles() {
    if (CACHE.profiles) return Promise.resolve(CACHE.profiles);
    if (!S || !TABS) return Promise.resolve([]);
    return S.fetchSheetTab(TABS.sp_profiles).then(function(rows) {
      CACHE.profiles = rows || [];
      return CACHE.profiles;
    }).catch(function() { CACHE.profiles = []; return []; });
  }

  function findProfile(keyOrName) {
    var key = normName(keyOrName);
    return (CACHE.profiles || []).find(function(row) {
      return normName(pickCol(row, ['pitcher_name', 'Name', 'Pitcher'])) === key
        || normName(pickCol(row, ['pitcher_key', 'key'])) === key;
    }) || null;
  }

  function teamOptions() {
    var set = {};
    (CACHE.profiles || []).forEach(function(row) {
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      if (t) set[t] = true;
    });
    return Object.keys(set).sort();
  }

  function filteredProfiles() {
    return (CACHE.profiles || []).filter(function(row) {
      var name = pickCol(row, ['pitcher_name', 'Name']);
      var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      var hand = String(pickCol(row, ['pitcher_hand', 'Hand']) || 'R').charAt(0).toUpperCase();
      if (CACHE.teamFilter && team !== CACHE.teamFilter) return false;
      if (CACHE.handFilter === 'R' && hand !== 'R') return false;
      if (CACHE.handFilter === 'L' && hand !== 'L') return false;
      if (CACHE.searchQ) {
        var q = CACHE.searchQ.toLowerCase();
        if (name.toLowerCase().indexOf(q) < 0 && team.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderSearchMount(root) {
    var teams = teamOptions();
    root.innerHTML = '<div class="pl-controls-row">'
      + '<div class="pl-control-group"><label for="plPitcherSearch">Pitcher Search</label>'
      + '<input type="search" id="plPitcherSearch" class="pl-search" placeholder="Name or team…" list="plPitcherList"></div>'
      + '<div class="pl-control-group"><label for="plTeamFilter">Team</label>'
      + '<select id="plTeamFilter"><option value="">All teams</option>'
      + teams.map(function(t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="pl-control-group"><label for="plHandFilter">Hand</label>'
      + '<select id="plHandFilter"><option value="all">All</option><option value="R">RHP</option><option value="L">LHP</option></select></div>'
      + '</div><datalist id="plPitcherList"></datalist>'
      + '<div id="plSnapshotMount"></div>'
      + '<div id="plAllowedMount"></div>'
      + '<div id="plOorMount"></div>'
      + '<div id="plTrendMount"></div>'
      + '<div id="plRankingsMount"></div>';

    var dl = document.getElementById('plPitcherList');
    if (dl) {
      dl.innerHTML = (CACHE.profiles || []).map(function(row) {
        var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
        var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
        return '<option value="' + esc(n) + ' (' + esc(t) + ')"></option>';
      }).join('');
    }

    var inp = document.getElementById('plPitcherSearch');
    if (inp) {
      inp.addEventListener('change', function() { selectPitcherFromSearch(inp.value); });
      inp.addEventListener('input', function() { CACHE.searchQ = inp.value; renderRankings(); });
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') selectPitcherFromSearch(inp.value);
      });
    }
    var tf = document.getElementById('plTeamFilter');
    if (tf) tf.addEventListener('change', function() { CACHE.teamFilter = tf.value; renderRankings(); });
    var hf = document.getElementById('plHandFilter');
    if (hf) hf.addEventListener('change', function() { CACHE.handFilter = hf.value; renderRankings(); });
  }

  function selectPitcherFromSearch(val) {
    val = String(val || '').trim();
    if (!val) return;
    var hit = (CACHE.profiles || []).find(function(row) {
      var n = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
      var t = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
      return val === n || val.indexOf(n) === 0 || val.toUpperCase() === String(t).toUpperCase();
    });
    if (hit) {
      CACHE.selected = pickCol(hit, ['pitcher_name', 'Name', 'Pitcher']);
      renderSnapshot();
      renderAllowedCards();
      renderOorPanel();
      renderTrendPanel();
    }
  }

  function renderSnapshot() {
    var mount = document.getElementById('plSnapshotMount');
    if (!mount) return;
    var row = findProfile(CACHE.selected);
    if (!row) {
      mount.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Search and select a pitcher to view snapshot metrics.</p></div>';
      return;
    }
    var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
    var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
    var hand = String(pickCol(row, ['pitcher_hand', 'Hand', 'hand']) || 'R').charAt(0);
    var met = profileMetrics(row);
    var ps = met.pitchScore;
    var tier = pitchTier(ps);
    var stale = isStale(row);
    var avatar = A ? A.pitcherAvatar(name, { crop: 'profile', className: 'pl-snap-avatar', eager: true }) : '';
    var logo = A ? A.teamLogoImg(team, 24) : '';

    mount.innerHTML = '<div class="rl-pane-card pl-snapshot-card">'
      + '<div class="pl-snap-top">' + avatar
      + '<div><h3 class="pl-snap-name"><a href="pitcher_profile.html?pitcher=' + encodeURIComponent(name) + '">' + esc(name) + '</a></h3>'
      + '<div class="pl-snap-meta">' + logo + ' <span>' + esc(team) + '</span>'
      + ' <span class="hand-pill hand-' + hand.toLowerCase() + '">' + esc(hand) + 'HP</span>'
      + ' <span class="tier-badge ' + tier.cls + '">' + esc(tier.label) + '</span></div>'
      + '<div class="pl-snap-ps">Pitching Score <strong style="color:' + mColor(ps, false) + '">' + fmt(ps, 0) + '</strong></div>'
      + '</div></div>'
      + '<div class="pl-stat-row">'
      + '<span>K% <strong>' + fmt(met.kPct, 1) + '</strong></span>'
      + '<span>BB% <strong>' + fmt(met.bbPct, 1) + '</strong></span>'
      + '<span>HR/9 <strong>' + fmt(met.hr9, 2) + '</strong></span>'
      + '<span>FIP/xFIP <strong>' + fmt(met.fip, 2) + ' / ' + fmt(met.xfip != null ? met.xfip : met.fip, 2) + '</strong></span>'
      + '</div>'
      + '<div class="pl-stat-row">OSI Allowed <strong style="color:' + mColor(met.osiAllowed, true) + '">' + fmt(met.osiAllowed) + '</strong>'
      + (met.oor != null ? ' · Pitcher OOR <strong style="color:' + mColor(met.oor, false, 'oor') + '">' + fmt(met.oor) + '</strong> <span class="ca-helper">(' + esc(oorLabel(met.oor)) + ')</span>' : '')
      + '</div>'
      + '<p class="ca-helper" style="margin-top:10px;">' + esc(pickCol(row, ['current_read', 'read', 'model_read']) || 'Starter profile from SP_Profiles — validate allowed metrics vs tonight\'s lineup.') + '</p>'
      + (stale ? '<div class="pl-stale-banner">⚠ L14 form drift — metrics may be stale</div>' : '')
      + '</div>';
    renderOorPanel();
    renderTrendPanel();
  }

  function renderOorPanel() {
    var mount = document.getElementById('plOorMount');
    if (!mount) return;
    var row = findProfile(CACHE.selected);
    if (!row) { mount.innerHTML = ''; return; }
    var met = profileMetrics(row);
    var avgOsi = num(pickCol(row, ['avg_opponent_osi', 'avg_opponent_OSI', 'Avg_Opponent_OSI']));
    mount.innerHTML = '<div class="pl-oor-panel"><h4>Pitcher OOR — Competition Strength</h4>'
      + '<p class="ca-helper">Quality of opposing lineups faced (individual pitcher). Not team OOR.</p>'
      + '<div class="pl-trend-grid">'
      + cell({ label: 'Pitcher OOR', value: met.oor, mode: 'contextual' })
      + cell({ label: 'Competition', value: null, hint: oorLabel(met.oor) })
      + cell({ label: 'Avg Opp OSI', value: avgOsi, context: 'osi', invert: false })
      + '</div></div>';
  }

  function renderTrendPanel() {
    var mount = document.getElementById('plTrendMount');
    if (!mount) return;
    var row = findProfile(CACHE.selected);
    if (!row) { mount.innerHTML = ''; return; }
    var ytd = num(pickCol(row, ['osi_allowed', 'OSI_allowed']));
    var l30 = num(pickCol(row, ['osi_allowed_l30', 'OSI_allowed_L30']));
    var l14 = num(pickCol(row, ['osi_allowed_l14', 'OSI_allowed_L14']));
    var lbl = trendLabel(row);
    mount.innerHTML = '<div class="rl-pane-card"><h4>Trend / Staleness</h4>'
      + '<div class="pl-trend-grid">'
      + cell({ label: 'YTD OSI Allowed', value: ytd, context: 'osi', invert: true })
      + cell({ label: 'L30', value: l30, context: 'osi', invert: true })
      + cell({ label: 'L14', value: l14, context: 'osi', invert: true })
      + cell({ label: 'Form', value: null, staleness: lbl, hint: l14Form(row) })
      + '</div><p class="ca-helper">Label: <strong style="color:' + (A.stalenessColor ? A.stalenessColor(lbl) : '#71717A') + '">' + esc(lbl) + '</strong></p></div>';
  }

  function renderAllowedCards() {
    var mount = document.getElementById('plAllowedMount');
    if (!mount) return;
    var row = findProfile(CACHE.selected);
    if (!row) { mount.innerHTML = ''; return; }
    var met = profileMetrics(row);
    var all = (CACHE.profiles || []).map(function(r) { return profileMetrics(r); });
    var cards = [
      { key: 'abqAllowed', label: 'ABQ Allowed' },
      { key: 'rcvAllowed', label: 'RCV Allowed' },
      { key: 'obrAllowed', label: 'OBR Allowed' },
      { key: 'osiAllowed', label: 'OSI Allowed' }
    ];
    mount.innerHTML = '<div class="pl-section-head"><h4>Metrics Allowed</h4><p class="ca-helper">Lower is better for pitcher</p></div>'
      + '<div class="pl-allowed-grid">' + cards.map(function(c) {
        var v = met[c.key];
        var vals = all.map(function(m) { return m[c.key]; });
        var pct = percentileRank(v, vals, true);
        return '<div class="pl-allowed-card">'
          + '<div class="ca-metric-label">' + esc(c.label) + '</div>'
          + '<div class="pl-allowed-val" style="color:' + mColor(v, true) + '">' + fmt(v) + '</div>'
          + '<div class="pl-allowed-pct">' + (pct != null ? pct + 'th pct (lower=better)' : '') + '</div>'
          + '<div class="pl-allowed-note">Lower is better</div></div>';
      }).join('') + '</div>';
  }

  function sortProfiles(rows) {
    var key = CACHE.sortKey;
    var dir = CACHE.sortDir;
    return rows.slice().sort(function(a, b) {
      var ma = profileMetrics(a);
      var mb = profileMetrics(b);
      var av, bv;
      if (key === 'name') {
        av = pickCol(a, ['pitcher_name']); bv = pickCol(b, ['pitcher_name']);
        return dir * String(av).localeCompare(String(bv));
      }
      if (key === 'team') {
        av = pickCol(a, ['pitcher_team']); bv = pickCol(b, ['pitcher_team']);
        return dir * String(av).localeCompare(String(bv));
      }
      if (key === 'hand') {
        av = pickCol(a, ['pitcher_hand']); bv = pickCol(b, ['pitcher_hand']);
        return dir * String(av).localeCompare(String(bv));
      }
      if (key === 'stale') return dir * (isStale(a) === isStale(b) ? 0 : isStale(a) ? -1 : 1);
      av = ma[key] != null ? ma[key] : (key === 'pitchScore' ? ma.pitchScore : ma.osiAllowed);
      bv = mb[key] != null ? mb[key] : (key === 'pitchScore' ? mb.pitchScore : mb.osiAllowed);
      if (av == null) av = -999;
      if (bv == null) bv = -999;
      return dir * (av - bv);
    });
  }

  function renderRankings() {
    var mount = document.getElementById('plRankingsMount');
    if (!mount) return;
    var rows = sortProfiles(filteredProfiles());
    console.log('[MLBMA] PitcherLab rankings rows=' + rows.length);
    if (!rows.length) {
      mount.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">No pitchers match filters — check SP_Profiles sheet or clear filters.</p></div>';
      return;
    }

    function th(key, label, active) {
      var arrow = active ? (CACHE.sortDir < 0 ? ' ↓' : ' ↑') : '';
      return '<th data-plsort="' + key + '" class="pl-sort-th' + (active ? ' sorted' : '') + '">' + esc(label) + arrow + '</th>';
    }

    var sk = CACHE.sortKey;
    mount.innerHTML = '<div class="pl-section-head"><h4>Pitcher Rankings</h4></div>'
      + '<div class="rl-table-wrap pl-rank-wrap"><table class="rl-table-premium pl-rank-table"><thead><tr>'
      + '<th>#</th>'
      + th('name', 'Pitcher', sk === 'name')
      + th('team', 'Team', sk === 'team')
      + th('hand', 'Hand', sk === 'hand')
      + th('pitchScore', 'Pitch Score', sk === 'pitchScore')
      + th('kPct', 'K%', sk === 'kPct')
      + th('bbPct', 'BB%', sk === 'bbPct')
      + th('hr9', 'HR/9', sk === 'hr9')
      + th('fip', 'FIP', sk === 'fip')
      + th('osiAllowed', 'OSI Allowed', sk === 'osiAllowed')
      + th('abqAllowed', 'ABQ Allowed', sk === 'abqAllowed')
      + th('rcvAllowed', 'RCV Allowed', sk === 'rcvAllowed')
      + th('obrAllowed', 'OBR Allowed', sk === 'obrAllowed')
      + th('oor', 'Pitcher OOR', sk === 'oor')
      + th('l14', 'L14 Form', sk === 'l14')
      + th('stale', 'Stale', sk === 'stale')
      + '</tr></thead><tbody>'
      + rows.map(function(row, i) {
        var name = pickCol(row, ['pitcher_name', 'Name', 'Pitcher']);
        var team = pickCol(row, ['pitcher_team', 'Team', 'Tm']);
        var hand = String(pickCol(row, ['pitcher_hand', 'Hand']) || '?').charAt(0);
        var met = profileMetrics(row);
        var av = A ? A.pitcherAvatar(name, { crop: 'compare', className: 'pl-rank-av' }) : '';
        var logo = A ? A.teamLogoImg(team, 20) : '';
        var stale = isStale(row);
        return '<tr class="pl-rank-row" data-pitcher="' + esc(name) + '">'
          + '<td>' + (i + 1) + '</td>'
          + '<td class="pl-rank-name">' + av + '<a href="pitcher_profile.html?pitcher=' + encodeURIComponent(name) + '">' + esc(name) + '</a></td>'
          + '<td>' + logo + ' ' + esc(team) + '</td>'
          + '<td><span class="hand-pill">' + esc(hand) + '</span></td>'
          + '<td class="num" style="color:' + mColor(met.pitchScore, false) + '">' + fmt(met.pitchScore, 0) + '</td>'
          + '<td class="num">' + fmt(met.kPct, 1) + '</td>'
          + '<td class="num">' + fmt(met.bbPct, 1) + '</td>'
          + '<td class="num">' + fmt(met.hr9, 2) + '</td>'
          + '<td class="num">' + fmt(met.fip, 2) + '</td>'
          + '<td class="num" style="color:' + mColor(met.osiAllowed, true) + '">' + fmt(met.osiAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(met.abqAllowed, true) + '">' + fmt(met.abqAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(met.rcvAllowed, true) + '">' + fmt(met.rcvAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(met.obrAllowed, true) + '">' + fmt(met.obrAllowed) + '</td>'
          + '<td class="num" style="color:' + mColor(met.oor, false, 'oor') + '">' + fmt(met.oor) + '</td>'
          + '<td class="num">' + l14Form(row) + '</td>'
          + '<td>' + (stale ? '<span class="pl-stale-pill">Stale</span>' : '—') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';

    mount.querySelectorAll('[data-plsort]').forEach(function(th) {
      th.addEventListener('click', function() {
        var k = th.getAttribute('data-plsort');
        if (CACHE.sortKey === k) CACHE.sortDir *= -1;
        else { CACHE.sortKey = k; CACHE.sortDir = -1; }
        renderRankings();
      });
    });
    mount.querySelectorAll('.pl-rank-row').forEach(function(tr) {
      tr.addEventListener('click', function(e) {
        if (e.target.closest('a')) return;
        var name = tr.getAttribute('data-pitcher');
        CACHE.selected = name;
        var inp = document.getElementById('plPitcherSearch');
        if (inp) inp.value = name;
        renderSnapshot();
        renderAllowedCards();
        renderOorPanel();
        renderTrendPanel();
      });
    });
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || 'rlPitcherLabRoot');
    if (!root) return;
    root.innerHTML = '<div class="pl-loading ca-helper">Loading pitcher profiles…</div>';
    console.log('[MLBMA] PitcherLab mount start');
    if (A && A.loadRegistry && global.LIVE_DATA) {
      A.loadRegistry(function() { return Promise.resolve([]); });
    }
    loadProfiles().then(function(rows) {
      console.log('[MLBMA] PitcherLab loaded profiles=' + rows.length);
      renderSearchMount(root);
      renderRankings();
      if (CACHE.profiles.length && !CACHE.selected) {
        CACHE.selected = pickCol(CACHE.profiles[0], ['pitcher_name', 'Name', 'Pitcher']);
        renderSnapshot();
        renderAllowedCards();
        renderOorPanel();
        renderTrendPanel();
      }
    }).catch(function(err) {
      root.innerHTML = '<div class="rl-pane-card"><p class="ca-helper">Error loading SP_Profiles: ' + esc(String(err)) + '</p></div>';
    });
  }

  global.PitcherLab = { mount: mount, loadProfiles: loadProfiles };
})(typeof window !== 'undefined' ? window : this);
