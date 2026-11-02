"""Language-polishing orchestration: generate a candidate rewrite, run it
through the technical-content guardrail, and decide suggested/rejected/
unavailable. The original draft is never touched here or anywhere else in
this service - only the author's own explicit acceptance (outside this
service, in the backend) changes it.
"""

from . import guardrails, llm_client
from .models import LanguagePolishingResult, LanguagePolishingStatus, LLMUnavailableError
from .result_cache import ResultCache

_cache = ResultCache()


def polish_draft_cached(draft_text: str) -> LanguagePolishingResult:
    """Deterministic entry point for the HTTP endpoint: the exact same
    draft always returns the exact same result within this process -
    closes the "identical input gives a different result on repeated
    calls" gap (Writing Assistant Build Plan, Revision 17, ISS-04/
    ISS-11) for the literal repeated-request case the real test report
    exercised. Not a staleness risk - the draft text itself is the
    cache key, so a changed draft is a cache miss by construction. Does
    not and cannot make the underlying model's judgment on two
    *different*-but-similar drafts consistent with each other - that
    remains an inherent property of the model, not something caching
    fixes.

    Only "suggested"/"rejected" are cached - "unavailable" means a check
    couldn't be completed (often a transient LLM timeout), and caching
    that would permanently stick one bad answer to this draft until the
    next restart (Revision 18). Tests must clear this between cases -
    see conftest.py."""
    return _cache.get_or_compute(
        draft_text,
        lambda: polish_draft(draft_text),
        lambda r: r.status != LanguagePolishingStatus.UNAVAILABLE,
    )


polish_draft_cached.cache_clear = _cache.cache_clear


def polish_draft(draft_text: str) -> LanguagePolishingResult:
    try:
        suggested_text = llm_client.generate_polish(draft_text)
    except LLMUnavailableError as exc:
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.UNAVAILABLE,
            suggested_text=None,
            reason=f"The language-polishing check could not be completed: {exc}",
            guardrail=None,
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
    )
