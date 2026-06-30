from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import pandas as pd

from outputs import notify_mlb_model, push_supabase
from outputs.push_sheets import push_df
from scrapers.scrape_matchups import push_to_hub


class FakeWorksheet:
    def __init__(self) -> None:
        self.cleared = False
        self.updated = None

    def clear(self) -> None:
        self.cleared = True

    def update(self, data) -> None:
        self.updated = data


class FakeSheet:
    def __init__(self) -> None:
        self.worksheet_instance = FakeWorksheet()

    def worksheet(self, _name: str) -> FakeWorksheet:
        return self.worksheet_instance


class SheetsPublishContractTests(unittest.TestCase):
    def test_invalid_dataframe_is_rejected_before_clear(self) -> None:
        sheet = FakeSheet()
        frame = pd.DataFrame([{"Away": "", "Home": None}])

        with redirect_stdout(io.StringIO()):
            result = push_df(sheet, "Today_Matchups", frame)
        self.assertFalse(result)
        self.assertFalse(sheet.worksheet_instance.cleared)
        self.assertIsNone(sheet.worksheet_instance.updated)

    def test_valid_dataframe_clears_then_updates(self) -> None:
        sheet = FakeSheet()
        frame = pd.DataFrame(
            [{"Slate_Date": "2026-06-30", "Away": "NYY", "Home": "BOS"}]
        )

        with redirect_stdout(io.StringIO()):
            result = push_df(
                sheet,
                "Today_Matchups",
                frame,
                required_cols=["Slate_Date", "Away", "Home"],
            )
        self.assertTrue(result)
        self.assertTrue(sheet.worksheet_instance.cleared)
        self.assertEqual(
            sheet.worksheet_instance.updated[0],
            ["Slate_Date", "Away", "Home"],
        )


class HubPublishContractTests(unittest.TestCase):
    def test_direct_matchup_hub_push_rejects_missing_contract_columns(self) -> None:
        frame = pd.DataFrame([{"Slate_Date": "2026-06-30", "Away": "NYY"}])
        with patch("outputs.push_supabase.upsert_dataset") as upsert:
            with redirect_stdout(io.StringIO()):
                result = push_to_hub(frame)
        self.assertFalse(result)
        upsert.assert_not_called()

    def test_direct_matchup_hub_push_accepts_valid_slate(self) -> None:
        frame = pd.DataFrame(
            [
                {
                    "Slate_Date": "2026-06-30",
                    "Away": "NYY",
                    "Home": "BOS",
                    "Away_SP": "Pitcher A",
                    "Home_SP": "Pitcher B",
                }
            ]
        )
        with patch("outputs.push_supabase.upsert_dataset") as upsert:
            with redirect_stdout(io.StringIO()):
                result = push_to_hub(frame)
        self.assertTrue(result)
        upsert.assert_called_once()

    def test_mirror_reports_incomplete_validation(self) -> None:
        counts = {tab: 1 for tab in push_supabase.DEFAULT_TABS[:-1]}
        with (
            patch.object(push_supabase, "SUPABASE_URL", "https://example.invalid"),
            patch.object(push_supabase, "SUPABASE_SECRET_KEY", "secret"),
            patch.object(push_supabase, "push_datasets", return_value=counts),
            patch.object(push_supabase, "_build_team_rankings_snapshot"),
        ):
            with redirect_stdout(io.StringIO()):
                result = push_supabase.run()
        self.assertFalse(result)

    def test_mirror_reports_complete_validation(self) -> None:
        counts = {tab: 1 for tab in push_supabase.DEFAULT_TABS}
        with (
            patch.object(push_supabase, "SUPABASE_URL", "https://example.invalid"),
            patch.object(push_supabase, "SUPABASE_SECRET_KEY", "secret"),
            patch.object(push_supabase, "push_datasets", return_value=counts),
            patch.object(push_supabase, "_build_team_rankings_snapshot"),
        ):
            with redirect_stdout(io.StringIO()):
                result = push_supabase.run()
        self.assertTrue(result)


class ModelDispatchContractTests(unittest.TestCase):
    def test_token_dispatch_reports_success(self) -> None:
        with (
            patch.object(notify_mlb_model, "_token", return_value="token"),
            patch.object(notify_mlb_model, "_dispatch_with_token") as dispatch,
        ):
            with redirect_stdout(io.StringIO()):
                result = notify_mlb_model.run()
        self.assertTrue(result)
        dispatch.assert_called_once_with("token")

    def test_missing_dispatch_credentials_reports_failure(self) -> None:
        with (
            patch.object(notify_mlb_model, "_token", return_value=""),
            patch.object(notify_mlb_model.shutil, "which", return_value=None),
        ):
            with redirect_stdout(io.StringIO()):
                result = notify_mlb_model.run()
        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
