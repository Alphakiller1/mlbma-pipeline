"""CFBD depth and ESPN game logs for the CFB matchup (scripts/cfb_depth.py)."""
from scripts import cfb_depth as d


def _adv(team, line_yards, stuff, pass_rate):
    return {"team": team,
            "offense": {"lineYards": line_yards, "stuffRate": stuff, "passingPlays": {"rate": pass_rate}},
            "defense": {"lineYards": line_yards + 1, "stuffRate": stuff + 0.05,
                        "passingPlays": {"rate": pass_rate}, "ppa": 0.1}}


def test_team_advanced_ranks_both_sides_in_the_right_direction():
    rows = [_adv("A", 3.5, 0.10, 0.6), _adv("B", 2.5, 0.20, 0.4)]
    out = d.team_advanced(rows)
    a = out["a"]["run_game"]["rates"]
    assert a["off_line_yards"]["rank"] == 1          # more line yards is better
    assert a["off_stuff_rate"]["rank"] == 1          # fewer stuffs is better for an offense
    assert a["def_stuff_rate"]["rank"] == 2          # more stuffs is better for a defense
    # A tendency is ranked by "most".
    assert out["a"]["scheme"]["rates"]["off_pass_rate"]["rank"] == 1
    assert out["a"]["scheme"]["rates"]["off_pass_rate"]["better"] == "neutral"


def test_game_logs_rank_against_fbs_only_and_build_a_season_row(monkeypatch):
    def event(eid, home, away, hs, as_):
        return {"id": eid, "date": "2026-09-06T00:00Z", "status": {"type": {"completed": True}},
                "competitions": [{"neutralSite": False, "competitors": [
                    {"homeAway": "home", "score": str(hs), "team": {"id": home, "abbreviation": home, "location": home}},
                    {"homeAway": "away", "score": str(as_), "team": {"id": away, "abbreviation": away, "location": away}},
                ]}]}
    weeks = {1: [event("1", "AAA", "FCS", 50, 3), event("2", "BBB", "CCC", 20, 24)]}
    monkeypatch.setattr(d, "_week_events", lambda season, week: weeks.get(week, []))
    monkeypatch.setattr(d, "_box", lambda eid: {"teams": {}})
    logs = d.game_logs(2026, 2, {"AAA": "AAA", "CCC": "CCC"}, fbs={"aaa", "bbb", "ccc"})
    assert set(logs) == {"AAA", "CCC"}
    game = logs["AAA"]["games"][0]
    assert game["result"] == "W" and game["opponent"] == "FCS"
    assert game["points"] == {"value": 50.0, "rank": 1, "of": 3}   # the FCS side is not in the pool
    assert logs["CCC"]["season"]["points"]["of"] == 3


def test_record_and_starter_ordering():
    from scripts import publish_public_cfb_slate as cfb
    assert cfb._record([{"result": "W"}, {"result": "L"}, {"result": "W"}]) == "2-1"
    qbs = [{"player_name": "Backup", "line": {"attempts": 90}},
           {"player_name": "Starter Jr.", "line": {"attempts": 40}}]
    assert cfb._starter_first(qbs, "Starter Jr.")[0]["player_name"] == "Starter Jr."
    assert cfb._starter_first(qbs, None)[0]["player_name"] == "Backup"
