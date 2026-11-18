"""CBB résumé, luck and schedule load (2026-11-18 audit)."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.cbb_public import resume, venues  # noqa: E402

CROSSWALK = [
    {"espn_team_id": "130", "barttorvik_team_name": "Michigan", "short_display_name": "Michigan",
     "display_name": "Michigan Wolverines"},
    {"espn_team_id": "127", "barttorvik_team_name": "Michigan St.", "short_display_name": "Michigan St",
     "display_name": "Michigan State Spartans"},
    {"espn_team_id": "2617", "barttorvik_team_name": "Stephen F. Austin", "short_display_name": "SF Austin",
     "display_name": "Stephen F. Austin Lumberjacks"},
    {"espn_team_id": "2599", "barttorvik_team_name": "St. John's", "short_display_name": "St John's",
     "display_name": "St. John's Red Storm"},
    {"espn_team_id": "2229", "barttorvik_team_name": "Florida Atlantic", "short_display_name": "FAU",
     "display_name": "Florida Atlantic Owls"},
]


class NameMatchTests(unittest.TestCase):
    def setUp(self):
        self.tiers = resume.name_index(CROSSWALK)

    def test_the_ncaa_short_forms_match_one_school(self):
        for ncaa, tid in (("Michigan", 130), ("Michigan St.", 127), ("SFA", 2617), ("St. John's (NY)", 2599),
                          ("Fla. Atlantic", 2229)):
            self.assertEqual(resume.match(ncaa, self.tiers), tid, ncaa)

    def test_a_looser_tier_never_settles_an_exact_name(self):
        # "Michigan State Spartans" cut to two words is "michigan": the exact
        # name must win, not an ambiguity that skips the Wolverines.
        self.assertEqual(resume.match("Michigan", self.tiers), 130)
        self.assertIsNone(resume.match("Nowhere State", self.tiers))


class NetSeasonGateTests(unittest.TestCase):
    PAGE = ("<p>Through Games {stamp}</p><table>" + "".join(
        f"<tr><td>{i}</td><td>Team {i}</td></tr>" for i in range(1, 4)) + "</table>")

    def test_last_seasons_final_list_is_not_this_seasons_net(self):
        page = self.PAGE.format(stamp="Apr. 06 2026")
        self.assertEqual(resume.official_net(2027, CROSSWALK, lambda url: page), ({}, None))
        ranks, through = resume.official_net(2026, CROSSWALK, lambda url: page)
        self.assertEqual(through, "2026-04-06")

    def test_a_december_list_is_this_season(self):
        page = self.PAGE.format(stamp="Dec. 01 2026")
        self.assertEqual(resume.official_net(2027, CROSSWALK, lambda url: page)[1], "2026-12-01")


class QuadrantTests(unittest.TestCase):
    def test_the_ncaa_bands(self):
        self.assertEqual([resume.quadrant(n, "Home") for n in (30, 31, 75, 76, 160, 161)], [1, 2, 2, 3, 3, 4])
        self.assertEqual([resume.quadrant(n, "Neutral") for n in (50, 51, 200, 201)], [1, 2, 3, 4])
        self.assertEqual([resume.quadrant(n, "Away") for n in (75, 76, 135, 136, 240, 241)], [1, 2, 2, 3, 3, 4])

    def test_records_count_ranked_opponents_by_site(self):
        context = {"games": [
            {"opponent_id": "1", "site": "Away", "points": 70, "opponent_points": 65},     # NET 60 away: Q1 win
            {"opponent_id": "2", "site": "Home", "points": 60, "opponent_points": 61},     # NET 100 home: Q3 loss
            {"opponent_id": "3", "site": "Neutral", "points": 80, "opponent_points": 50},  # NET 300: Q4 win
            {"opponent_id": "9", "site": "Home", "points": 90, "opponent_points": 40},     # unranked: not counted
            {"opponent_id": "1", "site": "Home", "points": None, "opponent_points": None},  # not played
        ]}
        self.assertEqual(resume.quadrant_records(context, {1: 60, 2: 100, 3: 300}),
                         {"q1": "1-0", "q2": "0-0", "q3": "0-1", "q4": "1-0"})


class RegressionTests(unittest.TestCase):
    def test_luck_figures_rank_against_the_league(self):
        def team(o3, d3, games):
            return {"rates": {"games_all": len(games), "fg3_pct_o_all": o3, "fg3_pct_d_all": d3,
                              "ft_pct_o_all": 0.7, "ft_pct_d_all": 0.7},
                    "games": [{"points": p, "opponent_points": q} for p, q in games]}
        contexts = {1: team(0.36, 0.30, [(70, 68), (71, 70), (60, 62), (80, 50)]),
                    2: team(0.32, 0.36, [(60, 80), (55, 70)])}
        out = resume.regression(contexts)
        self.assertEqual(out[1]["close_record"], "2-1")
        self.assertAlmostEqual(out[1]["close_win_pct"]["value"], 0.6667, places=4)
        self.assertNotIn("close_win_pct", out[2])          # no close games: no rate
        self.assertEqual(out[1]["opp_three_luck"]["rank"], 1)  # lowest opponent 3P% ranks first
        self.assertEqual(out[2]["own_three_vs_league"]["rank"], 2)


class ScheduleLoadTests(unittest.TestCase):
    PLACES = {"Rock Hill, SC": {"lat": 34.92, "lon": -81.03, "elevation_ft": 679, "timezone": "America/New_York"},
              "Laramie, WY": {"lat": 41.31, "lon": -105.59, "elevation_ft": 7165, "timezone": "America/Denver"}}

    def game(self, day, home, away, city, state, final=True, neutral=False):
        return {"game_date": day, "home_id": home, "away_id": away, "venue_address_city": city,
                "venue_address_state": state, "neutral_site": neutral,
                "status_type_name": "STATUS_FINAL" if final else "STATUS_SCHEDULED"}

    def test_a_trip_to_altitude(self):
        schedule = [self.game("2026-11-10", 1, 2, "Rock Hill", "SC"),
                    self.game("2026-11-14", 3, 1, "Laramie", "WY", final=False)]
        index = venues.team_finals(schedule)
        load = venues.schedule_load(index, self.PLACES, 1, schedule[1])
        self.assertEqual(load["rest_days"], 3)
        self.assertEqual(venues.rest_label(load), "3 Days Rest")
        self.assertTrue(1350 < load["travel_miles"] < 1450)  # great-circle miles
        self.assertEqual(load["tz_shift"], -2)
        self.assertTrue(load["altitude"])
        home = venues.schedule_load(index, self.PLACES, 3, schedule[1])
        self.assertEqual(venues.rest_label(home), "First Game")
        self.assertFalse(home["altitude"])                  # the home side lives there

    def test_geocoder_keeps_to_the_state(self):
        payload = {"results": [{"latitude": 1, "longitude": 2, "elevation": 100, "timezone": "X", "admin1": "Ohio"},
                               {"latitude": 34.9, "longitude": -81.0, "elevation": 207, "timezone": "America/New_York",
                                "admin1": "South Carolina"}]}
        place = venues.geocode("Rock Hill", "SC", fetch=lambda url: payload)
        self.assertEqual((place["lat"], place["elevation_ft"]), (34.9, 679))


if __name__ == "__main__":
    unittest.main()
