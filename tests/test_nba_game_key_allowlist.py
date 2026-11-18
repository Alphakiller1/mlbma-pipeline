"""Every per-game field the NBA adapter reads must be on the public game-key
allowlist (2026-11-18: lineup units and splits were classified but not
allowlisted, and every NBA publish failed the boundary check until fixed;
validate_public_fields only sees keys already in the data, so a local run
before the producer ships them cannot catch it)."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NbaGameKeyAllowlistTests(unittest.TestCase):
    def test_adapter_fields_are_allowlisted(self):
        js = (ROOT / "dashboard" / "sports" / "nba.js").read_text(encoding="utf-8")
        allowed = set(json.loads((ROOT / "design" / "public_restricted_fields.json").read_text(
            encoding="utf-8"))["allowed_game_keys"])
        read = sorted(set(re.findall(r"g\[side \+ '(_[a-z_]+)'\]", js)))
        self.assertTrue(read)
        missing = [f"{side}{key}" for key in read for side in ("away", "home") if f"{side}{key}" not in allowed]
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
