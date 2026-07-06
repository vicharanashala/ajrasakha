"""Deterministic terminal reply for non-agriculture queries."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from ajrasakha.agents.answer_footers import build_non_agriculture_content
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan


async def non_agriculture_reply_node(state: AjraSakhaState) -> dict:
    """Return the catalogue reply and testing notice without invoking an LLM."""
    script, vocal = language_pair_from_plan(state.get("plan"))
    content = build_non_agriculture_content(script, vocal)

    trace_event(
        "non_agriculture_reply",
        script_language=script,
        vocal_language=vocal,
    )
    end_conversation_turn(content, outcome="non_agriculture")
    return {
        "messages": [AIMessage(content=content)],
        "location": state.get("location"),
    }
