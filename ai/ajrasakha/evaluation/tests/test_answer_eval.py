import json
from unittest.mock import MagicMock, patch

import pytest

from ajrasakha.evaluation.answer_eval import evaluate_response_quality, _disabled_stub
from ajrasakha.evaluation.summary import build_summary, build_domain_quality_breakdown
from ajrasakha.evaluation.questions import load_gdb_fixture, find_reference_answer, PLACEHOLDER_ANSWER

FAKE_SCORES = {
    "AnswerRelevancyMetric": {"score": 0.9, "passed": True, "reason": "relevant"},
    "FaithfulnessMetric": {"score": 0.8, "passed": True, "reason": "faithful"},
    "ContextualRelevancyMetric": {"score": 0.7, "passed": True, "reason": "on-topic"},
    "GDBMatchScore": {"score": 0.85, "passed": True, "reason": "matches reference"},
    "CropCorrectness": {"score": 0.95, "passed": True, "reason": "correct crop"},
    "TreatmentCorrectness": {"score": 0.4, "passed": False, "reason": "wrong treatment"},
    "RegionCorrectness": {"score": 0.1, "passed": False, "reason": "wrong region"},
}


class TestEvaluateResponseQuality:
    def test_enabled_calls_real_scoring_path_and_shapes_all_seven_metrics(self):
        with patch(
            "ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval",
            return_value=FAKE_SCORES,
        ) as mock_eval:
            result = evaluate_response_quality(
                {"query": "How to grow paddy?", "response_text": "Grow paddy like this."},
                {
                    "expected_domain": "Cultural Practices",
                    "expected_plan": {"crop": "Paddy", "state": "Punjab"},
                    "expected_answer": "Reference paddy answer.",
                },
                enabled=True,
            )

        mock_eval.assert_called_once()
        assert result["answer_quality_enabled"] is True

        for metric_name in FAKE_SCORES:
            prefix = metric_name.lower()
            assert result[f"{prefix}_score"] == FAKE_SCORES[metric_name]["score"]
            assert result[f"{prefix}_passed"] == FAKE_SCORES[metric_name]["passed"]
            assert result[f"{prefix}_reason"] == FAKE_SCORES[metric_name]["reason"]

    def test_enabled_passes_reference_answer_and_expected_metadata_through(self):
        with patch(
            "ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval",
            return_value=FAKE_SCORES,
        ) as mock_eval:
            evaluate_response_quality(
                {"query": "q", "response_text": "a"},
                {
                    "expected_domain": "Weather",
                    "expected_plan": {"crop": "all", "state": "Delhi"},
                    "expected_answer": "ref answer",
                },
                enabled=True,
            )

        _, kwargs = mock_eval.call_args
        assert kwargs["reference_answer"] == "ref answer"
        assert kwargs["expected_region"] == "Delhi"
        # crop == "all" is treated as "no specific crop expected"
        assert kwargs["expected_crop"] is None
        # case has no "expected_treatment" set, so nothing is passed through
        assert kwargs["reference_treatment"] is None

    def test_enabled_passes_treatment_reference_through_and_surfaces_its_source(self):
        """FIX 6: reference_treatment (real content, not a domain-label proxy)
        flows from case["expected_treatment"] into evaluate_answer_with_deepeval,
        and case["treatment_reference_source"] (real_gdb_fixture /
        representative_authored / data_gap / not_applicable - see questions.py's
        find_treatment_reference) surfaces directly in the flattened result so a
        report can show *why* TreatmentCorrectness fired or didn't."""
        with patch(
            "ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval",
            return_value=FAKE_SCORES,
        ) as mock_eval:
            result = evaluate_response_quality(
                {"query": "q", "response_text": "a"},
                {
                    "expected_domain": "Soil",
                    "expected_plan": {"crop": "Paddy", "state": "Punjab"},
                    "expected_treatment": "Apply 30-40 kg K2O/ha.",
                    "treatment_reference_source": "representative_authored",
                },
                enabled=True,
            )

        _, kwargs = mock_eval.call_args
        assert kwargs["reference_treatment"] == "Apply 30-40 kg K2O/ha."
        assert result["treatment_reference_source"] == "representative_authored"

    def test_disabled_returns_stub_unchanged(self):
        result = evaluate_response_quality(
            {"query": "q", "response_text": "a"},
            {"expected_domain": "Weather"},
            enabled=False,
        )

        assert result == _disabled_stub()
        assert result["answer_quality_enabled"] is False

    def test_disabled_ignores_result_and_case_entirely(self):
        with patch(
            "ajrasakha.evaluation.answer_eval.evaluate_answer_with_deepeval"
        ) as mock_eval:
            evaluate_response_quality({"query": "q"}, {"expected_domain": "x"}, enabled=False)

        mock_eval.assert_not_called()


