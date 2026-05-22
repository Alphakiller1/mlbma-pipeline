#!/usr/bin/env python3
"""Move Chase nav from inside page headers to top of <body>."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "dashboard"
raw = (DASH / "chase_nav.html").read_text(encoding="utf-8").strip()
NAV_BLOCK = "\n".join(
    line for line in raw.splitlines() if not line.strip().startswith("<!--")
).strip()

PAGES = [
    "chase_analytics_mlb_oem_v7.html",
    "matchup_sheet.html",
    "pitcher_profile.html",
    "batter_profile.html",
    "reliever_profile.html",
    "bullpen_report.html",
    "team_profile.html",
    "player_search.html",
    "glossary.html",
]

NAV_RE = re.compile(
    r"\s*<!-- Chase Analytics navigation.*?"
    r'<span id="mobileLastUpdated">--</span>\s*</div>\s*</div>\s*</div>\s*\n',
    re.DOTALL,
)


def body_insert_pos(text: str, body_start: int) -> int:
    pos = body_start
    chunk = text[pos : pos + 800]
    m = re.search(
        r'<div class="loading(?:-text)?"[^>]*>[\s\S]*?</div>\s*\n',
        chunk,
    )
    if m:
        return pos + m.end()
    m2 = re.search(r"</div>\s*\n", chunk)
    if m2 and "loading" in chunk[: m2.start()]:
        return pos + m2.end()
    return pos


def relocate(text: str) -> str:
    if "id=\"chaseHeader\"" not in text:
        return text
    m_body = re.search(r"<body>\s*\n", text)
    if not m_body:
        return text
    body_start = m_body.end()
    head_chunk = text[body_start : body_start + 1200]
    if head_chunk.strip().startswith(
        ("<header class=\"chase-header\"", "<!--", "")
    ) or "<header class=\"chase-header\"" in head_chunk[:400]:
        text2 = NAV_RE.sub("\n", text, count=1)
        if text2 == text:
            return text
        text = text2
        m_body = re.search(r"<body>\s*\n", text)
        body_start = m_body.end()
    else:
        text = NAV_RE.sub("\n", text, count=1)
        m_body = re.search(r"<body>\s*\n", text)
        body_start = m_body.end()
    pos = body_insert_pos(text, body_start)
    if NAV_BLOCK in text[body_start : body_start + len(NAV_BLOCK) + 50]:
        return text
    return text[:pos] + NAV_BLOCK + "\n\n" + text[pos:]


def main() -> None:
    for name in PAGES:
        path = DASH / name
        orig = path.read_text(encoding="utf-8")
        new = relocate(orig)
        if new != orig:
            path.write_text(new, encoding="utf-8", newline="\n")
            print(f"OK {name}")
        else:
            print(f"skip {name}")


if __name__ == "__main__":
    main()
