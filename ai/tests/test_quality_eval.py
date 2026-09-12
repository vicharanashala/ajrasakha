import json
import pytest
from unittest.mock import MagicMock, patch

from ajrasakha.evaluation.executors import (
    extract_final_ai_answer,
    extract_retrieved_contexts,
    extract_gdb_reference_answer,
)
from ajrasakha.evaluation.answer_eval import evaluate_response_quality


# Mock state JSON representing a successful agent run
MOCK_STATE_JSON = json.dumps({
    "messages": [
        {"role": "user", "type": "human", "content": "What is the weather today in Ludhiana?"},
        {
            "role": "tool",
            "type": "tool",
            "name": "weather",
            "content": "Ludhiana weather: Temperature 32C, Humidity 45%, Sunny."
        },
        {
            "role": "assistant",
            "type": "ai",
            "content": "The weather today in Ludhiana is sunny with a temperature of 32°C."
        }
    ],
    "plan": {
        "domain": "Weather",
        "weather": True,
        "is_complete": True
    }
})

MOCK_GDB_STATE_JSON = json.dumps({
    "messages": [
        {"role": "user", "type": "human", "content": "How to treat yellow rust in wheat?"},
        {
            "role": "tool",
            "type": "tool",
            "name": "gdb",
            "content": json.dumps({
                "exact_match": {
                    "question": "How to treat yellow rust in wheat?",
                    "answer": "Spray propiconazole 25 EC at 200 ml in 200 liters of water per acre."
                }
            })
        },
        {
            "role": "assistant",
            "type": "ai",
            "content": "To treat yellow rust in wheat, spray propiconazole 25 EC."
        }
    ],
    "plan": {
        "domain": "Plant Protection",
        "is_complete": True
    }
})

MOCK_GDB_SELECTED_MATCH_JSON = json.dumps({
    "messages": [
        {"role": "user", "type": "human", "content": "How to grow paddy in punjab"},
        {
            "role": "tool",
            "type": "tool",
            "name": "gdb",
            "content": json.dumps({
                "selected_match": {
                    "question": "Paddy cultivation guidelines for Punjab",
                    "answer": "Sow recommended PAU varieties in May-June and transplant 25-30 day old seedlings.",
                    "classification": "SAME_INTENT"
                }
            })
        },
        {
            "role": "assistant",
            "type": "ai",
            "content": "For paddy cultivation in Punjab, use PAU varieties and transplant in May-June."
        }
    ],
    "plan": {
        "domain": "Cultural Practices",
        "is_complete": True
    }
})


def test_extract_final_ai_answer():
    # Test successful extraction of the assistant's final response text
    ans = extract_final_ai_answer(MOCK_STATE_JSON)
    assert ans == "The weather today in Ludhiana is sunny with a temperature of 32°C."

    # Test fallback to raw string if it's not JSON
    plain_text = "Hello world"
    ans_plain = extract_final_ai_answer(plain_text)
    assert ans_plain == "Hello world"


def test_extract_retrieved_contexts_non_gdb():
    # Test extraction of text context from non-GDB tool messages
    contexts = extract_retrieved_contexts(MOCK_STATE_JSON)
    assert len(contexts) == 1
    assert contexts[0] == "Ludhiana weather: Temperature 32C, Humidity 45%, Sunny."


def test_extract_retrieved_contexts_gdb():
    # Test extraction of text context from GDB tool response JSON
    contexts = extract_retrieved_contexts(MOCK_GDB_STATE_JSON)
    assert len(contexts) == 1
    assert "Spray propiconazole" in contexts[0]
    assert "How to treat yellow rust" in contexts[0]


def test_extract_gdb_reference_answer_exact():
    # Test extraction of exact match expert answer
    ref = extract_gdb_reference_answer(MOCK_GDB_STATE_JSON)
    assert ref == "Spray propiconazole 25 EC at 200 ml in 200 liters of water per acre."


def test_extract_gdb_reference_answer_selected():
    # Test extraction of selected match expert answer
    ref = extract_gdb_reference_answer(MOCK_GDB_SELECTED_MATCH_JSON)
    assert ref == "Sow recommended PAU varieties in May-June and transplant 25-30 day old seedlings."


def test_extract_gdb_reference_answer_none_when_non_gdb():
    # Test that non-GDB tools return None for reference answer
    ref = extract_gdb_reference_answer(MOCK_STATE_JSON)
    assert ref is None


