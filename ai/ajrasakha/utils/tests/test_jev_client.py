"""Unit tests for the Jev client (no network)."""
import json

import httpx
import pytest

from ajrasakha.utils import jev_client as jc


def _resp(payload, status=200):
    return httpx.Response(status, json=payload, request=httpx.Request("POST", "http://x"))


OK = {"model": "typesafe/jev-1.13-20260917", "answers": {"a": {"type": "choice", "choice": "x",
      "probabilities": {"x": 0.9, "y": 0.1}, "confidence": 0.8}, "b": {"type": "noul", "noul": 0.7}},
      "usage": {"input_tokens": 10, "output_tokens": 5, "cost": 1e-5}, "id": "gen-1"}


def test_default_provider_is_current(monkeypatch):
    assert jc.provider_for("crop_requirement") == "current"


def test_gateway_defaults_to_direct_typesafe(monkeypatch):
    monkeypatch.delenv("JEV_GATEWAY", raising=False)
    monkeypatch.delenv("JEV_BASE_URL", raising=False)
    monkeypatch.delenv("JEV_MODEL", raising=False)
    assert jc.gateway() == "typesafe"
    assert jc.base_url() == "https://api.typesafe.ai/v1/systemone"
    assert jc.model_name() == "jev-latest"


def test_openrouter_gateway_defaults(monkeypatch):
    monkeypatch.setenv("JEV_GATEWAY", "openrouter")
    monkeypatch.delenv("JEV_BASE_URL", raising=False)
    monkeypatch.delenv("JEV_MODEL", raising=False)
    assert jc.base_url() == "https://openrouter.ai/api/alpha/decisions"
    assert jc.model_name() == "typesafe/jev-1.13"
    monkeypatch.setenv("JEV_PROVIDER", "jev")
    assert jc.provider_for("crop_requirement") == "jev"
    monkeypatch.setenv("JEV_PROVIDER_CROP_REQUIREMENT", "current")
    assert jc.provider_for("crop_requirement") == "current"


def test_override_beats_env(monkeypatch):
    monkeypatch.setenv("JEV_PROVIDER", "current")
    with jc.provider_override({"t": "jev", "fallback": "default"}):
        assert jc.provider_for("t") == "jev" and jc.fallback_mode() == "default"
    assert jc.provider_for("t") == "current"


def test_decide_parses_and_traces(monkeypatch, tmp_path):
    trace = tmp_path / "t.jsonl"
    monkeypatch.setenv("JEV_TRACE_PATH", str(trace))
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(OK))
    res = jc.decide("unit", "secret farmer text", {"a": {}})
    assert res.choice("a") == ("x", {"x": 0.9, "y": 0.1}, 0.8)
    assert res.noul("b") == 0.7 and res.cost == 1e-5 and res.input_tokens == 10
    line = json.loads(trace.read_text().splitlines()[0])
    assert line["provider"] == "jev" and line["model_version"].startswith("typesafe/jev-1.13")
    assert "secret farmer text" not in trace.read_text()      # farmer text is not traced by default
    assert "test-key-not-real" not in trace.read_text()        # credentials never traced


def test_trace_text_opt_in(monkeypatch, tmp_path):
    trace = tmp_path / "t.jsonl"
    monkeypatch.setenv("JEV_TRACE_PATH", str(trace))
    monkeypatch.setenv("JEV_TRACE_INCLUDE_TEXT", "1")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(OK))
    jc.decide("unit", "visible", {"a": {}})
    assert "visible" in trace.read_text()


@pytest.mark.parametrize("status,exc", [(401, jc.JevAuthError), (403, jc.JevAuthError), (500, jc.JevHTTPError), (400, jc.JevHTTPError)])
def test_http_errors(monkeypatch, status, exc):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp({"error": "echo of farmer text"}, status))
    with pytest.raises(exc) as ei:
        jc.decide("unit", "s", {})
    assert "farmer" not in str(ei.value)                      # response body is not surfaced


def test_timeout(monkeypatch):
    def boom(*a, **k):
        raise httpx.ReadTimeout("t")
    monkeypatch.setattr(httpx, "post", boom)
    with pytest.raises(jc.JevTimeoutError):
        jc.decide("unit", "s", {})


def test_missing_key(monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    with pytest.raises(jc.JevAuthError):
        jc.decide("unit", "s", {})


def test_openrouter_uses_openrouter_key(monkeypatch):
    monkeypatch.setenv("JEV_GATEWAY", "openrouter")
    monkeypatch.delenv("OPENROUTER_API_KEY")
    with pytest.raises(jc.JevAuthError, match="OPENROUTER_API_KEY"):
        jc.decide("unit", "s", {})


def test_invalid_response(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp({"nope": 1}))
    with pytest.raises(jc.JevInvalidResponse):
        jc.decide("unit", "s", {})


def test_wrong_typed_answer():
    res = jc._parse(OK, 1.0)
    with pytest.raises(jc.JevInvalidResponse):
        res.noul("a")


def test_confidence_threshold(monkeypatch):
    monkeypatch.setenv("JEV_MIN_CONFIDENCE_CROP_REQUIREMENT", "0.9")
    with pytest.raises(jc.JevLowConfidence):
        jc.require_confidence("crop_requirement", 0.8)
    jc.require_confidence("crop_requirement", 0.95)
    jc.require_confidence("other", 0.1)   # default threshold 0


def test_on_failure_modes(monkeypatch):
    with jc.call_recorder() as rec:
        assert jc.on_failure("t", jc.JevTimeoutError("x")) == "current"
        with jc.provider_override({"fallback": "default"}):
            assert jc.on_failure("t", jc.JevLowConfidence("x")) == "default"
    assert [r["fallback_reason"] for r in rec.records] == ["timeout", "low_confidence"]


@pytest.mark.asyncio
async def test_adecide(monkeypatch):
    class C:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return _resp(OK)
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: C())
    res = await jc.adecide("unit", {"k": 1}, {"a": {}})
    assert res.model.startswith("typesafe")
