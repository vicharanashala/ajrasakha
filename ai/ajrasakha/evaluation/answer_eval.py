"""Answer-quality scoring for one evaluation case.

The judge is optional. Mock/disabled runs return the same result shape without
reading judge configuration, building a judge, or calling DeepEval.
"""

from __future__ import annotations

import re
import copy

from ajrasakha.agents.answer_footers import FOOTER_SEPARATOR
from ajrasakha.agents.translation_catalog import (
    get_crop_price_unavailable_reply,
    get_early_morning_disclaimer,
    get_late_night_disclaimer,
    get_mandi_unavailable_reply,
    get_two_hour_disclaimer,
    get_weather_unavailable_reply,
    language_pair_from_plan,
)
from ajrasakha.evaluation.agricultural_metric import (
    build_agricultural_expectations,
)

METRIC_COLUMNS = (
    ("AnswerRelevancyMetric", "answerrelevancymetric"),
    ("FaithfulnessMetric", "faithfulnessmetric"),
    ("ContextualRelevancyMetric", "contextualrelevancymetric"),
    ("GDBMatchMetric", "gdbmatchmetric"),
    ("AgriculturalAccuracyMetric", "agriculturalaccuracymetric"),
)

ALL_METRIC_PREFIXES = tuple(prefix for _, prefix in METRIC_COLUMNS)

# Metrics with no calibrated v1 pass threshold. Their ``passed`` column stays
# empty rather than inventing a Boolean outcome.
NO_PASS_PREFIXES = {"gdbmatchmetric", "agriculturalaccuracymetric"}

NON_ANSWERED_OUTCOMES = {"deferred_to_expert", "tool_unavailable"}

# Runtime values replace these placeholders in mandi / crop-price replies.
_DYNAMIC_PLACEHOLDERS = re.compile(r"\[(?:Crop Name|Mandi Name)\]")


def _empty_quality(enabled: bool, outcome: str, judge_label: str) -> dict:
    """Start a result with the metric + bookkeeping keys, in report order."""
    quality = {}
    for _, prefix in METRIC_COLUMNS:
        quality[f"{prefix}_score"] = ""
        quality[f"{prefix}_passed"] = ""
        quality[f"{prefix}_reason"] = ""
        if prefix == "agriculturalaccuracymetric":
            for dim in ("crop", "region", "cultivation_guidance"):
                quality[f"{prefix}_{dim}_score"] = ""
                quality[f"{prefix}_{dim}_reason"] = ""
                quality[f"{prefix}_{dim}_applicable"] = ""
                quality[f"{prefix}_{dim}_error"] = ""
    quality["judge_label"] = judge_label
    quality["answer_quality_enabled"] = enabled
    quality["outcome"] = outcome
    return quality


def _set_not_applicable(quality: dict, prefixes, reason: str) -> None:
    for prefix in prefixes:
        quality[f"{prefix}_score"] = ""
        quality[f"{prefix}_passed"] = ""
        quality[f"{prefix}_reason"] = reason


def _disabled_quality() -> dict:
    quality = _empty_quality(False, "", "")
    _set_not_applicable(quality, ALL_METRIC_PREFIXES, "disabled")
    return quality


def _all_not_applicable(reason: str, outcome: str, judge_label: str = "") -> dict:
    quality = _empty_quality(True, outcome, judge_label)
    _set_not_applicable(quality, ALL_METRIC_PREFIXES, reason)
    return quality


def _get_plan(result: dict) -> dict:
    trace = result.get("trace") or {}
    plan = trace.get("plan") or {}
    return plan if isinstance(plan, dict) else {}


def _strip_footer(answer: str) -> str:
    """Return the answer body without the Sources/testing footer.

    The footer starts at the first line that exactly matches
    ``FOOTER_SEPARATOR``. Only the copy sent to the judge is stripped; the
    original ``final_answer`` in the result stays untouched.
    """
    original = answer or ""
    kept_lines = []
    for line in original.splitlines():
        if line == FOOTER_SEPARATOR:
            break
        kept_lines.append(line)

    stripped = "\n".join(kept_lines).strip()
    return stripped or original


