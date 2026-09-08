"""Design-layer token guard (WP1).

Fails when:
  - published TIER 1 copies diverge
  - a raw color literal appears in a dashboard :root (or HTML <style> :root)
    outside TIER 1 (mockups allowlisted)
  - a custom property is defined with two different values across dashboard CSS
  - design-layer ?v= stamps disagree with design/DESIGN_LAYER_VERSION
  - vendor seed sha256 drifts

Rule-body hex in mature CSS is counted (informational) until a restyle pass.
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
    "design_layer_version.js",
)
HTML_ROOT_ALLOW = ("mockup",)
COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
STYLE_RE = re.compile(r"<style[^>]*>(.*?)</style>", re.DOTALL | re.I)
ROOT_BLOCK_RE = re.compile(r":root\s*\{([^{}]*)\}", re.DOTALL)
TOKEN_DEF_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
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

    if VENDOR.is_file():
        digest = hashlib.sha256(VENDOR.read_bytes()).hexdigest()
        if digest != VENDOR_SHA256:
            violations.append(
                f"vendor chase_tokens.css sha256 {digest}, expected {VENDOR_SHA256}"
            )

    seen: dict[str, tuple[str, str]] = {}
    hex_bodies = 0

    css_files = list(DASHBOARD.glob("*.css")) + list(DASHBOARD.glob("**/*.css"))
    for css_path in sorted(set(css_files)):
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

    for html in sorted(DASHBOARD.glob("*.html")):
        raw = html.read_text(encoding="utf-8")
        allow = any(tok in html.name.lower() for tok in HTML_ROOT_ALLOW)
        for block in STYLE_RE.findall(raw):
            printable = re.sub(r"@media print\s*\{.*?\n\}", "", block, flags=re.DOTALL)
            for name, val in root_defs(printable):
                if allow:
                    continue
                if is_color_literal(val):
                    violations.append(
                        f"{html.name} <style> :root {name} uses a color literal"
                    )
        for href, _qv, ver in V_RE.findall(raw):
            base = href.split("/")[-1]
            if base in STAMPED and ver != stamp:
                violations.append(
                    f"{html.name} stamps {href} at {ver}, expected {stamp}"
                )

    print(f"Design-layer stamp: {stamp}")
    print(f"Rule-body hex count (informational, not blocking): {hex_bodies}")

    if violations:
        print("\nFAIL:")
        print("\n".join(f"  - {v}" for v in violations[:80]))
        if len(violations) > 80:
            print(f"  ... {len(violations) - 80} more")
        return 1
    print("OK: tier-1 owns color literals; design-layer stamps match.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
