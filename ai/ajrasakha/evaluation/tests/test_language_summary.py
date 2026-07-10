import json

from ajrasakha.evaluation.language_summary import (
    build_language_quality_summary,
    build_language_quality_summary_markdown,
    write_language_quality_summary_reports,
)


def _row(language: str, domain: str, passed: bool, **overrides):
    row = {
        "language": language,
        "domain": domain,
        "language_quality_pass": passed,
        "disclaimer_language_pass": passed,
        "answer_language_pass": passed,
        "language_switching_pass": passed,
        "gdb_entry_pass": passed,
        "term_translation_pass": passed,
    }
    row.update(overrides)
    return row


def test_language_quality_summary_uses_existing_result_metrics():
    summary = build_language_quality_summary(
        [
            _row("Hindi", "weather", True),
            _row(
                "Hindi",
                "weather",
                False,
                disclaimer_language_pass=False,
                answer_language_pass=True,
                language_switching_pass=False,
                gdb_entry_pass=True,
                term_translation_pass=True,
            ),
            _row("Kannada", "market", True),
        ]
    )

    assert summary["overall"] == {
        "total_multilingual_test_cases": 3,
        "passed": 2,
        "failed": 1,
        "pass_percentage": 66.7,
    }

    failures = summary["failure_breakdown"]
    assert failures["disclaimer_failures"] == 1
    assert failures["language_mismatch_failures"] == 0
    assert failures["mixed_language_failures"] == 1
    assert failures["retrieval_failures"] == 0
    assert failures["missing_agricultural_terms"] == 0


def test_language_quality_summary_markdown_contains_required_sections():
    summary = build_language_quality_summary(
        [_row("Hindi", "weather", True)],
        mode="mock",
        generated_at="2026-07-10 11:35 UTC",
    )
    markdown = build_language_quality_summary_markdown(summary)

    assert "Generated: 2026-07-10 11:35 UTC" in markdown
    assert "Mode: mock" in markdown
    assert "Cases: 1" in markdown
    assert "# Overall Summary" in markdown
    assert "# Language Performance" in markdown
    assert "# Domain Performance" in markdown
    assert "# Failure Breakdown" in markdown
    assert "| Language | Total | Passed | Failed | Pass % |" in markdown
    assert "| Domain | Total | Passed | Failed | Pass % |" in markdown


def test_write_language_quality_summary_reports(tmp_path):
    md_path = tmp_path / "language_quality_summary.md"
    json_path = tmp_path / "language_quality_summary.json"

    summary = write_language_quality_summary_reports(
        [_row("Hindi", "weather", True)],
        markdown_file=str(md_path),
        json_file=str(json_path),
        mode="mock",
    )

    assert md_path.exists()
    assert json_path.exists()
    markdown = md_path.read_text(encoding="utf-8")
    assert "Mode: mock" in markdown
    assert "Cases: 1" in markdown
    assert "# Overall Summary" in markdown
    assert json.loads(json_path.read_text(encoding="utf-8")) == summary
    assert summary["metadata"]["mode"] == "mock"
    assert summary["metadata"]["cases"] == 1
