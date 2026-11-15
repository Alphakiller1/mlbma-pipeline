import unittest

from pipeline.cbb_public.export import live_cutoff
from scripts.publish_public_cbb import aligned_sample_share


def final(game_id, day, home, away):
    return {
        'game_id': game_id,
        'game_date': day,
        'home_id': home,
        'away_id': away,
        'status_type_name': 'STATUS_FINAL',
    }


class CbbRefreshBasisTests(unittest.TestCase):
    def test_rates_can_lag_two_fixture_days(self):
        stats = [{'team_id': team, 'games_all': 1} for team in (1, 2, 3, 4)]
        schedule = [
            final(10, '2026-11-12', 1, 2),
            final(11, '2026-11-12', 3, 4),
            final(12, '2026-11-13', 1, 3),
            final(13, '2026-11-14', 2, 4),
        ]
        self.assertEqual(live_cutoff(stats, schedule, '2026-11-15'), '2026-11-12')

    def test_current_rates_keep_the_requested_day(self):
        stats = [{'team_id': team, 'games_all': 1} for team in (1, 2)]
        game = final(10, '2026-11-14', 1, 2)
        self.assertEqual(live_cutoff(stats, [game, game], '2026-11-15'), '2026-11-15')

    def test_reconciliation_excludes_unrated_teams_and_allows_one_missing_box(self):
        def context(rates, shots, pace):
            return {
                'rates': {'games_all': rates},
                'shots': {'coordinates': {'offense': {'totals': {'games': shots}}}},
                'official_box': {'pace': {'games': pace}},
            }

        self.assertEqual(aligned_sample_share([
            context(2, 2, 2), context(2, 2, 1), context(2, 3, 3), context(0, 0, 0),
        ]), 2 / 3)
        self.assertEqual(aligned_sample_share([context(0, 0, 0)]), 1.0)
