"""A club that loses its data to an upstream hiccup keeps its published data."""
import json
import tempfile
import unittest
from pathlib import Path

from outputs.publish_public_slate import patch_club_gaps


def slate(missing_club=None):
    games = []
    clubs = [("NYJ", "DET"), ("KC", "BUF"), ("SF", "LAR"), ("DAL", "PHI"), ("GB", "CHI"),
             ("NE", "MIA")]
    for away, home in clubs:
        g = {"away": away, "home": home}
        for side, club in (("away", away), ("home", home)):
            if club != missing_club:
                g[f"{side}_player_scheme"] = [{"player_name": club + " QB"}]
                g[f"{side}_lineups"] = {"offense": [club]}
        games.append(g)
    return {"games": games}


class ClubGapTests(unittest.TestCase):
    def test_a_club_that_lost_its_data_keeps_the_published_value(self):
        with tempfile.TemporaryDirectory() as tmp:
            published = Path(tmp) / "slate.json"
            published.write_text(json.dumps(slate()), encoding="utf-8")
            fresh = slate(missing_club="NYJ")
            notes = patch_club_gaps(fresh, published)
            jets = fresh["games"][0]
            self.assertEqual(jets["away_player_scheme"], [{"player_name": "NYJ QB"}])
            self.assertEqual(jets["away_lineups"], {"offense": ["NYJ"]})
            self.assertTrue(any("NYJ player_scheme carried" in n for n in notes))

    def test_nothing_to_carry_is_reported_not_silent(self):
        with tempfile.TemporaryDirectory() as tmp:
            notes = patch_club_gaps(slate(missing_club="NYJ"), Path(tmp) / "none.json")
            self.assertTrue(any("NYJ player_scheme MISSING" in n for n in notes))

    def test_a_field_most_clubs_lack_is_not_a_gap(self):
        fresh = slate()
        for g in fresh["games"][:3]:
            g.pop("away_lineups"); g.pop("home_lineups")
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(patch_club_gaps(fresh, Path(tmp) / "none.json"), [])


if __name__ == "__main__":
    unittest.main()


class BoardWideOutageTest(unittest.TestCase):
    def test_a_field_every_club_lost_is_carried_so_the_rest_publishes(self):
        # 2026-10-03: no Parquet engine emptied every nflverse family for every club; the
        # guard then froze the whole slate (injuries, starters) for days.
        published = slate()
        fresh = slate()
        for g in fresh["games"]:
            for side in ("away", "home"):
                g.pop(f"{side}_player_scheme", None)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "slate.json"
            path.write_text(json.dumps(published), encoding="utf-8")
            notes = patch_club_gaps(fresh, path)
        self.assertTrue(all(g["away_player_scheme"] and g["home_player_scheme"] for g in fresh["games"]))
        self.assertTrue(any("absent from every club" in n for n in notes))
