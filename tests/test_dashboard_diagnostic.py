from scripts.dashboard_diagnostic import names_match


def test_names_match_ignores_diacritics() -> None:
    assert names_match("Martín Pérez", "Martin Perez")
    assert names_match("Eury Pérez", "Eury Perez")
