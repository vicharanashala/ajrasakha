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


class SourceType(str, Enum):
    DOMAIN = "domain"
    DIRECT_TOPIC = "direct_topic"
    CROP_VARIANT = "crop_variant"
    # Team Question.csv has no Domain/Code key at all (verified - Writing
    # Assistant Build Plan, CSV findings). It is a calibration/test corpus,
    # never a live reference-selection candidate - reference_selector must
    # never return this source type as a match.
    TEAM_QUESTION = "team_question"


class QuestionType(str, Enum):
    BROAD = "Broad"
    NARROW = "Narrow"


class ReferenceStep(BaseModel):
    sl_no: int
    step: str
    example: str
    suggestion_1: str | None = None
    suggestion_2: str | None = None


class ReferenceStructure(BaseModel):
    source_type: SourceType
    domain: str | None = None
    code: str | None = None
    question_type: QuestionType | None = None
    crop: str | None = None
    question: str
    full_written_answer: str
    steps: list[ReferenceStep]


class ReferenceDataset(BaseModel):
    structures: list[ReferenceStructure]
    # None for the local-directory source (no release concept there).
    release_id: str | None = None


class ReferenceDataUnavailableError(Exception):
    """Raised whenever the reference dataset cannot be loaded or fails
    validation. Callers must treat this as 'reference_data_unavailable',
    never as 'no reference applies' - the two are different outcomes."""


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


class GuardrailStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"


class GuardrailResult(CamelModel):
    status: GuardrailStatus
    checked_tokens: CheckedTokens
    details: list[str] = []
    disclaimer: str = (
        "These checks reduce the risk of an unintended technical change; "
        "they do not prove complete semantic equivalence."
    )


class LanguagePolishingStatus(str, Enum):
    SUGGESTED = "suggested"
    REJECTED = "rejected"
    UNAVAILABLE = "unavailable"


class LanguagePolishingResult(CamelModel):
    status: LanguagePolishingStatus
    suggested_text: str | None = None
    reason: str | None = None
    guardrail: GuardrailResult | None = None


class LLMUnavailableError(Exception):
    """Raised when the MiniMax call itself cannot complete (network error,
    timeout, bad response shape). Callers must treat this as a failure to
    reject-and-explain, never as permission to skip the guardrail."""


# ---- Phase 3: structural reference selection + coverage validation ----


class SelectionClassification(BaseModel):
    """The LLM's structured domain/topic/crop classification of a question
    against the candidates it was shown. reference_selector.py applies the
    deterministic precedence rules on top of this - the LLM only classifies,
    it never decides precedence."""

    domain: str | None = None
    question_type: QuestionType | None = None
    matched_direct_topic: int | None = None
    ambiguous_direct_topics: list[int] = []
    matched_crop_variants: list[int] = []


class MatchedReference(CamelModel):
    source_type: SourceType
    domain: str | None = None
    code: str | None = None
    question_type: QuestionType | None = None
    crop: str | None = None


class StepCoverage(str, Enum):
    COVERED = "covered"
    PARTIAL = "partial"
    MISSING = "missing"


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
    NEEDS_CLARIFICATION = "needs_clarification"
    REFERENCE_DATA_UNAVAILABLE = "reference_data_unavailable"


class StructuralValidationResult(CamelModel):
    status: StructuralValidationStatus
    matched_reference: MatchedReference | None = None
    steps: list[StepCoverageResult] | None = None
    clarification_reason: str | None = None


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
