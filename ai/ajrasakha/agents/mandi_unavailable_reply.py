"""Deterministic terminal reply when mandi data is unavailable."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from ajrasakha.agents.answer_footers import build_mandi_unavailable_content
from ajrasakha.agents.plan_executor import mandi_unavailable_context
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan


async def mandi_unavailable_reply_node(state: AjraSakhaState) -> dict:
    """Return the exact localized mandi fallback without invoking an LLM."""
    context = mandi_unavailable_context(state)
    if context is None:
        raise ValueError("mandi_unavailable_reply_node requires an unavailable mandi result")

    script, vocal = language_pair_from_plan(state.get("plan"))
    content = build_mandi_unavailable_content(
        script,
        vocal,
        reason=context.reason,
        crop_name=context.crop_name,
        mandi_name=context.mandi_name,
    )
    trace_event(
        "mandi_unavailable_reply",
        script_language=script,
        vocal_language=vocal,
        reason=context.reason,
        crop=context.crop_name,
        mandi=context.mandi_name,
    )
    end_conversation_turn(content, outcome="mandi_unavailable")
    return {
        "messages": [AIMessage(content=content)],
        "location": state.get("location"),
    }
