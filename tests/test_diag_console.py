from scripts.diag_console import is_ignorable_console


def test_supabase_cors_from_localhost_is_ignorable() -> None:
    assert is_ignorable_console(
        "Access to fetch at 'https://mvxjcfriirguhjujurhf.supabase.co/rest/v1/hub_dataset"
        "?name=eq.Team_Results&select=rows' from origin 'http://127.0.0.1:8765' has been "
        "blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on "
        "the requested resource."
    )
    assert is_ignorable_console("Failed to load resource: net::ERR_FAILED")


def test_real_exceptions_are_not_ignored() -> None:
    assert not is_ignorable_console("Uncaught TypeError: Cannot read properties of null")
    assert not is_ignorable_console("Failed to load resource: the server responded with a status of 404")
