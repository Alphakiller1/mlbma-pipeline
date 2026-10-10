"""Content intelligence: playbook integrity, scoring, the learning loop and the roadmap."""
from __future__ import annotations

import copy
import tempfile
import unittest
from datetime import date
from pathlib import Path

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


def _count(rm, seg):
    return sum(1 for e in rm["episodes"] if e["segment"] == seg)


class PlaybookTests(unittest.TestCase):
    def test_shipped_playbook_is_valid(self):
        self.assertEqual(ci.validate_playbook(PB), [])

    def test_validation_names_broken_references(self):
        bad = copy.deepcopy(PB)
        bad["segments"]["matchup_lab"]["pillar"] = "nope"
        bad["segments"]["one_stat"]["priors"]["youtube"] = 4  # long-form app, vertical-only segment
        bad["segments"]["myth_vs_math"]["tag"] = "#MatchupLab"
        probs = "\n".join(ci.validate_playbook(bad))
        self.assertIn("unknown pillar", probs)
        self.assertIn("youtube takes none of the segment's formats", probs)
        self.assertIn("tags must be unique", probs)

    def test_shipped_copy_passes_compliance(self):
        for gid, g in PB["segments"].items():
            texts = [*g.get("hooks", []), g.get("caption", ""), g.get("x_text", ""),
                     *(t["hook"] for t in g.get("topics", [])),
                     *(b["cue"] for f in g["beats"].values() for b in f)]
            for text in texts:
                with self.subTest(segment=gid, text=text):
                    self.assertEqual(ci.lint(PB, text), [])

    def test_lint_flags_promises_and_promo_but_not_lookalikes(self):
        self.assertTrue(ci.lint(PB, "Tonight's LOCK OF THE week"))
        self.assertTrue(any("platform_risk" in p for p in ci.lint(PB, "use my code for a deposit match")))
        self.assertEqual(ci.lint(PB, "Two blocks and a clock"), [])


