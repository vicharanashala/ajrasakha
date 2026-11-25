from fastapi.testclient import TestClient

import main
from assistant import chemical_matcher, config, guardrails, llm_client, structural_validator
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


# Testing-team requirement: an over-length draft is rejected before any
# LLM call runs, not truncated - config.MAX_POLISH_CHARS is the single
# source of truth pydantic validates against here.
def test_polish_draft_rejects_an_over_length_draft():
    response = client.post(
        "/polish-draft",
        json={"question": "q", "draft": "a" * (config.MAX_POLISH_CHARS + 1)},
    )
    assert response.status_code == 422


def test_polish_draft_accepts_a_draft_at_exactly_the_limit(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("polished", []))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
            status=StructuralValidationStatus.COMPLETE,
            steps=[StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )
    response = client.post(
        "/polish-draft",
        json={"question": "q", "draft": "a" * config.MAX_POLISH_CHARS},
    )
    assert response.status_code == 200


# Same opt-in scheme as answer_shortener: unset WRITING_ASSISTANT_API_KEY
# means every other test in this file (none of which send an X-API-Key
# header) keeps working unauthenticated - confirmed by every other
# /polish-draft test in this file already passing with no header. These
# three cover the case where an operator has actually set the key.
def test_polish_draft_requires_api_key_when_one_is_configured(monkeypatch):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "local-secret")
    response = client.post(
        "/polish-draft",
        json={"question": "q", "draft": "d"},
    )
    assert response.status_code == 401


def test_polish_draft_rejects_the_wrong_api_key(monkeypatch):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "local-secret")
    response = client.post(
        "/polish-draft",
        headers={"X-API-Key": "wrong-secret"},
        json={"question": "q", "draft": "d"},
    )
    assert response.status_code == 401


def test_polish_draft_accepts_the_correct_api_key(monkeypatch):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "local-secret")
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("polished", []))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
            status=StructuralValidationStatus.COMPLETE,
            steps=[StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )
    response = client.post(
        "/polish-draft",
        headers={"X-API-Key": "local-secret"},
        json={"question": "q", "draft": "d"},
    )
    assert response.status_code == 200


def test_health_never_requires_api_key_even_when_one_is_configured(monkeypatch):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "local-secret")
    response = client.get("/health")
    assert response.status_code == 200


# The X-API-Key check is a silent no-op when unset, by design - this is
# the one place that actually surfaces that fact (a deploy log), so a
# misconfigured deployment that never set the key doesn't run
# unauthenticated with nothing anywhere to say so.
def test_startup_warns_when_api_key_is_not_set(monkeypatch, caplog):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "")
    with caplog.at_level("WARNING", logger="writing_assistant"):
        with TestClient(main.app):
            pass
    assert any("UNAUTHENTICATED" in r.getMessage() for r in caplog.records)


def test_startup_does_not_warn_when_api_key_is_set(monkeypatch, caplog):
    monkeypatch.setattr(config, "WRITING_ASSISTANT_API_KEY", "local-secret")
    with caplog.at_level("WARNING", logger="writing_assistant"):
        with TestClient(main.app):
            pass
    assert not any("UNAUTHENTICATED" in r.getMessage() for r in caplog.records)


def test_polish_draft_endpoint_offers_a_suggestion_when_structure_is_complete(monkeypatch):
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("The treatment is effective when farmers apply it correctly.", []))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))
    # Team requirement: a polish suggestion is only offered once structural
    # validation finds every step covered - mock that result directly
    # rather than coaxing the real coverage heuristic to agree, since this
    # test is about the main.py wiring, not that heuristic.
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
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


