import unittest

from scripts.diag_console import is_ignorable_console


class DiagConsoleTests(unittest.TestCase):
    def test_supabase_cors_from_localhost_is_ignorable(self) -> None:
        self.assertTrue(
            is_ignorable_console(
                "Access to fetch at 'https://mvxjcfriirguhjujurhf.supabase.co/rest/v1/hub_dataset"
                "?name=eq.Team_Results&select=rows' from origin 'http://127.0.0.1:8765' has been "
                "blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on "
                "the requested resource."
            )
        )
        self.assertTrue(is_ignorable_console("Failed to load resource: net::ERR_FAILED"))

    def test_real_exceptions_are_not_ignored(self) -> None:
        self.assertFalse(
            is_ignorable_console("Uncaught TypeError: Cannot read properties of null")
        )
        self.assertFalse(
            is_ignorable_console(
                "Failed to load resource: the server responded with a status of 404"
            )
        )
