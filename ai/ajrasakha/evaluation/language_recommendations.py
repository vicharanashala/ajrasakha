"""Deterministic language-quality recommendations for multilingual runs."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

from ajrasakha.evaluation.language_summary import DOMAIN_LABELS


def _is_pass(value: object) -> bool:
    return value is True or str(value).strip().lower() in {"true", "pass", "passed", "1", "yes"}


def _performance(results: list[dict], key: str) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        buckets[str(result.get(key) or "unknown")].append(result)

    rows = []
    for name, bucket in sorted(buckets.items()):
        total = len(bucket)
        passed = sum(1 for row in bucket if _is_pass(row.get("language_quality_pass")))
        rows.append(
            {
                "name": name,
                "total": total,
                "passed": passed,
                "failed": total - passed,
                "pass_percentage": round((passed / total * 100), 1) if total else 0.0,
            }
        )
    return rows


def _best(rows: list[dict]) -> dict:
    return sorted(rows, key=lambda row: (-row["pass_percentage"], row["name"]))[0]


def _worst(rows: list[dict]) -> dict:
    return sorted(rows, key=lambda row: (row["pass_percentage"], row["name"]))[0]


def _comparison(rows: list[dict]) -> dict:
    if not rows:
        return {
            "all_identical": True,
            "highest": {},
            "lowest": {},
            "pass_percentage": 0.0,
        }

    percentages = {row["pass_percentage"] for row in rows}
    if len(percentages) == 1:
        return {
            "all_identical": True,
            "highest": {},
            "lowest": {},
            "pass_percentage": rows[0]["pass_percentage"],
        }

    return {
        "all_identical": False,
        "highest": _best(rows),
        "lowest": _worst(rows),
        "pass_percentage": None,
    }


def _failure_counter(results: list[dict], field: str, group_key: str) -> Counter[str]:
    counter: Counter[str] = Counter()
    for result in results:
        if not _is_pass(result.get(field)):
            counter[str(result.get(group_key) or "unknown")] += 1
    return counter


def _most_common(counter: Counter[str]) -> str | None:
    if not counter:
        return None
    return sorted(counter.items(), key=lambda item: (-item[1], item[0]))[0][0]


def build_language_quality_recommendations(results: list[dict]) -> dict:
    language_rows = _performance(results, "language")
    domain_rows = _performance(results, "domain")
    failed_rows = [
        result for result in results
        if not _is_pass(result.get("language_quality_pass"))
    ]

    actions: list[str] = []

    mixed_language = _most_common(
        _failure_counter(results, "language_switching_pass", "language")
    )
    if mixed_language:
        actions.append(f"Improve mixed-language generation in {mixed_language}.")

    disclaimer_language = _most_common(
        _failure_counter(results, "disclaimer_language_pass", "language")
    )
    if disclaimer_language:
        actions.append(f"Improve disclaimer localization in {disclaimer_language}.")

    market_retrieval_failures = [
        result for result in results
        if str(result.get("domain")) == "market"
        and not _is_pass(result.get("gdb_entry_pass"))
    ]
    if market_retrieval_failures:
        actions.append("Review market retrieval accuracy.")

    term_language = _most_common(
        _failure_counter(results, "term_translation_pass", "language")
    )
    if term_language:
        actions.append(f"Review transliteration consistency in {term_language}.")

    retrieval_domain = _most_common(
        _failure_counter(results, "gdb_entry_pass", "domain")
    )
    if retrieval_domain:
        domain_label = DOMAIN_LABELS.get(retrieval_domain, retrieval_domain.title())
        actions.append(f"Investigate GDB retrieval mismatches in {domain_label}.")

    if not actions:
        actions.append("No language quality issues detected during this evaluation run.")
        actions.append("Continue monitoring with live evaluations when staging credentials become available.")

    language_comparison = _comparison(language_rows)
    domain_comparison = _comparison(domain_rows)

    return {
        "language_performance": language_comparison,
        "domain_performance": domain_comparison,
        "highest_performing_language": language_comparison["highest"],
        "lowest_performing_language": language_comparison["lowest"],
        "highest_performing_domain": domain_comparison["highest"],
        "lowest_performing_domain": domain_comparison["lowest"],
        "failed_cases": len(failed_rows),
        "recommendations": actions,
    }


def build_language_quality_recommendations_markdown(report: dict) -> str:
    def describe(row: dict, label_key: str = "name") -> str:
        if not row:
            return "N/A"
        label = row[label_key]
        if label_key == "name" and label in DOMAIN_LABELS:
            label = DOMAIN_LABELS[label]
        return f"{label} ({row['pass_percentage']:.1f}%)"

    language_performance = report.get("language_performance", {})
    domain_performance = report.get("domain_performance", {})

    if language_performance.get("all_identical"):
        language_lines = [
            (
                "All languages achieved identical performance "
                f"({language_performance.get('pass_percentage', 0.0):.1f}%)."
            )
        ]
    else:
        language_lines = [
            f"- Highest performing language: {describe(report['highest_performing_language'])}",
            f"- Lowest performing language: {describe(report['lowest_performing_language'])}",
        ]

    if domain_performance.get("all_identical"):
        domain_lines = [
            (
                "All evaluated domains achieved identical performance "
                f"({domain_performance.get('pass_percentage', 0.0):.1f}%)."
            )
        ]
    else:
        domain_lines = [
            f"- Highest performing domain: {describe(report['highest_performing_domain'])}",
            f"- Lowest performing domain: {describe(report['lowest_performing_domain'])}",
        ]

    return "\n".join(
        [
            "# Language Quality Recommendations",
            "",
            "## Overall",
            "",
            *language_lines,
            "",
            "## Domain Performance",
            "",
            *domain_lines,
            "",
            "## Actionable Recommendations",
            "",
            *[f"- {recommendation}" for recommendation in report["recommendations"]],
            "",
        ]
    )


def write_language_quality_recommendations(
    results: list[dict],
    output_file: str = "language_quality_recommendations.md",
) -> dict:
    report = build_language_quality_recommendations(results)
    output_path = Path(output_file)
    output_path.write_text(
        build_language_quality_recommendations_markdown(report),
        encoding="utf-8",
    )
    print(f"Language quality recommendations written to: {output_path.resolve()}")
    return report