class TestEvaluateAnswerWithDeepevalMissingAnswer:
    def test_empty_answer_returns_answer_missing_fallback(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval, METRIC_NAMES

        result = evaluate_answer_with_deepeval(query="q", answer="")

        assert set(result.keys()) == set(METRIC_NAMES)
        for metric_name in METRIC_NAMES:
            assert result[metric_name]["score"] is None
            assert result[metric_name]["passed"] is False
            assert result[metric_name]["reason"] == "answer_missing"

    def test_whitespace_only_answer_returns_answer_missing_fallback(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        result = evaluate_answer_with_deepeval(query="q", answer="   ")

        assert result["AnswerRelevancyMetric"]["reason"] == "answer_missing"


class TestEvaluateAnswerWithDeepevalUsingMockJudge:
    """Exercises the REAL DeepEval metric.measure() codepath (schema generation,
    prompt building, GEval scoring) via MockJudge, instead of mocking around
    evaluate_answer_with_deepeval() entirely as TestEvaluateResponseQuality does.
    MockJudge always returns a fixed passing response regardless of input content
    (see mock_judge.py), so these tests prove the metric *plumbing* works
    end-to-end - they cannot assert one input scores differently than another."""

    def test_answer_relevancy_runs_real_measure_path_with_mock_judge(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
        from ajrasakha.evaluation.tests.mock_judge import MockJudge

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_judge_model",
            return_value=MockJudge(),
        ):
            result = evaluate_answer_with_deepeval(
                query="How to grow wheat?",
                answer="Sow wheat seeds in well-drained loamy soil during Rabi season.",
                context=["Wheat is a Rabi crop grown in loamy soil."],
            )

        assert result["AnswerRelevancyMetric"]["score"] == 1.0
        assert result["AnswerRelevancyMetric"]["passed"] is True
        assert result["AnswerRelevancyMetric"]["reason"]

    def test_faithfulness_and_contextual_relevancy_run_real_measure_path_with_mock_judge(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
        from ajrasakha.evaluation.tests.mock_judge import MockJudge

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_judge_model",
            return_value=MockJudge(),
        ):
            result = evaluate_answer_with_deepeval(
                query="How to grow wheat?",
                answer="Sow wheat seeds in well-drained loamy soil during Rabi season.",
                context=["Wheat is a Rabi crop grown in loamy soil."],
            )

        assert result["FaithfulnessMetric"]["score"] == 1.0
        assert result["FaithfulnessMetric"]["passed"] is True
        assert result["ContextualRelevancyMetric"]["score"] == 1.0
        assert result["ContextualRelevancyMetric"]["passed"] is True

    def test_gdb_match_score_runs_real_geval_measure_path_with_mock_judge(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval
        from ajrasakha.evaluation.tests.mock_judge import MockJudge

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_judge_model",
            return_value=MockJudge(),
        ):
            result = evaluate_answer_with_deepeval(
                query="How to grow wheat?",
                answer="Sow wheat seeds in well-drained loamy soil during Rabi season.",
                context=["Wheat is a Rabi crop grown in loamy soil."],
                reference_answer="Reference: sow wheat in loamy soil during Rabi season.",
            )

        assert result["GDBMatchScore"]["score"] == 1.0
        assert result["GDBMatchScore"]["passed"] is True

    # The three facet metrics (CropCorrectness/TreatmentCorrectness/RegionCorrectness)
    # are intentionally NOT migrated here. MockJudge always returns the same fixed
    # passing response regardless of input, so it can't reproduce what
    # TestAgriculturalFacetsIndependence actually needs to prove: that a wrong
    # region scores differently than a correct crop/treatment. That class keeps its
    # existing per-facet score mocking at the _build_geval_metric boundary instead.


def _stub_metric():
    """A metric double exposing only the attributes _metric_passed()/the result-building
    code actually reads - restricting via spec means hasattr(metric, "passed") is False,
    exercising the same is_successful() fallback path real DeepEval metrics use."""
    return MagicMock(spec=["measure", "score", "reason", "is_successful"])


class TestAgriculturalFacetsIndependence:
    """Crop/treatment/region are three independent GEval checks (see
    deepeval_metrics._AGRICULTURAL_FACETS) - a low score on one must not blend into
    or suppress the others. Real GEval calls are stubbed out here (no network judge
    configured in tests); this exercises the facet-loop logic itself, not judge quality."""

    FACET_SCORES = {
        "CropCorrectness": 0.9,
        "TreatmentCorrectness": 0.4,
        "RegionCorrectness": 0.1,
    }

    def _fake_geval_metric(self, name, criteria, evaluation_params, threshold=0.5):
        metric = _stub_metric()
        metric.score = self.FACET_SCORES.get(name, 0.5)
        metric.reason = f"mock reason for {name}"
        metric.is_successful.return_value = metric.score >= threshold
        return metric

    def _fake_build_metric(self, metric_cls, threshold=0.5):
        metric = _stub_metric()
        metric.score = 0.5
        metric.reason = "stubbed built-in metric"
        metric.is_successful.return_value = True
        return metric

    def test_all_three_facets_scored_independently_not_averaged(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_geval_metric",
            side_effect=self._fake_geval_metric,
        ), patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=self._fake_build_metric,
        ):
            result = evaluate_answer_with_deepeval(
                query="How to grow wheat?",
                answer="Grow wheat like this.",
                context=[],
                reference_answer="Reference wheat answer.",
                reference_treatment="Reference wheat treatment.",
                expected_crop="Wheat",
                expected_region="Punjab",
            )

        assert result["CropCorrectness"]["score"] == 0.9
        assert result["TreatmentCorrectness"]["score"] == 0.4
        assert result["RegionCorrectness"]["score"] == 0.1
        # independently reported, not blended into one opaque number
        assert len({result["CropCorrectness"]["score"], result["TreatmentCorrectness"]["score"], result["RegionCorrectness"]["score"]}) == 3
        assert result["CropCorrectness"]["passed"] is True
        assert result["RegionCorrectness"]["passed"] is False

    def test_facets_independently_report_no_expected_metadata_when_missing(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_geval_metric",
            side_effect=self._fake_geval_metric,
        ), patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=self._fake_build_metric,
        ):
            result = evaluate_answer_with_deepeval(
                query="q",
                answer="a",
                context=[],
                reference_answer="ref",
                expected_crop="Wheat",
                expected_region=None,
            )

        assert result["CropCorrectness"]["score"] == 0.9
        # No reference_treatment passed -> N/A, same "no reference" shape GDBMatchScore uses
        assert result["TreatmentCorrectness"] == {"score": None, "passed": False, "reason": "no_reference_treatment"}
        assert result["RegionCorrectness"] == {"score": None, "passed": False, "reason": "no_expected_metadata"}

    def test_one_facet_exception_does_not_affect_the_others(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        def flaky_geval_metric(name, criteria, evaluation_params, threshold=0.5):
            metric = _stub_metric()
            if name == "TreatmentCorrectness":
                metric.measure.side_effect = RuntimeError("judge timeout")
            else:
                metric.score = self.FACET_SCORES.get(name, 0.5)
                metric.reason = f"mock reason for {name}"
                metric.is_successful.return_value = True
            return metric

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_geval_metric",
            side_effect=flaky_geval_metric,
        ), patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=self._fake_build_metric,
        ):
            result = evaluate_answer_with_deepeval(
                query="q",
                answer="a",
                context=[],
                reference_answer="ref",
                reference_treatment="Reference treatment text.",
                expected_crop="Wheat",
                expected_region="Punjab",
            )

        assert result["CropCorrectness"]["score"] == 0.9
        assert result["RegionCorrectness"]["score"] == 0.1
        assert result["TreatmentCorrectness"]["score"] is None
        assert "judge timeout" in result["TreatmentCorrectness"]["reason"]