class LoggingTests(unittest.TestCase):
    def test_num(self):
        cases = [("1,234", 1234), ("45%", 45), ("1.2K", 1200), ("0:45", 45), ("1:02:03", 3723),
                 ("", None), ("--", None), ("abc", None)]
        for raw, want in cases:
            with self.subTest(raw=raw):
                self.assertEqual(ci._num(raw), want)

    def test_validate_row_rejects_impossible_numbers(self):
        with self.assertRaisesRegex(ci.IntelError, "percentage"):
            _row("tiktok", "matchup_lab", watch_pct=140)
        with self.assertRaisesRegex(ci.IntelError, "more than the views"):
            _row("tiktok", "matchup_lab", likes=5000)
        with self.assertRaisesRegex(ci.IntelError, "unknown segment"):
            _row("tiktok", "nope")

    def test_upsert_replaces_the_same_post(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "perf.csv"
            ci.upsert_perf([_row("tiktok", "matchup_lab", url="https://t/1", views=500)], path)
            added, updated = ci.upsert_perf([_row("tiktok", "matchup_lab", url="https://t/1", views=900)], path)
            rows = ci.read_perf(path)
        self.assertEqual((added, updated), (0, 1))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["views"], 900)

    def test_import_maps_columns_and_finds_segments(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "x.csv"
            f.write_text("﻿Post text,Impressions,Reposts,Quotes,Replies,Likes,Bookmarks,Post link\n"
                         "Moved overnight #WhyItMoved,\"12,000\",30,10,25,300,40,https://x/1\n"
                         "No series tag here,5000,1,0,2,20,1,https://x/2\n", encoding="utf-8")
            rows, skipped = ci.import_rows(PB, f, "x")
        self.assertEqual((len(rows), len(skipped)), (1, 1))
        r = rows[0]
        self.assertEqual(r["segment"], "line_move")
        self.assertEqual(r["impressions"], 12000)
        self.assertEqual(r["shares"], 40)  # reposts + quotes
        self.assertEqual(r["comments"], 25)
        self.assertEqual(r["saves"], 40)


class ScoringTests(unittest.TestCase):
    def test_lift_is_relative_to_the_same_platform(self):
        rows = [_row("tiktok", "matchup_lab", shares=10) for _ in range(4)]
        rows.append(_row("tiktok", "myth_vs_math", shares=40, saves=40, watch_pct=60))
        # A different platform with tiny numbers must not drag TikTok's baseline.
        rows += [_row("x", "line_move", views=None, impressions=50000, shares=5) for _ in range(3)]
        lifts = ci.post_lifts(PB, rows)
        self.assertAlmostEqual(lifts[0], 0, places=9)
        self.assertGreater(lifts[4], 0.5)

    def test_scores_start_at_the_prior_and_learn(self):
        sc = ci.segment_scores(PB, [])
        self.assertAlmostEqual(sc["matchup_lab"]["tiktok"]["score"], (4 - 3) * PB["learning"]["prior_step"])
        self.assertEqual(sc["matchup_lab"]["tiktok"]["n"], 0)
        # Lift is against the account's typical (median) post, so the typical post must be the good one.
        rows = [_row("tiktok", "matchup_lab") for _ in range(6)]
        rows += [_row("tiktok", "report_card", watch_pct=5, shares=0, saves=0, comments=0, follows=0, likes=1)
                 for _ in range(4)]
        sc = ci.segment_scores(PB, rows)
        self.assertEqual(sc["report_card"]["tiktok"]["n"], 4)
        self.assertTrue(sc["report_card"]["tiktok"]["dropped"])  # enough posts, still scoring poorly
        self.assertFalse(sc["matchup_lab"]["tiktok"]["dropped"])


class RoadmapTests(unittest.TestCase):
    def test_roadmap_follows_cadence_and_is_deterministic(self):
        a = ci.build_roadmap(PB, date(2026, 10, 9), 7, _slates(), [])
        b = ci.build_roadmap(PB, date(2026, 10, 9), 7, _slates(), [])
        self.assertEqual([(e["id"], e["title"]) for e in a["episodes"]],
                         [(e["id"], e["title"]) for e in b["episodes"]])
        for wd in ci.WEEKDAYS:
            for fmt in ci.FORMATS:
                got = sum(1 for e in a["episodes"] if e["weekday"] == wd and e["format"] == fmt)
                self.assertLessEqual(got, PB["cadence"][fmt].get(wd, 0))
        self.assertGreaterEqual(len(a["episodes"]), sum(PB["cadence"]["vertical"].values()) - 1)

    def test_roadmap_respects_gaps_days_and_formats(self):
        rm = ci.build_roadmap(PB, date(2026, 10, 5), 21, _slates(), [])
        by_seg: dict = {}
        for e in rm["episodes"]:
            g = PB["segments"][e["segment"]]
            self.assertIn(e["format"], g["formats"])
            for p in e["platforms"]:
                self.assertIn(e["format"], PB["platforms"][p]["formats"])
            if g.get("days"):
                self.assertIn(e["weekday"], g["days"])
            by_seg.setdefault((e["segment"], e["format"]), []).append(date.fromisoformat(e["date"]))
        for (gid, _), days in by_seg.items():
            gap = PB["segments"][gid].get("gap_days", 0)
            if gap:
                for a, b in zip(days, days[1:]):
                    self.assertGreater((b - a).days, gap, gid)

    def test_pregame_episodes_use_slate_games_once_per_format(self):
        rm = ci.build_roadmap(PB, date(2026, 10, 10), 3, _slates(), [])
        used = [(e["format"], g["id"]) for e in rm["episodes"] for g in e["games"]]
        self.assertEqual(len(used), len(set(used)))
        for e in rm["episodes"]:
            for g in e["games"]:
                self.assertTrue(g["url"].startswith(f"/{g['sport']}/matchup.html?game="))
                # away/home is the page's fallback match (CFB pages key games by school name).
                self.assertIn(f"away={g['away']}&home={g['home']}", g["url"])
                if e["format"] == "vertical":
                    self.assertEqual(g["et_date"], e["date"])

    def test_mlb_links_pin_the_game_date(self):
        g = _game("mlb", "849831", "CWS", "CLE", "2026-10-11T00:08Z")  # 8:08 PM ET on the 10th
        self.assertEqual(g["et_date"], "2026-10-10")
        self.assertEqual(g["url"], "/mlb/matchup.html?game=849831&away=CWS&home=CLE&date=2026-10-10")

    def test_results_move_the_plan(self):
        base = ci.build_roadmap(PB, date(2026, 10, 12), 14, _slates(), [])
        rows = []
        for p in ("tiktok", "shorts", "x"):
            rows += [_row(p, "myth_vs_math", watch_pct=3, likes=1, comments=0, shares=0, saves=0, follows=0)
                     for _ in range(5)]
            rows += [_row(p, "ask_the_desk", watch_pct=80, likes=200, comments=80, shares=90, saves=90, follows=30)
                     for _ in range(5)]
            rows += [_row(p, "sharp_school") for _ in range(5)]
        learned = ci.build_roadmap(PB, date(2026, 10, 12), 14, _slates(), rows)
        self.assertLess(_count(learned, "myth_vs_math"), _count(base, "myth_vs_math"))
        self.assertGreater(_count(learned, "ask_the_desk"), _count(base, "ask_the_desk"))

    def test_platform_kits_fit_each_app(self):
        rm = ci.build_roadmap(PB, date(2026, 10, 9), 14, _slates(), [])
        for e in rm["episodes"]:
            self.assertEqual(e["compliance"], [])
            for pid, k in e["platforms"].items():
                p = PB["platforms"][pid]
                self.assertLessEqual(len(k["caption"]), p["caption_chars"])
                self.assertIn(PB["segments"][e["segment"]]["tag"], k["hashtags"])
                if "post_text" in k:
                    self.assertLessEqual(len(k["post_text"]), 280)
                if "title" in k:
                    self.assertLessEqual(len(k["title"]), p.get("title_chars", 70))
            self.assertGreater(sum(b["s"] for b in e["beats"]), 0)
            self.assertEqual(e["beats"][0]["at_s"], 0)



class PickTests(unittest.TestCase):
    """Build a show: any game on a slate, in either format (the booth's picker)."""

    def test_cfb_wide_walks_the_matchup_tabs(self):
        ep = ci.pick_episode(PB, "matchup_lab", "wide", "cfb", "UGA@ALA", _slates(), [], date(2026, 10, 10))
        self.assertEqual(ep["aspect"], "wide")
        self.assertTrue(ep["picked"])
        self.assertIn("youtube", ep["platforms"])
        self.assertNotIn("tiktok", ep["platforms"])
        self.assertEqual(ep["target_s"], PB["segments"]["matchup_lab"]["length_s"]["wide:cfb"])
        self.assertEqual(sum(b["s"] for b in ep["beats"]), ep["target_s"])
        url = ep["games"][0]["url"]
        tabbed = [b for b in ep["beats"] if "page" in b]
        self.assertGreaterEqual(len(tabbed), 6)
        for b in tabbed:
            base, _, tab = b["page"].partition("#")
            self.assertEqual(base, url)  # away/home kept: CFB pages match on them
            self.assertIn(tab, ("units", "games", "passing", "rushing", "situational", "special", "availability", "profile"))
        self.assertTrue(ep["hooks"][0].startswith("UGA Club vs ALA Club"))
        # YouTube chapters need 10 s+ each; the beats are what the host chapters on.
        self.assertTrue(all(b["s"] >= 10 for b in ep["beats"]))

    def test_cfb_vertical_is_a_short_with_the_short_copy(self):
        ep = ci.pick_episode(PB, "matchup_lab", "vertical", "cfb", "UGA@ALA", _slates(), [], date(2026, 10, 10))
        self.assertEqual(ep["target_s"], 55)
        self.assertEqual(set(ep["platforms"]), {"tiktok", "shorts", "x"})
        self.assertIn("one stat", ep["platforms"]["tiktok"]["caption"])
        self.assertEqual(ep["compliance"], [])
        self.assertTrue(any(b.get("page", "").endswith("#units") for b in ep["beats"]))

    def test_sports_without_a_variant_use_the_format_default(self):
        slates = _slates()
        slates["mlb"] = {"games": [_game("mlb", "849831", "CWS", "CLE", "2026-10-11T00:08Z")], "source": "test", "generated_at": ""}
        ep = ci.pick_episode(PB, "matchup_lab", "wide", "mlb", "849831", slates, [], date(2026, 10, 10))
        self.assertEqual(ep["target_s"], PB["segments"]["matchup_lab"]["length_s"]["wide"])
        self.assertFalse(any("page" in b for b in ep["beats"]))

    def test_bad_picks_say_why(self):
        for args in (("one_stat", "wide", "cfb", "UGA@ALA"),     # no wide one_stat
                     ("sharp_school", "vertical", "cfb", "UGA@ALA"),  # not a one-game show
                     ("matchup_lab", "wide", "cfb", "NOPE@NONE")):   # not on the slate
            with self.assertRaises(ci.IntelError):
                ci.pick_episode(PB, *args, _slates(), [], date(2026, 10, 10))

    def test_picks_join_the_plan_and_replace_themselves(self):
        rm = ci.build_roadmap(PB, date(2026, 10, 10), 2, _slates(), [])
        n = len(rm["episodes"])
        ep = ci.pick_episode(PB, "matchup_lab", "wide", "cfb", "UGA@ALA", _slates(), [], date(2026, 10, 10))
        rm = ci.add_picked(ci.add_picked(rm, ep), ep)
        self.assertEqual(len(rm["episodes"]), n + 1)
        self.assertEqual([e["date"] for e in rm["episodes"]], sorted(e["date"] for e in rm["episodes"]))
        self.assertEqual(ci.add_picked(None, ep)["episodes"], [ep])

    def test_validation_catches_bad_variants(self):
        pb = copy.deepcopy(PB)
        g = pb["segments"]["matchup_lab"]
        g["beats"]["wide:nba"] = g["beats"]["wide"]
        g["beats"]["square"] = g["beats"]["wide"]
        pb["segments"]["sharp_school"]["beats"]["wide"][0]["tab"] = "units"
        probs = " ".join(ci.validate_playbook(pb))
        self.assertIn("beats.wide:nba", probs)
        self.assertIn("beats.square", probs)
        self.assertIn("has a tab but no matchup page", probs)


if __name__ == "__main__":
    unittest.main()
