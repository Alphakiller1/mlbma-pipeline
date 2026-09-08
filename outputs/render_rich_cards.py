"""
Rich Instagram/X cards from MLBMA pipeline data — logos + pitcher headshots.

Uses Playwright HTML (same visual language as chase-content-engine) so social
queue cards stop looking like flat text posters.

  python -m outputs.render_rich_cards
  python -m outputs.render_rich_cards --date 2026-07-17
"""
from __future__ import annotations

import argparse
import base64
import html
import re
import sys
import unicodedata
from datetime import date as date_cls
from pathlib import Path

import pandas as pd

from core.config import CHASE_ANALYTICS_DOMAIN, PROJECT_ROOT
from outputs.push_instagram import _fmt_score, _read_csv

# Reuse content-engine asset helpers when available
CONTENT_ENGINE = Path(r"C:\Users\chase\chase-content-engine")
if str(CONTENT_ENGINE) not in sys.path:
    sys.path.insert(0, str(CONTENT_ENGINE))

from chase_content import assets  # noqa: E402

CARDS_DIR = PROJECT_ROOT / "outputs" / "social_queue" / "cards"
W, H = 1080, 1350
DISCLAIMER = "Model-generated research. Not betting advice. 21+."


def _esc(v) -> str:
    return html.escape(str(v or ""), quote=True)


