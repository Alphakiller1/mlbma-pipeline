from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from chase_content.migrate import load_pipeline, load_sharp
from chase_content.render import (
    HEADER_BOTTOM,
    RenderError,
    _run_separation,
    metric_color,
    render_morning_slate,
    render_reports,
)
from chase_content.validate import validate_bundle

ROOT = Path(__file__).resolve().parents[1]


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


class PipelineMigrationTests(unittest.TestCase):
    def test_pipeline_adapter_builds_offense_and_trajectory(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp)
            write_csv(
                data / "today_matchups.csv",
                [{
                    "Slate_Date": "2026-07-03",
                    "Time": "7:10 PM ET",
                    "Away": "NYY",
                    "Home": "BOS",
                    "Away_SP": "Away Starter",
                    "Away_Hand": "R",
                    "Home_SP": "Home Starter",
                    "Home_Hand": "L",
                }],
            )
            write_csv(
                data / "metrics_vs_RHP.csv",
                [
                    {"Tm": "BOS", "OSI": "70", "ABQ": "60", "RCV": "75", "OBR": "68"},
                    {"Tm": "NYY", "OSI": "65", "ABQ": "55", "RCV": "70", "OBR": "64"},
                ],
            )
            write_csv(
                data / "metrics_vs_LHP.csv",
                [
                    {"Tm": "NYY", "OSI": "72", "ABQ": "62", "RCV": "76", "OBR": "69"},
                    {"Tm": "BOS", "OSI": "61", "ABQ": "53", "RCV": "64", "OBR": "60"},
                ],
            )
            write_csv(
                data / "team_profiles.csv",
                [
                    {"team": "BOS", "osi_ytd": "50", "osi_l7": "65"},
                    {"team": "NYY", "osi_ytd": "62", "osi_l7": "55"},
                ],
            )

            result = load_pipeline(data)
            self.assertEqual(result["slate_date"], "2026-07-03")
            self.assertEqual(result["games"][0]["key"], "NYY@BOS")
            self.assertEqual(result["offense"]["vs_rhp"][0]["team"], "BOS")
            self.assertEqual(result["offense"]["vs_lhp"][0]["team"], "NYY")
            self.assertEqual(result["offense"]["risers"][0]["team"], "BOS")
            self.assertEqual(result["offense"]["fallers"][0]["team"], "NYY")

    def test_legacy_sharp_adapter_discards_wrong_slate(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sharp.json"
            path.write_text(
                json.dumps({
                    "sharp_signals_recent": [
                        {
                            "snapshot_time": "2026-07-02T15:00:00+00:00",
                            "market_type": "ml",
                            "selection": "NYY",
                            "sharp_novig_prob": 0.58,
                            "soft_novig_prob": 0.52,
                        },
                        {
                            "snapshot_time": "2026-07-03T15:00:00+00:00",
                            "market_type": "total",
                            "selection": "over",
                            "sharp_novig_prob": 0.56,
                            "soft_novig_prob": 0.51,
                        },
                    ]
                }),
                encoding="utf-8",
            )
            result = load_sharp(path, "2026-07-03")
            self.assertEqual(result["ml"], [])
            self.assertEqual(len(result["totals"]), 1)
            self.assertAlmostEqual(result["totals"][0]["divergence"], 0.05)


class BundleAndRenderTests(unittest.TestCase):
    def setUp(self):
        self.bundle = json.loads(
            (ROOT / "examples" / "sample_bundle.json").read_text(encoding="utf-8")
        )

    def test_sample_bundle_is_valid(self):
        self.assertEqual(validate_bundle(self.bundle), [])

    def test_invalid_probabilities_fail_closed(self):
        self.bundle["games"][0]["projection"]["home_win_probability"] = 0.80
        problems = validate_bundle(self.bundle)
        self.assertTrue(any("sum to" in problem for problem in problems))

    def test_expected_slate_date_rejects_stale_bundle(self):
        problems = validate_bundle(self.bundle, expected_slate_date="2026-07-04")
        self.assertTrue(any("does not match expected" in problem for problem in problems))

    def test_all_reports_render_at_social_dimensions(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = render_reports(self.bundle, Path(temp), "all")
            self.assertEqual(len(paths), 3)
            for path in paths:
                self.assertTrue(path.exists())
                with Image.open(path) as image:
                    self.assertEqual(image.size, (1080, 1350))

    def test_morning_slate_ranks_by_run_separation(self):
        ranked = sorted(self.bundle["games"], key=_run_separation, reverse=True)
        self.assertGreaterEqual(_run_separation(ranked[0]), _run_separation(ranked[-1]))
        with tempfile.TemporaryDirectory() as temp:
            paths = render_morning_slate(self.bundle, Path(temp))
            self.assertEqual(len(paths), 1)
            with Image.open(paths[0]) as image:
                self.assertEqual(image.size, (1080, 1350))
                # Compact utility header — divider at HEADER_BOTTOM, no hero band.
                self.assertLessEqual(HEADER_BOTTOM, 190)
                # Non-token blue (#60A5FA) must not appear (old win-prob bar color).
                rgb = image.convert("RGB")
                pixels = {rgb.getpixel((x, y)) for x in range(0, rgb.width, 8) for y in range(0, rgb.height, 8)}
                self.assertNotIn((96, 165, 250), pixels)

    def test_metric_color_is_league_anchored(self):
        self.assertEqual(metric_color(83.3, "osi"), "#22C55E")
        self.assertEqual(metric_color(50.0, "osi"), "#A1A1AA")
        self.assertEqual(metric_color(25.0, "osi"), "#F2545B")

    def test_missing_chase_logo_fails_closed(self):
        from chase_content import render as render_mod

        original = render_mod.BRAND_LOGO
        try:
            render_mod.BRAND_LOGO = Path("/tmp/definitely-missing-chase-logo.png")
            with tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(RenderError):
                    render_reports(self.bundle, Path(temp), "morning-slate")
        finally:
            render_mod.BRAND_LOGO = original


if __name__ == "__main__":
    unittest.main()
