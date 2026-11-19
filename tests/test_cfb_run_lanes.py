"""CFB ball carriers by run lane (scripts/cfb_run_lanes.py)."""
import unittest

from scripts import cfb_run_lanes


def play(text, team, gained, down=1, distance=10):
    return {"text": text, "statYardage": gained, "start": {"team": {"id": team}, "down": down, "distance": distance}}


class RunLaneTests(unittest.TestCase):
    def test_carries_split_by_runner_and_lane(self):
        plays = [
            play("(12:00) #22 K.Mason rush right for 12 yards gain to the RICE30", "1", 12),
            play("(11:20) #22 K.Mason rush right for 2 yards gain to the RICE28", "1", 2, down=2, distance=2),
            play("(10:40) #22 K.Mason rush middle for 1 yard gain to the RICE27", "1", 1),
            play("(10:00) #5 A.Sheppard rush left for 4 yards gain to the RICE23", "1", 4, down=3, distance=4),
            play("(9:20) #22 K.Mason rush right for 9 yards gain PENALTY TEM Holding (#70 X) 10 yards. NO PLAY", "1", 0),
            play("(9:00) #3 J.Doe pass complete short right to #8 B.B for 5 yards", "1", 5),
            play("(8:00) #4 R.Runner rush left for 3 yards loss to the TEM25", "2", -3),
        ]
        out = cfb_run_lanes.parse_game({"drives": {"previous": [{"plays": plays}]}})["teams"]
        mason = out["1"]["k|mason"]
        self.assertEqual(mason["right"], [2, 14, 2, 1], "a NO PLAY run is not counted")
        self.assertEqual(mason["middle"], [1, 1, 0, 0])
        self.assertEqual(out["1"]["a|sheppard"]["left"], [1, 4, 1, 0], "3rd and 4 converted")
        self.assertEqual(out["2"]["r|runner"]["left"], [1, -3, 0, 0])
        self.assertNotIn("j|doe", out["1"], "passes are not runs")

    def test_success_thresholds(self):
        s = cfb_run_lanes._success
        self.assertTrue(s(1, 10, 5))
        self.assertFalse(s(1, 10, 4))
        self.assertTrue(s(2, 10, 7))
        self.assertFalse(s(3, 4, 3))
        self.assertFalse(s(None, 10, 20))


if __name__ == "__main__":
    unittest.main()
