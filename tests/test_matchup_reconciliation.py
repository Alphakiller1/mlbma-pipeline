from __future__ import annotations

import pandas as pd

from scrapers.scrape_matchups import enrich_games_with_api_pitchers


def test_live_api_probable_replaces_stale_rotowire_name_and_hand() -> None:
    rotowire = pd.DataFrame(
        [{
            "Away_Team": "BAL",
            "Home_Team": "CIN",
            "Away_SP": "Brandon Young",
            "Away_SP_Hand": "R",
            "Home_SP": "Hunter Greene",
            "Home_SP_Hand": "L",
        }]
    )
    api = pd.DataFrame(
        [{
            "Away_Team": "BAL",
            "Home_Team": "CIN",
            "Away_SP": "Brandon Young",
            "Away_SP_Hand": "R",
            "Home_SP": "Nick Lodolo",
            "Home_SP_Hand": "L",
        }]
    )

    enriched = enrich_games_with_api_pitchers(rotowire, api)

    assert enriched.loc[0, "Home_SP"] == "Nick Lodolo"
    assert enriched.loc[0, "Home_SP_Hand"] == "L"


def test_tbd_api_probable_does_not_erase_rotowire_name() -> None:
    rotowire = pd.DataFrame(
        [{
            "Away_Team": "BAL",
            "Home_Team": "CIN",
            "Away_SP": "Brandon Young",
            "Away_SP_Hand": "R",
            "Home_SP": "Hunter Greene",
            "Home_SP_Hand": "R",
        }]
    )
    api = pd.DataFrame(
        [{
            "Away_Team": "BAL",
            "Home_Team": "CIN",
            "Away_SP": "Brandon Young",
            "Away_SP_Hand": "R",
            "Home_SP": "TBD",
            "Home_SP_Hand": "R",
        }]
    )

    enriched = enrich_games_with_api_pitchers(rotowire, api)

    assert enriched.loc[0, "Home_SP"] == "Hunter Greene"
