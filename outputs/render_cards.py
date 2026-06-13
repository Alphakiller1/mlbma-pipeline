"""
render_cards.py — branded PNG social cards from the pipeline data (no browser).

Pure-Pillow renderer (robust for a scheduled pipeline step — no Playwright/Chromium
dependency). One 1080x1350 card per post type, matching the dashboard's dark/violet
brand, written to outputs/social_queue/cards/. Pairs with social_queue.py: that
builds the captions, this builds the images, and social_queue --schedule joins them
into a Buffer/Publer/Metricool import.

    python -m outputs.render_cards                 # today
    python -m outputs.render_cards --date 2026-06-13
    python -m outputs.render_cards --types matchup_of_the_day,trend_signal_snapshot

Importable: render_all(date) -> {post_type: Path}.  See docs/INSTAGRAM_WORKFLOW.md.
"""
from __future__ import annotations

import argparse
from datetime import date as date_cls
from pathlib import Path

import pandas as pd
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from core.config import CHASE_ANALYTICS_DOMAIN, PROJECT_ROOT
from outputs.push_instagram import _fmt_score, _read_csv

CARDS_DIR = PROJECT_ROOT / "outputs" / "social_queue" / "cards"
ASSETS = PROJECT_ROOT / "dashboard" / "assets"

W, H = 1080, 1350
PAD = 84                      # outer panel inset
INNER = PAD + 56             # text left edge

# Brand tokens (mirror dashboard/theme.css)
BG = (8, 9, 15)
PANEL = (18, 20, 29)
BORDER = (38, 42, 56)
VIOLET = (154, 107, 255)
VIOLET_DEEP = (91, 43, 224)
GOLD = (232, 194, 74)
GREEN = (60, 203, 127)
RED = (242, 84, 91)
TEXT = (245, 246, 250)
TEXT2 = (164, 168, 182)
TEXT3 = (110, 115, 131)

DISCLAIMER = "Model-generated research. Not betting advice. 21+."

_FONT_FILES = {
    "black": "C:/Windows/Fonts/seguibl.ttf",
    "bold": "C:/Windows/Fonts/segoeuib.ttf",
    "semibold": "C:/Windows/Fonts/seguisb.ttf",
    "regular": "C:/Windows/Fonts/segoeui.ttf",
    "light": "C:/Windows/Fonts/segoeuil.ttf",
}


def _font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(_FONT_FILES[weight], size)
    except OSError:
        try:
            return ImageFont.truetype("arialbd.ttf" if weight in ("black", "bold", "semibold")
                                      else "arial.ttf", size)
        except OSError:
            return ImageFont.load_default()


# ── drawing helpers ──────────────────────────────────────────────────────────


def _text_w(draw, text, font):
    return draw.textbbox((0, 0), text, font=font)[2]


