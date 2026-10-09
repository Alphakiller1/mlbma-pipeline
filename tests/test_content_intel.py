"""Content intelligence: playbook integrity, scoring, the learning loop and the roadmap."""
import copy
from datetime import date

import pytest

from outputs import content_intel as ci

PB = ci.load_playbook()


def _game(sport, gid, away, home, kick, rec=("3-2", "4-1"), broadcast=""):
    return ci.normalize_game({"id": gid, "away": away, "home": home, "away_name": f"{away} Club",
                              "home_name": f"{home} Club", "kickoff_utc": kick, "away_record": rec[0],
                              "home_record": rec[1], "broadcast": broadcast}, sport)


def _slates():
    nfl = [_game("nfl", "1", "BAL", "ATL", "2026-10-11T17:00Z"),
           _game("nfl", "2", "SF", "SEA", "2026-10-12T00:20Z", broadcast="NBC"),  # Sun 8:20 PM ET
           _game("nfl", "3", "BUF", "LAR", "2026-10-13T00:15Z", broadcast="ESPN")]
    cfb = [_game("cfb", "UGA@ALA", "UGA", "ALA", "2026-10-10T23:30Z")]
    return {"nfl": {"games": nfl, "source": "test", "generated_at": ""},
            "cfb": {"games": cfb, "source": "test", "generated_at": ""}}


def _row(platform, segment, **kw):
    r = {"platform": platform, "segment": segment, "views": 1000, "watch_pct": 40, "likes": 50,
         "comments": 5, "shares": 10, "saves": 10, "follows": 2, "impressions": 2000 if platform == "x" else None}
    r.update(kw)
    return ci.validate_row(PB, r)


# ── playbook ──

def test_shipped_playbook_is_valid():
    assert ci.validate_playbook(PB) == []


def test_validation_names_broken_references():
    bad = copy.deepcopy(PB)
    bad["segments"]["matchup_lab"]["pillar"] = "nope"
    bad["segments"]["one_stat"]["priors"]["youtube"] = 4  # long-form app, vertical-only segment
    bad["segments"]["myth_vs_math"]["tag"] = "#MatchupLab"
    probs = "\n".join(ci.validate_playbook(bad))
    assert "unknown pillar" in probs
    assert "youtube takes none of the segment's formats" in probs
    assert "tags must be unique" in probs


def test_shipped_copy_passes_compliance():
    for gid, g in PB["segments"].items():
        copy_ = [*g.get("hooks", []), g.get("caption", ""), g.get("x_text", ""),
                 *(t["hook"] for t in g.get("topics", [])), *(b["cue"] for f in g["beats"].values() for b in f)]
        for text in copy_:
            assert ci.lint(PB, text) == [], (gid, text)


def test_lint_flags_promises_and_promo_but_not_lookalikes():
    assert ci.lint(PB, "Tonight's LOCK OF THE week")
    assert any("platform_risk" in p for p in ci.lint(PB, "use my code for a deposit match"))
    assert ci.lint(PB, "Two blocks and a clock") == []


# ── parsing + logging ──

@pytest.mark.parametrize("raw,want", [("1,234", 1234), ("45%", 45), ("1.2K", 1200), ("0:45", 45),
                                      ("1:02:03", 3723), ("", None), ("--", None), ("abc", None)])
def test_num(raw, want):
    assert ci._num(raw) == want


def test_validate_row_rejects_impossible_numbers():
    with pytest.raises(ci.IntelError, match="percentage"):
        _row("tiktok", "matchup_lab", watch_pct=140)
    with pytest.raises(ci.IntelError, match="more than the views"):
        _row("tiktok", "matchup_lab", likes=5000)
    with pytest.raises(ci.IntelError, match="unknown segment"):
        _row("tiktok", "nope")


def test_upsert_replaces_the_same_post(tmp_path):
    path = tmp_path / "perf.csv"
    ci.upsert_perf([_row("tiktok", "matchup_lab", url="https://t/1", views=500)], path)
    added, updated = ci.upsert_perf([_row("tiktok", "matchup_lab", url="https://t/1", views=900)], path)
    rows = ci.read_perf(path)
    assert (added, updated) == (0, 1)
    assert len(rows) == 1 and rows[0]["views"] == 900


# ── scoring ──

def test_lift_is_relative_to_the_same_platform():
    rows = [_row("tiktok", "matchup_lab", shares=10) for _ in range(4)]
    rows.append(_row("tiktok", "myth_vs_math", shares=40, saves=40, watch_pct=60))
    # A different platform with tiny numbers must not drag TikTok's baseline.
    rows += [_row("x", "line_move", views=None, impressions=50000, shares=5) for _ in range(3)]
    lifts = ci.post_lifts(PB, rows)
    assert lifts[0] == pytest.approx(0, abs=1e-9)
    assert lifts[4] > 0.5


def test_scores_start_at_the_prior_and_learn():
    sc = ci.segment_scores(PB, [])
    assert sc["matchup_lab"]["tiktok"]["score"] == pytest.approx((4 - 3) * PB["learning"]["prior_step"])
    assert sc["matchup_lab"]["tiktok"]["n"] == 0
    # Lift is against the account's typical (median) post, so the typical post must be the good one.
    rows = [_row("tiktok", "matchup_lab") for _ in range(6)]
    rows += [_row("tiktok", "report_card", watch_pct=5, shares=0, saves=0, comments=0, follows=0, likes=1)
             for _ in range(4)]
    sc = ci.segment_scores(PB, rows)
    assert sc["report_card"]["tiktok"]["n"] == 4
    assert sc["report_card"]["tiktok"]["dropped"]  # enough posts, still scoring poorly
    assert not sc["matchup_lab"]["tiktok"]["dropped"]


