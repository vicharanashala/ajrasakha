"""llm_client's tailnet-routing helper - mirrors
backend/src/bootstrap/tailnetProxy.ts's isTailnetHost so both services
agree on what needs the local Tailscale SOCKS proxy (scripts/start.sh)."""

import httpx
import pytest

from assistant import config, llm_client
from assistant.models import LLMUnavailableError


def test_tailnet_cgnat_range_detected():
    assert llm_client._is_tailnet_host("100.100.108.41")
    assert llm_client._is_tailnet_host("100.64.0.1")
    assert llm_client._is_tailnet_host("100.127.255.254")


def test_tailnet_magicdns_name_detected():
    assert llm_client._is_tailnet_host("some-host.ts.net")


def test_non_tailnet_hosts_not_detected():
    assert not llm_client._is_tailnet_host("api.minimax.io")
    assert not llm_client._is_tailnet_host("100.63.0.1")  # just below the CGNAT range
    assert not llm_client._is_tailnet_host("100.128.0.1")  # just above it
    assert not llm_client._is_tailnet_host("8.8.8.8")


def test_chat_completion_routes_tailnet_host_through_socks_proxy(monkeypatch):
    monkeypatch.setattr(config, "MINIMAX_BASE_URL", "http://100.100.108.41:8001/v1")
    monkeypatch.setattr(config, "MINIMAX_CHAT_PATH", "/chat/completions")
    seen = {}

    def _fake_post(url, json, headers, timeout, proxy):
        seen["proxy"] = proxy
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {"content": "ok"}}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fake_post)
    llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert seen["proxy"] == llm_client._TAILNET_SOCKS_PROXY


def test_chat_completion_does_not_proxy_a_public_host(monkeypatch):
    monkeypatch.setattr(config, "MINIMAX_BASE_URL", "https://api.minimax.io/v1")
    monkeypatch.setattr(config, "MINIMAX_CHAT_PATH", "/text/chatcompletion_v2")
    seen = {}

    def _fake_post(url, json, headers, timeout, proxy):
        seen["proxy"] = proxy
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {"content": "ok"}}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fake_post)
    llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert seen["proxy"] is None


# A real timeout like this (reported by the testing team) left zero trace
# in the server logs - llm_client had no logging at all. This confirms a
# failure is now actually diagnosable: which call, how long it ran, and
# how much input it was given, not just "MiniMax call failed" with
# nothing else to go on.
def test_chat_completion_logs_call_name_elapsed_and_input_size_on_failure(monkeypatch, caplog):
    def _raise(*a, **kw):
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr("httpx.post", _raise)
    with caplog.at_level("ERROR", logger="writing_assistant.llm_client"):
        with pytest.raises(LLMUnavailableError):
            llm_client._chat_completion(
                [{"role": "system", "content": "sys"}, {"role": "user", "content": "a" * 500}],
                call_name="generate_polish",
            )
    assert len(caplog.records) == 1
    message = caplog.records[0].getMessage()
    assert "generate_polish" in message
    assert "input 503" in message  # "sys" (3 chars) + "a"*500 = 503
    assert "The read operation timed out" in message
