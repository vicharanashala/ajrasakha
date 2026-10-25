"""Tests: translate_answer_node attaches provenance via additional_kwargs only —
never changes the farmer-visible message text, and omits the key entirely
when there's nothing honest to report (backward compatible with old clients)."""

from __future__ import annotations

import asyncio
import json

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ajrasakha.agents.state import TRANSLATE_PATH_EMPTY_GDB
from ajrasakha.agents.translate_answer import translate_answer_node


def _gdb_exact() -> dict:
    return {
        "is_exact": True,
        "chosen_question_id": "q-1",
        "exact_match": {
            "question": "How to grow barley?",
            "answer": "Grow barley with proper irrigation.",
            "question_id": "q-1",
            "details": {"source_name": "PAU", "source_link": "https://example.edu"},
        },
    }


def test_gdb_exact_answer_gets_verified_provenance_text_unchanged():
    synthesis_body = "Growing barley in Punjab requires careful planning."
    state = {
        "messages": [
            HumanMessage(content="How to grow barley?"),
            AIMessage(content="", tool_calls=[{"id": "c1", "name": "gdb", "args": {}}]),
            ToolMessage(content=json.dumps(_gdb_exact()), tool_call_id="c1", name="gdb"),
            AIMessage(content=synthesis_body),
        ],
        "plan": {"translate_path": None, "vocal_language": "English", "script_language": "English"},
    }
    result = asyncio.run(translate_answer_node(state, {}))
    msg = result["messages"][0]

    # Requirement: existing answer text/content is unchanged by this feature.
    assert synthesis_body in msg.content

    provenance = msg.additional_kwargs.get("provenance")
    assert provenance is not None
    assert provenance["source"] == "golden_dataset"
    assert provenance["verificationStatus"] == "verified"
    assert provenance["sourceId"] == "q-1"


def test_empty_gdb_expert_queue_gets_pending_review_provenance():
    state = {
        "messages": [HumanMessage(content="Unknown crop question?"), AIMessage(content="")],
        "plan": {
            "translate_path": TRANSLATE_PATH_EMPTY_GDB,
            "vocal_language": "English",
            "script_language": "English",
        },
    }
    result = asyncio.run(translate_answer_node(state, {}))
    msg = result["messages"][0]
    provenance = msg.additional_kwargs.get("provenance")
    assert provenance == {
        "source": None,
        "verificationStatus": "pending_review",
        "sourceId": None,
        "sourceTitle": None,
    }


def test_specialist_tool_only_answer_omits_provenance_key_entirely():
    """No GDB tool call at all this turn (pure specialist-tool synthesis path).

    additional_kwargs must be empty — not {"provenance": None} — so old and
    new API consumers alike see a plain, unchanged message shape.
    """
    body = "Tomorrow's forecast: light rain, 24-28C."
    state = {
        "messages": [HumanMessage(content="Weather tomorrow?"), AIMessage(content=body)],
        "plan": {"translate_path": None, "vocal_language": "English", "script_language": "English"},
    }
    result = asyncio.run(translate_answer_node(state, {}))
    msg = result["messages"][0]
    assert body in msg.content
    assert "provenance" not in msg.additional_kwargs
