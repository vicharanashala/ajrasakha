"""Fake-result tests for wiring answer quality into the evaluation report.

No network, no real API keys. Tests 5, 6 and 10 are expected to fail until
the later implementation steps.
"""

from types import SimpleNamespace

import pytest

from ajrasakha.agents.answer_footers import FOOTER_SEPARATOR
from ajrasakha.agents.translation_catalog import (
    get_two_hour_disclaimer,
    get_weather_unavailable_reply,
)
from ajrasakha.evaluation import answer_eval
from ajrasakha.evaluation import deepeval_metrics as dm
from ajrasakha.evaluation import run as run_module
from ajrasakha.evaluation.questions import TEST_CASES
from ajrasakha.evaluation.tech import evaluate_technical


QUALITY_KEYS = (
    "answerrelevancymetric_score",
    "answerrelevancymetric_passed",
    "answerrelevancymetric_reason",
    "faithfulnessmetric_score",
    "faithfulnessmetric_passed",
    "faithfulnessmetric_reason",
    "contextualrelevancymetric_score",
    "contextualrelevancymetric_passed",
    "contextualrelevancymetric_reason",
    "gdbmatchmetric_score",
    "gdbmatchmetric_passed",
    "gdbmatchmetric_reason",
    "agriculturalaccuracymetric_score",
    "agriculturalaccuracymetric_passed",
    "agriculturalaccuracymetric_reason",
    "agriculturalaccuracymetric_crop_score",
    "agriculturalaccuracymetric_crop_reason",
    "agriculturalaccuracymetric_crop_applicable",
    "agriculturalaccuracymetric_crop_error",
    "agriculturalaccuracymetric_region_score",
    "agriculturalaccuracymetric_region_reason",
    "agriculturalaccuracymetric_region_applicable",
    "agriculturalaccuracymetric_region_error",
    "agriculturalaccuracymetric_cultivation_guidance_score",
    "agriculturalaccuracymetric_cultivation_guidance_reason",
    "agriculturalaccuracymetric_cultivation_guidance_applicable",
    "agriculturalaccuracymetric_cultivation_guidance_error",
    "judge_label",
    "answer_quality_enabled",
    "outcome",
)

METRIC_PREFIXES = (
    "answerrelevancymetric",
    "faithfulnessmetric",
    "contextualrelevancymetric",
    "gdbmatchmetric",
    "agriculturalaccuracymetric",
)

TECHNICAL_KEYS = {
    "technical_pass",
    "routing_pass",
    "failure_reason",
    "triage_action",
}

JUDGE_VARS = (
    "JUDGE_PROVIDER",
    "JUDGE_MODEL",
    "JUDGE_BASE_URL",
    "JUDGE_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
)

DEFAULT_METRICS = {
    "AnswerRelevancyMetric": {
        "score": 0.91,
        "passed": True,
        "reason": "relevant to the question",
    },
    "FaithfulnessMetric": {
        "score": 0.72,
        "passed": True,
        "reason": "supported by context",
    },
    "ContextualRelevancyMetric": {
        "score": 0.44,
        "passed": False,
        "reason": "context has some noise",
    },
    "GDBMatchMetric": {
        "score": 0.63,
        "passed": None,
        "reason": "agrees with the reference guidance",
    },
}


DEFAULT_AGRICULTURAL = {
    "score": 0.8,
    "passed": None,
    "reason": "crop=1.0 (supported): expected crop present",
}


def make_case(**overrides):
    case = {
        "name": "case_x",
        "query": "What is the price of wheat in Sirsa mandi?",
        "expected_domain": "Market Prices",
        "expected_tools": ["upload_question_to_reviewer_system", "market"],
        "expected_plan": {"mandi": True},
    }
    case.update(overrides)
    return case


def make_result(
    *,
    final_answer="",
    retrieval_context=None,
    plan=None,
    observed_tools="upload_question_to_reviewer_system",
):
    return {
        "name": "case_x",
        "query": "What is the price of wheat in Sirsa mandi?",
        "expected_tools": "upload_question_to_reviewer_system,market",
        "observed_tools": observed_tools,
        "http_status": 200,
        "graph_status": "success",
        "latency_seconds": 0.1,
        "response_text": final_answer,
        "final_answer": final_answer,
        "retrieval_context": [] if retrieval_context is None else retrieval_context,
        "error": "",
        "trace": {
            "nodes": [],
            "plan": {} if plan is None else plan,
            "tools": [],
            "mcp_services": [],
            "errors": [],
        },
    }


