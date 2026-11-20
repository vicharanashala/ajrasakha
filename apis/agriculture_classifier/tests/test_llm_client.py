import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classifier import config, llm_client


def test_detect_language_skips_llm_for_single_script(monkeypatch):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("_chat_completion should not be called for an unambiguous script")

    monkeypatch.setattr(llm_client, "_chat_completion", _fail_if_called)

    assert llm_client.detect_language("வேளாண்மை பற்றிய கேள்வி") == "Tamil"


def test_detect_language_calls_narrowed_llm_for_shared_script(monkeypatch):
    monkeypatch.setattr(llm_client, "_chat_completion", lambda messages, **kw: '{"language": "Hindi"}')
    assert llm_client.detect_language("कृषि संबंधित प्रश्न") == "Hindi"


def test_detect_language_falls_back_to_english_when_llm_answers_outside_candidates(monkeypatch):
    # "Tamil" is a real known language, just not a Devanagari candidate -
    # proves the fallback is keyed on "not in the narrowed set", not on
    # whether the string happens to be a recognized language at all.
    monkeypatch.setattr(llm_client, "_chat_completion", lambda messages, **kw: '{"language": "Tamil"}')
    assert llm_client.detect_language("कृषि संबंधित प्रश्न") == "English"


# --- Tailscale-routing helper, mirroring apis/writing_assistant/tests/test_llm_client.py
# so both services agree on what needs the local SOCKS proxy (self-hosted
# MiniMax-M2.7 at 100.100.108.41 is only reachable through it).

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


def test_chat_completion_routes_tailnet_host_through_socks_proxy_when_proxy_is_live(monkeypatch):
    monkeypatch.setattr(config, "MINIMAX_BASE_URL", "http://100.100.108.41:8001/v1")
    monkeypatch.setattr(config, "MINIMAX_CHAT_PATH", "/chat/completions")
    monkeypatch.setattr(llm_client, "_is_socks_proxy_active", lambda: True)
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


def test_chat_completion_connects_direct_when_tailnet_host_but_no_local_proxy(monkeypatch):
    # The actual bug this guards against: a host already joined to the
    # tailnet directly (no userspace-Tailscale SOCKS hop running) must not
    # force a SOCKS connection that nothing is listening for.
    monkeypatch.setattr(config, "MINIMAX_BASE_URL", "http://100.100.108.41:8001/v1")
    monkeypatch.setattr(config, "MINIMAX_CHAT_PATH", "/chat/completions")
    monkeypatch.setattr(llm_client, "_is_socks_proxy_active", lambda: False)
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
    monkeypatch.setattr(llm_client, "_is_socks_proxy_active", lambda: True)
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
