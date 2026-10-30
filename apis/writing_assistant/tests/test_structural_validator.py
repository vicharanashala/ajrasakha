"""structural_validator tests, mapped to the acceptance examples in the
Writing Assistant Build Plan. reference_selector and llm_client calls are
monkeypatched - no real network call, and the reference structure used is
the fabricated fixture (never the real team CSVs)."""

from pathlib import Path

import pytest

from assistant import llm_client, reference_selector, structural_validator
from assistant.models import (
    LLMUnavailableError,
    QuestionType,
    ReferenceStep,
    SelectionClassification,
    StepCoverage,
    StructuralValidationStatus,
)
from assistant.reference_data import load_from_local_dir, validate_and_build

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Shares real words with both fixture steps' own step+example text
# (step 1 "Introduction": "Test the soil before applying anything.";
# step 2 "Correction": "Apply the recommended nutrient correction.") -
# satisfies the ISS-05 textual-evidence check (Revision 15) so these
# tests exercise the logic they claim to, rather than coincidentally
# passing because every step got overridden to "missing".
_REALISTIC_DRAFT = "Test the soil before applying the recommended nutrient correction."


@pytest.fixture
def dataset():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    return validate_and_build(raw)


@pytest.fixture(autouse=True)
def _select_the_soil_health_broad_structure(monkeypatch):
    """Every test below targets the fixture's 2-step Soil Health (Broad)
    structure (Introduction, Correction) unless overridden."""
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(domain="Soil Health (Fixture)", question_type=QuestionType.BROAD),
    )


# Example D - missing structural steps, reported not invented
def test_missing_steps_reported_not_invented(monkeypatch, dataset):
    # Keyed by step name, not call order - score_coverage now votes 3x
    # per step (majority vote, ISS-04/11 mitigation), so each step must
    # answer consistently across all 3 of its own calls, independent of
    # how many other steps' calls happened first.
    coverages = {"Introduction": (StepCoverage.COVERED, 1), "Correction": (StepCoverage.MISSING, None)}
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: coverages[step])

    result = structural_validator.validate_structure(
        "My fixture soil looks poor what should I do?",
        "We ran a soil test and it looks fine. Farmers should monitor it regularly.",
        dataset,
    )

    assert result.status == StructuralValidationStatus.INCOMPLETE
    assert result.matched_reference is not None
    assert result.matched_reference.domain == "Soil Health (Fixture)"
    assert len(result.steps) == 2
    assert result.steps[0].coverage == StepCoverage.COVERED
    assert result.steps[1].coverage == StepCoverage.MISSING
    # the missing step's own reference text is present, nothing generated
    assert result.steps[1].example == "Apply the recommended nutrient correction."


def test_all_steps_covered_is_complete(monkeypatch, dataset):
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: (StepCoverage.COVERED, 1))
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.status == StructuralValidationStatus.COMPLETE


def test_partial_coverage_with_no_missing_step_is_partial(monkeypatch, dataset):
    coverages = {"Introduction": (StepCoverage.COVERED, 1), "Correction": (StepCoverage.PARTIAL, 2)}
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: coverages[step])
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.status == StructuralValidationStatus.PARTIAL


# Example E - reference data unavailable
def test_reference_dataset_none_is_unavailable(dataset):
    result = structural_validator.validate_structure("q", "d", None)
    assert result.status == StructuralValidationStatus.REFERENCE_DATA_UNAVAILABLE
    assert result.matched_reference is None
    assert result.steps is None
    assert result.clarification_reason


def test_selection_ambiguity_short_circuits_before_coverage_scoring(monkeypatch, dataset):
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(domain=None),
    )

    def _should_not_be_called(draft, step, example, all_steps=None, subject=None):
        raise AssertionError("coverage scoring must not run when selection is unresolved")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _should_not_be_called)

    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.status == StructuralValidationStatus.NEEDS_CLARIFICATION
    assert result.steps is None


