from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class PipelineOrderTests(unittest.TestCase):
    def test_slate_publishes_before_statcast_mix(self) -> None:
        src = (ROOT / "pipeline" / "main.py").read_text(encoding="utf-8")
        self.assertLess(src.find("SCRIPTS_SLATE"), src.find("SCRIPTS_HEAVY"))
        run_fn = src.split("def run(", 1)[1]
        self.assertLess(run_fn.find("run_lineups()"), run_fn.find("SCRIPTS_HEAVY"))
        self.assertLess(run_fn.find("run_matchups()"), run_fn.find("SCRIPTS_HEAVY"))
        self.assertIn("scrapers.scrape_pitch_mix", src.split("SCRIPTS_HEAVY", 1)[1][:400])
        self.assertNotIn("scrapers.scrape_pitch_mix", src.split("SCRIPTS_OPTIONAL", 1)[1].split("SCRIPTS_HEAVY", 1)[0])

    def test_ci_workflow_keeps_reusable_statcast_cache(self) -> None:
        yml = (ROOT / ".github" / "workflows" / "run-pipeline.yml").read_text(encoding="utf-8")
        self.assertNotIn("${{ github.run_id }}", yml)
        self.assertIn("timeout-minutes: 90", yml)
        self.assertIn("python -u -m pipeline.main --skip-fangraphs", yml)

    def test_ci_publishes_every_artifact_the_run_regenerates(self) -> None:
        """The NFL slate was kept out of this list on purpose, and that was the
        wrong place for the guard.

        The reason for excluding it was real: this run rebuilds the NFL slate
        from a model board that fails soft, so a day with an unreachable board
        would have overwritten a good slate with a scheme-less one. But excluding
        it meant the pipeline regenerated the slate correctly every day and threw
        the result away - it sat on week 2 with two games already final while the
        site served it. The guard now lives where the risk is: write_if_better
        refuses to publish a slate that loses scheme or form wholesale. So the
        files the run regenerates are the files it commits.
        """
        yml = (ROOT / ".github" / "workflows" / "run-pipeline.yml").read_text(
            encoding="utf-8")
        self.assertIn("contents: write", yml)
        self.assertIn("Publish refreshed public artifacts to master", yml)
        self.assertIn("python scripts/validate_public_fields.py", yml)
        published = yml.split("public_files=(", 1)[1].split("\n          )", 1)[0]
        for artifact in ("data/public/mlb/slate.json", "data/public/nfl/slate.json",
                         "data/public/nfl/team_context.json",
                         "data/public/league_baselines.json"):
            self.assertIn(artifact, published, f"{artifact} is regenerated but never published")
        publisher = (ROOT / "outputs" / "publish_public_slate.py").read_text(encoding="utf-8")
        self.assertIn("GUARDED_EVIDENCE", publisher)
        self.assertIn("_lost_evidence", publisher)
        self.assertIn('git pull --rebase origin "$TARGET_BRANCH"', yml)
        self.assertIn('git push origin "HEAD:$TARGET_BRANCH"', yml)


class DeployReachesTheSiteTests(unittest.TestCase):
    def test_a_pipeline_refresh_triggers_the_production_deploy(self) -> None:
        """Committing data to master is not publishing it.

        The pipeline pushes with GITHUB_TOKEN, and GitHub raises no `push` event
        for such commits, so the deploy never fired: fresh artifacts sat on master
        until an unrelated human push carried them. The site served a two-day-old
        MLB slate and a week-old NFL slate while master had both current.
        """
        yml = (ROOT / ".github" / "workflows" / "cloudflare-deploy.yml").read_text(
            encoding="utf-8")
        self.assertIn("workflow_run:", yml)
        self.assertIn('workflows: ["Run MLBMA Pipeline"]', yml)
        # And a failed pipeline must not ship.
        self.assertIn("github.event.workflow_run.conclusion == 'success'", yml)


class SlatePublishGuardTests(unittest.TestCase):
    """A slate with every fixture listed and no evidence behind it must not
    overwrite one that has it - and a normal day must still publish."""

    def _slate(self, games, scheme=True, form=True, lineup=False):
        out = {"games": []}
        for i in range(games):
            game = {"id": i}
            if scheme:
                game["away_scheme"] = {"offense": {}}
                game["home_scheme"] = {"offense": {}}
            if form:
                game["away_form"] = {"off_epa": {}}
            if lineup:
                game["away_lineup"] = [{"id": 1}]
            out["games"].append(game)
        return out

    def _write(self, payload):
        import json
        import tempfile
        path = Path(tempfile.mkdtemp()) / "slate.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_a_slate_that_lost_its_scheme_is_refused(self):
        from outputs.publish_public_slate import _lost_evidence
        published = self._write(self._slate(16))
        reason = _lost_evidence(self._slate(16, scheme=False, form=False), published)
        self.assertIsNotNone(reason)
        self.assertIn("scheme", reason)

    def test_a_normal_refresh_publishes(self):
        from outputs.publish_public_slate import _lost_evidence
        published = self._write(self._slate(16))
        self.assertIsNone(_lost_evidence(self._slate(13), published))

    def test_lineups_arriving_late_are_not_treated_as_a_loss(self):
        """MLB lineups are posted through the afternoon; a morning slate without
        them is the truth, not a failed build."""
        from outputs.publish_public_slate import _lost_evidence
        published = self._write(self._slate(10, scheme=False, form=False, lineup=True))
        self.assertIsNone(
            _lost_evidence(self._slate(10, scheme=False, form=False, lineup=False), published))

    def test_a_first_publish_has_nothing_to_compare(self):
        from outputs.publish_public_slate import _lost_evidence
        self.assertIsNone(_lost_evidence(self._slate(16), Path("nope/none.json")))
