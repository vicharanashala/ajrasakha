"""Unit tests for POST /generate-ffv - no network, no API cost.

generate_ffvs is stubbed, but the stubs call client.messages.create and swallow
exceptions exactly like the real script, so the client instrumentation in
main.py (temperature stripping, error recording) is exercised for real.
"""
import json

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
    domain_angles_map = {
        VALID_DOMAIN: ANGLES,
        "Organic Farming": {"Composting": "d"},
        "Pest and Disease Management": {"Pest Symptoms": "d", "Prevention": "d"},
        "Harvesting and Post-Harvest": {"Storage": "d"},
    }
    monkeypatch.setattr(generate_ffvs, "DOMAIN_ANGLES", domain_angles_map)

    def classify(client, q, a):
        state["classify_calls"] += 1
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        return VALID_DOMAIN

    def classify_multi(client, q, a, max_domains=3):
        state["classify_calls"] += 1
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        return [VALID_DOMAIN]

    def select(client, domain, q, a):
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        return list(generate_ffvs.DOMAIN_ANGLES[domain])[:4]

    def select_across(client, domains, q, a, max_angles=None):
        client.messages.create(model="m", max_tokens=1, temperature=0.0, messages=[])
        items = []
        num_domains = len(domains)
        max_per_domain = 4 if num_domains == 1 else (3 if num_domains == 2 else 2)
        counts = {d: 0 for d in domains}
        for d in domains:
            for angle, desc in generate_ffvs.DOMAIN_ANGLES.get(d, {}).items():
                if counts[d] < max_per_domain:
                    items.append({"domain": d, "angle": angle, "angle_description": desc})
                    counts[d] += 1
        limit = max_angles if max_angles is not None else len(items)
        return items[:limit]

    def gen(client, q, a, angle, desc):
        try:
            client.messages.create(model="m", max_tokens=1, temperature=0.7, messages=[])
        except anthropic.APIError:
            raise
        res = state["ffv"](angle)
        if isinstance(res, Exception):
            raise res
        return res

    monkeypatch.setattr(generate_ffvs, "classify_domain", classify)
    monkeypatch.setattr(generate_ffvs, "classify_domains", classify_multi)
    monkeypatch.setattr(generate_ffvs, "select_angles", select)
    monkeypatch.setattr(generate_ffvs, "select_angles_across_domains", select_across)
    monkeypatch.setattr(generate_ffvs, "generate_ffv_for_angle", gen)
    return TestClient(main.app), state


# ---------------- request validation ----------------

@pytest.mark.parametrize("field", ["question", "answer"])
def test_blank_or_whitespace_field_returns_422(api, field):
    client, _ = api
    r = client.post("/generate-ffv", json={**BODY, field: "   "})
    assert r.status_code == 422


@pytest.mark.parametrize("field", ["question", "answer"])
def test_missing_field_returns_422(api, field):
    client, _ = api
    body = {k: v for k, v in BODY.items() if k != field}
    assert client.post("/generate-ffv", json=body).status_code == 422


def test_question_exceeding_max_length_returns_422(api):
    client, _ = api
    r = client.post("/generate-ffv", json={**BODY, "question": "q" * 5001})
    assert r.status_code == 422


def test_answer_exceeding_max_length_returns_422(api):
    client, _ = api
    r = client.post("/generate-ffv", json={**BODY, "answer": "a" * 50001})
    assert r.status_code == 422


def test_whitespace_is_stripped_by_pydantic(api):
    client, _ = api
    r = client.post("/generate-ffv", json={**BODY, "question": "  What to do?  ", "answer": "  Do this.  "})
    assert r.status_code == 200


def test_unknown_domain_returns_400_with_valid_list(api):
    client, state = api
    r = client.post("/generate-ffv", json={**BODY, "domain": "Weed Management"})
    assert r.status_code == 400
    assert VALID_DOMAIN in r.json()["detail"]
    assert state["classify_calls"] == 0


