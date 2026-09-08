#!/usr/bin/env python3
"""Rewrite dashboard HTML/JS for the 20260908a design-layer stamp."""
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


def stamp_hrefs(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return f"{m.group(1)}{m.group(2)}{m.group(3)}{m.group(4)}{STAMP}{m.group(5)}"

    text = HREF_V.sub(repl, text)
    if TOKEN_LINK not in text and "mlbma_design_system.css" in text:
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
    return text


def main() -> None:
    idx = DASH / "index.html"
    t = idx.read_text(encoding="utf-8")
    t = strip_index_tokens(t)
    t = stamp_hrefs(t)
    t = t.replace("<body", '<body data-mode="slate"', 1) if "data-mode" not in t[:4000] else t
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
    print("stamped", STAMP)


if __name__ == "__main__":
    main()
