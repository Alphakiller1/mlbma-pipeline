#!/usr/bin/env python3
"""Generate per-sport /mlb /nfl /wnba /cfb index.html (and NFL matchups Pilot B).

Each route loads only that sport's adapter. Regenerating is the source of truth
for these files — edit this script, then re-run.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
NAV = (ROOT / "dashboard" / "chase_nav.html").read_text(encoding="utf-8").strip()

SPORTS = {
    "mlb": {
        "title": "MLB — Chase Analytics",
        "adapter": "mlb",
        "global": "ChaseSportMLB",
        "picks_label": "Priced markets (Picks)",
        "gems_label": "Flagged tiles (Gems)",
        "lede": "MLB research board. Picks are priced markets, not a wall of recommendations. Gems are flagged tiles from the producer.",
        "matchups_href": "/dashboard/index.html#section-matchups-hero",
    },
    "nfl": {
        "title": "NFL — Chase Analytics",
        "adapter": "nfl",
        "global": "ChaseSportNFL",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "NFL slate. Model, market, and published are separate channels. A gap is not an edge. Priced markets are not Picks.",
        "matchups_href": "/nfl/matchups.html",
    },
    "wnba": {
        "title": "WNBA — Chase Analytics",
        "adapter": "wnba",
        "global": "ChaseSportWNBA",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "WNBA board. Producer JSON is fetched only for this sport. Missing CORS or a 404 is shown as error, not an empty fake slate.",
        "matchups_href": None,
    },
    "cfb": {
        "title": "CFB — Chase Analytics",
        "adapter": "cfb",
        "global": "ChaseSportCFB",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "CFB board. Age is computed at view time from producer timestamps. Games sort by kickoff_utc.",
        "matchups_href": None,
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


def page(sport: str, *, matchups: bool = False) -> str:
    spec = SPORTS[sport]
    title = "NFL Matchups — Chase Analytics" if matchups else spec["title"]
    extra_scripts = ""
    if matchups:
        extra_scripts = f"""
  <script src="/dashboard/chase_modelstatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_asyncstate.js?v={STAMP}"></script>"""
    body_js = MATCHUPS_JS if matchups else HUB_JS
    more = spec["matchups_href"]
    more_html = (
        f'<p class="ca-helper"><a class="hub-pill" href="{more}">Open matchup surface</a></p>'
        if more and not matchups
        else ""
    )
    if matchups:
        lede = spec["lede"]
        h1 = "NFL matchups"
    else:
        lede = spec["lede"]
        h1 = spec["title"].split("—")[0].strip() + " board"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/mlbma_design_system.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/theme.css?v={STAMP}">
  <link rel="stylesheet" href="/dashboard/chase_nav.css?v={STAMP}">
  <link rel="icon" type="image/png" href="/dashboard/assets/chase-icon-filled.png">
</head>
<body data-mode="slate" data-sport="{sport}">
{sport_nav()}
  <main class="container ca-page-shell" style="max-width:1100px;margin:88px auto 48px;padding:0 16px;">
    <h1 class="ca-page-title">{h1}</h1>
    <p class="ca-helper">{lede}</p>
    <div id="sportSelect"></div>
    {more_html}
    <div id="modelStatus"></div>
    <div id="dataStatus"></div>
    <div id="slate" class="ca-async">Loading {sport.upper()} board…</div>
  </main>
  <script src="/dashboard/design_layer_version.js?v={STAMP}"></script>
  <script src="/dashboard/chase_datastatus.js?v=20260908e"></script>
  <script src="/dashboard/chase_sport_select.js?v=20260908e"></script>
  <script src="/dashboard/sports/chase_board.js?v=20260908e"></script>
  <script src="/dashboard/sports/{spec["adapter"]}.js?v=20260908e"></script>
  <script src="/dashboard/chase_asyncstate.js?v=20260908e"></script>
  <script src="/dashboard/chase_nav.js?v=20260908e"></script>{extra_scripts}
  <script>
  window.CHASE_SPORT_PAGE = {spec["global"]};
  window.CHASE_SPORT_ID = {sport!r};
  window.CHASE_SPORT_PICKS_LABEL = {spec["picks_label"]!r};
  window.CHASE_SPORT_GEMS_LABEL = {spec["gems_label"]!r};
  window.CHASE_SPORT_IS_MATCHUPS = {str(matchups).lower()};
  {body_js}
  </script>
</body>
</html>
"""


