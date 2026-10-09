"""Content intelligence: which segments to make, for which platform, and when.

The playbook (outputs/content_playbook.json) holds the platforms, pillars, recurring
segments and the sports calendar. Every segment starts from a prior per platform: a
written hypothesis, not a measurement. Logged results (from the booth's Results form,
`log`, or a platform's CSV export via `import`) replace those priors post by post, so
the roadmap shifts toward what actually works on each app.

    content intel roadmap [--start 2026-10-12] [--days 14] [--offline]
    content intel today                       episodes planned for today
    content intel brief EPISODE_ID            full brief for one episode
    content intel scores                      what the results say, per platform
    content intel log --platform tiktok --segment matchup_lab --views 5400 ...
    content intel import export.csv --platform tiktok
    content intel lint "caption text"         check copy against the compliance list
    content intel segments                    list segments, topics and priors

How a post is scored: each metric is compared to your typical post ON THAT PLATFORM (the
median of what you have logged there), as a log ratio, and weighted by the platform's
`metric_weights`. 0 = a typical post, +0.5 = about 1.6x typical. A segment's score starts
at its prior (worth `learning.prior_strength` posts) and moves toward its real results.

Run from the repo root (or through content.bat, which forwards `content intel ...`).
State lives in video/intel/ (gitignored): performance.csv, roadmap.json, roadmap.md.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

PIPELINE = Path(__file__).resolve().parents[1]
PLAYBOOK_PATH = PIPELINE / "outputs" / "content_playbook.json"
STATE = PIPELINE / "video" / "intel"
PERF_PATH = STATE / "performance.csv"
ROADMAP_JSON = STATE / "roadmap.json"
ROADMAP_MD = STATE / "roadmap.md"
TAKES = PIPELINE / "video" / "footage" / "site"
SITE = "https://chase-analytics.com"
ET = ZoneInfo("America/New_York")
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FORMATS = ("vertical", "wide")
TIMINGS = ("pregame", "postgame", "evergreen")
METRICS = ("watch_pct", "ctr", "like_rate", "comment_rate", "share_rate", "save_rate", "follow_rate")

PERF_FIELDS = [
    "logged_at", "posted_at", "platform", "segment", "topic", "sport", "episode", "take",
    "title", "url", "duration_s", "views", "impressions", "watch_pct", "ctr", "likes",
    "comments", "shares", "saves", "follows", "notes",
]
NUMERIC = ("duration_s", "views", "impressions", "watch_pct", "ctr", "likes", "comments",
           "shares", "saves", "follows")
# Nicknames that are two words: the last word alone would read "Sox" or "Jays".
TWO_WORD = ("Red Sox", "White Sox", "Blue Jays", "Golden Knights", "Maple Leafs")


class IntelError(Exception):
    """A problem the person running the command has to fix (bad input, bad playbook)."""


# ── playbook ─────────────────────────────────────────────────────────────────────

def load_playbook(path: Path = PLAYBOOK_PATH) -> dict:
    try:
        pb = json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise IntelError(f"playbook not found: {path}")
    except json.JSONDecodeError as e:
        raise IntelError(f"playbook is not valid JSON ({path}): line {e.lineno}: {e.msg}")
    problems = validate_playbook(pb)
    if problems:
        raise IntelError("playbook problems:\n  " + "\n  ".join(problems))
    return pb


def validate_playbook(pb: dict) -> list[str]:
    """Every reference resolves, every segment can be recorded in each format it claims."""
    out: list[str] = []
    plats, pillars, sports = pb.get("platforms", {}), pb.get("pillars", {}), pb.get("sports", {})
    for need in ("platforms", "pillars", "sports", "segments", "cadence", "learning"):
        if not pb.get(need):
            out.append(f"missing section '{need}'")
    for pid, p in plats.items():
        if not set(p.get("formats", [])) <= set(FORMATS) or not p.get("formats"):
            out.append(f"platform {pid}: formats must be a non-empty subset of {FORMATS}")
        w = p.get("metric_weights", {})
        if not w or not set(w) <= set(METRICS):
            out.append(f"platform {pid}: metric_weights must use {METRICS}")
        lo, hi = p.get("ideal_s", [0, 0])
        if not 0 < lo < hi:
            out.append(f"platform {pid}: ideal_s must be [low, high]")
    total = sum(float(p.get("target", 0)) for p in pillars.values())
    if pillars and abs(total - 1) > 0.01:
        out.append(f"pillar targets add to {total:.2f}, not 1.0")
    for sid, s in sports.items():
        if len(s.get("season", [])) != 2:
            out.append(f"sport {sid}: season must be [MM-DD, MM-DD]")
        if not set(s.get("days", [])) <= set(WEEKDAYS):
            out.append(f"sport {sid}: days must use {WEEKDAYS}")
    for fmt in FORMATS:
        if not set(pb.get("cadence", {}).get(fmt, {})) <= set(WEEKDAYS):
            out.append(f"cadence.{fmt} must be keyed by {WEEKDAYS}")
    for gid, g in pb.get("segments", {}).items():
        where = f"segment {gid}"
        if g.get("pillar") not in pillars:
            out.append(f"{where}: unknown pillar {g.get('pillar')!r}")
        if g.get("timing") not in TIMINGS:
            out.append(f"{where}: timing must be one of {TIMINGS}")
        if not g.get("formats") or not set(g["formats"]) <= set(FORMATS):
            out.append(f"{where}: formats must be a non-empty subset of {FORMATS}")
        for sp in g.get("sports", []):
            if sp not in sports:
                out.append(f"{where}: unknown sport {sp!r}")
        if not set(g.get("days", [])) <= set(WEEKDAYS):
            out.append(f"{where}: days must use {WEEKDAYS}")
        if g.get("timing") in ("pregame", "postgame") and not g.get("sports"):
            out.append(f"{where}: a {g['timing']} segment needs sports")
        for pid, prior in g.get("priors", {}).items():
            if pid not in plats:
                out.append(f"{where}: prior for unknown platform {pid!r}")
            elif not set(plats[pid]["formats"]) & set(g.get("formats", [])):
                out.append(f"{where}: {pid} takes none of the segment's formats")
            if not (isinstance(prior, (int, float)) and 1 <= prior <= 5):
                out.append(f"{where}: prior for {pid} must be 1-5")
        for fmt in g.get("formats", []):
            if not g.get("beats", {}).get(fmt):
                out.append(f"{where}: no {fmt} beats")
            if not g.get("length_s", {}).get(fmt):
                out.append(f"{where}: no length_s for {fmt}")
            if not any(fmt in plats[p]["formats"] for p in g.get("priors", {}) if p in plats):
                out.append(f"{where}: no platform with a prior takes {fmt}")
        copy = " ".join([*g.get("hooks", []), g.get("caption", ""), g.get("x_text", "")])
        if re.search(r"\{topic(_hook)?\}", copy) and not g.get("topics"):
            out.append(f"{where}: copy uses {{topic}} but the segment has no topics")
        if not g.get("tag", "").startswith("#"):
            out.append(f"{where}: tag must be a hashtag (it is how imports find the segment)")
    tags = [g.get("tag", "").lower() for g in pb.get("segments", {}).values()]
    if len(tags) != len(set(tags)):
        out.append("segment tags must be unique")
    return out


# ── calendar ─────────────────────────────────────────────────────────────────────

def _in_window(d: date, start: str, end: str) -> bool:
    """MM-DD window, inclusive, which may wrap over New Year (NFL: 09-08 to 02-15)."""
    md = d.strftime("%m-%d")
    return start <= md <= end if start <= end else (md >= start or md <= end)


def sport_state(pb: dict, sport: str, d: date) -> dict | None:
    """In season on `d`? Returns its weight (raised during a tentpole) and the tentpole name."""
    s = pb["sports"][sport]
    if not _in_window(d, *s["season"]):
        return None
    tent = next((t[2] for t in s.get("tentpoles", []) if _in_window(d, t[0], t[1])), None)
    return {"weight": float(s["weight"]) * (1.15 if tent else 1.0), "tentpole": tent}


def plays_on(pb: dict, sport: str, d: date, slates: dict) -> bool:
    """Games that day: the published slate when it covers the date, else the calendar."""
    games = slates.get(sport, {}).get("games", [])
    covered = {g["et_date"] for g in games}
    if d.isoformat() in covered:
        return True
    if covered and min(covered) <= d.isoformat() <= max(covered):
        return False  # inside the slate's range and nothing that day
    return sport_state(pb, sport, d) is not None and WEEKDAYS[d.weekday()] in pb["sports"][sport]["days"]


# ── slates ───────────────────────────────────────────────────────────────────────

def _nickname(full: str, sport: str) -> str:
    if not full or sport not in ("nfl", "mlb", "nba", "wnba"):
        return full
    for two in TWO_WORD:
        if full.endswith(two):
            return two
    return full.split()[-1]


def _game_interest(g: dict, sport: str) -> float:
    """Which games to build timely episodes around: national windows, good teams, playoffs."""
    score = 1.0
    if g["et_hour"] is not None and g["et_hour"] >= 19.5:
        score += 0.6
    if re.search(r"\b(ESPN|ABC|NBC|CBS|FOX|Prime|Netflix|TBS|TNT|Peacock)\b", g.get("broadcast") or "", re.I):
        score += 0.4
    for side in ("away_record", "home_record"):
        m = re.match(r"(\d+)-(\d+)", g.get(side) or "")
        if m and int(m[1]) + int(m[2]):
            score += 0.5 * int(m[1]) / (int(m[1]) + int(m[2]))
    return round(score, 3)


def normalize_game(raw: dict, sport: str) -> dict | None:
    kick = raw.get("kickoff_utc")
    if not kick or not raw.get("away") or not raw.get("home"):
        return None
    try:
        utc = datetime.fromisoformat(kick.replace("Z", "+00:00"))
    except ValueError:
        return None
    if utc.tzinfo is None:
        utc = utc.replace(tzinfo=timezone.utc)
    local = utc.astimezone(ET)
    g = {
        "id": str(raw.get("id")),
        "sport": sport,
        "away": raw["away"],
        "home": raw["home"],
        "away_name": _nickname(raw.get("away_name") or raw["away"], sport),
        "home_name": _nickname(raw.get("home_name") or raw["home"], sport),
        "kickoff_utc": utc.isoformat().replace("+00:00", "Z"),
        "et_date": local.date().isoformat(),
        "et_hour": local.hour + local.minute / 60,
        "state": raw.get("game_state") or "",
        "broadcast": raw.get("broadcast") or "",
        "away_record": raw.get("away_record") or "",
        "home_record": raw.get("home_record") or "",
    }
    # The id alone is not enough: CFB pages list the model board's games (keyed by school
    # names), and MLB pages open on the browser's date. away/home is the page's own
    # fallback match, and date pins an MLB game to its day.
    q = {"game": g["id"], "away": g["away"], "home": g["home"]}
    if sport == "mlb":
        q["date"] = g["et_date"]
    g["url"] = f"/{sport}/matchup.html?" + urllib.parse.urlencode(q, safe="@")
    g["interest"] = _game_interest(g, sport)
    return g


def load_slates(pb: dict, offline: bool = False, timeout: float = 8.0) -> dict:
    """The site's published slates (live first, the repo copy as fallback) for site sports."""
    out: dict = {}
    for sport, cfg in pb["sports"].items():
        if not cfg.get("site"):
            continue
        data, source = None, ""
        if not offline:
            try:
                req = urllib.request.Request(f"{SITE}/data/public/{sport}/slate.json",
                                             headers={"User-Agent": "chase-content-intel"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    data, source = json.loads(r.read().decode("utf-8")), "live site"
            except Exception:
                data = None
        if data is None:
            local = PIPELINE / "data" / "public" / sport / "slate.json"
            if local.exists():
                try:
                    data, source = json.loads(local.read_text(encoding="utf-8")), "repo copy"
                except json.JSONDecodeError:
                    data = None
        if not data:
            continue
        games = [g for g in (normalize_game(x, sport) for x in data.get("games", [])) if g]
        out[sport] = {"games": games, "source": source, "generated_at": data.get("generated_at_utc", "")}
    return out


# ── performance log ──────────────────────────────────────────────────────────────

def _num(v) -> float | None:
    """'1,234' / '45%' / '1.2K' / '0:45' / '' -> float or None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if math.isfinite(v) else None
    s = str(v).strip().replace(",", "").replace("%", "")
    if not s or s in ("-", "--", "N/A", "n/a"):
        return None
    m = re.fullmatch(r"(\d+):(\d{1,2})(?::(\d{1,2}))?", s)
    if m:
        parts = [int(x) for x in m.groups() if x is not None]
        return float(parts[0] * 60 + parts[1]) if len(parts) == 2 else float(parts[0] * 3600 + parts[1] * 60 + parts[2])
    mult = {"k": 1e3, "m": 1e6, "b": 1e9}.get(s[-1].lower())
    try:
        return float(s[:-1]) * mult if mult else float(s)
    except ValueError:
        return None


def read_perf(path: Path = PERF_PATH) -> list[dict]:
    if not Path(path).exists():
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for k in NUMERIC:
                r[k] = _num(r.get(k))
            rows.append(r)
    return rows


def _row_key(r: dict) -> tuple:
    """Same post logged again (updated stats) replaces the old row."""
    ident = r.get("url") or r.get("take") or r.get("episode")
    if ident:
        return (r["platform"], "id", ident)
    return (r["platform"], "text", r.get("posted_at") or "", (r.get("title") or "")[:60], r.get("segment") or "")


def validate_row(pb: dict, r: dict) -> dict:
    row = {k: r.get(k) for k in PERF_FIELDS}
    if row["platform"] not in pb["platforms"]:
        raise IntelError(f"unknown platform {row['platform']!r} (use {', '.join(pb['platforms'])})")
    if row["segment"] not in pb["segments"]:
        raise IntelError(f"unknown segment {row['segment']!r} (use {', '.join(pb['segments'])})")
    for k in NUMERIC:
        row[k] = _num(row.get(k))
        if row[k] is not None and row[k] < 0:
            raise IntelError(f"{k} cannot be negative")
    for k in ("watch_pct", "ctr"):
        if row[k] is not None and row[k] > 100:
            raise IntelError(f"{k} is a percentage (0-100), got {row[k]}")
    base = row["impressions"] if pb["platforms"][row["platform"]].get("base") == "impressions" and row["impressions"] else row["views"]
    if not base and row["watch_pct"] is None:
        raise IntelError("log at least views (or impressions on X) or watch_pct")
    if row["impressions"] and row["views"] and row["views"] > row["impressions"] * 1.05 and row["platform"] != "youtube":
        raise IntelError("views exceed impressions - the two columns look swapped")
    for k in ("likes", "comments", "shares", "saves", "follows"):
        if base and row[k] is not None and row[k] > base * 1.05:
            raise IntelError(f"{k} ({row[k]:g}) is more than the {'impressions' if base == row['impressions'] else 'views'} ({base:g})")
    row["logged_at"] = row.get("logged_at") or datetime.now().isoformat(timespec="seconds")
    return row


def write_perf(rows: list[dict], path: Path = PERF_PATH) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(path).with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=PERF_FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else (f"{r[k]:g}" if isinstance(r.get(k), float) else r[k])) for k in PERF_FIELDS})
    tmp.replace(path)


def upsert_perf(new_rows: list[dict], path: Path = PERF_PATH) -> tuple[int, int]:
    """Add rows; a row for a post already logged replaces it. Returns (added, updated)."""
    rows = read_perf(path)
    index = {_row_key(r): i for i, r in enumerate(rows)}
    added = updated = 0
    for r in new_rows:
        k = _row_key(r)
        if k in index:
            rows[index[k]] = r
            updated += 1
        else:
            index[k] = len(rows)
            rows.append(r)
            added += 1
    write_perf(rows, path)
    return added, updated


def take_info(name: str) -> dict:
    """What the booth wrote about a take: its episode, segment, topic, sport and length."""
    f = TAKES / f"{name}.json"
    if not re.fullmatch(r"[\w.-]{1,80}", name or "") or not f.exists():
        raise IntelError(f"no booth take named {name!r} in {TAKES}")
    body = json.loads(f.read_text(encoding="utf-8"))
    ep = body.get("episode") or {}
    return {"take": name, "episode": ep.get("id"), "segment": ep.get("segment"), "topic": ep.get("topic"),
            "sport": ep.get("sport"), "duration_s": body.get("duration")}


# ── scoring ──────────────────────────────────────────────────────────────────────

def post_metrics(row: dict, plat: dict) -> dict:
    base = row.get("impressions") if plat.get("base") == "impressions" and row.get("impressions") else row.get("views")
    m: dict = {}
    if row.get("watch_pct") is not None:
        m["watch_pct"] = row["watch_pct"]
    if row.get("ctr") is not None:
        m["ctr"] = row["ctr"]
    if base:
        for metric, col in (("like_rate", "likes"), ("comment_rate", "comments"), ("share_rate", "shares"),
                            ("save_rate", "saves"), ("follow_rate", "follows")):
            if row.get(col) is not None:
                m[metric] = row[col] / base
    return m


def post_lifts(pb: dict, rows: list[dict]) -> list[float | None]:
    """Each post's lift over the typical post on its own platform (None = nothing to score)."""
    by_plat: dict = {}
    mets = []
    for r in rows:
        plat = pb["platforms"].get(r.get("platform"))
        m = post_metrics(r, plat) if plat else {}
        mets.append(m)
        for k, v in m.items():
            by_plat.setdefault(r["platform"], {}).setdefault(k, []).append(v)
    medians = {p: {k: statistics.median(v) for k, v in ms.items() if len(v) >= 2} for p, ms in by_plat.items()}
    out: list[float | None] = []
    for r, m in zip(rows, mets):
        plat = pb["platforms"].get(r.get("platform"))
        if not plat:
            out.append(None)
            continue
        num = den = 0.0
        for k, w in plat["metric_weights"].items():
            if k not in m or k not in medians.get(r["platform"], {}):
                continue
            base = medians[r["platform"]][k]
            eps = 0.05 * base + 1e-4
            num += w * max(-2.0, min(2.0, math.log((m[k] + eps) / (base + eps))))
            den += w
        out.append(num / den if den else None)
    return out


def segment_scores(pb: dict, rows: list[dict]) -> dict:
    """{segment: {platform: {prior, n, mean, score, explore, dropped}}} for every prior."""
    L = pb["learning"]
    k, step, explore = float(L["prior_strength"]), float(L["prior_step"]), float(L["explore"])
    seen: dict = {}
    for r, lift in zip(rows, post_lifts(pb, rows)):
        if lift is not None:
            seen.setdefault((r.get("segment"), r.get("platform")), []).append(lift)
    out: dict = {}
    for gid, g in pb["segments"].items():
        for pid, prior in g.get("priors", {}).items():
            lifts = seen.get((gid, pid), [])
            n = len(lifts)
            prior_lift = (float(prior) - 3) * step
            score = (k * prior_lift + sum(lifts)) / (k + n)
            dropped = prior <= 1 or (n >= L["drop_after"] and score < L["drop_below"])
            out.setdefault(gid, {})[pid] = {
                "prior": prior, "n": n, "mean": round(sum(lifts) / n, 3) if n else None,
                "score": round(score, 3), "explore": round(score + explore / math.sqrt(n + 1), 3),
                "dropped": dropped,
            }
    return out


# ── roadmap ──────────────────────────────────────────────────────────────────────

class _Fill(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def fill(text: str, ctx: dict) -> str:
    return text.format_map(_Fill(ctx)) if text else ""


def lint(pb: dict, text: str) -> list[str]:
    """Compliance problems in one piece of copy."""
    low = (text or "").lower()
    probs = []
    for level in ("never", "platform_risk"):
        for phrase in pb.get("compliance", {}).get(level, []):
            if re.search(r"(?<![a-z])" + re.escape(phrase.lower()) + r"(?![a-z])", low):
                probs.append(f"{level}: '{phrase}'")
    return probs


def _when_label(d: date) -> str:
    return d.strftime("%A")


def _platform_kit(pb: dict, g: dict, fmt: str, pid: str, ctx: dict, target_s: int) -> dict:
    p = pb["platforms"][pid]
    lo, hi = p["ideal_s"]
    sport_tags = pb["sports"][ctx["sport_id"]]["tags"] if ctx.get("sport_id") else []
    tags = [g["tag"], *sport_tags, *pb["pillars"][g["pillar"]].get("tags", [])][: max(1, int(p.get("hashtags", 3)))]
    caption = fill(g.get("caption", ""), ctx)
    disclaimer = pb.get("disclaimer", "")
    body = f"{caption} {disclaimer}".strip() if disclaimer else caption
    full = f"{body} {' '.join(tags)}".strip()
    if len(full) > p.get("caption_chars", 2200):
        full = full[: p["caption_chars"] - 1].rstrip() + "…"
    kit = {
        "label": p["label"],
        "length_s": [lo, hi],
        "cut_note": (f"cut to {hi}s or less for {p['label']}" if target_s > hi
                     else f"{p['label']} rewards {lo}s+; fine short if it loops" if target_s < lo else ""),
        "hook_s": p["hook_s"],
        "post_window_et": p.get("post_windows_et", []),
        "caption": full,
        "hashtags": tags,
        "packaging": p.get("packaging", ""),
    }
    if pid == "x":
        kit["post_text"] = f"{fill(g.get('x_text', ''), ctx)} {tags[0]}".strip()[:280]
    if pid in ("youtube", "shorts"):
        hook, cap = ctx.get("hook", ""), int(p.get("title_chars", 70))
        kit["title"] = hook if len(hook) <= cap else hook[: cap - 1].rsplit(" ", 1)[0].rstrip(" ,.:;") + "…"
    return kit


def _beats(g: dict, fmt: str, ctx: dict, games: list[dict]) -> list[dict]:
    out, t = [], 0
    gi = 0
    for b in g["beats"][fmt]:
        beat = {"label": b["label"], "at_s": t, "s": int(b["s"]), "cue": fill(b.get("cue", ""), ctx)}
        if b.get("action"):
            beat["action"] = b["action"]
        # The rundown's "Game N" beats name the game and carry its page.
        m = re.fullmatch(r"Game (\d+)", b["label"])
        if m and games:
            i = int(m[1]) - 1
            if i < len(games):
                x = games[i]
                beat["label"] = f"{x['away_name']} at {x['home_name']}"
                beat["page"] = x["url"]
            else:
                continue
            gi += 1
        out.append(beat)
        t += int(b["s"])
    return out


def _pages(g: dict, sport: str | None, games: list[dict], pb: dict) -> list[str]:
    pages: list[str] = []
    for p in g.get("pages", []):
        if p == "{matchup}":
            pages += [games[0]["url"]] if games else []
        elif p == "{matchups}":
            pages += [x["url"] for x in games]
        elif p == "{sport_home}":
            if sport and pb["sports"][sport].get("site"):
                pages.append(f"/{sport}/")
        else:
            pages.append(p)
    seen: set = set()
    return [p for p in pages if not (p in seen or seen.add(p))]


def build_roadmap(pb: dict, start: date, days: int, slates: dict, rows: list[dict]) -> dict:
    """A dated plan of recordings. Deterministic: same inputs, same plan."""
    scores = segment_scores(pb, rows)
    topic_use: dict = {}
    for r in rows:
        if r.get("topic"):
            topic_use[(r.get("segment"), r["topic"])] = topic_use.get((r.get("segment"), r["topic"]), 0) + 1
    last_used: dict = {}  # (segment, format) -> date
    pillar_count = {p: 0 for p in pb["pillars"]}
    used_games: set = set()
    episodes: list[dict] = []
    notes: list[str] = []

    for off in range(days):
        d = start + timedelta(days=off)
        wd = WEEKDAYS[d.weekday()]
        live = {s: st for s in pb["sports"] if (st := sport_state(pb, s, d))}
        day_segments: set = set()
        for fmt in FORMATS:
            for slot in range(int(pb["cadence"].get(fmt, {}).get(wd, 0))):
                best = None
                for gid, g in pb["segments"].items():
                    if fmt not in g["formats"] or (gid, fmt) in day_segments:
                        continue
                    targets = [p for p, s in scores[gid].items()
                               if fmt in pb["platforms"][p]["formats"] and not s["dropped"]]
                    if not targets:
                        continue
                    if g.get("days") and wd not in g["days"]:
                        continue
                    last = last_used.get((gid, fmt))
                    if last is not None and (d - last).days <= int(g.get("gap_days", 0)) and g.get("gap_days", 0):
                        continue
                    for sport, games in _sport_options(pb, g, fmt, d, live, slates, used_games):
                        w = sum(pb["platforms"][p]["weight"] for p in targets)
                        perf = sum(pb["platforms"][p]["weight"] * scores[gid][p]["explore"] for p in targets) / w
                        total = sum(pillar_count.values())
                        share = pillar_count[g["pillar"]] / total if total else 0.0
                        pillar_bonus = 1.0 * (float(pb["pillars"][g["pillar"]]["target"]) - share)
                        sport_bonus = 0.4 * (live[sport]["weight"] - 0.7) if sport else 0.0
                        tent_bonus = 0.05 if sport and live[sport]["tentpole"] else 0.0
                        # A real game on the slate beats a slot whose game is not known yet.
                        ready = 0.1 if games else 0.0
                        score = round(perf + pillar_bonus + sport_bonus + tent_bonus + ready, 4)
                        key = (score, gid, sport or "")
                        if best is None or key > best[0]:
                            best = (key, gid, sport, games, targets, {
                                "performance": round(perf, 3), "pillar_mix": round(pillar_bonus, 3),
                                "sport": round(sport_bonus, 3), "tentpole": tent_bonus, "game_ready": ready})
                if best is None:
                    notes.append(f"{d} {fmt} slot {slot + 1}: nothing fit (check cadence, gaps and the calendar)")
                    continue
                _, gid, sport, games, targets, parts = best
                g = pb["segments"][gid]
                ep = _episode(pb, g, gid, d, fmt, slot, sport, games, targets, scores, topic_use, live, parts)
                episodes.append(ep)
                last_used[(gid, fmt)] = d
                day_segments.add((gid, fmt))
                pillar_count[g["pillar"]] += 1
                for x in games:
                    used_games.add((fmt, x["sport"], x["id"]))
                if ep.get("topic"):
                    k = (gid, ep["topic"]["id"])
                    topic_use[k] = topic_use.get(k, 0) + 1

    mix = {p: round(c / max(1, len(episodes)), 2) for p, c in pillar_count.items()}
    return {
        "schema": "content-intel/roadmap/1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "playbook_version": pb.get("version"),
        "start": start.isoformat(),
        "days": days,
        "posts_logged": len(rows),
        "slates": {s: {"source": v["source"], "generated_at": v["generated_at"], "games": len(v["games"])} for s, v in slates.items()},
        "pillar_mix": mix,
        "pillar_targets": {p: v["target"] for p, v in pb["pillars"].items()},
        "notes": notes,
        "episodes": episodes,
    }


def _sport_options(pb, g, fmt, d, live, slates, used_games):
    """(sport, games) choices for one segment on one day. Evergreen ones get (None, [])."""
    if g["timing"] == "evergreen":
        return [(None, [])]
    opts = []
    for sport in g.get("sports", []):
        if sport not in live:
            continue
        if g["timing"] == "postgame":
            if plays_on(pb, sport, d - timedelta(days=1), slates):
                opts.append((sport, []))
            continue
        # Pregame: a vertical clip posts on game day; the long-form rundown goes up the
        # evening before (or the morning of, for a daily sport).
        day = d + timedelta(days=1) if fmt == "wide" and plays_on(pb, sport, d + timedelta(days=1), slates) else d
        if not plays_on(pb, sport, day, slates):
            continue
        pool = [x for x in slates.get(sport, {}).get("games", [])
                if x["et_date"] == day.isoformat() and (fmt, sport, x["id"]) not in used_games]
        pool.sort(key=lambda x: (-x["interest"], x["kickoff_utc"], x["id"]))
        want = 4 if "{matchups}" in g.get("pages", []) else 1
        if pool:
            opts.append((sport, pool[:want]))
        elif not slates.get(sport, {}).get("games") or day.isoformat() > max(x["et_date"] for x in slates[sport]["games"]):
            # Beyond the published slate: plan the slot, pick the game when the slate posts.
            opts.append((sport, []))
    return opts


def _episode(pb, g, gid, d, fmt, slot, sport, games, targets, scores, topic_use, live, parts) -> dict:
    topic = None
    if g.get("topics"):
        topic = min(g["topics"], key=lambda t: (topic_use.get((gid, t["id"]), 0), g["topics"].index(t)))
    sport_label = pb["sports"][sport]["label"] if sport else ""
    top_live = max(live, key=lambda s: live[s]["weight"]) if live else None
    first = games[0] if games else None
    ctx = {
        "sport_id": sport,
        "sport": sport_label or (pb["sports"][top_live]["label"] if top_live else ""),
        "when": _when_label(d + timedelta(days=1) if fmt == "wide" and g["timing"] == "pregame" and not games
                            else date.fromisoformat(first["et_date"]) if first
                            else d - timedelta(days=1) if g["timing"] == "postgame" else d),
        "away": first["away_name"] if first else "[away]",
        "home": first["home_name"] if first else "[home]",
        "game": f"{first['away_name']} at {first['home_name']}" if first else "",
        "topic": topic["title"] if topic else "",
        "topic_hook": topic["hook"] if topic else "",
        "topic_or_sport": topic["title"] if topic else (sport_label or "betting"),
    }
    hooks = [fill(h, ctx) for h in g.get("hooks", [])]
    ctx["hook"] = hooks[0] if hooks else g["name"]
    target_s = int(g["length_s"][fmt])
    beats = _beats(g, fmt, ctx, games)
    kits = {p: _platform_kit(pb, g, fmt, p, ctx, target_s) for p in targets}
    copy = [*hooks, *(k["caption"] for k in kits.values()), *(k.get("post_text", "") for k in kits.values())]
    problems = sorted({p for c in copy for p in lint(pb, c)})
    need_game = g["timing"] == "pregame" and not games
    return {
        "id": f"{d:%Y%m%d}-{fmt[0]}{slot + 1}-{gid}",
        "date": d.isoformat(),
        "weekday": WEEKDAYS[d.weekday()],
        "format": fmt,
        "aspect": "vertical" if fmt == "vertical" else "wide",
        "segment": gid,
        "name": g["name"],
        "tag": g["tag"],
        "pillar": g["pillar"],
        "pillar_label": pb["pillars"][g["pillar"]]["label"],
        "timing": g["timing"],
        "sport": sport,
        "sport_label": sport_label,
        "tentpole": live.get(sport, {}).get("tentpole") if sport else None,
        "games": games,
        "topic": topic,
        "title": ((f"{g['name']}: {ctx['game']}" if len(games) == 1 else f"{g['name']}: {ctx['topic']}" if topic
                   else f"{g['name']}: {ctx['sport']} {ctx['when']}" if sport else g["name"])),
        "target_s": target_s,
        "hooks": hooks,
        "beats": beats,
        "pages": _pages(g, sport, games, pb),
        "platforms": kits,
        "why": {"segment": g.get("why", ""), "parts": parts,
                "scores": {p: scores[gid][p] for p in targets}},
        "todo": (["pick the game once the slate is published (content intel roadmap)"] if need_game else []),
        "compliance": problems,
    }


# ── rendering ────────────────────────────────────────────────────────────────────

def _clock(s: float) -> str:
    s = int(round(s))
    return f"{s // 60}:{s % 60:02d}"


def roadmap_md(rm: dict) -> str:
    lines = [f"# Content roadmap: {rm['start']} (+{rm['days']} days)", "",
             f"Generated {rm['generated_at']} from playbook {rm['playbook_version']}, "
             f"{rm['posts_logged']} logged posts.", ""]
    if rm["slates"]:
        lines.append("Slates: " + ", ".join(f"{s.upper()} {v['games']} games ({v['source']})" for s, v in rm["slates"].items()))
        lines.append("")
    lines.append("Pillar mix (planned / target): " + ", ".join(
        f"{p} {rm['pillar_mix'][p]:.0%}/{rm['pillar_targets'][p]:.0%}" for p in rm["pillar_mix"]))
    lines.append("")
    day = None
    for e in rm["episodes"]:
        if e["date"] != day:
            day = e["date"]
            lines += ["", f"## {e['weekday']} {e['date']}", ""]
        plats = ", ".join(k["label"] for k in e["platforms"].values())
        sport = f" · {e['sport_label']}" if e["sport_label"] else ""
        tent = f" · {e['tentpole']}" if e.get("tentpole") else ""
        lines.append(f"- **{e['title']}** ({'9:16' if e['format'] == 'vertical' else '16:9'}, ~{_clock(e['target_s'])}){sport}{tent} → {plats}")
        if e["hooks"]:
            lines.append(f"  - Hook: \"{e['hooks'][0]}\"")
        if e["pages"]:
            lines.append(f"  - Booth pages: {' '.join(e['pages'])}")
        for t in e["todo"]:
            lines.append(f"  - TODO: {t}")
        for c in e["compliance"]:
            lines.append(f"  - COMPLIANCE: {c}")
        lines.append(f"  - `content intel brief {e['id']}`")
    if rm["notes"]:
        lines += ["", "## Notes", *[f"- {n}" for n in rm["notes"]]]
    return "\n".join(lines) + "\n"


def brief_md(e: dict) -> str:
    out = [f"# {e['title']}", "",
           f"{e['weekday']} {e['date']} · {e['name']} ({e['pillar_label']}) · "
           f"{'9:16 vertical' if e['format'] == 'vertical' else '16:9 wide'} · target {_clock(e['target_s'])}"
           + (f" · {e['sport_label']}" if e["sport_label"] else "") + (f" · {e['tentpole']}" if e.get("tentpole") else ""),
           "", f"Why: {e['why']['segment']}", ""]
    if e["games"]:
        out.append("Games: " + "; ".join(f"{g['away_name']} at {g['home_name']} ({g['url']})" for g in e["games"]))
        out.append("")
    out += ["## Hooks", *[f"- {h}" for h in e["hooks"]], "", "## Run of show"]
    for b in e["beats"]:
        act = f" [{b['action']}]" if b.get("action") else ""
        page = f" → {b['page']}" if b.get("page") else ""
        out.append(f"- {_clock(b['at_s'])} **{b['label']}** ({b['s']}s){act}{page}: {b['cue']}")
    out += ["", "## Booth pages", *([f"- {p}" for p in e["pages"]] or ["- (any)"]), "", "## Per platform"]
    for pid, k in e["platforms"].items():
        out += ["", f"### {k['label']}", f"- Length: {k['length_s'][0]}-{k['length_s'][1]}s"
                + (f" ({k['cut_note']})" if k["cut_note"] else "") + f"; land the hook by {k['hook_s']}s",
                f"- Post: {', '.join(k['post_window_et'])} ET"]
        if k.get("title"):
            out.append(f"- Title: {k['title']}")
        out.append(f"- Caption: {k['caption']}")
        if k.get("post_text"):
            out.append(f"- Post text: {k['post_text']}")
        out.append(f"- {k['packaging']}")
        s = e["why"]["scores"][pid]
        out.append(f"- Score here: {s['score']:+.2f} from {s['n']} logged post(s) (prior {s['prior']}/5)")
    for t in e["todo"]:
        out.append(f"\nTODO: {t}")
    for c in e["compliance"]:
        out.append(f"\nCOMPLIANCE: {c}")
    return "\n".join(out) + "\n"


def scores_report(pb: dict, rows: list[dict]) -> str:
    sc = segment_scores(pb, rows)
    lifts = post_lifts(pb, rows)
    out = [f"{len(rows)} logged posts. Score = lift over your typical post on that platform "
           f"(0 typical, +0.5 about 1.6x). n = posts behind it; with few posts it is mostly the prior.", ""]
    for pid, p in pb["platforms"].items():
        items = [(gid, s[pid]) for gid, s in sc.items() if pid in s]
        if not items:
            continue
        out.append(f"{p['label']}:")
        for gid, s in sorted(items, key=lambda x: -x[1]["score"]):
            flag = "  DROPPED" if s["dropped"] else ("  needs data" if s["n"] < 3 else "")
            mean = f"{s['mean']:+.2f}" if s["mean"] is not None else "  -  "
            out.append(f"  {pb['segments'][gid]['name']:<16} score {s['score']:+.2f}  n={s['n']:<3} "
                       f"your avg {mean}  prior {s['prior']}/5{flag}")
        buckets: dict = {}
        for r, lift in zip(rows, lifts):
            if r.get("platform") == pid and lift is not None and r.get("duration_s"):
                b = next(lbl for lim, lbl in ((30, "<30s"), (60, "30-60s"), (120, "1-2 min"), (600, "2-10 min"), (1e9, "10 min+"))
                         if r["duration_s"] < lim)
                buckets.setdefault(b, []).append(lift)
        if buckets:
            out.append("  by length: " + ", ".join(f"{b} {sum(v) / len(v):+.2f} (n={len(v)})" for b, v in buckets.items()))
        hours: dict = {}
        for r, lift in zip(rows, lifts):
            m = re.search(r"[T ](\d{1,2}):", r.get("posted_at") or "")
            if r.get("platform") == pid and lift is not None and m:
                h = int(m[1])
                hours.setdefault("morning" if h < 12 else "afternoon" if h < 17 else "evening" if h < 22 else "late", []).append(lift)
        if hours:
            out.append("  by post time: " + ", ".join(f"{b} {sum(v) / len(v):+.2f} (n={len(v)})" for b, v in hours.items()))
        out.append("")
    return "\n".join(out)


# ── import ───────────────────────────────────────────────────────────────────────

ALIASES = {
    "views": ["views", "video views", "plays", "total views", "total play", "video plays"],
    "impressions": ["impressions"],
    "likes": ["likes", "like", "hearts"],
    "comments": ["comments", "replies"],
    "shares": ["shares", "reposts", "retweets", "quotes", "quote posts"],
    "saves": ["saves", "favorites", "bookmarks", "add to favorites"],
    "follows": ["follows", "new followers", "followers gained", "subscribers", "subscribers gained", "profile follows"],
    "watch_pct": ["average percentage viewed (%)", "average percentage viewed", "average view percentage",
                  "avg watch %", "watched full video (%)", "watched full video", "completion rate", "finish rate"],
    "ctr": ["impressions click-through rate (%)", "impressions click-through rate", "click-through rate", "ctr"],
    "duration_s": ["duration", "duration (s)", "video duration", "length"],
    "posted_at": ["date", "post time", "posted", "publish time", "video publish time", "time", "created"],
    "url": ["url", "link", "post link", "video link", "permalink", "tweet permalink"],
    "title": ["title", "video title", "caption", "description", "post text", "text", "tweet text", "content", "video description"],
    "segment": ["segment", "series"],
    "topic": ["topic"],
    "sport": ["sport"],
}
SUMMED = {"shares", "comments"}  # X splits reposts/quotes; both count


def _norm(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").strip().lower().lstrip("﻿"))


def map_columns(headers: list[str]) -> dict:
    """field -> [header,...] using the alias list. Exact alias match only, so 'Likes' never
    lands in 'Profile likes'."""
    normed = {_norm(h): h for h in headers}
    found: dict = {}
    for field, names in ALIASES.items():
        hits = [normed[n] for n in names if n in normed]
        if hits:
            found[field] = hits if field in SUMMED else hits[:1]
    return found


def import_rows(pb: dict, path: Path, platform: str, default_segment: str | None = None) -> tuple[list[dict], list[str]]:
    if platform not in pb["platforms"]:
        raise IntelError(f"unknown platform {platform!r}")
    tags = {g["tag"].lower(): gid for gid, g in pb["segments"].items()}
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = map_columns(reader.fieldnames or [])
        if not ({"views", "impressions", "watch_pct"} & set(cols)):
            raise IntelError(f"no views/impressions/watch-% column found. Headers: {reader.fieldnames}")
        rows, skipped = [], []
        for i, raw in enumerate(reader, start=2):
            r: dict = {"platform": platform}
            for field, heads in cols.items():
                if field in SUMMED or field in NUMERIC:
                    vals = [_num(raw.get(h)) for h in heads]
                    vals = [v for v in vals if v is not None]
                    r[field] = sum(vals) if vals else None
                else:
                    r[field] = (raw.get(heads[0]) or "").strip()
            seg = r.get("segment")
            if seg and seg not in pb["segments"]:
                seg = tags.get(seg.lower()) or tags.get("#" + seg.lower().lstrip("#"))
            if not seg:
                text = (r.get("title") or "").lower()
                seg = next((gid for t, gid in tags.items() if re.search(re.escape(t) + r"(?![a-z0-9_])", text)), None)
            seg = seg or default_segment
            if not seg:
                skipped.append(f"line {i}: no segment (no series hashtag in the title/caption; pass --segment)")
                continue
            r["segment"] = seg
            try:
                rows.append(validate_row(pb, r))
            except IntelError as e:
                skipped.append(f"line {i}: {e}")
    return rows, skipped


# ── CLI ──────────────────────────────────────────────────────────────────────────

def _read_roadmap() -> dict:
    if not ROADMAP_JSON.exists():
        raise IntelError("no roadmap yet - run: content intel roadmap")
    return json.loads(ROADMAP_JSON.read_text(encoding="utf-8"))


def write_roadmap(rm: dict) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    tmp = ROADMAP_JSON.with_suffix(".tmp")
    tmp.write_text(json.dumps(rm, indent=2), encoding="utf-8")
    tmp.replace(ROADMAP_JSON)
    ROADMAP_MD.write_text(roadmap_md(rm), encoding="utf-8")


def _out(text: str) -> None:
    sys.stdout.buffer.write(text.encode("utf-8", "replace"))
    sys.stdout.flush()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="content intel", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("roadmap", help="plan the next N days")
    r.add_argument("--start", default=date.today().isoformat())
    r.add_argument("--days", type=int, default=14)
    r.add_argument("--offline", action="store_true", help="use the repo's slate copies, no network")
    r.add_argument("--quiet", action="store_true")
    sub.add_parser("today", help="episodes planned for today")
    b = sub.add_parser("brief", help="the full brief for one episode")
    b.add_argument("episode")
    sub.add_parser("scores", help="what the results say")
    sub.add_parser("segments", help="list segments, topics and priors")
    lg = sub.add_parser("log", help="log one post's results")
    lg.add_argument("--json", help="a JSON object with the fields (the booth uses this)")
    lg.add_argument("--take", help="booth take name: fills segment/episode/topic/sport/length")
    for f in PERF_FIELDS:
        if f not in ("logged_at", "take"):
            lg.add_argument(f"--{f.replace('_', '-')}", dest=f)
    im = sub.add_parser("import", help="import a platform's CSV export")
    im.add_argument("file")
    im.add_argument("--platform", required=True)
    im.add_argument("--segment", help="segment for rows with no series hashtag")
    im.add_argument("--dry-run", action="store_true")
    li = sub.add_parser("lint", help="check copy against the compliance list")
    li.add_argument("text")
    a = ap.parse_args(argv)

    try:
        pb = load_playbook()
        if a.cmd == "roadmap":
            start = date.fromisoformat(a.start)
            if not 1 <= a.days <= 60:
                raise IntelError("--days must be 1-60")
            rows = read_perf()
            slates = load_slates(pb, offline=a.offline)
            rm = build_roadmap(pb, start, a.days, slates, rows)
            write_roadmap(rm)
            if not a.quiet:
                _out(roadmap_md(rm))
            print(f"\nwrote {ROADMAP_MD.relative_to(PIPELINE)} and {ROADMAP_JSON.name} "
                  f"({len(rm['episodes'])} episodes)")
        elif a.cmd == "today":
            rm = _read_roadmap()
            today = [e for e in rm["episodes"] if e["date"] == date.today().isoformat()]
            if not today:
                print("nothing planned today in the current roadmap - run: content intel roadmap")
            for e in today:
                _out(brief_md(e) + "\n")
        elif a.cmd == "brief":
            rm = _read_roadmap()
            e = next((x for x in rm["episodes"] if x["id"] == a.episode), None)
            if not e:
                raise IntelError(f"no episode {a.episode!r} in the roadmap")
            _out(brief_md(e))
        elif a.cmd == "scores":
            _out(scores_report(pb, read_perf()))
        elif a.cmd == "segments":
            for gid, g in pb["segments"].items():
                pri = ", ".join(f"{pb['platforms'][p]['label']} {v}" for p, v in g["priors"].items())
                _out(f"{gid:<14} {g['name']:<14} {g['tag']:<14} {g['pillar']:<10} {'/'.join(g['formats']):<14} {g['timing']:<9} {pri}\n")
                for t in g.get("topics", []):
                    _out(f"{'':<16}- {t['id']}: {t['title']}\n")
        elif a.cmd == "log":
            row = json.loads(a.json) if a.json else {}
            if not isinstance(row, dict):
                raise IntelError("--json must be an object")
            for f in PERF_FIELDS:
                if getattr(a, f, None) not in (None, ""):
                    row[f] = getattr(a, f)
            take = row.get("take") or a.take
            if take:
                info = take_info(take)
                for k, v in info.items():
                    if v not in (None, "") and row.get(k) in (None, ""):
                        row[k] = v
            row = validate_row(pb, row)
            added, updated = upsert_perf([row])
            lift = None
            rows = read_perf()
            for rr, li_ in zip(rows, post_lifts(pb, rows)):
                if _row_key(rr) == _row_key(row):
                    lift = li_
            note = f"; lift {lift:+.2f} vs your typical {pb['platforms'][row['platform']]['label']} post" if lift is not None else \
                "; log a few more posts on this platform to score it"
            print(f"{'updated' if updated else 'logged'} {pb['segments'][row['segment']]['name']} on "
                  f"{pb['platforms'][row['platform']]['label']}{note}")
        elif a.cmd == "import":
            rows, skipped = import_rows(pb, Path(a.file), a.platform, a.segment)
            for s in skipped:
                print(f"  skipped {s}")
            if a.dry_run:
                print(f"dry run: {len(rows)} rows would be imported")
            else:
                added, updated = upsert_perf(rows)
                print(f"imported {added} new, {updated} updated, {len(skipped)} skipped")
        elif a.cmd == "lint":
            probs = lint(pb, a.text)
            print("\n".join(probs) if probs else "ok")
            return 1 if probs else 0
    except IntelError as e:
        print(f"content intel: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
