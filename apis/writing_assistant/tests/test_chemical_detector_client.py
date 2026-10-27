"""Tests for assistant.chemical_detector_client's retry behavior. No real
network call - httpx.post and time.sleep are monkeypatched throughout."""

import httpx
import pytest

from assistant import chemical_detector_client, config
from assistant.chemical_detector_client import ChemicalDetectorUnavailableError


@pytest.fixture(autouse=True)
def _set_url(monkeypatch):
    monkeypatch.setattr(config, "CHEMICAL_DETECTOR_URL", "https://fake-chemical-detector.example")


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    monkeypatch.setattr(chemical_detector_client.time, "sleep", lambda seconds: None)


class _FakeResponse:
    def __init__(self, status_code: int, json_body: dict):
        self.status_code = status_code
        self._json_body = json_body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json_body


def test_detect_chemicals_succeeds_on_first_try(monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _FakeResponse(200, {"matches": [{"name": "Endrin", "status": "Banned"}]})
    )
    assert chemical_detector_client.detect_chemicals("text") == {"Endrin": "Banned"}


def test_detect_chemicals_retries_once_after_a_transient_failure(monkeypatch):
    responses = iter([
        _FakeResponse(502, {}),
        _FakeResponse(200, {"matches": []}),
    ])

    def fake_post(*args, **kwargs):
        response = next(responses)
        response.raise_for_status()
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    assert chemical_detector_client.detect_chemicals("text") == {}


def test_detect_chemicals_raises_when_both_attempts_fail(monkeypatch):
    def fake_post(*args, **kwargs):
        response = _FakeResponse(502, {})
        response.raise_for_status()
        return response

    monkeypatch.setattr(httpx, "post", fake_post)
    with pytest.raises(ChemicalDetectorUnavailableError):
        chemical_detector_client.detect_chemicals("text")


def test_detect_chemicals_requires_url_configured(monkeypatch):
    monkeypatch.setattr(config, "CHEMICAL_DETECTOR_URL", None)
    with pytest.raises(ChemicalDetectorUnavailableError, match="CHEMICAL_DETECTOR_URL is not set"):
        chemical_detector_client.detect_chemicals("text")