HUB_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'index' });
  }
  function esc(s) { return String(s == null ? '—' : s).replace(/[<>]/g, ''); }
  if (!adapter) {
    if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'error', 'adapter missing');
    return;
  }
  Promise.all([
    fetch(adapter.BOARD_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch(adapter.BUILD_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (pack) {
    var board = pack[0], build = pack[1] || {};
    if (!board) {
      ChaseAsyncState.render(document.getElementById('slate'), 'error', 'board.json was not reachable for ' + sport + '.');
      return;
    }
    var nb = adapter.normalize(board);
    if (window.ChaseDataStatus) {
      ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
        return {
          sport: sport,
          state: build.state || undefined,
          dataCutoff: build.generated_at || build.generated_at_utc,
          quoteTimestamp: build.odds && (build.odds.fetched_at || build.odds.quote_timestamp),
          publishedAt: nb.generated_at,
          source: 'board.json',
          issues: build.issues || nb.authority.unmet_gates || []
        };
      });
    }
    var priced = (nb.priced_markets && nb.priced_markets.length) || nb.games.filter(function (g) { return g.priced; }).length;
    var html = '<p class="ca-helper">' + esc(window.CHASE_SPORT_PICKS_LABEL) + ': ' + priced;
    if (window.CHASE_SPORT_GEMS_LABEL && nb.flagged_tiles) {
      html += ' · ' + esc(window.CHASE_SPORT_GEMS_LABEL) + ': ' + nb.flagged_tiles.length;
    }
    html += ' · may_bet=' + (nb.authority.may_bet === true) + '</p>';
    html += '<p class="ca-helper">Authority (text): ' + esc(nb.authority.level) + '</p>';
    html += '<p class="ca-helper">' + nb.games.length + ' games, sorted by kickoff_utc at view time.</p>';
    document.getElementById('slate').innerHTML = html;
    if (!nb.games.length && !(nb.priced_markets && nb.priced_markets.length)) {
      ChaseAsyncState.render(document.getElementById('slate'), 'empty');
    }
  }).catch(function (err) {
    ChaseAsyncState.render(document.getElementById('slate'), 'error', err.message);
  });
})();
"""

MATCHUPS_JS = r"""
(function () {
  var adapter = window.CHASE_SPORT_PAGE;
  var sport = window.CHASE_SPORT_ID;
  if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'matchups' });
  }
  function esc(s) { return String(s == null ? '—' : s).replace(/[<>]/g, ''); }
  function dash(v, reason) {
    if (v == null || v === '') return '<span title="' + esc(reason || 'unavailable') + '">—</span>';
    return esc(v);
  }
  Promise.all([
    fetch(adapter.BOARD_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch(adapter.BUILD_URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return {}; })
  ]).then(function (pack) {
    var board = pack[0], build = pack[1] || {};
    if (!board) {
      ChaseAsyncState.render(document.getElementById('slate'), 'error', 'board.json was not reachable.');
      return;
    }
    var nb = adapter.normalize(board);
    if (window.ChaseBoard && ChaseBoard.sortGames) nb.games = ChaseBoard.sortGames(nb.games);
    else nb.games = nb.games.slice().sort(function (a, b) {
      return String(a.kickoff_utc || a.sort_key || '').localeCompare(String(b.kickoff_utc || b.sort_key || ''));
    });
    if (window.ChaseModelStatus) {
      ChaseModelStatus.render(document.getElementById('modelStatus'), Object.assign({}, nb.authority, {
        may_bet: nb.authority.may_bet,
        unmet_gates: nb.authority.unmet_gates,
        authority: nb.authority.level,
        evidence: nb.authority.evidence
      }));
    }
    ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
      return {
        sport: 'nfl',
        state: build.state || undefined,
        dataCutoff: build.generated_at || build.generated_at_utc,
        quoteTimestamp: build.odds && (build.odds.fetched_at || build.odds.quote_timestamp),
        publishedAt: nb.generated_at,
        source: 'board.json',
        issues: build.issues || []
      };
    });
    var priced = nb.games.filter(function (g) { return g.priced; }).length;
    var html = '<p class="ca-helper">Priced markets: ' + priced + ' of ' + nb.games.length + ' — not Picks.</p>';
    html += '<div class="ca-board-list">';
    nb.games.forEach(function (g, idx) {
      html += '<article class="ca-card" style="margin-bottom:12px" data-game="' + esc(g.id) + '">';
      html += '<h2>' + esc(g.away) + ' @ ' + esc(g.home) + '</h2>';
      html += '<p class="ca-helper">' + esc(g.kickoff_display || g.kickoff_utc || 'kickoff unknown') + '</p>';
      html += '<div class="ca-nfl-channels">';
      html += '<div class="ca-nfl-channel"><h3>Model</h3><p>' + dash(g.model_margin) + '</p></div>';
      html += '<div class="ca-nfl-channel"><h3>Market</h3><p>' + dash(g.market_margin) + '</p></div>';
      html += '<div class="ca-nfl-channel"><h3>Published</h3><p>' + dash(g.published_margin) + '</p></div>';
      html += '</div>';
      if (window.ChaseBoard && ChaseBoard.marginAxisHtml) html += ChaseBoard.marginAxisHtml(g, 'nfl');
      html += '<p>Edge points ' + dash(g.edge_points, g.edge_withheld_reason);
      if (g.edge_withheld_reason) html += ' — ' + esc(g.edge_withheld_reason);
      html += '</p>';
      html += '<details class="ca-evidence"><summary>Evidence</summary><p class="ca-helper">' +
        esc(g.evidence || nb.authority.evidence || 'Producer evidence is empty.') + '</p></details>';
      html += '</article>';
    });
    html += '</div>';
    document.getElementById('slate').innerHTML = html;
    if (!nb.games.length) ChaseAsyncState.render(document.getElementById('slate'), 'empty');
  }).catch(function (err) {
    ChaseAsyncState.render(document.getElementById('slate'), 'error', err.message);
  });
})();
"""


def main() -> int:
    for sport in SPORTS:
        dest = ROOT / sport / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(page(sport, matchups=False), encoding="utf-8")
        print("wrote", dest.relative_to(ROOT))
    matchups = ROOT / "nfl" / "matchups.html"
    matchups.write_text(page("nfl", matchups=True), encoding="utf-8")
    print("wrote", matchups.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