def disabled_quality():
    return {
        "answerrelevancymetric_score": "",
        "answerrelevancymetric_passed": "",
        "answerrelevancymetric_reason": "disabled",
        "faithfulnessmetric_score": "",
        "faithfulnessmetric_passed": "",
        "faithfulnessmetric_reason": "disabled",
        "contextualrelevancymetric_score": "",
        "contextualrelevancymetric_passed": "",
        "contextualrelevancymetric_reason": "disabled",
        "gdbmatchmetric_score": "",
        "gdbmatchmetric_passed": "",
        "gdbmatchmetric_reason": "disabled",
        "agriculturalaccuracymetric_score": "",
        "agriculturalaccuracymetric_passed": "",
        "agriculturalaccuracymetric_reason": "disabled",
        "agriculturalaccuracymetric_crop_score": "",
        "agriculturalaccuracymetric_crop_reason": "",
        "agriculturalaccuracymetric_crop_applicable": "",
        "agriculturalaccuracymetric_crop_error": "",
        "agriculturalaccuracymetric_region_score": "",
        "agriculturalaccuracymetric_region_reason": "",
        "agriculturalaccuracymetric_region_applicable": "",
        "agriculturalaccuracymetric_region_error": "",
        "agriculturalaccuracymetric_cultivation_guidance_score": "",
        "agriculturalaccuracymetric_cultivation_guidance_reason": "",
        "agriculturalaccuracymetric_cultivation_guidance_applicable": "",
        "agriculturalaccuracymetric_cultivation_guidance_error": "",
        "judge_label": "",
        "answer_quality_enabled": False,
        "outcome": "",
    }


def install_judge(monkeypatch, func):
    """Patch the judge in both possible import locations and set fake env."""
    for name in JUDGE_VARS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("JUDGE_PROVIDER", "openai")
    monkeypatch.setenv("JUDGE_MODEL", "test-model")
    monkeypatch.setenv("JUDGE_API_KEY", "test-key")

    monkeypatch.setattr(dm, "evaluate_answer_with_deepeval", func)
    monkeypatch.setattr(
        answer_eval, "evaluate_answer_with_deepeval", func, raising=False
    )
    return func


def recording_judge(monkeypatch, result=None):
    calls = []

    def fake(query, answer, context=None, expected_output=None):
        calls.append(
            SimpleNamespace(
                query=query,
                answer=answer,
                context=list(context or []),
                expected_output=expected_output,
            )
        )
        return DEFAULT_METRICS if result is None else result

    install_judge(monkeypatch, fake)
    # The agricultural metric is a separate judge call path. Install a benign
    # fake by default so a case with expectations never reaches the real judge.
    recording_agricultural(monkeypatch)
    return calls


def install_agricultural(monkeypatch, func):
    """Patch the agricultural scorer at its definition site.

    ``answer_eval`` imports it lazily inside the function, so patching
    ``dm.evaluate_agricultural_accuracy`` is the only effective target.
    """
    monkeypatch.setattr(dm, "evaluate_agricultural_accuracy", func)
    return func


def recording_agricultural(monkeypatch, result=None):
    calls = []

    def fake(query, answer, expectations):
        calls.append(
            SimpleNamespace(
                query=query,
                answer=answer,
                expectations=expectations,
            )
        )
        return DEFAULT_AGRICULTURAL if result is None else result

    install_agricultural(monkeypatch, fake)
    return calls


def agricultural_must_not_run(*args, **kwargs):
    raise AssertionError("the agricultural judge must not be called")


def judge_must_not_run(*args, **kwargs):
    raise AssertionError("the judge must not be called for this case")