@patch("ajrasakha.evaluation.deepeval_metrics.evaluate_treatment_with_deepeval")
@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_with_expected_answer(mock_deepeval, mock_treatment_eval):
    # Mock return value including AnswerCorrectness
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.95, "passed": True, "reason": "Good"},
        "FaithfulnessMetric": {"score": 0.88, "passed": True, "reason": "Faithful"},
        "ContextualRelevancyMetric": {"score": 0.90, "passed": True, "reason": "Relevant"},
        "AnswerCorrectness": {"score": 0.92, "passed": True, "reason": "Factual alignment with expert ground truth"}
    }
    mock_treatment_eval.return_value = {
        "score": 0.94,
        "passed": True,
        "reason": "Treatment aligned with expert recommendation",
    }

    result = {
        "query": "How to grow paddy in punjab",
        "full_response_text": "For growing paddy in Punjab, use PAU varieties...",
        "retrieved_context": ["Paddy PAU guidelines"]
    }
    case = {
        "expected_domain": "Cultural Practices",
        "expected_crop": "Paddy",
        "location": {"city": "Ropar", "state": "Punjab"},
        "expected_answer": "Sow recommended PAU varieties in May-June and transplant 25-30 day seedlings."
    }

    eval_out = evaluate_response_quality(result, case=case, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["reference_answer"] == "Sow recommended PAU varieties in May-June and transplant 25-30 day seedlings."
    assert eval_out["answercorrectness_score"] == 0.92
    assert eval_out["answercorrectness_passed"] is True
    assert eval_out["crop_correctness_status"] == "SUCCESS"
    assert eval_out["region_correctness_status"] == "SUCCESS"
    assert eval_out["treatment_correctness_status"] == "SUCCESS"
    mock_deepeval.assert_called_once_with(
        query="How to grow paddy in punjab",
        answer="For growing paddy in Punjab, use PAU varieties...",
        context=["Paddy PAU guidelines"],
        expected_output="Sow recommended PAU varieties in May-June and transplant 25-30 day seedlings.",
    )


@patch("ajrasakha.evaluation.deepeval_metrics.evaluate_treatment_with_deepeval")
@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_with_dynamic_gdb_reference(mock_deepeval, mock_treatment_eval):
    # Case has no curated expected_answer, but result has dynamic GDB reference
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.93, "passed": True, "reason": "Good"},
        "FaithfulnessMetric": {"score": 0.90, "passed": True, "reason": "Faithful"},
        "ContextualRelevancyMetric": {"score": 0.88, "passed": True, "reason": "Relevant"},
        "AnswerCorrectness": {"score": 0.89, "passed": True, "reason": "Matches dynamic GDB answer"}
    }
    mock_treatment_eval.return_value = {
        "score": 0.91,
        "passed": True,
        "reason": "Dynamic treatment matches",
    }

    result = {
        "query": "How to treat yellow rust in wheat?",
        "full_response_text": "To treat yellow rust in wheat, spray propiconazole 25 EC.",
        "retrieved_context": ["Propiconazole guidelines"],
        "reference_answer": "Spray propiconazole 25 EC at 200 ml in 200 liters of water per acre."
    }
    case = {"expected_domain": "Plant Protection", "expected_crop": "Wheat"}

    eval_out = evaluate_response_quality(result, case=case, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["reference_answer"] == "Spray propiconazole 25 EC at 200 ml in 200 liters of water per acre."
    assert eval_out["answercorrectness_score"] == 0.89
    assert eval_out["answercorrectness_passed"] is True
    assert eval_out["crop_correctness_status"] == "SUCCESS"
    assert eval_out["treatment_correctness_status"] == "SUCCESS"


@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_missing_reference_graceful_skip(mock_deepeval):
    # When no expected_answer and no dynamic GDB reference exist
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.91, "passed": True, "reason": "Matches"},
        "FaithfulnessMetric": {"score": None, "passed": None, "reason": "Skipped: no retrieved context available"},
        "ContextualRelevancyMetric": {"score": None, "passed": None, "reason": "Skipped: no retrieved context available"},
        "AnswerCorrectness": {"score": None, "passed": None, "reason": "Skipped: no reference answer available"}
    }

    result = {
        "query": "Hello",
        "full_response_text": "Hello, how can I help you?",
        "retrieved_context": []
    }
    case = {"expected_domain": "General"}

    eval_out = evaluate_response_quality(result, case=case, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["reference_answer"] is None
    assert eval_out["answercorrectness_score"] is None
    assert eval_out["answercorrectness_passed"] is None
    assert eval_out["crop_correctness_status"] == "SKIPPED_NOT_APPLICABLE"
    assert eval_out["region_correctness_status"] == "SKIPPED_NOT_APPLICABLE"
    assert eval_out["treatment_correctness_status"] == "SKIPPED_NOT_APPLICABLE"


def test_evaluate_response_quality_disabled():
    result = {
        "query": "Test",
        "full_response_text": "Test",
        "retrieved_context": [],
        "reference_answer": "Expected test answer"
    }
    case = {"expected_answer": "Expected test answer", "expected_crop": "all"}
    eval_out = evaluate_response_quality(result, case=case, enabled=False)

    assert eval_out["answer_quality_enabled"] is False
    assert eval_out["reference_answer"] == "Expected test answer"
    assert eval_out["answercorrectness_score"] == ""
    assert eval_out["answercorrectness_reason"] == "disabled"
    assert eval_out["crop_correctness_status"] == "SKIPPED_NOT_APPLICABLE"


@patch("ajrasakha.evaluation.deepeval_metrics.evaluate_treatment_with_deepeval")
@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_error_handling(mock_deepeval, mock_treatment_eval):
    mock_deepeval.side_effect = Exception("Anthropic API rate limit exceeded")
    mock_treatment_eval.side_effect = Exception("Anthropic API rate limit exceeded")

    result = {
        "query": "What is the weather today in Ludhiana?",
        "full_response_text": "Sunny",
        "retrieved_context": ["Sunny"],
        "reference_answer": "Reference weather"
    }
    case = {"expected_domain": "Weather"}

    eval_out = evaluate_response_quality(result, case=case, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["answercorrectness_score"] is None
    assert eval_out["answercorrectness_passed"] is False
    assert "Evaluation error" in eval_out["answercorrectness_reason"]
    assert "Anthropic API rate limit" in eval_out["quality_errors"][0]


from ajrasakha.evaluation.agricultural_eval import (
    evaluate_crop_correctness,
    evaluate_region_correctness,
    evaluate_treatment_correctness,
    evaluate_agricultural_domain_quality,
)


def test_crop_correctness_success():
    result = {
        "full_response_text": "धान की खेती के लिए अनुशंसित किस्मों का चयन करें और उचित उर्वरक डालें।"
    }
    case = {
        "expected_crop": "Paddy"
    }
    res = evaluate_crop_correctness(result, case)
    assert res["crop_correctness_status"] == "SUCCESS"
    assert res["crop_correctness_score"] == 1.0
    assert "Paddy" in res["crop_correctness_reason"]


def test_crop_correctness_failed_conflict():
    result = {
        "full_response_text": "कपास की फसल में गुलाबी सुंडी के नियंत्रण के लिए उचित कीटनाशक का छिड़काव करें।"
    }
    case = {
        "expected_crop": "Wheat"
    }
    res = evaluate_crop_correctness(result, case)
    assert res["crop_correctness_status"] == "FAILED"
    assert res["crop_correctness_score"] == 0.0
    assert "conflicting crop" in res["crop_correctness_reason"].lower()


def test_crop_correctness_skipped():
    result = {
        "full_response_text": "Good morning! How can I assist you with your farming today?"
    }
    case = {
        "expected_crop": "all",
        "expected_plan": {"crop": "all"}
    }
    res = evaluate_crop_correctness(result, case)
    assert res["crop_correctness_status"] == "SKIPPED_NOT_APPLICABLE"
    assert res["crop_correctness_score"] is None


def test_region_correctness_success():
    result = {
        "full_response_text": "For wheat sowing, prepare the land with 2-3 plowings and maintain proper soil moisture."
    }
    case = {
        "location": {"city": "Ropar", "state": "Punjab"}
    }
    res = evaluate_region_correctness(result, case)
    assert res["region_correctness_status"] == "SUCCESS"
    assert res["region_correctness_score"] == 1.0


def test_region_correctness_failed_conflict():
    result = {
        "full_response_text": "According to the Maharashtra State Agricultural Department, apply fertilizer in Konkan region."
    }
    case = {
        "location": {"city": "Ludhiana", "state": "Punjab"}
    }
    res = evaluate_region_correctness(result, case)
    assert res["region_correctness_status"] == "FAILED"
    assert res["region_correctness_score"] == 0.0
    assert "conflicting region" in res["region_correctness_reason"].lower()


def test_region_correctness_skipped():
    result = {
        "full_response_text": "Namaste! Welcome to AjraSakha."
    }
    case = {
        "location": None
    }
    res = evaluate_region_correctness(result, case)
    assert res["region_correctness_status"] == "SKIPPED_NOT_APPLICABLE"
    assert res["region_correctness_score"] is None


def test_treatment_correctness_success_mock():
    result = {
        "full_response_text": "Spray propiconazole 25 EC at 200 ml per acre for rust control."
    }
    case = {
        "expected_domain": "Plant Protection",
        "expected_treatment": "Spray propiconazole 25 EC at 200 ml in 200 liters of water per acre."
    }
    res = evaluate_treatment_correctness(result, case, enabled=False)
    assert res["treatment_correctness_status"] == "SUCCESS"
    assert res["treatment_correctness_score"] == 1.0


def test_treatment_correctness_banned_chemical():
    result = {
        "full_response_text": "To control pests, use Endosulfan 35 EC spray immediately."
    }
    case = {
        "expected_domain": "Plant Protection",
        "expected_treatment": "Use safe recommended bio-pesticides."
    }
    res = evaluate_treatment_correctness(result, case, enabled=False)
    assert res["treatment_correctness_status"] == "FAILED"
    assert res["treatment_correctness_score"] == 0.0
    assert "banned chemical" in res["treatment_correctness_reason"].lower()


def test_treatment_correctness_skipped_domain():
    result = {
        "full_response_text": "Today's weather is sunny with high temperatures."
    }
    case = {
        "expected_domain": "Weather"
    }
    res = evaluate_treatment_correctness(result, case, enabled=False)
    assert res["treatment_correctness_status"] == "SKIPPED_NOT_APPLICABLE"
    assert res["treatment_correctness_score"] is None

