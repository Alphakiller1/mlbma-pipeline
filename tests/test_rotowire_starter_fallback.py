from __future__ import annotations

from bs4 import BeautifulSoup

from outputs.publish_public_slate import (
    _person_name_key,
    _rotowire_arm,
    _rotowire_card_days,
    add_rotowire_starter_ids,
    mlb_producer_from_statsapi,
)
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
        "away": {"name": "Erick Fedde", "hand": "R", "role": "primary", "id": 607200},
        "home": {"name": "Wrong Fallback", "hand": "L", "role": "starter"},
    }}

    game = mlb_producer_from_statsapi(
        schedule,
        arms={
            99: {"hand": "R", "era": "3.50"},
            607200: {"hand": "R", "era": "4.42"},
        },
        rotowire_starters=rotowire,
    )["games"][0]

    assert game["away_starter"] == "Erick Fedde"
    assert game["away_hand"] == "R"
    assert game["away_starter_id"] == 607200
    assert game["away_era"] == "4.42"
    assert game["home_starter"] == "Official Astro"
    assert game["home_starter_id"] == 99
    assert game["home_hand"] == "R"


def test_rotowire_ids_are_attached_and_accent_matching_is_stable(monkeypatch):
    starters = {
        ("CHC", "SD"): {
            "away": {"name": "Matthew Boyd", "hand": "L"},
            "home": {"name": "Cristopher Sanchez", "hand": "L"},
        }
    }
    monkeypatch.setattr(
        "outputs.publish_public_slate.fetch_mlb_person_ids",
        lambda names: {"Matthew Boyd": 571510, "Cristopher Sanchez": 650911},
    )

    enriched = add_rotowire_starter_ids(starters)

    assert enriched[("CHC", "SD")]["away"]["id"] == 571510
    assert enriched[("CHC", "SD")]["home"]["id"] == 650911
    assert _person_name_key("Cristopher Sánchez") == _person_name_key("Cristopher Sanchez")


def _schedule(away_probable=None):
    away = {"team": {"abbreviation": "ATL", "name": "Atlanta Braves"}}
    if away_probable:
        away["probablePitcher"] = away_probable
    return {"dates": [{"games": [{
        "gamePk": 849828,
        "gameDate": "2026-10-03T20:08:00Z",
        "status": {"abstractGameState": "Preview", "detailedState": "Scheduled"},
        "teams": {
            "away": away,
            "home": {
                "team": {"abbreviation": "LAD", "name": "Los Angeles Dodgers"},
                "probablePitcher": {"id": 669373, "fullName": "Tarik Skubal"},
            },
        },
    }]}]}


def test_primary_pitcher_is_published_with_its_role_and_mlb_spelling():
    rotowire = {("ATL", "LAD"): {
        "away": {"name": "Jr Ritchie", "hand": "R", "role": "primary", "id": 702275},
        "home": {"name": "Tarik Skubal", "hand": "L", "role": "starter"},
    }}
    game = mlb_producer_from_statsapi(
        _schedule(),
        arms={702275: {"name": "JR Ritchie", "hand": "R", "era": "4.91"}},
        rotowire_starters=rotowire,
    )["games"][0]

    assert game["away_starter"] == "JR Ritchie"
    assert game["away_starter_role"] == "primary"
    assert game["away_era"] == "4.91"
    # The official probable carries no role, whatever RotoWire said.
    assert game["home_starter"] == "Tarik Skubal"
    assert game["home_starter_role"] is None


def test_listed_non_primary_arm_is_marked_projected_and_tbd_is_dropped():
    rotowire = {("ATL", "LAD"): {
        "away": {"name": "Spencer Strider", "hand": "R", "role": "starter"},
        "home": {},
    }}
    game = mlb_producer_from_statsapi(_schedule(), rotowire_starters=rotowire)["games"][0]
    assert game["away_starter"] == "Spencer Strider"
    assert game["away_starter_role"] == "projected"

    assert _rotowire_arm({"Away_SP": "TBD"}, "Away") == {}
    assert _rotowire_arm({"Away_SP": "Undecided"}, "Away") == {}


def test_official_probable_clears_the_role():
    rotowire = {("ATL", "LAD"): {
        "away": {"name": "JR Ritchie", "hand": "R", "role": "primary"},
    }}
    game = mlb_producer_from_statsapi(
        _schedule({"id": 1, "fullName": "Chris Sale"}), rotowire_starters=rotowire,
    )["games"][0]
    assert game["away_starter"] == "Chris Sale"
    assert game["away_starter_role"] is None


def test_card_days_keep_one_series_game_off_the_next():
    html = """
    <div class="lineup is-mlb">
      <div class="lineup__abbr">ATL</div><div class="lineup__abbr">LAD</div>
      <a class="lineup__matchup" href="/baseball/box-score/dodgers-vs-braves-2026-10-03-3015165"></a>
    </div>"""
    assert _rotowire_card_days(html) == {("ATL", "LAD"): {"2026-10-03"}}
