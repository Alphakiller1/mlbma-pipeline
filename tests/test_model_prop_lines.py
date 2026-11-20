"""Exercise current prop sources and the actual Model Center renderer with Node."""
import subprocess
import unittest
from pathlib import Path


class ModelPropLineContracts(unittest.TestCase):
    def test_provider_identity_pagination_and_line_comparisons(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "--test", "tests/model_prop_lines.test.mjs"], cwd=root,
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
