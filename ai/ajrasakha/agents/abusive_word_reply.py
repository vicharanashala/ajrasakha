"""Terminal reply for queries containing inappropriate/abusive language."""

from __future__ import annotations

from langchain_core.messages import AIMessage

from ajrasakha.agents.answer_footers import build_non_agriculture_content
from ajrasakha.agents.state import AjraSakhaState
from ajrasakha.agents.thread_logging import end_conversation_turn
from ajrasakha.agents.thread_trace import trace_event
from ajrasakha.agents.translation_catalog import language_pair_from_plan, get_abusive_word_disclaimer


async def abusive_word_reply_node(state: AjraSakhaState) -> dict:
    """Return the localized abusive word disclaimer and end conversation."""
    script, vocal = language_pair_from_plan(state.get("plan"))
    content = get_abusive_word_disclaimer(script, vocal)

    trace_event(
        "abusive_word_reply",
        script_language=script,
        vocal_language=vocal,
    )
    end_conversation_turn(content, outcome="abusive_content")
    return {
        "messages": [AIMessage(content=content)],
        "location": state.get("location"),
    }