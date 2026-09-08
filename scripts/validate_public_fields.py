#!/usr/bin/env python3
"""Fail if public sport-route generators emit Model Center UI."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLASSIFICATION = ROOT / "design" / "public_metric_classification.json"
BUILDER = ROOT / "scripts" / "build_sport_routes.py"
SPORTS = ("mlb", "nfl", "wnba", "cfb")

# Strings that mean a public page is comparing, forecasting, or grading the model.
BANNED = (
    "ca-nfl-channels",
    "marginAxisHtml",
    "may_bet=",
    "model_margin",
    "win_probability",
    "edge_withheld_reason",
    "record.json",
    "ChaseModelStatus.render",
    "Published vs market",
)

BLOB_RE = {
    name: re.compile(
        rf"{name} = r\"\"\"(?P<body>.*?)\"\"\"",
        re.DOTALL,
    )
    for name in ("HUB_JS", "MATCHUPS_JS", "RESULTS_JS")
}


def extract_blobs(src: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for name, rx in BLOB_RE.items():
        m = rx.search(src)
        if not m:
            raise SystemExit(f"missing {name} in {BUILDER}")
        out[name] = m.group("body")
    return out


def hits(label: str, text: str) -> list[str]:
    found = []
    for token in BANNED:
        if token in text:
            found.append(f"{label}: banned {token!r}")
    return found


def main() -> int:
    spec = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    if "descriptive_public" not in spec or "model_private" not in spec:
        print("FAIL: public_metric_classification.json missing required keys")
        return 1
    private = {str(x).lower() for x in spec["model_private"]["examples"]}
    for required in ("projOSI", "win_probability", "model_margin", "may_bet"):
        if required.lower() not in private:
            print(f"FAIL: model_private.examples must include {required}")
            return 1

    src = BUILDER.read_text(encoding="utf-8")
    violations = []
    for name, body in extract_blobs(src).items():
        violations.extend(hits(f"scripts/build_sport_routes.py {name}", body))

    for sport in SPORTS:
        for name in ("index.html", "matchups.html", "results.html"):
            path = ROOT / sport / name
            if not path.is_file():
                violations.append(f"missing {path.relative_to(ROOT)}")
                continue
            violations.extend(hits(str(path.relative_to(ROOT)), path.read_text(encoding="utf-8")))

    if violations:
        print("FAIL: public/model boundary")
        print("\n".join(f"  - {v}" for v in violations))
        return 1
    print("OK: public sport routes omit model-only UI")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
