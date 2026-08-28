import json
import pytest
from unittest.mock import MagicMock, patch

from ajrasakha.evaluation.executors import (
    extract_final_ai_answer,
    extract_retrieved_contexts,
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


@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_enabled(mock_deepeval):
    # Mock the return value of DeepEval metrics
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.95, "passed": True, "reason": "Good"},
        "FaithfulnessMetric": {"score": 0.88, "passed": True, "reason": "Faithful"},
        "ContextualRelevancyMetric": {"score": 0.90, "passed": True, "reason": "Relevant"}
    }

    result = {
        "query": "What is the weather today in Ludhiana?",
        "full_response_text": "The weather today in Ludhiana is sunny with a temperature of 32°C.",
        "retrieved_context": ["Ludhiana weather: Temperature 32C, Humidity 45%, Sunny."]
    }

    eval_out = evaluate_response_quality(result, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["answerrelevancymetric_score"] == 0.95
    assert eval_out["faithfulnessmetric_score"] == 0.88
    assert eval_out["contextualrelevancymetric_score"] == 0.90
    assert eval_out["answerrelevancymetric_passed"] is True
    assert not eval_out["quality_errors"]


def test_evaluate_response_quality_disabled():
    # Test when quality checking is disabled
    result = {
        "query": "Test",
        "full_response_text": "Test",
        "retrieved_context": []
    }
    eval_out = evaluate_response_quality(result, enabled=False)
    assert eval_out["answer_quality_enabled"] is False
    assert eval_out["answerrelevancymetric_reason"] == "disabled"


@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_missing_context(mock_deepeval):
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.92, "passed": True, "reason": "Matches"},
        "FaithfulnessMetric": {"score": None, "passed": None, "reason": "Skipped: no retrieved context available"},
        "ContextualRelevancyMetric": {"score": None, "passed": None, "reason": "Skipped: no retrieved context available"}
    }

    # Call evaluate_response_quality with empty context list
    result = {
        "query": "Hello",
        "full_response_text": "Hello, how can I help you?",
        "retrieved_context": []
    }

    # Evaluate (which will call evaluate_answer_with_deepeval)
    eval_out = evaluate_response_quality(result, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["answerrelevancymetric_score"] == 0.92
    # Faithfulness should be skipped since retrieved_context is empty
    assert eval_out["faithfulnessmetric_score"] is None
    assert eval_out["faithfulnessmetric_passed"] is None
    assert "no retrieved context" in eval_out["faithfulnessmetric_reason"]
    mock_deepeval.assert_called_once_with("Hello", "Hello, how can I help you?", [])


@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_evaluate_response_quality_error_handling(mock_deepeval):
    # Simulate an LLM/DeepEval exception
    mock_deepeval.side_effect = Exception("Anthropic API rate limit exceeded")

    result = {
        "query": "What is the weather today in Ludhiana?",
        "full_response_text": "Sunny",
        "retrieved_context": ["Sunny"]
    }

    eval_out = evaluate_response_quality(result, enabled=True)

    assert eval_out["answer_quality_enabled"] is True
    assert eval_out["answerrelevancymetric_score"] is None
    assert eval_out["answerrelevancymetric_passed"] is False
    assert "Evaluation error" in eval_out["answerrelevancymetric_reason"]
    assert "Anthropic API rate limit" in eval_out["quality_errors"][0]
