from fastapi.testclient import TestClient

import main
from assistant import chemical_matcher, llm_client, structural_validator
from assistant.models import (
    StepCoverage,
    StepCoverageResult,
    StructuralValidationResult,
    StructuralValidationStatus,
)

client = TestClient(main.app)


def test_health_always_ok():
    # No external data dependency to be degraded by anymore - structural
    # validation uses one fixed, built-in checklist (no Golden Database
    # CSVs to load).
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_polish_draft_endpoint_offers_a_suggestion_when_structure_is_complete(monkeypatch):
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
            steps=[StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={"question": "How to control Brown Plant Hopper in paddy?", "draft": "The treatment are effective when farmers apply it correctly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert "requestId" in body
    assert body["languagePolishing"]["status"] == "suggested"
    assert body["structuralValidation"]["status"] == "complete"
    assert body["warnings"] == []


def test_polish_draft_endpoint_skips_the_suggestion_when_a_step_is_missing(monkeypatch):
    # generate_polish must never even be called - the rewrite is skipped,
    # not computed and discarded, once structure is incomplete.
    def _fail_if_called(draft):
        raise AssertionError("generate_polish should not be called when structure is incomplete")

    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called)
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft: StructuralValidationResult(
            status=StructuralValidationStatus.INCOMPLETE,
            steps=[
                StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex"),
                StepCoverageResult(sl_no=2, step="Conclusion", coverage=StepCoverage.MISSING, example="ex2"),
            ],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={"question": "How to control Brown Plant Hopper in paddy?", "draft": "The treatment are effective when farmers apply it correctly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["languagePolishing"]["status"] == "skipped"
    assert body["languagePolishing"]["suggestedText"] is None
    assert "Conclusion" in body["languagePolishing"]["reason"]
    assert body["structuralValidation"]["status"] == "incomplete"
