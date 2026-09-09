#!/usr/bin/env python3
"""Fail if public Research surfaces load or emit Model Center fields."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASSIFICATION = ROOT / "design" / "public_metric_classification.json"
RESTRICTED = ROOT / "design" / "public_restricted_fields.json"
BUILDER = ROOT / "scripts" / "build_sport_routes.py"
LEAK = ROOT / "tests" / "fixtures" / "restricted_board_leak.json"

PUBLIC_JS = (
    ROOT / "dashboard" / "sports" / "mlb.js",
    ROOT / "dashboard" / "sports" / "nfl.js",
    ROOT / "dashboard" / "sports" / "chase_public_slate.js",
    ROOT / "dashboard" / "matchup_card.js",
    ROOT / "scripts" / "build_sport_routes.py",
)

BANNED_NETWORK = (
    "alphakiller1.github.io/mlb-model/board.json",
    "alphakiller1.github.io/nfl-model/board.json",
    "alphakiller1.github.io/wnba-edge-model/board.json",
    "alphakiller1.github.io/cfb-model/board.json",
)

BLOB_RE = {
    name: re.compile(rf"{name} = r\"\"\"(?P<body>.*?)\"\"\"", re.DOTALL)
    for name in ("HUB_JS", "MATCHUPS_JS", "RESULTS_JS")
}


def extract_blobs(src: str) -> dict[str, str]:
    out = {}
    for name, rx in BLOB_RE.items():
        m = rx.search(src)
        if not m:
            raise SystemExit(f"missing {name} in {BUILDER}")
        out[name] = m.group("body")
    return out


def main() -> int:
    spec = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    restricted = json.loads(RESTRICTED.read_text(encoding="utf-8"))
    if "descriptive_public" not in spec or "model_private" not in spec:
        print("FAIL: public_metric_classification.json missing required keys")
        return 1
    private = {str(x).lower() for x in spec["model_private"]["examples"]}
    for required in ("projOSI", "win_probability", "model_margin", "may_bet"):
        if required.lower() not in private:
            print(f"FAIL: model_private.examples must include {required}")
            return 1

    sys.path.insert(0, str(ROOT / "scripts"))
    from project_public_slate import assert_clean, project_slate

    leak = json.loads(LEAK.read_text(encoding="utf-8"))
    try:
        assert_clean(leak)
        print("FAIL: leak fixture was accepted as public")
        return 1
    except SystemExit:
        pass
    cleaned = project_slate("mlb", leak)
    assert_clean(cleaned)
    if any(k in json.dumps(cleaned) for k in ("model_margin", "win_probability", "player_projections")):
        print("FAIL: projected slate still contains restricted fields")
        return 1

    violations = []
    src = BUILDER.read_text(encoding="utf-8")
    for name, body in extract_blobs(src).items():
        if "BOARD_URL" in body or "chase_board.js" in body:
            violations.append(f"{name} still loads the model board adapter")
        if "market_margin" in body:
            violations.append(f"{name} still reads market_margin")
        for token in BANNED_NETWORK:
            if token in body:
                violations.append(f"{name}: {token}")

    for path in PUBLIC_JS:
        text = path.read_text(encoding="utf-8")
        for token in BANNED_NETWORK:
            if token in text:
                violations.append(f"{path.relative_to(ROOT)}: {token}")
        if path.name in {"mlb.js", "nfl.js"} and "github.io" in text:
            violations.append(f"{path.relative_to(ROOT)} still points at GitHub Pages")

    for sport in ("mlb", "nfl"):
        for name in ("index.html", "matchups.html", "results.html"):
            path = ROOT / sport / name
            text = path.read_text(encoding="utf-8")
            if "chase_board.js" in text:
                violations.append(f"{path.relative_to(ROOT)} loads chase_board.js")
            if "board.json" in text:
                violations.append(f"{path.relative_to(ROOT)} references board.json")
            for token in BANNED_NETWORK:
                if token in text:
                    violations.append(f"{path.relative_to(ROOT)}: {token}")
        slate = json.loads((ROOT / "data" / "public" / sport / "slate.json").read_text(encoding="utf-8"))
        try:
            assert_clean(slate)
        except SystemExit as exc:
            violations.append(f"data/public/{sport}/slate.json {exc}")

    compare = ROOT / "dashboard" / "matchup_compare.html"
    compare_text = compare.read_text(encoding="utf-8")
    if "chase_board.js" in compare_text:
        violations.append("dashboard/matchup_compare.html loads chase_board.js")
    if "board.json" in compare_text:
        violations.append("dashboard/matchup_compare.html references board.json")
    for token in BANNED_NETWORK:
        if token in compare_text:
            violations.append(f"dashboard/matchup_compare.html: {token}")

    if "forbidden_keys" not in restricted or "model_margin" not in restricted["forbidden_keys"]:
        violations.append("public_restricted_fields.json missing model_margin")

    if violations:
        print("FAIL: public/model boundary")
        print("\n".join(f"  - {v}" for v in violations))
        return 1
    print("OK: public sport routes omit model board transport and restricted fields")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
