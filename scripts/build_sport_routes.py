#!/usr/bin/env python3
"""Generate the public MLB/NFL slate and factual game-detail routes.

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
PUBLIC_SPORTS = ("mlb", "nfl", "cfb")
PARKED_SPORTS = ("wnba",)
SPORTS = {
    "mlb": {
        "title": "MLB — Chase Analytics",
        "adapter": "mlb",
        "global": "ChaseSportMLB",
        "picks_label": "Public slate",
        "gems_label": None,
        "lede": "Every Game On Today’s Board, With The Arms, The Orders And The Ballpark That Decide It.",
        "matchups_href": "/mlb/matchups.html",
    },
    "nfl": {
        "title": "NFL — Chase Analytics",
        "adapter": "nfl",
        "global": "ChaseSportNFL",
        "picks_label": "Public slate",
        "gems_label": None,
        "lede": "Every Game On This Week’s Board, With The Quarterbacks, The Schemes And The Travel Behind It.",
        "matchups_href": "/nfl/matchups.html",
    },
    "wnba": {
        "title": "WNBA — Chase Analytics",
        "adapter": "wnba",
        "global": "ChaseSportWNBA",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "WNBA research slate.",
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


def model_nav() -> str:
    """Model Center is fully public, so its header has no account control."""
    return re.sub(
        r'\s*<button type="button" class="chase-account" id="chaseAccount".*?</button>',
        '',
        sport_nav(),
        flags=re.DOTALL,
    )


def parked_page(sport: str) -> str:
    label = sport.upper()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>{label} — Chase Analytics</title>
  <link rel="stylesheet" href="/dashboard/assets/fonts/chase-fonts.css?v={STAMP}">
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-public.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="entry" data-sport="{sport}">
{sport_nav()}
  <main class="ca-public-page ca-shell-main">
    <header class="ca-public-page__head">
      <div class="ca-public-page__copy">
        <p class="ca-public-page__eyebrow">Chase Analytics</p>
        <h1 class="ca-public-page__title">{label} is not on the public desk</h1>
        <p class="ca-public-page__lede">Chase Analytics is posting MLB and NFL only for now. {label} remains documented for a future release.</p>
      </div>
    </header>
    <div class="ca-public-page__links"><a href="/mlb/">MLB</a><a href="/nfl/">NFL</a><a href="/">Home</a></div>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>
</body>
</html>
"""


def page(sport: str, *, kind: str = "index") -> str:
    """The slate route. Completed games are reachable only through a matchup
    breakdown, so there is no separate past-results destination to generate
    (owner decision 2026-09-10)."""
    spec = SPORTS[sport]
    matchups = kind == "matchups"
    title = sport.upper() + " Matchups — Chase Analytics" if matchups else spec["title"]
    extra_scripts = f"""
  <script src="/dashboard/chase_shell.js?v={STAMP}"></script>"""
    body_js = MATCHUPS_JS
    mode = "slate"
    more_html = ""
    lede = spec["lede"]
    h1 = sport.upper() + " Matchups"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="stylesheet" href="/dashboard/assets/fonts/chase-fonts.css?v={STAMP}">
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-public.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="{mode}" data-sport="{sport}" data-ca-product="research">
{sport_nav()}
  <main class="ca-public-page ca-shell-main">
    <header class="ca-public-page__head">
      <div class="ca-public-page__copy">
        <h1 class="ca-public-page__title">{h1}</h1>
        <p class="ca-public-page__lede">{lede}</p>
      </div>
      <div class="ca-public-page__controls" data-desk-toolbar-host></div>
{more_html}
    </header>
    <div class="ca-public-page__content"><div id="slate" class="ca-async" data-state="loading">Loading {sport.upper()} slate…</div></div>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/mlbma_assets.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
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
  window.CHASE_SPORT_IS_MATCHUPS = true;
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
  if (window.ChaseMatchupCard) ChaseMatchupCard.mount({ sport: sport, adapter: adapter, host: document.getElementById('slate') });
})();
"""

MATCHUPS_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseShell) ChaseShell.mount({ sport: sport, mode: 'slate', surface: 'matchups', search: false });
  if (window.ChaseMatchupCard) ChaseMatchupCard.mount({ sport: sport, adapter: adapter, host: document.getElementById('slate') });
})();
"""



def matchup_page(sport: str) -> str:
    spec = SPORTS[sport]
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{sport.upper()} Matchup Analysis — Chase Analytics</title>
  <link rel="stylesheet" href="/dashboard/assets/fonts/chase-fonts.css?v={STAMP}">
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-public.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="evidence" data-sport="{sport}" data-ca-product="research">
{sport_nav()}
  <main id="matchupDetail" class="ca-detail-page ca-shell-main" data-state="loading">
    <div class="ca-loading-state" role="status">Loading matchup analysis…</div>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/mlbma_assets.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/sports/public_sport_registry.js?v={STAMP}"></script>
  <script src="/dashboard/sports/chase_public_slate.js?v={STAMP}"></script>
  <script src="/dashboard/sports/{spec['adapter']}.js?v={STAMP}"></script>
  <script src="/dashboard/matchup_card.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>
  <script src="/dashboard/chase_shell.js?v={STAMP}"></script>
  <script src="/dashboard/public_game_detail.js?v={STAMP}"></script>
  <script>
    window.CHASE_SPORT_PAGE = {spec['global']};
    if (window.ChaseShell) ChaseShell.mount({{ sport: {json.dumps(sport)}, mode: 'evidence', surface: 'matchup', search: false, context: false }});
    if (window.ChasePublicGameDetail) ChasePublicGameDetail.mount({{
      sport: {json.dumps(sport)}, adapter: window.CHASE_SPORT_PAGE, host: document.getElementById('matchupDetail')
    }});
  </script>
</body>
</html>
"""


def models_page() -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Model Center — Chase Analytics</title>
  <link rel="stylesheet" href="/dashboard/assets/fonts/chase-fonts.css?v={STAMP}">
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-semantic.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-primitives.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-components.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-patterns.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-shell.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/mlbma_design_system.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/styles/chase-model-center.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="evidence" data-ca-product="research">
{model_nav()}
  <main class="ca-public-page ca-shell-main">
    <header class="ca-public-page__head">
      <div class="ca-public-page__copy">
        <h1 class="ca-public-page__title">Model Center</h1>
        <p class="ca-public-page__lede">Every game on today’s slate, with projected scores and the model’s position against the market.</p>
      </div>
    </header>
    <div id="mcBoard"></div>
    <p class="sr-only" id="mcContext">Loading the latest published model board.</p>
  </main>
  <footer class="ca-shell-footer">Chase Analytics</footer>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <!-- The board's team chips need the asset registry for crests; without it
       MLBMAAssets is undefined and every chip fell back to bare text. -->
  <script src="/dashboard/mlbma_assets.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>
  <script src="/dashboard/sports/chase_board.js?v={STAMP}"></script>
  <script src="/dashboard/model_center.js?v={STAMP}"></script>
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
            print("wrote", sport, "parked (not on public desk)")
            continue
        (dest / "index.html").write_text(page(sport, kind="index"), encoding="utf-8")
        (dest / "matchups.html").write_text(page(sport, kind="matchups"), encoding="utf-8")
        (dest / "matchup.html").write_text(matchup_page(sport), encoding="utf-8")
        print("wrote", sport, "index/matchups/matchup")
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
