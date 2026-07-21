"""Contract-bound social PNG renderer for Chase Analytics daily reports.

Governed by design/CONTENT_DESIGN_CONTRACT.md. Renderer changes to meet the contract;
the contract is never weakened to match this file.
"""

from __future__ import annotations

import math
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from chase_content.util import number, truncate
from chase_content.validate import validate_bundle

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BRAND_LOGO = ASSETS / "brand" / "chase-logo-horizontal-light.png"
FONT_DIR = ASSETS / "fonts"
TEAM_LOGO_DIR = ASSETS / "team_logos"

WIDTH = 1080
HEIGHT = 1350
SAFE_LEFT = 60
SAFE_RIGHT = 1020
HEADER_BOTTOM = 180
CONTENT_TOP = 200
CONTENT_BOTTOM = 1270
FOOTER_RULE_Y = 1294

# §1.1 Surfaces & text
BG = "#08090F"
SURFACE = "#12141D"
SURFACE_ELEVATED = "#181B26"
SURFACE_RAISED = "#20232F"
BORDER = "#262A38"
BORDER_STRONG = "#363B4D"
TEXT = "#F5F6FA"
TEXT_SECONDARY = "#A4A8B6"
TEXT_META = "#6E7383"
TEXT_DISABLED = "#4C5161"

# §1.2 Brand & status
PURPLE = "#9A6BFF"
PURPLE_DARK = "#5B2BE0"
PURPLE_LIGHT = "#C4B0FF"
POSITIVE = "#3CCB7F"
WARNING = "#E8C24A"
RISK = "#F2545B"
VIOLET_BORDER = (154, 107, 255, 104)  # rgba(154,107,255,0.41) ≈ a=104

# Sanctioned light brand plate for the dark-ink horizontal mark on a dark canvas.
# Values fixed by .cursor/rules/chase-brand-and-avatars.mdc (.ca-brand-badge-light); the mark is
# never recolored/traced (§2.13) — it is placed inside this approved plate instead.
BRAND_PLATE = "#E5E7EB"
BRAND_PLATE_BORDER = "#D1D5DB"

# §1.3 League-anchored metric scale
METRIC_STEPS = {
    "veryWeak": "#F2545B",
    "weak": "#F0935B",
    "belowAvg": "#E8C24A",
    "average": "#A1A1AA",
    "aboveAvg": "#86D76F",
    "strong": "#4ADE80",
    "elite": "#22C55E",
}

ESPN_ABBR_MAP = {
    "ARI": "ari",
    "ATL": "atl",
    "BAL": "bal",
    "BOS": "bos",
    "CHC": "chc",
    "CHW": "chw",
    "CWS": "chw",
    "CIN": "cin",
    "CLE": "cle",
    "COL": "col",
    "DET": "det",
    "HOU": "hou",
    "KC": "kc",
    "KCR": "kc",
    "LAA": "laa",
    "LAD": "lad",
    "MIA": "mia",
    "MIL": "mil",
    "MIN": "min",
    "NYM": "nym",
    "NYY": "nyy",
    "ATH": "oak",
    "OAK": "oak",
    "PHI": "phi",
    "PIT": "pit",
    "SD": "sd",
    "SDP": "sd",
    "SF": "sf",
    "SFG": "sf",
    "SEA": "sea",
    "STL": "stl",
    "TB": "tb",
    "TBR": "tb",
    "TEX": "tex",
    "TOR": "tor",
    "WSH": "wsh",
    "WAS": "wsh",
    "WSN": "wsh",
    "AZ": "ari",
    "CHA": "chw",
    "KCA": "kc",
    "TBA": "tb",
}

CONTEXT_DEFAULTS = {
    "osi": {"mean": 50.0, "std": 12.0, "hi": True},
    "delta": {"mean": 0.0, "std": 8.0, "hi": True},
    "runs": {"mean": 4.4, "std": 0.55, "hi": True},
    "divergence": {"mean": 0.0, "std": 0.06, "hi": True},
}


class RenderError(RuntimeError):
    """Fail-closed export error (missing logos, invalid bundle, etc.)."""


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    raw = value.lstrip("#")
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def _font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.exists():
        raise RenderError(f"Required font missing: {path}")
    return ImageFont.truetype(str(path), size=size)