class TestDomainQualityBreakdown:
    def test_averages_mocked_scores_per_domain(self):
        results = [
            {
                "expected_domain": "Weather",
                "answerrelevancymetric_score": 0.8,
                "faithfulnessmetric_score": 0.6,
            },
            {
                "expected_domain": "Weather",
                "answerrelevancymetric_score": 1.0,
                "faithfulnessmetric_score": 0.4,
            },
            {
                "expected_domain": "Market Prices",
                "answerrelevancymetric_score": 0.5,
            },
        ]

        breakdown = build_domain_quality_breakdown(results)

        assert breakdown["Weather"]["AnswerRelevancyMetric"] == 0.9
        assert breakdown["Weather"]["FaithfulnessMetric"] == 0.5
        assert breakdown["Market Prices"]["AnswerRelevancyMetric"] == 0.5

    def test_skips_non_numeric_scores(self):
        results = [
            {"expected_domain": "Weather", "answerrelevancymetric_score": ""},
            {"expected_domain": "Weather", "answerrelevancymetric_score": None},
        ]

        breakdown = build_domain_quality_breakdown(results)

        assert breakdown["Weather"] == {}

    def test_missing_domain_falls_back_to_unknown_bucket(self):
        results = [{"answerrelevancymetric_score": 0.5}]

        breakdown = build_domain_quality_breakdown(results)

        assert breakdown["Unknown"]["AnswerRelevancyMetric"] == 0.5

    def test_build_summary_includes_domain_quality_breakdown(self):
        results = [
            {
                "expected_domain": "Weather",
                "technical_pass": True,
                "routing_pass": True,
                "tool_pass": True,
                "answerrelevancymetric_score": 0.9,
            }
        ]

        summary = build_summary(results)

        assert "domain_quality_breakdown" in summary
        assert summary["domain_quality_breakdown"]["Weather"]["AnswerRelevancyMetric"] == 0.9


