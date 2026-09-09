"""Generation must be a fixed point.

`_stamp_design_layer.py` appended `data-mode="slate"` to <body> on every run
because its guard only inspected the first 4000 characters, and
dashboard/index.html's <body> sits at line 2756. Seven copies had accumulated:
duplicate attributes on a 403 KB file that grew every time anyone regenerated.
Nothing caught it because the output was never compared against a second run.

These tests run the generators over a copy of the tree and assert the second
pass is byte-identical to the first.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GENERATORS = ("scripts/build_sport_routes.py", "scripts/_stamp_design_layer.py")
COPIED = ("scripts", "design", "dashboard", "mlb", "nfl", "wnba", "cfb", "models", "packages")


def _snapshot(root: Path) -> dict[str, bytes]:
    out: dict[str, bytes] = {}
    for sub in ("mlb", "nfl", "wnba", "cfb", "models"):
        for f in sorted((root / sub).glob("*.html")):
            out[f"{sub}/{f.name}"] = f.read_bytes()
    for f in sorted((root / "dashboard").glob("*.html")):
        out[f"dashboard/{f.name}"] = f.read_bytes()
    return out


class GenerationIdempotenceTests(unittest.TestCase):
    def test_a_second_generator_pass_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "repo"
            work.mkdir()
            for name in COPIED:
                src = ROOT / name
                if src.exists():
                    shutil.copytree(src, work / name,
                                    ignore=shutil.ignore_patterns("__pycache__"))

            def run_pass() -> None:
                for gen in GENERATORS:
                    proc = subprocess.run(
                        [sys.executable, str(work / gen)],
                        cwd=work, capture_output=True, text=True,
                    )
                    self.assertEqual(proc.returncode, 0,
                                     f"{gen} failed: {proc.stderr[-400:]}")

            run_pass()
            first = _snapshot(work)
            run_pass()
            second = _snapshot(work)

            changed = sorted(k for k in first if first[k] != second[k])
            self.assertEqual(changed, [],
                             f"generation is not a fixed point; churned: {changed}")

    def test_body_carries_exactly_one_data_mode(self):
        for sub in ("dashboard", "mlb", "nfl", "wnba", "cfb", "models"):
            for f in sorted((ROOT / sub).glob("*.html")):
                text = f.read_text(encoding="utf-8", errors="replace")
                for body in re.findall(r"<body[^>]*>", text):
                    self.assertLessEqual(
                        body.count("data-mode="), 1,
                        f"{sub}/{f.name} has {body.count('data-mode=')} data-mode attributes",
                    )


    def test_token_link_appears_once_per_page(self):
        """The same insert-if-absent bug, second symptom.

        `_stamp_design_layer.py` compared against a TOKEN_LINK carrying the
        current stamp, so a page holding the *previous* stamp failed the test
        and got another link inserted. Three chase-tokens-v1.css tags per page
        had accumulated. The stamp must be rewritten in place, not re-inserted.
        """
        for f in sorted((ROOT / "dashboard").glob("*.html")):
            text = f.read_text(encoding="utf-8", errors="replace")
            self.assertLessEqual(
                text.count("chase-tokens-v1.css"), 1,
                f"dashboard/{f.name} links chase-tokens-v1.css "
                f"{text.count('chase-tokens-v1.css')} times",
            )

    def test_every_design_layer_stamp_matches_the_version_file(self):
        """A bump must reach every reference, or caches serve a split design layer."""
        stamp = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
        pages: list[tuple[str, Path]] = []
        for sub in ("dashboard", "mlb", "nfl", "wnba", "cfb", "models"):
            pages.extend((sub, f) for f in sorted((ROOT / sub).glob("*.html")))
        pages.extend(
            ("dashboard/render", f)
            for f in sorted((ROOT / "dashboard" / "render").glob("*.html"))
        )
        pages.append((".", ROOT / "index.html"))
        pages.append((".", ROOT / "404.html"))
        for sub, f in pages:
            if not f.is_file():
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            for asset in ("chase-tokens-v1.css", "design_layer_version.js"):
                for m in re.finditer(re.escape(asset) + r"\?v=([0-9a-z]+)", text):
                    self.assertEqual(
                        m.group(1), stamp,
                        f"{sub}/{f.name} stamps {asset} at {m.group(1)}, expected {stamp}",
                    )
        dlv = (ROOT / "dashboard" / "design_layer_version.js").read_text(encoding="utf-8")
        self.assertIn(f'DESIGN_LAYER_VERSION = "{stamp}"', dlv)


if __name__ == "__main__":
    unittest.main()
