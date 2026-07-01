from __future__ import annotations

import unittest

import pandas as pd

from core.compute_pitching import calc_individual_pitching_scores
from scrapers.scrape_matchups import get_sp_stats


class IndividualPitchingScoreTests(unittest.TestCase):
    def test_uses_all_four_calibrated_inputs(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "Name": "Complete Ace",
                    "Tm": "AAA",
                    "K%": "30%",
                    "BB%": "5%",
                    "HR/9": 0.5,
                    "WHIP": 0.9,
                    "IP": 100,
                },
                {
                    "Name": "Traffic Risk",
                    "Tm": "BBB",
                    "K%": "30%",
                    "BB%": "5%",
                    "HR/9": 0.5,
                    "WHIP": 1.5,
                    "IP": 100,
                },
            ]
        )

        scores = calc_individual_pitching_scores(frame).set_index("Name")

        self.assertEqual(scores.loc["Complete Ace", "PitchScore"], 65.0)
        self.assertEqual(scores.loc["Traffic Risk", "PitchScore"], 35.0)

    def test_missing_whip_returns_no_partial_score(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "Name": "Incomplete Pitcher",
                    "Tm": "AAA",
                    "K%": "25%",
                    "BB%": "7%",
                    "HR/9": 1.0,
                    "IP": 40,
                }
            ]
        )

        self.assertTrue(calc_individual_pitching_scores(frame).empty)


class MatchupPitcherLookupTests(unittest.TestCase):
    def test_exact_name_prevents_same_surname_misattribution(self) -> None:
        frame = pd.DataFrame(
            [
                {"Name": "Taylor Rogers", "Tm": "SFG", "PitchScore": 51.0},
                {"Name": "Trevor Rogers", "Tm": "PIT", "PitchScore": 68.0},
            ]
        )

        result = get_sp_stats("Trevor Rogers", frame, "PIT")

        self.assertEqual(result["PitchScore"], 68.0)


if __name__ == "__main__":
    unittest.main()