class TestGdbFixtureFallback:
    def test_load_gdb_fixture_returns_empty_list_when_file_missing(self, tmp_path):
        missing_path = tmp_path / "does_not_exist.json"

        fixture = load_gdb_fixture(path=missing_path)

        assert fixture == []

    def test_load_gdb_fixture_returns_empty_list_on_invalid_json(self, tmp_path):
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("{not valid json", encoding="utf-8")

        fixture = load_gdb_fixture(path=bad_file)

        assert fixture == []

    def test_load_gdb_fixture_reads_valid_file(self, tmp_path):
        sample_file = tmp_path / "gdb_samples.json"
        sample_file.write_text(
            json.dumps([{"query": "q", "expected_answer": "a", "expected_domain": "Weather"}]),
            encoding="utf-8",
        )

        fixture = load_gdb_fixture(path=sample_file)

        assert len(fixture) == 1
        assert fixture[0]["expected_domain"] == "Weather"

    def test_find_reference_answer_matches_primary_domain(self):
        fixture = [
            {"expected_domain": "Cultural Practices", "domains": ["Cultural Practices"], "expected_answer": "real answer"}
        ]

        answer = find_reference_answer("Cultural Practices", fixture)

        assert answer == "real answer"

    def test_find_reference_answer_matches_secondary_domain(self):
        fixture = [
            {
                "expected_domain": "Cultural Practices",
                "domains": ["Cultural Practices", "Plant Protection"],
                "expected_answer": "real answer",
            }
        ]

        answer = find_reference_answer("Plant Protection", fixture)

        assert answer == "real answer"

    def test_find_reference_answer_returns_none_when_no_match(self):
        fixture = [{"expected_domain": "Weather", "domains": ["Weather"], "expected_answer": "x"}]

        answer = find_reference_answer("Schemes", fixture)

        assert answer is None

    def test_find_reference_answer_returns_none_when_fixture_empty(self):
        answer = find_reference_answer("Weather", [])

        assert answer is None

    def test_find_reference_answer_handles_none_domain(self):
        fixture = [{"expected_domain": "Weather", "domains": ["Weather"], "expected_answer": "x"}]

        answer = find_reference_answer(None, fixture)

        assert answer is None


