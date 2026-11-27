import csv

import pytest

from ajrasakha.evaluation.report import write_csv_report
from ajrasakha.evaluation.summary import build_summary


def _result(domain, technical_pass, **values):
    return {
        "expected_domain": domain,
        "technical_pass": technical_pass,
        "answer_quality_enabled": True,
        **values,
    }


def test_csv_report_uses_consistent_headers_and_includes_run_metadata(tmp_path):
    output_file = tmp_path / "report.csv"
    results = [
        _result(
            "Weather",
            True,
            name="scored",
            relevance_score=0.8,
            relevance_reason="",
        ),
        _result(
            "Market",
            False,
            name="not-applicable",
            relevance_reason="not_applicable: no reference",
            extra_field="present",
        ),
    ]

    write_csv_report(
        results,
        str(output_file),
        evaluation_mode="mock",
        run_metadata={"run_id": "run-123", "stable_only": False},
    )

    with output_file.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        rows = list(reader)
        fieldnames = reader.fieldnames

    assert fieldnames is not None
    assert all(set(row) == set(fieldnames) for row in rows)
    assert rows[0]["extra_field"] == ""
    assert rows[1]["extra_field"] == "present"
    assert [row["relevance_status"] for row in rows] == [
        "scored",
        "not_applicable",
    ]
    assert all(row["evaluation_mode"] == "mock" for row in rows)
    assert all(row["run_id"] == "run-123" for row in rows)


def test_report_metric_prefixes_match_answer_eval_and_deepeval_name(tmp_path):
    from ajrasakha.evaluation.answer_eval import ALL_METRIC_PREFIXES

    output_file = tmp_path / "header.csv"
    write_csv_report([], str(output_file), evaluation_mode="mock")

    with output_file.open(newline="", encoding="utf-8") as csv_file:
        header = next(csv.reader(csv_file))

    assert "contextualrelevancymetric_score" in header
    assert "contextualrelevancemetric_score" not in header
    for prefix in ALL_METRIC_PREFIXES:
        assert f"{prefix}_score" in header


def test_empty_results_write_stable_header_and_run_metadata(tmp_path):
    output_file = tmp_path / "empty.csv"

    write_csv_report(
        [],
        str(output_file),
        evaluation_mode="mock",
        run_metadata={
            "run_id": "empty-run",
            "run_started_at": "2026-11-18T00:00:00+00:00",
            "selected_case_count": 0,
        },
    )
    summary = build_summary([])

    with output_file.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        header = reader.fieldnames
        rows = list(reader)

    assert header is not None
    assert len(header) == len(set(header))
    assert "technical_pass" in header
    assert "answerrelevancymetric_score" in header
    assert "evaluation_mode" in header
    assert "run_id" in header
    assert "run_started_at" in header
    assert "selected_case_count" in header
    assert len(rows) == 1
    assert rows[0]["record_type"] == "run_metadata"
    assert rows[0]["evaluation_mode"] == "mock"
    assert rows[0]["run_id"] == "empty-run"
    assert rows[0]["selected_case_count"] == "0"
    assert summary["total_cases"] == 0
    assert summary["technical_pass_rate"] is None
    assert summary["quality_metrics"] == {}
    assert summary["domains"] == {}


def test_mock_disabled_metrics_are_counted_as_disabled(tmp_path):
    output_file = tmp_path / "mock.csv"
    result = {
        "expected_domain": "General",
        "technical_pass": True,
        "answer_quality_enabled": False,
        "relevance_score": "",
        "relevance_reason": "disabled",
    }

    write_csv_report([result], str(output_file), evaluation_mode="mock")
    summary = build_summary([result], evaluation_mode="mock")

    metric = summary["quality_metrics"]["relevance"]
    assert metric["average_score"] is None
    assert metric["scored_count"] == 0
    assert metric["disabled_count"] == 1
    with output_file.open(newline="", encoding="utf-8") as csv_file:
        assert list(csv.DictReader(csv_file))[0]["relevance_status"] == "disabled"


def test_zero_scores_are_averaged_and_na_is_excluded():
    results = [
        _result(
            "General",
            True,
            relevance_score=0.0,
            relevance_reason="valid zero",
        ),
        _result(
            "General",
            False,
            relevance_score=0.8,
            relevance_reason="scored",
        ),
        _result(
            "General",
            True,
            relevance_score="",
            relevance_reason="not_applicable: no answer",
        ),
    ]

    metric = build_summary(results)["quality_metrics"]["relevance"]

    assert metric["average_score"] == 0.4
    assert metric["scored_count"] == 2
    assert metric["scored_zero_count"] == 1
    assert metric["scored_normally_count"] == 1
    assert metric["not_applicable_count"] == 1


def test_evaluation_errors_and_future_dimension_scores_are_generic():
    results = [
        _result(
            "Agriculture",
            True,
            future_metric_dimension_score="",
            future_metric_dimension_reason="evaluation error: timeout",
        ),
        _result(
            "Agriculture",
            True,
            future_metric_dimension_score=0.6,
            future_metric_dimension_reason="measured",
        ),
    ]

    metric = build_summary(results)["quality_metrics"]["future_metric_dimension"]

    assert metric["average_score"] == 0.6
    assert metric["scored_count"] == 1
    assert metric["evaluation_error_count"] == 1


