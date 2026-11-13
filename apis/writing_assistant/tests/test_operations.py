import pytest

from assistant import chemical_matcher, guardrails, llm_client, operations
from assistant.models import (
    LanguagePolishingStatus,
    LLMUnavailableError,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)


def test_skipped_due_to_incomplete_structure_names_the_gap_steps():
    structural_result = StructuralValidationResult(
        status=StructuralValidationStatus.INCOMPLETE,
        steps=[
            StepCoverageResult(sl_no=1, step="Diagnose", coverage=StepCoverage.COVERED, example="ex"),
            StepCoverageResult(sl_no=2, step="Apply treatment", coverage=StepCoverage.MISSING, example="ex2"),
        ],
    )

    result = operations.skipped_due_to_incomplete_structure(structural_result)

    assert result.status == LanguagePolishingStatus.SKIPPED
    assert result.suggested_text is None
    assert "Apply treatment" in result.reason
    assert "Diagnose" not in result.reason  # only the gap is named, not the covered step


def test_skipped_due_to_incomplete_structure_rejects_a_complete_result():
    structural_result = StructuralValidationResult(status=StructuralValidationStatus.COMPLETE, steps=[])
    with pytest.raises(ValueError):
        operations.skipped_due_to_incomplete_structure(structural_result)


# A NOT_ASSESSED step means a check failed, not that the step is actually
# missing/partial - the reason text must say so distinctly, never lump it
# in with a real gap (same "never conflate" principle NOT_ASSESSED exists
# for in the first place).
def test_skipped_due_to_incomplete_structure_distinguishes_unconfirmed_from_gaps():
    structural_result = StructuralValidationResult(
        status=StructuralValidationStatus.PARTIAL,
        steps=[
            StepCoverageResult(sl_no=1, step="Diagnose", coverage=StepCoverage.MISSING, example="ex"),
            StepCoverageResult(sl_no=2, step="Apply treatment", coverage=StepCoverage.NOT_ASSESSED, example="ex2"),
        ],
    )

    result = operations.skipped_due_to_incomplete_structure(structural_result)

    assert "missing or partial step(s): Diagnose" in result.reason
    assert "could not be checked due to a failed dependency: Apply treatment" in result.reason


def test_polish_draft_suggests_on_clean_grammar_fix(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "The treatment is effective when farmers apply it correctly.")
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    result = operations.polish_draft("The treatment are effective when farmers apply it correctly.")

    assert result.status == LanguagePolishingStatus.SUGGESTED
    assert result.suggested_text == "The treatment is effective when farmers apply it correctly."
    assert result.guardrail.status.value == "passed"


def test_polish_draft_rejects_on_guardrail_failure(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "Apply 5 ml of the specified product per litre of water.")
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    result = operations.polish_draft("Apply 2 ml of the specified product per litre of water.")

    assert result.status == LanguagePolishingStatus.REJECTED
    assert result.suggested_text is None
    assert result.guardrail.status.value == "failed"
    assert "2 ml" not in (result.reason or "") or "dosage" not in (result.reason or "").lower()  # reason is generic but present
    assert result.reason


def test_polish_draft_unavailable_when_only_a_dependency_failed(monkeypatch):
    # Grammar-only rewrite, every deterministic check passes, but the
    # chemical-detector dependency itself failed - nothing was actually
    # found wrong, only unverifiable, so this must be "unavailable", not
    # "rejected" (Writing Assistant Build Plan, Revision 14, ISS-01/03).
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "The treatment is effective when farmers apply it correctly.")

    def _raise(text):
        raise chemical_matcher.ChemicalDetectorUnavailableError("simulated outage")

    monkeypatch.setattr(chemical_matcher, "detect_chemicals", _raise)
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    result = operations.polish_draft("The treatment are effective when farmers apply it correctly.")

    assert result.status == LanguagePolishingStatus.UNAVAILABLE
    assert result.suggested_text is None
    assert result.guardrail.status.value == "failed"
    assert result.guardrail.confirmed_change is False
    assert result.reason


def test_polish_draft_unavailable_when_llm_cannot_generate(monkeypatch):
    def _raise(draft):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "generate_polish", _raise)

    result = operations.polish_draft("The treatment are effective when farmers apply it correctly.")

    assert result.status == LanguagePolishingStatus.UNAVAILABLE
    assert result.suggested_text is None
    assert result.guardrail is None
    assert result.reason


# Revision 17 (ISS-04/11): the same exact draft submitted twice must
# return the exact same result, even if the underlying model would have
# judged it differently on a second real call.
def test_polish_draft_cached_is_deterministic_on_repeated_identical_input(monkeypatch):
    rewrites = iter(["The treatment is effective.", "The treatment works well."])
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: next(rewrites))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    first = operations.polish_draft_cached("The treatment are effective.")
    second = operations.polish_draft_cached("The treatment are effective.")

    assert first is second
    assert first.suggested_text == "The treatment is effective."


# Revision 18: a transient "unavailable" must never be cached - a real
# re-test report hit genuine upstream timeouts after the first caching
# pass shipped, which would otherwise have stuck that bad answer to the
# draft permanently until the next restart.
def test_polish_draft_cached_does_not_cache_unavailable(monkeypatch):
    calls = {"count": 0}

    def _generate_polish(draft):
        calls["count"] += 1
        if calls["count"] == 1:
            raise LLMUnavailableError("simulated transient timeout")
        return "The treatment is effective."

    monkeypatch.setattr(llm_client, "generate_polish", _generate_polish)
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    first = operations.polish_draft_cached("Some draft text.")
    second = operations.polish_draft_cached("Some draft text.")

    assert first.status == LanguagePolishingStatus.UNAVAILABLE
    assert second.status == LanguagePolishingStatus.SUGGESTED
    assert calls["count"] == 2  # the failed first attempt was retried, not cached
