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


def published_artifacts() -> list:
    """Every JSON file under data/public, not a hand-kept list of two.

    The classifier was pointed at the two slates by name. Four more artifacts
    were published beside them - starter splits, batter context, team context,
    the pitch-type board - and none of them were being read by this gate at
    all. A boundary that only checks the files someone remembered to name is
    not a boundary; anything served from data/public is published, so
    everything served from data/public is checked.
    """
    root = ROOT / "data" / "public"
    return sorted(root.rglob("*.json")) if root.is_dir() else []

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


def path_class(suffixes: dict, path: str) -> str | None:
    """Resolve a path against the suffix rules. `*` matches one path segment."""
    for pattern, name in suffixes.items():
        regex = "".join(
            r"[^.\[\]]+" if part == "*" else re.escape(part)
            for part in re.split(r"(\*)", pattern)
        )
        if re.search(regex + "$", path):
            return name
    return None


def class_of(spec: dict, key: str) -> str | None:
    """Which class a leaf key resolves to, or None if it is unclassified."""
    for name, meta in (spec.get("classes") or {}).items():
        if key in spec.get(name, []):
            return name
    return None


def is_id_map(id_maps: list, path: str) -> bool:
    """Is this path a map whose keys are identifiers rather than field names?

    `$.starters` is keyed by MLB person id, `$.teams` by club code,
    `$.batters.overall` by player name. Their keys are data, not schema, so
    asking the classifier to have an opinion on "aaronjudge" would mean
    re-editing the spec on every call-up. Their VALUES are still descended
    into and still classified.
    """
    for pattern in id_maps:
        regex = "".join(
            r"[^.\[\]]+" if part == "*" else re.escape(part)
            for part in re.split(r"(\*)", pattern)
        )
        if re.fullmatch(regex, path):
            return True
    return False


def leaf_keys(obj, path: str = "$", id_maps: list | None = None) -> list[tuple[str, str, dict]]:
    """Every key in a published artifact, with its path and the object holding it.

    The holder comes back because two classes are decided by a key's company
    rather than by its name - see `sibling_class`.
    """
    id_maps = id_maps or []
    found: list[tuple[str, str, dict]] = []
    if isinstance(obj, dict):
        identifiers = is_id_map(id_maps, path)
        for key, value in obj.items():
            if not identifiers:
                found.append((key, f"{path}.{key}", obj))
            found.extend(leaf_keys(value, f"{path}.{key}", id_maps))
    elif isinstance(obj, list):
        for value in obj:
            found.extend(leaf_keys(value, f"{path}[]", id_maps))
    return found


# A rank is public exactly when it sits beside the value it was computed from:
# "7th of 30 in runs per game" is a restatement of a published number, while a
# bare rank with nothing beside it is an ordering the reader cannot check and
# has to take from the model. Expressed as company rather than as a path, this
# cannot drift the way a list of path patterns does every time an artifact
# gains a level of nesting.
SIBLING_RULES = {
    "rank": ({"value"}, "derived_descriptive"),
    "of": ({"value", "rank"}, "provenance"),
}


def sibling_class(key: str, holder: dict) -> str | None:
    rule = SIBLING_RULES.get(key)
    if not rule or not isinstance(holder, dict):
        return None
    required, name = rule
    return name if required & set(holder) else None


def classify_artifact(spec: dict, artifact, label: str) -> list[str]:
    """Every key must resolve to a class, and no key may resolve to a private one.

    This is the guard the whole boundary rests on: a new field added upstream
    arrives unclassified and fails the build, rather than arriving classified as
    nothing and shipping.
    """
    problems: list[str] = []
    suffixes = (spec.get("path_overrides") or {}).get("suffixes") or {}
    id_maps = (spec.get("path_overrides") or {}).get("id_maps") or []
    exact = (spec.get("path_overrides") or {}).get("exact") or {}
    private = {name for name, meta in (spec.get("classes") or {}).items()
               if not meta.get("public")}
    unclassified: dict[str, str] = {}
    for key, path, holder in leaf_keys(artifact, id_maps=id_maps):
        resolved = (exact.get(path) or sibling_class(key, holder)
                    or path_class(suffixes, path) or class_of(spec, key))
        if resolved is None:
            unclassified.setdefault(key, path)
        elif resolved in private:
            problems.append(f"{label}: {key!r} at {path} classifies as {resolved}")
    for key, path in sorted(unclassified.items()):
        problems.append(f"{label}: {key!r} at {path} is not classified")
    return problems


