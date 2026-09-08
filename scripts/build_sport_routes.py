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
        "matchups_href": "/wnba/matchups.html",
    },
    "cfb": {
        "title": "CFB — Chase Analytics",
        "adapter": "cfb",
        "global": "ChaseSportCFB",
        "picks_label": "Priced markets",
        "gems_label": None,
        "lede": "CFB board. Age is computed at view time from producer timestamps. Games sort by kickoff_utc.",
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
  <script src="/dashboard/chase_modelstatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_scope.js?v={STAMP}"></script>"""
    body_js = RESULTS_JS if results else (MATCHUPS_JS if matchups else HUB_JS)
    mode = "evidence" if results else "slate"
    more_bits = []
    if not matchups and not results and spec.get("matchups_href"):
        more_bits.append(f'<a class="hub-pill" href="{spec["matchups_href"]}">Open matchups</a>')
    if not results:
        more_bits.append(f'<a class="hub-pill" href="/{sport}/results.html">Results ledger</a>')
    if matchups or results:
        more_bits.append(f'<a class="hub-pill" href="/{sport}/">Board overview</a>')
    more_html = ('<p class="ca-helper">' + " ".join(more_bits) + "</p>") if more_bits else ""
    if matchups:
        lede = spec["lede"]
        h1 = sport.upper() + " matchups"
    elif results:
        lede = "Settled W/L/P from record.json. This is a results ledger, not a skill badge and not an edge."
        h1 = sport.upper() + " results"
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
<body data-mode="{mode}" data-sport="{sport}">
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
  <script src="/dashboard/chase_datastatus.js?v={STAMP}"></script>
  <script src="/dashboard/chase_sport_select.js?v={STAMP}"></script>
  <script src="/dashboard/sports/chase_board.js?v={STAMP}"></script>
  <script src="/dashboard/sports/{spec["adapter"]}.js?v={STAMP}"></script>
  <script src="/dashboard/chase_asyncstate.js?v={STAMP}"></script>
  <script src="/dashboard/chase_nav.js?v={STAMP}"></script>{extra_scripts}
  <script>
  window.CHASE_SPORT_PAGE = {spec["global"]};
  window.CHASE_SPORT_ID = {json.dumps(sport)};
  window.CHASE_SPORT_PICKS_LABEL = {json.dumps(spec["picks_label"])};
  window.CHASE_SPORT_GEMS_LABEL = {json.dumps(spec["gems_label"])};
  window.CHASE_SPORT_IS_MATCHUPS = {str(matchups).lower()};
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
  else if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'index' });
  }
  function esc(s) { return String(s == null ? '—' : s).replace(/[<>]/g, ''); }
  if (!adapter) {
    if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'error', 'adapter missing');
    return;
  }
  if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'loading');
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
    if (window.ChaseModelStatus) {
      ChaseModelStatus.render(document.getElementById('modelStatus'), {
        authority: nb.authority.level,
        may_bet: nb.authority.may_bet,
        unmet_gates: nb.authority.unmet_gates,
        evidence: nb.authority.evidence
      });
    }
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
    if (window.ChaseAsyncState) ChaseAsyncState.ready(document.getElementById('slate'));
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
  if (window.ChaseShell) ChaseShell.mount({ sport: sport, mode: 'slate', surface: 'matchups', search: true });
  else if (window.ChaseSportSelect) {
    ChaseSportSelect.render(document.getElementById('sportSelect'), sport);
    ChaseSportSelect.saveCtx(sport, { surface: 'matchups' });
  }
  if (window.ChaseAsyncState) ChaseAsyncState.render(document.getElementById('slate'), 'loading');
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
        sport: sport,
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
      html += '<article class="ca-card" data-game="' + esc(g.id) + '">';
      html += '<h2>';
      html += window.ChaseEntity ? ChaseEntity.html({ name: g.away, id: g.away, sport: sport }) : esc(g.away);
      html += ' @ ';
      html += window.ChaseEntity ? ChaseEntity.html({ name: g.home, id: g.home, sport: sport }) : esc(g.home);
      html += '</h2>';
      html += '<p class="ca-helper">' + esc(g.kickoff_display || g.kickoff_utc || 'kickoff unknown') + '</p>';
      html += '<div class="ca-nfl-channels">';
      html += '<div class="ca-nfl-channel"><h3>Model</h3><p>' + dash(g.model_margin) + '</p></div>';
      html += '<div class="ca-nfl-channel"><h3>Market</h3><p>' + dash(g.market_margin) + '</p></div>';
      html += '<div class="ca-nfl-channel"><h3>Published</h3><p>' + dash(g.published_margin) + '</p></div>';
      html += '</div>';
      if (window.ChaseBoard && ChaseBoard.marginAxisHtml) html += ChaseBoard.marginAxisHtml(g, sport);
      html += '<p>Edge points ' + dash(g.edge_points, g.edge_withheld_reason);
      if (g.edge_withheld_reason) html += ' — ' + esc(g.edge_withheld_reason);
      html += '</p>';
      html += '<details class="ca-evidence"><summary>Evidence</summary><p class="ca-helper">' +
        esc(g.evidence || nb.authority.evidence || 'Producer evidence is empty.') + '</p></details>';
      html += '</article>';
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
  var recordUrl = adapter.BOARD_URL.replace(/board\.json$/i, 'record.json');
  fetch(recordUrl, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (rec) {
      if (!rec) {
        ChaseAsyncState.render(document.getElementById('slate'), 'error', 'record.json was not reachable.');
        return;
      }
      if (window.ChaseModelStatus) {
        ChaseModelStatus.render(document.getElementById('modelStatus'), {
          authority: rec.authority,
          may_bet: rec.may_bet === true,
          unmet_gates: rec.unmet_gates || (rec.authority && rec.authority.unmet_gates) || [],
          evidence: rec.evidence || (rec.authority && rec.authority.evidence) || ''
        });
      }
      if (window.ChaseDataStatus) {
        ChaseDataStatus.bindResume(document.getElementById('dataStatus'), function () {
          return {
            sport: sport,
            publishedAt: rec.generated_at || rec.generated_at_utc,
            dataCutoff: rec.generated_at || rec.generated_at_utc,
            source: 'record.json',
            issues: rec.issues || []
          };
        });
      }
      var ats = rec.ats || {};
      var totals = rec.totals || {};
      var html = '<p class="ca-helper">Settled outcomes are discrete W/L/P marks. They do not imply future skill.</p>';
      html += '<p>Games graded: ' + esc(rec.games_graded) + ' · pending snapshots: ' + esc(rec.pending_snapshots) + '</p>';
      html += '<p>ATS ' + esc(ats.win) + '-' + esc(ats.loss) + '-' + esc(ats.push);
      html += ' · Totals ' + esc(totals.win) + '-' + esc(totals.loss) + '-' + esc(totals.push) + '</p>';
      html += '<p class="ca-helper">may_bet remains ' + esc(rec.may_bet === true) + ' as published. Presentation cannot upgrade it.</p>';
      document.getElementById('slate').innerHTML = html;
    if (window.ChaseAsyncState) ChaseAsyncState.ready(document.getElementById('slate'));
    }).catch(function (err) {
      ChaseAsyncState.render(document.getElementById('slate'), 'error', err.message);
    });
})();
"""


def main() -> int:
    for sport in SPORTS:
        dest = ROOT / sport
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "index.html").write_text(page(sport, kind="index"), encoding="utf-8")
        (dest / "matchups.html").write_text(page(sport, kind="matchups"), encoding="utf-8")
        (dest / "results.html").write_text(page(sport, kind="results"), encoding="utf-8")
        print("wrote", sport, "index/matchups/results")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
