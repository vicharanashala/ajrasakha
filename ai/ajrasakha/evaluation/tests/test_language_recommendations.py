from ajrasakha.evaluation.language_recommendations import (
    build_language_quality_recommendations,
    build_language_quality_recommendations_markdown,
    write_language_quality_recommendations,
)


def _row(language: str, domain: str, passed: bool, **overrides):
    row = {
        "language": language,
        "domain": domain,
        "language_quality_pass": passed,
        "disclaimer_language_pass": True,
        "answer_language_pass": True,
        "language_switching_pass": True,
        "gdb_entry_pass": True,
        "term_translation_pass": True,
    }
    row.update(overrides)
    return row


def test_recommendations_report_no_issues_when_mock_results_pass():
    report = build_language_quality_recommendations(
        [
            _row("English", "weather", True),
            _row("Hindi", "market", True),
        ]
    )

    assert report["failed_cases"] == 0
    assert report["language_performance"]["all_identical"] is True
    assert report["domain_performance"]["all_identical"] is True
    assert report["recommendations"] == [
        "No language quality issues detected during this evaluation run.",
        "Continue monitoring with live evaluations when staging credentials become available.",
    ]


def test_recommendations_are_deterministic_and_failure_based():
    report = build_language_quality_recommendations(
        [
            _row("English", "weather", True),
            _row(
                "Kannada",
                "market",
                False,
                language_switching_pass=False,
                gdb_entry_pass=False,
            ),
            _row(
                "Tamil",
                "scheme",
                False,
                disclaimer_language_pass=False,
                term_translation_pass=False,
            ),
        ]
    )

    assert report["highest_performing_language"]["name"] == "English"
    assert report["lowest_performing_language"]["name"] == "Kannada"
    assert report["highest_performing_domain"]["name"] == "weather"
    assert report["lowest_performing_domain"]["name"] == "market"
    assert report["recommendations"] == [
        "Improve mixed-language generation in Kannada.",
        "Improve disclaimer localization in Tamil.",
        "Review market retrieval accuracy.",
        "Review transliteration consistency in Tamil.",
        "Investigate GDB retrieval mismatches in Market.",
    ]


def test_recommendations_markdown_and_writer(tmp_path):
    path = tmp_path / "language_quality_recommendations.md"
    report = build_language_quality_recommendations([
        _row("English", "weather", True),
    ])

    markdown = build_language_quality_recommendations_markdown(report)
    assert "# Language Quality Recommendations" in markdown
    assert "All languages achieved identical performance" in markdown
    assert "All evaluated domains achieved identical performance" in markdown
    assert "Highest performing language" not in markdown
    assert "Lowest performing language" not in markdown
    assert "No language quality issues detected" in markdown
    assert "Continue monitoring with live evaluations" in markdown

    written = write_language_quality_recommendations(
        [_row("English", "weather", True)],
        output_file=str(path),
    )
    assert path.exists()
    assert path.read_text(encoding="utf-8") == build_language_quality_recommendations_markdown(written)
