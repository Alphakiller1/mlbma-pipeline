from __future__ import annotations

import unittest

from outputs.validate import check_dataframe, check_rows, is_ok


class FakeDataFrame:
    def __init__(self, rows: list[dict], columns: list[str]) -> None:
        self._rows = rows
        self.columns = columns

    def __len__(self) -> int:
        return len(self._rows)

    def to_dict(self, *, orient: str) -> list[dict]:
        if orient != "records":
            raise ValueError(f"unsupported orient: {orient}")
        return self._rows


class ValidateRowsTests(unittest.TestCase):
    def test_accepts_valid_rows(self) -> None:
        problems = check_rows(
            "Today_Matchups",
            [{"game_id": "123", "Away": "NYY", "Home": "BOS"}],
            required_keys=["game_id", "Away", "Home"],
        )
        self.assertTrue(is_ok(problems))

    def test_rejects_empty_rows(self) -> None:
        self.assertIn(
            "Today_Matchups: 0 row(s) < required minimum 1",
            check_rows("Today_Matchups", []),
        )

    def test_rejects_missing_required_keys(self) -> None:
        problems = check_rows(
            "Today_Matchups",
            [{"Away": "NYY"}],
            required_keys=["Away", "Home"],
        )
        self.assertIn(
            "Today_Matchups: missing required column(s): ['Home']",
            problems,
        )

    def test_rejects_error_page_headers(self) -> None:
        problems = check_rows("Today_Matchups", [{"<!DOCTYPE html>": "error"}])
        self.assertTrue(any("header looks like an error/HTML page" in p for p in problems))

    def test_rejects_all_blank_rows(self) -> None:
        problems = check_rows("Today_Matchups", [{"Away": "", "Home": "  "}])
        self.assertIn("Today_Matchups: every cell is blank (1 empty rows)", problems)

    def test_rejects_non_dict_row_after_first_row(self) -> None:
        problems = check_rows("Today_Matchups", [{"Away": "NYY"}, "bad-row"])
        self.assertIn(
            "Today_Matchups: rows are not dict objects (got str)",
            problems,
        )


class ValidateDataFrameTests(unittest.TestCase):
    def test_accepts_valid_dataframe_shape(self) -> None:
        frame = FakeDataFrame([{"game_id": "123"}], ["game_id", "Away", "Home"])
        problems = check_dataframe(
            "Today_Matchups",
            frame,
            required_cols=["game_id", "Away", "Home"],
        )
        self.assertTrue(is_ok(problems))

    def test_rejects_empty_dataframe(self) -> None:
        frame = FakeDataFrame([], ["game_id"])
        self.assertIn(
            "Today_Matchups: 0 row(s) < required minimum 1",
            check_dataframe("Today_Matchups", frame),
        )

    def test_rejects_missing_dataframe_columns(self) -> None:
        frame = FakeDataFrame([{"Away": "NYY"}], ["Away"])
        problems = check_dataframe(
            "Today_Matchups",
            frame,
            required_cols=["Away", "Home"],
        )
        self.assertIn(
            "Today_Matchups: missing required column(s): ['Home']",
            problems,
        )

    def test_rejects_dataframe_error_headers(self) -> None:
        frame = FakeDataFrame(
            [{"<html>Error</html>": "temporarily unavailable"}],
            ["<html>Error</html>"],
        )
        problems = check_dataframe("Today_Matchups", frame)
        self.assertTrue(any("header looks like an error/HTML page" in p for p in problems))

    def test_rejects_all_blank_dataframe(self) -> None:
        frame = FakeDataFrame([{"Away": "", "Home": None}], ["Away", "Home"])
        problems = check_dataframe("Today_Matchups", frame)
        self.assertIn("Today_Matchups: every cell is blank (1 empty rows)", problems)


if __name__ == "__main__":
    unittest.main()