def _wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if _text_w(draw, trial, font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _tracked(draw, xy, text, font, fill, spacing=2):
    """Draw text with manual letter-spacing (for compact all-caps eyebrows)."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += _text_w(draw, ch, font) + spacing


def _glow(size, color, alpha):
    """A soft radial neon glow as an RGBA layer (blurred ellipse)."""
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    cx, cy, r = size
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color + (alpha,))
    return g.filter(ImageFilter.GaussianBlur(r // 2))


def _base_canvas() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    img.paste(Image.alpha_composite(img.convert("RGBA"),
              _glow((W // 2, 250, 460), VIOLET_DEEP, 60)).convert("RGB"), (0, 0))
    draw = ImageDraw.Draw(img)
    # inset panel
    draw.rounded_rectangle([PAD, PAD, W - PAD, H - PAD], radius=34, fill=PANEL, outline=BORDER, width=2)
    # violet top-edge glint
    draw.line([(PAD + 90, PAD + 1), (W - PAD - 90, PAD + 1)], fill=VIOLET, width=2)
    return img


def _paste_logo(img, draw):
    # The -light asset is the white logo on a solid black box; key out the black
    # (alpha = per-pixel max channel) so only the logo ink lands on our panel.
    from PIL import ImageChops
    p = ASSETS / "chase-logo-horizontal-light.png"
    if p.exists():
        try:
            logo = Image.open(p).convert("RGB")
            r, g, b = logo.split()
            alpha = ImageChops.lighter(ImageChops.lighter(r, g), b)
            logo = logo.convert("RGBA")
            logo.putalpha(alpha)
            target_h = 54
            logo = logo.resize((int(logo.width * target_h / logo.height), target_h), Image.LANCZOS)
            img.paste(logo, (INNER, PAD + 44), logo)
            return
        except OSError:
            pass
    draw.text((INNER, PAD + 46), "CHASE ANALYTICS", font=_font("black", 30), fill=TEXT)


def _draw_card(card: dict, out_path: Path) -> Path:
    img = _base_canvas()
    draw = ImageDraw.Draw(img)
    _paste_logo(img, draw)

    # eyebrow tag (top-right, violet, tracked caps)
    tag = card["tag"].upper()
    ef = _font("semibold", 24)
    tw = sum(_text_w(draw, c, ef) + 3 for c in tag)
    _tracked(draw, (W - PAD - 56 - tw, PAD + 58), tag, ef, VIOLET, spacing=3)

    y = PAD + 200
    # headline
    hf = _font("bold", 60)
    for line in _wrap(draw, card["headline"], hf, W - 2 * INNER):
        draw.text((INNER, y), line, font=hf, fill=TEXT)
        y += 74
    y += 38

    # hero stat
    big = str(card["big"])
    bf = _font("black", 232 if len(big) <= 4 else 168)
    draw.text((INNER, y), big, font=bf, fill=card.get("big_color", VIOLET))
    bbox = draw.textbbox((INNER, y), big, font=bf)
    # stat label to the right of / under the number
    lf = _font("semibold", 30)
    draw.text((INNER + 4, bbox[3] - 6), card.get("big_label", "").upper(), font=lf, fill=TEXT2)
    y = bbox[3] + 56

    # supporting line(s)
    sf = _font("regular", 33)
    for line in _wrap(draw, card["sub"], sf, W - 2 * INNER):
        draw.text((INNER, y), line, font=sf, fill=TEXT2)
        y += 46

    # footer
    fy = H - PAD - 96
    draw.line([(INNER, fy), (W - INNER, fy)], fill=BORDER, width=1)
    draw.text((INNER, fy + 22), CHASE_ANALYTICS_DOMAIN.replace("https://", ""),
              font=_font("semibold", 30), fill=VIOLET)
    draw.text((INNER, fy + 60), DISCLAIMER, font=_font("regular", 21), fill=TEXT3)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path


# ── card-data builders (mirror social_queue's data sources) ──────────────────


def _matchup_of_the_day():
    df = _read_csv("today_matchups.csv")
    if df.empty or "Lineup_Edge" not in df.columns:
        return None
    d = df.copy()
    d["_e"] = d["Lineup_Edge"].astype(str).str.extract(r"([-+]?\d+(?:\.\d+)?)")[0].astype(float).abs()
    d = d.dropna(subset=["_e"])
    if d.empty:
        return None
    r = d.sort_values("_e", ascending=False).head(1).iloc[0]
    return {
        "type": "matchup_of_the_day", "tag": "Matchup of the Day",
        "headline": f"{r.get('Away', '--')} @ {r.get('Home', '--')}",
        "big": str(r.get("Lineup_Edge", "")).strip() or f"{r['_e']:.1f}",
        "big_color": VIOLET, "big_label": "Lineup edge",
        "sub": "Biggest projected lineup edge on tonight's slate, per the model.",
    }


def _top_team_movement():
    df = _read_csv("team_profiles.csv")
    if df.empty or not {"osi_l14", "osi_ytd", "team"} <= set(df.columns):
        return None
    d = df.copy()
    for c in ("osi_l14", "osi_ytd"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["osi_l14", "osi_ytd"])
    if d.empty:
        return None
    d["_delta"] = d["osi_l14"] - d["osi_ytd"]
    r = d.sort_values("_delta", ascending=False).head(1).iloc[0]
    return {
        "type": "top_team_movement", "tag": "Heating Up",
        "headline": str(r.get("team", "--")),
        "big": f"+{_fmt_score(r['_delta'])}", "big_color": GREEN, "big_label": "L14 OSI vs YTD",
        "sub": f"L14 OSI {_fmt_score(r['osi_l14'])} vs YTD {_fmt_score(r['osi_ytd'])} — "
               f"trending up at the plate.",
    }


def _pitcher_spotlight():
    df = _read_csv("sp_profiles.csv")
    if df.empty:
        return None
    name_col = next((c for c in ("pitcher_name", "pitcher", "name") if c in df.columns), None)
    if not name_col:
        return None
    r = df.iloc[0]
    big, label = "SP", "On the mound"
    if "K_pct" in df.columns and pd.notna(r.get("K_pct")):
        big, label = f"{_fmt_score(r['K_pct'])}%", "K rate"
    elif "FIP" in df.columns and pd.notna(r.get("FIP")):
        big, label = _fmt_score(r["FIP"], 2), "FIP"
    return {
        "type": "pitcher_spotlight", "tag": "Pitcher Spotlight",
        "headline": str(r.get(name_col, "Tonight's arm")),
        "big": big, "big_color": VIOLET, "big_label": label,
        "sub": "Full profile — splits, pitch mix, and matchup — on the dashboard.",
    }


def _bullpen_warning():
    df = _read_csv("bullpen_unit.csv")
    if df.empty or "team" not in df.columns:
        return None
    d = df.copy()
    era_col = next((c for c in ("overall_ERA", "bullpen_era", "ERA") if c in d.columns), None)
    big, color, label = "WATCH", RED, "Bullpen risk"
    if era_col:
        d[era_col] = pd.to_numeric(d[era_col], errors="coerce")
        d = d.dropna(subset=[era_col]).sort_values(era_col, ascending=False)
        if d.empty:
            return None
        r = d.iloc[0]
        big, label = _fmt_score(r[era_col], 2), "Bullpen ERA"
    else:
        r = d.iloc[0]
    return {
        "type": "bullpen_warning", "tag": "Bullpen Watch",
        "headline": str(r.get("team", "--")),
        "big": big, "big_color": color, "big_label": label,
        "sub": "Pen is stretched — check the bullpen report before backing late innings.",
    }


def _trend_signal_snapshot():
    df = _read_csv("signals_convergence.csv")
    if df.empty:
        return None
    d = df.copy()
    if "convergence_count" in d.columns:
        d["convergence_count"] = pd.to_numeric(d["convergence_count"], errors="coerce")
        d = d.sort_values("convergence_count", ascending=False)
    if d.empty:
        return None
    r = d.iloc[0]
    return {
        "type": "trend_signal_snapshot", "tag": "Signal Snapshot",
        "headline": f"{r.get('away', '--')} @ {r.get('home', '--')}",
        "big": f"{_fmt_score(r.get('convergence_count'), 0)}×", "big_color": GOLD,
        "big_label": "Model convergence",
        "sub": "Multiple model indicators agree on this game today.",
    }


BUILDERS = {
    "matchup_of_the_day": _matchup_of_the_day,
    "top_team_movement": _top_team_movement,
    "pitcher_spotlight": _pitcher_spotlight,
    "bullpen_warning": _bullpen_warning,
    "trend_signal_snapshot": _trend_signal_snapshot,
}


def render_all(d: str | None = None, types: list[str] | None = None) -> dict[str, Path]:
    """Render the requested card types for date `d`. Returns {type: png_path}."""
    d = d or date_cls.today().isoformat()
    wanted = types or list(BUILDERS)
    out: dict[str, Path] = {}
    for t in wanted:
        builder = BUILDERS.get(t)
        if not builder:
            continue
        try:
            card = builder()
        except Exception as exc:  # one bad card never kills the batch
            print(f"  ! {t} skipped: {exc}")
            card = None
        if not card:
            continue
        path = _draw_card(card, CARDS_DIR / f"card_{d}_{t}.png")
        out[t] = path
    return out


def main():
    ap = argparse.ArgumentParser(description="Render branded social cards from pipeline data.")
    ap.add_argument("--date", default=date_cls.today().isoformat(), help="YYYY-MM-DD (default today).")
    ap.add_argument("--types", default="", help="Comma list (default: all 5).")
    args = ap.parse_args()
    types = [t.strip() for t in args.types.split(",") if t.strip()] or None
    cards = render_all(args.date, types)
    print(f"Rendered {len(cards)} card(s) for {args.date}:")
    for t, p in cards.items():
        print(f"  [{t}] {p}")
    if not cards:
        print("  (no cards — is data/ populated? run the pipeline first.)")


if __name__ == "__main__":
    main()