def forbid_judge_config(monkeypatch):
    """Prove a path neither reads nor builds judge configuration."""
    for name in JUDGE_VARS:
        monkeypatch.delenv(name, raising=False)

    def config_must_not_be_read(*args, **kwargs):
        raise AssertionError("judge configuration must not be read")

    monkeypatch.setattr(dm, "load_judge_config", config_must_not_be_read)
    monkeypatch.setattr(dm, "get_judge_model", config_must_not_be_read)
    monkeypatch.setattr(
        answer_eval, "load_judge_config", config_must_not_be_read, raising=False
    )
    monkeypatch.setattr(
        answer_eval, "get_judge_model", config_must_not_be_read, raising=False
    )
    monkeypatch.setattr(dm, "evaluate_answer_with_deepeval", judge_must_not_run)
    monkeypatch.setattr(
        answer_eval,
        "evaluate_answer_with_deepeval",
        judge_must_not_run,
        raising=False,
    )
    monkeypatch.setattr(
        dm, "evaluate_agricultural_accuracy", agricultural_must_not_run
    )


def assert_na(quality, prefix, reason):
    assert quality[f"{prefix}_score"] == ""
    assert quality[f"{prefix}_passed"] == ""
    assert quality[f"{prefix}_reason"] == reason


def test_metric_prefixes_match_deepeval_metric_names():
    for metric_name, prefix in answer_eval.METRIC_COLUMNS:
        assert prefix == metric_name.lower()


# --- 1. mock / disabled ----------------------------------------------------


def test_mock_returns_disabled_contract(monkeypatch):
    forbid_judge_config(monkeypatch)

    quality = answer_eval.evaluate_response_quality(
        make_result(), make_case(), enabled=False
    )

    assert tuple(quality) == QUALITY_KEYS
    assert quality == disabled_quality()
    assert quality["agriculturalaccuracymetric_crop_score"] == ""
    assert quality["agriculturalaccuracymetric_region_score"] == ""
    assert quality["agriculturalaccuracymetric_cultivation_guidance_score"] == ""
    assert quality["answer_quality_enabled"] is False


# --- 2. answered with context ---------------------------------------------