def _load_fonts() -> dict[str, ImageFont.FreeTypeFont]:
    bold = FONT_DIR / "RobotoCondensed-Bold.ttf"
    regular = FONT_DIR / "RobotoCondensed-Regular.ttf"
    dm_semi = FONT_DIR / "DMSans-SemiBold.ttf"
    dm_med = FONT_DIR / "DMSans-Medium.ttf"
    return {
        "title": _font(bold, 44),
        "section": _font(bold, 28),
        "metric": _font(bold, 30),
        "metric_sm": _font(bold, 26),
        "team": _font(bold, 24),
        "body": _font(bold, 20),
        "body_reg": _font(regular, 20),
        "label": _font(dm_semi, 16),
        "meta": _font(dm_med, 14),
        "tiny": _font(dm_med, 13),
        "rank": _font(bold, 22),
    }


FONTS = _load_fonts()


def espn_slug(team: str) -> str:
    upper = str(team or "").strip().upper()
    if not upper:
        raise RenderError("Team abbreviation is empty")
    return ESPN_ABBR_MAP.get(upper, upper.lower())


def team_logo_path(team: str) -> Path:
    slug = espn_slug(team)
    cached = TEAM_LOGO_DIR / f"{slug}.png"
    if cached.exists() and cached.stat().st_size > 0:
        return cached
    TEAM_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    url = f"https://a.espncdn.com/i/teamlogos/mlb/500/{slug}.png"
    try:
        urllib.request.urlretrieve(url, cached)  # noqa: S310 — fixed ESPN CDN host
    except (urllib.error.URLError, OSError) as exc:
        if cached.exists():
            cached.unlink(missing_ok=True)
        raise RenderError(f"Could not resolve team logo for {team} ({slug})") from exc
    if not cached.exists() or cached.stat().st_size == 0:
        raise RenderError(f"Empty team logo for {team} ({slug})")
    return cached


def _paste_logo(image: Image.Image, path: Path, box: tuple[int, int, int, int]) -> None:
    logo = Image.open(path).convert("RGBA")
    x1, y1, x2, y2 = box
    target_w, target_h = x2 - x1, y2 - y1
    logo.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    ox = x1 + (target_w - logo.width) // 2
    oy = y1 + (target_h - logo.height) // 2
    image.paste(logo, (ox, oy), logo)


def _load_brand_logo() -> Image.Image:
    """Approved Chase mark, trimmed to its content box (padding trim is not a mark crop)."""
    if not BRAND_LOGO.exists():
        raise RenderError(f"Chase logo missing: {BRAND_LOGO}")
    logo = Image.open(BRAND_LOGO).convert("RGBA")
    bbox = logo.getbbox()
    return logo.crop(bbox) if bbox else logo


def _chase_logo(image: Image.Image, draw: ImageDraw.ImageDraw, *, x: int, y: int, width: int = 196) -> tuple[int, int]:
    """Approved horizontal mark inside the sanctioned light brand plate.

    The approved horizontal artwork is a dark-ink wordmark (for light surfaces); brand policy
    (`.cursor/rules/chase-brand-and-avatars.mdc`) requires such marks to sit inside the soft-grey
    `.ca-brand-badge-light` plate rather than being recolored/traced (§2.13). Returns the plate
    box size so the header can lay out around it.
    """
    logo = _load_brand_logo()
    ratio = width / logo.width
    height = max(1, int(logo.height * ratio))
    logo = logo.resize((width, height), Image.Resampling.LANCZOS)
    pad_x, pad_y = 16, 12
    plate_w = width + pad_x * 2
    plate_h = height + pad_y * 2
    draw.rounded_rectangle(
        (x, y, x + plate_w, y + plate_h),
        radius=12,
        fill=BRAND_PLATE,
        outline=BRAND_PLATE_BORDER,
        width=1,
    )
    image.paste(logo, (x + pad_x, y + pad_y), logo)
    return plate_w, plate_h


