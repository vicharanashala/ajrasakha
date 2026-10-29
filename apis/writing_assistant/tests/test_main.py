from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
from assistant import chemical_matcher, config, llm_client, reference_data
from assistant.models import SelectionClassification, StepCoverage

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


def test_polish_draft_endpoint_end_to_end(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", "local")
    monkeypatch.setattr(config, "REFERENCE_DATA_DIR", str(FIXTURES_DIR))

    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: "The treatment is effective when farmers apply it correctly.")
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))
    monkeypatch.setattr(
        llm_client, "classify_and_select",
        lambda **kw: SelectionClassification(domain="Soil Health (Fixture)", question_type=None),
    )
    monkeypatch.setattr(llm_client, "classify_step_coverage", lambda draft, step, example: (StepCoverage.COVERED, 1))

    response = client.post(
        "/polish-draft",
        json={"question": "My fixture soil looks poor what should I do?", "draft": "The treatment are effective when farmers apply it correctly."},
    )

    assert response.status_code == 200
    body = response.json()
    assert "requestId" in body
    assert body["languagePolishing"]["status"] == "suggested"
    assert body["structuralValidation"]["status"] in ("complete", "partial", "incomplete", "needs_clarification")
    assert body["warnings"] == []


def test_polish_draft_endpoint_reports_unavailable_reference_data(monkeypatch):
    monkeypatch.setattr(config, "REFERENCE_DATA_SOURCE", None)
    monkeypatch.setattr(llm_client, "generate_polish", lambda draft: draft)
    monkeypatch.setattr(chemical_matcher, "detect_chemicals", lambda text: {})
    monkeypatch.setattr(llm_client, "check_meaning_preserved", lambda o, r: (False, ""))

    response = client.post("/polish-draft", json={"question": "q", "draft": "d"})

    assert response.status_code == 200
    body = response.json()
    assert body["structuralValidation"]["status"] == "reference_data_unavailable"
    assert any("not loaded" in w for w in body["warnings"])
