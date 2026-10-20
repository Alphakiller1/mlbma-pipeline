from scripts import publish_public_cfb_slate as cfb


def _qb(pid, name, attempts):
    return {"player_id": pid, "player_name": name, "position": "QB", "ranked": True,
            "line": {"attempts": attempts, "completions": attempts // 2}}


def _game(qbs, injuries, rushers=None):
    return {"home": "DEL", "home_qbs": qbs, "home_rushers": rushers or [],
            "home_injuries": {"players": injuries, "sources": "Covers, RotoWire"}}


def _last(passers, appeared=None, date="2026-10-13T23:00Z"):
    return {"DEL": {"date": date, "passers": passers,
                    "appeared": appeared or [[p[0], p[1]] for p in passers]}}


def test_names_match_across_feeds():
    assert cfb.person_key("N. Minicucci") == cfb.person_key("Nick Minicucci")
    assert cfb.person_key("Viron Ellison Jr.") == cfb.person_key("V. Ellison")
    assert cfb.person_key("C. Del Rio-Wilson") == cfb.person_key("Carlos Del Rio-Wilson")
    assert cfb.person_key("Henry Belin IV") == ("h", "belin")


def test_report_dates_belong_to_the_season():
    assert cfb.report_date("Sat, Oct 17", 2026).date().isoformat() == "2026-10-17"
    assert cfb.report_date("Thu, Jan 1", 2026).year == 2027
    assert cfb.report_date("", 2026) is None


def test_a_ruled_out_qb1_is_not_the_starter():
    """Delaware, 2026-10-20: the card named Nick Minicucci (out, leg) while
    Tyler Bell had thrown 36 of the 37 passes in the last game."""
    game = _game([_qb("5153846", "Nick Minicucci", 103), _qb("5289314", "Tyler Bell", 45)],
                 [{"player": "N. Minicucci", "position": "QB", "status": "Out",
                   "injury": "Leg", "updated": "Sat, Oct 17"}])
    cfb.apply_availability([game], _last([["5289314", "Tyler Bell", 36]]), 2026)
    room = game["home_qbs"]
    assert [q["player_name"] for q in room] == ["Tyler Bell", "Nick Minicucci"]
    assert room[0]["depth_rank"] == 1 and "status" not in room[0]
    assert room[1]["status"] == "Out" and room[1]["injury"] == "Leg"
    assert game["home_starter"] == "Tyler Bell"


def test_even_without_a_report_the_last_games_passer_starts():
    game = _game([_qb("1", "Season Leader", 200), _qb("2", "New Starter", 40)], [])
    cfb.apply_availability([game], _last([["2", "New Starter", 33]]), 2026)
    assert game["home_qbs"][0]["player_name"] == "New Starter"


def test_a_shared_last_game_goes_to_the_larger_season_workload():
    game = _game([_qb("1", "Aa Veteran", 150), _qb("2", "Bb Relief", 30)], [])
    cfb.apply_availability([game], _last([["2", "Bb Relief", 20], ["1", "Aa Veteran", 18]]), 2026)
    assert game["home_qbs"][0]["player_name"] == "Aa Veteran"
    # A clear change is not a share.
    game = _game([_qb("1", "Aa Veteran", 150), _qb("2", "Bb Relief", 30)], [])
    cfb.apply_availability([game], _last([["2", "Bb Relief", 29], ["1", "Aa Veteran", 18]]), 2026)
    assert game["home_qbs"][0]["player_name"] == "Bb Relief"


def test_a_ruled_out_last_game_passer_gives_way():
    game = _game([_qb("1", "Aa Starter", 200), _qb("2", "Bb Backup", 40)],
                 [{"player": "A. Starter", "status": "Out", "updated": "Sun, Oct 18"}])
    cfb.apply_availability([game], _last([["1", "Aa Starter", 30]]), 2026)
    assert game["home_qbs"][0]["player_name"] == "Bb Backup"
    assert game["home_qbs"][1]["status"] == "Out"


def test_a_questionable_starter_keeps_the_job_and_shows_it():
    game = _game([_qb("1", "Aa Starter", 200), _qb("2", "Bb Backup", 40)],
                 [{"player": "A. Starter", "status": "Questionable", "updated": "Sun, Oct 18"}])
    cfb.apply_availability([game], _last([["1", "Aa Starter", 30]]), 2026)
    assert game["home_qbs"][0]["player_name"] == "Aa Starter"
    assert game["home_qbs"][0]["status"] == "Questionable"


def test_an_out_report_older_than_a_game_he_played_is_stale():
    game = _game([_qb("1", "Aa Starter", 200)],
                 [{"player": "A. Starter", "status": "Out", "updated": "Sat, Oct 3"},
                  {"player": "C. Hurt", "status": "Out", "updated": "Sat, Oct 3"}])
    counts = cfb.apply_availability([game], _last([["1", "Aa Starter", 30]], date="2026-10-11T00:00Z"), 2026)
    assert [e["player"] for e in game["home_injuries"]["players"]] == ["C. Hurt"]
    assert game["home_qbs"][0].get("status") is None and counts["stale"] == 1


def test_same_day_reports_are_not_called_stale():
    game = _game([_qb("1", "Aa Starter", 200)],
                 [{"player": "A. Starter", "status": "Out", "updated": "Sat, Oct 10"}])
    cfb.apply_availability([game], _last([["1", "Aa Starter", 30]], date="2026-10-10T23:00Z"), 2026)
    assert game["home_injuries"]["players"]


def test_the_last_games_passer_is_named_even_when_the_lines_miss_him():
    game = _game([_qb("1", "Aa Leader", 148), _qb("2", "Bb Second", 70)],
                 [{"player": "A. Leader", "status": "Questionable", "updated": "Sun, Oct 18"}])
    cfb.apply_availability([game], _last([["3", "Corey Dailey", 25]]), 2026)
    room = game["home_qbs"]
    assert room[0]["player_name"] == "Corey Dailey" and room[0]["line"] == {}


def test_ball_carriers_carry_their_designation():
    game = _game([_qb("1", "Aa Starter", 200)],
                 [{"player": "G. Spiller", "status": "Out", "injury": "Undisclosed",
                   "updated": "Sun, Sep 13"}],
                 rushers=[{"player_name": "Gabe Spiller", "position": "RB", "carries": 40}])
    cfb.apply_availability([game], _last([["1", "Aa Starter", 30]]), 2026)
    assert game["home_rushers"][0]["status"] == "Out"
