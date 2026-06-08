/**
 * Bullpen split stat strips + LvB team-rank jux — matchup compare Lineup vs Bullpen pane.
 * Mirrors matchup_offense_splits pitcher card pattern; reads Bullpen_Unit prefixed columns.
 */
(function(global) {
  'use strict';

  var S = global.MLBMASharedMatchup || global.MatchupShared;
  var A = global.MLBMAAssets;

  var BP_SPLIT_STATS = [
    { key: 'fip', label: 'FIP', ctx: 'fip', invert: true, decimals: 2 },
    { key: 'ops_allowed', label: 'OPS', ctx: 'ops', invert: true, decimals: 3 },
    { key: 'bb_pct', label: 'BB%', ctx: 'bbpct', invert: true, decimals: 1 },
    { key: 'k_pct', label: 'K%', ctx: 'kpct', invert: false, decimals: 1 }
  ];

  var PREFIX_MAP = {
    both: 'overall',
    home: 'home',
    away: 'away',
    lhh: 'vs_lhh',
    rhh: 'vs_rhh'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) {
    if (v == null || v === '' || isNaN(v)) return null;
    return Number(v);
  }

  function pickCol(row, keys) {
    if (S && S.pickCol) return S.pickCol(row, keys);
    keys = keys || [];
    for (var i = 0; i < keys.length; i++) {
      if (row && row[keys[i]] != null && row[keys[i]] !== '') return row[keys[i]];
    }
    return null;
  }

  function teamKey(team) {
    return S && S.teamKey ? S.teamKey(team) : String(team || '').toUpperCase();
  }

  function findBullpenUnitRow(rows, team) {
    var tk = teamKey(team);
    return (rows || []).find(function(r) {
      return teamKey(pickCol(r, ['team', 'Tm', 'Team'])) === tk;
    }) || null;
  }

  function pctVal(v) {
    var n = num(v);
    if (n == null) return null;
    return n <= 1.5 && n >= 0 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
  }

  function ratesFromPrefixRow(row, prefix) {
    if (!row || !prefix) return null;
    var p = String(prefix);
    function col(metric) {
      return pickCol(row, [p + '_' + metric, p + ' ' + metric]);
    }
    return {
      fip: num(col('FIP')),
      ops_allowed: num(col('OPS_allowed')),
      era: num(col('ERA')),
      k_pct: pctVal(col('K_pct') != null ? col('K_pct') : col('K%')),
      bb_pct: pctVal(col('BB_pct') != null ? col('BB_pct') : col('BB%')),
      osi: num(col('OSI_allowed'))
    };
  }

  function metricChip(v, ctx, invert, decimals) {
    if (A && A.valChipHtml) return A.valChipHtml(v, ctx || 'osi', !!invert, decimals == null ? 1 : decimals);
    if (v == null || isNaN(v)) return '<span class="mc-os-stat-na">—</span>';
    return '<strong>' + esc(Number(v).toFixed(decimals == null ? 1 : decimals)) + '</strong>';
  }

  function rankTone(rank) {
    if (rank == null) return 'na';
    if (rank <= 5) return 'elite';
    if (rank <= 12) return 'strong';
    if (rank <= 20) return 'mid';
    if (rank <= 25) return 'weak';
    return 'poor';
  }

  function rankLeagueByTeam(pools, statKey, lowerBetter) {
    var entries = Object.keys(pools || {}).map(function(t) {
      return { t: t, v: pools[t] && pools[t][statKey] };
    }).filter(function(e) { return e.v != null && !isNaN(e.v); });
    entries.sort(function(a, b) {
      if (a.v === b.v) return a.t.localeCompare(b.t);
      return lowerBetter ? a.v - b.v : b.v - a.v;
    });
    var ranks = {};
    entries.forEach(function(e, i) { ranks[e.t] = i + 1; });
    return { ranks: ranks, total: entries.length };
  }

  function buildBullpenRankIndex(rows) {
    var index = {};
    Object.keys(PREFIX_MAP).forEach(function(sliceKey) {
      var prefix = PREFIX_MAP[sliceKey];
      var pools = {};
      (rows || []).forEach(function(row) {
        var t = teamKey(pickCol(row, ['team', 'Tm', 'Team']));
        if (!t) return;
        pools[t] = ratesFromPrefixRow(row, prefix);
      });
      index[sliceKey] = {};
      BP_SPLIT_STATS.forEach(function(st) {
        index[sliceKey][st.key] = rankLeagueByTeam(pools, st.key, st.key !== 'k_pct');
      });
    });
    return index;
  }

  function statCellHtml(value, stat, rankPack, team) {
    if (value == null || isNaN(value)) {
      return '<td class="mc-os-cell mc-os-cell--na mc-os-cell--stat">—</td>';
    }
    var rank = rankPack && rankPack.ranks ? rankPack.ranks[team] : null;
    var total = rankPack ? rankPack.total : null;
    var rankHtml = rank != null
      ? '<span class="mc-bp-stat-rank mc-bp-stat-rank--' + rankTone(rank) + '" title="League rank #'
        + rank + (total ? ' of ' + total : '') + '">#' + esc(String(rank)) + '</span>'
      : '';
    return '<td class="mc-os-cell mc-os-cell--stat mc-os-cell--stat-rank">'
      + '<div class="mc-bp-stat-cell-inner">'
      + metricChip(value, stat.ctx, stat.invert, stat.decimals)
      + rankHtml
      + '</div></td>';
  }

  function bullpenSplitStripTable(label, rates, highlight, sliceKey, rankIndex, team) {
    var head = BP_SPLIT_STATS.map(function(st) {
      return '<th scope="col">' + esc(st.label) + '</th>';
    }).join('');
    var cells = BP_SPLIT_STATS.map(function(st) {
      var rankPack = rankIndex && sliceKey && rankIndex[sliceKey] ? rankIndex[sliceKey][st.key] : null;
      return statCellHtml(rates ? rates[st.key] : null, st, rankPack, team);
    }).join('');
    var stripCls = 'mc-os-strip' + (highlight ? ' mc-os-strip--matchup' : '');
    return '<div class="' + stripCls + '">'
      + '<div class="mc-os-strip-head">' + esc(label) + '</div>'
      + '<table class="mc-os-table mc-os-table--pitcher"><thead><tr><th scope="col"></th>' + head + '</tr></thead>'
      + '<tbody><tr><th scope="row" class="mc-os-win">YTD</th>' + cells + '</tr></tbody></table></div>';
  }

  function teamAccentColor(team) {
    var C = global.MLBMACharts;
    if (C && typeof C.radarColorForTeam === 'function') return C.radarColorForTeam(team);
    return '#7C4DFF';
  }

  function dominantBatHand(lineup) {
    if (!lineup || !lineup.length) return 'rhh';
    var l = 0;
    var r = 0;
    lineup.forEach(function(slot) {
      var h = String(slot.batSide || slot.bats || slot.hand || '').trim().toUpperCase();
      if (h.charAt(0) === 'L') l++;
      else if (h.charAt(0) === 'R') r++;
    });
    return l > r ? 'lhh' : 'rhh';
  }

  function lvbSectionHead(title, desc) {
    if (global.MatchupLvB && MatchupLvB.lvbSectionHead) {
      return MatchupLvB.lvbSectionHead(title, desc);
    }
    return '<header class="mc-lvb-section-head mc-lvp-section-head">'
      + '<h3 class="mc-lvp-section-head__title">' + esc(title) + '</h3>'
      + (desc ? '<p class="mc-lvp-section-head__desc">' + esc(desc) + '</p>' : '')
      + '</header>';
  }

  function bullpenSplitStatsCard(bpTeam, unitRow, lineup, filterState, rankIndex) {
    if (!bpTeam || !unitRow) {
      return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--bullpen-compact"><p class="ca-helper">'
        + 'Bullpen splits unavailable — check Bullpen_Unit sheet.</p></div>';
    }
    var accent = teamAccentColor(bpTeam);
    var highlightHand = dominantBatHand(lineup);
    var tk = teamKey(bpTeam);
    var homeRates = ratesFromPrefixRow(unitRow, PREFIX_MAP.home);
    var awayRates = ratesFromPrefixRow(unitRow, PREFIX_MAP.away);
    var lhhRates = ratesFromPrefixRow(unitRow, PREFIX_MAP.lhh);
    var rhhRates = ratesFromPrefixRow(unitRow, PREFIX_MAP.rhh);
    var bothRates = ratesFromPrefixRow(unitRow, PREFIX_MAP.both);
    var logo = A && A.teamLogoImg ? A.teamLogoImg(bpTeam, 48) : '';
    var locHtml = bullpenSplitStripTable('HOME', homeRates, false, 'home', rankIndex, tk)
      + bullpenSplitStripTable('AWAY', awayRates, false, 'away', rankIndex, tk);
    var handHtml = bullpenSplitStripTable('VS LHH', lhhRates, highlightHand === 'lhh', 'lhh', rankIndex, tk)
      + bullpenSplitStripTable('VS RHH', rhhRates, highlightHand === 'rhh', 'rhh', rankIndex, tk)
      + bullpenSplitStripTable('BOTH', bothRates, highlightHand === 'both', 'both', rankIndex, tk);
    return '<div class="mc-os-card mc-os-card--pitcher mc-os-card--bullpen-compact" style="--mc-os-team:' + esc(accent) + '">'
      + '<div class="mc-os-card-head mc-os-card-head--compact">' + logo
      + '<div class="mc-os-card-head-text"><span class="mc-os-card-team mc-os-card-team--pitcher">' + esc(bpTeam) + ' Bullpen</span>'
      + '<span class="mc-os-card-role">FIP · OPS allowed · BB% · K% · relief only · league rank below each stat</span></div></div>'
      + '<div class="mc-os-pitcher-split-groups">'
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-loc">' + locHtml + '</div>'
      + '<div class="mc-os-card-strips mc-os-card-strips--pitcher-hands-stack">' + handHtml + '</div>'
      + '</div></div>';
  }

  function renderLvbTeamRanks(ctx, lineupSide, bpTeam, unitRow, lineup, filterState) {
    if (!ctx || !ctx.m || !ctx.offenseRankIndex || !global.MatchupOffenseSplits) return '';
    var m = ctx.m;
    var lineupCard = MatchupOffenseSplits.lineupOffenseCard
      ? MatchupOffenseSplits.lineupOffenseCard(ctx, lineupSide, 'R', ctx.offenseRankIndex, {
        handSlice: 'overall',
        handTitle: 'BOTH',
        highlightOverall: true,
        highlightHand: false
      })
      : '';
    var bpCard = bullpenSplitStatsCard(
      bpTeam,
      unitRow,
      lineup,
      filterState,
      buildBullpenRankIndex((ctx.data && ctx.data.bullpenRows) || [])
    );
    return '<section class="mc-lvb-section mc-lvb-section--ranks mc-offense-splits mc-lvp-team-ranks ca-board">'
      + lvbSectionHead(
        'Team Offense — League Rank',
        'League rank heatmap · lineup vs relief · bullpen relief splits with league rank (#) beside each stat.'
      )
      + '<div class="mc-lvp-offense-pitcher-duo">'
      + lineupCard
      + bpCard
      + '</div>'
      + '<div class="mc-os-legend mc-os-legend--lineup mc-os-legend--compact">'
      + '<span class="mc-os-legend-label">Ranks:</span>'
      + '<span class="mc-os-leg mc-os-cell--elite">#1–5 Elite</span>'
      + '<span class="mc-os-leg mc-os-cell--strong">#6–12 Strong</span>'
      + '<span class="mc-os-leg mc-os-cell--mid">#13–20 Average</span>'
      + '<span class="mc-os-leg mc-os-cell--weak">#21–25 Weak</span>'
      + '<span class="mc-os-leg mc-os-cell--poor">#26+ Poor</span>'
      + '</div></section>';
  }

  global.MatchupBullpenSplits = {
    findBullpenUnitRow: findBullpenUnitRow,
    bullpenSplitStatsCard: bullpenSplitStatsCard,
    buildBullpenRankIndex: buildBullpenRankIndex,
    renderLvbTeamRanks: renderLvbTeamRanks
  };
})(typeof window !== 'undefined' ? window : this);