def test_answered_with_context_maps_all_metrics(monkeypatch):
    calls = recording_judge(monkeypatch)
    agri_calls = recording_agricultural(monkeypatch)
    reference = "Wheat in Sirsa mandi is around Rs 2,400 per quintal."
    result = make_result(
        final_answer="Wheat in Sirsa mandi is around Rs 2,400 per quintal.",
        retrieval_context=["[market] Sirsa wheat modal price is Rs 2,400."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(expected_answer=reference), enabled=True
    )

    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["answerrelevancymetric_passed"] is True
    assert quality["answerrelevancymetric_reason"] == "relevant to the question"
    assert quality["faithfulnessmetric_score"] == 0.72
    assert quality["faithfulnessmetric_passed"] is True
    assert quality["contextualrelevancymetric_score"] == 0.44
    assert quality["contextualrelevancymetric_passed"] is False
    assert quality["gdbmatchmetric_score"] == 0.63
    assert quality["gdbmatchmetric_passed"] == ""
    assert (
        quality["gdbmatchmetric_reason"]
        == "agrees with the reference guidance"
    )
    assert quality["agriculturalaccuracymetric_score"] == 0.8
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert (
        quality["agriculturalaccuracymetric_reason"]
        == "crop=1.0 (supported): expected crop present"
    )
    assert quality["judge_label"] == "openai:test-model"
    assert quality["answer_quality_enabled"] is True
    assert quality["outcome"] == "answered"

    assert len(calls) == 1
    assert calls[0].answer == result["final_answer"]
    assert calls[0].context == result["retrieval_context"]
    assert calls[0].expected_output == reference

    assert len(agri_calls) == 1
    assert agri_calls[0].query == result["query"]
    assert agri_calls[0].answer == result["final_answer"]
    assert agri_calls[0].expectations["applicable"] == {
        "crop": False,
        "region": False,
        "cultivation_guidance": True,
    }


# --- 3. greeting -----------------------------------------------------------


def test_greeting_is_not_applicable(monkeypatch):
    install_judge(monkeypatch, judge_must_not_run)
    result = make_result(
        final_answer="Namaste! I am AjraSakha.",
        plan={"is_greeting": True},
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    for prefix in METRIC_PREFIXES:
        assert_na(quality, prefix, "not_applicable: greeting")
    assert quality["judge_label"] == ""
    assert quality["outcome"] == "answered"


def test_reasoning_greeting_is_not_applicable(monkeypatch):
    install_judge(monkeypatch, judge_must_not_run)
    result = make_result(
        final_answer="Hello! How can I help with your farm today?",
        plan={"reasoning": "greeting"},
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    for prefix in METRIC_PREFIXES:
        assert_na(quality, prefix, "not_applicable: greeting")
    assert quality["judge_label"] == ""
    assert quality["outcome"] == "answered"


def test_general_domain_fallback_is_not_applicable(monkeypatch):
    install_judge(monkeypatch, judge_must_not_run)
    result = make_result(
        final_answer="Namaste! Ask me anything about farming.",
        plan={},
    )
    case = make_case(expected_domain="General", expected_tools=[])

    quality = answer_eval.evaluate_response_quality(
        result, case, enabled=True
    )

    for prefix in METRIC_PREFIXES:
        assert_na(quality, prefix, "not_applicable: greeting")
    assert quality["judge_label"] == ""
    assert quality["outcome"] == "answered"


def test_general_domain_with_expected_tools_is_not_greeting(monkeypatch):
    calls = recording_judge(monkeypatch)
    result = make_result(
        final_answer="I can only help with agriculture-related questions.",
        plan={},
    )
    case = make_case(
        expected_domain="General",
        expected_tools=["upload_question_to_reviewer_system"],
    )

    quality = answer_eval.evaluate_response_quality(
        result, case, enabled=True
    )

    assert quality["outcome"] == "answered"
    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["answerrelevancymetric_reason"] != "not_applicable: greeting"
    assert len(calls) == 1
    assert_na(
        quality,
        "faithfulnessmetric",
        "not_applicable: no retrieval context",
    )


# --- 4. empty context, non-greeting ---------------------------------------


def test_empty_context_only_skips_context_metrics(monkeypatch):
    calls = recording_judge(monkeypatch)
    reference = "Sow wheat in November after the first irrigation."
    result = make_result(
        final_answer="Sow wheat in November after the first irrigation.",
        retrieval_context=[],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(expected_answer=reference), enabled=True
    )

    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["answerrelevancymetric_passed"] is True
    assert quality["gdbmatchmetric_score"] == 0.63
    assert (
        quality["gdbmatchmetric_reason"]
        == "agrees with the reference guidance"
    )
    # Agricultural scoring does not depend on retrieval context.
    assert quality["agriculturalaccuracymetric_score"] == 0.8
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert_na(
        quality,
        "faithfulnessmetric",
        "not_applicable: no retrieval context",
    )
    assert_na(
        quality,
        "contextualrelevancymetric",
        "not_applicable: no retrieval context",
    )
    assert len(calls) == 1
    assert calls[0].context == []
    assert calls[0].expected_output == reference


# --- 4b. GDB reference applicability -------------------------------------


def test_missing_reference_marks_gdb_not_applicable(monkeypatch):
    metrics = {
        **DEFAULT_METRICS,
        "GDBMatchMetric": {
            "score": 0.63,
            "passed": None,
            "reason": "no_expected_answer",
        },
    }
    recording_judge(monkeypatch, result=metrics)
    result = make_result(
        final_answer="Apply 50 kg DAP per acre at sowing.",
        retrieval_context=["[soil] DAP dose is 50 kg per acre."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    assert_na(
        quality,
        "gdbmatchmetric",
        "not_applicable: no expected answer",
    )
    assert_na(
        quality,
        "agriculturalaccuracymetric",
        "not_applicable: no agricultural expectations",
    )
    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["faithfulnessmetric_score"] == 0.72
    assert quality["contextualrelevancymetric_score"] == 0.44


def test_gdb_passed_stays_empty_pending_calibration(monkeypatch):
    metrics = {
        **DEFAULT_METRICS,
        "GDBMatchMetric": {
            "score": 0.8,
            "passed": True,
            "reason": "agrees with the reference",
        },
    }
    recording_judge(monkeypatch, result=metrics)
    result = make_result(
        final_answer="Apply 50 kg DAP per acre at sowing.",
        retrieval_context=["[soil] DAP dose is 50 kg per acre."],
    )

    quality = answer_eval.evaluate_response_quality(
        result,
        make_case(expected_answer="Apply 50 kg DAP per acre at sowing."),
        enabled=True,
    )

    assert quality["gdbmatchmetric_score"] == 0.8
    assert quality["gdbmatchmetric_passed"] == ""
    assert quality["gdbmatchmetric_reason"] == "agrees with the reference"


def test_gdb_metric_error_does_not_block_other_metrics(monkeypatch):
    metrics = {
        **DEFAULT_METRICS,
        "GDBMatchMetric": {
            "score": None,
            "passed": None,
            "reason": "gdb judge timed out",
        },
    }
    recording_judge(monkeypatch, result=metrics)
    result = make_result(
        final_answer="Apply 50 kg DAP per acre at sowing.",
        retrieval_context=["[soil] DAP dose is 50 kg per acre."],
    )

    quality = answer_eval.evaluate_response_quality(
        result,
        make_case(expected_answer="Apply 50 kg DAP per acre at sowing."),
        enabled=True,
    )

    assert quality["gdbmatchmetric_score"] == ""
    assert quality["gdbmatchmetric_passed"] == ""
    assert quality["gdbmatchmetric_reason"] == "gdb judge timed out"
    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["faithfulnessmetric_score"] == 0.72
    assert quality["contextualrelevancymetric_score"] == 0.44


# --- 4c. agricultural applicability and isolation ------------------------


def agricultural_case(**overrides):
    """Case with all three explicit agricultural expectations."""
    return make_case(
        expected_plan={"crop": "Paddy"},
        location={"state": "Punjab", "city": "Ropar"},
        expected_answer="Transplant paddy seedlings after puddling.",
        expected_answer_source="synthetic_manual",
        **overrides,
    )


def test_applicable_agricultural_dimensions_are_mapped(monkeypatch):
    recording_judge(monkeypatch)
    agri_calls = recording_agricultural(
        monkeypatch,
        result={
            "score": 0.17,
            "passed": None,
            "reason": (
                "crop=1.0 (supported): paddy named | "
                "region=0.0 (contradictory): different state | "
                "cultivation_guidance=0.5 (omitted or partial): partial guidance"
            ),
        },
    )
    result = make_result(
        final_answer="Grow paddy in Haryana; transplant seedlings after puddling.",
        retrieval_context=["[gdb] Paddy guidance for Punjab."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, agricultural_case(), enabled=True
    )

    assert quality["agriculturalaccuracymetric_score"] == 0.17
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert "crop=1.0" in quality["agriculturalaccuracymetric_reason"]
    assert "region=0.0" in quality["agriculturalaccuracymetric_reason"]
    assert "cultivation_guidance=0.5" in quality["agriculturalaccuracymetric_reason"]

    assert len(agri_calls) == 1
    assert agri_calls[0].expectations["applicable"] == {
        "crop": True,
        "region": True,
        "cultivation_guidance": True,
    }


def test_non_applicable_agricultural_dimensions_are_excluded(monkeypatch):
    recording_judge(monkeypatch)
    agri_calls = recording_agricultural(monkeypatch)
    result = make_result(
        final_answer="Punjab receives moderate rainfall this week.",
        retrieval_context=["[weather] Punjab rainfall outlook."],
    )

    quality = answer_eval.evaluate_response_quality(
        result,
        make_case(location={"state": "Punjab"}),
        enabled=True,
    )

    assert quality["agriculturalaccuracymetric_score"] == 0.8
    assert len(agri_calls) == 1
    assert agri_calls[0].expectations["applicable"] == {
        "crop": False,
        "region": True,
        "cultivation_guidance": False,
    }


def test_no_agricultural_expectations_marks_not_applicable(monkeypatch):
    recording_judge(monkeypatch)
    install_agricultural(monkeypatch, agricultural_must_not_run)
    result = make_result(
        final_answer="Wheat price is Rs 2,400.",
        retrieval_context=["[market] Wheat price is Rs 2,400."],
    )

    quality = answer_eval.evaluate_response_quality(
        result,
        make_case(expected_plan={"crop": "all"}),
        enabled=True,
    )

    assert_na(
        quality,
        "agriculturalaccuracymetric",
        "not_applicable: no agricultural expectations",
    )
    # Other metrics are unaffected by the missing agricultural expectations.
    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["faithfulnessmetric_score"] == 0.72
    assert quality["contextualrelevancymetric_score"] == 0.44


def test_valid_zero_agricultural_score_is_preserved(monkeypatch):
    recording_judge(monkeypatch)
    recording_agricultural(
        monkeypatch,
        result={
            "score": 0.0,
            "passed": None,
            "reason": "crop=0.0 (contradictory): different crop named",
        },
    )
    result = make_result(
        final_answer="Grow maize instead.",
        retrieval_context=["[gdb] Paddy guidance."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(expected_plan={"crop": "Paddy"}), enabled=True
    )

    assert quality["agriculturalaccuracymetric_score"] == 0.0
    assert quality["agriculturalaccuracymetric_score"] != ""
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert "contradictory" in quality["agriculturalaccuracymetric_reason"]


def test_agricultural_error_does_not_block_other_metrics(monkeypatch):
    recording_judge(monkeypatch)

    def boom(query, answer, expectations):
        raise RuntimeError("agri boom")

    install_agricultural(monkeypatch, boom)
    result = make_result(
        final_answer="Apply 50 kg DAP per acre at sowing.",
        retrieval_context=["[soil] DAP dose is 50 kg per acre."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, agricultural_case(), enabled=True
    )

    assert quality["agriculturalaccuracymetric_score"] == ""
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert quality["agriculturalaccuracymetric_reason"].startswith(
        "agricultural_error:"
    )
    assert "agri boom" in quality["agriculturalaccuracymetric_reason"]
    # An agricultural failure never erases the existing metric columns.
    assert quality["answerrelevancymetric_score"] == 0.91
    assert quality["faithfulnessmetric_score"] == 0.72
    assert quality["contextualrelevancymetric_score"] == 0.44
    assert quality["gdbmatchmetric_score"] == 0.63


def test_agricultural_missing_score_clears_passed(monkeypatch):
    recording_judge(monkeypatch)
    recording_agricultural(
        monkeypatch,
        result={
            "score": None,
            "passed": None,
            "reason": "agricultural_region_error: timeout",
        },
    )
    result = make_result(
        final_answer="Punjab receives moderate rainfall.",
        retrieval_context=["[weather] Punjab rainfall outlook."],
    )

    quality = answer_eval.evaluate_response_quality(
        result,
        make_case(location={"state": "Punjab"}),
        enabled=True,
    )

    assert quality["agriculturalaccuracymetric_score"] == ""
    assert quality["agriculturalaccuracymetric_passed"] == ""
    assert (
        quality["agriculturalaccuracymetric_reason"]
        == "agricultural_region_error: timeout"
    )


def test_agricultural_setup_error_propagates(monkeypatch):
    recording_judge(monkeypatch)

    def setup_error(query, answer, expectations):
        raise dm.JudgeSetupError("JUDGE_API_KEY is not set.")

    install_agricultural(monkeypatch, setup_error)
    result = make_result(
        final_answer="Grow paddy in Punjab.",
        retrieval_context=["[gdb] Paddy guidance."],
    )

    with pytest.raises(dm.JudgeSetupError):
        answer_eval.evaluate_response_quality(
            result, agricultural_case(), enabled=True
        )


def test_mock_mode_never_invokes_agricultural_judge(monkeypatch):
    forbid_judge_config(monkeypatch)

    quality = answer_eval.evaluate_response_quality(
        make_result(final_answer="Grow paddy in Punjab."),
        agricultural_case(),
        enabled=False,
    )

    assert_na(quality, "agriculturalaccuracymetric", "disabled")
    assert quality["answer_quality_enabled"] is False


# --- 5. deferred to expert ------------------------------------------------


def test_translate_path_marks_deferred(monkeypatch):
    install_judge(monkeypatch, judge_must_not_run)
    body = get_two_hour_disclaimer("English", "English")
    result = make_result(
        final_answer=f"{body}\n\n{FOOTER_SEPARATOR}\n\nTesting notice",
        plan={
            "translate_path": "empty_gdb",
            "script_language": "English",
            "vocal_language": "English",
        },
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    assert quality["outcome"] == "deferred_to_expert"
    for prefix in METRIC_PREFIXES:
        assert_na(quality, prefix, "not_applicable: deferred_to_expert")


# --- 6. tool unavailable --------------------------------------------------


def test_catalog_tool_unavailable_reply(monkeypatch):
    install_judge(monkeypatch, judge_must_not_run)
    body = get_weather_unavailable_reply("English", "English")
    result = make_result(
        final_answer=f"{body}\n\n{FOOTER_SEPARATOR}\n\nTesting notice",
        plan={
            "weather": True,
            "script_language": "English",
            "vocal_language": "English",
        },
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    assert quality["outcome"] == "tool_unavailable"
    for prefix in METRIC_PREFIXES:
        assert_na(quality, prefix, "not_applicable: tool_unavailable")


# --- 7. footer stripping --------------------------------------------------


def test_footer_is_stripped_before_judging(monkeypatch):
    calls = recording_judge(monkeypatch)
    agri_calls = recording_agricultural(monkeypatch)
    body = "Apply 50 kg DAP per acre at sowing."
    reference = "Apply 50 kg DAP per acre at sowing time."
    final_answer = (
        f"{body}\n\n{FOOTER_SEPARATOR}\n\n"
        "📚 Sources:\n🔗 https://example.test/source\n\n"
        "⚠️ Important Notice (Testing) ⚠️\n\nExperimental advice."
    )
    result = make_result(
        final_answer=final_answer,
        retrieval_context=["[soil] DAP dose is 50 kg per acre."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(expected_answer=reference), enabled=True
    )

    assert len(calls) == 1
    assert calls[0].answer == body
    assert "Sources:" not in calls[0].answer
    assert "Important Notice" not in calls[0].answer
    assert calls[0].expected_output == reference
    assert len(agri_calls) == 1
    assert agri_calls[0].answer == body
    assert "Sources:" not in agri_calls[0].answer
    assert result["final_answer"] == final_answer
    assert quality["outcome"] == "answered"


# --- 8. judge error paths -------------------------------------------------


def test_unexpected_judge_error_is_recorded(monkeypatch):
    def boom(query, answer, context=None, expected_output=None):
        raise RuntimeError("boom")

    install_judge(monkeypatch, boom)
    result = make_result(
        final_answer="Wheat price is Rs 2,400.",
        retrieval_context=["[market] Wheat price is Rs 2,400."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    for prefix in METRIC_PREFIXES:
        assert quality[f"{prefix}_score"] == ""
        assert quality[f"{prefix}_passed"] == ""
        assert quality[f"{prefix}_reason"].startswith("judge_error:")
        assert "boom" in quality[f"{prefix}_reason"]


def test_none_score_clears_passed(monkeypatch):
    metrics = {
        "AnswerRelevancyMetric": {
            "score": 0.91,
            "passed": True,
            "reason": "relevant",
        },
        "FaithfulnessMetric": {
            "score": None,
            "passed": False,
            "reason": "timeout",
        },
        "ContextualRelevancyMetric": {
            "score": 0.44,
            "passed": False,
            "reason": "noisy",
        },
    }
    install_judge(
        monkeypatch,
        lambda query, answer, context=None, expected_output=None: metrics,
    )
    result = make_result(
        final_answer="Wheat price is Rs 2,400.",
        retrieval_context=["[market] Wheat price is Rs 2,400."],
    )

    quality = answer_eval.evaluate_response_quality(
        result, make_case(), enabled=True
    )

    assert quality["faithfulnessmetric_score"] == ""
    assert quality["faithfulnessmetric_passed"] == ""
    assert "timeout" in quality["faithfulnessmetric_reason"]
    assert quality["answerrelevancymetric_passed"] is True


# --- 9. setup errors propagate -------------------------------------------


def test_judge_setup_error_propagates(monkeypatch):
    def setup_error(query, answer, context=None, expected_output=None):
        raise dm.JudgeSetupError("JUDGE_API_KEY is not set.")

    install_judge(monkeypatch, setup_error)
    result = make_result(
        final_answer="Wheat price is Rs 2,400.",
        retrieval_context=["[market] Wheat price is Rs 2,400."],
    )

    with pytest.raises(dm.JudgeSetupError):
        answer_eval.evaluate_response_quality(
            result, make_case(), enabled=True
        )


# --- 10. run_case passes the case ----------------------------------------


def test_run_case_passes_case_to_answer_eval(monkeypatch):
    calls = []

    def spy(result, case, enabled=False):
        calls.append((result, case, enabled))
        return disabled_quality()

    monkeypatch.setattr(run_module, "evaluate_response_quality", spy)
    case = TEST_CASES[0]

    final = run_module.run_case(case, "mock")

    assert len(calls) == 1
    passed_result, passed_case, passed_enabled = calls[0]
    assert passed_case is case
    assert passed_enabled is False
    assert passed_result["name"] == case["name"]
    assert final["name"] == case["name"]


# --- 11. mock report rows share every quality column ----------------------


def test_mock_rows_share_all_quality_columns():
    cases = {case["name"]: case for case in TEST_CASES}

    gdb_row = run_module.run_case(cases["gdb_question_1"], "mock")
    non_gdb_row = run_module.run_case(cases["weather_question_1"], "mock")

    assert set(gdb_row) == set(non_gdb_row)

    for row in (gdb_row, non_gdb_row):
        assert "gdbmatchmetric_score" in row
        assert "gdbmatchmetric_passed" in row
        assert "gdbmatchmetric_reason" in row
        assert "agriculturalaccuracymetric_score" in row
        assert "agriculturalaccuracymetric_passed" in row
        assert "agriculturalaccuracymetric_reason" in row

    assert gdb_row["gdbmatchmetric_score"] == ""
    assert gdb_row["gdbmatchmetric_passed"] == ""
    assert gdb_row["gdbmatchmetric_reason"] == "disabled"
    assert gdb_row["agriculturalaccuracymetric_score"] == ""
    assert gdb_row["agriculturalaccuracymetric_passed"] == ""
    assert gdb_row["agriculturalaccuracymetric_reason"] == "disabled"


def test_quality_block_does_not_touch_technical_keys(monkeypatch):
    case = make_case(name="mock_case")
    result = make_result()
    # Mock `evaluate_technical` to return a known outcome.
    monkeypatch.setattr(
        run_module, "evaluate_technical", lambda r, c: {"technical_pass": True}
    )
    # Patch `evaluate_response_quality` to return a dummy quality block.
    monkeypatch.setattr(
        run_module, "evaluate_response_quality", lambda r, c, enabled: {"agri_score": 0.8}
    )

    combined = run_module.run_case(case, "mock")

    assert combined["technical_pass"] is True
    # The new answer-quality keys must not overlap with the technical report.
    # Exclude technical keys that we expect to be present in the combined result.
    assert TECHNICAL_KEYS.isdisjoint(set(combined.keys()) - {"technical_pass", "routing_pass", "failure_reason", "triage_action"})


def test_run_case_keeps_technical_outcome_with_quality_enabled(monkeypatch):
    case = make_case(name="mock_case")
    # Patch live case runner to return success without calling bot.
    monkeypatch.setattr(run_module, "run_live_case", lambda c: make_result())
    # Patch technical evaluation to return pass.
    monkeypatch.setattr(
        run_module, "evaluate_technical", lambda r, c: {"technical_pass": True}
    )
    # Patch quality evaluation to return an populated quality block.
    monkeypatch.setattr(
        run_module,
        "evaluate_response_quality",
        lambda r, c, enabled: {"agriculturalaccuracymetric_score": 0.8},
    )

    final = run_module.run_case(case, "live")

    assert final["technical_pass"] is True
    assert final["agriculturalaccuracymetric_score"] == 0.8