def metric_color(value: float | None, context: str = "osi", *, invert: bool | None = None) -> str:
    if value is None:
        return TEXT_DISABLED
    cfg = CONTEXT_DEFAULTS.get(context) or CONTEXT_DEFAULTS["osi"]
    mean = float(cfg["mean"])
    std = float(cfg["std"]) or 1.0
    higher_is_better = bool(cfg["hi"])
    use_invert = (not higher_is_better) if invert is None else invert
    z = (float(value) - mean) / std
    if use_invert:
        z = -z
    if z <= -1.5:
        key = "veryWeak"
    elif z <= -0.85:
        key = "weak"
    elif z <= -0.30:
        key = "belowAvg"
    elif z <= 0.30:
        key = "average"
    elif z <= 0.85:
        key = "aboveAvg"
    elif z <= 1.5:
        key = "strong"
    else:
        key = "elite"
    return METRIC_STEPS[key]


def _draw_metallic_text(
    image: Image.Image,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    *,
    anchor: str | None = None,
) -> None:
    """Vertical metallic-silver fill per §1.5, embossed on dark for a true chrome read."""
    scratch = Image.new("L", (WIDTH, HEIGHT), 0)
    scratch_draw = ImageDraw.Draw(scratch)
    scratch_draw.text(xy, text, font=font, fill=255, anchor=anchor)
    bbox = scratch.getbbox()
    if bbox is None:
        return
    x1, y1, x2, y2 = bbox
    mask = scratch.crop(bbox)
    height = max(1, y2 - y1)
    width = max(1, x2 - x1)

    # Depth: a soft dark cast below/behind lifts the light gradient off the near-black canvas
    # so the metallic band reads as machined metal instead of flat off-white.
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow.paste((3, 4, 9, 210), (x1, y1 + 2), mask)
    image.alpha_composite(shadow)

    # §1.5 fixed vertical fill — the specular white/gray/white banding IS the metal.
    stops = [
        (0.00, (255, 255, 255)),
        (0.38, (233, 234, 240)),
        (0.56, (157, 160, 174)),
        (0.72, (215, 217, 226)),
        (1.00, (255, 255, 255)),
    ]
    column = Image.new("RGB", (1, height))
    for row in range(height):
        t = row / max(1, height - 1)
        for i in range(1, len(stops)):
            t1, c1 = stops[i - 1]
            t2, c2 = stops[i]
            if t <= t2:
                f = (t - t1) / ((t2 - t1) or 1)
                column.putpixel((0, row), tuple(int(c1[j] + (c2[j] - c1[j]) * f) for j in range(3)))
                break
    band = column.resize((width, height))
    image.paste(band, (x1, y1), mask)


def _canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (WIDTH, HEIGHT), _hex_to_rgb(BG) + (255,))
    # Subtle violet corner glow ≤14% opacity (§3.1)
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((720, -180, 1280, 380), fill=(154, 107, 255, 28))
    glow_draw.ellipse((-220, 980, 340, 1540), fill=(91, 43, 224, 22))
    image = Image.alpha_composite(image, glow)
    return image, ImageDraw.Draw(image)


def _draw_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = box
    # Soft depth first, then dimensional card (§4.1)
    draw.rounded_rectangle(
        (x1, y1 + 4, x2, y2 + 5),
        radius=20,
        fill="#05060A",
    )
    draw.rounded_rectangle(box, radius=20, fill=SURFACE, outline=PURPLE, width=2)
    draw.line((x1 + 18, y1 + 2, x2 - 18, y1 + 2), fill=PURPLE_LIGHT, width=2)


def _draw_arrow(draw: ImageDraw.ImageDraw, cx: int, cy: int, fill: str, *, length: int = 16) -> None:
    """Right-pointing arrow drawn as vectors (bundled fonts lack U+2192)."""
    half = length // 2
    x1, x2 = cx - half, cx + half
    draw.line((x1, cy, x2, cy), fill=fill, width=2)
    head = 4
    draw.polygon([(x2, cy), (x2 - head, cy - head), (x2 - head, cy + head)], fill=fill)


