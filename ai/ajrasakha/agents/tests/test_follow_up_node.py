"""Tests for the follow-up node."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from ajrasakha.agents.follow_up_node import (
    FOLLOW_UP_SYSTEM_PROMPT,
    _previous_ai_answer,
    _latest_human_text,
    _type_instruction,
    follow_up_node,
)
from ajrasakha.agents.state import AjraSakhaState


# -------- Helpers --------

class TestHelpers:
    def test_previous_ai_answer_finds_last_farmer_facing_ai(self):
        msgs = [
            HumanMessage(content="Q1"),
            AIMessage(content="A1"),
            HumanMessage(content="Q2"),
            AIMessage(content="A2"),
        ]
        assert _previous_ai_answer(msgs) == "A2"

    def test_previous_ai_answer_skips_tool_call_ais(self):
        msgs = [
            HumanMessage(content="Q1"),
            AIMessage(content=""),
            HumanMessage(content="Q2"),
            AIMessage(content="A2"),
        ]
        msgs[1].tool_calls = [{"id": "1", "name": "weather", "args": {}}]
        assert _previous_ai_answer(msgs) == "A2"

    def test_previous_ai_answer_empty_when_no_ai(self):
        msgs = [HumanMessage(content="Q1")]
        assert _previous_ai_answer(msgs) == ""

    def test_latest_human_text_returns_farmer_text(self):
        msgs = [
            AIMessage(content="A1"),
            HumanMessage(content="latest question"),
        ]
        assert _latest_human_text(msgs) == "latest question"

    def test_latest_human_text_empty(self):
        assert _latest_human_text([]) == ""

    def test_type_instruction_known_types(self):
        assert "Translate" in _type_instruction("language_change")
        assert "Reformat" in _type_instruction("format_change")
        assert "Expand" in _type_instruction("detail_request")
        assert "simpler words" in _type_instruction("simplify")
        assert "tone" in _type_instruction("tone_change")
        assert "Rephrase" in _type_instruction("rephrase")

    def test_type_instruction_unknown_falls_back(self):
        instr = _type_instruction("unknown_type")
        assert "Apply" in instr


# -------- follow_up_node: missing input --------

@pytest.mark.asyncio
async def test_follow_up_node_returns_placeholder_when_no_previous_answer():
    state: AjraSakhaState = {
        "messages": [HumanMessage(content="translate to Hindi")],
        "location": None,
        "plan": {
            "is_follow_up": True,
            "follow_up_type": "language_change",
            "main_question": "Some question",
            "vocal_language": "Hindi",
            "script_language": "Devanagari",
        },
    }
    out = await follow_up_node(state, {})
    assert "messages" in out
    assert len(out["messages"]) == 1
    msg = out["messages"][0]
    assert isinstance(msg, AIMessage)
    assert "previous answer" in msg.content.lower() or "could not find" in msg.content.lower()
    assert out["plan"]["translate_path"] is None
    assert out["plan"]["gdb_has_data"] is False


@pytest.mark.asyncio
async def test_follow_up_node_returns_placeholder_when_no_follow_up_text():
    """Edge case: previous answer exists but no follow-up text (shouldn't happen, but safe)."""
    state: AjraSakhaState = {
        "messages": [AIMessage(content="Previous answer")],
        "location": None,
        "plan": {
            "is_follow_up": True,
            "follow_up_type": "language_change",
            "main_question": "Some question",
            "vocal_language": "Hindi",
            "script_language": "Devanagari",
        },
    }
    out = await follow_up_node(state, {})
    assert "messages" in out
    msg = out["messages"][0]
    assert "previous answer" in msg.content.lower()


# -------- follow_up_node: LLM call --------

@pytest.mark.asyncio
async def test_follow_up_node_returns_llm_answer(monkeypatch):
    """When inputs are present, the node calls the LLM and returns its answer."""
    from ajrasakha.agents import follow_up_node as fu_module

    async def fake_ainvoke(self, messages, **kwargs):
        class _Resp:
            content = "Translated answer: keep NPK at recommended dose."
        return _Resp()

    monkeypatch.setattr(fu_module.ChatAnthropic, "ainvoke", fake_ainvoke)

    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="how to control aphids on cotton in Punjab?"),
            AIMessage(content="Use imidacloprid 17.8% SL at 100 ml/acre."),
            HumanMessage(content="translate to Hindi"),
        ],
        "location": None,
        "plan": {
            "is_follow_up": True,
            "follow_up_type": "language_change",
            "main_question": "How to control aphids on cotton in Punjab?",
            "vocal_language": "Hindi",
            "script_language": "Devanagari",
        },
    }
    out = await follow_up_node(state, {})
    msg = out["messages"][0]
    assert "Translated answer" in msg.content
    assert out["plan"]["gdb_has_data"] is False
    assert out["plan"]["translate_path"] is None


