"""Structural validation: resolve the right reference (reference_selector),
score per-step coverage against the draft, and summarize into one of the
five statuses. Never generates new agricultural content and never fills a
missing step - it only identifies coverage, using the reference's own
Example/Suggestion text to explain a gap (see Writing Assistant Build Plan,
"Separate responsibilities").
"""

import logging
from collections import Counter

from . import llm_client, reference_data, reference_selector, text_checks
from .result_cache import ResultCache
from .models import (
    LLMUnavailableError,
    MatchedReference,
    ReferenceDataset,
    ReferenceStep,
    ReferenceStructure,
    SourceType,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)

log = logging.getLogger("writing_assistant.structural_validator")

# Team requirement: a question/answer pair from a domain the Golden
# Database doesn't cover must still get a real structural check, not just
# needs_clarification - but only when nothing matched at all (reference_
# selector.SelectionOutcome.no_match), never for a genuine conflict
# between two real candidates or a failed classification call (see that
# module's docstring - neither of those means "this topic isn't covered").
# One fixed, domain-neutral template, not a per-topic one: reused as-is
# for every unmatched question regardless of subject, by explicit team
# decision. Wording is deliberately generalized off a concrete pest-
# management example the team gave (Introduction / major-or-minor /
# identification / severity / action threshold / escalating response
# options / safety / conclusion) rather than reusing pest-specific terms
# (e.g. "chemical control") that wouldn't fit a non-pest topic like a
# scheme or soil-health question.
_GENERIC_FALLBACK_STEPS = [
    ReferenceStep(
        sl_no=1, step="Introduction",
        example="States the specific problem or question being addressed and gives a brief overview of "
        "the approach the rest of the answer will take.",
        suggestion_1="Name the specific issue or topic directly instead of opening with generic background.",
    ),
    ReferenceStep(
        sl_no=2, step="Severity or Importance",
        example="Explains how significant, urgent, or widespread this issue typically is, so the reader "
        "understands how much it matters.",
        suggestion_1="State plainly whether this is generally a major or minor concern.",
    ),
    ReferenceStep(
        sl_no=3, step="Confirm the Specifics First",
        example="Helps the reader confirm exactly what they are dealing with (the specific pest, disease, "
        "situation, or eligibility condition) before acting on the rest of the answer.",
        suggestion_1="Give concrete signs or criteria the reader can check to confirm this applies to them.",
    ),
    ReferenceStep(
        sl_no=4, step="Impact if Not Addressed",
        example="Describes the concrete consequences of leaving the issue unaddressed.",
        suggestion_1="State the specific downside of not acting, not just that it 'should be addressed'.",
    ),
    ReferenceStep(
        sl_no=5, step="Decision Point - When to Act",
        example="Gives a clear threshold or trigger for when the reader should actually take action, "
        "rather than acting on every small occurrence.",
        suggestion_1="State a specific threshold, condition, or signal, not just 'if needed'.",
    ),
    ReferenceStep(
        sl_no=6, step="Lower-Intervention Options First",
        example="Describes the least invasive, lowest-cost, or most preventive measures appropriate to "
        "this specific topic, to try before anything stronger.",
        suggestion_1="Name at least one concrete preventive or low-intervention measure for this topic.",
    ),
    ReferenceStep(
        sl_no=7, step="Supporting or Alternative Measures",
        example="Describes additional measures beyond the lowest-intervention option - alternative "
        "approaches or supporting actions appropriate to the topic.",
        suggestion_1="Name a specific supporting measure, distinct from the previous step.",
    ),
    ReferenceStep(
        sl_no=8, step="Direct or Strongest Action (Once Warranted)",
        example="Describes the strongest or most direct action to take once the decision threshold from "
        "the earlier step is actually crossed.",
        suggestion_1="Make clear this is conditional on the threshold being crossed, and name the action.",
    ),
    ReferenceStep(
        sl_no=9, step="Safety, Compliance, or Precautions",
        example="States any safety precautions, compliance requirements, or official rules the reader "
        "must follow while carrying out the recommended action.",
        suggestion_1="Name a concrete precaution or compliance requirement specific to this action.",
    ),
    ReferenceStep(
        sl_no=10, step="Conclusion",
        example="Closes with a genuine summary that ties the above points together into a clear final "
        "recommendation - not a restatement of the introduction, and not left blank.",
        suggestion_1="End with an explicit, concrete closing recommendation, distinct from the introduction.",
    ),
]


