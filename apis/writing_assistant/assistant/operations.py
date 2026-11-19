"""Language-polishing orchestration: generate a candidate rewrite, run it
through the technical-content guardrail, and decide suggested/rejected/
unavailable. The original draft is never touched here or anywhere else in
this service - only the author's own explicit acceptance (outside this
service, in the backend) changes it.
"""

from . import guardrails, llm_client, text_checks
from .models import (
    LanguagePolishingResult,
    LanguagePolishingStatus,
    LLMUnavailableError,
    PolishChange,
    StructuralValidationResult,
    StructuralValidationStatus,
)
from .result_cache import ResultCache

_cache = ResultCache()


def skipped_due_to_incomplete_structure(structural_result: StructuralValidationResult) -> LanguagePolishingResult:
    """Team requirement: for every request, only offer a polish suggestion
    once structural validation says every step is covered - otherwise skip
    the rewrite entirely (not just withhold it) and let the step report be
    the whole answer."""
    if structural_result.status == StructuralValidationStatus.COMPLETE:
        raise ValueError("structural validation is complete - polishing should not be skipped")

    gaps = [s.step for s in structural_result.steps if s.coverage.value in ("missing", "partial")]
    unconfirmed = [s.step for s in structural_result.steps if s.coverage.value == "not_assessed"]
    # Kept as two separate clauses on purpose - "not_assessed" means a
    # check failed, not that the step is actually missing/partial;
    # conflating them would misreport a real gap where there may be
    # none (same "never conflate" principle as the NOT_ASSESSED/
    # CheckStatus.NOT_RUN states themselves).
    clauses = []
    if gaps:
        clauses.append("missing or partial step(s): " + "; ".join(gaps))
    if unconfirmed:
        clauses.append("step(s) that could not be checked due to a failed dependency: " + "; ".join(unconfirmed))
    reason = "Structural validation found " + " and ".join(clauses) + ", so a polish suggestion was not generated."

    return LanguagePolishingResult(
        status=LanguagePolishingStatus.SKIPPED,
        suggested_text=None,
        reason=reason,
        guardrail=None,
    )


def polish_skipped_at_callers_request() -> LanguagePolishingResult:
    """PolishDraftRequest.skip_polish - the caller only wanted the
    structural checklist this request and has no use for a polish
    suggestion. Saves generate_polish's ~10-20 calls (rewrite + guardrail
    second-opinion) entirely rather than computing one and discarding it -
    same reasoning as skipped_due_to_incomplete_structure above, just
    triggered by the caller instead of the structural result. Reuses the
    same SKIPPED status (both mean "polishing was never attempted"); the
    reason text is what tells the two apart."""
    return LanguagePolishingResult(
        status=LanguagePolishingStatus.SKIPPED,
        suggested_text=None,
        reason="Language polishing was skipped at the caller's request.",
        guardrail=None,
    )


def polish_draft_cached(draft_text: str, skip_guardrail: bool = False) -> LanguagePolishingResult:
    """Deterministic entry point for the HTTP endpoint: the exact same
    (draft, skip_guardrail) pair always returns the exact same result
    within this process - closes the "identical input gives a different
    result on repeated calls" gap (Writing Assistant Build Plan,
    Revision 17, ISS-04/ISS-11) for the literal repeated-request case
    the real test report exercised. skip_guardrail is part of the cache
    key because two requests for the same draft with different
    skip_guardrail settings are not the same request - one is verified,
    the other isn't. Not a staleness risk - the cache key changes
    whenever either input does, so a changed draft or changed
    skip_guardrail is a cache miss by construction. Does not and cannot
    make the underlying model's judgment on two *different*-but-similar
    drafts consistent with each other - that remains an inherent
    property of the model, not something caching fixes.

    Only "suggested"/"rejected" are cached - "unavailable" means a check
    couldn't be completed (often a transient LLM timeout), and caching
    that would permanently stick one bad answer to this draft until the
    next restart (Revision 18). Tests must clear this between cases -
    see conftest.py."""
    return _cache.get_or_compute(
        (draft_text, skip_guardrail),
        lambda: polish_draft(draft_text, skip_guardrail),
        lambda r: r.status != LanguagePolishingStatus.UNAVAILABLE,
    )


