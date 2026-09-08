"""Simulate what Instagram/X actually serve, so quality is judged on that, not on our PNG.

Checking the PNG we produce is misleading: it is always sharp. The image a follower sees
has been resized by the platform and re-encoded as JPEG with 4:2:0 chroma subsampling,
which is brutal on exactly what these posts are made of - small, thin, saturated type on
a near-black field.

    python scripts/simulate_post.py outputs/social_cards/2026-07-30/preview_TEXTBR_1440x1800.png

Writes <name>__as_instagram.jpg / __as_x.jpg next to a copy in the sim/ folder and reports
how much fine detail survived.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# What each platform does to a feed image.
#   serve_w:  the width it re-serves at (it downsizes anything wider)
#   quality:  JPEG quality it re-encodes with
#   subsample: 2 = 4:2:0 (half chroma resolution both axes)
PLATFORMS = {
    "instagram": {"serve_w": 1080, "quality": 76, "subsample": 2},
    "x":         {"serve_w": 1200, "quality": 85, "subsample": 2},
}


def detail_energy(im: Image.Image) -> float:
    """High-frequency energy: how much fine detail (small type, hairlines) is present."""
    a = np.asarray(im.convert("L"), dtype=float)
    gy, gx = np.gradient(a)
    return float(np.sqrt(gx ** 2 + gy ** 2).mean())


def simulate(path: Path, platform: str, out_dir: Path) -> tuple[Path, float, float]:
    spec = PLATFORMS[platform]
    src = Image.open(path).convert("RGB")
    before = detail_energy(src)

    # 1. the platform downsizes anything wider than it serves
    if src.width > spec["serve_w"]:
        h = round(src.height * spec["serve_w"] / src.width)
        served = src.resize((spec["serve_w"], h), Image.LANCZOS)
    else:
        served = src.copy()

    # 2. and re-encodes as JPEG with chroma subsampling
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{path.stem}__as_{platform}.jpg"
    served.save(out, "JPEG", quality=spec["quality"], subsampling=spec["subsample"],
                optimize=True)

    after = detail_energy(Image.open(out))
    return out, before, after


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    files: list[Path] = []
    for arg in args:
        p = Path(arg)
        files.extend(sorted(p.glob("*.png")) if p.is_dir() else [p])

    for f in files:
        out_dir = f.parent / "sim"
        print(f"\n{f.name}  ({Image.open(f).size[0]}x{Image.open(f).size[1]})")
        for platform in PLATFORMS:
            out, before, after = simulate(f, platform, out_dir)
            keep = after / before if before else 0
            verdict = "ok" if keep > 0.80 else ("soft" if keep > 0.65 else "MUSHED")
            print(f"   {platform:10} -> {out.name}")
            print(f"   {'':10}    detail retained {keep:5.0%}  [{verdict}]")


if __name__ == "__main__":
    main()