# ISS-08 (Writing Assistant Build Plan, Revision 14): the reference's
# suggestion text is "what's expected" explanation for a gap - it must
# never appear on an already-covered step, or it reads as an invented
# issue on a correct draft.
def test_covered_step_has_no_suggestion_text(monkeypatch, dataset):
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: (StepCoverage.COVERED, 1))
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.steps[0].suggestion_1 is None
    assert result.steps[0].suggestion_2 is None


def test_partial_step_keeps_its_suggestion_text(monkeypatch, dataset):
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: (StepCoverage.PARTIAL, 1))
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.steps[0].suggestion_1 == "Always test first"
    assert result.steps[0].suggestion_2 == "Avoid guessing the dose"


# ISS-06 (Writing Assistant Build Plan, Revision 14): out-of-order sections
# are flagged, but only for steps whose position was confidently located.
def test_out_of_order_step_is_flagged(monkeypatch, dataset):
    # Step 1 (Introduction) located in section 2, step 2 (Correction)
    # located in section 1 - Correction appears before Introduction.
    coverages = {"Introduction": (StepCoverage.COVERED, 2), "Correction": (StepCoverage.COVERED, 1)}
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: coverages[step])
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert len(result.order_warnings) == 1
    assert "Correction" in result.order_warnings[0]
    assert "Introduction" in result.order_warnings[0]


def test_in_order_steps_have_no_warnings(monkeypatch, dataset):
    coverages = {"Introduction": (StepCoverage.COVERED, 1), "Correction": (StepCoverage.COVERED, 2)}
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: coverages[step])
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.order_warnings == []


def test_missing_step_never_gets_an_order_warning(monkeypatch, dataset):
    # A missing step has no position at all - must never be fabricated.
    coverages = {"Introduction": (StepCoverage.COVERED, 1), "Correction": (StepCoverage.MISSING, None)}
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: coverages[step])
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.order_warnings == []


# ISS-05 (Writing Assistant Build Plan, Revision 15): confirmed live that
# prompt tightening alone wasn't enough when a removed step's topic is
# still name-dropped once, in passing, in an unrelated section - the LLM
# still gave partial credit. A deterministic textual-evidence check now
# overrides that to "missing" when the step's own topic has no real
# presence anywhere in the draft.
def test_llm_overclaim_on_genuinely_absent_step_is_overridden_to_missing(monkeypatch, dataset):
    # The LLM (wrongly) says "partial" even though the draft never
    # actually addresses "Correction" - it only incidentally reuses the
    # word "correction" in an unrelated sentence.
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: (StepCoverage.PARTIAL, 1))
    result = structural_validator.validate_structure(
        "q", "The soil was tested and a minor correction was noted in the report.", dataset
    )
    assert result.steps[1].step == "Correction"
    assert result.steps[1].coverage == StepCoverage.MISSING
    assert result.steps[1].example == "Apply the recommended nutrient correction."


def test_llm_missing_is_never_promoted_by_the_textual_check(monkeypatch, dataset):
    # The override only ever downgrades toward "missing" - it must never
    # promote a step the LLM already scored missing, even if the draft
    # happens to share real words with that step's topic.
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example, all_steps=None, subject=None: (StepCoverage.MISSING, None))
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert all(s.coverage == StepCoverage.MISSING for s in result.steps)


def test_coverage_scoring_unavailable_needs_clarification(monkeypatch, dataset):
    def _raise(draft, step, example, all_steps=None, subject=None):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _raise)
    result = structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)
    assert result.status == StructuralValidationStatus.NEEDS_CLARIFICATION


# Revision 16 (ISS-05, continued): confirmed live that a closing
# summary/conclusion-style step still got credited just because the
# facts it would summarize already existed in other, genuinely-present
# sections. The fix gives the model the full ordered list of every
# step's name as context, so it can tell "this is my own distinct
# topic" apart from "this is just a recap of a different step" - lock
# in the plumbing that passes that list through.
def test_classify_step_coverage_receives_the_full_step_list(monkeypatch, dataset):
    seen_calls = []

    def _record(draft, step, example, all_steps=None, subject=None):
        seen_calls.append(all_steps)
        return (StepCoverage.COVERED, 1)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _record)
    structural_validator.validate_structure("q", _REALISTIC_DRAFT, dataset)

    # Each step is voted on 3x (majority vote, ISS-04/11 mitigation) -
    # 2 steps x 3 votes = 6 calls, every one of them carrying the full
    # step list regardless of which vote it is.
    assert len(seen_calls) == 2 * structural_validator._COVERAGE_VOTES
    assert all(call == ["Introduction", "Correction"] for call in seen_calls)