def test_polish_draft_endpoint_skip_guardrail_returns_suggested_without_guardrail(monkeypatch):
    def _fail_if_called(original, rewrite):
        raise AssertionError("run_guardrail should not be called when skipGuardrail is true")

    monkeypatch.setattr(guardrails, "run_guardrail", _fail_if_called)
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("The treatment is effective when farmers apply it correctly.", []))
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
            status=StructuralValidationStatus.COMPLETE,
            steps=[StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={
            "question": "How to control Brown Plant Hopper in paddy?",
            "draft": "The treatment are effective when farmers apply it correctly.",
            "skipGuardrail": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["languagePolishing"]["status"] == "suggested"
    assert body["languagePolishing"]["guardrail"] is None
    assert "skipped" in body["languagePolishing"]["reason"].lower()


def test_polish_draft_endpoint_skip_polish_returns_skipped_without_generate_polish(monkeypatch):
    def _fail_if_called(draft):
        raise AssertionError("generate_polish should not be called when skipPolish is true")

    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called)
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
            status=StructuralValidationStatus.COMPLETE,
            steps=[StepCoverageResult(sl_no=1, step="Introduction", coverage=StepCoverage.COVERED, example="ex")],
        ),
    )

    response = client.post(
        "/polish-draft",
        json={
            "question": "How to control Brown Plant Hopper in paddy?",
            "draft": "The treatment are effective when farmers apply it correctly.",
            "skipPolish": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["structuralValidation"]["status"] == "complete"
    assert body["languagePolishing"]["status"] == "skipped"
    assert body["languagePolishing"]["suggestedText"] is None
    assert "caller" in body["languagePolishing"]["reason"].lower()


def test_polish_draft_endpoint_skip_polish_and_skip_structural_validation_together(monkeypatch):
    def _fail_if_called_sv(question, draft, skip_steps=None):
        raise AssertionError("validate_structure_cached should not be called")

    def _fail_if_called_gp(draft):
        raise AssertionError("generate_polish should not be called")

    monkeypatch.setattr(structural_validator, "validate_structure_cached", _fail_if_called_sv)
    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called_gp)

    response = client.post(
        "/polish-draft",
        json={
            "question": "q",
            "draft": "d",
            "skipStructuralValidation": True,
            "skipPolish": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["structuralValidation"]["status"] == "skipped"
    assert body["languagePolishing"]["status"] == "skipped"


def test_polish_draft_endpoint_skip_structural_validation_goes_straight_to_polish(monkeypatch):
    # skipStructuralValidation=true: the checklist must never run at all
    # (0 calls), and structuralValidation must still be present (required
    # field) but honestly report "skipped", not a real verdict.
    def _fail_if_called(question, draft, skip_steps=None):
        raise AssertionError("validate_structure_cached should not be called when skip_structural_validation is true")

    monkeypatch.setattr(structural_validator, "validate_structure_cached", _fail_if_called)
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("The treatment is effective when farmers apply it correctly.", []))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))

    response = client.post(
        "/polish-draft",
        json={
            "question": "How to control Brown Plant Hopper in paddy?",
            "draft": "The treatment are effective when farmers apply it correctly.",
            "skipStructuralValidation": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["structuralValidation"]["status"] == "skipped"
    assert body["structuralValidation"]["steps"] == []
    assert body["languagePolishing"]["status"] == "suggested"


def test_polish_draft_endpoint_skip_steps_are_forwarded_to_structural_validator(monkeypatch):
    seen = {}

    def _record(question, draft, skip_steps=None):
        seen["skip_steps"] = skip_steps
        return StructuralValidationResult(status=StructuralValidationStatus.COMPLETE, steps=[])

    monkeypatch.setattr(structural_validator, "validate_structure_cached", _record)
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: ("polished", []))
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved_batch", lambda pairs: [(False, "")] * len(pairs))

    response = client.post(
        "/polish-draft",
        json={
            "question": "q",
            "draft": "d",
            "skipSteps": ["Biological control", "Safety and PHI"],
        },
    )

    assert response.status_code == 200
    assert seen["skip_steps"] == ["Biological control", "Safety and PHI"]


def test_polish_draft_endpoint_skips_the_suggestion_when_a_step_is_missing(monkeypatch):
    # generate_polish must never even be called - the rewrite is skipped,
    # not computed and discarded, once structure is incomplete.
    def _fail_if_called(draft):
        raise AssertionError("generate_polish should not be called when structure is incomplete")

    monkeypatch.setattr(llm_client, "generate_polish", _fail_if_called)
    monkeypatch.setattr(
        structural_validator, "validate_structure_cached",
        lambda question, draft, skip_steps=None: StructuralValidationResult(
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
