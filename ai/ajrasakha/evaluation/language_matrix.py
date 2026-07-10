"""Language Quality Matrix reporting."""

from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path


def _is_pass(value: object) -> bool:
    return value is True or str(value).strip().lower() in {"true", "pass", "passed", "1", "yes"}


def build_language_quality_matrix(results: list[dict]) -> list[dict]:
    buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for result in results:
        language = result.get("language") or result.get("language_code") or "unknown"
        domain = result.get("domain") or result.get("expected_domain") or "unknown"
        buckets[(str(language), str(domain))].append(result)

    rows = []
    for (language, domain), bucket in sorted(buckets.items()):
        total = len(bucket)
        language_passed = sum(1 for row in bucket if _is_pass(row.get("answer_language_pass")))
        disclaimer_passed = sum(1 for row in bucket if _is_pass(row.get("disclaimer_language_pass")))
        switching_passed = sum(1 for row in bucket if _is_pass(row.get("language_switching_pass")))
        gdb_passed = sum(1 for row in bucket if _is_pass(row.get("gdb_entry_pass")))
        terms_passed = sum(1 for row in bucket if _is_pass(row.get("term_translation_pass")))
        overall_passed = sum(1 for row in bucket if _is_pass(row.get("language_quality_pass")))

        def pct(count: int) -> str:
            return f"{(count / total * 100):.1f}" if total else "0.0"

        rows.append(
            {
                "language": language,
                "domain": domain,
                "total_cases": total,
                "answer_language_pass_rate": pct(language_passed),
                "disclaimer_language_pass_rate": pct(disclaimer_passed),
                "language_switching_pass_rate": pct(switching_passed),
                "gdb_entry_pass_rate": pct(gdb_passed),
                "term_translation_pass_rate": pct(terms_passed),
                "overall_pass_rate": pct(overall_passed),
            }
        )

    return rows


def write_language_quality_matrix(
    results: list[dict],
    output_file: str = "language_quality_matrix.csv",
) -> list[dict]:
    rows = build_language_quality_matrix(results)
    output_path = Path(output_file)

    if not rows:
        print("No language quality matrix rows to write.")
        return []

    with output_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Language quality matrix written to: {output_path.resolve()}")
    return rows
