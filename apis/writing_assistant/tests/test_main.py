from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from assistant import chemical_matcher, config, llm_client, reference_data, structural_validator
from assistant.models import (
    MatchedReference,
    SelectionClassification,
    SourceType,
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"
client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _reset_dataset_cache(monkeypatch):
    """The dataset cache in reference_data.py is a module-level global by
    design (loaded once per process) - reset it between tests so one test's
    config doesn't leak into the next."""
    monkeypatch.setattr(reference_data, "_cache_populated", False)
    monkeypatch.setattr(reference_data, "_cached_dataset", None)
    yield


def test_health_degraded_when_reference_data_unavailable(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", None)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["referenceDataLoaded"] is False


def test_health_ok_when_reference_data_loaded(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", str(FIXTURES_DIR))
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["referenceDataLoaded"] is True
    assert body["groupsLoaded"] == 7
    assert body["releaseId"] is None  # local source has no release concept


def test_polish_draft_endpoint_offers_a_suggestion_when_structure_is_complete(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", str(FIXTURES_DIR))

    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "The treatment is effective when farmers apply it correctly.")
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))
    # Team requirement: a polish suggestion is only offered once structural
    # validation finds every step covered - mock that result directly
    # rather than coaxing the real coverage heuristic to agree, since this
    # test is about the main.py wiring, not that heuristic.
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft: StructuralValidationResult(
            status=StructuralValidationStatus.COMPLETE,
            matched_reference=MatchedReference(source_type=SourceType.DOMAIN, domain="Soil Health (Fixture)"),
            steps=[StepCoverageResult(sl_no=1, step="Diagnose", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={"question": "My fixture soil looks poor what should I do?", "draft": "The treatment are effective when farmers apply it correctly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert "requestId" in body
    assert body["languagePolishing"]["status"] == "suggested"
    assert body["structuralValidation"]["status"] == "complete"
    assert body["warnings"] == []


def test_polish_draft_endpoint_skips_the_suggestion_when_a_step_is_missing(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", str(FIXTURES_DIR))

    # generate_polish must never even be called - the rewrite is skipped,
    # not computed and discarded, once structure is incomplete.
    def _fail_if_called(draft):
        raise AssertionError("generate_polish should not be called when structure is incomplete")

    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called)
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft: StructuralValidationResult(
            status=StructuralValidationStatus.INCOMPLETE,
            matched_reference=MatchedReference(source_type=SourceType.DOMAIN, domain="Soil Health (Fixture)"),
            steps=[
                StepCoverageResult(sl_no=1, step="Diagnose", coverage=StepCoverage.COVERED, example="ex"),
                StepCoverageResult(sl_no=2, step="Apply treatment", coverage=StepCoverage.MISSING, example="ex2"),
            ],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={"question": "My fixture soil looks poor what should I do?", "draft": "The treatment are effective when farmers apply it correctly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["languagePolishing"]["status"] == "skipped"
    assert body["languagePolishing"]["suggestedText"] is None
    assert "Apply treatment" in body["languagePolishing"]["reason"]
    assert body["structuralValidation"]["status"] == "incomplete"


def test_polish_draft_endpoint_reports_unavailable_reference_data(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", None)

    def _fail_if_called(draft):
        raise AssertionError("generate_polish should not be called when structure is not complete")

    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called)

    response = client.post("/polish-draft", json={"question": "q", "draft": "d"})

    assert response.status_code == 200
    body = response.json()
    assert body["structuralValidation"]["status"] == "reference_data_unavailable"
    assert body["languagePolishing"]["status"] == "skipped"
    assert any("not loaded" in w for w in body["warnings"])