def _header(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    title: str,
    date: str,
    updated: str,
    page: str | None = None,
    state: str = "live",
) -> None:
    plate_y = 44
    plate_w, plate_h = _chase_logo(image, draw, x=SAFE_LEFT, y=plate_y, width=196)
    plate_cy = plate_y + plate_h // 2
    title_x = SAFE_LEFT + plate_w + 26
    _draw_metallic_text(image, (title_x, plate_cy), title, FONTS["title"], anchor="lm")
    meta = f"{date} · {updated} · {state}"
    if page:
        meta = f"{meta} · {page}"
    meta_y = plate_y + plate_h + 16
    draw.text((SAFE_LEFT, meta_y), meta, font=FONTS["meta"], fill=TEXT_META)
    draw.line((SAFE_LEFT, HEADER_BOTTOM, SAFE_RIGHT, HEADER_BOTTOM), fill=BORDER_STRONG, width=2)


def _footer(draw: ImageDraw.ImageDraw, generated_at: str) -> None:
    draw.line((SAFE_LEFT, FOOTER_RULE_Y, SAFE_RIGHT, FOOTER_RULE_Y), fill=BORDER, width=2)
    draw.text(
        (SAFE_LEFT, 1312),
        f"Updated {generated_at} · Model projections are not guarantees.",
        font=FONTS["tiny"],
        fill=TEXT_META,
    )
    draw.text(
        (SAFE_RIGHT, 1312),
        "chase-analytics.com",
        font=FONTS["tiny"],
        fill=PURPLE_LIGHT,
        anchor="ra",
    )


def _date_label(bundle: dict) -> str:
    return str((bundle.get("meta") or {}).get("slate_date") or "Date unavailable")


def _updated_label(bundle: dict) -> str:
    raw = str((bundle.get("meta") or {}).get("generated_at") or "")
    stamp = raw.replace("T", " ")[:19]
    return f"{stamp} ET" if stamp else "time unavailable"


def _run_separation(game: dict) -> float:
    projection = game.get("projection") or {}
    away = number(projection.get("away_runs"))
    home = number(projection.get("home_runs"))
    if away is None or home is None:
        return -1.0
    return abs(home - away)


def _separation_label(sep: float) -> tuple[str, str]:
    if sep >= 1.5:
        return "LOPSIDED", RISK
    if sep >= 1.0:
        return "CLEAR EDGE", WARNING
    if sep >= 0.5:
        return "LEAN", PURPLE_LIGHT
    return "TOSS-UP", TEXT_META


def _opinion_color(tag: str) -> str:
    return {
        "MY BET": POSITIVE,
        "LEAN": PURPLE,
        "WATCH": WARNING,
        "PASS": TEXT_META,
        "NO OPINION": TEXT_META,
    }.get(tag, TEXT_META)


def _divergence_color(abs_div: float) -> str:
    """Observation magnitude only — never green=bet (§8.2)."""
    if abs_div >= 0.10:
        return RISK
    if abs_div >= 0.06:
        return WARNING
    if abs_div >= 0.03:
        return PURPLE_LIGHT
    return TEXT_SECONDARY


def _pitcher_text(pitcher: dict, *, compact: bool = False) -> str:
    name = truncate(pitcher.get("name") or "TBD", 18 if compact else 22)
    ip = number(pitcher.get("projected_ip"))
    er = number(pitcher.get("projected_er"))
    strikeouts = number(pitcher.get("projected_k"))
    if ip is None and er is None and strikeouts is None:
        return f"{name} · pending"
    pieces = []
    if ip is not None:
        pieces.append(f"{ip:.1f} IP")
    if er is not None:
        pieces.append(f"{er:.1f} ER")
    if strikeouts is not None:
        pieces.append(f"{strikeouts:.1f} K")
    return f"{name} · {' · '.join(pieces)}"


def _assert_publishable(bundle: dict) -> None:
    problems = validate_bundle(bundle, require_projections=True)
    if problems:
        raise RenderError("Bundle failed integrity gate: " + "; ".join(problems))
    # Required logos for every team identity on the canvas
    teams: set[str] = set()
    for game in bundle.get("games") or []:
        teams.add(str(game.get("away") or ""))
        teams.add(str(game.get("home") or ""))
    offense = bundle.get("offense") or {}
    for key in ("vs_rhp", "vs_lhp", "risers", "fallers"):
        for row in offense.get(key) or []:
            teams.add(str(row.get("team") or ""))
    for category in ("pitching", "ml", "totals"):
        for row in (bundle.get("markets") or {}).get(category) or []:
            game = str(row.get("game") or "")
            if "@" in game:
                away, home = game.split("@", 1)
                teams.add(away)
                teams.add(home)
            selection = str(row.get("selection") or "").strip().upper()
            if selection in ESPN_ABBR_MAP:
                teams.add(selection)
    for team in sorted(t for t in teams if t):
        team_logo_path(team)
    if not BRAND_LOGO.exists():
        raise RenderError(f"Chase logo missing: {BRAND_LOGO}")


