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
    # couldn't be completed). Two different reasons share this one status
    # (see reason for which): (1) team requirement - polish is only offered
    # once structural validation finds every step covered, so a draft
    # missing or partially covering steps gets the step report, never a
    # polish suggestion, since running the LLM rewrite for it would be
    # wasted latency; (2) PolishDraftRequest.skip_polish - the caller
    # explicitly only wanted the structural checklist this request.
    SKIPPED = "skipped"


class PolishChange(CamelModel):
    """One spot where suggested_text actually differs from the original
    draft - same alignment granularity the guardrail verifies against
    (text_checks.align_sections_and_sentences: sentence-level within a
    section, falling back to a whole section or whole document only on a
    sentence-/section-count mismatch), so a change shown here is always
    at the same granularity the guardrail actually checked, never a
    separately-invented diff."""

    before: str
    after: str


class LanguagePolishingResult(CamelModel):
    status: LanguagePolishingStatus
    suggested_text: str | None = None
    reason: str | None = None
    guardrail: GuardrailResult | None = None
    # Populated only when status is SUGGESTED - the specific before/after
    # pairs where the rewrite actually differs from the original, so a
    # reviewer doesn't have to diff the whole document by hand. None
    # whenever no rewrite is shown (rejected/unavailable/skipped) - a
    # rejected suggestedText is never shown to the client either, and
    # changes against a rewrite nobody sees would be meaningless. Still a
    # real, populated list (possibly empty, if the rewrite is byte-
    # identical to the original - e.g. a draft that needed no fix at
    # all) whenever status IS suggested; never fabricated.
    changes: list[PolishChange] | None = None


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
    # The caller explicitly asked to skip structural checking entirely
    # (PolishDraftRequest.skip_structural_validation) - distinct from
    # every other status, which all imply the checklist actually ran.
    # Never silently omitted: structuralValidation stays a required
    # response field, so a caller always sees that this didn't run,
    # rather than guessing from an empty steps list.
    SKIPPED = "skipped"


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
    # Step names (must match structural_validator.FIXED_STEPS' own "step"
    # text) that don't apply to this particular draft, so they're never
    # checked at all - cuts structural-validation calls proportionally.
    # An unrecognized name is a no-op (logged, not an error) rather than
    # failing the whole request over a caller-side typo. Defaults to
    # empty, so an existing caller sending neither new field gets today's
    # exact behavior unchanged.
    skip_steps: list[str] = []
    # True skips structural validation entirely (0 of its calls) and goes
    # straight to polishing - for a caller who is already confident the
    # draft's structure is fine and only wants language polishing.
    # Bypasses the "only polish once structure is complete" gate, since
    # the caller is the one vouching for completeness here, not this
    # service. Defaults to False (today's behavior: always check first).
    skip_structural_validation: bool = False
    # True skips the technical-content preservation guardrail entirely -
    # suggestedText is returned as soon as generate_polish produces one,
    # with no check that it preserved facts/dosages/recommendations. For
    # a caller who is already confident the rewrite is safe (or wants to
    # verify it some other way) and would rather not risk the guardrail's
    # own false-positive rate rejecting a genuinely safe polish.
    # guardrail stays None on the response in this case (same nullable
    # field already used for "no guardrail ran" elsewhere), with reason
    # saying explicitly that it was skipped by request - never silently
    # indistinguishable from a guardrail that actually ran and passed.
    # Defaults to False (today's behavior: always verify).
    skip_guardrail: bool = False
    # True skips language polishing entirely (generate_polish, and
    # therefore the guardrail too, never run) - the inverse of
    # skip_structural_validation, for a caller who only wants the
    # structural checklist this request and has no use for a polish
    # suggestion. Saves generate_polish's ~10-20 calls (rewrite +
    # guardrail second-opinion). languagePolishing.status comes back
    # SKIPPED either way this request never attempted a rewrite, with
    # `reason` distinguishing this from the pre-existing "structure was
    # incomplete" SKIPPED case. Independent of skip_structural_validation
    # and skip_guardrail - combining skip_structural_validation=true with
    # skip_polish=true is a valid (if unusual) way to ask for neither
    # check to run at all; both fields on the response then honestly
    # report "skipped", nothing more. Defaults to False (today's
    # behavior: always attempt polish once structure is complete).
    skip_polish: bool = False


class PolishDraftResponse(CamelModel):
    request_id: str
    language_polishing: LanguagePolishingResult
    structural_validation: StructuralValidationResult
    warnings: list[str] = []
    errors: list[str] = []
