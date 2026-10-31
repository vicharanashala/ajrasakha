"""reference_selector tests: the LLM classification call is monkeypatched
throughout with canned outputs - these tests verify the deterministic
precedence rules applied on top of that classification, not LLM behavior."""

from pathlib import Path

import pytest

from assistant import llm_client, reference_selector
from assistant.models import (
    LLMUnavailableError,
    QuestionType,
    SelectionClassification,
    SourceType,
    StructuralValidationStatus,
)
from assistant.reference_data import load_from_local_dir, validate_and_build

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def dataset():
    raw = load_from_local_dir(str(FIXTURES_DIR))
    return validate_and_build(raw)


def test_generic_domain_match(monkeypatch, dataset):
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(domain="Soil Health (Fixture)", question_type=QuestionType.BROAD),
    )
    outcome = reference_selector.select_reference("some soil question", dataset)
    assert outcome.structure is not None
    assert outcome.structure.source_type == SourceType.DOMAIN
    assert outcome.structure.domain == "Soil Health (Fixture)"
    assert outcome.structure.question_type == QuestionType.BROAD


def test_named_topic_wins_over_generic_domain(monkeypatch, dataset):
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(
            domain="Pest Management (Fixture)", question_type=QuestionType.BROAD, matched_direct_topic=0,
        ),
    )
    outcome = reference_selector.select_reference("how to control fixture leaf borer", dataset)
    assert outcome.structure is not None
    assert outcome.structure.source_type == SourceType.DIRECT_TOPIC


def test_ambiguous_direct_topics_needs_clarification(monkeypatch, dataset):
    # only one real direct_topic exists in the fixture, but the classifier's
    # OWN output can still report ambiguity against itself for this test -
    # the point is exercising the >=2 branch, not real fixture realism.
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(
            domain="Pest Management (Fixture)", question_type=QuestionType.BROAD,
            ambiguous_direct_topics=[0, 0],
        ),
    )
    outcome = reference_selector.select_reference("ambiguous question", dataset)
    assert outcome.structure is None
    assert outcome.status == StructuralValidationStatus.NEEDS_CLARIFICATION
    assert "conflict" in outcome.reason.lower()


def test_single_crop_variant_match_wins(monkeypatch, dataset):
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(
            domain="Pest Management (Fixture)", question_type=QuestionType.BROAD, matched_crop_variants=[0],
        ),
    )
    outcome = reference_selector.select_reference("fixture vegetable pest question", dataset)
    assert outcome.structure is not None
    assert outcome.structure.source_type == SourceType.CROP_VARIANT
    assert outcome.structure.crop == "Fixture Vegetable (continuous-harvest)"


def test_multiple_crop_variant_matches_needs_clarification(monkeypatch, dataset):
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(
            domain="Pest Management (Fixture)", question_type=QuestionType.BROAD, matched_crop_variants=[0, 1],
        ),
    )
    outcome = reference_selector.select_reference("ambiguous crop question", dataset)
    assert outcome.structure is None
    assert outcome.status == StructuralValidationStatus.NEEDS_CLARIFICATION
    assert "crop" in outcome.reason.lower()


def test_no_confident_domain_match_needs_clarification(monkeypatch, dataset):
    monkeypatch.setattr(llm_client, "classify_and_select", lambda **kw: SelectionClassification(domain=None))
    outcome = reference_selector.select_reference("totally unrelated question", dataset)
    assert outcome.structure is None
    assert outcome.status == StructuralValidationStatus.NEEDS_CLARIFICATION


def test_classification_unavailable_needs_clarification(monkeypatch, dataset):
    def _raise(**kw):
        raise LLMUnavailableError("simulated outage")

    monkeypatch.setattr(llm_client, "classify_and_select", _raise)
    outcome = reference_selector.select_reference("some question", dataset)
    assert outcome.structure is None
    assert outcome.status == StructuralValidationStatus.NEEDS_CLARIFICATION


def test_team_question_source_never_selected(monkeypatch, dataset):
    """Team Question.csv structures must never be returned as a live match,
    even if a classification result would otherwise point at one - they
    simply aren't in the candidate pools reference_selector builds."""
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(domain="Soil Health (Fixture)", question_type=QuestionType.BROAD),
    )
    outcome = reference_selector.select_reference("anything", dataset)
    assert outcome.structure is None or outcome.structure.source_type != SourceType.TEAM_QUESTION
