"""Phase 2 — team_profile.html global control bar + mini dashboards."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dashboard" / "team_profile.html"
text = HTML.read_text(encoding="utf-8")

# Fix broken CSS block
text = text.replace(
    """.profile-controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; padding: 12px; background: var(--bg-2); border-radius: 8px; }
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  margin-bottom: 18px;
}
.team-name-lg""",
    """.global-control-bar {
  display: flex; flex-wrap: wrap; gap: 20px; align-items: center;
  margin-bottom: 20px; padding: 14px 16px; background: var(--bg-2);
  border: 1px solid var(--border); border-radius: 12px;
}
.global-control-bar .control-label {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--text-3); margin-right: 6px;
}
.global-control-bar .control-group { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.toggle-group { display: flex; flex-wrap: wrap; gap: 4px; }
.toggle-btn {
  font-size: 11px; font-weight: 600; padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); cursor: pointer;
}
.toggle-btn.active { border-color: var(--purple-3); color: var(--text); background: rgba(168,85,247,.15); }
.toggle-btn.warn.active { border-color: var(--gold); color: var(--gold-l); }
.team-abbr-inline { font-size: 14px; color: var(--text-3); font-family: var(--mono); }
.snapshot-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.summary-badge, .signal-badge {
  font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid;
}
.signal-badge { background: var(--blue-dim); color: var(--blue-l); border-color: rgba(96,165,250,.35); }
.snapshot-tonight { margin-top: 10px; }
.snapshot-context { font-size: 11px; color: var(--text-3); margin-top: 8px; font-family: var(--mono); }
.tier-muted { background: var(--bg-4); color: var(--text-3); }
.tier-elite, .tier-high { background: var(--green-dim); color: var(--green); }
.tier-dangerous { background: var(--purple-glow); color: var(--purple); }
.tier-inconsistent { background: var(--gold-dim); color: var(--gold); }
.tier-weak { background: var(--red-dim); color: var(--red-l); }
.component-bars { margin: 12px 0; }
.cb-row { display: grid; grid-template-columns: 1fr 120px 48px; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 11px; }
.cb-track { height: 6px; background: var(--bg-4); border-radius: 3px; overflow: hidden; }
.cb-fill { height: 100%; border-radius: 3px; }
.cb-val { font-family: var(--mono); font-size: 10px; color: var(--text-3); text-align: right; }
.ma-panel { margin-top: 12px; padding: 12px; background: var(--bg-4); border-radius: 8px; border: 1px solid var(--border); }
.ma-panel-title { font-size: 11px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.ma-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
@media (max-width: 700px) { .ma-stat-grid { grid-template-columns: repeat(2, 1fr); } }
.ma-stat-box { background: var(--bg-3); padding: 8px; border-radius: 6px; text-align: center; }
.ma-stat-box .ms-label { font-size: 9px; color: var(--text-3); text-transform: uppercase; }
.ma-stat-box .ms-val { font-family: var(--mono); font-size: 14px; font-weight: 600; }
.ma-muted { font-size: 10px; color: var(--text-3); margin-top: 6px; }
.ma-split-table { width: 100%; font-size: 11px; margin-top: 8px; }
.ma-split-table td { padding: 4px 0; border-bottom: 1px solid var(--border); }
.pals-compare { display: flex; align-items: center; gap: 16px; margin: 10px 0; }
.pals-num { font-size: 22px; font-weight: 700; font-family: var(--mono); display: block; }
.pals-lbl { font-size: 9px; color: var(--text-3); text-transform: uppercase; }
.pals-gap { font-family: var(--mono); font-size: 14px; color: var(--text-2); }
.pals-status { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px; }
.pals-ok { background: var(--green-dim); color: var(--green); }
.pals-warn { background: var(--gold-dim); color: var(--gold); }
.pals-neutral { background: var(--bg-4); color: var(--text-2); }
.ma-headline { margin-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ma-read { margin: 6px 0; line-height: 1.5; }
.ma-reliability { margin-top: 8px; }
.profile-offense-block { margin-bottom: 28px; }
.team-name-lg""",
)

# Add mount points after selector
old_sel = """  <div class="selector-bar">
    <div class="selector-group">
      <label class="selector-label" for="teamSelect">Team</label>
      <select class="selector-select" id="teamSelect"></select>
    </div>
  </div>

  <div id="app"></div>"""

new_sel = """  <div class="selector-bar">
    <div class="selector-group">
      <label class="selector-label" for="teamSelect">Team</label>
      <select class="selector-select" id="teamSelect"></select>
    </div>
  </div>

  <div class="global-control-bar" id="profileControlBar">
    <div class="control-group">
      <span class="control-label">Split</span>
      <div class="toggle-group" id="profileSplitToggle">
        <button type="button" class="toggle-btn active" data-psplit="both">Both</button>
        <button type="button" class="toggle-btn" data-psplit="rhp">vs RHP</button>
        <button type="button" class="toggle-btn" data-psplit="lhp">vs LHP</button>
        <button type="button" class="toggle-btn" data-psplit="home">Home</button>
        <button type="button" class="toggle-btn" data-psplit="away">Away</button>
        <button type="button" class="toggle-btn" data-psplit="f5">F5</button>
      </div>
    </div>
    <div class="control-group">
      <span class="control-label">Window</span>
      <div class="toggle-group" id="profileWindowToggle">
        <button type="button" class="toggle-btn active" data-pwindow="YTD">YTD</button>
        <button type="button" class="toggle-btn" data-pwindow="L30">L30</button>
        <button type="button" class="toggle-btn" data-pwindow="L14">L14</button>
        <button type="button" class="toggle-btn warn" data-pwindow="L7">L7</button>
      </div>
    </div>
  </div>

  <div class="profile-offense-block">
    <div id="profileSnapshot"></div>
    <div id="profileMiniDashboards"></div>
  </div>

  <div id="profileOrgSections"></div>"""

if old_sel in text:
    text = text.replace(old_sel, new_sel)

# STATE
text = text.replace(
    "var STATE = { team: 'NYY' };",
    "var STATE = { team: 'NYY', split: 'both', window: 'YTD' };",
)

# DATA metrics
text = text.replace(
    "var DATA = { profiles: [], batters: [], sps: [], bullpen: [], registry: [], matchups: [], weather: [], pitchTeams: [] };",
    "var DATA = { profiles: [], batters: [], sps: [], bullpen: [], registry: [], matchups: [], weather: [], pitchTeams: [], metricsR: [], metricsL: [] };",
)

# loadAll - add metrics fetch
text = text.replace(
    "    fetchSheetTab(TABS.reliever_log).catch(function() { return []; })\n  ]).then(function(res) {",
    "    fetchSheetTab(TABS.reliever_log).catch(function() { return []; }),\n    fetchSheetTab(TABS.vs_rhp).catch(function() { return []; }),\n    fetchSheetTab(TABS.vs_lhp).catch(function() { return []; })\n  ]).then(function(res) {",
)
text = text.replace(
    "    DATA.log = res[7];",
    "    DATA.log = res[7];\n    DATA.metricsR = res[8] || [];\n    DATA.metricsL = res[9] || [];",
)

HTML.write_text(text, encoding="utf-8")
print("phase2_team_profile.py: HTML structure updated")
