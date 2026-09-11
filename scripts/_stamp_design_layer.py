#!/usr/bin/env python3
"""Rewrite dashboard HTML/JS for the current design-layer stamp."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAMP = (ROOT / "design" / "DESIGN_LAYER_VERSION").read_text(encoding="utf-8").strip()
DASH = ROOT / "dashboard"
TOKEN_LINK = (
    f'<link rel="stylesheet" href="/design/chase-tokens-v1.css?v={STAMP}">'
)
DS_FILES = (
    "mlbma_design_system.css",
    "theme.css",
    "mlbma_ui.css",
    "chase_nav.css",
    "landing_dashboard.css",
    "research_lab.css",
    "mlbma_backgrounds.css",
    "responsive.css",
    "profile_shell.css",
    "team_profile.css",
    "team_profile_lineup_ui.css",
    "player_profile_pages.css",
    "pitcher_profile.css",
    "batter_profile.css",
    "bullpen_report.css",
    "bullpen_usage.css",
    "matchup_compare.css",
    "chase-semantic.css",
    "chase-primitives.css",
    "chase-components.css",
    "chase-patterns.css",
    "chase-shell.css",
    "legacy.css",
    "chase-public.css",
)

ROOT_RE = re.compile(r":root\s*\{(?:[^{}]|\{[^{}]*\})*\}", re.DOTALL)
LIGHT_RE = re.compile(r"\[data-theme=\"light\"\]\s*\{[^{}]*\}", re.DOTALL)
VAR_HEX = re.compile(r"var\((--[A-Za-z0-9_-]+)\s*,\s*#[0-9A-Fa-f]{3,8}\)")
VAR_RGB = re.compile(r"var\((--[A-Za-z0-9_-]+)\s*,\s*rgba?\([^)]*\)\)")
HREF_V = re.compile(
    r'(href=")((?:[\w./-]+)?)(' + "|".join(re.escape(f) for f in DS_FILES) + r')(\?v=)[^"]+(")'
)


def strip_index_tokens(text: str) -> str:
    # First :root in the big inline style plus optional light theme.
    text = ROOT_RE.sub("", text, count=1)
    text = LIGHT_RE.sub("", text, count=1)
    return text


NAV_LINK_RE = re.compile(
    r'(<link rel="stylesheet" href=")([^"]*?)(chase_nav\.css\?v=)([^"]+)(">)',
    re.I,
)


def ensure_shell_layers(text: str) -> str:
    """Load L2 + L6 ahead of chase_nav.css. Idempotent.

    Unmigrated and /render pages do not take L3 (global reset). Sport routes
    get the full stack from build_sport_routes.py.
    """
    if "chase-semantic.css" in text:
        return text
    m = NAV_LINK_RE.search(text)
    if not m:
        return text
    prefix = m.group(2)
    if prefix == "../":
        style_prefix = "../styles/"
    elif prefix == "/dashboard/":
        style_prefix = "/dashboard/styles/"
    elif prefix == "":
        style_prefix = "styles/"
    elif prefix.endswith("/"):
        style_prefix = prefix + "styles/"
    else:
        style_prefix = "styles/"
    insert = (
        f'<link rel="stylesheet" href="{style_prefix}chase-semantic.css?v={STAMP}">\n'
        f'<link rel="stylesheet" href="{style_prefix}chase-shell.css?v={STAMP}">\n'
    )
    return text[: m.start()] + insert + text[m.start() :]


def stamp_hrefs(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}{m.group(4)}{STAMP}{m.group(5)}"

    text = HREF_V.sub(repl, text)
    # The design-layer assets are not in DS_FILES, so HREF_V never rewrote their
    # ?v=. TOKEN_LINK then failed its "already present?" test on every bump and
    # inserted another link: three chase-tokens-v1.css tags had accumulated in
    # every dashboard page. Rewrite these two in place, on href or src, before
    # deciding whether an insert is needed.
    # Every locally served .js and .css gets the current stamp, found by shape
    # rather than by name.
    #
    # This was twenty-one hand-written regexes, one per asset, and a file
    # missing from the list kept its old ?v= for ever - model_center.js had
    # been stale since the list was written. The consequence is the worst kind:
    # the deploy succeeds, the file on the server is right, and the browser
    # serves the cached old one, so the change looks like it never shipped.
    #
    # Anchored on a leading slash or a relative path with no scheme, so a
    # third-party URL that happens to carry ?v= is left alone.
    text = re.sub(
        r'((?:src|href)="(?!https?:|//)[^"]*?\.(?:js|css)\?v=)[^"]*(")',
        lambda m: m.group(1) + STAMP + m.group(2), text)

    if "chase-tokens-v1.css" not in text and "mlbma_design_system.css" in text:
        text = text.replace(
            f'<link rel="stylesheet" href="mlbma_design_system.css?v={STAMP}">',
            TOKEN_LINK + "\n" + f'<link rel="stylesheet" href="mlbma_design_system.css?v={STAMP}">',
            1,
        )
        # some pages still have old stamp until HREF_V runs — handle both
        text = re.sub(
            r'<link rel="stylesheet" href="mlbma_design_system.css\?v=[^"]+">',
            TOKEN_LINK + "\n" + f'<link rel="stylesheet" href="mlbma_design_system.css?v={STAMP}">',
            text,
            count=1,
        )
    return ensure_shell_layers(text)


def main() -> None:
    idx = DASH / "index.html"
    t = idx.read_text(encoding="utf-8")
    t = strip_index_tokens(t)
    t = stamp_hrefs(t)
    # Guard on the whole document, not t[:4000]: index.html's <body> is at line
    # 2756, well past that window, so the old guard never saw the attribute it
    # had already written and appended another data-mode on every run. Seven had
    # accumulated - duplicate attributes, and unbounded growth of a 403 KB file.
    if "data-mode=" not in t:
        t = t.replace("<body", '<body data-mode="slate"', 1)
    # body tag is late in this file — search properly
    if "data-mode=" not in t:
        t = t.replace("<body>", '<body data-mode="slate">', 1)
        t = re.sub(r"<body class=", '<body data-mode="slate" class=', t, count=1)
    idx.write_text(t, encoding="utf-8")

    tr = DASH / "team_rankings.html"
    t = tr.read_text(encoding="utf-8")
    t = ROOT_RE.sub("", t, count=1)
    t = stamp_hrefs(t)
    if "data-mode=" not in t:
        t = re.sub(r"<body([^>]*)>", r'<body data-mode="rank"\1>', t, count=1)
    tr.write_text(t, encoding="utf-8")

    gl = DASH / "glossary.html"
    t = gl.read_text(encoding="utf-8")
    t = ROOT_RE.sub("", t, count=1)
    t = stamp_hrefs(t)
    if "data-mode=" not in t:
        t = re.sub(r"<body([^>]*)>", r'<body data-mode="entry"\1>', t, count=1)
    gl.write_text(t, encoding="utf-8")

    for html in DASH.glob("*.html"):
        if html.name in {"index.html", "team_rankings.html", "glossary.html"}:
            continue
        t = html.read_text(encoding="utf-8")
        nt = stamp_hrefs(t)
        if nt != t:
            html.write_text(nt, encoding="utf-8")

    lv = DASH / "lineup_view.js"
    js = lv.read_text(encoding="utf-8")
    js = VAR_HEX.sub(r"var(\1)", js)
    js = VAR_RGB.sub(r"var(\1)", js)
    js = js.replace("var(--e-1,none)", "var(--e-1)")
    js = js.replace("var(--r-sm,8px)", "var(--r-sm)")
    js = js.replace("var(--r-pill,999px)", "var(--r-pill)")
    js = js.replace(",#5B2BE0)", ", var(--ca-violet-700))")
    lv.write_text(js, encoding="utf-8")

    dlv = DASH / "design_layer_version.js"
    dlv.write_text(
        f"/* DESIGN_LAYER_VERSION {STAMP} — keep in sync with design/DESIGN_LAYER_VERSION */\n"
        "(function (global) {\n"
        f'  global.DESIGN_LAYER_VERSION = "{STAMP}";\n'
        "})(typeof window !== \"undefined\" ? window : this);\n",
        encoding="utf-8",
    )

    for css in (
        ROOT / "design" / "tokens" / "chase-tokens.css",
        ROOT / "design" / "chase-tokens-v1.css",
        ROOT / "packages" / "chase-design-system" / "css" / "chase-tokens-v1.css",
    ):
        text = css.read_text(encoding="utf-8")
        css.write_text(
            re.sub(
                r"DESIGN_LAYER_VERSION: \S+",
                f"DESIGN_LAYER_VERSION: {STAMP}",
                text,
                count=1,
            ),
            encoding="utf-8",
        )

    # Every public HTML file, found rather than listed.
    #
    # This was a hand-kept list of three paths plus the render directory, so
    # the eight sport-route pages - mlb/, nfl/, cfb/, model-center/ - were
    # never restamped. A page that keeps yesterday's ?v= serves yesterday's
    # JavaScript out of the browser cache, which is how a correct deploy has
    # gone out looking like nothing changed. The check that catches it runs
    # after this script, so the list being short failed the build rather than
    # the site - but only because someone added the check.
    skip = {"node_modules", ".git", "dist", "vendor", "packages"}
    extra_html = sorted(
        path for path in ROOT.rglob("*.html")
        if not any(part in skip for part in path.relative_to(ROOT).parts)
        and DASH not in path.parents
    ) + sorted((DASH / "render").glob("*.html"))
    for html in extra_html:
        if not html.is_file():
            continue
        t = html.read_text(encoding="utf-8")
        nt = stamp_hrefs(t)
        if nt != t:
            html.write_text(nt, encoding="utf-8")

    print("stamped", STAMP)


if __name__ == "__main__":
    main()
