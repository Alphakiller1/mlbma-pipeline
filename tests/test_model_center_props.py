"""Model Center props for every sport, and the WNBA board's field names."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_weekly_props_cover_cfb_nfl_and_wnba():
    js = (ROOT / "dashboard" / "model_center.js").read_text(encoding="utf-8")
    assert "var WEEKLY_PROPS = {" in js and "    nfl: [" in js and "    cfb: [" in js
    assert "function wnbaPropCard" in js and "WNBA_MARKETS" in js
    # NFL projections are keyed to AWAY@HOME from club, opponent and side.
    assert "p.home ? p.opponent + '@' + p.team : p.team + '@' + p.opponent" in js
    # WNBA board ids read "DAL @ GSV"; props match on the clubs.
    assert "g.away + '@' + g.home" in js


def test_board_normaliser_reads_the_wnba_projection_fields():
    js = (ROOT / "dashboard" / "sports" / "chase_board.js").read_text(encoding="utf-8")
    for alias in ("g.projected_away_pts", "g.projected_home_pts", "g.home_win_prob", "-Number(book.spread)"):
        assert alias in js