def _norm(s: str) -> str:
    text = unicodedata.normalize("NFD", str(s or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def _registry_ids() -> dict[str, int]:
    df = _read_csv("player_registry.csv")
    if df.empty:
        return {}
    out = {}
    name_col = next((c for c in ("full_name", "name", "Player") if c in df.columns), None)
    id_col = next((c for c in ("player_id", "mlb_id", "MLB_ID") if c in df.columns), None)
    if not name_col or not id_col:
        return {}
    for _, row in df.iterrows():
        try:
            out[_norm(row[name_col])] = int(row[id_col])
        except (TypeError, ValueError):
            continue
    return out


def _img(path: Path | None, cls: str = "") -> str:
    if path is None or not path.exists():
        return ""
    raw = path.read_bytes()
    mime = "image/jpeg" if raw[:3] == b"\xff\xd8\xff" else "image/png"
    b64 = base64.b64encode(raw).decode("ascii")
    c = f' class="{cls}"' if cls else ""
    return f'<img{c} src="data:{mime};base64,{b64}" alt="" />'


CSS = """
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@600;700&family=Roboto+Condensed:wght@700;800&display=swap');
html,body{margin:0;width:1080px;height:1350px;background:#08090F;color:#F5F6FA;font-family:'DM Sans',sans-serif;overflow:hidden}
body{background:radial-gradient(ellipse 70% 45% at 88% 8%,rgba(154,107,255,.14),transparent 55%),#08090F}
.wrap{padding:48px 56px 52px;height:1350px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.logo{height:40px}
.tag{color:#C4B0FF;font-weight:700;letter-spacing:.12em;font-size:14px;text-transform:uppercase}
.card{flex:1;margin-top:22px;margin-bottom:18px;background:linear-gradient(180deg,#1A1D2D,#0D101B 55%,#06070D);
border:1.5px solid rgba(154,107,255,.41);border-radius:22px;padding:32px 28px;position:relative;
box-shadow:0 12px 32px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);display:flex;flex-direction:column}
.card:before{content:'';position:absolute;left:22px;right:22px;top:0;height:2px;
background:linear-gradient(90deg,#7C4DFF,#C4B0FF,#7C4DFF)}
.title{font-family:'Roboto Condensed',sans-serif;font-weight:800;font-size:48px;margin-top:4px}
.sub{color:#A4A8B6;margin-top:10px;font-size:20px}
.row{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center;margin-top:36px}
.side{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.side img.team{width:120px;height:120px;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.abbr{font-family:'Roboto Condensed',sans-serif;font-weight:800;font-size:34px}
.at{width:56px;height:56px;border-radius:50%;background:#20232F;border:1.5px solid rgba(154,107,255,.45);
display:flex;align-items:center;justify-content:center;color:#C4B0FF;font-family:'Roboto Condensed',sans-serif;font-weight:800;font-size:20px}
.hero{font-family:'Roboto Condensed',sans-serif;font-weight:800;font-size:88px;color:#C4B0FF;text-align:center;margin-top:28px;line-height:1}
.hero-l{text-align:center;color:#A4A8B6;font-size:15px;letter-spacing:.08em;font-weight:700;text-transform:uppercase;margin-top:8px}
.pitchers{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:auto;padding-top:28px}
.p{background:rgba(14,16,24,.75);border:1px solid #262A38;border-radius:18px;padding:18px;display:flex;gap:14px;align-items:center}
.p img{width:96px;height:96px;border-radius:50%;object-fit:cover;border:2.5px solid rgba(154,107,255,.55);
box-shadow:0 0 18px rgba(154,107,255,.35);background:#151822;flex-shrink:0}
.pn{font-family:'Roboto Condensed',sans-serif;font-weight:800;font-size:24px}
.ps{color:#A4A8B6;font-size:16px;margin-top:6px;font-family:'Roboto Condensed',sans-serif;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.chip{font-size:14px;font-weight:700;font-family:'Roboto Condensed',sans-serif;padding:5px 10px;border-radius:8px;background:#20232F;border:1px solid #262A38}
.foot{flex-shrink:0;padding-top:14px;border-top:1px solid #262A38;display:flex;justify-content:space-between;font-size:13px;color:#6E7383}
.site{color:#C4B0FF;font-weight:700}
.spotlight-row{display:flex;gap:24px;align-items:center;margin-top:40px}
.metric-band{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:auto;padding-top:36px}
.metric-band .chip{text-align:center;padding:16px 10px;font-size:18px;display:flex;flex-direction:column;gap:6px}
.metric-band .chip b{font-size:28px;color:#F5F6FA;font-family:'Roboto Condensed',sans-serif}
"""


def _screenshot(doc: str, out: Path) -> Path:
    from playwright.sync_api import sync_playwright

    out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
        page.set_content(doc, wait_until="load")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(250)
        page.screenshot(path=str(out), type="png")
        browser.close()
    return out


def _shell(tag: str, title: str, body: str) -> str:
    logo = assets.data_uri(assets.chase_logo_path())
    domain = CHASE_ANALYTICS_DOMAIN.replace("https://", "")
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="wrap">
  <div class="top">{_img(assets.chase_logo_path(),'logo')}<div class="tag">{_esc(tag)}</div></div>
  {body}
  <div class="foot"><span>{_esc(DISCLAIMER)}</span><span class="site">{_esc(domain)}</span></div>
</div></body></html>""".replace(
        _img(assets.chase_logo_path(), "logo"),
        f'<img class="logo" src="{_esc(logo)}" alt="Chase Analytics" />',
        1,
    )


def render_matchup_card(date: str) -> Path | None:
    df = _read_csv("today_matchups.csv")
    if df.empty or "Lineup_Edge" not in df.columns:
        return None
    d = df.copy()
    d["_e"] = d["Lineup_Edge"].astype(str).str.extract(r"([-+]?\d+(?:\.\d+)?)")[0].astype(float).abs()
    d = d.dropna(subset=["_e"]).sort_values("_e", ascending=False)
    if d.empty:
        return None
    row = d.iloc[0]
    ids = _registry_ids()
    away, home = str(row.get("Away")), str(row.get("Home"))
    asp, hsp = str(row.get("Away_SP")), str(row.get("Home_SP"))
    away_logo = assets.team_logo_file(away)
    home_logo = assets.team_logo_file(home)
    away_shot = assets.headshot_file(ids.get(_norm(asp)))
    home_shot = assets.headshot_file(ids.get(_norm(hsp)))
    edge = str(row.get("Lineup_Edge")).strip()

    def k_chip(val):
        try:
            v = float(val)
        except (TypeError, ValueError):
            return "—"
        if v <= 1.5:
            v *= 100
        return f"{v:.1f}%"

    body = f"""
    <div class="card">
      <div class="title">{_esc(away)} @ {_esc(home)}</div>
      <div class="sub">{_esc(row.get('Time') or '')} · biggest lineup edge on the slate</div>
      <div class="row">
        <div class="side">{_img(away_logo,'team')}<div class="abbr">{_esc(away)}</div></div>
        <div class="at">@</div>
        <div class="side">{_img(home_logo,'team')}<div class="abbr">{_esc(home)}</div></div>
      </div>
      <div class="hero">{_esc(edge)}</div>
      <div class="hero-l">Lineup Edge · OSI</div>
      <div class="pitchers">
        <div class="p">{_img(away_shot)}
          <div><div class="pn">{_esc(asp)}</div>
          <div class="ps">PS {_fmt_score(row.get('Away_PitchScore'))} · OSI {_fmt_score(row.get('Away_OSI'))}</div>
          <div class="chips"><span class="chip">K% {k_chip(row.get('Away_K%'))}</span>
          <span class="chip">FIP {_fmt_score(row.get('Away_FIP'))}</span></div></div>
        </div>
        <div class="p">{_img(home_shot)}
          <div><div class="pn">{_esc(hsp)}</div>
          <div class="ps">PS {_fmt_score(row.get('Home_PitchScore'))} · OSI {_fmt_score(row.get('Home_OSI'))}</div>
          <div class="chips"><span class="chip">K% {k_chip(row.get('Home_K%'))}</span>
          <span class="chip">FIP {_fmt_score(row.get('Home_FIP'))}</span></div></div>
        </div>
      </div>
    </div>"""
    out = CARDS_DIR / f"card_{date}_matchup_of_the_day.png"
    return _screenshot(_shell("Matchup of the Day", "", body), out)


def render_pitcher_spotlight(date: str) -> Path | None:
    df = _read_csv("today_matchups.csv")
    if df.empty:
        return None
    d = df.copy()
    for col in ("Away_PitchScore", "Home_PitchScore"):
        d[col] = pd.to_numeric(d[col], errors="coerce")
    # Pick highest pitch score on slate
    best = None
    best_score = -1
    side = None
    for _, row in d.iterrows():
        for s, col in (("away", "Away_PitchScore"), ("home", "Home_PitchScore")):
            v = row.get(col)
            if pd.notna(v) and float(v) > best_score:
                best_score = float(v)
                best = row
                side = s
    if best is None:
        return None
    ids = _registry_ids()
    if side == "away":
        team, opp = str(best["Away"]), str(best["Home"])
        name, hand = str(best["Away_SP"]), str(best.get("Away_Hand") or "")
        ps, k, bb, hr9, fip = best.get("Away_PitchScore"), best.get("Away_K%"), best.get("Away_BB%"), best.get("Away_HR9"), best.get("Away_FIP")
        osi = best.get("Away_OSI")
    else:
        team, opp = str(best["Home"]), str(best["Away"])
        name, hand = str(best["Home_SP"]), str(best.get("Home_Hand") or "")
        ps, k, bb, hr9, fip = best.get("Home_PitchScore"), best.get("Home_K%"), best.get("Home_BB%"), best.get("Home_HR9"), best.get("Home_FIP")
        osi = best.get("Home_OSI")

    def pct(v):
        try:
            x = float(v)
        except (TypeError, ValueError):
            return "—"
        if x <= 1.5:
            x *= 100
        return f"{x:.1f}%"

    shot = assets.headshot_file(ids.get(_norm(name)))
    logo = assets.team_logo_file(team)
    body = f"""
    <div class="card">
      <div class="title">{_esc(name)}</div>
      <div class="sub">{_esc(team)} vs {_esc(opp)} · {_esc(best.get('Time') or '')} · {_esc(hand)}HP</div>
      <div class="spotlight-row">
        {(_img(shot) or '').replace('<img', '<img style="width:160px;height:160px;border-radius:50%;object-fit:cover;border:3px solid rgba(154,107,255,.55);box-shadow:0 0 28px rgba(154,107,255,.4)"', 1)}
        {(_img(logo,'team') or '').replace('class="team"', 'class="team" style="width:110px;height:110px"', 1)}
        <div>
          <div class="hero" style="margin:0;text-align:left;font-size:96px;">{_fmt_score(ps)}</div>
          <div class="hero-l" style="text-align:left">Pitching Score</div>
        </div>
      </div>
      <div class="metric-band">
        <div class="chip"><b>{pct(k)}</b>K%</div>
        <div class="chip"><b>{pct(bb)}</b>BB%</div>
        <div class="chip"><b>{_fmt_score(hr9)}</b>HR/9</div>
        <div class="chip"><b>{_fmt_score(fip)}</b>FIP</div>
        <div class="chip"><b>{_fmt_score(osi)}</b>Team OSI</div>
      </div>
    </div>"""
    out = CARDS_DIR / f"card_{date}_pitcher_spotlight.png"
    return _screenshot(_shell("Pitcher Spotlight", "", body), out)


def render_all(date: str | None = None) -> dict[str, Path]:
    date = date or date_cls.today().isoformat()
    out: dict[str, Path] = {}
    m = render_matchup_card(date)
    if m:
        out["matchup_of_the_day"] = m
    p = render_pitcher_spotlight(date)
    if p:
        out["pitcher_spotlight"] = p
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=None)
    args = ap.parse_args()
    paths = render_all(args.date)
    for k, p in paths.items():
        print(f"Wrote {k}: {p}")
    if not paths:
        print("No cards rendered.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
