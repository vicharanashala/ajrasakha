from enum import Enum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every model that crosses the HTTP boundary - the frontend
    (and every other response shape in this app, e.g. IAnswer/SourceItem)
    uses camelCase, so the wire format does too. populate_by_name=True
    means internal Python code still constructs these with snake_case
    keyword args; only the JSON on the wire is camelCase."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReferenceStep(BaseModel):
    """One expected step of the fixed, domain-neutral checklist every
    draft is scored against (structural_validator.FIXED_STEPS) - no
    longer tied to a per-question matched CSV reference (explicit team
    simplification: same checklist for every request, regardless of
    subject)."""

    sl_no: int
    step: str
    example: str
    suggestion_1: str | None = None
    suggestion_2: str | None = None


# ---- Phase 2: language polishing + technical-content guardrail ----


class CheckStatus(str, Enum):
    UNCHANGED = "unchanged"
    CHANGED = "changed"
    NA = "n/a"  # nothing of this category was present to compare
    NOT_RUN = "not_run"  # this layer could not execute (e.g. a dependency errored)


class CheckedTokens(CamelModel):
    numbers_and_units: CheckStatus = CheckStatus.NA
    chemical_names: CheckStatus = CheckStatus.NA
    certainty_language: CheckStatus = CheckStatus.NA
    negation: CheckStatus = CheckStatus.NA
    crop_names: CheckStatus = CheckStatus.NA
    treatment_identity: CheckStatus = CheckStatus.NA
    timing: CheckStatus = CheckStatus.NA
    conditions: CheckStatus = CheckStatus.NA
    sentence_alignment: CheckStatus = CheckStatus.NA

    def any_failed(self) -> bool:
        """A required check that is CHANGED or NOT_RUN both reject the
        rewrite - 'not_run' is a visible status for debugging, never a
        silent pass (Writing Assistant Build Plan, preservation policy)."""
        return any(v in (CheckStatus.CHANGED, CheckStatus.NOT_RUN) for v in self.model_dump().values())

    def any_changed(self) -> bool:
        """True only when a check actually ran and found a difference -
        distinct from any_failed(), which also counts 'could not verify'
        (NOT_RUN). Used to tell 'we found a problem' apart from 'we
        couldn't finish checking' at the top level (Writing Assistant
        Build Plan, Revision 14)."""
        return any(v == CheckStatus.CHANGED for v in self.model_dump().values())


class GuardrailStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"


class GuardrailResult(CamelModel):
    status: GuardrailStatus
    checked_tokens: CheckedTokens
    # True only when a check actually found a difference (a real catch) -
    # False when status is FAILED purely because something could not be
    # verified (e.g. a dependency outage, an uncertain alignment). Lets
    # operations.py report "unavailable" instead of "rejected" when
    # nothing was actually found wrong, only unverifiable.
    confirmed_change: bool = False
    details: list[str] = []
    disclaimer: str = (
        "These checks reduce the risk of an unintended technical change; "
        "they do not prove complete semantic equivalence."
    )


class LanguagePolishingStatus(str, Enum):
    SUGGESTED = "suggested"
    REJECTED = "rejected"
    UNAVAILABLE = "unavailable"
    # Not attempted at all - distinct from UNAVAILABLE (a check that ran but
    # couldn't be completed). Team requirement: polish is only offered once
    # structural validation finds every step covered; a draft missing or
    # partially covering steps gets the step report, never a polish
    # suggestion, so running the LLM rewrite for it would be wasted latency.
    SKIPPED = "skipped"


class LanguagePolishingResult(CamelModel):
    status: LanguagePolishingStatus
    suggested_text: str | None = None
    reason: str | None = None
    guardrail: GuardrailResult | None = None


class LLMUnavailableError(Exception):
    """Raised when the MiniMax call itself cannot complete (network error,
    timeout, bad response shape). Callers must treat this as a failure to
    reject-and-explain, never as permission to skip the guardrail."""


# ---- Phase 3: structural coverage validation ----


class StepCoverage(str, Enum):
    COVERED = "covered"
    PARTIAL = "partial"
    MISSING = "missing"
    # Every majority-vote call for this step failed (self-hosted model
    # timeout) - distinct from MISSING on purpose, same reasoning as
    # CheckStatus.NOT_RUN above: "could not verify" must never be
    # reported as "confirmed absent" (Writing Assistant Build Plan,
    # ISS-01/03's "never conflate" principle, applied here too). A draft
    # that genuinely covers this step would otherwise be told it's
    # missing just because the LLM stalled on it.
    NOT_ASSESSED = "not_assessed"


class StepCoverageResult(CamelModel):
    sl_no: int
    step: str
    coverage: StepCoverage
    example: str
    suggestion_1: str | None = None
    suggestion_2: str | None = None


class StructuralValidationStatus(str, Enum):
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"
    PARTIAL = "partial"


class StructuralValidationResult(CamelModel):
    status: StructuralValidationStatus
    # Always populated - the fixed checklist is scored on every request,
    # unconditionally (no more "nothing to check" outcome).
    steps: list[StepCoverageResult]
    # Populated only when a step's position in the draft can be confidently
    # located and is out of order relative to an earlier-slNo step that was
    # also located - never fabricated for a step scored "missing" (it has
    # no position to compare). A separate field from `coverage`, never
    # merged into it (Writing Assistant Build Plan, Revision 14, ISS-06).
    order_warnings: list[str] = []


# ---- Phase 4: the HTTP contract ----


class PolishDraftRequest(CamelModel):
    question: str
    draft: str


class PolishDraftResponse(CamelModel):
    request_id: str
    language_polishing: LanguagePolishingResult
    structural_validation: StructuralValidationResult
    warnings: list[str] = []
    errors: list[str] = []
