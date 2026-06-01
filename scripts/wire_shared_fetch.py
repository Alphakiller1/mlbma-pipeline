"""Wire profile pages to shared fetchSheetTab and remove duplicates."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "dashboard"

PAGES = [
    "batter_profile.html",
    "pitcher_profile.html",
    "reliever_profile.html",
    "bullpen_report.html",
    "team_profile.html",
    "matchup_compare.html",
]

FETCH_BLOCK_PATTERNS = [
    """function fetchSheetTab(tabName) {
  return fetch(sheetCsvUrl(tabName), { cache: 'no-store' })
    .then(function(res) {
      if (!res.ok) throw new Error(tabName + ' HTTP ' + res.status);
      return res.text();
    })
    .then(parseCSV);
}""",
    """function fetchSheetTab(tabName) {
  return fetch(sheetCsvUrl(tabName), { cache: 'no-store' })
    .then(function(r) { if (!r.ok) throw new Error(tabName); return r.text(); })
    .then(parseCSV);
}""",
    """function fetchSheetTab(tab) {
  return fetch(gvizUrl(tab)).then(function(r) { return r.text(); }).then(parseCSV);
}""",
    """function fetchSheetTab(tabName) {
  var sid = MLBMA_CONFIG && MLBMA_CONFIG.SHEET_ID;
  if (!sid) return Promise.reject(new Error('no sheet id'));
  var url = 'https://docs.google.com/spreadsheets/d/' + sid + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName);
  return fetch(url, { cache: 'no-store' }).then(function(r) {
    if (!r.ok) throw new Error('fetch ' + tabName);
    return r.text();
  }).then(parseCSV);
}""",
    """function fetchSheetTab(tab) {
  return fetch(sheetCsvUrl(tab)).then(function(r) { return r.text(); }).then(parseCSV);
}""",
]

SHARED_HELPER = """
function fetchSheetTab(tabName) {
  return MLBMASharedMatchup.fetchSheetTab(tabName);
}
"""

SHARED_SCRIPT = '<script src="matchup_shared.js?v=20260523"></script>\n'


def patch(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "matchup_shared.js" not in text:
        text = text.replace(
            '<script src="mlbma_assets.js"></script>\n',
            '<script src="mlbma_assets.js"></script>\n' + SHARED_SCRIPT,
            1,
        )
        if "matchup_shared.js" not in text:
            text = text.replace(
                '<script src="mlbma_config.js"></script>\n',
                '<script src="mlbma_config.js"></script>\n' + SHARED_SCRIPT,
                1,
            )

    for block in FETCH_BLOCK_PATTERNS:
        if block in text:
            text = text.replace(block, SHARED_HELPER.strip(), 1)
            break

    if path.name == "batter_profile.html":
        text = text.replace(
            "function metricColor(score) {\n  if (score == null || isNaN(score)) return 'var(--text-3)';\n  if (score >= 75) return 'var(--green)';\n  if (score >= 60) return 'var(--gold)';\n  if (score >= 45) return 'var(--text)';\n  return 'var(--red-l)';\n}\n",
            "function metricColor(score) {\n  if (window.MLBMAAssets && MLBMAAssets.metricColor) {\n    return MLBMAAssets.metricColor(score, 'osi', false);\n  }\n  return 'var(--text-3)';\n}\n",
        )

    path.write_text(text, encoding="utf-8")
    print("patched", path.name)


for name in PAGES:
    p = ROOT / name
    if p.exists():
        patch(p)