def main() -> int:
    violations: list[str] = []
    spec = json.loads(CLASSIFICATION.read_text(encoding="utf-8"))
    restricted = json.loads(RESTRICTED.read_text(encoding="utf-8"))
    classes = spec.get("classes") or {}
    if not classes:
        violations.append("public_metric_classification.json declares no classes")
    for required in ("provenance", "identity", "factual_status", "descriptive",
                     "derived_descriptive", "contextual_environment",
                     "model_private", "model_derived_label"):
        if required not in classes:
            violations.append(f"classification is missing the {required} class")
    private_classes = {name for name, meta in classes.items() if not meta.get("public")}
    for required in ("projOSI", "win_probability", "model_margin", "may_bet"):
        if class_of(spec, required) not in private_classes:
            violations.append(f"{required} must classify as private")
    # A field cannot be two things at once; a key in two lists is a spec bug
    # that would let the stricter class be bypassed by list order.
    seen: dict[str, str] = {}
    for name in classes:
        for key in spec.get(name, []):
            if key in seen:
                violations.append(f"{key!r} is classified as both {seen[key]} and {name}")
            seen[key] = name

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

    # The classification guard has to reject the four shapes the handoff names:
    # a power rating, a rank of that rating, a model composite sitting inside an
    # otherwise-observed object, and an expected rate. If any of them passes,
    # the guard is not doing its job and the build should fail here rather than
    # in production.
    tripwire = {
        "schema": "chase-public-slate/1",
        "games": [{
            "id": "x", "away": "AAA", "home": "BBB",
            "away_form": {"rating": 9.9, "rank": 1,
                          "rates": {"off_epa": {"value": 0.1, "rank": 3, "of": 32}},
                          "offense_index": 4.1},
            "away_scheme": {"defense": {"coverage": {"expected_zone_rate": 0.8}}},
        }],
    }
    tripped = classify_artifact(spec, tripwire, "tripwire")
    for expected in ("rating", "offense_index", "expected_zone_rate", "rank"):
        if not any(f"'{expected}'" in item for item in tripped):
            violations.append(f"classification guard accepted a fixture containing {expected}")
    # The same rank, sitting beside the value it was computed from, is a fact.
    honest = {"games": [{"away_form": {"rates": {"off_epa":
              {"label": "Offensive EPA per play", "value": 0.1, "better": "high",
               "rank": 3, "of": 32}}}}]}
    rejected = classify_artifact(spec, honest, "honest")
    if rejected:
        violations.append("classification guard rejected a recomputed rank: " +
                          "; ".join(rejected))

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
        # WNBA stays in design documentation only and must not appear in nav or
        # content. CFB is a first-class desk sport now (owner decision
        # 2026-09-19), so it is allowed like MLB/NFL.
        for parked in ("/wnba/",):
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

    artifacts = published_artifacts()
    for path in artifacts:
        rel = path.relative_to(ROOT)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            assert_clean(payload)
            # The per-game allow-list applies to the slates specifically: they
            # are the artifact the matchup cards read field by field.
            if path in PUBLIC_SLATES:
                for game in payload.get("games", []):
                    extra = set(game) - allowed
                    if extra:
                        violations.append(
                            f"{rel} has non-allowlisted keys: {', '.join(sorted(extra))}")
            violations.extend(classify_artifact(spec, payload, str(rel)))
        except (OSError, json.JSONDecodeError, SystemExit) as exc:
            violations.append(f"{rel}: {exc}")

    for slate_path in PUBLIC_SLATES:
        if not slate_path.is_file():
            violations.append(f"{slate_path.relative_to(ROOT)} is not published")

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
    print(f"OK: every key in {len(artifacts)} published artifacts resolves to a public class")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
