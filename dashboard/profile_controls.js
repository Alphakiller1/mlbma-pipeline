/**
 * Profile page control bars — split/window/view + metric sparklines.
 */
(function(global) {
  'use strict';

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function splitLabel(key) {
    var map = {
      both: 'Both', overall: 'Overall', rhp: 'vs RHP', lhp: 'vs LHP', lhh: 'vs LHH', rhh: 'vs RHH',
      home: 'Home', away: 'Away', f5: 'F5', sp: 'vs Starting Pitching', rp: 'vs Bullpens',
      hlev: 'High Leverage', llev: 'Low Leverage',
      b: 'Both', r: 'vs RHP', l: 'vs LHP', hilev: 'High Leverage', lolev: 'Low Leverage'
    };
    return map[key] || key;
  }

  var LINEUP_SPLIT_OPTIONS = [
    { value: 'both', label: 'Both Hands' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' },
    { value: 'sp', label: 'vs Starting Pitching' }, { value: 'rp', label: 'vs Bullpens' },
    { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'First 5' }
  ];
  var IDENTITY_SPLIT_OPTIONS = [
    { value: 'both', label: 'Both Hands' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' },
    { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }
  ];
  var PLATOON_SPLIT_OPTIONS = [
    { value: 'both', label: 'Both Hands' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' }
  ];
  var ROTATION_SPLIT_OPTIONS = [
    { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
    { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'F5' }
  ];
  var BULLPEN_SPLIT_OPTIONS = [
    { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
    { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' },
    { value: 'hlev', label: 'High Lev' }, { value: 'llev', label: 'Low Lev' }
  ];
  var SECTION_SPLIT_OPTIONS = {
    identity: IDENTITY_SPLIT_OPTIONS,
    offense: LINEUP_SPLIT_OPTIONS,
    batting: LINEUP_SPLIT_OPTIONS,
    schedule: PLATOON_SPLIT_OPTIONS,
    sustainability: PLATOON_SPLIT_OPTIONS,
    rotation: ROTATION_SPLIT_OPTIONS,
    bullpen: BULLPEN_SPLIT_OPTIONS
  };

  function splitOptionsForCategory(category) {
    if (category === 'rotation') return ROTATION_SPLIT_OPTIONS;
    if (category === 'bullpen') return BULLPEN_SPLIT_OPTIONS;
    return LINEUP_SPLIT_OPTIONS;
  }

  function defaultSplitForCategory(category) {
    return category === 'lineup' ? 'both' : 'overall';
  }

  function splitOptionsForSection(sectionKey) {
    if (SECTION_SPLIT_OPTIONS[sectionKey]) return SECTION_SPLIT_OPTIONS[sectionKey];
    if (sectionKey === 'rotation' || sectionKey === 'bullpen') return splitOptionsForCategory(sectionKey);
    return LINEUP_SPLIT_OPTIONS;
  }

  function defaultSplitForSection(sectionKey) {
    if (sectionKey === 'rotation' || sectionKey === 'bullpen') return defaultSplitForCategory(sectionKey);
    return 'both';
  }

  function splitHintForSection(sectionKey) {
    if (sectionKey === 'identity') {
      return 'Platoon and home/away lens for identity snapshot KPIs — does not affect other sections.';
    }
    if (sectionKey === 'offense') {
      return 'Full platoon, location, and pitcher-type splits for rate tables.';
    }
    if (sectionKey === 'batting') {
      return 'Split filter applies to Season Overview tab only; use vs RHP / vs LHP tabs for platoon tables.';
    }
    if (sectionKey === 'schedule') {
      return 'Platoon context for opponent quality faced (PALS · xFIP · schedule).';
    }
    if (sectionKey === 'sustainability') {
      return 'Platoon lens for wOBA/xwOBA sustainability and projection gap.';
    }
    return splitHintForCategory(sectionKey === 'rotation' || sectionKey === 'bullpen' ? sectionKey : 'lineup');
  }

  function splitHintForCategory(category) {
    if (category === 'rotation') {
      return 'Split matches Starting Pitcher profiles (Overall · vs LHH/RHH · Home/Away · F5 tier). Window sets time range for trends.';
    }
    if (category === 'bullpen') {
      return 'Split matches Bullpen Report (Overall · vs LHH/RHH · Home/Away · High/Low leverage). Window sets time range for trends.';
    }
    return 'Split changes platoon, location, and pitcher-type views (vs SP / vs bullpen) for batters. Window sets the time range for scoring, trends, and snapshot KPIs.';
  }

  function viewLabel(v) {
    return { summary: 'Summary', expanded: 'Expanded', analyst: 'Analyst' }[v] || v;
  }

  function categoryLabel(v) {
    return { lineup: 'Lineup', rotation: 'Starters', bullpen: 'Bullpen' }[v] || v;
  }

  function pickCol(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
    }
    return '';
  }

  function sparkHtml(values, width, height, label) {
    if (!global.MLBMACharts) return '';
    var cur = (values || []).filter(function(v) { return v != null && !isNaN(v); }).pop();
    return '<div class="pc-spark-item">'
      + MLBMACharts.buildSparkline(values, width || 80, height || 28)
      + '<span class="pc-spark-label">' + esc(label)
      + (cur != null ? ' <strong>' + Number(cur).toFixed(1) + '</strong>' : '')
      + '</span></div>';
  }

  function bindToggles(root, state, handlers) {
    root.querySelectorAll('[data-pctrl]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var grp = btn.closest('[data-pgroup]');
        if (!grp) return;
        var key = grp.getAttribute('data-pgroup');
        state[key] = btn.getAttribute('data-pctrl');
        grp.querySelectorAll('[data-pctrl]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        if (handlers.confirmText) {
          var conf = root.querySelector('[data-pconfirm]');
          if (conf) conf.textContent = handlers.confirmText(state);
        }
        if (handlers.onSparklineUpdate) handlers.onSparklineUpdate(state);
        if (handlers.onChange) handlers.onChange(state);
      });
    });
  }

  function pillGroup(label, groupKey, options, active, variant) {
    variant = variant || 'hub';
    if (variant === 'legacy') {
      return '<div class="control-group" data-pgroup="' + groupKey + '">'
        + '<span class="control-label">' + esc(label) + '</span>'
        + '<div class="toggle-group">'
        + options.map(function(o) {
          var val = o.value || o;
          var lbl = o.label || splitLabel(val);
          return '<button type="button" class="toggle-btn' + (active === val ? ' active' : '') + (o.warn ? ' warn' : '') + '" data-pctrl="' + esc(val) + '">' + esc(lbl) + '</button>';
        }).join('')
        + '</div></div>';
    }
    return '<div class="hub-ctrl-group" data-pgroup="' + groupKey + '">'
      + '<span class="hub-ctrl-label">' + esc(label) + '</span>'
      + '<div class="hub-pill-row">'
      + options.map(function(o) {
        var val = o.value || o;
        var lbl = o.label || splitLabel(val);
        return '<button type="button" class="hub-pill' + (active === val ? ' active' : '') + (o.warn ? ' warn' : '') + '" data-pctrl="' + esc(val) + '">' + esc(lbl) + '</button>';
      }).join('')
      + '</div></div>';
  }

  var WINDOW_OPTIONS = [
    { value: 'YTD', label: 'Season' },
    { value: 'L30', label: 'Last 30' },
    { value: 'L14', label: 'Last 14' },
    { value: 'L7', label: 'Last 7', warn: true }
  ];

  function sectionPillGroup(label, groupKey, options, active) {
    return '<div class="hub-ctrl-group tp-section-ctrl" data-tp-ctrl-group="' + esc(groupKey) + '">'
      + '<span class="hub-ctrl-label">' + esc(label) + '</span>'
      + '<div class="hub-pill-row">'
      + options.map(function(o) {
        var val = o.value || o;
        var lbl = o.label || splitLabel(val);
        return '<button type="button" class="hub-pill' + (active === val ? ' active' : '')
          + (o.warn ? ' warn' : '') + '" data-tp-ctrl="' + esc(val) + '">' + esc(lbl) + '</button>';
      }).join('')
      + '</div></div>';
  }

  function renderSplitControls(category, activeSplit) {
    var cat = category || 'lineup';
    var splitOpts = splitOptionsForCategory(cat);
    var active = activeSplit || defaultSplitForCategory(cat);
    if (!splitOpts.some(function(o) { return (o.value || o) === active; })) {
      active = defaultSplitForCategory(cat);
    }
    return sectionPillGroup('Split', 'split', splitOpts, active);
  }

  function renderWindowControls(activeWindow) {
    return sectionPillGroup('Window', 'window', WINDOW_OPTIONS, activeWindow || 'YTD');
  }

  function wrapSectionFilterBar(innerHtml, extraClass, sectionKey) {
    if (!innerHtml) return '';
    return '<div class="hub-control-bar tp-hub-bar tp-section-filter-bar'
      + (extraClass ? ' ' + extraClass : '') + '"'
      + (sectionKey ? ' data-tp-section="' + esc(sectionKey) + '"' : '')
      + '>' + innerHtml + '</div>';
  }

  function renderSectionSplitBar(sectionKey, activeSplit) {
    var opts = splitOptionsForSection(sectionKey);
    var active = activeSplit || defaultSplitForSection(sectionKey);
    if (!opts.some(function(o) { return (o.value || o) === active; })) {
      active = defaultSplitForSection(sectionKey);
    }
    return wrapSectionFilterBar(
      sectionPillGroup('Split', 'split', opts, active),
      'tp-section-filter-bar--split',
      sectionKey
    );
  }

  function renderSectionWindowBar(sectionKey, activeWindow) {
    return wrapSectionFilterBar(
      sectionPillGroup('Window', 'window', WINDOW_OPTIONS, activeWindow || 'YTD'),
      'tp-section-filter-bar--window',
      sectionKey
    );
  }

  function renderLineupSplitBar(activeSplit) {
    return renderSectionSplitBar('offense', activeSplit);
  }

  function renderLineupWindowBar(activeWindow) {
    return renderSectionWindowBar('surface', activeWindow);
  }

  var _profileTeamScores = null;
  var _profileTeamScoresPromise = null;

  function mergeSplitScores(scR, scL) {
    if (typeof global.buildYtdBothRows === 'function' && scR.length && scL.length) {
      var both = global.buildYtdBothRows(scR, scL);
      return both.map(function(row) {
        var r = scR.find(function(x) { return x.t === row.t; });
        var l = scL.find(function(x) { return x.t === row.t; });
        row.rhpOSI = r ? r.osi : null;
        row.lhpOSI = l ? l.osi : null;
        row.ytdOSI = row.osi;
        if (row.rhpOSI != null && row.lhpOSI != null) row.splitEdge = row.lhpOSI - row.rhpOSI;
        return row;
      });
    }
    var by = {};
    scR.forEach(function(r) { by[r.t] = { r: r }; });
    scL.forEach(function(l) {
      if (!by[l.t]) by[l.t] = {};
      by[l.t].l = l;
    });
    return Object.keys(by).sort().map(function(t) {
      var pack = by[t], r = pack.r, l = pack.l;
      if (!r && l) return Object.assign({}, l, { lhpOSI: l.osi, ytdOSI: l.osi });
      if (r && !l) return Object.assign({}, r, { rhpOSI: r.osi, ytdOSI: r.osi });
      function blend(k) { return 0.5 * r[k] + 0.5 * l[k]; }
      function blendOpt(k) {
        if (r[k] != null && l[k] != null) return blend(k);
        return r[k] != null ? r[k] : l[k];
      }
      var osi = blend('osi');
      return {
        t: t, abq: blend('abq'), rcv: blend('rcv'), obr: blend('obr'), osi: osi,
        projOSI: blend('projOSI'), ppGap: blend('abq') - blend('rcv'), reg: r.reg,
        ytdOSI: osi, rhpOSI: r.osi, lhpOSI: l.osi,
        splitEdge: r.osi != null && l.osi != null ? l.osi - r.osi : null,
        wrc: blendOpt('wrc'), woba: blendOpt('woba'), xwoba: blendOpt('xwoba'), slg: blendOpt('slg'),
        k: blendOpt('k'), bb: blendOpt('bb'), barrel: blendOpt('barrel'), hard: blendOpt('hard')
      };
    });
  }

  function enrichTeamScoresWithProfiles(profileRows) {
    var rows = buildTeamScoresFromLive();
    if (!rows.length || !profileRows || !profileRows.length) return rows;
    var byTeam = {};
    profileRows.forEach(function(p) {
      var t = String(pickCol(p, ['team', 'Team', 'tm'])).trim().toUpperCase();
      if (t) byTeam[t] = p;
    });
    rows.forEach(function(row) {
      var prof = byTeam[row.t];
      if (!prof) return;
      var ytd = num(pickCol(prof, ['osi_ytd', 'osi', 'OSI']));
      var l30 = num(pickCol(prof, ['osi_l30']));
      var l14 = num(pickCol(prof, ['osi_l14']));
      var l7 = num(pickCol(prof, ['osi_l7']));
      if (ytd != null) row.ytdOSI = ytd;
      if (l30 != null) row.l30OSI = l30;
      if (l14 != null) row.l14OSI = l14;
      if (l7 != null) row.l7OSI = l7;
      var abqYtd = num(pickCol(prof, ['abq_ytd', 'abq']));
      var abqL30 = num(pickCol(prof, ['abq_l30']));
      var abqL14 = num(pickCol(prof, ['abq_l14']));
      var abqL7 = num(pickCol(prof, ['abq_l7']));
      var rcvYtd = num(pickCol(prof, ['rcv_ytd', 'rcv']));
      var rcvL30 = num(pickCol(prof, ['rcv_l30']));
      var rcvL14 = num(pickCol(prof, ['rcv_l14']));
      var rcvL7 = num(pickCol(prof, ['rcv_l7']));
      var obrYtd = num(pickCol(prof, ['obr_ytd', 'obr']));
      var obrL30 = num(pickCol(prof, ['obr_l30']));
      var obrL14 = num(pickCol(prof, ['obr_l14']));
      var obrL7 = num(pickCol(prof, ['obr_l7']));
      var abq = num(pickCol(prof, ['abq']));
      var rcv = num(pickCol(prof, ['rcv']));
      var obr = num(pickCol(prof, ['obr']));
      if (abq != null) row.abq = abq;
      if (rcv != null) row.rcv = rcv;
      if (obr != null) row.obr = obr;
      if (abqYtd != null) row.abqYtd = abqYtd;
      if (abqL30 != null) row.l30ABQ = abqL30;
      if (abqL14 != null) row.l14ABQ = abqL14;
      if (abqL7 != null) row.l7ABQ = abqL7;
      if (rcvYtd != null) row.rcvYtd = rcvYtd;
      if (rcvL30 != null) row.l30RCV = rcvL30;
      if (rcvL14 != null) row.l14RCV = rcvL14;
      if (rcvL7 != null) row.l7RCV = rcvL7;
      if (obrYtd != null) row.obrYtd = obrYtd;
      if (obrL30 != null) row.l30OBR = obrL30;
      if (obrL14 != null) row.l14OBR = obrL14;
      if (obrL7 != null) row.l7OBR = obrL7;
      var rhp = num(pickCol(prof, ['osi_vs_rhp']));
      var lhp = num(pickCol(prof, ['osi_vs_lhp']));
      if (rhp != null) row.rhpOSI = rhp;
      if (lhp != null) row.lhpOSI = lhp;
    });
    global.SCO_YTD_B = rows;
    _profileTeamScores = rows;
    return rows;
  }

  function buildTeamScoresFromLive() {
    if (global.SCO_YTD_B && global.SCO_YTD_B.length >= 10) {
      _profileTeamScores = global.SCO_YTD_B;
      return _profileTeamScores;
    }
    if (_profileTeamScores && _profileTeamScores.length >= 10) return _profileTeamScores;
    var scR = [], scL = [];
    if (global.LIVE_DATA) {
      if (LIVE_DATA.scYtdR && LIVE_DATA.scYtdR.length) scR = LIVE_DATA.scYtdR;
      if (LIVE_DATA.scYtdL && LIVE_DATA.scYtdL.length) scL = LIVE_DATA.scYtdL;
    }
    if (!scR.length && global.SCO_YTD_R && global.SCO_YTD_R.length) scR = global.SCO_YTD_R;
    if (!scL.length && global.SCO_YTD_L && global.SCO_YTD_L.length) scL = global.SCO_YTD_L;
    if (scR.length && scL.length) {
      _profileTeamScores = mergeSplitScores(scR, scL);
      global.SCO_YTD_B = _profileTeamScores;
      return _profileTeamScores;
    }
    if (scR.length >= 10) {
      _profileTeamScores = scR;
      return _profileTeamScores;
    }
    return _profileTeamScores || [];
  }

  function buildTeamScores() {
    var sync = buildTeamScoresFromLive();
    if (sync.length >= 10) return Promise.resolve(sync);
    if (_profileTeamScoresPromise) return _profileTeamScoresPromise;
    var S = global.MLBMASharedMatchup;
    if (!S || !S.fetchSheetTab || !S.scoreRowFromSheet) return Promise.resolve(sync);
    _profileTeamScoresPromise = Promise.all([
      S.fetchSheetTab('vs_RHP'),
      S.fetchSheetTab('vs_LHP')
    ]).then(function(res) {
      var scR = (res[0] || []).map(S.scoreRowFromSheet).filter(Boolean);
      var scL = (res[1] || []).map(S.scoreRowFromSheet).filter(Boolean);
      _profileTeamScores = mergeSplitScores(scR, scL);
      if (_profileTeamScores.length) global.SCO_YTD_B = _profileTeamScores;
      return _profileTeamScores;
    }).catch(function() { return sync; });
    return _profileTeamScoresPromise;
  }

  function teamMetricTrend(team, metric) {
    if (!team) return [null, null, null, null];
    var scores = buildTeamScoresFromLive();
    if (!scores.length) return [null, null, null, null];
    var row = scores.find(function(d) { return d.t === team; });
    if (!row) return [null, null, null, null];
    var m = metric.toLowerCase();
    if (m === 'osi') return [row.ytdOSI != null ? row.ytdOSI : row.osi, row.l30OSI, row.l14OSI, row.l7OSI];
    if (m === 'abq') return [row.abqYtd != null ? row.abqYtd : row.abq, row.l30ABQ, row.l14ABQ, row.l7ABQ];
    if (m === 'rcv') return [row.rcvYtd != null ? row.rcvYtd : row.rcv, row.l30RCV, row.l14RCV, row.l7RCV];
    if (m === 'obr') return [row.obrYtd != null ? row.obrYtd : row.obr, row.l30OBR, row.l14OBR, row.l7OBR];
    return [null, null, null, null];
  }

  function pitcherPitchTrend(profile, team, pitchingRows) {
    var ps = profile && profile.PitchScore != null ? num(profile.PitchScore) : null;
    if (ps == null && global.MLBMASharedMatchup && profile) {
      var m = MLBMASharedMatchup.spProfileMetrics(profile);
      ps = m ? m.pitchScore : null;
    }
    if (ps == null && team && pitchingRows) {
      var pr = pitchingRows.find(function(p) {
        return String(pickCol(p, ['Tm', 'tm', 'team'])).toUpperCase() === String(team).toUpperCase();
      });
      ps = pr ? num(pickCol(pr, ['PitchScore'])) : null;
    }
    return [ps, ps, ps, ps];
  }

  function pitcherOsiAllowTrend(profile) {
    var ytd = num(pickCol(profile, ['OSI_allowed', 'osi_allowed']));
    return [ytd, null, null, ytd];
  }

  function bullpenOsiTrend(unit, team, pitchingRows) {
    if (unit) {
      var ytd = unit.osiAllowed != null ? unit.osiAllowed
        : num(pickCol(unit, ['overall_OSI_allowed', 'osi_allowed']));
      var score = unit.bullpenScore != null ? unit.bullpenScore
        : (ytd != null ? Math.max(0, Math.min(100, 100 - ytd)) : null);
      return { osi: [ytd, ytd, ytd, ytd], score: [score, score, score, score] };
    }
    var bp = pitchingRows && pitchingRows.find(function(p) {
      return String(pickCol(p, ['Tm', 'tm'])).toUpperCase() === String(team).toUpperCase();
    });
    var oa = bp ? num(pickCol(bp, ['osi_allowed', 'OSI_allowed'])) : null;
    var score = bp ? num(pickCol(bp, ['PitchScore'])) : null;
    return { osi: [oa, oa, oa, oa], score: [score, score, score, score] };
  }

  /** Team profile bar */
  function renderTeam(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var teamProfileMode = !!opts.teamProfileMode;
    var state = Object.assign({
      split: 'both',
      window: 'YTD',
      view: 'summary',
      category: 'lineup',
      team: opts.teamName || ''
    }, opts.state || {});

    function confirmText(st) {
      var parts = [
        st.team || opts.teamName || 'Team',
        splitLabel(st.split),
        st.window
      ];
      if (!teamProfileMode) parts.push(viewLabel(st.view));
      return 'Showing: ' + parts.join(' · ');
    }

    function sparkBlock(st) {
      var t = st.team || opts.teamName;
      var C = global.MLBMACharts;
      function row(label, metric) {
        var vals = teamMetricTrend(t, metric);
        var cur = (vals || []).filter(function(v) { return v != null && !isNaN(v); }).pop();
        if (C && C.buildSparklineRow) return C.buildSparklineRow(label, vals, 120, 28, { labels: ['YTD', 'L30', 'L14', 'L7'] });
        return sparkHtml(vals, 120, 28, label);
      }
      return '<div class="pc-spark-strip" data-pspark>'
        + row('ABQ', 'abq') + row('RCV', 'rcv') + row('OBR', 'obr') + row('OSI', 'osi')
        + '</div>';
    }

    function splitOsiFromSheets(t, side) {
      var list = side === 'lhp' ? (global.SCO_YTD_L || []) : (global.SCO_YTD_R || []);
      var hit = list.find(function(d) { return d.t === t; });
      return hit && hit.osi != null ? hit.osi : null;
    }

    function teamSnapshotStrip(st) {
      var t = st.team || opts.teamName;
      if (!t) return '';
      var row = buildTeamScoresFromLive().find(function(d) { return d.t === t; });
      if (!row && global.ResearchLab && ResearchLab.teamRow) row = ResearchLab.teamRow(t);
      if (!row) return '';
      var logo = A ? A.teamLogoImg(t, 32) : '';
      var tier = row.osi >= 75 ? 'Elite' : row.osi >= 60 ? 'Solid' : row.osi >= 45 ? 'Avg' : 'Weak';
      var tierCls = row.osi >= 75 ? 'tier-elite' : row.osi >= 60 ? 'tier-solid' : 'tier-mid';
      var rhp = row.rhpOSI != null ? row.rhpOSI : splitOsiFromSheets(t, 'rhp');
      var lhp = row.lhpOSI != null ? row.lhpOSI : splitOsiFromSheets(t, 'lhp');
      var mc = A && A.metricColor ? A.metricColor.bind(A) : function() { return '#71717A'; };
      var tonight = '';
      (global.LIVE_DATA && LIVE_DATA.matchups || []).forEach(function(m) {
        if (m.away === t) tonight = 'vs ' + m.home + ' · ' + (m.homeSP || 'TBD') + ' · ' + (m.time || 'TBD');
        if (m.home === t) tonight = 'vs ' + m.away + ' · ' + (m.awaySP || 'TBD') + ' · ' + (m.time || 'TBD');
      });
      return '<div class="pc-team-snapshot">'
        + '<div class="pc-team-snapshot-meta">' + logo
        + '<div><strong>' + esc(t) + '</strong> · OSI <strong style="color:' + mc(row.osi, 'osi') + '">' + (row.osi != null ? row.osi.toFixed(1) : '—') + '</strong>'
        + ' <span class="tier-badge ' + tierCls + '">' + esc(tier) + '</span></div></div>'
        + sparkBlock(st)
        + '<div class="pc-split-compare"><span>vRHP <strong style="color:' + mc(rhp, 'osi') + '">' + (rhp != null ? rhp.toFixed(1) : '—') + '</strong></span>'
        + '<span>vLHP <strong style="color:' + mc(lhp, 'osi') + '">' + (lhp != null ? lhp.toFixed(1) : '—') + '</strong></span></div>'
        + (tonight ? '<span class="pc-tonight-chip">' + esc(tonight) + '</span>' : '')
        + '</div>';
    }

    if (teamProfileMode) {
      var cat = state.category || 'lineup';
      var splitOpts = splitOptionsForCategory(cat);
      var activeSplit = state.split || defaultSplitForCategory(cat);
      if (!splitOpts.some(function(o) { return (o.value || o) === activeSplit; })) {
        activeSplit = defaultSplitForCategory(cat);
        state.split = activeSplit;
      }
      el.innerHTML = '<div class="hub-control-bar tp-filter-bar tp-context-bar">'
        + '<div class="hub-control-row tp-split-window-row">'
        + '<div class="tp-split-window-cell">' + pillGroup('Split', 'split', splitOpts, activeSplit) + '</div>'
        + '<div class="tp-split-window-cell">' + pillGroup('Window', 'window', [
          { value: 'YTD', label: 'Season' }, { value: 'L30', label: 'Last 30' }, { value: 'L14', label: 'Last 14' }, { value: 'L7', label: 'Last 7', warn: true }
        ], state.window) + '</div>'
        + '</div>'
        + '<p class="tp-control-hint">' + esc(splitHintForCategory(cat)) + '</p>'
        + '</div>';
    } else {
      el.innerHTML = '<div class="hub-control-bar tp-filter-bar">'
        + '<div class="hub-control-row">'
        + pillGroup('Split', 'split', [
          { value: 'both' }, { value: 'rhp', label: 'vs RHP' }, { value: 'lhp', label: 'vs LHP' },
          { value: 'home' }, { value: 'away' }, { value: 'f5' }
        ], state.split)
        + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }, { value: 'L7', warn: true }], state.window)
        + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view)
        + '</div>'
        + '<div class="hub-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
        + teamSnapshotStrip(state) + '</div>';
    }

    bindToggles(el, state, { confirmText: confirmText, onChange: opts.onChange });
    el._profileState = state;
    return state;
  }

  /** Pitcher profile — 3 rows with search */
  function renderPitcher(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var state = Object.assign({
      split: 'overall', window: 'YTD', view: 'summary',
      pitcherKey: '', pitcherName: '', profile: null, team: ''
    }, opts.state || {});

    var pitchers = opts.pitchers || [];
    var datalist = pitchers.map(function(p) {
      return '<option value="' + esc(p.label) + '" data-key="' + esc(p.key) + '"></option>';
    }).join('');

    function confirmText(st) {
      var name = st.pitcherName || 'Select pitcher';
      return 'Showing: ' + name + ' · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    function updateSparks(st) {
      var row = document.querySelector('[data-pspark]');
      if (!row) return;
      var prof = st.profile || (opts.getProfile && opts.getProfile(st.pitcherKey));
      row.innerHTML = sparkHtml(pitcherPitchTrend(prof, st.team, opts.pitchingRows), 100, 32, 'Pitching Score')
        + sparkHtml(pitcherOsiAllowTrend(prof), 100, 32, 'OSI Allowed');
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar pc-pitcher-bar">'
      + '<div class="pc-control-row pc-control-row--search">'
      + '<div class="control-group pc-search-group">'
      + '<span class="control-label">Pitcher</span>'
      + '<input type="search" class="pc-pitcher-search" id="pcPitcherSearch" list="pcPitcherList" placeholder="Search pitcher or team…" value="' + esc(state.pitcherName || '') + '" autocomplete="off">'
      + '<datalist id="pcPitcherList">' + datalist + '</datalist>'
      + '</div>'
      + pillGroup('Split', 'split', [
        { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
        { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }, { value: 'f5', label: 'F5' }
      ], state.split, 'legacy')
      + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }], state.window, 'legacy')
      + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view, 'legacy')
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + '<div class="pc-spark-row" data-pspark></div></div>';

    var search = el.querySelector('#pcPitcherSearch');
    if (search) {
      search.addEventListener('change', function() {
        var val = search.value.trim();
        var hit = pitchers.find(function(p) { return p.label === val || p.key === val; });
        if (hit && opts.onPitcherSelect) opts.onPitcherSelect(hit.key, hit.label);
      });
      search.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        var val = search.value.trim().toLowerCase();
        var hit = pitchers.find(function(p) {
          return p.label.toLowerCase() === val || p.key.toLowerCase() === val
            || (p.team && p.team.toLowerCase() === val);
        });
        if (hit && opts.onPitcherSelect) opts.onPitcherSelect(hit.key, hit.label);
      });
    }

    bindToggles(el, state, {
      confirmText: confirmText,
      onChange: opts.onChange,
      onSparklineUpdate: updateSparks
    });
    updateSparks(state);
    el._profileState = state;
    return state;
  }

  /** Bullpen report — team dropdown + 3 rows */
  function renderBullpen(mount, opts) {
    opts = opts || {};
    var el = typeof mount === 'string' ? document.getElementById(mount) : mount;
    if (!el) return null;
    var teams = opts.teams || [];
    var state = Object.assign({ split: 'overall', window: 'YTD', view: 'summary', team: opts.team || '' }, opts.state || {});

    function confirmText(st) {
      return 'Showing: ' + (st.team || '—') + ' Bullpen · ' + splitLabel(st.split) + ' · ' + st.window + ' · ' + viewLabel(st.view);
    }

    function updateSparks(st) {
      var row = el.querySelector('[data-pspark]');
      if (!row) return;
      var unit = opts.getUnit && opts.getUnit(st.team);
      var trends = bullpenOsiTrend(unit, st.team, opts.pitchingRows);
      row.innerHTML = sparkHtml(trends.osi, 100, 32, 'OSI Allowed')
        + sparkHtml(trends.score, 100, 32, 'Bullpen Score');
    }

    el.innerHTML = '<div class="global-control-bar pc-control-bar sticky-profile-bar pc-bullpen-bar">'
      + '<div class="pc-control-row">'
      + '<div class="control-group"><span class="control-label">Team</span>'
      + '<select class="pc-team-select" id="pcBullpenTeam"><option value="">— Select team —</option>'
      + teams.map(function(t) {
        return '<option value="' + esc(t) + '"' + (state.team === t ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('')
      + '</select></div>'
      + pillGroup('Split', 'split', [
        { value: 'overall', label: 'Overall' }, { value: 'lhh', label: 'vs LHH' }, { value: 'rhh', label: 'vs RHH' },
        { value: 'home', label: 'Home' }, { value: 'away', label: 'Away' },
        { value: 'hlev', label: 'High Lev' }, { value: 'llev', label: 'Low Lev' }
      ], state.split, 'legacy')
      + pillGroup('Window', 'window', [{ value: 'YTD' }, { value: 'L30' }, { value: 'L14' }], state.window, 'legacy')
      + pillGroup('View', 'view', [{ value: 'summary' }, { value: 'expanded' }, { value: 'analyst' }], state.view, 'legacy')
      + '</div>'
      + '<div class="pc-control-confirm" data-pconfirm>' + esc(confirmText(state)) + '</div>'
      + '<div class="pc-spark-row" data-pspark></div></div>';

    var sel = el.querySelector('#pcBullpenTeam');
    if (sel) {
      sel.addEventListener('change', function() {
        state.team = sel.value;
        if (opts.onTeamChange) opts.onTeamChange(state.team);
        var conf = el.querySelector('[data-pconfirm]');
        if (conf) conf.textContent = confirmText(state);
        updateSparks(state);
      });
    }

    bindToggles(el, state, {
      confirmText: confirmText,
      onChange: opts.onChange,
      onSparklineUpdate: updateSparks
    });
    updateSparks(state);
    el._profileState = state;
    return state;
  }

  global.MLBMAProfileControls = {
    render: renderTeam,
    renderTeam: renderTeam,
    renderPitcher: renderPitcher,
    renderBullpen: renderBullpen,
    buildTeamScores: buildTeamScores,
    buildTeamScoresFromLive: buildTeamScoresFromLive,
    enrichTeamScoresWithProfiles: enrichTeamScoresWithProfiles,
    teamMetricTrend: teamMetricTrend,
    pitcherPitchTrend: pitcherPitchTrend,
    pitcherOsiAllowTrend: pitcherOsiAllowTrend,
    splitLabel: splitLabel,
    splitOptionsForCategory: splitOptionsForCategory,
    splitHintForCategory: splitHintForCategory,
    defaultSplitForCategory: defaultSplitForCategory,
    WINDOW_OPTIONS: WINDOW_OPTIONS,
    renderSplitControls: renderSplitControls,
    renderWindowControls: renderWindowControls,
    renderLineupSplitBar: renderLineupSplitBar,
    renderLineupWindowBar: renderLineupWindowBar,
    renderSectionSplitBar: renderSectionSplitBar,
    renderSectionWindowBar: renderSectionWindowBar,
    splitOptionsForSection: splitOptionsForSection,
    defaultSplitForSection: defaultSplitForSection,
    splitHintForSection: splitHintForSection,
    wrapSectionFilterBar: wrapSectionFilterBar
  };
})(typeof window !== 'undefined' ? window : this);
