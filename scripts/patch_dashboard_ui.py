"""Apply shared MLBMA UI shell to dashboard HTML files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "dashboard"

PAGES = [
    "chase_analytics_mlb_oem_v7.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "bullpen_report.html",
    "batter_profile.html",
    "reliever_profile.html",
    "team_profile.html",
    "player_search.html",
    "glossary.html",
]

TITLES = {
    "chase_analytics_mlb_oem_v7.html": "Chase Analytics · Offensive Dashboard",
    "matchup_sheet.html": "Chase Analytics · Daily Matchups",
    "pitcher_profile.html": "Chase Analytics · Pitcher Profile",
    "bullpen_report.html": "Chase Analytics · Bullpen Report",
    "batter_profile.html": "Chase Analytics · Batter Profile",
    "reliever_profile.html": "Chase Analytics · Reliever Profile",
    "team_profile.html": "Chase Analytics · Team Profile",
    "player_search.html": "Chase Analytics · Player Search",
    "glossary.html": "Chase Analytics · Metric Glossary",
}

SUBTITLES = {
    "chase_analytics_mlb_oem_v7.html": "Daily offensive intelligence for MLB betting research.",
    "matchup_sheet.html": "Daily game cards with OSI edges and weather.",
    "pitcher_profile.html": "SP deep dive — splits, trends, betting context.",
    "batter_profile.html": "Batter splits, trends, and betting context.",
    "reliever_profile.html": "Reliever splits, leverage, and betting context.",
    "bullpen_report.html": "Team bullpen intelligence and matchup context.",
    "team_profile.html": "Full organizational offensive and pitching view.",
    "player_search.html": "Search all players and teams in the pipeline.",
    "glossary.html": "All definitions, formulas, and methodology in one place.",
}

NAV_SNIPPET = '<div class="mlbma-nav-wrap" data-mlbma-nav></div>'

UI_HEAD = (
    '<link rel="stylesheet" href="mlbma_ui.css">\n'
    '<script src="mlbma_config.js"></script>\n'
    '<script src="mlbma_ui.js" data-page="{page}"></script>\n'
)

EMOJI_UI = [
    (r'<span class="wl-label">📌 Watchlist</span>', '<span class="wl-label">Pin Watchlist</span>'),
    (r'title="Pin mode[^"]*"[^>]*>📌</button>', 'title="Pin mode" class="icon-btn icon-label-btn" id="pinToggleBtn" onclick="togglePinMode()">Pin</button>'),
    (r'title="Compare mode[^"]*"[^>]*>⚖</button>', 'title="Compare mode" class="icon-btn icon-label-btn" id="compareToggleBtn" onclick="toggleCompareMode()">Compare</button>'),
    (r'onclick="exportCSV\(\)">⬇</button>', 'onclick="exportCSV()" class="icon-btn icon-label-btn">Export</button>'),
    (r'onclick="window\.print\(\)">🖨</button>', 'onclick="window.print()" class="icon-btn icon-label-btn">Print</button>'),
    (r'openModal\(\'osi\'\)">📊 Full Breakdown</button>', 'openModal(\'osi\')">Breakdown</button>'),
    (r'<span class="search-icon">⌕</span>\s*', ''),
    (r'⚖ Compare', 'Compare'),
    (r'⚖\)', 'Compare)'),
    (r'>↻ Reset</button>', '>Reset</button>'),
    (r'<button class="modal-close" onclick="closeModal\(\)">✕</button>', '<button class="modal-close" onclick="closeModal()">Close</button>'),
]

SECTION_EYEBROW = re.compile(
    r'<div class="section-eyebrow">Section \d+(?:\s*—[^<]*)?</div>\s*',
    re.I,
)

HIDE_LOADING = [
    "document.getElementById('loadingScreen').classList.add('hide')",
    "document.getElementById('loading').classList.add('hide')",
    "document.getElementById(\"loadingScreen\").classList.add('hide')",
    "document.getElementById(\"loading\").classList.add('hide')",
]


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    page = path.name

    if f'<title>{TITLES.get(page, "")}</title>' not in text:
        text = re.sub(r"<title>[^<]*</title>", f"<title>{TITLES[page]}</title>", text, count=1)

    for old_sub, new_sub in SUBTITLES.items():
        if page == old_sub:
            text = re.sub(
                r'<p class="subtitle">[^<]*</p>|<div class="subtitle">[^<]*</div>',
                f'<p class="subtitle">{new_sub}</p>',
                text,
                count=1,
            )
            break

    if "mlbma_ui.css" not in text:
        text = text.replace("</style>\n</head>", "</style>\n" + UI_HEAD.format(page=page) + "</head>", 1)
        if "</style>\n</head>" not in text and "</head>" in text:
            text = text.replace("</head>", UI_HEAD.format(page=page) + "</head>", 1)

    text = re.sub(r'<nav class="nav-links[^"]*"[^>]*>.*?</nav>', NAV_SNIPPET, text, flags=re.S)
    text = re.sub(
        r'<div class="nav-links"[^>]*>.*?</div>',
        NAV_SNIPPET,
        text,
        flags=re.S,
        count=1,
    )

    text = re.sub(
        r'<div class="loading[^"]*"[^>]*>.*?</div>\s*',
        "",
        text,
        count=1,
        flags=re.S,
    )

    for old, new in EMOJI_UI:
        text = re.sub(old, new, text)

    text = SECTION_EYEBROW.sub("", text)

    for pat in HIDE_LOADING:
        if pat in text:
            text = text.replace(
                pat,
                pat + "; if (window.MLBMA_UI) MLBMA_UI.finishLoading()",
            )

    if "MLBMA_UI.finishLoading" not in text and "classList.add('hide')" in text:
        text = text.replace(
            ".classList.add('hide')",
            ".classList.add('hide'); if (window.MLBMA_UI) MLBMA_UI.finishLoading()",
            1,
        )

    path.write_text(text, encoding="utf-8")
    print(f"Patched {path.name}")


def patch_oem(text: str) -> str:
    glossary_block = re.search(
        r"<!-- LAYER 3 — Glossary.*?</div>\s*\n<!-- Modal -->",
        text,
        re.S,
    )
    if glossary_block:
        text = text[: glossary_block.start()] + "<!-- Modal -->" + text[glossary_block.end() - len("<!-- Modal -->") :]

    text = text.replace(
        '<div class="warn-banner" id="warnBanner">\n  ⚠️ <strong>L7 Note:</strong> Last 7 days is a momentum flag, not a standalone predictor. Treat as noisy. L7 LHP/RHP splits not available — showing Both only.\n</div>\n',
        "",
    )
    text = text.replace(
        '<button class="toggle-btn warn" data-time="L7">L7</button>',
        '<span class="l7-note-wrap"><button class="toggle-btn warn" data-time="L7" id="l7ToggleBtn">L7</button>'
        '<button type="button" class="l7-info-btn" id="l7InfoBtn" aria-label="L7 note">i</button>'
        '<div class="l7-note-panel" id="l7NotePanel">L7 is a momentum flag only — noisy sample. LHP/RHP splits unavailable; Both split shown.</div></span>',
    )
    text = text.replace(
        'Show ABQ / RCV / OBR',
        "Advanced Columns",
    ).replace("Hide ABQ / RCV / OBR", "Advanced Columns")

    subtabs = """<div class="subtabs">
    <button class="subtab active" data-pane="strat">Strategic Signals</button>
    <button class="subtab" data-pane="splits">Splits</button>
    <button class="subtab" data-pane="trends">Trends</button>
    <button class="subtab" data-pane="compare">Compare</button>
    <button class="subtab" data-pane="matchup">Matchup Builder</button>
    <button class="subtab" data-pane="reference">Reference Tables</button>
  </div>"""
    text = re.sub(r"<div class=\"subtabs\">.*?</div>\s*\n\s*<!-- Splits pane -->", subtabs + "\n\n  <!-- Splits pane -->", text, flags=re.S)

    text = text.replace(
        '<div id="pane-strat" style="display:none;">',
        '<div id="pane-strat">',
    )
    text = text.replace(
        "<div class=\"chart-wrap\">\n    <div id=\"mainChart\"></div>",
        '<div class="chart-wrap">\n    <div class="chart-placeholder" id="chartPlaceholder">Loading status map...</div>\n    <div id="mainChart"></div>',
    )
    text = text.replace(
        "<tbody id=\"rankBody\"></tbody>",
        "<tbody id=\"rankBody\"></tbody>\n      <tbody id=\"rankSkeleton\">" + _skeleton_rows() + "</tbody>",
    )

    if "l7InfoBtn" in text and "l7InfoBtn.addEventListener" not in text:
        text = text.replace(
            "</script>\n</body>",
            """
