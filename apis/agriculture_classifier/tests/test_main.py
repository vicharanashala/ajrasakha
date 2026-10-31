import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import main
from classifier import disclaimers, llm_client

client = TestClient(main.app)


def _fail_if_called(*args, **kwargs):
    raise AssertionError("detect_language should not be called for an agriculture question")


def test_agriculture_question_returns_na_disclaimer(monkeypatch):
    monkeypatch.setattr(llm_client, "classify_agriculture", lambda question: True)
    monkeypatch.setattr(llm_client, "detect_language", _fail_if_called)

    response = client.post("/classify-question", json={"question": "How often should I irrigate my wheat crop?"})

    assert response.status_code == 200
    assert response.json() == {"is_agriculture": True, "disclaimer": "NA"}


def test_non_agriculture_question_returns_language_disclaimer(monkeypatch):
    monkeypatch.setattr(llm_client, "classify_agriculture", lambda question: False)
    monkeypatch.setattr(llm_client, "detect_language", lambda question: "Hindi")

    response = client.post("/classify-question", json={"question": "क्रिकेट मैच कब है?"})

    assert response.status_code == 200
    body = response.json()
    assert body["is_agriculture"] is False
    assert body["disclaimer"] == disclaimers.get_disclaimer("Hindi")
    assert body["disclaimer"] != "NA"


def test_misspelled_agriculture_question_still_classified_as_agriculture(monkeypatch):
    # The LLM call is mocked here, so this only verifies the endpoint's
    # plumbing for a misspelled question - it does not prove the real model
    # tolerates misspellings (see the plan's flagged limitation on this).
    monkeypatch.setattr(llm_client, "classify_agriculture", lambda question: True)
    monkeypatch.setattr(llm_client, "detect_language", _fail_if_called)

    response = client.post("/classify-question", json={"question": "wheet crop pset problm wat to do"})

    assert response.status_code == 200
    assert response.json() == {"is_agriculture": True, "disclaimer": "NA"}


def test_empty_question_returns_400():
    response = client.post("/classify-question", json={"question": "   "})
    assert response.status_code == 400


def test_llm_unavailable_returns_503(monkeypatch):
    def _raise(question):
        raise llm_client.LLMUnavailableError("boom")

    monkeypatch.setattr(llm_client, "classify_agriculture", _raise)

    response = client.post("/classify-question", json={"question": "any question"})
    assert response.status_code == 503
