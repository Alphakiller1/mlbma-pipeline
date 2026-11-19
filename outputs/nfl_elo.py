"""An NFL Elo rating from nflverse results since 1999 (2026-11-19).

Fitted into the strength index's NSI (outputs/nfl_strength_weights.json v3):
it carries several seasons of results where the other inputs carry one, and
lifted week-1 NSI from 0.061 to 0.072 (later-game margin, leave-one-season-out).

K 20; home field 48 points (none at a neutral site); margin multiplier
ln(|margin| + 1) x 2.2 / (0.001 x the winner's Elo edge + 2.2); a third of
the way back to 1505 between seasons; playoff games count.
"""
from __future__ import annotations

import io
import math
import urllib.request

GAMES_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
USER_AGENT = "ChaseAnalytics/1.0 (+https://chase-analytics.com)"
K, HOME, MEAN, REVERT = 20.0, 48.0, 1505.0, 1 / 3


def _code(code) -> str:
    """nflverse's franchise codes on the desk's (relocations folded in)."""
    return {"LA": "LAR", "STL": "LAR", "SD": "LAC", "OAK": "LV", "JAC": "JAX"}.get(str(code), str(code))


def ratings(through_season: int, through_week: int, games=None) -> dict[str, float]:
    """{club: Elo after its last game through the week}; {} when the results
    file is unavailable. ``games`` (a DataFrame shaped like nflverse games.csv)
    is for tests."""
    import pandas as pd
    if games is None:
        try:
            req = urllib.request.Request(GAMES_URL, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as response:
                games = pd.read_csv(io.BytesIO(response.read()))
        except Exception as exc:  # network: the index publishes without Elo
            print(f"  WARNING: NFL Elo results unavailable ({exc})")
            return {}
    played = games[games["home_score"].notna() & games["away_score"].notna()]
    played = played[(played["season"] < through_season)
                    | ((played["season"] == through_season)
                       & ((played["game_type"] != "REG") | (played["week"] <= through_week)))]
    played = played[played["season"] <= through_season].sort_values(["season", "week", "gameday"])
    rating: dict[str, float] = {}
    season = None
    for g in played.itertuples():
        if g.season != season:
            if season is not None:
                rating = {t: r + REVERT * (MEAN - r) for t, r in rating.items()}
            season = g.season
        home, away = _code(g.home_team), _code(g.away_team)
        rh, ra = rating.get(home, MEAN), rating.get(away, MEAN)
        edge = rh + (0.0 if str(g.location) == "Neutral" else HOME) - ra
        expect = 1 / (1 + 10 ** (-edge / 400))
        margin = g.home_score - g.away_score
        result = 1.0 if margin > 0 else 0.0 if margin < 0 else 0.5
        winner_edge = edge if margin > 0 else -edge if margin < 0 else 0.0
        mult = math.log(abs(margin) + 1) * 2.2 / (0.001 * winner_edge + 2.2) if margin else 1.0
        delta = K * mult * (result - expect)
        rating[home], rating[away] = rh + delta, ra - delta
    if season is not None and season < through_season:
        rating = {t: r + REVERT * (MEAN - r) for t, r in rating.items()}
    return rating