class TestGdbMatchScoreGating:
    """
    FIX 1: GDBMatchScore must only ever fire against a real expert-validated
    reference. Before this fix, questions.py backfilled a placeholder string
    into expected_answer for every case, and that placeholder was always
    truthy - so GDBMatchScore ran an LLM-judge call against boilerplate text
    for Weather/Market/every domain, not just real GDB/semantic-search cases.
    """

    def test_no_real_reference_skips_gdb_match_score_as_not_applicable(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=lambda metric_cls, threshold=0.5: MagicMock(
                spec=["measure", "score", "reason", "is_successful"],
                score=0.5,
                reason="stub",
                is_successful=MagicMock(return_value=True),
            ),
        ):
            result = evaluate_answer_with_deepeval(
                query="What is the weather today?",
                answer="Sunny with a high of 30C.",
                context=[],
                reference_answer=None,  # exactly what a non-GDB case now carries
            )

        assert result["GDBMatchScore"] == {
            "score": None,
            "passed": False,
            "reason": "no_reference_answer",
        }

    def test_real_gdb_reference_still_flows_through_end_to_end(self):
        """questions.py's find_reference_answer -> answer_eval.py -> deepeval_metrics.py:
        a real fixture match must still reach GDBMatchScore as a usable reference."""
        from ajrasakha.evaluation.questions import find_reference_answer

        fixture = [
            {
                "expected_domain": "GDB queries",
                "domains": ["GDB queries"],
                "expected_answer": "Real expert-validated answer text.",
            }
        ]

        answer = find_reference_answer("GDB queries", fixture)

        assert answer == "Real expert-validated answer text."


class TestTreatmentCorrectnessGating:
    """
    FIX 6: TreatmentCorrectness previously used expected_domain as the
    "expected treatment" - a category-label proxy an answer could satisfy just
    by mentioning the domain name, regardless of whether the actual dosage/
    recommendation was right. It must now only fire against real reference
    CONTENT (reference_treatment), N/A otherwise - same gating shape as
    GDBMatchScore (TestGdbMatchScoreGating above).
    """

    def test_no_reference_treatment_skips_as_not_applicable(self):
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=lambda metric_cls, threshold=0.5: MagicMock(
                spec=["measure", "score", "reason", "is_successful"],
                score=0.5,
                reason="stub",
                is_successful=MagicMock(return_value=True),
            ),
        ):
            result = evaluate_answer_with_deepeval(
                query="What is the weather today?",
                answer="Sunny with a high of 30C.",
                context=[],
                reference_treatment=None,  # e.g. Weather - no treatment concept applies
            )

        assert result["TreatmentCorrectness"] == {
            "score": None,
            "passed": False,
            "reason": "no_reference_treatment",
        }

    def test_domain_name_alone_no_longer_counts_as_a_reference(self):
        """The old bug: expected_domain="Soil" was truthy, so it was used
        directly as the 'expected treatment' - meaning an answer just had to
        mention "Soil" to score well, never checking real dosage content.
        Passing only expected_domain (no reference_treatment) must not
        resurrect that behavior."""
        from ajrasakha.evaluation.deepeval_metrics import evaluate_answer_with_deepeval

        with patch(
            "ajrasakha.evaluation.deepeval_metrics._build_metric",
            side_effect=lambda metric_cls, threshold=0.5: MagicMock(
                spec=["measure", "score", "reason", "is_successful"],
                score=0.5,
                reason="stub",
                is_successful=MagicMock(return_value=True),
            ),
        ), patch("ajrasakha.evaluation.deepeval_metrics._build_geval_metric") as mock_geval:
            result = evaluate_answer_with_deepeval(
                query="What fertilizer dosage for Rice?",
                answer="Apply nitrogen as needed.",
                context=[],
                expected_crop="Paddy",
                expected_region="Punjab",
            )

        assert result["TreatmentCorrectness"]["reason"] == "no_reference_treatment"
        treatment_calls = [c for c in mock_geval.call_args_list if c.kwargs.get("name") == "TreatmentCorrectness"]
        assert treatment_calls == []

    def test_real_reference_treatment_flows_through_end_to_end(self):
        """questions.py's find_treatment_reference -> answer_eval.py ->
        deepeval_metrics.py: a real fixture match must reach TreatmentCorrectness
        as a usable reference, same path GDBMatchScore already proves."""
        from ajrasakha.evaluation.questions import find_treatment_reference

        gdb_fixture = [
            {
                "expected_domain": "GDB queries",
                "domains": ["GDB queries"],
                "expected_answer": "Treat seeds with Trichoderma viride before sowing.",
            }
        ]

        text, source = find_treatment_reference("GDB queries", gdb_fixture, representative_fixture=[])

        assert text == "Treat seeds with Trichoderma viride before sowing."
        assert source == "real_gdb_fixture"


