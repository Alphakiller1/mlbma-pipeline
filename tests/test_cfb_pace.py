"""CFB pace and possession (scripts/cfb_pace.py, 2026-11-21)."""
import unittest
from collections import Counter

from scripts import cfb_pace


def play(pid, kind, period, clock, team, home=0, away=0, text=""):
    return {"id": pid, "type": {"text": kind}, "period": {"number": period}, "clock": {"displayValue": clock},
            "start": {"team": {"id": team}}, "homeScore": home, "awayScore": away, "text": text}


def payload():
    drives = [
        {"team": {"id": "1"}, "start": {"period": {"number": 1}}, "timeElapsed": {"displayValue": "2:00"}, "plays": [
            play("a1", "Kickoff Return (Offense)", 1, "15:00", "1"),
            play("a2", "Rush", 1, "14:55", "1"),
            play("a3", "Pass Reception", 1, "14:30", "1"),        # 25 s after the snap before
            play("a4", "Timeout", 1, "14:30", "1"),
            play("a5", "Pass Incompletion", 1, "13:00", "1"),     # 90 s: a stoppage, dropped
            play("a6", "Rushing Touchdown", 1, "12:40", "1", away=7),  # 20 s
        ]},
        {"team": {"id": "2"}, "start": {"period": {"number": 3}}, "timeElapsed": {"displayValue": "3:30"}, "plays": [
            play("b1", "Rush", 3, "10:00", "2", away=7),          # trailing 0-7, neutral (wp 0.5)
            play("b2", "Penalty", 3, "9:40", "2", away=7, text="PENALTY ... NO PLAY"),
            play("b3", "Sack", 3, "9:30", "2", away=7),           # 30 s, still trailing
        ]},
    ]
    return {"header": {"competitions": [{"competitors": [
        {"homeAway": "home", "team": {"id": "2"}}, {"homeAway": "away", "team": {"id": "1"}}]}]},
        "drives": {"previous": drives},
        "winprobability": [{"playId": "a6", "homeWinPercentage": 0.5}]}


class ParseTests(unittest.TestCase):
    def test_snaps_gaps_situations_and_possession(self):
        teams = cfb_pace.parse_game(payload())["teams"]
        away, home = teams["1"], teams["2"]
        self.assertEqual(away["snaps"], 4)                 # the kickoff and timeout are not snaps
        self.assertEqual((away["gap"], away["gaps"]), (45, 2))  # 25 + 20; the 90 s stoppage dropped
        self.assertEqual(away["snaps_h1"], 4)
        self.assertEqual(away.get("snaps_leading", 0), 0)  # 0-0 before each of its snaps
        self.assertEqual((away["top"], away["top_h1"]), (120, 120))
        self.assertEqual(home["snaps"], 2)                 # the no-play penalty is not a snap
        self.assertEqual((home["snaps_trailing"], home["snaps_h2"], home["snaps_neutral"]), (2, 2, 2))
        self.assertEqual((home["gap"], home["gaps"]), (30, 1))
        self.assertEqual(home["top_h2"], 210)

    def test_a_game_without_both_offenses_is_not_read(self):
        bare = payload()
        bare["drives"]["previous"] = bare["drives"]["previous"][:1]
        self.assertIsNone(cfb_pace.parse_game(bare))


class FigureTests(unittest.TestCase):
    def test_per_game_figures_and_rank_directions(self):
        mine = Counter({"snaps": 140, "gap": 2500, "gaps": 100, "top": 3600, "top_h1": 1800, "top_h2": 1800})
        theirs = Counter({"snaps": 120, "gap": 3000, "gaps": 100, "top": 3600})
        f = cfb_pace.figures(mine, theirs, 2)
        self.assertEqual((f["off_ppg"], f["off_spp"], f["off_top"], f["off_top_h1"]), (70.0, 25.0, 30.0, 15.0))
        self.assertEqual((f["def_ppg"], f["def_spp"]), (60.0, 30.0))
        self.assertIsNone(f["off_spp_neutral"])
        # Tempo is neutral and fastest first; what a defense faces is fewest first.
        self.assertEqual(cfb_pace._spec("off_spp")[1:], ("neutral", "num", "low"))
        self.assertEqual(cfb_pace._spec("def_ppg_leading")[1:], ("low", "num", "low"))
        self.assertEqual(cfb_pace._spec("off_top_h2")[1:], ("neutral", "clock", "high"))
        e = cfb_pace._ranked("Seconds per snap", 22.0, "neutral", "num", "low", [22.0, 25.0, 30.0])
        self.assertEqual((e["rank"], e["of"], e["rank_word"]), (1, 3, "fastest"))


if __name__ == "__main__":
    unittest.main()
