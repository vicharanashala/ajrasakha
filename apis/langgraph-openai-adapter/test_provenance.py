import json

import pytest

import langgraph_bridge
from test_final_only_streaming import _FakeAsyncClient, _FakeStreamResponse  # noqa: F401 (reuse fixture)


# ---- Unit tests: pure helpers ----


def test_openai_chunk_includes_provenance_when_present():
    chunk = langgraph_bridge._openai_chunk(
        content="Grow barley with proper irrigation.",
        model="m",
        chunk_id="c1",
        provenance={"source": "golden_dataset", "verificationStatus": "verified"},
    )
    assert chunk["provenance"] == {"source": "golden_dataset", "verificationStatus": "verified"}
    # Standard OpenAI shape is untouched.
    assert chunk["choices"][0]["delta"]["content"] == "Grow barley with proper irrigation."


def test_openai_chunk_omits_provenance_key_when_none():
    """Backward compatibility: no provenance -> no key at all (not `"provenance": null`)."""
    chunk = langgraph_bridge._openai_chunk(content="hi", model="m", chunk_id="c1")
    assert "provenance" not in chunk


def test_final_ai_provenance_from_messages_extracts_dict():
    messages = [
        {"type": "human", "content": "question"},
        {
            "type": "ai",
            "content": "PUNJABI_FINAL",
            "additional_kwargs": {"provenance": {"source": "golden_dataset", "verificationStatus": "verified"}},
        },
    ]
    provenance = langgraph_bridge._final_ai_provenance_from_messages(messages)
    assert provenance == {"source": "golden_dataset", "verificationStatus": "verified"}


def test_final_ai_provenance_from_messages_returns_none_when_absent():
    """Old-shape / provenance-less messages must not error — just no metadata."""
    messages = [
        {"type": "human", "content": "question"},
        {"type": "ai", "content": "answer with no provenance"},
    ]
    assert langgraph_bridge._final_ai_provenance_from_messages(messages) is None


def test_final_ai_provenance_from_messages_ignores_malformed_field():
    """A non-dict provenance value (corrupt/old data) must not be forwarded as-is."""
    messages = [
        {"type": "human", "content": "question"},
        {"type": "ai", "content": "answer", "additional_kwargs": {"provenance": "not-a-dict"}},
    ]
    assert langgraph_bridge._final_ai_provenance_from_messages(messages) is None


def test_final_ai_provenance_from_messages_scopes_to_current_turn():
    """A previous turn's provenance must never leak onto a turn that has none."""
    messages = [
        {"type": "human", "content": "q1"},
        {
            "type": "ai",
            "content": "a1",
            "additional_kwargs": {"provenance": {"source": "golden_dataset", "verificationStatus": "verified"}},
        },
        {"type": "human", "content": "q2"},
        {"type": "ai", "content": "a2 (no gdb this turn)"},
    ]
    assert langgraph_bridge._final_ai_provenance_from_messages(messages) is None


# ---- End-to-end: streaming + non-streaming, following the repo's existing fixture pattern ----


@pytest.mark.asyncio
async def test_stream_forwards_provenance_on_final_chunk(monkeypatch):
    monkeypatch.setattr(langgraph_bridge.httpx, "AsyncClient", _FakeAsyncClient)

    async def _fake_fetch_thread_messages(*args, **kwargs):
        return [
            {"type": "human", "content": "How to control blast in paddy?"},
            {
                "type": "ai",
                "content": "Use tricyclazole as per label dosage.",
                "additional_kwargs": {
                    "provenance": {
                        "source": "golden_dataset",
                        "verificationStatus": "verified",
                        "sourceId": "q-1",
                        "sourceTitle": "How to control blast in paddy?",
                    }
                },
            },
        ]

    monkeypatch.setattr(langgraph_bridge, "fetch_thread_messages", _fake_fetch_thread_messages)

    out = []
    async for line in langgraph_bridge.stream_openai_from_langgraph(
        {"messages": [{"role": "user", "content": "q"}], "stream": True, "model": "m"},
        request_headers={},
        context_headers={},
    ):
        out.append(line)

    content_lines = [l for l in out if l.startswith("data: ") and "tricyclazole" in l]
    assert len(content_lines) == 1
    chunk = json.loads(content_lines[0][len("data: "):])
    assert chunk["provenance"]["verificationStatus"] == "verified"
    assert chunk["provenance"]["sourceId"] == "q-1"


@pytest.mark.asyncio
async def test_stream_omits_provenance_key_when_none(monkeypatch):
    """Specialist-tool-only answers (no GDB this turn) must not add a provenance key at all."""
    monkeypatch.setattr(langgraph_bridge.httpx, "AsyncClient", _FakeAsyncClient)

    async def _fake_fetch_thread_messages(*args, **kwargs):
        return [
            {"type": "human", "content": "Weather tomorrow?"},
            {"type": "ai", "content": "Light rain expected, 24-28C."},
        ]

    monkeypatch.setattr(langgraph_bridge, "fetch_thread_messages", _fake_fetch_thread_messages)

    out = []
    async for line in langgraph_bridge.stream_openai_from_langgraph(
        {"messages": [{"role": "user", "content": "q"}], "stream": True, "model": "m"},
        request_headers={},
        context_headers={},
    ):
        out.append(line)

    content_lines = [l for l in out if l.startswith("data: ") and "Light rain" in l]
    assert len(content_lines) == 1
    chunk = json.loads(content_lines[0][len("data: "):])
    assert "provenance" not in chunk


@pytest.mark.asyncio
async def test_complete_openai_from_langgraph_includes_provenance(monkeypatch):
    monkeypatch.setattr(langgraph_bridge.httpx, "AsyncClient", _FakeAsyncClient)

    async def _fake_fetch_thread_messages(*args, **kwargs):
        return [
            {"type": "human", "content": "q"},
            {
                "type": "ai",
                "content": "answer text",
                "additional_kwargs": {
                    "provenance": {"source": "golden_dataset", "verificationStatus": "reviewed"}
                },
            },
        ]

    monkeypatch.setattr(langgraph_bridge, "fetch_thread_messages", _fake_fetch_thread_messages)

    response = await langgraph_bridge.complete_openai_from_langgraph(
        {"messages": [{"role": "user", "content": "q"}], "model": "m"},
        request_headers={},
        context_headers={},
    )
    assert response["choices"][0]["message"]["content"] == "answer text"
    assert response["provenance"] == {"source": "golden_dataset", "verificationStatus": "reviewed"}


@pytest.mark.asyncio
async def test_complete_openai_from_langgraph_omits_provenance_when_absent(monkeypatch):
    """Old-behavior parity: a plain response dict, no stray provenance key."""
    monkeypatch.setattr(langgraph_bridge.httpx, "AsyncClient", _FakeAsyncClient)

    async def _fake_fetch_thread_messages(*args, **kwargs):
        return [
            {"type": "human", "content": "q"},
            {"type": "ai", "content": "answer text"},
        ]

    monkeypatch.setattr(langgraph_bridge, "fetch_thread_messages", _fake_fetch_thread_messages)

    response = await langgraph_bridge.complete_openai_from_langgraph(
        {"messages": [{"role": "user", "content": "q"}], "model": "m"},
        request_headers={},
        context_headers={},
    )
    assert response["choices"][0]["message"]["content"] == "answer text"
    assert "provenance" not in response
