"""Single source of truth for the design-layer cache stamp (WP1.A5)."""

from pathlib import Path

_STAMP_PATH = Path(__file__).resolve().parent.parent / "design" / "DESIGN_LAYER_VERSION"

DESIGN_LAYER_VERSION = _STAMP_PATH.read_text(encoding="utf-8").strip()
