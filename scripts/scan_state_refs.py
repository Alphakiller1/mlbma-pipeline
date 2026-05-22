#!/usr/bin/env python3
import re
from pathlib import Path

html = (Path(__file__).resolve().parents[1] / "dashboard" / "chase_analytics_mlb_oem_v7.html").read_text(
    encoding="utf-8"
)
scripts = re.findall(r"<script>\s*([\s\S]*?)</script>", html)
main = max(scripts, key=len)
lines = main.splitlines()

depth = 0
in_comment = False
top_state = []
for i, line in enumerate(lines, 1):
    s = line.strip()
    if in_comment:
        if "*/" in s:
            in_comment = False
        continue
    if "/*" in s and "*/" not in s:
        in_comment = True
        continue
    if s.startswith("//"):
        continue
    if depth == 0 and re.search(r"(?<![.\w])STATE\.", line):
        top_state.append((i, line.strip()[:120]))
    depth += line.count("{") - line.count("}")
    if depth < 0:
        depth = 0

print("Top-level STATE. references:", len(top_state))
for ln, txt in top_state:
    print(f"  script L{ln}: {txt}")

print("\nAll oemMode occurrences (HTML file):")
for i, line in enumerate(html.splitlines(), 1):
    if "oemMode" in line:
        print(f"  HTML L{i}: {line.strip()[:100]}")
