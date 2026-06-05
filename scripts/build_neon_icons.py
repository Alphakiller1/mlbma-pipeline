"""Crop neon purple line-art icons from the 8-icon dashboard grid."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dashboard" / "assets" / "icons"
SRC = Path(
    r"C:\Users\chase\.cursor\projects\c-Users-chase-mlbma-pipeline\assets"
    r"\c__Users_chase_AppData_Roaming_Cursor_User_workspaceStorage_dc8ddab85bf37279cdb93f3943f9faf6_images_image-e38a7496-b95d-46af-b723-8c3a4cdaa58c.png"
)

NAMES = [
    ["neon-diamond-field", "neon-baseball", "neon-bat", "neon-stadium"],
    ["neon-weather-field", "neon-vs", "neon-trend-up", "neon-trend-down"],
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    cols, rows = 4, 2
    cw, ch = w / cols, h / rows
    pad_x, pad_y = cw * 0.06, ch * 0.08
    count = 0
    for r, row in enumerate(NAMES):
        for c, name in enumerate(row):
            box = (
                int(c * cw + pad_x),
                int(r * ch + pad_y),
                int((c + 1) * cw - pad_x),
                int((r + 1) * ch - pad_y),
            )
            tile = im.crop(box)
            side = max(tile.size)
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            ox = (side - tile.width) // 2
            oy = (side - tile.height) // 2
            canvas.paste(tile, (ox, oy), tile)
            out = OUT / f"{name}.png"
            canvas.save(out, optimize=True)
            print("wrote", out.name, canvas.size)
            count += 1
    print("done:", count, "icons")


if __name__ == "__main__":
    main()
