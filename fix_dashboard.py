with open(r'C:\Users\chase\mlbma_pipeline\chase_analytics_mlb_oem_v7.html', 'r', encoding='utf-8') as f:
    content = f.read()

oor_html = """
<div class="section" id="oorSection" style="margin-top:20px;">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Opponent Context</div>
      <div class="section-title">OOR — Opponent Offensive Rating</div>
      <div class="section-subtitle">How dangerous is the offense each team faces? Red = toughest. Green = softest schedule.</div>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th><th>Team</th>
          <th>HvP</th><th>HvL</th><th>HvR</th>
          <th>vP%</th><th>vP Rank</th><th>vL Rank</th><th>vR Rank</th>
        </tr>
      </thead>
      <tbody id="oorTableBody">
        <tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:20px;">Loading OOR data...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="section" id="pitchingSection" style="margin-top:20px;">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Pitching Context</div>
      <div class="section-title">Pitching Score</div>
      <div class="section-subtitle">Team pitching quality: K%, BB%, HR/9. Higher = stronger staff.</div>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Team</th><th>K%</th><th>BB%</th><th>HR/9</th><th>PitchScore</th></tr>
      </thead>
      <tbody id="pitchingTableBody">
        <tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:20px;">Loading pitching data...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="section" id="matchupsSection" style="margin-top:20px;">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Daily Slate</div>
      <div class="section-title">Today's Projected Matchups</div>
      <div class="section-subtitle">Lineup OSI vs opposing starter handedness · Updated daily</div>
    </div>
  </div>
  <div id="matchupsGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:14px;"></div>
</div>

<div class="section" style="margin-top:20px;margin-bottom:40px;">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Coming Soon</div>
      <div class="section-title">PALS — Pitching-Adjusted Lineup Score</div>
      <div class="section-subtitle">OSI adjusted for the quality of pitching the lineup has faced.</div>
    </div>
    <span class="pill" style="background:var(--gold-dim);color:var(--gold);border:1px solid rgba(251,191,36,0.3);">In Development</span>
  </div>
  <div class="onboarding-grid">
    <div class="education-card"><strong>What PALS measures</strong><br>Whether a lineup's OSI is genuine or inflated by weak pitching schedule.</div>
    <div class="education-card"><strong>Formula</strong><br>PALS = (BA++ + PTF+) / 2<br>BA++ = normalized OSI<br>PTF+ = avg SIERA of opposing starters faced</div>
    <div class="education-card"><strong>Data needed</strong><br>Game log linked to opposing SP SIERA. SP leaderboard already pulling — schedule integration in progress.</div>
    <div class="education-card"><strong>Betting application</strong><br>Tells you if tonight's lineup is over or under-valued based on schedule strength.</div>
  </div>
</div>
"""

