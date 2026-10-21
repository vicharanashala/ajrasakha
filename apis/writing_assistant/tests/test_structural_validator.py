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
    SelectionClassification,
    StepCoverage,
    StructuralValidationStatus,
)
from assistant.reference_data import load_from_local_dir, validate_and_build

FIXTURES_DIR = Path(__file__).parent / "fixtures"


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
    coverages = iter([StepCoverage.COVERED, StepCoverage.MISSING])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example: next(coverages))

    result = structural_validator.validate_structure(
        "My fixture soil looks poor what should I do?",
        "The soil looks fine. Farmers should monitor it regularly.",
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
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example: StepCoverage.COVERED)
    result = structural_validator.validate_structure("q", "d", dataset)
    assert result.status == StructuralValidationStatus.COMPLETE


def test_partial_coverage_with_no_missing_step_is_partial(monkeypatch, dataset):
    coverages = iter([StepCoverage.COVERED, StepCoverage.PARTIAL])
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example: next(coverages))
    result = structural_validator.validate_structure("q", "d", dataset)
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

    def _should_not_be_called(draft, step, example):
        raise AssertionError("coverage scoring must not run when selection is unresolved")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _should_not_be_called)

    result = structural_validator.validate_structure("q", "d", dataset)
    assert result.status == StructuralValidationStatus.NEEDS_CLARIFICATION
    assert result.steps is None


def test_coverage_scoring_unavailable_needs_clarification(monkeypatch, dataset):
    def _raise(draft, step, example):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_step_coverage", _raise)
    result = structural_validator.validate_structure("q", "d", dataset)
    assert result.status == StructuralValidationStatus.NEEDS_CLARIFICATION
