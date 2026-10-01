from __future__ import annotations

import unittest
from unittest.mock import patch

from scripts import publish_public_cfb_slate as cfb


class CfbCurrentSeasonTests(unittest.TestCase):
    def test_scheme_parser_keeps_coverage_front_pressure_and_matchup_plan(self):
        page = '''
        <div class="dm-side"><div><div class="name">Away U</div>
        <div class="sub">Air Raid · Pass-heavy</div>
        <div class="rate">56.0% pass on competitive downs</div></div></div>
        <div class="dm-side"><div><div class="name">Home U</div>
        <div class="sub">Power Spread · Run-heavy</div>
        <div class="rate">42.0% pass on competitive downs</div></div></div>
        <div class="dm-tier t2"><div><strong>Away U offence</strong><dl class="mb-0">
        <dt>Expected play caller</dt><dd>Coach A</dd>
        <dt>Facing</dt><dd>Home U — 3-3-5, Two-high zone-match leaning, Simulated pressure</dd>
        <dt>Attack vs man</dt><dd>Use crossers.</dd><dt>Attack vs zone</dt><dd>Use spacing.</dd>
        <dt>Versus pressure</dt><dd>Use hot throws.</dd><dt>Primary failure mode</dt><dd>Sacks.</dd>
        <dt>Confidence</dt><dd>High</dd></dl></div></div>
        <div class="dm-tier t2"><div><strong>Home U offence</strong><dl class="mb-0">
        <dt>Expected play caller</dt><dd>Coach B</dd>
        <dt>Facing</dt><dd>Away U — 4-2-5, Man-match leaning, Balanced pressure menu</dd>
        </dl></div></div><p>metric season 2025</p>
        '''
        profiles = cfb.parse_scheme_matchup(page, 2026)
        away = profiles["name:awayu"]
        home = profiles["name:homeu"]
        self.assertEqual(away["offense_scheme"]["family"], "Air Raid")
        self.assertEqual(away["defense_scheme"]["coverage_leaning"], "Man-match leaning")
        self.assertEqual(home["defense_scheme"]["front"], "3-3-5")
        self.assertEqual(home["defense_scheme"]["pressure_profile"], "Simulated pressure")
        self.assertEqual(away["matchup_plan"]["attack_vs_zone"], "Use spacing.")
        self.assertEqual(away["metric_season"], 2025)

    def test_sp_plus_parser_publishes_all_four_ranked_units(self):
        rows = []
        for place in range(1, 131):
            rows.append(
                f'<tr wire:key="sp-rating-{place}"><td>{place}. Team {place} (4-0)'
                f'<img src="http://a.espncdn.com/i/teamlogos/ncaa/500/{place}.png"></td>'
                f'<td>{30 - place / 10:.1f}</td><td>{40 - place / 10:.1f} ({place})</td>'
                f'<td>{10 + place / 10:.1f} ({place})</td><td>0.5 ({place})</td></tr>'
            )
        ratings = cfb.parse_sp_plus(
            '<meta content="Updated for the 2026 season">' + "".join(rows), 2026
        )
        team = ratings["id:1"]
        self.assertEqual(team["overall"]["rank"], 1)
        self.assertEqual(team["offense"]["of"], 130)
        self.assertEqual(team["defense"]["value"], 10.1)
        self.assertEqual(team["special_teams"]["rank"], 1)
        self.assertIn("not FTN DVOA", team["method"])

    def test_espn_response_must_match_requested_regular_season(self):
        stale = {
            "requestedSeason": {"year": 2025, "type": {"type": 2}},
            "categories": [],
            "teams": [],
        }
        with patch.object(cfb, "fetch_json", return_value=stale):
            with self.assertRaisesRegex(RuntimeError, "season mismatch"):
                cfb.load_espn_stats(2026)

    def test_team_form_rejects_a_prior_season_row(self):
        team = {"season": 2025, "own": {}, "opp": {}, "games": 12}
        self.assertIsNone(cfb.form_for(team, {}, 2026))

    def test_efficiency_and_trench_rates_are_derived_from_observed_counts(self):
        team = {
            "season": 2026,
            "games": 2,
            "own": {
                "general": {"fumblesRecovered": 1},
                "passing": {
                    "passingAttempts": 50, "sacks": 5, "sackYardsLost": 35,
                    "completions": 32, "passingYards": 400, "totalPoints": 56,
                    "passingTouchdowns": 4, "interceptions": 2,
                },
                "rushing": {"rushingAttempts": 45, "rushingYards": 225},
                "miscellaneous": {
                    "firstDowns": 42, "firstDownsPassing": 24, "firstDownsRushing": 18,
                },
            },
            "opp": {
                "passing": {
                    "passingAttempts": 60, "sacks": 6, "sackYardsLost": 42,
                    "completions": 35, "passingYards": 420, "totalPoints": 34,
                    "passingTouchdowns": 3, "interceptions": 3,
                },
                "rushing": {"rushingAttempts": 34, "rushingYards": 136},
                "miscellaneous": {
                    "firstDowns": 31, "firstDownsPassing": 20, "firstDownsRushing": 11,
                },
            },
        }
        self.assertAlmostEqual(cfb.derived_rate(team, "own", "sack_rate"), 5 / 55)
        self.assertAlmostEqual(cfb.derived_rate(team, "own", "yards_per_play"), 625 / 100)
        self.assertAlmostEqual(cfb.derived_rate(team, "opp", "points_per_play"), 34 / 100)
        self.assertAlmostEqual(cfb.derived_rate(team, "opp", "disruption_rate"), 10 / 100)
        self.assertAlmostEqual(cfb.derived_rate(team, "own", "yards_per_completion"), 12.5)
        self.assertAlmostEqual(cfb.derived_rate(team, "opp", "pass_touchdown_rate"), 3 / 60)
        self.assertAlmostEqual(cfb.derived_rate(team, "opp", "interception_rate"), 3 / 60)
        self.assertAlmostEqual(cfb.derived_rate(team, "own", "dropbacks_per_game"), 27.5)

        pools = {spec[0]: [cfb.derived_rate(team, spec[1], spec[2])]
                 for spec in cfb.DERIVED_SPEC}
        form = cfb.form_for(team, pools, 2026)
        self.assertIn("off_points_per_play", form["rates"])
        self.assertIn("def_sack_rate", form["rates"])
        # Owner 2026-10-01: pace and play mix carry their place too, ranked
        # by "most" (1st = most plays per game).
        self.assertEqual(form["rates"]["off_plays_pg"]["rank"], 1)
        self.assertEqual(form["rates"]["off_plays_pg"]["better"], "neutral")
        self.assertEqual(form["rates"]["def_sack_rate"]["rank"], 1)


if __name__ == "__main__":
    unittest.main()


def test_publisher_refuses_a_short_pull(tmp_path, monkeypatch):
    """A slate where most games lack unit profiles is a broken pull, not a quiet
    week: the published slate must be kept, not overwritten."""
    out = tmp_path / "slate.json"
    out.write_text('{"games": ["previous"]}', encoding="utf-8")
    monkeypatch.setattr(cfb, "OUT", out)
    monkeypatch.setattr(cfb, "load_board_games",
                        lambda: ([{"id": 1}, {"id": 2}], {"season": cfb.datetime.now(cfb.timezone.utc).year}))
    monkeypatch.setattr(cfb, "load_espn_stats", lambda season: {})
    monkeypatch.setattr(cfb, "load_espn_events", lambda: [])
    monkeypatch.setattr(cfb, "load_sp_plus", lambda season: {})
    monkeypatch.setattr(cfb, "load_scheme_profiles", lambda season, week: {})
    monkeypatch.setattr(cfb, "event_index", lambda events: {})
    monkeypatch.setattr(cfb, "public_game", lambda raw, *a: {"id": raw["id"]})
    assert cfb.main() == 1
    assert out.read_text(encoding="utf-8") == '{"games": ["previous"]}'