polish_draft_cached.cache_clear = _cache.cache_clear


def _compute_changes(original_text: str, rewrite_text: str) -> list[PolishChange]:
    """The specific before/after pairs where suggested_text actually
    differs from the original - reuses the exact same alignment the
    guardrail verifies against (text_checks.align_sections_and_sentences)
    rather than inventing a separate diff, so what's shown to a caller
    always matches what was actually checked, at the same granularity
    (sentence-level within a section, falling back to a whole section or
    whole document on a count mismatch - same degradation the guardrail
    itself falls back to)."""
    pairs, _ = text_checks.align_sections_and_sentences(original_text, rewrite_text)
    return [PolishChange(before=o, after=r) for o, r in pairs if o != r]


def polish_draft(draft_text: str, skip_guardrail: bool = False) -> LanguagePolishingResult:
    try:
        suggested_text, failed_sections = llm_client.generate_polish(draft_text)
    except LLMUnavailableError as exc:
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.UNAVAILABLE,
            suggested_text=None,
            reason=f"The language-polishing check could not be completed: {exc}",
            guardrail=None,
        )

    if failed_sections:
        # A partial rewrite (some sections polished, some kept as-is
        # because their own call failed) must never be reported as
        # "suggested" - that status means a reader can trust the whole
        # text was checked, and a draft that's 90% unchanged typos still
        # looks indistinguishable from a real success without this.
        # Never conflate "couldn't verify this section" with "verified
        # and fine", same principle as structural_validator's
        # NOT_ASSESSED and the chemical guardrail's NOT_RUN.
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.UNAVAILABLE,
            suggested_text=None,
            reason="The language-polishing check could not be completed for section(s) "
            f"{', '.join(str(i) for i in failed_sections)} - showing a partial rewrite "
            "would look complete when it isn't, so no suggestion is shown.",
            guardrail=None,
        )

    if skip_guardrail:
        # Caller explicitly asked to bypass the technical-content
        # preservation check - guardrail stays None (the same nullable
        # value already used for "no guardrail ran" elsewhere), but
        # reason says so explicitly, so this is never silently
        # indistinguishable from a guardrail that actually ran and
        # passed.
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.SUGGESTED,
            suggested_text=suggested_text,
            reason="The technical-content preservation check was skipped at the caller's request.",
            guardrail=None,
            changes=_compute_changes(draft_text, suggested_text),
        )

    guardrail_result = guardrails.run_guardrail(draft_text, suggested_text)

    if guardrail_result.status.value == "failed":
        # A real catch (something actually changed) is "rejected"; a check
        # that merely couldn't be completed (a dependency outage, an
        # uncertain alignment) is "unavailable" - the two look identical to
        # an author unless kept separate (Writing Assistant Build Plan,
        # Revision 14, ISS-01/ISS-03).
        if guardrail_result.confirmed_change:
            return LanguagePolishingResult(
                status=LanguagePolishingStatus.REJECTED,
                suggested_text=None,
                reason="The rewrite was rejected because a technical-content preservation check "
                "found a difference that could change the meaning. " + " ".join(guardrail_result.details),
                guardrail=guardrail_result,
            )
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.UNAVAILABLE,
            suggested_text=None,
            reason="The technical-content preservation check could not be completed, so the "
            "rewrite was not shown. " + " ".join(guardrail_result.details),
            guardrail=guardrail_result,
        )

    return LanguagePolishingResult(
        status=LanguagePolishingStatus.SUGGESTED,
        suggested_text=suggested_text,
        reason=None,
        guardrail=guardrail_result,
        changes=_compute_changes(draft_text, suggested_text),
    )
