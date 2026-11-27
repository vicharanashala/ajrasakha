"""Tests for final-answer and retrieval-context extraction from a values stream.

Uses a hand-written fake `values` payload so the tests run without the bot.
The fake mirrors the graph state shape produced by the `values` stream mode:
a `messages` list of LangChain-serialised message dicts.
"""

import json

from ajrasakha.evaluation.executors import (
    extract_final_answer,
    extract_retrieval_context,
)

FINAL_ANSWER = (
    "Sow paddy in June after pre-monsoon showers.\n\n"
    "\U0001f4da Source: Agri Expert (approved materials)"
)

GDB_TOOL_CONTENT = json.dumps(
    {
        "answers": [
            {
                "answer": "Transplant 25-30 day old seedlings.",
                "sources": ["Punjab Package of Practices"],
            }
        ]
    },
    ensure_ascii=False,
)

WEATHER_BLOCK_CONTENT = [{"type": "text", "text": "Light rain expected tomorrow."}]


def _values_payload(messages: list[dict], *, wrapped: bool = False) -> str:
    state = {"messages": messages, "plan": {}, "location": None}
    return json.dumps({"values": state} if wrapped else state, ensure_ascii=False)


def _turn_messages() -> list[dict]:
    """One current turn plus an older turn that must be ignored."""
    return [
        # --- previous turn: must not leak into retrieval_context ---
        {"type": "human", "content": "What is the weather today?"},
        {"type": "tool", "name": "new_weather", "content": "old weather data"},
        {"type": "ai", "content": "Old answer about weather."},
        # --- current turn ---
        {"type": "human", "content": "How to grow paddy in punjab"},
        {
            "type": "ai",
            "content": "",
            "tool_calls": [{"name": "gdb", "args": {}, "id": "call_1"}],
        },
        {"type": "tool", "name": "gdb", "content": GDB_TOOL_CONTENT},
        {
            "type": "tool",
            "name": "new_weather",
            "content": WEATHER_BLOCK_CONTENT,
        },
        {
            "type": "tool",
            "name": "upload_question_to_reviewer_system",
            "content": "reviewer ok",
        },
        {
            "type": "tool",
            "name": "location_information_tool",
            "content": "Ropar, Punjab",
        },
        {"type": "ai", "content": FINAL_ANSWER},
    ]


# --- extract_final_answer -------------------------------------------------


def test_extract_final_answer_returns_last_farmer_facing_ai_message():
    assert extract_final_answer(_values_payload(_turn_messages())) == FINAL_ANSWER


def test_extract_final_answer_ignores_ai_message_with_tool_calls():
    messages = [
        {"type": "human", "content": "How to grow paddy in punjab"},
        {"type": "ai", "content": "calling gdb", "tool_calls": [{"name": "gdb"}]},
        {"type": "tool", "name": "gdb", "content": "{}"},
        {"type": "ai", "content": "Real answer."},
    ]
    assert extract_final_answer(_values_payload(messages)) == "Real answer."


def test_extract_final_answer_handles_block_content():
    messages = [
        {"type": "human", "content": "Hi"},
        {
            "type": "ai",
            "content": [{"type": "text", "text": "First line."}, "Second line."],
        },
    ]
    assert extract_final_answer(_values_payload(messages)) == "First line.\nSecond line."


def test_extract_final_answer_handles_values_wrapper():
    payload = _values_payload(_turn_messages()[:-1] + [{"type": "ai", "content": "Wrapped."}], wrapped=True)
    assert extract_final_answer(payload) == "Wrapped."


def test_extract_final_answer_accepts_empty_tool_calls_list():
    messages = [
        {"type": "human", "content": "How to grow paddy in punjab"},
        {"type": "ai", "content": "", "tool_calls": [{"name": "gdb"}]},
        {"type": "tool", "name": "gdb", "content": "{}"},
        {"type": "ai", "content": "Answer with empty tool_calls.", "tool_calls": []},
    ]
    assert extract_final_answer(_values_payload(messages)) == "Answer with empty tool_calls."


def test_extract_final_answer_returns_empty_on_invalid_json():
    assert extract_final_answer("not json at all") == ""


def test_extract_final_answer_returns_empty_when_no_ai_message():
    messages = [{"type": "human", "content": "Hi"}]
    assert extract_final_answer(_values_payload(messages)) == ""


# --- extract_retrieval_context -------------------------------------------


def test_extract_retrieval_context_includes_source_tools():
    contexts = extract_retrieval_context(_values_payload(_turn_messages()))

    assert len(contexts) == 2
    assert contexts[0].startswith("[gdb] ")
    assert "Transplant 25-30 day old seedlings." in contexts[0]
    assert contexts[1] == "[new_weather] Light rain expected tomorrow."


def test_extract_retrieval_context_excludes_reviewer_and_location_tools():
    contexts = extract_retrieval_context(_values_payload(_turn_messages()))

    joined = "\n".join(contexts)
    assert "upload_question_to_reviewer_system" not in joined
    assert "reviewer ok" not in joined
    assert "location_information_tool" not in joined
    assert "Ropar, Punjab" not in joined


def test_extract_retrieval_context_ignores_previous_turn_tools():
    contexts = extract_retrieval_context(_values_payload(_turn_messages()))

    assert "old weather data" not in "\n".join(contexts)


def test_extract_retrieval_context_returns_empty_on_invalid_json():
    assert extract_retrieval_context("not json at all") == []


def test_extract_retrieval_context_returns_empty_without_tools():
    messages = [
        {"type": "human", "content": "Hello"},
        {"type": "ai", "content": "Hello farmer!"},
    ]
    assert extract_retrieval_context(_values_payload(messages)) == []
