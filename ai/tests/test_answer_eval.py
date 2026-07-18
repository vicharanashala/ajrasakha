"""
Unit tests for answer_eval.py and summary.py — PR1 test coverage.
EVAL_JUDGE=mock so all tests are instant and offline.

Run from ai/ directory:
    EVAL_JUDGE=mock python -m pytest tests/test_answer_eval.py -v
"""

import sys
from pathlib import Path

# Ensure ai/ is on the path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ------------------------------------------------------------------
# Must run from ai/ — verify BEFORE any other imports
# ------------------------------------------------------------------
if Path.cwd().resolve() != _ROOT:
    print(f"ERROR: tests must be run from ai/ directory (cwd={Path.cwd()})")
    sys.exit(1)

# ------------------------------------------------------------------
# Clear the judge cache so tests are isolated
# ------------------------------------------------------------------
import importlib
import ajrasakha.evaluation.judge as _judge_mod
_judge_mod._JUDGE_CACHE = None

# Also clear any cached import of answer_eval so it picks up the fresh cache
import ajrasakha.evaluation.answer_eval as _answer_mod
importlib.reload(_answer_mod)

# ------------------------------------------------------------------
# Imports
# ------------------------------------------------------------------
import pytest

from ajrasakha.evaluation.answer_eval import evaluate_response_quality
from ajrasakha.evaluation.summary import build_summary, _parse_score


# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------
def _all_result_keys() -> set:
    """Canonical set of keys that evaluate_response_quality must always return."""
    return {
        "answer_quality_enabled",
        "answerrelevancymetric_score",
        "answerrelevancymetric_passed",
        "answerrelevancymetric_reason",
        "faithfulnessmetric_score",
        "faithfulnessmetric_passed",
        "faithfulnessmetric_reason",
        "contextualrelevancymetric_score",
        "contextualrelevancymetric_passed",
        "contextualrelevancymetric_reason",
        # gdb_match_score (custom, non-DeepEval) — added in follow-up PR
        "gdb_match_score_score",
        "gdb_match_score_method",
        # agricultural_correctness (custom, facet-decomposed) — PS3 enhancement
        "agriculturalcorrectness_score",
        "agriculturalcorrectness_facets_crop",
        "agriculturalcorrectness_facets_treatment",
        "agriculturalcorrectness_facets_regional",
        "agriculturalcorrectness_facets_assessed",
    }


def _result_keys(result: dict) -> set:
    return set(result.keys())


# ------------------------------------------------------------------
# Test: evaluate_response_quality — enabled=False returns disabled stub
#        all keys present, all values are empty/disabled
# ------------------------------------------------------------------
class TestDisabledStub:
    def test_disabled_returns_all_keys(self):
        result = evaluate_response_quality({"query": "test", "response_text": "answer"}, enabled=False)
        assert _all_result_keys() == _result_keys(result)

    def test_disabled_values_are_empty_or_disabled(self):
        result = evaluate_response_quality({"query": "test", "response_text": "answer"}, enabled=False)
        assert result["answer_quality_enabled"] is False
        # passed is empty string when disabled; reason carries "disabled"
        assert result["answerrelevancymetric_passed"] == ""
        assert result["faithfulnessmetric_passed"] == ""
        assert result["contextualrelevancymetric_passed"] == ""
        assert result["answerrelevancymetric_reason"] == "disabled"
        assert result["faithfulnessmetric_reason"] == "disabled"
        assert result["contextualrelevancymetric_reason"] == "disabled"

    def test_disabled_with_minimal_result_dict(self):
        # Only query and response_text — no context field at all
        result = evaluate_response_quality({"query": "what is blight", "response_text": "Blight is fungal."}, enabled=False)
        assert result["answer_quality_enabled"] is False
        # passed is empty string when disabled; reason carries the state label
        assert result["answerrelevancymetric_passed"] == ""
        assert result["answerrelevancymetric_reason"] == "disabled"


