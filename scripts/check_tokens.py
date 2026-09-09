"""Design-layer token guard (WP1).

Fails when:
  - published TIER 1 copies diverge
  - a raw color literal appears in a dashboard :root (or HTML <style> :root)
    outside TIER 1 (mockups allowlisted)
  - a custom property is defined with two different values across dashboard CSS
  - design-layer ?v= stamps disagree with design/DESIGN_LAYER_VERSION
  - vendor seed sha256 drifts

Rule-body hex in mature CSS is counted (informational) until a restyle pass.
Under dashboard/styles/ that count is blocking, plus L2–L4 layer rules:
  - no --ca-* primitive outside chase-semantic.css
  - no route ID selector in chase-components.css
  - no font-size below 12px
dashboard/mockups/ stays excluded.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DASHBOARD = ROOT / "dashboard"
TIER1_CANON = ROOT / "design" / "tokens" / "chase-tokens.css"
TIER1_PUB = ROOT / "design" / "chase-tokens-v1.css"
VENDOR = ROOT / "design" / "tokens" / "chase_tokens.vendor.css"
VENDOR_SHA256 = "13014f566ee570d283b12859a6578d12d179a4cc39aecf8845518700fb85e911"
STAMP_FILE = ROOT / "design" / "DESIGN_LAYER_VERSION"
STAMPED = (
    "chase-tokens-v1.css",
    "mlbma_design_system.css",
    "theme.css",
    "chase_nav.css",
    "responsive.css",
    "design_layer_version.js",
    "chase_nav.js",
    "chase_datastatus.js",
    "chase_sport_select.js",
    "mlbma_assets.js",
    "mlbma_ui.js",
    "matchup_shared.js",
    "matchup_compare.js",
    "matchup_card.js",
    "mlbma_auth_ui.js",
    "model_center.js",

    "chase-semantic.css",
    "chase-primitives.css",
    "chase-components.css",
    "chase-patterns.css",
    "chase-shell.css",
    "legacy.css",
)
# Design mockups are unlinked scratch surfaces, not product. They are excluded
# from both the HTML :root scan and the CSS scan below.
MOCKUP_ALLOW = ("mockup",)
HTML_ROOT_ALLOW = MOCKUP_ALLOW
COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
STYLE_RE = re.compile(r"<style[^>]*>(.*?)</style>", re.DOTALL | re.I)
ROOT_BLOCK_RE = re.compile(r":root\s*\{([^{}]*)\}", re.DOTALL)
TOKEN_DEF_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
CA_PRIMITIVE_RE = re.compile(r"--ca-[A-Za-z0-9-]+")
FONT_SIZE_RE = re.compile(r"font-size\s*:\s*([^;]+)", re.I)
ID_SELECTOR_RE = re.compile(r"(?:^|[\s,])#[A-Za-z][\w-]*")
STYLES_DIR = DASHBOARD / "styles"
LAYER_SEMANTIC = "chase-semantic.css"
LAYER_COMPONENTS = "chase-components.css"
V_RE = re.compile(
    r"""(?:href|src)=["']([^"']+\.(?:css|js))(\?v=)([^"'&]+)""",
    re.I,
)


def strip_comments(css: str) -> str:
    return COMMENT_RE.sub("", css)


def root_defs(css: str) -> list[tuple[str, str]]:
    css = strip_comments(css)
    out: list[tuple[str, str]] = []
    for body in ROOT_BLOCK_RE.findall(css):
        for name, val in TOKEN_DEF_RE.findall(body):
            out.append((name, " ".join(val.split())))
    return out


def is_under_styles(path: Path) -> bool:
    try:
        path.relative_to(STYLES_DIR)
        return True
    except ValueError:
        return False


def font_size_px(value: str) -> float | None:
    raw = value.strip().split()[0]
    if raw.startswith("var(") or "clamp(" in raw:
        return None
    m = re.fullmatch(r"([0-9.]+)(px|rem|em)", raw)
    if not m:
        return None
    n = float(m.group(1))
    unit = m.group(2)
    if unit == "px":
        return n
    if unit in {"rem", "em"}:
        return n * 16.0
    return None


def layer_violations_for(path: Path, text: str) -> list[str]:
    rel = path.relative_to(ROOT)
    stripped = strip_comments(text)
    out: list[str] = []
    if path.name != LAYER_SEMANTIC:
        for token in sorted(set(CA_PRIMITIVE_RE.findall(stripped))):
            out.append(f"{rel} references primitive {token} (L2 only)")
    if path.name == LAYER_COMPONENTS:
        for sel, _body in re.findall(r"([^{}]+)\{([^{}]*)\}", stripped):
            if ID_SELECTOR_RE.search(sel):
                out.append(f"{rel} uses a route/id selector: {sel.strip()[:80]}")
                break
    for raw in FONT_SIZE_RE.findall(stripped):
        px = font_size_px(raw)
        if px is not None and px < 12:
            out.append(f"{rel} font-size {raw.strip()} is below 12px")
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", stripped):
        if ":root" in sel:
            continue
        hits = HEX_RE.findall(body)
        if hits:
            out.append(f"{rel} rule-body hex {hits[0]} (blocking under dashboard/styles/)")
    return out


def is_color_literal(val: str) -> bool:
    v = val.strip()
    if v.startswith("var("):
        return False
    if HEX_RE.search(v):
        return True
    if re.search(r"\brgba?\(", v) or re.search(r"\bhsla?\(", v):
        return True
    return False


def main() -> int:
    stamp = STAMP_FILE.read_text(encoding="utf-8").strip()
    violations: list[str] = []

    for path in (TIER1_CANON, TIER1_PUB, VENDOR):
        if not path.is_file():
            violations.append(f"missing {path.relative_to(ROOT)}")

    if TIER1_CANON.is_file() and TIER1_PUB.is_file():
        if TIER1_CANON.read_bytes() != TIER1_PUB.read_bytes():
            violations.append(
                "design/chase-tokens-v1.css is not byte-identical to design/tokens/chase-tokens.css"
            )
    pkg_tokens = ROOT / "packages" / "chase-design-system" / "css" / "chase-tokens-v1.css"
    if not pkg_tokens.is_file():
        violations.append("missing packages/chase-design-system/css/chase-tokens-v1.css")
    elif TIER1_PUB.is_file() and pkg_tokens.read_bytes() != TIER1_PUB.read_bytes():
        violations.append(
            "packages/chase-design-system/css/chase-tokens-v1.css diverges from design/chase-tokens-v1.css"
        )

    if VENDOR.is_file():
        # The pinned digest is explicitly LF-normalised; Git may materialise CRLF
        # in Windows worktrees without changing the tracked blob.
        vendor_bytes = VENDOR.read_bytes().replace(b"\r\n", b"\n")
        digest = hashlib.sha256(vendor_bytes).hexdigest()
        if digest != VENDOR_SHA256:
            violations.append(
                f"vendor chase_tokens.css sha256 {digest}, expected {VENDOR_SHA256}"
            )

    seen: dict[str, tuple[str, str]] = {}
    hex_bodies = 0

    css_files = list(DASHBOARD.glob("*.css")) + list(DASHBOARD.glob("**/*.css"))
    for css_path in sorted(set(css_files)):
        if any(tok in css_path.as_posix().lower() for tok in MOCKUP_ALLOW):
            continue
        text = css_path.read_text(encoding="utf-8")
        defs = root_defs(text)
        for name, val in defs:
            if is_color_literal(val):
                violations.append(
                    f"{css_path.relative_to(ROOT)} :root {name} uses a color literal"
                )
            prev = seen.get(name)
            if prev and prev[1] != val:
                violations.append(
                    f"token {name} defined as {prev[1]!r} in {prev[0]} and {val!r} in {css_path.name}"
                )
            else:
                seen[name] = (css_path.name, val)
        stripped = strip_comments(text)
        for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", stripped):
            if ":root" in sel:
                continue
            hex_bodies += len(HEX_RE.findall(body))
        if is_under_styles(css_path):
            violations.extend(layer_violations_for(css_path, text))

    html_scan: list[Path] = (
        list(DASHBOARD.glob("*.html"))
        + list((DASHBOARD / "render").glob("*.html"))
        + [ROOT / "index.html", ROOT / "404.html", ROOT / "models" / "index.html", ROOT / "model-center" / "index.html"]
        + [p for sport in ("mlb", "nfl", "wnba", "cfb") for p in (ROOT / sport).glob("*.html")]
    )
    for html in sorted({p.resolve() for p in html_scan if p.is_file()}):
        raw = html.read_text(encoding="utf-8")
        allow = any(tok in html.name.lower() for tok in HTML_ROOT_ALLOW)
        for block in STYLE_RE.findall(raw):
            printable = re.sub(r"@media print\s*\{.*?\n\}", "", block, flags=re.DOTALL)
            for name, val in root_defs(printable):
                if allow:
                    continue
                if is_color_literal(val):
                    violations.append(
                        f"{html.relative_to(ROOT)} <style> :root {name} uses a color literal"
                    )
        for href, _qv, ver in V_RE.findall(raw):
            base = href.split("/")[-1]
            if base in STAMPED and ver != stamp:
                violations.append(
                    f"{html.relative_to(ROOT)} stamps {href} at {ver}, expected {stamp}"
                )

    dlv = DASHBOARD / "design_layer_version.js"
    if dlv.is_file() and f'DESIGN_LAYER_VERSION = "{stamp}"' not in dlv.read_text(
        encoding="utf-8"
    ):
        violations.append("dashboard/design_layer_version.js does not export DESIGN_LAYER_VERSION")

    print(f"Design-layer stamp: {stamp}")
    print(f"Rule-body hex count (informational, not blocking): {hex_bodies}")

    if violations:
        print("\nFAIL:")
        print("\n".join(f"  - {v}" for v in violations[:80]))
        if len(violations) > 80:
            print(f"  ... {len(violations) - 80} more")
        return 1
    print("OK: tier-1 owns color literals; layer files are clean; design-layer stamps match.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
