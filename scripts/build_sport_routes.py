#!/usr/bin/env python3
"""Generate per-sport /mlb /nfl /wnba /cfb index.html (and NFL matchups Pilot B).

Each route loads only that sport's adapter. Regenerating is the source of truth
for these files — edit this script, then re-run.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
NAV = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8").strip()
PUBLIC_SPORTS = ("mlb", "nfl")
PARKED_SPORTS = ("wnba", "cfb")
SPORTS = {
    "mlb": {
        "title": "MLB — Chase Analytics",
        "adapter": "mlb",
        "global": "ChaseSportMLB",
        "picks_label": "Priced markets (Picks)",
        "gems_label": "Flagged tiles (Gems)",
        "lede": "MLB research slate. Schedules, lineups, and descriptive stats. Forecasts live in Model Center.",
        "matchups_href": "/mlb/matchups.html",
    },
    "nfl": {
        "title": "NFL — Chase Analytics",
        "adapter": "nfl",
        "global": "ChaseSportNFL",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "NFL research slate. Kickoffs grouped from actual timestamps. Book prices appear only with book, market, side, and quote time.",
        "matchups_href": "/nfl/matchups.html",
    },
    "wnba": {
        "title": "WNBA — Chase Analytics",
        "adapter": "wnba",
        "global": "ChaseSportWNBA",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "WNBA research slate. Kickoffs and attributed book prices. Forecasts live in Model Center.",
        "matchups_href": "/wnba/matchups.html",
    },
    "cfb": {
        "title": "CFB — Chase Analytics",
        "adapter": "cfb",
        "global": "ChaseSportCFB",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "CFB research slate. Games sort by kickoff. Age is computed at view time from producer timestamps.",
        "matchups_href": "/cfb/matchups.html",
    },
}


def sport_nav() -> str:
    html = NAV
    html = re.sub(
        r'href="(?!/|http|#)([^"]+)"',
        r'href="/dashboard/\1"',
        html,
    )
    html = re.sub(
        r'src="(?!/|http)([^"]+)"',
        r'src="/dashboard/\1"',
        html,
    )
    return html


def parked_page(sport: str) -> str:
    label = sport.upper()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>{label} — Chase Analytics</title>
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/mlbma_design_system.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="entry" data-sport="{sport}">
{sport_nav()}
  <main class="container ca-page-shell ca-shell-main">
    <header class="ca-surface-header">
      <h1 class="ca-page-title">{label} is not on the public desk</h1>
      <p class="ca-helper">Chase Analytics is posting MLB and NFL only for now. {label} stays in the pipeline until that desk is public.</p>
    </header>
    <p class="ca-helper">
      <a class="hub-pill" href="/mlb/">MLB</a>
      <a class="hub-pill" href="/nfl/">NFL</a>
      <a class="hub-pill" href="/dashboard/index.html">Opening</a>
    </p>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>
</body>
</html>
"""


def page(sport: str, *, kind: str = "index") -> str:
    spec = SPORTS[sport]
    matchups = kind == "matchups"
    results = kind == "results"
    if matchups:
        title = sport.upper() + " Matchups — Chase Analytics"
    elif results:
        title = sport.upper() + " Results — Chase Analytics"
    else:
        title = spec["title"]
    extra_scripts = f"""
  <script src="/dashboard/chase_shell.js?v={STAMP}"></script>
  <script src="/dashboard/chase_entity.js?v={STAMP}"></script>
  <script src="/dashboard/chase_metric.js?v={STAMP}"></script>
  <script src="/dashboard/chase_scope.js?v={STAMP}"></script>"""
    body_js = RESULTS_JS if results else MATCHUPS_JS
    mode = "evidence" if results else "slate"
    more_bits = []
    if not results:
        more_bits.append(f'<a class="hub-pill" href="/{sport}/results.html">Results</a>')
    more_html = ('<p class="ca-helper">' + " ".join(more_bits) + "</p>") if more_bits else ""
    if results:
        lede = "Finals publish after games complete. This page lists the slate, not model performance."
        h1 = sport.upper() + " results"
    else:
        lede = spec["lede"]
        h1 = sport.upper() + " matchups"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/mlbma_design_system.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/responsive.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="{mode}" data-sport="{sport}" data-ca-product="research">
{sport_nav()}
  <div id="caContextBar" class="ca-context-bar" role="status"></div>
  <main class="container ca-page-shell ca-shell-main">
    <header class="ca-surface-header">
      <h1 class="ca-page-title">{h1}</h1>
      <p class="ca-helper">{lede}</p>
    </header>
    <div id="sportSelect" class="ca-sport-switcher"></div>
    {more_html}
    <div id="modelStatus"></div>
    <div id="dataStatus"></div>
    <div id="slate" class="ca-async" data-state="loading">Loading {sport.upper()} slate…</div>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_sport_select.js?v={STAMP}"></script>
  <script src="/dashboard/sports/public_sport_registry.js?v={STAMP}"></script>
  <script src="/dashboard/sports/chase_public_slate.js?v={STAMP}"></script>
  <script src="/dashboard/matchup_card.js?v={STAMP}"></script>
  <script src="/dashboard/sports/{spec["adapter"]}.js?v={STAMP}"></script>
  <script src="/dashboard/chase_asyncstate.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>{extra_scripts}
  <script>
  window.CHASE_SPORT_PAGE = {spec["global"]};
  window.CHASE_SPORT_ID = {json.dumps(sport)};
  window.CHASE_SPORT_PICKS_LABEL = {json.dumps(spec["picks_label"])};
  window.CHASE_SPORT_GEMS_LABEL = {json.dumps(spec["gems_label"])};
  window.CHASE_SPORT_IS_MATCHUPS = {str(not results).lower()};
  window.CHASE_SPORT_IS_RESULTS = {str(results).lower()};
  {body_js}
  </script>
