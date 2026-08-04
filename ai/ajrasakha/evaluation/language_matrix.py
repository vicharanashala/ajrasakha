from collections import defaultdict
import csv


def build_language_quality_matrix(results: list[dict]) -> list[dict]:
    """
    Generate language-wise evaluation statistics grouped by domain.
    """

    matrix = defaultdict(
        lambda: {
            "total": 0,
            "technical_passed": 0,
            "routing_passed": 0,
            "tool_passed": 0,
        }
    )

    for result in results:
        domain = result.get("expected_domain", "Unknown")
        language = result.get("script_language", "English")

        key = (domain, language)
        stats = matrix[key]

        stats["total"] += 1

        if result.get("technical_pass"):
            stats["technical_passed"] += 1

        if result.get("routing_pass"):
            stats["routing_passed"] += 1

        if result.get("tool_pass"):
            stats["tool_passed"] += 1

    rows = []

    for (domain, language), stats in sorted(matrix.items()):
        total = stats["total"]

        rows.append(
            {
                "domain": domain,
                "language": language,
                "total_cases": total,
                "technical_passed": stats["technical_passed"],
                "routing_passed": stats["routing_passed"],
                "tool_passed": stats["tool_passed"],
                "technical_pass_rate": round(
                    stats["technical_passed"] * 100 / total, 1
                ),
                "routing_pass_rate": round(
                    stats["routing_passed"] * 100 / total, 1
                ),
                "tool_pass_rate": round(
                    stats["tool_passed"] * 100 / total, 1
                ),
            }
        )

    return rows


def write_language_matrix_csv(
    matrix: list[dict],
    output_file: str,
):
    """
    Write the Language Quality Matrix to CSV.
    """

    fieldnames = [
        "domain",
        "language",
        "total_cases",
        "technical_passed",
        "routing_passed",
        "tool_passed",
        "technical_pass_rate",
        "routing_pass_rate",
        "tool_pass_rate",
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()

        for row in matrix:
            writer.writerow(row)