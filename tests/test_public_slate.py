from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PublicSlateProjectionTests(unittest.TestCase):
    def test_leak_fixture_is_rejected_until_projected(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        leak = json.loads((ROOT / "tests" / "fixtures" / "restricted_board_leak.json").read_text(encoding="utf-8"))
        with self.assertRaises(SystemExit):
            assert_clean(leak)
        out = project_slate("mlb", leak)
        assert_clean(out)
        blob = json.dumps(out)
        self.assertNotIn("model_margin", blob)
        self.assertNotIn("player_projections", blob)
        self.assertEqual(out["games"][0]["id"], "leak-game")
        self.assertEqual(out["games"][0]["venue"], "Test Park")

    def test_committed_public_slates_are_allowlisted(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean

        for sport in ("mlb", "nfl"):
            slate = json.loads((ROOT / "data" / "public" / sport / "slate.json").read_text(encoding="utf-8"))
            assert_clean(slate)
            self.assertEqual(slate["schema"], "chase-public-slate/1")
            self.assertTrue(slate["games"])

    def test_public_slates_are_tracked_not_gitignored(self):
        import subprocess

        path = ROOT / "data" / "public" / "mlb" / "slate.json"
        proc = subprocess.run(
            ["git", "check-ignore", "-q", str(path)],
            cwd=ROOT,
        )
        self.assertNotEqual(proc.returncode, 0, "data/public slates must ship with the site")
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("!data/public/", ignore)

    def test_nav_and_shell_age_public_research_from_public_slate(self):
        nav = (ROOT / "dashboard" / "chase_nav.js").read_text(encoding="utf-8")
        shell = (ROOT / "dashboard" / "chase_shell.js").read_text(encoding="utf-8")
        self.assertIn("publicResearch || sport !== 'mlb' ? 'public-slate' : 'sheet'", nav)
        self.assertIn("data-ca-product') === 'research' || sport !== 'mlb' ? 'public-slate' : 'sheet'", shell)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", nav)
        self.assertNotIn("source: sport === 'mlb' ? 'sheet' : 'board'", shell)

    def test_nested_freshness_cannot_smuggle_model_fields(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        producer = {
            "generated_at_utc": "2026-09-09T00:00:00Z",
            "games": [{
                "id": "x",
                "away": "AAA",
                "home": "BBB",
                "freshness": {"state": "ok", "model_margin": -1.2},
            }],
        }
        out = project_slate("mlb", producer)
        assert_clean(out)
        self.assertEqual(out["games"][0]["freshness"], "ok")
        self.assertNotIn("model_margin", json.dumps(out))

    def test_mlb_matchup_csv_projects_without_private_metrics(self):
        import sys
        import tempfile
        sys.path.insert(0, str(ROOT))
        from outputs.publish_public_slate import mlb_producer
        sys.path.insert(0, str(ROOT / "scripts"))
        from project_public_slate import assert_clean, project_slate

        tmp = Path(tempfile.mkdtemp())
        (tmp / "today_matchups.csv").write_text(
            "Slate_Date,Time,Away,Home,Away_SP,Away_Hand,Home_SP,Home_Hand,Away_OSI,Lineup_Edge\n"
            "2026-09-09,7:05 PM ET,NYY,BOS,Cole,R,Bello,R,110,NYY +4.0\n",
            encoding="utf-8",
        )
        (tmp / "today_weather.csv").write_text(
            "away_team,home_team,stadium_name,temperature_f,conditions\n"
            "NYY,BOS,Fenway Park,72,clear\n",
            encoding="utf-8",
        )
        producer = mlb_producer(tmp)
        out = project_slate("mlb", producer)
        assert_clean(out)
        blob = json.dumps(out)
        self.assertNotIn("110", blob)
        self.assertNotIn("Lineup_Edge", blob)
        self.assertNotIn("Away_OSI", blob)
        self.assertEqual(out["games"][0]["away"], "NYY")
        self.assertEqual(out["games"][0]["venue"], "Fenway Park")

    def test_empty_producer_does_not_overwrite_known_good(self):
        import sys
        import tempfile
        sys.path.insert(0, str(ROOT))
        from outputs.publish_public_slate import write_if_better

        tmp = Path(tempfile.mkdtemp()) / "slate.json"
        tmp.write_text('{"schema":"chase-public-slate/1","games":[{"id":"keep"}]}', encoding="utf-8")
        before = tmp.read_text(encoding="utf-8")
        self.assertFalse(write_if_better("mlb", {"games": []}, tmp))
        self.assertEqual(tmp.read_text(encoding="utf-8"), before)
