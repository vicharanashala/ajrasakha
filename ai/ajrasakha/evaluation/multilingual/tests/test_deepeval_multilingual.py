"""Mocked unit tests for the DeepEval opt-in evaluator (Step 012).

ALL tests in this file use unittest.mock — no real API calls, no credentials.
These tests verify the evaluator's control-flow logic only.
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import patch, MagicMock

from ajrasakha.evaluation.multilingual.validators.deepeval_multilingual import (
    evaluate_deepeval,
    is_deepeval_enabled,
)


class TestDeepEvalControlFlow:
    def test_skipped_when_flag_not_set(self):
        env = {k: v for k, v in os.environ.items() if k != "DEEPEVAL_MULTILINGUAL"}
        with patch.dict(os.environ, env, clear=True):
            r = evaluate_deepeval("query", "response")
            assert r["deepeval_status"] == "SKIPPED"
            assert r["deepeval_answer_relevancy"] is None
            assert r["deepeval_faithfulness"] is None

    def test_blocked_when_no_model_credentials(self):
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "",
            "OPENAI_API_KEY": "",
        }):
            r = evaluate_deepeval("query", "response")
            assert r["deepeval_status"] == "BLOCKED"
            assert "BLOCKED" in r["deepeval_reason"]
            assert r["deepeval_answer_relevancy"] is None

    def test_blocked_on_empty_response(self):
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "fake-key",
        }):
            r = evaluate_deepeval("query", "   ")
            assert r["deepeval_status"] == "BLOCKED"

    def test_pass_when_metrics_pass(self):
        mock_results = {
            "AnswerRelevancyMetric": {"score": 0.92, "passed": True, "reason": ""},
            "FaithfulnessMetric": {"score": 0.88, "passed": True, "reason": ""},
        }
        fake_module = MagicMock()
        fake_module.evaluate_answer_with_deepeval = MagicMock(return_value=mock_results)
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "fake-key",
        }):
            import sys
            sys.modules["ajrasakha.evaluation.deepeval_metrics"] = fake_module
            try:
                r = evaluate_deepeval("What is wheat?", "Wheat is a cereal crop.")
            finally:
                sys.modules.pop("ajrasakha.evaluation.deepeval_metrics", None)
        assert r["deepeval_status"] == "PASS"
        assert r["deepeval_answer_relevancy"] == pytest.approx(0.92)
        assert r["deepeval_faithfulness"] == pytest.approx(0.88)
        assert r["deepeval_reason"] == ""

    def test_fail_when_relevancy_fails(self):
        mock_results = {
            "AnswerRelevancyMetric": {"score": 0.3, "passed": False, "reason": "off-topic"},
            "FaithfulnessMetric": {"score": 0.9, "passed": True, "reason": ""},
        }
        fake_module = MagicMock()
        fake_module.evaluate_answer_with_deepeval = MagicMock(return_value=mock_results)
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "fake-key",
        }):
            import sys
            sys.modules["ajrasakha.evaluation.deepeval_metrics"] = fake_module
            try:
                r = evaluate_deepeval("query", "some response")
            finally:
                sys.modules.pop("ajrasakha.evaluation.deepeval_metrics", None)
        assert r["deepeval_status"] == "FAIL"
        assert "AnswerRelevancy" in r["deepeval_reason"]
        assert "off-topic" in r["deepeval_reason"]

    def test_error_on_exception(self):
        fake_module = MagicMock()
        fake_module.evaluate_answer_with_deepeval = MagicMock(
            side_effect=RuntimeError("API timeout")
        )
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "fake-key",
        }):
            import sys
            sys.modules["ajrasakha.evaluation.deepeval_metrics"] = fake_module
            try:
                r = evaluate_deepeval("query", "response")
            finally:
                sys.modules.pop("ajrasakha.evaluation.deepeval_metrics", None)
        assert r["deepeval_status"] == "ERROR"
        assert "API timeout" in r["deepeval_reason"]

    def test_is_enabled_false_without_flag(self):
        env = {k: v for k, v in os.environ.items() if k != "DEEPEVAL_MULTILINGUAL"}
        with patch.dict(os.environ, env, clear=True):
            assert is_deepeval_enabled() is False

    def test_is_enabled_false_without_creds(self):
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "",
            "OPENAI_API_KEY": "",
        }):
            assert is_deepeval_enabled() is False

    def test_is_enabled_true_with_flag_and_creds(self):
        with patch.dict(os.environ, {
            "DEEPEVAL_MULTILINGUAL": "1",
            "ANTHROPIC_API_KEY": "any-key",
        }):
            assert is_deepeval_enabled() is True
