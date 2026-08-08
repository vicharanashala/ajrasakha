"""
FIX 4: Layer 3's evaluation_report_live.csv carries quality-score columns
(scoring already runs there in live mode - see answer_eval.py), but the
combined stable_suite_report.csv/html used to drop them when merging with
Layer 1/2's reports, which don't have those columns. These tests prove the
columns survive read_report_rows()/write_combined_csv() end-to-end instead
of silently being stripped.

Not part of the ajrasakha/ pytest suite (pyproject.toml's testpaths scopes
default `pytest` discovery there) - this stable-suite tool is a separate
script under ai/tests/, run explicitly: `uv run python -m pytest tests -q`.
"""

import csv

from tests.run_stable_suite import QUALITY_SCORE_COLUMNS, read_report_rows, write_combined_csv


def _write_csv(path, fieldnames, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def test_read_report_rows_preserves_quality_score_columns_from_layer3(tmp_path):
    report_path = tmp_path / "evaluation_report_live.csv"
    _write_csv(
        report_path,
        fieldnames=["name", "expected_domain", "technical_pass", *QUALITY_SCORE_COLUMNS],
        rows=[
            {
                "name": "weather_question_1",
                "expected_domain": "Weather",
                "technical_pass": "True",
                "answerrelevancymetric_score": "0.92",
                "faithfulnessmetric_score": "0.88",
                "contextualrelevancymetric_score": "0.81",
                "gdbmatchscore_score": "",
                "cropcorrectness_score": "",
                "treatmentcorrectness_score": "",
                "regioncorrectness_score": "0.75",
            }
        ],
    )

    rows = read_report_rows("Layer 3 - Stable LangGraph Scenarios", report_path)

    assert len(rows) == 1
    row = rows[0]
    assert row["answerrelevancymetric_score"] == "0.92"
    assert row["faithfulnessmetric_score"] == "0.88"
    assert row["contextualrelevancymetric_score"] == "0.81"
    assert row["regioncorrectness_score"] == "0.75"


def test_write_combined_csv_includes_quality_score_columns_in_header_and_rows(tmp_path):
    report_path = tmp_path / "evaluation_report_live.csv"
    _write_csv(
        report_path,
        fieldnames=["name", "expected_domain", "technical_pass", *QUALITY_SCORE_COLUMNS],
        rows=[
            {
                "name": "soil_question_1",
                "expected_domain": "Soil",
                "technical_pass": "True",
                "answerrelevancymetric_score": "0.7",
                "faithfulnessmetric_score": "",
                "contextualrelevancymetric_score": "",
                "gdbmatchscore_score": "",
                "cropcorrectness_score": "0.9",
                "treatmentcorrectness_score": "0.6",
                "regioncorrectness_score": "",
            }
        ],
    )

    rows = read_report_rows("Layer 3 - Stable LangGraph Scenarios", report_path)

    out_csv = tmp_path / "combined.csv"
    import tests.run_stable_suite as run_stable_suite_module

    original_combined_csv = run_stable_suite_module.COMBINED_CSV
    run_stable_suite_module.COMBINED_CSV = out_csv
    try:
        write_combined_csv(rows)
    finally:
        run_stable_suite_module.COMBINED_CSV = original_combined_csv

    with out_csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames
        written_rows = list(reader)

    for col in QUALITY_SCORE_COLUMNS:
        assert col in header

    assert written_rows[0]["cropcorrectness_score"] == "0.9"
    assert written_rows[0]["treatmentcorrectness_score"] == "0.6"


def test_quality_score_columns_blank_not_missing_for_layer1_layer2_rows(tmp_path):
    """Layer 1/2 CSVs (API contracts, MCP connectivity) never have quality-score
    columns at all - the merged row must still carry those keys, blank, so
    every row in the combined report has the exact same schema."""
    report_path = tmp_path / "api_contract_report.csv"
    _write_csv(
        report_path,
        fieldnames=["service", "name", "status_code"],
        rows=[{"service": "backend", "name": "health_check", "status_code": "200"}],
    )

    rows = read_report_rows("Layer 1 - API Contracts", report_path)

    assert len(rows) == 1
    for col in QUALITY_SCORE_COLUMNS:
        assert rows[0][col] == ""