class TestFindTreatmentReference:
    """FIX 6: find_treatment_reference() sources real content (never a domain
    label) and distinguishes *why* no reference exists - a Weather/Greetings
    case has no treatment concept at all ("not_applicable"), while a Soil case
    with no fixture match is a genuine data gap ("data_gap") - see
    questions.py's TREATMENT_APPLICABLE_DOMAINS comment."""

    def test_domain_without_treatment_concept_is_not_applicable(self):
        from ajrasakha.evaluation.questions import find_treatment_reference

        text, source = find_treatment_reference("Weather", gdb_fixture=[], representative_fixture=[])

        assert text is None
        assert source == "not_applicable"

    def test_treatment_applicable_domain_with_no_data_is_a_data_gap(self):
        from ajrasakha.evaluation.questions import find_treatment_reference

        text, source = find_treatment_reference("Soil", gdb_fixture=[], representative_fixture=[])

        assert text is None
        assert source == "data_gap"

    def test_real_gdb_fixture_takes_priority_over_representative(self):
        from ajrasakha.evaluation.questions import find_treatment_reference

        gdb_fixture = [
            {"expected_domain": "GDB queries", "domains": ["GDB queries"], "expected_answer": "Real answer."}
        ]
        representative_fixture = [
            {"expected_domain": "GDB queries", "domains": ["GDB queries"], "expected_treatment": "Representative answer."}
        ]

        text, source = find_treatment_reference("GDB queries", gdb_fixture, representative_fixture)

        assert text == "Real answer."
        assert source == "real_gdb_fixture"

    def test_representative_fixture_used_when_no_real_match(self):
        from ajrasakha.evaluation.questions import find_treatment_reference

        representative_fixture = [
            {"expected_domain": "Soil", "domains": ["Soil"], "expected_treatment": "Apply 30-40 kg K2O/ha."}
        ]

        text, source = find_treatment_reference("Soil", gdb_fixture=[], representative_fixture=representative_fixture)

        assert text == "Apply 30-40 kg K2O/ha."
        assert source == "representative_authored"

    def test_real_representative_fixture_file_loads_and_resolves_for_soil(self):
        """Exercises the actual on-disk representative_treatment_samples.json,
        not a hand-built fixture - catches drift between the file and this
        lookup logic."""
        from ajrasakha.evaluation.questions import (
            find_treatment_reference,
            load_gdb_fixture,
            load_representative_treatment_fixture,
        )

        text, source = find_treatment_reference(
            "Soil", load_gdb_fixture(), load_representative_treatment_fixture()
        )

        assert text is not None
        assert source == "representative_authored"
