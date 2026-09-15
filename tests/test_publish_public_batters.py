"""The batter artifact must never be overwritten with an empty table."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_publisher():
    spec = importlib.util.spec_from_file_location(
        "publish_public_batters", ROOT / "scripts" / "publish_public_batters.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class KeepLastGoodBatterContextTests(unittest.TestCase):
    def test_missing_batter_source_keeps_the_published_table(self):
        """Scheduled runs skip FanGraphs, so batter_profiles.csv is absent while
        the bullpen file exists. On 2026-09-14 that published an empty batter
        table over a good one; the last good artifact must survive instead."""
        publisher = load_publisher()
        with tempfile.TemporaryDirectory() as tmp:
            public = Path(tmp) / "public"
            data = Path(tmp) / "data"
            public.mkdir()
            data.mkdir()
            good = {
                "schema": "chase-public-batters/1",
                "generated_at_utc": "2026-09-11T07:05:23Z",
                "batters": {"vs_rhp": {"somebatter": {"osi": {"value": 61.0}}}},
                "bullpen": {},
            }
            dest = public / "batter_context.json"
            dest.write_text(json.dumps(good), encoding="utf-8")
            (data / "bullpen_individual.csv").write_text(
                "pitcher_name,pitcher_team,appearances,overall_FIP\n"
                "Some Reliever,KC,20,3.10\n",
                encoding="utf-8",
            )
            publisher.PUBLIC = public

            code = publisher.main(["publish_public_batters.py", str(data)])

            self.assertEqual(code, 0, "a missing batter source must not fail the pipeline")
            self.assertEqual(json.loads(dest.read_text(encoding="utf-8")), good)


if __name__ == "__main__":
    unittest.main()