def test_unknown_domain_in_list_returns_400(api):
    client, state = api
    r = client.post("/generate-ffv", json={**BODY, "domains": [VALID_DOMAIN, "Weed Management"]})
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
    data = r.json()
    assert data["status"] == "completed"
    assert "domain" in data
    assert "domains" in data
    assert data["domains"] == [VALID_DOMAIN]
    assert data["failed_angles"] == []
    versions = data["versions"]
    assert [v["angle"] for v in versions] == list(ANGLES)
    assert all(set(v) == {"domain", "angle", "question", "answer"} for v in versions)


def test_multiple_domains_passed_in_request(api):
    client, state = api
    body = {**BODY, "domains": [VALID_DOMAIN, "Organic Farming"]}
    r = client.post("/generate-ffv", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["domains"] == [VALID_DOMAIN, "Organic Farming"]
    assert state["classify_calls"] == 0
    versions = data["versions"]
    # Check that angles from both domains are included
    assert any(v["domain"] == VALID_DOMAIN for v in versions)
    assert any(v["domain"] == "Organic Farming" for v in versions)


def test_more_than_three_domains_returns_400(api):
    client, state = api
    body = {
        **BODY,
        "domains": [
            VALID_DOMAIN,
            "Organic Farming",
            "Pest and Disease Management",
            "Harvesting and Post-Harvest",
        ],
    }
    r = client.post("/generate-ffv", json=body)
    assert r.status_code == 400
    assert "At most 3 domains" in r.json()["detail"]
    assert state["classify_calls"] == 0


def test_duplicate_domains_in_request_are_deduplicated(api):
    client, state = api
    body = {**BODY, "domains": [VALID_DOMAIN, f"  {VALID_DOMAIN}  "]}
    r = client.post("/generate-ffv", json=body)
    assert r.status_code == 200
    assert r.json()["domains"] == [VALID_DOMAIN]
    assert state["classify_calls"] == 0


def test_select_angles_across_domains_strict_quotas():
    """Test generate_ffvs.select_angles_across_domains directly with mock responses."""
    class FakeLLM:
        def __init__(self, response_text):
            self.response_text = response_text
            self.last_prompt = ""

        def create(self, **kwargs):
            self.last_prompt = kwargs["messages"][0]["content"]
            class Resp:
                content = [type("C", (), {"text": self.response_text})]
            return Resp()

    # 1 Domain with 6 returned -> caps at 4
    llm1 = FakeLLM(json.dumps([
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Time"},
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Method"},
        {"domain": "Crop Production and Management", "angle": "Variety / Hybrid Selection"},
        {"domain": "Crop Production and Management", "angle": "Seed Rate / Spacing"},
        {"domain": "Crop Production and Management", "angle": "Land Preparation"},
        {"domain": "Crop Production and Management", "angle": "Weed Management"},
    ]))
    client1 = type("C", (), {"messages": llm1})()
    res1 = generate_ffvs.select_angles_across_domains(
        client1, ["Crop Production and Management"], "q", "a"
    )
    assert len(res1) == 4
    assert "- Select AT MOST 4 angles" in llm1.last_prompt

    # 2 Domains with 4 from D1 and 2 from D2 -> caps D1 at 3, keeps D2 at 2 (total 5)
    llm2 = FakeLLM(json.dumps([
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Time"},
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Method"},
        {"domain": "Crop Production and Management", "angle": "Variety / Hybrid Selection"},
        {"domain": "Crop Production and Management", "angle": "Seed Rate / Spacing"},
        {"domain": "Irrigation and Water Management", "angle": "Water Requirement"},
        {"domain": "Irrigation and Water Management", "angle": "Irrigation Scheduling"},
    ]))
    client2 = type("C", (), {"messages": llm2})()
    res2 = generate_ffvs.select_angles_across_domains(
        client2, ["Crop Production and Management", "Irrigation and Water Management"], "q", "a"
    )
    crop_angles = [x for x in res2 if x["domain"] == "Crop Production and Management"]
    irrig_angles = [x for x in res2 if x["domain"] == "Irrigation and Water Management"]
    assert len(crop_angles) == 3
    assert len(irrig_angles) == 2
    assert len(res2) == 5
    assert "- Select AT MOST 3 angles per domain" in llm2.last_prompt

    # 3 Domains with 3 from D1, 3 from D2, 3 from D3 -> caps each at 2 (total 6)
    llm3 = FakeLLM(json.dumps([
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Time"},
        {"domain": "Crop Production and Management", "angle": "Sowing / Planting Method"},
        {"domain": "Crop Production and Management", "angle": "Variety / Hybrid Selection"},
        {"domain": "Irrigation and Water Management", "angle": "Water Requirement"},
        {"domain": "Irrigation and Water Management", "angle": "Irrigation Scheduling"},
        {"domain": "Irrigation and Water Management", "angle": "Irrigation Timing"},
        {"domain": "Weather and Climate", "angle": "Weather Forecast"},
        {"domain": "Weather and Climate", "angle": "Climate Pattern"},
        {"domain": "Weather and Climate", "angle": "Seasonal Planning"},
    ]))
    client3 = type("C", (), {"messages": llm3})()
    res3 = generate_ffvs.select_angles_across_domains(
        client3,
        ["Crop Production and Management", "Irrigation and Water Management", "Weather and Climate"],
        "q",
        "a",
    )
    d1 = [x for x in res3 if x["domain"] == "Crop Production and Management"]
    d2 = [x for x in res3 if x["domain"] == "Irrigation and Water Management"]
    d3 = [x for x in res3 if x["domain"] == "Weather and Climate"]
    assert len(d1) == 2
    assert len(d2) == 2
    assert len(d3) == 2
    assert len(res3) == 6
    assert "- Select AT MOST 2 angles per domain" in llm3.last_prompt


# ---------------- temperature preservation ----------------

def test_temperature_is_preserved_in_api_calls(api):
    client, state = api
    assert client.post("/generate-ffv", json=BODY).status_code == 200
    assert state["client"].messages.calls
    # Verify temperature was passed to API calls as defined in generate_ffvs.py
    assert all("temperature" in c.get("extra_body", {}) or "temperature" in c for c in state["client"].messages.calls)


# ---------------- error handling ----------------

@pytest.mark.parametrize(
    "exc, expected",
    [
        (_status_error(anthropic.RateLimitError, 429), 429),
        (_status_error(anthropic.AuthenticationError, 401), 500),
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


def test_all_angles_skipped_returns_200_no_angles(api):
    client, state = api
    state["ffv"] = lambda angle: None
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "no_angles"
    assert data["versions"] == []
    assert data["failed_angles"] == []


def test_partial_failure_returns_200_with_remaining_versions(api):
    client, state = api
    state["ffv"] = lambda angle: None if angle == "Water Saving" else {"question": "q", "answer": "a"}
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "partial"
    assert [v["angle"] for v in data["versions"]] == ["Irrigation Scheduling"]
    assert data["failed_angles"] == []


def test_angle_generation_error_recorded_in_failed_angles(api):
    client, state = api
    state["ffv"] = (
        lambda angle: generate_ffvs.GenerationError("malformed JSON")
        if angle == "Water Saving"
        else {"question": "q", "answer": "a"}
    )
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "partial"
    assert [v["angle"] for v in data["versions"]] == ["Irrigation Scheduling"]
    assert data["failed_angles"] == ["Water Saving"]


def test_generate_ffv_for_angle_direct_unit_tests():
    """Directly test generate_ffv_for_angle for success, skipped (null), and GenerationError."""
    class FakeLLM:
        def __init__(self, text):
            self.text = text

        def create(self, **kwargs):
            return type("Resp", (), {"content": [type("C", (), {"text": self.text})]})()

    # 1. Success
    valid_answer = "This is a detailed farmer friendly answer with enough words to pass the substance validation check."
    client_ok = type("C", (), {"messages": FakeLLM(json.dumps({"question": "Q?", "answer": valid_answer}))})()
    res = generate_ffvs.generate_ffv_for_angle(client_ok, "q", "a", "angle", "desc")
    assert res == {"question": "Q?", "answer": valid_answer}

    # 2. Skipped (null)
    client_null = type("C", (), {"messages": FakeLLM("null")})()
    res_null = generate_ffvs.generate_ffv_for_angle(client_null, "q", "a", "angle", "desc")
    assert res_null is None

    # 3. Malformed JSON -> raises GenerationError
    client_malformed = type("C", (), {"messages": FakeLLM("not json at all")})()
    with pytest.raises(generate_ffvs.GenerationError):
        generate_ffvs.generate_ffv_for_angle(client_malformed, "q", "a", "angle", "desc")

    # 4. Missing fields -> raises GenerationError
    client_missing = type("C", (), {"messages": FakeLLM('{"question": "Q?"}')})()
    with pytest.raises(generate_ffvs.GenerationError):
        generate_ffvs.generate_ffv_for_angle(client_missing, "q", "a", "angle", "desc")

    # 5. Answer too short (<10 words) -> raises GenerationError
    client_short = type("C", (), {"messages": FakeLLM('{"question": "Q?", "answer": "Too short."}')})()
    with pytest.raises(generate_ffvs.GenerationError):
        generate_ffvs.generate_ffv_for_angle(client_short, "q", "a", "angle", "desc")

    # 6. Non-string fields -> raises GenerationError
    client_non_str = type("C", (), {"messages": FakeLLM('{"question": 123, "answer": ["not", "string"]}')})()
    with pytest.raises(generate_ffvs.GenerationError):
        generate_ffvs.generate_ffv_for_angle(client_non_str, "q", "a", "angle", "desc")


def test_missing_api_key_returns_500(api, monkeypatch):
    client, _ = api

    def boom():
        raise ValueError("ANTHROPIC_API_KEY not set")

    monkeypatch.setattr(generate_ffvs, "build_anthropic_client", boom)
    assert client.post("/generate-ffv", json=BODY).status_code == 500


def test_health(api):
    client, _ = api
    assert client.get("/health").json() == {"status": "ok"}


def test_classification_error_returns_502(api, monkeypatch):
    client, _ = api

    def boom(c, q, a, max_domains=3):
        raise generate_ffvs.ClassificationError("Unknown domain returned by model")

    monkeypatch.setattr(generate_ffvs, "classify_domains", boom)
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 502
    assert "Could not classify question/answer into a supported agricultural domain." in r.json()["detail"]


def test_classify_domains_direct_unit_tests():
    """Directly test classify_domains for valid resolution, malformed JSON, and unknown domain."""
    class FakeLLM:
        def __init__(self, text):
            self.text = text

        def create(self, **kwargs):
            return type("Resp", (), {"content": [type("C", (), {"text": self.text})]})()

    # 1. Valid domain matching
    client_ok = type("C", (), {"messages": FakeLLM('{"domains": ["Irrigation and Water Management"]}')})()
    res = generate_ffvs.classify_domains(client_ok, "q", "a")
    assert res == ["Irrigation and Water Management"]

    # 2. Unknown domain -> raises ClassificationError (NO silent fallback to DOMAIN_LIST[0])
    client_unknown = type("C", (), {"messages": FakeLLM('{"domains": ["Astronomy and Stars"]}')})()
    with pytest.raises(generate_ffvs.ClassificationError):
        generate_ffvs.classify_domains(client_unknown, "q", "a")

    # 3. Malformed JSON -> raises ClassificationError
    client_malformed = type("C", (), {"messages": FakeLLM("not valid json at all")})()
    with pytest.raises(generate_ffvs.ClassificationError):
        generate_ffvs.classify_domains(client_malformed, "q", "a")


def test_endpoint_does_not_interact_with_mongodb(api, monkeypatch):
    """Verify that FFV endpoint execution never interacts with MongoDB."""
    def boom(*args, **kwargs):
        raise AssertionError("MongoClient should never be called by the FFV API endpoint!")

    monkeypatch.setattr(generate_ffvs, "MongoClient", boom)
    client, _ = api
    r = client.post("/generate-ffv", json=BODY)
    assert r.status_code == 200


def test_relaxed_json_middleware_handles_unescaped_newlines(api):
    """Verify that raw unescaped newlines in JSON strings (common when pasting in Swagger) are handled."""
    client, _ = api
    # Raw literal newline byte \n inside JSON string literal
    raw_payload = b'{\n  "question": "How to manage tomato pests?",\n  "answer": "Line 1\nLine 2 with literal newline"\n}'
    r = client.post(
        "/generate-ffv",
        content=raw_payload,
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"

