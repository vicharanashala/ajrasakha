"""Tests for official LGD state and district normalization."""

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "acc_agent" / "lgd_location.py"
module_spec = importlib.util.spec_from_file_location(
    "acc_agent_lgd_location",
    MODULE_PATH,
)
assert module_spec and module_spec.loader
lgd_module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(lgd_module)

LgdLocationNormalizer = lgd_module.LgdLocationNormalizer
resolve_official_name = lgd_module.resolve_official_name


STATE_RECORDS = [
    {"state_code": 3, "state_name_english": "Punjab"},
    {"state_code": 21, "state_name_english": "Odisha"},
]

PUNJAB_DISTRICTS = [
    {
        "state_code": 3,
        "district_code": 41,
        "district_name_english": "Rupnagar",
    },
    {
        "state_code": 3,
        "district_code": 42,
        "district_name_english": "Sahibzada Ajit Singh Nagar",
    },
]


class LgdNameMatchingTests(unittest.TestCase):
    def test_state_suffix_and_case_are_normalized(self):
        result = resolve_official_name(
            "PUNJAB STATE",
            ["Punjab", "Haryana"],
            entity_type="state",
        )
        self.assertEqual(result, "Punjab")

    def test_state_historical_alias_resolves_to_official_name(self):
        result = resolve_official_name(
            "Orissa",
            ["Odisha", "Punjab"],
            entity_type="state",
            aliases=lgd_module._STATE_ALIASES,
        )
        self.assertEqual(result, "Odisha")

    def test_ambiguous_or_weak_match_is_rejected(self):
        result = resolve_official_name(
            "not a real place",
            ["Punjab", "Haryana"],
            entity_type="state",
        )
        self.assertIsNone(result)

    def test_minor_spelling_error_uses_conservative_fuzzy_match(self):
        result = resolve_official_name(
            "Rupnagr",
            ["Rupnagar", "Ludhiana"],
            entity_type="district",
        )
        self.assertEqual(result, "Rupnagar")


class LgdLocationNormalizerTests(unittest.IsolatedAsyncioTestCase):
    def make_normalizer(self):
        normalizer = LgdLocationNormalizer()

        async def fetch_records(url, *, filters=None):
            if url == normalizer.states_api_url:
                return STATE_RECORDS
            self.assertEqual(filters, {"state_code": 3})
            return PUNJAB_DISTRICTS

        normalizer._fetch_records = AsyncMock(side_effect=fetch_records)
        return normalizer

    async def test_district_alias_is_matched_only_inside_official_state(self):
        normalizer = self.make_normalizer()

        state, district = await normalizer.normalize(
            "Punjab state",
            "Ropar district",
        )

        self.assertEqual(state, "Punjab")
        self.assertEqual(district, "Rupnagar")

    async def test_unknown_district_becomes_all(self):
        normalizer = self.make_normalizer()

        state, district = await normalizer.normalize(
            "Punjab",
            "Imaginary District",
        )

        self.assertEqual(state, "Punjab")
        self.assertEqual(district, "All")

    async def test_unknown_state_becomes_all_without_district_lookup(self):
        normalizer = self.make_normalizer()

        state, district = await normalizer.normalize(
            "Imaginary State",
            "Rupnagar",
        )

        self.assertEqual((state, district), ("All", "All"))
        self.assertEqual(normalizer._fetch_records.await_count, 1)

    async def test_lgd_outage_preserves_extracted_values(self):
        original_normalizer = lgd_module._lgd_normalizer
        failing_normalizer = Mock()
        failing_normalizer.normalize = AsyncMock(
            side_effect=RuntimeError("service unavailable"),
        )
        lgd_module._lgd_normalizer = failing_normalizer
        try:
            state, district = await lgd_module.normalize_location_from_lgd(
                "Punjab",
                "Ropar",
            )
        finally:
            lgd_module._lgd_normalizer = original_normalizer

        self.assertEqual((state, district), ("Punjab", "Ropar"))


if __name__ == "__main__":
    unittest.main()
