"""
Composite official Chase logo + ESPN team logos + MLB headshots onto AI hero frames.

Keeps the AI atmosphere while enforcing trademark-accurate marks (content contract §4.2 / §7).

  python -m scripts.composite_ai_social --date 2026-07-17
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

CONTENT = Path(r"C:\Users\chase\chase-content-engine")
if str(CONTENT) not in sys.path:
    sys.path.insert(0, str(CONTENT))

from chase_content import assets  # noqa: E402

PIPELINE = Path(r"C:\Users\chase\mlbma_pipeline")
CURSOR_ASSETS = Path(r"C:\Users\chase\.cursor\projects\c-Users-chase-mlbma-pipeline\assets")


def _fit(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def _circle(im: Image.Image, size: int, ring: tuple[int, int, int, int] = (154, 107, 255, 220)) -> Image.Image:
    im = im.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    ring_im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring_im)
    d.ellipse((1, 1, size - 2, size - 2), outline=ring, width=max(3, size // 32))
    return Image.alpha_composite(out, ring_im)


def _paste(base: Image.Image, overlay: Image.Image, xy: tuple[int, int]) -> None:
    base.alpha_composite(overlay, xy)


def composite_frame(
    ai_path: Path,
    out_path: Path,
    *,
    away: str,
    home: str,
    away_mlb_id: int | None,
    home_mlb_id: int | None,
    logo_y: int = 210,
    shot_y: int = 430,
) -> Path:
    base = Image.open(ai_path).convert("RGBA")
    # Normalize to 1080x1350
    if base.size != (1080, 1350):
        base = base.resize((1080, 1350), Image.LANCZOS)

    chase = Image.open(assets.chase_logo_path()).convert("RGBA")
    chase.thumbnail((230, 56), Image.LANCZOS)
    _paste(base, chase, (48, 42))

    away_logo = _fit(Image.open(assets.team_logo_file(away)), 110)
    home_logo = _fit(Image.open(assets.team_logo_file(home)), 110)
    _paste(base, away_logo, (180, logo_y))
    _paste(base, home_logo, (790, logo_y))

    if away_mlb_id:
        p = assets.headshot_file(away_mlb_id)
        if p:
            _paste(base, _circle(Image.open(p), 150), (120, shot_y))
    if home_mlb_id:
        p = assets.headshot_file(home_mlb_id)
        if p:
            _paste(base, _circle(Image.open(p), 150), (810, shot_y))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(out_path, "PNG", quality=95)
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="2026-07-17")
    args = ap.parse_args()
    date = args.date
    ai_dir = CONTENT / "dist" / date / "ai"
    cards = PIPELINE / "outputs" / "social_queue" / "cards"

    jobs = [
        {
            "src": CURSOR_ASSETS / "ai_featured_mia_mil.png",
            "name": "composite_mia_mil.png",
            "away": "MIA",
            "home": "MIL",
            "away_id": 645261,
            "home_id": 701656,
        },
        {
            "src": CURSOR_ASSETS / "ai_matchup_pit_cle.png",
            "name": "composite_pit_cle.png",
            "away": "PIT",
            "home": "CLE",
            "away_id": 683003,
            "home_id": 668909,
        },
        {
            "src": CURSOR_ASSETS / "ai_primetime_lad_nyy.png",
            "name": "composite_lad_nyy.png",
            "away": "LAD",
            "home": "NYY",
            "away_id": 808963,
            "home_id": 543037,
        },
    ]

    for job in jobs:
        if not job["src"].exists():
            print(f"skip missing {job['src']}")
            continue
        out1 = ai_dir / job["name"]
        out2 = cards / f"ai_{date}_{job['name'].replace('composite_', '')}"
        path = composite_frame(
            job["src"],
            out1,
            away=job["away"],
            home=job["home"],
            away_mlb_id=job["away_id"],
            home_mlb_id=job["home_id"],
        )
        Image.open(path).save(out2, "PNG")
        print(f"Wrote {out1}")
        print(f"Wrote {out2}")

    # Henderson spotlight — logo + headshot bottom-safe overlay
    hen = CURSOR_ASSETS / "ai_spotlight_henderson.png"
    if hen.exists():
        base = Image.open(hen).convert("RGBA")
        if base.size != (1080, 1350):
            base = base.resize((1080, 1350), Image.LANCZOS)
        chase = Image.open(assets.chase_logo_path()).convert("RGBA")
        chase.thumbnail((230, 56), Image.LANCZOS)
        _paste(base, chase, (48, 42))
        mil = _fit(Image.open(assets.team_logo_file("MIL")), 140)
        shot = assets.headshot_file(701656)
        if shot:
            _paste(base, _circle(Image.open(shot), 220), (80, 280))
        _paste(base, mil, (340, 320))
        out = ai_dir / "composite_henderson.png"
        base.convert("RGB").save(out, "PNG")
        base.convert("RGB").save(cards / f"ai_{date}_henderson.png", "PNG")
        print(f"Wrote {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