def _generic_fallback_structure(question: str) -> ReferenceStructure:
    # question (the author's own, real question) stands in for a matched
    # reference's own canonical question - there's no single curated
    # "subject" here by design, so classify_step_coverage's off-topic
    # check is grounded in the actual question instead.
    return ReferenceStructure(
        source_type=SourceType.GENERIC_FALLBACK,
        question=question,
        full_written_answer="",
        steps=_GENERIC_FALLBACK_STEPS,
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

# "Exclusive ownership" of a section only makes sense when there are
# enough sections for different steps to plausibly each have their own -
# with only one or two sections, every step's content is legitimately
# mixed together in the same block, and "step X's example overlaps that
# block more than step Y's" is not evidence step Y is missing. Confirmed
# live by an independent re-test report: a heading-stripped draft with
# every step's content genuinely present as one block had 4 of 10
# correctly-covered steps wrongly downgraded to missing, because each
# one's content shared that single block with another step whose example
# happened to overlap it more (Writing Assistant Build Plan, Revision 18,
# ISS-05 regression).
_MIN_SECTIONS_FOR_DOMINANCE_CHECK = 3

# The underlying reasoning model is not fully reproducible even at
# temperature=0 with a fixed seed - a known serving-stack property
# (batch-size-dependent floating point reductions, MoE routing), not a
# bug in this code (confirmed real-world recurrence: ISS-04/ISS-11, the
# RL-01/02/03 flapping case). Majority-voting the one call that most
# visibly flips a user-facing verdict (per-step coverage) trades 3x the
# latency on that call for stability on borderline cases - it cannot fix
# the model's own instability, only reduce how often it changes the
# answer we show.
_COVERAGE_VOTES = 3

# Tie-break for a genuine 3-way split (one vote each) - pick the most
# cautious answer rather than an arbitrary one, consistent with this
# service's fail-closed philosophy elsewhere.
_CAUTION_ORDER = {StepCoverage.MISSING: 0, StepCoverage.PARTIAL: 1, StepCoverage.COVERED: 2}


def _vote_step_coverage(
    draft_text: str,
    step: ReferenceStep,
    all_step_names: list[str],
    reference_subject: str,
) -> tuple[StepCoverage, int | None]:
    """One failed vote no longer fails the whole step (or, previously, the
    whole request) - live-confirmed the self-hosted model's rare per-call
    stall becomes near-certain to hit AT LEAST ONE of the ~30 coverage
    calls a longer draft needs (10 steps x 3 votes), so a single call's
    retry-exhausted failure must degrade gracefully, not abort everything.
    Only when every one of this step's votes fails is there truly nothing
    to go on - that step alone becomes NOT_ASSESSED; every other step
    (and the request as a whole) is unaffected."""
    votes = []
    for _ in range(_COVERAGE_VOTES):
        try:
            votes.append(
                llm_client.classify_step_coverage(draft_text, step.step, step.example, all_step_names, reference_subject)
            )
        except LLMUnavailableError as exc:
            log.warning("a coverage vote for step %r failed, continuing with the remaining votes: %s", step.step, exc)
    if not votes:
        return StepCoverage.NOT_ASSESSED, None
    counts = Counter(coverage for coverage, _ in votes)
    top_count = max(counts.values())
    winners = [coverage for coverage, n in counts.items() if n == top_count]
    winning_coverage = winners[0] if len(winners) == 1 else min(winners, key=lambda c: _CAUTION_ORDER[c])
    section_index = next(idx for coverage, idx in votes if coverage == winning_coverage)
    return winning_coverage, section_index


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

    sections = text_checks.split_sections(draft_text)
    check_dominance = len(sections) >= _MIN_SECTIONS_FOR_DOMINANCE_CHECK
    other_terms_list = (
        [text_checks.significant_words(s.example) for s in all_steps if s is not step]
        if check_dominance
        else []
    )
    for section in sections:
        section_terms = text_checks.significant_words(section)
        overlap = len(step_terms & section_terms)
        if overlap < _MIN_SHARED_TERMS_FOR_TRUST:
            continue
        dominated_by_another_step = check_dominance and any(
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
        coverage, section_index = _vote_step_coverage(draft_text, step, all_step_names, structure.question)
        # Deterministic safety net: never let the LLM credit a step whose
        # topic has no real textual presence anywhere in the draft - only
        # ever downgrades toward "missing", never promotes away from it.
        # Never applied to NOT_ASSESSED - there's no LLM judgment here to
        # second-guess, and doing so would silently turn "couldn't verify"
        # into "confirmed missing", exactly what NOT_ASSESSED exists to
        # avoid.
        if (
            coverage not in (StepCoverage.MISSING, StepCoverage.NOT_ASSESSED)
            and not _has_textual_evidence(step, draft_text, structure.steps)
        ):
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
    # A NOT_ASSESSED step falls through to PARTIAL below, same as a
    # genuinely partial one: it's neither COVERED (so COMPLETE is correctly
    # withheld - the polish-gating rule in main.py must never treat an
    # unconfirmed step as "done") nor MISSING (so INCOMPLETE is correctly
    # withheld too - nothing confirms it's actually absent). The per-step
    # `steps[]` array still reports it honestly as its own distinct value;
    # only this summary rollup, already lossy by design, folds it in here.
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
        if not outcome.no_match:
            # A real conflict between candidates, or the classification
            # call itself failing - neither means "this topic isn't
            # covered", so neither gets the generic fallback.
            return StructuralValidationResult(status=outcome.status, clarification_reason=outcome.reason)
        structure = _generic_fallback_structure(question)
    else:
        structure = outcome.structure
    # score_coverage() no longer raises LLMUnavailableError - a step whose
    # every vote fails becomes NOT_ASSESSED instead (see
    # _vote_step_coverage), so one bad call can no longer abort the whole
    # validation the way it used to.
    steps, section_indices = score_coverage(draft_text, structure)

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


_cache = ResultCache()


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
    with each other.

    Only complete/partial/incomplete are cached - needs_clarification and
    reference_data_unavailable can both stem from a transient failure
    (an LLM call erroring, not a genuine "no match"), and caching that
    would permanently stick a bad answer to this input until the next
    restart (Revision 18). A result with any NOT_ASSESSED step is the
    same kind of transient failure wearing a "partial"/"incomplete"
    status - also excluded from caching for the identical reason, even
    though every *other* step in it may be a perfectly good, stable
    judgment. Tests must clear this between cases - see conftest.py."""
    def _compute():
        dataset = reference_data.get_cached_dataset()
        return validate_structure(question, draft_text, dataset)

    def _is_stable(r: StructuralValidationResult) -> bool:
        if r.status in (StructuralValidationStatus.NEEDS_CLARIFICATION, StructuralValidationStatus.REFERENCE_DATA_UNAVAILABLE):
            return False
        return not any(s.coverage == StepCoverage.NOT_ASSESSED for s in r.steps or [])

    return _cache.get_or_compute((question, draft_text), _compute, _is_stable)


validate_structure_cached.cache_clear = _cache.cache_clear
