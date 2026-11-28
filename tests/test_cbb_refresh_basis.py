import unittest

from pipeline.cbb_public.export import correct_final_scores, live_cutoff
from scripts import publish_public_cbb as pub
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
    def test_official_score_correction_requires_the_known_final(self):
        old = {**final(401909694, '2026-11-02', 50, 52), 'home_score': 69, 'away_score': 112}
        stale, official = old.copy(), {**old, 'away_score': 113}
        other = {**old, 'game_id': 401909695}
        live = {**old, 'status_type_name': 'STATUS_IN_PROGRESS'}
        correct_final_scores([stale, official, other, live])
        self.assertEqual(stale, official)
        self.assertEqual(other['away_score'], 112)
        self.assertEqual(live['away_score'], 112)

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


class AlignmentAdmissionTests(unittest.TestCase):
    """A few teams' shot charts trail their rate row every night (9 of 365 in
    the 2026-11-25 publication, 11 the next day = 97.0%), which refused the
    whole desk for a fourth day. The floor is for the source-wide case."""

    def test_the_target_always_publishes(self):
        for published in (None, 0.2, 1.0):
            self.assertTrue(pub.alignment_admissible(0.97, published))
            self.assertTrue(pub.alignment_admissible(1.0, published))

    def test_no_worse_than_the_live_publication_publishes(self):
        self.assertTrue(pub.alignment_admissible(0.9699, 0.9753))
        self.assertTrue(pub.alignment_admissible(0.9753, 0.9753))

    def test_a_source_wide_stall_is_still_refused(self):
        # Basketball Quant stopped for five days: every team's sections disagree.
        self.assertFalse(pub.alignment_admissible(0.10, 0.9753))
        self.assertFalse(pub.alignment_admissible(0.60, 0.9753))

    def test_drift_cannot_accumulate_below_the_hard_floor(self):
        share = 0.9753
        for _ in range(20):
            if not pub.alignment_admissible(share - pub.ALIGNMENT_REGRESSION, share):
                break
            share -= pub.ALIGNMENT_REGRESSION
        self.assertGreaterEqual(share, pub.ALIGNMENT_HARD_FLOOR)
        self.assertFalse(pub.alignment_admissible(pub.ALIGNMENT_HARD_FLOOR - 0.001, share))

    def test_a_materially_worse_snapshot_is_refused(self):
        self.assertFalse(pub.alignment_admissible(0.94, 0.9753))

    def test_the_first_publication_must_meet_the_target(self):
        self.assertFalse(pub.alignment_admissible(0.95, None))
