"""Pace by situation and time of possession (outputs/nfl_advanced_context._pace)."""
import pandas as pd

from outputs import nfl_advanced_context as adv


def _plays():
    # One game, two drives. Drive 1: snaps at 900, 870, 840 (30s apart), first
    # half, leading. Drive 2: 300, 280 (20s), then a 300s stoppage, second half,
    # trailing.
    return pd.DataFrame({
        "game_id": ["g"] * 6,
        "play_id": [1, 2, 3, 10, 11, 12],
        "fixed_drive": [1, 1, 1, 2, 2, 2],
        "game_seconds_remaining": [900, 870, 840, 300, 280, -20],
        "game_half": ["Half1"] * 3 + ["Half2"] * 3,
        "score_differential": [3, 3, 3, -7, -7, -7],
        "drive_time_of_possession": ["1:30"] * 3 + ["5:20"] * 3,
        "wp": [0.5] * 6, "half_seconds_remaining": [900] * 6,
    })


def test_pace_by_situation_and_possession():
    rows = _plays()
    pace = adv._pace(rows, neutral_clock=rows["wp"].between(0.2, 0.8))
    assert pace["plays_per_game"] == 6
    assert pace["seconds_per_play_h1"] == 30.0        # 30, 30
    assert pace["seconds_per_play_h2"] == 20.0        # 20; the 300s stoppage is dropped
    assert pace["seconds_per_play_leading"] == 30.0
    assert pace["seconds_per_play_trailing"] == 20.0
    assert pace["plays_per_game_h1"] == 3 and pace["plays_per_game_trailing"] == 3
    assert pace["time_of_possession"] == round((90 + 320) / 60, 2)
    assert pace["time_of_possession_h1"] == 1.5 and pace["time_of_possession_h2"] == round(320 / 60, 2)
