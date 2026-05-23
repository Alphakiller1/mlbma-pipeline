"""Phase 3 — pitcher_profile.html structure patch."""
from pathlib import Path

HTML = Path(__file__).resolve().parents[1] / "dashboard" / "pitcher_profile.html"
text = HTML.read_text(encoding="utf-8")

old_block = """  <motion></motion><div id="profileContent">
    <div class="pitcher-title-row" id="pitcherHeader"></div>

    <section class="section" id="secSeason">"""

new_block = """  <div id="profileContent">
    <motion></motion><div id="pitcherSnapshot"></div>

    <div class="global-control-bar" id="pitcherControlBar">
      <div class="control-group">
        <span class="control-label">Split</span>
        <div class="toggle-group" id="pitcherSplitToggle">
          <button type="button" class="toggle-btn active" data-psplit="ytd">Season</button>
          <button type="button" class="toggle-btn" data-psplit="lhh">vs LHH</button>
          <button type="button" class="toggle-btn" data-psplit="rhh">vs RHH</button>
          <button type="button" class="toggle-btn" data-psplit="home">Home</button>
          <button type="button" class="toggle-btn" data-psplit="away">Away</button>
          <button type="button" class="toggle-btn" data-psplit="f5">F5</button>
        </div>
      </div>
      <div class="control-group">
        <span class="control-label">Window</span>
        <div class="toggle-group" id="pitcherWindowToggle">
          <button type="button" class="toggle-btn active" data-pwindow="YTD">YTD</button>
          <button type="button" class="toggle-btn" data-pwindow="L30">L30</button>
          <button type="button" class="toggle-btn" data-pwindow="L14">L14</button>
        </div>
      </div>
    </div>

    <section class="section" id="secAllowed">
      <div id="allowedDashboard"></div>
    </section>

    <section class="section" id="secOOR">
      <div class="section-title">Quality of Lineups Faced This Season</motion></motion></motion></motion></div>
      <div class="section-subtitle">OOR — competition strength context for ERA validation</div>
      <div id="oorPanel"></div>
    </section>

    <div class="profile-deep-sections">
    <section class="section" id="secSeason">"""

old_block = old_block.replace("<motion></motion>", "")
new_block = new_block.replace("</motion>", "").replace("<motion></motion>", "")

if old_block not in text:
    old_block = """  <motion></motion><div id="profileContent">
    <div class="pitcher-title-row" id="pitcherHeader"></div>

    <section class="section" id="secSeason">""".replace("<motion></motion>", "")
    if old_block not in text:
        old_block = """  <div id="profileContent">
    <div class="pitcher-title-row" id="pitcherHeader"></motion></div>

    <section class="section" id="secSeason">""".replace("</motion>", "")

if old_block in text:
    text = text.replace(old_block, new_block, 1)
else:
    print("WARN: profileContent open block not found")

remove_allowed = """    <section class="section" id="secAllowed">
      <div class="section-title" id="allowedTitle">What Lineups Do Against This Pitcher</div>
      <div class="section-subtitle">Average opponent offensive quality faced — lower is better for the pitcher</div>
      <div class="metric-grid" id="allowedCards"></div>
    </section>

    <section class="section" id="secOOR">
      <div class="section-title">Quality of Lineups Faced This Season</div>
      <div class="section-subtitle">OOR — competition strength context for ERA validation</motion></div>
      <motion></motion><div id="oorPanel"></div>
    </section>

"""
remove_allowed = remove_allowed.replace("</motion>", "").replace("<motion></motion>", "")
if remove_allowed in text:
    text = text.replace(remove_allowed, "", 1)
else:
    alt = """    <section class="section" id="secAllowed">
      <motion></motion><div class="section-title" id="allowedTitle">What Lineups Do Against This Pitcher</div>
      <div class="section-subtitle">Average opponent offensive quality faced — lower is better for the pitcher</div>
      <div class="metric-grid" id="allowedCards"></div>
    </section>

    <section class="section" id="secOOR">
      <div class="section-title">Quality of Lineups Faced This Season</div>
      <div class="section-subtitle">OOR — competition strength context for ERA validation</motion></div>
      <div id="oorPanel"></div>
    </section>

"""
    alt = alt.replace("</motion>", "").replace("<motion></motion>", "")
    if alt in text:
        text = text.replace(alt, "", 1)

if 'class="profile-deep-sections"' in text and '</div>\n  </motion></motion></div>' not in text:
    text = text.replace(
        "      <motion></motion><div class=\"betting-panel\" id=\"bettingPanel\"></div>\n    </section>\n  </div>",
        "      <div class=\"betting-panel\" id=\"bettingPanel\"></div>\n    </section>\n    </motion></div>\n  </div>",
    ).replace("</motion>", "")

text = text.replace(
    "var STATE = { pitcherKey: null };",
    "var STATE = { pitcherKey: null, split: 'ytd', window: 'YTD' };",
)

text = text.replace(
    "  todayStarters: new Set(),\n  lastUpdated: null\n};",
    "  todayStarters: new Set(),\n  lastUpdated: null,\n  oorMap: {},\n  teamProfiles: []\n};",
)

HTML.write_text(text, encoding="utf-8")
print("phase3 structure patched")
