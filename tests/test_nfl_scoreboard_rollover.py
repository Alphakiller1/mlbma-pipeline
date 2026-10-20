from outputs.publish_public_slate import NFL_SCOREBOARD_URL, fetch_nfl_scoreboard


def _board(week, *states):
    return {
        "week": {"number": week},
        "season": {"type": 2},
        "events": [{"status": {"type": {"state": s}}} for s in states],
    }


def _fetcher(boards):
    calls = []

    def fetch(url):
        calls.append(url)
        return boards[url]

    return fetch, calls


def test_a_fully_played_week_rolls_to_the_next():
    """2026-10-20: the Tuesday after Monday night, ESPN's default board was all
    finals and the desk showed last week's scores instead of Thursday's game."""
    nxt = _board(7, "pre", "pre")
    fetch, calls = _fetcher({
        NFL_SCOREBOARD_URL: _board(6, "post", "post"),
        f"{NFL_SCOREBOARD_URL}?seasontype=2&week=7": nxt,
    })
    assert fetch_nfl_scoreboard(fetch) is nxt
    assert len(calls) == 2


def test_a_week_still_in_play_stays():
    current = _board(6, "post", "in", "pre")
    fetch, calls = _fetcher({NFL_SCOREBOARD_URL: current})
    assert fetch_nfl_scoreboard(fetch) is current
    assert calls == [NFL_SCOREBOARD_URL]


def test_an_empty_or_failed_next_week_keeps_the_played_week():
    played = _board(18, "post")
    fetch, _ = _fetcher({
        NFL_SCOREBOARD_URL: played,
        f"{NFL_SCOREBOARD_URL}?seasontype=2&week=19": {"events": []},
    })
    assert fetch_nfl_scoreboard(fetch) is played

    def failing(url):
        if url == NFL_SCOREBOARD_URL:
            return played
        raise OSError("timeout")

    assert fetch_nfl_scoreboard(failing) is played


def test_an_unreachable_scoreboard_returns_none():
    def failing(url):
        raise OSError("down")

    assert fetch_nfl_scoreboard(failing) is None