# ------------------------------------------------------------------
# Test: enabled=True + empty retrieval_context
#        AnswerRelevancy RUNs (mock → PASS), Faithfulness/Contextual SKIPPED
# ------------------------------------------------------------------
class TestEmptyRetrievalContext:
    def test_answer_relevancy_runs_with_empty_context(self):
        result = evaluate_response_quality(
            {"query": "what is tomato blight", "response_text": "Tomato blight is caused by Phytophthora infestans."},
            enabled=True,
        )
        # AnswerRelevancy must have run (PASS or FAIL, not empty or disabled)
        assert result["answerrelevancymetric_passed"] in ("PASS", "FAIL")
        assert result["answerrelevancymetric_score"] != ""
        assert result["answerrelevancymetric_reason"] != "disabled"
        assert result["answerrelevancymetric_reason"] != "answer_missing"

    def test_faithfulness_skipped_when_context_empty(self):
        result = evaluate_response_quality(
            {"query": "what is tomato blight", "response_text": "Tomato blight is fungal."},
            enabled=True,
        )
        assert result["faithfulnessmetric_passed"] == "SKIPPED"
        assert result["faithfulnessmetric_score"] == ""
        assert "retrieval_context" in result["faithfulnessmetric_reason"]

    def test_contextual_relevancy_skipped_when_context_empty(self):
        result = evaluate_response_quality(
            {"query": "what is tomato blight", "response_text": "Tomato blight is fungal."},
            enabled=True,
        )
        assert result["contextualrelevancymetric_passed"] == "SKIPPED"
        assert result["contextualrelevancymetric_score"] == ""
        assert "retrieval_context" in result["contextualrelevancymetric_reason"]

    def test_enabled_flag_reflected_in_result(self):
        result = evaluate_response_quality(
            {"query": "test", "response_text": "test"},
            enabled=True,
        )
        assert result["answer_quality_enabled"] is True


# ------------------------------------------------------------------
# Test: empty query and empty answer return reason="answer_missing"
#        without crashing (guard clause in evaluate_response_quality)
# ------------------------------------------------------------------
class TestAnswerMissingGuard:
    def test_empty_query_returns_answer_missing(self):
        result = evaluate_response_quality(
            {"query": "", "response_text": "some answer text"},
            enabled=True,
        )
        assert result["answerrelevancymetric_reason"] == "answer_missing"
        assert result["faithfulnessmetric_reason"] == "answer_missing"
        assert result["contextualrelevancymetric_reason"] == "answer_missing"

    def test_whitespace_only_query_returns_answer_missing(self):
        result = evaluate_response_quality(
            {"query": "   ", "response_text": "some answer"},
            enabled=True,
        )
        assert result["answerrelevancymetric_reason"] == "answer_missing"

    def test_empty_answer_returns_answer_missing(self):
        result = evaluate_response_quality(
            {"query": "valid query", "response_text": ""},
            enabled=True,
        )
        assert result["answerrelevancymetric_reason"] == "answer_missing"
        assert result["faithfulnessmetric_reason"] == "answer_missing"
        assert result["contextualrelevancymetric_reason"] == "answer_missing"

    def test_whitespace_only_answer_returns_answer_missing(self):
        result = evaluate_response_quality(
            {"query": "valid query", "response_text": "   "},
            enabled=True,
        )
        assert result["answerrelevancymetric_reason"] == "answer_missing"

    def test_both_empty_does_not_crash(self):
        # Should not raise — guard clause handles it cleanly
        result = evaluate_response_quality(
            {"query": "", "response_text": ""},
            enabled=True,
        )
        assert result["answerrelevancymetric_reason"] == "answer_missing"


# ------------------------------------------------------------------
# Test: return dict has identical keys in disabled/skipped/scored states
# ------------------------------------------------------------------
class TestKeyStability:
    @pytest.fixture
    def base_result(self):
        return {"query": "what is npk", "response_text": "NPK stands for Nitrogen, Phosphorus, Potassium."}

    def test_disabled_has_all_keys(self, base_result):
        result = evaluate_response_quality(base_result, enabled=False)
        assert _result_keys(result) == _all_result_keys()

    def test_skipped_has_all_keys(self, base_result):
        # Empty context → faithfulness/contextual skipped; answer relevancy runs
        result = evaluate_response_quality(base_result, enabled=True)
        assert _result_keys(result) == _all_result_keys()

    def test_no_crash_keys_match_even_on_empty_inputs(self):
        # Even the answer_missing path must return all keys
        for inputs in [
            {"query": "", "response_text": "x"},
            {"query": "x", "response_text": ""},
            {"query": "", "response_text": ""},
        ]:
            result = evaluate_response_quality(inputs, enabled=True)
            assert _result_keys(result) == _all_result_keys(), f"key mismatch with {inputs}"

    def test_keys_are_identical_across_all_states(self, base_result):
        r_disabled = evaluate_response_quality(base_result, enabled=False)
        r_skipped  = evaluate_response_quality(base_result, enabled=True)
        assert _result_keys(r_disabled) == _result_keys(r_skipped)


