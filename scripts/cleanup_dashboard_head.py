"""Remove duplicate mlbma_ui / mlbma_config includes and fix leftover loading fragments."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "dashboard"

for html in ROOT.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    lines = text.splitlines()
    seen_ui = seen_cfg = seen_js = False
    out = []
    skip_loading_frag = False
    for line in lines:
        if 'href="mlbma_ui.css"' in line:
            if seen_ui:
                continue
            seen_ui = True
        if 'src="mlbma_config.js"' in line:
            if seen_cfg:
                continue
            seen_cfg = True
        if 'src="mlbma_ui.js"' in line:
            if seen_js:
                continue
            seen_js = True
        if 'loading-text" id="loadingText"' in line and '</div>' not in line:
            continue
        if line.strip() == '</div>' and skip_loading_frag:
            skip_loading_frag = False
            continue
        out.append(line)
    new = "\n".join(out) + "\n"
    # Replace inline nav in matchup with mlbma-nav-wrap
    if "matchup_sheet" in html.name:
        import re
        new = re.sub(
            r'<nav style="display:flex[^"]*"[^>]*>.*?</nav>',
            '<div class="mlbma-nav-wrap" data-mlbma-nav></div>',
            new,
            flags=re.S,
        )
    if new != text:
        html.write_text(new, encoding="utf-8")
        print(f"Cleaned {html.name}")
