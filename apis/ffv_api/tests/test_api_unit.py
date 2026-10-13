"""Unit tests for POST /generate-ffv - no network, no API cost.

generate_ffvs is stubbed, but the stubs call client.messages.create and swallow
exceptions exactly like the real script, so the client instrumentation in
main.py (temperature stripping, error recording) is exercised for real.
"""
import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

import main
from main import generate_ffvs

VALID_DOMAIN = "Irrigation and Water Management"
ANGLES = {"Irrigation Scheduling": "d1", "Water Saving": "d2"}
BODY = {"question": "How often to irrigate wheat?", "answer": "4-6 irrigations at key stages."}

_req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def _status_error(cls, code):
    return cls("boom", response=httpx.Response(code, request=_req), body=None)


class FakeMessages:
    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.behaviour, Exception):
            raise self.behaviour
        return "ok"


class FakeClient:
    def __init__(self, behaviour=None):
        self.messages = FakeMessages(behaviour)


@pytest.fixture
def api(monkeypatch):
    """Returns (TestClient, state). Stubs mimic generate_ffvs incl. swallowing API errors."""
    state = {"client": FakeClient(), "classify_calls": 0, "ffv": lambda angle: {"question": f"q-{angle}", "answer": f"a-{angle}"}}

    monkeypatch.setattr(generate_ffvs, "build_anthropic_client", lambda: state["client"])
    monkeypatch.setattr(generate_ffvs, "DOMAIN_ANGLES", {VALID_DOMAIN: ANGLES, "Organic Farming": {"Composting": "d"}})

    # like the real script: classify/select let API errors propagate,
    # per-angle generation swallows them and returns None
    def classify(client, q, a):
        state["classify_calls"] += 1
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        return VALID_DOMAIN

    def select(client, domain, q, a):
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        return list(generate_ffvs.DOMAIN_ANGLES[domain])

    def gen(client, q, a, angle, desc):
        try:
            client.messages.create(model="m", max_tokens=1, temperature=0.7, messages=[])
        except Exception:
            return None
        return state["ffv"](angle)

    monkeypatch.setattr(generate_ffvs, "classify_domain", classify)
    monkeypatch.setattr(generate_ffvs, "select_angles", select)
    monkeypatch.setattr(generate_ffvs, "generate_ffv_for_angle", gen)
    return TestClient(main.app), state


# ---------------- request validation ----------------

@pytest.mark.parametrize("field", ["question", "answer"])
def test_blank_field_returns_400(api, field):
    client, _ = api
    r = client.post("/generate-ffv", json={**BODY, field: "   "})
    assert r.status_code == 400
    assert field in r.json()["detail"]


@pytest.mark.parametrize("field", ["question", "answer"])
def test_missing_field_returns_422(api, field):
    client, _ = api
    body = {k: v for k, v in BODY.items() if k != field}
    assert client.post("/generate-ffv", json=body).status_code == 422


def test_unknown_domain_returns_400_with_valid_list(api):
    client, state = api
    r = client.post("/generate-ffv", json={**BODY, "domain": "Weed Management"})
    assert r.status_code == 400
    assert VALID_DOMAIN in r.json()["detail"]
    assert state["classify_calls"] == 0


def test_domain_is_case_sensitive(api):
    client, _ = api
    assert client.post("/generate-ffv", json={**BODY, "domain": VALID_DOMAIN.lower()}).status_code == 400


# ---------------- domain handling ----------------

def test_supplied_domain_skips_classification(api):
    client, state = api
    r = client.post("/generate-ffv", json={**BODY, "domain": f"  {VALID_DOMAIN}  "})
    assert r.status_code == 200
    assert r.json()["domain"] == VALID_DOMAIN
    assert state["classify_calls"] == 0


@pytest.mark.parametrize("domain", [None, "", "   "])
def test_missing_or_blank_domain_is_classified(api, domain):
    client, state = api
    body = BODY if domain is None else {**BODY, "domain": domain}
    r = client.post("/generate-ffv", json=body)
    assert r.status_code == 200
    assert r.json()["domain"] == VALID_DOMAIN
    assert state["classify_calls"] == 1


def test_success_response_shape(api):
    client, _ = api
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200
    versions = r.json()["versions"]
    assert [v["angle"] for v in versions] == list(ANGLES)
    assert all(set(v) == {"angle", "question", "answer"} for v in versions)


# ---------------- temperature workaround ----------------

def test_temperature_is_stripped_from_api_calls(api):
    client, state = api
    assert client.post("/generate-ffv", json=BODY).status_code == 200
    assert state["client"].messages.calls
    assert all("temperature" not in c for c in state["client"].messages.calls)


# ---------------- error handling ----------------

@pytest.mark.parametrize(
    "exc, expected",
    [
        (_status_error(anthropic.RateLimitError, 429), 429),
        (_status_error(anthropic.AuthenticationError, 401), 502),
        (_status_error(anthropic.InternalServerError, 500), 502),
        (anthropic.APITimeoutError(request=_req), 504),
    ],
)
def test_api_error_without_domain_maps_status(api, exc, expected):
    client, state = api
    state["client"] = FakeClient(exc)
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == expected


def test_api_error_during_generation_only_maps_status(api):
    """Classification works, but every per-angle call fails (script swallows -> None)."""
    client, state = api
    calls = {"n": 0}
    real = state["client"].messages.create

    def flaky(**kwargs):
        calls["n"] += 1
        if calls["n"] > 2:  # 1 = classify, 2 = select, then generation fails
            raise _status_error(anthropic.RateLimitError, 429)
        return real(**kwargs)

    state["client"].messages.create = flaky
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 429


def test_api_error_with_supplied_domain_still_fails(api):
    client, state = api
    state["client"] = FakeClient(_status_error(anthropic.RateLimitError, 429))
    r = client.post("/generate-ffv", json={**BODY, "domain": VALID_DOMAIN})
    assert r.status_code == 429


def test_all_angles_failing_without_api_error_returns_502(api):
    client, state = api
    state["ffv"] = lambda angle: None
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 502


def test_partial_failure_returns_200_with_remaining_versions(api):
    client, state = api
    state["ffv"] = lambda angle: None if angle == "Water Saving" else {"question": "q", "answer": "a"}
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200
    assert [v["angle"] for v in r.json()["versions"]] == ["Irrigation Scheduling"]


def test_missing_api_key_returns_500(api, monkeypatch):
    client, _ = api

    def boom():
        raise ValueError("ANTHROPIC_API_KEY not set")

    monkeypatch.setattr(generate_ffvs, "build_anthropic_client", boom)
    assert client.post("/generate-ffv", json=BODY).status_code == 500


def test_health(api):
    client, _ = api
    assert client.get("/health").json() == {"status": "ok"}
