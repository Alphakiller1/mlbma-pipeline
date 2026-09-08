"""Contrast floors for mark vs value tokens (WP1 / PART 2 §2.3)."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "design" / "tokens" / "chase-tokens.css"

# Measured in the handoff against panel #12141D
PANEL = (18 / 255, 20 / 255, 29 / 255)  # #12141D


def hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def rel_lum(rgb: tuple[float, float, float]) -> float:
    def f(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (f(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    l1, l2 = rel_lum(a), rel_lum(b)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def composite(fg: tuple[float, float, float], bg: tuple[float, float, float], opacity: float):
    return tuple(opacity * f + (1 - opacity) * b for f, b in zip(fg, bg))


def token_hexes(css: str) -> dict[str, str]:
    out = {}
    for m in re.finditer(r"(--[A-Za-z0-9_-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})", css):
        out[m.group(1)] = m.group(2)
    return out


class ContrastContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hexes = token_hexes(TOKENS.read_text(encoding="utf-8"))

    def test_handoff_measured_panel_ratios(self):
        panel = hex_to_rgb("12141D")
        self.assertAlmostEqual(contrast(hex_to_rgb("6E7383"), panel), 3.89, delta=0.08)
        self.assertAlmostEqual(contrast(hex_to_rgb("4C5161"), panel), 2.32, delta=0.08)
        self.assertAlmostEqual(contrast(hex_to_rgb("A4A8B6"), panel), 7.74, delta=0.12)
        self.assertAlmostEqual(contrast(hex_to_rgb("F5F6FA"), panel), 17.00, delta=0.2)
        self.assertAlmostEqual(contrast(hex_to_rgb("9A6BFF"), panel), 5.18, delta=0.12)

    def test_meta_floor_fails_on_paper_500_and_600(self):
        panel = hex_to_rgb("12141D")
        self.assertLess(contrast(hex_to_rgb(self.hexes["--ca-paper-500"]), panel), 4.5)
        self.assertLess(contrast(hex_to_rgb(self.hexes["--ca-paper-600"]), panel), 4.5)
        self.assertGreaterEqual(contrast(hex_to_rgb(self.hexes["--ca-paper-400"]), panel), 4.5)
        self.assertGreaterEqual(contrast(hex_to_rgb(self.hexes["--ca-paper-50"]), panel), 4.5)

    def test_group_opacity_drops_below_large_text_floor(self):
        panel = hex_to_rgb("12141D")
        faded_meta = composite(hex_to_rgb("A4A8B6"), panel, 0.5)
        faded_dim = composite(hex_to_rgb("6E7383"), panel, 0.5)
        self.assertAlmostEqual(contrast(faded_meta, panel), 2.85, delta=0.12)
        self.assertAlmostEqual(contrast(faded_dim, panel), 1.89, delta=0.12)
        self.assertLess(contrast(faded_meta, panel), 3.0)

    def test_text_3_and_4_keep_settled_hex(self):
        ds = (ROOT / "dashboard" / "mlbma_design_system.css").read_text(encoding="utf-8")
        self.assertIn("--text-3: var(--ca-paper-500)", ds)
        self.assertIn("--text-4: var(--ca-paper-600)", ds)
        self.assertIn("--text-disabled: var(--ca-paper-600)", ds)

    def test_value_tokens_clear_text_floor_on_panel(self):
        panel = hex_to_rgb("12141D")
        # Value-text siblings used on panels (not mark fills).
        for name in ("--ca-green-400", "--ca-red-200", "--ca-amber-400", "--ca-paper-400"):
            ratio = contrast(hex_to_rgb(self.hexes[name]), panel)
            self.assertGreaterEqual(ratio, 4.5, msg=f"{name} {ratio:.2f}")


if __name__ == "__main__":
    unittest.main()
