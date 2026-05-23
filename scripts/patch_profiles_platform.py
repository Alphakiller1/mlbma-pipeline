"""Patch profile pages for platform rebuild."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# team_profile.html
tp = ROOT / "dashboard" / "team_profile.html"
t = tp.read_text(encoding="utf-8")
old = "  html += '<motion></motion><motion></motion><div class=\"section\"><motion></motion><div class=\"section-eyebrow\">Offense</div>';"
old = "  html += '<div class=\"section\"><div class=\"section-eyebrow\">Offense</div>';"
insert = """  html += '<div class="profile-controls"><span class="control-label">Split</span> Both / vs RHP / vs LHP / Home / Away / F5 · <span class="control-label">Window</span> YTD / L30 / L14 / L7</div>';
  if (window.TeamProfileMini) {
    html += TeamProfileMini.renderSnapshot(prof, STATE.team, { pickCol: pickCol, teamName: name });
    if (tonightHtml) html += '<div style="margin-bottom:16px;">' + tonightHtml + '</motion></div>';
    html += TeamProfileMini.render(prof, STATE.team, { pickCol: pickCol });
  }

  html += '<div class="section" style="display:none;"><div class="section-eyebrow">Offense</div>';"""
insert = insert.replace("</motion>", "")
if old in t:
    t = t.replace(old, insert, 1)
    tp.write_text(t, encoding="utf-8")
    print("patched team_profile")

# pitcher_profile.html - add OOR section
pp = ROOT / "dashboard" / "pitcher_profile.html"
p = pp.read_text(encoding="utf-8")
if "secOOR" not in p:
    p = p.replace(
        '<section class="section" id="secOsi">',
        """<section class="section" id="secOOR">
      <motion></motion><div class="section-title">Quality of Lineups Faced This Season</div>
      <div class="section-subtitle">OOR — competition strength context for ERA validation</div>
      <motion></motion><div id="oorPanel"></div>
    </section>

    <section class="section" id="secOsi">""",
    )
    p = p.replace("<motion></motion>", "")
    if "mlbma_assets.js" not in p:
        p = p.replace('<script src="mlbma_config.js"></script>', '<script src="mlbma_config.js"></script>\n<script src="mlbma_assets.js"></script>')
    oor_render = """
  var oorPanel = document.getElementById('oorPanel');
  if (oorPanel) {
    var avgOor = numOrNull(pickCol(profile, ['avg_opponent_OOR', 'avg_OOR', 'OOR']));
    var tonightOsi = null;
    var mToday = DATA.matchups.find(function(m) {
      return normalizeName(pickCol(m, ['Away_SP', 'away_sp'])) === normalizeName(name) ||
        normalizeName(pickCol(m, ['Home_SP', 'home_sp'])) === normalizeName(name);
    });
    if (mToday) {
      var opp = normalizeName(pickCol(mToday, ['Away_SP'])) === normalizeName(name)
        ? pickCol(mToday, ['Home', 'home']) : pickCol(mToday, ['Away', 'away']);
      tonightOsi = numOrNull(pickCol(mToday, ['Away_OSI', 'away_osi']));
    }
    var oorLabel = avgOor == null ? 'OOR data pending' : avgOor >= 55 ? 'Above-average offensive competition faced' : avgOor <= 45 ? 'Soft schedule — ERA may be inflated' : 'Near-average competition faced';
    var oorColor = avgOor >= 55 ? 'var(--red)' : avgOor <= 45 ? 'var(--green)' : 'var(--text-2)';
    var hs = window.MLBMAAssets ? MLBMAAssets.headshotImg(pickCol(profile, ['pitcher_id', 'pitcherId']), 80) : '';
    oorPanel.innerHTML = '<div style="display:flex;gap:16px;align-items:flex-start;">' + hs +
      '<div><div class="s-val" style="color:' + oorColor + ';font-size:24px;">' + (avgOor != null ? avgOor.toFixed(0) : '—') + '</div>' +
      '<p style="font-size:12px;color:var(--text-2);margin-top:6px;">' + oorLabel + '</p>' +
      (tonightOsi != null ? '<p style="font-size:11px;color:var(--text-3);margin-top:8px;">Tonight\\'s lineup OSI ' + tonightOsi.toFixed(1) + ' vs season avg OOR ' + (avgOor != null ? avgOor.toFixed(0) : '—') + '</p>' : '') +
      '</div></div>';
  }
"""
    p = p.replace("  document.getElementById('allowedCards').innerHTML =", oor_render + "\n  document.getElementById('allowedCards').innerHTML =")
    # Update header with headshot
    p = p.replace(
        "  document.getElementById('pitcherHeader').innerHTML =\n    '<span class=\"pitcher-name-lg\">' + name + '</span>' +",
        "  var _hs = window.MLBMAAssets ? MLBMAAssets.headshotImg(pickCol(profile, ['pitcher_id', 'pitcherId']), 72, 'pitcher-headshot-lg') : '';\n  document.getElementById('pitcherHeader').innerHTML =\n    _hs + '<span class=\"pitcher-name-lg\">' + name + '</span>' +",
    )
    # Rename allowed section title
    p = p.replace(
        '<div class="section-title">Metric Allowed Profile</div>',
        '<div class="section-title">What Lineups Do Against ' + "' + name + '" + '</motion></div>',
    )
    p = p.replace("</motion>", "")
    p = p.replace(
        '<div class="section-title">What Lineups Do Against ' + "' + name + '" + '</motion></motion></div>',
        '<p class="section-title" id="allowedTitle">What Lineups Do Against [Pitcher]</p>',
    )
    pp.write_text(p, encoding="utf-8")
    print("patched pitcher_profile")

# bullpen_report.html
bp = ROOT / "dashboard" / "bullpen_report.html"
b = bp.read_text(encoding="utf-8")
if "Bullpen OOR Context" not in b:
    b = b.replace(
        '<section class="section">\n      <div class="section-title">Performance vs Lineup Quality</div>',
        """<section class="section">
      <div class="section-title">Bullpen OOR Context</div>
      <div class="section-subtitle">Avg OSI of lineups faced by this bullpen unit</div>
      <div id="oorUnitPanel" class="insight-line"></div>
    </section>

    <section class="section">
      <div class="section-title">Performance vs Lineup Quality</div>""",
    )
    b = b.replace(
        "'<th>OSI All.</th><th>vs RHH OSI</th><th>vs LHH OSI</th><th>IR Scored%'",
        "'<th>OSI All.</th><th>ABQ All.</th><th>OOR</th><th>vs RHH OSI</th><th>vs LHH OSI</th><th>IR Scored%'",
    )
    b = b.replace(
        "'<td class=\"num\">' + fmt(colVal(r, 'overall', 'OSI_allowed'), 1) + '</td>' +",
        "'<td class=\"num\">' + fmt(colVal(r, 'overall', 'OSI_allowed'), 1) + '</td>' +\n      '<td class=\"num\">' + fmt(colVal(r, 'overall', 'ABQ_allowed'), 1) + '</td>' +\n      '<td class=\"num\">' + fmt(colVal(r, 'overall', 'avg_opponent_OSI'), 1) + '</td>' +",
    )
    b = b.replace("colspan=\"12\"", "colspan=\"14\"")
    oor_js = """
  var oorEl = document.getElementById('oorUnitPanel');
  if (oorEl && unit) {
    var avgOsi = colVal(unit, 'overall', 'avg_opponent_OSI') || colVal(unit, 'overall', 'OSI_allowed');
    oorEl.innerHTML = 'Avg lineup OSI faced: <strong>' + fmt(avgOsi, 1) + '</strong> · splits vs LHH/RHH and leverage in metric tables below.';
  }
"""
    b = b.replace("  document.getElementById('allowedCards').innerHTML =", oor_js + "\n  document.getElementById('allowedCards').innerHTML =")
    if "mlbma_assets.js" not in b:
        b = b.replace('<script src="mlbma_config.js"></script>', '<script src="mlbma_config.js"></script>\n<script src="mlbma_assets.js"></script>')
    bp.write_text(b, encoding="utf-8")
    print("patched bullpen_report")

# chase_analytics - mountDashboardRankings headers + renderMasterTable logo
html = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
h = html.read_text(encoding="utf-8")
mount_patch = """function mountDashboardRankings() {
  var mount = document.getElementById('dashboardRankingsMount');
  var table = document.querySelector('#masterTable');
  if (!mount || !table) return;
  var section = table.closest('.section');
  if (section && !mount.contains(section)) mount.appendChild(section);
  if (!table.dataset.platformHeaders) {
    table.dataset.platformHeaders = '1';
    STATE.showAdvancedMetrics = true;
    document.body.classList.add('show-advanced-metrics');
    var thead = table.querySelector('thead tr');
    if (thead) {
      thead.innerHTML = '<th style="width:30px;">#</th><th>Team</th><th data-sort="abq">ABQ</th><th data-sort="rcv">RCV</th><th data-sort="obr">OBR</th><th data-sort="osi" class="sorted">OSI</th><th data-sort="projOSI">ProjOSI</th><th data-sort="ppGap">PP-Gap</th><th>PALS</th><th data-sort="trend">Trend</th>';
    }
  }
}
"""
if "table.dataset.platformHeaders" not in h:
    h = h.replace(
        "function mountDashboardRankings() {\n  var mount = document.getElementById('dashboardRankingsMount');\n  var table = document.querySelector('#masterTable');\n  if (!mount || !table) return;\n  var section = table.closest('.section');\n  if (section && !mount.contains(section)) mount.appendChild(section);\n}",
        mount_patch.rstrip(),
    )
logo_patch = "var _logo = (window.MLBMAAssets) ? MLBMAAssets.teamLogoImg(d.t, 24, 'rank-logo') : '';\n        "
if "_logo = (window.MLBMAAssets)" not in h:
    h = h.replace(
        "'<td class=\"team-cell\" style=\"color:var(--purple);\">'+d.t+paBadge+'</td>'+",
        "'<td class=\"team-cell\" style=\"color:var(--purple);\">' + ((window.MLBMAAssets)?MLBMAAssets.teamLogoImg(d.t,24,'rank-logo'):'') + d.t+paBadge+'</td>'+",
    )
html.write_text(h, encoding="utf-8")
print("patched chase_analytics")
