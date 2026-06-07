"""Regenerate dashboard/mlbma_config.js from core.config (run after config changes)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from core.config import (
    ARCHETYPE_HIGH_MIN,
    ARCHETYPE_LOW_MAX,
    ARCHETYPE_TIER_CUTOFFS,
    DASHBOARD_PAGES,
    FIP_CONSTANT,
    OSI_TIERS,
    PARK_FACTORS,
    PITCHING_TIERS,
    SHEET_ID,
    SHEET_TABS,
    SUPABASE_DASHBOARD,
)

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mlbma_config.js"


def _js_pages() -> str:
    pages = []
    for key, meta in DASHBOARD_PAGES.items():
        params = meta.get("params")
        params_js = "null" if not params else json.dumps(list(params))
        pages.append(
            f"    {{ id: {json.dumps(key)}, label: {json.dumps(meta['label'])}, "
            f"file: {json.dumps(meta['file'])}, url: {json.dumps(meta['url'])}, "
            f"params: {params_js} }}"
        )
    return "[\n" + ",\n".join(pages) + "\n  ]"


def _js_tiers(tiers: tuple) -> str:
    return json.dumps([[t[0], t[1]] for t in tiers])


def _js_park() -> str:
    return json.dumps(PARK_FACTORS, indent=2).replace('"', "'")  # use double quotes in JSON is fine


def main() -> None:
    tabs_js = json.dumps(SHEET_TABS, indent=2)
    archetype_js = json.dumps(
        {
            "high_min": ARCHETYPE_HIGH_MIN,
            "mid_min": ARCHETYPE_TIER_CUTOFFS["mid_min"],
            "low_max": ARCHETYPE_LOW_MAX,
        },
        indent=2,
    )

    content = f"""/**
 * MLBMA shared dashboard constants -- generated from core/config.py
 * Regenerate: python -m dashboard.generate_mlbma_config_js
 */
window.MLBMA_CONFIG = {{
  SHEET_ID: {json.dumps(SHEET_ID)},
  SHEET_TABS: {tabs_js},
  DASHBOARD_PAGES: {_js_pages()},
  OSI_TIERS: {_js_tiers(OSI_TIERS)},
  PITCHING_TIERS: {_js_tiers(PITCHING_TIERS)},
  ARCHETYPE_TIER_CUTOFFS: {archetype_js},
  FIP_CONSTANT: {FIP_CONSTANT:.2f},
  PARK_FACTORS: {json.dumps(PARK_FACTORS, indent=2)},
  SUPABASE: {json.dumps(SUPABASE_DASHBOARD, indent=2)}
}};

/* Legacy aliases */
window.MLBMA_SHEET_ID = MLBMA_CONFIG.SHEET_ID;
window.MLBMA_FIP_CONSTANT = MLBMA_CONFIG.FIP_CONSTANT;
"""
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