# -------- follow_up_node: LLM failure fallback --------

@pytest.mark.asyncio
async def test_follow_up_node_falls_back_to_previous_answer_on_timeout(monkeypatch):
    """On LLM failure, return the previous answer so the farmer still gets something."""
    from anthropic import APITimeoutError
    from ajrasakha.agents import follow_up_node as fu_module

    async def fake_ainvoke(self, messages, **kwargs):
        raise APITimeoutError("simulated timeout")

    monkeypatch.setattr(fu_module.ChatAnthropic, "ainvoke", fake_ainvoke)

    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="how to control aphids on cotton?"),
            AIMessage(content="Use imidacloprid at 100 ml/acre."),
            HumanMessage(content="translate to Hindi"),
        ],
        "location": None,
        "plan": {
            "is_follow_up": True,
            "follow_up_type": "language_change",
            "main_question": "How to control aphids?",
            "vocal_language": "Hindi",
            "script_language": "Devanagari",
        },
    }
    out = await follow_up_node(state, {})
    msg = out["messages"][0]
    # Fallback returns the previous answer verbatim.
    assert "imidacloprid" in msg.content


# -------- follow_up_node: empty LLM output --------

@pytest.mark.asyncio
async def test_follow_up_node_falls_back_when_llm_returns_empty(monkeypatch):
    from ajrasakha.agents import follow_up_node as fu_module

    async def fake_ainvoke(self, messages, **kwargs):
        class _Resp:
            content = "   "
        return _Resp()

    monkeypatch.setattr(fu_module.ChatAnthropic, "ainvoke", fake_ainvoke)

    state: AjraSakhaState = {
        "messages": [
            HumanMessage(content="how to control aphids on cotton?"),
            AIMessage(content="Use imidacloprid at 100 ml/acre."),
            HumanMessage(content="translate to Hindi"),
        ],
        "location": None,
        "plan": {
            "is_follow_up": True,
            "follow_up_type": "language_change",
            "main_question": "How to control aphids?",
            "vocal_language": "Hindi",
            "script_language": "Devanagari",
        },
    }
    out = await follow_up_node(state, {})
    msg = out["messages"][0]
    assert "imidacloprid" in msg.content


# -------- prompt content sanity --------

def test_follow_up_system_prompt_forbids_tool_calls_and_inventing():
    """The follow-up LLM must be told NOT to call tools and NOT to invent facts."""
    # Whitespace-tolerant check: collapse all whitespace including newlines.
    import re
    compact = re.sub(r"\s+", " ", FOLLOW_UP_SYSTEM_PROMPT.lower())
    # Must forbid calling tools (substring may have line breaks in source).
    assert "do not call tools" in compact
    # Must forbid inventing new facts.
    assert "do not invent" in compact or "must not invent" in compact
    # Must instruct to use only the previous answer content.
    assert "previous answer" in compact
    # Must forbid adding disclaimers/source citations (system appends them).
    assert "do not add disclaimers" in compact
