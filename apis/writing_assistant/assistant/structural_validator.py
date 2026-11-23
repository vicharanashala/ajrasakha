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
# RL-01/02/03 flapping case). Majority-voting trades extra latency for
# stability on borderline cases - it cannot fix the model's own
# instability, only reduce how often it changes the answer we show.
#
# Re-architected from per-step voting to per-CALL voting: a single call
# (llm_client.classify_all_steps_coverage) now scores every step in the
# checklist at once, so "3 votes" means up to 3 full-checklist calls,
# not 30 (10 steps x 3). Votes 1 and 2 run concurrently; a 3rd call only
# fires if some step's votes 1 and 2 disagree (or an attempt failed
# outright) - on a draft where every step already agrees 2-for-2
# (the common case), this costs 2 calls total for the ENTIRE checklist,
# versus up to 30 before. Live-confirmed this doesn't trade away quality:
# the combined call correctly handled a complete draft, a partial draft,
# a mislabeled-heading draft, and a wrong-topic draft in testing.
#
# Trade-off this correlates that per-step voting didn't: a failed call
# attempt now costs a vote for EVERY step at once, not just one unlucky
# step - but the fail-closed guarantee is unchanged (a step still needs
# ALL attempts to come back with no answer for it before it's
# NOT_ASSESSED), and going from ~30 calls to ~2-3 means far fewer chances
# for any single attempt to fail in the first place.
_CHECKLIST_VOTES = 3

# Tie-break for a genuine 3-way split (one vote each) - pick the most
# cautious answer rather than an arbitrary one, consistent with this
# service's fail-closed philosophy elsewhere.
_CAUTION_ORDER = {StepCoverage.MISSING: 0, StepCoverage.PARTIAL: 1, StepCoverage.COVERED: 2}


def _attempt_checklist(
    draft_text: str, question: str, steps: list[ReferenceStep], all_step_names: list[str]
) -> dict[str, tuple[StepCoverage, int | None]] | None:
    """One full-checklist call attempt. Returns None (not an exception) on
    failure so callers can treat a failed attempt as "no votes from this
    attempt" without a try/except at every call site."""
    try:
        return llm_client.classify_all_steps_coverage(draft_text, question, steps, all_step_names)
    except LLMUnavailableError as exc:
        log.warning("a full-checklist coverage call failed, continuing with the remaining attempts: %s", exc)
        return None


def _resolve_step_votes(votes: list[tuple[StepCoverage, int | None]]) -> tuple[StepCoverage, int | None]:
    """Majority-vote across whichever attempts actually produced an
    answer for this one step. Only when every attempt either failed
    outright or omitted this step from its response is there truly
    nothing to go on - NOT_ASSESSED."""
    if not votes:
        return StepCoverage.NOT_ASSESSED, None
    counts = Counter(coverage for coverage, _ in votes)
    top_count = max(counts.values())
    winners = [coverage for coverage, n in counts.items() if n == top_count]
    winning_coverage = winners[0] if len(winners) == 1 else min(winners, key=lambda c: _CAUTION_ORDER[c])
    section_index = next(idx for coverage, idx in votes if coverage == winning_coverage)
    return winning_coverage, section_index


def _vote_checklist(
    draft_text: str, question: str, steps: list[ReferenceStep], all_step_names: list[str]
) -> tuple[dict[str, tuple[StepCoverage, int | None]], bool]:
    """Runs up to _CHECKLIST_VOTES full-checklist calls (see this module's
    own comment above _CHECKLIST_VOTES for why this is a call-level vote,
    not a per-step one) and resolves each step's own majority across
    whichever attempts actually answered for it.

    Also returns whether the result is corroborated: every step's winning
    verdict was backed by at least 2 agreeing votes. Not corroborated means
    the answer rests on a single vote for some step - e.g. votes 1 and 2
    both timed out and only the fallback 3rd call answered (live-confirmed
    on a slow host, where that lone vote marked a well-structured draft
    missing on every step), or a 3-way split resolved by the caution
    tie-break. Still returned to the caller, but never cached (see
    validate_structure_cached)."""
    first_two = llm_client.run_concurrent(
        [lambda: _attempt_checklist(draft_text, question, steps, all_step_names) for _ in range(2)]
    )
    votes_by_step: dict[str, list[tuple[StepCoverage, int | None]]] = {s.step: [] for s in steps}
    for attempt_result in first_two:
        if attempt_result is None:
            continue
        for step in steps:
            if step.step in attempt_result:
                votes_by_step[step.step].append(attempt_result[step.step])

    # A 3rd call is a full-checklist call too (scores every step, not
    # just the disagreeing ones), so it's cheap to fire whenever ANY step
    # still needs it - either a genuine disagreement between votes 1 and
    # 2, or an attempt that failed/omitted a step and left it with fewer
    # than 2 votes so far.
    needs_third = any(
        len(votes_by_step[s.step]) < 2 or len({v[0] for v in votes_by_step[s.step]}) > 1
        for s in steps
    )
    if needs_third:
        third = _attempt_checklist(draft_text, question, steps, all_step_names)
        if third is not None:
            for step in steps:
                if step.step in third:
                    votes_by_step[step.step].append(third[step.step])

    resolved = {step.step: _resolve_step_votes(votes_by_step[step.step]) for step in steps}
    corroborated = all(
        sum(1 for coverage, _ in votes_by_step[s.step] if coverage == resolved[s.step][0]) >= 2 for s in steps
    )
    return resolved, corroborated


