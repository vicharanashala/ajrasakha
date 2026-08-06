"""Mock-mode DeepEval report generation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ajrasakha.evaluation.mock_deepeval import (
    DEEPEVAL_METRIC_LABELS,
    evaluate_answer_with_mock_deepeval,
)


def build_mock_deepeval_report(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a deterministic DeepEval-compatible report for mock runs."""
    cases = []
    for row in results:
        context = [
            value
            for value in [
                row.get("matched_db_question", ""),
                row.get("matched_db_answer", ""),
                row.get("expected_answer_text", ""),
                row.get("mock_answer_text", ""),
            ]
            if value
        ]
        cases.append(
            {
                "name": row.get("name", ""),
                "scenario_id": row.get("scenario_id", ""),
                "language": row.get("language", ""),
                "domain": row.get("domain", ""),
                "metrics": evaluate_answer_with_mock_deepeval(
                    query=str(row.get("query", "")),
                    answer=str(row.get("response_text", "")),
                    context=context,
                ),
            }
        )

    overall = {}
    for metric_key, label in DEEPEVAL_METRIC_LABELS.items():
        metric_values = [case["metrics"][metric_key] for case in cases]
        total = len(metric_values)
        passed = sum(1 for metric in metric_values if metric["passed"])
        score = round(sum(metric["score"] for metric in metric_values) / total, 1) if total else 0.0
        overall[metric_key] = {
            "label": label,
            "passed": passed == total,
            "score": score,
            "total": total,
            "passed_count": passed,
            "failed_count": total - passed,
        }

    return {
        "mode": "mock",
        "note": "DeepEval-compatible deterministic mock metrics; no external LLM judge API was called.",
        "metrics": DEEPEVAL_METRIC_LABELS,
        "overall": overall,
        "per_test_case": cases,
    }


def build_mock_deepeval_markdown(report: dict[str, Any]) -> str:
    """Render the mock DeepEval report as Markdown."""
    lines = [
        "# Mock DeepEval Semantic Report",
        "",
        report["note"],
        "",
        "## Overall",
        "",
        "| Metric | Passed | Score | Passed Cases | Failed Cases |",
        "| --- | --- | ---: | ---: | ---: |",
    ]
    for metric in report["overall"].values():
        lines.append(
            f"| {metric['label']} | {metric['passed']} | {metric['score']} | "
            f"{metric['passed_count']} | {metric['failed_count']} |"
        )

    lines.extend(["", "## Per Test Case", ""])
    for case in report["per_test_case"]:
        lines.extend(
            [
                f"### {case['name']}",
                "",
                f"- Scenario: {case['scenario_id']}",
                f"- Language: {case['language']}",
                f"- Domain: {case['domain']}",
                "",
                "| Metric | Passed | Score | Reason |",
                "| --- | --- | ---: | --- |",
            ]
        )
        for metric_key, metric in case["metrics"].items():
            lines.append(
                f"| {DEEPEVAL_METRIC_LABELS[metric_key]} | {metric['passed']} | "
                f"{metric['score']} | {metric['reason']} |"
            )
        lines.append("")

    return "\n".join(lines)


def write_mock_deepeval_reports(
    results: list[dict[str, Any]],
    json_file: str = "mock_deepeval_report.json",
    markdown_file: str = "mock_deepeval_report.md",
) -> dict[str, Any]:
    """Write mock DeepEval JSON and Markdown reports."""
    report = build_mock_deepeval_report(results)
    Path(json_file).write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    Path(markdown_file).write_text(
        build_mock_deepeval_markdown(report),
        encoding="utf-8",
    )
    print(f"Mock DeepEval JSON written to: {Path(json_file).resolve()}")
    print(f"Mock DeepEval report written to: {Path(markdown_file).resolve()}")
    return report
