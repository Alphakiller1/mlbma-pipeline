"""Crop MLBMA dashboard icons from ChatGPT-generated PNG grids."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dashboard" / "assets" / "icons"
SRC_DIR = Path(r"c:\Users\chase\Downloads\MLB icons_files")

GRIDS = [
    {
        "file": "da3e2c80-5502-4de8-aa75-47000a5e3248.png",
        "cols": 4,
        "rows": 4,
        "icon_frac": 0.72,
        "pad_frac": 0.08,
        "names": [
            ["dashboard", "team-rankings", "trends", "matchups"],
            ["compare", "team-profile", "player-profile", "offense"],
            ["pitching", "lineups", "metrics", "research-lab"],
            ["alerts", "glossary", "reports", "settings"],
        ],
    },
    {
        "file": "bbf96d5d-4d87-4e61-b758-4cba131d3898.png",
        "cols": 5,
        "rows": 4,
        "icon_frac": 0.78,
        "pad_frac": 0.06,
        "names": [
            ["analytics-hub", "lineup-bars", "trend-line", "matchup-plates", "batting-chart"],
            ["compare-stats", "team-shield", "player-card", "offense-power", "unused-1"],
            ["strike-zone", "roster-board", "velocity-gauge", "lab-flask", "unused-2"],
            ["notify-bell", "playbook", "summary-doc", "config-gear", "search-filter"],
        ],
    },
]

EXTRA = [
    ("image(6).png", "diamond-field"),
]


def crop_grid(spec):
    path = SRC_DIR / spec["file"]
    if not path.exists():
        print("SKIP missing", path)
        return 0
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    cols, rows = spec["cols"], spec["rows"]
    cw, ch = w / cols, h / rows
    count = 0
    for r, row_names in enumerate(spec["names"]):
        for c, name in enumerate(row_names):
            if name.startswith("unused"):
                continue
            x0 = c * cw
            y0 = r * ch
            pad_x = cw * spec["pad_frac"]
            pad_y = ch * spec["pad_frac"]
            icon_h = ch * spec["icon_frac"]
            box = (
                int(x0 + pad_x),
                int(y0 + pad_y),
                int(x0 + cw - pad_x),
                int(y0 + icon_h - pad_y),
            )
            tile = im.crop(box)
            # square pad on transparent canvas
            side = max(tile.size)
            canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            ox = (side - tile.width) // 2
            oy = (side - tile.height) // 2
            canvas.paste(tile, (ox, oy), tile)
            out = OUT / f"{name}.png"
            canvas.save(out, optimize=True)
            print("wrote", out.name, canvas.size)
            count += 1
    return count


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for spec in GRIDS:
        total += crop_grid(spec)
    for src_name, out_name in EXTRA:
        src = SRC_DIR / src_name
        if not src.exists():
            continue
        im = Image.open(src).convert("RGBA")
        # trim near-black background loosely
        im.save(OUT / f"{out_name}.png", optimize=True)
        print("wrote", out_name)
        total += 1
    print("total icons", total)


if __name__ == "__main__":
    main()
