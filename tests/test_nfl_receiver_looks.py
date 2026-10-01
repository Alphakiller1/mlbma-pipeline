"""Receiver splits carry success rate and the play-action / motion looks."""
import pandas as pd

from outputs import nfl_advanced_context as adv


def _targets():
    return pd.DataFrame({
        "complete_pass": [1, 0, 1, 1],
        "receiving_yards": [12, 0, 4, 30],
        "pass_touchdown": [0, 0, 0, 1],
        "epa": [0.8, -0.6, -0.2, 2.5],
        "success": [1, 0, 0, 1],
        "is_play_action": [True, False, None, True],
        "is_motion": [False, False, True, None],
    })


def test_receiver_stats_include_success_rate():
    stats = adv._receiver_stats(_targets())
    assert stats["success_rate"] == 0.5
    assert stats["targets"] == 4


def test_receiver_masks_split_play_action_and_motion_with_complements():
    rows = _targets()
    masks = adv._split_masks(rows, "REC")
    assert int(masks["play_action"].sum()) == 2
    assert int(masks["no_play_action"].sum()) == 1     # the uncharted play is in neither
    assert int(masks["motion"].sum()) == 1
    assert int(masks["no_motion"].sum()) == 2


def test_backs_and_passers_do_not_get_receiver_scheme_looks():
    masks = adv._split_masks(_targets(), "RB")
    assert "play_action" not in masks and "motion" not in masks
