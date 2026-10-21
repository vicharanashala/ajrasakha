"""Structural validation: resolve the right reference (reference_selector),
score per-step coverage against the draft, and summarize into one of the
five statuses. Never generates new agricultural content and never fills a
missing step - it only identifies coverage, using the reference's own
Example/Suggestion text to explain a gap (see Writing Assistant Build Plan,
"Separate responsibilities").
"""

from . import llm_client, reference_selector
from .models import (
    LLMUnavailableError,
    MatchedReference,
    ReferenceDataset,
    ReferenceStructure,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)


def score_coverage(draft_text: str, structure: ReferenceStructure) -> list[StepCoverageResult]:
    results = []
    for step in structure.steps:
        coverage = llm_client.classify_step_coverage(draft_text, step.step, step.example)
        results.append(
            StepCoverageResult(
                sl_no=step.sl_no,
                step=step.step,
                coverage=coverage,
                example=step.example,
                suggestion_1=step.suggestion_1,
                suggestion_2=step.suggestion_2,
            )
        )
    return results


def _summarize(steps: list[StepCoverageResult]) -> StructuralValidationStatus:
    if all(s.coverage == StepCoverage.COVERED for s in steps):
        return StructuralValidationStatus.COMPLETE
    if any(s.coverage == StepCoverage.MISSING for s in steps):
        return StructuralValidationStatus.INCOMPLETE
    return StructuralValidationStatus.PARTIAL


def validate_structure(question: str, draft_text: str, dataset: ReferenceDataset | None) -> StructuralValidationResult:
    if dataset is None:
        return StructuralValidationResult(
            status=StructuralValidationStatus.REFERENCE_DATA_UNAVAILABLE,
            clarification_reason="Reference data could not be loaded or failed validation. "
            "Structural validation was not performed.",
        )

    outcome = reference_selector.select_reference(question, dataset)
    if outcome.structure is None:
        return StructuralValidationResult(status=outcome.status, clarification_reason=outcome.reason)

    structure = outcome.structure
    try:
        steps = score_coverage(draft_text, structure)
    except LLMUnavailableError as exc:
        return StructuralValidationResult(
            status=StructuralValidationStatus.NEEDS_CLARIFICATION,
            clarification_reason=f"Could not assess step coverage: {exc}",
        )

    matched_reference = MatchedReference(
        source_type=structure.source_type,
        domain=structure.domain,
        code=structure.code,
        question_type=structure.question_type,
        crop=structure.crop,
    )
    return StructuralValidationResult(
        status=_summarize(steps),
        matched_reference=matched_reference,
        steps=steps,
    )
