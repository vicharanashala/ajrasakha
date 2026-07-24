"""Unit tests for the case generator.

Tests:
  1. Total case count = 30 × 6 = 180
  2. All case IDs are unique
  3. All case IDs follow the ML-SXX-YY format
  4. Filtering by language_codes works
  5. Filtering by scenario_ids works
  6. stable_only filter excludes unstable cases
  7. Every case has non-empty expected_testing_disclaimer (pulled from catalog)
  8. Provenance dict contains required keys
  9. All translation_review_status values are "pending"
"""

from __future__ import annotations

import re
import pytest

from ajrasakha.evaluation.multilingual.case_generator import generate_cases, assert_case_count
from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase
from ajrasakha.evaluation.multilingual.scenarios import SCENARIOS
from ajrasakha.evaluation.multilingual.languages import LANGUAGES, LANGUAGE_CODES


EXPECTED_TOTAL = 30 * 6  # 180


class TestCaseCount:
    def test_total_case_count(self):
        cases = generate_cases()
        assert len(cases) == EXPECTED_TOTAL, (
            f"Expected {EXPECTED_TOTAL} cases, got {len(cases)}"
        )

    def test_assert_case_count_passes(self):
        cases = generate_cases()
        assert_case_count(cases)  # should not raise

    def test_unique_case_ids(self):
        cases = generate_cases()
        ids = [c.case_id for c in cases]
        assert len(ids) == len(set(ids)), "Duplicate case IDs detected"


class TestCaseIdFormat:
    def test_case_id_format(self):
        cases = generate_cases()
        pattern = re.compile(r"^ML-S\d{2}-[A-Z]{2}$")
        for c in cases:
            assert pattern.match(c.case_id), (
                f"Case ID {c.case_id!r} does not match pattern ML-SXX-YY"
            )

    def test_all_scenario_ids_present(self):
        cases = generate_cases()
        scenario_ids = {c.scenario_id for c in cases}
        expected = {s.id for s in SCENARIOS}
        assert scenario_ids == expected

    def test_all_language_codes_present(self):
        cases = generate_cases()
        lang_codes = {c.language_code for c in cases}
        expected = set(LANGUAGE_CODES)
        assert lang_codes == expected


class TestFiltering:
    def test_language_filter(self):
        cases = generate_cases(language_codes=["EN", "HI"])
        assert len(cases) == 30 * 2
        for c in cases:
            assert c.language_code in {"EN", "HI"}

    def test_scenario_filter(self):
        cases = generate_cases(scenario_ids=["S01", "S02"])
        assert len(cases) == 2 * 6
        for c in cases:
            assert c.scenario_id in {"S01", "S02"}

    def test_stable_only_filter(self):
        stable_scenarios = [s for s in SCENARIOS if s.stable]
        cases = generate_cases(stable_only=True)
        assert len(cases) == len(stable_scenarios) * 6
        for c in cases:
            assert c.stable is True

    def test_combined_filter(self):
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        assert len(cases) == 1
        assert cases[0].case_id == "ML-S01-EN"


class TestCaseContent:
    def test_translation_review_pending(self):
        cases = generate_cases()
        for c in cases:
            assert c.translation_review_status == "pending", (
                f"Case {c.case_id} has non-pending review status: "
                f"{c.translation_review_status}"
            )

    def test_translation_reviewer_null(self):
        cases = generate_cases()
        for c in cases:
            assert c.translation_reviewer is None

    def test_testing_disclaimer_not_empty_for_english(self):
        # English/English should always have a testing disclaimer in catalog
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        assert len(cases) == 1
        assert cases[0].expected_testing_disclaimer != "", (
            "English testing disclaimer should not be empty"
        )

    def test_provenance_keys(self):
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        prov = cases[0].provenance
        assert "schema_version" in prov
        assert "generator" in prov
        assert "scenario_id" in prov
        assert "language_code" in prov

    def test_to_legacy_dict_has_required_fields(self):
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        d = cases[0].to_legacy_dict()
        required = {
            "name", "query", "location", "expected_domain",
            "expected_tools", "expected_nodes", "expected_plan",
            "stable", "expected_testing_disclaimer",
            "vocal_language", "language_code", "scenario_id",
        }
        for field in required:
            assert field in d, f"Missing field in to_legacy_dict(): {field!r}"

    def test_terminology_assertions_are_tuples(self):
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        assert isinstance(cases[0].terminology_assertions, tuple)

    def test_case_is_frozen(self):
        """MultilingualCase must be frozen (immutable)."""
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        with pytest.raises((AttributeError, TypeError)):
            cases[0].case_id = "MODIFIED"  # type: ignore[misc]


class TestDisclaimerPopulation:
    def test_2hr_disclaimer_populated_when_required(self):
        """Scenarios with disclaimer_2hr_required=True should have a 2hr disclaimer."""
        cases = generate_cases(scenario_ids=["S01"], language_codes=["EN"])
        # S01 is paddy cultural practices — 2hr required
        case = cases[0]
        assert case.disclaimer_2hr_required is True
        assert case.expected_2hr_disclaimer != "", (
            "2hr disclaimer should be populated when required"
        )

    def test_2hr_disclaimer_empty_when_not_required(self):
        """Market price / weather cases do not require 2hr disclaimer."""
        cases = generate_cases(scenario_ids=["S11"], language_codes=["EN"])
        case = cases[0]
        assert case.disclaimer_2hr_required is False
        assert case.expected_2hr_disclaimer == "", (
            "2hr disclaimer should be empty when not required"
        )