# ── roadmap ──

def test_roadmap_follows_cadence_and_is_deterministic():
    a = ci.build_roadmap(PB, date(2026, 10, 9), 7, _slates(), [])
    b = ci.build_roadmap(PB, date(2026, 10, 9), 7, _slates(), [])
    strip = lambda rm: [(e["id"], e["title"]) for e in rm["episodes"]]
    assert strip(a) == strip(b)
    for wd in ci.WEEKDAYS:
        for fmt in ci.FORMATS:
            got = sum(1 for e in a["episodes"] if e["weekday"] == wd and e["format"] == fmt)
            assert got <= PB["cadence"][fmt].get(wd, 0)
    assert len(a["episodes"]) >= sum(PB["cadence"]["vertical"].values()) - 1


def test_roadmap_respects_gaps_days_and_formats():
    rm = ci.build_roadmap(PB, date(2026, 10, 5), 21, _slates(), [])
    by_seg: dict = {}
    for e in rm["episodes"]:
        g = PB["segments"][e["segment"]]
        assert e["format"] in g["formats"]
        assert all(e["format"] in PB["platforms"][p]["formats"] for p in e["platforms"])
        if g.get("days"):
            assert e["weekday"] in g["days"]
        by_seg.setdefault((e["segment"], e["format"]), []).append(date.fromisoformat(e["date"]))
    for (gid, _), days in by_seg.items():
        gap = PB["segments"][gid].get("gap_days", 0)
        if gap:
            assert all((b - a).days > gap for a, b in zip(days, days[1:])), gid


def test_pregame_episodes_use_slate_games_once_per_format():
    rm = ci.build_roadmap(PB, date(2026, 10, 10), 3, _slates(), [])
    used = [(e["format"], g["id"]) for e in rm["episodes"] for g in e["games"]]
    assert len(used) == len(set(used))
    for e in rm["episodes"]:
        for g in e["games"]:
            assert g["url"].startswith(f"/{g['sport']}/matchup.html?game=")
            # away/home is the page's fallback match (CFB pages key games by school name).
            assert f"away={g['away']}&home={g['home']}" in g["url"]
            if e["format"] == "vertical":
                assert g["et_date"] == e["date"]


def test_results_move_the_plan():
    base = ci.build_roadmap(PB, date(2026, 10, 12), 14, _slates(), [])
    count = lambda rm, seg: sum(1 for e in rm["episodes"] if e["segment"] == seg)
    rows = []
    for p in ("tiktok", "shorts", "x"):
        rows += [_row(p, "myth_vs_math", watch_pct=3, likes=1, comments=0, shares=0, saves=0, follows=0) for _ in range(5)]
        rows += [_row(p, "ask_the_desk", watch_pct=80, likes=200, comments=80, shares=90, saves=90, follows=30) for _ in range(5)]
        rows += [_row(p, "sharp_school") for _ in range(5)]
    learned = ci.build_roadmap(PB, date(2026, 10, 12), 14, _slates(), rows)
    assert count(learned, "myth_vs_math") < count(base, "myth_vs_math")
    assert count(learned, "ask_the_desk") > count(base, "ask_the_desk")


def test_platform_kits_fit_each_app():
    rm = ci.build_roadmap(PB, date(2026, 10, 9), 14, _slates(), [])
    for e in rm["episodes"]:
        assert e["compliance"] == []
        for pid, k in e["platforms"].items():
            p = PB["platforms"][pid]
            assert len(k["caption"]) <= p["caption_chars"]
            assert PB["segments"][e["segment"]]["tag"] in k["hashtags"]
            if "post_text" in k:
                assert len(k["post_text"]) <= 280
            if "title" in k:
                assert len(k["title"]) <= p.get("title_chars", 70)
        assert sum(b["s"] for b in e["beats"]) > 0
        assert e["beats"][0]["at_s"] == 0


# ── import ──

def test_import_maps_columns_and_finds_segments(tmp_path):
    f = tmp_path / "x.csv"
    f.write_text("﻿Post text,Impressions,Reposts,Quotes,Replies,Likes,Bookmarks,Post link\n"
                 "Moved overnight #WhyItMoved,\"12,000\",30,10,25,300,40,https://x/1\n"
                 "No series tag here,5000,1,0,2,20,1,https://x/2\n", encoding="utf-8")
    rows, skipped = ci.import_rows(PB, f, "x")
    assert len(rows) == 1 and len(skipped) == 1
    r = rows[0]
    assert r["segment"] == "line_move"
    assert r["impressions"] == 12000
    assert r["shares"] == 40  # reposts + quotes
    assert r["comments"] == 25
    assert r["saves"] == 40


def test_mlb_links_pin_the_game_date():
    g = _game("mlb", "849831", "CWS", "CLE", "2026-10-11T00:08Z")  # 8:08 PM ET on the 10th
    assert g["et_date"] == "2026-10-10"
    assert g["url"] == "/mlb/matchup.html?game=849831&away=CWS&home=CLE&date=2026-10-10"
