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

class CbbMatchupLayoutTests(unittest.TestCase):
    """The owner's desk rules, held for the CBB matchup page."""
    def setUp(self):
        js=(ROOT/'dashboard/public_game_detail.js').read_text(encoding='utf-8')
        self.block=js[js.index('  var CBB_TABS = ['):js.index('  function deskTabsFor(sport) {')]

    def test_tabs_read_in_matchup_order_and_hold_every_section_once(self):
        import re
        tabs=re.findall(r"\['(\w+)','[^']+',\[([^\]]*)\]\]",self.block[:self.block.index('];')])
        self.assertEqual([t for t,_ in tabs],['units','shooting','possessions','defense','roster','games'])
        ids=[i for _,body in tabs for i in re.findall(r"'(cbb-[\w-]+)'",body)]
        self.assertEqual(len(ids),len(set(ids)))
        rendered=re.findall(r"part\('(cbb-[\w-]+)'",self.block)
        self.assertEqual(rendered,ids,'sections render in tab order')
        self.assertLess(ids.index('cbb-availability'),ids.index('cbb-rotation'))

    def test_no_explanations_or_verdict_columns(self):
        import re
        panels=self.block[self.block.index('  function cbbControls('):]
        for para in re.findall(r'<p class="ca-cbb-note[^"]*"',panels):
            self.assertIn('ca-cbb-cite',para,'CBB notes are citation links only')
        self.assertNotIn('FG% gap',self.block)
        self.assertNotIn('Share gap',self.block)
        self.assertNotIn('League film reference',self.block)

    def test_one_tone_per_zone_on_court_and_table(self):
        charts=(ROOT/'dashboard/cbb_charts.js').read_text(encoding='utf-8')
        self.assertIn('options.tones',charts)
        self.assertIn('tones:tones',self.block)
        # Allowed FG% and allowed shot share both rank the low end first.
        self.assertIn("cbbComparison(game,'shot_accuracy',key,z.fg_pct,!onDefense)",self.block)
        self.assertIn("cbbComparison(game,'shot_share',key,z.shot_share,!onDefense)",self.block)
        css=(ROOT/'dashboard/styles/chase-public.css').read_text(encoding='utf-8')
        self.assertNotIn('.ca-cbb-zone-table td:nth-child(3){display:none}',css)

    def test_season_samples_share_one_game_basis(self):
        export=(ROOT/'pipeline/cbb_public/export.py').read_text(encoding='utf-8')
        self.assertIn("AND home_id IN ({division}) AND away_id IN ({division})",export)
        teams=json.loads((ROOT/'data/public/cbb/teams.json').read_text(encoding='utf-8'))['teams']
        aligned=total=0
        for f in (ROOT/'data/public/cbb/2027/teams').glob('*.json'):
            c=json.loads(f.read_text(encoding='utf-8'))
            if not c['rates'].get('games_all'):continue
            total+=1
            shots=c['shots']['coordinates']['offense']['totals']['games']
            pace=((c.get('official_box') or {}).get('pace') or {}).get('games')
            aligned+=shots==c['rates']['games_all'] and pace in (c['rates']['games_all'],c['rates']['games_all']-1)
        self.assertGreaterEqual(aligned/total,0.97)
        for key in ('fb_pts_per100_all','stl_pct_d_all','pts_off_to_per_dposs_all'):
            self.assertIn(key,json.loads((ROOT/'data/public/cbb/2027/teams/150.json').read_text(encoding='utf-8'))['rates'])

if __name__=='__main__':unittest.main()