</body>
</html>
"""


HUB_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseShell) ChaseShell.mount({ sport: sport, mode: 'slate', surface: 'index', search: false });
  if (window.ChaseMatchupCard) {
    ChaseMatchupCard.mountSlate({
      sport: sport,
      adapter: adapter,
      host: document.getElementById('slate')
    });
  }
})();
"""

MATCHUPS_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseShell) ChaseShell.mount({ sport: sport, mode: 'slate', surface: 'matchups', search: true });
  else if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'matchups' });
  }
  if (!adapter || !adapter.SLATE_URL) {
    if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'error', 'Public slate URL missing.');
    return;
  }
  if (window.ChaseMatchupCard) {
    ChaseMatchupCard.mountSlate({
      sport: sport,
      adapter: adapter,
      host: document.getElementById('slate')
    });
  }
})();
"""


RESULTS_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseShell) ChaseShell.mount({ sport: sport, mode: 'evidence', surface: 'results', search: false });
  else if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'results' });
  }
  if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'loading');
  function esc(s) { return String(s == null ? '—' : s).replace(/[<>]/g, ''); }
  function scoreHtml(g) {
    if (g.away_score == null || g.home_score == null) return 'Final pending';
    return esc(g.away_score) + '–' + esc(g.home_score);
  }
  var url = adapter && adapter.SLATE_URL;
  if (!url) {
    ChaseAsyncState.render(document.getElementById('slate'), 'error', 'Public slate URL missing.');
    return;
  }
  fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (slate) {
    if (!slate) {
      ChaseAsyncState.render(document.getElementById('slate'), 'error', 'Public slate was not reachable.');
      return;
    }
    var nb = adapter.normalize(slate);
    if (window.ChaseDataStatus) {
      ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
        return {
          sport: sport,
          publishedAt: nb.generated_at,
          dataCutoff: nb.data_through,
          source: 'public-slate',
          issues: []
        };
      });
    }
    var html = '<p class="ca-helper">Official scores when published. Model ATS / totals records live in Model Center.</p>';
    html += '<div class="ca-board-list">';
    nb.games.forEach(function (g) {
      html += '<article class="ca-card"><h2>' + esc(g.away) + ' @ ' + esc(g.home) +
        '</h2><p class="ca-helper">' + scoreHtml(g) + '</p></article>';
    });
    html += '</div>';
    document.getElementById('slate').innerHTML = html;
    if (window.ChaseAsyncState) ChaseAsyncState.ready(document.getElementById('slate'));
    if (!nb.games.length) ChaseAsyncState.render(document.getElementById('slate'), 'empty');
  }).catch(function (err) {
    ChaseAsyncState.render(document.getElementById('slate'), 'error', err.message);
  });
})();
"""


def models_page() -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Model Center — Chase Analytics</title>
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/mlbma_design_system.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="evidence">
{sport_nav()}
  <main class="container ca-page-shell ca-shell-main">
    <header class="ca-surface-header">
      <h1 class="ca-page-title">Model Center</h1>
      <p class="ca-helper">Projections, model-versus-market gaps, and priced markets stay behind a signed-in desk. This page does not preview those numbers.</p>
    </header>
    <section class="ca-card ca-card-pad">
      <h2>Access</h2>
      <p>Public Chase Analytics is Opening and Matchups: schedules, lineups, injuries, weather, descriptive stats, splits, and ranks inside each game.</p>
      <p>Model Center is a separate product. Sign-in and entitlement are not wired on this stub. When they ship, this route will load the authenticated board instead of a teaser.</p>
      <p class="ca-helper" id="mcContext">No projected scores, model lines, or confidence values are shown here.</p>
    </section>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>
  <script>
  (function () {{
    var q = new URLSearchParams(location.search);
    var sport = q.get('sport');
    var game = q.get('game');
    var el = document.getElementById('mcContext');
    if (!el) return;
    if (sport && game) {{
      el.textContent = 'Requested ' + sport.toUpperCase() + ' game ' + game +
        '. Predictive payload is withheld until entitlement is verified server-side.';
    }}
  }})();
  </script>
</body>
</html>
"""


def main() -> int:
    for sport in SPORTS:
        dest = ROOT / sport
        dest.mkdir(parents=True, exist_ok=True)
        if sport not in PUBLIC_SPORTS:
            parked = parked_page(sport)
            (dest / "index.html").write_text(parked, encoding="utf-8")
            (dest / "matchups.html").write_text(parked, encoding="utf-8")
            (dest / "results.html").write_text(parked, encoding="utf-8")
            print("wrote", sport, "parked (not on public desk)")
            continue
        (dest / "index.html").write_text(page(sport, kind="index"), encoding="utf-8")
        (dest / "matchups.html").write_text(page(sport, kind="matchups"), encoding="utf-8")
        (dest / "results.html").write_text(page(sport, kind="results"), encoding="utf-8")
        print("wrote", sport, "index/matchups/results")
    (ROOT / "models").mkdir(parents=True, exist_ok=True)
    models = models_page()
    (ROOT / "models" / "index.html").write_text(models, encoding="utf-8")
    mc = ROOT / "model-center"
    mc.mkdir(parents=True, exist_ok=True)
    (mc / "index.html").write_text(models.replace(
        "<title>Model Center — Chase Analytics</title>",
        "<title>Model Center — Chase Analytics</title>",
        1,
    ), encoding="utf-8")
    print("wrote models/index.html")
    print("wrote model-center/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
