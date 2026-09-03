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
    "secondary_crops": ["Mustard", "Maize"],
    "language_preference": "Hindi",
    "years_of_experience": 18,
    "highest_education": "Class 12",
    "smartphones_at_home": 2,
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
        self.assertEqual(
            result["extracted_secondary_crops"],
            ["Mustard", "Maize"],
        )
        self.assertEqual(result["extracted_language_preference"], "Hindi")
        self.assertEqual(result["extracted_years_of_experience"], 18)
        self.assertEqual(result["extracted_highest_education"], "Class 12")
        self.assertEqual(result["extracted_smartphones_at_home"], 2)
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
        self.assertNotIn("extracted_secondary_crops", result)
        self.assertNotIn("extracted_language_preference", result)
        self.assertNotIn("extracted_years_of_experience", result)
        self.assertNotIn("extracted_highest_education", result)
        self.assertNotIn("extracted_smartphones_at_home", result)

    def test_all_contains_query_and_farmer_fields(self):
        result = build_extraction_update(SAMPLE_EXTRACTION, "all")

        self.assertEqual(result["extraction_type"], "all")
        self.assertEqual(
            result["extracted_query"],
            "Irrigation techniques for wheat",
        )
        self.assertEqual(result["extracted_name"], "Ramesh Kumar")
        self.assertEqual(result["extracted_primary_crop"], "Wheat")
        self.assertEqual(
            result["extracted_secondary_crops"],
            ["Mustard", "Maize"],
        )
        self.assertEqual(result["extracted_language_preference"], "Hindi")
        self.assertEqual(result["extracted_years_of_experience"], 18)
        self.assertEqual(result["extracted_highest_education"], "Class 12")
        self.assertEqual(result["extracted_smartphones_at_home"], 2)

    def test_secondary_crops_are_cleaned_and_exclude_the_primary_crop(self):
        result = build_extraction_update(
            {
                "primary_crop": "Cotton",
                "secondary_crops": [
                    " Wheat ",
                    "cotton",
                    "Dal",
                    "wheat",
                    None,
                    "Unknown",
                ],
            },
            "farmer_details",
        )

        self.assertEqual(result["extracted_primary_crop"], "Cotton")
        self.assertEqual(result["extracted_secondary_crops"], ["Wheat", "Dal"])

    def test_missing_secondary_crops_returns_an_empty_list(self):
        result = build_extraction_update(
            {"primary_crop": "Cotton"},
            "farmer_details",
        )

        self.assertEqual(result["extracted_secondary_crops"], [])

    def test_missing_or_invalid_new_farmer_fields_return_none(self):
        result = build_extraction_update(
            {
                "years_of_experience": -1,
                "smartphones_at_home": "not specified",
            },
            "farmer_details",
        )

        self.assertIsNone(result["extracted_language_preference"])
        self.assertIsNone(result["extracted_years_of_experience"])
        self.assertIsNone(result["extracted_highest_education"])
        self.assertIsNone(result["extracted_smartphones_at_home"])


if __name__ == "__main__":
    unittest.main()