# ------------------------------------------------------------------
# Test: build_summary — answer_relevancy_evaluated, _passed, mean_score,
#        faithfulness_skipped, contextual_relevancy_skipped,
#        gdb_match_score_evaluated, gdb_match_score_mean_score
# ------------------------------------------------------------------
class TestBuildSummary:
    def test_answer_relevancy_counts(self):
        results = [
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.8500",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.9000",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
            {
                "answerrelevancymetric_passed": "FAIL",
                "answerrelevancymetric_score": "0.3000",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextual_relevancymetric_passed": "SKIPPED",
            },
        ]
        summary = build_summary(results)
        assert summary["answer_relevancy_evaluated"] == 3
        assert summary["answer_relevancy_passed"] == 2
        assert summary["answer_relevancy_mean_score"] == round((0.85 + 0.90 + 0.30) / 3, 4)

    def test_skipped_counts(self):
        results = [
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.8",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "1.0",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
        ]
        summary = build_summary(results)
        assert summary["faithfulness_skipped"] == 2
        assert summary["contextual_relevancy_skipped"] == 2

    def test_empty_results(self):
        summary = build_summary([])
        assert summary["total_cases"] == 0
        assert summary["answer_relevancy_evaluated"] == 0
        assert summary["answer_relevancy_passed"] == 0
        assert summary["answer_relevancy_mean_score"] is None
        assert summary["faithfulness_skipped"] == 0
        assert summary["contextual_relevancy_skipped"] == 0

    def test_all_skipped_no_zero_division(self):
        """If no AnswerRelevancy scores were recorded, mean must not raise ZeroDivisionError."""
        results = [
            {
                "answerrelevancymetric_passed": "SKIPPED",  # not PASS/FAIL — not counted in ran
                "answerrelevancymetric_score": "",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
            {
                "answerrelevancymetric_passed": "SKIPPED",
                "answerrelevancymetric_score": "",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
        ]
        summary = build_summary(results)
        # answer_relevancy_mean_score must be None (not a division error)
        assert summary["answer_relevancy_evaluated"] == 0
        assert summary["answer_relevancy_passed"] == 0
        assert summary["answer_relevancy_mean_score"] is None
        assert summary["faithfulness_skipped"] == 2
        assert summary["contextual_relevancy_skipped"] == 2

    def test_empty_string_scores_are_ignored_in_mean(self):
        """Scores that are empty strings must not corrupt the mean calculation."""
        results = [
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.8000",
                "faithfulnessmetric_passed": "disabled",
                "contextualrelevancymetric_passed": "disabled",
            },
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.9000",
                "faithfulnessmetric_passed": "disabled",
                "contextualrelevancymetric_passed": "disabled",
            },
        ]
        summary = build_summary(results)
        # Mean should be computed from valid floats only — (0.8+0.9)/2
        assert summary["answer_relevancy_mean_score"] == round(0.85, 4)

    def test_mixed_pass_fail(self):
        results = [
            {
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "1.0000",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
            {
                "answerrelevancymetric_passed": "FAIL",
                "answerrelevancymetric_score": "0.1000",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
            },
        ]
        summary = build_summary(results)
        assert summary["answer_relevancy_evaluated"] == 2
        assert summary["answer_relevancy_passed"] == 1
        assert summary["answer_relevancy_mean_score"] == round(0.55, 4)

    # ── gdb_match_score aggregation ─────────────────────────────────────
    def test_gdb_match_score_evaluated_counts_only_set_method(self):
        """Cases with method='not_applicable' must NOT be counted as evaluated."""
        results = [
            {  # evaluated — method is set
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.9",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
                "gdb_match_score_score": "1.0",
                "gdb_match_score_method": "seqmatch",
            },
            {  # evaluated — different method
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.8",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
                "gdb_match_score_score": "0.5",
                "gdb_match_score_method": "jaccard",
            },
            {  # not evaluated — no expected_output (live run)
                "answerrelevancymetric_passed": "PASS",
                "answerrelevancymetric_score": "0.7",
                "faithfulnessmetric_passed": "SKIPPED",
                "contextualrelevancymetric_passed": "SKIPPED",
                "gdb_match_score_score": "",
                "gdb_match_score_method": "not_applicable",
            },
        ]
        summary = build_summary(results)
        assert summary["gdb_match_score_evaluated"] == 2
        assert summary["gdb_match_score_mean_score"] == round((1.0 + 0.5) / 2, 4)

    def test_gdb_match_score_no_evaluated_returns_none_mean(self):
        results = [
            {"gdb_match_score_score": "", "gdb_match_score_method": "not_applicable"},
        ]
        summary = build_summary(results)
        assert summary["gdb_match_score_evaluated"] == 0
        assert summary["gdb_match_score_mean_score"] is None

    def test_empty_results_includes_gdb_keys(self):
        """build_summary's empty-results path must still include the new keys."""
        summary = build_summary([])
        assert summary["gdb_match_score_evaluated"] == 0
        assert summary["gdb_match_score_mean_score"] is None


# ------------------------------------------------------------------
# Test: gdb_match_score integration in evaluate_response_quality
#        Independent of retrieval_context — runs whenever
#        expected_output is present in result dict.
# ------------------------------------------------------------------
class TestGDBMatchScoreIntegration:
    def test_runs_when_expected_output_present(self):
        """expected_output present → method != 'not_applicable', score is computed."""
        result = evaluate_response_quality(
            {
                "query": "What causes tomato blight?",
                "response_text": "Tomato blight is caused by Phytophthora infestans.",
                "expected_output": "Tomato blight is caused by Phytophthora infestans.",
            },
            enabled=True,
        )
        # Both keys present in the dict (key-stability invariant)
        assert "gdb_match_score_score" in result
        assert "gdb_match_score_method" in result
        # Method was a real similarity algorithm (not "not_applicable")
        assert result["gdb_match_score_method"] != "not_applicable"
        assert result["gdb_match_score_method"] != ""
        # Self-match → score 1.0
        assert float(result["gdb_match_score_score"]) == 1.0

    def test_not_applicable_when_expected_output_missing(self):
        """Live agent runs lack expected_output → method='not_applicable'."""
        result = evaluate_response_quality(
            {
                "query": "What causes tomato blight?",
                "response_text": "Tomato blight is caused by Phytophthora infestans.",
                # NO expected_output key
            },
            enabled=True,
        )
        assert result["gdb_match_score_method"] == "not_applicable"
        assert result["gdb_match_score_score"] == ""

    def test_not_applicable_when_expected_output_empty_string(self):
        """Empty-string expected_output → 'not_applicable' (not guessed)."""
        result = evaluate_response_quality(
            {
                "query": "x",
                "response_text": "y",
                "expected_output": "",
            },
            enabled=True,
        )
        assert result["gdb_match_score_method"] == "not_applicable"
        assert result["gdb_match_score_score"] == ""

    def test_independent_of_retrieval_context(self):
        """gdb_match_score MUST run regardless of retrieval_context.

        This is the key contrast with Faithfulness/ContextualRelevancy:
        those skip when retrieval_context is empty; gdb_match_score does not.
        """
        result = evaluate_response_quality(
            {
                "query": "What is NPK?",
                "response_text": "NPK is Nitrogen, Phosphorus, Potassium.",
                "expected_output": "NPK stands for Nitrogen, Phosphorus, Potassium.",
                "context": [],  # empty — would skip Faithfulness/ContextualRelevancy
            },
            enabled=True,
        )
        # Faithfulness + ContextualRelevancy skipped
        assert result["faithfulnessmetric_passed"] == "SKIPPED"
        assert result["contextualrelevancymetric_passed"] == "SKIPPED"
        # gdb_match_score still ran
        assert result["gdb_match_score_method"] != "not_applicable"
        assert result["gdb_match_score_score"] != ""

    def test_disabled_state_still_has_gdb_keys(self):
        """Even in the disabled stub, the gdb_match keys must be present."""
        result = evaluate_response_quality(
            {
                "query": "x",
                "response_text": "y",
                "expected_output": "y",
            },
            enabled=False,
        )
        assert "gdb_match_score_score" in result
        assert "gdb_match_score_method" in result
        assert result["gdb_match_score_method"] == "not_applicable"
        assert result["gdb_match_score_score"] == ""

    def test_answer_missing_state_has_gdb_keys(self):
        """Even on empty query/answer, gdb_match keys must be present."""
        result = evaluate_response_quality(
            {
                "query": "",
                "response_text": "",
                "expected_output": "something",
            },
            enabled=True,
        )
        assert "gdb_match_score_score" in result
        assert "gdb_match_score_method" in result
        assert result["gdb_match_score_method"] == "not_applicable"


# ------------------------------------------------------------------
# Test: _parse_score edge cases
# ------------------------------------------------------------------
class TestParseScore:
    def test_parses_valid_float_strings(self):
        assert _parse_score("0.85") == 0.85
        assert _parse_score("1.0000") == 1.0
        assert _parse_score("0.0") == 0.0

    def test_empty_string_returns_none(self):
        assert _parse_score("") is None

    def test_non_numeric_string_returns_none(self):
        assert _parse_score("PASS") is None
        assert _parse_score("SKIPPED") is None
        assert _parse_score("disabled") is None
        assert _parse_score("N/A") is None

    def test_none_returns_none(self):
        assert _parse_score(None) is None