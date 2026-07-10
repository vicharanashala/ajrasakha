"""Enhanced multilingual metrics derived from existing evaluation results."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any


METRIC_DEFINITIONS = {
    "language_consistency": {
        "label": "Language Consistency",
        "field": "answer_language_pass",
        "failure_reason": "Response language did not match expected query language.",
    },
    "disclaimer_accuracy": {
        "label": "Disclaimer Accuracy",
        "field": "disclaimer_language_pass",
        "failure_reason": "Disclaimer was missing or not localized as expected.",
    },
    "gdb_retrieval_accuracy": {
        "label": "GDB Retrieval Accuracy",
        "field": "gdb_entry_pass",
        "failure_reason": "Expected GDB entry was not retrieved.",
    },
    "agricultural_term_coverage": {
        "label": "Agricultural Term Coverage",
        "field": "term_translation_pass",
        "failure_reason": "Expected agricultural term marker was missing.",
    },
    "mixed_language_detection": {
        "label": "Mixed Language Detection",
        "field": "language_switching_pass",
        "failure_reason": "Unexpected mid-answer language/script switching detected.",
    },
}


def _is_pass(value: object) -> bool:
    return value is True or str(value).strip().lower() in {"true", "pass", "passed", "1", "yes"}


def _metric_result(row: dict[str, Any], metric_key: str) -> dict[str, Any]:
    definition = METRIC_DEFINITIONS[metric_key]
    passed = _is_pass(row.get(definition["field"]))
    return {
        "passed": passed,
        "score": 100 if passed else 0,
        "reason": "passed" if passed else definition["failure_reason"],
    }


def build_per_case_metrics(results: list[dict]) -> list[dict]:
    """Build enhanced metric results for each multilingual test case."""
    cases = []
    for row in results:
        cases.append(
            {
                "name": row.get("name", ""),
                "scenario_id": row.get("scenario_id", ""),
                "language": row.get("language", ""),
                "domain": row.get("domain", ""),
                "metrics": {
                    key: _metric_result(row, key)
                    for key in METRIC_DEFINITIONS
                },
            }
        )
    return cases


def _aggregate_group(rows: list[dict]) -> dict[str, dict[str, Any]]:
    aggregate: dict[str, dict[str, Any]] = {}
    for metric_key in METRIC_DEFINITIONS:
        metric_values = [
            case["metrics"][metric_key]
            for case in rows
        ]
        total = len(metric_values)
        passed = sum(1 for metric in metric_values if metric["passed"])
        score = round(
            sum(metric["score"] for metric in metric_values) / total,
            1,
        ) if total else 0.0
        aggregate[metric_key] = {
            "passed": passed == total,
            "score": score,
            "reason": "passed" if passed == total else f"{total - passed} of {total} cases failed",
            "total": total,
            "passed_count": passed,
            "failed_count": total - passed,
        }
    return aggregate


def _group_cases(cases: list[dict], key: str) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for case in cases:
        grouped[str(case.get(key) or "unknown")].append(case)
    return grouped


def build_language_quality_metrics_report(results: list[dict]) -> dict[str, Any]:
    """Aggregate enhanced metrics per case, language, domain, and overall."""
    per_case = build_per_case_metrics(results)
    per_language = {
        language: _aggregate_group(rows)
        for language, rows in sorted(_group_cases(per_case, "language").items())
    }
    per_domain = {
        domain: _aggregate_group(rows)
        for domain, rows in sorted(_group_cases(per_case, "domain").items())
    }

    return {
        "metrics": {
            key: definition["label"]
            for key, definition in METRIC_DEFINITIONS.items()
        },
        "per_test_case": per_case,
        "per_language": per_language,
        "per_domain": per_domain,
        "overall": _aggregate_group(per_case),
    }


def _markdown_metric_table(aggregate: dict[str, dict[str, Any]]) -> str:
    lines = [
        "| Metric | Passed | Score | Reason |",
        "| --- | --- | --- | --- |",
    ]
    for key, metric in aggregate.items():
        label = METRIC_DEFINITIONS[key]["label"]
        lines.append(
            f"| {label} | {metric['passed']} | {metric['score']} | {metric['reason']} |"
        )
    return "\n".join(lines)


def build_language_quality_metrics_markdown(report: dict[str, Any]) -> str:
    """Render enhanced metrics aggregates as a Markdown report."""
    sections = [
        "# Enhanced Language Quality Metrics",
        "",
        "## Overall",
        "",
        _markdown_metric_table(report["overall"]),
        "",
        "## Per Language",
        "",
    ]

    for language, aggregate in report["per_language"].items():
        sections.extend([f"### {language}", "", _markdown_metric_table(aggregate), ""])

    sections.extend(["## Per Domain", ""])
    for domain, aggregate in report["per_domain"].items():
        sections.extend([f"### {domain}", "", _markdown_metric_table(aggregate), ""])

    return "\n".join(sections)


def write_language_quality_metrics_reports(
    results: list[dict],
    json_file: str = "language_quality_metrics.json",
    markdown_file: str = "language_quality_metrics.md",
) -> dict[str, Any]:
    """Write enhanced metrics JSON and Markdown reports."""
    report = build_language_quality_metrics_report(results)
    json_path = Path(json_file)
    markdown_path = Path(markdown_file)

    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    markdown_path.write_text(
        build_language_quality_metrics_markdown(report),
        encoding="utf-8",
    )

    print(f"Language quality metrics JSON written to: {json_path.resolve()}")
    print(f"Language quality metrics report written to: {markdown_path.resolve()}")
    return report
