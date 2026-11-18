"""CFB charting from the official scorer's play text (scripts/cfb_charting.py)."""
import unittest

from scripts import cfb_charting as ch


def play(text, ptype, offense="Ohio State", defense="Michigan", ytg=60, gained=0, down=1, distance=10,
         ppa=0.1, period=1, game=1, off_score=0, def_score=0):
    return {"gameId": game, "offense": offense, "defense": defense, "playText": text, "playType": ptype,
            "yardsToGoal": ytg, "yardsGained": gained, "down": down, "distance": distance, "ppa": ppa,
            "period": period, "offenseScore": off_score, "defenseScore": def_score}


# Rushes that teach the parser which school each spot prefix belongs to:
# "to the MICH45" from the 60 for a 15-yard gain sits on Michigan's side.
SIDES = [
    play("(10:00) Shotgun #5 A.Back rush middle for 15 yards gain to the MICH45", "Rush", ytg=60, gained=15),
    play("(09:00) Shotgun #5 A.Back rush left for 4 yards gain to the OSU44", "Rush", ytg=60, gained=4),
]


class ChartingParseTests(unittest.TestCase):
    def test_formation_depth_direction_air_and_pressure(self):
        plays = SIDES + [
            # 60 yards to go, caught at MICH40 (40 to go): 20 air yards, 5 after the catch.
            play("(08:00) No Huddle-Shotgun #7 J.Passer pass complete deep right to #1 W.Out caught at MICH40, "
                 "for 25 yards to the MICH35 QB hurried by #9 D.End", "Pass Reception", ytg=60, gained=25, ppa=1.2),
            play("(07:00) #7 J.Passer pass incomplete short left to #2 T.End thrown to OSU45", "Pass Incompletion",
                 ytg=60, ppa=-0.5),
            play("(06:00) Shotgun #7 J.Passer sacked for loss of 7 yards to the OSU33 (#9 D.End)", "Sack",
                 ytg=60, gained=-7, ppa=-1.5),
        ]
        week = ch.parse_week(plays)
        off = week["teams"]["ohiostate"]["off"]
        dfn = week["teams"]["michigan"]["def"]
        self.assertEqual(off, dfn, "the offense's sums are the defense's allowed sums")
        self.assertEqual(off["att"], 2)
        self.assertEqual(off["deep_att"], 1)
        self.assertEqual(off["short_att"], 1)
        self.assertEqual(off["right_att"], 1)
        self.assertEqual(off["left_att"], 1)
        self.assertEqual(off["db"], 3)
        self.assertEqual(off["pressured_n"], 2, "a hurry and a sack are both pressure")
        self.assertEqual(off["clean_n"], 1)
        # Air yards: 20 on the catch, 60 - 55 = 5 on the throw to the OSU45.
        self.assertEqual(off["air_n"], 2)
        self.assertAlmostEqual(off["air_sum"], 25)
        self.assertAlmostEqual(off["yac_sum"], 5)
        self.assertEqual(off["shotgun_n"], 4)
        self.assertEqual(off["under_center_n"], 1)
        self.assertEqual(off["no_huddle_n"], 1)
        self.assertEqual(off["run_middle_n"], 1)
        self.assertEqual(off["run_left_n"], 1)
        looks = week["passers"]["ohiostate|j|passer"]
        self.assertEqual(looks["all"]["db"], 3)
        self.assertEqual(looks["deep"]["comp"], 1)
        self.assertEqual(looks["pressured"]["db"], 2)
        self.assertEqual(looks["under_center"]["att"], 1)

    def test_garbage_time_and_no_play_are_left_out(self):
        plays = [
            play("(02:00) Shotgun #5 A.Back rush middle for 3 yards gain to the MICH40", "Rush",
                 period=4, off_score=45, def_score=10),
            play("(02:00) Shotgun #7 J.Passer pass complete short left to #1 W.Out caught at MICH50 "
                 "PENALTY MICH Holding NO PLAY", "Pass Reception"),
            play("Kneel down by #7 J.Passer at OSU30 for loss of 1 yard", "Rush"),
        ]
        self.assertEqual(ch.parse_week(plays)["teams"], {})

    def test_name_keys_and_surname_fallback(self):
        self.assertEqual(ch.name_key("W.Watson III"), "w|watson")
        self.assertEqual(ch.name_key("William Watson III"), "w|watson")
        charting = {"passers": {"troy|g|crowder": {"all": {"dropbacks": 9}}}}
        qbs = {"troy": [{"player_name": "Will Crowder"}, {"player_name": "Tucker Kilcrease"}]}
        self.assertEqual(ch.attach_qbs(qbs, charting), 1)
        self.assertIn("looks", qbs["troy"][0])
        self.assertNotIn("looks", qbs["troy"][1])

    def test_team_rates_rank_offense_high_and_defense_low(self):
        teams = {}
        for i, school in enumerate(("a", "b", "c")):
            c = {"deep_att": 20 + i, "deep_ppa": 0.1 * i * (20 + i), "deep_ppa_n": 20 + i, "att": 100,
                 "left_att": 30, "middle_att": 30, "right_att": 40}
            teams[school] = {"off": dict(c), "def": dict(c)}
        rates = ch.team_rates(teams, {"a", "b", "c"})
        self.assertEqual(rates["c"]["rates"]["off_deep_epa"]["rank"], 1, "most EPA is the best offense")
        self.assertEqual(rates["a"]["rates"]["def_deep_epa"]["rank"], 1, "least allowed is the best defense")
        self.assertEqual(rates["a"]["rates"]["off_deep_rate"]["better"], "neutral")


if __name__ == "__main__":
    unittest.main()
