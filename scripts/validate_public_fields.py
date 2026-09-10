#!/usr/bin/env python3
"""Enforce the public Research / private analysis boundary.

The check follows every local stylesheet and script referenced by the canonical
MLB/NFL pages. It rejects legacy visual layers, private transports, restricted
payload keys, and prohibited public-facing phrases. The separate Model Center is
allowed only as a navigation destination.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CLASSIFICATION = ROOT / "design" / "public_metric_classification.json"
RESTRICTED = ROOT / "design" / "public_restricted_fields.json"
LEAK = ROOT / "tests" / "fixtures" / "restricted_board_leak.json"

PUBLIC_ENTRIES = (
    ROOT / "index.html",
    *(ROOT / sport / name for sport in ("mlb", "nfl") for name in ("index.html", "matchups.html", "matchup.html")),
)

PUBLIC_SLATES = tuple(ROOT / "data" / "public" / sport / "slate.json" for sport in ("mlb", "nfl"))

BANNED_ASSETS = {
    "mlbma_design_system.css",
    "responsive.css",
    "matchup_compare.css",
    "matchup_compare.js",
    "matchup_shared.js",
    "matchup_lineup_compare.js",
    "mlbma_charts.js",
    "chase_board.js",
}

BANNED_NETWORK = (
    "alphakiller1.github.io/mlb-model/board.json",
    "alphakiller1.github.io/nfl-model/board.json",
    "alphakiller1.github.io/wnba-edge-model/board.json",
    "alphakiller1.github.io/cfb-model/board.json",
)

# Exact user-facing concepts prohibited from the public matchup experience.
# "Model Center" is intentionally not here: the separate product may be linked
# once in each desktop/mobile navigation, but never promoted inside <main>.
BANNED_PUBLIC_PHRASES = (
    "model vs. market",
    "model projection",
    "model projected",
    "projected score",
    "projected runs",
    "projected points",
    "win probability",
    "betting edge",
    "model edge",
    "confidence score",
    "recommended pick",
)

ASSET_RE = re.compile(r'<(?:script|link)\b[^>]+(?:src|href)=["\']([^"\']+)["\']', re.I)
SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.I | re.S)
MAIN_RE = re.compile(r"<main\b[^>]*>(.*?)</main>", re.I | re.S)


def local_asset(entry: Path, raw: str) -> Path | None:
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or raw.startswith("//"):
        return None
    clean = parsed.path
    if not clean:
        return None
    if clean.startswith("/"):
        return ROOT / clean.lstrip("/")
    return entry.parent / clean


def public_dependencies(entry: Path) -> list[Path]:
    text = entry.read_text(encoding="utf-8")
    out: list[Path] = []
    for raw in ASSET_RE.findall(text):
        path = local_asset(entry, raw)
        if path and path.suffix.lower() in {".js", ".css"}:
            out.append(path.resolve())
    return out


def visible_main(html: str) -> str:
    match = MAIN_RE.search(html)
    if not match:
        return ""
    return SCRIPT_RE.sub("", match.group(1))


def main() -> int:
    violations: list[str] = []
    spec = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    restricted = json.loads(RESTRICTED.read_text(encoding="utf-8"))
    if "descriptive_public" not in spec or "model_private" not in spec:
        violations.append("public_metric_classification.json missing required keys")
    private = {str(x).lower() for x in spec.get("model_private", {}).get("examples", [])}
    for required in ("projOSI", "win_probability", "model_margin", "may_bet"):
        if required.lower() not in private:
            violations.append(f"model_private.examples must include {required}")

    forbidden = {str(x) for x in restricted.get("forbidden_keys", [])}
    allowed = {str(x) for x in restricted.get("allowed_game_keys", [])}
    for key in ("model_margin", "win_probability", "player_projections", "pick"):
        if key not in forbidden:
            violations.append(f"public_restricted_fields.json missing {key}")
    leaked_market_keys = {"book", "book_market", "book_side", "book_number", "quote_as_of_utc"} & allowed
    if leaked_market_keys:
        violations.append("public allowlist contains line-provider fields: " + ", ".join(sorted(leaked_market_keys)))

    sys.path.insert(0, str(ROOT / "scripts"))
    from project_public_slate import assert_clean, project_slate

    leak = json.loads(LEAK.read_text(encoding="utf-8"))
    try:
        assert_clean(leak)
        violations.append("restricted fixture was accepted without projection")
    except SystemExit:
        pass
    cleaned = project_slate("mlb", leak)
    try:
        assert_clean(cleaned)
    except SystemExit as exc:
        violations.append(f"projected fixture is not clean: {exc}")

    seen_assets: set[Path] = set()
    for entry in PUBLIC_ENTRIES:
        if not entry.is_file():
            violations.append(f"missing public route {entry.relative_to(ROOT)}")
            continue
        html = entry.read_text(encoding="utf-8")
        rel = entry.relative_to(ROOT)
        assets = public_dependencies(entry)
        names = [p.name for p in assets]
        for banned in sorted(BANNED_ASSETS & set(names)):
            violations.append(f"{rel} loads legacy/private asset {banned}")
        for path in assets:
            if not path.is_file():
                violations.append(f"{rel} references missing asset {path}")
            else:
                seen_assets.add(path)
        if "chase-public.css" not in names:
            violations.append(f"{rel} does not load chase-public.css")
        if "chase_nav.css" in names and "chase-public.css" in names and names.index("chase-public.css") < names.index("chase_nav.css"):
            violations.append(f"{rel} loads route composition before navigation styles")
        main_copy_html = visible_main(html)
        main_copy = main_copy_html.lower()
        for phrase in BANNED_PUBLIC_PHRASES:
            if phrase in main_copy:
                violations.append(f"{rel} public content contains {phrase!r}")
        if "model center" in main_copy:
            violations.append(f"{rel} promotes Model Center inside public content")
        # Handoff section 10: WNBA and CFB stay in design documentation only
        # and must not appear in navigation or content.
        for parked in ("/wnba/", "/cfb/"):
            if parked in html.lower():
                violations.append(f"{rel} exposes parked sport {parked}")

    for path in seen_assets:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        for token in BANNED_NETWORK:
            if token in text:
                violations.append(f"{rel} references {token}")
        if path.name in {"mlb.js", "nfl.js"} and "github.io" in text:
            violations.append(f"{rel} points at GitHub Pages")

    for slate_path in PUBLIC_SLATES:
        try:
            slate = json.loads(slate_path.read_text(encoding="utf-8"))
            assert_clean(slate)
            for game in slate.get("games", []):
                extra = set(game) - allowed
                if extra:
                    violations.append(f"{slate_path.relative_to(ROOT)} has non-allowlisted keys: {', '.join(sorted(extra))}")
        except (OSError, json.JSONDecodeError, SystemExit) as exc:
            violations.append(f"{slate_path.relative_to(ROOT)}: {exc}")

    for legacy in (ROOT / "dashboard" / "index.html", ROOT / "dashboard" / "matchup_compare.html"):
        text = legacy.read_text(encoding="utf-8")
        if "location.replace" not in text:
            violations.append(f"{legacy.relative_to(ROOT)} must be a compatibility redirect")
        if any(asset in text for asset in BANNED_ASSETS):
            violations.append(f"{legacy.relative_to(ROOT)} still loads a legacy/private asset")

    model_api = (ROOT / "dashboard" / "model_center.js").read_text(encoding="utf-8")
    if "alphakiller1.github.io" in model_api or "board.json" in model_api:
        violations.append("dashboard/model_center.js embeds a public board URL")

    if violations:
        print("FAIL: public/private boundary")
        print("\n".join(f"  - {item}" for item in violations))
        return 1
    print(f"OK: {len(PUBLIC_ENTRIES)} public routes use the factual matchup dependency graph")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
