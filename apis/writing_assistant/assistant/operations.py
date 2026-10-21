"""Language-polishing orchestration: generate a candidate rewrite, run it
through the technical-content guardrail, and decide suggested/rejected/
unavailable. The original draft is never touched here or anywhere else in
this service - only the author's own explicit acceptance (outside this
service, in the backend) changes it.
"""

from . import guardrails, llm_client
from .models import LanguagePolishingResult, LanguagePolishingStatus, LLMUnavailableError


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
        return LanguagePolishingResult(
            status=LanguagePolishingStatus.REJECTED,
            suggested_text=None,
            reason="The rewrite was rejected because a technical-content preservation check "
            "failed or could not be completed. " + " ".join(guardrail_result.details),
            guardrail=guardrail_result,
        )

    return LanguagePolishingResult(
        status=LanguagePolishingStatus.SUGGESTED,
        suggested_text=suggested_text,
        reason=None,
        guardrail=guardrail_result,
    )
