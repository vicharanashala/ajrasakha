import math
from collections import defaultdict
from typing import Any


METRIC_STATUSES = (
    "scored",
    "scored_zero",
    "not_applicable",
    "evaluation_error",
    "disabled",
)


def _numeric_score(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        score = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return score if math.isfinite(score) else None


def _is_false(value: Any) -> bool:
    return value is False or (
        isinstance(value, str) and value.strip().lower() in {"false", "no", "0"}
    )


def _has_value(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def _is_error_reason(reason: str) -> bool:
    normalized = reason.lower()
    return any(
        marker in normalized
        for marker in ("error", "timeout", "timed out", "judge failed")
    )


def classify_metric_status(result: dict, prefix: str) -> str:
    """Classify a metric result without treating a blank score as zero."""
    reason = str(result.get(f"{prefix}_reason") or "").strip()
    if _is_false(result.get("answer_quality_enabled")) or reason.lower() == "disabled":
        return "disabled"

    applicable = result.get(f"{prefix}_applicable")
    if reason.lower().startswith("not_applicable:") or _is_false(applicable):
        return "not_applicable"

    if _has_value(result.get(f"{prefix}_error")) or _is_error_reason(reason):
        return "evaluation_error"

    score = _numeric_score(result.get(f"{prefix}_score"))
    if score is None:
        return "evaluation_error"
    return "scored_zero" if score == 0 else "scored"


def discover_score_prefixes(results: list[dict]) -> list[str]:
    """Find every scored field, including component-level details."""
    keys = {key for result in results for key in result}
    prefixes = set()
    companions = ("passed", "reason", "applicable", "error")
    for key in keys:
        if not isinstance(key, str) or not key.endswith("_score"):
            continue
        prefix = key[: -len("_score")]
        if any(f"{prefix}_{suffix}" in keys for suffix in companions):
            prefixes.add(prefix)
    return sorted(prefixes)


def discover_metric_prefixes(results: list[dict]) -> list[str]:
    """Find aggregate metric scores, excluding nested component scores."""
    prefixes = discover_score_prefixes(results)
    return [
        prefix
        for prefix in prefixes
        if not any(
            prefix.startswith(parent + "_")
            for parent in prefixes
            if parent != prefix
        )
    ]


def _quality_summary(results: list[dict], metric_prefixes: list[str]) -> dict:
    summaries = {}
    for prefix in metric_prefixes:
        scores = []
        counts = {status: 0 for status in METRIC_STATUSES}
        for result in results:
            status = classify_metric_status(result, prefix)
            counts[status] += 1
            if status in ("scored", "scored_zero"):
                score = _numeric_score(result.get(f"{prefix}_score"))
                if score is not None:
                    scores.append(score)

        summaries[prefix] = {
            "average_score": sum(scores) / len(scores) if scores else None,
            "scored_count": counts["scored"] + counts["scored_zero"],
            "scored_normally_count": counts["scored"],
            "scored_zero_count": counts["scored_zero"],
            "not_applicable_count": counts["not_applicable"],
            "evaluation_error_count": counts["evaluation_error"],
            "disabled_count": counts["disabled"],
        }
    return summaries


def _technical_summary(results: list[dict]) -> dict:
    total = len(results)
    passed = sum(result.get("technical_pass") is True for result in results)
    failed = sum(result.get("technical_pass") is False for result in results)
    unknown = total - passed - failed
    return {
        "total_cases": total,
        "technical_passed": passed,
        "technical_failed": failed,
        "technical_unknown": unknown,
        "technical_pass_rate": passed / total if total else None,
    }


def _domain_name(result: dict) -> str:
    value = (
        result.get("expected_domain")
        or result.get("domain")
        or result.get("observed_domain")
    )
    return str(value).strip() if value is not None and str(value).strip() else "Unknown"


def build_summary(
    results: list[dict],
    *,
    evaluation_mode: str | None = None,
    run_metadata: dict[str, Any] | None = None,
) -> dict:
    metric_prefixes = discover_metric_prefixes(results)
    technical = _technical_summary(results)
    summary = {
        "total_cases": technical["total_cases"],
        "technical_passed": technical["technical_passed"],
        "technical_failed": technical["technical_failed"],
        "technical_unknown": technical["technical_unknown"],
        "technical_pass_rate": technical["technical_pass_rate"],
        "routing_passed": sum(
            result.get("routing_pass") is True for result in results
        ),
        "tool_passed": sum(result.get("tool_pass") is True for result in results),
        "failed_cases": technical["total_cases"] - technical["technical_passed"],
        "quality_metrics": _quality_summary(results, metric_prefixes),
        "domains": {},
        "evaluation_mode": evaluation_mode,
        "run_metadata": dict(run_metadata or {}),
    }

    by_domain = defaultdict(list)
    for result in results:
        by_domain[_domain_name(result)].append(result)
    for domain, domain_results in sorted(by_domain.items()):
        domain_technical = _technical_summary(domain_results)
        summary["domains"][domain] = {
            **domain_technical,
            "quality_metrics": _quality_summary(domain_results, metric_prefixes),
        }

    return summary