render_js = """
function renderOOR() {
  var el = document.getElementById('oorTableBody');
  if (!el || !LIVE_DATA.oor || !LIVE_DATA.oor.length) return;
  var rows = LIVE_DATA.oor;
  el.innerHTML = rows.map(function(r, i) {
    var hvp = parseFloat(r['HvP']) || 0;
    var cl = hvp >= 65 ? 'var(--red)' : hvp >= 50 ? 'var(--gold)' : hvp >= 35 ? 'var(--text)' : 'var(--green)';
    var vp = r['vP_pct'] || r['vP%'] || '—';
    var vpNum = parseFloat(vp);
    var vpCl = vpNum > 10 ? 'var(--red)' : vpNum < -10 ? 'var(--green)' : 'var(--text-2)';
    return '<tr>'
      + '<td class="rank-cell">' + (i+1) + '</td>'
      + '<td class="team-cell" style="color:var(--purple)">' + r['Tm'] + '</td>'
      + '<td class="num" style="color:' + cl + '">' + hvp.toFixed(1) + '</td>'
      + '<td class="num">' + (parseFloat(r['HvL'])||0).toFixed(1) + '</td>'
      + '<td class="num">' + (parseFloat(r['HvR'])||0).toFixed(1) + '</td>'
      + '<td class="num" style="color:' + vpCl + '">' + vp + '</td>'
      + '<td class="num">' + (r['vP_Rank']||'—') + '</td>'
      + '<td class="num">' + (r['vL_Rank']||'—') + '</td>'
      + '<td class="num">' + (r['vR_Rank']||'—') + '</td>'
      + '</tr>';
  }).join('');
}

function renderPitchingScore() {
  var el = document.getElementById('pitchingTableBody');
  if (!el || !LIVE_DATA.pitching || !LIVE_DATA.pitching.length) return;
  el.innerHTML = LIVE_DATA.pitching.map(function(r, i) {
    var ps = parseFloat(r['PitchScore']) || 0;
    var cl = ps >= 70 ? 'var(--green)' : ps >= 50 ? 'var(--gold)' : ps >= 30 ? 'var(--text)' : 'var(--red)';
    return '<tr>'
      + '<td class="rank-cell">' + (i+1) + '</td>'
      + '<td class="team-cell" style="color:var(--purple)">' + r['Tm'] + '</td>'
      + '<td class="num">' + r['K%'] + '</td>'
      + '<td class="num">' + r['BB%'] + '</td>'
      + '<td class="num">' + r['HR/9'] + '</td>'
      + '<td class="num" style="color:' + cl + '">' + ps.toFixed(1) + '</td>'
      + '</tr>';
  }).join('');
}

function renderMatchups() {
  var grid = document.getElementById('matchupsGrid');
  if (!grid || !LIVE_DATA.matchups || !LIVE_DATA.matchups.length) return;

  function osiColor(v) {
    v = parseFloat(v);
    if (isNaN(v)) return 'var(--text-2)';
    if (v >= 65) return 'var(--green)';
    if (v >= 50) return 'var(--gold)';
    if (v >= 35) return 'var(--text)';
    return 'var(--red)';
  }

  function handPill(h) {
    var c = h === 'L' ? 'var(--blue)' : 'var(--orange)';
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:99px;border:1px solid '+c+';color:'+c+';font-size:9px;font-weight:800;margin-left:5px;">'+h+'</span>';
  }

  grid.innerHTML = LIVE_DATA.matchups.map(function(g) {
    var awayOsi = parseFloat(g['Away_OSI']) || 0;
    var homeOsi = parseFloat(g['Home_OSI']) || 0;
    var edge = g['Lineup_Edge'] || '—';
    var edgeTeam = edge.split(' ')[0];
    var awayWin = edgeTeam === g['Away'];
    var homeWin = edgeTeam === g['Home'];
    var total = awayOsi + homeOsi;
    var awayPct = total > 0 ? (awayOsi / total * 100).toFixed(1) : 50;
    var homePct = total > 0 ? (homeOsi / total * 100).toFixed(1) : 50;

    return '<div style="background:var(--bg-3);border:1px solid var(--border);border-radius:14px;padding:18px 20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<div style="font-size:22px;font-weight:700;font-family:var(--mono);">'
      + '<span style="color:'+(awayWin?'var(--green)':'var(--text)')+'">'+g['Away']+'</span>'
      + '<span style="color:var(--text-3);font-size:14px;margin:0 8px;">vs</span>'
      + '<span style="color:'+(homeWin?'var(--green)':'var(--text)')+'">'+g['Home']+'</span>'
      + '</div>'
      + '<span style="font-size:10px;color:var(--text-3);font-family:var(--mono);">'+g['Time']+'</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'
      + '<div style="background:var(--bg-4);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">'
      + '<div style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">'+g['Away']+' SP</div>'
      + '<div style="font-size:12px;font-weight:600;margin-bottom:5px;">'+g['Away_SP']+handPill(g['Away_Hand'])+'</div>'
      + '<div style="font-size:10px;color:var(--text-2);font-family:var(--mono);">K% '+g['Away_K%']+' &nbsp; BB% '+g['Away_BB%']+' &nbsp; FIP '+g['Away_FIP']+'</div>'
      + '</div>'
      + '<div style="background:var(--bg-4);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">'
      + '<div style="font-size:9px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">'+g['Home']+' SP</div>'
      + '<div style="font-size:12px;font-weight:600;margin-bottom:5px;">'+g['Home_SP']+handPill(g['Home_Hand'])+'</div>'
      + '<div style="font-size:10px;color:var(--text-2);font-family:var(--mono);">K% '+g['Home_K%']+' &nbsp; BB% '+g['Home_BB%']+' &nbsp; FIP '+g['Home_FIP']+'</div>'
      + '</div></div>'
      + '<div style="margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-betwee