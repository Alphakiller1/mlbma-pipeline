/**
 * Team Profile — accordion metric mini dashboards.
 */
(function(global) {
  'use strict';
  var A = global.MLBMAAssets;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  function metricColor(v) {
    return A ? A.metricColor(v) : 'var(--text)';
  }

  function accordion(id, title, score, open, bodyHtml) {
    return '<details class="metric-accordion"' + (open ? ' open' : '') + ' id="' + id + '">'
      + '<summary><span class="ma-title">' + esc(title) + '</span>'
      + '<span class="ma-score" style="color:' + metricColor(score) + '">' + (score != null ? score.toFixed(1) : '—') + '</span></summary>'
      + '<div class="ma-body">' + bodyHtml + '</div></details>';
  }

  function sparkline(vals) {
    var max = Math.max.apply(null, vals.filter(function(v) { return v != null; }).concat([1]));
    return '<div class="sparkline">' + vals.map(function(v, i) {
      var h = v != null ? Math.max(4, (v / max) * 28) : 4;
      var labels = ['YTD', 'L30', 'L14', 'L7'];
      return '<div class="spark-bar" title="' + labels[i] + ': ' + (v != null ? v.toFixed(1) : '—') + '" style="height:' + h + 'px"></div>';
    }).join('') + '</div>';
  }

  function reliabilityLabel(prof) {
    if (global.OEMOverhaul && OEMOverhaul.trendReliabilityLabel) {
      return OEMOverhaul.trendReliabilityLabel({
        ytdOSI: num(prof.osi_ytd || prof.osi),
        l30OSI: num(prof.osi_l30),
        l14OSI: num(prof.osi_l14),
        l7OSI: num(prof.osi_l7),
        trend: prof.trend
      });
    }
    return 'Stable';
  }

  function render(prof, team, helpers) {
    helpers = helpers || {};
    var pick = helpers.pickCol || function(r, k) { return r[k]; };
    var osi = num(pick(prof, ['osi']));
    var abq = num(pick(prof, ['abq']));
    var rcv = num(pick(prof, ['rcv']));
    var obr = num(pick(prof, ['obr']));
    var proj = num(pick(prof, ['proj_osi', 'projOSI']));
    var ppGap = num(pick(prof, ['pp_gap', 'ppGap']));
    var pals = num(pick(prof, ['pals']));
    var osiR = num(pick(prof, ['osi_vs_rhp', 'osi_rhp']));
    var osiL = num(pick(prof, ['osi_vs_lhp', 'osi_lhp']));
    var osiH = num(pick(prof, ['osi_home']));
    var osiA = num(pick(prof, ['osi_away']));
    var osiF5 = num(pick(prof, ['osi_f5']));
    var f5Note = A ? A.f5WarningHtml() : '';

    var osiBody = '<div class="ma-split-bars">'
      + ['vs RHP:' + (osiR != null ? osiR.toFixed(1) : '—'), 'vs LHP:' + (osiL != null ? osiL.toFixed(1) : '—'),
         'Home:' + (osiH != null ? osiH.toFixed(1) : '—'), 'Away:' + (osiA != null ? osiA.toFixed(1) : '—'),
         'F5:' + (osiF5 != null ? osiF5.toFixed(1) : '—')].map(function(s) {
        return '<span class="ma-split-pill">' + esc(s) + '</span>';
      }).join('')
      + '</div>'
      + '<p class="ma-read">ProjOSI ' + (proj != null ? proj.toFixed(1) : '—') + ' · PP-Gap ' + (ppGap != null ? ((ppGap > 0 ? '+' : '') + ppGap.toFixed(1)) : '—') + '</p>'
      + sparkline([osi, num(prof.osi_l30), num(prof.osi_l14), num(prof.osi_l7)])
      + '<p class="ma-reliability">Trend reliability: <strong>' + esc(reliabilityLabel(prof)) + '</strong></p>'
      + f5Note;

    var abqInterp = abq >= 62 ? 'Patient grinders' : abq >= 50 ? 'Balanced' : 'Chase-prone';
    abqInterp = abq >= 62 ? 'Patient grinders' : abq >= 50 ? 'Balanced' : 'Chase-prone';
    var abqBody = '<p class="ma-read">' + (abq != null ? abq.toFixed(0) : '—') + '/100 — ' + abqInterp + '</p>'
      + '<div class="ma-components">Discipline · Contact · Pressure · K Avoidance (from team profile)</div>'
      + sparkline([abq, num(prof.abq_l30), num(prof.abq_l14), num(prof.abq_l7)]);

    var rcvInterp = rcv >= 62 ? 'Cluster scorer' : rcv >= 50 ? 'Balanced' : 'Limited damage';
    var palsGap = (osi != null && pals != null) ? osi - pals : null;
    var palsLabel = palsGap == null ? '—' : Math.abs(palsGap) < 5 ? 'Confirmed vs quality arms' : palsGap >= 8 ? 'Schedule inflated' : 'Mild schedule discount';
    var rcvBody = '<p class="ma-read">' + (rcv != null ? rcv.toFixed(0) : '—') + '/100 — ' + rcvInterp + '</p>'
      + '<p class="ma-read">PALS check: ' + esc(palsLabel) + '</p>'
      + '<div class="ma-split-bars"><span class="ma-split-pill">vs RHP ' + (osiR != null ? osiR.toFixed(1) : '—') + '</span>'
      + '<span class="ma-split-pill">vs LHP ' + (osiL != null ? osiL.toFixed(1) : '—') + '</span></div>' + f5Note;

    var obrInterp = obr >= 62 ? 'Reliable table-setters' : obr >= 50 ? 'Moderate' : 'Thin baserunner paths';
    var obrBody = '<p class="ma-read">' + (obr != null ? obr.toFixed(0) : '—') + '/100 — ' + obrInterp + '</p>';
    if (abq >= 60 && obr >= 60) obrBody += '<p class="ma-read">Complete process profile — dangerous even vs elite pitching</p>';
    else if (abq >= 60 && obr < 50) obrBody += '<p class="ma-read">Patient but not getting on base — watch opposing SP walk rate</p>';
    else if (obr >= 60 && abq < 50) obrBody += '<p class="ma-read">Gets on base but chase-prone</p>';

    var palsBody = '<p class="ma-read"><strong>PALS evaluates performance vs opposing SPs only.</strong></p>'
      + '<p class="ma-read">OSI ' + (osi != null ? osi.toFixed(1) : '—') + ' vs PALS ' + (pals != null ? pals.toFixed(1) : '—') + '</p>'
      + '<p class="ma-read">' + esc(palsLabel) + '</p>' + f5Note;

    return '<div class="mini-dashboards">'
      + accordion('ma-osi', 'OSI — Offensive Strength', osi, true, osiBody)
      + accordion('ma-abq', 'ABQ — Process Quality', abq, false, abqBody)
      + accordion('ma-rcv', 'RCV — Run Creation', rcv, false, rcvBody)
      + accordion('ma-obr', 'OBR — On-Base Floor', obr, false, obrBody)
      + accordion('ma-pals', 'PALS — vs SP Schedule', pals, false, palsBody)
      + '</div>';
  }

  function renderSnapshot(prof, team, helpers) {
    helpers = helpers || {};
    var pick = helpers.pickCol || function(r, k) { return r[k]; };
    var name = helpers.teamName || team;
    var logo = A ? A.teamLogoImg(team, 64, 'snapshot-logo') : '';
    var osi = num(pick(prof, ['osi']));
    var proj = num(pick(prof, ['proj_osi']));
    var ppGap = num(pick(prof, ['pp_gap']));
    var pals = num(pick(prof, ['pals']));
    var projArrow = proj != null && osi != null ? (proj > osi + 2 ? ' ↑' : proj < osi - 2 ? ' ↓' : ' →') : '';
    return '<div class="team-snapshot">'
      + logo
      + '<div class="snapshot-main"><h1 class="snapshot-name">' + esc(name) + '</h1>'
      + '<div class="snapshot-metrics">'
      + '<span>OSI <strong style="color:' + metricColor(osi) + '">' + (osi != null ? osi.toFixed(1) : '—') + '</strong></span>'
      + '<span>ProjOSI <strong>' + (proj != null ? proj.toFixed(1) : '—') + projArrow + '</strong></span>'
      + '<span>PP-Gap <strong>' + (ppGap != null ? ((ppGap > 0 ? '+' : '') + ppGap.toFixed(1)) : '—') + '</strong></span>'
      + '<span>PALS <strong>' + (pals != null ? pals.toFixed(1) : '—') + '</strong></span>'
      + '</div></div></div>';
  }

  var html = '';
  global.TeamProfileMini = {
    render: function(prof, team, helpers) {
      return render(prof, team, helpers).replace(/<\/?motion>/g, '');
    },
    renderSnapshot: function(prof, team, helpers) {
      return renderSnapshot(prof, team, helpers);
    }
  };
})(typeof window !== 'undefined' ? window : this);
