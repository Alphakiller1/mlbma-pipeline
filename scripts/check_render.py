"""Pre-upload check for composed posts: dimensions and wasted space.

Answers "is this ready to post" with numbers instead of an eyeball: exact canvas size,
how much of the frame the content actually occupies, and the largest empty horizontal
band inside it. Run it on a file or a whole day's folder.

    python scripts/check_render.py outputs/social_cards/2026-07-30
    python scripts/check_render.py outputs/social_cards/2026-07-30/preview_*.png

A band wider than BAND_WARN of the canvas height is flagged: that is the "lots of empty
space" failure, and it usually means the wrong canvas for the content's aspect ratio.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

# A row is "empty" when nothing in it differs from the page background by more than
# this. The backdrop is a soft radial gradient, so an exact match will not do.
PIXEL_TOLERANCE = 14
BAND_WARN = 0.10          # a single dead band over 10% of height is visible
FILL_WARN = 0.72          # content should occupy at least this share of the frame


def row_is_empty(px, width: int, y: int, bg: tuple[int, int, int]) -> bool:
    step = max(1, width // 160)          # sampling is plenty for a solid band
    for x in range(0, width, step):
        r, g, b = px[x, y][:3]
        if (abs(r - bg[0]) > PIXEL_TOLERANCE or abs(g - bg[1]) > PIXEL_TOLERANCE
                or abs(b - bg[2]) > PIXEL_TOLERANCE):
            return False
    return True


def check(path: Path) -> bool:
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    # Sample the background from a corner region the layout never occupies.
    bg = px[4, h // 2][:3]

    empty = [y for y in range(h) if row_is_empty(px, w, y, bg)]
    empty_set = set(empty)
    content = [y for y in range(h) if y not in empty_set]
    if not content:
        print(f"  {path.name}: BLANK IMAGE")
        return False

    top, bottom = content[0], content[-1]
    # Largest run of empty rows strictly inside the content block.
    longest, run, at = 0, 0, 0
    for y in range(top, bottom + 1):
        if y in empty_set:
            run += 1
            if run > longest:
                longest, at = run, y - run + 1
        else:
            run = 0
    fill = (bottom - top + 1 - longest) / h
    band = longest / h

    flags = []
    if band > BAND_WARN:
        flags.append(f"DEAD BAND {longest}px ({band:.0%}) at y={at}")
    if fill < FILL_WARN:
        flags.append(f"LOW FILL {fill:.0%}")
    if top > h * 0.06:
        flags.append(f"top margin {top}px")
    status = "  ok  " if not flags else " FLAG "
    print(f"[{status}] {path.name}")
    print(f"          {w}x{h}  content y {top}-{bottom}  fill {fill:.0%}  "
          f"largest gap {longest}px ({band:.0%})")
    for f in flags:
        print(f"          -> {f}")
    return not flags


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    files: list[Path] = []
    for arg in args:
        p = Path(arg)
        files.extend(sorted(p.glob("*.png")) if p.is_dir() else [p])
    if not files:
        print("no PNGs found")
        sys.exit(2)
    print(f"checking {len(files)} render(s)\n")
    ok = sum(check(f) for f in files)
    print(f"\n{ok}/{len(files)} clean")
    sys.exit(0 if ok == len(files) else 1)


if __name__ == "__main__":
    main()
