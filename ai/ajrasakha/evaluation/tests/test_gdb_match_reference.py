"""Contract tests for the synthetic GDB reference answer.

The reference is a hand-written synthetic answer. It is not an ACE GDB answer
and has not been expert validated.
"""

from ajrasakha.agents.answer_footers import FOOTER_SEPARATOR
from ajrasakha.evaluation.questions import TEST_CASES


def get_case(name):
    for case in TEST_CASES:
        if case.get("name") == name:
            return case
    raise AssertionError(f"missing test case: {name}")


def cases_with_reference():
    return [case for case in TEST_CASES if case.get("expected_answer")]


def test_gdb_question_1_has_non_empty_reference():
    reference = get_case("gdb_question_1").get("expected_answer")
    assert isinstance(reference, str)
    assert reference.strip()


def test_reference_provenance_is_synthetic_manual():
    case = get_case("gdb_question_1")
    assert case.get("expected_answer_source") == "synthetic_manual"


def test_every_reference_has_synthetic_provenance():
    for case in cases_with_reference():
        assert case.get("expected_answer_source") == "synthetic_manual", (
            case["name"]
        )


def test_v1_reference_coverage_is_exactly_gdb_question_1():
    names = {case["name"] for case in cases_with_reference()}
    assert names == {"gdb_question_1"}


def test_reference_has_no_report_footer_or_testing_notice():
    reference = get_case("gdb_question_1")["expected_answer"]
    assert FOOTER_SEPARATOR not in reference
    assert "Sources:" not in reference
    assert "Important Notice (Testing)" not in reference


def test_reference_matches_case_crop_and_region():
    reference = get_case("gdb_question_1")["expected_answer"].lower()
    assert "paddy" in reference or "rice" in reference
    assert "punjab" in reference
