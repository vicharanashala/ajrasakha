"""Focused tests for ACC transcript extraction scopes."""

import importlib.util
import unittest
from pathlib import Path


EXTRACTION_MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "acc_agent" / "extraction.py"
)
module_spec = importlib.util.spec_from_file_location(
    "acc_agent_extraction",
    EXTRACTION_MODULE_PATH,
)
assert module_spec and module_spec.loader
extraction_module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(extraction_module)

build_extraction_update = extraction_module.build_extraction_update
normalize_extraction_type = extraction_module.normalize_extraction_type


SAMPLE_EXTRACTION = {
    "query": "Irrigation techniques for wheat",
    "crop": "Wheat",
    "state": "Punjab",
    "district": "Rupnagar",
    "standardized_domains": ["Irrigation and Water Management"],
    "name": "Ramesh Kumar",
    "phone": "9876543210",
    "age": 42,
    "gender": "Male",
    "village": "Morinda",
    "block": "Chamkaur Sahib",
    "primary_crop": "Wheat",
}


class AccAgentExtractionTests(unittest.TestCase):
    def test_missing_extraction_type_preserves_legacy_all_behavior(self):
        self.assertEqual(normalize_extraction_type(None), "all")
        self.assertEqual(normalize_extraction_type(""), "all")

    def test_invalid_extraction_type_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid extraction_type"):
            normalize_extraction_type("profile")

    def test_farmer_details_contains_only_profile_and_location_fields(self):
        result = build_extraction_update(SAMPLE_EXTRACTION, "farmer_details")

        self.assertEqual(result["extraction_type"], "farmer_details")
        self.assertEqual(result["extracted_name"], "Ramesh Kumar")
        self.assertEqual(result["extracted_state"], "Punjab")
        self.assertEqual(result["extracted_district"], "Rupnagar")
        self.assertEqual(result["extracted_primary_crop"], "Wheat")
        self.assertNotIn("extracted_query", result)
        self.assertNotIn("extracted_crop", result)
        self.assertNotIn("standardized_domains", result)

    def test_query_details_contains_only_query_and_location_fields(self):
        result = build_extraction_update(SAMPLE_EXTRACTION, "query_details")

        self.assertEqual(result["extraction_type"], "query_details")
        self.assertEqual(
            result["extracted_query"],
            "Irrigation techniques for wheat",
        )
        self.assertEqual(result["extracted_crop"], "Wheat")
        self.assertEqual(result["extracted_state"], "Punjab")
        self.assertEqual(
            result["standardized_domains"],
            ["Irrigation and Water Management"],
        )
        self.assertNotIn("extracted_name", result)
        self.assertNotIn("extracted_phone", result)
        self.assertNotIn("extracted_primary_crop", result)

    def test_all_contains_query_and_farmer_fields(self):
        result = build_extraction_update(SAMPLE_EXTRACTION, "all")

        self.assertEqual(result["extraction_type"], "all")
        self.assertEqual(
            result["extracted_query"],
            "Irrigation techniques for wheat",
        )
        self.assertEqual(result["extracted_name"], "Ramesh Kumar")
        self.assertEqual(result["extracted_primary_crop"], "Wheat")


if __name__ == "__main__":
    unittest.main()