def score_coverage(
    draft_text: str, question: str, steps: list[ReferenceStep] = FIXED_STEPS
) -> tuple[list[StepCoverageResult], list[int | None], bool]:
    """Scores `steps` (defaults to the full FIXED_STEPS checklist) against
    the draft. A caller-supplied subset (PolishDraftRequest.skip_steps,
    see validate_structure) still carries every other step's name as
    context for the model - a step dropped from the list we actually
    score is not dropped from what the model is told exists, since that
    context is what tells "this is step N's own topic" apart from "this
    merely overlaps a different step" (see classify_all_steps_coverage's
    own docstring). The third return value is _vote_checklist's
    corroborated flag."""
    all_step_names = [s.step for s in FIXED_STEPS]
    vote_results, corroborated = _vote_checklist(draft_text, question, steps, all_step_names)
    results = []
    section_indices: list[int | None] = []
    for step in steps:
        coverage, section_index = vote_results[step.step]
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
    return results, section_indices, corroborated


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


def validate_structure(
    question: str, draft_text: str, skip_steps: list[str] | None = None
) -> StructuralValidationResult:
    """skip_steps names steps that don't apply to this draft (caller-
    reported, e.g. PolishDraftRequest.skip_steps) - they're simply never
    checked, so a draft missing them is never counted as incomplete for
    them, and no call is made for them at all. An unrecognized name is a
    no-op, not an error - logged so a caller-side typo is still visible
    somewhere, but it doesn't fail or change the rest of the request."""
    return _validate_structure(question, draft_text, skip_steps)[0]


def _validate_structure(
    question: str, draft_text: str, skip_steps: list[str] | None
) -> tuple[StructuralValidationResult, bool]:
    """validate_structure plus _vote_checklist's corroborated flag, which
    validate_structure_cached needs and the HTTP response doesn't."""
    steps_to_check = FIXED_STEPS
    if skip_steps:
        skip_set = set(skip_steps)
        unknown = skip_set - {s.step for s in FIXED_STEPS}
        if unknown:
            log.warning("skip_steps named unrecognized step(s), ignoring: %s", sorted(unknown))
        steps_to_check = [s for s in FIXED_STEPS if s.step not in skip_set]

    steps, section_indices, corroborated = score_coverage(draft_text, question, steps_to_check)
    result = StructuralValidationResult(
        status=_summarize(steps),
        steps=steps,
        order_warnings=_order_warnings(steps, section_indices),
    )
    return result, corroborated


_cache = ResultCache()


def validate_structure_cached(
    question: str, draft_text: str, skip_steps: list[str] | None = None
) -> StructuralValidationResult:
    """Deterministic entry point for the HTTP endpoint: the exact same
    (question, draft, skip_steps) triple always returns the exact same
    result within this process - closes the "identical input gives a
    different result on repeated calls" gap (Writing Assistant Build
    Plan, Revision 17, ISS-04/ISS-11) for the literal repeated-request
    case the real test report exercised (RL-01/02/03, QT-01 vs AS-01 vs
    AG-02 with the same text). skip_steps is part of the cache key (order-
    independent - normalized to a sorted tuple) because two requests for
    the same draft with different skip_steps are not the same request;
    they check a different subset of the checklist. Not a staleness risk -
    (question, draft, skip_steps) is the cache key, so a changed draft or
    a changed skip_steps is a cache miss by construction. Does not and
    cannot make the model's judgment on two *different*-but-similar
    drafts consistent with each other.

    Only a corroborated result is cached (see _vote_checklist): every
    step's verdict backed by at least 2 agreeing votes. That excludes a
    result with any NOT_ASSESSED step - a transient failure (an LLM call
    erroring, not a genuine judgment) wearing a "partial"/"incomplete"
    status, which would permanently stick a bad answer to this input
    until the next restart (Revision 18) - and also one resting on a
    single surviving vote, which is a real judgment but an uncorroborated
    one. Tests must clear this between cases - see conftest.py."""
    def _compute():
        return _validate_structure(question, draft_text, skip_steps)

    cache_key = (question, draft_text, tuple(sorted(skip_steps)) if skip_steps else ())
    return _cache.get_or_compute(cache_key, _compute, lambda r: r[1])[0]


validate_structure_cached.cache_clear = _cache.cache_clear
