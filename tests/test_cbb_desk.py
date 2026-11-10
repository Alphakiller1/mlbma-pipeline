from pathlib import Path
import json,unittest
ROOT=Path(__file__).resolve().parents[1]

class CbbDeskTests(unittest.TestCase):
    def test_two_season_cohort_and_reference_charts(self):
        for year in [2026,2027]:
            directory=ROOT/f'data/public/cbb/{year}/teams'
            self.assertEqual(len(list(directory.glob('*.json'))),365)
            for tid in [96,150,127,12,2305,2509]:
                c=json.loads((directory/f'{tid}.json').read_text(encoding='utf-8'))
                for profile in c['shots']['cbb'].values():
                    self.assertEqual(sum(z['attempts'] for z in profile['zones']),profile['totals']['attempts'])
                    self.assertEqual(sum(z['made'] for z in profile['zones']),profile['totals']['made'])

    def test_routes_use_the_shared_matchup_owners(self):
        for name in ['index.html','matchups.html','matchup.html','shot-charts.html']:
            text=(ROOT/'cbb'/name).read_text(encoding='utf-8')
            self.assertIn('/dashboard/sports/cbb.js',text)
            self.assertNotIn('/dashboard/sports/mlb.js',text)
        self.assertIn('public_game_detail.js',(ROOT/'cbb/matchup.html').read_text())
        nav=(ROOT/'dashboard/chase_nav.html').read_text(encoding='utf-8')
        self.assertIn('data-nav="cbb"',nav);self.assertNotIn('data-nav="mlb"',nav)
        self.assertIn('url=/',(ROOT/'mlb/index.html').read_text())

    def test_matchup_rank_samples_match_the_published_team_evidence(self):
        from pipeline.cbb_public.export import grade_baselines,split_matchup_ranks
        root=ROOT/'data/public/cbb'
        contexts={(year,f.stem):json.loads(f.read_text(encoding='utf-8')) for year in (2026,2027)
                  for f in (root/f'{year}/teams').glob('*.json')}
        observed=split_matchup_ranks({str(y):grade_baselines(contexts,y) for y in (2026,2027)})
        expected=json.loads((root/'matchup-ranks.json').read_text(encoding='utf-8'))
        self.assertEqual(observed,expected)
        for (year,team),context in contexts.items():
            if year==2027 and any(game['state']=='post' for game in context['games']):
                players=context['players']+(context.get('official_box') or {}).get('players',[])
                self.assertTrue(any(p.get('G') for p in players),team)

    def test_model_scores_are_separate_and_margin_sign_is_correct(self):
        board=json.loads((ROOT/'functions/api/model-center/cbb-board.json').read_text(encoding='utf-8'))['board']
        self.assertFalse(board['may_bet'])
        for g in board['games']:
            self.assertAlmostEqual(g['projected_home']-g['projected_away'],g['model_margin'])
            self.assertNotIn('win_probability',g)
        for p in (ROOT/'data/public/cbb').rglob('*.json'):
            raw=p.read_text(encoding='utf-8')
            for forbidden in ['"projected_home"','"win_probability"','"model_margin"']:
                self.assertNotIn(forbidden,raw)

if __name__=='__main__':unittest.main()
