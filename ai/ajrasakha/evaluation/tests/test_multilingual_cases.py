from collections import Counter

from ajrasakha.evaluation.multilingual_cases import (
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


def test_fixture_scenarios_are_labeled_for_replacement():
    fixtures = [case for case in MULTILINGUAL_TEST_CASES if case["is_fixture"]]
    draft_cases = [case for case in MULTILINGUAL_TEST_CASES if not case["is_fixture"]]

    assert fixtures
    assert draft_cases
    assert all(
        case["translation_status"] == "fixture_replace_with_agri_validated_scenario"
        for case in fixtures
    )
    assert all(case["source_scenario_id"] for case in fixtures)
