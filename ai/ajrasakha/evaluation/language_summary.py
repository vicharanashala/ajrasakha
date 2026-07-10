"""Markdown and JSON summary reports for multilingual language quality."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


DOMAIN_LABELS = {
    "weather": "Weather",
    "pest": "Pest",
    "soil": "Soil",
    "market": "Market",
    "scheme": "Schemes",
}


def _is_pass(value: object) -> bool:
    return value is True or str(value).strip().lower() in {"true", "pass", "passed", "1", "yes"}


def _pct(passed: int, total: int) -> float:
    return round((passed / total * 100), 1) if total else 0.0


def _group_performance(results: list[dict], key: str) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        value = result.get(key) or "unknown"
        buckets[str(value)].append(result)

    rows = []
    for name, bucket in sorted(buckets.items()):
        total = len(bucket)
        passed = sum(1 for row in bucket if _is_pass(row.get("language_quality_pass")))
        failed = total - passed
        rows.append(
            {
                key: name,
                "total": total,
                "passed": passed,
                "failed": failed,
                "pass_percentage": _pct(passed, total),
            }
        )
    return rows


def build_language_quality_summary(
    results: list[dict],
    *,
    mode: str = "",
    generated_at: str | None = None,
) -> dict:
    generated_at = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    total = len(results)
    passed = sum(1 for row in results if _is_pass(row.get("language_quality_pass")))
    failed = total - passed

    domain_rows = _group_performance(results, "domain")
    for row in domain_rows:
        row["domain_label"] = DOMAIN_LABELS.get(row["domain"], row["domain"].title())

    return {
        "metadata": {
            "generated": generated_at,
            "mode": mode,
            "cases": total,
        },
        "overall": {
            "total_multilingual_test_cases": total,
            "passed": passed,
            "failed": failed,
            "pass_percentage": _pct(passed, total),
        },
        "language_performance": _group_performance(results, "language"),
        "domain_performance": domain_rows,
        "failure_breakdown": {
            "disclaimer_failures": sum(
                1 for row in results
                if not _is_pass(row.get("disclaimer_language_pass"))
            ),
            "language_mismatch_failures": sum(
                1 for row in results
                if not _is_pass(row.get("answer_language_pass"))
            ),
            "mixed_language_failures": sum(
                1 for row in results
                if not _is_pass(row.get("language_switching_pass"))
            ),
            "retrieval_failures": sum(
                1 for row in results
                if not _is_pass(row.get("gdb_entry_pass"))
            ),
            "missing_agricultural_terms": sum(
                1 for row in results
                if not _is_pass(row.get("term_translation_pass"))
            ),
        },
    }


def _markdown_table(headers: list[str], rows: list[list[object]]) -> str:
    header_line = "| " + " | ".join(headers) + " |"
    separator = "| " + " | ".join("---" for _ in headers) + " |"
    row_lines = [
        "| " + " | ".join(str(cell) for cell in row) + " |"
        for row in rows
    ]
    return "\n".join([header_line, separator, *row_lines])


def build_language_quality_summary_markdown(summary: dict) -> str:
    metadata = summary.get("metadata", {})
    overall = summary["overall"]
    language_rows = summary["language_performance"]
    domain_rows = summary["domain_performance"]
    failures = summary["failure_breakdown"]

    language_table = _markdown_table(
        ["Language", "Total", "Passed", "Failed", "Pass %"],
        [
            [
                row["language"],
                row["total"],
                row["passed"],
                row["failed"],
                f"{row['pass_percentage']:.1f}",
            ]
            for row in language_rows
        ],
    )

    domain_table = _markdown_table(
        ["Domain", "Total", "Passed", "Failed", "Pass %"],
        [
            [
                row["domain_label"],
                row["total"],
                row["passed"],
                row["failed"],
                f"{row['pass_percentage']:.1f}",
            ]
            for row in domain_rows
        ],
    )

    return "\n".join(
        [
            f"Generated: {metadata.get('generated', '')}",
            "",
            f"Mode: {metadata.get('mode', '')}",
            "",
            f"Cases: {metadata.get('cases', overall['total_multilingual_test_cases'])}",
            "",
            "# Overall Summary",
            "",
            f"- Total multilingual test cases: {overall['total_multilingual_test_cases']}",
            f"- Passed: {overall['passed']}",
            f"- Failed: {overall['failed']}",
            f"- Overall pass percentage: {overall['pass_percentage']:.1f}%",
            "",
            "# Language Performance",
            "",
            language_table,
            "",
            "# Domain Performance",
            "",
            domain_table,
            "",
            "# Failure Breakdown",
            "",
            f"- Disclaimer failures: {failures['disclaimer_failures']}",
            f"- Language mismatch failures: {failures['language_mismatch_failures']}",
            f"- Mixed-language failures: {failures['mixed_language_failures']}",
            f"- Retrieval failures: {failures['retrieval_failures']}",
            f"- Missing agricultural terms: {failures['missing_agricultural_terms']}",
            "",
        ]
    )


def write_language_quality_summary_reports(
    results: list[dict],
    markdown_file: str = "language_quality_summary.md",
    json_file: str = "language_quality_summary.json",
    mode: str = "",
) -> dict:
    summary = build_language_quality_summary(results, mode=mode)

    markdown_path = Path(markdown_file)
    json_path = Path(json_file)

    markdown_path.write_text(
        build_language_quality_summary_markdown(summary),
        encoding="utf-8",
    )
    json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Language quality summary written to: {markdown_path.resolve()}")
    print(f"Language quality summary JSON written to: {json_path.resolve()}")

    return summary
