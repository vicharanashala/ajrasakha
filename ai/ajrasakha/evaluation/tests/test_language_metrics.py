from ajrasakha.evaluation.language_metrics import (
    METRIC_DEFINITIONS,
    build_language_quality_metrics_report,
    build_language_quality_metrics_markdown,
    write_language_quality_metrics_reports,
)


def _row(name: str, language: str, domain: str, **overrides):
    row = {
        "name": name,
        "scenario_id": name,
        "language": language,
        "domain": domain,
        "answer_language_pass": True,
        "disclaimer_language_pass": True,
        "gdb_entry_pass": True,
        "term_translation_pass": True,
        "language_switching_pass": True,
    }
    row.update(overrides)
    return row


def test_metrics_report_contains_required_metric_shape():
    report = build_language_quality_metrics_report([
        _row("case_1", "Hindi", "weather")
    ])

    metrics = report["per_test_case"][0]["metrics"]
    assert set(metrics) == set(METRIC_DEFINITIONS)
    for metric in metrics.values():
        assert set(metric) == {"passed", "score", "reason"}
        assert metric == {
            "passed": True,
            "score": 100,
            "reason": "passed",
        }


def test_metrics_aggregate_per_language_domain_and_overall():
    report = build_language_quality_metrics_report(
        [
            _row("case_1", "Hindi", "weather"),
            _row(
                "case_2",
                "Hindi",
                "weather",
                answer_language_pass=False,
                language_switching_pass=False,
            ),
            _row("case_3", "Kannada", "market"),
        ]
    )

    assert report["per_language"]["Hindi"]["language_consistency"] == {
        "passed": False,
        "score": 50.0,
        "reason": "1 of 2 cases failed",
        "total": 2,
        "passed_count": 1,
        "failed_count": 1,
    }
    assert report["per_language"]["Kannada"]["language_consistency"]["score"] == 100.0
    assert report["per_domain"]["weather"]["mixed_language_detection"]["score"] == 50.0
    assert report["overall"]["language_consistency"]["score"] == 66.7


def test_metrics_markdown_and_writer(tmp_path):
    json_path = tmp_path / "language_quality_metrics.json"
    md_path = tmp_path / "language_quality_metrics.md"
    report = build_language_quality_metrics_report([
        _row("case_1", "Hindi", "weather")
    ])

    markdown = build_language_quality_metrics_markdown(report)
    assert "# Enhanced Language Quality Metrics" in markdown
    assert "Language Consistency" in markdown
    assert "## Per Language" in markdown
    assert "## Per Domain" in markdown

    written = write_language_quality_metrics_reports(
        [_row("case_1", "Hindi", "weather")],
        json_file=str(json_path),
        markdown_file=str(md_path),
    )
    assert json_path.exists()
    assert md_path.exists()
    assert written["overall"]["language_consistency"]["score"] == 100.0
