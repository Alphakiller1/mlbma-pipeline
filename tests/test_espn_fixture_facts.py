from outputs.publish_public_slate import espn_weather as nfl_weather
from scripts import publish_public_cfb_slate as cfb


def test_cfb_scoreboard_asks_for_the_whole_fbs_week():
    """Without groups=80 ESPN served 17 featured games of 56 (2026-10-20)."""
    url = cfb.SCOREBOARD_URL.format(week=8)
    assert "groups=80" in url and "week=8" in url and "seasontype=2" in url


def test_cfb_events_load_for_the_boards_week(monkeypatch):
    seen = []
    monkeypatch.setattr(cfb, "fetch_json", lambda url: seen.append(url) or {"events": [{"id": 1}]})
    assert cfb.load_espn_events(8) == [{"id": 1}]
    assert seen and "week=8" in seen[0]


def test_weather_reads_the_event_and_the_swapped_college_fields():
    college = {"weather": {"displayValue": "2", "temperature": 84, "conditionId": "Mostly sunny"}}
    assert cfb.espn_weather(college) == (84, "Mostly sunny")
    pro = {"weather": {"displayValue": "Mostly clear", "temperature": 60, "conditionId": "34"}}
    # NFL: the forecast is on the event, not the competition.
    assert nfl_weather(pro, {}) == (60, "Mostly clear")
    assert cfb.espn_weather({}) == (None, None)


def test_event_index_carries_weather_and_broadcast():
    event = {
        "date": "2026-10-24T19:30Z",
        "weather": {"displayValue": "Cloudy", "temperature": 55},
        "competitions": [{
            "venue": {"fullName": "Kidd Brewer Stadium", "address": {"city": "Boone", "state": "NC"}},
            "broadcasts": [{"names": ["ESPN2"]}],
            "status": {"type": {"state": "post"}},
            "competitors": [
                {"homeAway": "away", "score": "24", "team": {"abbreviation": "JMU", "nickname": "James Madison"}},
                {"homeAway": "home", "score": "21", "team": {"abbreviation": "APP", "nickname": "App State"}},
            ],
        }],
    }
    row = cfb.event_index([event])[("JMU", "APP")]
    assert row["broadcast"] == "ESPN2"
    assert (row["weather_temp"], row["weather_cond"]) == (55, "Cloudy")
    assert row["game_state"] == "final"