# Revision 17 (ISS-04/11): the same exact (question, draft) submitted
# twice must return the exact same result, even if the underlying model
# would have judged it differently on a second real call.
def test_validate_structure_cached_is_deterministic_on_repeated_identical_input(monkeypatch, dataset):
    from assistant import reference_data

    monkeypatch.setattr(reference_data, "get_cached_dataset", lambda: dataset)
    # Keyed by step name so every one of a step's 3 votes agrees -
    # score_coverage now majority-votes each step (ISS-04/11 mitigation).
    coverages = {"Introduction": StepCoverage.COVERED, "Correction": StepCoverage.PARTIAL}
    monkeypatch.setattr(
        llm_client, "classify_step_coverage",
        lambda draft, step, example, all_steps=None, subject=None: (coverages[step], 1),
    )

    first = structural_validator.validate_structure_cached("q", _REALISTIC_DRAFT)
    second = structural_validator.validate_structure_cached("q", _REALISTIC_DRAFT)

    assert first is second
    assert first.steps[0].coverage == StepCoverage.COVERED


# Revision 18: needs_clarification from a transient failure must never
# be cached - same reasoning as the language-polishing cache.
def test_validate_structure_cached_does_not_cache_needs_clarification(monkeypatch, dataset):
    from assistant import reference_data

    monkeypatch.setattr(reference_data, "get_cached_dataset", lambda: dataset)
    calls = {"count": 0}

    def _classify_step_coverage(draft, step, example, all_steps=None, subject=None):
        calls["count"] += 1
        if calls["count"] == 1:
            raise LLMUnavailableError("simulated transient timeout")
        return (StepCoverage.COVERED, 1)

    monkeypatch.setattr(llm_client, "classify_step_coverage", _classify_step_coverage)

    first = structural_validator.validate_structure_cached("q2", _REALISTIC_DRAFT)
    second = structural_validator.validate_structure_cached("q2", _REALISTIC_DRAFT)

    assert first.status == StructuralValidationStatus.NEEDS_CLARIFICATION
    assert second.status == StructuralValidationStatus.COMPLETE
    assert calls["count"] > 1  # the failed first attempt was retried, not cached


# ISS-04/11 mitigation: the underlying model is not fully reproducible
# even at temperature=0 - majority-vote the one call most visibly prone
# to flipping (per-step coverage) instead of trusting a single call.
_VOTE_STEP = ReferenceStep(sl_no=1, step="Introduction", example="Test the soil.")


def test_vote_step_coverage_unanimous_passes_through(monkeypatch):
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: (StepCoverage.COVERED, 3))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.COVERED, 3)


def test_vote_step_coverage_majority_wins_over_minority(monkeypatch):
    votes = iter([(StepCoverage.PARTIAL, 2), (StepCoverage.COVERED, 1), (StepCoverage.COVERED, 1)])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: next(votes))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.COVERED, 1)


def test_vote_step_coverage_three_way_split_takes_the_most_cautious(monkeypatch):
    votes = iter([(StepCoverage.COVERED, 1), (StepCoverage.PARTIAL, 2), (StepCoverage.MISSING, None)])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda *a, **kw: next(votes))
    result = structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
    assert result == (StepCoverage.MISSING, None)


def test_vote_step_coverage_single_dependency_failure_propagates(monkeypatch):
    # No retrying-around a real outage here - one failed vote fails the
    # whole step immediately, same as the pre-voting single-call behavior.
    def _raise(*a, **kw):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _raise)
    with pytest.raises(LLMUnavailableError):
        structural_validator._vote_step_coverage("draft", _VOTE_STEP, ["Introduction"], "q")
