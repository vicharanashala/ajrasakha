from unittest.mock import patch

from ajrasakha.evaluation.answer_eval import evaluate_response_quality


def test_disabled_by_default_matches_previous_stub_shape():
    result = evaluate_response_quality({}, {}, enabled=False)

    assert result["answer_quality_enabled"] is False
    assert result["quality_overall_score"] == ""
    assert result["quality_pass"] == ""


@patch("ajrasakha.evaluation.answer_eval._evaluate_agri_metric")
@patch("ajrasakha.evaluation.answer_eval.evaluate_gdb_match")
@patch("ajrasakha.evaluation.answer_eval.resolve_expected_answer")
@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_enabled_combines_all_metrics_into_overall_score(
    mock_deepeval, mock_resolve, mock_gdb, mock_agri
):
    mock_resolve.return_value = None
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.9, "passed": True, "reason": "addresses the question"},
        "FaithfulnessMetric": {"score": 0.8, "passed": True, "reason": "grounded in context"},
        "ContextualRelevancyMetric": {"score": 0.7, "passed": True, "reason": "relevant context"},
    }
    mock_gdb.return_value = {
        "score": None,
        "passed": None,
        "reason": "no_gdb_ground_truth_for_this_case",
    }
    mock_agri.return_value = {"score": 1.0, "passed": True, "reason": "not applicable"}

    result = evaluate_response_quality(
        {"answer": "Irrigate the paddy field with 2 inches of standing water."},
        {"query": "how much water for paddy", "name": "case1", "domain": "gdb"},
        enabled=True,
    )

    assert result["answer_quality_enabled"] is True
    # GDB match wasn't applicable (score=None) so weights renormalise over
    # the remaining 4 metrics; overall should sit between the lowest (0.7)
    # and highest (1.0) applicable scores.
    assert 0.7 <= result["quality_overall_score"] <= 1.0
    assert isinstance(result["quality_pass"], bool)
    assert result["answerrelevancymetric_score"] == 0.9
    assert result["gdbmatchscore_score"] is None
    assert "AgriAccuracyMetric" in result["quality_breakdown"]


@patch("ajrasakha.evaluation.answer_eval._evaluate_agri_metric")
@patch("ajrasakha.evaluation.answer_eval.evaluate_gdb_match")
@patch("ajrasakha.evaluation.answer_eval.resolve_expected_answer")
@patch("ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval")
def test_low_faithfulness_pulls_overall_score_down(
    mock_deepeval, mock_resolve, mock_gdb, mock_agri
):
    mock_resolve.return_value = None
    mock_deepeval.return_value = {
        "AnswerRelevancyMetric": {"score": 0.3, "passed": False, "reason": "partially off-topic"},
        "FaithfulnessMetric": {"score": 0.1, "passed": False, "reason": "introduced unsupported claim"},
        "ContextualRelevancyMetric": {"score": 0.3, "passed": False, "reason": "weak grounding"},
    }
    mock_gdb.return_value = {"score": None, "passed": None, "reason": "n/a"}
    mock_agri.return_value = {"score": 1.0, "passed": True, "reason": "n/a"}

    result = evaluate_response_quality(
        {"answer": "some answer with a hallucinated dosage"},
        {"query": "q", "name": "case2"},
        enabled=True,
    )

    # Faithfulness is the highest-weighted metric; a hallucinated answer
    # that also scores poorly on relevancy/context should fail overall,
    # even though the (not-applicable) agri metric reports a clean 1.0.
    assert result["quality_overall_score"] < 0.6
    assert result["quality_pass"] is False
