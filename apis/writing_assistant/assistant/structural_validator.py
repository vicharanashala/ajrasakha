"""Structural validation: score the draft's coverage of one fixed,
domain-neutral checklist of expected steps (FIXED_STEPS below), using LLM
reasoning to judge real content validity per step - not just presence.
Never generates new agricultural content and never fills a missing step,
only identifies coverage (Writing Assistant Build Plan, "Separate
responsibilities").

Simplified by explicit team decision: no CSV-based domain/topic/crop
matching - the same fixed checklist is used for every request, regardless
of subject. The Golden Database CSVs this project used to match against
(reference_data.py, reference_selector.py - both removed) were only ever
an EXAMPLE of the shape of a human-approved full written answer, used to
design the checklist and system prompt below - never meant to be a live,
per-question reference lookup.
"""

import logging
from collections import Counter

from . import llm_client
from .result_cache import ResultCache
from .models import (
    LLMUnavailableError,
    ReferenceStep,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)

log = logging.getLogger("writing_assistant.structural_validator")

# One fixed, domain-neutral checklist, used for every request regardless
# of subject (explicit team decision, not a per-topic template). Wording
# is generalized off a concrete pest-management example the team gave
# (Introduction / major-or-minor / identification / severity / action
# threshold / escalating response options / safety / conclusion) so it
# reads sensibly for any agricultural advisory topic, not just pests.
FIXED_STEPS = [
    ReferenceStep(
        sl_no=1, step="Introduction",
        example="States the specific problem or question being addressed and gives a brief overview of "
        "the approach the rest of the answer will take.",
        suggestion_1="Name the specific issue or topic directly instead of opening with generic background.",
    ),
    ReferenceStep(
        sl_no=2, step="Is this a major or minor problem",
        example="Explains how significant, urgent, or widespread this issue typically is, so the reader "
        "understands how much it matters.",
        suggestion_1="State plainly whether this is generally a major or minor concern.",
    ),
    ReferenceStep(
        sl_no=3, step="Confirm the identification first",
        example="Helps the reader confirm exactly what they are dealing with (the specific pest, disease, "
        "situation, or eligibility condition) before acting on the rest of the answer.",
        suggestion_1="Give concrete signs or criteria the reader can check to confirm this applies to them.",
    ),
    ReferenceStep(
        sl_no=4, step="Severity - impact if uncontrolled",
        example="Describes the concrete consequences of leaving the issue unaddressed.",
        suggestion_1="State the specific downside of not acting, not just that it 'should be addressed'.",
    ),
    ReferenceStep(
        sl_no=5, step="Decision point - when to move to chemical control",
        example="Gives a clear threshold or trigger for when the reader should actually take the strongest "
        "action, rather than acting on every small occurrence.",
        suggestion_1="State a specific threshold, condition, or signal, not just 'if needed'.",
    ),
    ReferenceStep(
        sl_no=6, step="Cultural control",
        example="Describes the least invasive, lowest-cost, or most preventive measures appropriate to "
        "this specific topic, to try before anything stronger.",
        suggestion_1="Name at least one concrete preventive or low-intervention measure for this topic.",
    ),
    ReferenceStep(
        sl_no=7, step="Biological control",
        example="Describes additional measures beyond the lowest-intervention option - alternative "
        "approaches or supporting actions appropriate to the topic.",
        suggestion_1="Name a specific supporting measure, distinct from the previous step.",
    ),
    ReferenceStep(
        sl_no=8, step="Chemical control (once threshold crossed)",
        example="Describes the strongest or most direct action to take once the decision threshold from "
        "the earlier step is actually crossed.",
        suggestion_1="Make clear this is conditional on the threshold being crossed, and name the action.",
    ),
    ReferenceStep(
        sl_no=9, step="Safety and PHI",
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
    question: str,
) -> tuple[StepCoverage, int | None]:
    """One failed vote no longer fails the whole step (or, previously, the
    whole request) - live-confirmed the self-hosted model's rare per-call
    stall becomes near-certain to hit AT LEAST ONE of the ~30 coverage
    calls a full request needs (10 steps x 3 votes), so a single call's
    retry-exhausted failure must degrade gracefully, not abort everything.
    Only when every one of this step's votes fails is there truly nothing
    to go on - that step alone becomes NOT_ASSESSED; every other step
    (and the request as a whole) is unaffected."""
    votes = []
    for _ in range(_COVERAGE_VOTES):
        try:
            votes.append(
                llm_client.classify_step_coverage(draft_text, step.step, step.example, all_step_names, question)
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


def score_coverage(draft_text: str, question: str) -> tuple[list[StepCoverageResult], list[int | None]]:
    results = []
    section_indices: list[int | None] = []
    all_step_names = [s.step for s in FIXED_STEPS]
    for step in FIXED_STEPS:
        coverage, section_index = _vote_step_coverage(draft_text, step, all_step_names, question)
        # No deterministic textual-evidence override here (removed) - that
        # safety net compared the draft against the STEP'S OWN example
        # text, which worked when examples were curated, topic-specific
        # reference content (e.g. "Sheath Blight (Rhizoctonia solani)...")
        # that a matching real draft would naturally reuse vocabulary
        # from. FIXED_STEPS' examples are deliberately abstract and
        # domain-neutral instead (by design - the same checklist applies
        # to any topic), so they share essentially no vocabulary with any
        # real draft's topic-specific content - live-confirmed this wrongly
        # downgraded 6 of 10 genuinely-covered steps on a real, complete
        # draft to "missing". The majority-voted LLM judgment alone is the
        # only coverage signal now.
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


def validate_structure(question: str, draft_text: str) -> StructuralValidationResult:
    steps, section_indices = score_coverage(draft_text, question)
    return StructuralValidationResult(
        status=_summarize(steps),
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
    a changed draft is a cache miss by construction. Does not and cannot
    make the model's judgment on two *different*-but-similar drafts
    consistent with each other.

    A result with any NOT_ASSESSED step is excluded from caching - it's a
    transient failure (an LLM call erroring, not a genuine judgment)
    wearing a "partial"/"incomplete" status, and caching it would
    permanently stick a bad answer to this input until the next restart
    (Revision 18), even though every *other* step in it may be a
    perfectly good, stable judgment. Tests must clear this between cases
    - see conftest.py."""
    def _compute():
        return validate_structure(question, draft_text)

    def _is_stable(r: StructuralValidationResult) -> bool:
        return not any(s.coverage == StepCoverage.NOT_ASSESSED for s in r.steps)

    return _cache.get_or_compute((question, draft_text), _compute, _is_stable)


validate_structure_cached.cache_clear = _cache.cache_clear