def _draw_game_card(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    game: dict,
    rank: int,
    box: tuple[int, int, int, int],
    *,
    compact: bool,
) -> None:
    x1, y1, x2, y2 = box
    _draw_card(draw, box)
    projection = game.get("projection") or {}
    away = str(game.get("away") or "AWY")
    home = str(game.get("home") or "HME")
    away_runs = number(projection.get("away_runs"))
    home_runs = number(projection.get("home_runs"))
    sep = _run_separation(game)
    label, tone = _separation_label(sep if sep >= 0 else 0.0)
    mid = (x1 + x2) // 2

    # Layout constants tuned so both the 220 px standard card and the sub-190 px compact card
    # stack (header · teams · run projection · pitchers · opinion rail) without overlap (§5.1).
    if compact:
        logo_size, logo_y = 30, y1 + 44
        proj_label_y, proj_val_y = y1 + 82, y1 + 98
        proj_font, dash_font = FONTS["metric_sm"], FONTS["body"]
        pitch_y, pitch_lh, pitch_font = y1 + 130, 14, FONTS["tiny"]
    else:
        logo_size, logo_y = 38, y1 + 52
        proj_label_y, proj_val_y = y1 + 100, y1 + 118
        proj_font, dash_font = FONTS["metric"], FONTS["body"]
        pitch_y, pitch_lh, pitch_font = y1 + 156, 16, FONTS["meta"]

    draw.text((x1 + 18, y1 + 12), f"#{rank}", font=FONTS["rank"], fill=PURPLE)
    draw.text((x2 - 18, y1 + 12), str(game.get("time") or "TBD"), font=FONTS["meta"], fill=TEXT_META, anchor="ra")
    draw.text((x2 - 18, y1 + 30), label, font=FONTS["label"], fill=tone, anchor="ra")

    abbr_dy = (logo_size - 24) // 2
    away_logo_box = (x1 + 18, logo_y, x1 + 18 + logo_size, logo_y + logo_size)
    home_logo_box = (x2 - 18 - logo_size, logo_y, x2 - 18, logo_y + logo_size)
    _paste_logo(image, team_logo_path(away), away_logo_box)
    _paste_logo(image, team_logo_path(home), home_logo_box)
    draw.text((x1 + 26 + logo_size, logo_y + abbr_dy), away, font=FONTS["team"], fill=TEXT)
    draw.text((x2 - 26 - logo_size, logo_y + abbr_dy), home, font=FONTS["team"], fill=TEXT, anchor="ra")

    med_w, med_h = 32, 24
    med_cy = logo_y + logo_size // 2
    med_box = (mid - med_w // 2, med_cy - med_h // 2, mid + med_w // 2, med_cy + med_h // 2)
    draw.rounded_rectangle(med_box, radius=12, fill=SURFACE_RAISED, outline=BORDER_STRONG, width=1)
    draw.text((mid, med_cy), "@", font=FONTS["label"], fill=TEXT_SECONDARY, anchor="mm")

    draw.text((x1 + 18, proj_label_y), "RUN PROJECTION", font=FONTS["label"], fill=TEXT_SECONDARY)
    if away_runs is not None and home_runs is not None:
        draw.text((x1 + 18, proj_val_y), f"{away_runs:.1f}", font=proj_font, fill=metric_color(away_runs, "runs"))
        draw.text((mid, proj_val_y + 4), "—", font=dash_font, fill=TEXT_META, anchor="mm")
        draw.text((x2 - 18, proj_val_y), f"{home_runs:.1f}", font=proj_font, fill=metric_color(home_runs, "runs"), anchor="ra")
    else:
        draw.text((x1 + 18, proj_val_y + 2), "unavailable", font=FONTS["body"], fill=TEXT_DISABLED)

    draw.text(
        (x1 + 18, pitch_y),
        _pitcher_text(game.get("away_pitcher") or {}, compact=True),
        font=pitch_font,
        fill=TEXT,
    )
    draw.text(
        (x1 + 18, pitch_y + pitch_lh),
        _pitcher_text(game.get("home_pitcher") or {}, compact=True),
        font=pitch_font,
        fill=TEXT,
    )

    opinion = game.get("opinion") or {}
    tag = str(opinion.get("tag") or "NO OPINION").upper()
    opinion_text = truncate(opinion.get("text"), 30 if compact else 40)
    rail_y = y2 - 30
    chip_w = 108 if tag == "NO OPINION" else 90
    draw.rounded_rectangle(
        (x1 + 18, rail_y - 2, x1 + 18 + chip_w, rail_y + 20),
        radius=11,
        fill=_opinion_color(tag),
    )
    draw.text((x1 + 18 + chip_w // 2, rail_y + 9), tag, font=FONTS["tiny"], fill=BG, anchor="mm")
    if opinion_text:
        draw.text((x1 + 26 + chip_w, rail_y + 2), opinion_text, font=FONTS["meta"], fill=TEXT)
    status = str(game.get("lineup_status") or "projected").title()
    confidence = str((projection.get("confidence") or "")).strip()
    right_meta = f"{status}" + (f" · {confidence}" if confidence else "")
    draw.text((x2 - 18, rail_y + 4), right_meta, font=FONTS["tiny"], fill=TEXT_META, anchor="ra")


def _paginate_morning(count: int) -> tuple[int, int]:
    """Prefer 4/page; use 5/page only when needed; max 3 pages."""
    if count <= 0:
        return 1, 1
    if count <= 4:
        return 1, count
    if count <= 8:
        return 2, 4
    if count <= 12:
        return 3, 4
    # Overflow: top-N with compact 5/page across 3 pages
    return 3, 5


def render_morning_slate(bundle: dict, out_dir: Path) -> list[Path]:
    games = list(bundle.get("games") or [])
    games.sort(key=_run_separation, reverse=True)
    pages, per_page = _paginate_morning(len(games))
    if len(games) > pages * per_page:
        games = games[: pages * per_page]

    paths: list[Path] = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for page_index in range(pages):
        page_games = games[page_index * per_page : (page_index + 1) * per_page]
        if not page_games:
            break
        image, draw = _canvas()
        _header(
            image,
            draw,
            title="MORNING SLATE",
            date=_date_label(bundle),
            updated=_updated_label(bundle),
            page=f"{page_index + 1} / {pages}" if pages > 1 else None,
        )
        gap = 14
        n = len(page_games)
        available = CONTENT_BOTTOM - CONTENT_TOP - gap * max(0, n - 1)
        card_height = int(available / max(1, n))
        if n <= 4:
            card_height = min(max(card_height, 190), 220)
        else:
            card_height = min(card_height, 190)
        y = CONTENT_TOP
        for offset, game in enumerate(page_games):
            rank = page_index * per_page + offset + 1
            _draw_game_card(
                image,
                draw,
                game,
                rank,
                (SAFE_LEFT, y, SAFE_RIGHT, y + card_height),
                compact=n >= 5 or card_height < 200,
            )
            y += card_height + gap
        _footer(draw, _updated_label(bundle))
        path = out_dir / f"morning-slate-{page_index + 1:02d}.png"
        image.convert("RGB").save(path, quality=95)
        paths.append(path)
    return paths


def _draw_rank_panel(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    rows: list[dict],
    metric: str,
) -> None:
    x1, y1, x2, y2 = box
    _draw_card(draw, box)
    _draw_metallic_text(image, (x1 + 22, y1 + 18), title, FONTS["section"])
    draw.line((x1 + 22, y1 + 56, x2 - 22, y1 + 56), fill=BORDER, width=1)
    for index, row in enumerate(rows[:5], start=1):
        y = y1 + 72 + (index - 1) * 72
        team = str(row.get("team") or "—")
        value = number(row.get(metric))
        logo_box = (x1 + 22, y, x1 + 50, y + 28)
        if team != "—":
            _paste_logo(image, team_logo_path(team), logo_box)
        draw.text((x1 + 58, y + 4), f"{index}", font=FONTS["meta"], fill=PURPLE)
        draw.text((x1 + 78, y + 2), team, font=FONTS["team"], fill=TEXT)
        if value is not None:
            if metric == "delta":
                label = f"{value:+.1f}"
                color = metric_color(value, "delta")
            else:
                label = f"{value:.1f}"
                color = metric_color(value, "osi")
            draw.text((x2 - 22, y + 2), label, font=FONTS["metric_sm"], fill=color, anchor="ra")
        else:
            draw.text((x2 - 22, y + 2), "—", font=FONTS["metric_sm"], fill=TEXT_DISABLED, anchor="ra")
        if metric == "delta":
            ytd = number(row.get("osi_ytd"))
            l7 = number(row.get("osi_l7"))
            note_x, ny = x1 + 78, y + 30
            left = f"YTD {ytd:.1f}" if ytd is not None else "YTD"
            right = f"L7 {l7:.1f}" if l7 is not None else "L7"
            draw.text((note_x, ny), left, font=FONTS["tiny"], fill=TEXT_META)
            arrow_x = int(note_x + draw.textlength(left, font=FONTS["tiny"]) + 11)
            _draw_arrow(draw, arrow_x, ny + 7, TEXT_META, length=12)
            draw.text((arrow_x + 11, ny), right, font=FONTS["tiny"], fill=TEXT_META)
        else:
            draw.text((x1 + 78, y + 30), "OSI · league scale", font=FONTS["tiny"], fill=TEXT_META)


def render_offensive_report(bundle: dict, out_dir: Path) -> list[Path]:
    image, draw = _canvas()
    _header(
        image,
        draw,
        title="OFFENSIVE REPORT",
        date=_date_label(bundle),
        updated=_updated_label(bundle),
    )
    offense = bundle.get("offense") or {}
    boxes = [
        (SAFE_LEFT, CONTENT_TOP, 520, 720),
        (560, CONTENT_TOP, SAFE_RIGHT, 720),
        (SAFE_LEFT, 740, 520, CONTENT_BOTTOM),
        (560, 740, SAFE_RIGHT, CONTENT_BOTTOM),
    ]
    _draw_rank_panel(image, draw, boxes[0], "TOP VS RIGHTIES", offense.get("vs_rhp") or [], "osi")
    _draw_rank_panel(image, draw, boxes[1], "TOP VS LEFTIES", offense.get("vs_lhp") or [], "osi")
    _draw_rank_panel(image, draw, boxes[2], "RISERS", offense.get("risers") or [], "delta")
    _draw_rank_panel(image, draw, boxes[3], "FALLERS", offense.get("fallers") or [], "delta")
    _footer(draw, _updated_label(bundle))
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "offensive-report.png"
    image.convert("RGB").save(path, quality=95)
    return [path]


def _market_title(category: str) -> str:
    return {"pitching": "PITCHING", "ml": "MONEYLINE", "totals": "TOTALS"}[category]


def _team_from_market_row(row: dict) -> str | None:
    selection = str(row.get("selection") or "").strip().upper()
    if selection in ESPN_ABBR_MAP:
        return selection
    game = str(row.get("game") or "")
    if "@" in game:
        return game.split("@", 1)[1]
    return None


def _draw_market_panel(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    category: str,
    rows: list[dict],
) -> None:
    x1, y1, x2, y2 = box
    _draw_card(draw, box)
    _draw_metallic_text(image, (x1 + 22, y1 + 16), _market_title(category), FONTS["section"])
    # Legend: public neutral, sharp purple (§8.2) — identities, not a recommendation.
    draw.text((x2 - 22, y1 + 24), "SHARP", font=FONTS["label"], fill=PURPLE_LIGHT, anchor="ra")
    sharp_w = draw.textlength("SHARP", font=FONTS["label"])
    _draw_arrow(draw, int(x2 - 22 - sharp_w - 16), y1 + 32, TEXT_META, length=14)
    draw.text((x2 - 22 - sharp_w - 34, y1 + 24), "PUBLIC", font=FONTS["label"], fill=TEXT_SECONDARY, anchor="ra")
    draw.line((x1 + 22, y1 + 54, x2 - 22, y1 + 54), fill=BORDER, width=1)
    if not rows:
        draw.text(
            (x1 + 22, y1 + 84),
            "No current paired market observations.",
            font=FONTS["body"],
            fill=TEXT_META,
        )
        return
    ranked = sorted(rows, key=lambda r: abs(number(r.get("divergence")) or 0), reverse=True)
    for index, row in enumerate(ranked[:4]):
        y = y1 + 70 + index * 70
        team = _team_from_market_row(row)
        text_x = x1 + 22
        if team:
            _paste_logo(image, team_logo_path(team), (x1 + 22, y, x1 + 46, y + 24))
            text_x = x1 + 54
        primary = str(row.get("selection") or row.get("market") or "")
        label = truncate(
            " · ".join(part for part in (str(row.get("game") or ""), primary) if part),
            40,
        )
        public = (number(row.get("public_probability")) or 0) * 100
        sharp = (number(row.get("sharp_probability")) or 0) * 100
        divergence = (number(row.get("divergence")) or 0) * 100
        draw.text((text_x, y), label or "Market observation", font=FONTS["body"], fill=TEXT)
        # Public neutral, sharp purple; divergence magnitude ≠ green "bet" (§8.2)
        draw.text((x2 - 210, y + 2), f"{public:.1f}%", font=FONTS["body"], fill=TEXT_SECONDARY, anchor="ra")
        _draw_arrow(draw, x2 - 175, y + 12, TEXT_META, length=16)
        draw.text((x2 - 78, y + 2), f"{sharp:.1f}%", font=FONTS["body"], fill=PURPLE_LIGHT, anchor="ra")
        draw.text(
            (x2 - 22, y + 2),
            f"{divergence:+.1f}",
            font=FONTS["body"],
            fill=_divergence_color(abs(number(row.get("divergence")) or 0)),
            anchor="ra",
        )
        bar_y = y + 30
        bar_x1, bar_x2 = text_x, x2 - 22
        draw.rounded_rectangle((bar_x1, bar_y, bar_x2, bar_y + 6), radius=3, fill=SURFACE_RAISED)
        pub_w = int((bar_x2 - bar_x1) * min(1.0, public / 100))
        shp_w = int((bar_x2 - bar_x1) * min(1.0, sharp / 100))
        draw.rounded_rectangle((bar_x1, bar_y, bar_x1 + pub_w, bar_y + 6), radius=3, fill=BORDER_STRONG)
        draw.rounded_rectangle((bar_x1, bar_y, bar_x1 + shp_w, bar_y + 6), radius=3, outline=PURPLE_LIGHT, width=1)
        raw_snap = str(row.get("snapshot_time") or "")
        snap = raw_snap.replace("T", " ").replace("+00:00", " UTC").replace("Z", " UTC")
        if len(snap) > 26:
            snap = snap[:26]
        draw.text((text_x, y + 40), f"observed {snap}" if snap else "timestamp unavailable", font=FONTS["tiny"], fill=TEXT_META)


def render_public_vs_sharp(bundle: dict, out_dir: Path) -> list[Path]:
    image, draw = _canvas()
    _header(
        image,
        draw,
        title="PUBLIC VS SHARP",
        date=_date_label(bundle),
        updated=_updated_label(bundle),
    )
    markets = bundle.get("markets") or {}
    boxes = [
        (SAFE_LEFT, CONTENT_TOP, SAFE_RIGHT, 560),
        (SAFE_LEFT, 580, SAFE_RIGHT, 900),
        (SAFE_LEFT, 920, SAFE_RIGHT, CONTENT_BOTTOM),
    ]
    for box, category in zip(boxes, ("pitching", "ml", "totals")):
        _draw_market_panel(image, draw, box, category, markets.get(category) or [])
    _footer(draw, _updated_label(bundle))
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "public-vs-sharp.png"
    image.convert("RGB").save(path, quality=95)
    return [path]


def render_reports(bundle: dict, out_dir: Path, report: str = "all") -> list[Path]:
    _assert_publishable(bundle)
    paths: list[Path] = []
    if report in {"all", "morning-slate"}:
        paths.extend(render_morning_slate(bundle, out_dir))
    if report in {"all", "offensive-report"}:
        paths.extend(render_offensive_report(bundle, out_dir))
    if report in {"all", "public-vs-sharp"}:
        paths.extend(render_public_vs_sharp(bundle, out_dir))
    return paths
