import csv
from pathlib import Path
from typing import Any

from ajrasakha.evaluation.summary import (
    classify_metric_status,
    discover_score_prefixes,
)

_STABLE_REPORT_FIELDS = (
    "record_type",
    "name",
    "query",
    "expected_tools",
    "observed_tools",
    "http_status",
    "graph_status",
    "latency_seconds",
    "response_text",
    "final_answer",
    "retrieval_context",
    "error",
    "technical_pass",
    "routing_pass",
    "tool_pass",
    "trace_url",
    "trace_available",
    "expected_nodes",
    "observed_nodes",
    "node_pass",
    "node_reason",
    "expected_domain",
    "observed_domain",
    "expected_plan",
    "observed_plan",
    "plan_pass",
    "plan_reason",
)

_QUALITY_METRIC_PREFIXES = (
    "answerrelevancymetric",
    "faithfulnessmetric",
    "contextualrelevancymetric",
    "gdbmatchmetric",
    "agriculturalaccuracymetric",
)

_AGRICULTURAL_DIMENSIONS = ("crop", "region", "cultivation_guidance")

_STABLE_REPORT_FIELDS += tuple(
    field
    for prefix in _QUALITY_METRIC_PREFIXES
    for field in (
        f"{prefix}_score",
        f"{prefix}_passed",
        f"{prefix}_reason",
        f"{prefix}_status",
    )
)
_STABLE_REPORT_FIELDS += tuple(
    field
    for dimension in _AGRICULTURAL_DIMENSIONS
    for field in (
        f"agriculturalaccuracymetric_{dimension}_score",
        f"agriculturalaccuracymetric_{dimension}_reason",
        f"agriculturalaccuracymetric_{dimension}_applicable",
        f"agriculturalaccuracymetric_{dimension}_error",
        f"agriculturalaccuracymetric_{dimension}_status",
    )
)
_STABLE_REPORT_FIELDS += (
    "judge_label",
    "answer_quality_enabled",
    "outcome",
    "source_check_required",
    "source_attribution_pass",
    "source_attribution_reason",
    "disclaimer_required",
    "testing_disclaimer_present",
    "testing_disclaimer_at_bottom",
    "two_hr_disclaimer_required",
    "two_hr_disclaimer_present",
    "language_required",
    "language_pass",
    "disclaimer_language_pass",
    "disclaimer_language_reason",
    "failure_reason",
    "triage_category",
    "triage_action",
    "severity",
    "evaluation_mode",
    "run_id",
    "run_started_at",
    "stable_only",
    "selected_case_count",
)


def write_csv_report(
    results: list[dict],
    output_file: str = "evaluation_report.csv",
    *,
    evaluation_mode: str | None = None,
    run_metadata: dict[str, Any] | None = None,
) -> None:
    metadata = dict(run_metadata or {})
    if evaluation_mode is not None:
        metadata["evaluation_mode"] = evaluation_mode

    rows = []
    fieldnames = list(_STABLE_REPORT_FIELDS)
    for key in metadata:
        if key not in fieldnames:
            fieldnames.append(key)

    if results:
        for result in results:
            row = dict(result)
            row.update(metadata)
            row["record_type"] = "case"
            rows.append(row)
            for key in row:
                if key not in fieldnames:
                    fieldnames.append(key)
    else:
        rows.append({"record_type": "run_metadata", **metadata})

    score_prefixes = discover_score_prefixes(rows)
    for prefix in score_prefixes:
        status_field = f"{prefix}_status"
        if status_field not in fieldnames:
            fieldnames.append(status_field)
        for row in rows:
            row[status_field] = classify_metric_status(row, prefix)

    output_path = Path(output_file)
    with open(output_path, mode="w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(
            {fieldname: row.get(fieldname, "") for fieldname in fieldnames}
            for row in rows
        )

    print(f"Report written to: {output_path.resolve()}")
