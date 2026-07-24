import pytest
from ajrasakha.evaluation.multilingual.case_schema import MultilingualCase, TerminologyAssertion
from ajrasakha.evaluation.multilingual.validators.disclaimer_check import validate_disclaimer

# Recreate the 5 no-match cases
NO_MATCH_CASES = [
    MultilingualCase(
        case_id="S06-EN",
        scenario_id="S06",
        language_code="EN",
        domain="Weather",
        domain_group="weather",
        query="What is the weather in ZZZ-invalid-place?",
        query_translation_source="data_artifact",
        location={"city": "InvalidCity", "state": "InvalidState"},
        expected_script="English",
        expected_vocal="English",
        expected_catalog_script="English",
        expected_tools=("upload_question_to_reviewer_system", "weather"),
        expected_nodes=("planner", "execute_plan", "weather_unavailable_reply"),
        expected_plan={"weather": True, "is_complete": False},
        disclaimer_mode="forbidden",
        disclaimer_2hr_required=False,
        expected_testing_disclaimer="Testing purposes only.",
        expected_2hr_disclaimer="Wait 2 hours.",
        terminology_assertions=(),
        stable=True,
        expected_gdb_no_match=True,
        translation_review_status="draft_pending_agri_validation",
        translation_reviewer=None,
        provenance={}
    ),
    MultilingualCase(
        case_id="S12-EN",
        scenario_id="S12",
        language_code="EN",
        domain="Plant Protection",
        domain_group="pest",
        query="What is XYZ unknown pest in XYZ invalid place?",
        query_translation_source="data_artifact",
        location={"city": "InvalidCity", "state": "InvalidState"},
        expected_script="English",
        expected_vocal="English",
        expected_catalog_script="English",
        expected_tools=("upload_question_to_reviewer_system", "gdb"),
        expected_nodes=("planner", "execute_plan", "retrieval_sanitizer", "expert_queue_reply"),
        expected_plan={"knowledge_base": True, "is_complete": False},
        disclaimer_mode="required",
        disclaimer_2hr_required=True,
        expected_testing_disclaimer="Testing purposes only.",
        expected_2hr_disclaimer="Wait 2 hours.",
        terminology_assertions=(),
        stable=True,
        expected_gdb_no_match=True,
        translation_review_status="draft_pending_agri_validation",
        translation_reviewer=None,
        provenance={}
    )
]

def test_no_match_weather_disclaimer():
    case = NO_MATCH_CASES[0]
    from ajrasakha.agents.translation_catalog import get_two_hour_disclaimer
    two_hr = get_two_hour_disclaimer("English", "English")
    # Weather no match -> disclaimer forbidden
    text = "Weather is unavailable. Testing purposes only."
    res = validate_disclaimer(text, case)
    assert res["disclaimer_pass"] is True
    assert res["two_hr_disclaimer_forbidden_violated"] is False
    
    text_bad = f"Weather is unavailable. Testing purposes only. {two_hr}"
    res = validate_disclaimer(text_bad, case)
    assert res["disclaimer_pass"] is False
    assert res["two_hr_disclaimer_forbidden_violated"] is True

def test_no_match_pest_disclaimer():
    case = NO_MATCH_CASES[1]
    # Pest no match -> disclaimer required
    text = f"I don't know this pest. {case.expected_2hr_disclaimer}\n{case.expected_testing_disclaimer}"
    res = validate_disclaimer(text, case)
    assert res["disclaimer_pass"] is True
    assert res["two_hr_disclaimer_forbidden_violated"] is False
    text_bad = "I don't know this pest. Testing purposes only."
    res = validate_disclaimer(text_bad, case)
    assert res["disclaimer_pass"] is False
    assert "missing" in res["disclaimer_reason"]
