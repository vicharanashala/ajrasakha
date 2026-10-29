"""Structural validation: resolve the right reference (reference_selector),
score per-step coverage against the draft, and summarize into one of the
five statuses. Never generates new agricultural content and never fills a
missing step - it only identifies coverage, using the reference's own
Example/Suggestion text to explain a gap (see Writing Assistant Build Plan,
"Separate responsibilities").
"""

import functools

from . import llm_client, reference_data, reference_selector, text_checks
from .models import (
    LLMUnavailableError,
    MatchedReference,
    ReferenceDataset,
    ReferenceStep,
    ReferenceStructure,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)

# Deliberately low bar: only overrides toward "missing" when a step's own
# topic shares fewer than this many significant words with *any single*
# draft section - catches a step that's genuinely absent (its topic
# merely name-dropped once, in passing, elsewhere) without second-
# guessing a real different-wording rewrite that still uses some of the
# same real nouns (crop/treatment/duration terms are rarely replaced with
# a wildly different synonym in practice). Confirmed necessary live: the
# tightened step-coverage prompt alone still gave partial credit to a
# fully-removed section whose topic word appeared once in an unrelated
# neighboring section (Writing Assistant Build Plan, Revision 15, ISS-05).
_MIN_SHARED_TERMS_FOR_TRUST = 2

# A section's overlap with this step only counts if no *other* step's own
# example overlaps with that same section by more than this multiple -
# otherwise the section is that other step's content, just restating a
# fact this step also cares about, not genuine evidence for this step.
# Confirmed necessary live: a draft's Introduction restating "major,
# recurring disease" (step 1's own territory) kept crediting a removed
# "is this major or minor" step (step 2) just because those same two
# words are also in step 2's example - the Introduction section's
# overlap with step 1 is far larger, so step 2's claim on it is spurious
# (Writing Assistant Build Plan, Revision 17, ISS-05).
_DOMINANCE_MARGIN = 1.5


def _has_textual_evidence(step: ReferenceStep, draft_text: str, all_steps: list[ReferenceStep]) -> bool:
    # The example's own text, not the step name - a step name like
    # "Cultural control"/"Chemical control" shares the generic word
    # "control" with several other steps in the same "X control"
    # framework, which made every step look like it had evidence
    # anywhere "control" appeared. The example is the specific,
    # concrete description - confirmed by re-testing live after the
    # step-name version failed to catch a real removed section.
    step_terms = text_checks.significant_words(step.example)
    if not step_terms:
        return True  # nothing meaningful to check against - don't block on this

    other_terms_list = [
        text_checks.significant_words(s.example) for s in all_steps if s is not step
    ]
    for section in text_checks.split_sections(draft_text):
        section_terms = text_checks.significant_words(section)
        overlap = len(step_terms & section_terms)
        if overlap < _MIN_SHARED_TERMS_FOR_TRUST:
            continue
        dominated_by_another_step = any(
            len(other_terms & section_terms) > overlap * _DOMINANCE_MARGIN
            for other_terms in other_terms_list
        )
        if not dominated_by_another_step:
            return True
    return False


def score_coverage(draft_text: str, structure: ReferenceStructure) -> tuple[list[StepCoverageResult], list[int | None]]:
    results = []
    section_indices: list[int | None] = []
    all_step_names = [s.step for s in structure.steps]
    for step in structure.steps:
        coverage, section_index = llm_client.classify_step_coverage(
            draft_text, step.step, step.example, all_step_names, structure.question
        )
        # Deterministic safety net: never let the LLM credit a step whose
        # topic has no real textual presence anywhere in the draft - only
        # ever downgrades toward "missing", never promotes away from it.
        if coverage != StepCoverage.MISSING and not _has_textual_evidence(step, draft_text, structure.steps):
            coverage = StepCoverage.MISSING
            section_index = None
        # Example/Suggestion text is "what's expected" explanation for a
        # gap - it must never appear on a step that's already covered, or
        # it reads as an invented issue on a correct draft (Writing
        # Assistant Build Plan, Revision 14, ISS-08).
        is_covered = coverage == StepCoverage.COVERED
        results.append(
            StepCoverageResult(
                sl_no=step.sl_no,
                step=step.step,
                coverage=coverage,
                example=step.example,
                suggestion_1=None if is_covered else step.suggestion_1,
                suggestion_2=None if is_covered else step.suggestion_2,
            )
        )
        section_indices.append(section_index)
    return results, section_indices


def _summarize(steps: list[StepCoverageResult]) -> StructuralValidationStatus:
    if all(s.coverage == StepCoverage.COVERED for s in steps):
        return StructuralValidationStatus.COMPLETE
    if any(s.coverage == StepCoverage.MISSING for s in steps):
        return StructuralValidationStatus.INCOMPLETE
    return StructuralValidationStatus.PARTIAL


def _order_warnings(steps: list[StepCoverageResult], section_indices: list[int | None]) -> list[str]:
    """Flags a step whose located section comes *before* an earlier-slNo
    step's located section - only for steps whose position could be
    confidently located (never fabricated for a step with no position at
    all, e.g. one scored "missing")."""
    warnings: list[str] = []
    max_so_far: int | None = None
    step_at_max: StepCoverageResult | None = None
    for step, section_index in zip(steps, section_indices):
        if section_index is None:
            continue
        if max_so_far is not None and section_index < max_so_far:
            warnings.append(
                f"Step {step.sl_no} ({step.step}) appears before step "
                f"{step_at_max.sl_no} ({step_at_max.step}) in the draft."
            )
        else:
            max_so_far = section_index
            step_at_max = step
    return warnings


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
        steps, section_indices = score_coverage(draft_text, structure)
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
        order_warnings=_order_warnings(steps, section_indices),
    )


@functools.lru_cache(maxsize=512)
def validate_structure_cached(question: str, draft_text: str) -> StructuralValidationResult:
    """Deterministic entry point for the HTTP endpoint: the exact same
    (question, draft) pair always returns the exact same result within
    this process - closes the "identical input gives a different result
    on repeated calls" gap (Writing Assistant Build Plan, Revision 17,
    ISS-04/ISS-11) for the literal repeated-request case the real test
    report exercised (RL-01/02/03, QT-01 vs AS-01 vs AG-02 with the same
    text). Not a staleness risk - (question, draft) is the cache key, so
    a changed draft is a cache miss by construction; a reference-data
    reload still requires a process restart regardless (unaffected -
    see 'Production release consistency'). Does not and cannot make the
    model's judgment on two *different*-but-similar drafts consistent
    with each other. Tests must clear this between cases - see
    conftest.py."""
    dataset = reference_data.get_cached_dataset()
    return validate_structure(question, draft_text, dataset)