(function(){
  var btn=document.getElementById('l7InfoBtn');
  var panel=document.getElementById('l7NotePanel');
  if(btn&&panel){btn.addEventListener('click',function(e){e.stopPropagation();panel.classList.toggle('open');});}
  document.addEventListener('click',function(){if(panel)panel.classList.remove('open');});
})();
function hideChartPlaceholder(){
  var p=document.getElementById('chartPlaceholder');
  if(p)p.classList.add('hide');
}
function hideRankSkeleton(){
  var s=document.getElementById('rankSkeleton');
  if(s)s.style.display='none';
}
</script>
</body>""",
            1,
        )

    return text


def _skeleton_rows() -> str:
    rows = []
    for _ in range(10):
        cells = "".join('<td><div class="skeleton-bar" style="width:80%"></div></td>' for _ in range(12))
        rows.append(f"<tr class=\"skeleton-row\">{cells}</tr>")
    return "\n".join(rows)


def main() -> None:
    oem = ROOT / "chase_analytics_mlb_oem_v7.html"
    if oem.exists():
        t = oem.read_text(encoding="utf-8")
        t = patch_oem(t)
        oem.write_text(t, encoding="utf-8")
        print("Patched chase_analytics_mlb_oem_v7.html (extended)")

    for name in PAGES:
        p = ROOT / name
        if p.exists():
            patch_file(p)


if __name__ == "__main__":
    main()