def _is_greeting(plan: dict, case: dict) -> bool:
    if plan.get("is_greeting"):
        return True
    if plan.get("reasoning") == "greeting":
        return True

    # Fallback only when the plan is missing entirely.
    if not plan:
        expected_tools = case.get("expected_tools") or []
        return case.get("expected_domain") == "General" and not expected_tools

    return False


def _ends_with_any(text: str, candidates) -> bool:
    """True when the body ends with one of the catalog disclaimers."""
    for candidate in candidates:
        candidate = (candidate or "").strip()
        if candidate and text.endswith(candidate):
            return True
    return False


def _matches_catalog_reply(text: str, template: str) -> bool:
    """Match a catalog reply, treating runtime placeholders as wildcards."""
    template = (template or "").strip()
    if not template:
        return False
    parts = _DYNAMIC_PLACEHOLDERS.split(template)
    pattern = ".*?".join(re.escape(part) for part in parts)
    return re.fullmatch(pattern, text, flags=re.DOTALL) is not None


def _detect_outcome(result: dict, body: str) -> str:
    """Classify the reply shape from the plan and the stripped answer body.

    Only terminal catalog replies are detected here; everything else counts as
    an answer. Node names and observed tools are deliberately not used.
    """
    plan = _get_plan(result)
    if plan.get("translate_path") == "empty_gdb":
        return "deferred_to_expert"

    text = (body or "").strip()
    if not text:
        return "answered"

    script_language, vocal_language = language_pair_from_plan(plan)

    try:
        if _ends_with_any(
            text,
            (
                get_two_hour_disclaimer(script_language, vocal_language),
                get_late_night_disclaimer(script_language, vocal_language),
                get_early_morning_disclaimer(script_language, vocal_language),
            ),
        ):
            return "deferred_to_expert"

        for template in (
            get_weather_unavailable_reply(script_language, vocal_language),
            get_crop_price_unavailable_reply(script_language, vocal_language),
            get_mandi_unavailable_reply(script_language, vocal_language),
        ):
            if _matches_catalog_reply(text, template):
                return "tool_unavailable"
    except Exception:
        # Catalog lookups are best-effort; an unknown shape stays "answered".
        return "answered"

    return "answered"


def _judge_label() -> str:
    """Return provider:model without touching or exposing the key."""
    from ajrasakha.evaluation.deepeval_metrics import load_judge_config

    try:
        config = load_judge_config()
    except Exception:
        return ""
    return f"{config.provider}:{config.model}"


def _metric_columns(quality: dict, metric_results: dict) -> None:
    for metric_name, prefix in METRIC_COLUMNS:
        raw = metric_results.get(metric_name) or {}
        score = raw.get("score")
        reason = raw.get("reason") or ""

        if score is None:
            # A failed or missing measurement has no score and no Boolean pass.
            quality[f"{prefix}_score"] = ""
            quality[f"{prefix}_passed"] = ""
            quality[f"{prefix}_reason"] = reason or "judge_error: no score returned"
            continue

        passed = raw.get("passed")
        quality[f"{prefix}_score"] = score
        if prefix in NO_PASS_PREFIXES:
            # v1 has no calibrated threshold, so never emit a Boolean pass.
            quality[f"{prefix}_passed"] = ""
        else:
            quality[f"{prefix}_passed"] = "" if passed is None else passed
        quality[f"{prefix}_reason"] = reason


