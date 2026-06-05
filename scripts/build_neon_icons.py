"""Build crisp neon circular marks from the original 8-icon raster grid.

Primary assets: high-resolution PNGs (1024px) extracted from the source grid
with heavy upscale + transparent background — faithful to the ChatGPT neon art.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dashboard" / "assets" / "icons"
SRC_DIR = ROOT / "dashboard" / "assets" / "icon-sources"
SRC_NAME = "neon-icon-grid-8.png"
CURSOR_SRC = Path(
    r"C:\Users\chase\.cursor\projects\c-Users-chase-mlbma-pipeline\assets"
    r"\c__Users_chase_AppData_Roaming_Cursor_User_workspaceStorage_dc8ddab85bf37279cdb93f3943f9faf6_images_image-e38a7496-b95d-46af-b723-8c3a4cdaa58c.png"
)

NAMES = [
    ["neon-diamond-field", "neon-baseball", "neon-bat", "neon-stadium"],
    ["neon-weather-field", "neon-vs", "neon-trend-up", "neon-trend-down"],
]

GRID_COLS = 4
GRID_ROWS = 2
UPSCALE = 12
OUT_PX = 1024
CELL_INSET = 0.025
BG_MAX = 38
CANVAS_PAD = 0.08


def resolve_png_source() -> Path:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    dest = SRC_DIR / SRC_NAME
    if not dest.exists() and CURSOR_SRC.exists():
        shutil.copy2(CURSOR_SRC, dest)
        print("copied source ->", dest)
    if not dest.exists():
        raise FileNotFoundError(f"missing icon source: {dest}")
    return dest


def knock_out_background(tile: Image.Image) -> Image.Image:
    px = tile.load()
    for y in range(tile.height):
        for x in range(tile.width):
            r, g, b, a = px[x, y]
            if r < BG_MAX and g < BG_MAX and b < BG_MAX + 8:
                px[x, y] = (0, 0, 0, 0)
    return tile


def square_canvas(tile: Image.Image, out_px: int) -> Image.Image:
    bbox = tile.getbbox()
    if not bbox:
        return Image.new("RGBA", (out_px, out_px), (0, 0, 0, 0))
    content = tile.crop(bbox)
    cw, ch = content.size
    margin = max(int(max(cw, ch) * CANVAS_PAD), 12)
    side = max(cw, ch) + margin * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    ox = (side - cw) // 2
    oy = (side - ch) // 2
    canvas.paste(content, (ox, oy), content)
    out = canvas.resize((out_px, out_px), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))


def build_png_marks(src: Path) -> int:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    im = im.resize((w * UPSCALE, h * UPSCALE), Image.Resampling.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=170, threshold=3))
    w, h = im.size
    cw = w / GRID_COLS
    ch = h / GRID_ROWS
    inset_x = int(cw * CELL_INSET)
    inset_y = int(ch * CELL_INSET)
    count = 0
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            x0 = int(c * cw) + inset_x
            y0 = int(r * ch) + inset_y
            x1 = int((c + 1) * cw) - inset_x
            y1 = int((r + 1) * ch) - inset_y
            tile = knock_out_background(im.crop((x0, y0, x1, y1)))
            out_img = square_canvas(tile, OUT_PX)
            out_path = OUT / f"{name}.png"
            out_img.save(out_path, optimize=True)
            print("wrote", out_path.name, out_img.size)
            count += 1
    return count


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = resolve_png_source()
    n = build_png_marks(src)
    print("done:", n, "PNG icons at", OUT_PX, "px")


if __name__ == "__main__":
    main()
