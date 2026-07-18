from collections import Counter

from ajrasakha.evaluation.multilingual_cases import (
    CORE_SCENARIOS,
    LANGUAGES,
    MULTILINGUAL_TEST_CASES,
)


def test_multilingual_cases_expand_to_30_by_6_matrix():
    assert len(MULTILINGUAL_TEST_CASES) == 180

    scenario_ids = {case["scenario_id"] for case in MULTILINGUAL_TEST_CASES}
    language_codes = {case["language_code"] for case in MULTILINGUAL_TEST_CASES}

    assert len(scenario_ids) == 30
    assert language_codes == set(LANGUAGES)


def test_each_scenario_has_one_case_per_language():
    counts = Counter(case["scenario_id"] for case in MULTILINGUAL_TEST_CASES)

    assert set(counts.values()) == {6}


def test_core_scenarios_are_balanced_across_requested_domains():
    counts = Counter(scenario["domain"] for scenario in CORE_SCENARIOS)

    assert counts == {
        "weather": 6,
        "pest": 6,
        "soil": 6,
        "market": 6,
        "scheme": 6,
    }


def test_multilingual_cases_do_not_use_placeholder_fixtures():
    assert all(case["is_fixture"] is False for case in MULTILINGUAL_TEST_CASES)
    assert all(
        case["translation_status"] == "draft_needs_agri_validation"
        for case in MULTILINGUAL_TEST_CASES
    )
