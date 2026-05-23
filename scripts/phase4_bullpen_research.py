"""Phase 4 cleanup — motion tags, duplicate trend pane, dead bullpen JS."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# Strip motion tags
for rel in [
    "dashboard/bullpen_report.html",
    "dashboard/chase_analytics_mlb_oem_v7.html",
    "dashboard/bullpen_profile_dashboard.js",
]:
    p = ROOT / rel
    if p.exists():
        t = p.read_text(encoding="utf-8")
        t2 = t.replace("<motion></motion>", "").replace("</motion>", "")
        if t2 != t:
            p.write_text(t2, encoding="utf-8")
            print("stripped motion:", rel)

# Remove duplicate trend pane content in chase
chase = ROOT / "dashboard" / "chase_analytics_mlb_oem_v7.html"
text = chase.read_text(encoding="utf-8")
legacy = """  <!-- Trends pane (legacy — content moved to splits-trends) -->
  <motion></motion><div id="pane-trends" style="display:none;">
    <div class="section-header">
      <div>
        <div class="section-eyebrow">Recent Trends</div>
        <div class="section-title">Is This Trend Real Or Noise?</div>
        <div class="section-subtitle">Arrows show direction from prior timeframe · color = tier band · sorted by YTD OSI</div>
      </div>
    </div>
    <div id="trendMap"></motion></div>
    <div style="margin-top: 20px;">
      <div class="section-title" style="margin-bottom: 10px; font-size: 13px;">Trend Classifications &amp; Velocity</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:30px;">#</th><th style="width:50px;">Team</th>
            <th>YTD</th><th>L30</th><th>L14</th><th>L7</th>
            <th>Δ L30</th><th>Δ L14</th><th>Vel.</th>
            <th>Trend</th><th>Reliability</th><th>Interpretation</th>
          </tr></thead>
          <tbody id="trendBody"></tbody>
        </table>
      </div>
    </div>
  </div>"""
legacy_clean = legacy.replace("<motion></motion>", "").replace("</motion>", "")
replacement = '  <!-- Trends pane (legacy — content in splits-trends) -->\n  <div id="pane-trends" style="display:none;" aria-hidden="true"></motion></div>'
replacement = replacement.replace("<motion></motion>", "").replace("</motion>", "")
if legacy_clean in text:
    text = text.replace(legacy_clean, replacement, 1)
    print("removed duplicate trend pane")
text = text.replace(
    "<div class=\"section-title\">How Do Two Teams Compare?</motion></motion></div>",
    "<div class=\"section-title\">Team Compare</div>",
)
text = text.replace(
    "<motion></motion><div class=\"section-subtitle\">Enable Compare mode in the toolbar (Compare), then click rows in the master table to select teams.</div>",
    "<div class=\"section-subtitle\">Enable Compare in the Splits &amp; Trends toolbar, then click rows in the master table to select teams.</motion></motion></motion></div>",
)
text = text.replace("<motion></motion>", "").replace("</motion>", "")
chase.write_text(text, encoding="utf-8")

# Remove dead bullpen functions
bull = ROOT / "dashboard" / "bullpen_report.html"
bt = bull.read_text(encoding="utf-8")
for fn in ["buildRelieverTable", "overviewCard", "allowedCard"]:
    bt, n = re.subn(
        rf"\nfunction {fn}\(.*?\n\}}\n",
        "\n",
        bt,
        count=1,
        flags=re.DOTALL,
    )
    if n:
        print("removed", fn)
bt = bt.replace(
    "Dashboard module not loaded.</motion></motion></div>",
    "Dashboard module not loaded.</div>",
)
bull.write_text(bt, encoding="utf-8")
print("done")