def _agricultural_result(domain="Agriculture", technical_pass=True):
    return _result(
        domain,
        technical_pass,
        agriculturalaccuracymetric_score=0.8,
        agriculturalaccuracymetric_passed="",
        agriculturalaccuracymetric_reason="aggregate score",
        agriculturalaccuracymetric_crop_score=1.0,
        agriculturalaccuracymetric_crop_reason="crop matched",
        agriculturalaccuracymetric_crop_applicable="true",
        agriculturalaccuracymetric_crop_error="",
        agriculturalaccuracymetric_region_score=0.0,
        agriculturalaccuracymetric_region_reason="region mismatch",
        agriculturalaccuracymetric_region_applicable="true",
        agriculturalaccuracymetric_region_error="",
        agriculturalaccuracymetric_cultivation_guidance_score="",
        agriculturalaccuracymetric_cultivation_guidance_reason="not_applicable: no cultivation guidance",
        agriculturalaccuracymetric_cultivation_guidance_applicable="false",
        agriculturalaccuracymetric_cultivation_guidance_error="",
    )


def test_agricultural_aggregate_counted_once_and_dimensions_excluded_overall():
    summary = build_summary([_agricultural_result()])

    assert list(summary["quality_metrics"]) == ["agriculturalaccuracymetric"]
    aggregate = summary["quality_metrics"]["agriculturalaccuracymetric"]
    assert aggregate["average_score"] == 0.8
    assert aggregate["scored_count"] == 1


def test_agricultural_dimension_scores_excluded_from_domain_averages():
    summary = build_summary(
        [
            _agricultural_result("North", True),
            _agricultural_result("North", False),
        ]
    )

    domain_metrics = summary["domains"]["North"]["quality_metrics"]
    assert list(domain_metrics) == ["agriculturalaccuracymetric"]
    assert domain_metrics["agriculturalaccuracymetric"]["average_score"] == 0.8
    assert domain_metrics["agriculturalaccuracymetric"]["scored_count"] == 2


def test_agricultural_dimension_fields_are_preserved_in_csv(tmp_path):
    output_file = tmp_path / "agricultural.csv"
    result = _agricultural_result()

    write_csv_report([result], str(output_file), evaluation_mode="live")

    with output_file.open(newline="", encoding="utf-8") as csv_file:
        row = next(csv.DictReader(csv_file))

    for dimension in ("crop", "region", "cultivation_guidance"):
        prefix = f"agriculturalaccuracymetric_{dimension}"
        for suffix in ("score", "reason", "applicable", "error"):
            assert row[f"{prefix}_{suffix}"] == str(result[f"{prefix}_{suffix}"])


def test_mock_and_live_reports_have_compatible_headers(tmp_path):
    mock_file = tmp_path / "mock.csv"
    live_file = tmp_path / "live.csv"
    mock_result = {
        "expected_domain": "Weather",
        "technical_pass": True,
        "answer_quality_enabled": False,
    }
    live_result = {
        "expected_domain": "Weather",
        "technical_pass": True,
        "answer_quality_enabled": True,
        "answerrelevancymetric_score": 0.8,
        "answerrelevancymetric_passed": True,
        "answerrelevancymetric_reason": "relevant",
    }

    write_csv_report([mock_result], str(mock_file), evaluation_mode="mock")
    write_csv_report([live_result], str(live_file), evaluation_mode="live")

    with mock_file.open(newline="", encoding="utf-8") as csv_file:
        mock_header = next(csv.reader(csv_file))
    with live_file.open(newline="", encoding="utf-8") as csv_file:
        live_header = next(csv.reader(csv_file))

    assert mock_header == live_header


def test_missing_score_without_explanation_is_an_evaluation_error():
    result = _result(
        "Weather",
        True,
        relevance_score="",
        relevance_reason="",
    )

    metric = build_summary([result])["quality_metrics"]["relevance"]

    assert metric["average_score"] is None
    assert metric["scored_count"] == 0
    assert metric["evaluation_error_count"] == 1


def test_domain_averages_and_technical_pass_rate_are_independent():
    results = [
        _result("Weather", True, quality_score=0.1, quality_reason="scored"),
        _result("Weather", False, quality_score=0.9, quality_reason="scored"),
        _result("Market", False, quality_score=0.4, quality_reason="scored"),
    ]

    summary = build_summary(results)

    assert summary["technical_passed"] == 1
    assert summary["technical_failed"] == 2
    assert summary["technical_pass_rate"] == 1 / 3
    assert summary["quality_metrics"]["quality"]["average_score"] == pytest.approx(
        1.4 / 3
    )
    assert summary["domains"]["Weather"]["technical_pass_rate"] == 0.5
    assert summary["domains"]["Weather"]["quality_metrics"]["quality"][
        "average_score"
    ] == 0.5
    assert summary["domains"]["Market"]["technical_pass_rate"] == 0
    assert summary["domains"]["Market"]["quality_metrics"]["quality"][
        "average_score"
    ] == 0.4
