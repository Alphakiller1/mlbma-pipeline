from pathlib import Path

p = Path(__file__).resolve().parents[1] / "dashboard" / "chase_analytics_mlb_oem_v7.html"
t = p.read_text(encoding="utf-8")

t = t.replace('<div id="dailyMatchupsMount"></div>\n\n', "")

strats = """<!-- Strategic Signal Cards (Daily Read) -->
<div class="section" id="dailyStratsSection">
  <div class="section-header">
    <div>
      <div class="section-eyebrow">Daily Read</div>
      <div class="section-title">Strategic Signal Cards</div>
      <div class="section-subtitle">Teams grouped by actionable profile — elite confirmed, buy-low, cooling risk, and more.</div>
    </div>
  </div>
  <div id="stratsDaily"></div>
</div>

"""

if strats in t:
    t = t.replace(strats + "\n", "", 1)

marker = "<!-- Rankings table -->"
if "dailyStratsSection" not in t.split(marker)[0][-800:]:
    t = t.replace(marker, strats + marker, 1)

end_marker = "</div><!-- /pane-oem-daily -->"
if t.count('<div id="dailyMatchupsMount"></div>') == 0:
    t = t.replace(end_marker, '<div id="dailyMatchupsMount"></div>\n\n' + end_marker, 1)

p.write_text(t, encoding="utf-8")
print("reordered daily read")