def evaluate_response_quality(
    result: dict,
    case: dict,
    enabled: bool = False,
) -> dict:
    """Evaluate one case with the configured DeepEval judge.

    Returns the 18-column answer-quality contract used by the CSV report, made
    up of metric and bookkeeping keys. When disabled, no judge configuration is
    read and no DeepEval call is made.
    """
    if not enabled:
        return _disabled_quality()

    answer = str(result.get("final_answer") or "").strip()
    stripped_answer = _strip_footer(answer)
    outcome = _detect_outcome(result, stripped_answer)

    if not answer:
        return _all_not_applicable(
            "not_applicable: no final answer",
            outcome=outcome,
        )

    if outcome in NON_ANSWERED_OUTCOMES:
        return _all_not_applicable(
            f"not_applicable: {outcome}",
            outcome=outcome,
        )

    plan = _get_plan(result)
    if _is_greeting(plan, case):
        return _all_not_applicable(
            "not_applicable: greeting",
            outcome=outcome,
        )

    context = result.get("retrieval_context") or []
    query = result.get("query") or case.get("query") or ""
    expected_output = str(case.get("expected_answer") or "").strip()

    # The builder is pure (no DeepEval import), so it is safe to run here.
    agricultural_expectations = build_agricultural_expectations(case)
    applicable = (agricultural_expectations or {}).get("applicable") or {}
    agricultural_applicable = any(applicable.values())

    # Imported lazily so disabled/mock runs never load the DeepEval judge.
    from ajrasakha.evaluation.deepeval_metrics import (
        JudgeSetupError,
        evaluate_agricultural_accuracy,
        evaluate_answer_with_deepeval,
    )

    try:
        metric_results = copy.deepcopy(evaluate_answer_with_deepeval(
            query,
            stripped_answer,
            context,
            expected_output=expected_output or None,
        ))
    except JudgeSetupError:
        # Setup failures must stop the run, not become a normal metric result.
        raise
    except Exception as exc:
        return _all_not_applicable(
            f"judge_error: {exc}",
            outcome=outcome,
            judge_label=_judge_label(),
        )

    if agricultural_applicable:
        try:
            agricultural = evaluate_agricultural_accuracy(
                query, stripped_answer, agricultural_expectations
            )
        except JudgeSetupError:
            raise
        except Exception as exc:
            agricultural = {
                "score": None,
                "passed": None,
                "reason": f"agricultural_error: {exc}",
                "dimensions": {},
            }
        if agricultural is not None:
            # Only adds/replaces the agricultural key; other metrics stay intact.
            metric_results["AgriculturalAccuracyMetric"] = copy.deepcopy(agricultural)
    else:
        agricultural = {}

    quality = _empty_quality(True, outcome, _judge_label())
    _metric_columns(quality, metric_results)

    # Preserving dimension-level results for the CSV report
    for dim in ("crop", "region", "cultivation_guidance"):
        dim_data = (agricultural.get("dimensions") or {}).get(dim) or {}
        prefix = f"agriculturalaccuracymetric_{dim}"
        quality[f"{prefix}_score"] = dim_data.get("score") if dim_data.get("error") is None else ""
        quality[f"{prefix}_reason"] = dim_data.get("reason") or ""
        quality[f"{prefix}_applicable"] = "true" if dim in (agricultural.get("dimensions") or {}) else "false"
        quality[f"{prefix}_error"] = dim_data.get("error") or ""

    if not agricultural_applicable:
        _set_not_applicable(quality, ("agriculturalaccuracymetric",), "not_applicable: no agricultural expectations")
        for dim in ("crop", "region", "cultivation_guidance"):
            prefix = f"agriculturalaccuracymetric_{dim}"
            quality[f"{prefix}_applicable"] = "false"

    if not expected_output:
        # The judge reports the missing reference internally; the CSV gets the
        # final applicability wording. Errors are not translated here.
        _set_not_applicable(
            quality,
            ("gdbmatchmetric",),
            "not_applicable: no expected answer",
        )

    if not context:
        _set_not_applicable(
            quality,
            ("faithfulnessmetric", "contextualrelevancymetric"),
            "not_applicable: no retrieval context",
        )

    return quality
