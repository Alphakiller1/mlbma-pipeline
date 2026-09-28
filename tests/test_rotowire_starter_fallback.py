from __future__ import annotations

from bs4 import BeautifulSoup

from outputs.publish_public_slate import mlb_producer_from_statsapi
from scrapers.scrape_lineups import _parse_lineup_cards


HTML = """
<div class="lineup is-mlb">
  <div class="lineup__abbr">PHI</div><div class="lineup__abbr">ATL</div>
  <div class="lineup__time">2:00 PM ET</div>
  <div class="lineup__main">
    <ul class="lineup__list is-visit">
      <li class="lineup__player-highlight">
        <div class="lineup__player-highlight-name">
          <a href="/baseball/player/cristopher-sanchez-16500">C. Sanchez</a>
          <span class="lineup__throws">L</span>
        </div>
      </li>
    </ul>
    <ul class="lineup__list is-home">
      <li class="lineup__player-highlight">
        <div class="lineup__player-highlight-name"><b>Undecided</b></div>
      </li>
    </ul>
  </div>
</div>
<div class="lineup is-mlb">
  <div class="lineup__abbr">CWS</div><div class="lineup__abbr">HOU</div>
  <div class="lineup__time">5:00 PM ET</div>
  <div class="lineup__main">
    <ul class="lineup__list is-visit">
      <li class="lineup__player-highlight">
        <div class="lineup__player-highlight-name">
          <a href="/baseball/player/erick-fedde-13346">Erick Fedde</a>
          <span class="lineup__throws">R</span>
        </div>
        <div class="lineup__player-highlight-stats"><div class="tag">PRIM</div></div>
      </li>
    </ul>
    <ul class="lineup__list is-home"></ul>
  </div>
</div>
"""


def test_parser_expands_names_and_keeps_primary_pitcher_on_correct_side():
    _, games = _parse_lineup_cards(BeautifulSoup(HTML, "html.parser"), "2026-09-29")
    phillies = games[games["Away"] == "PHI"].iloc[0]
    white_sox = games[games["Away"] == "CHW"].iloc[0]

    assert phillies["Away_SP"] == "Cristopher Sanchez"
    assert phillies["Away_SP_Hand"] == "L"
    assert phillies["Home_SP"] == "TBD"
    assert white_sox["Away_SP"] == "Erick Fedde"
    assert white_sox["Away_SP_Role"] == "primary"
    assert white_sox["Home_SP"] == "TBD"


def test_public_slate_defaults_missing_official_probable_to_rotowire():
    schedule = {"dates": [{"games": [{
        "gamePk": 1,
        "gameDate": "2026-09-29T21:00:00Z",
        "status": {"abstractGameState": "Preview", "detailedState": "Scheduled"},
        "teams": {
            "away": {"team": {"abbreviation": "CWS", "name": "Chicago White Sox"}},
            "home": {
                "team": {"abbreviation": "HOU", "name": "Houston Astros"},
                "probablePitcher": {"id": 99, "fullName": "Official Astro"},
            },
        },
    }]}]}
    rotowire = {("CWS", "HOU"): {
        "away": {"name": "Erick Fedde", "hand": "R", "role": "primary"},
        "home": {"name": "Wrong Fallback", "hand": "L", "role": "starter"},
    }}

    game = mlb_producer_from_statsapi(
        schedule,
        arms={99: {"hand": "R", "era": "3.50"}},
        rotowire_starters=rotowire,
    )["games"][0]

    assert game["away_starter"] == "Erick Fedde"
    assert game["away_hand"] == "R"
    assert game["away_starter_id"] is None
    assert game["home_starter"] == "Official Astro"
    assert game["home_hand"] == "R"
