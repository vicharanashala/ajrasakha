import pytest

from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase
from ajrasakha.evaluation.multilingual.validators.gdb_verification import validate_gdb_retrieval

def _mock_case(expected_gdb_id=None, expected_gdb_no_match=False):
    return MultilingualCase(
        case_id="MOCK-01",
        scenario_id="S01",
        language_code="EN",
        domain="Mock",
        domain_group="weather",
        query="Mock",
        query_translation_source="data_artifact",
        location=None,
        expected_script="Latin",
        expected_vocal="English",
        expected_catalog_script="Latin",
        expected_tools=(),
        expected_nodes=(),
        expected_plan={},
        disclaimer_mode="optional",
        disclaimer_2hr_required=False,
        expected_testing_disclaimer="",
        expected_2hr_disclaimer="",
        expected_gdb_no_match=expected_gdb_no_match,
        expected_gdb_id=expected_gdb_id,
        terminology_assertions=(),
        stable=True,
        translation_review_status="draft_pending_agri_validation",
        translation_reviewer=None,
        provenance={}
    )


def test_gdb_no_match_expected_and_actual_no_match():
    case = _mock_case(expected_gdb_no_match=True)
    result = validate_gdb_retrieval({"trace": {}}, case)
    assert result["gdb_retrieval_status"] == "PASS"

def test_gdb_no_match_expected_but_got_match():
    case = _mock_case(expected_gdb_no_match=True)
    result = validate_gdb_retrieval({"trace": {"gdb_entry_id": "123"}}, case)
    assert result["gdb_retrieval_status"] == "FAIL"

def test_gdb_match_success_gdb_entry_id():
    case = _mock_case(expected_gdb_id="REAL-456")
    result = validate_gdb_retrieval({"trace": {"gdb_entry_id": "REAL-456"}}, case)
    assert result["gdb_retrieval_status"] == "PASS"

def test_gdb_match_success_chosen_question_id():
    case = _mock_case(expected_gdb_id="REAL-456")
    result = validate_gdb_retrieval({"trace": {"chosen_question_id": "REAL-456"}}, case)
    assert result["gdb_retrieval_status"] == "PASS"

def test_gdb_match_fail_wrong_id():
    case = _mock_case(expected_gdb_id="REAL-456")
    result = validate_gdb_retrieval({"trace": {"gdb_entry_id": "WRONG-789"}}, case)
    assert result["gdb_retrieval_status"] == "FAIL"

def test_gdb_match_fail_missing_id():
    case = _mock_case(expected_gdb_id="REAL-456")
    result = validate_gdb_retrieval({"trace": {}}, case)
    assert result["gdb_retrieval_status"] == "FAIL"

def test_gdb_none_expected_returns_blocked():
    case = _mock_case(expected_gdb_id=None)
    result = validate_gdb_retrieval({"trace": {}}, case)
    assert result["gdb_retrieval_status"] == "BLOCKED"

