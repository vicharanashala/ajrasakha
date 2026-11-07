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
    # Explicit, not assumed - a local .env with MINIMAX_USE_TAILNET_PROXY=false
    # (a dev machine already tailnet-joined, see the opt-out test below)
    # would otherwise make this test depend on whoever's running it.
    monkeypatch.setattr(config, "MINIMAX_USE_TAILNET_PROXY", True)
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


# A host already tailnet-joined at the OS level (e.g. a dev machine with
# Tailscale installed) has a real route to 100.x without the container's
# userspace-networking SOCKS proxy - live-confirmed that proxy assumption
# breaks an otherwise-working direct connection there ("connection
# refused", nothing listens on the proxy port). MINIMAX_USE_TAILNET_PROXY
# exists for exactly this, mirroring backend/src/config/ai.ts's
# USE_TAILNET_PROXY.
def test_chat_completion_skips_proxy_when_disabled_even_for_a_tailnet_host(monkeypatch):
    monkeypatch.setattr(config, "MINIMAX_BASE_URL", "http://100.100.108.41:8001/v1")
    monkeypatch.setattr(config, "MINIMAX_CHAT_PATH", "/chat/completions")
    monkeypatch.setattr(config, "MINIMAX_USE_TAILNET_PROXY", False)
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


# The self-hosted reasoning model occasionally stalls on a prompt and
# fails once before a plain retry succeeds - live-confirmed this exact
# pattern (classify_and_select and classify_step_coverage both failed
# with "timed out" on real requests, no sign of a real connectivity
# problem). One retry on a genuine network-level failure should recover
# the result instead of surfacing it as needs_clarification.
def test_chat_completion_retries_once_and_returns_the_successful_result(monkeypatch):
    calls = {"count": 0}

    def _fail_then_succeed(*a, **kw):
        calls["count"] += 1
        if calls["count"] == 1:
            raise httpx.ReadTimeout("The read operation timed out")
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {"content": "recovered"}}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fail_then_succeed)
    result = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert result == "recovered"
    assert calls["count"] == 2


def test_chat_completion_gives_up_after_the_retry_also_fails(monkeypatch):
    calls = {"count": 0}

    def _always_fail(*a, **kw):
        calls["count"] += 1
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr("httpx.post", _always_fail)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 2  # tried twice, not endlessly


# A malformed response (not a network failure) is never retried - the
# identical request would just produce the identical malformed response.
def test_chat_completion_does_not_retry_a_malformed_response(monkeypatch):
    calls = {"count": 0}

    def _malformed(*a, **kw):
        calls["count"] += 1
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": []}  # no [0] to index - raises IndexError
        return _Resp()

    monkeypatch.setattr("httpx.post", _malformed)
    with pytest.raises(LLMUnavailableError):
        llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert calls["count"] == 1  # not retried


# The self-hosted model sometimes wraps its answer in a markdown code
# fence even when asked for plain JSON - live-confirmed: a real
# classify_and_select response broke json.loads with "Expecting value:
# line 3 column 1 (char 2)", the exact signature of content starting
# '\n\n```json\n{...}'. M3 (public API) never produced this.
def test_strip_markdown_fence_removes_a_json_fence():
    content = '\n\n```json\n{"domain": "Pest Management", "question_type": "Broad"}\n```\n'
    assert llm_client._strip_markdown_fence(content) == '{"domain": "Pest Management", "question_type": "Broad"}'


def test_strip_markdown_fence_removes_a_bare_fence():
    content = "```\nplain text answer\n```"
    assert llm_client._strip_markdown_fence(content) == "plain text answer"


def test_strip_markdown_fence_leaves_unfenced_content_unchanged():
    content = '{"domain": "Pest Management"}'
    assert llm_client._strip_markdown_fence(content) == content


def test_strip_markdown_fence_leaves_a_partial_fence_unchanged():
    # Only a real backtick-containing answer, not this service's own
    # confirmed failure shape - don't risk mangling it.
    content = 'The answer mentions a ```code``` style convention.'
    assert llm_client._strip_markdown_fence(content) == content


def test_chat_completion_strips_a_json_fence_so_the_caller_can_parse_it(monkeypatch):
    def _fenced_response(*a, **kw):
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {
                    "content": '\n\n```json\n{"domain": "Pest Management", "question_type": "Broad"}\n```\n'
                }}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fenced_response)
    content = llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert content == '{"domain": "Pest Management", "question_type": "Broad"}'
    import json
    json.loads(content)  # must not raise - this is the real bug being fixed


def test_chat_completion_defaults_to_the_shared_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout, proxy):
        seen["timeout"] = timeout
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {"content": "ok"}}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fake_post)
    llm_client._chat_completion([{"role": "user", "content": "hi"}])
    assert seen["timeout"] == config.MINIMAX_TIMEOUT_SECONDS


# classify_and_select compares one question against every known domain,
# Direct Topic and Crop Variant candidate at once - live-confirmed this
# heavier multi-candidate reasoning task can fail BOTH the initial attempt
# and the retry at the shared 20s budget, consistently, for the same
# input. It gets its own, longer budget rather than raising the shared one
# that the far more frequent, lighter calls (classify_step_coverage is
# called 3x per step) are tuned against.
def test_classify_and_select_uses_its_own_longer_timeout_budget(monkeypatch):
    seen = {}

    def _fake_post(url, json, headers, timeout, proxy):
        seen["timeout"] = timeout
        class _Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"choices": [{"message": {"content": '{"domain": null, "question_type": null}'}}]}
        return _Resp()

    monkeypatch.setattr("httpx.post", _fake_post)
    llm_client.classify_and_select("a question", [], [], [])
    assert seen["timeout"] == config.MINIMAX_SELECTION_TIMEOUT_SECONDS
    assert seen["timeout"] != config.MINIMAX_TIMEOUT_SECONDS
