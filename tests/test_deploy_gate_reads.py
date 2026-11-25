"""A dropped local connection must not read as a finding about the site.

The deploy gate crawls the site through a wrangler dev server. That server
drops a connection now and then under the crawl's load, and on 2026-11-25 one
reset while reading the CFB slate failed the whole deploy — on a file the
change had not touched — leaving the site on the previous build until the job
was re-run by hand.
"""
import unittest

try:  # playwright is installed for the browser jobs, not for the unit job
    from scripts.public_site_runtime_diag import TRANSIENT_READ, fetch
    from playwright.sync_api import Error as PlaywrightError
except Exception:  # pragma: no cover - exercised by the release job
    fetch = None


class FakePage:
    """Stands in for a Playwright page whose request context misbehaves."""

    def __init__(self, failures, message):
        self.request = self
        self.failures = failures
        self.message = message
        self.calls = 0

    def get(self, url, **options):
        self.calls += 1
        if self.calls <= self.failures:
            # A fresh instance each time: re-raising one object would make its
            # __context__ point at itself and blow the stack, which is a fact
            # about Python, not about the retry.
            raise PlaywrightError(self.message)
        return {"url": url, "options": options}


@unittest.skipIf(fetch is None, "playwright is not installed in this job")
class TransientReadTests(unittest.TestCase):
    def test_a_dropped_connection_is_read_again(self):
        page = FakePage(2, "APIRequestContext.get: read ECONNRESET")
        self.assertEqual(fetch(page, "http://127.0.0.1:8765/data/public/cfb/slate.json")["url"],
                         "http://127.0.0.1:8765/data/public/cfb/slate.json")
        self.assertEqual(page.calls, 3)

    def test_a_connection_that_never_comes_back_still_fails(self):
        page = FakePage(99, "APIRequestContext.get: read ECONNRESET")
        with self.assertRaises(PlaywrightError):
            fetch(page, "http://127.0.0.1:8765/")
        # Bounded: it gives up rather than hanging the gate.
        self.assertEqual(page.calls, 4)

    def test_a_real_failure_is_not_retried_away(self):
        page = FakePage(1, "Target page, context or browser has been closed")
        with self.assertRaises(PlaywrightError):
            fetch(page, "http://127.0.0.1:8765/")
        self.assertEqual(page.calls, 1, "only a dropped connection is worth another read")

    def test_the_gate_scripts_do_not_read_around_the_guard(self):
        """Exactly one raw read per script: the one inside fetch() itself.
        Every other call site must go through it, or a reset there still
        fails a deploy."""
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        for name in ("public_site_runtime_diag.py", "public_boundary_crawl.py"):
            text = (root / "scripts" / name).read_text(encoding="utf-8")
            self.assertEqual(text.count("page.request.get("), 1,
                             f"{name} must read through fetch(), which retries a dropped connection")
            self.assertNotIn("return fetch(page, url)", text,
                             f"{name}: fetch() must call the request context, not itself")

    def test_the_reset_that_failed_the_deploy_is_covered(self):
        self.assertTrue(any(t in "APIRequestContext.get: read ECONNRESET" for t in TRANSIENT_READ))
