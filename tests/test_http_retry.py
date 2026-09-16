"""A server saying "not now" must not end the daily pipeline.

On 2026-09-15 a single 502 from Baseball Savant, on one of sixty team-split
requests, aborted the whole scheduled run: `raise_for_status()` raises an
HTTPError, and the transient check only matched connection-level wording, so the
request re-raised on the first attempt with no retry. The run died, the publish
step never ran, and the public MLB slate sat two days stale on the site.
"""
from __future__ import annotations

import unittest
from unittest import mock

import requests

from core import http_retry


def _response(status: int, headers: dict | None = None) -> requests.Response:
    response = requests.Response()
    response.status_code = status
    response.url = "https://example.test/x"
    response.headers.update(headers or {})
    return response


class RetryStatusTest(unittest.TestCase):
    def _run(self, statuses, **kwargs):
        """Serve `statuses` in order; the last entry is what the caller sees."""
        calls = {"n": 0}

        def fake_get(*_args, **_kwargs):
            response = statuses[min(calls["n"], len(statuses) - 1)]
            calls["n"] += 1
            return response

        with mock.patch.object(http_retry._SESSION, "get", side_effect=fake_get), \
                mock.patch.object(http_retry.time, "sleep") as slept:
            try:
                result = http_retry.get_with_retry("https://example.test/x", **kwargs)
                error = None
            except requests.RequestException as exc:
                result, error = None, exc
        return calls["n"], result, error, slept

    def test_a_bad_gateway_is_retried(self):
        attempts, result, error, _ = self._run(
            [_response(502), _response(502), _response(200)], retries=4, backoff=0)
        self.assertIsNone(error)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(attempts, 3)

    def test_rate_limiting_and_gateway_timeouts_are_retried(self):
        for status in (429, 500, 503, 504, 408):
            with self.subTest(status=status):
                attempts, _, _, _ = self._run(
                    [_response(status)], retries=3, backoff=0)
                self.assertEqual(attempts, 3, f"{status} should be retried")

    def test_a_real_refusal_is_not_retried(self):
        """404 and 403 are answers, not weather: fail fast rather than hammering."""
        for status in (400, 403, 404):
            with self.subTest(status=status):
                attempts, _, error, _ = self._run(
                    [_response(status)], retries=4, backoff=0)
                self.assertEqual(attempts, 1)
                self.assertIsInstance(error, requests.RequestException)

    def test_retry_after_is_honoured_and_capped(self):
        _, _, _, slept = self._run(
            [_response(429, {"Retry-After": "7"}), _response(200)], retries=3, backoff=99)
        slept.assert_called_once_with(7.0)

        _, _, _, slept = self._run(
            [_response(429, {"Retry-After": "9999"}), _response(200)], retries=3, backoff=99)
        slept.assert_called_once_with(http_retry._RETRY_AFTER_CAP)

    def test_a_nonsense_retry_after_falls_back_to_backoff(self):
        _, _, _, slept = self._run(
            [_response(503, {"Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT"}),
             _response(200)], retries=3, backoff=2)
        slept.assert_called_once_with(2.0)

    def test_the_exhausted_error_still_reaches_the_caller(self):
        attempts, _, error, _ = self._run([_response(502)], retries=2, backoff=0)
        self.assertEqual(attempts, 2)
        self.assertIsInstance(error, requests.RequestException)


class PublishedArtifactsTest(unittest.TestCase):
    def test_ci_commits_every_public_artifact_the_pipeline_writes(self):
        """A file the publish step writes but CI never commits is stale by design."""
        from pathlib import Path
        root = Path(__file__).resolve().parent.parent
        workflow = (root / ".github" / "workflows" / "run-pipeline.yml").read_text(encoding="utf-8")
        for artifact in ("data/public/mlb/slate.json", "data/public/nfl/slate.json",
                         "data/public/nfl/team_context.json", "data/public/team_context.json",
                         "data/public/league_baselines.json", "data/public/starter_splits.json"):
            self.assertIn(artifact, workflow, f"{artifact} is written but never published")


if __name__ == "__main__":
    unittest.main()
