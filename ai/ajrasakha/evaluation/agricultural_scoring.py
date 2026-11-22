"""Deterministic scoring for agricultural accuracy.

The scoring helper (:func:`_dimension_anchor`) and the expectation text builder
(:func:`_expectation_text`) are pure and independently testable. The judge is
loaded lazily by :func:`evaluate_agricultural_accuracy` so importing this module
never configures a model, reads a key or makes a network call.

Score semantics (spec §4.3):

- ``1.0``  supported / correct
- ``0.5``  omitted, incomplete, or only partially supported
- ``0.0``  explicitly contradictory to the expected information

The overall score averages only applicable dimensions and is capped at ``0.3``
when any applicable dimension is contradictory. A dimension that fails is never
silently dropped or treated as zero; the overall score becomes ``None``.
"""

import math


AGRICULTURAL_DIMENSIONS = ("crop", "region", "cultivation_guidance")

_BAND_LABELS = {
    0.0: "contradictory",
    0.5: "omitted or partial",
    1.0: "supported",
}


def _dimension_anchor(score):
    """Map a normalized judge score in ``[0, 1]`` to a dimension anchor.

    Documented bands (the rubric normalizes raw 0-3 to 0.0-0.3, raw 4-6 to
    0.4-0.6 and raw 7-10 to 0.7-1.0):

    - ``score <= 0.3`` -> ``0.0`` (contradictory)
    - ``0.3 < score <= 0.6`` -> ``0.5`` (omitted or partial)
    - ``score > 0.6`` -> ``1.0`` (supported)

    ``None`` is returned for ``None``, NaN/infinity, booleans, non-numeric
    values and anything outside ``[0, 1]``. An invalid or missing score is never
    coerced to ``0.0``.
    """
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return None
    if not math.isfinite(score):
        return None
    if score < 0.0 or score > 1.0:
        return None
    if score <= 0.3:
        return 0.0
    if score <= 0.6:
        return 0.5
    return 1.0


def _provenance_label(source):
    """Describe a cultivation guidance reference source without inventing provenance.

    ``synthetic_manual`` is explicitly labelled as a synthetic/manual reference
    that is not an ACE GDB reference. A missing source is reported as
    ``unknown``. Any other source is shown as given; this feature makes no claim
    about whether that source is or is not ACE GDB.
    """
    source = str(source or "").strip()
    if not source:
        return "unknown"
    if source.lower() == "synthetic_manual":
        return "synthetic_manual (synthetic/manual reference, not ACE GDB)"
    return source


def _expectation_text(dimension, expectations):
    """Render the deterministic expectation block for one dimension."""
    if dimension == "crop":
        aliases = expectations.get("crop_aliases") or []
        return "\n".join(
            [
                "Crop expectation:",
                f"- expected_crop: {expectations.get('crop')}",
                f"- equivalent_aliases: {', '.join(aliases)}",
            ]
        )

    if dimension == "region":
        lines = [
            "Region expectation:",
            f"- expected_state: {expectations.get('state')}",
        ]
        city = expectations.get("city")
        if city:
            lines.append(f"- expected_city: {city}")
        return "\n".join(lines)

    if dimension == "cultivation_guidance":
        source_line = _provenance_label(
            expectations.get("cultivation_guidance_reference_source")
        )
        return "\n".join(
            [
                "Cultivation guidance expectation:",
                f"- source: {source_line}",
                f"- reference: {expectations.get('cultivation_guidance_reference')}",
            ]
        )

    raise ValueError(f"unknown agricultural dimension: {dimension!r}")


def _failed_dimension(dimension, message):
    """Build the dimension record for a failed dimension."""
    return {
        "score": None,
        "reason": f"agricultural_{dimension}_error: {message}",
        "contradiction": False,
        "error": str(message),
    }


def evaluate_agricultural_accuracy(query, answer, expectations):
    """Score an answer against explicit agricultural expectations.

    Returns ``None`` without touching the judge when there are no expectations,
    no applicable dimension, or no usable answer. Only applicable dimensions are
    measured, in the fixed order crop, region, cultivation_guidance.

    An ordinary failure in one dimension is recorded and makes the overall
    score ``None`` (it is never averaged away). ``JudgeSetupError`` always
    propagates unchanged. ``passed`` is always ``None``: this feature defines no
    pass threshold.
    """
    if expectations is None:
        return None

    applicable = expectations.get("applicable")
    applicable = applicable if isinstance(applicable, dict) else {}
    dimensions = [
        dimension
        for dimension in AGRICULTURAL_DIMENSIONS
        if applicable.get(dimension)
    ]
    if not dimensions:
        return None

    if not isinstance(answer, str) or not answer.strip():
        return None

    # Lazy import: importing this module must not configure a judge or network.
    from ajrasakha.evaluation import deepeval_metrics as dm

    model = dm.get_judge_model()

    dimension_results = {}
    anchors = []
    failed = []

    for dimension in dimensions:
        try:
            metric = dm._build_agricultural_metric(model, dimension)
            test_case = dm.LLMTestCase(
                input=query,
                actual_output=answer,
                context=[_expectation_text(dimension, expectations)],
            )
            metric.measure(test_case)
        except dm.JudgeSetupError:
            raise
        except Exception as exc:
            dimension_results[dimension] = _failed_dimension(dimension, exc)
            failed.append(dimension)
            continue

        anchor = _dimension_anchor(metric.score)
        if anchor is None:
            dimension_results[dimension] = _failed_dimension(
                dimension, f"invalid judge score: {metric.score!r}"
            )
            failed.append(dimension)
            continue

        dimension_results[dimension] = {
            "score": anchor,
            "reason": str(metric.reason or "").strip(),
            "contradiction": anchor == 0.0,
            "error": None,
        }
        anchors.append(anchor)

    segments = []
    for dimension in dimensions:
        record = dimension_results[dimension]
        if record["error"] is not None:
            segments.append(
                f"{dimension}=error (error): {record['reason']}"
            )
        else:
            band = _BAND_LABELS[record["score"]]
            segments.append(
                f"{dimension}={record['score']:.1f} ({band}): "
                f"{record['reason']}"
            )
    reason = " | ".join(segments)

    if expectations.get("cultivation_guidance_reference"):
        source_line = _provenance_label(
            expectations.get("cultivation_guidance_reference_source")
        )
        reason = f"{reason} | cultivation guidance reference: {source_line}"

    if failed:
        score = None
        if len(failed) == len(dimensions):
            reason = f"agricultural_error: {reason}"
    else:
        score = round(sum(anchors) / len(anchors), 2)
        if any(anchor == 0.0 for anchor in anchors):
            score = min(score, 0.3)

    return {
        "score": score,
        "passed": None,
        "reason": reason,
        "dimensions": dimension_results,
    }
