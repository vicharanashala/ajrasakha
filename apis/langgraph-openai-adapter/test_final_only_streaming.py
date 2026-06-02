import json

import pytest

import langgraph_bridge


class _FakeStreamResponse:
    def __init__(self, lines: list[str], status_code: int = 200):
        self._lines = lines
        self.status_code = status_code

    async def aread(self):
        return b""

    def raise_for_status(self):
        raise RuntimeError("raise_for_status called unexpectedly in test")

    async def aiter_lines(self):
        for line in self._lines:
            yield line

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, json=None, headers=None):
        class _Resp:
            status_code = 201

            text = ""

            def raise_for_status(self):
                return None

        return _Resp()

    async def get(self, url, headers=None):
        class _Resp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self):
                # Pretend thread already has messages.
                return {"values": {"messages": [{"type": "human", "content": "hi"}]}}

        return _Resp()

    def stream(self, method, url, json=None, headers=None):
        # Simulate LangGraph streaming an intermediate English chunk which must NOT be forwarded.
        english_chunk = {
            "type": "ai",
            "content": "ENGLISH_INTERMEDIATE",
        }
        metadata = {"langgraph_node": "synthesize"}
        line = f"data: {json_module.dumps([english_chunk, metadata])}"
        return _FakeStreamResponse([line])


# Avoid shadowing json module inside _FakeAsyncClient.stream
json_module = json


@pytest.mark.asyncio
async def test_stream_is_final_only(monkeypatch):
    # Patch network client and side-effecty helpers.
    monkeypatch.setattr(langgraph_bridge.httpx, "AsyncClient", _FakeAsyncClient)

    async def _fake_fetch_thread_messages(*args, **kwargs):
        # Final thread state contains Punjabi-only content.
        return [
            {"type": "human", "content": "question"},
            {"type": "ai", "content": "PUNJABI_FINAL"},
        ]

    monkeypatch.setattr(langgraph_bridge, "fetch_thread_messages", _fake_fetch_thread_messages)

    out = []
    async for line in langgraph_bridge.stream_openai_from_langgraph(
        {"messages": [{"role": "user", "content": "question"}], "stream": True, "model": "m"},
        request_headers={},
        context_headers={},
    ):
        out.append(line)

    joined = "".join(out)
    assert "ENGLISH_INTERMEDIATE" not in joined
    assert "PUNJABI_FINAL" in joined

