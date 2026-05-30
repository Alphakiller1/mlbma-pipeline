/**
 * Bullpen Usage — last-7-day pitch matrix + availability (MLB Stats API + Reliever_Log).
 */
(function(global) {
  'use strict';

  var MLB_TEAM_IDS = {
    ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CHW: 145, CIN: 113, CLE: 114,
    COL: 115, DET: 116, HOU: 117, KCR: 118, KC: 118, LAA: 108, LAD: 119, MIA: 146,
    MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133, OAK: 133, PHI: 143, PIT: 134,
    SDP: 135, SD: 135, SEA: 136, SFG: 137, SF: 137, STL: 138, TBR: 139, TB: 139,
    TEX: 140, TOR: 141, WSN: 120, WAS: 120, WSH: 120
  };

  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function teamKey(t) {
    if (global.MLBMASharedMatchup && MLBMASharedMatchup.teamKey) return MLBMASharedMatchup.teamKey(t);
    return String(t || '').trim().toUpperCase();
  }

  function pickCol(row, names) {
    if (!row) return '';
    for (var i = 0; i < names.length; i++) {
      if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
    }
    return '';
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function isoDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function buildDayColumns(days) {
    days = days || 7;
    var cols = [];
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      var dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
      cols.push({
        iso: isoDate(d),
        label: dow + ', ' + mon + ' ' + d.getDate(),
        short: dow
      });
    }
    return cols;
  }

  function normalizeDate(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(s);
    if (!isNaN(d.getTime())) return isoDate(d);
    return s.slice(0, 10);
  }

  function roleFromLog(logRows, pid, name) {
    var saves = 0, holds = 0, blown = 0, ip = 0;
    (logRows || []).forEach(function(g) {
      if (String(pickCol(g, ['pitcher_id'])) !== String(pid) && pickCol(g, ['pitcher_name']) !== name) return;
      var r = pickCol(g, ['result']);
      if (r === 'save') saves++;
      if (r === 'hold') holds++;
      if (r === 'blown_save' || r === 'blown_hold') blown++;
      ip += parseIP(pickCol(g, ['IP']));
    });
    if (saves >= 2) return { label: 'CLOSE', cls: 'bp-role-close' };
    if (holds >= 3 || (saves >= 1 && holds >= 2)) return { label: 'SETUP', cls: 'bp-role-setup' };
    if (ip >= 25) return { label: 'LONG', cls: 'bp-role-long' };
    if (blown >= 3) return { label: 'MID', cls: 'bp-role-mid' };
    return { label: 'MID', cls: 'bp-role-mid' };
  }

  function parseIP(ip) {
    if (!ip) return 0;
    var s = String(ip);
    if (s.indexOf('.') >= 0) {
      var p = s.split('.');
      return parseInt(p[0], 10) + (parseInt(p[1], 10) || 0) / 3;
    }
    return parseFloat(s) || 0;
  }

  function rosterStatusLabel(code) {
    var c = String(code || '').toUpperCase();
    if (c.indexOf('60') >= 0) return { label: '60IL', cls: 'bp-role-il' };
    if (c.indexOf('15') >= 0 || c.indexOf('IL') >= 0) return { label: '15IL', cls: 'bp-role-il' };
    return null;
  }

  function computeAvailability(row, dayCols) {
    if (row.ilLabel) return { code: 'NO', cls: 'bp-avail-no', label: 'NO' };
    var pitches = row.pitchesByDay || [];
    var lastIdx = -1;
    var lastP = 0;
    for (var i = dayCols.length - 1; i >= 0; i--) {
      var p = pitches[i];
      if (p != null && p > 0) {
        lastIdx = i;
        lastP = p;
        break;
      }
    }
    var daysSince = lastIdx < 0 ? 99 : (dayCols.length - 1 - lastIdx);
    var apps5 = 0;
    var pitches3 = 0;
    for (var j = Math.max(0, dayCols.length - 5); j < dayCols.length; j++) {
      var v = pitches[j];
      if (v != null && v > 0) apps5++;
    }
    for (var k = Math.max(0, dayCols.length - 3); k < dayCols.length; k++) {
      pitches3 += pitches[k] || 0;
    }

    if (daysSince === 0 && lastP >= 25) return { code: 'NO', cls: 'bp-avail-no', label: 'NO' };
    if (daysSince === 0) return { code: 'DOUBT', cls: 'bp-avail-doubt', label: 'DOUBT' };
    if (daysSince === 1 && lastP >= 28) return { code: 'NO', cls: 'bp-avail-no', label: 'NO' };
    if (daysSince === 1 && lastP >= 18) return { code: 'DOUBT', cls: 'bp-avail-doubt', label: 'DOUBT' };
    if (daysSince === 1) return { code: 'PROB', cls: 'bp-avail-prob', label: 'PROB' };
    if (apps5 >= 4 || pitches3 >= 70) return { code: 'DOUBT', cls: 'bp-avail-doubt', label: 'DOUBT' };
    if (apps5 >= 3 || pitches3 >= 45) return { code: 'PROB', cls: 'bp-avail-prob', label: 'PROB' };
    return { code: 'YES', cls: 'bp-avail-yes', label: 'YES' };
  }

  function pitchHeatClass(n) {
    if (n == null || n <= 0) return 'bp-pitch-none';
    if (n <= 10) return 'bp-pitch-lo';
    if (n <= 20) return 'bp-pitch-med';
    if (n <= 30) return 'bp-pitch-hi';
    return 'bp-pitch-max';
  }

  function buildFromLog(logRows, team, dayCols) {
    var tk = teamKey(team);
    var byPitcher = {};
    (logRows || []).forEach(function(g) {
      if (teamKey(pickCol(g, ['pitcher_team', 'pitcher team'])) !== tk) return;
      var pid = String(pickCol(g, ['pitcher_id']) || '');
      var name = pickCol(g, ['pitcher_name']);
      if (!name) return;
      var key = pid || name;
      if (!byPitcher[key]) {
        byPitcher[key] = { id: pid, name: name, pitchesByDay: dayCols.map(function() { return null; }), log: [] };
      }
      var date = normalizeDate(pickCol(g, ['date', 'Date']));
      var pitches = num(pickCol(g, ['pitches', 'Pitches']));
      byPitcher[key].log.push(g);
      for (var i = 0; i < dayCols.length; i++) {
        if (dayCols[i].iso !== date) continue;
        byPitcher[key].pitchesByDay[i] = (byPitcher[key].pitchesByDay[i] || 0) + (pitches || 0);
      }
    });
    return Object.keys(byPitcher).map(function(k) { return byPitcher[k]; });
  }

  function mergeIndividuals(rows, individuals, team, dayCols) {
    var tk = teamKey(team);
    var seen = {};
    rows.forEach(function(r) { seen[r.id || r.name] = true; });
    (individuals || []).forEach(function(ind) {
      if (teamKey(pickCol(ind, ['pitcher_team', 'pitcher team'])) !== tk) return;
      var pid = String(pickCol(ind, ['pitcher_id']) || '');
      var name = pickCol(ind, ['pitcher_name']);
      var key = pid || name;
      if (!key || seen[key]) return;
      seen[key] = true;
      rows.push({ id: pid, name: name, pitchesByDay: dayCols.map(function() { return null; }), log: [] });
    });
    return rows;
  }

  function enrichRows(rows, dayCols, rosterMeta) {
    return rows.map(function(r) {
      var meta = rosterMeta && rosterMeta[r.id];
      var il = meta ? rosterStatusLabel(meta.status) : null;
      var role = il || roleFromLog(r.log, r.id, r.name);
      var avail = computeAvailability(Object.assign({}, r, { ilLabel: il }), dayCols);
      var total = (r.pitchesByDay || []).reduce(function(s, v) { return s + (v || 0); }, 0);
      return Object.assign({}, r, { role: role, avail: avail, totalPitches: total });
    }).sort(function(a, b) {
      if (b.totalPitches !== a.totalPitches) return b.totalPitches - a.totalPitches;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function fetchLiveTeamUsage(team, dayCols) {
    var tk = teamKey(team);
    var teamId = MLB_TEAM_IDS[tk];
    if (!teamId) return Promise.resolve(null);

    var start = dayCols[0].iso;
    var end = dayCols[dayCols.length - 1].iso;
    var season = start.slice(0, 4);
    var rosterMeta = {};

    return fetchJson('https://statsapi.mlb.com/api/v1/teams/' + teamId + '/roster?rosterType=active&season=' + season)
      .then(function(roster) {
        (roster.roster || []).forEach(function(entry) {
          var pos = entry.position && entry.position.abbreviation;
          if (pos !== 'P') return;
          var person = entry.person || {};
          rosterMeta[String(person.id)] = {
            name: person.fullName,
            status: (entry.status && entry.status.code) || 'A'
          };
        });
        return fetchJson('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + teamId
          + '&startDate=' + start + '&endDate=' + end + '&gameType=R');
      })
      .then(function(sched) {
        var pks = [];
        (sched.dates || []).forEach(function(d) {
          (d.games || []).forEach(function(g) {
            var st = g.status && g.status.abstractGameState;
            if (st === 'Final' || st === 'Live' || st === 'Game Over') pks.push(g.gamePk);
          });
        });
        var byPitcher = {};
        var chain = Promise.resolve();
        pks.forEach(function(pk) {
          chain = chain.then(function() {
            return fetchJson('https://statsapi.mlb.com/api/v1/game/' + pk + '/boxscore').then(function(box) {
              var gameDate = normalizeDate(box.gameDate || '');
              var dayIdx = -1;
              for (var i = 0; i < dayCols.length; i++) {
                if (dayCols[i].iso === gameDate) { dayIdx = i; break; }
              }
              if (dayIdx < 0) return;
              ['home', 'away'].forEach(function(side) {
                var sideTeam = box.teams && box.teams[side];
                if (!sideTeam || teamKey((sideTeam.team && sideTeam.team.abbreviation) || '') !== tk) return;
                Object.keys(sideTeam.players || {}).forEach(function(k) {
                  var pl = sideTeam.players[k];
                  var pitching = pl.stats && pl.stats.pitching;
                  if (!pitching || !pitching.inningsPitched) return;
                  if (parseInt(pitching.gamesStarted, 10) >= 1) return;
                  var pid = String(pl.person && pl.person.id);
                  var name = pl.person && pl.person.fullName;
                  if (!pid || !name) return;
                  var pitches = num(pitching.numberOfPitches) || 0;
                  if (!byPitcher[pid]) {
                    byPitcher[pid] = { id: pid, name: name, pitchesByDay: dayCols.map(function() { return null; }), log: [] };
                  }
                  byPitcher[pid].pitchesByDay[dayIdx] = (byPitcher[pid].pitchesByDay[dayIdx] || 0) + pitches;
                });
              });
            }).catch(function() { /* skip bad boxscore */ });
          });
        });
        return chain.then(function() {
          return { rows: Object.keys(byPitcher).map(function(k) { return byPitcher[k]; }), rosterMeta: rosterMeta };
        });
      });
  }

  function buildUsageModel(opts) {
    opts = opts || {};
    var team = opts.team;
    var dayCols = opts.dayCols || buildDayColumns(opts.days || 7);
    var rows = buildFromLog(opts.log || [], team, dayCols);
    if (opts.individuals) rows = mergeIndividuals(rows, opts.individuals, team, dayCols);
    rows = enrichRows(rows, dayCols, opts.rosterMeta || {});
    return { team: teamKey(team), dayCols: dayCols, rows: rows, source: opts.source || 'log' };
  }

  function renderUsageChart(model, opts) {
    opts = opts || {};
    if (!model || !model.rows || !model.rows.length) {
      return '<div class="bp-usage-empty">' + esc(opts.emptyText || 'No bullpen usage data for this team.') + '</div>';
    }
    var team = model.team;
    var logo = A ? A.teamLogoImg(team, 40, 'bp-usage-logo') : '';
    var sourceNote = model.source === 'mlb-live'
      ? 'MLB Stats API · refreshed live'
      : 'Reliever_Log · run pipeline step 12 to update';

    var head = '<tr><th class="bp-usage-sticky">Pitcher</th><th>Role</th><th>Avail</th>'
      + model.dayCols.map(function(c) {
        return '<th class="bp-usage-date" title="' + esc(c.label) + '">' + esc(c.short) + '<span class="bp-usage-date-sub">' + esc(c.iso.slice(5)) + '</span></th>';
      }).join('') + '</tr>';

    var body = model.rows.map(function(r) {
      var last = String(r.name).split(' ').pop();
      var cells = (r.pitchesByDay || []).map(function(p) {
        if (p == null || p <= 0) return '<td class="bp-pitch-cell bp-pitch-none">—</td>';
        return '<td class="bp-pitch-cell ' + pitchHeatClass(p) + '">' + p + '</td>';
      }).join('');
      return '<tr>'
        + '<td class="bp-usage-name" title="' + esc(r.name) + '">' + esc(last) + '</td>'
        + '<td class="bp-usage-role ' + esc(r.role.cls) + '">' + esc(r.role.label) + '</td>'
        + '<td class="bp-usage-avail"><span class="bp-avail-pill ' + esc(r.avail.cls) + '">' + esc(r.avail.label) + '</span></td>'
        + cells + '</tr>';
    }).join('');

    return '<div class="bp-usage-chart' + (opts.compact ? ' bp-usage-chart--compact' : '') + '">'
      + '<div class="bp-usage-sidebar">'
      + '<span class="bp-usage-brand">Bullpen</span>'
      + logo
      + '<span class="bp-usage-team">' + esc(team) + '</span>'
      + '</div>'
      + '<div class="bp-usage-scroll">'
      + '<table class="bp-usage-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>'
      + '</div></div>'
      + '<p class="bp-usage-meta">' + esc(sourceNote)
      + (opts.refreshing ? ' · <span class="bp-usage-sync">Syncing live…</span>' : '')
      + '</p>';
  }

  function loadForTeam(team, opts) {
    opts = opts || {};
    var dayCols = buildDayColumns(opts.days || 7);
    var base = buildUsageModel({
      team: team,
      dayCols: dayCols,
      log: opts.log || [],
      individuals: opts.individuals || [],
      source: 'log'
    });

    if (opts.live === false) return Promise.resolve(base);

    return fetchLiveTeamUsage(team, dayCols).then(function(live) {
      if (!live || !live.rows.length) return base;
      var merged = {};
      base.rows.forEach(function(r) {
        merged[r.id || r.name] = Object.assign({}, r);
      });
      live.rows.forEach(function(r) {
        var key = r.id || r.name;
        if (!merged[key]) {
          merged[key] = Object.assign({}, r, { log: [] });
        } else {
          merged[key].pitchesByDay = r.pitchesByDay.slice();
          merged[key].name = merged[key].name || r.name;
          merged[key].id = merged[key].id || r.id;
        }
      });
      var mergedRows = Object.keys(merged).map(function(k) { return merged[k]; });
      var logRows = opts.log || [];
      mergedRows.forEach(function(r) {
        r.log = logRows.filter(function(g) {
          return String(pickCol(g, ['pitcher_id'])) === String(r.id) || pickCol(g, ['pitcher_name']) === r.name;
        });
      });
      return {
        team: teamKey(team),
        dayCols: dayCols,
        rows: enrichRows(mergedRows, dayCols, live.rosterMeta),
        source: 'mlb-live'
      };
    }).catch(function() {
      return base;
    });
  }

  global.BullpenUsage = {
    buildDayColumns: buildDayColumns,
    buildUsageModel: buildUsageModel,
    renderUsageChart: renderUsageChart,
    loadForTeam: loadForTeam,
    fetchLiveTeamUsage: fetchLiveTeamUsage,
    computeAvailability: computeAvailability
  };
})(typeof window !== 'undefined' ? window : this);
