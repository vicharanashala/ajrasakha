"""
Generates the baseline answer-quality report across all 6 AjraSakha
domains (weather, market, soil, schemes, GDB queries, greetings), for the
AI team to use to prioritise prompt and retrieval improvements.

Usage (from ai/):
    python -m ajrasakha.evaluation.baseline_report
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from ajrasakha.evaluation.questions import TEST_CASES
from ajrasakha.evaluation.run import run_case

DOMAIN_LABELS = {
    "weather": "Weather",
    "market": "Market Prices",
    "soil": "Nutrient Management / Soil",
    "schemes": "Government Schemes",
    "gdb": "GDB Queries (Cultural Practices / Plant Protection)",
    "greetings": "Greetings / General",
}

METRIC_COLUMNS = [
    "answerrelevancymetric_score",
    "faithfulnessmetric_score",
    "contextualrelevancymetric_score",
    "gdbmatchscore_score",
    "agriaccuracymetric_score",
]


def run_baseline() -> list[dict]:
    results = []
    for case in TEST_CASES:
        print(f"[baseline] running: {case.get('name')}")
        results.append(run_case(case, mode="live"))
    return results


def _group_by_domain(results: list[dict]) -> dict[str, list[dict]]:
    grouped = defaultdict(list)
    for case, result in zip(TEST_CASES, results):
        grouped[case.get("domain") or "unmapped"].append(result)
    return grouped


def build_report(results: list[dict]) -> str:
    by_domain = _group_by_domain(results)

    lines = [
        "# AjraSakha Answer Quality Baseline Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "| Domain | Cases | Avg Quality Score | Quality Pass Rate |",
        "|---|---|---|---|",
    ]

    for domain_key, domain_results in by_domain.items():
        label = DOMAIN_LABELS.get(domain_key, domain_key)
        scores = [
            r["quality_overall_score"]
            for r in domain_results
            if isinstance(r.get("quality_overall_score"), (int, float))
        ]
        avg_score = round(sum(scores) / len(scores), 3) if scores else None
        pass_rate = (
            round(
                sum(1 for r in domain_results if r.get("quality_pass") is True)
                / len(domain_results)
                * 100,
                1,
            )
            if domain_results
            else 0.0
        )
        lines.append(
            f"| {label} | {len(domain_results)} | {avg_score if avg_score is not None else 'n/a'} | {pass_rate}% |"
        )

    lines.append("")
    lines.append("## Per-metric breakdown by domain")
    lines.append("")

    for domain_key, domain_results in by_domain.items():
        label = DOMAIN_LABELS.get(domain_key, domain_key)
        lines.append(f"### {label}")
        for metric in METRIC_COLUMNS:
            values = [
                r.get(metric) for r in domain_results if isinstance(r.get(metric), (int, float))
            ]
            avg = round(sum(values) / len(values), 3) if values else None
            lines.append(f"- **{metric}**: {avg if avg is not None else 'n/a'}")
        lines.append("")

    return "\n".join(lines)


def main():
    results = run_baseline()
    report_md = build_report(results)

    output_dir = Path("tests/reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "baseline_quality_report.md"
    output_path.write_text(report_md, encoding="utf-8")

    print(f"Baseline report written to: {output_path.resolve()}")

    try:
        from ajrasakha.evaluation.storage import save_results_to_postgres

        run_id = save_results_to_postgres(results, mode="baseline")
        print(f"Baseline scores stored in Postgres (run_id={run_id})")
    except Exception as exc:
        print(f"Skipped Postgres storage: {exc}")


if __name__ == "__main__":
    main()
